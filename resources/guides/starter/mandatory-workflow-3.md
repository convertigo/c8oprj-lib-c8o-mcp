# Starter constraints and minimum runtime proof

Read when: Starter constraints and minimum runtime proof. Summary: `convertigo://guides/starter`.
Previous: `convertigo://guides/starter/mandatory-workflow-2`. Next: `convertigo://guides/starter/minimum-validation-proof`.

---

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
- Agent performs broad palette discovery even though the entry-page tree and known primitive contracts already provide every required object shape.
- Agent sends a property patch as top-level `properties` instead of `tree.properties`, causing an avoidable failed mutation cycle.
- Agent combines a deep full-property tree read with a long builder wait, creating a very large response that slows every remaining model turn.
- Agent overwrites the starter page `scriptContent`, removing template imports or event functions.
- Agent uses HTML-style dashed values in NGX `identifier` properties and breaks generated TypeScript.
- New work leaks into the wrong workspace project.
- Starter demo structure is copied without replacing contract assumptions.
- The builder is green but the page is a raw `UICustom` fragment, so the Convertigo NGX tree does not expose the feature controls and action chain.
- A page method calls the business sequence directly from TypeScript, bypassing `CallSequenceAction` and `UIControlVariable`.
- A secondary page is created while the default visible entry page still contains the starter body.
