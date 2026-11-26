// Run: C8OFORMS_PROJECT_ROOT=<C8Oforms checkout> node --test tests/scripts/validate_nocode_usage_feedback.cjs
// The No Code tools after the usage feedback of a large application built with an agent (18/11 to 25/11): a part of a
// form read by name (component, page, flow, outline, warnings), find in what the application runs, the flow steps
// written in No Code Studio that no longer block an edit, the keys an operation would drop, the warnings an edit
// brought, the thumbnail image checked, the link to a table outside the schema and the deletion of rows.
// Every case is built here, on forms and tables of its own; no real form, token, table or row is involved.
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

// js/nocode_forms.js in a sandbox: NoCode_Contract and NoCode_Form answered by the contract of the C8Oforms checkout,
// the other requestables by transport.
function api(transport) {
  const forms = formsEngine(formsRoot);
  const answer = transport;
  transport = (sequence, params) => forms.handles(sequence) ? forms.sequence(sequence, params) : answer ? answer(sequence, params) : undefined;
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
  vm.runInContext(source, sandbox, { filename: 'nocode_forms.js' });
  return sandbox.C8O.nocodeForms;
}

// A C8Oforms server of forms kept in memory: read, save (with the revision check) and the token check.
function harness() {
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
  });
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

// ---- T21, T3: a part of a form ----------------------------------------------------------------------------------------

test('nocode-form-get answers one component, one page or one flow by name or id, not the whole form', () => {
  const h = harness();
  const id = created(h);
  const saved = h.state.forms[id];
  const titre = saved.formulaire.find(f => f.name === 'titre');
  const one = clone(h.client.read(id, { component: 'titre' }, h.auth));
  assert.equal(one.status, 'ok');
  assert.equal(one.form, undefined, 'no whole form');
  assert.deepEqual(one.components.map(c => c.name), ['titre']);
  assert.equal(one.components[0].shownOnPage, 'Fiche');
  assert.equal(clone(h.client.read(id, { component: String(titre.id) }, h.auth)).components[0].name, 'titre', 'by id');
  // a container lists its children; a list of names reads several components, case and accents ignored
  const layout = clone(h.client.read(id, { component: '["ACTIONS", "Ouvrir"]' }, h.auth));
  assert.deepEqual(layout.components.map(c => c.name), ['actions', 'ouvrir']);
  assert.deepEqual(layout.components[0].children.map(c => c.name), ['ouvrir', 'garder']);
  // a page with its components, by name or by number from 1
  const page = clone(h.client.read(id, { page: '2' }, h.auth));
  assert.equal(page.pages[0].page.name, 'Fiche');
  assert.ok(page.pages[0].components.some(c => c.name === 'titre'));
  assert.ok(!page.pages[0].components.some(c => c.name === 'recherche'));
  const nested = clone(h.client.read(id, { page: 'catalogue' }, h.auth));
  assert.ok(nested.pages[0].components.some(c => c.name === 'garder'), 'a nested component is on the page of its container');
  // a flow with the components that run it
  const flow = clone(h.client.read(id, { flow: 'Ouvrir la fiche' }, h.auth));
  assert.equal(flow.flows[0].id, 'open_detail');
  assert.deepEqual(flow.flows[0].usedBy, ['ouvrir']);
  // a name that matches nothing says the names it could be
  const missing = clone(h.client.read(id, { component: 'reche' }, h.auth));
  assert.deepEqual(missing.components, []);
  assert.deepEqual(missing.notFound[0].known, ['recherche']);
  assert.match(missing.next, /outline:true/);
});

test('nocode-form-get outline maps the pages, their nested components and the flows; a form too large answers it', () => {
  const h = harness();
  const id = created(h);
  const outline = clone(h.client.read(id, { outline: true }, h.auth)).outline;
  assert.deepEqual(outline.pages.map(p => [p.number, p.name]), [[1, 'Catalogue'], [2, 'Fiche']], JSON.stringify(outline));
  const actions = outline.pages[0].components.find(c => typeof c === 'object');
  assert.deepEqual(Object.values(actions)[0], ['ouvrir:button', 'garder:button']);
  assert.deepEqual(outline.flows.filter(f => f.steps).map(f => f.id), ['open_detail', 'keep_item']);
  // a form whose view is over the limit answers its outline, unless whole:true
  const big = h.state.forms[id].formulaire.find(f => f.name === 'intro');
  big.config.html = '<p>' + 'x'.repeat(h.client.AGENT_FORM_MAX_CHARS + 10) + '</p>';
  const read = clone(h.client.read(id, {}, h.auth));
  assert.equal(read.form, undefined);
  assert.match(read.formOmitted.read, /component, page or flow/);
  assert.equal(read.outline.pages.length, 2);
  assert.equal(clone(h.client.read(id, { whole: 'true' }, h.auth)).form._id, id);
});

test('find also answers the stored values the application runs: card templates, expressions, filters', () => {
  const h = harness();
  const id = created(h);
  const form = h.state.forms[id];
  // a card template and a filter, written as No Code Studio writes them
  form.formulaire.find(f => f.name === 'titre').config.galleryTemplate = '<div class="carte">$$ row.Prix * 2 $$ {{value:Prix}}</div>';
  form.formulaire.find(f => f.name === 'recherche').sources = { 'lib_BaseRow.formssource_GetTableData': { enabled: true, vars: { forms_Filter: { type: 'filter', conds: [{ val1: { name: 'Prix' }, operator: 'higher_than', val2: { str: '10' } }] } } } };
  const found = clone(h.client.read(id, { find: 'prix' }, h.auth));
  assert.equal(found.count, 0, 'no visible text holds it');
  const places = found.codeMatches.map(m => [m.where, m.component]);
  assert.deepEqual(places, [['source', 'recherche'], ['filter', 'recherche'], ['card template', 'titre']].filter(p => places.some(q => q[0] === p[0] && q[1] === p[1])));
  assert.ok(places.some(p => p[0] === 'card template' && p[1] === 'titre'));
  assert.ok(places.some(p => p[0] === 'filter' && p[1] === 'recherche'));
  const template = found.codeMatches.find(m => m.where === 'card template');
  assert.match(template.path, /^\/formulaire\/\d+\/config\/galleryTemplate$/);
  assert.equal(template.times, 2);
  assert.equal(template.page, 'Fiche');
  // an expression reads a field: find names the computed component
  const reads = clone(h.client.read(id, { find: 'fields.recherche' }, h.auth));
  assert.ok(reads.codeMatches.some(m => m.component === 'total' && /expression|defaultFrom/.test(m.where)), JSON.stringify(reads.codeMatches));
  // a visible text is answered once, in matches
  const visible = clone(h.client.read(id, { find: 'Nos objets' }, h.auth));
  assert.equal(visible.count, 1);
  assert.ok(!visible.codeMatches.some(m => m.path === visible.matches[0].path));
});

// ---- T17, T4: flow steps written in No Code Studio ----------------------------------------------------------------


// A flow step the C8Oforms of the checkout does not write (flowElements supported: false in its registry): open_overlay
// before contract v32, set_properties since. The steps written in No Code Studio that the tools do not write are those.
function unwrittenStepTypes() {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(formsRoot, 'js/nocode_form_components.js'), 'utf8'), sandbox);
  const steps = sandbox.c8oNocodeFormComponents.flowElements;
  return Object.keys(steps).filter(type => steps[type] && steps[type].supported === false);
}
const EDITOR_STEP = unwrittenStepTypes()[0];
function withModalSteps(h, id) {
  const form = h.state.forms[id];
  const flow = form.flows.find(f => f.id === 'keep_item');
  flow.elements.push({ id: 1799000000001, name: 'Ouvrir la modale', type: EDITOR_STEP, config: {} });
  flow.elements.push({ id: 1799000000003, name: 'Fermer la modale', type: EDITOR_STEP, config: {} });
  return form;
}

test('a step written in No Code Studio that the tools do not write no longer blocks an edit; a new one is still refused', () => {
  const h = harness();
  const id = created(h);
  withModalSteps(h, id);
  const edited = clone(h.client.edit(id, [{ action: 'update_field', fieldName: 'titre', patch: { label: 'Titre du produit' } }], h.auth));
  assert.equal(edited.saved, true, JSON.stringify(edited.validation && edited.validation.issues));
  assert.equal(edited.validation.valid, true);
  const kept = edited.validation.warnings.filter(w => w.code === 'editor_flow_element_kept');
  assert.equal(kept.length, 2);
  assert.match(kept[0].message, new RegExp('Ouvrir la modale \\(' + EDITOR_STEP + '\\).*No Code Studio'));
  const steps = h.state.forms[id].flows.find(f => f.id === 'keep_item').elements.map(e => e.type);
  assert.deepEqual(steps.slice(-2), [EDITOR_STEP, EDITOR_STEP], 'the steps are saved as they were');
  // a step of such a type that the saved form did not have is refused, nothing saved
  const saves = h.state.saves;
  const added = clone(h.client.edit(id, [{ action: 'update_flow', flowId: 'open_detail', patch: { elements: [{ id: 1799000000009, name: 'Autre', type: EDITOR_STEP, config: {} }] } }], h.auth));
  assert.equal(added.saved, false);
  assert.ok(added.validation.issues.some(i => i.code === 'unsupported_flow_element'), JSON.stringify(added));
  assert.equal(h.state.saves, saves);
  // nocode-form-update keeps them too
  const updated = clone(h.client.update(id, { name: 'Atelier 2' }, h.auth));
  assert.equal(updated.saved, true, JSON.stringify(updated.validation && updated.validation.issues));
});

// ---- T19, T5, T13: keys an operation or a patch would drop -------------------------------------------------------

test('a key beside the patch of update_field is refused with the place it belongs, nothing saved', () => {
  const h = harness();
  const id = created(h);
  const saves = h.state.saves;
  const r = clone(h.client.edit(id, [{ action: 'update_field', fieldName: 'total', defaultFrom: { source: 'expression', expression: "'x'", mode: 'reactive' }, patch: { label: 'Somme' } }], h.auth));
  assert.equal(r.saved, false);
  assert.equal(r.error.code, 'unread_operation_key');
  assert.match(r.error.message, /operations\[0\] \(update_field\): defaultFrom is not read at the level of the operation, beside patch: put it in patch \(patch\.defaultFrom\)/);
  assert.equal(h.state.saves, saves);
  // the same for a flow step and a field added with its fieldObject
  const step = clone(h.client.edit(id, [{ action: 'update_flow_element', flowId: 'keep_item', elementId: h.state.forms[id].flows.find(f => f.id === 'keep_item').elements[0].id, color: '#000000', patch: {} }], h.auth));
  assert.match(step.error.message, /update_flow_element\): color is not read .*\(patch\.color\)\. This operation reads flowId, .*, patch\.$/);
  const add = clone(h.client.edit(id, [{ action: 'add_field', pageName: 'Fiche', label: 'Prix', fieldObject: { type: 'text', name: 'prix' } }], h.auth));
  assert.match(add.error.message, /add_field\): label is not read .*\(fieldObject\.label\)/);
  // a key the operation reads passes
  const ok = clone(h.client.edit(id, [{ action: 'update_field', fieldName: 'total', patch: { defaultFrom: { source: 'expression', expression: "'x'", mode: 'reactive' } } }], h.auth));
  assert.equal(ok.saved, true, JSON.stringify(ok));
});

test('a patch key a component does not have is refused: config keys and native children are named', () => {
  const h = harness();
  const id = created(h);
  const saves = h.state.saves;
  const cols = clone(h.client.edit(id, [{ action: 'update_field', fieldName: 'actions', patch: { cols: [{ size: 12 }, { size: 12 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }] } }], h.auth));
  assert.equal(cols.saved, false);
  assert.equal(cols.error.code, 'unread_patch_key');
  assert.match(cols.error.message, /actions \(layout\): patch\.cols is not a key of a layout as saved, whose cols is config\.cols: write patch\.config\.cols/);
  const select = clone(h.client.edit(id, [{ action: 'add_field', pageName: 'Fiche', fieldObject: { type: 'select', name: 'etat', label: 'État', values: ['Neuf', 'Usé'] } }], h.auth));
  assert.equal(select.saved, true);
  const values = clone(h.client.edit(id, [{ action: 'update_field', fieldName: 'etat', patch: { values: ['Neuf', 'Usé', 'Cassé'] } }], h.auth));
  assert.equal(values.error.code, 'unread_patch_key');
  assert.match(values.error.message, /etat \(select\): patch\.values is not a key of a select as saved \(its keys: [^)]*children[^)]*\)/);
  assert.equal(h.state.saves, saves + 1);
  // the native shape is saved
  const native = clone(h.client.edit(id, [{ action: 'update_field', fieldName: 'actions', patch: { config: { cols: [{ size: 12 }, { size: 12 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }] } } }], h.auth));
  assert.equal(native.saved, true, JSON.stringify(native));
  assert.equal(h.state.forms[id].formulaire.find(f => f.name === 'actions').config.cols[0].size, 12);
});

test('add_page with a name and a pageObject keeps the name, and the rest of the edit finds the page', () => {
  const h = harness();
  const id = created(h);
  const r = clone(h.client.edit(id, [
    { action: 'add_page', name: 'Panier', navigationMode: 'custom', pageObject: { iconName: 'cart' } },
    { action: 'add_field', pageName: 'Panier', fieldObject: { type: 'text', name: 'quantite', label: 'Quantité' } }
  ], h.auth));
  assert.equal(r.saved, true, JSON.stringify(r.error || r.validation));
  const page = h.state.forms[id].pages.find(p => p.name === 'Panier');
  assert.ok(page, h.state.forms[id].pages.map(p => p.name).join(', '));
  assert.ok(r.repairs.some(item => item.code === 'operation_key_moved' && /name given beside pageObject was moved into it/.test(item.message)));
  // two different names are refused
  const twice = clone(h.client.edit(id, [{ action: 'add_page', name: 'Caisse', pageObject: { name: 'Paiement' } }], h.auth));
  assert.equal(twice.error.code, 'unread_operation_key');
  assert.match(twice.error.message, /name is given twice/);
});

// ---- T20, T8: the warnings of an edit ----------------------------------------------------------------------------

function computedShop(count) {
  const reduced = shop();
  for (let i = 0; i < count; i++) {
    reduced.pages[1].fields.push({ type: 'text', name: 'calcul_' + i, label: 'Calcul ' + i, defaultFrom: { source: 'expression', expression: "String(" + i + ")", mode: 'reactive' } });
  }
  return reduced;
}

test('an edit answers the warnings it brought and those of what it changed, with the count of the others', () => {
  const h = harness();
  const id = created(h, computedShop(14));
  const all = clone(h.client.read(id, { warnings: true }, h.auth)).validation;
  assert.ok(all.warningCount >= 15, 'the form has many warnings: ' + all.warningCount);
  const r = clone(h.client.edit(id, [
    { action: 'add_field', pageName: 'Fiche', fieldObject: { type: 'text', name: 'nouveau', label: 'Nouveau', defaultFrom: { source: 'expression', expression: "'n'", mode: 'reactive' } } },
    { action: 'update_field', fieldName: 'calcul_3', patch: { label: 'Calcul trois' } }
  ], h.auth));
  assert.equal(r.saved, true);
  const shown = r.validation.warnings;
  assert.ok(shown.some(w => w.code === 'context_expression_runtime_check' && /formulaire\/\d+/.test(w.path) && h.state.forms[id].formulaire[Number(/formulaire\/(\d+)/.exec(w.path)[1])].name === 'nouveau'), 'the new field warning');
  assert.ok(shown.some(w => /formulaire\/(\d+)/.test(w.path || '') && h.state.forms[id].formulaire[Number(/formulaire\/(\d+)/.exec(w.path)[1])].name === 'calcul_3'), 'the warning of the changed field');
  assert.ok(!shown.some(w => /formulaire\/(\d+)/.test(w.path || '') && h.state.forms[id].formulaire[Number(/formulaire\/(\d+)/.exec(w.path)[1])].name === 'calcul_5'), 'not the unchanged one');
  assert.equal(r.validation.warningCount, shown.length);
  assert.ok(r.validation.otherWarnings.count >= 12, JSON.stringify(r.validation.otherWarnings));
  assert.ok(r.validation.otherWarnings.byCode.context_expression_runtime_check >= 12);
  assert.match(r.validation.otherWarnings.note, /nocode-form-get warnings:true/);
  // warnings:true with a part answers those of the part only
  const part = clone(h.client.read(id, { warnings: true, component: 'calcul_5' }, h.auth)).validation;
  const calcul5 = h.state.forms[id].formulaire.findIndex(f => f.name === 'calcul_5');
  assert.ok(part.warnings.length >= 1 && part.warnings.every(w => w.path.startsWith('/formulaire/' + calcul5 + '/')), JSON.stringify(part.warnings));
  assert.ok(part.warnings.some(w => w.code === 'context_expression_runtime_check'));
});

test('the same warning on many components is answered once with the count and the components', () => {
  const h = harness();
  const reduced = computedShop(9);
  const r = clone(h.client.compile(reduced, h.auth));
  const v = clone(h.client.validate(r.form, h.auth)).validation;
  const same = v.warnings.filter(w => w.code === 'context_expression_runtime_check');
  assert.equal(same.length, 3, JSON.stringify(same));
  const group = same.find(w => w.count != null);
  assert.equal(group.count, 8);
  assert.equal(group.on.length, 8);
  assert.ok(group.on.includes('calcul_8'));
  assert.ok(v.warningCount >= 10, 'the count stays the count of every warning');
});

// ---- T22: the thumbnail image checked before it is saved ----------------------------------------------------------

const zlib = require('node:zlib');
function png(width, height) {
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height, 0x7f);
  for (let y = 0; y < height; y++) raw[y * (width * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test('a thumbnail whose bytes are truncated, altered or of another type is refused before the save', () => {
  const h = harness();
  const id = created(h);
  const good = png(32, 32);
  const media = base64 => [{ action: 'set_media', thumbnailImage: { contentType: 'image/png', base64 } }];
  const saves = h.state.saves;
  const truncated = clone(h.client.edit(id, media(good.subarray(0, good.length - 20).toString('base64')), h.auth));
  assert.equal(truncated.saved, false);
  assert.match(truncated.validation.issues[0].message, /PNG image is truncated/);
  const altered = Buffer.from(good);
  altered[45] ^= 0x55;
  const damaged = clone(h.client.edit(id, media(altered.toString('base64')), h.auth));
  assert.match(damaged.validation.issues[0].message, /PNG image is damaged: its IDAT chunk .* checksum/);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
  const wrongType = clone(h.client.edit(id, media(jpeg.toString('base64')), h.auth));
  assert.match(wrongType.validation.issues[0].message, /are a image\/jpeg image, not image\/png/);
  const notBase64 = clone(h.client.edit(id, media('iVBOR*w0K'), h.auth));
  assert.match(notBase64.validation.issues[0].message, /not base64 text/);
  assert.equal(h.state.saves, saves, 'nothing saved');
  const ok = clone(h.client.edit(id, media(good.toString('base64')), h.auth));
  assert.equal(ok.saved, true, JSON.stringify(ok.validation && ok.validation.issues));
  // a JPEG that ends with its marker, a JPEG cut before it
  const api2 = harness().client;
  assert.equal(api2.imageProblem('image/jpeg', jpeg.toString('base64')), null);
  assert.match(api2.imageProblem('image/jpeg', jpeg.subarray(0, 10).toString('base64')), /JPEG image is truncated/);
});

test('a thumbnail can name an image the user attached instead of base64 text', () => {
  const h = harness();
  const id = created(h);
  const image = png(16, 16).toString('base64');
  const asked = [];
  const options = { ...h.auth, readAttachment: name => { asked.push(name); return name === 'logo.png' ? { status: 'ok', contentType: 'image/png', base64: image } : { status: 'error', error: { code: 'not_found', message: 'The user has no attachment named "' + name + '".', available: ['logo.png'] } }; } };
  const ok = clone(h.client.edit(id, [{ action: 'set_media', thumbnailImage: { attachment: 'logo.png' } }], options));
  assert.equal(ok.saved, true, JSON.stringify(ok));
  assert.deepEqual(asked, ['logo.png']);
  const missing = clone(h.client.edit(id, [{ action: 'set_media', thumbnailImage: { attachment: 'logo.jpg' } }], options));
  assert.equal(missing.saved, false);
  assert.equal(missing.error.code, 'thumbnail_attachment_unreadable');
  assert.match(missing.error.message, /no attachment named "logo\.jpg".*The user's attachments: logo\.png\. Nothing was saved/);
  const reduced = shop();
  reduced.thumbnailImage = { attachment: 'logo.png' };
  assert.equal(clone(h.client.create(reduced, options)).saved, true);
  assert.equal(clone(h.client.create({ ...shop(), thumbnailImage: { attachment: 'x.png' } }, h.auth)).error.code, 'thumbnail_attachment_unreadable', 'no reader: refused');
});

test('attachment_read image: by name among the user\'s attachments, PNG, JPEG or WebP only', () => {
  const sandbox = { C8O: {}, java: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/attachment_read.js'), 'utf8'), sandbox);
  const files = { 'logo.png': png(8, 8), 'notes.txt': Buffer.from('hello'), 'big.png': png(8, 8) };
  const host = {
    owner: () => 'user_key',
    list: () => Object.keys(files).map((name, i) => ({ name, bytes: name === 'big.png' ? 3 * 1024 * 1024 : files[name].length, modified: i, ref: name })),
    head: (ref, n) => Array.from(files[ref].subarray(0, n)),
    base64: ref => files[ref].toString('base64')
  };
  const read = clone(sandbox.C8O.attachmentRead.image('LOGO.PNG', host));
  assert.equal(read.status, 'ok');
  assert.equal(read.contentType, 'image/png');
  assert.equal(read.base64, files['logo.png'].toString('base64'));
  assert.equal(clone(sandbox.C8O.attachmentRead.image('notes.txt', host)).error.code, 'unsupported_type');
  assert.equal(clone(sandbox.C8O.attachmentRead.image('big.png', host)).error.code, 'too_big');
  assert.deepEqual(clone(sandbox.C8O.attachmentRead.image('autre.png', host)).error.available.sort(), ['big.png', 'logo.png', 'notes.txt']);
});

// ---- T16: a part of an expression changed -------------------------------------------------------------------------

test('defaultFromEdit changes a part of a declared expression and compiles it; an ambiguous or stale edit saves nothing', () => {
  const h = harness();
  const id = created(h);
  const r = clone(h.client.edit(id, [{ action: 'update_field', fieldName: 'total', patch: { defaultFromEdit: [{ find: "' objets'", replace: "' articles'" }] } }], h.auth));
  assert.equal(r.saved, true, JSON.stringify(r.error || r.validation));
  const total = h.state.forms[id].formulaire.find(f => f.name === 'total');
  assert.equal(total.config.contextDefault.expression, "String((fields.recherche || '').length) + ' articles'");
  assert.match(total.sources.self.vars.selfVar.str, /' articles'/, 'compiled into the expression that runs');
  const saves = h.state.saves;
  const twice = clone(h.client.edit(id, [{ action: 'update_field', fieldName: 'total', patch: { defaultFromEdit: [{ find: "(", replace: "[" }] } }], h.auth));
  assert.equal(twice.error.code, 'expression_edit_not_found');
  assert.match(twice.error.message, /is \d+ times in the expression of total: give a longer find/);
  const absent = clone(h.client.edit(id, [{ action: 'update_field', fieldName: 'total', patch: { defaultFromEdit: { find: 'objets', replace: 'x' } } }], h.auth));
  assert.match(absent.error.message, /is not in the expression of total/);
  // No Code Studio changed the expression that runs: the declaration is stale, defaultFrom is sent whole
  h.state.forms[id].formulaire.find(f => f.name === 'total').sources.self.vars.selfVar.str = '$$START1{"name":"recherche"}END1$$.length';
  const stale = clone(h.client.edit(id, [{ action: 'update_field', fieldName: 'total', patch: { defaultFromEdit: [{ find: "' articles'", replace: "' pièces'" }] } }], h.auth));
  assert.equal(stale.error.code, 'expression_changed_in_editor');
  assert.equal(h.state.saves, saves, 'nothing saved');
});

// ---- after the check on test-nocode (26/11) -------------------------------------------------------------------------

// The JSON Schema rules the input schemas of these tools use, enough to check an instance as a strict client does.
function instanceErrors(schema, value, at = '') {
  if (!schema || typeof schema !== 'object') return [];
  if (schema.anyOf) return schema.anyOf.some(s => !instanceErrors(s, value, at).length) ? [] : [at + ': matches none of anyOf'];
  if (schema.oneOf) return schema.oneOf.filter(s => !instanceErrors(s, value, at).length).length === 1 ? [] : [at + ': does not match exactly one of oneOf'];
  const kind = Array.isArray(value) ? 'array' : value === null ? 'null' : Number.isInteger(value) ? 'integer' : typeof value;
  if (schema.type && ![].concat(schema.type).some(t => t === kind || (t === 'number' && kind === 'integer'))) return [at + ': not ' + schema.type];
  if (schema.enum && !schema.enum.includes(value)) return [at + ': not in enum'];
  const errors = [];
  if (kind === 'object') {
    for (const key of schema.required || []) if (!(key in value)) errors.push(at + ': ' + key + ' required');
    for (const [key, item] of Object.entries(value)) {
      if (schema.properties && key in schema.properties) errors.push(...instanceErrors(schema.properties[key], item, at + '/' + key));
      else if (schema.additionalProperties === false) errors.push(at + ': ' + key + ' not allowed');
    }
  }
  if (kind === 'array' && schema.items) value.forEach((item, i) => errors.push(...instanceErrors(schema.items, item, at + '/' + i)));
  return errors;
}

test('the input schemas take a thumbnail named by an attachment, as the tools do, and refuse a mixed or empty one', () => {
  const overrides = { C8O: {}, include() {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/schema_overrides.js'), 'utf8'), overrides);
  const edit = clone(overrides.C8O.schemaOverrides.applyInput('tools_nocode_form_edit', null, null));
  const call = thumbnailImage => ({ id: '1', operations: [{ action: 'set_root', thumbnailImage }] });
  assert.deepEqual(instanceErrors(edit, call({ attachment: 'logo.png' })), [], 'an attachment is accepted');
  assert.deepEqual(instanceErrors(edit, call({ contentType: 'image/png', base64: 'iVBORw0KGgo=' })), [], 'base64 is still accepted');
  assert.notDeepEqual(instanceErrors(edit, call({ attachment: 'logo.png', base64: 'x' })), [], 'not both');
  assert.notDeepEqual(instanceErrors(edit, call({})), [], 'not empty');
  assert.notDeepEqual(instanceErrors(edit, call({ contentType: 'image/gif', base64: 'x' })), [], 'a known image type');
  const create = clone(overrides.C8O.schemaOverrides.applyInput('tools_nocode_form_create', null, null));
  const update = clone(overrides.C8O.schemaOverrides.applyInput('tools_nocode_form_update', null, null));
  assert.match(create.properties.reduced.description, /thumbnailImage=\{attachment:'<file name>'\}/);
  assert.match(update.properties.patch.description, /thumbnailImage=\{attachment:'<file name>'\}/);
});

test('nocode-form-get warnings:true answers the steps No Code Studio wrote as an edit does: warnings, not issues', () => {
  const h = harness();
  const id = created(h);
  withModalSteps(h, id);
  const v = clone(h.client.read(id, { warnings: true }, h.auth)).validation;
  assert.equal(v.valid, true, JSON.stringify(v.issues));
  assert.ok(!v.issues.some(i => i.code === 'unsupported_flow_element'));
  assert.equal(v.warnings.filter(w => w.code === 'editor_flow_element_kept').length, 2);
  const part = clone(h.client.read(id, { warnings: true, flow: 'keep_item' }, h.auth)).validation;
  assert.equal(part.warnings.filter(w => w.code === 'editor_flow_element_kept').length, 2, 'the warnings of the flow asked');
});

// ---- repeated static blocks (26/11) ---------------------------------------------------------------------------------

test('the edit that makes the eighth static copy of a block answers repeated_static_block, and warnings:true lists it', () => {
  const h = harness();
  const block = n => ({ type: 'layout', name: 'participant_' + n, cols: [{ size: 6 }, { size: 6 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }],
    children: [{ type: 'text', name: 'participant_name_' + n, label: 'Nom ' + n }, { type: 'text', name: 'participant_mail_' + n, label: 'E-mail ' + n }] });
  const reduced = { name: 'Inscriptions', navigationMode: 'custom', pages: [{ name: 'Groupe', fields: [{ type: 'text', name: 'groupe', label: 'Groupe' }, ...[1, 2, 3, 4, 5, 6, 7].map(block)] }] };
  const first = clone(h.client.create(reduced, h.auth));
  assert.equal(first.saved, true, JSON.stringify(first.validation && first.validation.issues));
  assert.ok(!first.validation.warnings.some(w => w.code === 'repeated_static_block'), 'seven copies: below the threshold');
  const eighth = clone(h.client.edit(first.id, [{ action: 'add_field', pageName: 'Groupe', fieldObject: block(8) }], h.auth));
  assert.equal(eighth.saved, true, JSON.stringify(eighth.error || eighth.validation.issues));
  const told = eighth.validation.warnings.find(w => w.code === 'repeated_static_block');
  assert.ok(told, JSON.stringify(eighth.validation.warnings.map(w => w.code)));
  assert.equal(told.count, 8);
  assert.match(told.message, /^Page Groupe: 8 static copies of the same block \(participant_1, participant_2, participant_3 … participant_8, 3 components each\)/);
  const read = clone(h.client.read(first.id, { warnings: true }, h.auth)).validation;
  assert.ok(read.warnings.some(w => w.code === 'repeated_static_block' && w.count === 8));
  const validated = clone(h.client.validate(h.state.forms[first.id], h.auth)).validation;
  assert.ok(validated.warnings.some(w => w.code === 'repeated_static_block'), 'nocode-form-validate too');
});
