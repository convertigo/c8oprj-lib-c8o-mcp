# Convertigo Frontend NGX

## When to read this
Read this when implementing or changing NGX pages, bindings, actions, route logic, or data-backed UI structure.

## What this guide covers
- Which NGX objects are indispensable and where they belong.
- How to place events and actions instead of scattering logic randomly.
- How to map backend data with SmartTypes, picker sources, and action variables.
- How to keep visible progress in Studio by starting the mobile builder early.

## Read this after the recipe
If the task is a classic data-backed page, read `convertigo/recipe-ngx-data-page@19` first. Use this handbook when the page needs deeper NGX structure, action chaining, runtime proof, or event semantics beyond the recipe.

For starter-based apps that display backend, HTTP web-service, SQL, or FullSync results, this handbook is not the entry point. Stop before any page mutation unless `convertigo://resources/convertigo-recipe-ngx-data-page` has already been read in the current session.

For data-backed pages, run the recipe's final tree-readback self-audit before any final response. If the readback shows a primary `UICustom`/`htmlTemplate` renderer, TypeScript page state, or direct `this.c8o.callJson*` transport, the page is still non-compliant even when the mobile builder is ready.

## Palette-first authoring rules

- Think of every NGX application as a normal Ionic / Angular application represented by the Convertigo object tree.
- For each Angular or Ionic component, use the matching Convertigo palette component first.
- Prefer palette-backed NGX components, events, actions, bindings, forms, lists, cards, tabs, menus, and Ionic controls over hand-written templates.
- Never use `UICustom` fragments for application UI. Treat fragments as forbidden for normal UI authoring, not as a shortcut.
- If you are about to create `ngx.components.UICustom#UICustom` with a large `htmlTemplate` for a data page, stop and redesign the tree with palette objects. A compiling large fragment is still a failed NGX delivery when palette components can express the page.
- Do not use a `UICustom` fragment as the main renderer even when the backend call itself is wired through `CallSequenceAction`. A fragment that contains the input, labels, loading notes, empty/error notes, list, or repeated result markup is still the primary page implementation and is non-compliant.
- If you already created such a fragment while probing, remove it before completion and replace it with visible palette objects. Do not keep it as a renderer and claim completion on builder proof alone.
- Treat `palette-describe` text for `UICustom#UICustom` as generic platform documentation, not permission for normal app delivery. For feature pages, use `UIDynamicElement`, `UIElement`, `UIText`, `UIAttribute`, `UIStyle`, `UIControlEvent`, `UIDynamicAction`, and `UIControlDirective` instead.
- A page that calls backend data from `scriptContent` with `this.c8o.callJson(...)` is not palette-first. Move the backend call to a button/page event containing `UIDynamicAction#CallSequenceAction` and pass variables with `UIControlVariable`.
- A page that calls backend data from `scriptContent` with `this.c8o.callJsonObject(...).async()` has the same failure mode and is also non-compliant. The page may contain small local helper methods, but backend execution belongs in the NGX action chain.
- Use generic `Div`, `Tag`, or other low-level HTML palette entries only as a last resort when no specific Ionic / Angular palette component exists for the need. Plain HTML containers such as `section`, `div`, `p`, `h1`, or `span` are acceptable for layout and copy; Ionic controls such as cards, inputs, lists, labels, buttons, progress bars, select controls, and items must use their `UIDynamicElement#...` palette entries when available.
- Keep UI structure visible in the tree: page layout, loading, empty, error, retry, forms, and action paths must be modeled with palette objects whenever possible.
- If a needed component seems missing, call `palette-list` / `palette-describe` on the intended parent before falling back to lower-level HTML nodes.
- Do not put business logic, filtering, mapping, set-difference computation, or complex Angular expressions in Convertigo pages. Pages should bind to backend-prepared fields with simple property paths or simple method-free expressions.
- Prepare filtered lists, candidate lists, relation summaries, and other view models in backend facade sequences. The NGX page should consume those prepared fields directly, especially for `ForEach` sources and select options.
- Apply CSS classes through the palette `Attribute` object with `attrName=class`; do not use inline `style` attributes for normal styling.
- Put additional global CSS in a new dedicated `UIStyle` object under the NGX app, with a clear name for the feature or concern. Do not append unrelated feature CSS to an existing generic `Style` object.
- Keep page-specific layout CSS in a page-level `UIStyle` only when it belongs only to that page; reusable classes and cross-page styling belong in their own app-level `UIStyle` object.
- Prefer stable class names such as `admin-list-item` applied through `Attribute` objects over broad selectors that affect every Ionic component of the same type.
- If a temporary inline style was used while probing a layout, remove it before completion and replace it with a palette `Attribute` class plus a dedicated `UIStyle` rule.

## NGX mental model

### Structure first, then wiring
An NGX app is not only a tree of visual components. It is:
- route/page structure
- UI controls
- directives
- shared actions / action stacks
- event placement
- backend bindings

Good NGX work:
- picks a stable backend contract first
- creates the visible structure second
- wires actions and states third
- validates build/runtime before concluding

Common trap:
- creating a visually plausible tree with weak action wiring, then assuming the page is “done”

## Indispensable NGX objects

### Page/container level
Use explicit page/container structure for:
- top-level layout
- loading/empty/error sections
- list/detail structure

Do not hide the entire page logic inside one freeform custom fragment if the palette provides the right structural objects.

Hard rule for data-backed pages:
- do not implement the primary page body as one large `ngx.components.UICustom#UICustom` with inline `htmlTemplate`
- reserve `UICustom` for tiny localized markup that native controls/directives cannot express safely
- if the page depends on backend data, action chains, retry, pagination, or lifecycle loading, the structure should stay visible in the NGX tree

### Data-loading action path
For a data-backed page, you usually need:
- one trigger/event
- one action stack
- one `CallSequenceAction` or `CallFullSync` path
- UI state updates around success/error/empty cases

Hard rule for server-backed data:
- External HTTP/SQL/service data must flow through Convertigo backend objects first: connector or source object, requestable transaction/sequence, then a stable public facade sequence.
- The NGX page must call that facade with the palette `UIDynamicAction#CallSequenceAction`.
- Do not use browser `fetch`, ad hoc HTTP clients, or direct `this.c8o.callJson()` from page TypeScript/custom actions for normal data loading when a `CallSequenceAction` can express the call.
- Do not place the backend call inside a freeform wrapper merely to avoid modeling the action stack.

### Retry path
Retry must be a real action path:
- not only a visible button
- not only a label
- not only a placeholder event with no backend call

The benchmark should be able to point to the actual action chain that retry executes.

## Where events and actions belong

### Event placement rules
Use events where user or lifecycle intent is clear:
- page enter/init when data must load on page arrival
- button/tap when the user retries, submits, or navigates
- explicit shared-action entry points when reuse is intended

Do not place events arbitrarily just because they are reachable in the tree.

Typical placements:
- page lifecycle events for first load or refresh-on-enter
- button or tap events for retry, submit, open detail, or confirm actions
- shared action stacks only when the same chain is reused from several entry points

### Common action chains
Sequence-backed chain:
1. trigger event
2. set loading state
3. call sequence
4. map success to page state
5. map empty result to empty state
6. map failure to error state
7. expose retry path

FullSync-backed chain:
1. trigger event
2. call fullsync action
3. normalize result into page state
4. preserve loading/empty/error semantics

Why this is the right way:
- page behavior stays predictable
- the agent does not invent one-off action trees every time

Common trap:
- calling the backend is the only thing wired; loading/empty/error/retry remain structural stubs

### Where sequence and fullsync calls belong
Use `CallSequenceAction` when:
- the page depends on a backend facade or server-side orchestration
- the contract already exists and the UI should consume it directly

Use `CallFullSyncAction` when:
- the page is working against synchronized local data
- offline/local query semantics are the right source of truth

Do not hide these calls inside arbitrary custom wrappers when a normal action stack already expresses the flow clearly.

Canonical searchable data chain:
1. input control uses `UIDynamicElement#Input` with a deliberate binding for the query value
2. submit button uses `UIDynamicElement#Button`
3. button event contains `UIDynamicAction#CallSequenceAction` targeting the public facade sequence
4. query variables are modeled as `UIControlVariable` children of the call action
5. result lists/details bind from the call output or stable facade source using `SC` whenever possible
6. `UICustomAction` is allowed only for true local side effects, not as the primary transport or response mapper when source bindings can consume the action output

### HTTP search page pattern
For a search app backed by an HTTP web service, use this shape. Open data APIs are just one example:
- Backend: `HttpConnector` -> typed `JsonHttpTransaction` -> public facade `GenericSequence`.
- UI search input: `UIDynamicElement#Input`; bind its Binding/`DoubleBinding` property to a page local such as `?.searchQuery` with `SC`/source mode on `Local`. Do not use `ionChange`/`InputChange` plus `SetLocalAction` only to copy the typed value.
- Page-local UI state must live in Convertigo locals, not in TypeScript page fields. Do not declare `searchQuery`, `results`, `loading`, `error`, or similar state in `Begin_c8o_PageDeclaration`.
- Add a page-enter `UIPageEvent` that initializes every local used by Local SmartSources or `SetLocalAction` with `SetLocalAction` before first render/user interaction. In current NGX trees the default `viewEvent` is `onDidEnter`, which satisfies this page-enter initialization rule. A search page normally initializes `searchQuery`, `loading`, `error`, `errorMessage`, `empty`, and `results`.
- Widgets/directives that read page-local UI state must use SmartSource/source mode on `Local`, for example `source:{"filter":"Local",...}`. Do not bind that state with `script:searchQuery`, `script:page.searchQuery`, `script:this.local?...`, or `plain:loading`.
- If `palette-describe` for `SetLocalAction` suggests reading back the value with `this.local?.myProperty` in TS mode, treat that as generic palette documentation and override it for data pages. This guide requires Local SmartSource reads.
- Tree-apply local read shape:

```json
{
  "mode": "SOURCE",
  "value": "{\"filter\":\"Local\",\"project\":\"<ProjectName>\",\"input\":\"\",\"model\":{\"data\":[{\"localObject\":\"local\"}],\"path\":\"?.results?.items\",\"prefix\":\"\",\"suffix\":\"\",\"custom\":\"\",\"useCustom\":false}}"
}
```

- Use that shape for `UIControlVariable.varValue`, `UIControlDirective.directiveSource`, `UIText.textValue`, and dynamic component properties whenever the value comes from `SetLocalAction`.
- For input query binding, the same shape is known to apply cleanly as `DoubleBinding` when `path` is `?.searchQuery`. Do not stop at an "escaping is tricky" explanation and do not replace it with `ionChange`; apply the compact `SOURCE` value and read back the object.
- For button handoff, a known-good minimal chain is `UIControlEvent#UIControlEvent(eventName:onClick)` -> `UIDynamicAction#SetLocalAction(Property:loading)` -> `UIDynamicAction#CallSequenceAction(requestable: plain:<Project>.<facade>)` -> `UIControlVariable#UIControlVariable(name:<facadeVar>, varValue:<Local SOURCE ?.searchQuery>)`.
- Keep Local SmartSource `prefix` and `suffix` empty. For visible labels, use separate static `UIText`/`Label` objects around the bound value. Affixes on Local SmartSources can generate invalid Angular interpolation.
- Do not stop after storing the backend result in a local. Build a visible result surface that reads local result state with SmartSource/source mode, such as a `ForEach.directiveSource` on `?.results?.items`, a counter bound to `?.results?.total`, or detail text bound to one selected/result item.
- The facade must already expose the application fields the UI stores or binds. Do not make the NGX page parse raw `TransactionStep` internals as the final data contract; browser action output can expose only `HttpInfo`, `attr`, or other diagnostics even when backend `requestable-execute` displayed richer raw transaction data. If that happens, repair the facade contract first.
- Treat any final page action script containing `out.transaction`, `out?.transaction`, `response?.transaction`, or `transaction.document` as non-compliant for HTTP-backed data pages. Those paths are diagnostics from the transport layer, not the page contract.
- Result rows/details must expose real domain fields from the facade contract, including at least one recognizable label/name field and one useful differentiator when available.
- Labels and component body text usually belong in `ngx.components.UIText#UIText` children. If `textValue` is skipped on a `UIDynamicElement#Button`, `UIDynamicElement#Paragraph`, heading, card, or similar component, add a `UIText` child instead of retrying the skipped property.
- UI submit: `UIDynamicElement#Button` -> `UIControlEvent`.
- Pre-call state changes use `SetLocalAction` nodes for `loading`, `error`, `empty`, and related flags. A small `UICustomAction` may only handle validation or normalization that palette actions cannot express.
- Backend call: `UIDynamicAction#CallSequenceAction` under that event, with `requestable` set to `<Project>.<facadeSequence>`.
- Query handoff: `UIControlVariable` under the call action, with `varValue` sourced from the local `searchQuery` via SmartSource/source mode when possible.
- If the query does not reach the sequence during browser smoke, do not switch the variable to `script:document.querySelector(...)` and do not add an input event that copies the DOM value. Keep the input `DoubleBinding` and the `UIControlVariable.varValue` on the same Local SmartSource `?.searchQuery`, then fix the source binding shape until tree readback shows `source:{"filter":"Local",...,"path":"?.searchQuery"}` in both places.
- Scope note: visible template/component bindings do not expose a `page` object. For state that belongs to the page, prefer Local SmartSource bindings over TypeScript component fields.
- Exact tree-apply shape for the handoff: create `ngx.components.UIControlVariable#UIControlVariable` as a child of the `CallSequenceAction`; set its object `name` to the facade variable name such as `query`, and set only `varValue` plus `comment`. Do not set a separate `varName` property; on current trees the variable name is the object name and `varName` may be skipped.
- Exact call-action property: set `CallSequenceAction.requestable` to the facade requestable, for example `plain:<ProjectName>.<FacadeSequence>`. Do not set a property named `Sequence`; current tree readback leaves `requestable` empty when `Sequence` is used.
- Exact variable placement: `UIControlVariable` must be nested under the `CallSequenceAction`, not beside it under the `UIControlEvent`.
- If `palette-describe` is unavailable or fails for common NGX primitives, use `palette-list` plus this canonical shape instead of abandoning the palette path. Always confirm with `databaseobject-tree-get` that the child exists as `...vr:<variableName>` and that `varValue` is in `SCRIPT`, `SOURCE`, or deliberate plain mode.
- Failure handling: `UIActionFailureEvent` maps the action failure into page error state.
- Success handling: prefer binding visible results from the action/facade source. Use a small `UICustomAction` after the call only when the facade still returns an awkward legacy shape that cannot be bound directly.

The reference shape to emulate is:
`Button` -> `UIControlEvent` -> optional `UICustomAction` for local validation -> `CallSequenceAction` -> `UIControlVariable`.

The following shapes are non-compliant for normal HTTP search pages:
- `scriptContent` method calls `this.c8o.callJson(...)`
- `scriptContent` method calls `this.c8o.callJsonObject(...).async()`
- `Begin_c8o_PageDeclaration` declares feature state such as `searchQuery`, `results`, `total`, `loading`, `error`, or `searched`
- page locals are not initialized in a page-enter `UIPageEvent` with `SetLocalAction` before being read by widgets/directives
- the search input is raw template markup with `[(ngModel)]="searchQuery"` or `[value]="searchQuery"` instead of a palette Input Binding/`DoubleBinding` sourced from Local `?.searchQuery`
- a `UIControlVariable` for `query` or another search/filter parameter reads from `document.querySelector(...)`, `event.detail.value`, or another DOM/event script instead of the Local `?.searchQuery` SmartSource
- a `UIControlVariable` for `query` or another search/filter parameter reads from `script:this.local?.searchQuery` instead of the Local `?.searchQuery` SmartSource
- a `CallSequenceAction` has an empty `requestable` because the tree mutation used `Sequence` instead of `requestable`
- a `UIControlVariable` is a sibling of `CallSequenceAction` rather than a child of it
- a custom action writes `page.local.*` or `this.local.*` directly instead of letting `SetLocalAction` own page-local state
- the page writes `results` but has no visible Local SmartSource/source read of `?.results`, no result row/detail fields, or only an empty/generic result placeholder
- the page writes `results` by guessing over raw `out.transaction.document` while the facade has no shaped `items`/record contract for the page to consume
- one `UICustom` / `htmlTemplate` contains the input, labels, loading notes, empty/error notes, button, list, or Angular directives, even if the `CallSequenceAction` is a child of that fragment
- raw `*ngFor` / `*ngIf` are embedded in a fragment instead of modeled with palette directives or components
- backend URL or HTTP transport appears anywhere in the NGX page

## Data mapping with SmartTypes and picker

### Binding modes must be intentional
Frontend variables and action variables can carry:
- fixed text
- JS/TS expressions
- picker-based sources

Treat this as a real modeling choice, not an editor detail.

Use picker/source mode when:
- the data already exists in the current page/action context
- the source path is more stable than hand-written JS
- the value naturally comes from a sequence result, fullsync result, iterator directive, form, or global source

Use script mode when:
- the transform is small and obvious
- the page truly needs a computed expression
- the value is best expressed as a short TypeScript expression

Use text mode when:
- the value is fixed configuration
- the action variable is a deliberate literal such as a mode flag or static parameter

Rule of thumb:
- `TX` for fixed values
- `TS` for small local computation
- `SC` for data already present in the current action/page context

Priority rule:
- Prefer `SC` over `TS` when sourcing data from `CallSequenceAction` output, a facade sequence source, a previous action output, an iterator item, a form control, or global/page context that the picker can address.
- Use `TS` only when the value is not directly sourceable or when a small local expression is genuinely clearer than the picker path.
- Do not copy a full sequence response into page TypeScript state just so the template can iterate it. Bind list/detail components directly to the facade/action source with `SC` whenever the source can be expressed in the tree.

### Contract field mapping
Bind to stable facade contract fields:
- `items`
- `total`
- `status`
- `error`
- explicit detail fields chosen by the facade

Do not bind to raw connector names that only exist temporarily.

Common trap:
- UI binds to `rows`, `payload`, or source-specific names during early implementation and never gets cleaned up

### Action variables and data provenance
For `CallSequenceAction` and `CallFullSyncAction`, action variables are the normal handoff point between the event and the backend call.

Prefer:
- `TX` for constants and explicit flags
- `TS` for short expressions and reshaping
- `SC` when the picker can point directly to the current iterator item, form value, previous action output, sequence source, fullsync source, or global source

Why this matters:
- the current MCP surface is simpler than Studio's picker UI
- the guide must compensate by telling the agent when picker-backed sources are safer than handwritten expressions

### Structural directives and scope
Use palette structural directives for Angular structural behavior:
- Use `UIControlDirective#UIControlDirective` with `directiveName=ForEach` for repeated UI.
- Use `directiveItemName` and `directiveIndexName` so Convertigo owns the generated scope.
- In action variables under a directive, refer to iterator values through `scope.<directiveItemName>`, not a bare local identifier.
- In visible text/template expressions rendered inside the repeated subtree, the generated template exposes the item name directly. For `directiveItemName=record`, use `record?.name` in a `UIText` expression, not `scope.record?.name`.
- Do not bind iterator fields through the Local SmartSource filter. A `UIText` Local source path such as `record.name` is treated as a page-local path and generates invalid template variables. For visible row text, use a plain template expression such as `{{ record.name }}` or another field from the facade contract. Keep Local SmartSource/source mode for the repeated collection itself, for example `?.results?.items`.
- For conditional UI, make the `UIControlDirective` with `directiveName=If` the wrapper/parent of the element it controls. The controlled component should be a child of the directive, not the other way around.
- Do not add raw `*ngFor`, `*ngIf`, or similar Angular structural directives as generic attributes when the palette directive/control object exists.
- If repeated results feel hard to model, build a simple non-repeated palette shell first and bind one count or first item; do not fall back to a raw `*ngFor` fragment to finish the screen.

Why this matters:
- Raw structural attributes can generate template output that looks plausible but leave action variables outside the generated TypeScript scope.
- A common broken shape is `vars:{record: record}` in the generated action method. The correct palette-backed shape passes the iterator through the event scope, for example `vars:{record: scope.record}`.
- A common visible-text bug is using `scope.record` in generated template bindings under the repeated row; for display-only expressions, use the directive item name directly, for example `record`.
- A common conditional-state bug is placing `IfLoading` or `IfError` under the progress bar or note; the wrapper directive must own the conditional subtree.

### Angular property bindings
Angular property bindings must use the correct SmartType mode:
- Binding attributes such as `[value]`, `[disabled]`, `[selectedText]`, `[interface]`, or similar dynamic Angular inputs should use `SC` when sourceable and `TS` for short local expressions.
- When binding to page-local fields in the generated template, the expression should be the component field itself, for example `searchQuery`, `loading`, or `errorMessage`; do not prefix it with `page.`.
- Do not set Angular property bindings in `TX`/plain mode unless the desired runtime value is truly a string literal.
- Watch for generated output like `[value]="'searchQuery'"`, `disabled="{{loading}}"`, or `value="{{page.searchQuery}}"`; these are signs that the source object used the wrong binding mode, property, or scope.
- Prefer the component's palette property when it models the dynamic input correctly; otherwise add a palette `UIAttribute` with the Angular binding name and an intentional `SC` or `TS` value.

### Custom action output handling
Prefer direct source bindings over response-copying code. If a small `UICustomAction` is truly needed immediately after a `CallSequenceAction`, use the generated action parameters:
- Actions that depend on the call response must be children of the `CallSequenceAction` or children of a normalizer under that call. Do not place `SetLocalAction(Value=script:out)` as a sibling of the call under the same click/page event; sibling actions are generated in a parallel `Promise.all` block and do not receive the call response.
- `props.parent.out` is the parent `CallSequenceAction` output in current generated custom action functions
- If the parent output lacks the application records and contains only transport diagnostics, stop normalizing in the page. The facade is incomplete; add explicit shaping there and prove it before returning to the UI.
- `vars` contains variables local to the custom action
- never reference bare `out`, bare `parent`, `parent.out`, or `stack`; they are not in scope as top-level variables in generated custom action code
- do not assign `page.local.*` from custom code; return/resolve normalized data and use palette `SetLocalAction` nodes to update local state
- do not use browser globals such as `parent` or `parent.out`; in generated page code, `parent` resolves to `Window` and will fail TypeScript checks
- do not assume a `stack` variable exists inside the custom action body unless generated diagnostics prove it for that exact object
- if a failure handler needs an error message, read it from `event` defensively, for example `const message = event && event.message ? event.message : 'Erreur pendant la recherche';`

## Common page pattern for data-backed UX

### Canonical order
1. contract known
2. page structure created
3. load action path wired
4. loading state visible
5. empty state visible
6. error state visible
7. retry path real
8. runtime/build checked

### Empty state
Use empty state for:
- valid request
- no data returned

Do not confuse empty state with error state.

### Error state
Use error state for:
- request failure
- invalid runtime path
- backend refusal

Error state must not silently masquerade as an empty list.

### Retry behavior
Retry must re-enter the data-loading action path. A structural marker is not enough.

## Mobile builder: use it early, not at the end

### Start it early on UX work
For any task that includes UI work, start `mobile-builder-open` early in the implementation path.

Why this is the right way:
- the user in Studio sees the application evolve live
- build errors surface earlier
- the agent stops guessing whether the tree is actually viable

### What to do when the viewer is unreachable
If `viewerUrl` is unreachable or browser smoke fails:
1. inspect the builder logs returned by `mobile-builder-open`
2. if still unclear, call `log-view`
3. decide whether:
   - the build failed
   - the viewer is unavailable
   - the page exists structurally but runtime proof is missing

Do not conclude success from tree shape alone when the build logs say otherwise.

### Structural success is not runtime success
Keep these checkpoints separate:
- structural success: the subtree and intended actions exist
- build success: the builder compiles the app
- runtime success: the viewer/browser path shows the expected behavior

If structural success exists but build/runtime fails, the task is not done. Read builder logs first, then `log-view` if needed.

If the builder is healthy and the page was changed, browser smoke is part of done-ness for UX work. “Builder ready” alone is not enough.

## Stub-backed UI runtime

### When `__stub=true` matters
If the page calls a requestable whose runtime proof depends on the Convertigo stub path, the UI action must pass `__stub=true` explicitly.

Why this matters:
- a stub file on disk is not enough by itself
- the browser path must ask for stub behavior explicitly when the requestable expects it

Common trap:
- the backend stub exists, but the UI runtime call still returns empty because the required variable was never sent

## Common NGX drift patterns

### Drift: raw backend payload binding
Symptom:
- page binds directly to source-specific response fields

Fix:
- bind only to stable facade fields

### Drift: structural retry only
Symptom:
- retry button exists, but no real action path is attached

Fix:
- ensure retry re-enters the same load action path

### Drift: build not checked
Symptom:
- tree looks plausible, but viewer/build fails

Fix:
- open mobile builder early and inspect logs

### Drift: custom wrappers/directives break semantics
Symptom:
- duplicated directive wrappers, empty containers, or invalid Angular composition

Fix:
- prefer palette-backed canonical structure
- keep directive/control composition deliberate

### Drift: giant UICustom body
Symptom:
- most of the data page lives in one `UICustom` / `htmlTemplate` node
- builder/runtime failures are hard to localize
- action wiring becomes implicit instead of inspectable

Fix:
- move the page back to native NGX controls, directives, and explicit action chains
- keep `UICustom` only for very small, isolated fragments

## Minimum validation proof
For a credible NGX data page:
- the target subtree exists
- bindings point to stable contract fields
- loading state exists
- empty state exists
- error state exists
- retry is a real action path
- mobile builder was started early enough to expose real build issues
- logs were checked when the viewer/build path failed
- latest UI mutations were saved

## Recommended MCP tools
- `databaseobject-tree-get`
- `databaseobject-tree-apply`
- `batch-call`
- `palette-list`
- `palette-describe`
- `requestable-execute`
- `mobile-builder-open`
- `log-view`
- `project-save`

## Anti-patterns / do not do
- Do not guess NGX objects when the palette can tell you the canonical ones.
- Do not wait until the end to start the mobile builder on UX work.
- Do not ship only the happy path.
- Do not treat structural UI presence as runtime proof.
- Do not forget `__stub=true` when the requestable contract needs it.
- Do not build a contract-backed data page mainly through one large `UICustom` body.

## Completion checks
- The page uses deliberate NGX structure and action placement.
- Bindings target stable facade fields.
- Loading, empty, error, and retry states are all real.
- `mobile-builder-open` was started early on UX work.
- Builder or log evidence was read when runtime smoke failed.
- The page is saved only after structural and runtime/build evidence are consistent.
- A data-backed page is not implemented mainly through one large `UICustom` fragment.
