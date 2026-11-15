# Cache, expression contexts and custom actions

Read when: Cache, expression contexts and custom actions. Summary: `convertigo://guides/ngx`.
Previous: `convertigo://guides/ngx/action-data`. Next: `convertigo://guides/ngx/dependencies`.

---

- A `CallSequenceAction` caches its response for 3 s by default (`cacheTtl` 3000). Set `cacheTtl` to 0 on a read that must show a write made just before, such as a reload after a create or a toggle.
- A `UICustomAction` function receives `(page, props, vars, event)`, and nothing else: no `scope`, so `scope.order` inside its code does not compile. To use the current `ForEach` item, add a variable on the custom action whose value is `scope.order` (or `scope.order.id`): action variables are evaluated in the event method, where `scope` exists. Then read `vars.order` in the code. `props.stack`, `props.parent` and `props.out` are also passed.

- An `AlertAction`'s `out` is the dismiss result `{data, role}`. `role` stays undefined: a button closes the alert with its value only, even when its role property is set (that role only styles it). `data` is the `value1`, `value2` or `value3` of the button pressed, `{}` by default. Give the confirming button a value, for example `value2` `({confirm: true})`, and test `out?.data?.confirm === true`. A condition on `out?.role` or `out?.confirm` is always false, so the action under it never runs, with no error.
- A value that a `SetLocalAction` sets deep in a chain (under an `IfAction`, after a call) can show only at the next change detection, the page keeping its former state. When that happens, add a `UICustomAction` after it whose code is `page.ref.detectChanges(); resolve(true);`.
- A `RootPageAction` to the page already shown does not run its page event again, so its data is not reloaded: call the page's read again instead.

### Expression contexts
Where an expression is written decides how it names things:

| The expression is in | Page local `x` | Current `ForEach` item `item` | Result of the previous action |
|---|---|---|---|
| the template: a `UIText` expression, a directive condition, a property binding | `local?.x` | `item` (the `directiveItemName`) | not available |
| an action property or an action variable | `c8oPage.local?.x` | `scope.item` | `out` (direct parent), `stack["<action name>"].out` |
| a `UICustomAction` body | `page.local.x`, to read only (set it with a `SetLocalAction`) | an action variable valued `scope.item`, read as `vars.item` | `props.parent.out` |

### Custom action output handling
Prefer direct source bindings over response-copying code. If a small `UICustomAction` is truly needed immediately after a `CallSequenceAction`, use the generated action parameters:
- Actions that depend on the call response must be children of the `CallSequenceAction` or children of a normalizer under that call. Do not place `SetLocalAction(Value=script:out)` as a sibling of the call under the same click/page event; sibling actions are generated in a parallel `Promise.all` block and do not receive the call response.
- `props.parent.out` is the parent `CallSequenceAction` output in current generated custom action functions
- If the parent output lacks the application records and contains only transport diagnostics, stop normalizing in the page. The business sequence is incomplete; add explicit shaping there and prove it before returning to the UI.
- `vars` contains variables local to the custom action
- never reference bare `out`, bare `parent`, `parent.out`, or `stack`; they are not in scope as top-level variables in generated custom action code
- do not assign `page.local.*` from custom code; return/resolve normalized data and use palette `SetLocalAction` nodes to update local state
- do not use browser globals such as `parent` or `parent.out`; in generated page code, `parent` resolves to `Window` and will fail TypeScript checks
- do not assume a `stack` variable exists inside the custom action body unless generated diagnostics prove it for that exact object
- if a failure handler needs an error message, read it from `event` defensively, for example `const message = event && event.message ? event.message : 'Search failed';`

### Shared actions with NPM dependencies
When a shared action/custom action needs an npm package:
