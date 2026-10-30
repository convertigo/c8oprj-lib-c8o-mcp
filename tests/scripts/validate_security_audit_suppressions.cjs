// Accepted risks of project-security-audit. Agents silenced real findings and reported an A (PCA eval 29/10: a Public
// reminder job that wrote notifications, callable without authentication, suppressed into a grade of 100). The answer now
// keeps the raw grade next to the grade, a suppression needs its reason, and an exposure finding on a requestable anyone
// can call that writes data is not suppressed (suppressRefused says why), a login or a logout aside.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const same = (actual, expected) => assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), expected);

function loadAudit() {
  const context = { include() {}, C8O: {} };
  vm.runInNewContext(read('js/security_audit_rules.js'), context, { filename: 'security_audit_rules.js' });
  vm.runInNewContext(read('js/security_audit_collect.js'), context, { filename: 'security_audit_collect.js' });
  return context.C8O.securityAudit;
}

function model(overrides) {
  return Object.assign({
    project: { name: 'P', version: '1.0.0', corsOrigin: 'https://app.example.com', httpSessionTimeout: 1800, contextTimeout: 300 },
    engine: null,
    requestables: [], steps: [], variables: [], secretProperties: [], staticAuthHeaders: [],
    connectors: [], mappings: [], references: [], symbols: [],
    frontend: { present: false, sources: 0, signals: [], calls: [] },
    warnings: []
  }, overrides || {});
}

const seq = (name, accessibility, auth, calls) => ({ qname: 'P.' + name, kind: 'sequence', accessibility, authenticatedContextRequired: auth, calls: calls || [] });
const tx = (name, writes) => ({ qname: 'P.db.' + name, kind: 'transaction', accessibility: 'Private', authenticatedContextRequired: false, calls: [], writes });
const jsStep = (owner, signals) => ({ qname: owner + '.st:logic', owner, stepClass: 'SimpleStep', kind: 'js', enabled: true,
  signals: Object.assign({ dynamicCode: false, privileged: [], weakPasswordHash: false, managesPassword: false, removesUser: false, setsUser: false, endsSession: false }, signals) });

// The app m1 built in the PCA eval: a demo login and a logout that journal, and a Public reminder job that writes.
function pcaApp() {
  return model({
    requestables: [
      seq('auth_loginDemo', 'Hidden', false, ['P.db.w_journal_insert']),
      seq('auth_logout', 'Hidden', false, ['P.db.w_journal_insert']),
      seq('reminder_run', 'Public', false, ['P.notifications']),
      seq('notifications', 'Private', false, ['P.db.w_notification_insert']),
      seq('poste_list', 'Hidden', true, ['P.db.q_postes']),
      tx('w_journal_insert', ['SQL INSERT']),
      tx('w_notification_insert', ['SQL INSERT']),
      tx('q_postes', [])
    ],
    steps: [jsStep('P.auth_loginDemo', { setsUser: true }), jsStep('P.auth_logout', { removesUser: true })]
  });
}

const agentSuppress = [
  { ruleId: 'EXP-01', qname: 'P.reminder_run', reason: 'Scheduled job, run by the engine scheduler.' },
  { ruleId: 'EXP-02', qname: 'P.auth_loginDemo', reason: 'Demo login, anonymous by design.' },
  { ruleId: 'EXP-02', qname: 'P.auth_logout', reason: 'Logout, anonymous by design.' }
];

test('the suppression of a requestable anyone can call that writes data is refused, a login and a logout are accepted', () => {
  const audit = loadAudit();
  const report = audit.buildReport(pcaApp(), { suppress: agentSuppress, minSeverity: 'info' });
  const byQName = Object.fromEntries(report.findings.map(f => [f.qname + ':' + f.ruleId, f]));
  assert.equal(byQName['P.reminder_run:EXP-01'].suppressed, undefined, 'still active');
  assert.match(byQName['P.reminder_run:EXP-01'].suppressionRefused, /P\.reminder_run can be called without authentication and writes data through P\.db\.w_notification_insert \(SQL INSERT\)/);
  assert.match(byQName['P.reminder_run:EXP-01'].suppressionRefused, /Private if only other requestables or the scheduler call it/);
  assert.equal(byQName['P.auth_loginDemo:EXP-02'].suppressed, true);
  assert.equal(byQName['P.auth_logout:EXP-02'].suppressed, true);
  same(report.suppressRefused.map(r => [r.ruleId, r.qname, r.reason]), [['EXP-01', 'P.reminder_run', 'Scheduled job, run by the engine scheduler.']]);
  assert.ok(report.score < 100, 'the refused finding still lowers the score: ' + report.score);
  assert.ok(report.rawScore < report.score, 'the raw score counts the accepted ones too');
  assert.equal(report.rawGrade, audit.gradeFor(report.rawScore));
});

test('the raw score and grade stay next to the score and grade after the accepted risks', () => {
  const audit = loadAudit();
  const app = model({ requestables: [seq('getConfiguration', 'Hidden', false, ['P.db.q_config']), tx('q_config', [])] });
  const plain = audit.buildReport(app, {});
  assert.equal(plain.rawScore, plain.score);
  assert.equal(plain.rawGrade, plain.grade);
  assert.equal(plain.suppressRefused, undefined);
  const accepted = audit.buildReport(app, { suppress: [{ ruleId: 'EXP-02', qname: 'P.getConfiguration', reason: 'Public settings read before login.' }] });
  assert.equal(accepted.score, 100);
  assert.equal(accepted.grade, 'A');
  assert.equal(accepted.rawScore, plain.score, 'a read-only anonymous sequence may be accepted, the raw score still shows it');
  assert.equal(accepted.rawGrade, plain.grade);
});

test('an accepted risk needs a reason', () => {
  const audit = loadAudit();
  const app = model({ requestables: [seq('getConfiguration', 'Hidden', false, [])] });
  for (const entry of [{ ruleId: 'EXP-02' }, { ruleId: 'EXP-02', qname: 'P.getConfiguration', reason: '  ' }]) {
    const report = audit.buildReport(app, { suppress: [entry] });
    assert.equal(report.findings[0].suppressed, undefined, JSON.stringify(entry));
    assert.equal(report.score, report.rawScore);
    same(report.suppressRefused.map(r => [r.ruleId, r.refused]), [['EXP-02', 'A suppression needs a reason: why the risk is accepted.']]);
  }
});

test('writes are followed through nested calls, URL mappings are guarded too, and a rule-wide entry is refused per finding', () => {
  const audit = loadAudit();
  const app = model({
    requestables: [
      seq('open', 'Public', false, ['P.step1']),
      seq('step1', 'Private', false, ['P.step2']),
      seq('step2', 'Private', false, ['P.db.w_delete']),
      seq('readOnly', 'Public', false, ['P.db.q_read']),
      seq('mapped', 'Private', false, ['P.db.w_delete']),
      tx('w_delete', ['SQL DELETE']),
      tx('q_read', [])
    ],
    mappings: [{ qname: 'P.UrlMapper.m.Post', path: '/x', method: 'POST', target: 'P.mapped' }]
  });
  const report = audit.buildReport(app, { suppress: [{ ruleId: 'EXP-01', reason: 'Accepted.' }, { ruleId: 'EXP-03', reason: 'Accepted.' }], minSeverity: 'info' });
  const state = Object.fromEntries(report.findings.filter(f => /^EXP-0[13]$/.test(f.ruleId)).map(f => [f.qname, f.suppressed === true]));
  same(state, { 'P.open': false, 'P.readOnly': true, 'P.mapped': false });
  same(report.suppressRefused.map(r => r.qname).sort(), ['P.mapped', 'P.open']);
});

test('the collector tells writing transactions and session steps', () => {
  const audit = loadAudit();
  same(audit.transactionWrites('SqlTransaction', 'INSERT INTO notification (a) VALUES ({a}); UPDATE poste_pca SET b={b} WHERE id={id}'), ['SQL INSERT', 'SQL UPDATE']);
  same(audit.transactionWrites('SqlTransaction', "SELECT * FROM t WHERE name = 'DELETE FROM x' -- DELETE FROM y\n/* DROP TABLE z */"), []);
  same(audit.transactionWrites('SqlTransaction', 'SELECT p.id, p.updated_at FROM poste_pca p'), []);
  same(audit.transactionWrites('SqlTransaction', 'MERGE INTO t USING s ON (t.id = s.id) WHEN MATCHED THEN UPDATE SET t.v = s.v'), ['SQL MERGE']);
  same(audit.transactionWrites('PostDocumentTransaction', ''), ['CouchDB PostDocument']);
  same(audit.transactionWrites('DeleteDocumentTransaction', ''), ['CouchDB DeleteDocument']);
  same(audit.transactionWrites('PostFindTransaction', ''), []);
  same(audit.transactionWrites('GetViewTransaction', ''), []);
  assert.equal(audit.scanJsSignals('context.setAuthenticatedUser(email);').setsUser, true);
  assert.equal(audit.scanJsSignals('var u = context.getAuthenticatedUser();').setsUser, false);
});

test('the tool says it: reason required, the raw grade and the refusals in its schema, its answer and its guides', () => {
  const overrides = read('js/schema_overrides.js');
  assert.match(overrides, /required: \["ruleId", "reason"\]/);
  assert.match(overrides, /rawGrade: \{ type: "string", enum: \["A", "B", "C", "D", "F"\]/);
  assert.match(overrides, /suppressRefused: \{/);
  const sequence = read('_c8oProject/sequences/tools_project_security_audit.yaml');
  assert.match(sequence, /↓rawScore \[steps\.JsonFieldStep-\d+\]: \n/);
  assert.match(sequence, /- →→: auditResult\.rawGrade\n/);
  assert.match(sequence, /condition: auditResult\.suppressRefused != null\n/);
  assert.match(read('resources/convertigo_project_review.md'), /Report `grade` and `rawGrade` together/);
  assert.match(read('resources/convertigo_common_skill.md'), /A sequence anyone can call that writes data is fixed, never suppressed/);
});

test('an active finding whose suppression was refused caps the grade at B, whatever the score', () => {
  const audit = loadAudit();
  // one Public job that writes, nothing else to find
  const app = model({ requestables: [seq('reminder_run', 'Public', false, ['P.db.w_notification_insert']), seq('poste_list', 'Hidden', true, []),
    tx('w_notification_insert', ['SQL INSERT'])] });
  const suppress = [{ ruleId: 'EXP-01', qname: 'P.reminder_run', reason: 'Scheduled job, run by the engine scheduler.' }];
  const report = audit.buildReport(app, { suppress, minSeverity: 'info' });
  assert.equal(report.score, 90, 'one high finding left');
  assert.equal(report.grade, 'B', 'not the A of a score of 90');
  assert.equal(report.gradeCappedBy, 'refused-suppression');
  assert.match(report.scoreModel.gradeCap, /caps it at B/);
  assert.equal(report.rawGrade, 'B', 'the raw grade counts the same finding');
  // the same finding not suppressed at all: an A for a score of 90, as before
  const plain = audit.buildReport(app, { minSeverity: 'info' });
  assert.equal(plain.score, 90);
  assert.equal(plain.grade, 'A');
  assert.equal(plain.gradeCappedBy, '');
  // a lower score keeps its own grade, a critical finding still caps at D
  const lower = audit.score([{ ruleId: 'EXP-01', severity: 'high', category: 'exposure', suppressionRefused: 'x' },
    { ruleId: 'EXP-02', severity: 'high', category: 'exposure' }, { ruleId: 'INJ-01', severity: 'high', category: 'injection' }]);
  assert.equal(lower.score, 70);
  assert.equal(lower.grade, 'C', 'the cap never raises a grade');
  assert.equal(lower.gradeCappedBy, '');
  const critical = audit.score([{ ruleId: 'EXP-01', severity: 'high', category: 'exposure', suppressionRefused: 'x' }, { ruleId: 'SEC-01', severity: 'critical', category: 'secrets' }]);
  assert.equal(critical.grade, 'D');
  assert.equal(critical.gradeCappedBy, 'critical-finding');
  assert.match(read('resources/convertigo_project_review.md'), /caps the grade at B \(`gradeCappedBy: refused-suppression`\)/);
});
