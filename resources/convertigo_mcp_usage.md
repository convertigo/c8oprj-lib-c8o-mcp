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
- For `databaseobject-create`, always specify:
  - `qname`: parent object (e.g., `codex_tooling.sq:hash_sha256`)
  - `className`: fully-qualified Java class (e.g., `com.twinsoft.convertigo.beans.variables.RequestableVariable`)
  - `mode`: `inside`, `before`, `after`, or `lastChild`
  - `properties`: JSON object with the properties to override (booleans without quotes, e.g., `{ "required": true }`)
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
- N'exécute un curl `.json` sur le port **18080** qu'après un test MCP concluant **et** uniquement si le serveur Convertigo est accessible.
- A typical validation for the new `hash_sha256` sequence is:
  ```bash
  curl -s "http://localhost:18080/convertigo/projects/codex_tooling/.json?__sequence=hash_sha256&text=hello"
  ```
- Keep an eye on the engine log: `/Users/nicolas/dev/convertigo/runtime-ConvertigoStudio/.metadata/.plugins/com.twinsoft.convertigo.studio/logs/engine.log`.

## Run Checklist (before / during / after)
1. **Discover context**: call `resources/list` and read `convertigo-overview`, `convertigo-mcp-usage`, and `convertigo-context-api`.
2. **Plan**: outline the MCP calls (`palette-list` → `databaseobject-create` → `databaseobject-properties-set` → `project-save` → test).
3. **Create a skeleton**: create the sequence, add variables + a stub JSON response, and test immediately via `.json`.
4. **Iterate**: after each edit, save (autoSave or `project-save`) and rerun the curl test to catch mistakes early.
5. **Store data safely**: keep temporary arrays in JS locals or official storages (`project`, `server`, `context.httpSession`). Never add custom fields to `context`.
6. **Final validation**: capture the final curl output with `| tee` and mention the exact URL/params in your response.
7. **Cleanup**: remove exploratory sequences/steps via the MCP tools once the goal is met.

Expose this document to LLM clients via `resources/list`/`resources/read` so they can discover the good practices before mutating the project.
