const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// mcp_endpoint answers the content of a tool's top-level result as the tool result. A result built at run time (a
// JsonToXmlStep of a JavaScript value) has an empty text as sample, and the output schema said {result: string}: an
// agent's code read out.result, undefined, and failed on .slice (CRM 13/11, 22 tools). The schema now describes the content.

const root = path.resolve(__dirname, '../..');
const yaml = fs.readFileSync(path.join(root, '_c8oProject/sequences/internal_json_schema.yaml'), 'utf8');
const line = yaml.split('\n').find(l => /Object\.prototype\.hasOwnProperty\.call\(responseSource, "result"\)/.test(l));

function unwrap(sample) {
  const box = { responseSource: sample };
  vm.runInNewContext(line, box);
  return JSON.parse(JSON.stringify(box.responseSource));
}

test('the output schema describes the content of result, any object when it is built at run time', () => {
  assert.ok(line, 'the unwrap line is in BuildModels');
  assert.deepEqual(unwrap({ result: '' }), {}, 'a run-time result: any object, never {result: string}');
  assert.deepEqual(unwrap({ result: { status: 'ok', created: [] } }), { status: 'ok', created: [] });
  assert.deepEqual(unwrap({ result: [] }), {});
  assert.deepEqual(unwrap({ status: 'ok' }), { status: 'ok' }, 'an answer without result stays as it is');
  assert.doesNotMatch(yaml, /if \(responseSource && responseSource\.result\) \{ responseSource = responseSource\.result; \}/);
});
