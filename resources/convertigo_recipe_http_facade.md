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
1. Start with a stable facade sequence contract. For a new public sequence created through the MCP tree API, use the palette class `sequences.GenericSequence`; if the class is not available in the current target, run `palette-list` on the project before creating the node.
2. Create or inspect one `HttpConnector`.
3. Set connector properties coherently:
   - `server` as the host only, for example `api.example.com`
   - `https` and `port` aligned with the real endpoint, for example `https=true` and `port=443`
   - optional `baseDir` only for a shared path prefix
   - do not set a synthetic `url` property; current Convertigo `HttpConnector` trees skip it because the connector stores host, scheme, port, and base directory separately
4. Add one transaction of the right type:
   - JSON HTTP transaction for JSON APIs
   - XML HTTP transaction for XML payloads
   - Download HTTP transaction for binary downloads
   - generic HTTP transaction only when payload type is not modeled by the dedicated ones
   - choose the type on creation; if the wrong transaction class was already created, delete it with `databaseobject-delete` and recreate it. `databaseobject-tree-apply` cannot turn an existing `HttpTransaction` into a `JsonHttpTransaction`.
5. Set transaction `subDir` separately from connector base URL.
6. Keep `httpInfo=true` during setup so transport behavior stays visible.
7. Execute the transaction directly.
8. Capture schema when downstream mapping or source pickers need it.
9. In the facade sequence, call the HTTP transaction through a `TransactionStep`.
10. Map transaction output into the facade sequence contract.
11. Validate the facade sequence, not just the raw transaction.
12. Treat `status:"ok"` as only technical liveness. The facade proof is valid only when the payload contains the expected application data and contract fields.
13. In autonomous runs, reject providers that require missing credentials, demo usernames, exhausted quotas, or manual account setup unless the user supplied those credentials. A `401`, `403`, quota-limit body, or credential-required message is a live external-service proof failure, not a successful HTTP proof.
14. Choose a provider that satisfies the requested data contract. If the feature is about searchable records, the endpoint must return records with useful fields for that requested contract. Generic article search, URL suggestions, autocomplete labels, documentation pages, or provider help payloads are not a valid substitute unless the user explicitly asked for those artifacts.
15. Before any UI mutation, prove that the facade itself exposes the application contract the UI will bind to. For list/search pages, this usually means a top-level or clearly named object with `items`, `total`, `query`, `error`, or equivalent fields. A facade that only leaks `TransactionStep.output=true`, transport metadata, or a raw connector subtree is still a diagnostic facade, not a UI contract.

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
- Compose the final URL from `server` + optional `baseDir` + transaction `subDir`; do not invent common-looking prefixes such as `/api` unless the upstream documentation or a proven live call requires them.
- For an endpoint shaped like `https://api.example.com/resources?query=value`, use `server: api.example.com`, empty `baseDir`, transaction `subDir: /resources`, and a `RequestableHttpVariable` named after the logical request parameter with `httpName` set to the upstream parameter name.
- In current Studio builds, both slash placement and readback matter. If a proof URL contains a doubled slash between the connector base directory and transaction path, adjust `baseDir`/`subDir` to one coherent single-slash shape, then rerun the direct transaction proof immediately.
- In headless MCP clients, prefer the canonical single-slash shape that produces a proof URL with exactly one slash between host/base path and transaction path. For a root-level endpoint, that generally means `baseDir:""` on the connector and a transaction `subDir` without a leading slash. For a shared prefix, put the prefix in `baseDir` without a trailing slash and the endpoint path in `subDir` without a leading slash.
- For query-string variables on HTTP transactions, create `variables.RequestableHttpVariable` children under the transaction. Set each child object name to the logical variable name and set `httpName` to the upstream query/header/body parameter name.
- Do not try to pass query parameters through a JSON object property named `parameters`, through `httpParameters`, or through generic `method` / `subPath` properties unless tree readback proves those exact properties exist and were applied. If tree-apply reports skipped properties, fix them before any execute/proof step.
- When the connector and transaction are known, create the transaction and its fixed set of `RequestableHttpVariable` children in one tree mutation instead of adding each variable in separate turns. Then read back the transaction once and execute one direct proof.
- Execute HTTP transactions with the requestable path `<Project>.<Connector>.<Transaction>`. Do not pass the database object QName `<Project>.cn:<Connector>.tr:<Transaction>` to `requestable-execute`.
- Set `TransactionStep.sourceTransaction` with the same runtime requestable path, for example `<Project>.<Connector>.<Transaction>`. Do not set it to a Studio database object QName such as `<Project>.cn:<Connector>.tr:<Transaction>`; that value is saved but fails at runtime with messages such as `There is no connector named "cn:<Connector>"`.
- For a `TransactionStep` that forwards a facade request variable to the HTTP transaction, create a `StepVariable` with the same object name and set its `value` to the facade variable name, for example a child `<requestVariable>` with `value: <requestVariable>`. The current palette class is `variables.StepVariable`; do not create `steps.StepVariable`.
- Do not set guessed `output` properties on the sequence object itself. When creating `sequences.GenericSequence`, omit `output`; current trees skip it and that creates avoidable authoring noise. For early facade proof, `output=true` belongs on the `TransactionStep` or on explicit shaping steps that actually emit the public contract.
- Also create the matching public sequence request variable, for example `variables.RequestableVariable` named `<requestVariable>` under the facade sequence. For simple pass-through in autonomous work, keep the same object name on the HTTP transaction variable, public sequence variable, and `StepVariable`. Read back the HTTP transaction first: if the transaction child is `tr:<Transaction>.vr:<requestVariable>`, the facade must contain `sq:<Facade>.vr:<requestVariable>` and `st:<TransactionStep>.vr:<requestVariable>` with `value: <requestVariable>`. Do not rename it to a UI label such as `query` and map it to an upstream name such as `q`, `name`, or `name_startsWith` unless two facade proofs with different input values prove the renamed value is forwarded.
- Keep the public facade contract self-contained. Completion proof should execute the facade with the same small set of public input variables that the UI/user supplies. Fixed upstream parameters such as response format, action, namespace, limit, type, mode, or fixed field lists belong in transaction/facade defaults or another backend-owned mechanism. Do not rely on UI-only constants to make the backend call valid; a browser may work while the facade proof with only public inputs still returns provider help, HTML, or an unfiltered/default payload.
- If the facade needs fixed technical values and `TransactionStep` variables/defaults do not carry them, do not move those values into the page as hidden `UIControlVariable` constants. Either repair the backend-owned contract, choose a simpler endpoint, or report the live proof incomplete.
- Prove variable pass-through through the facade requestable itself, with at least two different request values for search/filter facades. The facade proof must show that the request variable affected the upstream URL, request payload, or returned application data. If direct transaction proof shows the parameter but facade proof omits it, repeats a default value, returns a broad unfiltered payload, or returns the same record set for different inputs, the facade is failing; do not continue to UI work and do not claim completion merely because the unfiltered payload contains records.
- If a facade proof URL, request payload, or result set omits the submitted value while the direct transaction included it, repair the facade as the immediate next mutation. Delete or replace the mismatched public sequence variable and `StepVariable` so their object names match the HTTP transaction variable, rerun the direct transaction proof if needed, then rerun at least one facade proof that visibly includes or reflects the submitted value.
- Do not set `sourceDefinition` to a bare variable name such as `"<requestVariable>"`. `sourceDefinition` is a picker/source tuple such as `["<stepPriority>","./xpath"]`; a plain string is invalid JSON for that property and should not be used for simple request-variable pass-through.
- For POST/PUT style integrations, keep the payload-building logic close to the transaction and facade, not in the UI.
- If the endpoint requires complex headers or handlers, keep that complexity inside the HTTP integration layer and return a normalized facade contract.
- Treat DNS, TLS, timeout, 4xx/5xx, and provider-path failures from an external HTTP web service as runtime proof failures, not as permission to replace the integration with stubs or hard-coded examples. Keep the connector, transaction, facade `TransactionStep`, and UI facade call in place; report the live proof as incomplete when the upstream service is unavailable or rejects the call.
- Treat a `200` response that is HTML, a documentation page, a login page, or an error envelope as a failed API payload proof for JSON/XML apps. Check content type and the body shape; fix slash placement, `baseDir`, `subDir`, query variables, headers, or provider choice before proceeding.
- After one coherent repair for the same HTML/documentation/login/error payload, do not keep alternating between leading and non-leading slashes or between equivalent query placements. If the second direct proof still has the same payload class, choose a different endpoint that satisfies the same requested contract or keep the HTTP integration and mark the live proof incomplete.
- Treat provider help signatures such as `ApiHelp`, `api-help.html`, `Special:ApiHelp`, documentation HTML, or an HTML response for an expected JSON/XML endpoint as failed proof. Do not count them as a usable facade response just because the transport status is `200`.
- Treat deprecation and sunset headers as provider-suitability evidence, not harmless metadata. If a live response includes headers such as `deprecation`, `sunset`, `x-api-deprecated`, `x-api-new-host`, or `x-api-migration`, compare any header date with the current run date. When the sunset date is current or past, the endpoint proof is stale even if it still returns `200`; switch to the advertised replacement host/path or another non-deprecated endpoint before UI work. If the replacement cannot be proven headlessly, keep the HTTP rail and mark the live proof incomplete.
- Do not use public demo credentials, placeholder usernames, or guessed API keys as proof in headless loops. If the endpoint needs credentials and none were supplied, choose an unauthenticated/public endpoint that satisfies the task when one is available, otherwise keep the HTTP rail and report the external proof incomplete.
- Do not count generic search suggestions, article titles, or raw URLs as application records unless the user explicitly requested those artifacts. The payload should expose fields the UI can use as real record details, such as names, identifiers, categories, locations, dates, quantitative values, statuses, or other properties meaningful for the requested contract.
- A metadata-only facade response is not usable. If `requestable-execute` on the facade returns only sequence/context attributes and no application payload, the `TransactionStep` output or shaping step is missing. Fix the facade before UI completion proof.
- During early headless proof, it is acceptable to set `TransactionStep.output=true` to expose the transaction payload and prove the facade path. If the final design requires a stable shaped contract, replace that diagnostic output with explicit shaping before completion. Do not continue to UI work while the facade returns only metadata.
- A transport-only response is also not usable. `HttpInfo`, request headers, response headers, `project`, `sequence`, and `context` prove that a call happened, but they do not prove that the application has data. For JSON endpoints, the direct transaction and the facade must expose the JSON body or a shaped contract with application fields.
- For search/list facades, prefer a stable facade contract such as `{items:[...], total, query}`. The UI should bind to that contract, not guess over raw transport metadata or over the internal `TransactionStep` shape.
- For UI-facing HTTP facades, a public payload whose useful records are described as `transaction.document`, `transaction.document.array`, `HttpInfo`, or headers is not yet a stable facade. Read `convertigo://resources/convertigo-backend-sequences` and `convertigo://resources/convertigo-json-quickref`, keep the raw `TransactionStep` internal (`output=false`), and make explicit JSON/XML shaping steps produce public fields such as `items`, `total`, `query`, and optional `error`. If shaping cannot be authored from palette/readback, stop and report the missing shaping contract instead of moving the raw parsing into NGX.
- Minimum proven repair for a JSON endpoint whose transaction produces an array at `./document/array`: set the `TransactionStep.output` property to `false`, add `steps.XMLCopyStep` under the facade sequence, and set `sourceDefinition` to `["<TransactionStep priority>","./document/array"]`. The facade proof should then expose a top-level `array` and no `transaction` object. A UI may normalize this public `out.array` into its local `{items,total,query}` contract; it must not read `out.transaction`.
- Keep `["<TransactionStep priority>","./document/array"]` stable during repair. `requestable-execute` serializes a direct transaction response as a JSON body and may show `array` at the root; that is not evidence that the internal SmartSource XPath should become `./array`. If `./document/array` produces no public array, confirm the producer priority and direct JSON proof. If it produces records but ignores the submitted query/filter, repair the facade variable and child `StepVariable` mapping; the XPath is not the pass-through mechanism.
- Do not solve a routine JSON facade by walking `context.outputDocument`, using `getElementById`, or re-exposing raw `TransactionStep.output=true` as the final contract. Those are diagnostic paths. Final UI-facing proof should come from JSON steps, XML copy steps, or another explicit backend shaping object with the raw transaction output hidden.
- Do not rely on the NGX client to parse an HTTP transaction subtree. Browser/SDK action output may expose only diagnostic nodes such as `HttpInfo` and `attr` even when `requestable-execute` shows richer transaction arrays or XML. If the UI needs records, map those records into explicit facade fields first, prove those fields through the facade requestable, and only then wire `CallSequenceAction`.
- Do not disable `httpInfo` just to avoid an HTTP diagnostic error. If `httpInfo=false` makes the response metadata-only, that is a hidden failure, not a proof.

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
- Do not replace a required live HTTP integration with a `SimpleStep` or hard-coded sample data just because the first `requestable-execute` failed. Keep the connector, transaction, and `TransactionStep` rail intact; diagnose the transport or mark the run incomplete.
- Do not disable `httpInfo` during initial setup if transport visibility matters.
- Do not call the run done because the transaction succeeds once while the facade contract is still unstable.

### Common failure modes
- Wrong transaction type for the upstream payload.
- Attempting to repair a wrong transaction type by replacing the existing node with another `className`; that keeps the old object type. Delete and recreate instead.
- Facade sequence bypasses the connector and performs the HTTP call directly in JavaScript.
- Connector host/SSL/port/baseDir not coherent, often caused by setting skipped `url` instead of `server`.
- Endpoint path drift, for example adding a guessed `/api` prefix or changing a documented path without proof.
- Transaction query variables not modeled as `RequestableHttpVariable` children, often caused by setting skipped `parameters` or `httpParameters` properties.
- Runtime proof calls a database object QName such as `Project.cn:Connector.tr:Transaction`; `requestable-execute` needs `Project.Connector.Transaction`.
- `TransactionStep.sourceTransaction` contains a QName such as `Project.cn:Connector.tr:Transaction`; it also needs `Project.Connector.Transaction`.
- Port value written with the wrong type and materialized incorrectly.
- Optional properties guessed from other frameworks, such as connector `timeout` or sequence-level `output`, are skipped and create false proof noise.
- Schema never captured, then source picker and mapping work become guesswork.
- Stub path and live path produce different top-level fields, or the live path is removed after a stub is added.
- Facade validates only because raw `TransactionStep.output=true` leaks the connector response, while the claimed stable fields are not actually produced.
- Facade proof shows useful data only inside a raw `transaction.document` subtree, while the intended UI contract object has only status/query/metadata. That is not a complete facade contract; add explicit shaping fields before UI work.
- Facade `requestable-execute` returns `status:"ok"` but only metadata such as `project`, `sequence`, `context`, and `generated`. That means no application contract was emitted.
- Facade `requestable-execute` returns records but the proof URL/request/payload omits the user-provided filter value while the direct transaction proof included it. That means request variable pass-through is broken.
- Facade proofs with two different search/filter inputs return the same default or unfiltered result set. That usually means the public sequence variable, `StepVariable`, and HTTP transaction variable names are not aligned.
- A direct HTTP proof is counted as successful when the body is actually a provider error such as missing credentials, quota exceeded, login required, HTML documentation, or another payload outside the requested contract.
- The UI is made to pass fixed provider constants such as `action`, `format`, `limit`, `type`, `mode`, or `fields` so that the facade works. That means the UI owns upstream transport details and the facade is not self-contained.
- A direct HTTP proof is counted as successful after the endpoint advertises that it is deprecated and past its sunset date. That endpoint may still answer during a grace period, but generated applications should not be built on it.

## Minimum validation proof
- One direct `requestable-execute` on the transaction path succeeds.
- One `requestable-execute` on the facade succeeds and the returned payload contains expected application values from the requested contract, not only runtime metadata, transport metadata, or generic search/navigation artifacts. For a search/list proof, the facade payload should contain at least one recognizable record plus useful fields from the facade contract.
- For search/filter facades, one proof call with only the expected public input must still produce a valid application payload. If additional fixed technical variables are required from the caller, move them behind the facade or choose another provider before completion.
- Facade top-level fields match the agreed contract in both stub and live modes.
- Tree readback shows the public facade output is owned by shaping steps, not merely by a raw connector transaction subtree, unless the task explicitly accepts raw diagnostic output.
- If a frontend will consume the facade, the proof must include the same shaped fields the page will bind to. Do not count raw transaction diagnostic output as the page contract.
- If a real stub file is required, the proof explicitly shows that the stub materializes at runtime.

## Completion checks
- HTTP connector and transaction are coherent.
- Transport and payload behavior were validated directly.
- Facade calls the HTTP transaction through `TransactionStep`; it does not own upstream transport code.
- Facade contract hides upstream specifics.
- Frontend can bind against the facade without knowing the raw HTTP payload shape.
