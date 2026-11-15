# Application contract and result mapping

Read when: Application contract and result mapping. Summary: `convertigo://guides/ngx`.
Previous: `convertigo://guides/ngx/http-search`. Next: `convertigo://guides/ngx/navigation`.

---

- The business sequence must already expose the application fields the UI stores or binds. Do not make the NGX page parse raw `TransactionStep` internals as the final data contract; browser action output can expose only `HttpInfo`, `attr`, or other diagnostics even when backend `requestable-execute` displayed richer raw transaction data. If that happens, repair the business sequence contract first.
- Treat any final page action script containing `out.transaction`, `out?.transaction`, `response?.transaction`, or `transaction.document` as non-compliant for HTTP-backed data pages. Those paths are diagnostics from the transport layer, not the page contract.
- Result rows/details must expose real domain fields from the business sequence contract, including at least one recognizable label/name field and one useful differentiator when available.
- Labels and component body text usually belong in `ngx.components.UIText#UIText` children, except form controls, whose label is their `Label` property. If `textValue` is skipped on a `UIDynamicElement#Button`, `UIDynamicElement#Paragraph`, heading, card, or similar component, add a `UIText` child instead of retrying the skipped property.
- UI submit: `UIDynamicElement#Button` -> `UIControlEvent`.
- Pre-call state changes use `SetLocalAction` nodes for `loading`, `error`, `empty`, and related flags. A small `UICustomAction` may only handle validation or normalization that palette actions cannot express.
- Backend call: `UIDynamicAction#CallSequenceAction` under that event, with `requestable` set to `<Project>.<businessSequence>`.
- Query handoff: `UIControlVariable` under the call action, with `varValue` sourced from the local `searchQuery` via SmartSource/source mode when possible.
- If the query does not reach the sequence during browser smoke, do not switch the variable to `script:document.querySelector(...)` and do not add an input event that copies the DOM value. Keep the input `DoubleBinding` and the `UIControlVariable.varValue` on the same Local SmartSource `?.searchQuery`, then fix the source binding shape until tree readback shows `source:{"filter":"Local",...,"path":"?.searchQuery"}` in both places.
- Scope note: visible template/component bindings do not expose a `page` object. For state that belongs to the page, prefer Local SmartSource bindings over TypeScript component fields.
- Exact tree-apply shape for the handoff: create `ngx.components.UIControlVariable#UIControlVariable` as a child of the `CallSequenceAction`; set its object `name` to the business sequence variable name such as `query`, and set only `varValue` plus `comment`. Do not set a separate `varName` property; on current trees the variable name is the object name and `varName` may be skipped.
- Exact call-action property: set `CallSequenceAction.requestable` to the business sequence requestable, for example `plain:<ProjectName>.<BusinessSequence>`. Do not set a property named `Sequence`; current tree readback leaves `requestable` empty when `Sequence` is used.
- Exact variable placement: `UIControlVariable` must be nested under the `CallSequenceAction`, not beside it under the `UIControlEvent`.
- If `palette-describe` is unavailable or fails for common NGX primitives, use `palette-list` plus this canonical shape instead of abandoning the palette path. Always confirm with `databaseobject-tree-get` that the child exists as `...vr:<variableName>` and that `varValue` is in `SCRIPT`, `SOURCE`, or deliberate plain mode.
- Failure handling: `UIActionFailureEvent` maps the action failure into page error state.
- Success handling: prefer binding visible results from the action/business sequence source. Use a small `UICustomAction` after the call only when the business sequence still returns an awkward legacy shape that cannot be bound directly.

The reference shape to emulate is:
`Button` -> `UIControlEvent` -> optional `UICustomAction` for local validation -> `CallSequenceAction` -> `UIControlVariable`.

The following shapes are non-compliant for normal HTTP search pages:
