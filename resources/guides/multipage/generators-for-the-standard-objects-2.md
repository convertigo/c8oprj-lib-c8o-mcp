# Generator limits and application architecture

Read when: Generator limits and application architecture. Summary: `convertigo://guides/multipage`.
Previous: `convertigo://guides/multipage/generators-for-the-standard-objects`. Next: `convertigo://guides/multipage/architecture`.

---

Use `databaseobject-tree-apply` instead for objects outside these shapes: a `SequenceStep` call outside a business sequence read or write, an iterator over XML, the HTTP connector and its transactions themselves, `SmtpStep`, a page with tabs, cards with actions on each row or a master-detail layout, menus, application events. Build them inside the page; an app shared component that nothing uses is reported by `project-lint` (NGX-UNUSED-SHARED-COMPONENT). A generated object is an ordinary tree: read it with `databaseobject-tree-get` and patch it (a label, an extra step) instead of generating it again. To regenerate one, delete it first: the generators never overwrite an existing business sequence or page (`sql-transaction-create` takes `ifExists:"replace"`).

A list business sequence and its page, two calls:

```json
{"project":"<App>","name":"order_list","logic":"App.orderList","inputs":["search","status"],"roles":["ADMIN","SALES"],
 "reads":[{"name":"orders","transaction":"q_orders","perimeter":{"field":"ownerId","bypassRoles":["ADMIN"]}}]}
{"project":"<App>","name":"ManageOrders","kind":"list","title":"Orders","sequence":"order_list","authRedirect":"Login",
 "filters":[{"name":"search","label":"Search"}],
 "list":{"item":"order","title":"orderNumber","subtitle":"label","badge":{"field":"status","colors":{"LATE":"warning"}},"onItem":{"page":"OrderHistory","data":{"id":"id"}}}}
```

