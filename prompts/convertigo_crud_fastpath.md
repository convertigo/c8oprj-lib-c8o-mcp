# Convertigo CRUD Fast Path

## When to use this prompt
Use this prompt as the recommended public path for a standard SQL CRUD + starter NGX UI task. This is the current mono-agent MCP path. Do not spawn specialists.

## Read these guides first
- If this is a fresh session, call `resources/list`.
- If live prompt discovery is available in the caller surface, call `prompts/list` before choosing the role prompt.
- `convertigo://capabilities`
- `convertigo://recipes/quickstart`
- `convertigo://resources/convertigo-start`
- `convertigo://resources/convertigo-crud-fastpath`
- `convertigo://resources/convertigo-validation-and-evidence`

Read `convertigo://resources/convertigo-crud-practical-cases` only when the current proof is unclear or when the driver-specific flow needs confirmation.

## Mission
- Stay in one mono-agent MCP flow.
- Collect the minimum CRUD spec required for deterministic execution.
- Prefer MCP CRUD accelerators over manual tree authoring.
- For a new project with UI, make the project visible immediately: import the starter with the exact name, open the viewer, then mutate the CRUD scaffolding live.
- For an existing deterministic CRUD project that is already green, skip the bootstrap UI pass and use the one-pass edit rail documented in `convertigo://resources/convertigo-crud-edit-fastpath`.
- Produce proof after backend creation and again after the final UI shell.
- Refuse tasks that fall outside the standard SQL CRUD + starter NGX path.
- Do not call `rag-query` before you have read `convertigo://resources/convertigo-start` and the fast-path recipe.
- Stay MCP-only: never patch `_private/ionic`, `DisplayObjects`, `dist`, or run manual `npm` builds to repair generated frontend artifacts.
- For a low-detail CRUD request, stop after the first green scaffold + seeded demo data. Do not start a second refinement pass unless the user explicitly asked for custom screens, layout, or field-level UX.
- Prefer best-case-first generated code. Let the standard error bubble surface normal failures unless the user explicitly asked for custom UX around them.

## Required spec
Collect or confirm:
- `project`
- `database.mode`
- `database.connector`
- `facade.prefix`
- `entities[]`
- `ui.entryPage`
- optional `ui.variant`
- optional `relations[]`
- optional `entities[].ui.relationFields`
- optional `seed.data`
- for the generic CRUD fast path, default to:
  - `ui.variant=entity-pages`
  - landing page on `Home`
  - one generated entity page per CRUD entity
  - `seed.profile=realistic`
  - generated CRUD facades stay `hidden` with `authenticated context required=true`
  - generated auth skeleton: `auth_login(username,password)` + `auth_logout()`, with a `Login` root page that authenticates once before the visible CRUD home page opens
  - declare obvious many-to-one relations in `spec.relations[]`
  - use entity-level UI hints such as `ui.listFields`, `ui.detailFields`, `ui.formFields`, `ui.fieldLabels`, `ui.actionLabel`, and `ui.relationFields` when the user explicitly asks for better visible fields without a custom redesign
  - `seed.data` is the preferred first-pass surface for explicit business demo rows
- for the CRM demo profile, prefer:
  - `ui.variant=master-detail`
  - `seed.profile=crm`
  - `seed.rowsPerEntity=20`
  - relation `Contact.CompanyId -> Company.Id`

Use the exact requested project name when it is technically valid. Do not invent prefixes, suffixes, or dates.

If some fields are missing, ask only for the missing CRUD spec items.

## Mandatory workflow
1. Confirm the task matches the standard CRUD fast path.
2. If it does not, stop and redirect to the exploratory path instead of improvising.
3. Build one explicit `spec` object.
4. If the target project does not exist yet and the task includes UI, run `marketplace-import` with `template_ngxBuilderIonic` and the exact requested project name.
5. If the target project does not exist yet and the task includes UI, call `mobile-builder-open(wait=false)` immediately after the starter import so the viewer opens asynchronously. Keep `viewerHomeUrl` or `viewerBaseUrl` when already available for the live dev app.
6. If the target project already exists and `crud-status` confirms a green deterministic CRUD rail, stay on the existing-project edit fast path instead of replaying the new-project bootstrap.
7. Run `upsert-crud`.
8. Run `crud-proof` with backend requestables.
9. If proof fails, stop and report the exact missing proof items.
10. For a new project UI pass, run `upsert-ngx-crud-kit` with `stage=bootstrap`, probe with `mobile-builder-open(stateOnly=true, wait=true)`, then run `stage=final`.
11. For an existing green project UI pass, run only one `upsert-ngx-crud-kit` with `stage=final`.
12. Run `crud-proof` with `expectUiShell=true` and pass the live `viewerUrl` from `mobile-builder-open`.
13. Save with `project-save` when the target project was mutated and save proof is still needed.
14. If the final proof is green and the request was low-detail, stop there.
15. Do not call planner, critic, or maintainer prompts from this flow.
16. Prefer `spec.relations[]`, `field.references`, entity-level UI hints (`ui.listFields`, `ui.detailFields`, `ui.formFields`, `ui.fieldLabels`, `ui.actionLabel`, `ui.relationFields`), and `seed.data` over direct edits on CRUD-kit-managed shared components or manual patches of `init_schema`.
17. Once the CRUD guides already documented the contract, do not run shell searches to rediscover the shapes of `relations[]`, `ui.relationFields`, or `seed.data`.
18. Do not make generated CRUD facades public just to get the demo running; keep the hidden/authenticated contract and customize the generated auth skeleton instead.

## UI variant policy
- `entity-pages` is the recommended generic CRUD UI.
- `dashboard` is a legacy single-page fallback, kept for compatibility only.
- `master-detail` remains the recommended CRM-specific UI.

## Out-of-scope redirect
If the request needs custom backend architecture, HTTP integration, or non-standard handwritten NGX composition before CRUD proof, stop with:
- `Route`: `exploratory`
- `Reason`: one short sentence

## Output format
Return these sections in order:
- `Spec`
- `Actions`
- `Proof`
- `Route`
- `MCP Critique`
