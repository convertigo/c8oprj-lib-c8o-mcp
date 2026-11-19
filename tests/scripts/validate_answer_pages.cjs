// A tool answer a client cannot show whole comes in pages (js/mcp_answer_pages.js): Vibe 3.1 sets aside an answer over
// 16,000 characters, weighing a script's return as JSON indented by 2, and a No Code agent cannot read the file it saves
// (test-nocode: nocode-form-contract-get, the agent returned only the keys of the answer and was stuck). mcp_endpoint
// measures each tool answer as delivered (its text, its structured content indented), keeps one over the budget for the
// caller's bearer and answers its first page; answer-page gives the others.
// node --test tests/scripts/validate_answer_pages.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { formsEngine, hasContract } = require('../helpers/c8oforms_contract.cjs');
const { skillText } = require('../helpers/nocode_skill.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const endpoint = read('_c8oProject/sequences/mcp_endpoint.yaml');

// The parts of java.util.concurrent.ConcurrentHashMap the store uses.
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
    return { iterator: () => ({
      hasNext: () => at + 1 < keys.length,
      next: () => { at++; const key = keys[at]; return { getKey: () => key, getValue: () => map.get(key) }; },
      remove: () => map.delete(keys[at])
    }) };
  }
}

function pagesApi({ now = 1_000_000, auth = { authenticated: true, kind: 'nocode', user: 'testuser' } } = {}) {
  const clock = { now };
  const logs = [];
  const ctx = { C8O: { mcpAuth: { authenticateRequest: () => auth } } };
  vm.createContext(ctx);
  vm.runInContext(read('js/mcp_answer_pages.js'), ctx);
  const api = ctx.C8O.mcpAnswerPages;
  api.host = {
    now: () => clock.now,
    randomId: () => crypto.randomBytes(16).toString('hex'),
    digest: value => crypto.createHash('sha256').update(value).digest('hex'),
    newMap: () => new FakeMap(),
    warn: message => logs.push('warn ' + message),
    info: message => logs.push('info ' + message)
  };
  return { api, clock, logs };
}

function server() {
  const values = {};
  return { get: key => (key in values ? values[key] : null), set: (key, value) => { values[key] = value; }, values };
}

function caller(store, authorization = 'Bearer token-of-testuser') {
  return { server: store, httpServletRequest: { getHeader: name => (name === 'Authorization' ? authorization : null) } };
}

const indented = value => JSON.stringify(value, null, 2).length;
// What a client gets of an answer: the text of a direct call and the structured content of a script, indented.
const delivered = (api, page, guidance, jsonOnly) => Math.max(jsonOnly ? 0 : api.deliveredText(page, guidance).length, indented(page));

// A large answer with what JSON escapes: quotes, backslashes, newlines, control characters, emoji, a long string
// without any comma, and deep nesting.
function bigAnswer(size = 60) {
  const rows = Array.from({ length: size * 10 }, (_, i) => ({ id: i, name: 'Row "' + i + '" \\ é', note: 'line\nnext\ttab\u0001', emoji: '😀🎉', nested: { a: { b: { c: [i, i + 1] } } } }));
  return { status: 'ok', rows, long: 'x'.repeat(20000) + '😀' + 'y'.repeat(9000), quotes: '"'.repeat(5000) };
}

// The answer a client gets, following every page: the texts joined, then parsed.
function readAll(api, context, first) {
  const partial = first.partialAnswer;
  let text = partial.text;
  const pages = [first];
  for (let page = 2; page <= partial.pages; page++) {
    const next = api.execute(context, { answerId: partial.answerId, page });
    pages.push(next);
    text += next.partialAnswer.text;
  }
  return { value: JSON.parse(text), pages };
}

test('an answer within the budget goes out as it is', () => {
  const { api } = pagesApi();
  const store = server();
  const small = { status: 'ok', items: Array.from({ length: 50 }, (_, i) => ({ i })) };
  assert.equal(api.bound(caller(store), { sequence: 'tools_nocode_form_get', value: small }), null);
  assert.equal(store.get(api.STORE_KEY), null, 'nothing kept');
});

test('an answer over the budget answers its first page; the pages joined give the answer back', () => {
  const { api, logs } = pagesApi();
  const store = server();
  const context = caller(store);
  const value = bigAnswer();
  const first = api.bound(context, { sequence: 'tools_nocode_form_contract_get', value, argumentWarning: 'Ignored argument foo', operatorNote: 'Use the blue theme', guidanceWarning: '' });
  assert.ok(first, 'paged');
  const page1 = first.structured;
  assert.equal(page1.argumentWarning, 'Ignored argument foo', 'the notes of the call are on the first page');
  assert.equal(page1.operatorNote, 'Use the blue theme');
  const partial = page1.partialAnswer;
  assert.equal(partial.tool, 'nocode-form-contract-get');
  assert.match(partial.answerId, /^[0-9a-f]{32}$/);
  assert.equal(partial.page, 1);
  assert.ok(partial.pages >= 5, 'pages ' + partial.pages);
  assert.match(partial.howTo, /answer-page \{answerId, page\}/);
  assert.match(partial.howTo, /JSON\.parse/);
  assert.equal(partial.next, 'answer-page ' + JSON.stringify({ answerId: partial.answerId, page: 2 }));
  assert.equal(first.text, JSON.stringify(page1), 'the text content is the same first page');
  const { value: back, pages } = readAll(api, context, page1);
  // what the structured content would have been: the notes, then the answer
  assert.deepEqual(back, JSON.parse(JSON.stringify(api.answerValue(value, 'Ignored argument foo', 'Use the blue theme', ''))));
  assert.deepEqual(Object.keys(back).slice(0, 2), ['operatorNote', 'argumentWarning']);
  for (const page of pages) {
    assert.ok(delivered(api, page) <= api.PAGE_ROOM, 'page ' + page.partialAnswer.page + ': ' + delivered(api, page));
  }
  assert.equal(pages[pages.length - 1].partialAnswer.last, true);
  assert.equal(pages[pages.length - 1].partialAnswer.next, undefined);
  assert.ok(logs.some(line => /answer of nocode-form-contract-get paged/.test(line)));
});

test('the pages fit with a guidance warning and with jsonOnly, and a page stays readable', () => {
  const { api } = pagesApi();
  const store = server();
  const context = caller(store);
  for (const [guidance, jsonOnly] of [['stale guidance version', false], ['', true]]) {
    const first = api.bound(context, { sequence: 'tools_project_brief', value: bigAnswer(30), guidanceWarning: guidance, jsonOnly });
    assert.ok(first);
    if (guidance) assert.match(first.text, /^\{"convertigoGuidanceWarning":"stale guidance version"/);
    const { pages } = readAll(api, context, first.structured);
    for (const page of pages.slice(0, 1)) assert.ok(delivered(api, page, guidance, jsonOnly) <= api.PAGE_ROOM);
  }
  // pieces end between two values when they can
  const rows = { rows: Array.from({ length: 3000 }, (_, i) => ({ id: i, label: 'label ' + i })) };
  const first = api.bound(context, { sequence: 'tools_sql_select', value: rows }).structured;
  const { pages } = readAll(api, context, first);
  for (const page of pages.slice(0, -1)) assert.match(page.partialAnswer.text, /,$/, 'a piece ends after a comma');
});

test('the structured content counts: indented nesting or jsonOnly pages an answer whose text is short', () => {
  const { api } = pagesApi();
  // a grid of digits: 2 characters each in the text, a line each once indented
  const nested = { status: 'ok', grid: Array.from({ length: 40 }, () => Array.from({ length: 60 }, (_, i) => i % 10)) };
  assert.ok(JSON.stringify(nested).length < api.BUDGET, 'its text fits: ' + JSON.stringify(nested).length);
  assert.ok(indented(nested) > api.BUDGET, 'indented it does not: ' + indented(nested));
  const store = server();
  const first = api.bound(caller(store), { sequence: 'tools_databaseobject_tree_get', value: nested });
  assert.ok(first, 'paged on its structured content');
  assert.deepEqual(readAll(api, caller(store), first.structured).value, nested);
  // jsonOnly sends no text: only the structured content counts
  const flat = { text: 'z'.repeat(api.BUDGET - 200) };
  assert.equal(api.bound(caller(store), { sequence: 'tools_log_view', value: flat, jsonOnly: true }), null);
});

test('another caller cannot read an answer, and nobody reads it after its time', () => {
  const { api, clock } = pagesApi();
  const store = server();
  const first = api.bound(caller(store), { sequence: 'tools_nocode_form_get', value: bigAnswer(20) }).structured.partialAnswer;
  assert.throws(() => api.execute(caller(store, 'Bearer token-of-someone-else'), { answerId: first.answerId, page: 2 }), /No answer [0-9a-f]{32} to read/);
  assert.throws(() => api.execute(caller(store, ''), { answerId: first.answerId, page: 2 }), /No answer/);
  assert.equal(api.execute(caller(store), { answerId: first.answerId }).partialAnswer.page, 2, 'page 2 by default');
  assert.equal(api.execute(caller(store), { answerId: first.answerId, page: 1 }).partialAnswer.page, 1, 'page 1 again');
  assert.throws(() => api.execute(caller(store), { answerId: first.answerId, page: first.pages + 1 }), /page must be a whole number from 1 to/);
  assert.throws(() => api.execute(caller(store), { answerId: 'not-an-id', page: 2 }), /answerId is required/);
  clock.now += api.KEEP_MS - 1;
  assert.ok(api.execute(caller(store), { answerId: first.answerId, page: 2 }));
  clock.now += 2;
  assert.throws(() => api.execute(caller(store), { answerId: first.answerId, page: 2 }), /kept 10 minutes/);
  assert.equal(store.get(api.STORE_KEY).get(first.answerId), null, 'an expired answer is dropped');
  // the store keeps no bearer in clear
  const again = api.bound(caller(store), { sequence: 'tools_nocode_form_get', value: bigAnswer(20) }).structured.partialAnswer;
  assert.doesNotMatch(String(store.get(api.STORE_KEY).get(again.answerId)).split('\n').slice(0, 4).join('\n'), /token-of-testuser/);
});

test('answer-page asks a valid bearer', () => {
  const { api } = pagesApi({ auth: { authenticated: false } });
  assert.throws(() => api.execute(caller(server()), { answerId: 'a'.repeat(32), page: 2 }), /bearer token is required/);
});

test('the store is bounded in answers and size, and an answer too large is not kept', () => {
  const { api, clock } = pagesApi();
  const store = server();
  const ids = [];
  for (let i = 0; i < api.MAX_ANSWERS + 5; i++) {
    clock.now += 1000;
    ids.push(api.bound(caller(store), { sequence: 'tools_nocode_form_get', value: bigAnswer(3) }).structured.partialAnswer.answerId);
  }
  const answers = store.get(api.STORE_KEY);
  assert.equal(answers.size(), api.MAX_ANSWERS);
  assert.equal(answers.get(ids[0]), null, 'the oldest went first');
  assert.ok(answers.get(ids[ids.length - 1]));
  const limits = { chars: api.MAX_ANSWER_CHARS };
  api.MAX_ANSWER_CHARS = 30000;
  const huge = api.bound(caller(store), { sequence: 'tools_log_view', value: bigAnswer(20) });
  api.MAX_ANSWER_CHARS = limits.chars;
  const partial = huge.structured.partialAnswer;
  assert.equal(partial.kept, false);
  assert.equal(partial.answerId, undefined);
  assert.equal(partial.next, undefined);
  assert.match(partial.howTo, /too large to keep[\s\S]*narrower request/);
  assert.ok(delivered(api, huge.structured) <= api.PAGE_ROOM);
  // without the server store, the first page only
  const alone = api.bound({ server: null, httpServletRequest: null }, { sequence: 'tools_log_view', value: bigAnswer(5) });
  assert.equal(alone.structured.partialAnswer.kept, false);
});

test('answer-page is never paged again, and the guard never fails a call', () => {
  const { api, logs } = pagesApi();
  assert.equal(api.bound(caller(server()), { sequence: 'tools_answer_page', value: bigAnswer(5) }), null);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(api.bound(caller(server()), { sequence: 'tools_nocode_form_get', value: cyclic }), null);
  assert.ok(logs.some(line => /^warn answer pages:/.test(line)));
});

test('the text of a page is the text mcp_endpoint writes for an answer', () => {
  // the JsonFieldStep text of the result of a tools/call
  const line = endpoint.split('\n').find(l => l.includes("- →→: '(function (value, warning, argumentWarning, operatorNote, repeatedFailure)"));
  const expression = line.slice(line.indexOf("'") + 1, line.lastIndexOf("'")).replace(/''/g, "'");
  const { api } = pagesApi();
  const value = { status: 'ok', list: [1, 2] };
  for (const [guidance, argumentWarning, operatorNote, repeatedFailure] of [['', '', '', ''], ['stale', '', '', ''], ['', 'Ignored x', 'note', 'again'], ['stale', 'Ignored x', '', '']]) {
    const ctx = { result: value, mcpGuidanceWarning: guidance, mcpArgumentWarning: argumentWarning, mcpOperatorNote: operatorNote, mcpRepeatNote: repeatedFailure };
    const yamlText = vm.runInNewContext(expression, ctx);
    assert.equal(api.deliveredText(api.answerValue(value, argumentWarning, operatorNote, repeatedFailure), guidance), yamlText);
  }
});

test('mcp_endpoint pages a tool answer after its notes and before it builds the result', () => {
  assert.match(endpoint, /    var toolsListCacheKey = "";\n    var mcpPartialAnswer = null;\n/);
  const at = endpoint.indexOf('↓BoundAnswer [steps.SimpleStep-');
  assert.ok(at > endpoint.indexOf('C8O.mcpRepeat.failureOf(result)'));
  assert.ok(at < endpoint.indexOf('↓result [steps.JsonObjectStep-1762256093362]'));
  const bound = endpoint.slice(at, endpoint.indexOf('\n', endpoint.indexOf('expression:', at)));
  for (const name of ['sequence: callSequence', 'value: result', 'guidanceWarning: mcpGuidanceWarning', 'argumentWarning: mcpArgumentWarning', 'operatorNote: mcpOperatorNote', 'repeatedFailure: mcpRepeatNote', 'jsonOnly: notEmpty(jsonOnly)']) {
    assert.ok(bound.includes(name), name);
  }
  const partial = endpoint.slice(endpoint.indexOf('↓PartialAnswer [steps.IfStep-'), endpoint.indexOf('↓result [steps.JsonObjectStep-1762256093362]'));
  assert.match(partial, /condition: mcpPartialAnswer != null/);
  assert.match(partial, /- →→: mcpPartialAnswer\.text\n/);
  assert.match(partial, /↓structuredContent \[steps\.JsonToXmlStep-\d+\]: \n(?:.*\n){5}\s+- →→: mcpPartialAnswer\.structured\n/);
  assert.match(partial, /- →→: convertigoGuidanceWarning\n/);
  assert.match(partial, /ContentIf[^\n]*\n\s+condition: '!\(notEmpty\(jsonOnly\)/);
  assert.match(partial, /↓ReturnPartialAnswer \[steps\.ReturnStep-\d+\]: \n\s*$/);
  // the YAML keeps the space after each key of an empty value
  for (const l of partial.split('\n').filter(l => /(↓[^\]]+\]|key|value|jsonObject|xmlizable|SmartType):\s*$/.test(l))) assert.match(l, /: $/, l);
  assert.match(read('js/mcp_endpoint_router.js'), /\ninclude\("js\/mcp_answer_pages\.js"\);\n/);
});

test('answer-page is a read tool every agent may call, No Code ones included', () => {
  assert.match(read('c8oProject.yaml'), /\n  ↓tools_answer_page \[sequences\.GenericSequence\]: 🗏 sequences\/tools_answer_page\.yaml\n/);
  const sequence = read('_c8oProject/sequences/tools_answer_page.yaml');
  assert.match(sequence, /^accessibility: Private\ncomment: \|\n  Read the next page of a long tool answer\n/);
  assert.match(sequence, /C8O\.mcpAnswerPages\.execute\(context, \{answerId: answerId, page: page\}\)/);
  assert.match(sequence, /include\(\\?"js\/mcp_auth\.js\\?"\)/);
  for (const variable of ['answerId', 'page']) assert.match(sequence, new RegExp('↓' + variable + ' \\[variables\\.RequestableVariable-\\d+\\]: \\n'));
  // No Code: the profile, the token and the catalog
  const policy = { C8O: {}, context: { httpServletRequest: { getHeader: () => 'nocode' } } };
  vm.runInNewContext(read('js/nocode_tool_policy.js'), policy);
  assert.equal(policy.C8O.nocodeToolPolicy.allows('tools_answer_page'), true);
  assert.equal(policy.C8O.nocodeToolPolicy.allows('tools_nocode_form_get'), true);
  assert.equal(policy.C8O.nocodeToolPolicy.allows('tools_log_view'), false);
  for (const name of ['answer-page', 'answer_page', 'Answer.Page']) assert.equal(policy.C8O.nocodeToolPolicy.sharedToolName(name), true, name);
  assert.equal(policy.C8O.nocodeToolPolicy.sharedToolName('log-view'), false);
  assert.match(read('js/mcp_endpoint_router.js'), /&& !C8O\.nocodeToolPolicy\.sharedToolName\(normalizedRequestedTool\)\) \{/);
  assert.match(read('_c8oProject/sequences/mcp_tools_list.yaml'), /mcpAuthKind === "nocode" && seqName\.indexOf\("tools_nocode_"\) !== 0 && !C8O\.nocodeToolPolicy\.shared\(seqName\)/);
  // a read in the Studio confirm modes, allowed in a Vibe home, no gateway model
  const confirm = { C8O: {}, include() {} };
  vm.runInNewContext(read('js/studio_write_confirm.js'), confirm);
  assert.equal(confirm.C8O.studioWriteConfirm.READ_TOOLS.tools_answer_page, true);
  assert.equal(confirm.C8O.studioWriteConfirm.WRITE_TOOLS.tools_answer_page, undefined);
  assert.match(read('js/setup_vibe.js'), /"Convertigo_answer-page",/);
  assert.doesNotMatch(read('js/gateway_tool_policy.js'), /tools_answer_page/);
});

function schemaOverrides() {
  const ctx = { C8O: {}, include() {}, Packages: {}, java: {} };
  vm.createContext(ctx);
  vm.runInContext(read('js/schema_overrides_crud.js'), ctx);
  vm.runInContext(read('js/schema_overrides.js'), ctx);
  return ctx.C8O.schemaOverrides;
}

test('every output schema takes a first page, and answer-page declares its own', () => {
  const overrides = schemaOverrides();
  const input = overrides.applyInput('tools_answer_page', null, null);
  assert.deepEqual([...input.required], ['answerId']);
  assert.equal(input.additionalProperties, false);
  assert.deepEqual(Object.keys(input.properties), ['answerId', 'page']);
  const own = overrides.decorateOutput('tools_answer_page', overrides.applyOutput('tools_answer_page', null, null), null);
  assert.ok(own.properties.partialAnswer.properties.text, 'its own schema, not the generic one');
  const { api } = pagesApi();
  const page = api.bound(caller(server()), { sequence: 'tools_x_y', value: bigAnswer(5), argumentWarning: 'w' }).structured;
  for (const file of fs.readdirSync(path.join(root, '_c8oProject/sequences')).filter(f => /^tools_.*\.yaml$/.test(f))) {
    const sequence = file.replace(/\.yaml$/, '');
    const schema = overrides.decorateOutput(sequence, overrides.applyOutput(sequence, null, null), null);
    assert.equal(schema.type === undefined || schema.type === 'object', true, sequence);
    // what the MCP client of Vibe checks: no required field, and each top-level key of the page declared or allowed
    assert.ok(!schema.required || !schema.required.length, sequence + ' requires ' + schema.required);
    for (const key of Object.keys(page)) {
      assert.ok(schema.properties[key] || schema.additionalProperties !== false, sequence + ' refuses ' + key);
      if (schema.properties[key]) assert.equal(schema.properties[key].type, typeof page[key] === 'object' ? 'object' : 'string', sequence + ' ' + key);
    }
  }
});

test('a contract answer of the core, a section or a part goes out whole; the whole contract comes in pages', () => {
  const formsRoot = process.env.C8OFORMS_PROJECT_ROOT || path.resolve(root, '../C8oForms');
  if (!hasContract(formsRoot)) return;
  const empty = new Proxy(function () {}, { get: (_, key) => key === Symbol.toPrimitive ? () => '' : empty });
  class File {
    constructor(parent, child) { this.path = child ? path.join(String(parent), child) : String(parent); }
    isFile() { return fs.existsSync(this.path) && fs.statSync(this.path).isFile(); }
    getAbsolutePath() { return this.path; }
  }
  // NoCode_Contract and NoCode_Form: the No Code form contract of the C8Oforms checkout
  const contract = formsEngine(formsRoot);
  class HashMap { constructor() { this.values = {}; } put(key, value) { this.values[key] = value; } }
  class InternalRequester {
    constructor(params) { this.params = params.values; }
    processRequest() { const response = contract.sequence(this.params.__sequence, this.params); return { getDocumentElement: () => response }; }
    getContext() { return {}; }
  }
  const engine = { theApp: { databaseObjectsManager: { getOriginalProjectByName: () => contract.project() }, contextManager: { remove() {} } } };
  const packages = new Proxy(empty, { get: (_, key) => {
    if (key === 'java') return { io: { File }, util: { HashMap, Base64: empty } };
    if (key === 'com') return { twinsoft: { convertigo: { engine: { Engine: engine, requesters: { InternalRequester, InternalHttpServletRequest: class {} }, util: { XMLUtils: { XmlToJson: response => JSON.stringify(response) } }, enums: empty } } } };
    if (key === 'org') return { apache: { commons: { io: { FileUtils: { readFileToString: file => fs.readFileSync(file.path, 'utf8') } } } } };
    return empty;
  } });
  const sandbox = { Packages: packages, java: { lang: { System: { currentTimeMillis: () => 0 }, String, reflect: { Array: { newInstance: () => [] } } } } };
  vm.createContext(sandbox);
  vm.runInContext(read('js/nocode_forms.js'), sandbox);
  const forms = sandbox.C8O.nocodeForms;
  const { api } = pagesApi();
  const store = server();
  const as = value => JSON.parse(JSON.stringify(value));
  const core = as(forms.contract({}));
  // with an argument warning and a repeated failure, the core still fits
  assert.equal(api.bound(caller(store), { sequence: 'tools_nocode_form_contract_get', value: core, argumentWarning: 'Ignored argument foo: not taken by this tool.', repeatedFailure: 'This identical call already failed.' }), null);
  for (const sections of [['generationQuality'], ['baserowSources'], ['generationQuality', 'styles'], ['dynamicReferences'], ['backendActions', 'componentAuthoring']]) {
    assert.equal(api.bound(caller(store), { sequence: 'tools_nocode_form_contract_get', value: as(forms.contract({ sections })) }), null, sections.join());
  }
  const whole = as(forms.contract({ sections: ['all'] }));
  const first = api.bound(caller(store), { sequence: 'tools_nocode_form_contract_get', value: whole });
  assert.ok(first);
  assert.deepEqual(readAll(api, caller(store), first.structured).value, whole);
});

test('requestable-execute keeps a large payload whole for the pages, and a preview only past their size', () => {
  const source = read('_c8oProject/sequences/tools_requestable_execute.yaml');
  const start = source.indexOf('    function _shallowCopy(obj)');
  const end = source.indexOf('    requestableExecutionResult =', start);
  const ctx = { executionPlan: { requestable: 'Demo.listAll', isSequence: true } };
  vm.createContext(ctx);
  vm.runInContext(source.slice(start, end).replace(/''/g, "'"), ctx);
  const large = ctx._compactPayload({ document: { text: 'a'.repeat(40000) } });
  assert.equal(large.payload.text.length, 40000);
  assert.equal(large.payloadPreview, undefined);
  const huge = ctx._compactPayload({ document: { text: 'b'.repeat(1100000) } });
  assert.equal(huge.payload, undefined);
  assert.ok(JSON.stringify(huge.payloadPreview).length <= 11000);
  assert.equal(huge.truncated, true);
  assert.match(source, /var logsRoom = Math\.max\(2000, 12000 - resultChars\);/);
});

test('the guides say to return the answer itself and to read the next page or section', () => {
  const common = read('resources/convertigo_common_skill.md');
  assert.match(common, /From a script, return the answer itself or the part the task needs, never only its keys\./);
  assert.match(common, /`partialAnswer` is its first page: read pages 2 to `pages` with `answer-page` `\{answerId, page\}` and join their `text` in order before `JSON\.parse`/);
  assert.match(common, /`remaining` sections or a next page says what to ask in the next call/);
  const summary = read('resources/convertigo-nocode/SKILL.md');
  assert.ok(summary.length < 15000, 'SKILL.md ' + summary.length);
  assert.match(summary, /\n- `answer-page`, for the next pages of a long answer \(see Long answers\)\n/);
  assert.match(summary, /## Long answers\n\nA tool answer stays under 14,000 characters\. From a script \(`run_typescript`\), return the answer itself or the part the task needs, never only its keys\./);
  assert.match(summary, /An answer listing `remaining` \(contract sections\) or a `next` page says what to ask in the next call\./);
  assert.match(skillText(), /names the others in `remaining`: ask them in the next call/);
  const setup = read('js/setup_common.js');
  // In Vibe the tools are called from run_typescript: tools.mcp_Convertigo.answer_page({answerId, page}).
  assert.match(setup, /never only its keys[^"]*answer_page\(\{answerId, page\}\)/);
  assert.match(read('js/tool_description_notes.js'), /answer-page gives the next/);
});

// Vibe 3.1 dropped the whole Convertigo connector of a No Code session for one tool whose output schema had "items": {}
// (MCP 0.3.0-beta.33). untyped lists the sub-schemas that say no type nor alternatives; empty, those that say nothing.
function subSchemas(schema, where, found) {
  if (!schema || typeof schema !== 'object') return found;
  const typed = ['type', 'oneOf', 'anyOf', 'allOf', 'enum', 'const', '$ref'].some(key => schema[key] !== undefined);
  if (!typed) found.untyped.push(where);
  if (!Object.keys(schema).length) found.empty.push(where);
  for (const [key, value] of Object.entries(schema.properties || {})) subSchemas(value, where + '.' + key, found);
  for (const [key, value] of Object.entries(schema.patternProperties || {})) subSchemas(value, where + '[' + key + ']', found);
  if (schema.items && typeof schema.items === 'object') {
    (Array.isArray(schema.items) ? schema.items : [schema.items]).forEach((item, i) => subSchemas(item, where + '[]' + (Array.isArray(schema.items) ? i : ''), found));
  }
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') subSchemas(schema.additionalProperties, where + '{}', found);
  for (const union of ['oneOf', 'anyOf', 'allOf']) (schema[union] || []).forEach((part, i) => subSchemas(part, where + '|' + union + i, found));
  return found;
}
// Empty sub-schemas older than this check, left to their own change.
const KNOWN_EMPTY = [
  'tools_batch_call output.calls[].payload',
  'tools_browser_verify input.hints|oneOf2[]',
  'tools_databaseobject_tree_apply output.operations[].payload',
  'tools_nocode_baserow_schema_apply input.schema|oneOf0.tables[].views[].filters[].value',
  // the cells of an attached sheet are of any type (0.3.0-beta.33); Vibe 3.0.1's models and core accept them, checked
  // on test-nocode, and tests/scripts/validate_tool_schemas.cjs keeps every schema strict otherwise
  'tools_attachment_read output.sheet.header[]',
  'tools_attachment_read output.sheet.rows[][]',
  'tools_nocode_attachment_read output.sheet.header[]',
  'tools_nocode_attachment_read output.sheet.rows[][]'
];

test('no tool schema adds an empty sub-schema; answer-page and partialAnswer type every field', () => {
  const overrides = schemaOverrides();
  const found = { untyped: [], empty: [] };
  for (const file of fs.readdirSync(path.join(root, '_c8oProject/sequences')).filter(f => /^tools_.*\.yaml$/.test(f))) {
    const sequence = file.replace(/\.yaml$/, '');
    const input = overrides.applyInput(sequence, null, null);
    if (input) subSchemas(JSON.parse(JSON.stringify(input)), sequence + ' input', found);
    const output = JSON.parse(JSON.stringify(overrides.decorateOutput(sequence, overrides.applyOutput(sequence, null, null), null)));
    subSchemas(output, sequence + ' output', found);
    assert.equal(output.properties.partialAnswer.type, 'object', sequence);
  }
  assert.deepEqual(found.empty.filter(where => !KNOWN_EMPTY.includes(where)), [], 'an empty sub-schema');
  assert.deepEqual(found.untyped.filter(where => /tools_answer_page|partialAnswer/.test(where)), [], 'answer-page types every field');
  const decorated = overrides.decorateOutput('tools_nocode_form_get', overrides.applyOutput('tools_nocode_form_get', null, null), null).properties.partialAnswer;
  for (const field of ['answerId', 'page', 'pages', 'next', 'text']) assert.ok(decorated.properties[field].type, field);
});

test('a prompt read through requestable-execute comes in pages under the budget and joins back whole', () => {
  // Agents without native MCP prompts (Vibe) read a prompt with requestable-execute of lib_ConvertigoMCP.mcp_prompts_call:
  // a tool answer, paged by BoundAnswer like any other (the measure of the endpoint: the text and the structured content
  // apart, each as the client sees it). Each prompt fits it today, frontend-ngx by a few dozen characters.
  // A native prompts/get is not a tool answer: no client cuts it, and it is not paged.
  const prompts = JSON.parse(read('prompts/prompts_index.json'));
  // the longest prompt twice: a prompt that outgrows the budget is paged, never cut
  const longest = prompts.map(p => ({ p, text: read('prompts/' + p.file) })).sort((a, b) => b.text.length - a.text.length)[0];
  prompts.push({ name: longest.p.name + '-doubled', description: longest.p.description, text: longest.text + '\n' + longest.text });
  let paged = 0;
  for (const prompt of prompts) {
    const { api } = pagesApi({ auth: { authenticated: true, kind: 'managed', user: 'studio' } });
    const store = server();
    const context = caller(store);
    const text = prompt.text || read('prompts/' + prompt.file);
    const value = { result: { requestable: 'lib_ConvertigoMCP.mcp_prompts_call', status: 'ok', truncated: false,
      payload: { result: { name: prompt.name, description: prompt.description, messages: [{ role: 'user', content: { type: 'text', text } }] } } } };
    const first = api.bound(context, { sequence: 'tools_requestable_execute', value });
    if (first === null) {
      assert.ok(delivered(api, value, '', false) <= api.BUDGET, prompt.name);
      continue;
    }
    paged++;
    const { value: whole, pages } = readAll(api, context, first.structured);
    assert.deepEqual(whole, JSON.parse(JSON.stringify(value)), prompt.name);
    for (const page of pages) {
      assert.ok(delivered(api, page, '', false) <= api.BUDGET, prompt.name + ' page ' + delivered(api, page, '', false));
    }
  }
  assert.ok(paged >= 1, 'a prompt over the budget is paged: ' + paged);
});
