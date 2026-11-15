# Deterministic rail

Read when: Deterministic rail. Summary: `convertigo://guides/crud`.
Previous: `convertigo://guides/crud/required-inputs`. Next: `convertigo://guides/crud/existing-project-edit-rail`.

---

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
12. Before a deployment (or an export for a server), run `mobile-builder-build({project})`: the production build in `DisplayObjects/mobile`, which a deployed project serves. Call it again with its `buildId` while it answers `running`. When it answers `unsupported`, tell the user to click Build in the Studio's Build panel before deploying.

A seed for a fresh server (the demo rows, a demo account) follows the common skill's "Seed and visible data" rules: each call's answer checked, an error when one fails, an answer made from those answers, never public, and the demo sign-in proven with the login sequence before the account is reported.

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
