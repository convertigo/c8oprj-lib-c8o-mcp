# Viewer proof, pages and action paths

Read when: Viewer proof, pages and action paths. Summary: `convertigo://guides/ngx`.
Previous: `convertigo://guides/ngx/presentation`. Next: `convertigo://guides/ngx/events`.

---

- Pass the `viewerHomeUrl` as `url` (with the route of the first page to check), one plain-language path per user journey through the new pages (open the list, create or edit, read the result), the acceptance criteria as `checks` with the exact expected texts, expected values as `hints`, and in a Studio the demo account as `signInAs`: the browser is signed in as that account without its password, so the paths start after the sign-in. Test the sign-in page itself only when the change is about it, with credentials the user gave.
- Its vision sub-agent drives the viewer, looks at every page it reaches and reports failed checks and visual defects: texts glued together without a separator, overlapping or cut-off elements, missing accents, empty or unreadable areas, raw technical values. Next to them it gives `designSuggestions`, an aesthetic review (hierarchy, alignment, density, contrast, consistency, color): advice that never fails a check.
- Fix what it reports in the source objects, rebuild, and verify the affected paths again. Apply the design suggestions that fit the app. Do not drive the page click by click yourself.
- Once the paths pass, run the finishing pass: `browser-verify` with `design: true` and the `pages` users see most (Finishing pass in `convertigo://guides/ngx/design`), fix its `design.toFix`, and check the failed pages once more.
- Only when no verifier is available: save a screenshot with `browser_take_screenshot({filename:"check-<page>.png"})` and, if your model cannot read images (GLM models of the Convertigo gateway), ask `image-describe` about readability, glued, cut-off or overlapping texts and empty areas.

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
- External HTTP/SQL/service data must flow through Convertigo backend objects first: connector or source object, requestable transaction/sequence, then a stable public business sequence.
- The NGX page must call that business sequence with the palette `UIDynamicAction#CallSequenceAction`.
- Do not use browser `fetch`, ad hoc HTTP clients, or direct `this.c8o.callJson()` from page TypeScript/custom actions for normal data loading when a `CallSequenceAction` can express the call.
- Do not place the backend call inside a freeform wrapper merely to avoid modeling the action stack.

### Retry path
Retry must be a real action path:
- not only a visible button
- not only a label
- not only a placeholder event with no backend call

The benchmark should be able to point to the actual action chain that retry executes.
