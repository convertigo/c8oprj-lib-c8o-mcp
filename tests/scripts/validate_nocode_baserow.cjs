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
