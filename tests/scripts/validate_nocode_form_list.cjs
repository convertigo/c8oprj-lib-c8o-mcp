// Run: node --test tests/scripts/validate_nocode_form_list.cjs
// nocode-form-list lists the forms of the No Code user through C8Oforms.APIV2_ExecuteView, target formsV2/search, the
// search of the Édition list of the No Code Studio home (~/git/C8oForms, mobileSharedActions/searchForm). C8Oforms is
// faked here with what the tool relies on: the drafts of the user and those shared with them, the name matched
// without case nor accents, the pages and their token, the total and the publication status of each draft.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

const USER = 'testuser@convertigo.com';

function fold(text) {
  return String(text == null ? '' : text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function draft(id, name, extra = {}) {
  return Object.assign({
    _id: id, _rev: '1-a', name, creator: USER, creationDate: Number(id), lastMofification: Number(id) + 60000,
    collabs: [], collabsResponse: [], shared: [], tag: [], subTag: [], thumbnail: { type: 'color', color: '#2f6fed' }
  }, extra);
}

const DRAFTS = [
  draft('1793283384694', 'Skyjo_copy', { publication: { status: 'published', version: '3', pwa: 'pwas/published_1793283384694/index.html' }, tag: ['Jeux'] }),
  draft('1793100000000', 'Demande de congés', { publication: { status: 'changed', version: '2', pwa: null } }),
  draft('1792900000000', 'Notes de frais', { creator: 'C8Oreserved_Gregoryv@convertigo.com', publication: { status: 'never' }, lastMofification: '1792900500000', tag: 'Finance' }),
  draft('1792800000000', 'Inscription CONGES été', { publication: { status: 'never' } })
];

// APIV2_ExecuteView as the tool calls it: the variables it gets, the answer of its search (docs, pagination). Its
// pages are read from an offset carried by a bookmark, as CouchDB bookmarks are opaque to the tool.
function fakeC8oforms(options = {}) {
  const state = { calls: [] };
  const docs = options.docs || DRAFTS;
  function executeView(variables) {
    const params = JSON.parse(variables.dynamicParams);
    const query = fold(params.query);
    const matching = docs.filter(doc => !query || fold(doc.name).includes(query));
    const pageSize = params.pagination.pageSize;
    const start = params.pagination.pageToken ? Number(String(params.pagination.pageToken).replace('bm-', '')) : 0;
    const page = matching.slice(start, start + pageSize);
    const hasNextPage = start + pageSize < matching.length;
    return {
      document: {
        res: {
          // An empty list comes back from the XML answer as an empty string.
          docs: page.length ? plain(page) : '',
          bookmark: 'raw',
          pagination: {
            paginated: true, mode: 'mango_bookmark', pageSize, returnedCount: page.length,
            totalCount: params.pagination.withTotal === false ? null : matching.length,
            hasNextPage, nextPageToken: hasNextPage ? 'bm-' + (start + pageSize) : null
          }
        }
      }
    };
  }
  function transport(name, params) {
    state.calls.push({ name, params: plain(params) });
    if (name === 'nocode_validate_token') {
      return options.authFail
        ? { document: { error: { code: 'invalid_token', message: 'No Code token signature is invalid.' } } }
        : { document: { result: { status: 'ok', authenticated: true, user: USER } } };
    }
    if (name === 'APIV2_ExecuteView') {
      if (options.answer) return options.answer;
      return executeView(params);
    }
    throw new Error('unexpected call ' + name);
  }
  return { state, transport };
}

// The engine as nocode_forms.js and nocode_form_list.js see it: InternalRequester runs the sequence asked for in the
// session of the request, its XML answer is read back as JSON.
function sandboxFor(transport) {
  const empty = new Proxy(function () {}, { get: (_, key) => key === Symbol.toPrimitive ? () => '' : empty });
  class HashMap { constructor() { this.values = {}; } put(key, value) { this.values[key] = value; } }
  class InternalRequester {
    constructor(params) { this.params = params.values; }
    processRequest() {
      const response = transport(this.params.__sequence, this.params);
      return { getDocumentElement: () => response };
    }
    getContext() { return {}; }
  }
  const engine = { theApp: { contextManager: { remove() {} } } };
  const packages = new Proxy(empty, { get: (_, key) => {
    if (key === 'java') return { util: { HashMap, Base64: empty }, io: { File: empty } };
    if (key === 'com') return { twinsoft: { convertigo: { engine: { Engine: engine, requesters: { InternalRequester, InternalHttpServletRequest: class {} }, util: { XMLUtils: { XmlToJson: response => JSON.stringify(response) } }, enums: empty } } } };
    return empty;
  } });
  const sandbox = {
    Packages: packages,
    java: { lang: { System: { currentTimeMillis: () => 1800000000000 }, String, reflect: { Array: { newInstance: () => [] } } } },
    org: { apache: { log4j: { MDC: { put() {} } } } },
    context: { httpServletRequest: { getHeader: name => name === 'Authorization' ? 'Bearer t' : null } }
  };
  sandbox.include = file => vm.runInContext(read(file), sandbox, { filename: file });
  vm.createContext(sandbox);
  return sandbox;
}

// The step of the sequence as the engine runs it: each declared variable in the scope as a String object, or null.
function runSequence(variables, fakeOptions) {
  const fake = fakeC8oforms(fakeOptions);
  const sandbox = sandboxFor(fake.transport);
  const yaml = read('_c8oProject/sequences/tools_nocode_form_list.yaml');
  const block = yaml.match(/\n {2}expression: \|\n((?: {4}.*\n)+)/)[1];
  const expression = block.replace(/^ {4}/gm, '').trim().replace(/^'|'$/g, '').replace(/''/g, "'");
  const toObject = vm.runInContext('(function (value) { return new String(value); })', sandbox);
  for (const name of yaml.match(/^↓(\w+) \[variables\.RequestableVariable-\d+\]/gm).map(line => line.slice(1).split(' ')[0])) {
    sandbox[name] = variables[name] == null ? null : toObject(variables[name]);
  }
  vm.runInContext(expression, sandbox, { filename: 'tools_nocode_form_list.yaml' });
  const searches = fake.state.calls.filter(call => call.name === 'APIV2_ExecuteView');
  return { result: plain(sandbox.result), calls: fake.state.calls, searches, params: searches.map(call => JSON.parse(call.params.dynamicParams)) };
}

// The list alone, with a host that answers what APIV2_ExecuteView answers.
function listWith(args, answer, authentication = { authenticated: true, user: USER }) {
  const sandbox = {};
  vm.runInNewContext(read('js/nocode_form_list.js'), sandbox);
  const searched = [];
  const host = {
    authenticate: () => authentication,
    search: variables => { searched.push(variables); if (answer instanceof Error) throw answer; return answer; }
  };
  return { result: plain(sandbox.C8O.nocodeFormList.list(args, host)), searched };
}

const WRITES = /update|create|delete|post|publish|save|set/i;

test('the forms of the user as the home lists them: APIV2_ExecuteView formsV2/search in the No Code session, nothing written', () => {
  const run = runSequence({});
  assert.equal(run.result.status, 'ok', JSON.stringify(run.result.error));
  assert.deepEqual(run.calls.map(call => call.name), ['nocode_validate_token', 'APIV2_ExecuteView'], 'the token authenticates the session first');
  assert.equal(run.calls.some(call => WRITES.test(call.name)), false);
  const search = run.searches[0].params;
  assert.deepEqual(search.__project, ['C8Oforms']);
  assert.equal(search.target, 'formsV2/search', 'the search of the Édition list, every folder included');
  assert.deepEqual(run.params[0], {
    query: '', tag: [], subTag: [],
    filters: { hide_apps_i_created: false, hide_folders: false, show_all_apps: false, my_collaborations: false },
    pagination: { pageSize: 20, pageToken: null, withTotal: true }
  }, 'the filters of the home as a user opens it: an administrator never lists every user\'s forms');
  assert.equal(run.result.total, 4);
  assert.equal(run.result.count, 4);
  assert.equal(run.result.nextCursor, null);
  assert.equal('name' in run.result, false);
  assert.deepEqual(run.result.forms[0], {
    id: '1793283384694', name: 'Skyjo_copy', access: 'owner', publication: 'published', version: '3',
    modified: '2026-10-29T14:17:24Z', folders: ['Jeux']
  });
  assert.deepEqual(run.result.forms.map(form => [form.id, form.access, form.publication, form.version]), [
    ['1793283384694', 'owner', 'published', '3'],
    ['1793100000000', 'owner', 'changed', '2'],
    ['1792900000000', 'shared', 'never', undefined],
    ['1792800000000', 'owner', 'never', undefined]
  ]);
  const shared = run.result.forms[2];
  assert.equal(shared.creator, 'Gregoryv@convertigo.com', 'who shares it, without the reserved prefix');
  assert.deepEqual(shared.folders, ['Finance'], 'one folder alone comes back without its array');
  assert.equal(shared.modified, '2026-10-25T03:55:00Z', 'a date given as text');
  for (const form of run.result.forms) {
    assert.equal('thumbnail' in form || '_rev' in form || 'collabs' in form || 'created' in form, false, 'only what the agent answers with');
  }
});

test('a name finds the forms whose name holds it, without case nor accents, and the answer says what was asked', () => {
  const run = runSequence({ name: '  Congés ' });
  assert.equal(run.params[0].query, 'Congés', 'the name as C8Oforms normalizes it itself');
  assert.deepEqual(run.result.forms.map(form => form.name), ['Demande de congés', 'Inscription CONGES été']);
  assert.deepEqual([run.result.total, run.result.count, run.result.name], [2, 2, 'Congés']);
  const none = runSequence({ name: 'Inventaire' });
  assert.deepEqual([none.result.status, none.result.total, none.result.count, none.result.forms, none.result.nextCursor], ['ok', 0, 0, [], null]);
});

test('a limit and the cursor read the next forms; the total counts them all', () => {
  const first = runSequence({ limit: '2' });
  assert.deepEqual(first.params[0].pagination, { pageSize: 2, pageToken: null, withTotal: true });
  assert.deepEqual([first.result.total, first.result.count, first.result.nextCursor], [4, 2, 'bm-2']);
  const next = runSequence({ limit: '2', cursor: first.result.nextCursor });
  assert.equal(next.params[0].pagination.pageToken, 'bm-2', 'the cursor is the token of C8Oforms, given back as is');
  assert.deepEqual(next.result.forms.map(form => form.id), ['1792900000000', '1792800000000']);
  assert.deepEqual([next.result.total, next.result.nextCursor], [4, null]);
  assert.equal(runSequence({ limit: '500' }).params[0].pagination.pageSize, 40, '40 at most');
  for (const limit of ['0', '-3', 'abc', '']) {
    assert.equal(runSequence({ limit }).params[0].pagination.pageSize, 20, JSON.stringify(limit));
  }
  assert.equal(runSequence({ limit: '7.9' }).params[0].pagination.pageSize, 7);
});

test('a page of 40 forms, the most, stays an answer an agent keeps inline', () => {
  const docs = Array.from({ length: 60 }, (_, i) => draft(String(1793000000000 - i * 1000), 'Application de suivi des interventions n°' + i,
    { creator: i % 3 ? USER : 'C8Oreserved_someone.else@example.invalid', publication: { status: i % 2 ? 'changed' : 'published', version: String(i) }, tag: ['Maintenance', 'Clients'] }));
  const run = runSequence({ limit: '40' }, { docs });
  assert.deepEqual([run.result.total, run.result.count], [60, 40]);
  const size = JSON.stringify(run.result, null, 2).length;
  assert.ok(size < 16000, 'Vibe spills a tool answer above about 16 KB of indented JSON to a file: ' + size);
});

test('without the No Code authentication nothing is listed', () => {
  const run = runSequence({}, { authFail: true });
  assert.equal(run.result.status, 'auth_required');
  assert.deepEqual(run.result.authentication, { authenticated: false, error: { code: 'invalid_token', message: 'No Code token signature is invalid.' } });
  assert.equal(run.searches.length, 0);
  const missing = listWith({}, null, null);
  assert.deepEqual([missing.result.status, missing.result.authentication, missing.searched.length], ['auth_required', { authenticated: false }, 0]);
});

test('a refusal or a failure of C8Oforms is an error, never an empty list', () => {
  const refused = runSequence({}, { answer: { document: { error: { code: 'authenticated_context_required', message: 'Authentication required' } } } });
  assert.deepEqual([refused.result.status, refused.result.error.code], ['error', 'form_list_failed']);
  assert.match(refused.result.error.message, /Authentication required/);
  const thrown = listWith({}, new Error('engine stopped'));
  assert.deepEqual([thrown.result.status, thrown.result.error.code], ['error', 'form_list_failed']);
  assert.match(thrown.result.error.message, /engine stopped/);
  for (const answer of [null, {}, { res: null }, { res: '' }]) {
    assert.equal(listWith({}, answer).result.status, 'error', JSON.stringify(answer));
  }
});

test('folders and drafts without id are not forms; a draft without publication status says unknown', () => {
  const answer = { res: { docs: [{ isAtag: true, key: 'Jeux' }, { name: 'sans id' }, { _id: 'f1', name: 'Quiz', creator: USER.toUpperCase() }], pagination: { totalCount: '1', hasNextPage: 'true', nextPageToken: 'name:f1' } } };
  const { result } = listWith({ name: 'quiz' }, answer);
  assert.deepEqual(result, { status: 'ok', total: 1, count: 1, forms: [{ id: 'f1', name: 'Quiz', access: 'owner', publication: 'unknown' }], nextCursor: 'name:f1', name: 'quiz' });
  const noTotal = listWith({}, { res: { docs: [], pagination: { totalCount: null } } }).result;
  assert.deepEqual([noTotal.total, noTotal.count, noTotal.nextCursor], [null, 0, null]);
});

test('the tool is declared, allowed in No Code, never held, with its schema, aliases, contract and skill routing', () => {
  assert.match(read('c8oProject.yaml'), /↓tools_nocode_form_list \[sequences\.GenericSequence\]: 🗏 sequences\/tools_nocode_form_list\.yaml\n/);
  const sequence = read('_c8oProject/sequences/tools_nocode_form_list.yaml');
  assert.match(sequence, /^accessibility: Private\n/);
  assert.match(sequence, /^comment: \|\n  List the forms and applications of the No Code user\n/m);
  assert.match(sequence, /include\("js\/nocode_forms\.js"\);\n\s+include\("js\/nocode_form_list\.js"\);/);
  for (const name of ['token', 'name', 'limit', 'cursor']) {
    assert.match(sequence, new RegExp('↓' + name + ' \\[variables\\.RequestableVariable-\\d+\\]: \\n'), name);
    assert.match(sequence, new RegExp(name + ': typeof ' + name + ' === "undefined" \\? null : ' + name), name);
  }
  assert.doesNotMatch(sequence, /required: true/, 'every argument is optional');
  assert.doesNotMatch(sequence, /^  (comment|description): [^'|].*: /m, 'a value holding ": " is quoted');

  const policy = {};
  vm.runInNewContext(read('js/nocode_tool_policy.js'), policy);
  assert.equal(policy.C8O.nocodeToolPolicy.allows('tools_nocode_form_list'), true);
  const confirm = { C8O: {} };
  vm.runInNewContext(read('js/nocode_write_confirm.js'), confirm);
  assert.equal(confirm.C8O.nocodeWriteConfirm.holds('tools_nocode_form_list', { name: 'Congés' }), false, 'a read never waits for "Confirmer avant de modifier"');

  const overrides = { C8O: {}, include() {} };
  vm.runInNewContext(read('js/schema_overrides.js'), overrides);
  const schema = plain(overrides.C8O.schemaOverrides.applyInput('tools_nocode_form_list', null, null));
  assert.equal(schema.required, undefined);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties).sort(), ['cursor', 'limit', 'name', 'token']);
  assert.deepEqual([schema.properties.limit.maximum, schema.properties.limit.default], [40, 20]);

  const router = read('js/mcp_endpoint_router.js');
  const aliases = vm.runInNewContext('(' + /var ARGUMENT_ALIASES = (\{[\s\S]*?\n\});/.exec(router)[1] + ')').tools_nocode_form_list;
  assert.deepEqual([aliases.query, aliases.search, aliases.filter, aliases.pageSize, aliases.size, aliases.nextCursor, aliases.pageToken],
    ['name', 'name', 'name', 'limit', 'limit', 'cursor', 'cursor']);

  const forms = read('js/nocode_forms.js');
  assert.match(forms, /editingLifecycle: \{\n\s+find: "A form named without its id: nocode-form-list \{ name \}/);

  const skill = read('resources/convertigo-nocode/SKILL.md');
  assert.match(skill, /^- `nocode-form-list`$/m);
  const section = skill.slice(skill.indexOf("## Finding the user's forms"), skill.indexOf('## Publishing'));
  assert.ok(section.length > 200, 'the skill says when to list the forms');
  for (const when of [/Combien de formulaires \/ d'applications/, /Retrouve mon formulaire/, /`total`/, /nocode-form-get/, /never writes/, /`access: "owner"`/, /auth_required/]) {
    assert.match(section, when);
  }
  assert.match(skill, /a form the user names without its id is found with `nocode-form-list`/);
  assert.match(read('TOOLS.md'), /\| `nocode-form-list` \| `tools_nocode_form_list` \|/);
});
