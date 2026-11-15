# Bound parameters and SQL validation failures

Read when: Bound parameters and SQL validation failures. Summary: `convertigo://guides/sql`.
Previous: `convertigo://guides/sql/sql-variable-semantics-you-must-not-guess`. Next: `convertigo://guides/sql/sql-variable-semantics-you-must-not-guess-3`.

---

### A `{variable}` never shares a SQL string literal with other text
`{variable}` becomes a bound parameter. `'{name}'` alone is the same parameter (the engine drops the quotes), but with other text in the quotes (`LIKE '{name}%'`) it is not a parameter for the driver while still counted as one, and the call fails with "parameter index out of range". Build the pattern by concatenation: `name LIKE {name} || '%'`, `LOWER(name) LIKE '%' || LOWER({search}) || '%'`. On MariaDB/MySQL `||` is a logical OR: use `CONCAT({name}, '%')`; on SQL Server use `+`. A variable may appear many times in one query (checked with 8 occurrences on HSQLDB).

### Date arithmetic needs a unit on HSQLDB
`CURRENT_DATE - 120` is refused with "incompatible data types in combination": HSQLDB does not subtract a bare number from a date. Give the unit, `CURRENT_DATE - 120 DAY` (also `MONTH`, `YEAR`, and `CURRENT_TIMESTAMP - 2 HOUR`), or use `DATEADD('day', -120, CURRENT_DATE)`. Both forms checked on HSQLDB, in a `SELECT` and in a `VALUES` row. The error names the cause right after "on connection," in `details`, before the statement text.

Other databases, from their documentation (not checked here): MariaDB/MySQL accepts `CURRENT_DATE - 120` but turns the date into a number (`20261017 - 120`), so the result is silently wrong: write `CURRENT_DATE - INTERVAL 120 DAY`. PostgreSQL reads `CURRENT_DATE - 120` as days but refuses a number on a timestamp: write `CURRENT_TIMESTAMP - INTERVAL '2 hours'`. Oracle and SQL Server count a bare number as days. `project-lint`, `databaseobject-tree-apply` and `sql-transaction-create` read the driver of the transaction's connector and apply the rule of that database.

### Dates, intervals and functions written for another database
HSQLDB, the default database, reads a DATE as `'YYYY-MM-DD'` and a TIMESTAMP as `'YYYY-MM-DD HH:MM:SS'` (fractional seconds and an offset like `+01:00` allowed, or the date alone). A literal with a `T` between date and time (what a `datetime-local` field sends: `'2026-10-28T20:30'`), a time without seconds or `'28/10/2026'` is refused with "data exception: invalid datetime format". A `{variable}` holding such a text, or an empty one, is worse: the engine binds it as NULL without any error, so the row is written without its date and a filter matches nothing (checked live). Convert the text in the SQL: `TO_TIMESTAMP({debut}, 'YYYY-MM-DD"T"HH24:MI')`, `TO_DATE({jour}, 'DD/MM/YYYY')`. These refuse an empty text, so an optional value is `CASE WHEN {debut} = '' THEN NULL ELSE TO_TIMESTAMP({debut}, 'YYYY-MM-DD"T"HH24:MI') END`.

An interval is `INTERVAL '30' MINUTE` (the number alone in quotes, the unit after) or `30 MINUTE` right after a date, and a count from a variable `debut + {duree} MINUTE`. `INTERVAL '30 minutes'` (PostgreSQL) fails with "data exception: invalid interval format", `INTERVAL {duree} MINUTE` with "unexpected token: ?", and there is no `WEEK` (`14 DAY`).

HSQLDB lacks these functions and clauses of other databases ("user lacks privilege or object not found: FORMATDATETIME", "unexpected token: RETURNING"):

| Written for another database | HSQLDB form |
| --- | --- |
| `FORMATDATETIME(d, 'dd/MM/yyyy')` (H2), `DATE_FORMAT(d, '%d/%m/%Y')` | `TO_CHAR(d, 'DD/MM/YYYY')` (`HH24:MI:SS` for the time) |
| `PARSEDATETIME`, `STR_TO_DATE` | `TO_DATE(text, 'DD/MM/YYYY')`, `TO_TIMESTAMP(text, 'DD/MM/YYYY HH24:MI')` |
| `INSERT ... RETURNING id`, `LAST_INSERT_ID()`, `SCOPE_IDENTITY()` | `INSERT ...; SELECT IDENTITY() AS "id" FROM (VALUES(0))` in the same transaction |
| `ON CONFLICT`, `ON DUPLICATE KEY UPDATE`, `INSERT IGNORE` | `MERGE INTO t USING (VALUES({id}, {name})) AS v(id, name) ON t.id = v.id WHEN MATCHED THEN UPDATE SET ... WHEN NOT MATCHED THEN INSERT ...` |
| `DATE_TRUNC('month', d)`, `TRUNC(d, 'YEAR')` | `TRUNC(d, 'MM')`, `TRUNC(d, 'YYYY')` (`'DD'`, `'HH'`, `'IW'`) |
| `GETDATE()`, `LEN(s)`, `NEWID()`, `RANDOM()`, `x::text`, `IIF`, `IF()` | `CURRENT_TIMESTAMP`, `LENGTH(s)`, `UUID()`, `RAND()`, `CAST(x AS VARCHAR(4000))`, `CASE WHEN` |

