// PCA eval 30/10 (g2): the admin dashboard's "run the reminder check" button called the Private reminder job. The
// Studio does not enforce Private, so the button worked in every check of the agent; a server refuses the call. project-lint
// now reports a CallSequence action whose target is Private (NGX-PRIVATE-CALL).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const javaProxy = new Proxy(function () {}, { get: () => javaProxy, apply: () => javaProxy, construct: () => javaProxy });

function lint() {
  const sandbox = { C8O: { dbo: {}, util: {} }, Packages: javaProxy, JSON, include() {} };
  vm.createContext(sandbox);
  vm.runInContext(read('js/tools_project_lint.js'), sandbox, { filename: 'tools_project_lint.js' });
  return sandbox.C8O.lint;
}

test('the target of a CallSequence action, from the YAML and from the in-memory bean', () => {
  const L = lint();
  assert.equal(L.callTargetOf({ ionBean: 'CallSequenceAction', requestable: 'plain:PcaUpdateTracker.job_runDailyReminder' }), 'PcaUpdateTracker.job_runDailyReminder');
  assert.equal(L.callTargetOf({ name: 'CallSequenceAction', properties: { requestable: { mode: 'plain', value: 'App.list_items' } } }), 'App.list_items');
  assert.equal(L.callTargetOf({ ionBean: 'CallSequence', requestable: 'plain:App.s' }), 'App.s');
  assert.equal(L.callTargetOf({ ionBean: 'SetLocalAction', requestable: 'plain:App.s' }), '', 'not a call');
  assert.equal(L.callTargetOf({ ionBean: 'CallSequenceAction', requestable: 'script:this.x' }), '', 'a script target is not resolved');
  assert.equal(L.callTargetOf({ ionBean: 'CallSequenceAction', requestable: 'plain:not a qname' }), '');
  assert.equal(L.callTargetOf(null), '');
});

test('project-lint reports a page action that calls a Private sequence', () => {
  const source = read('js/tools_project_lint.js');
  assert.match(source, /var callTarget = className === "UIDynamicAction" \? C8O\.lint\.callTargetOf\(bean\) : "";/);
  assert.match(source, /called && String\(called\.getAccessibility\(\)\) === "Private"/);
  assert.match(source, /add\("NGX-PRIVATE-CALL", "error", dbo, "The page calls " \+ callTarget \+ ", a Private sequence: the Studio runs it/);
});
