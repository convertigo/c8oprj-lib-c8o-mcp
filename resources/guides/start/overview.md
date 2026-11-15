# Scope, prerequisites and route selection

Read when: Scope, prerequisites and route selection. Summary: `convertigo://guides/start`.
Next: `convertigo://guides/start/mandatory-workflow`.

---

# Convertigo Start Guide

## When to read this
Read this when a managed skill cannot route the task directly, or when the agent needs general Convertigo orientation.

## What this guide covers
- The source-of-truth order for Convertigo MCP work.
- The tree-first authoring model.
- The minimum safe workflow for inspect, mutate, validate, and save.
- How to choose the next platform guide, recipe, and handbook instead of reading everything.

## Read order
1. Read `convertigo://capabilities`.
2. If a managed skill already identifies the route, read its one matching recipe directly.
3. Read `convertigo://recipes/quickstart` only when route selection remains ambiguous.
4. Read `convertigo://guides/platform` only when the task requires platform orientation rather than implementation.
5. Read the deeper handbook only when the recipe and live tool contracts leave an open question.

### Guide selection matrix

| Task shape | Read next | Why |
| --- | --- | --- |
| Understand the platform before touching anything | `convertigo/platform-big-picture@1` | Explains what Convertigo is, why business sequences exist, and how the platform parts fit together. |
| Single sequence or business sequence change | `convertigo/recipe-business-sequence-stub@1`, then `convertigo/backend-sequences@1` | Start with the golden path, then go deeper on response shape, JSON steps, SmartTypes, and validation rules. |
| SQL-backed feature | `convertigo/recipe-sql-crud@1`, then `convertigo/integration-sql@1` | Start with the CRUD scaffold recipe, then go deeper on driver and transaction subtleties. |
| Standard SQL CRUD + starter NGX UI | `convertigo/crud-fastpath@1` | Preferred mono-agent public path for the current recovery cycle. |
| HTTP-backed feature | `convertigo/recipe-http-business-sequence@1`, then `convertigo/integration-http@1` | Start with the connector and business sequence recipe, then go deeper on payload, schema, and handler details. |
| NGX UI task | `convertigo/recipe-ngx-data-page@22`, then `convertigo/frontend-ngx@17` | Start with the canonical data-page pattern, then go deeper on palette, actions, and bindings. |
| New app or starter-based POC | `convertigo/recipe-starter-extension@4`; if it displays backend, HTTP web-service, SQL, or FullSync results, also `convertigo/recipe-ngx-data-page@22` before page mutation | Gives the fast path for importing a starter and prevents raw fragment pages for data-backed UI. |
| Multi-track delivery across backend, integration, and UI | `convertigo/engineering-workflow@1`, then `convertigo/contract-first-delivery@1`, then the matching recipe | Planner rules, stub strategy, parallel handoff, and the first implementation pattern live there. |
| Final closure, proof, or review | `convertigo/validation-and-evidence@1` | Save/reload discipline and final proof expectations live there. |
| Rhino `context` or JSON step details | `convertigo/context-api@1` or `convertigo/json-quickref@1` | These are references, not primary onboarding guides. |

