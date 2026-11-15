# Submit chain, call variables and result storage

Read when: Submit chain, call variables and result storage. Summary: `convertigo://guides/http-app`.
Previous: `convertigo://guides/http-app/ngx-page-2`. Next: `convertigo://guides/http-app/ngx-page-4`.

---

- Preferred first write: create the submit/refresh button under the visible content with child `UIText` and the click subtree through `CallSequenceAction + UIControlVariable` in the same focused `tree`. Do not create a bare button and postpone the event chain to later reasoning; that wastes turns.
- The first trigger subtree is: `Button -> UIText + UIControlEvent -> SetLocalAction(loading=true) + CallSequenceAction(requestable=<Project>.<BusinessSequence>) -> UIControlVariable`.
- Then add `StoreResults` and `SetLoadingFalse` as separate `SetLocalAction` children under the exact `CallSequenceAction` QName, never under the `UIControlEvent`.
- `SetLocalAction(Property=loading, Value=true)` uses `Value:{"mode":"SCRIPT","value":"true"}`.
- `CallSequenceAction.requestable` must be the exact public business sequence requestable, including case.
- Under the `CallSequenceAction`, child `UIControlVariable` is named exactly like the business sequence variable; do not use descriptive aliases.
- the `UIControlVariable` must set property `varValue` to the Local `?.searchQuery` SmartSource. The property name is exactly `varValue`; do not use `value`, `Value`, child directives, or a separate binding object.
- `UIControlVariable` does not store call results. Do not set guessed properties such as `storeResults`, `Variable`, `varName`, `target`, or similar result-storage aliases on `UIControlVariable`. Results must be stored by a separate child `SetLocalAction` under the `CallSequenceAction`.
- example variable node: `{"name":"<sequenceVariable>","className":"ngx.components.UIControlVariable#UIControlVariable","properties":{"varValue":{"mode":"SOURCE","value":"{\"filter\":\"Local\",\"project\":\"<Project>\",\"input\":\"\",\"model\":{\"data\":[{\"localObject\":\"local\"}],\"path\":\"?.searchQuery\",\"prefix\":\"\",\"suffix\":\"\",\"custom\":\"\",\"useCustom\":false}}"}}}`
- There is no `ngx.components.UIDynamicAction#StoreResults` class. `StoreResults` is only a useful object name; its class must be `ngx.components.UIDynamicAction#SetLocalAction` with `Property=results`.
- under the `CallSequenceAction`, child `SetLocalAction(Property=results)` with this normalizer:

```json
{"mode":"SCRIPT","value":"(() => { const body = out.items ? out : (out.contract || out.response || out.object || out); const items = body.items || body.array || body.features || body.results || body.records || []; return {items: Array.isArray(items) ? items : [], total: body.total || body.totalItems || body.total_count || body.count || (Array.isArray(items) ? items.length : 0), query: c8oPage.local?.searchQuery}; })()"}
```

- under the `CallSequenceAction`, child `SetLocalAction(Property=loading, Value=false)` using `Value:{"mode":"SCRIPT","value":"false"}`
- any action that reads `out` must be a descendant of the `CallSequenceAction`, not a sibling under the event.
After `SetLocalAction(Property=results)` and `SetLocalAction(Property=loading,false)` are created under the call, stop repairing optional UI, save the project, open the mobile builder, run the business sequence proof once more, and answer. Do not loop on cosmetic reads or repeat the same action-chain explanation.

Results list:
- Create `ResultsList` then one `UIControlDirective` child.
- Set `directiveName` to the raw string `ForEach` when creating the directive; some readbacks omit this default, so do not repair only because `directiveName` is absent when the item/source fields are accepted.
- `directiveSource`: Local `?.results?.items` SmartSource.
- `directiveItemName` and `directiveIndexName` are raw strings, for example `record` and `index`, not SmartType objects.
- `directiveName:"ForEach"` does not define the template variable by itself. The exact root used by row text must be the `directiveItemName`: if text uses `{{ item.name }}`, set `directiveItemName:"item"`; if text uses `{{ record.name }}`, set `directiveItemName:"record"`.
