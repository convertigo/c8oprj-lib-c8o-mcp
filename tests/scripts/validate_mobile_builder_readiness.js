#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const source = fs.readFileSync(path.join(root, "js/mobile_builder_common.js"), "utf8");
const openSource = fs.readFileSync(path.join(root, "js/tools_mobile_builder_open.js"), "utf8");
const schemaSource = fs.readFileSync(path.join(root, "js/schema_overrides.js"), "utf8");
const sandbox = {
  C8O: {},
  include() {},
  console
};

vm.runInNewContext(source, sandbox, { filename: "mobile_builder_common.js" });

const classify = sandbox.C8O.mobileBuilderCommon.classifyReadiness;
const isCompileErrorMessage = sandbox.C8O.mobileBuilderCommon.isCompileErrorMessage;
const pushCompileError = sandbox.C8O.mobileBuilderCommon.pushCompileError;
const hasViewerReadyEvidence = sandbox.C8O.mobileBuilderCommon.hasViewerReadyEvidence;
const browserHasRenderedDocument = sandbox.C8O.mobileBuilderCommon.browserHasRenderedDocument;
const deriveViewerHomeUrl = sandbox.C8O.mobileBuilderCommon.deriveViewerHomeUrl;

assert.strictEqual(typeof classify, "function");
assert.strictEqual(typeof isCompileErrorMessage, "function");
assert.strictEqual(typeof pushCompileError, "function");
assert.strictEqual(typeof hasViewerReadyEvidence, "function");
assert.strictEqual(typeof browserHasRenderedDocument, "function");

const stateOnlyGuard = openSource.indexOf("if (stateOnly === true)");
const treeReload = openSource.indexOf("view.reloadDatabaseObject(appComponent)");
const activeEditorLookup = openSource.indexOf("treeObject.activeEditor(false)");
const debugPortMutation = openSource.indexOf("editor.setBrowserDebugPort(browserDebugPort)");
assert.ok(stateOnlyGuard >= 0 && treeReload > stateOnlyGuard && activeEditorLookup > stateOnlyGuard && debugPortMutation > stateOnlyGuard,
  "state-only probes must return before refreshing the tree or opening the Studio editor");
assert.match(openSource, /editorRefs\[editorIndex\]\.getEditor\(false\)[\s\S]*?No active NGX editor found; no launch requested[\s\S]*?return;[\s\S]*?view\.reloadDatabaseObject\(appComponent\)/,
  "state-only probes must inspect only already-open editors");
assert.match(openSource, /pendingBuildTimestamp > 0 &&\s*java\.lang\.System\.currentTimeMillis\(\) < buildSettleDeadline/,
  "an unobserved generated source cycle must stop blocking after the build settle window");
assert.match(openSource, /stateOnlyStopped = stateOnlyValue === true &&\s*snapshot\.failed !== true &&\s*snapshot\.building !== true;/,
  "the waited state-only loop must stop as soon as the builder becomes inactive");
assert.match(openSource, /builderProcessAlive \|\| waitingForRecentLaunch \|\| buildJobActive/,
  "the Studio builder process must keep readiness polling active before a job or viewer URL is visible");
assert.match(openSource, /waitingForRecentLaunch \|\| buildJobActive/,
  "an asynchronous launch request must remain visible to the following state-only poll");
assert.match(openSource, /if \(stateOnly === true\)[\s\S]*?editor\.selectPage\(result\.rootPageSegment\)/,
  "a mutating viewer open must select the application root page after the state-only guard");
assert.match(openSource, /targetTitle\.indexOf\("convertigo flashupdate"\)/,
  "the Studio FlashUpdate target must not be reported as browser-control ready");
assert.match(openSource, /viteOverlay&&viteOverlay\.shadowRoot/,
  "Angular/Vite compiler overlays must be inspected through their shadow DOM");
assert.match(openSource, /loaderHasError=!!viteOverlay/,
  "a visible Vite overlay must classify the viewer as failed");
assert.match(schemaSource, /processAlive:\s*\{ type: "boolean"/,
  "the mobile-builder output schema must expose the runtime process state returned by the tool");
assert.match(schemaSource, /launchRequestedAt:\s*\{ type: "number"/,
  "the mobile-builder output schema must expose the launch timestamp returned by the tool");

assert.strictEqual(
  deriveViewerHomeUrl("http://localhost:4200", "http://localhost:4200/index.html", "dashboard"),
  "http://localhost:4200/dashboard",
  "viewerHomeUrl must follow the actual root page segment"
);

const oversizedCompileResult = { compileErrors: [] };
for (let index = 0; index < 8; index += 1) {
  pushCompileError(oversizedCompileResult, {
    level: "error",
    category: "Studio",
    message: `TS2339-${index} ` + "x".repeat(12000),
    extra: "y".repeat(4000)
  });
}
assert.strictEqual(oversizedCompileResult.compileErrors.length, 4,
  "compile diagnostics must be capped to protect the agent context");
assert.ok(oversizedCompileResult.compileErrors[0].message.length <= 6000);
assert.ok(oversizedCompileResult.compileErrors[0].extra.length <= 1500);
assert.match(oversizedCompileResult.compileErrors[0].message, /diagnostic truncated/);

assert.strictEqual(hasViewerReadyEvidence({}, {}, {
  hasBrowser: true,
  currentUrl: "http://localhost:4200/index.html",
  title: "Convertigo FlashUpdate",
  bodyTextSample: "Launching Application"
}, "http://localhost:4200"), false, "the transient Studio loader is not viewer-ready evidence");

assert.strictEqual(hasViewerReadyEvidence({}, {}, {
  hasBrowser: true,
  currentUrl: "http://localhost:4200/home",
  title: "Clock",
  bodyTextSample: "",
  appRootHydrated: false
}, "http://localhost:4200"), false, "a viewer URL with an empty app-root must not be reported ready");

assert.strictEqual(hasViewerReadyEvidence({}, {}, {
  hasBrowser: true,
  currentUrl: "http://localhost:4200/home",
  title: "Clock",
  bodyTextSample: "",
  appRootHydrated: true
}, "http://localhost:4200"), true, "a hydrated app-root is sufficient for a visual app without text");

assert.strictEqual(
  isCompileErrorMessage("", "NG5002: Parser Error: Unexpected token Intl [plugin angular-compiler]", "error"),
  true,
  "Angular overlay diagnostics must be recognized without an Eclipse job"
);

assert.deepStrictEqual(
  JSON.parse(JSON.stringify(classify({
    viewerReady: true,
    browserControlReady: true,
    reportedBuilding: true
  }))),
  {
    ready: true,
    viewerReady: true,
    browserControlReady: true,
    compileBlocking: false,
    compileState: "unknown",
    readyReason: "browser_control_ready"
  }
);

assert.strictEqual(classify({
  viewerReady: true,
  browserControlReady: true,
  reportedBuilding: true,
  buildActive: true
}).ready, false, "an observed active build must still block a waited call");

assert.strictEqual(classify({
  viewerReady: true,
  browserControlReady: false,
  reportedBuilding: true
}).ready, false, "server mode must not ignore its only building signal");

assert.strictEqual(classify({
  viewerReady: true,
  browserControlReady: true,
  failed: true
}).compileState, "failed");

assert.strictEqual(classify({
  viewerReady: true,
  browserControlReady: true,
  compileSucceeded: true
}).readyReason, "compiled");

assert.strictEqual(classify({
  viewerReady: true,
  generationNoChange: true,
  reportedBuilding: true
}).compileState, "not_required");

assert.strictEqual(classify({
  viewerReady: false,
  browserControlReady: false,
  generationNoChange: true,
  waitingForViewerHydration: true
}).ready, false, "generation_no_change must not bypass viewer hydration");

console.log("mobile builder readiness decision tests passed");

// stateOnly on a live builder with nothing to wait for and a viewer that does not show the app: four waits of 46 s
// answered "building" while a call without stateOnly answered ready at once (usage tests 29/10). The wait stops after
// IDLE_VIEWER_STOP_MS and the answer says to call without stateOnly.
assert.match(openSource, /idleViewerWithoutApp = stateOnlyValue === true && builderProcessAlive && buildJobState\.supported === true &&\s*!buildJobActive && !waitingForGeneration && !waitingForScheduledCycle && !waitingForPendingCycle &&\s*!waitingForViewerReload && !waitingForRecentLaunch && snapshot\.failed !== true && currentViewerReady !== true;/,
  "an idle builder whose viewer does not show the app is recognised in stateOnly mode");
assert.match(openSource, /if \(idleViewerWithoutApp\) \{\s*idleSince = idleSince \|\| java\.lang\.System\.currentTimeMillis\(\);\s*if \(java\.lang\.System\.currentTimeMillis\(\) - idleSince >= IDLE_VIEWER_STOP_MS\) \{[\s\S]*?break;/,
  "the waited stateOnly loop stops once the builder has been idle long enough");
assert.match(openSource, /status === "building" && idleViewerWithoutApp\s*\? \{ tool: "mobile-builder-open", arguments: \{ project: projectName, stateOnly: false, wait: true \} \}/,
  "the answer points to a call without stateOnly");
assert.match(openSource, /var IDLE_VIEWER_STOP_MS = 8000;/);

// selectPage does nothing for the page the editor already has: a blank viewer, or one on a page that shows nothing
// while no build runs, is loaded again from its base URL before the root page is selected (usage tests 29/10).
assert.match(openSource, /if \(viewerShowsNothing\(readBrowserState\(editor\), projectRef\)\) \{\s*editor\.selectPage\(null\);/,
  "a call without stateOnly reloads a viewer that shows nothing");
assert.match(openSource, /function viewerShowsNothing\(browserState, projectRef\) \{[\s\S]*?url === "about:blank"[\s\S]*?readLiveBuildJob\(liveBuildJobName\(projectRef, String\(projectRef\.getName\(\)\)\)\)\.active !== true;/,
  "a page still building is never reloaded");

// The stateOnly answer that pointed to a call without stateOnly was ignored: the agent kept polling and sleeping. An
// idle builder with an open viewer that does not show the app gets its root page loaded once, then the wait goes on.
assert.match(openSource, /if \(!idleViewerReloaded && editorRef != null\) \{\s*idleViewerReloaded = reloadOpenViewer\(editorRef, rootPageSegmentValue\);\s*idleSince = 0;\s*continue;\s*\}\s*break;/,
  "the waited stateOnly loop reloads the open viewer once before it stops");
assert.match(openSource, /function reloadOpenViewer\(editorRef, segment\) \{[\s\S]*?editorRef\.selectPage\(null\);\s*editorRef\.selectPage\(segment \|\| null\);/);
