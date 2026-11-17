// Run: C8OFORMS_PROJECT_ROOT=<C8Oforms checkout> node --test tests/scripts/validate_nocode_numbers_map.cjs
// Two No Code defects of a map of sites (17/11), checked against fakes (never a real database or form):
// - nocode-baserow-schema-apply created number fields with Baserow's defaults (number_negative false,
//   number_decimal_places 0): a west longitude (-0.57918) was refused with ERROR_REQUEST_BODY_VALIDATION, and the error
//   said nothing an agent could change;
// - a map whose markers came from a table opened far from them: the short form wrote no center.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const formsRoot = process.env.C8OFORMS_PROJECT_ROOT || path.resolve(root, '../C8oForms');
const plain = value => JSON.parse(JSON.stringify(value));

// js/nocode_baserow.js and js/nocode_forms.js in a sandbox; transport answers the requestables they call.
function load(transport, files) {
  const empty = new Proxy(function () {}, { get: (_, key) => key === Symbol.toPrimitive ? () => '' : empty });
  class HashMap { constructor() { this.values = {}; } put(key, value) { this.values[key] = value; } }
  class InternalRequester {
    constructor(params) { this.params = params.values; }
    processRequest() {
      const response = transport(this.params.__sequence || this.params.__transaction, this.params);
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
    org: { apache: { log4j: { MDC: { get: k => mdc[k], put: (k, v) => { mdc[k] = v; }, remove: k => { delete mdc[k]; } } } } }
  };
  vm.createContext(sandbox);
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file }));
  return sandbox.C8O;
}

// ---------------------------------------------------------------------------------------------------------------
// Numbers: a fake lib_BaseRow whose fields and rows follow Baserow's number rules.
function fakeBaserow(fields = {}) {
  const state = {
    tables: [{ id: 30, name: 'Sites', baseId: 20 }],
    fields: Object.assign({ 30: [{ id: 301, name: 'Name', type: 'text', primary: true }] }, fields),
    rows: [],
    calls: [],
    nextId: 1000
  };
  const applications = () => [{ id: 20, name: 'Field work', order: 1, type: 'database', workspace: { id: 10, name: 'Team' },
    tables: state.tables.map(t => ({ id: t.id, name: t.name, order: 1, database_id: 20 })) }];
  // Baserow's number field: no value below 0 without number_negative, no more decimals than number_decimal_places.
  function refused(tableId, row) {
    const detail = {};
    for (const [name, value] of Object.entries(row)) {
      const field = (state.fields[tableId] || []).find(f => f.name === name);
      if (!field || field.type !== 'number' || value == null || value === '') continue;
      const text = String(value);
      if (!Number.isFinite(Number(text))) { detail[name] = [{ error: 'A valid number is required.', code: 'invalid' }]; continue; }
      if (Number(text) < 0 && !field.number_negative) detail[name] = [{ error: 'Ensure this value is greater than or equal to 0.', code: 'min_value' }];
      const decimals = (text.split('.')[1] || '').length;
      if (decimals > (field.number_decimal_places || 0)) detail[name] = [{ error: 'Ensure that there are no more than ' + (field.number_decimal_places || 0) + ' decimal places.', code: 'max_decimal_places' }];
    }
    return Object.keys(detail).length ? { document: { error: 'ERROR_REQUEST_BODY_VALIDATION', detail } } : null;
  }
  function transport(name, params) {
    state.calls.push({ name, params });
    switch (name) {
      case 'nocode_validate_token': return { document: { result: { status: 'ok', authenticated: true, user: 'person@example.invalid' } } };
      case 'formscommon_ApplicationsList': return { document: { array: applications() } };
      case 'BaserowAccountGet': return { document: { email: 'person@example.invalid', password: 'not-a-real-password' } };
      case 'TokenGetOrRefresh': return { document: { Bearer: params.email ? 'JWT user-token' : 'JWT admin-token' } };
      case 'formscommon_FieldsList': return { document: { array: (state.fields[JSON.parse(params.forms_config).table_id] || []).slice() } };
      case '_api_database_fields_table__table_id___GET': return { document: { array: (state.fields[params.table_id] || []).slice() } };
      case 'TableCreateColumn': {
        const body = JSON.parse(params.data);
        const field = { id: state.nextId++, ...body };
        if (field.type === 'number') {
          // Baserow's defaults for what the body does not give
          if (!('number_negative' in field)) field.number_negative = false;
          if (!('number_decimal_places' in field)) field.number_decimal_places = 0;
        }
        state.fields[params.table_id] = (state.fields[params.table_id] || []).concat([field]);
        return { document: {} };
      }
      case '_api_database_fields__field_id___PATCH': {
        const body = JSON.parse(params.__body);
        const field = Object.values(state.fields).flat().find(f => String(f.id) === String(params.field_id));
        Object.assign(field, body);
        return { document: { object: { ...field } } };
      }
      case '_api_database_tables_database__database_id___POST': {
        const body = JSON.parse(params.__body);
        const table = { id: state.nextId++, name: body.name, baseId: Number(params.database_id) };
        state.tables.push(table);
        state.fields[table.id] = [{ id: state.nextId++, name: body.data[0][0], type: 'text', primary: true }];
        return { document: { object: { id: table.id, name: table.name } } };
      }
      case 'TableCreateRow': {
        const row = JSON.parse(params.data);
        const error = refused(params.table_id, row);
        if (error) return error;
        const created = { id: state.nextId++, ...row };
        state.rows.push({ table: Number(params.table_id), row: created });
        return { document: { object: created } };
      }
      default: throw new Error('unexpected call ' + name);
    }
  }
  return { state, transport, apply: (schema, mode = 'apply') => plain(load(transport, ['js/nocode_baserow.js']).nocodeBaserow.schemaApply({ token: 't', mode, view: 'compact', schema })) };
}
const sites = (fields, sampleRows) => ({ baseId: 20, tables: [{ name: 'Sites', fields, sampleRows }] });
const created = (fake, name) => fake.state.fields[fake.state.tables.find(t => t.name === 'Sites').id].find(f => f.name === name);

test('a number field created by schema-apply accepts negative values and keeps the decimals of its values', () => {
  const fake = fakeBaserow();
  fake.state.tables = [];
  const r = fake.apply(sites(
    [{ name: 'Name', type: 'text' }, { name: 'Latitude', type: 'number', decimals: 6 }, { name: 'Longitude', type: 'number' }, { name: 'Visitors', type: 'number' }],
    [{ Name: 'West site', Latitude: 44.837789, Longitude: -0.57918, Visitors: 12 }, { Name: 'East site', Latitude: '45.764043', Longitude: '4.835659', Visitors: 3 }]
  ));
  assert.equal(r.status, 'ok', JSON.stringify(r.error));
  assert.deepEqual([created(fake, 'Latitude').number_negative, created(fake, 'Latitude').number_decimal_places], [true, 6], 'decimals as asked');
  assert.deepEqual([created(fake, 'Longitude').number_negative, created(fake, 'Longitude').number_decimal_places], [true, 6], 'the decimals of its values');
  assert.deepEqual([created(fake, 'Visitors').number_negative, created(fake, 'Visitors').number_decimal_places], [true, 0]);
  assert.equal(fake.state.rows.length, 2, 'the west longitude is written');
  assert.equal(fake.state.rows[0].row.Longitude, -0.57918);
});

test('an explicit choice of the schema is kept, baserowOptions first', () => {
  const fake = fakeBaserow();
  fake.state.tables = [];
  const r = fake.apply(sites([
    { name: 'Name', type: 'text' },
    { name: 'Stock', type: 'number', negative: false },
    { name: 'Seats', type: 'number', unsigned: true },
    { name: 'Floor', type: 'number', min: -3 },
    { name: 'Weight', type: 'number', min: 0, decimals: 3 },
    { name: 'Raw', type: 'number', negative: true, baserowOptions: { number_negative: false, number_decimal_places: 4 } },
    { name: 'Count', type: 'integer' },
    { name: 'Amount', type: 'decimal' }
  ]));
  assert.equal(r.status, 'ok', JSON.stringify(r.error));
  const options = name => [created(fake, name).number_negative, created(fake, name).number_decimal_places];
  assert.deepEqual(options('Stock'), [false, 0]);
  assert.deepEqual(options('Seats'), [false, 0]);
  assert.deepEqual(options('Floor'), [true, 0]);
  assert.deepEqual(options('Weight'), [false, 3]);
  assert.deepEqual(options('Raw'), [false, 4]);
  assert.deepEqual(options('Count'), [true, 0]);
  assert.deepEqual(options('Amount'), [true, 2]);
  const contradiction = fakeBaserow().apply(sites([{ name: 'Level', type: 'number', negative: true, unsigned: true }]));
  assert.equal(contradiction.status, 'error');
  assert.match(contradiction.error.message, /Level\): unsigned contradicts another option of the field/);
  assert.match(fakeBaserow().apply(sites([{ name: 'Level', type: 'number', decimals: 11 }])).error.message, /decimals must be a whole number from 0 to 10/);
});

test('an existing number field without negative values is widened, never narrowed', () => {
  // The field as the tool created it before: Baserow's defaults.
  const narrow = () => fakeBaserow({ 30: [{ id: 301, name: 'Name', type: 'text', primary: true }, { id: 302, name: 'Longitude', type: 'number', number_negative: false, number_decimal_places: 0 }] });
  const plan = narrow();
  const planned = plan.apply(sites([{ name: 'Longitude', type: 'number' }], [{ Name: 'West site', Longitude: -0.57918 }]), 'plan');
  assert.equal(planned.status, 'ok', JSON.stringify(planned.error));
  assert.deepEqual(planned.actions.find(a => a.type === 'update_number_options').patch, { number_negative: true, number_decimal_places: 5 });
  assert.deepEqual(planned.warnings, [], 'the plan knows the rows will fit');
  assert.ok(!plan.state.calls.some(c => /PATCH|TableCreateRow/.test(c.name)), 'a plan writes nothing');

  const fake = narrow();
  const r = fake.apply(sites([{ name: 'Longitude', type: 'number' }], [{ Name: 'West site', Longitude: -0.57918 }]));
  assert.equal(r.status, 'ok', JSON.stringify(r.error));
  const patch = fake.state.calls.find(c => c.name === '_api_database_fields__field_id___PATCH');
  assert.deepEqual([patch.params.field_id, JSON.parse(patch.params.__body), patch.params.__header_Authorization], ['302', { type: 'number', number_negative: true, number_decimal_places: 5 }, 'JWT user-token']);
  assert.equal(fake.state.rows.length, 1);

  // Asked explicitly, without rows.
  const asked = narrow();
  assert.equal(asked.apply(sites([{ name: 'Longitude', type: 'number', negative: true }])).status, 'ok');
  assert.deepEqual(JSON.parse(asked.state.calls.find(c => /PATCH/.test(c.name)).params.__body), { type: 'number', number_negative: true });
  // Listed without options nor rows: left as it is.
  const listed = narrow();
  assert.equal(listed.apply(sites([{ name: 'Longitude', type: 'number' }])).status, 'ok');
  assert.ok(!listed.state.calls.some(c => /PATCH/.test(c.name)));

  // Narrowing would change or empty the values the field holds: reported, not done.
  const wide = fakeBaserow({ 30: [{ id: 301, name: 'Name', type: 'text', primary: true }, { id: 302, name: 'Price', type: 'number', number_negative: true, number_decimal_places: 2 }] });
  const narrowed = wide.apply(sites([{ name: 'Price', type: 'number', unsigned: true, decimals: 0 }]));
  assert.equal(narrowed.status, 'ok');
  assert.ok(!wide.state.calls.some(c => /PATCH/.test(c.name)));
  const warning = narrowed.warnings.find(w => w.code === 'number_field_not_narrowed');
  assert.match(warning.message, /number_negative false and number_decimal_places 0 for an existing number field: the tool does not narrow a field/);
});

test('rows a number field refuses are reported before any row is written, with what to change', () => {
  // A column the schema does not list, as an earlier call created it.
  const existing = () => fakeBaserow({ 30: [{ id: 301, name: 'Name', type: 'text', primary: true }, { id: 302, name: 'Longitude', type: 'number', number_negative: false, number_decimal_places: 0 }] });
  const rows = [{ Name: 'East site', Longitude: 4.8 }, { Name: 'West site', Longitude: -0.57918 }];
  const fake = existing();
  const r = fake.apply({ baseId: 20, tables: [{ name: 'Sites', sampleRows: rows }] });
  assert.equal(r.status, 'error');
  assert.equal(r.error.message, 'Sample rows of table Sites hold numbers that Baserow refuses (ERROR_REQUEST_BODY_VALIDATION), so no row was written: ' +
    'Longitude 4.8 (row 1), -0.57918 (row 2): the number field has number_negative false and number_decimal_places 0; give it an entry in tables[].fields negative: true and decimals: 5. ' +
    'The tool widens an existing number field the schema lists; it never narrows one.');
  assert.ok(!fake.state.calls.some(c => c.name === 'TableCreateRow'), 'no row is written');
  const plan = existing().apply({ baseId: 20, tables: [{ name: 'Sites', sampleRows: rows }] }, 'plan');
  assert.deepEqual(plan.warnings.map(w => [w.code, w.fields]), [['number_value_refused', ['Longitude']]]);
  // An explicit choice the rows contradict.
  const explicit = fakeBaserow().apply(sites([{ name: 'Stock', type: 'number', unsigned: true }], [{ Name: 'A', Stock: -2 }]));
  assert.match(explicit.error.message, /Stock -2 \(row 1\): the number field has number_negative false and number_decimal_places 0; give its entry in tables\[\]\.fields negative: true\./);
});

test('what Baserow refuses reaches the agent with its detail', () => {
  const fake = fakeBaserow({ 30: [{ id: 301, name: 'Name', type: 'text', primary: true }, { id: 302, name: 'Longitude', type: 'number', number_negative: true, number_decimal_places: 5 }] });
  const r = fake.apply({ baseId: 20, tables: [{ name: 'Sites', sampleRows: [{ Name: 'Somewhere', Longitude: '0°34′W' }] }] });
  assert.equal(r.status, 'error');
  assert.equal(r.error.message, 'Create row Sites#1: ERROR_REQUEST_BODY_VALIDATION {"Longitude":[{"error":"A valid number is required.","code":"invalid"}]}');
});
