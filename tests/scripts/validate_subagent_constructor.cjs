const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

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

const TEMPLATE = [
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
  'name = "playwright"',
  'transport = "stdio"',
  '[mcp_servers.env]',
  'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1"',
  '[tools.Convertigo_databaseobject-tree-apply]',
  'permission = "always"'
].join('\n');

// ---------------------------------------------------------------------------------------------------------------
// Runner (node/vibe_subagent_runner.cjs)

test('child home config: the profile model, the Convertigo server only, a header naming the run', () => {
  const out = runner.childConfig(TEMPLATE, { model: 'mistral-large-4', callId: 'build-20261017-230000-0123abcd' });
  assert.match(out, /^active_model = "mistral-large-4"$/m);
  assert.ok(!/playwright/i.test(out), 'the browser server is dropped');
  assert.ok(!/PLAYWRIGHT_SKIP/.test(out), 'with its env table');
  assert.match(out, /\[mcp_servers\.auth\.headers\]\n"X-Convertigo-Subagent-Run" = "build-20261017-230000-0123abcd"\n"X-Convertigo-Conversation-Id" = "agent-1"/);
  assert.match(out, /\[tools\.Convertigo_databaseobject-tree-apply\]\npermission = "always"/, 'the tool permissions stay');
  const inline = runner.childConfig('[[mcp_servers]]\nname = "Convertigo"\n[mcp_servers.auth]\nheaders = { "X-Convertigo-No-Log" = "true" }', { model: 'm', callId: 'build-1' });
  assert.match(inline, /headers = \{ "X-Convertigo-Subagent-Run" = "build-1", "X-Convertigo-No-Log" = "true" \}/);
  assert.match(inline, /^active_model = "m"$/m);
});

test('the report: the last json block of the final message, else the message as summary', () => {
  const final = 'Lot built.\n```json\n{"verdict":"done","summary":"Sequence and page created.","created":["App.sq:poste_stats","App.Application.NgxApp.pg:Stats"],"modified":[],"checks":[{"check":"poste_stats returns 3 rows","status":"passed","evidence":"rows: 3"}],"openIssues":[]}\n```';
  const report = runner.parseReport(final);
  assert.equal(report.verdict, 'done');
  assert.deepEqual(report.created, ['App.sq:poste_stats', 'App.Application.NgxApp.pg:Stats']);
  assert.equal(report.checks[0].status, 'passed');
  const loose = runner.parseReport('I could not finish: the connector is missing.');
  assert.equal(loose.verdict, 'partial');
  assert.match(loose.summary, /connector is missing/);
  assert.match(loose.openIssues[0], /without the json report/);
  assert.equal(runner.parseReport('```json\n{"verdict":"maybe","summary":"x"}\n```').verdict, 'partial');
});

test('activity lines: tool calls by their summary, assistant messages shortened', () => {
  assert.equal(runner.activityOf({ type: 'effect', title: 'mcp_Convertigo.databaseobject_tree_apply', detail: { display: { summary: 'databaseobject_tree_apply App.sq:x' } } }), 'databaseobject_tree_apply App.sq:x');
  assert.equal(runner.activityOf({ type: 'message', role: 'assistant', content: [{ type: 'text', text: 'Building the page.' }] }), '« Building the page. »');
  assert.equal(runner.activityOf({ type: 'message', role: 'user', content: [] }), '');
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

test('a run: child home and task in the run folder, Vibe limits, activity, report, usage and written files', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'constructor-'));
  const template = path.join(tmp, 'template');
  fs.mkdirSync(path.join(template, 'skills', 'convertigo-vibe-generalist'), { recursive: true });
  fs.writeFileSync(path.join(template, 'config.toml'), TEMPLATE);
  fs.writeFileSync(path.join(template, 'AGENTS.md'), '# Convertigo rules');
  fs.writeFileSync(path.join(template, 'skills', 'convertigo-vibe-generalist', 'SKILL.md'), 'skill');
  const projectDir = path.join(tmp, 'App');
  fs.mkdirSync(path.join(projectDir, '_c8oProject', 'sequences'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, '_private'), { recursive: true });
  const outDir = path.join(tmp, 'subagents', 'build-1');
  let seen = null;
  const spawn = fakeVibe([
    { type: 'effect', title: 'mcp_Convertigo.sql_transaction_create', detail: { display: { summary: 'sql_transaction_create count_postes' } } },
    { type: 'message', role: 'assistant', content: [{ type: 'text', text: 'Done.\n```json\n{"verdict":"done","summary":"Created.","created":["App.sq:poste_stats"],"modified":[],"checks":[],"openIssues":[]}\n```' }] }
  ], { outcome: 'finished', stop_reason: null, usage: { input_tokens: 90000, output_tokens: 3000, cached_input_tokens: 70000, total_tokens: 93000 }, cost_usd: 0.0412, steps: 9 },
  (bin, args, options) => {
    seen = { bin, args, options };
    fs.writeFileSync(path.join(projectDir, '_c8oProject', 'sequences', 'poste_stats.yaml'), 'x');
    fs.writeFileSync(path.join(projectDir, '_private', 'generated.ts'), 'x');
  });
  const result = await runner.run({ vibeBin: '/venv/bin/vibe', templateHome: template, outDir, workdir: projectDir, projectDir, project: 'App',
    model: 'glm-5-3', task: 'Create the poste_stats sequence', inputs: { project: 'App', qnames: ['App.cn:db'] }, reportFormat: 'the QNames created',
    maxSteps: 30, timeBudgetMs: 300000, maxCostUsd: 0.8, callId: 'build-1', disabledTools: ['Convertigo_subagent-run'] },
    { spawn, env: { CONVERTIGO_MCP_TOKEN: 'secret-bearer', PATH: '/bin' } });
  assert.equal(seen.bin, '/venv/bin/vibe');
  const args = seen.args.join(' ');
  assert.match(args, /^-p --prompt-file .*task\.md --max-turns 30 --max-price 4 --time-limit 300 --output streaming --output-dir .*vibe --auto-approve --workdir /);
  assert.match(args, /--disabled-tools Convertigo_subagent-run/);
  // Vibe prices the input as uncached: its --max-price (5 x the budget) is a safety net, the runner holds the budget.
  assert.equal(seen.options.env.VIBE_HOME, path.join(outDir, 'vibe-home'));
  assert.equal(seen.options.env.CONVERTIGO_MCP_TOKEN, 'secret-bearer', 'the bearer travels in the environment');
  const home = path.join(outDir, 'vibe-home');
  assert.match(fs.readFileSync(path.join(home, 'AGENTS.md'), 'utf8'), /# Convertigo rules[\s\S]*# Constructor sub-agent/);
  assert.ok(fs.existsSync(path.join(home, 'skills', 'convertigo-vibe-generalist', 'SKILL.md')));
  assert.ok(!fs.readFileSync(path.join(home, 'config.toml'), 'utf8').includes('playwright'));
  const task = fs.readFileSync(path.join(outDir, 'task.md'), 'utf8');
  assert.match(task, /^Project: App\n\nTask:\nCreate the poste_stats sequence/);
  assert.match(task, /- qnames: \["App.cn:db"\]/);
  assert.match(task, /Report wanted: the QNames created/);
  for (const file of fs.readdirSync(outDir)) {
    if (fs.statSync(path.join(outDir, file)).isFile()) assert.ok(!fs.readFileSync(path.join(outDir, file), 'utf8').includes('secret-bearer'), file);
  }
  assert.equal(result.ok, true);
  assert.equal(result.report.verdict, 'done');
  assert.deepEqual(result.report.created, ['App.sq:poste_stats']);
  assert.deepEqual(result.report.changedFiles, ['_c8oProject/sequences/poste_stats.yaml'], 'generated sources are left out');
  assert.equal(result.toolCalls, 1);
  assert.equal(result.stopReason, 'finished');
  assert.deepEqual(plain(Object.assign({}, result.usage, { durationMs: 0 })), { tool: 'subagent-run', callId: 'build-1', runId: 'build-1', profile: 'constructor', model: 'glm-5-3',
    requests: 9, inputTokens: 90000, cachedTokens: 70000, outputTokens: 3000, reasoningTokens: 0, totalTokens: 93000, cost: 0.0412, costSource: 'journal', currency: 'USD', durationMs: 0 });
  const activity = fs.readFileSync(path.join(outDir, 'activity.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l).text);
  assert.deepEqual(activity.slice(0, 1), ['sql_transaction_create count_postes']);
  assert.ok(fs.existsSync(path.join(outDir, 'report.json')));
});

test('a run stopped by Vibe keeps its stop reason; a crash without export is an error', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'constructor-'));
  fs.writeFileSync(path.join(tmp, 'config.toml'), TEMPLATE);
  const base = { vibeBin: 'vibe', templateHome: tmp, workdir: tmp, project: 'App', model: 'glm-5-3', task: 't', callId: 'build-2' };
  const stopped = await runner.run(Object.assign({ outDir: path.join(tmp, 'a') }, base),
    { spawn: fakeVibe([], { outcome: 'interrupted', stop_reason: 'max_price', usage: {}, cost_usd: 0.8, steps: 40 }), env: {} });
  assert.equal(stopped.ok, true);
  assert.equal(stopped.stopReason, 'max_price');
  assert.equal(stopped.report.verdict, 'partial');
  const crashed = await runner.run(Object.assign({ outDir: path.join(tmp, 'b') }, base), {
    spawn: () => {
      const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      setImmediate(() => { child.stderr.emit('data', Buffer.from('Traceback\nModuleNotFoundError: vibe\n')); child.emit('close', 1); });
      return child;
    }, env: {} });
  assert.equal(crashed.ok, false);
  assert.match(crashed.error, /exited with code 1: Traceback ModuleNotFoundError: vibe/);
});

// ---------------------------------------------------------------------------------------------------------------
// MCP side (js/subagent_constructor.js, js/subagents.js)

function constructorHost(overrides) {
  const seen = { starts: [], locks: [] };
  let clock = 1000;
  const h = Object.assign({
    readKey: () => 'sk-gateway-0123456789',
    readSettings: () => ({}),
    newRun: prefix => ({ runId: prefix + '-20261017-230000-0123abcd', outDir: '/ws/subagents/' + prefix + '-20261017-230000-0123abcd' }),
    lock: (key, id, budget) => { seen.locks.push({ key, id, budget }); return '/ws/subagents/.lock-x'; },
    unlock: () => {},
    start: (command, env, stdin, outDir, meta) => { seen.starts.push({ command, env, config: JSON.parse(stdin), meta }); },
    readRun: () => ({ exists: true, alive: true, runId: 'build-20261017-230000-0123abcd', profile: 'constructor', model: 'glm-5-3', task: 't', outDir: '/ws/subagents/x', output: '', startedAt: 1000, activity: [] }),
    workspaceRoot: () => '/ws',
    now: () => clock,
    sleep: ms => { clock += ms; },
    nodePath: () => '/node',
    projectDir: p => (p === 'App' ? '/projects/App' : ''),
    callerBearer: () => 'caller-bearer',
    vibeBin: () => '/venv/bin/vibe',
    runnerScript: () => '/mcp/node/vibe_subagent_runner.cjs',
    vibeTemplate: id => ({ home: '/ws/agents/vibe/homes-convertigo/users/studio/conversations/c1/.vibe-home', mcpTokenEnv: 'CONVERTIGO_MCP_TOKEN', id })
  }, overrides || {});
  return { h, seen };
}

test('constructor: one project, the caller bearer in the environment, the project lock, Vibe limits from the profile', () => {
  const C8O = loadAll();
  const { h, seen } = constructorHost();
  const first = C8O.subagentRun.run({ profile: 'constructor', task: 'Create the poste_stats sequence and the Stats page', inputs: { project: 'App', notes: 'counts per status' },
    reportFormat: 'QNames', conversationId: 'agent-1', waitSec: 5 }, h);
  assert.equal(first.status, 'running');
  assert.equal(first.profile, 'constructor');
  assert.equal(first.elapsedMs, 5000, 'a constructor call waits waitSec server side, like a verifier call');
  assert.match(first.message, /Call the same tool again with this runId alone/);
  assert.equal(first.model, 'glm-5-3');
  const start = seen.starts[0];
  assert.deepEqual(plain(start.command), ['/node', '/mcp/node/vibe_subagent_runner.cjs']);
  assert.equal(start.env.CONVERTIGO_MCP_TOKEN, 'caller-bearer');
  assert.equal(start.env.CONVERTIGO_LLM_API_KEY, 'sk-gateway-0123456789');
  assert.ok(!JSON.stringify(start.config).includes('caller-bearer') && !JSON.stringify(start.config).includes('sk-gateway'), 'no secret in the runner input');
  assert.deepEqual(plain(seen.locks), [{ key: 'project:App', id: 'build-20261017-230000-0123abcd', budget: 900000 }]);
  assert.equal(start.config.project, 'App');
  assert.equal(start.config.workdir, '/projects/App');
  assert.equal(start.config.maxSteps, 120);
  assert.equal(start.config.maxCostUsd, 1.5);
  assert.equal(start.config.templateHome, '/ws/agents/vibe/homes-convertigo/users/studio/conversations/c1/.vibe-home');
  assert.deepEqual(plain(start.config.disabledTools), ['Convertigo_subagent-run', 'Convertigo_browser-verify', 'Convertigo_project-delete']);
  assert.equal(start.meta.conversationId, 'agent-1');
  assert.throws(() => C8O.subagentRun.run({ profile: 'constructor', task: 't' }, constructorHost().h), /needs inputs\.project/);
  // The MCP router hands an object argument to the sequence as JSON text.
  const fromText = constructorHost();
  C8O.subagentRun.run({ profile: 'constructor', task: 't', inputs: '{"project":"App","notes":"n"}', waitSec: 5 }, fromText.h);
  assert.equal(fromText.seen.starts[0].config.project, 'App');
  assert.equal(fromText.seen.starts[0].config.inputs.notes, 'n');
  assert.throws(() => C8O.subagentRun.run({ profile: 'constructor', task: 't', inputs: { project: 'Other' } }, constructorHost().h), /Other is not loaded/);
  assert.throws(() => C8O.subagentRun.run({ profile: 'constructor', task: 't', inputs: { project: 'App' } }, constructorHost({ callerBearer: () => '' }).h), /caller's MCP bearer/);
});

test('constructor report: created and modified QNames, checks, open issues, written files, journal-priced usage', () => {
  const C8O = loadAll();
  const output = { ok: true, report: { verdict: 'done', summary: 'Created.', created: ['App.sq:poste_stats'], modified: ['App.Application.NgxApp.pg:Home'],
    checks: [{ check: 'rows', status: 'passed', evidence: '3' }], openIssues: [], changedFiles: ['_c8oProject/sequences/poste_stats.yaml'] },
    stopReason: 'finished', toolCalls: 14, durationMs: 120000,
    usage: { tool: 'subagent-run', callId: 'build-1', model: 'glm-5-3', requests: 9, inputTokens: 90000, cachedTokens: 70000, outputTokens: 3000, cost: 0.04, costSource: 'journal' } };
  const run = { runId: 'build-1', profile: 'constructor', model: 'glm-5-3', task: 'x' };
  const result = plain(C8O.constructorRunner.runner.toResult(Object.assign({ reportFile: '/ws/subagents/build-1/report.json' }, output), run, '/ws'));
  assert.equal(result.report.verdict, 'done');
  assert.deepEqual(result.report.created, ['App.sq:poste_stats']);
  assert.deepEqual(result.report.changedFiles, ['_c8oProject/sequences/poste_stats.yaml']);
  assert.equal(result.reportFile, 'subagents/build-1/report.json');
  assert.equal(result.actions, 14);
  assert.equal(result.usage.costSource, 'journal');
  assert.equal(result.usage.profile, 'constructor');
});

test('project writes: the tools that write, the projects they write, and the constructor lock', () => {
  const C8O = loadAll();
  const sa = C8O.subagents;
  assert.deepEqual(plain(sa.projectsOfCall('tools_databaseobject_tree_apply', { target: 'App.sq:x' })), ['App']);
  assert.deepEqual(plain(sa.projectsOfCall('tools_ngx_page_create', { spec: '{"project":"App"}' })), ['App']);
  assert.deepEqual(plain(sa.projectsOfCall('tools_batch_call', { calls: [{ tool: 'databaseobject-tree-apply', arguments: { target: 'App.sq:x' } }, { tool: 'project-save', arguments: '{"project":"Lib"}' }] })), ['App', 'Lib']);
  assert.deepEqual(plain(sa.projectsOfCall('tools_databaseobject_tree_get', { target: 'App.sq:x' })), [], 'reads are never blocked');
  const lock = { runId: 'build-20261017-230000-0123abcd', expiresAt: 5000 };
  const host = alive => ({ readLock: key => (key === 'project:App' ? lock : null), readRun: () => ({ exists: true, alive }), now: () => 1000 });
  assert.match(sa.projectWriteBlocked('App', '', host(true)).message, /constructor sub-agent \(build-20261017-230000-0123abcd\) is building project App/);
  assert.equal(sa.projectWriteBlocked('App', 'build-20261017-230000-0123abcd', host(true)), null, 'the constructor itself writes');
  assert.equal(sa.projectWriteBlocked('App', '', host(false)), null, 'a dead run holds nothing');
  assert.equal(sa.projectWriteBlocked('Lib', '', host(true)), null);
  assert.equal(sa.projectWriteBlocked('App', '', Object.assign(host(true), { now: () => 9000 })), null, 'an expired lock holds nothing');
});

test('real usage from the child journal (cached tokens included) at the model prices of the child config', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'constructor-home-'));
  const dir = path.join(home, 'logs', 'session', 'unified', 's1', 'journal');
  fs.mkdirSync(dir, { recursive: true });
  const done = (i, c, o) => JSON.stringify({ type: 'action_result', payload: { result: { type: 'completion_succeeded', result: { usage: { input_tokens: i, cached_input_tokens: c, output_tokens: o } } } } });
  fs.writeFileSync(path.join(dir, '0001.jsonl'), [done(30000, 0, 500), done(40000, 29000, 700), '{"type":"action_result","payload":{"result":{"type":"tool_succeeded"}}}', '{"broken completion_succeeded'].join('\n') + '\n');
  const totals = runner.journalUsage(home);
  assert.deepEqual(totals, { requests: 2, inputTokens: 70000, cachedTokens: 29000, outputTokens: 1200 });
  const config = '[[models]]\nname = "mistral/zai-glm-5-3"\nprovider = "convertigo"\nalias = "glm-5-3"\ninput_price = 1.4\noutput_price = 4.4\ncached_input_price = 0.14\n\n[[models]]\nname = "mistral/mistral-large-4"\nalias = "mistral-large-4"\ninput_price = 2\noutput_price = 6\n';
  const prices = runner.modelPrices(config, 'glm-5-3');
  assert.deepEqual(prices, { input: 1.4, cachedInput: 0.14, output: 4.4 });
  assert.ok(Math.abs(runner.tokenCost(totals, prices) - (41000 * 1.4 + 29000 * 0.14 + 1200 * 4.4) / 1e6) < 1e-12);
  assert.deepEqual(runner.modelPrices(config, 'mistral/mistral-large-4'), { input: 2, cachedInput: null, output: 6 });
  assert.equal(runner.tokenCost(totals, null), null, 'no prices, no cost');
  assert.deepEqual(runner.journalUsage(path.join(home, 'nowhere')), { requests: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
});
