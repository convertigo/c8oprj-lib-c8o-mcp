// The guides were split into summaries and drawers in 0.3.0-beta.31; their 29 former URIs stayed in resources/list as
// stubs ("This guide now uses short drawers. Read <summary>"), so a listed page was a redirect and an existing client
// paid one more read. A former URI (aliasOf in resources_index.json) is now never listed and answers its summary.
// node --test tests/scripts/validate_legacy_guide_uris.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { read, resources } = require('../helpers/guide_transport.cjs');

const index = JSON.parse(read('resources/resources_index.json'));
const byUri = Object.fromEntries(index.map((e) => [e.uri, e]));
const formers = index.filter((e) => e.aliasOf);

function editProfile(header) {
  const sandbox = { C8O: { util: { toTrimmedString: (v) => String(v || '').trim() } }, include() {}, context: { httpServletRequest: { getHeader: (n) => header[n] || null } },
    Packages: new Proxy(function () {}, { get: () => Packages, apply: () => null, construct: () => ({}) }) };
  var Packages = sandbox.Packages;
  vm.createContext(sandbox);
  vm.runInContext(read('js/edit_profile.js'), sandbox);
  return sandbox.C8O.editProfile;
}

test('the 29 former guide URIs point at a listed summary', () => {
  assert.equal(formers.length, 29);
  for (const e of formers) {
    const target = byUri[e.aliasOf];
    assert.ok(target, e.uri + ' -> ' + e.aliasOf);
    assert.ok(!target.aliasOf, e.aliasOf + ' is no alias itself');
    assert.match(e.aliasOf, /^convertigo:\/\/guides\/[a-z-]+$/);
  }
});

test('resources/list never shows a former URI, in any edit profile', () => {
  const policy = editProfile({});
  for (const e of formers) {
    assert.equal(policy.listsResource(e, ''), false, e.uri);
    assert.equal(policy.listsResource(e, 'yaml'), false, e.uri);
    assert.equal(policy.listsResource(e, 'html'), false, e.uri);
  }
  assert.ok(policy.listsResource(byUri['convertigo://guides/start'], ''));
  assert.match(read('_c8oProject/sequences/mcp_resources_list.yaml'), /C8O\.editProfile\.listsResource\(entry\)/);
});

test('a former URI, and an older alias of it, answer the summary in one read', () => {
  const r = resources();
  for (const e of formers) {
    const found = r.c8oFindResourceByUri(e.uri);
    assert.equal(found.uri, e.aliasOf, e.uri);
    const text = r.c8oReadResourceFile(found);
    assert.doesNotMatch(text, /This guide now uses short drawers/, e.uri);
    assert.ok(text.length < 15000, e.uri + ' ' + text.length);
    for (const alias of e.aliases || []) assert.equal(r.c8oFindResourceByUri(alias).uri, e.aliasOf, alias);
  }
  // upper case and the legacy fixture of existing clients
  assert.equal(r.c8oFindResourceByUri('CONVERTIGO://resources/convertigo-start').uri, 'convertigo://guides/start');
  for (const { uri, aliases } of JSON.parse(read('tests/fixtures/guides/legacy_uris.json'))) {
    for (const u of [uri].concat(aliases || [])) assert.ok(r.c8oFindResourceByUri(u), u);
  }
});

test('the docs, the generic harness and the setups name no former URI', () => {
  const former = new Set(formers.flatMap((e) => [e.uri].concat(e.aliases || [])));
  const files = ['TOOLS.md', 'AGENT.md', 'js/setup_common.js', 'js/setup_vibe.js', 'js/setup_codex.js', 'js/setup_claude.js',
    'knowledge/templates/maintainer_agent.template.md', 'knowledge/templates/maintainer_tools.template.md']
    .concat(fs.readdirSync(path.join(__dirname, '../../prompts')).map((f) => 'prompts/' + f));
  const guides = (dir) => fs.readdirSync(path.join(__dirname, '../..', dir), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? guides(dir + '/' + d.name) : (/\.md$/.test(d.name) ? [dir + '/' + d.name] : []));
  for (const file of files.concat(guides('resources/guides'), ['resources/convertigo_common_skill.md'])) {
    const text = read(file);
    for (const uri of former) assert.ok(!text.includes(uri + '`') && !text.includes(uri + ')') && !new RegExp(uri.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![-\\w])').test(text), file + ': ' + uri);
  }
  assert.match(read('js/setup_common.js'), /!trim\(entry\.aliasOf\)\.length/);
});
