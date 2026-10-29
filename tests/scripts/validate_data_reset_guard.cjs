const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// An agent ran init_schema by hand on an app in use to apply a schema change: its seed deleted every row and inserted
// the demo rows again (usage tests 29/10, two runs out of two). requestable-execute now refuses a transaction that
// empties or drops a table holding rows unless allowDataReset is true.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function requestable(rowsByTable) {
  const ctx = { C8O: {}, include() {}, Packages: {}, java: {} };
  vm.createContext(ctx);
  vm.runInContext(read('js/util.js'), ctx);
  const R = ctx.C8O.requestable;
  const sql = { init_schema: 'CREATE TABLE IF NOT EXISTS t (id INT);\n\nDELETE FROM interventions;\n\nDELETE FROM clients;\n\nINSERT INTO clients (nom) VALUES (\'a\')',
    delete_one: 'DELETE FROM clients WHERE id = {id}', alter: 'ALTER TABLE interventions ADD COLUMN p VARCHAR(10)' };
  const connector = { getTransactionByName: name => ({ getSqlQuery: () => sql[name] }) };
  ctx.Packages.com = { twinsoft: { convertigo: { engine: { Engine: { theApp: { databaseObjectsManager: {
    getOriginalProjectByName: () => ({ getConnectorByName: () => connector }) } } } } } } };
  R._countRows = (_connector, tables) => tables.map(table => ({ table, rows: rowsByTable[table] || 0 }));
  return R;
}

const plan = (name, extra) => Object.assign({ requestable: 'Atelier.Atelierdb.' + name, project: 'Atelier', connector: 'Atelierdb', name }, extra);

test('the tables a SQL text empties or drops', () => {
  const R = requestable({});
  assert.deepEqual(JSON.parse(JSON.stringify(R.resetTables('DELETE FROM a; DELETE FROM b WHERE id = 1; TRUNCATE TABLE c;\n drop table if exists "PUBLIC"."D"; -- DELETE FROM e\nDROP SCHEMA PUBLIC CASCADE'))),
    ['a', 'c', 'D', '*']);
  assert.deepEqual(JSON.parse(JSON.stringify(R.resetTables('UPDATE a SET x = 1; INSERT INTO a VALUES (1); ALTER TABLE a ADD COLUMN y INT'))), []);
});

test('a reset of tables holding rows is refused unless allowDataReset, a reset of empty tables runs', () => {
  const R = requestable({ interventions: 5, clients: 3 });
  assert.throws(() => R.guardDataReset(plan('init_schema')),
    /Atelier\.Atelierdb\.init_schema empties or drops tables that hold rows: interventions \(5 rows\), clients \(3 rows\)\..*upsert-crud.*allowDataReset:true/);
  assert.doesNotThrow(() => R.guardDataReset(plan('init_schema', { allowDataReset: true })));
  assert.doesNotThrow(() => R.guardDataReset(plan('delete_one')));
  assert.doesNotThrow(() => R.guardDataReset(plan('alter')));
  assert.doesNotThrow(() => requestable({}).guardDataReset(plan('init_schema')), 'a fresh database is seeded as before');
});

test('requestable-execute takes allowDataReset, and upsert-crud passes it only for its own seed', () => {
  const yaml = read('_c8oProject/sequences/tools_requestable_execute.yaml');
  assert.match(yaml, /↓allowDataReset \[variables\.RequestableVariable-\d+\]: \n/);
  assert.match(yaml, /allowDataReset: allowResetFlag === true,/);
  assert.match(read('js/util.js'), /C8O\.requestable\.guardDataReset\(executionPlan\);\n\s*txStep\.setSourceTransaction/);
  const backend = read('js/crud_backend.js');
  assert.match(backend, /\{ recordSchema: true, allowDataReset: !existingDatabase\.keep \}/);
  assert.match(backend, /if \(spec\.entities\.length && !existingDatabase\.keep\) \{\n\s*ctx\.requestablePayload\([^\n]*\{ allowDataReset: true \}\);/);
});
