// Run: node --test tests/scripts/validate_studio_write_confirm.cjs
// The changes of Tigo in a Studio: "Confirmer avant de modifier" holds each write of a Tigo agent until the user answers
// a card of the panel, "Lecture seule" refuses every write, off (the default) changes nothing. Every tool of the project
// is classified: a tool in neither list is a write nobody would confirm. The panel is played by a fake clock.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sandbox = { include: file => vm.runInContext(read(file), sandbox) };
vm.createContext(sandbox);
vm.runInContext(read('js/nocode_write_confirm.js'), sandbox);
vm.runInContext(read('js/studio_write_confirm.js'), sandbox);
const api = sandbox.C8O.studioWriteConfirm;
const nocode = sandbox.C8O.nocodeWriteConfirm;
const plain = value => JSON.parse(JSON.stringify(value));

class FakeMap {
  constructor() { this.m = new Map(); }
  get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  put(k, v) { this.m.set(k, v); }
  remove(k, v) { if (v !== undefined && this.m.get(k) !== v) return false; return this.m.delete(k); }
  putIfAbsent(k, v) { if (!this.m.has(k)) this.m.set(k, v); return null; }
  replace(k, before, after) { if (this.m.get(k) !== before) return false; this.m.set(k, after); return true; }
  keySet() { const keys = [...this.m.keys()]; return { toArray: () => keys }; }
}

function world(options = {}) {
  const server = new Map();
  const clock = { now: 1794000000000, slept: 0 };
  const runs = options.runs || {};
  const host = {
    server: () => ({ get: k => server.has(k) ? server.get(k) : null, set: (k, v) => server.set(k, v) }),
    newMap: () => new FakeMap(),
    getForm: () => null,
    now: () => clock.now,
    sleep: ms => {
      const conversations = server.get('lib_ConvertigoAssistant.hostRequests');
      if (options.play) { options.play(clock, conversations ? conversations.get('agent-1') : null, assistant); }
      clock.now += ms; clock.slept += ms;
    },
    uuid: () => 'u' + (++world.ids),
    subagentRun: id => runs[id] || null,
    readCallsFile: file => (options.files || {})[file] || { error: 'not found' }
  };
  // what lib_ConvertigoAssistant writes for the Studio (its user is "studio")
  const assistant = {
    choose(mode) {
      if (!server.has('lib_ConvertigoAssistant.writeConfirm')) server.set('lib_ConvertigoAssistant.writeConfirm', new FakeMap());
      server.get('lib_ConvertigoAssistant.writeConfirm').put('user:studio', JSON.stringify({ on: mode !== 'off', mode, at: clock.now }));
    },
    grant(conversation = 'agent-1') {
      server.get('lib_ConvertigoAssistant.writeConfirm').put('grant:' + conversation, JSON.stringify({ user: 'studio', at: clock.now }));
    },
    requests() {
      const conversations = server.get('lib_ConvertigoAssistant.hostRequests');
      const map = conversations && conversations.get('agent-1');
      return map ? [...map.m.values()].map(v => JSON.parse(v)) : [];
    },
    answer(map, status, reason) {
      for (const [id, json] of map.m) {
        const request = JSON.parse(json);
        if (request.kind === 'write-confirm' && (request.status === 'pending' || request.status === 'taken')) {
          map.replace(id, json, JSON.stringify(Object.assign({}, request, { status, decidedAt: clock.now }, reason ? { reason } : {})));
          if (status === 'allowed_turn') assistant.grant();
        }
      }
    }
  };
  if (options.mode) assistant.choose(options.mode);
  const who = { conversationId: options.conversation === undefined ? 'agent-1' : options.conversation, subagentRun: options.subagentRun || '' };
  return { host, clock, server, assistant, run: (sequence, args) => api.run(sequence, args, who, host) };
}
world.ids = 0;

const DELETE = { qname: 'CrmApp.sq:DeleteClient', autoSave: 'true' };
const BATCH = {
  calls: [
    { tool: 'databaseobject-tree-get', arguments: { qname: 'CrmApp' } },
    { tool: 'databaseobject-rename', arguments: { qname: 'CrmApp.sq:ListClients', name: 'ListCustomers' } },
    { tool: 'databaseobject_tree_apply', arguments: { target: 'CrmApp.sq:ListCustomers', tree: { className: 'SimpleStep', name: 'Log' } } }
  ],
  optimizeMutations: true
};

test('every tool of the project is a write or a read, never both, never neither', () => {
  const sequences = fs.readdirSync(path.join(root, '_c8oProject/sequences'))
    .filter(name => /^tools_.*\.yaml$/.test(name)).map(name => name.replace(/\.yaml$/, ''));
  assert.ok(sequences.length > 50, 'the tools of the project');
  const unclassified = sequences.filter(s => api.WRITE_TOOLS[s] === undefined && api.READ_TOOLS[s] !== true);
  assert.deepEqual(unclassified, [], 'a new tool must be classified in js/studio_write_confirm.js: a write missing from WRITE_TOOLS changes the project without a card');
  const both = sequences.filter(s => api.WRITE_TOOLS[s] !== undefined && api.READ_TOOLS[s] === true);
  assert.deepEqual(both, []);
  const gone = Object.keys(api.WRITE_TOOLS).concat(Object.keys(api.READ_TOOLS)).filter(s => !sequences.includes(s));
  assert.deepEqual(gone, [], 'a classified tool that no longer exists');
  for (const [sequence, tool] of Object.entries(api.WRITE_TOOLS)) {
    assert.equal(tool, sequence.replace(/^tools_/, '').replace(/_/g, '-'), sequence);
  }
});

test('the writes of the other lists are writes here too: No Code, and the project lock of the constructor', () => {
  for (const sequence of Object.keys(nocode.WRITE_TOOLS)) {
    assert.ok(api.WRITE_TOOLS[sequence], sequence);
  }
  const subagents = read('js/subagents.js');
  const block = /api\.WRITE_SEQUENCES = \{([\s\S]*?)\};/.exec(subagents)[1];
  for (const sequence of block.match(/tools_[a-z_]+/g)) {
    if (sequence !== 'tools_facade_create') {
      assert.ok(api.WRITE_TOOLS[sequence], sequence + ' is a write of the constructor lock');
    }
  }
});

test('what writes: dry runs, reads of a batch, a report collected and a verifier do not', () => {
  const writes = (sequence, args) => plain(api.writesOf(sequence, args).map(w => w.sequence));
  assert.deepEqual(writes('tools_databaseobject_tree_apply', { target: 'A.sq:B', tree: {} }), ['tools_databaseobject_tree_apply']);
  assert.deepEqual(writes('tools_databaseobject_tree_apply', { target: 'A.sq:B', tree: {}, dryRun: 'true' }), []);
  assert.deepEqual(writes('tools_project_list', {}), []);
  assert.deepEqual(writes('tools_mobile_builder_open', { project: 'A' }), []);
  assert.deepEqual(writes('tools_project_reload', { project: 'A' }), ['tools_project_reload']);
  assert.deepEqual(writes('tools_subagent_run', { profile: 'constructor', task: 'Build', inputs: { project: 'A' } }), ['tools_subagent_run']);
  assert.deepEqual(writes('tools_subagent_run', { runId: 'build-20261114-101010-0123abcd' }), []);
  assert.deepEqual(writes('tools_subagent_run', { profile: 'verifier', task: 'Check' }), []);
  // requestable-execute: a write tool of the MCP, or Tigo itself; an application's sequence is a test run
  assert.deepEqual(writes('tools_requestable_execute', { requestable: 'lib_ConvertigoMCP.tools_databaseobject_delete', variables: { qname: 'A.sq:B' } }), ['tools_requestable_execute']);
  assert.deepEqual(writes('tools_requestable_execute', { requestable: 'lib_ConvertigoMCP.sq:tools_project_save' }), ['tools_requestable_execute']);
  assert.deepEqual(writes('tools_requestable_execute', { requestable: 'lib_ConvertigoMCP.tools_project_list' }), []);
  assert.deepEqual(writes('tools_requestable_execute', { requestable: 'lib_ConvertigoMCP.tools_databaseobject_tree_apply', variables: '{"dryRun":true}' }), []);
  assert.deepEqual(writes('tools_requestable_execute', { requestable: 'lib_ConvertigoAssistant.AgentWriteConfirm', variables: { action: 'set', mode: 'off' } }), ['tools_requestable_execute']);
  assert.deepEqual(writes('tools_requestable_execute', { requestable: 'CrmApp.sq:ListClients' }), []);
  assert.deepEqual(writes('tools_requestable_execute', { requestable: 'CrmApp.cn:Db.tr:Select' }), []);
  // a batch: its writes, whatever the spelling of the tool names; a batch of reads writes nothing
  assert.deepEqual(writes('tools_batch_call', BATCH), ['tools_databaseobject_rename', 'tools_databaseobject_tree_apply']);
  assert.deepEqual(writes('tools_batch_call', { calls: JSON.stringify(BATCH.calls) }), ['tools_databaseobject_rename', 'tools_databaseobject_tree_apply']);
  assert.deepEqual(writes('tools_batch_call', { calls: [{ tool: 'databaseobject.tree.get', arguments: {} }, { tool: 'palette-list', arguments: {} }] }), []);
  assert.deepEqual(writes('tools_batch_call', { calls: [{ tool: 'facade-create', arguments: { project: 'A', name: 'B' } }] }), ['tools_business_sequence_create']);
  // the No Code writes keep their own rules
  assert.deepEqual(writes('tools_nocode_baserow_schema_apply', { mode: 'plan' }), []);
  assert.deepEqual(writes('tools_nocode_form_edit', { id: '1', operations: [] }), ['tools_nocode_form_edit']);
});

test('tool names map to their sequence as in the router', () => {
  assert.equal(api.sequenceOf('databaseobject-tree-apply'), 'tools_databaseobject_tree_apply');
  assert.equal(api.sequenceOf('databaseobject_tree_apply'), 'tools_databaseobject_tree_apply');
  assert.equal(api.sequenceOf('databaseobject.tree.apply'), 'tools_databaseobject_tree_apply');
  assert.equal(api.sequenceOf('Project-Save'), 'tools_project_save');
  assert.equal(api.sequenceOf('facade-create'), 'tools_business_sequence_create');
  assert.equal(api.sequenceOf('save'), '');
});

test('off, the default: nothing waits and nothing is asked', () => {
  const w = world();
  assert.equal(w.run('tools_databaseobject_delete', DELETE), null);
  w.assistant.choose('off');
  assert.equal(w.run('tools_batch_call', BATCH), null);
  assert.equal(w.server.has('lib_ConvertigoAssistant.hostRequests'), false);
  assert.equal(w.clock.slept, 0);
});

test('read-only: every write is refused at once and says why, the reads go on', () => {
  const w = world({ mode: 'readonly' });
  const answer = plain(w.run('tools_databaseobject_delete', DELETE));
  assert.equal(answer.status, 'refused');
  assert.equal(answer.saved, false);
  assert.equal(answer.reason, 'read_only');
  assert.match(answer.message, /read-only mode/);
  assert.match(answer.message, /nor make it another way/);
  assert.equal(w.clock.slept, 0);
  assert.equal(w.server.has('lib_ConvertigoAssistant.hostRequests'), false, 'no card');
  const batch = plain(w.run('tools_batch_call', BATCH));
  assert.equal(batch.reason, 'read_only');
  assert.deepEqual(batch.writes, ['databaseobject-rename', 'databaseobject-tree-apply']);
  assert.match(batch.message, /run the reads alone/);
  assert.equal(w.run('tools_databaseobject_tree_get', { qname: 'CrmApp' }), null);
  assert.equal(w.run('tools_databaseobject_tree_apply', { target: 'CrmApp', tree: {}, dryRun: true }), null);
  // even without the conversation, and from a constructor still running
  const lone = world({ mode: 'readonly', conversation: '', subagentRun: 'build-20261114-101010-0123abcd',
    runs: { 'build-20261114-101010-0123abcd': { alive: true, profile: 'constructor', conversationId: '' } } });
  assert.equal(plain(lone.run('tools_project_save', { project: 'CrmApp' })).reason, 'read_only');
});

test('confirm: the card names the project, the QNames and the kind of change; Autoriser lets the call go on once', () => {
  let seen = null;
  const w = world({ mode: 'confirm', play: (clock, map, assistant) => {
    if (clock.slept === 1000) { seen = assistant.requests()[0]; assistant.answer(map, 'allowed'); }
  } });
  assert.equal(w.run('tools_batch_call', BATCH), null);
  assert.equal(seen.kind, 'write-confirm');
  assert.equal(seen.scope, 'studio');
  assert.equal(seen.user, 'studio');
  assert.equal(seen.tool, 'batch-call');
  assert.equal(seen.project, 'CrmApp');
  assert.deepEqual(seen.projects, ['CrmApp']);
  assert.deepEqual(seen.items, [
    { action: 'rename', project: 'CrmApp', target: 'CrmApp.sq:ListClients', name: 'ListCustomers' },
    { action: 'tree_apply', project: 'CrmApp', target: 'CrmApp.sq:ListCustomers', names: ['Log'] }
  ]);
  assert.equal(w.assistant.requests().length, 0, 'used once');
  // the next change asks again
  let asked = 0;
  const again = world({ mode: 'confirm', play: (clock, map, assistant) => { if (map && assistant.requests().some(r => r.status === 'pending')) { asked++; assistant.answer(map, 'allowed'); } } });
  assert.equal(again.run('tools_project_save', { project: 'CrmApp' }), null);
  assert.equal(again.run('tools_project_save', { project: 'CrmApp' }), null);
  assert.equal(asked, 2);
});

test('confirm: Tout autoriser pour ce tour lets the next writes go on without a card', () => {
  const w = world({ mode: 'confirm', play: (clock, map, assistant) => { if (map) assistant.answer(map, 'allowed_turn'); } });
  assert.equal(w.run('tools_ngx_page_create', { project: 'CrmApp', name: 'Clients' }), null);
  const slept = w.clock.slept;
  assert.equal(w.run('tools_databaseobject_delete', DELETE), null);
  assert.equal(w.run('tools_project_save', { project: 'CrmApp' }), null);
  assert.equal(w.clock.slept, slept, 'no wait after the grant');
});

test('confirm: Refuser refuses the change and tells the agent not to do it another way', () => {
  const w = world({ mode: 'confirm', play: (clock, map, assistant) => { if (map) assistant.answer(map, 'refused'); } });
  const answer = plain(w.run('tools_databaseobject_delete', DELETE));
  assert.equal(answer.status, 'refused');
  assert.equal(answer.reason, 'user');
  assert.equal(answer.tool, 'databaseobject-delete');
  assert.match(answer.message, /nor the same change another way/);
  // the same call again in this turn: refused at once, no new card (an agent looping on its refusal, 14/11)
  const slept = w.clock.slept;
  const again = plain(w.run('tools_databaseobject_delete', { autoSave: 'true', qname: 'CrmApp.sq:DeleteClient' }));
  assert.equal(again.reason, 'user_again');
  assert.match(again.message, /Stop calling it/);
  assert.equal(w.clock.slept, slept, 'no wait');
  assert.equal(w.assistant.requests().length, 1, 'the refusal is kept until the end of the turn, no new card');
  assert.equal(w.assistant.requests()[0].status, 'refused');
  // another change still asks
  assert.equal(plain(w.run('tools_project_save', { project: 'CrmApp' })).reason, 'user');
  assert.equal(w.assistant.requests().length, 2);
});

test('confirm: no answer, 40 s per call then the same call again finds the same card; 5 minutes refuse it', () => {
  const w = world({ mode: 'confirm' });
  const first = plain(w.run('tools_databaseobject_delete', DELETE));
  assert.equal(first.status, 'awaiting_confirmation');
  assert.equal(first.secondsLeft, 260);
  assert.match(first.message, /again with exactly the same arguments/);
  assert.equal(w.clock.slept, 40000);
  // the same change, keys in another order and autoSave as a boolean text: the same card
  const second = plain(w.run('tools_databaseobject_delete', { autoSave: 'true', qname: 'CrmApp.sq:DeleteClient' }));
  assert.equal(second.requestId, first.requestId);
  assert.equal(w.assistant.requests().length, 1);
  w.clock.now += 5 * 60000;
  const late = plain(w.run('tools_databaseobject_delete', DELETE));
  assert.equal(late.status, 'refused');
  assert.equal(late.reason, 'no_answer');
});

test('confirm: the end of the turn closes the card and the waiting call refuses its change', () => {
  const w = world({ mode: 'confirm', play: (clock, map, assistant) => { if (map && clock.slept === 3000) assistant.answer(map, 'expired', 'turn_end'); } });
  const answer = plain(w.run('tools_project_js_set', { project: 'CrmApp', filename: 'js/util.js', content: 'x' }));
  assert.equal(answer.reason, 'turn_end');
});

test('confirm: switching to read-only while a card waits refuses it; switching off keeps the open card', () => {
  const w = world({ mode: 'confirm', play: (clock, map, assistant) => { if (clock.slept === 2000) assistant.choose('readonly'); } });
  const answer = plain(w.run('tools_databaseobject_delete', DELETE));
  assert.equal(answer.reason, 'read_only');
  assert.equal(w.assistant.requests().length, 0, 'the card is closed');
  const off = world({ mode: 'confirm' });
  assert.equal(plain(off.run('tools_project_save', { project: 'CrmApp' })).status, 'awaiting_confirmation');
  off.assistant.choose('off');
  assert.equal(plain(off.run('tools_project_save', { project: 'CrmApp' })).status, 'awaiting_confirmation', 'the open card still waits');
  assert.equal(off.run('tools_project_save', { project: 'Other' }), null, 'a new change goes on');
});

test('confirm: a call without the conversation cannot be asked and is refused', () => {
  const w = world({ mode: 'confirm', conversation: '' });
  const answer = plain(w.run('tools_project_save', { project: 'CrmApp' }));
  assert.equal(answer.reason, 'cannot_ask');
  assert.match(answer.message, /does not name its Tigo conversation/);
  assert.equal(world({ conversation: '' }).run('tools_project_save', { project: 'CrmApp' }), null, 'off: nothing to ask');
});

test('confirm: the calls of a constructor the user allowed go on; another conversation or a dead run is asked', () => {
  const runs = {
    'build-20261114-101010-0123abcd': { alive: true, profile: 'constructor', conversationId: 'agent-1' },
    'build-20261114-101010-0123abce': { alive: false, profile: 'constructor', conversationId: 'agent-1' },
    'build-20261114-101010-0123abcf': { alive: true, profile: 'constructor', conversationId: 'agent-2' }
  };
  assert.equal(world({ mode: 'confirm', runs, subagentRun: 'build-20261114-101010-0123abcd' }).run('tools_databaseobject_delete', DELETE), null);
  assert.equal(plain(world({ mode: 'confirm', runs, subagentRun: 'build-20261114-101010-0123abce' }).run('tools_databaseobject_delete', DELETE)).status, 'awaiting_confirmation');
  assert.equal(plain(world({ mode: 'confirm', runs, subagentRun: 'build-20261114-101010-0123abcf' }).run('tools_databaseobject_delete', DELETE)).status, 'awaiting_confirmation');
  // the constructor itself is a change of its own card
  let seen = null;
  const w = world({ mode: 'confirm', play: (clock, map, assistant) => { if (map) { seen = assistant.requests()[0]; assistant.answer(map, 'allowed'); } } });
  assert.equal(w.run('tools_subagent_run', { profile: 'constructor', task: 'Build the client pages', inputs: { project: 'CrmApp' } }), null);
  assert.deepEqual(seen.items, [{ action: 'subagent', project: 'CrmApp', detail: 'Build the client pages' }]);
});

test('a batch read from its file runs what the card showed', () => {
  const w = world({ mode: 'confirm', files: { 'CrmApp/batch.json': { calls: BATCH.calls } } });
  const args = { callsFile: 'CrmApp/batch.json', optimizeMutations: true };
  assert.equal(api.inlineCallsFile(args, w.host), null);
  assert.equal(args.callsFile, undefined);
  assert.equal(args.calls.length, 3);
  const unreadable = plain(api.inlineCallsFile({ callsFile: 'missing.json' }, w.host));
  assert.equal(unreadable.status, 'error');
  assert.match(unreadable.message, /no call of the batch ran/);
  assert.equal(api.inlineCallsFile({ calls: BATCH.calls }, w.host), null, 'inline calls stay');
});

test('the card of each kind of write', () => {
  const items = (sequence, args) => plain(api.summary(api.writesOf(sequence, args)).items);
  assert.deepEqual(items('tools_databaseobject_tree_apply', { target: 'A', at: 'inside', tree: { className: 'sequences.GenericSequence', name: 'Hello' } }),
    [{ action: 'tree_create', project: 'A', target: 'A', names: ['Hello'] }], 'a creation is not worded as a change of its parent');
  assert.equal(items('tools_databaseobject_tree_apply', { target: 'A.sq:B', at: 'after', tree: { name: 'C' } })[0].action, 'tree_insert');
  assert.deepEqual(items('tools_databaseobject_move', { qname: 'A.sq:B', target: 'A.sq:C', position: 'inside' }), [{ action: 'move', project: 'A', target: 'A.sq:B', to: 'A.sq:C', detail: 'inside' }]);
  assert.deepEqual(items('tools_sql_transaction_create', { project: 'A', connector: 'Db', transactions: [{ name: 'Select' }, { name: 'Insert' }] }), [{ action: 'create_transactions', project: 'A', target: 'Db', names: ['Select', 'Insert'] }]);
  assert.deepEqual(items('tools_upsert_crud', { spec: '{"project":"A","entities":[{"name":"Client"}]}' }), [{ action: 'crud', project: 'A', names: ['Client'] }]);
  assert.deepEqual(items('tools_project_delete', { project: 'A', deleteCar: 'true' }), [{ action: 'delete_project', project: 'A', detail: 'car' }]);
  assert.deepEqual(items('tools_mobile_builder_build', { project: 'A' }), [{ action: 'build', project: 'A' }]);
  assert.deepEqual(items('tools_marketplace_import', { project: 'lib_UserManager', targetProject: 'A' }), [{ action: 'import', project: 'lib_UserManager', name: 'lib_UserManager', to: 'A' }]);
  assert.deepEqual(items('tools_scheduler_apply', { action: 'delete', name: 'Nightly', project: 'A' }), [{ action: 'unschedule', project: 'A', name: 'Nightly' }]);
  assert.deepEqual(items('tools_requestable_execute', { requestable: 'lib_ConvertigoMCP.tools_project_save' }), [{ action: 'execute', project: 'lib_ConvertigoMCP', target: 'lib_ConvertigoMCP.tools_project_save' }]);
  const form = items('tools_nocode_form_publish', { id: '17', confirm: true });
  assert.equal(form[0].action, 'publish');
  assert.equal(form[0].project, 'C8Oforms');
  const many = api.summary(Array.from({ length: 40 }, (_, i) => ({ sequence: 'tools_project_save', args: { project: 'P' + i } })));
  assert.equal(many.items.length, 31);
  assert.deepEqual(plain(many.items[30]), { action: 'more' });
});

test('the router holds the calls of the managed tokens only, after the No Code hook, and runs a batch file inline', () => {
  const router = read('js/mcp_endpoint_router.js');
  const hook = router.indexOf('C8O.studioWriteConfirm.run(');
  assert.ok(hook > router.indexOf('C8O.nocodeWriteConfirm.run('), 'after the No Code hook');
  assert.ok(hook < router.indexOf('injectMeta(callVariables);', hook), 'before the call');
  const block = router.substring(router.lastIndexOf('if (callSequence === targetSequence && studioChoiceKnown', hook), hook);
  assert.match(block, /mcpAuthentication\.kind === "managed"/);
  assert.match(block, /inlineCallsFile\(callVariables, studioHost\)/);
  assert.match(router, /X-Convertigo-Subagent-Run/);
  assert.match(router.substring(hook), /callSequence = "nocode_write_held";/);
  assert.match(router.substring(hook), /studioMode !== "off" && studioWrite/, 'a failure never lets a write through while the choice is on');
});
