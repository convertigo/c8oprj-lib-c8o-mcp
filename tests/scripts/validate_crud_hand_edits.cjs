const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// upsert-crud rewrote on each run what it generated, undoing what had been changed since: in PipelineCrm (12/11) a run
// repeated with the same spec dropped the search filter added to a list transaction and to its business sequence (which
// then failed on the variable it set), made the app's own auth_logout a skeleton again and created again the auth_login
// skeleton the app had deleted. Each run records a fingerprint of what it wrote; the next one keeps an object changed
// since, does not create a deleted auth skeleton again, and says so; spec.overwrite names what to write again.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function fakeJava(files) {
  class File {
    constructor(dir, rel) { this.p = (dir instanceof File ? dir.p : String(dir)) + '/' + rel; }
    isFile() { return this.p in files; }
    toPath() { return this.p; }
    getParentFile() { return { mkdirs: () => true }; }
  }
  return {
    io: { File },
    nio: { file: { Files: { readAllBytes: p => files[p], write: (p, bytes) => { files[p] = String(bytes); } } } },
    lang: { String: function (text) { const s = new String(text); s.getBytes = () => String(text); return s; } }
  };
}

function backend(files) {
  const context = { C8O: { util: {} }, java: fakeJava(files) };
  vm.createContext(context);
  vm.runInContext(read('js/crud_proof.js'), context);
  vm.runInContext(read('js/crud_backend.js'), context);
  return context.C8O.crudBackend;
}

const smart = (mode, value) => ({ getMode: () => mode, getExpression: () => value });
function node(cls, name, props, children, parent) {
  const n = Object.assign({
    getName: () => name,
    getClass: () => ({ getName: () => 'com.twinsoft.convertigo.beans.' + cls }),
    getQName: () => (n.parent ? n.parent.getQName() + '.' : '') + name,
    getAllChildren: () => ({ size: () => n.children.length, get: i => n.children[i] }),
    children: []
  }, props || {});
  n.parent = parent || null;
  (children || []).forEach(c => { c.parent = n; n.children.push(c); });
  return n;
}

function world() {
  const tx = node('transactions.SqlTransaction', 'list_companies', { getSqlQuery: () => 'SELECT id AS "id" FROM companies' });
  const connector = node('connectors.SqlConnector', 'crmdb', {}, [tx]);
  const facade = node('sequences.GenericSequence', 'crm_list_companies', { getAccessibility: () => 'Hidden', isAuthenticatedContextRequired: () => true }, [
    node('steps.TransactionStep', 'CallCrm_list_companies', { getSourceTransaction: () => 'Crm.crmdb.list_companies', isOutput: () => false }),
    node('steps.JsonArrayStep', 'Rows', { getKey: () => smart('PLAIN', 'rows') })]);
  const login = node('sequences.GenericSequence', 'auth_login', {}, [node('steps.SetAuthenticatedUserStep', 'SetAuthenticatedUser', { getUserid: () => smart('JS', 'username') })]);
  const project = node('core.Project', 'Crm', { getDirPath: () => '/ws/Crm' }, [connector, facade, login]);
  return { project, connector, tx, facade, login };
}

function ctxFor(w, warnings) {
  return {
    ensureArray: v => (Array.isArray(v) ? v : v == null ? [] : [v]),
    trimmed: v => String(v == null ? '' : v).trim(),
    addWarning: (_r, text) => warnings.push(text),
    findChild: (parent, name) => parent.children.find(c => c.getName() === name) || null
  };
}

test('the fingerprint follows what upsert-crud writes, not the app\'s own steps before the call nor the Java identities', () => {
  const B = backend({});
  const w = world();
  const before = B.fingerprint(w.facade);
  assert.equal(B.fingerprint(w.facade), before, 'stable');
  // An app's check before the call is its own: upsert-crud keeps it, the fingerprint ignores it.
  const check = node('steps.IfStep', 'CheckRole', { getCondition: () => "role != 'ADMIN'" });
  check.parent = w.facade;
  w.facade.children.unshift(check);
  assert.equal(B.fingerprint(w.facade), before);
  // A variable added to the call (a filter passed to the transaction) is a change.
  const call = w.facade.children[1];
  const v = node('variables.StepVariable', 'search', {});
  v.parent = call;
  call.children.push(v);
  assert.notEqual(B.fingerprint(w.facade), before);
  const javaObject = node('steps.SimpleStep', 'x', { getValue: () => ({ toString: () => 'com.Foo@1a2b3c4d' }) });
  assert.equal(B.fingerprint(javaObject), B.fingerprint(node('steps.SimpleStep', 'x', {})));
});

test('a run keeps an object changed since the last one, does not create a deleted auth skeleton again, and says so', () => {
  const files = {};
  const B = backend(files);
  const w = world();
  // First run: no record yet, everything is written and recorded.
  let warnings = [];
  let guard = B.editGuard(ctxFor(w, warnings), w.project, { project: 'Crm' }, {});
  assert.equal(guard.changed(w.connector, 'transactions.SqlTransaction', 'list_companies'), null);
  assert.equal(guard.changed(w.project, 'sequences.GenericSequence', 'crm_list_companies'), null);
  assert.equal(guard.deleted(w.project, 'sequences.GenericSequence', 'auth_login'), false);
  [w.tx, w.facade, w.login].forEach(d => guard.wrote(d));
  guard.save();
  const recorded = JSON.parse(files['/ws/Crm/_private/upsert-crud-state.json']);
  assert.deepEqual(Object.keys(recorded.objects).sort(), ['Crm.auth_login', 'Crm.crm_list_companies', 'Crm.crmdb.list_companies']);

  // Same spec again, nothing changed: written again.
  warnings = [];
  guard = B.editGuard(ctxFor(w, warnings), w.project, { project: 'Crm' }, {});
  assert.equal(guard.changed(w.connector, 'transactions.SqlTransaction', 'list_companies'), null);
  assert.deepEqual(warnings, []);

  // The list transaction gets a search filter by hand, the app deletes auth_login.
  w.tx.getSqlQuery = () => "SELECT id AS \"id\" FROM companies WHERE name LIKE '%' || {search} || '%'";
  w.project.children.splice(w.project.children.indexOf(w.login), 1);
  warnings = [];
  guard = B.editGuard(ctxFor(w, warnings), w.project, { project: 'Crm' }, {});
  assert.equal(guard.changed(w.connector, 'transactions.SqlTransaction', 'list_companies'), w.tx, 'kept as it is');
  assert.equal(guard.changed(w.project, 'sequences.GenericSequence', 'crm_list_companies'), null, 'unchanged: written');
  assert.equal(guard.deleted(w.project, 'sequences.GenericSequence', 'auth_login'), true);
  assert.match(warnings[0], /^upsert-crud kept Crm\.crmdb\.list_companies as it is: it was changed since the last upsert-crud run .*spec\.overwrite: \["list_companies"\]/);
  assert.match(warnings[1], /^upsert-crud did not create auth_login again: it was deleted since the last upsert-crud run/);
  guard.wrote(w.facade);
  guard.save();
  // The kept objects stay reported at the next run: their former fingerprint is kept.
  warnings = [];
  guard = B.editGuard(ctxFor(w, warnings), w.project, '{"project":"Crm"}', {});
  assert.equal(guard.changed(w.connector, 'transactions.SqlTransaction', 'list_companies'), w.tx);
  assert.equal(guard.deleted(w.project, 'sequences.GenericSequence', 'auth_login'), true);

  // spec.overwrite names what to write again (a name, a QName, or true for all).
  warnings = [];
  guard = B.editGuard(ctxFor(w, warnings), w.project, { project: 'Crm', overwrite: ['list_companies', 'auth_login'] }, {});
  assert.equal(guard.changed(w.connector, 'transactions.SqlTransaction', 'list_companies'), null);
  assert.equal(guard.deleted(w.project, 'sequences.GenericSequence', 'auth_login'), false);
  assert.deepEqual(warnings, []);
  guard = B.editGuard(ctxFor(w, []), w.project, { overwrite: true }, {});
  assert.equal(guard.changed(w.connector, 'transactions.SqlTransaction', 'list_companies'), null);
});

test('upsert-crud runs the guard: init_schema is always written, the transactions, business sequences and auth skeletons are guarded', () => {
  const source = read('js/crud_backend.js');
  assert.match(source, /var keptTx = name !== "init_schema" && ctx\.editGuard \? ctx\.editGuard\.changed\(connector, "transactions\.SqlTransaction", name\)/);
  assert.match(source, /var keptSequence = ctx\.editGuard \? ctx\.editGuard\.changed\(project, "sequences\.GenericSequence", sequenceName\)/);
  assert.equal((source.match(/ctx\.editGuard\.deleted\(project, "sequences\.GenericSequence", "auth_log(in|out)"\)/g) || []).length, 2);
  assert.match(source, /ctx\.editGuard = C8O\.crudBackend\.editGuard\(ctx, project, options\.spec, result\);/);
  assert.match(source, /ctx\.editGuard\.save\(\);\n    var saveResult = ctx\.saveProject\(project, \[\]\);/);
});
