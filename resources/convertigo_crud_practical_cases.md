# Convertigo CRUD Practical Cases

Use these direct MCP calls for standard CRUD scaffolding before asking agents to improvise.
Always validate on a fresh disposable project instead of a project already polluted by planner or specialist retries.

## HSQLDB starter NGX
1. Import `template_ngxBuilderIonic` with `marketplace-import` and the exact disposable project name.
2. Open the live dev app immediately with `mobile-builder-open(wait=false)` and keep `viewerHomeUrl` or `viewerBaseUrl` if already available.
3. Call `upsert-crud` with `sequence=true`, `ui=false`.
4. Call `crud-proof` with backend proof requestables such as:
   - `init_schema`
   - `list_contacts`
   - `count_contacts`
   - `list_companies`
   - `count_companies`
5. Call `upsert-ngx-crud-kit` with `stage=bootstrap`.
6. Call `mobile-builder-open(stateOnly=true, wait=true)` again. If it returns `compile_error`, fix the Convertigo source path or MCP generator. Do not patch `_private/ionic`, `DisplayObjects`, or other generated frontend files.
7. Call `upsert-ngx-crud-kit` again with `stage=final`.
8. Call `crud-proof` again with `expectUiShell=true` and the returned `viewerUrl`. If the builder returns a JxBrowser debug endpoint, also smoke the visible Studio viewer through Playwright or browser-control MCP, then confirm:
   - `ui.starterDominant == false`
   - `ui.visibleShellPresent == true`
   - `ui.viewerProbe.ok == true`
   - landing components such as `DashboardStatCard`, `CrudPageHeader`, `CrudLoadingState`, and `CrudErrorRetryState` now exist under `<PROJECT>.Application.NgxApp`
   - entity page components such as `ContactsListPanel`, `ContactsDetailCard`, `ContactsEditForm`, `CompaniesListPanel`, `CompaniesDetailCard`, and `CompaniesEditForm` now exist under `<PROJECT>.Application.NgxApp`
   - the visible entry page uses landing shared components, and each entity page uses the entity-specific `UIUseShared` references
9. In Studio, the project tree should already be refreshed on the project root by the tool itself. If you are validating live during a demo, treat the refreshed tree plus `crud-proof` as the source of truth.

### Copyable HSQL spec
```json
{
  "project": "MiniCRM",
  "starter": "ngx",
  "database": {
    "mode": "hsqldb",
    "connector": "appdb",
    "technology": "HSQLDB",
    "host": "localhost",
    "port": 9001,
    "database": "minicrm",
    "user": "SA",
    "password": ""
  },
  "facade": {
    "prefix": "crm",
    "publicListSequence": "crm_list"
  },
  "entities": [
    {
      "name": "contacts",
      "label": "Contacts",
      "fields": [
        { "name": "Id", "type": "INT", "primary": true },
        { "name": "FirstName", "type": "VARCHAR(128)" },
        { "name": "LastName", "type": "VARCHAR(128)" },
        { "name": "Email", "type": "VARCHAR(255)", "unique": true }
      ]
    },
    {
      "name": "companies",
      "label": "Companies",
      "fields": [
        { "name": "Id", "type": "INT", "primary": true },
        { "name": "Name", "type": "VARCHAR(255)", "unique": true },
        { "name": "Industry", "type": "VARCHAR(128)" },
        { "name": "City", "type": "VARCHAR(128)" }
      ]
    }
  ],
  "seed": {
    "enabled": true,
    "rowsPerEntity": 2
  },
  "ui": {
    "entryPage": "Home",
    "variant": "entity-pages"
  }
}
```

## PostgreSQL starter NGX
- Same order of calls as HSQL.
- Use PostgreSQL credentials and `mode=postgresql`.

## MariaDB starter NGX
- Same order of calls as HSQL.
- Use MariaDB credentials and `mode=mariadb`.

## Proof expectations
- `upsert-crud.status == "success"`
- backend `crud-proof.transactions.missing == []`
- backend `crud-proof.sequences.missing == []` when sequences are enabled
- `upsert-ngx-crud-kit.status == "success"`
- final `crud-proof.ui.starterDominant == false`
- final `crud-proof.ui.visibleShellPresent == true`
- final `crud-proof.ui.viewerProbe.ok == true`

## Shared component fast path
- `upsert-ngx-crud-kit` now creates landing + entity-page shared components directly in the target app.
- These shared components live under `<PROJECT>.Application.NgxApp`, not under the page subtree itself.
- For a two-entity CRUD shell, expect at least:
  - `DashboardStatCard`
  - `CrudPageHeader`
  - `CrudLoadingState`
  - `CrudErrorRetryState`
  - `ContactsListPanel`, `ContactsDetailCard`, `ContactsEditForm`
  - `CompaniesListPanel`, `CompaniesDetailCard`, `CompaniesEditForm`
- The visible entry page should mostly assemble landing components with `UIUseShared`, and each entity page should assemble the entity-specific list/detail/form components.
- This pattern is curated from Convertigo's existing shared-component usage in `lib_ExtendedComponents_ui_ngx`, `lib_Datamodel_ui_ngx`, and `sampleKitchenSink`. Agents should not mine those projects freely during a CRUD fast path; the tool already applies the pattern deterministically.

## Disposable validation projects
- Prefer fresh names such as `CrudSmokeHsql_<timestamp>`, `CrudSmokePg_<timestamp>`, and `CrudSmokeMaria_<timestamp>`.
- Do not use `MiniCRM` as a proof target for the tool itself; it is too easy to inherit stale mutations from prior agent runs.
