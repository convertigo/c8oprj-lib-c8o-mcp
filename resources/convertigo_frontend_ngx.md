# Convertigo Frontend NGX

## When to read this
Read this when implementing or changing NGX pages, bindings, routing, actions, or app-level UI structure.

## What this guide covers
- Palette-first NGX authoring through MCP.
- Contract-based UI delivery using facade responses or agreed stubs.
- Loading, empty, and error states with retry.
- Efficient write planning for UI trees.

## Mandatory workflow

### Contract-bound UI recipe
1. Confirm the backend contract first. If the real integration is not ready yet, use the agreed stub payload from the facade sequence.
2. Inspect the target NGX subtree before any write.
3. Discover valid creation entries with `palette-list`, then confirm details with `palette-describe`.
4. Build the full UI mutation plan before the first write call.
5. Bind UI state to the agreed contract fields, not to temporary raw connector payloads.
6. Include loading, empty, and error states, plus a real retry path for data-loading failures.
7. If the UI proves a stub-only facade at runtime, pass `__stub=true` through the `CallSequenceAction` variables. A stub file on disk is not enough by itself.
8. Batch independent UI mutations with `batch-call` when it improves speed and readability.
9. After `mobile-builder-open`, inspect the returned builder logs. If the viewer URL is unreachable, use `log-view` to decide whether the build failed or the viewer is merely unavailable.

### Starting from stub data
It is valid to start UI work from a stub when:
- the facade contract is already locked
- the stub returns the same fields the real implementation will keep
- the UI binds to contract fields, not to source-specific fields

This is not valid when the UI is forced to guess temporary names, nesting, or fallback behavior.

### Common UI drift
- Binding directly to raw connector payloads instead of facade fields.
- Missing retry behavior for data-loading failures, or shipping only a retry marker with no action path.
- Field names that change when the real integration replaces the stub.
- Shipping only the happy path without loading, empty, or error handling.
- Using a stub-only requestable in the browser without passing `__stub=true`, then concluding that the facade is empty or unstable.

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
- Do not guess NGX tags or dynamic component names without checking the live palette.
- Do not wait for the final real connector before starting the UI when an agreed stub contract already exists.
- Do not bind the page directly to unstable raw connector responses.
- Do not ship a page without loading, empty, and error behavior when the page depends on backend data.

### Completion-oriented UI checks
- Contract fields used by bindings are stable and named deliberately.
- Loading state exists while data is pending.
- Empty state exists when the response is valid but has no data.
- Error state exists when the request fails.
- Retry action exists for data-loading failure.

## Completion checks
- The NGX tree changed only through valid palette-backed or canonical tree mutations.
- Bindings target stable contract fields.
- Loading, empty, and error states exist where backend data is required.
- Retry behavior exists for data-loading failures and is not only a structural marker.
- Stub-backed runtime checks pass the variables required by the underlying requestable contract, including `__stub=true` when the facade is stub-only.
- Build logs were checked when browser smoke or viewer reachability failed.
- Structural writes were saved after validation.
