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
  - `palette-list` returns a compact catalog (name, class, summary) and already embeds `describe.tool` / `describe.arguments`.
  - Use the returned `describe` block (usually `{ "tool": "palette-describe", "arguments": { "className": ... } }`) instead of hard-coding class names.
  - `palette-describe` responds with `result.template` (creation payload) and `result.propertyHints` (per-property guidance) ready for `databaseobject-create` / `databaseobject-properties-set`.
- Tree navigation via `databaseobject-children`:
  - Accepts `depth` (1-5, default 1). When `depth > 1`, each item may expose a nested `children` array.
  - Filters (`filter` variable) run after traversal; a node stays visible if it matches itself or any descendant matches.
  - Pagination combines with recursion: `limit` applies to the top-level nodes, `nextCursor` resumes from the same level.
  - Example MCP call:
    ```bash
    tools/call convertigo.databaseobject-children '{"qname":"ConvertigoMCP","depth":"2","filter":"Copy","limit":"5"}'
    ```
    Always forward `_meta.nextCursor` when the response returns a non-empty `nextCursor` field.
- For `databaseobject-create`, always specify:
  - `qname`: parent object (e.g., `codex_tooling.sq:hash_sha256`)
  - `className`: fully-qualified Java class (e.g., `com.twinsoft.convertigo.beans.variables.RequestableVariable`)
  - `mode`: `inside`, `before`, `after`, or `lastChild`
  - `properties`: JSON object with the properties to override (booleans without quotes, e.g., `{ "required": true }`)
- `databaseobject-properties-get` returns a lightweight view by default (name, title, type, current value). When you really need the long HTML descriptions or to know whether `expert`, `readOnly`, etc. are false, call it with `includeHints=true`.
- After mutating objects, call `project-save` (or set `autoSave=true`) so the YAML export stays in sync.

## Testing & Verification
- Commence par `requestable-execute`. Exemple (note l'échappement JSON):
  ```bash
  codex exec \
    --config 'mcp.servers.convertigo.type="http"' \
    --config 'mcp.servers.convertigo.url="http://localhost:18080/convertigo/api/mcp"' \
    --config 'sandbox=workspace-write' \
    --config 'ask-for-approval=never' \
    tools/call convertigo.requestable-execute '{"requestable":"codex_tooling.analyze_sentence","variables":"{\"sentence\":\"Hello world!\"}"}'
  ```
  `variables` doit toujours être une chaîne JSON représentant un objet clé/valeur (pas un querystring).
- Les tests HTTP (`curl .../.json`) sont **optionnels** : n'en lance un que si l'utilisateur le demande explicitement **et** que tu es certain que `localhost:18080` est accessible. Dans ce cas, appuie-toi sur l’exemple suivant :
  ```bash
  curl -s "http://localhost:18080/convertigo/projects/codex_tooling/.json?__sequence=hash_sha256&text=hello"
  ```
- Keep an eye on the engine log: `/Users/nicolas/dev/convertigo/runtime-ConvertigoStudio/.metadata/.plugins/com.twinsoft.convertigo.studio/logs/engine.log`.

## Run Checklist (before / during / after)
1. **Discover context**: call `resources/list` and read `convertigo-overview`, `convertigo-mcp-usage`, and `convertigo-context-api`.
2. **Plan**: outline the MCP calls (`palette-list` → `palette-describe` → `databaseobject-create` → `databaseobject-properties-set` → `project-save` → test).
3. **Create a skeleton**: create the sequence, add variables + a stub JSON response, et teste immédiatement via `requestable-execute`.
4. **Iterate**: after each edit, save (autoSave or `project-save`) and rerun `requestable-execute` to catch mistakes early.
5. **Store data safely**: keep temporary arrays in JS locals or official storages (`project`, `server`, `context.httpSession`). Never add custom fields to `context`.
6. **Final validation**: capture the final `requestable-execute` output (et, si vraiment demandé, le curl associé) pour ton rapport en précisant les paramètres utilisés.
7. **Cleanup**: remove exploratory sequences/steps via the MCP tools once the goal is met.

Expose this document to LLM clients via `resources/list`/`resources/read` so they can discover the good practices before mutating the project.
