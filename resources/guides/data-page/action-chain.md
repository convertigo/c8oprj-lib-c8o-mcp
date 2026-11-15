# Action chain, custom action and output rules

Read when: Action chain, custom action and output rules. Summary: `convertigo://guides/data-page`.
Previous: `convertigo://guides/data-page/result-binding`. Next: `convertigo://guides/data-page/proof-gate`.

---

```json
{
  "target": "<ProjectName>.Application.NgxApp.pg:Page.Content.SearchForm.SearchButton",
  "at": "inside",
  "mode": "merge",
  "tree": {
    "name": "SearchClick",
    "className": "ngx.components.UIControlEvent#UIControlEvent",
    "properties": {
      "eventName": "onClick",
      "comment": "Run search"
    },
    "children": [
      {
        "name": "SetLoading",
        "className": "ngx.components.UIDynamicAction#SetLocalAction",
        "properties": {
          "Property": "loading",
          "Value": {
            "mode": "SCRIPT",
            "value": "true"
          }
        }
      },
      {
        "name": "CallSearch",
        "className": "ngx.components.UIDynamicAction#CallSequenceAction",
        "properties": {
          "requestable": {
            "mode": "PLAIN",
            "value": "<ProjectName>.<BusinessSequence>"
          }
        },
        "children": [
          {
            "name": "<requestVariable>",
            "className": "ngx.components.UIControlVariable#UIControlVariable",
            "properties": {
              "comment": "Search query",
              "varValue": {
                "mode": "SOURCE",
                "value": "{\"filter\":\"Local\",\"project\":\"<ProjectName>\",\"input\":\"\",\"model\":{\"data\":[{\"localObject\":\"local\"}],\"path\":\"?.searchQuery\",\"prefix\":\"\",\"suffix\":\"\",\"custom\":\"\",\"useCustom\":false}}"
              }
            }
          },
          {
            "name": "StoreResults",
            "className": "ngx.components.UIDynamicAction#SetLocalAction",
            "properties": {
              "Property": "results",
              "Value": {
                "mode": "SCRIPT",
                "value": "(() => { const body = out.items ? out : (out.contract || out.response || out.object || out); const items = body.items || body.array || body.results || body.records || []; return {items: Array.isArray(items) ? items : [], total: body.total || body.total_count || body.count || (Array.isArray(items) ? items.length : 0), query: c8oPage.local?.searchQuery}; })()"
              }
            }
          },
          {
            "name": "SetLoadingFalse",
            "className": "ngx.components.UIDynamicAction#SetLocalAction",
            "properties": {
              "Property": "loading",
              "Value": {
                "mode": "SCRIPT",
                "value": "false"
              }
            }
          }
        ]
      }
    ]
  }
}
```

If a headless client struggles to emit the nested JSON above, build the same shape incrementally instead of continuing to generate a malformed large patch:

1. Create `SearchClick` under the button.
2. Create `SetLoading` under `SearchClick`.
3. Create `CallSearch` under `SearchClick`.
4. Create `vr:<requestVariable>`, `StoreResults`, and `SetLoadingFalse` under `CallSearch`.
5. Read back `CallSearch` and require QNames ending in `.CallSearch.StoreResults` and `.CallSearch.SetLoadingFalse` before proof.

Do not copy the `StoreResults` fallback blindly. After the business sequence runtime proof, inspect the actual JSON body and set `items` from the proven shaped business sequence contract. Accept final UI mappings from explicit business sequence fields such as `out.items`, `out.contract?.items`, `out.response?.items`, or another proven non-transport application object. Do not use `out.transaction`, `out?.transaction`, `response?.transaction`, `transaction.document`, `HttpInfo`, headers, or other raw transport subtrees in final `StoreResults`. If those paths seem necessary to reach records, the business sequence contract is incomplete: stop UI work, repair the business sequence so it emits `items`/`total`/`query` or equivalent application fields, rerun business sequence proof, then resume UI. If row bindings later use `record.properties.*`, the stored `items` array must be the shaped business sequence array whose elements really contain `properties`.

Known-good Local text binding for an error message:
