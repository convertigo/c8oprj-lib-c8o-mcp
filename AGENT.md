# Convertigo MCP — Agent Briefing

## Mission Overview
ConvertigoMCP exposes the Convertigo platform through the Model Context Protocol (MCP) so that AI copilots can inspect, monitor, and (eventually) modify Convertigo projects in a safe, schema-driven way.  
Your role is to extend / maintain the low-level Convertigo sequences and REST mappings that power the MCP wrapper sequence (`McpEndpoint`). Another Codex agent orchestrates the high-level MCP contract, so keep the primitives here well-factored and reusable.

The current deployment targets Convertigo 8.3.9 running inside the repository’s Docker Compose stack.

## Project Layout
```
data/workspace/projects/ConvertigoMCP/
├─ _c8oProject/           # Convertigo project definition (do NOT edit manually)
│   ├─ sequences/         # YAML exports of each sequence
│   ├─ urlMapper/         # REST mappings (ApiMcp.yaml) used by MCP
│   └─ connectors/...     # Placeholder (void connector)
├─ c8oProject.yaml        # Project manifest
├─ ConvertigoMCP.xsd      # Generated schema
└─ AGENT.md               # This file
```

Important sequences:
- `McpEndpoint` – JSON-RPC entry point that validates requests, routes to sub-sequences, and emits HTTP responses.
- `McpInitialize`, `McpToolsList`, `McpToolsCall`, `McpPing`, `McpResourcesList`, `McpPromptsList`, etc. – handlers for individual MCP methods.
- `McpErrorResponse` / `McpMethodNotFound` – shared error emitters.

All sequences live under `_c8oProject/sequences/*.yaml`. Modify them through Rhino scripts executed with the `ConvertigoCodexAgent` project (`POST /convertigo/api/exec`) or by using the Convertigo Studio UI, then export the project to persist changes.

## Execution & Tooling
- **Docker stack**: run from the repo root  
  ```bash
  docker compose up -d
  docker compose logs -f convertigo_0
  ```
- **Server URL**: `http://localhost:28080/convertigo`
- **Privileged scripting**: `POST http://localhost:28080/convertigo/api/exec` with raw JavaScript body; sequence `ConvertigoCodexAgent.EXEC` evaluates it server-side.
- **MCP endpoint**: `POST http://localhost:28080/convertigo/api/mcp`
- **Logs**: `data/workspace/logs/0/engine.log`
- **Manual testing**: use `curl` to hit `initialize`, `tools/list`, `tools/call`, etc., always setting `MCP-Protocol-Version: 2025-06-18` after the handshake.

## Development Workflow
1. **Plan** the new primitive (sequence, step, or mapping) required by the MCP contract.
2. **Implement** with Rhino scripts or the Studio, keeping steps small and composable.
3. **Normalize responses** so `McpEndpoint` always emits objects that match JSON-RPC 2.0 and MCP requirements (no nested `result.result`, every `error` containing `code` & `message`).
4. **Export** the project:  
   ```javascript
   var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
   var proj = Engine.theApp.databaseObjectsManager.getOriginalProjectByName("ConvertigoMCP");
   Engine.theApp.databaseObjectsManager.exportProject(proj);
   ```
5. **Commit** inside `data/workspace/projects/ConvertigoMCP` (this directory is a Git submodule/repo) and push to the shared branch.

### Coding Guidelines
- Prefer dedicated helper sequences for reusable logic; call them from `McpEndpoint` via `SequenceStep`.
- Keep HTTP headers, status codes, and JSON-RPC envelope logic centralized in `McpEndpoint`.
- Avoid direct edits to `_c8oProject/**/*.yaml` with a text editor; always regenerate via Convertigo tooling.
- Use comments sparingly—Convertigo exports are verbose already.
- Validate JSON handling in Rhino (defensive `try/catch` when parsing).

## Documentation & References
- MCP Specification (2025-06-18): https://modelcontextprotocol.io/specification/2025-06-18  
- MCP Inspector tool: https://modelcontextprotocol.io/docs/tools/inspector  
- Convertigo Platform docs: https://doc.convertigo.com/  
- Convertigo 8.3.9 sources (local clone recommended): `~/git/convertigo`  
- Convertigo Codex helper project (privileged EXEC): `data/workspace/projects/ConvertigoCodexAgent/`

## Roadmap
- [x] Export MCP entry point (`McpEndpoint`) with routing to initialize, tools, resources, prompts, notifications, ping.
- [x] Provide initial `tools/list` for admin/project/invoke categories.
- [x] Expose baseline `tools/call` functions (`admin.get-engine-version`, `admin.get-engine-metrics`, `project.describe-tree`, `invoke.list-projects`).
- [ ] Normalize all helper sequences to emit plain payload objects (no nested envelopes); ensure JSON-RPC compliance end-to-end.
- [ ] Implement error/status propagation without relying on stale Convertigo `SetResponseStatusStep` artefacts.
- [ ] Flesh out monitoring tools (thread dump, cache management, log access).
- [ ] Add project mutation helpers (property editing, controlled sequence updates) once server-side guards are ready.
- [ ] Introduce cross-project invocation utilities with robust input validation and result streaming.
- [ ] Document regression tests / automated curls to validate MCP contract after each change.

## Testing Checklist
- `initialize` responds 200 with protocol info, no nested `result.result`.
- `tools/list` paginates across `admin → project → invoke`; invalid cursors return JSON-RPC error -32602.
- `tools/call` handles success and error cases:
  - Missing `name` ⇒ HTTP 400 JSON-RPC error -32602.
  - Unknown tool ⇒ 404 JSON-RPC error -32601.
  - Successful calls emit `result.content[...]` payloads matching the MCP spec.
- Engine log shows no uncaught Rhino exceptions (`engine.log` should stay clean).
- Project export diff is deterministic (only expected YAML changes).

## Coordination Notes
- Another Codex agent handles the higher-level MCP wrapper. Align interfaces before changing sequence signatures.
- When adding new tools, document the expected request/response shape so the wrapper can surface it through the MCP schema (input/output JSON Schema definitions).
- If you need environment changes (new Docker services, database access), coordinate with the repository maintainers before editing `docker-compose.yml`.

Stay disciplined with exports and testing—Convertigo’s XML/YAML structure is unforgiving if steps drift out of sync with the server.
