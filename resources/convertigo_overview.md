# Convertigo MCP Project Overview

This document summarizes the structure of the `ConvertigoMCP` project that powers the Model Context Protocol endpoint.

## Entry Points
- `mcp_endpoint` is the only public sequence exposed through the HTTP endpoint `/convertigo/api/mcp`.
- Each MCP method (`initialize`, `tools/list`, `tools/call`, `prompts/*`, …) is implemented by a dedicated internal sequence (`mcp_*`).
- Tool-facing sequences follow the naming convention `tools_<category>_<action>` and are discovered automatically through `internal_list_tools_info`.

## Source Layout
- `_c8oProject/sequences/**/*.yaml` — serialized Convertigo sequences (exported whenever `autoSave` is true).
- `js/*.js` — shared Rhino helper files loaded via `include()`. They encapsulate database-object plumbing, XMLizable helpers, and MCP endpoint routing.
- `prompts/` — Markdown prompts served via `prompts/list` & `prompts/call`.
- `resources/` — Markdown or JSON resources exposed through `resources/list` & `resources/read`.

## Tools Already Implemented
- Project & tree inspection: `admin-list-projects`, `databaseobject-children`, `databaseobject-search`.
- CRUD helpers: `databaseobject-create|delete|move|rename`, `databaseobject-properties-get|set`.
- Palette discovery: `palette-list`.
- Project lifecycle: `project-save`, `project-reload`, `project-js-get`, `project-js-set`.

## Adding New Functionality
1. Create helpers under `js/` and load them via `include()` inside sequences (never embed large Rhino scripts inline).
2. Create sequences with the `tools_databaseobject_create` MCP tool so that Studio metadata remains consistent.
3. Call `project-save` (or use `autoSave=true`) after each change so YAML exports stay synchronized.
4. Update `TOOLS.md` / `project.md` when exposing a new tool to keep the catalog aligned with what MCP clients discover.

Use the existing MCP tools to explore the tree (`databaseobject-search`, `databaseobject-properties-get`) if you need more detail about a specific sequence or helper.
