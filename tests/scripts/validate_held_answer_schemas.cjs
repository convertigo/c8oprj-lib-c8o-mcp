// Run: node --test tests/scripts/validate_held_answer_schemas.cjs
// "Confirmer avant de modifier" and "Lecture seule" of the Tigo panel (js/studio_write_confirm.js, js/nocode_write_confirm.js)
// answer a held write in place of the tool: awaiting_confirmation after the 40 s wait, refused, or an error for a batch
// whose file cannot be read. Vibe and the MCP SDKs check every answer against the tool's output schema. The closed
// schemas of batch-call and tree-apply did not declare requestId, secondsLeft, tool, reason or writes, so the answer
// failed as mcp_transport_failed around 42-45 s (TigoAccess 478da587 x29, e1b3b113 x10, 17/11). Each write tool's schema,
// as tools/list answers it, must accept every held answer the confirm code builds.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const sandbox = { C8O: {} };
sandbox.include = file => vm.runInContext(read(file), sandbox, { filename: file });
vm.createContext(sandbox);
vm.runInContext(read('js/schema_overrides.js'), sandbox, { filename: 'js/schema_overrides.js' });
vm.runInContext(read('js/nocode_write_confirm.js'), sandbox, { filename: 'js/nocode_write_confirm.js' });
vm.runInContext(read('js/studio_write_confirm.js'), sandbox, { filename: 'js/studio_write_confirm.js' });
const overrides = sandbox.C8O.schemaOverrides;
const studio = sandbox.C8O.studioWriteConfirm;
const nocode = sandbox.C8O.nocodeWriteConfirm;
const plain = value => JSON.parse(JSON.stringify(value));

// The output schema as tools/list answers it (_c8oProject/sequences/internal_json_schema.yaml BuildModels): the
// derived schema, the overrides, the decoration, then no root required.
function listed(sequence, derived = { type: 'object', properties: {} }) {
  const schema = plain(overrides.decorateOutput(sequence, overrides.applyOutput(sequence, plain(derived), null), null, null));
  delete schema.required;
  return schema;
}

// The JSON Schema rules an MCP client applies to a structured answer (the keywords these schemas use).
function errors(schema, value, at = '$') {
  if (schema === true || schema === undefined) return [];
  if (schema === false) return [`${at}: no value allowed`];
  const out = [];
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const ok = types.some(t => (t === 'null' && value === null) || (t === 'string' && typeof value === 'string')
      || (t === 'boolean' && typeof value === 'boolean') || (t === 'number' && typeof value === 'number')
      || (t === 'integer' && Number.isInteger(value)) || (t === 'array' && Array.isArray(value))
      || (t === 'object' && value !== null && typeof value === 'object' && !Array.isArray(value)));
    if (!ok) return [`${at}: ${JSON.stringify(value)} is not of type ${JSON.stringify(schema.type)}`];
  }
  if (Array.isArray(schema.enum) && !schema.enum.some(e => JSON.stringify(e) === JSON.stringify(value))) {
    out.push(`${at}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
  }
  if (schema.const !== undefined && JSON.stringify(schema.const) !== JSON.stringify(value)) {
    out.push(`${at}: ${JSON.stringify(value)} is not ${JSON.stringify(schema.const)}`);
  }
  for (const key of ['anyOf', 'oneOf']) {
    if (Array.isArray(schema[key])) {
      const passing = schema[key].filter(s => !errors(s, value, at).length).length;
      if (key === 'anyOf' ? passing === 0 : passing !== 1) out.push(`${at}: ${key} not satisfied`);
    }
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const name of schema.required || []) {
      if (!(name in value)) out.push(`${at}: ${name} is required`);
    }
    for (const [name, field] of Object.entries(value)) {
      if (schema.properties && name in schema.properties) {
        out.push(...errors(schema.properties[name], field, `${at}.${name}`));
      } else if (schema.additionalProperties === false) {
        out.push(`${at}: ${name} is not allowed`);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        out.push(...errors(schema.additionalProperties, field, `${at}.${name}`));
      }
    }
  }
  if (Array.isArray(value) && schema.items && typeof schema.items === 'object') {
    value.forEach((item, i) => out.push(...errors(schema.items, item, `${at}[${i}]`)));
  }
  return out;
}

class FakeMap {
  constructor() { this.m = new Map(); }
  get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  put(k, v) { this.m.set(k, v); }
  remove(k, v) { if (v !== undefined && this.m.get(k) !== v) return false; return this.m.delete(k); }
  putIfAbsent(k, v) { if (!this.m.has(k)) this.m.set(k, v); return null; }
  replace(k, before, after) { if (this.m.get(k) !== before) return false; this.m.set(k, after); return true; }
  keySet() { const keys = [...this.m.keys()]; return { toArray: () => keys }; }
}

// The Studio panel played by a fake clock: the user chose a mode and never answers the card.
function studioWorld(mode, play) {
  const server = new Map();
  const clock = { now: 1794000000000 };
  let ids = 0;
  const host = {
    server: () => ({ get: k => server.has(k) ? server.get(k) : null, set: (k, v) => server.set(k, v) }),
    newMap: () => new FakeMap(),
    getForm: () => null,
    now: () => clock.now,
    sleep: ms => {
      const conversations = server.get('lib_ConvertigoAssistant.hostRequests');
      if (play) play(conversations ? conversations.get('agent-1') : null);
      clock.now += ms;
    },
    uuid: () => 'u' + (++ids),
    subagentRun: () => null,
    readCallsFile: () => ({ error: 'not a .json file of at most 10 MB' })
  };
  const store = new FakeMap();
  store.put('user:studio', JSON.stringify({ on: mode !== 'off', mode, at: clock.now }));
  server.set('lib_ConvertigoAssistant.writeConfirm', store);
  return { host, run: (sequence, args) => studio.run(sequence, args, { conversationId: 'agent-1', subagentRun: '' }, host) };
}

function refuseCard(map) {
  if (!map) return;
  for (const [id, json] of map.m) {
    const request = JSON.parse(json);
    if (request.kind === 'write-confirm' && (request.status === 'pending' || request.status === 'taken')) {
      map.replace(id, json, JSON.stringify(Object.assign({}, request, { status: 'refused', decidedAt: 1 })));
    }
  }
}

// Arguments that make each write tool write (js/studio_write_confirm.js writesOf).
const WRITE_ARGS = {
  tools_batch_call: { calls: [
    { tool: 'databaseobject-tree-get', arguments: { qname: 'App' } },
    { tool: 'databaseobject-rename', arguments: { qname: 'App.sq:List', name: 'ListAll' } },
    { tool: 'databaseobject-tree-apply', arguments: { target: 'App.sq:ListAll', tree: { className: 'SimpleStep', name: 'Log' } } }
  ] },
  tools_requestable_execute: { requestable: 'lib_ConvertigoMCP.tools_databaseobject_delete', variables: { qname: 'App.sq:List' } },
  tools_subagent_run: { profile: 'constructor', task: 'Build', inputs: { project: 'App' } },
  tools_nocode_form_edit: { id: '1', operations: [] },
  tools_nocode_form_publish: { id: '1', confirm: 'true' }
};
const GENERIC_ARGS = { project: 'App', qname: 'App.sq:List', target: 'App.sq:List', name: 'Other', tree: { className: 'SimpleStep', name: 'Log' },
  filename: 'js/util.js', content: 'x', id: '1', operations: [], mode: 'apply', form: {}, tables: [] };
const argsOf = sequence => plain(WRITE_ARGS[sequence] || GENERIC_ARGS);

// The answer the router builds itself when the confirmation code fails (js/mcp_endpoint_router.js), as written there.
function routerAnswers() {
  const router = read('js/mcp_endpoint_router.js');
  const literals = [...router.matchAll(/Answer = (\{ status: "refused", saved: false, reason: "confirm_unavailable"[^\n]*\});/g)].map(m => m[1]);
  assert.ok(literals.length >= 2, 'the No Code and Studio fallbacks of the router');
  return literals.map(literal => vm.runInNewContext('(' + literal + ')'));
}

test('the held tools of the schemas are the writes the confirm code holds, No Code included', () => {
  const held = Object.keys(overrides.HELD_WRITE_TOOLS).sort();
  assert.deepEqual(held, Object.keys(studio.WRITE_TOOLS).sort(), 'js/schema_overrides.js HELD_WRITE_TOOLS = WRITE_TOOLS of js/studio_write_confirm.js');
  for (const sequence of Object.keys(nocode.WRITE_TOOLS)) {
    assert.ok(overrides.HELD_WRITE_TOOLS[sequence], sequence);
  }
});

test('every write tool accepts the answers of read-only, of a refused card, of the 40 s wait and of the router', () => {
  const problems = [];
  const fallbacks = routerAnswers();
  for (const sequence of Object.keys(studio.WRITE_TOOLS)) {
    const schema = listed(sequence);
    const answers = [];
    assert.ok(studio.writesOf(sequence, argsOf(sequence)).length, sequence + ': the test arguments are a write');
    answers.push(['read-only', plain(studioWorld('readonly').run(sequence, argsOf(sequence)))]);
    answers.push(['refused by the user', plain(studioWorld('confirm', refuseCard).run(sequence, argsOf(sequence)))]);
    answers.push(['awaiting confirmation', plain(studioWorld('confirm').run(sequence, argsOf(sequence)))]);
    fallbacks.forEach((answer, i) => answers.push(['router fallback ' + i, answer]));
    for (const [kind, answer] of answers) {
      assert.ok(answer && answer.saved === false, `${sequence} ${kind}: a held answer`);
      for (const problem of errors(schema, answer)) problems.push(`${sequence} (${kind}) ${problem}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('the answers really carry the fields that were refused: wait, card, batch writes', () => {
  const awaiting = plain(studioWorld('confirm').run('tools_databaseobject_tree_apply', argsOf('tools_databaseobject_tree_apply')));
  assert.equal(awaiting.status, 'awaiting_confirmation');
  assert.equal(awaiting.tool, 'databaseobject-tree-apply');
  assert.ok(awaiting.requestId && Number.isInteger(awaiting.secondsLeft));
  const batch = plain(studioWorld('readonly').run('tools_batch_call', argsOf('tools_batch_call')));
  assert.deepEqual(batch.writes, ['databaseobject-rename', 'databaseobject-tree-apply']);
  assert.deepEqual(errors(listed('tools_batch_call'), batch), []);
  // a batch whose file cannot be read, in confirm mode
  const unreadable = plain(studio.inlineCallsFile({ callsFile: 'calls.json' }, studioWorld('confirm').host));
  assert.equal(unreadable.status, 'error');
  assert.deepEqual(errors(listed('tools_batch_call'), unreadable), []);
});

test('the No Code wait answers what each No Code write tool declares', () => {
  const server = new Map();
  const clock = { now: 1794000000000 };
  const store = new FakeMap();
  server.set('lib_ConvertigoAssistant.writeConfirm', store);
  const host = {
    server: () => ({ get: k => server.has(k) ? server.get(k) : null, set: (k, v) => server.set(k, v) }),
    newMap: () => new FakeMap(), getForm: () => null, now: () => clock.now,
    sleep: ms => { clock.now += ms; }, uuid: () => 'n' + clock.now
  };
  const problems = [];
  let checked = 0;
  for (const sequence of Object.keys(nocode.WRITE_TOOLS)) {
    store.put('user:alice', JSON.stringify({ on: true, at: clock.now }));
    const args = argsOf(sequence);
    if (!nocode.holds(sequence, args)) continue;
    const answer = plain(nocode.run(sequence, args, { user: 'alice', conversationId: 'conv-1' }, host));
    assert.equal(answer && answer.status, 'awaiting_confirmation', sequence);
    checked++;
    for (const problem of errors(listed(sequence), answer)) problems.push(`${sequence} ${problem}`);
  }
  assert.ok(checked >= 4, 'the No Code writes were held');
  assert.deepEqual(problems, []);
});

test('a declared field keeps its own type and values and admits the held ones', () => {
  // A schema derived from a sample (a tool without override) that disagrees with the held answer on every field.
  const derived = {
    type: 'object', additionalProperties: false,
    properties: {
      status: { type: 'string', enum: ['done'] }, saved: { type: 'string' }, tool: { type: 'object', properties: {} },
      reason: { type: 'string', enum: ['quota'] }, secondsLeft: { type: 'number' }, writes: { type: 'array', items: { type: 'object' } },
      message: { anyOf: [{ type: 'object' }, { type: 'null' }] }
    }
  };
  const schema = listed('tools_project_save', derived);
  assert.deepEqual(schema.properties.status.enum, ['done', 'awaiting_confirmation', 'refused', 'error']);
  assert.deepEqual(schema.properties.saved.type, ['string', 'boolean']);
  for (const answer of [
    { status: 'refused', saved: false, reason: 'read_only', tool: 'project-save', message: 'm', writes: ['project-save'] },
    { status: 'awaiting_confirmation', saved: false, tool: 'project-save', requestId: 'r', secondsLeft: 260, message: 'm' },
    { status: 'done', saved: 'yes', tool: {}, reason: 'quota', secondsLeft: 1.5, writes: [{}], message: null }
  ]) {
    assert.deepEqual(errors(schema, answer), []);
  }
  // what the tool itself answers is still checked
  assert.ok(errors(schema, { status: 'other' }).length);
  assert.ok(errors(schema, { unknownField: 1 }).length);
});

test('a read tool declares none of the held fields: its declaration costs no more', () => {
  for (const sequence of ['tools_project_list', 'tools_databaseobject_tree_get', 'tools_nocode_form_get']) {
    const schema = listed(sequence);
    for (const name of ['requestId', 'secondsLeft', 'writes']) {
      assert.equal(schema.properties && schema.properties[name], undefined, `${sequence} ${name}`);
    }
  }
});
