# Anti-patterns / do not do

Read when: Anti-patterns / do not do. Summary: `convertigo://guides/http-sequence`.
Previous: `convertigo://guides/http-sequence/recommended-mcp-tools`. Next: `convertigo://guides/http-sequence/minimum-validation-proof`.

---

## Anti-patterns / do not do
- Do not bind UI directly to raw HTTP transaction output.
- Do not perform HTTP transport in a business sequence with JavaScript; use `HttpConnector` + typed HTTP transaction + `TransactionStep`.
- Do not let the connector base URL and transaction subPath drift into an incoherent mix.
- Do not replace a required live HTTP integration with a `SimpleStep` or hard-coded sample data just because the first `requestable-execute` failed. Keep the connector, transaction, and `TransactionStep` rail intact; diagnose the transport or mark the run incomplete.
- Do not disable `httpInfo` during initial setup if transport visibility matters.
- Do not call the run done because the transaction succeeds once while the business sequence contract is still unstable.

### Common failure modes
- Wrong transaction type for the upstream payload.
- Attempting to repair a wrong transaction type by replacing the existing node with another `className`; that keeps the old object type. Delete and recreate instead.
- Business sequence bypasses the connector and performs the HTTP call directly in JavaScript.
- Connector host/SSL/port/baseDir not coherent, often caused by setting skipped `url` instead of `server`.
- Endpoint path drift, for example adding a guessed `/api` prefix or changing a documented path without proof.
- Transaction query variables not modeled as `RequestableHttpVariable` children, often caused by setting skipped `parameters` or `httpParameters` properties.
- Runtime proof calls a database object QName such as `Project.cn:Connector.tr:Transaction`; `requestable-execute` needs `Project.Connector.Transaction`.
- `TransactionStep.sourceTransaction` contains a QName such as `Project.cn:Connector.tr:Transaction`; it also needs `Project.Connector.Transaction`.
- Port value written with the wrong type and materialized incorrectly.
- Optional properties guessed from other frameworks, such as connector `timeout` or sequence-level `output`, are skipped and create false proof noise.
- Schema never captured, then source picker and mapping work become guesswork.
- Stub path and live path produce different top-level fields, or the live path is removed after a stub is added.
- Business sequence validates only because raw `TransactionStep.output=true` leaks the connector response, while the claimed stable fields are not actually produced.
- Business sequence proof shows useful data only inside a raw `transaction.document` subtree, while the intended UI contract object has only status/query/metadata. That is not a complete business sequence contract; add explicit shaping fields before UI work.
- Business sequence `requestable-execute` returns `status:"ok"` but only metadata such as `project`, `sequence`, `context`, and `generated`. That means no application contract was emitted.
- Business sequence `requestable-execute` returns records but the proof URL/request/payload omits the user-provided filter value while the direct transaction proof included it. That means request variable pass-through is broken.
- Business sequence proofs with two different search/filter inputs return the same default or unfiltered result set. That usually means the public sequence variable, `StepVariable`, and HTTP transaction variable names are not aligned.
- A direct HTTP proof is counted as successful when the body is actually a provider error such as missing credentials, quota exceeded, login required, HTML documentation, or another payload outside the requested contract.
- The UI is made to pass fixed provider constants such as `action`, `format`, `limit`, `type`, `mode`, or `fields` so that the business sequence works. That means the UI owns upstream transport details and the business sequence is not self-contained.
- A direct HTTP proof is counted as successful after the endpoint advertises that it is deprecated and past its sunset date. That endpoint may still answer during a grace period, but generated applications should not be built on it.
