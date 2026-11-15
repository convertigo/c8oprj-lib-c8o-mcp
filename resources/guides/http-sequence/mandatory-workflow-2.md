# Transport failures and connector contracts

Read when: Transport failures and connector contracts. Summary: `convertigo://guides/http-sequence`.
Previous: `convertigo://guides/http-sequence/mandatory-workflow`. Next: `convertigo://guides/http-sequence/mandatory-workflow-3`.

---

4. A transport error or an HTTP status >= 400 answers `READ_FAILED` or `WRITE_FAILED` with the status in the message; later writes are skipped.
5. Prove the business sequence with `requestable-execute` (with `authenticatedUser` when it is protected), including one failing call.

### Canonical object pattern
- public business sequence
- internal call to HTTP transaction
- mapping from raw response to stable contract fields
- optional handler/error mapping
- save only after direct transaction proof and business sequence proof

### Hard transport boundary
The HTTP transport belongs only in `HttpConnector` plus a typed HTTP transaction. A business sequence may orchestrate, call the transaction, and normalize the payload, but it must not perform the upstream HTTP call itself in JavaScript.

For HTTP-backed features:
- use `TransactionStep` to call the typed HTTP transaction from the business sequence
- keep JavaScript steps limited to small contract shaping or fallback logic
- when the public contract matters, keep the raw `TransactionStep` internal (`output=false`) and make JSON steps, XML copy steps, or another explicit shaping step produce the public output
- never use `java.net.URL`, `fetch`, `XMLHttpRequest`, ad hoc HTTP clients, or equivalent transport code inside the business sequence
- do not rely on a broad RAG answer to invent how to read hidden step results from JavaScript; prefer sourceable steps and tree readback, or leave the transaction output visible only as a deliberate temporary diagnostic and record the gap

### Choosing the transaction type
Use:
- JSON HTTP transaction when the upstream response is JSON and you want picker/schema support
- XML HTTP transaction when the upstream response is XML and you want structured XML handling
- Download HTTP transaction when the upstream response is a binary stream or file
- raw HTTP transaction only when no typed transaction fits and you are prepared to parse or transform manually

### Payload construction rules
- Build request variables deliberately. Do not overload one free-form body field when the transaction expects structured inputs.
- Compose the final URL from `server` + optional `baseDir` + transaction `subDir`; do not invent common-looking prefixes such as `/api` unless the upstream documentation or a proven live call requires them.
- For an endpoint shaped like `https://api.example.com/resources?query=value`, use `server: api.example.com`, empty `baseDir`, transaction `subDir: /resources`, and a `RequestableHttpVariable` named after the logical request parameter with `httpName` set to the upstream parameter name.
- In current Studio builds, both slash placement and readback matter. If a proof URL contains a doubled slash between the connector base directory and transaction path, adjust `baseDir`/`subDir` to one coherent single-slash shape, then rerun the direct transaction proof immediately.
- In headless MCP clients, prefer the canonical single-slash shape that produces a proof URL with exactly one slash between host/base path and transaction path. For a root-level endpoint, that generally means `baseDir:""` on the connector and a transaction `subDir` without a leading slash. For a shared prefix, put the prefix in `baseDir` without a trailing slash and the endpoint path in `subDir` without a leading slash.
- For query-string variables on HTTP transactions, create `variables.RequestableHttpVariable` children under the transaction. Set each child object name to the logical variable name and set `httpName` to the upstream query/header/body parameter name.
- Do not try to pass query parameters through a JSON object property named `parameters`, through `httpParameters`, or through generic `method` / `subPath` properties unless tree readback proves those exact properties exist and were applied. If tree-apply reports skipped properties, fix them before any execute/proof step.
