# Convertigo MCP Quickstart

Start every session with `resources/list`, then read:
- `convertigo://resources/convertigo-mcp-usage`
- `convertigo://resources/convertigo-sequence-quickstart`
- `convertigo://resources/convertigo-ui-building-quickstart`
- `convertigo://resources/convertigo-context-api`

## Core model
- Convertigo work is tree-based.
- Inspect with `databaseobject-tree-get`.
- Mutate with `databaseobject-tree-apply`.
- Orchestrate multiple operations with `batch-call`.
- Validate runtime behavior with `requestable-execute`.

## Mandatory workflow
1. Read tree and palette first.
2. Build a complete mutation plan.
3. Execute writes via MCP only (no direct YAML edits).
4. Validate quickly (`requestable-execute`, optional `includeLogs`).
5. Save (`project-save`).

## Primary tools
| Tool | Purpose |
|------|---------|
| `project-list` | Discover workspace projects. |
| `databaseobject-tree-get` | Read canonical subtrees (`childrenDepth`, `properties`). |
| `databaseobject-tree-apply` | Create/update canonical trees (`at`, `mode`, `tree`). |
| `batch-call` | Execute multiple MCP calls with resume/error control. |
| `palette-list` / `palette-describe` | Discover and describe valid creatable objects. |
| `requestable-execute` | Execute sequence/transaction and inspect payload/logs. |
| `project-save` / `project-reload` | Persist or discard runtime changes. |
| `log-view` | Query LogManager with structured filters. |

## Practical rules
- QNames are case-sensitive.
- Reuse `tree-get` output structure as input to `tree-apply` whenever possible.
- Prefer `mode=merge`; use `mode=replace` only when subtree pruning is intended.
- For large changes, use `batch-call` with default `optimizeMutations=true`.
- Keep final output concise and include one MCP critique item if tooling friction appears.
