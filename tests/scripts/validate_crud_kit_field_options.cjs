const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Every S1 run (add a Priorité field: basse, normale or haute, normale by default) ended with the agent turning the
// kit's text input into a select and setting the form draft by hand (usage tests 29/10). ui.fieldOptions gives a
// field its fixed values (a select), and the create form starts from ui.fieldDefaults or the column default.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function load() {
  const context = { C8O: {} };
  vm.createContext(context);
  vm.runInContext(read('js/crud_spec.js'), context);
  vm.runInContext(read('js/crud_ui_meta.js'), context);
  return context.C8O;
}

const normalizedIdentifier = v => String(v || '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9_]/g, '_').toLowerCase();
const ctx = {
  trimmed: v => String(v == null ? '' : v).trim(),
  clone: v => JSON.parse(JSON.stringify(v)),
  ensureArray: v => (Array.isArray(v) ? v : v == null ? [] : [v]),
  pascalize: v => String(v).replace(/(^|_)([a-z])/g, (_m, _s, c) => c.toUpperCase()),
  pluralize: v => v,
  normalizedIdentifier,
  semanticFieldToken: v => normalizedIdentifier(v),
  tokenMatches: () => false,
  findEntityByName: (entities, name) => (entities || []).find(e => e.name === name) || null,
  preferredRelationLabelField: () => ({ column: 'nom' }),
  facadeSequenceQName: (project, prefix, entity, op) => project + '.' + prefix + '_' + op + '_' + entity.name,
};

const field = (column, extra) => Object.assign({ name: column, column, label: column, type: 'VARCHAR(255)', primary: false }, extra);

test('fixed values make a select and a default seeds the create form', () => {
  const C8O = load();
  const ui = C8O.crudSpec.normalizeEntityUi(ctx, {
    fieldOptions: { Priorite: ['basse', { value: 'normale', label: 'Normale' }, { value: 'haute' }], ghost: ['x'] },
    fieldDefaults: { priorite: 'normale' },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(ui.fieldOptions.priorite)),
    [{ value: 'basse', label: 'basse' }, { value: 'normale', label: 'Normale' }, { value: 'haute', label: 'haute' }]);
  const entity = { name: 'interventions', singular: 'intervention', label: 'Interventions', ui,
    fields: [field('id', { primary: true, type: 'INT' }), field('titre'), field('priorite'), field('montant', { defaultValue: 0 })] };
  const config = JSON.parse(JSON.stringify(C8O.crudUiMeta.entityUiConfig(ctx, 'Demo', 'crud', entity, [entity])));
  const byColumn = Object.fromEntries(config.editableFields.map(f => [f.column, f]));
  assert.equal(byColumn.priorite.options.length, 3);
  assert.equal(byColumn.priorite.defaultValue, 'normale', 'ui.fieldDefaults');
  assert.equal(byColumn.montant.defaultValue, '0', 'the column default the kit read');
  assert.equal(byColumn.titre.options, null);
  assert.equal(byColumn.titre.defaultValue, null);
  assert.deepEqual(config.unknownFieldRefs, ['ghost'], 'options for a field the entity lacks are reported');
});

test('the form builder, the draft and the bindings use the options and the defaults', () => {
  const templates = read('js/crud_ui_templates.js');
  assert.match(templates, /: \(currentConfig\.options \? optionSelectNode\(ctx, currentConfig\) : textInputNode\(ctx, currentConfig\)\)/);
  assert.match(templates, /entries\.push\(ctx\.scriptLiteral\(column\) \+ ": " \+ ctx\.scriptLiteral\(draftDefault\)\);/);
  assert.match(templates, /name: "OptionSelect"/);
  const kit = read('js/crud_ui_kit.js');
  assert.match(kit, /\(field\.relation \? "RelationSelect" : \(field\.options && field\.options\.length \? "OptionSelect" : "Input"\)\)/);
  assert.match(kit, /C8O\.crudUiKit\.applyColumnDefaults\(ctx, projectName, hydrated\);/);
});

// actionLabel "Nouveau chantier" made the save button read as the button that opens a new record: a verifier clicked it to
// open the form and saved an empty row (usage tests 29/10, S5 replay).
test('a save label that reads as opening a new record is reported, and the input schema says what actionLabel labels', () => {
  const kit = read('js/crud_ui_kit.js');
  assert.match(kit, /\/\^\(nouveau\|nouvelle\|nouvel\|new\|add\|ajouter\|cr\[ée\]er\)\\b\/i\.test\(saveLabel\)/);
  const pattern = /^(nouveau|nouvelle|nouvel|new|add|ajouter|cr[ée]er)\b/i;
  assert.ok(pattern.test('Nouveau chantier') && pattern.test('New invoice') && pattern.test('Créer'));
  assert.ok(!pattern.test('Enregistrer') && !pattern.test('Save intervention'));
  assert.match(read('js/schema_overrides_crud.js'), /ui\.actionLabel is the label of the edit form's save button/);
});

// "Enregistrer l'intervention" as actionLabel broke the page build: the label lands in a single-quoted script literal
// (usage tests 29/10, S1 replay); the agent chose a label without apostrophe.
test('labels that land in script literals keep their apostrophes', () => {
  const context = { C8O: {} };
  vm.createContext(context);
  vm.runInContext(read('js/crud_ui_templates.js'), context);
  const ctx2 = { trimmed: v => String(v == null ? '' : v).trim(), pluralize: v => v,
    entityUiConfig: () => ({ actionLabel: "Enregistrer l'intervention" }), firstNonPrimaryField: () => null, secondPreviewField: () => null };
  const map = context.C8O.crudUiTemplates.placeholderMap(ctx2, 'App', 'crud', { name: 'interventions', label: "Pièces d'origine", singular: 'intervention' }, []);
  assert.equal(eval("'" + map.__ACTION_LABEL__ + "'"), "Enregistrer l'intervention");
  assert.equal(eval("'" + map.__DISPLAY_LABEL__ + "'"), "Pièces d'origine");
});
