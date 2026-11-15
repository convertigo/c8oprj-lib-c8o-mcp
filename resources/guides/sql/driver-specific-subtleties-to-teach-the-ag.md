# Driver-specific subtleties to teach the agent

Read when: Driver-specific subtleties to teach the agent. Summary: `convertigo://guides/sql`.
Previous: `convertigo://guides/sql/schema-learning-workflow`.

---

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
