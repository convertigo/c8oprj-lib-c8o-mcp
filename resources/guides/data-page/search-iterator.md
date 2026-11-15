# ForEach sources and row field text

Read when: ForEach sources and row field text. Summary: `convertigo://guides/data-page`.
Previous: `convertigo://guides/data-page/search-results`. Next: `convertigo://guides/data-page/search-ui`.

---

7. After successful calls, prefer source bindings from the action output. If the business sequence returns a raw legacy array shape, a small post-call `UICustomAction` may normalize the response, but it must not perform the backend call.
   - Do not put `SetLocalAction(Value=script:out)` as a sibling of the `CallSequenceAction` under the same `UIControlEvent`. Sibling actions are generated in a parallel `Promise.all` block, so `out` is not the call response. Put success mapping actions as children of the `CallSequenceAction`, or use a small normalizer child under the call.
   - The required success subtree is structural: `SearchButton -> SearchClick -> CallSearch -> [vr:<requestVariable>, StoreResults, SetLoadingFalse]`. It is not enough for the final summary to list `StoreResults` after `CallSearch`; readback must show the `StoreResults` and `SetLoadingFalse` QNames under the `CallSequenceAction` QName. If readback shows `...SearchClick.StoreResults`, delete that action and recreate it under `...CallSearch.StoreResults`.
   - For `SetLocalAction` or any other SmartType property sent with `{ "mode": "SCRIPT" }`, do not include the `script:` prefix inside the `value`. `databaseobject-tree-apply` adds that prefix when it writes the SmartType. Use `{"mode":"SCRIPT","value":"{items: out.items || []}"}`, not `{"mode":"SCRIPT","value":"script:{items: out.items || []}"}`.
   - A `UIControlVariable` child such as `vr:<requestVariable>` is sent to the sequence, but its name is not a JavaScript local inside later child actions. Do not write `Value=script:{items: out.items, query: query}`; the generated TypeScript contains an undefined bare identifier and the UI silently keeps an empty list. If you need to preserve the typed query in result state, read `c8oPage.local?.searchQuery` or omit the `query` field. A safe direct mapping can use `out` for the call response plus `c8oPage.local?.searchQuery` for page-local state.
   - If `loading=true` is set before the backend call and result or empty visibility depends on `!local?.loading`, add another child `SetLocalAction(Property=loading, Value=script:false)` under the same `CallSequenceAction` after the result mapping. A compiled page can still fail browser smoke when data arrives but `loading` never returns to false.
   - A `SetLocalAction(Property=loading, Value=script:false)` under `UIActionFailureEvent` / `UIActionErrorEvent` is only the failure path. It does not reset loading after a successful backend call. Create a separate success-path reset directly under the `CallSequenceAction`, outside the handler.
   - If your self-audit says the reset is missing, create it immediately as the next mutation. Do not continue to mobile-builder proof, final summary, or optional error handling until the success path can leave the loading state.
   - In such small `UICustomAction` code after a `CallSequenceAction`, the generated function receives action context through `props`; use `props.parent.out` for the parent action output. Do not reference bare `out`, bare `parent`, `parent.out`, or `stack`; those produce invalid generated TypeScript in current NGX builds.
   - The normalizer may `resolve(normalized)` and let following palette actions consume that value. It must not assign `page.local.*` directly; write `results`, `empty`, `loading`, and errors with `SetLocalAction` nodes.

Minimal compliant local-state UI wiring:
- page-enter `UIPageEvent` (`onDidEnter` by default) -> `SetLocalAction` for every page local, including `searchQuery`, `loading`, `error`, `errorMessage`, `empty`, and `results`
- input `DoubleBinding` / Binding -> Local SmartSource `?.searchQuery` in source mode
- no input `(ionChange)` / `InputChange` -> `SetLocalAction(Property=searchQuery)` copy action
- search button -> `UIText` child with the intended action label; then `(click)` -> `SetLocalAction(Property=loading, Value=script:true)` -> `CallSequenceAction`
