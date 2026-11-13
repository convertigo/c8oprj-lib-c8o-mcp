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
- For an existing deterministic CRUD project that is already green, do not import the starter again: use the edit rail documented in `convertigo://resources/convertigo-crud-edit-fastpath`.
- Produce proof after backend creation (`crud-proof`) and again after the pages (`project-lint`, `browser-verify`).
- Refuse tasks that fall outside the standard SQL CRUD + starter NGX path.
- Do not call `rag-query` before you have read `convertigo://resources/convertigo-start` and the fast-path recipe.
- Stay MCP-only: never patch `_private/ionic`, `DisplayObjects`, `dist`, or run manual `npm` builds to repair generated frontend artifacts.
- For a low-detail CRUD request, stop after the first green scaffold + seeded demo data. Do not start a second refinement pass unless the user explicitly asked for custom screens, layout, or field-level UX.
- Prefer best-case-first generated code. Let the standard error bubble surface normal failures unless the user explicitly asked for custom UX around them.

## Required spec
Collect or confirm:
- `project`
- `database.mode`: hsqldb, postgresql, mariadb, mysql, sqlserver or oracle (left out when `database.connector` names an existing SQL connector, whose engine is kept)
- `database.connector`
- `facade.prefix`
- `entities[]`
- the pages the user needs
- optional `ui.language` (`fr` for French messages of the required-field checks)
- optional `relations[]`
- optional `entities[].ui.relationFields.<field>.optionLabelField` (the label of a relation)
- optional `seed.data`
- for the generic CRUD fast path, default to:
  - per entity, a list page, a detail page and a form page built with `ngx-page-create`
  - `seed.profile=realistic`
  - generated CRUD business sequences stay `hidden` with `authenticated context required=true`
  - generated auth skeleton: `auth_login(username,password)` + `auth_logout()`, with a `Login` entry page (`ngx-page-create`, `root:true`) that authenticates once before the home page opens, and a `logout` page
  - declare obvious many-to-one relations in `spec.relations[]`
  - `seed.data` is the preferred first-pass surface for explicit business demo rows
- for the CRM demo profile, prefer:
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
10. For a new project UI pass, run `ngx-theme-apply` once when the user gave a brand, then one `ngx-page-create` per page on the generated business sequences: the `Login` entry page first with `root:true`, `locale` and `currency`; then each list, detail and form page with `home` and `authRedirect:"Login"`; then a `logout` page on `auth_logout`. Delete the starter page `Page` once the entry page is root.
11. For an existing green project UI pass, run `ngx-page-create` only for the new pages; a page to change: delete it and create it again, or patch it with `databaseobject-tree-apply`.
12. Run `mobile-builder-open(stateOnly=true, wait=true)`, then `project-lint`, then `browser-verify` with the live `viewerHomeUrl` from `mobile-builder-open`, the user paths and the expected texts.
13. Save with `project-save` when the target project was mutated and save proof is still needed.
14. If the final proof is green and the request was low-detail, stop there.
15. Do not call planner, critic, or maintainer prompts from this flow.
16. Prefer `spec.relations[]`, `field.references`, and `seed.data` over manual patches of `init_schema`, and `ngx-page-create` over pages composed by hand.
17. Once the CRUD guides already documented the contract, do not run shell searches to rediscover the shapes of `relations[]`, `ui.relationFields`, or `seed.data`.
18. Do not make generated CRUD business sequences public just to get the demo running; keep the hidden/authenticated contract and customize the generated auth skeleton instead.

## Page policy
- `ngx-page-create` builds every list, detail, form, dashboard and logout page; a dashboard page only when the user asks for counters.
- `databaseobject-tree-apply` only for what it does not cover (tabs, cards with actions on each row, a master-detail layout).

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
