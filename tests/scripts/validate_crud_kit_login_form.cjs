const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The kit's login page signed in as demo: a task that needed real users rebuilt a login form by hand with tree-apply
// and ran out of time, twice (usage tests 29/10, S7). auth "form" gives a login page that asks a user name and a
// password and calls the project's login sequence, the generated one or the app's own.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = v => JSON.parse(JSON.stringify(v));

function load() {
  const context = { C8O: { util: { parseObjectInput: v => (typeof v === 'string' ? JSON.parse(v) : v) } } };
  vm.createContext(context);
  for (const file of ['js/crud_ui_nodes.js', 'js/crud_ui_pages.js', 'js/crud_ui_actions.js', 'js/crud_ui_kit.js']) {
    vm.runInContext(read(file), context);
  }
  return context.C8O;
}

const base = {
  trimmed: v => String(v == null ? '' : v).trim(),
  ensureArray: v => (Array.isArray(v) ? v : v == null ? [] : [v]),
  toBoolean: (v, d) => (v == null ? d : v === true || String(v) === 'true'),
};

function pagesCtx(C8O) {
  const U = C8O.crudUi;
  return Object.assign({}, base, {
    scriptLiteral: v => U.scriptLiteral(base, v),
    plainTextNode: (n, v) => U.plainTextNode(base, n, v),
    scriptTextNode: (n, v) => U.scriptTextNode(base, n, v),
    textElementNode: (c, n, t) => U.textElementNode(base, c, n, t),
    pageEventNode: (n, e, ch, cm) => U.pageEventNode(base, n, e, ch, cm),
    sessionBootstrapPageQName: p => p + '.Application.NgxApp.Login',
    sessionBootstrapPageName: () => 'Login',
  });
}

function find(node, name) {
  if (!node) return null;
  if (node.name === name) return node;
  for (const child of node.children || []) {
    const hit = find(child, name);
    if (hit) return hit;
  }
  return null;
}

test('auth takes a mode string, JSON text or an object, with the login sequence and its variables', () => {
  const C8O = load();
  const ctx = base;
  assert.equal(C8O.crudUiKit.normalizeAuth(ctx, undefined).mode, 'demo');
  assert.equal(C8O.crudUiKit.normalizeAuth(ctx, 'form').mode, 'form');
  const own = C8O.crudUiKit.normalizeAuth(ctx, '{"mode":"form","sequence":"App.sq:sign_in","userVariable":"email","passwordVariable":"secret"}');
  assert.deepEqual(JSON.parse(JSON.stringify(own)), { mode: 'form', sequence: 'sign_in', userVariable: 'email', passwordVariable: 'secret' });
  assert.equal(C8O.crudUiKit.normalizeAuth(ctx, { mode: 'other' }).mode, 'demo');
});

test('the login form calls the login sequence with the typed values and opens the home page anew on success', () => {
  const C8O = load();
  const ctx = pagesCtx(C8O);
  const auth = { mode: 'form', sequence: 'sign_in', userVariable: 'email', passwordVariable: 'secret', refusedText: 'Connexion refusée.', userLabel: 'E-mail', passwordLabel: 'Mot de passe' };
  const trees = C8O.crudUiPages.buildLoginFormPageTrees(ctx, 'App', 'Home', auth, { name: 'Login', children: [{ name: 'Header' }, { name: 'Content' }, { name: 'PageEvent' }] });
  assert.deepEqual(plain(trees.root.children.map(c => c.name)), ['Header', 'Content', 'PageEvent']);
  const call = find(trees.root, 'DoLogin');
  assert.equal(call.properties.requestable, 'App.sign_in');
  const vars = call.children.filter(c => /UIControlVariable/.test(c.className));
  assert.deepEqual(plain(vars.map(v => [v.name, v.properties.varValue.value])), [['email', "c8oPage.local?.loginUser ?? ''"], ['secret', "c8oPage.local?.loginPassword ?? ''"]]);
  const signedIn = find(call, 'WhenSignedIn');
  assert.match(signedIn.properties.condition.value, /!out\?\.error && !\(out\?\.errors && out\.errors\.length\) && out\?\.success !== false/);
  assert.equal(find(signedIn, 'OpenLanding').className, 'ngx.components.UIDynamicAction#RootPageAction');
  assert.match(find(call, 'StoreLoginError').properties.Value.value, /'Connexion refusée\.'$/);
  assert.equal(find(trees.root, 'LoginPassword').properties.Type.value, 'password');
  assert.equal(find(trees.root, 'LoginUser').properties.Label.value, 'E-mail');
  assert.deepEqual(plain(trees.load.tree.children.map(c => c.name)), ['PageEvent']);
});

test('a page without a session goes to the login form, and the nodes of the other mode are removed', () => {
  const C8O = load();
  const actionsCtx = Object.assign({}, base, {
    dashboardActionQName: (p, n) => p + '.Application.NgxApp.' + n,
    setGlobalActionNode: (n, p, v) => C8O.crudUi.setGlobalActionNode(base, n, p, v),
    ifActionNode: (n, c, ch, o) => C8O.crudUi.ifActionNode(base, n, c, ch, o),
    actionStackNode: (n, v, ch, cm) => C8O.crudUi.actionStackNode(base, n, v, ch, cm),
    callSequenceActionNode: (n, r, v, o) => C8O.crudUi.callSequenceActionNode(base, n, r, v, o),
    controlVariableNode: (n, v, cm) => C8O.crudUi.controlVariableNode(base, n, v, cm),
    scriptLiteral: v => C8O.crudUi.scriptLiteral(base, v),
    customAsyncActionNode: (n, v, cm) => C8O.crudUi.customAsyncActionNode(base, n, v, cm),
    actionCallFromExpressionSnippet: () => 'null',
  });
  const form = C8O.crudUiActions.buildEntityPagesActionStacksTree(actionsCtx, 'App', 'crud', [], 'final', { mode: 'form' });
  const ensure = form.tree.children.find(c => c.name === 'crud_ensure_session');
  assert.equal(ensure.children[0].name, 'WhenSignedOut');
  assert.equal(find(ensure, 'OpenLogin').properties.url.value, '/login');
  const demo = C8O.crudUiActions.buildEntityPagesActionStacksTree(actionsCtx, 'App', 'crud', [], 'final', { mode: 'demo' });
  assert.equal(demo.tree.children.find(c => c.name === 'crud_ensure_session').children[0].name, 'WhenSessionMissing');
  const kitCtx = Object.assign({}, base, { ngxAppQName: p => p + '.Application.NgxApp', sessionBootstrapPageQName: p => p + '.Application.NgxApp.Login',
    resolveQName: q => (q.endsWith('CardContent') ? { getDatabaseObjectChildren: () => ({ size: () => 2, get: i => ({ getName: () => ['not_set', 'LoginUser'][i] }) }) } : null) });
  assert.deepEqual(JSON.parse(JSON.stringify(C8O.crudUiKit.authCleanupQNames(kitCtx, 'App', { mode: 'form' }, { 'Content.Grid.Row.Col.Card.CardContent': ['LoginUser'] }))),
    ['App.Application.NgxApp.crud_ensure_session.WhenSessionMissing', 'App.Application.NgxApp.Login.Content.Grid.Row.Col.Card.CardContent.not_set']);
  assert.ok(C8O.crudUiKit.authCleanupQNames(kitCtx, 'App', { mode: 'demo' }, null).includes('App.Application.NgxApp.Login.Content.Grid.Row.Col.Card.CardContent.SignIn'));
});
