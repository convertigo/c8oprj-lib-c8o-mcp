# Runtime evidence and completion checks

Read when: Runtime evidence and completion checks. Summary: `convertigo://guides/data-page`.
Previous: `convertigo://guides/data-page/failures`.

---

- Error-state `SetLocalAction` nodes are created as normal click-event siblings instead of under a failure/error handler. Because event children run in parallel, those actions run on success too and can keep the success list hidden.
- A custom action after a call or failure handler references `out`, bare `parent`, `parent.out`, or `stack` instead of the generated `props.parent.out` context.
- A custom action writes `page.local.results`, `page.local.empty`, `page.local.loading`, or similar state directly instead of resolving a value and using `SetLocalAction`.
- The page method calls the business sequence with `this.c8o.callJsonObject(...).async()` instead of using `CallSequenceAction`.
- The page compiles but renders empty or only partially because raw Angular directive attributes bypassed Convertigo's NGX scope model.

## Minimum validation proof
- `requestable-execute` proves the business sequence contract that the UI binds to. For list/search pages, this means the business sequence response contains shaped application records, not only a raw transaction diagnostic subtree.
- Tree readback proves loading, empty, error, and retry nodes/actions exist.
- Tree readback or generated-output inspection proves repeated data UI uses palette directives, dynamic Angular inputs use source/script binding modes, and backend calls use `CallSequenceAction`.
- Tree readback must show `CallSequenceAction` and `UIControlVariable` under a real NGX event for server-backed search/list pages.
- Tree readback must not show the primary data page body implemented as `ngx.components.UICustom#UICustom` with a large `htmlTemplate`.
- Tree readback must not show the primary data page body implemented as a `UICustom` renderer with nested palette actions; visible form/state/result nodes need to be first-class palette objects.
- Tree readback must show page local initialization in a page-enter `UIPageEvent`, page state updates as `SetLocalAction`, and state reads as Local SmartSources, not `Begin_c8o_PageDeclaration` fields or `script:` bindings to page-local state.
- Page `scriptContent` must not contain direct backend transport such as `this.c8o.callJson`, `this.c8o.callJsonObject`, `fetch`, or external HTTP calls for normal business-sequence-backed loading.
- A final answer may only say the app is complete after the tree readback satisfies the mandatory data-page gate. Builder-ready plus backend-ready is insufficient when the NGX page shape is non-compliant.
- `mobile-builder-open` proves build readiness or exposes the build error.
- Browser smoke proves the happy path when the builder is healthy.
- If browser smoke triggers the backend call but renders an empty list while business sequence proof has records only in a raw transaction subtree, the implementation is incomplete. Fix the business sequence contract and rerun the smoke instead of marking the page done.
- Save must succeed after the final UI mutation.

## Completion checks
- The target page binds to a stable business sequence contract.
- Loading, empty, and error states are explicit.
- Retry is a real action, not a visual placeholder.
- Static placeholder labels such as `Contacts list placeholder` or `Companies list placeholder` do not count as a usable UX milestone.
- Runtime validation covers the same contract the UI binds to.
- The latest NGX mutations were saved.
