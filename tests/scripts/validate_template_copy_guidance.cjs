// Run: node --test tests/scripts/validate_template_copy_guidance.cjs
// A page whose model or template a skill or the project names starts as a copy of that model, filled in its content zone
// only. A measured run (17/11) found the model in a referenced project, then rebuilt the page "following its structure",
// dropped its banner, content zone and footer, and called it compliant; a text-review finding about the app's language
// also had a title the user gave translated. These texts are what the agent reads at the moment it chooses.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('the models drawer: copy the named model, never ngx-page-create, content zone only, compare before reporting', () => {
  const guide = read('resources/guides/common/models.md');
  assert.match(guide, /`databaseobject-copy` from the project that holds it, a referenced project or library included\. Never `ngx-page-create` for such a page/);
  assert.match(guide, /A model that cannot be found stops the work: say so, and generate nothing in its place\./);
  assert.match(guide, /Fill only the model's content zone[^]*Never delete, move or restyle its other zones/);
  assert.match(guide, /Before reporting, compare the page with its model/);
  assert.match(guide, /A text the user gave \(a title, a label, a button text\) is written as given/);
  assert.match(read('resources/convertigo_common_skill.md'), /`databaseobject-copy` it, fill only its content zone, never `ngx-page-create`/);
});

test('ngx-page-create sends a page with a named model to databaseobject-copy', () => {
  assert.match(read('_c8oProject/sequences/tools_ngx_page_create.yaml'),
    /When a skill or the project names a model page or a template for this kind of page, do not use this tool, which generates its own structure: copy the model with databaseobject-copy and fill its content zone\./);
  assert.match(read('resources/guides/multipage/ngx-pages.md'), /never an `ngx-page-create` page/);
});

test('a language finding of the text review never asks to translate a text the user gave', () => {
  assert.match(read('js/tools_project_lint.js'),
    /str\(kind\)\.toLowerCase\(\) === "language"\s*\? "If the user gave this text as it is \(a title, a label\), keep it and tell the user; otherwise write \\""/);
});

test('a copied page says which default route and title the engine gave it', () => {
  assert.match(read('js/tools_databaseobject_copy.js'), /The copied page has the default route segment/);
});
