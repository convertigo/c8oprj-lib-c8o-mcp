# Convertigo Recipe: Extend a Fresh Starter Project

## When to read this
Read this for new POCs, demos, or benchmarks that start from a marketplace starter such as `template_ngxBuilderIonic`.

## What this guide covers
- How to use a starter project as the fast path instead of starting from a blank tree.
- How to extend the starter safely with backend, integration, and UI work.
- How to avoid starter-specific coupling.

## Mandatory workflow

### Golden path
1. Import `template_ngxBuilderIonic` under the exact requested project name unless the task or live catalog explicitly names another starter. The canonical call is `marketplace-import({"project":"template_ngxBuilderIonic","importedProjectName":"<targetProject>"})`; do not guess aliases or argument names.
2. Confirm the project exists and is the only mutation target.
3. Start the viewer once with `mobile-builder-open({"project":"<targetProject>","wait":false})`. Do not run a state-only readiness check before this launch.
4. Add the minimal backend facade first.
5. Add connector or transaction work second.
6. If the UI will display backend, HTTP web-service, SQL, or FullSync results, read `convertigo://resources/convertigo-recipe-ngx-data-page` before any page mutation.
7. Add or extend the UI page third, starting with the actual visible entry page instead of leaving the default starter body dominant.
8. After useful mutations are complete, make one waited state check. If the first launch reports Node download, npm install, or a cold Angular build, use `mobile-builder-open({"project":"<targetProject>","stateOnly":true,"wait":true,"timeoutSec":180})` instead of repeated 30-second polls.
9. Validate runtime and save.

### What the starter is for
The starter gives you:
- a valid project structure
- a working NGX app root
- a faster path to visible UI work
- fewer object-creation decisions at the beginning

The starter is not a reason to inherit its demo behavior blindly.
For fresh NGX projects in the current MCP flow, the starter import is the supported path. Do not waste bootstrap time asking the human to choose between “starter” and “blank NGX structure” unless another creation path is explicitly available.
When no starter is explicitly named, use `template_ngxBuilderIonic`. Do not guess names such as `NGXAppStarter`; if import fails, call `marketplace-list` and retry with a real listed project.

### Extension rules
- Keep new work under the imported benchmark or POC project only.
- Reuse existing app shell and page structure where it helps speed.
- Replace or extend demo placeholders with stable facade-backed structures.
- Treat the visible starter entry page as the first UI target. In the default starter, this is usually `Application.NgxApp.pg:Page` and its `Page.Content` subtree.
- Before changing a page `scriptContent`, read it with `properties:"all"`, preserve the complete existing string and every `Begin_c8o_...` / `End_c8o_...` section, then edit only the intended section. `mode:"merge"` replaces the whole string property; it does not merge script sections. Erasing template imports or generated event functions causes broad compile failures.
- Every non-empty NGX `identifier` becomes an Angular/TypeScript reference and must match `[A-Za-z_$][A-Za-z0-9_$]*`, for example `clockDisplay`, never `clock-display`.
- `databaseobject-tree-apply` takes its target QName in `target`, never in `qname`.
- Common periodic-state objects do not require palette rediscovery: use `UIPageEvent#UIPageEvent.viewEvent` with `UICustomAction#UICustomAction.actionValue`, keep state in `page.local`, update change detection in the same callback, and clean up through a supported page-leave event.
- Do not declare framework lifecycle methods such as `ngOnDestroy` in page `scriptContent` unless the live Convertigo contract explicitly provides that extension point. Use a supported page event for cleanup instead of guessing a generated method name.
- When a timer, subscription, or external callback changes page state, mutate the state and call the supported page change detector in the same callback before claiming the UI updates live.
- Keep contracts, not starter internals, as the long-term reference.
- For facade-backed pages, the starter recipe is only the project bootstrap. The page implementation rules come from the NGX data-page recipe, and that recipe overrides any temptation to use one `UICustom` fragment or page `scriptContent` transport.
- A starter page that searches or displays content from an HTTP web service must call the facade through `UIDynamicAction#CallSequenceAction` and pass query/filter values with `UIControlVariable`. Open data APIs are only one example. Do not implement the search by adding a page method that calls `this.c8o.callJsonObject(...).async()` or `this.c8o.callJson(...)`.
- The visible form, submit button, loading/empty/error states, and result list must be palette objects/directives. A compiling `UICustom#UICustom` fragment is not an acceptable shortcut for starter extension when palette objects can model the page.

### Why this is the right way
- It dramatically reduces setup search.
- It gives a visible application surface quickly for demos.
- It avoids wasting agent time on root scaffolding that Convertigo already knows how to provide.

## Recommended MCP tools
- `marketplace-list`
- `marketplace-import`
- `project-list`
- `databaseobject-tree-get`
- `palette-list`
- `palette-describe`
- `databaseobject-tree-apply`
- `batch-call`
- `mobile-builder-open`
- `project-save`

## Anti-patterns / do not do
- Do not mutate random existing workspace projects when the runner or planner already prepared a starter.
- Do not assume the starter's demo data model is the public contract for the new feature.
- Do not rebuild the root NGX structure from scratch if the starter already provides it.
- Do not leave the default home page visually untouched while creating only secondary pages and claiming visible frontend progress.
- Do not use `UICustom#UICustom` plus raw Angular/Ionic markup as the main page body for data-backed starter pages.
- Do not put backend calls in page `scriptContent`; use a palette `CallSequenceAction` chain.
- Do not use shell, PowerShell, `rg`, or filesystem scans to rediscover MCP signatures or examples already present in callable schemas and this recipe. Never recursively search a drive root, user profile, workspace root, or generated frontend tree for browser/build diagnostics; use `mobile-builder-open`, `log-view`, and the managed Playwright target.
- For the Studio JxBrowser proof, use `playwright.browser_tabs({action:"list"})`, `playwright.browser_find({text:"<visible text>"})`, and `playwright.browser_evaluate({function:"..."})` only when timing or DOM state must be measured. If builder diagnostics are insufficient, use one focused `log-view({project:"<targetProject>",level:"error",limit:40,timeoutMs:0})` call.

### Common failure modes
- Agent spends too long discovering projects instead of using the prepared starter.
- Agent guesses a marketplace starter name instead of importing `template_ngxBuilderIonic` or using `marketplace-list`.
- Agent checks an inactive viewer before launching it, then repeats short readiness polls during a cold Node/npm build.
- Agent overwrites the starter page `scriptContent`, removing template imports or event functions.
- Agent uses HTML-style dashed values in NGX `identifier` properties and breaks generated TypeScript.
- New work leaks into the wrong workspace project.
- Starter demo structure is copied without replacing contract assumptions.
- The builder is green but the page is a raw `UICustom` fragment, so the Convertigo NGX tree does not expose the feature controls and action chain.
- A page method calls the facade directly from TypeScript, bypassing `CallSequenceAction` and `UIControlVariable`.
- A secondary page is created while the default visible entry page still contains the starter body.

## Minimum validation proof
- Project import or project existence is explicit.
- The target project name is used consistently in writes and validation.
- Runtime proof shows the new behavior in the imported project, not in an unrelated workspace project.
- For backend-backed UI, tree readback shows `CallSequenceAction` and `UIControlVariable` under a real page event.
- Tree readback does not show the primary data page body as `ngx.components.UICustom#UICustom` or `htmlTemplate`.

## Completion checks
- Only the target starter-derived project was mutated.
- New backend and UI behavior lives inside the imported project.
- The project is in a reusable state for the next specialist or benchmark step.
