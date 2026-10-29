const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// upsert-ngx-crud-kit with listFields [..., "client_id__label"] (the label column the list answers for a relation)
// dropped that name without a word: the Client column disappeared from the list and the detail, and the agent concluded
// the kit shows 5 fields at most (usage tests 29/10, S1 replay). The label name now means the relation field, and any
// other unknown name is reported.

const root = path.resolve(__dirname, '../..');

function meta() {
  const context = { C8O: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/crud_ui_meta.js'), 'utf8'), context);
  return context.C8O.crudUiMeta;
}

const normalizedIdentifier = v => String(v || '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9_]/g, '_').toLowerCase();
const ctx = {
  trimmed: v => String(v == null ? '' : v).trim(),
  clone: v => JSON.parse(JSON.stringify(v)),
  ensureArray: v => (Array.isArray(v) ? v : v == null ? [] : [v]),
  pascalize: v => String(v).replace(/(^|_)([a-z])/g, (_m, _s, c) => c.toUpperCase()),
  pluralize: v => v,
  normalizedIdentifier,
  semanticFieldToken: v => normalizedIdentifier(v),
  tokenMatches: () => false,
  findEntityByName: (entities, name) => (entities || []).find(e => e.name === name) || null,
  preferredRelationLabelField: () => ({ column: 'nom' }),
  facadeSequenceQName: (project, prefix, entity, op) => project + '.' + prefix + '_' + op + '_' + entity.name,
};

const field = (column, extra) => Object.assign({ name: column, column, label: column, type: 'VARCHAR(255)', primary: false }, extra);
const clients = { name: 'clients', singular: 'client', label: 'Clients', fields: [field('id', { primary: true, type: 'INT' }), field('nom')] };
const interventions = {
  name: 'interventions', singular: 'intervention', label: 'Interventions',
  fields: [field('id', { primary: true, type: 'INT' }), field('titre'), field('statut'), field('montant', { type: 'DECIMAL' }),
    field('client_id', { type: 'INT', references: { entity: 'clients', field: 'id' } })],
  ui: { listFields: ['titre', 'statut', 'montant', 'client_id__label', 'prioritee'] },
};

test('a relation label name lists the relation field, and an unknown name is reported', () => {
  const M = meta();
  const config = JSON.parse(JSON.stringify(M.entityUiConfig(ctx, 'Atelier', 'crud', interventions, [clients, interventions])));
  assert.deepEqual(config.listFields.map(f => f.column), ['titre', 'statut', 'montant', 'client_id']);
  assert.deepEqual(config.unknownFieldRefs, ['prioritee']);
  const kit = fs.readFileSync(path.join(root, 'js/crud_ui_kit.js'), 'utf8');
  assert.match(kit, /not a field of the entity and/, 'the kit warns about the names it left out');
});
