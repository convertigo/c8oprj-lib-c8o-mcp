// The Studio on the desktop of its one user: the Eclipse Studio (Studio mode) and the Electron Studio, whose engine is a
// desktop Studio without Studio mode (Engine.isDesktopStudio, Convertigo 8.5). Both set up local agents, keep one
// feedback folder and run the owner's sub-agents unconfined; a server, and an 8.4 engine without isDesktopStudio, never.
// node --test tests/scripts/validate_desktop_studio.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const ENGINES = {
  eclipse: { isStudioMode: () => true },
  electron: { isStudioMode: () => false, isDesktopStudio: () => true },
  server: { isStudioMode: () => false, isDesktopStudio: () => false },
  server84: { isStudioMode: () => false }
};
const DESKTOP = ['eclipse', 'electron'];

function functionText(source, name, indent) {
  const match = source.match(new RegExp('\\n' + indent + 'function ' + name + '\\(\\) \\{\\n[\\s\\S]*?\\n' + indent + '\\}\\n'));
  assert.ok(match, name);
  return match[0];
}

test('MCP token page: the local agent setup of a desktop Studio', () => {
  const source = read('js/mcp_auth.js');
  const helpers = functionText(source, 'isStudioMode', '  ') + functionText(source, 'isLocalStudio', '  ');
  for (const kind of Object.keys(ENGINES)) {
    assert.equal(vm.runInNewContext(helpers + 'isLocalStudio();', { Engine: ENGINES[kind] }), DESKTOP.includes(kind), kind);
  }
  assert.match(source, /localSetupAvailable: authorized && isLocalStudio\(\),/);
  assert.match(source, /requireWebAdmin\(contextObject\);\n\s+if \(!isLocalStudio\(\)\) \{\n\s+return createResultError\(\n\s+"local_setup_unavailable"/);
});

function reporting(kind) {
  const sandbox = {
    C8O: { util: { toTrimmedString: v => v == null ? '' : String(v).trim() } },
    include: () => {},
    Packages: { com: { twinsoft: { convertigo: { engine: { Engine: { ...ENGINES[kind], USER_WORKSPACE_PATH: '/ws',
      theApp: { databaseObjectsManager: { symbolsGetValue: () => null } } } } } } } },
    java: { lang: { System: { getenv: () => null } }, io: { File: class { isFile() { return false; } } } },
    context: { httpServletRequest: {} }
  };
  vm.runInNewContext(read('js/reporting.js'), sandbox);
  return sandbox.C8O.reporting;
}

test('Tigo feedback: the desktop Studio keeps its one folder, a server needs its feedback key', () => {
  for (const kind of Object.keys(ENGINES)) {
    const r = reporting(kind);
    assert.equal(r.localStudio(), DESKTOP.includes(kind), kind);
    assert.equal(r._feedbackDirectory(), DESKTOP.includes(kind) ? 'agents/feedback' : '', kind + ': no server feedback key');
  }
  assert.match(read('js/reporting.js'), /var userKey = C8O\.reporting\.localStudio\(\) \? undefined : C8O\.reporting\.requestFeedbackUserKey\(\);/);
});

test('sub-agents: the owner of a desktop Studio runs as studio-owner, a server caller stays shared', () => {
  const source = read('js/subagent_constructor.js');
  const scope = source.match(/\n    host\.executionScope = function \(\) \{\n[\s\S]*?\n    \};\n/)[0];
  const s = { C8O: {} };
  vm.runInNewContext(source, s);
  const owner = { authenticated: true, kind: 'managed', scope: 'mcp:full', user: 'admin' };
  const run = (kind, caller) => vm.runInNewContext('var host = {};' + scope + 'host.executionScope();',
    { Engine: ENGINES[kind], api: s.C8O.constructorRunner, authenticatedCaller: caller });
  for (const kind of Object.keys(ENGINES)) {
    assert.equal(run(kind, owner), DESKTOP.includes(kind) ? 'studio-owner' : 'shared', kind);
    assert.equal(run(kind, { ...owner, kind: 'nocode' }), 'shared', kind + ': a No Code token never');
  }
});

function persistSandbox(kind) {
  const sandbox = {
    include: () => {},
    Packages: { com: { twinsoft: { convertigo: { engine: {
      Engine: ENGINES[kind],
      mobile: { MobileBuilder: { getBuilderOf: () => null } },
      helpers: { BatchOperationHelper: {} }
    } } } } }
  };
  vm.runInNewContext(read('js/databaseobject_persist.js'), sandbox);
  sandbox.C8O.dbo._isMobileObject = () => true;
  return sandbox;
}

test('NGX regeneration after an edit: the desktop Studio asks its builder, a server skips it', () => {
  for (const kind of Object.keys(ENGINES)) {
    const result = persistSandbox(kind).C8O.dbo.triggerMobileBuilderRefresh({}, []);
    assert.equal(result.requested, DESKTOP.includes(kind), kind);
    assert.equal(result.message, DESKTOP.includes(kind) ? 'Skipped: no mobile builder for target' : 'Skipped: Convertigo Studio required', kind);
  }
  const crud = read('js/crud_ui_refresh.js');
  assert.match(crud, /if \(!summary\.studioMode\) \{[\s\S]{0,200}summary\.studioMode = Engine\.isDesktopStudio\(\) === true;/);
  // the Eclipse editor and the Eclipse build job keep Studio mode
  assert.match(read('js/databaseobject_studio.js'), /studioMode = Engine\.isStudioMode\(\) === true;/);
});

test('mobile-builder-open: the web Studio starts its development build through the engine, Eclipse keeps its editor', () => {
  const source = read('js/tools_mobile_builder_open.js');
  const desktop = source.match(/\n  function isDesktopWebStudio\(Engine, studioMode\) \{\n[\s\S]*?\n  \}\n/)[0];
  const start = source.match(/\n  function startWebStudioDevBuild\(projectName, endpoint, restart\) \{\n[\s\S]*?\n  \}\n/)[0];
  for (const kind of Object.keys(ENGINES)) {
    const studioMode = kind === 'eclipse';
    assert.equal(vm.runInNewContext(desktop + 'isDesktopWebStudio(Engine, studioMode);', { Engine: ENGINES[kind], studioMode }), kind === 'electron', kind);
  }
  const calls = [];
  const engineWith = WsBuilder => ({ Packages: { com: { twinsoft: { convertigo: { engine: { admin: { services: { studio: { ngxbuilder: { WsBuilder } } } } } } } } } });
  const run = (box, restart) => ({ ...vm.runInNewContext(start + 'startWebStudioDevBuild("App", "http://localhost:28081/convertigo", restart);', { ...box, restart }) });
  assert.deepEqual(run(engineWith({ startDevBuild: (p, e, r) => { calls.push([p, e, r]); return true; } }), false), { supported: true, started: true, error: '' });
  assert.deepEqual(calls, [['App', 'http://localhost:28081/convertigo', false]]);
  assert.deepEqual(run(engineWith({ startDevBuild: () => false }), false), { supported: true, started: false, error: '' }, 'a build already serves the app');
  assert.deepEqual(run(engineWith({ startDevBuild: () => { throw new Error('no build on this engine'); } }), true), { supported: true, started: false, error: 'no build on this engine' });
  assert.deepEqual(run(engineWith({}), false), { supported: false, started: false, error: '' }, 'an engine without startDevBuild');
  assert.match(source, /\} else if \(webStudio && stateOnlyValue !== true\) \{\n\s+webStudioBuild = startWebStudioDevBuild\(projectName, endpoint, forceRestartValue\);\n\s+launchRequested = webStudioBuild\.started === true;/);
  assert.match(source, /if \(studioMode && stateOnlyValue !== true && !launchedFromEditor && !reusedExistingBuilder\) \{\n\s+MobileBuilder\.initBuilder\(projectRef\);\n\s+startBuildWithWsBuilder\(projectName, endpoint\);/, 'the Eclipse path is unchanged');
  assert.match(source, /if \(webStudioBuild\.supported !== true \|\| webStudioBuild\.error\.length\) \{\n\s+waitValue = false;\n\s+timeoutSecValue = 0;/, 'nothing to wait for on an older engine');
  assert.ok(source.indexOf('waitValue = false;') < source.indexOf('var deadline = startedAt + (timeoutSecValue * 1000);'), 'before the deadline is computed');
  const schema = read('js/schema_overrides.js');
  assert.match(schema, /webStudio: \{ type: "boolean"/);
  assert.match(schema, /webStudioBuild: nullableSchema\(closedObjectSchema\(\{\n\s+supported: \{ type: "boolean"/);
});

test('mobile-builder-open reads the development build of the web Studio from its engine (devBuildState)', () => {
  const source = read('js/tools_mobile_builder_open.js');
  const reader = source.match(/\n  function readWebStudioDevBuild\(projectName\) \{\n[\s\S]*?\n  \}\n/)[0];
  const box = WsBuilder => ({ trim: v => String(v ?? '').trim(), Packages: { com: { twinsoft: { convertigo: { engine: { admin: { services: { studio: { ngxbuilder: { WsBuilder } } } } } } } } } });
  const read1 = WsBuilder => { const r = vm.runInNewContext(reader + 'readWebStudioDevBuild("TigoApp");', box(WsBuilder)); return r === undefined ? r : JSON.parse(JSON.stringify(r)); };
  assert.equal(read1({}), undefined, 'an engine without devBuildState');
  assert.deepEqual(read1({ devBuildState: () => null }), { state: 'none' });
  assert.deepEqual(read1({ devBuildState: () => JSON.stringify({ state: 'serving', phase: '', compiled: 'success', port: 48046,
    url: '/convertigo/projects/TigoApp/DisplayObjects/dev48046/', localUrl: 'http://localhost:48046/convertigo/projects/TigoApp/DisplayObjects/dev48046/' }) }),
    { state: 'serving', phase: '', compiled: 'success', port: 48046, url: '/convertigo/projects/TigoApp/DisplayObjects/dev48046/',
      localUrl: 'http://localhost:48046/convertigo/projects/TigoApp/DisplayObjects/dev48046/', errors: [] });
  assert.deepEqual(read1({ devBuildState: () => JSON.stringify({ state: 'serving', phase: '', compiled: 'failed', port: 1,
    errors: ["src/app/pages/companydetail/companydetail.ts:317:107: TS2304: Cannot find name 'id'."] }) }).errors,
    ["src/app/pages/companydetail/companydetail.ts:317:107: TS2304: Cannot find name 'id'."], 'the errors of the last compilation');
  assert.equal(read1({ devBuildState: () => '{not json' }), undefined);
  // the readiness of the web Studio: served (compiled success, no phase), failed, or still installing/building
  const refresh = source.match(/\n    function refreshWebStudioState\(devState\) \{\n[\s\S]*?\n    \}\n/)[0];
  const engineError = source.match(/\n  function engineCompileError\(text\) \{\n[\s\S]*?\n  \}\n/)[0];
  const run = (devState, launchRequested = true) => {
    const ctx = { devState, launchRequested, startedAt: Date.now(), BUILDER_STARTUP_GRACE_MS: 120000, launchState: null, projectName: 'TigoApp', logsLimitValue: 40,
      collectBuilderLogs: () => ({ compileErrors: [{ message: 'TS2304' }], lines: [], query: {} }), java: { lang: { System: { currentTimeMillis: () => Date.now() } } },
      snapshot: null, readinessDecision: null, webStudioDevBuild: null };
    const ready = vm.runInNewContext('var snapshot, readinessDecision, webStudioDevBuild;' + engineError + refresh + 'var r = refreshWebStudioState(devState); ({ r, snapshot, readinessDecision });', ctx);
    return { ready: ready.r, snapshot: ready.snapshot, decision: ready.readinessDecision };
  };
  const served = run({ state: 'serving', phase: '', compiled: 'success', port: 48046, localUrl: 'http://localhost:48046/x/' });
  assert.equal(served.ready, true);
  assert.equal(served.snapshot.openUrl, 'http://localhost:48046/x/');
  assert.equal(served.decision.compileState, 'success');
  const installing = run({ state: 'serving', phase: 'installing', compiled: '', port: 48046, localUrl: '' });
  assert.equal(installing.ready, false);
  assert.equal(installing.snapshot.building, true);
  const rebuilding = run({ state: 'serving', phase: 'building', compiled: 'success', port: 48046, localUrl: 'http://localhost:48046/x/' });
  assert.equal(rebuilding.ready, false, 'a recompilation is waited for');
  const failed = run({ state: 'serving', phase: '', compiled: 'failed', port: 48046, localUrl: 'http://localhost:48046/x/' });
  assert.equal(failed.snapshot.failed, true);
  assert.equal(failed.snapshot.compileErrors[0].message, 'TS2304', 'an engine without errors: the errors of the Studio log');
  const failedWithErrors = run({ state: 'serving', phase: '', compiled: 'failed', port: 48046, localUrl: 'http://localhost:48046/x/',
    errors: ["src/app/pages/companydetail/companydetail.ts:317:107: TS2304: Cannot find name 'id'."] });
  assert.deepEqual({ ...failedWithErrors.snapshot.compileErrors[0] }, { time: '', level: 'ERROR', category: 'compilation',
    message: "src/app/pages/companydetail/companydetail.ts:317:107: TS2304: Cannot find name 'id'.", extra: '',
    file: 'src/app/pages/companydetail/companydetail.ts', line: 317, column: 107 }, 'the engine errors, each with its place');
  const none = run({ state: 'none' }, false);
  assert.equal(none.snapshot.building, false, 'no build: stopped');
  assert.match(source, /if \(webStudio\) \{\n\s+var devState = readWebStudioDevBuild\(projectName\);\n\s+if \(devState !== undefined\) \{\n\s+return refreshWebStudioState\(devState\);/);
  assert.match(source, /viewerBaseUrl = webStudioDevBuild\.localUrl;/);
  assert.match(read('js/schema_overrides.js'), /webStudioDevBuild: nullableSchema\(closedObjectSchema\(\{\n\s+state: \{ type: "string"/);
});

test('the Studio log collector keeps the latest lines on demand (an npm install before the served URL)', () => {
  const rows = [];
  for (let i = 0; i < 1500; i++) rows.push(['Studio', '2026-11-12 15:00:00,000', 'INFO', 'ws', i === 1490 ? '  ➜  Local:   http://localhost:48046/convertigo/projects/TigoApp/DisplayObjects/dev48046/' : 'npm http fetch GET 200 package ' + i]);
  const jsonRow = r => ({ get: i => r[i], length: () => r.length });
  class LogManager {
    constructor() { this.at = 0; this.max = 300; }
    setDateStart() {} setDateEnd() {} setTimeout() {} setContinue() {} close() {}
    setMaxLines(n) { this.max = n; }
    hasMoreResults() { return this.at < rows.length; }
    getLines() { const chunk = rows.slice(this.at, this.at + this.max); this.at += chunk.length; return { length: () => chunk.length, getJSONArray: i => jsonRow(chunk[i]) }; }
  }
  const box = { C8O: {}, Packages: { com: { twinsoft: { convertigo: { engine: { admin: { logmanager: { LogManager } } } } } } },
    java: { lang: { System: { currentTimeMillis: () => Date.parse('2026-11-12T15:00:05Z') } }, util: { Date: class { constructor(t) { this.t = t; } } } } };
  vm.runInNewContext(read('js/requestable_logs.js'), box);
  const collect = keepLast => box.C8O.requestableLogs.collect({ category: 'Studio', startTime: 0, endTime: Date.now() + 1000, limit: 320, maxScan: 12800, keepLast });
  const first = collect(false), last = collect(true);
  assert.ok(!first.lines.some(l => /Local:/.test(l.message)), 'the first lines are the npm install');
  assert.ok(last.lines.some(l => /Local:   http:\/\/localhost:48046/.test(l.message)), 'the latest lines hold the served URL');
  assert.match(read('js/mobile_builder_common.js'), /keepLast: !!\(options && options\.keepLast === true\)/);
});

test('mobile-builder-open joins the generated line a compile error names, to find the bean that wrote it', () => {
  const box = { C8O: {}, include: () => {} };
  vm.runInNewContext(read('js/mobile_builder_common.js'), box);
  const withLines = box.C8O.mobileBuilderCommon.withGeneratedLines;
  const asked = [];
  const out = withLines([{ message: "src/app/pages/companydetail/companydetail.ts:317:107: TS2304: Cannot find name 'id'.", extra: '' },
    { message: 'Application bundle generation failed.', extra: '' }],
    (file, line) => { asked.push([file, line]); return '        data: {id: id},   '; });
  assert.deepEqual(asked, [['src/app/pages/companydetail/companydetail.ts', 317]]);
  assert.equal(out[0].generatedFile, 'src/app/pages/companydetail/companydetail.ts:317');
  assert.equal(out[0].generatedLine, 'data: {id: id},');
  assert.equal(out[1].generatedLine, undefined, 'no place, nothing joined');
  assert.equal(withLines([{ message: 'src/app/x.ts:9:1: e' }], () => null)[0].generatedLine, undefined, 'an unreadable line');
  const source = read('js/tools_mobile_builder_open.js');
  assert.match(source, /Generated line " \+ snapshot\.compileErrors\[0\]\.generatedFile/);
  assert.match(source, /String\(file\.getPath\(\)\)\.indexOf\(String\(root\.getPath\(\)\) \+ java\.io\.File\.separator\) !== 0/, 'only a file inside _private/ionic');
  assert.match(read('js/schema_overrides.js'), /generatedLine: \{ type: "string" \}/);
});
