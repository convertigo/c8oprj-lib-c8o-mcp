# NGX pages

Read when: NGX pages. Summary: `convertigo://guides/multipage`.
Previous: `convertigo://guides/multipage/session`. Next: `convertigo://guides/multipage/ngx-pages-2`.

---

## NGX pages
Every page below is built from events and actions: no page loads data from `scriptContent` (`this.c8o.callJson`), which bypasses Angular change detection and leaves the view stale.
- Entry page (`isRoot`): page-enter event -> `CallSequenceAction` `auth_getCurrentUser` with `noAutoLogin` and `noLoading` -> one `IfAction` per role on `out?.success && out?.data?.user?.role == '<ROLE>'` -> `RootPageAction` to that role's home page. Otherwise it shows the login form or buttons.
- Login: `CallSequenceAction` login with `noAutoLogin` -> child `IfAction` on `out?.success` -> `RootPageAction` home; its Failure handler sets a network error local.
- Navigation is part of every page: `ngx-page-create` puts the menu button and the back button in each header; give `home` (the role's home page) so each page also gets a home button and a back button that works after a deep link. The menu lists list and dashboard pages by default (`inMenu`); keep forms and details out of it, they open from a page. A user must be able to reach every page from the menu or from a button, and come back.
- An unknown URL opens the home page: `ngx-page-create` adds a page `NotFound` whose route is `**` with the first page, opening `home` (else the entry page) as root, and keeps it the last page; the router takes the first route that matches, so a page after it never opens (`project-lint` NGX-FALLBACK-ROUTE).
- Numbers and amounts: give `locale` (en-US, fr-FR) and `currency` (USD, EUR) with the first page; both are kept for the next pages. A field named as money (amount, price, cost, revenue) without `format` then shows in that currency on every page, lists and dashboard sections included.
- The starter's own page `Page` ("Default home page") is not part of the application: delete it, or make it the real home page, before the first build.
- Give every sequence, transaction, connector and page a one-line comment saying what it does (`comment` of the generators, or `properties.comment` with databaseobject-tree-apply): it is what the Studio shows to whoever maintains the project. The generators write a default one when none is given.
- Before each build and at the end of each lot, run `project-lint` on the project and fix what it reports.
- Describe who can do what (final answer, `PROGRESS.md`) from the `access` lists of `project-security-audit`: only its `roleChecked` sequences check a role; `signedInOnly` ones accept any signed-in user, which is what the business sequences of `upsert-crud` do until a role check is put before their call. Never call an app role-checked from the roles of a few sequences.
- Prove each page in a browser, not only its sequences: a page can show an error over a sequence that answers (a test on a key the sequence never answers). Open it with `browser-verify`, or with the Playwright tools on the URL `mobile-builder-open` gives, and read what it shows. Fix every entry of the `autoDefects` of `browser-verify` (a text wider than its card, a generic title such as "Section 2", a console error, a failed request): the script finds them on each page it sees.
- Give the app its look before the pages with `ngx-theme-apply` (Visual design in `convertigo-frontend-ngx`), then build every page with the patterns of "Basic presentation" there (sections, lists or tables, label/value, KPI cards, cards, the `AppLayout` classes), never with side-by-side `UIText`.
- `out` in the actions under a `CallSequenceAction` is the sequence's JSON response, one top-level key per output step (its `key`). With the four `JsonToXmlStep` of the business sequence (keys `success`, `data`, `errors`, `meta`), pages read `out?.success` and `out?.data`. A single `JsonToXmlStep` with key `response` puts everything one level down (`out?.response?.success`): keep the four top-level keys so every page reads the same shape.
