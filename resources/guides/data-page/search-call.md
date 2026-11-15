# CallSequenceAction and request variables

Read when: CallSequenceAction and request variables. Summary: `convertigo://guides/data-page`.
Previous: `convertigo://guides/data-page/search-input`. Next: `convertigo://guides/data-page/search-results`.

---

4. The next child action is `UIDynamicAction#CallSequenceAction` pointing at the public business sequence, for example `<Project>.<BusinessSequence>`.
   - With `databaseobject-tree-apply`, set the action property named `requestable`, not `Sequence`.
   - Use plain mode for the requestable value, for example:

```json
{
  "name": "CallSearch",
  "className": "ngx.components.UIDynamicAction#CallSequenceAction",
  "properties": {
    "requestable": {
      "mode": "PLAIN",
      "value": "<ProjectName>.<BusinessSequence>"
    }
  }
}
```

   - After creating the action, read it back. If `requestable` is empty or a property named `Sequence` was skipped, fix the action before adding variables or claiming proof.
   - Do not point the UI at the raw connector transaction after a business sequence proof fails. Repair the business sequence and keep the UI requestable on the public business sequence. A direct transaction proof is not a substitute for a business sequence contract.
   - The `CallSequenceAction` should call a business sequence whose response already contains the records or value fields the UI needs. If browser smoke shows `out.transaction.document` only contains `HttpInfo`, `attr`, or other diagnostics, do not keep widening UI-side parsing. Repair the business sequence contract so it emits application fields directly, then bind/store those shaped fields.
5. Under the call action, add `UIControlVariable` children for the business sequence variables, using the exact public business sequence variable names. For simple HTTP pass-through this is usually the same object name as the HTTP transaction variable. Source values from the local `searchQuery` using SmartSource/source mode on `Local` when possible.
   - With `databaseobject-tree-apply`, create `ngx.components.UIControlVariable#UIControlVariable` under the call action.
   - Use the object `name` as the variable name sent to the sequence, for example `name: "<requestVariable>"`.
   - Set `varValue` to the local SmartSource; do not add a separate `varName` property unless tree readback proves that property exists in the current Studio version.
   - The `UIControlVariable` object name and the `varValue` Local path are deliberately different when the business sequence variable has a provider name. For example, create `CallSearch.vr:q` when the business sequence variable is `q`, but set its `varValue` to Local `?.searchQuery`. Never set `varValue` to Local `?.q` unless the page already has a deliberate non-search local named `q` for a different reason.
   - Do not create placeholder variable objects such as `queryParam`, `formatParam`, or `limitParam` and then try to set `varName`. If `varName` is skipped, the runtime sends the placeholder object name and the business sequence receives nothing useful. The object QName must end with `.vr:<requestVariable>`.
   - Do not put `UIControlVariable` as a sibling of `CallSequenceAction` under the event. It must be a child of the call action, so the QName ends like `...CallSearch.vr:<requestVariable>`.
   - Do not use `varValue: "script:this.local?.searchQuery"` for page locals. Use the same Local SmartSource/source JSON used by the input `DoubleBinding`.
   - Scope note: avoid TypeScript page fields and avoid `page.searchQuery` for page-local state. The local SmartSource is the stable representation for both visible widgets and action variables.
   - After creation, read back the child and expect a QName ending in `.vr:<requestVariable>` plus a `varValue` property.
