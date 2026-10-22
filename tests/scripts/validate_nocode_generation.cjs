// Run: node --test tests/scripts/validate_nocode_generation.cjs
// Reads the actual Forms prototypes; never writes to a form or a database.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const formsRoot = process.env.C8OFORMS_PROJECT_ROOT || path.resolve(root, '../C8oForms');
const source = fs.readFileSync(path.join(root, 'js/nocode_forms.js'), 'utf8');
function api(transport) {
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
  const engine = { theApp: { databaseObjectsManager: { getOriginalProjectByName: () => ({ getDirFile: () => formsRoot }) }, contextManager: { remove() {} } } };
  const packages = new Proxy(empty, { get: (_, key) => {
    if (key === 'java') return { io: { File }, util: { HashMap: transport ? HashMap : empty, Base64: empty } };
    if (key === 'com') return { twinsoft: { convertigo: { engine: { Engine: engine, requesters: transport ? { InternalRequester, InternalHttpServletRequest: class {} } : empty, util: transport ? { XMLUtils: { XmlToJson: response => JSON.stringify(response) } } : empty, enums: empty } } } };
    if (key === 'org') return { apache: { commons: { io: { FileUtils: { readFileToString: file => fs.readFileSync(file.path, 'utf8') } } } } };
    return empty;
  } });
  const sandbox = { Packages: packages, java: { lang: { System: { currentTimeMillis: () => 1800000000000 }, String, reflect: { Array: { newInstance: () => [] } } } } };
  vm.runInNewContext(source, sandbox, { filename: 'nocode_forms.js' });
  return sandbox.C8O.nocodeForms;
}
const clone = x => JSON.parse(JSON.stringify(x));
function contextExample(defaultFrom, extra = {}) {
  return { name: 'Context defaults test', pages: [{ name: 'Request', fields: [
    { type: 'text', name: 'context_input', ...extra, defaultFrom }
  ] }] };
}
function evaluateDefault(field, runtime = {}) {
  return vm.runInNewContext(field.sources.self.vars.selfVar.str, { api: {}, fields: {}, actions: {}, page: { local: { urlParams: new Map() } }, ...runtime });
}
function visibleQuestion(field) {
  const config = field.type === 'ion-card' ? field.config.title : field.config;
  return config.personalized ? config.html : config[field.type === 'ion-card' ? 'text' : 'label'];
}
test('plain labels replace the HTML prototype for every question component', () => {
  const types = ['text', 'checkbox', 'checkbox_group', 'radio', 'radio_group', 'slider', 'select', 'datetime', 'time', 'img', 'grid', 'gallery', 'chart', 'map', 'barcode', 'file', 'signature', 'location', 'description', 'ion-card'];
  const fields = types.map((type, index) => ({ type, name: 'label_test_' + index, label: 'Question ' + index }));
  const r = api().compile({ name: 'Labels', pages: [{ name: 'Page', fields }] });
  for (const [index, field] of r.form.formulaire.entries()) {
    assert.equal(visibleQuestion(field), 'Question ' + index, field.type);
    assert.doesNotMatch(JSON.stringify(field.config), /Exemple de question/);
  }
});
test('labels coexist with contextual defaults and disabled controls', () => {
  const r = api().compile(contextExample({ source: 'user', property: 'email', fallback: '' }, { label: 'Adresse e-mail', disabled: true }));
  const field = r.form.formulaire[0];
  assert.equal(visibleQuestion(field), 'Adresse e-mail');
  assert.equal(field.config.personalized, true, 'the rich question remains visible for disabled inputs');
  assert.equal(evaluateDefault(field, { api: { user: { authenticated: true, email: 'person@example.invalid' } } }), 'person@example.invalid');
  assert.ok(!r.validation.warnings.some(w => w.code === 'prototype_question_label'));
});
test('explicit rich text and mode take precedence over shorthand labels', () => {
  const variants = [
    { label: 'Plain', description: '<p>Rich question</p>' },
    { label: 'Plain', description: '<p>Shorthand</p>', config: { html: '<strong>Explicit HTML</strong>' } },
    { label: 'Shorthand', config: { label: 'Explicit label' } },
    { label: 'Plain mode', config: { personalized: false } },
    { label: 'Do not restore', config: { html: '', personalized: true } },
    { label: '' }
  ];
  const expected = ['<p>Rich question</p>', '<strong>Explicit HTML</strong>', 'Explicit label', 'Plain mode', '', ''];
  for (const [index, extra] of variants.entries()) {
    const r = api().compile({ name: 'Labels', pages: [{ name: 'Page', fields: [{ type: 'text', name: 'question', ...extra }] }] });
    assert.equal(visibleQuestion(r.form.formulaire[0]), expected[index]);
  }
});
test('literal labels are HTML-escaped but complete SmartSource payloads are preserved', () => {
  const ref = '$$START1900000000101{"c8otype":"path","c8opath":"record.A&B.value","c8obuiltin":null}END1900000000101$$';
  const label = 'A & B <img src=x> "quote" \'apostrophe\' ' + ref;
  const r = api().compile({ name: 'Escaping', pages: [{ name: 'Page', fields: [
    { type: 'text', name: 'record', id: 1900000000101, label: 'Record' },
    { type: 'text', name: 'question', label }
  ] }] });
  assert.equal(r.form.formulaire[1].config.html, 'A &amp; B &lt;img src=x&gt; &quot;quote&quot; &#39;apostrophe&#39; ' + ref);
  assert.equal(r.form.formulaire[1].config.label, label);
});
test('semantic label edits repair persisted HTML and preserve unrelated rich content', () => {
  const h = creationHarness();
  const initial = h.client.create(contextExample({ source: 'literal', value: '' }, { label: 'Original' }), h.auth);
  const id = initial.form._id;
  h.state.forms[id].formulaire[0].config.html = '<p>Exemple de question</p>';
  const repaired = h.client.edit(id, [{ action: 'update_field', fieldName: 'context_input', patch: { label: 'Libellé corrigé' } }], h.auth);
  assert.equal(repaired.saved, true);
  assert.equal(visibleQuestion(repaired.form.formulaire[0]), 'Libellé corrigé');
  assert.equal(repaired.form.formulaire[0].label, undefined);
  const rich = h.client.edit(id, [{ action: 'update_field', fieldName: 'context_input', patch: { description: '<p><b>Rich label</b></p>' } }], h.auth);
  assert.equal(visibleQuestion(rich.form.formulaire[0]), '<p><b>Rich label</b></p>');
  const unrelated = h.client.edit(id, [{ action: 'update_field', fieldName: 'context_input', patch: { config: { boxStyle: { margin: '16px' } } } }], h.auth);
  assert.equal(visibleQuestion(unrelated.form.formulaire[0]), '<p><b>Rich label</b></p>');
  const native = h.client.edit(id, [{ action: 'update_field', fieldName: 'context_input', patch: { config: { label: 'Native label' } } }], h.auth);
  assert.equal(visibleQuestion(native.form.formulaire[0]), 'Native label');
});
test('prototype question diagnostics stay advisory for existing drafts', () => {
  const r = api().compile(contextExample({ source: 'literal', value: '' }));
  assert.ok(r.validation.warnings.some(w => w.code === 'prototype_question_label'));
  assert.equal(api().validate(r.form).validation.valid, true);
});
test('context defaults bind the runtime respondent, not the creator', () => {
  const r = api().compile(contextExample({ source: 'user', property: 'email', fallback: '' }));
  assert.equal(r.status, 'ok');
  const field = r.form.formulaire[0];
  assert.equal(field.config.contextValueMode, 'initial');
  assert.equal(field.defaultFrom, undefined);
  assert.equal(field.sources.self.vars.selfVar.type, 'ts');
  assert.equal(evaluateDefault(field, { api: { user: { authenticated: true, email: 'respondent@example.invalid' } } }), 'respondent@example.invalid');
  assert.equal(evaluateDefault(field, { api: { user: { authenticated: false, email: 'stale@example.invalid' } } }), '');
  assert.equal(evaluateDefault(field), '');
  assert.doesNotMatch(JSON.stringify(r.form), /creator@example/);
});
test('context fallback preserves false, zero and intentionally empty strings', () => {
  for (const value of [false, 0, '', null]) {
    const field = api().compile(contextExample({ source: 'literal', value, fallback: 'fallback' })).form.formulaire[0];
    assert.equal(evaluateDefault(field), value === null ? 'fallback' : value);
  }
});
test('clock defaults use local date for today and ISO instant for now', () => {
  class Clock {
    getFullYear() { return 2026; }
    getMonth() { return 8; }
    getDate() { return 15; }
    toISOString() { return '2026-09-14T22:30:00.000Z'; }
  }
  for (const [property, expected] of [['today', '2026-09-15'], ['now', '2026-09-14T22:30:00.000Z']]) {
    const r = api().compile(contextExample({ source: 'clock', property }, { type: 'datetime' }));
    assert.equal(evaluateDefault(r.form.formulaire[0], { Date: Clock }), expected);
  }
});
test('field defaults resolve forward/nested layout names and literal paths', () => {
  const input = contextExample({ source: 'field', field: 'record', path: ['Reference', 'value'], fallback: '' });
  input.pages[0].fields.push({ type: 'layout', name: 'group', fields: [{ type: 'text', name: 'record' }] });
  const r = api().compile(input);
  assert.equal(r.status, 'ok');
  assert.equal(evaluateDefault(r.form.formulaire[0], { fields: { record: { Reference: { value: 'R-1' } } } }), 'R-1');
  assert.equal(evaluateDefault(r.form.formulaire[0]), '');
  assert.ok(r.validation.warnings.some(w => w.code === 'context_default_source_readiness'));
});
test('context reference failures and dependency cycles block compilation', () => {
  for (const field of ['missing', 'context_input']) {
    const r = api().compile(contextExample({ source: 'field', field }));
    assert.equal(r.status, 'invalid');
    assert.ok(r.validation.issues.some(i => ['unknown_context_field', 'cyclic_context_default'].includes(i.code)));
  }
  const input = contextExample({ source: 'field', field: 'second' });
  input.pages[0].fields.push({ type: 'text', name: 'second', defaultFrom: { source: 'field', field: 'context_input' } });
  assert.ok(api().compile(input).validation.issues.some(i => i.code === 'cyclic_context_default'));
});
test('query parameters are evaluated at runtime without expression injection', () => {
  const parameter = 'ref\";bad()';
  const r = api().compile(contextExample({ source: 'query', parameter, fallback: 'none' }));
  const field = r.form.formulaire[0];
  assert.equal(evaluateDefault(field), 'none');
  assert.equal(evaluateDefault(field, { page: { local: { urlParams: new Map([[parameter, 'R-2']]) } } }), 'R-2');
});
test('explicit calculations retain reactive mode and warn about runtime validation', () => {
  const r = api().compile(contextExample({ source: 'expression', expression: 'fields.quantity * fields.unit_price', mode: 'reactive' }, { config: { type: 'number' }, disabled: true }));
  const field = r.form.formulaire[0];
  assert.equal(field.config.contextValueMode, 'reactive');
  assert.equal(evaluateDefault(field, { fields: { quantity: 3, unit_price: 4 } }), 12);
  assert.ok(r.validation.warnings.some(w => w.code === 'context_expression_runtime_check'));
  assert.ok(!r.validation.warnings.some(w => w.code === 'editable_reactive_value'));
});
test('unknown context vocabulary and conflicting native defaults are not silently dropped', () => {
  for (const spec of [
    { source: 'user', property: 'firstName' }, { source: 'user', property: 'sessionId' },
    { source: 'clock', property: 'serverTime' }, { source: 'literal' },
    { source: 'literal', value: 0, mode: 'once' }, { source: 'literal', value: 0, typo: true },
    { source: 'field', field: 'x', path: ['__proto__'] }
  ]) assert.throws(() => api().compile(contextExample(spec)));
  for (const extra of [{ sources: {} }, { defaultValue: '' }, { config: { defaultvalue: 0 } }, { type: 'grid' }, { type: 'select' }]) {
    assert.throws(() => api().compile(contextExample({ source: 'literal', value: 0 }, extra)));
  }
});
test('known incompatible literal types are rejected', () => {
  assert.equal(api().compile(contextExample({ source: 'literal', value: 'bad' }, { type: 'slider' })).status, 'invalid');
  assert.equal(api().compile(contextExample({ source: 'literal', value: {} })).status, 'invalid');
  assert.equal(api().compile(contextExample({ source: 'literal', value: 0 }, { type: 'slider' })).status, 'ok');
});
test('semantic edits persist contextual defaults and preserve unrelated sources', () => {
  const h = creationHarness();
  const created = h.client.create(contextExample({ source: 'literal', value: 'old' }), h.auth);
  const edited = h.client.edit(created.form._id, [{ action: 'update_field', fieldName: 'context_input', patch: { defaultFrom: { source: 'user', property: 'name', fallback: '' } } }], h.auth);
  assert.equal(edited.saved, true);
  assert.equal(edited.form.formulaire[0].defaultFrom, undefined);
  assert.equal(edited.form.formulaire[0].config.contextDefault.property, 'name');
  const before = clone(edited.form.formulaire[0].sources);
  const unrelated = h.client.edit(created.form._id, [{ action: 'update_field', fieldName: 'context_input', patch: { config: { placeholder: 'Your name' } } }], h.auth);
  assert.deepEqual(clone(unrelated.form.formulaire[0].sources), before);
});
function example() {
  return {
    name: 'Generation quality test', navigationMode: 'custom',
    pages: [
      { name: 'Home', fields: [
        { type: 'description', name: 'welcome', description: '<h2>Welcome</h2>', boxStyle: { margin: '0 0 16px 0', padding: '20px', border: '1px solid #E2E8F0', borderRadius: '12px' } },
        { type: 'button', name: 'open', label: 'Requests', icon: 'list', flow: 'open' }
      ] },
      { name: 'Requests', fields: [
        { type: 'grid', name: 'requests', sourceEnabled: false, columns: [{ name: 'Reference', type: 'text' }, { name: 'Status', type: 'text' }] },
        { type: 'button', name: 'example', label: 'Add demo row', flow: 'example' },
        { type: 'button', name: 'back', label: 'Home', flow: 'back' }
      ] }
    ],
    flows: [
      { id: 'open', elements: [{ type: 'push_page', targetPage: 'Requests' }] },
      { id: 'back', elements: [{ type: 'push_page', targetPage: 'Home' }] },
      { id: 'example', elements: [{ type: 'add_row_to_local_grid', targetGrid: 'requests', row: { Reference: 'DEMO-001', Status: 'Pending' } }, { type: 'toast', message: 'Example added', duration: 5 }] }
    ]
  };
}
test('custom navigation resolves names and preserves native styles', () => {
  const r = api().compile(example());
  assert.equal(r.status, 'ok');
  assert.ok(r.form.pages.every(p => !p.enabledTab && !p.enabledButtons));
  assert.equal(r.form.flows.find(f => f.id === 'open').elements[0].config.targetPage, r.form.pages[1].pageTechName);
  assert.deepEqual(clone(r.form.formulaire[0].config.boxStyle), example().pages[0].fields[0].boxStyle);
});
test('toast message reaches the source read by Forms, with no prototype value', () => {
  const r = api().compile(example());
  const toast = r.form.flows.find(f => f.id === 'example').elements[1];
  assert.equal(toast.sources.self.vars.selfVar.str, 'Example added');
  assert.equal(toast.config.duration, 5);
  assert.equal(toast.message, undefined);
  assert.doesNotMatch(JSON.stringify(toast), /toast_example/);
});
test('explicit SmartSource is preserved, including false and zero values', () => {
  const input = example();
  const sources = { self: { enabled: true, vars: { selfVar: { str: '0', type: 'ts', html: false } } } };
  input.flows[2].elements[1] = { type: 'toast', message: 'ignored', sources, closeBtn: false };
  const toast = api().compile(input).form.flows[4].elements[1];
  assert.deepEqual(clone(toast.sources), sources);
  assert.equal(toast.config.closeBtn, false);
});
test('local row shorthand resolves grid identity and preserves literal JSON', () => {
  const r = api().compile(example());
  const step = r.form.flows.find(f => f.id === 'example').elements[0];
  assert.equal(step.config.targetGrid, r.form.formulaire.find(f => f.name === 'requests').id);
  assert.deepEqual(clone(vm.runInNewContext(step.sources.self.vars.selfVar.str)), { Reference: 'DEMO-001', Status: 'Pending' });
  assert.ok(r.validation.warnings.some(w => w.code === 'local_grid_not_persistent'));
});
test('unknown page and grid references are blocking', () => {
  for (const [flow, key] of [[0, 'targetPage'], [2, 'targetGrid']]) {
    const input = example(); input.flows[flow].elements[0][key] = 'missing';
    assert.equal(api().compile(input).status, 'invalid');
  }
});
test('empty submit and residual toast placeholders fail new generation', () => {
  for (const step of [{ type: 'submit' }, { type: 'toast' }, { type: 'toast', message: 'toast_example' }]) {
    const input = example(); input.flows[2].elements = [step];
    const r = api().compile(input);
    assert.equal(r.status, 'invalid');
    assert.ok(r.validation.issues.length > 0);
    assert.equal(api().validate(r.form).validation.valid, true, 'existing drafts remain editable');
    assert.ok(api().validate(r.form).validation.warnings.length > 0);
  }
});
test('empty buttons and unbound source grids fail new generation', () => {
  const input = example(); input.flows[2].elements = [];
  input.pages[1].fields[0].sourceEnabled = true;
  const r = api().compile(input);
  assert.ok(r.validation.issues.some(i => i.code === 'empty_button_flow'));
  assert.ok(r.validation.issues.some(i => i.code === 'grid_without_source'));
});
test('unsupported seed properties cannot be silently dropped', () => {
  const input = example(); input.pages[1].fields[0].sampleRows = [{ Reference: 'demo' }];
  assert.throws(() => api().compile(input), /Unsupported grid seed property/);
});
test('CSS types are checked without imposing a theme on existing forms', () => {
  const input = example(); input.pages[0].fields[0].boxStyle.padding = 20;
  assert.ok(api().compile(input).validation.issues.some(i => i.code === 'invalid_style_value'));
});
test('explicit backend action vars are kept without inventing persistence', () => {
  const input = example();
  const actions = { 'lib_BaseRow.forms_AddRow': { enabled: true, vars: { forms_config: { str: '{"table_id_int":42,"table_id":"Test workspace~>Test database~>Requests"}', html: false }, forms_id: { str: '', html: false } } } };
  input.flows[2].elements = [{ type: 'submit', actions }];
  const r = api().compile(input);
  assert.equal(r.status, 'ok');
  const step = r.form.flows.find(f => f.id === 'example').elements[0];
  const expected = clone(actions);
  const config = JSON.parse(expected['lib_BaseRow.forms_AddRow'].vars.forms_config.str);
  config.source_id = step.id;
  expected['lib_BaseRow.forms_AddRow'].vars.forms_config.str = JSON.stringify(config);
  assert.deepEqual(clone(step.actions), expected);
});
test('legacy tab default remains available; contract recommends an explicit choice', () => {
  const input = example(); delete input.navigationMode;
  assert.ok(api().compile(input).form.pages.every(p => p.enabledTab));
  const contract = api().contract().authoringContract;
  assert.ok(contract.rootFields.navigationMode.enum.includes('custom'));
  assert.ok(contract.generationQuality.styles.scopes.boxStyle);
});
test('the legacy transient-grid regression fixture still compiles', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/nocode-generation-quality.json'), 'utf8'));
  const r = api().compile(fixture);
  assert.equal(r.status, 'ok');
  assert.deepEqual(clone(r.validation.issues), []);
  assert.equal(r.form.formulaire.find(f => f.name === 'demandeur').id, 1900000000101);
});

test('flow names use explicit labels, button labels or humanized ids, including reserved flows', () => {
  const input = example();
  input.flows[1].name = 'Retour accueil';
  input.flows.push({ id: 'formulas', name: 'Calculs', elements: [] });
  input.flows.push({ id: 'submit', name: 'Soumission', elements: [] });
  input.flows.push({ id: 'update_request_status', elements: [] });
  const flows = api().compile(input).form.flows;
  assert.equal(flows.find(f => f.id === 'open').name, 'Requests');
  assert.equal(flows.find(f => f.id === 'back').name, 'Retour accueil');
  assert.equal(flows.find(f => f.id === 'formulas').name, 'Calculs');
  assert.equal(flows.find(f => f.id === 'submit').name, 'Soumission');
  assert.equal(flows.find(f => f.id === 'update_request_status').name, 'Update request status');
  assert.ok(flows.every(f => f.name.trim()));
  const saved = api().compile(input).form;
  delete saved.flows[2].name;
  assert.ok(api().validate(saved).validation.warnings.some(w => w.code === 'missing_flow_name'));
});

test('adjacent page buttons and partial styling trigger review without rewriting the design', () => {
  const r = api().compile({ ...example(), styleDefaults: false });
  assert.ok(r.validation.warnings.some(w => w.code === 'ungrouped_adjacent_buttons'));
  assert.ok(r.validation.warnings.some(w => w.code === 'partial_page_styling'));
  assert.equal(r.form.formulaire.filter(f => f.type === 'layout').length, 0);
});

test('responsive action groups preserve child styles and explicit config takes precedence', () => {
  const input = example();
  const fields = input.pages[1].fields;
  const row = clone(api().contract().authoringContract.componentAuthoring.layout.actionGroupExample);
  row.children = fields.splice(1);
  row.children.forEach(f => { f.boxStyle = { margin: '0', padding: '8px', border: '0' }; });
  row.layoutChildrenStyle = { default: { padding: '8px' }, first: { margin: '0' }, last: { margin: '0' } };
  row.config = { tablet: [{ size: 12 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }] };
  fields.push(row);
  const r = api().compile(input);
  assert.equal(r.status, 'ok');
  assert.ok(!r.validation.warnings.some(w => w.code === 'ungrouped_adjacent_buttons'));
  const layout = r.form.formulaire.find(f => f.type === 'layout');
  assert.deepEqual(clone(layout.config.cols), row.cols);
  assert.deepEqual(clone(layout.config.tablet), row.config.tablet);
  assert.deepEqual(clone(layout.config.phoneP), row.phoneP);
  assert.deepEqual(clone(layout.config.layoutChildrenStyle), row.layoutChildrenStyle);
  for (const id of layout.childrenRefs) {
    const child = r.form.formulaire.find(f => f.id === id);
    assert.equal(child.parentRef, layout.id);
    assert.deepEqual(clone(child.config.boxStyle), { margin: '0', padding: '8px', border: '0', backgroundColor: 'transparent' });
  }
});

test('invalid layout child spacing and multi-value CSS lengths are rejected', () => {
  const input = example();
  input.pages[0].fields[0].layoutChildrenStyle = { default: { padding: 16 } };
  input.pages[0].fields[0].boxStyle.margin = '0 16';
  const issues = api().compile(input).validation.issues;
  assert.ok(issues.some(i => i.code === 'invalid_style_value'));
  assert.ok(issues.some(i => i.code === 'missing_style_unit'));
});

// Compiler-only Baserow identities: no network calls, records or delivered application.
function connectedExample() {
  const input = example();
  const grid = input.pages[1].fields[0];
  grid.id = 1900000000300;
  grid.sourceEnabled = true;
  const config = id => ({ str: JSON.stringify({ table_id: 'Test workspace~>Test database~>Requests', table_id_int: 42, columns: ['Reference', 'Status'], form_id: 'test-form', source_id: id, source_owner: 'test@example.invalid' }), html: false });
  grid.sources = { 'lib_BaseRow.formssource_GetTableData': { enabled: true, vars: { forms_config: config(grid.id) } } };
  input.pages[1].fields.push({type:'text',name:'Reference',description:'Reference'});
  input.flows[2] = { id: 'example', name: 'Save request', elements: [{ type: 'submit', id: 1900000000301, name: 'save_request', actions: { 'lib_BaseRow.forms_AddRow': { enabled: true, vars: { forms_config: config(1900000000301), forms_id: { str: '', html: false }, forms_createColumn: { str: 'false', html: false } } } } }] };
  return input;
}

test('Baserow save and read bindings preserve the same table and their own identities', () => {
  const r = api().compile(connectedExample());
  assert.equal(r.status, 'ok');
  const grid = r.form.formulaire.find(f => f.type === 'grid');
  const submit = r.form.flows.find(f => f.id === 'example').elements[0];
  const read = JSON.parse(grid.sources['lib_BaseRow.formssource_GetTableData'].vars.forms_config.str);
  const write = JSON.parse(submit.actions['lib_BaseRow.forms_AddRow'].vars.forms_config.str);
  assert.equal(read.table_id_int, write.table_id_int);
  assert.equal(read.source_id, grid.id);
  assert.equal(write.source_id, submit.id);
  assert.ok(r.validation.warnings.some(w => w.code === 'baserow_identity_pending_creation'));
  assert.equal(read.form_id, undefined);
  assert.equal(write.source_owner, undefined);
  assert.equal(r.bindingFinalization.status, 'pending_creation');
});

test('unconfigured Baserow actions and sources fail generation without blocking existing drafts', () => {
  for (const encoded of ['{}', 'invalid json', JSON.stringify({ table_id: 'Requests', table_id_int: -1 })]) {
    const input = connectedExample();
    input.flows[2].elements[0].actions['lib_BaseRow.forms_AddRow'].vars.forms_config.str = encoded;
    input.pages[1].fields[0].sources['lib_BaseRow.formssource_GetTableData'].vars.forms_config.str = encoded;
    const r = api().compile(input);
    assert.equal(r.status, 'invalid');
    assert.ok(r.validation.issues.some(i => /baserow/.test(i.code)));
    assert.equal(api().validate(r.form).status, 'ok');
  }
});

test('Baserow explicit saves require data and saved bindings must belong to their form', () => {
  const input = connectedExample();
  const step = input.flows[2].elements[0];
  step.actions['lib_BaseRow.forms_AddRowFromData'] = step.actions['lib_BaseRow.forms_AddRow'];
  delete step.actions['lib_BaseRow.forms_AddRow'];
  assert.ok(api().compile(input).validation.issues.some(i => i.code === 'missing_baserow_values'));
  step.actions['lib_BaseRow.forms_AddRowFromData'].vars.forms_freeVars = { str: '{"Reference":"value supplied by caller"}', html: false };
  const compiled = api().compile(input);
  assert.equal(compiled.status, 'ok');
  compiled.form._id = 'different-form';
  const source = compiled.form.formulaire.find(f => f.type === 'grid').sources['lib_BaseRow.formssource_GetTableData'].vars.forms_config;
  source.str = JSON.stringify({ ...JSON.parse(source.str), form_id: 'another-form', source_owner: 'test@example.invalid' });
  assert.ok(api().validate(compiled.form).validation.warnings.some(i => i.code === 'baserow_form_identity_mismatch'));
});

test('shared flows do not borrow one arbitrary button label and dynamic labels stay out of names', () => {
  const input = example();
  input.pages[0].fields.push({ type: 'button', name: 'second_open', label: 'Different label', flow: 'open' });
  input.pages[1].fields[2].label = '$$START123dynamicEND123$$';
  const flows = api().compile(input).form.flows;
  assert.equal(flows.find(f => f.id === 'open').name, 'Open');
  assert.equal(flows.find(f => f.id === 'back').name, 'Back');
});

test('native design recipes survive compilation across sections, fields, data and grouped actions', () => {
  const compiler = api();
  const recipes = clone(compiler.contract().authoringContract.generationQuality.styles.recipes);
  const input = connectedExample();
  Object.assign(input.pages[0].fields[0], recipes.welcome);
  Object.assign(input.pages[1].fields[0], recipes.dataView);
  const actions = input.pages[1].fields.splice(1);
  actions.forEach(button => Object.assign(button, recipes.buttonInsideGroup));
  const group = clone(compiler.contract().authoringContract.componentAuthoring.layout.actionGroupExample);
  Object.assign(group, recipes.actionGroup, { children: actions });
  input.pages[1].fields.push(group);
  const section = { type: 'layout', name: 'request_details', ...recipes.section, fields: [
    { type: 'text', name: 'reference', description: 'Reference', ...recipes.fieldInsideSection }
  ] };
  input.pages[1].fields.unshift(section);
  const r = compiler.compile(input);
  assert.equal(r.status, 'ok');
  const fields = r.form.formulaire;
  for (const [name, recipe] of [['welcome', 'welcome'], ['requests', 'dataView'], ['request_details', 'section'], ['reference', 'fieldInsideSection'], [group.name, 'actionGroup'], ['back', 'buttonInsideGroup']]) {
    assert.deepEqual(clone(fields.find(f => f.name === name).config.boxStyle), recipes[recipe].boxStyle);
  }
  const child = fields.find(f => f.name === 'reference');
  assert.equal(child.parentRef, fields.find(f => f.name === 'request_details').id);
  assert.equal(child.config.boxStyle.padding, '0', 'child does not duplicate section padding');
  assert.equal(fields.find(f => f.name === 'back').parentRef, fields.find(f => f.name === group.name).id);
  assert.ok(!r.validation.warnings.some(w => w.code === 'ungrouped_adjacent_buttons'));
});

test('transparent standalone button wrappers preserve the actual button fill', () => {
  const compiler = api();
  const input = example();
  const button = input.pages[0].fields[1];
  Object.assign(button, clone(compiler.contract().authoringContract.generationQuality.styles.recipes.standaloneButton));
  button.backgroundColor = '#2F6FED';
  button.color = '#FFFFFF';
  const result = compiler.compile(input);
  assert.equal(result.status, 'ok');
  const saved = result.form.formulaire.find(f => f.name === button.name);
  assert.equal(saved.config.boxStyle.backgroundColor, 'transparent');
  assert.equal(saved.config.boxStyle.border, '0');
  assert.equal(saved.config.backgroundColor, '#2F6FED');
  assert.equal(saved.config.color, '#FFFFFF');
});
test('nested flow relationships and else branches survive compilation', () => {
  const input = example();
  input.flows[2].elements = [
    { type: 'if_else', id: 1900000000201, condition: { field: 'requests', operator: 'is_filled' }, childrenRefs: [1900000000202], childrenRefsElse: [1900000000203] },
    { type: 'toast', id: 1900000000202, parentRef: 1900000000201, message: 'Then' },
    { type: 'toast', id: 1900000000203, parentRef: 1900000000201, message: 'Else' }
  ];
  const r = api().compile(input);
  assert.equal(r.status, 'ok');
  const elements = r.form.flows.find(f => f.id === 'example').elements;
  assert.equal(elements[2].parentRef, elements[0].id);
  assert.equal(elements[0].childrenRefsElse[0], elements[2].id);
});
test('flow ids are unique across flows and CSS nonzero lengths need units', () => {
  const input = example();
  input.flows[0].elements[0].id = 1900000000201;
  input.flows[1].elements[0].id = 1900000000201;
  input.pages[0].fields[0].boxStyle.padding = '20';
  const issues = api().compile(input).validation.issues;
  assert.ok(issues.some(i => i.code === 'invalid_flow_element_id'));
  assert.ok(issues.some(i => i.code === 'missing_style_unit'));
});
test('save readback returns authoritative ids and does not retry a successful write', () => {
  const start = source.indexOf('  function attachSavedForm(');
  const end = source.indexOf('  C8O.nocodeForms.create =', start);
  let actual = { _id: 'created-id', _rev: '2-saved', name: 'Persisted name' };
  const ctx = { clone, getForm: () => actual, validateForm: () => ({ validation: { valid: true, warnings: [], warningCount: 0 } }) };
  vm.runInNewContext(source.slice(start, end), ctx);
  const saved = () => ({ saved: true, response: { id: 'created-id', rev: '1-created' }, validation: { warnings: [], warningCount: 0 } });
  const verified = ctx.attachSavedForm(saved(), { name: 'Compiled name' }, {});
  assert.equal(verified.readbackVerified, true);
  assert.equal(verified.form.name, 'Persisted name');
  actual = { fetched: false };
  const unverified = ctx.attachSavedForm(saved(), { name: 'Compiled name' }, {});
  assert.equal(unverified.saved, true);
  assert.equal(unverified.readbackVerified, false);
  assert.equal(unverified.form._id, 'created-id');
  assert.equal(unverified.validation.warnings[0].code, 'saved_form_readback_unavailable');
});

// Exercise the entire public create/edit path, mocking only the external
// requestable transport. No real bearer token, form, table or row is involved.
function creationHarness(options = {}) {
  const state = { forms: {}, saves: 0, reads: 0, creates: 0, calls: [], user: 'creator@example.invalid' };
  const guardContext = {};
  vm.runInNewContext(fs.readFileSync(path.join(formsRoot, 'js/form_write_guard.js'), 'utf8'), guardContext);
  const client = api((sequence, params) => {
    state.calls.push(sequence);
    if (sequence === 'nocode_validate_token') return { document: { result: { authenticated: !options.authFail, user: state.user } } };
    if (sequence === 'formscommon_ApplicationsList') return { document: { array: [] } };
    if (sequence === 'formscommon_FieldsList') {
      // Like lib_BaseRow, the field list is empty until a Baserow session exists.
      if (options.fieldsNeedSession && !state.calls.includes('formscommon_ApplicationsList')) return { document: {} };
      return { document: { array: options.columns || [{name:'Reference',type:'text'},{name:'Status',type:'text'}] } };
    }
    if (sequence === 'APIV2_getDocument') {
      state.reads++;
      if (options.failRead === state.reads) return { document: { res: {} } };
      if (options.onRead) options.onRead(state);
      return { document: { res: clone(state.forms[params.id] || {}) } };
    }
    if (sequence === 'APIV2_updateFormulaireDocument') {
      state.saves++;
      if (options.throwSave === state.saves) throw new Error('Simulated transport failure');
      if (options.failSave === state.saves) return { document: { res: { error: 'Simulated save failure' } } };
      const form = JSON.parse(params.meta);
      const guarded = guardContext.c8oFormWriteGuard.prepare(form, id => state.forms[id]);
      if (guarded.error) return { document: { res: guarded.error } };
      // Simulate another writer after the server preflight, at the DB boundary.
      if (options.beforeWrite) options.beforeWrite(state, form);
      if (guarded.enabled && (!state.forms[form._id] || state.forms[form._id]._rev !== form._rev)) {
        return { document: { res: { error: 'conflict', reason: 'Document update conflict.' } } };
      }
      if (!form._id) {
        state.creates++;
        form._id = 'server-form-' + state.creates;
        form.creator = state.user;
        form['~c8oAcl'] = state.user;
        if (options.onCreate) options.onCreate(form);
      }
      const current = state.forms[form._id];
      form._rev = String(current ? Number(current._rev.split('-')[0]) + 1 : 1) + '-saved';
      state.forms[form._id] = clone(form);
      return { document: { res: { ok: true, id: form._id, rev: form._rev } } };
    }
    throw new Error('Unexpected requestable ' + sequence);
  });
  return { state, client, options, auth: { token: 'unit-test-token-not-a-credential' } };
}

test('atomic revision conflict rejects writes racing after the preflight, including deletion', () => {
  for (const remove of [false, true]) {
    const h = creationHarness({ beforeWrite(state, form) {
      if (state.saves !== 2) return;
      if (remove) delete state.forms[form._id];
      else { state.forms[form._id]._rev = '2-concurrent'; state.forms[form._id].name = 'User edit'; }
    } });
    const r = h.client.create(connectedWithoutIdentities(), h.auth);
    assert.equal(r.saved, true);
    assert.equal(r.status, 'partial');
    assert.equal(r.bindingFinalization.code, 'form_changed_before_finalization');
    assert.equal(h.state.creates, 1);
    if (!remove) assert.equal(h.state.forms[r.form._id].name, 'User edit');
  }
});

test('ordinary semantic edits reject conflicts and cannot replace document identity', () => {
  const h = creationHarness();
  const start = h.client.create(example(), h.auth);
  const id = start.form._id;
  h.options.beforeWrite = (state, form) => { state.forms[id]._rev = '2-concurrent'; state.forms[id].name = 'User edit'; };
  const r = h.client.edit(id, [{action:'set_root', patch:{name:'AI edit'}}], h.auth);
  assert.equal(r.status, 'conflict');
  assert.equal(r.saved, false);
  assert.equal(h.state.forms[id].name, 'User edit');
  delete h.options.beforeWrite;
  const updated = h.client.update(id, {_id:'other-form', _rev:'fake', name:'New name'}, h.auth);
  assert.equal(updated.status, 'ok');
  assert.equal(updated.form._id, id);
  assert.equal(h.state.creates, 1);
});

test('write guard preserves attachments and leaves legacy calls unchanged', () => {
  const ctx = {};
  vm.runInNewContext(fs.readFileSync(path.join(formsRoot, 'js/form_write_guard.js'), 'utf8'), ctx);
  const prepare = ctx.c8oFormWriteGuard.prepare;
  const current = {_id:'one', _rev:'3-live', _attachments:{thumbnail:{stub:true, digest:'md5-test'}}};
  const meta = {_id:'one', _rev:'bad', _c8oExpectedRevision:'3-live'};
  assert.equal(prepare(meta, () => current).enabled, true);
  assert.equal(meta._rev, current._rev);
  assert.deepEqual(clone(meta._attachments), current._attachments);
  assert.equal(meta._c8oExpectedRevision, undefined);
  assert.equal(prepare({_id:'one'}, () => { throw Error('Legacy path must not read'); }).enabled, false);
  for (const revision of ['', null, '2-old']) {
    assert.equal(prepare({_id:'one',_c8oExpectedRevision:revision}, () => current).error.error, 'conflict');
  }
  assert.equal(prepare({_id:'one',_c8oExpectedRevision:'3-live'}, () => null).error.error, 'conflict');
});

test('new Baserow binding in an existing form is ready in one edit write', () => {
  const h = creationHarness();
  const start = h.client.create(example(), h.auth);
  const field = connectedWithoutIdentities().pages[1].fields[0];
  field.name = 'new_grid';
  const saves = h.state.saves;
  const r = h.client.edit(start.form._id, [{action:'add_field',pageName:'Requests',fieldObject:field}],h.auth);
  assert.equal(r.status, 'ok');
  assert.equal(r.bindingFinalization.status, 'ready');
  assert.equal(h.state.saves, saves + 1);
  const grid = r.form.formulaire.find(f => f.name === 'new_grid');
  const config = JSON.parse(grid.sources['lib_BaseRow.formssource_GetTableData'].vars.forms_config.str);
  assert.equal(config.form_id, start.form._id);
  assert.equal(config.source_id, grid.id);
  assert.equal(config.source_owner, h.state.user);
});

test('editing Baserow business config preserves another connection owner', () => {
  const h = creationHarness();
  const start = h.client.create(connectedWithoutIdentities(), h.auth);
  const grid = start.form.formulaire.find(f => f.type === 'grid');
  const sources = clone(grid.sources);
  const variable = sources['lib_BaseRow.formssource_GetTableData'].vars.forms_config;
  variable.str = JSON.stringify({...JSON.parse(variable.str), columns:['Reference'],source_owner:'do-not-trust-input'});
  h.state.user = 'collaborator@example.invalid';
  const r = h.client.edit(start.form._id,[{action:'update_field',fieldName:grid.name,patch:{sources}}],h.auth);
  assert.equal(r.bindingFinalization.status, 'ready');
  const actual = JSON.parse(r.form.formulaire.find(f => f.type === 'grid').sources['lib_BaseRow.formssource_GetTableData'].vars.forms_config.str);
  assert.equal(actual.source_owner,'creator@example.invalid');
  assert.deepEqual(actual.columns,['Reference']);
});

test('edited bindings are strictly validated; broken readback is not marked ready', () => {
  const h = creationHarness();
  const start = h.client.create(example(), h.auth);
  const field = connectedWithoutIdentities().pages[1].fields[0];
  const variable = field.sources['lib_BaseRow.formssource_GetTableData'].vars.forms_config;
  variable.str = '{}';
  const invalid = h.client.edit(start.form._id,[{action:'add_field',pageName:'Requests',fieldObject:field}],h.auth);
  assert.equal(invalid.status, 'invalid');
  assert.equal(h.state.saves, 1);
  const validField = connectedWithoutIdentities().pages[1].fields[0]; validField.name = 'new_grid';
  h.options.onRead = state => { if (state.saves > 1) state.forms[start.form._id].formulaire.find(f=>f.name==='new_grid').sources = {}; };
  const partial = h.client.edit(start.form._id,[{action:'add_field',pageName:'Requests',fieldObject:validField}],h.auth);
  assert.equal(partial.saved, true);
  assert.equal(partial.status,'partial');
  assert.equal(partial.bindingFinalization.status,'pending');
});

test('add_page preserves custom navigation and honors explicit modes', () => {
  const h = creationHarness();
  const start = h.client.create(example(), h.auth);
  for (const navigationMode of [undefined,'custom','tabs','buttons']) {
    const r = h.client.edit(start.form._id,[{action:'add_page',name:'Added '+navigationMode,navigationMode}],h.auth);
    const page = r.form.pages[r.form.pages.length - 1];
    assert.equal(page.enabledTab,navigationMode==='tabs');
    assert.equal(page.enabledButtons,navigationMode==='buttons');
  }
});

test('delete row ids and explicit value mappings reject malformed generation', () => {
  for (const rowId of ['', '0','-1','not-an-id']) {
    const input = connectedWithoutIdentities();
    const step = input.flows[2].elements[0];
    const entry = step.actions['lib_BaseRow.forms_AddRow'];
    entry.vars.forms_id={str:rowId,html:false};
    step.actions={'lib_BaseRow.forms_DeleteRow':entry};
    assert.equal(api().compile(input).status,'invalid');
  }
  for (const mapping of ['{}','[]','nonsense','{" ":"value"}']) {
    const input = connectedWithoutIdentities();
    const step = input.flows[2].elements[0];
    const entry = step.actions['lib_BaseRow.forms_AddRow'];
    entry.vars.forms_freeVars={str:mapping,html:false};
    step.actions={'lib_BaseRow.forms_AddRowFromData':entry};
    assert.ok(api().compile(input).validation.issues.some(i=>i.code==='invalid_baserow_values'));
  }
});

test('save checks discovered table columns and rejects unmapped inputs before creation', () => {
  for (const mode of ['unknown-column','unmapped-input','unavailable']) {
    const h = creationHarness(mode === 'unavailable' ? {columns:[]} : {});
    const input = connectedWithoutIdentities();
    if (mode === 'unknown-column') {
      const variable = input.pages[1].fields[0].sources['lib_BaseRow.formssource_GetTableData'].vars.forms_config;
      variable.str=JSON.stringify({...JSON.parse(variable.str),columns:['Does not exist']});
    }
    if (mode === 'unmapped-input') input.pages[1].fields.find(f=>f.name==='Reference').name='wrongTechnicalName';
    const r = h.client.create(input,h.auth);
    assert.equal(r.status,'invalid');
    assert.equal(r.saved,false);
    assert.equal(h.state.creates,0);
    assert.ok(r.validation.issues.some(i=>i.code===({'unknown-column':'unknown_baserow_column','unmapped-input':'unmapped_baserow_inputs','unavailable':'baserow_schema_unavailable'}[mode])));
  }
});

test('column verification opens a Baserow session once when the fresh MCP session has no token', () => {
  const h = creationHarness({fieldsNeedSession:true});
  const r = h.client.create(connectedWithoutIdentities(),h.auth);
  assert.equal(r.status,'ok');
  assert.equal(r.saved,true);
  assert.equal(h.state.calls.filter(s=>s==='formscommon_ApplicationsList').length,1);
  assert.ok(!r.validation.issues.some(i=>i.code==='baserow_schema_unavailable'));

  const still = creationHarness({columns:[]});
  const failed = still.client.create(connectedWithoutIdentities(),still.auth);
  assert.equal(failed.saved,false);
  assert.equal(still.state.calls.filter(s=>s==='formscommon_ApplicationsList').length,1);
  assert.ok(failed.validation.issues.some(i=>i.code==='baserow_schema_unavailable' && /Do not remove the connection/.test(i.message)));
});

test('malformed reduced JSON is refused instead of compiling into an empty form', () => {
  const client = api();
  const truncated = '{"description":"d"}}, "name":"Bad","pages":[{"name":"P","fields":[{"type":"text","name":"a","label":"A"}]}]}';
  assert.throws(() => client.assertStrictJsonText(truncated, 'reduced'), /reduced is not valid JSON/);
  assert.throws(() => client.assertStrictJsonText('{"name":"Bad","pages":[{"name":"P","fields":[', 'reduced'), /left open/);
  assert.throws(() => client.assertStrictJsonText('{"name":"x"} trailing', 'reduced'), /after the end of the JSON value/);
  assert.throws(() => client.assertStrictJsonText('{"name":"unterminated', 'reduced'), /unterminated string/);
  assert.equal(client.assertStrictJsonText('{"name":"ok","pages":[{"fields":[{"type":"text","name":"a","label":"A {x}"}]}]}', 'reduced'), true);
  assert.equal(client.assertStrictJsonText(' [1, {"a": "]"}] ', 'ops'), true);
  assert.throws(() => client.parseObject(truncated, 'reduced', {}), /reduced is not valid JSON/);
});

test('invalid reduced JSON errors name the position, the surrounding text and the received length', () => {
  const client = api();
  const extraBrace = '{"name":"x","pages":[{"name":"P","fields":[{"type":"text","name":"a","label":"A"}}]}]}';
  assert.throws(() => client.assertStrictJsonText(extraBrace, 'reduced'), e => /unexpected '\}': the array opened at position 42 must be closed with '\]' first at position 81/.test(e.message) && e.message.includes(extraBrace.length + ' characters were received in full') && e.message.includes('"label":"A"}}]}]}...'));
  const contract = client.contract({});
  assert.ok(contract.authoringContract.generationQuality.incrementalCreation.step1.includes('nocode-form-create'));
  assert.ok(/not as a string/.test(contract.authoringContract.generationQuality.incrementalCreation.rule));
});

test('the contract states update capabilities and recipes next to the backend actions', () => {
  const text = JSON.stringify(api().contract({}));
  assert.match(text, /UPDATE an existing row when forms_id holds its Baserow row id/);
  assert.match(text, /updateRelatedTable/);
  assert.match(text, /quote the sentence that establishes the limit/);
});

test('a reduced form without any component is invalid and never created', () => {
  const client = api();
  const r = client.compile({ description: 'orphan', flows: [] });
  assert.equal(r.status, 'invalid');
  assert.ok(r.validation.issues.some(i => i.code === 'empty_form'));
  const h = creationHarness();
  const created = h.client.create({ name: 'Nothing inside', pages: [{ name: 'P', fields: [] }] }, h.auth);
  assert.equal(created.saved, false);
  assert.equal(h.state.creates, 0);
  assert.ok(created.validation.issues.some(i => i.code === 'empty_form'));
});

test('explicit mappings use real columns and allow false and zero values', () => {
  const h = creationHarness();
  const input = connectedWithoutIdentities();
  const step=input.flows[2].elements[0];
  const entry=step.actions['lib_BaseRow.forms_AddRow'];
  entry.vars.forms_freeVars={str:JSON.stringify({Reference:0,Status:false}),html:false};
  step.actions={'lib_BaseRow.forms_AddRowFromData':entry};
  assert.equal(h.client.create(input,h.auth).status,'ok');
  entry.vars.forms_freeVars.str=JSON.stringify({Wrong:'value'});
  assert.ok(h.client.create(input,h.auth).validation.issues.some(i=>i.code==='unknown_baserow_column'));
});

test('explicit button surfaces survive while default white wrappers are removed', () => {
  const input=example();
  input.pages[0].fields[1].boxStyle={backgroundColor:'#ffffff',border:'1px solid red'};
  const r=api().compile(input);
  const button=r.form.formulaire.find(f=>f.name==='open');
  assert.equal(button.config.boxStyle.backgroundColor,'#ffffff');
  assert.equal(button.config.boxStyle.border,'1px solid red');
  assert.ok(r.validation.warnings.some(w=>w.code==='action_wrapper_surface'));
});

test('Baserow relationships resolve actual row ids and never silently drop unresolved keys', () => {
  const library=fs.readFileSync(path.join(root,'js/nocode_baserow.js'),'utf8');
  const start=library.indexOf('  function normalizeRowValue(');
  const end=library.indexOf('  function extractRows(',start);
  assert.ok(start>=0 && end>start);
  const ctx={trimmed:value=>String(value==null?'':value).trim(),ensureArray:value=>Array.isArray(value)?value:[value],numberOrNull:value=>value==null || String(value).trim()==='' || !Number.isFinite(Number(value))?null:Number(value)};
  vm.runInNewContext(library.slice(start,end),ctx);
  const field={type:'link_row',name:'Customer',targetTable:'Customers'};
  const lookup={customers:{acme:57}};
  assert.deepEqual(clone(ctx.normalizeRowValue([{key:'acme'},92],field,lookup)),[57,92]);
  for (const value of [[{key:'missing'}],[0],[-1],[1.5]]) {
    assert.throws(()=>ctx.normalizeRowValue(value,field,lookup),/Unresolved Baserow relationship/);
  }
  assert.deepEqual(clone(ctx.normalizeRowValue([],field,lookup)),[]);
});

test('spacing diagnostics cover color-only blocks and nested children without restyling them', () => {
  const input = { ...example(), styleDefaults: false };
  input.pages[0].fields=[{type:'layout',name:'group',boxStyle:{backgroundColor:'#ffffff'},children:[{type:'text',name:'inside',boxStyle:{backgroundColor:'#ffffff'}}]}];
  const r = api().compile(input);
  const field = r.form.formulaire.find(f=>f.name==='inside');
  assert.ok(r.validation.warnings.some(w=>w.code==='missing_block_spacing' && w.path===('/formulaire/'+r.form.formulaire.indexOf(field)+'/config/boxStyle')));
  assert.equal(field.config.boxStyle.padding,undefined);
  const button = r.form.formulaire.find(f=>f.type==='button');
  assert.equal(button.config.boxStyle.backgroundColor,'transparent');
});

function connectedWithoutIdentities() {
  const input = connectedExample();
  delete input.pages[1].fields[0].id;
  delete input.flows[2].elements[0].id;
  for (const entry of [input.pages[1].fields[0].sources['lib_BaseRow.formssource_GetTableData'], input.flows[2].elements[0].actions['lib_BaseRow.forms_AddRow']]) {
    const cfg = JSON.parse(entry.vars.forms_config.str);
    delete cfg.form_id; delete cfg.source_id; delete cfg.source_owner;
    entry.vars.forms_config.str = JSON.stringify(cfg);
  }
  return input;
}

test('create finalizes real saved Baserow identities without model-provided ids', () => {
  const h = creationHarness({ onCreate(form) {
    form.formulaire.find(f => f.type === 'grid').id = 7001;
    form.flows.find(f => f.id === 'example').elements[0].id = 7002;
  } });
  const input = connectedWithoutIdentities();
  const before = JSON.stringify(input);
  const r = h.client.create(input, h.auth);
  assert.equal(r.status, 'ok');
  assert.equal(r.saved, true);
  assert.equal(r.bindingFinalization.status, 'ready');
  assert.equal(r.bindingFinalization.bindingCount, 2);
  assert.equal(r.readbackVerified, true);
  assert.equal(r.form._rev, '2-saved');
  assert.equal(h.state.creates, 1);
  assert.equal(h.state.saves, 2);
  assert.equal(JSON.stringify(input), before, 'input remains untouched');
  const grid = r.form.formulaire.find(f => f.type === 'grid');
  const step = r.form.flows.find(f => f.id === 'example').elements[0];
  for (const [item, entry] of [[grid, grid.sources['lib_BaseRow.formssource_GetTableData']], [step, step.actions['lib_BaseRow.forms_AddRow']]]) {
    const cfg = JSON.parse(entry.vars.forms_config.str);
    assert.equal(cfg.form_id, r.form._id);
    assert.equal(cfg.source_id, item.id);
    assert.equal(cfg.source_owner, h.state.user);
    assert.equal(cfg.table_id_int, 42);
    assert.deepEqual(cfg.columns, ['Reference', 'Status']);
  }
  assert.ok(!r.validation.warnings.some(w => /baserow_identity/.test(w.code)));
});

test('new creation replaces copied foreign identities but preserves table and business mappings', () => {
  const h = creationHarness();
  const r = h.client.create(connectedExample(), h.auth);
  assert.equal(r.bindingFinalization.status, 'ready');
  const action = r.form.flows.find(f => f.id === 'example').elements[0].actions['lib_BaseRow.forms_AddRow'];
  assert.equal(JSON.parse(action.vars.forms_config.str).source_owner, h.state.user);
  assert.equal(action.vars.forms_createColumn.str, 'false');
  assert.equal(r.form['~c8oAcl'], h.state.user);
});

test('failed second save returns the created id and supports idempotent same-id recovery', () => {
  const h = creationHarness({ failSave: 2 });
  const partial = h.client.create(connectedWithoutIdentities(), h.auth);
  assert.equal(partial.status, 'partial');
  assert.equal(partial.saved, true);
  assert.equal(partial.bindingFinalization.code, 'binding_save_failed');
  const recovery = partial.bindingFinalization.recovery;
  assert.equal(recovery.id, 'server-form-1');
  const repaired = h.client.edit(recovery.id, recovery.operations, h.auth);
  assert.equal(repaired.bindingFinalization.status, 'ready');
  const saves = h.state.saves;
  const repeated = h.client.edit(recovery.id, recovery.operations, h.auth);
  assert.equal(repeated.bindingFinalization.status, 'ready');
  assert.equal(h.state.saves, saves, 'already finalized form is not saved again');
  assert.equal(h.state.creates, 1);
});

test('readback failure never reports ready or retries creation', () => {
  for (const failRead of [1, 3]) {
    const h = creationHarness({ failRead });
    const r = h.client.create(connectedWithoutIdentities(), h.auth);
    assert.equal(r.status, 'partial');
    assert.equal(r.saved, true);
    assert.equal(r.bindingFinalization.status, 'pending');
    assert.equal(r.bindingFinalization.recovery.id, 'server-form-1');
    assert.equal(h.state.creates, 1);
    assert.equal(h.state.saves, failRead === 1 ? 1 : 2);
    assert.equal(h.client.edit(r.form._id, r.bindingFinalization.recovery.operations, h.auth).bindingFinalization.status, 'ready');
    assert.equal(h.state.creates, 1);
  }
});

test('finalization refuses concurrent edits and unverified owners', () => {
  for (const mode of ['revision', 'owner']) {
    const h = creationHarness({ onRead(state) {
      const form = state.forms['server-form-1'];
      if (mode === 'revision' && state.reads === 2) { form._rev = '2-concurrent'; form.name = 'Edited in Forms'; }
      if (mode === 'owner' && state.reads === 1) form.creator = 'another@example.invalid';
    } });
    const r = h.client.create(connectedWithoutIdentities(), h.auth);
    assert.equal(r.status, 'partial');
    assert.equal(r.bindingFinalization.code, mode === 'revision' ? 'form_changed_before_finalization' : 'binding_owner_not_verified');
    assert.equal(h.state.saves, 1);
  }
});

test('transport failure after creation retains saved state; authentication and initial save failures do not finalize', () => {
  const interrupted = creationHarness({ throwSave: 2 });
  const partial = interrupted.client.create(connectedWithoutIdentities(), interrupted.auth);
  assert.equal(partial.saved, true);
  assert.equal(partial.bindingFinalization.status, 'pending');
  for (const options of [{ authFail: true }, { failSave: 1 }]) {
    const h = creationHarness(options);
    const r = h.client.create(connectedWithoutIdentities(), h.auth);
    assert.equal(r.saved, false);
    assert.equal(h.state.creates, 0);
  }
});

test('ordinary form creation stays single-write and recovery cannot take over another source owner', () => {
  const h = creationHarness();
  const plain = h.client.create(example(), h.auth);
  assert.equal(plain.bindingFinalization.status, 'not_required');
  assert.equal(h.state.saves, 1);
  const connected = h.client.create(connectedWithoutIdentities(), h.auth);
  const form = h.state.forms[connected.form._id];
  const variable = form.formulaire.find(f => f.type === 'grid').sources['lib_BaseRow.formssource_GetTableData'].vars.forms_config;
  variable.str = JSON.stringify({ ...JSON.parse(variable.str), source_owner: 'someone-else@example.invalid' });
  const saves = h.state.saves;
  const result = h.client.edit(form._id, [{ action: 'finalize_baserow_bindings' }], h.auth);
  assert.equal(result.bindingFinalization.code, 'binding_owner_mismatch');
  assert.equal(h.state.saves, saves);
});

test('dropped bindings or wrong readback identities cannot be reported as finalized', () => {
  for (const mode of ['dropped', 'wrong-id', 'wrong-owner']) {
    const h = creationHarness({ onRead(state) {
      if (state.reads !== 3) return;
      const form = state.forms['server-form-1'];
      const grid = form.formulaire.find(f => f.type === 'grid');
      if (mode === 'dropped') delete grid.sources;
      if (mode === 'wrong-id') form._id = 'wrong-id';
      if (mode === 'wrong-owner') {
        const variable = grid.sources['lib_BaseRow.formssource_GetTableData'].vars.forms_config;
        variable.str = JSON.stringify({ ...JSON.parse(variable.str), source_owner: 'wrong@example.invalid' });
      }
    } });
    const result = h.client.create(connectedWithoutIdentities(), h.auth);
    assert.equal(result.saved, true);
    assert.equal(result.status, 'partial');
    assert.equal(result.bindingFinalization.status, 'pending');
    assert.equal(result.bindingFinalization.recovery.id, 'server-form-1');
  }
});

test('schema exposes the single-operation finalization recovery', () => {
  const schemaSource = fs.readFileSync(path.join(root, 'js/schema_overrides.js'), 'utf8');
  const start = schemaSource.indexOf('  function nocodeFormEditOperationSchema()');
  const end = schemaSource.indexOf('  function nocodeFormEditInputSchema()', start);
  const context = { nocodeThumbnailImageSchema: () => ({}) };
  vm.runInNewContext(schemaSource.slice(start, end), context);
  assert.ok(context.nocodeFormEditOperationSchema().properties.action.enum.includes('finalize_baserow_bindings'));
  const h = creationHarness();
  const result = h.client.edit('never-created', [{ action: 'finalize_baserow_bindings' }, { action: 'set_root', name: 'bad' }], h.auth);
  assert.equal(result.saved, false);
  assert.equal(h.state.saves, 0);
  assert.equal(h.state.calls.length, 0);
});

// Readable UI: toasts, buttons, page headers, placeholders, conditions, if_else, reset_fields.
function viewerToastTextColor(hex) {
  // Same formula as the viewer (viewerPage getContrastColor).
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.substring(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? '#000000' : '#FFFFFF';
}
function wcagContrast(a, b) {
  const lum = hex => {
    const c = [0, 2, 4].map(i => parseInt(hex.replace('#', '').substring(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
function toastFlow(...toasts) {
  const input = example();
  input.flows[2].elements = toasts.map((toast, index) => ({ type: 'toast', message: 'Message ' + index, ...toast }));
  return input;
}
test('toast colors compile to hex values the viewer renders readably', () => {
  const r = api().compile(toastFlow({ color: 'success' }, { color: 'danger' }, { color: 'warning' }, { color: 'info' }, {}, { color: '#0a0' }, { color: '1E293B' }));
  assert.equal(r.status, 'ok');
  const colors = clone(r.form.flows.find(f => f.id === 'example').elements.map(e => e.config.color));
  assert.deepEqual(colors.slice(0, 5), ['#15803D', '#B91C1C', '#B45309', '#1E293B', '#15803D'], 'named colors and the default');
  assert.equal(colors[5], '#00aa00');
  assert.equal(colors[6], '#1E293B');
  for (const color of colors.slice(0, 5)) {
    const text = viewerToastTextColor(color);
    assert.equal(text, '#FFFFFF', color);
    assert.ok(wcagContrast(color, text) >= 4.5, color + ' contrast');
  }
});
test('a toast color the viewer cannot read blocks creation and stays advisory on drafts', () => {
  const r = api().compile(toastFlow({ color: 'var(--ion-color-success)' }, { color: 'success', duration: 3000 }));
  assert.ok(r.validation.issues.some(i => i.code === 'unreadable_toast_color'));
  assert.ok(r.validation.warnings.some(w => w.code === 'toast_duration_seconds'));
  const draft = api().validate(r.form).validation;
  assert.ok(draft.warnings.some(w => w.code === 'unreadable_toast_color'));
  assert.ok(!draft.issues.some(i => i.code === 'unreadable_toast_color'));
  const legacy = clone(api().compile(toastFlow({})).form);
  legacy.flows.find(f => f.id === 'example').elements[0].config.color = 'success';
  assert.ok(api().validate(legacy).validation.warnings.some(w => w.code === 'unreadable_toast_color'), 'existing named colors are reported');
});
test('button variants give a coherent hierarchy and explicit values win', () => {
  const input = example();
  input.pages[1].fields.push(
    { type: 'button', name: 'save', label: 'Save', variant: 'primary', flow: 'back' },
    { type: 'button', name: 'cancel', label: 'Cancel', variant: 'secondary', flow: 'back' },
    { type: 'button', name: 'remove', label: 'Delete', variant: 'danger', flow: 'back' },
    { type: 'button', name: 'more', label: 'More', variant: 'ghost', flow: 'back' },
    { type: 'button', name: 'brand', label: 'Brand', variant: 'secondary', color: '#7C3AED', flow: 'back' },
    { type: 'button', name: 'bare_outline', label: 'Outline', fill: 'outline', flow: 'back' }
  );
  const r = api().compile(input);
  assert.equal(r.status, 'ok');
  const config = name => r.form.formulaire.find(f => f.name === name).config;
  assert.deepEqual([config('save').fill, config('save').backgroundColor, config('save').color], ['solid', '#2563EB', '#FFFFFF']);
  assert.deepEqual([config('cancel').fill, config('cancel').backgroundColor, config('cancel').color], ['outline', 'transparent', '#2563EB']);
  assert.equal(config('cancel').componentBoxStyle.border, '1px solid #2563EB');
  assert.deepEqual([config('remove').fill, config('remove').backgroundColor], ['solid', '#B91C1C']);
  assert.deepEqual([config('more').fill, config('more').backgroundColor, config('more').color], ['clear', 'transparent', '#2563EB']);
  assert.equal(config('brand').color, '#7C3AED');
  assert.deepEqual([config('bare_outline').backgroundColor, config('bare_outline').color], ['transparent', '#2563EB'], 'a bare outline drops the solid prototype colors');
  assert.equal(config('cancel').variant, undefined);
  assert.equal(config('cancel').boxStyle.backgroundColor, 'transparent', 'the wrapper stays transparent');
  assert.ok(!r.validation.warnings.some(w => w.code === 'button_fill_overridden' || w.code === 'button_text_unreadable'));
  assert.throws(() => api().compile({ name: 'Bad', pages: [{ name: 'P', fields: [{ type: 'button', name: 'b', label: 'B', variant: 'fancy' }] }] }), /Unknown button variant/);
});
test('outline and clear buttons painted solid or with white text are reported', () => {
  const r = api().compile(example());
  const doc = clone(r.form);
  const buttons = doc.formulaire.filter(f => f.type === 'button');
  Object.assign(buttons[0].config, { fill: 'outline', backgroundColor: '#3880ff', color: '#fff' });
  Object.assign(buttons[1].config, { fill: 'clear', backgroundColor: 'transparent', color: '#fff' });
  const warnings = api().validate(doc).validation.warnings;
  assert.ok(warnings.some(w => w.code === 'button_fill_overridden'));
  assert.ok(warnings.some(w => w.code === 'button_text_unreadable'));
});
test('custom navigation pages get their own header instead of the repeated form title', () => {
  const input = example();
  input.pages[0].isNameDisplayed = true;
  input.pages[1].header = { title: 'Requests & <follow-up>', subtitle: 'Select a request' };
  const r = api().compile(input);
  assert.equal(r.status, 'ok');
  assert.deepEqual(clone(r.form.pages.map(p => p.isNameDisplayed)), [true, false], 'explicit value kept, default off');
  const first = r.form.formulaire.find(f => f.config.page === r.form.pages[1].pageTechName);
  assert.equal(first.type, 'description');
  assert.match(first.config.html, /<h2[^>]*>Requests &amp; &lt;follow-up&gt;<\/h2>/);
  assert.match(first.config.html, /Select a request/);
  assert.equal(first.config.boxStyle.backgroundColor, 'transparent');
  const tabs = api().compile({ ...example(), navigationMode: 'tabs' });
  assert.ok(tabs.form.pages.every(p => p.isNameDisplayed === false));
  const doc = clone(r.form);
  doc.pages.forEach(p => { p.isNameDisplayed = true; });
  assert.ok(api().validate(doc).validation.warnings.some(w => w.code === 'repeated_form_title'));
  assert.ok(!r.validation.warnings.some(w => w.code === 'repeated_form_title'));
  assert.throws(() => api().compile({ ...example(), pages: [{ name: 'P', header: { subtitle: 'no title' }, fields: [] }] }), /header needs a title/);
});
test('prototype placeholders are never shown to end users', () => {
  const r = api().compile({ name: 'Placeholders', pages: [{ name: 'P', fields: [
    { type: 'text', name: 'a', label: 'A' },
    { type: 'select', name: 'b', label: 'B', values: ['x'] },
    { type: 'datetime', name: 'c', label: 'C' },
    { type: 'text', name: 'd', label: 'D', placeholder: 'Ex. Dupont' }
  ] }] });
  assert.deepEqual(clone(r.form.formulaire.map(f => f.config.placeholder)), ['', '', '', 'Ex. Dupont']);
  assert.ok(!r.validation.warnings.some(w => w.code === 'prototype_placeholder'));
  const doc = clone(r.form);
  doc.formulaire[0].config.placeholder = 'Exemple de placeholder';
  assert.ok(api().validate(doc).validation.warnings.some(w => w.code === 'prototype_placeholder'));
});
function conditionExample(extraFields, flows) {
  return { name: 'Conditions', navigationMode: 'custom', pages: [{ name: 'Main', fields: [
    { type: 'grid', name: 'contacts', id: 1900000000400, sourceEnabled: false, columns: [{ name: 'Name', type: 'text' }] },
    { type: 'text', name: 'status', id: 1900000000401, label: 'Status' },
    { type: 'checkbox', name: 'tags', id: 1900000000402, label: 'Tags', values: ['High', 'Low'] },
    ...extraFields
  ] }], flows: flows || [] };
}
test('reduced conditions compile to the native groups the viewer evaluates', () => {
  const r = api().compile(conditionExample([
    { type: 'description', name: 'detail', description: '<p>Detail</p>', visibleIf: { field: 'contacts', operator: 'not_empty' } },
    { type: 'button', name: 'open', label: 'Open', flow: 'noop', disabledIf: { field: 'contacts', operator: 'is_empty' } },
    { type: 'description', name: 'mixed', description: '<p>Mixed</p>', visibleIf: { all: [{ field: 'status', operator: '==', value: 'Open' }, { any: [{ field: 'tags', operator: 'in', value: ['High'] }, { field: 'status', operator: 'is_filled' }] }] } },
    { type: 'layout', name: 'providers', visibleIf: { never: true }, children: [] }
  ], [{ id: 'noop', elements: [{ type: 'push_page', targetPage: 'Main' }] }]));
  assert.equal(r.status, 'ok', JSON.stringify(r.validation.issues));
  const field = name => r.form.formulaire.find(f => f.name === name);
  const shown = field('detail').conditions.visibleIf;
  assert.deepEqual(clone(shown.conds[0]), { type: 'visibleIf', subject: 'field', val1: { name: 'contacts', displayName: 'contacts', str: '1900000000400', source: true, type: 'grid', arr: [] }, val2: { str: '', source: false, type: 'text', arr: [], html: false }, operator: 'is_filled' });
  const disabled = field('open').conditions.buttonStateIf;
  assert.equal(disabled.__uiMode, 'button_state_disabled_when_condition');
  assert.equal(disabled.conds[0].operator, 'is_empty');
  const mixed = field('mixed').conditions.visibleIf;
  assert.equal(mixed.condVisible, 'and');
  assert.deepEqual([mixed.conds[0].operator, mixed.conds[0].val1.type, mixed.conds[0].val2.str], ['equals', 'text', 'Open']);
  assert.equal(mixed.groups[0].condVisible, 'or');
  assert.deepEqual([mixed.groups[0].conds[0].operator, clone(mixed.groups[0].conds[0].val2.arr), mixed.groups[0].conds[0].val1.type], ['among_following', ['High'], 'checkbox']);
  assert.equal(field('providers').conditions.visibleIf.conds[0].subject, 'never_visible');
  assert.ok(!JSON.stringify(r.form).includes('__ref'));
});
test('condition operators and field names the viewer cannot evaluate are refused', () => {
  assert.throws(() => api().compile(conditionExample([{ type: 'description', name: 'x', description: '<p>x</p>', visibleIf: { field: 'status', operator: 'not_equal', value: 'a' } }])), /Unknown condition operator/);
  assert.throws(() => api().compile(conditionExample([{ type: 'description', name: 'x', description: '<p>x</p>', visibleIf: { field: 'status', operator: 'equals' } }])), /needs a value/);
  const unknown = api().compile(conditionExample([{ type: 'description', name: 'x', description: '<p>x</p>', visibleIf: { field: 'missing', operator: 'is_filled' } }]));
  assert.ok(unknown.validation.issues.some(i => i.code === 'unknown_condition_field'));
  const native = api().compile(conditionExample([{ type: 'description', name: 'x', description: '<p>x</p>', conditions: { visibleIf: { type: 'visibleIf', condVisible: 'and', groups: [], conds: [{ type: 'visibleIf', subject: 'field', operator: '==', val1: { str: '1900000000401', source: true, type: 'text', arr: [] }, val2: { str: 'a', source: false, type: 'text', arr: [] } }] } } }]));
  assert.ok(native.validation.issues.some(i => i.code === 'invalid_condition_operator'), 'native groups are kept but checked');
  assert.ok(api().validate(native.form).validation.warnings.some(w => w.code === 'invalid_condition_operator'), 'advisory on drafts');
});
test('if_else branches compile to children after their parent and need a condition', () => {
  const r = api().compile(conditionExample([], [{ id: 'decide', elements: [
    { type: 'if_else', name: 'has_contact', condition: { field: 'contacts', operator: 'is_filled' },
      then: [{ type: 'toast', message: 'Selected' }, { type: 'if_else', condition: { field: 'status', operator: 'equals', value: 'Open' }, then: [{ type: 'push_page', targetPage: 'Main' }] }],
      else: [{ type: 'toast', message: 'Select a contact', color: 'info' }] },
    { type: 'toast', message: 'Done' }
  ] }]));
  assert.equal(r.status, 'ok', JSON.stringify(r.validation.issues));
  const elements = r.form.flows.find(f => f.id === 'decide').elements;
  assert.deepEqual(clone(elements.map(e => e.type)), ['if_else', 'toast', 'if_else', 'push_page', 'toast', 'toast']);
  const [root, thenToast, nested, push, elseToast, done] = elements;
  assert.deepEqual(clone(root.childrenRefs), [thenToast.id, nested.id]);
  assert.deepEqual(clone(root.childrenRefsElse), [elseToast.id]);
  assert.deepEqual([thenToast.parentRef, nested.parentRef, elseToast.parentRef, push.parentRef], [root.id, root.id, root.id, nested.id]);
  assert.equal(done.parentRef, undefined);
  const selfVar = root.sources.self.vars.selfVar;
  assert.equal(selfVar.type, 'condition');
  assert.deepEqual([selfVar.cond[0].operator, selfVar.cond[0].val1.str, selfVar.cond[0].val1.type], ['is_filled', '1900000000400', 'grid']);
  assert.equal(root.config.condition, undefined);
  const empty = api().compile(conditionExample([], [{ id: 'decide', elements: [{ type: 'if_else', then: [{ type: 'toast', message: 'Always' }] }] }]));
  assert.ok(empty.validation.issues.some(i => i.code === 'empty_if_else_condition'));
  assert.throws(() => api().compile(conditionExample([], [{ id: 'bad', elements: [{ type: 'toast', message: 'x', then: [] }] }])), /belong to an if_else/);
});
test('reset_fields targets pages and components by name', () => {
  const input = conditionExample([], [{ id: 'resets', elements: [
    { type: 'reset_fields', targetPage: 'Main' },
    { type: 'reset_fields', targetField: 'status' },
    { type: 'reset_fields', scope: 'element', targetField: 'tags' },
    { type: 'reset_fields' }
  ] }]);
  const r = api().compile(input);
  assert.equal(r.status, 'ok', JSON.stringify(r.validation.issues));
  const configs = r.form.flows.find(f => f.id === 'resets').elements.map(e => clone(e.config));
  assert.deepEqual([configs[0].scope, configs[0].targetPage], ['page', r.form.pages[0].pageTechName]);
  assert.deepEqual([configs[1].scope, configs[1].targetElement], ['component', 1900000000401]);
  assert.deepEqual([configs[2].scope, configs[2].targetElement], ['component', 1900000000402]);
  assert.equal(configs[3].scope, 'application');
  const bad = api().compile(conditionExample([], [{ id: 'resets', elements: [{ type: 'reset_fields', targetPage: 'Nowhere' }, { type: 'reset_fields', targetField: 'nothing' }] }]));
  assert.equal(bad.validation.issues.filter(i => i.code === 'unknown_reset_target').length, 2);
});
test('wide list grids are reported, hidden Baserow columns do not count', () => {
  const input = connectedExample();
  const grid = input.pages[1].fields[0];
  const columns = ['Reference', 'Status', 'Owner', 'Date', 'Amount', 'Notes', 'Description'];
  const vars = forms => ({ str: JSON.stringify({ table_id: 'Test workspace~>Test database~>Requests', table_id_int: 42, columns, hidden: forms }), html: false });
  grid.sources['lib_BaseRow.formssource_GetTableData'].vars.forms_config = vars([]);
  assert.ok(api().compile(input).validation.warnings.some(w => w.code === 'wide_list_grid'));
  grid.sources['lib_BaseRow.formssource_GetTableData'].vars.forms_config = vars(['Notes', 'Description']);
  assert.ok(!api().compile(input).validation.warnings.some(w => w.code === 'wide_list_grid'));
});
test('edits accept reduced conditions, button variants and page headers', () => {
  const h = creationHarness();
  const created = h.client.create(example(), h.auth);
  const id = created.form._id;
  const edited = h.client.edit(id, [
    { action: 'update_field', fieldName: 'open', patch: { variant: 'secondary', disabledIf: { field: 'welcome', operator: 'is_filled' } } },
    { action: 'add_page', name: 'Detail', navigationMode: 'custom', index: 1, header: { title: 'Detail', subtitle: 'One request' } },
    { action: 'add_flow_element', flowId: 'back', index: 0, element: { type: 'if_else', condition: { field: 'requests', operator: 'is_filled' }, then: [{ type: 'toast', message: 'Leaving', color: 'warning' }] } }
  ], h.auth);
  assert.equal(edited.saved, true, JSON.stringify(edited.validation || edited.error));
  const form = edited.form;
  const open = form.formulaire.find(f => f.name === 'open');
  assert.deepEqual([open.config.fill, open.config.backgroundColor, open.config.color], ['outline', 'transparent', '#2563EB']);
  assert.equal(open.variant, undefined);
  assert.deepEqual([open.conditions.buttonStateIf.conds[0].operator, open.conditions.buttonStateIf.conds[0].val1.type, open.conditions.buttonStateIf.__uiMode], ['is_filled', 'description', 'button_state_disabled_when_condition']);
  assert.equal(open.conditions.buttonStateIf.conds.length, 1, 'a reduced condition replaces the whole group');
  const detail = form.pages[1];
  assert.deepEqual([detail.name, detail.isNameDisplayed, detail.enabledTab, detail.enabledButtons], ['Detail', false, false, false]);
  const pageOrder = clone(form.formulaire.map(f => form.pages.findIndex(p => p.pageTechName === f.config.page)));
  assert.deepEqual(pageOrder, [...pageOrder].sort((a, b) => a - b), 'the header stays between the fields of its neighbours');
  assert.ok(form.formulaire.some(f => f.config.page === detail.pageTechName && f.type === 'description' && /<h2/.test(f.config.html)));
  const back = form.flows.find(f => f.id === 'back').elements;
  assert.deepEqual(clone(back.map(e => e.type)), ['if_else', 'toast', 'push_page']);
  assert.equal(back[1].parentRef, back[0].id);
  assert.equal(back[1].config.color, '#B45309');
});
test('contract documents the readable UI patterns and its examples compile', () => {
  const contract = api().contract().authoringContract;
  const quality = contract.generationQuality;
  for (const key of ['designTokens', 'pageHeader', 'actionBar', 'listDetail', 'emptyStates', 'toasts', 'dataViews']) assert.ok(quality[key], key);
  assert.ok(contract.conditionFields.reducedShape.operators.includes('is_filled'));
  assert.ok(contract.flowAuthoring.elementTypes.includes('reset_fields'));
  assert.ok(contract.flowAuthoring.ifElse && contract.flowAuthoring.resetFields);
  assert.match(contract.flowAuthoring.toast, /6-digit hex/);
  const r = api().compile({ name: 'Contract examples', navigationMode: 'custom', pages: [
    { ...quality.pageHeader.example, fields: [
      quality.actionBar.example,
      quality.emptyStates.example,
      { type: 'text', name: 'amount', label: 'Amount' },
      { type: 'grid', name: 'contacts', sourceEnabled: false, columns: [{ name: 'Name', type: 'text' }] },
      { type: 'button', name: 'go', label: 'Go', flow: 'save_contact' }
    ] },
    { name: 'Contacts', fields: [{ type: 'button', name: 'home', label: 'Home', variant: 'ghost', flow: 'cancel_contact' }] },
    { name: 'Approval', fields: [] }
  ], flows: [
    { id: 'save_contact', elements: [quality.toasts.recipes.success, quality.toasts.recipes.error, contract.flowAuthoring.ifElse.example] },
    { id: 'cancel_contact', elements: [{ type: 'reset_fields', scope: 'page', targetPage: 'Contact' }, { type: 'push_page', targetPage: 'Contacts' }] }
  ] });
  assert.ok(!r.validation.issues.some(i => ['unreadable_toast_color', 'invalid_condition_operator', 'unknown_condition_field', 'unknown_reset_target', 'empty_if_else_condition'].includes(i.code)), JSON.stringify(r.validation.issues));
  for (const example of contract.conditionFields.reducedShape.examples) {
    const condition = example.visibleIf || example.disabledIf;
    if (condition.never) continue;
    assert.doesNotThrow(() => JSON.stringify(condition));
  }
});
test('review regressions: never=false, null and empty conditions, native if_else groups', () => {
  const never = api().compile(conditionExample([{ type: 'description', name: 'x', description: '<p>x</p>', visibleIf: { never: false } }]));
  assert.equal(never.status, 'ok');
  assert.equal(never.form.formulaire.find(f => f.name === 'x').conditions.visibleIf.conds.length, 0, 'never=false is no condition');
  assert.throws(() => api().compile(conditionExample([{ type: 'description', name: 'x', description: '<p>x</p>', visibleIf: { field: 'status', operator: 'is_filled', never: false } }])), /never cannot be combined/);
  const legacy = api().compile(conditionExample([{ type: 'description', name: 'x', description: '<p>x</p>', conditions: { visibleIf: {} } }]));
  assert.equal(legacy.status, 'ok', 'an empty native group stays accepted');
  assert.throws(() => api().compile(conditionExample([{ type: 'description', name: 'x', description: '<p>x</p>', visibleIf: { field: 'status', operator: 'equals', value: '' } }])), /needs a value/);
  const native = api().compile(conditionExample([], [{ id: 'decide', elements: [{ type: 'if_else', condition: { type: 'condition', condVisible: 'and', cond: [{ type: 'visibleIf', subject: 'field', operator: 'is_filled', val1: { str: '1900000000401', source: true, type: 'text', arr: [] }, val2: { str: '', source: false, type: 'text', arr: [] } }] }, then: [{ type: 'toast', message: 'ok' }] }] }]));
  assert.equal(native.status, 'ok', JSON.stringify(native.validation.issues));
  assert.equal(native.form.flows.find(f => f.id === 'decide').elements[0].sources.self.vars.selfVar.cond.length, 1, 'the native cond list is kept');
  const h = creationHarness();
  const input = example();
  input.pages[0].fields[1].visibleIf = { field: 'welcome', operator: 'is_filled' };
  input.pages[0].fields[1].disabledIf = { field: 'welcome', operator: 'is_empty' };
  const created = h.client.create(input, h.auth);
  const cleared = h.client.edit(created.form._id, [{ action: 'update_field', fieldName: 'open', patch: { visibleIf: null, disabledIf: null } }], h.auth);
  assert.equal(cleared.saved, true, JSON.stringify(cleared.error || cleared.validation));
  const open = cleared.form.formulaire.find(f => f.name === 'open');
  assert.equal(open.conditions.visibleIf, undefined);
  assert.equal(open.conditions.buttonStateIf, undefined);
});
test('review regressions: button edits keep designer colors and switch variant borders', () => {
  const h = creationHarness();
  const input = example();
  Object.assign(input.pages[0].fields[1], { backgroundColor: '#FF0000', color: '#000000' });
  input.pages[1].fields.push({ type: 'button', name: 'alt', label: 'Alt', variant: 'secondary', flow: 'back' });
  const created = h.client.create(input, h.auth);
  const edited = h.client.edit(created.form._id, [
    { action: 'update_field', fieldName: 'open', patch: { fill: 'outline' } },
    { action: 'update_field', fieldName: 'alt', patch: { variant: 'danger' } }
  ], h.auth);
  assert.equal(edited.saved, true, JSON.stringify(edited.error || edited.validation));
  const config = name => edited.form.formulaire.find(f => f.name === name).config;
  assert.deepEqual([config('open').fill, config('open').backgroundColor, config('open').color], ['outline', 'transparent', '#000000']);
  assert.deepEqual([config('alt').fill, config('alt').backgroundColor, config('alt').componentBoxStyle.border], ['solid', '#B91C1C', '']);
  assert.throws(() => api().compile({ name: 'Bad', pages: [{ name: 'P', fields: [{ type: 'button', name: 'b', label: 'B', variant: 'toString' }] }] }), /Unknown button variant/);
});
test('review regressions: toast color patches, reset drafts and placeholders of file and location', () => {
  const h = creationHarness();
  const created = h.client.create(toastFlow({ color: 'success' }), h.auth);
  const toastId = created.form.flows.find(f => f.id === 'example').elements[0].id;
  const edited = h.client.edit(created.form._id, [{ action: 'update_flow_element', flowId: 'example', elementId: toastId, patch: { config: { color: 'danger' } } }], h.auth);
  assert.equal(edited.saved, true, JSON.stringify(edited.error || edited.validation));
  assert.equal(edited.form.flows.find(f => f.id === 'example').elements[0].config.color, '#B91C1C');
  const draft = clone(api().compile(conditionExample([], [{ id: 'r', elements: [{ type: 'reset_fields', targetField: 'status' }] }])).form);
  draft.flows.find(f => f.id === 'r').elements[0].config.targetElement = '';
  const v = api().validate(draft).validation;
  assert.ok(v.warnings.some(w => w.code === 'unknown_reset_target') && v.valid, 'an unfinished native reset stays editable');
  const r = api().compile({ name: 'P', pages: [{ name: 'P', fields: [{ type: 'location', name: 'where', label: 'Where' }, { type: 'file', name: 'doc', label: 'Doc' }] }] });
  assert.ok(r.form.formulaire.every(f => f.config.placeholder === '' || f.config.placeholder === undefined));
});

// Role spacing, sections and phone density.
function styled(fields, extra = {}) {
  return { name: 'Styles', navigationMode: 'custom', pages: [{ name: 'Main', fields }], ...extra };
}
test('application components get role spacing instead of a card each, explicit styles win', () => {
  const r = api().compile(styled([
    { type: 'description', name: 'intro', description: '<p>Intro</p>' },
    { type: 'text', name: 'first_name', label: 'First name' },
    { type: 'grid', name: 'list', sourceEnabled: false, columns: [{ name: 'Name', type: 'text' }] },
    { type: 'button', name: 'alone', label: 'Alone', flow: 'noop' },
    { type: 'layout', name: 'pair', cols: [{ size: 6 }, { size: 6 }], children: [{ type: 'text', name: 'a', label: 'A' }, { type: 'text', name: 'b', label: 'B' }] },
    { type: 'layout', name: 'actions', children: [{ type: 'button', name: 'save', label: 'Save', variant: 'primary', flow: 'noop' }, { type: 'button', name: 'cancel', label: 'Cancel', variant: 'secondary', flow: 'noop' }] },
    { type: 'text', name: 'custom', label: 'Custom', boxStyle: { margin: '0 0 40px 0' } }
  ], { flows: [{ id: 'noop', elements: [{ type: 'push_page', targetPage: 'Main' }] }] }));
  assert.equal(r.status, 'ok', JSON.stringify(r.validation.issues));
  const field = name => r.form.formulaire.find(f => f.name === name).config;
  assert.deepEqual([field('intro').boxStyle.margin, field('intro').boxStyle.padding, field('intro').boxStyle.backgroundColor], ['0 0 16px 0', '0', 'transparent']);
  assert.deepEqual([field('first_name').boxStyle.padding, field('first_name').boxStyle.border], ['0', '0']);
  assert.deepEqual([field('list').boxStyle.padding, field('list').boxStyle.borderRadius, field('list').boxStyle.backgroundColor], ['16px', '12px', '#FFFFFF']);
  assert.deepEqual([field('alone').boxStyle.margin, field('alone').boxStyle.backgroundColor], ['8px 0 16px 0', 'transparent']);
  assert.deepEqual(clone(field('pair').layoutChildrenStyle), { default: { margin: '0 0 12px 0', padding: '0 12px 0 0', border: '0', backgroundColor: 'transparent' }, last: { padding: '0' } });
  assert.equal(field('a').boxStyle.margin, '', 'children are spaced by their layout');
  assert.equal(field('actions').layoutChildrenStyle.default.padding, '4px');
  assert.equal(field('actions').boxStyle.margin, '8px 0 24px 0');
  assert.equal(field('custom').boxStyle.margin, '0 0 40px 0');
  assert.ok(!field('custom').boxStyle.padding, 'an explicit style is not completed');
  for (const code of ['missing_block_spacing', 'partial_page_styling', 'action_wrapper_surface']) {
    assert.ok(!r.validation.warnings.some(w => w.code === code), code);
  }
});
test('questionnaires and opted-out forms keep the viewer cards', () => {
  const questionnaire = api().compile({ name: 'Survey', pages: [{ name: 'Q', fields: [{ type: 'text', name: 'q1', label: 'Q1' }] }] });
  assert.equal(questionnaire.form.formulaire[0].config.boxStyle.padding, '');
  const optedOut = api().compile(styled([{ type: 'text', name: 'q1', label: 'Q1' }], { styleDefaults: false }));
  assert.equal(optedOut.form.formulaire[0].config.boxStyle.padding, '');
});
test('sections compile to a titled card with fields in columns', () => {
  const r = api().compile(styled([
    { type: 'section', name: 'identity', title: 'Identité & contact', subtitle: 'Qui est-ce ?', columns: 2, fields: [
      { type: 'text', name: 'first', label: 'Prénom' },
      { type: 'text', name: 'last', label: 'Nom' },
      { type: 'text', name: 'email', label: 'Email' },
      { type: 'text', name: 'notes', label: 'Notes', fullWidth: true },
      { type: 'text', name: 'phone', label: 'Téléphone' }
    ] },
    { type: 'section', name: 'single', columns: 1, fields: [{ type: 'text', name: 'alone', label: 'Alone' }] }
  ]));
  assert.equal(r.status, 'ok', JSON.stringify(r.validation.issues));
  const byName = name => r.form.formulaire.find(f => f.name === name);
  const section = byName('identity');
  assert.equal(section.type, 'layout');
  assert.deepEqual([section.config.boxStyle.border, section.config.boxStyle.borderRadius, section.config.boxStyle.backgroundColor], ['1px solid #E2E8F0', '12px', '#FFFFFF']);
  assert.deepEqual(clone(section.childrenRefs.map(id => r.form.formulaire.find(f => f.id === id).name)), ['identity_title', 'identity_row1', 'notes', 'identity_row2']);
  assert.match(byName('identity_title').config.html, /<h3[^>]*>Identité &amp; contact<\/h3>/);
  const row = byName('identity_row1');
  assert.deepEqual(clone(row.childrenRefs.map(id => r.form.formulaire.find(f => f.id === id).name)), ['first', 'last', 'email']);
  assert.deepEqual(clone(row.config.cols.map(c => c.size)), [6, 6, 0, 0, 0, 0]);
  assert.deepEqual(clone(row.config.phoneP.map(c => c.size)), [12, 0, 0, 0, 0, 0]);
  assert.equal(row.config.layoutChildrenStyle.default.padding, '0 12px 0 0');
  assert.equal(byName('notes').parentRef, section.id);
  assert.equal(byName('alone').parentRef, byName('single').id, 'one column: no row');
  assert.ok(!r.validation.warnings.some(w => w.code === 'missing_block_spacing'));
  const questionnaire = api().compile({ name: 'Survey', pages: [{ name: 'Q', fields: [{ type: 'section', name: 's', title: 'S', fields: [{ type: 'text', name: 'q', label: 'Q' }] }] }] });
  assert.equal(questionnaire.form.formulaire[0].config.boxStyle.borderRadius, '12px', 'a section is styled in any form');
  assert.throws(() => api().compile(styled([{ type: 'section', name: 's', columns: 5, fields: [] }])), /columns must be/);
  assert.throws(() => api().compile(styled([{ type: 'section', fields: [] }])), /needs a technical name/);
});
test('new forms are denser on phones', () => {
  const r = api().compile(styled([{ type: 'text', name: 'a', label: 'A' }]));
  assert.deepEqual(['desktop', 'tablet', 'phoneL', 'phoneP'].map(device => r.form.config[device].padding.value), ['24', '20', '12', '12']);
  const custom = api().compile(styled([{ type: 'text', name: 'a', label: 'A' }], { config: { desktop: { padding: { unit: 'px', value: '32' } } } }));
  assert.equal(custom.form.config.desktop.padding.value, '32');
});
test('add_field gives role spacing on application pages and a section in edits', () => {
  const h = creationHarness();
  const created = h.client.create(example(), h.auth);
  const edited = h.client.edit(created.form._id, [
    { action: 'add_field', pageName: 'Home', fieldObject: { type: 'text', name: 'search', label: 'Search' } },
    { action: 'add_field', pageName: 'Home', fieldObject: { type: 'section', name: 'filters', title: 'Filtres', fields: [{ type: 'text', name: 'f1', label: 'F1' }, { type: 'text', name: 'f2', label: 'F2' }] } }
  ], h.auth);
  assert.equal(edited.saved, true, JSON.stringify(edited.error || edited.validation));
  const byName = name => edited.form.formulaire.find(f => f.name === name);
  assert.equal(byName('search').config.boxStyle.padding, '0');
  assert.equal(byName('filters').config.boxStyle.borderRadius, '12px');
  assert.equal(byName('f2').parentRef, byName('filters_row1').id);
});
test('contract section and page examples compile with role spacing', () => {
  const contract = api().contract().authoringContract;
  const r = api().compile({ name: 'Examples', navigationMode: 'custom', pages: [contract.generationQuality.pageHeader.example, { name: 'More', fields: [contract.componentAuthoring.section.example] }] });
  assert.equal(r.status, 'ok', JSON.stringify(r.validation.issues));
  assert.ok(r.form.formulaire.some(f => f.name === 'contact_identity' && f.type === 'layout'));
  assert.ok(contract.generationQuality.styles.roleDefaults.values.section.boxStyle.borderRadius);
});
test('applications get narrow root margins, questionnaires the creation ones, partial configs are merged', () => {
  const devices = ['desktop', 'tablet', 'phoneL', 'phoneP'];
  const margins = form => devices.map(device => form.config[device].horizontalMargin.value);
  const app = api().compile(styled([{ type: 'text', name: 'a', label: 'A' }]));
  assert.deepEqual(margins(app.form), ['32', '16', '0', '0']);
  assert.deepEqual(devices.map(device => app.form.config[device].padding.value), ['24', '20', '12', '12']);
  assert.deepEqual(devices.map(device => app.form.config[device].width.unit + app.form.config[device].width.value), ['px1280', '%100', '%100', '%100']);
  assert.equal(app.form.config.desktop['font-size'].value, '16');
  assert.ok(!app.validation.warnings.some(w => w.code === 'wide_page_margin'));
  const tabs = api().compile({ name: 'Tabs', navigationMode: 'tabs', pages: [{ name: 'A', fields: [] }, { name: 'B', fields: [] }] });
  assert.deepEqual(margins(tabs.form), ['32', '16', '0', '0']);
  const survey = api().compile({ name: 'Survey', pages: [{ name: 'Q', fields: [{ type: 'text', name: 'q', label: 'Q' }] }] });
  assert.deepEqual(margins(survey.form), ['100', '60', '10', '10']);
  assert.ok(!survey.validation.warnings.some(w => w.code === 'wide_page_margin'), 'a questionnaire keeps its frame');
  const partial = api().compile(styled([], { config: { desktop: { horizontalMargin: { unit: 'px', value: 40 } } } }));
  assert.equal(partial.form.config.desktop.horizontalMargin.value, '40', 'numbers are stored as strings');
  assert.equal(partial.form.config.desktop.padding.value, '24', 'other keys keep their default');
  assert.equal(partial.form.config.phoneP.horizontalMargin.value, '0', 'other devices keep their default');
});
test('wide_page_margin flags an application keeping wide margins and set_root narrows them', () => {
  const wide = api().compile(styled([{ type: 'text', name: 'a', label: 'A' }], { config: { desktop: { horizontalMargin: { unit: 'px', value: '100' } }, tablet: { horizontalMargin: { unit: 'px', value: '60' } }, phoneP: { horizontalMargin: { unit: 'px', value: '10' } } } }));
  const flagged = wide.validation.warnings.filter(w => w.code === 'wide_page_margin').map(w => w.path);
  assert.deepEqual(clone(flagged), ['/config/desktop/horizontalMargin'], 'tablet is free, 10px on phones is tolerated');
  const phones = api().validate(Object.assign(clone(wide.form), { config: Object.assign(clone(wide.form.config), { phoneL: { horizontalMargin: { unit: 'px', value: '20' } } }) }));
  assert.ok(phones.validation.warnings.some(w => w.code === 'wide_page_margin' && w.path === '/config/phoneL/horizontalMargin'));
  const h = creationHarness();
  const created = h.client.create(example(), h.auth);
  h.state.forms[created.form._id].config.desktop.horizontalMargin.value = '100';
  const edited = h.client.edit(created.form._id, [{ action: 'set_root', config: { desktop: { horizontalMargin: { unit: 'px', value: 32 } } } }], h.auth);
  assert.equal(edited.saved, true, JSON.stringify(edited.error || edited.validation));
  assert.equal(edited.form.config.desktop.horizontalMargin.value, '32');
  assert.equal(edited.form.config.desktop.padding.value, '24', 'set_root config is merged');
  const contract = api().contract().authoringContract;
  assert.equal(contract.rootFields.config.recommended.application.desktop.horizontalMargin.value, '32');
  assert.match(contract.generationQuality.styles.mobile, /horizontalMargin/);
});
test('viewer title choice, grid second click and documented button and header limits', () => {
  const r = api().compile(styled([{ type: 'grid', name: 'list', sourceEnabled: false, deselectOnSecondClick: false, columns: [{ name: 'Nom', type: 'text' }] }], { titleDisplay: 'page' }));
  assert.equal(r.status, 'ok', JSON.stringify(r.validation.issues));
  assert.equal(r.form.config.titleDisplay, 'page');
  assert.equal(r.form.formulaire[0].config.deselectOnSecondClick, false);
  assert.equal(api().compile(styled([])).form.config.titleDisplay, undefined, 'the viewer default is kept');
  assert.throws(() => api().compile(styled([], { titleDisplay: 'both' })), /titleDisplay must be/);
  const quality = api().contract().authoringContract.generationQuality;
  assert.match(quality.actionBar.width, /expand block or full makes it fill the width of its column in recent viewers/);
  assert.doesNotMatch(JSON.stringify(api().contract().authoringContract), /not rendered as a full-width|does not stretch/);
  assert.match(quality.dataViews.headers, /user's language/);
});
test('box styles: only the keys the viewer renders, nested parts of layoutChildrenStyle', () => {
  const codes = r => clone(r.validation.issues.concat(r.validation.warnings).map(i => i.code + ' ' + i.path));
  const bad = api().compile(styled([{ type: 'text', name: 't', label: 'T', boxStyle: { marginTop: '8px', color: '#333', boxShadow: '0 1px 2px #0002', fontSize: '14px', margin: '0 0 8px 0' } }]));
  assert.equal(bad.status, 'invalid', 'refused at creation');
  const unsupported = bad.validation.issues.filter(i => i.code === 'unsupported_style_key');
  assert.deepEqual(clone(unsupported.map(i => i.path.split('/').pop())).sort(), ['boxShadow', 'color', 'fontSize', 'marginTop']);
  assert.match(unsupported.find(i => /color$/.test(i.path)).message, /Use textColor/);
  assert.match(unsupported.find(i => /marginTop$/.test(i.path)).message, /shorthand/);
  const draft = clone(api().compile(styled([{ type: 'text', name: 't', label: 'T' }])).form);
  draft.formulaire.find(f => f.name === 't').config.boxStyle.marginTop = '8px';
  const checked = api().validate(draft);
  assert.equal(checked.validation.valid, true, 'an existing draft stays editable');
  assert.ok(checked.validation.warnings.some(w => w.code === 'unsupported_style_key'));
  const parts = api().compile(styled([{ type: 'layout', name: 'row', cols: [{ size: 6 }, { size: 6 }], layoutChildrenStyle: { default: { margin: '0', questionBoxStyle: { padding: '0 0 4px 0' }, componentBoxStyle: { borderRadius: '8px' } } }, children: [{ type: 'text', name: 'a', label: 'A' }, { type: 'text', name: 'b', label: 'B' }] }]));
  assert.equal(parts.status, 'ok', JSON.stringify(parts.validation.issues));
  assert.ok(!codes(parts).some(c => /unsupported_style_key|invalid_style_value/.test(c)));
});
test('containers: unrendered nesting refused, card children refused, layout columns derived', () => {
  const nested = api().compile(styled([{ type: 'layout', name: 'l', children: [{ type: 'ion-card', name: 'c', label: 'C' }] }]));
  assert.equal(nested.status, 'invalid');
  assert.ok(nested.validation.issues.some(i => i.code === 'unrendered_nesting'));
  assert.throws(() => api().compile(styled([{ type: 'ion-card', name: 'c', label: 'C', children: [{ type: 'text', name: 't', label: 'T' }] }])), /use a section/);
  const sizes = (form, name) => { const c = form.formulaire.find(f => f.name === name).config; return ['cols', 'tablet', 'phoneL', 'phoneP'].map(k => c[k].map(x => x.size).filter(n => n > 0).join('/')); };
  const r = api().compile(styled([
    { type: 'layout', name: 'two', cols: [{ size: 6 }, { size: 6 }], children: [{ type: 'text', name: 'a', label: 'A' }, { type: 'text', name: 'b', label: 'B' }] },
    { type: 'layout', name: 'three', children: [{ type: 'text', name: 'c', label: 'C' }, { type: 'text', name: 'd', label: 'D' }, { type: 'text', name: 'e', label: 'E' }] },
    { type: 'layout', name: 'given', cols: [{ size: 3 }, { size: 9 }], tablet: [{ size: 12 }], children: [{ type: 'text', name: 'f', label: 'F' }] }
  ]));
  assert.deepEqual(sizes(r.form, 'two'), ['6/6', '6/6', '12', '12']);
  assert.deepEqual(sizes(r.form, 'three'), ['4/4/4', '6/6', '12', '12']);
  assert.deepEqual(sizes(r.form, 'given'), ['3/9', '12', '12', '12'], 'given arrays are kept');
});
test('component visuals: grid toolbar style, image and map sizes, container text color, global box style', () => {
  const warned = (r, code) => r.validation.warnings.filter(w => w.code === code).map(w => w.path);
  const r = api().compile(styled([
    { type: 'grid', name: 'list', sourceEnabled: false, columns: [{ name: 'Nom', type: 'text' }], componentBoxStyle: { border: '1px solid #E2E8F0' } },
    { type: 'img', name: 'logo', config: { width: '100%', height: '120' } },
    { type: 'map', name: 'where', config: { minHeight: '50vh' } },
    { type: 'section', name: 'dark', title: 'Dark', boxStyle: { backgroundColor: '#0F172A', textColor: '#FFFFFF' }, fields: [{ type: 'button', name: 'go', label: 'Go', variant: 'primary', flow: 'go' }] },
    { type: 'description', name: 'band', description: '<p>Band</p>', boxStyle: { backgroundColor: '#0F172A', textColor: '#FFFFFF', margin: '0', padding: '16px' } }
  ], { flows: [{ id: 'go', elements: [{ type: 'toast', message: 'Go' }] }] }));
  assert.equal(warned(r, 'grid_component_style').length, 0, 'componentBoxStyle styles the table of a recent viewer');
  assert.equal(clone(warned(r, 'image_size_unit')).length, 0, 'a percentage is a valid image size');
  assert.equal(warned(r, 'map_height_unit').length, 1);
  const textColor = clone(warned(r, 'container_text_color'));
  assert.equal(textColor.length, 1, 'the dark section holding a button, not the text-only band: ' + textColor);
  const form = clone(r.form);
  form.config.boxStyle = { padding: '16px' };
  assert.ok(api().validate(form).validation.warnings.some(w => w.code === 'global_box_style' && w.path === '/config/boxStyle'));
  const contract = api().contract().authoringContract;
  assert.ok(contract.styleRendering.precedence && contract.styleRendering.textColor && contract.styleRendering.nesting);
  assert.match(contract.componentAuthoring.grid.visual, /gridCellPadding/);
  assert.ok(contract.styleObjectFields.borderWidth.legacy);
});
test('Baserow filter sub-groups: documented and kept by compile and edit', () => {
  const filter = api().contract().authoringContract.baserowSources.filter;
  assert.match(filter.groups.shape, /recursive/);
  assert.match(filter.groups.depth, /4 levels/);
  assert.match(filter.groups.variables, /forms_tableFilter.*forms_Filter/);
  assert.equal(filter.groups.example.filter.groups[0].condVisible, 'or');
  assert.equal(filter.uiAuthoredShape.groups.length, 0);
  const grouped = clone(filter.groups.example.filter);
  grouped.groups[0].groups = [{ type: 'filter', condVisible: 'and', conds: [{ val1: { name: 'Status', displayName: 'Status' }, val2: { type: 'text', str: 'open', html: false, arr: [] }, operator: 'equal' }], groups: [] }];
  const input = connectedExample();
  input.pages[1].fields[0].sources['lib_BaseRow.formssource_GetTableData'].vars.forms_tableFilter = clone(grouped);
  const r = api().compile(input);
  assert.equal(r.status, 'ok', JSON.stringify(r.validation.issues));
  const kept = r.form.formulaire.find(f => f.type === 'grid').sources['lib_BaseRow.formssource_GetTableData'].vars.forms_tableFilter;
  assert.equal(JSON.stringify(kept.groups), JSON.stringify(grouped.groups), 'compile keeps the sub-groups at every level');
  const h = creationHarness();
  const start = h.client.create(connectedWithoutIdentities(), h.auth);
  const grid = start.form.formulaire.find(f => f.type === 'grid');
  const sources = clone(grid.sources);
  sources['lib_BaseRow.formssource_GetTableData'].vars.forms_tableFilter = clone(grouped);
  const edited = h.client.edit(start.form._id, [{ action: 'update_field', fieldName: grid.name, patch: { sources } }], h.auth);
  const saved = edited.form.formulaire.find(f => f.type === 'grid').sources['lib_BaseRow.formssource_GetTableData'].vars.forms_tableFilter;
  assert.equal(JSON.stringify(saved.groups), JSON.stringify(grouped.groups), 'nocode-form-edit keeps them');
});
test('aggregation labels: documented, kept by compile', () => {
  const contract = api().contract().authoringContract;
  const aggregations = contract.baserowSources.groupAggregations;
  assert.match(aggregations.syntax, /optional label after =/);
  assert.match(aggregations.labels.key, /sum_Contract Value/);
  assert.match(aggregations.labels.rules, /128 characters/);
  assert.ok(aggregations.examples.some(example => /=Montant/.test(example)));
  assert.match(contract.generationQuality.dataViews.headers, /groupAggregations\.labels/);
  const input = connectedExample();
  const vars = input.pages[1].fields[0].sources['lib_BaseRow.formssource_GetTableData'].vars;
  vars.forms_tableGroupBy = { str: 'Status', html: false };
  vars.forms_tableAggregations = { str: 'count=Nombre,sum:Reference=Montant', html: false };
  const r = api().compile(input);
  assert.equal(r.status, 'ok', JSON.stringify(r.validation.issues));
  assert.equal(r.form.formulaire.find(f => f.type === 'grid').sources['lib_BaseRow.formssource_GetTableData'].vars.forms_tableAggregations.str, 'count=Nombre,sum:Reference=Montant');
});
test('refresh_grid targets a grid, a gallery or a chart; local rows a grid only', () => {
  const flows = (target, type = 'refresh_grid') => ({ flows: [{ id: 'reload', elements: [{ type, targetGrid: target }] }] });
  const fields = [
    { type: 'grid', name: 'list', sourceEnabled: false, columns: [{ name: 'Nom', type: 'text' }] },
    { type: 'gallery', name: 'cards' },
    { type: 'chart', name: 'stats' },
    { type: 'map', name: 'where' },
    { type: 'button', name: 'go', label: 'Go', variant: 'primary', flow: 'reload' },
  ];
  const issues = (extra) => clone(api().compile(styled(fields, extra)).validation.issues).filter(i => i.code === 'unknown_grid_target');
  for (const name of ['list', 'cards', 'stats']) { assert.equal(issues(flows(name)).length, 0, name); }
  assert.equal(issues(flows('where')).length, 1, 'a map is not reloaded by refresh_grid');
  assert.equal(issues(flows('cards', 'remove_row_from_local_grid')).length, 1, 'local rows belong to a grid');
  const r = api().compile(styled(fields, flows('cards')));
  const gallery = r.form.formulaire.find(f => f.name === 'cards');
  assert.equal(String(r.form.flows.find(f => f.id === 'reload').elements[0].config.targetGrid), String(gallery.id), 'resolved to the id of the gallery');
  assert.match(api().contract().authoringContract.flowAuthoring.gridActions, /a grid, a gallery or a chart for refresh_grid/);
});
test('sticky: compiled into config, validated, and an edit puts reduced config keys in config', () => {
  const r = api().compile(styled([{ type: 'description', name: 'search', description: '<p>Search</p>', sticky: 'notOnPhone' }]));
  assert.equal(r.status, 'ok', JSON.stringify(r.validation.issues));
  assert.equal(r.form.formulaire[0].config.sticky, 'notOnPhone');
  assert.equal(r.form.formulaire[0].sticky, undefined);
  const bad = api().compile(styled([{ type: 'description', name: 'search', description: '<p>Search</p>', sticky: 'top' }]));
  assert.ok(clone(bad.validation.issues).some(i => i.code === 'invalid_sticky'));
  assert.deepEqual(clone(api().contract().authoringContract.commonFieldFields.sticky.enum), ['always', 'notOnPhone']);
  const h = creationHarness();
  const start = h.client.create(connectedWithoutIdentities(), h.auth);
  const grid = start.form.formulaire.find(f => f.type === 'grid');
  const edited = h.client.edit(start.form._id, [{ action: 'update_field', fieldName: grid.name, patch: { deselectOnSecondClick: false, sticky: 'always' } }], h.auth);
  const saved = edited.form.formulaire.find(f => f.type === 'grid');
  assert.equal(saved.config.deselectOnSecondClick, false, 'the viewer reads config.deselectOnSecondClick');
  assert.equal(saved.config.sticky, 'always');
  assert.equal(saved.deselectOnSecondClick, undefined);
  assert.equal(saved.sticky, undefined);
});
test('new questions: no preselected select or checkbox answer, no prototype icon or question, required fields checked on submit', () => {
  const r = api().compile({ name: 'Defaults', navigationMode: 'custom', pages: [{ name: 'P', fields: [
    { type: 'select', name: 's', label: 'S', values: ['A', 'B'] },
    { type: 'checkbox', name: 'c', label: 'C', values: ['A', 'B'] },
    { type: 'radio', name: 'r', label: 'R', values: ['A', 'B'] },
    { type: 'grid', name: 'g', sourceEnabled: false, columns: [{ name: 'A', type: 'text' }] },
    { type: 'button', name: 'save', label: 'Save', flow: 'save' },
    { type: 'button', name: 'go', label: 'Go', flow: 'go', icon: 'arrow-forward' },
    { type: 'button', name: 'free', label: 'Free', flow: 'save', checkMandatoryInCurrentPage: false }
  ] }], flows: [
    { id: 'save', name: 'Save', elements: [{ type: 'submit', actions: { 'lib_Actions_C8Oforms.forms_notify_response_simple_by_mail_simple': { enabled: true, fullsync: false, vars: {} } } }] },
    { id: 'go', name: 'Go', elements: [{ type: 'push_page', targetPage: 'P' }] }
  ] });
  const field = name => r.form.formulaire.find(f => f.name === name);
  assert.deepEqual(clone(field('s').children.map(o => o.selected)), [false, false]);
  assert.deepEqual(clone(field('c').children.map(o => o.selected)), [false, false]);
  assert.deepEqual(clone(field('r').children.map(o => o.selected)), [true, false], 'a radio list keeps the prototype default');
  assert.equal(field('g').config.html, '');
  assert.ok(!r.validation.warnings.some(w => w.code === 'prototype_question_label'));
  assert.equal(field('save').config.icon, '');
  assert.equal(field('go').config.icon, 'arrow-forward');
  assert.equal(field('save').config.checkMandatoryInCurrentPage, true);
  assert.equal(field('free').config.checkMandatoryInCurrentPage, false);
  assert.equal(field('go').config.checkMandatoryInCurrentPage, false);
  const saveIndex = r.form.formulaire.findIndex(f => f.name === 'save');
  assert.ok(!r.validation.warnings.some(w => w.code === 'submit_without_required_check' && w.path.startsWith('/formulaire/' + saveIndex + '/')));
  assert.ok(r.validation.warnings.some(w => w.code === 'submit_without_required_check'), 'an explicit false is still reported');
});
test('spacing warnings: none on a questionnaire\'s questions or on a section title, still on a bare application block', () => {
  const questionnaire = api().compile({ name: 'Q', pages: [{ name: 'P', fields: [{ type: 'text', name: 'a', label: 'A' }, { type: 'text', name: 'b', label: 'B' }] }] });
  assert.ok(!questionnaire.validation.warnings.some(w => w.code === 'missing_block_spacing'));
  const app = api().compile({ name: 'App', navigationMode: 'custom', pages: [{ name: 'P', header: { title: 'P' }, fields: [
    { type: 'section', name: 'sec', title: 'Section', fields: [{ type: 'text', name: 'a', label: 'A' }] },
    { type: 'description', name: 'note', description: '<p style="margin:0">Note</p>', boxStyle: { margin: '', padding: '' }, config: { boxStyle: { margin: '', padding: '' } } }
  ] }], styleDefaults: false });
  assert.ok(!app.validation.warnings.some(w => w.code === 'html_spacing_without_container_style' && /formulaire\/2\//.test(w.path)), JSON.stringify(app.validation.warnings));
  assert.ok(app.validation.warnings.some(w => w.code === 'missing_block_spacing'), 'a bare application block is still reported');
});
test('a create refused before its first save does not ask to finalize a saved id', () => {
  const h = creationHarness({ columns: [{ name: 'Other', type: 'text' }] });
  const r = h.client.create(connectedWithoutIdentities(), h.auth);
  assert.equal(r.saved, false);
  assert.ok(!r.validation.warnings.some(w => w.code === 'baserow_identity_incomplete'), JSON.stringify(r.validation.warnings));
  const empty = api().compile({ name: 'E', navigationMode: 'custom', pages: [{ name: 'P', fields: [{ type: 'button', name: 'b', label: 'B', flow: 'f' }] }], flows: [{ id: 'f', name: 'F', elements: [{ type: 'submit', actions: {} }] }] });
  assert.match(empty.validation.issues.find(i => i.code === 'unconfigured_submit').message, /automatic submit of its last page.*forms_AddRow/);
});
