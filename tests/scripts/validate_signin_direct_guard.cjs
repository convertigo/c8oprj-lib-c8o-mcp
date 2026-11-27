// Run: node --test tests/scripts/validate_signin_direct_guard.cjs
// A login sequence run directly by requestable-execute (not in before) answered "Invalid email or password" 61 times to
// one agent guessing passwords (TigoAccess 8e1d46fe, 13-18/11): the guard of js/before_guard.js covered before[] only
// and its hint came on "Authentication required" only. A target that signs a user in (a SetAuthenticatedUserStep, an
// LDAPAuthenticationStep, setAuthenticatedUser( in a JavaScript step, or a call of a sequence that does) and answers an
// error now goes to that guard: the same values are refused, and every try after 3 different values; the answer says
// not to guess.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const T0 = Date.UTC(2026, 10, 27, 9, 0, 0);

class FakeMap {
  constructor() { this.map = new Map(); }
  get(key) { return this.map.has(key) ? this.map.get(key) : null; }
  put(key, value) { this.map.set(key, value); }
  remove(key) { this.map.delete(key); }
  size() { return this.map.size; }
  keySet() { const keys = [...this.map.keys()]; return { toArray: () => keys }; }
}

const jlist = items => ({ size: () => items.length, get: i => items[i] });
// A bean of the engine: its class, its children, an expression or a called sequence, enabled or not.
function bean(className, options = {}) {
  return {
    getClass: () => ({ getName: () => 'com.twinsoft.convertigo.beans.' + className }),
    getAllChildren: () => jlist(options.children || []),
    getExpression: () => options.expression || '',
    getSourceSequence: () => options.calls || '',
    isEnabled: () => options.enabled !== false
  };
}

function engine(sequences = {}) {
  const clock = { now: T0 };
  const headers = { 'X-Convertigo-Conversation-Id': 'conv-1', Authorization: 'Bearer t' };
  const values = new Map();
  const server = { get: key => (values.has(key) ? values.get(key) : null), set: (key, value) => values.set(key, value) };
  const host = {
    now: () => clock.now,
    digest: value => crypto.createHash('sha256').update(value, 'utf8').digest('hex'),
    newMap: () => new FakeMap(),
    sequenceOf: qname => sequences[qname] || null
  };
  const ctx = {
    C8O: {},
    java: { lang: { System: { currentTimeMillis: () => clock.now } } },
    Packages: {},
    context: { server, httpServletRequest: { getHeader: name => headers[name] || null } }
  };
  vm.createContext(ctx);
  ctx.include = file => {
    if (file === 'js/before_guard.js') {
      ctx.C8O.beforeGuard = { host };
    }
    if (file === 'js/repeated_failure.js') {
      ctx.C8O.repeatedFailure = { host };
    }
    vm.runInContext(read(file), ctx, { filename: file });
  };
  ctx.include('js/util.js');
  return { R: ctx.C8O.requestable, ctx, headers, clock };
}

test('a sign-in is a SetAuthenticatedUserStep, an LDAP authentication, setAuthenticatedUser( in a script, or a call of one', () => {
  const lib = bean('core.Sequence', { children: [bean('steps.SetAuthenticatedUserStep')] });
  const { ctx } = engine({ 'lib_UserManager.SignIn': lib });
  ctx.include('js/before_guard.js');
  const G = ctx.C8O.beforeGuard;
  assert.equal(G.signsIn(bean('core.Sequence', { children: [bean('steps.SetAuthenticatedUserStep')] })), true);
  assert.equal(G.signsIn(bean('core.Sequence', { children: [bean('steps.LDAPAuthenticationStep')] })), true);
  assert.equal(G.signsIn(bean('core.Sequence', { children: [bean('steps.IfStep', { children: [bean('steps.SimpleStep', { expression: 'context.setAuthenticatedUser(email);' })] })] })), true, 'inside a block');
  assert.equal(G.signsIn(bean('core.Sequence', { children: [bean('steps.SequenceStep', { calls: 'lib_UserManager.SignIn' })] })), true, 'an application login calling a library');
  assert.equal(G.signsIn(bean('core.Sequence', { children: [bean('steps.SetAuthenticatedUserStep', { enabled: false })] })), false, 'a disabled step signs no one in');
  assert.equal(G.signsIn(bean('core.Sequence', { children: [bean('steps.SimpleStep', { expression: 'var x = context.getAuthenticatedUser();' })] })), false);
  assert.equal(G.signsIn(bean('core.Sequence', { children: [bean('steps.SequenceStep', { calls: 'App.unknown' })] })), false);
  // a sequence called many times is walked once
  const lookups = [];
  const helper = bean('core.Sequence', { children: [bean('steps.JsonObjectStep')] });
  G.host.sequenceOf = qname => { lookups.push(qname); return helper; };
  const many = bean('core.Sequence', { children: [1, 2, 3].map(() => bean('steps.SequenceStep', { calls: 'App.helper' })) });
  assert.equal(G.signsIn(many), false);
  assert.deepEqual(lookups, ['App.helper']);
});

test('a direct sign-in that refused its values is refused again with them, and after 3 different values', () => {
  const login = bean('core.Sequence', { children: [bean('steps.SetAuthenticatedUserStep')] });
  const { R, headers } = engine();
  const plan = variables => ({ requestable: 'Shop.Login', project: 'Shop', name: 'Login', isSequence: true, variables });
  const failure = () => ({ status: 'error', error: { message: 'Invalid email or password' } });

  const first = plan({ email: 'demo@example.invalid', password: 'guess1' });
  R.guardSignIn(first, login);
  assert.equal(first.signIn, true);
  const answer = failure();
  R.afterCall(first, answer);
  assert.match(answer.error.hint, /^Shop\.Login signs a user in and refused these values \(1 of 3 different values in this conversation\)\. Never guess or try passwords: take the test account from the project notes or project-brief, else ask the user once for one\. These values are refused from now on in this conversation, and every try after 3 different values\./);

  assert.throws(() => R.guardSignIn(plan({ password: 'guess1', email: 'demo@example.invalid' }), login),
    /^Error: Refused without running anything: Shop\.Login signs a user in and already answered an error in this conversation with these same values .* Shop\.Login was not run\.$/);
  for (const password of ['guess2', 'guess3']) {
    const next = plan({ email: 'demo@example.invalid', password });
    R.guardSignIn(next, login);
    R.afterCall(next, failure());
  }
  assert.throws(() => R.guardSignIn(plan({ email: 'demo@example.invalid', password: 'guess4' }), login),
    /Refused without running anything: Shop\.Login signs a user in and already answered an error 3 times in this conversation with different values\. Trying values is guessing a password: stop\./);

  // the same digests as a before sign-in: a before with failed values is refused too
  assert.equal(R._signInName({ project: 'Shop', name: 'Login', isSequence: true }), 'Shop.Login');
  headers['X-Convertigo-Conversation-Id'] = 'conv-2';
  assert.doesNotThrow(() => R.guardSignIn(plan({ email: 'demo@example.invalid', password: 'guess4' }), login), 'another conversation runs it');
});

test('a sequence that signs no one in, or a success, is left alone', () => {
  const { R } = engine();
  const orders = { requestable: 'Shop.Orders', project: 'Shop', name: 'Orders', isSequence: true, variables: {} };
  R.guardSignIn(orders, bean('core.Sequence', { children: [bean('steps.JsonObjectStep')] }));
  assert.equal(orders.signIn, undefined);
  const answer = { status: 'error', error: { message: 'Invalid email or password' } };
  R.afterCall(orders, answer);
  assert.equal(answer.error.hint, undefined, 'no sign-in hint on another sequence');
  const login = { requestable: 'Shop.Login', project: 'Shop', name: 'Login', isSequence: true, variables: { password: 'right' } };
  R.guardSignIn(login, bean('core.Sequence', { children: [bean('steps.SetAuthenticatedUserStep')] }));
  const ok = { status: 'ok', payload: {} };
  R.afterCall(login, ok);
  assert.deepEqual(Object.keys(ok), ['status', 'payload']);
  assert.doesNotThrow(() => R.guardSignIn(login, bean('core.Sequence', { children: [bean('steps.SetAuthenticatedUserStep')] })));
});

test('requestable-execute checks a sign-in before running it and hands its answer to afterCall', () => {
  const util = read('js/util.js');
  assert.match(util, /C8O\.requestable\.guardSignIn\(executionPlan, knownSequence\);\n\s+seqStep\.setSourceSequence\(/);
  const yaml = read('_c8oProject/sequences/tools_requestable_execute.yaml');
  assert.match(yaml, /requestableExecutionResult = _compactPayload\(_json\(requestableResponse\)\);\n\s+\/\/ A sign-in that refused its values, the same cause again, a success after failures \(js\/util\.js\)\.\n\s+if \(C8O\.requestable && C8O\.requestable\.afterCall\) \{\n\s+C8O\.requestable\.afterCall\(executionPlan, requestableExecutionResult\);/);
});
