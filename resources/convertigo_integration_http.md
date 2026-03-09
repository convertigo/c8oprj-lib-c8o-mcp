# Convertigo HTTP Integration

## When to read this
Read this when a feature needs an HTTP connector or HTTP transaction behind a Convertigo facade.

## What this guide covers
- HTTP connector and transaction setup.
- Early schema recording and payload inspection.
- Transport diagnostics that stay visible during setup.
- Output handoff back to backend sequences.

## Mandatory workflow

### HTTP setup recipe
1. Confirm the public contract first. The HTTP transaction is an implementation detail behind a stable facade sequence.
2. Inspect the current connector or transaction with `databaseobject-tree-get`.
3. Keep connector setup coherent:
   - `HttpConnector.url` is scheme plus host, without a trailing slash
   - `HttpTransaction.subPath` starts with `/`
   - `https` and `port` match the actual endpoint
4. During setup, keep `httpInfo=true` so transport behavior stays visible.
5. Validate the transaction directly with `requestable-execute`.
6. Use `recordSchema=true` when schema capture helps downstream wiring.
7. When benchmark or product flow requires a real Convertigo stub proof, create the stub file explicitly with `requestable-stub-set`, then validate the facade with `requestable-execute` and `__stub=true`.

### Facade mapping recipe
1. Keep the HTTP transaction output behind the facade.
2. Map the raw payload back into the agreed public contract.
3. Preserve the same top-level fields before and after replacing a stub.
4. Revalidate the facade sequence, not only the raw HTTP transaction.

### Fallback and error-shaping example
Good facade-preserving fallback:

```json
{
  "status": "fallback",
  "source": "stub",
  "ip": "",
  "error": "upstream request failed"
}
```

The top-level fields stay stable even when the real HTTP call fails.

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
- Do not let the UI bind directly to a raw upstream HTTP response when a facade sequence should own the contract.
- Do not hide connector or transport failures behind a generic fallback without evidence.
- Do not change the public response shape when swapping a stub for the real HTTP path.
- Do not skip early validation of the transaction itself before wiring it into a larger sequence.

### Frequent failure patterns
- Coherent facade contract but incoherent connector configuration.
- `recordSchema=true` never used even though downstream wiring depends on the response shape.
- Transport failures diagnosed too late because `httpInfo` stayed disabled during setup.
- Stub replacement that changes field names or nesting silently.

## Completion checks
- Connector configuration is coherent and validated.
- The HTTP transaction has been executed directly at least once.
- Schema capture or payload inspection is sufficient for downstream wiring.
- The facade contract remains stable after the real HTTP integration is connected.
