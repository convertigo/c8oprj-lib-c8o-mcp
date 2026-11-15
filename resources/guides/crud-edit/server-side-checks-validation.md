# Server-side checks (validation)

Read when: Server-side checks (validation). Summary: `convertigo://guides/crud-edit`.
Previous: `convertigo://guides/crud-edit/running-upsert-crud-again`. Next: `convertigo://guides/crud-edit/canonical-crud-additions-to-express-direct`.

---

## Server-side checks (validation)
- upsert-crud already checks the required fields (`fields[].required`): their create and update sequences answer
  "<Label> is required." (in French with `ui.language: "fr"` in the spec) and write nothing.
- Put another check in the create and update business sequences (`crud_create_<entity>`, `crud_update_<entity>`): an
  `IfStep` on the variable, holding an `XMLErrorStep` with `code` and the message the user reads (`output: true`) and
  then a `ReturnStep`, before the call of the transaction. An `XMLErrorStep` alone does not stop the sequence: the write
  still runs. The sequence answers an `error` element and the call resolves. upsert-crud keeps the steps before the call.
- A form page of `ngx-page-create` shows that message instead of its success message; check the message with a save
  the check refuses.

## Deterministic rail for an existing CRUD project
1. Run `crud-status` to confirm the current project, connector and business sequence prefix.
2. Build the full updated CRUD `spec` in one pass: every field of each entity you change.
3. Run `upsert-crud` with `sequence=true`.
4. Run backend `crud-proof`.
5. If the task includes UI, run `ngx-page-create` once per new page (a new entity: its list, detail and form pages, with `home` and `authRedirect`). A page to change: delete it and create it again (`ngx-page-create` never overwrites an existing page), or patch it with `databaseobject-tree-apply`.
6. Run `mobile-builder-open(stateOnly=true, wait=true)` if the viewer was already warmed up, or a normal waited `mobile-builder-open` otherwise.
7. Run `project-lint` and fix what it reports.
8. Prove the changed paths with `browser-verify` (`url` the `viewerHomeUrl`). Without it, use the Playwright tools as the common skill says; if those MCP browser tools are unavailable, disabled, stale, or attached elsewhere, report the managed Playwright MCP configuration problem instead of using Node scripts, raw CDP, or a separate browser.
9. Save with `project-save` if a final save is still needed.
10. Stop after the first final green proof.

## Pages of an older project
An older project may hold pages, shared components and shared actions made by a CRUD UI generator that no longer exists
(their comment says `Managed by upsert-ngx-crud-kit`). They are ordinary objects of the app: change one with
`databaseobject-tree-apply`, or delete the page and create it again with `ngx-page-create`. Then remove the shared
components nothing uses any more: `project-lint` reports them (NGX-UNUSED-SHARED-COMPONENT).

## What to avoid on this rail
- Do not reread the whole CRUD documentation set if the CRUD rail is already established in the thread.
- Do not grep the local workspace just to rediscover the public shape of `relations[]`, `ui.relationFields`, or `seed.data`.
- Do not import the starter again or create again a page that did not change.
- Do not patch `init_schema` manually after `upsert-crud` just to inject better demo data.
- Do not normalize `project-reload` into the edit flow; stale runtime behavior after a mutation is a tooling issue to surface, not the default rail.

