# Convertigo Recipe: SQL CRUD Behind a Facade

## When to read this
Read this when you need to scaffold SQL-backed create, read, update, or delete behavior quickly while keeping the public application contract stable.

## What this guide covers
- The canonical Convertigo SQL path.
- Driver and typing caveats that matter immediately.
- How to keep SQL details behind facade sequences.
- What a minimal CRUD setup should prove.

## Mandatory workflow

### Golden path
1. Start with the public contract, not with table structure alone.
2. Create or inspect one SQL connector with the correct JDBC driver and URL.
3. Scaffold the standard demo family first:
   - one bootstrap/init transaction for schema plus deterministic seed
   - one `list` transaction
   - one `count` transaction when totals matter
   - optional write transactions only after the read path is proven
4. Keep query variables explicit and typed at the SQL level.
5. Execute transactions directly and capture usable schema.
6. Wrap transactions behind facade sequences.
7. Normalize the facade response shape for the rest of the application.
8. Save only after deterministic runtime proof.

### Fast default for common demos
- HSQLDB embedded:
  - prefer `CREATE TABLE IF NOT EXISTS`
  - then deterministic `DELETE` and `INSERT` seed steps
  - then prove `list` and `count`
  - avoid starting with `MERGE INTO` or other dialect-heavy shortcuts
- MariaDB / MySQL:
  - use the same bootstrap/list/count split
  - keep paging and write paths for after the first green read proof
- PostgreSQL:
  - use the same bootstrap/list/count split
  - add explicit casts only where the driver truly requires them

### Literal fast-path templates
For the first pass, do not improvise the connector family if one of these fast-path resources fits:
- `convertigo://resources/convertigo-fast-path-sql-hsqldb`
- `convertigo://resources/convertigo-fast-path-sql-mariadb`

On common demos, replay the matching template almost literally, changing only project, connector, facade, and database placeholders.

### Demo-first rule
- Do not spend the first pass inventing a generic SQL engine.
- Do not start by solving pagination, search, sort, and writes all at once.
- The first successful milestone is always: connector green, deterministic seed green, `list` green, `count` green.

### Canonical CRUD split
- `list` sequence or facade
- `count` sequence or facade when the contract exposes totals
- `getById` sequence or facade
- `create` sequence or facade
- `update` sequence or facade
- `delete` sequence or facade

Not every POC needs all five immediately, but the contract should still anticipate a stable family of operations instead of one overloaded sequence. For demo speed, `bootstrap/init + list + count` is the expected first slice whenever the task asks for a list page or dashboard.

### Driver and typing caveats
- Convertigo request variables are string-based; the database driver or SQL query is where typing becomes strict.
- PostgreSQL often needs explicit casts such as `::integer`, `::boolean`, or `::timestamp`.
- MySQL and MariaDB are more permissive in many cases, but permissive typing should not become part of the contract.
- Some JDBC drivers are not bundled by default and must be available in project libs or environment setup.

### Schema rules
- Execute the transaction before trusting the shape.
- Use schema generation when source picker or downstream sequence mapping depends on it.
- Treat schema as part of the developer experience, not as optional documentation.

### Facade rules
- The facade sequence owns the public shape.
- SQL rows, column names, and driver quirks should stay behind the facade whenever possible.
- The UI should not need to know whether the source was PostgreSQL, MySQL, or something else.

### Why this is the right way
- It preserves frontend stability.
- It isolates driver differences and SQL casting quirks.
- It keeps CRUD work understandable and benchmarkable.

## Recommended MCP tools
- `databaseobject-tree-get`
- `databaseobject-tree-apply`
- `databaseobject-schema`
- `requestable-execute`
- `log-view`
- `project-save`

## Anti-patterns / do not do
- Do not let raw column names become the de facto public API.
- Do not assume string variables will type-cleanly across drivers.
- Do not build one giant generic SQL sequence when a small CRUD family would be clearer.
- Do not start with `MERGE INTO`, nested paging wrappers, or complex search clauses when `bootstrap/init + list + count` would prove the scenario faster.
- Do not skip deterministic test data and cleanup rules during validation.

### Common failure modes
- PostgreSQL parameters not casted, leading to silent query failure or empty results.
- Transaction works once, but schema is never refreshed.
- Facade leaks raw row nesting or database naming conventions.
- SQL transaction is validated, but the wrapping sequence is not.

## Minimum validation proof
- A direct transaction execute succeeds with deterministic inputs.
- The corresponding facade sequence execute succeeds.
- Response top-level fields are stable and connector-agnostic.
- For write paths, test data policy and cleanup are explicit.

## Completion checks
- SQL driver choice and JDBC URL are correct.
- Variable typing and casts are deliberate.
- Schema exists when downstream binding needs it.
- CRUD behavior is reachable through stable facade sequences.
