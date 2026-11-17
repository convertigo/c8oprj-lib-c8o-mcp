// Run: node --test tests/scripts/validate_requestable_contract.cjs
// What tree-apply says about the requestables a call changes (js/requestable_contract.js), the run count and created list
// of the write journal, the bounded structure of a copy, and the pointers toward seed-proof and project-changes. Measured
// runs (17/11): an agent rebuilt the output of an existing sequence for its new page, left a writing seed Public, ran the
// seed by hand again and again, and never called seed-proof or project-changes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function load(file, globalName) {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(read(file), sandbox, { filename: file });
  return sandbox.C8O[globalName];
}

test('the requestable of an object, and the runtime path its callers use', () => {
  const C = load('js/requestable_contract.js', 'requestableContract');
  assert.equal(C.requestableOf('App.sq:list_items.st:Rows.Item.name'), 'App.sq:list_items');
  assert.equal(C.requestableOf('App.cn:db.tr:q_items'), 'App.cn:db.tr:q_items');
  assert.equal(C.requestableOf('App.Application.NgxApp.pg:Home.Content'), '');
  assert.equal(C.runtimeName('App.sq:list_items'), 'App.list_items');
  assert.equal(C.runtimeName('App.cn:db.tr:q_items'), 'App.db.q_items');
});

test('a change inside an existing requestable counts, its comment or access does not, its SQL does', () => {
  const C = load('js/requestable_contract.js', 'requestableContract');
  const touched = plain(C.touched([{ applied: [
    { action: 'create', qname: 'App.sq:list_items.st:Rows' },
    { action: 'setProperties', qname: 'App.sq:list_items.st:Rows', names: ['key'] },
    { action: 'setProperties', qname: 'App.sq:list_items.st:Rows.Item', names: ['key'] },
    { action: 'setProperties', qname: 'App.sq:list_items', names: ['comment', 'accessibility'] },
    { action: 'setProperties', qname: 'App.cn:db.tr:q_items', names: ['sqlQuery'] },
    { action: 'create', qname: 'App.sq:seed' },
    { action: 'create', qname: 'App.sq:seed.st:Insert' },
    { action: 'updateExisting', qname: 'App.sq:other.st:A' },
  ] }]));
  assert.deepEqual(touched['App.sq:list_items'], { inside: 2, sql: false, created: false });
  assert.deepEqual(touched['App.cn:db.tr:q_items'], { inside: 0, sql: true, created: false });
  assert.deepEqual(touched['App.sq:seed'], { inside: 1, sql: false, created: true });
  assert.deepEqual(touched['App.sq:other'], { inside: 0, sql: false, created: false });
  assert.equal(C.createdBefore('App.sq:new_one', ['App.sq:new_one']), true);
  assert.equal(C.createdBefore('App.sq:new_one_b', ['App.sq:new_one']), false);
  assert.equal(C.createdBefore('App.sq:list_items', ['App.sq:new_one']), false);
});

test('callers are the pages, shared components and sequences whose files name the runtime path as a whole name', () => {
  const C = load('js/requestable_contract.js', 'requestableContract');
  const files = {
    '_c8oProject/mobilePages/Home.yaml': `beanData: '{"ionBean":"CallSequenceAction","requestable":"plain:App.list_items"}'`,
    '_c8oProject/mobilePages/Other.yaml': `beanData: '{"ionBean":"CallSequenceAction","requestable":"plain:App.list_items_all"}'`,
    '_c8oProject/sequences/dashboard.yaml': 'sourceSequence: App.list_items',
    '_c8oProject/sequences/list_items.yaml': 'comment: App.list_items',
    '_c8oProject/mobileSharedComponents/Panel.yaml': 'requestable: plain:App.list_items\n',
  };
  assert.deepEqual(plain(C.callersIn(files, 'App.list_items', 'App.sq:list_items')), ['page Home', 'shared component Panel', 'sequence dashboard']);
  const warning = C.outputWarning('App.sq:list_items', { inside: 3, sql: false }, ['page Home']);
  assert.match(warning, /^App\.sq:list_items existed before this conversation, and this call changed 3 object\(s\) inside it\. Its output is a contract its callers read \(page Home\)\. If the user did not ask to change it, undo the change/);
  assert.match(C.outputWarning('App.cn:db.tr:q', { inside: 0, sql: true }, []), /changed its SQL\. Its output is a contract the app reads \(no page or sequence names it yet\)/);
});

test('an SQL text that writes data or the schema, texts and comments aside', () => {
  const C = load('js/requestable_contract.js', 'requestableContract');
  assert.equal(C.sqlWrites('INSERT INTO items (name) VALUES (?)'), true);
  assert.equal(C.sqlWrites('CREATE TABLE IF NOT EXISTS items (id INT)'), true);
  assert.equal(C.sqlWrites("SELECT 'insert into x' AS label FROM items -- update later"), false);
  assert.equal(C.sqlWrites('SELECT COUNT(*) AS "total" FROM items'), false);
  assert.match(C.accessWarning('App.sq:seed', ['db.w_items']), /^App\.sq:seed writes data \(db\.w_items\) and is Public, the default of a new sequence/);
});

test('the journal counts the runs of a requestable and lists what the conversation created', () => {
  const source = read('js/write_journal.js');
  assert.match(source, /api\.runCount = function \(contextObject, requestable\) \{/);
  assert.match(source, /api\.createdQNames = function \(contextObject\) \{[\s\S]*?o\.c === "created"/);
});

test('tree-apply adds the contract warnings before its answer is made compact; lint points to project-changes', () => {
  const tree = read('js/tools_databaseobject_tree_apply.js');
  const hook = tree.indexOf('C8O.requestableContract.warningsFor(treeApplyResult');
  assert.ok(hook > 0 && hook < tree.indexOf('treeApplyResult = treeApplyCompactResult(treeApplyResult);'));
  assert.match(read('js/tools_project_lint.js'), /if \(counts\.bySeverity\.error === 0\) \{\s*add\("NEXT-REPORT-CHANGES", "info"/);
  assert.match(read('js/schema_overrides.js'), /autoSave: \{\s*type: "boolean",\s*default: true,\s*description: "Default true: the project is saved after the change\./);
});

test('the structure a copy answers stays whole lines under its budget', () => {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(read('js/tools_databaseobject_copy.js'), sandbox);
  const copy = sandbox.C8O.dboCopy;
  const lines = Array.from({ length: 300 }, (_, i) => 'Content.Row' + i + '  ion-item text "Item ' + i + '"');
  const bounded = plain(copy.boundLines(lines, copy.STRUCTURE_CHARS));
  assert.equal(bounded.truncated, true);
  assert.ok(bounded.lines.join('\n').length <= copy.STRUCTURE_CHARS);
  assert.equal(bounded.lines[0], lines[0]);
  assert.deepEqual(plain(copy.boundLines(['a', 'b'], 100)), { lines: ['a', 'b'], truncated: false });
});

test('a viewer ready and compiled points to browser-verify for the proof of a page', () => {
  const open = read('js/tools_mobile_builder_open.js');
  assert.match(open, /if \(ready && \(compileState === "success" \|\| compileState === "not_required"\)\) \{\s*message = message \+ " To prove what a page shows, call browser-verify \{url, paths\}/);
});
