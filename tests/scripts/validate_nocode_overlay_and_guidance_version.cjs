// Run: C8OFORMS_PROJECT_ROOT=<C8Oforms NGX checkout> node --test tests/scripts/validate_nocode_overlay_and_guidance_version.cjs
// Usage feedback (26/11, test-nocode): an agent asked to close a modal in a flow got close_overlay refused with a bare
// "Unsupported flow element: close_overlay" and put a push_page __c8o_back instead, called "the supported way"; that
// leaves the page (the modal closes as a side effect, without its closing flow) and does nothing without a previous
// page. And the version of the guidance the contract answers stayed "mcp-2026-11-19" while the guidance changed, so the
// Agent Bridge, which keeps the contract core by that version, kept serving the old one. C8Oforms words the refusal and
// warns of a navigation in a modal (its validator); the MCP keeps the general rule, with the steps the C8Oforms of the
// server does not write taken from its contract, never from a list here: contract v32 (2.3) writes modals and their
// steps. These checks cover the version computed from the guidance (js/nocode_forms.js guidanceVersion) and those steps.
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
  transport = (sequence, params) => overrides && overrides(sequence) ? answer(sequence, params) :
    forms.handles(sequence) ? forms.sequence(sequence, params) : answer ? answer(sequence, params) : undefined;
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
function harness(sourceText) {
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
  }, sourceText);
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

// ---- the version of the guidance --------------------------------------------------------------------------------------

test('the guidance version is a fingerprint of the guidance served: the same each time, another as soon as one sentence changes', () => {
  const version = sourceText => clone(api(null, sourceText).contract({})).contractVersion;
  const base = version();
  assert.match(base, /^.+\+mcp\.[0-9a-f]{16}$/, base);
  assert.doesNotMatch(base, /mcp-2026-11-19/, 'no fixed label any more');
  assert.equal(version(), base, 'the same guidance gives the same version');
  // the C8Oforms version stays in front, as the Agent Bridge names its kept contract core by the whole version
  assert.match(base.split('+')[0], /^\d{4}-\d{2}-\d{2}\.c8oforms-v\d+$/, base);
  // a sentence of a guidance section, of the quick reference, or the purpose of a section changes the version
  for (const [from, to] of [
    ['Create once. saved=true with bindingFinalization.status=ready ends a creation', 'Create once. saved=true with bindingFinalization.status=ready ends any creation'],
    ['Disables automatic tabs and page buttons.', 'Disables the automatic tabs and the page buttons.'],
    ['native style recipes, role spacing, mobile margins', 'native style recipes, role spacing and mobile margins']
  ]) {
    assert.equal(source.split(from).length, 2, 'the test sentence is in js/nocode_forms.js once: ' + from);
    assert.notEqual(version(source.replace(from, to)), base, 'changed: ' + from);
  }
  // a comment of the file is not guidance
  assert.equal(version(source.replace('// The version of the guidance of this file', '// The version of this guidance')), base);
});

// ---- the steps the C8Oforms of the server does not write ----------------------------------------------------------------

// The contract of the C8Oforms checkout, changed as a newer or an older C8Oforms answers it.
function apiWithContract(change) {
  const forms = formsEngine(formsRoot);
  // js/nocode_forms.js asks the contract of NoCode_Form with operation contract (NoCode_Contract answers the same)
  return api((sequence, params) => {
    const answer = forms.sequence(sequence, params);
    if (sequence !== 'NoCode_Contract' && String(params.operation) !== 'contract') return answer;
    const json = JSON.parse(answer.document.res.json);
    const holder = json.result && typeof json.result === 'object' && json.result.version ? json.result : json;
    change(holder);
    answer.document.res.json = JSON.stringify(json);
    return answer;
  }, null, sequence => sequence === 'NoCode_Contract' || sequence === 'NoCode_Form');
}

test('the steps the C8Oforms does not write come from its contract: its table, else its palette without its written types', () => {
  // the C8Oforms of the checkout: the actions of its palette its contract types leave out
  const derived = clone(api().contract({ sections: ['editTool'] })).sections.editTool.unwrittenSteps;
  const palette = JSON.parse(fs.readFileSync(path.join(formsRoot, 'DisplayObjects/mobile/assets/components/AllTypes.json'), 'utf8'));
  const types = clone(api().contract({})).types;
  const expected = [...new Set(palette.filter(item => item.cat === 'action').map(item => item.type))].filter(type => !types.includes(type)).sort();
  assert.deepEqual(Object.keys(derived).sort(), expected);
  assert.ok(expected.length >= 1, 'this C8Oforms leaves at least one step to No Code Studio');
  // a C8Oforms that writes modals (contract v32): their steps are no longer listed
  const v32 = clone(apiWithContract(c => { c.types = c.types.concat(['open_overlay', 'close_overlay', 'modal', 'side_panel']); }).contract({ sections: ['editTool'] })).sections.editTool.unwrittenSteps;
  assert.equal(v32.open_overlay, undefined);
  assert.equal(v32.close_overlay, undefined);
  // its own table, with its reasons, is taken as it is
  const table = { set_properties: 'changes the properties of a component at runtime; configured in No Code Studio' };
  const given = clone(apiWithContract(c => { c.unwrittenFlowElements = table; }).contract({ sections: ['editTool'] })).sections.editTool.unwrittenSteps;
  assert.deepEqual(given, table);
  // the guidance version follows what is served
  const v31Version = clone(api().contract({})).contractVersion;
  const v32Version = clone(apiWithContract(c => { c.types = c.types.concat(['open_overlay', 'close_overlay']); }).contract({})).contractVersion;
  assert.notEqual(v32Version.split('+')[1], v31Version.split('+')[1], 'another list of steps is another guidance');
});

test('the guidance names no step a C8Oforms may write: the rule is general and the list is the server\'s', () => {
  const editTool = clone(api().contract({ sections: ['editTool'] })).sections.editTool;
  const rule = editTool.notes.find(note => /editor_flow_element_kept/.test(note));
  assert.match(rule, /A component, a setting or a flow step this C8Oforms does not write \(unwrittenComponents, unwrittenSettings, unwrittenSteps, each with its reason\)/);
  assert.match(rule, /ask the user to add it in No Code Studio, naming the page, the component and the setting, or the flow and the step it follows/);
  assert.match(rule, /never replace it with an approximation: another component, a style or HTML, a navigation \(push_page, __c8o_back included\) or another step/);
  const served = JSON.stringify(clone(api().contract({ sections: ['all'] })));
  assert.doesNotMatch(served.replace(/"unwrittenSteps":\{[^}]*\}/g, ''), /a modal opened or closed|small modal|tools cannot add (a|one) modal/i);
  for (const file of ['workflow-existing.md', 'generation-quality.md', 'SKILL.md']) {
    const text = fs.readFileSync(path.join(root, 'resources/convertigo-nocode', file), 'utf8');
    assert.doesNotMatch(text, /a modal or a side panel opened or closed|small modal/, file);
  }
  const drawer = fs.readFileSync(path.join(root, 'resources/convertigo-nocode/workflow-existing.md'), 'utf8');
  assert.match(drawer, /lists them in `unwrittenComponents`, `unwrittenSettings` and `unwrittenSteps`/);
  assert.match(drawer, /Never replace it with an approximation: another component, a style or HTML, a navigation \(`push_page`, `__c8o_back` included\) or another step/);
});

test('a step No Code Studio wrote is kept; a new one keeps the refusal of C8Oforms and says to ask the user where, never a navigation', () => {
  const h = harness();
  const id = created(h);
  const flow = h.state.forms[id].flows.find(f => f.id === 'keep_item');
  flow.elements.push({ id: 1799000000103, name: 'Propriétés', type: 'set_properties', config: {} });
  const kept = clone(h.client.edit(id, [{ action: 'update_field', fieldName: 'titre', patch: { label: 'Titre' } }], h.auth));
  assert.equal(kept.saved, true, JSON.stringify(kept.validation && kept.validation.issues));
  assert.ok(kept.validation.warnings.some(w => w.code === 'editor_flow_element_kept' && /set_properties/.test(w.message)));
  const saves = h.state.saves;
  const steps = h.state.forms[id].flows.find(f => f.id === 'keep_item').elements;
  const added = clone(h.client.edit(id, [{ action: 'update_flow', flowId: 'keep_item', patch: { elements: [steps[0], { id: 1799000000101, name: 'Fermer la fenêtre', type: 'close_overlay', config: { target: '' } }] } }], h.auth));
  assert.equal(added.saved, false);
  assert.equal(h.state.saves, saves, 'nothing saved');
  const issue = added.validation.issues.find(i => i.code === 'unsupported_flow_element');
  // the words of C8Oforms first, as it gives them; this C8Oforms gives no reason: the MCP says what the step is
  assert.match(issue.message, /^Unsupported flow element: close_overlay\. close_overlay is a step of No Code Studio that the tools of this C8Oforms do not write\. /);
  assert.match(issue.message, /Ask the user to add it in No Code Studio, in flow «Garder» \(keep_item\), step 2, after the toast step\./);
  assert.match(issue.message, /Never replace it with a navigation \(push_page, __c8o_back included\) or another step/);
  assert.deepEqual(issue.addInNoCodeStudio, { type: 'close_overlay', flow: 'Garder', flowId: 'keep_item', position: 2, after: 'the toast step' });
});

test('the reason C8Oforms gives is quoted as it is, never reworded, and not twice', () => {
  const nf = api();
  const form = { flows: [{ id: 'f', name: 'Oui', elements: [{ id: 1, name: 'Valider', type: 'toast' }, { id: 2, name: 'Fermer', type: 'close_overlay' }] }] };
  const reason = 'closes a modal or a side panel, which the reduced contract does not write yet';
  const issue = message => ({ valid: false, issues: [{ code: 'unsupported_flow_element', message, path: '/flows/0/elements/1/type', reason }], warnings: [] });
  const apart = clone(nf.keepEditorFlowElements(issue('Unsupported flow element: close_overlay'), form, null, {})).issues[0].message;
  assert.ok(apart.startsWith('Unsupported flow element: close_overlay. Reason: ' + reason + '. Ask the user to add it in No Code Studio, in flow «Oui» (f), step 2, after «Valider».'), apart);
  assert.doesNotMatch(apart, /is a step of No Code Studio that the tools/, 'no wording of ours beside the reason of C8Oforms');
  const within = clone(nf.keepEditorFlowElements(issue('Unsupported flow element: close_overlay (' + reason + ')'), form, null, {})).issues[0].message;
  assert.equal(within.split(reason).length, 2, 'the reason once');
});

test('a creation with an editor step first is refused the same way; a type the palette does not have keeps the refusal as it is', () => {
  const h = harness();
  const c = clone(h.client.create({ name: 'X', navigationMode: 'custom', pages: [{ name: 'P', fields: [{ type: 'button', name: 'b', label: 'B', flow: 'f' }] }],
    flows: [{ id: 'f', name: 'Ouvrir', elements: [{ type: 'open_overlay' }, { type: 'toast', message: 'ok' }] }] }, h.auth));
  assert.equal(c.saved, false);
  const issue = c.validation.issues.find(i => i.code === 'unsupported_flow_element');
  assert.match(issue.message, /in flow «Ouvrir» \(f\), step 1, first step\./);
  assert.equal(issue.addInNoCodeStudio.after, null);
  assert.equal(h.state.saves, 0);
  const unknown = clone(h.client.compile({ name: 'Z', pages: [{ name: 'P', fields: [{ type: 'button', name: 'b', label: 'B', flow: 'f' }] }],
    flows: [{ id: 'f', name: 'Inconnu', elements: [{ type: 'teleport_user' }] }] }, h.auth));
  const plain = ((unknown.validation && unknown.validation.issues) || []).find(i => i.code === 'unsupported_flow_element');
  if (plain) {
    assert.equal(plain.addInNoCodeStudio, undefined);
    assert.doesNotMatch(plain.message, /No Code Studio/);
  }
});

test('a reduced key of a modal in an update_field patch names its native place, config.overlay.<key>', () => {
  const h = harness();
  const id = created(h);
  const form = h.state.forms[id];
  // a modal as No Code Studio (or a C8Oforms of contract v32) saves it: a layout with config.overlay, at the root of a page
  const page = form.pages[0].pageTechName;
  form.formulaire.push({ id: 1799000000201, type: 'layout', name: 'confirm_modal', childrenRefs: [], conditions: {},
    config: { page, cols: [{ size: 12 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }],
      overlay: { kind: 'modal', title: 'Confirmer ?', size: 'medium', dismissible: true, phone: 'full', closeFlow: '' } } });
  const saves = h.state.saves;
  const r = clone(h.client.edit(id, [{ action: 'update_field', fieldName: 'confirm_modal', patch: { title: 'Vraiment ?' } }], h.auth));
  assert.equal(r.saved, false);
  assert.equal(h.state.saves, saves);
  assert.equal(r.error.code, 'unread_patch_key');
  assert.match(r.error.message, /patch\.title is not a key of a layout as saved, whose title is config\.overlay\.title: write patch\.config\.overlay\.title \(the other keys of config\.overlay are kept\)/);
});
