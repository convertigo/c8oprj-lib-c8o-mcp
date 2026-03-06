# Convertigo MCP Quickstart

Start every session with `resources/list`, then read:
- `convertigo://capabilities`
- `convertigo://recipes/quickstart`
- `convertigo://resources/convertigo-start`
- `convertigo://resources/convertigo-engineering-workflow`

Then read only the domain guides that match the task:
- multi-track planning or parallel delivery: `convertigo://resources/convertigo-contract-first-delivery`
- sequence or facade work: `convertigo://resources/convertigo-backend-sequences`
- SQL integration: `convertigo://resources/convertigo-integration-sql`
- HTTP integration: `convertigo://resources/convertigo-integration-http`
- NGX UI delivery: `convertigo://resources/convertigo-frontend-ngx`
- final validation or review: `convertigo://resources/convertigo-validation-and-evidence`
- narrow references only when needed: `convertigo://resources/convertigo-context-api`, `convertigo://resources/convertigo-json-quickref`

## Core model
- Convertigo work is tree-based.
- Inspect with `databaseobject-tree-get`.
- Mutate with `databaseobject-tree-apply`.
- Orchestrate multiple operations with `batch-call`.
- Validate runtime behavior with `requestable-execute`.

## Mandatory workflow
1. Read tree and palette first.
2. If the task spans backend, integration, and UI, lock the facade contract and stub path before specialists branch.
3. Build a complete mutation plan.
4. Execute writes via MCP only (no direct YAML edits).
5. Validate quickly (`requestable-execute`, optional `includeLogs`).
6. Save (`project-save`).

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
- If the task spans backend, integration, and UI, read `convertigo://resources/convertigo-contract-first-delivery` before the first write call.
- Use `rag-query` only when the live catalog and tracked guides do not answer the question.
- Keep final output concise and include one MCP critique item if tooling friction appears.
