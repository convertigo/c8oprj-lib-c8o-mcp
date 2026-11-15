# Results, loading, error and empty state

Read when: Results, loading, error and empty state. Summary: `convertigo://guides/data-page`.
Previous: `convertigo://guides/data-page/search-call`. Next: `convertigo://guides/data-page/search-iterator`.

---

6. Use the failure/error-handler class returned by `palette-list` on the exact parent to map call failures to page error state. On a `CallSequenceAction` parent, current NGX palettes commonly expose `ngx.components.UIActionFailureEvent#UIActionFailureEvent` as "Failure Handler"; on some event parents they expose `ngx.components.UIActionErrorEvent#UIActionErrorEvent`. Use whichever handler class appears in `palette-list` for that exact parent. Do not retry the same rejected handler class on the same parent, and do not place handlers directly under visual `UIDynamicElement` nodes.
   - Do not add ordinary `SetLocalAction(Property=error, Value=script:true)` or `SetLocalAction(Property=errorMessage, ...)` actions as siblings under the click/submit `UIControlEvent`. Sibling actions under an event are generated in a parallel `Promise.all` block and run on every click, even when the backend call succeeds. Put error-state writes only under the failure/error handler returned by the palette, or omit optional error handling until the success path is proven in the browser.
   - Do not read `out.message`, `out.error`, or any other bare `out` value inside failure/error-handler `SetLocalAction` nodes unless the generated code for that exact handler proves the scope. Prefer a static fallback message or a previously initialized local value, then display it through Local SmartSource/source mode on `?.errorMessage`.
