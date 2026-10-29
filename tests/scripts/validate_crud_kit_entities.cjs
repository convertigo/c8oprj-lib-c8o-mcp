const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// upsert-ngx-crud-kit without entities built Companies and Contacts components (the CRM demo pair) in a project whose
// CRUD entity was "thing" (usage tests 29/10). Without entities, the kit now takes the entities upsert-crud generated:
// one <prefix>_count_<entity> sequence each.

const root = path.resolve(__dirname, '../..');

function kit() {
  const context = { C8O: {}, include() {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/crud_ui_kit.js'), 'utf8'), context);
  return context.C8O.crudUiKit;
}

const project = names => ({ getSequencesList: () => ({ size: () => names.length, get: i => ({ getName: () => names[i] }) }) });

test('the entities of a project are the ones of its count sequences', () => {
  const K = kit();
  const names = ['auth_login', 'crud_list_clients', 'crud_count_clients', 'crud_count_interventions', 'crud_list_interventions_by_client',
    'other_count_x', 'crud_list_company_contacts'];
  assert.deepEqual(JSON.parse(JSON.stringify(K.facadeEntitiesOf({}, project(names), 'crud'))), [{ name: 'clients' }, { name: 'interventions' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(K.facadeEntitiesOf({}, project(names), 'other'))), [{ name: 'x' }]);
  const source = fs.readFileSync(path.join(root, 'js/crud_ui_kit.js'), 'utf8');
  assert.match(source, /if \(!requestedEntities\.length\) \{[\s\S]{0,400}requestedEntities = C8O\.crudUiKit\.facadeEntitiesOf\(ctx, project, facadePrefix\);/);
});
