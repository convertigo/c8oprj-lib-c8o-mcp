# Convertigo CRUD Practical Cases

Use these direct MCP calls for standard CRUD scaffolding before asking agents to improvise.
Always validate on a fresh disposable project instead of a project already polluted by planner or specialist retries.

## HSQLDB starter NGX
1. Call `upsert-crud` with `sequence=true`, `ui=false`.
2. Call `crud-status`.
3. Call `requestable-execute` on:
   - `init_schema`
   - `list_contacts`
   - `count_contacts`
   - `list_companies`
   - `count_companies`
4. Call `upsert-ngx-crud-kit`.
5. Call `crud-status` again and confirm:
   - `ui.starterDominant == false`
   - `ui.visibleShellPresent == true`
   - shared components such as `ContactTable`, `ContactCard`, `ContactForm`, `CompanyTable`, `CompanyCard`, `CompanyForm` now exist under `<PROJECT>.Application.NgxApp`
   - the visible entry page uses those components through `UIUseShared` and `sharedcomponent` references
6. In Studio, the project tree should already be refreshed on the project root by the tool itself. If you are validating live during a demo, treat the refreshed tree plus `crud-status` as the source of truth.

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
    "entryPage": "Page",
    "variant": "dashboard"
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
- `crud-status.transactions.missing == []`
- `crud-status.sequences.missing == []` when sequences are enabled
- `upsert-ngx-crud-kit.status == "success"`
- final `crud-status.ui.starterDominant == false`
- final `crud-status.ui.visibleShellPresent == true`

## Shared component fast path
- `upsert-ngx-crud-kit` now creates entity-specific `UISharedRegularComponent` objects directly in the target app.
- These shared components live under `<PROJECT>.Application.NgxApp`, not under the page subtree itself.
- For a two-entity CRUD shell, expect at least:
  - `DashboardStatCard`
  - `CrudLoadingState`
  - `CrudEmptyState`
  - `CrudErrorRetryState`
  - `ContactTable`, `ContactCard`, `ContactForm`
  - `CompanyTable`, `CompanyCard`, `CompanyForm`
- The visible entry page should mostly assemble those components with `UIUseShared` and `UIUseVariable`, not rebuild the shell inline.
- This pattern is curated from Convertigo's existing shared-component usage in `lib_ExtendedComponents_ui_ngx`, `lib_Datamodel_ui_ngx`, and `sampleKitchenSink`. Agents should not mine those projects freely during a CRUD fast path; the tool already applies the pattern deterministically.

## Disposable validation projects
- Prefer fresh names such as `CrudSmokeHsql_<timestamp>`, `CrudSmokePg_<timestamp>`, and `CrudSmokeMaria_<timestamp>`.
- Do not use `MiniCRM` as a proof target for the tool itself; it is too easy to inherit stale mutations from prior agent runs.
