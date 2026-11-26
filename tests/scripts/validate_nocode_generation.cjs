// Run: node --test tests/scripts/validate_nocode_generation.cjs
// Reads the actual Forms prototypes; never writes to a form or a database.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { formsEngine } = require('../helpers/c8oforms_contract.cjs');
const { skillText: nocodeSkillText } = require('../helpers/nocode_skill.cjs');
const root = path.resolve(__dirname, '../..');
const formsRoot = process.env.C8OFORMS_PROJECT_ROOT || path.resolve(root, '../C8oForms');
const source = fs.readFileSync(path.join(root, 'js/nocode_forms.js'), 'utf8');
// the text of the No Code form contract of the C8Oforms checkout, where its compiler and validator are
const formsSource = ['js/nocode_form_components.js', 'js/nocode_form_contract.js'].map(file => fs.readFileSync(path.join(formsRoot, file), 'utf8')).join('\n');
// extraFiles are loaded in the same context (js/nocode_app.js); api then answers C8O instead of C8O.nocodeForms.
function api(transport, extraFiles) {
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
  const sandbox = { Packages: packages, java: { util: { UUID: { randomUUID: () => require('node:crypto').randomUUID() } }, lang: { System: { currentTimeMillis: () => 1800000000000 }, String, reflect: { Array: { newInstance: () => [] } } } } };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'nocode_forms.js' });
  if (extraFiles) {
    extraFiles.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file }));
    return sandbox.C8O;
  }
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
// The C8Oforms editor writes every question label rich, a paragraph (getObjToInsert: "<p>" + question + "</p>",
// personalized true), and no longer offers the plain one. Description blocks and card titles keep their own rules.
const QUESTION_TYPES = ['text', 'checkbox', 'checkbox_group', 'radio', 'radio_group', 'slider', 'select', 'datetime', 'time', 'img', 'grid', 'gallery', 'chart', 'map', 'barcode', 'file', 'signature', 'location'];
test('semantic label edits repair persisted HTML and preserve unrelated rich content', () => {
  const h = creationHarness();
  const initial = h.client.create(contextExample({ source: 'literal', value: '' }, { label: 'Original' }), h.auth);
  const id = initial.form._id;
  h.state.forms[id].formulaire[0].config.html = '<p>Exemple de question</p>';
  const repaired = h.client.edit(id, [{ action: 'update_field', fieldName: 'context_input', patch: { label: 'Libellé corrigé' } }], h.auth);
  assert.equal(repaired.saved, true);
  assert.equal(visibleQuestion(repaired.form.formulaire[0]), '<p>Libellé corrigé</p>');
  assert.equal(repaired.form.formulaire[0].label, undefined);
  const rich = h.client.edit(id, [{ action: 'update_field', fieldName: 'context_input', patch: { description: '<p><b>Rich label</b></p>' } }], h.auth);
  assert.equal(visibleQuestion(rich.form.formulaire[0]), '<p><b>Rich label</b></p>');
  const unrelated = h.client.edit(id, [{ action: 'update_field', fieldName: 'context_input', patch: { config: { boxStyle: { margin: '16px' } } } }], h.auth);
  assert.equal(visibleQuestion(unrelated.form.formulaire[0]), '<p><b>Rich label</b></p>');
  const native = h.client.edit(id, [{ action: 'update_field', fieldName: 'context_input', patch: { config: { label: 'Native label' } } }], h.auth);
  assert.equal(visibleQuestion(native.form.formulaire[0]), '<p>Native label</p>');
  const plain = h.client.edit(id, [{ action: 'update_field', fieldName: 'context_input', patch: { config: { personalized: false } } }], h.auth);
  assert.equal(plain.saved, true);
  assert.equal(plain.form.formulaire[0].config.personalized, true);
  assert.equal(visibleQuestion(plain.form.formulaire[0]), '<p>Native label</p>');
});
// Labels saved before rich ones were enforced: « Nom » of the Skyjo form (29/10) was personalized with html "Nom", no
// paragraph, so the viewer drew it against its input; older drafts may hold personalized:false. The next write of the
// form converts every one, as the editor's migration to technicalVersion 1.0.5 did; editor-made labels, description
// blocks and card titles stay as they are. nocode-form-validate flags them meanwhile.
function plainLabelsForm(h) {
  const created = h.client.create({ name: 'Skyjo', pages: [{ name: 'Joueurs', fields: [
    { type: 'description', name: 'title', description: '<h3>Joueur</h3>' },
    { type: 'ion-card', name: 'card', label: 'Carte' },
    { type: 'text', name: 'Nom', label: 'Nom' },
    { type: 'text', name: 'prenom', label: 'Prénom' },
    { type: 'chart', name: 'chart1', label: 'Total' },
    { type: 'select', name: 'joueur', label: 'Joueur', values: ['A', 'B'] },
    { type: 'text', name: 'inputText1', label: 'Saisissez votre question ici' }
  ] }] }, h.auth);
  assert.equal(created.saved, true);
  assert.ok(!created.validation.warnings.some(w => w.code === 'plain_labels_converted'), 'new labels are written rich, not converted');
  const stored = h.state.forms[created.form._id];
  const by = name => stored.formulaire.find(f => f.name === name).config;
  Object.assign(by('Nom'), { html: 'Nom', personalized: true, label: 'Nom' });
  Object.assign(by('prenom'), { html: '<p>Exemple de question</p>', personalized: false, label: 'Prénom & surnom' });
  Object.assign(by('chart1'), { html: 'Total des points <b>par joueur</b>', personalized: true });
  delete by('chart1').label;
  delete by('joueur').personalized;
  by('joueur').label = 'Joueur';
  delete by('inputText1').label;
  return { id: created.form._id, stored };
}
function assertRichLabels(form) {
  const by = name => form.formulaire.find(f => f.name === name).config;
  assert.deepEqual(['Nom', 'prenom', 'chart1', 'joueur', 'inputText1'].map(name => [by(name).personalized, by(name).html]), [
    [true, '<p>Nom</p>'],
    [true, '<p>Prénom &amp; surnom</p>'],
    [true, '<p>Total des points <b>par joueur</b></p>'],
    [true, '<p>Joueur</p>'],
    [true, '<p>Saisissez votre question ici</p>']
  ]);
  assert.equal(by('title').html, '<h3>Joueur</h3>');
  assert.equal(by('card').title.html, 'Carte');
}
test('nocode-form-validate flags the plain labels a form still holds', () => {
  const h = creationHarness();
  const { stored } = plainLabelsForm(h);
  const warnings = api().validate(clone(stored)).validation.warnings.filter(w => w.code === 'plain_question_label');
  const paths = clone(warnings.map(w => w.path));
  const index = name => stored.formulaire.findIndex(f => f.name === name);
  assert.deepEqual(paths, ['Nom', 'prenom', 'chart1', 'joueur'].map(name => '/formulaire/' + index(name) + '/config/html'));
  assert.match(warnings[0].message, /next save/);
});
test('an edit converts the plain labels of the whole form, not only of the fields it touches', () => {
  const h = creationHarness();
  const { id } = plainLabelsForm(h);
  const edited = h.client.edit(id, [{ action: 'add_field', pageName: 'Joueurs', fieldObject: { type: 'text', name: 'score', label: 'Score' } }], h.auth);
  assert.equal(edited.saved, true);
  assertRichLabels(h.state.forms[id]);
  const score = h.state.forms[id].formulaire.find(f => f.name === 'score').config;
  assert.deepEqual([score.personalized, score.html], [true, '<p>Score</p>']);
  assert.ok(!edited.validation.warnings.some(w => w.code === 'plain_question_label'));
  const converted = edited.validation.warnings.filter(w => w.code === 'plain_labels_converted');
  assert.equal(converted.length, 1);
  assert.match(converted[0].message, /: Nom, prenom, chart1, joueur$/);
});
test('nocode-form-update writes rich labels, including the plain ones its patch gives', () => {
  const h = creationHarness();
  const { id, stored } = plainLabelsForm(h);
  const formulaire = clone(stored.formulaire);
  Object.assign(formulaire.find(f => f.name === 'inputText1').config, { personalized: false, label: 'Votre question' });
  const updated = h.client.update(id, { formulaire }, h.auth);
  assert.equal(updated.saved, true);
  const saved = h.state.forms[id];
  const question = saved.formulaire.find(f => f.name === 'inputText1').config;
  assert.deepEqual([question.personalized, question.html], [true, '<p>Votre question</p>']);
  question.html = '<p>Saisissez votre question ici</p>';
  assertRichLabels(saved);
});
test('an expression may reach browser globals such as localStorage, which the contract never presents as the default', () => {
  // An agent took the old "no guessed globals" advice for "no localStorage" and told a user two forms could not share a value that way.
  assert.doesNotMatch(formsSource, /not guessed globals/);
  assert.match(formsSource, /expressions: EXPRESSION_RUNTIME,/);
  assert.match(formsSource, /availability: "Existing Forms TS expression context: fields, actions, api\. Use verified sources and correct return types\. A defaultFrom expression only reads: no side effects\. " \+ EXPRESSION_RUNTIME/);
  const runtime = /var EXPRESSION_RUNTIME = "(.*)" \+ GRID_VALUE;\n/.exec(formsSource)[1];
  assert.match(runtime, /JavaScript run in the viewer page/);
  assert.match(runtime, /by default share through Baserow \(submit saveTo, then a grid or field source\) or a URL parameter/);
  assert.match(runtime, /Use localStorage only when the user asks for it, and say that it stays in one browser on one device/);
  const shared = { name: 'Shared value', pages: [{ name: 'Request', fields: [
    { type: 'text', name: 'reference' },
    { type: 'text', name: 'previous_reference', defaultFrom: { source: 'expression', expression: 'localStorage.getItem("reference") ?? ""', mode: 'initial' } }
  ] }], flows: [{ id: 'formulas', name: 'Formulas', elements: [
    { name: 'keep_reference', type: 'business_logic', expression: '(localStorage.setItem("reference", fields.reference ?? ""), fields.reference)' }
  ] }] };
  const r = api().compile(shared);
  assert.notEqual(r.status, 'invalid', JSON.stringify(r.validation && r.validation.issues));
  const field = r.form.formulaire.find(f => f.name === 'previous_reference');
  const store = new Map([['reference', 'R-7']]);
  const localStorage = { getItem: key => store.has(key) ? store.get(key) : null };
  assert.equal(evaluateDefault(field, { localStorage }), 'R-7', 'the compiled default reads the browser storage as written');
});
test('an expression whose marks do not pair up is refused with the position, modern syntax is not', () => {
  // 26/10: the viewer said only "unexpected token: ')'" for a duplicate-score check written by the agent, which then
  // blamed ?? and removed it; the expression had one ')' too many.
  const gregory = "(()=>{const v=fields.score_last;const a=Array.isArray(v)?v:[];const pid=x=>((x&&typeof x==='object')?(x.id??x.value):x);const sel=fields.Joueur;if(!sel){return '0'}return a.some(r=>(String(pid(sel))===String(pid(r.Joueur))||String(pid(sel))===String((r.Joueur&&typeof r.Joueur==='object')?r.Joueur.value:r.Joueur))))?'1':'0'})()";
  const bad = api().compile(contextExample({ source: 'expression', expression: gregory, mode: 'reactive' }, { disabled: true }));
  assert.equal(bad.status, 'invalid');
  const syntax = bad.validation.issues.find(i => i.code === 'expression_syntax');
  assert.ok(syntax, JSON.stringify(bad.validation.issues));
  assert.match(syntax.message, /^context_input defaultFrom\.expression: position \d+: '\)' found where '\}' should close the '\{' opened at position 6 \(…Joueur\.value:r\.Joueur\)\)\)\[\)\]\?'1':'0'\}\)\(\)\)$/);
  assert.equal(syntax.path, '/formulaire/0/config/contextDefault/expression');
  for (const expression of [
    "fields.a?.b?.[0] ?? (x => x / 2)(fields.n) / 3",
    "`Total: ${(fields.items || []).map(i => `${i.name} (${i.qty})`).join(', ')}`",
    "(fields.list || []).filter(r => /^[A-Z]{2}\\/\\d+$/.test(r.code)).length",
    "(() => { /* ) } */ const s = 'a ) b'; // (\n return s.split(/[),]/).length; })()",
    gregory.replace("r.Joueur))))?'1'", "r.Joueur)))?'1'")
  ]) {
    const ok = api().compile(contextExample({ source: 'expression', expression, mode: 'reactive' }, { disabled: true }));
    assert.ok(!ok.validation.issues.some(i => i.code === 'expression_syntax'), expression + ' -> ' + JSON.stringify(ok.validation.issues));
  }
  for (const [expression, message] of [
    ['(fields.a + fields.b', /position 1: the '\(' opened here is never closed/],
    ['fields.list.map(x => [x.a, x.b)', /position \d+: '\)' found where '\]' should close the '\[' opened at position 22/],
    ["'abc", /position 1: the string opened by ' here is never closed/],
    ['fields.a }', /position 10: one '\}' too many, it closes nothing/]
  ]) {
    const r = api().compile(contextExample({ source: 'expression', expression, mode: 'reactive' }, { disabled: true }));
    assert.match((r.validation.issues.find(i => i.code === 'expression_syntax') || {}).message || '', message, expression);
  }
  const logic = api().compile({ name: 'Logic', pages: [{ name: 'P', fields: [{ type: 'text', name: 'n', label: 'N' }] }], flows: [{ id: 'formulas', name: 'Formulas', elements: [{ name: 'double', type: 'business_logic', expression: '(fields.n * 2' }] }] });
  const logicIssue = logic.validation.issues.find(i => i.code === 'expression_syntax');
  assert.ok(logicIssue, JSON.stringify(logic.validation.issues));
  assert.match(logicIssue.message, /^double expression: position 1: the '\(' opened here is never closed/);
  assert.match(logicIssue.path, /^\/flows\/0\/elements\/0\/sources\/self\/vars\/selfVar\/str$/);
  assert.match(formsSource, /The browsers run modern JavaScript: arrow functions, template literals, \?\. and \?\? are accepted\. The tools check that parentheses, brackets, braces and quotes pair up/);
  // an edit bringing such an expression is refused before the save
  const h = creationHarness();
  const start = h.client.create(example(), h.auth);
  const saves = h.state.saves;
  const edited = h.client.edit(start.form._id, [{ action: 'add_field', pageName: 'Home', fieldObject: { type: 'text', name: 'deja_joue', label: 'Déjà joué', disabled: true, defaultFrom: { source: 'expression', expression: gregory, mode: 'reactive' } } }], h.auth);
  assert.notEqual(edited.status, 'ok');
  assert.equal(edited.saved, false);
  assert.equal(h.state.saves, saves, 'nothing written');
  assert.ok(JSON.stringify(edited).includes("found where '}' should close the '{' opened at position 6"), JSON.stringify(edited).slice(0, 400));
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
test('the contract says what fields.<grid> holds for each returned_value and what a refresh does (6e89967b)', () => {
  // 27/10 (Skyjo): a duplicate check compared the link cells of an all_the_data grid as raw values and stayed at 0;
  // the agent could not see the shape of fields.<grid>. Shapes checked live on 29/10 (C8Oforms 2.2.0-beta457).
  const grid = /var GRID_VALUE = "(.*)";\n/.exec(formsSource)[1];
  assert.match(grid, /row_selected \(the default\) gives the selected row as Baserow gives it, \{ id, order, <Column>: value \}/);
  assert.match(grid, /a link or a multiple select a list of \{ id, value \}\), and \{\} while no row is selected/);
  assert.match(grid, /all_the_data the list of the rows read \(1000 at most\), each cell wrapped as \{ value, displayValue \(its HTML\), type, displayName, technicalName \}/);
  assert.match(grid, /read row\[\\"<Column>\\"\]\.value \(a link: a list of \{ id, value \}\), never the cell itself or its displayValue/);
  assert.match(grid, /A reactive value is computed again when the rows of a grid it reads arrive/);
  assert.match(grid, /An expression that throws shows a toast with its error in the preview of a draft, nothing in a published application/);
  const contract = api().contract({ sections: ['contextualDefaults'] });
  assert.match(JSON.stringify(contract), /all_the_data the list of the rows read/);
  const skill = nocodeSkillText();
  assert.match(skill, /`all_the_data`: the list of the rows read, each cell wrapped as `\{ value, displayValue, type, displayName, technicalName \}`/);
  assert.match(skill, /send it back as `defaultFrom` with plain `fields\.<name>` references when it must change; never write tokens by hand/);
});
test('a defaultFrom field changes through defaultFrom: config.contextDefault is compiled, selfVar alone is refused (2ba0a64a)', () => {
  // 27/10 (Skyjo): the agent patched config.defaultFrom (stored as is), config.contextDefault (selfVar kept the old
  // expression) and selfVar alone (contextDefault kept the old one); the viewer runs selfVar.
  const h = creationHarness();
  const created = h.client.create(contextExample({ source: 'expression', expression: 'fields.a * 2', mode: 'reactive' }, { disabled: true }), h.auth);
  const id = created.form._id;
  const run = field => evaluateDefault(field, { fields: { a: 3 } });
  const edit = patch => h.client.edit(id, [{ action: 'update_field', fieldName: 'context_input', patch }], h.auth);
  let r = edit({ config: { contextDefault: { expression: 'fields.a * 10' } } });
  assert.equal(r.saved, true, JSON.stringify(r).slice(0, 400));
  let field = r.form.formulaire[0];
  assert.deepEqual(clone(field.config.contextDefault), { source: 'expression', expression: 'fields.a * 10', mode: 'reactive' }, 'merged with the declaration');
  assert.equal(run(field), 30, 'the viewer runs the new expression');
  assert.equal(field.config.contextValueMode, 'reactive');
  r = edit({ config: { defaultFrom: { source: 'expression', expression: 'fields.a + 1', mode: 'reactive' } } });
  field = r.form.formulaire[0];
  assert.equal(field.config.defaultFrom, undefined, 'defaultFrom under config is not stored as is');
  assert.equal(field.config.contextDefault.expression, 'fields.a + 1');
  assert.equal(run(field), 4);
  r = edit({ config: { contextDefault: { source: 'expression', expression: 'fields.a - 1', mode: null }, contextValueMode: 'initial' } });
  assert.equal(r.saved, true, JSON.stringify(r).slice(0, 400));
  field = r.form.formulaire[0];
  assert.deepEqual([field.config.contextDefault.mode, field.config.contextValueMode, run(field)], ['initial', 'initial', 2], 'the mode given beside the declaration');
  assert.equal(api().validate(r.form).validation.warnings.some(w => w.code === 'context_default_stale'), false);
  const saves = h.state.saves;
  for (const patch of [
    { sources: { self: { enabled: true, vars: { selfVar: { str: '(fields.a * 100)', type: 'ts', html: false } } } } },
    { defaultFrom: { source: 'expression', expression: 'fields.a * 100' }, sources: { self: { vars: { selfVar: { str: '(fields.a * 100)' } } } } },
    { config: { contextDefault: { expression: 'fields.a * 100' } }, sources: { self: { vars: { selfVar: { str: '(fields.a * 100)' } } } } }
  ]) {
    r = edit(patch);
    assert.equal(r.saved, false, JSON.stringify(patch));
    assert.match(JSON.stringify(r), /context_input: sources\.self\.vars\.selfVar is compiled from defaultFrom \(declared in config\.contextDefault\) and the viewer runs it\. Change the value with patch \{ defaultFrom:/);
  }
  assert.equal(h.state.saves, saves, 'nothing written');
  r = edit({ config: { contextDefault: null }, sources: { self: { vars: { selfVar: { str: '(fields.a * 100)' } } } } });
  assert.equal(r.saved, true, 'without its declaration, selfVar is hand-written');
  field = r.form.formulaire[0];
  assert.equal(field.config.contextDefault, undefined);
  assert.equal(run(field), 300);
});
test('the form read back keeps config.contextDefault as saved: a fallback "" is not context_default_stale', () => {
  // 29/10: nocode-form-get answered the form without the empty values, the fallback "" of a defaultFrom included;
  // nocode-form-validate on that form then warned context_default_stale and asked to send defaultFrom again.
  const input = contextExample({ source: 'field', field: 'requests', column: 'Reference', mode: 'reactive', fallback: '' }, { disabled: true, label: 'Reference' });
  input.pages[0].fields.push({ type: 'grid', name: 'requests', label: 'Requests', columns: [{ name: 'Reference', type: 'text' }], config: { sourceEnabled: false } });
  const forms = api();
  const compiled = forms.compile(input);
  assert.equal(compiled.status, 'ok', JSON.stringify(compiled.validation));
  const read = forms.agentView(clone(compiled.form));
  const field = read.formulaire.find(f => f.name === 'context_input');
  assert.deepEqual(clone(field.config.contextDefault), { source: 'field', field: 'requests', column: 'Reference', mode: 'reactive', fallback: '' });
  const warnings = forms.validate(read).validation.warnings;
  assert.equal(warnings.some(w => w.code === 'context_default_stale'), false, JSON.stringify(warnings));
  assert.doesNotMatch(JSON.stringify(read.formulaire.map(f => ({ ...f.config, contextDefault: undefined }))), /:""/, 'the other empty values are still left out');
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
test('legacy tab default remains available; contract recommends an explicit choice', () => {
  const input = example(); delete input.navigationMode;
  assert.ok(api().compile(input).form.pages.every(p => p.enabledTab));
  const contract = api().contract({ sections: ['all'] }).authoringContract;
  assert.ok(contract.rootFields.navigationMode.enum.includes('custom'));
  assert.ok(contract.generationQuality.styles.scopes.boxStyle);
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





test('native design recipes survive compilation across sections, fields, data and grouped actions', () => {
  const compiler = api();
  const recipes = clone(compiler.contract({ sections: ['all'] }).authoringContract.generationQuality.styles.recipes);
  const input = connectedExample();
  Object.assign(input.pages[0].fields[0], recipes.welcome);
  Object.assign(input.pages[1].fields[0], recipes.dataView);
  const actions = input.pages[1].fields.splice(1);
  actions.forEach(button => Object.assign(button, recipes.buttonInsideGroup));
  const group = clone(compiler.contract({ sections: ['all'] }).authoringContract.componentAuthoring.layout.actionGroupExample);
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
  Object.assign(button, clone(compiler.contract({ sections: ['all'] }).authoringContract.generationQuality.styles.recipes.standaloneButton));
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
test('save readback returns authoritative ids and does not retry a successful write', () => {
  const start = source.indexOf('  function attachSavedForm(');
  const end = source.indexOf('  C8O.nocodeForms.create =', start);
  let actual = { _id: 'created-id', _rev: '2-saved', name: 'Persisted name' };
  const ctx = { clone, getForm: () => actual, validateForm: () => ({ validation: { valid: true, warnings: [], warningCount: 0 } }), withoutKey: value => value || {}, keepEditorFlowElements: validation => validation };
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
      if (options.columnsByTable) return { document: { array: clone(options.columnsByTable[JSON.parse(params.forms_config).table_id] || []) } };
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

test('an edit that names no flow, or a field the form lacks, is told the names it could give', () => {
  // Feedback of 22/10 and 26/10: agents retried blind after "flow id or name is required" and "field not found".
  const h = creationHarness();
  const start = h.client.create(example(), h.auth);
  const id = start.form._id;
  const toast = start.form.flows.find(f => f.id === 'example').elements.find(e => e.type === 'toast');
  const patched = h.client.edit(id, [{ action: 'update_flow_element', elementId: String(toast.id), patch: { config: { duration: 3 } } }], h.auth);
  assert.equal(patched.status, 'ok', JSON.stringify(patched.error));
  assert.equal(patched.form.flows.find(f => f.id === 'example').elements.find(e => e.id === toast.id).config.duration, 3, 'the one flow holding the element is the one meant');
  const byName = h.client.edit(id, [{ action: 'update_flow_element', elementId: toast.name, patch: { config: { duration: 4 } } }], h.auth);
  assert.equal(byName.status, 'ok', JSON.stringify(byName.error));
  assert.equal(byName.form.flows.find(f => f.id === 'example').elements.find(e => e.id === toast.id).config.duration, 4, 'elementId may hold the element name');
  const noFlow = h.client.edit(id, [{ action: 'add_flow_element', element: { type: 'toast', message: 'Hi' } }], h.auth);
  assert.equal(noFlow.status, 'error');
  assert.match(noFlow.error.message, /^flow id or name is required\. Known flows: .*open.*back.*example/);
  const typo = h.client.edit(id, [{ action: 'update_field', fieldName: 'requets', patch: { label: 'X' } }], h.auth);
  assert.equal(typo.status, 'error');
  assert.match(typo.error.message, /^field not found: requets\. Did you mean "requests"\? Known fields: /);
  const far = h.client.edit(id, [{ action: 'update_field', fieldName: 'zzzz', patch: { label: 'X' } }], h.auth);
  assert.doesNotMatch(far.error.message, /Did you mean/, 'nothing close, no guess');
  assert.match(far.error.message, /Known fields: .*welcome.*requests/);
});

test('a page is found from its pageTechName, and page, field and flow take an id or a name', () => {
  // TigoAccess 2c46f518 (26/10): delete_page with pageTechName answered "page not found" while listing that page; a page
  // has no id, its pageTechName is its identifier.
  const h = creationHarness();
  const start = h.client.create(example(), h.auth);
  const id = start.form._id;
  const [home, requests] = start.form.pages.map(p => p.pageTechName);
  assert.equal(start.form.pages[0].id, undefined, 'a saved page has no id');
  const renamed = h.client.edit(id, [{ action: 'update_page', pageTechName: home, patch: { name: 'Start' } }], h.auth);
  assert.equal(renamed.status, 'ok', JSON.stringify(renamed.error));
  assert.deepEqual(clone(renamed.form.pages.map(p => p.name)), ['Start', 'Requests']);
  const byPage = h.client.edit(id, [{ action: 'update_page', page: 'Start', patch: { iconName: 'home' } }, { action: 'update_page', pageName: requests, patch: { iconName: 'list' } }], h.auth);
  assert.equal(byPage.status, 'ok', JSON.stringify(byPage.error));
  assert.deepEqual(clone(byPage.form.pages.map(p => p.iconName)), ['home', 'list'], 'page holds a visible name, pageName a pageTechName');
  const field = h.client.edit(id, [{ action: 'update_field', field: 'welcome', patch: { config: { html: '<h2>Hello</h2>' } } }], h.auth);
  assert.equal(field.status, 'ok', JSON.stringify(field.error));
  assert.equal(field.form.formulaire.find(f => f.name === 'welcome').config.html, '<h2>Hello</h2>', 'field may hold the technical name');
  const flow = h.client.edit(id, [{ action: 'update_flow', flow: 'open', patch: { name: 'Open requests' } }, { action: 'update_flow', flowId: 'Open requests', patch: { name: 'Open the requests' } }], h.auth);
  assert.equal(flow.status, 'ok', JSON.stringify(flow.error));
  assert.equal(flow.form.flows.find(f => f.id === 'open').name, 'Open the requests');
  const added = h.client.edit(id, [{ action: 'add_page', name: 'Extra' }, { action: 'add_field', pageName: 'Extra', fieldObject: { type: 'text', name: 'extra_note' } }], h.auth);
  assert.equal(added.status, 'ok', JSON.stringify(added.error));
  const extra = added.form.pages.find(p => p.name === 'Extra').pageTechName;
  const removed = h.client.edit(id, [{ action: 'delete_page', pageTechName: extra }], h.auth);
  assert.equal(removed.status, 'ok', JSON.stringify(removed.error || removed.validation));
  assert.deepEqual(clone(removed.form.pages.map(p => p.pageTechName)), [home, requests]);
  assert.ok(!removed.form.formulaire.some(f => f.name === 'extra_note'), 'its components went with it');
  const gone = h.client.edit(id, [{ action: 'delete_page', pageTechName: extra }], h.auth);
  assert.match(gone.error.message, new RegExp('^page not found: ' + extra + '\\. .*Known pages: Start \\(' + home + '\\), Requests \\(' + requests + '\\)\\.$'));
});

test('the agent names the editor place of a default, or says it cannot see the editor', () => {
  // gregoryv, test-nocode 28/10: asked how to prefill a datetime with today's date, the agent sent the user to a
  // "clock" default in the field properties, then to a "context" choice that "needs a recent viewer". Neither exists:
  // the editor has a Default value tab, text or JavaScript; the contract only spoke of defaultFrom and of the viewer.
  const client = api();
  const section = client.contract({ sections: ['contextualDefaults'] }).sections.contextualDefaults;
  assert.match(section.editor, /^Where No Code Studio sets a default by hand: select the text, slider, datetime, time or barcode component, tab Default value \(French: Valeur par défaut\) of its configuration\./);
  assert.match(section.editor, /typed as text, or as JavaScript after the JavaScript logo button/);
  assert.match(section.editor, /That tab has no clock, today, user or query choice and no initial\/reactive switch\./);
  assert.match(section.editor, /two switches that refuse a date before or after today: they restrict the entry and fill nothing/);
  assert.match(section.editor, /The contract names no other editor control: for any other setting, say you cannot see where the editor puts it/);
  // The code it gives for today's date is the one defaultFrom clock today compiles to.
  const today = client.compile({ name: 'Today', pages: [{ name: 'Entry', fields: [{ type: 'datetime', name: 'when', label: 'Date', defaultFrom: { source: 'clock', property: 'today' } }] }] });
  const code = today.form.formulaire.find(f => f.name === 'when').sources.self.vars.selfVar.str;
  assert.ok(section.editor.includes('JavaScript mode, ' + code + ' (what defaultFrom'), code);
  assert.match(evaluateDefault({ sources: { self: { vars: { selfVar: { str: code } } } } }), /^\d{4}-\d{2}-\d{2}$/);
  // The viewer note no longer reads as an editor version to look for.
  assert.doesNotMatch(section.native, /deploy Forms and MCP together/);
  assert.match(section.native, /The viewer reads contextValueMode since C8Oforms 2\.2\.0-beta338 \(an older viewer recomputes the value like a reactive one\); the editor never shows it\./);
  assert.match(client.contract({}).quickReference.defaults, /Section contextualDefaults: rules, and the editor's Default value tab\.$/);
  const skill = nocodeSkillText();
  assert.match(skill, /- You do not see the No Code Studio editor\. Name a tab, button, menu or choice of the editor only when the contract names it \(`contextualDefaults\.editor` for default values\), never from a tool property/);
  assert.match(skill, /say you cannot see where the editor puts it, then offer to make the change with the tools or to give the value or code to paste\./);
  assert.match(skill, /- By hand, a user sets a default in the component's Default value tab \(Valeur par défaut\): a text, or JavaScript in its advanced mode\. It has no clock, user or query choice/);
  // The tab names are the editor's own (C8Oforms i18n), when the C8Oforms checkout is there.
  for (const [lang, label] of [['fr', 'Valeur par défaut'], ['en', 'Default value']]) {
    const file = path.join(formsRoot, 'DisplayObjects/mobile/assets/i18n/' + lang + '.json');
    if (fs.existsSync(file)) assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).defaultvalue, label);
  }
});

test('remove_flow is refused while a component the edit keeps still uses the flow', () => {
  // gregoryv, test-nocode 28/10 (Skyjo, rev 503): asked to delete a button, the agent sent remove_field and remove_flow;
  // the flow was also the flow of another button. The edit saved, an empty flow of that id came back in its place, and
  // the validation said valid with one empty_button_flow warning among 22: that button did nothing.
  const h = creationHarness();
  const start = h.client.create(example(), h.auth);
  const id = start.form._id;
  const shared = h.client.edit(id, [{ action: 'add_field', pageName: 'Home', fieldObject: { type: 'button', name: 'back_copy', label: 'Home', flow: 'back' } }], h.auth);
  assert.equal(shared.status, 'ok', JSON.stringify(shared.error || shared.validation));
  const savesBefore = h.state.saves;
  const refused = h.client.edit(id, [{ action: 'remove_field', fieldName: 'back_copy' }, { action: 'remove_flow', flowId: 'back' }], h.auth);
  assert.equal(refused.status, 'error');
  assert.equal(refused.saved, false);
  assert.equal(refused.error.code, 'flow_in_use');
  assert.match(refused.error.message, /^Nothing saved: flow back is still the flow of back \(button, page Requests\)\. .*remove_field.*update_field \{ fieldName, patch: \{ flow: /);
  assert.deepEqual(clone(refused.error.flowsInUse), [{ flowId: 'back', usedBy: [{ name: 'back', id: start.form.formulaire.find(f => f.name === 'back').id, type: 'button', page: 'Requests' }] }]);
  assert.equal(h.state.saves, savesBefore, 'nothing written');
  assert.ok(h.state.forms[id].formulaire.some(f => f.name === 'back_copy'));
  assert.equal(h.state.forms[id].flows.find(f => f.id === 'back').elements.length, 1);
  // delete_flow, and a flow used by two kept buttons, name every component.
  const both = h.client.edit(id, [{ action: 'delete_flow', flowId: 'back' }], h.auth);
  assert.equal(both.error.code, 'flow_in_use');
  assert.match(both.error.message, /flow back is still the flow of back \(button, page Requests\), back_copy \(button, page Home\)/);
  // Allowed when the same edit removes the components, points them to another flow, or adds the flow back.
  const repointed = h.client.edit(id, [{ action: 'update_field', fieldName: 'back_copy', patch: { flow: 'open' } }, { action: 'remove_field', fieldName: 'back' }, { action: 'remove_flow', flowId: 'back' }], h.auth);
  assert.equal(repointed.status, 'ok', JSON.stringify(repointed.error || repointed.validation));
  assert.ok(!repointed.form.flows.some(f => f.id === 'back'), 'no empty flow put back');
  assert.equal(repointed.form.formulaire.find(f => f.name === 'back_copy').flow, 'open');
  const replaced = h.client.edit(id, [{ action: 'remove_flow', flowId: 'open' }, { action: 'add_flow', flowId: 'open', name: 'Open', flowData: { elements: [{ type: 'push_page', targetPage: 'Requests' }] } }], h.auth);
  assert.equal(replaced.status, 'ok', JSON.stringify(replaced.error || replaced.validation));
  const removed = h.client.edit(id, [{ action: 'remove_field', fieldName: 'back_copy' }, { action: 'remove_field', fieldName: 'open' }, { action: 'remove_flow', flowId: 'open' }], h.auth);
  assert.equal(removed.status, 'ok', JSON.stringify(removed.error || removed.validation));
  assert.ok(!removed.form.flows.some(f => f.id === 'open'));
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
  const contract = client.contract({ sections: ['all'] });
  assert.ok(contract.authoringContract.generationQuality.incrementalCreation.step1.includes('nocode-form-create'));
  assert.ok(/not as a string/.test(contract.authoringContract.generationQuality.incrementalCreation.rule));
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
  // the operations are those of the C8Oforms of the server: the schema lists none, its description names the recovery
  assert.equal(context.nocodeFormEditOperationSchema().properties.action.enum, undefined);
  assert.match(context.nocodeFormEditOperationSchema().properties.action.description, /finalize_baserow_bindings resumes an already saved creation/);
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
function conditionExample(extraFields, flows) {
  return { name: 'Conditions', navigationMode: 'custom', pages: [{ name: 'Main', fields: [
    { type: 'grid', name: 'contacts', id: 1900000000400, sourceEnabled: false, columns: [{ name: 'Name', type: 'text' }] },
    { type: 'text', name: 'status', id: 1900000000401, label: 'Status' },
    { type: 'checkbox', name: 'tags', id: 1900000000402, label: 'Tags', values: ['High', 'Low'] },
    ...extraFields
  ] }], flows: flows || [] };
}
// Flows run by events (triggers), set_value, reset_fields except and how long a value is kept (C8Oforms 2.2).
test('edits set a lifetime and the triggers of a flow in their reduced shapes', () => {
  const h = creationHarness();
  const created = h.client.create(example(), h.auth);
  const id = created.form._id;
  const edited = h.client.edit(id, [
    { action: 'add_field', pageName: 'Requests', field: { type: 'text', name: 'note', label: 'Note', lifetime: { selection: 'requests' } } },
    { action: 'add_flow', flow: { id: 'on_requests', name: 'On requests', triggers: [{ on: 'enter', page: 'Requests' }], elements: [{ type: 'reset_fields', targetField: 'note' }] } },
    { action: 'update_flow', flowId: 'back', patch: { triggers: [{ on: 'change', field: 'requests' }] } }
  ], h.auth);
  assert.equal(edited.saved, true, JSON.stringify(edited.validation || edited.error));
  const form = edited.form;
  const requests = form.formulaire.find(f => f.name === 'requests');
  assert.deepEqual(clone(form.formulaire.find(f => f.name === 'note').config.lifetime), { type: 'selection', element: requests.id });
  assert.deepEqual(clone(form.flows.find(f => f.id === 'on_requests').triggers), [{ type: 'page_enter', page: form.pages[1].pageTechName }]);
  assert.deepEqual(clone(form.flows.find(f => f.id === 'back').triggers), [{ type: 'value_change', element: requests.id }]);
  const again = h.client.edit(id, [{ action: 'update_field', fieldName: 'note', patch: { lifetime: 'application' } }], h.auth);
  assert.equal(again.saved, true, JSON.stringify(again.validation || again.error));
  assert.equal(again.form.formulaire.find(f => f.name === 'note').config.lifetime, undefined);
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
test('add_flow compiles reduced elements and keeps elements read back from a saved flow', () => {
  const h = creationHarness();
  const created = h.client.create(example(), h.auth);
  const id = created.form._id;
  const saved = h.state.forms[id];
  const nativeToast = clone(saved.flows.find(f => f.id === 'example').elements[1]);
  nativeToast.id = 1900000000777;
  const edited = h.client.edit(id, [
    { action: 'add_flow', flowData: { id: 'open_home', name: 'Open home', elements: [
      { type: 'push_page', targetPage: 'Home' },
      { type: 'if_else', condition: { field: 'requests', operator: 'is_filled' }, then: [{ type: 'toast', message: 'Rows', color: 'warning' }] },
      nativeToast
    ] } },
    { action: 'add_field', pageName: 'Requests', fieldObject: { type: 'button', name: 'home2', label: 'Home', flow: 'open_home' } }
  ], h.auth);
  assert.equal(edited.saved, true, JSON.stringify(edited.validation || edited.error));
  const elements = h.state.forms[id].flows.find(f => f.id === 'open_home').elements;
  assert.deepEqual(clone(elements.map(e => e.type)), ['push_page', 'if_else', 'toast', 'toast']);
  assert.ok(elements.every(e => e.id != null && e.config));
  assert.equal(elements[0].config.targetPage, saved.pages[0].pageTechName);
  assert.equal(elements[2].parentRef, elements[1].id);
  assert.deepEqual(elements[3], nativeToast);
});
test('Baserow data needs no native contract section', () => {
  // 22/10 on test-nocode: the skill sent agents to baserowSources and backendActions (28 KB) for any Baserow data;
  // the answer was spilled to a file and read with 14 to 20 shell commands per turn.
  const shorthand = api().contract({ sections: ['baserowShorthand'] }).sections.baserowShorthand;
  const all = api().contract({ sections: ['baserowSources.filters'] }).sections['baserowSources.filters'].filter.operators;
  const listed = Object.values(shorthand.operators).filter(Array.isArray).flat();
  assert.ok(listed.length >= 15);
  assert.deepEqual(listed.filter(op => !all.includes(op)), []);
  assert.doesNotMatch(shorthand.filter, /baserowSources/);
  const quick = api().contract({}).quickReference.baserow.operators.match(/\b[a-z]+(?:_[a-z]+)+\b|\b(?:contains|equal|empty|boolean)\b/g);
  assert.ok(quick.length >= 15);
  assert.deepEqual(quick.filter(op => !all.includes(op)), []);
  const skill = nocodeSkillText();
  const step1 = skill.split('\n').find(line => line.startsWith('1. Read the no-code contract'));
  // since the contract in one call (19/11): the core it names holds the Baserow sources and saves
  assert.match(step1, /names its core `quickReference` \([^)]*Baserow sources and saves/);
  assert.doesNotMatch(step1, /`baserowSources` and `backendActions` for Baserow data/);
});
// Vibe keeps a tool result inline up to about 16 KB of its JSON indented with sorted keys; a larger one is spilled to
// a file that its agent read with 14 to 20 shell commands per turn (22/10 on test-nocode).
const indentedSize = value => {
  const sorted = v => Array.isArray(v) ? v.map(sorted) : (v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v);
  return JSON.stringify(sorted(JSON.parse(JSON.stringify(value))), null, 2).length;
};
// One contract answer stays under 12,500 characters indented (CONTRACT_ANSWER_ROOM of js/nocode_forms.js): Vibe weighs a
// script's return indented by 2 against its 16,000, and mcp_endpoint pages an answer over 14,000 (js/mcp_answer_pages.js).
const ANSWER_ROOM = 12500;
// The sections asked, following remaining from answer to answer: {answers, sections}.
function readSections(client, names) {
  const answers = [];
  const sections = {};
  let asked = names;
  while (asked && asked.length) {
    const answer = client.contract({ sections: asked });
    answers.push(answer);
    assert.ok(Object.keys(answer.sections).length > 0, 'an answer holds at least one section: ' + asked);
    Object.assign(sections, answer.sections);
    asked = answer.remaining;
    assert.ok(answers.length < 20);
  }
  return { answers, sections };
}
// A section put back together from its parts (a part may hold some keys of a key).
function mergeParts(sections, name) {
  const isObject = v => v && typeof v === 'object' && !Array.isArray(v);
  const merge = (into, from) => {
    for (const [field, inner] of Object.entries(from)) into[field] = isObject(inner) && isObject(into[field]) ? merge(into[field], inner) : inner;
    return into;
  };
  const out = {};
  for (const [key, value] of Object.entries(sections)) {
    if (key === name || key.startsWith(name + '.')) merge(out, clone(value));
  }
  return out;
}
test('the contract core, every section and every part fit one answer, and a section asked whole comes back whole', () => {
  const client = api();
  const core = client.contract({});
  assert.ok(indentedSize(core) < ANSWER_ROOM, 'core ' + indentedSize(core));
  const whole = client.contract({ sections: ['all'] });
  const names = Object.keys(core.sectionIndex);
  const partNames = names.flatMap(name => (core.sectionIndex[name].match(/, parts ((?: ?\.[A-Za-z]+)+)\)$/) || ['', ''])[1].trim().split(' ').filter(Boolean).map(part => name + part));
  assert.ok(partNames.includes('baserowSources.filters') && partNames.includes('generationQuality.pages'), partNames.join(' '));
  for (const name of names.concat(partNames)) {
    const { answers, sections } = readSections(client, [name]);
    for (const answer of answers) assert.ok(indentedSize(answer) <= ANSWER_ROOM, name + ' ' + indentedSize(answer));
    if (partNames.includes(name)) {
      assert.deepEqual(Object.keys(sections), [name]);
      assert.ok(indentedSize(answers[0]) <= ANSWER_ROOM - 500, 'a part alone keeps a margin: ' + name + ' ' + indentedSize(answers[0]));
      continue;
    }
    // every key of the section, in its parts or whole
    const section = whole.authoringContract[name] !== undefined && !['generationQuality'].includes(name) ? whole.authoringContract[name] : null;
    if (section && typeof section === 'object' && !Array.isArray(section)) {
      assert.deepEqual(clone(mergeParts(sections, name)), clone(section), name);
    }
  }
  // several sections: those that fit, then remaining in the order asked
  const several = client.contract({ sections: ['generationQuality', 'styles', 'generationSteps'] });
  assert.ok(several.remaining && several.remaining.length, 'more than one answer holds');
  assert.match(several.next, /remaining|sections:\[/);
  const { answers, sections } = readSections(client, ['generationQuality', 'styles', 'generationSteps']);
  for (const answer of answers) assert.ok(indentedSize(answer) <= ANSWER_ROOM, indentedSize(answer));
  assert.deepEqual(clone(sections.styles), clone(whole.authoringContract.generationQuality.styles));
  assert.deepEqual(clone(sections.generationSteps), clone({ incrementalCreation: whole.authoringContract.generationQuality.incrementalCreation, completion: whole.authoringContract.generationQuality.completion }));
  const quality = mergeParts(sections, 'generationQuality');
  assert.match(quality.styles, /sections:\["styles"\]/);
  const expected = clone(whole.authoringContract.generationQuality);
  delete expected.incrementalCreation; delete expected.completion;
  expected.styles = quality.styles; expected.steps = quality.steps;
  assert.deepEqual(Object.keys(quality).sort(), Object.keys(expected).sort());
});
test('includeAllTypes answers the AllTypes.json prototypes in pages of whole prototypes, each one answer', () => {
  const client = api();
  const first = client.contract({ includeAllTypes: true });
  assert.equal(first.page, 1);
  assert.ok(first.pages >= 2, 'the prototypes take several pages: ' + first.pages);
  assert.match(first.about, /sections/);
  const seen = [];
  for (let page = 1; page <= first.pages; page++) {
    const answer = client.contract({ includeAllTypes: true, page });
    assert.equal(answer.status, 'ok');
    assert.ok(indentedSize(answer) <= ANSWER_ROOM, 'page ' + page + ' ' + indentedSize(answer));
    assert.deepEqual(answer.types, answer.allTypes.map(item => item.type));
    if (page < first.pages) assert.match(answer.next, new RegExp('page:' + (page + 1))); else assert.equal(answer.next, undefined);
    seen.push(...answer.allTypes);
  }
  const catalog = JSON.parse(fs.readFileSync(path.join(formsRoot, 'DisplayObjects/mobile/assets/components/AllTypes.json'), 'utf8'));
  assert.deepEqual(clone(seen), clone(catalog), 'every prototype once, in order');
  assert.equal(client.contract({ includeAllTypes: true, page: first.pages + 1 }).status, 'invalid');
});
test('contract documents the readable UI patterns and its examples compile', () => {
  const contract = api().contract({ sections: ['all'] }).authoringContract;
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
  // The answer drops empty condition groups: check the saved document.
  const open = h.state.forms[created.form._id].formulaire.find(f => f.name === 'open');
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
  // The answer drops empty values: read the saved document.
  const config = name => h.state.forms[created.form._id].formulaire.find(f => f.name === name).config;
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
  const contract = api().contract({ sections: ['all'] }).authoringContract;
  const r = api().compile({ name: 'Examples', navigationMode: 'custom', pages: [contract.generationQuality.pageHeader.example, { name: 'More', fields: [contract.componentAuthoring.section.example] }] });
  assert.equal(r.status, 'ok', JSON.stringify(r.validation.issues));
  assert.ok(r.form.formulaire.some(f => f.name === 'contact_identity' && f.type === 'layout'));
  assert.ok(contract.generationQuality.styles.roleDefaults.values.section.boxStyle.borderRadius);
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
  const contract = api().contract({ sections: ['all'] }).authoringContract;
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
  const quality = api().contract({ sections: ['all'] }).authoringContract.generationQuality;
  assert.match(quality.actionBar.width, /expand block or full makes it fill the width of its column in recent viewers/);
  assert.doesNotMatch(JSON.stringify(api().contract({ sections: ['all'] }).authoringContract), /not rendered as a full-width|does not stretch/);
  assert.match(quality.dataViews.headers, /user's language/);
});
test('Baserow filter sub-groups: documented and kept by compile and edit', () => {
  const filter = api().contract({ sections: ['all'] }).authoringContract.baserowSources.filter;
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
  const contract = api().contract({ sections: ['all'] }).authoringContract;
  const aggregations = contract.baserowSources.groupAggregations;
  assert.match(aggregations.syntax, /optional label after =/);
  assert.match(aggregations.labels.key, /sum_Contract Value/);
  assert.match(aggregations.labels.rules, /128 characters/);
  assert.ok(aggregations.examples.some(example => /=Montant/.test(example)));
  assert.match(contract.generationQuality.dataViews.headers, /groupAggregations\.labels/);
  // the aggregations of the footer of a Baserow grid, by group or for the whole table
  assert.deepEqual([...aggregations.operators], ['count', 'sum', 'avg', 'min', 'max', 'median', 'std_dev', 'variance', 'empty_count',
    'not_empty_count', 'empty_percentage', 'not_empty_percentage', 'unique_count', 'checked_count', 'not_checked_count',
    'checked_percentage', 'not_checked_percentage', 'earliest_date', 'latest_date', 'distribution']);
  assert.match(aggregations.summary, /Without forms_tableGroupBy/);
  assert.match(aggregations.plugin, /c8oforms plugin/);
  const input = connectedExample();
  const vars = input.pages[1].fields[0].sources['lib_BaseRow.formssource_GetTableData'].vars;
  vars.forms_tableGroupBy = { str: 'Status', html: false };
  vars.forms_tableAggregations = { str: 'count=Nombre,sum:Reference=Montant', html: false };
  const r = api().compile(input);
  assert.equal(r.status, 'ok', JSON.stringify(r.validation.issues));
  assert.equal(r.form.formulaire.find(f => f.type === 'grid').sources['lib_BaseRow.formssource_GetTableData'].vars.forms_tableAggregations.str, 'count=Nombre,sum:Reference=Montant');
});
test('sticky: compiled into config, validated, and an edit puts reduced config keys in config', () => {
  const r = api().compile(styled([{ type: 'description', name: 'search', description: '<p>Search</p>', sticky: 'notOnPhone' }]));
  assert.equal(r.status, 'ok', JSON.stringify(r.validation.issues));
  assert.equal(r.form.formulaire[0].config.sticky, 'notOnPhone');
  assert.equal(r.form.formulaire[0].sticky, undefined);
  const bad = api().compile(styled([{ type: 'description', name: 'search', description: '<p>Search</p>', sticky: 'top' }]));
  assert.ok(clone(bad.validation.issues).some(i => i.code === 'invalid_sticky'));
  assert.deepEqual(clone(api().contract({ sections: ['all'] }).authoringContract.commonFieldFields.sticky.enum), ['always', 'notOnPhone']);
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

test('agent answers: the saved form without empty values, transport details or token payload; sources as saved', () => {
  const h = creationHarness();
  const created = h.client.create(connectedWithoutIdentities(), h.auth);
  assert.equal(created.saved, true, JSON.stringify(created.validation));
  const text = JSON.stringify(created);
  assert.doesNotMatch(text, /_c8oMeta|"payload"|allTypesPath/);
  assert.doesNotMatch(JSON.stringify(created.form.formulaire.map(f => f.config)), /:""/, 'no empty config value');
  const saved = h.state.forms[created.form._id];
  assert.ok(text.length < JSON.stringify(saved).length);
  const grid = saved.formulaire.find(f => f.sources && f.sources['lib_BaseRow.formssource_GetTableData']);
  const answered = created.form.formulaire.find(f => f.id === grid.id);
  assert.deepEqual(clone(answered.sources), clone(grid.sources), 'sources are answered exactly as saved');
  assert.equal(saved.formulaire[0].config.boxStyle.margin !== undefined, true, 'the saved document keeps its full shape');
  assert.deepEqual(Object.keys(created).slice(0, 2), ['id', 'rev'], 'the id and the revision come first');
  assert.equal(created.id, created.form._id);
  const edited = h.client.edit(created.form._id, [{ action: 'set_root', patch: { name: 'Renamed' } }], h.auth);
  assert.equal(edited.form.name, 'Renamed');
  assert.equal(edited.rev, edited.form._rev);
  assert.doesNotMatch(JSON.stringify(edited), /_c8oMeta|"payload"/);
});
test('a create refused before its first save does not ask to finalize a saved id', () => {
  const h = creationHarness({ columns: [{ name: 'Other', type: 'text' }] });
  const r = h.client.create(connectedWithoutIdentities(), h.auth);
  assert.equal(r.saved, false);
  assert.ok(!r.validation.warnings.some(w => w.code === 'baserow_identity_incomplete'), JSON.stringify(r.validation.warnings));
  const empty = api().compile({ name: 'E', navigationMode: 'custom', pages: [{ name: 'P', fields: [{ type: 'button', name: 'b', label: 'B', flow: 'f' }] }], flows: [{ id: 'f', name: 'F', elements: [{ type: 'submit', actions: {} }] }] });
  assert.match(empty.validation.issues.find(i => i.code === 'unconfigured_submit').message, /automatic submit of its last page.*saveTo/);
});
test('the skill and the quick reference say what a tool answers in code mode', () => {
  // 23/10 on test-nocode (S1): the agent read r.result, got nothing, and spent five reads finding the answer's shape,
  // then looked for the options of a select in config.children.
  const skill = nocodeSkillText();
  // since the long answers joined in the script (19/11): read through whole(), then these keys
  assert.match(skill, /Then read `status`, `saved`, `id`, `rev` and `validation` after a create or an edit, not `result`, which does not exist/);
  assert.match(skill, /the options of a choice are its `children`/);
  const answers = api().contract({}).quickReference.answers;
  assert.match(answers, /no r\.result/);
  assert.match(answers, /choice options in children/);
  const options = api().compile({ name: 'S', pages: [{ name: 'P', fields: [{ type: 'select', name: 'kind', label: 'Type', values: ['CP', 'RTT'] }] }] }).form.formulaire[0];
  assert.deepEqual(Array.from(options.children, o => o.value), ['CP', 'RTT'], 'options are the children of the saved component');
  assert.equal(options.config.children, undefined);
});
test('the contract answers its core with an index of every section, the sections asked for, or all of it', () => {
  const client = api();
  const core = client.contract({});
  assert.ok(core.quickReference && core.quickReference.baserow && core.quickReference.edit);
  assert.match(core.sectionIndex.baserowSources, /KB/);
  assert.match(core.sectionIndex.componentAuthoring, /KB/);
  assert.equal(core.sectionIndex.quickReference, undefined);
  assert.match(core.moreSections, /generationQuality/);
  const part = client.contract({ sections: '["baserowSources","backendActions"]' });
  assert.deepEqual(Object.keys(part.sections).concat(part.remaining), ['baserowSources.inputs', 'baserowSources.filters', 'baserowSources.views',
    'baserowSources.examples', 'backendActions.rules', 'backendActions.catalog']);
  assert.ok(part.remaining.length > 0 && /sections:\[/.test(part.next));
  const whole = client.contract({ sections: ['all'] });
  assert.ok(whole.authoringContract.generationQuality && whole.authoringContract.baserowSources && whole.authoringContract.quickReference);
  assert.equal(whole.moreSections, undefined);
  assert.ok(client.contract({ includeAllTypes: true }).allTypes.length > 0, 'includeAllTypes pages the prototypes');
  const wrong = client.contract({ sections: ['nope'] });
  assert.equal(wrong.status, 'invalid');
  assert.ok(wrong.availableSections.includes('flowAuthoring') && wrong.availableSections.includes('styles'));
  assert.ok(!wrong.availableSections.includes('all') && !/\ball\b/.test(core.moreSections), 'the whole contract is not offered to agents');
});
// The reduced Baserow source and save shorthands. tableIndex stands for the user's catalog.
const reducedTables = [{ id: 5277, name: 'Tickets', path: 'Team~>Support~>Tickets' }, { id: 5278, name: 'Agents', path: 'Team~>Support~>Agents' }];
function smartRef(item, path) {
  return '$$START' + item.id + JSON.stringify({ c8otype: 'path', c8opath: path, c8oPrettyPath: '', c8obuiltin: 'false', fakeId: 'fakeId' + item.id, c8oName: null }) + 'END' + item.id + '$$';
}
function ticketsApp() {
  return { name: 'Tickets', navigationMode: 'custom', pages: [
    { name: 'Tickets', fields: [
      { type: 'text', name: 'search', label: 'Recherche', sticky: 'always' },
      { type: 'select', name: 'priority_filter', label: 'Priorité', source: { table: 5277, field: 'Priorité' } },
      { type: 'grid', name: 'tickets', label: 'Tickets', source: { table: 5277, columns: ['Titre', 'Priorité', 'Statut'], sort: 'Titre,-Créé le', filter: { all: [
        { any: [{ column: 'Titre', operator: 'contains', value: { field: 'search' } }, { column: 'Description', operator: 'contains', value: { field: 'search' } }] },
        { column: 'Statut', operator: 'single_select_not_equal', value: 'Fermé' }
      ] } } },
      { type: 'chart', name: 'by_priority', label: 'Par priorité', source: { table: 'Team~>Support~>Tickets', columns: ['Priorité'], groupBy: 'Priorité', aggregations: 'count=Nombre' } },
      { type: 'select', name: 'agent', label: 'Agent', source: { table: { id: 5278, path: 'Team~>Support~>Agents' }, display: 'Nom', value: 'Email' } },
      { type: 'text', name: 'Titre', label: 'Titre' },
      { type: 'text', name: 'new_status', label: 'Statut' },
      { type: 'button', name: 'save', label: 'Créer', flow: 'save' },
      { type: 'button', name: 'close', label: 'Fermer le ticket', flow: 'close' },
      { type: 'button', name: 'remove', label: 'Supprimer', flow: 'remove', variant: 'danger' }
    ] }
  ], flows: [
    { id: 'save', name: 'Créer le ticket', elements: [{ type: 'submit', saveTo: { table: 5277 } }] },
    { id: 'close', name: 'Fermer le ticket', elements: [{ type: 'submit', saveTo: { table: 5277, row: 'tickets', values: { Statut: { value: 'Fermé' }, Titre: 'Titre', Commentaire: { field: 'new_status' } } } }] },
    { id: 'remove', name: 'Supprimer le ticket', elements: [{ type: 'submit', deleteFrom: { table: 5277, row: 'tickets' } }] }
  ] };
}
test('edits accept the reduced source and saves', () => {
  const h = creationHarness({ columns: ['Reference', 'Status', 'Titre', 'Statut', 'Nom'].map(name => ({ name, type: 'text' })) });
  const created = h.client.create(example(), h.auth);
  const id = created.form._id;
  const edited = h.client.edit(id, [
    { action: 'add_field', pageName: 'Requests', fieldObject: { type: 'grid', name: 'tickets', label: 'Tickets', source: { table: { id: 5277, path: 'Team~>Support~>Tickets' }, columns: ['Titre'] } } },
    { action: 'add_flow', flowId: 'archive', name: 'Archiver', flowData: { elements: [] } },
    { action: 'add_flow_element', flowId: 'archive', element: { type: 'submit', saveTo: { table: { id: 5277, path: 'Team~>Support~>Tickets' }, row: 'tickets', values: { Statut: { value: 'Archivé' } } } } }
  ], h.auth);
  assert.equal(edited.saved, true, JSON.stringify(edited.error || edited.validation));
  const saved = h.state.forms[id];
  const grid = saved.formulaire.find(f => f.name === 'tickets');
  assert.equal(JSON.parse(grid.sources['lib_BaseRow.formssource_GetTableData'].vars.forms_config.str).table_id_int, 5277);
  const submit = saved.flows.find(f => f.id === 'archive').elements[0];
  assert.equal(submit.actions['lib_BaseRow.forms_AddRowFromData'].vars.forms_id.str, smartRef(grid, 'tickets.id.value'));
  const resourced = h.client.edit(id, [{ action: 'update_field', fieldName: 'tickets', patch: { source: { table: { id: 5278, path: 'Team~>Support~>Agents' }, columns: ['Nom'] } } }], h.auth);
  assert.equal(resourced.saved, true, JSON.stringify(resourced.error || resourced.validation));
  const regrid = h.state.forms[id].formulaire.find(f => f.name === 'tickets');
  assert.equal(JSON.parse(regrid.sources['lib_BaseRow.formssource_GetTableData'].vars.forms_config.str).table_id_int, 5278);
});

test('forms_freeVars: a column map becomes the editor list, JSON text still runs with a warning, columns are checked either way', () => {
  const h = creationHarness();
  const input = connectedWithoutIdentities();
  const step = input.flows[2].elements[0];
  const entry = step.actions['lib_BaseRow.forms_AddRow'];
  entry.vars.forms_freeVars = { Reference: 'R-1', Status: 'Open' };
  step.actions = { 'lib_BaseRow.forms_AddRowFromData': entry };
  const created = h.client.create(input, h.auth);
  assert.equal(created.status, 'ok', JSON.stringify(created.validation));
  const saved = h.state.forms[created.form._id].flows.find(f => f.elements.some(e => e.actions && e.actions['lib_BaseRow.forms_AddRowFromData']));
  const savedVars = saved.elements.find(e => e.actions && e.actions['lib_BaseRow.forms_AddRowFromData']).actions['lib_BaseRow.forms_AddRowFromData'].vars;
  assert.deepEqual(savedVars.forms_freeVars, [{ name: 'Reference', str: 'R-1' }, { name: 'Status', str: 'Open' }]);
  assert.ok(!created.validation.warnings.some(w => w.code === 'freevars_text_shape'));
  entry.vars.forms_freeVars = { Wrong: 'value' };
  assert.ok(h.client.create(input, h.auth).validation.issues.some(i => i.code === 'unknown_baserow_column'), 'the list is checked against the table');
  entry.vars.forms_freeVars = { str: JSON.stringify({ Reference: 'R-2' }), html: false };
  const legacy = h.client.create(input, h.auth);
  assert.equal(legacy.status, 'ok');
  assert.ok(legacy.validation.warnings.some(w => w.code === 'freevars_text_shape'));
});

// Skyjo (26/10): a select of player names (value "Nom") written into the link_row column Scores.Joueur. lib_BaseRow
// writes the text, Baserow links the first row of that primary text, and the formulas compared a name with row ids.
const linkTables = [{ id: 7001, name: 'Joueurs', path: 'Team~>Jeux~>Joueurs' }, { id: 7002, name: 'Scores', path: 'Team~>Jeux~>Scores' }, { id: 7003, name: 'Equipes', path: 'Team~>Jeux~>Equipes' }];
const linkColumns = {
  7001: [{ id: 1, name: 'Nom', type: 'text', primary: true }, { id: 2, name: 'Scores', type: 'link_row', link_row_table_id: 7002 }],
  7002: [{ id: 3, name: 'Partie', type: 'text', primary: true }, { id: 4, name: 'Points', type: 'number' }, { id: 5, name: 'Joueur', type: 'link_row', link_row_table_id: 7001 }],
  7003: [{ id: 6, name: 'Nom', type: 'text', primary: true }]
};
function scoresApp(select = {}, save = { table: 7002 }) {
  return { name: 'Points', navigationMode: 'custom', pages: [{ name: 'Saisie', fields: [
    { type: 'select', name: 'Joueur', label: 'Joueur', source: { table: 7001, display: 'Nom', ...select } },
    { type: 'text', name: 'Partie', label: 'Partie' },
    { type: 'text', name: 'Points', label: 'Points', inputType: 'number' },
    { type: 'button', name: 'save', label: 'Enregistrer', flow: 'save_score' }
  ] }], flows: [{ id: 'save_score', name: 'Enregistrer le score', elements: [{ type: 'submit', saveTo: save }, { type: 'toast', message: 'Score enregistré', color: 'success' }] }] };
}
const selectConfig = form => JSON.parse(byName(form, 'Joueur').sources['lib_BaseRow.formssource_GetSelectData'].vars.forms_config.str);
const saveAction = (form, key) => form.flows.find(f => f.id === 'save_score').elements[0].actions[key];
test('create writes the linked row id from a select written into a link_row column, and the linked tables', () => {
  for (const [save, key] of [[{ table: 7002 }, 'lib_BaseRow.forms_AddRow'], [{ table: 7002, values: { Joueur: 'Joueur', Partie: 'Partie', Points: 'Points' } }, 'lib_BaseRow.forms_AddRowFromData']]) {
    const h = creationHarness({ columnsByTable: linkColumns });
    const r = h.client.create(scoresApp({}, save), { ...h.auth, tableIndex: linkTables });
    assert.equal(r.saved, true, JSON.stringify(r.validation || r.error));
    const saved = h.state.forms[r.form._id];
    const config = selectConfig(saved);
    assert.equal(config.value, 'id', key);
    assert.equal(config.displayValue, 'Nom');
    assert.deepEqual(config.columns, ['Nom', 'id']);
    assert.deepEqual(config.link_row_table_id, [7002], 'the table the select reads links to Scores');
    assert.deepEqual(JSON.parse(saveAction(saved, key).vars.forms_config.str).link_row_table_id, [7001], 'Scores links to Joueurs');
    const warning = r.validation.warnings.find(w => w.code === 'link_row_select_value_rewritten');
    assert.ok(warning, key);
    assert.match(warning.message, /Joueur is written into the link_row column Joueur of table 7002: its value is now the linked row id \(value "id" instead of "Nom"\)/);
  }
  // Already the row id: nothing to say.
  const h = creationHarness({ columnsByTable: linkColumns });
  const r = h.client.create(scoresApp({ value: 'id' }), { ...h.auth, tableIndex: linkTables });
  assert.equal(r.saved, true);
  assert.ok(!r.validation.warnings.some(w => /^link_row_select/.test(w.code)));
});
test('create refuses a select of another table written into a link_row column', () => {
  const h = creationHarness({ columnsByTable: linkColumns });
  const r = h.client.create(scoresApp({ table: 7003 }), { ...h.auth, tableIndex: linkTables });
  assert.equal(r.saved, false);
  const issue = r.validation.issues.find(i => i.code === 'link_row_select_table');
  assert.ok(issue, JSON.stringify(r.validation.issues));
  assert.match(issue.message, /lists the rows of table 7003 .* links to table 7001/);
  assert.equal(h.state.saves, 0);
});
test('an edit rewrites a select it changes and only reports one it leaves alone', () => {
  const h = creationHarness({ columnsByTable: linkColumns });
  const created = h.client.create(scoresApp({ value: 'id' }), { ...h.auth, tableIndex: linkTables });
  const id = created.form._id;
  // An older generation: the name as value.
  const stored = h.state.forms[id];
  const legacy = selectConfig(stored);
  legacy.value = 'Nom';
  legacy.columns = ['Nom'];
  byName(stored, 'Joueur').sources['lib_BaseRow.formssource_GetSelectData'].vars.forms_config.str = JSON.stringify(legacy);
  const reads = () => h.state.calls.filter(c => c === 'formscommon_FieldsList').length;
  const before = reads();
  const unrelated = h.client.edit(id, [{ action: 'set_root', patch: { name: 'Points du jeu' } }], h.auth);
  assert.equal(unrelated.saved, true);
  assert.ok(!unrelated.validation.warnings.some(w => /^link_row_select/.test(w.code)));
  assert.equal(reads(), before, 'an edit touching no save nor select reads no Baserow field');
  // A new save of Scores: the select is not changed by the edit, it is reported.
  const newSave = h.client.edit(id, [{ action: 'add_flow', flow: { id: 'save_again', name: 'Enregistrer encore', elements: [{ type: 'submit', saveTo: { table: 7002 } }] } }], { ...h.auth, tableIndex: linkTables });
  assert.equal(newSave.saved, true, JSON.stringify(newSave.validation || newSave.error));
  assert.equal(selectConfig(h.state.forms[id]).value, 'Nom', 'a select the edit did not change keeps its value');
  assert.ok(newSave.validation.warnings.some(w => w.code === 'link_row_select_value' && /writes "Nom" into the link_row column Joueur of table 7002/.test(w.message)));
  // The select itself changed: its value becomes the row id.
  const changed = h.client.edit(id, [{ action: 'update_field', fieldName: 'Joueur', patch: { sources: { 'lib_BaseRow.formssource_GetSelectData': { vars: { forms_tableSort: { str: '', html: false, type: 'sort', conds: [{ name: 'Nom', order: 'desc' }] } } } } } }], h.auth);
  assert.equal(changed.saved, true, JSON.stringify(changed.validation || changed.error));
  assert.equal(selectConfig(h.state.forms[id]).value, 'id');
  assert.ok(changed.validation.warnings.some(w => w.code === 'link_row_select_value_rewritten'));
});
// A save that leaves a table's primary field empty: Baserow and every link to the row show « unnamed row N » (usage
// tests, 29/10: an edit removed the only input of a primary text column). A computed primary (formula) needs no input.
const primaryTables = [{ id: 9101, name: 'Articles', path: 'Team~>Stock~>Articles' }, { id: 9102, name: 'Mouvements', path: 'Team~>Stock~>Mouvements' }];
const primaryColumns = {
  9101: [{ id: 11, name: 'Titre', type: 'text', primary: true }, { id: 12, name: 'Quantité', type: 'number' }],
  9102: [{ id: 13, name: 'Résumé', type: 'formula', primary: true }, { id: 14, name: 'Quantité', type: 'number' }]
};
function primaryApp(table, inputs, save = { table }) {
  return { name: 'Stock', navigationMode: 'custom', pages: [{ name: 'Saisie', fields: inputs.map(name => ({ type: 'text', name, label: name }))
    .concat([{ type: 'button', name: 'save', label: 'Enregistrer', flow: 'save_row' }]) }],
    flows: [{ id: 'save_row', name: 'Enregistrer', elements: [{ type: 'submit', saveTo: save }] }] };
}
test('create and edit warn when a save leaves the primary field of its table empty', () => {
  const of = r => clone(r.validation.warnings).filter(w => w.code === 'primary_field_not_filled');
  let h = creationHarness({ columnsByTable: primaryColumns });
  const filled = h.client.create(primaryApp(9101, ['Titre', 'Quantité']), { ...h.auth, tableIndex: primaryTables });
  assert.equal(filled.saved, true, JSON.stringify(filled.validation || filled.error));
  assert.deepEqual(of(filled), []);
  // The edit removes the only input of the primary field: the unchanged save no longer fills it.
  const removed = h.client.edit(filled.form._id, [{ action: 'remove_field', fieldName: 'Titre' }], h.auth);
  assert.equal(removed.saved, true, JSON.stringify(removed.validation || removed.error));
  assert.equal(of(removed).length, 1, JSON.stringify(removed.validation.warnings.map(w => w.code)));
  assert.match(of(removed)[0].message, /adds rows to Articles without filling its primary field "Titre": .*« unnamed row N »/);
  // Created without it, with a mapping without it, and a computed primary.
  h = creationHarness({ columnsByTable: primaryColumns });
  assert.equal(of(h.client.create(primaryApp(9101, ['Quantité']), { ...h.auth, tableIndex: primaryTables })).length, 1);
  h = creationHarness({ columnsByTable: primaryColumns });
  assert.equal(of(h.client.create(primaryApp(9101, ['Titre', 'Quantité'], { table: 9101, values: { Quantité: 'Quantité' } }), { ...h.auth, tableIndex: primaryTables })).length, 1);
  h = creationHarness({ columnsByTable: primaryColumns });
  assert.deepEqual(of(h.client.create(primaryApp(9102, ['Quantité']), { ...h.auth, tableIndex: primaryTables })), []);
});
// forms_AddRowFromData writes only the columns it maps: a save rewritten to map one column stopped saving the other
// inputs of its page (usage tests, 29/10).
test('create and edit warn when a mapped save leaves inputs of its page that are columns of its table', () => {
  const of = r => clone(r.validation.warnings).filter(w => w.code === 'inputs_not_saved');
  let h = creationHarness({ columnsByTable: primaryColumns });
  const one = h.client.create(primaryApp(9101, ['Titre', 'Quantité'], { table: 9101, values: { Titre: 'Titre' } }), { ...h.auth, tableIndex: primaryTables });
  assert.equal(one.saved, true, JSON.stringify(one.validation || one.error));
  assert.equal(of(one).length, 1, JSON.stringify(one.validation.warnings.map(w => w.code)));
  assert.match(of(one)[0].message, /maps only \["Titre"\] into Articles: the inputs "Quantité" of the page are columns of that table and are no longer saved/);
  h = creationHarness({ columnsByTable: primaryColumns });
  assert.deepEqual(of(h.client.create(primaryApp(9101, ['Titre', 'Quantité'], { table: 9101, values: { Titre: 'Titre', Quantité: 'Quantité' } }), { ...h.auth, tableIndex: primaryTables })), []);
  h = creationHarness({ columnsByTable: primaryColumns });
  assert.deepEqual(of(h.client.create(primaryApp(9101, ['Titre', 'Quantité']), { ...h.auth, tableIndex: primaryTables })), [], 'a save by name saves the inputs named after the columns');
});
test('nocode-form-validate refuses a select written into a link_row column with another value than the row id', () => {
  const compiled = api().compile(scoresApp(), { tableIndex: linkTables }).form;
  assert.equal(selectConfig(compiled).value, 'Nom', 'the offline compile does not know the column types');
  const h = creationHarness({ columnsByTable: linkColumns });
  const result = h.client.validate(compiled, { ...h.auth, baserowLinks: true }).validation;
  assert.equal(result.valid, false);
  const issue = result.issues.find(i => i.code === 'link_row_select_value');
  assert.ok(issue, JSON.stringify(result.issues));
  assert.equal(issue.path, '/formulaire/' + compiled.formulaire.indexOf(byName(compiled, 'Joueur')) + '/sources/lib_BaseRow.formssource_GetSelectData/vars/forms_config');
  assert.equal(selectConfig(compiled).value, 'Nom', 'validate does not change the form');
  assert.ok(!h.state.calls.includes('APIV2_updateFormulaireDocument'));
  // Without the No Code authentication the columns are not read: a warning says what was not checked.
  const offline = api().validate(compiled, { baserowLinks: true }).validation;
  assert.ok(offline.warnings.some(w => w.code === 'link_row_selects_unverified'));
  assert.ok(!offline.issues.some(i => /^link_row_select/.test(i.code)));
  // Without baserowLinks (compile, the saves) validate stays static.
  assert.ok(!api().validate(compiled).validation.warnings.some(w => w.code === 'link_row_selects_unverified'));
});
// Skyjo (29/10): joueur_histo listed the players with value "id" and columns ["Nom"]. C8Oforms refuses the rows of a
// select whose displayed or stored value is not among its columns to the respondents of the published form
// (js/baserow_published_read.js); No Code Studio warned under Source configuration, nocode-form-validate passed it.
function historyApp(source = {}) {
  return { name: 'Historiques', navigationMode: 'custom', pages: [{ name: 'Historiques', fields: [
    { type: 'select', name: 'joueur_histo', label: 'Joueur', source: { table: 7001, display: 'Nom', value: 'id', ...source } }
  ] }] };
}
const histoSource = form => byName(form, 'joueur_histo').sources['lib_BaseRow.formssource_GetSelectData'];
const histoConfig = form => JSON.parse(histoSource(form).vars.forms_config.str);
function setHistoColumns(form, columns) {
  const config = histoConfig(form);
  config.columns = columns;
  histoSource(form).vars.forms_config.str = JSON.stringify(config);
}
test('compile and create add the missing values to the columns of a native select source', () => {
  const native = () => ({ name: 'Historiques', navigationMode: 'custom', pages: [{ name: 'Historiques', fields: [
    { type: 'select', name: 'joueur_histo', label: 'Joueur', sources: { 'lib_BaseRow.formssource_GetSelectData': { enabled: true, vars: {
      forms_config: { str: JSON.stringify({ table_id: 'Team~>Jeux~>Joueurs', table_id_int: 7001, columns: ['Nom'], displayValue: 'Nom', value: 'id', hidden: [], link_row_table_id: [] }), html: false } } } } }
  ] }] });
  const compiled = api().compile(native(), { tableIndex: linkTables });
  assert.equal(compiled.status, 'ok', JSON.stringify(compiled.validation.issues));
  assert.deepEqual(histoConfig(compiled.form).columns, ['Nom', 'id']);
  assert.deepEqual(histoConfig(compiled.form).hidden, ['id'], 'hidden as well, as No Code Studio adds it (C8Oforms #1741)');
  assert.ok(compiled.validation.warnings.some(w => w.code === 'select_columns_completed'));
  const h = creationHarness({ columnsByTable: linkColumns });
  const created = h.client.create(native(), { ...h.auth, tableIndex: linkTables });
  assert.equal(created.saved, true, JSON.stringify(created.validation || created.error));
  assert.deepEqual(histoConfig(h.state.forms[created.form._id]).columns, ['Nom', 'id']);
  assert.ok(created.validation.warnings.some(w => w.code === 'select_columns_completed'), JSON.stringify(created.validation.warnings.map(w => w.code)));
});
test('an edit adds the missing values to the columns of a select it changes and only reports one it leaves alone', () => {
  const h = creationHarness({ columnsByTable: linkColumns });
  const created = h.client.create(historyApp(), { ...h.auth, tableIndex: linkTables });
  assert.equal(created.saved, true, JSON.stringify(created.validation || created.error));
  assert.ok(!created.validation.warnings.some(w => w.code === 'select_columns_completed'), 'the reduced source has them already');
  const id = created.form._id;
  setHistoColumns(h.state.forms[id], ['Nom']);
  const unrelated = h.client.edit(id, [{ action: 'set_root', patch: { name: 'Historiques du jeu' } }], h.auth);
  assert.equal(unrelated.saved, true, JSON.stringify(unrelated.validation || unrelated.error));
  assert.deepEqual(histoConfig(h.state.forms[id]).columns, ['Nom'], 'a select the edit did not change keeps its columns');
  assert.ok(unrelated.validation.warnings.some(w => w.code === 'baserow_select_columns'));
  assert.ok(!unrelated.validation.warnings.some(w => w.code === 'select_columns_completed'));
  const changed = h.client.edit(id, [{ action: 'update_field', fieldName: 'joueur_histo', patch: { sources: { 'lib_BaseRow.formssource_GetSelectData': { vars: { forms_tableSort: { str: '', html: false, type: 'sort', conds: [{ name: 'Nom', order: 'asc' }] } } } } } }], h.auth);
  assert.equal(changed.saved, true, JSON.stringify(changed.validation || changed.error));
  assert.deepEqual(histoConfig(h.state.forms[id]).columns, ['Nom', 'id']);
  assert.deepEqual(histoConfig(h.state.forms[id]).hidden, ['id']);
  assert.equal(histoConfig(h.state.forms[id]).value, 'id');
  const warning = changed.validation.warnings.find(w => w.code === 'select_columns_completed');
  assert.ok(warning, 'kept after the readback: ' + JSON.stringify(changed.validation.warnings.map(w => w.code)));
  assert.match(warning.message, /^joueur_histo: "id" added to the columns of its source/);
  assert.ok(!changed.validation.warnings.some(w => w.code === 'baserow_select_columns'));
});
// Skyjo (26/10): the current game and round were formulas over hidden grids (row_selected, 10 rows a page, the
// defaults) and a localStorage flag set by business_logic steps; a debug field stayed in the delivered form.
const skyjoPartie = "(()=>{try{const v=fields.score_last;const a=Array.isArray(v)?v:(v&&Array.isArray(v.data))?v.data:[];const num=(x)=>Number((x&&typeof x==='object')?x.value:x)||0;const m=a.reduce((acc,r)=>Math.max(acc,num(r.Partie)),0);return localStorage.getItem('skyjo_new_game')==='1'?(m+1):(m||1)}catch(e){return '1'}})()";
const skyjoTour = "(()=>{var v=fields['joueur_all'];var b=Array.isArray(v)?v:[];return b.length})()";
function skyjoLogic(grid = {}) {
  return { name: 'Skyjo', navigationMode: 'custom', pages: [{ name: 'Saisie', fields: [
    { type: 'layout', name: 'score_data', visibleIf: { never: true }, fields: [
      { type: 'grid', name: 'score_last', source: { table: 7002, columns: ['Partie', 'Tour', 'Joueur'] }, ...grid },
      { type: 'grid', name: 'joueur_all', source: { table: 7001, columns: ['Nom'] } },
      { type: 'grid', name: 'score_list', source: { table: 7002, columns: ['Partie', 'Points'] } }
    ] },
    { type: 'text', name: 'Partie', label: 'Partie', disabled: true, defaultFrom: { source: 'expression', expression: skyjoPartie, mode: 'reactive' } },
    { type: 'text', name: 'joueurs', label: 'Joueurs', disabled: true, defaultFrom: { source: 'expression', expression: skyjoTour, mode: 'reactive' } },
    { type: 'text', name: 'Selection', label: 'Partie choisie', disabled: true, defaultFrom: { source: 'field', field: 'score_list', column: 'Partie', mode: 'reactive', fallback: '' } },
    { type: 'text', name: 'debug_tour', label: 'Tour calculé', disabled: true },
    { type: 'button', name: 'new_game', label: 'Nouvelle partie', flow: 'nouvelle_partie' }
  ] }], flows: [{ id: 'nouvelle_partie', name: 'Nouvelle partie', elements: [
    { type: 'business_logic', name: 'start_new_game', expression: "(sessionStorage.setItem('skyjo_new_game','1'), '')" },
    { type: 'toast', message: 'Nouvelle partie', color: 'success' }
  ] }] };
}
// A sticky component placed after a list: the viewer's position: sticky; top: 0 only sticks it once the page has
// scrolled down to it, so behind a long list it is not in view while the list is read (usage tests, 29/10).
function stickyPage(barFirst) {
  const bar = { type: 'layout', name: 'item_actions', sticky: 'always', fields: [
    { type: 'button', name: 'add_item', label: 'Ajouter', flow: 'open_other' }
  ] };
  const list = { type: 'layout', name: 'item_card', fields: [
    { type: 'grid', name: 'item_list', label: 'Éléments', source: { table: 7002, columns: ['Joueur', 'Points'] } }
  ] };
  return { name: 'Sticky', navigationMode: 'custom', pages: [
    { name: 'Liste', fields: [{ type: 'text', name: 'search', label: 'Rechercher', sticky: 'always' }].concat(barFirst ? [bar, list] : [list, bar]) },
    { name: 'Autre', fields: [{ type: 'description', name: 'other', description: '<p>Autre</p>' }] }
  ], flows: [{ id: 'open_other', name: 'Autre page', elements: [{ type: 'push_page', targetPage: 'Autre' }] }] };
}
// A token in a text on a grid cell without .value/.displayValue shows the cell's display HTML as text (usage tests,
// 29/10: a total read from a grouped grid showed « <div style="display:flex; …">1500.00</div> »).
// nocode-form-get find: a rename "everywhere" changed the labels and pages by hand and missed a toast message (usage
// tests, 29/10). find lists every text a user sees that holds the word, case and accents ignored.
test('nocode-form-get find lists every visible text holding a word, flow messages included', () => {
  const r = api().compile({ name: 'Commandes', navigationMode: 'custom', pages: [
    { name: 'Nouvelle commande', fields: [
      { type: 'description', name: 'intro', description: '<h2>Saisir une Commande</h2><p>Une ligne par article.</p>' },
      { type: 'text', name: 'ref', label: 'Référence de la commande', placeholder: 'COMMANDE-001' },
      { type: 'select', name: 'state', label: 'État', values: ['Commandée', 'Livrée'] },
      { type: 'button', name: 'save', label: 'Enregistrer la commande', flow: 'save_order' }
    ] },
    { name: 'Articles', fields: [{ type: 'text', name: 'item', label: 'Article' }] }
  ], flows: [{ id: 'save_order', name: 'Enregistrer la commande', elements: [{ type: 'toast', message: 'Commande enregistrée', color: 'success' }] }] });
  assert.equal(r.status, 'ok', JSON.stringify(r.validation.issues));
  const found = clone(api().findText(r.form, 'COMMANDE'));
  const where = found.matches.map(m => [m.where, m.component || m.flow || '', m.text]);
  assert.equal(found.count, found.matches.length);
  for (const expected of [
    ['form name', '', 'Commandes'], ['page name', '', 'Nouvelle commande'], ['text', 'intro', 'Saisir une Commande Une ligne par article.'],
    ['label', 'ref', 'Référence de la commande'], ['placeholder', 'ref', 'COMMANDE-001'], ['choice', 'state', 'Commandée'],
    ['label', 'save', 'Enregistrer la commande'], ['flow name', 'save_order', 'Enregistrer la commande'], ['toast message', 'save_order', 'Commande enregistrée']
  ]) {
    assert.ok(where.some(m => JSON.stringify(m) === JSON.stringify(expected)), JSON.stringify(expected) + ' in ' + JSON.stringify(where));
  }
  assert.ok(found.matches.every(m => /^\/(name|pages|formulaire|flows)\//.test(m.path) || m.path === '/name'), 'each match has the path to change');
  assert.deepEqual(clone(api().findText(r.form, 'etat')).matches.map(m => m.component), ['state'], 'accents ignored');
  // The stored value comes with a text that is not plain (HTML, tokens), to patch it without reading the whole form.
  const intro = found.matches.find(m => m.component === 'intro');
  assert.match(intro.raw, /^<h2>Saisir une Commande<\/h2>/);
  assert.equal(found.matches.find(m => m.where === 'placeholder').raw, undefined, 'a plain text has no raw copy');
  assert.equal(clone(api().findText(r.form, 'livraison')).count, 0);

  const sequence = fs.readFileSync(path.join(root, '_c8oProject/sequences/tools_nocode_form_get.yaml'), 'utf8');
  assert.match(sequence, /↓find \[variables\.RequestableVariable-\d+\]: \n/);
  assert.match(sequence, /C8O\.nocodeForms\.read\(id, \{\n\s+find: typeof find === "undefined" \? null : find,/);
  const overrides = { C8O: {}, include() {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/schema_overrides.js'), 'utf8'), overrides);
  const schema = clone(overrides.C8O.schemaOverrides.applyInput('tools_nocode_form_get', null, null));
  assert.deepEqual(Object.keys(schema.properties).sort(), ['component', 'find', 'flow', 'id', 'outline', 'page', 'rev', 'token', 'warnings', 'whole']);
  assert.match(nocodeSkillText(), /call `nocode-form-get` with `find`/);
});
// Skyjo (28/10, TigoAccess 5324f308): the slider Tour had min 1 and the prototype default 0. The editor no longer shows
// config.defaultvalue, the viewer drew 1 and submitted 0.
// nocode-app-create: the application planned from a business spec and compiled, without writing anything. The stub
// stands for the user's Baserow catalog and the columns of its tables; schemaApply only says what it would create.
const TICKETS = { id: 5277, name: 'Tickets', columns: [
  { id: 1, name: 'Titre', type: 'text', primary: true },
  { id: 2, name: 'Description', type: 'long_text' },
  { id: 3, name: 'Priorité', type: 'single_select', select_options: [{ id: 11, value: 'Basse' }, { id: 12, value: 'Haute' }] },
  { id: 4, name: 'Statut', type: 'single_select', select_options: [{ id: 21, value: 'Ouvert' }, { id: 22, value: 'Fermé' }] },
  { id: 5, name: 'Créé le', type: 'created_on', read_only: true },
  { id: 6, name: 'Échéance', type: 'date' },
  { id: 7, name: 'Montant', type: 'number' }
] };
function planApp(spec, tables = [TICKETS], options = {}) {
  const C8O = api(undefined, ['js/nocode_app.js']);
  const calls = [];
  C8O.nocodeBaserow = {
    catalogList: () => ({ status: 'ok', authentication: { authenticated: true, user: 'person@example.invalid' },
      workspaces: options.workspaces || [{ id: 10, name: 'Team', bases: [{ id: 20, name: 'Support', tables: tables.map(t => ({ id: t.id, name: t.name })) }] }] }),
    tableFields: id => { calls.push('fields ' + id); return { bearer: 'JWT test', fields: clone((tables.find(t => t.id === Number(id)) || {}).columns || []) }; },
    schemaApply: o => {
      calls.push('schema ' + o.mode);
      const schema = clone(o.schema);
      return { status: 'ok', schema, actions: schema.tables.filter(t => t.id == null).map(t => ({ type: 'create_table', table: t.name })), created: {} };
    }
  };
  let compiled = null;
  const compile = C8O.nocodeForms.compile;
  C8O.nocodeForms.compile = (reduced, o) => (compiled = compile(reduced, o));
  const result = C8O.nocodeApp.create({ mode: 'plan', ...spec }, { token: 't' });
  return { result: clone(result), form: compiled && clone(compiled.form), validation: compiled && clone(compiled.validation), calls };
}
const byName = (form, name) => form.formulaire.find(item => item.name === name);
const flowOf = (form, id) => form.flows.find(flow => flow.id === id);
const pageOf = (form, name) => form.pages.find(page => page.name === name);
function refTarget(str) {
  const match = /^\$\$START(\d+)\{.*\}END(\d+)\$\$$/.exec(str);
  assert.ok(match, 'a SmartSource reference: ' + str);
  assert.equal(match[1], match[2]);
  return Number(match[1]);
}
const ticketsSpec = (screens = {}) => ({ name: 'Suivi des tickets', entities: [{ name: 'ticket', plural: 'tickets', table: 5277, screens: {
  list: { columns: ['Titre', 'Priorité', 'Statut', 'Échéance'], search: ['Titre', 'Description'], filters: ['Priorité'] }, detail: true, form: true, ...screens } }] });
function buttonsReach(form) {
  // Every button opens an existing flow, every push_page targets an existing page, and every page but the first is
  // reached by a button and has a button that leaves it.
  const techNames = form.pages.map(page => page.pageTechName);
  const reached = new Set();
  const leaving = new Set();
  for (const item of form.formulaire.filter(i => i.type === 'button')) {
    const flow = flowOf(form, item.flow);
    assert.ok(flow && flow.elements.length, item.name + ' has a flow');
    for (const element of flow.elements.filter(e => e.type === 'push_page')) {
      assert.ok(techNames.includes(element.config.targetPage), item.name + ' targets an existing page');
      reached.add(element.config.targetPage);
      leaving.add(item.config.page);
    }
  }
  form.pages.slice(1).forEach(page => {
    assert.ok(reached.has(page.pageTechName), page.name + ' is reached');
    assert.ok(leaving.has(page.pageTechName), page.name + ' has a way back');
  });
}
test('nocode-app-create: a ticket list with search OR, a choice filter, a detail and an entry form (S11)', () => {
  const { result, form, validation } = planApp(ticketsSpec());
  assert.equal(result.status, 'ok', JSON.stringify(result));
  assert.equal(validation.issueCount, 0, JSON.stringify(validation.issues));
  assert.deepEqual(validation.warnings.filter(w => w.code !== 'baserow_identity_pending_creation'), []);
  assert.equal(result.validation.warningCount, 0, 'the identities bound by the creation are not reported to the agent');
  assert.deepEqual(form.pages.map(p => p.name), ['Tickets', 'Ticket', 'Nouveau ticket'], 'the list is the hub: no home page');
  assert.ok(form.pages.every(p => p.enabledTab === false && p.enabledButtons === false && p.isNameDisplayed === false && p.iconName));
  buttonsReach(form);
  // Search bar: always visible, the search across Titre OR Description inside the AND of the choice filter.
  const bar = byName(form, 'ticket_search_bar');
  assert.equal(bar.config.sticky, 'always');
  assert.equal(bar.parentRef, undefined, 'the bar sits directly on the page');
  // Choosing an option does not reload the list in the viewer: a button applies the filters, the other clears them.
  assert.deepEqual(flowOf(form, 'apply_ticket').elements.map(e => [e.type, e.config.targetGrid]), [['refresh_grid', byName(form, 'ticket_list').id]]);
  assert.equal(byName(form, 'ticket_apply').parentRef, byName(form, 'ticket_search_actions').id);
  assert.equal(byName(form, 'ticket_search_actions').parentRef, bar.id);
  assert.equal(byName(form, 'ticket_search_fields').parentRef, bar.id);
  const search = byName(form, 'ticket_search');
  const choice = byName(form, 'ticket_filter_priorite');
  assert.deepEqual(JSON.parse(choice.sources['lib_BaseRow.formssource_GetFieldValues'].vars.forms_config.str).columns, ['Priorité']);
  const grid = byName(form, 'ticket_list');
  const source = grid.sources['lib_BaseRow.formssource_GetTableData'].vars;
  const config = JSON.parse(source.forms_config.str);
  assert.equal(config.table_id_int, 5277);
  assert.equal(config.table_id, 'Team~>Support~>Tickets');
  assert.deepEqual(config.hidden, ['Description', 'Créé le', 'Montant'], 'what only the detail shows is read but hidden');
  assert.equal(grid.config.returned_value, 'row_selected');
  const filter = source.forms_tableFilter;
  assert.equal(filter.condVisible, 'and');
  // The choice list submits the id of the option: single_select_equal, not contains.
  assert.deepEqual(filter.conds.map(c => [c.val1.name, c.operator, refTarget(c.val2.str)]), [['Priorité', 'single_select_equal', choice.id]]);
  assert.equal(filter.groups.length, 1);
  assert.equal(filter.groups[0].condVisible, 'or');
  assert.deepEqual(filter.groups[0].conds.map(c => [c.val1.name, refTarget(c.val2.str)]), [['Titre', search.id], ['Description', search.id]]);
  // Detail: read-only fields fed by the selected row.
  const detail = byName(form, 'ticket_detail_titre');
  assert.equal(detail.config.disabled, true);
  assert.deepEqual(detail.config.contextDefault, { source: 'field', field: 'ticket_list', column: 'Titre', mode: 'reactive', fallback: '' });
  assert.equal(byName(form, 'ticket_list_detail').conditions.buttonStateIf.conds[0].val1.str, String(grid.id), 'detail disabled until a row is selected');
  // Every detail reads its column whatever the cell shape: raw Baserow row or lean { value } cells.
  assert.deepEqual(clone(byName(form, 'ticket_detail_priorite').config.contextDefault), { source: 'field', field: 'ticket_list', column: 'Priorité', mode: 'reactive', fallback: '' });
  assert.equal(byName(form, 'ticket_detail_echeance').config.contextDefault.column, 'Échéance');
  assert.equal(byName(form, 'ticket_detail_echeance').type, 'datetime');
  assert.equal(byName(form, 'ticket_detail_echeance').config.display_format, 'DD/MM/YYYY');
  const cellText = (name, cell) => evaluateDefault(byName(form, name), { fields: { ticket_list: cell } });
  assert.equal(cellText('ticket_detail_priorite', { 'Priorité': { value: { id: 12787, value: 'Haute', color: 'light-orange' } } }), 'Haute');
  assert.equal(cellText('ticket_detail_priorite', null), '');
  // the raw row of the viewer (__rowValue): a text and a date as is, a single select { id, value, color }
  assert.equal(cellText('ticket_detail_titre', { Titre: 'Imprimante en panne' }), 'Imprimante en panne');
  assert.equal(cellText('ticket_detail_priorite', { 'Priorité': { id: 12787, value: 'Haute', color: 'light-orange' } }), 'Haute');
  assert.equal(cellText('ticket_detail_echeance', { 'Échéance': '2026-10-24T07:12:00Z' }), '2026-10-24T07:12:00Z');
  assert.equal(cellText('ticket_detail_titre', { Titre: { value: 'Imprimante en panne' } }), 'Imprimante en panne');
  assert.match(byName(form, 'ticket_empty').config.html, /Les tickets enregistrés apparaissent ici. Utilisez « Nouveau ticket » pour en ajouter un./);
  // Entry form: inputs named after the writable columns, typed after Baserow; the read-only column is left out.
  const inputs = form.formulaire.filter(i => i.config.page === pageOf(form, 'Nouveau ticket').pageTechName && ['text', 'select', 'datetime'].includes(i.type));
  assert.deepEqual(inputs.map(i => [i.name, i.type]), [['Titre', 'text'], ['Description', 'text'], ['Priorité', 'select'], ['Statut', 'select'], ['Échéance', 'datetime'], ['Montant', 'text']]);
  assert.equal(byName(form, 'Description').config.short, false);
  assert.equal(byName(form, 'Montant').config.type, 'number');
  assert.equal(byName(form, 'Échéance').config.display_format, 'DD/MM/YYYY');
  assert.deepEqual(result.baserow.tables[0].notEntered, ['Créé le (created_on): shown, not entered']);
  // Save: add the row from the inputs, confirm, refresh the list, reset the page, back to the list.
  const save = flowOf(form, 'save_ticket');
  assert.equal(save.name, 'Enregistrer le ticket');
  assert.deepEqual(save.elements.map(e => e.type), ['submit', 'toast', 'refresh_grid', 'reset_fields', 'push_page']);
  const action = save.elements[0].actions['lib_BaseRow.forms_AddRow'];
  assert.equal(JSON.parse(action.vars.forms_config.str).table_id_int, 5277);
  assert.equal(action.vars.forms_id.str, '', 'a new row');
  assert.equal(save.elements[1].sources.self.vars.selfVar.str, 'Ticket enregistré');
  assert.equal(save.elements[2].config.targetGrid, grid.id);
  assert.equal(save.elements[3].config.targetPage, pageOf(form, 'Nouveau ticket').pageTechName);
  assert.equal(save.elements[4].config.targetPage, pageOf(form, 'Tickets').pageTechName);
  assert.equal(byName(form, 'ticket_save').config.checkMandatoryInCurrentPage, true);
  // The outline is what the agent reads: short, with the ids it needs.
  assert.ok(JSON.stringify(result).length < 3000, JSON.stringify(result).length + ' characters');
  assert.match(JSON.stringify(result.pages), /search in Titre OR Description, filter by Priorité \(applied by its Rechercher button\)/);
  // The detail subtitle keeps the space after its article.
  assert.match(byName(form, 'header_ticket').config.html, /Le ticket sélectionné dans la liste/);
});
test('nocode-app-create: a home page with an entry form and a history on a new table (S3)', () => {
  const { result, form, validation, calls } = planApp({ name: 'Suivi des visites', home: true, entities: [{ name: 'visite', plural: 'visites', feminine: true,
    fields: [{ name: 'Visiteur', required: true, default: 'user' }, { name: 'Date de visite', type: 'date', default: 'today' }, { name: 'Motif', type: 'long_text' }],
    screens: { form: { title: 'Nouvelle visite' }, list: { title: 'Historique' } } }] }, [], { workspaces: [{ id: 10, name: 'Team', bases: [] }] });
  assert.equal(result.status, 'ok', JSON.stringify(result));
  assert.deepEqual(validation.issues.map(i => i.code), ['missing_baserow_table', 'missing_baserow_table'], 'only the table the plan has not created yet');
  assert.equal(result.validation.issueCount, 0);
  assert.deepEqual(calls, ['schema plan'], 'a plan writes nothing');
  assert.deepEqual(result.baserow.base, { id: null, name: 'Suivi des visites', created: true }, 'a base named after the application in the only workspace');
  assert.deepEqual(result.baserow.tables.map(t => [t.name, t.created]), [['Visites', true]]);
  assert.deepEqual(form.pages.map(p => [p.name, p.iconName]), [['Accueil', 'home'], ['Historique', 'list'], ['Nouvelle visite', 'add']]);
  buttonsReach(form);
  const home = form.formulaire.filter(i => i.config.page === form.pages[0].pageTechName && i.type === 'button');
  assert.deepEqual(home.map(b => [b.config.label, b.config.fill]), [['Nouvelle visite', 'solid'], ['Historique', 'outline']], 'one primary action on the home page');
  assert.equal(byName(form, 'Visiteur').config.mandatory, true);
  assert.equal(byName(form, 'Visiteur').config.contextDefault.source, 'user');
  assert.equal(byName(form, 'Date de visite').config.contextDefault.property, 'today');
  assert.equal(flowOf(form, 'save_visite').elements[1].sources.self.vars.selfVar.str, 'Visite enregistrée');
});
test('nocode-app-create: a dashboard chart grouped by a column with labelled aggregations, behind a home page', () => {
  const { result, form, validation } = planApp(ticketsSpec({ dashboard: { groupBy: 'Statut', aggregations: ['count', 'sum:Montant=Montant total'] } }));
  assert.equal(validation.issueCount, 0, JSON.stringify(validation.issues));
  assert.deepEqual(form.pages.map(p => p.name), ['Accueil', 'Tickets', 'Ticket', 'Nouveau ticket', 'Tableau de bord']);
  buttonsReach(form);
  const chart = byName(form, 'ticket_chart');
  const vars = chart.sources['lib_BaseRow.formssource_GetTableData'].vars;
  assert.equal(vars.forms_tableGroupBy.str, 'Statut');
  assert.equal(vars.forms_tableAggregations.str, 'count=Nombre de tickets,sum:Montant=Montant total');
  assert.deepEqual(JSON.parse(vars.forms_config.str).columns, ['Statut', 'Montant']);
  assert.equal(chart.config.label, 'Tickets par statut');
  assert.ok(flowOf(form, 'save_ticket').elements.some(e => e.type === 'refresh_grid' && e.config.targetGrid === chart.id), 'a save refreshes the chart too');
  assert.match(JSON.stringify(result.pages), /bar grouped by Statut/);
});
test('nocode-app-create: inputs named after their columns, an explicit mapping when two tables share a column name', () => {
  const clients = { id: 40, name: 'Clients', columns: [{ name: 'Nom', type: 'text', primary: true }, { name: 'Ville', type: 'text' }] };
  const contacts = { id: 41, name: 'Contacts', columns: [{ name: 'Nom', type: 'text', primary: true }, { name: 'Client', type: 'link_row', link_row_table_id: 40 }, { name: 'Actif', type: 'boolean' }] };
  const { result, form, validation } = planApp({ name: 'CRM', entities: [
    { name: 'client', table: 40, screens: { list: true, form: true } },
    { name: 'contact', table: 41, screens: { list: true, form: true } }
  ] }, [clients, contacts]);
  assert.equal(validation.issueCount, 0, JSON.stringify(validation.issues));
  assert.equal(form.pages[0].name, 'Accueil', 'two entities share a home page');
  buttonsReach(form);
  assert.ok(flowOf(form, 'save_client').elements[0].actions['lib_BaseRow.forms_AddRow'], 'the first table keeps forms_AddRow');
  const action = flowOf(form, 'save_contact').elements[0].actions['lib_BaseRow.forms_AddRowFromData'];
  assert.ok(action, 'the second table writes its columns explicitly');
  const values = Object.fromEntries(action.vars.forms_freeVars.map(entry => [entry.name, entry.str]));
  assert.deepEqual(Object.keys(values), ['Nom', 'Client', 'Actif']);
  assert.equal(refTarget(values.Nom), byName(form, 'contact_nom').id);
  assert.equal(refTarget(values.Client), byName(form, 'Client').id, 'a name nobody took stays the column name');
  const link = byName(form, 'Client').sources['lib_BaseRow.formssource_GetSelectData'].vars;
  assert.deepEqual(JSON.parse(link.forms_config.str).table_id_int, 40);
  assert.equal(JSON.parse(link.forms_config.str).displayValue, 'Nom', 'a link lists the rows of its table by their primary field');
  assert.equal(JSON.parse(link.forms_config.str).value, 'id', 'and writes the linked row id, not its primary text');
  assert.deepEqual(JSON.parse(link.forms_config.str).columns, ['Nom', 'id']);
  // An existing boolean is entered with a Oui/Non radio, no answer chosen in advance, and written true/false by a hidden
  // field of the column's name (test-nocode S4: the agent added a checkbox of its own when the tool left it out; a
  // static radio shows the value it submits and Baserow refuses Oui).
  const choice = byName(form, 'Actif_choice');
  assert.equal(choice.type, 'radio');
  assert.deepEqual(choice.children.map(c => [c.value, c.selected]), [['Oui', false], ['Non', false]]);
  const written = byName(form, 'Actif');
  assert.equal(written.type, 'text');
  assert.equal(written.conditions.visibleIf.conds.length > 0 || written.conditions.visibleIf.groups.length > 0, true, 'hidden');
  assert.equal(evaluateDefault(written, { fields: { Actif_choice: 'Oui' } }), 'true');
  assert.equal(evaluateDefault(written, { fields: { Actif_choice: 'Non' } }), 'false');
  assert.equal(evaluateDefault(written, { fields: {} }), 'false', 'unanswered is false, not an empty value Baserow refuses');
  assert.deepEqual(result.validation.warnings || [], [], 'no warning the agent would try to fix');
  assert.equal(result.baserow.tables[1].notEntered, undefined);
});
test('nocode-app-create: French and English labels follow the entity', () => {
  const labels = spec => { const { form } = planApp(spec); return [form.pages.map(p => p.name), flowOf(form, 'save_' + spec.entities[0].name).elements[1].sources.self.vars.selfVar.str]; };
  assert.deepEqual(labels({ name: 'A', entities: [{ name: 'article', table: 5277, screens: { list: true, form: true } }] }), [['Articles', 'Nouvel article'], 'Article enregistré']);
  assert.deepEqual(labels({ name: 'A', entities: [{ name: 'demande', feminine: true, table: 5277, screens: { list: true, form: true } }] }), [['Demandes', 'Nouvelle demande'], 'Demande enregistrée']);
  assert.deepEqual(labels({ name: 'A', language: 'en', entities: [{ name: 'request', table: 5277, screens: { list: true, form: true } }] }), [['Requests', 'New request'], 'Request saved']);
});
test('nocode-app-create: a spec it cannot build is refused with the path and the way out, before anything is read or written', () => {
  const refused = (spec, path, pattern) => {
    const { result, calls } = planApp(spec);
    assert.equal(result.status, 'invalid_spec', JSON.stringify(result));
    assert.equal(result.error.path, path);
    assert.match(result.error.message, pattern);
    return calls;
  };
  const one = screens => ({ name: 'A', entities: [{ name: 'ticket', table: 5277, screens }] });
  assert.deepEqual(refused(one({ detail: true }), 'entities[0].screens.detail', /ask for the list too/), []);
  refused(one({ list: { filters: ['Titre'] } }), 'entities[0].screens.list.filters', /single select/);
  refused(one({ list: { columns: ['Nom'] } }), 'entities[0].screens.list.columns', /no column Nom \(its columns: Titre, Description/);
  refused(one({ list: true, dashboard: { groupBy: 'Statut', aggregations: ['sum:Titre'] } }), 'entities[0].screens.dashboard.aggregations', /needs a number column/);
  refused({ name: 'A', entities: [{ name: 'ticket', fields: [{ name: 'Montant', type: 'number' }] }] }, 'entities[0].fields', /needs a text field/);
  refused({ name: 'A', entities: [{ name: 'ticket', table: 999 }] }, 'entities[0].table', /not in the Baserow catalog/);
});
// A nested component took the first page (Accueil) whatever its container: the viewer loaded its sources there.
function nestedPagesForm() {
  return { name: 'Nested pages', pages: [
    { name: 'Accueil', fields: [{ type: 'text', name: 'welcome' }] },
    { name: 'Fiche', fields: [{ type: 'layout', name: 'record', fields: [{ type: 'layout', name: 'inner', fields: [{ type: 'text', name: 'reference' }] }] }] }
  ] };
}
test('add_field into a container takes the page of its root container, whatever page is given', () => {
  const h = creationHarness();
  const created = h.client.create(nestedPagesForm(), h.auth);
  const id = created.form._id;
  const fiche = created.form.pages[1].pageTechName;
  // A numeric id, as C8Oforms stores them, given as a string.
  const inner = byName(created.form, 'inner');
  inner.id = Number(inner.id);
  h.state.forms[id].formulaire.find(item => item.name === 'inner').id = inner.id;
  h.state.forms[id].formulaire.find(item => item.name === 'reference').parentRef = inner.id;
  h.state.forms[id].formulaire.find(item => item.name === 'record').childrenRefs = [inner.id];
  const added = h.client.edit(id, [
    { action: 'add_field', parentFieldId: String(inner.id), fieldObject: { type: 'layout', name: 'nested', fields: [{ type: 'text', name: 'status' }] } },
    { action: 'add_component', parentId: byName(created.form, 'record').id, pageName: 'Accueil', fieldObject: { type: 'text', name: 'owner' } }
  ], h.auth);
  assert.equal(added.saved, true);
  ['nested', 'status', 'owner'].forEach(name => assert.equal(byName(added.form, name).config.page, fiche, name));
  assert.equal(added.operations[0].pageTechName, fiche);
  assert.equal(added.operations[0].note, undefined);
  assert.match(added.operations[1].note, /ignored.*root container/);
  assert.ok(!added.validation.warnings.some(w => w.code === 'nested_page_mismatch'));
});
// Skyjo (26/10): add_field wrote its parentFieldId argument as parentRef, the text "1793012950260" under a layout whose
// id is a number; the editor, comparing with ===, showed the button twice. A reference takes the type of the id it names.
test('add_field, update and create write parentRef and childrenRefs with the type of the ids they name', () => {
  const h = creationHarness();
  const created = h.client.create(nestedPagesForm(), h.auth);
  const id = created.form._id;
  const record = byName(created.form, 'record');
  assert.equal(typeof record.id, 'number');
  const added = h.client.edit(id, [
    { action: 'add_field', parentFieldId: String(record.id), fieldObject: { type: 'button', name: 'delete', label: 'Supprimer', flow: 'delete' } },
    { action: 'add_field', parent: 'record', fieldObject: { type: 'text', name: 'by_name' } }
  ], h.auth);
  assert.equal(added.saved, true, JSON.stringify(added.validation || added.error));
  const saved = h.state.forms[id].formulaire;
  for (const name of ['delete', 'by_name']) {
    const child = saved.find(item => item.name === name);
    assert.strictEqual(child.parentRef, record.id, name + ': the parent id itself, not the argument');
    assert.ok(saved.find(item => item.name === 'record').childrenRefs.includes(child.id));
  }
  // A full array sent by update with text references is saved with the ids' type.
  const patched = clone(h.state.forms[id].formulaire);
  patched.find(item => item.name === 'delete').parentRef = String(record.id);
  const holder = patched.find(item => item.name === 'record');
  holder.childrenRefs = holder.childrenRefs.map(String);
  assert.ok(api().validate({ ...clone(h.state.forms[id]), formulaire: patched }).validation.issues.some(i => i.code === 'relation_ref_type'));
  const updated = h.client.update(id, { formulaire: patched }, h.auth);
  assert.equal(updated.saved, true, JSON.stringify(updated.validation));
  const after = h.state.forms[id].formulaire;
  assert.strictEqual(after.find(item => item.name === 'delete').parentRef, record.id);
  assert.ok(after.find(item => item.name === 'record').childrenRefs.every(ref => typeof ref === 'number'));
  // An id given as digits in reduced JSON is the number the editor writes.
  const digits = api().compile({ name: 'Digits', pages: [{ name: 'P', fields: [{ type: 'layout', name: 'row', id: '1900000000301', fields: [{ type: 'text', name: 'inside', id: '1900000000302' }] }] }] });
  assert.equal(digits.status, 'ok', JSON.stringify(digits.validation.issues));
  assert.strictEqual(byName(digits.form, 'row').id, 1900000000301);
  assert.strictEqual(byName(digits.form, 'inside').parentRef, 1900000000301);
  assert.deepEqual(clone(byName(digits.form, 'row').childrenRefs), [1900000000302]);
});
test('move_field gives the moved component and its descendants the page of their new root container', () => {
  const h = creationHarness();
  const created = h.client.create(nestedPagesForm(), h.auth);
  const id = created.form._id;
  const [accueil, fiche] = created.form.pages.map(page => page.pageTechName);
  const into = h.client.edit(id, [{ action: 'move_field', fieldName: 'welcome', parentFieldId: String(byName(created.form, 'inner').id) }], h.auth);
  assert.equal(byName(into.form, 'welcome').config.page, fiche);
  const out = h.client.edit(id, [{ action: 'move_field', fieldName: 'inner', pageName: 'Accueil' }], h.auth);
  ['inner', 'reference', 'welcome'].forEach(name => assert.equal(byName(out.form, name).config.page, accueil, name));
  assert.equal(byName(out.form, 'inner').parentRef, undefined);
  const back = h.client.edit(id, [{ action: 'move_field', fieldName: 'inner', parentFieldId: String(byName(out.form, 'record').id), pageName: 'Accueil' }], h.auth);
  ['inner', 'reference', 'welcome'].forEach(name => assert.equal(byName(back.form, name).config.page, fiche, name));
  assert.match(back.operations[0].note, /ignored/);
  // Taken out of its container with no page, a component stays where it was shown.
  const unnested = h.client.edit(id, [{ action: 'move_field', fieldName: 'reference' }], h.auth);
  assert.equal(byName(unnested.form, 'reference').config.page, fiche);
  assert.equal(byName(unnested.form, 'reference').parentRef, undefined);
});
// A top-level index counts the components of the target page, not the whole formulaire (usage tests, 29/10: index 2
// meant the third place on the page and the component landed first); before/after place a component next to another.
function placementForm() {
  const text = name => ({ type: 'text', name, label: name });
  return { name: 'Placement', navigationMode: 'custom', pages: [
    { name: 'Une', fields: [text('a1'), text('a2'), text('a3'), { type: 'layout', name: 'box', fields: [text('x'), text('y')] }] },
    { name: 'Deux', fields: [text('b1'), text('b2'), text('b3')] }
  ] };
}
test('add_field and move_field place a top-level component by its place on the page, or before/after another one', () => {
  const h = creationHarness();
  const created = h.client.create(placementForm(), h.auth);
  const id = created.form._id;
  const order = (form, page) => {
    const tech = form.pages.find(p => p.name === page).pageTechName;
    return clone(form.formulaire.filter(item => item.config && item.config.page === tech && item.parentRef == null).map(item => item.name));
  };
  const kids = (form, name) => clone(byName(form, name).childrenRefs.map(ref => form.formulaire.find(item => String(item.id) === String(ref)).name));
  let r = h.client.edit(id, [{ action: 'move_field', fieldName: 'b3', pageName: 'Deux', index: 1 }], h.auth);
  assert.equal(r.saved, true, JSON.stringify(r.validation || r.error));
  assert.deepEqual(order(r.form, 'Deux'), ['b1', 'b3', 'b2'], 'index 1 is the second place on page Deux');
  // A position in the whole form, as agents counted before 0.2.29-beta.7 (b2 is the 8th component): refused, nothing saved.
  const saves = h.state.saves;
  const whole = h.client.edit(id, [{ action: 'move_field', fieldName: 'b3', pageName: 'Deux', index: 7 }], h.auth);
  assert.equal(whole.saved, false);
  assert.match(whole.error.message, /^index 7 is past the 2 top-level components of page "Deux" \(b1, b2\): give the place among them from 0 \(2 = after the last\), or before\/after a component$/);
  assert.equal(h.state.saves, saves);
  const added = h.client.edit(id, [{ action: 'add_field', fieldObject: { type: 'text', name: 'b9', label: 'b9' }, pageName: 'Deux', index: 4 }], h.auth);
  assert.match(added.error.message, /^index 4 is past the 3 top-level components of page "Deux"/);
  r = h.client.edit(id, [{ action: 'move_field', fieldName: 'a1', pageName: 'Une', index: 4 }], h.auth);
  assert.deepEqual(order(r.form, 'Une'), ['a2', 'a3', 'box', 'a1'], 'counted with the component that moves, 4 is still the last place');
  assert.deepEqual(clone(r.operations[0].placed), { index: 3, after: 'box', before: null, container: null });
  assert.equal(h.client.edit(id, [{ action: 'move_field', fieldName: 'a1', pageName: 'Une', index: 5 }], h.auth).saved, false);
  r = h.client.edit(id, [{ action: 'move_field', fieldName: 'b1', after: 'b2' }], h.auth);
  assert.deepEqual(order(r.form, 'Deux'), ['b3', 'b2', 'b1']);
  r = h.client.edit(id, [{ action: 'move_field', fieldName: 'a3', before: 'y' }], h.auth);
  assert.deepEqual(kids(r.form, 'box'), ['x', 'a3', 'y'], 'before a child: into its container at its place');
  assert.deepEqual(clone(r.operations[0].placed), { index: 1, after: 'x', before: 'y', container: 'box' });
  assert.equal(byName(r.form, 'a3').parentRef, byName(r.form, 'box').id);
  r = h.client.edit(id, [{ action: 'add_field', fieldObject: { type: 'text', name: 'b0', label: 'b0' }, pageName: 'Deux', index: 0 }], h.auth);
  assert.deepEqual(order(r.form, 'Deux'), ['b0', 'b3', 'b2', 'b1']);
  r = h.client.edit(id, [{ action: 'add_field', fieldObject: { type: 'text', name: 'a9', label: 'a9' }, after: 'a2' }], h.auth);
  assert.deepEqual(order(r.form, 'Une'), ['a2', 'a9', 'box', 'a1']);
  assert.equal(byName(r.form, 'a9').config.page, r.form.pages[0].pageTechName, 'the page of the anchor');
  const unknown = h.client.edit(id, [{ action: 'move_field', fieldName: 'a2', before: 'nothing' }], h.auth);
  assert.equal(unknown.saved, false);
  assert.match(JSON.stringify(unknown.error || unknown.validation), /before names no component of the form: nothing/);
});
test('an edit with no operation and an update with an empty patch save nothing', () => {
  const h = creationHarness();
  const id = h.client.create(placementForm(), h.auth).form._id;
  const saves = h.state.saves;
  const rev = h.state.forms[id]._rev;
  [[h.client.edit(id, [], h.auth), 'no_operations'], [h.client.edit(id, null, h.auth), 'no_operations'], [h.client.update(id, {}, h.auth), 'empty_patch']].forEach(([r, code]) => {
    assert.equal(r.saved, false);
    assert.equal(r.error.code, code);
    assert.match(r.error.message, /: nothing was saved\. Read a form with nocode-form-get$/);
  });
  assert.equal(h.state.saves, saves);
  assert.equal(h.state.forms[id]._rev, rev);
  assert.equal(h.client.edit(id, [{ action: 'move_field', fieldName: 'a1', pageName: 'Une', index: 1 }], h.auth).saved, true);
});

// 19/11: the answers of create and edit list what was read with its only meaning (repairs): the JSON text of the
// argument (a brace too many), then what the C8Oforms contract compiled another way (a number type, a page named in
// another case). The saved form is the repaired one, the call is not refused.
test('nocode-form-create and nocode-form-edit answer the repairs of the JSON text and of the contract', () => {
  const h = creationHarness();
  const text = '{"name":"Repairs","navigationMode":"custom","pages":[{"name":"Accueil","fields":[{"type":"button","name":"go","label":"Go","flow":"go"}]},' +
    '{"name":"Détails","fields":[{"type":"number","name":"amount","label":"Amount"}}]}],"flows":[{"id":"go","name":"Go","elements":[{"type":"push_page","targetPage":"details"}]}]}';
  // one brace too many after the last field
  const reduced = h.client.parseObject(text, 'reduced', {});
  const created = h.client.create(reduced, h.auth);
  assert.equal(created.saved, true, JSON.stringify(created.error || created.validation));
  assert.deepEqual(clone(created.repairs.map(repair => repair.code)), ['json_text_repaired', 'component_type_alias', 'page_name_matched']);
  assert.equal(created.repairs[1].from, 'number');
  assert.equal(created.repairs[2].to, 'Détails');
  const saved = h.state.forms[created.form._id];
  assert.equal(saved.formulaire.find(item => item.name === 'amount').config.type, 'number');
  assert.equal(saved.flows.find(flow => flow.id === 'go').elements[0].config.targetPage, saved.pages.find(page => page.name === 'Détails').pageTechName);
  const operations = h.client.parseOperations('[{"action":"add_field","pageName":"Détails","fieldObject":{"type":"textarea","name":"notes","label":"Notes"},},]', 'operations', []);
  const edited = h.client.edit(created.form._id, operations, h.auth);
  assert.equal(edited.saved, true, JSON.stringify(edited.error || edited.validation));
  assert.deepEqual(clone(edited.repairs.map(repair => [repair.code, repair.from || ''])), [['json_text_repaired', ''], ['component_type_alias', 'textarea']]);
  assert.equal(h.state.forms[created.form._id].formulaire.find(item => item.name === 'notes').config.short, false);
});

test('nocode-form-compile of a reduced form without slip answers no repairs', () => {
  const r = api().compile({ name: 'Plain', pages: [{ name: 'A', fields: [{ type: 'text', name: 'a', label: 'A' }] }] });
  assert.equal(r.status, 'ok');
  assert.equal(r.repairs, undefined);
});

test('a form too large to answer whole: an edit answers its id, revision, name and an outline, and still saves', () => {
  // test-nocode 23/11, the 5.6 MB application of the Pilotage KPI import: each edit answered nearly 3 million characters,
  // cut to its first 14,000 for the agent and too large to keep in pages.
  const h = creationHarness();
  const created = h.client.create({ name: 'Pilotage', pages: [{ name: 'Accueil', fields: [{ type: 'text', name: 'kpi', label: 'KPI' }] }, { name: 'Saisie', fields: [{ type: 'text', name: 'valeur', label: 'Valeur' }] }] }, h.auth);
  assert.equal(created.saved, true);
  assert.ok(Array.isArray(created.form.formulaire), 'a small form is answered whole');
  assert.equal(created.formOmitted, undefined);
  const id = created.form._id;
  const big = h.state.forms[id].formulaire.find(f => f.name === 'kpi');
  big.config.placeholder = 'x'.repeat(api().AGENT_FORM_MAX_CHARS + 1000);
  const edited = h.client.edit(id, [{ action: 'update_field', fieldName: 'valeur', patch: { label: 'Valeur relevée' } }], h.auth);
  assert.equal(edited.saved, true, JSON.stringify(edited.error || edited.validation));
  assert.deepEqual(Object.keys(edited.form).sort(), ['_id', '_rev', 'name']);
  assert.deepEqual([edited.id, edited.form._id, edited.form._rev, edited.form.name], [id, id, edited.rev, 'Pilotage']);
  assert.ok(edited.formOmitted.chars > api().AGENT_FORM_MAX_CHARS);
  assert.equal(edited.formOmitted.components, h.state.forms[id].formulaire.length);
  assert.deepEqual(clone(edited.formOmitted.pages), clone(h.state.forms[id].pages.map(p => p.name)));
  assert.deepEqual(clone(edited.formOmitted.pages), ['Accueil', 'Saisie']);
  assert.match(edited.formOmitted.read, /nocode-form-get component, page or flow \(a name or an id\), or find/);
  assert.ok(JSON.stringify(edited).length < 5000, 'the answer stays small');
  const saved = h.state.forms[id].formulaire.find(f => f.name === 'valeur');
  assert.match(JSON.stringify(saved.config), /Valeur relevée/);
});
