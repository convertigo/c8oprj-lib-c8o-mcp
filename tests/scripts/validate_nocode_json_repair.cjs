// Run: node --test tests/scripts/validate_nocode_json_repair.cjs
// The JSON text an agent sends to the no-code form tools (reduced, form, patch, operations as a string): read strictly,
// and the slips of long JSON repaired when they have one reading (js/nocode_forms.js repairJsonText), each repair listed
// on the value for the answer (repairs). Texts taken from the answers of 19/11 (local-forms-model eval): a brace too
// many at the end of a saveTo, a brace or a bracket missing before "sort", a brace misplaced, comments. Pure: no engine.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
function forms() {
  const empty = new Proxy(function () {}, { get: (_, key) => key === Symbol.toPrimitive ? () => '' : empty });
  const sandbox = { Packages: empty, java: { lang: { System: { currentTimeMillis: () => 1800000000000 } } } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/nocode_forms.js'), 'utf8'), sandbox, { filename: 'nocode_forms.js' });
  return sandbox.C8O.nocodeForms;
}
const read = text => forms().parseObject(text, 'reduced', {});
const repairsOf = value => plain((value.__textRepairs || []).map(repair => repair.message));
const plain = value => JSON.parse(JSON.stringify(value));

// A submit whose saveTo closes one brace too many (fewshot_ml4 9f7ac353af2c): the toast stays in the same flow.
const EXTRA_BRACE = '{"name":"Claims","pages":[{"name":"Home","fields":[{"type":"button","name":"save","label":"Save","flow":"save_claim"}]}],' +
  '"flows":[{"id":"save_claim","name":"Save","elements":[{"type":"submit","saveTo":{"table":{"id":1,"path":"W~>B~>Claims"},' +
  '"values":{"Client":"client","Statut":{"value":"Ouvert"}}}}},{"type":"toast","message":"Saved","color":"success"},{"type":"push_page","targetPage":"Home"}]}]}';
// A grid source whose filter is not closed before sort (lora_none ea9a09bf91e8): sort belongs to the source.
const MISSING_BRACE = '{"name":"Invoices","pages":[{"name":"List","fields":[{"type":"text","name":"search"},{"type":"grid","name":"invoices",' +
  '"source":{"table":3517,"columns":["Invoice","Customer"],"filter":{"all":[{"any":[{"column":"Invoice","operator":"contains","value":{"field":"search"}},' +
  '{"column":"Customer","operator":"contains","value":{"field":"search"}}]}],"sort":"-Invoiced on"}},{"type":"button","name":"open","label":"Open","flow":"open"}]}],' +
  '"flows":[{"id":"open","name":"Open","elements":[{"type":"toast","message":"x"}]}]}';

test('valid JSON is read as it is, with nothing listed', () => {
  const value = read('{"name":"Ok","pages":[{"name":"A","fields":[{"type":"text","name":"html","description":"<p>}}]]</p>"}]}]}');
  assert.equal(value.pages[0].fields[0].description, '<p>}}]]</p>');
  assert.equal(value.__textRepairs, undefined);
  assert.equal(Object.keys(value).includes('__textRepairs'), false);
});

test('a brace too many in a run of closing braces is removed, the next element stays in its flow', () => {
  const value = read(EXTRA_BRACE);
  const elements = value.flows[0].elements;
  assert.deepEqual(plain(elements.map(element => element.type)), ['submit', 'toast', 'push_page']);
  assert.deepEqual(plain(elements[0].saveTo.values), { Client: 'client', Statut: { value: 'Ouvert' } });
  const [repair] = repairsOf(value);
  assert.match(repair, /^a '\}' too many removed at position \d+ \(\.\.\..*"Ouvert"\}\}\}\}\},\{"type":"toast".*\.\.\.\)\. The JSON text was read after this repair/);
  assert.equal(value.__textRepairs[0].code, 'json_text_repaired');
  assert.equal(value.__textRepairs[0].at, 'reduced');
  assert.ok(!JSON.stringify(value).includes('__textRepairs'), 'never sent nor saved');
});

test('a brace missing before a key is added in the run of closing brackets, where the key belongs', () => {
  const value = read(MISSING_BRACE);
  const grid = value.pages[0].fields[1];
  assert.equal(grid.source.sort, '-Invoiced on', 'sort is a key of the source, not of the filter');
  assert.deepEqual(plain(Object.keys(grid.source.filter)), ['all']);
  assert.equal(value.pages[0].fields[2].type, 'button');
  assert.match(repairsOf(value)[0], /^a missing '\}' added at position \d+/);
});

test('a brace and a bracket missing at the same place are both added there', () => {
  const text = MISSING_BRACE.replace('}]}],"sort"', '}]},"sort"');
  const value = read(text);
  assert.equal(value.pages[0].fields[1].source.sort, '-Invoiced on');
  assert.deepEqual(repairsOf(value).map(message => message.replace(/ at position.*/, '')), ["a missing ']' added", "a missing '}' added"]);
});

test('a brace misplaced in indented JSON is moved back where the object ends', () => {
  const text = `{
  "name": "Booking",
  "pages": [{ "name": "Home", "fields": [{ "type": "button", "name": "book", "label": "Book", "flow": "save" }] }],
  "flows": [
    {
      "id": "save",
      "name": "Save",
      "elements": [
        {
          "type": "submit",
          "saveTo": {
            "table": { "id": 1004, "path": "Club~>Base~>Bookings" },
            "values": { "Player": "player" }
          },
        {
          "type": "toast",
          "message": "Saved"
        }
        }
      ]
    }
  ]
}`;
  const value = read(text);
  assert.deepEqual(plain(value.flows[0].elements.map(element => element.type)), ['submit', 'toast']);
  assert.deepEqual(plain(Object.keys(value.flows[0].elements[0])), ['type', 'saveTo']);
  assert.deepEqual(repairsOf(value).map(message => message.replace(/ at position.*/, '')), ["a '}' added where it was missing", "the misplaced '}' removed"]);
});

test('comments, a comma before a closing bracket and a code fence are removed', () => {
  const value = read('```json\n{\n  "name": "Claims", // the form\n  "pages": [{ "name": "A", "fields": [{ "type": "text", "name": "url", "placeholder": "http://x" },] }],\n  /* none yet */ "flows": []\n}\n```');
  assert.equal(value.name, 'Claims');
  assert.equal(value.pages[0].fields[0].placeholder, 'http://x', 'a // inside a string is text');
  assert.deepEqual(repairsOf(value).map(message => message.replace(/\. The JSON.*/, '')), ['the ``` code fence around the JSON removed', '2 comment(s) removed', '1 comma(s) before a closing bracket removed']);
});

test('text that is not one slip is refused with the place of the first error', () => {
  // three braces missing: not a slip
  assert.throws(() => read('{"name":"A","pages":[{"name":"P","fields":[{"type":"text","name":"a"'), /reduced is not valid JSON.*3 bracket\(s\) left open|reduced is not valid JSON/);
  // a cut string (a truncated answer) is never completed
  assert.throws(() => read('{"name":"A","pages":[{"name":"P","fields":[{"type":"text","name":"a'), /reduced is not valid JSON/);
  // a key where a value is expected: the model wrote no JSON there
  assert.throws(() => read('{"name":"A","pages":[{"name":"P","fields":[{"type": "conditional": {"when": "x"}}]}]}'),
    /reduced is not valid JSON \(\d+ characters were received in full, this is not a transport truncation\): ',' or '\}' was expected at position 65/);
});

test('two readings that weigh the same are refused rather than guessed', () => {
  // the missing brace closes either "a" or "b": two readings, the same number of closing brackets next to each
  assert.throws(() => read('{"a":{"x":"1","b":{"y":"2","z":"3"}'), /reduced is not valid JSON/);
});

test('operations given as JSON text are repaired the same way and keep their repairs', () => {
  const nocode = forms();
  const operations = nocode.parseOperations('[{"action":"add_field","pageName":"A","fieldObject":{"type":"text","name":"x"}}},{"action":"remove_field","fieldName":"y"}]', 'operations', []);
  assert.deepEqual(plain(operations.map(op => op.action)), ['add_field', 'remove_field']);
  assert.match(operations.__textRepairs[0].message, /^a '\}' too many removed/);
  assert.equal(operations.__textRepairs[0].at, 'operations');
});

test('a form or a patch given as an object is taken as it is', () => {
  const nocode = forms();
  const value = { name: 'Object', pages: [] };
  assert.equal(nocode.parseObject(value, 'reduced', {}), value);
  assert.equal(value.__textRepairs, undefined);
});
