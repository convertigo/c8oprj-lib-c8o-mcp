const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// Guides are served straight from this index on every request and nothing checks it at
// runtime, so a missing file or a dangling route only fails when an agent reads it.
const index = JSON.parse(read('resources/resources_index.json'));
const routes = JSON.parse(read('resources/convertigo_task_routes.json'));
const prompts = JSON.parse(read('prompts/prompts_index.json'));
const BUILT_IN_URIS = ['convertigo://capabilities', 'convertigo://recipes/quickstart'];
const HARNESS_MARKERS = [/Convertigo_[a-z]/, /mcp__convertigo__/, /~\/\.codex/, /~\/\.vibe/, /CLAUDE_CONFIG_DIR/];

test('every indexed resource has a file and a unique uri and guideId', () => {
  const uris = new Set();
  const guideIds = new Set();
  for (const entry of index) {
    assert.ok(fs.existsSync(path.join(root, 'resources', entry.file)), entry.file + ' is missing');
    assert.ok(!uris.has(entry.uri), 'duplicate uri ' + entry.uri);
    uris.add(entry.uri);
    if (entry.guideId) {
      assert.ok(!guideIds.has(entry.guideId), 'duplicate guideId ' + entry.guideId);
      guideIds.add(entry.guideId);
    }
  }
});

test('task routes only reference indexed guides and end with unknown', () => {
  const uris = new Set(index.map(entry => entry.uri).concat(BUILT_IN_URIS));
  const ids = new Set();
  for (const route of routes.routes) {
    assert.ok(route.id && route.match && route.required, JSON.stringify(route));
    assert.ok(!ids.has(route.id), 'duplicate route ' + route.id);
    ids.add(route.id);
    for (const uri of route.required.concat(route.fallback || [])) {
      assert.ok(uris.has(uri), route.id + ' references unknown ' + uri);
    }
  }
  assert.equal(routes.routes[routes.routes.length - 1].id, 'unknown');
});

test('prompt guideIds and guide promptNames resolve', () => {
  const guideIds = new Set(index.map(entry => entry.guideId).filter(Boolean));
  const promptNames = new Set(prompts.map(prompt => prompt.name));
  for (const prompt of prompts) {
    for (const ref of prompt.guideIds || []) {
      assert.ok(guideIds.has(ref.replace(/@\d+$/, '')), prompt.name + ' references unknown guide ' + ref);
    }
  }
  for (const entry of index) {
    for (const name of entry.promptNames || []) {
      assert.ok(promptNames.has(name), entry.guideId + ' references unknown prompt ' + name);
    }
  }
});

test('the authentication guide is routed, linked and harness-neutral', () => {
  const entry = index.find(item => item.guideId === 'convertigo/authentication');
  assert.ok(entry, 'authentication guide must be indexed');
  const route = routes.routes.find(item => item.id === 'authentication');
  assert.deepEqual(route.required, [entry.uri]);
  const guide = read('resources/' + entry.file);
  for (const marker of HARNESS_MARKERS) {
    assert.doesNotMatch(guide, marker, 'guide must use plain MCP tool ids');
  }
  for (const tool of entry.recommendedTools) {
    assert.match(read('js/setup_vibe.js'), new RegExp('"Convertigo_' + tool + '"'), tool + ' must be allowed in Vibe');
  }
  assert.match(read('resources/convertigo_common_skill.md'), /^## Authentication route$/m);
});

test('field-learned rules stay in the guidance', () => {
  const common = read('resources/convertigo_common_skill.md');
  assert.match(common, /visibility` is a bitmask: Logs=1, Studio=2, Platform=4, XmlFile=8/);
  assert.match(common, /Sibling actions under the same event run in parallel/);
  assert.match(common, /Failure handler only fires when the call is rejected/);
  const ngx = read('resources/convertigo_frontend_ngx.md');
  assert.match(ngx, /^### Execution order inside an event$/m);
  assert.match(ngx, /^## Forms and input fields$/m);
  assert.match(ngx, /`LabelPlacement` explicitly/);
  assert.match(common, /Form controls are the exception: their label is their `Label` property/);
  assert.match(common, /Never write SmartSource JSON from memory/);
  assert.match(ngx, /^### Never write SmartSource JSON from memory$/m);
  assert.match(ngx, /\{"priority":<priority of the UIForm>,"identifier":"<identifier of the UIForm>"\}/);
  const auth = read('resources/convertigo_authentication.md');
  assert.match(auth, /^### Demo or first account without SMTP$/m);
  assert.match(auth, /GetAccountDocument/);
  assert.match(auth, /`noAutoLogin`/);
});
