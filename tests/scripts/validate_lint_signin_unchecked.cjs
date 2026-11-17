// Agents adding users and roles to a CRUD app wired the app's auth_login to a library's SignIn (17/11). One login read
// the user SignIn answered but never its ./document/error: a wrong password answered like a success (HTTP 200, no
// error) and a login page would take the user as signed in. project-lint reports a call that signs a user in (the
// security audit's sessionChange "open", a library's sign-in included) when no step of the sequence reads its
// ./document/error (SEQ-SIGNIN-UNCHECKED, an error).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const javaProxy = new Proxy(function () {}, { get: () => javaProxy, apply: () => javaProxy, construct: () => javaProxy });
const plain = value => JSON.parse(JSON.stringify(value));

function load() {
  const sandbox = { C8O: { dbo: { getDirectChildren: b => (b && b.children ? b.children.slice() : []), safeName: b => b.getName() }, util: {} },
    Packages: javaProxy, JSON, include() {} };
  vm.createContext(sandbox);
  for (const file of ['security_audit_rules.js', 'security_audit_collect.js', 'step_sources.js', 'tools_project_lint.js']) {
    vm.runInContext(read('js/' + file), sandbox, { filename: file });
  }
  return sandbox.C8O;
}

// Fake engine beans: the library seen by the audit collector, and the steps of the app's login.
function bean(className, name, props, children) {
  const p = props || {};
  const b = { getClass: () => ({ getSimpleName: () => className, getName: () => 'com.twinsoft.convertigo.beans.steps.' + className }),
    getName: () => name, getComment: () => p.comment || '', isEnabled: () => p.enabled !== false, children: children || [],
    getFullQName: () => 'App.auth_login.' + name, priority: p.priority };
  if (p.sequence !== undefined) b.getSourceSequence = () => p.sequence;
  if (p.transaction !== undefined) b.getSourceTransaction = () => p.transaction;
  if (p.source !== undefined) b.getSourceDefinition = () => p.source;
  return b;
}
const variable = (name, source) => Object.assign(bean('StepVariable', name, { source }), {
  getClass: () => ({ getSimpleName: () => 'StepVariable', getName: () => 'com.twinsoft.convertigo.beans.variables.StepVariable' }) });

function library() {
  const objects = {
    'lib.SignIn': { kind: 'sequence', dbo: bean('GenericSequence', 'SignIn', { comment: 'Performs a user sign in' },
      [bean('TransactionStep', 'read', { transaction: 'lib.fs.GetAccountDocument' }), bean('SetAuthenticatedUserStep', 'set')]) },
    'lib.GetUserAttribute': { kind: 'sequence', dbo: bean('GenericSequence', 'GetUserAttribute', {},
      [bean('TransactionStep', 'read', { transaction: 'lib.fs.GetAccountDocument' })]) },
    'lib.fs.GetAccountDocument': { kind: 'transaction', dbo: bean('GetDocumentTransaction', 'GetAccountDocument') }
  };
  return target => objects[target] || null;
}

// The security audit model of the app: a login calling the library's sign-in, and the session change of each call.
function auditOf(C8O) {
  const model = { project: { name: 'App' }, requestables: [
    { qname: 'App.auth_login', kind: 'sequence', accessibility: 'Hidden', authenticatedContextRequired: false, calls: ['lib.SignIn', 'lib.GetUserAttribute'] }
  ], steps: [], variables: [], references: [], warnings: [] };
  C8O.securityAudit.collectExternal(model, library());
  return {
    writesOf: target => C8O.securityAudit.writesReachedFrom(model, target),
    sessionOf: target => C8O.securityAudit.sessionChange(model, target)
  };
}

// The flow of a login as project-lint builds it: the steps in order, the priorities their sources and the sources of their
// variables read, and the paths they read (js/step_sources.js refsOf).
function flowOf(C8O, steps) {
  const flow = { qname: 'App.auth_login', steps: [], read: {}, answerReads: {}, declared: {} };
  const visit = (node, enabled) => {
    C8O.stepSources.refsOf(node).forEach(ref => {
      flow.read[ref.priority] = true;
      (flow.answerReads[ref.priority] = flow.answerReads[ref.priority] || []).push({ xpath: ref.xpath, enabled });
    });
    node.children.forEach(child => visit(child, enabled && child.isEnabled()));
  };
  steps.forEach(s => {
    visit(s, s.isEnabled());
    flow.steps.push({ qname: s.getFullQName(), name: s.getName(), className: s.getClass().getSimpleName(), priority: String(s.priority),
      target: s.getSourceSequence ? s.getSourceSequence() : '', output: false, enabled: s.isEnabled(), constant: null, nodeName: '' });
  });
  return flow;
}

// auth_login's inputs are username and password; SignIn's variables are user and password.
function login(afterSignIn, signInProps) {
  return [
    bean('InputVariablesStep', 'Input', { priority: 1 }),
    bean('SequenceStep', 'SignIn', Object.assign({ priority: 2, sequence: 'lib.SignIn' }, signInProps || {}),
      [variable('user', ['1', './username/text()']), variable('password', ['1', './password/text()'])]),
    ...afterSignIn,
    bean('SequenceStep', 'Role', { priority: 9, sequence: 'lib.GetUserAttribute' }, [variable('user', ['1', './username/text()'])]),
    bean('XMLElementStep', 'role', { priority: 10, source: ['9', './document/value/text()'] })
  ];
}

test('a login that reads the user the sign-in answers but not its ./document/error is reported, as an error', () => {
  const C8O = load();
  const audit = auditOf(C8O);
  assert.equal(audit.sessionOf('lib.SignIn'), 'open');
  const flow = flowOf(C8O, login([bean('XMLElementStep', 'user', { priority: 3, source: ['2', './document/user/text()'] })]));
  const found = plain(C8O.lint.uncheckedCalls([flow], audit.writesOf, audit.sessionOf));
  assert.deepEqual(found.map(f => f.rule + ' ' + f.severity + ' ' + f.qname), ['SEQ-SIGNIN-UNCHECKED error App.auth_login.SignIn']);
  assert.match(found[0].message, /calls lib\.SignIn, which signs the user in, and no step tests its \.\/document\/error/);
  assert.match(found[0].message, /a wrong password\), the sequence goes on and answers like a success, and a login page takes the user as signed in/);
  assert.match(found[0].fix, /IfExistThenElseStep sourced on the call's \.\/document\/error whose then branch holds an XMLErrorStep/);
  // the step variables of the role read source the input, not the sign-in: no read of the sign-in's error there either
  const unread = flowOf(C8O, login([]));
  const again = plain(C8O.lint.uncheckedCalls([unread], audit.writesOf, audit.sessionOf));
  assert.deepEqual(again.map(f => f.rule), ['SEQ-SIGNIN-UNCHECKED']);
  assert.match(again[0].message, /which signs the user in, and no step reads its answer: when it refuses the credentials/);
});

test('a login that tests the sign-in\'s ./document/error, or reads its whole answer, is not reported', () => {
  const C8O = load();
  const audit = auditOf(C8O);
  const checked = flowOf(C8O, login([
    bean('IfExistThenElseStep', 'Refused', { priority: 3, source: ['2', './document/error'] }, [
      bean('ThenStep', 'then', { priority: 4 }, [bean('XMLErrorStep', 'Error', { priority: 5 }), bean('ReturnStep', 'Stop', { priority: 6 })])
    ]),
    bean('XMLElementStep', 'user', { priority: 7, source: ['1', './username/text()'] })
  ]));
  const whole = flowOf(C8O, login([bean('JsonSourceStep', 'answer', { priority: 3, source: ['2', './document'] })]));
  assert.deepEqual(plain(C8O.lint.uncheckedCalls([checked, whole], audit.writesOf, audit.sessionOf)), []);
  // passed to the caller, the answer carries its error element
  const passed = flowOf(C8O, login([]));
  passed.steps[1].output = true;
  assert.deepEqual(plain(C8O.lint.uncheckedCalls([passed], audit.writesOf, audit.sessionOf)), []);
});

test('an error test in a disabled step does not count; without the paths, any read of the answer counts', () => {
  const C8O = load();
  const audit = auditOf(C8O);
  const disabled = flowOf(C8O, login([bean('IfExistThenElseStep', 'Refused', { priority: 3, source: ['2', './document/error'], enabled: false })]));
  assert.deepEqual(plain(C8O.lint.uncheckedCalls([disabled], audit.writesOf, audit.sessionOf)).map(f => f.rule), ['SEQ-SIGNIN-UNCHECKED']);
  const noPaths = flowOf(C8O, login([bean('XMLElementStep', 'user', { priority: 3, source: ['2', './document/user/text()'] })]));
  delete noPaths.answerReads;
  assert.deepEqual(plain(C8O.lint.uncheckedCalls([noPaths], audit.writesOf, audit.sessionOf)), []);
  assert.equal(C8O.lint.readsCallError({ read: { 2: true }, answerReads: { 2: [{ xpath: 'count(./document/error) = 0', enabled: true }] } }, '2'), true);
  assert.equal(C8O.lint.readsCallError({ read: { 2: true }, answerReads: { 2: [{ xpath: './document/', enabled: true }] } }, '2'), true);
  assert.equal(C8O.lint.readsCallError({ read: { 2: true }, answerReads: { 2: [{ xpath: './document/user', enabled: true }] } }, '2'), false);
});

test('project-lint gives the flows the paths their sources read', () => {
  const source = read('js/tools_project_lint.js');
  assert.match(source, /C8O\.stepSources\.refsOf\(node\)\.forEach\(function \(ref\) \{\n\s+\(flow\.answerReads\[ref\.priority\]/);
  assert.match(source, /walk\(node, on\);\n\s+\}\n\s+\}\)\(sequence, true\);/);
});
