# When to use this

Read when: When to use this. Summary: `convertigo://guides/postgresql`.
Next: `convertigo://guides/postgresql/mandatory-proof-sequence`.

---

# Convertigo Fast Path: PostgreSQL SQL Scaffold

## When to use this
Use this fast path when the brief selects PostgreSQL and the first milestone is a deterministic read path behind a stable business sequence contract.

## Fast-path id
- `postgresql-service`

## Scope
Drive the first SQL pass mechanically:
- create or validate one PostgreSQL connector
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
- `<DB_HOST>`
- `<DB_PORT>`
- `<DB_NAME>`
- `<DB_USER>`
- `<DB_PASSWORD>`

## Primary target
- `<PROJECT_NAME>.<CONNECTOR_NAME>`

## Canonical connector/tree payload skeleton
Use the literal tree pattern below as the first `databaseobject-tree-apply`, then adapt only the allowed placeholders and connection values already fixed by the environment.

```json
{
  "className": "connectors.SqlConnector",
  "name": "<CONNECTOR_NAME>",
  "properties": {
    "jdbcDriverClassName": "org.postgresql.Driver",
    "jdbcURL": "jdbc:postgresql://<DB_HOST>:<DB_PORT>/<DB_NAME>",
    "jdbcUserName": "<DB_USER>",
    "jdbcUserPassword": "<DB_PASSWORD>"
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

## Canonical SQL statements
Keep the first pass restricted to schema plus read proof. Copy these statements first, then adapt only if the target project already proves a safer existing variant.

### `init_schema`
```sql
CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(128) NOT NULL,
  company_name VARCHAR(128),
  email VARCHAR(160),
  status VARCHAR(32)
);

CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  company_name VARCHAR(128) NOT NULL,
  industry VARCHAR(64),
  city VARCHAR(96),
  status VARCHAR(32)
);

DELETE FROM contacts;
DELETE FROM companies;

INSERT INTO contacts (full_name, company_name, email, status) VALUES
  ('Ada Lovelace', 'Analytical Engines', 'ada@example.test', 'lead'),
  ('Grace Hopper', 'Compilers Inc', 'grace@example.test', 'customer');

INSERT INTO companies (company_name, industry, city, status) VALUES
  ('Analytical Engines', 'R&D', 'London', 'active'),
  ('Compilers Inc', 'Software', 'New York', 'active');
```

### `list_contacts`
```sql
SELECT id, full_name, company_name, email, status
FROM contacts
ORDER BY id ASC
```

### `count_contacts`
```sql
SELECT COUNT(*) AS total
FROM contacts
```

### `list_companies`
```sql
SELECT id, company_name, industry, city, status
FROM companies
ORDER BY id ASC
```

### `count_companies`
```sql
SELECT COUNT(*) AS total
FROM companies
```

