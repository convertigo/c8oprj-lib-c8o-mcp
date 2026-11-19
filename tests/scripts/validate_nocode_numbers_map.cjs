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
const { formsEngine } = require('../helpers/c8oforms_contract.cjs');
const root = path.resolve(__dirname, '../..');
const formsRoot = process.env.C8OFORMS_PROJECT_ROOT || path.resolve(root, '../C8oForms');
const plain = value => JSON.parse(JSON.stringify(value));

// js/nocode_baserow.js and js/nocode_forms.js in a sandbox; transport answers the requestables they call.
function load(transport, files) {
  // NoCode_Contract and NoCode_Form: the No Code form contract of the C8Oforms checkout (formsRoot)
  const forms = formsEngine(formsRoot);
  const answer = transport;
  transport = (sequence, params) => forms.handles(sequence) ? forms.sequence(sequence, params) : answer ? answer(sequence, params) : undefined;
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
  const engine = { theApp: { databaseObjectsManager: { getOriginalProjectByName: () => forms.project() }, contextManager: { remove() {} } } };
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

// ---------------------------------------------------------------------------------------------------------------
// Maps: the C8Oforms tools on an in-memory No Code server (token check, Baserow fields, forms written through the
// C8Oforms write guard), as validate_nocode_triage_1117.cjs does.
function formsHarness(columnsByTable) {
  const state = { forms: {}, user: 'creator@example.invalid', creates: 0 };
  const guardContext = {};
  vm.runInNewContext(fs.readFileSync(path.join(formsRoot, 'js/form_write_guard.js'), 'utf8'), guardContext);
  const client = load((sequence, params) => {
    if (sequence === 'nocode_validate_token') return { document: { result: { authenticated: true, user: state.user } } };
    if (sequence === 'formscommon_ApplicationsList') return { document: { array: [] } };
    if (sequence === 'formscommon_FieldsList') return { document: { array: plain(columnsByTable[JSON.parse(params.forms_config).table_id] || []) } };
    if (sequence === 'APIV2_getDocument') return { document: { res: plain(state.forms[params.id] || {}) } };
    if (sequence === 'APIV2_updateFormulaireDocument') {
      const form = JSON.parse(params.meta);
      const guarded = guardContext.c8oFormWriteGuard.prepare(form, id => state.forms[id]);
      if (guarded.error) return { document: { res: guarded.error } };
      if (!form._id) {
        state.creates++;
        form._id = 'server-form-' + state.creates;
        form.creator = state.user;
        form['~c8oAcl'] = state.user;
      }
      const current = state.forms[form._id];
      form._rev = String(current ? Number(current._rev.split('-')[0]) + 1 : 1) + '-saved';
      state.forms[form._id] = plain(form);
      return { document: { res: { ok: true, id: form._id, rev: form._rev } } };
    }
    throw new Error('Unexpected requestable ' + sequence);
  }, ['js/nocode_forms.js']).nocodeForms;
  return { state, client, auth: { token: 'unit-test-token-not-a-credential', tableIndex: siteTables } };
}
const MARKERS = 'lib_BaseRow.formssource_GetTableData';
const siteTables = [{ id: 9401, name: 'Sites', path: 'Team~>Field~>Sites' }, { id: 9402, name: 'Depots', path: 'Team~>Field~>Depots' }];
const coordinates = base => [{ id: base + 1, name: 'Name', type: 'text', primary: true }, { id: base + 2, name: 'Lat', type: 'number' }, { id: base + 3, name: 'Lng', type: 'number' }, { id: base + 4, name: 'Region', type: 'text' }];
const siteColumns = { 9401: coordinates(40), 9402: coordinates(50) };
const rows = [{ Name: { value: 'West site' }, Lat: { value: '44.83779' }, Lng: { value: '-0.57918' } }, { Name: { value: 'East site' }, Lat: { value: '45.76404' }, Lng: { value: '4.83566' } }];
const mapApp = (map = {}) => ({ name: 'Field', navigationMode: 'custom', pages: [{ name: 'Map', fields: [{ type: 'map', name: 'sites_map', label: 'Sites', source: { table: 9401, title: 'Name', latitude: 'Lat', longitude: 'Lng', filter: { column: 'Region', operator: 'equal', value: 'West' } }, ...map }] }] });
const mapOf = form => form.formulaire.find(item => item && item.name === 'sites_map');
const configOf = (map, group) => JSON.parse(map[group][Object.keys(map[group])[0]].vars.forms_config.str);
// What the viewer (viewerPage of C8Oforms NGX) gives LeafletMap as center: with config.sourceCenterEnabled, the first row
// of the first entry of sourcesCenter (columns [1] and [2], or [0] and [1] with two columns), else varsCenter.
function viewerCenter(map, answer) {
  if (!map.config.sourceCenterEnabled) return undefined;
  const columns = configOf(map, 'sourcesCenter').columns;
  const row = answer[0];
  const lat = columns.length > 2 ? columns[1] : columns[0];
  const lng = columns.length > 2 ? columns[2] : columns[1];
  return { lat: +row[lat].value, lng: +row[lng].value };
}

test('a map whose markers come from a table is centered on them, as the center tab of No Code Studio does', () => {
  const h = formsHarness(siteColumns);
  const r = h.client.create(mapApp(), h.auth);
  assert.equal(r.saved, true, JSON.stringify(r.validation || r.error));
  assert.equal(r.bindingFinalization.status, 'ready', JSON.stringify(r.bindingFinalization));
  const map = mapOf(h.state.forms[r.form._id]);
  assert.deepEqual([map.config.sourceMarkersEnabled, map.config.sourceCenterEnabled, map.config.autoCenter], [true, true, false]);
  assert.deepEqual(Object.keys(map.sourcesCenter), [MARKERS]);
  // The same source, identities included: a respondent of the published form reads the center as the markers.
  assert.deepEqual(map.sourcesCenter[MARKERS], map.sourcesMarkers[MARKERS]);
  const center = configOf(map, 'sourcesCenter');
  assert.deepEqual([center.table_id_int, center.columns, center.form_id, String(center.source_id), center.source_owner], [9401, ['Name', 'Lat', 'Lng'], r.form._id, String(map.id), h.state.user]);
  assert.equal(map.sourcesCenter[MARKERS].vars.forms_tableFilter.conds[0].val1.name, 'Region', 'the rows of the markers');
  assert.deepEqual(viewerCenter(map, rows), { lat: 44.83779, lng: -0.57918 }, 'the first marker');
});

test('an explicit center choice is kept', () => {
  const kept = formsHarness(siteColumns);
  const gps = kept.client.create(mapApp({ config: { autoCenter: true } }), kept.auth);
  const gpsMap = mapOf(kept.state.forms[gps.form._id]);
  assert.deepEqual([gpsMap.config.sourceCenterEnabled, gpsMap.config.autoCenter], [true, true], 'the GPS position the call asks');
  const none = formsHarness(siteColumns);
  const off = none.client.create(mapApp({ config: { sourceCenterEnabled: false } }), none.auth);
  const offMap = mapOf(none.state.forms[off.form._id]);
  assert.equal(offMap.config.sourceCenterEnabled, false);
  assert.ok(!Object.keys(offMap.sourcesCenter || {}).length, 'no center source');
  assert.equal(offMap.config.autoCenter, true, 'the prototype value, untouched');
});

test('an edit of a map source moves a center the tools wrote, and keeps a center of its own', () => {
  const h = formsHarness(siteColumns);
  const r = h.client.create(mapApp(), h.auth);
  const id = r.form._id;
  const rebind = h.client.edit(id, [{ action: 'update_field', fieldName: 'sites_map', patch: { source: { table: 9402, title: 'Name', latitude: 'Lat', longitude: 'Lng' } } }], h.auth);
  assert.equal(rebind.saved, true, JSON.stringify(rebind.validation || rebind.error));
  let map = mapOf(h.state.forms[id]);
  assert.deepEqual([configOf(map, 'sourcesMarkers').table_id_int, configOf(map, 'sourcesCenter').table_id_int], [9402, 9402]);
  assert.deepEqual(map.sourcesCenter[MARKERS], map.sourcesMarkers[MARKERS]);

  // A center value of its own (varsCenter), set in No Code Studio: kept, as autoCenter.
  const own = h.state.forms[id];
  const ownMap = mapOf(own);
  ownMap.config.sourceCenterEnabled = false;
  ownMap.config.autoCenter = true;
  ownMap.sourcesCenter = {};
  ownMap.varsCenter = { self: { enabled: true, vars: { selfVar: { str: '{"lat":48.85,"lng":2.35}', type: 'text', html: false } } } };
  const kept = h.client.edit(id, [{ action: 'update_field', fieldName: 'sites_map', patch: { source: { table: 9401, title: 'Name', latitude: 'Lat', longitude: 'Lng' } } }], h.auth);
  assert.equal(kept.saved, true, JSON.stringify(kept.validation || kept.error));
  map = mapOf(h.state.forms[id]);
  assert.deepEqual([map.config.sourceCenterEnabled, map.config.autoCenter, Object.keys(map.sourcesCenter || {}).length], [false, true, 0]);

  // A center read from another table: kept.
  const other = mapOf(h.state.forms[id]);
  other.config.sourceCenterEnabled = true;
  other.sourcesCenter = { [MARKERS]: plain(other.sourcesMarkers[MARKERS]) };
  const otherConfig = configOf(other, 'sourcesCenter');
  otherConfig.table_id_int = 9402;
  other.sourcesCenter[MARKERS].vars.forms_config.str = JSON.stringify(otherConfig);
  h.client.edit(id, [{ action: 'update_field', fieldName: 'sites_map', patch: { source: { table: 9401, title: 'Name', latitude: 'Lat', longitude: 'Lng', sort: 'Name' } } }], h.auth);
  map = mapOf(h.state.forms[id]);
  assert.equal(configOf(map, 'sourcesCenter').table_id_int, 9402);
});

test('the contract tells how the short form centers a map', () => {
  const contract = load(() => { throw new Error('no call'); }, ['js/nocode_forms.js']).nocodeForms.contract({ sections: ['all'] }).authoringContract;
  const map = JSON.stringify(contract.componentAuthoring.map);
  assert.match(map, /sourcesCenter/);
  assert.match(map, /config\.autoCenter \(true moves the map to the user's GPS position\)/);
  assert.match(map, /nothing fits it to every marker/);
});
