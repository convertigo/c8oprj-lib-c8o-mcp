// Run: node --test tests/scripts/validate_proof_ledger.cjs
// Agents said "fixed" or "build OK" while the problem was still there (feedback reports 25/11): the rules were text only
// and nothing recorded whether a change had been proven after it was made. js/write_journal.js now keeps the proofs
// (requestable-execute runs, crud-proof, seed-proof, the verifier of browser-verify and subagent-run) beside the writes,
// computes per conversation the objects changed and not proven since, answers them in project-changes (unproven) and
// writes the proof state for the Agent Bridge under lib_ConvertigoMCP.proofState (the contract of
// docs/proof-state-contract.md).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

class FakeDeque {
  constructor() { this.items = []; }
  addLast(value) { this.items.push(value); }
  pollFirst() { return this.items.length ? this.items.shift() : null; }
  peekFirst() { return this.items.length ? this.items[0] : null; }
  peekLast() { return this.items.length ? this.items[this.items.length - 1] : null; }
  size() { return this.items.length; }
  toArray() { return this.items.slice(); }
}

class FakeMap {
  constructor() { this.map = new Map(); }
  get(key) { return this.map.has(key) ? this.map.get(key) : null; }
  put(key, value) { this.map.set(key, value); }
  putIfAbsent(key, value) {
    if (this.map.has(key)) {
      return this.map.get(key);
    }
    this.map.set(key, value);
    return null;
  }
  remove(key) { this.map.delete(key); }
  size() { return this.map.size; }
  keySet() { const keys = [...this.map.keys()]; return { toArray: () => keys }; }
}

const T0 = Date.UTC(2026, 10, 25, 9, 0, 0);

function load(options = {}) {
  const clock = { now: T0 };
  const values = new Map();
  const server = { get: key => (values.has(key) ? values.get(key) : null), set: (key, value) => values.set(key, value) };
  const sandbox = { C8O: {} };
  sandbox.include = file => vm.runInContext(read(file), sandbox, { filename: file });
  vm.createContext(sandbox);
  sandbox.include('js/studio_write_confirm.js');
  sandbox.C8O.writeJournal = {
    host: {
      now: () => clock.now,
      digest: value => crypto.createHash('sha256').update(value, 'utf8').digest('hex'),
      newMap: () => new FakeMap(),
      newDeque: () => new FakeDeque(),
      childQName: () => '',
      warn: () => {},
      urlProject: url => (options.devViewers || {})[url] || ''
    }
  };
  sandbox.include('js/write_journal.js');
  const api = sandbox.C8O.writeJournal;
  const contextFor = (conversation, bearer = 'token-a') => ({
    server,
    httpServletRequest: {
      getHeader: name => (name === 'X-Convertigo-Conversation-Id' ? (conversation || null) : name === 'Authorization' ? 'Bearer ' + bearer : null)
    }
  });
  const conversation = contextFor('conv-1');
  const call = (sequence, answer, args = {}, context = conversation) => {
    const entry = api.recordCall(context, sequence, answer, args, {});
    clock.now += 1000;
    return entry ? plain(entry) : null;
  };
  const stateOf = (id = 'conv-1') => {
    const map = server.get(api.PROOF_STORE_KEY);
    const raw = map ? map.get(id) : null;
    return raw === null ? null : JSON.parse(raw);
  };
  const unproven = (id = 'conv-1') => (stateOf(id) || { unproven: [] }).unproven.map(u => u.qname);
  return { api, clock, server, values, conversation, contextFor, call, stateOf, unproven };
}

// The answers of the tools, as the journal reads them.
const change = q => ['tools_databaseobject_tree_apply', { status: 'ok', touchedQNames: [q], operations: [{ status: 'applied', appliedByAction: { setProperties: 1 } }] }, { target: q, tree: '{"properties":{"comment":"x"}}' }];
const run = (requestable, ok = true) => ['tools_requestable_execute', ok ? { requestable, status: 'ok', payload: {} } : { requestable, status: 'error', error: { message: 'Step failed' } }, { requestable, variables: '{"password":"S3cret!"}' }];
const verify = (verdict, extra = {}) => ['tools_browser_verify', Object.assign({ status: 'finished', verdict, checks: [], finalUrl: 'http://localhost:18080/convertigo/projects/Shop/DisplayObjects/mobile/orders' }, extra), { url: 'http://localhost:18080/convertigo/projects/Shop/DisplayObjects/mobile/' }];

test('a backend change is unproven until its sequence runs ok, and again after the next change', () => {
  const j = load();
  j.call(...change('Shop.sq:list_orders.st:compute'));
  assert.deepEqual(j.unproven(), ['Shop.sq:list_orders.st:compute']);
  const failed = j.call(...run('Shop.list_orders', false));
  assert.equal(failed.status, 'error');
  assert.deepEqual(j.unproven(), ['Shop.sq:list_orders.st:compute'], 'a run in error proves nothing');
  assert.deepEqual(j.stateOf().lastProof, { tool: 'requestable-execute', target: 'Shop.sq:list_orders', at: T0 + 1000, ok: false });
  j.call(...run('Shop.sq:other'));
  assert.deepEqual(j.unproven(), ['Shop.sq:list_orders.st:compute'], 'another sequence proves nothing');
  j.call(...run('Shop.list_orders'));
  assert.deepEqual(j.unproven(), [], 'proven by its sequence');
  j.call(...change('Shop.sq:list_orders.vr:status'));
  assert.deepEqual(j.unproven(), ['Shop.sq:list_orders.vr:status'], 'a change after the proof needs a new one');
});

test('a transaction by its own run, a connector by any of its transactions, a project file by any run of the project', () => {
  const j = load();
  j.call(...change('Shop.cn:db.tr:list_rows'));
  j.call(...change('Shop.cn:db'));
  j.call('tools_project_js_set', { status: 'ok', relativePath: 'app.js', created: false }, { project: 'Shop', filename: 'js/app.js' });
  assert.deepEqual(j.unproven(), ['Shop/js/app.js', 'Shop.cn:db', 'Shop.cn:db.tr:list_rows']);
  assert.deepEqual(j.stateOf().unproven.map(u => u.kind), ['file', 'backend', 'backend']);
  j.call(...run('Shop.db.count_rows'));
  assert.deepEqual(j.unproven(), ['Shop.cn:db.tr:list_rows'], 'the connector and the file are proven, not the other transaction');
  j.call(...run('Shop.cn:db.tr:list_rows'));
  assert.deepEqual(j.unproven(), []);
});

test('crud-proof and seed-proof prove the backend of their project when ok; a page needs a passed verifier', () => {
  const j = load();
  j.call(...change('Shop.sq:crud_list_orders'));
  j.call('tools_ngx_page_create', { status: 'ok', page: 'Shop.Application.NgxApp.pg:Orders', created: ['Shop.Application.NgxApp.pg:Orders'] }, { project: 'Shop' });
  const partialCrud = j.call('tools_crud_proof', { status: 'partial', project: 'Shop', missing: ['Shop.crud_delete_order'] }, { project: 'Shop' });
  assert.deepEqual(partialCrud, { tool: 'crud-proof', proof: { k: 'crud', p: 'Shop', ok: false }, status: 'error' });
  assert.deepEqual(j.unproven(), ['Shop.Application.NgxApp.pg:Orders', 'Shop.sq:crud_list_orders']);
  j.call('tools_crud_proof', { status: 'success', project: 'Shop' }, { project: 'Shop' });
  assert.deepEqual(j.unproven(), ['Shop.Application.NgxApp.pg:Orders'], 'a UI object needs a verifier');
  j.call(...run('Shop.crud_list_orders'));
  assert.deepEqual(j.unproven(), ['Shop.Application.NgxApp.pg:Orders'], 'a run never proves a page');
  j.call(...change('Shop.sq:seed'));
  const seed = j.call('tools_seed_proof', { verdict: 'replayable', requestable: 'Shop.seed', freshRun: false }, { requestable: 'Shop.seed' });
  assert.deepEqual(seed.proof, { k: 'seed', p: 'Shop', r: 'Shop.sq:seed', ok: true });
  assert.deepEqual(j.unproven(), ['Shop.Application.NgxApp.pg:Orders']);
  assert.deepEqual(j.stateOf().lastProof, { tool: 'seed-proof', target: 'Shop.sq:seed', at: T0 + 6000, ok: true });
});

test('verifier reports: passed proves the project, partial only the pages of its passed checks, failed nothing', () => {
  const j = load();
  j.call('tools_ngx_page_create', { status: 'ok', page: 'Shop.Application.NgxApp.pg:Orders', created: ['Shop.Application.NgxApp.pg:Orders'] }, { project: 'Shop' });
  j.call('tools_ngx_page_create', { status: 'ok', page: 'Shop.Application.NgxApp.pg:Home', created: ['Shop.Application.NgxApp.pg:Home'] }, { project: 'Shop' });
  j.call(...change('Shop.Application.NgxApp.pg:Orders.ct:list'));
  j.call(...verify('failed', { checks: [{ path: 'Orders', check: 'the list shows', status: 'failed' }] }));
  assert.deepEqual(j.unproven().sort(), ['Shop.Application.NgxApp.pg:Home', 'Shop.Application.NgxApp.pg:Orders']);
  assert.equal(j.stateOf().lastProof.ok, false);
  const partial = j.call(...verify('partial', { checks: [
    { path: 'Orders list', check: 'five orders', status: 'passed', evidence: 'Order #123 for jane@example.org' },
    { path: 'Home', check: 'the dashboard', status: 'not_checked' }] }));
  assert.deepEqual(partial.proof, { k: 'verifier', p: 'Shop', ok: false, v: 'partial', pages: ['Orders list'] }, 'path names only, never evidence');
  assert.deepEqual(j.unproven(), ['Shop.Application.NgxApp.pg:Home'], 'the page its passed check walked, with what is under it');
  j.call(...change('Shop.sq:orders'));
  j.call('tools_subagent_run', { status: 'finished', profile: 'verifier', runId: 'r1', report: { verdict: 'passed', checks: [], finalUrl: 'http://localhost:18080/convertigo/projects/Shop/DisplayObjects/mobile/' } }, { profile: 'verifier', task: 't' });
  assert.deepEqual(j.unproven(), [], 'a passed verifier proves the pages and the backend of its project');
  assert.deepEqual(j.stateOf().lastProof, { tool: 'subagent-run', target: 'Shop', at: T0 + 6000, ok: true });
  assert.equal(j.call('tools_subagent_run', { status: 'finished', profile: 'constructor', report: { verdict: 'passed' } }, { profile: 'constructor' }), null);
  assert.equal(j.call('tools_browser_verify', { status: 'running', verificationId: 'v2' }, { url: 'x' }), null);
});

test('a dev viewer URL names its project through the engine, else the only project with UI changes', () => {
  const j = load({ devViewers: { 'http://localhost:8100/': 'Crm' } });
  j.call('tools_ngx_theme_apply', { status: 'ok', project: 'Crm', style: 'brand' }, { project: 'Crm' });
  assert.deepEqual(j.stateOf().unproven, [{ qname: 'Crm', project: 'Crm', kind: 'ui', changedAt: T0 }]);
  const entry = j.call('tools_browser_verify', { status: 'finished', verdict: 'passed', checks: [], finalUrl: 'http://localhost:8100/home' }, { url: 'http://localhost:8100/' });
  assert.equal(entry.proof.p, 'Crm');
  assert.deepEqual(j.unproven(), []);
  const k = load();
  k.call(...change('Crm.Application.NgxApp.pg:Home'));
  k.call('tools_browser_verify', { status: 'finished', verdict: 'passed', checks: [] }, { verificationId: 'v1' });
  assert.deepEqual(k.unproven(), [], 'no project named: the only project with UI changes');
});

test('deleted objects and objects created then deleted need no proof; a rename carries the change', () => {
  const j = load();
  j.call('tools_databaseobject_tree_apply', { status: 'ok', operations: [{ status: 'applied', applied: [
    { action: 'create', qname: 'Shop.sq:tmp_probe' }, { action: 'create', qname: 'Shop.sq:report' }] }] }, { target: 'Shop', responseDetail: 'full' });
  j.call(...change('Shop.sq:report.st:a'));
  j.call('tools_databaseobject_delete', { status: 'ok', qname: 'Shop.sq:tmp_probe', removed: true }, { qname: 'Shop.sq:tmp_probe' });
  assert.deepEqual(j.unproven(), ['Shop.sq:report'], 'the step folds into its sequence');
  j.call('tools_databaseobject_rename', { status: 'ok', renamed: true, qname: 'Shop.sq:report', newQName: 'Shop.sq:sales_report' }, {});
  assert.deepEqual(j.unproven(), ['Shop.sq:sales_report']);
  j.call('tools_databaseobject_delete', { status: 'ok', qname: 'Shop.sq:sales_report', removed: true }, {});
  assert.deepEqual(j.unproven(), []);
  assert.equal(j.stateOf().writes, 5);
});

test('the store: the exact JSON of the contract, per raw conversation id, never a value, and only with a conversation', () => {
  const j = load();
  j.call(...change('Shop.sq:list_orders'));
  j.call(...run('Shop.list_orders', false));
  const raw = j.server.get('lib_ConvertigoMCP.proofState').get('conv-1');
  assert.equal(typeof raw, 'string');
  assert.deepEqual(JSON.parse(raw), {
    v: 1, at: T0 + 1000, writes: 1,
    unproven: [{ qname: 'Shop.sq:list_orders', project: 'Shop', kind: 'backend', changedAt: T0 }],
    lastProof: { tool: 'requestable-execute', target: 'Shop.sq:list_orders', at: T0 + 1000, ok: false }
  });
  assert.doesNotMatch(raw, /S3cret/);
  // a call without X-Convertigo-Conversation-Id (a durable token) writes no state
  j.call(...change('Shop.sq:x'), j.contextFor(null, 'other'));
  assert.deepEqual([...j.server.get('lib_ConvertigoMCP.proofState').map.keys()], ['conv-1']);
  // the router's id wins over the header, an invalid id writes nothing
  j.api.recordCall(j.contextFor('bad id!'), ...change('Shop.sq:y'), { conversationId: 'conv-2' });
  assert.ok(j.stateOf('conv-2'));
  j.api.recordCall(j.contextFor('bad id!'), ...change('Shop.sq:z'), {});
  assert.equal(j.server.get('lib_ConvertigoMCP.proofState').get('bad id!'), null);
});

test('the store is bounded: 64 conversations, 40 unproven items (the latest first), 24 h', () => {
  const j = load();
  for (let i = 0; i < 70; i++) {
    j.call(...change('Shop.sq:s' + i), j.contextFor('c' + i));
  }
  const map = j.server.get('lib_ConvertigoMCP.proofState');
  assert.equal(map.size(), 64);
  assert.equal(map.get('c0'), null, 'the oldest at leaves first');
  for (let i = 0; i < 45; i++) {
    j.call(...change('Shop.sq:big' + i), j.contextFor('big'));
  }
  const big = j.stateOf('big');
  assert.equal(big.unproven.length, 40);
  assert.equal(big.unproven[0].qname, 'Shop.sq:big44');
  assert.equal(big.writes, 45);
  j.clock.now += 24 * 3600000;
  j.call(...run('Other.x'), j.contextFor('big'));
  assert.deepEqual(j.stateOf('big').unproven, [], 'changes past 24 h are not counted');
  assert.equal(map.size(), 1, 'conversations not written for 24 h leave');
});

test('project-changes answers unproven and tells how to report it', () => {
  const j = load();
  j.call(...change('Shop.sq:list_orders'));
  j.call(...change('Lib.sq:shared'));
  const answer = plain(j.api.execute(j.conversation, {}));
  assert.deepEqual(answer.unproven, ['Lib.sq:shared: changed at 09:00:01, no proof since', 'Shop.sq:list_orders: changed at 09:00:00, no proof since']);
  assert.match(answer.unprovenNote, /name every one of them in the final summary as not verified, and never call them fixed, working or OK/);
  assert.match(answer.howToUse, /Name every object of unproven as not verified: never call it fixed, working or OK; or prove it first\.$/);
  assert.deepEqual(plain(j.api.execute(j.conversation, { project: 'Shop' })).unproven, ['Shop.sq:list_orders: changed at 09:00:00, no proof since']);
  j.call(...run('Shop.list_orders'));
  j.call(...run('Lib.shared'));
  const proven = plain(j.api.execute(j.conversation, {}));
  assert.equal(proven.unproven, undefined);
});

test('the router journals the proof tools, which are reads, and documents the contract', () => {
  const router = read('js/mcp_endpoint_router.js');
  assert.match(router, /var proofTools = \{ tools_crud_proof: true, tools_seed_proof: true, tools_browser_verify: true \};/);
  assert.match(router, /WRITE_TOOLS\[sequenceName\] === undefined && proofTools\[sequenceName\] !== true/);
  const journal = read('js/write_journal.js');
  assert.match(journal, /under the key "lib_ConvertigoMCP\.proofState": a\n\s+\/\/ java\.util\.concurrent\.ConcurrentHashMap from the RAW conversation id/);
  const doc = read('docs/proof-state-contract.md');
  assert.match(doc, /lib_ConvertigoMCP\.proofState/);
  assert.match(doc, /"kind":"backend"\|"ui"\|"file"/);
});
