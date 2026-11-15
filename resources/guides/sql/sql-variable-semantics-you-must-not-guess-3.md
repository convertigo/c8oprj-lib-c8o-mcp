# Dialect functions and SQL variable handling

Read when: Dialect functions and SQL variable handling. Summary: `convertigo://guides/sql`.
Previous: `convertigo://guides/sql/sql-variable-semantics-you-must-not-guess-2`. Next: `convertigo://guides/sql/sql-variable-semantics-you-must-not-guess-4`.

---

It does read `NOW()`, `IFNULL`, `NVL`, `GROUP_CONCAT`, `STRING_AGG`, `DATEADD`, `DATEDIFF`, `DATE_ADD(d, INTERVAL 1 DAY)`, `LIMIT` and `TOP`. All of this was run on HSQLDB 2.7.4, the engine's. `sql-transaction-create`, `databaseobject-tree-apply` and `project-lint` (SQL-FOREIGN-DIALECT) warn on these forms with the form of the connector's database (PostgreSQL, MariaDB/MySQL, Oracle and SQL Server have their own list), and `sql-transaction-create` also on a variable default HSQLDB would bind as NULL. `requestable-execute` adds `error.hints` to these errors, with the values of the call HSQLDB does not read.

### A list filter (`IN`) takes one comma-separated string
A variable is always bound as one value. A multivalued variable is never expanded into a list: `IN ({ids})` receives the single string `[56, 57]`, which matches nothing, or fails with "invalid character value for cast" on a numeric column. Pass the list as one comma-separated string (`"56,57"`, built in the sequence with `ids.join(",")`) and test membership with `POSITION`, which stays a bound parameter:

```sql
SELECT id AS "id" FROM orders
WHERE ({ids} = '' OR POSITION(',' || CAST(id AS VARCHAR(20)) || ',' IN ',' || {ids} || ',') > 0)
```

Checked on HSQLDB (PostgreSQL has the same `POSITION` and `||`): `"56,57"` returns those two rows, an absent variable returns every row. On MariaDB/MySQL write `FIND_IN_SET(CAST(id AS CHAR), {ids}) > 0`, on SQL Server `CHARINDEX(',' + CAST(id AS VARCHAR(20)) + ',', ',' + {ids} + ',') > 0`, on Oracle `INSTR(',' || {ids} || ',', ',' || id || ',') > 0`; `sql-transaction-create` writes the form of the connector's database. Do not reach for `{{ids}}` (raw text substitution, an injection point) or one transaction per element.

### An absent variable is an empty string, never NULL
A `SqlTransaction` replaces a variable that has no value (not sent, or sent as null) with an empty string before binding it. A `{variable} IS NULL` test is therefore never true, and an optional filter written that way returns no row when the filter is omitted.

Write optional filters against the empty string. On HSQLDB, compare a column that is not text (a number, a date, a timestamp, a boolean) with `NULLIF(CAST({x} AS VARCHAR(4000)), '')`; a text column takes `{x}` itself:

```sql
SELECT ... FROM orders
WHERE ({ownerId} = '' OR owner_id = NULLIF(CAST({ownerId} AS VARCHAR(4000)), ''))
  AND ({status} = '' OR status = {status})
  AND ({search} = '' OR LOWER(order_number) LIKE '%' || LOWER({search}) || '%')
```

Checked on HSQLDB 2.7.4, binding each value as the engine does: without the variable every row comes back, with it only the matching ones, while the `IS NULL` form returns nothing. The bare form `owner_id = {ownerId}` returns the same rows, but HSQLDB gives that parameter the type of the column and refuses the empty text there: the engine binds NULL and logs a WARN with a stack trace on every call without the filter ("Error generating value for parameter", caused by "invalid character value for cast" on a number, "invalid datetime format" on a date). Typed as text and emptied to NULL, the value still compares in the type of the column: `>=` orders an INTEGER, a DECIMAL, a DATE or a TIMESTAMP as numbers and dates, not as texts. A value the column cannot take (`'x'` for a number) fails the call with "invalid character value for cast", where the bare form matched nothing. `NULLIF({x}, '')` without the cast is refused at preparation ("data type cast needed for parameter"), and `CAST({x} AS VARCHAR(40))` without `NULLIF` still warns on a date and fails when the column test comes first in the `OR`. Other databases keep `col = {x}` (not checked here). `sql-transaction-create` writes the HSQLDB form for the comparisons of a structured `select` (`where: [{variable, column}]`).

### Pattern 1: read-first validation
Always validate the read path first.

Why this is the right way:
- connector correctness and basic transaction semantics become known early
- you avoid debugging write-path side effects before the read path even works

Validation order:
