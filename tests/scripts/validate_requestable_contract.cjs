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

// A change inside a requestable that existed before the conversation is refused before it is made, until changeExisting
// names it (measured run, 18/11: 8 changes into an existing sequence through at:"after" and at:"self", each one warned).
test('the requestable a tree-apply writes inside: steps, variables, SQL, name; a sibling, a comment or an access are not', () => {
  const C = load('js/requestable_contract.js', 'requestableContract');
  assert.equal(C.writeScope('App.sq:list.st:Call', 'after', 'merge', { name: 'Rows', className: 'steps.JsonArrayStep' }), 'App.sq:list');
  assert.equal(C.writeScope('App.sq:list.st:Rows.Iterator', 'self', 'merge', { properties: { condition: '' } }), 'App.sq:list');
  assert.equal(C.writeScope('App.sq:list', 'inside', 'merge', { name: 'Rows', className: 'steps.JsonArrayStep' }), 'App.sq:list');
  assert.equal(C.writeScope('App.cn:db.tr:q_items', 'inside', 'merge', { name: 'limit', className: 'variables.RequestableVariable' }), 'App.cn:db.tr:q_items');
  assert.equal(C.writeScope('App.cn:db.tr:q_items', 'self', 'merge', { properties: { sqlQuery: 'SELECT 1' } }), 'App.cn:db.tr:q_items');
  assert.equal(C.writeScope('App.sq:list', 'self', 'merge', { name: 'list_all', properties: {} }), 'App.sq:list', 'a rename');
  assert.equal(C.writeScope('App.sq:list', 'self', 'replace', { name: 'list' }), 'App.sq:list');
  assert.equal(C.writeScope('App.sq:list', 'self', 'merge', { name: 'list', children: [{ name: 'A' }] }), 'App.sq:list');
  assert.equal(C.writeScope('App.sq:list', 'self', 'merge', { name: 'list', properties: { comment: 'x', accessibility: 'Private' } }), '');
  assert.equal(C.writeScope('App.sq:list', 'after', 'merge', { name: 'list_v2', className: 'sequences.GenericSequence' }), '', 'a new sibling');
  assert.equal(C.writeScope('App', 'inside', 'merge', { name: 'seed', className: 'sequences.GenericSequence' }), '');
  assert.equal(C.writeScope('App.Application.NgxApp.pg:Home', 'inside', 'merge', { name: 'Title' }), '');
});

test('changeExisting names a requestable by QName, runtime path or name, as a list, a JSON list or a comma text', () => {
  const C = load('js/requestable_contract.js', 'requestableContract');
  assert.deepEqual(plain(C.parseNames(['App.sq:list', ' App.list '])), ['App.sq:list', 'App.list']);
  assert.deepEqual(plain(C.parseNames('["App.sq:list"]')), ['App.sq:list']);
  assert.deepEqual(plain(C.parseNames('App.sq:list, App.cn:db.tr:q')), ['App.sq:list', 'App.cn:db.tr:q']);
  assert.deepEqual(plain(C.parseNames(null)), []);
  assert.deepEqual(plain(C.parseNames('')), []);
  assert.equal(C.names(['App.sq:list'], 'App.sq:list'), true);
  assert.equal(C.names(['App.list'], 'App.sq:list'), true);
  assert.equal(C.names(['list'], 'App.sq:list'), true);
  assert.equal(C.names(['App.db.q'], 'App.cn:db.tr:q'), true);
  assert.equal(C.names(['list_all'], 'App.sq:list'), false);
  assert.equal(C.names([], 'App.sq:list'), false);
});

function gateWorld(created = []) {
  const values = new Map();
  const server = { get: k => (values.has(k) ? values.get(k) : null), set: (k, v) => values.set(k, v) };
  class JMap {
    constructor() { this.m = new Map(); }
    size() { return this.m.size; } clear() { this.m.clear(); }
    containsKey(k) { return this.m.has(k); } put(k, v) { this.m.set(k, v); }
  }
  const sandbox = {
    java: { util: { concurrent: { ConcurrentHashMap: JMap } }, lang: { Long: { valueOf: v => v }, System: { currentTimeMillis: () => 1 } } },
    include() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(read('js/requestable_contract.js'), sandbox, { filename: 'requestable_contract.js' });
  const C8O = sandbox.C8O;
  C8O.dbo = { resolve: q => (/^App\.(sq|cn):/.test(q) ? { q } : null), safeFullQName: d => d.q };
  C8O.writeJournal = { createdQNames: () => created.slice(), keyOf: ctx => ({ key: 'k-' + ctx.conversation }) };
  C8O.requestableContract.callersOf = () => ['page Home'];
  C8O.requestableContract.calleesOf = () => ['App.cn:db.tr:q_list'];
  const context = conversation => ({ server, conversation });
  return { C: C8O.requestableContract, context };
}

test('the gate refuses a change inside an existing requestable, lets it through once named, and remembers it per conversation', () => {
  const { C, context } = gateWorld();
  const one = context('c1');
  const refused = C.gateExisting(one, 'App.sq:list.st:Call', 'after', 'merge', { name: 'Rows', className: 'steps.JsonArrayStep' }, null);
  assert.match(refused.refusal, /^Nothing was changed: App\.sq:list existed before this conversation, and its callers \(page Home\) read its output and its variables\. If the user asked to change App\.sq:list, call again with the same arguments and changeExisting:\["App\.sq:list"\] \(add "App\.cn:db\.tr:q_list", which it calls, if the change goes into them too\): later changes to it in this conversation then pass; name the change in the final report\. Otherwise leave it as it is: create a separate object \(a new sequence or transaction under another name\), or adapt the caller to its output as it is \(requestable-execute shows it\)\.$/);
  assert.match(C.existingRefusal('App.cn:db.tr:q', [], []), /^Nothing was changed: App\.cn:db\.tr:q existed before this conversation, and the app read its output and its variables\. If the user asked to change App\.cn:db\.tr:q, call again with the same arguments and changeExisting:\["App\.cn:db\.tr:q"\]: later changes/);
  assert.equal(C.isConfirmed(one, 'App.sq:list'), false);
  const named = C.gateExisting(one, 'App.sq:list.st:Call', 'after', 'merge', { name: 'Rows', className: 'steps.JsonArrayStep' }, ['App.sq:list']);
  assert.match(named.note, /^App\.sq:list existed before this conversation and was changed as named in changeExisting: say it in the final report \(project-changes lists it under existingChanged\)\.$/);
  assert.equal(C.gateExisting(one, 'App.sq:list.st:Rows', 'self', 'merge', { properties: { key: 'rows' } }, null), null, 'later changes pass');
  assert.equal(C.isConfirmed(one, 'App.sq:list'), true);
  assert.ok(C.gateExisting(context('c2'), 'App.sq:list.st:Rows', 'self', 'merge', { properties: {} }, null).refusal, 'another conversation is asked again');
  assert.ok(C.gateExisting(one, 'App.sq:other.st:A', 'self', 'merge', { properties: {} }, ['App.sq:list']).refusal, 'only the named one');
});

test('the gate lets through a requestable this conversation created, an object outside requestables, and an unknown target', () => {
  const { C, context } = gateWorld(['App.sq:seed']);
  const one = context('c1');
  assert.equal(C.gateExisting(one, 'App.sq:seed.st:Insert', 'after', 'merge', { name: 'Check', className: 'steps.IfStep' }, null), null);
  assert.equal(C.gateExisting(one, 'App.Application.NgxApp.pg:Home', 'inside', 'merge', { name: 'Title' }, null), null);
  assert.equal(C.gateExisting(one, 'Gone.sq:list.st:A', 'self', 'merge', { properties: {} }, null), null);
  assert.equal(C.gateExisting(one, 'App.sq:list', 'self', 'merge', { name: 'list', properties: { accessibility: 'Hidden' } }, null), null);
});

test('tree-apply checks the gate before anything changes, a dry run aside, and declares changeExisting', () => {
  const tool = read('js/tools_databaseobject_tree_apply.js');
  const gate = tool.indexOf("var existingGate = gateTargetQName.length");
  assert.ok(gate > 0 && gate < tool.indexOf('var op = null;') && gate < tool.indexOf('treeApplyResult = C8O.dbo.batchApply({'));
  assert.ok(tool.indexOf('treeApplyRenameTarget(selfTarget, selfName, treeName);') > gate, 'before a rename of the target');
  assert.match(tool, /if \(!\(dryRunInput === true \|\| String\(dryRunInput\) === "true"\)\) \{\n  if \(typeof C8O\.requestableContract === "undefined"/);
  assert.match(read('js/schema_overrides.js'), /changeExisting: \{\n {10}type: "array",\n {10}items: \{ type: "string" \},\n {10}description: "Only when the user asked to change it:/);
  assert.match(read('_c8oProject/sequences/tools_databaseobject_tree_apply.yaml'), /\n↓changeExisting \[variables\.RequestableVariable-\d+\]: \n {2}comment: /);
  assert.match(read('js/requestable_contract.js'), /if \(!newHere && \(info\.inside > 0 \|\| info\.sql\) && !api\.isConfirmed\(contextObject, requestable\)\) \{/);
});

test('a list argument handed over as a Java string (an object whose text is the JSON list) is read as text', () => {
  const C = load('js/requestable_contract.js', 'requestableContract');
  function JString(s) { this.s = s; this.length = s.length; }
  JString.prototype.toString = function () { return this.s; };
  assert.deepEqual(plain(C.parseNames(new JString('["App.sq:list"]'))), ['App.sq:list']);
  assert.deepEqual(plain(C.parseNames(new JString('App.sq:list'))), ['App.sq:list']);
});

test('the other requestables a call names in changeExisting pass too: the transaction a sequence calls is not refused apart', () => {
  const { C, context } = gateWorld();
  const one = context('c1');
  assert.ok(C.gateExisting(one, 'App.sq:list.st:Call', 'after', 'merge', { name: 'Count', className: 'steps.SimpleStep' },
    ['App.sq:list', 'App.cn:db.tr:q_list']).note);
  assert.equal(C.gateExisting(one, 'App.cn:db.tr:q_list', 'self', 'merge', { properties: { sqlQuery: 'SELECT 1' } }, null), null);
  assert.ok(C.gateExisting(one, 'App.cn:db.tr:q_other', 'self', 'merge', { properties: { sqlQuery: 'SELECT 2' } }, null).refusal);
});
