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
   - For HTTP-backed pages, the facade contract must expose the application data the page will bind to, not only a raw `TransactionStep` subtree. If the UI is expected to render a list, prove a shaped list contract such as `{items:[...], total, query}` or an equivalent neutral shape before creating result UI.
2. Inspect the target page subtree and identify the actual visible entry page.
3. On starter-derived apps, replace the dominant starter body on the visible entry page first. In the default starter this is usually `Application.NgxApp.pg:Page` and `Page.Content`. Do not keep `WelcomeCard` or equivalent demo content as the main visible body while other work continues.
4. The first visible pass must already make the real entry page look alive:
   - title/header changed
   - starter body replaced
   - one visible feature section exists
   - loading, empty, or retry states are visible
   - one contract-shaped slot exists for the eventual live count/item binding
5. If stable facade proof already exists, bind one real count, value, or repeated item in that first pass. Otherwise treat this as `phase 1` shell progress and return for a second binding pass after backend proof. A raw HTTP transaction response shown only under `transaction.document` is not stable facade proof for an NGX page unless the page explicitly targets that raw diagnostic contract.
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
8. Bind only to stable facade fields. Do not make the page responsible for discovering or reshaping raw HTTP transaction internals.
9. Keep the main page body on native NGX objects. Do not collapse a data page into one large `UICustom` / `htmlTemplate` fragment.
10. Model lists with `UIControlDirective#UIControlDirective` (`directiveName=ForEach`) instead of raw `*ngFor` attributes whenever child actions, repeated controls, or repeated facade data are involved.
11. Under a palette `ForEach`, pass iterator values through `scope.<itemName>` in child action variables. A generated action variable such as `vars:{record: record}` means the loop/action scope was modeled incorrectly. Bind the list source itself from page-local state, for example `directiveSource` on Local `?.results?.items`, but do not bind repeated row fields as fake page locals. Row fields belong to the current iterator item, for example `record.name` / `record.status`, or to a selected item local such as `selectedRecord.name`. If child text uses `record.*`, the `ForEach` must set `directiveItemName: record` and usually `directiveIndexName: recordIndex`; otherwise generated Angular will use an auto item variable and `record.name` will not resolve.
12. For Angular property bindings such as `[value]`, `[disabled]`, and `[selectedText]`, use `SC` when sourceable or `TS` for short local expressions. Plain/TX mode is wrong if it produces generated output like `[value]="'searchQuery'"` or `disabled="{{loading}}"`.
13. Page-local state must live in Convertigo locals, not TypeScript fields in `Begin_c8o_PageDeclaration`. Input-owned values such as `searchQuery` should be modeled with the input palette Binding/`DoubleBinding` property. Action-owned values such as `results`, `items`, `loading`, `error`, `errorMessage`, or selected item state should be created and updated with `UIDynamicAction#SetLocalAction`.
14. Every page local used by a Local SmartSource or by `SetLocalAction` must be initialized in the page-enter lifecycle with `SetLocalAction` before the first user interaction. In current NGX trees this is a `UIPageEvent`; its default `viewEvent` is `onDidEnter`, which is the Convertigo page-enter event for this rule. This includes input-owned locals such as `searchQuery` and action-owned locals such as `results`, `loading`, `empty`, `error`, and `errorMessage`.
15. Components/directives bound to page-local state must read it with `SC`/source SmartSource on `Local`, for example `MobileSmartSourceType: source:{"filter":"Local",...}`. Do not bind page-local state with `script:searchQuery`, `script:page.searchQuery`, `script:this.local?...`, `plain:loading`, or similar script/plain expressions.
   - This rule overrides generic palette help that suggests `this.local?.myProperty` in TS mode. That TS form may compile, but this recipe requires source mode on `Local`.
   - For `databaseobject-tree-apply`, a local SmartSource value has this shape:

```json
{
  "mode": "SOURCE",
  "value": "{\"filter\":\"Local\",\"project\":\"<ProjectName>\",\"input\":\"\",\"model\":{\"data\":[{\"localObject\":\"local\"}],\"path\":\"?.searchQuery\",\"prefix\":\"\",\"suffix\":\"\",\"custom\":\"\",\"useCustom\":false}}"
}
```

   - Use the same shape for `UIControlVariable.varValue`, `UIControlDirective.directiveSource`, `UIText.textValue`, and component properties that read page-local state. Change only `project` and `path`.
   - Keep `prefix` and `suffix` empty for Local SmartSources. For visible labels, create a separate static `UIText`/`Label` next to the bound value. Do not rely on SmartSource `prefix`/`suffix`; in generated Angular templates this can produce invalid interpolation such as `{{Label: local?.result?.name}}`.
   - Examples: `path:"?.searchQuery"` for the query, `path:"?.results?.items"` for a result list, `path:"?.loading"` for a visibility source.
   - Error text is page-local state too. A `UIText` that displays an error message must use Local SmartSource/source mode on `?.errorMessage`, not `script:local?.errorMessage || 'fallback'`. Put the default fallback in the page-enter `SetLocalAction` value or in the failure `SetLocalAction`, then bind the text directly to `?.errorMessage`.
   - If escaping feels difficult in a headless client, do not stop or downgrade to an input event. Paste the compact value exactly and change only `project` and `path`.
   - A page is not complete when it only writes `results` with `SetLocalAction`. It must also contain at least one visible widget/directive that reads result state with Local SmartSource/source mode, for example a `ForEach.directiveSource` on `?.results?.items`, a counter value on `?.results?.total`, or detail text bound to a selected/result item.
   - For search/list apps, bind real fields from the result contract, not only generic placeholder text. Inside a `ForEach`, those field reads are iterator-scope reads, not page-local reads: set `directiveItemName` to a neutral row name such as `record`, then use the loop item name such as `record.name` and another contract field in child text/action bindings, or first write a selected item into a local such as `selectedRecord` and then read its fields with Local SmartSource.
   - Text displayed inside Ionic/HTML components is usually a child `ngx.components.UIText#UIText`, not a `textValue` property on every `UIDynamicElement`. For `Button`, `Heading1`/`Heading2`/`Heading3`, card, paragraph, list item, or similar components, create the visual node with structural properties only and add a `UIText` child for the label/value. If readback says `textValue` was skipped, treat that as a failed mutation and avoid repeating it. On `UIText` itself, set `textValue` and optional `comment`; do not set a guessed `mode` property.

Known-good input binding update:

```json
{
  "target": "<ProjectName>.Application.NgxApp.pg:Page.Content.SearchForm.SearchInput",
  "at": "self",
  "mode": "merge",
  "tree": {
    "properties": {
      "DoubleBinding": {
        "mode": "SOURCE",
        "value": "{\"filter\":\"Local\",\"project\":\"<ProjectName>\",\"input\":\"\",\"model\":{\"data\":[{\"localObject\":\"local\"}],\"path\":\"?.searchQuery\",\"prefix\":\"\",\"suffix\":\"\",\"custom\":\"\",\"useCustom\":false}}"
      },
      "Placeholder": {
        "mode": "PLAIN",
        "value": "Enter search text"
      }
    }
  }
}
```

Known-good button event with backend handoff:

```json
{
  "target": "<ProjectName>.Application.NgxApp.pg:Page.Content.SearchForm.SearchButton",
  "at": "inside",
  "mode": "merge",
  "tree": {
    "name": "SearchClick",
    "className": "ngx.components.UIControlEvent#UIControlEvent",
    "properties": {
      "eventName": "onClick",
      "comment": "Run search"
    },
    "children": [
      {
        "name": "SetLoading",
        "className": "ngx.components.UIDynamicAction#SetLocalAction",
        "properties": {
          "Property": "loading",
          "Value": {
            "mode": "SCRIPT",
            "value": "true"
          }
        }
      },
      {
        "name": "CallSearch",
        "className": "ngx.components.UIDynamicAction#CallSequenceAction",
        "properties": {
          "requestable": {
            "mode": "PLAIN",
            "value": "<ProjectName>.<FacadeSequence>"
          }
        },
        "children": [
          {
            "name": "<requestVariable>",
            "className": "ngx.components.UIControlVariable#UIControlVariable",
            "properties": {
              "comment": "Search query",
              "varValue": {
                "mode": "SOURCE",
                "value": "{\"filter\":\"Local\",\"project\":\"<ProjectName>\",\"input\":\"\",\"model\":{\"data\":[{\"localObject\":\"local\"}],\"path\":\"?.searchQuery\",\"prefix\":\"\",\"suffix\":\"\",\"custom\":\"\",\"useCustom\":false}}"
              }
            }
          },
          {
            "name": "StoreResults",
            "className": "ngx.components.UIDynamicAction#SetLocalAction",
            "properties": {
              "Property": "results",
              "Value": {
                "mode": "SCRIPT",
                "value": "(() => { const body = out.items ? out : (out.contract || out.response || out.object || out); const items = body.items || body.results || body.records || []; return {items: Array.isArray(items) ? items : [], total: body.total || body.total_count || body.count || (Array.isArray(items) ? items.length : 0), query: c8oPage.local?.searchQuery}; })()"
              }
            }
          },
          {
            "name": "SetLoadingFalse",
            "className": "ngx.components.UIDynamicAction#SetLocalAction",
            "properties": {
              "Property": "loading",
              "Value": {
                "mode": "SCRIPT",
                "value": "false"
              }
            }
          }
        ]
      }
    ]
  }
}
```

If a headless client struggles to emit the nested JSON above, build the same shape incrementally instead of continuing to generate a malformed large patch:

1. Create `SearchClick` under the button.
2. Create `SetLoading` under `SearchClick`.
3. Create `CallSearch` under `SearchClick`.
4. Create `vr:<requestVariable>`, `StoreResults`, and `SetLoadingFalse` under `CallSearch`.
5. Read back `CallSearch` and require QNames ending in `.CallSearch.StoreResults` and `.CallSearch.SetLoadingFalse` before proof.

Do not copy the `StoreResults` fallback blindly. After the facade runtime proof, inspect the actual JSON body and set `items` from the proven collection path. Common shapes include raw arrays, `out.items`, `out.transaction.document.object.items`, `out.transaction.document.object.results`, and `out.transaction.document.object.records`. If row bindings later use `record.properties.*`, the stored `items` array must be the array whose elements really contain `properties`.

Known-good Local text binding for an error message:

```json
{
  "target": "<ProjectName>.Application.NgxApp.pg:Page.Content.ErrorIf.ErrorText",
  "at": "self",
  "mode": "merge",
  "tree": {
    "properties": {
      "textValue": {
        "mode": "SOURCE",
        "value": "{\"filter\":\"Local\",\"project\":\"<ProjectName>\",\"input\":\"\",\"model\":{\"data\":[{\"localObject\":\"local\"}],\"path\":\"?.errorMessage\",\"prefix\":\"\",\"suffix\":\"\",\"custom\":\"\",\"useCustom\":false}}"
      }
    }
  }
}
```

Known-good `ForEach` creation. Keep `directiveItemName` and `directiveIndexName` as top-level properties of the `UIControlDirective`; do not put them inside the JSON string for `directiveSource`.

```json
{
  "target": "<ProjectName>.Application.NgxApp.pg:Page.Content.ResultsList",
  "at": "inside",
  "mode": "merge",
  "tree": {
    "name": "ResultsForEach",
    "className": "ngx.components.UIControlDirective#UIControlDirective",
    "properties": {
      "directiveName": "ForEach",
      "directiveSource": {
        "mode": "SOURCE",
        "value": "{\"filter\":\"Local\",\"project\":\"<ProjectName>\",\"input\":\"\",\"model\":{\"data\":[{\"localObject\":\"local\"}],\"path\":\"?.results?.items\",\"prefix\":\"\",\"suffix\":\"\",\"custom\":\"\",\"useCustom\":false}}"
      },
      "directiveItemName": "record",
      "directiveIndexName": "recordIndex"
    }
  }
}
```

After creating or patching a `ForEach`, immediately read it back with `properties:"all"`. The readback must show `directiveName`, `directiveSource`, `directiveItemName`, and `directiveIndexName` as separate properties before any child `UIText` uses `record.*`, `item.*`, or another iterator name. If only `directiveName` and `directiveSource` were updated, patch `directiveItemName` and `directiveIndexName` on the directive itself before continuing.
Known-good `If` directive update. `directiveExpression` is a scriptable Java string, not a `MobileSmartSourceType`; set it as a raw string value, not as `{mode,value}`.

```json
{
  "target": "<ProjectName>.Application.NgxApp.pg:Page.Content.ResultsIf",
  "at": "self",
  "mode": "merge",
  "tree": {
    "properties": {
      "directiveName": "If",
      "directiveExpression": "!local?.loading && !local?.error"
    }
  }
}
```

If `databaseobject-tree-apply` reports `argument type mismatch` on `directiveExpression`, read back the directive and patch `directiveExpression` as a raw string. Do not retry `SCRIPT`, `PLAIN`, or `SOURCE` SmartType wrappers for this property.
16. For conditional visibility, make the `UIControlDirective` the wrapper/parent of the component it controls. Do not put an `If` directive as a child of the component that should disappear; that can compile while leaving the note/progress/list visible at the wrong time.
17. Stay inside the target project. Do not trawl unrelated workspace pages or YAML files for ready-made directive trees unless the task explicitly provides a read-only example project.
18. Start the mobile builder early and treat builder/browser proof as part of the recipe, not as an afterthought.
19. Save after structural and runtime checks.
20. One targeted read, then visible mutation. A pass that only reads, saves, opens the builder, or repeats broad palette discovery without replacing the dominant starter content is a no-op.
21. For starter-derived projects, a pass that creates only a secondary page while the visible entry page still shows the untouched starter body is also a no-op unless the entry route was deliberately switched, saved, and proven.
   - If you create a secondary page for later navigation, you still must either switch the entry route and prove it or update the current visible entry page in the same pass.
   - If attempts to delete `WelcomeCard` leave an empty or commented starter card, stop using empty `replace` patches. Use `databaseobject-delete` on the exact `WelcomeCard` QName, or replace the visible `Page.Content` object at `self` with a complete `UIDynamicElement#Content` subtree containing the real page children and omitting `WelcomeCard`; read back the content subtree before continuing. A `REMOVED` comment or `WelcomeCard1` is still a failed cleanup.
22. Before claiming completion, perform a tree readback self-audit of the page and fix any failed item before final response. A green builder does not override this audit.
23. The self-audit must prove:
   - a real `CallSequenceAction` exists under a page/button event
   - a `UIControlVariable` child passes the search/query value to the facade
   - no page `scriptContent` method calls `this.c8o.callJson`, `this.c8o.callJsonObject`, `fetch`, or an external HTTP client
   - no feature state such as `searchQuery`, `results`, `items`, `loading`, `error`, or `empty` is declared in `Begin_c8o_PageDeclaration`
   - every local used by Local SmartSources or `SetLocalAction` is initialized by `SetLocalAction` in a page-enter `UIPageEvent` such as the default `onDidEnter`
   - the search input uses Binding/`DoubleBinding` sourced from Local `?.searchQuery`
   - the `CallSequenceAction` has its `requestable` property set to the public facade requestable, for example `plain:<ProjectName>.<FacadeSequence>`; a property named `Sequence` is ignored on current trees
   - the `CallSequenceAction` query variable also uses a Local SmartSource `?.searchQuery`; it must not read the DOM or use a script expression such as `document.querySelector(...)`
   - action-owned UI state is written with `SetLocalAction`
   - custom code does not assign `page.local`, `page.local.results`, `page.local.loading`, or similar state directly
   - visible reads of page-local state use Local SmartSource/source mode with empty `prefix` and `suffix`
   - the result surface reads the local/facade result contract with source bindings and displays at least one real contract field, not only an empty container or a generic "results" placeholder
   - the primary data page body is not a `UICustom`/`htmlTemplate` fragment
24. If the readback shows `UICustom#UICustom` as the primary renderer, TypeScript page fields, missing page-enter local initialization, a direct `callJson` call, an input event copying `searchQuery`, a DOM selector used as an action variable, or direct `page.local.*` assignments, delete/replace that shortcut and rebuild with palette objects before any final answer. Do not report the project as done because backend proof, mobile builder proof, or browser smoke is green.

### Mandatory data-page gate
Before the first UI mutation, write the intended tree in terms of Convertigo object types. For a server-backed search/list page, the plan must include all of these:
- the exact visible target page QName, usually `<Project>.Application.NgxApp.pg:Page` for starter imports
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
For any search/list page backed by an HTTP web service, use the same wiring pattern as a normal facade-backed search:
0. Backend facade sequence: when the facade calls an HTTP transaction through `TransactionStep`, follow `convertigo-recipe-http-facade`. Set `TransactionStep.sourceTransaction` to the runtime path such as `Project.Connector.Transaction`, never to a Studio QName such as `Project.cn:Connector.tr:Transaction`. For simple pass-through variables, create a public facade variable with the same object name as the HTTP transaction variable, then create a same-named `StepVariable` under the transaction step with `value` set to that variable name. Do not rename the public variable to a UI label unless facade proof shows the renamed value is forwarded. Do not set `sourceDefinition` to a one-item XPath array such as `["./../vr:<requestVariable>/text()"]` or to an absolute QName such as `["Project.sq:search.vr:<requestVariable>/text()"]`; that shape can be saved but later crashes execution with `NumberFormatException`. Use `sourceDefinition` only when you deliberately have a real producer step priority plus XPath tuple such as `["1780000000000", "./field/text()"]`. Prove with `requestable-execute` that the outgoing HTTP URL, request payload, or returned application data contains the user value; a broad unfiltered response is a failed facade proof even if it contains records.
1. Page state keeps only local UI concerns such as `searchQuery`, `loading`, `error`, and optionally a selected item. Store those concerns in Convertigo locals: input-owned values through palette Binding/`DoubleBinding`, action-owned values through `SetLocalAction`.
2. Create a page-enter `UIPageEvent` that initializes every local used on the page with `SetLocalAction`. Use the current NGX default `viewEvent` (`onDidEnter`) unless the tree already exposes another page-enter enum. For example initialize `searchQuery` to `script:''`, `loading` to `script:false`, `error` to `script:false`, `errorMessage` to `script:''`, `empty` to `script:false`, and `results` to a stable empty contract such as `script:{items:[], total:0, query:''}`. Add any other page local used by Local SmartSources or later `SetLocalAction` nodes to this same initialization event. Do not create page locals named after row fields just to display a result row; those fields should be read from the current `ForEach` item.
   - The page search local is always `searchQuery`. A facade or HTTP request variable may use an upstream parameter name such as `q`, `query`, `filter`, or another provider-specific name, but that name belongs to backend request variables, not page-local state. Do not initialize page locals named after upstream parameters just to make names line up; initialize `searchQuery` and bind the input to `?.searchQuery`.
3. The search input binds its Binding/`DoubleBinding` property directly to the local `?.searchQuery` in `SC`/source mode. Do not add an input `(ionChange)` / `InputChange` event only to copy `event.detail.value` into `searchQuery`. The search button must have a visible child `ngx.components.UIText#UIText` with plain text matching the intended action label; setting guessed label properties on the `Button` itself is often skipped and an empty `ion-button` passes compile but fails browser smoke. The search button event starts by setting `loading`, clearing `error`, and resetting `empty` through `SetLocalAction` nodes. Use a small `UICustomAction` only for validation or normalization that cannot be represented by palette actions.
   - If browser smoke shows the typed query is not reaching the call, do not repair it with `(ionChange)`, `InputChange`, `SetLocalAction(Property=searchQuery)`, or `document.querySelector('ion-input input')`. Read back the `Input` object and the `UIControlVariable` object, then fix their `DoubleBinding`/`varValue` SmartSources so both point to Local `?.searchQuery` in source mode.
   - The page-local input value remains `searchQuery` even if the facade request variable is named after an upstream API parameter such as `q`, `query`, `filter`, or `search`. Keep the `UIControlVariable` object name equal to the facade variable, but keep its `varValue` SmartSource path on `?.searchQuery`.
   - After creating or patching `DoubleBinding`, `Binding`, `varValue`, `directiveSource`, or a Local `textValue`, read the object back. If the YAML shows `MobileSmartSourceType: source:[object Object]` or `beanData` shows `"source:[object Object]"`, the binding is broken. Replace it with the literal source SmartSource string/JSON shape from this recipe; do not continue to UI proof with `[object Object]`.
   - For common NGX page primitives, use existing palette class names, not semantic invented suffixes. Typical class names are `ngx.components.UIDynamicElement#Card`, `#CardHeader`, `#CardTitle`, `#CardContent`, `#Input`, `#Button`, `#DivTag`, `#Heading1`, `#Heading2`, `#Heading3`, `#List`, `#ListItem`, `#Spinner`, plus `ngx.components.UIText#UIText`, `ngx.components.UIControlEvent#UIControlEvent`, `ngx.components.UIControlDirective#UIControlDirective`, `ngx.components.UIDynamicAction#SetLocalAction`, `ngx.components.UIDynamicAction#CallSequenceAction`, and `ngx.components.UIControlVariable#UIControlVariable`. Do not create classes such as `UIDynamicElement#SearchForm`, `UIDynamicElement#ResultsList`, `UIDynamicElement#Heading`, or `UIDynamicElement#UIDynamicElement`; if a class is not in this known set, run `palette-list` on the exact parent once and use the returned className.
4. The next child action is `UIDynamicAction#CallSequenceAction` pointing at the public facade sequence, for example `<Project>.<FacadeSequence>`.
   - With `databaseobject-tree-apply`, set the action property named `requestable`, not `Sequence`.
   - Use plain mode for the requestable value, for example:

```json
{
  "name": "CallSearch",
  "className": "ngx.components.UIDynamicAction#CallSequenceAction",
  "properties": {
    "requestable": {
      "mode": "PLAIN",
      "value": "<ProjectName>.<FacadeSequence>"
    }
  }
}
```

   - After creating the action, read it back. If `requestable` is empty or a property named `Sequence` was skipped, fix the action before adding variables or claiming proof.
   - Do not point the UI at the raw connector transaction after a facade proof fails. Repair the facade and keep the UI requestable on the public facade sequence. A direct transaction proof is not a substitute for a facade contract.
   - The `CallSequenceAction` should call a facade whose response already contains the records or value fields the UI needs. If browser smoke shows `out.transaction.document` only contains `HttpInfo`, `attr`, or other diagnostics, do not keep widening UI-side parsing. Repair the facade contract so it emits application fields directly, then bind/store those shaped fields.
5. Under the call action, add `UIControlVariable` children for the facade variables, using the exact public facade variable names. For simple HTTP pass-through this is usually the same object name as the HTTP transaction variable. Source values from the local `searchQuery` using SmartSource/source mode on `Local` when possible.
   - With `databaseobject-tree-apply`, create `ngx.components.UIControlVariable#UIControlVariable` under the call action.
   - Use the object `name` as the variable name sent to the sequence, for example `name: "<requestVariable>"`.
   - Set `varValue` to the local SmartSource; do not add a separate `varName` property unless tree readback proves that property exists in the current Studio version.
   - The `UIControlVariable` object name and the `varValue` Local path are deliberately different when the facade variable has a provider name. For example, create `CallSearch.vr:q` when the facade variable is `q`, but set its `varValue` to Local `?.searchQuery`. Never set `varValue` to Local `?.q` unless the page already has a deliberate non-search local named `q` for a different reason.
   - Do not create placeholder variable objects such as `queryParam`, `formatParam`, or `limitParam` and then try to set `varName`. If `varName` is skipped, the runtime sends the placeholder object name and the facade receives nothing useful. The object QName must end with `.vr:<requestVariable>`.
   - Do not put `UIControlVariable` as a sibling of `CallSequenceAction` under the event. It must be a child of the call action, so the QName ends like `...CallSearch.vr:<requestVariable>`.
   - Do not use `varValue: "script:this.local?.searchQuery"` for page locals. Use the same Local SmartSource/source JSON used by the input `DoubleBinding`.
   - Scope note: avoid TypeScript page fields and avoid `page.searchQuery` for page-local state. The local SmartSource is the stable representation for both visible widgets and action variables.
   - After creation, read back the child and expect a QName ending in `.vr:<requestVariable>` plus a `varValue` property.
6. Use the failure/error-handler class returned by `palette-list` on the exact parent to map call failures to page error state. On a `CallSequenceAction` parent, current NGX palettes commonly expose `ngx.components.UIActionFailureEvent#UIActionFailureEvent` as "Failure Handler"; on some event parents they expose `ngx.components.UIActionErrorEvent#UIActionErrorEvent`. Use whichever handler class appears in `palette-list` for that exact parent. Do not retry the same rejected handler class on the same parent, and do not place handlers directly under visual `UIDynamicElement` nodes.
   - Do not add ordinary `SetLocalAction(Property=error, Value=script:true)` or `SetLocalAction(Property=errorMessage, ...)` actions as siblings under the click/submit `UIControlEvent`. Sibling actions under an event are generated in a parallel `Promise.all` block and run on every click, even when the backend call succeeds. Put error-state writes only under the failure/error handler returned by the palette, or omit optional error handling until the success path is proven in the browser.
   - Do not read `out.message`, `out.error`, or any other bare `out` value inside failure/error-handler `SetLocalAction` nodes unless the generated code for that exact handler proves the scope. Prefer a static fallback message or a previously initialized local value, then display it through Local SmartSource/source mode on `?.errorMessage`.
7. After successful calls, prefer source bindings from the action output. If the facade returns a raw legacy array shape, a small post-call `UICustomAction` may normalize the response, but it must not perform the backend call.
   - Do not put `SetLocalAction(Value=script:out)` as a sibling of the `CallSequenceAction` under the same `UIControlEvent`. Sibling actions are generated in a parallel `Promise.all` block, so `out` is not the call response. Put success mapping actions as children of the `CallSequenceAction`, or use a small normalizer child under the call.
   - The required success subtree is structural: `SearchButton -> SearchClick -> CallSearch -> [vr:<requestVariable>, StoreResults, SetLoadingFalse]`. It is not enough for the final summary to list `StoreResults` after `CallSearch`; readback must show the `StoreResults` and `SetLoadingFalse` QNames under the `CallSequenceAction` QName. If readback shows `...SearchClick.StoreResults`, delete that action and recreate it under `...CallSearch.StoreResults`.
   - For `SetLocalAction` or any other SmartType property sent with `{ "mode": "SCRIPT" }`, do not include the `script:` prefix inside the `value`. `databaseobject-tree-apply` adds that prefix when it writes the SmartType. Use `{"mode":"SCRIPT","value":"{items: out.items || []}"}`, not `{"mode":"SCRIPT","value":"script:{items: out.items || []}"}`.
   - A `UIControlVariable` child such as `vr:<requestVariable>` is sent to the sequence, but its name is not a JavaScript local inside later child actions. Do not write `Value=script:{items: out.items, query: query}`; the generated TypeScript contains an undefined bare identifier and the UI silently keeps an empty list. If you need to preserve the typed query in result state, read `c8oPage.local?.searchQuery` or omit the `query` field. A safe direct mapping can use `out` for the call response plus `c8oPage.local?.searchQuery` for page-local state.
   - If `loading=true` is set before the backend call and result or empty visibility depends on `!local?.loading`, add another child `SetLocalAction(Property=loading, Value=script:false)` under the same `CallSequenceAction` after the result mapping. A compiled page can still fail browser smoke when data arrives but `loading` never returns to false.
   - A `SetLocalAction(Property=loading, Value=script:false)` under `UIActionFailureEvent` / `UIActionErrorEvent` is only the failure path. It does not reset loading after a successful backend call. Create a separate success-path reset directly under the `CallSequenceAction`, outside the handler.
   - If your self-audit says the reset is missing, create it immediately as the next mutation. Do not continue to mobile-builder proof, final summary, or optional error handling until the success path can leave the loading state.
   - In such small `UICustomAction` code after a `CallSequenceAction`, the generated function receives action context through `props`; use `props.parent.out` for the parent action output. Do not reference bare `out`, bare `parent`, `parent.out`, or `stack`; those produce invalid generated TypeScript in current NGX builds.
   - The normalizer may `resolve(normalized)` and let following palette actions consume that value. It must not assign `page.local.*` directly; write `results`, `empty`, `loading`, and errors with `SetLocalAction` nodes.

Minimal compliant local-state UI wiring:
- page-enter `UIPageEvent` (`onDidEnter` by default) -> `SetLocalAction` for every page local, including `searchQuery`, `loading`, `error`, `errorMessage`, `empty`, and `results`
- input `DoubleBinding` / Binding -> Local SmartSource `?.searchQuery` in source mode
- no input `(ionChange)` / `InputChange` -> `SetLocalAction(Property=searchQuery)` copy action
- search button -> `UIText` child with the intended action label; then `(click)` -> `SetLocalAction(Property=loading, Value=script:true)` -> `CallSequenceAction`
- `CallSequenceAction.vr:<requestVariable>.varValue` -> Local SmartSource `?.searchQuery`, not `script:this.local?.searchQuery` and not `script:document.querySelector(...)`
- when `<requestVariable>` is provider-specific, for example `q`, the object QName may end in `.vr:q` but the Local source path still remains `?.searchQuery`
- `CallSequenceAction.requestable` -> plain requestable name such as `<ProjectName>.<FacadeSequence>`, not a skipped `Sequence` property and not an empty `requestable`
- after success -> child action(s) under `CallSequenceAction`, not sibling actions under the click event. Prefer storing the explicit facade contract, for example `script:{items: out.items || out.contract?.items || out.response?.items || [], total: out.total || out.contract?.total || out.response?.total || 0, query: c8oPage.local?.searchQuery}`. A sibling `SetLocalAction(Value=script:out)` consumes the click/parallel action scope and does not work.
- Make the success reset part of the minimum backend-to-list path, not optional polish. The required order is `CallSequenceAction` child `StoreResults` first, then child `SetLoadingFalse` second, then readback/proof. If `ResultsIf`, `EmptyIf`, or another visibility branch contains `!local?.loading`, do not run final `project-save`, `mobile-builder-open`, or browser proof until that success reset exists.
- Treat failure-handler resets as separate from success resets. Readback must show one success-path `SetLoadingFalse` directly under the `CallSequenceAction`; a reset nested under `UIActionFailureEvent` / `UIActionErrorEvent` is not sufficient.
- error writes -> only under a `UIActionFailureEvent` / `UIActionErrorEvent` handler for the failing action. Never put `SetLocalAction(Property=error, Value=script:true)` as a normal sibling of `CallSequenceAction` or the search/submit event; it runs unconditionally and can hide successful results.
- Do not leave result state as raw `out` for final UI. If the visible list is bound to `?.results?.items`, the backend success action must store a shape with an `items` array. Prefer `out.items`, `out.contract?.items`, `out.response?.items`, or another explicit facade shape that was proven before UI work. A final page mapper must not contain `out.transaction`, `out?.transaction`, `response?.transaction`, or `transaction.document`; if those paths seem necessary, the facade contract is incomplete and must be repaired before UI work continues.
- The visibility state, empty state, and repeated list must all read the same normalized local contract. A page is invalid when `ResultsIf` or `EmptyIf` tests `local?.results?.items` but the `ForEach` reads `local?.results?.transaction?.document?.array`, or when `StoreResults` writes raw `out`. Normalize once into `results.items`, then bind every result UI object to that contract.
- post-call `SetLocalAction` scripts may use `out` for the call response and `c8oPage.local?.searchQuery` for page-local state; they must not use bare action-variable names such as `query`, `<requestVariable>`, or `searchQuery`
- after any large rebuild -> read back the `SetLocalAction(Property=results)` QName. If it is under `...SearchClick.StoreResults`, it is a sibling and is wrong; delete/recreate it under `...CallSequenceAction.StoreResults`.
- `results` must be written after the backend call, not only initialized on page enter. The result `ForEach.directiveSource` must match the value actually stored. Prefer a normalized `{items,total,query}` local and bind the `ForEach` to `?.results?.items`; raw transport paths such as `?.results?.transaction?.document?.array` are not acceptable final UI bindings.
- result visibility `If` -> separate `UIControlDirective` with raw Angular template string `directiveExpression`, for example `!local?.loading && !local?.error && local?.results?.items?.length > 0`; do not put this expression on the same `UIControlDirective` as `ForEach`, because Angular will generate an invalid combined `*ngFor` expression. Use `local?.<name>` in template directives; reserve `c8oPage.local?.<name>` for generated action scripts.
- result `ForEach.directiveSource` -> Local SmartSource `?.results?.items`, not `script:this.local?.results?.items || []`; set `directiveItemName` to the row variable used by child text, for example `record` when child text uses `record.*` expressions
- if a `ForEach` was already created before the visibility branch, leave it without `directiveExpression` and create a separate `If` wrapper/container, or rely on the empty `items` array to render no rows. Never patch a visibility expression onto the `ForEach` itself.
- after creating a `ForEach`, the next MCP call must be a targeted readback of that directive with `properties:"all"` before adding child row text. This prevents children from binding to `record.*` while the directive silently uses an auto-generated item name.
- counter/loading/value text -> static label object plus a separate Local SmartSource value with empty `prefix` and `suffix`, not a TS ternary over `this.local`
- count, empty, selected, and error display values that read page locals must use Local source SmartSources, not `MobileSmartSourceType: script:...local...`, not `mode:"SCRIPT"` text over `local?.*`, and not `plain:{{ local... }}`. For a count, prefer two text nodes: one static label and one Local SOURCE binding to `?.results?.total`. If the text needs concatenation, write a display string to a local with `SetLocalAction`, initialize it on page enter, and bind that local in source mode. If that is too much for the first pass, omit the count instead of creating a script-bound count sentence.
- `UIText.textValue` may use plain Angular interpolation only for iterator variables from an explicit `ForEach`, such as `{{ record.name }}`. It must not use page-local interpolation such as `{{ local?.results?.total }}`, `{{ local.errorMessage }}`, or `{{ local?.errorMessage || '...' }}`; bind those with Local SOURCE.
- result rows/details show the relevant fields from the facade contract. In a `ForEach`, row text must read the iterator item such as `{{ record.name }}` or another contract field as a plain template expression. Do not use a Local SmartSource path such as `record.name`; that compiles as an invalid page-local path. Local SmartSource/source mode is for page-local collections like `?.results?.items`, not for iterator row fields.
- `UIText` row labels and details use the `textValue` property. Do not add `mode:"PLAIN"` to `UIText`; that property is skipped and should be treated as avoidable authoring noise.
- For long headless UI builds, create the minimum visible backend-to-list path before optional polish: `PageEnter` locals, `Input` binding, `Button` event, `CallSequenceAction`, `UIControlVariable`, child `SetLocalAction(results)` normalized to `{items,total,query}`, `ForEach.directiveSource` on `?.results?.items`, and at least three real row details. Add loading spinners, empty copy, and failure handlers after that path exists and has been read back.
- when the facade payload exposes several useful fields, render at least three distinct details in each repeated result row: a display label/name, one identifier or code-like field, and one additional quantitative, date, location, category, or status field. For nested contracts, use the iterator scope, for example `{{ record.properties.label }}`, `{{ record.properties.id || record.properties.code }}`, and another proven field. Do not hard-code contract-specific field names that were not present in the live facade proof.
- error message text -> Local SmartSource/source mode on `?.errorMessage`, not `plain:{{ local.errorMessage }}`, not `plain:{{ local?.errorMessage || 'fallback' }}`, and not `script:local?.errorMessage || 'fallback'`
- error message fallback text belongs in the failure `SetLocalAction(Property=errorMessage)`, not in `UIText.textValue`. The `UIText` itself should be a pure Local SOURCE read of `?.errorMessage`.
- error/failure handlers must not read `out`, `out.message`, or `out.error` for visible page-local error text. Use a static fallback string in the handler, because handler output scope differs by generated parent.
- after creating error/empty/result directives, read back each `UIControlDirective` with `properties:"all"` and require the properties you intended to set. A successful create with missing directive properties is still incomplete.
- If you create a temporary NGX object and later remove it, delete the exact QName with `databaseobject-delete` using save/refresh enabled, then run/read `mobile-builder-open` or another generated-source refresh before browser proof. A tree readback can be clean while the viewer still serves a stale generated component when deletes were done with `autoSave:false` and `refresh:false`.

This is compliant:
`SearchButton` -> `SearchClick` -> `PrepareSearch` (`UICustomAction`) -> `CallSearch` (`CallSequenceAction`) -> request `UIControlVariable`.

This is non-compliant:
`Page.scriptContent.searchRecords()` calls `this.c8o.callJson(...)`, while `Page.Content` is a single `UICustom` containing raw `<ion-input>`, raw `<ion-button>`, and raw `*ngFor`.

Also non-compliant:
`Page.scriptContent.searchRecords()` calls `this.c8o.callJsonObject('Project.Sequence', vars).async()`, while the submit button is raw template markup. A green builder does not make this pattern acceptable.

Also non-compliant:
`Page.Content.SearchView` is a `UICustom` fragment containing the input, loading/error notes, and result list, even if a palette `SearchButton -> SearchClick -> CallSearch -> query` action chain is nested below it. Replace that fragment with palette objects for the input, text, notes, list shell, result rows, and style classes.

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
- A generated action variable references a bare iterator identifier, for example `vars:{record: record}`, instead of a Convertigo event scope value such as `scope.record`.
- A generated binding turns a page property into a string literal, for example `[value]="'searchQuery'"`.
- A generated template binding references TypeScript page fields such as `searchQuery`, `page.searchQuery`, `loading`, or `this.local?.loading` instead of a Local SmartSource.
- A generated template contains invalid interpolation caused by Local SmartSource affixes, for example `{{Label: local?.result?.fieldName}}`. Use separate static text for labels and keep the SmartSource value unadorned.
- Page `scriptContent` declares state fields such as `searchQuery`, `results`, `items`, `loading`, or `errorMessage`; these must be `SetLocalAction` locals.
- Page locals are first created only after a button click or backend success. They must be initialized in the page-enter `UIPageEvent` with `SetLocalAction` before widgets/directives read them.
- An `If` directive is created under `ErrorNote`, `EmptyNote`, `ProgressBar`, or another component instead of wrapping it; the component stays visible even when the condition is false.
- A search input looks correct visually, but the query variable is repaired with an input event or DOM selector instead of Local SmartSource binding.
- A `CallSequenceAction` is present but its `requestable` property reads back empty because the implementation set a skipped `Sequence` property.
- A `UIControlVariable` is placed under `UIControlEvent` instead of under the `CallSequenceAction`, so the event cannot pass it to the backend call.
- Cleanup uses `databaseobject-tree-apply` with `mode:"replace"` and `children:[]`, `{}`, or child objects containing only `qname`. That does not delete the target object and can create an incoherent tree. Delete exact unwanted nodes with `databaseobject-delete`, or replace with a complete canonical subtree that includes every child to keep. Verify `deleted > 0` or verify by parent readback.
- NGX cleanup deletes an object with `autoSave:false` and `refresh:false`, then browser proof still shows the deleted widget from stale generated sources. Use a saved/refreshed delete for mobile UI nodes and reopen the mobile builder before browser smoke.
- Error-state `SetLocalAction` nodes are created as normal click-event siblings instead of under a failure/error handler. Because event children run in parallel, those actions run on success too and can keep the success list hidden.
- A custom action after a call or failure handler references `out`, bare `parent`, `parent.out`, or `stack` instead of the generated `props.parent.out` context.
- A custom action writes `page.local.results`, `page.local.empty`, `page.local.loading`, or similar state directly instead of resolving a value and using `SetLocalAction`.
- The page method calls the facade with `this.c8o.callJsonObject(...).async()` instead of using `CallSequenceAction`.
- The page compiles but renders empty or only partially because raw Angular directive attributes bypassed Convertigo's NGX scope model.

## Minimum validation proof
- `requestable-execute` proves the facade contract that the UI binds to. For list/search pages, this means the facade response contains shaped application records, not only a raw transaction diagnostic subtree.
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
- If browser smoke triggers the backend call but renders an empty list while facade proof has records only in a raw transaction subtree, the implementation is incomplete. Fix the facade contract and rerun the smoke instead of marking the page done.
- Save must succeed after the final UI mutation.

## Completion checks
- The target page binds to a stable facade contract.
- Loading, empty, and error states are explicit.
- Retry is a real action, not a visual placeholder.
- Static placeholder labels such as `Contacts list placeholder` or `Companies list placeholder` do not count as a usable UX milestone.
- Runtime validation covers the same contract the UI binds to.
- The latest NGX mutations were saved.
