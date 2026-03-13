# Convertigo MCP tools

This document tracks the MCP tools currently exposed by the
`ConvertigoMCP` project and lists the next tools we plan to build. The tool
names shown here are the exact identifiers returned by `tools/list`
(lowercase, category prefix, hyphen separator). Each tool is implemented by a
Convertigo sequence stored in `_c8oProject/sequences/tools_<category>_<action>.yaml`.

## Delivered tools

| Tool name                     | Sequence file                               | Summary |
|-------------------------------|---------------------------------------------|---------|
| `project-list`         | `tools_project_list.yaml`            | List installed projects with metadata (templates, versions, exports…). |
| `batch-call`                  | `tools_batch_call.yaml`                     | Execute multiple MCP tool calls in one internal batch (`calls[]`) with `onError=stop|continue`, detailed per-call diagnostics, `$ref` substitution between calls (`{"$ref":"id.path"}`), resume metadata, and deferred mutation finalization (`optimizeMutations=true`). |
| `databaseobject-tree-get`     | `tools_databaseobject_tree_get.yaml`        | Read one canonical subtree from an existing `target` with `childrenDepth`, `properties=none|changed|all`, and pagination via `_nextCursor`. |
| `databaseobject-tree-apply`   | `tools_databaseobject_tree_apply.yaml`      | Apply one canonical tree operation on an existing `target` using `at=self|inside|before|after`, `mode=merge|replace`, and `tree` payload (`children` + `$ref` supported). |
| `databaseobject-delete`       | `tools_databaseobject_delete.yaml`          | Delete a database object, optionally exporting and refreshing Studio. |
| `databaseobject-move`         | `tools_databaseobject_move.yaml`            | Move or reorder a database object with Studio refresh support. |
| `databaseobject-rename`       | `tools_databaseobject_rename.yaml`          | Rename a database object and optionally refactor references. |
| `log-view`                    | `tools_log_view.yaml`                       | Read logs through LogManager API with structured filters (`project`, `requestable`, `connector`, `transaction`, etc.) and cursor pagination. |
| `mobile-builder-open`         | `tools_mobile_builder_open.yaml`            | Open/activate the NGX application editor in Studio, start the mobile builder watcher, then return the detected Node URL (`http://localhost:<port>`) with `editorOpened` and builder log excerpts. |
| `marketplace-list`            | `tools_marketplace_list.yaml`               | List marketplace entries with `search`, `topics`, and cursor pagination. |
| `marketplace-import`          | `tools_marketplace_import.yaml`             | Import one marketplace project into workspace using `project` (+ optional `importedProjectName`). |
| `palette-list`                | `tools_palette_list.yaml`                   | Lightweight catalog of creatable objects (name, class, summaries, describe hints). NGX targets include Studio-compatible dynamic entries (Ionic palette items). Supports `includeBuiltIn` / `includeShared` toggles (both default `true`). |
| `palette-describe`            | `tools_palette_describe.yaml`               | Detailed description of a specific palette entry (creation template, property hints). |
| `project-js-get`              | `tools_project_js_get.yaml`                 | Read a helper script in the project `js/` directory. |
| `project-js-set`              | `tools_project_js_set.yaml`                 | Create or update a helper script in the project `js/` directory. |
| `project-delete`              | `tools_project_delete.yaml`                 | Delete one loaded project exactly by technical name, including its files and optional `.car` archive cleanup. |
| `project-save`                | `tools_project_save.yaml`                   | Export a project to disk immediately and report save status/errors. |
| `project-reload`              | `tools_project_reload.yaml`                 | Reload a project from disk, discarding unsaved changes in memory; use it as rollback, not as a freshness step. Reloading the active MCP server project is forbidden because it would unload the running endpoint. |
| `crud-status`                 | `tools_crud_status.yaml`                    | Inspect the current deterministic CRUD state for a project, connector, facade prefix, and visible UI target. |
| `upsert-crud`                 | `tools_upsert_crud.yaml`                    | Create or update an idempotent SQL CRUD scaffold from a structured spec, optionally exposing public sequences and a visible NGX shell. |
| `upsert-ngx-crud-kit`         | `tools_upsert_ngx_crud_kit.yaml`            | Create deterministic CRUD shared components under `Application.NgxApp`, then replace the visible starter body with a page assembled through `UIUseShared` + `UIUseVariable`. |
| `report-create`              | `tools_report_create.yaml`                  | Write one structured field-feedback report under `feedback/inbox/YYYY/MM/`. Exposed only when `${mcp.report.mode=off}` resolves to `suggest` or `benchmark`. |
| `rag-query`                   | `tools_rag_query.yaml`                      | Query the Convertigo RAG/knowledge base when usage is uncertain; expect slow responses (typically 30-60 seconds). |
| `requestable-execute`         | `tools_requestable_execute.yaml`            | Execute a sequence/transaction against live Studio memory and return its payload for inspection (`includeLogs=true` appends execution logs). |
| `requestable-stub-get`        | `tools_requestable_stub_get.yaml`           | Read the XML stub file for a sequence or transaction using Convertigo's default stub filename logic, or an explicit file under `stubs/`. |
| `requestable-stub-set`        | `tools_requestable_stub_set.yaml`           | Create or replace the XML stub file for a sequence or transaction, validating that the stub root element is `<document>`. |
| `databaseobject-schema`       | `tools_databaseobject_schema.yaml`          | Return a minimal schema/sample for a requestable or request node (`type=xml|json|jsonschema`; `internal=true` for `sourceDefinition` view). |
| `databaseobject-search`       | `tools_databaseobject_search.yaml`          | Search database objects via substring/regex matching on YAML content; output now reports `scanned`, `returned`, `hasMore`, `nextCursor`, and a lean `matches[]`. |

## Built-in MCP resources

Use these first before long guide reads:

- `convertigo://capabilities` — condensed tool capabilities and authoring flow.
- `convertigo://recipes/quickstart` — minimal step-by-step recipes for fast delivery.

Phase 1 guides are exposed through `resources/list` with versioned metadata
(`guideId`, `revision`, `scopeTags`, `prerequisites`, `recommendedTools`,
`guidanceLevel`, `fallbackToRag`). Use the built-ins first, then choose the
right guide from the catalog instead of relying on hard-coded legacy URIs.

Fast-path template guides are also exposed through `resources/templates/list`.
This is a filtered view of the resource catalog for template-bearing entries
such as the SQL and NGX fast paths. Read the content itself through
`resources/read`.

For deterministic CRUD validation, also read
`convertigo://resources/convertigo-crud-practical-cases`. It gives the direct
tool-first order to prove HSQL, PostgreSQL, and MariaDB on fresh starter NGX
projects before asking agents to improvise.

### Practical defaults

Use these short forms first; keep advanced parameters for diagnostics only.

| Tool | Minimal call | Core params | Advanced params |
|------|--------------|-------------|-----------------|
| `databaseobject-tree-get` | `databaseobject-tree-get {"target":"<qname>"}` | `target`, `childrenDepth`, `properties` | `limit`, `_nextCursor` |
| `databaseobject-tree-apply` | `databaseobject-tree-apply {"target":"<qname>","tree":{...}}` | `target`, `at`, `mode`, `tree` | none |
| `log-view` | `log-view {}` | `q` (alias of `text`), `project`, `requestable`, `limit` | `filter`, `category`, `level`, `connector`, `transaction`, `thread`, `startDate/endDate` (`since/until` aliases), `timeoutMs`, `fetchSize` |
| `mobile-builder-open` | `mobile-builder-open {"project":"<project>"}` | `project` | `timeoutSec`, `logsLimit`, `forceRestart` |
| `marketplace-list` | `marketplace-list {}` | `search`, `topics`, `_nextCursor` | `limit`, `maxPages` |
| `marketplace-import` | `marketplace-import {\"project\":\"<name>\"}` | `project` | `importedProjectName` |
| `report-create` | `report-create {"area":"tool","subjectId":"databaseobject-tree-apply","severity":"medium","summary":"Iterator condition is hard to discover."}` | `area`, `subjectId`, `severity`, `summary` | `evidence`, `suggestion`, `rolePrompt`, `project`, `runMode`, `runId`, `provider`, `model` |
| `requestable-stub-get` | `requestable-stub-get {"targetRequestable":"<project>[.<connector>].<requestable>"}` | `targetRequestable`, `stubFilename` | none |
| `requestable-stub-set` | `requestable-stub-set {"targetRequestable":"<project>[.<connector>].<requestable>","content":"<document>...</document>"}` | `targetRequestable`, `content`, `stubFilename` | none |
| `crud-status` | `crud-status {"project":"MiniCRM"}` | `project`, `connector`, `facadePrefix` | `mode`, `variant` |
| `upsert-crud` | `upsert-crud {"spec":{...}}` | `spec`, `sequence`, `ui` | none |
| `upsert-ngx-crud-kit` | `upsert-ngx-crud-kit {"project":"MiniCRM"}` | `project`, `entities`, `entryPage` | `variant`, `facadePrefix`, `runtimeEvidence` |

Notes:
- `marketplace-list` and `marketplace-import` are strict now: legacy aliases are rejected.
- `marketplace-import` enforces starter rename: when the selected entry is a starter, `importedProjectName` is required.
- `report-create` is mode-gated by the Convertigo global symbol `${mcp.report.mode=off}`.
  - `off` hides the tool and any prompt hint
  - `suggest` exposes an optional field-feedback path
  - `benchmark` exposes the same tool with stronger benchmark wording
  - reports land in `feedback/inbox/` and should be consolidated through
    `feedback/triage/` before maintainer use
- `requestable-stub-get` and `requestable-stub-set` follow the same default filename logic as Convertigo runtime stubs (`<sequence>_default.xml` or `<connector>.<transaction>_default.xml`).
- `log-view` accepts `q/since/until` aliases to reduce verbosity in common calls.
- `batch-call` and tree mutation refs accept only object syntax (`{"$ref":"id.path"}`); `${{...}}` placeholders are rejected with an explicit error.
- `project-list-symbols` now defaults to project-local scope when `project` is provided. Use `scope=all` only when you explicitly want global/cross-project noise back.
- `requestable-execute` reads the live in-memory Studio state. Saved mutations stay visible without reload; `project-reload` is rollback to disk, not a refresh primitive.
- Never call `project-reload` on the active MCP server project itself. Use `project-save` to persist MCP project changes without unloading the endpoint.
- `upsert-crud` and `upsert-ngx-crud-kit` trigger a Studio Project Explorer refresh on the project root after a successful save, so newly created connectors, sequences, and visible NGX shell changes appear without a manual refresh.

### Direct CRUD proof order

For a standard starter NGX + SQL CRUD scenario, use this direct order before routing
work through the multi-agent wrapper:

1. `upsert-crud` with a fully explicit `spec`
2. `crud-status`
3. `requestable-execute` on:
   - `init_schema`
   - `list_contacts`
   - `count_contacts`
   - `list_companies`
   - `count_companies`
4. `upsert-ngx-crud-kit`
5. final `crud-status`

Proof is sufficient when:
- `upsert-crud.status == "success"`
- `crud-status.transactions.missing == []`
- `crud-status.sequences.missing == []` when sequences are enabled
- final `crud-status.ui.starterDominant == false`
- final `crud-status.ui.visibleShellPresent == true`
- the target application contains shared components such as `ContactTable`, `ContactCard`, `ContactForm`, `CompanyTable`, `CompanyCard`, `CompanyForm` under `<PROJECT>.Application.NgxApp`
- the visible entry page composes those components through `UIUseShared` with `sharedcomponent` references pointing to the local shared component QNames

### Pagination helpers

Many tools accept a `limit` argument (string or integer depending on the tool
schema) and expose pagination metadata in their result. Forward the
`nextCursor` token via `_meta.nextCursor` between requests to stream remaining
entries.

| Tool name | Notes |
|-----------|-------|
| `project-list` | Supports `limit`; response includes `total` and `nextCursor`. |
| `databaseobject-tree-get` | Returns one canonical subtree from `target`, with descendant pagination (`limit`, `_nextCursor`) and `properties=none|changed|all`. |
| `databaseobject-search` | Returns `scanned`, `returned`, `hasMore`, and `nextCursor` at the root; `matches[]` contains only the essentials (`qname`, `name`, `className`, `type`, `priority`). |
| `palette-list` | Compact response (category, className, shortDescription, `describe.tool/arguments`). Pair with `palette-describe` for the heavy data. `limit`, `filter`, and pagination metadata follow the standard pattern. |
| `palette-describe` | Accepts `className` from `palette-list`. Returns entry metadata, `creationTemplate` (ready for `databaseobject-tree-apply` with `at=inside|before|after`), and property hints. |
| `tools/list` | The MCP catalog itself is paginated; send `_meta.nextCursor` from one response to fetch the next batch of tools. |

When more data remains, paginated responses expose `result.nextCursor`. Some
tools omit the field on the last page. Many tools also include a `summary` or
`total` field so LLMs can estimate the remaining items while keeping payloads
compact.

This keeps the API stateless and compliant with the JSON-RPC MCP guidelines while
reducing context usage.

### Shared infrastructure

| File(s)                                    | Purpose |
|--------------------------------------------|---------|
| `internal_json_schema.yaml`                | Build JSON Schema + sample payloads for tool inputs/outputs. |
| `internal_list_tools_info.yaml`, `mcp_tools_list.yaml` | Discover `tools_*` sequences and expose catalog to MCP clients. |
| `internal_studio_refresh.yaml`             | Refresh the Eclipse Project Explorer after mutations when Studio is present. |
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
- [x] `project-list-symbols` — Expose global symbols, project default symbols,
  and visible `${...}` references with scope/visibility for one project or all
  loaded projects.

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
