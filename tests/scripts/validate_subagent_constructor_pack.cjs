const { test } = require('node:test');
const sandboxDeps = {platform: 'linux', spawnSync: (_bin, args) => ({status: 0, stdout: args.includes('--probe') ? '1\n' : '3.1.0\n'})};
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

// The constructor with inputs.pack "flow": a Vibe session with the convertigo-flow server alone, on one side of the
// project (scope backend or frontend), one constructor per side so that both sides of a parallel build run together.

const root = path.resolve(__dirname, '../..');
const runner = require(path.join(root, 'node/vibe_subagent_runner.cjs'));
const sources = ['js/subagents.js', 'js/tools_browser_verify.js', 'js/subagent_constructor.js', 'js/tools_subagent_run.js']
  .map(f => fs.readFileSync(path.join(root, f), 'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));

function loadAll() {
  const sandbox = { C8O: { mcpAuth: { authenticateRequest: () => ({ authenticated: true, scope: 'mcp:full' }) } } };
  for (const source of sources) vm.runInNewContext(source, sandbox);
  return sandbox.C8O;
}

// A Studio home: both servers, Playwright, the tool permissions of each pack.
const STUDIO_TEMPLATE = [
  'active_model = "glm-5-3"',
  '[[providers]]',
  'name = "convertigo"',
  'api_key_env_var = "CONVERTIGO_LLM_API_KEY"',
  '[[mcp_servers]]',
  'name = "Convertigo"',
  'transport = "http"',
  'url = "http://localhost:18112/convertigo/api/mcp"',
  '[mcp_servers.auth]',
  'type = "static"',
  'api_key_env = "CONVERTIGO_MCP_TOKEN"',
  '[mcp_servers.auth.headers]',
  '"X-Convertigo-Conversation-Id" = "agent-1"',
  '[[mcp_servers]]',
  'name = "convertigo-flow"',
  'transport = "http"',
  'url = "http://localhost:18112/convertigo/api/flow-mcp?toolsRevision=r1"',
  'tool_timeout_sec = 600.0',
  '[mcp_servers.auth]',
  'type = "static"',
  'api_key_env = "CONVERTIGO_FLOW_MCP_TOKEN"',
  '[mcp_servers.auth.headers]',
  '"X-Convertigo-Viewer-Debug-Port" = "9333"',
  '"X-Convertigo-Conversation-Id" = "agent-1"',
  '"X-Convertigo-Guidance-Version" = "g1"',
  '[[mcp_servers]]',
  'name = "playwright"',
  'transport = "stdio"',
  '[mcp_servers.env]',
  'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1"',
  '[tools.Convertigo_databaseobject-tree-apply]',
  'permission = "always"',
  '[tools.convertigo-flow_code-set]',
  'permission = "always"'
].join('\n');

// A conversation home of the second pack: its server alone.
const FLOW_TEMPLATE = [
  'active_model = "glm-5-3"',
  'enabled_skills = ["convertigo-flow-mcp", "convertigo-flow-backend", "convertigo-flow-frontend-svelte"]',
  '[[mcp_servers]]',
  'name = "convertigo-flow"',
  'transport = "http"',
  'url = "http://localhost:18112/convertigo/api/flow-mcp"',
  '[mcp_servers.auth]',
  'type = "static"',
  'api_key_env = "CONVERTIGO_MCP_TOKEN"',
  '[mcp_servers.auth.headers]',
  '"X-Convertigo-Conversation-Id" = "agent-2"'
].join('\n');

test('pack of a call: none or convertigo for the Convertigo MCP, flow with a scope, nothing else', () => {
  const api = loadAll().constructorRunner;
  assert.equal(api.packOf({ project: 'App' }), null);
  assert.equal(api.packOf({ project: 'App', pack: 'Convertigo' }), null);
  assert.deepEqual(plain(api.packOf({ project: 'App', pack: 'Flow', scope: 'Frontend' })), { pack: 'flow', scope: 'frontend', server: 'convertigo-flow' });
  assert.throws(() => api.packOf({ pack: 'flow' }), /needs inputs\.scope backend or frontend/);
  assert.throws(() => api.packOf({ pack: 'flow', scope: 'all' }), /needs inputs\.scope/);
  assert.throws(() => api.packOf({ pack: 'nocode', scope: 'backend' }), /Unknown pack nocode/);
});

test('template homes: the server they declare and the environment variable of its bearer', () => {
  const api = loadAll().constructorRunner;
  assert.ok(api.declaresServer(STUDIO_TEMPLATE, 'convertigo-flow') && api.declaresServer(STUDIO_TEMPLATE, 'Convertigo'));
  assert.ok(api.declaresServer(FLOW_TEMPLATE, 'convertigo-flow') && !api.declaresServer(FLOW_TEMPLATE, 'Convertigo'));
  assert.ok(!api.declaresServer('[[providers]]\nname = "convertigo"', 'Convertigo'), 'a provider of the same name is not the server');
  assert.equal(api.mcpTokenEnvOf(STUDIO_TEMPLATE, 'convertigo-flow'), 'CONVERTIGO_FLOW_MCP_TOKEN');
  assert.equal(api.mcpTokenEnvOf(STUDIO_TEMPLATE, 'Convertigo'), 'CONVERTIGO_MCP_TOKEN');
  assert.equal(api.mcpTokenEnvOf(FLOW_TEMPLATE, 'convertigo-flow'), 'CONVERTIGO_MCP_TOKEN');
  assert.equal(api.mcpTokenEnvOf('active_model = "m"', 'convertigo-flow'), 'CONVERTIGO_MCP_TOKEN', 'the default bearer variable');
});

function constructorHost(overrides) {
  const seen = { starts: [], locks: [], templates: [] };
  let clock = 1000;
  const h = Object.assign({
    readKey: () => 'sk-gateway-0123456789',
    readSettings: () => ({}),
    newRun: prefix => ({ runId: prefix + '-20261030-230000-0123abcd', outDir: '/ws/subagents/' + prefix + '-20261030-230000-0123abcd' }),
    lock: (key, id, budget) => { seen.locks.push({ key, id, budget }); return '/ws/subagents/.lock-' + key.replace(/[^0-9A-Za-z]+/g, '_'); },
    unlock: () => {},
    start: (command, env, stdin, outDir, meta) => { seen.starts.push({ command, env, config: JSON.parse(stdin), meta }); },
    readRun: () => {
      const meta = seen.starts.length ? seen.starts[seen.starts.length - 1].meta : {};
      return { exists: true, alive: true, runId: 'build-20261030-230000-0123abcd', profile: 'constructor', model: 'glm-5-3', task: 't', outDir: '/ws/subagents/x',
        output: '', startedAt: 1000, activity: [], pack: meta.pack || '', scope: meta.scope || '' };
    },
    workspaceRoot: () => '/ws',
    now: () => clock,
    sleep: ms => { clock += ms; },
    nodePath: () => '/node',
    projectDir: p => (p === 'App' ? '/projects/App' : ''),
    callerBearer: () => 'caller-bearer',
    vibeBin: () => '/venv/bin/vibe',
    runnerScript: () => '/mcp/node/vibe_subagent_runner.cjs',
    vibeTemplate: (id, server) => {
      seen.templates.push({ id, server });
      return { home: '/ws/agents/vibe/homes-convertigo/users/studio/conversations/c2/.vibe-home', mcpTokenEnv: server === 'convertigo-flow' ? 'CONVERTIGO_FLOW_MCP_TOKEN' : 'CONVERTIGO_MCP_TOKEN' };
    }
  }, overrides || {});
  return { h, seen };
}

test('a Flow constructor: its server in the template, a lock per side, the caller bearer under that server, the tools it never calls', () => {
  const C8O = loadAll();
  const { h, seen } = constructorHost();
  const backend = C8O.subagentRun.run({ profile: 'constructor', task: 'Fill the bodies of the contract Flows', conversationId: 'agent-2', waitSec: 5,
    inputs: { project: 'App', pack: 'flow', scope: 'backend', contracts: ['App.ListItems: {status} -> {items[]}'] } }, h);
  assert.equal(backend.status, 'running');
  assert.match(backend.message, /do not start another constructor on the backend of this project meanwhile/);
  const start = seen.starts[0];
  assert.deepEqual(plain(seen.templates[0]), { id: 'agent-2', server: 'convertigo-flow' });
  assert.equal(start.env.CONVERTIGO_FLOW_MCP_TOKEN, 'caller-bearer', 'the bearer goes under the variable of the kept server');
  assert.equal(start.env.CONVERTIGO_LLM_API_KEY, 'sk-gateway-0123456789');
  assert.ok(!JSON.stringify(start.config).includes('caller-bearer'), 'no secret in the runner input');
  assert.equal(start.config.server, 'convertigo-flow');
  assert.equal(start.config.pack, 'flow');
  assert.equal(start.config.scope, 'backend');
  assert.equal(start.config.workdir, '/projects/App');
  assert.deepEqual(plain({ pack: start.meta.pack, scope: start.meta.scope }), { pack: 'flow', scope: 'backend' }, 'run.json names the side');
  const disabled = start.config.disabledTools;
  ['convertigo-flow_subagent-run', 'convertigo-flow_browser-verify', 'convertigo-flow_project-save', 'convertigo-flow_flow-project-bootstrap',
    'convertigo-flow_report-create', 'bash', 'write_file', 'edit', 'task', 'convertigo-flow_frontend-svelte-*'].forEach(tool => assert.ok(disabled.includes(tool), tool));
  assert.ok(!disabled.some(tool => /^Convertigo_/.test(tool)) && !disabled.includes('read_file') && !disabled.includes('skill'), 'skills and reads stay: ' + disabled);

  C8O.subagentRun.run({ profile: 'constructor', task: 'Build the pages on the contract', conversationId: 'agent-2', waitSec: 5,
    inputs: { project: 'App', pack: 'flow', scope: 'frontend' } }, h);
  assert.deepEqual(plain(seen.locks.map(l => l.key)), ['flow:App:backend', 'flow:App:frontend'], 'one lock per side, so both sides run together');
  const frontendDisabled = seen.starts[1].config.disabledTools;
  assert.ok(frontendDisabled.includes('convertigo-flow_flow-block-mock') && frontendDisabled.includes('convertigo-flow_flow-object-remove'));
  assert.ok(!frontendDisabled.some(tool => /frontend-svelte/.test(tool)), 'the frontend keeps its tools');

  // The Convertigo MCP constructor is unchanged.
  const legacy = constructorHost();
  const legacyRun = C8O.subagentRun.run({ profile: 'constructor', task: 't', inputs: { project: 'App' }, conversationId: 'agent-1', waitSec: 5 }, legacy.h);
  assert.deepEqual(plain(legacy.seen.locks.map(l => l.key)), ['project:App']);
  assert.deepEqual(plain(legacy.seen.templates[0]), { id: 'agent-1', server: 'Convertigo' });
  assert.deepEqual(plain(legacy.seen.starts[0].config.disabledTools), ['Convertigo_subagent-run', 'Convertigo_browser-verify', 'Convertigo_project-delete']);
  assert.equal(legacy.seen.starts[0].config.server, 'Convertigo');
  assert.equal(legacy.seen.starts[0].meta.scope, undefined);
  assert.match(legacyRun.message, /do not start another sub-agent on the same browser or project meanwhile/);
  assert.throws(() => C8O.subagentRun.run({ profile: 'constructor', task: 't', inputs: { project: 'App', pack: 'flow' } }, constructorHost().h), /needs inputs\.scope/);
});

test('a Flow constructor report names its side', () => {
  const C8O = loadAll();
  const output = { ok: true, report: { verdict: 'done', summary: 'Pages bound.', created: ['_flow/frontbuilder/svelte/model/App/src/routes/items/+page.flow.svelte'],
    modified: [], checks: [], openIssues: ['backend needs: App.ListItems items[].owner, the list shows the owner'], changedFiles: [] },
    stopReason: 'finished', toolCalls: 20, durationMs: 1000, usage: { model: 'glm-5-3', requests: 4 } };
  const result = plain(C8O.constructorRunner.runner.toResult(Object.assign({ reportFile: '/ws/subagents/build-1/report.json' }, output),
    { runId: 'build-1', profile: 'constructor', model: 'glm-5-3', task: 'x', pack: 'flow', scope: 'frontend' }, '/ws'));
  assert.equal(result.report.scope, 'frontend');
  assert.equal(result.report.pack, 'flow');
  assert.match(result.report.openIssues[0], /backend needs: App\.ListItems/);
  const legacy = plain(C8O.constructorRunner.runner.toResult(Object.assign({ reportFile: '/ws/subagents/build-2/report.json' }, output),
    { runId: 'build-2', profile: 'constructor', model: 'glm-5-3', task: 'x' }, '/ws'));
  assert.equal(legacy.report.scope, undefined);
});

test('child home config of a Flow constructor: that server alone, the run and scope headers, the tool permissions', () => {
  const out = runner.childConfig(STUDIO_TEMPLATE, { model: 'glm-5-3', callId: 'build-20261030-230000-0123abcd', server: 'convertigo-flow', scope: 'frontend' });
  assert.ok(!/name = "Convertigo"/.test(out) && !/\/api\/mcp"/.test(out), 'the Convertigo server is dropped');
  assert.ok(!/playwright/i.test(out), 'the browser server is dropped');
  assert.match(out, /name = "convertigo-flow"[\s\S]*api_key_env = "CONVERTIGO_FLOW_MCP_TOKEN"/);
  assert.match(out, /\[mcp_servers\.auth\.headers\]\n"X-Convertigo-Subagent-Run" = "build-20261030-230000-0123abcd"\n"X-Convertigo-Subagent-Scope" = "frontend"\n"X-Convertigo-Viewer-Debug-Port" = "9333"/);
  assert.equal(out.match(/X-Convertigo-Subagent-Run/g).length, 1, 'one header table gets the headers');
  assert.match(out, /\[tools\.convertigo-flow_code-set\]\npermission = "always"/);
  const flowOnly = runner.childConfig(FLOW_TEMPLATE, { model: 'mistral-large-4', callId: 'build-2', server: 'convertigo-flow', scope: 'backend' });
  assert.match(flowOnly, /^active_model = "mistral-large-4"$/m);
  assert.match(flowOnly, /"X-Convertigo-Subagent-Scope" = "backend"\n"X-Convertigo-Conversation-Id" = "agent-2"/);
  const inline = runner.childConfig('[[mcp_servers]]\nname = "convertigo-flow"\n[mcp_servers.auth]\nheaders = { "X-Convertigo-No-Log" = "true" }',
    { model: 'm', callId: 'build-3', server: 'convertigo-flow', scope: 'backend' });
  assert.match(inline, /headers = \{ "X-Convertigo-Subagent-Run" = "build-3", "X-Convertigo-Subagent-Scope" = "backend", "X-Convertigo-No-Log" = "true" \}/);
  // A home without that server gives a child without MCP server: the template choice prevents it, the config does not invent one.
  assert.ok(!/mcp_servers/.test(runner.childConfig('[[mcp_servers]]\nname = "Convertigo"\n', { model: 'm', callId: 'b', server: 'convertigo-flow' })));
  // The Convertigo MCP child is unchanged: no scope header.
  assert.ok(!/Subagent-Scope/.test(runner.childConfig(STUDIO_TEMPLATE, { model: 'm', callId: 'b' })));
});

function fakeVibe(lines, exported, onArgs) {
  return (bin, args, options) => {
    onArgs && onArgs(bin, args, options);
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => {
      for (const line of lines) child.stdout.emit('data', Buffer.from(JSON.stringify(line) + '\n'));
      const dir = args[args.indexOf('--output-dir') + 1];
      fs.mkdirSync(dir, { recursive: true });
      if (exported) fs.writeFileSync(path.join(dir, 'export.json'), JSON.stringify(exported));
      child.emit('close', 0);
    });
    return child;
  };
}

test('a Flow constructor run: the rules of its side, the scope in the task, the tools it never calls, the files it wrote', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-constructor-'));
  const template = path.join(tmp, 'template');
  fs.mkdirSync(path.join(template, 'skills', 'convertigo-flow-backend'), { recursive: true });
  fs.writeFileSync(path.join(template, 'config.toml'), FLOW_TEMPLATE);
  fs.writeFileSync(path.join(template, 'AGENTS.md'), '# Convertigo Vibe Workspace');
  fs.writeFileSync(path.join(template, 'skills', 'convertigo-flow-backend', 'SKILL.md'), 'skill');
  const projectDir = path.join(tmp, 'App');
  fs.mkdirSync(path.join(projectDir, '_flow', 'flows'), { recursive: true });
  const outDir = path.join(tmp, 'subagents', 'build-1');
  let seen = null;
  const spawn = fakeVibe([
    { type: 'effect', title: 'convertigo-flow_code-set', detail: { display: { summary: 'code-set App.ListItems' } } },
    { type: 'message', role: 'assistant', content: [{ type: 'text', text: 'Done.\n```json\n{"verdict":"done","summary":"Bodies filled.","created":[],"modified":["App.ListItems"],"checks":[{"check":"ListItems returns items","status":"passed","evidence":"3 items"}],"openIssues":[]}\n```' }] }
  ], { outcome: 'finished', usage: { input_tokens: 1000, output_tokens: 100 }, cost_usd: 0.01, steps: 3 },
  (bin, args, options) => {
    seen = { bin, args, options };
    fs.writeFileSync(path.join(projectDir, '_flow', 'flows', 'ListItems.flow.js'), 'x');
  });
  const disabledTools = loadAll().constructorRunner.FLOW_DISABLED_TOOLS.concat(['convertigo-flow_frontend-svelte-*']);
  const result = await runner.run({ vibeBin: '/venv/bin/vibe', templateHome: template, outDir, workdir: projectDir, projectDir, project: 'App',
    model: 'glm-5-3', task: 'Fill the bodies of the contract Flows', inputs: { project: 'App', pack: 'flow', scope: 'backend', contracts: ['App.ListItems'] },
    maxSteps: 60, timeBudgetMs: 600000, maxCostUsd: 1, callId: 'build-1', server: 'convertigo-flow', pack: 'flow', scope: 'backend', disabledTools },
    { ...sandboxDeps, spawn, env: { CONVERTIGO_MCP_TOKEN: 'secret-bearer', PATH: '/bin' } });
  const args = seen.args.join(' ');
  assert.match(args, /--disabled-tools convertigo-flow_subagent-run/);
  assert.match(args, /--disabled-tools bash .*--disabled-tools write_file/);
  assert.match(args, /--disabled-tools convertigo-flow_frontend-svelte-\*/);
  const home = path.join(outDir, 'vibe-home');
  const agents = fs.readFileSync(path.join(home, 'AGENTS.md'), 'utf8');
  assert.match(agents, /# Convertigo Vibe Workspace[\s\S]*# Constructor sub-agent \(backend\)/);
  assert.match(agents, /Your one MCP server is `convertigo-flow`/);
  assert.match(agents, /You own the backend/);
  assert.ok(!/You own the frontend/.test(agents) && !/sql-transaction-create/.test(agents), 'neither the other side nor the Convertigo MCP rules');
  assert.match(fs.readFileSync(path.join(home, 'config.toml'), 'utf8'), /"X-Convertigo-Subagent-Scope" = "backend"/);
  const task = fs.readFileSync(path.join(outDir, 'task.md'), 'utf8');
  assert.match(task, /^Project: App\nScope: backend\n\nTask:\nFill the bodies of the contract Flows/);
  assert.match(task, /- contracts: \["App.ListItems"\]/);
  assert.ok(!/- pack:|- scope:/.test(task), 'pack and scope are not repeated as inputs');
  for (const file of fs.readdirSync(outDir)) {
    if (fs.statSync(path.join(outDir, file)).isFile()) assert.ok(!fs.readFileSync(path.join(outDir, file), 'utf8').includes('secret-bearer'), file);
  }
  assert.equal(result.report.verdict, 'done');
  assert.deepEqual(result.report.modified, ['App.ListItems']);
  assert.deepEqual(result.report.changedFiles, ['_flow/flows/ListItems.flow.js']);
  assert.equal(runner.rulesOf({ pack: '' }), runner.CONSTRUCTOR_RULES, 'the Convertigo MCP rules are unchanged');
  assert.match(runner.rulesOf({ pack: 'flow', scope: 'frontend' }), /You own the frontend[\s\S]*backend needs: <Flow> <field> <why>/);
});
