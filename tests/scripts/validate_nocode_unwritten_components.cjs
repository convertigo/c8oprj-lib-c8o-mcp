// Run: C8OFORMS_PROJECT_ROOT=<C8Oforms NGX checkout> node --test tests/scripts/validate_nocode_unwritten_components.cjs
// The rule of the steps only No Code Studio writes (0.3.0-beta.59), for components and settings: what the C8Oforms of the
// server does not write comes from its contract (C8Oforms 2.3, table unwritten { components, settings, flowElements }),
// never from a list here. What No Code Studio wrote is kept; a new one is refused with the reason of C8Oforms quoted as it
// is, the place (page, component, setting) and no approximation (another component, a style or HTML, a navigation).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { formsEngine } = require('../helpers/c8oforms_contract.cjs');
const root = path.resolve(__dirname, '../..');
const formsRoot = process.env.C8OFORMS_PROJECT_ROOT || path.resolve(root, '../C8oForms');
const source = fs.readFileSync(path.join(root, 'js/nocode_forms.js'), 'utf8');
const clone = x => JSON.parse(JSON.stringify(x));

// overrides(sequence): the sequences transport answers instead of the C8Oforms checkout (a contract changed as another
// C8Oforms answers it)
function api(transport, sourceText, overrides) {
  const forms = formsEngine(formsRoot);
  const answer = transport;
  transport = (sequence, params) => {
    const override = overrides && overrides(sequence);
    if (override && override.record) {
      override.record(sequence, params);
      return forms.sequence(sequence, params);
    }
    if (override && override.change) {
      const response = forms.sequence(sequence, params);
      if (sequence !== 'NoCode_Contract' && String(params.operation) !== 'contract') return response;
      const json = JSON.parse(response.document.res.json);
      const holder = json.result && typeof json.result === 'object' && json.result.version ? json.result : json;
      override.change(holder);
      response.document.res.json = JSON.stringify(json);
      return response;
    }
    if (override) return answer(sequence, params);
    return forms.handles(sequence) ? forms.sequence(sequence, params) : answer ? answer(sequence, params) : undefined;
  };
  const empty = new Proxy(function () {}, { get: (_, key) => key === Symbol.toPrimitive ? () => '' : empty });
  class HashMap { constructor() { this.values = {}; } put(key, value) { this.values[key] = value; } }
  class InternalRequester {
    constructor(params) { this.params = params.values; }
    processRequest() { const response = transport(this.params.__sequence, this.params); return { getDocumentElement: () => response }; }
    getContext() { return {}; }
  }
  const engine = { theApp: { databaseObjectsManager: { getOriginalProjectByName: () => forms.project() }, contextManager: { remove() {} } } };
  // the temporary file of a thumbnail: nothing is written
  const File = { createTempFile: () => ({ deleteOnExit() {}, getAbsolutePath: () => '/tmp/thumbnail-test', delete() {} }) };
  const packages = new Proxy(empty, { get: (_, key) => {
    if (key === 'java') return { io: { File }, util: { HashMap, Base64: { getDecoder: () => ({ decode: () => [] }) } } };
    if (key === 'com') return { twinsoft: { convertigo: { engine: { Engine: engine, requesters: { InternalRequester, InternalHttpServletRequest: class {} }, util: { XMLUtils: { XmlToJson: response => JSON.stringify(response) } }, enums: empty } } } };
    if (key === 'org') return { apache: { commons: { io: { FileUtils: empty } } } };
    return empty;
  } });
  const sandbox = { Packages: packages, java: { util: { UUID: { randomUUID: () => require('node:crypto').randomUUID() } }, lang: { System: { currentTimeMillis: () => 1800000000000 }, String, reflect: { Array: { newInstance: () => [] } } } } };
  vm.createContext(sandbox);
  vm.runInContext(sourceText || source, sandbox, { filename: 'nocode_forms.js' });
  return sandbox.C8O.nocodeForms;
}

// A C8Oforms server of forms kept in memory: read, save (with the revision check) and the token check.
function harness(sourceText, contractChange, record) {
  const state = { forms: {}, saves: 0, user: 'creator@example.invalid' };
  const guard = {};
  vm.runInNewContext(fs.readFileSync(path.join(formsRoot, 'js/form_write_guard.js'), 'utf8'), guard);
  const client = api((sequence, params) => {
    if (sequence === 'nocode_validate_token') return { document: { result: { authenticated: true, user: state.user } } };
    if (sequence === 'formscommon_ApplicationsList') return { document: { array: [] } };
    if (sequence === 'formscommon_FieldsList') return { document: { array: [{ name: 'Reference', type: 'text' }] } };
    if (sequence === 'APIV2_getDocument') return { document: { res: clone(state.forms[params.id] || {}) } };
    if (sequence === 'APIV2_updateFormulaireDocument') {
      state.saves++;
      const form = JSON.parse(params.meta);
      const guarded = guard.c8oFormWriteGuard.prepare(form, id => state.forms[id]);
      if (guarded.error) return { document: { res: guarded.error } };
      if (!form._id) { form._id = 'form-' + state.saves; form.creator = state.user; }
      const current = state.forms[form._id];
      form._rev = String(current ? Number(current._rev.split('-')[0]) + 1 : 1) + '-saved';
      state.forms[form._id] = clone(form);
      return { document: { res: { ok: true, id: form._id, rev: form._rev } } };
    }
    throw new Error('Unexpected requestable ' + sequence);
  }, sourceText, record ? (sequence => sequence === 'NoCode_Form' ? { record } : null) : contractChange ? contractOverrides(contractChange) : null);
  return { state, client, auth: { token: 'unit-test-token-not-a-credential' } };
}

// An application of its own: a list page with a card template, a detail page in a layout, a save flow and a computed field.
function shop() {
  return { name: 'Atelier', navigationMode: 'custom', pages: [
    { name: 'Catalogue', fields: [
      { type: 'description', name: 'intro', description: '<p>Nos objets</p>' },
      { type: 'text', name: 'recherche', label: 'Rechercher' },
      { type: 'text', name: 'total', label: 'Total', defaultFrom: { source: 'expression', expression: "String((fields.recherche || '').length) + ' objets'", mode: 'reactive' } },
      { type: 'layout', name: 'actions', cols: [{ size: 6 }, { size: 6 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }], children: [
        { type: 'button', name: 'ouvrir', label: 'Ouvrir', flow: 'open_detail' },
        { type: 'button', name: 'garder', label: 'Garder', flow: 'keep_item' }
      ] }
    ] },
    { name: 'Fiche', fields: [{ type: 'text', name: 'titre', label: 'Titre' }] }
  ], flows: [
    { id: 'open_detail', name: 'Ouvrir la fiche', elements: [{ type: 'push_page', targetPage: 'Fiche' }] },
    { id: 'keep_item', name: 'Garder', elements: [{ type: 'toast', message: 'Gardé', color: 'success' }] }
  ] };
}

function created(h, reduced) {
  const r = h.client.create(reduced || shop(), h.auth);
  assert.equal(r.saved, true, JSON.stringify(r.validation && r.validation.issues));
  return r.id;
}


// The contract of the C8Oforms checkout, changed as C8Oforms 2.3 answers it (its table unwritten), for js/nocode_forms.js:
// NoCode_Form with operation contract, or NoCode_Contract.
function contractOverrides(change) {
  return sequence => sequence === 'NoCode_Contract' || sequence === 'NoCode_Form' ? { change } : null;
}

const NO_APPROXIMATION = 'Never replace it with an approximation: another component, a style or HTML, or a navigation.';
const MODAL = { reason: 'A modal is a layout with config.overlay { kind: modal }, opened by open_overlay: the reduced contract does not write overlays yet; add it in No Code Studio.',
  prototype: { type: 'layout', config: 'overlay.kind=modal' } };
const ICON_GAP = 'the gap between the icon and the text of a button: configured in No Code Studio';
const SET_PROPERTIES = 'changes the properties of a component at runtime; configured in No Code Studio';
// the section unwritten of C8Oforms 2.3, in its two agreed shapes: reasons alone and settings by path, or components with
// their prototype and settings by component type
const table23 = c => { c.sections.unwritten = { components: { modal: MODAL.reason }, settings: { 'config.boxStyle.iconGap': ICON_GAP }, flowElements: { set_properties: SET_PROPERTIES } }; };
const table23ByType = c => { c.sections.unwritten = { components: { modal: MODAL }, settings: { button: { 'config.iconGap': ICON_GAP } }, flowElements: { set_properties: SET_PROPERTIES } }; };
const editTool = client => clone(client.contract({ sections: ['editTool'] })).sections.editTool;

test('the components and settings the C8Oforms does not write come from its table; without it, nothing is guessed', () => {
  // the C8Oforms of the checkout: its section when it has one (2.3), else the palette and no setting
  const served = editTool(api());
  const raw = JSON.parse(formsEngine(formsRoot).sequence('NoCode_Contract', {}).document.res.json).result;
  const section = raw.sections && raw.sections.unwritten;
  if (section) {
    assert.deepEqual(Object.keys(served.unwrittenComponents).sort(), Object.keys(section.components || {}).sort());
    for (const [type, value] of Object.entries(section.components || {})) assert.equal(served.unwrittenComponents[type], typeof value === 'string' ? value : value.reason, type);
    assert.deepEqual(served.unwrittenSettings, section.settings || {});
    assert.deepEqual(served.unwrittenSteps, section.flowElements || {});
  } else {
    assert.deepEqual(served.unwrittenComponents, {}, 'the palette of this C8Oforms has no component its contract leaves out');
    assert.deepEqual(served.unwrittenSettings, {}, 'no setting guessed without the table');
  }
  const v23 = editTool(api(null, null, contractOverrides(table23)));
  assert.deepEqual(v23.unwrittenComponents, { modal: MODAL.reason });
  assert.deepEqual(v23.unwrittenSettings, { 'config.boxStyle.iconGap': ICON_GAP });
  assert.deepEqual(v23.unwrittenSteps, { set_properties: SET_PROPERTIES }, 'unwritten.flowElements');
  const byType = editTool(api(null, null, contractOverrides(table23ByType)));
  assert.deepEqual(byType.unwrittenComponents, { modal: MODAL.reason }, 'the reason of a component given with its prototype');
  assert.deepEqual(byType.unwrittenSettings, { button: { 'config.iconGap': ICON_GAP } });
  // the section is served as C8Oforms gives it, among the others
  const sections = clone(api(null, null, contractOverrides(table23)).contract({ sections: ['unwritten'] })).sections;
  assert.deepEqual(sections.unwritten.settings, { 'config.boxStyle.iconGap': ICON_GAP });
  const version = client => clone(client.contract({})).contractVersion.split('+')[1];
  assert.notEqual(version(api(null, null, contractOverrides(table23))), version(api(null, null, contractOverrides(table23ByType))), 'the table is in the guidance version');
  const rule = v23.notes.find(note => /editor_component_kept/.test(note));
  assert.match(rule, /A component, a setting or a flow step this C8Oforms does not write \(unwrittenComponents, unwrittenSettings, unwrittenSteps, each with its reason\)/);
  assert.match(rule, /naming the page, the component and the setting, or the flow and the step it follows/);
  assert.match(rule, /never replace it with an approximation: another component, a style or HTML, a navigation/);
  const drawer = fs.readFileSync(path.join(root, 'resources/convertigo-nocode/workflow-existing.md'), 'utf8');
  assert.match(drawer, /`unwrittenComponents`, `unwrittenSettings` and `unwrittenSteps`/);
  assert.match(drawer, /`editor_component_kept`, `editor_setting_kept` or `editor_flow_element_kept`/);
});

// a form as saved: a button with a setting No Code Studio set, a modal it wrote
function savedWithEditorParts() {
  return { pages: [{ name: 'Accueil', pageTechName: 'PAGE1' }], flows: [], formulaire: [
    { id: 10, type: 'button', name: 'ouvrir', config: { page: 'PAGE1', iconGap: '12px', label: 'Ouvrir' } },
    { id: 11, type: 'layout', name: 'aide_modal', childrenRefs: [], config: { page: 'PAGE1', overlay: { kind: 'modal', title: 'Aide' } } }
  ] };
}

test('C8Oforms 2.3 issues: what No Code Studio wrote is kept as a warning; a new one keeps its words, its reason once, the place and no approximation', () => {
  const nf = api();
  const current = savedWithEditorParts();
  const issues = form => ({ valid: false, issues: [
    { code: 'unwritten_setting', message: 'Unwritten setting config.iconGap of a button', path: '/formulaire/0/config/iconGap', setting: 'config.iconGap', reason: ICON_GAP },
    { code: 'unwritten_component', message: 'Unwritten component modal', path: '/formulaire/1', type: 'modal', reason: MODAL.reason }
  ], warnings: [] });
  // the same form: both kept
  const same = clone(nf.keepEditorFlowElements(issues(), clone(current), current, {}));
  assert.equal(same.valid, true);
  assert.deepEqual(same.warnings.map(w => w.code), ['editor_setting_kept', 'editor_component_kept']);
  assert.match(same.warnings[0].message, /^Page Accueil: the setting config\.iconGap of ouvrir \(button\) was set in No Code Studio and the tools of this C8Oforms do not write it: kept as it is/);
  // the setting changed by the tools, the modal new: both refused with their place
  const changed = clone(current);
  changed.formulaire[0].config.iconGap = '20px';
  const fresh = clone(current);
  fresh.formulaire[1].id = 99;
  const r1 = clone(nf.keepEditorFlowElements(issues(), changed, current, {}));
  // the reasons of C8Oforms say No Code Studio: not said again
  assert.equal(r1.issues[0].message, 'Unwritten setting config.iconGap of a button. Reason: ' + ICON_GAP + '. Ask the user to change it, on page «Accueil», component «ouvrir», setting config.iconGap. ' + NO_APPROXIMATION);
  assert.deepEqual(r1.issues[0].addInNoCodeStudio, { type: 'button', page: 'Accueil', component: 'ouvrir', setting: 'config.iconGap' });
  const r2 = clone(nf.keepEditorFlowElements(issues(), fresh, current, {}));
  const modal = r2.issues.find(i => i.code === 'unwritten_component');
  assert.equal(modal.message, 'Unwritten component modal. Reason: ' + MODAL.reason + ' Ask the user to add it, on page «Accueil», as component «aide_modal». ' + NO_APPROXIMATION);
  // a reason already in the words of C8Oforms is not said twice; without a reason the MCP says what it is
  const within = clone(nf.keepEditorFlowElements({ valid: false, issues: [{ code: 'unwritten_component', message: 'Unwritten component modal: ' + MODAL.reason, path: '/formulaire/1', reason: MODAL.reason }], warnings: [] }, fresh, current, {}));
  assert.equal(within.issues[0].message.split(MODAL.reason).length, 2);
  const bare = clone(nf.keepEditorFlowElements({ valid: false, issues: [{ code: 'unwritten_component', message: 'Unwritten component modal', path: '/formulaire/1' }], warnings: [] }, fresh, current, {}));
  assert.match(bare.issues[0].message, /^Unwritten component modal\. It is a layout, which No Code Studio writes and the tools of this C8Oforms do not\. Ask the user/);
});

test('a modal the tools are asked for keeps the refusal of C8Oforms and gets the place, by creation and by edit', () => {
  // before C8Oforms 2.3 the compilation throws (nocode-form-create answers its message as create_failed); since 2.3 the
  // validator answers an issue unwritten_component: the same words of ours either way
  const refusalOf = run => {
    try {
      const r = clone(run());
      assert.equal(r.saved, false, JSON.stringify(r).slice(0, 300));
      const issue = ((r.validation && r.validation.issues) || []).find(i => i.code === 'unwritten_component');
      return issue ? issue.message : String(r.error && r.error.message);
    } catch (error) {
      return String(error.message);
    }
  };
  const h = harness();
  const message = refusalOf(() => h.client.create({ name: 'Aide', pages: [{ name: 'Accueil', fields: [{ type: 'text', name: 'nom', label: 'Nom' }, { type: 'modal', name: 'aide', title: 'Aide', fields: [] }] }] }, h.auth));
  assert.match(message, /^(Unsupported form component type: modal\. |.*modal)/, 'the words of C8Oforms first');
  assert.ok(message.endsWith('Ask the user to add it, on page «Accueil», as component «aide». ' + NO_APPROXIMATION), message);
  assert.equal(h.state.saves, 0);
  // the type C8Oforms names, not the layout it is saved as
  try {
    const issue = ((clone(h.client.create({ name: 'Aide', pages: [{ name: 'Accueil', fields: [{ type: 'modal', name: 'aide', title: 'Aide', fields: [] }] }] }, h.auth)).validation || {}).issues || []).find(i => i.code === 'unwritten_component');
    if (issue) assert.equal(issue.addInNoCodeStudio.type, 'modal');
  } catch (_beforeTwoThree) { /* a C8Oforms before 2.3 throws: no issue to look at */ }
  const id = created(h);
  const saves = h.state.saves;
  const edited = refusalOf(() => h.client.edit(id, [{ action: 'add_field', pageName: 'Fiche', fieldObject: { type: 'modal', name: 'confirmation', title: 'Sûr ?' } }], h.auth));
  assert.ok(edited.endsWith('on page «Fiche», as component «confirmation». ' + NO_APPROXIMATION), edited);
  assert.equal(h.state.saves, saves, 'nothing saved');
});

test('unread_patch_key on a setting of the table quotes its reason and says where the user sets it', () => {
  for (const [table, setting] of [[table23, 'config.boxStyle.iconGap'], [table23ByType, 'config.iconGap']]) {
    const t = harness(null, table);
    const tid = created(t);
    const before = t.state.saves;
    const refused = clone(t.client.edit(tid, [{ action: 'update_field', fieldName: 'ouvrir', patch: { iconGap: '8px' } }], t.auth));
    assert.equal(refused.saved, false);
    assert.equal(t.state.saves, before);
    assert.equal(refused.error.code, 'unread_patch_key');
    assert.ok(refused.error.message.includes('ouvrir (button): patch.iconGap is the setting ' + setting + ', which the tools of this C8Oforms do not write. Reason: ' + ICON_GAP +
      '. Ask the user to set it, on page «Catalogue», component «ouvrir», setting ' + setting + '. ' + NO_APPROXIMATION), refused.error.message);
  }
  const h = harness(null, table23);
  const id = created(h);
  // another root key keeps the message of the native shape
  const other = clone(h.client.edit(id, [{ action: 'update_field', fieldName: 'ouvrir', patch: { colour: 'red' } }], h.auth));
  assert.match(other.error.message, /patch\.colour is not a key of a button as saved/);
});

test('an edit keeps a modal and a setting No Code Studio wrote; a plain application gets no new warning', () => {
  const h = harness();
  const id = created(h);
  const form = h.state.forms[id];
  const page = form.pages[0].pageTechName;
  form.formulaire.push({ id: 1799000000301, type: 'layout', name: 'aide_modal', childrenRefs: [], conditions: {},
    config: { page, cols: [{ size: 12 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }], overlay: { kind: 'modal', title: 'Aide', size: 'medium', dismissible: true, phone: 'full', closeFlow: '' } } });
  form.formulaire.find(c => c.name === 'ouvrir').config.iconGap = '12px';
  const beside = clone(h.client.edit(id, [{ action: 'update_field', fieldName: 'garder', patch: { label: 'Conserver' } }], h.auth));
  assert.equal(beside.saved, true, JSON.stringify(beside.validation && beside.validation.issues));
  const own = clone(h.client.edit(id, [{ action: 'update_field', fieldName: 'ouvrir', patch: { label: 'Voir' } }], h.auth));
  assert.equal(own.saved, true);
  const updated = clone(h.client.update(id, { name: 'Atelier 2' }, h.auth));
  assert.equal(updated.saved, true);
  const after = h.state.forms[id];
  assert.deepEqual(after.formulaire.find(c => c.name === 'aide_modal').config.overlay, { kind: 'modal', title: 'Aide', size: 'medium', dismissible: true, phone: 'full', closeFlow: '' });
  assert.equal(after.formulaire.find(c => c.name === 'ouvrir').config.iconGap, '12px');
  // a plain application: no warning of these kinds
  const plain = harness();
  const pid = created(plain);
  const edit = clone(plain.client.edit(pid, [{ action: 'update_field', fieldName: 'titre', patch: { label: 'Titre' } }], plain.auth));
  assert.equal(edit.saved, true);
  assert.ok(!edit.validation.warnings.some(w => /^editor_/.test(w.code)), JSON.stringify(edit.validation.warnings.map(w => w.code)));
});

test('the form and its pages carry settings too: kept unchanged, refused changed, with their place', () => {
  const nf = api();
  const current = { i18n: { en: { hello: 'Hello' } }, config: { anonym_resp_auth: true }, pages: [{ name: 'Accueil', pageTechName: 'PAGE1', config: { pageOnly: 1 } }], flows: [], formulaire: [] };
  const issues = () => ({ valid: false, warnings: [], issues: [
    { code: 'unwritten_setting', message: 'Unwritten setting i18n of the form', type: 'form', setting: 'i18n', path: '/i18n', reason: 'the translations of the form: add them in No Code Studio' },
    { code: 'unwritten_setting', message: 'Unwritten setting config.pageOnly of a page', type: 'page', setting: 'config.pageOnly', path: '/pages/0/config/pageOnly', reason: 'a page setting' }
  ] });
  const same = clone(nf.keepEditorFlowElements(issues(), clone(current), current, {}));
  assert.equal(same.valid, true);
  assert.deepEqual(same.warnings.map(w => w.code), ['editor_setting_kept', 'editor_setting_kept']);
  assert.match(same.warnings[0].message, /^Form: the setting i18n of the form was set in No Code Studio/);
  assert.match(same.warnings[1].message, /^Page Accueil: the setting config\.pageOnly of the page was set in No Code Studio/);
  const changed = clone(current);
  changed.i18n.en.hello = 'Hi';
  changed.pages[0].config.pageOnly = 2;
  const refused = clone(nf.keepEditorFlowElements(issues(), changed, current, {}));
  assert.equal(refused.issues[0].message, 'Unwritten setting i18n of the form. Reason: the translations of the form: add them in No Code Studio. Ask the user to change it, in the settings of the form, setting i18n. ' + NO_APPROXIMATION);
  assert.deepEqual(refused.issues[0].addInNoCodeStudio, { type: 'form', setting: 'i18n' });
  assert.equal(refused.issues[1].message, 'Unwritten setting config.pageOnly of a page. Reason: a page setting. Ask the user to change it in No Code Studio, in the settings of page «Accueil», setting config.pageOnly. ' + NO_APPROXIMATION);
  assert.deepEqual(refused.issues[1].addInNoCodeStudio, { type: 'page', page: 'Accueil', setting: 'config.pageOnly' });
});

test('an edit, an update and a read of warnings give C8Oforms the form as saved (options.stored)', () => {
  const seen = [];
  const h = harness(null, null, (sequence, params) => {
    const input = JSON.parse(String(params.input || '{}'));
    seen.push({ operation: String(params.operation), stored: input.options && input.options.stored ? input.options.stored._id : null });
  });
  const id = created(h);
  const of = operation => seen.filter(call => call.operation === operation);
  seen.length = 0;
  const r = clone(h.client.edit(id, [{ action: 'update_field', fieldName: 'titre', patch: { label: 'Titre' } }], h.auth));
  assert.equal(r.saved, true, JSON.stringify(r.validation && r.validation.issues));
  assert.ok(of('prepareSave').length && of('prepareSave').every(call => call.stored === id), JSON.stringify(seen));
  assert.ok(of('validate').length && of('validate').every(call => call.stored === id), JSON.stringify(seen));
  seen.length = 0;
  assert.equal(clone(h.client.update(id, { name: 'Atelier 2' }, h.auth)).saved, true);
  assert.ok(of('prepareSave').length && of('prepareSave').every(call => call.stored === id), JSON.stringify(seen));
  seen.length = 0;
  h.client.read(id, { warnings: true }, h.auth);
  assert.ok(of('validate').length && of('validate').every(call => call.stored === id), JSON.stringify(seen));
  // a creation has no form as saved
  seen.length = 0;
  created(h);
  assert.ok(of('prepareSave').length && of('prepareSave').every(call => call.stored === null), JSON.stringify(seen));
});
