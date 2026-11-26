// Run: node --test tests/scripts/validate_skill_install.cjs
// A client with no Convertigo No Code skill, or one of another guidance version, gets the whole skill from the MCP
// (26/11): the server instructions bootstrap it (js/server_instructions.js), skill-install answers SKILL.md to apply at
// once and every file with its checksum to write for the next sessions (js/skill_package.js), and the resources
// convertigo://skills/convertigo-nocode[/<drawer>] serve the same files. These checks install it into a temporary
// folder as an agent would, detect its version, update it, plan without writing, and keep it to plain skill files.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const sha = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const strip = source => source.replace(/^[ \t]*include\([^\n]+\);[ \t]*$/gm, '');
const VERSION = '2026-09-18.skill-layers.0123456789abcdef';
const OLD = '2026-09-18.skill-layers.fedcba9876543210';
const ENDPOINT = 'https://nocode.example.test/convertigo/api/mcp';
const FOLDER = path.join(root, 'resources/convertigo-nocode');
const DRAWERS = [...read('resources/convertigo-nocode/SKILL.md').matchAll(/^> Drawer `([a-z0-9][a-z0-9-]*\.md)`/gm)].map(m => m[1]);
const PLAIN_FILE = /^[A-Za-z0-9][A-Za-z0-9-]*\.md$/;

function readCatalog(folder, name) {
  const file = path.join(root, folder, name);
  if (!fs.existsSync(file)) throw new Error('Catalog file not found: ' + folder + '/' + name);
  return fs.readFileSync(file, 'utf8');
}

// js/skill_package.js as the engine runs it, its host reading the repository; setup_common.js for the generalist.
function sandbox() {
  const ctx = { C8O: { MCP_GUIDANCE_VERSION: VERSION, util: { toBoolean: v => v === true || String(v) === 'true' } }, c8oReadCatalogFile: readCatalog };
  ctx.include = () => { throw new Error('no include in the tests'); };
  vm.createContext(ctx);
  vm.runInContext(strip(read('js/setup_common.js')), ctx, { filename: 'setup_common.js' });
  vm.runInContext(strip(read('js/skill_package.js')), ctx, { filename: 'skill_package.js' });
  const pkg = ctx.C8O.skillPackage;
  pkg.host.version = () => VERSION;
  pkg.host.mcpUrl = () => ENDPOINT;
  return { ctx, pkg };
}
const { pkg } = sandbox();
const install = (args, env) => plain(pkg.install(args || {}, env || {}));

function withTemp(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-install-'));
  try {
    return run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// What an agent does with the answers: SKILL.md from the first one, each other file by its own call, written in the
// skill folder; obsolete files deleted, other files kept.
function agentInstall(dir, first, harness = 'generic') {
  fs.mkdirSync(dir, { recursive: true });
  const written = {};
  written['SKILL.md'] = first.content;
  for (const name of first.remaining) {
    const one = install({ harness, file: name });
    assert.equal(one.status, 'ok', name);
    assert.equal(one.sha256, sha(one.content), name + ' checksum of its own content');
    written[name] = one.content;
  }
  for (const [name, content] of Object.entries(written)) fs.writeFileSync(path.join(dir, name), content, 'utf8');
  for (const name of first.obsolete) fs.rmSync(path.join(dir, name));
  // the check the answer asks for: every file as written has its bytes and sha256
  for (const entry of first.files) {
    const disk = fs.readFileSync(path.join(dir, entry.path));
    assert.equal(disk.length, entry.bytes, entry.path + ' bytes');
    assert.equal(crypto.createHash('sha256').update(disk).digest('hex'), entry.sha256, entry.path + ' sha256');
  }
}

// The folder as the client describes it: {path, sha256} of each file.
const listing = dir => fs.readdirSync(dir).map(name => ({ path: name, sha256: sha(fs.readFileSync(path.join(dir, name), 'utf8')) }));
const installedVersionOf = dir => (/^- Skill guidance version: `([^`]*)`\./m.exec(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8')) || [])[1] || '';

test('the SHA-256 of the package is the standard one, on the skill files and on the edges of a block', () => {
  for (const name of ['SKILL.md', ...DRAWERS]) {
    const text = read('resources/convertigo-nocode/' + name);
    assert.equal(pkg.sha256(text), sha(text), name);
    assert.equal(pkg.utf8Length(text), Buffer.byteLength(text, 'utf8'), name);
  }
  for (const text of ['', 'a', 'é', '😀', '« guillemets » — ok', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(63), 'x'.repeat(64), 'é'.repeat(100), '\u0000\n\t"\\']) {
    assert.equal(pkg.sha256(text), sha(text), JSON.stringify(text.slice(0, 10)) + ' ' + text.length);
  }
});

test('a client without the skill gets SKILL.md to apply at once, and every file to write; installed, it is up to date', () => {
  withTemp(dir => {
    const first = install({ harness: 'codex' });
    assert.equal(first.status, 'install');
    assert.equal(first.upToDate, false);
    assert.equal(first.version, VERSION);
    assert.equal(first.skill, 'convertigo-nocode');
    assert.equal(first.targetDir, '~/.codex/skills/convertigo-nocode/');
    assert.deepEqual(first.files.map(f => f.path), ['SKILL.md', ...DRAWERS]);
    assert.deepEqual(first.remaining, DRAWERS);
    assert.deepEqual(first.obsolete, []);
    assert.ok(first.files.every(f => f.action === 'write' && /^[0-9a-f]{64}$/.test(f.sha256)));
    assert.equal(first.files[0].resource, 'convertigo://skills/convertigo-nocode');
    assert.equal(first.files[1].resource, 'convertigo://skills/convertigo-nocode/' + DRAWERS[0]);
    assert.match(first.content, new RegExp('^- Skill guidance version: `' + VERSION.replace(/\./g, '\\.') + '`\\.$', 'm'));
    assert.ok(first.content.includes('- Expected MCP endpoint: `' + ENDPOINT + '`.'));
    assert.match(first.content, /call `skill-install` \(or rerun `_setupCodex`\)/);
    assert.ok(first.howTo.some(step => /^Apply SKILL\.md now/.test(step)));
    assert.ok(first.howTo.some(step => /skill-install \{file: "<name>"\}/.test(step)));
    assert.ok(first.howTo.some(step => /If you cannot write files, keep this content for this session/.test(step)));
    // the order a page reader meets: what to do and the files first, the content last
    const keys = Object.keys(first);
    assert.ok(keys.indexOf('howTo') < keys.indexOf('content') && keys.indexOf('files') < keys.indexOf('content'), keys.join());
    for (const name of DRAWERS) assert.equal(install({ file: name }).content, read('resources/convertigo-nocode/' + name), name + ' is the file itself');

    const skillDir = path.join(dir, 'convertigo-nocode');
    agentInstall(skillDir, first, 'codex');
    assert.deepEqual(fs.readdirSync(skillDir).sort(), fs.readdirSync(FOLDER).sort());
    assert.equal(installedVersionOf(skillDir), VERSION, 'the installed SKILL.md carries the version');
    const again = install({ harness: 'codex', installedVersion: installedVersionOf(skillDir), installedFiles: listing(skillDir) });
    assert.equal(again.status, 'up_to_date');
    assert.equal(again.upToDate, true);
    assert.equal(again.content, undefined, 'nothing to apply again');
    assert.match(again.message, /nothing to install/);
    // the version alone says up to date too (a client that does not list its files)
    assert.equal(install({ harness: 'codex', installedVersion: VERSION }).status, 'up_to_date');
  });
});

test('another installed version, a changed file or a file the skill dropped: the update says what to write and delete', () => {
  withTemp(dir => {
    const skillDir = path.join(dir, 'convertigo-nocode');
    agentInstall(skillDir, install({ harness: 'claude' }), 'claude');
    // an older install: another version line, a changed drawer, a drawer the skill no longer names, a file of the user
    const skillFile = path.join(skillDir, 'SKILL.md');
    fs.writeFileSync(skillFile, fs.readFileSync(skillFile, 'utf8').replace(VERSION, OLD));
    fs.writeFileSync(path.join(skillDir, DRAWERS[1]), 'an older drawer\n');
    fs.writeFileSync(path.join(skillDir, 'old-drawer.md'), '# Old drawer\n');
    fs.writeFileSync(path.join(skillDir, 'notes.txt'), 'kept\n');
    assert.equal(installedVersionOf(skillDir), OLD);

    const update = install({ harness: 'claude', installedVersion: OLD, installedFiles: listing(skillDir) });
    assert.equal(update.status, 'install');
    assert.equal(update.upToDate, false);
    assert.equal(update.installedVersion, OLD);
    const action = Object.fromEntries(update.files.map(f => [f.path, f.action]));
    assert.equal(action['SKILL.md'], 'update');
    assert.equal(action[DRAWERS[1]], 'update');
    assert.equal(action[DRAWERS[0]], 'unchanged');
    assert.deepEqual(update.obsolete, ['old-drawer.md'], 'only a Markdown file the skill dropped; notes.txt stays');
    agentInstall(skillDir, update, 'claude');
    assert.deepEqual(fs.readdirSync(skillDir).sort(), [...fs.readdirSync(FOLDER), 'notes.txt'].sort());
    assert.equal(installedVersionOf(skillDir), VERSION);
    assert.equal(install({ harness: 'claude', installedVersion: VERSION, installedFiles: listing(skillDir) }).status, 'up_to_date');

    // the right version but a missing drawer is not up to date
    fs.rmSync(path.join(skillDir, DRAWERS[2]));
    const missing = install({ harness: 'claude', installedVersion: VERSION, installedFiles: listing(skillDir) });
    assert.equal(missing.status, 'install');
    assert.equal(missing.files.find(f => f.path === DRAWERS[2]).action, 'create');
    // plain names, or the listing as JSON text (a client that sends a string), count the same
    assert.equal(install({ installedVersion: VERSION, installedFiles: JSON.stringify(fs.readdirSync(skillDir)) }).files.find(f => f.path === DRAWERS[2]).action, 'create');
    // the same list encoded twice, a list as text, and an empty text (the engine passes arguments as text)
    assert.equal(install({ installedVersion: VERSION, installedFiles: JSON.stringify(JSON.stringify(fs.readdirSync(skillDir))) }).files.find(f => f.path === DRAWERS[2]).action, 'create');
    assert.deepEqual(install({ installedVersion: OLD, installedFiles: 'SKILL.md, x-old.md' }).obsolete, ['x-old.md']);
    assert.deepEqual(install({ installedVersion: OLD, installedFiles: '"x-old.md, y-old.md"' }).obsolete, ['x-old.md', 'y-old.md']);
    for (const empty of ['', '""', '[]', null]) {
      const answer = install({ installedFiles: empty });
      assert.equal(answer.refusedPaths, undefined, JSON.stringify(empty));
      assert.deepEqual(answer.obsolete, [], JSON.stringify(empty));
    }
  });
});

test('plan answers the files, their checksums and the obsolete ones, without content, and nothing is written', () => {
  withTemp(dir => {
    const before = fs.readdirSync(dir);
    const planned = install({ harness: 'vibe', plan: true, installedVersion: OLD, installedFiles: ['SKILL.md', 'old-drawer.md'] });
    assert.equal(planned.status, 'plan');
    assert.equal(planned.content, undefined);
    assert.equal(planned.contents, undefined);
    assert.equal(planned.remaining, undefined);
    assert.deepEqual(planned.obsolete, ['old-drawer.md']);
    assert.equal(planned.targetDir, '~/.vibe/skills/convertigo-nocode/');
    assert.ok(planned.howTo[0].startsWith('Plan only: nothing is written'));
    assert.ok(planned.howTo.some(step => /enabled_skills/.test(step)), 'the Vibe skill filter');
    assert.ok(planned.files.every(f => /^[0-9a-f]{64}$/.test(f.sha256) && f.chars > 0));
    assert.equal(plain(pkg.install({ plan: 'true' })).status, 'plan', 'plan as text');
    assert.deepEqual(fs.readdirSync(dir), before);
    // the package writes nothing at all: no file API in it
    assert.doesNotMatch(read('js/skill_package.js'), /Files\.write|FileOutputStream|FileWriter|\.delete\(\)|createDirectories|writeText/);
  });
});

test('each harness gets its folder and its setup, and the setups install the very same files', () => {
  const rendered = harness => install({ harness }).content;
  assert.match(rendered('codex'), /`_setupCodex`/);
  assert.match(rendered('claude'), /`_setupClaude`/);
  assert.match(rendered('vibe'), /`_setupVibe`/);
  assert.doesNotMatch(rendered('generic'), /_setup(Codex|Claude|Vibe)/, 'a generic client is told skill-install only');
  assert.match(rendered('generic'), /call `skill-install` before using no-code mutation tools/);
  assert.equal(install({ harness: 'Claude Code' }).harness, 'claude');
  assert.equal(install({ harness: 'something-else' }).harness, 'generic');
  assert.equal(install({ harness: 'something-else' }).targetDir, '<skills folder of your agent>/convertigo-nocode/');

  // _setupCodex and _setupClaude, as the engine runs them, install the same SKILL.md and drawers
  withTemp(dir => {
    const setups = loadSetups();
    for (const harness of ['codex', 'claude']) {
      const home = path.join(dir, harness);
      setups[harness](home);
      const skillDir = path.join(home, 'skills/convertigo-nocode');
      const answer = install({ harness, all: true });
      assert.deepEqual(answer.contents.map(c => c.path).sort(), fs.readdirSync(skillDir).sort(), harness);
      for (const { path: name, content } of answer.contents) {
        assert.equal(fs.readFileSync(path.join(skillDir, name), 'utf8'), content, harness + ' ' + name);
      }
    }
  });
});

test('only the plain files of the skill: no path outside its folder, no token, key or client configuration', () => {
  for (const asked of ['../SKILL.md', '/etc/passwd', 'convertigo-nocode/../x.md', 'a/b.md', '..', '.env', 'config.toml', 'C:\\x.md', 'nothing.md']) {
    const answer = install({ file: asked });
    assert.equal(answer.status, 'invalid', asked);
    assert.equal(answer.error.code, 'unknown_file', asked);
    assert.equal(answer.content, undefined, asked);
  }
  assert.equal(install({ file: 'convertigo-nocode/' + DRAWERS[0] }).path, DRAWERS[0], 'the path in the skill folder is its plain name');
  assert.equal(install({ file: './SKILL.md' }).path, 'SKILL.md');
  const refused = install({ installedVersion: OLD, installedFiles: ['../outside.md', '/etc/x.md', 'ok-old.md', { path: 'sub/dir.md' }] });
  assert.deepEqual(refused.obsolete, ['ok-old.md'], 'never a deletion outside the folder');
  assert.deepEqual(refused.refusedPaths, ['../outside.md', '/etc/x.md', 'sub/dir.md']);
  const all = install({ all: true });
  for (const { path: name, content } of all.contents) {
    assert.match(name, PLAIN_FILE);
    assert.doesNotMatch(content, /Bearer [A-Za-z0-9._-]{20,}|\bsk-[A-Za-z0-9]{20,}|llm-api-key|mcp_servers\.|\[mcp_servers/, name);
  }
  assert.doesNotMatch(JSON.stringify(all), /"(token|apiKey|api_key|authorization|password)"\s*:/i);
});

test('the generalist skill is for other tokens; a No Code token is told to use the No Code one', () => {
  const nocode = install({ skill: 'convertigo-generalist' }, { authKind: 'nocode' });
  assert.equal(nocode.status, 'not_applicable');
  assert.equal(nocode.content, undefined);
  const vibe = install({ skill: 'generalist', harness: 'vibe' }, { authKind: 'managed' });
  assert.equal(vibe.status, 'install');
  assert.equal(vibe.skill, 'convertigo-vibe-generalist');
  assert.equal(vibe.targetDir, '~/.vibe/skills/convertigo-vibe-generalist/');
  assert.deepEqual(vibe.files.map(f => f.path), ['SKILL.md']);
  assert.match(vibe.content, /^name: convertigo-vibe-generalist$/m);
  assert.match(vibe.content, new RegExp('Skill guidance version: `' + VERSION.replace(/\./g, '\\.') + '`'));
  assert.equal(install({ skill: 'convertigo-generalist', harness: 'claude', installedVersion: VERSION }).status, 'up_to_date');
  assert.equal(install({ skills: ['convertigo-nocode'] }).skill, 'convertigo-nocode', 'skills as an array');
  assert.equal(plain(pkg.install({ skill: '["convertigo-generalist"]', harness: 'codex' }, {})).skill, 'convertigo-generalist');
  assert.equal(install({ skill: 'other' }).error.code, 'unknown_skill');
});

// ---- answer sizes and pages -----------------------------------------------------------------------------------------

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
    return { iterator: () => ({ hasNext: () => at + 1 < keys.length, next: () => { at++; const key = keys[at]; return { getKey: () => key, getValue: () => map.get(key) }; }, remove: () => map.delete(keys[at]) }) };
  }
}

function pages() {
  const ctx = { C8O: { mcpAuth: { authenticateRequest: () => ({ authenticated: true, kind: 'nocode', user: 'testuser' }) } } };
  vm.createContext(ctx);
  vm.runInContext(read('js/mcp_answer_pages.js'), ctx);
  const api = ctx.C8O.mcpAnswerPages;
  api.host = { now: () => 1_000_000, randomId: () => crypto.randomBytes(16).toString('hex'), digest: v => sha(v), newMap: () => new FakeMap(), locked: (_, task) => task(), warn() {}, info() {} };
  const values = {};
  const store = { get: key => (key in values ? values[key] : null), set: (key, value) => { values[key] = value; } };
  const context = { server: store, httpServletRequest: { getHeader: name => (name === 'Authorization' ? 'Bearer token-of-testuser' : null) } };
  return { api, context };
}

test('one file answers within a page; the whole skill comes in answer pages that give it back whole', () => {
  const { api, context } = pages();
  for (const name of ['SKILL.md', ...DRAWERS]) {
    const one = install({ file: name });
    const size = JSON.stringify(one, null, 2).length;
    if (name !== 'SKILL.md') {
      assert.ok(size < api.BUDGET, name + ': ' + size);
      assert.equal(api.bound(context, { sequence: 'tools_skill_install', value: one }), null, name + ' is not paged');
    }
  }
  for (const value of [install({ harness: 'codex' }), install({ file: 'SKILL.md' }), install({ all: true })]) {
    const first = api.bound(context, { sequence: 'tools_skill_install', value });
    assert.ok(first, 'paged');
    const partial = first.structured.partialAnswer;
    assert.equal(partial.tool, 'skill-install');
    let text = partial.text;
    for (let page = 2; page <= partial.pages; page++) text += api.execute(context, { answerId: partial.answerId, page }).partialAnswer.text;
    const back = JSON.parse(text);
    assert.deepEqual(back, plain(api.answerValue(value, '', '', '')), 'the pages joined are the answer');
    const files = back.contents || [{ path: back.path || 'SKILL.md', content: back.content }];
    for (const file of files) assert.equal(sha(file.content), pkg.sha256(file.content), file.path);
  }
  const plan = install({ plan: true });
  assert.ok(JSON.stringify(plan, null, 2).length < api.BUDGET, 'a plan fits one answer: ' + JSON.stringify(plan, null, 2).length);
});

// ---- the resources, the server instructions, the stale notice and the wiring -----------------------------------------

function resources() {
  const ctx = {
    C8O: { MCP_GUIDANCE_VERSION: VERSION, util: { toTrimmedString: v => (v == null ? '' : String(v).trim()) } },
    c8oReadCatalogFile: readCatalog,
    c8oLoadCatalogIndex: (folder, name, options) => JSON.parse(readCatalog(folder, name)).map(entry => options.normalize(entry))
  };
  ctx.include = () => { throw new Error('no include in the tests'); };
  vm.createContext(ctx);
  vm.runInContext(strip(read('js/catalog_loader.js')).replace(/function c8oLoadCatalogIndex[\s\S]*?\n}\n/, ''), ctx, { filename: 'catalog_loader.js' });
  // its own file read is the engine's (Packages): the repository's here
  ctx.c8oReadCatalogFile = readCatalog;
  vm.runInContext(strip(read('js/skill_package.js')), ctx, { filename: 'skill_package.js' });
  ctx.C8O.skillPackage.host.mcpUrl = () => ENDPOINT;
  vm.runInContext(strip(read('js/resources.js')), ctx, { filename: 'resources.js' });
  return ctx;
}

test('the skill is served as resources: SKILL.md for any client and one URI per drawer, listed and readable', () => {
  const ctx = resources();
  const index = ctx.c8oLoadResourcesIndex();
  const skillUris = index.filter(e => /^convertigo:\/\/skills\//.test(e.uri)).map(e => e.uri);
  assert.deepEqual(skillUris, ['convertigo://skills/convertigo-nocode', ...DRAWERS.map(d => 'convertigo://skills/convertigo-nocode/' + d)]);
  const main = ctx.c8oReadResourceFile(ctx.c8oFindResourceByUri('convertigo://skills/convertigo-nocode'));
  assert.equal(main, install({ harness: 'generic', file: 'SKILL.md' }).content, 'the resource is the generic SKILL.md of skill-install');
  assert.match(main, new RegExp('Skill guidance version: `' + VERSION.replace(/\./g, '\\.') + '`'));
  assert.equal(ctx.c8oReadResourceFile(ctx.c8oFindResourceByUri('convertigo://skills/convertigo-nocode/SKILL.md')), main, 'its alias');
  for (const name of DRAWERS) {
    assert.equal(ctx.c8oReadResourceFile(ctx.c8oFindResourceByUri('convertigo://skills/convertigo-nocode/' + name)), read('resources/convertigo-nocode/' + name), name);
  }
  assert.equal(ctx.c8oFindResourceByUri('convertigo://skills/convertigo-nocode/../SKILL.md'), null);
  const capabilities = ctx.c8oReadResourceFile(ctx.c8oFindResourceByUri('convertigo://capabilities'));
  assert.match(capabilities, /convertigo:\/\/skills\/convertigo-nocode/);
  assert.match(capabilities, /call `skill-install` before any No Code change/);
});

test('the server instructions bootstrap the skill: short, the version, skill-install, and the rules that hold before it', () => {
  const ctx = { C8O: {} };
  vm.createContext(ctx);
  vm.runInContext(read('js/server_instructions.js'), ctx);
  const nocode = ctx.C8O.serverInstructions.text('nocode', VERSION);
  const studio = ctx.C8O.serverInstructions.text('managed', VERSION);
  for (const text of [nocode, studio]) {
    assert.ok(text.includes('`' + VERSION + '`'));
    assert.match(text, /call `skill-install`/);
  }
  assert.match(nocode, /if the skill `convertigo-nocode` is not installed/);
  assert.match(nocode, /use only the nocode-\* tools/);
  assert.match(nocode, /never ask for, print or store the bearer token/);
  assert.ok(studio.startsWith('Use Convertigo MCP tools to inspect and manage the engine.'), 'the Studio sentence stays first');
  assert.equal(ctx.C8O.serverInstructions.text('', VERSION), studio);
  assert.ok(nocode.length < 1000, 'No Code instructions: ' + nocode.length);
  assert.ok(studio.length < 500, 'Studio instructions: ' + studio.length);
  console.log('server instructions: No Code ' + nocode.length + ' characters, Studio ' + studio.length + ' (was 58)');
  // wired: initialize gets the kind of the token and answers the text
  const initialize = read('_c8oProject/sequences/mcp_initialize.yaml');
  assert.match(initialize, /include\("js\/server_instructions\.js"\)/);
  assert.match(initialize, /C8O\.serverInstructions\.text\(typeof authKind === "undefined"/);
  assert.match(initialize, /^↓authKind \[variables\.RequestableVariable-\d+\]: $/m);
  const router = read('js/mcp_endpoint_router.js');
  assert.match(router, /callSequence = "mcp_initialize";[\s\S]{0,300}authKind: typeof mcpAuthentication/);
  assert.match(router, /targetSequence === "tools_skill_install"\) \{\s*callVariables\.authKind = /);
});

test('the stale notice and the No Code write tools point to skill-install; the tool is shared, read-only and declared', () => {
  const g = { C8O: { MCP_GUIDANCE_VERSION: VERSION }, include() {} };
  vm.createContext(g);
  vm.runInContext(read('js/guidance_version.js'), g);
  const values = {};
  const store = { get: k => values[k], set: (k, v) => { values[k] = v; } };
  const map = () => { const m = new Map(); return { size: () => m.size, clear: () => m.clear(), putIfAbsent: (k, v) => (m.has(k) ? m.get(k) : (m.set(k, v), null)) }; };
  const notice = g.C8O.guidance.noCodeSkillNotice('nocode-form-edit', { _meta: { convertigoGuidanceVersion: OLD } }, '', {}, store, 's', map);
  assert.match(notice, /call skill-install \(harness, installedVersion\) and apply the SKILL\.md it answers now/);
  assert.match(notice, /convertigo:\/\/skills\/convertigo-nocode\/<file>/);
  assert.ok(g.C8O.guidance.fingerprintSources().includes('js/skill_package.js'), 'the rendering is in the guidance fingerprint');

  const notes = { C8O: {} };
  vm.createContext(notes);
  vm.runInContext(read('js/tool_description_notes.js'), notes);
  const design = notes.C8O.noCodeDesignNote;
  const tools = ['tools_nocode_form_create', 'tools_nocode_form_edit', 'tools_nocode_form_update', 'tools_nocode_app_create'];
  for (const tool of tools) assert.equal(notes.C8O.toolDescriptionNotes[tool], design, tool);
  for (const rule of [/linked Baserow table shown by a list/, /one flow per copy/, /named flow that does the work/, /sections/, /validation before reporting/, /call skill-install first/]) {
    assert.match(design, rule);
  }
  assert.ok(Object.keys(notes.C8O.toolDescriptionNotes).every(key => /^tools_/.test(key)));
  const added = tools.length * (design.length + 1);
  assert.ok(added < 2000, 'tools/list overhead of the design rules: ' + added);
  const sequence = read('_c8oProject/sequences/tools_skill_install.yaml');
  const comment = /comment: \|\n  ([^\n]+)\n  ([^\n]+)\n/.exec(sequence);
  console.log('tools/list: design rules +' + added + ' characters (' + design.length + ' x ' + tools.length + '); skill-install title+description ' + (comment[1].length + comment[2].length));

  const policy = { C8O: {} };
  vm.createContext(policy);
  vm.runInContext(read('js/nocode_tool_policy.js'), policy);
  assert.ok(policy.C8O.nocodeToolPolicy.shared('tools_skill_install'));
  assert.ok(policy.C8O.nocodeToolPolicy.sharedToolName('skill-install'));
  assert.ok(policy.C8O.nocodeToolPolicy.allows('tools_skill_install'));
  assert.match(read('js/studio_write_confirm.js'), /tools_skill_install: true/);
  assert.match(read('c8oProject.yaml'), /↓tools_skill_install \[sequences\.GenericSequence\]: 🗏 sequences\/tools_skill_install\.yaml/);
  const schemas = read('js/schema_overrides.js');
  assert.match(schemas, /if \(seq === "tools_skill_install"\) \{\s*return skillInstallInputSchema\(\);/);
  assert.match(schemas, /if \(seq === "tools_skill_install"\) \{\s*return skillInstallOutputSchema\(\);/);
  assert.match(read('resources/convertigo-nocode/SKILL.md'), /^- `skill-install`, for this skill \(see Skill freshness\)$/m);
});

// java.io.File, java.nio.file.Files and java.lang.String over the real disk, for the setup scripts.
function loadSetups() {
  class File {
    constructor(parent, child) {
      const base = parent instanceof File ? parent.p : String(parent);
      this.p = child === undefined ? base : path.join(base, String(child));
    }
    getCanonicalFile() { return new File(path.resolve(this.p)); }
    getAbsolutePath() { return path.resolve(this.p); }
    exists() { return fs.existsSync(this.p); }
    isFile() { return fs.existsSync(this.p) && fs.statSync(this.p).isFile(); }
    isDirectory() { return fs.existsSync(this.p) && fs.statSync(this.p).isDirectory(); }
    getName() { return path.basename(this.p); }
    getParentFile() { return new File(path.dirname(this.p)); }
    listFiles() { return this.isDirectory() ? fs.readdirSync(this.p).map(name => new File(this, name)) : null; }
    delete() { fs.rmSync(this.p); return true; }
    toPath() { return this.p; }
  }
  function JavaString(value) {
    const text = new String(Buffer.isBuffer(value) ? value.toString('utf8') : String(value));
    text.getBytes = () => Buffer.from(String(text), 'utf8');
    return text;
  }
  const Files = { readAllBytes: p => fs.readFileSync(p), write: (p, bytes) => fs.writeFileSync(p, bytes), createDirectories: p => fs.mkdirSync(p, { recursive: true }) };
  const java = { io: { File }, nio: { file: { Files, StandardOpenOption: {} }, charset: { StandardCharsets: { UTF_8: 'UTF-8' } } },
    lang: { String: JavaString, System: { getProperty: () => os.homedir(), getenv: () => null } } };
  const context = {
    java, Packages: { java },
    C8O: {
      MCP_GUIDANCE_VERSION: VERSION,
      util: { toBoolean: (value, fallback) => (value === undefined || value === '' ? fallback : value === true || String(value) === 'true'), mcpNoLogEnabled: () => true },
      setupCommon: { buildSkillMarkdown: harness => '---\nname: convertigo-generalist\n---\n' + harness + '\n' },
      setupCodex: { autoRun: false }
    },
    c8oReadCatalogFile: (folder, file) => new java.lang.String(fs.readFileSync(path.join(root, folder, file)))
  };
  vm.createContext(context);
  vm.runInContext(strip(read('js/setup_codex.js')), context, { filename: 'setup_codex.js' });
  vm.runInContext(strip(read('js/setup_claude.js')).replace(/\nvar setupClaudeResult = [\s\S]*$/, '\n'), context, { filename: 'setup_claude.js' });
  return {
    codex: home => context.C8O.setupCodex.run({ codexHome: home, mcpUrl: ENDPOINT }),
    claude: home => context.C8O.setupClaude.run({ claudeHome: home, mcpUrl: ENDPOINT, configureMcp: false })
  };
}
