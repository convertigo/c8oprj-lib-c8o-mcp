# HTTP search page input and state

Read when: HTTP search page input and state. Summary: `convertigo://guides/ngx`.
Previous: `convertigo://guides/ngx/events`. Next: `convertigo://guides/ngx/http-results`.

---

6. `UICustomAction` is allowed only for true local side effects, not as the primary transport or response mapper when source bindings can consume the action output

### HTTP search page pattern
For a search app backed by an HTTP web service, use this shape. Open data APIs are just one example:
- Backend: `HttpConnector` -> typed `JsonHttpTransaction` -> public business sequence `GenericSequence`.
- UI search input: `UIDynamicElement#Input` inside a `UIDynamicElement#FormItem`, with its `Label` property set and `LabelPlacement` `stacked` (see Forms and input fields); bind its Binding/`DoubleBinding` property to a page local such as `?.searchQuery` with `SC`/source mode on `Local`. Do not use `ionChange`/`InputChange` plus `SetLocalAction` only to copy the typed value.
- Page-local UI state must live in Convertigo locals, not in TypeScript page fields. Do not declare `searchQuery`, `results`, `loading`, `error`, or similar state in `Begin_c8o_PageDeclaration`.
- Add a page-enter `UIPageEvent` that initializes every local used by Local SmartSources or `SetLocalAction` with `SetLocalAction` before first render/user interaction. In current NGX trees the default `viewEvent` is `onDidEnter`, which satisfies this page-enter initialization rule. A search page normally initializes `searchQuery`, `loading`, `error`, `errorMessage`, `empty`, and `results`.
- Widgets/directives that read page-local UI state must use SmartSource/source mode on `Local`, for example `source:{"filter":"Local",...}`. Do not bind that state with `script:searchQuery`, `script:page.searchQuery`, `script:this.local?...`, or `plain:loading`.
- If `palette-describe` for `SetLocalAction` suggests reading back the value with `this.local?.myProperty` in TS mode, treat that as generic palette documentation and override it for data pages. This guide requires Local SmartSource reads.
- Tree-apply local read shape:

```json
{
  "mode": "SOURCE",
  "value": "{\"filter\":\"Local\",\"project\":\"<ProjectName>\",\"input\":\"\",\"model\":{\"data\":[{\"localObject\":\"local\"}],\"path\":\"?.results?.items\",\"prefix\":\"\",\"suffix\":\"\",\"custom\":\"\",\"useCustom\":false}}"
}
```

- Use that shape for `UIControlVariable.varValue`, `UIControlDirective.directiveSource`, `UIText.textValue`, and dynamic component properties whenever the value comes from `SetLocalAction`.
- Short form: `{"mode":"SOURCE","local":"?.results?.items"}` is expanded by the MCP to exactly that shape, with the object's project. Prefer it when writing trees; readbacks show the full form.
- For input query binding, the same shape is known to apply cleanly as `DoubleBinding` when `path` is `?.searchQuery`. Do not stop at an "escaping is tricky" explanation and do not replace it with `ionChange`; apply the compact `SOURCE` value and read back the object.
- For button handoff, a known-good minimal chain is `UIControlEvent#UIControlEvent(eventName:onClick)` -> `UIDynamicAction#SetLocalAction(Property:loading)` -> `UIDynamicAction#CallSequenceAction(requestable: plain:<Project>.<businessSequence>)` -> `UIControlVariable#UIControlVariable(name:<sequenceVar>, varValue:<Local SOURCE ?.searchQuery>)`.
- Keep Local SmartSource `prefix` and `suffix` empty. For visible labels of displayed values, use separate static `UIText` objects around the bound value; form controls are different and use their own `Label` property. Affixes on Local SmartSources can generate invalid Angular interpolation.
- Do not stop after storing the backend result in a local. Build a visible result surface that reads local result state with SmartSource/source mode, such as a `ForEach.directiveSource` on `?.results?.items`, a counter bound to `?.results?.total`, or detail text bound to one selected/result item.
