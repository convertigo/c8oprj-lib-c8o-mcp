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
3. Create one transaction per operation or per coherent query family.
4. Keep query variables explicit and typed at the SQL level.
5. Execute transactions directly and capture usable schema.
6. Wrap transactions behind facade sequences.
7. Normalize the facade response shape for the rest of the application.
8. Save only after deterministic runtime proof.

### Canonical CRUD split
- `list` sequence or facade
- `getById` sequence or facade
- `create` sequence or facade
- `update` sequence or facade
- `delete` sequence or facade

Not every POC needs all five immediately, but the contract should still anticipate a stable family of operations instead of one overloaded sequence.

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
