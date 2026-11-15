# Mandatory workflow

Read when: Mandatory workflow. Summary: `convertigo://guides/contract`.
Previous: `convertigo://guides/contract/overview`. Next: `convertigo://guides/contract/anti-patterns-do-not-do`.

---

## Mandatory workflow

### Business sequence contract template
Define the business sequence requestable before the first domain-specific mutation:

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
   - lock business sequence name
   - lock inputs
   - lock nominal and error payload shape
   - lock one sample response
2. Stub:
   - make the business sequence executable quickly
   - return the agreed payload shape immediately
3. Parallel work:
   - backend specialist owns the business sequence and orchestration
   - SQL or HTTP specialist builds the real integration behind the business sequence
   - UI specialist binds to the agreed payload shape, not to raw connector data
   - UI specialist replaces the dominant starter/default page content early with a visible shell driven by the stub or stable contract shape, so Studio shows feature progress before final backend proof
   - this visible shell may be a `phase 1` shell with loading/empty/retry states and contract-shaped placeholders before live data is ready
   - once backend proof exists, the UI specialist performs `phase 2` to swap placeholder copy for live bindings and browser proof
   - for starter-derived apps, “visible shell” means the actual visible entry page changed, not just a hidden or secondary page
   - if a specialist returns without usable mutation or proof evidence, the planner retries that specialist at most once with a tighter bounded task, then checkpoints or fails explicitly
4. Integration replacement:
   - replace stub internals
   - preserve the public contract
5. Final validation:
   - prove the business sequence still returns the agreed shape
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
- Backend specialist owns the public business sequence.
- SQL specialist owns SQL transaction correctness and hands back a shape that the business sequence maps into the agreed contract.
- HTTP specialist owns connector correctness and hands back a shape that the business sequence maps into the agreed contract.
- UI specialist starts from the stable business sequence response or the stub, never from a raw connector payload.
- If the contract must change, the planner reopens the handoff explicitly and all consumers are updated deliberately.

## Recommended MCP tools
- `databaseobject-tree-get`
- `databaseobject-tree-apply`
- `batch-call`
- `databaseobject-schema`
- `requestable-execute`
- `log-view`

