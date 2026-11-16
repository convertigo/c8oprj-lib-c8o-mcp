// Vibe 3 opens an MCP session for each tool call: initialize, notifications/initialized, tools/call, tools/list, each an
// HTTP request that checked its bearer, and mcp_initialize or mcp_tools_list checked it again for the feedback consent of
// a No Code user (a C8Oforms sequence reading the user's document for a C8Oforms token). js/mcp_auth.js now checks a
// token once per HTTP request, and lets a handshake reuse a check of the same token from the last 30 s.
// Loads js/mcp_auth.js with the stand-ins of validate_managed_token_lease.cjs, and counts the full checks.
// node --test tests/scripts/validate_handshake_auth.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const clock = { now: Date.UTC(2026, 10, 16, 14, 34, 0) };

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
  size() { return this.map.size; }
  clear() { this.map.clear(); }
  entrySet() {
    const map = this.map;
    const keys = [...map.keys()];
    let at = -1;
    return { iterator: () => ({
      hasNext: () => at + 1 < keys.length,
      next: () => { at++; const key = keys[at]; return { getKey: () => key, getValue: () => map.get(key) }; },
      remove: () => map.delete(keys[at])
    }) };
  }
}

class JavaString {
  constructor(value) { this.text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value); }
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

// The signing key and the admin check read the token store and the session: replaced by fixed answers. Each full check
// (validate) is counted.
function loadAuth() {
  const source = fs.readFileSync(path.join(root, 'js/mcp_auth.js'), 'utf8')
    .replace('function signingKey() {', 'function signingKey() { return "test-signing-key-0123456789abcdefghijklmnop";')
    .replace('function requireWebAdmin(contextObject) {', 'function requireWebAdmin(contextObject) { return;')
    .replace('function validate(token, contextObject) {', 'function validate(token, contextObject) { C8O.checks = (C8O.checks || 0) + 1;');
  const Packages = javaPackage('');
  const sandbox = { Packages, java: Packages.java, javax: Packages.javax, C8O: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'mcp_auth.js' });
  const auth = sandbox.C8O.mcpAuth;
  auth.checks = () => sandbox.C8O.checks || 0;
  return auth;
}

// One engine: the store the server shares between requests.
function engine() {
  const shared = new Map();
  return { get: (key) => (shared.has(key) ? shared.get(key) : null), set: (key, value) => shared.set(key, value), shared };
}

// One HTTP request of the endpoint, with its bearer and its attributes.
function httpRequest(server, token) {
  const attributes = new Map();
  return {
    server,
    getAuthenticatedUser: () => 'admin',
    getConvertigoUrl: () => 'http://localhost:18080/convertigo',
    httpServletRequest: {
      getHeader: (name) => (String(name).toLowerCase() === 'authorization' && token ? 'Bearer ' + token : null),
      getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
      setAttribute: (name, value) => attributes.set(name, value)
    }
  };
}

const INITIALIZE = JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'mcp', version: '0.1.0' } } });
const INITIALIZED = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' });
const PING = JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'ping' });
const CALL = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'nocode-form-list', arguments: {} } });
const LIST = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' });

function managedToken(auth, server) {
  const created = auth.createManaged(httpRequest(server, null), 'Tigo', '7200', '');
  assert.equal(created.status, 'ok');
  return created;
}

test('one HTTP request checks its token once, however many of its sequences ask', () => {
  const auth = loadAuth();
  const server = engine();
  const { token, tokenInfo } = managedToken(auth, server);
  const call = httpRequest(server, token);
  const first = auth.authenticateRequest(call, CALL);
  assert.equal(first.authenticated, true);
  // mcp_tools_list, js/reporting.js and the tools ask again without the body
  for (let i = 0; i < 3; i++) {
    const again = auth.authenticateRequest(call);
    assert.equal(again.authenticated, true);
    assert.equal(again.kind, 'managed');
    assert.equal(again.tokenId, tokenInfo.id);
  }
  assert.equal(auth.checks(), 1);
  // the next request checks again
  assert.equal(auth.authenticateRequest(httpRequest(server, token), CALL).authenticated, true);
  assert.equal(auth.checks(), 2);
});

test('a Vibe tool call: only its tools/call and tools/list check the token in full', () => {
  const auth = loadAuth();
  const server = engine();
  const { token } = managedToken(auth, server);
  // the first session of the conversation: its handshake is checked in full
  assert.equal(auth.authenticateRequest(httpRequest(server, token), INITIALIZE).authenticated, true);
  assert.equal(auth.checks(), 1);
  assert.equal(auth.authenticateRequest(httpRequest(server, token), INITIALIZED).authenticated, true);
  assert.equal(auth.checks(), 1);
  for (let call = 0; call < 5; call++) {
    clock.now += 8000;
    for (const body of [INITIALIZE, INITIALIZED]) {
      const handshake = auth.authenticateRequest(httpRequest(server, token), body);
      assert.equal(handshake.authenticated, true);
      assert.equal(handshake.kind, 'managed');
    }
    assert.equal(auth.authenticateRequest(httpRequest(server, token), CALL).authenticated, true);
    assert.equal(auth.authenticateRequest(httpRequest(server, token), LIST).authenticated, true);
  }
  assert.equal(auth.checks(), 1 + 5 * 2);
  assert.equal(auth.authenticateRequest(httpRequest(server, token), PING).authenticated, true);
  assert.equal(auth.checks(), 11);
});

test('a handshake reuses a check for 30 s only', () => {
  const auth = loadAuth();
  const server = engine();
  const { token } = managedToken(auth, server);
  auth.authenticateRequest(httpRequest(server, token), CALL);
  clock.now += 29_999;
  auth.authenticateRequest(httpRequest(server, token), INITIALIZE);
  assert.equal(auth.checks(), 1);
  clock.now += 1;
  auth.authenticateRequest(httpRequest(server, token), INITIALIZE);
  assert.equal(auth.checks(), 2);
});

test('a revoked token: refused on its next tools/call at once, its handshake opens for 30 s at most', () => {
  const auth = loadAuth();
  const server = engine();
  const created = auth.createManaged(httpRequest(server, null), 'Tigo', '', '600');
  const token = created.token;
  assert.equal(auth.authenticateRequest(httpRequest(server, token), CALL).authenticated, true);
  assert.equal(auth.revoke(httpRequest(server, null), created.tokenInfo.id).status, 'ok');
  assert.equal(auth.authenticateRequest(httpRequest(server, token), CALL).authenticated, false);
  assert.equal(auth.authenticateRequest(httpRequest(server, token), LIST).authenticated, false);
  // the handshake reads nothing: it may still open within 30 s of the last check that authenticated
  assert.equal(auth.authenticateRequest(httpRequest(server, token), INITIALIZE).authenticated, true);
  clock.now += 30_000;
  const refused = auth.authenticateRequest(httpRequest(server, token), INITIALIZE);
  assert.equal(refused.authenticated, false);
  assert.equal(refused.error.code, 'expired_token');
});

test('a refused token is never kept, and another token never reuses a check', () => {
  const auth = loadAuth();
  const server = engine();
  const { token } = managedToken(auth, server);
  const forged = token.slice(0, -2) + (token.endsWith('AA') ? 'AB' : 'AA');
  for (let i = 0; i < 3; i++) {
    const request = httpRequest(server, forged);
    assert.equal(auth.authenticateRequest(request, INITIALIZE).authenticated, false);
    assert.equal(auth.authenticateRequest(request).authenticated, false);
  }
  assert.equal(auth.checks(), 6);
  auth.authenticateRequest(httpRequest(server, token), CALL);
  const other = managedToken(auth, server).token;
  auth.authenticateRequest(httpRequest(server, other), INITIALIZE);
  assert.equal(auth.checks(), 8);
  // no bearer at all: refused, nothing kept
  assert.equal(auth.authenticateRequest(httpRequest(server, null), INITIALIZE).error.code, 'missing_token');
});

test('only a small initialize, notifications/* or ping body is a handshake', () => {
  const auth = loadAuth();
  const server = engine();
  const { token } = managedToken(auth, server);
  auth.authenticateRequest(httpRequest(server, token), CALL);
  const big = JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { padding: 'x'.repeat(5000) } });
  for (const body of [big, 'not json', '', null, JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'resources/read', params: { uri: 'x' } }), JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'prompts/get' })]) {
    auth.authenticateRequest(httpRequest(server, token), body);
  }
  assert.equal(auth.checks(), 7);
  auth.authenticateRequest(httpRequest(server, token), JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } }));
  assert.equal(auth.checks(), 7);
});

test('the store of handshake checks stays bounded', () => {
  const auth = loadAuth();
  const server = engine();
  const tokens = [];
  for (let i = 0; i < 1001; i++) {
    tokens.push(auth.createManaged(httpRequest(server, null), 'Tigo ' + i, '7200', '').token);
  }
  for (const token of tokens) {
    auth.authenticateRequest(httpRequest(server, token), CALL);
  }
  assert.ok(server.shared.get('lib_ConvertigoMCP.handshakeChecks').size() <= 1000);
  // the store never holds a token in clear
  for (const value of server.shared.get('lib_ConvertigoMCP.handshakeChecks').map.keys()) {
    assert.match(value, /^[A-Za-z0-9_-]{43}$/);
  }
});

test('the endpoint passes the request body, and a handshake answer still never reaches a tool', () => {
  const endpoint = fs.readFileSync(path.join(root, '_c8oProject/sequences/mcp_endpoint.yaml'), 'utf8');
  const parse = endpoint.slice(endpoint.indexOf('↓Parse ['), endpoint.indexOf('↓ifParseError ['));
  assert.match(parse, /\n {4}mcpAuthentication = C8O\.mcpAuth\.authenticateRequest\(context, request\);\n/);
  assert.equal(endpoint.split('C8O.mcpAuth.authenticateRequest(').length - 1, 1);
});
