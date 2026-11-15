# Input Local SmartSource and binding examples

Read when: Input Local SmartSource and binding examples. Summary: `convertigo://guides/data-page`.
Previous: `convertigo://guides/data-page/golden-path`. Next: `convertigo://guides/data-page/result-binding`.

---

13. Page-local state must live in Convertigo locals, not TypeScript fields in `Begin_c8o_PageDeclaration`. Input-owned values such as `searchQuery` should be modeled with the input palette Binding/`DoubleBinding` property. Action-owned values such as `results`, `items`, `loading`, `error`, `errorMessage`, or selected item state should be created and updated with `UIDynamicAction#SetLocalAction`.
14. Every page local used by a Local SmartSource or by `SetLocalAction` must be initialized in the page-enter lifecycle with `SetLocalAction` before the first user interaction. In current NGX trees this is a `UIPageEvent`; its default `viewEvent` is `onDidEnter`, which is the Convertigo page-enter event for this rule. This includes input-owned locals such as `searchQuery` and action-owned locals such as `results`, `loading`, `empty`, `error`, and `errorMessage`.
15. Components/directives bound to page-local state must read it with `SC`/source SmartSource on `Local`, for example `MobileSmartSourceType: source:{"filter":"Local",...}`. Do not bind page-local state with `script:searchQuery`, `script:page.searchQuery`, `script:this.local?...`, `plain:loading`, or similar script/plain expressions.
   - This rule overrides generic palette help that suggests `this.local?.myProperty` in TS mode. That TS form may compile, but this recipe requires source mode on `Local`.
   - For `databaseobject-tree-apply`, a local SmartSource value has this shape:

```json
{
  "mode": "SOURCE",
  "value": "{\"filter\":\"Local\",\"project\":\"<ProjectName>\",\"input\":\"\",\"model\":{\"data\":[{\"localObject\":\"local\"}],\"path\":\"?.searchQuery\",\"prefix\":\"\",\"suffix\":\"\",\"custom\":\"\",\"useCustom\":false}}"
}
```
