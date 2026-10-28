// Run: node --test tests/scripts/validate_nocode_baserow.cjs
// nocode_baserow.js against a fake lib_BaseRow: the field list sequence answers from a stale cache (as the 60-second
// response cache of Baserow_API_spec does), the direct transaction with __nocache reads the current fields.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const formsRoot = process.env.C8OFORMS_PROJECT_ROOT || path.resolve(root, '../C8oForms');
// Objects built inside the vm come from another realm: compare their JSON.
const plain = value => JSON.parse(JSON.stringify(value));

function fakeBaserow(options = {}) {
  const state = {
    workspaces: [{ id: 10, name: 'Team' }],
    bases: [{ id: 20, name: 'Sales', workspaceId: 10 }],
    tables: [{ id: 30, name: 'Deals', baseId: 20 }],
    fields: {
      30: [
        { id: 301, name: 'Name', type: 'text', primary: true, table_id: 30, available_collaborators: [{ id: 3, name: 'someone@example.invalid' }] },
        { id: 302, name: 'Stage', type: 'single_select', table_id: 30, select_options: [{ id: 1, value: 'Open', color: 'blue' }, { id: 2, value: 'Won', color: 'green' }] },
        { id: 303, name: 'Company', type: 'link_row', table_id: 30, link_row_table_id: 31 }
      ]
    },
    staleFields: {},
    calls: [],
    nextId: 1000
  };
  state.staleFields[30] = state.fields[30].slice();
  function applications() {
    return state.bases.map(base => ({
      id: base.id, name: base.name, order: 1, type: 'database',
      workspace: state.workspaces.find(w => w.id === base.workspaceId),
      tables: state.tables.filter(t => t.baseId === base.id).map(t => ({ id: t.id, name: t.name, order: 1, database_id: base.id }))
    }));
  }
  function transport(name, params) {
    state.calls.push({ name, params });
    switch (name) {
      case 'nocode_validate_token': return { document: { result: { status: 'ok', authenticated: true, user: 'person@example.invalid' } } };
      case 'formscommon_ApplicationsList': return { document: { array: applications() } };
      case 'BaserowAccountGet': return options.noAccount ? { document: { error: { code: 1, message: 'no account' } } } : { document: { email: 'person@example.invalid', password: 'secret' } };
      case 'TokenGetOrRefresh': return { document: { Bearer: params.email ? 'JWT user-token' : 'JWT admin-token' } };
      case 'formscommon_FieldsList': {
        const table = JSON.parse(params.forms_config).table_id;
        return { document: { array: (state.staleFields[table] || []).slice() } };
      }
      case '_api_database_fields_table__table_id___GET': {
        assert.equal(params.__nocache, 'true', 'the direct field read bypasses the response cache');
        return { document: { array: (state.fields[params.table_id] || []).slice() } };
      }
      case 'TableCreateColumn': {
        const body = JSON.parse(params.data);
        if (!options.refuseFields) {
          state.fields[params.table_id] = (state.fields[params.table_id] || []).concat([{ id: state.nextId++, table_id: Number(params.table_id), ...body }]);
        }
        return { document: {} };
      }
      case '_api_applications_workspace__workspace_id___POST': {
        const base = { id: state.nextId++, name: JSON.parse(params.__body).name, workspaceId: Number(params.workspace_id) };
        state.bases.push(base);
        return { document: { object: { id: base.id, name: base.name } } };
      }
      case '_api_database_tables_database__database_id___POST': {
        const body = JSON.parse(params.__body);
        const table = { id: state.nextId++, name: body.name, baseId: Number(params.database_id) };
        state.tables.push(table);
        state.fields[table.id] = body.data
          ? [{ id: state.nextId++, name: body.data[0][0], type: 'text', primary: true, table_id: table.id }]
          : ['Name', 'Notes', 'Active'].map((n, i) => ({ id: state.nextId++, name: n, type: i ? 'text' : 'text', primary: !i, table_id: table.id }));
        state.lastTableBody = body;
        return { document: { object: { id: table.id, name: table.name } } };
      }
      case 'TableCreateView': {
        if (options.refuseViews) return { document: {} };
        const body = JSON.parse(params.data);
        return { document: { object: { id: state.nextId++, name: body.name } } };
      }
      default: throw new Error('unexpected call ' + name);
    }
  }
  return { state, transport };
}

function load(transport, extraFiles = []) {
  const empty = new Proxy(function () {}, { get: (_, key) => key === Symbol.toPrimitive ? () => '' : empty });
  class HashMap { constructor() { this.values = {}; } put(key, value) { this.values[key] = value; } }
  class InternalRequester {
    constructor(params) { this.params = params.values; }
    processRequest() {
      const name = this.params.__sequence || this.params.__transaction;
      const response = transport(name, this.params);
      return { getDocumentElement: () => response };
    }
    getContext() { return {}; }
  }
  class File {
    constructor(parent, child) { this.path = child ? path.join(String(parent), child) : String(parent); }
    isFile() { return fs.statSync(this.path).isFile(); }
    getAbsolutePath() { return this.path; }
  }
  const engine = { theApp: { databaseObjectsManager: { getOriginalProjectByName: () => ({ getDirFile: () => formsRoot }) }, contextManager: { remove() {} } } };
  const mdc = {};
  const packages = new Proxy(empty, { get: (_, key) => {
    if (key === 'java') return { io: { File }, util: { HashMap, Base64: empty } };
    if (key === 'com') return { twinsoft: { convertigo: { engine: { Engine: engine, requesters: { InternalRequester, InternalHttpServletRequest: class {} }, util: { XMLUtils: { XmlToJson: response => JSON.stringify(response) } }, enums: empty } } } };
    if (key === 'org') return { apache: { commons: { io: { FileUtils: { readFileToString: file => fs.readFileSync(file.path, 'utf8') } } } } };
    return empty;
  } });
  const sandbox = {
    Packages: packages,
    java: { lang: { System: { currentTimeMillis: () => 1800000000000 }, String, reflect: { Array: { newInstance: () => [] } } } },
    org: { apache: { log4j: { MDC: { get: k => mdc[k], put: (k, v) => { mdc[k] = v; }, remove: k => { delete mdc[k]; } } } } },
    mdc
  };
  sandbox.include = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  vm.createContext(sandbox);
  sandbox.include('js/nocode_baserow.js');
  extraFiles.forEach(file => sandbox.include(file));
  return sandbox;
}

test('the agent view lists each table once, with the column facts a source needs and no member names', () => {
  const fake = fakeBaserow();
  const C8O = load(fake.transport).C8O;
  const full = C8O.nocodeBaserow.catalogList({ token: 't', includeColumns: true, tableId: 30 });
  assert.equal(full.tables.length, 1);
  assert.ok(full.bases[0].tables.length && full.workspaces[0].bases[0].tables.length, 'the full view keeps the Assistant shape');
  const compact = C8O.nocodeBaserow.catalogList({ token: 't', includeColumns: true, tableId: 30, view: 'compact' });
  assert.equal(compact.view, 'compact');
  assert.equal(compact.bases, undefined);
  assert.equal(compact.tables, undefined);
  assert.deepEqual(plain(compact.workspaces), [{ id: 10, name: 'Team', bases: [{ id: 20, name: 'Sales', tables: [{ id: 30, name: 'Deals', columns: [
    { name: 'Name', type: 'text', id: 301, primary: true },
    { name: 'Stage', type: 'single_select', id: 302, options: ['Open', 'Won'] },
    { name: 'Company', type: 'link_row', id: 303, linksTo: 31 }
  ] }] }] }]);
  assert.doesNotMatch(JSON.stringify(compact), /someone@example|payload/);
  assert.ok(JSON.stringify(compact).length * 3 < JSON.stringify(full).length);
});

// The step of a sequence as the engine runs it: each declared variable is a String object of the scope
// (Sequence.insertObjectsInScope, Context.toObject) or null; the No Code token comes with the request.
function runSequenceStep(sequenceFile, variables, transport) {
  const sandbox = load(transport);
  sandbox.context = { httpServletRequest: { getHeader: name => name === 'Authorization' ? 'Bearer t' : null } };
  const yaml = fs.readFileSync(path.join(root, '_c8oProject/sequences', sequenceFile), 'utf8');
  const block = yaml.match(/\n {2}expression: \|\n((?: {4}.*\n)+)/)[1];
  const expression = block.replace(/^ {4}/gm, '').trim().replace(/^'|'$/g, '').replace(/''/g, "'");
  const toObject = vm.runInContext('(function (value) { return new String(value); })', sandbox);
  for (const name of yaml.match(/^↓(\w+) \[variables\.RequestableVariable-\d+\]/gm).map(line => line.slice(1).split(' ')[0])) {
    sandbox[name] = variables[name] == null ? null : toObject(variables[name]);
  }
  vm.runInContext(expression, sandbox, { filename: sequenceFile });
  return plain(sandbox.result);
}

test('includeColumns without a workspace, base or table keeps the tree and says which id to give', () => {
  // TigoAccess 0e8a7f91 (27/10): the refusal answered empty lists, read as "no workspace" while the compact view listed them.
  const fake = fakeBaserow();
  const answer = runSequenceStep('tools_nocode_baserow_catalog_list.yaml', { includeColumns: 'true', view: 'compact' }, fake.transport);
  assert.equal(answer.status, 'ok');
  assert.deepEqual(answer.workspaces, [{ id: 10, name: 'Team', bases: [{ id: 20, name: 'Sales', tables: [{ id: 30, name: 'Deals' }] }] }]);
  assert.equal(answer.counts.columns, 0);
  assert.match(answer.notes[0], /^Columns are not listed \(columns_filter_required\): .*workspaceId, databaseId or tableId.*1 tables/);
  assert.ok(!fake.state.calls.some(c => c.name === 'formscommon_FieldsList' || c.name === '_api_database_fields_table__table_id___GET'), 'no column is read');
  const full = runSequenceStep('tools_nocode_baserow_catalog_list.yaml', { includeColumns: 'true', view: 'full' }, fakeBaserow().transport);
  assert.deepEqual([full.status, full.tables.map(t => t.id), full.columns, full.notes.length], ['ok', [30], [], 1]);
  const columns = runSequenceStep('tools_nocode_baserow_catalog_list.yaml', { includeColumns: 'true', tableId: '30', view: 'compact' }, fakeBaserow().transport);
  assert.equal(columns.notes, undefined);
  assert.deepEqual(columns.workspaces[0].bases[0].tables[0].columns.map(c => c.name), ['Name', 'Stage', 'Company'], 'a tableId given as the engine gives it');
});

test('a field created by schema-apply is read back at once, past the stale cache', () => {
  const fake = fakeBaserow();
  const C8O = load(fake.transport).C8O;
  const r = C8O.nocodeBaserow.schemaApply({ token: 't', mode: 'apply', view: 'compact', schema: { baseId: 20, tables: [{ id: 30, name: 'Deals', fields: [{ name: 'Amount', type: 'number' }] }] } });
  assert.equal(r.status, 'ok', JSON.stringify(r.error));
  assert.deepEqual(plain(r.created.fields.map(f => f.name)), ['Amount']);
  assert.ok(r.created.fields[0].id, 'the created field id is reported');
  const columns = r.readBack.workspaces[0].bases[0].tables[0].columns.map(c => c.name);
  assert.deepEqual(plain(columns), ['Name', 'Stage', 'Company', 'Amount']);
  const catalog = C8O.nocodeBaserow.catalogList({ token: 't', includeColumns: true, tableId: 30, view: 'compact' });
  assert.ok(catalog.workspaces[0].bases[0].tables[0].columns.some(c => c.name === 'Amount'));
});

test('a field Baserow did not create is an error, not a success', () => {
  const fake = fakeBaserow({ refuseFields: true });
  const C8O = load(fake.transport).C8O;
  const r = C8O.nocodeBaserow.schemaApply({ token: 't', mode: 'apply', schema: { baseId: 20, tables: [{ id: 30, name: 'Deals', fields: [{ name: 'Amount', type: 'number' }] }] } });
  assert.equal(r.status, 'error');
  assert.match(r.error.message, /did not create it/);
});
test('a failed schema-apply answers its error before its actions', () => {
  // The Assistant's feedback kept the first "message" of the answer: "Table already exists.", a planned action
  // listed before the error (friction 3615a606fb3f, four times).
  const failed = load(fakeBaserow({ refuseFields: true }).transport).C8O.nocodeBaserow.schemaApply({ token: 't', mode: 'apply', schema: { baseId: 20, tables: [{ id: 30, name: 'Deals', fields: [{ name: 'Amount', type: 'number' }] }] } });
  assert.deepEqual(Object.keys(failed).slice(0, 2), ['status', 'error']);
  assert.ok(failed.actions.some(a => a.message === 'Table already exists.'));
  assert.match(/"message"\s*:\s*"([^"]*)"/.exec(JSON.stringify(failed))[1], /did not create it/);
  const outside = load(fakeBaserow().transport).C8O.nocodeBaserow.schemaApply({ token: 't', mode: 'apply', schema: { baseId: 99, tables: [{ name: 'T' }] } });
  assert.deepEqual([Object.keys(outside)[1], outside.error.code], ['error', 'base_not_in_catalog']);
  const noAccount = load(fakeBaserow({ noAccount: true }).transport).C8O.nocodeBaserow.schemaApply({ token: 't', mode: 'apply', schema: { baseId: 20, tables: [{ id: 30, name: 'Deals' }] } });
  assert.deepEqual([Object.keys(noAccount)[1], noAccount.error.code], ['error', 'baserow_account_unavailable']);
});

test('writes use the user\'s Baserow account and stay inside the user\'s catalog', () => {
  const noAccount = fakeBaserow({ noAccount: true });
  const refused = load(noAccount.transport).C8O.nocodeBaserow.schemaApply({ token: 't', mode: 'apply', schema: { baseName: 'New', workspaceName: 'Team', tables: [{ name: 'T', fields: [{ name: 'A', type: 'text' }] }] } });
  assert.equal(refused.error.code, 'baserow_account_unavailable');
  assert.ok(!noAccount.state.calls.some(c => /_POST$/.test(c.name)), 'nothing is written');
  assert.ok(!noAccount.state.calls.some(c => c.name === 'TokenGetOrRefresh' && !c.params.email), 'the admin account is never asked');

  const foreign = fakeBaserow();
  const outside = load(foreign.transport).C8O.nocodeBaserow.schemaApply({ token: 't', mode: 'apply', schema: { baseId: 999, tables: [{ name: 'T', fields: [{ name: 'A', type: 'text' }] }] } });
  assert.equal(outside.error.code, 'base_not_in_catalog');
  assert.ok(!foreign.state.calls.some(c => /_POST$|TableCreateColumn/.test(c.name)));

  const own = fakeBaserow();
  load(own.transport).C8O.nocodeBaserow.schemaApply({ token: 't', mode: 'apply', schema: { baseId: 20, tables: [{ name: 'Leads', fields: [{ name: 'Lead', type: 'text' }] }] } });
  const tableCreate = own.state.calls.find(c => c.name === '_api_database_tables_database__database_id___POST');
  assert.equal(tableCreate.params.__header_Authorization, 'JWT user-token');
});

test('a base name is looked up in the workspace the schema names, and is ambiguous without one', () => {
  // test-nocode, Mistral run: workspaceId of My APPS with baseName "Gestion des congés" found the base of that name
  // in Vacations, created the table there, then nocode-app-create did not find it in My APPS.
  const fake = fakeBaserow();
  fake.state.workspaces.push({ id: 11, name: 'Other' });
  fake.state.bases.push({ id: 21, name: 'Leave', workspaceId: 11 });
  const r = load(fake.transport).C8O.nocodeBaserow.schemaApply({ token: 't', mode: 'apply', schema: { workspaceId: 10, baseName: 'Leave', tables: [{ name: 'Requests' }] } });
  assert.equal(r.status, 'ok', JSON.stringify(r.error));
  assert.ok(!r.actions.some(a => a.type === 'base_exists'), JSON.stringify(r.actions));
  const created = fake.state.bases.filter(b => b.name === 'Leave' && b.workspaceId === 10);
  assert.equal(created.length, 1, 'a new base in the named workspace');
  assert.deepEqual(fake.state.tables.filter(t => t.name === 'Requests').map(t => t.baseId), [created[0].id]);
  assert.deepEqual(fake.state.tables.filter(t => t.baseId === 21), [], 'nothing written in the other workspace');
  // Called again, the base of the named workspace is reused.
  const again = load(fake.transport).C8O.nocodeBaserow.schemaApply({ token: 't', mode: 'apply', schema: { workspaceId: 10, baseName: 'Leave', tables: [{ name: 'Requests' }] } });
  assert.deepEqual(plain(again.actions.find(a => a.type === 'base_exists')), { type: 'base_exists', message: 'Base already exists.', baseId: created[0].id, baseName: 'Leave', workspaceId: 10 });

  const ambiguous = fakeBaserow();
  ambiguous.state.workspaces.push({ id: 11, name: 'Other' });
  ambiguous.state.bases.push({ id: 21, name: 'Sales', workspaceId: 11 });
  const refused = load(ambiguous.transport).C8O.nocodeBaserow.schemaApply({ token: 't', mode: 'apply', schema: { baseName: 'Sales', tables: [{ name: 'T' }] } });
  assert.equal(refused.error.code, 'base_name_ambiguous');
  assert.deepEqual(plain(refused.error.bases.map(b => [b.id, b.workspaceId])), [[20, 10], [21, 11]]);
  assert.ok(!ambiguous.state.calls.some(c => /_POST$|TableCreateColumn/.test(c.name)), 'nothing is written');
});

test('the plan of a new base shows its tables to create, even when another base has a table of that name', () => {
  // test-nocode: the plan of a new base in tests-charles showed "Demandes de congé" of a base of Vacations as existing,
  // and the agent renamed its table to get around it.
  const fake = fakeBaserow();
  fake.state.workspaces.push({ id: 11, name: 'Other' });
  fake.state.bases.push({ id: 21, name: 'Leave', workspaceId: 11 });
  fake.state.tables.push({ id: 31, name: 'Requests', baseId: 21 });
  fake.state.fields[31] = [{ id: 311, name: 'Name', type: 'text', primary: true, table_id: 31 }];
  const schema = { workspaceId: 10, baseName: 'Leave 2', tables: [{ name: 'Requests', fields: [{ name: 'Name', type: 'text' }, { name: 'Days', type: 'number' }] }] };
  const plan = load(fake.transport).C8O.nocodeBaserow.schemaApply({ token: 't', mode: 'plan', schema });
  assert.equal(plan.status, 'ok', JSON.stringify(plan.error));
  assert.deepEqual(plain(plan.actions.map(a => a.type).filter(t => /base|table/.test(t))), ['create_base', 'create_table'], JSON.stringify(plan.actions));
  assert.ok(!plan.actions.some(a => a.tableId === 31 || a.fieldId === 311), 'nothing of the other base');
  assert.ok(!fake.state.calls.some(c => /_POST$|TableCreateColumn/.test(c.name)), 'a plan writes nothing');
  const applied = load(fake.transport).C8O.nocodeBaserow.schemaApply({ token: 't', mode: 'apply', schema });
  assert.equal(applied.status, 'ok', JSON.stringify(applied.error));
  const base = fake.state.bases.find(b => b.name === 'Leave 2');
  assert.deepEqual(fake.state.tables.filter(t => t.name === 'Requests').map(t => t.baseId).sort(), [21, base.id].sort(), 'the apply creates it too');
  assert.deepEqual(fake.state.fields[31].map(f => f.name), ['Name'], 'the other table is left alone');
});

test('a new table holds its primary field only, named as the schema asks', () => {
  const fake = fakeBaserow();
  const C8O = load(fake.transport).C8O;
  const r = C8O.nocodeBaserow.schemaApply({ token: 't', mode: 'apply', schema: { baseName: 'Purchases', workspaceName: 'Team', tables: [
    { name: 'Requests', primaryField: 'Item', fields: [{ name: 'Requester', type: 'text' }, { name: 'Item', type: 'text' }, { name: 'Quantity', type: 'number' }] }
  ] }, create: { base: true } });
  assert.equal(r.status, 'ok', JSON.stringify(r.error));
  assert.deepEqual(plain(fake.state.lastTableBody), { name: 'Requests', data: [['Item']], first_row_header: true });
  assert.deepEqual(plain(r.created.bases.map(b => b.name)), ['Purchases']);
  assert.deepEqual(plain(r.created.tables.map(t => [t.name, t.primaryField])), [['Requests', 'Item']]);
  assert.deepEqual(plain(r.created.fields.map(f => f.name)), ['Requester', 'Quantity']);
  const table = r.readBack.tables[0];
  assert.deepEqual(plain(table.columns.map(c => c.name)), ['Item', 'Requester', 'Quantity']);
  const plan = load(fakeBaserow().transport).C8O.nocodeBaserow.schemaApply({ token: 't', mode: 'plan', schema: { baseId: 20, tables: [{ name: 'Leads', fields: [{ name: 'Score', type: 'number' }, { name: 'Lead', type: 'text' }] }] } });
  assert.equal(plan.actions.find(a => a.type === 'create_table').primaryField, 'Lead', 'the first text field by default');
});

test('the form tools check new columns past the stale cache', () => {
  const fake = fakeBaserow();
  fake.state.fields[30] = fake.state.fields[30].concat([{ id: 304, name: 'Amount', type: 'number', table_id: 30 }]);
  const forms = {};
  const transport = (name, params) => {
    if (name === 'APIV2_updateFormulaireDocument') {
      const form = JSON.parse(params.meta);
      form._id = form._id || 'form-1';
      form._rev = String(Number(String(forms[form._id] ? forms[form._id]._rev : '0').split('-')[0]) + 1) + '-x';
      form.creator = form.creator || 'person@example.invalid';
      forms[form._id] = JSON.parse(JSON.stringify(form));
      return { document: { res: { ok: true, id: form._id, rev: form._rev } } };
    }
    if (name === 'APIV2_getDocument') return { document: { res: JSON.parse(JSON.stringify(forms[params.id] || {})) } };
    return fake.transport(name, params);
  };
  const sandbox = load(transport, ['js/nocode_forms.js']);
  const r = sandbox.C8O.nocodeForms.create({ name: 'Deals', navigationMode: 'custom', pages: [{ name: 'Deals', fields: [
    { type: 'grid', name: 'deals', label: 'Deals', sourceEnabled: true, sources: { 'lib_BaseRow.formssource_GetTableData': { enabled: true, fullsync: false, vars: { forms_config: { str: JSON.stringify({ table_id: 'Team~>Sales~>Deals', table_id_int: 30, columns: ['Name', 'Amount'], hidden: [], link_row_table_id: [] }), html: false } } } } }
  ] }] }, { token: 't' });
  assert.ok(!r.validation.issues.some(i => i.code === 'unknown_baserow_column'), JSON.stringify(r.validation.issues));
  assert.equal(r.saved, true);
  assert.ok(fake.state.calls.some(c => c.name === '_api_database_fields_table__table_id___GET' && c.params.__header_Authorization === 'JWT user-token'));
});

test('a view Baserow did not create is reported, not counted as created', () => {
  const refused = fakeBaserow({ refuseViews: true });
  const r = load(refused.transport).C8O.nocodeBaserow.schemaApply({ token: 't', mode: 'apply', schema: { baseId: 20, tables: [{ id: 30, name: 'Deals', views: [{ name: 'Open deals' }] }] } });
  assert.equal(r.status, 'ok');
  assert.deepEqual(plain(r.created.views), []);
  assert.equal(r.warnings[0].code, 'view_not_created');
  const created = load(fakeBaserow().transport).C8O.nocodeBaserow.schemaApply({ token: 't', mode: 'apply', schema: { baseId: 20, tables: [{ id: 30, name: 'Deals', views: [{ name: 'Open deals' }] }] } });
  assert.deepEqual(plain(created.created.views.map(v => v.name)), ['Open deals']);
  assert.deepEqual(plain(created.warnings), []);
});

// nocode-app-create end to end: the fake lib_BaseRow above and an in-memory C8Oforms store.
function appHarness(options = {}) {
  const fake = fakeBaserow(options);
  const forms = {};
  const writes = [];
  const transport = (name, params) => {
    if (name === 'APIV2_updateFormulaireDocument') {
      writes.push(name);
      const form = JSON.parse(params.meta);
      form._id = form._id || 'form-' + (Object.keys(forms).length + 1);
      form._rev = String(Number(String(forms[form._id] ? forms[form._id]._rev : '0').split('-')[0]) + 1) + '-x';
      form.creator = form.creator || 'person@example.invalid';
      forms[form._id] = JSON.parse(JSON.stringify(form));
      return { document: { res: { ok: true, id: form._id, rev: form._rev } } };
    }
    if (name === 'APIV2_getDocument') return { document: { res: JSON.parse(JSON.stringify(forms[params.id] || {})) } };
    if (/POST$|TableCreateColumn|TableCreateView/.test(name)) writes.push(name);
    return fake.transport(name, params);
  };
  const sandbox = load(transport, ['js/nocode_forms.js', 'js/nocode_app.js']);
  return { fake, forms, writes, create: spec => plain(sandbox.C8O.nocodeApp.create(spec, { token: 't' })) };
}
const purchases = { name: "Demandes d'achat", baserow: { workspaceId: 10, baseName: 'Achats' }, entities: [{ name: 'demande', plural: 'demandes', feminine: true, table: 'Demandes',
  fields: [{ name: 'Demandeur', required: true, default: 'user' }, { name: 'Article', required: true }, { name: 'Quantité', type: 'number' }, { name: 'Prix', type: 'number', decimals: 2 },
    { name: 'Statut', type: 'single_select', options: ['Nouvelle', 'Validée', 'Refusée'] }],
  screens: { list: { columns: ['Article', 'Quantité', 'Prix', 'Statut'] }, form: true } }] };

test('nocode-app-create creates the base, the table and its fields, then the bound form, in one call (S5)', () => {
  const h = appHarness();
  const r = h.create(purchases);
  assert.equal(r.status, 'ok', JSON.stringify(r));
  assert.equal(r.saved, true);
  assert.equal(r.bindings.status, 'ready');
  assert.equal(r.validation.issueCount, 0, JSON.stringify(r.validation));
  assert.equal(r.baserow.base.created, true);
  const table = h.fake.state.tables.find(t => t.name === 'Demandes');
  assert.ok(table, 'the table exists in Baserow');
  assert.deepEqual(h.fake.state.fields[table.id].map(f => [f.name, f.type]), [['Demandeur', 'text'], ['Article', 'text'], ['Quantité', 'number'], ['Prix', 'number'], ['Statut', 'single_select']]);
  assert.equal(h.fake.state.fields[table.id].find(f => f.name === 'Prix').number_decimal_places, 2);
  assert.deepEqual(r.baserow.tables.map(t => [t.id, t.name, t.created]), [[table.id, 'Demandes', true]]);
  // The saved form reads and writes that table: inputs named after its columns, forms_AddRow, list refreshed.
  const form = h.forms[r.id];
  assert.deepEqual(r.form, { _id: r.id, _rev: form._rev, name: "Demandes d'achat" }, 'what the Assistant opens');
  const grid = form.formulaire.find(i => i.name === 'demande_list');
  const gridConfig = JSON.parse(grid.sources['lib_BaseRow.formssource_GetTableData'].vars.forms_config.str);
  assert.deepEqual([gridConfig.table_id_int, gridConfig.table_id, gridConfig.form_id, gridConfig.source_id], [table.id, 'Team~>Achats~>Demandes', r.id, grid.id]);
  const save = form.flows.find(f => f.id === 'save_demande');
  assert.deepEqual(save.elements.map(e => e.type), ['submit', 'toast', 'refresh_grid', 'reset_fields', 'push_page']);
  assert.equal(JSON.parse(save.elements[0].actions['lib_BaseRow.forms_AddRow'].vars.forms_config.str).table_id_int, table.id);
  const inputs = form.formulaire.filter(i => ['text', 'select'].includes(i.type) && i.config.page === form.pages.find(p => p.name === 'Nouvelle demande').pageTechName);
  assert.deepEqual(inputs.map(i => i.name), ['Demandeur', 'Article', 'Quantité', 'Prix', 'Statut']);
  // Without columns given, the list shows the first five short columns: S5 on test-nocode left Statut out with four.
  const defaults = h.create({ ...purchases, entities: [{ ...purchases.entities[0], screens: { list: true, form: true } }] });
  assert.deepEqual(JSON.parse(h.forms[defaults.id].formulaire.find(i => i.name === 'demande_list').sources['lib_BaseRow.formssource_GetTableData'].vars.forms_config.str).columns, ['Demandeur', 'Article', 'Quantité', 'Prix', 'Statut']);
  assert.ok(JSON.stringify(r).length < 3000, 'a short outline: ' + JSON.stringify(r).length);
  // Called again (a retry after a lost answer), the tables and fields are reused; only a second form is saved.
  const again = h.create(purchases);
  assert.equal(again.status, 'ok');
  assert.equal(h.fake.state.tables.filter(t => t.name === 'Demandes').length, 1);
  assert.equal(again.baserow.tables[0].created, false);
});

test('nocode-app-create creates its new base in the workspace it names, even when another workspace has that name', () => {
  // test-nocode, Mistral run: the first call failed with "table ... was not found after the schema was applied" and
  // the retry wrote the application into the existing base of the other workspace.
  const h = appHarness();
  h.fake.state.workspaces.push({ id: 11, name: 'Other' });
  h.fake.state.bases.push({ id: 21, name: 'Achats', workspaceId: 11 });
  const r = h.create(purchases);
  assert.equal(r.status, 'ok', JSON.stringify(r));
  assert.equal(r.baserow.base.created, true);
  const base = h.fake.state.bases.find(b => b.id === r.baserow.base.id);
  assert.deepEqual([base.name, base.workspaceId], ['Achats', 10]);
  assert.deepEqual(h.fake.state.tables.filter(t => t.baseId === 21), [], 'nothing written in the other workspace');
});

test('nocode-app-create on an existing table reads its columns and writes nothing to Baserow (S4)', () => {
  const h = appHarness();
  const r = h.create({ name: 'Deals', entities: [{ name: 'deal', table: 30, screens: { list: true, form: true } }] });
  assert.equal(r.status, 'ok', JSON.stringify(r));
  assert.deepEqual(h.writes, ['APIV2_updateFormulaireDocument', 'APIV2_updateFormulaireDocument'], 'only the form is saved (then its identities)');
  const form = h.forms[r.id];
  assert.deepEqual(form.pages.map(p => p.name), ['Deals', 'Nouveau deal']);
  assert.ok(form.formulaire.find(i => i.name === 'Stage' && i.type === 'select' && i.sources['lib_BaseRow.formssource_GetFieldValues']));
  assert.equal(form.formulaire.find(i => i.name === 'Company'), undefined, 'a link to a table outside the catalog is not entered');
  assert.deepEqual(r.baserow.tables[0].notEntered, ['Company (link_row): shown, not entered']);
});

test('nocode-app-create refuses a destination it cannot use, and a plan writes nothing', () => {
  const h = appHarness();
  h.fake.state.workspaces.push({ id: 11, name: 'Other' });
  h.fake.state.bases.push({ id: 21, name: 'Elsewhere', workspaceId: 11 });
  const spec = { ...purchases, baserow: undefined };
  const r = h.create(spec);
  assert.equal(r.error.code, 'workspace_required');
  assert.deepEqual(r.error.workspaces.map(w => [w.name, w.baseCount]), [['Team', 1], ['Other', 1]], 'each workspace with its number of bases, not all of them');
  // The workspace No Code Studio gives the user, named after their e-mail, is the default one.
  h.fake.state.workspaces.push({ id: 12, name: 'Convertigo NoCode Databases - person@example.invalid' });
  h.fake.state.bases.push({ id: 22, name: 'Mine', workspaceId: 12 });
  const own = h.create({ ...spec, mode: 'plan' });
  assert.equal(own.status, 'ok', JSON.stringify(own));
  assert.deepEqual(own.baserow.base, { id: null, name: "Demandes d'achat", created: true });
  assert.ok(own.baserow.actions.includes('create_base'));
  h.fake.state.workspaces.pop();
  h.fake.state.bases.pop();
  const plan = h.create({ ...purchases, mode: 'plan' });
  assert.equal(plan.status, 'ok', JSON.stringify(plan));
  assert.equal(plan.saved, false);
  assert.deepEqual(h.writes, [], 'neither Baserow nor C8Oforms was written');
  assert.ok(plan.baserow.actions.includes('create_table Demandes'));
  const outside = h.create({ name: 'X', entities: [{ name: 'deal', table: 99, screens: { list: true } }] });
  assert.equal(outside.status, 'invalid_spec');
  assert.equal(outside.error.path, 'entities[0].table');
});

test('nocode-app-create reuses a table of the same name without showing a primary column the spec does not name', () => {
  // test-nocode, S3: base Suivi des visites held a table Visites with only its primary Name from an earlier run.
  const h = appHarness();
  h.fake.state.tables.push({ id: 40, name: 'Visites', baseId: 20 });
  h.fake.state.fields[40] = [{ id: 401, name: 'Name', type: 'text', primary: true, table_id: 40 }];
  const r = h.create({ name: 'Suivi des visites', baserow: { baseId: 20 }, entities: [{ name: 'visite', feminine: true, table: 'Visites',
    fields: [{ name: 'Date', type: 'date', default: 'today' }, { name: 'Personne visitée', required: true }], screens: { list: true, form: true } }] });
  assert.equal(r.status, 'ok', JSON.stringify(r));
  assert.deepEqual(r.baserow.tables.map(t => [t.id, t.created, t.columns]), [[40, false, ['Date', 'Personne visitée']]]);
  const form = h.forms[r.id];
  assert.equal(form.formulaire.find(i => i.name === 'Name'), undefined, 'no input for the unnamed primary column');
  assert.deepEqual(JSON.parse(form.formulaire.find(i => i.name === 'visite_list').sources['lib_BaseRow.formssource_GetTableData'].vars.forms_config.str).columns, ['Date', 'Personne visitée']);
});

test('nocode-app-create saves no form when Baserow refuses the schema, and says the retry is safe', () => {
  const h = appHarness({ refuseFields: true });
  const r = h.create(purchases);
  assert.notEqual(r.status, 'ok');
  assert.equal(r.saved, false);
  assert.ok(!h.writes.includes('APIV2_updateFormulaireDocument'), 'no form');
  assert.match(r.next || r.error.message, /same spec|reused|not found/);
});
