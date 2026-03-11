# Convertigo Contract-First Delivery

## When to read this
Read this before planning or implementing any feature that spans backend flow, SQL or HTTP integration, and NGX UI work.

## What this guide covers
- How the planner should split work so agents can move in parallel.
- How to define a facade requestable contract first.
- How to use a stub response to unblock UI and tests.
- How to replace a stub with a real integration without breaking consumers.

## Mandatory workflow

### Facade contract template
Define the facade requestable before the first domain-specific mutation:

```json
{
  "requestable": "codex_test.sample_facade",
  "inputs": {
    "query": "string"
  },
  "nominalResponse": {
    "status": "ok",
    "source": "stub|sql|http",
    "items": [],
    "total": 0,
    "error": ""
  },
  "errorResponse": {
    "status": "error",
    "source": "stub|sql|http",
    "items": [],
    "total": 0,
    "error": "message"
  },
  "sampleResponse": {
    "status": "ok",
    "source": "stub",
    "items": [{"id":"stub-1","label":"example"}],
    "total": 1,
    "error": ""
  }
}
```

### Mandatory planner split
1. Contract:
   - lock facade name
   - lock inputs
   - lock nominal and error payload shape
   - lock one sample response
2. Stub:
   - make the facade executable quickly
   - return the agreed payload shape immediately
3. Parallel work:
   - backend specialist owns the facade sequence and orchestration
   - SQL or HTTP specialist builds the real integration behind the facade
   - UI specialist binds to the agreed payload shape, not to raw connector data
4. Integration replacement:
   - replace stub internals
   - preserve the public contract
5. Final validation:
   - prove the facade still returns the agreed shape
   - prove consumers did not drift

### Stub example
```json
{
  "status": "ok",
  "source": "stub",
  "items": [{"id":"stub-1","label":"preview"}],
  "total": 1,
  "error": ""
}
```

### Contract drift example
```json
{
  "ok": true,
  "data": [{"id":"1","text":"preview"}],
  "count": 1
}
```

This is drift because it changes field names, nesting, and the error convention.

### Handoff rules
- Planner hands off a written contract, not only an idea.
- Backend specialist owns the public facade sequence.
- SQL specialist owns SQL transaction correctness and hands back a shape that the facade maps into the agreed contract.
- HTTP specialist owns connector correctness and hands back a shape that the facade maps into the agreed contract.
- UI specialist starts from the stable facade response or the stub, never from a raw connector payload.
- If the contract must change, the planner reopens the handoff explicitly and all consumers are updated deliberately.

## Recommended MCP tools
- `databaseobject-tree-get`
- `databaseobject-tree-apply`
- `batch-call`
- `databaseobject-schema`
- `requestable-execute`
- `log-view`

## Anti-patterns / do not do
- Do not let the UI bind directly to a raw connector payload when a facade sequence should own the public contract.
- Do not start UI work from an unstable response shape.
- Do not replace the stub with a real integration that silently changes field names, nesting, or error format.
- Do not make the connector transaction itself the only public contract when the feature needs a stable facade.
- Do not let the planner stop at “build the backend first, then the UI later” when parallel work is possible.

## Completion checks
- A public facade requestable exists or is explicitly confirmed.
- A stub or real implementation returns the agreed response shape.
- UI or downstream consumers bind to the facade contract, not to temporary raw payloads.
- The real integration replaces the stub without contract drift.
- If the contract changed, that change is explicit and validated across consumers.
