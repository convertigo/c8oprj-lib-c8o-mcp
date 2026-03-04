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
| `databaseobject-children`     | `tools_databaseobject_children.yaml`        | List database object children (or projects when `qname` is empty) with optional recursion via `depth` and ancestor-preserving filters. |
| `databaseobject-create`       | `tools_databaseobject_create.yaml`          | Create a database object relative to another (inside / before / after). |
| `databaseobject-delete`       | `tools_databaseobject_delete.yaml`          | Delete a database object, optionally exporting and refreshing Studio. |
| `databaseobject-move`         | `tools_databaseobject_move.yaml`            | Move or reorder a database object with Studio refresh support. |
| `databaseobject-rename`       | `tools_databaseobject_rename.yaml`          | Rename a database object and optionally refactor references. |
| `databaseobject-properties-get` | `tools_databaseobject_properties_get.yaml` | Retrieve metadata + values for a database object. Payload is compact by default; pass `includeHints=true` to re-enable long descriptions and boolean flags. |
| `databaseobject-properties-set` | `tools_databaseobject_properties_set.yaml` | Update properties (including XMLizable / SmartType handling). |
| `marketplace-list`              | `tools_marketplace_list.yaml`              | List marketplace libraries, mark workspace/reference state, and include exposed shared components/actions when loaded. |
| `marketplace-import`            | `tools_marketplace_import.yaml`            | Import a marketplace library when missing and ensure a `ProjectSchemaReference` is present on the target project. |
| `palette-list`                | `tools_palette_list.yaml`                   |  Lightweight catalog of creatable objects (name, class, summaries, describe hints). NGX targets include Studio-compatible dynamic entries (Ionic palette items). Supports `includeBuiltIn` / `includeShared` toggles (both default `true`). |
| `palette-describe`            | `tools_palette_describe.yaml`               | Detailed description of a specific palette entry (creation template, property hints). |
| `project-js-get`              | `tools_project_js_get.yaml`                 | Read a helper script in the project `js/` directory. |
| `project-js-set`              | `tools_project_js_set.yaml`                 | Create or update a helper script in the project `js/` directory. |
| `project-execute`            | `tools_project_execute.yaml`                | Launch (or skip launch) a project mobile builder in Studio, wait initial build, and return npm/build log summary/errors from Studio logs. |
| `project-save`                | `tools_project_save.yaml`                   | Export a project to disk immediately and report save status/errors. |
| `project-reload`              | `tools_project_reload.yaml`                 | Reload a project from disk, discarding unsaved changes in memory. |
| `rag-query`                   | `tools_rag_query.yaml`                      | Query the Convertigo RAG/knowledge base when usage is uncertain; expect slow responses (typically 30-60 seconds). |
| `requestable-execute`         | `tools_requestable_execute.yaml`            | Execute a sequence/transaction internally and return its payload for inspection. |
| `yaml-lint`                  | `tools_yaml_lint.yaml`                      | Run Convertigo YAML dialect lint (`c8o_yaml_lint.py`) on a project root or selected YAML paths. |
| databaseobject-schema       | 	ools_databaseobject_schema.yaml          | Return a minimal schema/sample for a requestable or request node (	ype=xml|json|jsonschema; internal=true for sourceDefinition view). |

| `databaseobject-search`       | `tools_databaseobject_search.yaml`          | Search database objects via substring/regex matching on YAML content; output now reports `scanned`, `returned`, `hasMore`, `nextCursor`, and a lean `matches[]`. |

### Pagination helpers

Many tools accept a `limit` argument (declared as a string in the schema for
compatibility with Convertigo requestable variables) and expose pagination
metadata in their result. Forward the `nextCursor` token via `_meta.nextCursor`
between requests to stream the remaining entries.

| Tool name | Notes |
|-----------|-------|
| `project-list` | Supports `limit`; response includes `summary.total`, `summary.timestamp`, and `nextCursor`. |
| `databaseobject-children` | Reports `total` + `nextCursor` and, when `depth > 1`, embeds nested `children` arrays for the filtered subset. |
| `databaseobject-properties-get` | Use `properties` or `filter` together with `limit`; `nextCursor` continues the property list. |
| `databaseobject-search` | Returns `scanned`, `returned`, `hasMore`, and `nextCursor` at the root; `matches[]` contains only the essentials (`qname`, `name`, `className`, `type`, `priority`). |
| `palette-list` | Compact response (category, className, shortDescription, `describe.tool/arguments`). Pair with `palette-describe` for the heavy data. `limit`, `filter`, and pagination metadata follow the standard pattern. |
| `palette-describe` | Accepts `className` from `palette-list`. Returns the entry metadata, `creationTemplate` (ready for `databaseobject-create`), and `propertyHints` (name, type, default/example, flags). |
| `tools/list` | The MCP catalog itself is paginated; send `_meta.nextCursor` from one response to fetch the next batch of tools. |

All paginated responses emit `result.nextCursor` (empty string when finished). Most
tools also include a `summary` or `total` field so LLMs can estimate the remaining
items while keeping payloads compact.

This keeps the API stateless and compliant with the JSON-RPC MCP guidelines while
reducing context usage.

### Shared infrastructure

| File(s)                                    | Purpose |
|--------------------------------------------|---------|
| `internal_json_schema.yaml`                | Build JSON Schema + sample payloads for tool inputs/outputs. |
| `internal_list_tools_info.yaml`, `mcp_tools_list.yaml` | Discover `tools_*` sequences and expose catalog to MCP clients. |
| `internal_studio_refresh.yaml`             | Refresh the Eclipse Project Explorer after mutations when Studio is present. |
| `js/databaseobject.js`, `js/databaseobject_ops.js`, `js/marketplace.js`, `js/util.js`, `js/xmlizable.js` | Shared Rhino helpers for parsing JSON, marketplace integration, and object mutations. |

## Backlog

The following tools adopt the same naming style (category prefix + hyphenated
action). When a future tool reuses existing `databaseobject-*` helpers this is
noted in the description.

### Meta / introspection
- [ ] `meta-describe-object` — Optional lightweight descriptor returning only
  high-level metadata (type, parent, enabled, comment). We may reuse
  `databaseobject-properties-get` if consumers accept the richer output.
- [ ] `meta-filter` — Common filtering helper used by several tools (`project-list`,
  `databaseobject-children`, `databaseobject-properties-get`, `palette-list`) to perform
  case-insensitive search on names/comments.

### Project discovery
- [ ] `project-describe-tree` — Breadth-limited traversal of part of a project
  to understand overall structure (reuses `databaseobject-children` under the hood).
- [ ] `project-fetch-source` — Retrieve the serialized YAML (and checksum) for a
  database object identified by QName.
- [ ] `project-search` — Search database objects by name/comment and optionally
  smart-source fragments.
- [ ] `project-list-symbols` — Expose symbol/environment definitions with their
  scope/visibility.

### Database object authoring / mutations
- [ ] `databaseobject-ensure-sequence` — Ensure a sequence scaffold exists with
  desired metadata (likely wrapping `databaseobject-create` + properties set).
- [ ] `databaseobject-add-step` — Append a child step using a palette template
  below a parent path.
- [ ] `databaseobject-update-property` — Convenience wrapper around
  `databaseobject-properties-set` for single-property edits.
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
