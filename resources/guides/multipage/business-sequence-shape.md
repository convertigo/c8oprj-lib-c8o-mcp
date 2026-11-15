# Business sequence shape

Read when: Business sequence shape. Summary: `convertigo://guides/multipage`.
Previous: `convertigo://guides/multipage/architecture`. Next: `convertigo://guides/multipage/session`.

---

## Business sequence shape
Every protected service has the same five parts. `business-sequence-create` builds them from a short spec; by hand, create and wire them in one `databaseobject-tree-apply` (steps source earlier siblings by name):

```text
seq <service>                accessibility=Hidden, authenticatedContextRequired=true
  init      SimpleStep       include("js/app.js"); read inputs; var sessionEmail = String(context.getAuthenticatedUser());
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
