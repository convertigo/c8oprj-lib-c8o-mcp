// Run: node --test tests/scripts/validate_nocode_style_model.cjs
// The style model of C8Oforms 2.2 in the no-code contract: sizes, shadow, opacity, typography and horizontalAlign,
// screen variants (screens.tablet, screens.phone) and states (states.hover, focus, active, disabled) of the box styles,
// the named styles of the application (config.styles, config.style of a component), the navigation style
// (navigation.style) and the role spacing as named styles (namedStyles: true). Each value is checked against the
// grammar of the viewer (getC8oStyleCssValue, getNavStyleCssValue). A C8Oforms without the model (no
// NavStyleEditor) refuses all of it, as before. Reads the Forms prototypes; never writes to a form or a database.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const formsRoot = process.env.C8OFORMS_PROJECT_ROOT || path.resolve(root, '../C8oForms');
const source = fs.readFileSync(path.join(root, 'js/nocode_forms.js'), 'utf8');

// A C8Oforms project of the test: the prototypes of formsRoot, with or without the style model (NavStyleEditor).
function project(styleModel) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c8oforms-style-model-'));
  const components = path.join(dir, 'DisplayObjects/mobile/assets/components');
  fs.mkdirSync(components, { recursive: true });
  fs.copyFileSync(path.join(formsRoot, 'DisplayObjects/mobile/assets/components/AllTypes.json'), path.join(components, 'AllTypes.json'));
  if (styleModel) {
    fs.mkdirSync(path.join(dir, '_c8oProject/mobileSharedComponents'), { recursive: true });
    fs.writeFileSync(path.join(dir, '_c8oProject/mobileSharedComponents/NavStyleEditor.yaml'), 'scriptContent: \n');
  }
  return dir;
}
const withModel = project(true);
const withoutModel = project(false);

// transport: the requestables an edit calls (the token check, the read and the save of the form), answered in memory
function api(dir, transport) {
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
  const engine = { theApp: { databaseObjectsManager: { getOriginalProjectByName: () => ({ getDirFile: () => dir }) }, contextManager: { remove() {} } } };
  const packages = new Proxy(empty, { get: (_, key) => {
    if (key === 'java') return { io: { File }, util: { HashMap: transport ? HashMap : empty, Base64: empty } };
    if (key === 'com') return { twinsoft: { convertigo: { engine: { Engine: engine, requesters: transport ? { InternalRequester, InternalHttpServletRequest: class {} } : empty, util: transport ? { XMLUtils: { XmlToJson: (response) => JSON.stringify(response) } } : empty, enums: empty } } } };
    if (key === 'org') return { apache: { commons: { io: { FileUtils: { readFileToString: (file) => fs.readFileSync(file.path, 'utf8') } } } } };
    return empty;
  } });
  const sandbox = { Packages: packages, java: { lang: { System: { currentTimeMillis: () => 1800000000000 }, String, reflect: { Array: { newInstance: () => [] } } } } };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'nocode_forms.js' });
  return sandbox.C8O.nocodeForms;
}
// An edit of a form kept in memory: its result, the form saved.
function edit(dir, form, operations) {
  const store = { form: JSON.parse(JSON.stringify({ ...form, _id: 'form-1', _rev: '1-a' })) };
  const client = api(dir, (sequence, params) => {
    if (sequence === 'nocode_validate_token') return { document: { result: { authenticated: true, user: 'creator@example.invalid' } } };
    if (sequence === 'APIV2_getDocument') return { document: { res: JSON.parse(JSON.stringify(store.form)) } };
    if (sequence === 'APIV2_updateFormulaireDocument') {
      const saved = JSON.parse(params.meta);
      delete saved._c8oExpectedRevision;
      saved._rev = '2-b';
      store.form = saved;
      return { document: { res: { ok: true, id: saved._id, rev: saved._rev } } };
    }
    if (sequence === 'formscommon_ApplicationsList') return { document: { array: [] } };
    throw new Error('Unexpected requestable ' + sequence);
  });
  const result = client.edit('form-1', operations, { token: 'unit-test-token-not-a-credential' });
  assert.equal(result.saved, true, JSON.stringify(result.error || (result.validation && result.validation.issues)));
  return store.form;
}
const clone = (x) => JSON.parse(JSON.stringify(x));
const styled = (fields, extra = {}) => ({ name: 'Styles', navigationMode: 'custom', pages: [{ name: 'Main', fields }], ...extra });
const codes = (r) => r.validation.issues.concat(r.validation.warnings).map((i) => i.code + ' ' + i.path);

test('the contract tells whether the C8Oforms of the server renders the style model', () => {
  assert.deepEqual(clone(api(withModel).contract({}).capabilities), { styleModel: true });
  assert.deepEqual(clone(api(withoutModel).contract({}).capabilities), { styleModel: false });
  const whole = api(withModel).contract({ sections: ['all'] });
  assert.equal(whole.capabilities.styleModel, true);
  const fields = whole.authoringContract.styleObjectFields;
  for (const key of ['width', 'maxWidth', 'height', 'minHeight', 'boxShadow', 'opacity', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textTransform', 'textAlign', 'fontFamily', 'horizontalAlign', 'screens', 'states']) {
    assert.equal(fields[key].styleModel, true, key);
  }
  const rendering = whole.authoringContract.styleRendering;
  assert.match(rendering.namedStyles, /config\.styles/);
  assert.match(rendering.navigationStyle, /indicator dot\|underline\|none/);
  assert.match(rendering.perDevice, /screens\.phone \(below 768px\)/);
  assert.equal(whole.authoringContract.rootFields.navigationStyle.mapsTo, 'navigation.style');
});

test('the new keys, screens and states compile and are checked against the grammar of the viewer', () => {
  const ok = api(withModel).compile(styled([
    { type: 'description', name: 'kpi', description: '<p>12</p>', boxStyle: { minHeight: '120px', boxShadow: 'sm', fontSize: '1.125rem', fontWeight: '600', textAlign: 'center', maxWidth: 'min(640px, 100%)', horizontalAlign: 'center',
      screens: { phone: { minHeight: '96px', padding: '12px' } }, states: { hover: { boxShadow: '0 4px 12px rgba(15, 23, 42, 0.12)', borderColor: '#2563EB' }, disabled: { opacity: '0.6' } } } },
    { type: 'text', name: 'email', label: 'Email', componentBoxStyle: { minHeight: '44px', states: { focus: { borderColor: 'var(--ion-color-primary)' } } } },
  ]));
  assert.equal(ok.status, 'ok', JSON.stringify(ok.validation.issues));
  assert.ok(!codes(ok).some((c) => /style/.test(c)), codes(ok).join('\n'));
  assert.equal(ok.form.formulaire.find((f) => f.name === 'kpi').config.boxStyle.screens.phone.minHeight, '96px');
  const bad = api(withModel).compile(styled([
    { type: 'text', name: 't', label: 'T', boxStyle: {
      width: '12', fontFamily: 'Comic Sans MS', boxShadow: '0 2px url(x)', opacity: '2', fontWeight: '650', textAlign: 'center;color:red',
      screens: { mobile: { padding: '0' }, phone: { states: { hover: {} } } },
      states: { hover: { padding: '4px', backgroundColor: 'url(x)' }, pressed: {} },
    } },
  ]));
  assert.equal(bad.status, 'invalid');
  const found = bad.validation.issues.map((i) => i.code + ' ' + i.path.split('/config/boxStyle/')[1]);
  for (const expected of ['invalid_style_value width', 'invalid_style_value fontFamily', 'invalid_style_value boxShadow', 'invalid_style_value opacity', 'invalid_style_value fontWeight',
    'invalid_style_value textAlign', 'invalid_style_variant screens/mobile', 'invalid_style_variant screens/phone/states', 'unsupported_state_key states/hover/padding',
    'invalid_style_value states/hover/backgroundColor', 'invalid_style_variant states/pressed']) {
    assert.ok(found.includes(expected), expected + ' in ' + found.join(', '));
  }
  assert.match(bad.validation.issues.find((i) => /fontFamily$/.test(i.path)).message, /system, serif or mono/);
});

test('a C8Oforms without the style model refuses all of it, as before', () => {
  const r = api(withoutModel).compile(styled([
    { type: 'text', name: 't', label: 'T', style: 'st_card', boxStyle: { fontSize: '14px', screens: { phone: { padding: '8px' } } } },
  ], { config: { styles: [{ id: 'st_card', name: 'Card', boxStyle: { padding: '16px' } }] }, navigationStyle: { bar: { backgroundColor: '#0F172A' } }, namedStyles: true }));
  assert.equal(r.status, 'invalid');
  const found = codes(r);
  assert.ok(found.some((c) => c == 'unsupported_style_key /formulaire/0/config/boxStyle/fontSize' || /unsupported_style_key .*fontSize$/.test(c)), found.join('\n'));
  assert.ok(found.some((c) => /^style_model_unavailable .*\/screens$/.test(c)));
  assert.ok(found.some((c) => /^style_model_unavailable .*\/config\/style$/.test(c)));
  assert.ok(found.some((c) => c == 'style_model_unavailable /config/styles'));
  assert.ok(found.some((c) => c == 'style_model_unavailable /navigation/style'));
  assert.ok(found.some((c) => c == 'style_model_unavailable /namedStyles'), 'the role spacing stays on each component');
  assert.ok(!(r.form.config.styles || []).some((s) => /^st_role_/.test(s.id)));
});

test('named styles: listed in config.styles, named by the components, checked', () => {
  const styles = [{ id: 'st_card', name: 'Card', boxStyle: { padding: '16px', borderRadius: '12px', boxShadow: 'sm' }, componentBoxStyle: { minHeight: '44px' } }];
  const ok = api(withModel).compile(styled([{ type: 'text', name: 't', label: 'T', style: 'st_card' }], { config: { styles } }));
  assert.equal(ok.status, 'ok', JSON.stringify(ok.validation.issues));
  assert.equal(ok.form.formulaire.find((f) => f.name === 't').config.style, 'st_card', 'a reduced field gives style at its root');
  assert.deepEqual(clone(ok.form.config.styles), styles);
  const bad = api(withModel).compile(styled([{ type: 'text', name: 't', label: 'T', style: 'st_unknown' }], { config: { styles: [
    { id: 'st_a', name: 'A', boxStyle: { fontSize: 'huge' } }, { id: 'st_a', name: 'A again' }, { name: 'No id' }, { id: 'st_b', name: 'B', colors: {} },
  ] } }));
  const found = codes(bad);
  for (const expected of ['unknown_named_style /formulaire/0/config/style', 'invalid_style_value /config/styles/0/boxStyle/fontSize', 'duplicate_named_style /config/styles/1/id',
    'invalid_named_style /config/styles/2/id', 'ignored_named_style_key /config/styles/3/colors']) {
    assert.ok(found.includes(expected), expected + ' in ' + found.join('\n'));
  }
});

test('namedStyles: true turns the role spacing into named styles of the application, the look unchanged', () => {
  const fields = () => [
    { type: 'description', name: 'intro', description: '<p>Intro</p>' },
    { type: 'text', name: 'first_name', label: 'First name' },
    { type: 'text', name: 'last_name', label: 'Last name' },
    { type: 'button', name: 'save', label: 'Save', flow: 'noop' },
    { type: 'text', name: 'custom', label: 'Custom', boxStyle: { margin: '0 0 40px 0' } },
  ];
  const flows = [{ id: 'noop', elements: [{ type: 'push_page', targetPage: 'Main' }] }];
  const plain = api(withModel).compile(styled(fields(), { flows }));
  const named = api(withModel).compile(styled(fields(), { flows, namedStyles: true, language: 'fr' }));
  assert.equal(named.status, 'ok', JSON.stringify(named.validation.issues));
  const ids = clone(named.form.config.styles.map((s) => s.id)).sort();
  assert.deepEqual(ids, ['st_role_button', 'st_role_field', 'st_role_text']);
  assert.equal(named.form.config.styles.find((s) => s.id === 'st_role_field').name, 'Champ');
  for (const name of ['intro', 'first_name', 'last_name', 'save']) {
    const before = plain.form.formulaire.find((f) => f.name === name).config;
    const after = named.form.formulaire.find((f) => f.name === name).config;
    assert.match(after.style, /^st_role_/, name);
    // the look: the named style under what the component keeps of its own (the button wrapper defaults)
    const style = named.form.config.styles.find((s) => s.id === after.style).boxStyle;
    const own = Object.fromEntries(Object.entries(after.boxStyle || {}).filter(([, v]) => v !== ''));
    assert.deepEqual(clone({ ...style, ...own }), clone(Object.fromEntries(Object.entries(before.boxStyle).filter(([, v]) => v !== ''))), name);
  }
  // an explicit style keeps its own box style, without a named style
  assert.equal(named.form.formulaire.find((f) => f.name === 'custom').config.style, undefined);
  // a field added later uses the named style of its role
  const form = edit(withModel, named.form, [{ action: 'add_field', pageName: 'Main', field: { type: 'text', name: 'phone', label: 'Phone' } }]);
  const phone = form.formulaire.find((f) => f.name === 'phone');
  assert.equal(phone.config.style, 'st_role_field');
  assert.equal(form.config.styles.length, 3);
});

test('navigation style: compiled from navigationStyle, set by set_root, checked', () => {
  const navigationStyle = { bar: { backgroundColor: '#0F172A', minHeight: '64px', borderTop: '1px solid #1E293B', justify: 'space-between' }, tab: { textColor: '#CBD5E1', display: 'icon', iconPosition: 'start', padding: '4px 12px' },
    selected: { indicator: 'underline', indicatorColor: '#38BDF8' }, buttons: { mainBackground: '#2563EB', borderRadius: '12px' }, screens: { phone: { tab: { iconSize: '24px' } } } };
  const ok = api(withModel).compile(styled([{ type: 'text', name: 't', label: 'T' }], { navigationStyle }));
  assert.equal(ok.status, 'ok', JSON.stringify(ok.validation.issues));
  assert.deepEqual(clone(ok.form.navigation.style), navigationStyle);
  const bad = api(withModel).validate({ ...clone(ok.form), navigation: { style: { bar: { backgroundColor: 'url(x)', padding: '1 2' }, tab: { display: 'all', shadow: '1px' }, menu: {}, screens: { mobile: {} } } } });
  const found = codes(bad);
  for (const expected of ['invalid_navigation_style /navigation/style/bar/backgroundColor', 'invalid_navigation_style /navigation/style/bar/padding',
    'invalid_navigation_style /navigation/style/tab/display', 'unsupported_navigation_style_key /navigation/style/tab/shadow',
    'unsupported_navigation_style_key /navigation/style/menu', 'invalid_style_variant /navigation/style/screens/mobile']) {
    assert.ok(found.includes(expected), expected + ' in ' + found.join('\n'));
  }
  const form = edit(withModel, ok.form, [{ action: 'set_root', navigationStyle: { bar: { backgroundColor: '#111827', minHeight: null } } }]);
  assert.equal(form.navigation.style.bar.backgroundColor, '#111827');
  assert.equal(form.navigation.style.bar.minHeight, undefined, 'a merge patch: null removes a key');
  assert.equal(form.navigation.style.tab.textColor, '#CBD5E1', 'the rest of the style kept');
});

// The same grammar as the viewer: C8OFORMS_VIEWER_ROOT names a C8Oforms with the style model (its viewerPage), and
// C8OFORMS_TS a TypeScript compiler; without them the check is skipped.
test('the grammar of the contract is the one of the viewer of C8Oforms', (t) => {
  const viewerRoot = process.env.C8OFORMS_VIEWER_ROOT || formsRoot;
  const file = path.join(viewerRoot, '_c8oProject/mobilePages/viewerPage.yaml');
  const yaml = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (!yaml.includes('getC8oStyleCssValue') || !process.env.C8OFORMS_TS) {
    t.skip('needs C8OFORMS_VIEWER_ROOT (a C8Oforms with the style model) and C8OFORMS_TS');
    return;
  }
  const ts = require(process.env.C8OFORMS_TS);
  const code = yaml.split('\n').map((line) => line.replace(/^ {8}/, '')).join('\n').replace(/''/g, "'");
  const method = (name) => {
    const match = new RegExp(`\\n\\t(?:public |private )?${name}\\(`).exec(code);
    let index = code.indexOf('{', code.indexOf(')', match.index + match[0].length - 1));
    let depth = 0;
    const start = match.index + 1;
    do { const char = code[index++]; if (char == '{') depth++; else if (char == '}') depth--; } while (depth > 0);
    return code.substring(start, index);
  };
  const names = ['getC8oStyleCssValue', 'isC8oCssLength', 'isC8oCssColor', 'getC8oStyleColorValue', 'getC8oStyleShadowValue', 'splitC8oStyleList', 'getC8oStyleFontFamilies',
    'getC8oStyleShadows', 'splitViewerCssValue', 'cleanViewerCssValue', 'getNavStyleCssValue', 'getNavStyleBorderValue'];
  const js = ts.transpileModule(`class Viewer {\n${names.map(method).join('\n')}\n}\nmodule.exports = Viewer;`, { compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', js)(module, module.exports);
  const viewer = new module.exports();
  const client = api(withModel);
  const contractAccepts = (key, value) => !client.validate({ name: 'G', pages: [{ name: 'P', pageTechName: 'P' }], formulaire: [{ id: 1, name: 'f', type: 'text', config: { page: 'P', boxStyle: { [key]: value } } }], flows: [] })
    .validation.issues.concat([]).some((i) => /\/boxStyle\//.test(i.path));
  const samples = ['0', '12px', '12', '-4px', '50%', '1.5rem', 'auto', 'none', 'calc(100% - 24px)', 'calc(100% - var(--x))', 'clamp(12px, 2vw, 18px)', 'url(x)', '12px; color: red',
    'bold', '650', '600', 'normal', '1.4', 'uppercase', 'center', 'justify', 'left', 'serif', 'Comic Sans', 'mono', '0.5', '.5', '1.5', 'sm', 'lg', '0 2px 4px rgba(0, 0, 0, 0.2)',
    'inset 0 0 0 1px #2563eb, 0 8px 24px #0002', '0 2px url(x)', '2px', 'stretch', 'start', 'end'];
  for (const key of ['width', 'maxWidth', 'height', 'minHeight', 'boxShadow', 'opacity', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textTransform', 'textAlign', 'fontFamily', 'horizontalAlign']) {
    for (const value of samples) {
      assert.equal(contractAccepts(key, value), viewer.getC8oStyleCssValue(key, value) != '', `${key} ${JSON.stringify(value)}`);
    }
  }
  const navAccepts = (key, value) => !client.validate({ name: 'G', pages: [{ name: 'P', pageTechName: 'P' }], formulaire: [], flows: [], navigation: { style: { bar: { [key]: value } } } })
    .validation.issues.some((i) => /\/navigation\/style\//.test(i.path));
  for (const [key, values] of Object.entries({ backgroundColor: ['#0F172A', 'url(x)', 'rgb(1, 2, 3)', 'auto', 'var(--ion-color-primary)'], borderTop: ['1px solid #E5E7EB', '2px 3px red', 'none', 'solid red; x'],
    padding: ['4px 12px', '1 2', '1px 2px 3px 4px 5px'], minHeight: ['64px', '64', 'auto'], gap: ['8px', '-2px'], justify: ['space-between', 'stretch'] })) {
    for (const value of values) {
      assert.equal(navAccepts(key, value), viewer.getNavStyleCssValue(key, value) != '', `navigation ${key} ${JSON.stringify(value)}`);
    }
  }
});
