// The entry guard of browser-verify: the main document decides whether the route opens. A failed passive subresource
// (favicon, image, font, source map, subframe) is a note; the document's 4xx/5xx and a failed script still stop the run.
const {test, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const agent = require(process.env.BROWSER_VERIFY_AGENT_PATH || '../../node/browser_verify_agent.cjs');

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bv-subresources-'));
after(() => fs.rmSync(outDir, {recursive: true, force: true}));

const origin = 'http://localhost:28080';
const pageUrl = origin + '/convertigo/projects/site/index.html';
const LOAD_404 = 'Failed to load resource: the server responded with a status of 404 (Not Found)';

// A static page (no application shell). load(emit) runs during goto: the requests, responses and console messages
// the browser sends while the document loads.
function fixture({status = 200, load = () => {}} = {}) {
  const handlers = {};
  let url = 'about:blank';
  const mainFrame = {parentFrame: () => null};
  const childFrame = {parentFrame: () => mainFrame};
  const emit = {
    request(resourceUrl, resourceType, frame = mainFrame) {
      const request = {url: () => resourceUrl, resourceType: () => resourceType, frame: () => frame};
      if (handlers.request) handlers.request(request);
      return request;
    },
    response(resourceUrl, code, request = null) {
      if (handlers.response) handlers.response({url: () => resourceUrl, status: () => code, request: () => request,
        json: async () => { throw new Error('not JSON'); }});
    },
    consoleError(text, resourceUrl) {
      if (handlers.console) handlers.console({type: () => 'error', text: () => text, location: () => ({url: resourceUrl, lineNumber: 0, columnNumber: 0})});
    }
  };
  const locator = {count: async () => 1, filter: () => locator, first: () => locator, nth: () => locator,
    ariaSnapshot: async () => '- heading "Opening hours" [level=1]\n- paragraph: Monday to Friday, 9:00 to 18:00'};
  const page = {
    on: (name, fn) => { handlers[name] = fn; },
    url: () => url, title: async () => 'Opening hours', locator: () => locator, getByRole: () => locator, getByText: () => locator,
    evaluate: async () => [], waitForLoadState: async () => {},
    goto: async next => {
      url = next;
      const doc = emit.request(next, 'document');
      emit.response(next, status, doc);
      if (status >= 400) emit.consoleError('Failed to load resource: the server responded with a status of ' + status + ' (Not Found)', next);
      else load(emit);
      return {status: () => status};
    }
  };
  return {page, playwright: {chromium: {connectOverCDP: async () => ({contexts: () => [{pages: () => [page]}]})}}};
}

const cfg = {url: pageUrl, outDir, actionTimeoutMs: 10, cdpEndpoint: 'http://127.0.0.1:45991',
  paths: ['Open the page and read the opening hours'], checks: ['The opening hours are shown']};

// A model that takes one snapshot, then reports the check passed on that snapshot.
function passingModel() {
  let turn = 0;
  const fetch = async () => {
    turn++;
    const call = turn === 1
      ? {name: 'snapshot', arguments: '{}'}
      : {name: 'finish', arguments: JSON.stringify({verdict: 'passed', summary: 'The opening hours are shown.', checks: [{id: 'C1',
        check: 'The opening hours are shown', status: 'passed', evidence: 'The page shows the opening hours.',
        evidenceRefs: ['A1'], observedText: 'Monday to Friday, 9:00 to 18:00'}]})};
    return {ok: true, status: 200, headers: {get: () => null},
      text: async () => JSON.stringify({choices: [{message: {tool_calls: [{id: String(turn), type: 'function', 'function': call}]}}]})};
  };
  return {fetch, calls: () => turn};
}

const refusedModel = {calls: 0, fetch: async () => { refusedModel.calls++; throw new Error('must not call the model'); }};

test('a static page whose favicon, image, font, source map and frame fail to load is still verified', async () => {
  const f = fixture({load: emit => {
    // The favicon is asked by the browser itself: no request event, only its response and its console message.
    emit.response(origin + '/favicon.ico', 404);
    emit.consoleError(LOAD_404, origin + '/favicon.ico');
    const logo = emit.request(origin + '/convertigo/projects/site/img/logo?v=2', 'image');
    emit.response(origin + '/convertigo/projects/site/img/logo?v=2', 404, logo);
    emit.consoleError(LOAD_404, origin + '/convertigo/projects/site/img/logo?v=2');
    // No type known: the extension decides.
    emit.consoleError('Failed to load resource: net::ERR_CONNECTION_REFUSED', origin + '/convertigo/projects/site/fonts/brand.woff2');
    emit.consoleError(LOAD_404, origin + '/convertigo/projects/site/site.js.map');
    const frame = emit.request(origin + '/convertigo/projects/site/map.html', 'document', {parentFrame: () => ({})});
    emit.response(origin + '/convertigo/projects/site/map.html', 404, frame);
    emit.consoleError(LOAD_404, origin + '/convertigo/projects/site/map.html');
  }});
  const model = passingModel();
  const answer = await agent.run(cfg, {key: 'fake', playwright: f.playwright, fetch: model.fetch});
  assert.equal(answer.stopReason, 'finished');
  assert.equal(model.calls(), 2);
  assert.equal(answer.report.verdict, 'passed', JSON.stringify(answer.report.checks));
  assert.equal(answer.report.checks[0].status, 'passed');
  // Kept as notes: the console messages name the address, the failed requests stay in autoDefects (favicon excepted).
  const notes = answer.consoleMessages.map(m => m.text);
  assert.equal(notes.length, 5);
  assert.ok(notes.every(text => /\[subresource: a note, not a route failure\]$/.test(text)), notes.join('\n'));
  assert.ok(notes.some(text => text.includes('(' + origin + '/favicon.ico)')));
  assert.ok(notes.some(text => text.includes('(' + origin + '/convertigo/projects/site/img/logo)')));
  const defects = answer.report.autoDefects;
  assert.equal(defects.filter(d => d.kind === 'console-error').length, 0);
  assert.ok(defects.some(d => d.kind === 'failed-request' && d.location === origin + '/convertigo/projects/site/img/logo'));
  assert.ok(!defects.some(d => /favicon/.test(d.location)));
  assert.ok(JSON.stringify(answer.report).length < 14000);
});

test('a static page whose document answers 404 fails its route before any model call', async () => {
  const f = fixture({status: 404});
  refusedModel.calls = 0;
  const answer = await agent.run(cfg, {key: 'fake', playwright: f.playwright, fetch: refusedModel.fetch});
  assert.equal(refusedModel.calls, 0);
  assert.equal(answer.turns, 0);
  assert.equal(answer.stopReason, 'APPLICATION_ROUTE_FAILED');
  assert.equal(answer.report.verdict, 'partial');
  assert.match(answer.report.summary, /Application route failed \(HTTP 404\)/);
  assert.doesNotMatch(answer.report.summary, /visualiseur/);
});

test('a document 500 still fails the route', async () => {
  const f = fixture({status: 500});
  refusedModel.calls = 0;
  const answer = await agent.run(cfg, {key: 'fake', playwright: f.playwright, fetch: refusedModel.fetch});
  assert.equal(refusedModel.calls, 0);
  assert.equal(answer.stopReason, 'APPLICATION_ROUTE_FAILED');
  assert.match(answer.report.summary, /HTTP 500/);
});

test('a failed script or API call is not a subresource note: the route still fails', async () => {
  for (const [resource, type] of [['/convertigo/projects/site/main.js', 'script'], ['/convertigo/projects/site/api/hours', 'fetch'],
    ['/convertigo/projects/site/unknown', '']]) {
    const f = fixture({load: emit => {
      if (type) emit.request(origin + resource, type);
      emit.response(origin + resource, 404);
      emit.consoleError(LOAD_404, origin + resource);
    }});
    refusedModel.calls = 0;
    const answer = await agent.run(cfg, {key: 'fake', playwright: f.playwright, fetch: refusedModel.fetch});
    assert.equal(refusedModel.calls, 0, resource);
    assert.equal(answer.stopReason, 'APPLICATION_ROUTE_FAILED', resource);
    assert.match(answer.report.summary, new RegExp('Application runtime error: Failed to load resource.*\\(' + origin + resource + '\\)'));
  }
});

test('a page error still fails the route of a static page', async () => {
  const f = fixture();
  const goto = f.page.goto;
  let pageError;
  const on = f.page.on;
  f.page.on = (name, fn) => { if (name === 'pageerror') pageError = fn; on(name, fn); };
  f.page.goto = async next => { const response = await goto(next); pageError(new Error('hours is not defined')); return response; };
  refusedModel.calls = 0;
  const answer = await agent.run(cfg, {key: 'fake', playwright: f.playwright, fetch: refusedModel.fetch});
  assert.equal(refusedModel.calls, 0);
  assert.equal(answer.stopReason, 'APPLICATION_ROUTE_FAILED');
  assert.match(answer.report.summary, /hours is not defined/);
});
