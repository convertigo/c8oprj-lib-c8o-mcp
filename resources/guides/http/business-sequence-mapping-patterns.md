# Business sequence mapping patterns

Read when: Business sequence mapping patterns. Summary: `convertigo://guides/http`.
Previous: `convertigo://guides/http/connector-setup-rules-that-matter`. Next: `convertigo://guides/http/anti-patterns-do-not-do`.

---

## Business sequence mapping patterns

### Pattern: stable top-level fields
Good public business sequence:

```json
{
  "status": "ok",
  "source": "http",
  "items": [{ "id": "1", "label": "Alice" }],
  "total": 1,
  "error": ""
}
```

Why this is the right way:
- the UI and planner can rely on one stable contract
- changing the upstream provider later does not break consumers

### Pattern: schema first, business sequence second
For non-trivial endpoints, the order should be:
1. raw transaction works
2. schema is captured
3. business sequence mapping is written against that schema
4. stub/live parity is proved after the business sequence is trustworthy

Do not invert that order unless the endpoint shape is already fully known and intentionally tiny.

### Pattern: preserve the contract during fallback
Good fallback:

```json
{
  "status": "fallback",
  "source": "stub",
  "items": [],
  "total": 0,
  "error": "upstream request failed"
}
```

Bad fallback:

```json
{
  "rawError": "...",
  "headers": { "...": "..." },
  "payload": {}
}
```

The fallback may mention transport failure, but it must still keep the same public structure.

## Handlers and transport subtleties
HTTP integration is not only “URL + method”.

Watch for:
- content type and payload construction
- request parameter encoding
- header forwarding or custom header injection
- authentication mode
- timeouts and transport errors

Do not override or customize these blindly. First confirm:
- what the endpoint expects
- which part belongs to the connector
- which part belongs to the transaction
- which part belongs to the business sequence mapping

## Common HTTP integration mistakes

### Mistake: connector defines the public API
Symptom:
- the business sequence mirrors raw upstream fields and nesting

Fix:
- remap the raw response into the agreed contract

### Mistake: path ownership is split badly
Symptom:
- request URLs are duplicated or malformed

Fix:
- connector owns root path, transaction owns request path

### Mistake: transport failure diagnosed too late
Symptom:
- the business sequence is blamed even though the connector never reached the service

Fix:
- validate the raw transaction first and keep `httpInfo=true` during setup

### Mistake: stub/live parity is assumed, not proven
Symptom:
- stub payload and live payload differ at the top level

Fix:
- run stub and live proof separately and compare contract fields

### Mistake: mapping is authored before schema is known
Symptom:
- repeated retries on wrong payload paths
- source definitions drift after the first real transaction run

Fix:
- capture schema on the raw transaction first
- inspect it with `databaseobject-schema`
- only then finalize the business sequence mapping

## Minimum validation proof
For a credible HTTP-backed business sequence, you need:
- one successful raw transaction proof or one clearly diagnosed transport error
- one business sequence proof
- one stub proof when the task depends on a stub
- stable top-level fields before and after the live path is wired

## Recommended MCP tools
- `databaseobject-tree-get`
- `databaseobject-tree-apply`
- `databaseobject-schema`
- `requestable-execute`
- `requestable-stub-get`
- `requestable-stub-set`
- `log-view`
- `project-save`
