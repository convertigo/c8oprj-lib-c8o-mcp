const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const routerSource = read('js/mcp_endpoint_router.js');
// The real tools/call decision, without executing the selected requestable.
const start = routerSource.indexOf('  var toolNameRaw = paramsObject');
const end = routerSource.indexOf('  if (mappingError) {', start);
const decision = routerSource.slice(start, end);
function route(name, provider, args) {
  const headers = { 'X-Convertigo-Agent-Provider': provider || '' };
  const context = {
    context: { httpServletRequest: { getHeader: h => headers[h] || null } },
    C8O: { guidance: { warningForToolCall: () => '', stripToolArguments: a => a } },
    paramsObject: { name, arguments: args || {} },
    mcpAuthentication: { kind: 'token' }
  };
  vm.runInNewContext(read('js/nocode_tool_policy.js'), context);
  vm.runInNewContext(read('js/gateway_tool_policy.js'), context);
  vm.runInNewContext(decision, context);
  return context;
}

test('a Claude conversation gets no tool that calls a gateway model', () => {
  for (const tool of ['image-describe', 'subagent-run', 'browser-verify']) {
    const out = route(tool, 'claude');
    assert.equal(out.mappingError && out.mappingError.status, '403', tool);
    assert.match(out.mappingError.message, /does not use: .+yourself|own host/, tool);
  }
  assert.equal(route('business-sequence-create', 'claude').mappingError, null);
});

test('project-lint skips its model text review for Claude only', () => {
  const claude = route('project-lint', 'claude', { project: 'App' });
  assert.equal(claude.toolArgs.checkTexts, false);
  const vibe = route('project-lint', '', { project: 'App' });
  assert.equal(vibe.toolArgs.checkTexts, undefined);
});

test('other agents keep the gateway tools', () => {
  for (const tool of ['image-describe', 'subagent-run', 'browser-verify']) {
    assert.equal(route(tool, '').mappingError, null, tool);
    assert.equal(route(tool, 'vibe').mappingError, null, tool);
  }
});
