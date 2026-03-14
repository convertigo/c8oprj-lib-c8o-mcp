# Convertigo CRUD Fast Path

## When to read this
Read this first when the task is a standard SQL CRUD feature on top of a starter NGX app and the goal is reliable delivery, not broad exploration.

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
- for the CRM demo profile, prefer `ui.variant=master-detail`, `seed.profile=crm`, `seed.rowsPerEntity=20`, and relation `Contact.CompanyId -> Company.Id`

## Deterministic rail
1. Call `upsert-crud` with a complete `spec`.
2. Call `crud-proof` for backend evidence.
3. If backend proof is green and the task includes UI, call `upsert-ngx-crud-kit` with `stage=bootstrap`.
4. Open the app early with `mobile-builder-open` and keep the returned `viewerUrl`.
5. Call `upsert-ngx-crud-kit` again with `stage=final`.
6. Call `crud-proof` again with `expectUiShell=true` and the `viewerUrl`.
7. Save with `project-save` if the target project was mutated and the save is not already covered by the tool result.

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

## Anti-patterns
- Do not route a standard CRUD task through planner/specialist handoffs first.
- Do not let the agent rediscover CRUD scaffolding manually when `upsert-crud` already fits.
- Do not accept a run where the starter body is still dominant on the visible page.
- Do not use RAG before the built-in CRUD tools and guides are exhausted.
