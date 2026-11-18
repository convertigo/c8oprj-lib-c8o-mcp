// Run: node --test tests/scripts/validate_argument_aliases.cjs
// Agents guess argument names (databaseobject-search with project and query, tree-get with qname, move with at, 17/11).
// Vibe checks the arguments of a call against the tool's closed input schema and refused those calls before they were
// sent, each one a failed call. The router maps the guesses it knows to the real field before the call
// (ARGUMENT_ALIASES of js/mcp_endpoint_router.js); the schemas of the databaseobject tools declare them as "Alias of
// <field>." so the client lets them through. The field and an alias given different values refuse the call. A
// databaseobject-search with qname alone answers the object at that QName, and a qname with * is a QName pattern.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const routerSource = read('js/mcp_endpoint_router.js');

// The alias helpers of the router, as written there.
function aliasHelpers() {
  const start = routerSource.indexOf('var ARGUMENT_ALIASES = {');
  const end = routerSource.indexOf("// Arguments that are neither in the tool's schema");
  assert.ok(start >= 0 && end > start, 'the alias table and its helpers are in the router');
  const sandbox = { JSON };
  vm.createContext(sandbox);
  vm.runInContext(routerSource.slice(start, end), sandbox);
  return sandbox;
}

function loadOverrides() {
  const sandbox = { C8O: {} };
  sandbox.include = file => vm.runInContext(read(file), sandbox, { filename: file });
  vm.createContext(sandbox);
  vm.runInContext(read('js/schema_overrides.js'), sandbox, { filename: 'js/schema_overrides.js' });
  return sandbox.C8O.schemaOverrides;
}

function declaredVariables(sequence) {
  const yaml = read(`_c8oProject/sequences/${sequence}.yaml`);
  return [...yaml.matchAll(/^↓([A-Za-z_][A-Za-z0-9_]*) \[variables\.RequestableVariable-\d+\]: $/gm)].map(m => m[1]);
}

function inputSchema(sequence) {
  const properties = {};
  for (const name of declaredVariables(sequence)) {
    properties[name] = { type: 'string' };
  }
  return plain(loadOverrides().applyInput(sequence, { type: 'object', properties }, null));
}

// What a client that validates the arguments against the input schema refuses (Vibe: "Additional properties are not
// allowed", a missing required field, a value out of an enum).
function clientRefusal(schema, args) {
  const problems = [];
  for (const key of Object.keys(args)) {
    if (!(key in schema.properties)) {
      if (schema.additionalProperties === false) {
        problems.push(`'${key}' was unexpected`);
      }
    } else if (schema.properties[key].enum && !schema.properties[key].enum.includes(args[key])) {
      problems.push(`'${key}' is not one of ${schema.properties[key].enum.join(', ')}`);
    }
  }
  for (const name of schema.required || []) {
    if (!(name in args)) {
      problems.push(`'${name}' is a required property`);
    }
  }
  return problems;
}

const DATABASEOBJECT_TOOLS = ['tools_databaseobject_search', 'tools_databaseobject_tree_get', 'tools_databaseobject_move', 'tools_databaseobject_copy'];

// The calls of the measured runs that the client refused, and the arguments the tool gets for each.
const MEASURED = [
  { sequence: 'tools_databaseobject_search', args: { project: 'App', query: '_vide' }, mapped: { qname: 'App', filter: '_vide' } },
  { sequence: 'tools_databaseobject_search', args: { project: 'App', query: 'q_top' }, mapped: { qname: 'App', filter: 'q_top' } },
  { sequence: 'tools_databaseobject_tree_get', args: { qname: 'App', childrenDepth: 1, properties: 'changed' }, mapped: { target: 'App', childrenDepth: 1, properties: 'changed' } },
  { sequence: 'tools_databaseobject_move', args: { qname: 'App.sq:a', target: 'App.sq:b', at: 'after' }, mapped: { qname: 'App.sq:a', target: 'App.sq:b', position: 'after' } },
  { sequence: 'tools_databaseobject_search', args: { qname: 'App.appdb.q_top' }, mapped: { qname: 'App.appdb.q_top' } },
  { sequence: 'tools_databaseobject_search', args: { qname: 'App.*._vide' }, mapped: { qname: 'App.*._vide' } }
];

test('every alias of the databaseobject tools is declared in its closed input schema as "Alias of <field>."', () => {
  const { ARGUMENT_ALIASES } = aliasHelpers();
  assert.deepEqual(plain(ARGUMENT_ALIASES.tools_databaseobject_search),
    { query: 'filter', q: 'filter', text: 'filter', search: 'filter', project: 'qname', target: 'qname' });
  assert.deepEqual(plain(ARGUMENT_ALIASES.tools_databaseobject_tree_get), { qname: 'target', project: 'target', depth: 'childrenDepth' });
  assert.deepEqual(plain(ARGUMENT_ALIASES.tools_databaseobject_move), { at: 'position' });
  assert.deepEqual(plain(ARGUMENT_ALIASES.tools_databaseobject_copy), { position: 'at' });
  for (const sequence of DATABASEOBJECT_TOOLS) {
    const schema = inputSchema(sequence);
    assert.equal(schema.additionalProperties, false, sequence);
    for (const [alias, field] of Object.entries(ARGUMENT_ALIASES[sequence])) {
      const declared = schema.properties[alias];
      assert.ok(declared, `${sequence}: ${alias} is in the schema`);
      assert.equal(declared.description, `Alias of ${field}.`, `${sequence}.${alias}`);
      assert.ok(schema.properties[field], `${sequence}: ${field} is in the schema`);
      assert.equal(declared.type, schema.properties[field].type, `${sequence}.${alias} has the type of ${field}`);
      assert.deepEqual(declared.enum, schema.properties[field].enum, `${sequence}.${alias} takes the values of ${field}`);
      assert.ok(!(schema.required || []).includes(field), `${sequence}: ${field} is not required, its alias may stand for it`);
    }
  }
  // tree-get still refuses a call without target (nor qname) itself.
  assert.match(inputSchema('tools_databaseobject_tree_get').properties.target.description, /Required \(or its alias qname\)/);
  assert.match(read('js/tools_databaseobject_tree_get.js'), /throw new Error\("target is required\."\)/);
});

test('the measured calls the client refused are accepted now, and the tool gets the real fields', () => {
  const { applyArgumentAliases, argumentAliasConflict } = aliasHelpers();
  for (const { sequence, args, mapped } of MEASURED) {
    assert.deepEqual(clientRefusal(inputSchema(sequence), args), [], `${sequence} ${JSON.stringify(args)}`);
    assert.equal(argumentAliasConflict(sequence, plain(args)), '');
    assert.deepEqual(plain(applyArgumentAliases(sequence, plain(args))), mapped, `${sequence} ${JSON.stringify(args)}`);
  }
  // An unknown name is still refused by the client, the alias table is no catch-all.
  assert.deepEqual(clientRefusal(inputSchema('tools_databaseobject_move'), { qname: 'App.sq:a', where: 'after' }), ["'where' was unexpected"]);
});

test('no alias is a field of its tool, and every alias leads to a field the tool takes', () => {
  const { ARGUMENT_ALIASES } = aliasHelpers();
  for (const [sequence, aliases] of Object.entries(ARGUMENT_ALIASES)) {
    const variables = declaredVariables(sequence);
    for (const [alias, field] of Object.entries(aliases)) {
      assert.ok(!variables.includes(alias), `${sequence}: ${alias} is a variable of the tool, an alias would take it from it`);
      assert.ok(variables.includes(field), `${sequence}: ${alias} leads to ${field}, a variable of the tool`);
    }
  }
});

test('an alias is used only when its field is absent; the same value twice is one value', () => {
  const { applyArgumentAliases, argumentAliasConflict } = aliasHelpers();
  const move = 'tools_databaseobject_move';
  // the field given: the alias of the same value is dropped
  const same = { qname: 'App.sq:a', target: 'App.sq:b', position: 'after', at: 'after' };
  assert.equal(argumentAliasConflict(move, same), '');
  assert.deepEqual(plain(applyArgumentAliases(move, same)), { qname: 'App.sq:a', target: 'App.sq:b', position: 'after' });
  // an empty field is absent: the alias stands for it
  assert.deepEqual(plain(applyArgumentAliases(move, { qname: 'App.sq:a', position: '', at: 'before' })), { qname: 'App.sq:a', position: 'before' });
  // an empty alias says nothing: the field is kept
  const emptyAlias = { qname: 'App.sq:a', position: 'inside', at: ' ' };
  assert.equal(argumentAliasConflict(move, emptyAlias), '');
  assert.deepEqual(plain(applyArgumentAliases(move, emptyAlias)), { qname: 'App.sq:a', position: 'inside' });
  // a number and its text are the same value
  assert.equal(argumentAliasConflict('tools_databaseobject_tree_get', { target: 'App', childrenDepth: 2, depth: '2' }), '');
  // a tool without aliases keeps its arguments as they are
  const untouched = { project: 'App', query: 'x' };
  assert.equal(argumentAliasConflict('tools_project_list', untouched), '');
  assert.deepEqual(plain(applyArgumentAliases('tools_project_list', untouched)), { project: 'App', query: 'x' });
});

test('the field and an alias, or two aliases, with different values are refused, naming the field to give once', () => {
  const { argumentAliasConflict } = aliasHelpers();
  const moved = argumentAliasConflict('tools_databaseobject_move', { qname: 'App.sq:a', target: 'App.sq:b', position: 'inside', at: 'after' });
  assert.equal(moved, 'Nothing was run: position is given twice with different values (position: "inside"; at is an alias of position: "after"): give position once.');
  const searched = argumentAliasConflict('tools_databaseobject_search', { query: 'q_top', q: '_vide', project: 'App', qname: 'Other' });
  assert.match(searched, /^Nothing was run: /);
  assert.match(searched, /filter is given twice with different values \(query is an alias of filter: "q_top"; q is an alias of filter: "_vide"\): give filter once/);
  assert.match(searched, /qname is given twice with different values \(qname: "Other"; project is an alias of qname: "App"\): give qname once/);
  const copied = argumentAliasConflict('tools_databaseobject_copy', { source: 'App.sq:a', target: 'App', at: 'inside', position: 'before' });
  assert.match(copied, /at is given twice with different values \(at: "inside"; position is an alias of at: "before"\)/);
  const long = argumentAliasConflict('tools_databaseobject_search', { filter: 'a'.repeat(200), query: 'b' });
  assert.ok(long.length < 260, 'a long value is shortened in the message');
});

// The routing of a tools/call in the router, from the tool name to the call of its sequence (as in
// validate_preflight_contract.cjs).
function route(name, args) {
  const start = routerSource.indexOf('  var toolNameRaw = paramsObject');
  const end = routerSource.indexOf('      callSequence = targetSequence;', start);
  const known = ['tools_databaseobject_move', 'tools_databaseobject_search'];
  const project = { getName: () => 'lib_ConvertigoMCP',
    getSequenceByName: n => { if (!known.includes(String(n))) { throw new Error('There is no sequence named ' + n); } return { getName: () => n }; },
    getSequencesList: () => ({ size: () => known.length, get: i => ({ getName: () => known[i] }) }) };
  const ctx = {
    context: { project, httpServletRequest: { getHeader: () => null } },
    C8O: { guidance: { warningForToolCall: () => '', stripToolArguments: a => a } },
    paramsObject: { name, arguments: args },
    mcpAuthentication: { kind: 'token' },
    Packages: { com: { twinsoft: { convertigo: { engine: { Engine: { theApp: { databaseObjectsManager: {
      getOriginalProjectByName: () => project } } } } } } } }
  };
  vm.runInNewContext(read('js/nocode_tool_policy.js'), ctx);
  vm.runInNewContext(read('js/gateway_tool_policy.js'), ctx);
  ctx.Engine = ctx.Packages.com.twinsoft.convertigo.engine.Engine;
  const helpers = routerSource.slice(routerSource.indexOf('var ARGUMENT_ALIASES = {'), routerSource.indexOf("// Arguments that are neither in the tool's schema"));
  vm.runInNewContext(helpers + '\n' + routerSource.slice(start, end) + '\n    }\n  }', Object.assign(ctx, { requestIdJson: '7', JSON }));
  return ctx;
}

test('a conflict is answered as the error of the tool with HTTP 200, and its sequence is not called', () => {
  const refused = route('databaseobject-move', { qname: 'App.sq:a', target: 'App.sq:b', position: 'inside', at: 'after' });
  assert.equal(refused.callSequence, 'mcp_error_response');
  assert.equal(refused.responseStatus, '200', 'an HTTP error status would keep the message from the agent');
  assert.equal(refused.callVariables.code, '-32602');
  assert.match(refused.callVariables.message, /^Nothing was run: position is given twice/);
  assert.deepEqual(JSON.parse(refused.callVariables.dataJson), { name: 'databaseobject-move', aliases: { at: 'position' } });
  assert.equal(refused.callVariables.requestIdJson, '7');
  // without a conflict the call goes on to its sequence
  assert.equal(route('databaseobject-move', { qname: 'App.sq:a', target: 'App.sq:b', at: 'after' }).callSequence, undefined);
  assert.equal(route('databaseobject-search', { project: 'App', query: 'q_top' }).callSequence, undefined);
  // the router maps the aliases before the sequence call, in one place
  assert.match(routerSource, /callVariables = applyAgentArgumentDefaults\(targetSequence, coerceToolArguments\(applyArgumentAliases\(targetSequence, toolArgs \|\| \{\}\)/);
});

// databaseobject-search run on a workspace of fake objects: App (connector appdb with q_top and _vide, sequence list
// calling q_top) and Lib (connector db with _vide).
function workspace() {
  const jlist = items => ({ size: () => items.length, get: i => items[i] });
  const all = [];
  function dbo(fullQName, type, yaml, children) {
    const name = fullQName.split('.').pop().replace(/^[A-Za-z]{1,4}:/, '');
    const object = {
      fullQName,
      getName: () => name,
      getComment: () => '',
      getClass: () => ({ getName: () => 'com.twinsoft.convertigo.beans.' + type }),
      getDatabaseType: () => type,
      getDatabaseObjectChildren: () => jlist(children || []),
      toXml: () => ({ yaml: 'name: ' + name + '\n' + (yaml || '') }),
      getFullQName: () => fullQName
    };
    all.push(object);
    return object;
  }
  const projects = {
    App: dbo('App', 'Project', '', [
      dbo('App.cn:appdb', 'Connector', '', [
        dbo('App.cn:appdb.tr:q_top', 'Transaction', 'sqlQuery: SELECT TOP 10'),
        dbo('App.cn:appdb.tr:_vide', 'Transaction', 'sqlQuery: SELECT 1')
      ]),
      dbo('App.sq:list', 'Sequence', '', [dbo('App.sq:list.st:call', 'Step', 'sourceTransaction: App.appdb.q_top')])
    ]),
    Lib: dbo('Lib', 'Project', '', [dbo('Lib.cn:db', 'Connector', '', [dbo('Lib.cn:db.tr:_vide', 'Transaction', 'sqlQuery: SELECT 2')])])
  };
  const bare = text => String(text).split('.').map(s => s.replace(/^[A-Za-z]{1,4}:/, '')).join('.');
  return {
    jlist,
    projects,
    resolve: qname => {
      const found = all.find(o => o.fullQName === qname || bare(o.fullQName) === bare(qname));
      if (!found) {
        throw new Error('qname: no object ' + qname + '. databaseobject-search finds it.');
      }
      return found;
    }
  };
}

function search(args) {
  const ws = workspace();
  const names = Object.keys(ws.projects);
  const sandbox = Object.assign({
    qname: null, filter: null, limit: 200, matchCase: null, useRegExp: null, objectType: '*', _nextCursor: null,
    java: { lang: { System: { currentTimeMillis: () => 0 } } },
    Packages: {
      java: { util: { regex: { Pattern: { CASE_INSENSITIVE: 2, MULTILINE: 8, compile: () => null } } } },
      com: { twinsoft: { convertigo: { engine: {
        Engine: { theApp: { databaseObjectsManager: { getAllProjectNamesList: () => ws.jlist(names), getOriginalProjectByName: n => ws.projects[n] } } },
        util: { XMLUtils: { createDom: () => null }, YamlConverter: { toYaml: xml => xml.yaml } }
      } } } }
    },
    C8O: {
      util: {
        toTrimmedString: v => (v == null ? '' : String(v).trim()),
        toBoolean: (v, d) => (v == null ? d : (/^(true|1|yes)$/i.test(String(v)) ? true : (/^(false|0|no)$/i.test(String(v)) ? false : d)))
      },
      dbo: { resolve: ws.resolve, safeFullQName: o => o.getFullQName(), safeQName: o => o.getFullQName() }
    }
  }, args);
  vm.createContext(sandbox);
  vm.runInContext(read('js/tools_databaseobject_search.js'), sandbox, { filename: 'js/tools_databaseobject_search.js' });
  return { qnames: plain(sandbox.searchMatches).map(m => m.qname), summary: plain(sandbox.searchSummary), matches: plain(sandbox.searchMatches) };
}

test('databaseobject-search with qname alone answers the object at that QName, type prefixes optional', () => {
  const found = search({ qname: 'App.appdb.q_top' });
  assert.deepEqual(found.qnames, ['App.cn:appdb.tr:q_top']);
  assert.equal(found.summary.scanned, 1, 'nothing under it is scanned');
  assert.equal(found.matches[0].className, 'com.twinsoft.convertigo.beans.Transaction');
  assert.equal(found.matches[0].context, undefined);
  assert.deepEqual(search({ qname: 'App.cn:appdb.tr:q_top' }).qnames, ['App.cn:appdb.tr:q_top']);
  // an unknown QName answers the resolve error, never an empty search
  assert.throws(() => search({ qname: 'App.appdb.q_missing' }), /qname: no object App\.appdb\.q_missing/);
});

test('databaseobject-search with a * in qname keeps the objects whose QName matches, under its fixed start', () => {
  assert.deepEqual(search({ qname: 'App.*._vide' }).qnames, ['App.cn:appdb.tr:_vide'], 'under App only, connector prefix optional');
  // the projects are scanned in the order of the existing search (the last one first): compared sorted
  assert.deepEqual(search({ qname: '*._vide' }).qnames.sort(), ['App.cn:appdb.tr:_vide', 'Lib.cn:db.tr:_vide'], 'no fixed start: every project');
  assert.deepEqual(search({ qname: 'App.appdb.q_*' }).qnames, ['App.cn:appdb.tr:q_top']);
  assert.deepEqual(search({ qname: 'App.*.tr:q_*' }).qnames, ['App.cn:appdb.tr:q_top'], 'a type prefix written in the pattern is matched');
  assert.deepEqual(search({ qname: 'App.sq:*' }).qnames, ['App.sq:list', 'App.sq:list.st:call'], 'and keeps its type: no connector object');
  assert.deepEqual(search({ qname: 'App.*.sq:_vide' }).qnames, []);
  assert.deepEqual(search({ qname: 'App.*._VIDE' }).qnames, ['App.cn:appdb.tr:_vide'], 'case-insensitive by default (the fixed start is resolved as a QName)');
  assert.deepEqual(search({ qname: 'App.*._VIDE', matchCase: 'true' }).qnames, []);
  // with filter, both apply: the objects under App whose QName matches and whose YAML holds the text
  assert.deepEqual(search({ qname: 'App.*', filter: 'q_top' }).qnames, ['App.cn:appdb.tr:q_top', 'App.sq:list.st:call']);
  assert.deepEqual(search({ qname: 'App.sq:*', filter: 'q_top' }).qnames, ['App.sq:list.st:call']);
  // with objectType, both apply
  assert.deepEqual(search({ qname: '*', objectType: 'Connector' }).qnames.sort(), ['App.cn:appdb', 'Lib.cn:db']);
  // regex characters of a QName are literal in the pattern
  assert.deepEqual(search({ qname: 'App.*.q.top' }).qnames, []);
});

test('databaseobject-search lists one type with objectType alone, and refuses a call with nothing to search', () => {
  assert.deepEqual(search({ objectType: 'Transaction' }).qnames.sort(), ['App.cn:appdb.tr:_vide', 'App.cn:appdb.tr:q_top', 'Lib.cn:db.tr:_vide']);
  assert.deepEqual(search({ qname: 'Lib', objectType: 'Transaction' }).qnames, ['Lib.cn:db.tr:_vide']);
  // a filter search is unchanged
  assert.deepEqual(search({ filter: 'SELECT 2' }).qnames, ['Lib.cn:db.tr:_vide']);
  assert.throws(() => search({}), /^Error: filter is required: .*qname limits the search to a project or a subtree; alone, it answers the object at that QName, and with \* it is a QName pattern \(App\.\*\.q_\*\)\.$/);
});

test('the search schema says what qname alone and a qname pattern do', () => {
  const schema = inputSchema('tools_databaseobject_search');
  assert.equal(schema.required, undefined, 'qname alone is a call the client accepts');
  assert.match(schema.properties.qname.description, /Alone \(no filter, no objectType\), answers the object at that QName\. With \*, a QName pattern/);
});

test('project-list pages with the cursor its answer gives: cursor and nextCursor reach _nextCursor (18/11: {cursor} was refused)', () => {
  const { ARGUMENT_ALIASES, applyArgumentAliases } = aliasHelpers();
  assert.deepEqual(plain(ARGUMENT_ALIASES.tools_project_list), { cursor: '_nextCursor', nextCursor: '_nextCursor' });
  assert.deepEqual(plain(applyArgumentAliases('tools_project_list', { cursor: '10', limit: 10 })), { limit: 10, _nextCursor: '10' });
  const schema = inputSchema('tools_project_list');
  assert.equal(schema.additionalProperties, false);
  assert.ok(schema.properties.cursor && schema.properties.nextCursor, 'both names pass a closed schema');
  assert.match(schema.properties.cursor.description, /^nextCursor of the previous answer/);
});

// batch-call runs each tool without the router: it maps the aliases the tool's schema declares the same way.
function batchCheck() {
  const source = read('js/tools_batch_call.js');
  const start = source.indexOf('  function schemaAliases(sequenceName) {');
  const end = source.indexOf('  // Tool names of the same family');
  assert.ok(start > 0 && end > start);
  const sandbox = { C8O: {}, JSON };
  sandbox.include = file => vm.runInContext(read(file), sandbox, { filename: file });
  vm.createContext(sandbox);
  sandbox.include('js/schema_overrides.js');
  vm.runInContext(source.slice(start, end) + '\nthis.checkCallArguments = checkCallArguments;', sandbox);
  return sandbox.checkCallArguments;
}

function sequenceWith(name) {
  const names = declaredVariables(name);
  return { getName: () => name, getVariablesList: () => ({ size: () => names.length, get: i => ({ getName: () => names[i] }) }) };
}

test('batch-call maps the aliases a tool declares, as a direct call does, and keeps the field when both differ', () => {
  const check = batchCheck();
  const report = { warnings: [] };
  const search = { project: 'App', query: 'amount' };
  check(sequenceWith('tools_databaseobject_search'), 'databaseobject-search', search, report, Object.keys(search));
  assert.deepEqual(plain(search), { qname: 'App', filter: 'amount' });
  assert.deepEqual(report.warnings, []);
  const both = { target: 'App.sq:list', qname: 'App.sq:other' };
  const report2 = { warnings: [] };
  check(sequenceWith('tools_databaseobject_tree_get'), 'databaseobject-tree-get', both, report2, Object.keys(both));
  assert.deepEqual(plain(both), { target: 'App.sq:list' });
  assert.match(report2.warnings[0], /^databaseobject-tree-get: qname is an alias of target and both were given with different values: target was kept\.$/);
});

test('a project and a QName inside it agree: tree-get {project, qname} runs on the QName (18/11: refused as a conflict)', () => {
  const { applyArgumentAliases, argumentAliasConflict } = aliasHelpers();
  const args = { project: 'App', qname: 'App.sq:list', childrenDepth: 3 };
  assert.equal(argumentAliasConflict('tools_databaseobject_tree_get', args), '');
  assert.deepEqual(plain(applyArgumentAliases('tools_databaseobject_tree_get', args)), { childrenDepth: 3, target: 'App.sq:list' });
  const reverse = { target: 'App', qname: 'App.sq:list' };
  assert.equal(argumentAliasConflict('tools_databaseobject_tree_get', reverse), '');
  assert.deepEqual(plain(applyArgumentAliases('tools_databaseobject_tree_get', reverse)), { target: 'App.sq:list' });
  assert.match(argumentAliasConflict('tools_databaseobject_tree_get', { project: 'Other', qname: 'App.sq:list' }), /^Nothing was run: target is given twice/);
  assert.match(argumentAliasConflict('tools_databaseobject_tree_get', { project: 'App', qname: 'Apps.sq:list' }), /^Nothing was run/, 'a whole name, not a prefix');
});

test('batch-call keeps the QName of a project and a QName inside it, without a warning', () => {
  const check = batchCheck();
  const report = { warnings: [] };
  const args = { project: 'App', qname: 'App.sq:list' };
  check(sequenceWith('tools_databaseobject_tree_get'), 'databaseobject-tree-get', args, report, Object.keys(args));
  assert.deepEqual(plain(args), { target: 'App.sq:list' });
  assert.deepEqual(report.warnings, []);
});
