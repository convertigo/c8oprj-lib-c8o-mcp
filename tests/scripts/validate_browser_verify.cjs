const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const sources = ['js/subagents.js', 'js/tools_browser_verify.js', 'js/tools_subagent_run.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8'));
const agent = require(path.join(root, 'node/browser_verify_agent.cjs'));
const KEY = 'sk-test-0123456789abcdef';
// Values built inside the vm sandbox have that realm's prototypes.
const plain = value => JSON.parse(JSON.stringify(value));

// ---------------------------------------------------------------------------------------------------------------
// MCP side (js/tools_browser_verify.js, run by Rhino in the Studio)

function loadAll(auth) {
  const sandbox = { C8O: { mcpAuth: { authenticateRequest: () => auth } } };
  for (const source of sources) vm.runInNewContext(source, sandbox);
  return sandbox.C8O;
}
const load = auth => loadAll(auth).browserVerify;

function agentOutput(extra) {
  return Object.assign({
    ok: true,
    report: {
      verdict: 'failed',
      summary: 'Login works; the second post stays "En attente".',
      checks: [
        { id: 'C1', path: 'Path 1', check: 'List shown', status: 'passed', evidence: 'Postes à déclarer, 3 rows', screenshot: '/ws/.playwright-mcp/verify/v1/list.png' },
        { id: 'C2', path: 'Path 2', check: 'Both À jour', status: 'failed', evidence: 'Poste RH: En attente', screenshot: '/ws/.playwright-mcp/verify/v1/after.png' }
      ],
      visualDefects: [{ severity: 'minor', description: 'Declarer without accent', location: 'button', screenshot: '/ws/.playwright-mcp/verify/v1/after.png' }]
    },
    screenshots: [{ name: 'list', file: '/ws/.playwright-mcp/verify/v1/list.png', url: 'http://localhost:4200/postes' }],
    finalUrl: 'http://localhost:4200/postes',
    turns: 6,
    toolCalls: 12,
    stopReason: 'finished',
    durationMs: 19000,
    usage: { tool: 'browser-verify', callId: 'v1', model: 'mistral/mistral-large-4', requests: 6, inputTokens: 22000, cachedTokens: 0, outputTokens: 900, reasoningTokens: 0, totalTokens: 22900, cost: 0.0153, currency: 'USD', durationMs: 15000 },
    trace: [{ turn: 1, tool: 'navigate' }]
  }, extra || {});
}

// A Studio host whose runner finishes after `finishAfterMs` (fake clock, advanced by sleep).
const RUN = 'verify-20261017-221847-3d56e744';
function host(overrides, finishAfterMs, output) {
  const seen = { starts: [], locks: [], unlocked: [], sleeps: 0 };
  let clock = 1000;
  let started = null;
  let meta = null;
  let runId = null;
  const result = output === undefined ? agentOutput() : output;
  const h = Object.assign({
    readKey: () => KEY,
    readSettings: () => ({}),
    cdpEndpoint: params => load().normalizeCdpEndpoint(params.browserDebugPort, params.cdpEndpoint),
    probe: () => true,
    nodePath: () => '/studio/nodes/node/bin/node',
    playwrightModule: () => '/ws/agents/vibe/npm/node_modules/playwright-core',
    scriptPath: () => '/projects/lib_ConvertigoMCP/node/browser_verify_agent.cjs',
    workspaceRoot: () => '/ws',
    newRun: prefix => { runId = prefix === 'verify' ? RUN : prefix + '-20261017-221847-3d56e744'; return { runId, outDir: '/ws/subagents/' + runId }; },
    lock: (key, id, budget) => { seen.locks.push({ key, id, budget }); return '/ws/subagents/.lock-x'; },
    unlock: lockPath => { seen.unlocked.push(lockPath); },
    start: (command, env, stdinText, outDir, m) => { started = clock; meta = m; seen.starts.push({ command, env, config: JSON.parse(stdinText), outDir, meta: m }); },
    readRun: id => {
      if (started === null || id !== runId) return { exists: false };
      const done = clock - started >= (finishAfterMs || 0);
      return {
        exists: true, runId: id, outDir: '/ws/subagents/' + id, profile: meta.profile, runner: meta.runner, model: meta.model,
        task: meta.task, limits: meta.limits,
        output: done ? 'noise\n' + (typeof result === 'string' ? result : JSON.stringify(result)) + '\n' : '',
        alive: !done, startedAt: started,
        activity: [{ at: 1, turn: 1, text: 'navigate http://localhost:4200/home' }, { at: 2, turn: 2, text: 'click button "Login"' }],
        screenshots: ['/ws/subagents/' + id + '/login.png']
      };
    },
    now: () => clock,
    sleep: ms => { seen.sleeps++; clock += ms; }
  }, overrides || {});
  return { h, seen };
}

test('paths and checks: JSON array, objects or one per line, bullets dropped, bounded', () => {
  const api = load();
  assert.deepEqual(plain(api.parseList('["a","b"]', 'paths', 8)), ['a', 'b']);
  assert.deepEqual(plain(api.parseList('- first path\n2) second path\n\n', 'paths', 8)), ['first path', 'second path']);
  assert.deepEqual(plain(api.parseList([{ name: 'Login', steps: 'log in' }, { steps: '' }, 'x'], 'paths', 8)), [{ name: 'Login', steps: 'log in' }, 'x']);
  assert.deepEqual(plain(api.parseList('', 'checks', 8)), []);
  assert.throws(() => api.parseList(['1', '2', '3'], 'paths', 2), /at most 2/);
});

test('the browser is the conversation viewer on loopback only', () => {
  const api = load();
  assert.equal(api.normalizeCdpEndpoint('45991', ''), 'http://127.0.0.1:45991');
  assert.equal(api.normalizeCdpEndpoint('', 'http://localhost:45991/json/'), 'http://localhost:45991');
  assert.equal(api.normalizeCdpEndpoint('80', ''), '');
  assert.equal(api.normalizeCdpEndpoint('', ''), '');
  assert.throws(() => api.normalizeCdpEndpoint('', 'http://10.0.0.5:9222'), /loopback/);
  assert.throws(() => api.normalizeCdpEndpoint('', 'ws://127.0.0.1:9222'), /loopback/);
});

test('a verification runs the agent with the key in its environment only and returns a short report', () => {
  const api = load();
  const { h, seen } = host({}, 20000);
  const result = api.run({ browserDebugPort: '45991', url: 'http://localhost:4200/home', paths: '["Log in", "Declare two posts"]', checks: 'Both À jour', hints: 'rpca.demo / demo' }, h);
  assert.equal(seen.starts.length, 1);
  const start = seen.starts[0];
  assert.deepEqual(plain(start.command), ['/studio/nodes/node/bin/node', '/projects/lib_ConvertigoMCP/node/browser_verify_agent.cjs']);
  assert.equal(start.env.CONVERTIGO_LLM_API_KEY, KEY);
  assert.ok(!JSON.stringify(start.config).includes(KEY), 'the key never goes to the agent input');
  assert.equal(start.config.cdpEndpoint, 'http://127.0.0.1:45991');
  assert.equal(start.config.model, 'mistral/mistral-large-4');
  assert.equal(start.config.reasoning, 'none');
  assert.deepEqual(plain(start.config.paths), ['Log in', 'Declare two posts']);
  assert.deepEqual(plain(start.config.checks), ['Both À jour']);
  assert.equal(start.config.context, 'rpca.demo / demo');
  assert.equal(start.config.timeBudgetMs, 150000);
  assert.equal(start.config.lockFile, '/ws/subagents/.lock-x', 'the agent releases the browser lock itself');
  assert.deepEqual(plain(seen.locks), [{ key: 'http://127.0.0.1:45991', id: RUN, budget: 150000 }]);
  assert.equal(start.config.usageTool, 'browser-verify');
  assert.equal(start.config.profile, 'verifier');
  assert.equal(start.config.maxCostUsd, 0.5);
  assert.deepEqual(plain(start.meta.limits), { maxSteps: 40, timeBudgetSec: 150, maxCostUsd: 0.5 });
  assert.equal(start.meta.runner, 'vision-browser');

  assert.equal(result.status, 'finished');
  assert.equal(result.verificationId, RUN);
  assert.equal(result.verdict, 'failed');
  assert.equal(result.checks[1].status, 'failed');
  assert.equal(result.checks[0].screenshot, '.playwright-mcp/verify/v1/list.png');
  assert.equal(result.visualDefects[0].screenshot, '.playwright-mcp/verify/v1/after.png');
  assert.deepEqual(plain(result.screenshots), [{ name: 'list', path: '.playwright-mcp/verify/v1/list.png', url: 'http://localhost:4200/postes' }]);
  assert.equal(result.reportFile, 'subagents/' + RUN + '/report.json');
  assert.equal(result.modelCalls, 6);
  assert.equal(result.browserActions, 12);
  assert.equal(result.trace, undefined, 'the step trace stays in report.json');
  assert.deepEqual(plain(result.usage), {
    tool: 'browser-verify', callId: 'v1', runId: RUN, profile: 'verifier', model: 'mistral/mistral-large-4', requests: 6, inputTokens: 22000,
    cachedTokens: 0, outputTokens: 900, reasoningTokens: 0, totalTokens: 22900, cost: 0.0153, costSource: 'gateway', currency: 'USD', durationMs: 15000
  });
});

test('a verification longer than waitSec answers running, and its id collects the report later', () => {
  const api = load();
  const { h, seen } = host({}, 120000);
  const first = api.run({ browserDebugPort: '45991', paths: 'Log in' }, h);
  assert.equal(first.status, 'running');
  assert.equal(first.verificationId, RUN);
  assert.equal(first.elapsedMs, 50000, 'the default wait fits under a one-minute host limit');
  assert.equal(first.usage, undefined, 'no usage before the report: it is counted once, with the report');
  assert.deepEqual(plain(first.activity).map(a => a.text), ['navigate http://localhost:4200/home', 'click button "Login"'], 'a running answer shows the latest steps');
  assert.match(first.message, /verificationId/);
  const second = api.run({ verificationId: first.verificationId }, h);
  assert.equal(second.status, 'running');
  assert.equal(second.elapsedMs, 100000);
  const third = api.run({ verificationId: first.verificationId, waitSec: '30' }, h);
  assert.equal(third.status, 'finished');
  assert.equal(third.verdict, 'failed');
  assert.equal(seen.starts.length, 1, 'collecting never starts another agent');
  assert.throws(() => api.run({ verificationId: '../../etc/passwd' }, h), /runId must be the id/);
  assert.throws(() => api.run({ verificationId: 'verify-20261017-000000-00000000' }, h), /Unknown runId/);
});

test('an unpriced verification keeps its cost unknown, never 0', () => {
  const api = load();
  const output = agentOutput();
  output.usage.cost = null;
  const result = api.run({ browserDebugPort: '45991', paths: 'Log in' }, host({}, 0, output).h);
  assert.equal(result.usage.cost, null);
  assert.equal(result.usage.currency, '');
});

test('no viewer, a dead viewer or no key: a clear error before any model call', () => {
  const api = load();
  let started = 0;
  const start = () => { started++; };
  assert.throws(() => api.run({ paths: 'Log in' }, host({ start }).h), /mobile-builder-open first/);
  assert.throws(() => api.run({ browserDebugPort: '45991', paths: 'Log in' }, host({ start, probe: () => false }).h), /does not answer on http:\/\/127\.0\.0\.1:45991/);
  assert.throws(() => api.run({ browserDebugPort: '45991', paths: 'Log in' }, host({ start, readKey: () => '' }).h), /No Convertigo agent key/);
  assert.throws(() => api.run({ browserDebugPort: '45991', paths: '' }, host({ start }).h), /paths is required/);
  assert.throws(() => api.run({ browserDebugPort: '45991', paths: 'x', reasoning: 'max' }, host({ start }).h), /reasoning must be none or high/);
  assert.throws(() => api.run({ browserDebugPort: '45991', paths: 'x', waitSec: 'soon' }, host({ start }).h), /waitSec must be a number/);
  assert.throws(() => api.run({ browserDebugPort: '45991', paths: 'x' }, host({ start, lock: () => { throw new Error('Another verification (verify-1) is running'); } }).h), /Another verification/);
  assert.equal(started, 0);
});

test('agent failures come back as errors, and a failed start releases the browser lock', () => {
  const api = load();
  assert.throws(() => api.run({ browserDebugPort: '45991', paths: 'x' }, host({}, 0, { ok: false, error: 'No browser: cdpEndpoint is required.' }).h), /The verifier sub-agent failed: No browser/);
  let r = host({ start: () => { throw new Error('spawn failed'); } });
  assert.throws(() => api.run({ browserDebugPort: '45991', paths: 'x' }, r.h), /spawn failed/);
  assert.deepEqual(plain(r.seen.unlocked), ['/ws/subagents/.lock-x']);
  // The agent died without writing its result.
  r = host({}, 0, 'Error: Cannot find module');
  r.h.readRun = id => ({ exists: true, runId: id, outDir: '/ws/subagents/' + id, profile: 'verifier', runner: 'vision-browser', output: 'Error: Cannot find module', alive: false, startedAt: 1000, activity: [], screenshots: [] });
  assert.throws(() => api.run({ browserDebugPort: '45991', paths: 'x' }, r.h), /verifier sub-agent ended without a report.*subagents\/verify-.*agent\.log/);
});

test('profiles: defaults, workspace overrides and call limits within bounds', () => {
  const C8O = loadAll();
  const sa = C8O.subagents;
  let p = sa.resolveProfile('verifier', {}, {});
  assert.deepEqual(plain(p), { name: 'verifier', label: 'Vérificateur', runner: 'vision-browser', model: 'mistral/mistral-large-4', readOnly: true, idPrefix: 'verify',
    limits: { maxSteps: 40, timeBudgetSec: 150, maxCostUsd: 0.5 } });
  p = sa.resolveProfile('Verifier', { maxSteps: '500', maxCostUsd: '0.001' }, { profiles: { verifier: { model: 'other/vision', timeBudgetSec: 200 } } });
  assert.equal(p.model, 'other/vision', 'a workspace setting chooses the model of a profile');
  assert.deepEqual(plain(p.limits), { maxSteps: 80, timeBudgetSec: 200, maxCostUsd: 0.02 });
  assert.equal(sa.resolveProfile('verifier', { model: 'x/y' }, { profiles: { verifier: { model: 'other/vision' } } }).model, 'x/y');
  p = sa.resolveProfile('constructor', {}, {});
  assert.equal(p.model, 'glm-5-3');
  assert.equal(p.readOnly, false);
  assert.throws(() => sa.resolveProfile('poet', {}, {}), /Unknown profile poet: use one of verifier, constructor/);
  assert.throws(() => sa.resolveProfile('verifier', { maxSteps: 'many' }, {}), /maxSteps must be a number/);
});

test('subagent-run: a task to a profile, a nested report, the same run store and usage', () => {
  const C8O = loadAll();
  const { h, seen } = host({}, 120000);
  assert.throws(() => C8O.subagentRun.run({ profile: 'verifier' }, h), /task is required/);
  const first = C8O.subagentRun.run({ profile: 'verifier', task: 'Open the posts page and check the 3 demo posts', browserDebugPort: '45991',
    inputs: { url: 'http://localhost:4200/postes', checks: ['3 posts'] }, reportFormat: 'one line per post' }, h);
  assert.equal(first.status, 'running');
  assert.equal(first.runId, RUN);
  assert.equal(first.profile, 'verifier');
  assert.equal(first.model, 'mistral/mistral-large-4');
  assert.match(first.task, /Open the posts page/);
  const config = seen.starts[0].config;
  assert.deepEqual(plain(config.paths), ['Open the posts page and check the 3 demo posts'], 'without paths the task is the path');
  assert.equal(config.url, 'http://localhost:4200/postes');
  assert.deepEqual(plain(config.checks), ['3 posts']);
  assert.match(config.context, /Report format asked: one line per post/);
  assert.equal(config.usageTool, 'subagent-run');
  const done = C8O.subagentRun.run({ runId: first.runId, waitSec: 280 }, h);
  assert.equal(done.status, 'finished');
  assert.equal(done.report.verdict, 'failed');
  assert.equal(done.report.checks.length, 2);
  assert.equal(done.usage.profile, 'verifier');
  assert.equal(done.usage.runId, RUN);
  assert.equal(done.modelCalls, 6);
  assert.throws(() => C8O.subagentRun.run({ profile: 'constructor', task: 'Build lot 3' }, host().h), /constructor profile is not available/);
});

test('the gateway credits are spent only with a full MCP bearer', () => {
  for (const auth of [{ authenticated: false }, { authenticated: true, kind: 'nocode', scope: 'mcp:full' }, { authenticated: true, scope: 'mcp:read' }]) {
    assert.throws(() => load(auth).execute({}, { paths: 'x' }), /full Convertigo MCP bearer/);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Sub-agent (node/browser_verify_agent.cjs)

test('agent config: paths required, a browser required, bounded budgets', () => {
  assert.throws(() => agent.normalizeConfig({ cdpEndpoint: 'http://127.0.0.1:1', outDir: '/tmp/x' }), /paths is required/);
  assert.throws(() => agent.normalizeConfig({ paths: ['a'], outDir: '/tmp/x' }), /cdpEndpoint is required/);
  assert.throws(() => agent.normalizeConfig({ paths: ['a'], cdpEndpoint: 'x', outDir: '/tmp/x', reasoning: 'low' }), /reasoning/);
  const config = agent.normalizeConfig({ paths: '1. Log in\n2. Declare', checks: '["C"]', cdpEndpoint: 'http://127.0.0.1:1', outDir: '/tmp/x', maxSteps: 500, timeBudgetMs: 5 });
  assert.deepEqual(config.paths, [{ name: 'Path 1', steps: 'Log in' }, { name: 'Path 2', steps: 'Declare' }]);
  assert.deepEqual(config.checks, ['C']);
  assert.equal(config.maxSteps, 80);
  assert.equal(config.timeBudgetMs, 30000);
  assert.equal(config.model, 'mistral/mistral-large-4');
  const task = agent.buildTask(config);
  assert.match(task, /1\. Path 1: Log in/);
  assert.match(task, /C1: C/);
});

test('the report never says passed over a failed check or a blocking defect, and names screenshots by file', () => {
  const shots = [{ name: 'after', file: '/out/after.png' }];
  let report = agent.normalizeReport({ verdict: 'passed', summary: 's', checks: [{ check: 'a', status: 'failed', evidence: 'e', screenshot: 'after' }] }, {}, shots);
  assert.equal(report.verdict, 'failed');
  assert.equal(report.checks[0].screenshot, '/out/after.png');
  report = agent.normalizeReport({ verdict: 'passed', summary: 's', checks: [{ check: 'a', status: 'passed', evidence: 'e' }], visualDefects: [{ severity: 'blocking', description: 'blank page' }] }, {}, shots);
  assert.equal(report.verdict, 'partial');
  report = agent.normalizeReport({ verdict: 'weird', checks: [{ check: 'a', status: 'ok' }] }, {}, []);
  assert.equal(report.verdict, 'partial');
  assert.equal(report.checks[0].status, 'not_checked');
});

test('the context keeps the last two screenshots, the last three page texts and the last six other results', () => {
  const image = n => ({ role: 'tool', content: [{ type: 'text', text: 'shot ' + n }, { type: 'image_url', image_url: { url: 'data:x' } }] });
  const page = n => ({ role: 'tool', content: 'page ' + n + ' ' + 'x'.repeat(400), _snapshot: true });
  const messages = [image(1), page(1), image(2), page(2), page(3), image(3), page(4)];
  agent.compactHistory(messages, {});
  assert.equal(typeof messages[0].content, 'string');
  assert.match(messages[0].content, /shot 1 \(image no longer shown\)/);
  assert.ok(Array.isArray(messages[2].content));
  assert.ok(Array.isArray(messages[5].content));
  assert.match(messages[1].content, /older result elided/);
  assert.ok(messages[3].content.length > 300);
  assert.ok(messages[6].content.length > 300);
  const result = n => ({ role: 'tool', content: 'result ' + n + ' ' + 'y'.repeat(600) });
  const many = [1, 2, 3, 4, 5, 6, 7, 8].map(result);
  agent.compactHistory(many, {});
  assert.match(many[0].content, /^result 1 .*older result elided/s);
  assert.match(many[1].content, /older result elided/);
  assert.ok(many.slice(2).every(m => m.content.length > 600), 'the last six results stay whole');
});

function fakeResponse(status, body, cost) {
  return {
    status,
    headers: { get: name => (name === 'x-litellm-response-cost' && cost !== undefined ? String(cost) : null) },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
  };
}

function completion(toolCalls, usage) {
  return {
    model: 'mistral/mistral-large-4',
    choices: [{ message: { role: 'assistant', content: '', tool_calls: toolCalls } }],
    usage: Object.assign({ prompt_tokens: 1000, completion_tokens: 50, total_tokens: 1050 }, usage || {})
  };
}

test('gateway: usage summed per request, reasoning dropped when refused, 5xx retried, key redacted', async () => {
  const config = agent.normalizeConfig({ paths: ['a'], cdpEndpoint: 'http://127.0.0.1:1', outDir: '/tmp/x', reasoning: 'none' });
  const calls = [];
  const replies = [
    fakeResponse(400, { error: { message: 'reasoning_effort is not supported' } }),
    fakeResponse(502, 'bad gateway'),
    fakeResponse(200, completion([], { prompt_tokens_details: { cached_tokens: 200 } }), 0.002),
    fakeResponse(200, completion([]), 0.001)
  ];
  const fetch = async (url, init) => { calls.push(JSON.parse(init.body)); return replies.shift(); };
  const gateway = agent.createGateway(config, KEY, fetch);
  await gateway.complete([{ role: 'user', content: 'x' }]);
  await gateway.complete([{ role: 'user', content: 'y' }]);
  assert.equal(calls[0].reasoning_effort, 'none');
  assert.equal(calls[1].reasoning_effort, undefined);
  assert.equal(calls[3].reasoning_effort, undefined, 'a refused reasoning level is not sent again');
  const usage = gateway.finalUsage();
  assert.equal(usage.tool, 'browser-verify');
  assert.equal(usage.requests, 2);
  assert.equal(usage.inputTokens, 2000);
  assert.equal(usage.cachedTokens, 200);
  assert.equal(usage.outputTokens, 100);
  assert.equal(usage.cost, 0.003);
  assert.equal(usage.currency, 'USD');

  const unpriced = agent.createGateway(config, KEY, async () => fakeResponse(200, completion([])));
  await unpriced.complete([]);
  assert.equal(unpriced.finalUsage().cost, null);

  const refused = agent.createGateway(config, KEY, async () => fakeResponse(401, { error: { message: 'bad key ' + KEY } }));
  await assert.rejects(refused.complete([]), err => !err.message.includes(KEY) && /HTTP 401/.test(err.message));
});

function fakePlaywright(log) {
  let url = 'about:blank';
  const locator = {
    count: async () => 1,
    filter: () => locator,
    first: () => locator,
    nth: () => locator,
    click: async () => { log.push('click'); },
    evaluate: async () => 'input',
    fill: async value => { log.push('fill ' + value); },
    ariaSnapshot: async () => '- heading "Postes à déclarer"\n- button "Declarer"',
    screenshot: async () => Buffer.from('png')
  };
  const page = {
    url: () => url,
    title: async () => 'Demo',
    goto: async target => { url = target; log.push('goto ' + target); },
    waitForLoadState: async () => {},
    locator: () => locator,
    getByRole: (role, opts) => { log.push('role ' + role + ' ' + opts.name); return locator; },
    getByText: () => locator,
    getByLabel: () => locator,
    getByPlaceholder: () => locator,
    screenshot: async opts => { log.push('screenshot ' + path.basename(opts.path) + ' ' + opts.scale); fs.writeFileSync(opts.path, 'png'); return Buffer.from('png'); },
    evaluate: async () => ({ issues: [] })
  };
  return {
    chromium: {
      connectOverCDP: async endpoint => { log.push('cdp ' + endpoint); return { contexts: () => [{ pages: () => [page] }] }; }
    }
  };
}

test('agent loop: drives the viewer page, shows its screenshots to the model, returns the report and usage', async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-verify-'));
  const log = [];
  const sent = [];
  const script = [
    completion([{ id: 'a1', type: 'function', function: { name: 'navigate', arguments: '{"url":"http://localhost:4200/home"}' } }]),
    completion([
      { id: 'a2', type: 'function', function: { name: 'click', arguments: '{"target":"button \\"Declarer\\""}' } },
      { id: 'a3', type: 'function', function: { name: 'screenshot', arguments: '{"name":"After declare"}' } }
    ]),
    completion([{ id: 'a4', type: 'function', function: { name: 'finish', arguments: JSON.stringify({
      verdict: 'failed', summary: 'Poste RH stays En attente.',
      checks: [{ id: 'C1', check: 'Both À jour', status: 'failed', evidence: 'Poste RH: En attente', screenshot: 'after-declare' }],
      visualDefects: [{ severity: 'minor', description: 'Declarer lacks its accent', screenshot: 'after-declare' }]
    }) } }])
  ];
  const fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return fakeResponse(200, script.shift(), 0.001); };
  const result = await agent.run({ cdpEndpoint: 'http://127.0.0.1:45991', outDir, paths: ['Declare two posts'], url: 'http://localhost:4200/home' },
    { key: KEY, playwright: fakePlaywright(log), fetch });

  assert.equal(log[0], 'cdp http://127.0.0.1:45991');
  assert.ok(log.includes('role button Declarer'), 'snapshot notation targets become role locators');
  assert.ok(log.includes('screenshot after-declare.png css'));
  // The screenshot reaches the model as an image part of the tool result.
  const third = sent[2].messages;
  const shot = third.find(m => m.role === 'tool' && Array.isArray(m.content));
  assert.ok(shot && shot.content[1].type === 'image_url' && shot.content[1].image_url.url.startsWith('data:image/png;base64,'));
  assert.ok(!third.some(m => Object.keys(m).some(k => k.startsWith('_'))), 'internal fields never reach the gateway');
  assert.equal(sent[0].tools.length, agent.TOOLS.length);
  assert.ok(sent[0].messages[0].content.includes('never fix'));

  assert.equal(result.report.verdict, 'failed');
  assert.equal(result.report.checks[0].screenshot, path.join(outDir, 'after-declare.png'));
  assert.equal(result.usage.requests, 3);
  assert.equal(result.usage.cost, 0.003);
  assert.equal(result.stopReason, 'finished');
  assert.match(sent[1].messages.find(m => m.role === 'tool').content, /\[\d+ s of 240 s, turn 1 of 40\]$/, 'each result says the time and turns used');
  assert.ok(fs.existsSync(path.join(outDir, 'report.json')));
  assert.ok(!fs.readFileSync(path.join(outDir, 'report.json'), 'utf8').includes(KEY));
});

test('agent loop: a report cut at the answer limit is asked again, shorter', async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-verify-'));
  const sent = [];
  const replies = [
    Object.assign(completion([{ id: 'f1', type: 'function', function: { name: 'finish', arguments: '{"verdict":"failed","summary":"Poste RH st' } }]), {}),
    completion([{ id: 'f2', type: 'function', function: { name: 'finish', arguments: '{"verdict":"failed","summary":"Short.","checks":[]}' } }])
  ];
  replies[0].choices[0].finish_reason = 'length';
  const fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return fakeResponse(200, replies.shift(), 0.001); };
  const result = await agent.run({ cdpEndpoint: 'http://127.0.0.1:1', outDir, paths: ['x'] }, { key: KEY, playwright: fakePlaywright([]), fetch });
  assert.equal(sent[0].max_tokens, 3000);
  assert.match(sent[1].messages[sent[1].messages.length - 1].content, /cut at the answer limit/);
  assert.equal(result.report.summary, 'Short.');
});

test('agent loop: at the step budget the model must call finish', async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-verify-'));
  const sent = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    sent.push(body);
    const call = body.tool_choice === 'required'
      ? { id: 'f', type: 'function', function: { name: 'finish', arguments: '{"verdict":"partial","summary":"Out of steps.","checks":[]}' } }
      : { id: 's' + sent.length, type: 'function', function: { name: 'snapshot', arguments: '{}' } };
    return fakeResponse(200, completion([call]), 0.001);
  };
  const result = await agent.run({ cdpEndpoint: 'http://127.0.0.1:1', outDir, paths: ['loop'], maxSteps: 6 },
    { key: KEY, playwright: fakePlaywright([]), fetch });
  assert.equal(result.stopReason, 'step budget');
  assert.equal(result.report.verdict, 'partial');
  assert.ok(sent.length <= 6);
  assert.equal(sent[sent.length - 1].tool_choice, 'required');
});

// A real browser for the in-page layout scan, when a local Chrome and playwright-core are available.
function realPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_CORE_PATH, 'playwright-core'].filter(Boolean);
  for (const candidate of candidates) {
    try { return require(candidate); } catch (_missing) {}
  }
  return null;
}

test('layout scan: glued texts, overlaps and cut texts on a real page', async t => {
  const playwright = realPlaywright();
  if (!playwright) {
    t.skip('playwright-core not found (set PLAYWRIGHT_CORE_PATH)');
    return;
  }
  let browser;
  try {
    browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
  } catch (_noChrome) {
    t.skip('no local Chrome');
    return;
  }
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent('<div><span style="display:inline-block">Responsable :</span><span style="display:inline-block">RPCA Démo</span></div>' +
      '<p>Normal <b>bold</b> text with spaces</p>' +
      '<div style="position:relative;height:40px"><button style="position:absolute;left:0;top:0;width:120px">Enregistrer</button><button style="position:absolute;left:40px;top:4px;width:120px">Annuler</button></div>' +
      '<div style="width:60px;overflow:hidden;white-space:nowrap">Un libellé beaucoup trop long</div>');
    const scan = await page.evaluate(agent.layoutScan);
    const kinds = scan.issues.map(i => i.kind);
    assert.ok(scan.issues.some(i => i.kind === 'glued-text' && /Responsable/.test(i.a) && /RPCA/.test(i.b)), JSON.stringify(scan.issues));
    assert.ok(scan.issues.some(i => i.kind === 'overlap' && /Enregistrer/.test(i.a) && /Annuler/.test(i.b)), JSON.stringify(scan.issues));
    assert.ok(kinds.includes('text-cut'), JSON.stringify(scan.issues));
    assert.ok(!scan.issues.some(i => /bold/.test(i.a || '') || /bold/.test(i.b || '')), 'spaced inline text is not glued');
    // A card pulled up over the page header and its button (a negative margin): the covered texts are reported.
    await page.setContent('<style>.card{background:#fff;border:1px solid #ccc;padding:12px}</style>' +
      '<div class="card"><h2>Postes</h2><p>Select a record, edit it, or create a new one.</p></div>' +
      '<button style="margin:8px 0">Back to home</button>' +
      '<div class="card" style="position:relative;margin-top:-110px"><h2>Liste</h2><p>Rows: 3</p><p>Poste Accueil</p></div>' +
      '<button><span>Inside a button</span></button>');
    const covered = await page.evaluate(agent.layoutScan);
    const hidden = covered.issues.filter(i => i.kind === 'hidden-text').map(i => i.element);
    assert.ok(hidden.some(e => /Select a record/.test(e)), JSON.stringify(covered.issues));
    assert.ok(hidden.some(e => /Back to home/.test(e)), JSON.stringify(covered.issues));
    assert.equal(covered.issues[0].kind, 'hidden-text', 'covered texts come first');
    assert.ok(!hidden.some(e => /Inside a button|Liste|Poste Accueil/.test(e)), 'a text inside its own control or on top is not hidden');
  } finally {
    await browser.close();
  }
});

test('scroll: the app own scroll container, as Ionic pages scroll inside ion-content', async t => {
  const playwright = realPlaywright();
  if (!playwright) {
    t.skip('playwright-core not found (set PLAYWRIGHT_CORE_PATH)');
    return;
  }
  let browser;
  try {
    browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
  } catch (_noChrome) {
    t.skip('no local Chrome');
    return;
  }
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 400 } });
    await page.setContent('<style>html,body{height:100%;margin:0;overflow:hidden}#content{height:100%;overflow-y:auto}</style>' +
      '<div id="content"><h1>Top</h1><div style="height:1500px"></div><button>Bottom button</button></div>');
    const tools = agent.createTools({ page, screenshots: [] }, agent.normalizeConfig({ paths: ['x'], cdpEndpoint: 'x', outDir: os.tmpdir() }));
    const down = await tools.scroll({ to: 'bottom' });
    assert.match(down.text, /Scrolled bottom: \d+ of \d+ px/);
    assert.ok(await page.evaluate(() => document.getElementById('content').scrollTop) > 1000, 'the inner container scrolled, not the body');
    const into = await tools.scroll({ target: 'text=Top' });
    assert.match(into.text, /Scrolled to the target/);
    assert.equal(await page.evaluate(() => document.getElementById('content').scrollTop), 0);
  } finally {
    await browser.close();
  }
});

test('the gateway client waits on HTTP 429 as Retry-After asks, then succeeds', async () => {
  const answers = [
    { status: 429, headers: { 'retry-after': '0.05' }, body: '{"error":{"message":"Rate limit exceeded"}}' },
    { status: 200, headers: {}, body: JSON.stringify({ model: 'm', choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }) }
  ];
  const waits = [];
  let calls = 0;
  const fakeFetch = async () => {
    const a = answers[Math.min(calls++, answers.length - 1)];
    return { status: a.status, text: async () => a.body, headers: { get: (n) => a.headers[String(n).toLowerCase()] || null } };
  };
  const gateway = agent.createGateway({ gatewayUrl: 'https://gw/v1', model: 'm', onWait: (status, ms) => waits.push([status, ms]) }, 'sk-test', fakeFetch);
  const body = await gateway.complete([{ role: 'user', content: 'hi' }], {});
  assert.equal(calls, 2);
  assert.deepEqual(waits, [[429, 50]]);
  assert.ok(body);
});

test('viewport: desktop by default, mobile, WxH or an object, bounded', () => {
  const ctx = { C8O: {} };
  const src = fs.readFileSync(path.join(root, 'js/tools_browser_verify.js'), 'utf8');
  const m = /api\.parseViewport = function[\s\S]*?\n  \};\n/.exec(src)[0];
  const api = {};
  const str = v => v == null ? '' : String(v).trim();
  new Function('api', 'str', m)(api, str);
  assert.deepEqual(api.parseViewport(undefined), { width: 1280, height: 800 });
  assert.deepEqual(api.parseViewport('mobile'), { width: 390, height: 844 });
  assert.deepEqual(api.parseViewport('1024x768'), { width: 1024, height: 768 });
  assert.deepEqual(api.parseViewport({ width: 99999, height: 10 }), { width: 3840, height: 320 });
});

test('agent loop: a model that stops answering without tools is made to call finish', async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-verify-'));
  const sent = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    sent.push(body);
    const forced = body.tool_choice && body.tool_choice.function && body.tool_choice.function.name === 'finish';
    const calls = sent.length === 1
      ? [{ id: 's1', type: 'function', function: { name: 'snapshot', arguments: '{}' } }]
      : forced ? [{ id: 'f', type: 'function', function: { name: 'finish', arguments: '{"verdict":"passed","summary":"Priority shown on the 5 rows.","checks":[]}' } }] : [];
    return fakeResponse(200, completion(calls), 0.001);
  };
  const result = await agent.run({ cdpEndpoint: 'http://127.0.0.1:1', outDir, paths: ['list'] }, { key: KEY, playwright: fakePlaywright([]), fetch });
  // snapshot, empty answer (nudged), empty answer (finish required), finish.
  assert.equal(sent.length, 4);
  assert.equal(sent[2].tool_choice, 'auto');
  assert.deepEqual(sent[3].tool_choice, { type: 'function', function: { name: 'finish' } });
  assert.equal(result.report.summary, 'Priority shown on the 5 rows.');
  assert.equal(result.stopReason, 'finished');
});

test('gateway: a named tool refused in tool_choice falls back to required', async () => {
  const sent = [];
  const replies = [fakeResponse(400, { error: { message: 'Invalid tool_choice' } }), fakeResponse(200, completion([]), 0.001)];
  const config = agent.normalizeConfig({ cdpEndpoint: 'http://127.0.0.1:1', outDir: os.tmpdir(), paths: ['x'] });
  const gateway = agent.createGateway(config, KEY, async (url, init) => { sent.push(JSON.parse(init.body)); return replies.shift(); });
  await gateway.complete([{ role: 'user', content: 'x' }], { toolChoice: { type: 'function', function: { name: 'finish' } } });
  assert.deepEqual(sent.map(b => b.tool_choice), [{ type: 'function', function: { name: 'finish' } }, 'required']);
});
