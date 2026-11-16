# Convertigo Start Guide

Use the live MCP catalog as truth. Inspect with databaseobject-tree-get, mutate with databaseobject-tree-apply, group ordered writes in batch-call, prove with requestable-execute, then project-save. Keep the exact requested project name. On an existing project call project-brief({project}) once, then project-brief({project, page}) for the page you change, and patch from its QNames. Never edit project YAML/XML or generated artifacts. Read only the matching recipe; use RAG only after guides and tools fail. For NGX import template_ngxBuilderIonic, open the viewer early with wait=false, and prove the visible entry page. Before deployment/export run mobile-builder-build; a green dev viewer alone is insufficient.

Routes: new NGX `convertigo://guides/starter`; data page `convertigo://guides/data-page`; HTTP `convertigo://guides/http-sequence`; SQL `convertigo://guides/sql-recipe`; CRUD `convertigo://guides/crud`; login `convertigo://guides/auth`. For event ordering open `convertigo://guides/ngx/events`; for binding failures open `convertigo://guides/ngx/smartsource`.

## Drawers
- `convertigo://guides/start/overview` — Scope, prerequisites and route selection.
- `convertigo://guides/start/mandatory-workflow` — Mandatory workflow.
- `convertigo://guides/start/mandatory-workflow-2` — Mutations, CRUD page generators and backend contracts.
- `convertigo://guides/start/mandatory-workflow-3` — Viewer URLs, call skeletons and first-write checks.
- `convertigo://guides/start/mandatory-workflow-4` — Escalation, unsafe shortcuts and completion checks.
