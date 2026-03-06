# Convertigo MCP Project Overview

This document summarizes the `ConvertigoMCP` project that exposes the MCP endpoint.

## Entry points
- `mcp_endpoint` is the public sequence behind `/convertigo/api/mcp`.
- MCP methods (`initialize`, `tools/list`, `tools/call`, `resources/*`, `prompts/*`) are handled by dedicated internal sequences.
- Tool sequences follow `tools_<category>_<action>` and are discovered by `internal_list_tools_info`.

## Source layout
- `_c8oProject/sequences/**/*.yaml` - Convertigo sequences (engine export).
- `js/*.js` - shared Rhino helpers used by tool sequences.
- `resources/` - files exposed through `resources/list` and `resources/read`.
- `prompts/` - prompt files exposed through `prompts/list` and `prompts/call`.

## Canonical tool surface
- Inspection: `project-list`, `databaseobject-tree-get`, `databaseobject-search`.
- Mutation: `databaseobject-tree-apply`, `databaseobject-delete`, `databaseobject-move`, `databaseobject-rename`.
- Authoring helpers: `palette-list`, `palette-describe`, `databaseobject-schema`.
- Orchestration: `batch-call`.
- Validation/diagnostics: `requestable-execute`, `log-view`, `mobile-builder-open`.
- Project lifecycle: `project-save`, `project-reload`, `project-js-get`, `project-js-set`.
- Marketplace: `marketplace-list`, `marketplace-import`.

## Contributor rules
1. Keep MCP behavior tool-first; do not rely on direct YAML edits.
2. Reuse shared JS helpers for parsing, normalization, and mutation finalization.
3. Update `TOOLS.md` and resource docs when tool behavior changes.
4. Keep tool comments in English and focused on accepted formats/defaults/side effects.
