const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// upsert-ngx-crud-kit generated a whole CRUD front of shared components; pages are now built one by one with
// ngx-page-create, and the PipelineCrm runs (12-13/11) had to be told not to use the kit. It was hidden first, then
// removed (13/11): no sequence, no template pages or components, no ui flag of upsert-crud. A call by its name answers
// what replaces it instead of "Unknown tool".

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const MESSAGE = 'upsert-ngx-crud-kit was removed: build the pages with ngx-page-create (one call per page); upsert-crud builds the backend.';

function retired() {
  const context = { C8O: {} };
  vm.createContext(context);
  vm.runInContext(read('js/retired_tools.js'), context);
  return context.C8O;
}

test('the removed tool has no sequence, no template object and no front code left', () => {
  const project = read('c8oProject.yaml');
  assert.doesNotMatch(project, /tools_upsert_ngx_crud_kit|_refreshCrudUiTemplates/);
  assert.match(project, /↓project1 \[references\.ProjectSchemaReference\]: \n\s+projectName: mobilebuilder_tpl_/, 'the NGX template of the app stays');
  for (const file of ['_c8oProject/sequences/tools_upsert_ngx_crud_kit.yaml', '_c8oProject/sequences/_refreshCrudUiTemplates.yaml',
    '_c8oProject/mobilePages/Templates.yaml', '_c8oProject/mobileSharedComponents', 'js/crud_ui_kit.js', 'js/crud_ui_templates.js',
    'js/crud_ui_pages.js', 'js/crud_ui_refresh.js', 'js/crud_viewer.js']) {
    assert.ok(!fs.existsSync(path.join(root, file)), file);
  }
  const app = read('_c8oProject/mobileNgxApp.yaml');
  assert.doesNotMatch(app, /Tpl[A-Z]|↓Templates /);
  assert.match(app, /↓Home \[ngx\.components\.PageComponent-\d+\]: 🗏 mobilePages\/Home\.yaml/, 'the MCP access tokens page stays');
  assert.doesNotMatch(read('js/tools_crud.js'), /crud_ui_|upsertNgxCrudKit|refreshUiTemplates/);
  assert.doesNotMatch(read('js/crud_backend.js'), /upsertNgxCrudKit|uiEnabled/);
});

test('a call by its name answers what replaces it: the MCP router and batch-call', () => {
  const C8O = retired();
  assert.equal(C8O.retiredTools.tools_upsert_ngx_crud_kit, 'ngx-page-create');
  assert.equal(C8O.retiredToolRefusal('tools_upsert_ngx_crud_kit'), MESSAGE);
  assert.equal(C8O.retiredToolRefusal('tools_ngx_page_create'), '');
  assert.equal(C8O.retiredToolRefusal('constructor'), '', 'only the names of the map');

  const router = read('js/mcp_endpoint_router.js');
  assert.match(router, /include\("js\/retired_tools\.js"\);/);
  const refusal = router.match(/\n  \/\/ A removed tool answers what replaces it[^\n]*\n[\s\S]*?\n  \}\n/)[0];
  const box = { C8O, mappingError: null, targetSequence: 'tools_upsert_ngx_crud_kit', toolNameRaw: 'upsert-ngx-crud-kit' };
  vm.runInNewContext(refusal + '\nthis.out = mappingError;', box);
  assert.deepEqual(JSON.parse(JSON.stringify(box.out)), {
    status: '404', code: '-32601', message: MESSAGE,
    data: { name: 'upsert-ngx-crud-kit', sequence: 'tools_upsert_ngx_crud_kit', replacement: 'ngx-page-create' }
  });
  const other = { C8O, mappingError: null, targetSequence: 'tools_ngx_page_create', toolNameRaw: 'ngx-page-create' };
  vm.runInNewContext(refusal + '\nthis.out = mappingError;', other);
  assert.equal(other.out, null, 'any other tool goes on');
  // after the renamed tools, before the policies and the sequence lookup
  const at = name => router.indexOf(name);
  assert.ok(at('RENAMED_TOOL_SEQUENCES[targetSequence]') < at('C8O.retiredToolRefusal(targetSequence)'));
  assert.ok(at('C8O.retiredToolRefusal(targetSequence)') < at('gatewayPolicy.allows(targetSequence)'));
  assert.doesNotMatch(router, /tools_upsert_ngx_crud_kit/, 'no reveal for the removed tool');

  const batch = read('js/tools_batch_call.js');
  assert.match(batch, /include\("js\/retired_tools\.js"\);/);
  assert.match(batch, /var retiredRefusal = C8O\.retiredToolRefusal\(sequenceName\);\n\s+if \(retiredRefusal\.length\) \{\n\s+throw new Error\(retiredRefusal\);/);
});

test('tools/list still leaves it out, and no list of tools names it', () => {
  const list = read('_c8oProject/sequences/mcp_tools_list.yaml');
  assert.match(list, /include\("js\/retired_tools\.js"\);/);
  assert.match(list, /if \(C8O\.retiredTools\[seqName\]\) \{\n\s*continue;\n\s*\}/);
  for (const file of ['js/setup_vibe.js', 'js/subagents.js', 'js/guidance_version.js', 'js/schema_overrides_crud.js']) {
    assert.doesNotMatch(read(file), /upsert-ngx-crud-kit|upsert_ngx_crud_kit/, file);
  }
});

test('upsert-crud builds the backend only: no ui flag, no ui target', () => {
  const crud = read('js/schema_overrides_crud.js');
  const upsert = crud.slice(crud.indexOf('function upsertCrudInputSchema'), crud.indexOf('function crudStatusInputSchema'));
  assert.ok(upsert.length > 0);
  assert.doesNotMatch(upsert, /\bui: h\(\)\.booleanFlagSchema/);
  const output = crud.slice(crud.indexOf('function upsertCrudOutputSchema'), crud.indexOf('C8O.schemaOverridesCrud.applyInput'));
  assert.doesNotMatch(output, /uiEnabled|\bui: h\(\)/);
  const sequence = read('_c8oProject/sequences/tools_upsert_crud.yaml');
  assert.doesNotMatch(sequence, /↓ui \[variables|↓uiEnabled \[|C8O\.util\.toBoolean\(ui,/);
});
