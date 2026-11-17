// Run: node --test tests/scripts/validate_project_changes.cjs
// project-changes answers the journal of the writes made through the MCP (js/write_journal.js): what each write tool
// created, changed, renamed, moved or deleted, read from its answer after the call (journalAfterToolCall of
// js/mcp_endpoint_router.js, and batch-call for each of its writes), and the runs of requestable-execute. Agents ended
// runs saying "nothing else was modified" after changing objects nobody asked for, and "seed verified" after the seed's
// last run answered an error: the final summary is built from this list.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

class FakeDeque {
  constructor() { this.items = []; }
  addLast(value) { this.items.push(value); }
  pollFirst() { return this.items.length ? this.items.shift() : null; }
  peekFirst() { return this.items.length ? this.items[0] : null; }
  peekLast() { return this.items.length ? this.items[this.items.length - 1] : null; }
  size() { return this.items.length; }
  toArray() { return this.items.slice(); }
}

class FakeMap {
  constructor() { this.map = new Map(); }
  get(key) { return this.map.has(key) ? this.map.get(key) : null; }
  putIfAbsent(key, value) {
    if (this.map.has(key)) {
      return this.map.get(key);
    }
    this.map.set(key, value);
    return null;
  }
  remove(key) { this.map.delete(key); }
  size() { return this.map.size; }
  keySet() { const keys = [...this.map.keys()]; return { toArray: () => keys }; }
}

const T0 = Date.UTC(2026, 10, 17, 9, 0, 0);

function load(options = {}) {
  const clock = { now: T0 };
  const values = new Map();
  const server = { get: key => (values.has(key) ? values.get(key) : null), set: (key, value) => values.set(key, value) };
  const children = options.children || {};
  const warnings = [];
  const sandbox = { C8O: {} };
  sandbox.include = file => vm.runInContext(read(file), sandbox, { filename: file });
  vm.createContext(sandbox);
  sandbox.include('js/studio_write_confirm.js');
  sandbox.C8O.writeJournal = {
    host: {
      now: () => clock.now,
      digest: value => crypto.createHash('sha256').update(value, 'utf8').digest('hex'),
      newMap: () => new FakeMap(),
      newDeque: () => new FakeDeque(),
      childQName: (parent, name) => (children[parent] || {})[name] || '',
      warn: message => warnings.push(message)
    }
  };
  sandbox.include('js/write_journal.js');
  const api = sandbox.C8O.writeJournal;
  const contextFor = (who = {}) => ({
    server,
    httpServletRequest: {
      getHeader: name => (name === 'X-Convertigo-Conversation-Id' ? (who.conversation || null)
        : name === 'Authorization' ? 'Bearer ' + (who.bearer || 'token-a') : null)
    }
  });
  const conversation = contextFor({ conversation: 'conv-1' });
  // a call answered: what the endpoint does after it (RevealAfterCall)
  const call = (sequence, answer, args, context = conversation, via) => {
    const entry = api.recordCall(context, sequence, answer, args || {}, via ? { via } : {});
    clock.now += 1000;
    return entry ? plain(entry) : null;
  };
  const changes = (params = {}, context = conversation) => plain(api.execute(context, params));
  return { api, clock, server, values, sandbox, warnings, contextFor, conversation, call, changes };
}

const treeArgs = (target, at, name, extra = {}) => ({ target, at, tree: JSON.stringify(Object.assign({ className: 'steps.SimpleStep', name }, extra)) });

test('a compact tree-apply answer: the object created under the touched parent, an existing one updated in place, the target patched', () => {
  const j = load({ children: { 'DemoApp.sq:ListItems': { compute: 'DemoApp.sq:ListItems.st:compute', output: 'DemoApp.sq:ListItems.st:output' } } });
  const created = j.call('tools_databaseobject_tree_apply', {
    status: 'ok', targetQName: 'DemoApp.sq:ListItems', touchedQNames: ['DemoApp.sq:ListItems'],
    operations: [{ index: 0, opId: 'tree_apply_root_create', type: 'create', status: 'applied', appliedCount: 3, appliedByAction: { create: 2, setProperties: 1 } }]
  }, treeArgs('DemoApp.sq:ListItems', 'inside', 'compute'));
  assert.deepEqual(created.objects, [{ q: 'DemoApp.sq:ListItems.st:compute', c: 'created' }]);
  assert.equal(created.tool, 'databaseobject-tree-apply');
  assert.equal(created.status, 'ok');

  const updated = j.call('tools_databaseobject_tree_apply', {
    status: 'ok', touchedQNames: ['DemoApp.sq:ListItems'],
    notes: ['tree_apply_root_create: output already exists under DemoApp.sq:ListItems: updated in place (at:inside does not create output1).'],
    operations: [{ status: 'applied', appliedCount: 2, appliedByAction: { updateExisting: 1, setProperties: 1 } }]
  }, treeArgs('DemoApp.sq:ListItems', 'inside', 'output'));
  assert.deepEqual(updated.objects, [{ q: 'DemoApp.sq:ListItems.st:output', c: 'changed' }]);

  const patched = j.call('tools_databaseobject_tree_apply', {
    status: 'partial', touchedQNames: ['DemoApp.cn:db.tr:listRows'],
    operations: [{ status: 'partial', appliedCount: 1, appliedByAction: { setProperties: 1 } }]
  }, { target: 'DemoApp.cn:db.tr:listRows', tree: '{"properties":{"sqlQuery":"SELECT 1"}}' });
  assert.deepEqual(patched.objects, [{ q: 'DemoApp.cn:db.tr:listRows', c: 'changed' }]);
  assert.equal(patched.status, 'partial');

  // no engine to name the child: the parent is changed, with what was created inside
  const unknown = j.call('tools_databaseobject_tree_apply', {
    status: 'ok', touchedQNames: ['DemoApp.sq:Other'], operations: [{ status: 'applied', appliedByAction: { create: 1 } }]
  }, treeArgs('DemoApp.sq:Other', 'inside', 'extra'));
  assert.deepEqual(unknown.objects, [{ q: 'DemoApp.sq:Other', c: 'changed', d: 'created extra inside' }]);

  // a dry run and a call that applied nothing change nothing
  assert.equal(j.call('tools_databaseobject_tree_apply', { status: 'ok', dryRun: true, touchedQNames: [] }, treeArgs('DemoApp', 'inside', 'x')), null);
  assert.equal(j.call('tools_databaseobject_tree_apply', { status: 'ok', touchedQNames: [], operations: [{ status: 'applied', appliedCount: 0, appliedByAction: {} }] }, { target: 'DemoApp.sq:X' }), null);
});

test('a full tree-apply answer: every applied entry, nothing under what the call created, deleted and moved kept', () => {
  const j = load();
  const entry = j.call('tools_databaseobject_tree_apply', {
    status: 'ok', touchedQNames: ['DemoApp', 'DemoApp.sq:Report', 'DemoApp.sq:Report.st:init'],
    operations: [{
      status: 'applied', applied: [
        { action: 'create', qname: 'DemoApp.sq:Report', parentQName: 'DemoApp' },
        { action: 'setProperties', qname: 'DemoApp.sq:Report', names: ['comment'] },
        { action: 'create', qname: 'DemoApp.sq:Report.st:init', parentQName: 'DemoApp.sq:Report' },
        { action: 'setProperties', qname: 'DemoApp.cn:db.tr:listRows', names: ['sqlQuery'] },
        { action: 'delete', qname: 'DemoApp.sq:Old', parentQName: 'DemoApp' },
        { action: 'move', qname: 'DemoApp.sq:Main.st:b', fromParent: 'DemoApp.sq:Main.st:a', toParent: 'DemoApp.sq:Main' }
      ]
    }]
  }, { target: 'DemoApp', responseDetail: 'full' });
  assert.deepEqual(entry.objects, [
    { q: 'DemoApp.sq:Old', c: 'deleted' },
    { q: 'DemoApp.sq:Main.st:b', c: 'moved', fp: 'DemoApp.sq:Main.st:a' },
    { q: 'DemoApp.sq:Report', c: 'created' },
    { q: 'DemoApp.cn:db.tr:listRows', c: 'changed' }
  ]);
  // replaced on a class mismatch: deleted then created again is a change
  const replaced = j.call('tools_databaseobject_tree_apply', {
    status: 'ok', operations: [{ status: 'applied', applied: [{ action: 'delete', qname: 'DemoApp.sq:Main.st:c' }, { action: 'create', qname: 'DemoApp.sq:Main.st:c' }] }]
  }, { target: 'DemoApp.sq:Main' });
  assert.deepEqual(replaced.objects, [{ q: 'DemoApp.sq:Main.st:c', c: 'changed' }]);
});

test('rename, move and delete: the QName before, the parent before, what is gone', () => {
  const j = load();
  assert.deepEqual(j.call('tools_databaseobject_rename', { qname: 'DemoApp.sq:GetItem', newQName: 'DemoApp.sq:GetItems', renamed: true }, {}).objects,
    [{ q: 'DemoApp.sq:GetItems', c: 'renamed', p: 'DemoApp.sq:GetItem' }]);
  assert.equal(j.call('tools_databaseobject_rename', { qname: 'DemoApp.sq:A', newQName: 'DemoApp.sq:A', renamed: false }, {}), null);
  assert.deepEqual(j.call('tools_databaseobject_move', { qname: 'DemoApp.sq:B.st:s', fromParent: 'DemoApp.sq:A', toParent: 'DemoApp.sq:B', moved: true, done: true }, {}).objects,
    [{ q: 'DemoApp.sq:B.st:s', c: 'moved', fp: 'DemoApp.sq:A' }]);
  assert.equal(j.call('tools_databaseobject_move', { qname: 'DemoApp.sq:B.st:s', done: false }, {}), null);
  assert.deepEqual(j.call('tools_databaseobject_delete', { qname: 'DemoApp.sq:Tmp', parentQName: 'DemoApp', removed: true }, {}).objects,
    [{ q: 'DemoApp.sq:Tmp', c: 'deleted' }]);
  assert.equal(j.call('tools_databaseobject_delete', { qname: 'DemoApp.sq:Tmp', removed: 'false' }, {}), null);

  const answer = j.changes();
  assert.deepEqual(answer.objects.map(line => line.split(';')[0]), [
    'DemoApp.sq:Tmp: deleted',
    'DemoApp.sq:B.st:s: moved from DemoApp.sq:A',
    'DemoApp.sq:GetItems: renamed from DemoApp.sq:GetItem'
  ]);
});

test('the final state follows the object: a change then a rename, a creation then a deletion, a change under a new object', () => {
  const j = load();
  j.call('tools_databaseobject_tree_apply', { status: 'ok', touchedQNames: ['DemoApp.sq:GetItem'], operations: [{ status: 'applied', appliedByAction: { setProperties: 1 } }] }, { target: 'DemoApp.sq:GetItem' });
  j.call('tools_databaseobject_rename', { qname: 'DemoApp.sq:GetItem', newQName: 'DemoApp.sq:GetItems', renamed: true }, {});
  j.call('tools_business_sequence_create', { status: 'ok', qname: 'DemoApp.sq:SaveItem', created: ['DemoApp.cn:db.tr:insertItem', 'DemoApp.sq:SaveItem'] }, { project: 'DemoApp' });
  j.call('tools_databaseobject_tree_apply', { status: 'ok', touchedQNames: ['DemoApp.sq:SaveItem.st:check'], operations: [{ status: 'applied', appliedByAction: { setProperties: 1 } }] }, { target: 'DemoApp.sq:SaveItem.st:check' });
  j.call('tools_sql_transaction_create', { status: 'ok', transactions: [{ qname: 'DemoApp.cn:db.tr:tmpRows', status: 'created' }, { qname: 'DemoApp.cn:db.tr:listRows', status: 'replaced' }, { qname: 'DemoApp.cn:db.tr:kept', status: 'kept' }], created: ['DemoApp.cn:db.tr:tmpRows'] }, { project: 'DemoApp' });
  j.call('tools_databaseobject_delete', { qname: 'DemoApp.cn:db.tr:tmpRows', removed: true }, {});
  const answer = j.changes();
  assert.match(answer.objects.find(l => l.startsWith('DemoApp.sq:GetItems:')), /^DemoApp\.sq:GetItems: renamed from DemoApp\.sq:GetItem, changed; databaseobject-tree-apply x1, databaseobject-rename x1; 2026-11-17 09:00:00Z to 09:00:01Z$/);
  assert.match(answer.objects.find(l => l.startsWith('DemoApp.sq:SaveItem:')), /^DemoApp\.sq:SaveItem: created \(\+1 inside\); business-sequence-create x1, databaseobject-tree-apply x1; /);
  assert.match(answer.objects.find(l => l.startsWith('DemoApp.cn:db.tr:listRows:')), /: changed; sql-transaction-create x1; at /);
  assert.match(answer.objects.find(l => l.startsWith('DemoApp.cn:db.tr:tmpRows:')), /: created then deleted; sql-transaction-create x1, databaseobject-delete x1; /);
  assert.equal(answer.objects.some(l => /tr:kept/.test(l)), false, 'kept is no change');
  assert.equal(answer.objects.some(l => /st:check/.test(l)), false, 'a change under a new object is part of it');
  // what changed existing objects comes before what was created
  assert.ok(answer.objects.findIndex(l => l.startsWith('DemoApp.sq:GetItems:')) < answer.objects.findIndex(l => l.startsWith('DemoApp.sq:SaveItem:')));
  assert.deepEqual(answer.projects, ['DemoApp: 5 objects, 0 files, 0 runs']);
  assert.equal(answer.calls, 6);
  assert.equal(answer.scope, 'conversation');
  assert.match(answer.howToUse, /name every object/);
  assert.match(answer.howToUse, /an empty list for a project means no object of it was changed through the MCP/);
  assert.equal(Object.keys(answer).pop(), 'howToUse');
});

test('batch-call records each of its writes with the whole answer of its tool, and the endpoint records nothing for the batch', () => {
  const j = load();
  const batchAnswer = {
    status: 'ok', responseDetail: 'compact', touchedQNames: ['DemoApp.sq:A', 'DemoApp.sq:B'],
    calls: [{ index: 0, tool: 'databaseobject-tree-apply', status: 'applied' }, { index: 1, tool: 'databaseobject-rename', status: 'applied' }],
    operations: [{ index: 0, tool: 'databaseobject-tree-apply', status: 'applied' }, { index: 1, tool: 'databaseobject-rename', status: 'applied' }]
  };
  // what js/tools_batch_call.js records after each call that did not fail
  const inner = j.call('tools_databaseobject_tree_apply', { status: 'ok', operations: [{ status: 'applied', applied: [{ action: 'setProperties', qname: 'DemoApp.sq:A' }] }] },
    { target: 'DemoApp.sq:A', autoSave: false, responseDetail: 'full' }, j.conversation, 'batch-call');
  assert.deepEqual(inner, { tool: 'databaseobject-tree-apply', via: 'batch-call', status: 'ok', objects: [{ q: 'DemoApp.sq:A', c: 'changed' }] });
  j.call('tools_databaseobject_rename', { qname: 'DemoApp.sq:B0', newQName: 'DemoApp.sq:B', renamed: true }, {}, j.conversation, 'batch-call');
  // a read of the batch records nothing
  assert.equal(j.call('tools_databaseobject_tree_get', { qname: 'DemoApp.sq:A' }, {}, j.conversation, 'batch-call'), null);
  // then the endpoint, after the batch answered
  assert.equal(j.call('tools_batch_call', batchAnswer, { calls: '[]' }), null);
  const answer = j.changes();
  assert.equal(answer.calls, 2);
  assert.deepEqual(answer.objects.map(l => l.split(';')[0]), ['DemoApp.sq:B: renamed from DemoApp.sq:B0', 'DemoApp.sq:A: changed']);

  const batch = read('js/tools_batch_call.js');
  assert.match(batch, /registerRef\(refs, report\.callId, payload\);\n\s+journalInnerCall\(sequenceName, payload, callArguments\);/);
  assert.match(batch, /C8O\.writeJournal\.recordCall\(context, sequenceName, payload, callArguments, \{ via: "batch-call" \}\);\n\s+\} catch \(_ignoreJournal\) \{\}/);
});

test('requestable-execute: runs per requestable, ok or in error, and the reads of this MCP are no run', () => {
  const j = load();
  const seed = (status, payload, error) => j.call('tools_requestable_execute',
    { result: Object.assign({ requestable: 'DemoApp.SeedData', status, truncated: false }, payload ? { payload } : {}, error ? { error } : {}) },
    { requestable: 'DemoApp.SeedData', variables: '{"adminPassword":"not-kept"}' });
  assert.deepEqual(seed('ok', { success: true, data: { rows: 3 } }).run, { r: 'DemoApp.SeedData', ok: true });
  assert.deepEqual(seed('error', null, { message: 'Duplicate key' }), { tool: 'requestable-execute', status: 'error', run: { r: 'DemoApp.SeedData', ok: false } });
  assert.equal(seed('ok', { success: false, errors: [{ code: 'WRITE_FAILED' }] }).run.ok, false);
  assert.equal(seed('ok', { status: 'failed' }).run.ok, false);
  j.call('tools_requestable_execute', { result: { requestable: 'DemoApp.ListItems', status: 'ok', payload: { success: true } } }, {});
  // guides read through requestable-execute and reads of this MCP
  assert.equal(j.call('tools_requestable_execute', { result: { requestable: 'lib_ConvertigoMCP.mcp_resources_read', status: 'ok', payload: {} } }, {}), null);
  assert.equal(j.call('tools_requestable_execute', { result: { requestable: 'lib_ConvertigoMCP.tools_project_brief', status: 'ok', payload: {} } }, {}), null);
  // a write tool of this MCP run that way is that write
  const write = j.call('tools_requestable_execute', { result: { requestable: 'lib_ConvertigoMCP.tools_databaseobject_delete', status: 'ok', payload: { result: { qname: 'DemoApp.sq:Tmp', removed: true } } } },
    { requestable: 'lib_ConvertigoMCP.tools_databaseobject_delete', variables: { qname: 'DemoApp.sq:Tmp' } });
  assert.deepEqual(write, { tool: 'databaseobject-delete', via: 'requestable-execute', status: 'ok', objects: [{ q: 'DemoApp.sq:Tmp', c: 'deleted' }] });
  const answer = j.changes();
  assert.deepEqual(answer.runs, [
    'DemoApp.SeedData: 4 runs, 3 errors, the last in error at 2026-11-17 09:00:03Z',
    'DemoApp.ListItems: 1 run, ok at 2026-11-17 09:00:04Z'
  ]);
  assert.deepEqual(answer.projects, ['DemoApp: 1 object, 0 files, 2 runs']);
  assert.equal(JSON.stringify([...j.values.values()].map(map => [...map.map.values()].map(d => d.items))).includes('not-kept'), false);
});

test('an error answer, a refusal, a read and a call that threw record nothing', () => {
  const j = load();
  assert.equal(j.call('tools_databaseobject_tree_apply', { status: 'failed', touchedQNames: ['DemoApp.sq:A'], operations: [{ status: 'failed', applied: [{ action: 'create', qname: 'DemoApp.sq:A.st:x' }] }] }, { target: 'DemoApp.sq:A' }), null);
  assert.equal(j.call('tools_databaseobject_rename', { status: 'error', qname: 'DemoApp.sq:A', newQName: 'DemoApp.sq:B', renamed: true }, {}), null);
  assert.equal(j.call('tools_upsert_crud', { status: 'refused', saved: false, reason: 'user' }, {}), null);
  assert.equal(j.call('tools_nocode_form_edit', { status: 'invalid', saved: false }, { id: 'f1' }), null);
  assert.equal(j.call('tools_project_brief', { project: 'DemoApp', pages: [] }, { project: 'DemoApp' }), null);
  assert.equal(j.call('nocode_write_held', { status: 'awaiting_confirmation' }, {}), null);
  assert.equal(j.call('tools_databaseobject_delete', 'not an object', {}), null);
  // the guard never throws: a store that fails is a warning
  const broken = { server: { get: () => { throw new Error('store down'); }, set: () => {} }, httpServletRequest: { getHeader: () => null } };
  assert.equal(j.api.recordCall(broken, 'tools_databaseobject_delete', { qname: 'DemoApp.sq:A', removed: true }, {}), null);
  assert.match(j.warnings.pop(), /write journal: .*store down/);
  const answer = j.changes();
  assert.deepEqual([answer.objects, answer.files, answer.runs, answer.calls], [[], [], [], 0]);
  assert.match(answer.note, /^No write and no run recorded through the MCP in this conversation\.$/);
});

test('files: the project notes, a js file and a stub are file entries; project-level writes are lines of their own', () => {
  const j = load();
  j.call('tools_project_notes_write', { project: 'DemoApp', path: '_private/docs/PROGRESS.md', status: 'created', chars: 120 }, { project: 'DemoApp', text: 'secret-free notes', mode: 'replace' });
  j.call('tools_project_notes_write', { project: 'DemoApp', path: '_private/docs/PROGRESS.md', status: 'appended', chars: 300 }, { project: 'DemoApp', text: 'more', mode: 'append' });
  j.call('tools_project_js_set', { status: 'written', filename: 'app.js', path: '/abs/workspace/DemoApp/js/app.js', relativePath: 'app.js', created: false }, { project: 'DemoApp', filename: 'js/app.js', content: 'var x;' });
  j.call('tools_requestable_stub_set', { status: 'written', project: 'DemoApp', relativePath: 'stubs/ListItems.xml', created: true }, {});
  j.call('tools_ngx_theme_apply', { status: 'ok', project: 'DemoApp', style: 'AppTheme updated' }, { project: 'DemoApp', preset: 'calm' });
  j.call('tools_marketplace_import', { status: 'ok', project: 'lib_Sample', library: 'lib_Sample', loadedBefore: false, loadedAfter: true, referenceAdded: true }, { project: 'lib_Sample', targetProject: 'DemoApp' });
  j.call('tools_scheduler_apply', { status: 'created', name: 'nightly_cleanup' }, { project: 'DemoApp', name: 'nightly_cleanup', cron: '0 0 2 * * ?' });
  const answer = j.changes();
  assert.deepEqual(answer.files.map(l => l.split(';')[0]), [
    'DemoApp/js/app.js: changed',
    'DemoApp/_private/docs/PROGRESS.md: created',
    'DemoApp/stubs/ListItems.xml: created'
  ]);
  assert.match(answer.files[1], /project-notes-write x2/);
  assert.deepEqual(answer.objects.map(l => l.split(';')[0]), [
    'DemoApp (project): changed (theme (AppTheme updated), reference to lib_Sample)',
    'lib_Sample (project): created',
    'scheduler job nightly_cleanup (DemoApp): created'
  ]);
  assert.deepEqual(answer.projects, ['DemoApp: 2 objects, 3 files, 0 runs', 'lib_Sample: 1 object, 0 files, 0 runs']);
  assert.equal(JSON.stringify(answer).includes('/abs/'), false, 'no absolute path');
});

test('the journal is the conversation\'s, else the bearer\'s, under a digest', () => {
  const j = load();
  const delete1 = { qname: 'DemoApp.sq:One', removed: true };
  j.call('tools_databaseobject_delete', delete1, {}, j.contextFor({ conversation: 'conv-1', bearer: 'token-a' }));
  j.call('tools_databaseobject_delete', { qname: 'DemoApp.sq:Two', removed: true }, {}, j.contextFor({ conversation: 'conv-2', bearer: 'token-a' }));
  j.call('tools_databaseobject_delete', { qname: 'DemoApp.sq:Three', removed: true }, {}, j.contextFor({ bearer: 'token-a' }));
  j.call('tools_databaseobject_delete', { qname: 'DemoApp.sq:Four', removed: true }, {}, j.contextFor({ bearer: 'token-b' }));
  // an invalid conversation id is no conversation
  j.call('tools_databaseobject_delete', { qname: 'DemoApp.sq:Five', removed: true }, {}, j.contextFor({ conversation: '../x y', bearer: 'token-b' }));
  // the router passes the id it already read: the same journal as the header gives
  j.api.recordCall(j.contextFor({ bearer: 'token-c' }), 'tools_databaseobject_delete', { qname: 'DemoApp.sq:Six', removed: true }, {}, { conversationId: 'conv-1' });
  const names = context => j.changes({}, context).objects.map(l => l.split(':')[1]);
  assert.deepEqual(names(j.contextFor({ conversation: 'conv-1', bearer: 'token-z' })), ['One', 'Six']);
  assert.deepEqual(names(j.contextFor({ conversation: 'conv-2' })), ['Two']);
  assert.deepEqual(names(j.contextFor({ bearer: 'token-a' })), ['Three']);
  assert.deepEqual(names(j.contextFor({ bearer: 'token-b' })), ['Five', 'Four']);
  assert.equal(j.changes({}, j.contextFor({ bearer: 'token-b' })).scope, 'token');
  const keys = j.values.get(j.api.STORE_KEY).keySet().toArray();
  assert.equal(keys.length, 4);
  assert.ok(keys.every(key => /^[0-9a-f]{64}$/.test(key)), 'keys are digests: no conversation id nor bearer in the store');
});

test('bounded: entries per journal, characters, age, number of journals', () => {
  const j = load();
  for (let i = 0; i < 450; i++) {
    j.call('tools_databaseobject_delete', { qname: 'DemoApp.sq:S' + i, removed: true }, {});
  }
  const journal = j.api.read(j.server, j.api.keyOf(j.conversation).key, j.clock.now);
  assert.equal(journal.entries.length, 400);
  assert.equal(journal.full, true);
  assert.equal(journal.entries[0].objects[0].q, 'DemoApp.sq:S50');
  const answer = j.changes();
  assert.match(answer.kept, /Only the last 400 writes are kept/);

  // characters: large entries fill MAX_JOURNAL_CHARS before 400 entries
  const k = load();
  for (let i = 0; i < 120; i++) {
    const entry = k.call('tools_upsert_crud', { status: 'success', created: Array.from({ length: 25 }, (_, n) => 'DemoApp.sq:GeneratedObjectName' + i + '_' + n) }, {});
    assert.ok(JSON.stringify(entry).length <= k.api.MAX_ENTRY_CHARS);
  }
  const deque = k.values.get(k.api.STORE_KEY).get(k.api.keyOf(k.conversation).key);
  assert.ok(deque.items.join('').length <= k.api.MAX_JOURNAL_CHARS, String(deque.items.join('').length));
  assert.ok(deque.items.length < 120 && deque.items.length > 50, String(deque.items.length));
  assert.match(deque.items[deque.items.length - 1], /GeneratedObjectName119_/);

  // age: nothing older than 24 h is read, and the next write drops it
  const a = load();
  a.call('tools_databaseobject_delete', { qname: 'DemoApp.sq:Old', removed: true }, {});
  a.clock.now += 24 * 3600000;
  assert.deepEqual(a.changes().objects, []);
  a.call('tools_databaseobject_delete', { qname: 'DemoApp.sq:New', removed: true }, {});
  const items = a.values.get(a.api.STORE_KEY).get(a.api.keyOf(a.conversation).key).items;
  assert.equal(items.length, 1);
  assert.match(items[0], /sq:New/);

  // journals: 64 at most, the least recently written leave first, an expired one leaves at once
  const m = load();
  for (let i = 0; i < 70; i++) {
    m.call('tools_databaseobject_delete', { qname: 'DemoApp.sq:C' + i, removed: true }, {}, m.contextFor({ conversation: 'conv-' + i }));
  }
  const journals = m.values.get(m.api.STORE_KEY);
  assert.equal(journals.size(), 64);
  assert.deepEqual(m.changes({}, m.contextFor({ conversation: 'conv-0' })).objects, []);
  assert.equal(m.changes({}, m.contextFor({ conversation: 'conv-69' })).objects.length, 1);
  m.clock.now += 24 * 3600000 + 1;
  m.call('tools_databaseobject_delete', { qname: 'DemoApp.sq:Late', removed: true }, {}, m.contextFor({ conversation: 'conv-late' }));
  assert.equal(journals.size(), 1);

  // an entry keeps MAX_OBJECTS_PER_ENTRY objects and counts the rest
  const e = load();
  const crud = e.call('tools_upsert_crud', { status: 'success', project: 'DemoApp', created: Array.from({ length: 25 }, (_, i) => 'DemoApp.sq:c' + i), createdCount: 70,
    updated: Array.from({ length: 25 }, (_, i) => 'DemoApp.cn:db.tr:u' + i), updatedCount: 25 }, { spec: '{}' });
  assert.equal(crud.objects.length, 40);
  assert.equal(crud.more, 45 + 10);
  assert.match(e.changes().notListed, /^55 more objects of large calls/);
});

test('the answer stays under the budget with many objects, counts what it leaves out, and keeps the most telling lines', () => {
  const j = load();
  for (let i = 0; i < 300; i++) {
    j.call('tools_business_sequence_create', { status: 'ok', qname: 'DemoApp.sq:GeneratedSequenceWithALongName' + i, created: ['DemoApp.sq:GeneratedSequenceWithALongName' + i] }, { project: 'DemoApp' });
  }
  j.call('tools_databaseobject_tree_apply', { status: 'ok', touchedQNames: ['DemoApp.sq:ExistingOutput'], operations: [{ status: 'applied', appliedByAction: { setProperties: 1 } }] }, { target: 'DemoApp.sq:ExistingOutput' });
  for (let i = 0; i < 60; i++) {
    j.call('tools_requestable_execute', { result: { requestable: 'DemoApp.Run' + i, status: 'ok', payload: {} } }, {});
  }
  const answer = j.changes();
  const indented = JSON.stringify(answer, null, 2).length;
  assert.ok(indented <= j.api.BUDGET, String(indented));
  assert.ok(indented < 14000);
  assert.ok(answer.omitted.objects > 200, JSON.stringify(answer.omitted));
  assert.equal(answer.objects.length + answer.omitted.objects, 301);
  assert.equal(answer.runs.length + (answer.omitted.runs || 0), 60);
  assert.match(answer.objects[0], /^DemoApp\.sq:ExistingOutput: changed;/, 'a change to an existing object comes first');
  assert.match(answer.more, /call project-changes again with project or since/);
  // the endpoint pages nothing: within the budget a client shows at once, with the notes of a call
  const pages = { C8O: {} };
  vm.createContext(pages);
  vm.runInContext(read('js/mcp_answer_pages.js'), pages);
  const value = pages.C8O.mcpAnswerPages.answerValue(answer, 'an argument warning of the endpoint', '', '');
  assert.ok(pages.C8O.mcpAnswerPages.measure(pages.C8O.mcpAnswerPages.deliveredText(value, ''), value, false) <= pages.C8O.mcpAnswerPages.BUDGET);
});

test('project and since narrow the answer', () => {
  const j = load();
  j.call('tools_databaseobject_delete', { qname: 'DemoApp.sq:A', removed: true }, {});
  j.call('tools_databaseobject_delete', { qname: 'OtherApp.sq:B', removed: true }, {});
  const middle = j.clock.now;
  j.call('tools_databaseobject_delete', { qname: 'DemoApp.sq:C', removed: true }, {});
  j.call('tools_requestable_execute', { result: { requestable: 'OtherApp.Seed', status: 'ok', payload: {} } }, {});
  j.call('tools_project_notes_write', { project: 'OtherApp', path: '_private/docs/PROGRESS.md', status: 'replaced' }, { project: 'OtherApp' });
  const demo = j.changes({ project: 'DemoApp' });
  assert.deepEqual(demo.objects.map(l => l.split(';')[0]), ['DemoApp.sq:A: deleted', 'DemoApp.sq:C: deleted']);
  assert.deepEqual([demo.files, demo.runs, demo.projects, demo.calls, demo.project], [[], [], ['DemoApp: 2 objects, 0 files, 0 runs'], 2, 'DemoApp']);
  const other = j.changes({ project: 'OtherApp' });
  assert.deepEqual([other.objects.length, other.files.length, other.runs.length, other.calls], [1, 1, 1, 3]);
  const recent = j.changes({ since: String(middle) });
  assert.deepEqual(recent.objects.map(l => l.split(';')[0]), ['DemoApp.sq:C: deleted']);
  assert.equal(recent.since, '2026-11-17 09:00:02Z');
  assert.equal(recent.from, '2026-11-17 09:00:02Z');
  assert.equal(recent.calls, 3);
  const none = j.changes({ project: 'EmptyApp' });
  assert.match(none.note, /^No write and no run recorded through the MCP for EmptyApp in this conversation\.$/);
  // Convertigo passes an empty variable as "null"; a bad since is refused
  assert.equal(j.changes({ project: 'null', since: 'null' }).calls, 5);
  assert.throws(() => j.changes({ since: 'yesterday' }), /since must be a time in milliseconds since 1970/);
});

test('project-changes asks a valid bearer', () => {
  const j = load();
  j.sandbox.C8O.mcpAuth = { authenticateRequest: () => ({ authenticated: false }) };
  assert.throws(() => j.changes(), /A Convertigo MCP bearer token is required/);
});

test('every write tool of the Studio confirmation is journaled, by a handler of its own or the generic one; no read is', () => {
  const j = load();
  const writes = j.sandbox.C8O.studioWriteConfirm.WRITE_TOOLS;
  const reads = j.sandbox.C8O.studioWriteConfirm.READ_TOOLS;
  for (const sequence of Object.keys(j.api.HANDLERS)) {
    assert.ok(writes[sequence] !== undefined, sequence + ' has a journal handler but is not a write tool');
  }
  for (const sequence of Object.keys(reads)) {
    assert.equal(j.api.entryOf(sequence, { status: 'ok', qname: 'DemoApp.sq:A', created: ['DemoApp.sq:A'] }, {}, {}), null, sequence);
  }
  // a write tool added later is journaled from what its answer names
  writes.tools_databaseobject_copy = 'databaseobject-copy';
  assert.deepEqual(plain(j.api.entryOf('tools_databaseobject_copy', { status: 'ok', source: 'DemoApp.sq:A', qname: 'DemoApp.sq:A_copy', objects: 4 }, { source: 'DemoApp.sq:A' }, {})),
    { tool: 'databaseobject-copy', status: 'ok', objects: [{ q: 'DemoApp.sq:A_copy', c: 'created' }] });
  // No Code: the form by its id, never a value of the form
  assert.deepEqual(plain(j.api.entryOf('tools_nocode_form_edit', { status: 'ok', saved: true }, { id: 'a1b2c3', operations: '[{"action":"add_field"}]' }, {})).objects,
    [{ q: 'form a1b2c3', c: 'changed', k: 'form', pr: 'C8Oforms' }]);
});

test('journalAfterToolCall records a write under the router\'s conversation, loads nothing more for a read, and never throws', () => {
  const j = load();
  const router = read('js/mcp_endpoint_router.js');
  const code = router.match(/\nfunction journalAfterToolCall\(sequenceName, toolResult, callArguments\) \{\n[\s\S]*?\n\}\n/)[0];
  const included = [];
  const box = {
    C8O: j.sandbox.C8O,
    context: j.contextFor({ bearer: 'token-r' }),
    managedConversationId: 'conv-router',
    include: file => { included.push(file); j.sandbox.include(file); }
  };
  vm.createContext(box);
  vm.runInContext(code, box);
  assert.equal(box.journalAfterToolCall('tools_databaseobject_tree_get', { qname: 'DemoApp.sq:A' }, {}), null);
  assert.equal(box.journalAfterToolCall('tools_databaseobject_delete', { status: 'error', qname: 'DemoApp.sq:A', removed: true }, {}), null);
  assert.deepEqual(plain(box.journalAfterToolCall('tools_databaseobject_delete', { qname: 'DemoApp.sq:A', removed: true }, {})),
    { tool: 'databaseobject-delete', status: 'ok', objects: [{ q: 'DemoApp.sq:A', c: 'deleted' }] });
  assert.deepEqual(included, [], 'both modules were already loaded');
  assert.deepEqual(j.changes({}, j.contextFor({ conversation: 'conv-router' })).objects.map(l => l.split(';')[0]), ['DemoApp.sq:A: deleted']);
  j.sandbox.C8O.writeJournal.recordCall = () => { throw new Error('journal down'); };
  assert.equal(box.journalAfterToolCall('tools_databaseobject_delete', { qname: 'DemoApp.sq:B', removed: true }, {}), null);
});

test('the endpoint journals each tool answer after the reveal, and project-changes is a registered read tool', () => {
  const router = read('js/mcp_endpoint_router.js');
  assert.match(router, /function journalAfterToolCall\(sequenceName, toolResult, callArguments\) \{\n\s+try \{[\s\S]*?C8O\.writeJournal\.recordCall\(context, sequenceName, toolResult, callArguments, \{ conversationId: managedConversationId \}\);\n\s+\} catch \(_ignoreJournal\) \{\n\s+return null;/);
  const endpoint = read('_c8oProject/sequences/mcp_endpoint.yaml');
  assert.match(endpoint, /↓RevealAfterCall \[steps\.SimpleStep-1794600000001\]: \n\s+comment: [^\n]+\n\s+expression: revealAfterToolCall\(callSequence, result, callVariables\); journalAfterToolCall\(callSequence, result, callVariables\);\n/);

  assert.match(read('c8oProject.yaml'), /\n {2}↓tools_project_changes \[sequences\.GenericSequence\]: 🗏 sequences\/tools_project_changes\.yaml\n/);
  const sequence = read('_c8oProject/sequences/tools_project_changes.yaml');
  for (const l of sequence.split('\n').filter(l => /(↓[^\]]+\]|key|jsonObject|xmlizable|SmartType):\s*$/.test(l))) {
    assert.match(l, /: $/, 'a Convertigo YAML line keeps its trailing space: ' + l);
  }
  assert.match(sequence, /C8O\.writeJournal\.execute\(context, \{project: project, since: since\}\)/);
  const stepIds = [...sequence.matchAll(/-(\d{13})\]/g)].map(m => m[1]);
  const others = fs.readdirSync(path.join(root, '_c8oProject/sequences')).filter(f => f !== 'tools_project_changes.yaml').map(f => read('_c8oProject/sequences/' + f)).join('\n');
  for (const id of stepIds) {
    assert.equal(others.includes('-' + id + ']'), false, 'priority ' + id + ' is unique');
  }
  const sandbox = { C8O: {} };
  sandbox.include = file => vm.runInContext(read(file), sandbox, { filename: file });
  vm.createContext(sandbox);
  sandbox.include('js/studio_write_confirm.js');
  assert.equal(sandbox.C8O.studioWriteConfirm.READ_TOOLS.tools_project_changes, true);
  assert.match(read('js/setup_vibe.js'), /"Convertigo_project-changes",/);
  vm.runInContext(read('js/schema_overrides.js'), sandbox);
  const input = plain(sandbox.C8O.schemaOverrides.applyInput('tools_project_changes', null, null));
  assert.deepEqual(Object.keys(input.properties), ['project', 'since']);
  assert.equal(input.additionalProperties, false);
  const output = plain(sandbox.C8O.schemaOverrides.applyOutput('tools_project_changes', { type: 'object', properties: {} }, null));
  for (const field of ['objects', 'files', 'runs', 'projects', 'howToUse', 'omitted']) {
    assert.ok(output.properties[field], field);
  }
});

test('the close-the-task guide and the common skill say to report from project-changes', () => {
  const guide = read('resources/guides/common/proof-results.md');
  assert.match(guide, /`project-changes`/);
  assert.match(guide, /nothing else was modified/);
  assert.match(read('resources/convertigo_common_skill.md'), /`project-changes`/);
});
