# Viewer readiness and error diagnosis

Read when: Viewer readiness and error diagnosis. Summary: `convertigo://guides/common`.
Previous: `convertigo://guides/common/auth`. Next: `convertigo://guides/common/reveal`.

---

## Viewer and mobile builder rule

- Starting the viewer is the agent's decision, not the user's. As soon as frontend work is known to be part of the task, call `mobile-builder-open` with `wait=false` so the viewer starts while you keep mutating.
- In dev, `mobile-builder-open` serves the live app from the viewer root. Open `viewerHomeUrl`, never `viewerBaseUrl`: on some engines the base URL serves the update page, which reloads every second. In prod the application URL is `.../DisplayObjects/mobile/home`; do not open `DisplayObjects/mobile/...` against the live HMR viewer.
- Do not issue a state-only call before the first asynchronous launch. If the launch reports a Node download, npm install, or cold Angular build, finish useful mutations and make one waited call with `stateOnly:true, wait:true, timeoutSec:180` instead of repeated 30-second polls. Never wait with shell `sleep` or PowerShell delays.
- If a state-only call returns `status:"stopped"`, do not poll again: call `mobile-builder-open(stateOnly=false, wait=false)` once, continue other work, then poll readiness.
- Use browser control only after `mobile-builder-open` reports both `browserDebugPortMatched:true` and `browserControlReady:true`. A `browserControlTargetUrl` of `about:blank` means the loader is still building.
- Studio JxBrowser exposes one existing visible page over CDP, not a normal multi-tab browser. Reuse the current page; do not create, open, close, select, or navigate tabs.
- In the Electron Studio, `browserControlHint` names its agent browser: one page, `about:blank` until you navigate it. Once `status` is `ready`, navigate that page yourself to `viewerHomeUrl` (the application on the engine, never the development server port) with the Playwright navigate tool, then snapshot, click and evaluate on it. Never open a new tab (not supported) or close it; `browserDebugPortMatched` is always true there.
- If the builder reports `browserControlReady:true` but the browser-control tools are missing, disabled, stale, or attached to another URL, stop the browser proof and report that the managed browser configuration must be refreshed. Do not work around it with Node scripts, raw CDP, or another browser.
- The three rules above apply to a managed client, whose host attaches Playwright to the Studio JxBrowser and sends `X-Convertigo-Viewer-Debug-Port` (`browserDebugPortRequested` > 0). When `browserDebugPortRequested` is 0, no managed browser exists for this client: follow `browserControlHint` and smoke the viewer by navigating your own browser tool to `viewerHomeUrl`, in a profile that holds no session of another Studio on localhost.
- If `mobile-builder-open` reports `compile_error`, treat it as a source-object or generator issue and fix the Convertigo source. Do not patch generated runtime sources.
- The dev viewer is not a deployable build. Before a deployment or an export for a server, once the dev build is green, run `mobile-builder-build({project})`: it writes the production build to `DisplayObjects/mobile`, which a deployed project serves (without it the deployed app shows "Not built"). While it answers `running`, call it again with its `buildId`; when it answers `failed`, fix the source objects its `errors` name and build again. When it answers `unsupported` (an engine without the production build entry point), tell the user to click Build in the Studio's Build panel (Build locally > Production in the Eclipse application editor) before deploying, and say so in the final report.
- If builder diagnostics are insufficient, make one focused `log-view({project:"<targetProject>",level:"error",limit:40,timeoutMs:0})` call. Do not issue separate error and warning scans, and avoid broad `log-view` in automation loops.

