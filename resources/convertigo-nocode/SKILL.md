---
name: convertigo-nocode
description: Use for Convertigo No Code Studio / C8Oforms work that must stay inside the Convertigo MCP no-code tools for forms and Baserow catalog discovery. Strictly forbids low-code, project, CRUD, mobile-builder, database-object, source-file, shell, and generated-artifact edits; only the no-code tools and log viewer may be used.
---

# Convertigo No-Code Only

Use this skill for Convertigo No Code Studio / C8Oforms tasks where the user wants MCP work restricted to no-code tooling.

The core rule is simple: stay on the no-code form rail. Do not use Convertigo low-code tools to compensate for missing no-code capability.

## Required Token

No-code create, edit/update, and Baserow catalog operations require a No Code Studio bearer token.

- The token must be copied by the user from No Code Studio and provided in the conversation.
- Do not infer, search for, read from disk, extract from browser storage, or reuse a token from any other source.
- If a token is required and the user has not provided one, ask the user to copy the token from No Code Studio and paste it into the conversation.
- Do not call `nocode_baserow_catalog_list`, `nocode_form_create`, `nocode_form_edit`, or `nocode_form_update` without an explicit user-provided token.
- Compilation and validation may be done without a token when the tool permits it.

## Hard Tool Boundary

Allowed Convertigo MCP tools:

- `nocode_form_contract_get`
- `nocode_baserow_catalog_list`
- `nocode_form_compile`
- `nocode_form_validate`
- `nocode_form_create`
- `nocode_form_edit`
- `nocode_form_update`
- `log_view`

`log_view` is diagnostic-only. Use it to inspect errors, validation failures, API failures, or runtime messages. Do not treat logs as permission to use low-code mutation tools.

Forbidden Convertigo MCP tools include, but are not limited to:

- Low-code database object tools such as `databaseobject-*`
- Sequence, transaction, connector, page, shared component, or source-object mutation tools
- CRUD tools such as `upsert_crud`, `upsert_ngx_crud_kit`, `crud_status`, and `crud_proof`
- Project administration or file tools such as `project_js_get`, `project_js_set`, `project_save`, `project_reload`, `project_delete`, and `marketplace_import`
- Mobile builder tools such as `mobile_builder_open`
- Batch wrappers such as `batch_call` when they would call anything outside the allowed list
- Local shell, filesystem, npm, frontend build, or generated artifact edits for Convertigo project repair

If the requested change cannot be completed with the allowed tools, stop and say exactly which no-code limitation blocks it. Offer the closest no-code-safe alternative if one exists.

## Workflow

1. Read the no-code contract with `nocode_form_contract_get`.
2. Build or patch only the reduced no-code form JSON unless the user explicitly provides a full form document for validation.
3. For new forms:
   - For app-like or multi-page forms, default to tab mode: set each page to `enabledTab=true`, `positionTab=bottom`, `positionButtons=tab`, and `enabledButtons=false` unless the user asks for another navigation style.
   - Assign a meaningful page `iconName` to every page by default. Prefer simple Ionic base icon names known to persist in C8Oforms tabs, such as `home`, `business`, `people`, `person`, `calendar`, `calendar-clear`, `list`, `document-text`, `receipt`, `settings`, `stats-chart`, and `search`. Avoid `*-outline` icon names unless the user explicitly requests them and the saved document confirms they render.
   - Add a modern, domain-appropriate `wallpaper` and matching `thumbnail` by default when the no-code form contract supports them. Prefer clean, professional visuals that do not reduce form readability; skip or simplify the background if it would distract from data entry.
   - Use multi-column layouts when the no-code contract supports them and the fields naturally group together. Prefer `layout` fields containing related child fields. Use 2 columns on desktop/tablet and collapse to 1 column on phones. Avoid cramped columns.
   - Use `nocode_form_compile` to convert the reduced JSON.
   - Use `nocode_form_validate` if you need an explicit validation pass or if compilation returns a full form needing checks.
   - Use `nocode_form_create` only after the user has copied the bearer token from No Code Studio and provided it in the conversation.
   - After `nocode_form_create`, inspect the returned saved `form.pages`. For app-like or multi-page forms, verify each page still has `enabledTab=true`, `positionTab=bottom`, `positionButtons=tab`, `enabledButtons=false`, a simple valid `iconName`, and known-good tab flags such as `checkMandatoryInCurrentPage=true` and `isNameDisplayed=false`.
   - If create/compile normalized those tab settings away, dropped tab flags, or persisted icon names that are unlikely to render, and the token is already user-provided, immediately call `nocode_form_update` with a minimal `pages` merge patch restoring the intended tab settings and simple icon names, preserving each page's `name`, `pageTechName`, `desc`, and `included`.
   - If the tab repair update is not possible through `nocode_form_update`, report the exact no-code limitation instead of leaving the app in default page-button navigation.
   - Also inspect the saved `wallpaper` and `thumbnail` when a polished background/thumbnail was intended. If create/compile normalized them to disabled placeholders and the no-code contract exposes a supported wallpaper/thumbnail shape, immediately repair them with `nocode_form_update`; otherwise report that the current no-code contract did not provide a persistable wallpaper/thumbnail shape.
4. For existing forms:
   - Prefer `nocode_form_edit` for semantic edits when the document id is known and the user has provided the No Code Studio bearer token.
   - Use `nocode_form_edit` for operations such as adding, moving, or removing no-code components, adding page navigation buttons, or updating fields without replacing whole arrays like `formulaire`, `pages`, or `flows`.
   - Use `nocode_form_update` with a JSON merge patch only for small document-level patches or when `nocode_form_edit` cannot express the requested semantic operation.
   - Keep edits minimal and no-code-semantic; do not patch internal generated details that the no-code contract or semantic edit tool does not expose.
5. For Baserow no-code catalog discovery:
   - Use `nocode_baserow_catalog_list` when the user asks to list or discover available No Code Baserow workspaces, bases, or tables for the current No Code user.
   - The tool takes only the No Code Studio `token`
   - Treat the returned `workspaces`, `bases`, `tables`, and `counts` as the discovery source of truth for selecting Baserow-backed no-code sources.
   - Never call Baserow HTTP APIs directly and never bypass `lib_BaseRow`; this catalog tool authenticates like the form tools and delegates discovery to `lib_BaseRow.formscommon_ApplicationsList`.
6. When an allowed tool returns an error:
   - Use the returned diagnostics first.
   - Use `log_view` with narrow filters such as `project`, `level`, `requestable`, `text`, or `since` when more detail is needed.
   - Fix the reduced JSON or merge patch and retry through the no-code tools.

## No-Code Form Rules

- Prefer the compact contract from `nocode_form_contract_get` before requesting `includeAllTypes=true`.
- Use only component types, aliases, properties, and graph patterns present in the no-code contract.
- Preserve user intent, labels, choices, required fields, conditions, pages, and layout in the reduced JSON.
- New app-like forms should use tabs by default, with tab-bar buttons disabled and one meaningful simple Ionic base icon per page. Prefer persisted-good icon names (`home`, `business`, `people`, `person`, `calendar`, `calendar-clear`, `list`, `document-text`, `receipt`, `settings`, `stats-chart`) over `*-outline` variants.
- Treat tab defaults as a persisted-output requirement, not just reduced JSON intent: do not consider an app-like form complete until the saved document confirms those page navigation flags or a no-code limitation has been reported.
- New app-like forms should include a polished background and thumbnail by default when supported, unless the user asks for a plain form.
- Treat wallpaper and thumbnail defaults as persisted-output requirements too: if they are requested or intended by default but compile/create drops them, repair through no-code update when contract-supported or explicitly report the no-code contract limitation.
- Prefer multi-column layouts for dense app-like pages when supported by the no-code contract and when they improve readability.
- When using reduced JSON, express layout as a field with `type: "layout"` and nested `fields`. Prefer responsive sizing equivalent to `cols: [{size:6},{size:6},0...]`, `tablet: [{size:6},{size:6},0...]`, and `phoneL`/`phoneP` as a single `size:12` column.
- Keep generated reduced JSON concise, valid, and deterministic.
- Do not invent undocumented component properties.
- Do not directly edit full C8Oforms internals unless the no-code tool contract explicitly requires that shape.
- When editing existing forms, prefer semantic `nocode_form_edit` operations over replacing full arrays through `nocode_form_update`.
- Do not infer authentication tokens. If a token is required and missing, ask the user to copy it from No Code Studio and paste it into the conversation instead of switching tools.
- For Baserow catalog discovery, use `nocode_baserow_catalog_list` with exactly the user-provided No Code Studio token. Do not ask for or use a Baserow JWT, Baserow database token, API key, workspace id, database id, filter, or project name for discovery.

## Sourceable Components

- Any sourceable no-code component can be connected to an external source when `config.sourceEnabled=true` and the component has an enabled entry under `sources`.
- In a saved C8Oforms document, find the sourceable component in `formulaire[]` by `type`, `name`, or `id`. The live source connection lives on that same component under `sources`, not in `pages[]`.
- Source entries are keyed by requestable name, for example `sources["lib_BaseRow.formssource_GetTableData"]`. Each source entry has `enabled`, optional `fullsync`, and source-specific `vars`.
- For sourceable components, inspect `component.sources` as the source of truth for live data binding. Component-local config such as grid `config.columns` or select static choices may be fallback, local, or historical configuration when a dynamic source is active.
- When a source config payload contains `source_id`, it should match the component id. Use that match to confirm which component the source belongs to.
- Preserve unrelated source variables when changing a source connection, and update through no-code tools only. Avoid replacing the whole component or page when a minimal semantic edit or merge patch can change the source safely.

### Baserow Source Pattern

- Use `nocode_baserow_catalog_list` first when you need to discover which Baserow workspaces, bases, and tables are available to the authenticated No Code user.
- The catalog tool returns normalized `workspaces`, `bases`, `tables`, and `counts`; base ids are Baserow database ids, and table ids are Baserow table ids.
- The catalog tool is read-only discovery. It must not be used as permission to call low-code requestables or raw Baserow APIs.
- A component is connected to Baserow when it has an enabled `sources["lib_BaseRow.formssource_GetTableData"]` entry.
- The live Baserow binding is stored in `sources["lib_BaseRow.formssource_GetTableData"].vars.forms_config.str`, a JSON string. Parse that string instead of reading it as plain text.
- Treat `forms_config.str` as the source of truth for the Baserow table and dynamic output columns. Inspect `table_id`, `table_id_int`, `columns`, `hidden`, `link_row_table_id`, `source_id`, and `source_owner`.
- `table_id` is the human-readable Baserow path, commonly shaped like `Workspace~>Database~>Table`; `table_id_int` is the numeric Baserow table id.
- The effective Baserow output columns are dynamically deduced from `forms_config.columns`, with `forms_config.hidden` indicating hidden columns.
- The source variables sit next to `forms_config` under `sources["lib_BaseRow.formssource_GetTableData"].vars`. `forms_tableFilter`, `forms_tableSort`, `forms_tableDistinct`, `forms_tableGroupBy`, and `forms_tableAggregations` carry optional query behavior. Empty strings mean no extra filter, sort, distinct, grouping, or aggregation is applied; populated `conds` arrays describe active filter/sort criteria.
- Avoid using `nocode_form_update` with an empty patch only to inspect a form unless no read-only no-code option is available, because it still persists through the C8Oforms API and can advance the document revision.

## Error Handling

- Validation errors mean the no-code JSON must be corrected, not bypassed.
- Persistence errors may be investigated with `log_view`, but persistence must still go through `nocode_form_create`, `nocode_form_edit`, or `nocode_form_update`; Baserow catalog discovery must still go through `nocode_baserow_catalog_list`.
- Builder, project, or low-code errors are out of scope unless visible through allowed no-code tool diagnostics or `log_view`.

## Refusal Pattern

When a user asks for a low-code action while this skill applies, respond briefly:

```text
I can’t do that under the Convertigo no-code-only boundary because it requires <forbidden tool/category>. I can still <no-code-safe alternative>.
```

Do not call the forbidden tool first.
