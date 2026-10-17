const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'js/tools_browser_verify.js'), 'utf8');
const agent = require(path.join(root, 'node/browser_verify_agent.cjs'));
const KEY = 'sk-test-0123456789abcdef';
// Values built inside the vm sandbox have that realm's prototypes.
const plain = value => JSON.parse(JSON.stringify(value));

// ---------------------------------------------------------------------------------------------------------------
// MCP side (js/tools_browser_verify.js, run by Rhino in the Studio)

function load(auth) {
  const sandbox = { C8O: { mcpAuth: { authenticateRequest: () => auth } } };
  vm.runInNewContext(source, sandbox);
  return sandbox.C8O.browserVerify;
}

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

function host(overrides) {
  const seen = { spawns: [], locks: 0, released: 0, probes: [] };
  const h = Object.assign({
    readKey: () => KEY,
    cdpEndpoint: params => load().normalizeCdpEndpoint(params.browserDebugPort, params.cdpEndpoint),
    probe: endpoint => { seen.probes.push(endpoint); return true; },
    nodePath: () => '/studio/nodes/node/bin/node',
    playwrightModule: () => '/ws/agents/vibe/npm/node_modules/playwright-core',
    scriptPath: () => '/projects/lib_ConvertigoMCP/node/browser_verify_agent.cjs',
    workspaceRoot: () => '/ws',
    newRun: () => ({ callId: 'v1', outDir: '/ws/.playwright-mcp/verify/v1' }),
    lock: () => { seen.locks++; return () => { seen.released++; }; },
    spawn: (command, env, stdinText, timeoutMs, outDir) => {
      seen.spawns.push({ command, env, config: JSON.parse(stdinText), timeoutMs, outDir });
      return { exitCode: 0, stdout: 'noise\n' + JSON.stringify(agentOutput()) + '\n', timedOut: false };
    }
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
  const { h, seen } = host();
  const result = api.run({ browserDebugPort: '45991', url: 'http://localhost:4200/home', paths: '["Log in", "Declare two posts"]', checks: 'Both À jour', hints: 'rpca.demo / demo' }, h);
  assert.equal(seen.spawns.length, 1);
  const spawn = seen.spawns[0];
  assert.deepEqual(plain(spawn.command), ['/studio/nodes/node/bin/node', '/projects/lib_ConvertigoMCP/node/browser_verify_agent.cjs']);
  assert.equal(spawn.env.CONVERTIGO_LLM_API_KEY, KEY);
  assert.ok(!JSON.stringify(spawn.config).includes(KEY), 'the key never goes to the agent input');
  assert.equal(spawn.config.cdpEndpoint, 'http://127.0.0.1:45991');
  assert.equal(spawn.config.model, 'mistral/mistral-large-4');
  assert.equal(spawn.config.reasoning, 'none');
  assert.deepEqual(spawn.config.paths, ['Log in', 'Declare two posts']);
  assert.deepEqual(spawn.config.checks, ['Both À jour']);
  assert.equal(spawn.config.context, 'rpca.demo / demo');
  assert.equal(spawn.config.timeBudgetMs, 150000);
  assert.equal(spawn.timeoutMs, 150000 + 45000);
  assert.equal(seen.locks, 1);
  assert.equal(seen.released, 1);

  assert.equal(result.verdict, 'failed');
  assert.equal(result.checks[1].status, 'failed');
  assert.equal(result.checks[0].screenshot, '.playwright-mcp/verify/v1/list.png');
  assert.equal(result.visualDefects[0].screenshot, '.playwright-mcp/verify/v1/after.png');
  assert.deepEqual(plain(result.screenshots), [{ name: 'list', path: '.playwright-mcp/verify/v1/list.png', url: 'http://localhost:4200/postes' }]);
  assert.equal(result.reportFile, '.playwright-mcp/verify/v1/report.json');
  assert.equal(result.modelCalls, 6);
  assert.equal(result.browserActions, 12);
  assert.equal(result.trace, undefined, 'the step trace stays in report.json');
  assert.deepEqual(plain(result.usage), {
    tool: 'browser-verify', callId: 'v1', model: 'mistral/mistral-large-4', requests: 6, inputTokens: 22000,
    cachedTokens: 0, outputTokens: 900, reasoningTokens: 0, totalTokens: 22900, cost: 0.0153, currency: 'USD', durationMs: 15000
  });
});

test('an unpriced verification keeps its cost unknown, never 0', () => {
  const api = load();
  const output = agentOutput();
  output.usage.cost = null;
  const { h } = host({ spawn: () => ({ exitCode: 0, stdout: JSON.stringify(output), timedOut: false }) });
  const result = api.run({ browserDebugPort: '45991', paths: 'Log in' }, h);
  assert.equal(result.usage.cost, null);
  assert.equal(result.usage.currency, '');
});

test('no viewer, a dead viewer or no key: a clear error before any model call', () => {
  const api = load();
  let spawned = 0;
  const spawn = () => { spawned++; return { exitCode: 0, stdout: '', timedOut: false }; };
  assert.throws(() => api.run({ paths: 'Log in' }, host({ spawn }).h), /mobile-builder-open first/);
  assert.throws(() => api.run({ browserDebugPort: '45991', paths: 'Log in' }, host({ spawn, probe: () => false }).h), /does not answer on http:\/\/127\.0\.0\.1:45991/);
  assert.throws(() => api.run({ browserDebugPort: '45991', paths: 'Log in' }, host({ spawn, readKey: () => '' }).h), /No Convertigo agent key/);
  assert.throws(() => api.run({ browserDebugPort: '45991', paths: '' }, host({ spawn }).h), /paths is required/);
  assert.throws(() => api.run({ browserDebugPort: '45991', paths: 'x', reasoning: 'max' }, host({ spawn }).h), /reasoning must be none or high/);
  assert.equal(spawned, 0);
});

test('agent failures come back as errors and the browser lock is always released', () => {
  const api = load();
  let r = host({ spawn: () => ({ exitCode: 0, stdout: JSON.stringify({ ok: false, error: 'No browser: cdpEndpoint is required.' }), timedOut: false }) });
  assert.throws(() => api.run({ browserDebugPort: '45991', paths: 'x' }, r.h), /The verification failed: No browser/);
  assert.equal(r.seen.released, 1);
  r = host({ spawn: () => ({ exitCode: -1, stdout: '', timedOut: true }) });
  assert.throws(() => api.run({ browserDebugPort: '45991', paths: 'x', timeBudgetSec: '60' }, r.h), /did not end within 105 s/);
  assert.equal(r.seen.released, 1);
  r = host({ spawn: () => { throw new Error('spawn failed'); } });
  assert.throws(() => api.run({ browserDebugPort: '45991', paths: 'x' }, r.h), /spawn failed/);
  assert.equal(r.seen.released, 1);
  r = host({ spawn: () => ({ exitCode: 1, stdout: 'Error: Cannot find module', timedOut: false }) });
  assert.throws(() => api.run({ browserDebugPort: '45991', paths: 'x' }, r.h), /without a result \(exit code 1\).*agent\.log/);
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

test('the context keeps the last two screenshots and the last three page texts', () => {
  const image = n => ({ role: 'tool', content: [{ type: 'text', text: 'shot ' + n }, { type: 'image_url', image_url: { url: 'data:x' } }] });
  const page = n => ({ role: 'tool', content: 'page ' + n + ' ' + 'x'.repeat(400), _snapshot: true });
  const messages = [image(1), page(1), image(2), page(2), page(3), image(3), page(4)];
  agent.compactHistory(messages, {});
  assert.equal(typeof messages[0].content, 'string');
  assert.match(messages[0].content, /shot 1 \(image no longer shown\)/);
  assert.ok(Array.isArray(messages[2].content));
  assert.ok(Array.isArray(messages[5].content));
  assert.match(messages[1].content, /older page text elided/);
  assert.ok(messages[3].content.length > 300);
  assert.ok(messages[6].content.length > 300);
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
  assert.ok(fs.existsSync(path.join(outDir, 'report.json')));
  assert.ok(!fs.readFileSync(path.join(outDir, 'report.json'), 'utf8').includes(KEY));
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
  } finally {
    await browser.close();
  }
});
