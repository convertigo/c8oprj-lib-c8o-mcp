// Run: C8OFORMS_PROJECT_ROOT=<C8Oforms checkout> node --test tests/scripts/validate_nocode_triage_1117.cjs
// Three No Code defects of the 17/11 feedback triage, checked on the compiled and saved forms (never a real form or
// database): a save that updates a row warned of an empty primary field (92fec1e3); a reference written by hand to an
// input added in the same edit kept a made-up id (cd535141); a map bound to a table showed no marker (c0b79c0d).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { formsEngine } = require('../helpers/c8oforms_contract.cjs');
const root = path.resolve(__dirname, '../..');
const formsRoot = process.env.C8OFORMS_PROJECT_ROOT || path.resolve(root, '../C8oForms');
const source = fs.readFileSync(path.join(root, 'js/nocode_forms.js'), 'utf8');

// The tools of js/nocode_forms.js in a sandbox; transport answers the requestables they call.
function api(transport) {
  // NoCode_Contract and NoCode_Form: the No Code form contract of the C8Oforms checkout (formsRoot)
  const forms = formsEngine(formsRoot);
  const answer = transport;
  transport = (sequence, params) => forms.handles(sequence) ? forms.sequence(sequence, params) : answer ? answer(sequence, params) : undefined;
  class File {
    constructor(parent, child) { this.path = child ? path.join(String(parent), child) : String(parent); }
    isFile() { return fs.statSync(this.path).isFile(); }
    getAbsolutePath() { return this.path; }
  }
  const empty = new Proxy(function () {}, { get: (_, key) => key === Symbol.toPrimitive ? () => '' : empty });
  class HashMap {
    constructor() { this.values = {}; }
    put(key, value) { this.values[key] = value; }
  }
  class InternalRequester {
    constructor(params) { this.params = params.values; }
    processRequest() {
      const response = transport(this.params.__sequence, this.params);
      return { getDocumentElement: () => response };
    }
    getContext() { return {}; }
  }
  const engine = { theApp: { databaseObjectsManager: { getOriginalProjectByName: () => forms.project() }, contextManager: { remove() {} } } };
  const packages = new Proxy(empty, { get: (_, key) => {
    if (key === 'java') return { io: { File }, util: { HashMap: transport ? HashMap : empty, Base64: empty } };
    if (key === 'com') return { twinsoft: { convertigo: { engine: { Engine: engine, requesters: transport ? { InternalRequester, InternalHttpServletRequest: class {} } : empty, util: transport ? { XMLUtils: { XmlToJson: response => JSON.stringify(response) } } : empty, enums: empty } } } };
    if (key === 'org') return { apache: { commons: { io: { FileUtils: { readFileToString: file => fs.readFileSync(file.path, 'utf8') } } } } };
    return empty;
  } });
  const sandbox = { Packages: packages, java: { lang: { System: { currentTimeMillis: () => 1800000000000 }, String, reflect: { Array: { newInstance: () => [] } } } } };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'nocode_forms.js' });
  return sandbox.C8O.nocodeForms;
}
const clone = x => JSON.parse(JSON.stringify(x));
// A No Code server in memory: the token check, the Baserow fields of each table and the form documents, written
// through the C8Oforms write guard as the server does.
function harness(columnsByTable) {
  const state = { forms: {}, saves: 0, creates: 0, user: 'creator@example.invalid' };
  const guardContext = {};
  vm.runInNewContext(fs.readFileSync(path.join(formsRoot, 'js/form_write_guard.js'), 'utf8'), guardContext);
  const client = api((sequence, params) => {
    if (sequence === 'nocode_validate_token') return { document: { result: { authenticated: true, user: state.user } } };
    if (sequence === 'formscommon_ApplicationsList') return { document: { array: [] } };
    if (sequence === 'formscommon_FieldsList') return { document: { array: clone(columnsByTable[JSON.parse(params.forms_config).table_id] || []) } };
    if (sequence === 'APIV2_getDocument') return { document: { res: clone(state.forms[params.id] || {}) } };
    if (sequence === 'APIV2_updateFormulaireDocument') {
      state.saves++;
      const form = JSON.parse(params.meta);
      const guarded = guardContext.c8oFormWriteGuard.prepare(form, id => state.forms[id]);
      if (guarded.error) return { document: { res: guarded.error } };
      if (guarded.enabled && (!state.forms[form._id] || state.forms[form._id]._rev !== form._rev)) {
        return { document: { res: { error: 'conflict', reason: 'Document update conflict.' } } };
      }
      if (!form._id) {
        state.creates++;
        form._id = 'server-form-' + state.creates;
        form.creator = state.user;
        form['~c8oAcl'] = state.user;
      }
      const current = state.forms[form._id];
      form._rev = String(current ? Number(current._rev.split('-')[0]) + 1 : 1) + '-saved';
      state.forms[form._id] = clone(form);
      return { document: { res: { ok: true, id: form._id, rev: form._rev } } };
    }
    throw new Error('Unexpected requestable ' + sequence);
  });
  return { state, client, auth: { token: 'unit-test-token-not-a-credential' } };
}
const byName = (form, name) => form.formulaire.find(item => item && item.name === name);
const codes = (list, code) => clone(list || []).filter(entry => entry.code === code);

// 92fec1e3: the primary field of a table is only left empty by a save that ADDS a row.
const stockTables = [{ id: 9201, name: 'Articles', path: 'Team~>Stock~>Articles' }];
const stockColumns = { 9201: [{ id: 21, name: 'Titre', type: 'text', primary: true }, { id: 22, name: 'Quantité', type: 'number' }] };
function stockApp(saveTo, inputs = ['Quantité']) {
  return { name: 'Stock', navigationMode: 'custom', pages: [{ name: 'Articles', fields: [
    { type: 'grid', name: 'articles', label: 'Articles', source: { table: 9201, columns: ['Titre', 'Quantité'] } },
    ...inputs.map(name => ({ type: 'text', name, label: name })),
    { type: 'button', name: 'save', label: 'Enregistrer', flow: 'save_row' }
  ] }], flows: [{ id: 'save_row', name: 'Enregistrer', elements: [{ type: 'submit', saveTo }] }] };
}
test('92fec1e3: a save that updates the selected row does not warn of an empty primary field', () => {
  let h = harness(stockColumns);
  const update = h.client.create(stockApp({ table: 9201, row: 'articles', values: { Quantité: 'Quantité' } }), { ...h.auth, tableIndex: stockTables });
  assert.equal(update.saved, true, JSON.stringify(update.validation || update.error));
  const action = h.state.forms[update.form._id].flows.find(flow => flow.id === 'save_row').elements[0].actions['lib_BaseRow.forms_AddRowFromData'];
  assert.match(action.vars.forms_id.str, /^\$\$START\d+\{.*"c8opath":"articles\.id\.value".*\}END\d+\$\$$/, 'the save names the selected row');
  assert.deepEqual(codes(update.validation.warnings, 'primary_field_not_filled'), []);
  // The same save without a row adds rows without their primary field: still reported.
  h = harness(stockColumns);
  const add = h.client.create(stockApp({ table: 9201, values: { Quantité: 'Quantité' } }), { ...h.auth, tableIndex: stockTables });
  assert.equal(add.saved, true, JSON.stringify(add.validation || add.error));
  assert.equal(codes(add.validation.warnings, 'primary_field_not_filled').length, 1);
  // An edit that removes the input of the primary field: an updating save left unchanged is not reported either.
  h = harness(stockColumns);
  const byField = h.client.create(stockApp({ table: 9201, row: 'articles' }, ['Titre', 'Quantité']), { ...h.auth, tableIndex: stockTables });
  assert.equal(byField.saved, true, JSON.stringify(byField.validation || byField.error));
  const removed = h.client.edit(byField.form._id, [{ action: 'remove_field', fieldName: 'Titre' }], h.auth);
  assert.equal(removed.saved, true, JSON.stringify(removed.validation || removed.error));
  assert.deepEqual(codes(removed.validation.warnings, 'primary_field_not_filled'), []);
  // A native forms_id holding a literal row id updates that row too.
  h = harness(stockColumns);
  const native = stockApp({ table: 9201 });
  native.flows[0].elements[0] = { type: 'submit', name: 'save_row', actions: { 'lib_BaseRow.forms_AddRowFromData': { enabled: true, vars: {
    forms_config: { table_id: 'Team~>Stock~>Articles', table_id_int: 9201, link_row_table_id: [] }, forms_id: '12', forms_createColumn: 'false', forms_freeVars: { Quantité: '3' } } } } };
  const literal = h.client.create(native, { ...h.auth, tableIndex: stockTables });
  assert.equal(literal.saved, true, JSON.stringify(literal.validation || literal.error));
  assert.deepEqual(codes(literal.validation.warnings, 'primary_field_not_filled'), []);
});

// cd535141: an input added and wired into a grid filter by hand in the same edit.
const orderTables = [{ id: 9301, name: 'Commandes', path: 'Team~>Ventes~>Commandes' }];
const orderColumns = { 9301: [{ id: 31, name: 'Client', type: 'text', primary: true }, { id: 32, name: 'Montant', type: 'number' }] };
function ordersApp() {
  return { name: 'Ventes', navigationMode: 'custom', pages: [{ name: 'Commandes', fields: [
    { type: 'grid', name: 'orders', label: 'Commandes', source: { table: 9301, columns: ['Client', 'Montant'] } }
  ] }] };
}
function referenceText(id, c8opath, extra = {}) {
  return '$$START' + id + JSON.stringify({ c8otype: 'path', c8opath, c8oPrettyPath: '', c8obuiltin: 'false', fakeId: 'fakeId1', c8oName: null, ...extra }) + 'END' + id + '$$';
}
function filterPatch(reference) {
  return { sources: { 'lib_BaseRow.formssource_GetTableData': { vars: { forms_tableFilter: { str: '', html: false, type: 'filter', condVisible: 'and', groups: [],
    conds: [{ val1: { name: 'Montant', displayName: 'Montant' }, val2: { type: 'text', str: reference, html: false, arr: [] }, operator: 'higher_than_or_equal' }] } } } } };
}
const filterValue = form => byName(form, 'orders').sources['lib_BaseRow.formssource_GetTableData'].vars.forms_tableFilter.conds[0].val2.str;
const addMinimum = { action: 'add_field', pageName: 'Commandes', index: 0, fieldObject: { type: 'text', name: 'min_amount', label: 'Montant minimum', config: { type: 'number' } } };
test('cd535141: a reference to an input added in the same edit gets the id the input is saved with', () => {
  const variants = [
    ['its name as the id', referenceText('min_amount', 'min_amount')],
    ['a made-up number, its c8opath naming the input', referenceText('999', 'min_amount')],
    ['a c8opath as the id', referenceText('min_amount.value', '')],
    ['a made-up id and the name of its payload', referenceText('tmp_input', '', { pathPrefix: 'fields', name: 'min_amount' })]
  ];
  for (const [what, reference] of variants) {
    const h = harness(orderColumns);
    const created = h.client.create(ordersApp(), { ...h.auth, tableIndex: orderTables });
    assert.equal(created.saved, true, JSON.stringify(created.validation || created.error));
    const edited = h.client.edit(created.form._id, [addMinimum, { action: 'update_field', fieldName: 'orders', patch: filterPatch(reference) }], h.auth);
    assert.equal(edited.saved, true, what + ': ' + JSON.stringify(edited.validation || edited.error));
    const saved = h.state.forms[created.form._id];
    const input = byName(saved, 'min_amount');
    const match = /^\$\$START(\d+)(\{.*\})END(\d+)\$\$$/.exec(filterValue(saved));
    assert.ok(match, what + ': ' + filterValue(saved));
    assert.equal(match[1], String(input.id), what);
    assert.equal(match[3], String(input.id), what);
    const payload = JSON.parse(match[2]);
    assert.ok(payload.c8opath === '' || payload.c8opath.split('.')[0] === 'min_amount', what + ': ' + payload.c8opath);
    assert.deepEqual(clone(edited.referencesResolved).map(entry => [entry.to, entry.name]), [[String(input.id), 'min_amount']], what);
    assert.match(edited.referencesResolved[0].path, /^\/formulaire\/\d+\/sources\/lib_BaseRow\.formssource_GetTableData\/vars\/forms_tableFilter\/conds\/0\/val2\/str$/);
    assert.deepEqual(codes(edited.validation.issues, 'unknown_reference_id').concat(codes(edited.validation.warnings, 'unknown_reference_id')), [], what);
  }
});
test('cd535141: a reference this write brings that names nothing is refused with the component, the path and the id', () => {
  const h = harness(orderColumns);
  const created = h.client.create(ordersApp(), { ...h.auth, tableIndex: orderTables });
  const id = created.form._id;
  const before = h.state.forms[id]._rev;
  const refused = h.client.edit(id, [addMinimum, { action: 'update_field', fieldName: 'orders', patch: filterPatch(referenceText('424242', 'amount_min')) }], h.auth);
  assert.equal(refused.saved, false);
  assert.equal(h.state.forms[id]._rev, before, 'nothing saved');
  const issue = codes(refused.validation.issues, 'unknown_reference_id')[0];
  assert.ok(issue, JSON.stringify(refused.validation.issues));
  assert.match(issue.message, /^orders: the reference \$\$START424242\{\.\.\.\}END424242\$\$ names no component, formula or step of the form \(id 424242\)/);
  assert.match(issue.path, /^\/formulaire\/\d+\/sources\/lib_BaseRow\.formssource_GetTableData\/vars\/forms_tableFilter\/conds\/0\/val2\/str$/);
  // nocode-form-validate says it too, and names the component the c8opath of the reference starts from: an issue for a
  // form not saved yet, a warning for a saved one (its publication is not refused for it).
  const form = clone(h.state.forms[id]);
  byName(form, 'orders').sources['lib_BaseRow.formssource_GetTableData'].vars.forms_tableFilter = filterPatch(referenceText('424242', 'orders.Client.value')).sources['lib_BaseRow.formssource_GetTableData'].vars.forms_tableFilter;
  const unsaved = clone(form);
  delete unsaved._id;
  delete unsaved._rev;
  const validated = api().validate(unsaved).validation;
  const found = codes(validated.issues, 'unknown_reference_id');
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.match(found[0].message, new RegExp('Write the id of orders, ' + byName(form, 'orders').id + ', in START and END'));
  assert.equal(validated.valid, false);
  const stored = api().validate(form).validation;
  assert.deepEqual(codes(stored.issues, 'unknown_reference_id'), []);
  assert.equal(codes(stored.warnings, 'unknown_reference_id').length, 1);
  // In code (type ts) the viewer reads a reference to an unknown id by the name of its payload: not reported.
  const formula = clone(h.state.forms[id]);
  byName(formula, 'orders').sources['lib_BaseRow.formssource_GetTableData'].vars.forms_tableFilter = { str: '', html: false, type: 'filter', condVisible: 'and', groups: [], conds: [{ val1: { name: 'Montant' }, val2: { type: 'ts', str: referenceText('777', '', { pathPrefix: 'fields', name: 'orders' }), html: false, arr: [] }, operator: 'equal' }] };
  delete formula._id;
  assert.deepEqual(codes(api().validate(formula).validation.issues, 'unknown_reference_id'), []);
  // A word as the id, naming nothing: the message says the viewer reads only digits there.
  const word = clone(h.state.forms[id]);
  delete word._id;
  byName(word, 'orders').config.html = '<p>' + referenceText('total_label', '') + '</p>';
  const wordIssue = codes(api().validate(word).validation.issues, 'unknown_reference_id')[0];
  assert.match(wordIssue.message, /has the id "total_label", not a number: the viewer reads only the id of a component there/);
  assert.match(wordIssue.path, /^\/formulaire\/\d+\/config\/html$/);
});
test('cd535141: a reference the saved form already had is reported, not refused, by an edit that does not bring it', () => {
  const h = harness(orderColumns);
  const created = h.client.create(ordersApp(), { ...h.auth, tableIndex: orderTables });
  const id = created.form._id;
  // An older form: a text that reads a component removed since.
  const stored = h.state.forms[id];
  byName(stored, 'orders').config.html = '<p>' + referenceText('1790000000000', 'gone.value') + '</p>';
  const renamed = h.client.edit(id, [{ action: 'set_root', patch: { name: 'Ventes 2' } }], h.auth);
  assert.equal(renamed.saved, true, JSON.stringify(renamed.validation || renamed.error));
  assert.equal(codes(renamed.validation.warnings, 'unknown_reference_id').length, 1);
  assert.equal(renamed.referencesResolved, undefined, 'a reference the edit did not bring is left as it is');
  assert.match(byName(h.state.forms[id], 'orders').config.html, /\$\$START1790000000000\{/);
});
test('cd535141: a reference written by hand in a created form is resolved the same way', () => {
  const reduced = ordersApp();
  reduced.pages[0].fields.unshift({ type: 'text', name: 'min_amount', label: 'Minimum', config: { type: 'number' } });
  reduced.pages[0].fields[1] = { type: 'grid', name: 'orders', label: 'Commandes', sources: filterPatch(referenceText('min_amount', 'min_amount')).sources };
  reduced.pages[0].fields[1].sources['lib_BaseRow.formssource_GetTableData'].vars.forms_config = { table_id: 'Team~>Ventes~>Commandes', table_id_int: 9301, columns: ['Client', 'Montant'], hidden: [], link_row_table_id: [] };
  const compiled = api().compile(reduced);
  assert.equal(compiled.status, 'ok', JSON.stringify(compiled.validation.issues));
  const input = byName(compiled.form, 'min_amount');
  assert.match(filterValue(compiled.form), new RegExp('^\\$\\$START' + input.id + '\\{.*\\}END' + input.id + '\\$\\$$'));
  assert.equal(compiled.referencesResolved.length, 1);
});

// c0b79c0d: what the viewer reads for the markers of a map (viewerPage.yaml of C8Oforms NGX, fillFormSubmit):
//   item.type == "map": if (item["config"]["sourceMarkersEnabled"]) { arraySearch.push("sourcesMarkers"); } (no "sources")
//   postFunc: let columns = JSON.parse(item[search][Object.keys(item[search])[0]].vars.forms_config.str).columns;
//   case "markers": res.data.map((x) => { return { options: { title: x[columns[0]]?.value }, tooltip: x[columns[0]]?.value,
//                   popup: x[columns[0]]?.value, lat: +x[columns[1]]?.value, lng: +x[columns[2]]?.value }; })
function viewerMarkers(item, rows) {
  const layers = [];
  if (item.config.sourceMarkersEnabled) layers.push('sourcesMarkers');
  const markers = [];
  for (const search of layers) {
    const keys = Object.keys(item[search] || {});
    const entry = item[search][keys[0]];
    if (!entry || !entry.enabled) continue;
    const columns = JSON.parse(entry.vars.forms_config.str).columns;
    for (const x of rows) markers.push({ options: { title: x[columns[0]]?.value }, tooltip: x[columns[0]]?.value, popup: x[columns[0]]?.value, lat: +x[columns[1]]?.value, lng: +x[columns[2]]?.value });
  }
  return markers;
}
const siteTables = [{ id: 9401, name: 'Sites', path: 'Team~>Terrain~>Sites' }];
const siteColumns = { 9401: [{ id: 41, name: 'Nom', type: 'text', primary: true }, { id: 42, name: 'Ville', type: 'text' }, { id: 43, name: 'Lat', type: 'number' }, { id: 44, name: 'Lng', type: 'number' }, { id: 45, name: 'Visite', type: 'date' }] };
const siteRows = [{ Ville: { value: 'Lyon' }, Nom: { value: 'Site A' }, Lng: { value: '4.8357' }, Lat: { value: '45.7640' }, Visite: { value: '2026-11-17' } }];
function mapApp(source, extra = {}) {
  return { name: 'Terrain', navigationMode: 'custom', pages: [{ name: 'Carte', fields: [{ type: 'map', name: 'sites_map', label: 'Sites', source, ...extra }] }] };
}
const table = { id: 9401, path: 'Team~>Terrain~>Sites' };
test('c0b79c0d: a map bound to a table writes what the viewer reads for its markers', () => {
  for (const source of [
    { table, title: 'Nom', latitude: 'Lat', longitude: 'Lng' },
    { table, popup: 'Nom', lat: 'Lat', lng: 'Lng', filter: { column: 'Ville', operator: 'equal', value: 'Lyon' } },
    { table, columns: ['Nom', 'Lat', 'Lng'] }
  ]) {
    const compiled = api().compile(mapApp(source));
    assert.equal(compiled.status, 'ok', JSON.stringify(compiled.validation.issues));
    const map = byName(compiled.form, 'sites_map');
    assert.equal(map.config.sourceMarkersEnabled, true);
    assert.deepEqual(Object.keys(map.sourcesMarkers), ['lib_BaseRow.formssource_GetTableData']);
    assert.equal(map.sources, undefined, 'a map has no sources: the viewer never reads them');
    assert.equal(map.config.sourceEnabled, undefined);
    const entry = map.sourcesMarkers['lib_BaseRow.formssource_GetTableData'];
    assert.equal(entry.enabled, true);
    const config = JSON.parse(entry.vars.forms_config.str);
    assert.deepEqual(config.columns, ['Nom', 'Lat', 'Lng']);
    assert.equal(config.table_id_int, 9401);
    assert.equal(config.source_id, map.id);
    if (source.filter) assert.equal(entry.vars.forms_tableFilter.conds[0].val1.name, 'Ville');
    assert.deepEqual(clone(viewerMarkers(map, siteRows)), [{ options: { title: 'Site A' }, tooltip: 'Site A', popup: 'Site A', lat: 45.764, lng: 4.8357 }]);
    assert.deepEqual(codes(compiled.validation.issues.concat(compiled.validation.warnings), 'map_source_not_read'), []);
  }
  // The mapping is complete or refused.
  assert.throws(() => api().compile(mapApp({ table, title: 'Nom', latitude: 'Lat' })), /three columns of the table: source \{ table, title, latitude, longitude \}/);
  assert.throws(() => api().compile(mapApp({ table, columns: ['Lat', 'Lng'] })), /three columns of the table/);
  assert.throws(() => api().compile(mapApp({ table, title: 'Nom', popup: 'Ville', latitude: 'Lat', longitude: 'Lng' })), /one column as its title, tooltip and popup/);
});
test('c0b79c0d: native map sources, an edit of an older map and validate', () => {
  // The native table data of a grid given to a map: moved where the viewer reads it.
  const native = mapApp(undefined, { sources: { 'lib_BaseRow.formssource_GetTableData': { enabled: true, vars: { forms_config: { table_id: table.path, table_id_int: 9401, columns: ['Nom', 'Lat', 'Lng'], hidden: [], link_row_table_id: [] } } } } });
  delete native.pages[0].fields[0].source;
  const compiled = api().compile(native);
  assert.equal(compiled.status, 'ok', JSON.stringify(compiled.validation.issues));
  const map = byName(compiled.form, 'sites_map');
  assert.equal(map.config.sourceMarkersEnabled, true);
  assert.equal(map.sources, undefined);
  assert.equal(viewerMarkers(map, siteRows)[0].lat, 45.764);
  // A map saved the old way (sources): validate reports it, a patch of its source moves it.
  const h = harness(siteColumns);
  const created = h.client.create(mapApp({ table, title: 'Nom', latitude: 'Lat', longitude: 'Lng' }), { ...h.auth, tableIndex: siteTables });
  assert.equal(created.saved, true, JSON.stringify(created.validation || created.error));
  assert.equal(created.bindingFinalization.status, 'ready', JSON.stringify(created.bindingFinalization));
  const id = created.form._id;
  const old = byName(h.state.forms[id], 'sites_map');
  old.sources = old.sourcesMarkers;
  old.sourcesMarkers = {};
  old.config.sourceMarkersEnabled = false;
  old.config.sourceEnabled = true;
  const reported = codes(api().validate(h.state.forms[id]).validation.warnings, 'map_source_not_read');
  assert.equal(reported.length, 1, 'an older map is reported');
  assert.match(reported[0].message, /^sites_map: a map shows no data from sources \(lib_BaseRow\.formssource_GetTableData\): the viewer reads its markers from sourcesMarkers/);
  const repaired = h.client.edit(id, [{ action: 'update_field', fieldName: 'sites_map', patch: { source: { table: 9401, title: 'Nom', latitude: 'Lat', longitude: 'Lng' } } }], { ...h.auth, tableIndex: siteTables });
  assert.equal(repaired.saved, true, JSON.stringify(repaired.validation || repaired.error));
  const saved = byName(h.state.forms[id], 'sites_map');
  assert.equal(saved.config.sourceMarkersEnabled, true);
  assert.equal(saved.sources, undefined);
  assert.equal(saved.config.sourceEnabled, undefined);
  const config = JSON.parse(saved.sourcesMarkers['lib_BaseRow.formssource_GetTableData'].vars.forms_config.str);
  assert.deepEqual([config.columns, config.form_id, config.source_id, config.source_owner], [['Nom', 'Lat', 'Lng'], id, saved.id, h.state.user]);
  assert.equal(viewerMarkers(saved, siteRows)[0].title, undefined, 'the title is in options');
  assert.equal(viewerMarkers(saved, siteRows)[0].options.title, 'Site A');
  // A native sourcesMarkers patch without the switch: the switch is set.
  const switched = h.client.edit(id, [{ action: 'update_field', fieldName: 'sites_map', patch: { config: { sourceMarkersEnabled: false } } }, { action: 'update_field', fieldName: 'sites_map', patch: { sourcesMarkers: { 'lib_BaseRow.formssource_GetTableData': { vars: { forms_tableSort: { str: '', html: false, type: 'sort', conds: [{ name: 'Nom', order: 'asc' }] } } } } } }], h.auth);
  assert.equal(switched.saved, true, JSON.stringify(switched.validation || switched.error));
  assert.equal(byName(h.state.forms[id], 'sites_map').config.sourceMarkersEnabled, true);
  // Too few columns for a marker.
  const short = clone(h.state.forms[id]);
  const shortMap = byName(short, 'sites_map');
  const shortConfig = JSON.parse(shortMap.sourcesMarkers['lib_BaseRow.formssource_GetTableData'].vars.forms_config.str);
  shortConfig.columns = ['Lat', 'Lng'];
  shortMap.sourcesMarkers['lib_BaseRow.formssource_GetTableData'].vars.forms_config.str = JSON.stringify(shortConfig);
  assert.equal(codes(api().validate(short).validation.warnings, 'map_marker_columns').length, 1);
});
test('c0b79c0d: a create warns of a marker column that cannot be a coordinate', () => {
  const h = harness(siteColumns);
  const created = h.client.create(mapApp({ table, title: 'Nom', latitude: 'Visite', longitude: 'Lng' }), { ...h.auth, tableIndex: siteTables });
  assert.equal(created.saved, true, JSON.stringify(created.validation || created.error));
  const warning = codes(created.validation.warnings, 'map_marker_column_type');
  assert.equal(warning.length, 1, JSON.stringify(created.validation.warnings.map(w => w.code)));
  assert.match(warning[0].message, /^sites_map reads its markers from the columns \[title, latitude, longitude\] in this order: the latitude column "Visite" is a date column, not a number/);
  const fine = harness(siteColumns);
  const right = fine.client.create(mapApp({ table, title: 'Nom', latitude: 'Lat', longitude: 'Lng' }), { ...fine.auth, tableIndex: siteTables });
  assert.deepEqual(codes(right.validation.warnings, 'map_marker_column_type'), []);
});
test('the contract tells how a map maps its columns to markers', () => {
  const whole = api().contract({ sections: ['all'] }).authoringContract;
  assert.match(JSON.stringify(whole.componentAuthoring.map), /title, latitude, longitude/);
  assert.match(JSON.stringify(whole.componentAuthoring.map), /sourcesMarkers/);
  assert.match(JSON.stringify(whole.baserowShorthand.dataView), /title, latitude, longitude/);
  const guide = fs.readFileSync(path.join(root, 'resources/convertigo-nocode/sources.md'), 'utf8');
  assert.match(guide, /sourcesMarkers/);
  assert.match(guide, /sourceMarkersEnabled/);
});
