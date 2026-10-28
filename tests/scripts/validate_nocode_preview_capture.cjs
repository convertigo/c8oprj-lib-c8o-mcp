// Run: node --test tests/scripts/validate_nocode_preview_capture.cjs
// nocode-form-preview-capture: the request left in the server store under the conversation, the panel taking it, the
// page's answer, the waits (25 s, then pending; 60 s, then unavailable), the refusals and the description with the
// key of the user's agent. A fake clock moves on each sleep and plays the panel and the page.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'js/nocode_preview_capture.js'), 'utf8');
const sandbox = {};
vm.runInNewContext(source, sandbox);
const api = sandbox.C8O.nocodePreviewCapture;

class FakeMap {
  constructor() { this.m = new Map(); }
  get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  put(k, v) { this.m.set(k, v); }
  remove(k) { this.m.delete(k); }
  putIfAbsent(k, v) { if (!this.m.has(k)) this.m.set(k, v); return null; }
  replace(k, before, after) { if (this.m.get(k) !== before) return false; this.m.set(k, after); return true; }
  keySet() { const keys = [...this.m.keys()]; return { toArray: () => keys }; }
}

// play(now, map): the panel and the page, called before each sleep
function world(options = {}) {
  const store = new Map();
  const clock = { now: 1793000000000 };
  const described = [];
  const host = {
    header: name => name === 'X-Convertigo-Conversation-Id' ? (options.conversation === undefined ? 'agent-1' : options.conversation) : '',
    server: () => ({ get: k => store.has(k) ? store.get(k) : null, set: (k, v) => store.set(k, v) }),
    newMap: () => new FakeMap(),
    getForm: (id) => options.form || { status: 'ok', form: { _id: id, name: 'Congés' }, authentication: { authenticated: true, user: 'gregoryv@convertigo.com' } },
    describe: (params, user) => { described.push({ params, user }); return { description: 'Formulaire Congés : Nom, Date', model: 'mistral/mistral-large-4', usage: { tool: 'image-describe', callId: 'c1', model: 'mistral/mistral-large-4', inputTokens: 900, outputTokens: 100, cost: 0.002 } }; },
    now: () => clock.now,
    sleep: ms => { if (options.play) { options.play(clock.now, store.get('lib_ConvertigoAssistant.hostRequests').get('agent-1')); } clock.now += ms; },
    uuid: () => 'u1'
  };
  return { host, store, clock, described };
}

function requestIn(map) { const json = map.get('cap-u1'); return json ? JSON.parse(json) : null; }
function set(map, changes) { const r = requestIn(map); map.put(r.id, JSON.stringify(Object.assign(r, changes))); }

test('the page captures the preview: the agent gets the path, the size and the description, the request goes away', () => {
  const w = world({ play: (now, map) => {
    const r = requestIn(map);
    if (r.status === 'pending' && now >= 1793000000500) set(map, { status: 'taken', takenAt: now });
    if (r.status === 'taken' && now >= 1793000001500) set(map, { status: 'done', result: { path: 'agents/convertigo/users/g/conversations/agent-1/attachments/preview-1-1-mobile-1.png', absolutePath: '/workspace/agents/convertigo/users/g/conversations/agent-1/attachments/preview-1-1-mobile-1.png', width: 780, height: 1688 } });
  } });
  const answer = api.run({ formId: '1792769924346', device: 'mobile', question: 'Le bouton Envoyer est-il visible ?' }, w.host);
  assert.equal(answer.status, 'captured');
  assert.equal(answer.path, 'agents/convertigo/users/g/conversations/agent-1/attachments/preview-1-1-mobile-1.png');
  assert.deepEqual([answer.width, answer.height, answer.device, answer.formId], [780, 1688, 'mobile', '1792769924346']);
  assert.match(answer.description, /Nom, Date/);
  assert.equal(answer.usage.tool, 'image-describe', 'the Bridge counts it in the conversation usage');
  assert.equal(w.described[0].user, 'gregoryv@convertigo.com', 'described with the key of the user\'s agent');
  assert.equal(w.described[0].params.path, '/workspace/agents/convertigo/users/g/conversations/agent-1/attachments/preview-1-1-mobile-1.png');
  assert.match(w.described[0].params.question, /phone, 390 px wide.*Transcribe every visible text exactly.*Then answer: Le bouton Envoyer est-il visible \?/);
  assert.equal(w.store.get('lib_ConvertigoAssistant.hostRequests').get('agent-1').get('cap-u1'), null);
});

test('the request names the conversation, the user, the form, the page and the device, and expires after 60 s', () => {
  let seen = null;
  const w = world({ play: (now, map) => { seen = seen || requestIn(map); } });
  const answer = api.run({ formId: 'f1', page: '2' }, w.host);
  assert.equal(answer.status, 'pending', 'nobody took it within 25 s');
  assert.equal(answer.captureId, 'cap-u1');
  assert.deepEqual({ kind: seen.kind, conversationId: seen.conversationId, user: seen.user, formId: seen.formId, formName: seen.formName, page: seen.page, device: seen.device, status: seen.status },
    { kind: 'preview-capture', conversationId: 'agent-1', user: 'gregoryv@convertigo.com', formId: 'f1', formName: 'Congés', page: '2', device: 'desktop', status: 'pending' });
  assert.equal(seen.expiresAt - seen.createdAt, 60000);
  assert.equal(api.run({ formId: 'f1', captureId: 'cap-u1' }, w.host).status, 'pending', '50 s after it was left');
  const again = api.run({ formId: 'f1', captureId: 'cap-u1' }, w.host);
  assert.equal(again.status, 'unavailable');
  assert.equal(again.reason, 'no_page');
  assert.match(again.message, /No Code Studio open with Tigo.*do not ask for a capture again in this turn, and rely on nocode-form-validate/);
});

test('a refusal or a failure of the page comes back as unavailable with its reason and what to do', () => {
  for (const reason of ['declined', 'unsupported', 'unsupported_browser', 'render_timeout', 'capture_failed', 'unknown_page']) {
    const w = world({ play: (now, map) => { const r = requestIn(map); if (r.status === 'pending') set(map, { status: 'taken', takenAt: now }); else if (r.status === 'taken') set(map, { status: 'failed', error: { reason } }); } });
    const answer = api.run({ formId: 'f1' }, w.host);
    assert.deepEqual([answer.status, answer.reason], ['unavailable', reason]);
    assert.match(answer.message, /Tell the user in one sentence/);
    assert.doesNotMatch(answer.message, /within 60 s/, reason + ' has its own explanation');
  }
});

test('while the user is asked to allow the preview, the agent waits, then hears sharing_off', () => {
  const w = world({ play: (now, map) => { const r = requestIn(map); if (r.status === 'pending') set(map, { status: 'taken', takenAt: now, note: 'sharing_off' }); } });
  const first = api.run({ formId: 'f1' }, w.host);
  assert.equal(first.status, 'pending');
  assert.match(first.message, /asked to allow the preview/);
  const second = api.run({ formId: 'f1', captureId: first.captureId }, w.host);
  assert.equal(second.status, 'pending', '50 s after it was taken');
  const third = api.run({ formId: 'f1', captureId: first.captureId }, w.host);
  assert.deepEqual([third.status, third.reason], ['unavailable', 'sharing_off']);
});

test('nothing is requested for a form the user cannot read, without authentication or without a conversation', () => {
  const forbidden = world({ form: { status: 'error', error: { message: 'not allowed' } } });
  assert.equal(api.run({ formId: 'f1' }, forbidden.host).error.code, 'forbidden');
  assert.equal(forbidden.store.size, 0);
  const anonymous = world({ form: { status: 'auth_required' } });
  assert.equal(api.run({ formId: 'f1' }, anonymous.host).error.code, 'auth_required');
  const lost = world({ conversation: '' });
  assert.equal(api.run({ formId: 'f1' }, lost.host).reason, 'no_conversation');
  const routed = world({ conversation: '' });
  assert.equal(api.run({ formId: 'f1', conversationId: 'agent-1' }, routed.host).status, 'pending', 'the conversation set by the router');
  assert.ok(routed.store.get('lib_ConvertigoAssistant.hostRequests').get('agent-1').get('cap-u1'));
  assert.equal(api.run({ formId: 'f1', conversationId: '../x' }, world({ conversation: '' }).host).reason, 'no_conversation');
  assert.equal(api.run({}, world().host).error.code, 'missing_form');
  assert.equal(api.run({ formId: 'f1', device: 'tablet' }, world().host).error.code, 'invalid_device');
});

test('a captureId of another user or conversation is unknown; requests older than 10 minutes are swept', () => {
  const w = world();
  const map = new FakeMap();
  const conversations = new FakeMap();
  conversations.put('agent-1', map);
  w.store.set('lib_ConvertigoAssistant.hostRequests', conversations);
  map.put('cap-other', JSON.stringify({ id: 'cap-other', user: 'someone@else', createdAt: w.clock.now, status: 'pending' }));
  map.put('cap-old', JSON.stringify({ id: 'cap-old', user: 'gregoryv@convertigo.com', createdAt: w.clock.now - 11 * 60000, status: 'done' }));
  assert.equal(api.run({ formId: 'f1', captureId: 'cap-other' }, w.host).error.code, 'unknown_capture');
  assert.equal(map.get('cap-old'), null);
});

test('the key of the user\'s agent is found in the folder the Assistant and the Bridge name the same way', () => {
  const sha = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  assert.equal(api.userPathSlug('gregoryv@convertigo.com', sha), 'gregoryv_convertigo.com--44ece92f8543be9e', 'the folder of gregory on test-nocode');
  assert.equal(api.userPathSlug('studio', sha), 'studio');
  assert.equal(api.owner('google:1093:gregoryv@convertigo.com'), 'gregoryv@convertigo.com', 'an OAuth sign-in goes by its email');
  assert.equal(api.owner('c8o:admin'), 'c8o:admin');
  assert.match(source, /agents\/vibe\/homes-convertigo\/users\/" \+ api\.userPathSlug\(user, sha256Hex\) \+ "\/\.vibe-home\/\.env"/);
  assert.match(source, /return userAgentKey\(user\) \|\| serverKey\(\);/);
});

test('the tool is declared, listed in No Code with its schema, and its sequence runs this code', () => {
  const project = fs.readFileSync(path.join(root, 'c8oProject.yaml'), 'utf8');
  assert.match(project, /↓tools_nocode_form_preview_capture \[sequences\.GenericSequence\]: 🗏 sequences\/tools_nocode_form_preview_capture\.yaml/);
  const sequence = fs.readFileSync(path.join(root, '_c8oProject/sequences/tools_nocode_form_preview_capture.yaml'), 'utf8');
  assert.match(sequence, /include\("js\/nocode_forms\.js"\);\n\s+include\("js\/tools_image_describe\.js"\);\n\s+include\("js\/nocode_preview_capture\.js"\);/);
  assert.match(sequence, /C8O\.nocodePreviewCapture\.run\(\{ project: project, formId: formId, page: page, device: device, question: question, captureId: captureId, conversationId: conversationId, token: token \}, C8O\.nocodePreviewCapture\.javaHost\(\)\)/);
  assert.match(sequence, /↓formId \[variables\.RequestableVariable-1793030000004\]: \n/);
  assert.doesNotMatch(sequence, /^  (comment|description): [^'|].*: /m, 'a value holding ": " is quoted');
  const router = fs.readFileSync(path.join(root, 'js/mcp_endpoint_router.js'), 'utf8');
  assert.match(router, /if \(targetSequence === "tools_nocode_form_preview_capture"\) \{\n\s+callVariables\.conversationId = managedConversationId;/,
    'the router always sets the conversation, even empty: the model never names one');
  const policy = { active: null };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/nocode_tool_policy.js'), 'utf8'), policy);
  assert.equal(policy.C8O.nocodeToolPolicy.allows('tools_nocode_form_preview_capture'), true);
  const overrides = fs.readFileSync(path.join(root, 'js/schema_overrides.js'), 'utf8');
  assert.match(overrides, /if \(seq === "tools_nocode_form_preview_capture"\) \{\n\s+return nocodeFormPreviewCaptureInputSchema\(\);/);
  assert.match(overrides, /enum: \["desktop", "mobile"\]/);
  assert.match(overrides, /required: \["formId"\],/);
});

test('the form is read as nocode-form-get reads it: the document itself, or fetched false; the user from the token', () => {
  const auth = { status: 'valid', authenticated: true, user: 'google:42:testuser-convertigo@yopmail.com' };
  const doc = { _id: '1793017822899', _rev: '3-a', name: 'Issue 1526' };
  const calls = [];
  const read = api.formRead(o => { calls.push(['auth', o.token]); return auth; }, (id, o) => { calls.push(['get', id, o.project]); return doc; }, '1793017822899', 'C8Oforms', '');
  assert.equal(read.status, 'ok');
  assert.equal(read.form, doc);
  assert.equal(api.owner(read.authentication.user), 'testuser-convertigo@yopmail.com');
  assert.deepEqual(calls, [['auth', ''], ['get', '1793017822899', 'C8Oforms']]);
  const hidden = api.formRead(() => auth, () => ({ status: 'unavailable', fetched: false, error: { code: 'form_unavailable' } }), 'x', 'C8Oforms', '');
  assert.equal(hidden.status, 'unavailable');
  assert.equal(api.formRead(() => ({ authenticated: false }), () => doc, 'x', 'C8Oforms', '').status, 'auth_required');
  assert.equal(api.run({ formId: 'x' }, Object.assign({}, { getForm: () => hidden })).error.code, 'forbidden', 'nothing requested');
  const source = require('node:fs').readFileSync(require('node:path').join(root, 'js/nocode_forms.js'), 'utf8');
  assert.match(source, /C8O\.nocodeForms\.authentication = validateToken;/);
  assert.match(require('node:fs').readFileSync(require('node:path').join(root, 'js/nocode_preview_capture.js'), 'utf8'),
    /return api\.formRead\(C8O\.nocodeForms\.authentication, C8O\.nocodeForms\.get, id, project, token\);/);
});
