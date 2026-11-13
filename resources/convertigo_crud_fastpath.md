# Convertigo CRUD Fast Path

## When to read this
Read this first when the task is a standard SQL CRUD feature on top of a starter NGX app and the goal is reliable delivery, not broad exploration.

On a fresh session, do not jump here blind. Start with `resources/list`, use `prompts/list` when the caller exposes prompt discovery, then read:
- `convertigo://capabilities`
- `convertigo://recipes/quickstart`
- `convertigo://resources/convertigo-start`

Then use this guide as the deterministic rail for the CRUD case.

## Scope
This fast path is the recommended public path for the current mono-agent recovery cycle.

In scope:
- starter NGX project or existing starter-derived project
- SQL CRUD scaffold
- hidden CRUD business sequences plus the generated auth skeleton
- the app's pages, built with `ngx-page-create` on the generated business sequences
- proof of the backend (`crud-proof`) and of the pages in a browser (`browser-verify`)

Out of scope:
- custom multi-track orchestration
- broad planner/specialist handoff
- complex handwritten NGX composition before proof
- RAG-first exploration

## Required inputs
Capture these before the first mutation:
- `project`
- `database.mode`: hsqldb, postgresql, mariadb, mysql, sqlserver or oracle (left out when `database.connector` names an existing SQL connector, whose engine is kept)
- `database.connector`
- `facade.prefix`
- `entities[]`
- the pages the user needs (by default, per entity: a list, a detail and a form)
- `ui.language`: `fr` for French messages of the required-field checks of `upsert-crud` (default `en`); give the page texts of `ngx-page-create` in the user's language too

Default assumptions for the fast path:
- starter-derived NGX app
- business sequence prefix is `crud`
- the app opens on a `Login` page that signs in with the generated `auth_login`, then on its home page (the main list, or a dashboard when the user asks for counters)
- use the exact requested project name when it is technically valid; do not invent prefixes, suffixes, or dates
- if no explicit seed profile is provided, use `seed.profile=realistic`
- if the user wants explicit business demo rows, use `seed.data`
- in `seed.data`, the foreign keys of one row agree with each other: a deal's contact works for the deal's company, an order line's product is one the order's supplier sells. Check each row against the rows it points to.
- in `seed.data`, dates are placed relative to today, the date of the conversation (never a year from memory): a deadline, a due date or an expected close date falls after today (a few days to a few months), a creation, a last contact or a closed date before it. Fixed dates from memory put every open deal or task in the past, so the app shows them all as overdue.
- To read data while you build (check rows, find an id, count, compare), run one SELECT with `sql-select`: a read-only connection to the project's SQL connector, bounded rows (`maxRows`, 50 by default), values written in the SQL, nothing created nor saved in the project. Or call what exists with `requestable-execute`: the list and count transactions of the connector (`<project>.<connector>.list_<entity>`, `count_<entity>`) or the list business sequence (with `authenticatedUser` when it requires a session). Never create and delete probe transactions to read data: each one is a project change, saved and rebuilt (22 of them in one CRM turn). When the app itself needs a value nothing returns, create one read transaction `q_<what>` the app keeps.
- for the CRM demo profile, prefer `seed.profile=crm`, `seed.rowsPerEntity=20`, and relation `Contact.CompanyId -> Company.Id`
- for a low-detail CRUD request, the first acceptable delivery point is the first green scaffold plus seeded demo data, with its pages proven in a browser; refinement comes only if the user asked for it
- when relations are obvious, declare them explicitly in `spec.relations[]`; `field.references` remains accepted for compatibility. `ui.relationFields.<field>.optionLabelField` names the field of the related entity that the list and read business sequences return as `<field>__label`
- generated CRUD business sequences are `hidden` and require an authenticated context; `auth_login(username,password)` and `auth_logout()` are hidden skeleton sequences (the generated `auth_login` accepts any password; replace it with a real check from `convertigo://resources/convertigo-authentication` before delivery). The app signs in once on its `Login` entry page before its pages call them, and each protected page takes `authRedirect:"Login"`
- the upsert-crud business sequences answer their data itself: `{rows}` (list), `{row}` (read), `{total}` (count), `{message}` (create, update, delete), `{error}` when they fail; `ngx-page-create` reads that shape, so a list page takes `list.items:"rows"` and a detail page `detail.record:"row"`
- prefer best-case-first generated code and trust the standard error bubble unless the user explicitly asked for special UX around failures

## Deterministic rail
1. Validate the requested project name. For a new UI project, import `template_ngxBuilderIonic` explicitly with `marketplace-import` and that exact name.
2. Open the app immediately with `mobile-builder-open(wait=false)` so the viewer starts asynchronously while backend work continues. Keep the returned live dev URL if it is already available. Open `viewerHomeUrl` (never `viewerBaseUrl`, which can serve the update page); reserve `.../DisplayObjects/mobile/home` for production builds.
3. Call `upsert-crud` with a complete `spec`.
4. Call `crud-proof` for backend evidence.
5. If the user gave a brand (a color, a style), call `ngx-theme-apply` once, before the pages.
6. Call `ngx-page-create` once per page, on the business sequences `upsert-crud` generated (`<prefix>_list_<entities>`, `<prefix>_read_<entity>`, `<prefix>_create_<entity>`, `<prefix>_update_<entity>`): first the `Login` entry page with `root:true`, `locale` and `currency`; then the list, detail and form pages of each entity, each with `home` and `authRedirect:"Login"`; then a `logout` page on `auth_logout`. A refused call lists every problem and creates nothing: fix the spec and send it again. Once the entry page is root, delete the starter page `Page`.
7. Call `mobile-builder-open(stateOnly=true, wait=true)`. If it returns `compile_error`, fix the Convertigo source path or the MCP generator. Do not patch `_private/ionic`, `DisplayObjects`, or other generated files.
8. Run `project-lint` and fix what it reports.
9. Prove the pages with `browser-verify`: `url` the `viewerHomeUrl`, `paths` such as sign in, open each list, open a record, create one, and `checks` with the expected texts. Without it, use the Playwright tools as the common skill says; if those MCP browser tools are unavailable, disabled, stale, or attached elsewhere, report the managed Playwright MCP configuration problem instead of using Node scripts, raw CDP, or a separate browser.
10. Save with `project-save` if the target project was mutated and the save is not already covered by the tool result.
11. If the request was low-detail and the final proof is green, stop there. Do not improvise a second pass on layout, forms, labels, or entity-specific UX.

The first pages of a two-entity app, one `ngx-page-create` call each (`<field>` is a column of the row, as `crud-proof` or `requestable-execute` shows it):

```json
{"project":"<App>","name":"Login","kind":"form","title":"Sign in","root":true,"locale":"en-US","currency":"USD",
 "form":{"submit":"auth_login","fields":[{"name":"username","label":"User","type":"text","required":true},{"name":"password","label":"Password","type":"password","required":true}],
  "success":{"page":"Contacts","kind":"root"},"cancel":false,"submitLabel":"Sign in"}}
{"project":"<App>","name":"Contacts","kind":"list","title":"Contacts","sequence":"crud_list_contacts","home":"Contacts","authRedirect":"Login",
 "list":{"items":"rows","item":"contact","title":"<field>","subtitle":"<field>","onItem":{"page":"ContactDetail","data":{"id":"id"}}}}
{"project":"<App>","name":"ContactDetail","kind":"detail","title":"Contact","sequence":"crud_read_contact","params":["id"],"home":"Contacts","authRedirect":"Login",
 "detail":{"record":"row","fields":[{"label":"Email","field":"<field>"}]}}
{"project":"<App>","name":"Logout","kind":"logout","title":"Sign out","sequence":"auth_logout","home":"Contacts","logout":{"page":"Login"}}
```

## Existing project edit rail
If the target is already a deterministic CRUD project and its pages are already green, do not replay the new-project rail. Use `convertigo://resources/convertigo-crud-edit-fastpath` instead:
1. Run `crud-status`.
2. Build the full updated `spec`.
3. Run `upsert-crud` with `sequence=true`.
4. Run backend `crud-proof`.
5. Run `ngx-page-create` for each new page. A page to change: delete it and create it again, or patch it with `databaseobject-tree-apply`.
6. Run `mobile-builder-open(stateOnly=true, wait=true)`.
7. Run `project-lint`, then `browser-verify` on the changed paths.
8. Save with `project-save` if needed, then stop.

Do not:
- import the starter again or create again a page that did not change
- patch `init_schema` manually
- grep the local workspace just to rediscover `relations[]`, `ui.relationFields`, or `seed.data`
- normalize `project-reload` into the edit rail

## Proof contract
`crud-proof` proves the backend when all of these hold:
- `status` is `success`
- `missing` is empty
- `transactions.missing` is empty
- `sequences.missing` is empty when business sequences are expected
- proof requestables report `ok=true`

Do not pass `expectUiShell` to `crud-proof`: its UI checks look for the pages of an older UI generator. The pages are proven by `project-lint` without error and a `browser-verify` verdict `passed`.

## Example proof requestables
For the default `Contact` / `Company` fast path:
- `init_schema`
- `list_contacts`
- `count_contacts`
- `list_companies`
- `count_companies`
- `list_company_contacts`

For a generic many-to-one relation such as `employees.company_id -> companies.id`:
- declare the relation in `spec.relations[]`
- optionally choose the label field through `entities[].ui.relationFields.company_id.optionLabelField`
- expect the backend to expose `company_id__label` in `list_employees` / `read_employee`
- expect a derived CRUD business sequence such as `list_employees_by_company`

## Canonical examples

### Employees / companies

```json
{
  "project": "EmployeesCompanies",
  "facade": { "prefix": "hr" },
  "relations": [
    {
      "name": "employee_company",
      "type": "many-to-one",
      "fromEntity": "employees",
      "fromField": "company_id",
      "toEntity": "companies",
      "toField": "id",
      "label": "Company",
      "required": true
    }
  ],
  "entities": [
    {
      "name": "companies",
      "fields": [
        { "name": "Id", "type": "INT", "primary": true },
        { "name": "Name", "type": "VARCHAR(128)", "unique": true },
        { "name": "City", "type": "VARCHAR(128)" },
        { "name": "Industry", "type": "VARCHAR(128)" }
      ]
    },
    {
      "name": "employees",
      "fields": [
        { "name": "Id", "type": "INT", "primary": true },
        { "name": "FirstName", "type": "VARCHAR(128)" },
        { "name": "LastName", "type": "VARCHAR(128)" },
        { "name": "Email", "type": "VARCHAR(255)", "unique": true },
        { "name": "Title", "type": "VARCHAR(128)" },
        { "name": "CompanyId", "column": "company_id", "type": "INT", "required": true }
      ],
      "ui": {
        "relationFields": {
          "company_id": {
            "optionLabelField": "name",
            "optionValueField": "id"
          }
        }
      }
    }
  ],
  "seed": {
    "enabled": true,
    "data": {
      "companies": [
        { "name": "Blue Orbit", "city": "Paris", "industry": "Software" },
        { "name": "North Harbor", "city": "Lyon", "industry": "Logistics" }
      ],
      "employees": [
        { "first_name": "Nora", "last_name": "Martin", "email": "nora.martin@example.test", "title": "Account manager", "company_id": 1 },
        { "first_name": "Leo", "last_name": "Bernard", "email": "leo.bernard@example.test", "title": "Field engineer", "company_id": 2 }
      ]
    }
  }
}
```

### Pokemon / types / regions

```json
{
  "project": "PokemonCatalog",
  "facade": { "prefix": "pk" },
  "relations": [
    {
      "name": "pokemon_region",
      "type": "many-to-one",
      "fromEntity": "pokemon",
      "fromField": "region_id",
      "toEntity": "regions",
      "toField": "id",
      "label": "Region",
      "required": true
    },
    {
      "name": "pokemon_primary_type",
      "type": "many-to-one",
      "fromEntity": "pokemon",
      "fromField": "primary_type_id",
      "toEntity": "types",
      "toField": "id",
      "label": "Primary type",
      "required": true
    },
    {
      "name": "pokemon_secondary_type",
      "type": "many-to-one",
      "fromEntity": "pokemon",
      "fromField": "secondary_type_id",
      "toEntity": "types",
      "toField": "id",
      "label": "Secondary type"
    }
  ],
  "entities": [
    {
      "name": "pokemon",
      "ui": {
        "relationFields": {
          "region_id": {
            "optionLabelField": "name",
            "optionValueField": "id"
          },
          "primary_type_id": {
            "optionLabelField": "name",
            "optionValueField": "id"
          },
          "secondary_type_id": {
            "optionLabelField": "name",
            "optionValueField": "id"
          }
        }
      }
    }
  ],
  "seed": {
    "enabled": true,
    "data": {
      "types": [
        { "name": "Grass" },
        { "name": "Poison" },
        { "name": "Electric" }
      ],
      "regions": [
        { "name": "Kanto" }
      ],
      "pokemon": [
        { "name": "Bulbasaur", "region_id": 1, "primary_type_id": 1, "secondary_type_id": 2 },
        { "name": "Pikachu", "region_id": 1, "primary_type_id": 3 }
      ]
    }
  }
}
```

## Anti-patterns
- Do not route a standard CRUD task through planner/specialist handoffs first.
- Do not let the agent rediscover CRUD scaffolding manually when `upsert-crud` already fits.
- Do not let the agent rediscover `relations[]`, `ui.relationFields`, or `seed.data` manually once the public CRUD guides already document them.
- Do not accept a run where the app still opens on the starter page.
- Do not use RAG before the built-in CRUD tools and guides are exhausted.
- Do not continue changing the pages after the first green proof unless the user explicitly asked for more than the generic scaffold.
- Do not compose by hand a list, detail, form, dashboard or logout page that `ngx-page-create` can build.
- Do not patch `init_schema` manually just to inject better demo rows when `seed.data` can express them in the spec.
- Do not expose generated CRUD business sequences as public requestables; keep the hidden/authenticated contract and customize the generated auth skeleton instead.
