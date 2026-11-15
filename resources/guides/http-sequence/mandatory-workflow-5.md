# Early output proof and application-record contracts

Read when: Early output proof and application-record contracts. Summary: `convertigo://guides/http-sequence`.
Previous: `convertigo://guides/http-sequence/mandatory-workflow-4`. Next: `convertigo://guides/http-sequence/recommended-mcp-tools`.

---

- During early headless proof, it is acceptable to set `TransactionStep.output=true` to expose the transaction payload and prove the business sequence path. If the final design requires a stable shaped contract, replace that diagnostic output with explicit shaping before completion. Do not continue to UI work while the business sequence returns only metadata.
- A transport-only response is also not usable. `HttpInfo`, request headers, response headers, `project`, `sequence`, and `context` prove that a call happened, but they do not prove that the application has data. For JSON endpoints, the direct transaction and the business sequence must expose the JSON body or a shaped contract with application fields.
- For search/list business sequences, prefer a stable business sequence contract such as `{items:[...], total, query}`. The UI should bind to that contract, not guess over raw transport metadata or over the internal `TransactionStep` shape.
- For UI-facing HTTP business sequences, a public payload whose useful records are described as `transaction.document`, `transaction.document.array`, `HttpInfo`, or headers is not yet a stable business sequence. Read `convertigo://guides/backend` and `convertigo://resources/convertigo-json-quickref`, keep the raw `TransactionStep` internal (`output=false`), and make explicit JSON/XML shaping steps produce public fields such as `items`, `total`, `query`, and optional `error`. If shaping cannot be authored from palette/readback, stop and report the missing shaping contract instead of moving the raw parsing into NGX.
- Minimum proven repair for a JSON endpoint whose transaction produces an array at `./document/array`: set the `TransactionStep.output` property to `false`, add `steps.XMLCopyStep` under the business sequence, and set `sourceDefinition` to `["<TransactionStep priority>","./document/array"]`. The business sequence proof should then expose a top-level `array` and no `transaction` object. A UI may normalize this public `out.array` into its local `{items,total,query}` contract; it must not read `out.transaction`.
- Keep `["<TransactionStep priority>","./document/array"]` stable during repair. `requestable-execute` serializes a direct transaction response as a JSON body and may show `array` at the root; that is not evidence that the internal SmartSource XPath should become `./array`. If `./document/array` produces no public array, confirm the producer priority and direct JSON proof. If it produces records but ignores the submitted query/filter, repair the business sequence variable and child `StepVariable` mapping; the XPath is not the pass-through mechanism.
- Do not solve a routine JSON business sequence by walking `context.outputDocument`, using `getElementById`, or re-exposing raw `TransactionStep.output=true` as the final contract. Those are diagnostic paths. Final UI-facing proof should come from JSON steps, XML copy steps, or another explicit backend shaping object with the raw transaction output hidden.
- Do not rely on the NGX client to parse an HTTP transaction subtree. Browser/SDK action output may expose only diagnostic nodes such as `HttpInfo` and `attr` even when `requestable-execute` shows richer transaction arrays or XML. If the UI needs records, map those records into explicit business sequence fields first, prove those fields through the business sequence requestable, and only then wire `CallSequenceAction`.
- Do not disable `httpInfo` just to avoid an HTTP diagnostic error. If `httpInfo=false` makes the response metadata-only, that is a hidden failure, not a proof.

### Why this is the right way
- The upstream API can evolve without forcing the UI to change immediately.
- Schema and source picker behavior remain usable for downstream steps.
- Transport debugging happens where the problem actually is.

