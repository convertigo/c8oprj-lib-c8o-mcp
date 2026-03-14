# ConvertigoMCP

Convertigo MCP project for AI-assisted fullstack Convertigo development.

The recommended public path is now a mono-agent MCP flow for deterministic SQL CRUD + starter NGX UI work.
Use the MCP directly, prefer the dedicated CRUD fast path, and keep multi-agent / benchmark / maintainer flows as internal lab surfaces until the mono-agent rail is proven stable.

For technical details, see [documentation](./project.md).

## Recommended Flow

1. Start from the CRUD fast path prompt and guide:
   - `convertigo-crud-fastpath`
   - `convertigo://resources/convertigo-crud-fastpath`
2. Provide one explicit CRUD spec:
   - project
   - SQL driver family
   - connector name
   - facade prefix
   - entities
   - visible entry page
3. Execute the deterministic rail:
   - `upsert-crud`
   - `crud-proof`
   - `upsert-ngx-crud-kit`
   - `crud-proof`
   - `project-save`

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
