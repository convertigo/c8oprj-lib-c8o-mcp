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
