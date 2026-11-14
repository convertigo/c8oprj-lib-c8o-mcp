// A public seed_demo answered seeded=ok and, on a fresh server, the demo account did not exist (13/11, SalesPipeline built
// by Mistral Large 4 through Vibe). Its helper called lib_UserManager's CreateAccount, ConfirmAccount and SetUserAttribute
// and read none of their answers; its JavaScript read steps by their names (CountCompanies.document, ReadKey.document),
// which are not JavaScript variables, so "the table is empty" was always true (the seed reset the data on every call) and
// the confirmation key was always empty. project-lint now reports the unread calls, the constant success after them, and a
// step read as a variable.
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
  const sandbox = { C8O: { dbo: {}, util: {} }, Packages: javaProxy, JSON, include() {} };
  vm.createContext(sandbox);
  vm.runInContext(read('js/security_audit_rules.js'), sandbox, { filename: 'security_audit_rules.js' });
  vm.runInContext(read('js/tools_project_lint.js'), sandbox, { filename: 'tools_project_lint.js' });
  return sandbox.C8O;
}

let priority = 1000;
const step = (name, className, extra) => Object.assign({ qname: 'App.sq.' + name, name, className, priority: String(++priority), target: '',
  output: false, enabled: true, constant: null, nodeName: '', js: '' }, extra || {});

// What each target writes, and how it changes the session.
const WRITES = {
  'lib.CreateAccount': [{ qname: 'lib.fs.PostDocument', writes: ['CouchDB PostDocument'] }],
  'lib.ConfirmAccount': [{ qname: 'lib.fs.PostMergeDocument', writes: ['CouchDB PostDocument'] }],
  'App.db.init_schema': [{ qname: 'App.db.init_schema', writes: ['SQL DELETE', 'SQL INSERT'] }],
  'App.seed_account': [{ qname: 'lib.fs.PostDocument', writes: ['CouchDB PostDocument'] }],
  'lib.SignOut': [{ qname: 'lib.fs.PostMergeDocument', writes: ['CouchDB PostDocument'] }]
};
const writesOf = t => WRITES[t] || [];
const sessionOf = t => (t === 'lib.SignIn' ? 'open' : t === 'lib.SignOut' ? 'close' : '');

test('the seed: each unread library call, and the constant ok answered after them', () => {
  const C8O = load();
  const seed = { qname: 'App.seed_demo', read: {}, steps: [
    step('Count', 'TransactionStep', { target: 'App.db.count_companies' }),
    step('Seed', 'TransactionStep', { target: 'App.db.init_schema' }),
    step('Create', 'SequenceStep', { target: 'lib.CreateAccount' }),
    step('Confirm', 'SequenceStep', { target: 'lib.ConfirmAccount' }),
    step('Result', 'ElementStep', { output: true, constant: 'ok', nodeName: 'seeded' })
  ] };
  const found = plain(C8O.lint.uncheckedCalls([seed], writesOf, sessionOf));
  assert.deepEqual(found.map(f => f.rule + ' ' + f.qname), [
    'SEQ-CALL-UNCHECKED App.sq.Create', 'SEQ-CALL-UNCHECKED App.sq.Confirm', 'SEQ-CONSTANT-SUCCESS App.sq.Result']);
  assert.equal(found[0].severity, 'warning');
  assert.match(found[0].message, /calls lib\.CreateAccount, which writes through lib\.fs\.PostDocument \(CouchDB PostDocument\), and no step reads its answer/);
  assert.match(found[0].fix, /IfExistThenElseStep on the call's \.\/document\/error/);
  assert.equal(found[2].severity, 'error');
  assert.match(found[2].message, /answers seeded="ok", a constant, after writing calls whose answers no step reads \(Seed, Create, Confirm\)/);
});

test('a call whose answer is read, or passed to the caller, is not reported, nor what follows it', () => {
  const C8O = load();
  const create = step('Create', 'SequenceStep', { target: 'lib.CreateAccount' });
  const checked = { qname: 'App.signup', read: { [create.priority]: true }, steps: [create, step('Done', 'XMLElementStep', { output: true, constant: 'ok' })] };
  const passed = { qname: 'App.signup2', read: {}, steps: [step('Create', 'SequenceStep', { target: 'lib.CreateAccount', output: true }),
    step('Done', 'ElementStep', { output: true, constant: 'true' })] };
  const disabled = { qname: 'App.old', read: {}, steps: [step('Create', 'SequenceStep', { target: 'lib.CreateAccount', enabled: false }),
    step('Done', 'ElementStep', { output: true, constant: 'ok' })] };
  assert.deepEqual(plain(C8O.lint.uncheckedCalls([checked, passed, disabled], writesOf, sessionOf)), []);
});

test('a read, a constant that is no success, an answer before the calls: nothing to say beyond the unread call', () => {
  const C8O = load();
  const readOnly = { qname: 'App.list', read: {}, steps: [step('Rows', 'SequenceStep', { target: 'lib.GetUserAttribute' }),
    step('Done', 'ElementStep', { output: true, constant: 'ok' })] };
  const pending = { qname: 'App.queue', read: {}, steps: [step('Create', 'SequenceStep', { target: 'lib.CreateAccount' }),
    step('State', 'ElementStep', { output: true, constant: 'pending' })] };
  const before = { qname: 'App.first', read: {}, steps: [step('State', 'ElementStep', { output: true, constant: 'ok' }),
    step('Create', 'SequenceStep', { target: 'lib.CreateAccount' })] };
  const found = plain(C8O.lint.uncheckedCalls([readOnly, pending, before], writesOf, sessionOf));
  assert.deepEqual(found.map(f => f.rule + ' ' + f.qname), ['SEQ-CALL-UNCHECKED App.sq.Create', 'SEQ-CALL-UNCHECKED App.sq.Create']);
});

test('a sign-in whose refusal is never read is reported; a sign-out the caller follows with its own end of session is not', () => {
  const C8O = load();
  const login = { qname: 'App.auth_login', read: {}, steps: [step('SignIn', 'SequenceStep', { target: 'lib.SignIn' })] };
  const logout = { qname: 'App.auth_logout', read: {}, steps: [step('SignOut', 'SequenceStep', { target: 'lib.SignOut' }), step('End', 'RemoveSessionStep')] };
  const found = plain(C8O.lint.uncheckedCalls([login, logout], writesOf, sessionOf));
  assert.deepEqual(found.map(f => f.qname), ['App.sq.SignIn']);
  assert.match(found[0].message, /which signs the user in, and no step reads its answer: when it refuses the credentials/);
});

test('a step read as a JavaScript variable is reported; variables, declarations, strings and engine names are not', () => {
  const C8O = load();
  const flow = {
    declared: { user: true, capDoc: true },
    steps: [
      step('CountCompanies', 'TransactionStep', { target: 'App.db.count' }),
      step('CheckEmpty', 'IfStep', { js: 'var c = (typeof CountCompanies !== "undefined" && CountCompanies) ? CountCompanies.document : null; isEmpty = !c;' }),
      step('ReadKey', 'TransactionStep', { target: 'lib.fs.GetAccountDocument' }),
      step('GetKey', 'SimpleStep', { js: "var doc = ReadKey.document;\nkeyVar = doc ? doc.key : '';" }),
      step('resp', 'SimpleStep', { js: 'resp = JSON.parse(text);' }),
      step('UseResp', 'SimpleStep', { js: 'var ok = resp.success === true; // ReadKey.document in a comment\nvar s = "CountCompanies.document";' }),
      step('cap', 'JsonSourceStep', { js: '' }),
      step('UseCap', 'SimpleStep', { js: 'var role = capDoc.document.role; log.info(user); context.get("x");' }),
      step('context', 'SimpleStep', { js: 'context.setAuthenticatedUser(user);' })
    ]
  };
  assert.deepEqual(plain(C8O.lint.stepNamesAsVariables(flow)), [
    { qname: 'App.sq.CheckEmpty', name: 'CountCompanies' },
    { qname: 'App.sq.GetKey', name: 'ReadKey' }
  ]);
});

test('project-lint runs the rules: the flows of each sequence, the audit model for what a call writes and its session change', () => {
  const source = read('js/tools_project_lint.js');
  assert.match(source, /var flow = sequenceFlow\(sequence, variableNames\);/);
  assert.match(source, /add\("SEQ-STEP-AS-VARIABLE", "error", use\.qname/);
  assert.match(source, /C8O\.lint\.uncheckedCalls\(sequenceFlows, function \(target\) \{\n\s+return C8O\.securityAudit\.writesReachedFrom\(auditModel, target\);\n\s+\}, function \(target\) \{\n\s+return C8O\.securityAudit\.sessionChange\(auditModel, target\);/);
  // the flow reads the sources of the steps (getSources) and of their variables (getSourceDefinition)
  assert.match(source, /var sources = node\.getSources\(\);/);
  assert.match(source, /noteSource\(call\(node, "getSourceDefinition"\)\);/);
});
