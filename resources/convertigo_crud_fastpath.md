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
- public facade sequences
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
- visible entry page is `Page`
- facade prefix is `crud`
- deterministic shared-component shell is acceptable for the first visible pass
- use the exact requested project name when it is technically valid; do not invent prefixes, suffixes, or dates
- for the generic CRUD UI, prefer `ui.variant=entity-pages`
- `entity-pages` means:
  - landing dashboard on `Page`
  - one generated page per entity
  - shared actions + global state + shared components already wired
- if no explicit seed profile is provided, use `seed.profile=realistic`
- treat `dashboard` as a legacy single-page fallback
- for the CRM demo profile, prefer `ui.variant=master-detail`, `seed.profile=crm`, `seed.rowsPerEntity=20`, and relation `Contact.CompanyId -> Company.Id`
- for a low-detail CRUD request, the first acceptable delivery point is the first green scaffold plus seeded demo data; refinement comes only if the user asked for it
- when relations are obvious, declare them explicitly in `spec.relations[]`; `field.references` remains accepted for compatibility
- for generic `entity-pages`, prefer entity-level UI hints such as `ui.listFields`, `ui.detailFields`, `ui.formFields`, `ui.fieldLabels`, `ui.actionLabel`, and `ui.relationFields` over direct edits on generated CRUD-kit shared components

## Deterministic rail
1. For a new UI project, import `template_ngxBuilderIonic` explicitly with `marketplace-import` and the exact requested project name.
2. Open the app immediately with `mobile-builder-open` and keep the returned live dev URL. Prefer `viewerHomeUrl` or `viewerBaseUrl`; reserve `.../DisplayObjects/mobile/home` for production builds.
3. Call `upsert-crud` with a complete `spec`.
4. Call `crud-proof` for backend evidence.
5. If backend proof is green and the task includes UI, call `upsert-ngx-crud-kit` with `stage=bootstrap`.
6. Call `mobile-builder-open` again after the bootstrap shell exists. If it returns `compile_error`, fix the Convertigo source path or the MCP generator. Do not patch `_private/ionic`, `DisplayObjects`, or other generated files.
7. Call `upsert-ngx-crud-kit` again with `stage=final`.
8. Call `crud-proof` again with `expectUiShell=true` and the `viewerUrl`.
9. Save with `project-save` if the target project was mutated and the save is not already covered by the tool result.
10. If the request was low-detail and the final proof is green, stop there. Do not improvise a second pass on layout, forms, labels, or entity-specific UX.

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
- expect a derived public facade such as `list_employees_by_company`

## Anti-patterns
- Do not route a standard CRUD task through planner/specialist handoffs first.
- Do not let the agent rediscover CRUD scaffolding manually when `upsert-crud` already fits.
- Do not accept a run where the starter body is still dominant on the visible page.
- Do not use RAG before the built-in CRUD tools and guides are exhausted.
- Do not continue mutating the generated CRUD UI after the first green proof unless the user explicitly asked for more than the generic scaffold.
- Do not patch CRUD-kit-managed shared components directly when `spec.relations[]`, `field.references`, `ui.listFields`, `ui.detailFields`, `ui.formFields`, or `ui.relationFields` can express the needed CRUD behavior.
