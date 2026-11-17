# Running upsert-crud again

Read when: Running upsert-crud again. Summary: `convertigo://guides/crud-edit`.
Previous: `convertigo://guides/crud-edit/overview`. Next: `convertigo://guides/crud-edit/server-side-checks-validation`.

---

## Running upsert-crud again
- Run it again to change the spec: an entity, a field, a relation, a label. It is not the way to repair one object nor
  to clean the rows a test created: delete those rows by their id with the delete business sequence, and fix an object
  with `databaseobject-tree-apply` or `sql-transaction-create`.
- A run keeps as it is a transaction or business sequence changed since the previous run (by hand or by another tool):
  it writes nothing in it and names it in `warnings` (status `partial`). It does not create again an `auth_login` or
  `auth_logout` deleted since. To have one written again from the spec, losing what was changed in it, send the same
  call with `spec.overwrite: ["<name>"]` (`true` for all of them).
- An app's own steps placed before the call of a business sequence are not a change: they stay, and the rest of the
  business sequence follows the spec.

## A field with a fixed set of values
On a form page of `ngx-page-create`, give the field `type:"select"` and `options:[{value, label}]` (for example
`[{"value": "basse", "label": "Basse"}, {"value": "normale", "label": "Normale"}]`): the form shows a select instead
of a text input. `value` is the starting value of a create form, a TypeScript expression (a text is quoted:
`"'normale'"`); `fields[].default` of upsert-crud also applies to a create that leaves the field out. On a list page,
`badge.labels` (or a column's `labels`) shows the label of each code. No hand edit of the form.

## List filters
The list business sequences of upsert-crud take no variable: they answer every row, so a list page refuses `filters`
on them. Give the list `list.grid:true` (the AG Grid has a filter on every column), or create a business sequence that
takes the filter (`business-sequence-create` reading the list transaction with a WHERE on that variable) and give it
to the page with `filters:[{name, label, type:"select", options}]` or `type:"search"`. No hand edit of the list.

## Real users (a login form)
- The generated `auth_login` accepts any user name. Named accounts with a password go through `lib_UserManager`, never
  a password checked in the app: follow the login and roles recipe of
  `convertigo://guides/auth/email-password-with-lib-usermanager`. In short: accounts created through the library with
  their role (`CreateAccount`, `SetUserAttribute`) by an administrator, ids as the user gives them (an e-mail only when
  given), no literal password in the project; `auth_login` = `InputVariablesStep`, the `SignIn` call with its step
  variables sourced on it (`./username/text()`) or a `var user = username;` before the call (a step variable without
  source nor value takes the JavaScript variable of the same name only), an `IfExistThenElseStep` on the call's
  `./document/error` ending in an `XMLErrorStep`, then the role read (`GetUserAttribute`) and the answer `user` + `role`;
  each protected sequence checks the role server side (`IfStep` + `XMLErrorStep`) before its transaction call.
- The login page is an `ngx-page-create` form page with `root:true`: `form.submit` the login sequence, one field per
  variable of it (`type:"password"` for the password), `success:{page:"<home page>", kind:"root"}`. It shows the
  refusal, and every protected page takes `authRedirect` to it. A login page that signs in without asking anything
  (built by an older version): delete it and create this one. No hand-built form.
- Check a sequence that needs what the login stores (the user, a role) with `requestable-execute` and
  `before: [{"requestable": "<project>.<login sequence>", "variables": {...}}]`: the login and the call share one session.

## Language of the page texts
`ngx-page-create` writes the texts you give it: titles, labels, buttons, empty texts, success messages. Its defaults
are English and its answer warns when one was used: give every text in the app's language. upsert-crud writes the
required-field messages in French with `ui.language: "fr"` in the spec.
