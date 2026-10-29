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

test('marketplace-list: limit 200 over the whole catalog stays under the cap', () => {
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

test('a tool error structuredContent carries the same readable message as the text', () => {
  const yaml = read(endpoint);
  const block = yaml.slice(yaml.indexOf('↓ToolCallErrorResult'), yaml.indexOf('↓ReturnToolError'));
  const structured = block.slice(block.indexOf('↓structuredContent'));
  assert.ok(!/XMLCopyStep[\s\S]*\.\/document\/error/.test(structured.slice(0, structured.indexOf('↓GuidanceMetaIf'))),
    'structuredContent copies ./document/error as is: a client that reads it gets the generic engine message');
});

function route(name) {
  const routerSource = read('js/mcp_endpoint_router.js');
  const start = routerSource.indexOf('  var toolNameRaw = paramsObject');
  const end = routerSource.indexOf('      callSequence = targetSequence;', start);
  const known = ['tools_project_list', 'tools_project_save', 'tools_databaseobject_tree_get'];
  // Like the engine, getSequenceByName throws for a missing name.
  const project = { getName: () => 'lib_ConvertigoMCP',
    getSequenceByName: n => { if (!known.includes(String(n))) { throw new Error('There is no sequence named ' + n); } return { getName: () => n }; },
    getSequencesList: () => ({ size: () => known.length, get: i => ({ getName: () => known[i] }) }) };
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
  ctx.Engine = ctx.Packages.com.twinsoft.convertigo.engine.Engine;
  vm.runInNewContext(routerSource.slice(start, end) + '\n    }\n  }', Object.assign(ctx, { requestIdJson: 'null', JSON }));
  return ctx;
}

test('tools/call of an unknown tool names it instead of an internal routing error', () => {
  assert.equal(route('project-list').callSequence, undefined, 'a known tool goes on to its sequence');
  const out = route('project-saved');
  assert.equal(out.callSequence, 'mcp_error_response');
  assert.match(out.callVariables.message, /Unknown tool project-saved\. Close tools: project-save/);
});

// The real C8O.dbo.requireTargetProject, run against the given workspace.
function guardOf(projects) {
  const source = read('js/databaseobject.js');
  const fn = source.slice(source.indexOf('C8O.dbo.requireTargetProject = function'), source.indexOf('\n};\n', source.indexOf('C8O.dbo.requireTargetProject = function')) + 3);
  const ctx = { C8O: { util: { toTrimmedString: v => (v == null ? '' : String(v).trim()) }, dbo: {} }, context: { project: { getName: () => 'lib_ConvertigoMCP' } },
    Packages: { com: { twinsoft: { convertigo: { engine: { Engine: { theApp: { databaseObjectsManager: { existsProject: n => projects.includes(String(n)) } } } } } } } } };
  vm.runInNewContext(fn, ctx);
  return ctx.C8O.dbo.requireTargetProject;
}

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
        requireTargetProject: guardOf(projects),
        saveProject: p => { saved.push(p ? String(p.getName()) : null); return { saved: !!p }; },
        reloadProject: n => { reloaded.push(String(n)); return { reloaded: false, status: 'failed', message: 'Timed out' }; }
      }
    }
  }, vars);
  vm.runInNewContext(stepExpression(file, 'Init'), ctx);
  return { ctx, saved, reloaded };
}

test('project-save of an unknown project saves nothing else', () => {
  assert.throws(() => runInit('_c8oProject/sequences/tools_project_save.yaml', { project: 'PfNoSuchProject' }, ['App', 'lib_ConvertigoMCP']),
    /Unknown project: PfNoSuchProject/);
  assert.throws(() => runInit('_c8oProject/sequences/tools_project_save.yaml', { project: '' }, ['App', 'lib_ConvertigoMCP']), /project is required/);
  assert.throws(() => runInit('_c8oProject/sequences/tools_project_save.yaml', { project: 'lib_ConvertigoMCP' }, ['App', 'lib_ConvertigoMCP']),
    /running MCP server project/);
  assert.deepEqual(runInit('_c8oProject/sequences/tools_project_save.yaml', { project: 'App' }, ['App', 'lib_ConvertigoMCP']).saved, ['App']);
});

test('project-reload of an unknown project answers at once', () => {
  assert.throws(() => runInit('_c8oProject/sequences/tools_project_reload.yaml', { project: 'PfNoSuchProject' }, ['App', 'lib_ConvertigoMCP']),
    /Unknown project: PfNoSuchProject/);
});

// --- upserts ------------------------------------------------------------------------------------

function crudWorld() {
  const context = { C8O: {}, java: { lang: { System: { currentTimeMillis: () => 0 } } } };
  vm.createContext(context);
  vm.runInContext(read('js/crud_backend.js'), context);
  const node = (name, cls, parent) => {
    const n = { name, cls, parent, children: [], getName: () => name, setComment() {}, setDescription() {},
      getFullQName: () => (n.parent ? n.parent.getFullQName() + '.' : 'App.') + name,
      getDatabaseObjectChildren: () => ({ size: () => n.children.length, get: i => n.children[i] }),
      remove: child => { n.children.splice(n.children.indexOf(child), 1); child.parent = null; } };
    if (parent) { parent.children.push(n); }
    return n;
  };
  const ctx = {
    ensureArray: v => (Array.isArray(v) ? v : v == null ? [] : [v]),
    trimmed: v => (v == null ? '' : String(v).trim()),
    findChild: (parent, name, cls) => parent.children.find(c => c.name === String(name) && (!cls || c.cls === cls)) || null,
    createChild: (parent, cls, name) => node(String(name), cls, parent),
    logicalClassName: n => n.cls,
    applyUpdates() {}
  };
  return { B: context.C8O.crudBackend, ctx, node };
}

test('upsert-crud: a field left out of the spec leaves no sequence variable behind', () => {
  const { B, ctx, node } = crudWorld();
  const seq = node('ct_create_note', 'sequences.GenericSequence', null);
  const result = { created: [], updated: [], deleted: [] };
  B.ensureRequestableVariables(ctx, seq, [{ name: 'title' }, { name: 'body' }], result);
  B.ensureRequestableVariables(ctx, seq, [{ name: 'title' }], result);
  assert.deepEqual(seq.children.map(c => c.name), ['title']);
  assert.deepEqual(result.deleted, ['App.ct_create_note.body'], 'the removed variable is listed with its QName read before removal');
});

test('upsert-crud: a field left out of the spec leaves no step variable behind', () => {
  const { B, ctx, node } = crudWorld();
  const step = node('CallCt_create_note', 'steps.TransactionStep', null);
  const result = { created: [], updated: [], deleted: [] };
  B.ensureStepVariables(ctx, step, [{ name: 'title' }, { name: 'body' }], result);
  B.ensureStepVariables(ctx, step, [{ name: 'title' }], result);
  assert.deepEqual(step.children.map(c => c.name), ['title']);
});

// --- QName resolution ---------------------------------------------------------------------------

// The real C8O.dbo._resolveByChildNames and _childrenNamedLike, on a small NGX tree like lib_TreeTable's.
function qnameWorld() {
  const source = read('js/databaseobject.js');
  const fnOf = name => {
    const at = source.indexOf('C8O.dbo.' + name + ' = function');
    return source.slice(at, source.indexOf('\n};\n', at) + 3);
  };
  const node = (name, cls, prefix, parent) => {
    const n = { name, children: [], getName: () => name, getClass: () => ({ getSimpleName: () => cls }),
      getFullQName: () => (parent ? parent.getFullQName() + '.' + prefix : '') + name };
    if (parent) { parent.children.push(n); }
    return n;
  };
  const project = node('lib_TreeTable', 'Project', '', null);
  const app = node('NgxApp', 'ApplicationComponent', '', node('Application', 'MobileApplication', '', project));
  const shared = node('treeTable', 'UISharedRegularComponent', 'sp:', app);
  const page = node('testTreeTable', 'PageComponent', 'pg:', app);
  node('Menu', 'UIDynamicMenu', 'mn:', app);
  const ctx = { C8O: { dbo: { getDirectChildren: n => n.children } },
    Packages: { com: { twinsoft: { convertigo: { engine: { Engine: { theApp: { databaseObjectsManager: {
      getOriginalProjectByName: n => (n === 'lib_TreeTable' ? project : null) } } } } } } } } };
  vm.runInNewContext(fnOf('_resolveByChildNames') + fnOf('_childrenNamedLike'), ctx);
  return { dbo: ctx.C8O.dbo, app, shared, page };
}

test('a shared component written <ClassName>_<name> resolves to it, and only with the right class', () => {
  const { dbo, shared } = qnameWorld();
  assert.equal(dbo._resolveByChildNames('lib_TreeTable.Application.NgxApp.UISharedRegularComponent_treeTable'), shared,
    'the form a colleague\'s agent wrote for lib_TreeTable.Application.NgxApp.sp:treeTable');
  assert.equal(dbo._resolveByChildNames('lib_TreeTable.Application.NgxApp.treeTable'), shared, 'the form of the library readme');
  assert.equal(dbo._resolveByChildNames('lib_TreeTable.Application.NgxApp.PageComponent_treeTable'), null, 'another class names nothing');
});

test('an object not found lists the children of its closest ancestor with a close name', () => {
  const { dbo, app } = qnameWorld();
  assert.deepEqual([...dbo._childrenNamedLike(app, 'lib_TreeTable.Application.NgxApp.TreeTable')],
    ['lib_TreeTable.Application.NgxApp.sp:treeTable', 'lib_TreeTable.Application.NgxApp.pg:testTreeTable']);
  assert.deepEqual([...dbo._childrenNamedLike(app, 'lib_TreeTable.Application.NgxApp.ct:SharedTreeTable')], ['lib_TreeTable.Application.NgxApp.sp:treeTable']);
  assert.deepEqual([...dbo._childrenNamedLike(app, 'lib_TreeTable.Application.NgxApp.pg:x')], [], 'a name too short suggests nothing');
  assert.match(read('js/databaseobject.js'), /pg:<Page>, sp:<shared component>, "/);
});

// --- arguments a tool does not take ---------------------------------------------------------------

test('an argument a tool does not take is named in the answer, with the arguments it takes', () => {
  const source = read('js/mcp_endpoint_router.js');
  const fnOf = name => { const at = source.indexOf('function ' + name + '('); return source.slice(at, source.indexOf('\n}\n', at) + 3); };
  const ctx = { C8O: { schemaOverrides: { applyInput: () => ({ type: 'object', properties: { search: {}, limit: {} } }) } } };
  vm.runInNewContext('var ROUTER_SET_ARGUMENTS = { browserDebugPort: true, conversationId: true, reveal: true };\n' +
    fnOf('schemaPropertyNames') + fnOf('unknownArgumentsWarning'), ctx);
  const sequence = { getVariablesList: () => ({ size: () => 2, get: i => ({ getName: () => ['search', 'detail'][i] }) }) };
  assert.equal(ctx.unknownArgumentsWarning('tools_marketplace_list', sequence, { query: 'tree', limit: 2 }),
    'Ignored argument query: not taken by this tool, the call ran without it. Its arguments: detail, limit, search.');
  assert.equal(ctx.unknownArgumentsWarning('tools_marketplace_list', sequence, { search: 'tree', detail: 'full', __nolog: 'true', reveal: 'true' }), '',
    'a sequence variable missing from the schema, an internal and a router-set argument are taken');
  assert.match(source, /mcpArgumentWarning = unknownArgumentsWarning\(targetSequence, requestable, toolArgs \|\| \{\}\);/);
  const endpoint = read('_c8oProject/sequences/mcp_endpoint.yaml');
  assert.match(endpoint, /var mcpArgumentWarning = "";/);
  assert.match(endpoint, /↓ArgumentWarningIf \[steps\.IfStep-1792407700001\]/, 'structuredContent carries it too');
  assert.match(endpoint, /\(result, mcpGuidanceWarning, mcpArgumentWarning, mcpOperatorNote\)/, 'and the text content');
});

test('a supervisor note reaches the agent in its next successful tool answer, once', () => {
  const source = read('js/mcp_endpoint_router.js');
  assert.match(source, /function takeOperatorNote\(\)/);
  assert.match(source, /\[managedConversationId \+ "\.md", "next\.md"\]/, 'a note for one conversation, or for the next call');
  assert.match(source, /if \(!file\.renameTo\(taken\)\)/, 'renamed before it is read, so two calls at once do not both take it');
  const endpoint = read('_c8oProject/sequences/mcp_endpoint.yaml');
  assert.match(endpoint, /↓TakeOperatorNote \[steps\.SimpleStep-1792407700005\]: \n\s+expression: mcpOperatorNote = takeOperatorNote\(\);/);
  assert.match(endpoint, /↓OperatorNoteIf \[steps\.IfStep-1792407700007\]/);
  assert.match(read('resources/convertigo_common_skill.md'), /`operatorNote` is a note from the person who supervises your work/);
});

// --- tool errors for Vibe, js/ prefix -----------------------------------------------------------------

test('a tool error reaches a Vibe client as a readable result, and every output schema accepts it (run 11a)', () => {
  const router = read('js/mcp_endpoint_router.js');
  assert.match(router, /mcpErrorsAsResult = \/\^MistralAI-VibeCLI\\\/\/\.test\(mcpUserAgent\);/);
  const endpoint = read('_c8oProject/sequences/mcp_endpoint.yaml');
  assert.match(endpoint, /var mcpErrorsAsResult = false;/);
  assert.equal((endpoint.match(/- →→: mcpErrorsAsResult !== true/g) || []).length, 2, 'both error branches');
  const ctx = { C8O: {}, include() {} };
  vm.runInNewContext(read('js/schema_overrides.js'), ctx);
  const tight = ctx.C8O.schemaOverrides.decorateOutput('tools_x', { type: 'object', additionalProperties: false,
    properties: { status: { type: 'string' }, error: { type: 'object', properties: { context: { type: 'object' } } } } });
  assert.deepEqual(Object.keys(tight.properties.error).sort(), ['description', 'type']);
  assert.equal(tight.properties.error.type, 'object');
  assert.match(read('resources/convertigo_vibe_start.md'), /check `result\.error` after each call/);
});

test('project-js-set and project-js-get take js/app.js as app.js (run 11a F-02)', () => {
  for (const file of ['tools_project_js_set', 'tools_project_js_get']) {
    assert.match(read('_c8oProject/sequences/' + file + '.yaml'), /if \(normalized\.indexOf\("js\/"\) === 0\) \{ normalized = normalized\.substring\(3\); \}/);
  }
});

// --- values of number, boolean and enum properties -------------------------------------------------

// Java's parsers as compileProperty uses them: Integer(String) takes no space, Double(String) trims.
function javaNumbers() {
  const whole = (min, max) => s => {
    if (!/^[+-]?\d+$/.test(s) || BigInt(s) < min || BigInt(s) > max) { throw new Error('NumberFormatException: For input string: "' + s + '"'); }
    return Number(s);
  };
  const real = s => {
    if (!/^[+-]?(NaN|Infinity|(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[fFdD]?)$/.test(s.trim())) { throw new Error('NumberFormatException'); }
    return parseFloat(s);
  };
  return { Byte: { parseByte: whole(-128n, 127n) }, Short: { parseShort: whole(-32768n, 32767n) },
    Integer: { parseInt: whole(-(2n ** 31n), 2n ** 31n - 1n) }, Long: { parseLong: whole(-(2n ** 63n), 2n ** 63n - 1n) },
    Float: { parseFloat: real }, Double: { parseDouble: real } };
}

// Global symbols ${name} and ${name=default}, resolved like DatabaseObjectsManager.getCompiledValue.
const SYMBOLS = { pf_timeout: '75', pf_bad: 'abc' };
const compileSymbols = text => String(text).replace(/\$\{([^}=]+)(?:=([^}]*))?\}/g, (m, n, d) => {
  if (n in SYMBOLS) { return SYMBOLS[n]; }
  if (d !== undefined) { return d; }
  throw new Error('UndefinedSymbolsException: ' + n);
});

const javaType = (name, constants) => ({ getName: () => name, isEnum: () => !!constants,
  getEnumConstants: () => (constants || []).map(([n, label]) => ({ name: () => n, toString: () => label || n })) });
const ACCESSIBILITY = javaType('com.twinsoft.convertigo.engine.enums.Accessibility', [['Public'], ['Hidden'], ['Private']]);
const JSON_FIELD_TYPE = javaType('com.twinsoft.convertigo.engine.enums.JsonFieldType', [['string'], ['number', 'number'], ['bool', 'boolean'], ['nul', 'null']]);

function propertyWorld() {
  const source = read('js/databaseobject.js');
  const fnOf = name => { const at = source.indexOf('C8O.dbo.' + name + ' = '); return source.slice(at, source.indexOf('\n};\n', at) + 3); };
  const ctx = {
    java: { lang: Object.assign(javaNumbers(), { Boolean: { TRUE: { equals: () => false } } }) },
    Packages: { org: { mozilla: { javascript: { NativeJavaObject: function NativeJavaObject() {} } } },
      com: { twinsoft: { convertigo: { beans: { core: { MySimpleBeanInfo: { NILLABLE: 'nillable' } } },
        engine: { Engine: { theApp: { databaseObjectsManager: { getCompiledValue: compileSymbols } } } } } } } },
    C8O: {
      util: { toTrimmedString: v => (v == null ? '' : String(v).trim()), previewValue: v => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v)) },
      dbo: { _getDynamicPropertyContext: () => null, _expandStepSourceShorthand: v => v, _isPageRootField: () => false,
        _isMobileSmartSourceTypeClass: () => false, _isFormatedContentClass: () => false, _isSmartTypeClass: () => false,
        _isXMLVectorClass: () => false, _isXMLizableClass: () => false, _TEXT_ONLY_PROPERTIES: {},
        // An integer property edited with Studio tags stores the index of the tag.
        _describeAllowedValues: (pd, dbo) => ((dbo.tags || {})[pd.getName()] || null) && dbo.tags[pd.getName()].map((label, value) => ({ value, label })) }
    }
  };
  vm.runInNewContext(['_NUMBER_PROPERTY_TYPES', '_checkScalarPropertyValue', '_matchConstant', 'applyPropertyUpdates', '_preparePropertyValue']
    .map(fnOf).join(''), ctx);
  const check = (name, type, value, dbo) => ctx.C8O.dbo._checkScalarPropertyValue({ getName: () => name, getPropertyType: () => type }, value, dbo || {});
  return { ctx, check };
}

test('an NGX property unset with null or "not set" gets the not-set text, and the text false stays a value (run 12 F-01)', () => {
  const source = read('js/databaseobject.js');
  const fnOf = name => { const at = source.indexOf('C8O.dbo.' + name + ' = '); return source.slice(at, source.indexOf('\n};\n', at) + 3); };
  function MobileSmartSourceType(text) { this.text = text; }
  const ctx = {
    Packages: { com: { twinsoft: { convertigo: { beans: { ngx: { components: { MobileSmartSourceType } } } } } } },
    C8O: { util: { toTrimmedString: v => (v == null ? '' : String(v).trim()) }, dbo: { _buildMobileSmartSourceType: spec => ({ built: spec }) } }
  };
  vm.runInNewContext('C8O.dbo._NGX_NOT_SET = "not set";' + ['_prepareDynamicPropertyValue', '_isNotSetSentinelValue'].map(fnOf).join(''), ctx);
  const D = ctx.C8O.dbo;
  const withChoice = { hasNotSetSentinel: true };
  const notSet = { built: { mode: 'PLAIN', value: 'not set' } };
  assert.deepEqual(JSON.parse(JSON.stringify(D._prepareDynamicPropertyValue(null, withChoice))), notSet, 'null unsets: before, it wrote the text false');
  assert.deepEqual(JSON.parse(JSON.stringify(D._prepareDynamicPropertyValue(' Not set ', withChoice))), notSet);
  assert.equal(D._prepareDynamicPropertyValue(null, { hasNotSetSentinel: false }), null);
  assert.equal(D._prepareDynamicPropertyValue('plain:false', withChoice).text, 'plain:false', 'the text false is kept as a value');
  assert.equal(D._isNotSetSentinelValue({ mode: 'PLAIN', value: 'false' }), false, 'tree-get shows the text false, not null');
  assert.equal(D._isNotSetSentinelValue('false'), false);
  assert.equal(D._isNotSetSentinelValue(false), true);
  assert.equal(D._isNotSetSentinelValue({ mode: 'PLAIN', value: false }), true);
});

const taken = r => { assert.equal(r.error, undefined, r.error); return r.value; };
const refused = r => { assert.ok(r.error, 'taken as ' + JSON.stringify(r.value)); return r.error; };

test('a number property refuses a value that is not a number, instead of storing 0', () => {
  const { check } = propertyWorld();
  const LONG = javaType('long');
  assert.equal(refused(check('responseTimeout', LONG, 'abc')), 'responseTimeout takes a whole number (long), not "abc".');
  assert.equal(refused(check('responseTimeout', LONG, '63.5')), 'responseTimeout takes a whole number (long), not "63.5".');
  assert.equal(refused(check('responseTimeout', LONG, 63.5)), 'responseTimeout takes a whole number (long), not 63.5.');
  assert.equal(refused(check('responseTimeout', LONG, '')), 'responseTimeout takes a whole number (long), not "".');
  assert.equal(refused(check('responseTimeout', LONG, true)), 'responseTimeout takes a whole number (long), not true.');
  assert.equal(refused(check('responseTimeout', LONG, { mode: 'PLAIN', expression: '5' })), 'responseTimeout takes a whole number (long), not an object.');
  assert.equal(refused(check('responseTimeout', LONG, [5])), 'responseTimeout takes a whole number (long), not a list.');
  assert.equal(refused(check('port', javaType('int'), '99999999999')),
    'port takes a whole number (int) from -2147483648 to 2147483647, not "99999999999".');
  assert.equal(refused(check('ratio', javaType('java.lang.Double'), 'half')), 'ratio takes a number (double), not "half".');
  assert.match(refused(check('responseTimeout', LONG, '${pf_bad}')), /not "\$\{pf_bad\}" \(the value of the symbol is "abc"\)\.$/);
});

test('a number given with spaces, as a JS number, as {value} or as a global symbol is still taken', () => {
  const { check } = propertyWorld();
  const LONG = javaType('long');
  assert.equal(taken(check('responseTimeout', LONG, '60')), '60');
  assert.equal(taken(check('responseTimeout', LONG, ' 60 ')), '60', 'Long(" 60 ") throws in the engine: the spaces go first');
  assert.equal(taken(check('responseTimeout', LONG, 60)), '60');
  assert.equal(taken(check('responseTimeout', LONG, { value: ' 61 ' })), '61');
  assert.equal(taken(check('responseTimeout', LONG, '99999999999')), '99999999999');
  assert.equal(taken(check('ratio', javaType('double'), '1e3')), '1e3');
  assert.equal(taken(check('responseTimeout', LONG, '${pf_timeout}')), '${pf_timeout}', 'the symbol is kept, not its value');
  assert.equal(taken(check('responseTimeout', LONG, '${pf_unset=70}')), '${pf_unset=70}');
  assert.equal(taken(check('responseTimeout', LONG, '${pf_unset}')), '${pf_unset}', 'an undefined symbol is the engine\'s to report');
  assert.equal(taken(check('responseTimeout', LONG, null)), null);
  assert.equal(taken(check('comment', javaType('java.lang.String'), 'abc')), 'abc', 'a text property is not checked');
});

test('an enum property refuses an unknown constant and lists them, instead of storing the first one', () => {
  const { check } = propertyWorld();
  assert.equal(refused(check('accessibility', ACCESSIBILITY, 'Bogus')), 'accessibility takes one of Public, Hidden, Private, not "Bogus".');
  assert.equal(refused(check('accessibility', ACCESSIBILITY, 2)), 'accessibility takes one of Public, Hidden, Private, not 2.');
  assert.equal(refused(check('accessibility', ACCESSIBILITY, '')), 'accessibility takes one of Public, Hidden, Private, not "".');
  assert.equal(refused(check('type', JSON_FIELD_TYPE, 'integer')), 'type takes one of string, number, bool (boolean), nul (null), not "integer".');
  assert.equal(taken(check('accessibility', ACCESSIBILITY, 'Hidden')), 'Hidden');
  assert.equal(taken(check('accessibility', ACCESSIBILITY, 'private')), 'Private', 'the engine stored Public for "private"');
  assert.equal(taken(check('accessibility', ACCESSIBILITY, ' Public ')), 'Public');
  assert.equal(taken(check('type', JSON_FIELD_TYPE, 'boolean')), 'bool', 'the label of a constant gives its name');
  assert.equal(taken(check('type', JSON_FIELD_TYPE, 'NULL')), 'nul');
});

test('a boolean property takes true or false only, instead of storing false for any other text', () => {
  const { check } = propertyWorld();
  const BOOL = javaType('boolean');
  assert.equal(refused(check('autoStart', BOOL, 'yes')), 'autoStart takes true or false, not "yes".');
  assert.equal(refused(check('autoStart', BOOL, 1)), 'autoStart takes true or false, not 1.');
  assert.equal(taken(check('autoStart', BOOL, ' TRUE ')), true);
  assert.equal(taken(check('autoStart', BOOL, 'false')), false);
  assert.equal(taken(check('autoStart', javaType('java.lang.Boolean'), false)), false);
});

test('an integer property edited with tags takes the label of a tag as its index', () => {
  const { check } = propertyWorld();
  const dbo = { tags: { httpVerb: ['GET', 'POST'] } };
  assert.equal(taken(check('httpVerb', javaType('int'), 'POST', dbo)), '1');
  assert.equal(taken(check('httpVerb', javaType('int'), 'post', dbo)), '1');
  assert.equal(taken(check('httpVerb', javaType('int'), '0', dbo)), '0');
  assert.equal(refused(check('httpVerb', javaType('int'), 'PUT', dbo)), 'httpVerb takes a whole number (int), the index of its value: 0 (GET), 1 (POST), not "PUT".');
});

test('tree-apply properties: a value the engine cannot take is an error and is not set (yaml-delta review)', () => {
  const { ctx } = propertyWorld();
  const set = [];
  const descriptor = (name, type) => ({ getName: () => name, getPropertyType: () => type, getReadMethod: () => null, getValue: () => null,
    getWriteMethod: () => ({ invoke: (dbo, args) => set.push([name, args[0]]) }) });
  ctx.C8O.dbo._getDescriptorMap = () => ({ responseTimeout: descriptor('responseTimeout', javaType('long')),
    accessibility: descriptor('accessibility', ACCESSIBILITY), autoStart: descriptor('autoStart', javaType('boolean')) });
  const dbo = { compileProperty: (type, name, value) => value };
  const out = ctx.C8O.dbo.applyPropertyUpdates(dbo, { responseTimeout: 'abc', accessibility: 'Bogus', autoStart: 'yes' });
  assert.deepEqual([...out.errors].map(e => e.message), ['responseTimeout takes a whole number (long), not "abc".',
    'accessibility takes one of Public, Hidden, Private, not "Bogus".', 'autoStart takes true or false, not "yes".']);
  assert.equal(out.applied.length + set.length, 0, 'nothing set');
  const good = ctx.C8O.dbo.applyPropertyUpdates(dbo, { responseTimeout: ' 60 ', accessibility: 'private', autoStart: 'TRUE' });
  assert.equal(good.errors.length, 0);
  assert.deepEqual(set, [['responseTimeout', '60'], ['accessibility', 'Private'], ['autoStart', true]]);
  assert.deepEqual([...good.applied].map(a => a.newValue), ['60', 'Private', 'true']);
});

// --- concurrent calls -------------------------------------------------------------------------------

// A step like the engine's RequestableStep: its clone gets its own variables but keeps the variable order of the step it
// was cloned from, and adding or removing a variable changes that order.
function stepWorld() {
  class XMLVector extends Array {
    add(value) { this.push(value); return true; }
    get(i) { return this[i]; }
    size() { return this.length; }
  }
  const newOrder = () => { const order = new XMLVector(); order.add(new XMLVector()); return order; };
  let priority = 1000;
  class StepVariable {
    constructor() { this.priority = ++priority; }
    setName(name) { this.name = name; }
    setValueOrNull(value) { this.value = value; }
  }
  class Step {
    constructor(order) { this.vars = []; this.orderedVariables = order || newOrder(); }
    clone() { return new Step(this.orderedVariables); }
    setOrderedVariables(order) { this.orderedVariables = order; }
    getVariables() {
      const vars = this.vars.slice();
      return { size: () => vars.length, get: i => vars[i], iterator: () => { let i = 0; return { hasNext: () => i < vars.length, next: () => vars[i++] }; } };
    }
    addVariable(variable) { this.vars.push(variable); this.orderedVariables.get(0).add(variable.priority); }
    remove(variable) {
      this.vars = this.vars.filter(v => v !== variable);
      const order = this.orderedVariables.get(0);
      order.splice(order.indexOf(variable.priority), 1);
    }
  }
  const beans = { common: { XMLVector }, variables: { StepVariable } };
  const com = { twinsoft: { convertigo: { beans } } };
  return { Step, com, Packages: { com }, java: { lang: { Long: { valueOf: value => value } } } };
}

test('an MCP call adds its variables to the Call step of its own run only (friction "The provided tool call failed")', () => {
  const { Step, com } = stepWorld();
  const projectStep = new Step();
  const runs = [];
  for (const variables of [{ target: 'App', depth: 2 }, { target: 'App.sq:a' }]) {
    const callStep = projectStep.clone();
    runs.push(callStep);
    vm.runInNewContext(stepExpression('_c8oProject/sequences/internal_call.yaml', 'init'), {
      com, JSON, Object, _sequence: 'tools_databaseobject_tree_get', _variables: JSON.stringify(variables),
      context: { requestedObject: { getStep: name => (name === 'Call' ? callStep : null) } }
    });
  }
  assert.equal(projectStep.orderedVariables.get(0).length, 0, 'the step of the project keeps no variable of a call');
  assert.deepEqual(runs.map(step => step.orderedVariables.get(0).length), [4, 3], 'each run orders its own variables');
  assert.deepEqual(runs[1].vars.map(v => v.name), ['target', '__nolog', '__sequence']);
});

test('requestable-execute sets the variables of its call step on its own run only', () => {
  const source = read('js/util.js');
  const fnOf = name => { const at = source.indexOf('C8O.requestable.' + name + ' = '); return source.slice(at, source.indexOf('\n};\n', at) + 3); };
  const { Step, Packages, java } = stepWorld();
  const ctx = { C8O: { requestable: {} }, Packages, java, JSON, Object };
  vm.runInNewContext(['_ownVariableOrder', '_clearVariables', '_addVariables'].map(fnOf).join(''), ctx);
  const projectStep = new Step();
  for (const variables of [{ id: 1, filter: 'a' }, { id: 2 }]) {
    const callStep = projectStep.clone();
    ctx.C8O.requestable._clearVariables(callStep);
    ctx.C8O.requestable._addVariables(callStep, variables);
    assert.deepEqual(callStep.vars.map(v => v.name), Object.keys(variables));
    assert.equal(callStep.orderedVariables.get(0).length, Object.keys(variables).length);
  }
  assert.equal(projectStep.orderedVariables.get(0).length, 0, 'the step of the project keeps no variable of a call');
});

test('every output schema takes the argumentWarning and operatorNote the endpoint adds to an answer', () => {
  const ctx = { C8O: {}, include() {} };
  vm.runInNewContext(read('js/schema_overrides.js'), ctx);
  const tight = ctx.C8O.schemaOverrides.decorateOutput('tools_databaseobject_tree_get', { type: 'object', additionalProperties: false,
    properties: { rootQName: { type: 'string' } } });
  assert.equal(tight.properties.argumentWarning.type, 'string');
  assert.equal(tight.properties.operatorNote.type, 'string');
  const endpoint = read('_c8oProject/sequences/mcp_endpoint.yaml');
  for (const key of ['argumentWarning', 'operatorNote']) {
    assert.match(endpoint, new RegExp('↓' + key + ' \\[steps\\.JsonFieldStep-'), key + ' is a top-level field of structuredContent');
  }
});

test('a refused MCP token is logged with its reason, never with the token', () => {
  const logged = [];
  const ctx = {
    include() {}, request: '{}',
    C8O: { mcpAuth: { authenticateRequest: () => ({ status: 'error', authenticated: false,
      error: { code: 'invalid_token_record', message: 'The MCP bearer token does not match its active record.' } }) } },
    context: { httpServletResponse: { setHeader() {} } },
    com: { twinsoft: { convertigo: { engine: { Engine: { logEngine: { warn: message => logged.push(String(message)) } } } } } }
  };
  vm.runInNewContext(stepExpression('_c8oProject/sequences/mcp_endpoint.yaml', 'Parse'), ctx);
  assert.equal(ctx.parseError.status, '401');
  assert.deepEqual(logged, ['[lib_ConvertigoMCP] MCP bearer refused (invalid_token_record): The MCP bearer token does not match its active record.']);
});

// --- bearer token store ---------------------------------------------------------------------------

// The real js/mcp_auth.js over an in-memory jwt folder with POSIX permissions: a signing key and a durable token whose
// record was never used. Every change to a file calls the listeners, so a test can run a call in the middle of a write.
// A java.util.Map as the scripts use it: put, get, entrySet().iterator() with remove.
class JavaMap extends Map {
  put(key, value) { this.set(key, value); }
  entrySet() {
    const map = this;
    return { iterator() {
      const keys = [...map.keys()];
      let at = -1;
      return { hasNext: () => at + 1 < keys.length, next: () => { at++; return { getKey: () => keys[at], getValue: () => map.get(keys[at]) }; },
        remove: () => map.delete(keys[at]) };
    } };
  }
}

function tokenStoreWorld(requesters = {}) {
  const crypto = require('node:crypto');
  const clock = {};
  class IOException extends Error {}
  class AccessDeniedException extends IOException {}
  class NoSuchFileException extends IOException {}
  class FileAlreadyExistsException extends IOException {}
  // Rhino hands a script a Java exception as an Error carrying it.
  const thrown = (Type, file) => Object.assign(new Error('java.nio.file.' + Type.name + ': ' + file), { javaException: new Type(file) });
  const files = new Map();
  const dirs = new Set();
  const listeners = [];
  const failures = new Map();
  const pauses = [];
  const changed = file => listeners.forEach(listener => listener(file));
  const entry = file => { if (!files.has(file)) { throw thrown(NoSuchFileException, file); } return files.get(file); };
  class File {
    constructor(parent, name) { this.path = name === undefined ? String(parent) : (parent.path || String(parent)) + '/' + name; }
    getAbsolutePath() { return this.path; }
    getParentFile() { return new File(this.path.slice(0, this.path.lastIndexOf('/'))); }
    getName() { return this.path.slice(this.path.lastIndexOf('/') + 1); }
    isDirectory() { return dirs.has(this.path); }
    mkdirs() { for (let p = this.path; p; p = p.slice(0, p.lastIndexOf('/'))) { dirs.add(p); } return true; }
    isFile() { return files.has(this.path); }
    exists() { return files.has(this.path); }
    delete() { return files.delete(this.path); }
    toPath() { return this; }
    // setReadable(false, false) takes the read bit from everyone, the owner included.
    setReadable(on) { entry(this.path).ownerRead = on; changed(this.path); return true; }
    setWritable() { changed(this.path); return true; }
    setExecutable() { return true; }
  }
  const Files = {
    readAllBytes(file) {
      const stored = entry(file.path);
      const failing = failures.get(file.path) || 0;
      if (failing > 0 || !stored.ownerRead) {
        failures.set(file.path, failing - 1);
        throw thrown(AccessDeniedException, file.path);
      }
      return Buffer.from(stored.data);
    },
    write(file, data, ...options) {
      if (options.includes('CREATE_NEW') && files.has(file.path)) { throw thrown(FileAlreadyExistsException, file.path); }
      files.set(file.path, { data: Buffer.from(data), ownerRead: true });
      changed(file.path);
    },
    move(from, to) { files.set(to.path, entry(from.path)); files.delete(from.path); changed(to.path); },
    setPosixFilePermissions(file, permissions) { entry(file.path).ownerRead = permissions[0] === 'r'; changed(file.path); }
  };
  class JavaString {
    constructor(value) { this.text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value); }
    getBytes() { return Buffer.from(this.text, 'utf8'); }
    toString() { return this.text; }
  }
  const java = {
    io: { File, IOException },
    lang: { String: JavaString, Thread: { sleep: ms => pauses.push(ms) }, reflect: { Array: { newInstance: (_type, size) => new Array(size) } },
      System: { getProperty: name => (name === 'convertigo.mcp.jwt.path' ? '/jwt' : null), currentTimeMillis: () => clock.now || Date.now() } },
    nio: {
      file: { Files, StandardOpenOption: { CREATE_NEW: 'CREATE_NEW', WRITE: 'WRITE' },
        StandardCopyOption: { ATOMIC_MOVE: 'ATOMIC_MOVE', REPLACE_EXISTING: 'REPLACE_EXISTING' },
        AtomicMoveNotSupportedException: class extends IOException {}, attribute: { PosixFilePermissions: { fromString: text => text } } },
      charset: { StandardCharsets: { UTF_8: 'UTF-8' } }
    },
    util: { Date, HashMap: class extends Map { put(key, value) { return this.set(key, value); } }, TimeZone: { getTimeZone: () => ({}) }, UUID: { randomUUID: () => crypto.randomUUID() },
      concurrent: { ConcurrentHashMap: JavaMap },
      Base64: { getUrlEncoder: () => ({ withoutPadding: () => ({ encodeToString: data => Buffer.from(data).toString('base64url') }) }),
        getUrlDecoder: () => ({ decode: text => Buffer.from(String(text), 'base64url') }) } },
    security: { SecureRandom: class {}, MessageDigest: { getInstance: () => ({ digest: data => crypto.createHash('sha256').update(data).digest() }),
      isEqual: (left, right) => Buffer.from(left).equals(Buffer.from(right)) } },
    text: { SimpleDateFormat: class { setTimeZone() {} format(date) { return date.toISOString(); } } },
    time: { Instant: { parse: text => { const ms = Date.parse(text); if (isNaN(ms)) { throw new Error('Unparseable date'); } return { toEpochMilli: () => ms }; } } }
  };
  const javax = { crypto: { Mac: { getInstance: () => ({ init(key) { this.key = key.key; }, doFinal(data) { return crypto.createHmac('sha256', this.key).update(data).digest(); } }) },
    spec: { SecretKeySpec: class { constructor(key) { this.key = key; } } } } };
  const engine = { Engine: { USER_WORKSPACE_PATH: '/workspace' }, AuthenticatedSessionManager: { Role: {}, SessionKey: {} }, requesters, util: {}, enums: {} };
  const ctx = { C8O: {}, java, Packages: { java, javax, com: { twinsoft: { convertigo: { engine } } } } };
  vm.runInNewContext(read('js/mcp_auth.js'), ctx);

  const secret = 'signing-key-of-the-test-store-'.padEnd(64, 'k');
  const keyPath = '/jwt/keys/signing-current.key';
  files.set(keyPath, { data: Buffer.from(secret + '\n'), ownerRead: true });
  const id = 'mcp_0123456789abcdef0123456789abcdef';
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = encode({ alg: 'HS256', typ: 'JWT', kid: id }) + '.' + encode({ iss: 'lib_ConvertigoMCP', aud: 'ConvertigoMCP', sub: 'admin',
    jti: 'jti-1', kind: 'durable', scope: 'mcp:full', iat: now, nbf: now, exp: now + 3600 });
  const recordPath = '/jwt/tokens/active/' + id + '.json';
  files.set(recordPath, { ownerRead: true, data: Buffer.from(JSON.stringify({ id, name: 'test', kind: 'durable', scope: 'mcp:full',
    jtiHash: crypto.createHash('sha256').update('jti-1').digest('base64url'), createdAt: '2026-10-01T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z', lastUsedAt: '', revokedAt: '', createdBy: 'admin' })) });
  return {
    auth: ctx.C8O.mcpAuth, clock, token: input + '.' + crypto.createHmac('sha256', secret).update(input).digest('base64url'),
    files, keyPath, recordPath, pauses, onChange: listener => listeners.push(listener), failReads: (file, times) => failures.set(file, times)
  };
}

const outcome = result => (result.authenticated === true ? 'ok' : result.error.code);

test('a call checking a token while another call rewrites its lastUsedAt takes it (401 with a valid token)', () => {
  const store = tokenStoreWorld();
  const during = [];
  let inside = false;
  store.onChange(file => {
    if (file === store.recordPath && !inside) {
      inside = true;
      try { during.push(outcome(store.auth.validate(store.token, null))); } finally { inside = false; }
    }
  });
  assert.equal(outcome(store.auth.validate(store.token, null)), 'ok');
  assert.ok(during.length > 0, 'the first call rewrote the record');
  assert.deepEqual(during, during.map(() => 'ok'), 'a call made while the record was rewritten was refused');
  assert.notEqual(JSON.parse(store.files.get(store.recordPath).data).lastUsedAt, '');
});

test('a token record or signing key unreadable for a moment is read again, and the token is taken', () => {
  const store = tokenStoreWorld();
  store.failReads(store.keyPath, 1);
  store.failReads(store.recordPath, 2);
  assert.equal(outcome(store.auth.validate(store.token, null)), 'ok');
  assert.deepEqual(store.pauses, [25, 25, 50], 'a short pause before each new read');
});

test('a token store that stays unreadable answers 503, not a 401 that makes Vibe drop the server', () => {
  const store = tokenStoreWorld();
  store.failReads(store.recordPath, Infinity);
  const result = store.auth.validate(store.token, null);
  assert.equal(outcome(result), 'token_store_unreadable');
  assert.equal(result.retryable, true);
  assert.ok(!result.error.message.includes('/jwt/'), 'the answer does not tell where the store is');
  const logged = [];
  const headers = {};
  const ctx = { include() {}, request: '{}', C8O: { mcpAuth: { authenticateRequest: () => result } },
    context: { httpServletResponse: { setHeader: (name, value) => { headers[name] = value; } } },
    com: { twinsoft: { convertigo: { engine: { Engine: { logEngine: { warn: message => logged.push(String(message)) } } } } } } };
  vm.runInNewContext(stepExpression(endpoint, 'Parse'), ctx);
  assert.equal(ctx.parseError.status, '503');
  assert.equal(ctx.parseError.data.code, 'token_store_unreadable');
  assert.equal(ctx.parseError.data.retryable, true);
  assert.deepEqual(headers, {}, 'no authentication challenge');
  assert.deepEqual(logged, ['[lib_ConvertigoMCP] MCP bearer not checked (token_store_unreadable): java.nio.file.AccessDeniedException: ' + store.recordPath]);
});

// test-nocode 28/10 15:07: C8Oforms was being reloaded when a No Code agent called the MCP, its token check threw
// "Unknown project", and the 401 that followed made Vibe drop the server for the rest of the session.
test('a No Code token C8Oforms cannot check while it is reloaded answers 503, not a 401', () => {
  const unknownProject = 'com.twinsoft.convertigo.engine.EngineException: Unknown project "C8Oforms".';
  class InternalRequester { processRequest() { throw new Error(unknownProject); } getContext() { return null; } }
  const store = tokenStoreWorld({ InternalRequester });
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ iss: 'C8Oforms', sub: 'user', scope: 'forms:write' }) + '.c2ln';
  const result = store.auth.validate(token, { httpServletRequest: null });
  assert.equal(outcome(result), 'nocode_token_check_unavailable');
  assert.equal(result.retryable, true);
  assert.ok(!result.error.message.includes('Unknown project'), 'the answer does not carry the engine exception');
  assert.equal(result.error.details, unknownProject, 'the engine log gets it');
  const logged = [];
  const ctx = { include() {}, request: '{}', C8O: { mcpAuth: { authenticateRequest: () => result } },
    context: { httpServletResponse: { setHeader() {} } },
    com: { twinsoft: { convertigo: { engine: { Engine: { logEngine: { warn: message => logged.push(String(message)) } } } } } } };
  vm.runInNewContext(stepExpression(endpoint, 'Parse'), ctx);
  assert.equal(ctx.parseError.status, '503');
  assert.equal(ctx.parseError.data.code, 'nocode_token_check_unavailable');
  assert.deepEqual(logged, ['[lib_ConvertigoMCP] MCP bearer not checked (nocode_token_check_unavailable): ' + unknownProject]);
});

// Vibe reports any HTTP error of the MCP as mcp_http_error, not retryable, without its status (feedback group 1d0f4cb9,
// 28/10): the endpoint keeps its retryable answers where the Agent Bridge of the engine reads them.
test('a retryable answer is kept for the Agent Bridge under the Tigo conversation, ten minutes at most', () => {
  const world = tokenStoreWorld();
  const shared = new Map();
  const server = { get: key => (shared.has(key) ? shared.get(key) : null), set: (key, value) => shared.set(key, value) };
  const call = conversationId => ({ server, httpServletRequest: { getHeader: name => (name === 'X-Convertigo-Conversation-Id' ? conversationId : null) } });
  world.clock.now = 1000000;
  assert.equal(world.auth.noteRetryableAnswer(call('agent-bf6a810d'), 503, 'nocode_token_check_unavailable'), true);
  const answers = shared.get('lib_ConvertigoMCP.retryableAnswers');
  assert.deepEqual(JSON.parse(answers.get('agent-bf6a810d')), { at: 1000000, status: 503, code: 'nocode_token_check_unavailable' });
  world.clock.now = 1000000 + 5 * 60000;
  world.auth.noteRetryableAnswer(call('agent-2'), '503', 'token_store_unreadable');
  assert.deepEqual([...answers.keys()], ['agent-bf6a810d', 'agent-2'], 'one per conversation, kept a while');
  world.clock.now = 1000000 + 10 * 60000;
  world.auth.noteRetryableAnswer(call('agent-2'), 503, 'nocode_token_check_unavailable');
  assert.deepEqual([...answers.keys()], ['agent-2'], 'an answer of ten minutes ago is forgotten');
  assert.equal(JSON.parse(answers.get('agent-2')).code, 'nocode_token_check_unavailable', 'the last answer of the conversation');
  for (const conversationId of [null, '', 'bad id"', 'x'.repeat(129)]) {
    assert.equal(world.auth.noteRetryableAnswer(call(conversationId), 503, 'c'), false, String(conversationId));
  }
  assert.equal(world.auth.noteRetryableAnswer({ httpServletRequest: call('agent-3').httpServletRequest }, 503, 'c'), false, 'no shared store');
  assert.equal(world.auth.noteRetryableAnswer(null, 503, 'c'), false);
  assert.deepEqual([...answers.keys()], ['agent-2']);
});

test('the endpoint notes its 503 for the Agent Bridge, never a refusal', () => {
  const noted = [];
  const parse = result => {
    const ctx = { include() {}, request: '{}',
      C8O: { mcpAuth: { authenticateRequest: () => result, noteRetryableAnswer: (context, status, code) => noted.push([context, status, code]) } },
      context: { httpServletResponse: { setHeader() {} } },
      com: { twinsoft: { convertigo: { engine: { Engine: { logEngine: { warn() {} } } } } } } };
    vm.runInNewContext(stepExpression(endpoint, 'Parse'), ctx);
    return ctx;
  };
  const unavailable = parse({ status: 'error', authenticated: false, retryable: true,
    error: { code: 'nocode_token_check_unavailable', message: 'C8Oforms could not check the MCP token just now.', details: '' } });
  assert.equal(unavailable.parseError.status, '503');
  assert.deepEqual(noted.map(([context, status, code]) => [context === unavailable.context, status, code]), [[true, 503, 'nocode_token_check_unavailable']]);
  parse({ status: 'error', authenticated: false, retryable: true, error: { message: 'unreadable' } });
  assert.equal(noted[1][2], 'token_store_unreadable', 'the code the answer carries');
  const refused = parse({ status: 'error', authenticated: false, error: { code: 'revoked_token', message: 'revoked' } });
  assert.equal(refused.parseError.status, '401');
  assert.equal(noted.length, 2, 'a refused token is not retryable');
  // An older engine copy of mcp_auth.js without the function: the 503 is answered all the same.
  const ctx = { include() {}, request: '{}', C8O: { mcpAuth: { authenticateRequest: () => ({ retryable: true, error: { code: 'x' } }) } },
    context: { httpServletResponse: { setHeader() {} } }, com: { twinsoft: { convertigo: { engine: { Engine: { logEngine: { warn() {} } } } } } } };
  vm.runInNewContext(stepExpression(endpoint, 'Parse'), ctx);
  assert.equal(ctx.parseError.status, '503');
});

test('an unknown, revoked or corrupt durable token record still refuses the token', () => {
  const unknown = tokenStoreWorld();
  unknown.files.delete(unknown.recordPath);
  assert.equal(outcome(unknown.auth.validate(unknown.token, null)), 'revoked_or_unknown_token');
  assert.equal(unknown.pauses.length, 3, 'looked for again in case it was being replaced');
  const revoked = tokenStoreWorld();
  revoked.files.set(revoked.recordPath.replace('/active/', '/revoked/'), revoked.files.get(revoked.recordPath));
  assert.equal(outcome(revoked.auth.validate(revoked.token, null)), 'revoked_token');
  assert.deepEqual(revoked.pauses, []);
  const corrupt = tokenStoreWorld();
  corrupt.files.get(corrupt.recordPath).data = Buffer.from('{"id":');
  const refusal = corrupt.auth.validate(corrupt.token, null);
  assert.equal(outcome(refusal), 'invalid_token_record');
  assert.equal(refusal.retryable, undefined);
});
