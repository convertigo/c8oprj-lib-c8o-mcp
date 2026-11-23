// Run: node --test tests/scripts/validate_nocode_baserow_schema_get.cjs
// nocode-baserow-schema-get, the read counterpart of nocode-baserow-schema-apply: the tables asked (ids, names, paths or a
// base) are found in the user's catalog, then read by lib_BaseRow.formscommon_SchemaApply mode describe with the Bearer of
// the user's own Baserow account, never the admin account. A fake lib_BaseRow answers describe as lib_BaseRow 1.2.0-beta24
// does; with LIB_BASEROW_ROOT naming a lib_BaseRow checkout of 1.2.0-beta24 or later (default: the sibling
// c8oprj-lib-baserow), the last test runs its real engine (js/baserow_schema.js) on its in-memory Baserow instead.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
// Objects built inside the vm come from another realm: compare their JSON.
const plain = value => JSON.parse(JSON.stringify(value));

const APPLICATIONS = [
  { id: 20, name: 'Sales', type: 'database', workspace: { id: 10, name: 'Team' }, tables: [{ id: 30, name: 'Deals' }, { id: 31, name: 'Companies' }, { id: 32, name: 'Contacts' }] },
  { id: 21, name: 'Archive', type: 'database', workspace: { id: 10, name: 'Team' }, tables: [{ id: 40, name: 'Deals' }, { id: 41, name: 'Old' }] },
  { id: 22, name: 'Sales', type: 'database', workspace: { id: 11, name: 'Other' }, tables: [{ id: 50, name: 'Leads' }] },
  { id: 23, name: 'Empty', type: 'database', workspace: { id: 11, name: 'Other' }, tables: [] }
];
// the tables a table links, in its base (Deals links Companies)
const LINKS = { 30: [31] };

function catalogTable(id) {
  for (const app of APPLICATIONS) {
    const table = app.tables.find(t => t.id === id);
    if (table) return { table, app };
  }
  return null;
}

// What lib_BaseRow 1.2.0-beta24 answers to mode describe, for the tables it is given.
function fakeDescribe(options, fakeOptions) {
  if (fakeOptions.describe) return fakeOptions.describe(options);
  const order = [];
  const skipped = [];
  for (const ref of options.tables) {
    if (catalogTable(ref.id)) order.push(ref.id); else skipped.push({ table: ref.path || String(ref.id), reason: 'not_readable' });
  }
  if (options.linked !== false || fakeOptions.ignoreLinked) {
    for (let i = 0; i < order.length; i++) for (const target of LINKS[order[i]] || []) if (!order.includes(target)) order.push(target);
  }
  const bases = [];
  for (const id of order) {
    const { table, app } = catalogTable(id);
    let base = bases.find(b => b.id === app.id);
    if (!base) bases.push(base = { id: app.id, workspace: app.workspace.name, base: app.name, tables: [] });
    base.tables.push(table);
  }
  return {
    status: 'ok', mode: 'describe', skipped,
    omitted: options.linked === false && !fakeOptions.ignoreLinked && order.includes(30) ? [{ table: 'Deals', field: 'Company', type: 'link_row', reason: 'link_target' }] : [],
    files: options.rows ? [{ table: 'Deals', field: 'Quote' }] : [],
    counts: { bases: bases.length, tables: order.length, rows: options.rows ? 2 * order.length : 0, bytes: 1234 },
    bases: bases.map(b => ({
      workspace: b.workspace, base: b.base,
      schema: {
        format: 'c8oforms.baserow-template', formatVersion: 1, key: 'describe-' + b.id, version: '1', base: { defaultName: b.base },
        limits: { maxRowsPerTable: 2000 },
        tables: b.tables.map(t => {
          const table = { key: t.name, name: t.name, primaryField: { key: 'Name', name: 'Name', type: 'text' },
            fields: [{ key: 'Stage', name: 'Stage', type: 'single_select', values: [{ key: 'Open', value: 'Open', color: 'blue' }] }] };
          if (t.id === 30 && b.tables.some(x => x.id === 31)) table.fields.push({ key: 'Company', name: 'Company', type: 'link_row', targetTable: 'Companies', createRelatedField: true, relatedFieldKey: 'Deals', relatedFieldName: 'Deals' });
          if (options.rows) table.sampleRows = { upsertKey: 'Name', rows: [{ _key: '1', Name: t.name + ' 1', Stage: 'Open' }, { _key: '2', Name: t.name + ' 2' }] };
          return table;
        })
      },
      tables: b.tables.map(t => ({ id: t.id, path: b.workspace + '~>' + b.base + '~>' + t.name, key: t.name })),
      options: b.tables.map(t => ({ id: 900 + t.id, table: t.name, field: 'Stage', option: 'Open' }))
    }))
  };
}

function fakeEngine(fakeOptions = {}) {
  const state = { calls: [], mdc: {} };
  function transport(name, params) {
    state.calls.push({ name, params, nolog: state.mdc.nolog === true });
    switch (name) {
      case 'nocode_validate_token':
        return fakeOptions.unauthenticated
          ? { document: { error: { code: 'invalid_token', message: 'expired' } } }
          : { document: { result: { status: 'ok', authenticated: true, user: 'person@example.invalid' } } };
      case 'formscommon_ApplicationsList': return { document: { array: fakeOptions.applications || APPLICATIONS } };
      case 'BaserowAccountGet': return fakeOptions.noAccount ? { document: { error: { code: 1, message: 'no account' } } } : { document: { email: 'person@example.invalid', password: 'secret' } };
      case 'TokenGetOrRefresh': return { document: { Bearer: params.email ? 'JWT user-token' : 'JWT admin-token' } };
      case 'formscommon_SchemaApply': {
        if (fakeOptions.engineAnswer) return fakeOptions.engineAnswer;
        if (fakeOptions.lib) return { document: { json: JSON.stringify(fakeOptions.lib(params)) } };
        assert.equal(params.mode, 'describe');
        assert.equal(params.authorization, 'JWT user-token', 'describe reads with the Bearer of the user, never the admin account');
        return { document: { result: {}, json: JSON.stringify(fakeDescribe(JSON.parse(params.options), fakeOptions)) } };
      }
      default: throw new Error('unexpected call ' + name);
    }
  }
  return { state, transport };
}

// The engine as the scope of a step sees it, and the Java classes js/nocode_form_write_job.js javaHost uses: a thread runs
// at once when it starts, so the read ends within the call.
function sandboxFor(engine, extra = {}) {
  const { transport, state } = engine;
  const empty = new Proxy(function () {}, { get: (_, key) => key === Symbol.toPrimitive ? () => '' : empty });
  class HashMap { constructor() { this.values = {}; } put(key, value) { this.values[key] = value; } }
  class InternalRequester {
    constructor(params) { this.params = params.values; }
    processRequest() {
      const response = transport(this.params.__sequence || this.params.__transaction, this.params);
      return { getDocumentElement: () => response };
    }
    getContext() { return {}; }
  }
  class InternalHttpServletRequest {}
  class ConcurrentHashMap {
    constructor() { this.map = new Map(); }
    get(key) { return this.map.has(key) ? this.map.get(key) : null; }
    put(key, value) { this.map.set(String(key), value); }
    remove(key) { this.map.delete(String(key)); }
    keySet() { const keys = Array.from(this.map.keys()); return { iterator: () => { let i = 0; return { hasNext: () => i < keys.length, next: () => keys[i++] }; } }; }
  }
  const threads = [];
  class Thread {
    constructor(runnable, name) { this.runnable = runnable; this.name = name; }
    setDaemon() {}
    start() { threads.push(this.name); this.runnable.run(); }
    static sleep() {}
  }
  const engineClasses = { Engine: { theApp: { contextManager: { remove() {} } } }, requesters: { InternalRequester, InternalHttpServletRequest }, util: { XMLUtils: { XmlToJson: response => JSON.stringify(response) } }, enums: empty };
  const packages = new Proxy(empty, { get: (_, key) => {
    if (key === 'java') return sandbox.java;
    if (key === 'com') return { twinsoft: { convertigo: { engine: engineClasses } } };
    return empty;
  } });
  const sandbox = {
    Packages: packages,
    java: {
      util: { HashMap, UUID: { randomUUID: () => crypto.randomUUID() }, concurrent: { ConcurrentHashMap } },
      lang: {
        System: { currentTimeMillis: () => 1800000000000 },
        String: function (text) { return { getBytes: () => Buffer.from(String(text), 'utf8') }; },
        Thread, Runnable: function (object) { return object; },
        reflect: { Array: { newInstance: () => [] } }
      },
      security: { MessageDigest: { getInstance: () => ({ digest: bytes => Array.from(crypto.createHash('sha256').update(bytes).digest()).map(b => (b > 127 ? b - 256 : b)) }) } }
    },
    org: { apache: { log4j: { MDC: { get: k => state.mdc[k], put: (k, v) => { state.mdc[k] = v; }, remove: k => { delete state.mdc[k]; } } } } },
    threads
  };
  Object.assign(sandbox, extra);
  sandbox.include = file => vm.runInContext(read(file), sandbox, { filename: file });
  vm.createContext(sandbox);
  sandbox.include('js/nocode_baserow.js');
  return sandbox;
}

function schemaGet(options, fakeOptions) {
  const engine = fakeEngine(fakeOptions);
  const result = plain(sandboxFor(engine).C8O.nocodeBaserow.schemaGet(Object.assign({ token: 't' }, options)));
  const describe = engine.state.calls.find(c => c.name === 'formscommon_SchemaApply');
  return { result, calls: engine.state.calls, describe, options: describe ? JSON.parse(describe.params.options) : null };
}

// The step of the sequence as the engine runs it: each declared variable in the scope as a String object, or null; the
// No Code token comes with the request, as the integrated assistant sends it.
function runSequenceStep(variables, fakeOptions, server) {
  const engine = fakeEngine(fakeOptions);
  const store = server || new Map();
  const sandbox = sandboxFor(engine, {
    context: {
      httpServletRequest: { getHeader: name => name === 'Authorization' ? 'Bearer t' : null },
      server: { get: key => store.has(key) ? store.get(key) : null, set: (key, value) => store.set(key, value) }
    }
  });
  const yaml = read('_c8oProject/sequences/tools_nocode_baserow_schema_get.yaml');
  const block = yaml.match(/\n {2}expression: \|\n((?: {4}.*\n|\n)+)/)[1];
  const expression = block.replace(/^ {4}/gm, '').trim().replace(/^'|'$/g, '').replace(/''/g, "'");
  const toObject = vm.runInContext('(function (value) { return new String(value); })', sandbox);
  for (const name of yaml.match(/^↓(\w+) \[variables\.RequestableVariable-\d+\]/gm).map(line => line.slice(1).split(' ')[0])) {
    sandbox[name] = variables[name] == null ? null : toObject(variables[name]);
  }
  vm.runInContext(expression, sandbox, { filename: 'tools_nocode_baserow_schema_get.yaml' });
  return { result: plain(sandbox.result), calls: engine.state.calls, threads: sandbox.threads, store };
}

const WRITES = /POST|PATCH|DELETE|Create|Update|Delete|forms_AddRow/;

test('the tables asked are read by describe with the Baserow account of the user, logs off, nothing written', () => {
  const { result, calls, describe, options } = schemaGet({ tables: [30] });
  assert.equal(result.status, 'ok', JSON.stringify(result.error));
  assert.equal(describe.params.mode, 'describe');
  assert.equal(describe.params.authorization, 'JWT user-token');
  assert.ok(describe.nolog, 'the read runs with the logs off: its answer holds the user\'s data');
  assert.deepEqual(options, { tables: [{ id: 30, path: 'Team~>Sales~>Deals' }], linked: true, rows: false, maxBytes: 1800000 });
  assert.deepEqual(calls.find(c => c.name === 'TokenGetOrRefresh').params.email, 'person@example.invalid', 'the token of the user\'s own account');
  assert.ok(!calls.some(c => c.name === 'TokenGetOrRefresh' && !c.params.email), 'never a token without the account');
  assert.ok(!calls.some(c => WRITES.test(c.name)), 'nothing written');
  assert.equal(result.bases.length, 1);
  const base = result.bases[0];
  assert.deepEqual([base.baseId, base.base, base.workspace], [20, 'Sales', 'Team']);
  assert.equal(base.schema.format, 'c8oforms.baserow-template', 'the schema as the lib reads it');
  assert.deepEqual(base.schema.tables.map(t => t.name), ['Deals', 'Companies']);
  assert.deepEqual(base.tables, [
    { id: 30, key: 'Deals', path: 'Team~>Sales~>Deals' },
    { id: 31, key: 'Companies', path: 'Team~>Sales~>Companies', linked: true }
  ], 'a table read because an asked one links it says so');
  assert.deepEqual(base.options[0], { id: 930, table: 'Deals', field: 'Stage', option: 'Open' });
  assert.deepEqual([result.skipped, result.omitted, result.files], [[], [], []]);
  assert.deepEqual(result.counts, { bases: 1, tables: 2, rows: 0, bytes: 1234 });
  assert.equal(result.notes, undefined);
  assert.doesNotMatch(JSON.stringify(result), /JWT|secret|user-token/, 'no token nor password in the answer');
});

test('tables by id, name or path, a base alone or the tables named in it; what is not in the catalog is listed', () => {
  const tablesOf = r => r.options ? r.options.tables.map(t => t.id) : null;
  assert.deepEqual(tablesOf(schemaGet({ tables: ['companies'] })), [31], 'a name, case ignored');
  assert.deepEqual(tablesOf(schemaGet({ tables: ['team~>sales~>contacts'] })), [32], 'a path');
  assert.deepEqual(tablesOf(schemaGet({ tables: [{ id: 41 }, { path: 'Other~>Sales~>Leads' }, { name: 'Contacts' }] })), [41, 50, 32], 'references as objects');
  assert.deepEqual(tablesOf(schemaGet({ base: 20 })), [30, 31, 32], 'a base alone: all its tables');
  assert.deepEqual(tablesOf(schemaGet({ base: 'Team~>Archive' })), [40, 41], 'a base by its path');
  assert.deepEqual(tablesOf(schemaGet({ base: 'Archive', tables: ['Deals'] })), [40], 'the names looked for in the base');
  const partly = schemaGet({ tables: ['Nope', 30, 999] });
  assert.equal(partly.result.status, 'ok');
  assert.deepEqual(tablesOf(partly), [30]);
  assert.deepEqual(partly.result.skipped, [{ table: 'Nope', reason: 'not_in_catalog' }, { table: '999', reason: 'not_in_catalog' }]);
  const none = schemaGet({ tables: ['Nope'] });
  assert.deepEqual([none.result.status, none.result.error.code, none.describe], ['invalid_request', 'table_not_in_catalog', undefined]);
  const twice = schemaGet({ tables: ['Deals'] });
  assert.deepEqual([twice.result.status, twice.result.error.code, twice.describe], ['invalid_request', 'table_ambiguous', undefined]);
  assert.match(twice.result.error.message, /Team~>Sales~>Deals \(30\), Team~>Archive~>Deals \(40\)/);
  const baseTwice = schemaGet({ base: 'Sales' });
  assert.deepEqual([baseTwice.result.error.code, plain(baseTwice.result.bases)], ['base_ambiguous', [{ id: 20, name: 'Sales', workspace: 'Team' }, { id: 22, name: 'Sales', workspace: 'Other' }]]);
  assert.equal(schemaGet({ base: 'Nope' }).result.error.code, 'base_not_in_catalog');
  const emptyBase = schemaGet({ base: 23 });
  assert.deepEqual([emptyBase.result.status, emptyBase.result.bases, emptyBase.result.notes, emptyBase.describe], ['ok', [], ['Base Empty holds no table.'], undefined]);
});

test('arguments that name nothing, or too much, are refused before any read', () => {
  const nothing = schemaGet({});
  assert.deepEqual([nothing.result.status, nothing.result.error.code], ['invalid_request', 'tables_required']);
  assert.ok(!nothing.calls.some(c => c.name === 'formscommon_ApplicationsList'));
  assert.equal(schemaGet({ base: [20, 21] }).result.error.code, 'base_single');
  const many = schemaGet({ tables: Array.from({ length: 101 }, (_, i) => 1000 + i) });
  assert.deepEqual([many.result.error.code, many.describe], ['tables_too_many', undefined]);
  const bigBase = { id: 60, name: 'Big', type: 'database', workspace: { id: 10, name: 'Team' }, tables: Array.from({ length: 101 }, (_, i) => ({ id: 2000 + i, name: 'T' + i })) };
  const big = schemaGet({ base: 60 }, { applications: APPLICATIONS.concat([bigBase]) });
  assert.deepEqual([big.result.status, big.result.error.code, big.result.refused, big.describe], ['error', 'tables_too_many', true, undefined]);
  assert.match(big.result.next, /by id or name/);
  const unauthenticated = schemaGet({ tables: [30] }, { unauthenticated: true });
  assert.equal(unauthenticated.result.status, 'auth_required');
  assert.deepEqual(unauthenticated.calls.map(c => c.name), ['nocode_validate_token']);
  const noAccount = schemaGet({ tables: [30] }, { noAccount: true });
  assert.deepEqual([noAccount.result.status, noAccount.result.error.code, noAccount.describe], ['unauthorized', 'baserow_account_unavailable', undefined]);
  assert.ok(!noAccount.calls.some(c => c.name === 'TokenGetOrRefresh'), 'never a token without the user\'s account: no admin fallback');
});

test('rows and linked go to describe; a lib that does not take linked: false is said so', () => {
  const withRows = schemaGet({ tables: [30], rows: true, linked: false });
  assert.deepEqual([withRows.options.rows, withRows.options.linked], [true, false]);
  assert.deepEqual(withRows.result.bases[0].tables.map(t => t.id), [30]);
  assert.deepEqual(withRows.result.omitted, [{ table: 'Deals', field: 'Company', type: 'link_row', reason: 'link_target' }]);
  assert.deepEqual(withRows.result.files, [{ table: 'Deals', field: 'Quote' }]);
  assert.deepEqual(withRows.result.bases[0].schema.tables[0].sampleRows.rows[0], { _key: '1', Name: 'Deals 1', Stage: 'Open' });
  assert.equal(withRows.result.notes, undefined);
  const older = schemaGet({ tables: [30], linked: false }, { ignoreLinked: true });
  assert.equal(older.result.status, 'ok');
  assert.equal(older.result.bases[0].tables[1].linked, true);
  assert.match(older.result.notes[0], /linked: false is not taken by the lib_BaseRow of this server/);
});

test('the refusals and failures of describe say what to ask instead', () => {
  const refusal = (code, extra) => schemaGet({ tables: [30], rows: true }, { describe: () => ({ status: 'error', mode: 'describe', refused: true, retryable: false, error: Object.assign({ code, message: code + ' message' }, extra) }) }).result;
  const tooMany = refusal('rows_too_many', { table: 'Deals', count: 2500, max: 2000 });
  assert.deepEqual([tooMany.status, tooMany.refused, tooMany.error], ['error', true, { code: 'rows_too_many', message: 'rows_too_many message', table: 'Deals', count: 2500, max: 2000 }]);
  assert.match(tooMany.next, /rows: false.*nocode-baserow-rows-list/);
  assert.match(refusal('rows_too_large', { table: 'Deals', bytes: 2e6, max: 1048576 }).next, /nocode-baserow-rows-list/);
  assert.match(refusal('export_too_large', { bytes: 2e6, max: 1800000 }).next, /fewer tables.*linked: false.*rows: false/);
  assert.match(refusal('tables_too_many', { count: 120, max: 100 }).next, /linked: false/);
  const old = schemaGet({ tables: [30] }, { describe: () => ({ status: 'error', mode: 'describe', error: { code: 'mode_invalid', message: 'Unknown mode describe' }, retryable: false }) }).result;
  assert.deepEqual([old.status, old.error.code], ['error', 'describe_unavailable']);
  assert.match(old.error.message, /1\.2\.0-beta24/);
  const unreachable = schemaGet({ tables: [30] }, { describe: () => ({ status: 'error', error: { code: 'baserow_unreachable', message: 'timeout' }, retryable: true }) }).result;
  assert.deepEqual([unreachable.error.code, unreachable.retryable], ['baserow_unreachable', true]);
  const account = schemaGet({ tables: [30] }, { describe: () => ({ status: 'error', error: { code: 'baserow_account_unavailable', message: 'x' }, retryable: false }) }).result;
  assert.deepEqual([account.status, account.error.code], ['unauthorized', 'baserow_account_unavailable']);
  const engine = schemaGet({ tables: [30] }, { engineAnswer: { document: { error: { message: 'Sequence formscommon_SchemaApply not found' } } } }).result;
  assert.deepEqual([engine.status, engine.error.code, engine.error.message], ['error', 'baserow_schema_get_failed', 'Sequence formscommon_SchemaApply not found']);
});

test('the sequence reads its variables as the engine gives them and reads in a thread of its own', () => {
  const byName = runSequenceStep({ tables: '["Deals"]', base: 'Team~>Sales', linked: 'false', rows: 'true' });
  assert.equal(byName.result.status, 'ok', JSON.stringify(byName.result));
  const describe = byName.calls.find(c => c.name === 'formscommon_SchemaApply');
  assert.deepEqual(JSON.parse(describe.params.options), { tables: [{ id: 30, path: 'Team~>Sales~>Deals' }], linked: false, rows: true, maxBytes: 1800000 });
  assert.equal(describe.params.authorization, 'JWT user-token');
  assert.deepEqual(byName.threads, ['lib_ConvertigoMCP-nocode-describe'], 'the read ran in its own thread');
  assert.equal(byName.result.describeId, undefined, 'a quick read needs no id');
  assert.equal(byName.store.get('lib_ConvertigoMCP.nocodeFormWrites.v1').map.size, 0, 'a read answered leaves the store');
  const single = runSequenceStep({ tables: '30' });
  assert.deepEqual(JSON.parse(single.calls.find(c => c.name === 'formscommon_SchemaApply').params.options).tables.map(t => t.id), [30]);
  const ids = runSequenceStep({ tables: '31,32', linked: '' });
  const idsOptions = JSON.parse(ids.calls.find(c => c.name === 'formscommon_SchemaApply').params.options);
  assert.deepEqual([idsOptions.tables.map(t => t.id), idsOptions.linked, idsOptions.rows], [[31, 32], true, false], 'an empty variable keeps its default');
  const nothing = runSequenceStep({});
  assert.deepEqual([nothing.result.status, nothing.result.error.code, nothing.threads], ['invalid_request', 'tables_required', []]);
  const unknown = runSequenceStep({ describeId: 'describe-1-abcdef12' });
  assert.deepEqual([unknown.result.status, unknown.result.error.code], ['error', 'unknown_read']);
  assert.match(unknown.result.error.message, /Nothing was written: call nocode-baserow-schema-get again with the same arguments/);
});

test('a long read answers running with its describeId, the same call or the id waits for it, and nothing is read twice', () => {
  const job = sandboxFor(fakeEngine()).C8O.nocodeFormWriteJob;
  assert.equal(job, undefined, 'the job is loaded by the step');
  const sandbox = sandboxFor(fakeEngine());
  sandbox.include('js/nocode_form_write_job.js');
  const api = sandbox.C8O.nocodeFormWriteJob;
  assert.deepEqual(plain(api.KINDS.describe), {
    tool: 'nocode-baserow-schema-get', idName: 'describeId', form: false, read: true, noun: 'read of the schema', input: 'tables',
    again: 'a call with the same arguments waits for it too', failCode: 'baserow_schema_get_failed',
    check: 'call nocode-baserow-schema-get again with the same arguments', once: 'the tables were not read again.'
  });
  const map = new Map();
  const reads = [];
  let now = 1800000000000;
  const threads = [];
  const host = {
    store: () => ({ get: k => map.has(k) ? map.get(k) : null, put: (k, v) => map.set(k, v), remove: k => map.delete(k), keys: () => Array.from(map.keys()) }),
    now: () => now, sleep: ms => { now += ms; }, uuid: () => '00000000-0000-0000-0000-00000000000' + threads.length,
    startThread: (name, fn) => threads.push(fn),
    write: (kind, id, input) => { reads.push(plain(input)); return { status: 'ok', bases: [], counts: { tables: 3 } }; }
  };
  const input = { tables: [{ id: 30 }], base: null, linked: true, rows: true };
  const first = plain(api.run({ kind: 'describe', input, owner: 'owner-a', options: { token: 't' } }, host));
  assert.equal(first.status, 'running');
  assert.match(first.describeId, /^describe-\d+-[0-9a-f]{8}$/);
  assert.match(first.message, /^The read of the schema goes on on the server \(it takes longer than one tool call\): a call with the same arguments waits for it too\.$/);
  assert.equal(first.next, 'Call nocode-baserow-schema-get({describeId:"' + first.describeId + '"}) to wait for its answer, with no tables.');
  const joined = plain(api.run({ kind: 'describe', input, owner: 'owner-a' }, host));
  assert.deepEqual([joined.status, joined.describeId], ['running', first.describeId], 'the same read sent again waits for the first');
  assert.match(joined.joined, /was already running \(describeId describe-[^)]+\): this call waits for it instead of reading again\./);
  assert.equal(threads.length, 1, 'one read');
  threads[0]();
  const done = plain(api.run({ kind: 'describe', jobId: first.describeId, owner: 'owner-a' }, host));
  assert.deepEqual([done.status, done.describeId, done.counts], ['ok', first.describeId, { tables: 3 }]);
  assert.equal(map.size, 0, 'the answer given, the read leaves the store');
  assert.equal(reads.length, 1);
  const other = plain(api.run({ kind: 'describe', jobId: first.describeId, owner: 'owner-b' }, host));
  assert.equal(other.error.code, 'unknown_read', 'a read is its caller\'s only');
  // an exception in the thread: nothing was written, the call is made again
  const failing = Object.assign({}, host, { write: () => { throw new Error('boom'); }, startThread: (name, fn) => fn() });
  const failed = plain(api.run({ kind: 'describe', input: { tables: [{ id: 31 }] }, owner: 'owner-a' }, failing));
  assert.deepEqual([failed.status, failed.error.code, failed.next], ['error', 'baserow_schema_get_failed', 'Nothing was written: call nocode-baserow-schema-get again with the same arguments.']);
});

test('the tool is declared, allowed in No Code as a read, with its schema and aliases, and documented in the skill', () => {
  assert.match(read('c8oProject.yaml'), /↓tools_nocode_baserow_schema_get \[sequences\.GenericSequence\]: 🗏 sequences\/tools_nocode_baserow_schema_get\.yaml\n/);
  const sequence = read('_c8oProject/sequences/tools_nocode_baserow_schema_get.yaml');
  assert.match(sequence, /^accessibility: Private\n/);
  assert.match(sequence, /^responseTimeout: 300$/m);
  assert.match(sequence, /writeJob\.run\(\{ kind: "describe"/);
  assert.match(sequence, /C8O\.detachedRequest = getHost\.detachedRequest/);
  for (const name of ['token', 'tables', 'base', 'linked', 'rows', 'describeId']) {
    assert.match(sequence, new RegExp('^↓' + name + ' \\[variables\\.RequestableVariable-\\d+\\]: $', 'm'), name);
  }
  assert.doesNotMatch(sequence, /^  required: true$/m, 'no variable the engine requires: describeId alone resumes a read');
  assert.doesNotMatch(sequence, /^  (comment|description): [^'|].*: /m, 'a value holding ": " is quoted');
  assert.doesNotMatch(sequence.replace(/\n$/, ''), /^$/m, 'no empty line in the YAML of a Convertigo object');

  const policy = {};
  vm.runInNewContext(read('js/nocode_tool_policy.js'), policy);
  assert.equal(policy.C8O.nocodeToolPolicy.allows('tools_nocode_baserow_schema_get'), true);
  const confirm = { C8O: {} };
  vm.runInNewContext(read('js/studio_write_confirm.js'), confirm);
  assert.equal(confirm.C8O.studioWriteConfirm.READ_TOOLS.tools_nocode_baserow_schema_get, true, 'a read: the confirmation of changes never holds it');

  const overrides = { C8O: {}, include() {} };
  vm.runInNewContext(read('js/schema_overrides.js'), overrides);
  assert.equal(overrides.C8O.schemaOverrides.HELD_WRITE_TOOLS.tools_nocode_baserow_schema_get, undefined);
  const schema = plain(overrides.C8O.schemaOverrides.applyInput('tools_nocode_baserow_schema_get', null, null));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.required, undefined, 'describeId alone is a call');
  assert.deepEqual(Object.keys(schema.properties).sort(), ['base', 'describeId', 'linked', 'rows', 'tables', 'token']);
  assert.deepEqual([schema.properties.linked.default, schema.properties.rows.default], [true, false]);
  assert.equal(schema.properties.tables.type, 'array');

  const router = read('js/mcp_endpoint_router.js');
  const aliases = vm.runInNewContext('(' + /var ARGUMENT_ALIASES = (\{[\s\S]*?\n\});/.exec(router)[1] + ')').tools_nocode_baserow_schema_get;
  assert.deepEqual([aliases.tableId, aliases.table, aliases.databaseId, aliases.baseId, aliases.withRows, aliases.includeLinked], ['tables', 'tables', 'base', 'base', 'rows', 'linked']);

  assert.match(read('TOOLS.md'), /^\| `nocode-baserow-schema-get` \| `tools_nocode_baserow_schema_get` \|/m);
  const skill = read('resources/convertigo-nocode/SKILL.md');
  assert.match(skill, /^- `nocode-baserow-schema-get`$/m, 'allowed in the skill');
  assert.match(read('resources/convertigo-nocode/workflow-existing.md'), /nocode-baserow-schema-get/);
  assert.match(read('resources/convertigo-nocode/errors.md'), /nocode-baserow-schema-get\(\{describeId\}\)/);
});

// The real engine of lib_BaseRow (js/baserow_schema.js, 1.2.0-beta24 or later) on its in-memory Baserow, behind the
// formscommon_SchemaApply call of the tool: the contract of describe, its answer read back from its JSON text.
const libRoot = process.env.LIB_BASEROW_ROOT || path.resolve(root, '../c8oprj-lib-baserow');
const libReady = !!libRoot && fs.existsSync(path.join(libRoot, 'js/baserow_schema.js')) && /function describe\(/.test(fs.readFileSync(path.join(libRoot, 'js/baserow_schema.js'), 'utf8'));
test('with the engine of lib_BaseRow: a base read is the schema its engine applies again, the user\'s token only', { skip: libReady ? false : 'set LIB_BASEROW_ROOT to a lib_BaseRow checkout of 1.2.0-beta24 or later' }, () => {
  const BaserowSchema = require(path.join(libRoot, 'js/baserow_schema.js'));
  const { fakeBaserow } = require(path.join(libRoot, 'tests/schema/fake-baserow.cjs'));
  const fixture = JSON.parse(fs.readFileSync(path.join(libRoot, 'tests/schema/fixtures/mini-crm.baserow.json'), 'utf8'));
  const baserow = fakeBaserow();
  const made = BaserowSchema.apply(fixture, null, baserow.api, { workspaceId: 836 });
  assert.equal(made.status, 'done', JSON.stringify(made.error));
  const JWT = 'JWT user-token';
  const tokenAsked = [];
  const id = value => Number(value);
  const transactions = {
    _api_applications__GET: () => baserow.api.listApplications(),
    _api_database_fields_table__table_id___GET: v => baserow.api.listFields(id(v.table_id)),
    _api_database_rows_table__table_id___GET: v => baserow.api.listRows(id(v.table_id), id(v.page), id(v.size))
  };
  global.org = { apache: { log4j: { MDC: { put() {}, get: () => null, remove() {} } } } };
  BaserowSchema.engine.useRequester((project, target, variables) => {
    if (target.__sequence === 'TokenGetOrRefresh') {
      tokenAsked.push(variables);
      return { document: { Bearer: JWT } };
    }
    assert.equal(variables.__header_Authorization, JWT, target.__transaction + ' with the user\'s token');
    const value = transactions[target.__transaction](variables);
    return { document: Array.isArray(value) ? { array: value } : { object: value } };
  });
  try {
    const applications = baserow.api.listApplications().map(app => ({ id: app.id, name: app.name, type: 'database', workspace: app.workspace, tables: app.tables }));
    const lib = params => BaserowSchema.engine.run({ mode: params.mode, options: params.options, authorization: params.authorization });
    const { result } = schemaGet({ base: 'Mini CRM', rows: true }, { applications, lib });
    assert.equal(result.status, 'ok', JSON.stringify(result.error));
    assert.deepEqual(tokenAsked, [{ authorization: 'JWT user-token' }], 'the lib renews the user\'s own token, never asks one without it');
    const base = result.bases[0];
    assert.deepEqual(base.schema.tables.map(t => t.name).sort(), ['Contacts', 'Opportunités', 'Sociétés']);
    assert.ok(base.tables.every(t => Number.isInteger(t.id) && !t.linked), 'every table of the base was asked');
    assert.equal(base.baseId, applications[0].id);
    assert.equal(result.counts.rows, 6);
    assert.doesNotThrow(() => BaserowSchema.normalizeSchema(JSON.parse(JSON.stringify(base.schema))), 'the schema read is one the engine applies');
    const one = schemaGet({ tables: ['Sociétés'], linked: false }, { applications, lib }).result;
    assert.equal(one.status, 'ok', JSON.stringify(one.error));
    const takesLinked = /options\.linked/.test(fs.readFileSync(path.join(libRoot, 'js/baserow_schema.js'), 'utf8'));
    if (takesLinked) {
      assert.deepEqual(one.bases[0].tables.map(t => t.key), ['Sociétés']);
      assert.ok(one.omitted.some(o => o.reason === 'link_target'));
      assert.equal(one.notes, undefined);
    } else {
      assert.match(one.notes[0], /linked: false is not taken/);
    }
    const refused = schemaGet({ base: 'Mini CRM', rows: true }, { applications, lib: params => BaserowSchema.engine.run({ mode: params.mode, options: Object.assign(JSON.parse(params.options), { maxRowsPerTable: 1 }), authorization: params.authorization }) }).result;
    assert.deepEqual([refused.status, refused.error.code, refused.error.max, refused.refused], ['error', 'rows_too_many', 1, true]);
  } finally {
    BaserowSchema.engine.useRequester(null);
    delete global.org;
  }
});
