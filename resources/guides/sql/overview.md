# Scope, prerequisites and route selection

Read when: Scope, prerequisites and route selection. Summary: `convertigo://guides/sql`.
Next: `convertigo://guides/sql/sql-connector-rules-that-matter`.

---

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

## Reading data while you build
To read data while you build (check rows, find an id, count, compare), run one SELECT with `sql-select`: a read-only connection to the project's SQL connector, bounded rows (`maxRows`, 50 by default), values written in the SQL, nothing created nor saved in the project. Or call what exists with `requestable-execute`: the list and count transactions of the connector (`<project>.<connector>.list_<entity>`, `count_<entity>`) or the list business sequence (with `authenticatedUser` when it requires a session). Never create and delete probe transactions to read data: each one is a project change, saved and rebuilt (22 of them in one CRM turn). When the app itself needs a value nothing returns, create one read transaction `q_<what>` the app keeps.

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
