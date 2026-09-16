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
  const r = api().compile(example());
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
    { type: 'if_else', id: 1900000000201, childrenRefs: [1900000000202], childrenRefsElse: [1900000000203] },
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
  assert.throws(() => client.assertStrictJsonText('{"name":"x"} trailing', 'reduced'), /after the closing bracket/);
  assert.throws(() => client.assertStrictJsonText('{"name":"unterminated', 'reduced'), /unterminated string/);
  assert.equal(client.assertStrictJsonText('{"name":"ok","pages":[{"fields":[{"type":"text","name":"a","label":"A {x}"}]}]}', 'reduced'), true);
  assert.equal(client.assertStrictJsonText(' [1, {"a": "]"}] ', 'ops'), true);
  assert.throws(() => client.parseObject(truncated, 'reduced', {}), /reduced is not valid JSON/);
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
  const input = example();
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
