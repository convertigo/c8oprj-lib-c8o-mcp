// Run: node --test tests/scripts/validate_nocode_form_write_job.cjs
// nocode-form-edit, nocode-form-update and nocode-form-create within the time an agent waits for a tool call
// (js/nocode_form_write_job.js). On the 5.6 MB application of the Pilotage KPI import (test-nocode, 23/11) an edit timed out
// on the client side while it went on and saved revision 5: a blind retry would have applied its operations twice; a
// creation retried after a timeout made a second form (19/11). A fake host plays the engine: its clock moves when the
// call sleeps, and the thread of the write runs when the test says the write ends.
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

// host of C8O.nocodeFormWriteJob.run: a write "takes" durationMs of the fake clock; its thread runs once the clock reaches
// its end (inside sleep), or when the test calls finishAll().
function fakeHost(options = {}) {
  const map = new Map();
  const state = { now: 1800000000000, writes: [], threads: [], uuid: 0, forms: 0 };
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
    write: (kind, id, input, opts) => {
      state.writes.push({ kind, id, input: plain(input), opts: plain(opts) });
      if (options.throws) throw new Error(options.throws);
      if (kind === 'create') return { id: 'form-' + (++state.forms), rev: '1-x', status: 'ok', saved: true };
      return { id, rev: (state.writes.length + 4) + '-x', status: 'ok', saved: true };
    }
  };
  function run(thread) { thread.done = true; thread.fn(); }
  return { host, state, map, finishAll: () => state.threads.filter(t => !t.done).forEach(run), elapse: ms => { state.now += ms; } };
}

const job = () => load(['js/nocode_form_write_job.js']).C8O.nocodeFormWriteJob;
const ops = [{ action: 'update_field', fieldName: 'statut', patch: { label: 'Statut' } }];
const reduced = { name: 'Candidature emploi', pages: [{ name: 'Candidat', fields: [{ type: 'text', name: 'nom', label: 'Nom' }] }] };

test('a write that ends within the budget answers its result at once, as before', () => {
  const api = job();
  const f = fakeHost({ durationMs: 5000 });
  const r = plain(api.run({ kind: 'edit', id: '1795432618769', input: ops, owner: 'owner-a', options: { project: 'C8Oforms', token: 't' } }, f.host));
  assert.deepEqual([r.status, r.saved, r.rev], ['ok', true, '5-x']);
  assert.equal(r.editId, undefined, 'a quick write needs no id');
  assert.deepEqual(plain(f.state.writes), [{ kind: 'edit', id: '1795432618769', input: ops, opts: { project: 'C8Oforms', token: 't' } }]);
  const created = plain(api.run({ kind: 'create', input: reduced, owner: 'owner-a' }, f.host));
  assert.deepEqual([created.status, created.id, created.createId], ['ok', 'form-1', undefined]);
  assert.throws(() => api.run({ kind: 'publish', id: 'f1', input: {}, owner: 'owner-a' }, f.host), /Unknown form write/);
});

test('a long edit answers running with its editId within the budget, then the same edit answers its result, applied once', () => {
  const api = job();
  const f = fakeHost({ durationMs: 70000 });
  const started = f.state.now;
  const first = plain(api.run({ kind: 'edit', id: '1795432618769', input: ops, owner: 'owner-a' }, f.host));
  assert.equal(first.status, 'running');
  assert.equal(first.id, '1795432618769');
  assert.match(first.editId, /^edit-\d+-[0-9a-f]{8}$/);
  assert.ok(f.state.now - started <= api.CALL_BUDGET_MS + 250, 'answered within the budget: ' + (f.state.now - started));
  assert.ok(api.CALL_BUDGET_MS <= 40000, 'well under the 60 s an agent host waits');
  assert.match(first.message, /do not send the operations again/);
  assert.equal(first.next, 'Call nocode-form-edit({id:"1795432618769", editId:"' + first.editId + '"}) to wait for its answer, with no operations.');
  assert.equal(first.saved, undefined, 'running says nothing about saved');
  const second = plain(api.run({ kind: 'edit', id: '1795432618769', jobId: first.editId, owner: 'owner-a' }, f.host));
  assert.deepEqual([second.status, second.saved, second.editId], ['ok', true, first.editId]);
  assert.equal(f.state.writes.length, 1, 'applied once');
  const third = plain(api.run({ kind: 'edit', id: '1795432618769', jobId: first.editId, owner: 'owner-a' }, f.host));
  assert.deepEqual([third.status, third.rev], ['ok', '5-x']);
  assert.equal(f.state.writes.length, 1);
});

test('a long update answers running with its updateId, and the patch sent again joins it', () => {
  const api = job();
  const f = fakeHost({ durationMs: 200000 });
  const patch = { name: 'Pilotage KPI', pages: [{ name: 'Accueil' }] };
  const first = plain(api.run({ kind: 'update', id: 'f1', input: patch, owner: 'owner-a' }, f.host));
  assert.deepEqual([first.status, first.id], ['running', 'f1']);
  assert.match(first.updateId, /^update-\d+-[0-9a-f]{8}$/);
  assert.equal(first.editId, undefined);
  assert.equal(first.next, 'Call nocode-form-update({id:"f1", updateId:"' + first.updateId + '"}) to wait for its answer, with no patch.');
  const retry = plain(api.run({ kind: 'update', id: 'f1', input: { pages: [{ name: 'Accueil' }], name: 'Pilotage KPI' }, owner: 'owner-a' }, f.host));
  assert.deepEqual([retry.status, retry.updateId], ['running', first.updateId]);
  assert.match(retry.joined, /^The same patch was already being written \(updateId/);
  f.finishAll();
  const done = plain(api.run({ kind: 'update', id: 'f1', jobId: first.updateId, owner: 'owner-a' }, f.host));
  assert.deepEqual([done.status, done.saved, done.updateId], ['ok', true, first.updateId]);
  assert.equal(f.state.writes.length, 1, 'applied once');
  // an update is not an edit: its id is refused by the edit, and the reverse
  const asEdit = plain(api.run({ kind: 'edit', id: 'f1', jobId: first.updateId, owner: 'owner-a' }, f.host));
  assert.deepEqual([asEdit.status, asEdit.error.code], ['error', 'unknown_write']);
});

test('a long creation answers running with its createId, a blind retry makes no second form, the createId gives the id', () => {
  const api = job();
  const f = fakeHost({ durationMs: 200000 });
  const first = plain(api.run({ kind: 'create', input: reduced, owner: 'owner-a', options: { project: 'C8Oforms', token: 't' } }, f.host));
  assert.equal(first.status, 'running');
  assert.equal(first.id, undefined, 'no form id before the creation ends');
  assert.match(first.createId, /^create-\d+-[0-9a-f]{8}$/);
  assert.match(first.message, /^The creation of this form goes on on the server/);
  assert.match(first.message, /do not send the reduced form again/);
  assert.equal(first.next, 'Call nocode-form-create({createId:"' + first.createId + '"}) to wait for its answer, with no reduced form.');
  // the agent's host timed out and the agent sends the same creation again: it joins
  const retry = plain(api.run({ kind: 'create', input: JSON.parse(JSON.stringify(reduced)), owner: 'owner-a' }, f.host));
  assert.deepEqual([retry.status, retry.createId], ['running', first.createId]);
  assert.match(retry.joined, /instead of writing again/);
  f.finishAll();
  const late = plain(api.run({ kind: 'create', input: reduced, owner: 'owner-a' }, f.host));
  assert.deepEqual([late.status, late.id, late.createId], ['ok', 'form-1', first.createId]);
  assert.match(late.joined, /no second form was created/);
  assert.equal(f.state.writes.length, 1, 'one form');
  assert.equal(f.state.writes[0].kind, 'create');
  assert.deepEqual(f.state.writes[0].opts, { project: 'C8Oforms', token: 't' });
  // another reduced form is another creation
  const other = plain(api.run({ kind: 'create', input: { ...reduced, name: 'Autre' }, owner: 'owner-a' }, f.host));
  assert.notEqual(other.createId, first.createId);
  const unknown = plain(api.run({ kind: 'create', jobId: 'create-1-deadbeef', owner: 'owner-a' }, f.host));
  assert.deepEqual([unknown.status, unknown.error.code, unknown.createId], ['error', 'unknown_write', 'create-1-deadbeef']);
  assert.match(unknown.error.message, /nocode-form-list/);
});

test('the same operations sent again join the running edit, or get the answer that never reached the caller', () => {
  const api = job();
  const f = fakeHost({ durationMs: 200000 });
  const first = plain(api.run({ kind: 'edit', id: 'f1', input: ops, owner: 'owner-a' }, f.host));
  assert.equal(first.status, 'running');
  const retry = plain(api.run({ kind: 'edit', id: 'f1', input: [{ patch: { label: 'Statut' }, fieldName: 'statut', action: 'update_field' }], owner: 'owner-a' }, f.host));
  assert.deepEqual([retry.status, retry.editId], ['running', first.editId]);
  assert.match(retry.joined, /instead of writing again/);
  f.finishAll();
  const late = plain(api.run({ kind: 'edit', id: 'f1', input: ops, owner: 'owner-a' }, f.host));
  assert.deepEqual([late.status, late.saved, late.editId], ['ok', true, first.editId]);
  assert.match(late.joined, /it was not applied again/);
  assert.equal(f.state.writes.length, 1);
  const again = plain(api.run({ kind: 'edit', id: 'f1', input: ops, owner: 'owner-a' }, f.host));
  assert.equal(again.status, 'running');
  assert.notEqual(again.editId, first.editId);
  f.finishAll();
  assert.equal(f.state.writes.length, 2);
  // other operations, another form, another caller or another kind never join
  const other = fakeHost({ durationMs: 200000 });
  const api2 = job();
  const a = plain(api2.run({ kind: 'edit', id: 'f1', input: ops, owner: 'owner-a' }, other.host));
  const b = plain(api2.run({ kind: 'edit', id: 'f2', input: ops, owner: 'owner-a' }, other.host));
  const c = plain(api2.run({ kind: 'edit', id: 'f1', input: ops, owner: 'owner-b' }, other.host));
  const d = plain(api2.run({ kind: 'edit', id: 'f1', input: [{ action: 'remove_field', fieldName: 'statut' }], owner: 'owner-a' }, other.host));
  const e = plain(api2.run({ kind: 'update', id: 'f1', input: ops, owner: 'owner-a' }, other.host));
  assert.equal(new Set([a.editId, b.editId, c.editId, d.editId, e.updateId]).size, 5);
  assert.ok([b, c, d, e].every(x => x.joined === undefined));
});

test('an id of another caller, another form or past its time is refused, with how to check the form', () => {
  const api = job();
  const f = fakeHost({ durationMs: 200000 });
  const first = plain(api.run({ kind: 'edit', id: 'f1', input: ops, owner: 'owner-a' }, f.host));
  for (const [params, why] of [
    [{ kind: 'edit', id: 'f1', jobId: first.editId, owner: 'owner-b' }, 'another caller'],
    [{ kind: 'edit', id: 'f2', jobId: first.editId, owner: 'owner-a' }, 'another form'],
    [{ kind: 'edit', id: 'f1', jobId: 'edit-1-deadbeef', owner: 'owner-a' }, 'unknown']
  ]) {
    const r = plain(api.run(params, f.host));
    assert.deepEqual([r.status, r.error.code], ['error', 'unknown_write'], why);
    assert.match(r.error.message, /nocode-form-get/);
    assert.match(r.error.message, /do not send the operations again before checking/);
  }
  f.finishAll();
  f.elapse(api.KEEP_MS + 1);
  const expired = plain(api.run({ kind: 'edit', id: 'f1', jobId: first.editId, owner: 'owner-a' }, f.host));
  assert.equal(expired.error.code, 'unknown_write');
  assert.equal(f.map.size, 0, 'kept no longer than its time');
});

test('a write that throws in its thread answers an error, never running forever, and never claims nothing was saved', () => {
  for (const kind of ['edit', 'update', 'create']) {
    const api = job();
    const f = fakeHost({ durationMs: 50000, throws: 'C8Oforms unreachable' });
    const idName = api.KINDS[kind].idName;
    const first = plain(api.run({ kind, id: 'f1', input: kind === 'create' ? reduced : ops, owner: 'owner-a' }, f.host));
    assert.equal(first.status, 'running', kind);
    const second = plain(api.run({ kind, id: 'f1', jobId: first[idName], owner: 'owner-a' }, f.host));
    assert.deepEqual([second.status, second.error.code], ['error', kind + '_failed'], kind);
    assert.match(second.error.message, /C8Oforms unreachable/);
    // an exception may come after the save (the read back of a headless 8.5 engine, 23/11): saved is not claimed
    assert.equal(second.saved, undefined, kind);
    assert.match(second.next, kind === 'create' ? /may have been created.*nocode-form-list/ : /may have been saved.*nocode-form-get/);
  }
});

test('the owner of a write is a digest of the bearer, never the bearer itself; an empty argument asks for nothing', () => {
  const sandbox = load([]);
  sandbox.java = {
    security: { MessageDigest: { getInstance: () => ({ digest: bytes => Array.from(require('node:crypto').createHash('sha256').update(Buffer.from(bytes)).digest()).map(b => b > 127 ? b - 256 : b) }) } },
    lang: { String: function (text) { this.getBytes = () => Array.from(Buffer.from(String(text), 'utf8')); } }
  };
  vm.runInContext(read('js/nocode_form_write_job.js'), sandbox, { filename: 'js/nocode_form_write_job.js' });
  const api = sandbox.C8O.nocodeFormWriteJob;
  assert.equal(api.owner('secret-bearer'), require('node:crypto').createHash('sha256').update('secret-bearer').digest('hex'));
  assert.equal(api.owner(''), '');
  assert.deepEqual([null, undefined, '', ' null ', '[]', '{}', [], {}].map(v => api.empty(v)), [true, true, true, true, true, true, true, true]);
  assert.deepEqual(['[{"action":"x"}]', '{"name":"a"}', [{}], { name: 'a' }].map(v => api.empty(v)), [false, false, false, false]);
  assert.deepEqual(['null', 'undefined', ' create-1-ab ', null].map(v => api.jobIdOf(v)), ['', '', 'create-1-ab', '']);
});

test('the C8Oforms and Baserow calls of a write in its thread go through its own request, and outlive the context of the call', () => {
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
  assert.equal(auth.authenticated, true, 'the bearer is read from the request of the write');
  assert.equal(sandbox.C8O.nocodeForms.callerToken({}), 'detached-bearer');
  sandbox.C8O.nocodeBaserow.catalogList({ view: 'compact' });
  assert.ok(requests.length >= 2);
  assert.ok(requests.every(r => r.request === detached), 'every call goes through the request of the write: ' + requests.map(r => r.sequence).join(', '));
  // The engine removes context from the scope when the sequence of the call ends, possibly while a call of the thread
  // runs: "\"context\" n'est pas défini" after the save, on a headless 8.5 engine (23/11).
  sandbox.removeContextDuringCall = true;
  const later = plain(sandbox.C8O.nocodeForms.authentication({ token: 'detached-bearer' }));
  assert.equal(later.authenticated, true);
  assert.equal(typeof sandbox.context, 'undefined', 'the context was removed during the call');
});

test('waiting for a running write writes nothing: "Confirmer avant de modifier" does not hold it', () => {
  const nocode = load(['js/nocode_write_confirm.js']).C8O.nocodeWriteConfirm;
  const cases = [
    ['tools_nocode_form_edit', { id: 'f1', editId: 'edit-1-abcdef12' }, false],
    ['tools_nocode_form_edit', { id: 'f1', editId: 'edit-1-abcdef12', operations: '[]', operation: '' }, false],
    ['tools_nocode_form_edit', { id: 'f1', editId: 'edit-1-abcdef12', operations: [{ action: 'remove_field', fieldName: 'x' }] }, true],
    ['tools_nocode_form_edit', { id: 'f1', editId: 'edit-1-abcdef12', operations: '[{"action":"remove_field"}]' }, true],
    ['tools_nocode_form_edit', { id: 'f1', editId: 'null', operations: '[]' }, true],
    ['tools_nocode_form_edit', { id: 'f1', operations: [{ action: 'add_page', name: 'P' }] }, true],
    ['tools_nocode_form_update', { id: 'f1', updateId: 'update-1-abcdef12' }, false],
    ['tools_nocode_form_update', { id: 'f1', updateId: 'update-1-abcdef12', patch: '{}' }, false],
    ['tools_nocode_form_update', { id: 'f1', updateId: 'update-1-abcdef12', patch: { name: 'x' } }, true],
    ['tools_nocode_form_update', { id: 'f1', patch: { name: 'x' } }, true],
    ['tools_nocode_form_create', { createId: 'create-1-abcdef12' }, false],
    ['tools_nocode_form_create', { createId: 'create-1-abcdef12', reduced: '{}' }, false],
    ['tools_nocode_form_create', { createId: 'create-1-abcdef12', reduced: { name: 'x' } }, true],
    ['tools_nocode_form_create', { reduced: { name: 'x' } }, true],
    ['tools_nocode_form_create', { editId: 'edit-1-abcdef12' }, true]
  ];
  for (const [sequence, args, held] of cases) {
    assert.equal(nocode.holds(sequence, args), held, sequence + ' ' + JSON.stringify(args));
  }
});

test('project-changes records a write once: not its running answer, the answer of the call that waits for it', () => {
  const journal = load(['js/write_journal.js']).C8O.writeJournal;
  assert.equal(journal.entryOf('tools_nocode_form_edit', { status: 'running', id: 'f1', editId: 'edit-1-ab' }, { id: 'f1', operations: '[{"action":"add_field"}]' }, {}), null);
  assert.equal(journal.entryOf('tools_nocode_form_create', { status: 'running', createId: 'create-1-ab' }, { reduced: '{"name":"a"}' }, {}), null);
  const done = plain(journal.entryOf('tools_nocode_form_create', { status: 'ok', saved: true, id: 'f9', createId: 'create-1-ab' }, { createId: 'create-1-ab' }, {}));
  assert.deepEqual(done.objects.map(o => [o.q, o.c]), [['form f9', 'created']]);
});

test('the three tool sequences write through the job, wait up to 300 s and take the id of a running write', () => {
  const overrides = load(['js/schema_overrides.js']).C8O.schemaOverrides;
  for (const [kind, idName, required] of [['edit', 'editId', ['id']], ['update', 'updateId', ['id']], ['create', 'createId', []]]) {
    const yaml = read('_c8oProject/sequences/tools_nocode_form_' + kind + '.yaml');
    assert.match(yaml, /^responseTimeout: 300$/m, kind);
    assert.match(yaml, /include\("js\/nocode_form_write_job\.js"\)/, kind);
    assert.match(yaml, /include\("js\/nocode_baserow\.js"\)/, kind + ': loaded in the call, not from the thread');
    assert.match(yaml, /C8O\.detachedRequest = writeHost\.detachedRequest/, kind);
    assert.match(yaml, new RegExp('writeJob\\.run\\(\\{ kind: "' + kind + '"'), kind);
    assert.match(yaml, /result\.status !== "running" && C8O\.uiReveal/, kind + ': no reveal before the write ends');
    assert.match(yaml, new RegExp('^↓' + idName + ' \\[variables\\.RequestableVariable-\\d+\\]: $', 'm'), kind);
    assert.doesNotMatch(yaml, /^$/m, kind + ': no empty line in the YAML of a Convertigo object');
    const input = plain(overrides.applyInput('tools_nocode_form_' + kind, { type: 'object', properties: {} }));
    assert.equal(input.properties[idName].type, 'string', kind);
    assert.deepEqual(input.required, required, kind + ': the id of a running write is enough');
  }
  const guide = read('resources/convertigo-nocode/errors.md');
  assert.match(guide, /answering `status: running` with a `createId`, `editId` or `updateId`/);
});
