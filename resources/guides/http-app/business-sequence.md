# Business sequence

Read when: Business sequence. Summary: `convertigo://guides/http-app`.
Previous: `convertigo://guides/http-app/http-backend-3`. Next: `convertigo://guides/http-app/ngx-page`.

---

## Business sequence
1. Create a public `sequences.GenericSequence` business sequence. Set only known sequence properties such as `comment`; do not set guessed sequence flags such as `final` or `output`. Do not create hard-coded sample records as the primary contract.
2. Keep the same request variable object name across:
   - HTTP transaction `RequestableHttpVariable`
   - public business sequence `variables.RequestableVariable`
   - `variables.StepVariable` under the `TransactionStep`
   - UI `UIControlVariable`
   Choose this name before creating the business sequence. When the HTTP transaction already has one primary request variable, use that exact object name end to end instead of creating a public alias and remapping it later. The public business sequence variable must be an actual child of the sequence, not only a `StepVariable` under the transaction step; otherwise external callers and UI actions have no stable public contract.
3. Add `steps.TransactionStep`:
   - `sourceTransaction`: runtime path `<Project>.<Connector>.<Transaction>`
   - `output`: `false`
4. Read back the sequence and verify both `variables.RequestableVariable` and `variables.StepVariable` are present, then get the exact `priority` string from the `TransactionStep`.
5. Add `steps.XMLCopyStep`:
   - `sourceDefinition:["<TransactionStep priority>","./document/array"]`
   - `output:true`
   - use the readback `priority`, never the QName, step name, or ordinal `"1"`
   - do not add guessed properties such as `outputDefinition`
6. Prove the business sequence with `requestable-execute`. Final payload must expose records directly, for example top-level `array`, `items`, `features`, or equivalent. Do not leave useful records only under `transaction.document`, `HttpInfo`, or headers.
   If the direct transaction proof is green but business sequence proof is empty or errors, repair only business sequence wiring: `sourceTransaction` must point to an existing runtime transaction path, `StepVariable` names/values must match the request variable, and `XMLCopyStep.sourceDefinition` must use the readback `TransactionStep.priority`. Do not switch provider, rename/delete the proven transaction, delete the `XMLCopyStep`, or set `TransactionStep.output:true` as a business sequence repair.
   Do not change `XMLCopyStep.sourceDefinition` from `./document/array` to `array`, `./array`, `payload/array`, or guessed paths just because `requestable-execute` displays a top-level JSON `array`. That display is the serialized response body, not the internal step XPath. If the copy is empty, read back the producer priority and verify same-name variable pass-through; if it still cannot emit records, stop and report the business sequence proof incomplete instead of changing provider or moving to UI work.
