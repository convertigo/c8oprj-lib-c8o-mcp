const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A usage run (30/10) wrote a submit variable as {mode: "SOURCE", form: "?.controls?.['isbn']?.value"}: refused with
// "the source resolves to an empty Angular expression", then the agent copied the full Form source by hand, with the
// form's priority and identifier. form is now a short form like local and global.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function dbo() {
  const P = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : P), apply: () => P, construct: () => P });
  const ctx = { C8O: { util: { toTrimmedString: v => String(v == null ? '' : v).trim() } }, Packages: P, java: P, include() {}, JSON };
  vm.createContext(ctx);
  vm.runInContext(read('js/databaseobject.js'), ctx);
  return ctx.C8O.dbo;
}

function node(className, parent, extra) {
  return Object.assign({ getClass: () => ({ getName: () => 'com.twinsoft.convertigo.beans.' + className }), getParent: () => parent,
    getProject: () => null }, extra || {});
}

const project = node('core.Project', null, { getProject: () => ({ getName: () => 'Shop' }) });
const page = node('ngx.components.PageComponent', project);
const form = node('ngx.components.UIForm', page, { priority: 1793308540822, getIdentifier: () => 'orderForm' });
const event = node('ngx.components.UIControlEvent', form);
const action = node('ngx.components.UIDynamicAction', event);
const variable = node('ngx.components.UIControlVariable', action);

test('form names a control of the enclosing form and expands to the canonical Form source', () => {
  const D = dbo();
  const out = D._expandSmartSourceShorthand({ mode: 'SOURCE', form: 'email' }, variable);
  assert.equal(out.mode, 'SOURCE');
  assert.deepEqual(JSON.parse(out.value), { filter: 'Form', project: 'Shop', input: '', model: {
    data: [{ priority: 1793308540822, identifier: 'orderForm' }], path: "?.controls?.['email']?.value",
    prefix: '', suffix: '', custom: '', useCustom: false } });
  const byPath = D._expandSmartSourceShorthand('{"mode":"SOURCE","form":"?.controls?.[\'isbn\']?.value"}', variable);
  assert.equal(JSON.parse(byPath.value).model.path, "?.controls?.['isbn']?.value");
  assert.equal(JSON.parse(D._expandSmartSourceShorthand({ mode: 'SOURCE', form: "it's" }, variable).value).model.path, "?.controls?.['it\\'s']?.value");
});

test('form outside a form, or with local, is refused with the reason', () => {
  const D = dbo();
  assert.throws(() => D._expandSmartSourceShorthand({ mode: 'SOURCE', form: 'email' }, node('ngx.components.UIText', page)),
    /short form form reads a control of the form the object sits in: no UIForm encloses it\. Use local, or the full Form source\./);
  const noId = node('ngx.components.UIControlVariable', node('ngx.components.UIForm', page, { priority: 1, getIdentifier: () => '' }));
  assert.throws(() => D._expandSmartSourceShorthand({ mode: 'SOURCE', form: 'email' }, noId), /its UIForm has no identifier/);
  assert.throws(() => D._expandSmartSourceShorthand({ mode: 'SOURCE', form: 'email', local: '?.x' }, variable), /takes one of local, global or form/);
  assert.equal(JSON.parse(D._expandSmartSourceShorthand({ mode: 'SOURCE', local: '?.rows' }, variable).value).filter, 'Local');
});

test('the guides offer the form short form', () => {
  assert.match(read('resources/convertigo_common_skill.md'), /in a form's submit action, `\{"mode":"SOURCE","form":"email"\}` \(the value of that control of the enclosing form\)/);
  assert.match(read('resources/convertigo_frontend_ngx.md'), /- Short form: `\{"mode":"SOURCE","form":"email"\}` on a variable inside the form/);
});
