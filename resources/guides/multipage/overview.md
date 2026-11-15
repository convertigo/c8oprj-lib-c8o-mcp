# Scope, prerequisites and route selection

Read when: Scope, prerequisites and route selection. Summary: `convertigo://guides/multipage`.
Next: `convertigo://guides/multipage/generators-for-the-standard-objects`.

---

# Convertigo Recipe: Multi-page App with Roles

## When to read this
Read this before building a new NGX business application from a specification: several pages, a session with roles, server-side access rules, SQL persistence, scheduled or batch logic. It gives the architecture and the order of work that a full V1 build (25 business sequences, 11 pages, about 2,700 objects) converged on, so you can start writing instead of rediscovering it.

Read `convertigo-backend-sequences` sections 4 and 5, `convertigo-frontend-ngx` (navigation, forms, execution order) and `convertigo-authentication` only for the questions this recipe leaves open.

## Cost rules for a large build
Output tokens are the main cost, far ahead of tool latency. Before writing trees:
- Generate repetitive trees with a script, write the calls array to a `.json` file in the temporary folder of this conversation (each turn names it) and run `batch-call({callsFile:"<absolute path of that file>"})`. Never print the generated JSON and re-type it as `calls`, never write it at the workspace or project root.
- Use the tree shortcuts: `{"mode":"SOURCE","local":"?.x"}` and `{"mode":"SOURCE","global":"?.x"}` SmartSources, `attributes:{...}` on elements, `setLocals:{...}` on events and actions, `importVariables:true` on `TransactionStep` and `SequenceStep`.
- Keep the default compact responses of `batch-call` and `databaseobject-tree-apply`.

## Reuse inventory first
Before the architecture, list what the specification needs and search for it: `marketplace-list({search:"<capability>"})` for each capability (English or French words: it lists first the libraries that provide it), then `marketplace-describe({project})` on each candidate to read what it offers and how to call it; `palette-list` for native steps. A build that skipped this step rewrote SMTP sending, CSV export and admin grids by hand. A chosen library is imported with `marketplace-import({project:"<library>", targetProject:"<App>"})`, which adds the reference in the app; this is not a change to another project, even when the specification says to modify no project but the app. A library referenced and not used: remove the reference (`project-lint` reports it, PROJECT-UNUSED-REFERENCE). Candidates found in the marketplace descriptions:
- authentication and SSO: `lib_UserManager` (user/password, OpenID/OAuth sign-ons), `lib_OAuth` (OAuth/OpenID, e.g. an Entra ID tenant), `lib_SAML`, `lib_LDAP`, `AuthStarter`, `lib_UserManager_ui_ngx` (ready screens); see `convertigo-authentication`
- mail: the native `steps.SmtpStep`; `lib_Microsoft_Teams` for Outlook through Microsoft Graph
- CSV and files: `lib_csv_response` (plain text CSV response), `lib_download_file` (download controlled by a sequence)
- admin lists: `lib_ExtendedComponents_ui_ngx` (AG Grid with sorting, filtering, paging and CSV export; `ngx-page-create` builds it on a list page with `list.grid`, and on its own for a table of 5 cells or more); charts: `libApexCharts`
- documents: `lib_fill_odt_pdf` (fill Word/Excel/PowerPoint, PDF), `lib_JasperReports`
If the specification limits dependencies, a marketplace library is still a standard Convertigo component: record the choice either way in the decision log.

