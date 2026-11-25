// Run: node --test tests/scripts/validate_lookup_not_found.cjs
// databaseobject-tree-get answered "Database object not found ... Objects named …: a, b, c" 18 times in 5 minutes, then 9
// more, the candidates in each answer (feedback reports 25/11). The guard of js/mcp_repeated_failures.js did not stop it:
// it counts an identical call (same tool, same arguments) failing with the same message, and each try asked another
// QName. Now a not-found with one candidate of the kind asked (or one candidate) answers use and "Call again with target
// <QName>", and the lookup tools count their not-found answers in a row per session, whatever the target.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

class FakeMap {
  constructor() { this.map = new Map(); }
  get(key) { return this.map.has(key) ? this.map.get(key) : null; }
  put(key, value) { this.map.set(key, value); }
  remove(key) { this.map.delete(key); }
  size() { return this.map.size; }
  clear() { this.map.clear(); }
  entrySet() {
    const map = this.map;
    const keys = [...map.keys()];
    let at = -1;
    return { iterator: () => ({
      hasNext: () => at + 1 < keys.length,
      next: () => { at++; return { getValue: () => map.get(keys[at]) }; },
      remove: () => map.delete(keys[at])
    }) };
  }
}

function repeatApi() {
  const ctx = { C8O: {}, include() {} };
  vm.createContext(ctx);
  vm.runInContext(read('js/guidance_version.js'), ctx);
  vm.runInContext(read('js/mcp_repeated_failures.js'), ctx);
  return ctx.C8O.mcpRepeat;
}

function server() {
  const values = {};
  return { get: key => (key in values ? values[key] : null), set: (key, value) => { values[key] = value; } };
}

// C8O.dbo.notFoundUse, out of js/databaseobject.js (which needs the engine to load).
function notFoundUse() {
  const source = read('js/databaseobject.js');
  const start = source.indexOf('C8O.dbo.notFoundUse = function');
  const end = source.indexOf('\n};\n', start) + 3;
  const ctx = { C8O: { dbo: {} } };
  vm.createContext(ctx);
  vm.runInContext(source.slice(start, end), ctx);
  return ctx.C8O.dbo.notFoundUse;
}

const NOT_FOUND_TREE_GET = 'target: Database object not found: Shop.sq:list_orders. Call again with target Shop.sq:orders_list. ' +
  'Objects named "list_orders": Shop.sq:orders_list. QName shape: ...';

test('one candidate of the kind asked, or one candidate, is the QName to use', () => {
  const use = notFoundUse();
  assert.equal(use('Shop.sq:useIt', ['Shop.sq:orders.st:useIt'], true), 'Shop.sq:orders.st:useIt', 'the only candidate');
  assert.equal(use('Shop.sq:check', ['Shop.sq:a.st:check', 'Shop.cn:db.tr:check', 'Lib.sq:check', 'Other.sq:check'], true), '',
    'two sequences of that name: no single answer');
  assert.equal(use('Shop.sq:check', ['Shop.cn:db.tr:check', 'Shop.sq:other.st:check', 'Lib.sq:check'], true), 'Lib.sq:check',
    'the only sequence among the candidates');
  assert.equal(use('Shop.cn:db.tr:check', ['Shop.cn:db.tr:check', 'Shop.cn:api.tr:check'], true), '', 'two of the kind: no single answer');
  assert.equal(use('Shop.check', ['Shop.sq:check', 'Shop.cn:db.tr:check'], true), '', 'no kind asked, two candidates');
  assert.equal(use('Shop.sq:x', ['Shop.sq:a.st:x'], false), '', 'a walk cut short gives no certain answer');
  const source = read('js/databaseobject.js');
  assert.match(source, /use = C8O\.dbo\.notFoundUse\(qname, found, !stack\.length && found\.length < 6\);\n\s+if \(use\) \{\n\s+hints\.push\("Call again with target " \+ use \+ "\."\);/);
  assert.match(source, /if \(use\) \{\n\s+error\.use = use;/);
});

test('the error answer of a lookup tool carries use, read from its message', () => {
  const endpoint = read('_c8oProject/sequences/mcp_endpoint.yaml');
  const prologue = endpoint.slice(endpoint.indexOf('    var TOOL_CALL_INTERRUPTED'), endpoint.indexOf('    const Engine'));
  const ctx = { C8O: { mcpRepeat: repeatApi() } };
  vm.createContext(ctx);
  vm.runInContext(prologue + '\nthis.lift = formatToolErrorObject;', ctx);
  const lifted = plain(ctx.lift({ code: '-1', message: 'An exception occured while executing step',
    details: 'Step: "Sequence_JS (priority:1)"\nA Javascript error has occured: Error: ' + NOT_FOUND_TREE_GET }));
  assert.equal(lifted.use, 'Shop.sq:orders_list');
  assert.equal(plain(ctx.lift({ code: '-1', message: 'Database object not found: Shop.sq:x. QName shape: ...' })).use, undefined);
});

test('a failed tree-apply with the not-found inside gets use and the sentence at its top', () => {
  const api = repeatApi();
  const answer = { status: 'failed', message: 'Batch apply stopped on error.', operations: [{ status: 'failed', error: NOT_FOUND_TREE_GET }] };
  api.annotateNotFound(answer);
  assert.equal(answer.use, 'Shop.sq:orders_list');
  assert.equal(answer.message, 'Batch apply stopped on error. Call again with target Shop.sq:orders_list.');
  const ok = { status: 'ok', message: NOT_FOUND_TREE_GET };
  api.annotateNotFound(ok);
  assert.equal(ok.use, undefined, 'only a failed answer');
  assert.equal(api.useOf('Call again with target P.sq:a.st:b.c. Objects named'), 'P.sq:a.st:b.c');
  assert.equal(api.useOf('Call again with target P.sq:a'), '');
});

test('three not-found lookups in a row, whatever the target and the tool, say to stop guessing', () => {
  const api = repeatApi();
  const store = server();
  const newMap = () => new FakeMap();
  let now = 1_000_000;
  const call = (session, tool, args, signature) => {
    api.callKey(tool, args);
    now += 10_000;
    return api.lookupStreak(store, newMap, session, api.current, signature, now);
  };
  const nf = target => '-1|target: Database object not found: ' + target + '. Objects named "x": Shop.sq:a, Shop.sq:b';
  assert.equal(call('s1', 'databaseobject-tree-get', { target: 'Shop.sq:a1' }, nf('Shop.sq:a1')), '');
  assert.equal(call('s1', 'databaseobject-tree-get', { target: 'Shop.sq:a2' }, nf('Shop.sq:a2')), '');
  assert.equal(call('s1', 'project-list', {}, ''), '', 'another tool neither counts nor resets');
  assert.equal(call('s1', 'databaseobject-tree-apply', { target: 'Shop.sq:a3' }, '-1|Batch apply stopped on error.|' + nf('Shop.sq:a3')).length > 0, true);
  const note = call('s1', 'databaseobject-delete', { qname: 'Shop.sq:a4' }, nf('Shop.sq:a4'));
  assert.equal(note, '4 lookups in a row found nothing in this session: stop guessing QNames. Call project-brief {project: "Shop"} once ' +
    '(or databaseobject-search with the name you look for) and copy a QName from its answer, or use the QName this answer gives in use.');
  assert.equal(call('s2', 'databaseobject-tree-get', { target: 'Shop.sq:a5' }, nf('Shop.sq:a5')), '', 'per session');
  assert.equal(call('s1', 'databaseobject-tree-get', { target: 'Shop.sq:a6' }, '-1|Refused: write lock'), '', 'another error: no count');
  assert.equal(call('s1', 'databaseobject-tree-get', { target: 'Shop.sq:orders' }, ''), '', 'a lookup that found its object');
  assert.equal(call('s1', 'databaseobject-search', { qname: 'Shop', filter: 'x' }, nf('Shop.sq:x')), '', 'the count started again');
  assert.equal(call('s1', 'Convertigo_databaseobject-tree-get', { target: 'Shop.sq:a7' }, nf('Shop.sq:a7')), '');
  assert.match(call('s1', 'databaseobject.tree.get', { target: 'Shop.sq:a8' }, nf('Shop.sq:a8')), /^3 lookups in a row/);
  now += 16 * 60_000;
  assert.equal(call('s1', 'databaseobject-tree-get', { target: 'Shop.sq:a9' }, nf('Shop.sq:a9')), '', 'forgotten after 15 minutes');
});

test('afterCall joins the exact-repeat note and the streak, and reads a not-found inside an answer', () => {
  const api = repeatApi();
  const store = server();
  const headers = { 'X-Convertigo-Conversation-Id': 'c-1' };
  const context = { server: store, httpServletRequest: { getHeader: name => headers[name] || null } };
  const sandboxJava = { util: { concurrent: { ConcurrentHashMap: FakeMap } }, lang: { System: { currentTimeMillis: () => 5_000_000 } } };
  // afterCall builds its maps with java.util.concurrent.ConcurrentHashMap
  const ctx = { C8O: {}, include() {}, java: sandboxJava };
  vm.createContext(ctx);
  vm.runInContext(read('js/guidance_version.js'), ctx);
  vm.runInContext(read('js/mcp_repeated_failures.js'), ctx);
  const R = ctx.C8O.mcpRepeat;
  const run = (args, signature, value) => R.afterCall(context, R.callKey('databaseobject-tree-get', args), signature, value);
  assert.equal(run({ target: 'Shop.sq:a' }, '-1|Database object not found: Shop.sq:a'), '');
  assert.equal(run({ target: 'Shop.sq:b' }, '-1|Database object not found: Shop.sq:b'), '');
  const third = run({ target: 'Shop.sq:b' }, '-1|Database object not found: Shop.sq:b');
  assert.match(third, /^This exact call \(same tool, same arguments\) already failed 1 time in this session with this error: .* 3 lookups in a row found nothing in this session/);
  const answer = { status: 'failed', message: 'Batch apply stopped on error.', stop: { error: NOT_FOUND_TREE_GET } };
  const fourth = R.afterCall(context, R.callKey('databaseobject-tree-apply', { target: 'Shop.sq:list_orders' }), R.failureOf(answer), answer);
  assert.match(fourth, /^4 lookups in a row/);
  assert.equal(answer.use, 'Shop.sq:orders_list');
  const endpoint = read('_c8oProject/sequences/mcp_endpoint.yaml');
  assert.match(endpoint, /mcpRepeatNote = C8O\.mcpRepeat\.afterCall\(context, mcpCallKey, C8O\.mcpRepeat\.failureOf\(result\), result\);/);
});
