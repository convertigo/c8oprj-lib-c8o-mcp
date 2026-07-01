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
- hidden CRUD facade sequences plus the generated auth skeleton
- visible CRUD shell on the real entry page
- deterministic proof of backend and UI state

Out of scope:
- custom multi-track orchestration
- broad planner/specialist handoff
- complex handwritten NGX composition before proof
- RAG-first exploration

## Required inputs
Capture these before the first mutation:
- `project`
- `database.mode`
- `database.connector`
- `facade.prefix`
- `entities[]`
- `ui.entryPage`
- optional `ui.variant`

Default assumptions for the fast path:
- starter-derived NGX app
- visible entry page is `Home`
- facade prefix is `crud`
- deterministic shared-component shell is acceptable for the first visible pass
- use the exact requested project name when it is technically valid; do not invent prefixes, suffixes, or dates
- for the generic CRUD UI, prefer `ui.variant=entity-pages`
- `entity-pages` means:
  - landing dashboard on `Home`
  - one generated page per entity
  - shared actions + global state + shared components already wired
- if no explicit seed profile is provided, use `seed.profile=realistic`
- if the user wants explicit business demo rows, use `seed.data`
- treat `dashboard` as a legacy single-page fallback
- for the CRM demo profile, prefer `ui.variant=master-detail`, `seed.profile=crm`, `seed.rowsPerEntity=20`, and relation `Contact.CompanyId -> Company.Id`
- for a low-detail CRUD request, the first acceptable delivery point is the first green scaffold plus seeded demo data; refinement comes only if the user asked for it
- when relations are obvious, declare them explicitly in `spec.relations[]`; `field.references` remains accepted for compatibility
- for generic `entity-pages`, prefer entity-level UI hints such as `ui.listFields`, `ui.detailFields`, `ui.formFields`, `ui.fieldLabels`, `ui.actionLabel`, and `ui.relationFields` over direct edits on generated CRUD-kit shared components
- relation controls default to `select`; use `ui.relationFields.<field>.control=autocomplete` only when the larger option set really needs it
- generated CRUD facade sequences are `hidden` and require an authenticated context; `auth_login(username,password)` and `auth_logout()` are hidden skeleton sequences, and generated UI apps initialize that session once on a `Login` root page before the visible CRUD home page opens
- prefer best-case-first generated code and trust the standard error bubble unless the user explicitly asked for special UX around failures

## Deterministic rail
1. For a new UI project, import `template_ngxBuilderIonic` explicitly with `marketplace-import` and the exact requested project name.
2. Open the app immediately with `mobile-builder-open(wait=false)` so the viewer starts asynchronously while backend work continues. Keep the returned live dev URL if it is already available. Prefer `viewerHomeUrl` or `viewerBaseUrl`; reserve `.../DisplayObjects/mobile/home` for production builds.
3. Call `upsert-crud` with a complete `spec`.
4. Call `crud-proof` for backend evidence.
5. If backend proof is green and the task includes UI, call `upsert-ngx-crud-kit` with `stage=bootstrap`.
6. Call `mobile-builder-open(stateOnly=true, wait=true)` again after the bootstrap shell exists. If it returns `compile_error`, fix the Convertigo source path or the MCP generator. Do not patch `_private/ionic`, `DisplayObjects`, or other generated files.
7. Call `upsert-ngx-crud-kit` again with `stage=final`.
8. Call `crud-proof` again with `expectUiShell=true` and the `viewerUrl`. When the waited builder result exposes `browserDebugUrl`, `browserDevToolsJsonUrl`, or `browserDevToolsWebSocketUrl`, also use Playwright or browser-control MCP against that JxBrowser endpoint for the visible Studio viewer smoke proof.
9. Save with `project-save` if the target project was mutated and the save is not already covered by the tool result.
10. If the request was low-detail and the final proof is green, stop there. Do not improvise a second pass on layout, forms, labels, or entity-specific UX.

## Existing project edit rail
If the target is already a deterministic CRUD project and the UI is already green, do not replay the new-project rail. Use `convertigo://resources/convertigo-crud-edit-fastpath` instead:
1. Run `crud-status`.
2. Build the full updated `spec`.
3. Run `upsert-crud` with `sequence=true` and `ui=false`.
4. Run backend `crud-proof`.
5. Run one `upsert-ngx-crud-kit stage=final`.
6. Run `mobile-builder-open(stateOnly=true, wait=true)`.
7. Run final `crud-proof(expectUiShell=true, viewerUrl=...)`.
8. Save with `project-save` if needed, then stop.

Do not:
- rerun `stage=bootstrap`
- patch `init_schema` manually
- grep the local workspace just to rediscover `relations[]`, `ui.relationFields`, or `seed.data`
- normalize `project-reload` into the edit rail

## Proof contract
`crud-proof` is sufficient when all of these hold:
- `status` is `success`
- `missing` is empty
- `transactions.missing` is empty
- `sequences.missing` is empty when facade sequences are expected
- proof requestables report `ok=true`
- when `expectUiShell=true`, `ui.visibleShellPresent == true`
- when `expectUiShell=true`, `ui.starterDominant == false`
- when a `viewerUrl` is provided, `ui.viewerProbe.ok == true`

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
- optionally configure the UI through `entities[].ui.relationFields.company_id`
- expect the backend to expose `company_id__label` in `list_employees` / `read_employee`
- expect a derived CRUD facade such as `list_employees_by_company`

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
            "control": "select",
            "optionLabelField": "name",
            "optionValueField": "id",
            "placeholder": "Select company"
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
            "control": "select",
            "optionLabelField": "name",
            "optionValueField": "id",
            "placeholder": "Select region"
          },
          "primary_type_id": {
            "control": "select",
            "optionLabelField": "name",
            "optionValueField": "id",
            "placeholder": "Select primary type"
          },
          "secondary_type_id": {
            "control": "autocomplete",
            "optionLabelField": "name",
            "optionValueField": "id",
            "placeholder": "Select optional secondary type"
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
- Do not accept a run where the starter body is still dominant on the visible page.
- Do not use RAG before the built-in CRUD tools and guides are exhausted.
- Do not continue mutating the generated CRUD UI after the first green proof unless the user explicitly asked for more than the generic scaffold.
- Do not patch CRUD-kit-managed shared components directly when `spec.relations[]`, `field.references`, `ui.listFields`, `ui.detailFields`, `ui.formFields`, or `ui.relationFields` can express the needed CRUD behavior.
- Do not patch `init_schema` manually just to inject better demo rows when `seed.data` can express them in the spec.
- Do not expose generated CRUD facades as public requestables; keep the hidden/authenticated contract and customize the generated auth skeleton instead.
