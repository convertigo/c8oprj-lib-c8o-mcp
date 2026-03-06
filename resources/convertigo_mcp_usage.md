# Convertigo MCP Usage Guide

This guide is intentionally compact. Use this MCP-first workflow and avoid direct YAML edits.

## Canonical flow (short version)
1. Inspect with `project-list` and `databaseobject-tree-get` (copy exact case-sensitive QNames).
2. Discover creatable items with `palette-list`, then detail one item with `palette-describe`.
3. Prepare one full mutation plan before the first write call.
4. Apply writes with `databaseobject-tree-apply` (or `batch-call` for multiple operations).
5. Validate with `databaseobject-tree-get` and `requestable-execute`.
6. Persist with `project-save`.

## Endpoints
- MCP JSON-RPC: `http://localhost:18080/convertigo/api/mcp`
- MCP header: `MCP-Protocol-Version: 2025-06-18`

## Tooling conventions
- Use MCP tools only for model changes. Do not edit `_c8oProject` YAML files directly.
- Prefer tree-native tools:
  - read: `databaseobject-tree-get`
  - write: `databaseobject-tree-apply`
  - orchestration/retry: `batch-call`
- Keep discovery read-only, then execute mutations, then do one final verification.

## Key tool reminders
- `databaseobject-tree-get`
  - `target` is required.
  - `childrenDepth=0` gives target-only inspection.
  - `properties=none|changed|all` controls payload size.
  - Use `_meta.nextCursor` with returned `nextCursor` on large trees.
- `databaseobject-tree-apply`
  - `target` must exist.
  - `at=self|inside|before|after` controls placement.
  - `mode=merge|replace` controls pruning behavior.
  - `tree` accepts canonical nodes (`name`, `className`, `properties`, `children`, optional `id`/`$ref`).
- `batch-call`
  - Use for multiple tool calls in one request.
  - Keep `optimizeMutations=true` (default) to defer refresh/save/build and finalize once.
  - Use `onError=stop|continue`, `executionId`, `resumeFrom` for robust retries.

## Property payload rules
- Use the same structural format as `tree-get` output when possible.
- For NGX SmartType-like properties, keep structured values (`{"mode":"...","value":"..."}`) when returned.
- Do not send engine-specific internals (`beanData`) unless a tool explicitly returned it as required input.

## Validation and diagnostics
- Use `requestable-execute` to validate sequence/transaction behavior quickly.
- Use `requestable-execute {"includeLogs":true}` when execution feedback is needed.
- Use `log-view` for targeted logs (`project`, `requestable`, `level`, `q`, date filters).

## Performance profile
- Build a full plan first.
- Batch independent operations.
- Minimize intermediate reads.
- Prefer one final verification pass and one save.
