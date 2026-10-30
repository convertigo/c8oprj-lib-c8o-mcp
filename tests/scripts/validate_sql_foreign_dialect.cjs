const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// SQL written for another database (js/sql_dialect.js foreignSyntax and errorHints, the hints of requestable-execute).
// TigoAccess 28/10, Studio 8.4.6, mistral-large-4 on HSQLDB: "user lacks privilege or object not found:
// FORMATDATETIME", "data exception: invalid interval format", "data exception: invalid datetime format"; RETURNING and
// LAST_INSERT_ID in the Studio check. Every HSQLDB form and error below was run on HSQLDB 2.7.4 (the engine's), the
// PostgreSQL ones on PostgreSQL 15; MariaDB/MySQL, Oracle and SQL Server follow their documentation.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function dialect() {
  const context = { C8O: {} };
  vm.createContext(context);
  vm.runInContext(read('js/sql_dialect.js'), context);
  return context.C8O.sqlDialect;
}

const D = dialect();
const find = (d, sql) => plain(D.foreignSyntax(d, sql, 8));
const names = (d, sql) => find(d, sql).map(f => f.name);

test('the three reported HSQLDB failures are caught before the run, with the HSQLDB form', () => {
  const [format] = find('hsqldb', "SELECT FORMATDATETIME(r.date_rencontre, 'dd/MM/yyyy HH:mm') AS \"date\" FROM t_rencontre r");
  assert.equal(format.expression, "FORMATDATETIME(r.date_rencontre, 'dd/MM/yyyy HH:mm')");
  assert.equal(format.error, 'user lacks privilege or object not found: FORMATDATETIME');
  assert.equal(format.fix, "TO_CHAR(r.date_rencontre, 'DD/MM/YYYY HH24:MI')");

  const [interval] = find('hsqldb', "SELECT l.id AS \"id\" FROM lobby l WHERE l.created_at > CURRENT_TIMESTAMP - INTERVAL '30 minutes'");
  assert.equal(interval.error, 'data exception: invalid interval format');
  assert.match(interval.fix, /^INTERVAL '30' MINUTE .*or 30 MINUTE right after the date/);
  assert.match(find('hsqldb', "SELECT 1 AS \"x\" FROM t WHERE d > CURRENT_DATE - INTERVAL '2 weeks'")[0].fix, /^14 DAY .*no WEEK/);

  // A datetime-local value written into the SQL: HSQLDB refuses it when it prepares the statement.
  const [seed] = find('hsqldb', "INSERT INTO rencontre (nom, debut) VALUES ('a', '2026-10-28T20:30'), ('b', '28/10/2026')");
  assert.equal(seed.expression, "'2026-10-28T20:30'");
  assert.equal(seed.error, 'data exception: invalid datetime format');
  assert.equal(seed.fix, "'2026-10-28 20:30:00'");
  assert.equal(find('hsqldb', "INSERT INTO r (d) VALUES ('28/10/2026')")[0].fix, "'2026-10-28'");
  assert.match(find('hsqldb', "INSERT INTO r (d) VALUES ('05/10/2026')")[0].fix, /'2026-10-05' \(if 05\/10\/2026 is day\/month\), or TO_DATE/);
  const [typed] = find('hsqldb', "SELECT 1 AS \"x\" FROM t WHERE ts > TIMESTAMP '2026-10-28T10:00:00Z'");
  assert.equal(typed.fix, "TIMESTAMP '2026-10-28 10:00:00'");
  assert.equal(find('hsqldb', "SELECT CAST('2026-10-28 10:00' AS TIMESTAMP) AS \"t\" FROM t")[0].fix, "TIMESTAMP '2026-10-28 10:00:00'");
});

test('RETURNING and LAST_INSERT_ID on HSQLDB point to IDENTITY() in a second statement', () => {
  const [returning] = find('hsqldb', 'INSERT INTO lobby (nom) VALUES ({nom}) RETURNING id');
  assert.equal(returning.expression, 'RETURNING id');
  assert.equal(returning.error, 'unexpected token: RETURNING');
  assert.match(returning.fix, /SELECT IDENTITY\(\) AS "id" FROM \(VALUES\(0\)\)/);
  const [last] = find('hsqldb', 'INSERT INTO lobby (nom) VALUES ({nom}); SELECT LAST_INSERT_ID() AS "id"');
  assert.equal(last.error, 'user lacks privilege or object not found: LAST_INSERT_ID');
  assert.match(last.fix, /^IDENTITY\(\) in a second statement of the same transaction/);
  assert.match(find('hsqldb', 'INSERT INTO t (id, n) VALUES ({id}, {n}) ON CONFLICT (id) DO UPDATE SET n = EXCLUDED.n')[0].fix, /^MERGE INTO t USING \(VALUES/);
});

test('HSQLDB is never flagged for the forms of other databases it reads', () => {
  const sql = "SELECT NOW() AS \"n\", IFNULL(a, 'x') AS \"a\", NVL(b, 0) AS \"b\", GROUP_CONCAT(c) AS \"c\", STRING_AGG(c, ',') AS \"s\", " +
    "DATEADD('day', 1, d) AS \"d\", DATE_ADD(d, INTERVAL 1 DAY) AS \"e\", DATE_SUB(d, INTERVAL -7 DAY) AS \"f\", DATEDIFF('day', d, CURRENT_DATE) AS \"g\", " +
    "UUID() AS \"u\", RAND() AS \"r\", SYSDATE AS \"y\", CURDATE() AS \"z\", TRUNC(ts, 'MM') AS \"m\", TO_CHAR(ts, 'DD/MM/YYYY') AS \"t\", " +
    "TO_DATE('28/10/2026', 'DD/MM/YYYY') AS \"p\", IDENTITY() AS \"i\" FROM t WHERE ts > CURRENT_TIMESTAMP - 30 MINUTE " +
    "AND d > CURRENT_DATE - INTERVAL '7' DAY AND ts > TIMESTAMP '2026-10-28 10:00:00+02:00' AND d = DATE '2026-10-28' AND d < '2026-10-28' LIMIT 5";
  assert.deepEqual(names('hsqldb', sql), []);
  assert.deepEqual(names('hsqldb', 'SELECT TOP 5 n AS "n" FROM t'), []);
  assert.deepEqual(names('hsqldb', 'MERGE INTO t USING (VALUES({id}, {n})) AS v(id, n) ON t.id = v.id WHEN NOT MATCHED THEN INSERT (n) VALUES (v.n)'), []);
});

test('text inside string literals and comments is no SQL', () => {
  assert.deepEqual(names('hsqldb', "SELECT 'LAST_INSERT_ID() RETURNING x' AS \"t\" FROM t -- FORMATDATETIME(d, 'x')\n/* INTERVAL '7 days' */"), []);
  assert.deepEqual(names('hsqldb', "SELECT 1 AS \"x\" FROM t WHERE kind = 'DATE' AND v = 'x'"), []);
  assert.deepEqual(names('hsqldb', "SELECT 1 AS \"x\" FROM t WHERE label = 'it''s 2026-10-28T10:00'"), []);
});

test('the rules follow the database of the connector, never HSQLDB by default', () => {
  const sql = "SELECT FORMATDATETIME(d, 'yyyy') AS \"y\", IFNULL(a, '') AS \"a\", d - 7 DAY AS \"w\" FROM t WHERE ts > NOW() - INTERVAL 7 DAY";
  assert.deepEqual(names('', sql), [], 'an unknown driver gets no rule');
  const pg = find('postgresql', sql);
  assert.deepEqual(pg.map(f => [f.name, f.fix]), [
    ['FORMATDATETIME()', "TO_CHAR(d, 'YYYY')"],
    ['IFNULL()', "COALESCE(a, '')"],
    ['INTERVAL n UNIT', "INTERVAL '7 days'"],
    ['date - n UNIT', "INTERVAL '7 days'"]
  ]);
  assert.ok(pg.every(f => f.error === '' && !/the call fails/.test(f.message)), 'HSQLDB errors are only named on HSQLDB');
  assert.deepEqual(names('postgresql', "INSERT INTO t (n) VALUES ({n}) RETURNING id AS \"id\"; SELECT d - INTERVAL '7 days', DATE_TRUNC('month', ts), name::text FROM t LIMIT 3"), []);
  assert.equal(find('mysql', "SELECT FORMATDATETIME(d, 'dd/MM/yyyy') AS d FROM t")[0].fix, "DATE_FORMAT(d, '%d/%m/%Y')");
  assert.deepEqual(names('mysql', "SELECT DATE_FORMAT(d, '%Y') AS y, d - INTERVAL -7 DAY, LAST_INSERT_ID(), IFNULL(a, 1) FROM t LIMIT 3"), []);
  assert.equal(find('sqlserver', 'SELECT LAST_INSERT_ID() AS id')[0].fix, 'OUTPUT INSERTED.id AS "id" between the column list and VALUES');
  assert.deepEqual(names('sqlserver', 'SELECT TOP 5 GETDATE(), SCOPE_IDENTITY(), DATEADD(day, 1, d), ISNULL(a, 0) FROM t'), []);
  assert.deepEqual(names('oracle', "SELECT NVL(a, 0), SYSDATE, TRUNC(d, 'MM'), d + INTERVAL '7' DAY FROM t FETCH FIRST 5 ROWS ONLY"), []);
  assert.deepEqual(names('oracle', 'SELECT NOW() FROM t LIMIT 5'), ['NOW()', 'LIMIT n']);
});

test('the optional filter of the guide is never flagged: the engine binds an empty date as NULL (checked live)', () => {
  for (const d of ['hsqldb', 'postgresql', 'mysql', 'oracle', 'sqlserver']) {
    assert.deepEqual(names(d, "SELECT r.id AS \"id\" FROM r WHERE ({jour} = '' OR r.date_rencontre = {jour})"), [], d);
  }
});

test('the SQL of the fast path guides passes in their own database', () => {
  for (const [file, d] of [['resources/convertigo_fast_path_sql_hsqldb.md', 'hsqldb'], ['resources/convertigo_fast_path_sql_postgresql.md', 'postgresql'],
    ['resources/convertigo_fast_path_sql_mariadb.md', 'mysql']]) {
    const blocks = [...read(file).matchAll(/```sql\n([\s\S]*?)```/g)].map(m => m[1]);
    assert.ok(blocks.length > 0, file);
    blocks.forEach(sql => assert.deepEqual(names(d, sql), [], file + ': ' + sql.slice(0, 80)));
  }
});

test('errorHints: the formats HSQLDB reads, the values of the call it refuses, the equivalents of the statement', () => {
  // From a sequence the dialect is unknown: the wording of the cause is HSQLDB's.
  const format = D.errorHints('', 'user lacks privilege or object not found: FORMATDATETIME', "SELECT FORMATDATETIME(r.d, 'dd/MM/yyyy') AS \"d\" FROM r", {});
  assert.equal(format.length, 1);
  assert.match(format[0], /Write TO_CHAR\(r\.d, 'DD\/MM\/YYYY'\)\.$/);
  assert.match(D.errorHints('', 'user lacks privilege or object not found: FORMATDATETIME', '', {})[0], /FORMATDATETIME\(\).*TO_CHAR/);

  const datetime = D.errorHints('hsqldb', 'data exception: invalid datetime format', 'UPDATE r SET debut = {debut}, fin = {fin} WHERE id = {id}',
    { debut: '2026-10-28T20:30', fin: '2026-10-28T22:00:00.000Z', id: '3', nom: '28 rue X' });
  assert.match(datetime[0], /^HSQLDB reads a DATE as 'YYYY-MM-DD' and a TIMESTAMP as 'YYYY-MM-DD HH:MM:SS'/);
  assert.match(datetime[0], /A \{variable\} it cannot read as a date is bound as NULL, without error/);
  assert.match(datetime[0], /debut = '2026-10-28T20:30' has a T between the date and the time: TO_TIMESTAMP\(\{debut\}, 'YYYY-MM-DD"T"HH24:MI'\)/);
  assert.match(datetime[0], /fin = .* TO_TIMESTAMP\(SUBSTRING\(\{fin\}, 1, 19\), 'YYYY-MM-DD"T"HH24:MI:SS'\) \(the time zone is dropped\)/);
  assert.doesNotMatch(datetime[0], /nom =|id =/);

  // TO_TIMESTAMP of an empty text fails when the statement runs: the message is the driver's.
  const empty = D.errorHints('hsqldb', "data exception: invalid datetime format: java.time.format.DateTimeParseException: Text '' could not be parsed at index 0",
    "INSERT INTO r (debut) VALUES (TO_TIMESTAMP({debut}, 'YYYY-MM-DD\"T\"HH24:MI'))", { debut: '', nom: 'x' });
  assert.match(empty[0], /CASE WHEN \{x\} = '' THEN NULL ELSE TO_TIMESTAMP/);
  assert.match(empty[0], /Values of this call: debut is empty\.$/);

  const interval = D.errorHints('', 'data exception: invalid interval format', "SELECT 1 FROM r WHERE d > CURRENT_TIMESTAMP - INTERVAL '30 minutes'", {});
  assert.match(interval[0], /^HSQLDB reads an interval as INTERVAL '7' DAY/);
  assert.match(interval[1], /INTERVAL '30' MINUTE/);

  // The finding whose error is the cause comes first.
  const upsert = D.errorHints('', 'unexpected token: ON', "INSERT INTO t (id) VALUES ({id}) ON CONFLICT DO NOTHING; SELECT GETDATE() AS \"d\"", {});
  assert.match(upsert[0], /^ON CONFLICT: .*MERGE INTO/);
  assert.deepEqual(plain(D.errorHints('', 'integrity constraint violation: foreign key no parent', 'INSERT INTO t (a) VALUES ({a})', {})), []);
  assert.deepEqual(plain(D.errorHints('postgresql', 'ERROR: relation "t" does not exist', 'SELECT 1 FROM t', {})), []);
});

// --- requestable-execute: the BuildCompactResult step of the YAML, run on the error documents the engine returns ---

function stepExpression(file, step) {
  const lines = read(file).split('\n');
  const at = lines.findIndex(l => l.startsWith('↓' + step + ' [steps.SimpleStep'));
  const start = lines.findIndex((l, i) => i > at && /^\s*expression: \|\s*$/.test(l));
  const indent = lines[start + 1].match(/^\s*/)[0];
  const body = [];
  for (let i = start + 1; i < lines.length && (lines[i].startsWith(indent) || !lines[i].trim()); i++) {
    body.push(lines[i].slice(indent.length));
  }
  return body.join('\n').trim().replace(/^'|'$/g, '').replace(/''/g, "'");
}

const BUILD = stepExpression('_c8oProject/sequences/tools_requestable_execute.yaml', 'BuildCompactResult');

function execute(error, plan, transaction) {
  const connector = {
    getJdbcDriverClassName: () => 'org.hsqldb.jdbc.JDBCDriver',
    getJdbcURL: () => 'jdbc:hsqldb:file:./database/rencontres',
    getTransactionByName: name => (transaction && name === plan.name ? Object.assign({ getParent: () => connector }, transaction) : null)
  };
  const project = { getConnectorByName: name => (name === 'rencontresDB' ? connector : null) };
  const context = {
    requestableResponse: {},
    executionPlan: Object.assign({ project: 'Rencontres', connector: 'rencontresDB', isSequence: false, variables: {} }, plan),
    executionLogsPayload: null,
    Packages: { com: { twinsoft: { convertigo: { engine: {
      util: { XMLUtils: { XmlToJson: () => JSON.stringify({ document: { error } }) } },
      Engine: { theApp: { databaseObjectsManager: { getOriginalProjectByName: name => (name === 'Rencontres' ? project : null) } } } } } } } },
    include: file => vm.runInContext(read(file), context)
  };
  context.C8O = {};
  vm.createContext(context);
  vm.runInContext(BUILD, context);
  return plain(context.requestableExecutionResult);
}

const PREPARE = 'Unable to retrieve a prepared statement for the query on connection, ';

test('requestable-execute: a statement refused when prepared gets hints right after its cause', () => {
  const statement = "SELECT FORMATDATETIME(r.date_rencontre, 'dd/MM/yyyy') AS \"date\" FROM t_rencontre r";
  const out = execute({ message: 'An unexpected error occured while executing transaction. Could not execute the SQL query.',
    details: PREPARE + 'user lacks privilege or object not found: FORMATDATETIME in statement [' + statement + '], user lacks privilege or object not found: FORMATDATETIME',
    exception: 'com.twinsoft.convertigo.engine.EngineException' }, { requestable: 'Rencontres.rencontresDB.q_rencontres', name: 'q_rencontres' });
  assert.equal(out.status, 'error');
  assert.equal(out.error.message, 'An unexpected error occured while executing transaction. Could not execute the SQL query. Cause: user lacks privilege or object not found: FORMATDATETIME',
    'the message keeps its form, so the feedback groups stay the same');
  assert.deepEqual(Object.keys(out.error).slice(0, 3), ['message', 'cause', 'hints']);
  assert.match(out.error.hints[0], /Write TO_CHAR\(r\.date_rencontre, 'DD\/MM\/YYYY'\)\./);
  assert.equal(out.error.exception, 'com.twinsoft.convertigo.engine.EngineException');

  const interval = execute({ message: 'An unexpected error occured while executing transaction. Could not execute the SQL query.',
    details: PREPARE + "data exception: invalid interval format in statement [SELECT l.id AS \"id\" FROM lobby l WHERE l.created_at > CURRENT_TIMESTAMP - INTERVAL '30 minutes']" },
  { name: 'q_lobbys' });
  assert.match(interval.error.hints.join('\n'), /INTERVAL '30' MINUTE/);
});

test('requestable-execute: an error raised when the statement runs gets hints from its message and the transaction SQL', () => {
  // Checked live: the engine answers the driver message, with no details.
  const out = execute({ message: "data exception: invalid datetime format: java.time.format.DateTimeParseException: Text '' could not be parsed at index 0",
    details: '' }, { name: 'w_rencontre_insert', variables: { nom: 'Finale', debut: '' } },
  { getSqlQuery: () => "INSERT INTO t_rencontre (nom, debut) VALUES ({nom}, TO_TIMESTAMP({debut}, 'YYYY-MM-DD\"T\"HH24:MI'))" });
  assert.equal(out.error.cause, undefined);
  assert.match(out.error.message, /^data exception: invalid datetime format/);
  assert.deepEqual(Object.keys(out.error).slice(0, 2), ['message', 'hints']);
  assert.match(out.error.hints[0], /CASE WHEN \{x\} = '' THEN NULL ELSE TO_TIMESTAMP.*debut is empty/);
});

test('requestable-execute: other errors keep their shape', () => {
  const fk = execute({ message: 'An unexpected error occured while executing transaction. Could not execute the SQL query.',
    details: PREPARE + 'integrity constraint violation: foreign key no parent in statement [INSERT INTO t (a) VALUES (?)]' }, { name: 'w_t' });
  assert.equal(fk.error.cause, 'integrity constraint violation: foreign key no parent');
  assert.equal(fk.error.hints, undefined);
  const step = execute({ message: 'An exception occured while executing step', details: '' }, { name: 'seq', isSequence: true, connector: null });
  assert.equal(step.error.cause, undefined);
  assert.equal(step.error.message, 'An exception occured while executing step');
});

test('a column default after NOT NULL is caught on HSQLDB and Oracle, with the order they take', () => {
  // HSQLDB 2.7.4: "ALTER TABLE d ADD COLUMN v INTEGER NOT NULL DEFAULT 30" -> unexpected token: DEFAULT; DEFAULT 30 NOT NULL runs.
  const [alter] = find('hsqldb', 'ALTER TABLE devis ADD COLUMN IF NOT EXISTS validite_jours INTEGER NOT NULL DEFAULT 30;');
  assert.equal(alter.name, 'NOT NULL DEFAULT');
  assert.equal(alter.expression, 'NOT NULL DEFAULT 30');
  assert.equal(alter.fix, 'DEFAULT 30 NOT NULL');
  assert.equal(alter.error, 'unexpected token: DEFAULT');
  assert.equal(D.foreignSyntaxText(alter), 'NOT NULL DEFAULT 30: a column default goes before NOT NULL here: the call fails with "unexpected token: DEFAULT". Write DEFAULT 30 NOT NULL.');
  const [text] = find('oracle', "CREATE TABLE t (statut VARCHAR(12) NOT NULL DEFAULT 'brouillon', n INTEGER)");
  assert.equal(text.fix, "DEFAULT 'brouillon' NOT NULL");
  assert.equal(find('hsqldb', 'CREATE TABLE t (d DATE NOT NULL DEFAULT CURRENT_DATE)')[0].fix, 'DEFAULT CURRENT_DATE NOT NULL');
  for (const ok of ['ALTER TABLE t ADD COLUMN v INTEGER DEFAULT 30 NOT NULL', "SELECT 'NOT NULL DEFAULT 1' AS \"label\" FROM t"]) {
    assert.deepEqual(names('hsqldb', ok), [], ok);
  }
  for (const other of ['postgresql', 'mysql', 'sqlserver']) {
    assert.deepEqual(names(other, 'ALTER TABLE t ADD COLUMN v INTEGER NOT NULL DEFAULT 30'), [], other + ' takes both orders');
  }
});

test('the HSQLDB error of a column default after NOT NULL comes back with the order to write', () => {
  const hints = plain(D.errorHints('', 'unexpected token: DEFAULT', 'ALTER TABLE devis ADD COLUMN v INTEGER NOT NULL DEFAULT 30', {}));
  assert.ok(hints.some(h => /Write DEFAULT 30 NOT NULL/.test(h)), JSON.stringify(hints));
});
