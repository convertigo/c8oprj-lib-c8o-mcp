// PCA eval 30/10 (m2): the reminder job was Hidden without authenticatedContextRequired and wrote notifications, so anyone
// could run it, as in m1. The audit flags it and refuses its suppression, but the agent never ran the audit; it ran
// project-lint, which said nothing. project-lint now reports such a requestable (SEC-ANONYMOUS-WRITE), from the audit's rules.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const javaProxy = new Proxy(function () {}, { get: () => javaProxy, apply: () => javaProxy, construct: () => javaProxy });

function load() {
  const sandbox = { C8O: { dbo: {}, util: {} }, Packages: javaProxy, JSON, include() {} };
  vm.createContext(sandbox);
  vm.runInContext(read('js/security_audit_rules.js'), sandbox, { filename: 'security_audit_rules.js' });
  vm.runInContext(read('js/tools_project_lint.js'), sandbox, { filename: 'tools_project_lint.js' });
  return sandbox.C8O;
}

const seq = (name, accessibility, auth, calls) => ({ qname: 'P.' + name, kind: 'sequence', accessibility, authenticatedContextRequired: auth, calls: calls || [] });
const tx = (name, writes) => ({ qname: 'P.db.' + name, kind: 'transaction', accessibility: 'Private', authenticatedContextRequired: false, calls: [], writes });
const jsStep = (owner, signals) => ({ qname: owner + '.st:logic', owner, stepClass: 'SimpleStep', kind: 'js', enabled: true,
  signals: Object.assign({ dynamicCode: false, privileged: [], weakPasswordHash: false, managesPassword: false, removesUser: false, setsUser: false, endsSession: false }, signals) });

// The app m2 built: a demo login that journals, a Hidden reminder job without authentication that writes, a guarded list.
function pcaApp() {
  return {
    project: { name: 'P', version: '1.0.0', corsOrigin: 'https://app.example.com', httpSessionTimeout: 1800, contextTimeout: 300 },
    engine: null,
    requestables: [
      seq('auth_loginDemo', 'Hidden', false, ['P.db.w_journal_insert']),
      seq('reminder_runDaily', 'Hidden', false, ['P.db.w_notification_insert']),
      seq('poste_list', 'Hidden', true, ['P.db.q_postes']),
      seq('seed_demo', 'Private', false, ['P.db.w_notification_insert']),
      tx('w_journal_insert', ['SQL INSERT']),
      tx('w_notification_insert', ['SQL INSERT']),
      tx('q_postes', [])
    ],
    steps: [jsStep('P.auth_loginDemo', { setsUser: true })],
    variables: [], secretProperties: [], staticAuthHeaders: [], connectors: [], mappings: [], references: [], symbols: [],
    frontend: { present: false, sources: 0, signals: [], calls: [] },
    warnings: []
  };
}

test('the anonymous writing job is reported once, the login, the guarded list and the Private seed are not', () => {
  const C8O = load();
  const audit = Object.assign({}, C8O.securityAudit, { collect: (name, opts) => {
    assert.equal(name, 'P');
    assert.deepEqual(JSON.parse(JSON.stringify(opts)), { includeEngine: false, includeFrontend: false });
    return pcaApp();
  } });
  const found = JSON.parse(JSON.stringify(C8O.lint.anonymousWrites(audit, 'P')));
  assert.deepEqual(found.map(f => f.qname), ['P.reminder_runDaily']);
  assert.match(found[0].message, /P\.reminder_runDaily can be called without authentication and writes data through P\.db\.w_notification_insert \(SQL INSERT\)/);
});

test('without the audit helpers the lint reports nothing of the kind', () => {
  const C8O = load();
  assert.deepEqual(JSON.parse(JSON.stringify(C8O.lint.anonymousWrites(undefined, 'P'))), []);
  assert.deepEqual(JSON.parse(JSON.stringify(C8O.lint.anonymousWrites({ evaluate() {} }, 'P'))), []);
});

// A public form or a webhook receiver writes for anyone by design: "public-write: <reason>" in its comment makes the finding a
// warning that is still reported with the reason; without a reason it stays an error.
function auditOf(C8O) {
  return Object.assign({}, C8O.securityAudit, { collect: () => pcaApp() });
}

test('no public-write line: an error', () => {
  const C8O = load();
  const [f] = JSON.parse(JSON.stringify(C8O.lint.anonymousWrites(auditOf(C8O), 'P', () => 'Daily reminder job.')));
  assert.equal(f.severity, 'error');
  assert.equal(f.reason, null);
  assert.match(f.message, /this risk cannot be accepted/);
});

test('a public-write line with a reason: a warning that quotes the reason', () => {
  const C8O = load();
  const comments = { 'P.reminder_runDaily': 'Public contact form.\npublic-write: anyone may leave a message, rate limited upstream' };
  const [f] = JSON.parse(JSON.stringify(C8O.lint.anonymousWrites(auditOf(C8O), 'P', q => comments[q] || '')));
  assert.equal(f.severity, 'warning');
  assert.equal(f.reason, 'anyone may leave a message, rate limited upstream');
  assert.match(f.message, /^P\.reminder_runDaily can be called without authentication and writes data through P\.db\.w_notification_insert \(SQL INSERT\)\. Declared public write: "anyone may leave a message, rate limited upstream"\.$/);
});

test('a public-write line without a reason: still an error', () => {
  const C8O = load();
  for (const comment of ['public-write:', 'Job.\n  public-write :   ']) {
    const [f] = JSON.parse(JSON.stringify(C8O.lint.anonymousWrites(auditOf(C8O), 'P', () => comment)));
    assert.equal(f.severity, 'error', comment);
    assert.equal(f.reason, '');
    assert.match(f.message, /Its public-write line gives no reason, so it stays an error\.$/);
  }
});

test('the public-write line is read on a line of its own', () => {
  const C8O = load();
  assert.equal(C8O.lint.publicWriteReason('Webhook receiver.\nPUBLIC-WRITE: signed by the sender'), 'signed by the sender');
  assert.equal(C8O.lint.publicWriteReason('see the public-write: policy'), null, 'not at the start of a line');
  assert.equal(C8O.lint.publicWriteReason(''), null);
  assert.equal(C8O.lint.publicWriteReason(null), null);
});

test('project-lint loads the audit rules and adds SEC-ANONYMOUS-WRITE with the severity of each finding', () => {
  const source = read('js/tools_project_lint.js');
  assert.match(source, /^if \(typeof include === "function"\) \{\n  include\("js\/security_audit_rules\.js"\);\n  include\("js\/security_audit_collect\.js"\);\n\}$/m);
  assert.match(source, /C8O\.lint\.anonymousWrites\(C8O\.securityAudit, String\(project\.getName\(\)\), commentOf\)\.forEach/);
  assert.match(source, /add\("SEC-ANONYMOUS-WRITE", w\.severity, w\.qname, w\.message,/);
  assert.match(source, /say so with a line \\"public-write: <reason>\\" in its comment/);
});
