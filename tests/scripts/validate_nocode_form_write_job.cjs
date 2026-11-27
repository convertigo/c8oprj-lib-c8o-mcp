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
      if (options.refused) return { status: 'error', saved: false, error: { code: 'invalid_form', message: 'refused' } };
      if (kind === 'create' || kind === 'app') return { id: 'form-' + (++state.forms), rev: '1-x', status: 'ok', saved: true, validation: { valid: true, warnings: [] } };
      if (kind === 'schema') return { status: 'ok', created: { rows: 3 } };
      if (kind === 'publish') return { status: 'ok', published: true, id, version: '2', link: opts && opts.linkRoot ? opts.linkRoot + '/projects/C8Oforms/DisplayObjects/pwas/x/index.html' : null };
      return { id, rev: (state.writes.length + 4) + '-x', status: 'ok', saved: true };
    }
  };
  // what C8Oforms holds of the forms made (javaHost.current): {id: rev}, a form deleted is absent; options.unchecked
  // plays a check that fails
  state.held = {};
  host.current = (kind, answer) => {
    state.checks = (state.checks || 0) + 1;
    if (options.unchecked) return null;
    const id = String(answer.id);
    return id in state.held ? { exists: true, rev: state.held[id] } : { exists: false };
  };
  const write = host.write;
  host.write = (...args) => {
    const answer = write(...args);
    if (answer && answer.saved === true && answer.id && (args[0] === 'create' || args[0] === 'app')) state.held[answer.id] = answer.rev;
    return answer;
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
  assert.throws(() => api.run({ kind: 'delete', id: 'f1', input: {}, owner: 'owner-a' }, f.host), /Unknown form write/);
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
  assert.match(retry.joined, /^The same update was already running \(updateId/);
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
  assert.match(first.message, /^The creation goes on on the server/);
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
    ['tools_nocode_form_create', { editId: 'edit-1-abcdef12' }, true],
    ['tools_nocode_app_create', { createId: 'app-1-abcdef12' }, false],
    ['tools_nocode_app_create', { createId: 'app-1-abcdef12', spec: { name: 'x' } }, true],
    ['tools_nocode_app_create', { spec: { name: 'x' } }, true],
    ['tools_nocode_baserow_schema_apply', { applyId: 'schema-1-abcdef12', mode: 'apply' }, false],
    ['tools_nocode_baserow_schema_apply', { applyId: 'schema-1-abcdef12', mode: 'apply', schema: { tables: [] } }, true],
    ['tools_nocode_baserow_schema_apply', { mode: 'apply', schema: { tables: [] } }, true],
    ['tools_nocode_form_publish', { id: 'f1', rev: '7-x', confirm: true, publishId: 'publish-1-abcdef12' }, false],
    ['tools_nocode_form_publish', { id: 'f1', rev: '7-x', confirm: true }, true]
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

test('an application, a schema apply and a publication answer running with their own id, and a retry joins them', () => {
  const api = job();
  const f = fakeHost({ durationMs: 200000 });
  const spec = { name: 'Suivi des visites', entities: [{ name: 'visite', fields: [{ name: 'Date', type: 'date' }] }] };
  const app = plain(api.run({ kind: 'app', input: spec, owner: 'owner-a', options: { project: 'C8Oforms', token: 't' } }, f.host));
  assert.deepEqual([app.status, app.id], ['running', undefined]);
  assert.match(app.createId, /^app-\d+-[0-9a-f]{8}$/);
  assert.equal(app.next, 'Call nocode-app-create({createId:"' + app.createId + '"}) to wait for its answer, with no spec.');
  const appRetry = plain(api.run({ kind: 'app', input: JSON.parse(JSON.stringify(spec)), owner: 'owner-a' }, f.host));
  assert.equal(appRetry.createId, app.createId);
  assert.match(appRetry.joined, /^The same creation of the application was already running/);
  // a createId of an application is not one of a form, and the reverse
  assert.equal(plain(api.run({ kind: 'create', jobId: app.createId, owner: 'owner-a' }, f.host)).error.code, 'unknown_write');
  const input = { mode: 'apply', schema: { baseId: 20, tables: [{ id: 30, name: 'Deals', sampleRows: [{ Name: 'a' }] }] }, create: {}, readBack: 'true', view: 'compact' };
  const schema = plain(api.run({ kind: 'schema', input, owner: 'owner-a', options: { token: 't' } }, f.host));
  assert.match(schema.applyId, /^schema-\d+-[0-9a-f]{8}$/);
  assert.equal(schema.next, 'Call nocode-baserow-schema-apply({applyId:"' + schema.applyId + '"}) to wait for its answer, with no schema.');
  const publish = plain(api.run({ kind: 'publish', id: 'f1', input: { rev: '7-x', confirm: 'true', access: '' }, owner: 'owner-a', options: { project: 'C8Oforms', token: 't', linkRoot: 'https://test.example.invalid/convertigo' } }, f.host));
  assert.deepEqual([publish.status, publish.id], ['running', 'f1']);
  assert.match(publish.message, /do not publish it again/);
  assert.equal(publish.next, 'Call nocode-form-publish({id:"f1", rev:"7-x", confirm:true, publishId:"' + publish.publishId + '"}) to wait for its answer: with the publishId it waits and never publishes again.');
  f.finishAll();
  assert.deepEqual(f.state.writes.map(w => w.kind), ['app', 'schema', 'publish'], 'each written once');
  assert.deepEqual(f.state.writes[1].opts, { token: 't' });
  assert.deepEqual(f.state.writes[1].input, input, 'the apply gets the schema as given');
  const published = plain(api.run({ kind: 'publish', id: 'f1', jobId: publish.publishId, owner: 'owner-a' }, f.host));
  assert.deepEqual([published.status, published.published, published.publishId], ['ok', true, publish.publishId]);
  assert.equal(published.link, 'https://test.example.invalid/convertigo/projects/C8Oforms/DisplayObjects/pwas/x/index.html', 'the link root of the call reaches the thread');
  const applied = plain(api.run({ kind: 'schema', jobId: schema.applyId, owner: 'owner-a' }, f.host));
  assert.deepEqual([applied.status, applied.applyId], ['ok', schema.applyId]);
  // an exception in the thread keeps the code each tool answered
  for (const [kind, code, check] of [['app', 'app_create_failed', /nocode-baserow-catalog-list/], ['schema', 'baserow_schema_apply_failed', /nocode-baserow-catalog-list/], ['publish', 'publish_failed', /nocode-form-get/]]) {
    const g = fakeHost({ durationMs: 50000, throws: 'boom' });
    const a2 = job();
    const started = plain(a2.run({ kind, id: 'f1', input: { x: 1 }, owner: 'owner-a' }, g.host));
    const done = plain(a2.run({ kind, id: 'f1', jobId: started[a2.KINDS[kind].idName], owner: 'owner-a' }, g.host));
    assert.deepEqual([done.status, done.error.code, done.saved], ['error', code, undefined], kind);
    assert.match(done.next, check, kind);
  }
});

// test-nocode, 26/11: the answer of nocode-form-create reached the agent as one page of partialAnswer; its script read
// r.status and r.id, found them empty and sent the same creation 10 s later, which made a second « Test modale ».
test('a creation sent again after its answer was given answers the form it made, never a second one', () => {
  const api = job();
  const f = fakeHost({ durationMs: 3000 });
  const first = plain(api.run({ kind: 'create', input: reduced, owner: 'owner-a', options: { project: 'C8Oforms', token: 't' } }, f.host));
  assert.deepEqual([first.status, first.id, first.repeated], ['ok', 'form-1', undefined]);
  f.elapse(10000);
  // the same reduced form, keys in another order
  const again = plain(api.run({ kind: 'create', input: { pages: reduced.pages, name: reduced.name }, owner: 'owner-a', options: { project: 'C8Oforms', token: 't' } }, f.host));
  assert.equal(f.state.writes.length, 1, 'no second form');
  assert.deepEqual([again.status, again.saved, again.id, again.rev], ['ok', true, 'form-1', '1-x']);
  assert.deepEqual(again.validation, first.validation, 'the answer it got, whole');
  assert.match(again.createId, /^create-\d+-[0-9a-f]{8}$/);
  assert.equal(again.repeated, 'The same creation was made 10 s ago (createId ' + again.createId + ', form form-1): no second form was created. To make another form with the same content on purpose, give it another name.');
  // the form changed since: where it stands now, with its rev
  f.state.held['form-1'] = '3-y';
  const changed = plain(api.run({ kind: 'create', input: reduced, owner: 'owner-a' }, f.host));
  assert.deepEqual([changed.status, changed.saved, changed.id, changed.rev, changed.validation], ['ok', true, 'form-1', '3-y', undefined]);
  assert.match(changed.next, /^The form changed since \(rev 3-y\): read it with nocode-form-get/);
  assert.match(changed.repeated, /no second form was created/);
  // another name is another creation
  const named = plain(api.run({ kind: 'create', input: { ...reduced, name: 'Candidature emploi 2' }, owner: 'owner-a' }, f.host));
  assert.equal(named.id, 'form-2');
  assert.equal(named.repeated, undefined);
  assert.equal(f.state.writes.length, 2);
  // the form deleted since is made anew
  delete f.state.held['form-1'];
  const anew = plain(api.run({ kind: 'create', input: reduced, owner: 'owner-a' }, f.host));
  assert.deepEqual([anew.id, anew.repeated], ['form-3', undefined]);
  // past REPEAT_MS, a creation is a new one
  f.elapse(api.REPEAT_MS + 1000);
  const late = plain(api.run({ kind: 'create', input: reduced, owner: 'owner-a' }, f.host));
  assert.deepEqual([late.id, late.repeated], ['form-4', undefined]);
  assert.equal(f.state.writes.length, 4);
});

test('a repeated creation is the caller\'s own, a refused one is made again, and an unchecked form is not made twice', () => {
  const api = job();
  const f = fakeHost({ durationMs: 1000 });
  plain(api.run({ kind: 'create', input: reduced, owner: 'owner-a' }, f.host));
  const other = plain(api.run({ kind: 'create', input: reduced, owner: 'owner-b' }, f.host));
  assert.deepEqual([other.id, other.repeated], ['form-2', undefined], 'another caller makes its own');
  assert.equal(api.KINDS.edit.repeat, undefined, 'edits, updates, schemas and publications keep their own rules');
  // a creation refused saved nothing: the same one sent again is checked again
  const g = fakeHost({ durationMs: 1000, refused: true });
  const api2 = job();
  plain(api2.run({ kind: 'create', input: reduced, owner: 'owner-a' }, g.host));
  const retried = plain(api2.run({ kind: 'create', input: reduced, owner: 'owner-a' }, g.host));
  assert.equal(g.state.writes.length, 2);
  assert.equal(retried.repeated, undefined);
  // C8Oforms cannot be asked: the form made is answered again rather than a second one made
  const h = fakeHost({ durationMs: 1000, unchecked: true });
  const api3 = job();
  plain(api3.run({ kind: 'create', input: reduced, owner: 'owner-a' }, h.host));
  const unchecked = plain(api3.run({ kind: 'create', input: reduced, owner: 'owner-a' }, h.host));
  assert.deepEqual([unchecked.id, h.state.writes.length], ['form-1', 1]);
  assert.match(unchecked.repeated, /no second form was created/);
  // an application sent again answers the one made
  const k = fakeHost({ durationMs: 1000 });
  const api4 = job();
  const spec = { name: 'Suivi des visites', entities: [{ name: 'visite', fields: [{ name: 'Date', type: 'date' }] }] };
  const app = plain(api4.run({ kind: 'app', input: spec, owner: 'owner-a' }, k.host));
  const appAgain = plain(api4.run({ kind: 'app', input: spec, owner: 'owner-a' }, k.host));
  assert.deepEqual([appAgain.id, k.state.writes.length], [app.id, 1]);
  assert.match(appAgain.repeated, /^The same creation of the application was made \d+ s ago .*no second application was created\. To make another application/);
  // project-changes does not record it again
  const journal = load(['js/write_journal.js']).C8O.writeJournal;
  assert.equal(journal.entryOf('tools_nocode_form_create', unchecked, { reduced: JSON.stringify(reduced) }, {}), null);
  assert.ok(journal.entryOf('tools_nocode_form_create', { status: 'ok', saved: true, id: 'f9' }, { reduced: '{}' }, {}));
});

test('the engine host checks a form made with nocode-form-get: there, deleted, or not known', () => {
  const sandbox = load(['js/nocode_form_write_job.js']);
  const calls = [];
  const answers = { f1: { _id: 'f1', _rev: '2-z' }, f2: { status: 'unavailable', fetched: false }, f3: { status: 'auth_required' } };
  sandbox.C8O.nocodeForms = { get: (id, options) => { calls.push([id, options.token]); if (id === 'f4') throw new Error('down'); return answers[id]; } };
  sandbox.Packages = { com: { twinsoft: { convertigo: { engine: { requesters: { InternalHttpServletRequest: class {} } } } } } };
  sandbox.java = { util: { concurrent: { ConcurrentHashMap: Map } } };
  const values = {};
  const host = sandbox.C8O.nocodeFormWriteJob.javaHost({ server: { get: key => values[key] ?? null, set: (key, value) => { values[key] = value; } } });
  assert.deepEqual(plain(host.current('create', { id: 'f1' }, { token: 't' })), { exists: true, rev: '2-z' });
  assert.deepEqual(plain(host.current('create', { id: 'f2' }, { token: 't' })), { exists: false });
  assert.equal(host.current('create', { id: 'f3' }, { token: 't' }), null);
  assert.equal(host.current('app', { id: 'f4' }, { token: 't' }), null);
  assert.deepEqual(calls.map(c => c[0]), ['f1', 'f2', 'f3', 'f4']);
});

test('the output schemas of the creations take the answer of a creation sent again (Vibe checks it)', () => {
  const ctx = { C8O: {}, include() {}, Packages: {}, java: {} };
  vm.createContext(ctx);
  ['js/schema_overrides_crud.js', 'js/schema_overrides.js'].forEach(file => vm.runInContext(read(file), ctx));
  const overrides = ctx.C8O.schemaOverrides;
  for (const sequence of ['tools_nocode_form_create', 'tools_nocode_app_create']) {
    const schema = overrides.decorateOutput(sequence, overrides.applyOutput(sequence, null, null), null);
    for (const key of ['repeated', 'createId', 'next', 'id', 'rev']) {
      assert.ok(schema.properties[key] || schema.additionalProperties !== false, sequence + ' refuses ' + key);
    }
  }
  const input = overrides.applyInput('tools_nocode_form_create', null, null);
  assert.match(input.properties.reduced.description, /The same reduced form sent again within 10 minutes answers the form already made \(repeated\)/);
});

test('the tool sequences write through the job, wait up to 300 s and take the id of a running write', () => {
  const overrides = load(['js/schema_overrides.js']).C8O.schemaOverrides;
  for (const [sequence, kind, idName, required] of [
    ['tools_nocode_form_edit', 'edit', 'editId', ['id']],
    ['tools_nocode_form_update', 'update', 'updateId', ['id']],
    ['tools_nocode_form_create', 'create', 'createId', []],
    ['tools_nocode_app_create', 'app', 'createId', []],
    ['tools_nocode_baserow_schema_apply', 'schema', 'applyId', []],
    ['tools_nocode_form_publish', 'publish', 'publishId', ['id', 'rev', 'confirm']]
  ]) {
    const yaml = read('_c8oProject/sequences/' + sequence + '.yaml');
    assert.match(yaml, /^responseTimeout: 300$/m, sequence);
    assert.match(yaml, /include\("js\/nocode_form_write_job\.js"\)/, sequence);
    assert.match(yaml, /include\("js\/nocode_baserow\.js"\)/, sequence + ': loaded in the call, not from the thread');
    assert.match(yaml, /C8O\.detachedRequest = writeHost\.detachedRequest/, sequence);
    assert.match(yaml, new RegExp('writeJob\\.run\\(\\{ kind: "' + kind + '"'), sequence);
    assert.match(yaml, new RegExp('^\u2193' + idName + ' \\[variables\\.RequestableVariable-\\d+\\]: $', 'm'), sequence);
    assert.doesNotMatch(yaml.replace(/\n$/, ''), /^$/m, sequence + ': no empty line in the YAML of a Convertigo object');
    const input = plain(overrides.applyInput(sequence, { type: 'object', properties: {} }));
    assert.equal(input.properties[idName].type, 'string', sequence);
    assert.deepEqual(input.required, required, sequence);
  }
  for (const sequence of ['tools_nocode_form_edit', 'tools_nocode_form_update', 'tools_nocode_form_create']) {
    assert.match(read('_c8oProject/sequences/' + sequence + '.yaml'), /result\.status !== "running" && C8O\.uiReveal/, sequence + ': no reveal before the write ends');
  }
  // the engine itself refused a call with the id alone while the variable of the input was required (headless 8.5, 23/11:
  // "Variable named \"schema\" is required for sequence \"tools_nocode_baserow_schema_apply\"")
  for (const [sequence, variable] of [['tools_nocode_baserow_schema_apply', 'schema'], ['tools_nocode_app_create', 'spec'], ['tools_nocode_form_create', 'reduced'], ['tools_nocode_form_update', 'patch'], ['tools_nocode_form_edit', 'operations']]) {
    const yaml = read('_c8oProject/sequences/' + sequence + '.yaml');
    const block = yaml.slice(yaml.indexOf('\u2193' + variable + ' [variables.'), yaml.indexOf('\u2193', yaml.indexOf('\u2193' + variable + ' [variables.') + 1) >>> 0);
    assert.ok(block.length > 10, sequence + ' ' + variable);
    assert.doesNotMatch(block, /^  required: true$/m, sequence + ': ' + variable + ' is not required by the engine');
  }
  // what writes nothing stays in the call: a plan, a schema that is no JSON, a publication without confirm
  assert.match(read('_c8oProject/sequences/tools_nocode_app_create.yaml'), /specObject\.mode \|\| ""\)\.trim\(\)\.toLowerCase\(\) === "plan"/);
  assert.match(read('_c8oProject/sequences/tools_nocode_baserow_schema_apply.yaml'), /!applyValues \|\| \(!askedApplyId\.length && String\(applyInput\.mode/);
  assert.match(read('_c8oProject/sequences/tools_nocode_form_publish.yaml'), /String\(publishInput\.confirm\)\.trim\(\)\.toLowerCase\(\) !== "true"/);
  assert.match(read('_c8oProject/sequences/tools_nocode_form_publish.yaml'), /linkRoot: C8O\.nocodePublish\.linkRoot\(\)/);
  const guide = read('resources/convertigo-nocode/errors.md');
  assert.match(guide, /^- A write answering `status: running`/m);
  for (const call of ['nocode-app-create({createId})', 'nocode-baserow-schema-apply({applyId})', 'nocode-form-publish({id, rev, confirm, publishId})']) {
    assert.ok(guide.includes(call), call);
  }
});
