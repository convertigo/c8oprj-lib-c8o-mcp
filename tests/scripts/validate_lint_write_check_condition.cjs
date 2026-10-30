const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// SEQ-WRITE-UNCHECKED read the expressions of a sequence's steps only: a write checked in an IfStep condition
// (writeResult.document.error != null) was still reported unchecked (usage tests 30/10). Conditions are read too.

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'tools_project_lint.js'), 'utf8');

test('the write check reads IfStep conditions as well as step expressions', () => {
  assert.match(src, /var condition = str\(call\(step, "getCondition"\)\);\s*if \(condition\.length\) \{\s*expressions\.push\(condition\);\s*\}/);
  assert.match(src, /if \(writes\.length && !\/\\\.error\\b\|document\\\.error\|\\berror\\b\/\.test\(expressions\.join\("\\n"\)\)\)/);
});
