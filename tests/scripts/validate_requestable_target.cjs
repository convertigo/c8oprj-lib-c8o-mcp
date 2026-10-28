const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// requestable-execute split its target on dots, so the Studio QName that other tools return
// (ContactsMix.cn:contactsDB.tr:create_contacts_table) looked for a connector named "cn:contactsDB" (Vibe run, 28/10).

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const util = read('js/util.js');
const parseTargetSource = util.slice(util.indexOf('C8O.requestable.parseTarget = '), util.indexOf('\n};\n', util.indexOf('C8O.requestable.parseTarget = ')) + 3);

function world(vars) {
  const ctx = Object.assign({
    C8O: {
      util: {
        toTrimmedString: v => (v == null ? '' : String(v).trim()),
        toBoolean: (v, d) => (v == null ? !!d : String(v).toLowerCase() === 'true'),
        parseObjectInput: v => (v == null || v === '' ? {} : typeof v === 'string' ? JSON.parse(v) : v)
      },
      requestable: {}
    },
    java: { lang: { System: { currentTimeMillis: () => 0 } } },
    include() {}
  }, vars);
  vm.createContext(ctx);
  vm.runInContext(parseTargetSource, ctx);
  return ctx;
}

// The JavaScript of a SimpleStep expression in a sequence YAML: the literal block holds one single-quoted string.
function stepExpression(file, step) {
  const lines = read(file).split('\n');
  const at = lines.findIndex(l => l.startsWith('↓' + step + ' [steps.SimpleStep'));
  const start = lines.findIndex((l, i) => i > at && /^\s*expression: \|\s*$/.test(l));
  const indent = lines[start + 1].match(/^\s*/)[0];
  const body = [];
  for (let i = start + 1; i < lines.length && (lines[i].startsWith(indent) || !lines[i].trim()); i++) {
    body.push(lines[i].slice(indent.length));
  }
  return body.join('\n').trim().replace(/^'|'$/g, '').replace(/''/g, "'");
}

const plain = t => JSON.parse(JSON.stringify(t));

test('a requestable target is read in the dotted form and in the Studio QName form', () => {
  const parse = world().C8O.requestable.parseTarget;
  const transaction = { project: 'ContactsMix', connector: 'contactsDB', name: 'create_contacts_table', isSequence: false };
  for (const text of ['ContactsMix.cn:contactsDB.tr:create_contacts_table', 'ContactsMix.contactsDB.create_contacts_table',
    ' ContactsMix.cn:contactsDB.create_contacts_table ']) {
    assert.deepEqual(plain(parse(text)), Object.assign({ requestable: text.trim() }, transaction), text);
  }
  const sequence = { project: 'ContactsMix', connector: null, name: 'getContacts', isSequence: true };
  assert.deepEqual(plain(parse('ContactsMix.sq:getContacts')), Object.assign({ requestable: 'ContactsMix.sq:getContacts' }, sequence));
  assert.deepEqual(plain(parse('ContactsMix.getContacts')), Object.assign({ requestable: 'ContactsMix.getContacts' }, sequence));
  // A transaction name keeps the dots after the connector, as before.
  assert.equal(parse('App.db.a.b').name, 'a.b');
  assert.equal(parse('App.cn:db.tr:a.b').name, 'a.b');
  // A sequence written like a transaction (App.sequences.x) still reaches configureExecutor's sequence alias.
  assert.deepEqual([parse('App.sequences.x').connector, parse('App.sequences.x').name], ['sequences', 'x']);
});

test('a requestable target without a name is refused as before', () => {
  const parse = world().C8O.requestable.parseTarget;
  assert.throws(() => parse(''), /^Error: requestable is required$/);
  assert.throws(() => parse('ContactsMix'), /requestable must be <project>\[\.<connector>\]\.<requestable>/);
  assert.throws(() => parse('ContactsMix.sq:'), /requestable name is missing/);
  assert.throws(() => parse('ContactsMix.cn:db.tr:'), /requestable name is missing/);
});

test('requestable-execute plans the QName of a transaction on its connector', () => {
  const ctx = world({ requestable: 'ContactsMix.cn:contactsDB.tr:create_contacts_table', variables: '{"id": 1}',
    recordSchema: null, includeLogs: 'true', context: {} });
  vm.runInContext(stepExpression('_c8oProject/sequences/tools_requestable_execute.yaml', 'Init'), ctx);
  const plan = ctx.executionPlan;
  assert.deepEqual([plan.project, plan.connector, plan.name, plan.isSequence], ['ContactsMix', 'contactsDB', 'create_contacts_table', false]);
  assert.equal(plan.requestable, 'ContactsMix.cn:contactsDB.tr:create_contacts_table', 'the answer names the target as it was given');
  assert.deepEqual(plain(plan.variables), { id: 1 });
  assert.equal(plan.includeLogs, true);
});

test('requestable-execute plans the QName of a sequence as a sequence', () => {
  const ctx = world({ requestable: 'ContactsMix.sq:getContacts', variables: null, recordSchema: null, includeLogs: null, context: {} });
  vm.runInContext(stepExpression('_c8oProject/sequences/tools_requestable_execute.yaml', 'Init'), ctx);
  assert.deepEqual([ctx.executionPlan.connector, ctx.executionPlan.name, ctx.executionPlan.isSequence], [null, 'getContacts', true]);
});

test('requestable-stub-get and -set read the QName form too', () => {
  const ctx = world();
  vm.runInContext(read('js/requestable_stub.js'), ctx);
  const parse = ctx.C8O.requestableStub._parseRequestable;
  assert.equal(parse('ContactsMix.cn:contactsDB.tr:list').qname, 'ContactsMix.cn:contactsDB.tr:list');
  assert.equal(parse('ContactsMix.contactsDB.list').qname, 'ContactsMix.cn:contactsDB.tr:list');
  assert.equal(parse('ContactsMix.sq:getContacts').qname, 'ContactsMix.sq:getContacts');
  assert.equal(parse('ContactsMix.getContacts').qname, 'ContactsMix.sq:getContacts');
});
