// workflow-* tools (js/workflow_tools.js) against the real lib_WorkflowEngine: its engine, store and expression language
// run here on its MemoryStore, its sequences are read from its project (their engine function, their variables and
// whether they need a signed-in user), and the tools reach them through a fake InternalRequester that only lets in the
// variables a sequence declares. The tool of an MCP call acts as the user of its token, in an internal session of its
// own that carries no role: the roles come from the engine (global symbols here).
// Run: WORKFLOW_ENGINE_ROOT=<lib_WorkflowEngine project> node --test tests/scripts/validate_workflow_tools.cjs
// (default ../c8oprj-lib-workflow-engine; WORKFLOW_SAMPLE_ROOT, default ../c8oprj-workflow-sample-supplier, adds its
// template). A live run on a Studio with lib_WorkflowEngine is still the proof of the XML round trip of the answers.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const engineRoot = process.env.WORKFLOW_ENGINE_ROOT || path.resolve(root, '../c8oprj-lib-workflow-engine');
const sampleRoot = process.env.WORKFLOW_SAMPLE_ROOT || path.resolve(root, '../c8oprj-workflow-sample-supplier');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const clone = x => JSON.parse(JSON.stringify(x));
const haveEngine = fs.existsSync(path.join(engineRoot, 'js/workflow_engine.js'));
const skip = haveEngine ? false : 'lib_WorkflowEngine not found: set WORKFLOW_ENGINE_ROOT';

const TOKEN_USER = 'c8o:admin';
const TOOL_SEQUENCES = ['list', 'get', 'draft_create', 'draft_put', 'validate', 'simulate', 'publish', 'requests', 'catalog'];

// ------------------------------------------------------------------ the engine, as Rhino runs it

class JObject {}
class JCharSequence extends JObject {}
class JString extends JCharSequence {
  constructor(value) { super(); this.value = Buffer.isBuffer(value) ? value.toString('utf8') : String(value); }
  getBytes() { return Buffer.from(this.value, 'utf8'); }
  toString() { return this.value; }
}
class JFile {
  constructor(file) { this.file = String(file); }
  exists() { return fs.existsSync(this.file); }
  isFile() { return this.exists() && fs.statSync(this.file).isFile(); }
  isDirectory() { return this.exists() && fs.statSync(this.file).isDirectory(); }
  listFiles() { return fs.readdirSync(this.file).sort().map(name => new JFile(path.join(this.file, name))); }
  getName() { return path.basename(this.file); }
  getAbsolutePath() { return this.file; }
  toPath() { return this.file; }
}
const javaShim = {
  lang: {
    Object: JObject, CharSequence: JCharSequence, String: JString,
    System: { getProperty: (_k, d) => d === undefined ? null : d, setProperty() {}, clearProperty() {} }
  },
  io: { File: JFile },
  nio: { file: { Files: { readAllBytes: file => fs.readFileSync(String(file)) } } },
  security: { MessageDigest: { getInstance: () => ({ digest: bytes => crypto.createHash('sha256').update(bytes).digest() }) } },
  util: { UUID: { randomUUID: () => ({ toString: () => crypto.randomUUID() }) } },
  text: { Normalizer: { normalize: (text, form) => String(text).normalize(form), Form: { NFD: 'NFD' } } },
  net: { URLEncoder: { encode: text => encodeURIComponent(String(text)) } },
  time: {
    Instant: { parse(text) { const date = new Date(String(text)); if (isNaN(date)) throw new Error('bad date'); return { atZone: () => ({ getYear: () => date.getUTCFullYear(), getMonthValue: () => date.getUTCMonth() + 1, getDayOfMonth: () => date.getUTCDate(), getHour: () => date.getUTCHours(), getMinute: () => date.getUTCMinutes() }) }; } },
    ZoneId: { systemDefault: () => 'UTC' }
  }
};

function loadEngine() {
  const engine = { java: javaShim, console };
  vm.createContext(engine);
  for (const file of ['js/workflow_expr.js', 'js/workflow_store.js', 'js/workflow_engine.js']) {
    vm.runInContext(fs.readFileSync(path.join(engineRoot, file), 'utf8'), engine, { filename: file });
  }
  return engine;
}

// Each sequence of lib_WorkflowEngine: the engine function it calls, the option each variable fills, its variables
// and whether it needs a signed-in user.
function engineSequences() {
  const dir = path.join(engineRoot, '_c8oProject/sequences');
  const out = {};
  for (const file of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    const call = /WorkflowEngine\.(\w+)\(\{([\s\S]*?)\}\)/.exec(text);
    if (!call) continue;
    const options = {};
    for (const match of call[2].matchAll(/(\w+):\s*(\w+)/g)) options[match[2]] = match[1];
    out[file.replace(/\.yaml$/, '')] = {
      fn: call[1],
      options,
      variables: [...text.matchAll(/^↓(\w+) \[variables\.RequestableVariable/gm)].map(m => m[1]),
      authenticated: /^authenticatedContextRequired: true$/m.test(text),
      accessibility: (/^accessibility: (\w+)$/m.exec(text) || [])[1] || 'Public'
    };
  }
  return out;
}

// ------------------------------------------------------------------ a server: the engine, its store, the MCP side

function server(options = {}) {
  const engine = loadEngine();
  const WorkflowEngine = engine.WorkflowEngine;
  const sequences = engineSequences();
  const ctx = {
    store: new engine.WorkflowStore.MemoryStore(), actor: null, roles: [], studio: true, projectDir: engineRoot,
    symbols: Object.assign({}, options.symbols || {}),
    templateProjects: fs.existsSync(path.join(sampleRoot, 'workflows/definitions')) ? [{ name: 'WorkflowSampleSupplier', dir: path.join(sampleRoot, 'workflows/definitions') }] : [],
    catalog: () => clone(options.catalog || { projects: [] }),
    c8oforms: () => null
  };
  WorkflowEngine.__setTestContext(ctx);
  const state = { calls: [], sessions: [], contextsRemoved: 0, loaded: options.loaded || ['lib_ConvertigoMCP', 'lib_WorkflowEngine'] };

  // Runs an engine function as a user: what a sequence called by a signed-in session runs.
  function asUser(user, roles, fn, opts) {
    ctx.actor = user;
    ctx.roles = roles || [];
    return WorkflowEngine.sequence(() => WorkflowEngine[fn](opts || {}));
  }

  class Session {
    constructor() { this.attributes = {}; this.invalidated = false; state.sessions.push(this); }
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    invalidate() { this.invalidated = true; }
  }
  class InternalHttpServletRequest {
    constructor(session) { this.session = session || null; }
    getSession(create) { if (!this.session && create) this.session = new Session(); return this.session; }
  }
  class HashMap {
    constructor() { this.values = {}; }
    put(key, value) { this.values[key] = value; }
    get(key) { return this.values[key]; }
  }
  class InternalRequester {
    constructor(params, request) { this.params = params.values; this.request = request; }
    processRequest() {
      const params = this.params;
      const name = params.__sequence;
      const session = this.request.getSession(false);
      const user = session ? session.getAttribute('authenticatedUser') : null;
      state.calls.push({ project: params.__project, sequence: name, user, params: clone(params) });
      assert.equal(params.__project, 'lib_WorkflowEngine', 'the tools call lib_WorkflowEngine only');
      assert.equal(params.__removeContext, 'true');
      const sequence = sequences[name];
      assert.ok(sequence, 'no sequence ' + name + ' in lib_WorkflowEngine');
      assert.notEqual(sequence.accessibility, 'Private', name + ' is Private: the tools call only what a signed-in user may call');
      const opts = {};
      for (const key of Object.keys(params)) {
        if (key.startsWith('__')) continue;
        assert.ok(sequence.variables.includes(key), name + ' has no variable ' + key + ' (it has ' + sequence.variables.join(', ') + ')');
        assert.equal(typeof params[key], 'string', name + '.' + key + ' is sent as a text');
        opts[sequence.options[key] || key] = params[key];
      }
      let envelope;
      if (sequence.authenticated && !user) {
        envelope = { error: { message: 'Authentication required' } };
      } else {
        // the session carries no role: the engine resolves them (roles sequence, symbols)
        ctx.actor = user;
        ctx.roles = session && session.getAttribute('lib_WorkflowEngine.roles') ? JSON.parse(session.getAttribute('lib_WorkflowEngine.roles')) : [];
        envelope = { response: WorkflowEngine.sequence(() => WorkflowEngine[sequence.fn](opts)) };
      }
      // the typed XML of the engine comes back as the same JSON (checked live)
      return { getDocumentElement: () => JSON.stringify(clone(envelope)) };
    }
    getContext() { return {}; }
  }
  const SessionAttribute = { authenticatedUser: {
    set: (session, value) => session.setAttribute('authenticatedUser', value),
    remove: session => session.removeAttribute('authenticatedUser')
  } };
  const names = () => ({ size: () => state.loaded.length, get: i => state.loaded[i] });
  const engineApi = {
    Engine: { theApp: { databaseObjectsManager: { getAllProjectNamesList: names }, contextManager: { remove() { state.contextsRemoved++; } } } },
    requesters: { InternalHttpServletRequest, InternalRequester },
    util: { XMLUtils: { XmlToJson: element => element } },
    enums: { JsonOutput: { JsonRoot: { docChildNodes: 'docChildNodes' } }, SessionAttribute }
  };
  const mcp = {
    Packages: { com: { twinsoft: { convertigo: { engine: engineApi } } }, java: { util: { HashMap, UUID: javaShim.util.UUID } } },
    java: javaShim,
    context: { httpServletRequest: {} },
    C8O: { mcpAuth: { authenticateRequest: () => clone(options.auth || { authenticated: true, kind: 'durable', user: TOKEN_USER }) } }
  };
  vm.createContext(mcp);
  vm.runInContext(read('js/workflow_tools.js'), mcp, { filename: 'workflow_tools.js' });
  const tools = mcp.C8O.workflowTools;
  // Arguments reach a tool sequence as texts (objects as JSON), as internal_call passes them.
  const call = (tool, args = {}) => {
    const texts = {};
    for (const [key, value] of Object.entries(args)) texts[key] = value === null || value === undefined ? null : (typeof value === 'object' ? JSON.stringify(value) : String(value));
    return JSON.parse(JSON.stringify(tools[tool](texts)));
  };
  return { call, state, ctx, asUser, WorkflowEngine, tools };
}

const DESIGNER = { 'lib_WorkflowEngine.designers': TOKEN_USER };
const ADMIN = { 'lib_WorkflowEngine.admins': TOKEN_USER };
const template = key => JSON.parse(fs.readFileSync(path.join(engineRoot, 'workflows/definitions', key + '.json'), 'utf8'));

// ------------------------------------------------------------------ identity and rights

test('without lib_WorkflowEngine every tool says so and calls nothing', { skip }, () => {
  const s = server({ loaded: ['lib_ConvertigoMCP'] });
  for (const tool of ['list', 'get', 'draftCreate', 'draftPut', 'validate', 'simulate', 'publish', 'requests', 'catalog']) {
    const out = s.call(tool, { workflowKey: 'x' });
    assert.equal(out.status, 'unavailable', tool);
    assert.equal(out.error.code, 'workflow_engine_missing', tool);
    assert.match(out.error.message, /convertigo:\/\/resources\/convertigo-workflow/);
  }
  assert.equal(s.state.calls.length, 0);
});

test('a call without a valid Studio token reaches no sequence', { skip }, () => {
  for (const [auth, status, code] of [
    [{ authenticated: false, error: { code: 'missing_token', message: 'An MCP bearer token is required.' } }, 'auth_required', 'missing_token'],
    [{ authenticated: true, kind: 'nocode', user: 'someone@example.invalid' }, 'forbidden', 'studio_token_required'],
    [{ authenticated: true, kind: 'durable', user: ' ' }, 'auth_required', 'token_without_user']
  ]) {
    const s = server({ auth, symbols: DESIGNER });
    const out = s.call('list');
    assert.equal(out.status, status);
    assert.equal(out.error.code, code);
    assert.equal(s.state.calls.length, 0);
  }
});

test('the engine sees the token user in a session of the call, with no role of its own; the session is closed', { skip }, () => {
  const s = server();
  const out = s.call('list');
  assert.equal(out.status, 'forbidden');
  assert.deepEqual(out.actor, { user: TOKEN_USER, roles: [], isDesigner: false, isAdmin: false, studio: true, engineVersion: s.WorkflowEngine.version });
  assert.match(out.error.hint, /c8o:admin, who has no WorkflowDesigner or WorkflowAdmin role/);
  assert.match(out.error.hint, /lib_WorkflowEngine\.designers/);
  assert.deepEqual(s.state.calls.map(c => [c.sequence, c.user]), [['workflowSessionGet', TOKEN_USER], ['workflowDraftList', TOKEN_USER]]);
  assert.equal(s.state.sessions.length, 1, 'one internal session per tool call, shared by its sequence calls');
  assert.equal(s.state.sessions[0].getAttribute('authenticatedUser'), null, 'signed out at the end');
  assert.equal(s.state.sessions[0].getAttribute('lib_WorkflowEngine.roles'), null, 'the tools never set roles');
  assert.equal(s.state.sessions[0].invalidated, true);
  assert.equal(s.state.contextsRemoved, 2);
  // a startable list needs no role
  assert.equal(s.call('list', { view: 'startable' }).status, 'ok');
});

test('the roles are the engine ones: designers and admins symbols, or the roles sequence', { skip }, () => {
  let s = server({ symbols: DESIGNER });
  let out = s.call('list');
  assert.equal(out.status, 'ok');
  assert.deepEqual(out.actor.roles, ['WorkflowDesigner']);
  assert.ok(out.templates.some(t => t.templateKey === 'purchase-request'));
  s = server({ symbols: { 'lib_WorkflowEngine.rolesSequence': 'App.rolesOf' } });
  s.ctx.callSequence = (name, input) => { assert.equal(name, 'App.rolesOf'); assert.equal(input.user, TOKEN_USER); return { roles: ['workflowadmin'] }; };
  out = s.call('list');
  assert.equal(out.status, 'ok');
  assert.equal(out.actor.isAdmin, true);
});

test('the tools call only the sequences a signed-in user calls, never the developer login nor a role setter', { skip }, () => {
  const s = server({ symbols: Object.assign({}, DESIGNER, ADMIN) });
  s.call('list');
  s.call('draftCreate', { templateKey: 'purchase-request' });
  s.call('get', { workflowKey: 'purchase-request' });
  s.call('validate', { workflowKey: 'purchase-request' });
  s.call('simulate', { workflowKey: 'purchase-request' });
  s.call('simulate', { workflowKey: 'purchase-request', event: 'submit' });
  s.call('draftPut', { workflowKey: 'purchase-request', expectedRevision: 1, patch: { title: 'P' } });
  s.call('publish', { workflowKey: 'purchase-request', expectedRevision: 2 });
  s.call('publish', { workflowKey: 'purchase-request', expectedRevision: 2, confirm: true });
  s.call('requests', {});
  s.call('catalog', {});
  const used = new Set(s.state.calls.map(c => c.sequence));
  for (const forbidden of ['workflowDevLogin', 'workflowSessionSetRoles', 'workflowStartAs', 'workflowSignalAs', 'workflowDefinitionPut', 'workflowStart', 'workflowSignal', 'workflowCancel']) {
    assert.ok(!used.has(forbidden), forbidden + ' must not be called');
  }
  assert.ok(s.state.calls.every(c => c.user === TOKEN_USER));
});

// ------------------------------------------------------------------ drafts

test('a draft created from a template comes back as the template, with the revision to edit it at', { skip }, () => {
  const s = server({ symbols: DESIGNER });
  const created = s.call('draftCreate', { templateKey: 'purchase-request', workflowKey: 'buy' });
  assert.equal(created.status, 'ok');
  assert.equal(created.draftRevision, 1);
  assert.equal(created.validation.valid, true);
  assert.match(created.next, /expectedRevision 1/);
  const expected = Object.assign(template('purchase-request'), { workflowKey: 'buy' });
  assert.deepEqual(created.definition, expected);
  const read = s.call('get', { workflowKey: 'buy' });
  assert.deepEqual(read.definition, expected);
  assert.equal(read.source, 'draft');
  assert.equal(read.definitionText, undefined, 'no second copy of the definition');
  assert.equal(s.call('draftCreate', { workflowKey: 'buy' }).error.hint, 'Choose another workflowKey, or read and edit the existing workflow (workflow-get).');
  assert.equal(s.call('draftCreate', { templateKey: 'purchase-request', definition: { a: 1 } }).error.code, 'bad_argument');
  assert.equal(s.call('draftCreate', { definition: [1] }).error.code, 'bad_argument');
  const blank = s.call('draftCreate', { title: 'Équipe congés' });
  assert.equal(blank.workflowKey, 'equipe-conges');
  assert.equal(blank.validation.valid, true);
  const fromForm = s.call('draftCreate', { fromForm: '123' });
  assert.equal(fromForm.error.code, 'c8oforms_missing');
  // with C8Oforms: the engine reads the published form itself (here none), the tool names it as the engine wants it
  const forms = server({ symbols: DESIGNER, loaded: ['lib_ConvertigoMCP', 'lib_WorkflowEngine', 'C8Oforms'] });
  forms.ctx.c8oformDoc = id => { assert.equal(id, 'published_123'); return null; };
  const missing = forms.call('draftCreate', { fromForm: '123', circuit: 'two-levels', language: 'fr' });
  assert.equal(missing.status, 'not_found');
  const sent = forms.state.calls.find(c => c.sequence === 'workflowDraftCreate').params;
  assert.deepEqual([sent.fromForm, sent.circuit, sent.language], ['published_123', 'two-levels', 'fr']);
});

test('draft-put saves a whole definition or a merge patch at the revision read, and refuses a stale one', { skip }, () => {
  const s = server({ symbols: DESIGNER });
  s.call('draftCreate', { templateKey: 'purchase-request', workflowKey: 'buy' });
  const patched = s.call('draftPut', { workflowKey: 'buy', expectedRevision: 1, patch: { title: 'Achats', states: { managerReview: { color: 'purple', reminder: null } }, fields: { orderNumber: null } } });
  assert.equal(patched.status, 'ok');
  assert.equal(patched.draftRevision, 2);
  const after = s.call('get', { workflowKey: 'buy' }).definition;
  assert.equal(after.title, 'Achats');
  assert.equal(after.states.managerReview.color, 'purple');
  assert.equal(after.states.managerReview.reminder, undefined);
  assert.equal(after.states.managerReview.label, 'Manager review', 'the rest of the state is kept');
  assert.equal(after.fields.orderNumber, undefined);
  // the validator of the engine runs on every save: the field removed is still shown by a state
  assert.ok(patched.validation.warnings.some(w => /orderNumber/.test(w.message) && /^states\.ordered/.test(w.path)));
  // stale revision: nothing saved
  for (const args of [{ patch: { title: 'Late' } }, { definition: after }]) {
    const stale = s.call('draftPut', Object.assign({ workflowKey: 'buy', expectedRevision: 1 }, args));
    assert.equal(stale.status, 'conflict');
    assert.match(stale.error.hint, /workflow-get/);
  }
  assert.equal(s.call('get', { workflowKey: 'buy' }).draftRevision, 2);
  // a whole definition
  const whole = clone(after);
  whole.fields.orderNumber = { label: 'Order number', type: 'text' };
  const saved = s.call('draftPut', { workflowKey: 'buy', expectedRevision: 2, definition: whole, notes: 'restored' });
  assert.equal(saved.draftRevision, 3);
  assert.equal(saved.validation.valid, true);
  // arguments
  assert.equal(s.call('draftPut', { workflowKey: 'buy', patch: {} }).error.code, 'bad_argument');
  assert.equal(s.call('draftPut', { workflowKey: 'buy', expectedRevision: 0, definition: whole }).error.code, 'bad_argument');
  assert.equal(s.call('draftPut', { workflowKey: 'buy', expectedRevision: 3 }).error.code, 'bad_argument');
  assert.equal(s.call('draftPut', { workflowKey: 'buy', expectedRevision: 3, definition: whole, patch: {} }).error.code, 'bad_argument');
  assert.match(s.call('draftPut', { workflowKey: 'buy', expectedRevision: 3, patch: { workflowKey: 'other' } }).error.message, /not buy/);
  assert.equal(s.call('draftPut', { workflowKey: 'nope', expectedRevision: 1, patch: { a: 1 } }).status, 'not_found');
  assert.equal(s.call('draftPut', { workflowKey: 'bad key!', expectedRevision: 1, patch: {} }).error.code, 'bad_argument');
});

test('the merge patch follows RFC 7386', { skip }, () => {
  const { tools } = server();
  const merge = (a, b) => JSON.parse(JSON.stringify(tools._mergePatch(a, b)));
  assert.deepEqual(merge({ a: 'b' }, { a: 'c' }), { a: 'c' });
  assert.deepEqual(merge({ a: 'b' }, { b: 'c' }), { a: 'b', b: 'c' });
  assert.deepEqual(merge({ a: 'b' }, { a: null }), {});
  assert.deepEqual(merge({ a: 'b', b: 'c' }, { a: null }), { b: 'c' });
  assert.deepEqual(merge({ a: ['b'] }, { a: 'c' }), { a: 'c' });
  assert.deepEqual(merge({ a: 'c' }, { a: ['b'] }), { a: ['b'] });
  assert.deepEqual(merge({ a: { b: 'c' } }, { a: { b: 'd', c: null } }), { a: { b: 'd' } });
  assert.deepEqual(merge({ a: [{ b: 'c' }] }, { a: [1] }), { a: [1] });
  assert.deepEqual(merge({ e: null }, { a: 1 }), { e: null, a: 1 });
  assert.deepEqual(merge({}, { a: { bb: { ccc: null } } }), { a: { bb: {} } });
});

test('validate checks the saved draft or a definition not saved', { skip }, () => {
  const s = server({ symbols: DESIGNER });
  s.call('draftCreate', { templateKey: 'sample-approval', workflowKey: 'appr' });
  const saved = s.call('validate', { workflowKey: 'appr' });
  assert.equal(saved.valid, true);
  assert.equal(saved.source, 'draft');
  const inline = s.call('validate', { definition: { workflowKey: 'x', initialState: 'a', states: { a: { on: { go: { target: 'nowhere' } } } } } });
  assert.equal(inline.valid, false);
  assert.ok(inline.errors.every(e => typeof e.path === 'string' && e.message));
  assert.equal(inline.source, 'inline');
  assert.equal(s.call('validate', {}).error.code, 'bad_argument');
  assert.equal(s.call('validate', { workflowKey: 'appr', definition: {} }).error.code, 'bad_argument');
  assert.equal(server().call('validate', { workflowKey: 'appr' }).status, 'forbidden');
});

// ------------------------------------------------------------------ simulation

test('simulate shows a state, tries an action and chains a path without saving anything', { skip }, () => {
  const s = server({ symbols: DESIGNER });
  s.call('draftCreate', { templateKey: 'purchase-request', workflowKey: 'buy' });
  const before = clone(s.ctx.store.docs);
  const screen = s.call('simulate', { workflowKey: 'buy', state: 'managerReview', data: { item: 'Desk', quantity: 2, unitPrice: 300 } });
  assert.equal(screen.status, 'ok');
  assert.equal(screen.screen.state.key, 'managerReview');
  assert.deepEqual(screen.screen.actions.map(a => a.event).sort(), ['approve', 'escalate', 'reject']);
  assert.ok(screen.screen.actions.find(a => a.event === 'reject').fields.some(f => f.name === 'decisionNote' && f.required));
  // one action, from the initial state: the automatic routing is applied
  const routed = s.call('simulate', { workflowKey: 'buy', state: 'managerReview', data: { item: 'Desk', quantity: 2, unitPrice: 300 }, event: 'approve' });
  assert.equal(routed.steps[0].allowed, true);
  assert.equal(routed.reached.state, routed.steps[0].toState);
  assert.equal(routed.completed, true);
  // a refused action stops the path, with the errors of the form
  const refused = s.call('simulate', { workflowKey: 'buy', state: 'managerReview', path: [{ event: 'reject' }, { event: 'approve' }] });
  assert.equal(refused.steps.length, 1);
  assert.equal(refused.steps[0].allowed, false);
  assert.equal(refused.steps[0].code, 'VALIDATION');
  assert.ok(refused.steps[0].details.fields.decisionNote);
  assert.equal(refused.completed, false);
  assert.equal(refused.reached.state, 'managerReview');
  assert.equal(refused.reached.status, 'unchanged');
  // a path: each action from where the previous one led
  const chained = s.call('simulate', { workflowKey: 'buy', state: 'managerReview', data: { item: 'Desk', quantity: 2, unitPrice: 300 }, path: [{ event: 'approve' }, { event: 'ordered', payload: { orderNumber: 'PO-1' } }] });
  assert.deepEqual(chained.steps.map(step => [step.fromState, step.toState, step.allowed]), [['managerReview', 'ordering', true], ['ordering', 'ordered', true]]);
  assert.equal(chained.completed, true);
  assert.equal(chained.reached.state, 'ordered');
  assert.equal(chained.reached.data.orderNumber, 'PO-1');
  assert.equal(chained.from.state, 'managerReview');
  assert.ok(chained.steps[0].moves[0].kind);
  // from the initial state, the automatic routing chooses the review by the total
  const big = s.call('simulate', { workflowKey: 'buy', state: 'needInfo', data: { item: 'Server' }, event: 'answer', payload: { quantity: 1, unitPrice: 5000 } });
  assert.equal(big.steps[0].allowed, true, JSON.stringify(big.steps[0]));
  assert.ok(big.steps[0].moves.length > 1 && big.steps[0].moves.some(move => move.kind !== 'transition'), 'the automatic routing is told');
  assert.equal(big.reached.state, 'financeReview', '5000 EUR goes to finance');
  assert.equal(JSON.stringify(s.ctx.store.docs), JSON.stringify(before), 'nothing saved');
  assert.equal(s.call('simulate', { workflowKey: 'buy', path: [{ payload: {} }] }).error.code, 'bad_argument');
  assert.equal(s.call('simulate', { workflowKey: 'buy', path: new Array(21).fill({ event: 'x' }) }).error.code, 'bad_argument');
  assert.equal(s.call('simulate', { workflowKey: 'buy', event: 'a', path: [{ event: 'b' }] }).error.code, 'bad_argument');
  assert.equal(s.call('simulate', { workflowKey: 'buy', source: 'nope' }).error.code, 'bad_argument');
  assert.equal(s.call('simulate', { instanceId: 'x' }).error.code, 'bad_argument');
  assert.equal(s.call('simulate', { definition: template('sample-approval') }).status, 'ok');
  assert.equal(s.call('simulate', { workflowKey: 'buy', source: 'published' }).status, 'not_found');
  assert.equal(s.call('simulate', { workflowKey: 'buy', version: 1 }).status, 'not_found');
  const sent = s.state.calls[s.state.calls.length - 1].params;
  assert.deepEqual([sent.version, sent.useDraft], ['1', undefined], 'a version means a published one');
});

// ------------------------------------------------------------------ publication

test('publish needs the confirmation and the revision the user checked; the engine refuses an invalid draft', { skip }, () => {
  const s = server({ symbols: DESIGNER });
  s.call('draftCreate', { templateKey: 'purchase-request', workflowKey: 'buy' });
  const ask = s.call('publish', { workflowKey: 'buy', expectedRevision: 1 });
  assert.equal(ask.status, 'confirmation_required');
  assert.equal(ask.published, false);
  assert.equal(ask.draftRevision, 1);
  assert.ok(!s.state.calls.some(c => c.sequence === 'workflowDraftPublish'), 'nothing reaches the publication without confirm');
  assert.equal(s.call('publish', { workflowKey: 'buy', expectedRevision: 1, confirm: 'false' }).status, 'confirmation_required');
  assert.equal(s.call('publish', { workflowKey: 'buy', confirm: true }).error.code, 'bad_argument');
  const stale = s.call('publish', { workflowKey: 'buy', expectedRevision: 5, confirm: true });
  assert.equal(stale.status, 'conflict');
  assert.equal(stale.published, false);
  s.call('draftPut', { workflowKey: 'buy', expectedRevision: 1, patch: { initialState: 'nowhere' } });
  const invalid = s.call('publish', { workflowKey: 'buy', expectedRevision: 2, confirm: true });
  assert.equal(invalid.status, 'invalid');
  assert.equal(invalid.validation.valid, false);
  assert.equal(invalid.error.details, undefined);
  s.call('draftPut', { workflowKey: 'buy', expectedRevision: 2, patch: { initialState: 'routing' } });
  const published = s.call('publish', { workflowKey: 'buy', expectedRevision: 3, confirm: true, notes: 'first' });
  assert.equal(published.status, 'ok');
  assert.equal(published.published, true);
  assert.equal(published.publishedVersion, 1);
  assert.equal(published.publishedBy, TOKEN_USER);
  const again = s.call('publish', { workflowKey: 'buy', expectedRevision: 3, confirm: true });
  assert.equal(again.unchanged, true);
  assert.equal(again.published, false);
  const version = s.call('get', { workflowKey: 'buy', version: 'published' });
  assert.equal(version.version, 1);
  assert.equal(version.notes, 'first');
  assert.equal(s.call('get', { workflowKey: 'buy', version: '1' }).current, true);
  assert.equal(s.call('get', { workflowKey: 'buy', version: '9' }).status, 'not_found');
  assert.equal(s.call('get', { workflowKey: 'buy', version: 'latest' }).error.code, 'bad_argument');
  assert.equal(server().call('publish', { workflowKey: 'buy', expectedRevision: 1, confirm: true }).status, 'forbidden');
  const startable = s.call('list', { view: 'startable' });
  assert.deepEqual(startable.workflows.map(w => [w.workflowKey, w.version]), [['buy', 1]]);
});

// ------------------------------------------------------------------ requests

test('requests are read with the rights of the token user', { skip }, () => {
  const s = server({ symbols: DESIGNER });
  s.call('draftCreate', { templateKey: 'sample-approval', workflowKey: 'appr' });
  s.call('publish', { workflowKey: 'appr', expectedRevision: 1, confirm: true });
  const started = s.asUser('alice', [], 'start', { workflowKey: 'appr', input: JSON.stringify({ title: 'Laptop', amount: 900, currency: 'EUR' }) });
  assert.equal(started.ok, true, JSON.stringify(started.error));
  const id = started.result.instance.instanceId;
  const denied = s.call('requests', { instanceId: id });
  assert.equal(denied.status, 'forbidden');
  assert.match(denied.error.hint, /acts as c8o:admin/);
  assert.equal(s.call('requests', { scope: 'all' }).status, 'forbidden');
  assert.deepEqual(s.call('requests', {}).items, []);
  // the same user once the engine makes it an administrator
  s.ctx.symbols['lib_WorkflowEngine.admins'] = TOKEN_USER;
  const admin = s;
  const one = admin.call('requests', { instanceId: id });
  assert.equal(one.status, 'ok');
  assert.equal(one.instance.createdBy, 'alice');
  assert.ok(one.screen && one.screen.state.key);
  assert.ok(Array.isArray(one.timeline));
  const all = admin.call('requests', { scope: 'all', limit: 500 });
  assert.equal(all.items.length, 1);
  assert.equal(all.limit, 200, 'at most 200 a page');
  assert.equal(admin.call('requests', { scope: 'mine' }).error.code, 'bad_argument');
  const dry = admin.call('simulate', { instanceId: id, event: one.screen.actions[0].event });
  assert.equal(dry.source, 'request');
  assert.equal(admin.call('requests', { instanceId: id }).instance.version, one.instance.version, 'a dry run moves nothing');
});

// ------------------------------------------------------------------ catalog

test('catalog gives what a workflow can orchestrate, without the agent stack', { skip }, () => {
  const catalog = { projects: [
    { name: 'lib_ConvertigoMCP', sequences: [{ name: 'tools_x', qname: 'lib_ConvertigoMCP.tools_x', accessibility: 'Private', authenticated: false, variables: [] }], app: null },
    { name: 'lib_WorkflowEngine', sequences: [{ name: 'workflowStart', qname: 'lib_WorkflowEngine.workflowStart', accessibility: 'Hidden', authenticated: true, variables: [] }], app: null },
    { name: 'Erp', sequences: [
      { name: 'checkBudget', qname: 'Erp.checkBudget', comment: 'Checks the budget', accessibility: 'Private', authenticated: false, variables: [{ name: 'amount' }] },
      { name: 'listOrders', qname: 'Erp.listOrders', accessibility: 'Hidden', authenticated: true, variables: [] }
    ], app: { pages: [{ name: 'Expense', route: 'expense/:instanceId', title: 'Expense' }], components: [{ name: 'Review', qname: 'Erp.Review', inputs: ['instanceId'] }] } }
  ] };
  const s = server({ symbols: DESIGNER, catalog });
  const all = s.call('catalog');
  assert.deepEqual(all.projects.map(p => p.name), ['Erp']);
  assert.deepEqual([...all.notListed], ['lib_ConvertigoMCP', 'lib_WorkflowEngine']);
  assert.equal(all.truncated, undefined);
  const erp = all.projects[0];
  assert.deepEqual(erp.sequences.map(q => [q.qname, q.serviceReady, q.variables]), [['Erp.checkBudget', true, ['amount']], ['Erp.listOrders', false, []]]);
  assert.deepEqual(erp.pages, [{ name: 'Expense', route: 'expense/:instanceId', title: 'Expense' }]);
  assert.deepEqual(erp.components, [{ qname: 'Erp.Review', inputs: ['instanceId'] }]);
  assert.equal(all.c8oforms, null);
  const pages = s.call('catalog', { kind: 'pages' });
  assert.deepEqual(Object.keys(pages.projects[0]).sort(), ['name', 'pages']);
  assert.deepEqual(s.call('catalog', { search: 'budget' }).projects[0].sequences.map(q => q.qname), ['Erp.checkBudget']);
  assert.equal(s.call('catalog', { project: 'lib_ConvertigoMCP' }).projects[0].name, 'lib_ConvertigoMCP');
  const small = s.call('catalog', { limit: 2 });
  assert.equal(small.truncated, true);
  assert.match(small.hint, /narrow with project, kind or search/);
  assert.equal(small.projects[0].sequences.length + (small.projects[0].pages || []).length + (small.projects[0].components || []).length, 2);
  assert.equal(s.call('catalog', { kind: 'flows' }).error.code, 'bad_argument');
  assert.equal(server({ catalog }).call('catalog').status, 'forbidden');
});

// ------------------------------------------------------------------ contract: sequences, schemas, aliases, docs

test('every workflow tool is a registered sequence whose variables match its input schema', () => {
  const empty = new Proxy(function () {}, { get: (_, key) => key === Symbol.toPrimitive ? () => '' : empty });
  const context = { Packages: empty, java: empty, include() {} };
  vm.runInNewContext(read('js/schema_overrides.js'), context);
  const project = read('c8oProject.yaml');
  for (const name of TOOL_SEQUENCES) {
    const seq = 'tools_workflow_' + name;
    assert.match(project, new RegExp('↓' + seq + ' \\[sequences\\.GenericSequence\\]: 🗏 sequences/' + seq + '\\.yaml'));
    const yaml = read('_c8oProject/sequences/' + seq + '.yaml');
    assert.match(yaml, /^accessibility: Private$/m);
    assert.match(yaml, /include\("js\/mcp_auth\.js"\);\s*include\("js\/workflow_tools\.js"\);/);
    const variables = [...yaml.matchAll(/^↓(\w+) \[variables\.RequestableVariable/gm)].map(m => m[1]);
    const required = [...yaml.matchAll(/^↓(\w+) \[variables\.RequestableVariable[^\n]*\n(?:  [^\n]*\n)*?  required: true$/gm)].map(m => m[1]);
    const schema = context.C8O.schemaOverrides.applyInput(seq);
    assert.equal(schema.additionalProperties, false, seq);
    assert.deepEqual([...Object.keys(schema.properties)].sort(), variables.slice().sort(), seq + ': schema and variables');
    assert.deepEqual([...(schema.required || [])].sort(), required.sort(), seq + ': required');
    // the step passes every variable to the tool function
    for (const variable of variables) {
      assert.match(yaml, new RegExp(variable + ': typeof ' + variable + ' === "undefined" \\? null : ' + variable), seq + ' passes ' + variable);
    }
    const output = context.C8O.schemaOverrides.applyOutput(seq);
    assert.ok(output.properties.status.enum.includes('ok'));
  }
});

test('argument aliases of the workflow tools name existing arguments', () => {
  const router = read('js/mcp_endpoint_router.js');
  const block = /var ARGUMENT_ALIASES = (\{[\s\S]*?\n\});/.exec(router)[1];
  const aliases = vm.runInNewContext('(' + block + ')');
  const empty = new Proxy(function () {}, { get: (_, key) => key === Symbol.toPrimitive ? () => '' : empty });
  const context = { Packages: empty, java: empty, include() {} };
  vm.runInNewContext(read('js/schema_overrides.js'), context);
  for (const [seq, map] of Object.entries(aliases)) {
    if (!seq.startsWith('tools_workflow_')) continue;
    const properties = context.C8O.schemaOverrides.applyInput(seq).properties;
    for (const [alias, target] of Object.entries(map)) {
      assert.ok(properties[target], seq + ': ' + alias + ' -> ' + target);
      assert.ok(!properties[alias], seq + ': ' + alias + ' is an argument itself');
    }
  }
});

test('the workflow guide and prompt are indexed, routed and name the tools that exist', () => {
  const index = JSON.parse(read('resources/resources_index.json'));
  const entry = index.find(item => item.guideId === 'convertigo/workflow');
  assert.ok(entry, 'convertigo-workflow must be indexed');
  assert.equal(entry.uri, 'convertigo://resources/convertigo-workflow');
  const guide = read('resources/' + entry.file);
  const routes = JSON.parse(read('resources/convertigo_task_routes.json'));
  assert.deepEqual(routes.routes.find(route => route.id === 'workflow').required, [entry.uri]);
  const prompts = JSON.parse(read('prompts/prompts_index.json'));
  const prompt = prompts.find(item => item.name === 'convertigo-workflow');
  assert.ok(prompt, 'convertigo-workflow prompt');
  const promptText = read('prompts/' + prompt.file);
  const tools = TOOL_SEQUENCES.map(name => 'workflow-' + name.replace(/_/g, '-'));
  for (const tool of tools) {
    assert.ok(guide.includes('`' + tool + '`'), 'guide names ' + tool);
    assert.ok(entry.recommendedTools.includes(tool), 'recommendedTools has ' + tool);
  }
  for (const text of [guide, promptText]) {
    for (const marker of [/mcp__convertigo__/, /Convertigo_[a-z]/]) {
      assert.doesNotMatch(text, marker);
    }
  }
  // every workflow tool it names exists
  for (const match of guide.matchAll(/`(workflow-[a-z-]+)`/g)) {
    assert.ok(tools.includes(match[1]), 'unknown tool ' + match[1] + ' in the guide');
  }
  assert.match(read('TOOLS.md'), /`workflow-publish`/);
});
