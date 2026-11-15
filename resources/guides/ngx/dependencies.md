# NPM dependencies and common data-page states

Read when: NPM dependencies and common data-page states. Summary: `convertigo://guides/ngx`.
Previous: `convertigo://guides/ngx/custom-actions`. Next: `convertigo://guides/ngx/viewer`.

---

- declare npm packages on the action object with `package_dependencies`
- declare TypeScript imports through the Convertigo import vector consumed by the generated target; for shared action custom code emitted into `actionbeans.service.ts`, use `app_ts_imports`
- use `UICustomAsyncAction` when the action code contains `await`; do not put top-level `await` in a plain `UICustomAction`
- keep import rows structurally nested as `[importClause, moduleName]`; for example `{ loadStripe }` from `@stripe/stripe-js`
- keep dependency rows structurally nested as `[packageName, version]`; for example `@stripe/stripe-js` and `9.9.0`

The tree view may display these rows compactly as `[{ loadStripe }, @stripe/stripe-js]` or `[@stripe/stripe-js, 9.9.0]`. That compact display is not the source format: in YAML/XML, these properties must remain XMLVector-of-XMLVector rows, not one comma-separated `java.lang.String`.

If compilation fails after changing imports or dependencies, reload/regenerate the project through Convertigo and reopen the mobile builder. Do not repair `_private/ionic`, generated package files, or generated TypeScript directly.

## Common page pattern for data-backed UX

### Canonical order
1. contract known
2. page structure created
3. load action path wired
4. loading state visible
5. empty state visible
6. error state visible
7. retry path real
8. runtime/build checked

### Empty state
Use empty state for:
- valid request
- no data returned

Do not confuse empty state with error state.

### Error state
Use error state for:
- request failure
- invalid runtime path
- backend refusal

Error state must not silently masquerade as an empty list.

### Retry behavior
Retry must re-enter the data-loading action path. A structural marker is not enough.

