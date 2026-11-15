# When to use this

Read when: When to use this. Summary: `convertigo://guides/hsqldb`.
Next: `convertigo://guides/hsqldb/canonical-sql-statements`.

---

# Convertigo Fast Path: Embedded HSQLDB SQL Scaffold

## When to use this
Use this fast path when the brief explicitly selects embedded HSQLDB for a starter-derived demo project and the first milestone is a green contract-backed read path, not full CRUD breadth.

## Fast-path id
- `embedded-hsqldb`

## Scope
Drive the first SQL pass mechanically:
- create or validate one connector
- create `init_schema`
- create `list_contacts` / `count_contacts`
- create `list_companies` / `count_companies`
- prove those transactions directly
- only then hand back to backend for business sequence shaping

Prefer `upsert-crud` when the task matches this exact envelope. Hand-build the connector/tree only when the caller explicitly cannot use the deterministic tool.

## Allowed variables
Only parameterize these placeholders:
- `<PROJECT_NAME>`
- `<CONNECTOR_NAME>`
- `<BUSINESS_SEQUENCE>`
- `<CONTACTS_ENTITY>` (default `contacts`)
- `<COMPANIES_ENTITY>` (default `companies`)

## Primary target
- `<PROJECT_NAME>.<CONNECTOR_NAME>`

## Canonical connector/tree payload skeleton
Use the literal tree pattern below as the starting point for the first `databaseobject-tree-apply`, then adapt only the allowed placeholders and JDBC details already dictated by the project:

```json
{
  "className": "connectors.SqlConnector",
  "name": "<CONNECTOR_NAME>",
  "properties": {
    "jdbcDriverClassName": "org.hsqldb.jdbcDriver",
    "jdbcURL": "jdbc:hsqldb:file:./database/<PROJECT_NAME>;shutdown=true",
    "jdbcUserName": "SA",
    "jdbcUserPassword": ""
  },
  "children": [
    {
      "className": "transactions.SqlTransaction",
      "name": "init_schema"
    },
    {
      "className": "transactions.SqlTransaction",
      "name": "list_contacts"
    },
    {
      "className": "transactions.SqlTransaction",
      "name": "count_contacts"
    },
    {
      "className": "transactions.SqlTransaction",
      "name": "list_companies"
    },
    {
      "className": "transactions.SqlTransaction",
      "name": "count_companies"
    }
  ]
}
```

Leave `systemTablesQuery` (the connection testing query) and `testOnBorrow` at their defaults. HSQLDB refuses a `SELECT` without `FROM`: with `SELECT 1` every connection fails with `unexpected end of statement`, and so does every transaction. When a test query is needed, write `SELECT 1 FROM INFORMATION_SCHEMA.SYSTEM_USERS`.

