// Run: node --test tests/scripts/validate_nocode_write_confirm.cjs
// "Confirmer avant de modifier": a No Code write waits for the user's answer on a card of the Tigo panel while the user
// has it on. Off (the default), nothing changes. The panel is played by a fake clock: allow, allow for the turn,
// refuse, no answer (40 s per call, then the agent calls again; 5 min, then refused), switching mid-conversation, the
// summary of the card, and the router hook that answers instead of the tool.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'js/nocode_write_confirm.js'), 'utf8');
const sandbox = {};
vm.runInNewContext(source, sandbox);
const api = sandbox.C8O.nocodeWriteConfirm;
// the sandbox's objects, as plain ones of this realm
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

const FORM = {
  _id: '1793268150601', name: 'Skyjo',
  pages: [{ pageTechName: 'page1', name: 'Partie' }],
  formulaire: [
    { id: '17001', name: 'button2', type: 'button', config: { label: 'Enregistrer', page: 'page1' } },
    { id: '17002', name: 'score', type: 'number', config: { label: 'Score' } },
    { id: '17003', name: 'actions', type: 'layout', config: {} }
  ],
  flows: [{ id: 'flow_save', name: 'Enregistrer le score', elements: [] }]
};
const USER = 'google:1234:gregoryv@convertigo.com';
const OWNER = 'gregoryv@convertigo.com';
const EDIT = { id: '1793268150601', operations: '[{"action":"remove_field","fieldName":"button2"},{"action":"remove_flow","flowId":"flow_save"}]', token: '' };

// play(clock, requests): the panel, before each sleep
function world(options = {}) {
  const server = new Map();
  const clock = { now: 1793000000000, slept: 0 };
  const reads = [];
  const host = {
    server: () => ({ get: k => server.has(k) ? server.get(k) : null, set: (k, v) => server.set(k, v) }),
    newMap: () => new FakeMap(),
    getForm: (id, project) => { reads.push([id, project]); return options.form === undefined ? FORM : options.form; },
    now: () => clock.now,
    sleep: ms => {
      const conversations = server.get('lib_ConvertigoAssistant.hostRequests');
      if (options.play) { options.play(clock, conversations ? conversations.get('agent-1') : null, assistant); }
      clock.now += ms; clock.slept += ms;
    },
    uuid: () => 'u' + (++world.ids)
  };
  // what lib_ConvertigoAssistant writes
  const assistant = {
    choose(on, user = OWNER) {
      if (!server.has('lib_ConvertigoAssistant.writeConfirm')) server.set('lib_ConvertigoAssistant.writeConfirm', new FakeMap());
      server.get('lib_ConvertigoAssistant.writeConfirm').put('user:' + user.toLowerCase(), JSON.stringify({ on, at: clock.now }));
    },
    grant(conversation = 'agent-1') {
      server.get('lib_ConvertigoAssistant.writeConfirm').put('grant:' + conversation, JSON.stringify({ user: OWNER, at: clock.now }));
    },
    requests() {
      const conversations = server.get('lib_ConvertigoAssistant.hostRequests');
      const map = conversations && conversations.get('agent-1');
      return map ? [...map.m.values()].map(v => JSON.parse(v)) : [];
    },
    answer(map, status) {
      for (const [id, json] of map.m) {
        const request = JSON.parse(json);
        if (request.kind === 'write-confirm' && (request.status === 'pending' || request.status === 'taken')) {
          map.replace(id, json, JSON.stringify(Object.assign({}, request, { status, decidedAt: clock.now })));
          if (status === 'allowed_turn') assistant.grant();
        }
      }
    }
  };
  if (options.on) assistant.choose(true);
  const who = { user: USER, conversationId: options.conversation === undefined ? 'agent-1' : options.conversation };
  return { api, host, clock, server, assistant, reads, run: (sequence, args) => api.run(sequence, args, who, host) };
}
world.ids = 0;

test('only the writes are held: reads, plans and an unconfirmed publication never are', () => {
  for (const sequence of ['tools_nocode_form_create', 'tools_nocode_form_edit', 'tools_nocode_form_update']) {
    assert.equal(api.holds(sequence, {}), true, sequence);
  }
  for (const sequence of ['tools_nocode_form_get', 'tools_nocode_form_list', 'tools_nocode_form_contract_get', 'tools_nocode_form_compile', 'tools_nocode_form_validate',
    'tools_nocode_form_preview_capture', 'tools_nocode_baserow_catalog_list', 'tools_nocode_baserow_rows_list', 'tools_nocode_report_create', 'tools_project_list']) {
    assert.equal(api.holds(sequence, {}), false, sequence);
  }
  assert.equal(api.holds('tools_nocode_baserow_schema_apply', { mode: 'plan' }), false);
  assert.equal(api.holds('tools_nocode_baserow_schema_apply', {}), false, 'plan is the default');
  assert.equal(api.holds('tools_nocode_baserow_schema_apply', { mode: 'apply' }), true);
  assert.equal(api.holds('tools_nocode_app_create', { spec: '{"name":"Congés","mode":"plan"}' }), false);
  assert.equal(api.holds('tools_nocode_app_create', { spec: { name: 'Congés' } }), true, 'apply is the default');
  assert.equal(api.holds('tools_nocode_form_publish', { confirm: 'false' }), false, 'the tool refuses it anyway');
  assert.equal(api.holds('tools_nocode_form_publish', { confirm: 'true' }), true);
});

test('off, the default: nothing waits, nothing is asked, the form is not read', () => {
  const w = world();
  assert.equal(w.run('tools_nocode_form_edit', EDIT), null);
  assert.equal(w.server.has('lib_ConvertigoAssistant.hostRequests'), false);
  w.assistant.choose(false);
  assert.equal(w.run('tools_nocode_form_edit', EDIT), null);
  assert.equal(w.clock.slept, 0);
  assert.deepEqual(w.reads, []);
});

test('on: the card names the form and what changes; Autoriser lets the call go on once', () => {
  let seen = null;
  const w = world({ on: true, play: (clock, map, assistant) => {
    if (clock.slept === 2000) { seen = assistant.requests()[0]; assistant.answer(map, 'allowed'); }
  } });
  assert.equal(w.run('tools_nocode_form_edit', EDIT), null);
  assert.equal(seen.kind, 'write-confirm');
  assert.equal(seen.user, OWNER);
  assert.equal(seen.tool, 'nocode-form-edit');
  assert.equal(seen.formName, 'Skyjo');
  assert.deepEqual(seen.items, [
    { action: 'remove_field', target: 'button2', label: 'Enregistrer', kind: 'button' },
    { action: 'remove_flow', target: 'Enregistrer le score' }
  ]);
  assert.equal(seen.expiresAt - seen.createdAt, 5 * 60000);
  assert.deepEqual(w.assistant.requests(), [], 'used once');
  assert.deepEqual(w.reads, [['1793268150601', 'C8Oforms']]);
});

test('Tout autoriser pour ce tour: the next writes of the conversation go on without a card', () => {
  const w = world({ on: true, play: (clock, map, assistant) => assistant.answer(map, 'allowed_turn') });
  assert.equal(w.run('tools_nocode_form_edit', EDIT), null);
  const slept = w.clock.slept;
  assert.equal(w.run('tools_nocode_form_update', { id: '1793268150601', patch: { name: 'Skyjo 2' } }), null);
  assert.equal(w.clock.slept, slept, 'no wait');
  assert.deepEqual(w.assistant.requests(), []);
  // the grant is the conversation's: another one still asks
  const other = world({ on: true, conversation: 'agent-2' });
  other.assistant.grant('agent-1');
  other.host.sleep = () => { throw new Error('stop'); };
  assert.throws(() => other.run('tools_nocode_form_edit', EDIT), /stop/);
});

test('Refuser: a clear answer, nothing saved, and the request is gone', () => {
  const w = world({ on: true, play: (clock, map, assistant) => assistant.answer(map, 'refused') });
  const answer = w.run('tools_nocode_form_edit', EDIT);
  assert.equal(answer.status, 'refused');
  assert.equal(answer.reason, 'user');
  assert.equal(answer.saved, false);
  assert.match(answer.message, /refused this change/);
  assert.match(answer.message, /Do not retry it/);
  assert.match(answer.message, /Ask the user in one sentence what they want/);
  assert.deepEqual(w.assistant.requests(), []);
});

test('no answer: 40 s per call, the same call keeps the same card, 5 minutes refuse the change', () => {
  const w = world({ on: true });
  const first = w.run('tools_nocode_form_edit', EDIT);
  assert.equal(first.status, 'awaiting_confirmation');
  assert.match(first.message, /Call nocode-form-edit again with exactly the same arguments/);
  assert.equal(w.clock.slept, 40000);
  // the card stays open 5 minutes, and ending the turn closes it
  assert.equal(first.secondsLeft, 260);
  assert.match(first.message, /open 260 s more/);
  assert.match(first.message, /Do not end your turn while the card is open: the end of the turn closes it and nothing is saved/);
  // the agent calls again, its keys in another order and the operations as an array: the same change
  const again = { token: 'x', operations: JSON.parse(EDIT.operations), id: EDIT.id };
  let answer = null;
  const left = [];
  for (let calls = 0; calls < 10 && (!answer || answer.status === 'awaiting_confirmation'); calls++) {
    answer = w.run('tools_nocode_form_edit', again);
    if (answer.status === 'awaiting_confirmation') {
      left.push(answer.secondsLeft);
    }
  }
  assert.deepEqual(left.slice(0, 3), [220, 180, 140], 'the time left goes down call after call');
  assert.equal(w.assistant.requests().length, 0);
  assert.equal(answer.status, 'refused');
  assert.equal(answer.reason, 'no_answer');
  assert.match(answer.message, /within 5 minutes/);
  assert.ok(w.clock.slept >= 5 * 60000 && w.clock.slept < 5 * 60000 + 41000);
  assert.equal(w.reads.length, 1, 'one card, one read of the form');
});

test('allowed while no call waits: the next same call goes on at once', () => {
  const w = world({ on: true });
  assert.equal(w.run('tools_nocode_form_edit', EDIT).status, 'awaiting_confirmation');
  const map = w.server.get('lib_ConvertigoAssistant.hostRequests').get('agent-1');
  w.assistant.answer(map, 'allowed');
  const slept = w.clock.slept;
  assert.equal(w.run('tools_nocode_form_edit', EDIT), null);
  assert.equal(w.clock.slept, slept);
});

test('a changed call replaces the card nobody waits for; the turn end closes the open one', () => {
  const w = world({ on: true });
  w.run('tools_nocode_form_edit', EDIT);
  w.run('tools_nocode_form_edit', { id: EDIT.id, operations: '[{"action":"remove_field","fieldName":"score"}]' });
  const requests = w.assistant.requests();
  assert.deepEqual(requests.map(r => [r.status, r.reason || '']), [['expired', 'replaced'], ['pending', '']]);
  assert.deepEqual(requests[1].items, [{ action: 'remove_field', target: 'score', label: 'Score', kind: 'number' }]);
  // the Assistant closes the card at the end of the turn: a call still waiting is refused
  const ending = world({ on: true, play: (clock, map) => {
    for (const [id, json] of map.m) map.replace(id, json, JSON.stringify(Object.assign(JSON.parse(json), { status: 'expired', reason: 'turn_end' })));
  } });
  assert.equal(ending.run('tools_nocode_form_edit', EDIT).reason, 'turn_end');
});

test('switching mid-conversation: on holds the next write, off lets new writes go and keeps the open card', () => {
  const w = world();
  assert.equal(w.run('tools_nocode_form_edit', EDIT), null, 'off');
  w.assistant.choose(true);
  assert.equal(w.run('tools_nocode_form_edit', EDIT).status, 'awaiting_confirmation', 'on at once');
  w.assistant.choose(false);
  // the open card is not released: the same call keeps waiting for its answer
  assert.equal(w.run('tools_nocode_form_edit', EDIT).status, 'awaiting_confirmation');
  // another change goes through without a card
  const slept = w.clock.slept;
  assert.equal(w.run('tools_nocode_form_update', { id: EDIT.id, patch: { name: 'x' } }), null);
  assert.equal(w.clock.slept, slept);
  const map = w.server.get('lib_ConvertigoAssistant.hostRequests').get('agent-1');
  w.assistant.answer(map, 'allowed');
  assert.equal(w.run('tools_nocode_form_edit', EDIT), null, 'the user answered the open card');
});

test('on without a conversation to ask in: refused, the switch named', () => {
  const w = world({ on: true, conversation: '' });
  const answer = w.run('tools_nocode_form_edit', EDIT);
  assert.equal(answer.reason, 'cannot_ask');
  assert.match(answer.message, /Confirmer avant de modifier/);
  assert.equal(w.server.has('lib_ConvertigoAssistant.hostRequests'), false);
});

test('another user\'s choice or card is not this user\'s', () => {
  const w = world();
  w.assistant.choose(true, 'someone@convertigo.com');
  assert.equal(w.run('tools_nocode_form_edit', EDIT), null);
  assert.equal(api.isOn(w.host.server(), 'GregoryV@convertigo.com'), false);
  w.assistant.choose(true);
  assert.equal(api.isOn(w.host.server(), 'GREGORYV@convertigo.com'), true, 'an email in any case');
});

test('the summary of each write names what the user knows', () => {
  const edit = api.summary('tools_nocode_form_edit', { id: FORM._id, operations: [
    { action: 'add_field', pageName: 'Partie', fieldObject: { type: 'text', name: 'pseudo', label: 'Pseudo' } },
    { action: 'add_field', parentFieldId: '17003', fieldObject: { type: 'button', name: 'reset' } },
    { action: 'update_field', fieldName: 'score', patch: { config: { mandatory: true, label: 'Points' } } },
    { action: 'delete_component', fieldId: '17001' },
    { action: 'move_field', fieldName: 'score', pageTechName: 'page1', index: 0 },
    { action: 'add_page', name: 'Résultats' }, { action: 'update_page', pageName: 'Partie', patch: { iconName: 'trophy' } },
    { action: 'delete_page', pageTechName: 'page1' },
    { action: 'add_flow', flowId: 'flow_reset', name: 'Réinitialiser' },
    { action: 'add_flow_element', flowId: 'flow_save', element: { type: 'toast', message: 'OK' } },
    { action: 'remove_flow_element', flowId: 'flow_save', elementId: 'e1' },
    { action: 'set_root', config: {} }
  ] }, FORM);
  assert.equal(edit.formName, 'Skyjo');
  assert.deepEqual(plain(edit.items), [
    { action: 'add_field', target: 'pseudo', label: 'Pseudo', kind: 'text', page: 'Partie' },
    { action: 'add_field', target: 'reset', kind: 'button', page: 'actions' },
    { action: 'update_field', target: 'score', label: 'Score', kind: 'number', keys: ['config.mandatory', 'config.label'] },
    { action: 'remove_field', target: 'button2', label: 'Enregistrer', kind: 'button' },
    { action: 'move_field', target: 'score', label: 'Score', kind: 'number', page: 'Partie' },
    { action: 'add_page', target: 'Résultats' }, { action: 'update_page', target: 'Partie', keys: ['iconName'] },
    { action: 'remove_page', target: 'Partie' },
    { action: 'add_flow', target: 'Réinitialiser' },
    { action: 'add_flow_element', flow: 'Enregistrer le score', kind: 'toast' },
    { action: 'remove_flow_element', flow: 'Enregistrer le score' },
    { action: 'set_root' }
  ]);
  assert.deepEqual(plain(api.summary('tools_nocode_form_update', { id: FORM._id, patch: '{"name":"Skyjo 2","flows":[]}' }, FORM).items),
    [{ action: 'update_form', keys: ['name', 'flows'] }]);
  assert.deepEqual(plain(api.summary('tools_nocode_form_publish', { id: FORM._id, confirm: true, access: 'anonymous' }, FORM).items),
    [{ action: 'publish', target: 'Skyjo', access: 'anonymous' }]);
  const created = api.summary('tools_nocode_form_create', { reduced: { name: 'Congés', pages: [{ name: 'A', fields: [{ type: 'section', name: 's', fields: [{ type: 'text', name: 'a' }] }] }, { name: 'B', fields: [] }] } }, null);
  assert.deepEqual(plain([created.formName, created.items]), ['Congés', [{ action: 'create_form', target: 'Congés', pages: 2, fields: 2 }]]);
  assert.deepEqual(plain(api.summary('tools_nocode_app_create', { spec: '{"name":"Congés","entities":[{"name":"Demande","plural":"Demandes"},{"name":"Salarié"}]}' }, null).items),
    [{ action: 'create_app', target: 'Congés', tables: ['Demandes', 'Salarié'] }]);
  assert.deepEqual(plain(api.summary('tools_nocode_baserow_schema_apply', { mode: 'apply', schema: { baseName: 'RH', tables: [{ name: 'Demandes' }] } }, null).items),
    [{ action: 'apply_schema', target: 'RH', tables: ['Demandes'] }]);
  const many = api.summary('tools_nocode_form_edit', { operations: Array.from({ length: 40 }, () => ({ action: 'remove_field', fieldName: 'x' })) }, FORM).items;
  assert.equal(many.length, 31);
  assert.deepEqual(plain(many[30]), { action: 'more' });
});

test('the router answers instead of the tool only when the call is held', () => {
  const router = fs.readFileSync(path.join(root, 'js/mcp_endpoint_router.js'), 'utf8');
  const start = router.indexOf('      // "Confirmer avant de modifier"');
  const end = router.indexOf('      if (callSequence === targetSequence) {\n        injectMeta(callVariables);', start);
  assert.ok(start > 0 && end > start, 'the hook must be found');
  const hook = router.slice(start, end);
  function route(kind, answer, sequence = 'tools_nocode_form_edit') {
    const calls = [];
    const context = {
      callSequence: sequence, targetSequence: sequence, callVariables: { id: '1', operations: '[]' },
      mcpAuthentication: { kind, user: USER }, managedConversationId: 'agent-1', context: { server: {} },
      include: () => {},
      C8O: { nocodeWriteConfirm: { WRITE_TOOLS: api.WRITE_TOOLS, isOn: () => true, javaHost: () => 'host', run: (...args) => { calls.push(args); if (answer instanceof Error) throw answer; return answer; } } },
      com: { twinsoft: { convertigo: { engine: { Engine: { logEngine: { warn: () => {} } } } } } }
    };
    vm.runInNewContext(hook, context);
    return { context, calls };
  }
  const passed = route('nocode', null);
  assert.equal(passed.context.callSequence, 'tools_nocode_form_edit');
  assert.deepEqual(passed.calls[0].slice(0, 3).map(x => JSON.parse(JSON.stringify(x))), ['tools_nocode_form_edit', { id: '1', operations: '[]' }, { user: USER, conversationId: 'agent-1' }]);
  const held = route('nocode', { status: 'refused', reason: 'user' });
  assert.equal(held.context.callSequence, 'nocode_write_held');
  assert.deepEqual(JSON.parse(held.context.callVariables.answer), { status: 'refused', reason: 'user' });
  assert.equal(route('managed', { status: 'refused' }).calls.length, 0, 'a Studio token is never held');
  const failed = route('nocode', new Error('boom'));
  assert.equal(failed.context.callSequence, 'nocode_write_held', 'a user who asked to confirm never gets an unconfirmed write');
  assert.equal(JSON.parse(failed.context.callVariables.answer).reason, 'confirm_unavailable');
  assert.equal(route('nocode', new Error('boom'), 'tools_nocode_form_get').context.callSequence, 'tools_nocode_form_get');
});

test('the held answer is a sequence of the project, never a listed tool', () => {
  const yaml = fs.readFileSync(path.join(root, '_c8oProject/sequences/nocode_write_held.yaml'), 'utf8');
  assert.match(yaml, /^accessibility: Private/);
  assert.match(yaml, /result = JSON\.parse\(String\(answer\)\)/);
  assert.match(fs.readFileSync(path.join(root, 'c8oProject.yaml'), 'utf8'), /↓nocode_write_held \[sequences\.GenericSequence\]: 🗏 sequences\/nocode_write_held\.yaml/);
  assert.equal(/^tools_/.test('nocode_write_held'), false);
});
