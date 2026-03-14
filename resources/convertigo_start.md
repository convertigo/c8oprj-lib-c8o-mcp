# Convertigo Start Guide

## When to read this
Read this first for any MCP session that touches a Convertigo project.

## What this guide covers
- The source-of-truth order for Convertigo MCP work.
- The tree-first authoring model.
- The minimum safe workflow for inspect, mutate, validate, and save.
- How to choose the next platform guide, recipe, and handbook instead of reading everything.

## Read order
1. Read `convertigo://capabilities`.
2. Read `convertigo://recipes/quickstart`.
3. Read `convertigo://resources/convertigo-start`.
4. Read `convertigo://resources/convertigo-platform-big-picture`.
5. Read one matching recipe before the deeper handbook.
6. Read the handbook only when the recipe no longer answers the task.

### Guide selection matrix

| Task shape | Read next | Why |
| --- | --- | --- |
| Understand the platform before touching anything | `convertigo/platform-big-picture@1` | Explains what Convertigo is, why facades exist, and how the platform parts fit together. |
| Single sequence or facade change | `convertigo/recipe-facade-stub@1`, then `convertigo/backend-sequences@1` | Start with the golden path, then go deeper on response shape, JSON steps, SmartTypes, and validation rules. |
| SQL-backed feature | `convertigo/recipe-sql-crud@1`, then `convertigo/integration-sql@1` | Start with the CRUD scaffold recipe, then go deeper on driver and transaction subtleties. |
| Standard SQL CRUD + starter NGX UI | `convertigo/crud-fastpath@1` | Preferred mono-agent public path for the current recovery cycle. |
| HTTP-backed feature | `convertigo/recipe-http-facade@1`, then `convertigo/integration-http@1` | Start with the connector and facade recipe, then go deeper on payload, schema, and handler details. |
| NGX UI task | `convertigo/recipe-ngx-data-page@1`, then `convertigo/frontend-ngx@1` | Start with the canonical data-page pattern, then go deeper on palette, actions, and bindings. |
| New app or starter-based POC | `convertigo/recipe-starter-extension@1` | Gives the fast path for importing a starter and extending it instead of rediscovering project structure. |
| Multi-track delivery across backend, integration, and UI | `convertigo/engineering-workflow@1`, then `convertigo/contract-first-delivery@1`, then the matching recipe | Planner rules, stub strategy, parallel handoff, and the first implementation pattern live there. |
| Final closure, proof, or review | `convertigo/validation-and-evidence@1` | Save/reload discipline and final proof expectations live there. |
| Rhino `context` or JSON step details | `convertigo/context-api@1` or `convertigo/json-quickref@1` | These are references, not primary onboarding guides. |

## Mandatory workflow

### Minimal MCP session recipe
1. Call `resources/list`.
2. If live prompt discovery exists in the caller surface, call `prompts/list` before selecting a role prompt.
3. If the task matches a known fast path, call `resources/templates/list` and read only the matching template through `resources/read`.
4. Read the built-in resources first:
   - `convertigo://capabilities`
   - `convertigo://recipes/quickstart`
5. Read `convertigo://resources/convertigo-platform-big-picture` before the first serious mutation when the session is new to Convertigo.
6. Inspect the target workspace or subtree before any write call:
   - `project-list`
   - `databaseobject-tree-get`
   - `databaseobject-search` when discovery is uncertain
7. If you need to create an object, confirm the allowed entry with:
   - `palette-list`
   - `palette-describe`
8. Pick one matching recipe before the first broad mutation.
9. Do not call `rag-query` before the start guide and the chosen recipe were read.
10. If the task is standard SQL CRUD + starter NGX UI, prefer `convertigo://resources/convertigo-crud-fastpath` and `convertigo-crud-fastpath` over planner/specialist routing.
11. Build the mutation plan before the first write call.
12. Apply changes with `databaseobject-tree-apply` or `batch-call`.
13. For a new CRUD UI project, make the app visible early: `upsert-crud` -> backend proof -> `upsert-ngx-crud-kit stage=bootstrap` -> `mobile-builder-open` -> `upsert-ngx-crud-kit stage=final` -> final proof with `viewerUrl`.
14. Validate behavior with `requestable-execute` or `crud-proof`. Use `log-view` only when execution feedback is not enough.
15. Save with `project-save`.
16. Read a specialized handbook only when the recipe leaves open questions.

### Minimal call skeletons

```json
{"name":"project-list","arguments":{"limit":10}}
```

```json
{"name":"databaseobject-tree-get","arguments":{"target":"<qname>","childrenDepth":1,"properties":"none"}}
```

```json
{"name":"palette-list","arguments":{"target":"<parent qname>"}}
```

```json
{"name":"databaseobject-tree-apply","arguments":{"target":"<qname>","at":"self","mode":"merge","tree":{"properties":{}}}}
```

```json
{"name":"requestable-execute","arguments":{"requestable":"<project>[.<connector>].<requestable>","variables":{}}}
```

### Before first write checklist
Lock these decisions before the first mutation:
- which recipe matches the task and why
- exact target QName and case
- patch existing node or create new node
- correct parent placement: `self`, `inside`, `before`, or `after`
- correct palette entry or canonical `className`
- expected response contract when the task changes runtime behavior
- validation call to run immediately after the mutation
- whether the task requires only `project-save` or also `project-reload`
- whether the task truly needs rollback/reload proof; `project-reload` is not a freshness step for `requestable-execute`

### Guide escalation example
Correct escalation for a multi-track feature:
1. Start here and inspect the project.
2. Read `convertigo/platform-big-picture@1`.
3. Read `convertigo/engineering-workflow@1`.
4. Read `convertigo/contract-first-delivery@1` before any write call.
5. Read `convertigo/recipe-facade-stub@1` to define the facade sequence and stub.
6. Read `convertigo/recipe-http-facade@1` or `convertigo/recipe-sql-crud@1` for the real data source.
7. Read `convertigo/recipe-ngx-data-page@1` only when the contract is stable enough to bind UI work.
8. Read the matching deep handbook only if the recipe is not enough.
9. Close with `convertigo/validation-and-evidence@1`.

## Recommended MCP tools
- `project-list`
- `databaseobject-tree-get`
- `databaseobject-search`
- `palette-list`
- `palette-describe`
- `databaseobject-tree-apply`
- `batch-call`
- `requestable-execute`
- `crud-proof`
- `project-save`
- `resources/templates/list`

## Anti-patterns / do not do
- Do not edit `_c8oProject` YAML as the normal authoring path.
- Do not use the removed CRUD-era flow (`children`, `create`, `properties-get/set`).
- Do not guess QNames, class names, or NGX palette entries.
- Do not start with RAG when tool metadata and tracked guides already answer the question.
- Do not validate only the tree shape when runtime behavior matters.
- Do not read every handbook by default. Read the smallest recipe and handbook set that matches the task.

## Completion checks
- You used MCP discovery before mutation.
- The platform big-picture was read when the session needed Convertigo context.
- One matching recipe was chosen deliberately before broad exploration.
- The target QName and placement are exact and case-sensitive.
- Any created object came from the live palette or an already known canonical tree shape.
- Runtime validation happened where behavior matters.
- The next guide, if any, was chosen deliberately from the task shape.
- The project was saved after successful checks.
