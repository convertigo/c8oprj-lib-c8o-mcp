#!/usr/bin/env node
// Checks js/sql_dialect.js: what each database refuses or misreads, and the SQL forms written for it.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const context = { C8O: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "..", "js", "sql_dialect.js"), "utf8"), context);
const D = context.C8O.sqlDialect;

assert.strictEqual(D.detect("org.hsqldb.jdbc.JDBCDriver", "jdbc:hsqldb:file:x"), "hsqldb");
assert.strictEqual(D.detect("org.postgresql.Driver", ""), "postgresql");
assert.strictEqual(D.detect("org.mariadb.jdbc.Driver", ""), "mysql");
assert.strictEqual(D.detect("com.mysql.cj.jdbc.Driver", ""), "mysql");
assert.strictEqual(D.detect("oracle.jdbc.OracleDriver", ""), "oracle");
assert.strictEqual(D.detect("com.microsoft.sqlserver.jdbc.SQLServerDriver", ""), "sqlserver");
assert.strictEqual(D.detect("", "jdbc:unknown:x"), "");
// A transaction resolves through its connector.
const connector = { getJdbcDriverClassName: () => "org.postgresql.Driver", getJdbcURL: () => "jdbc:postgresql://h/db" };
assert.strictEqual(D.of({ getParent: () => connector }), "postgresql");
assert.strictEqual(D.of(null), "");

// Date arithmetic: refused on HSQLDB, misread on MariaDB, days on PostgreSQL dates, Oracle and SQL Server.
const sql = "SELECT 1 FROM t WHERE d < CURRENT_DATE - 120";
assert.ok(/HSQLDB refuses/.test(D.dateMath("hsqldb", sql).message));
assert.ok(/CURRENT_DATE - 120 DAY/.test(D.dateMath("hsqldb", sql).fix));
assert.ok(/silently wrong/.test(D.dateMath("mysql", sql).message));
assert.strictEqual(D.dateMath("mysql", sql).fix, "CURRENT_DATE - INTERVAL 120 DAY");
assert.strictEqual(D.dateMath("postgresql", sql), null);
assert.strictEqual(D.dateMath("postgresql", "WHERE t < CURRENT_TIMESTAMP - 2").fix, "CURRENT_TIMESTAMP - INTERVAL '2 days'");
assert.strictEqual(D.dateMath("oracle", "WHERE d < SYSDATE - 7"), null);
assert.strictEqual(D.dateMath("sqlserver", "WHERE d < GETDATE() - 7"), null);
assert.ok(!/HSQLDB refuses/.test(D.dateMath("", sql).message), "an unknown driver names no database");
assert.strictEqual(D.dateMath("hsqldb", "WHERE d < CURRENT_DATE - 120 DAY"), null);

// Concatenation, casts and list tests.
assert.strictEqual(D.concat("mysql", ["'%'", "x"]), "CONCAT('%', x)");
assert.strictEqual(D.concat("sqlserver", ["'%'", "x"]), "'%' + x");
assert.strictEqual(D.concat("hsqldb", ["'%'", "x"]), "'%' || x");
assert.strictEqual(D.inList("mysql", "p.id", "{ids}"), "FIND_IN_SET(CAST(p.id AS CHAR), {ids}) > 0");
assert.strictEqual(D.inList("hsqldb", "p.id", "{ids}"), "POSITION(',' || CAST(p.id AS VARCHAR(40)) || ',' IN ',' || {ids} || ',') > 0");
assert.strictEqual(D.inList("sqlserver", "p.id", "{ids}"), "CHARINDEX(',' + CAST(p.id AS VARCHAR(40)) + ',', ',' + {ids} + ',') > 0");
assert.strictEqual(D.inList("oracle", "p.id", "{ids}"), "INSTR(',' || {ids} || ',', ',' || CAST(p.id AS VARCHAR(40)) || ',') > 0");

// Alias case.
assert.strictEqual(D.aliasFolding("hsqldb"), "upper-cases");
assert.strictEqual(D.aliasFolding("postgresql"), "lower-cases");
assert.strictEqual(D.aliasFolding("mysql"), "");

assert.strictEqual(D.limit("hsqldb", "10", false), "LIMIT 10");
assert.strictEqual(D.limit("oracle", "10", false), "FETCH FIRST 10 ROWS ONLY");
assert.strictEqual(D.limit("sqlserver", "10", true), "OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY");
assert.strictEqual(D.limit("sqlserver", "10", false), null);

assert.ok(/d'ann/.test(D.unbalancedQuote("VALUES ('Réaffecté en début d'année', 'x')")));
assert.strictEqual(D.unbalancedQuote("VALUES ('d''année', 'x') -- it's a comment"), null);
assert.strictEqual(D.unbalancedQuote("SELECT 'a' /* don't */ FROM t"), null);
assert.strictEqual(D.unbalancedQuote("SELECT '{x}' FROM t"), null);

// HSQLDB never cuts a TIMESTAMP to a short VARCHAR (run 9b): the cast is reported, longer casts and other databases are not.
assert.strictEqual(D.shortTextCast("hsqldb", "SELECT CAST(n.date_traitement AS VARCHAR(19)) AS \"d\" FROM n").column, "n.date_traitement");
assert.strictEqual(D.shortTextCast("", "SELECT CAST(created_at AS CHAR(16)) FROM n").size, 16);
// Run 10 F-01: an integer id, or a DATE in 10 characters, is not a timestamp cut short.
assert.strictEqual(D.shortTextCast("hsqldb", "SELECT CAST(id AS VARCHAR(20)) FROM n"), null);
assert.strictEqual(D.shortTextCast("hsqldb", "SELECT CAST(p.date_remise AS VARCHAR(10)) FROM n"), null);
assert.strictEqual(D.shortTextCast("hsqldb", "SELECT CAST(d AS VARCHAR(30)) FROM n"), null);
assert.strictEqual(D.shortTextCast("postgresql", "SELECT CAST(d AS VARCHAR(19)) FROM n"), null);

console.log("sql dialect rules OK");
