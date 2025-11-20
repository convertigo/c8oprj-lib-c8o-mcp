# Convertigo MCP Usage Guide

This resource explains the conventions that MCP clients should follow when they interact with the Convertigo endpoint.

## HTTP Endpoints
- **MCP JSON-RPC**: `http://localhost:18080/convertigo/api/mcp`
- **Sequence invocation** (manual test): `http://localhost:18080/convertigo/projects/<project>/.json?__sequence=<name>&var=value`
  - Always include `MCP-Protocol-Version: 2025-06-18` when targeting the MCP endpoint.

## Tooling Conventions
- Prefer MCP tools instead of editing YAML directly:
  - `databaseobject-create` / `-delete` / `-move` / `-rename`
  - `databaseobject-properties-get` / `-set`
  - `project-save` / `project-reload`
- Palette workflow:
  - See `convertigo_json_quickref` for a one-page cheat sheet on JsonObject/JsonArray/iterator patterns and step ordering.\r\n  - `palette-list` now returns only the essentials (`name`, `className`, `shortDescription`, `nameSuggestion`, `propertyCount`, `describeClassName`). Use `describeClassName` with `palette-describe` to retrieve the full template.
  - The shared `hints.describe` block reminds you to call `palette-describe` with that `describeClassName` instead of relying on per-item instructions.
  - `palette-describe` emits a compact object (`entry`, `template`, `propertyHints`). Each hint includes `scriptable`, `multiline`, and `nillable` flags (true/false) when applicable so you can configure properties accurately.
  - Each `propertyHints[]` entry also exposes `llmHint` when a property is tricky (SmartType arrays, XMLVector sources). Always read it before mutating properties.
- Tree navigation via `databaseobject-children`:
  - Accepts `depth` (1-5, default 1). When `depth > 1`, each item may expose a nested `children` array.
  - Filters (`filter` variable) run after traversal; a node stays visible if it matches itself or any descendant matches.
  - Pagination combines with recursion: `limit` applies to the top-level nodes, `nextCursor` resumes from the same level.
  - Example MCP call:
    ```bash
    tools/call convertigo.databaseobject-children '{"qname":"ConvertigoMCP","depth":"2","filter":"Copy","limit":"5"}'
    ```
    Always forward `_meta.nextCursor` when the response returns a non-empty `nextCursor` field. QNames are case-sensitive; if you hit "QName not found", call `databaseobject-children` on the parent project (no `.sq`) to copy the exact casing before retrying.
- For `databaseobject-create`, always specify:
  - `qname`: parent object (e.g., `codex_tooling.sq:hash_sha256`)
  - `className`: short bean class name (Convertigo auto-prefixes `com.twinsoft.convertigo.beans.`), e.g., `variables.RequestableVariable`
  - `mode`: `inside`, `before`, `after`, or `lastChild`
  - `properties`: JSON object with the properties to override (booleans without quotes, e.g., `{ "required": true }`)
- `databaseobject-properties-set` follows the same rule: `properties` **must** be a JSON object such as `{"comment":"Write here","output":true}` (or a JSON string representing that object). Never send an array of `{name,value}` entries. When a property needs a special structure (SmartType, XMLVector, etc.), call `palette-describe` or `databaseobject-properties-get` with `includeHints=true` first.
- `databaseobject-properties-get` returns a lightweight view by default (name, title, type, current value). Call it with `includeHints=true` if you also need the verbose descriptions, option lists, and the `llmHint` guidance we provide for tricky properties (e.g., SmartType sources).
- After mutating objects, call `project-save` (or set `autoSave=true`) so the YAML export stays in sync.
- QNames are **case-sensitive** and must not include the `.sq` suffix. If you get a QName error, retry with the project name only (no suffix) via `databaseobject-children` to grab the exact casing, then reuse that QName.

## Testing & Verification
- Start with `requestable-execute`. Example (note the JSON escaping):
  ```bash
  codex exec \
    --config 'mcp.servers.convertigo.type="http"' \
    --config 'mcp.servers.convertigo.url="http://localhost:18080/convertigo/api/mcp"' \
    --config 'sandbox=workspace-write' \
    --config 'ask-for-approval=never' \
    tools/call convertigo.requestable-execute '{"requestable":"codex_tooling.analyze_sentence","variables":"{\"sentence\":\"Hello world!\"}"}'
  ```
- `variables` must always be a JSON string representing a key/value object (never a query string).
- HTTP tests (`curl .../.json`) are **optional** — run one only if the user explicitly asks **and** you are sure `localhost:18080` is reachable. When you do, follow this pattern:
  ```bash
  curl -s "http://localhost:18080/convertigo/projects/codex_tooling/.json?__sequence=hash_sha256&text=hello"
  ```
- Keep an eye on the engine log: `/Users/nicolas/dev/convertigo/runtime-ConvertigoStudio/.metadata/.plugins/com.twinsoft.convertigo.studio/logs/engine.log`.

## Run Checklist (before / during / after)
1. **Discover context**: call `resources/list` and read `convertigo-overview`, `convertigo-mcp-usage`, `convertigo_sequence_quickstart`, and `convertigo_context_api`.
2. **Plan**: outline the MCP calls (`palette-list` -> `palette-describe` -> `databaseobject-create` -> `databaseobject-properties-set` -> `project-save` -> test).
3. **Create a skeleton**: create the sequence, add variables plus a stub JSON response, and test immediately via `requestable-execute`.
4. **Iterate**: after each edit, save (autoSave or `project-save`) and rerun `requestable-execute` to catch mistakes early.
5. **Store data safely**: keep temporary arrays in JS locals or official storages (`project`, `server`, `context.httpSession`). Never add custom fields to `context`.
6. **Final validation**: capture the final `requestable-execute` output (and, if explicitly requested, the matching curl) and note which parameters you used.
7. **Cleanup**: remove exploratory sequences/steps via the MCP tools once the goal is met.

Expose this document to LLM clients via `resources/list`/`resources/read` so they can discover the good practices before mutating the project.

\n


