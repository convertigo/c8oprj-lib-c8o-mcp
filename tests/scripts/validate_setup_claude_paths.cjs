const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

// Claude Code reads mcpServers from ~/.claude.json when CLAUDE_CONFIG_DIR is unset,
// and from $CLAUDE_CONFIG_DIR/.claude.json when it is set. Skills follow the config
// dir (~/.claude/skills by default). A setup that writes ~/.claude/.claude.json
// leaves the running client on a stale token.
function loadLayout(env) {
  const source = fs.readFileSync(path.join(root, 'js/setup_claude.js'), 'utf8')
    .replace(/^include\([^\n]+\);\s*$/gm, '')
    .replace(/\nvar setupClaudeResult = [\s\S]*$/, '\n');
  function File(parent, child) {
    const base = child === undefined ? String(parent) : path.join(String(parent.path || parent), String(child));
    this.path = path.normalize(base);
    this.getCanonicalFile = () => new File(this.path);
    this.getAbsolutePath = () => this.path;
  }
  const context = {
    C8O: { setupCodex: { _helpers: { trim: v => (v == null ? '' : String(v).trim()), userHomeDirectory: () => '/home/dev' } } },
    Packages: { java: { io: { File }, lang: { System: { getenv: name => (env || {})[name] || null } } } }
  };
  vm.runInNewContext(source, context, { filename: 'setup_claude.js' });
  return input => {
    const layout = context.C8O.setupClaude._resolveLayout(input);
    return { home: layout.home.path, skills: layout.skillsDir.path, state: layout.stateFile.path };
  };
}

test('default home writes skills to ~/.claude/skills and MCP config to ~/.claude.json', () => {
  assert.deepEqual(loadLayout({})(''), {
    home: '/home/dev/.claude',
    skills: '/home/dev/.claude/skills',
    state: '/home/dev/.claude.json'
  });
});

test('CLAUDE_CONFIG_DIR keeps skills and MCP config together in that directory', () => {
  assert.deepEqual(loadLayout({ CLAUDE_CONFIG_DIR: '/opt/claude-home' })(''), {
    home: '/opt/claude-home',
    skills: '/opt/claude-home/skills',
    state: '/opt/claude-home/.claude.json'
  });
});

test('an explicit claudeHome is an isolated config dir, as used by the Agent Bridge', () => {
  const resolve = loadLayout({ CLAUDE_CONFIG_DIR: '/ignored' });
  assert.deepEqual(resolve('~/bridge/claude'), {
    home: '/home/dev/bridge/claude',
    skills: '/home/dev/bridge/claude/skills',
    state: '/home/dev/bridge/claude/.claude.json'
  });
});

// X-Convertigo-No-Log on the convertigo server: true writes it, false removes it,
// undefined keeps it; a Bridge-owned entry (from_bridge=true) keeps the Bridge's choice.
function loadPatch() {
  const source = fs.readFileSync(path.join(root, 'js/setup_claude.js'), 'utf8')
    .replace(/^include\([^\n]+\);\s*$/gm, '')
    .replace(/\nvar setupClaudeResult = [\s\S]*$/, '\n')
    .replace('C8O.setupClaude.run = function', 'C8O.setupClaude._patchClaudeState = patchClaudeState;\n  C8O.setupClaude.run = function');
  const context = {
    C8O: { MCP_GUIDANCE_VERSION: 'v1', setupCodex: { _helpers: { trim: v => (v == null ? '' : String(v).trim()), flowMcpUrl: u => u + '-flow' } } }
  };
  vm.runInNewContext(source, context, { filename: 'setup_claude.js' });
  return (existing, noLog, enableFlow) => {
    const patched = context.C8O.setupClaude._patchClaudeState(existing, 'http://localhost:18080/convertigo/api/mcp?jsonOnly=true', 'tok', [], enableFlow === true, noLog);
    return { status: patched.status, servers: JSON.parse(patched.text).mcpServers };
  };
}

test('mcpNoLog writes, removes or keeps X-Convertigo-No-Log on the convertigo server only', () => {
  const patch = loadPatch();
  const quiet = patch('', true, true);
  assert.equal(quiet.servers.convertigo.headers['X-Convertigo-No-Log'], 'true');
  assert.equal(quiet.servers.convertigo.headers.Authorization, 'Bearer tok');
  assert.equal(quiet.servers['convertigo-flow'].headers['X-Convertigo-No-Log'], undefined);
  const quietText = JSON.stringify({ mcpServers: quiet.servers }, null, 2) + '\n';
  assert.equal(patch(quietText, true, true).status, 'unchanged');
  assert.equal(patch(quietText, undefined, true).servers.convertigo.headers['X-Convertigo-No-Log'], 'true');
  const lower = quietText.replace('X-Convertigo-No-Log', 'x-convertigo-no-log');
  assert.deepEqual(Object.keys(patch(lower, false, true).servers.convertigo.headers).filter(k => /no-log/i.test(k)), []);
});

test('a Bridge-owned entry keeps the no-log header the Bridge chose', () => {
  const patch = loadPatch();
  const bridge = { mcpServers: { convertigo: { type: 'http', url: 'http://localhost:18082/convertigo/api/mcp?from_bridge=true', headers: { 'X-Convertigo-No-Log': 'true' } } } };
  assert.equal(patch(JSON.stringify(bridge), false).servers.convertigo.headers['X-Convertigo-No-Log'], 'true');
  delete bridge.mcpServers.convertigo.headers['X-Convertigo-No-Log'];
  assert.equal(patch(JSON.stringify(bridge), true).servers.convertigo.headers['X-Convertigo-No-Log'], undefined);
});
