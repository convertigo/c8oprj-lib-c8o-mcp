# Convertigo SQL Integration

## When to read this
Read this when a feature needs SQL connectors or SQL transactions behind a Convertigo facade, especially when the endpoint must support repeatable CRUD work and fast validation.

## What this guide covers
- SQL connector and transaction behavior behind a stable facade.
- JDBC driver variability and what changes across drivers.
- CRUD scaffolding patterns that stay fast and predictable.
- Validation, cleanup, and contract mapping rules.

## Read this after the recipe
If the task is a standard CRUD-style path, read `convertigo/recipe-sql-crud@1` first. Use this handbook when driver subtleties, parameter handling, transaction semantics, or validation rules go beyond the golden path.

## SQL in Convertigo: what stays stable vs what varies

### What should stay stable
Regardless of driver, the AI agent should keep these stable:
- the public facade contract
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

The facade should not own these concerns.

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

### Pattern 1: read-first validation
Always validate the read path first.

Why this is the right way:
- connector correctness and basic transaction semantics become known early
- you avoid debugging write-path side effects before the read path even works

Validation order:
1. connector exists and loads
2. transaction executes
3. result shape is understood
4. facade mapping is correct

### Pattern 2: CRUD behind a facade
Use SQL transactions as the implementation layer, not the public API.

Good facade:

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

The transaction may return raw rows, but the facade must not expose them directly unless the contract explicitly chose that shape.

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
- keep the transaction query and facade contract readable

Common trap:
- direct interpolation of untrusted values into SQL text

### Double goal: speed and safety
The agent should be fast, but not by skipping parameter discipline.

Fast path:
- simple deterministic read query
- explicit variables
- explicit facade mapping

Not acceptable fast path:
- giant query string assembled ad hoc with unchecked values

## CRUD scaffold pattern

### Read list
1. public facade inputs for filter/search/paging if needed
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
- keep remapping in the facade

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
For a credible SQL-backed facade:
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
- CRUD scaffolding is explicit behind the facade.
- Validation data and cleanup are deterministic.
- The public response contract does not leak SQL shape.
