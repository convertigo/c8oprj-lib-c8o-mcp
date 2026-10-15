const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

// _setupCodex writes X-Convertigo-No-Log on [mcp_servers.convertigo.http_headers]:
// true writes it, false removes it, undefined keeps it, and a Bridge-owned entry
// (from_bridge=true) keeps the header the Bridge chose.
function loadPatch() {
  const source = fs.readFileSync(path.join(root, 'js/setup_codex.js'), 'utf8')
    .replace(/^include\([^\n]+\);\s*$/gm, '')
    .replace('C8O.setupCodex.run = function', 'C8O.setupCodex._patchConfigToml = patchConfigToml;\n  C8O.setupCodex.run = function');
  const context = { C8O: { MCP_GUIDANCE_VERSION: 'v1', util: {}, setupCodex: { autoRun: false } } };
  vm.runInNewContext(source, context, { filename: 'setup_codex.js' });
  return (existing, noLog, enableFlow) => context.C8O.setupCodex._patchConfigToml(
    existing, 'http://localhost:18080/convertigo/api/mcp?jsonOnly=true', 'tok', [], enableFlow === true, noLog);
}

function headersOf(text, server) {
  const start = text.indexOf('[mcp_servers.' + server + '.http_headers]');
  if (start < 0) return '';
  const next = text.indexOf('\n[', start + 1);
  return text.slice(start, next < 0 ? undefined : next);
}

const noLog = /^"X-Convertigo-No-Log" = "true"$/m;

test('mcpNoLog writes, removes or keeps X-Convertigo-No-Log on the convertigo server only', () => {
  const patch = loadPatch();
  const quiet = patch('', true, true);
  assert.match(headersOf(quiet.text, 'convertigo'), noLog);
  assert.match(headersOf(quiet.text, 'convertigo'), /^Authorization = "Bearer tok"$/m);
  assert.doesNotMatch(headersOf(quiet.text, 'convertigo-flow'), noLog);
  assert.equal(patch(quiet.text, true, true).status, 'unchanged');
  assert.match(patch(quiet.text, undefined, true).text, noLog);
  const lower = quiet.text.replace('"X-Convertigo-No-Log"', '"x-convertigo-no-log"');
  assert.doesNotMatch(patch(lower, false, true).text, /no-log/i);
  assert.doesNotMatch(patch('', false).text, /no-log/i);
});

test('a Bridge-owned entry keeps the no-log header the Bridge chose', () => {
  const patch = loadPatch();
  const bridge = [
    '[mcp_servers.convertigo]',
    'url = "http://localhost:18082/convertigo/api/mcp?from_bridge=true"',
    'startup_timeout_sec = 60',
    '',
    '[mcp_servers.convertigo.http_headers]',
    '"X-Convertigo-No-Log" = "true"',
    ''
  ].join('\n');
  assert.match(patch(bridge, false).text, noLog);
  assert.doesNotMatch(patch(bridge.replace('"X-Convertigo-No-Log" = "true"\n', ''), true).text, noLog);
});

test('mcpNoLogEnabled: explicit value, then the agentbridge.mcp.nolog symbol, then true', () => {
  const source = fs.readFileSync(path.join(root, 'js/util.js'), 'utf8').replace(/^include\([^\n]+\);\s*$/gm, '');
  const decide = symbol => {
    const context = {
      C8O: { project: {} },
      Packages: { com: { twinsoft: { convertigo: { engine: { Engine: { theApp: { databaseObjectsManager: {
        symbolsGetValue: name => (name === 'agentbridge.mcp.nolog' ? symbol : null)
      } } } } } } } }
    };
    vm.runInNewContext(source, context, { filename: 'util.js' });
    return context.C8O.util.mcpNoLogEnabled;
  };
  assert.equal(decide(null)(''), true);
  assert.equal(decide(null)(undefined), true);
  assert.equal(decide('false')(''), false);
  assert.equal(decide('false')('true'), true);
  assert.equal(decide('true')('false'), false);
  assert.equal(decide('')(' '), true);
});
