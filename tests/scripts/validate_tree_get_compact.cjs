const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// databaseobject-tree-get answers compact nodes: no depth nor hasChildren, counts only on the target and on a node whose
// children are not all listed. A page stops near 13 000 characters of nodes as Vibe 3.1 prints them (JSON indented by 2),
// since Vibe saves a tool result over 16 000 indented characters to a file that the agent then reads with bash (T3 of
// 16/11: a page tree of 16.6k compact was 31.9k indented, 8 saved answers and 21 bash reads in one small change).

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'js/tools_databaseobject_tree_get.js'), 'utf8');

function makeTree(spec, qname) {
  return { qname, name: qname.split('.').pop(), className: spec.className || 'ngx.components.UIDynamicElement#Div',
    properties: spec.properties || {}, children: (spec.children || []).map((c, i) => makeTree(c, qname + '.n' + i)) };
}

function run(tree, variables) {
  const byQName = {};
  (function index(n) { byQName[n.qname] = n; n.children.forEach(index); })(tree);
  const sandbox = Object.assign({
    Packages: { com: { twinsoft: { convertigo: { engine: { Engine: {} } } } } },
    java: { lang: { String: function () {} } },
    JSON, Object, Math, String, Array, parseInt, isNaN,
    C8O: {
      util: { toBoolean: (v, d) => (v === undefined || v === null ? d : String(v) === 'true') },
      dbo: {
        resolve: q => byQName[q],
        safeFullQName: n => n.qname,
        safeQName: n => n.qname,
        safeName: n => n.name,
        safePriority: () => '',
        logicalClassNameForDbo: n => n.className,
        getDirectChildren: n => n.children,
        getCanonicalPropertiesMap: n => JSON.parse(JSON.stringify(n.properties))
      }
    },
    _nextCursor: undefined
  }, variables);
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox;
}

const leafProps = { tagName: 'span', comment: '', identifier: '', isEnabled: true, selfClose: false,
  IonColor: { mode: 'PLAIN', value: 'not set' }, Text: { mode: 'PLAIN', value: 'Some label text' } };

test('nodes carry no depth or hasChildren, and counts only where children are hidden', () => {
  const tree = makeTree({ children: [
    { children: [{}, {}] },
    { children: [{ children: [{}] }] },
    {}
  ] }, 'P.Application.NgxApp.pg:Home');
  const out = run(tree, { target: 'P.Application.NgxApp.pg:Home', childrenDepth: 2, properties: 'none' });
  const t = out.treeData;
  const text = JSON.stringify(t);
  assert.doesNotMatch(text, /"depth"|"hasChildren"/);
  assert.equal(t.directChildrenCount, 3, 'the target keeps its counts');
  assert.equal(t.subtreeCount, 7);
  const [a, b, c] = t.children;
  assert.equal(a.directChildrenCount, undefined, 'all its children are listed');
  assert.equal(a.children.length, 2);
  assert.equal(c.directChildrenCount, undefined, 'a leaf has no count');
  const hidden = b.children[0];
  assert.equal(hidden.directChildrenCount, 1, 'children below the depth limit: counts kept');
  assert.equal(hidden.subtreeCount, 1);
  assert.equal(hidden.children, undefined);
});

test('a page of nodes with their properties stays under 16 000 characters once indented', () => {
  const rows = [];
  for (let i = 0; i < 60; i++) rows.push({ properties: leafProps, children: [{ properties: leafProps }, { properties: leafProps }] });
  const tree = makeTree({ children: [{ properties: leafProps, children: rows }] }, 'P.Application.NgxApp.pg:Big');
  const out = run(tree, { target: 'P.Application.NgxApp.pg:Big', childrenDepth: 3, properties: 'all' });
  const answer = { hasMore: out.treeHasMore, nextCursor: out.treeNextCursor, totalNodes: out.treeTotalNodes,
    returnedNodes: out.treeReturnedNodes, tree: out.treeData };
  const indented = JSON.stringify(answer, null, 2).length;
  assert.ok(out.treeHasMore, 'the tree goes on in a next page');
  assert.ok(out.treeReturnedNodes > 10, 'a page still holds a useful number of nodes: ' + out.treeReturnedNodes);
  assert.ok(indented < 16000, 'indented page ' + indented + ' characters');
  // the next page continues where this one stopped
  const next = run(tree, { target: 'P.Application.NgxApp.pg:Big', childrenDepth: 3, properties: 'all', _nextCursor: out.treeNextCursor });
  assert.ok(next.treeReturnedNodes > 0);
  assert.ok(JSON.stringify({ tree: next.treeData }, null, 2).length < 16000);
});
