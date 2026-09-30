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
