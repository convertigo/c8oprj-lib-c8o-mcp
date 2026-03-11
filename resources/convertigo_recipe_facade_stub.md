# Convertigo Recipe: Facade Sequence and Executable Stub

## When to read this
Read this when you need a fast, stable backend contract that can unblock frontend, HTTP, SQL, or review work before the final integration path is ready.

## What this guide covers
- The fastest safe pattern for a facade sequence.
- How to shape nominal and error payloads.
- When to use JSON steps only and when to add a stub file.
- The minimum runtime proof before handing off.

## Mandatory workflow

### Golden path
1. Choose one project and one public requestable name.
2. Lock the contract first:
   - input variables
   - nominal top-level fields
   - error top-level fields
   - one sample payload
3. Create or reuse one facade sequence.
4. Build the nominal contract shape explicitly with JSON steps or equivalent sequence structure.
5. Add the minimal error shape explicitly, not as an unstructured string dump.
6. If another layer needs a real Convertigo stub proof, write a stub file with `requestable-stub-set`.
7. Validate the sequence with `requestable-execute`.
8. Save only after the runtime proof matches the contract.

### Canonical contract template
For list-style data:

```json
{
  "status": "ok",
  "source": "stub",
  "items": [],
  "total": 0,
  "error": ""
}
```

For detail-style data:

```json
{
  "status": "ok",
  "source": "stub",
  "item": {},
  "error": ""
}
```

Keep the top-level field names stable even when the real integration replaces the stub.

### Canonical object pattern
- project root
- public sequence facade
- request variables first
- JSON response shaping inside the sequence
- optional internal helper sequence or connector call later
- optional stub file only when a real requestable stub proof is needed

### Why this is the right way
- Frontend, critics, and specialists can work against one stable contract immediately.
- Replacing the stub later does not require changing page bindings or prompt expectations.
- The sequence remains the owner of the public API instead of leaking connector-specific structure.

## Recommended MCP tools
- `databaseobject-search`
- `databaseobject-tree-get`
- `databaseobject-tree-apply`
- `databaseobject-schema`
- `requestable-execute`
- `requestable-stub-get`
- `requestable-stub-set`
- `project-save`

## Anti-patterns / do not do
- Do not start by creating SQL or HTTP details if the public sequence contract is still unclear.
- Do not expose connector field names as the public contract.
- Do not build only the happy path.
- Do not assume a stub file on disk is enough if runtime proof is required.

### Common failure modes
- Nominal payload exists but error payload is undefined.
- Stub and final implementation do not share the same top-level fields.
- `requestable-stub-set` is used, but the consumer never sends the variables required to materialize the stub at runtime.
- Frontend starts binding to guessed field names before the sequence is validated.

## Minimum validation proof
- `requestable-execute` returns the nominal contract shape.
- If the task requires runtime stub behavior, `requestable-execute(..., {"__stub": true})` or the equivalent required variable returns the stub payload.
- `databaseobject-schema` or focused tree readback confirms the intended contract shape when needed.

## Completion checks
- One stable facade requestable exists.
- Nominal and error shapes are explicit.
- Stub path and final path are intended to preserve the same contract.
- Runtime proof exists before handoff.
