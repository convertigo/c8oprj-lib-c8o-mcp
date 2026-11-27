// Run: node --test tests/scripts/validate_sql_unknown_token.cjs
// HSQLDB answered "unknown token:" 36 times in 5 minutes to one agent (TigoAccess 9213aceb, 17/11): the message names
// no character and js/sql_dialect.js only had a hint for @@IDENTITY. The hints now name the character HSQLDB cannot
// read outside a string (@x, #, \', &&, `) and its HSQLDB form, and requestable-execute counts the failures of a
// requestable with the same cause (js/repeated_failure.js): the third one says so, and the same SQL with the same values
// after a lexical error is refused without running.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function dialect() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext('var C8O = {};\n' + read('js/sql_dialect.js'), ctx, { filename: 'js/sql_dialect.js' });
  return ctx.C8O.sqlDialect;
}

test('unknown token names the character HSQLDB cannot read outside a string, and its HSQLDB form', () => {
  const D = dialect();
  const hints = sql => plain(D.errorHints('hsqldb', 'unknown token:', sql, {}));
  assert.deepEqual(hints('SELECT * FROM orders WHERE id = @id'),
    ['HSQLDB cannot read @ outside a string (at "@id"): write {id}: a variable of the transaction (or a sequence variable passed to it), bound as a parameter.']);
  assert.match(hints('SELECT 1 FROM t # the first row')[0], /^HSQLDB cannot read # outside a string \(at "# the"\): # starts no comment here: write -- comment/);
  assert.deepEqual(hints('SELECT * FROM t WHERE a = 1 && b = 2'), ['HSQLDB cannot read && outside a string (at "&&"): write AND.']);
  assert.match(hints('SELECT `label` FROM t')[0], /HSQLDB cannot read ` outside a string \(at "`label`"\): write "label" \(double quotes\) or label alone\./);
  assert.match(hints("INSERT INTO t (n) VALUES ('it\\'s')")[0], /^HSQLDB cannot read \\' in a string: the string ends there \(at .*\): a quote inside a string is doubled: write '' \(it's becomes 'it''s\)/);
  // two at once, in one answer
  assert.equal(hints('UPDATE t SET a = @a WHERE b = @b && c = 1').length, 2);
  // inside a string or a comment, nothing is said: the general hint names the characters to look for
  const quiet = hints("SELECT '@x && #' FROM t -- @y");
  assert.equal(quiet.length, 1);
  assert.match(quiet[0], /^"unknown token" is a character HSQLDB cannot read outside a string: a value is \{x\} \(not @x or :x\), a comment is -- or \/\* \*\/ \(not #\)/);
  // @@IDENTITY keeps its own rule, said once
  const identity = hints('INSERT INTO t (n) VALUES ({n}); SELECT @@IDENTITY');
  assert.equal(identity.length, 1);
  assert.match(identity[0], /^@@IDENTITY: HSQLDB has no @@IDENTITY \(SQL Server SQL\)/);
  assert.match(hints('SELECT @@ROWCOUNT')[0], /HSQLDB cannot read @@ outside a string \(at "@@ROWCOUNT"\): HSQLDB has no @@ variables/);
  // HSQLDB answers "unexpected token" on \' and ` (checked on a headless 8.5 engine, 27/11): named too, without the general hint
  const unexpected = sql => plain(D.errorHints('hsqldb', 'unexpected token: S', sql, {}));
  assert.match(unexpected("SELECT * FROM t WHERE title = 'it\\'s'")[0], /^HSQLDB cannot read \\' in a string: the string ends there/);
  assert.match(unexpected('SELECT `title` FROM t')[0], /^HSQLDB cannot read ` outside a string/);
  assert.deepEqual(unexpected('SELECT a b c FROM t').filter(h => /cannot read|unknown token/.test(h)), []);
  // another database, or another cause, gets none of them
  assert.deepEqual(plain(D.errorHints('postgresql', 'syntax error at or near "@"', 'SELECT @id', {})).filter(h => /cannot read/.test(h)), []);
  assert.deepEqual(hints('SELECT 1').filter(h => /unknown token/.test(h)).length, 1);
  assert.deepEqual(plain(D.errorHints('hsqldb', 'user lacks privilege or object not found: T', 'SELECT * FROM t WHERE a = @a', {})).filter(h => /cannot read/.test(h)), []);
});

class FakeMap {
  constructor() { this.map = new Map(); }
  get(key) { return this.map.has(key) ? this.map.get(key) : null; }
  put(key, value) { this.map.set(key, value); }
  remove(key) { this.map.delete(key); }
  size() { return this.map.size; }
  keySet() { const keys = [...this.map.keys()]; return { toArray: () => keys }; }
}

function engine(sql) {
  const clock = { now: Date.UTC(2026, 10, 27, 9, 0, 0) };
  const headers = { 'X-Convertigo-Conversation-Id': 'conv-1' };
  const values = new Map();
  const server = { get: key => (values.has(key) ? values.get(key) : null), set: (key, value) => values.set(key, value) };
  const host = { now: () => clock.now, digest: value => crypto.createHash('sha256').update(value, 'utf8').digest('hex'), newMap: () => new FakeMap() };
  const jlist = items => ({ size: () => items.length, get: i => items[i] });
  sql.defaults = sql.defaults || {};
  sql.url = sql.url || 'jdbc:hsqldb:file:shop';
  const transaction = { getSqlQuery: () => sql.text,
    getVariablesList: () => jlist(Object.keys(sql.defaults).map(name => ({ getName: () => name, getValueOrNull: () => sql.defaults[name] }))) };
  const connector = { getTransactionByName: () => transaction, getJdbcDriverClassName: () => 'org.hsqldb.jdbcDriver', getJdbcURL: () => sql.url };
  const Engine = { theApp: { databaseObjectsManager: { getOriginalProjectByName: () => ({ getConnectorByName: () => connector }) } } };
  const ctx = {
    C8O: {},
    java: { lang: { System: { currentTimeMillis: () => clock.now } } },
    Packages: { com: { twinsoft: { convertigo: { engine: { Engine } } } } },
    context: { server, httpServletRequest: { getHeader: name => headers[name] || null } }
  };
  vm.createContext(ctx);
  ctx.include = file => {
    if (file === 'js/repeated_failure.js') {
      ctx.C8O.repeatedFailure = { host };
    }
    if (file === 'js/before_guard.js') {
      ctx.C8O.beforeGuard = { host };
    }
    vm.runInContext(read(file), ctx, { filename: file });
  };
  ctx.include('js/util.js');
  return { R: ctx.C8O.requestable, clock, headers, server: { values } };
}

const plan = variables => ({ requestable: 'Shop.shopdb.list_orders', project: 'Shop', connector: 'shopdb', name: 'list_orders', isSequence: false, variables });
const failure = cause => ({ status: 'error', error: { message: 'An unexpected error occured while executing transaction. Could not execute the SQL query. Cause: ' + cause, cause } });

test('the third failure in a row with the same cause says so; a success or another cause starts again', () => {
  const sql = { text: 'SELECT * FROM orders WHERE customer = {customer}' };
  const { R } = engine(sql);
  const answers = [];
  for (const id of [17, 18, 19]) {
    const call = plan({ customer: 'c' + id });
    R.guardRepeatedRun(call);
    // the cause holds the value of the call: the same cause all the same
    const answer = failure("user lacks privilege or object not found: ORDER_" + id);
    R.afterCall(call, answer);
    answers.push(answer);
  }
  assert.equal(answers[0].error.repeated, undefined);
  assert.equal(answers[1].error.repeated, undefined);
  assert.equal(answers[2].error.repeated, 3);
  assert.match(answers[2].error.repeatedNote, /^Failure 3 in a row of Shop\.shopdb\.list_orders with this same cause in this conversation: calling it again as it is gives the same error\./);
  // not a lexical cause: the same call still runs (the table may exist now)
  assert.doesNotThrow(() => R.guardRepeatedRun(plan({ customer: 'c19' })));
  const other = failure('data exception: invalid datetime format');
  R.afterCall(plan({ customer: 'c20' }), other);
  assert.equal(other.error.repeated, undefined, 'another cause counts from 1');
  R.afterCall(plan({ customer: 'c21' }), { status: 'ok', payload: {} });
  const after = failure('data exception: invalid datetime format');
  R.afterCall(plan({ customer: 'c22' }), after);
  R.afterCall(plan({ customer: 'c23' }), after);
  assert.equal(after.error.repeated, undefined, 'a success cleared the count');
});

test('the same SQL with the same values after an unknown token is refused without running, with the hints', () => {
  const sql = { text: 'SELECT * FROM orders WHERE customer = @customer' };
  const { R, headers } = engine(sql);
  const first = plan({ customer: 'c1' });
  R.guardRepeatedRun(first);
  assert.match(first.runDigest, /^[0-9a-f]{64}$/);
  R.afterCall(first, failure('unknown token:'));
  assert.throws(() => R.guardRepeatedRun(plan({ customer: 'c1' })),
    /^Error: Refused without running anything: Shop\.shopdb\.list_orders already failed in this conversation with this same SQL and these same values, on "unknown token:", an error the database gives while it reads the statement: it fails again\. Change the SQL first \(databaseobject-tree-apply on the transaction\), or what it is read with \(the values, the defaults of the variables, the connector\)\. HSQLDB cannot read @ outside a string \(at "@customer"\): write \{customer\}/);
  assert.doesNotThrow(() => R.guardRepeatedRun(plan({ customer: 'c2' })), 'other values run');
  headers['X-Convertigo-Conversation-Id'] = 'conv-2';
  assert.doesNotThrow(() => R.guardRepeatedRun(plan({ customer: 'c1' })), 'another conversation runs it');
  headers['X-Convertigo-Conversation-Id'] = 'conv-1';
  // what the SQL is read with changed: it runs again
  sql.defaults.limit = '10';
  assert.doesNotThrow(() => R.guardRepeatedRun(plan({ customer: 'c1' })), 'a default value of a variable changed');
  delete sql.defaults.limit;
  assert.throws(() => R.guardRepeatedRun(plan({ customer: 'c1' })), /Refused without running anything/);
  sql.url = 'jdbc:hsqldb:file:other';
  assert.doesNotThrow(() => R.guardRepeatedRun(plan({ customer: 'c1' })), 'the connector changed');
  sql.url = 'jdbc:hsqldb:file:shop';
  sql.text = 'SELECT * FROM orders WHERE customer = {customer}';
  assert.doesNotThrow(() => R.guardRepeatedRun(plan({ customer: 'c1' })), 'the SQL changed: it runs');
});

test('requestable-execute guards a transaction before running it, and the stores keep digests only', () => {
  const util = read('js/util.js');
  assert.match(util, /C8O\.requestable\._resetExecutionState\(executionPlan, seqStep, txStep\);\n\s+\/\/ The same SQL[^\n]*\n[^\n]*\n\s+C8O\.requestable\.guardRepeatedRun\(executionPlan\);\n\s+if \(executionPlan\.recordSchema === true\)/);
  assert.match(read('js/repeated_failure.js'), /api\.MAX_SCOPES = 64;\n\s+api\.MAX_ITEMS = 50;/);
  // its own store: js/mcp_repeated_failures.js keeps lib_ConvertigoMCP.repeatedFailures
  assert.match(read('js/repeated_failure.js'), /api\.STORE_KEY = "lib_ConvertigoMCP\.sameCauseFailures";/);
  assert.match(read('js/mcp_repeated_failures.js'), /var REPEAT_STORE_KEY = "lib_ConvertigoMCP\.repeatedFailures";/);
  const { R, server } = engine({ text: 'SELECT * FROM users WHERE password = @password' });
  const call = plan({ password: 'Secret-Value-42' });
  R.guardRepeatedRun(call);
  R.afterCall(call, failure('unknown token:'));
  const kept = JSON.stringify([...server.values.get('lib_ConvertigoMCP.sameCauseFailures').map.values()]);
  assert.match(kept, /unknown token:/, 'the cause is kept');
  assert.doesNotMatch(kept, /Secret-Value-42|password/i, 'the values and the SQL of a call are never kept, only digests');
});
