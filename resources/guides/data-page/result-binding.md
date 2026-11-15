# Result storage and source binding examples

Read when: Result storage and source binding examples. Summary: `convertigo://guides/data-page`.
Previous: `convertigo://guides/data-page/input-binding`. Next: `convertigo://guides/data-page/action-chain`.

---

   - Use the same shape for `UIControlVariable.varValue`, `UIControlDirective.directiveSource`, `UIText.textValue`, and component properties that read page-local state. Change only `project` and `path`.
   - Keep `prefix` and `suffix` empty for Local SmartSources. For visible labels, create a separate static `UIText`/`Label` next to the bound value. Do not rely on SmartSource `prefix`/`suffix`; in generated Angular templates this can produce invalid interpolation such as `{{Label: local?.result?.name}}`.
   - Examples: `path:"?.searchQuery"` for the query, `path:"?.results?.items"` for a result list, `path:"?.loading"` for a visibility source.
   - Error text is page-local state too. A `UIText` that displays an error message must use Local SmartSource/source mode on `?.errorMessage`, not `script:local?.errorMessage || 'fallback'`. Put the default fallback in the page-enter `SetLocalAction` value or in the failure `SetLocalAction`, then bind the text directly to `?.errorMessage`.
   - If escaping feels difficult in a headless client, do not stop or downgrade to an input event. Paste the compact value exactly and change only `project` and `path`.
   - A page is not complete when it only writes `results` with `SetLocalAction`. It must also contain at least one visible widget/directive that reads result state with Local SmartSource/source mode, for example a `ForEach.directiveSource` on `?.results?.items`, a counter value on `?.results?.total`, or detail text bound to a selected/result item.
   - For search/list apps, bind real fields from the result contract, not only generic placeholder text. Inside a `ForEach`, those field reads are iterator-scope reads, not page-local reads: set `directiveItemName` to a neutral row name such as `record`, then use the loop item name such as `record.name` and another contract field in child text/action bindings, or first write a selected item into a local such as `selectedRecord` and then read its fields with Local SmartSource.
   - Text displayed inside Ionic/HTML components is usually a child `ngx.components.UIText#UIText`, not a `textValue` property on every `UIDynamicElement`. For `Button`, `Heading1`/`Heading2`/`Heading3`, card, paragraph, list item, or similar components, create the visual node with structural properties only and add a `UIText` child for the label/value. If readback says `textValue` was skipped, treat that as a failed mutation and avoid repeating it. On `UIText` itself, set `textValue` and optional `comment`; do not set a guessed `mode` property.

Known-good input binding update:

```json
{
  "target": "<ProjectName>.Application.NgxApp.pg:Page.Content.SearchForm.SearchInput",
  "at": "self",
  "mode": "merge",
  "tree": {
    "properties": {
      "DoubleBinding": {
        "mode": "SOURCE",
        "value": "{\"filter\":\"Local\",\"project\":\"<ProjectName>\",\"input\":\"\",\"model\":{\"data\":[{\"localObject\":\"local\"}],\"path\":\"?.searchQuery\",\"prefix\":\"\",\"suffix\":\"\",\"custom\":\"\",\"useCustom\":false}}"
      },
      "Placeholder": {
        "mode": "PLAIN",
        "value": "Enter search text"
      }
    }
  }
}
```

Known-good button event with backend handoff:
