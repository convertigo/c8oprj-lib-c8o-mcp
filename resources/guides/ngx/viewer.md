# Builder launch and managed browser control

Read when: Builder launch and managed browser control. Summary: `convertigo://guides/ngx`.
Previous: `convertigo://guides/ngx/dependencies`. Next: `convertigo://guides/ngx/proof`.

---

## Mobile builder: use it early, not at the end

### Start it early on UX work
For any task that includes UI work, start `mobile-builder-open` early in the implementation path. Prefer an async warm-up call first:

```json
{"project":"<ProjectName>","wait":false}
```

That opens or reconnects the Studio viewer and returns the current state without blocking on the initial build. Continue backend work, tree inspection, or NGX mutations while the builder starts. Before browser smoke or final proof, call `mobile-builder-open` again with either the normal default wait or a state-only wait:

```json
{"project":"<ProjectName>","stateOnly":true,"wait":true}
```

Use `stateOnly=true` when you only need the current viewer URLs and readiness and do not want to reopen, start, or restart the builder.

Use Playwright or browser-control MCP only when the waited/state-only result reports `browserControlReady:true`. A complete UI loop is: start with `mobile-builder-open(wait=false)`, keep inspecting or mutating while the builder may still be `building`, poll with `mobile-builder-open(stateOnly=true, wait=true)`, then attach Playwright or the browser-control MCP to the returned JxBrowser debug endpoint and verify the actual feature in that viewer. If `browserControlTargetUrl` is `about:blank`, the Studio loader is still building; keep polling instead of using browser automation. Before browser smoke, inspect the current browser target and confirm it is the returned viewer, not `about:blank` or another URL. Do not replace this with a separate browser tab when the Studio JxBrowser endpoint is available. If the MCP browser tools are unavailable, disabled, stale, or attached to another endpoint, report the managed Playwright MCP configuration problem instead of using Node scripts, raw CDP, or a separate browser. Exception: when `browserDebugPortRequested` is 0, this client has no managed browser at all; follow `browserControlHint` and navigate your own browser tool to `viewerHomeUrl`.

Why this is the right way:
- the user in Studio sees the application evolve live
- build errors surface earlier
- the agent stops guessing whether the tree is actually viable

### What to do when the viewer is unreachable
If `viewerUrl` is unreachable or browser smoke fails:
1. inspect the builder logs returned by the latest waited `mobile-builder-open`
2. if still unclear, call `log-view`
3. decide whether:
   - the build failed
   - the viewer is unavailable
   - the page exists structurally but runtime proof is missing

Do not conclude success from tree shape alone when the build logs say otherwise.

### Driving the viewer with Playwright
- Ionic keeps the pages it navigated away from in the DOM, hidden: a locator on the whole document finds their copies first and times out or acts on a hidden page. Scope every locator to the page shown, `page.locator('.ion-page:not(.ion-page-hidden)').last()`, and wait for its title before acting.
- `ion-checkbox`, `ion-radio` and `ion-toggle` keep their input in a shadow root: a click on the element can time out. Click it through the page, `locator.evaluate(e => e.click())`, or click its label.
- The options of an `ion-select` and the buttons of an alert open in an overlay attached to `body`, outside the page: look for them in `ion-popover`, `ion-alert` or `ion-action-sheet`.
- A `canvas` of 100×100 (Ionic's ripple effect in items, buttons and the options of a select popover, or a loading layer right after a navigation) can cover the element: Playwright reports that it intercepts pointer events and waits until its timeout, 30 s. Do not retry the same click: click through the page, `locator.evaluate(e => e.click())`.
- A file that the page downloads (an export) is saved by the managed Playwright in `.playwright-mcp/downloads/` under its working directory, without any dialog: read it there. In a viewer that no managed Playwright drives, a download opens the Studio's native Save dialog, which blocks the whole Studio, the MCP included, until someone closes it.

