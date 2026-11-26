// Run: node --test tests/scripts/validate_nocode_structure_and_skill_version.cjs
// Usage feedback (26/11): an agent built a record with its sub-records as 50 static copies of an 8-component card and
// 50 near-identical « remove » flows (689 components, 463 on one page, seconds to open it in No Code Studio), and nothing
// warned; the No Code skill carried a fixed version, so an installed copy could never be found out of date. These
// checks cover the structure warnings (js/nocode_forms.js) and the guidance version of the No Code skill
// (js/guidance_version.js), on forms built here.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function forms() {
  const empty = new Proxy(function () {}, { get: (_, key) => key === Symbol.toPrimitive ? () => '' : empty });
  const sandbox = { Packages: empty, java: { lang: { String } } };
  vm.createContext(sandbox);
  vm.runInContext(read('js/nocode_forms.js'), sandbox, { filename: 'nocode_forms.js' });
  return sandbox.C8O.nocodeForms;
}
const F = forms();

// A native form: pages of components (a component is [type, name, children]) and flows ([id, step types]).
function nativeForm(pages, flows = []) {
  let id = 1000;
  const form = { _id: 'f', _rev: '1-x', name: 'Test', pages: [], formulaire: [], flows: [] };
  pages.forEach(([pageName, components], p) => {
    const tech = 'Page_' + p;
    form.pages.push({ name: pageName, pageTechName: tech });
    const add = ([type, name, children = []], parent) => {
      const item = { id: ++id, type, name, config: { page: tech }, childrenRefs: [] };
      if (parent) item.parentRef = parent.id;
      form.formulaire.push(item);
      item.childrenRefs = children.map(child => add(child, item).id);
      return item;
    };
    components.forEach(component => add(component, null));
  });
  flows.forEach(([flowId, steps]) => form.flows.push({ id: flowId, name: flowId, elements: steps.map((type, i) => ({ id: ++id, type, name: type + i })) }));
  return form;
}
// the card of a finding: 8 components, its nested names numbered too, as an agent writes them
const card = n => ['layout', 'finding_card_' + n, [
  ['layout', 'finding_head_' + n, [['description', 'finding_title_' + n], ['button', 'remove_finding_' + n]]],
  ['text', 'finding_text_' + n],
  ['layout', 'finding_info_' + n, [['select', 'finding_level_' + n], ['text', 'finding_note_' + n]]]
]];
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

test('static copies of a block and near-identical flows are told with their count and names; nested copies once', () => {
  const form = nativeForm([['Inspections', [['text', 'site'], ...range(1, 12).map(card)]]], [
    ...range(1, 12).map(n => ['remove_finding_' + n, ['business_logic']]),
    ['save_inspection', ['submit', 'toast']]
  ]);
  const found = plain(F.structureWarnings(form));
  const blocks = found.filter(w => w.code === 'repeated_static_block');
  assert.equal(blocks.length, 1, JSON.stringify(found.map(w => w.message)));
  assert.equal(blocks[0].count, 12);
  assert.match(blocks[0].message, /^Page Inspections: 12 static copies of the same block \(finding_card_1, finding_card_2, finding_card_3 … finding_card_12, 8 components each\)\. Repeated data .* linked table/);
  assert.match(blocks[0].message, /card list or a grid filtered on the parent, with an « Add » button that opens a small modal/);
  assert.equal(form.formulaire[Number(blocks[0].path.split('/')[2])].name, 'finding_card_1');
  const flows = found.filter(w => w.code === 'repeated_flow');
  assert.equal(flows.length, 1);
  assert.equal(flows[0].count, 12);
  assert.match(flows[0].message, /^12 near-identical flows \(remove_finding_1, remove_finding_2, remove_finding_3 … remove_finding_12, 1 step each\)/);
  assert.equal(found.filter(w => w.code === 'heavy_page').length, 0, '97 components: not heavy');
});

test('no warning for 3 or 4 similar blocks, a navigation bar of 4 entries, numbered single fields or different shapes', () => {
  const nav = range(0, 3).map(n => ['layout', 'nav_entry_' + n, [['button', 'nav_button_' + n], ['description', 'nav_label_' + n]]]);
  const questions = range(1, 20).map(n => ['radio', 'question_' + n]);
  const mixed = range(1, 10).map(n => n % 2 ? card(n) : ['layout', 'finding_card_' + n, [['text', 'a_' + n], ['text', 'b_' + n]]]);
  const form = nativeForm([
    ['Home', [...nav, ...range(1, 4).map(card)]],
    ['Survey', questions],
    ['Mixed', mixed]
  ], [
    ...range(0, 3).map(n => ['navigation_' + n, ['push_page']]),
    ...range(0, 3).map(n => ['filter_view_' + n, ['set_value', 'refresh_grid']]),
    ...range(1, 9).map(n => ['step_' + n, n % 2 ? ['toast'] : ['push_page']])
  ]);
  assert.deepEqual(plain(F.structureWarnings(form)).map(w => w.code), []);
  // 8 copies is the threshold
  const eight = nativeForm([['P', range(1, 8).map(card)]]);
  assert.deepEqual(plain(F.structureWarnings(eight)).map(w => w.code + ':' + w.count), ['repeated_static_block:8']);
  const seven = nativeForm([['P', range(1, 7).map(card)]]);
  assert.deepEqual(plain(F.structureWarnings(seven)), []);
});

test('a page over the threshold is told its weight, rounded down to 50, with the threshold as a constant', () => {
  assert.equal(F.HEAVY_PAGE_COMPONENTS, 150);
  const heavy = nativeForm([['Big', range(1, 163).map(n => ['text', 'field_' + String.fromCharCode(97 + (n % 26)) + n + 'x'])], ['Small', [['text', 'one']]]]);
  const found = plain(F.structureWarnings(heavy));
  assert.deepEqual(found.map(w => w.code), ['heavy_page']);
  assert.equal(found[0].count, 163);
  assert.equal(found[0].path, '/pages/0');
  assert.match(found[0].message, /^Page Big holds more than 150 components \(over 150\): No Code Studio needs seconds to open it/);
  assert.deepEqual(plain(F.structureWarnings(nativeForm([['Ok', range(1, 150).map(n => ['text', 'f' + n + 'x'])]]))), []);
});

// ---- the guidance version of the No Code skill --------------------------------------------------------------------

// js/guidance_version.js as the Agent Bridge runs it (agent_bridge_common.js evaluateMcpGuidanceVersion): a Function of
// C8O, include and the catalog reads of a project folder, nothing else.
function bridgeVersion(files = {}) {
  const text = read('js/guidance_version.js');
  const readCatalog = (folder, name) => {
    const relative = folder + '/' + name;
    if (Object.prototype.hasOwnProperty.call(files, relative)) return files[relative];
    const file = path.join(root, relative);
    if (!fs.existsSync(file)) throw new Error('Catalog file not found: ' + relative);
    return fs.readFileSync(file, 'utf8');
  };
  const evaluator = new Function('C8O', 'include', 'c8oResolveCatalogDirectory', 'c8oReadCatalogFile', text + '\nreturn C8O.MCP_GUIDANCE_VERSION;');
  return evaluator({}, () => {}, folder => path.join(root, folder), readCatalog);
}

test('the guidance version is the fingerprint of the No Code skill and of every drawer it names, as the Agent Bridge reads it', () => {
  const skill = read('resources/convertigo-nocode/SKILL.md');
  assert.match(skill, /^- Skill guidance version: `\{\{GUIDANCE_VERSION\}\}`\.$/m, 'no fixed version in the skill file');
  const base = bridgeVersion();
  assert.match(base, /^2026-09-18\.skill-layers\.[0-9a-f]{16}$/);
  assert.notEqual(bridgeVersion({ 'resources/convertigo-nocode/SKILL.md': skill + '\nOne more rule.\n' }), base, 'SKILL.md is in the fingerprint');
  const drawer = 'resources/convertigo-nocode/generation-quality.md';
  assert.notEqual(bridgeVersion({ [drawer]: read(drawer) + '\nOne more rule.\n' }), base, 'a drawer is in the fingerprint');
  const sandbox = { C8O: {}, include() {} };
  vm.createContext(sandbox);
  vm.runInContext(read('js/guidance_version.js'), sandbox);
  assert.deepEqual(plain(sandbox.C8O.guidance.noCodeDrawerNames(skill)).sort(), fs.readdirSync(path.join(root, 'resources/convertigo-nocode')).filter(name => name !== 'SKILL.md').sort(),
    'every drawer file of the folder is named by SKILL.md, so every one is fingerprinted');
});

function guidance(version) {
  const sandbox = { C8O: { MCP_GUIDANCE_VERSION: version }, include() {} };
  vm.createContext(sandbox);
  vm.runInContext(read('js/guidance_version.js'), sandbox);
  return sandbox.C8O.guidance;
}
function serverStore() {
  const values = {};
  return { get: key => values[key], set: (key, value) => { values[key] = value; } };
}
function newMap() {
  const map = new Map();
  return { size: () => map.size, clear: () => map.clear(), putIfAbsent: (key, value) => { if (map.has(key)) return map.get(key); map.set(key, value); return null; } };
}

test('an out-of-date installed No Code skill is told once per session, on a No Code write, when the client sends its version', () => {
  const g = guidance('2026-09-18.skill-layers.aaaaaaaaaaaaaaaa');
  const store = serverStore();
  const call = (tool, version, session = 'conversation:one') => g.noCodeSkillNotice(tool, version ? { _meta: { convertigoGuidanceVersion: version } } : {}, '', {}, store, session, newMap);
  const old = '2026-09-18.skill-layers.bbbbbbbbbbbbbbbb';
  assert.equal(call('nocode-form-get', old), '', 'a read says nothing');
  const first = call('nocode-form-edit', old);
  assert.match(first, /^convertigo_nocode_skill_outdated: the installed Convertigo No Code skill is out of date \(installed 2026-09-18\.skill-layers\.b+, this MCP serves 2026-09-18\.skill-layers\.a+\)\. Before the next change, call skill-install \(harness, installedVersion\) and apply the SKILL\.md it answers now, then write its files for the next sessions; its drawers are also the resources convertigo:\/\/skills\/convertigo-nocode\/<file>\./);
  assert.equal(call('nocode-form-edit', old), '', 'once per session');
  assert.equal(call('nocode_baserow_rows_delete', old), '', 'the same session, another write');
  assert.match(call('nocode-form-create', old, 'conversation:two'), /out of date/, 'another session is told');
  assert.equal(call('nocode-form-edit', '2026-09-18.skill-layers.aaaaaaaaaaaaaaaa', 'conversation:three'), '', 'the same version');
  assert.equal(call('nocode-form-edit', '', 'conversation:four'), '', 'a client that sends no version is not told');
  assert.equal(call('databaseobject-tree-apply', old), null, 'not a No Code tool: the guarded warning stays');
  const router = read('js/mcp_endpoint_router.js');
  assert.match(router, /C8O\.guidance\.noCodeSkillNotice\(/);
});

test('the installed No Code skill carries the version of the MCP, for Codex and Claude Code', () => {
  const sandbox = { C8O: { MCP_GUIDANCE_VERSION: '2026-09-18.skill-layers.0123456789abcdef' }, include() {} };
  sandbox.c8oReadCatalogFile = (folder, name) => read(folder + '/' + name);
  vm.createContext(sandbox);
  const source = read('js/setup_codex.js');
  const start = source.indexOf('  function buildNoCodeSkillMarkdown(mcpUrl) {');
  const end = source.indexOf('\n  }\n', start) + 4;
  vm.runInContext('function trim(v) { return v == null ? "" : String(v).trim(); }\n' + source.slice(start, end), sandbox);
  const installed = vm.runInContext('buildNoCodeSkillMarkdown("https://example.invalid/convertigo/api/mcp")', sandbox);
  assert.match(installed, /^- Skill guidance version: `2026-09-18\.skill-layers\.0123456789abcdef`\.$/m);
  assert.ok(!installed.includes('{{GUIDANCE_VERSION}}'));
});
