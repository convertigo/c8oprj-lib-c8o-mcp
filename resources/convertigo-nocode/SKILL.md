---
name: convertigo-nocode
description: Use for Convertigo No Code Studio / C8Oforms work that must stay inside the Convertigo MCP no-code tools for forms and Baserow catalog discovery. Strictly forbids low-code, project, CRUD, mobile-builder, database-object, source-file, shell, and generated-artifact edits; only the no-code tools and log viewer may be used.
---

# Convertigo No-Code Only

Use this skill for Convertigo No Code Studio / C8Oforms tasks where the user wants MCP work restricted to no-code tooling.

The core rule is simple: stay on the no-code form rail. Do not use Convertigo low-code tools to compensate for missing no-code capability.

## No-Code Authentication

No-code create, edit/update, and Baserow catalog operations require the authenticated No Code Studio user.

- In the integrated C8Oforms assistant, authentication is provided automatically by the host application and the MCP bearer session. Do not ask the user to copy or paste a token.
- Never print, summarize, request, store in generated form content, or expose the bearer token. Treat authentication as an invisible MCP capability.
- If a compatibility schema still exposes a `token` argument, pass an empty string. The actual credential is supplied out-of-band by MCP bearer authentication.
- Call `nocode-baserow-catalog-list`, `nocode-baserow-schema-apply`, `nocode-form-create`, `nocode-form-edit`, and `nocode-form-update` normally when the tool is available; the integration supplies the authentication context.
- If a protected no-code tool still returns `missing_token`, `invalid_token`, or `expired_token`, report that the No Code assistant authentication is not ready and ask the user to retry or reconnect. Do not switch to low-code tools as a workaround.
- Compilation and validation may be done without authentication when the tool permits it.

## Hard Tool Boundary

Allowed Convertigo MCP tools:

- `nocode-form-contract-get`
- `nocode-baserow-catalog-list`
- `nocode-baserow-schema-apply`
- `nocode-form-compile`
- `nocode-form-validate`
- `nocode-form-create`
- `nocode-form-edit`
- `nocode-form-update`
- `log-view`

`log-view` is diagnostic-only. Use it to inspect errors, validation failures, API failures, or runtime messages. Do not treat logs as permission to use low-code mutation tools.

Forbidden Convertigo MCP tools include, but are not limited to:

- Low-code database object tools such as `databaseobject-*`
- Sequence, transaction, connector, page, shared component, or source-object mutation tools
- CRUD tools such as `upsert-crud`, `upsert-ngx-crud-kit`, `crud-status`, and `crud-proof`
- Project administration or file tools such as `project-js-get`, `project-js-set`, `project-save`, `project-reload`, `project-delete`, and `marketplace-import`
- Mobile builder tools such as `mobile-builder-open`
- Batch wrappers such as `batch-call` when they would call anything outside the allowed list
- Local shell, filesystem, npm, frontend build, or generated artifact edits for Convertigo project repair

If the requested change cannot be completed with the allowed tools, stop and say exactly which no-code limitation blocks it. Offer the closest no-code-safe alternative if one exists.

## Workflow

1. Read the no-code contract with `nocode-form-contract-get`.
2. Build or patch only the reduced no-code form JSON unless the user explicitly provides a full form document for validation.
3. For new forms:
   - For app-like or multi-page forms, default to tab mode: set each page to `enabledTab=true`, `positionTab=bottom`, `positionButtons=tab`, and `enabledButtons=false` unless the user asks for another navigation style.
   - Assign a meaningful page `iconName` to every page by default. Prefer simple Ionic base icon names known to persist in C8Oforms tabs, such as `home`, `business`, `people`, `person`, `calendar`, `calendar-clear`, `list`, `document-text`, `receipt`, `settings`, `stats-chart`, and `search`. Avoid `*-outline` icon names unless the user explicitly requests them and the saved document confirms they render.
   - Add a modern, domain-appropriate `wallpaper` and matching `thumbnail` by default when the no-code form contract supports them. Prefer clean, professional visuals that do not reduce form readability; skip or simplify the background if it would distract from data entry.
   - Use multi-column layouts when the no-code contract supports them and the fields naturally group together. Prefer `layout` fields containing related child fields. Use 2 columns on desktop/tablet and collapse to 1 column on phones. Avoid cramped columns.
   - Use `nocode-form-compile` to convert the reduced JSON.
   - Use `nocode-form-validate` if you need an explicit validation pass or if compilation returns a full form needing checks.
   - Use `nocode-form-create` only through the integrated No Code Studio authentication context.
   - After `nocode-form-create`, inspect the returned saved `form.pages`. For app-like or multi-page forms, verify each page still has `enabledTab=true`, `positionTab=bottom`, `positionButtons=tab`, `enabledButtons=false`, a simple valid `iconName`, and known-good tab flags such as `checkMandatoryInCurrentPage=true` and `isNameDisplayed=false`.
   - If create/compile normalized those tab settings away, dropped tab flags, or persisted icon names that are unlikely to render, immediately call `nocode-form-update` with a minimal `pages` merge patch restoring the intended tab settings and simple icon names, preserving each page's `name`, `pageTechName`, `desc`, and `included`.
   - If the tab repair update is not possible through `nocode-form-update`, report the exact no-code limitation instead of leaving the app in default page-button navigation.
   - Also inspect the saved `wallpaper` and `thumbnail` when a polished background/thumbnail was intended. If create/compile normalized them to disabled placeholders and the no-code contract exposes a supported wallpaper/thumbnail shape, immediately repair them with `nocode-form-update`; otherwise report that the current no-code contract did not provide a persistable wallpaper/thumbnail shape.
4. For existing forms:
   - Prefer `nocode-form-edit` for semantic edits when the document id is known and the integrated No Code Studio authentication context is available.
   - Use `nocode-form-edit` for operations such as adding, moving, or removing no-code components, adding page navigation buttons, or updating fields without replacing whole arrays like `formulaire`, `pages`, or `flows`.
   - Use `nocode-form-update` with a JSON merge patch only for small document-level patches or when `nocode-form-edit` cannot express the requested semantic operation.
   - Keep edits minimal and no-code-semantic; do not patch internal generated details that the no-code contract or semantic edit tool does not expose.
5. For Baserow no-code catalog discovery:
   - Use `nocode-baserow-catalog-list` when the user asks to list or discover available No Code Baserow workspaces, bases, or tables for the current No Code user.
   - The tool uses the integrated No Code Studio authentication context.
   - Treat the returned `workspaces`, `bases`, `tables`, and `counts` as the discovery source of truth for selecting Baserow-backed no-code sources.
   - Never call Baserow HTTP APIs directly and never bypass `lib_BaseRow`; this catalog tool authenticates like the form tools and delegates discovery to `lib_BaseRow.formscommon_ApplicationsList`.
6. For Baserow no-code schema creation or updates:
   - Use `nocode-baserow-schema-apply` when the user asks to create or update No Code Baserow workspaces, bases, tables, fields, link-row relationships, lookup/reported fields, views, filters, or sample rows.
   - The tool takes `mode` (`plan` or `apply`), `create` permissions, and a canonical Baserow `schema`; authentication is supplied by the integrated No Code Studio context.
   - Agents may read any user-provided format, such as Markdown, JSON, YAML, CSV, diagrams, PDFs, or prose, but must translate it into the tool's strict canonical JSON before calling the tool.
   - Treat Baserow relationships as fields, not SQL foreign keys: use `type:"link_row"` with `targetTable`; use `type:"lookup"` with `through` and `targetField` for reported fields.
   - For repeatable sample data updates, set `tables[].upsertKey` to a stable business field such as `ordre`, `code`, or `reference`. The tool will read existing rows through `lib_BaseRow.TableGetData`, update matches through `lib_BaseRow.TableUpdateRow`, and create only missing rows.
   - Sample row keys are matched case-insensitively to real Baserow field names. It is acceptable to generate business keys like `nom` when the existing primary Baserow field is `Nom`.
   - When linking freshly inserted sample rows by numeric Baserow row ids, account for the two empty rows created automatically with new Baserow tables. In a fresh table, the first business sample row usually starts at row id `3`, not `1`; either read rows first when a no-code row-read capability exists, or apply a `+2` offset consistently for same-run seed data.
   - Use `mode:"plan"` first for non-trivial schemas. Use `mode:"apply"` only when the user asked to persist.
   - By default, workspace creation is disabled. Set `create.workspace=true` only when the user explicitly wants a new workspace.
   - Do not add or modify `lib_BaseRow` sequences. The MCP tool delegates to existing `lib_BaseRow` sequences and its existing Baserow connector transactions.
7. When an allowed tool returns an error:
   - Use the returned diagnostics first.
   - Use `log-view` with narrow filters such as `project`, `level`, `requestable`, `text`, or `since` when more detail is needed.
   - Fix the reduced JSON or merge patch and retry through the no-code tools.

## No-Code Form Rules

- Prefer the compact contract from `nocode-form-contract-get` before requesting `includeAllTypes=true`.
- Use only component types, aliases, properties, and graph patterns present in the no-code contract.
- Preserve user intent, labels, choices, required fields, conditions, pages, and layout in the reduced JSON.
- New app-like forms should use tabs by default, with tab-bar buttons disabled and one meaningful simple Ionic base icon per page. Prefer persisted-good icon names (`home`, `business`, `people`, `person`, `calendar`, `calendar-clear`, `list`, `document-text`, `receipt`, `settings`, `stats-chart`) over `*-outline` variants.
- Treat tab defaults as a persisted-output requirement, not just reduced JSON intent: do not consider an app-like form complete until the saved document confirms those page navigation flags or a no-code limitation has been reported.
- New app-like forms should include a polished background and thumbnail by default when supported, unless the user asks for a plain form.
- Treat wallpaper and thumbnail defaults as persisted-output requirements too: if they are requested or intended by default but compile/create drops them, repair through no-code update when contract-supported or explicitly report the no-code contract limitation.
- Do not generate `thumbnailUrl`. For generated thumbnail images, pass `thumbnailImage: {contentType:"image/png", base64:"..."}` in reduced JSON or in a `set_media`/`set_root` edit operation. Thumbnail images must be smaller than 512x512 px. The MCP tool writes the image to a temporary server file and persists it only through `C8Oforms.APIV2_updateFormulaireDocument` as the attachment named `thumbnail`. If a fetched existing document contains `thumbnail.url` or `thumbnail.type=url`, treat it as legacy/runtime state and continue through the no-code tools; the MCP validator reports it as a warning, not a blocking form error.
- Prefer multi-column layouts for dense app-like pages when supported by the no-code contract and when they improve readability.
- When using reduced JSON, express layout as a field with `type: "layout"` and nested `fields`. Prefer responsive sizing equivalent to `cols: [{size:6},{size:6},0...]`, `tablet: [{size:6},{size:6},0...]`, and `phoneL`/`phoneP` as a single `size:12` column.
- Keep generated reduced JSON concise, valid, and deterministic.
- Do not invent undocumented component properties.
- Do not directly edit full C8Oforms internals unless the no-code tool contract explicitly requires that shape.
- When editing existing forms, prefer semantic `nocode-form-edit` operations over replacing full arrays through `nocode-form-update`.
- Do not infer or expose authentication tokens. If authentication is missing, report that the integrated No Code assistant session is not authenticated instead of switching tools.
- For Baserow catalog discovery and schema application, use `nocode-baserow-catalog-list` or `nocode-baserow-schema-apply` through the integrated authentication context. Do not ask for or use a Baserow JWT, Baserow database token, API key, or project name.

## Sourceable Components

- Any sourceable no-code component can be connected to an external source when `config.sourceEnabled=true` and the component has an enabled entry under `sources`.
- In a saved C8Oforms document, find the sourceable component in `formulaire[]` by `type`, `name`, or `id`. The live source connection lives on that same component under `sources`, not in `pages[]`.
- Source entries are keyed by requestable name, for example `sources["lib_BaseRow.formssource_GetTableData"]`. Each source entry has `enabled`, optional `fullsync`, and source-specific `vars`.
- For sourceable components, inspect `component.sources` as the source of truth for live data binding. Component-local config such as grid `config.columns` or select static choices may be fallback, local, or historical configuration when a dynamic source is active.
- When a source config payload contains `source_id`, it should match the component id. Use that match to confirm which component the source belongs to.
- Preserve unrelated source variables when changing a source connection, and update through no-code tools only. Avoid replacing the whole component or page when a minimal semantic edit or merge patch can change the source safely.
- When using hidden source grids only as data providers for visible cards, summaries, or SmartSource-rendered HTML, put those grids inside a dedicated `layout` and hide the layout with the component visibility option/condition. In persisted forms, prefer a `visibleIf` condition that can never be true, and keep layout column sizes at `0` only as a defensive fallback. Do not rely on zero-width layout columns alone as the hiding mechanism.
- Hidden data-provider grids should usually use `config.returned_value="all_the_data"` so visible components can read the first rows with SmartSource paths such as `<gridName>.0.<columnName>.displayValue`. Preserve exact Baserow/source column names in those paths.
- Treat hidden source grids as reusable no-code data providers, especially for Baserow relationship data. They are useful when a visible component needs to render denormalized cards, dashboards, master-detail panels, or summaries based on `link_row` relations and `lookup`/reported fields without showing a table UI.
- For relationship-driven displays, create one hidden grid per needed table or relation view, include the link fields and lookup fields in `forms_config.columns`, and use Baserow filters/sorts to narrow the hidden grid to the relevant rows. Visible HTML can then compose readable rows from linked records and lookup values through SmartSource paths.
- Source-backed grids are populated when their page is displayed. Do not rely on a hidden grid located on a page that has not been shown yet to feed visible components on another page. Place hidden data-provider grids on the same page as the visible cards/summaries that consume them, or ensure the page containing the hidden grids is displayed before any dependent SmartSource rendering is needed.

### Baserow Source Pattern

- Use `nocode-baserow-catalog-list` first when you need to discover which Baserow workspaces, bases, and tables are available to the authenticated No Code user.
- Use `nocode-baserow-schema-apply` for schema work. It can plan or apply canonical schema JSON with `workspaceName`/`workspaceId`, `baseName`/`baseId`, `tables[].fields`, `tables[].views`, and `tables[].sampleRows`.
- Use `tables[].upsertKey` whenever applying sample rows to an existing table, so reruns update existing rows instead of creating duplicates.
- `nocode-baserow-schema-apply` follows Baserow semantics: tables are Baserow tables; relationships are `link_row` fields; reported fields are `lookup` fields depending on an existing link field.
- The catalog tool returns normalized `workspaces`, `bases`, `tables`, and `counts`; base ids are Baserow database ids, and table ids are Baserow table ids.
- The catalog tool is read-only discovery. It must not be used as permission to call low-code requestables or raw Baserow APIs.
- A component is connected to Baserow when it has an enabled `sources["lib_BaseRow.formssource_GetTableData"]` entry.
- The live Baserow binding is stored in `sources["lib_BaseRow.formssource_GetTableData"].vars.forms_config.str`, a JSON string. Parse that string instead of reading it as plain text.
- Treat `forms_config.str` as the source of truth for the Baserow table and dynamic output columns. Inspect `table_id`, `table_id_int`, `columns`, `hidden`, `link_row_table_id`, `source_id`, and `source_owner`.
- `table_id` is the human-readable Baserow path, commonly shaped like `Workspace~>Database~>Table`; `table_id_int` is the numeric Baserow table id.
- The effective Baserow output columns are dynamically deduced from `forms_config.columns`, with `forms_config.hidden` indicating hidden columns.
- The source variables sit next to `forms_config` under `sources["lib_BaseRow.formssource_GetTableData"].vars`. `forms_tableFilter`, `forms_tableSort`, `forms_tableDistinct`, `forms_tableGroupBy`, and `forms_tableAggregations` carry optional query behavior. Empty strings mean no extra filter, sort, distinct, grouping, or aggregation is applied; populated `conds` arrays describe active filter/sort criteria.
- Avoid using `nocode-form-update` with an empty patch only to inspect a form unless no read-only no-code option is available, because it still persists through the C8Oforms API and can advance the document revision.

## Error Handling

- Validation errors mean the no-code JSON must be corrected, not bypassed.
- Persistence errors may be investigated with `log-view`, but persistence must still go through `nocode-form-create`, `nocode-form-edit`, or `nocode-form-update`; Baserow catalog discovery must still go through `nocode-baserow-catalog-list`.
- Builder, project, or low-code errors are out of scope unless visible through allowed no-code tool diagnostics or `log-view`.

## Refusal Pattern

When a user asks for a low-code action while this skill applies, respond briefly:

```text
I can’t do that under the Convertigo no-code-only boundary because it requires <forbidden tool/category>. I can still <no-code-safe alternative>.
```

Do not call the forbidden tool first.
