# Iterators, dependencies and backend invariants

Read when: Iterators, dependencies and backend invariants. Summary: `convertigo://guides/common`.
Previous: `convertigo://guides/common/ngx`. Next: `convertigo://guides/common/crud`.

---

- `directiveName:"ForEach"` does not define the template variable by itself. The root used by row text must be the `directiveItemName`: `{{ item.x }}` requires `directiveItemName:"item"`, `{{ record.x }}` requires `directiveItemName:"record"`. The nodes that interpolate that variable must be descendants of the `UIControlDirective`, not siblings. Read the directive back and verify `directiveSource`, `directiveItemName`, and `directiveIndexName`.
- Do not put a visibility condition on the same `UIControlDirective` as `ForEach`. Use a separate `If` directive whose `directiveExpression` is a raw Angular template expression.
- Bind page-local state with a Local SmartSource such as `?.results?.items`; do not write `{{ local?.x }}` in visible text. Angular interpolation in `UIText.textValue` is for iterator variables only.
- Scope page CSS to the element that actually paints the visible area. Do not assume a class or CSS variable crosses an Ionic shadow boundary; include background coverage in the first browser proof.
- For NGX shared actions or custom actions that need npm packages, declare dependencies on the action with `package_dependencies`; do not patch generated package files or rely on manual `npm install`. Keep import/dependency properties as nested XMLVector rows: imports are `[importClause, moduleName]`, dependencies are `[packageName, version]`, never a single CSV-like string.
- For `UICustomAsyncAction` code emitted in `actionbeans.service.ts`, put npm API imports in `app_ts_imports`.

## Backend invariants

- HTTP integration keeps transport in `HttpConnector` plus typed HTTP transactions; business sequences call them with `TransactionStep` and only orchestrate or shape the public contract.
- Execute transactions through the runtime requestable path `<Project>.<Connector>.<Transaction>`, never the Studio QName `<Project>.cn:<Connector>.tr:<Transaction>`. `TransactionStep.sourceTransaction` uses the same runtime path.
- A business sequence that forwards a user query must expose a public `variables.RequestableVariable` on the sequence and a matching `StepVariable` under the `TransactionStep`. Keep the same object name across the HTTP transaction variable, the public business sequence variable, the `StepVariable`, and the UI variable.
- A business sequence proof is green only when the payload exposes an application contract such as `{items,total,query}` or an equivalent record array. `HttpInfo`, headers, `context`, `project`, and `sequence` are transport metadata, not application data.
- Do not replace a live web-service integration with a `SimpleStep`, hard-coded records, or a stub after a runtime failure. DNS, TLS, timeout, and provider 4xx/5xx are live proof failures, not tool failures: keep the rail and report the proof incomplete.
- Generated CRUD business sequences are hidden requestables that require an authenticated context. The app establishes that session once on its `Login` entry page, an `ngx-page-create` form page on `auth_login(username,password)` with `root:true`. That `auth_login` is a skeleton that accepts any password: before delivery, replace it through the `authentication` route.
- In a sequence or a block, the order of the steps is the order they run: a step that sets a variable comes before the step that reads it. `databaseobject-tree-apply` places a step it adds where the tree lists it (after its previous sibling) and never moves the existing ones: it warns when the tree lists them in another order, and `databaseobject-move` reorders. A `priority` in a tree is ignored. Read the sequence back after a change of its steps, then run it.
- Prefer best-case-first generated code. Trust the standard runtime error bubble for ordinary failures instead of adding defensive wrappers by default.
