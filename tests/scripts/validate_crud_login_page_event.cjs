const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The kit's login page logged in and opened the home page from onWillLoad (ngOnInit): the side menu brought back the
// instance already in the navigation stack, ngOnInit did not run again and the page stayed on its spinner ("Opening
// the application."), so the verifier could not go on (usage tests 29/10, S1 replay). It now runs on onWillEnter.

const root = path.resolve(__dirname, '../..');

function pages() {
  const events = [];
  const node = (name, extra) => Object.assign({ name, children: [] }, extra);
  const ctx = {
    trimmed: v => String(v == null ? '' : v).trim(),
    ensureArray: v => (Array.isArray(v) ? v : v == null ? [] : [v]),
    sessionBootstrapPageQName: project => project + '.Application.NgxApp.Login',
    sessionBootstrapPageName: () => 'Login',
    pageEventNode: (name, viewEvent, children, comment) => { events.push(viewEvent); return node(name, { viewEvent, children, comment }); },
    navigatePageActionNode: (name, route) => node(name, { route }),
    callSequenceActionNode: (name, requestable, children) => node(name, { requestable, children }),
    controlVariableNode: name => node(name),
    scriptLiteral: v => "'" + v + "'",
  };
  const context = { C8O: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/crud_ui_pages.js'), 'utf8'), context);
  return { P: context.C8O.crudUiPages, ctx, events };
}

test('the login page logs in and opens the home page every time it shows', () => {
  const { P, ctx, events } = pages();
  const load = P.buildSessionBootstrapPageLoadTree(ctx, 'Atelier', 'Home');
  const event = load.tree.children[0];
  assert.equal(event.viewEvent, 'onWillEnter');
  assert.equal(event.children[0].requestable, 'Atelier.auth_login');
  assert.equal(event.children[0].children[2].route, '/home');
  assert.deepEqual(events, ['onWillEnter']);
  const source = fs.readFileSync(path.join(root, 'js/crud_ui_pages.js'), 'utf8');
  const rootTree = source.slice(source.indexOf('function buildSessionBootstrapPageRootTree'), source.indexOf('function buildSessionBootstrapPageLoadTree'));
  assert.match(rootTree, /ctx\.pageEventNode\(\s*"PageEvent",\s*"onWillEnter",/);
});
