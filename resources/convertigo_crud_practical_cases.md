# Convertigo CRUD Practical Cases

Use these direct MCP calls for standard CRUD scaffolding before asking agents to improvise.
Always validate on a fresh disposable project instead of a project already polluted by planner or specialist retries.

## HSQLDB starter NGX
1. Import `template_ngxBuilderIonic` with `marketplace-import` and the exact disposable project name.
2. Open the live dev app immediately with `mobile-builder-open(wait=false)` and keep `viewerHomeUrl` if already available (never `viewerBaseUrl`, which can serve the update page).
3. Call `upsert-crud` with `sequence=true`.
4. Call `crud-proof` with backend proof requestables such as:
   - `init_schema`
   - `list_contacts`
   - `count_contacts`
   - `list_companies`
   - `count_companies`
5. If the user gave a brand, call `ngx-theme-apply` once.
6. Call `ngx-page-create` once per page, on the business sequences `upsert-crud` generated: the `Login` entry page first (`root:true`, `locale`, `currency`), then the list, detail and form pages of `contacts` and `companies` (`home`, `authRedirect:"Login"`), then a `logout` page on `auth_logout`. `convertigo-crud-fastpath` gives the calls of the first pages. Delete the starter page `Page` once the entry page is root.
7. Call `mobile-builder-open(stateOnly=true, wait=true)` again. If it returns `compile_error`, fix the Convertigo source path or MCP generator. Do not patch `_private/ionic`, `DisplayObjects`, or other generated frontend files.
8. Call `project-lint` and fix what it reports.
9. Call `browser-verify` with the `viewerHomeUrl`, one path per user journey (sign in, open each list, open a record, create one) and the expected texts as `checks`. Without it, use the Playwright tools; if those MCP browser tools are unavailable, disabled, stale, or attached elsewhere, report the managed Playwright MCP configuration problem instead of using Node scripts, raw CDP, or a separate browser. Then confirm:
   - the app opens on the `Login` page, not on the starter page
   - each list shows the seeded rows, and a row opens its detail
   - the verdict is `passed`
10. In Studio, the project tree should already be refreshed on the project root by the tool itself. If you are validating live during a demo, treat the refreshed tree plus `crud-proof` and `browser-verify` as the source of truth.

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
- each `ngx-page-create` call answers the created QNames, without error
- `project-lint` reports no `error` finding
- `browser-verify` answers the verdict `passed`

## Disposable validation projects
- Prefer fresh names such as `CrudSmokeHsql_<timestamp>`, `CrudSmokePg_<timestamp>`, and `CrudSmokeMaria_<timestamp>`.
- Do not use `MiniCRM` as a proof target for the tool itself; it is too easy to inherit stale mutations from prior agent runs.
