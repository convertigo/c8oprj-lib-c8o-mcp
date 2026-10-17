const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'js/tools_image_describe.js'), 'utf8');
const KEY = 'sk-test-0123456789abcdef';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const WEBP = Buffer.from('RIFF\x10\x00\x00\x00WEBPVP8 ', 'latin1');

function load(auth) {
  const sandbox = { C8O: { mcpAuth: { authenticateRequest: () => auth } } };
  vm.runInNewContext(source, sandbox);
  return sandbox.C8O.imageDescribe;
}

function gatewayBody(extra) {
  return JSON.stringify(Object.assign({
    model: 'mistral/mistral-large-4',
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'A login form with a blue Save button.' } }],
    usage: { prompt_tokens: 1200, completion_tokens: 150, total_tokens: 1350, completion_tokens_details: { reasoning_tokens: 90 }, prompt_tokens_details: { cached_tokens: 0 } }
  }, extra || {}));
}

function host(overrides) {
  const seen = { posts: [] };
  const h = Object.assign({
    readKey: () => KEY,
    readImageFile: p => ({ bytes: PNG, path: '/ws/' + p }),
    decodeBase64: text => Buffer.from(text, 'base64'),
    encodeBase64: bytes => Buffer.from(bytes).toString('base64'),
    post: (url, key, body, timeoutMs) => {
      seen.posts.push({ url, key, body: JSON.parse(body), timeoutMs });
      return { status: 200, body: gatewayBody(), header: name => ({ 'x-litellm-response-cost': '0.0042', 'x-litellm-call-id': 'call-1' })[name] || '' };
    },
    now: (() => { let t = 1000; return () => (t += 250); })()
  }, overrides || {});
  return { h, seen };
}

test('the image type comes from its content: PNG, JPEG and WebP only', () => {
  const api = load();
  assert.equal(api.detectMimeType(PNG), 'image/png');
  assert.equal(api.detectMimeType(JPEG), 'image/jpeg');
  assert.equal(api.detectMimeType(WEBP), 'image/webp');
  assert.equal(api.detectMimeType(Buffer.from('GIF89a......')), '');
  assert.equal(api.detectMimeType(Buffer.from('sk-not-an-image')), '');
  // Java byte[] values are signed.
  assert.equal(api.detectMimeType([-1, -40, -1, 0]), 'image/jpeg');
});

test('a file is sent as a data URL to the default vision model, and its usage and cost come back', () => {
  const api = load();
  const { h, seen } = host();
  const result = api.run({ path: '.playwright-mcp/page.png', question: 'Is the Save button visible?' }, h);
  assert.equal(seen.posts.length, 1);
  const post = seen.posts[0];
  assert.equal(post.url, 'https://llm.convertigo.com/v1/chat/completions');
  assert.equal(post.key, KEY);
  assert.equal(post.body.model, 'mistral/mistral-large-4');
  assert.equal(post.body.max_tokens, 2000);
  const user = post.body.messages[1].content;
  assert.equal(user[0].text, 'Is the Save button visible?');
  assert.equal(user[1].image_url.url, 'data:image/png;base64,' + PNG.toString('base64'));
  assert.doesNotMatch(JSON.stringify(post.body), new RegExp(KEY));
  assert.equal(result.description, 'A login form with a blue Save button.');
  assert.deepEqual(JSON.parse(JSON.stringify(result.usage)), {
    tool: 'image-describe', callId: 'call-1', model: 'mistral/mistral-large-4', inputTokens: 1200, cachedTokens: 0, outputTokens: 150,
    reasoningTokens: 90, totalTokens: 1350, cost: 0.0042, currency: 'USD', durationMs: 250
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result.image)), { source: 'file', path: '/ws/.playwright-mcp/page.png', mimeType: 'image/png', bytes: PNG.length });
  assert.doesNotMatch(JSON.stringify(result), new RegExp(KEY));
});

test('base64 and data URLs are accepted; the model and the budget can be chosen', () => {
  const api = load();
  const { h, seen } = host();
  const result = api.run({ base64: 'data:image/png;base64,' + PNG.toString('base64'), model: 'other/vision', maxTokens: '99999' }, h);
  assert.equal(seen.posts[0].body.model, 'other/vision');
  assert.equal(seen.posts[0].body.max_tokens, 8000);
  assert.match(seen.posts[0].body.messages[1].content[0].text, /^Describe this screenshot/);
  assert.equal(result.image.source, 'base64');
  assert.throws(() => api.run({ base64: 'not base64 at all!' }, host().h), /base64 must be/);
});

test('exactly one image is required and only images are sent', () => {
  const api = load();
  assert.throws(() => api.run({}, host().h), /exactly one image/);
  assert.throws(() => api.run({ path: 'a.png', base64: PNG.toString('base64') }, host().h), /exactly one image/);
  const { h, seen } = host({ readImageFile: () => ({ bytes: Buffer.from(KEY), path: '/ws/agents/convertigo/llm-api-key' }) });
  assert.throws(() => api.run({ path: 'agents/convertigo/llm-api-key' }, h), /Only PNG, JPEG and WebP/);
  assert.equal(seen.posts.length, 0);
  assert.throws(() => api.run({ path: 'big.png' }, host({ readImageFile: () => ({ bytes: { length: 11 * 1024 * 1024 }, path: 'x' }) }).h), /larger than 10 MB/);
});

test('without a key nothing is sent', () => {
  const api = load();
  const { h, seen } = host({ readKey: () => '' });
  assert.throws(() => api.run({ path: 'a.png' }, h), /No Convertigo agent key/);
  assert.equal(seen.posts.length, 0);
});

test('gateway errors never echo the key and point to a vision model', () => {
  const api = load();
  const refused = host({ post: () => ({ status: 400, body: JSON.stringify({ error: { message: 'Image input is not enabled for this model' } }), header: () => '' }) });
  assert.throws(() => api.run({ path: 'a.png', model: 'mistral/zai-glm-5-3' }, refused.h), /HTTP 400.*Image input is not enabled.*mistral\/mistral-large-4/);
  const auth = host({ post: () => ({ status: 401, body: JSON.stringify({ error: { message: 'Invalid proxy server token passed. Received API Key = ' + KEY + ', sk-other-key-1234' } }), header: () => '' }) });
  try {
    api.run({ path: 'a.png' }, auth.h);
    assert.fail('expected an error');
  } catch (e) {
    assert.match(e.message, /HTTP 401/);
    assert.match(e.message, /agent key/);
    assert.doesNotMatch(e.message, /sk-test-0123|sk-other-key/);
  }
  const down = host({ post: () => { throw new Error('connect timed out with ' + KEY); } });
  assert.throws(() => api.run({ path: 'a.png' }, down.h), e => /could not be reached/.test(e.message) && !e.message.includes(KEY));
});

test('a cut answer is flagged, and a missing cost stays null', () => {
  const api = load();
  const { h } = host({ post: () => ({ status: 200, body: gatewayBody({ choices: [{ finish_reason: 'length', message: { content: '' } }] }), header: () => '' }) });
  const result = api.run({ path: 'a.png' }, h);
  assert.equal(result.truncated, true);
  assert.match(result.warning, /maxTokens/);
  assert.equal(result.usage.cost, null);
  assert.equal(result.usage.currency, '');
  assert.equal(result.usage.callId, '', 'no gateway id and no body id');
});

test('only a full MCP bearer can spend gateway credits', () => {
  for (const auth of [{ authenticated: false }, { authenticated: true, kind: 'nocode', scope: 'mcp:full' }, { authenticated: true, kind: 'token', scope: 'nocode' }]) {
    assert.throws(() => load(auth).execute({}, { path: 'a.png' }), /full Convertigo MCP bearer/);
  }
});

test('the tool is declared, documented and kept out of the NoCode profile', () => {
  const project = fs.readFileSync(path.join(root, 'c8oProject.yaml'), 'utf8');
  assert.match(project, /↓tools_image_describe \[sequences\.GenericSequence\]: 🗏 sequences\/tools_image_describe\.yaml/);
  const sequence = fs.readFileSync(path.join(root, '_c8oProject/sequences/tools_image_describe.yaml'), 'utf8');
  assert.match(sequence, /include\("js\/mcp_auth\.js"\)/);
  assert.match(sequence, /C8O\.imageDescribe\.execute\(context,/);
  assert.match(fs.readFileSync(path.join(root, 'TOOLS.md'), 'utf8'), /\| `image-describe` \| `tools_image_describe` \|/);
  assert.match(fs.readFileSync(path.join(root, 'js/setup_vibe.js'), 'utf8'), /"Convertigo_image-describe"/);
  assert.match(fs.readFileSync(path.join(root, 'resources/convertigo_common_skill.md'), 'utf8'), /`image-describe\(\{path:/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'js/nocode_tool_policy.js'), 'utf8'), /tools_image_describe/);
});
