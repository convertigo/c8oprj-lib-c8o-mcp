// Run: node --test tests/scripts/validate_nocode_form_generate.cjs
// js/nocode_form_generate.js, the generator behind the Flash mode of the Tigo panel (sequence nocode_form_generate,
// called by lib_ConvertigoAssistant, never listed to an agent): one model call writes a form (compiled, validated,
// repaired at most twice, saved) or the spec of a data application (nocode-app-create), or declines; a call answers
// running past its budget and the jobId resumes it for the same user only; the gateway key is the user's when the
// Assistant passes its handle. The engine (gateway, files, server store) is a test host here; C8O.nocodeForms and
// C8O.nocodeApp are stubs that record what they are given.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const BANK = [
  { id: 'fr1', lang: 'fr', u: 'Questionnaire de satisfaction pour mon restaurant avec une note et un commentaire', a: JSON.stringify({ name: 'Satisfaction', language: 'fr', pages: [{ name: 'Avis', fields: [{ type: 'slider', name: 'note' }] }] }) },
  { id: 'fr2', lang: 'fr', u: 'Inscription à un atelier avec nom, prénom et courriel', a: JSON.stringify({ name: 'Inscription', language: 'fr', pages: [] }) },
  { id: 'fr3', lang: 'fr', u: 'Déclaration de sinistre avec photos', a: JSON.stringify({ name: 'Sinistre', language: 'fr', pages: [] }) },
  { id: 'fr4', lang: 'fr', u: 'Demande de congés', a: JSON.stringify({ name: 'Congés', language: 'fr', pages: [] }) },
  { id: 'en1', lang: 'en', u: 'Customer satisfaction survey for my restaurant', a: JSON.stringify({ name: 'Survey', language: 'en', pages: [] }) },
  { id: 'en2', lang: 'en', u: 'Job application with resume upload', a: JSON.stringify({ name: 'Application', language: 'en', pages: [] }) }
];

const FORM = {
  name: 'Satisfaction', language: 'fr', navigationMode: 'buttons',
  pages: [{ name: 'Avis', fields: [
    { type: 'section', name: 'identite', title: 'Vous', fields: [{ type: 'text', name: 'nom' }, { type: 'text', name: 'email', config: { type: 'email' } }] },
    { type: 'slider', name: 'note' }, { type: 'textarea', name: 'commentaire' }] }]
};

function load() {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(read('js/nocode_form_generate.js'), sandbox, { filename: 'js/nocode_form_generate.js' });
  return sandbox;
}

// what C8Oforms answers: a contract, compile/validate of a reduced form (a form with "bad" does not compile), saves
function forms(sandbox, saves) {
  const calls = { contract: 0, compile: [], create: [], app: [] };
  sandbox.C8O.nocodeForms = {
    contract(options) {
      calls.contract++;
      if (!options.sections) return { contractVersion: '2026-11-19.test', quickReference: { forms: 'pages > fields' }, types: ['text', 'section'], aliases: { input: 'text' } };
      const sections = {};
      options.sections.forEach(name => { sections[name] = { rule: name + ' text' }; });
      return { sections, remaining: [] };
    },
    compile(reduced) {
      calls.compile.push(reduced);
      if (reduced.bad) return { status: 'invalid', error: { code: 'unknown_type', message: 'bad is not a component type' }, validation: { issues: [{ code: 'unknown_type', message: 'bad', path: 'pages[0].fields[0]' }] } };
      return { status: 'ok', form: { compiled: reduced }, validation: { valid: true, issues: [], warnings: [{ code: 'baserow_identity_pending_creation', path: 'x' }] } };
    },
    validate() { return { validation: { valid: true, issues: [], warnings: [] } }; },
    create(reduced, options) {
      calls.create.push({ reduced, options });
      const next = (saves || []).shift();
      return next || { status: 'ok', saved: true, id: 'form-1', rev: '1-a', validation: { valid: true, issues: [], warnings: [] } };
    }
  };
  sandbox.C8O.nocodeApp = {
    create(spec, options) {
      calls.app.push({ spec: JSON.parse(JSON.stringify(spec)), options });
      const next = sandbox.appAnswers && sandbox.appAnswers.shift();
      return next || { status: 'ok', saved: true, id: 'app-1', pages: [{ name: 'Liste' }, { name: 'Fiche' }], baserow: { base: { id: 2180, name: 'CRM' }, tables: [{ id: 7, name: 'Contacts', created: true }] } };
    }
  };
  return calls;
}

// answers: one per model call, {content} or {pendingMs, content} (a call that takes that long) or {status, body}
function host(answers, options = {}) {
  const state = { t: 1000, chats: [], prompts: {}, writes: 0, paused: 0, store: new Map(), jobs: new Map(), n: 0 };
  state.host = {
    now: () => state.t,
    uuid: () => 'uuid-' + (++state.n),
    pause: ms => { state.t += ms; state.paused++; },
    sha1: text => crypto.createHash('sha1').update(String(text)).digest('hex').slice(0, 12),
    fold: text => String(text).normalize('NFKD').replace(/[̀-ͯ]/g, ''),
    cached: (name, compute) => { if (!state.store.has(name)) state.store.set(name, compute()); return state.store.get(name); },
    bankDocs: () => BANK,
    readPrompt: name => state.prompts[name] || '',
    writePrompt: (name, text) => { state.prompts[name] = text; state.writes++; },
    jobs: () => ({ get: id => state.jobs.get(id), put: (id, job) => state.jobs.set(id, job), remove: id => state.jobs.delete(id), keys: () => [...state.jobs.keys()] }),
    gatewayKey: keyParams => (options.gatewayKey ? options.gatewayKey(keyParams) : { key: 'sk-server0123456789abcdef', source: 'server' }),
    startChat: (key, body) => {
      const call = { key, body: JSON.parse(JSON.stringify(body)), answer: answers.shift(), left: 0 };
      if (!call.answer) throw new Error('no answer scripted for model call ' + (state.chats.length + 1));
      call.left = call.answer.pendingMs || 0;
      state.chats.push(call);
      return call;
    },
    awaitChat: (call, ms) => {
      const wait = Math.min(ms, call.left);
      state.t += wait;
      call.left -= wait;
      if (call.left > 0) return null;
      if (call.answer.status) return { status: call.answer.status, body: call.answer.body || '', cost: '', callId: '' };
      const content = typeof call.answer.content === 'string' ? call.answer.content : JSON.stringify(call.answer.content);
      return { status: 200, body: JSON.stringify({ id: 'chat-' + state.chats.length, choices: [{ message: { content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 9000, completion_tokens: 400, prompt_tokens_details: { cached_tokens: 7168 }, completion_tokens_details: { reasoning_tokens: 120 } } }),
        cost: '0.0025', callId: 'call-' + state.chats.length };
    },
    cancelChat: () => {},
    redact: text => String(text).replace(/\bsk-[A-Za-z0-9_\-.]{4,}/g, 'sk-[redacted]')
  };
  return state;
}

const plain = value => JSON.parse(JSON.stringify(value));
const PARAMS = { request: 'Fais un questionnaire de satisfaction pour mon restaurant', token: 'tok-A', userId: 'alice' };

test('a questionnaire is written, checked and saved in one model call', () => {
  const sandbox = load();
  const calls = forms(sandbox);
  const h = host([{ content: FORM }]);
  const out = plain(sandbox.C8O.nocodeFormGenerate.run(Object.assign({ reasoning: 'Medium' }, PARAMS), h.host));
  assert.equal(out.status, 'created');
  assert.equal(out.id, 'form-1');
  assert.equal(out.route, 'form');
  assert.equal(out.attempts, 1);
  assert.deepEqual(out.summary, { name: 'Satisfaction', pages: 1, fields: 4, sections: 1, language: 'fr', navigationMode: 'buttons' });
  assert.equal(out.usage.cost, 0.0025);
  assert.equal(out.usage.keySource, 'server');
  assert.equal(out.usage.cachedTokens, 7168);
  assert.equal(out.reasoning, 'medium');
  assert.equal(calls.create.length, 1);
  assert.deepEqual(plain(calls.create[0].options), { project: 'C8Oforms', token: 'tok-A' });

  const body = h.chats[0].body;
  assert.equal(body.model, 'mistral/mistral-large-4');
  assert.equal(body.temperature, 0);
  assert.equal(body.top_p, 1);
  assert.equal(body.reasoning_effort, 'medium');
  const system = body.messages[0].content;
  assert.ok(system.startsWith('You are the expert author of C8Oforms No Code forms.'));
  assert.ok(system.includes('CONTRACT 2026-11-19.test'));
  assert.ok(system.includes('Section generationQuality:'));
  assert.ok(system.endsWith(sandbox.C8O.nocodeFormGenerate.FLASH_RULES), 'the Flash rules close the stable prompt');
  assert.match(system, /a page with more than 5 fields groups them in sections/);
  assert.match(system, /A submit flow element always saves somewhere/, 'no submit step that saves nothing (unconfigured_submit)');
  // 3 examples, the closest one in the request's language first and sent last, then the request
  const turns = body.messages.slice(1);
  assert.equal(turns.length, 7);
  assert.equal(turns[4].content, BANK[0].u, 'the closest example is the last one before the request');
  assert.equal(turns[6].content, PARAMS.request);
  assert.equal(out.examples.length, 3);
  assert.equal(out.examples[0], 'fr1', 'a matching example in French before the matching English one');
  assert.equal(out.examples[1], 'en1');
});

test('the stable prompt is written once per contract and rules, and read back as is', () => {
  const sandbox = load();
  forms(sandbox);
  const h = host([{ content: FORM }, { content: FORM }]);
  const first = plain(sandbox.C8O.nocodeFormGenerate.run(PARAMS, h.host));
  const second = plain(sandbox.C8O.nocodeFormGenerate.run(PARAMS, h.host));
  assert.equal(h.writes, 1);
  assert.equal(first.promptId, second.promptId);
  assert.equal(h.chats[0].body.messages[0].content, h.chats[1].body.messages[0].content);
  const [name] = Object.keys(h.prompts);
  assert.match(name, /^prompt-2026-11-19\.test-[0-9a-f]{12}\.txt$/, 'named after the contract version and the rules');
  assert.equal(h.chats[0].body.reasoning_effort, undefined, 'no effort: the gateway default');
});

test('compile errors go back to the model, twice at most', () => {
  const sandbox = load();
  const calls = forms(sandbox);
  const h = host([{ content: { bad: true, pages: [] } }, { content: FORM }]);
  const out = plain(sandbox.C8O.nocodeFormGenerate.run(PARAMS, h.host));
  assert.equal(out.status, 'created');
  assert.equal(out.attempts, 2);
  const repair = h.chats[1].body.messages.slice(-1)[0].content;
  assert.match(repair, /nocode-form-compile refused it: bad is not a component type/);
  assert.equal(out.usage.requests, 2);
  assert.equal(out.usage.perCall[1].stage, 'repair');
  assert.equal(calls.create.length, 1);

  const sandbox2 = load();
  const calls2 = forms(sandbox2);
  const h2 = host([{ content: { bad: 1 } }, { content: { bad: 2 } }, { content: { bad: 3 } }]);
  const invalid = plain(sandbox2.C8O.nocodeFormGenerate.run(PARAMS, h2.host));
  assert.equal(invalid.status, 'invalid');
  assert.equal(invalid.attempts, 3);
  assert.equal(h2.chats.length, 3);
  assert.equal(calls2.create.length, 0, 'nothing saved');
});

test('past its budget a call answers running, and the jobId resumes it for the same user only', () => {
  const sandbox = load();
  forms(sandbox);
  const h = host([{ content: FORM, pendingMs: 50000 }]);
  const first = plain(sandbox.C8O.nocodeFormGenerate.run(PARAMS, h.host));
  assert.equal(first.status, 'running');
  assert.equal(first.stage, 'generate');
  assert.match(first.jobId, /^gen-/);
  const foreign = plain(sandbox.C8O.nocodeFormGenerate.run({ jobId: first.jobId, token: 'tok-B', userId: 'bob' }, h.host));
  assert.equal(foreign.status, 'error');
  assert.equal(foreign.error.code, 'unknown_job');
  const done = plain(sandbox.C8O.nocodeFormGenerate.run({ jobId: first.jobId, token: 'tok-A', userId: 'alice' }, h.host));
  assert.equal(done.status, 'created');
  assert.equal(done.jobId, first.jobId);
  assert.equal(h.chats.length, 1, 'no second generation');
  const again = plain(sandbox.C8O.nocodeFormGenerate.run({ jobId: first.jobId, token: 'tok-A', userId: 'alice' }, h.host));
  assert.deepEqual(again, done, 'a finished job answers its result again');
});

test('what Flash cannot do is declined in one answer', () => {
  const sandbox = load();
  const calls = forms(sandbox);
  const h = host([{ content: { flash: 'decline', kind: 'clarify', reason: 'Dites-moi ce que le formulaire doit contenir.' } }]);
  const out = plain(sandbox.C8O.nocodeFormGenerate.run(Object.assign({}, PARAMS, { request: 'Fais moi un formulaire' }), h.host));
  assert.equal(out.status, 'declined');
  assert.equal(out.kind, 'clarify');
  assert.equal(out.reason, 'Dites-moi ce que le formulaire doit contenir.');
  assert.equal(calls.compile.length + calls.create.length + calls.app.length, 0);
});

test('a data application goes to nocode-app-create with the slips of its spec fixed', () => {
  const sandbox = load();
  const calls = forms(sandbox);
  const spec = { name: 'CRM', entities: [{ name: 'contact', fields: [{ name: 'Nom', type: 'text' }, { name: 'Statut', type: 'select', options: ['Prospect', 'Client'] },
    { name: 'Créé le', type: 'date', default: 'now' }, { name: 'Note', type: 'textarea', options: 'x' }], screens: { list: true, form: true } }] };
  sandbox.appAnswers = [{ status: 'error', saved: false, error: { code: 'invalid_spec', path: 'entities[0].screens', message: 'dashboard needs groupBy' } }];
  const h = host([{ content: { flash: 'app', spec } }, { content: { flash: 'app', spec } }]);
  const out = plain(sandbox.C8O.nocodeFormGenerate.run(Object.assign({}, PARAMS, { request: 'Fais moi une CRM avec la liste des contacts' }), h.host));
  assert.equal(out.status, 'created');
  assert.equal(out.route, 'app');
  assert.equal(out.id, 'app-1');
  assert.equal(out.attempts, 2, 'the refused spec was repaired from the exact error');
  assert.match(h.chats[1].body.messages.slice(-1)[0].content, /nocode-app-create refused the spec: entities\[0\]\.screens: dashboard needs groupBy/);
  const sent = calls.app[0].spec;
  assert.equal(sent.mode, 'apply');
  assert.equal(sent.language, 'fr');
  assert.equal(sent.entities[0].fields[1].type, 'single_select');
  assert.equal(sent.entities[0].fields[2].default, undefined);
  assert.equal(sent.entities[0].fields[3].type, 'long_text');
  assert.equal(sent.entities[0].fields[3].options, undefined);
  assert.deepEqual(out.summary, { name: 'CRM', pages: 2, fields: 4, tables: 1, base: 'CRM', language: 'fr', navigationMode: 'custom', route: 'app' });
  assert.ok(out.specFixes.length >= 3);
  assert.deepEqual(plain(out.base), { id: 2180, name: 'CRM' }, 'the base of the new tables, for the next turn of the agent');
  assert.deepEqual(plain(out.tables), [{ id: 7, name: 'Contacts', created: true }]);
  assert.equal(calls.create.length, 0);
});

test('a save refused with auth_required is tried once more', () => {
  const sandbox = load();
  const calls = forms(sandbox, [{ status: 'auth_required', saved: false, authentication: { authenticated: false } }]);
  const h = host([{ content: FORM }]);
  const out = plain(sandbox.C8O.nocodeFormGenerate.run(PARAMS, h.host));
  assert.equal(out.status, 'created');
  assert.equal(out.authRetried, true);
  assert.equal(calls.create.length, 2);
  assert.equal(h.paused, 1);

  const sandbox2 = load();
  const calls2 = forms(sandbox2, [{ status: 'auth_required', saved: false }, { status: 'auth_required', saved: false }]);
  const out2 = plain(sandbox2.C8O.nocodeFormGenerate.run(PARAMS, host([{ content: FORM }]).host));
  assert.equal(out2.status, 'error');
  assert.equal(out2.error.code, 'auth_required');
  assert.equal(calls2.create.length, 2, 'once more, not in a loop');
});

test('the gateway key: the user\'s behind its handle, never another user\'s, nothing without one', () => {
  const { userGatewayKey } = load().C8O.nocodeFormGenerate.internals;
  const handle = 'lib_ConvertigoAssistant.gatewayKey.0123456789abcdef';
  const bundle = owner => JSON.stringify({ key: 'sk-user0123456789abcdefgh', owner, expiresAt: 0 });
  assert.deepEqual(plain(userGatewayKey(handle, 'alice', bundle('alice'))), { key: 'sk-user0123456789abcdefgh', source: 'user' });
  assert.equal(userGatewayKey(handle, 'bob', bundle('alice')).error.code, 'gateway_credential_foreign');
  assert.equal(userGatewayKey(handle, '', bundle('alice')).error.code, 'gateway_credential_foreign');
  assert.equal(userGatewayKey(handle, 'alice', '').error.code, 'gateway_credential_missing');
  assert.equal(userGatewayKey('other.key.0123456789', 'alice', bundle('alice')).error.code, 'gateway_credential_invalid');
  assert.equal(userGatewayKey(handle, 'alice', JSON.stringify({ key: 'not-a-key', owner: 'alice' })).error.code, 'gateway_credential_invalid');

  // the run uses what the host resolves for the handle and the user it was given, and starts nothing without a key
  const sandbox = load();
  forms(sandbox);
  const seen = [];
  const h = host([{ content: FORM }], { gatewayKey: keyParams => { seen.push(keyParams); return { key: 'sk-user0123456789abcdefgh', source: 'user' }; } });
  const out = plain(sandbox.C8O.nocodeFormGenerate.run(Object.assign({ gatewayKeyHandle: handle }, PARAMS), h.host));
  assert.equal(out.status, 'created');
  assert.equal(out.usage.keySource, 'user');
  assert.equal(h.chats[0].key, 'sk-user0123456789abcdefgh');
  assert.deepEqual(plain(seen[0]), { gatewayKeyHandle: handle, userId: 'alice' });
  assert.ok(!JSON.stringify(out).includes('sk-user'), 'the key is never answered');

  const sandbox2 = load();
  forms(sandbox2);
  const refused = host([], { gatewayKey: () => ({ error: { code: 'gateway_credential_missing', message: 'Your Tigo key could not be obtained.' } }) });
  const out2 = plain(sandbox2.C8O.nocodeFormGenerate.run(PARAMS, refused.host));
  assert.equal(out2.status, 'error');
  assert.equal(out2.error.code, 'gateway_credential_missing');
  assert.equal(refused.chats.length, 0);
});

test('a gateway refusal is answered without the key, a budget refusal named as such', () => {
  const sandbox = load();
  forms(sandbox);
  const h = host([{ status: 400, body: '{"error":{"message":"Budget has been exceeded for key sk-user0123456789abcdefgh"}}' }]);
  const out = plain(sandbox.C8O.nocodeFormGenerate.run(PARAMS, h.host));
  assert.equal(out.status, 'error');
  assert.equal(out.error.code, 'gateway_budget');
  assert.ok(!out.error.message.includes('sk-user0123456789'), out.error.message);
});

test('no request or no token: nothing is started', () => {
  const sandbox = load();
  forms(sandbox);
  const h = host([]);
  assert.equal(sandbox.C8O.nocodeFormGenerate.run({ token: 'tok-A' }, h.host).error.code, 'missing_request');
  assert.equal(sandbox.C8O.nocodeFormGenerate.run({ request: 'Un formulaire' }, h.host).error.code, 'missing_token');
  assert.equal(h.chats.length, 0);
});

test('the example bank ships with the project', () => {
  const bank = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'resources/nocode-form-generator/bank.json.gz'))).toString('utf8'));
  assert.equal(bank.format, 1);
  assert.ok(bank.docs.length >= 1800, String(bank.docs.length));
  const ids = new Set();
  for (const doc of bank.docs) {
    assert.ok(['fr', 'en'].includes(doc.lang), doc.id);
    assert.ok(doc.u.trim().length, doc.id);
    const form = JSON.parse(doc.a);
    assert.ok(Array.isArray(form.pages), doc.id);
    assert.ok(!ids.has(doc.id), 'unique id ' + doc.id);
    ids.add(doc.id);
  }
  // the retrieval of the engine reads it as it is
  const sandbox = load();
  const h = host([]);
  const api = sandbox.C8O.nocodeFormGenerate.internals;
  const index = api.indexBank(bank.docs, h.host);
  assert.equal(index.n, bank.docs.length);
  const shots = api.retrieve(index, 'Formulaire de réservation de salle de réunion avec date et nombre de participants', 'fr', h.host);
  assert.equal(shots.length, 3);
  shots.forEach(s => assert.equal(bank.docs.find(d => d.id === s.id).lang, 'fr'));
});

test('the generator is a private sequence, listed to no agent', () => {
  const project = read('c8oProject.yaml');
  assert.match(project, /↓nocode_form_generate \[sequences\.GenericSequence\]: 🗏 sequences\/nocode_form_generate\.yaml\n/);
  assert.doesNotMatch(project, /tools_nocode_form_generate/);
  const sequence = read('_c8oProject/sequences/nocode_form_generate.yaml');
  assert.match(sequence, /^accessibility: Private\n/);
  assert.match(sequence, /C8O\.nocodeFormGenerate\.run\(/);
  for (const name of ['request', 'tables', 'language', 'mode', 'reasoning', 'project', 'token', 'userId', 'gatewayKeyHandle', 'jobId']) {
    assert.match(sequence, new RegExp('\\n↓' + name + ' \\[variables\\.RequestableVariable-\\d+\\]: \\n'), name);
  }
  assert.doesNotMatch(read('js/nocode_tool_policy.js'), /form_generate/);
  assert.doesNotMatch(read('js/schema_overrides.js'), /form_generate/);
});
