const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// The visual finishing pass of browser-verify (design: true): the MCP side (rounds, opt-out, inputs, the flat result) and
// the Node side (node/design_review.cjs: page list, measured failures, consistency across pages, the scan on a real page).

const root = path.resolve(__dirname, '../..');
const sources = ['js/subagents.js', 'js/tools_browser_verify.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8'));
const design = require(path.join(root, 'node/design_review.cjs'));
const agent = require(path.join(root, 'node/browser_verify_agent.cjs'));
const KEY = 'sk-test-0123456789abcdef';
const plain = value => JSON.parse(JSON.stringify(value));

function load() {
  const sandbox = { C8O: { mcpAuth: { authenticateRequest: () => ({ authenticated: true, scope: 'mcp:full' }) } } };
  for (const source of sources) vm.runInNewContext(source, sandbox);
  return sandbox.C8O.browserVerify;
}

const RUN = 'verify-20261116-101010-3d56e744';
function host(overrides, output) {
  const seen = { starts: [] };
  let clock = 10 * 3600 * 1000;
  let started = null;
  let meta = null;
  let ledger = {};
  const h = Object.assign({
    readKey: () => KEY,
    readSettings: () => ({}),
    cdpEndpoint: () => 'http://127.0.0.1:45991',
    probe: () => true,
    nodePath: () => '/node',
    playwrightModule: () => '/pw',
    scriptPath: () => '/agent.cjs',
    workspaceRoot: () => '/ws',
    newRun: () => ({ runId: RUN, outDir: '/ws/subagents/' + RUN }),
    lock: () => '/ws/subagents/.lock',
    unlock: () => {},
    start: (command, env, stdinText, outDir, m) => { started = clock; meta = m; seen.starts.push({ config: JSON.parse(stdinText), meta: m }); },
    readRun: id => ({ exists: true, runId: id, outDir: '/ws/subagents/' + id, profile: meta.profile, runner: meta.runner, model: meta.model, task: meta.task,
      limits: meta.limits, output: JSON.stringify(output) + '\n', alive: false, startedAt: started, activity: [], screenshots: [] }),
    now: () => clock,
    sleep: ms => { clock += ms; },
    designSetting: () => '',
    designLedger: { read: () => JSON.parse(JSON.stringify(ledger)), write: data => { ledger = data; } }
  }, overrides || {});
  return { h, seen, advance: ms => { clock += ms; } };
}

function designOutput() {
  return {
    ok: true,
    report: {
      verdict: 'failed', summary: '2 page(s) reviewed', checks: [], visualDefects: [], designSuggestions: [],
      design: {
        checklist: design.CHECKLIST,
        pages: [{ name: 'deals', url: 'http://h/projects/Crm/DisplayObjects/mobile/deals', title: 'Deals', summary: 'Clean.',
          checks: [{ id: 'spacing', status: 'failed', severity: 'minor', finding: 'Filter bar and table do not align.', fix: 'Align them.' },
            { id: 'contrast', status: 'failed', severity: 'major', finding: 'Muted label 3.1:1.', fix: 'Darken it.' }],
          measured: [{ check: 'contrast', issue: '"Stage" reads at 3.1:1', where: 'span' }],
          screenshots: { desktop: '/ws/subagents/' + RUN + '/design-01-deals-desktop.png', phone: '/ws/subagents/' + RUN + '/design-01-deals-phone.png' } }],
        toFix: [{ page: 'deals', id: 'spacing', severity: 'minor', finding: 'x', fix: 'y' }, { page: 'deals', id: 'contrast', severity: 'major', finding: 'x', fix: 'y' }],
        skipped: [], errors: [], consoleErrors: []
      }
    },
    screenshots: [], finalUrl: '', turns: 2, toolCalls: 4, stopReason: 'finished', durationMs: 42000,
    usage: { tool: 'browser-verify', model: 'mistral/mistral-large-4', requests: 2, inputTokens: 9000, cachedTokens: 0, outputTokens: 700, totalTokens: 9700, cost: 0.0076, currency: 'USD' }
  };
}

test('a design review runs the agent in design mode with the pages, 35 s per page, and returns the points to fix major first', () => {
  const api = load();
  const { h, seen } = host({}, designOutput());
  const result = api.run({ url: 'http://h/projects/Crm/DisplayObjects/mobile/', design: 'true',
    pages: '["dashboard", "deals", {"name": "Deal form", "path": "deal-form"}, "companies", "contacts"]' }, h);
  const config = seen.starts[0].config;
  assert.equal(config.mode, 'design');
  assert.deepEqual(plain(config.pages), ['dashboard', 'deals', { name: 'Deal form', path: 'deal-form' }, 'companies', 'contacts']);
  assert.equal(config.timeBudgetMs, 215000, '90 s and 25 s a page');
  assert.match(seen.starts[0].meta.task, /^Design review: dashboard, deals, Deal form deal-form/);
  assert.equal(result.status, 'finished');
  assert.equal(result.design.round, 1);
  assert.equal(result.design.roundsLeft, 1);
  assert.deepEqual(plain(result.design.toFix.map(f => f.id)), ['contrast', 'spacing'], 'major first');
  assert.equal(result.design.pages[0].screenshots.desktop, 'subagents/' + RUN + '/design-01-deals-desktop.png');
  assert.equal(result.usage.cost, 0.0076);
});

test('two automatic rounds per project, a third only when the user asks; a refused call uses no round', () => {
  const api = load();
  const { h, seen } = host({}, designOutput());
  const call = { url: 'http://h/projects/Crm/DisplayObjects/mobile/', design: true, pages: ['deals'] };
  assert.throws(() => api.run({ url: call.url, design: true }, h), /design needs url .* and pages/);
  assert.equal(api.run(call, h).design.round, 1);
  assert.equal(api.run(call, h).design.round, 2);
  const third = api.run(call, h);
  assert.equal(third.status, 'skipped');
  assert.match(third.reason, /rounds are used up/);
  assert.equal(seen.starts.length, 2);
  // Another project has its own rounds; the user can ask for one more.
  assert.equal(api.run({ url: 'http://h/projects/Maint/DisplayObjects/mobile/', design: true, pages: ['orders'] }, h).design.round, 1);
  assert.equal(api.run(Object.assign({ userAsked: 'true' }, call), h).design.round, 3);
  // Two apps of the Studio's dev viewer, each on its own port, have their own rounds.
  assert.equal(api.designProject('http://localhost:43091/dashboard'), 'localhost:43091');
  assert.equal(api.designProject('http://localhost:46847/sites', ''), 'localhost:46847');
  assert.equal(api.designProject('http://h/projects/Crm/DisplayObjects/mobile/'), 'Crm');
  // A walk is not a round.
  assert.equal(api.designRound({ read: () => ({ Crm: [1, 2] }), write: () => {} }, 'Crm', false, 1000 + 7 * 3600 * 1000).round, 1, 'rounds older than 6 h are forgotten');
});

test('the global symbol turns the finishing pass off', () => {
  const api = load();
  const { h, seen } = host({ designSetting: () => 'off' }, designOutput());
  const result = api.run({ url: 'http://h/projects/Crm/DisplayObjects/mobile/', design: true, pages: ['deals'] }, h);
  assert.equal(result.status, 'skipped');
  assert.match(result.reason, /convertigo\.mcp\.design\.review=off/);
  assert.equal(seen.starts.length, 0);
});

test('node side: pages from a list, measured contrast and overflow fail their point, consistency across pages', () => {
  assert.deepEqual(design.pageList(['dashboard', { name: 'Form', path: 'deal-form' }, '- deals', '']), [
    { name: 'dashboard', path: 'dashboard' }, { name: 'Form', path: 'deal-form' }, { name: 'deals', path: 'deals' }]);
  const checks = design.normalizeChecks({ checks: [{ id: 'contrast', status: 'passed', finding: 'fine' }, { id: 'hierarchy', status: 'failed', finding: 'Two titles', fix: 'Hide one' }] },
    [{ check: 'contrast', issue: '"Stage" reads at 2.9:1 (4.5:1 needed).' }, { check: 'spacing', issue: 'two edges' }]);
  assert.deepEqual(checks.map(c => c.id), ['spacing', 'hierarchy', 'states', 'contrast', 'consistency', 'phone']);
  assert.equal(checks.find(c => c.id === 'contrast').status, 'failed', 'a measured contrast fails whatever the model said');
  assert.match(checks.find(c => c.id === 'contrast').finding, /Measured: "Stage" reads at 2\.9:1/);
  assert.equal(checks.find(c => c.id === 'spacing').status, 'not_checked', 'a measured spacing is evidence for the model, not a failure by itself');
  assert.equal(checks.find(c => c.id === 'hierarchy').fix, 'Hide one');
  const sig = (font, size, radius, button) => ({ signature: { font, titleSize: size, panelRadius: radius, buttonColor: button, pageBackground: 'rgb(246,247,251)' } });
  const across = design.consistencyFindings([sig('Inter', 28, 12, 'rgb(79,70,229)'), sig('Inter', 28, 12, 'rgb(79,70,229)'), sig('Inter', 22, 4, 'rgb(79,70,229)')]);
  assert.equal(across[0].length, 0);
  assert.deepEqual(across[2].map(f => f.issue), ['The title size is 22 px here, 28 px on most pages.', 'The panel corner radius is 4 px here, 12 px on most pages.']);
});

function fakeBrowser(log) {
  let url = 'about:blank';
  const cdp = { send: async (method, params) => { log.push(method + (params && params.width ? ' ' + params.width : '')); } };
  const page = {
    url: () => url,
    goto: async target => { url = target; log.push('goto ' + target); return { status: () => 200 }; },
    waitForLoadState: async () => {},
    waitForFunction: async () => {},
    evaluate: async (fn, phone) => ({ findings: phone ? [{ check: 'phone', issue: 'Tap target of 20x20 px.', where: 'ion-button' }] : [], signature: { font: 'Inter', titleSize: 28 }, title: 'Deals' }),
    screenshot: async opts => { fs.writeFileSync(opts.path, 'png'); log.push('shot ' + path.basename(opts.path)); return Buffer.from('png'); }
  };
  const context = { pages: () => [page], newCDPSession: async () => cdp };
  return { chromium: { connectOverCDP: async () => ({ contexts: () => [context] }) } };
}

test('node side: a design run opens each page at two widths, sends both screenshots in one call per page and reports the points to fix', async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-review-'));
  const log = [];
  const sent = [];
  const review = { checks: [{ id: 'hierarchy', status: 'failed', severity: 'major', finding: 'No main action.', fix: 'Put New deal in the page header.' },
    { id: 'spacing', status: 'passed', finding: 'Aligned.' }], summary: 'Clean list.' };
  const fetch = async (u, init) => {
    sent.push(JSON.parse(init.body));
    return { status: 200, headers: { get: n => (n === 'x-litellm-response-cost' ? '0.003' : null) },
      text: async () => JSON.stringify({ model: 'mistral/mistral-large-4', usage: { prompt_tokens: 4000, completion_tokens: 300, total_tokens: 4300 },
        choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: 'r1', type: 'function', function: { name: 'review', arguments: JSON.stringify(review) } }] } }] }) };
  };
  const result = await agent.run({ mode: 'design', cdpEndpoint: 'http://127.0.0.1:45991', outDir, url: 'http://h/projects/Crm/DisplayObjects/mobile/', pages: ['deals', 'dashboard'] },
    { key: KEY, playwright: fakeBrowser(log), fetch });
  assert.deepEqual(log.filter(l => /^goto/.test(l)), ['goto http://h/projects/Crm/DisplayObjects/mobile/deals', 'goto http://h/projects/Crm/DisplayObjects/mobile/dashboard']);
  assert.ok(log.includes('Emulation.setDeviceMetricsOverride 390') && log.includes('Emulation.setDeviceMetricsOverride 1280'));
  assert.ok(log.includes('shot design-01-deals-desktop.png') && log.includes('shot design-01-deals-phone.png'));
  assert.equal(sent.length, 2, 'one model call per page');
  assert.equal(sent[0].tool_choice.function.name, 'review');
  assert.equal(sent[0].tools[0].function.name, 'review');
  const images = sent[0].messages[1].content.filter(c => c.type === 'image_url');
  assert.equal(images.length, 2);
  assert.match(sent[0].messages[1].content[0].text, /\[phone\] Tap target of 20x20 px\./);
  const d = result.report.design;
  assert.equal(result.report.verdict, 'failed');
  assert.equal(d.pages.length, 2);
  assert.deepEqual(d.toFix.map(f => f.page + ':' + f.id), ['deals:hierarchy', 'deals:phone', 'dashboard:hierarchy', 'dashboard:phone']);
  assert.equal(result.usage.requests, 2);
  assert.equal(result.usage.cost, 0.006);
  assert.ok(fs.existsSync(path.join(outDir, 'report.json')));
});

function realPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_CORE_PATH, 'playwright-core'].filter(Boolean);
  for (const candidate of candidates) {
    try { return require(candidate); } catch (_missing) {}
  }
  return null;
}

test('the scan on a real page: contrast, raw values, an empty list, two titles, and the phone width', async t => {
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const html = '<body style="margin:0;font-family:Arial;background:#f6f7fb">' +
      '<ion-content class="app-page" style="display:block;padding:24px">' +
      '<h2 class="app-title" style="font-size:28px">Deals</h2><h2>Other title</h2>' +
      '<div style="background:#fff;padding:12px"><span style="color:#bbbbbb">Muted label</span> <span>Amount</span> <span>185000.00</span> <span>2026-10-18</span> <span>undefined</span></div>' +
      '<ion-list style="display:block;min-height:10px"></ion-list>' +
      '<div style="background:#3b5bdb;padding:8px"><span style="display:inline-block;background:color(srgb 0.99 0.99 1);padding:4px"><span style="color:#3b5bdb;background:rgba(59,91,219,0.1)">Role pill</span></span></div>' +
      '<div style="width:600px;background:#eef">A very wide block that does not fit a phone</div>' +
      '</ion-content></body>';
    await page.setContent(html);
    const desktop = await page.evaluate(design.designScan, false);
    const issues = desktop.findings.map(f => f.check + ': ' + f.issue);
    assert.ok(issues.some(i => /^contrast: "Muted label" reads at 1\.\d+:1/.test(i)), issues.join('\n'));
    assert.ok(issues.some(i => /^states: Number without grouping or unit: "185000\.00"/.test(i)), issues.join('\n'));
    assert.ok(issues.some(i => /^states: Date shown as the database stores it: "2026-10-18"/.test(i)), issues.join('\n'));
    assert.ok(issues.some(i => /^states: Raw technical value "undefined"/.test(i)), issues.join('\n'));
    assert.ok(issues.some(i => /^states: A list shows no row and no empty state/.test(i)), issues.join('\n'));
    assert.ok(issues.some(i => /^hierarchy: 2 page titles/.test(i)), issues.join('\n'));
    assert.ok(!issues.some(i => /"Amount"/.test(i)), 'a readable text is not reported');
    assert.ok(!issues.some(i => /"Role pill"/.test(i)), 'a background in color(srgb ...) is read: the pill sits on white, not on the blue bar');
    assert.equal(desktop.signature.titleSize, 28);
    await page.setViewportSize({ width: 390, height: 844 });
    const phone = await page.evaluate(design.designScan, true);
    assert.ok(phone.findings.some(f => f.check === 'phone' && /scrolls sideways|past the right edge/.test(f.issue)), JSON.stringify(phone.findings));
  } finally {
    await browser.close();
  }
});

test('the answer of a full review stays under the 14k answer budget: 8 pages, every point failed, long texts', () => {
  const api = load();
  const long = 'x'.repeat(600);
  const pages = Array.from({ length: 8 }, (_, i) => ({ name: 'page-' + i, url: 'http://studio-8-4-design.localhost:18116/convertigo/projects/SalesPipeline/DisplayObjects/mobile/page-' + i,
    title: 'Page ' + i, summary: long, checks: design.CHECK_IDS.map(id => ({ id, status: 'failed', severity: 'major', finding: long, fix: long })),
    measured: Array.from({ length: 20 }, () => ({ check: 'contrast', issue: long, where: 'ion-label' })),
    screenshots: { desktop: '/ws/subagents/' + RUN + '/design-0' + i + '-page-' + i + '-desktop.png', phone: '/ws/subagents/' + RUN + '/design-0' + i + '-page-' + i + '-phone.png' } }));
  const output = designOutput();
  output.report.design = { checklist: design.CHECKLIST, pages, toFix: pages.flatMap(p => p.checks.map(c => Object.assign({ page: p.name }, c))), skipped: [], errors: [long, long], consoleErrors: [long] };
  const { h } = host({}, output);
  const result = api.run({ url: 'http://h/projects/Crm/DisplayObjects/mobile/', design: true, pages: pages.map(p => p.name) }, h);
  const size = JSON.stringify(result, null, 2).length;
  assert.ok(size < 13000, 'answer of ' + size + ' indented characters (budget 14000)');
  assert.equal(result.design.toFix.length, 14);
  assert.equal(result.design.moreInReport, 34, 'the rest is in reportFile');
  assert.ok(result.design.toFix.every(f => f.finding.length <= 200 && f.fix.length <= 200));
  assert.deepEqual(plain(result.design.pages[0].passed), []);
  assert.equal(result.design.pages[0].failed, 6);
  assert.equal(result.screenshots, undefined, 'the screenshots are given per page');
});
