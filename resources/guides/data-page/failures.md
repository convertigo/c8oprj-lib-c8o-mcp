# Anti-patterns and common failure modes

Read when: Anti-patterns and common failure modes. Summary: `convertigo://guides/data-page`.
Previous: `convertigo://guides/data-page/events`. Next: `convertigo://guides/data-page/proof`.

---

## Anti-patterns / do not do
- Do not bind the page to raw connector output.
- Do not use custom code when palette-backed actions can express the same flow.
- Do not use direct frontend transport (`fetch`, direct `this.c8o.callJson()`, `this.c8o.callJsonObject(...).async()`) for backend data that belongs behind a business sequence.
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
