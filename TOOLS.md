# Convertigo MCP Tools

> Refreshed by `_refreshMaintainerDocs` from the live MCP catalog on `2026-03-16` (`mcp_initialize`, `mcp_tools_list`, `mcp_resources_list`, `mcp_prompts_list`).

## Live Snapshot

| Tool name                     | Sequence file                               | Summary |
|-------------------------------|---------------------------------------------|---------|
| `project-list`         | `tools_project_list.yaml`            | List installed projects with metadata (templates, versions, exports…). |
| `batch-call`                  | `tools_batch_call.yaml`                     | Execute multiple MCP tool calls in one internal batch (`calls[]`) with `onError=stop|continue`, detailed per-call diagnostics, `$ref` substitution between calls (`{"$ref":"id.path"}`), resume metadata, and deferred mutation finalization (`optimizeMutations=true`). |
| `databaseobject-tree-get`     | `tools_databaseobject_tree_get.yaml`        | Read one canonical subtree from an existing `target` with `childrenDepth`, `properties=none|changed|all`, and pagination via `_nextCursor`. |
| `databaseobject-tree-apply`   | `tools_databaseobject_tree_apply.yaml`      | Apply one canonical tree operation on an existing `target` using `at=self|inside|before|after`, `mode=merge|replace`, and `tree` payload (`children` + `$ref` supported). |
| `databaseobject-delete`       | `tools_databaseobject_delete.yaml`          | Delete a database object, optionally exporting and refreshing Studio. |
| `databaseobject-move`         | `tools_databaseobject_move.yaml`            | Move or reorder a database object with Studio refresh support. |
| `databaseobject-rename`       | `tools_databaseobject_rename.yaml`          | Rename a database object and optionally refactor references. |
| `databaseobject-properties-get` | `tools_databaseobject_properties_get.yaml` | Retrieve metadata + values for a database object. Payload is compact by default; pass `includeHints=true` to re-enable long descriptions and boolean flags. |
| `databaseobject-properties-set` | `tools_databaseobject_properties_set.yaml` | Update properties (including XMLizable / SmartType handling). |
| `marketplace-list`              | `tools_marketplace_list.yaml`              | List marketplace libraries, mark workspace/reference state, and include exposed shared components/actions when loaded. |
| `marketplace-import`            | `tools_marketplace_import.yaml`            | Import a marketplace library when missing and ensure a `ProjectSchemaReference` is present on the target project. |
| `palette-list`                | `tools_palette_list.yaml`                   |  Lightweight catalog of creatable objects (name, class, summaries, describe hints). NGX targets include Studio-compatible dynamic entries (Ionic palette items). Supports `includeBuiltIn` / `includeShared` toggles (both default `true`). |
| `palette-json-skeleton`       | `tools_palette_json_skeleton.yaml`          | Resolve one palette entry against a parent QName and return a minimal canonical Convertigo JSON subtree skeleton plus `coverage=template|serialized|hints`, so agents can edit JSON mirrors without mining other projects for examples. |
| `palette-resolve-with-marketplace` | `tools_palette_resolve_with_marketplace.yaml` | Check the target palette first, then query/import marketplace libraries when needed, reread the palette, and return the refreshed result plus a JSON skeleton when an exact class token is provided. Also supports capability-first discovery when only `search` / `filter` intent hints are known (for example charts, maps, barcode, editor, PDF viewer, calendar). |
| `log-view`                    | `tools_log_view.yaml`                       | Read logs through LogManager API with structured filters (`project`, `requestable`, `connector`, `transaction`, etc.) and cursor pagination. |
| `mobile-builder-open`         | `tools_mobile_builder_open.yaml`            | Open/activate the NGX application editor in Studio, start the mobile builder watcher, then return the detected Node URL (`http://localhost:<port>`) with `editorOpened` and builder log excerpts. |
| `marketplace-list`            | `tools_marketplace_list.yaml`               | List marketplace entries with `search`, `topics`, and cursor pagination. |
| `marketplace-import`          | `tools_marketplace_import.yaml`             | Import one marketplace project into workspace using `project` (+ optional `importedProjectName`, `targetProject`). |
| `palette-list`                | `tools_palette_list.yaml`                   | Lightweight catalog of creatable objects (name, class, summaries, describe hints). NGX targets include Studio-compatible dynamic entries (Ionic palette items). Supports `includeBuiltIn` / `includeShared` toggles (both default `true`). |
| `palette-describe`            | `tools_palette_describe.yaml`               | Detailed description of a specific palette entry (creation template, property hints). |
| `project-js-get`              | `tools_project_js_get.yaml`                 | Read a helper script in the project `js/` directory. |
| `project-js-set`              | `tools_project_js_set.yaml`                 | Create or update a helper script in the project `js/` directory. |
| `project-execute`            | `tools_project_execute.yaml`                | Launch (or skip launch) a project mobile builder in Studio, wait initial build, and return npm/build log summary/errors from Studio logs. |
| `project-delete`              | `tools_project_delete.yaml`                 | Delete one loaded project exactly by technical name, including its files and optional `.car` archive cleanup. |
| `project-save`                | `tools_project_save.yaml`                   | Export a project to disk immediately and report save status/errors. |
| `project-reload`              | `tools_project_reload.yaml`                 | Reload a project from disk, discarding unsaved changes in memory. Pass `fromJson=true` to rebuild `c8oProject.yaml` and `_c8oProject/` from `c8oProject.json` and `_c8oProjectJson/` first. |
| `report-create`              | `tools_report_create.yaml`                  | Write one structured field-feedback report under `feedback/inbox/YYYY/MM/`. Exposed only when `${mcp.report.mode=off}` resolves to `suggest` or `benchmark`. |
| `rag-query`                   | `tools_rag_query.yaml`                      | Query the Convertigo RAG/knowledge base when usage is uncertain; expect slow responses (typically 30-60 seconds). |
| `requestable-execute`         | `tools_requestable_execute.yaml`            | Execute a sequence/transaction internally and return its payload for inspection. |
| `yaml-lint`                  | `tools_yaml_lint.yaml`                      | Run Convertigo YAML dialect lint (`c8o_yaml_lint.py`) on a project root or selected YAML paths. |
| databaseobject-schema       | 	ools_databaseobject_schema.yaml          | Return a minimal schema/sample for a requestable or request node (	ype=xml|json|jsonschema; internal=true for sourceDefinition view). |

| `requestable-execute`         | `tools_requestable_execute.yaml`            | Execute a sequence/transaction internally and return its payload for inspection (`includeLogs=true` appends execution logs). |
| `requestable-stub-get`        | `tools_requestable_stub_get.yaml`           | Read the XML stub file for a sequence or transaction using Convertigo's default stub filename logic, or an explicit file under `stubs/`. |
| `requestable-stub-set`        | `tools_requestable_stub_set.yaml`           | Create or replace the XML stub file for a sequence or transaction, validating that the stub root element is `<document>`. |
| `databaseobject-schema`       | `tools_databaseobject_schema.yaml`          | Return a minimal schema/sample for a requestable or request node (`type=xml|json|jsonschema`; `internal=true` for `sourceDefinition` view). |
| `databaseobject-search`       | `tools_databaseobject_search.yaml`          | Search database objects via substring/regex matching on YAML content; output now reports `scanned`, `returned`, `hasMore`, `nextCursor`, and a lean `matches[]`. |
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
| `mobile-builder-open` | `tools_mobile_builder_open` | Start or reconnect to the NGX mobile builder | Ensures the NGX builder is running and returns readiness diagnostics plus viewerBaseUrl, viewerHomeUrl, viewerUrl, and structured compileErrors. Use viewerHomeUrl or viewerBaseUrl for the live dev app; reserve DisplayObjects/mobile/home for production builds. If the live app fails to compile, this tool should return compile_error quickly instead of waiting for a blind timeout. Use forceRestart only when the current builder is stuck or on the wrong state. |
| `palette-describe` | `tools_palette_describe` | Describe a palette entry | Returns creation hints, property metadata, and optional template details for one palette class. Use className from palette-list output. |
| `palette-json-skeleton` | `tools_palette_json_skeleton` | Return a canonical JSON subtree skeleton for a palette entry | Resolves a palette class against a parent QName, prefers a palette-registry `yamlTemplate` when available, falls back to the live palette full XML export otherwise, and returns a minimal subtree wrapper ready to adapt. The response now includes `coverage=template|serialized|hints` so agents know whether they are looking at a template-backed, serialized, or hint-only shape. |
| `palette-list` | `tools_palette_list` | List creatable palette entries | Returns palette items that can be created under a target parent, using Studio-compatible rules for built-in, shared, and NGX dynamic entries. |
| `palette-resolve-with-marketplace` | `tools_palette_resolve_with_marketplace` | Resolve a palette need with marketplace fallback | Reads the target palette, optionally imports a matching marketplace library into the target project, rereads the palette, and returns the refreshed palette state plus a canonical JSON skeleton when an exact class token is supplied. It can also be used without `className` as a capability-first resolver by passing intent-derived `search` / `filter` hints. |
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

This keeps the API stateless and compliant with the JSON-RPC MCP guidelines while
reducing context usage.

### Shared infrastructure

| File(s)                                    | Purpose |
|--------------------------------------------|---------|
| `internal_json_schema.yaml`                | Build JSON Schema + sample payloads for tool inputs/outputs. |
| `internal_list_tools_info.yaml`, `mcp_tools_list.yaml` | Discover `tools_*` sequences and expose catalog to MCP clients. |
| `internal_studio_refresh.yaml`             | Refresh the Eclipse Project Explorer after mutations when Studio is present. |
| `js/databaseobject.js`, `js/databaseobject_ops.js`, `js/marketplace.js`, `js/util.js`, `js/xmlizable.js` | Shared Rhino helpers for parsing JSON, marketplace integration, and object mutations. |
| `js/databaseobject.js`, `js/databaseobject_batch.js`, `js/databaseobject_ops.js`, `js/tools_batch_call.js`, `js/util.js`, `js/xmlizable.js` | Shared Rhino helpers for parsing JSON, handling SmartType/XMLizable values, and performing mutations/batch execution. |

## Backlog

The following tools adopt the same naming style (category prefix + hyphenated
action). When a future tool reuses existing `databaseobject-*` helpers this is
noted in the description.

### Meta / introspection
- [ ] `meta-describe-object` — Optional lightweight descriptor returning only
  high-level metadata (type, parent, enabled, comment). We may reuse
  `databaseobject-tree-get` (`childrenDepth=0`, `properties=all`) if consumers accept the richer output.
- [ ] `meta-filter` — Common filtering helper used by several tools (`project-list`,
  `databaseobject-tree-get`, `palette-list`) to perform
  case-insensitive search on names/comments.

### Project discovery
- [ ] `project-describe-tree` — Breadth-limited traversal of part of a project
  to understand overall structure (reuses `databaseobject-tree-get` under the hood).
- [ ] `project-fetch-source` — Retrieve the serialized YAML (and checksum) for a
  database object identified by QName.
- [ ] `project-search` — Search database objects by name/comment and optionally
  smart-source fragments.
- [ ] `project-list-symbols` — Expose symbol/environment definitions with their
  scope/visibility.

### Database object authoring / mutations
- [ ] `databaseobject-ensure-sequence` — Ensure a sequence scaffold exists with
  desired metadata (likely wrapping `databaseobject-tree-apply`).
- [ ] `databaseobject-add-step` — Append a child step using a palette template
  below a parent path.
- [ ] `databaseobject-update-property` — Convenience wrapper around
  `databaseobject-tree-apply` for single-property edits.
- [ ] `databaseobject-bind-source` — Helper for updating JSON/mobile sources or
  bindings in steps.
- [ ] `databaseobject-remove` — Higher-level remove with dependency / safety
  checks that ultimately calls `databaseobject-delete`.
- [ ] `databaseobject-commit` — Export/persist the project after pending
  mutations (supports dry run reporting, triggers Studio refresh as needed).

### Execution & validation
- [ ] `invoke-testcase` — Trigger a TestCase and report assertion results.
- [ ] `invoke-export-project` — Force a project export and return file paths or
  checksums.

### Monitoring / admin
- [ ] `admin-get-engine-status` — Expose engine version, uptime, active
  sessions, health indicators.
- [ ] `admin-get-engine-metrics` — Return runtime metrics (memory, GC, thread
  counts, etc.).

### Generic search

---

Update this file each time a tool is added or renamed so that it stays in sync
with the actual `tools/list` MCP catalog.
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
