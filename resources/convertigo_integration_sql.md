# Convertigo SQL Integration

## When to read this
Read this when a feature needs SQL connectors or SQL transactions behind a Convertigo business sequence, especially when the endpoint must support repeatable CRUD work and fast validation.

## What this guide covers
- SQL connector and transaction behavior behind a stable business sequence.
- JDBC driver variability and what changes across drivers.
- CRUD scaffolding patterns that stay fast and predictable.
- Validation, cleanup, and contract mapping rules.

## Read this after the recipe
If the task is a standard CRUD-style path, read `convertigo/recipe-sql-crud@1` first. Use this handbook when driver subtleties, parameter handling, transaction semantics, or validation rules go beyond the golden path.

## SQL in Convertigo: what stays stable vs what varies

### What should stay stable
Regardless of driver, the AI agent should keep these stable:
- the public business sequence contract
- deterministic validation data
- explicit read-first then write validation order
- no raw row/column leakage into the API

### What varies by driver
Different JDBC drivers vary on:
- JDBC URL format
- shipped vs non-shipped driver jars
- default testing query
- syntax nuances and capabilities
- operational friction around installation or licensing

Examples from product docs:
- PostgreSQL uses `org.postgresql.Driver`
- MySQL commonly uses `com.mysql.jdbc.Driver` or `com.mysql.cj.jdbc.Driver`
- MariaDB can often substitute for MySQL and avoids some licensing friction
- JNDI mode removes direct JDBC driver use and has its own environment setup

Fast-path coverage in the current MCP toolchain:
- `upsert-crud` supports `hsqldb`, `postgresql`, `mariadb`, `mysql`, `sqlserver`, and `oracle`
- literal template guides are currently strongest for `hsqldb`, `postgresql`, and `mariadb`
- `mysql`, `sqlserver`, and `oracle` are supported by the deterministic engine first, then enriched with deeper examples when needed

Why this matters:
- the CRUD pattern may stay the same, but the connector bootstrap details do not

Common trap:
- assuming one JDBC URL or driver family works the same everywhere

## SQL connector rules that matter

### Connector owns connection mechanics
The connector should own:
- JDBC driver class
- JDBC URL
- username/password or JNDI reference
- connection-test behavior

The business sequence should not own these concerns.

### Prefer portable connector guidance
When the project does not explicitly require a vendor-specific behavior:
- use the canonical driver for the chosen DB
- keep the JDBC URL explicit
- document any required project `libs/` jar when the driver is not shipped

### Connection testing is not optional on unfamiliar setups
If the environment is new or driver-specific:
- test the connector early
- confirm the connection test behavior before writing a lot of transaction logic

## SQL transaction patterns

## SQL variable semantics you must not guess

### `{variable}` means safe parameter-style substitution
Use `{variable}` when the variable is a value that belongs in the `WHERE` clause.

What Convertigo guarantees:
- it protects the query against SQL injection by keeping only the first represented value
- it behaves like a value placeholder, not a raw SQL fragment
- it is the default safe path when the query condition is value-based

Why this is the right way:
- the transaction stays readable
- variables stay declarative
- the agent does not have to invent ad hoc escaping rules

Common trap:
- trying to use `{variable}` outside the `WHERE` clause and then “fixing” the query with raw concatenation

### `{{variable}}` means raw SQL text replacement
Use `{{variable}}` only when the query needs a raw SQL fragment, such as:
- a computed `WHERE` clause assembled earlier in the sequence
- a clause or expression that must appear outside the `WHERE` clause
- a controlled vendor-specific fragment that cannot be expressed as a value placeholder

What Convertigo does not guarantee:
- no SQL injection protection
- no value-only constraint
- no safety if the source value contains arbitrary SQL text

Why this is dangerous:
- the query may execute unintended SQL
- user-controlled values become unsafe immediately

Common trap:
- using `{{variable}}` for ordinary user input just because it “works everywhere”

### Variables are auto-declared from SQL placeholders
A `{{variable}}` carries one statement at most: the engine splits the SQL on `;` before it replaces `{{...}}`, so a value holding several statements (a whole seed script) runs as one statement and fails with `unexpected token`. Write a multi-statement script in the transaction's SQL itself, separated by `;`, or use one transaction per statement.

A `{variable}` is a bound JDBC parameter, which a DDL statement does not take: `CREATE`, `ALTER` or `DROP` with `{variable}` fails (HSQLDB: `unexpected token: ?`). Write the value in the SQL, or use `{{variable}}` for a value you control; `sql-transaction-create` warns about it.

When the query contains `{variable}` or `{{variable}}`, Convertigo auto-declares the transaction variable if it does not already exist.

What to expect:
- the first saved transaction can already expose variables derived from the query
- the variable still needs a deliberate runtime value or test value to prove the transaction
- auto-declaration is a convenience, not a substitute for understanding what the variable means

Why this matters:
- the agent can scaffold a transaction quickly from the query text
- later mapping and source picking depend on these variables being understood, not only present

Minimum validation proof:
- the variable appears on the transaction
- one execution with representative input proves the intended substitution path

`sql-transaction-create` applies the rules of this section: from a structured `select` it writes the quoted camelCase aliases, the optional filters, the `contains` and `POSITION` list filters itself, and it refuses SQL text that breaks one of them, with the fix in the message.

### Result keys follow the database's identifier case
`sql_output` rows are keyed by the column labels the driver returns. HSQLDB and Oracle upper-case unquoted identifiers, PostgreSQL lower-cases them (MariaDB/MySQL and SQL Server keep them as written): `SELECT id, order_number AS orderNum` gives `ID` and `ORDERNUM`, so JavaScript reading `row.id` gets `undefined`. Give every selected column a quoted alias in the case your code reads, `SELECT id AS "id", order_number AS "orderNumber"`, and read those exact keys (checked on HSQLDB: the quoted alias `"orderLabel"` keeps its case).

### A `{variable}` never shares a SQL string literal with other text
`{variable}` becomes a bound parameter. `'{name}'` alone is the same parameter (the engine drops the quotes), but with other text in the quotes (`LIKE '{name}%'`) it is not a parameter for the driver while still counted as one, and the call fails with "parameter index out of range". Build the pattern by concatenation: `name LIKE {name} || '%'`, `LOWER(name) LIKE '%' || LOWER({search}) || '%'`. On MariaDB/MySQL `||` is a logical OR: use `CONCAT({name}, '%')`; on SQL Server use `+`. A variable may appear many times in one query (checked with 8 occurrences on HSQLDB).

### Date arithmetic needs a unit on HSQLDB
`CURRENT_DATE - 120` is refused with "incompatible data types in combination": HSQLDB does not subtract a bare number from a date. Give the unit, `CURRENT_DATE - 120 DAY` (also `MONTH`, `YEAR`, and `CURRENT_TIMESTAMP - 2 HOUR`), or use `DATEADD('day', -120, CURRENT_DATE)`. Both forms checked on HSQLDB, in a `SELECT` and in a `VALUES` row. The error names the cause right after "on connection," in `details`, before the statement text.

Other databases, from their documentation (not checked here): MariaDB/MySQL accepts `CURRENT_DATE - 120` but turns the date into a number (`20261017 - 120`), so the result is silently wrong: write `CURRENT_DATE - INTERVAL 120 DAY`. PostgreSQL reads `CURRENT_DATE - 120` as days but refuses a number on a timestamp: write `CURRENT_TIMESTAMP - INTERVAL '2 hours'`. Oracle and SQL Server count a bare number as days. `project-lint`, `databaseobject-tree-apply` and `sql-transaction-create` read the driver of the transaction's connector and apply the rule of that database.

### A list filter (`IN`) takes one comma-separated string
A variable is always bound as one value. A multivalued variable is never expanded into a list: `IN ({ids})` receives the single string `[56, 57]`, which matches nothing, or fails with "invalid character value for cast" on a numeric column. Pass the list as one comma-separated string (`"56,57"`, built in the sequence with `ids.join(",")`) and test membership with `POSITION`, which stays a bound parameter:

```sql
SELECT id AS "id" FROM orders
WHERE ({ids} = '' OR POSITION(',' || CAST(id AS VARCHAR(20)) || ',' IN ',' || {ids} || ',') > 0)
```

Checked on HSQLDB (PostgreSQL has the same `POSITION` and `||`): `"56,57"` returns those two rows, an absent variable returns every row. On MariaDB/MySQL write `FIND_IN_SET(CAST(id AS CHAR), {ids}) > 0`, on SQL Server `CHARINDEX(',' + CAST(id AS VARCHAR(20)) + ',', ',' + {ids} + ',') > 0`, on Oracle `INSTR(',' || {ids} || ',', ',' || id || ',') > 0`; `sql-transaction-create` writes the form of the connector's database. Do not reach for `{{ids}}` (raw text substitution, an injection point) or one transaction per element.

### An absent variable is an empty string, never NULL
A `SqlTransaction` replaces a variable that has no value (not sent, or sent as null) with an empty string before binding it. A `{variable} IS NULL` test is therefore never true, and an optional filter written that way returns no row when the filter is omitted.

Write optional filters against the empty string:

```sql
SELECT ... FROM orders
WHERE ({ownerId} = '' OR owner_id = {ownerId})
  AND ({search} = '' OR LOWER(order_number) LIKE '%' || LOWER({search}) || '%')
```

Checked on HSQLDB, on an INTEGER column and a LIKE: without the variable every row comes back, with it only the matching ones, while the `IS NULL` form returns nothing. Keep the parameter bare: wrapping it in `NULLIF` or `COALESCE` makes HSQLDB refuse the statement at preparation ("data type cast needed for parameter", "incompatible data types in combination"). If a driver still asks for a type, cast the parameter itself, `CAST({x} AS VARCHAR(40))`, in both branches.

### Pattern 1: read-first validation
Always validate the read path first.

Why this is the right way:
- connector correctness and basic transaction semantics become known early
- you avoid debugging write-path side effects before the read path even works

Validation order:
1. connector exists and loads
2. transaction executes
3. result shape is understood
4. business sequence mapping is correct

### Pattern 2: CRUD behind a business sequence
Use SQL transactions as the implementation layer, not the public API.

Good business sequence:

```json
{
  "status": "ok",
  "source": "sql",
  "items": [{ "id": "42", "label": "Alice" }],
  "total": 1,
  "error": ""
}
```

Bad leakage:

```json
{
  "rows": [{ "user_id": "42", "user_name": "Alice" }],
  "rowCount": 1
}
```

The transaction may return raw rows, but the business sequence must not expose them directly unless the contract explicitly chose that shape.

### Pattern 3: deterministic write validation
When validating create/update/delete:
- use deterministic IDs or business keys
- know exactly what row is being created or updated
- clean up after the test if the scenario is not intentionally persistent

Why this is the right way:
- the same scenario can be replayed
- write proof does not pollute shared data unpredictably

Common trap:
- validating writes on shared mutable data with no cleanup path

## Parameter handling

### Parameters must stay explicit
Do not bury dynamic SQL behavior inside brittle string assembly.

Good principle:
- treat input variables as parameters
- keep the transaction query and business sequence contract readable

Common trap:
- direct interpolation of untrusted values into SQL text

### Safe/default rule
Default to `{variable}` whenever the variable is a value in the `WHERE` clause.

Escalate to `{{variable}}` only when:
- the SQL fragment must appear outside `WHERE`
- the fragment is computed intentionally upstream
- the source is controlled and reviewed

If the task says “support search, paging, sort, or a computed clause”:
- keep the public business sequence contract stable
- decide explicitly which parts are values and which parts are raw SQL fragments
- do not improvise the split inside a large query string

## Transaction authoring model

### Where variables live
In Convertigo SQL work, the connector owns the connection and the transaction owns:
- the SQL query
- the transaction variables
- output mode and row/column XML shape
- optional execution details such as max results and auto-commit mode

The business sequence owns:
- API inputs
- nominal/error output
- remapping from transaction shape into public contract fields

### What to expect before first execution
Before the first execution:
- the query may already auto-declare variables from placeholders
- the raw XML shape is still only a hypothesis
- source picker confidence is low until runtime proof exists

After the first successful execution:
- the transaction has a real result shape
- `recordSchema=true` can persist the response schema
- downstream backend and UI mapping becomes much safer

Common trap:
- writing a lot of business sequence mapping before the transaction has ever run once

## Schema learning workflow

### Use runtime first, then persist the schema
When SQL work will feed business sequence mapping, source pickers, or later UI work:
1. execute the transaction with representative variables
2. use `requestable-execute(..., {"recordSchema": true})` on the transaction path
3. read the persisted shape with `databaseobject-schema`
4. only then finalize backend mapping and any picker-dependent work

Why this is the right way:
- schema stops being guesswork
- source picker choices become deliberate
- the UI and backend can align on a real structure

### Schema is not only documentation
Treat schema as:
- the current proof of the transaction shape
- a mapping aid for business sequence design
- a prerequisite for later picker-assisted data binding

Common trap:
- building the business sequence blind, then discovering picker/schema pain later when the raw transaction shape finally differs

Minimum validation proof:
- one transaction execution with `recordSchema=true`
- one `databaseobject-schema` read proving the learned shape exists
- one business sequence validation using the real transaction shape

### Double goal: speed and safety
The agent should be fast, but not by skipping parameter discipline.

Fast path:
- simple deterministic read query
- explicit variables
- explicit business sequence mapping

Not acceptable fast path:
- giant query string assembled ad hoc with unchecked values

## CRUD scaffold pattern

### Read list
1. public business sequence inputs for filter/search/paging if needed
2. SQL transaction for list
3. explicit mapping into `items`
4. explicit `total`

### Read detail
1. one stable identifier input
2. SQL transaction for detail lookup
3. explicit not-found behavior

### Create/update/delete
1. stable input variables
2. deterministic validation payload
3. explicit success/error mapping
4. cleanup or rollback strategy for tests when needed

Why this is the right way:
- it composes into enterprise CRUD without rethinking the basics every time

## Source-picker implications

### SQL schema feeds later source work
Even though SQL transactions produce XML-shaped output under `sql_output`, later sequence steps still depend on:
- the real row/column shape
- the chosen output mode
- stable column names and nesting

If schema is missing:
- source picker choices become fragile
- business sequence mapping tends to hard-code guessed paths
- UI work will inherit uncertainty

### Output mode changes picker ergonomics
`RAW`, `AUTO`, `ELEMENT`, `ELEMENT_WITH_ATTRIBUTES`, and `FLAT_ELEMENT` do not only change documentation. They change:
- how rows are nested
- whether columns appear as attributes or elements
- how easy it is to source text cleanly downstream

Rule of thumb:
- pick the output mode deliberately
- record the schema
- source the exact text nodes or elements the business sequence needs

## Driver-specific subtleties to teach the agent

### MySQL / MariaDB
- URL family is close, but jar availability and licensing can differ
- MariaDB driver is often a practical substitute when MySQL jar distribution is awkward

### PostgreSQL
- canonical driver is straightforward, but the validation pattern should still stay the same
- deterministic insert/read/delete loops are ideal for benchmark-style verification

### SQL Server / Oracle / DB2 / others
- URL syntax and vendor conventions differ more sharply
- do not generalize MySQL assumptions onto them
- check the driver and JDBC URL shape before transaction work

### JNDI
- connection semantics move to environment configuration
- benchmark and local POC work should generally prefer explicit JDBC unless JNDI is a project requirement

## Common SQL mistakes

### Mistake: SQL defines the API
Symptom:
- raw column names become public fields

Fix:
- keep remapping in the business sequence

### Mistake: write validation has no cleanup
Symptom:
- scenario passes once and poisons the next run

Fix:
- use deterministic identifiers and explicit cleanup

### Mistake: connector setup is guessed from another driver
Symptom:
- connection failures or weird URL assumptions

Fix:
- check the actual driver family and URL format first

### Mistake: CRUD is “done” after one query runs
Symptom:
- list works, but detail/write/error behavior is undefined

Fix:
- validate the path the scenario actually promises

## Minimum validation proof
For a credible SQL-backed business sequence:
- read path proof is mandatory
- write path proof is mandatory when the scenario claims CRUD, not just read
- validation data is deterministic
- cleanup is explicit when needed
- public contract stays stable before and after wiring SQL

## Recommended MCP tools
- `databaseobject-tree-get`
- `databaseobject-tree-apply`
- `databaseobject-schema`
- `requestable-execute`
- `log-view`
- `project-save`

## Anti-patterns / do not do
- Do not let raw rows define the public API.
- Do not rely on uncontrolled shared validation data.
- Do not assume all JDBC drivers behave alike.
- Do not skip cleanup for write-path tests.
- Do not postpone read-path validation until after building the whole CRUD stack.

## Completion checks
- Driver and JDBC URL are appropriate for the target DB.
- The read path is proven first.
- CRUD scaffolding is explicit behind the business sequence.
- Validation data and cleanup are deterministic.
- The public response contract does not leak SQL shape.
