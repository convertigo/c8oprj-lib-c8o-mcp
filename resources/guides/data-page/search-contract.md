# Search input, public variables and shaping

Read when: Search input, public variables and shaping. Summary: `convertigo://guides/data-page`.
Previous: `convertigo://guides/data-page/structure-gate`. Next: `convertigo://guides/data-page/search-input`.

---

- one backend action, `UIDynamicAction#CallSequenceAction`
- one `UIControlVariable` per request variable that the business sequence needs
- visible loading, empty, and error branches
- a repeated result structure using palette objects/directives, not a raw fragment loop

If this gate cannot be satisfied from the current guide plus `palette-list`/`palette-describe`, stop and surface the missing palette contract. Do not compensate by building the page with a large `UICustom` fragment or by calling `this.c8o.callJson(...)` from `scriptContent`.

Passing the gate requires the visible structure itself to be palette-modeled. A `UICustom` that only "renders" the form, notes, or results while hosting a child `CallSequenceAction` still fails the gate because the page body is hidden in `htmlTemplate`.

If this gate fails after an attempted implementation, do not finish by presenting the project. Rework the page until the tree readback passes the gate; the failure is structural, not cosmetic.

### Search business sequence wiring example
For any search/list page backed by an HTTP web service, use the same wiring pattern as a normal business-sequence-backed search:
0. Backend business sequence: when the business sequence calls an HTTP transaction through `TransactionStep`, follow `convertigo-recipe-http-business-sequence`. Set `TransactionStep.sourceTransaction` to the runtime path such as `Project.Connector.Transaction`, never to a Studio QName such as `Project.cn:Connector.tr:Transaction`. For simple pass-through variables, create a public business sequence variable with the same object name as the HTTP transaction variable, then create a same-named `StepVariable` under the transaction step with `value` set to that variable name. Do not rename the public variable to a UI label unless business sequence proof shows the renamed value is forwarded. Do not set `sourceDefinition` to a one-item XPath array such as `["./../vr:<requestVariable>/text()"]` or to an absolute QName such as `["Project.sq:search.vr:<requestVariable>/text()"]`; that shape can be saved but later crashes execution with `NumberFormatException`. Use `sourceDefinition` only when you deliberately have a real producer step priority plus XPath tuple such as `["1780000000000", "./field/text()"]`. Prove with `requestable-execute` that the outgoing HTTP URL, request payload, or returned application data contains the user value; a broad unfiltered response is a failed business sequence proof even if it contains records.
   - The business sequence proof must be shaped before UI work. If the useful record array is only under `transaction.document` or another raw transaction subtree, read `convertigo://guides/backend` and `convertigo://resources/convertigo-json-quickref`, add backend shaping steps that emit `items`/`total`/`query` or equivalent application fields, rerun business sequence proof, and only then create `CallSequenceAction` result bindings. Do not compensate by parsing `transaction.document` in `StoreResults`.
   - For a JSON transaction whose records are at `./document/array`, the minimum proven repair is `TransactionStep.output=false` plus an `steps.XMLCopyStep` sibling with `sourceDefinition:["<TransactionStep priority>","./document/array"]`. The business sequence then returns a public top-level `array`; the UI `StoreResults` may read `out.array` and normalize it to local `results.items`. Keep that XPath stable even if a direct transaction proof displays a root JSON `array`; `requestable-execute` output is not the internal SmartSource XPath. If the business sequence copy is empty, verify producer priority/direct JSON proof. If it is broad or unfiltered, fix request variable pass-through, not the copy XPath.
1. Page state keeps only local UI concerns such as `searchQuery`, `loading`, `error`, and optionally a selected item. Store those concerns in Convertigo locals: input-owned values through palette Binding/`DoubleBinding`, action-owned values through `SetLocalAction`.
