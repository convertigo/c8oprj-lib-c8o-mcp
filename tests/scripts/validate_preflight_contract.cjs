const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Offline part of the MCP contract checks (tests/preflight/contract_live.py is the live part): what can be checked
// without an engine. Answers stay under the size an agent can read, errors carry a readable message in both the text
// and the structured content, an unknown name is refused instead of acting on another object, and an upsert leaves
// no stale child. A test marked todo is a defect found on the current code: node reports it without failing the run,
// and the todo goes once the fix lands.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const CAP = 30000; // characters of one tool answer an agent reads comfortably

// The JavaScript of a SimpleStep expression in a sequence YAML: the literal block holds one single-quoted string.
function stepExpression(file, step) {
  const text = read(file);
  const at = text.indexOf('↓' + step + ' [steps.SimpleStep');
  assert.ok(at >= 0, `${step} not found in ${file}`);
  const lines = text.slice(at).split('\n');
  const start = lines.findIndex(l => /^\s*expression: \|\s*$/.test(l));
  const indent = lines[start + 1].match(/^\s*/)[0];
  const body = [];
  for (let i = start + 1; i < lines.length && (lines[i].startsWith(indent) || !lines[i].trim()); i++) {
    body.push(lines[i].slice(indent.length));
  }
  return body.join('\n').trim().replace(/^'|'$/g, '').replace(/''/g, "'");
}

// --- answer size --------------------------------------------------------------------------------

test('log-view: a page of long log lines stays under the cap', () => {
  const longText = 'SELECT rows -> ' + 'x'.repeat(30000);
  const rows = Array.from({ length: 500 }, (_, i) => ['c8o.engine', '2026-10-18 10:00:00', 'INFO', 'thread-' + i, longText, 'project=App']);
  class LogManager {
    constructor() { this.done = false; }
    setFilter() {} setDateStart() {} setDateEnd() {} setMaxLines() {} setTimeout() {} setContinue() {} close() {}
    hasMoreResults() { return !this.done; }
    getLines() {
      this.done = true;
      const wrap = r => ({ get: i => r[i], length: () => r.length });
      return { length: () => rows.length, getJSONArray: i => wrap(rows[i]) };
    }
  }
  const ctx = {
    Packages: { com: { twinsoft: { convertigo: { engine: { admin: { logmanager: { LogManager } } } } } } },
    java: { util: { Date: Date } },
    include: () => {},
    limit: 500, _nextCursor: null, timeoutMs: 0, text: 'rows', q: null, startDate: null, since: null, endDate: null, until: null,
    filter: null, level: null, category: null, project: null, requestable: null, connector: null, transaction: null, thread: null,
    fetchSize: 1000
  };
  vm.runInNewContext(read('js/tools_log_view.js'), ctx);
  const answer = JSON.stringify({ lines: ctx.logViewLines, query: ctx.logViewQuery });
  assert.ok(answer.length <= CAP, `log-view page of ${answer.length} characters`);
  assert.ok(ctx.logViewHasMore && ctx.logViewNextCursor, 'the cursor continues after the page');
});

test('marketplace-list: limit 200 over the whole catalog stays under the cap', { todo: 'live: 62 519 characters for the 101 entries' }, () => {
  const context = { C8O: { dbo: {} }, Packages: {}, java: { lang: { System: { currentTimeMillis: () => 0 } } }, include: () => {} };
  vm.createContext(context);
  vm.runInContext(read('js/marketplace.js'), context);
  const M = context.C8O.marketplace;
  // 101 entries shaped like the live catalog (a 200-character description, topics, repository urls).
  const catalog = Array.from({ length: 101 }, (_, i) => ({
    name: 'lib_Entry' + i, technicalName: 'c8oprj-lib-entry-' + i, status: 'available',
    description: ('Library number ' + i + ' of the catalog, it does many useful things for a Convertigo project. ').repeat(3).slice(0, 200),
    topics: ['convertigo', 'library', 'topic' + (i % 7), 'ngx'], cloneUrl: 'https://github.com/convertigo/c8oprj-lib-entry-' + i + '.git',
    defaultBranch: 'master', sharedComponents: 3, sharedActions: 5
  }));
  M._listOne = () => ({ entries: catalog, totalCount: catalog.length, pagesFetched: [{ page: 1 }], hasMore: false, nextCursor: '' });
  const answer = JSON.stringify(M.list({ limit: 200 }));
  assert.ok(answer.length <= CAP, `marketplace-list answer of ${answer.length} characters`);
});

// --- errors -------------------------------------------------------------------------------------

const endpoint = 'lib_ConvertigoMCP/_c8oProject/sequences/mcp_endpoint.yaml'.replace(/^lib_ConvertigoMCP\//, '');

function formatToolErrorText() {
  const init = stepExpression('_c8oProject/sequences/mcp_endpoint.yaml', 'Init');
  const start = init.indexOf('var TOOL_CALL_INTERRUPTED');
  const end = init.indexOf('const Engine');
  const ctx = {};
  vm.runInNewContext(init.slice(start, end) + '\nthis.format = formatToolErrorText;', ctx);
  return ctx.format;
}

test('a tool error text lifts the message of the tool script', () => {
  const format = formatToolErrorText();
  const out = JSON.parse(format({ error: {
    code: '-1', message: 'An exception occured while executing step',
    details: 'Unable to evaluate step expression code for \'expression\' property or variable.\nStep: "Run (priority:1)"\n' +
      'A Javascript error has occured: Error: ngx-page-create: invalid spec, nothing was created. (js/tools_generators.js#145)'
  } }));
  assert.equal(out.message, 'ngx-page-create: invalid spec, nothing was created.');
});

test('a tool error structuredContent carries the same readable message as the text', { todo: 'live: 27 of 27 tool errors keep "An exception occured while executing step" in structuredContent.error.message' }, () => {
  const yaml = read(endpoint);
  const block = yaml.slice(yaml.indexOf('↓ToolCallErrorResult'), yaml.indexOf('↓ReturnToolError'));
  const structured = block.slice(block.indexOf('↓structuredContent'));
  assert.ok(!/XMLCopyStep[\s\S]*\.\/document\/error/.test(structured.slice(0, structured.indexOf('↓GuidanceMetaIf'))),
    'structuredContent copies ./document/error as is: a client that reads it gets the generic engine message');
});

function route(name) {
  const routerSource = read('js/mcp_endpoint_router.js');
  const start = routerSource.indexOf('  var toolNameRaw = paramsObject');
  const end = routerSource.indexOf('  if (mappingError) {', start);
  const known = new Set(['tools_project_list', 'tools_databaseobject_tree_get']);
  const project = { getName: () => 'lib_ConvertigoMCP', getSequenceByName: n => (known.has(String(n)) ? { getName: () => n } : null) };
  const ctx = {
    context: { project, httpServletRequest: { getHeader: () => null } },
    C8O: { guidance: { warningForToolCall: () => '', stripToolArguments: a => a } },
    paramsObject: { name, arguments: {} },
    mcpAuthentication: { kind: 'token' },
    Packages: { com: { twinsoft: { convertigo: { engine: { Engine: { theApp: { databaseObjectsManager: {
      getOriginalProjectByName: () => project } } } } } } } }
  };
  vm.runInNewContext(read('js/nocode_tool_policy.js'), ctx);
  vm.runInNewContext(read('js/gateway_tool_policy.js'), ctx);
  vm.runInNewContext(routerSource.slice(start, end), ctx);
  return ctx;
}

test('tools/call of an unknown tool names it instead of an internal routing error', { todo: 'live: "Internal MCP routing error"' }, () => {
  assert.equal(route('project-list').mappingError, null);
  const out = route('no-such-tool');
  assert.ok(out.mappingError, 'the router maps no-such-tool to tools_no_such_tool without checking that it exists');
  assert.match(out.mappingError.message, /no-such-tool/);
});

function runInit(file, vars, projects) {
  const saved = [];
  const reloaded = [];
  const mcpProject = { getName: () => 'lib_ConvertigoMCP' };
  const byName = n => (projects.includes(String(n)) ? { getName: () => String(n) } : null);
  const ctx = Object.assign({
    context: { project: mcpProject },
    java: { lang: { System: { currentTimeMillis: () => 0 } } },
    Packages: { com: { twinsoft: { convertigo: { engine: { Engine: { theApp: { databaseObjectsManager: {
      getOriginalProjectByName: n => { const p = byName(n); if (!p) { throw new Error('not found'); } return p; },
      getAllProjectNamesList: () => ({ size: () => projects.length, get: i => projects[i] }) } } } } } } } },
    C8O: {
      util: { toTrimmedString: v => (v == null ? '' : String(v).trim()) },
      dbo: {
        saveProject: p => { saved.push(p ? String(p.getName()) : null); return { saved: !!p }; },
        reloadProject: n => { reloaded.push(String(n)); return { reloaded: false, status: 'failed', message: 'Timed out' }; }
      }
    }
  }, vars);
  vm.runInNewContext(stepExpression(file, 'Init'), ctx);
  return { ctx, saved, reloaded };
}

test('project-save of an unknown project saves nothing else', { todo: 'live: saved lib_ConvertigoMCP (24 YAML files rewritten) for project PfNoSuchProject' }, () => {
  const { ctx, saved } = runInit('_c8oProject/sequences/tools_project_save.yaml', { project: 'PfNoSuchProject' }, ['App', 'lib_ConvertigoMCP']);
  assert.deepEqual(saved.filter(Boolean), [], `saved ${saved.join(', ')}`);
  assert.notEqual(ctx.projectSaveStatus, 'saved');
});

test('project-reload of an unknown project answers at once', { todo: 'live: 120 s before "Timed out waiting for project reload completion"' }, () => {
  const { reloaded, ctx } = runInit('_c8oProject/sequences/tools_project_reload.yaml', { project: 'PfNoSuchProject' }, ['App', 'lib_ConvertigoMCP']);
  assert.deepEqual(reloaded, [], 'reloadProject waited for a project that is not in the workspace');
  assert.match(String(ctx.projectReloadMessage), /not found|PfNoSuchProject/i);
});

// --- upserts ------------------------------------------------------------------------------------

function crudWorld() {
  const context = { C8O: {}, java: { lang: { System: { currentTimeMillis: () => 0 } } } };
  vm.createContext(context);
  vm.runInContext(read('js/crud_backend.js'), context);
  const node = (name, cls, parent) => {
    const n = { name, cls, parent, children: [], getName: () => name, setComment() {}, setDescription() {},
      getFullQName: () => (parent ? parent.getFullQName() + '.' : 'App.') + name };
    if (parent) { parent.children.push(n); }
    return n;
  };
  const ctx = {
    ensureArray: v => (Array.isArray(v) ? v : v == null ? [] : [v]),
    trimmed: v => (v == null ? '' : String(v).trim()),
    findChild: (parent, name, cls) => parent.children.find(c => c.name === String(name) && (!cls || c.cls === cls)) || null,
    createChild: (parent, cls, name) => node(String(name), cls, parent),
    removeChild: (parent, child) => { parent.children.splice(parent.children.indexOf(child), 1); },
    applyUpdates() {}
  };
  return { B: context.C8O.crudBackend, ctx, node };
}

test('upsert-crud: a field left out of the spec leaves no sequence variable behind', { todo: 'live: body stays on ct_create_note and ct_update_note' }, () => {
  const { B, ctx, node } = crudWorld();
  const seq = node('ct_create_note', 'sequences.GenericSequence', null);
  const result = { created: [], updated: [], removed: [] };
  B.ensureRequestableVariables(ctx, seq, [{ name: 'title' }, { name: 'body' }], result);
  B.ensureRequestableVariables(ctx, seq, [{ name: 'title' }], result);
  assert.deepEqual(seq.children.map(c => c.name), ['title']);
});

test('upsert-crud: a field left out of the spec leaves no step variable behind', { todo: 'live: body stays on CallCt_create_note' }, () => {
  const { B, ctx, node } = crudWorld();
  const step = node('CallCt_create_note', 'steps.TransactionStep', null);
  const result = { created: [], updated: [], removed: [] };
  B.ensureStepVariables(ctx, step, [{ name: 'title' }, { name: 'body' }], result);
  B.ensureStepVariables(ctx, step, [{ name: 'title' }], result);
  assert.deepEqual(step.children.map(c => c.name), ['title']);
});
