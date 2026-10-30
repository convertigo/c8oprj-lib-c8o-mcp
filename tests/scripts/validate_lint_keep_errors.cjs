// C8Oforms 30/10: project-lint counted 4 SEC-ANONYMOUS-WRITE errors but listed none of them, its findings list being full
// of 300 i18n warnings found first. A full list now still takes an error, in place of its last warning.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const javaProxy = new Proxy(function () {}, { get: () => javaProxy, apply: () => javaProxy, construct: () => javaProxy });

function lint() {
  const sandbox = { C8O: { dbo: {}, util: {} }, Packages: javaProxy, JSON };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/tools_project_lint.js'), 'utf8'), sandbox, { filename: 'tools_project_lint.js' });
  return sandbox.C8O.lint;
}

const f = (rule, severity) => ({ rule, severity });

test('a list with room takes every finding', () => {
  const L = lint();
  const list = [];
  L.keepFinding(list, f('A', 'warning'), 3);
  L.keepFinding(list, f('B', 'error'), 3);
  assert.deepEqual(list.map(x => x.rule), ['A', 'B']);
});

test('a full list drops a new warning and takes a new error in place of its last warning', () => {
  const L = lint();
  const list = [f('W1', 'warning'), f('E1', 'error'), f('W2', 'warning')];
  L.keepFinding(list, f('W3', 'warning'), 3);
  assert.deepEqual(list.map(x => x.rule), ['W1', 'E1', 'W2']);
  L.keepFinding(list, f('SEC', 'error'), 3);
  assert.deepEqual(list.map(x => x.rule), ['W1', 'E1', 'SEC']);
  L.keepFinding(list, f('SEC2', 'error'), 3);
  assert.deepEqual(list.map(x => x.rule), ['E1', 'SEC', 'SEC2']);
});

test('a list full of errors keeps the first ones', () => {
  const L = lint();
  const list = [f('E1', 'error'), f('E2', 'error')];
  L.keepFinding(list, f('E3', 'error'), 2);
  assert.deepEqual(list.map(x => x.rule), ['E1', 'E2']);
});

test('project-lint adds every finding through keepFinding', () => {
  const source = fs.readFileSync(path.join(root, 'js/tools_project_lint.js'), 'utf8');
  assert.match(source, /C8O\.lint\.keepFinding\(findings, \{ rule: rule, severity: severity,/);
  assert.doesNotMatch(source, /if \(findings\.length < MAX_FINDINGS\) \{\n\s*findings\.push/);
});
