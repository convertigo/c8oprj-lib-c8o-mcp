// The edit profiles of a Tigo conversation (js/edit_profile.js, header X-Convertigo-Edit-Profile): yaml takes away the
// tools that change a project, html adds the Ionic round-trip import; without the header nothing changes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function requestWith(headers) {
  return { getHeader: name => (headers && headers[name] != null ? headers[name] : null) };
}

function loadPolicy(headers) {
  const sandbox = { context: { httpServletRequest: requestWith(headers) } };
  vm.runInNewContext(read('js/edit_profile.js'), sandbox);
  return sandbox.C8O.editProfile;
}

const toolSequences = fs.readdirSync(path.join(root, '_c8oProject/sequences'))
  .filter(name => /^tools_.*\.yaml$/.test(name))
  .map(name => name.replace(/\.yaml$/, ''));

// The real tools/call decision of the router, without executing the selected requestable.
const routerSource = read('js/mcp_endpoint_router.js');
const decision = routerSource.slice(routerSource.indexOf('  var toolNameRaw = paramsObject'), routerSource.indexOf('  if (mappingError) {'));
function route(name, headers, args) {
  const sandbox = {
    context: { httpServletRequest: requestWith(headers) },
    C8O: { guidance: { warningForToolCall: () => '', stripToolArguments: a => a } },
    paramsObject: { name, arguments: args || {} },
    mcpAuthentication: { kind: 'token' }
  };
  vm.runInNewContext(read('js/nocode_tool_policy.js'), sandbox);
  vm.runInNewContext(read('js/edit_profile.js'), sandbox);
  vm.runInNewContext(decision, sandbox);
  return sandbox;
}

function toolName(sequence) {
  const parts = sequence.replace(/^tools_/, '').split('_');
  return parts.shift() + '-' + parts.join('-');
}

test('without the header, or with any other value, the profile is the default and lists and runs every tool', () => {
  for (const headers of [{}, { 'X-Convertigo-Edit-Profile': '' }, { 'X-Convertigo-Edit-Profile': 'mcp' },
    { 'X-Convertigo-Edit-Profile': 'nocode' }, { 'X-Convertigo-Edit-Profile': 'files' }]) {
    const policy = loadPolicy(headers);
    assert.equal(policy.current(), '');
    for (const sequence of toolSequences) {
      assert.equal(policy.lists(sequence), true, sequence);
      assert.equal(policy.refused(sequence, {}), '', sequence);
    }
  }
  // the router decides every tool as before: the profile never sets mappingError without its header
  for (const sequence of toolSequences) {
    const out = route(toolName(sequence), {}, {});
    if (out.mappingError) {
      assert.doesNotMatch(String(out.mappingError.message), /edit profile/, sequence);
    }
  }
});

test('the header is read case-insensitively, trimmed, and only yaml and html are profiles', () => {
  assert.equal(loadPolicy({ 'X-Convertigo-Edit-Profile': ' YAML ' }).current(), 'yaml');
  assert.equal(loadPolicy({ 'X-Convertigo-Edit-Profile': 'Html' }).current(), 'html');
  assert.equal(loadPolicy({ 'X-Convertigo-Edit-Profile': 'files' }).current(), '');
  // a request-less context (a test, a scheduled job) is the default
  const sandbox = {};
  vm.runInNewContext(read('js/edit_profile.js'), sandbox);
  assert.equal(sandbox.C8O.editProfile.current(), '');
});

test('yaml takes away every writer of the constructor lock but project-reload and mobile-builder-build, and project-delete', () => {
  const source = read('js/subagents.js');
  const list = source.slice(source.indexOf('api.WRITE_SEQUENCES'));
  const writers = list.slice(list.indexOf('{'), list.indexOf('}') + 1).match(/tools_[a-z_]+/g);
  assert.ok(writers.length > 10);
  const policy = loadPolicy({ 'X-Convertigo-Edit-Profile': 'yaml' });
  const kept = ['tools_project_reload', 'tools_mobile_builder_build', 'tools_batch_call'];
  for (const sequence of writers) {
    if (kept.indexOf(sequence) >= 0) {
      assert.equal(policy.lists(sequence), true, sequence);
      continue;
    }
    assert.equal(policy.lists(sequence), false, sequence);
    assert.ok(policy.refused(sequence, {}).length, sequence);
  }
  assert.equal(policy.lists('tools_project_delete'), false);
  // reading and checking stay
  for (const sequence of ['tools_databaseobject_tree_get', 'tools_databaseobject_search', 'tools_databaseobject_schema',
    'tools_palette_list', 'tools_palette_describe', 'tools_requestable_execute', 'tools_project_lint',
    'tools_mobile_builder_build', 'tools_mobile_builder_open', 'tools_browser_verify', 'tools_project_reload',
    'tools_batch_call', 'tools_log_view', 'tools_project_list', 'tools_project_js_get']) {
    assert.equal(policy.lists(sequence), true, sequence);
    assert.equal(policy.refused(sequence, {}), '', sequence);
  }
  // subagent-run stays listed: a verifier and the collect of a run are reads
  assert.equal(policy.lists('tools_subagent_run'), true);
  // every refused sequence is a real tool
  for (const sequence of Object.keys(policy.YAML_REFUSED)) {
    if (sequence !== 'tools_facade_create') {
      assert.ok(toolSequences.indexOf(sequence) >= 0, sequence);
    }
  }
});

test('yaml refuses the edits made another way: a constructor sub-agent, requestable-execute of a writer or of the Tigo projects', () => {
  const policy = loadPolicy({ 'X-Convertigo-Edit-Profile': 'yaml' });
  assert.match(policy.refused('tools_subagent_run', { profile: 'constructor', task: 'x' }), /subagent-run/);
  assert.equal(policy.refused('tools_subagent_run', { profile: 'verifier', task: 'x' }), '');
  assert.equal(policy.refused('tools_subagent_run', { runId: 'r1' }), '');
  assert.equal(policy.refused('tools_requestable_execute', { requestable: 'lib_ConvertigoMCP.tools_databaseobject_tree_apply' }), 'databaseobject-tree-apply');
  assert.equal(policy.refused('tools_requestable_execute', { requestable: 'lib_ConvertigoMCP.sq:tools_project_save' }), 'project-save');
  assert.match(policy.refused('tools_requestable_execute', { requestable: 'lib_ConvertigoAssistant.AgentSendMessage' }), /lib_ConvertigoAssistant/);
  assert.match(policy.refused('tools_requestable_execute', { requestable: 'lib_ConvertigoAgentBridge.agent_vibe_start' }), /lib_ConvertigoAgentBridge/);
  assert.equal(policy.refused('tools_requestable_execute', {
    requestable: 'lib_ConvertigoMCP.tools_subagent_run', variables: JSON.stringify({ profile: 'constructor', task: 't' })
  }), 'subagent-run (constructor)');
  // the guides, the project's own sequences and the readers stay
  assert.equal(policy.refused('tools_requestable_execute', { requestable: 'lib_ConvertigoMCP.mcp_resources_read', variables: { uri: 'x' } }), '');
  assert.equal(policy.refused('tools_requestable_execute', { requestable: 'SalesPipeline.crm_list_companies' }), '');
  assert.equal(policy.refused('tools_requestable_execute', { requestable: 'lib_ConvertigoMCP.tools_databaseobject_tree_get' }), '');
  assert.match(policy.refusal('databaseobject-tree-apply'), /yaml edit profile.+project-reload.+convertigo-yaml-editing/);
});

test('the router answers the yaml refusal for a tool that changes a project, and nothing else changes', () => {
  const yaml = { 'X-Convertigo-Edit-Profile': 'yaml' };
  const refused = route('databaseobject-tree-apply', yaml, { target: 'P', tree: {} });
  assert.equal(refused.mappingError.status, '403');
  assert.match(refused.mappingError.message, /yaml edit profile/);
  assert.equal(route('ngx-page-create', yaml, {}).mappingError.status, '403');
  assert.equal(route('requestable-execute', yaml, { requestable: 'lib_ConvertigoMCP.tools_ngx_page_create' }).mappingError.status, '403');
  for (const tool of ['databaseobject-tree-get', 'project-reload', 'project-lint', 'mobile-builder-build', 'browser-verify', 'batch-call']) {
    assert.equal(route(tool, yaml, {}).mappingError, null, tool);
  }
  // html refuses nothing
  for (const sequence of toolSequences) {
    const out = route(toolName(sequence), { 'X-Convertigo-Edit-Profile': 'html' }, {});
    if (out.mappingError) {
      assert.doesNotMatch(String(out.mappingError.message), /edit profile/, sequence);
    }
  }
});

test('tools/list skips the refused tools in yaml, on a line of its own', () => {
  const list = read('_c8oProject/sequences/mcp_tools_list.yaml');
  assert.match(list, /include\("js\/edit_profile\.js"\);/);
  assert.match(list, /if \(C8O\.editProfile && !C8O\.editProfile\.lists\(seqName\)\) \{\n\s+continue;\n\s+\}/);
});

test('batch-call refuses an inner call that changes a project in yaml', () => {
  const source = read('js/tools_batch_call.js');
  assert.match(source, /C8O\.editProfile\.assertAllowed\(sequenceName, callArguments\);/);
  const policy = loadPolicy({ 'X-Convertigo-Edit-Profile': 'yaml' });
  assert.throws(() => policy.assertAllowed('tools_databaseobject_rename', { qname: 'P.s', name: 'n' }), /yaml edit profile/);
  assert.doesNotThrow(() => policy.assertAllowed('tools_databaseobject_tree_get', {}));
  assert.doesNotThrow(() => loadPolicy({}).assertAllowed('tools_databaseobject_rename', {}));
});

test('the guides of a profile are listed in that profile only, and readable by uri', () => {
  const index = JSON.parse(read('resources/resources_index.json'));
  const yamlGuide = index.find(entry => entry.uri === 'convertigo://resources/convertigo-yaml-editing');
  const htmlGuide = index.find(entry => entry.uri === 'convertigo://resources/convertigo-ngx-html-roundtrip');
  assert.equal(yamlGuide.profile, 'yaml');
  assert.equal(htmlGuide.profile, 'html');
  assert.ok(fs.existsSync(path.join(root, 'resources', yamlGuide.file)));
  assert.ok(fs.existsSync(path.join(root, 'resources', htmlGuide.file)));
  const listed = profile => index.filter(entry => loadPolicy(profile ? { 'X-Convertigo-Edit-Profile': profile } : {}).listsResource(entry)).map(entry => entry.uri);
  const byDefault = listed('');
  assert.equal(byDefault.length, index.length - 2);
  assert.ok(byDefault.indexOf(yamlGuide.uri) < 0 && byDefault.indexOf(htmlGuide.uri) < 0);
  assert.ok(listed('yaml').indexOf(yamlGuide.uri) >= 0 && listed('yaml').indexOf(htmlGuide.uri) < 0);
  assert.ok(listed('html').indexOf(htmlGuide.uri) >= 0 && listed('html').indexOf(yamlGuide.uri) < 0);
  assert.match(read('_c8oProject/sequences/mcp_resources_list.yaml'), /C8O\.editProfile\.listsResource\(entry\)/);
  // the generic harness copies the guides of no profile as skills
  assert.match(read('js/setup_common.js'), /!trim\(entry\.profile\)\.length && trim\(entry\.file\)\.length/);
  // the guides name tools that exist and the routes of their profile
  assert.match(read('resources/convertigo_yaml_editing.md'), /project-reload/);
  assert.match(read('resources/convertigo_ngx_html_roundtrip.md'), /project-reload\(project=<project>, fromIonic=true, ionicTarget=/);
});

test('the served guides hold no stray tool-call markup', () => {
  const markup = /<\/?(antml|invoke|parameter|function_calls|function_results|result|output)\b|\bantml:|<\/?tool_use|\[TOOL_CALLS\]|<\|.*?\|>/;
  for (const file of fs.readdirSync(path.join(root, 'resources')).filter(name => /\.(md|json)$/.test(name))) {
    assert.doesNotMatch(read('resources/' + file), markup, file);
  }
});

// js/schema_overrides.js: project-reload takes fromIonic and ionicTarget, and mobile-builder-open answers ionicFiles,
// in the html profile only; without it their schemas are the ones before the profile existed.
function schemaOverrides(headers) {
  const sandbox = { context: { httpServletRequest: requestWith(headers) }, include: file => vm.runInNewContext(read(file), sandbox) };
  vm.runInNewContext(read('js/schema_overrides.js'), sandbox);
  return sandbox.C8O.schemaOverrides;
}

test('project-reload declares and answers the ionic fields in the html profile only', () => {
  const derivedInput = () => ({ type: 'object', properties: { project: { type: 'string' }, fromIonic: { type: 'string' }, ionicTarget: { type: 'string' } }, additionalProperties: false });
  const derivedOutput = () => ({ type: 'object', properties: { project: { type: 'string' }, reloaded: { type: 'boolean' }, fromIonic: { type: 'boolean' },
    ionicImported: { type: 'boolean' }, ionicSource: { type: 'string' }, ionicTarget: { type: 'string' }, ionicReport: { type: 'object' }, errors: { type: 'array' } } });
  for (const headers of [{}, { 'X-Convertigo-Edit-Profile': 'yaml' }]) {
    const overrides = schemaOverrides(headers);
    const input = overrides.decorateInput('tools_project_reload', derivedInput(), null);
    assert.deepEqual(Object.keys(input.properties), ['project']);
    const output = overrides.decorateOutput('tools_project_reload', derivedOutput(), null, null);
    assert.deepEqual(Object.keys(output.properties).filter(key => !/^(error|argumentWarning|operatorNote|repeatedFailure)$/.test(key)), ['project', 'reloaded', 'errors']);
    const open = overrides.decorateOutput('tools_mobile_builder_open', { type: 'object', properties: { status: { type: 'string' } } }, null, null);
    assert.equal(open.properties.ionicFiles, undefined);
  }
  const html = schemaOverrides({ 'X-Convertigo-Edit-Profile': 'html' });
  const input = html.decorateInput('tools_project_reload', derivedInput(), null);
  assert.equal(input.properties.fromIonic.type, 'boolean');
  assert.equal(input.properties.ionicTarget.type, 'string');
  const output = html.decorateOutput('tools_project_reload', derivedOutput(), null, null);
  assert.ok(output.properties.ionicReport.properties.skipped);
  assert.ok(output.properties.ionicReport.properties.warnings);
  const open = html.decorateOutput('tools_mobile_builder_open', { type: 'object', properties: { status: { type: 'string' } } }, null, null);
  assert.ok(open.properties.ionicFiles.properties.pages);
});

test('project-reload imports from the generated files in the html profile only, through the engine entry point', () => {
  const reload = read('_c8oProject/sequences/tools_project_reload.yaml');
  assert.match(reload, /var fromIonicFlag = !!C8O\.editProfile && C8O\.editProfile\.current\(\) === "html" && /);
  assert.match(reload, /C8O\.ionicRoundTrip\.importIntoLoadedProject\(providedName, ionicTargetPath, errorEntries\)/);
  const roundTrip = read('js/ionic_roundtrip.js');
  assert.match(roundTrip, /NgxIonicRoundTripConverter/);
  assert.doesNotMatch(roundTrip, /ConvertigoPlugin|importProjectFromIonic|reloadProjectFromIonic/);
});

// js/ionic_roundtrip.js with a fake engine: a converter that has the entry point, or none.
function roundTrip(converter, headers) {
  class FakeFile {
    constructor(parent, child) { this.p = child === undefined ? String(parent) : String(parent.p || parent) + '/' + child; }
    exists() { return true; }
    isDirectory() { return false; }
    getAbsolutePath() { return this.p; }
    listFiles() { return null; }
    getName() { return this.p.split('/').pop(); }
  }
  const project = { getDirPath: () => '/ws/projects/App', getName: () => 'App' };
  const sandbox = {
    context: { httpServletRequest: requestWith(headers) },
    Packages: {
      java: { io: { File: FakeFile } },
      com: { twinsoft: { convertigo: {
        engine: { util: { NgxIonicRoundTripConverter: converter || {} }, Engine: { theApp: { databaseObjectsManager: { getOriginalProjectByName: name => (name === 'App' ? project : null) } } } },
        beans: { ngx: { components: { PageComponent: function () {}, UISharedComponent: function () {} } } }
      } } }
    }
  };
  vm.runInNewContext(read('js/edit_profile.js'), sandbox);
  vm.runInNewContext(read('js/ionic_roundtrip.js'), sandbox);
  return sandbox.C8O.ionicRoundTrip;
}

test('the import answers unsupported on an engine without the entry point', () => {
  const api = roundTrip(null);
  assert.equal(api.supported(), false);
  const errors = [];
  const result = api.importIntoLoadedProject('App', '', errors);
  assert.equal(result.status, 'unsupported');
  assert.equal(result.reloaded, false);
  assert.match(errors[0].message, /no Ionic round-trip import/);
  assert.equal(api.projectSummary('App').supported, false);
});

test('the import calls importIntoLoadedProject and reads its report', () => {
  const calls = [];
  const api = roundTrip({
    importIntoLoadedProject: (name, target) => {
      calls.push([name, target]);
      return { toString: () => JSON.stringify({ project: name, processed: 2, pagesUpdated: 1, sharedComponentsUpdated: 0, templatesUpdated: 1,
        stylesUpdated: 1, scriptsUpdated: 0, skipped: 0, warnings: ['w1'], changedObjects: ['App.MobileApplication.NgxApp.Companies'] }) };
    }
  });
  const result = api.importIntoLoadedProject('App', '_private/ionic/src/app/pages/companies/companies.html', []);
  assert.deepEqual(calls, [['App', '_private/ionic/src/app/pages/companies/companies.html']]);
  assert.equal(result.status, 'imported_from_ionic');
  assert.equal(result.reloaded, true);
  assert.equal(result.ionicReport.pagesUpdated, 1);
  assert.deepEqual(Array.from(result.ionicReport.warnings), ['w1']);
  assert.deepEqual(Array.from(result.ionicReport.changedObjects), ['App.MobileApplication.NgxApp.Companies']);
  // no target: null, every sidecar
  api.importIntoLoadedProject('App', '  ', []);
  assert.equal(calls[1][1], null);
  // the global styles are not imported
  const refused = api.importIntoLoadedProject('App', '_private/ionic/src/global.scss', []);
  assert.match(refused.message, /Forbidden Ionic target/);
  assert.equal(calls.length, 2);
  // an unknown project
  assert.match(api.importIntoLoadedProject('Other', '', []).message, /not loaded/);
});

test('a tree change waits for imported file edits in the html profile only', () => {
  const pending = {
    importIntoLoadedProject: () => ({ toString: () => '{}' }),
    pendingIonicChanges: () => ({ isEmpty: () => false, size: () => 1, get: () => '/ws/projects/App/_private/ionic/src/app/pages/p/p.html' })
  };
  const html = roundTrip(pending, { 'X-Convertigo-Edit-Profile': 'html' });
  html.files = () => ({ container: 'App.MobileApplication.NgxApp.P', html: 'a', scss: 'b', ts: 'c', importWith: 'project-reload(...)' });
  assert.throws(() => html.assertNoPendingEdits({ getParent: () => null }, 'This deletion'), /not imported yet.+This deletion/);
  const byDefault = roundTrip(pending, {});
  byDefault.files = html.files;
  assert.doesNotThrow(() => byDefault.assertNoPendingEdits({ getParent: () => null }, 'This deletion'));
  assert.match(read('js/tools_databaseobject_tree_apply.js'), /if \(C8O\.editProfile\.current\(\) === "html" && !\(dryRunInput/);
  assert.equal((read('js/databaseobject_ops.js').match(/_c8oPendingIonicEdits\(/g) || []).length, 5);
});
