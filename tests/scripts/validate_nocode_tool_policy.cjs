const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const policySource = read('js/nocode_tool_policy.js');
const routerSource = read('js/mcp_endpoint_router.js');
// Exercise the real dispatch decision, without executing its selected requestable.
const start = routerSource.indexOf('  var toolNameRaw = paramsObject');
const end = routerSource.indexOf('  if (mappingError) {', start);
assert.ok(start > 0 && end > start, 'tools/call decision must be found');
const decision = routerSource.slice(start, end);
function fixture(header) {
  const context = {
    context: { httpServletRequest: { getHeader: () => header } },
    C8O: { guidance: { warningForToolCall: () => '', stripToolArguments: args => args } }
  };
  vm.runInNewContext(policySource, context);
  return context;
}
function route(name, kind, header) {
  const context = fixture(header);
  context.paramsObject = { name, arguments: {} };
  context.mcpAuthentication = { kind };
  vm.runInNewContext(decision, context);
  return context;
}
const tools = [
  'nocode-form-get', 'nocode-form-contract-get', 'nocode-form-compile',
  'nocode-form-validate', 'nocode-form-create', 'nocode-form-edit', 'nocode-form-update',
  'nocode-baserow-catalog-list', 'nocode-baserow-schema-apply'
];

test('every supported NoCode tool passes both profile and token dispatch restrictions', () => {
  for (const name of tools) {
    const result = route(name, 'nocode', 'nocode');
    assert.equal(result.mappingError, null, name);
    assert.equal(result.targetSequence, 'tools_' + name.replaceAll('-', '_'));
    assert.equal(result.C8O.nocodeToolPolicy.allows(result.targetSequence), true);
  }
});

test('NoCode tokens cannot route logs or low-code calls, even without a profile header', () => {
  for (const header of [null, '', 'nocode', 'studio']) {
    for (const name of ['log-view', 'project-list', 'databaseobject-tree-get', 'requestable-execute', 'batch-call']) {
      assert.equal(route(name, 'nocode', header).mappingError.status, '403', name);
    }
  }
});

test('NoCode header narrows a broader token but ordinary Studio calls are unchanged', () => {
  for (const name of ['log-view', 'project-list', 'databaseobject-tree-get', 'batch-call']) {
    assert.equal(route(name, 'managed', 'nocode').mappingError.status, '403');
    for (const header of [null, '', 'studio', 'generalist']) {
      const result = route(name, 'managed', header);
      assert.equal(result.mappingError, null, name);
      assert.equal(Boolean(result.C8O.nocodeToolPolicy.active()), false);
    }
  }
  assert.equal(fixture('nocode').C8O.nocodeToolPolicy.allows('tools_log_view'), false);
});

test('documented NoCode tools match the dispatch allowlist', () => {
  const skill = read('resources/convertigo-nocode/SKILL.md');
  const section = skill.slice(skill.indexOf('Allowed Convertigo MCP tools:'), skill.indexOf('Forbidden Convertigo MCP tools'));
  const documented = [...section.matchAll(/^- `([^`]+)`\s*$/gm)].map(match => match[1]);
  assert.deepEqual(documented.sort(), [...tools].sort());
  for (const name of documented) {
    assert.equal(route(name, 'nocode', 'nocode').mappingError, null, name);
  }
});

test('token audience validation retains both supported audiences and rejects unrelated ones', () => {
  const source = read('_c8oProject/sequences/nocode_validate_token.yaml');
  assert.doesNotMatch(source, /^(<<<<<<<|=======|>>>>>>>)/m);
  const match = source.match(/\} else if \(([^\n]*payload\.aud[^\n]*)\) \{/);
  assert.ok(match, 'actual audience rejection condition must be found');
  for (const aud of ['lib_ConvertigoMCP', 'ConvertigoMCP']) {
    assert.equal(vm.runInNewContext(match[1], { payload: { aud } }), false);
  }
  for (const aud of ['', 'other-service', 'ConvertigoMCP.evil', null, undefined]) {
    assert.equal(vm.runInNewContext(match[1], { payload: { aud } }), true);
  }
});
