const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// crud-status on an app built with the business sequence and page generators answered partial, listed the kit's
// sequences and globals as missing and inspected the NGX starter's placeholder connector (void) instead of the app's
// database (usage tests 29/10). It now picks the SQL connector with the most transactions and answers not_crud.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const list = items => ({ size: () => items.length, get: i => items[i] });

function backend() {
  const context = { C8O: { util: {}, dbo: { resolve: () => null } } };
  vm.createContext(context);
  vm.runInContext(read('js/crud_proof.js'), context);
  vm.runInContext(read('js/crud_backend.js'), context);
  return context.C8O.crudBackend;
}

const sqlConnector = (name, transactions) => ({ getName: () => name, getClass: () => ({ getName: () => 'com.twinsoft.convertigo.beans.connectors.SqlConnector' }),
  getTransactionsList: () => list(new Array(transactions).fill(0)) });

test('without a connector name, the SQL connector with the most transactions is chosen, the default one on a tie', () => {
  const B = backend();
  const ctx = { trimmed: v => String(v == null ? '' : v).trim() };
  const voidConnector = sqlConnector('void', 1);
  const db = sqlConnector('db', 9);
  const http = { getName: () => 'api', getClass: () => ({ getName: () => 'com.twinsoft.convertigo.beans.connectors.HttpConnector' }) };
  const project = { getName: () => 'Bibliotheque', getDefaultConnector: () => voidConnector, getConnectorsList: () => list([voidConnector, http, db]) };
  assert.equal(B.findSqlConnectorInProject(ctx, project, ''), db);
  const twin = sqlConnector('other', 1);
  const tie = { getName: () => 'P', getDefaultConnector: () => voidConnector, getConnectorsList: () => list([twin, voidConnector]) };
  assert.equal(B.findSqlConnectorInProject(ctx, tie, ''), voidConnector);
});

test('a project without CRUD business sequences is not_crud, with a message the tool outputs', () => {
  const proof = read('js/crud_proof.js');
  assert.match(proof, /if \(!hasCrudBusinessSequences\(project, facadePrefix\)\) \{\s*status\.status = "not_crud";/);
  assert.match(proof, /_\(list\|count\|read\|create\|update\|delete\)_/);
  assert.match(proof, /if \(result\.status === "not_crud"\) \{\s*result\.checks\.push\(proofCheck\(ctx, "crud-rail", false, result\.message/);
  for (const [file, variable] of [['tools_crud_status.yaml', 'crudStatusResult'], ['tools_crud_proof.yaml', 'crudProofResult']]) {
    assert.ok(read('_c8oProject/sequences/' + file).includes("'" + variable + ' && ' + variable + '.message ? ' + variable + ".message : \"\"'"), file);
  }
  assert.equal((read('js/schema_overrides_crud.js').match(/message: \{ type: "string", description: "Set with status not_crud/g) || []).length, 2);
});
