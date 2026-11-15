# Visible shell, templates and state model

Read when: Visible shell, templates and state model. Summary: `convertigo://guides/data-page`.
Previous: `convertigo://guides/data-page/search-repair`. Next: `convertigo://guides/data-page/events`.

---

- when the business sequence payload exposes several useful fields, render at least three distinct details in each repeated result row: a display label/name, one identifier or code-like field, and one additional quantitative, date, location, category, or status field. For nested contracts, use the iterator scope, for example `{{ record.properties.label }}`, `{{ record.properties.id || record.properties.code }}`, and another proven field. Do not hard-code contract-specific field names that were not present in the live business sequence proof.
- error message text -> Local SmartSource/source mode on `?.errorMessage`, not `plain:{{ local.errorMessage }}`, not `plain:{{ local?.errorMessage || 'fallback' }}`, and not `script:local?.errorMessage || 'fallback'`
- error message fallback text belongs in the failure `SetLocalAction(Property=errorMessage)`, not in `UIText.textValue`. The `UIText` itself should be a pure Local SOURCE read of `?.errorMessage`.
- error/failure handlers must not read `out`, `out.message`, or `out.error` for visible page-local error text. Use a static fallback string in the handler, because handler output scope differs by generated parent.
- after creating error/empty/result directives, read back each `UIControlDirective` with `properties:"all"` and require the properties you intended to set. A successful create with missing directive properties is still incomplete.
- If you create a temporary NGX object and later remove it, delete the exact QName with `databaseobject-delete` using save/refresh enabled, then run/read `mobile-builder-open` or another generated-source refresh before browser proof. A tree readback can be clean while the viewer still serves a stale generated component when deletes were done with `autoSave:false` and `refresh:false`.

This is compliant:
`SearchButton` -> `SearchClick` -> `PrepareSearch` (`UICustomAction`) -> `CallSearch` (`CallSequenceAction`) -> request `UIControlVariable`.

This is non-compliant:
`Page.scriptContent.searchRecords()` calls `this.c8o.callJson(...)`, while `Page.Content` is a single `UICustom` containing raw `<ion-input>`, raw `<ion-button>`, and raw `*ngFor`.

Also non-compliant:
`Page.scriptContent.searchRecords()` calls `this.c8o.callJsonObject('Project.Sequence', vars).async()`, while the submit button is raw template markup. A green builder does not make this pattern acceptable.

Also non-compliant:
`Page.Content.SearchView` is a `UICustom` fragment containing the input, loading/error notes, and result list, even if a palette `SearchButton -> SearchClick -> CallSearch -> query` action chain is nested below it. Replace that fragment with palette objects for the input, text, notes, list shell, result rows, and style classes.

### First visible shell for common demos
On the first pass, build the smallest shell that already looks like the requested feature:
- real page title
- one visible list/card/table container
- one loading, empty, or retry state tied to the stable contract or stub
- one contract-shaped slot or placeholder surface for the eventual live count/item
- one obvious action such as retry, refresh, or create

This first shell is intentionally repetitive. It should be built almost mechanically from the recipe for common CRUD/list pages.
Once backend proof exists, the second pass replaces the placeholder surface with one real bound count, value, or repeated item.

### Generated pages
For a list, detail, form, dashboard or logout page, use `ngx-page-create` first (`convertigo://guides/multipage`).
Do not build such a page from scratch when the generator already matches the task.

### Canonical state model
For a typical page-local state, keep explicit flags:
- loading
- empty
- error
- last payload or resolved contract fields

The exact object tree may vary, but the semantics must be explicit. These flags belong in Convertigo local state updated by `SetLocalAction`, and visible bindings must read them with Local SmartSources.

### Binding rules
