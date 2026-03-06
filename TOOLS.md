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
| `project-save`                | `tools_project_save.yaml`                   | Export a project to disk immediately and report save status/errors. |
| `project-reload`              | `tools_project_reload.yaml`                 | Reload a project from disk, discarding unsaved changes in memory. |
| `rag-query`                   | `tools_rag_query.yaml`                      | Query the Convertigo RAG/knowledge base when usage is uncertain; expect slow responses (typically 30-60 seconds). |
| `requestable-execute`         | `tools_requestable_execute.yaml`            | Execute a sequence/transaction internally and return its payload for inspection (`includeLogs=true` appends execution logs). |
| `databaseobject-schema`       | `tools_databaseobject_schema.yaml`          | Return a minimal schema/sample for a requestable or request node (`type=xml|json|jsonschema`; `internal=true` for `sourceDefinition` view). |
| `databaseobject-search`       | `tools_databaseobject_search.yaml`          | Search database objects via substring/regex matching on YAML content; output now reports `scanned`, `returned`, `hasMore`, `nextCursor`, and a lean `matches[]`. |

## Built-in MCP resources

Use these first before long guide reads:

- `convertigo://capabilities` — condensed tool capabilities and authoring flow.
- `convertigo://recipes/quickstart` — minimal step-by-step recipes for fast delivery.

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

Notes:
- `marketplace-list` and `marketplace-import` are strict now: legacy aliases are rejected.
- `marketplace-import` enforces starter rename: when the selected entry is a starter, `importedProjectName` is required.
- `log-view` accepts `q/since/until` aliases to reduce verbosity in common calls.
- `batch-call` and tree mutation refs accept only object syntax (`{"$ref":"id.path"}`); `${{...}}` placeholders are rejected with an explicit error.

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
