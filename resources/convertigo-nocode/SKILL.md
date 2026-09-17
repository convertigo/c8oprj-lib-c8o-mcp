---
name: convertigo-nocode
description: Use for Convertigo No Code Studio / C8Oforms work that must stay inside the Convertigo MCP no-code tools for forms and Baserow catalog discovery. Strictly forbids low-code, project, CRUD, mobile-builder, database-object, log-view, source-file, shell, and generated-artifact access; only the no-code tools may be used.
---

# Convertigo No-Code Only

Use this skill for Convertigo No Code Studio / C8Oforms tasks where the user wants MCP work restricted to no-code tooling.

The core rule is simple: stay on the no-code form rail. Do not use Convertigo low-code tools to compensate for missing no-code capability.

## Skill freshness

- Skill guidance version: `2026-09-04.vibe-serial-transport-v1`.
- During bootstrap, compare this value with `MCP guidance version` in `convertigo://capabilities`. If the MCP value differs or is missing, rerun `_setupCodex` for the current MCP endpoint before using no-code mutation tools.
- When the caller surface supports MCP request metadata, send `params._meta.convertigoGuidanceVersion` with this skill guidance version on the first guarded Convertigo `tools/call`; raw HTTP clients may use the `X-Convertigo-Guidance-Version` header. An `_meta.convertigoGuidanceWarning` mismatch requires setup refresh before no-code mutation. A missing-version warning is advisory when this skill version already matches `convertigo://capabilities`: continue the current task and let the managed host refresh its transport configuration.

Bootstrap is required once per agent conversation for a given MCP endpoint and guidance version, not once per user message. On follow-up turns, reuse the skill, capabilities, and route guides already present in the conversation context. Do not reopen this `SKILL.md`, reread `convertigo://capabilities`, or reread an already-used guide unless the MCP endpoint changed, the MCP reports a guidance-version mismatch, or the required bootstrap context is explicitly unavailable.

## No-Code Authentication

No-code form reads, create, edit/update, and Baserow catalog operations require the authenticated No Code Studio user.

- In the integrated C8Oforms assistant, authentication is provided automatically by the host application and the MCP bearer session. Do not ask the user to copy or paste a token.
- Never print, summarize, request, store in generated form content, or expose the bearer token. Treat authentication as an invisible MCP capability.
- If a compatibility schema still exposes a `token` argument, pass an empty string. The actual credential is supplied out-of-band by MCP bearer authentication.
- Call `nocode-form-get`, `nocode-baserow-catalog-list`, `nocode-baserow-schema-apply`, `nocode-form-create`, `nocode-form-edit`, and `nocode-form-update` normally when the tool is available; the integration supplies the authentication context.
- If a protected no-code tool still returns `missing_token`, `invalid_token`, or `expired_token`, report that the No Code assistant authentication is not ready and ask the user to retry or reconnect. Do not switch to low-code tools as a workaround.
- Compilation and validation may be done without authentication when the tool permits it.

## Convertigo MCP entry

- Expected MCP endpoint: `http://localhost:18082/convertigo/api/mcp`.
- Prefer the no-code MCP tools listed below over filesystem edits or low-code project mutations.

## Optional UI reveal mode

- If the integrated assistant or host context says Convertigo reveal mode is enabled, pass `reveal:true` only on supported no-code mutation tools that should visibly move No Code Studio while you work: `nocode-form-create`, `nocode-form-edit`, and `nocode-form-update`.
- Do not add `reveal:true` to read-only calls such as contract, compile, validate, or catalog tools.
- Treat a `result.reveal.status` of `skipped`, `unsupported`, or `intent` as a UI hint result, not as a no-code mutation failure.

## Hard Tool Boundary

Allowed Convertigo MCP tools:

- `nocode-form-get`
- `nocode-form-contract-get`
- `nocode-baserow-catalog-list`
- `nocode-baserow-schema-apply`
- `nocode-form-compile`
- `nocode-form-validate`
- `nocode-form-create`
- `nocode-form-edit`
- `nocode-form-update`

NoCode bearer tokens cannot access `log-view`, even if older instructions or a broader catalog mention it. Use diagnostics returned by the allowed tools. If those are insufficient, report the failure and ask an administrator to inspect server logs through their authorized administration interface; do not bypass the restriction or request broader credentials.

Forbidden Convertigo MCP tools include, but are not limited to:

- Server log access through `log-view`
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
   - Choose navigation deliberately. For an application with a home/dashboard and task pages, prefer `navigationMode:"custom"` with native buttons linked to `push_page` flows (unique page names in reduced `targetPage`). Provide entry and return paths. Use tabs when requested or when peer sections genuinely benefit from them; use automatic page buttons for a linear questionnaire. The compiler's legacy fallback to tabs is not a design recommendation.
   - Assign a meaningful page `iconName` to every page by default. Prefer simple Ionic base icon names known to persist in C8Oforms tabs, such as `home`, `business`, `people`, `person`, `calendar`, `calendar-clear`, `list`, `document-text`, `receipt`, `settings`, `stats-chart`, and `search`. Avoid `*-outline` icon names unless the user explicitly requests them and the saved document confirms they render.
   - Add a modern, domain-appropriate `wallpaper` and matching `thumbnail` by default when the no-code form contract supports them. Prefer clean, professional visuals that do not reduce form readability; skip or simplify the background if it would distract from data entry.
   - Use multi-column layouts when the no-code contract supports them and the fields naturally group together. Prefer `layout` fields containing related child fields. Use 2 columns on desktop/tablet and collapse to 1 column on phones. Avoid cramped columns.
   - Create incrementally. A tool argument is text the model generates token by token: beyond roughly 4 KB of reduced JSON a structural typo is likely and the call is refused. Step 1: `nocode-form-create` with the skeleton only (name, navigation, pages with icons, fields with type/name/label/mandatory/choices, Baserow sources and actions with their columns, button fields with flow ids, push_page/submit flows) and no style objects; pass `reduced` as a JSON object, not a string. Design warnings are expected at this step. Step 2: one `nocode-form-edit` per page applying the native design pass (`update_field` patches with the style recipes, `add_flow_element` for toasts and refresh, `update_page` for flags). Step 3: `nocode-form-get` then `nocode-form-validate`; every design warning of step 1 must be resolved before delivery. Only a small form (a page or two, a handful of fields) may be created in one call with its styles.
   - Before compiling, apply the native design pass below to every page (in step 2 when creating incrementally). Functional components alone are not a finished application: choose spacing and grouping deliberately, then author the actual style objects rather than merely describing the intended appearance.
   - Use `nocode-form-compile` to convert the reduced JSON.
   - Use `nocode-form-validate` if you need an explicit validation pass or if compilation returns a full form needing checks.
   - Use `nocode-form-create` only through the integrated No Code Studio authentication context.
   - For new Baserow connections, supply the discovered table identity, columns and business mappings but omit `form_id`, `source_id` and `source_owner` from `forms_config`. The create tool assigns these itself from the saved document and authenticated creator. `bindingFinalization.status:"pending_creation"` / `baserow_identity_pending_creation` from compile are expected, nonblocking: continue with create rather than inventing identifiers or claiming a No-Code limitation.
   - Inspect creation's `bindingFinalization`: `ready` confirms saved identities, not a tested business save. If `saved:true` with `status:"partial"` and finalization `pending`, a form already exists. Follow the returned recovery operation: `nocode-form-edit` with only `[{action:"finalize_baserow_bindings"}]` on the returned id. Never call create again to repair this result. The creator-only recovery is idempotent; if it remains blocked, report that existing id and the diagnostic instead of declaring the app ready.
   - After creation, read the saved form and verify the chosen navigation persisted. Custom navigation requires automatic tabs/buttons disabled and working native button flows. Tab navigation requires the intended tab flags and valid icons. Repair only the chosen style; never restore tabs over an intentional custom/button design.
   - Also inspect the saved `wallpaper` and `thumbnail` when a polished background/thumbnail was intended. If create/compile normalized them to disabled placeholders and the no-code contract exposes a supported wallpaper/thumbnail shape, immediately repair them with `nocode-form-update`; otherwise report that the current no-code contract did not provide a persistable wallpaper/thumbnail shape.
4. For existing forms:
   - First call read-only `nocode-form-get` with the document `id` from the host context. Inspect `form.pages`, `form.formulaire`, and `form.flows` before proposing improvements or edits. This reads the saved version; it does not include unsaved editor changes.
   - Suggestions and audits must remain read-only unless the user requests changes. Never infer the form contents from its name.
   - `auth_required` indicates a token/authentication failure. `form_unavailable` means missing or inaccessible: the API does not distinguish those cases, so do not claim a proven permission denial. Do not fall back to `requestable-execute` or any Studio tool.
   - Prefer `nocode-form-edit` for semantic edits when the document id is known and the integrated No Code Studio authentication context is available.
   - Use `nocode-form-edit` for operations such as adding, moving, or removing no-code components, adding page navigation buttons, or updating fields without replacing whole arrays like `formulaire`, `pages`, or `flows`.
   - Use `nocode-form-update` with a JSON merge patch only for small document-level patches or when `nocode-form-edit` cannot express the requested semantic operation.
   - Keep edits minimal and no-code-semantic; do not patch internal generated details that the no-code contract or semantic edit tool does not expose.
   - New or changed Baserow connections in an edit receive saved form/component identities automatically. Existing connection owners are preserved; do not invent or replace owner identities. A `conflict` means the form changed since read: read it again, reconsider the minimal edit, and retry only if it is still appropriate.
   - Adding a page inherits the adjacent page's navigation unless `navigationMode` is explicit. Keep custom navigation custom and supply the entry/return button flows for a new task page.
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
   - When explicitly requested sample rows have relationships, use verified returned row ids or stable business-key references resolved by the schema tool. Never guess ids from insertion order or apply a numeric offset. Put referenced tables before dependent tables for same-run key resolution; unresolved references are blockers, not empty relationships.
   - Use `mode:"plan"` first for non-trivial schemas. Use `mode:"apply"` only when the user asked to persist.
   - By default, workspace creation is disabled. Set `create.workspace=true` only when the user explicitly wants a new workspace.
   - Do not add or modify `lib_BaseRow` sequences. The MCP tool delegates to existing `lib_BaseRow` sequences and its existing Baserow connector transactions.
7. When an allowed tool returns an error:
   - Use the returned diagnostics first.
   - If the diagnostics are insufficient, report the tool, resource id and error code when available, without credentials, and request administrator assistance. Do not call `log-view` or a low-code fallback.
   - Fix the reduced JSON or merge patch and retry through the no-code tools.

## No-Code Form Rules

- Prefer the compact contract from `nocode-form-contract-get` before requesting `includeAllTypes=true`.
- Use only component types, aliases, properties, and graph patterns present in the no-code contract.
- Preserve user intent, labels, choices, required fields, conditions, pages, and layout in the reduced JSON.
- For app-like forms, prefer an actionable home page with native navigation buttons. Preserve explicit user choices. When tabs are chosen, prefer persisted-good base icon names and verify their saved flags.
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

## Generation quality

Read `authoringContract.generationQuality` and `flowAuthoring` from the live contract before generating an application. They describe the actual translation and limitations; do not compensate for missing properties with invented JSON.

- Map the requested outcome to a complete user journey before creating: entry, input, action, feedback and result view. A request-tracking page needs a grid/cards view, not a paragraph saying tracking can be added later.
- Before requesting input, apply the contextual-value pass below: use available runtime values when relevant instead of making the respondent re-enter known information.
- Give every visible question a meaningful `label` (plain text) or `description` (rich question HTML). `name` is technical and `defaultFrom` fills the answer: neither supplies a visible question. The compiler synchronizes plain labels with the HTML question renderer; explicit `config.html`/rich descriptions remain authoritative. Resolve `prototype_question_label` warnings before delivery, and check the actually displayed `config.html` when `personalized` is true rather than checking `config.label` alone.
- Apply the native design pass below across all pages, not only the welcome card. Review `missing_block_spacing`, `action_wrapper_surface`, `partial_page_styling` and `ungrouped_adjacent_buttons` warnings on the affected blocks, including nested layouts. A deliberate exception is acceptable, an overlooked block is not.
- Every active button needs a meaningful non-empty flow with a visible `name` as well as its stable `id` (for example `id:"send_request", name:"Envoyer la demande"`). Name submit and other action steps by their business purpose too. Navigation uses `push_page.targetPage`; submit steps need configured enabled backend actions. A success toast alone is not a save. Set required-field validation on submission buttons and handle the actual save result before claiming success.
- `toast.message` is supported reduced syntax. Do not copy prototype text such as `toast_example`, generic car columns or unrelated stock icons into the delivered app.
- Deliver operational applications, not fictitious applications or local demonstrations. For business records and tracking, follow the Baserow schema/source patterns below: discover the authorized destination, plan and create the dedicated tables/fields/relations the application requires, and connect submit actions and result views to those tables. Reuse an existing structure only when it fits the requested application. If the workspace/base choice or access is missing, ask for it; never downgrade the request to a local grid or pretend success.
- Local grids (`sourceEnabled:false`) are transient UI state, not business storage. Use them only when the requested interaction actually needs temporary data. Do not add fictitious-row buttons or seed invented business records. Baserow `sampleRows` is reserved for explicit user requests for sample data, not the default application workflow. Show an honest empty state until real records exist. Grid `rows`, `sampleRows` and `data` properties are not supported.
- Compilation checks new generations more strictly than existing drafts. Fix functional errors before create. Inspect validation warnings after re-reading the saved form, especially unconfigured actions/sources, local-only data and text-only pages.
- Check saved flow names, button targets, action variables, message sources and style scopes. Verify the business journey: submit entered values, check the backend result, reload and find the persisted record in its result view. Use an authorized test record and report its disposition; never seed a live table silently. When browser validation is available and authorized, also test desktop/mobile rendering; otherwise report that visual/runtime validation is pending. Never use tools outside the no-code boundary to manufacture proof.
- Never announce a technical limitation from memory. Re-read the backend actions `capabilities` and `recipes` in the contract first: `forms_AddRow` and `forms_AddRowFromData` also update a row when `forms_id` is set, one flow can write to several tables, and computed values come from calculated fields. State a limit only by quoting the contract sentence that establishes it; otherwise propose the closest recipe.
- Limit automatic repair to two focused attempts for a failed invariant. If still blocked, report the exact missing capability/configuration; do not declare a partial application complete.

### Contextual-value pass

Read `authoringContract.contextualDefaults` for the available sources, their scope,
return types and initialization limits. This is a general design pass, not an
identity-only recipe.

- Classify each value as manual input, initial context default, reactive calculation, or backend-managed data. Consider the connected respondent, the current record/selection, other fields, formula/action results, explicit navigation parameters, and useful date/time defaults. Availability alone does not make a value appropriate: an employee, a customer and a beneficiary may be different people.
- For supported scalar fields, use `defaultFrom` instead of inventing properties or baking values into JSON. Examples: `{source:"user", property:"email", fallback:""}`, `{source:"clock", property:"today"}`, `{source:"field", field:"selected_request", path:["Reference","value"], fallback:""}`. A path uses the actual runtime object shape; discover grid columns/selection mode first. The compiler resolves named field dependencies after all fields are compiled and rejects missing/ambiguous names and direct dependency cycles.
- Use `mode:"initial"` (the default) for editable prefill. It applies when the field's page sources initialize and does not refill on later dependency changes. Data/selection must already be available then. If loading occurs later, offer manual input or an explicit load/reset workflow; do not silently change to a reactive value that can overwrite input.
- Use `mode:"reactive"` only for genuine derived values, usually with a disabled control; for example `{source:"expression", expression:"fields.quantity * fields.unit_price", mode:"reactive"}`. Expressions run in the existing Forms context (`fields`, `actions`, `api`), must be side-effect free and return the control's expected type. Field dependencies can trigger updates; this does not create clock polling or a user-session subscription. Never call backend mutations from a default expression.
- Use the identity of the runtime respondent, not the app creator or assistant session. `api.user.name` is a display name; `api.user.email` may be missing. Separate first/last names are not exposed: do not split display names, guess from an email address, or invent profile values. Handle incomplete profiles and anonymous access with a visible fallback. For a request on behalf of someone else, select the beneficiary explicitly. Do not add identity capture to an anonymous/anonymized journey unless requested.
- Keep literals and existing native sources when intentional. Do not combine `defaultFrom` with an explicit source/default in the same operation: the compiler rejects the conflict. A requested `update_field` with `patch.defaultFrom` may replace an existing scalar self default, but unrelated edits preserve it. `fallback` applies only to null/undefined, not false, zero or an intentionally empty string.
- Native choices and data views have different contracts. Select/radio/checkbox defaults use the real choice values and existing native default expressions; fetching choices is not selecting a default. Grids/cards need real backend sources. Location requires consent; files/signatures cannot be fabricated. Do not force the scalar `defaultFrom` shorthand onto unsupported component types.
- Navigation parameters and client-computed identity are untrusted inputs, not access control. Backend-owned values such as ownership, permissions and audit timestamps must be established or checked server-side. Browser date defaults are convenience values, not authoritative timestamps.
- Review required fields with unavailable context, response editing, manual changes/clearing, page re-entry, selected-record changes, data readiness and typed values. Address `context_default_source_readiness`, `editable_reactive_value`, `required_context_value_fallback` and `context_expression_runtime_check` warnings deliberately. Read back saved sources/modes after create/edit; static compilation does not prove a live profile, loaded record or arbitrary expression result.

### Native design pass

Treat layout, margin, padding and borders as part of generation, not optional finishing touches. Read `authoringContract.generationQuality.styles` for copyable native style recipes. Adapt these starting points to the domain and existing design; they are not a compulsory theme.

- Establish a small spacing scale before authoring: typically 8px between closely related elements, 16px within ordinary sections, 24px between sections, 32px only for a major separation. Reuse the same choices across pages. Do not use arbitrary large blank areas to align controls.
- Give every visible block a spacing role: page introduction, section/card, field, data view or action group. Cover grids, inputs, nested layouts and buttons as well as descriptions. Supply explicit native spacing where needed; intentional `"0"` or spacing supplied by a parent is valid. A background color or rounded border alone does not establish spacing.
- Put **external separation in `boxStyle.margin`** and **internal breathing room in `boxStyle.padding`**. For a section, start with `margin:"0 0 24px 0"` and `padding:"16px"`; a welcome panel can use `padding:"24px"`. Avoid fixed side margins on inner blocks that reduce usable mobile width. Use the documented root responsive configuration for page gutters.
- Group related inputs in a native layout/section with one visual surface. Use small child spacing (for example `margin:"0 0 8px 0"`, `padding:"0"`) or `layoutChildrenStyle.default` instead of stacking a padded card around every field. Use `questionBoxStyle` for question/header spacing and `componentBoxStyle` for the inner control only when supported. Do not erase built-in input affordances or apply every style scope indiscriminately.
- Use a subtle border (for example `1px solid #E2E8F0`) and a consistent radius (for example `12px`) on meaningful groups, not every nested block. Keep parent and child surfaces distinct: an unframed child may use `border:"0"` and a transparent background. Avoid conflicting border shorthand and per-side/width settings. Adapt colors to the selected theme; preserve readable contrast.
- Put related buttons in a native `layout`, horizontal on desktop/tablet and stacked on narrow phones. Put the separation from the preceding content on the group; keep child button wrappers light and align their spacing. Do not turn each button into a separate full-width card, or group unrelated actions across intervening content.
- For a standalone button or action-only layout, explicitly set the outer `boxStyle.backgroundColor:"transparent"` and `boxStyle.border:"0"` by default. An omitted or empty background can retain the Forms white container: it is not equivalent to transparent. Keep only useful spacing; do not apply the section/card recipe to button wrappers. Check the parent layout and `layoutChildrenStyle` too: a transparent button wrapper still shows a white parent behind it. Preserve a surrounding surface only when it belongs to a genuine content section or the user requests it.
- Distinguish the wrapper from the clickable button: `boxStyle.backgroundColor` controls the outer block, while the button's `backgroundColor`/`config.backgroundColor` controls the button itself. Removing the white rectangle must not remove the primary button's colored fill, text contrast or interaction affordance.
- Use HTML for content, not a second layout system. Remove redundant heading/paragraph margins inside an already padded description and avoid cumulative HTML + `boxStyle` + layout-child padding. Keep spacing in the native scopes so it remains editable in No Code Studio.
- Before create and after saved-form readback, review each page's introduction, sections, field groups, data views and action groups. Confirm the intended margin/padding/border values survived compilation, including nested children, and check that no block was left with unrelated prototype styling. Do not overwrite existing custom styling during unrelated edits.
- When an authorized browser is available, verify desktop and narrow-phone layout: no horizontal overflow, consistent gaps, comfortable field widths, no clipped buttons or oversized empty cards. JSON validation proves style transmission, not visual quality; report visual verification as pending when unavailable.

## Sourceable Components

- Any sourceable no-code component can be connected to an external source when `config.sourceEnabled=true` and the component has an enabled entry under `sources`.
- In a saved C8Oforms document, find the sourceable component in `formulaire[]` by `type`, `name`, or `id`. The live source connection lives on that same component under `sources`, not in `pages[]`.
- Source entries are keyed by requestable name, for example `sources["lib_BaseRow.formssource_GetTableData"]`. Each source entry has `enabled`, optional `fullsync`, and source-specific `vars`.
- For sourceable components, inspect `component.sources` as the source of truth for live data binding. Component-local config such as grid `config.columns` or select static choices may be fallback, local, or historical configuration when a dynamic source is active.
- In a saved source config, `source_id` must match the component id. The create tool sets it automatically for new bindings; use that match to verify the saved result, not as a prerequisite to creating the form.
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
- Use `nocode-form-get` for inspection. Never use an empty edit/update to read a form, because it persists through the C8Oforms API and can advance the document revision. If the read tool is unavailable, report the missing capability.

## Error Handling

- Validation errors mean the no-code JSON must be corrected, not bypassed.
- If compile or create answers `reduced is not valid JSON`, the error names the position and shows the surrounding text: the whole argument was received, it is never a transport truncation. Fix the JSON at that position and resend the same call; if it fails twice, split the creation further (incremental creation above). On `empty_form`, the skeleton was lost: resend it, do not rebuild the application through edits on an empty form.
- If a tool call fails without a diagnostic, or reports `server_call_interrupted`, retry the same call once with identical arguments before changing strategy. Only after a second identical failure should you investigate or report it.
- `baserow_schema_unavailable` means the columns of a connected table could not be read with the authenticated No Code account. Call `nocode-baserow-catalog-list` once, confirm the table is listed, then retry the same create or edit. Never remove Baserow connections or fall back to local data to get past this issue; if it persists, report the table and the diagnostic.
- Investigate persistence errors using returned diagnostics and read-only `nocode-form-get` when a saved id is available; do not retry creation after a successful or partial save. Writes must still go through `nocode-form-create`, `nocode-form-edit`, or `nocode-form-update`; Baserow catalog discovery must still go through `nocode-baserow-catalog-list`.
- Builder, project, server logs and low-code diagnostics are outside the NoCode token scope. Report what the allowed tools expose and defer deeper server investigation to an administrator.

## Refusal Pattern

When a user asks for a low-code action while this skill applies, respond briefly:

```text
I can’t do that under the Convertigo no-code-only boundary because it requires <forbidden tool/category>. I can still <no-code-safe alternative>.
```

Do not call the forbidden tool first.
