const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A status filter and a title search on a kit list were built by editing the managed list panel by hand, which a later
// kit run overwrites (usage tests 29/10, S3 twice). ui.listFilters gives the panel its filters: the controls above the
// list, and the list showing the loaded rows that pass them.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = v => JSON.parse(JSON.stringify(v));

function load() {
  const context = { C8O: {} };
  vm.createContext(context);
  for (const file of ['js/crud_ui_nodes.js', 'js/crud_spec.js', 'js/crud_ui_meta.js', 'js/crud_ui_templates.js']) {
    vm.runInContext(read(file), context);
  }
  return context.C8O;
}

const normalizedIdentifier = v => String(v || '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9_]/g, '_').toLowerCase();
const ctx = {
  trimmed: v => String(v == null ? '' : v).trim(), clone: v => JSON.parse(JSON.stringify(v)),
  ensureArray: v => (Array.isArray(v) ? v : v == null ? [] : [v]), pascalize: v => String(v), pluralize: v => v,
  normalizedIdentifier, semanticFieldToken: v => normalizedIdentifier(v), tokenMatches: () => false,
  findEntityByName: () => null, preferredRelationLabelField: () => null,
  facadeSequenceQName: (p, x, e, op) => p + '.' + x + '_' + op + '_' + e.name,
};
const field = (column, extra) => Object.assign({ name: column, column, label: column, type: 'VARCHAR(255)', primary: false }, extra);

test('list filters are resolved: options from the hint or the field options, unknown fields reported', () => {
  const C8O = load();
  const ui = C8O.crudSpec.normalizeEntityUi(ctx, { fieldOptions: { statut: ['open', 'done'] },
    listFilters: [{ field: 'statut' }, { search: ['titre', 'code'], label: 'Search' }, { field: 'ghost' }, { field: 'note' }] });
  const entity = { name: 'tasks', singular: 'task', label: 'Tasks', ui, fields: [field('id', { primary: true }), field('titre'), field('code'), field('statut'), field('note')] };
  const config = plain(C8O.crudUiMeta.entityUiConfig(ctx, 'App', 'crud', entity, [entity]));
  assert.deepEqual(config.listFilters.map(f => [f.kind, f.column || f.columns]), [['select', 'statut'], ['search', ['titre', 'code']], ['text', 'note']]);
  assert.deepEqual(config.listFilters[0].options.map(o => o.value), ['open', 'done']);
  assert.deepEqual(config.unknownFieldRefs, ['ghost']);
});

test('the list panel gets the controls, sets the visible rows wherever it sets the rows, and lists them', () => {
  const C8O = load();
  const src = read('js/crud_ui_templates.js');
  assert.match(src, /applyListFilters\(ctx, tree, ensureArray\(ctx, config && config\.listFilters\)\);/);
  assert.match(src, /var visible = "\(this\.local\?\.rows \|\| \[\]\)\.filter\(\(row: any\) => " \+ conditions\.join\(" && "\) \+ "\)";/);
  assert.match(src, /parsed\.model\.path = "\?\.visibleRows";/);
  assert.match(src, /U\.setLocalActionNode\(nctx, "StoreFilter", local, "event\?\.detail\?\.value \?\? ''"\)/);
  assert.match(src, /eventName: "ionChange"/);
  assert.match(src, /eventName: "ionInput"/);
  assert.match(src, /"ngx\.components\.UIDynamicElement#DivTag", name: "Filters"/);
  // The filter expression, run on rows as the component would.
  const conditions = "(!this.local?.filter0 || String(row?.statut ?? '') === String(this.local.filter0)) && (!this.local?.filter1 || ['titre'].some((c) => String(row?.[c] ?? '').toLowerCase().indexOf(String(this.local.filter1).toLowerCase()) >= 0))";
  const run = local => new Function('return (this.local?.rows || []).filter((row) => ' + conditions + ');').call({ local });
  const rows = [{ titre: 'Four', statut: 'open' }, { titre: 'Roof', statut: 'done' }];
  assert.equal(run({ rows }).length, 2);
  assert.equal(run({ rows, filter0: 'done' }).length, 1);
  assert.equal(run({ rows, filter1: 'FOU' })[0].titre, 'Four');
});

// r31 (S3 replay): a given empty option made a second "all" choice, and the empty state threw before the first rows.
test('an empty option names the all choice once, and the empty state reads the visible rows safely', () => {
  const src = read('js/crud_ui_templates.js');
  assert.match(src, /var allOption = ensureArray\(ctx, filter\.options\)\.filter\(function \(option\) \{ return String\(option\.value\) === ""; \}\)\[0\];/);
  assert.match(src, /\}\]\.concat\(valueOptions\.map\(/);
  assert.match(src, /parsed\.model\.suffix = "\?" \+ parsed\.model\.suffix;/);
});
