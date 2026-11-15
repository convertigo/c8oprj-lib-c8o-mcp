# Required inputs

Read when: Required inputs. Summary: `convertigo://guides/crud`.
Previous: `convertigo://guides/crud/overview`. Next: `convertigo://guides/crud/deterministic-rail`.

---

## Required inputs
Capture these before the first mutation:
- `project`
- `database.mode`: hsqldb, postgresql, mariadb, mysql, sqlserver or oracle (left out when `database.connector` names an existing SQL connector, whose engine is kept)
- `database.connector`
- `facade.prefix`
- `entities[]`
- the pages the user needs (by default, per entity: a list, a detail and a form)
- `ui.language`: `fr` for French messages of the required-field checks of `upsert-crud` (default `en`); give the page texts of `ngx-page-create` in the user's language too

Default assumptions for the fast path:
- starter-derived NGX app
- business sequence prefix is `crud`
- the app opens on a `Login` page that signs in with the generated `auth_login`, then on its home page (the main list, or a dashboard when the user asks for counters)
- use the exact requested project name when it is technically valid; do not invent prefixes, suffixes, or dates
- if no explicit seed profile is provided, use `seed.profile=realistic`
- if the user wants explicit business demo rows, use `seed.data`
- in `seed.data`, the foreign keys of one row agree with each other: a deal's contact works for the deal's company, an order line's product is one the order's supplier sells. Check each row against the rows it points to.
- in `seed.data`, dates are placed relative to today, the date of the conversation (never a year from memory): a deadline, a due date or an expected close date falls after today (a few days to a few months), a creation, a last contact or a closed date before it. Fixed dates from memory put every open deal or task in the past, so the app shows them all as overdue.
- To read data while you build (check rows, find an id, count, compare), run one SELECT with `sql-select`: a read-only connection to the project's SQL connector, bounded rows (`maxRows`, 50 by default), values written in the SQL, nothing created nor saved in the project. Or call what exists with `requestable-execute`: the list and count transactions of the connector (`<project>.<connector>.list_<entity>`, `count_<entity>`) or the list business sequence (with `authenticatedUser` when it requires a session). Never create and delete probe transactions to read data: each one is a project change, saved and rebuilt (22 of them in one CRM turn). When the app itself needs a value nothing returns, create one read transaction `q_<what>` the app keeps.
- for the CRM demo profile, prefer `seed.profile=crm`, `seed.rowsPerEntity=20`, and relation `Contact.CompanyId -> Company.Id`
- for a low-detail CRUD request, the first acceptable delivery point is the first green scaffold plus seeded demo data, with its pages proven in a browser; refinement comes only if the user asked for it
- when relations are obvious, declare them explicitly in `spec.relations[]`; `field.references` remains accepted for compatibility. `ui.relationFields.<field>.optionLabelField` names the field of the related entity that the list and read business sequences return as `<field>__label`
- generated CRUD business sequences are `hidden` and require an authenticated context; `auth_login(username,password)` and `auth_logout()` are hidden skeleton sequences (the generated `auth_login` accepts any password; replace it with a real check from `convertigo://guides/auth` before delivery). The app signs in once on its `Login` entry page before its pages call them, and each protected page takes `authRedirect:"Login"`
- the upsert-crud business sequences answer their data itself: `{rows}` (list), `{row}` (read), `{total}` (count), `{message}` (create, update, delete), `{error}` when they fail; `ngx-page-create` reads that shape, so a list page takes `list.items:"rows"` and a detail page `detail.record:"row"`
- prefer best-case-first generated code and trust the standard error bubble unless the user explicitly asked for special UX around failures
