// Review of a generated CRM (16/11): its notes, with the demo account, were in docs/generated/PROGRESS.md, which a
// deployed server serves to anyone; its 26 SQL transactions looked public (they were Private by default, the project
// header being >= 8.0.0); init_schema empties its tables. project-lint now reports, generically:
// - SEC-CLIENT-TRANSACTION: a transaction that is not Private, an error when it writes;
// - SQL-DATA-RESET: a Private transaction that empties or drops a table, unless a "data-reset: <reason>" line says why;
// - SEC-SERVED-SECRET: a text file outside _private/, _c8oProject/ and libs/ that holds a password, token or key.
// node --test tests/scripts/validate_lint_served_and_transactions.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
// values from the vm realm: compared by their JSON
const same = (actual, expected) => assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), expected);
const javaProxy = new Proxy(function () {}, { get: () => javaProxy, apply: () => javaProxy, construct: () => javaProxy });

function load() {
  const sandbox = { C8O: { dbo: {}, util: {} }, Packages: javaProxy, JSON, include() {} };
  vm.createContext(sandbox);
  vm.runInContext(read('js/project_brief.js'), sandbox, { filename: 'project_brief.js' });
  vm.runInContext(read('js/tools_project_lint.js'), sandbox, { filename: 'tools_project_lint.js' });
  return sandbox.C8O;
}

const tx = (name, accessibility, writes, auth) => ({ qname: 'P.appdb.' + name, kind: 'transaction', accessibility,
  authenticatedContextRequired: auth === true, calls: [], writes });

test('a transaction clients can call: an error when it writes, a warning when it reads', () => {
  const C8O = load();
  const comments = { 'P.appdb.form_insert': 'Contact form of the public site.\npublic-write: anonymous contact requests' };
  const resets = { 'P.appdb.reset_all': ['deals', 'contacts'] };
  const findings = C8O.lint.transactionFindings([
    tx('list_deals', 'Private', []),
    tx('count_deals', 'Public', []),
    tx('delete_deal', 'Hidden', ['SQL DELETE'], true),
    tx('form_insert', 'Public', ['SQL INSERT']),
    tx('reset_all', 'Public', ['SQL DELETE'], false),
    { qname: 'P.list', kind: 'sequence', accessibility: 'Public', authenticatedContextRequired: false, writes: [] }
  ], (q) => comments[q] || '', (q) => resets[q] || []);
  const by = Object.fromEntries(findings.map((f) => [f.qname, f]));
  assert.equal(findings.length, 4);
  assert.equal(by['P.appdb.list_deals'], undefined, 'Private: nothing');
  assert.equal(by['P.list'], undefined, 'a sequence is the audit\'s and SEC-ANONYMOUS-WRITE\'s');
  assert.equal(by['P.appdb.count_deals'].rule, 'SEC-CLIENT-TRANSACTION');
  assert.equal(by['P.appdb.count_deals'].severity, 'warning');
  assert.match(by['P.appdb.count_deals'].message, /anyone, without signing in, can call it directly and read/);
  assert.equal(by['P.appdb.delete_deal'].severity, 'error');
  assert.match(by['P.appdb.delete_deal'].message, /any signed-in user can call it directly, and it writes \(SQL DELETE\)/);
  // explicit Private cannot be stored: the fix says to delete the line or set Private, and why
  assert.match(by['P.appdb.delete_deal'].fix, /delete its accessibility line \(a transaction without one is Private since engine 8\.0\.0/);
  // a declared public write is still reported, as a warning with its reason
  assert.equal(by['P.appdb.form_insert'].severity, 'warning');
  assert.match(by['P.appdb.form_insert'].message, /Declared public write: "anonymous contact requests"/);
  // a reset clients can call is an error, even with a reason, and one finding names both
  assert.equal(by['P.appdb.reset_all'].severity, 'error');
  assert.match(by['P.appdb.reset_all'].message, /empties or drops the tables deals, contacts/);
});

test('a Private transaction that empties or drops a table: a warning until a data-reset line gives the reason', () => {
  const C8O = load();
  const comments = {
    'P.appdb.init_ok': 'Creates the demo schema.\ndata-reset: schema init, run once by the admin sequence setup_admin',
    'P.appdb.init_empty': 'data-reset:'
  };
  const resets = { 'P.appdb.init_schema': ['companies'], 'P.appdb.init_ok': ['companies'], 'P.appdb.init_empty': ['*'] };
  const findings = C8O.lint.transactionFindings(['init_schema', 'init_ok', 'init_empty'].map((n) => tx(n, 'Private', ['SQL DELETE'])),
    (q) => comments[q] || '', (q) => resets[q] || []);
  same(findings.map((f) => [f.qname, f.rule, f.severity]),
    [['P.appdb.init_schema', 'SQL-DATA-RESET', 'warning'], ['P.appdb.init_empty', 'SQL-DATA-RESET', 'warning']]);
  assert.match(findings[0].message, /empties or drops the table companies \(DELETE without WHERE, TRUNCATE or DROP\)/);
  assert.match(findings[0].fix, /data-reset: <reason>/);
  assert.match(findings[1].message, /a whole schema.*Its data-reset line gives no reason/);
  assert.equal(C8O.lint.dataResetReason('x\n  data-reset : demo seed '), 'demo seed');
  assert.equal(C8O.lint.dataResetReason('nothing'), null);
});

test('the tables a SQL text empties or drops are the same helper requestable-execute guards with', () => {
  const util = read('js/util.js');
  assert.match(util, /C8O\.requestable\.resetTables = function \(sql\)/);
  assert.match(read('js/tools_project_lint.js'), /C8O\.requestable\.resetTables\(String\(tx\.getSqlQuery\(\)\)\)/);
});

test('served text files: the lines that hold a credential-like value, never the value', () => {
  const C8O = load();
  const mask = C8O.projectBrief.maskSecrets;
  const text = [
    '# Build notes',
    'Demo account demo@crm.example (password given at hand-off)',
    'Admin: admin@crm.example / password: `Demo2026!`',
    'DB url jdbc:postgresql://app:hunter22@db:5432/app',
    '-----BEGIN RSA PRIVATE KEY-----',
    'MIIEow',
    '-----END RSA PRIVATE KEY-----'
  ].join('\n');
  same(C8O.lint.secretLines(text, mask), [3, 4, 5]);
  same(C8O.lint.secretLines('# Notes\n- Styles live in AppLayout.', mask), []);
  same(C8O.lint.secretLines('api_key = YOUR_API_KEY\npassword: <the demo password>\ntoken: ${api.token}\nsecret = ***', mask), []);
  same(C8O.lint.secretLines(text, null), []);
});

test('.httpignore: gitignore-like patterns hide paths from the scan', () => {
  const C8O = load();
  const ignored = C8O.lint.httpIgnoreMatcher('# static docs\ndocs/\n/notes.md\n*.log\n!keep.log\nassets/**/secret*.json\n');
  assert.equal(ignored('docs', true), true);
  assert.equal(ignored('docs/generated/PROGRESS.md', false), true, 'a file under a hidden folder');
  assert.equal(ignored('sub/docs/x.md', false), true, 'docs/ without an inner slash matches at any depth');
  assert.equal(ignored('notes.md', false), true);
  assert.equal(ignored('sub/notes.md', false), false, 'a leading / anchors at the root');
  assert.equal(ignored('run.log', false), true);
  assert.equal(ignored('keep.log', false), false, '! negates');
  assert.equal(ignored('assets/a/b/secret-1.json', false), true);
  assert.equal(ignored('readme.md', false), false);
  assert.equal(C8O.lint.httpIgnoreMatcher('')('docs/x.md', false), false);
});

test('the scan skips what the engine never serves or deploys, and project-lint loads the masking', () => {
  const C8O = load();
  for (const dir of ['_private', '_c8oProject', 'libs', '.git', 'node_modules', '_data', 'DisplayObjects']) {
    assert.ok(C8O.lint.SERVED_SCAN_SKIPPED.includes(dir), dir);
  }
  assert.ok(!C8O.lint.SERVED_SCAN_SKIPPED.includes('docs'), 'docs/ is served');
  assert.ok(C8O.lint.SERVED_TEXT.test('PROGRESS.md') && C8O.lint.SERVED_TEXT.test('config.json') && !C8O.lint.SERVED_TEXT.test('app.js'));
  assert.match(read('_c8oProject/sequences/tools_project_lint.yaml'), /include\("js\/project_brief\.js"\); include\("js\/tools_project_lint\.js"\);/);
  const lint = read('js/tools_project_lint.js');
  for (const rule of ['SEC-CLIENT-TRANSACTION', 'SQL-DATA-RESET', 'SEC-SERVED-SECRET']) {
    assert.match(lint, new RegExp('"' + rule + '"'), rule);
  }
});
