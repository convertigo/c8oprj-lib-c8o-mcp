// A public seed_demo (13/11, Mistral Large 4 through Vibe) created the demo account through lib_UserManager (CreateAccount,
// ConfirmAccount, SetUserAttribute) from a Private helper sequence. The audit followed calls inside the project only, so
// account writes made by a library were not writes, and an unsuppressed exposure finding left the grade at A. The
// collector now follows calls into other projects (bounded), and the rules count what they write.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const same = (actual, expected) => assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), expected);

function loadAudit() {
  const context = {
    include() {},
    C8O: { dbo: { getDirectChildren: b => (b && b.children ? b.children : []), safeName: b => b.getName() } }
  };
  vm.runInNewContext(read('js/security_audit_rules.js'), context, { filename: 'security_audit_rules.js' });
  vm.runInNewContext(read('js/security_audit_collect.js'), context, { filename: 'security_audit_collect.js' });
  return context.C8O.securityAudit;
}

// A fake bean: its class, name, comment, children, and the getters of a step that calls.
function bean(className, name, props, children) {
  const p = props || {};
  const b = { getClass: () => ({ getSimpleName: () => className }), getName: () => name, getComment: () => p.comment || '',
    isEnabled: () => p.enabled !== false, children: children || [] };
  if (p.sequence !== undefined) b.getSourceSequence = () => p.sequence;
  if (p.transaction !== undefined) b.getSourceTransaction = () => p.transaction;
  if (p.expression !== undefined) b.getExpression = () => p.expression;
  if (p.sql !== undefined) b.getSqlQuery = () => p.sql;
  return b;
}
const callSeq = (name, target) => bean('SequenceStep', name, { sequence: target });
const callTx = (name, target) => bean('TransactionStep', name, { transaction: target });

// A library with an account creation that writes through its FullSync connector, a sign-in, a sign-out, a sequence that
// writes accounts in JavaScript only, and a read.
function library() {
  const objects = {
    'lib.CreateAccount': { kind: 'sequence', dbo: bean('GenericSequence', 'CreateAccount', { comment: 'Creates a user account' },
      [callSeq('hash', 'lib.HashAndSalt'), callTx('post', 'lib.fs.PostDocument'), callSeq('confirm', 'lib.ConfirmAccount')]) },
    'lib.ConfirmAccount': { kind: 'sequence', dbo: bean('GenericSequence', 'ConfirmAccount', {}, [callTx('merge', 'lib.fs.PostMergeDocument')]) },
    'lib.HashAndSalt': { kind: 'sequence', dbo: bean('GenericSequence', 'HashAndSalt', { comment: 'Utility sequence to Hash and Salt passwords' },
      [bean('SimpleStep', 'hash', { expression: 'var h = 1;' })]) },
    'lib.SignIn': { kind: 'sequence', dbo: bean('GenericSequence', 'SignIn', { comment: 'Performs a user sign in' },
      [callTx('read', 'lib.fs.GetAccountDocument'), callSeq('token', 'lib.GenerateToken'), bean('SetAuthenticatedUserStep', 'set')]) },
    'lib.GenerateToken': { kind: 'sequence', dbo: bean('GenericSequence', 'GenerateToken', {}, [callTx('merge', 'lib.fs.PostMergeDocument')]) },
    'lib.SignOut': { kind: 'sequence', dbo: bean('GenericSequence', 'SignOut', {}, [callTx('merge', 'lib.fs.PostMergeDocument'), bean('RemoveAuthenticatedUserStep', 'remove')]) },
    'lib.SetUserRole': { kind: 'sequence', dbo: bean('GenericSequence', 'SetUserRole', {}, [bean('SimpleStep', 'js', { expression: 'store(role);' })]) },
    'lib.GetUserAttribute': { kind: 'sequence', dbo: bean('GenericSequence', 'GetUserAttribute', { comment: 'Gets a given attribute from an user account' },
      [callTx('read', 'lib.fs.GetAccountDocument')]) },
    'lib.fs.PostDocument': { kind: 'transaction', dbo: bean('PostDocumentTransaction', 'PostDocument') },
    'lib.fs.PostMergeDocument': { kind: 'transaction', dbo: bean('PostDocumentTransaction', 'PostMergeDocument') },
    'lib.fs.GetAccountDocument': { kind: 'transaction', dbo: bean('GetDocumentTransaction', 'GetAccountDocument') }
  };
  const asked = [];
  const resolve = target => { asked.push(target); return objects[target] || null; };
  return { resolve, asked };
}

function model(requestables, steps) {
  return {
    project: { name: 'App', version: '1.0.0', corsOrigin: 'https://app.example.com', httpSessionTimeout: 1800, contextTimeout: 300 },
    engine: null, requestables, steps: steps || [], variables: [], secretProperties: [], staticAuthHeaders: [],
    connectors: [], mappings: [], references: [], symbols: [], frontend: { present: false, sources: 0, signals: [], calls: [] }, warnings: []
  };
}
const seq = (name, accessibility, auth, calls) => ({ qname: 'App.' + name, kind: 'sequence', accessibility, authenticatedContextRequired: auth, calls: calls || [] });

// The SalesPipeline shape without its SQL: a public seed, a Private helper that creates the account through the library, a
// login and a logout through the library, a signed-in read.
function app() {
  return model([
    seq('seed_demo', 'Public', false, ['App.seed_demo_account']),
    seq('seed_demo_account', 'Private', false, ['lib.fs.GetAccountDocument', 'lib.CreateAccount', 'lib.SetUserRole']),
    seq('auth_login', 'Hidden', false, ['lib.SignIn']),
    seq('auth_logout', 'Hidden', false, ['lib.SignOut']),
    seq('q_role', 'Hidden', true, ['lib.GetUserAttribute'])
  ]);
}

test('without the calls into the library, the seed writes nothing the audit sees', () => {
  const audit = loadAudit();
  same(audit.writesReachedFrom(app(), 'App.seed_demo'), []);
});

test('the collector follows the calls into the library: the seed writes the accounts of the library', () => {
  const audit = loadAudit();
  const m = app();
  const lib = library();
  audit.collectExternal(m, lib.resolve);
  assert.ok(m.externalRequestables.every(e => e.external === true));
  assert.equal(m.requestables.length, 5, 'the library stays out of the project requestables');
  same(audit.writesReachedFrom(m, 'App.seed_demo').map(w => w.qname), ['lib.fs.PostDocument', 'lib.fs.PostMergeDocument']);
  // the library's own requestables get no exposure finding: the rules judge the project
  const findings = audit.evaluate(m).findings;
  assert.ok(findings.every(f => /^App\./.test(f.qname)), JSON.stringify(findings.map(f => f.qname)));
  // the public seed is an anonymous write that cannot be suppressed; the login, the logout and the signed-in read are not
  const report = audit.buildReport(m, { suppress: [{ ruleId: 'EXP-01', qname: 'App.seed_demo', reason: 'Seeds a fresh server once.' }], minSeverity: 'info' });
  same(report.suppressRefused.map(r => r.qname), ['App.seed_demo']);
  assert.match(report.suppressRefused[0].refused, /writes data through lib\.fs\.PostDocument \(CouchDB PostDocument\)/);
  const guard = audit.suppressionGuard(m);
  findings.filter(f => f.qname !== 'App.seed_demo').forEach(f => assert.equal(guard(f), '', f.qname));
});

test('a library sequence named or documented as changing accounts writes, even without a write the audit sees', () => {
  const audit = loadAudit();
  const m = model([seq('promote', 'Hidden', false, ['lib.SetUserRole'])]);
  audit.collectExternal(m, library().resolve);
  same(audit.writesReachedFrom(m, 'App.promote'), [{ qname: 'lib.SetUserRole', writes: ['accounts, by its name or comment'] }]);
  assert.equal(audit.accountChangeName('CreateAccount', ''), true);
  assert.equal(audit.accountChangeName('DeleteUser', ''), true);
  assert.equal(audit.accountChangeName('ModifyPassword', ''), true);
  assert.equal(audit.accountChangeName('RemoveDraftedAccounts', ''), true);
  assert.equal(audit.accountChangeName('Process', 'Confirms the account of a user and sends a mail.'), true);
  assert.equal(audit.accountChangeName('GetUserAttribute', 'Gets a given attribute from an user account'), false);
  assert.equal(audit.accountChangeName('SignIn', 'Performs a user sign in for a given user with its id (email) and password'), false);
  assert.equal(audit.accountChangeName('ListUsers', 'Lists users from the internal Convertigo User database'), false);
  // a read of the library writes nothing
  const reader = model([seq('who', 'Hidden', false, ['lib.GetUserAttribute'])]);
  audit.collectExternal(reader, library().resolve);
  same(audit.writesReachedFrom(reader, 'App.who'), []);
});

test('a login or a logout through the library stays anonymous by design; the session change of a call is known', () => {
  const audit = loadAudit();
  const m = app();
  audit.collectExternal(m, library().resolve);
  const entry = audit.sessionEntryPoints(m);
  assert.equal(entry['App.auth_login'], true);
  assert.equal(entry['App.auth_logout'], true);
  assert.equal(entry['App.seed_demo'], undefined);
  assert.equal(audit.sessionChange(m, 'lib.SignIn'), 'open');
  assert.equal(audit.sessionChange(m, 'lib.SignOut'), 'close');
  assert.equal(audit.sessionChange(m, 'App.auth_login'), 'open');
  assert.equal(audit.sessionChange(m, 'lib.CreateAccount'), '');
});

test('the calls are followed a bounded number of calls deep, each requestable once', () => {
  const audit = loadAudit();
  const chain = {};
  for (let i = 1; i <= 8; i++) {
    chain['lib.s' + i] = { kind: 'sequence', dbo: bean('GenericSequence', 's' + i, {}, [callSeq('next', i < 8 ? 'lib.s' + (i + 1) : 'lib.fs.PostDocument')]) };
  }
  chain['lib.fs.PostDocument'] = { kind: 'transaction', dbo: bean('PostDocumentTransaction', 'PostDocument') };
  const asked = [];
  const m = model([seq('deep', 'Public', false, ['lib.s1']), seq('again', 'Public', false, ['lib.s1'])]);
  audit.collectExternal(m, t => { asked.push(t); return chain[t] || null; });
  assert.equal(m.externalRequestables.length, audit.MAX_EXTERNAL_DEPTH);
  same(asked, ['lib.s1', 'lib.s2', 'lib.s3', 'lib.s4'], 'each requestable resolved once, none past the depth');
  same(audit.writesReachedFrom(m, 'App.deep'), []);
  // an unknown target (a project not loaded) is skipped
  const lonely = model([seq('x', 'Public', false, ['gone.Seq'])]);
  audit.collectExternal(lonely, () => null);
  same(lonely.externalRequestables, []);
});

test('the collector follows the libraries when it builds the model, and says so in its limitations', () => {
  const source = read('js/security_audit_collect.js');
  assert.match(source, /api\.collectExternal\(model\);/);
  assert.match(read('js/security_audit_rules.js'), /up to 4 calls deep into the projects it calls/);
  const audit = loadAudit();
  assert.equal(audit.MAX_EXTERNAL_DEPTH, 4);
});
