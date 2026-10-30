const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// PCA eval 30/10: mobile-builder-open with wait true and timeoutSec 90, then 60, failed in Vibe with mcp_timeout
// ("The provided tool call failed"): a client fails a tool call that has not answered in about a minute (Codex too,
// tool_timeout_sec 60 by default). The router lowers an agent's wait to 45 s and says so; internal callers keep theirs.

const root = path.resolve(__dirname, '../..');
const router = fs.readFileSync(path.join(root, 'js/mcp_endpoint_router.js'), 'utf8');

function capAgentWait() {
  const start = router.indexOf('var AGENT_MAX_WAIT_SEC = {');
  const end = router.indexOf('\nfunction applyArgumentAliases(');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(router.slice(start, end), sandbox);
  return sandbox.capAgentWait;
}

test('an agent wait on the mobile builder stays under the client timeout', () => {
  const cap = capAgentWait();
  const long = { project: 'P', timeoutSec: 90 };
  assert.match(cap('tools_mobile_builder_open', long), /^timeoutSec 90 was lowered to 45: a tool call longer than about a minute fails on the client side\./);
  assert.equal(long.timeoutSec, 45);
  const sixty = { project: 'P', wait: true, timeoutSec: '60' };
  cap('tools_mobile_builder_open', sixty);
  assert.equal(sixty.timeoutSec, 45);
  const unset = { project: 'P' };
  assert.equal(cap('tools_mobile_builder_open', unset), '', 'the default is lowered without a note');
  assert.equal(unset.timeoutSec, 45);
  const short = { project: 'P', timeoutSec: 30 };
  assert.equal(cap('tools_mobile_builder_open', short), '');
  assert.equal(short.timeoutSec, 30);
  const noWait = { project: 'P', wait: false, timeoutSec: 90 };
  assert.equal(cap('tools_mobile_builder_open', noWait), '');
  assert.equal(noWait.timeoutSec, 90);
  const other = { timeoutSec: 300 };
  assert.equal(cap('tools_log_view', other), '');
  assert.equal(other.timeoutSec, 300);
});

test('the router applies the cap to agent calls and adds its note to the answer warning', () => {
  assert.match(router, /var waitCapNote = capAgentWait\(targetSequence, callVariables\);\s*if \(waitCapNote\.length\) \{\s*mcpArgumentWarning = mcpArgumentWarning \? mcpArgumentWarning \+ " " \+ waitCapNote : waitCapNote;/);
  const schema = fs.readFileSync(path.join(root, 'js/schema_overrides.js'), 'utf8');
  assert.match(schema, /timeoutSec: \{ type: "integer", minimum: 0, maximum: 600, default: 45, description: "Seconds to wait for readiness when wait=true\. Use 0 for a non-blocking poll\. At most 45/);
});
