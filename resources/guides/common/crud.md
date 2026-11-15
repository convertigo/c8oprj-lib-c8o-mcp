# New and existing CRUD routing

Read when: New and existing CRUD routing. Summary: `convertigo://guides/common`.
Previous: `convertigo://guides/common/backend`. Next: `convertigo://guides/common/review`.

---

## CRUD routing

- Do not ask the user to choose `upsert-crud`. Decide it yourself: use the CRUD rail only when the task is a standard SQL CRUD + starter NGX UI fit.
- New CRUD project rail: validate the name, `marketplace-import({project:"template_ngxBuilderIonic", importedProjectName:"<targetProject>"})`, `mobile-builder-open(wait=false)`, `upsert-crud`, backend `crud-proof`, `ngx-theme-apply` when the user gave a brand, one `ngx-page-create` per page on the generated business sequences (the `Login` entry page with `root:true`, `locale` and `currency` with the first page, `home` on each page, `authRedirect:"Login"` on each protected page, a `logout` page), `mobile-builder-open(stateOnly=true, wait=true)`, `project-lint`, `browser-verify`, `project-save`; before a deployment, `mobile-builder-build`.
- Existing green CRUD project rail: `crud-status`, optional early `mobile-builder-open(wait=false)` when UI work is likely, `upsert-crud`, backend `crud-proof`, `ngx-page-create` for the new pages (a page to change: delete it and create it again, or `databaseobject-tree-apply`), `mobile-builder-open(stateOnly=true, wait=true)`, `project-lint`, `browser-verify`, optional `project-save`; before a deployment, `mobile-builder-build`. Do not import the starter again.
- Treat `spec.relations[]`, `entities[].ui.relationFields`, and `seed.data` as first-class public CRUD inputs. Do not grep the local workspace to rediscover them once the CRUD guides were read. Prefer `seed.data` for demo rows instead of patching `init_schema` manually.
- For a low-detail CRUD request, stop after the first green end-to-end scaffold plus seeded demo data. Do not start a second UX or layout pass unless the user asked for it.
- The low-detail stop rule applies only to generic CRUD. Before mutation, list the explicit acceptance behaviors from the request. Filters, counters, domain actions, or dashboards are not proven by the presence of fields or a generic list/detail/form shell; implement and validate each one before claiming completion.
