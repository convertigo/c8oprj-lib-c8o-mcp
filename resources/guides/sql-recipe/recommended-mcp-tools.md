# Recommended MCP tools

Read when: Recommended MCP tools. Summary: `convertigo://guides/sql-recipe`.
Previous: `convertigo://guides/sql-recipe/mandatory-workflow`.

---

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
- Business sequence leaks raw row nesting or database naming conventions.
- SQL transaction is validated, but the wrapping sequence is not.

## Minimum validation proof
- A direct transaction execute succeeds with deterministic inputs.
- The corresponding business sequence execute succeeds.
- Response top-level fields are stable and connector-agnostic.
- For write paths, test data policy and cleanup are explicit.

## Completion checks
- SQL driver choice and JDBC URL are correct.
- Variable typing and casts are deliberate.
- Schema exists when downstream binding needs it.
- CRUD behavior is reachable through stable business sequences.
