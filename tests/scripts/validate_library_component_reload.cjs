const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// The Mobile Builder writes a library's shared component into an app when the app loads, not when a page starts using
// it: a page placing agGrid or apxBarChart failed to compile until the app was reloaded (31/10). After a write that
// uses one whose folder the built app lacks, the MCP saves and reloads the app.

const root = path.resolve(__dirname, '../..');

function load(world) {
  const sandbox = {
    include: () => {},
    Packages: { com: { twinsoft: { convertigo: { engine: { Engine: { theApp: { databaseObjectsManager: {
      getOriginalProjectByName: name => (world.projects.includes(name) ? { getName: () => name, getDirPath: () => '/ws/' + name } : null)
    } } } } } } } },
    java: { io: { File: function (dir, p) { const full = (typeof dir === 'string' ? dir : dir.full) + '/' + p; this.full = full; this.isDirectory = () => world.dirs.includes(full); } } },
    C8O: { dbo: {
      saveProject: p => { world.done.push('save ' + p.getName()); return { saved: true }; },
      reloadProject: name => { world.done.push('reload ' + name); return { reloaded: true, message: '' }; }
    } }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/databaseobject_batch.js'), 'utf8'), sandbox);
  return sandbox.C8O.dbo;
}

const page = component => ({ className: 'ngx.components.PageComponent#PageComponent', name: 'P', children: [
  { className: 'ngx.components.UIUseShared#UIUseShared', name: 'Chart', properties: { sharedcomponent: component } }] });

test('a library component the built app lacks reloads the app; one it has, its own components and an unbuilt app do not', () => {
  const world = { projects: ['Shop'], dirs: ['/ws/Shop/_private/ionic/src/app', '/ws/Shop/_private/ionic/src/app/components/lib_extendedcomponents_ui_ngx.aggrid'], done: [] };
  const dbo = load(world);
  const said = dbo.reloadForLibraryComponents('Shop.Application.NgxApp.Stats', page('libApexCharts.MobileApplication.Application.apxBarChart'));
  assert.deepEqual(world.done, ['save Shop', 'reload Shop']);
  assert.match(said, /^Shop was reloaded so that the Mobile Builder writes the library components its pages now use \(libApexCharts\.apxBarChart\)\.$/);
  world.done.length = 0;
  assert.equal(dbo.reloadForLibraryComponents('Shop', page('lib_ExtendedComponents_ui_ngx.MobileApplication.Application.agGrid')), '', 'already written');
  assert.equal(dbo.reloadForLibraryComponents('Shop', page('Shop.MobileApplication.Application.Card')), '', 'a component of the app itself');
  assert.equal(dbo.reloadForLibraryComponents('Shop', { tree: { properties: { comment: 'no component' } } }), '');
  assert.equal(dbo.reloadForLibraryComponents('Shop', [{ tool: 'databaseobject-tree-apply', arguments: { tree: page({ mode: 'PLAIN', value: 'Shop.MobileApplication.Application.Card' }) } }]), '');
  world.dirs = [];
  assert.equal(dbo.reloadForLibraryComponents('Shop', page('libApexCharts.MobileApplication.Application.apxBarChart')), '', 'never built: the first build writes them all');
  assert.deepEqual(world.done, []);
});

test('tree-apply, batch-call and ngx-page-create run the check after their writes', () => {
  const treeApply = fs.readFileSync(path.join(root, 'js/tools_databaseobject_tree_apply.js'), 'utf8');
  assert.match(treeApply, /treeApplyResult\.dryRun !== true && treeApplyResult\.status !== "failed" && typeof C8O\.dbo\.reloadForLibraryComponents === "function"\) \{\s*var treeApplyLibraryReload = C8O\.dbo\.reloadForLibraryComponents\(targetInput, op\);/);
  const batchCall = fs.readFileSync(path.join(root, 'js/tools_batch_call.js'), 'utf8');
  assert.match(batchCall, /var libraryReload = C8O\.dbo\.reloadForLibraryComponents\(app, calls\);/);
  const generator = fs.readFileSync(path.join(root, 'js/tools_generators_ngx.js'), 'utf8');
  assert.match(generator, /C8O\.dbo\.reloadForLibraryComponents\(projectName, \{ sharedcomponent: gridLibrary\.sharedComponent \}\)/);
});
