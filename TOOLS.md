# Convertigo MCP Tools

> Refreshed by `_refreshMaintainerDocs` from the live MCP catalog on `2026-03-16` (`mcp_initialize`, `mcp_tools_list`, `mcp_resources_list`, `mcp_prompts_list`).

## Live Snapshot

- Server version: `0.0.17`
- Tools: `29`
- Resources: `25`
- Prompts: `9`

Use the live MCP catalog as truth:

1. `tools/list`
2. `resources/list`
3. `prompts/list`

This file is a short generated companion for maintainers and reviewers.

## Fresh Session Discovery Order

1. `resources/list`
2. `prompts/list`
3. `convertigo://capabilities`
4. `convertigo://recipes/quickstart`
5. `convertigo://resources/convertigo-start`
6. then only the fast path or exploratory path

For a new CRUD UI project, the current public rail is:

1. `marketplace-import`
2. `mobile-builder-open`
3. `upsert-crud`
4. backend `crud-proof`
5. `upsert-ngx-crud-kit stage=bootstrap`
6. `mobile-builder-open`
7. `upsert-ngx-crud-kit stage=final`
8. final `crud-proof(viewerUrl)`
9. `project-save`

## Tools

| Tool | Sequence | Title | Description |
|---|---|---|---|
| `batch-call` | `tools_batch_call` | Run a batch of MCP tool calls | Supports stop or continue error policy, execution resumption, and deferred save, refresh, or builder finalization for mutation-heavy batches. |
| `crud-proof` | `tools_crud_proof` | Prove deterministic CRUD state | Combines CRUD status, requestable execution summaries, UI shell checks, and mobile builder readiness diagnostics for the mono-agent fast path. |
| `crud-status` | `tools_crud_status` | Inspect deterministic CRUD status | Returns the current CRUD scaffold status for a project, connector, facade prefix, and visible UI target. |
| `databaseobject-delete` | `tools_databaseobject_delete` | Delete a database object | Removes an existing object from the project tree. Use autoSave=false or batch-call when you want to group several mutations before exporting. |
| `databaseobject-move` | `tools_databaseobject_move` | Move or reorder a database object | Moves an existing object under a new parent or repositions it before or after a sibling. Source and target QNames must already exist. |
| `databaseobject-rename` | `tools_databaseobject_rename` | Rename a database object | Renames an existing object and can refactor references. Use update_all only when cross-project refactoring is intended. |
| `databaseobject-schema` | `tools_databaseobject_schema` | Read a database object schema or sample | Returns XML, JSON, or JSON Schema for an existing object. For requestables, internal=true switches from the response schema to the request schema. |
| `databaseobject-search` | `tools_databaseobject_search` | Search database objects | Searches names, comments, and QNames under one root or across all projects. Supports cursor pagination and optional regex matching. |
| `databaseobject-tree-apply` | `tools_databaseobject_tree_apply` | Patch a canonical database object tree | Creates or updates canonical tree nodes relative to an existing target. Prefer merge for incremental edits; use replace only when missing children should be pruned in the patched scope. |
| `databaseobject-tree-get` | `tools_databaseobject_tree_get` | Read a canonical database object tree | Returns a canonical subtree rooted at an existing QName. Tune depth, property mode, and limit to keep responses small; use the cursor to continue long traversals. |
| `log-view` | `tools_log_view` | Read engine or Studio logs | Queries LogManager with text, level, category, requestable, and date filters. Keep limits modest; use raw filter only when the simpler fields are not enough. |
| `marketplace-import` | `tools_marketplace_import` | Import a marketplace project | Imports a marketplace project into the workspace and wires the reference for the target project. Starter templates may require a new local project name. |
| `marketplace-list` | `tools_marketplace_list` | Search marketplace libraries | Lists marketplace entries and highlights workspace or reference status. Filter with search or topics before scanning many pages. |
| `mobile-builder-open` | `tools_mobile_builder_open` | Start, poll, or reconnect to the NGX mobile builder | Starts or reconnects to the NGX builder and returns readiness diagnostics plus viewerBaseUrl, viewerHomeUrl, viewerUrl, browserDebugUrl/browserDevToolsJsonUrl/browserDevToolsWebSocketUrl when a Studio JxBrowser viewer is available, and structured compileErrors. By default wait=true preserves synchronous readiness. Set wait=false to launch asynchronously and return the current state immediately. Set stateOnly=true to read current viewer URLs/state without opening or restarting the builder. Use viewerHomeUrl or viewerBaseUrl for the live dev app; reserve DisplayObjects/mobile/home for production builds. Use forceRestart only when the current builder is stuck or on the wrong state. |
| `palette-describe` | `tools_palette_describe` | Describe a palette entry | Returns creation hints, property metadata, and optional template details for one palette class. Use className from palette-list output. |
| `palette-list` | `tools_palette_list` | List creatable palette entries | Returns palette items that can be created under a target parent, using Studio-compatible rules for built-in, shared, and NGX dynamic entries. |
| `project-delete` | `tools_project_delete` | Delete a project from the workspace | Removes one project by technical name and deletes its files. Benchmark cleanup should use this instead of databaseobject-delete on the project root. |
| `project-js-get` | `tools_project_js_get` | Read a project helper script | Loads one file from the project's js/ directory. Use it to inspect helper code or schema override files before patching them. |
| `project-js-set` | `tools_project_js_set` | Write a project helper script | Creates or replaces one file under the project's js/ directory. Send the complete file content; partial patches are not supported. |
| `project-list` | `tools_project_list` | List loaded Convertigo projects | Returns loaded projects with basic metadata for admin or discovery flows. Use filter before raising the limit. |
| `project-list-symbols` | `tools_project_list_symbols` | List project and global symbols | Returns symbol references, project defaults, and global symbol visibility for one project or all loaded projects. |
| `project-reload` | `tools_project_reload` | Reload a project from disk | Reloads one project and discards unsaved in-memory changes. Use only when you explicitly want disk state to win. |
| `project-save` | `tools_project_save` | Save a project to disk | Exports one project from engine memory to disk. Use it after grouped mutations when autoSave was disabled. |
| `rag-query` | `tools_rag_query` | Query the Convertigo knowledge base | Fallback helper for features, setup, APIs, and troubleshooting. It is slower than local guides, so prefer documented workflows when you already have them. |
| `requestable-execute` | `tools_requestable_execute` | Run a sequence or transaction | Executes a requestable and returns its payload. Pass variables as an object or JSON string; enable includeLogs only for debugging, and use recordSchema only on transactions. |
| `requestable-stub-get` | `tools_requestable_stub_get` | Read a requestable stub | Loads the XML stub file for a sequence or transaction using the same default filename logic as the Convertigo engine. |
| `requestable-stub-set` | `tools_requestable_stub_set` | Write a requestable stub | Creates or replaces the XML stub file for a sequence or transaction using the same default filename logic as the Convertigo engine. |
| `upsert-crud` | `tools_upsert_crud` | Create or update deterministic CRUD scaffolding | Upserts a Convertigo SQL CRUD scaffold from a structured spec and can optionally expose public sequences and a visible NGX shell. Use the exact requested project name when it is valid; do not invent prefixes or date suffixes. If no seed profile is supplied, the default seed is realistic demo data. Entity specs may also define singular, plural, routeSegment, and displayLabel overrides when English inflection is not correct. |
| `upsert-ngx-crud-kit` | `tools_upsert_ngx_crud_kit` | Create or update a deterministic NGX CRUD kit | Replaces the visible starter entry page content with a deterministic CRUD shell, staged bootstrap/final markers, shared actions, and global UI state. Prefer entity-pages for generic CRUD, keep dashboard only for compatibility, and use master-detail for the CRM rail. |
| `yaml-lint` | `tools_yaml_lint` | YAML Lint | Runs Convertigo YAML dialect lint (`c8o_yaml_lint.py`) on a project root or selected YAML paths. |

## Resources

| URI | Title | Description | Guidance |
|---|---|---|---|
| `convertigo://capabilities` | Convertigo MCP capabilities | Core MCP capabilities and recommended authoring flow. |  |
| `convertigo://recipes/quickstart` | Convertigo MCP quickstart recipes | Minimal MCP-first recipes for fast project delivery. |  |
| `convertigo://resources/convertigo-backend-sequences` | Convertigo Backend Sequences | Sequence and facade design, JSON shaping, SmartTypes, and safe runtime validation. | domain |
| `convertigo://resources/convertigo-bootstrap-decision-matrix` | Convertigo Bootstrap Decision Matrix | Bootstrap-first questioning and brief-building guide for mono-agent and multi-agent Convertigo sessions. | workflow |
| `convertigo://resources/convertigo-context-api` | Convertigo Context (JS API guardrails) | Reference guide for safe Rhino context usage and forbidden patterns. | reference |
| `convertigo://resources/convertigo-contract-first-delivery` | Convertigo Contract-First Delivery | Planner workflow for facade contracts, stubs, parallel specialist work, and safe stub replacement. | workflow |
| `convertigo://resources/convertigo-crud-fastpath` | Convertigo CRUD Fast Path | Recommended mono-agent path for deterministic SQL CRUD plus starter NGX UI work. | workflow |
| `convertigo://resources/convertigo-crud-practical-cases` | Convertigo CRUD Practical Cases | Copyable direct MCP flows for proving deterministic CRUD on fresh starter NGX projects. | workflow |
| `convertigo://resources/convertigo-engineering-workflow` | Convertigo Engineering Workflow | Team practices for reviewable changes, validation discipline, evidence, and controlled RAG usage. | workflow |
| `convertigo://resources/convertigo-fast-path-ngx-entry-shell` | Convertigo Fast Path NGX Entry Shell | Literal first-pass template for replacing starter entry content with a visible feature shell. | workflow |
| `convertigo://resources/convertigo-fast-path-sql-hsqldb` | Convertigo Fast Path SQL HSQLDB | Literal first-pass template for an embedded HSQLDB connector with init/list/count proof. | workflow |
| `convertigo://resources/convertigo-fast-path-sql-mariadb` | Convertigo Fast Path SQL MariaDB | Literal first-pass template for a MariaDB Docker connector with init/list/count proof. | workflow |
| `convertigo://resources/convertigo-fast-path-sql-postgresql` | Convertigo Fast Path SQL PostgreSQL | Literal first-pass template for a PostgreSQL connector with init/list/count proof. | workflow |
| `convertigo://resources/convertigo-frontend-ngx` | Convertigo Frontend NGX | Palette-first NGX delivery with contract-based bindings, batching, and resilient UI states. | domain |
| `convertigo://resources/convertigo-integration-http` | Convertigo HTTP Integration | HTTP connector and transaction setup, schema recording, transport diagnostics, and facade handoff. | domain |
| `convertigo://resources/convertigo-integration-sql` | Convertigo SQL Integration | SQL connector and transaction practices behind a stable facade contract. | domain |
| `convertigo://resources/convertigo-json-quickref` | Convertigo JSON Steps Quickref | Reference guide for JSON steps, iterators, ordering, and SmartType sourcing. | reference |
| `convertigo://resources/convertigo-platform-big-picture` | Convertigo Platform Big Picture | Platform overview, mindset, subsystems, and the reasons behind facade-first Convertigo design. | start |
| `convertigo://resources/convertigo-recipe-facade-stub` | Convertigo Facade Stub Recipe | Golden path for locking a facade contract and producing a minimal executable stub fast. | workflow |
| `convertigo://resources/convertigo-recipe-http-facade` | Convertigo HTTP Facade Recipe | Golden path for building an HTTP connector and wiring it behind a stable facade contract. | workflow |
| `convertigo://resources/convertigo-recipe-ngx-data-page` | Convertigo NGX Data Page Recipe | Golden path for building a data-backed NGX page with loading, empty, error, and retry states. | workflow |
| `convertigo://resources/convertigo-recipe-sql-crud` | Convertigo SQL CRUD Recipe | Golden path for creating a SQL CRUD scaffold behind a stable facade contract. | workflow |
| `convertigo://resources/convertigo-recipe-starter-extension` | Convertigo Starter Extension Recipe | Golden path for importing a starter project and extending it without rediscovering project structure. | workflow |
| `convertigo://resources/convertigo-start` | Convertigo Start Guide | Canonical entry guide for tree-first Convertigo MCP work. | start |
| `convertigo://resources/convertigo-validation-and-evidence` | Convertigo Validation and Evidence | Closure checklist for runtime proofs, save/reload discipline, and concise evidence. | validation |

## Prompts

| Prompt | Title | Description | Role |
|---|---|---|---|
| `convertigo-backend` | Convertigo Backend Specialist | Sequence specialist for facade requestables, orchestration, and stable response shaping. | backend |
| `convertigo-critic` | Convertigo Critic | Internal lab reviewer for MCP guide compliance, evidence quality, and UX gaps. | critic |
| `convertigo-crud-fastpath` | Convertigo CRUD Fast Path | Recommended mono-agent rail for deterministic SQL CRUD plus starter NGX UI work. | crud-fastpath |
| `convertigo-frontend-ngx` | Convertigo Frontend NGX Specialist | NGX page and binding specialist working against a stable backend facade contract. | frontend-ngx |
| `convertigo-http` | Convertigo HTTP Specialist | HTTP connector and transaction specialist working behind an agreed facade contract. | http |
| `convertigo-maintainer` | Convertigo Maintainer | Internal lab maintainer that turns aggregate findings into one candidate patch set. | maintainer |
| `convertigo-planner` | Convertigo Planner | Contract-first planner for non-fast-path Convertigo work. | planner |
| `convertigo-quickstart` | Convertigo MCP Quickstart | Bootstrap guide selection and route standard SQL CRUD + starter NGX work to the fast path. | bootstrap |
| `convertigo-sql` | Convertigo SQL Specialist | SQL connector and transaction specialist working behind an agreed facade contract. | sql |
