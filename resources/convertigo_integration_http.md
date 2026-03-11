# Convertigo HTTP Integration

## When to read this
Read this when a feature needs an HTTP connector or HTTP transaction behind a Convertigo facade, especially when the endpoint is not a trivial JSON API.

## What this guide covers
- HTTP payload worlds in Convertigo: XML, JSON, text/binary.
- Connector and transaction setup rules that keep the transport coherent.
- Handler and transport diagnostics that should stay visible while integrating.
- Facade mapping patterns that prevent public contract drift.

## Read this after the recipe
If the task is a standard HTTP-backed facade, read `convertigo/recipe-http-facade@1` first. Use this handbook when endpoint subtleties, payload shape, HTTP transaction type, or transport behavior go beyond the golden path.

## HTTP payload worlds

### XML-oriented endpoints
Use XML HTTP transactions when the upstream service is truly XML-based, such as SOAP or XML REST payloads.

Why this matters:
- the transaction model matches the response world
- source picking and downstream mapping stay predictable

Common trap:
- treating an XML service like a generic text service, then reparsing everything manually later

### JSON-oriented endpoints
Use JSON HTTP transactions when the service is JSON-native and you want Convertigo to help normalize the response into the sequence world.

Why this matters:
- JSON-to-tree conversion is already part of the intended workflow
- facade mapping is easier than manual ad hoc parsing everywhere

Common trap:
- letting the upstream JSON shape leak directly into the public contract

### Text, binary, or file-oriented endpoints
Use the standard HTTP transaction when the endpoint is not fundamentally XML or JSON:
- file download
- raw text
- binary payload
- mixed content where you need transport control first

Why this matters:
- the transaction type matches the transport reality
- facade logic can decide how to expose the result safely

Common trap:
- forcing everything into JSON assumptions even when the endpoint is file- or text-oriented

## Connector setup rules that matter

### Root fields must be coherent
Keep connector configuration internally coherent:
- `server` is host or DNS name
- `https` matches the actual protocol
- `port` matches the real endpoint port
- `baseDir` is the root path, not the whole request path
- transaction `subPath` owns the request-specific suffix

Good pattern:
- connector root = protocol/host/root path
- transaction subPath = resource path

Bad pattern:
- connector and transaction both repeat the same path fragments, making the final URL ambiguous

### `HttpConnector.port` is still a trust-sensitive area
Treat `HttpConnector.port` as a current MCP/tooling friction until explicitly proven clean by behavior:
- benchmark and live usage have already shown that numeric and string forms can be mishandled in some paths
- this sprint must therefore keep a concrete acceptance check:
  - `port: 443`
  - `port: "443"`
  - both must converge to the same final connector state and never materialize `0`

Until that behavior is proven and locked, do not assume the tool layer is fully type-safe for this property.

### Keep `httpInfo=true` while integrating
When the endpoint is not fully trusted yet, enable `httpInfo` so transport evidence stays visible.

Why this is the right way:
- you can see status, headers, and request details early
- failures are diagnosed as transport failures, not guessed from the final facade output

Common trap:
- disabling transport visibility too early, then debugging the facade blind

## Validation order that keeps you fast

### 1. Validate raw transaction first
Before polishing the facade:
- make sure the connector and transaction actually reach the endpoint
- confirm the payload world is the one you think it is

Use:
- `requestable-execute` on the transaction
- `httpInfo=true`
- `recordSchema=true` when schema capture helps downstream mapping

### 1b. Capture schema before blind mapping
If the endpoint shape will feed:
- backend remapping
- source picker choices
- later UI bindings

then capture the transaction schema before building the final facade mapping.

Current MCP support already exists for this:
- `requestable-execute(..., {"recordSchema": true})` on the transaction
- `databaseobject-schema` to inspect the learned response shape

Why this is the right way:
- the agent stops guessing nested payload fields
- facade mapping becomes an explicit transformation from a known transport shape
- later picker-dependent work starts from a real schema, not a remembered payload snippet

Common trap:
- build the mapping blind, then discover picker/schema pain later when the transport payload changes shape or nesting

### 2. Validate the facade second
Only after the raw transaction behaves coherently:
- map into the stable public contract
- validate the facade requestable
- prove stub/live parity when the scenario depends on it

### 3. Validate stub/live parity explicitly
If the workflow uses a real Convertigo stub:
- write or inspect the stub file with `requestable-stub-set` / `requestable-stub-get`
- validate with `requestable-execute(..., {"__stub":"true"})`
- validate the live path separately
- keep the same top-level contract in both results

Common trap:
- assuming that “stub file exists” means runtime stub proof is already done

## Facade mapping patterns

### Pattern: stable top-level fields
Good public facade:

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

### Pattern: schema first, facade second
For non-trivial endpoints, the order should be:
1. raw transaction works
2. schema is captured
3. facade mapping is written against that schema
4. stub/live parity is proved after the facade is trustworthy

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
- which part belongs to the facade mapping

## Common HTTP integration mistakes

### Mistake: connector defines the public API
Symptom:
- the facade mirrors raw upstream fields and nesting

Fix:
- remap the raw response into the agreed contract

### Mistake: path ownership is split badly
Symptom:
- request URLs are duplicated or malformed

Fix:
- connector owns root path, transaction owns request path

### Mistake: transport failure diagnosed too late
Symptom:
- the facade is blamed even though the connector never reached the service

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
- only then finalize the facade mapping

## Minimum validation proof
For a credible HTTP-backed facade, you need:
- one successful raw transaction proof or one clearly diagnosed transport error
- one facade proof
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

## Anti-patterns / do not do
- Do not bind UI or downstream logic directly to raw HTTP payloads.
- Do not skip direct transaction validation.
- Do not build the mapping blind when schema capture is available.
- Do not treat `port` coercion as solved without a behavior check.
- Do not change public field names when replacing a stub with the real path.
- Do not guess transport behavior when builder/log/runtime evidence already exists.

## Completion checks
- Connector configuration is internally coherent.
- Raw transaction behavior is known.
- The facade contract is explicit and stable.
- Stub/live parity is proved when required.
- Transport evidence exists for failures instead of guesswork.
