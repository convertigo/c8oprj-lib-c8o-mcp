# Iterator rows, visible proof and stop conditions

Read when: Iterator rows, visible proof and stop conditions. Summary: `convertigo://guides/http-app`.
Previous: `convertigo://guides/http-app/ngx-page-3`.

---

- Known-good directive properties are: `directiveSource:{mode:"SOURCE",value:"{...Local ?.results?.items...}"}`, `directiveItemName:"record"`, and `directiveIndexName:"recordIndex"`.
- Put the repeated row/list item under the directive.
- Row `UIText` children may use plain iterator interpolation such as `{{ record.name }}`, `{{ record.label }}`, `{{ record.id }}`, or nested equivalent fields from the proven payload. Do not bind row fields through page Local SmartSource.
- Example row text node: `{"name":"NameText","className":"ngx.components.UIText#UIText","properties":{"textValue":"{{ record.name }}"}}`.
After creating the `UIControlDirective`, read it back with `properties:"all"`. The readback must show `directiveSource`, `directiveItemName`, and `directiveIndexName` as separate directive properties. If the apply result updated only `directiveSource`, if it updated only `directiveName`, or if readback misses `directiveItemName`, patch the directive itself before adding or proving row text. If row text uses `record.*`, readback must show `directiveItemName: record`; if row text uses `item.*`, readback must show `directiveItemName: item`. Generated HTML should contain `let <directiveItemName> of ...`, not only an auto-generated item variable.

Headless completion rule:
- After the business sequence proof is green, the minimum UI completion path is: delete starter content, initialize page locals, create heading, create a query/filter input, create a submit/refresh trigger with `UIText`, create button `UIControlEvent`, create `SetLocalAction(loading=true)`, create `CallSequenceAction`, add same-name `UIControlVariable`, add child `SetLocalAction(results)` normalizer, add child `SetLocalAction(loading=false)`, create a result collection view with `ForEach`, save, open builder, answer.
- Keep moving through that path with short direct MCP writes. Only stop to read back when a write returns `partial`, skipped properties, an error, or when a required `priority`/QName is needed for the next object.

## Proof And Stop
Before final answer:
1. Direct HTTP proof shows records.
2. Business sequence proof shows records directly and query forwarding.
3. Readback confirms `TransactionStep.output=false`.
4. Input and UI request variable use Local `?.searchQuery`.
5. Store results and loading=false are children of `CallSequenceAction`.
6. Result list repeats over Local `?.results?.items` with explicit item name.
7. `project-save` and `mobile-builder-open` pass.
8. Stop after first green proof; external callers may perform independent validation.
