# Visible entry page, actions and starter cleanup

Read when: Visible entry page, actions and starter cleanup. Summary: `convertigo://guides/starter`.
Previous: `convertigo://guides/starter/mandatory-workflow`. Next: `convertigo://guides/starter/mandatory-workflow-3`.

---

- Treat the visible starter entry page as the first UI target. In the default starter, this is usually `Application.NgxApp.pg:Page` and its `Page.Content` subtree.
- Before changing a page `scriptContent`, read it with `properties:"all"`, preserve the complete existing string and every `Begin_c8o_...` / `End_c8o_...` section, then edit only the intended section. `mode:"merge"` replaces the whole string property; it does not merge script sections. Erasing template imports or generated event functions causes broad compile failures.
- Every non-empty NGX `identifier` becomes an Angular/TypeScript reference and must match `[A-Za-z_$][A-Za-z0-9_$]*`, for example `clockDisplay`, never `clock-display`.
- `databaseobject-tree-apply` takes its target QName in `target`, never in `qname`.
- Common periodic-state objects do not require palette rediscovery: use `UIPageEvent#UIPageEvent.viewEvent` with `UICustomAction#UICustomAction.actionValue`, keep state in `page.local`, call `page.ref.detectChanges()` in timer/subscription callbacks, and clean up through a supported page-leave event. Every normal `UICustomAction` completion path must call `resolve(...)` or `reject(...)`; its generated Promise otherwise remains pending and blocks the action chain.
- Keep page-state syntax tied to its execution surface: generated Angular templates use `local.clockTime` or `{{ local.clockTime }}`; page `scriptContent` methods use `this.local.clockTime`; `UICustomAction.actionValue` callbacks use `page.local.clockTime`. Do not use `page.local` in a template or page `scriptContent`, and do not use `this.local` inside an action callback unless that callback contract explicitly binds `this`.
- `UIPageEvent.viewEvent` accepts only these exact enum values: `onWillLoad`, `onDidLoad`, `onWillEnter`, `onDidEnter`, `onWillLeave`, `onDidLeave`, and `onWillUnload`. Do not use Ionic method-like guesses such as `onViewLoaded`, `onViewWillLeave`, `ionViewDidEnter`, or `ngOnDestroy`; an invalid property can otherwise leave the newly created event at its default value.
- For periodic local state, start the timer/subscription from `onDidEnter` (or `onDidLoad` only when initialization must happen once after first render) and clean it up from `onWillLeave` or `onDidLeave`. Read back both event objects with `properties:"all"` and require two distinct accepted `viewEvent` values before saving. A start and cleanup action on the same lifecycle event is a failed implementation because cleanup may run immediately after startup.
- Do not declare framework lifecycle methods such as `ngOnDestroy` in page `scriptContent` unless the live Convertigo contract explicitly provides that extension point. Use a supported page event for cleanup instead of guessing a generated method name.
- When a timer, subscription, or external callback changes page state, mutate the state and call `page.ref.detectChanges()` in the same callback before claiming the UI updates live. Never use `this.c8o.page.detectChanges()`.
- Keep contracts, not starter internals, as the long-term reference.
- For business-sequence-backed pages, the starter recipe is only the project bootstrap. The page implementation rules come from the NGX data-page recipe, and that recipe overrides any temptation to use one `UICustom` fragment or page `scriptContent` transport.
- A starter page that searches or displays content from an HTTP web service must call the business sequence through `UIDynamicAction#CallSequenceAction` and pass query/filter values with `UIControlVariable`. Open data APIs are only one example. Do not implement the search by adding a page method that calls `this.c8o.callJsonObject(...).async()` or `this.c8o.callJson(...)`.
- The visible form, submit button, loading/empty/error states, and result list must be palette objects/directives. A compiling `UICustom#UICustom` fragment is not an acceptable shortcut for starter extension when palette objects can model the page.

### Why this is the right way
- It dramatically reduces setup search.
- It gives a visible application surface quickly for demos.
