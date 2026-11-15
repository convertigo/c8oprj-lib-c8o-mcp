# Diagnose bootstrap, backend and binding failures

Read when: Diagnose bootstrap, backend and binding failures. Summary: `convertigo://guides/vibe`.
Previous: `convertigo://guides/vibe/validation`. Next: `convertigo://guides/vibe/diagnostics-ui`.

---

## Failure signals for the adjustment loop
Update the Vibe adapter resources when Vibe repeatedly fails without user interaction because it:

- does not load `convertigo-vibe-generalist`
- skips MCP resource discovery
- asks the user to restate Convertigo rules already present in shared guides
- calls list/read MCP requestables with the wrong shape or invents requestable names
- mutates generated artifacts instead of source objects
- creates a project name different from the requested name
- misses the selected recipe before mutation
- builds an HTTP web-service business sequence without reading `convertigo-recipe-http-business-sequence`
- abandons a required HTTP web-service integration and returns hard-coded sample data instead of preserving the connector/transaction/business sequence rail
- creates only a secondary page and leaves the visible entry page untouched
- repeatedly fails to create `UIPageEvent`, `UIControlEvent`, `SetLocalAction`, `CallSequenceAction`, or `UIControlVariable`
- stops after announcing a next UI section without making the MCP mutation or producing a final answer
- passes Vibe-prefixed tool names inside `Convertigo_batch-call`
- leaves `CallSequenceAction.requestable` empty after using a skipped `Sequence` property
- passes page-local query values with `script:this.local?.searchQuery` instead of Local SmartSource/source mode
- renames the page search local from `searchQuery` to a provider/business sequence variable name such as `q`
- binds the input or `UIControlVariable` to Local `?.q`, `?.nom`, or another provider-specific local instead of Local `?.searchQuery`
- claims completion with only input/button containers and no `CallSequenceAction` plus `UIControlVariable` backend handoff
- claims completion with a green mobile builder but no visible Local SmartSource/source read of results and no business-sequence-contract fields in the result UI
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
- claims business sequence proof from `status:"ok"` when the payload is metadata-only and contains no application records
- claims HTTP proof from a provider error body such as missing credentials, quota exceeded, login required, HTML documentation, or another payload outside the requested contract
- swaps the requested HTTP integration for a generic search/encyclopedia/autocomplete endpoint whose payload lacks useful records and fields for the requested contract
- needs hidden UI-supplied fixed provider constants for the business sequence to work, instead of proving a self-contained business sequence call with the public input variables
