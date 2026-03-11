# Convertigo Recipe: NGX Data Page With Stable Contract States

## When to read this
Read this when building a page that loads backend data and must behave correctly on initial load, empty data, errors, and retry.

## What this guide covers
- The fastest safe NGX page pattern for data-backed UI.
- How to wire load, empty, error, and retry states.
- How to bind to stable facade fields.
- How to validate both structure and runtime behavior.

## Mandatory workflow

### Golden path
1. Confirm the backend facade contract first.
2. Inspect the target page subtree.
3. Use the palette or canonical tree shapes to create:
   - page load event
   - state flags
   - success container
   - empty state
   - error state
   - retry action
4. Use `CallSequenceAction` or the equivalent built-in action for backend calls.
5. Bind only to stable facade fields.
6. Save after structural and runtime checks.

### Canonical state model
For a typical page-local state, keep explicit flags:
- loading
- empty
- error
- last payload or resolved contract fields

The exact object tree may vary, but the semantics must be explicit.

### Binding rules
- Bind to facade contract fields such as `status`, `items`, `total`, `item`, `error`, or similarly deliberate names.
- Do not bind directly to raw HTTP or SQL shapes.
- If the requestable is stub-only, pass the runtime variable required to materialize the stub. For `probe_contract_stub`, that means `__stub=true`.

### Event rules
- Put load behavior in the correct page event or explicit load chain.
- Put retry on a real button event backed by a real action chain.
- Avoid custom action calls for backend access when a built-in call sequence action exists.

### Why this is the right way
- The UI becomes stable before the real integration is fully complete.
- Retry, empty, and error behavior are first-class, not late add-ons.
- Build/runtime validation becomes much easier because the page state is explicit.

## Recommended MCP tools
- `databaseobject-tree-get`
- `databaseobject-tree-apply`
- `batch-call`
- `palette-list`
- `palette-describe`
- `requestable-execute`
- `mobile-builder-open`
- `log-view`
- `project-save`

## Anti-patterns / do not do
- Do not bind the page to raw connector output.
- Do not use custom code when palette-backed actions can express the same flow.
- Do not ship only the success path.
- Do not assume a stub file on disk means the page will see the stub payload automatically.

### Common failure modes
- Page loads before the contract is stable.
- Retry button exists structurally but has no real action chain.
- Stub-only requestable is called without `__stub=true`, then the page looks empty.
- Browser smoke fails, but build logs are never inspected.

## Minimum validation proof
- `requestable-execute` proves the facade contract.
- Tree readback proves loading, empty, error, and retry nodes/actions exist.
- `mobile-builder-open` proves build readiness or exposes the build error.
- Browser smoke proves the happy path when the builder is healthy.

## Completion checks
- The target page binds to a stable facade contract.
- Loading, empty, and error states are explicit.
- Retry is a real action, not a visual placeholder.
- Runtime validation covers the same contract the UI binds to.
