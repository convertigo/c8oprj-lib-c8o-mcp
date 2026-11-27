// Run: node --test tests/scripts/validate_studio_ui_bounded.cjs
// On the Windows Studios of two customers (24-26/11, TigoAccess b879cbe4, 015fcf50, cac550d0, 174f1807) the SWT
// interface thread was held (engine #1299/#1307) and the MCP waited for it without a limit: mobile-builder-open 61-74 s,
// a move 67 s, a delete 154 s, a search 405 s, all failed by the client after a minute (mcp_timeout). The waits on the
// interface thread are bounded (C8O.util.studioUiExec), a project export runs on a thread of its own waited for a
// bounded time (C8O.util.boundedCall) and the next write waits for it, and search stops on a time budget with a cursor
// that goes on from where it stopped.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

// The interface thread: answering runs what is queued when a call waits; frozen runs nothing until release().
function fakeUi(mode = 'answer') {
  const queue = [];
  const ui = { mode, queue, waits: [], clock: 0, onUi: false };
  ui.release = () => { while (queue.length) queue.shift()(); };
  ui.host = {
    onUiThread: () => ui.onUi,
    asyncExec: work => queue.push(work),
    latch: () => ({ done: false, countDown() { this.done = true; } }),
    gate: () => ({ v: 0, compareAndSet(a, b) { if (this.v === a) { this.v = b; return true; } return false; }, set(v) { this.v = v; }, get() { return this.v; } }),
    await: (latch, ms) => {
      ui.waits.push(ms);
      if (ui.mode === 'answer') ui.release();
      else ui.clock += ms;
      return latch.done;
    },
    now: () => ui.clock
  };
  return ui;
}

function sandbox(extra = {}) {
  const empty = new Proxy(function () {}, { get: (_, key) => key === Symbol.toPrimitive ? () => '' : empty });
  const ctx = Object.assign({ Packages: empty, java: empty }, extra);
  vm.createContext(ctx);
  vm.runInContext(read('js/util.js'), ctx, { filename: 'js/util.js' });
  return ctx;
}

test('a wait on the interface thread is bounded: the work runs, is dropped, or stays queued when asked', () => {
  const ctx = sandbox();
  const U = ctx.C8O.util;
  const ui = fakeUi('answer');
  U._studioUiHost = ui.host;
  assert.deepEqual(plain(U.studioUiExec(() => 7)), { ran: true, value: 7 });
  assert.deepEqual(ui.waits, [10000], 'the default bound is 10 s');
  assert.throws(() => U.studioUiExec(() => { throw new Error('tree refresh failed'); }), /tree refresh failed/, 'an error of the work is the error of the call');

  ui.mode = 'frozen';
  let ran = 0;
  const dropped = U.studioUiExec(() => { ran++; }, { timeoutMs: 5000, label: 'the viewer state', runLate: false });
  assert.equal(dropped.ran, false);
  assert.equal(dropped.timedOut, true);
  assert.equal(dropped.dropped, true);
  assert.equal(dropped.waitedMs, 5000);
  assert.match(dropped.message, /^The Studio interface did not answer in 5 s \(the viewer state\): it is busy or frozen, often by a dialog waiting for an answer or an Engine Log view receiving many lines\. This call did not wait longer\./);
  const queued = U.studioUiExec(() => { ran += 10; }, { timeoutMs: 2000, runLate: true });
  assert.equal(queued.ran, false);
  assert.equal(queued.queued, true);
  ui.release();
  assert.equal(ran, 10, 'once free, the thread runs the work left queued and drops the other');

  ui.onUi = true;
  assert.deepEqual(plain(U.studioUiExec(() => 'here')), { ran: true, value: 'here' }, 'on the interface thread itself the work runs at once');
});

// The Studio parts databaseobject_studio.js reaches: one Project Explorer view, the cached project, its reload.
function studio(ui, options = {}) {
  const calls = [];
  const cachedProject = { hasChanged: options.changed === true };
  const view = {
    reloadDatabaseObject: dbo => calls.push(['reload', dbo.qname]),
    findTreeObjectByUserObject: dbo => ({ dbo }),
    viewer: { expandToLevel: () => calls.push(['expand']), setSelection: () => calls.push(['select']), reveal: () => calls.push(['reveal']) },
    getProjectRootObject: name => ({ name }),
    removeProjectTreeObject: () => calls.push(['remove'])
  };
  const plugin = { getProjectExplorerView: () => view, reloadProject: name => calls.push(['studio reload', name]) };
  const target = { qname: 'Shop.Application', getQName: () => 'Shop.Application' };
  const shared = new Map();
  const Engine = {
    isStudioMode: () => true,
    theApp: {
      databaseObjectsManager: { getDatabaseObjectByQName: () => target },
      getShareServerMap: () => ({ get: key => (shared.has(key) ? shared.get(key) : null), set: (key, value) => shared.set(key, value) })
    }
  };
  const empty = new Proxy(function () {}, { get: (_, key) => key === Symbol.toPrimitive ? () => '' : empty });
  const ctx = sandbox({
    Packages: new Proxy(empty, { get: (_, key) => key === 'com'
      ? { twinsoft: { convertigo: { engine: { Engine }, eclipse: { ConvertigoPlugin: { getDefault: () => plugin } } } } }
      : (key === 'org' ? { eclipse: { jface: { viewers: { StructuredSelection: function () {} } } } } : empty) })
  });
  vm.runInContext(read('js/databaseobject_studio.js'), ctx, { filename: 'js/databaseobject_studio.js' });
  ctx.C8O.util._studioUiHost = ui.host;
  ctx.C8O.dbo.getCachedProject = () => cachedProject;
  ctx.C8O.dbo.getCachedProjectIdentity = () => 42;
  ctx.C8O.dbo.getReloadStudioPlugin = () => ({ getDefault: () => plugin });
  ctx.C8O.dbo.withStudioLock = fn => fn();
  return { dbo: ctx.C8O.dbo, calls, cachedProject, ctx };
}

test('a tree refresh the frozen interface did not take is deferred and runs later; the reveal is dropped', () => {
  const ui = fakeUi('frozen');
  const { dbo, calls } = studio(ui);
  const errors = [];
  const refresh = plain(dbo._refreshStudioTreeByQName('Shop.Application', errors));
  assert.equal(refresh.status, 'deferred');
  assert.equal(refresh.uiBusy, true);
  assert.match(refresh.message, /^The Studio interface did not answer in 10 s \(Project Explorer refresh of Shop\.Application\).* The change is made; the Project Explorer shows it once the interface is free\.$/);
  assert.deepEqual(errors, [], 'the change itself did not fail');
  const reveal = plain(dbo.revealStudioTreeByQName('Shop.Application', []));
  assert.equal(reveal.status, 'deferred');
  assert.match(reveal.message, /The object is not revealed in the Project Explorer; the change itself is made\./);
  assert.deepEqual(ui.waits, [10000, 1500], 'once the thread did not answer, the next wait of the call is short');
  ui.release();
  assert.deepEqual(calls, [['reload', 'Shop.Application']], 'the refresh ran once the thread was free, the reveal did not');
});

test('a Studio project reload the frozen interface did not take keeps the unsaved changes and says why', () => {
  const ui = fakeUi('frozen');
  const { dbo, calls, cachedProject } = studio(ui, { changed: true });
  dbo.waitForProjectReload = () => calls.push(['wait']);
  const errors = [];
  const reload = plain(dbo.reloadProject('Shop', errors));
  assert.equal(reload.reloaded, false);
  assert.match(reload.message, /The Studio interface did not answer in 10 s \(the reload of Shop\).* Shop was not reloaded; its unsaved changes are kept\./);
  assert.equal(cachedProject.hasChanged, true, 'nothing was discarded');
  ui.release();
  assert.deepEqual(calls, [], 'the reload was dropped, not run late');
  ui.mode = 'answer';
  assert.equal(dbo.reloadProject('Shop', []).reloaded, true);
  assert.deepEqual(calls, [['studio reload', 'Shop'], ['wait']]);
});

test('a save that does not end in time answers savePending, and the next write waits for it', () => {
  const ui = fakeUi('answer');
  const { dbo, ctx } = studio(ui);
  vm.runInContext(read('js/databaseobject_persist.js').replace('include("js/mobile_builder_cycle.js");', ''), ctx, { filename: 'js/databaseobject_persist.js' });
  ctx.C8O.project = { checkUpdateProjectVersion: () => ({ checked: true, version: '1.0.0' }) };
  dbo.invalidateProjectRuntime = () => ({ invalidated: false });
  const saving = { alive: true, joins: [], join(ms) { this.joins.push(ms); }, isAlive() { return this.alive; } };
  const exports = [];
  ctx.C8O.util._boundedCallHost = { start: work => { exports.push(work); return saving; }, join: () => false, now: () => 0 };
  const pendingStore = new Map();
  ctx.C8O.dbo.pendingSaveStore = () => ({ put: (k, v) => pendingStore.set(k, v), get: k => pendingStore.get(k) || null });
  ctx.C8O.dbo.markPendingSave = (name, thread) => { pendingStore.set(name, thread); return { project: name, runningMs: 20000 }; };
  ctx.C8O.dbo.awaitPendingSaves = (name, waitMs) => {
    for (const [project, thread] of pendingStore) {
      if (name != null && project !== name) continue;
      thread.join(waitMs);
      if (thread.isAlive()) return { project, runningMs: 25000 };
      pendingStore.delete(project);
    }
    return null;
  };
  const project = { getName: () => 'Shop', getVersion: () => '1.0.0' };
  const errors = [];
  const first = plain(dbo.saveProject(project, errors));
  assert.equal(first.saved, false);
  assert.equal(first.savePending, true);
  assert.match(first.message, /^The save of Shop has not ended after 20 s: it goes on and the files are written when it ends\. The change is made in the Studio; do not make it again\./);
  assert.match(first.message, /call project-save \{"project":"Shop"\} in a moment to check the save\.$/);
  assert.equal(errors[0].pending, true);
  const second = plain(dbo.saveProject(project, []));
  assert.equal(second.savePending, true);
  assert.match(second.message, /^An earlier save of Shop has been running for 25 s and has not ended: this save waits for it and was not made\./);
  assert.equal(exports.length, 1, 'no second export of a project being written');
  saving.alive = false;
  ctx.C8O.util._boundedCallHost = { start: work => { work(); return { isAlive: () => false }; }, join: () => true, now: () => 0 };
  ctx.Packages.com.twinsoft.convertigo.engine.Engine.theApp.databaseObjectsManager.exportProject = () => exports.push('exported');
  assert.equal(dbo.saveProject(project, []).saved, true, 'once it ended, the next save is made');
});

test('withStudioLock waits for a save still running in the rest of its wait, then refuses without changing anything', () => {
  const src = read('js/databaseobject_studio.js');
  assert.match(src, /var saving = null;\n\s+try \{\n\s+saving = C8O\.dbo\.awaitPendingSaves\(null, STUDIO_LOCK_WAIT_MS - \(Number\(java\.lang\.System\.currentTimeMillis\(\)\) - lockAskedAt\)\);/);
  assert.match(src, /if \(saving\) \{\n\s+lock\.unlock\(\);/, 'the lock is given back before the refusal');
  assert.match(src, /has been running for " \+ Math\.round\(saving\.runningMs \/ 1000\) \+\n\s+" s and has not ended: this call waited and changed nothing\./);
});

test('boundedCall answers within its bound and lets the work go on', () => {
  const ctx = sandbox();
  const U = ctx.C8O.util;
  let started = null;
  U._boundedCallHost = { start: work => { started = work; return { name: 't' }; }, join: (thread, ms) => { assert.equal(ms, 20000); return false; }, now: () => 0 };
  const late = U.boundedCall(() => 'saved', 20000, 'save');
  assert.equal(late.done, false);
  assert.equal(late.timedOut, true);
  assert.equal(typeof started, 'function', 'the work goes on on its own thread');
  U._boundedCallHost = { start: work => { work(); return {}; }, join: () => true, now: () => 0 };
  assert.deepEqual(plain(U.boundedCall(() => 'saved', 20000)), { done: true, value: 'saved' });
  assert.throws(() => U.boundedCall(() => { throw new Error('disk full'); }, 20000), /disk full/);
});

test('no Studio interface wait of the MCP is left without a bound', () => {
  for (const file of fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js'))) {
    assert.doesNotMatch(read('js/' + file), /ConvertigoPlugin\.syncExec\(/, file + ' waits for the interface thread without a bound');
  }
  const open = read('js/tools_mobile_builder_open.js');
  assert.match(open, /var OPEN_EDITOR_WAIT_MS = 20000;\n\s+var VIEWER_UI_WAIT_MS = 5000;/);
  assert.match(open, /\}, OPEN_EDITOR_WAIT_MS, stateOnly === true \? "the NGX editor state" : "the NGX editor opening"\);\n\s+if \(editorRun\.ran !== true\) \{\n\s+result\.uiBusy = true;/);
  // the editor work not taken: no build is started beside it and the call does not wait
  assert.match(open, /var studioUiBusy = studioMode && editorResult && editorResult\.uiBusy === true;\n\s+if \(studioUiBusy\) \{\n\s+waitValue = false;\n\s+timeoutSecValue = 0;/);
  assert.match(open, /if \(studioMode && studioUiFrozen !== null\) \{\n\s+break;\n\s+\}/, 'the wait stops when the thread stops answering');
  assert.match(open, /if \(studioUiBusy\) \{\n\s+message = editorResult\.message \+ " " \+ message;/);
  assert.match(read('js/databaseobject_persist.js'), /var exported = C8O\.util\.boundedCall\(function \(\) \{\n\s+Engine\.theApp\.databaseObjectsManager\.exportProject\(project\);\n\s+\}, C8O\.dbo\.SAVE_WAIT_MS/);
});

// The search of tools_databaseobject_search.js over two projects, with a clock that moves by tickMs per read.
function search(args, tickMs, loadMs = 0) {
  const jlist = items => ({ size: () => items.length, get: i => items[i] });
  const dbo = (qname, yaml, children = []) => ({ qname, yaml, getName: () => qname.split('.').pop(), getComment: () => '', getClass: () => ({ getName: () => 'com.twinsoft.convertigo.beans.core.Step' }),
    getDatabaseType: () => 'Step', getDatabaseObjectChildren: () => jlist(children), toXml: () => ({ yaml }), getFullQName: () => qname });
  const projects = {
    A: dbo('A', '', [dbo('A.s1', 'needle one'), dbo('A.s2', 'hay'), dbo('A.s3', 'needle three')]),
    B: dbo('B', '', [dbo('B.s1', 'needle four'), dbo('B.s2', 'needle five')])
  };
  let now = 0;
  const loads = [];
  const ctx = {
    qname: null, filter: 'needle', limit: 200, matchCase: null, useRegExp: null, objectType: '*', _nextCursor: null,
    java: { lang: { System: { currentTimeMillis: () => now } } },
    Packages: {
      java: { util: { regex: { Pattern: {} } } },
      com: { twinsoft: { convertigo: { engine: {
        Engine: { theApp: { databaseObjectsManager: { getAllProjectNamesList: () => jlist(['A', 'B']), getOriginalProjectByName: n => { loads.push(n); now += loadMs; return projects[n]; } } } },
        util: { XMLUtils: { createDom: () => null }, YamlConverter: { toYaml: xml => { now += tickMs; return xml.yaml; } } }
      } } } }
    },
    C8O: {
      util: { toTrimmedString: v => (v == null ? '' : String(v).trim()), toBoolean: (v, d) => (v == null ? d : String(v) === 'true') },
      dbo: { safeFullQName: o => o.getFullQName(), safeQName: o => o.getFullQName() }
    }
  };
  Object.assign(ctx, args);
  vm.createContext(ctx);
  vm.runInContext(read('js/tools_databaseobject_search.js'), ctx, { filename: 'js/tools_databaseobject_search.js' });
  return { qnames: plain(ctx.searchMatches).map(m => m.qname), summary: plain(ctx.searchSummary), loads };
}

test('search stops on its time budget and its cursor goes on from the object it stopped at', () => {
  const whole = search({}, 1);
  const order = whole.qnames.slice();
  assert.deepEqual(whole.qnames.slice().sort(), ['A.s1', 'A.s3', 'B.s1', 'B.s2']);
  assert.equal(whole.summary.timeBudgetReached, false);
  assert.equal(whole.summary.message, '');
  // each object read takes 6 s: the budget of 20 s ends the call after four of them
  const pages = [];
  let cursor = null;
  for (let i = 0; i < 10; i++) {
    const page = search({ _nextCursor: cursor }, 6000);
    pages.push(page);
    if (!page.summary.hasMore) break;
    assert.equal(page.summary.timeBudgetReached, true);
    assert.match(page.summary.nextCursor, /^p\d+\.\d+\.\d+$/);
    assert.match(page.summary.message, /^The search stopped after 2\d s, its time budget, with \d match\(es\) in this answer, \d of 2 projects reached\. Call again with _nextCursor "p\d+\.\d+\.\d+" to go on from there, or give qname \(a project, or a part of it\) to search less\.$/);
    cursor = page.summary.nextCursor;
  }
  assert.ok(pages.length > 1, 'more than one call');
  assert.deepEqual(pages.flatMap(p => p.qnames), order, 'the pages hold every match once, in the order of one whole search');
  // the projects are scanned in the order of the existing search (the last one first), each loaded when reached
  assert.deepEqual(search({}, 1).loads, ['B', 'A']);
  assert.deepEqual(search({}, 10000).loads, ['B'], 'a project the scan does not reach in its budget is not loaded');
  // an older plain cursor still counts matches from the start
  const older = search({ limit: 1 }, 1);
  assert.equal(older.summary.nextCursor, 'p0.2.1', 'the object of the next page is read again');
  assert.deepEqual(search({ limit: 1, _nextCursor: '1' }, 1).qnames, [order[1]]);
  assert.deepEqual(search({ limit: 1, _nextCursor: older.summary.nextCursor }, 1).qnames, [order[1]]);
});

test('a search that resumes skips the finished projects unloaded and reads one object at least, whatever the budget', () => {
  const order = search({}, 1).qnames;
  // loading a project takes 30 s, more than the budget: each call still reads something and the search ends
  const pages = [];
  let cursor = null;
  for (let i = 0; i < 20; i++) {
    const page = search({ _nextCursor: cursor }, 1, 30000);
    pages.push(page);
    if (!page.summary.hasMore) break;
    cursor = page.summary.nextCursor;
  }
  assert.ok(pages.length < 20, 'it ends');
  assert.deepEqual(pages.flatMap(p => p.qnames), order);
  assert.ok(pages.every(p => p.loads.length <= 1), 'a call loads the project it reads, never the ones finished before');
  assert.equal(pages[pages.length - 1].loads[0], 'A');
});
