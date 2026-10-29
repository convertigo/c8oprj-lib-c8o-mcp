const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Two refusals of upsert-crud seen while preparing the usage tests (29/10): relations [{from: "Contact.CompanyId",
// to: "Company"}] answered "Unknown relation fromEntity: unnameds" (the empty names were normalized before the check),
// and seed.data keyed by the entity name was refused ("unknown entity: Company") once the entity had a plural override.

const root = path.resolve(__dirname, '../..');

function spec() {
  const context = { C8O: {} };
  vm.createContext(context);
  for (const f of ['js/crud_naming.js', 'js/crud_spec.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context);
  const N = context.C8O.crudNaming;
  const trimmed = v => String(v == null ? '' : v).trim();
  const normalizedIdentifier = v => trimmed(v).replace(/[^A-Za-z0-9_]/g, '_').toLowerCase() || 'unnamed';
  const ctx = {
    trimmed, clone: v => JSON.parse(JSON.stringify(v)), ensureArray: v => (Array.isArray(v) ? v : v == null ? [] : [v]),
    toBoolean: (v, d) => (v == null ? d : v === true || v === 'true'), normalizedIdentifier,
    optionalNormalizedIdentifier: v => (trimmed(v).length ? normalizedIdentifier(v) : ''),
  };
  ctx.pluralize = v => N.pluralize(ctx, v);
  ctx.normalizeEntityNames = (raw, fallback) => N.normalizeEntityNames(ctx, raw, fallback);
  return { S: context.C8O.crudSpec, ctx };
}

const companies = { name: 'Company', plural: 'Sociétés', fields: [{ name: 'Name', type: 'string' }] };
const contacts = { name: 'Contact', fields: [{ name: 'FirstName', type: 'string' }, { name: 'CompanyId', type: 'integer' }] };

test('an entity is found by the name the spec gave it, plural override or not', () => {
  const { S, ctx } = spec();
  const entities = [S.normalizeEntity(ctx, companies), S.normalizeEntity(ctx, contacts)];
  assert.notEqual(entities[0].name, 'companies', 'the plural override renames the entity');
  assert.equal(S.findEntityByName(ctx, entities, 'Company'), entities[0]);
  assert.equal(S.findEntityByName(ctx, entities, 'Contact'), entities[1]);
  assert.equal(S.findEntityByName(ctx, entities, 'Invoice'), null);
  assert.deepEqual(JSON.parse(JSON.stringify(S.entityNamesOf(ctx, entities))), ['company', 'contact']);
});

test('the short relation form is read, and a relation without names says what it needs', () => {
  const { S, ctx } = spec();
  const entities = [S.normalizeEntity(ctx, companies), S.normalizeEntity(ctx, contacts)];
  const relations = JSON.parse(JSON.stringify(S.normalizeRelations(ctx, { entities }, [{ from: 'Contact.CompanyId', to: 'Company' }])));
  assert.equal(relations.length, 1);
  assert.equal(relations[0].fromEntity, entities[1].name);
  assert.equal(relations[0].toEntity, entities[0].name);
  assert.equal(relations[0].fromField, 'companyid');
  assert.throws(() => S.normalizeRelations(ctx, { entities }, [{ type: 'many-to-one' }]),
    /fromEntity, fromField and toEntity are required.*"from": "contacts\.company_id"/);
});
