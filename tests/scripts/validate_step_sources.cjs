// A step reads another step's output by that step's priority ([priority, xpath]). A step deleted or created again left
// sources naming no step, and requestable-execute failed with "Did not find source (N) for step ...". project-lint reports
// every such source (SEQ-ORPHAN-SOURCE); a delete, a move or a replace (databaseobject-delete, databaseobject-move,
// tree-apply, batch-call) warns about the sources it leaves orphan, with what to set them to (js/step_sources.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const javaProxy = new Proxy(function () {}, { get: () => javaProxy, apply: () => javaProxy, construct: () => javaProxy });

function load(withOps) {
  const sandbox = { C8O: { dbo: { getDirectChildren: node => (node.children || []).slice() }, util: {} }, Packages: javaProxy, include() {},
    java: { lang: { Long: { valueOf: n => n } } } };
  vm.createContext(sandbox);
  vm.runInContext(read('js/step_sources.js'), sandbox, { filename: 'step_sources.js' });
  if (withOps) {
    sandbox.C8O.dbo.resolve = qname => find(withOps, qname);
    vm.runInContext(read('js/databaseobject_ops.js'), sandbox, { filename: 'databaseobject_ops.js' });
  }
  return sandbox.C8O;
}

// Engine-like objects: a sequence, steps (some nested), call-step variables; XMLVectors as arrays.
function node(kind, name, extra) {
  const n = Object.assign({ name, children: [], parent: null, enabled: true }, extra || {});
  n.getClass = () => ({ getName: () => kind });
  n.getName = () => n.name;
  n.getParent = () => n.parent;
  n.getFullQName = () => (n.parent ? n.parent.getFullQName() + '.' + n.name : 'App.' + n.name);
  n.isEnabled = () => n.enabled;
  n.getPreviousSiblingInFolder = () => null;
  n.getProject = () => null;
  n.remove = child => { n.children = n.children.filter(c => c !== child); child.parent = null; };
  n.add = child => { n.children.push(child); child.parent = n; };
  n.delete = () => { if (n.parent) n.parent.remove(n); };
  n.equals = other => other === n;
  if (/\.steps\./.test(kind)) {
    n.getParentSequence = () => { let p = n.parent; while (p && !/\.sequences\./.test(p.getClass().getName())) p = p.parent; return p; };
  }
  return n;
}
const sequence = name => node('com.twinsoft.convertigo.beans.sequences.GenericSequence', name);
const step = (cls, name, priority, extra) => node('com.twinsoft.convertigo.beans.steps.' + cls, name, Object.assign({ priority }, extra || {}));
function adopt(parent, ...kids) { kids.forEach(k => parent.add(k)); return parent; }
function find(n, qname) {
  if (n.getFullQName() === qname) return n;
  for (const c of n.children) { const f = find(c, qname); if (f) return f; }
  return null;
}

function app() {
  const seq = sequence('orders');
  const read = step('SimpleStep', 'ReadOrders', 101);
  const check = step('IfStep', 'IfFound', 102);
  const copy = step('XMLCopyStep', 'CopyOrder', 103, { getSourceDefinition: () => ['101', './document/orders/order'] });
  const call = step('SequenceStep', 'CallLog', 104);
  const variable = node('com.twinsoft.convertigo.beans.variables.StepVariable', 'message', { getSourceDefinition: () => ['999', './document/text'] });
  const concat = step('XMLConcatStep', 'Join', 105, { getSourcesDefinition: () => [['label', ['103', './document/order/id']]] });
  const smart = step('JsonFieldStep', 'Field', 106, { getSmartTypes: () => [{ isUseSource: () => true, getSourceDefinition: () => ['555', './document/x'] }, { isUseSource: () => false }] });
  const off = step('XMLCopyStep', 'OldCopy', 107, { enabled: false, getSourceDefinition: () => ['888', './document/y'] });
  const empty = step('XMLCopyStep', 'NoSource', 108, { getSourceDefinition: () => [] });
  adopt(seq, read, adopt(check, copy), adopt(call, variable), concat, smart, off, empty);
  return { seq, read, check, copy, call, variable, concat, smart, off };
}

test('every source of a sequence is read, and those naming no step are orphan', () => {
  const C8O = load();
  const { seq } = app();
  const scan = plain(C8O.stepSources.collect(seq));
  assert.deepEqual(Object.keys(scan.steps).sort(), ['101', '102', '103', '104', '105', '106', '107', '108']);
  assert.equal(scan.steps['103'], 'App.orders.IfFound.CopyOrder');
  assert.deepEqual(plain(C8O.stepSources.orphans(C8O.stepSources.collect(seq))).map(r => [r.qname, r.kind, r.property, r.priority, r.enabled]), [
    ['App.orders.CallLog.message', 'variable', 'sourceDefinition', '999', true],
    ['App.orders.Field', 'step', 'a SmartType in SOURCE mode', '555', true],
    ['App.orders.OldCopy', 'step', 'sourceDefinition', '888', false]
  ]);
  assert.ok(scan.refs.some(r => r.property === 'sourcesDefinition[0]' && r.priority === '103'), 'a sourcesDefinition row is read');
});

test('project-lint: SEQ-ORPHAN-SOURCE names the source, the error requestable-execute gives, and the fix', () => {
  const C8O = load();
  const { seq } = app();
  const [variable, , disabled] = C8O.stepSources.orphans(C8O.stepSources.collect(seq)).map(r => plain(C8O.stepSources.lintFinding(r, 'App.orders')));
  assert.equal(variable.rule, 'SEQ-ORPHAN-SOURCE');
  assert.equal(variable.severity, 'error');
  assert.equal(variable.qname, 'App.orders.CallLog.message');
  assert.match(variable.message, /^The variable message of a call step sources the step of priority 999 \(sourceDefinition \.\/document\/text\), which is not in the sequence App\.orders any more/);
  assert.match(variable.message, /fails with "Did not find source \(999\) for step message"/);
  assert.match(variable.fix, /databaseobject-tree-get.*databaseobject-tree-apply on App\.orders\.CallLog\.message with sourceDefinition \["<priority>", "\.\/document\/text"\]/);
  assert.equal(disabled.severity, 'warning', 'a disabled step does not run');
  const lint = read('js/tools_project_lint.js');
  assert.match(lint, /include\("js\/step_sources\.js"\);/);
  assert.match(lint, /C8O\.stepSources\.orphans\(C8O\.stepSources\.collect\(sequence\)\)\.forEach\(function \(ref\) \{\n\s+var orphan = C8O\.stepSources\.lintFinding\(ref, qnameOf\(sequence\)\);\n\s+add\(orphan\.rule, orphan\.severity, orphan\.qname, orphan\.message, orphan\.fix\);/);
});

test('a deleted step: the sources it leaves orphan, never the ones that were already broken', () => {
  const C8O = load();
  const { seq, check, read: readStep } = app();
  const watch = C8O.stepSources.watch(readStep);
  assert.equal(C8O.stepSources.watch(seq), null, 'a sequence is not a step');
  seq.remove(readStep);
  const orphans = C8O.stepSources.leftOrphan(watch);
  assert.deepEqual(plain(orphans.map(o => [o.qname, o.priority, o.gone, o.xpath])), [['App.orders.IfFound.CopyOrder', '101', 'App.orders.ReadOrders', './document/orders/order']]);
  const [warning] = C8O.stepSources.warnings(orphans);
  assert.match(warning, /^Step sources left orphan: 1 source\(s\) of App\.orders name App\.orders\.ReadOrders \(priority 101\), which is not a step of that sequence any more: App\.orders\.IfFound\.CopyOrder \(sourceDefinition \.\/document\/orders\/order\)\./);
  assert.match(warning, /"Did not find source \(101\) for step CopyOrder"/);
  assert.match(warning, /project-lint lists them as SEQ-ORPHAN-SOURCE\.$/);
  // Created again (another class): the warning gives the new priority to set.
  const [replaced] = C8O.stepSources.warnings(orphans, { 'App.orders.ReadOrders': { qname: 'App.orders.ReadOrders', priority: '201' } });
  assert.match(replaced, /It was created again as App\.orders\.ReadOrders with priority 201: set these sources to \["201", <xpath>\]/);
  // Deleting a parent step removes its children: the sources naming them are reported too.
  const fresh = app();
  const parentWatch = C8O.stepSources.watch(fresh.check);
  fresh.seq.remove(fresh.check);
  assert.deepEqual(plain(C8O.stepSources.leftOrphan(parentWatch).map(o => [o.qname, o.gone])), [['App.orders.Join', 'App.orders.IfFound.CopyOrder']]);
  assert.ok(check);
});

test('a batch warns only about the sources still orphan once every operation ran', () => {
  const C8O = load();
  const { seq, read: readStep, copy } = app();
  const watch = C8O.stepSources.watch(readStep);
  seq.remove(readStep);
  const orphans = C8O.stepSources.leftOrphan(watch);
  assert.equal(C8O.stepSources.stillOrphan(orphans).length, 1);
  // A later operation of the batch created the step again and pointed the source at it.
  adopt(seq, step('JsonSourceStep', 'ReadOrders', 201));
  copy.getSourceDefinition = () => ['201', './document/orders/order'];
  assert.equal(C8O.stepSources.stillOrphan(orphans).length, 0);
  const batch = read('js/databaseobject_batch.js');
  assert.match(batch, /noteOrphanSources\(ctx, report, deleted, \{ qname: safeQName\(recreated\), priority: C8O\.stepSources \? C8O\.stepSources\.priorityOf\(recreated\) : "" \}\);/, 'a class change recreates the step');
  assert.match(batch, /var pruneDeleted = deleteObject\(ctx, runtimeQName\);\n\s+noteOrphanSources\(ctx, report, pruneDeleted\);/, 'mode replace prunes');
  assert.match(batch, /var deleted = deleteObject\(ctx, qname\);\n\s+noteOrphanSources\(ctx, report, deleted\);/, 'a delete operation');
  assert.match(batch, /var moved = moveObject\(ctx, qname, target, position\);\n\s+noteOrphanSources\(ctx, report, moved\);/, 'a move operation');
  assert.match(batch, /warnOrphanSources\(ctx\);\n\n\s+var mobileBuilderResults = \[\];/, 'checked once all operations ran, before the warnings are gathered');
});

test('databaseobject-delete and databaseobject-move answer the sources they leave orphan', () => {
  const tree = app();
  const C8O = load(tree.seq);
  const removed = C8O.dbo.removeObject({ qname: 'App.orders.ReadOrders' });
  assert.equal(removed.removed, true);
  assert.deepEqual(plain(removed.orphanedSources.map(o => o.qname)), ['App.orders.IfFound.CopyOrder']);
  assert.equal(removed.warnings.length, 1);
  assert.match(removed.warnings[0], /name App\.orders\.ReadOrders \(priority 101\)/);
  const none = C8O.dbo.removeObject({ qname: 'App.orders.OldCopy' });
  assert.deepEqual(plain(none.warnings), [], 'nothing sources it');

  // A step moved to another sequence: the sources naming it in the old one are orphan, and so are its own.
  const two = app();
  const other = sequence('audit');
  const workspace = node('com.twinsoft.convertigo.beans.core.Project', 'App', { getFullQName: () => 'App' });
  adopt(workspace, two.seq, other);
  two.seq.getFullQName = () => 'App.orders';
  other.getFullQName = () => 'App.audit';
  const C8O2 = load(workspace);
  const moved = C8O2.dbo.moveObject({ qname: 'App.orders.IfFound.CopyOrder', target: 'App.audit', position: 'inside' });
  assert.equal(moved.done, true);
  assert.deepEqual(plain(moved.orphanedSources.map(o => [o.qname, o.sequenceQName, o.gone])).sort(), [
    ['App.audit.CopyOrder', 'App.audit', 'App.orders.ReadOrders'],
    ['App.orders.Join', 'App.orders', 'App.orders.IfFound.CopyOrder']
  ]);
  assert.equal(moved.warnings.length, 2);
  for (const tool of ['delete', 'move']) {
    const yaml = read('_c8oProject/sequences/tools_databaseobject_' + tool + '.yaml');
    assert.match(yaml, new RegExp(tool + 'Warnings = Array\\.isArray\\(\\w+\\.warnings\\) \\? \\w+\\.warnings : \\[\\];'));
    assert.match(yaml, new RegExp("↓warnings \\[steps\\.JsonToXmlStep-\\d+\\]: \\n[\\s\\S]*?- →→: 'Array\\.isArray\\(" + tool + "Warnings\\) \\? " + tool + "Warnings : \\[\\]'\\n[\\s\\S]*?- →→: warnings\\n"));
  }
});

test('warnings stay short: at most five sources named per step gone', () => {
  const C8O = load();
  const orphans = Array.from({ length: 12 }, (_, i) => ({ qname: 'App.s.Step' + i, name: 'Step' + i, kind: 'step', property: 'sourceDefinition',
    priority: '7', xpath: './document/' + 'x'.repeat(50), gone: 'App.s.Gone', sequenceQName: 'App.s' }));
  const [warning] = C8O.stepSources.warnings(orphans);
  assert.match(warning, /12 source\(s\)/);
  assert.match(warning, /Step4 .* and 7 more\./);
  assert.ok(warning.length < 1200, String(warning.length));
});
