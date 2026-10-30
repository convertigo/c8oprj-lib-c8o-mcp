const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// project-lint warned on the kit's own SQL (COUNT(*) AS total, AS client_id__label: HSQLDB upper-cases them) while the
// kit sequences read ./row/TOTAL and ./row/CLIENT_ID__LABEL. An agent quoted AS "total" as the warning said and the
// counters answered nothing (usage tests 30/10, reproduced on the Studio). The kit now quotes its aliases as its
// sequences read them, and the lint fix names a step that reads the folded name.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function backend() {
  const context = { C8O: { util: {} } };
  vm.createContext(context);
  vm.runInContext(read('js/crud_proof.js'), context);
  vm.runInContext(read('js/crud_backend.js'), context);
  return context.C8O.crudBackend;
}

const ident = name => String(name || '').trim().replace(/[^A-Za-z0-9_]/g, '_') || 'unnamed';
const ctx = {
  ensureArray: v => (Array.isArray(v) ? v : v == null ? [] : [v]),
  trimmed: v => String(v == null ? '' : v).trim(),
  normalizedIdentifier: ident,
  pluralize: name => (/s$/.test(name) ? name : name + 's'),
  crmRelationContext: () => null,
  findEntityByName: (entities, name) => entities.find(e => e.name === ident(name) + 's' || e.name === ident(name)) || null,
  preferredRelationLabelField: entity => entity.fields.find(f => !f.primary),
};
const clients = { name: 'clients', singular: 'client', primaryField: { column: 'id' },
  fields: [{ name: 'id', column: 'id', primary: true }, { name: 'nom', column: 'nom' }] };
const interventions = { name: 'interventions', singular: 'intervention', primaryField: { column: 'id' },
  fields: [{ name: 'id', column: 'id', primary: true }, { name: 'titre', column: 'titre' }, { name: 'client_id', column: 'client_id' }] };
const spec = { entities: [clients, interventions],
  relations: [{ type: 'many-to-one', fromEntity: 'intervention', fromField: 'client_id', toEntity: 'client', toField: 'id' }] };

test('the kit quotes its aliases as its sequences read them', () => {
  const B = backend();
  assert.equal(B.buildCrudSql(ctx, spec, clients, 'count'), 'SELECT COUNT(*) AS "TOTAL"\nFROM clients');
  const list = B.buildCrudSql(ctx, spec, interventions, 'list');
  assert.match(list, /rel_1\.nom AS "CLIENT_ID__LABEL"/);
  assert.doesNotMatch(list, /\bAS\s+[a-z]/);
  const src = read('js/crud_backend.js');
  assert.match(src, /"\.\/document\/sql_output\/row\/TOTAL\/text\(\)"/, 'the count sequence reads TOTAL');
  assert.doesNotMatch(src, /" AS (total|contact_count|company_name|company_city|company_industry)\b/);
});

test('project-lint finds no unquoted alias in the kit SQL, and its fix names a step reading the folded name', () => {
  const lint = read('js/tools_project_lint.js');
  assert.ok(lint.includes('/\\bAS\\s+([a-z][A-Za-z0-9_]*)\\b/'), 'the lint pattern is the one tested here');
  const B = backend();
  for (const sql of [B.buildCrudSql(ctx, spec, clients, 'count'), B.buildCrudSql(ctx, spec, interventions, 'list'),
    B.buildCrudSql(ctx, spec, interventions, 'read')]) {
    assert.equal(/\bAS\s+([a-z][A-Za-z0-9_]*)\b/.exec(sql), null, sql);
  }
  assert.match(lint, /A step that already reads \.\/row\/" \+ folded \+ " then reads nothing: quote AS \\"" \+\s*folded \+ "\\" for it instead\./);
});
