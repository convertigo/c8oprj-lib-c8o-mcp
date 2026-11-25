// Run: node --test tests/scripts/validate_browser_unreachable.cjs
// With the CDP port of the Studio browser refusing connections, the agent's Playwright failed with
// "connect ECONNREFUSED 127.0.0.1:<port>"; mobile-builder-open answered browserControlReady:false but its hint said to
// poll again, and the agent waited and retried for 5 minutes (feedback reports 25/11). js/browser_reach.js names the
// cause and says that browser proof is impossible in this turn; mobile-builder-open stops waiting for that browser and
// answers browserControlError; browser-verify and the verifier of subagent-run answer it before they start (no run,
// no lock, no design round, no time budget spent).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function reach() {
  const sandbox = { C8O: {} };
  vm.createContext(sandbox);
  vm.runInContext(read('js/browser_reach.js'), sandbox);
  return sandbox.C8O.browserReach;
}

// A Java exception as Rhino hands it to a catch: {javaException} with getClass().getName() and getMessage().
const javaError = (className, message) => ({
  javaException: { getClass: () => ({ getName: () => className }), getMessage: () => message }
});

test('the probe names the cause: refused, no answer, an HTTP status', () => {
  const api = reach();
  const seen = [];
  const refused = api.probe('http://127.0.0.1:39084', 1500, url => { seen.push(url); throw javaError('java.net.ConnectException', 'Connection refused'); });
  assert.deepEqual(JSON.parse(JSON.stringify(refused)), { ok: false, cause: 'connection refused' });
  assert.deepEqual(seen, ['http://127.0.0.1:39084/json/version']);
  assert.equal(api.probe('http://127.0.0.1:39084/json/list', 2000, () => { throw javaError('java.net.SocketTimeoutException', 'Read timed out'); }).cause, 'no answer within 2 s');
  assert.equal(api.probe('http://127.0.0.1:39084', 1500, () => 404).cause, 'HTTP 404 on /json/version');
  assert.equal(api.causeOf(javaError('java.net.http.HttpTimeoutException', 'request timed out'), 1500), 'no answer within 1.5 s');
  assert.equal(api.probe('http://127.0.0.1:39084', 1500, () => 200).ok, true);
  assert.equal(api.probe('', 1500, () => 200).cause, 'no Studio browser for this conversation');
  assert.equal(api.causeOf(new Error('connect ECONNREFUSED 127.0.0.1:39084')), 'connection refused');
});

test('the error and the instruction say what to do instead of waiting', () => {
  const api = reach();
  assert.equal(api.errorText('http://127.0.0.1:39084', 'connection refused'), 'the Studio browser does not answer on 127.0.0.1:39084: connection refused');
  assert.equal(api.hostPort('http://[::1]:39084/json'), '[::1]:39084');
  assert.match(api.INSTRUCTION, /^Browser proof is impossible in this turn: retry at most once, after about 10 s; if the browser still does not answer, stop waiting: prove the backend with requestable-execute and report every page and visual check as NOT verified \(never "fixed", "works" or "build OK"\)\.$/);
  assert.equal(api.refusal('http://127.0.0.1:39084', 'connection refused'),
    'browserControlReady false: the Studio browser does not answer on 127.0.0.1:39084: connection refused. ' + api.INSTRUCTION);
});

test('a browser that does not answer is no sign of a running build: no wait on it', () => {
  const sandbox = { C8O: {}, Packages: {}, java: {}, include() {} };
  vm.createContext(sandbox);
  vm.runInContext(read('js/mobile_builder_common.js'), sandbox);
  const classify = sandbox.C8O.mobileBuilderCommon.classifyReadiness;
  const base = { viewerReady: true, browserControlReady: false, reportedBuilding: true };
  assert.equal(classify(base).ready, false, 'a browser not yet on the app: still building');
  const unreachable = classify(Object.assign({ browserUnreachable: true }, base));
  assert.equal(unreachable.ready, true);
  assert.equal(unreachable.compileBlocking, false);
  assert.equal(classify(Object.assign({ browserUnreachable: true, buildActive: true }, base)).compileBlocking, true, 'a real build is still waited for');
});

test('mobile-builder-open probes the browser the agent drives, stops waiting for it and answers browserControlError', () => {
  const source = read('js/tools_mobile_builder_open.js');
  assert.match(source, /include\("js\/browser_reach\.js"\);/);
  assert.match(source, /if \(browserDebugPortValue > 0\) \{\n\s+return "http:\/\/127\.0\.0\.1:" \+ browserDebugPortValue;/, 'the managed port of the conversation');
  assert.match(source, /browserReach = C8O\.browserReach\.probe\(probeEndpoint, 1500\);/);
  assert.match(source, /browserUnreachable: browserUnreachable,/);
  assert.match(source, /if \(browserUnreachable && readinessDecision\.compileBlocking !== true\) \{\n\s+break;/);
  assert.match(source, /if \(status !== "stopped"\) \{\n\s+checkBrowserReach\(editorState, [^\n]+\n\s+if \(browserUnreachable && browserReach\) \{\n\s+browserControlReady = false;\n\s+browserControlError = C8O\.browserReach\.errorText\(browserReach\.endpoint, browserReach\.cause\);/);
  assert.match(source, /browserControlHint: browserControlError\.length\n\s+\? C8O\.browserReach\.INSTRUCTION/);
  assert.match(source, /builderState\.browserControlError = browserControlError;/);
  assert.match(source, /compileState === "not_required"\) && !browserControlError\.length\) \{\n\s+message = message \+ " To prove what a page shows, call browser-verify/,
    'no browser-verify advice for a browser that does not answer');
  assert.match(read('js/schema_overrides.js'), /browserControlError: \{ type: "string", description: "Only when the Studio browser the agent drives does not answer/);
});

// browser-verify and subagent-run (verifier), with a Studio host whose browser refuses connections.
function verifierWorld() {
  const sources = ['js/subagents.js', 'js/browser_reach.js', 'js/tools_browser_verify.js', 'js/tools_subagent_run.js'].map(read);
  const sandbox = { C8O: { mcpAuth: { authenticateRequest: () => ({}) } } };
  for (const source of sources) vm.runInNewContext(source, sandbox);
  const seen = { newRuns: 0, locks: 0, starts: 0, rounds: 0, probes: 0 };
  const host = {
    readKey: () => 'sk-test',
    readSettings: () => ({}),
    cdpEndpoint: params => sandbox.C8O.browserVerify.normalizeCdpEndpoint(params.browserDebugPort, params.cdpEndpoint),
    probe: function () { seen.probes++; this.lastProbeCause = 'connection refused'; return ''; },
    newRun: () => { seen.newRuns++; return { runId: 'verify-x', outDir: '/ws/subagents/verify-x' }; },
    lock: () => { seen.locks++; return '/lock'; },
    start: () => { seen.starts++; },
    designLedger: { read: () => ({}), write: () => { seen.rounds++; } },
    designSetting: () => '',
    now: () => 1000,
    sleep: () => {}
  };
  return { C8O: sandbox.C8O, host, seen };
}

const REFUSED = /^Error: browserControlReady false: the Studio browser does not answer on 127\.0\.0\.1:39084: connection refused\. Browser proof is impossible in this turn: retry at most once, after about 10 s/;

test('browser-verify answers at once, before a run, a lock or a design round', () => {
  const w = verifierWorld();
  assert.throws(() => w.C8O.browserVerify.run({ browserDebugPort: '39084', url: 'http://localhost:18080/', paths: 'Open the orders' }, w.host), REFUSED);
  assert.throws(() => w.C8O.browserVerify.run({ browserDebugPort: '39084', url: 'http://localhost:18080/', design: true, pages: '["orders"]' }, w.host), REFUSED);
  assert.deepEqual(w.seen, { newRuns: 0, locks: 0, starts: 0, rounds: 0, probes: 2 });
});

test('the verifier of subagent-run answers the same, before it starts', () => {
  const w = verifierWorld();
  assert.throws(() => w.C8O.subagentRun.run({ profile: 'verifier', task: 'Check the orders page', browserDebugPort: '39084',
    inputs: { url: 'http://localhost:18080/', paths: ['Open the orders'] } }, w.host), REFUSED);
  assert.equal(w.seen.newRuns + w.seen.locks + w.seen.starts, 0);
});

test('the guides say it: viewer and proof-results', () => {
  const viewer = read('resources/guides/common/viewer.md');
  assert.match(viewer, /When `mobile-builder-open` answers `browserControlError` .*`connect ECONNREFUSED 127\.0\.0\.1:<port>`, browser proof is impossible in this turn: do not wait, poll or retry in a loop\. Retry `mobile-builder-open\(stateOnly=true\)` at most once, after about 10 s; if the error stays, prove the backend with `requestable-execute` and report every page and visual check as NOT verified/);
  const results = read('resources/guides/common/proof-results.md');
  assert.match(results, /If browser control is unavailable \(`browserControlError`\), report the result as implemented but functionally unvalidated, every page NOT verified\./);
  assert.match(results, /Name every object of `unproven` as not verified, or prove it first\./);
});
