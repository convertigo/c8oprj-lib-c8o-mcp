# Contract proof before the structural gate

Read when: Contract proof before the structural gate. Summary: `convertigo://guides/data-page`.
Previous: `convertigo://guides/data-page/action-chain`. Next: `convertigo://guides/data-page/structure-gate`.

---

```json
{
  "target": "<ProjectName>.Application.NgxApp.pg:Page.Content.ErrorIf.ErrorText",
  "at": "self",
  "mode": "merge",
  "tree": {
    "properties": {
      "textValue": {
        "mode": "SOURCE",
        "value": "{\"filter\":\"Local\",\"project\":\"<ProjectName>\",\"input\":\"\",\"model\":{\"data\":[{\"localObject\":\"local\"}],\"path\":\"?.errorMessage\",\"prefix\":\"\",\"suffix\":\"\",\"custom\":\"\",\"useCustom\":false}}"
      }
    }
  }
}
```

Known-good `ForEach` creation. Keep `directiveItemName` and `directiveIndexName` as top-level properties of the `UIControlDirective`; do not put them inside the JSON string for `directiveSource`.

```json
{
  "target": "<ProjectName>.Application.NgxApp.pg:Page.Content.ResultsList",
  "at": "inside",
  "mode": "merge",
  "tree": {
    "name": "ResultsForEach",
    "className": "ngx.components.UIControlDirective#UIControlDirective",
    "properties": {
      "directiveName": "ForEach",
      "directiveSource": {
        "mode": "SOURCE",
        "value": "{\"filter\":\"Local\",\"project\":\"<ProjectName>\",\"input\":\"\",\"model\":{\"data\":[{\"localObject\":\"local\"}],\"path\":\"?.results?.items\",\"prefix\":\"\",\"suffix\":\"\",\"custom\":\"\",\"useCustom\":false}}"
      },
      "directiveItemName": "record",
      "directiveIndexName": "recordIndex"
    }
  }
}
```

After creating or patching a `ForEach`, immediately read it back with `properties:"all"`. The readback must show `directiveName`, `directiveSource`, `directiveItemName`, and `directiveIndexName` as separate properties before any child `UIText` uses `record.*`, `item.*`, or another iterator name. If only `directiveName` and `directiveSource` were updated, patch `directiveItemName` and `directiveIndexName` on the directive itself before continuing.
Known-good `If` directive update. `directiveExpression` is a scriptable Java string, not a `MobileSmartSourceType`; set it as a raw string value, not as `{mode,value}`.

```json
{
  "target": "<ProjectName>.Application.NgxApp.pg:Page.Content.ResultsIf",
  "at": "self",
  "mode": "merge",
  "tree": {
    "properties": {
      "directiveName": "If",
      "directiveExpression": "!local?.loading && !local?.error"
    }
  }
}
```

If `databaseobject-tree-apply` reports `argument type mismatch` on `directiveExpression`, read back the directive and patch `directiveExpression` as a raw string. Do not retry `SCRIPT`, `PLAIN`, or `SOURCE` SmartType wrappers for this property.
16. For conditional visibility, make the `UIControlDirective` the wrapper/parent of the component it controls. Do not put an `If` directive as a child of the component that should disappear; that can compile while leaving the note/progress/list visible at the wrong time.
17. Stay inside the target project. Do not trawl unrelated workspace pages or YAML files for ready-made directive trees unless the task explicitly provides a read-only example project.
18. Start the mobile builder early and treat builder/browser proof as part of the recipe, not as an afterthought.
19. Save after structural and runtime checks.
20. One targeted read, then visible mutation. A pass that only reads, saves, opens the builder, or repeats broad palette discovery without replacing the dominant starter content is a no-op.
