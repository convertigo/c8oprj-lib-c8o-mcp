const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// requestable-execute on a sequence that needs a signed-in user answered "Authentication required": the agent ran the
// login sequence and tried again, twice, though a login run by requestable-execute keeps no session for the next call
// (usage tests 29/10, S1 replay). The error now says to pass authenticatedUser.

const root = path.resolve(__dirname, '../..');
const yaml = fs.readFileSync(path.join(root, '_c8oProject/sequences/tools_requestable_execute.yaml'), 'utf8');
const start = yaml.indexOf('        if (/^Authentication required\\b/');
const block = yaml.slice(start, yaml.indexOf('        }\n', start) + 10);

function run(message, authenticatedUser) {
  const ctx = { out: { error: { message } }, executionPlan: { authenticatedUser } };
  vm.createContext(ctx);
  vm.runInContext(block, ctx);
  return ctx.out.error;
}

test('Authentication required without authenticatedUser says to pass it', () => {
  assert.ok(start > 0);
  assert.match(run('Authentication required').hint, /call it again with authenticatedUser .*keeps no session for the next call/);
  assert.equal(run('Authentication required', 'demo').hint, undefined, 'a call that gave a user gets no such hint');
  assert.equal(run('Could not execute the SQL query').hint, undefined);
});
