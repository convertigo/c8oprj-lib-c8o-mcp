// A verifier stopped by its time budget returns what it collected (its steps, screenshots and script findings) as a
// partial report instead of an error that lost the walk: the gateway gives up before the watchdog, each model request
// only gets the time left, and the watchdog itself answers the partial report when the run hangs elsewhere.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const agent = require(path.join(root, 'node/browser_verify_agent.cjs'));
const KEY = 'sk-test-0123456789abcdef';
const RUN = 'verify-20261117-101500-0a1b2c3d';
const plain = value => JSON.parse(JSON.stringify(value));

function fakeResponse(status, body, headers) {
  return {
    status,
    headers: { get: name => (headers || {})[String(name).toLowerCase()] || null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
  };
}

function completion(toolCalls, content) {
  return {
    model: 'mistral/mistral-large-4',
    choices: [{ message: { role: 'assistant', content: content || '', tool_calls: toolCalls } }],
    usage: { prompt_tokens: 1000, completion_tokens: 50, total_tokens: 1050 }
  };
}

function fakePlaywright() {
  let url = 'about:blank';
  const locator = {
    count: async () => 1, filter: () => locator, first: () => locator, nth: () => locator,
    click: async () => {}, evaluate: async () => 'input', fill: async () => {},
    ariaSnapshot: async () => '- heading "Orders"\n- button "Save"',
    screenshot: async () => Buffer.from('png')
  };
  const page = {
    url: () => url, title: async () => 'Demo', goto: async target => { url = target; }, waitForLoadState: async () => {},
    locator: () => locator, getByRole: () => locator, getByText: () => locator, getByLabel: () => locator, getByPlaceholder: () => locator,
    screenshot: async opts => { fs.writeFileSync(opts.path, 'png'); return Buffer.from('png'); },
    evaluate: async () => ({ issues: [] })
  };
  return { chromium: { connectOverCDP: async () => ({ contexts: () => [{ pages: () => [page] }] }) } };
}

function loadTool() {
  const sandbox = { C8O: { mcpAuth: { authenticateRequest: () => ({}) } } };
  for (const f of ['js/subagents.js', 'js/tools_browser_verify.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox);
  }
  return sandbox.C8O.browserVerify;
}

function answerOf(output, outDir) {
  const api = loadTool();
  const run = { runId: RUN, profile: 'verifier', outDir };
  output.reportFile = outDir + '/report.json';
  return plain(api.flatten(Object.assign({ status: 'finished', runId: RUN }, api.runner.toResult(output, run, path.dirname(outDir)))));
}

const twoSteps = [
  completion([{ id: 'n1', type: 'function', function: { name: 'navigate', arguments: '{"url":"http://localhost:4200/orders"}' } }], 'I open the orders page.'),
  completion([{ id: 'c1', type: 'function', function: { name: 'click', arguments: '{"target":"button \\"Save\\""}' } }])
];

test('each model request only gets the time left before the gateway deadline', () => {
  assert.equal(agent.requestTimeoutMs(Infinity), 120000, 'no deadline: the usual 120 s');
  assert.equal(agent.requestTimeoutMs(300000), 120000);
  assert.equal(agent.requestTimeoutMs(42500.7), 42500);
  assert.equal(agent.requestTimeoutMs(4999), 0, 'under 5 s left, no request is sent');
});

test('the gateway sends nothing past its deadline, and never waits on a 429 longer than the time left', async () => {
  const config = agent.normalizeConfig({ paths: ['a'], cdpEndpoint: 'http://127.0.0.1:1', outDir: os.tmpdir() });
  let calls = 0;
  const late = agent.createGateway(Object.assign({}, config, { deadlineAt: Date.now() + 3000 }), KEY, async () => { calls++; return fakeResponse(200, completion([])); });
  await assert.rejects(late.complete([]), e => e.code === 'TIME_BUDGET' && /no time is left for another model request/.test(e.message));
  assert.equal(calls, 0);
  const startedAt = Date.now();
  const limited = agent.createGateway(Object.assign({}, config, { deadlineAt: Date.now() + 12000 }), KEY, async () => {
    calls++;
    return fakeResponse(429, { error: { message: 'Rate limit exceeded' } }, { 'retry-after': '20' });
  });
  await assert.rejects(limited.complete([]), e => e.code === 'TIME_BUDGET' && /HTTP 429/.test(e.message) && /wait 20 s/.test(e.message));
  assert.equal(calls, 1);
  assert.ok(Date.now() - startedAt < 2000, 'no 20 s wait');
  // A timed-out request is retried only when enough time is left, then the budget error says what happened. The timer of
  // AbortSignal.timeout does not keep the event loop alive (a real request's socket does).
  const keepAlive = setInterval(() => {}, 1000);
  let aborted = 0;
  const slow = agent.createGateway(Object.assign({}, config, { deadlineAt: Date.now() + 5600 }), KEY, async (url, init) => {
    await new Promise((resolve, reject) => init.signal.addEventListener('abort', () => { aborted++; reject(init.signal.reason); }));
  });
  await assert.rejects(slow.complete([]), e => e.code === 'TIME_BUDGET' && /did not answer within 6 s/.test(e.message));
  clearInterval(keepAlive);
  assert.equal(aborted, 1);
});

test('cut by the time budget while waiting for the model: the walk so far comes back as a partial report', async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-verify-partial-'));
  const script = twoSteps.slice();
  let offset = 0;
  let sent = 0;
  const fetch = async () => {
    sent++;
    const reply = script.shift();
    if (!script.length) offset = 10 * 60000; // after the second turn, the gateway clock is past the deadline
    return fakeResponse(200, reply);
  };
  const result = await agent.run({ cdpEndpoint: 'http://127.0.0.1:1', url: 'http://localhost:4200/home', outDir, paths: ['Open the orders', 'Save an order'], checks: ['Orders listed', 'Order saved'], timeBudgetMs: 60000 },
    { key: KEY, playwright: fakePlaywright(), fetch, now: () => Date.now() + offset });
  assert.equal(sent, 2, 'no third request past the deadline');
  assert.equal(result.stopReason, 'time budget');
  assert.equal(result.report.verdict, 'partial');
  assert.match(result.report.summary, /^Cut by the time budget \(60 s\): the verifier was stopped after \d+ s while it waited for the model \(turn 3\), before it sent its report\. This is a partial report/);
  assert.match(result.report.summary, /\nSteps:\nA1 navigate http:\/\/localhost:4200\/orders: .+\nA2 click button "Save": /);
  assert.match(result.report.summary, /\nLast said: I open the orders page\.$/);
  assert.deepEqual(result.report.checks.map(c => [c.id, c.status]), [['C1', 'not_checked'], ['C2', 'not_checked']]);
  assert.match(result.report.checks[0].evidence, /cut before its report/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(outDir, 'report.json'), 'utf8')).trace.length, 2, 'the full trace stays in report.json');
  // The calling agent gets it as a finished answer, under the answer budget, never as a failed call.
  const answer = answerOf(Object.assign({ ok: true }, result), outDir);
  assert.equal(answer.status, 'finished');
  assert.equal(answer.verdict, 'partial');
  assert.equal(answer.stopReason, 'time budget');
  assert.match(answer.summary, /A2 click/);
  assert.equal(answer.partial, true, 'the answer itself says it is partial');
  assert.ok(answer.partialReason && answer.partialReason.length, 'and why');
  assert.ok(JSON.stringify(answer, null, 2).length < 15000, 'answer under 15,000 characters');
  // The closed output schema of browser-verify declares them: a strict client (Vibe) accepts the answer.
  const overrides = { C8O: {}, include() {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/schema_overrides.js'), 'utf8'), overrides);
  const schema = plain(overrides.C8O.schemaOverrides.decorateOutput('tools_browser_verify', overrides.C8O.schemaOverrides.applyOutput('tools_browser_verify', null, null, null)));
  const undeclared = Object.keys(answer).filter(key => !(key in schema.properties));
  assert.deepEqual(undeclared, []);
  assert.equal(schema.properties.partial.type, 'boolean');
});

test('the watchdog answers the partial report of a run that hangs, and the old error only without one', async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-verify-watchdog-'));
  const script = twoSteps.slice();
  let partial = null;
  let fromWatchdog = null;
  const fetch = async () => {
    if (!script.length) {
      // The model hangs: the watchdog fires during this request.
      fromWatchdog = agent.watchdogOutput(partial, 60000);
      return fakeResponse(200, completion([{ id: 'f', type: 'function', function: { name: 'finish', arguments: '{"verdict":"partial","summary":"late","checks":[]}' } }]));
    }
    return fakeResponse(200, script.shift());
  };
  await agent.run({ cdpEndpoint: 'http://127.0.0.1:1', url: 'http://localhost:4200/home', outDir, paths: ['Open the orders'] },
    { key: KEY, playwright: fakePlaywright(), fetch, onPartial: fn => { partial = fn; } });
  assert.equal(fromWatchdog.ok, true);
  assert.equal(fromWatchdog.stopReason, 'time budget');
  assert.equal(fromWatchdog.report.verdict, 'partial');
  assert.match(fromWatchdog.report.summary, /^Cut by the time budget \(60 s\): the verifier was stopped 60 s after its budget, before it sent its report \(turn 2\)\. This is a partial report/);
  assert.match(fromWatchdog.report.summary, /A1 navigate .*\nA2 click/s);
  assert.equal(fromWatchdog.toolCalls, 2);
  assert.deepEqual(plain(agent.watchdogOutput(null, 150000)), { ok: false, error: 'The verification agent was stopped after its time budget and 60 s more.' });
  assert.deepEqual(plain(agent.watchdogOutput(() => { throw new Error('no state'); }, 150000)).ok, false);
});

test('a gateway failure after the first turn keeps the walk; at the first turn it stays an error', async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-verify-gwerr-'));
  const script = twoSteps.slice();
  const fetch = async () => script.length ? fakeResponse(200, script.shift()) : fakeResponse(401, { error: { message: 'key revoked ' + KEY } });
  const result = await agent.run({ cdpEndpoint: 'http://127.0.0.1:1', url: 'http://localhost:4200/home', outDir, paths: ['Open the orders'] }, { key: KEY, playwright: fakePlaywright(), fetch });
  assert.equal(result.stopReason, 'gateway error');
  assert.match(result.report.summary, /^Stopped after \d+ s by a model gateway error at turn 3: The LLM gateway refused the request \(HTTP 401\)/);
  assert.ok(!result.report.summary.includes(KEY));
  assert.match(result.report.summary, /A2 click/);
  await assert.rejects(agent.run({ cdpEndpoint: 'http://127.0.0.1:1', outDir, paths: ['x'] },
    { key: KEY, playwright: fakePlaywright(), fetch: async () => fakeResponse(401, { error: { message: 'bad key' } }) }), /HTTP 401/);
});

test('a long partial summary is bounded in the tool answer', () => {
  const trace = Array.from({ length: 40 }, (_, i) => ({ id: 'A' + (i + 1), tool: 'click', args: { target: 'x'.repeat(300) }, failed: i % 2 === 1, result: 'y'.repeat(2000) }));
  const digest = agent.stepsDigest(trace, 'z'.repeat(5000));
  assert.match(digest, /^\nLast 10 of 40 steps:\nA31 click x+\.\.\. \(cut\): y+\.\.\. \(cut\)\nA32 FAILED click/);
  assert.ok(digest.length < 3000, String(digest.length));
  assert.equal(agent.stepsDigest([], ''), '\nNo browser step was done.');
  const answer = answerOf({ ok: true, report: { verdict: 'partial', summary: 's'.repeat(20000), checks: [] }, usage: {}, stopReason: 'time budget' }, '/ws/subagents/' + RUN);
  assert.ok(answer.summary.length <= 4000);
});
