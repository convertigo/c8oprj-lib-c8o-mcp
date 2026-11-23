// Run: node --test tests/scripts/validate_nocode_form_edit_job.cjs
// nocode-form-edit within the time an agent waits for a tool call (js/nocode_form_edit_job.js). On the 5.6 MB application of
// the Pilotage KPI import (test-nocode, 23/11) an edit timed out on the client side while it went on and saved revision 5:
// a blind retry would have applied its operations twice. A fake host plays the engine: its clock moves when the call
// sleeps, and the thread of the edit runs when the test says the edit ends.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function load(files) {
  const sandbox = { C8O: {} };
  sandbox.include = file => vm.runInContext(read(file), sandbox, { filename: file });
  vm.createContext(sandbox);
  files.forEach(file => vm.runInContext(read(file), sandbox, { filename: file }));
  return sandbox;
}

// host of C8O.nocodeFormEditJob.run: the edit "takes" durationMs of the fake clock; the thread runs once the clock
// reaches its end (inside sleep), or when the test calls finishAll().
function fakeHost(options = {}) {
  const map = new Map();
  const state = { now: 1800000000000, edits: [], threads: [], uuid: 0 };
  const host = {
    store: () => ({ get: k => map.has(k) ? map.get(k) : null, put: (k, v) => map.set(k, v), remove: k => map.delete(k), keys: () => Array.from(map.keys()) }),
    now: () => state.now,
    sleep: ms => {
      state.now += ms;
      state.threads.filter(t => !t.done && state.now >= t.endsAt).forEach(run);
    },
    uuid: () => '00000000-0000-0000-0000-' + String(++state.uuid).padStart(12, '0'),
    startThread: (name, fn) => {
      state.threads.push({ name, fn, endsAt: state.now + (options.durationMs ?? 1000), done: false });
    },
    edit: (id, operations, opts) => {
      state.edits.push({ id, operations: plain(operations), opts: plain(opts) });
      if (options.throws) throw new Error(options.throws);
      return { id, rev: (state.edits.length + 4) + '-x', status: 'ok', saved: true, operations: operations.map(op => op.action) };
    }
  };
  function run(thread) { thread.done = true; thread.fn(); }
  return { host, state, map, finishAll: () => state.threads.filter(t => !t.done).forEach(run), elapse: ms => { state.now += ms; } };
}

const job = () => load(['js/nocode_form_edit_job.js']).C8O.nocodeFormEditJob;
const ops = [{ action: 'update_field', fieldName: 'statut', patch: { label: 'Statut' } }];

test('an edit that ends within the budget answers its result at once, as before', () => {
  const api = job();
  const f = fakeHost({ durationMs: 5000 });
  const r = plain(api.run({ id: '1795432618769', operations: ops, owner: 'owner-a', options: { project: 'C8Oforms', token: 't' } }, f.host));
  assert.deepEqual([r.status, r.saved, r.rev], ['ok', true, '5-x']);
  assert.equal(r.editId, undefined, 'a quick edit needs no editId');
  assert.equal(f.state.edits.length, 1);
  assert.deepEqual(f.state.edits[0].opts, { project: 'C8Oforms', token: 't' }, 'the options reach the edit');
});

test('a long edit answers running with its editId within the budget, then the same edit answers its result, applied once', () => {
  const api = job();
  const f = fakeHost({ durationMs: 70000 });
  const started = f.state.now;
  const first = plain(api.run({ id: '1795432618769', operations: ops, owner: 'owner-a' }, f.host));
  assert.equal(first.status, 'running');
  assert.equal(first.id, '1795432618769');
  assert.match(first.editId, /^edit-\d+-[0-9a-f]{8}$/);
  assert.ok(f.state.now - started <= api.CALL_BUDGET_MS + 250, 'answered within the budget: ' + (f.state.now - started));
  assert.ok(api.CALL_BUDGET_MS <= 40000, 'well under the 60 s an agent host waits');
  assert.match(first.message, /do not send them again/);
  assert.match(first.next, new RegExp('editId:"' + first.editId + '"'));
  assert.equal(first.saved, undefined, 'running says nothing about saved');
  // the agent waits with the editId alone: the edit ends during that call
  const second = plain(api.run({ id: '1795432618769', editId: first.editId, operations: [], owner: 'owner-a' }, f.host));
  assert.deepEqual([second.status, second.saved, second.editId], ['ok', true, first.editId]);
  assert.equal(f.state.edits.length, 1, 'applied once');
  // asked again, it answers the same result without applying anything
  const third = plain(api.run({ id: '1795432618769', editId: first.editId, owner: 'owner-a' }, f.host));
  assert.deepEqual([third.status, third.rev], ['ok', '5-x']);
  assert.equal(f.state.edits.length, 1);
});

test('the same operations sent again join the running edit, or get the answer that never reached the caller', () => {
  const api = job();
  const f = fakeHost({ durationMs: 200000 });
  const first = plain(api.run({ id: 'f1', operations: ops, owner: 'owner-a' }, f.host));
  assert.equal(first.status, 'running');
  // a blind retry (same operations, keys in another order) while it runs: it joins
  const retry = plain(api.run({ id: 'f1', operations: [{ patch: { label: 'Statut' }, fieldName: 'statut', action: 'update_field' }], owner: 'owner-a' }, f.host));
  assert.deepEqual([retry.status, retry.editId], ['running', first.editId]);
  assert.match(retry.joined, /instead of applying them again/);
  f.finishAll();
  // the edit ended, nobody got its answer: the same operations get it, not a second write
  const late = plain(api.run({ id: 'f1', operations: ops, owner: 'owner-a' }, f.host));
  assert.deepEqual([late.status, late.saved, late.editId], ['ok', true, first.editId]);
  assert.match(late.joined, /were not applied again/);
  assert.equal(f.state.edits.length, 1);
  // once its answer was given, the same operations are a new edit
  const again = plain(api.run({ id: 'f1', operations: ops, owner: 'owner-a' }, f.host));
  assert.equal(again.status, 'running');
  assert.notEqual(again.editId, first.editId);
  f.finishAll();
  assert.equal(f.state.edits.length, 2);
  // other operations, another form or another caller never join
  const other = fakeHost({ durationMs: 200000 });
  const api2 = job();
  const a = plain(api2.run({ id: 'f1', operations: ops, owner: 'owner-a' }, other.host));
  const b = plain(api2.run({ id: 'f2', operations: ops, owner: 'owner-a' }, other.host));
  const c = plain(api2.run({ id: 'f1', operations: ops, owner: 'owner-b' }, other.host));
  const d = plain(api2.run({ id: 'f1', operations: [{ action: 'remove_field', fieldName: 'statut' }], owner: 'owner-a' }, other.host));
  assert.equal(new Set([a.editId, b.editId, c.editId, d.editId]).size, 4);
  assert.ok([b, c, d].every(x => x.joined === undefined));
});

test('an editId of another caller, another form or past its time is refused, with how to check the form', () => {
  const api = job();
  const f = fakeHost({ durationMs: 200000 });
  const first = plain(api.run({ id: 'f1', operations: ops, owner: 'owner-a' }, f.host));
  for (const [params, why] of [
    [{ id: 'f1', editId: first.editId, owner: 'owner-b' }, 'another caller'],
    [{ id: 'f2', editId: first.editId, owner: 'owner-a' }, 'another form'],
    [{ id: 'f1', editId: 'edit-1-deadbeef', owner: 'owner-a' }, 'unknown']
  ]) {
    const r = plain(api.run(params, f.host));
    assert.deepEqual([r.status, r.error.code], ['error', 'unknown_edit'], why);
    assert.match(r.error.message, /nocode-form-get/);
    assert.match(r.error.message, /do not send the operations again before checking/);
  }
  f.finishAll();
  f.elapse(api.EDIT_KEEP_MS + 1);
  const expired = plain(api.run({ id: 'f1', editId: first.editId, owner: 'owner-a' }, f.host));
  assert.equal(expired.error.code, 'unknown_edit');
  assert.equal(f.map.size, 0, 'kept no longer than its time');
});

test('an edit that throws in its thread answers an error, never running forever', () => {
  const api = job();
  const f = fakeHost({ durationMs: 50000, throws: 'C8Oforms unreachable' });
  const first = plain(api.run({ id: 'f1', operations: ops, owner: 'owner-a' }, f.host));
  assert.equal(first.status, 'running');
  const second = plain(api.run({ id: 'f1', editId: first.editId, owner: 'owner-a' }, f.host));
  assert.deepEqual([second.status, second.error.code], ['error', 'edit_failed']);
  assert.match(second.error.message, /C8Oforms unreachable/);
  // an exception may come after the save (the read back of a headless 8.5 engine, 23/11): saved is not claimed
  assert.equal(second.saved, undefined);
  assert.match(second.next, /may have been saved/);
});

test('the owner of an edit is a digest of the bearer, never the bearer itself', () => {
  const sandbox = load([]);
  sandbox.java = {
    security: { MessageDigest: { getInstance: () => ({ digest: bytes => Array.from(require('node:crypto').createHash('sha256').update(Buffer.from(bytes)).digest()).map(b => b > 127 ? b - 256 : b) }) } },
    lang: { String: function (text) { this.getBytes = () => Array.from(Buffer.from(String(text), 'utf8')); } }
  };
  vm.runInContext(read('js/nocode_form_edit_job.js'), sandbox, { filename: 'js/nocode_form_edit_job.js' });
  const owner = sandbox.C8O.nocodeFormEditJob.owner('secret-bearer');
  assert.equal(owner, require('node:crypto').createHash('sha256').update('secret-bearer').digest('hex'));
  assert.equal(sandbox.C8O.nocodeFormEditJob.owner(''), '');
});

test('the C8Oforms and Baserow calls of an edit in its thread go through its own request, and outlive the context of the call', () => {
  const requests = [];
  const empty = new Proxy(function () {}, { get: (_, key) => key === Symbol.toPrimitive ? () => '' : empty });
  class HashMap { constructor() { this.values = {}; } put(key, value) { this.values[key] = value; } }
  class InternalRequester {
    constructor(params, request) { this.params = params.values; requests.push({ sequence: this.params.__sequence, request }); }
    processRequest() {
      const sequence = this.params.__sequence;
      if (sandbox.removeContextDuringCall) delete sandbox.context;
      if (sequence === 'nocode_validate_token') return { getDocumentElement: () => ({ document: { result: { authenticated: this.params.token === 'detached-bearer', user: 'u' } } }) };
      return { getDocumentElement: () => ({ document: {} }) };
    }
    getContext() { return {}; }
  }
  const packages = new Proxy(empty, { get: (_, key) => {
    if (key === 'java') return { util: { HashMap }, io: { File: class {} } };
    if (key === 'com') return { twinsoft: { convertigo: { engine: { Engine: { theApp: { contextManager: { remove() {} } } }, requesters: { InternalRequester, InternalHttpServletRequest: class { constructor() { this.fresh = true; } } }, util: { XMLUtils: { XmlToJson: response => JSON.stringify(response) } }, enums: empty } } } };
    return empty;
  } });
  const recycled = { getHeader: () => { throw new Error('the request of the call is recycled'); } };
  const detached = { getHeader: name => name === 'Authorization' ? 'Bearer detached-bearer' : null };
  const sandbox = {
    Packages: packages,
    java: { util: { UUID: { randomUUID: () => 'u' } }, lang: { String, reflect: { Array: { newInstance: () => [] } } } },
    context: { httpServletRequest: recycled, logParameters: 'p' },
    org: { apache: { log4j: { MDC: { put() {} } } } }
  };
  vm.createContext(sandbox);
  vm.runInContext(read('js/nocode_forms.js'), sandbox, { filename: 'js/nocode_forms.js' });
  vm.runInContext(read('js/nocode_baserow.js'), sandbox, { filename: 'js/nocode_baserow.js' });
  sandbox.C8O.detachedRequest = detached;
  const auth = plain(sandbox.C8O.nocodeForms.authentication({}));
  assert.equal(auth.authenticated, true, 'the bearer is read from the detached copy');
  assert.equal(sandbox.C8O.nocodeForms.callerToken({}), 'detached-bearer');
  sandbox.C8O.nocodeBaserow.catalogList({ view: 'compact' });
  assert.ok(requests.length >= 2);
  assert.ok(requests.every(r => r.request === detached), 'every call goes through the request of the edit: ' + requests.map(r => r.sequence).join(', '));
  // The engine removes context from the scope when the sequence of the call ends, possibly while a call of the thread
  // runs: "\"context\" n'est pas défini" after the save, on a headless 8.5 engine (23/11).
  sandbox.removeContextDuringCall = true;
  const later = plain(sandbox.C8O.nocodeForms.authentication({ token: 'detached-bearer' }));
  assert.equal(later.authenticated, true);
  assert.equal(typeof sandbox.context, 'undefined', 'the context was removed during the call');
});

test('waiting for a running edit writes nothing: "Confirmer avant de modifier" does not hold it', () => {
  const nocode = load(['js/nocode_write_confirm.js']).C8O.nocodeWriteConfirm;
  assert.equal(nocode.holds('tools_nocode_form_edit', { id: 'f1', editId: 'edit-1-abcdef12' }), false);
  assert.equal(nocode.holds('tools_nocode_form_edit', { id: 'f1', editId: 'edit-1-abcdef12', operations: '[]', operation: '' }), false);
  assert.equal(nocode.holds('tools_nocode_form_edit', { id: 'f1', editId: 'edit-1-abcdef12', operations: [{ action: 'remove_field', fieldName: 'x' }] }), true, 'operations are a write');
  assert.equal(nocode.holds('tools_nocode_form_edit', { id: 'f1', editId: 'edit-1-abcdef12', operations: '[{"action":"remove_field"}]' }), true);
  assert.equal(nocode.holds('tools_nocode_form_edit', { id: 'f1', editId: 'null', operations: '[]' }), true);
  assert.equal(nocode.holds('tools_nocode_form_edit', { id: 'f1', operations: [{ action: 'add_page', name: 'P' }] }), true);
});

test('the tool sequence runs the edit through the job, waits up to 300 s and takes editId', () => {
  const yaml = read('_c8oProject/sequences/tools_nocode_form_edit.yaml');
  assert.match(yaml, /^responseTimeout: 300$/m);
  assert.match(yaml, /include\("js\/nocode_form_edit_job\.js"\)/);
  assert.match(yaml, /include\("js\/nocode_baserow\.js"\)/, 'loaded in the call, not from the thread');
  assert.match(yaml, /C8O\.detachedRequest = editHost\.detachedRequest/);
  assert.match(yaml, /C8O\.nocodeFormEditJob\.run\(/);
  assert.match(yaml, /^↓editId \[variables\.RequestableVariable-\d+\]: $/m);
  assert.doesNotMatch(yaml, /^$/m, 'no empty line in the YAML of a Convertigo object');
  const overrides = load(['js/schema_overrides.js']).C8O.schemaOverrides;
  const input = plain(overrides.applyInput ? overrides.applyInput('tools_nocode_form_edit', { type: 'object', properties: {} }) : null);
  if (input) {
    assert.equal(input.properties.editId.type, 'string');
    assert.deepEqual(input.required, ['id']);
  }
  const guide = read('resources/convertigo-nocode/errors.md');
  assert.match(guide, /`nocode-form-edit` answering `status: running` with an `editId`/);
});
