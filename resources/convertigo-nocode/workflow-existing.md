# Workflow steps 4 to 7

Read it before reading or changing an existing form, or listing or changing Baserow tables. Summary: `SKILL.md`, in this folder.

---

4. For existing forms:
   - First call read-only `nocode-form-get` with the document `id` from the host context; a form the user names without its id is found with `nocode-form-list` and its `name` first. Inspect `form.pages`, `form.formulaire`, and `form.flows` before proposing improvements or edits. This reads the saved version; it does not include unsaved editor changes.
   - Suggestions and audits must remain read-only unless the user requests changes. Never infer the form contents from its name.
   - To change a word or a text everywhere (a rename, a wording), call `nocode-form-get` with `find`: it lists every text a user sees that holds it, flow messages included; change each one, then call it again to check that none is left.
   - `auth_required` indicates a token/authentication failure. `form_unavailable` means missing or inaccessible: the API does not distinguish those cases, so do not claim a proven permission denial. Do not fall back to `requestable-execute` or any Studio tool.
   - Prefer `nocode-form-edit` for semantic edits when the document id is known and the integrated No Code Studio authentication context is available.
   - From a script, call the tools and read their answers as `workflow-new.md` step 1 says (`whole()`, exact arguments, no tool search). An edit answers the saved form with its `validation`: do not read it again after the edit.
   - Use `nocode-form-edit` for operations such as adding, moving, or removing no-code components, adding page navigation buttons, or updating fields without replacing whole arrays like `formulaire`, `pages`, or `flows`.
   - Use `nocode-form-update` with a JSON merge patch only for small document-level patches or when `nocode-form-edit` cannot express the requested semantic operation.
   - Keep edits minimal and no-code-semantic; do not patch internal generated details that the no-code contract or semantic edit tool does not expose.
   - New or changed Baserow connections in an edit receive saved form/component identities automatically. Existing connection owners are preserved; do not invent or replace owner identities. A `conflict` means the form changed since read: read it again, reconsider the minimal edit, and retry only if it is still appropriate.
   - Adding a page inherits the adjacent page's navigation unless `navigationMode` is explicit. Keep custom navigation custom and supply the entry/return button flows for a new task page.
5. For Baserow no-code catalog discovery:
   - Use `nocode-baserow-catalog-list` when the user asks to list or discover available No Code Baserow workspaces, bases, or tables for the current No Code user.
   - The tool uses the integrated No Code Studio authentication context.
   - Treat the returned `workspaces` tree (each with its `bases`, each with its `tables`) and `counts` as the discovery source of truth for selecting Baserow-backed no-code sources.
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
   - `created` lists what an apply created (bases, tables with their primary field, fields with their ids); `readBack` and `nocode-baserow-catalog-list` show the new columns at once, and the form tools accept them right away. A new table holds only its primary field: `primaryField`, else the first text field of the schema.
   - By default, workspace creation is disabled. Set `create.workspace=true` only when the user explicitly wants a new workspace.
   - Do not add or modify `lib_BaseRow` sequences. The MCP tool delegates to existing `lib_BaseRow` sequences and its existing Baserow connector transactions.
7. When an allowed tool returns an error:
   - Use the returned diagnostics first.
   - If the diagnostics are insufficient, report the tool, resource id and error code when available, without credentials, and request administrator assistance. Do not call `log-view` or a low-code fallback.
   - Fix the reduced JSON or merge patch and retry through the no-code tools.
