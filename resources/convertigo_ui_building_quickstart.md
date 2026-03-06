# Convertigo UI Building Quickstart (CRUD + Rich Pages)

Use this guide to implement or update NGX UI through MCP only.

## Scope
- Build functional pages (table/card/list/forms) with loading/empty/error states.
- Keep updates idempotent: update existing nodes when present, create only when missing.

## Canonical MCP pattern
1. Inspect target tree with `project-list` + `databaseobject-tree-get`.
2. Discover available UI entries with `palette-list`.
3. Get one entry template/details with `palette-describe`.
4. Build one mutation plan (create/update/move/delete) before writes.
5. Execute writes with `databaseobject-tree-apply` or `batch-call`.
6. Validate behavior with `requestable-execute` and a final `tree-get` pass.
7. Persist with `project-save`.

## NGX component safety
- Use palette-driven logical class names for dynamic components (example: `ngx.components.UIDynamicElement#Button`).
- Do not create palette widgets from raw tag guesses.
- Keep Fragment (`ngx.components.UICustom`) as last resort only, and document why.

## Fast execution mode
- Discovery phase: read-only calls (`tree-get`, `palette-list`, `palette-describe`).
- Execution phase: write-only calls from the precomputed plan.
- Verification phase: minimal final checks + save.

## Performance rules
- Precompute the full plan before first write.
- Group independent writes in one `batch-call`.
- Keep dependent operations sequential.
- Avoid read-after-write loops on each object.
- Use one final verification sweep instead of many intermediate checks.

## Styling rules
- Prefer global-first CSS.
- Use app-level style objects for shared visual rules.
- Add page-specific style only when necessary.
- Keep mobile readability and spacing consistent.
