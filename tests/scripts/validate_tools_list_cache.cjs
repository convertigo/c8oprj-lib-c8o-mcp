// Vibe 3 opens an MCP session for each tool call, and the MCP Python SDK of that session sends a tools/list after every
// call that worked (ClientSession._validate_tool_result), which rebuilt the whole catalog once per Vibe tool call. The
// answer of an identical tools/list is kept a minute (js/mcp_tools_list_cache.js) and answered by mcp_endpoint without
// internal_call.
// node --test tests/scripts/validate_tools_list_cache.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const endpoint = read('_c8oProject/sequences/mcp_endpoint.yaml');
const router = read('js/mcp_endpoint_router.js');

// The parts of java.util.concurrent.ConcurrentHashMap the helper uses.
class FakeMap {
  constructor() { this.map = new Map(); }
  get(key) { return this.map.has(key) ? this.map.get(key) : null; }
  put(key, value) { this.map.set(key, value); }
  remove(key) { this.map.delete(key); }
  size() { return this.map.size; }
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

function enumeration(values) {
  let at = 0;
  return { hasMoreElements: () => at < values.length, nextElement: () => values[at++] };
}

// An HTTP request as Tomcat shows it: header names as sent, getHeaders ignoring case.
function request(headers = {}, query = 'jsonOnly=false&from_bridge=true&descriptorVersion=g1&toolsRevision=r1') {
  return {
    getHeaderNames: () => enumeration(Object.keys(headers)),
    getHeaders: name => enumeration(Object.keys(headers).filter(k => k.toLowerCase() === String(name).toLowerCase()).map(k => headers[k])),
    getQueryString: () => query
  };
}

const VIBE = {
  Authorization: 'Bearer token-of-testuser',
  'User-Agent': 'MistralAI-VibeCLI/3.0.1',
  'MCP-Protocol-Version': '2025-06-18',
  'X-Convertigo-Agent-Profile': 'nocode',
  'X-Convertigo-No-Log': 'true',
  Accept: 'application/json, text/event-stream',
  'Content-Length': '46'
};

function cacheApi({ now = 1_000_000, project = { name: 'lib_ConvertigoMCP', version: '0.3.0-beta.31', id: 7 } } = {}) {
  const clock = { now };
  const ctx = {
    C8O: {},
    Packages: { com: { twinsoft: { convertigo: { engine: { Engine: { theApp: { databaseObjectsManager: {
      getOriginalProjectByName: (name, checkOpenable) => {
        assert.equal(checkOpenable, false);
        return project && name === project.name ? { getVersion: () => project.version, id: project.id } : null;
      }
    } } } } } } } },
    java: {
      lang: {
        System: { currentTimeMillis: () => clock.now, identityHashCode: o => o.id },
        String: class { constructor(v) { this.v = String(v); } getBytes() { return Buffer.from(this.v, 'utf8'); } }
      },
      security: { MessageDigest: { getInstance: () => ({ digest: bytes => Array.from(crypto.createHash('sha256').update(bytes).digest(), b => b > 127 ? b - 256 : b) }) } },
      util: { concurrent: { ConcurrentHashMap: FakeMap } }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(read('js/mcp_tools_list_cache.js'), ctx);
  return { api: ctx.C8O.mcpToolsListCache, clock, project };
}

function store() {
  const values = {};
  return { get: key => (key in values ? values[key] : null), set: (key, value) => { values[key] = value; } };
}

function contextOf(req, server = store(), headersOut = {}) {
  return {
    httpServletRequest: req,
    // the engine keeps a header set with context.setResponseHeader (SetResponseHeaderStep), not one set on httpServletResponse
    setResponseHeader: (name, value) => { headersOut[name] = value; },
    project: { getName: () => 'lib_ConvertigoMCP' },
    server
  };
}

const AUTH = { authenticated: true, kind: 'nocode', scope: 'forms:write', user: 'testuser' };
const ANSWER = {
  tools: [
    { name: 'nocode-form-list', description: 'Lists forms', inputSchema: { type: 'object', properties: {}, required: [] }, outputSchema: { type: 'object' } },
    { name: 'nocode-form-get', description: 'Reads a form', inputSchema: { type: 'object', properties: { id: { type: 'string' } } } }
  ],
  query: { startIndex: 0, limit: 0, returned: 2, total: 2, cursorInput: '', hasMore: false }
};

test('the same request gives the same key, whatever the header order and case', () => {
  const { api } = cacheApi();
  const a = api.key(contextOf(request(VIBE)), { params: {}, authentication: AUTH });
  const reordered = Object.fromEntries(Object.entries(VIBE).reverse().map(([k, v]) => [k.toLowerCase(), v]));
  const b = api.key(contextOf(request(reordered)), { params: {}, authentication: AUTH });
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, b);
});

test('the key holds no credential in clear', () => {
  const { api } = cacheApi();
  const key = api.key(contextOf(request(VIBE)), { params: {}, authentication: AUTH });
  assert.doesNotMatch(key, /token-of-testuser/);
});

test('another requester, profile, query, paging, user or project is another key', () => {
  const { api, project } = cacheApi();
  const base = api.key(contextOf(request(VIBE)), { params: {}, authentication: AUTH });
  const variants = [
    api.key(contextOf(request({ ...VIBE, Authorization: 'Bearer another-token' })), { params: {}, authentication: AUTH }),
    api.key(contextOf(request({ ...VIBE, Cookie: 'JSESSIONID=abc' })), { params: {}, authentication: AUTH }),
    api.key(contextOf(request({ ...VIBE, 'X-Convertigo-Agent-Profile': '' })), { params: {}, authentication: AUTH }),
    api.key(contextOf(request({ ...VIBE, 'X-Convertigo-Edit-Profile': 'yaml' })), { params: {}, authentication: AUTH }),
    api.key(contextOf(request({ ...VIBE, 'X-Convertigo-Agent-Provider': 'gateway' })), { params: {}, authentication: AUTH }),
    api.key(contextOf(request({ ...VIBE, 'User-Agent': 'codex_cli_rs/0.1' })), { params: {}, authentication: AUTH }),
    api.key(contextOf(request(VIBE, 'jsonOnly=false&from_bridge=true&descriptorVersion=g1&toolsRevision=r2')), { params: {}, authentication: AUTH }),
    api.key(contextOf(request(VIBE)), { params: { limit: 5 }, authentication: AUTH }),
    api.key(contextOf(request(VIBE)), { params: { _meta: { nextCursor: '5' } }, authentication: AUTH }),
    api.key(contextOf(request(VIBE)), { params: {}, authentication: { ...AUTH, user: 'other' } }),
    api.key(contextOf(request(VIBE)), { params: {}, authentication: { ...AUTH, kind: 'managed' } })
  ];
  for (const variant of variants) {
    assert.notEqual(variant, base);
  }
  assert.equal(new Set(variants).size, variants.length);
  project.id = 8; // the engine loaded the project again
  assert.notEqual(api.key(contextOf(request(VIBE)), { params: {}, authentication: AUTH }), base);
  project.id = 7;
  project.version = '0.3.0-beta.32';
  assert.notEqual(api.key(contextOf(request(VIBE)), { params: {}, authentication: AUTH }), base);
});

test('headers that decide nothing, and the progress token, change no key', () => {
  const { api } = cacheApi();
  const base = api.key(contextOf(request(VIBE)), { params: {}, authentication: AUTH });
  assert.equal(api.key(contextOf(request({ ...VIBE, 'Content-Length': '52', Accept: '*/*', 'X-Request-Id': 'r-9' })), { params: {}, authentication: AUTH }), base);
  assert.equal(api.key(contextOf(request(VIBE)), { params: { _meta: { progressToken: 41 } }, authentication: AUTH }), base);
  assert.equal(api.key(contextOf(request(VIBE)), { params: null, authentication: AUTH }), base);
});

test('no request or no loaded project: no key, nothing kept', () => {
  const { api } = cacheApi({ project: null });
  assert.equal(api.key(contextOf(request(VIBE)), { params: {}, authentication: AUTH }), '');
  assert.equal(api.key({ httpServletRequest: null }, { params: {} }), '');
  assert.deepEqual(JSON.parse(JSON.stringify(api.lookup(contextOf(request(VIBE)), { params: {}, authentication: AUTH }))), { key: '', answer: null });
});

test('a kept answer comes back for a minute, as a copy of its own', () => {
  const { api } = cacheApi();
  const server = store();
  assert.equal(api.write(server, () => new FakeMap(), 'k1', ANSWER, 1_000_000), true);
  const first = api.read(server, 'k1', 1_000_000 + 59_999);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), ANSWER);
  first.tools.pop();
  assert.equal(api.read(server, 'k1', 1_000_001).tools.length, 2);
  assert.equal(api.read(server, 'k1', 1_000_000 + 60_000), null);
  assert.equal(server.get('lib_ConvertigoMCP.toolsListCache').size(), 0);
});

test('an answer dated in the future (clock moved back) is not served', () => {
  const { api } = cacheApi();
  const server = store();
  api.write(server, () => new FakeMap(), 'k1', ANSWER, 2_000_000);
  assert.equal(api.read(server, 'k1', 1_999_000), null);
});

test('only a tools/list answer under the size limit is kept', () => {
  const { api } = cacheApi();
  const server = store();
  assert.equal(api.write(server, () => new FakeMap(), 'k1', { error: { code: -32603 } }, 1), false);
  assert.equal(api.write(server, () => new FakeMap(), 'k1', null, 1), false);
  assert.equal(api.write(server, () => new FakeMap(), '', ANSWER, 1), false);
  const big = { tools: [{ name: 'x', description: 'd'.repeat(api.MAX_CHARS) }] };
  assert.equal(api.write(server, () => new FakeMap(), 'k1', big, 1), false);
  assert.equal(api.read(server, 'k1', 2), null);
});

test('the store stays bounded: expired answers go first, then the oldest one', () => {
  const { api } = cacheApi();
  const server = store();
  const newMap = () => new FakeMap();
  for (let i = 0; i < api.MAX_ENTRIES; i++) {
    api.write(server, newMap, 'k' + i, ANSWER, 1_000 + i);
  }
  const map = server.get('lib_ConvertigoMCP.toolsListCache');
  assert.equal(map.size(), api.MAX_ENTRIES);
  api.write(server, newMap, 'new', ANSWER, 1_000 + api.MAX_ENTRIES);
  assert.equal(map.size(), api.MAX_ENTRIES);
  assert.equal(map.get('k0'), null);
  assert.notEqual(map.get('k1'), null);
  // rewriting a kept key evicts nothing
  api.write(server, newMap, 'k5', ANSWER, 1_000 + api.MAX_ENTRIES + 1);
  assert.equal(map.size(), api.MAX_ENTRIES);
  assert.notEqual(map.get('k1'), null);
  // a minute later every older answer is gone at the next write
  api.write(server, newMap, 'late', ANSWER, 1_000 + api.MAX_ENTRIES + 60_001);
  assert.deepEqual([...map.map.keys()], ['late']);
});

test('a Vibe tool call: the tools/list after it is answered from the first one, with the header saying so', () => {
  const { api, clock } = cacheApi();
  const server = store();
  const discovery = {};
  const first = api.lookup(contextOf(request(VIBE), server, discovery), { params: {}, authentication: AUTH });
  assert.equal(first.answer, null);
  assert.match(first.key, /^[0-9a-f]{64}$/);
  assert.equal(discovery['X-Convertigo-Tools-List-Cache'], 'miss');
  assert.equal(api.keep(contextOf(request(VIBE), server), first.key, ANSWER), true);
  clock.now += 4_000;
  const afterCall = {};
  const second = api.lookup(contextOf(request(VIBE), server, afterCall), { params: {}, authentication: AUTH });
  assert.equal(second.key, '');
  assert.deepEqual(JSON.parse(JSON.stringify(second.answer)), ANSWER);
  assert.equal(afterCall['X-Convertigo-Tools-List-Cache'], 'hit');
  // another user of the same server builds their own
  const other = api.lookup(contextOf(request({ ...VIBE, Authorization: 'Bearer token-of-gregory' }), server), { params: {}, authentication: { ...AUTH, user: 'gregory' } });
  assert.equal(other.answer, null);
});

test('a failing store never fails the tools/list', () => {
  const { api } = cacheApi();
  const broken = { get: () => { throw new Error('store down'); }, set: () => { throw new Error('store down'); } };
  const ctx = contextOf(request(VIBE), broken);
  assert.deepEqual(JSON.parse(JSON.stringify(api.lookup(ctx, { params: {}, authentication: AUTH }))), { key: '', answer: null });
  assert.equal(api.keep(ctx, 'k1', ANSWER), false);
});

// mcp_endpoint.yaml: the steps that answer and keep, where they run.
function stepLine(name) {
  const at = endpoint.indexOf('↓' + name + ' [');
  assert.ok(at >= 0, name + ' missing');
  return at;
}

test('Init declares the variables the router sets and the steps read', () => {
  const init = endpoint.slice(stepLine('Init'), stepLine('Parse'));
  assert.match(init, /\n {4}var toolsListCached = null;\n/);
  assert.match(init, /\n {4}var toolsListCacheKey = "";\n/);
});

test('a kept answer is returned before internal_call, after the inline answers', () => {
  const inline = stepLine('ToolsListCachedInline');
  assert.ok(stepLine('TokenExpiredInline') < inline && inline < stepLine('prepareCall'));
  const block = endpoint.slice(inline, stepLine('prepareCall'));
  assert.match(block, /^↓ToolsListCachedInline \[steps\.IfStep-\d+\]: \n {6}comment: [^\n:]*\n {6}condition: toolsListCached != null\n/);
  assert.match(block, /\n {6}↓result \[steps\.JsonToXmlStep-\d+\]: \n {8}jsonObject: \n[\s\S]*?↑mode: JS\n {14}- →→: toolsListCached\n {8}key: \n[\s\S]*?↑mode: PLAIN\n {14}- →→: result\n/);
  assert.match(block, /\n {6}↓ReturnToolsListCached \[steps\.ReturnStep-\d+\]: \n {4}$/);
});

test('a built answer is kept from the internal_call result, before it is copied', () => {
  const keep = stepLine('KeepToolsList');
  assert.ok(stepLine('IfResult') < keep && keep < endpoint.indexOf('↓CopyResult [steps.XMLCopyStep-1761755111982]'));
  const block = endpoint.slice(keep, endpoint.indexOf('↓CopyResult [steps.XMLCopyStep-1761755111982]'));
  assert.match(block, /condition: toolsListCacheKey\.length > 0\n/);
  assert.match(block, /↓toolsListAnswer \[steps\.JsonSourceStep-\d+\]: \n {10}sourceDefinition: \n[\s\S]*?↑value: 1761755111966\n[\s\S]*?↑value: \.\/document\/\*\[@originalKeyName='result'\]\n {10}variableName: toolsListAnswer\n/);
  assert.match(block, /expression: C8O\.mcpToolsListCache\.keep\(context, toolsListCacheKey, toolsListAnswer\);\n/);
  // the tools/call branch returns before it
  const toolsCall = endpoint.slice(stepLine('IfResult'), keep);
  assert.match(toolsCall, /condition: methodName === "tools\/call"[\s\S]*↓ReturnResult \[steps\.ReturnStep-1762256270333\]: \n {6}$/);
});

test('every new step line keeps the trailing space of its key', () => {
  for (const id of ['1795310000001', '1795310000003', '1795310000005', '1795310000007', '1795310000009', '1795310000011']) {
    assert.match(endpoint, new RegExp('-' + id + '\\]: \\n'));
  }
  const added = endpoint.slice(stepLine('ToolsListCachedInline'), stepLine('prepareCall')) +
    endpoint.slice(stepLine('KeepToolsList'), endpoint.indexOf('↓CopyResult [steps.XMLCopyStep-1761755111982]'));
  for (const line of added.split('\n')) {
    if (/(jsonObject|key|sourceDefinition|xmlizable|SmartType|XMLVector|java\.lang\.String):\s*$/.test(line)) {
      assert.match(line, /: $/, 'missing trailing space: ' + line);
    }
  }
});

test('only tools/list looks the cache up, after the catalog request is routed', () => {
  const branch = router.slice(router.indexOf('} else if (methodName === "tools/list") {'), router.indexOf('} else if (methodName === "tools/call") {'));
  assert.match(branch, /callSequence = "mcp_tools_list";/);
  assert.match(branch, /include\("js\/mcp_tools_list_cache\.js"\);/);
  assert.match(branch, /toolsListCached = toolsListLookup\.answer;\n\s*toolsListCacheKey = toolsListLookup\.key;/);
  assert.equal(router.split('mcpToolsListCache.lookup(').length - 1, 1);
});
