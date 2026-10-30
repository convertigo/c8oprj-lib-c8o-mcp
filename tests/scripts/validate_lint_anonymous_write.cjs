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

test('project-lint loads the audit rules and adds SEC-ANONYMOUS-WRITE as an error', () => {
  const source = read('js/tools_project_lint.js');
  assert.match(source, /^if \(typeof include === "function"\) \{\n  include\("js\/security_audit_rules\.js"\);\n  include\("js\/security_audit_collect\.js"\);\n\}$/m);
  assert.match(source, /C8O\.lint\.anonymousWrites\(C8O\.securityAudit, String\(project\.getName\(\)\)\)\.forEach/);
  assert.match(source, /add\("SEC-ANONYMOUS-WRITE", "error", w\.qname, w\.message,/);
});
