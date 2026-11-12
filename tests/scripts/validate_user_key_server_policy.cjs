// T4b of the A4 security review (convertigo/c8oprj-tigoaccess#1): on a server whose C8Oforms gives each No Code user a
// Tigo key of their own, the MCP tools that start an agent outside the Agent Bridge (subagent-run, browser-verify) are
// refused whatever the bearer, as the Bridge refuses every unconfined agent there (agent_isolation_unavailable).
// node --test tests/scripts/validate_user_key_server_policy.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const policySource = read('js/user_key_server_policy.js');
const AGENT_TOOLS = ['subagent-run', 'browser-verify'];

// An engine: Studio or server, C8Oforms with or without APIV2_TigoUserKey, the server id symbol, context.server.
function engine({ studio = false, sequence = true, serverId = 'server-test', store = new Map() } = {}) {
  const Engine = {
    isStudioMode: () => studio,
    theApp: { databaseObjectsManager: {
      getOriginalProjectByName: name => (name === 'C8Oforms' ? { getSequenceByName: s => {
        if (s === 'APIV2_TigoUserKey' && sequence) return {};
        throw new Error('no sequence ' + s);
      } } : null),
      symbolsGetValue: name => (name === 'C8Oforms.tigo.server.id' ? serverId : null)
    } }
  };
  const server = { get: k => (store.has(k) ? store.get(k) : null), set: (k, v) => store.set(k, v) };
  return { Packages: { com: { twinsoft: { convertigo: { engine: { Engine } } } } }, server, store };
}

function policy(options) {
  const e = engine(options);
  const sandbox = { Packages: e.Packages, context: { server: e.server } };
  vm.runInNewContext(policySource, sandbox);
  return { policy: sandbox.C8O.userKeyServerPolicy, store: e.store };
}

test('a registered No Code server with per-user keys refuses the tools that start an agent, and only those', () => {
  const { policy: p, store } = policy();
  assert.equal(p.active(), true);
  assert.equal(store.get('lib_ConvertigoAgentBridge.userGatewayKeysSeen'), 'true', 'the same sticky flag as the Bridge');
  for (const sequence of ['tools_subagent_run', 'tools_browser_verify']) {
    assert.equal(p.allows(sequence), false, sequence);
    assert.match(p.refusal(sequence), /^agent_isolation_unavailable: (subagent-run|browser-verify) starts an agent that cannot run confined/);
    assert.throws(() => p.assertAllows(sequence), e => e.code === 'agent_isolation_unavailable');
  }
  for (const sequence of ['tools_business_sequence_create', 'tools_image_describe', 'tools_nocode_form_get', 'tools_project_lint']) {
    assert.equal(p.allows(sequence), true, sequence);
  }
});

test('the Studio, an unregistered server and a C8Oforms without per-user keys keep the tools', () => {
  assert.equal(policy({ studio: true }).policy.allows('tools_subagent_run'), true, 'Studio');
  assert.equal(policy({ serverId: '' }).policy.allows('tools_subagent_run'), true, 'no server id');
  assert.equal(policy({ serverId: '  ' }).policy.allows('tools_browser_verify'), true, 'blank server id');
  assert.equal(policy({ sequence: false }).policy.allows('tools_subagent_run'), true, 'no APIV2_TigoUserKey');
  const store = new Map();
  assert.equal(policy({ sequence: false, store }).policy.active(), false);
  assert.equal(store.size, 0, 'nothing marked');
});

test('once seen on the engine, the refusal stays when the symbol or the sequence goes away', () => {
  const store = new Map();
  assert.equal(policy({ store }).policy.active(), true);
  assert.equal(policy({ serverId: '', store }).policy.allows('tools_subagent_run'), false);
  assert.equal(policy({ sequence: false, store }).policy.allows('tools_browser_verify'), false);
  assert.equal(policy({ studio: true, store }).policy.active(), false, 'the Studio never uses per-user keys');
});

// The real tools/call decision of the router, as validate_gateway_tool_policy.cjs runs it.
const routerSource = read('js/mcp_endpoint_router.js');
const decision = routerSource.slice(routerSource.indexOf('  var toolNameRaw = paramsObject'), routerSource.indexOf('  if (mappingError) {', routerSource.indexOf('  var toolNameRaw = paramsObject')));
function route(name, { profile = '', kind = 'token', ...options } = {}) {
  const e = engine(options);
  const headers = { 'X-Convertigo-Agent-Profile': profile };
  const sandbox = {
    Packages: e.Packages,
    context: { server: e.server, httpServletRequest: { getHeader: h => headers[h] || null } },
    C8O: { guidance: { warningForToolCall: () => '', stripToolArguments: a => a } },
    paramsObject: { name, arguments: {} },
    mcpAuthentication: { kind }
  };
  for (const file of ['js/nocode_tool_policy.js', 'js/gateway_tool_policy.js', 'js/user_key_server_policy.js']) {
    vm.runInNewContext(read(file), sandbox);
  }
  vm.runInNewContext(decision, sandbox);
  return sandbox.mappingError;
}

test('T4b: the router refuses them on such a server for a full bearer (WEB_ADMIN) and a No Code one', () => {
  assert.match(routerSource, /include\("js\/user_key_server_policy\.js"\);/);
  for (const tool of AGENT_TOOLS) {
    const full = route(tool);
    assert.equal(full && full.status, '403', tool);
    assert.match(full.message, /^agent_isolation_unavailable: /, tool);
    assert.equal(full.data.code, 'agent_isolation_unavailable');
    const nocode = route(tool, { profile: 'nocode', kind: 'nocode' });
    assert.equal(nocode && nocode.status, '403', 'the No Code token is refused too: ' + tool);
    assert.equal(route(tool, { studio: true }), null, 'the Studio keeps ' + tool);
    assert.equal(route(tool, { serverId: '' }), null, 'an unregistered server keeps ' + tool);
  }
  assert.equal(route('business-sequence-create'), null, 'other tools are untouched');
});

test('they leave the tool list of such a server', () => {
  const list = read('_c8oProject/sequences/mcp_tools_list.yaml');
  assert.match(list, /include\("js\/user_key_server_policy\.js"\);/);
  assert.match(list, /C8O\.gatewayToolPolicy\.allows\(seqName\) && C8O\.userKeyServerPolicy\.allows\(seqName\)\) \{/);
});

test('the sub-agent runner itself refuses to start one there, whoever calls it, before any process', () => {
  const e = engine();
  const started = [];
  const included = [];
  // as Rhino runs it: subagents.js includes the policy itself (a direct call of the sequence never meets the router)
  const sandbox = { Packages: e.Packages, context: { server: e.server }, C8O: { mcpAuth: { authenticateRequest: () => ({ authenticated: true, kind: 'token', scope: 'mcp:full' }) } } };
  sandbox.include = file => { included.push(file); vm.runInNewContext(read(file), sandbox); };
  for (const file of ['js/subagents.js', 'js/tools_browser_verify.js', 'js/tools_subagent_run.js']) {
    vm.runInNewContext(read(file), sandbox);
  }
  assert.deepEqual(included, ['js/user_key_server_policy.js']);
  const host = new Proxy({}, { get: (_t, name) => (...args) => { started.push(name); throw new Error('host used: ' + String(name)); } });
  assert.throws(() => sandbox.C8O.subagents.run({ task: 'build the page' }, host, {}, {}), e => e.code === 'agent_isolation_unavailable');
  assert.throws(() => sandbox.C8O.subagents.run({ task: 'prove the login' }, host, {}, { profile: 'verifier', usageTool: 'browser-verify' }),
    e => e.code === 'agent_isolation_unavailable' && /^agent_isolation_unavailable: browser-verify /.test(e.message));
  assert.throws(() => sandbox.C8O.subagents.run({ runId: 'build-20261112-101500-0a1b2c3d' }, host, {}, {}),
    e => e.code === 'agent_isolation_unavailable', 'a resume by runId too');
  // the tools' own entry, reached by requestable-execute or a direct call of the sequence, with a full bearer
  assert.throws(() => sandbox.C8O.subagentRun.execute({}, { task: 'build the page' }), e => e.code === 'agent_isolation_unavailable');
  assert.throws(() => sandbox.C8O.browserVerify.execute({}, { url: 'http://localhost:4200', paths: ['login'] }),
    e => e.code === 'agent_isolation_unavailable');
  assert.deepEqual(started, [], 'no host call, hence no process');
  // a No Code bearer never reaches the runner (the tools ask for a full bearer)
  const nocode = { Packages: {}, C8O: { mcpAuth: { authenticateRequest: () => ({ authenticated: true, kind: 'nocode', scope: 'mcp:nocode' }) } } };
  for (const file of ['js/subagents.js', 'js/tools_browser_verify.js', 'js/tools_subagent_run.js']) {
    vm.runInNewContext(read(file), nocode);
  }
  assert.throws(() => nocode.C8O.subagentRun.execute({}, { task: 'x' }), /A full Convertigo MCP bearer token is required/);
  assert.throws(() => nocode.C8O.browserVerify.execute({}, { url: 'http://x' }), /A full Convertigo MCP bearer token is required/);
});
