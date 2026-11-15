const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { resources, sizes, read, root, stepExpression } = require('../helpers/guide_transport.cjs');
const path = require('node:path');
const api = resources();
const entries = api.c8oLoadResourcesIndex();
const manifest = JSON.parse(read('resources/guide_drawers.json'));
const resolve = uri => {
  const entry = api.c8oFindResourceByUri(uri);
  assert.ok(entry, 'Unresolved URI: ' + uri);
  return { entry, text: String(api.c8oReadResourceFile(entry)) };
};
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const uris = text => [...text.matchAll(/convertigo:\/\/(?:guides|resources)\/[a-z0-9_/-]+/g)].map(m => m[0]);

test('all served summaries, drawers and guide reads fit every transport budget', () => {
  for (const entry of entries) {
    const text = String(api.c8oReadResourceFile(entry));
    const limit = entry.guidanceLevel === 'summary' ? 6000 : entry.guidanceLevel === 'drawer' ? 12000 : 16000;
    for (const [transport, size] of Object.entries(sizes(entry, text))) {
      assert.ok(size < limit, `${entry.uri} ${transport}=${size}, limit=${limit}`);
    }
    assert.doesNotMatch(text, /\{\{(?:GUIDANCE_VERSION|SETUP_SEQUENCE|TASK_ROUTES)\}\}/, entry.uri);
    assert.equal((text.match(/^```/gm) || []).length % 2, 0, 'Split code fence in ' + entry.uri);
  }
});

test('every summary ends in a drawer index with a distinct opening cue per drawer', () => {
  for (const entry of entries.filter(e => e.guidanceLevel === 'summary')) {
    const text = resolve(entry.uri).text;
    const tail = text.split('## Drawers\n')[1];
    assert.ok(tail, entry.uri);
    const lines = tail.trim().split('\n');
    assert.equal(lines.length, entry.drawerUris.length, entry.uri);
    for (const [i, uri] of entry.drawerUris.entries()) {
      assert.ok(lines[i].includes(uri) && / — .+\./.test(lines[i]), lines[i]);
      assert.equal(resolve(uri).entry.guidanceLevel, 'drawer', uri);
      const parent = resolve(uri).entry.parentUri;
      assert.equal(resolve(parent).entry.guidanceLevel, 'summary', uri);
      if (entry.uri !== 'convertigo://recipes/quickstart') assert.equal(parent, entry.uri, uri);
    }
    assert.equal(new Set(lines.map(line => line.split(' — ')[1])).size, lines.length, 'Repeated opening cue: ' + entry.uri);
  }
});

test('all cited guide URIs resolve, including skills, prompts, routes and runtime hints', () => {
  const paths = ['resources/convertigo_common_skill.md', 'resources/convertigo_task_routes.json',
    'js/setup_common.js', 'js/tool_description_notes.js', 'js/tools_databaseobject_tree_apply.js', 'js/databaseobject.js'];
  for (const file of fs.readdirSync(path.join(root, 'prompts')).filter(f => f.endsWith('.md'))) paths.push('prompts/' + file);
  for (const entry of entries) for (const uri of uris(String(api.c8oReadResourceFile(entry)))) resolve(uri);
  for (const file of paths) for (const uri of uris(read(file))) resolve(uri);
});

test('all former URIs and aliases still answer with a short routing message', () => {
  const before = JSON.parse(read('tests/fixtures/guides/legacy_uris.json'));
  for (const old of before) {
    for (const uri of [old.uri, ...old.aliases]) {
      const result = resolve(uri);
      const cap = result.entry.guidanceLevel === 'redirect' || result.entry.guidanceLevel === 'summary' ? 6000 : 16000;
      assert.ok(sizes(result.entry, result.text).tool < cap, uri);
      if (result.entry.summaryUri) {
        assert.ok(result.text.includes(result.entry.summaryUri));
        assert.equal(resolve(result.entry.summaryUri).entry.guidanceLevel, 'summary');
      }
    }
  }
  assert.equal(api.c8oFindResourceByUri('convertigo://guides/does-not-exist'), null);
});

test('essential rules appear before the drawer index and within 6000 served characters', () => {
  const essentials = {
    start: [/databaseobject-tree-get/, /databaseobject-tree-apply/, /requestable-execute/, /project-save/, /Never edit/, /exact requested project name/, /mobile-builder-build/],
    vibe: [/variables:\{uri:/, /result\.payload\.result\.contents\[0\]\.text/, /concurrently/, /result\.error/, /partial/, /serialized JSON/, /timeoutSec<=45/, /Never edit/],
    ngx: [/Sibling actions run in parallel/, /child of A/, /out\.error/, /LabelPlacement/, /Form SmartSource including priority/, /Never write SmartSource JSON from memory/, /scriptContent marker/, /generated files/],
    'data-page': [/before UI work/, /metadata\/status alone/, /searchQuery in SC mode/, /CallSequenceAction/, /ForEach/, /normal\/empty\/error\/retry/, /project-save/],
    auth: [/server-side session/, /hidden exposure is not access control/, /auth_login accepts any password/, /visibility=15/, /unauthorized refusal/, /logout/],
    'http-app': [/one HTTP provider/, /one evidence-based same-rail repair/, /never silently switch/, /StepVariable/, /application data/],
    crud: [/ngx-page-create per page/, /root:true/, /project-lint/, /browser-verify/, /auth_login/, /mobile-builder-build/],
    'crud-edit': [/ngx-page-create never overwrites/, /Preserve rows/, /Never run init_schema/, /allowDataReset:true/, /ALTER TABLE\/UPDATE/]
  };
  for (const [key, patterns] of Object.entries(essentials)) {
    const { entry, text } = resolve('convertigo://guides/' + key);
    const head = text.split('## Drawers')[0];
    assert.ok(sizes(entry, head).tool < 6000, key);
    for (const rule of patterns) assert.match(head, rule, key);
    if (key === 'crud' || key === 'crud-edit') assert.doesNotMatch(head, /upsert-ngx-crud-kit/);
  }
});

test('concrete SmartSource errors lead directly to the drawer explaining their repair', () => {
  const source = read('js/databaseobject.js');
  const start = source.indexOf('C8O.dbo._expandSmartSourceShorthand = function');
  const end = source.indexOf('\n};', start) + 3;
  const context = { C8O: { dbo: {} } };
  vm.runInNewContext(source.slice(start, end), context);
  assert.throws(() => context.C8O.dbo._expandSmartSourceShorthand({ mode: 'JS', local: '?.items' }), err => {
    const links = uris(err.message);
    assert.deepEqual(links, ['convertigo://guides/ngx/smartsource']);
    assert.match(resolve(links[0]).text, /Never write SmartSource JSON from memory/);
    return true;
  });
  for (const file of ['js/setup_common.js', 'resources/convertigo_common_skill.md', 'js/tool_description_notes.js']) {
    assert.ok(uris(read(file)).includes('convertigo://guides/ngx/smartsource') ||
      uris(read(file)).includes('convertigo://guides/vibe/bindings'), file);
  }
});

test('actual resource LoadResource and requestable compactor preserve each guide without preview truncation', () => {
  const load = stepExpression('_c8oProject/sequences/mcp_resources_read.yaml', 'LoadResource');
  const compactSource = read('_c8oProject/sequences/tools_requestable_execute.yaml');
  const start = compactSource.indexOf('    function _compactPayload(payload)');
  const end = compactSource.indexOf('    requestableExecutionResult =', start);
  assert.ok(start > 0 && end > start);
  for (const entry of entries) {
    const ctx = { ...api, uri: entry.uri, executionPlan: { requestable: 'lib_ConvertigoMCP.mcp_resources_read' } };
    vm.createContext(ctx);
    vm.runInContext(load, ctx);
    assert.equal(ctx.resourceText, resolve(entry.uri).text);
    vm.runInContext(compactSource.slice(start, end), ctx);
    const payload = { result: { contents: [{ uri: entry.uri, mimeType: entry.mimeType, text: ctx.resourceText }] } };
    const compacted = ctx._compactPayload(payload);
    assert.equal(compacted.payload, payload);
    assert.equal(compacted.truncated, false);
    assert.equal(compacted.payloadPreview, undefined);
  }
});

test('drawer content fingerprints stay synchronized with the guidance manifest', () => {
  for (const guide of manifest) {
    for (const drawer of guide.drawers) assert.equal(sha(read('resources/' + drawer.file)), drawer.servedSha256, drawer.uri);
    const summaryFile = resolve(guide.summaryUri).entry.file;
    assert.equal(sha(read('resources/' + summaryFile)), guide.summarySha256, guide.summaryUri);
  }
  for (const entry of entries.filter(e => e.parentUri === 'convertigo://capabilities')) {
    assert.equal(sha(read('resources/' + entry.file)), entry.contentSha256, entry.uri);
  }
});
