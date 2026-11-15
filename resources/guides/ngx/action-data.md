# Iterator scope and data along action chains

Read when: Iterator scope and data along action chains. Summary: `convertigo://guides/ngx`.
Previous: `convertigo://guides/ngx/smartsource`. Next: `convertigo://guides/ngx/custom-actions`.

---

- In action variables under a directive, refer to iterator values through `scope.<directiveItemName>`, not a bare local identifier.
- In visible text/template expressions rendered inside the repeated subtree, the generated template exposes the item name directly. For `directiveItemName=record`, use `record?.name` in a `UIText` expression, not `scope.record?.name`.
- Do not bind iterator fields through the Local SmartSource filter. A `UIText` Local source path such as `record.name` is treated as a page-local path and generates invalid template variables. For visible row text, use a plain template expression such as `{{ record.name }}` or another field from the business sequence contract. Keep Local SmartSource/source mode for the repeated collection itself, for example `?.results?.items`.
- For conditional UI, make the `UIControlDirective` with `directiveName=If` the wrapper/parent of the element it controls. The controlled component should be a child of the directive, not the other way around.
- Do not add raw `*ngFor`, `*ngIf`, or similar Angular structural directives as generic attributes when the palette directive/control object exists.
- If repeated results feel hard to model, build a simple non-repeated palette shell first and bind one count or first item; do not fall back to a raw `*ngFor` fragment to finish the screen.

Why this matters:
- Raw structural attributes can generate template output that looks plausible but leave action variables outside the generated TypeScript scope.
- A common broken shape is `vars:{record: record}` in the generated action method. The correct palette-backed shape passes the iterator through the event scope, for example `vars:{record: scope.record}`.
- A common visible-text bug is using `scope.record` in generated template bindings under the repeated row; for display-only expressions, use the directive item name directly, for example `record`.
- A common conditional-state bug is placing `IfLoading` or `IfError` under the progress bar or note; the wrapper directive must own the conditional subtree.

### Angular property bindings
Angular property bindings must use the correct SmartType mode:
- Binding attributes such as `[value]`, `[disabled]`, `[selectedText]`, `[interface]`, or similar dynamic Angular inputs should use `SC` when sourceable and `TS` for short local expressions.
- When binding to page-local fields in the generated template, the expression should be the component field itself, for example `searchQuery`, `loading`, or `errorMessage`; do not prefix it with `page.`.
- Do not set Angular property bindings in `TX`/plain mode unless the desired runtime value is truly a string literal.
- Watch for generated output like `[value]="'searchQuery'"`, `disabled="{{loading}}"`, or `value="{{page.searchQuery}}"`; these are signs that the source object used the wrong binding mode, property, or scope.
- Prefer the component's palette property when it models the dynamic input correctly; otherwise add a palette `UIAttribute` with the Angular binding name and an intentional `SC` or `TS` value.

### Data along an action chain
Checked in the generated page code (8.4 builder), each action of an event chain runs inside the event method:
- `out` in an action's properties is the result of its direct parent action. Under a `CallSequenceAction`, it is the call's response. Under an `IfAction`, it is the If's own result, not the call's. To read a call's response deeper in the chain (a `SetLocalAction` or a toast under an `IfAction`), write `stack["<CallSequenceAction name>"].out`, for example `stack["LoadOrders"].out?.data`. `stack` is a local variable of the event method, so it is available in action properties.
- Every action receives the event's inputs merged with its own variables (`{...stack["root"].in, ...vars}`). On a form submit, those inputs are the form's fields. A `CallSequenceAction` that reloads a list after the submit therefore also sends the form's fields, which act as filters. Give every variable of the called sequence explicitly on such a call, empty ones included.
