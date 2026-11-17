// Run: node --test tests/scripts/validate_databaseobject_copy.cjs
// databaseobject-copy (js/tools_databaseobject_copy.js) copies an object and its children through the engine's own
// serialization, the one the Studio's copy and paste uses. What is checked here without an engine: the priorities of the
// copied objects and the references to them inside the copy are renewed as whole numbers only, the references to the
// source project are counted and, on request, pointed at the target project, and the references the copy keeps to objects
// outside it are found. The engine path (toXml, read, add) is checked live in a Studio before a release.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function load() {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(read('js/tools_databaseobject_copy.js'), sandbox, { filename: 'js/tools_databaseobject_copy.js' });
  return sandbox.C8O.dboCopy;
}

const XML = `<convertigo beans="8.4.0">
<sequence classname="com.twinsoft.convertigo.beans.sequences.GenericSequence" name="Model" priority="1794587262700">
<step classname="com.twinsoft.convertigo.beans.steps.TransactionStep" name="Call" priority="1794587262742">
<property name="sourceTransaction"><java.lang.String value="Lib.db.q_rows"/></property></step>
<step classname="com.twinsoft.convertigo.beans.steps.IteratorStep" name="Rows" priority="1794587262801">
<property name="sourceDefinition"><XMLVector><java.lang.String value="1794587262742"/><java.lang.String value="./document/row"/></XMLVector></property>
<property name="startIndex"><java.lang.String value="0"/></property>
<property name="comment"><java.lang.String value="keeps 17945872627420 and 1794587262 apart; reads 1700000000999 outside"/></property>
</step></sequence></convertigo>`;

test('every copied priority and every reference to it inside the copy is renewed, as whole numbers only', () => {
  const C = load();
  const map = { 1794587262700: '1795000000001', 1794587262742: '1795000000002', 1794587262801: '1795000000003' };
  const { text, replaced } = C.renewPriorities(XML, map);
  assert.equal(replaced, 4);
  assert.match(text, /name="Call" priority="1795000000002"/);
  assert.match(text, /<java\.lang\.String value="1795000000002"\/><java\.lang\.String value="\.\/document\/row"\/>/);
  assert.doesNotMatch(text, /1794587262742"/);
  // a longer number holding a priority, a shorter one and small values are values, never references
  assert.match(text, /17945872627420 and 1794587262 apart/);
  assert.match(text, /startIndex"><java\.lang\.String value="0"/);
});

test('references to the source project are counted, and pointed at the target project only on request', () => {
  const C = load();
  const kept = C.retargetProject(XML, 'Lib', 'App', false);
  assert.equal(kept.count, 1);
  assert.equal(kept.text, XML);
  const moved = C.retargetProject(XML, 'Lib', 'App', true);
  assert.equal(moved.count, 1);
  assert.match(moved.text, /value="App\.db\.q_rows"/);
  // a name that only ends with the project name, or the project name without a dot, is not a reference
  assert.equal(C.retargetProject('MyLib.db.x Lib Lib_2.y', 'Lib', 'App', true).count, 0);
});

test('the references the copy keeps to objects outside it are found by their priorities', () => {
  const C = load();
  const outside = { 1700000000999: 'Lib.sq:Other.st:Count', 1700000000555: 'Lib.sq:Other.st:Unused' };
  assert.deepEqual(JSON.parse(JSON.stringify(C.outsideReferences(XML, outside))), { 1700000000999: 'Lib.sq:Other.st:Count' });
});

test('the tool is listed, typed, confirmed as a write, refused in the yaml profile and allowed in Vibe', () => {
  assert.match(read('c8oProject.yaml'), /↓tools_databaseobject_copy \[sequences\.GenericSequence\]: 🗏 sequences\/tools_databaseobject_copy\.yaml/);
  const sequence = read('_c8oProject/sequences/tools_databaseobject_copy.yaml');
  assert.match(sequence, /^comment: \|\n  Copy an object and everything under it\n/m);
  assert.match(sequence, /To start from a model or an existing object, copy it, then adapt the copy with databaseobject-tree-apply/);
  for (const variable of ['source', 'target', 'at', 'name', 'retargetProject', 'autoSave']) {
    assert.match(sequence, new RegExp('^↓' + variable + ' \\[variables\\.RequestableVariable-\\d+\\]: $', 'm'), variable);
  }
  assert.match(read('js/studio_write_confirm.js'), /tools_databaseobject_copy: "databaseobject-copy"/);
  assert.match(read('js/edit_profile.js'), /tools_databaseobject_copy: "databaseobject-copy"/);
  assert.match(read('js/subagents.js'), /tools_databaseobject_copy: true/);
  assert.match(read('js/setup_vibe.js'), /"Convertigo_databaseobject-copy"/);
  assert.match(read('js/schema_overrides.js'), /if \(seq === "tools_databaseobject_copy"\) \{\s*return databaseobjectCopyInputSchema\(\);/);
});
