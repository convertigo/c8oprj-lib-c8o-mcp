# Convertigo MCP Quickstart

## What is Convertigo?
- Low-code / full-code platform built around *projects*. Each project contains **sequences** (workflow logic) and **database objects** (connectors, transactions, steps, UI components).
- Everything is stored in YAML files (`tools_<category>_<action>.yaml`) plus shared JS helpers under `js/`.

## Core concepts
- **Sequence**: executable unit composed of steps (SimpleStep, JsonFieldStep, IfStep, etc.). Each object has a `QName` like `Project.sq:sequence.st:Step`.
- **Steps** share a Rhino scope, so large scripts should be split into multiple SimpleStep blocks or externalized via `include("js/...")`.
- **DatabaseObject helpers**: use the existing MCP tools (`databaseobject-*`, `palette-list`, `project-save`) instead of editing YAML manually.

## MCP tooling workflow
1. `tools/list` → discover available tools (pagination via `limit` + `_meta.nextCursor`).
2. `tools/call` with the `name` returned above and a JSON `arguments` object. Most tools accept `limit`, `filter`, `_meta.nextCursor`, and `autoSave`.
3. Responses include `structuredContent` (ready-to-use JSON) and often `result.query` + `result.nextCursor` for pagination.
4. Always honor `autoSave` flags (default `true`). Use `project-save` / `project-reload` tools to persist or discard changes intentionally.

## Coding guidelines
- Prefer calling MCP tools to create/mutate objects (`databaseobject-create`, `databaseobject-properties-set`, etc.). Do **not** edit YAML directly in production.
- When you need scripts, put shared logic into `js/*.js` and `include()` them; avoid multi-hundred-line Rhino blocks.
- When adding new tools, follow the naming convention `tools_<category>_<action>` → MCP name `category-action`.
- For paginated outputs, echo `result.query.*` and `result.nextCursor` so clients can keep iterating.

## Useful tools
| Tool | Purpose |
|------|---------|
| `admin-list-projects` | List projects + metadata. `limit` and `_meta.nextCursor` supported. |
| `databaseobject-children` | Browse the tree starting from a `qname`. |
| `databaseobject-properties-get` | Inspect properties (smart types, values, schema info). |
| `databaseobject-properties-set` | Update properties (handles SmartType, XMLizable). |
| `palette-list` | Discover creatable steps/components for a parent. |
| `project-js-get` / `project-js-set` | Manage helper JS files used via `include()`. |
| `project-save` / `project-reload` | Persist or reload a project. |
| `requestable-execute` | Run a sequence/transaction internally and inspect its response without HTTP. |
| `databaseobject-search` | Full-text/regex search across YAML definitions. |

## Best practices
- Keep responses concise but structured; LLM clients expect JSON arrays/objects matching the schema.
- When exposing a new tool, document it via a comment in the sequence (first line = title, rest = description).
- Test chaque séquence via `requestable-execute` avant d'imaginer un `curl` `.json`; ne passe en HTTP que si le test MCP réussit et que le serveur est joignable.
- Test each tool via `curl` (or MCP Inspector) and ensure pagination fields work.
- Leverage `internal_*` helpers (schema generation, tool introspection) instead of duplicating logic.

You can now explore `tools/list`, `palette-list`, and `databaseobject-*` to inspect or modify the current Convertigo project.
