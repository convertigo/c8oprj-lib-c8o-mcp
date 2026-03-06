# Convertigo Start Guide

## When to read this
Read this first for any MCP session that touches a Convertigo project.

## What this guide covers
- The source-of-truth order for Convertigo MCP work.
- The tree-first authoring model.
- The minimum safe workflow for inspect, mutate, validate, and save.
- How to choose the next specialized guide instead of reading everything.

### Guide selection matrix

| Task shape | Read next | Why |
| --- | --- | --- |
| Single sequence or facade change | `convertigo/backend-sequences@1` | Response shape, JSON steps, SmartTypes, and validation rules live there. |
| SQL-backed feature | `convertigo/backend-sequences@1`, then `convertigo/integration-sql@1` | Keep the facade contract stable and wire SQL behind it. |
| HTTP-backed feature | `convertigo/backend-sequences@1`, then `convertigo/integration-http@1` | Keep connector setup and schema capture behind a stable facade. |
| NGX UI task | `convertigo/frontend-ngx@1` | Palette-first authoring, UI state handling, and validation are specialized. |
| Multi-track delivery across backend, integration, and UI | `convertigo/engineering-workflow@1`, then `convertigo/contract-first-delivery@1` | Planner rules, stub strategy, and parallel handoff live there. |
| Final closure, proof, or review | `convertigo/validation-and-evidence@1` | Save/reload discipline and final proof expectations live there. |
| Rhino `context` or JSON step details | `convertigo/context-api@1` or `convertigo/json-quickref@1` | These are references, not primary onboarding guides. |

## Mandatory workflow

### Minimal MCP session recipe
1. Call `resources/list`.
2. Read the built-in resources first:
   - `convertigo://capabilities`
   - `convertigo://recipes/quickstart`
3. Inspect the target workspace or subtree before any write call:
   - `project-list`
   - `databaseobject-tree-get`
   - `databaseobject-search` when discovery is uncertain
4. If you need to create an object, confirm the allowed entry with:
   - `palette-list`
   - `palette-describe`
5. Build the mutation plan before the first write call.
6. Apply changes with `databaseobject-tree-apply` or `batch-call`.
7. Validate behavior with `requestable-execute`. Use `log-view` only when execution feedback is not enough.
8. Save with `project-save`.
9. Read a specialized guide before continuing when the task shape requires it.

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
- exact target QName and case
- patch existing node or create new node
- correct parent placement: `self`, `inside`, `before`, or `after`
- correct palette entry or canonical `className`
- expected response contract when the task changes runtime behavior
- validation call to run immediately after the mutation
- whether the task requires only `project-save` or also `project-reload`

### Guide escalation example
Correct escalation for a multi-track feature:
1. Start here and inspect the project.
2. Read `convertigo/engineering-workflow@1`.
3. Read `convertigo/contract-first-delivery@1` before any write call.
4. Read `convertigo/backend-sequences@1` to define the facade sequence and stub.
5. Read `convertigo/integration-http@1` or `convertigo/integration-sql@1` for the real data source.
6. Read `convertigo/frontend-ngx@1` only when the contract is stable enough to bind UI work.
7. Close with `convertigo/validation-and-evidence@1`.

## Recommended MCP tools
- `project-list`
- `databaseobject-tree-get`
- `databaseobject-search`
- `palette-list`
- `palette-describe`
- `databaseobject-tree-apply`
- `batch-call`
- `requestable-execute`
- `project-save`

## Anti-patterns / do not do
- Do not edit `_c8oProject` YAML as the normal authoring path.
- Do not use the removed CRUD-era flow (`children`, `create`, `properties-get/set`).
- Do not guess QNames, class names, or NGX palette entries.
- Do not start with RAG when tool metadata and tracked guides already answer the question.
- Do not validate only the tree shape when runtime behavior matters.
- Do not read every guide by default. Read the smallest set that matches the task.

## Completion checks
- You used MCP discovery before mutation.
- The target QName and placement are exact and case-sensitive.
- Any created object came from the live palette or an already known canonical tree shape.
- Runtime validation happened where behavior matters.
- The next guide, if any, was chosen deliberately from the task shape.
- The project was saved after successful checks.
