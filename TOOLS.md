# Convertigo MCP tools

This document tracks the MCP tools currently exposed by the
`ConvertigoMCP` project and lists the next tools we plan to build. The tool
names shown here are the exact identifiers returned by `tools/list`
(lowercase, category prefix, hyphen separator). Each tool is implemented by a
Convertigo sequence stored in `_c8oProject/sequences/tools_<category>_<action>.yaml`.

## Delivered tools

| Tool name                     | Sequence file                               | Summary |
|-------------------------------|---------------------------------------------|---------|
| `admin-list-projects`         | `tools_admin_list_projects.yaml`            | List installed projects with metadata (templates, versions, exports…). |
| `databaseobject-children`     | `tools_databaseobject_children.yaml`        | List direct children for a database object (or projects when `qname` is empty). |
| `databaseobject-create`       | `tools_databaseobject_create.yaml`          | Create a database object relative to another (inside / before / after). |
| `databaseobject-delete`       | `tools_databaseobject_delete.yaml`          | Delete a database object, optionally exporting and refreshing Studio. |
| `databaseobject-move`         | `tools_databaseobject_move.yaml`            | Move or reorder a database object with Studio refresh support. |
| `databaseobject-rename`       | `tools_databaseobject_rename.yaml`          | Rename a database object and optionally refactor references. |
| `databaseobject-properties-get` | `tools_databaseobject_properties_get.yaml` | Retrieve metadata, property descriptors, smart-type previews, schema. |
| `databaseobject-properties-set` | `tools_databaseobject_properties_set.yaml` | Update properties (including XMLizable / SmartType handling). |
| `palette-list`                | `tools_palette_list.yaml`                   | Enumerate creatable database-object templates for a parent or root. |
| `project-js-get`              | `tools_project_js_get.yaml`                 | Read a helper script in the project `js/` directory. |
| `project-js-set`              | `tools_project_js_set.yaml`                 | Create or update a helper script in the project `js/` directory. |
| `project-save`                | `tools_project_save.yaml`                   | Export a project to disk immediately and report save status/errors. |
| `project-reload`              | `tools_project_reload.yaml`                 | Reload a project from disk, discarding unsaved changes in memory. |
| `databaseobject-search`       | `tools_databaseobject_search.yaml`          | Search database objects via substring/regex matching on YAML content with optional type filters. |

### Pagination helpers

Many tools accept a `limit` argument (declared as a string in the schema for
compatibility with Convertigo requestable variables) and expose pagination
metadata in their result. Forward the `nextCursor` token via `_meta.nextCursor`
between requests to stream the remaining entries.

| Tool name | Notes |
|-----------|-------|
| `admin-list-projects` | Supports `limit`; response includes `summary.total`, `summary.timestamp`, and `nextCursor`. |
| `databaseobject-children` | `query.startIndex`, `query.limit`, `query.returned`, `query.hasMore`, and `nextCursor` describe each slice. |
| `databaseobject-properties-get` | Use `properties` or `filter` together with `limit`; `nextCursor` continues the property list. |
| `databaseobject-search` | Returns `query` metadata plus a `nextCursor` token when more matches exist. |
| `palette-list` | `limit` bounds the number of templates; `query.startIndex`, `query.limit`, `query.returned`, and `nextCursor` mirror MCP expectations. |
| `tools/list` | The MCP catalog itself is paginated; send `_meta.nextCursor` from one response to fetch the next batch of tools. |

All paginated responses emit:

- `result.query` — includes the original cursor, start index, requested limit,
  returned count, and total match count.
- `result.nextCursor` — empty string when there is nothing more to fetch.

This keeps the API stateless and compliant with the JSON-RPC MCP guidelines.

### Shared infrastructure

| File(s)                                    | Purpose |
|--------------------------------------------|---------|
| `internal_json_schema.yaml`                | Build JSON Schema + sample payloads for tool inputs/outputs. |
| `internal_list_tools_info.yaml`, `mcp_tools_list.yaml` | Discover `tools_*` sequences and expose catalog to MCP clients. |
| `internal_studio_refresh.yaml`             | Refresh the Eclipse Project Explorer after mutations when Studio is present. |
| `js/databaseobject.js`, `js/databaseobject_ops.js`, `js/util.js`, `js/xmlizable.js` | Shared Rhino helpers for parsing JSON, handling SmartType/XMLizable values, and performing mutations. |

## Backlog

The following tools adopt the same naming style (category prefix + hyphenated
action). When a future tool reuses existing `databaseobject-*` helpers this is
noted in the description.

### Meta / introspection
- [ ] `meta-describe-object` — Optional lightweight descriptor returning only
  high-level metadata (type, parent, enabled, comment). We may reuse
  `databaseobject-properties-get` if consumers accept the richer output.
- [ ] `meta-filter` — Common filtering helper used by several tools (`admin-list-projects`,
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
- [ ] `invoke-requestable` — Execute a sequence/transaction with input
  variables, return payload, status, and logs.
- [ ] `invoke-run-testcase` — Trigger a TestCase and report assertion results.
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
