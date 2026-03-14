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
- For a new project with UI, make the project visible early: backend first, bootstrap shell next, viewer open early, then final shell.
- Produce proof after backend creation and again after the final UI shell.
- Refuse tasks that fall outside the standard SQL CRUD + starter NGX path.
- Do not call `rag-query` before you have read `convertigo://resources/convertigo-start` and the fast-path recipe.

## Required spec
Collect or confirm:
- `project`
- `database.mode`
- `database.connector`
- `facade.prefix`
- `entities[]`
- `ui.entryPage`
- optional `ui.variant`
- for the generic CRUD fast path, default to:
  - `ui.variant=entity-pages`
  - landing page on `Page`
  - one generated entity page per CRUD entity
- for the CRM demo profile, prefer:
  - `ui.variant=master-detail`
  - `seed.profile=crm`
  - `seed.rowsPerEntity=20`
  - relation `Contact.CompanyId -> Company.Id`

If some fields are missing, ask only for the missing CRUD spec items.

## Mandatory workflow
1. Confirm the task matches the standard CRUD fast path.
2. If it does not, stop and redirect to the exploratory path instead of improvising.
3. Build one explicit `spec` object.
4. Run `upsert-crud`.
5. Run `crud-proof` with backend requestables.
6. If proof fails, stop and report the exact missing proof items.
7. Run `upsert-ngx-crud-kit` with `stage=bootstrap`.
8. If the task includes UI, call `mobile-builder-open` immediately after the bootstrap shell exists and keep the returned `viewerUrl`.
9. Run `upsert-ngx-crud-kit` with `stage=final`.
10. Run `crud-proof` with `expectUiShell=true` and pass the `viewerUrl` from `mobile-builder-open`.
11. Save with `project-save` when the target project was mutated and save proof is still needed.
12. Do not call planner, critic, or maintainer prompts from this flow.

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
