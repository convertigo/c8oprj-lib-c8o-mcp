# Convertigo Recipe: Multi-page App with Roles

## When to read this
Read this before building a new NGX business application from a specification: several pages, a session with roles, server-side access rules, SQL persistence, scheduled or batch logic. It gives the architecture and the order of work that a full V1 build (25 business sequences, 11 pages, about 2,700 objects) converged on, so you can start writing instead of rediscovering it.

Read `convertigo-backend-sequences` sections 4 and 5, `convertigo-frontend-ngx` (navigation, forms, execution order) and `convertigo-authentication` only for the questions this recipe leaves open.

## Cost rules for a large build
Output tokens are the main cost, far ahead of tool latency. Before writing trees:
- Generate repetitive trees with a script, write the calls array to `<workspace>/_mcp_payloads/<lot>.json` and run `batch-call({callsFile:"_mcp_payloads/<lot>.json"})`. Never print the generated JSON and re-type it as `calls`.
- Use the tree shortcuts: `{"mode":"SOURCE","local":"?.x"}` and `{"mode":"SOURCE","global":"?.x"}` SmartSources, `attributes:{...}` on elements, `setLocals:{...}` on events and actions, `importVariables:true` on `TransactionStep` and `SequenceStep`.
- Keep the default compact responses of `batch-call` and `databaseobject-tree-apply`.

## Reuse inventory first
Before the architecture, list what the specification needs and search for it: `marketplace-list({search:"<capability>"})` with English keywords for each capability, then `marketplace-describe({project})` on each candidate to read what it offers and how to call it; `palette-list` for native steps. A build that skipped this step rewrote SMTP sending, CSV export and admin grids by hand. A chosen library is imported with `marketplace-import({project:"<library>", targetProject:"<App>"})`, which adds the reference in the app; this is not a change to another project, even when the specification says to modify no project but the app. Candidates found in the marketplace descriptions:
- authentication and SSO: `lib_UserManager` (user/password, OpenID/OAuth sign-ons), `lib_OAuth` (OAuth/OpenID, e.g. an Entra ID tenant), `lib_SAML`, `lib_LDAP`, `AuthStarter`, `lib_UserManager_ui_ngx` (ready screens); see `convertigo-authentication`
- mail: the native `steps.SmtpStep`; `lib_Microsoft_Teams` for Outlook through Microsoft Graph
- CSV and files: `lib_csv_response` (plain text CSV response), `lib_download_file` (download controlled by a sequence)
- admin lists: `lib_ExtendedComponents_ui_ngx` (AG Grid with sorting, filtering and paging); charts: `libApexCharts`
- documents: `lib_fill_odt_pdf` (fill Word/Excel/PowerPoint, PDF), `lib_JasperReports`
If the specification limits dependencies, a marketplace library is still a standard Convertigo component: record the choice either way in the decision log.

## Generators for the standard objects
Most of such an app is made of the fixed objects this recipe describes: SQL transactions, business sequences of one shape, and pages of four kinds. Three tools build each of them in one call, with the rules of the guides built in. Use them first; keep `databaseobject-tree-apply` for what they do not cover.
- `sql-transaction-create`: SqlTransactions from SQL text or a structured `select` (camelCase aliases, optional filters, `contains`, `in` list filters with `POSITION`, `bool`), `insert`, `update` or `delete`; several per call with `transactions:[...]`. It refuses SQL that breaks a rule of `convertigo-integration-sql` and says how to fix it.
- `business-sequence-create`: one business sequence of the shape below from `{name, inputs, roles, reads, writes, logic}`. Write `js/app.js` first: `logic` names a function such as `App.orderList(ctx)` that receives `ctx = {me, input, reads, today}` (the user row, the inputs as strings, the rows of each read) and returns `{success, data, errors, meta}`, plus `writes: {<write name>: row or [rows]}` whose fields are the variables of the write transaction. Reads take what to call, `vars` (JS expressions, e.g. `{ownerId: "me.role === 'ADMIN' ? ownerId : me.id"}`), a `perimeter` (`filter` drops out-of-perimeter rows, `deny` answers `FORBIDDEN`) and `required`. Writes run only when `logic` succeeds, once per row, and stop at the first failure (`WRITE_FAILED`).
  - What a read or write calls: SQL (`sql`, `select`, `insert`... creates the transaction), an existing transaction of any connector (`transaction:"q_orders"`, or `"<connector>.<transaction>"` for an HTTP/REST, SQL or other connector), or a sequence (`sequence:"<sequence>"`, or `"<library>.<sequence>"` for a library the app references after `marketplace-import({project:"<library>", targetProject:"<App>"})`). Prefer a library sequence or an HTTP transaction behind `business-sequence-create` to a hand-built business sequence: auth, perimeter and the contract stay the same.
  - A SQL read gives `ctx.reads.<name>` its rows. Another read gives the JSON the call returns, without `attr`, `error` and `HttpInfo`; the array or object of a JSON HTTP transaction is unwrapped, and `path:"people"` keeps one part of it (`perimeter` and `required` then apply to it).
  - A call fails on `document.error`, an HTTP status >= 400, or a sequence answering `success:false`: `READ_FAILED` or `WRITE_FAILED` with the cause in the message. An HTTP transaction needs `httpInfo:true` first, otherwise a 404 or a lost connection looks like data and the generator refuses it.
  - `auth.userSequence` reloads the user through a sequence instead of `auth.userTransaction`.
  - `session` makes the login and logout business sequences (see Session): `logic` alone never opens a session.
- `ngx-page-create`: a `list` (filters, badges, row click), `detail`, `form` (UIForm, Form SmartSources, toast and navigation) or `dashboard` (KPI grid, sections) page wired to its business sequence, with the lost-session redirect, the `local?.x` templates and the `AppLayout` style.

Each one validates the whole spec before writing and creates all or nothing: a refused call lists every problem and leaves the project untouched, so fix the spec and send it again. The answer lists the created QNames and the next proof to run. Pages may link to pages not created yet (a warning, not an error), so build them in any order.

Use `databaseobject-tree-apply` instead for objects outside these shapes: a `SequenceStep` call outside a business sequence read or write, an iterator over XML, the HTTP connector and its transactions themselves, `SmtpStep`, a page with tabs, cards with actions on each row or a master-detail layout, shared components, menus, application events. A generated object is an ordinary tree: read it with `databaseobject-tree-get` and patch it (a label, an extra step) instead of generating it again. To regenerate one, delete it first: the generators never overwrite an existing business sequence or page (`sql-transaction-create` takes `ifExists:"replace"`).

A list business sequence and its page, two calls:

```json
{"project":"<App>","name":"order_list","logic":"App.orderList","inputs":["search","status"],"roles":["ADMIN","SALES"],
 "reads":[{"name":"orders","transaction":"q_orders","perimeter":{"field":"ownerId","bypassRoles":["ADMIN"]}}]}
{"project":"<App>","name":"ManageOrders","kind":"list","title":"Orders","sequence":"order_list","authRedirect":"Login",
 "filters":[{"name":"search","label":"Search"}],
 "list":{"item":"order","title":"orderNumber","subtitle":"label","badge":{"field":"status","colors":{"LATE":"warning"}},"onItem":{"page":"OrderHistory","data":{"id":"id"}}}}
```

## Architecture
1. Project from `marketplace-import({project:"template_ngxBuilderIonic", importedProjectName:"<App>"})`.
2. One `SqlConnector` for the application database (HSQLDB file database is enough for a V1 and a demo). Create it and its transactions new: the starter's `void` connector holds a placeholder `void` transaction whose `onTransactionStarted` handler returns `cancel`, so a renamed or reused copy runs nothing and still answers ok. `databaseobject-tree-get` shows a transaction's JavaScript `handlers`; `handlers:""` in `databaseobject-tree-apply` removes them. For an HSQLDB file database set `jdbcDriverClassName` `org.hsqldb.jdbcDriver`, `jdbcURL` `jdbc:hsqldb:file:.//database/<app>;shutdown=true` (relative to the project folder), `jdbcUserName` `sa` and an empty `jdbcUserPassword` (the exact property names; `palette-describe` lists them); never write `${...}` in a property value, Convertigo reads it as a global symbol. HSQLDB DDL that works: `id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY`, `DEFAULT` before `NOT NULL` (`actif BOOLEAN DEFAULT TRUE NOT NULL`), several `CREATE TABLE IF NOT EXISTS` statements separated by `;` in one transaction.
3. One `SqlTransaction` per statement: `q_*` for reads, `w_*` for writes. Alias every selected column with a quoted camelCase name (`id AS "id"`): HSQLDB upper-cases unquoted names in `sql_output`, and the business sequences read these keys. An optional filter is `({x} = '' OR col = {x})`: an absent variable arrives as an empty string, never NULL. A write that must be atomic across several statements is one transaction with several queries separated by `;` and `autoCommit` `2` (enabled, once at the end). `palette-describe` lists the codes in `allowedValues`.
4. Business rules in one `js/<app>.js` file written with `project-js-set({project:"<App>", ...})`: constants, date and status computations, validation, response builders. Hang everything on one object (`var app = (function () { ... return {...}; })();`).
5. One business sequence per service, all with the same response contract `{success, data, errors:[{code,message,field}], meta}` emitted by `JsonToXmlStep` steps.
6. Configuration in global symbols `${app.setting=default}`; secrets in `.secret` symbols without default. The engine resolves `${...}` only in object properties, such as a `SimpleStep` expression, never inside `js/*.js`: pass the settings from the first step of each sequence, `app.configure({delayMonths: "${app.delayMonths=2}"})`, and keep the values in the shared object. In JS, `Engine.theApp.databaseObjectsManager.symbolsGetValue("app.delayMonths")` returns the stored value or `null`, without the inline default.

## Business sequence shape
Every protected service has the same five parts. `business-sequence-create` builds them from a short spec; by hand, create and wire them in one `databaseobject-tree-apply` (steps source earlier siblings by name):

```text
seq <service>                accessibility=Hidden, authenticatedContextRequired=true
  init      SimpleStep       include("js/<app>.js"); read inputs; var sessionEmail = String(context.getAuthenticatedUser());
  callMe    TransactionStep  q_user_by_email, importVariables:true      (uses the JS var sessionEmail)
  srcMe     JsonSourceStep   sourceDefinition {"step":"callMe","xpath":"./document/sql_output"} -> meRows
  ...reads  TransactionStep + JsonSourceStep pairs, same pattern
  logic     SimpleStep       resp = app.run(function () { var u = app.currentUser(meRows); check role and perimeter; return app.ok(data); });
  ...writes IfStep resp.success -> TransactionStep w_*, importVariables:true (set the JS vars first)
  out*      JsonToXmlStep    success, data, errors, meta from resp
```

The generated error messages (unauthenticated, forbidden, notFound, readFailed, writeFailed, logic) are English by default. Translate them once for every business sequence in the business rules namespace: `var App = (function () { return { messages: { forbidden: "Accès refusé.", ... }, ... }; })();`. A message given in the `errors` argument of one call wins.

- Check the role and the data perimeter in `logic`, from the user reloaded in the database on every call: a disabled account loses its rights at once. Hiding a button is not access control.
- Refuse out-of-perimeter reads without returning the record (`FORBIDDEN`).
- Variables read in JS are Java strings and rows come from another Rhino scope: see `convertigo-backend-sequences` section 5.

## Session
- `auth_login<...>` (Hidden, anonymous): verifies the identity, then `context.setAuthenticatedUser(<normalized email>)` and returns `{user, home}` where `home` is the page for the role. With `business-sequence-create`: `auth:false`, the identity check in `logic` (it reads the user, or calls the sign-in sequence of a library), and `session:{login:"resp.data.email"}`, a JS expression of the user id. The business sequence opens the session with it only when `logic` and the writes succeed. Without `session` the login answers `success:true` but opens no session, and the app falls back to its entry page at the first protected call. A library sign-in sequence that opens the session itself needs no `session`.
- `auth_getCurrentUser` (Hidden): returns the reloaded user. Either mark it `authenticatedContextRequired` (no session gives `Authentication required`) or keep it anonymous and return a business code such as `UNAUTHENTICATED`; the entry page handles whichever you chose.
- `auth_logout`: clears the session. With `business-sequence-create`: `auth:false` and `session:{logout:true}` (the authenticated user is removed, then the HTTP session ends after the response is written); the client calls it with `noAutoLogin`.
- Sessions expire (timeout, engine restart). A call without session to an `authenticatedContextRequired` sequence returns an error whose message is `Authentication required` (no dedicated code); the client treats it exactly like the business code of a lost session (`UNAUTHENTICATED` by default in `business-sequence-create` and `ngx-page-create`, or the code the application's contract names: pass it to both). The SDK auto-login replays the last login first, so a server-side logout is restored silently; test with the application's logout button, then a protected page.
- For a real identity provider, keep this layer and follow `convertigo-authentication`.

## NGX pages
Every page below is built from events and actions: no page loads data from `scriptContent` (`this.c8o.callJson`), which bypasses Angular change detection and leaves the view stale.
- Entry page (`isRoot`): page-enter event -> `CallSequenceAction` `auth_getCurrentUser` with `noAutoLogin` and `noLoading` -> one `IfAction` per role on `out?.success && out?.data?.user?.role == '<ROLE>'` -> `RootPageAction` to that role's home page. Otherwise it shows the login form or buttons.
- Login: `CallSequenceAction` login with `noAutoLogin` -> child `IfAction` on `out?.success` -> `RootPageAction` home; its Failure handler sets a network error local.
- Navigation is part of every page: `ngx-page-create` puts the menu button and the back button in each header; give `home` (the role's home page) so each page also gets a home button and a back button that works after a deep link. The menu lists list and dashboard pages by default (`inMenu`); keep forms and details out of it, they open from a page. A user must be able to reach every page from the menu or from a button, and come back.
- The starter's own page `Page` ("Default home page") is not part of the application: delete it, or make it the real home page, before the first build.
- Give every sequence, transaction, connector and page a one-line comment saying what it does (`comment` of the generators, or `properties.comment` with databaseobject-tree-apply): it is what the Studio shows to whoever maintains the project. The generators write a default one when none is given.
- Before each build and at the end of each lot, run `project-lint` on the project and fix what it reports.
- Build every page with the patterns of "Basic presentation" in `convertigo-frontend-ngx` (sections, lists, label/value, counters, cards, one `AppLayout` style created before the pages), never with side-by-side `UIText`.
- `out` in the actions under a `CallSequenceAction` is the sequence's JSON response, one top-level key per output step (its `key`). With the four `JsonToXmlStep` of the business sequence (keys `success`, `data`, `errors`, `meta`), pages read `out?.success` and `out?.data`. A single `JsonToXmlStep` with key `response` puts everything one level down (`out?.response?.success`): keep the four top-level keys so every page reads the same shape.
- Load page data on `viewEvent` `pageWillEnter`, not the default `pageDidEnter`: checked on a production build, `pageDidEnter` does not fire when the app opens on the page's URL (reload, bookmark, deep link), so the page stays without its locals and data; `pageWillEnter` fires there and on every navigation.
- Protected page: page-enter event with `setLocals` for every local it reads -> `CallSequenceAction` of its data business sequence -> child `SetLocalAction` storing `out` -> under it an `IfAction` on the auth error codes -> `RootPageAction` back to the entry page, and the state updates for the success path. Widgets read the locals with the `local` short form.
- Lists open details with `PushPageAction` `data` holding ids only; the target page copies `c8oPage.navParams?.data?.id` into a local at page enter and calls its business sequence.
- Session-wide values (current user, role, flash message) go in global state with `SetGlobalAction`, read with the `global` short form; it is lost on a browser reload, so the entry page restores it.
- Add one application-level `UIAppEvent` with `appEvent` `onSessionLost`: it clears the session globals and `RootPageAction` to the entry page when the SDK detects a lost session. Keep the per-page check on the auth error codes: the failing call still returns its error to its page.
- Every form follows the Forms section of `convertigo-frontend-ngx`; a `Select` and its options share one value type.

## Order of work
Keep `docs/generated/PROGRESS.md` up to date after each step below (object inventory, checks, next step), as the common skill's "Long tasks" section says: it is what a resumed or compacted conversation starts from.

Keep your own context for the specification, the plan, the decisions and the reports, and delegate the heavy work to sub-agents (common skill, "Sub-agents"): build each lot below with a constructor run (one per coherent piece: the transactions and business sequences of a lot, one page, the test sequences), read back the QNames it reports, and close each page lot with one verifier run (`subagent-run`, profile `verifier`) whose paths are the user journeys through that page and whose checks are the specification's acceptance criteria with their exact texts. Copy its verdict and findings into `PROGRESS.md`; fix, rebuild and verify again only the paths that failed.

1. Data model and `SqlTransaction`s (`sql-transaction-create`, several per call), seeded with demo data by a reset sequence; prove each with `requestable-execute`.
2. `js/<app>.js` with the rules, then the session business sequences, then the other business sequences (`business-sequence-create`).
3. Pages (`ngx-page-create`, then `databaseobject-tree-apply` for what it does not cover), one lot per page.
4. Scheduled or batch logic as a sequence that takes an injectable date for tests. Schedule it with `scheduler-apply({name, project, sequence, cron:"0 0 8 * * ?"})` (Quartz syntax with seconds) and check it with `scheduler-list`. A scheduled run has no user session: the scheduled sequence must not require `authenticatedContextRequired`, and it does its own authorization (for example, it checks a technical parameter or symbol). When the business hour is a setting (for example `app.reminderHour=08:00`), schedule a frequent run (`0 */15 * * * ?`) whose sequence checks the configured hour and is idempotent per day, so changing the setting needs no rescheduling.
5. Non-regression sequences that call the business sequences and assert the contract. A `Private` test sequence can open a session with `context.setAuthenticatedUser(<email>)` and call the protected business sequences through `SequenceStep`: the session reaches them, so one `requestable-execute` runs every acceptance case for one role, then for the next.

## Validation
- `requestable-execute` runs without an HTTP session: use it for transactions, anonymous business sequences, the rules, and the test sequences of step 5 that open their own session.
- Test session-protected business sequences over HTTP with a cookie jar, one jar per role, on the Studio host name:

```bash
curl -s -b admin.jar -c admin.jar "http://<studio-host>.localhost:<port>/convertigo/projects/<App>/.json" --data-urlencode "__sequence=auth_loginDemo" --data-urlencode "profile=ADMIN"
curl -s -b admin.jar -c admin.jar "http://<studio-host>.localhost:<port>/convertigo/projects/<App>/.json" --data-urlencode "__sequence=order_list"
```

- Prove the UI in the viewer returned by `mobile-builder-open` (see its `browserControlHint`) with verifier sub-agents, not click by click: one run per role, whose paths log in with that role and run each specification acceptance criterion, and whose checks include that the role cannot reach another role's page or data.
