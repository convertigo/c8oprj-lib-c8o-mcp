# Convertigo Recipe: Extend a Fresh Starter Project

## When to read this
Read this for new POCs, demos, or benchmarks that start from a marketplace starter such as `template_ngxBuilderIonic`.

## What this guide covers
- How to use a starter project as the fast path instead of starting from a blank tree.
- How to extend the starter safely with backend, integration, and UI work.
- How to avoid starter-specific coupling.

## Mandatory workflow

### Golden path
1. Import `template_ngxBuilderIonic` under the exact requested project name unless the task or live catalog explicitly names another starter.
2. Confirm the project exists and is the only mutation target.
3. Add the minimal backend facade first.
4. Add connector or transaction work second.
5. If the UI will display backend, HTTP web-service, SQL, or FullSync results, read `convertigo://resources/convertigo-recipe-ngx-data-page` before any page mutation.
6. Add or extend the UI page third, starting with the actual visible entry page instead of leaving the default starter body dominant.
7. Validate runtime and save.

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

### Common failure modes
- Agent spends too long discovering projects instead of using the prepared starter.
- Agent guesses a marketplace starter name instead of importing `template_ngxBuilderIonic` or using `marketplace-list`.
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
