# Mutations, CRUD page generators and backend contracts

Read when: Mutations, CRUD page generators and backend contracts. Summary: `convertigo://guides/start`.
Previous: `convertigo://guides/start/mandatory-workflow`. Next: `convertigo://guides/start/mandatory-workflow-3`.

---

12. Apply changes with `databaseobject-tree-apply` or `batch-call`. When host reveal mode is enabled, pass top-level `reveal:true` to `batch-call`; optimized batches reveal the final touched object after their deferred Studio refresh.
   - In `databaseobject-tree-apply`, `tree.properties` must be a JSON object/map, not an array of `{name,value}` entries.
   - Correct: `"properties":{"comment":"...","output":"true"}`.
   - Wrong: `"properties":[{"name":"comment","value":"..."},{"name":"output","value":"true"}]`.
   - If a call returns `status:"partial"` with `parse_properties`, `SyntaxError: Unexpected token: o`, or `Expected a JSON object`, stop using that shape and retry the same mutation with object properties before moving on.
   - For several sibling children, prefer `batch-call` with one focused `databaseobject-tree-apply` per child over one large `tree.children` payload. This is especially safer for transaction variables, UI variables, and action children because oversized/nested children payloads can trigger MCP transport deserialization failures.
13. For a new CRUD UI project, make the app visible immediately without blocking the whole agent: validate the name -> `marketplace-import` with the exact project name -> `mobile-builder-open(wait=false)` -> `upsert-crud` -> backend `crud-proof` -> `ngx-theme-apply` when the user gave a brand -> one `ngx-page-create` per page (the entry page with `root:true`, `locale` and `currency` with the first page, `home` on each page) -> `mobile-builder-open(stateOnly=true, wait=true)` -> `project-lint` -> `browser-verify` -> the finishing pass (`browser-verify` with `design: true` on the main pages, its fixes, one re-check; unless the user declined it); before a deployment, `mobile-builder-build` (the production build in `DisplayObjects/mobile`).
14. For an existing deterministic CRUD project that is already green, prefer `convertigo://guides/crud-edit`: `crud-status` -> optional early `mobile-builder-open(wait=false)` when UI work is likely -> `upsert-crud` -> backend `crud-proof` -> `ngx-page-create` for the new pages (a page to change: delete it and create it again, or `databaseobject-tree-apply`) -> `mobile-builder-open(stateOnly=true, wait=true)` -> `project-lint` -> `browser-verify` (with `design: true` on the pages changed); before a deployment, `mobile-builder-build`.
15. For a low-detail CRUD request, stop after the first green scaffold plus seeded demo data. Do not start a second refinement pass on layout, labels, or field-level UX unless the user explicitly asked for it.
16. Once the CRUD fast path is selected, do not call `rag-query` unless the built-in guides and tools no longer answer the task.
17. When a CRUD domain obviously contains relations, declare them explicitly in `spec.relations[]`; use `field.references` only as the compatibility layer for simple FK fields.
18. Build the CRUD pages with `ngx-page-create` on the generated business sequences, not by hand; `databaseobject-tree-apply` only for what it does not cover. A page whose model or template a skill or the project names is a copy of it instead (`databaseobject-copy`, then its content zone only).
19. For credible demo rows, prefer `seed.data` over patching `init_schema` manually after generation.
20. Do not grep the local workspace to rediscover the public CRUD shapes of `relations[]`, `ui.relationFields`, or `seed.data` once the built-in guides already document them.
21. Generated CRUD business sequences are hidden requestables with `authenticated context required=true`; the app opens that session once on its `Login` entry page (an `ngx-page-create` form page on `auth_login(username,password)` with `root:true`), which then opens the home page as root.
22. Prefer best-case-first code. Let the standard error bubble handle normal failures unless there is a clear UX reason to intercept them.
