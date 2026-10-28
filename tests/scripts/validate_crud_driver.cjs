const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// upsert-crud reads the database engine from spec.database.mode. On 28/10, two Vibe runs wrote it as database.type,
// connectorType or driverFamily, or named only an existing connector, and each call failed with "Unsupported database
// mode/technology: " and an empty value until the agent built everything by hand. The specs below are the ones sent.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// The real C8O.crudSpec and C8O.crudRuntime, with the helpers of js/tools_crud.js and the existing SQL connectors of
// the project as { project: { connector: jdbcDriverClassName } }.
function crudSpec(connectors) {
  const context = { C8O: {} };
  vm.createContext(context);
  vm.runInContext(read('js/crud_spec.js'), context);
  vm.runInContext(read('js/crud_runtime.js'), context);
  const S = context.C8O.crudSpec;
  const lookups = [];
  const ctx = {
    trimmed: v => (v == null ? '' : String(v).trim()),
    clone: v => JSON.parse(JSON.stringify(v)),
    normalizedIdentifier: v => String(v).replace(/[^A-Za-z0-9_]/g, '_').toLowerCase(),
    connectorEngine(project, name) {
      lookups.push(project + '.' + name);
      const jdbc = ((connectors || {})[project] || {})[name];
      if (jdbc === undefined) {
        return null;
      }
      return { name, jdbcDriverClassName: jdbc, engine: S.inferDriverFamilyFromConnector(ctx, { getJdbcDriverClassName: () => jdbc }) };
    }
  };
  return { S, R: context.C8O.crudRuntime, ctx, lookups, database: spec => S.normalizeDatabaseSpec(ctx, spec) };
}

const HSQLDB = 'org.hsqldb.jdbcDriver';

test('upsert-crud takes the engine from database.type and connectorType when they name one', () => {
  const { database } = crudSpec();
  const mix = database({ project: 'ContactsMix', database: { connector: 'contactsDB', type: 'HSQLDB' } });
  assert.equal(mix.mode, 'hsqldb');
  assert.equal(mix.connector, 'contactsDB');
  assert.equal(mix.source, 'spec');
  assert.equal(database({ project: 'ContactsVibe', database: { name: 'ContactsVibe', connectorType: 'HSQLDB' } }).mode, 'hsqldb');
  assert.equal(database({ project: 'App', database: { driverFamily: 'postgresql' } }).mode, 'postgresql');
});

test('upsert-crud reads the engine of the existing connector the spec names', () => {
  const { database } = crudSpec({ ContactsMix: { contactsDB: HSQLDB }, ContactsVibe: { ContactsDB: HSQLDB } });
  for (const raw of [{ connector: 'contactsDB', type: 'SQL' }, { connector: 'contactsDB', driverFamily: 'SQL' }]) {
    const db = database({ project: 'ContactsMix', database: raw });
    assert.equal(db.mode, 'hsqldb', JSON.stringify(raw));
    assert.equal(db.source, 'connector');
  }
  // spec.connector at the top of the spec, no database: the run of the preview.
  const vibe = database({ project: 'ContactsVibe', connector: 'ContactsDB', entities: [] });
  assert.equal(vibe.connector, 'ContactsDB');
  assert.equal(vibe.mode, 'hsqldb');
  assert.equal(database({ project: 'ContactsVibe', database: { connector: 'ContactsVibe.cn:ContactsDB' } }).connector, 'ContactsDB');
  // The default connector of the spec counts too: a second upsert-crud on the same project.
  const { database: again } = crudSpec({ App: { Appdb: 'org.postgresql.Driver' } });
  assert.equal(again({ project: 'App' }).mode, 'postgresql');
});

test('a connector that gave the engine keeps its connection settings', () => {
  const { R, database, ctx } = crudSpec({ ContactsVibe: { ContactsDB: HSQLDB } });
  const kept = R.connectorProperties(ctx, { project: 'ContactsVibe', database: database({ project: 'ContactsVibe', connector: 'ContactsDB' }) });
  assert.deepEqual(Object.keys(kept), ['comment']);
  const set = R.connectorProperties(ctx, { project: 'ContactsVibe', database: database({ project: 'ContactsVibe', database: { mode: 'hsqldb' } }) });
  assert.equal(set.jdbcDriverClassName, HSQLDB);
  assert.equal(set.jdbcURL, 'jdbc:hsqldb:file:./database/contactsvibe;shutdown=true');
});

test('database.mode wins over the aliases and the connector, and is never looked up', () => {
  const { database, lookups } = crudSpec({ App: { appdb: HSQLDB } });
  const db = database({ project: 'App', database: { mode: 'postgresql', type: 'hsqldb', connector: 'appdb' } });
  assert.equal(db.mode, 'postgresql');
  assert.equal(db.source, 'spec');
  // crud-status and crud-proof always pass a mode.
  assert.equal(database({ project: 'App', database: { mode: 'hsqldb', connector: 'appdb' } }).mode, 'hsqldb');
  assert.deepEqual(lookups, []);
});

test('engine names are read as people write them', () => {
  const { database } = crudSpec();
  const mode = m => database({ project: 'App', database: { mode: m } }).mode;
  assert.equal(mode('HSQLDB'), 'hsqldb');
  assert.equal(mode('hsql'), 'hsqldb');
  assert.equal(mode('Postgres'), 'postgresql');
  assert.equal(mode('PostgreSQL'), 'postgresql');
  assert.equal(mode('SQL Server'), 'sqlserver');
  assert.equal(mode('mssql'), 'sqlserver');
  assert.equal(mode('MariaDB'), 'mariadb');
  assert.equal(database({ project: 'App', database: { technology: 'Oracle' } }).mode, 'oracle');
});

test('without an engine, the error names the field, the values and the connector route', () => {
  const { database } = crudSpec();
  const refused = spec => {
    try {
      database(spec);
    } catch (e) {
      return e.message;
    }
    assert.fail('accepted ' + JSON.stringify(spec));
  };
  const none = refused({ project: 'ContactsVibe', entities: [] });
  assert.match(none, /^spec\.database\.mode is required: hsqldb, postgresql, mariadb, mysql, sqlserver or oracle, /);
  assert.match(none, /"database": \{"mode": "hsqldb", "connector": "ContactsVibedb"\}/);
  assert.match(none, /left out when database\.connector names an existing SQL connector/);
  const sql = refused({ project: 'ContactsMix', database: { connector: 'contactsDB', type: 'SQL' } });
  assert.match(sql, /"connector": "contactsDB"/);
  assert.match(sql, /database\.type "SQL" is not one of them\./);
  assert.match(refused({ project: 'App', database: { driverFamily: 'SQL' } }), /database\.driverFamily "SQL" is not one of them\./);
  assert.match(refused({ project: 'App', database: { mode: 'db2' } }),
    /^Unsupported database\.mode "db2": use hsqldb, postgresql, mariadb, mysql, sqlserver or oracle, or leave mode out/);
  assert.match(refused({ project: 'App', database: { mode: 'SQL' } }), /^Unsupported database\.mode "SQL"/);
  const { database: db2 } = crudSpec({ App: { appdb: 'com.ibm.db2.jcc.DB2Driver' } });
  assert.throws(() => db2({ project: 'App', database: { connector: 'appdb' } }),
    /Connector appdb uses the JDBC driver com\.ibm\.db2\.jcc\.DB2Driver, which upsert-crud does not generate for\./);
});

test('the upsert-crud input schema shows database.mode and its values', () => {
  const context = { C8O: { schemaOverrides: { _helpers: { booleanFlagSchema: (d, description) => ({ type: 'boolean', default: d, description }) } } } };
  vm.createContext(context);
  vm.runInContext(read('js/schema_overrides_crud.js'), context);
  const database = context.C8O.schemaOverridesCrud.applyInput('tools_upsert_crud').properties.spec.properties.database;
  assert.match(database.properties.mode.description, /hsqldb .*postgresql, mariadb, mysql, sqlserver or oracle/);
  assert.equal(database.properties.mode.enum, undefined, 'no enum: a client would refuse "HSQLDB" before the tool reads it');
});
