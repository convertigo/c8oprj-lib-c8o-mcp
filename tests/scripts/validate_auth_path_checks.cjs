// Run: node --test tests/scripts/validate_auth_path_checks.cjs
// Values that were stored with status ok and resolved to nothing at run time (measured runs, 17/11): a step variable of a
// call whose sourceDefinition named an input ("username") or the priority of a sequence variable, and a nodeText given as
// {mode:"JS", value:"username"} that output the word "username". Every sign-in of the app was refused.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'js/databaseobject.js'), 'utf8');

function slice(startMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, startMarker);
  const end = source.indexOf('\n};\n', start);
  return source.slice(start, end + 4);
}

function loadSourceProblem() {
  const sandbox = { C8O: { dbo: {}, util: { toTrimmedString: v => (v === null || v === undefined ? '' : String(v).trim()) } } };
  vm.createContext(sandbox);
  vm.runInContext(slice('C8O.dbo._stepSourceProblem = function'), sandbox);
  return sandbox.C8O.dbo._stepSourceProblem;
}

const list = items => ({ size: () => items.length, get: i => items[i] });

function sequence() {
  const nested = { priority: 205, getName: () => 'Inside', getSteps: () => list([]) };
  const steps = [
    { priority: 201, getName: () => 'Inputs', getSteps: () => list([]) },
    { priority: 202, getName: () => 'IfUser', getSteps: () => list([nested]) },
  ];
  const variables = [{ priority: 110, getName: () => 'username' }];
  const seq = {
    getName: () => 'login',
    getAllSteps: () => list(steps),
    getStep: () => null,
    getVariablesList: () => list(variables),
    getParent: () => null,
  };
  const call = { getParent: () => seq };
  const callVariable = { getParent: () => call };
  return { seq, callVariable };
}

test('a step source must name a step of the same sequence', () => {
  const problem = loadSourceProblem();
  const { callVariable } = sequence();
  assert.equal(problem(['201', './username/text()'], callVariable), '');
  assert.equal(problem(['205', '.'], callVariable), '');
  assert.equal(problem('["201", "."]', callVariable), '');
  assert.match(problem(['username', '.'], callVariable), /^sourceDefinition starts with "username", which is not a step: it would resolve to nothing at run time\. A step source is/);
  assert.match(problem(['110', '.'], callVariable), /^sourceDefinition names 110, the priority of the variable username of login, not of a step: it resolves to nothing\./);
  assert.match(problem(['999', '.'], callVariable), /^sourceDefinition names 999, the priority of no step of login/);
  assert.match(problem(['999', '.'], callVariable), /source an InputVariablesStep \(\.\/<input>\/text\(\)\), or set var <step variable name> = <input>;/);
});

test('an empty source, another shape, or an object outside a sequence is left alone', () => {
  const problem = loadSourceProblem();
  const { callVariable } = sequence();
  assert.equal(problem([], callVariable), '');
  assert.equal(problem(['', ''], callVariable), '');
  assert.equal(problem('plain text', callVariable), '');
  assert.equal(problem({ mode: 'SOURCE' }, callVariable), '');
  assert.equal(problem(['username', '.'], { getParent: () => null }), '');
});

test('the check runs on sourceDefinition before the value is stored', () => {
  const hook = source.indexOf('var sourceProblem = C8O.dbo._stepSourceProblem(rawSpec, dbo);');
  assert.ok(hook > source.indexOf('var rawSpec = C8O.dbo._expandStepSourceShorthand(updates[requestedName], dbo, requestedLookup);'));
  assert.ok(hook < source.indexOf('var setter = pd.getWriteMethod();'));
});

test('a JS expression on nodeText or nodeName is refused with what to do instead', () => {
  const sandbox = { C8O: { dbo: {} } };
  vm.createContext(sandbox);
  vm.runInContext(slice('C8O.dbo._TEXT_ONLY_PROPERTIES = {').replace(/\n\/\/ What to do[\s\S]*$/, ''), sandbox);
  vm.runInContext(slice('C8O.dbo._TEXT_ONLY_HINTS = {'), sandbox);
  assert.equal(sandbox.C8O.dbo._TEXT_ONLY_PROPERTIES.nodeText, true);
  assert.equal(sandbox.C8O.dbo._TEXT_ONLY_PROPERTIES.nodeName, true);
  assert.match(sandbox.C8O.dbo._TEXT_ONLY_HINTS.nodeText, /point sourceDefinition of this step to the step holding it, or use an ElementStep \/ AttributeStep whose expression property is the JS/);
  assert.match(source, /name \+ " is plain text, never evaluated: the JS expression would be stored as its source\. Give the text itself\." \+ \(C8O\.dbo\._TEXT_ONLY_HINTS\[String\(name\)\] \|\| ""\)/);
});

// Engine-like objects for js/step_sources.js: a sequence, its variables, steps with JS, a call step and its variables.
function loadStepSources() {
  const sandbox = { C8O: { dbo: { getDirectChildren: n => (n.children || []).slice() } } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/step_sources.js'), 'utf8'), sandbox, { filename: 'step_sources.js' });
  return sandbox.C8O.stepSources;
}

function bean(kind, name, extra) {
  const n = Object.assign({ name, children: [], parent: null }, extra || {});
  n.getClass = () => ({ getName: () => kind });
  n.getName = () => n.name;
  n.getFullQName = () => (n.parent ? n.parent.getFullQName() + '.' + n.name : 'App.' + n.name);
  n.add = child => { n.children.push(child); child.parent = n; return n; };
  if (/\.steps\./.test(kind)) {
    n.getParentSequence = () => { let p = n.parent; while (p && !/\.sequences\./.test(p.getClass().getName())) p = p.parent; return p; };
  }
  return n;
}
const stepVariable = (name, extra) => bean('com.twinsoft.convertigo.beans.variables.StepVariable', name,
  Object.assign({ getValueOrNull: () => null, getSourceDefinition: () => [] }, extra || {}));

function loginSequence(script) {
  const seq = bean('com.twinsoft.convertigo.beans.sequences.GenericSequence', 'login');
  seq.add(bean('com.twinsoft.convertigo.beans.variables.RequestableVariable', 'username'));
  seq.add(bean('com.twinsoft.convertigo.beans.steps.SimpleStep', 'Prepare', { getExpression: () => script }));
  const call = bean('com.twinsoft.convertigo.beans.steps.TransactionStep', 'CheckUser');
  call.add(stepVariable('username'));
  call.add(stepVariable('password'));
  call.add(stepVariable('hash'));
  call.add(stepVariable('given', { getValueOrNull: () => 'fixed' }));
  call.add(stepVariable('sourced', { getSourceDefinition: () => ['201', './x/text()'] }));
  const loop = bean('com.twinsoft.convertigo.beans.steps.IfStep', 'IfAny', { getCondition: () => 'true' });
  loop.add(bean('com.twinsoft.convertigo.beans.steps.JsonSourceStep', 'Parsed', { getVariableName: () => 'hash' }));
  seq.add(loop);
  seq.add(call);
  return { seq, call };
}

test('a call variable with no source, no value and no name in the sequence will be empty at run time', () => {
  const S = loadStepSources();
  const { call } = loginSequence('log.info("start");');
  assert.deepEqual([...S.emptyCallVariables(call)], ['password']);
  assert.deepEqual([...S.emptyCallVariables(loginSequence('var password = "x";').call)], []);
  assert.deepEqual([...S.emptyCallVariables(loginSequence('password = hash;').call)], []);
  assert.deepEqual([...S.emptyCallVariables(loginSequence('if (password == null) {}').call)], ['password']);
  assert.deepEqual([...S.emptyCallVariables(loginSequence('user.password = 1;').call)], ['password']);
  assert.match(S.emptyCallVariablesWarning('App.sq:login.st:CheckUser', ['password']),
    /^App\.sq:login\.st:CheckUser: password will be empty at run time\. It has no sourceDefinition, no value, and no sequence variable or JS variable of that name in the sequence\./);
});

test('tree-apply warns about them, a call variable changed alone included', () => {
  const tree = fs.readFileSync(path.join(root, 'js/tools_databaseobject_tree_apply.js'), 'utf8');
  assert.match(tree, /var emptyNames = C8O\.stepSources\.emptyCallVariables\(step\);/);
  assert.match(tree, /A variable of a call step changed alone: check its step\./);
});
