const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// upsert-ngx-crud-kit generated a whole CRUD front of shared components; pages are now built one by one with
// ngx-page-create, and the PipelineCrm runs (12-13/11) had to be told not to use the kit. It stays callable for the
// projects that still use it, but no agent is offered it: not in tools/list, not in Vibe's tools, not as an upsert-crud flag.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('a retired tool is left out of tools/list and of the Vibe tools, and still answers by its name', () => {
  const context = { C8O: {} };
  vm.createContext(context);
  vm.runInContext(read('js/retired_tools.js'), context);
  assert.equal(context.C8O.retiredTools.tools_upsert_ngx_crud_kit, 'ngx-page-create');
  const list = read('_c8oProject/sequences/mcp_tools_list.yaml');
  assert.match(list, /include\("js\/retired_tools\.js"\);/);
  assert.match(list, /if \(C8O\.retiredTools\[seqName\]\) \{\n\s*continue;\n\s*\}/);
  assert.doesNotMatch(read('js/setup_vibe.js'), /upsert-ngx-crud-kit/);
  assert.match(read('c8oProject.yaml'), /↓tools_upsert_ngx_crud_kit \[sequences\.GenericSequence\]/, 'old projects can still call it');
  assert.doesNotMatch(read('js/mcp_endpoint_router.js'), /retiredTools\[/, 'a call by its name is not refused');
});

test('upsert-crud no longer offers its ui flag, which assembled the kit', () => {
  const crud = read('js/schema_overrides_crud.js');
  const upsert = crud.slice(crud.indexOf('function upsertCrudInputSchema'), crud.indexOf('function crudStatusInputSchema'));
  assert.ok(upsert.length > 0);
  assert.doesNotMatch(upsert, /\bui: h\(\)\.booleanFlagSchema/);
  assert.doesNotMatch(upsert, /upsert-ngx-crud-kit/);
});
