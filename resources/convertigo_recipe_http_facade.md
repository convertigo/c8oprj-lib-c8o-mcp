# Convertigo Recipe: HTTP Connector Behind a Stable Facade

## When to read this
Read this when the feature needs data from a REST, SOAP, XML, JSON, raw HTTP, or binary endpoint and you want a fast, repeatable Convertigo pattern.

## What this guide covers
- The connector and transaction decisions to make first.
- How to keep the HTTP world behind a facade sequence.
- How to shape payloads safely for the rest of the application.
- What to validate before frontend or planner handoff.

## Mandatory workflow

### Golden path
1. Start with a stable facade sequence contract.
2. Create or inspect one `HttpConnector`.
3. Set connector properties coherently:
   - `url` as scheme plus host
   - no trailing slash
   - `https` and `port` aligned with the real endpoint
4. Add one transaction of the right type:
   - JSON HTTP transaction for JSON APIs
   - XML HTTP transaction for XML payloads
   - Download HTTP transaction for binary downloads
   - generic HTTP transaction only when payload type is not modeled by the dedicated ones
5. Set `subPath` separately from connector base URL.
6. Keep `httpInfo=true` during setup so transport behavior stays visible.
7. Execute the transaction directly.
8. Capture schema when downstream mapping or source pickers need it.
9. In the facade sequence, call the HTTP transaction through a `TransactionStep`.
10. Map transaction output into the facade sequence contract.
11. Validate the facade sequence, not just the raw transaction.

### Canonical object pattern
- public facade sequence
- internal call to HTTP transaction
- mapping from raw response to stable contract fields
- optional handler/error mapping
- save only after direct transaction proof and facade proof

### Hard transport boundary
The HTTP transport belongs only in `HttpConnector` plus a typed HTTP transaction. A facade sequence may orchestrate, call the transaction, and normalize the payload, but it must not perform the upstream HTTP call itself in JavaScript.

For HTTP-backed features:
- use `TransactionStep` to call the typed HTTP transaction from the facade
- keep JavaScript steps limited to small contract shaping or fallback logic
- when the public contract matters, keep the raw `TransactionStep` internal (`output=false`) and make JSON steps, XML copy steps, or another explicit shaping step produce the public output
- never use `java.net.URL`, `fetch`, `XMLHttpRequest`, ad hoc HTTP clients, or equivalent transport code inside the facade sequence
- do not rely on a broad RAG answer to invent how to read hidden step results from JavaScript; prefer sourceable steps and tree readback, or leave the transaction output visible only as a deliberate temporary diagnostic and record the gap

### Choosing the transaction type
Use:
- JSON HTTP transaction when the upstream response is JSON and you want picker/schema support
- XML HTTP transaction when the upstream response is XML and you want structured XML handling
- Download HTTP transaction when the upstream response is a binary stream or file
- raw HTTP transaction only when no typed transaction fits and you are prepared to parse or transform manually

### Payload construction rules
- Build request variables deliberately. Do not overload one free-form body field when the transaction expects structured inputs.
- For a `TransactionStep` that forwards a facade request variable to the HTTP transaction, create a `StepVariable` with the same object name and set its `value` to the facade variable name, for example a child `nom` with `value: nom`.
- Do not set `sourceDefinition` to a bare variable name such as `"nom"`. `sourceDefinition` is a picker/source tuple such as `["<stepPriority>","./xpath"]`; a plain string is invalid JSON for that property and should not be used for simple request-variable pass-through.
- For POST/PUT style integrations, keep the payload-building logic close to the transaction and facade, not in the UI.
- If the endpoint requires complex headers or handlers, keep that complexity inside the HTTP integration layer and return a normalized facade contract.

### Why this is the right way
- The upstream API can evolve without forcing the UI to change immediately.
- Schema and source picker behavior remain usable for downstream steps.
- Transport debugging happens where the problem actually is.

## Recommended MCP tools
- `databaseobject-tree-get`
- `databaseobject-tree-apply`
- `databaseobject-schema`
- `requestable-execute`
- `log-view`
- `requestable-stub-set`
- `requestable-stub-get`
- `project-save`

## Anti-patterns / do not do
- Do not bind UI directly to raw HTTP transaction output.
- Do not perform HTTP transport in a facade sequence with JavaScript; use `HttpConnector` + typed HTTP transaction + `TransactionStep`.
- Do not let the connector base URL and transaction subPath drift into an incoherent mix.
- Do not disable `httpInfo` during initial setup if transport visibility matters.
- Do not call the run done because the transaction succeeds once while the facade contract is still unstable.

### Common failure modes
- Wrong transaction type for the upstream payload.
- Facade sequence bypasses the connector and performs the HTTP call directly in JavaScript.
- Base URL, SSL flag, and port not coherent.
- Port value written with the wrong type and materialized incorrectly.
- Schema never captured, then source picker and mapping work become guesswork.
- Stub path and live path produce different top-level fields.
- Facade validates only because raw `TransactionStep.output=true` leaks the connector response, while the claimed stable fields are not actually produced.

## Minimum validation proof
- One direct `requestable-execute` on the transaction path succeeds.
- One `requestable-execute` on the facade succeeds.
- Facade top-level fields match the agreed contract in both stub and live modes.
- Tree readback shows the public facade output is owned by shaping steps, not merely by a raw connector transaction subtree, unless the task explicitly accepts raw diagnostic output.
- If a real stub file is required, the proof explicitly shows that the stub materializes at runtime.

## Completion checks
- HTTP connector and transaction are coherent.
- Transport and payload behavior were validated directly.
- Facade calls the HTTP transaction through `TransactionStep`; it does not own upstream transport code.
- Facade contract hides upstream specifics.
- Frontend can bind against the facade without knowing the raw HTTP payload shape.
