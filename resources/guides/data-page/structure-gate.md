# Mandatory palette-modeled data-page gate

Read when: Mandatory palette-modeled data-page gate. Summary: `convertigo://guides/data-page`.
Previous: `convertigo://guides/data-page/proof-gate`. Next: `convertigo://guides/data-page/search-contract`.

---

21. For starter-derived projects, a pass that creates only a secondary page while the visible entry page still shows the untouched starter body is also a no-op unless the entry route was deliberately switched, saved, and proven.
   - If you create a secondary page for later navigation, you still must either switch the entry route and prove it or update the current visible entry page in the same pass.
   - If attempts to delete `WelcomeCard` leave an empty or commented starter card, stop using empty `replace` patches. Use `databaseobject-delete` on the exact `WelcomeCard` QName, or replace the visible `Page.Content` object at `self` with a complete `UIDynamicElement#Content` subtree containing the real page children and omitting `WelcomeCard`; read back the content subtree before continuing. A `REMOVED` comment or `WelcomeCard1` is still a failed cleanup.
22. Before claiming completion, perform a tree readback self-audit of the page and fix any failed item before final response. A green builder does not override this audit.
23. The self-audit must prove:
   - a real `CallSequenceAction` exists under a page/button event
   - a `UIControlVariable` child passes the search/query value to the business sequence
   - no page `scriptContent` method calls `this.c8o.callJson`, `this.c8o.callJsonObject`, `fetch`, or an external HTTP client
   - no feature state such as `searchQuery`, `results`, `items`, `loading`, `error`, or `empty` is declared in `Begin_c8o_PageDeclaration`
   - every local used by Local SmartSources or `SetLocalAction` is initialized by `SetLocalAction` in a page-enter `UIPageEvent` such as the default `onDidEnter`
   - the search input uses Binding/`DoubleBinding` sourced from Local `?.searchQuery`
   - the `CallSequenceAction` has its `requestable` property set to the public business sequence requestable, for example `plain:<ProjectName>.<BusinessSequence>`; a property named `Sequence` is ignored on current trees
   - the `CallSequenceAction` query variable also uses a Local SmartSource `?.searchQuery`; it must not read the DOM or use a script expression such as `document.querySelector(...)`
   - action-owned UI state is written with `SetLocalAction`
   - custom code does not assign `page.local`, `page.local.results`, `page.local.loading`, or similar state directly
   - visible reads of page-local state use Local SmartSource/source mode with empty `prefix` and `suffix`
   - the result surface reads the local/business sequence result contract with source bindings and displays at least one real contract field, not only an empty container or a generic "results" placeholder
   - no result-mapping action script contains `out.transaction`, `out?.transaction`, `transaction.document`, `HttpInfo`, or `headers`; if it does, the business sequence contract is incomplete and must be repaired before UI completion
   - no `UIText.textValue` for count, empty, selected, or error page-local state contains `plain:` plus `local?.`, `local.`, or `{{ local`; use static text plus Local SOURCE values instead
   - the primary data page body is not a `UICustom`/`htmlTemplate` fragment
24. If the readback shows `UICustom#UICustom` as the primary renderer, TypeScript page fields, missing page-enter local initialization, a direct `callJson` call, an input event copying `searchQuery`, a DOM selector used as an action variable, or direct `page.local.*` assignments, delete/replace that shortcut and rebuild with palette objects before any final answer. Do not report the project as done because backend proof, mobile builder proof, or browser smoke is green.

### Mandatory data-page gate
Before the first UI mutation, write the intended tree in terms of Convertigo object types. For a server-backed search/list page, the plan must include all of these:
- the exact visible target page QName, usually `<Project>.Application.NgxApp.pg:Page` for starter imports
- one visible input/control object, usually `UIDynamicElement#Input`
- one visible submit/retry button, usually `UIDynamicElement#Button`
- one event on that button/page, `UIControlEvent`
