// Managed tokens of the Tigo panel are leased: valid while a turn uses them, they end idleSeconds after the last
// activity (PCA eval 29/10: GLM lost every Convertigo tool 2 h into its turn, the token had a fixed 2 h expiry). Loads
// js/mcp_auth.js with small stand-ins for the Java classes it calls (HMAC, Base64, clock, ConcurrentHashMap).
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const clock = { now: Date.UTC(2026, 9, 30, 8, 0, 0) };

class ConcurrentHashMap {
  constructor() { this.map = new Map(); }
  get(key) { return this.map.has(String(key)) ? this.map.get(String(key)) : null; }
  put(key, value) { const previous = this.get(key); this.map.set(String(key), String(value)); return previous; }
  remove(key) { const previous = this.get(key); this.map.delete(String(key)); return previous; }
  replace(key, oldValue, newValue) {
    if (this.get(key) !== String(oldValue)) { return false; }
    this.map.set(String(key), String(newValue));
    return true;
  }
}

class JavaString {
  constructor(value, charset) { this.text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value); }
  getBytes() { return Buffer.from(this.text, 'utf8'); }
  toString() { return this.text; }
}

const known = {
  'java.lang.String': JavaString,
  'java.lang.System': { currentTimeMillis: () => clock.now, getProperty: () => null },
  'java.util.Date': class { constructor(ms) { this.ms = ms; } },
  'java.text.SimpleDateFormat': class { setTimeZone() {} format(date) { return new Date(date.ms).toISOString(); } },
  'java.util.TimeZone': { getTimeZone: () => null },
  'java.util.UUID': { randomUUID: () => crypto.randomUUID() },
  'java.util.Base64': {
    getUrlEncoder: () => ({ withoutPadding: () => ({ encodeToString: (bytes) => Buffer.from(bytes).toString('base64url') }) }),
    getUrlDecoder: () => ({ decode: (text) => Buffer.from(String(text), 'base64url') })
  },
  'java.security.MessageDigest': {
    isEqual: (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0,
    getInstance: () => ({ digest: (bytes) => crypto.createHash('sha256').update(bytes).digest() })
  },
  'javax.crypto.Mac': {
    getInstance: () => {
      let key = null;
      return { init(spec) { key = spec.key; }, doFinal: (bytes) => crypto.createHmac('sha256', key).update(bytes).digest() };
    }
  },
  'javax.crypto.spec.SecretKeySpec': class { constructor(bytes) { this.key = Buffer.from(bytes); } },
  'java.util.concurrent.ConcurrentHashMap': ConcurrentHashMap,
  'org.mozilla.javascript.Synchronizer': function (fn) { return fn; },
  'java.nio.charset.StandardCharsets': { UTF_8: 'UTF-8' }
};

function javaPackage(prefix) {
  return new Proxy(function () {}, {
    get(_target, property) {
      if (typeof property === 'symbol') { return () => ''; }
      const name = prefix ? prefix + '.' + property : property;
      return Object.prototype.hasOwnProperty.call(known, name) ? known[name] : javaPackage(name);
    },
    apply() { return javaPackage(prefix + '()'); },
    construct() { return javaPackage(prefix + '()'); }
  });
}

// The signing key and the admin check read the token store and the session: replaced by fixed answers.
function loadAuth() {
  const source = fs.readFileSync(path.join(root, 'js/mcp_auth.js'), 'utf8')
    .replace('function signingKey() {', 'function signingKey() { return "test-signing-key-0123456789abcdefghijklmnop";')
    .replace('function requireWebAdmin(contextObject) {', 'function requireWebAdmin(contextObject) { return;');
  const Packages = javaPackage('');
  const sandbox = { Packages, java: Packages.java, javax: Packages.javax, C8O: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'mcp_auth.js' });
  return sandbox.C8O.mcpAuth;
}

function engineContext() {
  const shared = new Map();
  return {
    server: { get: (key) => (shared.has(key) ? shared.get(key) : null), set: (key, value) => shared.set(key, value) },
    getAuthenticatedUser: () => 'admin',
    getConvertigoUrl: () => 'http://localhost:18080/convertigo',
    httpServletRequest: null,
    shared
  };
}

const LEASES = 'lib_ConvertigoMCP.managedTokenLeases';
const minutes = (n) => n * 60000;

test('a token created with idleSeconds is leased, stays valid while used past its idle time, then ends with an explicit message', () => {
  const auth = loadAuth();
  const context = engineContext();
  const created = auth.createManaged(context, 'Convertigo Assistant - studio', '7200', '300');
  assert.equal(created.status, 'ok');
  assert.equal(created.tokenInfo.lease.idleSeconds, 300);
  const payload = JSON.parse(Buffer.from(created.token.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(payload.lease, 'turn');
  assert.ok(payload.exp - payload.iat >= 7 * 86400, 'the JWT only caps the life of a leased token');
  const lease = JSON.parse(context.shared.get(LEASES).get(created.tokenInfo.id));
  assert.equal(lease.idleMs, 300000);

  // a call every 4 min keeps it valid well past 5 min
  for (let i = 0; i < 6; i++) {
    clock.now += minutes(4);
    const answer = auth.validate(created.token, context);
    assert.equal(answer.authenticated, true, 'call ' + i + ' refused: ' + JSON.stringify(answer.error));
    assert.equal(answer.tokenId, created.tokenInfo.id);
  }
  // no activity for more than the idle time: refused, with what happened and what to do
  clock.now += minutes(6);
  const refused = auth.validate(created.token, context);
  assert.equal(refused.authenticated, false);
  assert.equal(refused.error.code, 'expired_token');
  assert.match(refused.error.message, /^MCP token expired: /);
  assert.match(refused.error.message, /5 min without a turn using it/);
  assert.match(refused.error.hint, /new message in the Tigo panel/);
  assert.equal(refused.error.handshake, true, 'its signature was checked: it may still open a session');
  // an ended lease is never revived
  clock.now += minutes(1);
  assert.equal(auth.validate(created.token, context).authenticated, false);
});

test('the Agent Bridge contract: replacing the lease string over the exact previous one slides it, a removed lease stays removed', () => {
  const auth = loadAuth();
  const context = engineContext();
  const created = auth.createManaged(context, 'Tigo', '', '120');
  const leases = context.shared.get(LEASES);
  const id = created.tokenInfo.id;
  // what the Bridge does on the events of a running turn: no MCP call for 10 min, the lease still moves
  for (let i = 0; i < 10; i++) {
    clock.now += minutes(1);
    const current = leases.get(id);
    const lease = JSON.parse(current);
    lease.expiresAt = clock.now + lease.idleMs;
    assert.equal(leases.replace(id, current, JSON.stringify(lease)), true);
  }
  assert.equal(auth.validate(created.token, context).authenticated, true);
  // revoked: removed at once, and a later slide does not bring it back
  assert.equal(auth.revoke(context, id).status, 'ok');
  const refused = auth.validate(created.token, context);
  assert.equal(refused.error.code, 'expired_token');
  assert.match(refused.error.message, /no lease for it any more/);
  assert.equal(leases.get(id), null);
  assert.equal(auth.revoke(context, id).status, 'error');
});

test('a restart of the engine (empty server store) ends a leased token', () => {
  const auth = loadAuth();
  const created = auth.createManaged(engineContext(), 'Tigo', '', '1800');
  const refused = auth.validate(created.token, engineContext());
  assert.equal(refused.authenticated, false);
  assert.equal(refused.error.code, 'expired_token');
});

test('without idleSeconds a managed token keeps its fixed lifetime, and its expiry now says what to do', () => {
  const auth = loadAuth();
  const context = engineContext();
  const created = auth.createManaged(context, 'Old Assistant', '300', '');
  assert.equal(created.tokenInfo.lease, undefined);
  assert.equal(context.shared.get(LEASES), undefined);
  clock.now += minutes(4);
  assert.equal(auth.validate(created.token, context).authenticated, true);
  clock.now += minutes(2);
  const refused = auth.validate(created.token, context);
  assert.equal(refused.error.code, 'expired_token');
  assert.match(refused.error.message, /^MCP token expired: it reached its expiry date/);
  assert.match(refused.error.hint, /Tigo panel/);
  assert.equal(refused.error.handshake, true);
  // the dates are only read once the signature is checked: an altered expired token is refused for its signature
  const parts = created.token.split('.');
  const altered = parts[0] + '.' + Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')), sub: 'other' })).toString('base64url') + '.' + parts[2];
  const forged = auth.validate(altered, context);
  assert.equal(forged.error.code, 'invalid_token_signature');
  assert.equal(forged.error.handshake, undefined);
});

test('the lease never outlives the cap of its JWT', () => {
  const auth = loadAuth();
  const context = engineContext();
  const created = auth.createManaged(context, 'Tigo', '', '86400');
  const leases = context.shared.get(LEASES);
  const lease = JSON.parse(leases.get(created.tokenInfo.id));
  clock.now = lease.maxAt - minutes(10);
  leases.put(created.tokenInfo.id, JSON.stringify(Object.assign(lease, { expiresAt: clock.now + minutes(1) })));
  assert.equal(auth.validate(created.token, context).authenticated, true);
  assert.ok(JSON.parse(leases.get(created.tokenInfo.id)).expiresAt <= lease.maxAt);
});

test('the endpoint answers an expired token on a tools/call as the tool error, not a 401 that makes Vibe drop the server', () => {
  const endpoint = fs.readFileSync(path.join(root, '_c8oProject/sequences/mcp_endpoint.yaml'), 'utf8');
  assert.match(endpoint, /if \(\/expired\/\.test\(String\(authenticationError\.code \|\| ""\)\)\) \{/);
  assert.match(endpoint, /expiredCall\.method === "tools\/call"/);
  assert.match(endpoint, /↓TokenExpiredInline \[steps\.IfStep-\d+\]: \n {6}comment: [^\n]+\n {6}condition: tokenExpiredText\.length > 0\n/);
  assert.match(endpoint, /'if \(typeof tokenExpiredText === "string" && tokenExpiredText\.length\) \{\n {10}\/\/ answered by TokenExpiredInline, nothing to route\n {8}\} else try \{/);
  const inline = endpoint.slice(endpoint.indexOf('↓TokenExpiredInline'), endpoint.indexOf('↓prepareCall'));
  assert.match(inline, /- →→: isError\n[\s\S]*?type: bool[\s\S]*?- →→: 'true'/);
  assert.match(inline, /- →→: tokenExpiredText/);
  assert.match(inline, /↓ReturnTokenExpired \[steps\.ReturnStep-\d+\]: /);
});

function stepExpression(file, step) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const lines = text.slice(text.indexOf('↓' + step + ' [steps.SimpleStep')).split('\n');
  const start = lines.findIndex(l => /^\s*expression: \|\s*$/.test(l));
  const indent = lines[start + 1].match(/^\s*/)[0];
  const body = [];
  for (let i = start + 1; i < lines.length && (lines[i].startsWith(indent) || !lines[i].trim()); i++) {
    body.push(lines[i].slice(indent.length));
  }
  return body.join('\n').trim().replace(/^'|'$/g, '').replace(/''/g, "'");
}

function runParse(request, error, extra) {
  const logged = [];
  const headers = [];
  const ctx = {
    include() {}, request, requestIdValue: null, requestIdType: '', requestIdJson: null, methodName: null, tokenExpiredText: '',
    JSON_RPC_VERSION: '2.0', SUPPORTED_PROTOCOL: '2025-06-18', headerVersion: '', paramsObject: {},
    C8O: { mcpAuth: { authenticateRequest: () => ({ status: 'error', authenticated: false, error }) } },
    context: { httpServletResponse: { setHeader: (name) => headers.push(name) } },
    com: { twinsoft: { convertigo: { engine: { Engine: { logEngine: { warn: message => logged.push(String(message)) } } } } } }
  };
  Object.assign(ctx, extra || {});
  vm.runInNewContext('var parseError = null;\n' + stepExpression('_c8oProject/sequences/mcp_endpoint.yaml', 'Parse'), ctx);
  return { ctx, logged, headers };
}

test('Parse: an expired managed token opens the session Vibe opens for each tool call, and its tools/call reads why', () => {
  const expired = { code: 'expired_token', handshake: true, message: 'MCP token expired: its conversation used it last at 2026-10-30T08:00:00.000Z.', hint: 'Send a new message in the Tigo panel: it renews the authorization. The work done so far is kept.' };
  for (const request of ['{"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"mcp","version":"0.1.0"}},"jsonrpc":"2.0","id":0}',
    '{"jsonrpc":"2.0","method":"notifications/initialized"}']) {
    const handshake = runParse(request, expired);
    assert.equal(handshake.ctx.parseError, null, request);
    assert.equal(handshake.ctx.mcpAuthentication.authenticated, true);
    assert.equal(handshake.ctx.mcpAuthentication.expiredHandshake, true);
    assert.equal(handshake.ctx.tokenExpiredText, '');
  }
  const list = runParse('{"jsonrpc":"2.0","id":3,"method":"tools/list"}', expired);
  assert.equal(list.ctx.parseError.status, '401', 'nothing else than the handshake and the refusal of the call');
  const durable = runParse('{"jsonrpc":"2.0","id":0,"method":"initialize","params":{}}', { code: 'expired_token', message: 'MCP token expired: it reached its expiry date.' });
  assert.equal(durable.ctx.parseError.status, '401', 'an external client with an expired durable token gets the 401');
});

test('Parse: an expired token on a tools/call becomes the text the agent reads, other refusals stay 401', () => {
  const expired = { code: 'expired_token', message: 'MCP token expired: its conversation used it last at 2026-10-30T08:00:00.000Z.', hint: 'Send a new message in the Tigo panel: it renews the authorization. The work done so far is kept.' };
  const call = runParse('{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"project-list","arguments":{}}}', expired);
  assert.equal(call.ctx.parseError, null, 'no 401');
  assert.equal(call.headers.length, 0, 'no WWW-Authenticate');
  assert.equal(call.ctx.requestIdValue, 7);
  assert.equal(call.ctx.methodName, 'tools/call');
  assert.equal(call.ctx.tokenExpiredText, expired.message + ' ' + expired.hint + ' Do not call Convertigo tools again in this turn: tell the user.');
  assert.match(call.logged[0], /MCP bearer refused \(expired_token\), answered as the tool error/);
  // an expired token on initialize (a session that starts) and any other refusal keep the 401
  const init = runParse('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}', expired);
  assert.equal(init.ctx.parseError.status, '401');
  const forged = runParse('{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{}}', { code: 'invalid_token_signature', message: 'The MCP bearer token signature is invalid.' });
  assert.equal(forged.ctx.parseError.status, '401');
  assert.equal(forged.ctx.tokenExpiredText, '');
});
