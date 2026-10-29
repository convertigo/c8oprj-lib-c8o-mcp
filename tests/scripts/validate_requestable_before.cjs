const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A sequence that needs what a login stores in the session (a role) could not be called: each requestable-execute has
// its own session and authenticatedUser sets the user only; an agent spent its run on it (usage tests 29/10, S7).
// before runs requestables first, in the same session, and the session they opened ends with the call.

const root = path.resolve(__dirname, '../..');

function world(answers) {
  const calls = [];
  const attributes = new Map([['existing', 1]]);
  function JavaMap() { this.m = {}; }
  JavaMap.prototype.put = function (k, v) { this.m[k] = v; };
  const ctx = {
    C8O: {}, include() {}, java: { lang: { System: { currentTimeMillis: () => 1 } } },
    context: {
      httpServletRequest: { id: 'current request' },
      httpSession: {
        getAttributeNames: () => { const keys = [...attributes.keys()]; let i = 0; return { hasMoreElements: () => i < keys.length, nextElement: () => keys[i++] }; },
        removeAttribute: name => attributes.delete(name),
      },
    },
    Packages: { java: { util: { HashMap: JavaMap } }, com: { twinsoft: { convertigo: { engine: {
      Engine: { theApp: { contextManager: { remove() {} } } },
      enums: { JsonOutput: { JsonRoot: { docNode: 'doc' } } },
      util: { XMLUtils: { XmlToJson: doc => JSON.stringify(doc) } },
      requesters: { InternalRequester: function (params, request) {
        this.processRequest = () => {
          calls.push({ params: params.m, request });
          const answer = answers.shift();
          if (answer instanceof Error) throw answer;
          if (answer && answer.sets) attributes.set(answer.sets, 'admin');
          return { getDocumentElement: () => ({ document: answer && answer.error ? { error: answer.error } : {} }) };
        };
        this.getContext = () => null;
      } },
    } } } } },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), ctx);
  return { R: ctx.C8O.requestable, calls, attributes };
}

test('before requestables run first, in order, through the current request, and their session ends with the call', () => {
  const { R, calls, attributes } = world([{ sets: 'role' }, {}]);
  const plan = { requestable: 'App.list_items', before: JSON.stringify([
    { requestable: 'App.login', variables: { user: 'admin', password: 'admin' } }, 'App.cn:db.tr:warm_cache'] ) };
  R.runBefore(plan);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.map(c => c.params))), [
    { __project: 'App', __sequence: 'login', __context: 'mcp_before_1_0', user: 'admin', password: 'admin' },
    { __project: 'App', __connector: 'db', __transaction: 'warm_cache', __context: 'mcp_before_1_1' }]);
  assert.equal(calls[0].request.id, 'current request', 'the same HTTP request, so the same session');
  assert.deepEqual(JSON.parse(JSON.stringify(plan.beforeResults.map(r => r.status))), ['ok', 'ok']);
  R.runBefore(plan);
  assert.equal(calls.length, 2, 'run once per call');
  assert.ok(attributes.has('role'));
  R.endBefore(plan);
  assert.deepEqual([...attributes.keys()], ['existing'], 'only what the before calls added is removed');
});

test('a before call that answers an error or fails stops the call with its message', () => {
  const failing = world([{ error: { message: 'Bad password' } }]);
  assert.throws(() => failing.R.runBefore({ requestable: 'App.list_items', before: [{ requestable: 'App.login' }] }),
    /before\[0\] App\.login answered an error: Bad password\. App\.list_items was not run\./);
  const missing = world([new Error('There is no sequence named "nope"')]);
  assert.throws(() => missing.R.runBefore({ requestable: 'App.list_items', before: [{ requestable: 'App.nope' }] }),
    /before\[0\] App\.nope failed: There is no sequence named "nope" App\.list_items was not run\./);
  assert.throws(() => world([]).R.runBefore({ requestable: 'App.x', before: [{ variables: {} }] }), /before\[0\] needs a requestable/);
  const none = world([]);
  none.R.runBefore({ requestable: 'App.x', before: '' });
  assert.equal(none.calls.length, 0);
});

test('requestable-execute declares before, runs it before the call and ends its session in the result', () => {
  const yaml = fs.readFileSync(path.join(root, '_c8oProject/sequences/tools_requestable_execute.yaml'), 'utf8');
  assert.match(yaml, /↓before \[variables\.RequestableVariable-\d+\]: \n  comment: Requestables to run first, in order, in the same session/);
  assert.match(yaml, /before: typeof before === ''undefined'' \? null : before,/);
  assert.match(yaml, /if \(C8O\.requestable && C8O\.requestable\.endBefore\) \{\s*C8O\.requestable\.endBefore\(executionPlan\);/);
  assert.match(yaml, /requestableExecutionResult\.before = executionPlan\.beforeResults;/);
  const util = fs.readFileSync(path.join(root, 'js/util.js'), 'utf8');
  assert.match(util, /throw new Error\('Execution plan is missing'\);\n  \}\n  C8O\.requestable\.runBefore\(executionPlan\);/);
  assert.match(fs.readFileSync(path.join(root, 'js/schema_overrides.js'), 'utf8'), /before: \{\n\s*description: "Requestables to run first/);
});
