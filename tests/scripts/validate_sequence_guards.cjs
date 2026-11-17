// Run: node --test tests/scripts/validate_sequence_guards.cjs
// A guard placed after the call that writes refuses once the write is done (measured run, 17/11: a delete sequence called
// the delete, then read the role and refused non-admins: every caller's delete went through). js/sequence_guards.js finds
// them for project-lint (SEQ-GUARD-AFTER-WRITE) and tree-apply; a check of the write's own answer is left alone.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function load() {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(read('js/sequence_guards.js'), sandbox, { filename: 'sequence_guards.js' });
  return sandbox.C8O.sequenceGuards;
}

let next = 100;
function node(cls, name, extra, kids) {
  const n = Object.assign({ name, priority: ++next, kids: kids || [], enabled: true }, extra || {});
  n.getClass = () => ({ getName: () => 'com.twinsoft.convertigo.beans.steps.' + cls });
  n.getName = () => n.name;
  n.isEnabled = () => n.enabled;
  return n;
}
const seq = kids => ({ kids, getClass: () => ({ getName: () => 'com.twinsoft.convertigo.beans.sequences.GenericSequence' }), getName: () => 'delete_item' });
const hooks = writes => ({
  isWrite: step => writes.includes(step),
  refsOf: step => (step.src ? [{ priority: String(step.src.priority) }] : []),
  children: dbo => dbo.kids || [],
});
const names = found => JSON.parse(JSON.stringify(Array.from(found).map(f => f.guardName + '<' + f.writeName)));

test('a role check placed after the delete it guards is found, with how to fix it', () => {
  const G = load();
  const del = node('SequenceStep', 'CallDelete');
  const role = node('SequenceStep', 'CheckAdminRole');
  const roleVar = node('SimpleSourceStep', 'RoleOf', { src: role, getVariableName: () => 'role' });
  const guard = node('IfStep', 'IfNotAdmin', { getCondition: () => 'role != "admin"' }, [node('XMLErrorStep', 'Forbidden')]);
  const found = G.guardsAfterWrite(seq([node('InputVariablesStep', 'Inputs'), del, role, roleVar, guard]), hooks([del]));
  assert.deepEqual(names(found), ['IfNotAdmin<CallDelete']);
  assert.match(G.message('App.sq:delete_item', found[0]), /^In App\.sq:delete_item, IfNotAdmin can refuse the caller, but it runs after CallDelete, which writes: the write is done for every caller/);
  assert.match(G.fix(found[0]), /^Move IfNotAdmin \(and the reads it needs, a role read for example\) before CallDelete with databaseobject-move/);
});

test('the same guard before the write, a check of the write answer, and a ReturnStep alone are left alone', () => {
  const G = load();
  const del = node('SequenceStep', 'CallDelete');
  const before = node('IfStep', 'IfNotAdmin', { getCondition: () => 'role != "admin"' }, [node('XMLErrorStep', 'Forbidden')]);
  assert.deepEqual(names(G.guardsAfterWrite(seq([before, del]), hooks([del]))), []);

  const insert = node('TransactionStep', 'InsertRow');
  const onError = node('IfExistThenElseStep', 'CheckInsert', { src: insert }, [node('ThenStep', 'jThen', {}, [node('XMLErrorStep', 'Failed')])]);
  assert.deepEqual(names(G.guardsAfterWrite(seq([insert, onError]), hooks([insert]))), [], 'an IfExist on the write answer');

  const answer = node('JsonSourceStep', 'Answer', { src: insert, getVariableName: () => 'written' });
  const onField = node('IfStep', 'IfFailed', { getCondition: () => 'written.document.error != null' }, [node('XMLErrorStep', 'Failed')]);
  assert.deepEqual(names(G.guardsAfterWrite(seq([insert, answer, onField]), hooks([insert]))), [], 'an If on a variable read from the answer');

  const early = node('IfStep', 'IfNothing', { getCondition: () => 'count == 0' }, [node('ReturnStep', 'Done')]);
  assert.deepEqual(names(G.guardsAfterWrite(seq([insert, early]), hooks([insert]))), [], 'a ReturnStep alone ends a normal flow');
});

test('a disabled guard, a guard around the write and a sequence without writes are left alone', () => {
  const G = load();
  const del = node('TransactionStep', 'DeleteRow');
  const off = node('IfStep', 'IfOff', { enabled: false, getCondition: () => 'x' }, [node('XMLErrorStep', 'E')]);
  assert.deepEqual(names(G.guardsAfterWrite(seq([del, off]), hooks([del]))), []);
  const inner = node('TransactionStep', 'DeleteInside');
  const around = node('IfStep', 'IfAllowed', { getCondition: () => 'ok' }, [inner, node('XMLErrorStep', 'E')]);
  assert.deepEqual(names(G.guardsAfterWrite(seq([around]), hooks([inner]))), [], 'the write runs inside the guard');
  const guard = node('IfStep', 'IfNotAdmin', { getCondition: () => 'role != "admin"' }, [node('XMLErrorStep', 'Forbidden')]);
  assert.deepEqual(names(G.guardsAfterWrite(seq([node('SequenceStep', 'ReadOnly'), guard]), hooks([]))), []);
});

test('project-lint reports SEQ-GUARD-AFTER-WRITE as an error and tree-apply warns on the sequences it changed', () => {
  const lint = read('js/tools_project_lint.js');
  assert.match(lint, /add\("SEQ-GUARD-AFTER-WRITE", "error", finding\.guard, C8O\.sequenceGuards\.message\(qnameOf\(sequence\), finding\)/);
  const tree = read('js/tools_databaseobject_tree_apply.js');
  const hook = tree.indexOf('C8O.sequenceGuards.guardsAfterWrite(sequenceDbo');
  assert.ok(hook > 0 && hook < tree.indexOf('treeApplyResult = treeApplyCompactResult(treeApplyResult);'));
});
