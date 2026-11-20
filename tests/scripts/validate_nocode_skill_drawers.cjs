// The No Code skill in a summary and drawers. Vibe 3.1 saves any tool answer over about 16,000 characters to a file and
// shows the model its first and last 4,000 or so: a No Code agent read 8 KB of the 68 KB single-file skill. A No Code
// agent has no MCP resource read (nocode-* tools only), so the drawers are files next to SKILL.md, which names them.
// node --test tests/scripts/validate_nocode_skill_drawers.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { folder, drawerLines, drawerBody, readSkillFile, skillText } = require('../helpers/nocode_skill.cjs');

const root = path.resolve(__dirname, '../..');
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const summary = readSkillFile('SKILL.md');
const pointers = drawerLines(summary);
// What an installed file may hold: SKILL.md comes whole through Vibe's skill tool, a drawer through a file read (the
// guide drawers' budget, room left for the envelope of the read).
const SKILL_BUDGET = 15000;
const DRAWER_BUDGET = 12000;

// The single-file skill of 0.3.0-beta.31 (2386606), 68,347 characters. The split moved its text unchanged.
// A later change of the skill text changes this fingerprint on purpose: update it in the same commit, after checking
// that the drawers still put back in place give the whole text, each part once.
// Then one line on the attachments, read with nocode-attachment-read.
// Then the Long answers section (partialAnswer, answer-page, remaining).
// Then the Maps section of sources.md and its line on hand-written references (17/11).
// Then the line of errors.md on answers with repairs (19/11).
// Then fewer agent steps (19/11): the tool order (a questionnaire is no data application, no read after a create or an
// edit), the long answers joined in the script (whole() in workflow-new.md), the contract in one call, the exact tool
// arguments, the preview of applications only, and the No Code database that cannot be reached.
// Then the turn after a new data application (20/11): the tables the turn context names are used by id with no catalog
// search, the catalog filtered by name, and the rows an apply answers as the proof of the write (sources.md).
const SKILL_TEXT_SHA256 = '96c0d94041ab65896798de3d1d06419232b9888836d5c2596f9e1a3e98b22d0b';

test('SKILL.md names each drawer once, and each drawer file of its folder is named', () => {
  const named = pointers.map(p => p.file);
  assert.ok(named.length >= 8, 'the skill is split');
  assert.equal(new Set(named).size, named.length, 'a drawer named twice');
  const files = fs.readdirSync(folder).filter(name => name !== 'SKILL.md');
  assert.deepEqual(files.sort(), [...named].sort());
  for (const name of files) assert.match(name, /^[a-z0-9][a-z0-9-]*\.md$/);
});

test('the drawers put back in place give the text of the single-file skill, each part once', () => {
  const text = skillText();
  assert.equal(sha(text), SKILL_TEXT_SHA256, 'the reassembled skill changed: see SKILL_TEXT_SHA256');
  // Each body comes back once: a sentence kept in SKILL.md and repeated in a drawer would appear twice above.
  for (const { file } of pointers) {
    const body = drawerBody(readSkillFile(file)).replace(/\n$/, '');
    assert.ok(body.length > 200, file);
    assert.equal(text.split(body).length, 2, file + ' once');
    assert.ok(!summary.includes(body.split('\n').find(line => line.length > 60)), file + ' is not also in SKILL.md');
  }
});

test('the Drawers section and the drawer lines are new text, never a copy of the skill', () => {
  const lines = summary.split('\n');
  const start = lines.indexOf('## Drawers');
  const end = lines.findIndex((line, i) => i > start && /^## /.test(line));
  const added = lines.slice(start, end).concat(pointers.map(p => p.line)).join(' ');
  const text = skillText();
  for (const sentence of added.split(/(?<=\.) /).filter(s => s.length > 40)) {
    assert.ok(!text.includes(sentence), sentence);
  }
});

test('each drawer opens with its title, when to read it and the way back to SKILL.md', () => {
  for (const { file, title, when } of pointers) {
    const [heading, blank, reading, blank2, rule, blank3] = readSkillFile(file).split('\n');
    assert.equal(heading, '# ' + title, file);
    assert.equal(reading, when[0].toUpperCase() + when.slice(1) + '. Summary: `SKILL.md`, in this folder.', file);
    assert.deepEqual([blank, blank2, rule, blank3], ['', '', '---', ''], file);
    assert.equal((readSkillFile(file).match(/^```/gm) || []).length % 2, 0, 'Split code fence in ' + file);
  }
});

test('SKILL.md keeps the rules of every turn and says how to read a drawer before naming one', () => {
  const head = summary.slice(0, summary.indexOf('> Drawer '));
  assert.ok(head.indexOf('## Drawers') < head.indexOf('## Skill freshness'));
  for (const rule of [/next to this `SKILL\.md`, in the skill's base directory/, /also where no other file may be read/,
    /never guess what it says/, /one `nocode-app-create` call/, /`nocode-form-contract-get` once per conversation/,
    /read with `nocode-form-get` before any proposal or change/, /after `nocode-form-list` when it is named without its id/]) {
    assert.match(head, rule);
  }
  for (const rule of [/^- Skill guidance version: `[^`]+`\.$/m, /^- Expected MCP endpoint: `[^`]+`\.$/m, /^## Hard Tool Boundary$/m,
    /Do not ask the user to copy or paste a token/, /runs only on the user's explicit request/, /Never publish on your own initiative/,
    /"Confirmer avant de modifier"/, /`awaiting_confirmation`/, /Forbidden Convertigo MCP tools include/, /log-view/,
    /say exactly which no-code limitation blocks it/, /^## Refusal Pattern$/m, /Do not call the forbidden tool first\./]) {
    assert.match(summary, rule);
  }
});

// java.io.File, java.nio.file.Files and java.lang.String over the real disk, for the setup scripts.
function javaOverDisk() {
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
  const Files = {
    readAllBytes: p => fs.readFileSync(p),
    write: (p, bytes) => fs.writeFileSync(p, bytes),
    createDirectories: p => fs.mkdirSync(p, { recursive: true })
  };
  const java = { io: { File }, nio: { file: { Files, StandardOpenOption: {} }, charset: { StandardCharsets: { UTF_8: 'UTF-8' } } },
    lang: { String: JavaString, System: { getProperty: () => os.homedir(), getenv: () => null } } };
  return { java, Packages: { java } };
}

const LONG_ENDPOINT = 'https://nocode.example.test/convertigo/api/mcp?jsonOnly=true&from_bridge=true&descriptorVersion=2026-09-18.skill-layers.0123456789abcdef&toolsRevision=0123456789abcdef';

// The two setup sequences that install the skill, as the engine runs them, reading the catalog from `resources` (the repository's by default).
function loadSetups(resources = path.join(root, 'resources')) {
  const { java, Packages } = javaOverDisk();
  const context = {
    java, Packages,
    C8O: {
      MCP_GUIDANCE_VERSION: '2026-09-18.skill-layers.0123456789abcdef',
      util: { toBoolean: (value, fallback) => (value === undefined || value === '' ? fallback : value === true || String(value) === 'true'), mcpNoLogEnabled: () => true },
      setupCommon: { buildSkillMarkdown: harness => '---\nname: convertigo-generalist\n---\n' + harness + '\n' },
      setupCodex: { autoRun: false }
    },
    c8oReadCatalogFile: (folderName, file) => {
      assert.equal(folderName, 'resources');
      const target = path.join(resources, file);
      if (!fs.existsSync(target)) throw new Error('Catalog file not found: ' + target);
      return new java.lang.String(fs.readFileSync(target));
    }
  };
  vm.createContext(context);
  const strip = source => source.replace(/^include\([^\n]+\);\s*$/gm, '');
  vm.runInContext(strip(fs.readFileSync(path.join(root, 'js/setup_codex.js'), 'utf8')), context, { filename: 'setup_codex.js' });
  vm.runInContext(strip(fs.readFileSync(path.join(root, 'js/setup_claude.js'), 'utf8')).replace(/\nvar setupClaudeResult = [\s\S]*$/, '\n'), context, { filename: 'setup_claude.js' });
  return {
    codex: (home, extra) => JSON.parse(JSON.stringify(context.C8O.setupCodex.run(Object.assign({ codexHome: home, mcpUrl: LONG_ENDPOINT }, extra)))),
    claude: (home, extra) => JSON.parse(JSON.stringify(context.C8O.setupClaude.run(Object.assign({ claudeHome: home, mcpUrl: LONG_ENDPOINT, configureMcp: false }, extra))))
  };
}

function withTemp(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nocode-drawers-'));
  try {
    return run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('the setups install SKILL.md and every drawer, each within its budget', () => {
  withTemp(dir => {
    const setups = loadSetups();
    for (const [harness, setup] of Object.entries(setups)) {
      const home = path.join(dir, harness);
      const result = setup(home);
      const skillDir = path.join(home, 'skills/convertigo-nocode');
      assert.equal(result.skills.nocode.status, 'created', harness);
      assert.equal(result.skills.nocode.path, path.join(skillDir, 'SKILL.md'));
      assert.deepEqual(result.skills.nocode.drawers.map(d => d.file), pointers.map(p => p.file), harness);
      assert.deepEqual(result.skills.nocode.removedDrawers, []);
      assert.deepEqual(fs.readdirSync(skillDir).sort(), fs.readdirSync(folder).sort(), harness);
      const installed = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
      assert.match(installed, /^- Skill guidance version: `2026-09-18\.skill-layers\.0123456789abcdef`\.$/m);
      assert.ok(installed.includes('- Expected MCP endpoint: `' + LONG_ENDPOINT + '`.'), harness);
      assert.match(installed, harness === 'claude' ? /rerun `_setupClaude`/ : /rerun `_setupCodex`/);
      assert.ok(installed.length < SKILL_BUDGET, harness + ' SKILL.md: ' + installed.length);
      for (const { file } of pointers) {
        const drawer = fs.readFileSync(path.join(skillDir, file), 'utf8');
        assert.equal(drawer, readSkillFile(file), harness + ' ' + file);
        assert.ok(drawer.length < DRAWER_BUDGET, harness + ' ' + file + ': ' + drawer.length);
      }
      // the setup answer names the files, it never carries them
      assert.ok(JSON.stringify(result).length < 4000, harness + ' answer: ' + JSON.stringify(result).length);
      assert.equal(setup(home).skills.nocode.status, 'unchanged', harness + ' a second run');
    }
  });
});

test('an install removes the drawers an older install left, and keeps the other files of the folder', () => {
  withTemp(dir => {
    const setups = loadSetups();
    for (const [harness, setup] of Object.entries(setups)) {
      const skillDir = path.join(dir, harness, 'skills/convertigo-nocode');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'old-drawer.md'), '# Old drawer\n');
      fs.writeFileSync(path.join(skillDir, 'notes.txt'), 'kept\n');
      const dry = setup(path.join(dir, harness), { dryRun: true });
      assert.deepEqual(dry.skills.nocode.removedDrawers, ['old-drawer.md'], harness + ' dry run');
      assert.deepEqual(fs.readdirSync(skillDir).sort(), ['notes.txt', 'old-drawer.md'], harness + ' a dry run writes nothing');
      const result = setup(path.join(dir, harness));
      assert.deepEqual(result.skills.nocode.removedDrawers, ['old-drawer.md'], harness);
      assert.ok(!fs.existsSync(path.join(skillDir, 'old-drawer.md')), harness);
      assert.ok(fs.existsSync(path.join(skillDir, 'notes.txt')), harness);
      // a drawer that changed is rewritten, and the skill reported updated
      fs.writeFileSync(path.join(skillDir, pointers[0].file), 'stale\n');
      assert.equal(setup(path.join(dir, harness)).skills.nocode.status, 'updated', harness);
      assert.equal(fs.readFileSync(path.join(skillDir, pointers[0].file), 'utf8'), readSkillFile(pointers[0].file));
    }
  });
});

test('a single-file skill leaves no drawer behind, and a missing drawer is a warning, not a failed setup', () => {
  withTemp(dir => {
    const resources = path.join(dir, 'resources/convertigo-nocode');
    fs.mkdirSync(resources, { recursive: true });
    fs.writeFileSync(path.join(resources, 'SKILL.md'), skillText());
    const home = path.join(dir, 'home');
    fs.mkdirSync(path.join(home, 'skills/convertigo-nocode'), { recursive: true });
    for (const { file } of pointers) fs.writeFileSync(path.join(home, 'skills/convertigo-nocode', file), 'from a newer install\n');
    const single = loadSetups(path.join(dir, 'resources')).codex(home);
    assert.deepEqual(single.skills.nocode.drawers, []);
    assert.deepEqual(single.skills.nocode.removedDrawers.sort(), pointers.map(p => p.file).sort());
    assert.deepEqual(fs.readdirSync(path.join(home, 'skills/convertigo-nocode')), ['SKILL.md']);

    fs.writeFileSync(path.join(resources, 'SKILL.md'), summary);
    for (const { file } of pointers.slice(1)) fs.copyFileSync(path.join(folder, file), path.join(resources, file));
    const partial = loadSetups(path.join(dir, 'resources')).codex(home);
    assert.deepEqual(partial.skills.nocode.drawers.map(d => d.file), pointers.slice(1).map(p => p.file));
    assert.ok(partial.warnings.some(w => w.startsWith('No Code skill drawer not installed: ' + pointers[0].file)), partial.warnings.join('\n'));
  });
});
