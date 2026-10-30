const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// An agent deleted three sequences and a transaction in parallel (autoSave false): the Studio tree reloads they asked
// overlapped and failed with a NullPointerException in copyDatabaseObject, the Studio opened modal error dialogs and
// every engine request waited for the UI thread (usage tests 29/10, reproduced 1/1 without the lock, 0/3 with it).
// Reloads, deletes, renames and moves now hold one JVM-wide monitor.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// The parts of the engine and of java.util.concurrent the lock uses. other: the hold of another thread, if any.
class FakeLock {
  constructor() { this.holds = 0; this.other = 0; this.waits = []; }
  tryLock(ms, unit) { this.waits.push([ms, unit]); if (this.other > 0) return false; this.holds++; return true; }
  getHoldCount() { return this.holds; }
  unlock() { if (this.holds < 1) throw new Error('IllegalMonitorStateException'); this.holds--; }
}

function studioHelpers() {
  const monitors = [];
  const shared = new Map();
  const share = { get: key => (shared.has(key) ? shared.get(key) : null), set: (key, value) => { if (value == null) shared.delete(key); else shared.set(key, value); } };
  let now = 1000;
  const ctx = {
    C8O: { util: { toTrimmedString: value => String(value || '').trim() } },
    java: {
      lang: { String: function (text) { this.intern = () => 'interned:' + text; }, System: { currentTimeMillis: () => now } },
      util: { concurrent: { TimeUnit: { MILLISECONDS: 'ms' }, locks: { ReentrantLock: FakeLock } } }
    },
    Packages: {
      com: { twinsoft: { convertigo: { engine: { Engine: { theApp: { getShareServerMap: () => share } } } } } },
      org: { mozilla: { javascript: { Synchronizer: function (fn, lock) { return () => { monitors.push(lock); return fn(); }; } } } }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(read('js/databaseobject_studio.js'), ctx);
  return { api: ctx.C8O.dbo, monitors, share, tick: ms => { now += ms; } };
}

test('one reentrant lock per engine, created once under an interned monitor', () => {
  const { api, monitors, share } = studioHelpers();
  assert.equal(api.withStudioLock(() => 7), 7);
  assert.equal(api.withStudioLock(() => 8), 8);
  const lock = share.get('lib_ConvertigoMCP.studioTree');
  assert.ok(lock instanceof FakeLock);
  assert.deepEqual(monitors, ['interned:lib_ConvertigoMCP.studioTree'], 'created once');
  assert.deepEqual(lock.waits, [[30000, 'ms'], [30000, 'ms']], 'each call waits 30 s at most');
  assert.equal(lock.holds, 0);
});

test('a batch that moves an object and refreshes the tree takes the lock again in the same thread', () => {
  const { api, share } = studioHelpers();
  const seen = [];
  api._refreshStudioTreeByQName = qname => ({ status: 'refreshed', qname });
  const moveObject = () => api.withStudioLock(() => { seen.push('moved, holder ' + JSON.parse(share.get('lib_ConvertigoMCP.studioTree.holder')).what); return { done: true }; }, 'a move');
  const batch = () => api.withStudioLock(() => {
    moveObject();
    seen.push(api.refreshStudioTreeByQName('Shop.Application.NgxApp.pg:Home', []).status);
    return 'applied';
  }, 'a batch of writes under Shop.Application.NgxApp.pg:Home');
  assert.equal(batch(), 'applied');
  assert.deepEqual(seen, ['moved, holder a batch of writes under Shop.Application.NgxApp.pg:Home', 'refreshed']);
  assert.equal(share.get('lib_ConvertigoMCP.studioTree').holds, 0);
  assert.equal(share.get('lib_ConvertigoMCP.studioTree.holder'), null, 'the holder is forgotten with the last release');
});

test('a write that waits more than 30 s changes nothing and names the write that holds the lock', () => {
  const { api, share, tick } = studioHelpers();
  api.withStudioLock(() => 0, 'warm-up');
  const lock = share.get('lib_ConvertigoMCP.studioTree');
  lock.other = 1;
  share.set('lib_ConvertigoMCP.studioTree.holder', JSON.stringify({ what: 'a batch of writes under Shop.Application', since: 1000 }));
  tick(42000);
  let ran = false;
  assert.throws(() => api.withStudioLock(() => { ran = true; }), error => {
    assert.equal(error.code, 'studio_write_in_progress');
    assert.match(error.message, /^Another write has held the projects of this Studio for more than 30 s \(a batch of writes under Shop\.Application, for 42 s\): this call waited and changed nothing\. Send it again in a moment/);
    return true;
  });
  assert.equal(ran, false);
  const errors = [];
  const refresh = api.refreshStudioTreeByQName('Shop.sq:List', errors);
  assert.equal(refresh.status, 'skipped', 'a refresh after a done write does not fail the write');
  assert.match(errors[0].message, /^Another write has held/);
});

test('an error in the locked function releases the lock', () => {
  const { api, share } = studioHelpers();
  assert.throws(() => api.withStudioLock(() => { throw new Error('boom'); }, 'a failing batch'), /boom/);
  assert.equal(share.get('lib_ConvertigoMCP.studioTree').holds, 0);
  assert.equal(share.get('lib_ConvertigoMCP.studioTree.holder'), null);
  assert.equal(api.withStudioLock(() => 'next'), 'next');
});

test('every Studio tree refresh holds the lock', () => {
  const { api } = studioHelpers();
  const seen = [];
  api.withStudioLock = (fn, label) => { seen.push('lock ' + label); const result = fn(); seen.push('unlock'); return result; };
  api._refreshStudioTreeByQName = (qname, errors) => { seen.push('refresh ' + qname); return { status: 'refreshed', errors }; };
  assert.equal(api.refreshStudioTreeByQName('Demo.sq:A', []).status, 'refreshed');
  assert.deepEqual(seen, ['lock a Studio tree refresh of Demo.sq:A', 'refresh Demo.sq:A', 'unlock']);
});

test('delete, rename and move mutate the project under the lock', () => {
  const calls = {
    delete: 'C8O.dbo.removeObject({ qname: deleteQName })',
    rename: 'C8O.dbo.renameObject({ qname: qname, name: name, update: update })',
    move: 'C8O.dbo.moveObject({ qname: qname, target: target, position: position })'
  };
  for (const [tool, call] of Object.entries(calls)) {
    const yaml = read(`_c8oProject/sequences/tools_databaseobject_${tool}.yaml`);
    const at = yaml.indexOf(call);
    assert.ok(at > 0, tool);
    assert.match(yaml.slice(Math.max(0, at - 120), at), /C8O\.dbo\.withStudioLock\(function \(\) \{\s*return $/, tool);
    assert.equal(yaml.split(call).length, 2, tool + ' mutates once');
  }
});

// Two tree-apply calls in parallel under the same NGX directive left a null in its children list (r50, 30/10): every
// batch (tree-apply, batch-call, generators, CRUD kit, marketplace) now mutates the project under the same lock.
test('every batch of writes runs under the lock', () => {
  const source = read('js/databaseobject_batch.js');
  assert.match(source, /C8O\.dbo\.batchApply = function \(args\) \{\n    return C8O\.dbo\.withStudioLock\(function \(\) \{\n      return batchApplyUnlocked\(args\);\n    \}, \"a batch of writes under \" \+ asTrimmed\(\(args \|\| \{\}\)\.target \|\| \"the project\"\)\);\n  \};/);
  assert.equal(source.split('batchApplyUnlocked(').length, 3, 'one definition, one call');
  for (const file of ['js/tools_databaseobject_tree_apply.js', 'js/tools_generators.js', 'js/tools_generators_ngx.js', 'js/tools_crud.js', 'js/marketplace.js']) {
    assert.ok(!read(file).includes('batchApplyUnlocked'), file + ' goes through the locked entry');
  }
});
