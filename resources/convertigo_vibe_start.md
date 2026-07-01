# Convertigo Vibe Start

## When to read this
Read this after `convertigo://resources/convertigo-start` when the caller is Mistral Vibe or a Vibe-based headless benchmark.

## Adapter scope
This guide is only the Vibe adapter layer. It does not replace the shared Convertigo guides. Use it to make Vibe load the MCP catalog, keep benchmark runs isolated, and then fall back to the same recipes used by Codex and other MCP clients.

All constraints in this adapter are technical invariants: MCP call ordering, object creation, readback, proof, binding modes, error handling, and generated-artifact boundaries. Do not treat benchmark scenarios as reusable product guidance, and do not add provider-, dataset-, country-, language-, or feature-specific requirements to the skill unless the current user task explicitly asks for them.

## Setup sequence
Run `ConvertigoMCP._setupVibe` once for the target Vibe home.

Recommended variables for benchmark and skill-adjustment loops:

```json
{
  "vibeHome": "/path/to/isolated/vibe-home",
  "mcpUrl": "http://localhost:18080/convertigo/api/mcp",
  "replaceConfig": true
}
```

`replaceConfig=true` is intended for isolated homes. It writes a deterministic `config.toml`, an `AGENTS.md`, and the `convertigo-vibe-generalist` skill. Do not use it on a personal Vibe home unless replacing that configuration is intentional.

For a personal Vibe home, omit `replaceConfig` so the setup patches missing Convertigo entries and leaves existing skill filters intact.

## Mandatory Vibe bootstrap
1. Use the `convertigo-vibe-generalist` skill.
2. Use the MCP server named `Convertigo`.
3. If Vibe exposes MCP resources and prompts directly, list them first.
4. If Vibe only exposes MCP tools, call `Convertigo_requestable-execute` to run:
   - `ConvertigoMCP.mcp_resources_list` with no `uri` argument
   - `ConvertigoMCP.mcp_prompts_list` with no `name` argument
   - `ConvertigoMCP.mcp_resources_read` with `variables.uri` for each exact guide URI
5. Read:
   - `convertigo://capabilities`
   - `convertigo://recipes/quickstart`
   - `convertigo://resources/convertigo-start`
   - `convertigo://resources/convertigo-vibe-start`
6. Pick the smallest matching shared recipe before mutation.

## MCP call discipline
- Use `Convertigo_requestable-execute` only for existing Convertigo requestables such as `ConvertigoMCP.mcp_resources_read`.
- Do not invent requestable names such as `ConvertigoMCP.resources/templates/list`.
- Do not pass a guide URI to `mcp_resources_list`; list is for catalog discovery, read is for one URI.
- When a guide URI is already known, skip list retries and call `ConvertigoMCP.mcp_resources_read` directly.
- Treat a `status:"partial"`, skipped property, or failed palette creation as a failed mutation to correct before continuing.
- In Vibe, multiple MCP tool calls in one assistant message are executed concurrently. Use parallel calls only for independent reads. In headless benchmark loops, avoid parallel MCP mutations entirely, even when they look independent; direct sequential mutations are easier to validate and recover. Delete then recreate, create then patch, patch then execute, create directive then add children, and save/open/readback sequences must always be separate awaited steps. If an object name changes because create raced with delete, clean it up before continuing.
- In headless mode, never end with an assistant message that only says work will continue in a later message. If the next step is a mutation, issue the MCP tool call in the same message. If you cannot continue, save if useful and provide a final answer that clearly says the run is incomplete and names the missing proof.

## Headless loop prompt
Keep the user prompt short. It should state the skill and the goal, not the Convertigo implementation rules.

Example:

```text
Use the convertigo-vibe-generalist skill from the Convertigo MCP. Create a Convertigo project named <ProjectName> that implements <short product goal>. Work autonomously and provide proof.
```

The skill and MCP guides must provide the Convertigo constraints: exact naming, starter import, data-page recipe, local variables, SC bindings, generated-artifact boundaries, validation, and save discipline.

When restricting tools in headless mode, repeat `--enabled-tools` once per tool. Do not pass a comma-separated list.

```bash
VIBE_HOME=/path/to/isolated/vibe-home vibe \
  -p "Use the convertigo-vibe-generalist skill from the Convertigo MCP. Create a Convertigo project named <ProjectName> that implements <short product goal>. Work autonomously and provide proof." \
  --output json \
  --agent auto-approve \
  --trust \
  --enabled-tools skill \
  --enabled-tools Convertigo_project-list \
  --enabled-tools Convertigo_requestable-execute \
  --enabled-tools Convertigo_databaseobject-tree-get \
  --enabled-tools Convertigo_databaseobject-tree-apply \
  --enabled-tools Convertigo_databaseobject-delete \
  --enabled-tools Convertigo_mobile-builder-open \
  --enabled-tools Convertigo_project-save
```

The JSON output includes `reasoning_content`, tool calls, tool results, and the final assistant answer. Use it as the primary evidence stream for Vibe-loop scoring.

## Fresh starter app rail
- For a fresh NGX app, after reading `convertigo://resources/convertigo-recipe-starter-extension`, import `template_ngxBuilderIonic` with `Convertigo_marketplace-import` and the exact requested project name.
- Do not guess marketplace names such as `NGXAppStarter`.
- Open the mobile builder early with `Convertigo_mobile-builder-open wait=false`, continue other backend or UI work while it starts, then call `Convertigo_mobile-builder-open stateOnly=true wait=true` before live proof. If that result includes `browserDebugUrl`, `browserDevToolsJsonUrl`, or `browserDevToolsWebSocketUrl`, attach Playwright or browser-control MCP to that Studio JxBrowser endpoint and verify the visible feature there.
- For any app that consumes an HTTP web service, read `convertigo://resources/convertigo-recipe-http-facade` before creating the connector, transaction, or facade sequence. This applies to HTTP-backed data flows regardless of provider, dataset, or requested contract.
- The chosen HTTP provider must satisfy the requested data contract. If the app is about searchable records, the endpoint must return records with useful fields for that contract, not only generic article titles, URLs, autocomplete suggestions, or documentation text. If the first provider fails because of malformed paths, DNS, TLS, missing credentials, quota, or provider errors, either fix the connector settings or choose another public endpoint that still returns records for the requested contract. Otherwise keep the HTTP rail and mark the live proof incomplete.
- For data-backed pages, including pages backed by HTTP web services, read `convertigo://resources/convertigo-recipe-ngx-data-page` before the first UI mutation.
- Mutate the actual visible entry page first. On the starter this is usually `Application.NgxApp.pg:Page`, especially `Page.Content`.
- Do not create only a secondary feature page while the visible entry page still shows the starter body.
- In Vibe, do not use `Convertigo_batch-call` for dependent mutations or the first UI event/action chain. Use direct `Convertigo_databaseobject-tree-apply` calls and read back each created event/action. If a later independent batch is truly necessary, each nested `calls[].tool` value must be the unprefixed MCP tool id such as `databaseobject-tree-apply`, not the Vibe-exposed name `Convertigo_databaseobject-tree-apply`. If that distinction is uncertain, do not batch.
- Use `Convertigo_databaseobject-delete` for actual object deletion. `databaseobject-tree-apply` with `mode:"replace"` and `{}` does not delete the target object; it only patches nothing and can leave empty `REMOVED` shells behind. After a delete, read back the parent and require that the deleted QName is absent.
- For HTTP connectors, use `server`, `https`, `port`, and optional `baseDir`; do not set skipped or guessed properties such as `url`, `timeout`, `parameters`, or `httpParameters` unless readback has already shown they exist on that exact object type.
- Compose HTTP URLs from `server` + optional `baseDir` + transaction `subDir`; do not invent `/api` or change provider paths after a runtime failure unless a readback or live proof supports it. If readback or runtime logs show a malformed path such as a doubled slash between base directory and transaction path, fix `baseDir`/`subDir` and rerun the transaction proof.
- If slash placement between connector `baseDir` and transaction `subDir` is ambiguous, use one coherent single-slash shape and verify immediately with `requestable-execute`; do not alternate blindly between guessed paths.
- For HTTP transaction query parameters, create `variables.RequestableHttpVariable` children. Do not rely on skipped `parameters` or `httpParameters` properties.
- For JSON APIs, create `transactions.JsonHttpTransaction` on the first transaction creation. If you accidentally created `transactions.HttpTransaction`, do not try to change its class with `databaseobject-tree-apply`; class replacement does not retag an existing object. Delete the wrong transaction with `Convertigo_databaseobject-delete`, recreate it as `transactions.JsonHttpTransaction`, recreate its `RequestableHttpVariable` children, then rerun direct transaction and facade proof.
- For public facade sequences created through `Convertigo_databaseobject-tree-apply`, use `className:"sequences.GenericSequence"`. Do not guess `sequences.Sequence`; if sequence creation fails or the class is uncertain, call `Convertigo_palette-list` on the project and retry with the listed class before adding steps.
- When creating `sequences.GenericSequence`, set only known sequence properties such as `comment` unless readback proves another property exists. Do not set `output` on the sequence object; current trees skip it. Put temporary proof output on the child `TransactionStep` instead.
- Execute transactions through requestable names like `Project.Connector.Transaction`, not database object QNames like `Project.cn:Connector.tr:Transaction`.
- Set facade `TransactionStep.sourceTransaction` to the runtime requestable path, for example `<Project>.<Connector>.<Transaction>`. Do not use a Studio QName such as `<Project>.cn:<Connector>.tr:<Transaction>`; if runtime says `There is no connector named "cn:..."`, fix `sourceTransaction` and rerun the facade proof.
- A facade sequence that forwards a user query or filter to an HTTP transaction must have both a public sequence variable and a `StepVariable` under the `TransactionStep`. The palette class is `variables.StepVariable`, not `steps.StepVariable`. For simple pass-through, first read back the HTTP transaction variables, then keep the same object name on the HTTP transaction variable, public facade variable, and child `StepVariable`, and set the `StepVariable.value` to that same variable name. If the HTTP transaction variable is named `<requestVariable>`, create `Facade.vr:<requestVariable>` and `TransactionStep.vr:<requestVariable>`; do not rename it to a UI-friendly `query` unless two facade proofs with different values show the renamed value reaches the upstream call. Without that child, or when renamed variables are not proven, the direct transaction may work but the facade ignores the user input.
- Facade proof must use the facade requestable and show the query/filter was actually forwarded. The returned HTTP info or application payload should prove that the user value affected the upstream request or result set. If the direct transaction proof includes the parameter but the facade proof omits it or returns a broad unfiltered payload, fix the facade before any UI work; do not claim success merely because the unfiltered response contains records.
- Facade proof must use the same public input variables that the UI/user is expected to supply. For a normal search/list app, that usually means the proof call sends only the search/filter value. If the facade only works when the UI supplies fixed provider constants such as format/action/limit/type parameters, the backend contract is not self-contained. Put fixed provider parameters in transaction/facade defaults or choose an endpoint whose required technical parameters can be hidden behind the facade; do not let the UI be the only layer that makes the backend request valid.
- A facade that returns provider help, HTML documentation, or a default/unfiltered response when called with only the public input is failing, even if a later proof succeeds after adding `action`, `format`, `limit`, `type`, `mode`, `fields`, or similar technical variables. Do not solve this by adding constant `UIControlVariable` children on the page. Repair the backend contract, switch to a better provider endpoint, or report the live proof incomplete.
- If two facade repairs still require UI-supplied technical constants, stop trying to make that provider fit. Do not keep toggling `StepVariable.value` between literals and variable names, do not add the constants to the UI, and do not proceed to result UI proof. Re-evaluate provider suitability or mark the run incomplete.
- If direct transaction proof succeeds but facade proof fails, the next action is to repair the facade. Do not route the UI directly to the transaction as a workaround. UI calls must still target the public facade requestable; otherwise the backend contract and later bindings are no longer validated.
- Facade proof must show application data, not only `status:"ok"`. If `Convertigo_requestable-execute` on the facade returns only metadata fields such as `project`, `sequence`, `context`, and `generated`, the facade has not emitted a usable contract. For an early proof, set `TransactionStep.output=true` or add an explicit shaping step, then rerun the facade proof before UI work.
- For a JSON HTTP facade, `HttpInfo`, headers, `context`, `project`, and `sequence` are transport metadata. They do not count as application data. Before UI work, the facade proof must expose a stable app contract such as `{items:[...], total, query}` or an equivalent raw JSON array containing application records.
- For HTTP web-service apps in headless mode, do not count missing credentials, demo-account quota limits, `401`, `403`, login pages, HTML documentation pages, or provider error envelopes as successful runtime proof. They are external-service proof failures. If no credentials were supplied, prefer a public unauthenticated endpoint that still satisfies the task; otherwise keep the connector/transaction/facade rail and report the live proof incomplete.
- For HTTP web-service apps, inspect transport headers returned by the direct transaction proof. If headers such as `deprecation`, `sunset`, `x-api-deprecated`, `x-api-new-host`, or `x-api-migration` show that the endpoint is deprecated or already past its sunset date, do not build the UI on that endpoint. Switch to the advertised replacement host/path or another non-deprecated public endpoint, then rerun the direct transaction and facade proofs. A deprecated endpoint returning `200` is still a stale payload proof.
- A `200 OK` status is not enough for JSON/XML apps. Verify the content type and body shape. If an expected JSON endpoint returns HTML or documentation, first suspect malformed `baseDir`/`subDir`, doubled slashes, missing query variables, or wrong headers; fix and rerun proof before switching providers.
- If the task asks for an app that consumes an HTTP web service, do not replace the integration with a `SimpleStep`, hard-coded sample data, or a stub-only sequence after `requestable-execute` fails. DNS, TLS, timeout, provider 4xx/5xx, and path errors are live web-service proof failures, not tool failures. Keep the `HttpConnector`, typed HTTP transaction, facade `TransactionStep`, and mark the runtime proof incomplete if needed.
- Do not disable `httpInfo` merely to turn an HTTP transaction into `status:"ok"`. If turning off `httpInfo` hides the response and leaves only metadata, that is not proof. Fix the URL or transaction settings and prove a payload with application fields.
- Avoid broad `Convertigo_log-view` calls for HTTP URL debugging in headless loops. If `requestable-execute` already shows the URL, content type, or payload issue, correct the connector/transaction and rerun the requestable proof. `log-view` can return huge generated XML and consume the run budget.
- Avoid broad deep `databaseobject-tree-get` calls after identifying the target page. Prefer targeted reads such as the project root at depth 1, the visible page at depth 2, or the exact object being edited.
- For NGX backend calls, set `CallSequenceAction.requestable` to the facade requestable. Do not set a skipped `Sequence` property.
- Put `UIControlVariable` children under the `CallSequenceAction`, and set `varValue` with a Local SmartSource/source binding such as `?.searchQuery`; do not use `script:this.local?.searchQuery` for page locals.
- Do not add hidden provider constants as `UIControlVariable` children, for example `action='opensearch'`, `format='json'`, `limit='20'`, `type`, `mode`, or fixed `fields`. A page may pass user-entered filters and explicitly visible user options, but the page must not be the only place that makes the backend HTTP request valid.
- The `UIControlVariable` object name is the request variable name sent to the facade. Do not create placeholder names such as `queryParam`, `formatParam`, or `limitParam` and try to set a separate `varName` property; that property is skipped in current trees. If the facade variable is `query`, create `.vr:query`; if it is `searchQuery`, create `.vr:searchQuery`.
- Keep the page input local named `searchQuery` even when the facade or HTTP request variable has a provider-specific name such as `q`, `query`, `nom`, `filter`, or `search`. The `UIControlVariable` object name must match the facade variable, but its `varValue` should still source Local `?.searchQuery`. Do not rename the page local to the provider request variable just to make names line up.
- If the facade proof forced the public variable to match an upstream name such as `q`, that does not change the UI local contract. Initialize `searchQuery` in `PageEnter`, bind the input `DoubleBinding` to `?.searchQuery`, and create `CallSequenceAction.vr:q.varValue` from Local `?.searchQuery`. Do not create a page local named `q` just because the facade variable is `q`.
- Do not stop after creating only `SearchInput` and `SearchButton`. Apply the input `DoubleBinding` Local SmartSource and create the button `UIControlEvent -> SetLocalAction -> CallSequenceAction -> UIControlVariable` chain before final proof. If JSON escaping is awkward, copy the compact `SOURCE` examples from `convertigo-recipe-ngx-data-page` exactly and change only `project`, `path`, and requestable names.
- For common NGX page primitives, use known palette class names directly: `ngx.components.UIDynamicElement#Card`, `#CardHeader`, `#CardTitle`, `#CardContent`, `#Input`, `#Button`, `#DivTag`, `#Heading1`, `#Heading2`, `#Heading3`, `#List`, `#ListItem`, `#Spinner`, `ngx.components.UIText#UIText`, `ngx.components.UIControlEvent#UIControlEvent`, `ngx.components.UIControlDirective#UIControlDirective`, `ngx.components.UIDynamicAction#SetLocalAction`, `ngx.components.UIDynamicAction#CallSequenceAction`, and `ngx.components.UIControlVariable#UIControlVariable`. Do not invent semantic palette suffixes such as `#SearchForm`, `#ResultsList`, `#Heading`, or `#UIDynamicElement`. If a desired class is not in this list, call `Convertigo_palette-list` on the exact parent once and use the returned `className`.
- Do not invent visual component classes or properties that were not confirmed by palette/readback. There is no guarantee that semantic guesses such as `UIDynamicElement#Anchor`, skipped `IonName`, or ad hoc link properties exist in the target palette. Use `palette-list` once on the exact parent and then choose a returned class, or display the URL/text through known primitives.
- Vibe is more reliable when early NGX UI objects are created one object/action at a time, with a readback after each important event/action. Avoid large nested `tree.children` patches for the first visible shell, page-enter initialization, and event/action chain unless the same shape already succeeded in the current tree.
- If Vibe starts struggling to emit valid JSON for a nested event/action tree, stop composing the large subtree immediately. Create `UIControlEvent`, `SetLocalAction`, `CallSequenceAction`, `UIControlVariable`, `StoreResults`, and `SetLoadingFalse` with separate awaited `Convertigo_databaseobject-tree-apply` calls.
- When creating a new parent and children, do not target the new child QName in another tool call in the same assistant message. Create the parent, wait for the result, read back or trust the returned QName, then create the child in a later message. This applies to containers, buttons, directives, events, and action nodes.
- With `databaseobject-tree-apply` and `at:"inside"`, the `tree` argument must be one concrete node with `name` and `className`. Do not send a wrapper object containing only `children`; create each child node one at a time or replace the parent with a complete subtree.
- Do not set labels by guessing `textValue` on every `UIDynamicElement`. For `Button`, `Heading1`/`Heading2`/`Heading3`, card, paragraph, list item, or similar visual components, create the component with structural properties only, then create a child `ngx.components.UIText#UIText` for the visible text. If readback reports skipped `textValue`, treat it as a failed mutation to avoid repeating.
- For `ngx.components.UIText#UIText`, set `textValue` and optional `comment` only. Do not add a guessed `mode` property such as `"mode":"PLAIN"`; current trees skip it because `UIText.textValue` is already the text property.
- For the main search/submit button in a data page, always create a visible `UIText` child with plain text matching the intended action label under the button. An `ion-button` without child text can compile successfully but browser smoke cannot click it by text and users see a blank control.
- Do not finish after writing `results` with `SetLocalAction`. Create a visible result surface that reads result state with Local SmartSource/source mode for the collection, such as `?.results?.items`, `?.results?.total`, or a selected/result item path. The visible surface must include real fields from the facade contract when available. In a `ForEach`, bind the collection from Local, set `directiveItemName` to a neutral row name such as `item` or `record`, and bind row fields from that current iterator item; do not create fake page locals for row fields.
- After creating an input binding, UIControlVariable `varValue`, directive source, or text source, read back the object. A value rendered as `source:[object Object]` is not a Local SmartSource. It means the MCP call passed a nested object in a shape Convertigo serialized as a string. Replace it with the literal source SmartSource string/JSON form from the recipe before continuing; browser smoke will not recover this later.
- Do not put `SetLocalAction(Value=script:out)` as a sibling of `CallSequenceAction` under the same `UIControlEvent`. Sibling actions are generated in a parallel `Promise.all` block and `out` is still the click event or previous sibling output. Put success mapping actions as children of `CallSequenceAction`, or put a small normalizer `UICustomAction` child under the call and let later child `SetLocalAction` nodes consume that normalized output. Read the generated code or browser smoke proof if unsure.
- The success action tree shape matters, not just the visual order in the summary. The compliant shape is `SearchButton -> SearchClick -> CallSearch -> [vr:<requestVariable>, StoreResults, SetLoadingFalse]`. The non-compliant shape is `SearchButton -> SearchClick -> [CallSearch, StoreResults, SetLoadingFalse]` because `StoreResults` and `SetLoadingFalse` are siblings of the call and cannot see the call output. After creation, read back the page and require result/reset QNames that end with `...CallSearch.StoreResults` and `...CallSearch.SetLoadingFalse`, not `...SearchClick.StoreResults`.
- When a property is passed as `{ "mode": "SCRIPT", "value": "..." }`, the value is only the JavaScript body. Do not include a `script:` prefix inside that value. For example use `"value": "{items: out.items || []}"`, not `"value": "script:{items: out.items || []}"`; otherwise the saved YAML becomes `script:script:...` and the generated action cannot evaluate it.
- Do not put `SetLocalAction(Property=error, Value=script:true)` or `SetLocalAction(Property=errorMessage, ...)` as normal siblings of the click/submit event or the `CallSequenceAction`. Event children run in parallel and those error writes execute on successful clicks too, hiding the result list or fighting the loading state. Error writes belong only under a `UIActionFailureEvent` / `UIActionErrorEvent` handler returned by `palette-list`; if handler placement is uncertain, skip optional error polish until the browser-proven success path works.
- When rebuilding a button event from a large subtree, re-check the QName of `StoreResults`: it must be under `...CallSequenceAction.StoreResults`, not under `...SearchClick.StoreResults`. If a readback shows the results `SetLocalAction` as a sibling of the call, delete that action and recreate it under the call before final proof.
- UIControlVariable names are request variables, not JavaScript locals in child action scripts. A child `SetLocalAction` like `Value=script:{items: out.items, query: query}` compiles with an undefined bare identifier and browser smoke shows no results. Use only `out` for the call response plus `c8oPage.local?.searchQuery` if the stored result needs the current query, or omit `query`.
- Provider/facade variable names are not page local names. For a facade variable named `q`, the UI action tree should read `CallSearch.vr:q.varValue -> Local ?.searchQuery`; it should not read Local `?.q`. The input should also use `DoubleBinding -> Local ?.searchQuery`.
- Do not bind iterator fields through a Local SmartSource path. A Local source with path `record.name` is treated as a page-local path and generates invalid template variables. For text inside a `ForEach` with `directiveItemName: record`, use a `UIText` plain template expression such as `{{ record.name }}` or another field from the facade contract. Keep Local SmartSource/source mode for page-local collections like `?.results?.items`, not for iterator row fields.
- Do not put a visibility condition on the same `UIControlDirective` as `ForEach`. Use a parent/sibling `If` directive with raw string `directiveExpression`; keep the `ForEach` focused on `directiveSource`, `directiveItemName`, and `directiveIndexName`.
- If a `ForEach` already exists, do not patch `directiveExpression` onto it later. Either leave the `ForEach` unguarded so an empty `items` array renders nothing, or create a separate `If` directive/container and put the `ForEach` under that wrapper.
- For `If` directives, `directiveExpression` is a raw Angular template expression string. Use page-template local context such as `"directiveExpression": "local?.loading"` or `"!local?.loading && !local?.error"`. Do not use `c8oPage.local` in `directiveExpression`; `c8oPage` exists in generated action scripts, not in the Angular template. Do not wrap this property as `{ "mode": "SCRIPT" | "PLAIN" | "SOURCE", "value": "..." }`; that causes `argument type mismatch` in current trees.
- `databaseobject-tree-apply` with `mode:"merge"` updates properties but does not remove stale incompatible properties. When converting or repairing a directive, read it back and ensure only the properties for that directive remain: `If` uses `directiveExpression` and no `directiveSource`; `ForEach` uses `directiveSource`, `directiveItemName`, and `directiveIndexName` and no visibility `directiveExpression`. If readback still shows an incompatible property, delete and recreate the directive or replace it with a complete compliant subtree instead of claiming the merge fixed it.
- After creating a `ForEach`, read it back with `properties:"all"` before adding child text. The readback must show `directiveName`, `directiveSource`, `directiveItemName`, and `directiveIndexName` as separate directive properties. If child text uses `item.*` but readback does not show `directiveItemName: item`, patch the directive itself before continuing.
- Error text is page-local state. Display it with Local SmartSource/source mode on `?.errorMessage`; do not use `plain:{{ errorMessage }}`, `plain:{{ local.errorMessage }}`, or `script:local?.errorMessage || 'fallback'` in `UIText.textValue`. Put fallback text in `SetLocalAction(Property=errorMessage)` and keep the visible `UIText` as a pure Local SOURCE read.
- Error/failure handlers are not children of visual elements. Create the handler class returned by `palette-list` on the exact failure parent. Under a `CallSequenceAction`, current NGX palettes commonly expose `ngx.components.UIActionFailureEvent#UIActionFailureEvent` as "Failure Handler"; under some event parents they expose `ngx.components.UIActionErrorEvent#UIActionErrorEvent`. Use the listed class and do not retry the same rejected handler class on the same parent. Do not place handlers as direct children of `SearchButton` or another `UIDynamicElement`.
- Error/failure handlers do not share the success `out` scope. Never use `out`, `out.message`, `out.error`, or any `out.*` expression in a `UIActionErrorEvent` or `UIActionFailureEvent` `SetLocalAction`. Use a static fallback string in the handler `SetLocalAction`, or set a known local before the call and bind the visible error text from Local SOURCE mode.
- Do not clean up UI by calling `databaseobject-tree-apply` with `mode:"replace"` and empty or qname-only `children`. Delete exact unwanted nodes with `Convertigo_databaseobject-delete`, or replace with a complete subtree. For NGX/mobile objects, use a saved/refreshed delete (`autoSave:true`, `refresh:true` when available), then read back the parent and reopen the mobile builder before browser proof. A delete with `autoSave:false` and `refresh:false` can leave stale generated UI in the viewer even when tree readback is clean. If the starter `WelcomeCard` remains, even empty or commented `REMOVED`, the page is not cleaned up.
- In headless Vibe, the reliable starter cleanup path is either: (a) delete `<Project>.Application.NgxApp.pg:Page.Content.WelcomeCard` with `Convertigo_databaseobject-delete`, read back `Page.Content`, and continue only when the QName is absent; or (b) replace `<Project>.Application.NgxApp.pg:Page.Content` at `self` with a complete `Content` node and verify no `WelcomeCard` or `REMOVED` comments remain. If `mode:"replace"` leaves `WelcomeCard`, immediately switch to `databaseobject-delete`; do not add `WelcomeCard1` or comments.
- Result locals must be fed by the backend action, not only initialized on page enter. Put result-mapping actions as children of `CallSequenceAction`, storing a normalized contract such as `script:{items:[...], total, query:c8oPage.local?.searchQuery}` in `results`, then make `ForEach.directiveSource` match `?.results?.items`. Do not finish with `SetLocalAction(Property=results, Value=script:out)` because later UI bindings to `?.results?.items` will not match the stored shape.
- Derive the `StoreResults` item path from the proven facade payload, not from a memorized fallback. Common collection paths include `out.transaction?.document?.array`, `out.items`, `out.transaction?.document?.object?.items`, `out.transaction?.document?.object?.results`, and `out.transaction?.document?.object?.records`. If row text uses nested fields such as `record.properties.label`, `items` must be the array whose elements actually contain `properties`.
- Treat the stored result local and the visible result bindings as one contract. If any `If`, counter, or empty state reads `local?.results?.items`, the success `SetLocalAction(Property=results)` must store an object with an `items` array, and the `ForEach.directiveSource` must also read Local `?.results?.items`. Do not mix a visibility check on `results.items` with a list bound to raw response paths such as `results.transaction.document.array`; browser smoke will stay empty even when the backend proof is green.
- Before saving, compare three things: the final facade proof body, the `StoreResults` expression, and the row field bindings. If the proven record array contains nested objects, `StoreResults.items` must select that exact array and row text must render fields from that same element shape. A mismatch here is a failed UI contract even when `requestable-execute` and mobile-builder compile are both green.
- If a click action sets `loading=true` before a backend call and any result or empty visibility checks `!local?.loading`, add a child `SetLocalAction(Property=loading, Value=script:false)` under the same `CallSequenceAction` after result storage. Without this success reset, the browser can receive data while the list remains hidden behind the loading gate.
- In headless runs, create the success reset immediately after `StoreResults`: `CallSequenceAction -> StoreResults -> SetLoadingFalse`. Do this before `project-save`, `mobile-builder-open`, final readback, or optional failure-handler polish. If you notice the reset is missing, make the MCP mutation next; do not merely mention that it should be added and then proceed to proof.
- A reset inside `UIActionFailureEvent` or `UIActionErrorEvent` is only the failure-path reset. It does not satisfy the success path. If the page gates results with `!local?.loading`, create a separate success-path `SetLoadingFalse` directly under the `CallSequenceAction`, after result storage and outside any failure/error handler.
- For page-local display values such as counts, empty messages, selected values, or error messages, do not use `MobileSmartSourceType: script:...local...`, `mode:"SCRIPT"` text over `local?.*`, or `plain:{{ local... }}`. For counts, create a static label `UIText` such as `Results` plus a second `UIText` bound with Local SOURCE to `?.results?.total`, or skip the count entirely. If a sentence needs concatenation, write that display sentence to a local with `SetLocalAction`, initialize it on page enter, and bind that local with Local SOURCE mode.
- In `UIText.textValue`, Angular interpolation is allowed for iterator variables such as `{{ record.name }}` inside a `ForEach`, but not for page-local state. Never write `{{ local?.x }}`, `{{ local.x }}`, or a fallback expression such as `{{ local?.errorMessage || '...' }}` in visible text. Bind page-local state with a Local SOURCE SmartSource instead; put fallback strings into the local through `SetLocalAction`.
- Result rows must display enough of the facade contract to be useful, not only a generic label. When records expose multiple stable fields, render at least three distinct application details across the row, such as a display label/name, one identifier or code field, and one quantitative, date, location, category, or status field. If fields are nested under a common object such as `record.properties`, use iterator expressions for those nested fields, for example `{{ record.properties.label }}`, `{{ record.properties.id || record.properties.code }}`, and a third available detail. Do not invent fields that are absent from the proven facade payload.
- Minimum complete UI order in headless loops: create page-enter locals, input, button, `CallSequenceAction` with `UIControlVariable`, child result `SetLocalAction` with normalized `{items,total,query}`, `ForEach` bound to `?.results?.items`, at least three row details, save, mobile-builder proof, final answer. Add optional loading/error polish only after this visible backend-to-list path exists.
- After a final backend proof, save, and mobile-builder proof, do not reload the skill or restart broad verification in the same headless run. Provide the final answer; the external harness will perform the independent validation pass.

## Isolation rules
- Set `VIBE_HOME` to a fresh directory for every benchmark loop.
- Delete the generated benchmark project before each new loop.
- Delete the isolated Vibe home before each new loop so `_setupVibe` installs the current adapter from scratch.
- Use `enabled_skills = ["convertigo-vibe-generalist"]` in isolated homes to prevent global skills from influencing the result.
- Provide model credentials through the process environment or CI secret store, for example `MISTRAL_API_KEY`.
- Do not modify the Codex `convertigo-generalist` skill or `~/.codex/config.toml` from a Vibe loop.
- Do not copy secrets, `.env` files, shell histories, or unrelated user configuration into an isolated Vibe home.

## Tool naming in Vibe
Vibe exposes Convertigo MCP tools with the server name prefix. For a server named `Convertigo`, use names like:

- `Convertigo_project-list`
- `Convertigo_requestable-execute`
- `Convertigo_databaseobject-tree-get`
- `Convertigo_databaseobject-tree-apply`
- `Convertigo_mobile-builder-open`
- `Convertigo_project-save`

Use only the tools needed for the selected recipe. Keep `Convertigo_rag-query` for last-resort gaps after the start guide and recipe were read.

## Validation evidence
For a successful Vibe benchmark run, collect:

- the installed Vibe skill path and config path from `_setupVibe`
- evidence that Vibe called at least one Convertigo MCP tool
- the selected guides and recipe
- the exact target project name
- runtime proof through `requestable-execute`, `mobile-builder-open`, or `crud-proof` depending on the recipe
- a final `project-save` when mutations succeeded
- one concise MCP critique item when the run reveals missing guidance

## Failure signals for the adjustment loop
Update the Vibe adapter resources when Vibe repeatedly fails without user interaction because it:

- does not load `convertigo-vibe-generalist`
- skips MCP resource discovery
- asks the user to restate Convertigo rules already present in shared guides
- calls list/read MCP requestables with the wrong shape or invents requestable names
- mutates generated artifacts instead of source objects
- creates a project name different from the requested name
- misses the selected recipe before mutation
- builds an HTTP web-service facade without reading `convertigo-recipe-http-facade`
- abandons a required HTTP web-service integration and returns hard-coded sample data instead of preserving the connector/transaction/facade rail
- creates only a secondary page and leaves the visible entry page untouched
- repeatedly fails to create `UIPageEvent`, `UIControlEvent`, `SetLocalAction`, `CallSequenceAction`, or `UIControlVariable`
- stops after announcing a next UI section without making the MCP mutation or producing a final answer
- passes Vibe-prefixed tool names inside `Convertigo_batch-call`
- leaves `CallSequenceAction.requestable` empty after using a skipped `Sequence` property
- passes page-local query values with `script:this.local?.searchQuery` instead of Local SmartSource/source mode
- renames the page search local from `searchQuery` to a provider/facade variable name such as `q`
- binds the input or `UIControlVariable` to Local `?.q`, `?.nom`, or another provider-specific local instead of Local `?.searchQuery`
- claims completion with only input/button containers and no `CallSequenceAction` plus `UIControlVariable` backend handoff
- claims completion with a green mobile builder but no visible Local SmartSource/source read of results and no facade-contract fields in the result UI
- stores raw `out` in result state and never creates a `ForEach` that reads the normalized result collection
- says a loading reset is needed but then saves, opens the builder, or finishes without creating `SetLocalAction(Property=loading, Value=script:false)` under the successful `CallSequenceAction`
- treats a failure-handler `loading=false` as the success-path loading reset
- creates `StoreResults` or `SetLoadingFalse` as siblings of the `CallSequenceAction` instead of children whose QNames sit below the call action
- renders page-local count or empty text with script/plain local expressions instead of Local source SmartSources
- uses plain template text such as `{{ errorMessage }}` for page-local state instead of a Local SmartSource/source binding
- creates a `ForEach` whose children use `record.*`, `item.*`, or another iterator name but whose readback does not show the matching `directiveItemName`
- repeatedly retries skipped `textValue` properties on `UIDynamicElement` objects instead of adding `UIText` children
- creates ordinary error `SetLocalAction` siblings under a click/submit event instead of placing them under a failure/error handler
- deletes useful UI through `mode:"replace"` plus empty/qname-only children
- treats `databaseobject-tree-apply` with an empty tree as a successful delete
- deletes NGX widgets with save/refresh disabled, then browser smoke still shows stale generated components
- leaves empty `WelcomeCard` or `REMOVED` objects after cleanup
- claims facade proof from `status:"ok"` when the payload is metadata-only and contains no application records
- claims HTTP proof from a provider error body such as missing credentials, quota exceeded, login required, HTML documentation, or another payload outside the requested contract
- swaps the requested HTTP integration for a generic search/encyclopedia/autocomplete endpoint whose payload lacks useful records and fields for the requested contract
- needs hidden UI-supplied fixed provider constants for the facade to work, instead of proving a self-contained facade call with the public input variables
- concludes that the UI "must" pass provider constants after proving that facade execution with only the public input returns provider help, HTML documentation, or an unfiltered/default payload
- renames facade variables in a way that prevents the user query/filter from reaching the HTTP transaction, especially when two facade proofs with different inputs return the same default or unfiltered result set
- burns the run budget by reading huge logs or full project trees when targeted `requestable-execute` or object readback would prove the issue
- cannot produce runtime proof for the created project
