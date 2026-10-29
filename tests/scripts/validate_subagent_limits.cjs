const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A verifier asked 7 paths ran out of its 150 s default before the last one (verdict partial, stopReason "time
// budget"), and the agent ran the whole verification again (usage tests 29/10, S3). Its default limits grow with the
// paths; an explicit limit, a workspace override and the profile bounds still win.

const root = path.resolve(__dirname, '../..');

function subagents() {
  const context = { C8O: {}, include() {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/subagents.js'), 'utf8'), context);
  return context.C8O.subagents;
}

const paths = n => Array.from({ length: n }, (_, i) => 'path ' + (i + 1));

test('the verifier default budget grows with the paths, within the profile bounds', () => {
  const S = subagents();
  const limits = params => JSON.parse(JSON.stringify(S.resolveProfile('verifier', params, {}).limits));
  assert.deepEqual(limits({ paths: paths(2) }), { maxSteps: 40, timeBudgetSec: 150, maxCostUsd: 0.5 });
  assert.deepEqual(limits({ inputs: JSON.stringify({ paths: paths(7) }) }), { maxSteps: 63, timeBudgetSec: 280, maxCostUsd: 0.5 });
  assert.deepEqual(limits({ paths: paths(8).join('\n') }), { maxSteps: 72, timeBudgetSec: 320, maxCostUsd: 0.5 });
  assert.equal(limits({ paths: paths(20) }).timeBudgetSec, 540, 'bounded by the profile');
  assert.equal(limits({ paths: paths(7), timeBudgetSec: 90 }).timeBudgetSec, 90, 'an explicit limit wins');
  assert.equal(S.resolveProfile('verifier', { paths: paths(7) }, { profiles: { verifier: { timeBudgetSec: 120 } } }).limits.timeBudgetSec, 120,
    'a workspace override wins');
  assert.equal(S.resolveProfile('constructor', { paths: paths(7) }, {}).limits.timeBudgetSec, 900, 'the constructor keeps its own');
});
