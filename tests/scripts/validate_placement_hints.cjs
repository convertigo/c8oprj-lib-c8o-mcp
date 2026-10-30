const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The refusal of a create the engine does not take under its parent says how to write it. An agent declared the input of
// a SQL transaction as a StepVariable and was told about JavaScript variables (usage tests 30/10).

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'js/databaseobject_batch.js'), 'utf8');
const at = source.indexOf('  function placementHint(');
const ctx = {};
vm.runInNewContext(source.slice(at, source.indexOf('\n  }\n', at) + 4), ctx);
const hint = ctx.placementHint;
const B = 'com.twinsoft.convertigo.beans.';

test('a StepVariable under a transaction or a sequence points to RequestableVariable', () => {
  for (const parent of [B + 'transactions.SqlTransaction', B + 'sequences.GenericSequence']) {
    const text = hint(B + 'variables.StepVariable', parent, 'Shop.cn:Db.tr:list', 'inside', '');
    assert.match(text, /^: a transaction or a sequence takes its inputs as RequestableVariable \(className variables\.RequestableVariable\)\./, parent);
  }
});

test('a StepVariable elsewhere, a step under a call step and a misplaced at keep their hints', () => {
  assert.match(hint(B + 'variables.StepVariable', B + 'steps.SimpleStep', 'Shop.sq:a.st:s', 'inside', ''), /To declare or set a JavaScript variable, assign it in a SimpleStep/);
  assert.match(hint(B + 'steps.JsonSourceStep', B + 'steps.SequenceStep', 'Shop.sq:a.st:call', 'inside', ''), /a call step only holds its variables.*target Shop\.sq:a\.st:call with at:"after"/);
  assert.match(hint(B + 'steps.SimpleStep', B + 'sequences.GenericSequence', 'Shop.sq:a', 'after', 'Shop.sq:a.st:x'), /^: at:"after" places it next to Shop\.sq:a\.st:x/);
  assert.equal(hint(B + 'steps.SimpleStep', B + 'core.Project', 'Shop', 'inside', ''), '.');
});
