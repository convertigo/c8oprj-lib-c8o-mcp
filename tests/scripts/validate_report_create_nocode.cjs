// Tigo's feedback for a No Code Studio user (lib_ConvertigoAssistant docs/tigo-feedback.md): nocode-report-create is
// the only report tool a no-code token reaches, it is listed with the user's own consent once the server's feedback key
// is installed, and its reports land in that user's folder, under the key of their Tigo conversations.
// node --test tests/scripts/validate_report_create_nocode.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const routerSource = read('js/mcp_endpoint_router.js');
const start = routerSource.indexOf('  var toolNameRaw = paramsObject');
const end = routerSource.indexOf('  if (mappingError) {', start);
const decision = routerSource.slice(start, end);
function route(name, kind, profile) {
  const headers = { 'X-Convertigo-Agent-Profile': profile || '' };
  const context = {
    context: { httpServletRequest: { getHeader: h => headers[h] || null } },
    C8O: { guidance: { warningForToolCall: () => '', stripToolArguments: a => a } },
    paramsObject: { name, arguments: {} },
    mcpAuthentication: { kind }
  };
  vm.runInNewContext(read('js/nocode_tool_policy.js'), context);
  vm.runInNewContext(read('js/gateway_tool_policy.js'), context);
  vm.runInNewContext(decision, context);
  return context;
}

// reporting.js on a server: a workspace of files, the TIGO_FEEDBACK_KEY environment variable and the MCP token's user.
function reporting({ studio = false, env = {}, files = {}, policy = '', user = null } = {}) {
  const sandbox = {
    C8O: { util: { toTrimmedString: v => v == null ? '' : String(v).trim() } },
    include: () => {},
    Packages: { com: { twinsoft: { convertigo: { engine: { Engine: {
      isStudioMode: () => studio,
      USER_WORKSPACE_PATH: '/ws',
      theApp: { databaseObjectsManager: { symbolsGetValue: name => name === 'assistant.feedback.policy' ? policy : null, getCompiledValue: () => 'off' } }
    } } } } } },
    java: {
      lang: {
        System: { getenv: name => env[name] || null },
        String: class { constructor(v, enc) { this.v = Buffer.isBuffer(v) ? v.toString(enc ? 'utf8' : 'utf8') : String(v); } getBytes() { return Buffer.from(this.v, 'utf8'); } toString() { return this.v; } }
      },
      io: { File: class { constructor(base, rel) { this.p = base + '/' + rel; } isFile() { return Object.prototype.hasOwnProperty.call(files, this.p); } length() { return Buffer.byteLength(files[this.p] || ''); } toPath() { return this.p; } } },
      nio: { file: { Files: { isSymbolicLink: () => false, readAllBytes: p => Buffer.from(files[p], 'utf8') } } },
      security: { MessageDigest: { getInstance: () => ({ digest: bytes => Array.from(crypto.createHash('sha256').update(bytes).digest(), b => b > 127 ? b - 256 : b) }) } }
    },
    context: { httpServletRequest: {} }
  };
  sandbox.C8O.mcpAuth = { authenticateRequest: () => user ? { authenticated: true, kind: 'nocode', user } : { authenticated: true, kind: 'managed', payload: { sub: 'admin' } } };
  vm.runInNewContext(read('js/reporting.js'), sandbox);
  return sandbox.C8O.reporting;
}

const KEY = 'sk-' + 'k'.repeat(43);

test('a no-code token reaches nocode-report-create, never report-create', () => {
  assert.equal(route('nocode-report-create', 'nocode', 'nocode').mappingError, null);
  assert.equal(route('nocode-report-create', 'nocode', 'nocode').targetSequence, 'tools_nocode_report_create');
  const refused = route('report-create', 'nocode', 'nocode').mappingError;
  assert.equal(refused && refused.status, '403');
  const sandbox = { context: { httpServletRequest: { getHeader: () => 'nocode' } } };
  vm.runInNewContext(read('js/nocode_tool_policy.js'), sandbox);
  assert.equal(sandbox.C8O.nocodeToolPolicy.allows('tools_nocode_report_create'), true);
  assert.equal(sandbox.C8O.nocodeToolPolicy.allows('tools_report_create'), false);
});

test('the tool list shows the no-code report tool only to a no-code token with the user\'s consent', () => {
  const list = read('_c8oProject/sequences/mcp_tools_list.yaml');
  assert.match(list, /if \(feedbackMode == "off" && \(seqName == "tools_report_create" \|\| seqName == "tools_nocode_report_create"\)\) \{\n\s+continue;/);
  assert.match(list, /if \(seqName == "tools_nocode_report_create" && mcpAuthKind !== "nocode"\) \{\n\s+continue;/);
  const tool = read('_c8oProject/sequences/tools_nocode_report_create.yaml');
  assert.match(tool, /^accessibility: Private$/m);
  assert.match(tool, /never name the user's forms, pages, fields, Baserow workspaces, databases, tables or their data/);
  assert.match(tool, /C8O\.reporting\.writeTigoReport\(\{/);
  assert.doesNotMatch(tool, /relativePath|reportResult\.path/, 'the tool never shows the server folder of the user');
  assert.match(read('c8oProject.yaml'), /↓tools_nocode_report_create \[sequences\.GenericSequence\]: 🗏 sequences\/tools_nocode_report_create\.yaml/);
  assert.match(read('resources/convertigo-nocode/SKILL.md'), /- `nocode-report-create`, only when it is listed/);
  assert.match(read('_c8oProject/sequences/mcp_initialize.yaml'), /→→: C8O\.reporting\.reportToolName\(\)/);
});

test('the user key is the key of their Tigo conversations (pinned with lib_ConvertigoAssistant userPathSlug)', () => {
  const R = reporting();
  assert.equal(R.feedbackUserKey('google:108792390496318778325:alice@example.com'), 'alice_example.com--ff8d9819fc0e12bf');
  assert.equal(R.feedbackUserKey('alice@example.com'), 'alice_example.com--ff8d9819fc0e12bf');
  assert.equal(R.feedbackUserKey('c8o:admin'), 'c8o_admin--39200cbc6e42f785');
  assert.equal(R.feedbackUserKey('charlesg@convertigo.com'), 'charlesg_convertigo.com--6f44028bedca0f0f');
  assert.equal(R.feedbackUserKey('a:b:not-an-email'), 'a_b_not-an-email--07939279849dddec');
  assert.equal(R.feedbackUserKey(''), '');
  assert.equal(R.feedbackUserKey('studio'), '');
});

test('on a server: off without the feedback key; with it, the no-code user\'s own consent and folder', () => {
  const alice = 'alice_example.com--ff8d9819fc0e12bf';
  const settings = { ['/ws/agents/feedback/users/' + alice + '/settings.json']: '{"mode":"ask"}', '/ws/agents/feedback/settings.json': '{"mode":"auto"}' };
  assert.equal(reporting({ files: settings, user: 'google:1:alice@example.com' }).tigoMode(), 'off', 'no server key');
  const server = reporting({ env: { TIGO_FEEDBACK_KEY: KEY }, files: settings, user: 'google:1:alice@example.com' });
  assert.equal(server._feedbackDirectory(), 'agents/feedback/users/' + alice);
  assert.equal(server.tigoMode(), 'ask', 'her choice, not the engine-wide file');
  assert.equal(server.resolveMode(), 'tigo');
  assert.equal(server.reportToolName(), 'nocode-report-create');
  assert.equal(reporting({ env: { TIGO_FEEDBACK_KEY: KEY }, files: settings, user: 'google:2:bob@example.com' }).tigoMode(), 'off', 'another user did not agree');
  assert.equal(reporting({ env: { TIGO_FEEDBACK_KEY: KEY }, files: settings }).tigoMode(), 'off', 'a token that is not a no-code user\'s');
  assert.equal(reporting({ env: { TIGO_FEEDBACK_KEY: KEY }, files: settings, user: 'google:1:alice@example.com', policy: 'auto' }).tigoMode(), 'auto');
  assert.equal(reporting({ env: { TIGO_FEEDBACK_KEY: KEY }, files: settings, user: 'google:1:alice@example.com', policy: 'off' }).tigoMode(), 'off');
  // The key file works as well as the environment variable; a malformed key does not.
  assert.equal(reporting({ files: { ...settings, '/ws/agents/feedback/server-key': KEY + '\n' }, user: 'google:1:alice@example.com' }).tigoMode(), 'ask');
  assert.equal(reporting({ env: { TIGO_FEEDBACK_KEY: 'sk-short' }, files: settings, user: 'google:1:alice@example.com' }).tigoMode(), 'off');
  // A forged key never leaves the users folder.
  assert.equal(server._feedbackDirectory('../settings'), '');
  // The Studio keeps its engine-wide consent.
  assert.equal(reporting({ studio: true, files: settings }).tigoMode(), 'auto');
});

// GLM 5.3 told a No Code user twice that it could not see the form in a browser nor read the rows of a table, worked
// around it with a diagnostic field, and filed nothing: it read "a friction of a tool you had to work around" as a
// failing tool only (gregoryv, test-nocode, 26/10). The skill and the tool name a missing capability and a workaround.
test('the skill and the tool ask for a missing capability or a workaround, even without a failing tool', () => {
  const skill = read('resources/convertigo-nocode/SKILL.md');
  const section = skill.slice(skill.indexOf('## Feedback to Convertigo'), skill.indexOf('NoCode bearer tokens cannot access'));
  assert.match(section, /before your final answer/);
  assert.match(section, /You needed a capability that no allowed tool gives: seeing how the saved form renders or behaves in a browser, reading the rows of a Baserow table/);
  assert.match(section, /This counts even when no tool failed\./);
  assert.match(section, /added a diagnostic field to the user's form, or asked the user to look, test or copy values for you/);
  assert.match(section, /Telling the user about the limitation does not replace the report: do both\./);
  assert.match(section, /never name the user's forms, pages, fields, Baserow workspaces, databases or tables/);
  assert.match(skill, /say exactly which no-code limitation blocks it\. Offer the closest no-code-safe alternative if one exists\. When `nocode-report-create` is listed, also file that limitation/);
  const tool = read('_c8oProject/sequences/tools_nocode_report_create.yaml');
  assert.match(tool, /a capability you needed that no no-code tool gives \(seeing the saved form in a browser, reading the rows of a Baserow table, running a calculation\)/);
  assert.match(tool, /File it before your final answer, even when no tool failed\./);
});
