const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// PCA eval 30/10: the Studio viewer sat on the FlashUpdate launcher of a mobile build (title "Convertigo FlashUpdate",
// "Launching Application / Checking for updates", a black page) while ng serve answered 200. mobile-builder-open
// stateOnly answered "building" for 15 min and the agent polled 20 times; sending the viewer to viewerHomeUrl showed the
// application. The tool now leaves that page once per call and names it in its answer, with forceRestart as next call.

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'js/tools_mobile_builder_open.js'), 'utf8');

function launcherCheck() {
  const start = source.indexOf('  function viewerOnLauncherPage(browserState) {');
  const end = source.indexOf('\n  }\n', start) + 4;
  const sandbox = { lower: v => String(v == null ? '' : v).toLowerCase() };
  vm.createContext(sandbox);
  vm.runInContext(source.slice(start, end), sandbox);
  return sandbox.viewerOnLauncherPage;
}

test('the FlashUpdate launcher page is told apart from the application and the npm install page', () => {
  const onLauncher = launcherCheck();
  assert.equal(onLauncher({ hasBrowser: true, title: 'Convertigo FlashUpdate', currentUrl: 'http://localhost:48934/index.html' }), true);
  assert.equal(onLauncher({ hasBrowser: true, title: '', bodyTextSample: 'Launching Application\nChecking for updates' }), true);
  assert.equal(onLauncher({ hasBrowser: true, title: 'Atelier', bodyTextSample: 'Clients Interventions' }), false);
  assert.equal(onLauncher({ hasBrowser: true, title: '', bodyTextSample: 'Install Angular and Ionic NPM dependencies' }), false);
  assert.equal(onLauncher({ hasBrowser: false, title: 'Convertigo FlashUpdate' }), false);
});

test('the viewer is sent once to the application root page while the dev server answers', () => {
  assert.match(source, /if \(candidateReachable && !viewerLauncherLeft && editorRef != null && viewerOnLauncherPage\(browserState\)\) \{\s*viewerLauncherHome = deriveViewerHomeUrl\(candidateViewerBaseUrl, candidateUrl, rootPageSegmentValue\);\s*if \(viewerLauncherHome\.length && navigateOpenViewer\(editorRef, viewerLauncherHome\)\) \{\s*viewerLauncherLeft = true;/);
  assert.match(source, /function navigateOpenViewer\(editorRef, url\) \{[\s\S]*?readPrivateField\(editorRef, "c8oBrowser"\)[\s\S]*?browser\.loadURL\(url\);/);
});

test('a viewer still on the launcher is named in the answer, with forceRestart as next call', () => {
  assert.match(source, /var viewerOnLauncher = ready !== true && viewerOnLauncherPage\(browserState\);/);
  assert.match(source, /if \(viewerOnLauncher && status !== "compile_error"\) \{\s*message = "The Studio viewer shows the Convertigo FlashUpdate launcher page \("/);
  assert.match(source, /nextAction = \{ tool: "mobile-builder-open", arguments: \{ project: projectName, forceRestart: true, wait: true, timeoutSec: 45 \} \};/);
  const schema = fs.readFileSync(path.join(root, 'js/schema_overrides.js'), 'utf8');
  assert.match(schema, /viewerOnLauncherPage: \{ type: "boolean"/);
  assert.match(schema, /viewerLauncherLeft: \{ type: "boolean"/);
});
