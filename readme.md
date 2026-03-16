# ConvertigoMCP

Convertigo MCP project for AI-assisted fullstack Convertigo development.

The recommended public path is now a mono-agent MCP flow for deterministic SQL CRUD + starter NGX UI work.
Use the MCP directly, prefer the dedicated CRUD fast path, and keep multi-agent / benchmark / maintainer flows as internal lab surfaces until the mono-agent rail is proven stable.

For technical details, see [documentation](./project.md).

## Local Onboarding

1. Import the project in Convertigo Studio.
2. Run the private sequence `_setupCodex` once from Studio.
3. Restart Codex so the generated `convertigo-generalist` skill is loaded and `~/.codex/config.toml` contains the local `convertigo` MCP server entry.

`_setupCodex` is a Studio-local helper. It is not part of the public MCP tool surface.

## Recommended Flow

1. Start from the CRUD fast path prompt and guide:
   - `convertigo-crud-fastpath`
   - `convertigo://resources/convertigo-crud-fastpath`
   - on a fresh session, call `resources/list` first and `prompts/list` when the caller surface exposes it
2. Provide one explicit CRUD spec:
   - project, using the exact requested name without invented prefixes or date suffixes
   - SQL driver family
   - connector name
   - facade prefix
   - entities
   - visible entry page
3. Execute the deterministic rail:
   - `marketplace-import` with the exact requested project name
   - `mobile-builder-open`
   - use `viewerHomeUrl` or `viewerBaseUrl` for the live dev app; reserve `DisplayObjects/mobile/home` for production builds
   - `upsert-crud`
   - backend `crud-proof`
   - `upsert-ngx-crud-kit stage=bootstrap`
   - `mobile-builder-open` again to surface `compile_error` if the live app does not compile
   - `upsert-ngx-crud-kit stage=final`
   - final `crud-proof` with the returned `viewerUrl`
   - `project-save`
4. Never patch `_private/ionic`, `DisplayObjects`, `dist`, or other generated frontend artifacts. They are diagnostic only; fix the Convertigo source objects or the MCP generator instead.

## Internal Lab Surfaces

These remain available for observability and experiments, but are not the recommended product path during the mono-agent recovery cycle:

- benchmark campaigns under `tests/`
- feedback triage under `feedback/`
- maintainer / critic improvement loops
- multi-agent wrapper experiments in companion repositories

## Installation

1. In Convertigo Studio, import the project from Git.
2. Use the project remote URL:

   ```
   ConvertigoMCP=git@github.com:convertigo/c8oprj-c8o-mcp.git:branch=codex
   ```

3. Finish the import wizard.

## Rest Web Service

### `/mcp` and `/mcp/`

Streamable HTTP entry points for MCP JSON-RPC requests.

Parameters:

- `jsonOnly`
- `request`: JSON-RPC request body
