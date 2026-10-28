const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// upsert-crud learns the response schemas of the CRUD transactions it generates: it lists the rows, reads the first,
// creates a sample row, then updates and deletes that row by its id. On 28/10 every upsert-crud answered status
// "partial" with "Unable to infer created `contacts` id to learn update/delete schemas.", with or without seed.data
// and generated. requestable-execute has answered { result: { requestable, status, totalItems, payload: { sql_output } } }
// since June, and the row helpers of js/crud_proof.js only looked for sql_output at the top: no row was ever found.
// That answer also keeps the first 12 rows of a list, in id order, so the row created last is not in it once the table
// has 12 rows (the CRM seed has 20).

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// The real _compactPayload of requestable-execute (BuildCompactResult step), which builds the envelope.
function compactPayload(requestable) {
  const text = read('_c8oProject/sequences/tools_requestable_execute.yaml');
  const start = text.indexOf('function _shallowCopy(obj) {');
  const end = text.indexOf('requestableExecutionResult = _compactPayload(', start);
  assert.ok(start > 0 && end > start, 'the _compactPayload function of requestable-execute is found');
  const source = text.slice(start, end).replace(/''/g, "'");
  const ctx = { executionPlan: { requestable, isSequence: false } };
  vm.runInNewContext(source + '\nthis.compact = _compactPayload;', ctx);
  return ctx.compact;
}

function crudModules() {
  const context = { C8O: {} };
  vm.createContext(context);
  vm.runInContext(read('js/crud_proof.js'), context);
  vm.runInContext(read('js/crud_backend.js'), context);
  return { P: context.C8O.crudProof, B: context.C8O.crudBackend };
}

const proofCtx = {
  ensureWarnings: result => result.warnings,
  normalizedIdentifier: v => String(v || '').replace(/[^A-Za-z0-9_]/g, '_').toLowerCase(),
  normalizeStatus: (v, fallback) => String(v || fallback),
  isSuccessLikeStatus: v => ['ok', 'success'].includes(String(v || 'ok'))
};

// The list_contacts answer upsert-crud got for PfInferId on Studio_8.4_release_check, 28/10 (an MCP client gets the
// same).
const LIVE_LIST = {
  result: {
    requestable: 'PfInferId.PfInferIddb.list_contacts', status: 'ok', truncated: false, totalItems: 2,
    payload: {
      sql_output: [{ ID: 1, NOM: 'Ada', EMAIL: 'ada@example.com' }, { ID: 2, NOM: 'Alan', EMAIL: 'alan@example.com' }],
      attr: { connector: 'PfInferIddb', project: 'PfInferId', transaction: 'list_contacts' }
    }
  }
};

test('the CRUD row helpers read the rows of a requestable-execute answer', () => {
  const { P } = crudModules();
  assert.deepEqual(P.collectSqlOutputRows(proofCtx, LIVE_LIST).map(row => row.ID), [1, 2]);
  assert.equal(P.firstSqlOutputRow(proofCtx, LIVE_LIST).NOM, 'Ada');
  // A create answers a text and an error no payload: no rows.
  const created = { result: { requestable: 'PfInferId.PfInferIddb.create_contact', status: 'ok', payload: { sql_output: '1 row(s) updated' } } };
  const failed = { result: { requestable: 'PfInferId.PfInferIddb.list_contacts', status: 'error', error: { message: 'Table not found' } } };
  for (const answer of [created, failed]) {
    assert.equal(P.collectSqlOutputRows(proofCtx, answer).length, 0);
    assert.equal(P.firstSqlOutputRow(proofCtx, answer), null);
  }
  // A list longer than 12 rows comes cut.
  const rows = Array.from({ length: 20 }, (_, i) => ({ ID: i + 1, NAME: 'Company ' + (i + 1) }));
  const cut = { result: compactPayload('App.Appdb.list_companies')({ sql_output: rows, attr: {} }) };
  assert.equal(cut.result.truncated, true);
  assert.deepEqual(P.collectSqlOutputRows(proofCtx, cut).map(row => row.ID), rows.slice(0, 12).map(row => row.ID));
  // The document of a transaction read by the engine call of js/tools_crud.js has no envelope.
  assert.equal(P.collectSqlOutputRows(proofCtx, { document: { sql_output: rows } }).length, 20);
});

// A contacts table in memory behind the CRUD transactions. requestablePayload answers as requestable-execute does,
// with its real _compactPayload; transactionRows reads the whole list, as the engine call of js/tools_crud.js does.
function contactsWorld(seedRows, options) {
  const opts = options || {};
  const { P, B } = crudModules();
  const table = [];
  let nextId = 1;
  const insert = values => {
    const row = { ID: nextId++ };
    Object.keys(values).forEach(key => { row[key.toUpperCase()] = values[key]; });
    table.push(row);
  };
  for (let i = 0; i < seedRows; i++) {
    insert({ nom: 'Seed ' + (i + 1), email: 'seed' + (i + 1) + '@example.com' });
  }
  const byId = variables => table.findIndex(row => String(row.ID) === String(variables.id));
  const execute = (name, variables) => {
    if (/^list_/.test(name)) {
      return { sql_output: table.map(row => Object.assign({}, row)), attr: {} };
    }
    if (/^count_/.test(name)) {
      return { sql_output: [{ TOTAL: table.length }], attr: {} };
    }
    if (/^read_/.test(name)) {
      return { sql_output: table.filter(row => String(row.ID) === String(variables.id)), attr: {} };
    }
    if (/^create_/.test(name)) {
      insert(variables);
      if (opts.anotherClientInserts) {
        insert({ nom: 'Written by another client', email: 'other@example.com' });
      }
      return { sql_output: '1 row(s) updated', attr: {} };
    }
    if (/^update_/.test(name)) {
      const at = byId(variables);
      if (at >= 0) {
        Object.keys(variables).forEach(key => { table[at][key.toUpperCase()] = variables[key]; });
      }
      return { sql_output: (at >= 0 ? 1 : 0) + ' row(s) updated', attr: {} };
    }
    if (/^delete_/.test(name)) {
      const at = byId(variables);
      if (at >= 0) {
        table.splice(at, 1);
      }
      return { sql_output: (at >= 0 ? 1 : 0) + ' row(s) updated', attr: {} };
    }
    throw new Error('unexpected transaction ' + name);
  };
  const calls = [];
  const ctx = Object.assign({}, proofCtx, {
    ensureArray: v => (Array.isArray(v) ? v : v == null ? [] : [v]),
    addWarning: (result, message) => result.warnings.push(message),
    sampleValueForField: (entity, field, rowIndex) => (field.primary ? null : 'Sample ' + field.column + ' ' + rowIndex),
    requestablePayload(requestable, variables) {
      const name = requestable.split('.').pop();
      calls.push({ name, variables: Object.assign({}, variables) });
      return { result: compactPayload(requestable)(execute(name, variables || {})) };
    },
    transactionRows: (project, connector, name) => P.collectSqlOutputRows(proofCtx, { document: execute(name, {}) }),
    collectSqlOutputRows: payload => P.collectSqlOutputRows(proofCtx, payload),
    summarizeRequestableProof: (payload, requestable, result) => P.summarizeRequestableProof(proofCtx, payload, requestable, result)
  });
  const entity = {
    name: 'contacts', singular: 'contact', primaryField: { column: 'id', primary: true },
    fields: [{ column: 'id', primary: true }, { column: 'nom' }, { column: 'email' }]
  };
  const spec = { project: 'PfInferId', database: { connector: 'PfInferIddb' }, seed: { rowsPerEntity: seedRows }, entities: [entity] };
  const learn = () => {
    const result = { warnings: [] };
    const bucket = [];
    B.learnEntitySchemas(ctx, spec, entity, result, {}, bucket);
    return { result, learned: bucket.map(entry => entry.requestable.split('.').pop()) };
  };
  return { table, calls, learn };
}

for (const seedRows of [2, 20]) {
  test(`upsert-crud learns update and delete on the row it created (${seedRows} seed rows)`, () => {
    const { table, calls, learn } = contactsWorld(seedRows);
    const seeds = JSON.stringify(table);
    const { result, learned } = learn();
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(learned, ['list_contacts', 'count_contacts', 'read_contact', 'create_contact', 'update_contact', 'delete_contact']);
    const createdId = String(seedRows + 1);
    assert.equal(calls.find(call => call.name === 'update_contact').variables.id, createdId);
    assert.equal(calls.find(call => call.name === 'delete_contact').variables.id, createdId);
    assert.equal(JSON.stringify(table), seeds, 'the seed rows are untouched and the sample row is gone');
  });
}

test('upsert-crud without seed removes the sample row from the empty table', () => {
  const { table, calls, learn } = contactsWorld(0);
  const { result, learned } = learn();
  assert.deepEqual(result.warnings, []);
  assert.ok(!learned.includes('read_contact'), 'an empty table has no row to read');
  assert.equal(calls.find(call => call.name === 'delete_contact').variables.id, '1');
  assert.deepEqual(table, []);
});

test('upsert-crud never updates or deletes a row it cannot tell is its own', () => {
  const { table, calls, learn } = contactsWorld(20, { anotherClientInserts: true });
  const { result } = learn();
  assert.deepEqual(result.warnings, ['Unable to infer created `contacts` id to learn update/delete schemas.']);
  assert.ok(!calls.some(call => /^(update|delete)_/.test(call.name)));
  assert.equal(table.length, 22, 'the 20 seed rows, the sample row and the other client\'s row are all kept');
});
