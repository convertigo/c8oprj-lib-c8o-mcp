# SmartSource JSON and visible search structure

Read when: SmartSource JSON and visible search structure. Summary: `convertigo://guides/http-app`.
Previous: `convertigo://guides/http-app/ngx-page`. Next: `convertigo://guides/http-app/ngx-page-3`.

---

### SmartSource Shape
Use the same single-escaped JSON string shape for `DoubleBinding`, `varValue`, and `directiveSource`:

```json
{"mode":"SOURCE","value":"{\"filter\":\"Local\",\"project\":\"<Project>\",\"input\":\"\",\"model\":{\"data\":[{\"localObject\":\"local\"}],\"path\":\"?.searchQuery\",\"prefix\":\"\",\"suffix\":\"\",\"custom\":\"\",\"useCustom\":false}}"}
```

For result lists, use the same shape with `path:"?.results?.items"`.

When writing the MCP tool-call arguments, the SmartSource `value` string must contain JSON text, not pre-escaped backslash text. In the decoded tool arguments it should read `"value":"{\"filter\":\"Local\",...}"`, never `"value":"{\\\"filter\\\":...}"`. A `SOURCE` value always starts with `{` after decoding, never with `{\"`.

In plain terms, the actual `value` string stored in the tool argument must be:

```text
{"filter":"Local","project":"<Project>","input":"","model":{"data":[{"localObject":"local"}],"path":"?.searchQuery","prefix":"","suffix":"","custom":"","useCustom":false}}
```

It must not be:

```text
{\"filter\":\"Local\",\"project\":\"<Project>\",...}
```

If readback displays the property value with backslashes before the JSON quotes, for example `'{\\\"filter\\\":...}'` or `'{\\\\\"filter\\\\\":...}'`, it is still double escaped and will generate empty Angular bindings. Correct readback displays a value beginning like `'{"filter":"Local",...}'` or `MobileSmartSourceType: source:{"filter":"Local",...}`.

If builder reports `[(ngModel)]=""`, `*ngFor=""`, or another empty generated Angular binding, do not blame the default `Value` property on the input and do not delete/recreate the visual component. Patch only the offending `DoubleBinding`, `varValue`, or `directiveSource` property with the unescaped JSON text above, then rerun `mobile-builder-open`.

After `mobile-builder-open`, generated HTML is diagnostic-only but must be checked. Empty generated bindings such as `[(ngModel)]=""`, `*ngFor=""`, or `*ngIf=""` mean the source SmartSource is still wrong even if the YAML mentions `source:`. Repair the Convertigo source object; never edit generated HTML.

### Visible UI
- Remove the starter placeholder content from the visible page.
- Headings need a `Heading1`/`Heading2` element with child `UIText`; do not set `textValue` on the heading element.
- Input uses top-level `DoubleBinding` bound to Local `?.searchQuery`. Do not use `ionChange`, DOM reads, `Value`, `Placeholder`, or guessed input cosmetics as repairs.
- The `DoubleBinding` object contains only `mode` and `value`. Do not nest unrelated input properties such as placeholders, labels, colors, or helper text inside `DoubleBinding`; skipped or ignored cosmetics waste headless turns.
- Example input node pattern: `{"name":"QueryInput","className":"ngx.components.UIDynamicElement#Input","properties":{"DoubleBinding":{"mode":"SOURCE","value":"{\"filter\":\"Local\",\"project\":\"<Project>\",\"input\":\"\",\"model\":{\"data\":[{\"localObject\":\"local\"}],\"path\":\"?.query\",\"prefix\":\"\",\"suffix\":\"\",\"custom\":\"\",\"useCustom\":false}}"}}}`. Use the actual local property name chosen for the page.
- If you already created an input with `Value` or a failed child binding, patch the same input by setting `DoubleBinding`; do not leave `Value` as the only local binding.
- The submit/refresh trigger needs a visible child `UIText` with the command label appropriate to the app.
- For any visible text, create `ngx.components.UIText#UIText` with property `textValue` set to the plain text or iterator interpolation. For a localized app, put the key in `textValue` and enable `i18n` as described in `convertigo://guides/ngx/i18n`.
- Once the query/filter input is accepted, continue immediately with the required trigger action chain and results list. Do not pause for optional styling, placeholder repair, extra page reads, broad replanning, or explanatory prose between the input, trigger, action chain, and list creation.

Trigger action chain:
