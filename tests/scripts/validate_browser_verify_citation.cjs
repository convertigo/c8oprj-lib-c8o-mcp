// A passed check must quote a recorded observation (observedText inside a step A... or a network answer N...). Models
// paraphrase their quotes, and a run whose captures were all valid ended with every check not_checked: the exact excerpt
// is now recovered from the observations when it can be found deterministically, the cited ones first; a claim that no
// observation holds stays not_checked. A report cut by the time budget says so: partial: true and its reason.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const agent = require(path.join(root, 'node/browser_verify_agent.cjs'));
const plain = value => JSON.parse(JSON.stringify(value));

// A snapshot as the verifier records it: report.json keeps 1200 characters, the check reads the whole text it saw.
function snapshot(id, text) {
  const entry = { id, tool: 'snapshot', failed: false, result: text.substring(0, 1200) };
  Object.defineProperty(entry, 'observed', { value: text, enumerable: false });
  return entry;
}

const filler = '- listitem "Menu entry"\n'.repeat(80);
const page = '- heading "Orders"\n' + filler + '- row "Order #42 — Paid — 3 items"\n- row "Order #43 — Pending — 1 item"\n- button "Refund"';
const trace = [
  { id: 'A1', tool: 'click', failed: false, args: { target: 'link "Orders"' }, result: 'Clicked link "Orders".' },
  snapshot('A2', page)
];
const config = { checks: ['Order 42 is paid'] };
const passed = extra => Object.assign({ id: 'C1', check: 'Order 42 is paid', status: 'passed', evidence: 'The orders list shows it.',
  evidenceRefs: ['A2'], actionRefs: [] }, extra);
const judge = (check, observations) => agent.normalizeReport({ verdict: 'passed', checks: [check] }, config, [], {}, observations || trace, []);

test('a paraphrased quote is replaced by the exact excerpt of the cited observation, and the check passes', () => {
  // Other case, spacing and punctuation, past the 1200 characters report.json keeps.
  assert.ok(page.indexOf('Order #42') > 1200);
  const report = judge(passed({ observedText: 'order 42 - paid - 3 items' }));
  assert.equal(report.verdict, 'passed');
  assert.equal(report.checks[0].status, 'passed');
  assert.equal(report.checks[0].observedText, 'Order #42 — Paid — 3 items');
  assert.ok(page.includes(report.checks[0].observedText), 'an exact excerpt of the observation');
  assert.match(report.checks[0].evidence, /\[quote matched in A2\]$/);
  // Words around the quote and a word order kept: the shortest run of the observation holding its words.
  const wordy = judge(passed({ observedText: 'The order 42 is displayed as paid with 3 items' }));
  assert.equal(wordy.checks[0].status, 'passed');
  assert.equal(wordy.checks[0].observedText, 'Order #42 — Paid — 3 items');
  // A quote right but cited on the wrong observation (or an unknown id): the observation that holds it is cited instead.
  const moved = judge(passed({ observedText: 'Order #42 — Paid', evidenceRefs: ['A1', 'A7'] }));
  assert.equal(moved.checks[0].status, 'passed');
  assert.deepEqual(plain(moved.checks[0].evidenceRefs), ['A1', 'A2']);
  // A quote taken from the evidence text when observedText is empty.
  const fromEvidence = judge(passed({ evidence: 'The list shows "order #42, paid, 3 items".' }));
  assert.equal(fromEvidence.checks[0].status, 'passed');
  assert.equal(fromEvidence.checks[0].observedText, 'Order #42 — Paid — 3 items');
});

test('a claim that no recorded observation holds stays not_checked', () => {
  for (const claim of ['Order 77 refunded to the customer', 'order 43 paid 3 items', 'invented result', '']) {
    const report = judge(passed({ observedText: claim }));
    assert.equal(report.checks[0].status, 'not_checked', claim);
    assert.equal(report.verdict, 'partial', claim);
    assert.match(report.summary, /^Proof incomplete for C1/, claim);
  }
  // Numbers are never approximated, and a run too far from the claim's words is not taken for it.
  assert.equal(agent.recoverCitation({ observedText: 'Order 42 paid 4 items' }, trace, [trace[1]]), null);
  assert.equal(agent.recoverCitation({ observedText: 'heading orders refund paid pending' }, trace, [trace[1]]), null);
  // No observation at all.
  assert.equal(judge(passed({ observedText: 'Order #42' }), []).checks[0].status, 'not_checked');
});

function fakePlaywright() {
  let url = 'about:blank';
  const locator = { count: async () => 1, filter: () => locator, first: () => locator, nth: () => locator, click: async () => {},
    evaluate: async () => 'input', fill: async () => {}, ariaSnapshot: async () => page, screenshot: async () => Buffer.from('png') };
  const p = { url: () => url, title: async () => 'Demo', goto: async t => { url = t; }, waitForLoadState: async () => {}, locator: () => locator,
    getByRole: () => locator, getByText: () => locator, getByLabel: () => locator, getByPlaceholder: () => locator,
    screenshot: async o => { fs.writeFileSync(o.path, 'png'); return Buffer.from('png'); }, evaluate: async () => ({ issues: [] }) };
  return { chromium: { connectOverCDP: async () => ({ contexts: () => [{ pages: () => [p] }] }) } };
}

const reply = calls => ({ status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ model: 'm',
  choices: [{ message: { role: 'assistant', content: '', tool_calls: calls } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) });

test('a run whose model paraphrases its quote ends with the check passed on the exact excerpt', async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-verify-citation-'));
  const script = [
    [{ id: 's', type: 'function', function: { name: 'snapshot', arguments: '{}' } }],
    [{ id: 'f', type: 'function', function: { name: 'finish', arguments: JSON.stringify({ verdict: 'passed', summary: 'Order 42 is paid.',
      checks: [{ id: 'C1', check: 'Order 42 is paid', status: 'passed', evidence: 'Seen in the list.', evidenceRefs: ['A1'], actionRefs: [],
        observedText: 'ORDER 42 paid 3 items' }] }) } }]
  ];
  const result = await agent.run({ cdpEndpoint: 'http://127.0.0.1:1', url: 'http://localhost:4200/orders', outDir, paths: ['Open the orders'], checks: ['Order 42 is paid'] },
    { key: 'sk-test-0123456789', playwright: fakePlaywright(), fetch: async () => reply(script.shift()) });
  assert.equal(result.report.checks[0].status, 'passed');
  assert.equal(result.report.checks[0].observedText, 'Order #42 — Paid — 3 items');
  assert.equal(result.report.verdict, 'passed');
  assert.equal(result.report.partial, undefined, 'a finished report is not partial');
  assert.ok(!fs.readFileSync(path.join(outDir, 'report.json'), 'utf8').includes('"observed"'), 'report.json keeps the cut text only');
});

test('a budget that elapses gives a partial report: partial true, its reason, the checks not seen not_checked', async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-verify-elapsed-'));
  let offset = 0;
  const fetch = async () => {
    offset = 10 * 60000; // the next request would start past the gateway deadline
    return reply([{ id: 's', type: 'function', function: { name: 'snapshot', arguments: '{}' } }]);
  };
  const result = await agent.run({ cdpEndpoint: 'http://127.0.0.1:1', url: 'http://localhost:4200/orders', outDir, paths: ['Open the orders'],
    checks: ['Order 42 is paid', 'Order 43 is pending'], timeBudgetMs: 30000 },
    { key: 'sk-test-0123456789', playwright: fakePlaywright(), fetch, now: () => Date.now() + offset });
  assert.equal(result.report.partial, true);
  assert.match(result.report.partialReason, /^time budget: the model did not answer before the budget ran out$/);
  assert.equal(result.report.verdict, 'partial');
  assert.deepEqual(result.report.checks.map(c => c.status), ['not_checked', 'not_checked']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(outDir, 'report.json'), 'utf8')).report.partial, true);
  // subagent-run gives the flag in its report (browser-verify keeps verdict partial, stopReason and the summary).
  const sandbox = { C8O: { mcpAuth: { authenticateRequest: () => ({}) } } };
  for (const f of ['js/subagents.js', 'js/tools_browser_verify.js']) vm.runInNewContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox);
  const shaped = plain(sandbox.C8O.browserVerify.runner.toResult(Object.assign({ ok: true }, result), { runId: 'verify-20261117-101500-0a1b2c3d', profile: 'verifier' }, outDir));
  assert.equal(shaped.report.partial, true);
  assert.match(shaped.report.partialReason, /^time budget/);
  const finished = plain(sandbox.C8O.browserVerify.runner.toResult({ report: { verdict: 'passed', checks: [] }, usage: {} }, { runId: 'r', profile: 'verifier' }, '/ws'));
  assert.equal('partial' in finished.report, false);
});
