// A failed step of the walk weighs only on the checks it concerns. Measured run 18/11: the verifier proved a new page
// (title, counter, rows, menu entry), then could not click the menu button to close the menu (a timeout) and closed it with
// Escape; that one failed click, never repeated with the same arguments, downgraded every passed check to not_checked and
// the verdict stayed partial over six calls.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const agent = require(process.env.BROWSER_VERIFY_AGENT_PATH || '../../node/browser_verify_agent.cjs');
const outDir = path.resolve(__dirname, '../../.night-tests/verify-failures');

const APP = 'http://localhost:28080/convertigo/projects/App/DisplayObjects/dev1/';
const LIST = [
  '- banner:',
  '  - button "menu"',
  '  - heading "Top items" [level=1]',
  '- heading "Top items" [level=2]',
  '- paragraph: 5 item(s)',
  '- table:',
  '  - row "Alpha $120.00"',
  '  - row "Beta $90.00"'
].join('\n');
const MENU = '- navigation:\n  - link "Top_items"\n';

// A viewer whose menu button opens the menu once, then times out while the menu covers it; Escape closes the menu.
function viewer() {
  const view = { url: APP + 'login', menuOpen: false, menuClicks: 0 };
  const body = {
    ariaSnapshot: async () => (view.menuOpen ? MENU : '') + LIST,
    innerText: async () => 'Top items\n5 item(s)\nAlpha $120.00\nBeta $90.00'
  };
  const role = (kind, name) => {
    const locator = {
      count: async () => 1, filter: () => locator, first: () => locator, nth: () => locator,
      click: async () => {
        if (kind === 'button' && name === 'menu') {
          view.menuClicks++;
          if (view.menuClicks > 1) throw new Error('locator.click: Timeout 6000ms exceeded.');
          view.menuOpen = true;
        }
      }
    };
    return locator;
  };
  const page = {
    url: () => view.url, title: async () => 'App', on: () => {},
    locator: () => body, getByRole: (kind, options) => role(kind, options && options.name), getByText: () => role('text', ''),
    keyboard: { press: async key => { if (key === 'Escape') view.menuOpen = false; } },
    evaluate: async () => undefined, waitForLoadState: async () => {},
    goto: async next => { view.url = next; return { status: () => 200 }; }
  };
  return { playwright: { chromium: { connectOverCDP: async () => ({ contexts: () => [{ pages: () => [page] }] }) } } };
}

// The model's turns, then its report.
function gateway(turns) {
  let turn = 0;
  return async () => {
    const call = turns[Math.min(turn, turns.length - 1)];
    turn++;
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ choices: [{ message: {
      content: 'next step', tool_calls: [{ id: String(turn), type: 'function', function: { name: call[0], arguments: JSON.stringify(call[1]) } }] } }] }) };
  };
}

const CHECKS = [
  'The page at address items-top loads with title "Top items".',
  'The counter shows 5 item(s).',
  'The table shows the rows Alpha $120.00 and Beta $90.00.',
  'The "Top items" entry is visible in the side menu.'
];

test('a failed step that no check relies on leaves the proven checks passed', async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const finish = { verdict: 'passed', summary: 'The page loads with its title, counter and rows; the side menu shows its entry.', checks: [
    { id: 'C1', check: CHECKS[0], status: 'passed', evidence: 'Loaded by its address; heading "Top items".', evidenceRefs: ['A1'], actionRefs: ['A1'],
      observedText: 'heading "Top items" [level=2]' },
    { id: 'C2', check: CHECKS[1], status: 'passed', evidence: 'The line under the heading reads "5 item(s)".', evidenceRefs: ['A5'], actionRefs: [],
      observedText: '5 item(s)' },
    { id: 'C3', check: CHECKS[2], status: 'passed', evidence: 'Both rows are read.', evidenceRefs: ['A5'], actionRefs: [],
      observedText: 'Alpha $120.00\nBeta $90.00' },
    { id: 'C4', check: CHECKS[3], status: 'passed', evidence: 'The side menu, opened with its button, lists the entry.', evidenceRefs: ['A2'], actionRefs: ['A2'],
      observedText: 'link "Top_items"' }
  ] };
  const out = await agent.run({ url: APP + 'login', outDir, cdpEndpoint: 'http://127.0.0.1:45991', actionTimeoutMs: 1000,
    paths: ['Open the side menu and its entry', 'Read the title, the counter and every row'], checks: CHECKS }, {
    key: 'fake', playwright: viewer().playwright, fetch: gateway([
      ['navigate', { url: APP + 'items-top' }],
      ['click', { target: 'button "menu"' }],
      ['click', { target: 'button "menu"' }],
      ['press', { key: 'Escape' }],
      ['read_text', {}],
      ['finish', finish]
    ]) });
  assert.equal(out.trace[2].failed, true, 'the second click on the menu button failed');
  assert.deepEqual(out.report.checks.map(c => c.id + ' ' + c.status), ['C1 passed', 'C2 passed', 'C3 passed', 'C4 passed'],
    out.report.checks.map(c => c.evidence).join('\n'));
  assert.equal(out.report.verdict, 'passed');
  assert.doesNotMatch(out.report.summary, /Proof incomplete/);
});

const trace = [
  { id: 'A1', tool: 'navigate', failed: false, args: { url: APP + 'items-top' }, result: 'Navigated.\n' + LIST },
  { id: 'A2', tool: 'wait_for', failed: true, args: { text: 'Gamma' }, result: 'Error: locator.waitFor: Timeout 10000ms exceeded waiting for Gamma' },
  { id: 'A3', tool: 'click', failed: true, args: { target: 'button "Save"' }, result: 'Error: locator.click: Timeout 6000ms exceeded.' },
  { id: 'A4', tool: 'snapshot', failed: false, args: {}, result: LIST }
];
const failures = {
  'wait_for{"text":"Gamma"}': { id: 'A2', tool: 'wait_for', args: { text: 'Gamma' }, message: 'wait_for: locator.waitFor: Timeout 10000ms exceeded.' },
  'click{"target":"button \\"Save\\""}': { id: 'A3', tool: 'click', args: { target: 'button "Save"' }, message: 'click: locator.click: Timeout 6000ms exceeded.' }
};
const judge = (checks, config, steps, pending) => agent.normalizeReport({ verdict: 'passed', checks }, config, [], pending || failures, steps || trace, []);
const passed = (id, check, extra) => Object.assign({ id, check, status: 'passed', evidence: 'Read on the page.', evidenceRefs: ['A4'], actionRefs: [] }, extra);

test('a timed out wait still blocks the checks about its text, until a later observation shows that text', () => {
  const config = { checks: ['Gamma is listed', 'Alpha is listed'] };
  const report = judge([passed('C1', 'Gamma is listed', { observedText: 'Alpha $120.00' }), passed('C2', 'Alpha is listed', { observedText: 'Alpha $120.00' })], config);
  assert.equal(report.checks[0].status, 'not_checked');
  assert.match(report.checks[0].evidence, /wait_for: locator\.waitFor: Timeout/);
  assert.equal(report.checks[1].status, 'passed', 'the wait for another text says nothing about this check');
  const shown = trace.concat([{ id: 'A5', tool: 'read_text', failed: false, args: {}, result: 'Gamma $40.00' }]);
  const later = judge([passed('C1', 'Gamma is listed', { observedText: 'Gamma $40.00', evidenceRefs: ['A5'] })], { checks: ['Gamma is listed'] }, shown);
  assert.equal(later.checks[0].status, 'passed', 'a later successful observation proves the waited text');
});

test('a failed step is never a quote, and a check that cites a failed action stays unproven', () => {
  const config = { checks: ['Gamma is listed', 'The form is saved'] };
  const report = judge([
    passed('C1', 'Gamma is listed', { observedText: 'Gamma', evidenceRefs: ['A2'] }),
    passed('C2', 'The form is saved', { observedText: 'Alpha $120.00', actionRefs: ['A3'] })
  ], config, trace, {});
  assert.equal(report.checks[0].status, 'not_checked', 'the error text of a failed wait is no observation of the page');
  assert.equal(report.checks[1].status, 'not_checked');
  assert.match(report.checks[1].evidence, /claimed action is absent or failed in the journal/);
  assert.equal(report.verdict, 'partial');
});

test('a successful navigation is a valid cited action, but never the proof of a business action', () => {
  const display = judge([passed('C1', 'The page loads with its title', { observedText: 'heading "Top items" [level=2]', evidenceRefs: ['A1'], actionRefs: ['A1'] })],
    { checks: ['The page loads with its title'] });
  assert.equal(display.checks[0].status, 'passed', display.checks[0].evidence);
  const business = judge([passed('C1', 'The item is created', { observedText: 'Alpha $120.00', evidenceRefs: ['A1'], actionRefs: ['A1'] })],
    { checks: ['The item is created'] });
  assert.equal(business.checks[0].status, 'not_checked');
  assert.match(business.checks[0].evidence, /cite actionRefs for the claimed business action/);
});

test('failures of the whole walk (runtime error, preflight) still block every passed check', () => {
  const report = judge([passed('C1', 'Alpha is listed', { observedText: 'Alpha $120.00' })], { checks: ['Alpha is listed'] }, trace,
    { runtime: 'Application runtime error: TypeError: x is undefined' });
  assert.equal(report.checks[0].status, 'not_checked');
  assert.match(report.checks[0].evidence, /Application runtime error/);
});

test('check ids given in another shape are matched to the requested checks', () => {
  const config = { checks: ['Alpha is listed', 'Beta is listed'] };
  const report = judge([passed('c1', 'Alpha est listé', { observedText: 'Alpha $120.00' }), passed('2', 'Beta est listé', { observedText: 'Beta $90.00' })], config, trace, {});
  assert.deepEqual(report.checks.map(c => c.id + ' ' + c.status + ' ' + c.check), ['C1 passed Alpha is listed', 'C2 passed Beta is listed']);
  assert.equal(report.verdict, 'passed');
});
