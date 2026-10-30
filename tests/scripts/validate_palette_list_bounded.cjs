// palette-list grew with the shared components and actions of the loaded projects: 33 051 characters with one app loaded,
// 83 650 with C8Oforms, over the 30 000 an agent's client takes. The answer now stays under a budget whatever the
// workspace holds: whole categories are left out (shared ones first, largest first) and named with how to list them, and
// a category too large by itself is cut to its first entries.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function palette() {
  const sandbox = { include() {}, JSON, Packages: {} };
  vm.createContext(sandbox);
  vm.runInContext(read('js/palette.js'), sandbox, { filename: 'palette.js' });
  return sandbox.C8O.palette;
}

const entry = (category, i, builtin) => ({
  name: category + ' ' + i,
  className: builtin ? 'ngx.components.UIDynamicElement#' + category + i : 'ngx.components.UIUseShared#' + category + '.Application.NgxApp.Component' + i,
  shortDescription: builtin ? 'ion-' + category.toLowerCase() : 'Shared component ' + i + ' of ' + category,
  nameSuggestion: '', propertyCount: 12, builtin, id: 'x', classFqcn: 'com.twinsoft.Some', description: 'long description '.repeat(20)
});
const category = (name, count, builtin) => ({ name, type: 'Category', items: Array.from({ length: count }, (_, i) => entry(name, i, builtin)) });
// What the answer prints for the categories (the fields of each item), as the contract battery measures it.
const printed = cats => JSON.stringify(cats.map(c => ({ name: c.name, items: c.items.map(it => ({ name: it.name, className: it.className,
  shortDescription: it.shortDescription, nameSuggestion: it.nameSuggestion, propertyCount: it.propertyCount })) }))).length;

function workspace(sharedProjects, perProject) {
  const builtIn = ['Buttons', 'Cards', 'Containers', 'Forms', 'HTML', 'Lists', 'Menus'].map(n => category(n, 15, true));
  const shared = Array.from({ length: sharedProjects }, (_, p) => category('lib_Shared' + p, perProject, false));
  return builtIn.concat(shared);
}

test('a small palette is answered whole, unchanged', () => {
  const P = palette();
  const cats = workspace(1, 4);
  const r = P.boundCategories(cats);
  assert.equal(r.categories.length, cats.length);
  assert.equal(r.omittedCount, 0);
  assert.equal(r.omittedText, '');
});

test('many shared components keep the answer under the budget and say how to list the rest', () => {
  const P = palette();
  for (const [projects, per] of [[8, 40], [30, 25], [3, 300]]) {
    const cats = workspace(projects, per);
    assert.ok(printed(cats) > 30000, 'the unbounded answer is over the cap: ' + printed(cats));
    const r = P.boundCategories(cats);
    assert.ok(printed(r.categories) <= P.LIST_BUDGET, projects + 'x' + per + ': ' + printed(r.categories));
    assert.ok(printed(r.categories) + r.omittedText.length < 30000);
    assert.ok(r.omittedCount > 0);
    assert.match(r.omittedText, /^This answer is kept short\. /);
    // Built-in entries stay listed: shared categories leave first.
    for (const name of ['Buttons', 'Forms', 'Lists']) {
      assert.ok(r.categories.some(c => c.name === name), name + ' listed with ' + projects + 'x' + per);
    }
  }
});

test('a left-out category is named with its count and the filter that lists it', () => {
  const P = palette();
  const r = P.boundCategories(workspace(8, 40));
  assert.ok(r.omitted.length > 0 && r.omitted.every(o => o.shared));
  const first = r.omitted[0];
  assert.match(r.omittedText, new RegExp(first.name + ' \\(40, shared\\)'));
  assert.match(r.omittedText, new RegExp('filter set to its name \\(filter: "' + first.name + '"\\)'));
  assert.match(r.omittedText, /a shared category holds the shared components and actions of a loaded project/);
  assert.equal(r.omittedCount, r.omitted.reduce((s, o) => s + o.count, 0));
});

test('a category too large by itself is cut to its first entries, so a filter on its name still answers', () => {
  const P = palette();
  const r = P.boundCategories([category('lib_Huge', 600, false)]);
  assert.equal(r.categories.length, 1);
  const listed = r.categories[0].items.length;
  assert.ok(listed > 10 && listed < 600, 'listed ' + listed);
  assert.equal(r.categories[0].items[0].name, 'lib_Huge 0');
  assert.ok(printed(r.categories) <= P.LIST_BUDGET);
  assert.match(r.omittedText, new RegExp('lib_Huge: ' + listed + ' of 600 listed\\. Narrow with a filter on the entry name'));
  assert.equal(r.omittedCount, 600 - listed);
});

test('palette-list bounds its answer and prints the left-out line in hints.omitted', () => {
  const yaml = read('_c8oProject/sequences/tools_palette_list.yaml');
  assert.match(yaml, /↓BoundAnswer \[steps\.SimpleStep-\d+\]: \n/);
  assert.match(yaml, /var bounded = C8O\.palette\.boundCategories\(paletteCategories, C8O\.palette\.LIST_BUDGET\);/);
  assert.match(yaml, /resultInfo\.returned = Math\.max\(0, paletteItemCount - bounded\.omittedCount\);/);
  assert.match(yaml, /↓OmittedIf \[steps\.IfStep-\d+\]: \n {6}condition: notEmpty\(resultInfo && resultInfo\.omittedText\)\n {6}↓Omitted \[steps\.JsonFieldStep-\d+\]: \n {8}key: \n/);
  assert.ok(yaml.indexOf('↓BoundAnswer') > yaml.indexOf('↓Finalize') && yaml.indexOf('↓BoundAnswer') < yaml.indexOf('↓BuildResult'));
});
