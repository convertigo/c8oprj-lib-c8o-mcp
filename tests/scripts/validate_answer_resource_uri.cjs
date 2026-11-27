// Run: node --test tests/scripts/validate_answer_resource_uri.cjs
// An agent read the pages of a long answer as convertigo://answers/<id>/page/<n> through requestable-execute and got
// "Resource not found" five times (TigoAccess fcba3bd3, 24/11). Such a URI is no resource: the error now gives the
// answer-page call that reads the page.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const yaml = fs.readFileSync(path.join(root, '_c8oProject/sequences/mcp_resources_read.yaml'), 'utf8');

// The LoadResource step of mcp_resources_read, as the engine runs it.
function load(uri, found = null) {
  const block = yaml.match(/↓LoadResource \[steps\.SimpleStep-\d+\]: \n {2}comment: [^\n]*\n {2}expression: \|\n((?: {4}.*\n)+)/)[1];
  const expression = block.replace(/^ {4}/gm, '').trim().replace(/^'|'$/g, '').replace(/''/g, "'");
  const ctx = {
    uri,
    C8O: { util: { toTrimmedString: v => (v == null ? '' : String(v).trim()) } },
    c8oFindResourceByUri: () => found,
    c8oReadResourceFile: entry => 'text of ' + entry.uri
  };
  vm.createContext(ctx);
  vm.runInContext(expression, ctx, { filename: 'mcp_resources_read.LoadResource' });
  return ctx;
}

test('a page of a kept answer read as a resource names the answer-page call', () => {
  const id = '0123456789abcdef0123456789ABCDEF';
  assert.throws(() => load('convertigo://answers/' + id + '/page/3'),
    /^Error: convertigo:\/\/answers\/0123456789abcdef0123456789ABCDEF\/page\/3 is not a resource: the pages of a long answer are read with the tool answer-page \{"answerId":"0123456789abcdef0123456789abcdef","page":3\}, the call partialAnswer\.next names, never with resources\/read nor requestable-execute\.$/);
  assert.throws(() => load('convertigo://answers/' + id), /answer-page \{"answerId":"0123456789abcdef0123456789abcdef","page":2\}/, 'without a page: the second one');
  assert.throws(() => load('convertigo://answer/' + id + '?page=4'), /"page":4\}/);
});

test('another unknown URI keeps its answer, and a known one is read', () => {
  assert.throws(() => load('convertigo://guides/nothing-here'), /^Error: Resource not found: convertigo:\/\/guides\/nothing-here$/);
  assert.throws(() => load('convertigo://answers/not-an-id/page/2'), /^Error: Resource not found:/);
  const ctx = load('convertigo://resources/convertigo-start', { uri: 'convertigo://resources/convertigo-start' });
  assert.equal(ctx.resourceText, 'text of convertigo://resources/convertigo-start');
});
