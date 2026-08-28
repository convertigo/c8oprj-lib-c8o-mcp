# Convertigo Vibe Fast Path: HTTP NGX Data App

Use this compact path for a fresh Convertigo NGX app that queries, lists, or displays records from an HTTP web service. It is intentionally generic: it defines Convertigo technical constraints, not provider or business-domain choices.

## Hard Rules
- Import `template_ngxBuilderIonic` exactly once with the exact requested project name as the imported project name. Do not call `mobile-builder-open` immediately after import; mutate backend and UI first, save, then call `mobile-builder-open` once as the final builder proof.
- After the guide read, every project QName you inspect or mutate must start with the requested target project name, except the single `marketplace-import` template id and `lib_ConvertigoMCP.*` resource reads. Do not target generic roots such as `Convertigo`, `WorkSpace`, `Projects`, `C8O`, or another project. Do not create a project manually with `databaseobject-tree-apply`; project creation must come from `marketplace-import`.
- Do not call `project-list`, inspect unrelated local projects, or copy another project unless the user explicitly names a reference project.
- Do not edit `_private/ionic`, `DisplayObjects`, generated files, or YAML directly. Use MCP source objects.
- Send MCP writes sequentially. Do not send multiple `databaseobject-tree-apply`, `databaseobject-delete`, or `project-save` calls in one assistant message.
- Treat every `status:"partial"`, skipped/rejected property warning, failed operation, or child patch error as a stop-and-repair signal before continuing. If a partial create touched the UI tree, read back the affected root and delete/recreate the malformed child before adding more objects; do not build on a partially applied subtree.
- If a write involving `DoubleBinding`, `varValue`, `directiveSource`, or `SetLocalAction.Value` returns `status:"partial"` or any skipped property warning, do not create the next UI object. Read back that same object, patch the same property until it is accepted in the expected mode, then continue.
- After a green proof, targeted readback, or successful delete, continue with the next required MCP mutation immediately. Keep reasoning short and do not spend a turn restating evidence when the next object is already prescribed by this guide.
- Do not use generic test, placeholder, echo, fixture, tutorial, sample, mock, encyclopedia, web-search, or demo APIs for a real data-backed app unless the user explicitly asked for that source type.
- Never choose an HTTP API that requires credentials, API keys, tokens, usernames, demo accounts, or quota-limited sample access. Do not hide those values in backend defaults; choose a no-credential direct record endpoint or report proof incomplete.
- Do not probe public HTTP URLs through guessed MCP helpers. Create the typed HTTP transaction and prove that transaction through `requestable-execute`.
- Do not delete template placeholder connectors or starter infrastructure unless it blocks the requested feature.
- Visible starter body cleanup is required for the target page. Delete exact starter placeholder nodes, or replace the whole visible content with a complete application subtree, then read back the parent and verify no starter placeholder QName or removal comment remains.
- User input controls must set the `DoubleBinding` property directly on `ngx.components.UIDynamicElement#Input`. Never create a child binding object and never use the input `Value` property for the user query/filter value.
- Every primary visible action trigger must have a direct `ngx.components.UIText#UIText` child with a non-empty plain label before the final save. If the trigger subtree exists but the label readback is empty or missing, repair the same button before opening the builder.
- For result loops, `directiveName:"ForEach"` is not enough. Before adding any row text, read back the `UIControlDirective`; it must show `directiveSource`, `directiveItemName`, and `directiveIndexName`. The exact root used by row text must match `directiveItemName`: `{{ item.x }}` requires `directiveItemName:"item"`, and `{{ record.x }}` requires `directiveItemName:"record"`. The visible row components that use that root must be children of the `UIControlDirective`, not siblings before or after it; otherwise Angular compiles the alias as a missing page property.

## HTTP Backend
Before choosing a provider or mutating the project, write a short application contract proof in your own reasoning. It must stay derived from the current user request and name:
- the requested record/entity class in neutral terms
- the user-facing query/filter input
- the collection shape expected from the backend
- the record fields that prove each item is a real application record for that request
- adjacent artifacts that would not satisfy the request unless the user explicitly asked for them, such as labels, suggestions, documents, metadata, technical identifiers without usable fields, or generic lookup results

Structured JSON is not enough by itself. A live proof is green only when at least one returned item satisfies that application contract. If the payload is structured but represents adjacent artifacts instead of the requested records, stop and report the contract proof incomplete; do not reinterpret adjacent data as success and do not move on to facade or UI work.

Before mutation, choose a direct record endpoint, not a provider catalog, dataset discovery, autocomplete, documentation, generic search, generic normalization, or entity-lookup endpoint. You must be able to name:
- the host-only `server`
- the stable path split between `baseDir` and transaction `subDir`
- one public user-facing query/filter variable
- the expected record collection shape (`array`, `items`, `features`, `records`, or equivalent)

A generic search-style endpoint is not a direct record endpoint merely because it returns labels, display names, descriptions, URLs, display metadata, or suggestions. Unless the user explicitly asked for a generic search or lookup app, the first rail must expose records whose fields already represent the requested application entities, with stable identifiers and useful domain fields in the payload.

When the product goal says users can search, treat that as a UI/filtering requirement, not permission to use a generic provider. The backend fast path still needs an endpoint that can be filtered by a public variable while returning structured records for the requested entities. Endpoint names or paths such as `lookup`, `autocomplete`, `suggest`, or `entity` are disqualifying for the first rail unless the requested application contract is explicitly those generic results. A path segment named `search` is acceptable only when live proof returns structured application records with useful fields, not labels/descriptions alone.

Creating an `HttpConnector` commits the run to that HTTP rail. Do not create exploratory connectors for multiple providers. A second `HttpConnector` for another host is not a repair; it is a failed headless run. Patching the existing connector with a different `server` hostname is also a provider switch, even when the connector name stays the same. If the first chosen rail cannot be proven after the repairs below, keep the rail and report the live proof incomplete instead of deleting it, changing its hostname, or trying another provider.

If the only endpoint you know requires uncertain dataset ids, fixed hidden variables, provider-specific headers, provider accounts, quota-limited demo credentials, catalog/discovery semantics, generic normalization or entity-lookup semantics, generic search semantics, or a static raw file URL with no server-side user filter variable, do not start mutating the project with that endpoint. Choose a simpler direct record endpoint when one is already known; otherwise report the HTTP proof incomplete.

A static file endpoint such as a raw `.json`, `.csv`, `.ndjson`, or repository-hosted data file is not a web-service search/list endpoint for this fast path unless the user explicitly asked for static-file integration. Do not compensate by downloading all records and filtering them in the UI or facade; that hides the missing HTTP request contract and usually bloats the run.

An endpoint whose result contract is selected by a technical query variable such as `dataset`, `table`, `source`, `index`, `catalog`, `collection`, `resource`, or equivalent is a catalog-style endpoint, not a direct record endpoint. Do not use that shape for this fast path unless the user explicitly supplied the exact dataset/resource identifier in the task.

Do not test public HTTP URLs through Convertigo MCP resource readers or non-existent helper requestables. `lib_ConvertigoMCP.mcp_resources_read` reads MCP guide resources only, not arbitrary URLs; `lib_ConvertigoMCP.mcp_http_get` is not a generic probe. The only valid live HTTP proof in this fast path is the typed Convertigo HTTP transaction you create, executed through `requestable-execute`.

1. Create one `connectors.HttpConnector`:
   - `server`: host only
   - `https`: boolean
   - `port`: usually `443`
   - `baseDir`: always set it explicitly. For a root-level endpoint use the empty string `""`; for a shared path prefix use no trailing slash
   - do not put generic lookup path segments such as `/lookup`, `/autocomplete`, `/suggest`, or `/entity` in `baseDir` for the first rail unless the user explicitly requested that result type
2. Create one `transactions.JsonHttpTransaction` under it:
   - `subDir`: endpoint path only, normally no query string
   - do not use generic lookup path segments such as `lookup`, `autocomplete`, `suggest`, or `entity` in `subDir` for the first rail unless the user explicitly requested that result type
   - do not use static raw file paths such as `*.json`, `*.csv`, or `*.ndjson` for the first rail unless the user explicitly requested static-file integration
   - query/filter inputs are `variables.RequestableHttpVariable` children
   - each query variable must have `httpName` equal to the upstream parameter
   - for the first proof, set only accepted request-variable properties such as `httpName`. Do not set guessed defaults such as `defaultValue`; if a default is needed later, read back the variable and use the real property name.
   - first proof must create only the public user-facing query/filter variable. Do not create fixed technical variables such as format, limit, mode, action, fields, type, scope, token, username, or API-key defaults before direct records are proven. If the endpoint returns HTML or invalid JSON until a technical constant such as `format=json` is added, it is not a clean first rail for this fast path.
   - after direct records are proven, fixed technical parameters may be added only as backend-owned defaults, not UI variables
   - do not set guessed properties such as `url`, `parameters`, `httpParameters`, `subPath`, or `timeout`
3. Execute the direct transaction with runtime path `<Project>.<Connector>.<Transaction>`, never a Studio QName.
4. `status:"ok"` is not enough. The payload must expose application records with useful fields that satisfy the application contract proof.
   After direct HTTP proof shows records, freeze that connector/transaction rail. Do not change `server`, provider, transaction name, or proven request variables while repairing the facade or UI.
5. If direct proof is `status:"ok"` but only `attr`, `context`, `generated`, or empty `text`, treat it as HTTP wiring failure:
   - read back connector and transaction
   - verify `server`, `baseDir`, `subDir`, and `RequestableHttpVariable.httpName`
   - do not add fixed technical variables, guessed headers, or extra query variables as the first repair
   - remove optional fixed query variables and prove the request with only the user-facing query variable when possible
   - retry the same provider once with alternate root slash shape: `subDir:"records"` vs `subDir:"/records"`; for `baseDir:""` and a root endpoint, try the leading-slash `subDir` shape before any provider change
   - if connector readback shows `baseDir:"/"` and transaction readback shows a leading-slash `subDir`, first set `baseDir:""` and rerun proof before any other repair
   - changing `server` or provider before this same-provider retry is non-compliant
6. If a direct HTTP proof returns HTML, documentation, login content, CSS/JavaScript, an error page, DNS/TLS/timeout failure, missing credentials, quota/auth messages, or metadata-only output for an expected JSON/XML API, perform at most one same-rail repair using readback evidence. Then rerun proof. If the second proof has the same payload class or transport failure, stop toggling settings and report proof incomplete.
   Do not repair HTML/CSS/documentation output by adding guessed HTTP headers or mutating `httpParameters`. Fix `server`, explicit `baseDir`, `subDir`, and `RequestableHttpVariable.httpName` first. Only set header/list properties when the provider contract explicitly requires them and readback has proven the exact property shape.
7. In headless automation runs, do not switch provider after metadata-only, empty-text, malformed-path, HTML/error-page, DNS/TLS/timeout, missing-credential, quota/auth, or provider 4xx/5xx proof failures. Fix the same connector/transaction shape or mark the live proof incomplete. Do not try static files, raw source hosts, generic search/lookup providers, documentation hosts, encyclopedia/entity search, or another API family as a fallback. Switch provider only when the provider returns an explicit application/domain error proving that endpoint cannot satisfy the requested contract; if you switch, first stop and explain the incomplete proof instead of continuing generation.
8. Once an `HttpConnector` exists, do not patch its `server` property to a different hostname. A `databaseobject-tree-apply` self-merge that changes `server` is a provider switch, not a same-rail repair. If the hostname was wrong or does not resolve, report the live proof incomplete instead of continuing with another host.
9. Do not call `Convertigo_log-view` in this fast path. Use direct `requestable-execute` proof and targeted object readback; broad or requestable-scoped logs consume the run budget and are not needed for the proof criteria.
10. A direct HTTP proof that only succeeds when callers supply fixed technical variables such as `format`, `mode`, `action`, `type`, `limit`, `fields`, or headers is not yet a clean public contract. Put such constants behind backend defaults only after the public user-facing variable has already proven records, otherwise stop and report proof incomplete.

## Facade
1. Create a public `sequences.GenericSequence` facade. Set only known sequence properties such as `comment`; do not set guessed sequence flags such as `final` or `output`. Do not create hard-coded sample records as the primary contract.
2. Keep the same request variable object name across:
   - HTTP transaction `RequestableHttpVariable`
   - public facade `variables.RequestableVariable`
   - `variables.StepVariable` under the `TransactionStep`
   - UI `UIControlVariable`
   Choose this name before creating the facade. When the HTTP transaction already has one primary request variable, use that exact object name end to end instead of creating a public alias and remapping it later. The public facade variable must be an actual child of the sequence, not only a `StepVariable` under the transaction step; otherwise external callers and UI actions have no stable public contract.
3. Add `steps.TransactionStep`:
   - `sourceTransaction`: runtime path `<Project>.<Connector>.<Transaction>`
   - `output`: `false`
4. Read back the sequence and verify both `variables.RequestableVariable` and `variables.StepVariable` are present, then get the exact `priority` string from the `TransactionStep`.
5. Add `steps.XMLCopyStep`:
   - `sourceDefinition:["<TransactionStep priority>","./document/array"]`
   - `output:true`
   - use the readback `priority`, never the QName, step name, or ordinal `"1"`
   - do not add guessed properties such as `outputDefinition`
6. Prove the facade with `requestable-execute`. Final payload must expose records directly, for example top-level `array`, `items`, `features`, or equivalent. Do not leave useful records only under `transaction.document`, `HttpInfo`, or headers.
   If the direct transaction proof is green but facade proof is empty or errors, repair only facade wiring: `sourceTransaction` must point to an existing runtime transaction path, `StepVariable` names/values must match the request variable, and `XMLCopyStep.sourceDefinition` must use the readback `TransactionStep.priority`. Do not switch provider, rename/delete the proven transaction, delete the `XMLCopyStep`, or set `TransactionStep.output:true` as a facade repair.
   Do not change `XMLCopyStep.sourceDefinition` from `./document/array` to `array`, `./array`, `payload/array`, or guessed paths just because `requestable-execute` displays a top-level JSON `array`. That display is the serialized response body, not the internal step XPath. If the copy is empty, read back the producer priority and verify same-name variable pass-through; if it still cannot emit records, stop and report the facade proof incomplete instead of changing provider or moving to UI work.

## NGX Page
Mutate `<Project>.Application.NgxApp.pg:Page`, especially `Page.Content`.

The starter visible page QName is known. Do not inspect broad application subtrees such as `<Project>.Application` at depth 2 or deeper just to find the page; those reads can return large style blocks and waste the headless budget. Use targeted reads of `<Project>.Application.NgxApp.pg:Page` or exact objects being edited.

Known classes:
- `ngx.components.UIDynamicElement#Input`, `#Button`, `#List`, `#ListItem`, `#DivTag`, `#Heading1`, `#Heading2`
- `ngx.components.UIText#UIText`
- `ngx.components.UIPageEvent#UIPageEvent`, `ngx.components.UIControlEvent#UIControlEvent`, `ngx.components.UIControlDirective#UIControlDirective`
- `ngx.components.UIDynamicAction#SetLocalAction`, `ngx.components.UIDynamicAction#CallSequenceAction`
- `ngx.components.UIControlVariable#UIControlVariable`

Tree shape:
- `tree` must be one concrete node with `name` and `className`.
- `children` is a sibling of `properties`, never inside `properties`.
- Use stable focused subtrees to reduce turns: page event with its `SetLocalAction` children, button with its `UIText`, click event with `SetLoadingTrue`, `CallSequenceAction` with its same-name `UIControlVariable`, and result list with its `ForEach` directive are acceptable. Create children separately only if nested JSON becomes hard to balance or a write returns partial/skipped properties.
- Do not send an `at:"inside"` write where `tree` contains only a `children` array. Create each child as its own concrete `tree` node with `name` and `className`.
- With `at:"inside"`, `tree` is the child being created, not a wrapper for the parent. For example, target a page with a `UIPageEvent` tree, target a connector with a transaction tree, and target a content node with one visible UI container tree.
- Do not use `at:"self"` on the page just to add a child. It can replace/recreate starter `Header` or `Content` and leave the generated app blank.

### Page Locals
Immediately after deleting starter placeholder content, create these page-enter local initializers. Do not pause for broad page redesign or optional UI choices between starter cleanup and this local initialization.

Create `UIPageEvent` directly under the page, without guessed properties such as `pageEvent`. Add one `SetLocalAction` child per local. Each child must set both `Property` and `Value`; a value without `Property` does not initialize the page local:
- `searchQuery`: `Property={"mode":"PLAIN","value":"searchQuery"}`, `Value={"mode":"SCRIPT","value":"''"}`
- `results`: `Property={"mode":"PLAIN","value":"results"}`, `Value={"mode":"SCRIPT","value":"{items:[], total:0, query:''}"}`
- `loading`: `Property={"mode":"PLAIN","value":"loading"}`, `Value={"mode":"SCRIPT","value":"false"}`
- `error`: `Property={"mode":"PLAIN","value":"error"}`, `Value={"mode":"SCRIPT","value":"false"}`
- `errorMessage`: `Property={"mode":"PLAIN","value":"errorMessage"}`, `Value={"mode":"SCRIPT","value":"''"}`

Use `SCRIPT` mode for all `SetLocalAction.Value` values that are JavaScript literals or expressions: booleans, objects/arrays, empty strings, fallback strings, normalizers, and any expression using `out` or `c8oPage.local`. Do not write these values as `plain:true`, `plain:false`, `plain:{...}`, `plain:''''`, or another `plain:` JavaScript fragment; generated TypeScript can become invalid or store text instead of state. Use single quotes inside empty-string script values. Do not use escaped double quotes such as `"\"\""`.
Do not feed page locals with `SetLocalAction.Value` in `source:` mode. A `SetLocalAction` that stores page state must have `Property` set to the local name in PLAIN mode and `Value` set to a concrete SCRIPT/PLAIN assignment; a Sequence/Local SmartSource value can generate an empty TypeScript expression such as `Value: ,`.
Create the page event with `target:"<Project>.Application.NgxApp.pg:Page"`, `at:"inside"`, and `tree.className:"ngx.components.UIPageEvent#UIPageEvent"`. Do not wrap it inside a `PageComponent` tree.

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
- For any visible text, create `ngx.components.UIText#UIText` with property `textValue` set to the plain text or iterator interpolation. Do not use `i18n` as the visible text value; it leaves empty `UIText` nodes.
- Once the query/filter input is accepted, continue immediately with the required trigger action chain and results list. Do not pause for optional styling, placeholder repair, extra page reads, broad replanning, or explanatory prose between the input, trigger, action chain, and list creation.

Trigger action chain:
- Preferred first write: create the submit/refresh button under the visible content with child `UIText` and the click subtree through `CallSequenceAction + UIControlVariable` in the same focused `tree`. Do not create a bare button and postpone the event chain to later reasoning; that wastes turns.
- The first trigger subtree is: `Button -> UIText + UIControlEvent -> SetLocalAction(loading=true) + CallSequenceAction(requestable=<Project>.<Facade>) -> UIControlVariable`.
- Then add `StoreResults` and `SetLoadingFalse` as separate `SetLocalAction` children under the exact `CallSequenceAction` QName, never under the `UIControlEvent`.
- `SetLocalAction(Property=loading, Value=true)` uses `Value:{"mode":"SCRIPT","value":"true"}`.
- `CallSequenceAction.requestable` must be the exact public facade requestable, including case.
- Under the `CallSequenceAction`, child `UIControlVariable` is named exactly like the facade variable; do not use descriptive aliases.
- the `UIControlVariable` must set property `varValue` to the Local `?.searchQuery` SmartSource. The property name is exactly `varValue`; do not use `value`, `Value`, child directives, or a separate binding object.
- `UIControlVariable` does not store call results. Do not set guessed properties such as `storeResults`, `Variable`, `varName`, `target`, or similar result-storage aliases on `UIControlVariable`. Results must be stored by a separate child `SetLocalAction` under the `CallSequenceAction`.
- example variable node: `{"name":"<facadeVariable>","className":"ngx.components.UIControlVariable#UIControlVariable","properties":{"varValue":{"mode":"SOURCE","value":"{\"filter\":\"Local\",\"project\":\"<Project>\",\"input\":\"\",\"model\":{\"data\":[{\"localObject\":\"local\"}],\"path\":\"?.searchQuery\",\"prefix\":\"\",\"suffix\":\"\",\"custom\":\"\",\"useCustom\":false}}"}}}`
- There is no `ngx.components.UIDynamicAction#StoreResults` class. `StoreResults` is only a useful object name; its class must be `ngx.components.UIDynamicAction#SetLocalAction` with `Property=results`.
- under the `CallSequenceAction`, child `SetLocalAction(Property=results)` with this normalizer:

```json
{"mode":"SCRIPT","value":"(() => { const body = out.items ? out : (out.contract || out.response || out.object || out); const items = body.items || body.array || body.features || body.results || body.records || []; return {items: Array.isArray(items) ? items : [], total: body.total || body.totalItems || body.total_count || body.count || (Array.isArray(items) ? items.length : 0), query: c8oPage.local?.searchQuery}; })()"}
```

- under the `CallSequenceAction`, child `SetLocalAction(Property=loading, Value=false)` using `Value:{"mode":"SCRIPT","value":"false"}`
- any action that reads `out` must be a descendant of the `CallSequenceAction`, not a sibling under the event.
After `SetLocalAction(Property=results)` and `SetLocalAction(Property=loading,false)` are created under the call, stop repairing optional UI, save the project, open the mobile builder, run the facade proof once more, and answer. Do not loop on cosmetic reads or repeat the same action-chain explanation.

Results list:
- Create `ResultsList` then one `UIControlDirective` child.
- Set `directiveName` to the raw string `ForEach` when creating the directive; some readbacks omit this default, so do not repair only because `directiveName` is absent when the item/source fields are accepted.
- `directiveSource`: Local `?.results?.items` SmartSource.
- `directiveItemName` and `directiveIndexName` are raw strings, for example `record` and `index`, not SmartType objects.
- `directiveName:"ForEach"` does not define the template variable by itself. The exact root used by row text must be the `directiveItemName`: if text uses `{{ item.name }}`, set `directiveItemName:"item"`; if text uses `{{ record.name }}`, set `directiveItemName:"record"`.
- Known-good directive properties are: `directiveSource:{mode:"SOURCE",value:"{...Local ?.results?.items...}"}`, `directiveItemName:"record"`, and `directiveIndexName:"recordIndex"`.
- Put the repeated row/list item under the directive.
- Row `UIText` children may use plain iterator interpolation such as `{{ record.name }}`, `{{ record.label }}`, `{{ record.id }}`, or nested equivalent fields from the proven payload. Do not bind row fields through page Local SmartSource.
- Example row text node: `{"name":"NameText","className":"ngx.components.UIText#UIText","properties":{"textValue":"{{ record.name }}"}}`.
After creating the `UIControlDirective`, read it back with `properties:"all"`. The readback must show `directiveSource`, `directiveItemName`, and `directiveIndexName` as separate directive properties. If the apply result updated only `directiveSource`, if it updated only `directiveName`, or if readback misses `directiveItemName`, patch the directive itself before adding or proving row text. If row text uses `record.*`, readback must show `directiveItemName: record`; if row text uses `item.*`, readback must show `directiveItemName: item`. Generated HTML should contain `let <directiveItemName> of ...`, not only an auto-generated item variable.

Headless completion rule:
- After the facade proof is green, the minimum UI completion path is: delete starter content, initialize page locals, create heading, create a query/filter input, create a submit/refresh trigger with `UIText`, create button `UIControlEvent`, create `SetLocalAction(loading=true)`, create `CallSequenceAction`, add same-name `UIControlVariable`, add child `SetLocalAction(results)` normalizer, add child `SetLocalAction(loading=false)`, create a result collection view with `ForEach`, save, open builder, answer.
- Keep moving through that path with short direct MCP writes. Only stop to read back when a write returns `partial`, skipped properties, an error, or when a required `priority`/QName is needed for the next object.

## Proof And Stop
Before final answer:
1. Direct HTTP proof shows records.
2. Facade proof shows records directly and query forwarding.
3. Readback confirms `TransactionStep.output=false`.
4. Input and UI request variable use Local `?.searchQuery`.
5. Store results and loading=false are children of `CallSequenceAction`.
6. Result list repeats over Local `?.results?.items` with explicit item name.
7. `project-save` and `mobile-builder-open` pass.
8. Stop after first green proof; external callers may perform independent validation.
