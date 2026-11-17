// Run: node --test tests/scripts/validate_runtime_output_fields.cjs
// A field a JsonToXmlStep builds at run time has an empty text as sample, so the derived output schema says string. When
// the value is a list or an object, a client that checks the answer against the schema (Vibe, the MCP SDKs) refuses the
// whole call: every databaseobject-move and databaseobject-delete failed as mcp_transport_failed although the MCP answered
// in 30 ms with warnings: [] (measured run, 17/11). Every such field of a tool whose schema is derived is declared.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sandbox = { C8O: {} };
sandbox.include = file => vm.runInContext(read(file), sandbox, { filename: file });
vm.createContext(sandbox);
vm.runInContext(read('js/schema_overrides.js'), sandbox, { filename: 'js/schema_overrides.js' });
const overrides = sandbox.C8O.schemaOverrides;
const plain = value => JSON.parse(JSON.stringify(value));
const listed = (sequence, derived) => plain(overrides.decorateOutput(sequence, overrides.applyOutput(sequence, plain(derived), null), null, null));

// The keys of the JsonToXmlStep fields of a tool sequence (its key property, else its step name).
function runtimeKeys(yaml) {
  const keys = new Set();
  const re = /↓(\w+) \[steps\.JsonToXmlStep[^\n]*\n/g;
  let m;
  while ((m = re.exec(yaml))) {
    const block = yaml.slice(m.index + m[0].length, m.index + m[0].length + 900);
    const key = /key: \n(?:.*\n){0,6}?\s*- →→: (\w+)/.exec(block);
    keys.add(key ? key[1] : m[1]);
  }
  // result is replaced by its content when the schema is built (tests/scripts/validate_output_schema_result.cjs)
  keys.delete('result');
  return keys;
}

test('no tool declares a field built at run time as a string', () => {
  const dir = path.join(root, '_c8oProject/sequences');
  const left = [];
  for (const file of fs.readdirSync(dir).filter(f => /^tools_.*\.yaml$/.test(f))) {
    const keys = runtimeKeys(fs.readFileSync(path.join(dir, file), 'utf8'));
    if (!keys.size) continue;
    const sequence = file.replace(/\.yaml$/, '');
    const derived = { type: 'object', properties: {} };
    keys.forEach(k => { derived.properties[k] = { type: 'string' }; });
    const schema = listed(sequence, derived);
    keys.forEach(k => {
      const p = (schema.properties || {})[k];
      if (p && p.type === 'string') left.push(sequence + '.' + k);
    });
  }
  assert.deepEqual(left, [], 'declare them in RUNTIME_OUTPUT_FIELDS of js/schema_overrides.js, or give the tool its own output schema');
});

test('the answers of databaseobject-move and databaseobject-delete fit their schema, warnings included', () => {
  for (const sequence of ['tools_databaseobject_move', 'tools_databaseobject_delete']) {
    const schema = listed(sequence, { type: 'object', properties: { warnings: { type: 'string' }, done: { type: 'boolean' } } });
    assert.deepEqual(schema.properties.warnings, { type: 'array', items: { type: 'string' } }, sequence);
  }
});
