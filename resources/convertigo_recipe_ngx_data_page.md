# Convertigo Recipe: NGX Data Page With Stable Contract States

## When to read this
Read this when building a page that loads backend data and must behave correctly on initial load, empty data, errors, and retry.

## What this guide covers
- The fastest safe NGX page pattern for data-backed UI.
- How to wire load, empty, error, and retry states.
- How to bind to stable facade fields.
- How to validate both structure and runtime behavior.

## Mandatory workflow

### Golden path
1. Confirm the backend facade contract first.
2. Inspect the target page subtree and identify the actual visible entry page.
3. On starter-derived apps, replace the dominant starter body on the visible entry page first. Do not keep `WelcomeCard` or equivalent demo content as the main visible body while other work continues.
4. The first visible pass must already make the real entry page look alive:
   - title/header changed
   - starter body replaced
   - one visible feature section exists
   - loading, empty, or retry states are visible
   - one contract-shaped slot exists for the eventual live count/item binding
5. If stable facade proof already exists, bind one real count, value, or repeated item in that first pass. Otherwise treat this as `phase 1` shell progress and return for a second binding pass after backend proof.
6. Use the palette or canonical tree shapes to create:
   - visible feature shell that replaces the default starter content early
   - first visible write on the actual visible entry page; for starter-derived projects this usually means replacing the dominant body under `Page.Content`
   - page load event
   - state flags
   - success container
   - empty state
   - error state
   - retry action
5. Use `CallSequenceAction` or the equivalent built-in action for backend calls.
6. For external HTTP/SQL/service data, the page calls only a stable Convertigo facade sequence through a palette action chain. Do not use browser `fetch`, direct `this.c8o.callJson()`, `this.c8o.callJsonObject(...).async()`, or custom action transport for normal data loading.
7. Prefer `SC` source bindings for data already available from the facade/action output, current iterator scope, forms, or global/page context. Use `TS` only for small local expressions that are not cleanly sourceable.
8. Bind only to stable facade fields.
9. Keep the main page body on native NGX objects. Do not collapse a data page into one large `UICustom` / `htmlTemplate` fragment.
10. Model lists with `UIControlDirective#UIControlDirective` (`directiveName=ForEach`) instead of raw `*ngFor` attributes whenever child actions, repeated controls, or repeated facade data are involved.
11. Under a palette `ForEach`, pass iterator values through `scope.<itemName>` in child action variables. A generated action variable such as `vars:{city: city}` means the loop/action scope was modeled incorrectly.
12. For Angular property bindings such as `[value]`, `[disabled]`, and `[selectedText]`, use `SC` when sourceable or `TS` for short local expressions. Plain/TX mode is wrong if it produces generated output like `[value]="'searchQuery'"` or `disabled="{{loading}}"`.
13. Page-local state must live in Convertigo locals, not TypeScript fields in `Begin_c8o_PageDeclaration`. Input-owned values such as `searchQuery` should be modeled with the input palette Binding/`DoubleBinding` property. Action-owned values such as `results`, `cities`, `loading`, `error`, `errorMessage`, or selected item state should be created and updated with `UIDynamicAction#SetLocalAction`.
14. Every page local used by a Local SmartSource or by `SetLocalAction` must be initialized in the page-enter lifecycle with `SetLocalAction` before the first user interaction. In current NGX trees this is a `UIPageEvent`; its default `viewEvent` is `onDidEnter`, which is the Convertigo page-enter event for this rule. This includes input-owned locals such as `searchQuery` and action-owned locals such as `results`, `loading`, `empty`, `error`, and `errorMessage`.
15. Components/directives bound to page-local state must read it with `SC`/source SmartSource on `Local`, for example `MobileSmartSourceType: source:{"filter":"Local",...}`. Do not bind page-local state with `script:searchQuery`, `script:page.searchQuery`, `script:this.local?...`, `plain:loading`, or similar script/plain expressions.
   - This rule overrides generic palette help that suggests `this.local?.myProperty` in TS mode. That TS form may compile, but this recipe requires source mode on `Local`.
   - For `databaseobject-tree-apply`, a local SmartSource value has this shape:

```json
{
  "mode": "SOURCE",
  "value": "{\"filter\":\"Local\",\"project\":\"SkillFranceCity\",\"input\":\"\",\"model\":{\"data\":[{\"localObject\":\"local\"}],\"path\":\"?.searchQuery\",\"prefix\":\"\",\"suffix\":\"\",\"custom\":\"\",\"useCustom\":false}}"
}
```

   - Use the same shape for `UIControlVariable.varValue`, `UIControlDirective.directiveSource`, `UIText.textValue`, and component properties that read page-local state. Change only `project` and `path`.
   - Keep `prefix` and `suffix` empty for Local SmartSources. For visible labels such as `Ville:` or `Population:`, create a separate static `UIText`/`Label` next to the bound value. Do not rely on SmartSource `prefix`/`suffix`; in generated Angular templates this can produce invalid interpolation such as `{{Ville: local?.result?.cityName}}`.
   - Examples: `path:"?.searchQuery"` for the query, `path:"?.results?.items"` for a result list, `path:"?.loading"` for a visibility source.
16. For conditional visibility, make the `UIControlDirective` the wrapper/parent of the component it controls. Do not put an `If` directive as a child of the component that should disappear; that can compile while leaving the note/progress/list visible at the wrong time.
17. Stay inside the target project. Do not trawl unrelated workspace pages or YAML files for ready-made directive trees unless the task explicitly provides a read-only example project.
18. Start the mobile builder early and treat builder/browser proof as part of the recipe, not as an afterthought.
19. Save after structural and runtime checks.
20. One targeted read, then visible mutation. A pass that only reads, saves, opens the builder, or repeats broad palette discovery without replacing the dominant starter content is a no-op.
21. For starter-derived projects, a pass that creates only a secondary page while the visible entry page still shows the untouched starter body is also a no-op unless the entry route was deliberately switched, saved, and proven.
22. Before claiming completion, perform a tree readback self-audit of the page and fix any failed item before final response. A green builder does not override this audit.
23. The self-audit must prove:
   - a real `CallSequenceAction` exists under a page/button event
   - a `UIControlVariable` child passes the search/query value to the facade
   - no page `scriptContent` method calls `this.c8o.callJson`, `this.c8o.callJsonObject`, `fetch`, or an external HTTP client
   - no feature state such as `searchQuery`, `results`, `cities`, `loading`, `error`, or `empty` is declared in `Begin_c8o_PageDeclaration`
   - every local used by Local SmartSources or `SetLocalAction` is initialized by `SetLocalAction` in a page-enter `UIPageEvent` such as the default `onDidEnter`
   - the search input uses Binding/`DoubleBinding` sourced from Local `?.searchQuery`
   - the `CallSequenceAction` query variable also uses a Local SmartSource `?.searchQuery`; it must not read the DOM or use a script expression such as `document.querySelector(...)`
   - action-owned UI state is written with `SetLocalAction`
   - custom code does not assign `page.local`, `page.local.results`, `page.local.loading`, or similar state directly
   - visible reads of page-local state use Local SmartSource/source mode with empty `prefix` and `suffix`
   - the primary data page body is not a `UICustom`/`htmlTemplate` fragment
24. If the readback shows `UICustom#UICustom` as the primary renderer, TypeScript page fields, missing page-enter local initialization, a direct `callJson` call, an input event copying `searchQuery`, a DOM selector used as an action variable, or direct `page.local.*` assignments, delete/replace that shortcut and rebuild with palette objects before any final answer. Do not report the project as done because backend proof, mobile builder proof, or browser smoke is green.

### Mandatory data-page gate
Before the first UI mutation, write the intended tree in terms of Convertigo object types. For a server-backed search/list page, the plan must include all of these:
- one visible input/control object, usually `UIDynamicElement#Input`
- one visible submit/retry button, usually `UIDynamicElement#Button`
- one event on that button/page, `UIControlEvent`
- one backend action, `UIDynamicAction#CallSequenceAction`
- one `UIControlVariable` per request variable that the facade needs
- visible loading, empty, and error branches
- a repeated result structure using palette objects/directives, not a raw fragment loop

If this gate cannot be satisfied from the current guide plus `palette-list`/`palette-describe`, stop and surface the missing palette contract. Do not compensate by building the page with a large `UICustom` fragment or by calling `this.c8o.callJson(...)` from `scriptContent`.

Passing the gate requires the visible structure itself to be palette-modeled. A `UICustom` that only "renders" the form, notes, or results while hosting a child `CallSequenceAction` still fails the gate because the page body is hidden in `htmlTemplate`.

If this gate fails after an attempted implementation, do not finish by presenting the project. Rework the page until the tree readback passes the gate; the failure is structural, not cosmetic.

### Search facade wiring example
For a city/open-data search page, use the same wiring pattern as a normal facade-backed search:
0. Backend facade sequence: create an `InputVariablesStep` before the `TransactionStep`; for each transaction variable, use a `StepVariable` whose `sourceDefinition` points to the corresponding input variable node, for example `[<InputVariablesStep priority>, "./query/text()"]`. Do not set `StepVariable.value` to the literal string `"query"` or `"nom"` when the intent is runtime pass-through. Prove with `requestable-execute` that the outgoing HTTP URL contains the user value, for example `?nom=Lyon`.
1. Page state keeps only local UI concerns such as `searchQuery`, `loading`, `error`, and optionally a selected item. Store those concerns in Convertigo locals: input-owned values through palette Binding/`DoubleBinding`, action-owned values through `SetLocalAction`.
2. Create a page-enter `UIPageEvent` that initializes every local used on the page with `SetLocalAction`. Use the current NGX default `viewEvent` (`onDidEnter`) unless the tree already exposes another page-enter enum. For example initialize `searchQuery` to `script:''`, `loading` to `script:false`, `error` to `script:false`, `errorMessage` to `script:''`, `empty` to `script:false`, and `results` to a stable empty contract such as `script:{items:[], total:0, query:''}`. Add any other local used by Local SmartSources or later `SetLocalAction` nodes to this same initialization event.
3. The search input binds its Binding/`DoubleBinding` property directly to the local `?.searchQuery` in `SC`/source mode. Do not add an input `(ionChange)` / `InputChange` event only to copy `event.detail.value` into `searchQuery`. The search button event starts by setting `loading`, clearing `error`, and resetting `empty` through `SetLocalAction` nodes. Use a small `UICustomAction` only for validation or normalization that cannot be represented by palette actions.
   - If browser smoke shows the typed query is not reaching the call, do not repair it with `(ionChange)`, `InputChange`, `SetLocalAction(Property=searchQuery)`, or `document.querySelector('ion-input input')`. Read back the `Input` object and the `UIControlVariable` object, then fix their `DoubleBinding`/`varValue` SmartSources so both point to Local `?.searchQuery` in source mode.
4. The next child action is `UIDynamicAction#CallSequenceAction` pointing at the public facade sequence, for example `<Project>.search_cities` or `<Project>.searchCities`.
5. Under the call action, add `UIControlVariable` children for the facade variables, for example `nom` or `query`, with values sourced from the local `searchQuery` using SmartSource/source mode on `Local` when possible.
   - With `databaseobject-tree-apply`, create `ngx.components.UIControlVariable#UIControlVariable` under the call action.
   - Use the object `name` as the variable name sent to the sequence, for example `name: "nom"`.
   - Set `varValue` to the local SmartSource; do not add a separate `varName` property unless tree readback proves that property exists in the current Studio version.
   - Scope note: avoid TypeScript page fields and avoid `page.searchQuery` for page-local state. The local SmartSource is the stable representation for both visible widgets and action variables.
   - After creation, read back the child and expect a QName ending in `.vr:nom` plus a `varValue` property.
6. Use `UIActionFailureEvent` to map call failures to page error state.
7. After successful calls, prefer source bindings from the action output. If the facade returns a raw legacy array shape, a small post-call `UICustomAction` may normalize the response, but it must not perform the backend call.
   - In such small `UICustomAction` code after a `CallSequenceAction`, the generated function receives action context through `props`; use `props.parent.out` for the parent action output. Do not reference bare `out`, bare `parent`, `parent.out`, or `stack`; those produce invalid generated TypeScript in current NGX builds.
   - The normalizer may `resolve(normalized)` and let following palette actions consume that value. It must not assign `page.local.*` directly; write `results`, `empty`, `loading`, and errors with `SetLocalAction` nodes.

Minimal compliant local-state UI wiring:
- page-enter `UIPageEvent` (`onDidEnter` by default) -> `SetLocalAction` for every page local, including `searchQuery`, `loading`, `error`, `errorMessage`, `empty`, and `results`
- input `DoubleBinding` / Binding -> Local SmartSource `?.searchQuery` in source mode
- no input `(ionChange)` / `InputChange` -> `SetLocalAction(Property=searchQuery)` copy action
- search button `(click)` -> `SetLocalAction(Property=loading, Value=script:true)` -> `CallSequenceAction`
- `CallSequenceAction.vr:query.varValue` -> Local SmartSource `?.searchQuery`, not `script:this.local?.searchQuery` and not `script:document.querySelector(...)`
- after success -> `SetLocalAction(Property=results, Value=script:out)` and `SetLocalAction(Property=loading, Value=script:false)`
- result `ForEach.directiveSource` -> Local SmartSource `?.results?.items`, not `script:this.local?.results?.items || []`
- counter/loading/value text -> static label object plus a separate Local SmartSource value with empty `prefix` and `suffix`, not a TS ternary over `this.local`

This is compliant:
`SearchButton` -> `SearchClick` -> `PrepareSearch` (`UICustomAction`) -> `CallSearchCities` (`CallSequenceAction`) -> `nom` (`UIControlVariable`).

This is non-compliant:
`Page.scriptContent.searchCities()` calls `this.c8o.callJson(...)`, while `Page.Content` is a single `UICustom` containing raw `<ion-input>`, raw `<ion-button>`, and raw `*ngFor`.

Also non-compliant:
`Page.scriptContent.searchCities()` calls `this.c8o.callJsonObject('Project.Sequence', vars).async()`, while the submit button is raw template markup. A green builder does not make this pattern acceptable.

Also non-compliant:
`Page.Content.SearchView` is a `UICustom` fragment containing the input, loading/error notes, and result list, even if a palette `SearchButton -> SearchClick -> CallSearchCities -> nom` action chain is nested below it. Replace that fragment with palette objects for the input, text, notes, list shell, result rows, and style classes.

### First visible shell for common demos
On the first pass, build the smallest shell that already looks like the requested feature:
- real page title
- one visible list/card/table container
- one loading, empty, or retry state tied to the stable contract or stub
- one contract-shaped slot or placeholder surface for the eventual live count/item
- one obvious action such as retry, refresh, or create

This first shell is intentionally repetitive. It should be built almost mechanically from the recipe for common CRUD/list pages.
Once backend proof exists, the second pass replaces the placeholder surface with one real bound count, value, or repeated item.

### Literal fast-path template
For starter-derived apps, use `convertigo://resources/convertigo-fast-path-ngx-entry-shell` as the default first-pass template.
Do not redesign the first visible shell from scratch when that template already matches the task.

### Canonical state model
For a typical page-local state, keep explicit flags:
- loading
- empty
- error
- last payload or resolved contract fields

The exact object tree may vary, but the semantics must be explicit. These flags belong in Convertigo local state updated by `SetLocalAction`, and visible bindings must read them with Local SmartSources.

### Binding rules
- Bind to facade contract fields such as `status`, `items`, `total`, `item`, `error`, or similarly deliberate names.
- Do not bind directly to raw HTTP or SQL shapes.
- If the requestable is stub-only, pass the runtime variable required to materialize the stub. For `probe_contract_stub`, that means `__stub=true`.
- When a `CallSequenceAction` output is the source of list/detail UI, prefer direct `SC` bindings from the action/facade source to page TypeScript copies. A `UICustomAction` that only does `page.items = response...` is a smell unless there is no usable source binding path.

### Event rules
- Put load behavior in the correct page event or explicit load chain.
- Put retry on a real button event backed by a real action chain.
- Avoid custom action calls for backend access when a built-in call sequence action exists.
- Avoid custom action response mappers when `SC` bindings can consume the call/facade output directly.
- Avoid one big `UICustom` fragment as the main implementation path for a data page.
- Avoid “reference hunting” across the workspace to recover `directiveSource` snippets or wrapper placement from unrelated projects. If recipe + palette + target subtree are not enough, escalate the gap instead of copying opaque structures.
- Avoid repeated `palette-list` loops for common page primitives after the first targeted read.

### Why this is the right way
- The UI becomes stable before the real integration is fully complete.
- Studio shows visible feature progress early instead of an untouched starter page.
- Retry, empty, and error behavior are first-class, not late add-ons.
- Build/runtime validation becomes much easier because the page state is explicit.
- Native NGX trees survive builder/runtime checks better than large inline custom markup.

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
- Do not bind the page to raw connector output.
- Do not use custom code when palette-backed actions can express the same flow.
- Do not use direct frontend transport (`fetch`, direct `this.c8o.callJson()`, `this.c8o.callJsonObject(...).async()`) for backend data that belongs behind a facade sequence.
- Do not use raw `*ngFor` attributes instead of palette `UIControlDirective#UIControlDirective` for repeated data UI.
- Do not use plain/TX mode for dynamic Angular property bindings.
- Do not ship only the success path.
- Do not assume a stub file on disk means the page will see the stub payload automatically.
- Do not mark the page done if the latest UI mutations were never saved.

### Common failure modes
- Page loads before the contract is stable.
- Retry button exists structurally but has no real action chain.
- Stub-only requestable is called without `__stub=true`, then the page looks empty.
- Browser smoke fails, but build logs are never inspected.
- Builder is healthy, browser smoke is skipped, and the run still claims success.
- The builder opens, but the dominant visible page is still the untouched starter template.
- A secondary page was created, but the default visible entry page still shows the untouched starter body.
- A large `UICustom` body hides the actual page structure and makes build failures harder to localize.
- A "renderer-only" `UICustom` fragment still hides the page structure when it contains the feature form, states, or result list.
- The agent spends many turns reading other workspace projects instead of mutating the target page with the known recipe.
- The agent opens the builder or saves repeatedly before making the first visible page mutation.
- A generated action variable references a bare iterator identifier, for example `vars:{city: city}`, instead of a Convertigo event scope value such as `scope.city`.
- A generated binding turns a page property into a string literal, for example `[value]="'searchQuery'"`.
- A generated template binding references TypeScript page fields such as `searchQuery`, `page.searchQuery`, `loading`, or `this.local?.loading` instead of a Local SmartSource.
- A generated template contains invalid interpolation caused by Local SmartSource affixes, for example `{{Ville: local?.result?.cityName}}`. Use separate static text for labels and keep the SmartSource value unadorned.
- Page `scriptContent` declares state fields such as `searchQuery`, `results`, `cities`, `loading`, or `errorMessage`; these must be `SetLocalAction` locals.
- Page locals are first created only after a button click or backend success. They must be initialized in the page-enter `UIPageEvent` with `SetLocalAction` before widgets/directives read them.
- An `If` directive is created under `ErrorNote`, `EmptyNote`, `ProgressBar`, or another component instead of wrapping it; the component stays visible even when the condition is false.
- A search input looks correct visually, but the query variable is repaired with an input event or DOM selector instead of Local SmartSource binding.
- A custom action after a call or failure handler references `out`, bare `parent`, `parent.out`, or `stack` instead of the generated `props.parent.out` context.
- A custom action writes `page.local.results`, `page.local.empty`, `page.local.loading`, or similar state directly instead of resolving a value and using `SetLocalAction`.
- The page method calls the facade with `this.c8o.callJsonObject(...).async()` instead of using `CallSequenceAction`.
- The page compiles but renders empty or only partially because raw Angular directive attributes bypassed Convertigo's NGX scope model.

## Minimum validation proof
- `requestable-execute` proves the facade contract.
- Tree readback proves loading, empty, error, and retry nodes/actions exist.
- Tree readback or generated-output inspection proves repeated data UI uses palette directives, dynamic Angular inputs use source/script binding modes, and backend calls use `CallSequenceAction`.
- Tree readback must show `CallSequenceAction` and `UIControlVariable` under a real NGX event for server-backed search/list pages.
- Tree readback must not show the primary data page body implemented as `ngx.components.UICustom#UICustom` with a large `htmlTemplate`.
- Tree readback must not show the primary data page body implemented as a `UICustom` renderer with nested palette actions; visible form/state/result nodes need to be first-class palette objects.
- Tree readback must show page local initialization in a page-enter `UIPageEvent`, page state updates as `SetLocalAction`, and state reads as Local SmartSources, not `Begin_c8o_PageDeclaration` fields or `script:` bindings to page-local state.
- Page `scriptContent` must not contain direct backend transport such as `this.c8o.callJson`, `this.c8o.callJsonObject`, `fetch`, or external HTTP calls for normal facade-backed loading.
- A final answer may only say the app is complete after the tree readback satisfies the mandatory data-page gate. Builder-ready plus backend-ready is insufficient when the NGX page shape is non-compliant.
- `mobile-builder-open` proves build readiness or exposes the build error.
- Browser smoke proves the happy path when the builder is healthy.
- Save must succeed after the final UI mutation.

## Completion checks
- The target page binds to a stable facade contract.
- Loading, empty, and error states are explicit.
- Retry is a real action, not a visual placeholder.
- Static placeholder labels such as `Contacts list placeholder` or `Companies list placeholder` do not count as a usable UX milestone.
- Runtime validation covers the same contract the UI binds to.
- The latest NGX mutations were saved.
