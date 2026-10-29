const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The guides tell an agent to put an app's server checks in the generated business sequences, before the call of the
// transaction (an IfStep + XMLErrorStep on create, a role check before a delete). upsert-crud removed every step of a
// business sequence but its call and its answer at its next run, so a later field change dropped those checks without
// a word (usage tests 29/10). The steps before the call stay; an unexpected one after it is removed and named.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function backend() {
  const context = { C8O: { util: {} } };
  vm.createContext(context);
  vm.runInContext(read('js/crud_proof.js'), context);
  vm.runInContext(read('js/crud_backend.js'), context);
  return context.C8O.crudBackend;
}

test('the steps before the call of a business sequence are kept', () => {
  const B = backend();
  const step = name => ({ getName: () => name, getFullQName: () => 'Atelier.sq:crud_delete_client.st:' + name });
  const children = [step('CheckAdminRole'), step('CheckRequiredTitre'), step('CallCrud_delete_client'), step('Message'), step('OldPayload')];
  const removed = [];
  const parent = {
    getName: () => 'crud_delete_client',
    getDatabaseObjectChildren: () => ({ size: () => children.length, get: i => children[i] }),
    remove: child => removed.push(child.getName()),
  };
  const warnings = [];
  const ctx = {
    ensureArray: v => (Array.isArray(v) ? v : v == null ? [] : [v]),
    logicalClassName: () => 'steps.SimpleStep',
    addWarning: (_result, text) => warnings.push(text),
  };
  B.pruneUnexpectedChildSteps(ctx, parent, ['CallCrud_delete_client', 'Message'], { deleted: [], updated: [] }, { keepBefore: 'CallCrud_delete_client' });
  assert.deepEqual(removed, ['OldPayload']);
  assert.match(warnings[0], /removed the step OldPayload after the call of crud_delete_client/);
  const source = read('js/crud_backend.js');
  assert.equal((source.match(/\{ keepBefore: "Call" \+ ctx\.ucfirst\(sequence\.getName\(\)\) \}/g) || []).length, 4, 'list, read, count and mutation answers');
});
