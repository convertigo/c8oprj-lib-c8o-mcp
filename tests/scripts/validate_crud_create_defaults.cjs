const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A field's default never applied to rows created through the CRUD: the INSERT lists every column and a field left
// out reached it as '' (usage tests 29/10: priorite '' instead of 'normale'). The create variables of the transaction,
// of the business sequence and of its call step now carry the field's default.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function backend() {
  const context = { C8O: { util: {} } };
  vm.createContext(context);
  vm.runInContext(read('js/crud_proof.js'), context);
  vm.runInContext(read('js/crud_backend.js'), context);
  return context.C8O.crudBackend;
}

function variable(name) {
  return { name, value: undefined, setDescription() {}, setComment() {}, setValueOrNull(v) { this.value = v; }, getName: () => name };
}

test('create variables carry the field default, and lose it when the field has none', () => {
  const B = backend();
  const children = {};
  const ctx = {
    ensureArray: v => (Array.isArray(v) ? v : v == null ? [] : [v]),
    findChild: (_container, name) => children[name] || null,
    createChild: (_container, _className, name) => (children[name] = variable(name)),
  };
  const result = { created: [] };
  B.ensureRequestableVariables(ctx, {}, [
    { name: 'priorite', description: 'd', defaultValue: 'normale' },
    { name: 'montant', description: 'd', defaultValue: 0 },
    { name: 'titre', description: 'd', defaultValue: null },
    { name: 'id', description: 'd' },
  ], result);
  assert.equal(children.priorite.value, 'normale');
  assert.equal(children.montant.value, '0');
  assert.equal(children.titre.value, null, 'a field without default clears an older one');
  assert.equal(children.id.value, undefined, 'an entry without defaultValue leaves the variable as it is');
  const source = read('js/crud_backend.js');
  assert.match(source, /createVarsEntries\.push\(\{ name: entityField\.column, description: entityFieldDoc, comment: entityFieldDoc,\s*defaultValue:/);
  assert.match(source, /updateVarsEntries\.push\(\{ name: entityField\.column, description: entityFieldDoc, comment: entityFieldDoc \}\);/,
    'an update keeps no default: it would overwrite the stored value');
  assert.equal((source.match(/\n\s+safeDefaultValue\(variable, /g) || []).length, 3, 'transaction, sequence and step variables');
});
