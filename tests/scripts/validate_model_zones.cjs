// Run: node --test tests/scripts/validate_model_zones.cjs
// The zones of a page copied from a model (js/model_zones.js). Measured runs (18/11): after copying the model page, the
// agent deleted its footer and changed the class of its content element, and in another run removed every zone of the
// model, against the customer's skill. The user's decision: warn, never refuse. A copy of a page records the zones of its
// source; a write that touches the copy and leaves it different gets a warning (STILL OPEN when it comes again), and
// project-changes lists the copies that differ.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

class JMap {
  constructor() { this.m = new Map(); }
  get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  put(k, v) { this.m.set(k, v); }
  getOrDefault(k, d) { return this.m.has(k) ? this.m.get(k) : d; }
  remove(k) { this.m.delete(k); }
  size() { return this.m.size; }
  clear() { this.m.clear(); }
  keySet() { const keys = [...this.m.keys()]; return { toArray: () => keys }; }
}

function load() {
  const sandbox = {
    java: { util: { concurrent: { ConcurrentHashMap: JMap } }, lang: { Integer: { valueOf: v => v } } },
    include() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(read('js/model_zones.js'), sandbox, { filename: 'model_zones.js' });
  return sandbox;
}

// A fake object tree: {name, cls, cls attr via attrs.class, children}.
function node(name, cls, children = [], classAttr = null) {
  const kids = children.slice();
  if (classAttr !== null) kids.unshift({ name: 'Attr_class', cls: 'UIAttribute', attrName: 'class', value: classAttr, children: [] });
  return { name, cls, children: kids };
}
const hooks = {
  children: n => n.children || [],
  simpleClass: n => n.cls,
  name: n => n.name,
  classValue: n => ((n.children || []).find(c => c.cls === 'UIAttribute' && c.attrName === 'class') || {}).value || '',
};

function model() {
  return node('TopCompanies', 'PageComponent', [
    { name: 'PageEvent', cls: 'UIPageEvent', children: [] },
    { name: 'Style', cls: 'UIStyle', children: [] },
    node('Header', 'UIDynamicElement', [node('ToolBar', 'UIDynamicElement', [node('Title', 'UIDynamicElement', [{ name: 'Text', cls: 'UIText', children: [] }])])]),
    node('Content', 'UIDynamicElement', [
      node('Banner', 'UIDynamicElement', [{ name: 'Text', cls: 'UIText', children: [] }], 'app-banner'),
      node('ContentZone', 'UIDynamicElement', [node('Example', 'UIDynamicElement')], 'app-zone'),
      node('Footer', 'UIDynamicElement', [{ name: 'Text', cls: 'UIText', children: [] }], 'app-footer'),
    ], 'app-page model-page'),
  ]);
}

test('the zones of a page: its elements two levels down, with their class and their children; no event, style or text', () => {
  const { C8O } = load();
  const zones = plain(C8O.modelZones.zonesOf(model(), hooks));
  assert.deepEqual(zones.map(z => z.path), ['Header', 'Header.ToolBar', 'Content', 'Content.Banner', 'Content.ContentZone', 'Content.Footer']);
  assert.deepEqual(zones.find(z => z.path === 'Content'), { path: 'Content', parent: '', cls: 'app-page model-page', count: 3 });
  assert.deepEqual(zones.find(z => z.path === 'Content.ContentZone'), { path: 'Content.ContentZone', parent: 'Content', cls: 'app-zone', count: 1 });
});

test('a filled content zone matches its model; a deleted, emptied, restyled or reordered zone is named', () => {
  const { C8O } = load();
  const M = C8O.modelZones;
  const recorded = plain(M.zonesOf(model(), hooks));
  const filled = model();
  const zone = filled.children[3].children[2];
  zone.children = zone.children.filter(c => c.name !== 'Example').concat([node('List', 'UIDynamicElement'), node('Empty', 'UIDynamicElement')]);
  assert.deepEqual(plain(M.diff(recorded, M.zonesOf(filled, hooks))), [], 'the placeholder replaced by the content is no difference');

  const drifted = model();
  const content = drifted.children[3];
  content.children = content.children.filter(c => c.name !== 'Footer');
  content.children[0].value = 'app-page';
  const banner = content.children.find(c => c.name === 'Banner');
  banner.children = banner.children.filter(c => c.cls === 'UIAttribute');
  const zoneIndex = content.children.findIndex(c => c.name === 'ContentZone');
  const [moved] = content.children.splice(zoneIndex, 1);
  content.children.splice(1, 0, moved);
  assert.deepEqual(plain(M.diff(recorded, M.zonesOf(drifted, hooks))), [
    'class of Content changed from "app-page model-page" to "app-page"',
    'zone Content.Banner emptied',
    'zone Content.Footer deleted',
    'zones of Content in another order (now ContentZone, Banner)',
  ]);

  const gone = model();
  gone.children = gone.children.filter(c => c.name !== 'Content');
  assert.deepEqual(plain(M.diff(recorded, M.zonesOf(gone, hooks))), ['zone Content deleted'], 'the zones under a deleted one are not named again');
  assert.deepEqual(plain(M.diff(recorded, M.zonesOf(drifted, hooks), true)).filter(d => /emptied/.test(d)), [], 'live: an emptied zone waits for the final state');
});

test('the warning says what the model imposes and what to do; STILL OPEN when it comes again', () => {
  const { C8O } = load();
  const M = C8O.modelZones;
  const text = M.warning('App.pg:Top', 'Lib.pg:_model', ['zone Content.Footer deleted']);
  assert.equal(text, 'App.pg:Top was copied in this conversation from the model Lib.pg:_model, and differs from it now: zone Content.Footer deleted. ' +
    'The model gives every page of its kind these zones: put the page\'s content in its content zone, and delete, move, empty or restyle another ' +
    'zone only if the user asked for it (convertigo://guides/common/models). Name the difference in the final report.');
  assert.equal(M.repeatNote(text, 1), text);
  assert.match(M.repeatNote(text, 2), /^STILL OPEN \(2nd time in this conversation\): App\.pg:Top was copied/);
  assert.match(M.drifted(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']), /^a; b; c; d; e; f \(\+2 more\)$/);
  assert.equal(M.touches('App.pg:Top', ['App.pg:Top.Content.Footer']), true);
  assert.equal(M.touches('App.pg:Top', ['App.pg:TopCompanies.Content']), false, 'a whole name, not a prefix');
});

function engine() {
  const sandbox = load();
  const C8O = sandbox.C8O;
  const pages = { 'Lib.pg:_model': model(), 'App.pg:Top': model() };
  C8O.dbo = {
    resolve: q => pages[q] || null,
    getDirectChildren: n => n.children || [],
  };
  // the engine hooks over the fake tree
  C8O.modelZones.engineHooks = () => hooks;
  C8O.writeJournal = { keyOf: ctx => ({ key: 'k-' + ctx.conversation }) };
  const values = new Map();
  const server = { get: k => (values.has(k) ? values.get(k) : null), set: (k, v) => values.set(k, v) };
  return { C8O, pages, context: conversation => ({ server, conversation }) };
}

test('a copy of a page records its model; a write that leaves it different is warned, STILL OPEN the next time, and project-changes lists it', () => {
  const { C8O, pages, context } = engine();
  const M = C8O.modelZones;
  const one = context('c1');
  assert.equal(M.afterCopy(one, { qname: 'App.pg:Top', source: 'Lib.pg:_model', className: 'ngx.components.PageComponent' }), true);
  assert.equal(M.afterCopy(one, { qname: 'App.pg:Top.Content.X', source: 'App.pg:Other.Content.X', className: 'ngx.components.UIDynamicElement' }), false,
    'a copy of an element records nothing');
  const zone = pages['App.pg:Top'].children[3].children[2];
  const placeholder = zone.children.pop();
  assert.deepEqual(plain(M.warningsAfter(one, ['App.pg:Top.Content.ContentZone.Example'])), [], 'the placeholder of the content zone removed: no warning yet');
  zone.children.push(node('List', 'UIDynamicElement'));
  assert.deepEqual(plain(M.warningsAfter(one, ['App.pg:Top.Content.ContentZone'])), [], 'still like its model');
  assert.ok(placeholder);
  const content = pages['App.pg:Top'].children[3];
  content.children = content.children.filter(c => c.name !== 'Footer');
  const first = plain(M.warningsAfter(one, ['App.pg:Top.Content.Footer']));
  assert.equal(first.length, 1);
  assert.match(first[0], /^App\.pg:Top was copied in this conversation from the model Lib\.pg:_model, and differs from it now: zone Content\.Footer deleted\./);
  assert.match(M.warningsAfter(one, ['App.pg:Top'])[0], /^STILL OPEN \(2nd time in this conversation\): App\.pg:Top was copied/);
  assert.deepEqual(plain(M.warningsAfter(one, ['App.pg:Other'])), [], 'a write elsewhere says nothing');
  pages['App.pg:Top'].children[3].children[0].value = 'app-page';
  assert.match(M.warningsAfter(one, ['App.pg:Top.Content'])[0], /^STILL OPEN \(3rd time in this conversation\): .*class of Content changed from "app-page model-page" to "app-page"; zone Content\.Footer deleted\./,
    'a new difference on a copy that already differed is still open');
  assert.deepEqual(plain(M.warningsAfter(context('c2'), ['App.pg:Top'])), [], 'another conversation copied nothing');
  assert.deepEqual(plain(M.summary(one, 'App')), ['App.pg:Top (copy of Lib.pg:_model): class of Content changed from "app-page model-page" to "app-page"; zone Content.Footer deleted']);
  assert.deepEqual(plain(M.summary(one, 'Other')), []);
});

test('the router warns after any write, a batch included; a copy inside a batch records its model; project-changes lists the drift', () => {
  const router = read('js/mcp_endpoint_router.js');
  assert.match(router, /var journalEntry = C8O\.writeJournal\.recordCall\(context, sequenceName, toolResult, callArguments, \{ conversationId: managedConversationId \}\);\n    if \(typeof zoneWarningsAfterToolCall === "function"\) \{\n      zoneWarningsAfterToolCall\(sequenceName, toolResult, callArguments, journalEntry\);/);
  assert.match(router, /Object\.keys\(references\)\.forEach\(function \(id\) \{\n      add\(references\[id\] && references\[id\]\.targetQName\);/);
  const batch = read('js/tools_batch_call.js');
  assert.match(batch, /if \(sequenceName === "tools_databaseobject_copy"\) \{\n      try \{\n[\s\S]*?C8O\.modelZones\.afterCopy\(context, payload\);/);
  const journal = read('js/write_journal.js');
  assert.match(journal, /summary\.modelDrift = drifted\.slice\(0, 10\);/);
  assert.match(read('js/schema_overrides.js'), /modelDrift: lines\("Pages copied from a model in this conversation that differ from it now/);
});

test('the router adds the warnings to the answer of the write: in warnings when it has some, else in its message', () => {
  const router = read('js/mcp_endpoint_router.js');
  const code = router.match(/\nfunction zoneWarningsAfterToolCall\(sequenceName, toolResult, callArguments, journalEntry\) \{\n[\s\S]*?\n\}\n/)[0];
  const seen = [];
  const copies = [];
  const box = {
    context: { server: null },
    include() {},
    C8O: { modelZones: {
      warningsAfter: (ctx, qnames) => { seen.push(qnames.slice()); return qnames.some(q => /pg:Top/.test(q)) ? ['zone warning'] : []; },
      afterCopy: (ctx, answer) => { copies.push(answer.qname); return true; },
    } },
  };
  vm.createContext(box);
  vm.runInContext(code, box);
  const tree = { status: 'ok', targetQName: 'App.pg:Top.Content', warnings: [] };
  box.zoneWarningsAfterToolCall('tools_databaseobject_tree_apply', tree, { target: 'App.pg:Top.Content' }, { objects: [{ q: 'App.pg:Top.Content.Attr' }] });
  assert.deepEqual(plain(tree.warnings), ['zone warning']);
  const batch = { status: 'ok', message: 'Batch call completed.', references: { del: { callIndex: 0, qname: 'App.pg:Top.Content.Footer' } } };
  box.zoneWarningsAfterToolCall('tools_batch_call', batch, {}, null);
  assert.equal(batch.message, 'Batch call completed. zone warning');
  const other = { status: 'ok', warnings: [] };
  box.zoneWarningsAfterToolCall('tools_databaseobject_delete', other, { qname: 'App.sq:list' }, { objects: [{ q: 'App.sq:list' }] });
  assert.deepEqual(plain(other.warnings), []);
  box.zoneWarningsAfterToolCall('tools_databaseobject_copy', { qname: 'App.pg:Top', source: 'Lib.pg:_model' }, {}, null);
  assert.deepEqual(copies, ['App.pg:Top']);
  assert.deepEqual(plain(seen[1]), ['App.pg:Top.Content.Footer'], 'the QNames a batch wrote come from its references');
});
