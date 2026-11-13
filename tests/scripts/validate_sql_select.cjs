const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// sql-select (js/tools_sql_select.js): one bounded SELECT on a read-only connection, nothing written in the project. Agents
// created, ran and deleted probe transactions to read their tables (22 q_probe_* in PipelineCrm2, q_all_*_probe in
// PipelineCrm3, 13/11). The engine and JDBC are faked: what is checked is the statement check, the connection settings,
// the rows and the answer. A live run on a Studio is the proof that a real driver honors them.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function javaValue(className, text) {
  return { getClass: () => ({ getName: () => className }), toString: () => text };
}

function world(opts) {
  const o = opts || {};
  const log = [];
  const rows = o.rows || [];
  const columns = o.columns || [{ name: 'id', type: 'INTEGER' }, { name: 'name', type: 'VARCHAR' }];
  const connector = (name, cls) => ({
    getName: () => name,
    getClass: () => ({ getName: () => 'com.twinsoft.convertigo.beans.connectors.' + (cls || 'SqlConnector') }),
    getRealJdbcURL: () => 'jdbc:hsqldb:file:/ws/Crm/db;shutdown=true',
    getJdbcURL: () => 'jdbc:hsqldb:file:${db}',
    getJdbcDriverClassName: () => 'org.hsqldb.jdbc.JDBCDriver',
    getRealJdbcUserName: () => 'sa',
    getRealJdbcUserPassword: () => ''
  });
  const connectors = o.connectors || [connector('crmdb'), connector('api', 'HttpConnector')];
  const project = { getName: () => 'Crm', getConnectorsList: () => ({ size: () => connectors.length, get: i => connectors[i] }) };
  const jdbc = {
    setReadOnly: v => log.push('readOnly ' + v),
    setAutoCommit: v => log.push('autoCommit ' + v),
    rollback: () => log.push('rollback'),
    close: () => log.push('close'),
    createStatement: () => ({
      setMaxRows: n => log.push('maxRows ' + n),
      setQueryTimeout: s => log.push('timeout ' + s),
      close: () => log.push('statement close'),
      executeQuery: sql => {
        log.push('query ' + sql);
        if (o.sqlError) {
          throw new Error('java.sql.SQLSyntaxErrorException: ' + o.sqlError);
        }
        let i = -1;
        return {
          getMetaData: () => ({ getColumnCount: () => columns.length, getColumnLabel: c => columns[c - 1].name, getColumnTypeName: c => columns[c - 1].type }),
          next: () => ++i < rows.length,
          getObject: c => rows[i][c - 1],
          close: () => log.push('rs close')
        };
      }
    })
  };
  const context = {
    C8O: {},
    Packages: { com: { twinsoft: { convertigo: { engine: { Engine: { theApp: { databaseObjectsManager: {
      getOriginalProjectByName: name => (name === 'Crm' ? project : null) } } } } } } } },
    java: {
      lang: { Class: { forName: n => log.push('driver ' + n) } },
      sql: { DriverManager: { getConnection: (url, user) => { log.push('connect ' + url + ' ' + user); return jdbc; } } }
    }
  };
  vm.createContext(context);
  vm.runInContext(read('js/tools_sql_select.js'), context);
  return { S: context.C8O.sqlSelect, log, connector };
}

const plain = value => JSON.parse(JSON.stringify(value));

test('a SELECT is run, anything else is refused before the database sees it', () => {
  const { S } = world();
  assert.equal(S.check('SELECT id, name FROM companies ORDER BY name;').statement, 'SELECT id, name FROM companies ORDER BY name');
  assert.equal(S.check(' with t as (select 1 as n) select n from t').statement, 'with t as (select 1 as n) select n from t');
  assert.equal(S.check('(SELECT 1) UNION (SELECT 2)').statement, '(SELECT 1) UNION (SELECT 2)');
  // Words in texts, quoted names and comments are not read as SQL.
  assert.ok(S.check("SELECT \"update\", 'drop table; delete' AS note FROM t -- ; insert\n/* set ; */ WHERE name = 'it''s'"));
  assert.ok(S.check('SELECT last_update, created_at, [set] FROM t'));
  const refused = (sql, re) => assert.throws(() => S.check(sql), err => err.code === 'invalid_arguments' && re.test(err.message), sql);
  refused('', /sql is required/);
  refused('SELECT 1; SELECT 2', /one statement only/);
  refused('SELECT 1; DELETE FROM deals', /one statement only/);
  refused('DELETE FROM deals', /a SELECT only \(or WITH \.\.\. SELECT\): this tool reads data/);
  refused('UPDATE deals SET amount = 0', /a SELECT only \(or WITH \.\.\. SELECT\): this tool reads data/);
  refused('CALL reset()', /a SELECT only \(or WITH \.\.\. SELECT\): this tool reads data/);
  refused('SELECT * INTO backup FROM deals', /"INTO" makes a write or a lock: this tool reads data only/);
  refused('SELECT * FROM deals FOR UPDATE', /"UPDATE" makes a write or a lock/);
  refused('SELECT * FROM deals FOR SHARE', /"SHARE" makes a write or a lock/);
  refused('WITH gone AS (DELETE FROM deals RETURNING *) SELECT * FROM gone', /"DELETE" is not a read/);
  refused('SELECT * FROM deals WHERE id = {id}', /no \{variable\} here: write the values in the SQL/);
  refused('SELECT set FROM t', /written between double quotes \("set"\)/);
});

test('the statement runs on a read-only connection, its rows and time bounded, rolled back and closed', () => {
  const { S, log } = world({ rows: [[1, 'Acme'], [javaValue('java.math.BigDecimal', '2.00'), null], [3, 'Zen']] });
  const out = plain(S.run({ project: 'Crm', sql: 'SELECT id, name FROM companies', maxRows: '2' }));
  assert.deepEqual(log.slice(0, 7), ['driver org.hsqldb.jdbc.JDBCDriver', 'connect jdbc:hsqldb:file:/ws/Crm/db;ifexists=true sa', 'readOnly true',
    'autoCommit false', 'maxRows 3', 'timeout 20', 'query SELECT id, name FROM companies']);
  assert.deepEqual(log.slice(-4), ['rs close', 'statement close', 'rollback', 'close']);
  assert.equal(out.connector, 'crmdb', 'the one SQL connector of the project');
  assert.deepEqual(out.columns, [{ name: 'id', type: 'INTEGER' }, { name: 'name', type: 'VARCHAR' }]);
  assert.deepEqual(out.rows, [{ id: 1, name: 'Acme' }, { id: 2, name: null }]);
  assert.equal(out.truncated, true);
  assert.equal(out.readOnly, true);
  assert.match(out.warnings[0], /^Only the first 2 rows are returned/);
  assert.match(out.note, /nothing was saved in the project/);
  // Default and bound of maxRows.
  const big = world();
  big.S.run({ project: 'Crm', sql: 'SELECT 1' });
  assert.ok(big.log.includes('maxRows 51'));
  const huge = world();
  huge.S.run({ project: 'Crm', sql: 'SELECT 1', maxRows: 100000 });
  assert.ok(huge.log.includes('maxRows 501'));
});

test('cells are JSON: numbers, booleans and texts, a large text cut, a binary value described', () => {
  const { S } = world();
  const cut = { cells: 0 };
  assert.equal(S.cellValue(javaValue('java.math.BigDecimal', '37500.00'), cut), 37500);
  assert.equal(S.cellValue(javaValue('java.math.BigDecimal', '1250.50'), cut), 1250.5);
  assert.equal(S.cellValue(javaValue('java.lang.Long', '12345678901234567890'), cut), '12345678901234567890', 'beyond the safe integers: the text');
  assert.equal(S.cellValue(javaValue('java.lang.Boolean', 'true'), cut), true);
  assert.equal(S.cellValue(javaValue('java.sql.Date', '2026-12-01'), cut), '2026-12-01');
  const bytes = Object.assign([1, 2, 3], { getClass: () => ({ getName: () => '[B' }) });
  assert.equal(S.cellValue(bytes, cut), '<binary, 3 bytes>');
  assert.equal(S.cellValue('x'.repeat(2500), cut).length, 2001);
  assert.equal(cut.cells, 1);
});

test('the connector is the project\'s SQL one, named when there are several; a database error changes nothing and says why', () => {
  const { S, connector } = world();
  assert.throws(() => S.run({ project: 'Nope', sql: 'SELECT 1' }), /project Nope is not loaded/);
  assert.throws(() => S.run({ project: 'Crm', connector: 'api', sql: 'SELECT 1' }), /connector api is not an SQL connector of Crm \(its SQL connectors: crmdb\)/);
  const two = world({ connectors: [connector('a'), connector('b')] });
  assert.throws(() => two.S.run({ project: 'Crm', sql: 'SELECT 1' }), /connector is required: Crm has several SQL connectors \(a, b\)/);
  assert.equal(two.S.run({ project: 'Crm', connector: 'b', sql: 'SELECT 1' }).connector, 'b');
  // The starter's placeholder void connector is not a choice.
  const starter = world({ connectors: [connector('Database'), connector('void')] });
  assert.equal(starter.S.run({ project: 'Crm', sql: 'SELECT 1' }).connector, 'Database');
  const failing = world({ sqlError: 'user lacks privilege or object not found: DEALZ' });
  assert.throws(() => failing.S.run({ project: 'Crm', sql: 'SELECT * FROM dealz' }),
    err => err.code === 'sql_error' && /the database refused the statement: user lacks privilege or object not found: DEALZ \(nothing was changed/.test(err.message));
  assert.deepEqual(failing.log.slice(-3), ['statement close', 'rollback', 'close']);
  // A refused statement never opens a connection.
  const early = world();
  assert.throws(() => early.S.run({ project: 'Crm', sql: 'DROP TABLE deals' }));
  assert.equal(early.log.filter(l => /^connect/.test(l)).length, 0);
});

test('sql-select is a tool: its sequence passes each argument, its schemas, the Vibe list and TOOLS.md know it', () => {
  const yaml = read('_c8oProject/sequences/tools_sql_select.yaml');
  const run = /var sqlSelectResult = C8O\.sqlSelect\.run\(\{([^}]*)\}\)/.exec(yaml)[1];
  ['project', 'connector', 'sql', 'maxRows'].forEach(v => {
    assert.match(yaml, new RegExp('↓' + v + ' \\[variables\\.RequestableVariable-\\d+\\]: \\n'), v + ' is a variable');
    assert.match(run, new RegExp('\\b' + v + ': ' + v + '\\b'), v + ' is passed');
  });
  assert.match(read('c8oProject.yaml'), /↓tools_sql_select \[sequences\.GenericSequence\]: 🗏 sequences\/tools_sql_select\.yaml/);
  const context = { C8O: {}, include() {} };
  vm.createContext(context);
  vm.runInContext(read('js/schema_overrides.js'), context);
  const O = context.C8O.schemaOverrides;
  const input = plain(O.applyInput('tools_sql_select', null, null));
  assert.equal(plain(O.applyOutput('tools_sql_select', null, null)).properties.rows.type, 'array');
  assert.deepEqual(input.required, ['project', 'sql']);
  assert.equal(input.properties.maxRows.maximum, 500);
  assert.match(read('js/setup_vibe.js'), /"Convertigo_sql-select",/);
  assert.match(read('TOOLS.md'), /\| `sql-select` \| `tools_sql_select` \|/);
  assert.doesNotMatch(read('js/nocode_tool_policy.js'), /tools_sql_select/, 'not a No Code tool');
});
