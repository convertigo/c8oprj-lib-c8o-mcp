# Convertigo MCP Tools

> Refreshed by `_refreshMaintainerDocs` from the live MCP catalog on `{{reviewDate}}` (`mcp_initialize`, `mcp_tools_list`, `mcp_resources_list`, `mcp_prompts_list`).

## Live Snapshot

- Server version: `{{serverVersion}}`
- Tools: `{{toolCount}}`
- Resources: `{{resourceCount}}`
- Prompts: `{{promptCount}}`

Use the live MCP catalog as truth:

1. `tools/list`
2. `resources/list`
3. `prompts/list`

This file is a short generated companion for maintainers and reviewers.

## Fresh Session Discovery Order

1. `resources/list`
2. `prompts/list`
3. `convertigo://capabilities`
4. `convertigo://recipes/quickstart`
5. `convertigo://resources/convertigo-start`
6. then only the fast path or exploratory path

For a new CRUD UI project, the current public rail is:

1. `marketplace-import`
2. `mobile-builder-open`
3. `upsert-crud`
4. backend `crud-proof`
5. `upsert-ngx-crud-kit stage=bootstrap`
6. `mobile-builder-open`
7. `upsert-ngx-crud-kit stage=final`
8. final `crud-proof(viewerUrl)`
9. `project-save`

## Tools

{{toolTable}}

## Resources

{{resourceTable}}

## Prompts

{{promptTable}}
