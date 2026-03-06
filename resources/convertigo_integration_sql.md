# Convertigo SQL Integration

## When to read this
Read this when a feature needs SQL connectors or SQL transactions behind a Convertigo facade.

## What this guide covers
- SQL transaction work behind a stable facade contract.
- Safe parameter handling.
- Validation data lifecycle.
- Output handoff back to backend sequences.

## Mandatory workflow

### Safe SQL validation workflow
1. Confirm the public contract first. The SQL transaction is an implementation detail behind a stable sequence or requestable contract.
2. Inspect the existing connector and transaction subtree before changing it.
3. Validate the read path first with `requestable-execute`.
4. Validate the write path only when needed and only with deterministic test data.
5. Clean up validation data after write-path checks.
6. Revalidate the facade sequence after wiring the real SQL path.

### Contract mapping rule
The SQL transaction may return raw row or column names that do not match the facade contract. Map them in the facade sequence instead of exposing them directly.

Good mapping:

```json
{
  "status": "ok",
  "source": "sql",
  "items": [{"id":"42","label":"Alice"}],
  "total": 1,
  "error": ""
}
```

Bad public contract leakage:

```json
{
  "rows": [{"user_id":"42","user_name":"Alice"}],
  "rowCount": 1
}
```

### Validation data rules
- Use deterministic IDs or values so cleanup is predictable.
- Keep inserted or updated identifiers visible in the validation proof.
- Do not validate write paths against uncontrolled shared data when cleanup would be ambiguous.

## Recommended MCP tools
- `databaseobject-tree-get`
- `databaseobject-tree-apply`
- `databaseobject-schema`
- `requestable-execute`
- `log-view`
- `project-save`

## Anti-patterns / do not do
- Do not interpolate untrusted values into SQL text.
- Do not let the UI depend directly on a raw SQL transaction shape.
- Do not validate write paths against uncontrolled data without cleanup.
- Do not change the agreed response contract as a side effect of wiring the real SQL path.

### Frequent failure patterns
- Unsafe SQL text assembly instead of parameter handling.
- Validation data with no deterministic cleanup path.
- Facade sequence returning raw column names directly.
- Treating the SQL transaction as the public API instead of the backend implementation.

## Completion checks
- SQL input handling is parameterized and predictable.
- Validation proves the read path works on representative data.
- Write-path checks, when used, have deterministic cleanup.
- The facade contract still matches the agreed shape after SQL integration.
