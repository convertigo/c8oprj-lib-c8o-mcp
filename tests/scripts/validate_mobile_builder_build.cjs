// mobile-builder-build (js/tools_mobile_builder_build.js): the production build of an NGX app. An agent had no tool for it
// (13/11): the rail ended with the dev build, and the user clicked Build in the Studio's Build panel before deploying,
// otherwise the deployed app showed "Not built". The engine (WsBuilder.buildForServer, Convertigo 8.5) is faked: what is
// checked is the background build, the wait within the tool budget, the answer and the registration of the tool. A live
// build on an Electron Studio is the proof that the engine entry point behaves the same.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function load() {
  const context = { C8O: {} };
  vm.createContext(context);
  vm.runInContext(read('js/tools_mobile_builder_build.js'), context, { filename: 'tools_mobile_builder_build.js' });
  return context.C8O.mobileBuilderBuild;
}

function jsMap() {
  const m = new Map();
  return { get: k => (m.has(k) ? m.get(k) : null), put: (k, v) => m.set(k, v), set: (k, v) => m.set(k, v) };
}
function jsList() {
  const a = [];
  return { add: v => a.push(v), size: () => a.length, get: i => a[i], remove: i => a.splice(i, 1) };
}

// opts.lines: what the build prints; opts.built: its result; opts.deferred: the build thread runs only when run() is called.
function world(opts) {
  const o = Object.assign({ supported: true, built: true, lines: ['Building the application in production mode...', 'The application is built in DisplayObjects/mobile.'] }, opts || {});
  let clock = 1000;
  const pending = [];
  const log = [];
  let output = false;
  const host = {
    server: (() => { const s = jsMap(); return () => s; })(),
    newMap: jsMap,
    newList: jsList,
    listOf: list => { const out = []; for (let i = 0; list && i < list.size(); i++) out.push(String(list.get(i))); return out; },
    now: () => clock,
    sleep: ms => { clock += ms; },
    startThread: (name, fn) => { log.push('thread ' + name); if (o.deferred) pending.push(fn); else fn(); },
    supported: () => o.supported,
    build: (project, endpoint, onLine) => {
      log.push('build ' + project + ' ' + endpoint);
      o.lines.forEach(onLine);
      clock += 90000;
      output = o.built;
      return o.built;
    },
    stopped: () => false,
    application: name => (name === 'Crm' ? { exists: true, ngx: o.ngx !== false, dir: '/ws/projects/Crm' } : { exists: false, ngx: false, dir: '' }),
    defaultEndpoint: () => 'http://localhost:28080/convertigo/',
    output: () => ({ built: output })
  };
  return { host, log, runPending: () => { while (pending.length) pending.shift()(); } };
}

test('a build that ends within the wait: success, the output folder and the path of the built app', () => {
  const B = load();
  const w = world();
  const r = plain(B.run({ project: 'Crm' }, w.host));
  assert.equal(r.status, 'success');
  assert.equal(r.built, true);
  assert.equal(r.started, true);
  assert.equal(r.outputFolder, '/ws/projects/Crm/DisplayObjects/mobile');
  assert.equal(r.applicationPath, '/convertigo/projects/Crm/DisplayObjects/mobile/');
  assert.deepEqual(r.errors, []);
  assert.match(r.next, /Deploy or export the project now/);
  assert.deepEqual(w.log, ['thread lib_ConvertigoMCP-ngx-production-build-Crm', 'build Crm http://localhost:28080/convertigo']);
});

test('a failed build answers its compile errors and sends the agent to the source objects', () => {
  const B = load();
  const w = world({ built: false, lines: ['Building...', '✘ [ERROR] TS2304: Cannot find name \'id\'. [plugin angular-compiler]', 'src/app/pages/p/p.ts:3:7:',
    'Application bundle generation failed. [12.3 seconds]', 'The build failed.'] });
  const r = plain(B.run({ project: 'Crm', endpoint: 'https://prod.example.com/c8o' }, w.host));
  assert.equal(r.status, 'failed');
  assert.equal(r.built, false);
  assert.equal(r.applicationPath, '/c8o/projects/Crm/DisplayObjects/mobile/');
  assert.deepEqual(r.errors, ['✘ [ERROR] TS2304: Cannot find name \'id\'. [plugin angular-compiler]', 'Application bundle generation failed. [12.3 seconds]']);
  assert.match(r.message, /^The production build failed: ✘ \[ERROR\] TS2304/);
  assert.match(r.next, /never the generated files in _private\/ionic or DisplayObjects/);
  assert.match(w.log[1], / https:\/\/prod\.example\.com\/c8o$/);
});

test('a longer build answers running with its buildId; a call with it waits again, a call without it starts no second build', () => {
  const B = load();
  const w = world({ deferred: true });
  const first = plain(B.run({ project: 'Crm', waitSec: 0 }, w.host));
  assert.equal(first.status, 'running');
  assert.match(first.buildId, /^build-\d+$/);
  assert.match(first.next, new RegExp('buildId:\\\\?"' + first.buildId));
  const again = plain(B.run({ project: 'Crm', waitSec: 0 }, w.host));
  assert.equal(again.status, 'running');
  assert.equal(again.buildId, first.buildId);
  assert.equal(again.started, false);
  assert.equal(w.log.filter(l => /^thread/.test(l)).length, 1, 'one build');
  w.runPending();
  const done = plain(B.run({ project: 'Crm', buildId: first.buildId, waitSec: 5 }, w.host));
  assert.equal(done.status, 'success');
  assert.equal(done.started, false);
  // a finished build is not waited for again: a new call starts a new build
  const next = plain(B.run({ project: 'Crm', waitSec: 0 }, w.host));
  assert.equal(next.started, true);
  assert.notEqual(next.buildId, first.buildId);
});

test('the wait stays within the tool budget, whatever is asked', () => {
  const B = load();
  const w = world({ deferred: true });
  const before = w.host.now();
  const r = plain(B.run({ project: 'Crm', waitSec: 600 }, w.host));
  assert.equal(r.status, 'running');
  assert.ok(w.host.now() - before <= B.MAX_WAIT_SEC * 1000 + 500, 'waited ' + (w.host.now() - before));
  assert.equal(B.MAX_WAIT_SEC, 40);
});

test('an engine without the entry point answers unsupported and tells the agent to ask the user to click Build', () => {
  const B = load();
  const w = world({ supported: false });
  const r = plain(B.run({ project: 'Crm' }, w.host));
  assert.equal(r.status, 'unsupported');
  assert.match(r.next, /ask the user to run the production build in the Studio: Build in the Build panel/);
  assert.deepEqual(w.log, [], 'nothing started');
});

test('the project, its NGX application and the buildId are checked first', () => {
  const B = load();
  const w = world();
  assert.throws(() => B.run({}, w.host), /project is required/);
  assert.throws(() => B.run({ project: 'Nope' }, w.host), /Project not found: Nope/);
  assert.throws(() => B.run({ project: 'Crm' }, world({ ngx: false }).host), /has no NGX application/);
  assert.throws(() => B.run({ project: 'Crm', buildId: 'build-1' }, w.host), /No build build-1 for Crm/);
  assert.equal(B.isErrorLine('Exception: The build of Crm: this server does not run these builds'), true);
  assert.equal(B.isErrorLine('Building the application in production mode...'), false);
});

test('mobile-builder-build is a tool: its sequence, closed output schema, Vibe list, TOOLS.md, writer set and guides know it', () => {
  const yaml = read('_c8oProject/sequences/tools_mobile_builder_build.yaml');
  const run = /var mobileBuilderBuildResult = C8O\.mobileBuilderBuild\.execute\(context, \{([^}]*)\}\)/.exec(yaml)[1];
  ['project', 'buildId', 'waitSec', 'endpoint'].forEach(v => {
    assert.match(yaml, new RegExp('↓' + v + ' \\[variables\\.RequestableVariable-\\d+\\]: \\n'), v + ' is a variable');
    assert.match(run, new RegExp('\\b' + v + ': ' + v + '\\b'), v + ' is passed');
  });
  assert.match(read('c8oProject.yaml'), /↓tools_mobile_builder_build \[sequences\.GenericSequence\]: 🗏 sequences\/tools_mobile_builder_build\.yaml/);
  const context = { C8O: {}, include() {} };
  vm.createContext(context);
  vm.runInContext(read('js/schema_overrides.js'), context);
  const O = context.C8O.schemaOverrides;
  const input = plain(O.applyInput('tools_mobile_builder_build', null, null));
  const output = plain(O.applyOutput('tools_mobile_builder_build', null, null));
  assert.deepEqual(input.required, ['project']);
  assert.equal(input.properties.waitSec.maximum, 40);
  assert.equal(output.additionalProperties, false);
  // every field of every answer is declared: a strict client (Vibe) loses an answer with an undeclared field
  const B = load();
  const answers = [B.run({ project: 'Crm' }, world().host), B.run({ project: 'Crm' }, world({ built: false }).host),
    B.run({ project: 'Crm', waitSec: 0 }, world({ deferred: true }).host), B.run({ project: 'Crm' }, world({ supported: false }).host)];
  answers.forEach(a => Object.keys(a).forEach(k => assert.ok(output.properties[k], k + ' is declared')));
  answers.forEach(a => assert.ok(output.properties.status.enum.includes(a.status)));
  assert.match(read('js/setup_vibe.js'), /"Convertigo_mobile-builder-build",/);
  assert.match(read('TOOLS.md'), /\| `mobile-builder-build` \| `tools_mobile_builder_build` \|/);
  assert.match(read('js/subagents.js'), /tools_mobile_builder_build: true/);
  assert.doesNotMatch(read('js/nocode_tool_policy.js'), /tools_mobile_builder_build/, 'not a No Code tool');
  ['resources/convertigo_common_skill.md', 'resources/convertigo_start.md', 'resources/convertigo_crud_fastpath.md',
    'resources/convertigo_recipe_multipage_app.md'].forEach(f => assert.match(read(f), /mobile-builder-build/, f));
  // the engine entry point, looked up before use
  const source = read('js/tools_mobile_builder_build.js');
  assert.match(source, /typeof WsBuilder\.buildForServer !== "function"/);
  assert.match(source, /thread\.setDaemon\(true\);/);
});
