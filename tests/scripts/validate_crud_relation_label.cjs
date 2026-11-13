const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The label of a relation named a contact by its job title: contacts with first_name, last_name and title showed
// "Chief Executive Officer" in the deals (PipelineCrm 12/11), title coming first and first_name never matching
// "firstname". A record is named by its display name, else a person by its first and last names, and only then by a
// title; the SQL label composes a person's names in the SQL of the database.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function load() {
  const context = { C8O: { util: {} } };
  vm.createContext(context);
  vm.runInContext(read('js/crud_spec.js'), context);
  vm.runInContext(read('js/crud_proof.js'), context);
  vm.runInContext(read('js/crud_backend.js'), context);
  return context.C8O;
}

const ident = name => String(name || '').trim().replace(/[^A-Za-z0-9_]/g, '_').toLowerCase() || 'unnamed';
const fields = (...names) => [{ name: 'id', column: 'id', primary: true }].concat(names.map(n => ({ name: n, column: n })));
const entity = (name, ...names) => ({ name, primaryField: { column: 'id' }, fields: fields(...names) });

test('a person is named by its names, a thing by its name, then by its title', () => {
  const C8O = load();
  const ctx = { ensureArray: v => (Array.isArray(v) ? v : v == null ? [] : [v]), normalizedIdentifier: ident };
  const pick = e => C8O.crudSpec.preferredRelationLabelField(ctx, e).column;
  assert.equal(pick(entity('contacts', 'first_name', 'last_name', 'title', 'email')), 'last_name');
  assert.equal(pick(entity('companies', 'domain', 'name', 'industry')), 'name');
  assert.equal(pick(entity('deals', 'stage', 'title', 'amount')), 'title');
  assert.equal(pick(entity('employes', 'titre', 'prenom', 'nom')), 'nom', 'French: nom before titre');
  assert.equal(pick(entity('people', 'job_title', 'email')), 'email');
  assert.deepEqual(Object.keys(C8O.crudSpec.personNameFields(ctx, entity('contacts', 'title', 'first_name', 'last_name'))).sort(), ['first', 'last']);
  assert.equal(C8O.crudSpec.personNameFields(ctx, entity('users', 'display_name', 'first_name', 'last_name')), null, 'a display name of its own');
  assert.equal(C8O.crudSpec.personNameFields(ctx, entity('teams', 'name')), null);
});

test('the SQL label of a relation to a person composes the first and last names, in the SQL of each database', () => {
  const C8O = load();
  const contacts = entity('contacts', 'first_name', 'last_name', 'title');
  const deals = { name: 'deals', singular: 'deal', primaryField: { column: 'id' },
    fields: fields('title', 'contact_id').map(f => (f.column === 'contact_id' ? Object.assign({}, f, { references: { entity: 'contacts', field: 'id' } }) : f)) };
  const sqlFor = (driver, ui) => {
    const ctx = {
      ensureArray: v => (Array.isArray(v) ? v : v == null ? [] : [v]),
      trimmed: v => String(v == null ? '' : v).trim(),
      normalizedIdentifier: ident,
      pluralize: name => (/s$/.test(name) ? name : name + 's'),
      crmRelationContext: () => null,
      findEntityByName: (entities, name) => entities.find(e => e.name === ident(name) || e.name === ident(name) + 's') || null,
      preferredRelationLabelField: e => C8O.crudSpec.preferredRelationLabelField({ ensureArray: v => v || [], normalizedIdentifier: ident }, e)
    };
    const spec = { database: { driver: { id: driver } }, entities: [contacts, deals],
      relations: [{ type: 'many-to-one', fromEntity: 'deals', fromField: 'contact_id', toEntity: 'contacts', toField: 'id', ui: ui || {} }] };
    return C8O.crudBackend.buildCrudSql(ctx, spec, deals, 'list');
  };
  assert.match(sqlFor('hsqldb'), /TRIM\(COALESCE\(rel_1\.first_name, ''\) \|\| ' ' \|\| COALESCE\(rel_1\.last_name, ''\)\) AS "CONTACT_ID__LABEL"/);
  assert.match(sqlFor('mariadb'), /TRIM\(CONCAT\(COALESCE\(rel_1\.first_name, ''\), ' ', COALESCE\(rel_1\.last_name, ''\)\)\) AS "CONTACT_ID__LABEL"/);
  assert.match(sqlFor('sqlserver'), /LTRIM\(RTRIM\(COALESCE\(rel_1\.first_name, ''\) \+ ' ' \+ COALESCE\(rel_1\.last_name, ''\)\)\) AS "CONTACT_ID__LABEL"/);
  assert.doesNotMatch(sqlFor('hsqldb'), /rel_1\.title AS/);
  // optionLabelField is the label of the select's options: a person is still shown by its names (PipelineCrm2, 13/11).
  assert.match(sqlFor('hsqldb', { optionLabelField: 'email', labelFieldGiven: true }), /TRIM\(COALESCE\(rel_1\.first_name, ''\) \|\| ' ' \|\| COALESCE\(rel_1\.last_name, ''\)\) AS "CONTACT_ID__LABEL"/);
});

test('the label field a relation gives stays the label of a record that is not a person', () => {
  const C8O = load();
  const companies = entity('companies', 'name', 'domain');
  const deals = { name: 'deals', singular: 'deal', primaryField: { column: 'id' },
    fields: fields('title', 'company_id').map(f => (f.column === 'company_id' ? Object.assign({}, f, { references: { entity: 'companies', field: 'id' } }) : f)) };
  const ctx = { ensureArray: v => (Array.isArray(v) ? v : v == null ? [] : [v]), trimmed: v => String(v == null ? '' : v).trim(), normalizedIdentifier: ident,
    pluralize: name => (/s$/.test(name) ? name : name + 's'), crmRelationContext: () => null,
    findEntityByName: (entities, name) => entities.find(e => e.name === ident(name) || e.name === ident(name) + 's') || null,
    preferredRelationLabelField: e => C8O.crudSpec.preferredRelationLabelField({ ensureArray: v => v || [], normalizedIdentifier: ident }, e) };
  const spec = { database: { driver: { id: 'hsqldb' } }, entities: [companies, deals],
    relations: [{ type: 'many-to-one', fromEntity: 'deals', fromField: 'company_id', toEntity: 'companies', toField: 'id', ui: { optionLabelField: 'domain', labelFieldGiven: true } }] };
  assert.match(C8O.crudBackend.buildCrudSql(ctx, spec, deals, 'list'), /rel_1\.domain AS "COMPANY_ID__LABEL"/);
});
