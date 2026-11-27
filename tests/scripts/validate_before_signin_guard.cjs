// Run: node --test tests/scripts/validate_before_signin_guard.cjs
// requestable-execute answered "Authentication required"; the agent then ran a login through before with a wrong
// password 8 times in a row, though the guide forbids guessing passwords, and never used authenticatedUser nor
// viewer-sign-in (feedback reports 25/11). The hint names the three ways and says to ask the user once for a test
// account; js/before_guard.js refuses a before that already answered an error in the conversation with the same values
// (and a third different try of the same sign-in), without running anything, keeping digests only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const T0 = Date.UTC(2026, 10, 25, 9, 0, 0);

class FakeMap {
  constructor() { this.map = new Map(); }
  get(key) { return this.map.has(key) ? this.map.get(key) : null; }
  put(key, value) { this.map.set(key, value); }
  remove(key) { this.map.delete(key); }
  size() { return this.map.size; }
  keySet() { const keys = [...this.map.keys()]; return { toArray: () => keys }; }
}

function hostOf(clock) {
  return {
    now: () => clock.now,
    digest: value => crypto.createHash('sha256').update(value, 'utf8').digest('hex'),
    newMap: () => new FakeMap()
  };
}

function store() {
  const values = new Map();
  return { values, get: key => (values.has(key) ? values.get(key) : null), set: (key, value) => values.set(key, value) };
}

function loadGuard(clock) {
  const sandbox = { C8O: {} };
  vm.createContext(sandbox);
  sandbox.C8O.beforeGuard = { host: hostOf(clock) };
  vm.runInContext(read('js/before_guard.js'), sandbox, { filename: 'js/before_guard.js' });
  return sandbox.C8O.beforeGuard;
}

test('the Authentication required hint names the three ways and forbids guessing', () => {
  const yaml = read('_c8oProject/sequences/tools_requestable_execute.yaml');
  const start = yaml.indexOf('        if (/^Authentication required\\b/');
  const block = yaml.slice(start, yaml.indexOf('        }\n', start) + 10);
  const ctx = { out: { error: { message: 'Authentication required' } }, executionPlan: {} };
  vm.createContext(ctx);
  vm.runInContext(block, ctx);
  const hint = ctx.out.error.hint;
  assert.match(hint, /\(1\) authenticatedUser: the user name the login sequence sets/);
  assert.match(hint, /\(2\) before: \[\{requestable: "<project>\.<login sequence>", variables: \{\.\.\.\}\}\] when it also needs what the login stores in the session/);
  assert.match(hint, /\(3\) viewer-sign-in, for the pages/);
  assert.match(hint, /if none is known, ask the user once for one\. Never guess or try passwords/);
});

test('a failed sign-in is refused again with the same values, by digest only', () => {
  const clock = { now: T0 };
  const guard = loadGuard(clock);
  const server = store();
  const scope = guard.host.digest('scope of conversation c1');
  const login = { requestable: 'App.login', variables: { user: 'admin', password: 'Wr0ngSecret!' } };
  assert.equal(guard.check(server, scope, [login], clock.now), null, 'nothing failed yet');
  guard.remember(server, scope, login.requestable, login.variables, clock.now);
  const refused = guard.check(server, scope, [{ requestable: 'App.login', variables: { password: 'Wr0ngSecret!', user: 'admin' } }], clock.now + 1000);
  assert.equal(refused.index, 0);
  assert.match(refused.message, /^Refused without running anything: before\[0\] App\.login already answered an error in this conversation with these same values/);
  assert.match(refused.message, /ask the user once for a working test account .*or run the call with authenticatedUser/);
  assert.equal(guard.check(server, scope, [{ requestable: 'App.login', variables: { user: 'admin', password: 'other' } }], clock.now), null,
    'other values are not refused at once');
  assert.equal(guard.check(server, guard.host.digest('another conversation'), [login], clock.now), null, 'per conversation');
  const kept = JSON.stringify([...server.get(guard.STORE_KEY).map.values()]);
  assert.doesNotMatch(kept, /Wr0ngSecret|admin|App\.login/, 'digests only, never a value nor the requestable in clear');
  clock.now += guard.KEEP_MS;
  assert.equal(guard.check(server, scope, [login], clock.now), null, 'forgotten after 24 h');
});

test('the same sign-in failing with three different values is a guessing loop', () => {
  const clock = { now: T0 };
  const guard = loadGuard(clock);
  const server = store();
  const scope = 's';
  ['a1', 'a2', 'a3'].forEach((password, i) => {
    assert.equal(guard.check(server, scope, [{ requestable: 'App.login', variables: { password } }], clock.now), null, 'try ' + i);
    guard.remember(server, scope, 'App.login', { password }, clock.now);
    clock.now += 1000;
  });
  const refused = guard.check(server, scope, [{ requestable: 'App.warm' }, { requestable: 'App.login', variables: { password: 'a4' } }], clock.now);
  assert.equal(refused.index, 1);
  assert.match(refused.message, /already answered an error 3 times in this conversation with different values\. Trying values is guessing a password: stop\./);
  // the same failing values again do not count twice
  const other = store();
  guard.remember(other, scope, 'App.login', { password: 'x' }, clock.now);
  guard.remember(other, scope, 'App.login', { password: 'x' }, clock.now);
  assert.equal(guard.check(other, scope, [{ requestable: 'App.login', variables: { password: 'y' } }], clock.now), null);
});

test('the store is bounded: 64 conversations, 50 digests each', () => {
  const clock = { now: T0 };
  const guard = loadGuard(clock);
  const server = store();
  for (let i = 0; i < 70; i++) {
    guard.remember(server, 'scope' + i, 'App.login', { password: 'p' + i }, clock.now + i);
  }
  const map = server.get(guard.STORE_KEY);
  assert.equal(map.size(), 64);
  assert.equal(map.get('scope0'), null, 'the oldest conversations left first');
  for (let i = 0; i < 60; i++) {
    guard.remember(server, 'big', 'App.r' + i, {}, clock.now + 100 + i);
  }
  assert.equal(Object.keys(JSON.parse(map.get('big')).d).length, 50);
});

test('runBefore refuses a known failed sign-in without running anything, per conversation', () => {
  const clock = { now: T0 };
  const calls = [];
  const answers = [];
  function JavaMap() { this.m = {}; }
  JavaMap.prototype.put = function (k, v) { this.m[k] = v; };
  const headers = { 'X-Convertigo-Conversation-Id': 'conv-1', Authorization: 'Bearer t' };
  const server = store();
  const ctx = {
    C8O: {},
    java: { lang: { System: { currentTimeMillis: () => 1 } } },
    context: {
      server,
      getAuthenticatedUser: () => null,
      setAuthenticatedUser() {},
      removeAuthenticatedUser() {},
      httpServletRequest: { getHeader: name => headers[name] || null },
      httpSession: { getAttributeNames: () => ({ hasMoreElements: () => false }), removeAttribute() {} }
    },
    Packages: { org: { apache: { log4j: { MDC: { get: () => null } } } }, java: { util: { HashMap: JavaMap } }, com: { twinsoft: { convertigo: { engine: {
      Engine: { theApp: { contextManager: { remove() {} } } },
      enums: { JsonOutput: { JsonRoot: { docNode: 'doc' } } },
      util: { XMLUtils: { XmlToJson: doc => JSON.stringify(doc) } },
      requesters: { InternalRequester: function (params) {
        this.processRequest = () => {
          calls.push(params.m);
          const answer = answers.shift();
          return { getDocumentElement: () => ({ document: answer && answer.error ? { error: answer.error } : {} }) };
        };
        this.getContext = () => null;
      } }
    } } } } }
  };
  vm.createContext(ctx);
  ctx.include = file => {
    if (file === 'js/before_guard.js') {
      ctx.C8O.beforeGuard = { host: hostOf(clock) };
    }
    vm.runInContext(read(file), ctx, { filename: file });
  };
  ctx.include('js/util.js');
  const R = ctx.C8O.requestable;
  const before = [{ requestable: 'App.sq:login', variables: { user: 'demo', password: 'guess1' } }];
  answers.push({ error: { message: 'Wrong login or password' } });
  assert.throws(() => R.runBefore({ requestable: 'App.orders', before: JSON.stringify(before) }),
    /before\[0\] App\.sq:login answered an error: Wrong login or password\. App\.orders was not run\. The same before with the same values is refused in this conversation from now on: never guess a password/);
  assert.equal(calls.length, 1);
  const plan = { requestable: 'App.orders', before: [{ requestable: 'App.login', variables: { password: 'guess1', user: 'demo' } }] };
  assert.throws(() => R.runBefore(plan), /^Error: Refused without running anything: before\[0\] App\.login already answered an error in this conversation with these same values.* App\.orders was not run\.$/);
  assert.equal(calls.length, 1, 'nothing ran: neither the login nor the call');
  assert.deepEqual(JSON.parse(JSON.stringify(plan.beforeResults)), [{ requestable: 'App.login', status: 'refused' }]);
  headers['X-Convertigo-Conversation-Id'] = 'conv-2';
  answers.push({});
  R.runBefore({ requestable: 'App.orders', before: before });
  assert.equal(calls.length, 2, 'another conversation runs it');
});
