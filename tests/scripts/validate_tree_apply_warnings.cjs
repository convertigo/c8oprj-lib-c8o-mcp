const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Warnings tree-apply gives on a written node (js/databaseobject_batch.js): they must point at real dead ends only.
// A false one sends an agent rewriting code that works (usage tests 29/10: the CRUD kit answered 116 warnings about
// its own pages, 52 KB).

const root = path.resolve(__dirname, '../..');
const MANAGED = 'Direct edits on CRUD-kit-managed UI object `App.Application.NgxApp.pg:Home` may be overwritten';

function load() {
  const ctx = {
    C8O: { dbo: {}, crudUiRefresh: { managedCrudMutationWarning: () => MANAGED } },
    include() {},
    java: { lang: { System: { currentTimeMillis: () => Date.now() } } },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/databaseobject_batch.js'), 'utf8'), ctx);
  const dbo = ctx.C8O.dbo;
  // Arrays made in the VM have another prototype: compare plain copies.
  return { batchNodeWarnings: (...args) => JSON.parse(JSON.stringify(dbo.batchNodeWarnings(...args))) };
}

function bean(className, parent, name) {
  return {
    getClass: () => ({ getName: () => 'com.twinsoft.convertigo.beans.ngx.components.' + className }),
    getParent: () => parent || null,
    getName: () => name || className,
    getQName: () => 'App.Application.NgxApp.pg:Home.' + (name || className),
  };
}

test('a page load event is not reported as never firing: the engine calls it from ngOnInit / ngAfterViewInit', () => {
  const D = load();
  for (const viewEvent of ['onWillLoad', 'onDidLoad']) {
    const warnings = D.batchNodeWarnings(bean('UIPageEvent'), { properties: { viewEvent } });
    assert.deepEqual(warnings.filter(w => /never fires/.test(w)), [], viewEvent);
  }
});

test('an event of a shared component instance takes the component event name; a control still needs on/ion', () => {
  const D = load();
  const useShared = bean('UIUseShared', null, 'ListPanel');
  assert.deepEqual(D.batchNodeWarnings(bean('UIControlEvent', useShared, 'ItemSelected'), { properties: { eventName: 'ItemSelected' } })
    .filter(w => /not one of the control events/.test(w)), []);
  const button = bean('UIDynamicElement', null, 'Button');
  const warnings = D.batchNodeWarnings(bean('UIControlEvent', button, 'click'), { properties: { eventName: 'click' } });
  assert.ok(warnings.some(w => /eventName "click" is not one of the control events.*Write onClick\./.test(w)), warnings.join('\n'));
});

test('a write under a CRUD-kit page warns an agent, never the kit writing its own pages', () => {
  const D = load();
  const node = { properties: {} };
  assert.ok(D.batchNodeWarnings(bean('UIText'), node).includes(MANAGED));
  assert.ok(!D.batchNodeWarnings(bean('UIText'), node, { managedCrudWriter: true }).includes(MANAGED));
  const tools = fs.readFileSync(path.join(root, 'js/tools_crud.js'), 'utf8');
  assert.equal((tools.match(/args\.managedCrudWriter = true;\n\s*return C8O\.dbo\.batchApply\(args\);/g) || []).length, 2,
    'both batchApply helpers of the CRUD kit mark the kit as the writer');
});

test('"Name" of an NGX dynamic element is its Ionic property, not the object name', () => {
  // tree-apply of an ion-spinner with Name (its kind) warned "property 'Name' ignored. Use databaseobject-rename" and
  // dropped it; the CRUD kit's own Login template got that warning on every generation (usage tests 29/10).
  const source = fs.readFileSync(path.join(root, 'js/databaseobject_batch.js'), 'utf8');
  assert.match(source, /var ionName = rawName === "Name" && \/\\\.UIDynamicElement\$\/\.test\(/);
  assert.match(source, /if \(reservedKeys\[normalized\] && !ionName\) \{/);
});
