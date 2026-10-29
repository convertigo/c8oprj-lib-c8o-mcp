const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// requestable-execute on a transaction the agent had deleted earlier in its run answered the engine's
// NullPointerException ("targetTransaction is null"), three times (usage tests 29/10, CV2 replay). The call now
// names what is missing and what exists.

const root = path.resolve(__dirname, '../..');
const list = items => ({ size: () => items.length, get: i => items[i] });
const named = name => ({ getName: () => name });

function requestable() {
  const connector = Object.assign(named('sql'), {
    getTransactionByName: name => (['list_contact', 'create_contact'].includes(name) ? named(name) : null),
    getTransactionsList: () => list([named('list_contact'), named('create_contact')]),
  });
  const project = {
    getConnectorByName: name => { if (name === 'sql') return connector; throw new Error('There is no connector named "' + name + '"'); },
    getConnectorsList: () => list([connector]),
  };
  const ctx = { C8O: {}, include() {}, java: {}, Packages: { com: { twinsoft: { convertigo: { engine: { Engine: { theApp: {
    databaseObjectsManager: { getOriginalProjectByName: name => { if (name === 'Demo') return project; throw new Error('not found'); } } } } } } } } } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/util.js'), 'utf8'), ctx);
  return ctx.C8O.requestable;
}

test('a missing transaction, connector or project is named with what exists', () => {
  const R = requestable();
  assert.throws(() => R.requireTransaction({ project: 'Demo', connector: 'sql', name: 'delete_contact' }),
    /There is no transaction named delete_contact in connector sql of project Demo\. Its transactions: list_contact, create_contact\./);
  assert.throws(() => R.requireTransaction({ project: 'Demo', connector: 'db', name: 'x' }),
    /There is no connector named db in project Demo\. Its connectors: sql\./);
  assert.throws(() => R.requireTransaction({ project: 'Nope', connector: 'sql', name: 'x' }), /There is no project named Nope/);
  assert.doesNotThrow(() => R.requireTransaction({ project: 'Demo', connector: 'sql', name: 'create_contact' }));
  const source = fs.readFileSync(path.join(root, 'js/util.js'), 'utf8');
  assert.match(source, /C8O\.requestable\.requireTransaction\(executionPlan\);\n\s*C8O\.requestable\.guardDataReset\(executionPlan\);/);
});
