// viewer-sign-in (js/viewer_session.js): the Studio browser signed in as an account of the app, without a password.
// In the SalesPipeline runs of 16/11 agents spent up to 20 minutes guessing the demo password (a dictionary, the SHA-1
// of the stored hash and salt). The tool issues a one-time ticket (60 s, single use, local Studio, full bearer); the
// viewer page posts it to viewer_session_claim in its own HTTP session, which signs in. browser-verify takes signInAs.
// node --test tests/scripts/validate_viewer_session.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

class FakeMap {
  constructor() { this.m = new Map(); }
  put(k, v) { this.m.set(String(k), v); }
  get(k) { return this.m.has(String(k)) ? this.m.get(String(k)) : null; }
  remove(k) { const v = this.get(k); this.m.delete(String(k)); return v; }
  size() { return this.m.size; }
  clear() { this.m.clear(); }
  entrySet() {
    const self = this;
    return { iterator() {
      const keys = [...self.m.keys()]; let i = -1;
      return { hasNext: () => i + 1 < keys.length, next: () => { i++; return { getValue: () => self.m.get(keys[i]) }; }, remove: () => self.m.delete(keys[i]) };
    } };
  }
}

function load(options) {
  const opts = Object.assign({ studio: true, desktop: false, now: 1000000, exists: true }, options || {});
  const removedGrp = [];
  const context = {
    C8O: {},
    include() {},
    Packages: {
      com: { twinsoft: { convertigo: { engine: {
        Engine: {
          isStudioMode: () => opts.studio,
          isDesktopStudio: () => opts.desktop,
          theApp: { databaseObjectsManager: { existsProject: () => opts.exists } }
        },
        enums: { SessionAttribute: { authenticatedUserGrp: { remove: (s) => removedGrp.push(s) } } }
      } } } },
      org: { mozilla: { javascript: { Synchronizer: function (fn) { return fn; } } } }
    },
    java: {
      lang: { System: { currentTimeMillis: () => opts.now }, Byte: { TYPE: 'byte' }, reflect: { Array: { newInstance: (_t, n) => new Array(n).fill(0) } } },
      security: { SecureRandom: function () { this.nextBytes = (b) => { for (let i = 0; i < b.length; i++) b[i] = (i * 37 + opts.now) % 256 - 128; }; } },
      util: { concurrent: { ConcurrentHashMap: FakeMap } }
    }
  };
  vm.createContext(context);
  vm.runInContext(read('js/viewer_session.js'), context, { filename: 'viewer_session.js' });
  const store = {};
  const ctx = {
    server: { get: (k) => (k in store ? store[k] : null), set: (k, v) => { store[k] = v; } },
    httpSession: { id: 'browser-session' },
    users: [],
    setAuthenticatedUser(u) { this.users.push(u); }
  };
  return { api: context.C8O.viewerSession, ctx, opts, removedGrp };
}

test('accounts and pages are checked before anything happens', () => {
  const { api } = load();
  assert.equal(api.checkUser(' demo@salespipeline.io '), 'demo@salespipeline.io');
  assert.throws(() => api.checkUser(''), /user is required/);
  assert.throws(() => api.checkUser('<script>'), /not an account name/);
  assert.equal(api.checkPage('/companies'), 'companies');
  assert.throws(() => api.checkPage('a b'), /route segment/);
});

test('a ticket signs one browser session in once, before it expires', () => {
  const t = load();
  const ticket = t.api.issue(t.ctx, 'SalesPipeline', 'demo@salespipeline.io');
  assert.match(ticket, /^[0-9a-f]{64}$/);
  const ok = t.api.claim(t.ctx, ticket);
  assert.equal(ok.signedIn, true);
  assert.equal(ok.user, 'demo@salespipeline.io');
  assert.deepEqual(t.ctx.users, ['demo@salespipeline.io']);
  assert.equal(t.removedGrp.length, 1, 'a FullSync session of another user does not stay');
  const again = t.api.claim(t.ctx, ticket);
  assert.equal(again.signedIn, false, 'single use');
  assert.match(again.error, /unknown, used or expired/);
  assert.equal(t.api.claim(t.ctx, 'abc').signedIn, false);
  assert.equal(t.api.claim(t.ctx, '0'.repeat(64)).signedIn, false);
  const old = t.api.issue(t.ctx, 'SalesPipeline', 'demo@salespipeline.io');
  t.opts.now += t.api.TICKET_TTL_MS + 1;
  assert.equal(t.api.claim(t.ctx, old).signedIn, false, 'expired');
  assert.deepEqual(t.ctx.users, ['demo@salespipeline.io'], 'nothing signed in by a refused ticket');
});

test('only a Studio signs its browser in: a server refuses the claim and the tool', () => {
  const server = load({ studio: false, desktop: false });
  const ticket = server.api.issue(server.ctx, 'SalesPipeline', 'demo@x.io');
  assert.equal(server.api.claim(server.ctx, ticket).signedIn, false);
  assert.deepEqual(server.ctx.users, []);
  assert.throws(() => server.api.signIn(server.ctx, { project: 'SalesPipeline', user: 'demo@x.io' }, {}), /works in a Studio only/);
  const electron = load({ studio: false, desktop: true });
  assert.equal(electron.api.claim(electron.ctx, electron.api.issue(electron.ctx, 'P', 'u@x.io')).signedIn, true, 'the Electron Studio is a Studio');
});

test('the tool hands the browser helper a ticket, never a password, and reports where the browser is', () => {
  const t = load();
  let input = null;
  const host = {
    cdpEndpoint: () => 'http://127.0.0.1:9333',
    probe: (e) => e,
    playwrightModule: () => '/pw',
    run: (_h, i) => { input = i; return { status: 'signed_in', signedIn: true, sessionUser: 'demo@x.io', url: 'http://localhost:18080/convertigo/projects/P/DisplayObjects/mobile/companies', signInPageShown: false, message: 'ok' }; }
  };
  const result = t.api.signIn(t.ctx, { project: 'P', user: 'demo@x.io', page: 'companies', url: 'http://localhost:18080/convertigo/projects/P/DisplayObjects/mobile/' }, host);
  assert.equal(result.signedIn, true);
  assert.equal(result.sessionUser, 'demo@x.io');
  assert.match(input.ticket, /^[0-9a-f]{64}$/);
  assert.equal(input.claimSequence, 'viewer_session_claim');
  assert.equal(input.page, 'companies');
  assert.ok(!('password' in input));
  assert.equal(t.ctx.server.get('lib_ConvertigoMCP.viewerSession.tickets').size(), 0, 'the ticket is dropped after the call');
  assert.throws(() => t.api.signIn(t.ctx, { project: 'P', user: 'u@x.io', url: 'https://evil.example.com/p' }, host), /viewerHomeUrl/);
  assert.throws(() => t.api.signIn(t.ctx, { project: 'P', user: 'u@x.io' }, Object.assign({}, host, { cdpEndpoint: () => '' })), /call mobile-builder-open first/);
  assert.throws(() => t.api.signIn(t.ctx, { project: 'bad name', user: 'u@x.io' }, host), /project is required/);
  const asks = t.api.signIn(t.ctx, { project: 'P', user: 'u@x.io' }, Object.assign({}, host, { run: () => ({ status: 'signed_in_page_asks_sign_in', signedIn: true, sessionUser: 'u@x.io', signInPageShown: true }) }));
  assert.match(asks.message, /ask the user for the account's password instead of guessing it/);
});

test('only a full MCP bearer calls it', () => {
  const t = load();
  const context = { C8O: { mcpAuth: { authenticateRequest: () => ({ authenticated: true, kind: 'nocode', scope: 'mcp:full' }) } } };
  vm.createContext(context);
  context.Packages = { com: { twinsoft: { convertigo: { engine: { Engine: { isStudioMode: () => true } } } } } };
  vm.runInContext(read('js/viewer_session.js'), context);
  assert.throws(() => context.C8O.viewerSession.execute(t.ctx, { project: 'P', user: 'u@x.io' }), /full Convertigo MCP bearer/);
});

test('browser-verify signs in first with signInAs, and tells the verifier not to type a password', () => {
  const context = { C8O: {}, include() {}, java: { lang: { String: function () {} } } };
  vm.createContext(context);
  vm.runInContext(read('js/tools_browser_verify.js'), context, { filename: 'tools_browser_verify.js' });
  let call = null;
  context.C8O.viewerSession = { signIn: (_ctx, p) => { call = p; return { signedIn: true, sessionUser: p.user, status: 'signed_in', message: '' }; } };
  const bv = context.C8O.browserVerify;
  assert.equal(bv.signInFirst({}, { url: 'http://x/projects/P/DisplayObjects/mobile/' }), '', 'no signInAs, nothing');
  assert.equal(bv.signInFirst({}, { signInAs: 'u@x.io', verificationId: 'r1' }), '', 'collecting a running verification signs nothing in');
  assert.throws(() => bv.signInFirst({}, { signInAs: 'u@x.io' }), /signInAs needs url/);
  const params = { signInAs: 'demo@x.io', url: 'http://localhost:18080/convertigo/projects/SalesPipeline/DisplayObjects/mobile/dashboard', hints: 'KPIs: 4 cards' };
  assert.equal(bv.signInFirst({}, params), 'demo@x.io');
  assert.equal(call.project, 'SalesPipeline');
  assert.match(params.hints, /^The browser is already signed in as demo@x\.io: never type a password/);
  assert.match(params.hints, /KPIs: 4 cards$/);
  context.C8O.viewerSession.signIn = () => ({ signedIn: false, status: 'no_viewer', message: 'no page' });
  assert.throws(() => bv.signInFirst({}, { signInAs: 'u@x.io', url: params.url }), /signInAs u@x\.io failed \(no_viewer\)/);
});

test('the browser helper posts the ticket from the viewer page and never opens a tab', () => {
  const helper = read('node/viewer_session.cjs');
  assert.match(helper, /connectOverCDP/);
  assert.match(helper, /method: "POST"/);
  assert.match(helper, /credentials: "include"/);
  assert.doesNotMatch(helper, /newPage\(|newContext\(/);
  assert.doesNotMatch(helper, /\.fill\(|\.type\(|keyboard/, 'it types nothing in the page');
});
