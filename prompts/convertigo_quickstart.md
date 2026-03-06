# Convertigo MCP Quickstart

## When to use this prompt
Use this prompt to bootstrap a session, choose the right guides, and hand off to the specialist prompt that matches the task.

## Read these guides first
- If this is a fresh session, call `prompts/list` and `resources/list`.
- Then read:
- `convertigo://capabilities`
- `convertigo://recipes/quickstart`
- `convertigo://resources/convertigo-start`
- `convertigo://resources/convertigo-engineering-workflow`

Read only the domain guides that match the task:
- multi-track planning or parallel delivery: `convertigo://resources/convertigo-contract-first-delivery`
- sequence or facade work: `convertigo://resources/convertigo-backend-sequences`
- SQL integration: `convertigo://resources/convertigo-integration-sql`
- HTTP integration: `convertigo://resources/convertigo-integration-http`
- NGX UI delivery: `convertigo://resources/convertigo-frontend-ngx`
- final validation or review: `convertigo://resources/convertigo-validation-and-evidence`
- narrow references only when needed: `convertigo://resources/convertigo-context-api`, `convertigo://resources/convertigo-json-quickref`

## Mission
- Bootstrap the session.
- Choose the right specialist prompt when the task is planner, backend, SQL, HTTP, frontend NGX, or critic work.
- Keep the guidance thin: the guides hold the detailed domain rules.

## Mandatory workflow
1. Read the built-ins and the start/workflow guides.
2. Pick the domain guides that match the task.
3. If the task spans backend, integration, and UI, read `convertigo://resources/convertigo-contract-first-delivery` before the first write call.
4. Choose the matching specialist prompt from `prompts/list`.
5. Execute writes via MCP only.

## Specialist prompt routing
| Task shape | Specialist prompt |
|------------|-------------------|
| Contract-first planning or parallel split | `convertigo-planner` |
| Sequence or facade implementation | `convertigo-backend` |
| SQL connector implementation | `convertigo-sql` |
| HTTP connector implementation | `convertigo-http` |
| NGX UI work | `convertigo-frontend-ngx` |
| Review or critique | `convertigo-critic` |

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

## Output format
Return these sections in order:
- `Selected Guides`
- `Next Actions`
- `MCP Critique`
