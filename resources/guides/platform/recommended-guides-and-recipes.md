# Recommended guides and recipes

Read when: Recommended guides and recipes. Summary: `convertigo://guides/platform`.
Previous: `convertigo://guides/platform/mandatory-workflow-2`.

---

## Recommended guides and recipes

### Read next by task shape
| Task shape | Read next | Why |
| --- | --- | --- |
| First serious session on Convertigo | `convertigo/start@1`, then this guide | Start explains MCP flow, this guide explains the platform itself. |
| Business sequence or stub sequence | `convertigo/recipe-business-sequence-stub@1`, then `convertigo/backend-sequences@1` | First get the golden path, then the deeper backend rules. |
| HTTP-backed feature | `convertigo/recipe-http-business-sequence@1`, then `convertigo/integration-http@1` | First get the pattern, then the connector subtleties. |
| SQL-backed feature | `convertigo/recipe-sql-crud@1`, then `convertigo/integration-sql@1` | First get the CRUD/business sequence path, then driver and typing subtleties. |
| NGX data page | `convertigo/recipe-ngx-data-page@1`, then `convertigo/frontend-ngx@1` | First get the page pattern, then deeper UI rules. |
| New project or POC from a starter | `convertigo/recipe-starter-extension@4` | This is the fastest high-signal path for many demos. |

## Recommended MCP tools
- `project-list`
- `marketplace-import`
- `databaseobject-tree-get`
- `databaseobject-tree-apply`
- `palette-list`
- `palette-describe`
- `databaseobject-schema`
- `requestable-execute`
- `project-save`
- `rag-query`

## Anti-patterns / do not do
- Do not treat Convertigo like a blank TypeScript or Java workspace.
- Do not let SQL, HTTP, or FullSync payloads define the public UI contract directly.
- Do not use custom code first when a Convertigo object already exists for the job.
- Do not bind UI to unstable connector internals.
- Do not confuse "project compiles" with "application contract is well designed".
- Do not use RAG as a replacement for the platform mindset; use it to fill documented gaps.

### Common failure modes
- Agents search the tree for too long because they do not know which Convertigo object family should exist.
- Agents recreate structures that marketplace libraries or starter projects already provide.
- Agents wire UI before stabilizing the backend contract.
- Agents validate structure only, not runtime contract behavior.
- Agents write technically valid trees that violate Convertigo's intended object layering.

## Completion checks
- You can explain the role of sequences, transactions, connectors, NGX pages, FullSync, symbols, marketplace libs, and admin settings without mixing them up.
- You can identify which layer should own the public contract for the task.
- You have chosen a recipe before broad exploration when the task matches a known pattern.
- You are using MCP to manipulate Convertigo objects, not to rediscover the platform from first principles.
