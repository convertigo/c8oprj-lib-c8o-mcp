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

function studioHelpers() {
  const locks = [];
  const ctx = {
    C8O: { util: { toTrimmedString: value => String(value || '').trim() } },
    java: { lang: { String: function (text) { this.intern = () => 'interned:' + text; } } },
    Packages: { org: { mozilla: { javascript: { Synchronizer: function (fn, lock) {
      return () => { locks.push(lock); return fn(); };
    } } } } }
  };
  vm.createContext(ctx);
  vm.runInContext(read('js/databaseobject_studio.js'), ctx);
  return { api: ctx.C8O.dbo, locks };
}

test('withStudioLock runs the function under one interned monitor', () => {
  const { api, locks } = studioHelpers();
  assert.equal(api.withStudioLock(() => 7), 7);
  assert.equal(api.withStudioLock(() => 8), 8);
  assert.deepEqual(locks, ['interned:lib_ConvertigoMCP.studioTree', 'interned:lib_ConvertigoMCP.studioTree']);
});

test('every Studio tree refresh holds the lock', () => {
  const { api } = studioHelpers();
  const seen = [];
  api.withStudioLock = fn => { seen.push('lock'); const result = fn(); seen.push('unlock'); return result; };
  api._refreshStudioTreeByQName = (qname, errors) => { seen.push('refresh ' + qname); return { status: 'refreshed', errors }; };
  assert.equal(api.refreshStudioTreeByQName('Demo.sq:A', []).status, 'refreshed');
  assert.deepEqual(seen, ['lock', 'refresh Demo.sq:A', 'unlock']);
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
