const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function adapter() {
  const calls = [];
  const document = {revision:'source:3',membershipOrder:'explicit',tags:{stable:{label:'Tag'}},assignments:{'Demo.sq:Main':['second','first']}};
  const value = {toString:()=>JSON.stringify(document),set:(key,v)=>{document[key]=v;}};
  const manager = {
    read(...args) { calls.push(['read',...args]); return value; },
    suggestions(project) { calls.push(['suggestions',project]); return {path:()=>[{label:'Suggested'}]}; },
    mutate(...args) { calls.push(['mutate',...args]); return value; }
  };
  const Tags = {TagManager:{get:()=>manager,Scope:{valueOf:scope=>scope}},TagDocument:{parseObject:JSON.parse}};
  const sandbox = {Packages:{java:{lang:{CharSequence:class {}}},com:{twinsoft:{convertigo:{engine:{tags:Tags}}}}}};
  vm.runInNewContext(read('js/tags.js'), sandbox);
  return {api:sandbox.C8O.tags,Tags,calls,document};
}

test('tag reads delegate to the Studio domain and preserve identities/order', () => {
  const {api,calls} = adapter();
  const result = api.get({scope:'projectObjects',project:'Demo'});
  assert.deepEqual(calls,[['read','projectObjects','Demo',null],['suggestions','Demo']]);
  assert.deepEqual(plain(result.assignments['Demo.sq:Main']),['second','first']);
  assert.equal(result.revision,'source:3');
});

test('workspace reference preview is forwarded without loading or saving a project', () => {
  const {api,calls} = adapter();
  api.get({scope:'workspaceProjects',referenceProject:'Demo'});
  assert.deepEqual(calls,[['read','workspaceProjects',null,'Demo']]);
});

test('mutations keep the exact revision, command and input for engine validation', () => {
  const {api,calls} = adapter();
  const input = {targets:['Demo.sq:Main'],tagIds:['second','first']};
  api.apply({scope:'projectObjects',project:'Demo',revision:'source:3',action:'reorder',input:JSON.stringify(input)});
  assert.deepEqual(calls,[['mutate','projectObjects','Demo','source:3','reorder',input]]);
});

test('native object arguments and string transport arguments have the same contract', () => {
  const {api,calls} = adapter();
  const input = {definition:{label:'Baserow',metadata:{flow:{configs:['baserowLab']}}}};
  api.apply({scope:'projectObjects',project:'Demo',revision:'source:3',action:'create',input});
  assert.deepEqual(calls[0].slice(1),['projectObjects','Demo','source:3','create',input]);
  api.apply({scope:'projectObjects',project:'Demo',revision:'source:3',action:'create',input:new String(JSON.stringify(input))});
  assert.deepEqual(calls[1].slice(1),calls[0].slice(1));
  assert.throws(()=>api.apply({scope:'projectObjects',input:[]}),/command object/);
});

test('domain errors propagate; mutations do not save or mutate after rejection', () => {
  const {api,Tags} = adapter();
  Tags.TagManager.get = () => ({mutate(){throw new Error('Tag revision conflict');}});
  assert.throws(()=>api.apply({scope:'projectObjects',revision:'stale',action:'create',input:{}}),/revision conflict/);
});

test('legacy engines without TagManager retain their existing tool catalog', () => {
  const {api,Tags} = adapter();
  delete Tags.TagManager.get;
  assert.equal(api.available(),false);
  assert.throws(()=>api.get({scope:'projectObjects',project:'Demo'}),/shared tag domain/);
  const catalog = read('_c8oProject/sequences/mcp_tools_list.yaml');
  assert.ok(catalog.includes('!C8O.tags.available()'));
});

test('both private sequences are registered and output the complete tag snapshot', () => {
  const project = read('c8oProject.yaml');
  for (const operation of ['get','apply']) {
    assert.ok(project.includes(`sequences/tools_tags_${operation}.yaml`));
    const sequence = read(`_c8oProject/sequences/tools_tags_${operation}.yaml`);
    assert.ok(sequence.startsWith('accessibility: Private'));
    assert.ok(sequence.includes(`C8O.tags.${operation}(`));
    assert.ok(sequence.includes('JsonToXmlStep') && sequence.includes('→→: tagResult'));
    // Convertigo's YAML reader requires the ': ' separator even on empty keys.
    assert.ok(!sequence.split('\n').some(line => line.endsWith(':')));
    assert.ok(!sequence.includes('exportProject') && !sequence.includes('admin.services'));
  }
});

test('tool schemas are explicit and metadata/ordered membership commands are not opaque strings', () => {
  const sandbox = {include(){}};
  vm.runInNewContext(read('js/schema_overrides.js'),sandbox);
  const get = sandbox.C8O.schemaOverrides.applyInput('tools_tags_get',null);
  const apply = sandbox.C8O.schemaOverrides.applyInput('tools_tags_apply',null);
  assert.deepEqual(plain(get.required),['scope']);
  assert.deepEqual(plain(apply.required),['scope','revision','action','input']);
  assert.equal(apply.properties.input.type,'object');
  assert.ok(apply.properties.action.enum.includes('reorder'));
  assert.ok(apply.properties.action.enum.includes('createFromReferences'));
  assert.equal(apply.properties.input.properties.tagIds.items.type,'string');
  assert.equal(apply.properties.input.properties.definition.additionalProperties,true);
  const output = sandbox.C8O.schemaOverrides.applyOutput('tools_tags_apply',{});
  assert.equal(output.properties.tags.additionalProperties,true);
  assert.equal(output.properties.assignments.additionalProperties.items.type,'string');
  assert.equal(output.properties.error.additionalProperties,true);
});

test('NoCode profile does not gain tag management', () => {
  const sandbox = {};
  vm.runInNewContext(read('js/nocode_tool_policy.js'),sandbox);
  assert.equal(sandbox.C8O.nocodeToolPolicy.allows('tools_tags_get'),false);
  assert.equal(sandbox.C8O.nocodeToolPolicy.allows('tools_tags_apply'),false);
});

function reloadAdapter(studioMode) {
  const calls = [];
  const Engine = {isStudioMode:()=>studioMode,theApp:{
    schemaManager:{clearCache:name=>calls.push(['schema',name])},
    databaseObjectsManager:{clearCache:name=>calls.push(['release',name]),getProjectByName:name=>{calls.push(['import',name]);return {};}}
  }};
  const sandbox = {C8O:{util:{toTrimmedString:value=>String(value).trim()}},Packages:{com:{twinsoft:{convertigo:{engine:{Engine}}}}}};
  vm.runInNewContext(read('js/databaseobject_studio.js'),sandbox);
  const api = sandbox.C8O.dbo;
  api.getReloadStudioPlugin = () => ({getDefault:()=>({reloadProject:name=>calls.push(['studio',name])})});
  api.getCachedProjectIdentity = () => 42;
  api.waitForProjectReload = (_plugin,name,identity) => calls.push(['wait',name,identity]);
  return {api,Engine,calls};
}

test('headless Reload uses the ordinary engine lifecycle, not the Eclipse plugin', () => {
  const {api,calls} = reloadAdapter(false);
  assert.equal(api.reloadProject('Demo',[]).reloaded,true);
  assert.deepEqual(calls,[['schema','Demo'],['release','Demo'],['import','Demo']]);
});

test('Studio Reload still waits for the Studio tree, and the active MCP server stays protected', () => {
  const {api,calls} = reloadAdapter(true);
  assert.equal(api.reloadProject('Demo',[]).reloaded,true);
  assert.deepEqual(calls,[['studio','Demo'],['wait','Demo',42]]);
  assert.ok(read('_c8oProject/sequences/tools_project_reload.yaml').includes('Reloading the active MCP server project is forbidden'));
});

test('failed headless Reload is not reported as success', () => {
  const {api,Engine} = reloadAdapter(false);
  Engine.theApp.databaseObjectsManager.getProjectByName = () => {throw new Error('Import failed');};
  const errors = [];
  assert.equal(api.reloadProject('Demo',errors).reloaded,false);
  assert.match(errors[0].message,/Import failed/);
});
