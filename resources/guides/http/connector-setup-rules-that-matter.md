# Connector setup rules that matter

Read when: Connector setup rules that matter. Summary: `convertigo://guides/http`.
Previous: `convertigo://guides/http/overview`. Next: `convertigo://guides/http/business-sequence-mapping-patterns`.

---

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
- failures are diagnosed as transport failures, not guessed from the final business sequence output

Common trap:
- disabling transport visibility too early, then debugging the business sequence blind

## Validation order that keeps you fast

### 1. Validate raw transaction first
Before polishing the business sequence:
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

then capture the transaction schema before building the final business sequence mapping.

Current MCP support already exists for this:
- `requestable-execute(..., {"recordSchema": true})` on the transaction
- `databaseobject-schema` to inspect the learned response shape

Why this is the right way:
- the agent stops guessing nested payload fields
- business sequence mapping becomes an explicit transformation from a known transport shape
- later picker-dependent work starts from a real schema, not a remembered payload snippet

Common trap:
- build the mapping blind, then discover picker/schema pain later when the transport payload changes shape or nesting

### 2. Validate the business sequence second
Only after the raw transaction behaves coherently:
- map into the stable public contract
- validate the business sequence requestable
- prove stub/live parity when the scenario depends on it

### 3. Validate stub/live parity explicitly
If the workflow uses a real Convertigo stub:
- write or inspect the stub file with `requestable-stub-set` / `requestable-stub-get`
- validate with `requestable-execute(..., {"__stub":"true"})`
- validate the live path separately
- keep the same top-level contract in both results

Common trap:
- assuming that “stub file exists” means runtime stub proof is already done
