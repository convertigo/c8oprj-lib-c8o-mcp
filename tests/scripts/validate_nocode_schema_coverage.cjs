// Run: node --test tests/scripts/validate_nocode_schema_coverage.cjs
// What the No Code tools read is what their input schemas let a client send. A strict client (Vibe's code mode, an MCP
// SDK) refuses an argument its schema does not declare before the call reaches the tool: 0.3.0-beta.54 took a
// thumbnail named by an attachment, but the operation schema of nocode-form-edit declared only { contentType, base64 },
// and the agent's call was refused on test-nocode (26/11). These checks compare the names the code reads with the
// published schemas, so that a key added to the code without its schema fails here.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function overrides() {
  const sandbox = { C8O: {} };
  sandbox.include = file => vm.runInContext(read(file), sandbox, { filename: file });
  vm.createContext(sandbox);
  vm.runInContext(read('js/schema_overrides.js'), sandbox, { filename: 'js/schema_overrides.js' });
  return sandbox.C8O.schemaOverrides;
}
const schemas = overrides();

function nocodeSequences() {
  return [...read('c8oProject.yaml').matchAll(/↓(tools_nocode_[a-z0-9_]+) \[sequences\.GenericSequence\]/g)].map(m => m[1]);
}
function variablesOf(sequence) {
  return [...read(`_c8oProject/sequences/${sequence}.yaml`).matchAll(/^↓([A-Za-z_][A-Za-z0-9_]*) \[variables\.RequestableVariable-\d+\]:/gm)].map(m => m[1]);
}
function inputOf(sequence) {
  const properties = {};
  variablesOf(sequence).forEach(name => { properties[name] = { type: 'string' }; });
  return plain(schemas.applyInput(sequence, { type: 'object', properties }, null));
}
// Variables the host or the router sets, never the agent (js/nocode_write_confirm.js IGNORED_ARGUMENTS).
const HOST_SUPPLIED = ['conversationId', 'browserDebugPort', '_showExperimental', '__nolog', '_nextCursor', '_progressToken', '_meta', 'confirmId'];

test('every variable of a No Code tool is declared by its schema, and every name its step reads is one of its variables', () => {
  const sequences = nocodeSequences();
  assert.ok(sequences.length >= 18, String(sequences.length));
  for (const sequence of sequences) {
    const variables = variablesOf(sequence);
    const schema = inputOf(sequence);
    if (schema.additionalProperties === false) {
      const undeclared = variables.filter(name => !(name in (schema.properties || {})) && !HOST_SUPPLIED.includes(name));
      assert.deepEqual(undeclared, [], sequence + ': variables a strict client cannot send');
    }
    const yaml = read(`_c8oProject/sequences/${sequence}.yaml`);
    const readNames = [...new Set([...yaml.matchAll(/typeof ([A-Za-z_][A-Za-z0-9_]*) [!=]==? "undefined"/g)].map(m => m[1]))]
      .filter(name => !['C8O', 'context', 'include', 'Packages', 'java', 'log'].includes(name));
    const unknown = readNames.filter(name => !variables.includes(name));
    assert.deepEqual(unknown, [], sequence + ': names read without a variable');
  }
});

test('nocode-form-get and nocode-baserow-rows-delete: what the code reads is declared', () => {
  const forms = read('js/nocode_forms.js');
  const readFn = forms.slice(forms.indexOf('C8O.nocodeForms.read = function'), forms.indexOf('C8O.nocodeForms.read = function') + 4000);
  const askKeys = [...new Set([...readFn.matchAll(/question\.([A-Za-z]+)/g)].map(m => m[1]))];
  assert.ok(askKeys.includes('component') && askKeys.includes('warnings'), askKeys.join(','));
  const get = inputOf('tools_nocode_form_get');
  assert.deepEqual(askKeys.filter(key => !(key in get.properties)), [], 'nocode-form-get keys missing from the schema');
  const baserow = read('js/nocode_baserow.js');
  const del = baserow.slice(baserow.indexOf('C8O.nocodeBaserow.rowsDelete = function'), baserow.indexOf('// nocode-baserow-schema-get: the read counterpart'));
  const optKeys = [...new Set([...del.matchAll(/opts\.([A-Za-z]+)/g)].map(m => m[1]))].filter(key => key !== 'token');
  const rowsDelete = inputOf('tools_nocode_baserow_rows_delete');
  assert.deepEqual(optKeys.filter(key => !(key in rowsDelete.properties)), [], 'rows-delete keys missing from the schema');
});

// normalizeSchema reads a field under several names; the schema publishes one of each. A key read and neither published
// nor listed here as an alias of a published one is a key a strict client cannot send.
const FIELD_ALIASES = { column: 'name', mandatory: 'required', obligatoire: 'required', notes: 'description', comment: 'description',
  options: 'values', linkRowTable: 'targetTable', relation: 'targetTable', target: 'targetTable', table: 'targetTable',
  throughField: 'through', linkField: 'through', lookupField: 'targetField', field: 'targetField', linkRowRelatedFieldName: 'relatedFieldName',
  optionsObject: 'baserowOptions', remove: 'delete', newName: 'rename', decimalPlaces: 'decimals' };

test('nocode-baserow-schema-apply: every field key the tool reads is published, or an alias of a published one', () => {
  const baserow = read('js/nocode_baserow.js');
  const normalize = baserow.slice(baserow.indexOf('function normalizeSchema('), baserow.indexOf('function pushAction('));
  const numbers = baserow.slice(baserow.indexOf('function numberSpec('), baserow.indexOf('function numberValueFacts('));
  const keys = [...new Set([...(normalize + numbers).matchAll(/field\.([A-Za-z]+)/g)].map(m => m[1]))].filter(key => !['raw', 'number'].includes(key));
  const schema = inputOf('tools_nocode_baserow_schema_apply');
  const fieldSchema = schema.properties.schema.oneOf[0].properties.tables.items.properties.fields.items;
  const published = Object.keys(fieldSchema.properties);
  for (const key of ['rename', 'delete', 'confirmDelete', 'formula', 'relatedFieldName', 'targetTable']) assert.ok(published.includes(key), key);
  const missing = keys.filter(key => !published.includes(key) && !(FIELD_ALIASES[key] && published.includes(FIELD_ALIASES[key])));
  assert.deepEqual(missing, [], 'field keys read by the tool and not published');
  assert.deepEqual(fieldSchema.required, ['name'], 'a rename or a delete needs no type');
});

test('nocode-form-edit: the operation keys the tool reads are accepted by the operation schema, the thumbnail in both shapes', () => {
  const edit = inputOf('tools_nocode_form_edit');
  const op = edit.properties.operations.oneOf.find(item => item.items).items;
  const forms = read('js/nocode_forms.js');
  const table = forms.slice(forms.indexOf('var EDIT_OPERATION_KEYS = {'), forms.indexOf('var ADD_PAGE_OPERATION_KEYS'));
  const keys = [...new Set([...table.matchAll(/"([A-Za-z]+)"/g)].map(m => m[1]))];
  assert.ok(keys.includes('fieldObject') && keys.includes('patch'), keys.join(','));
  if (op.additionalProperties === false) {
    assert.deepEqual(keys.filter(key => !(key in op.properties)), [], 'operation keys missing from the schema');
  }
  const thumbnail = op.properties.thumbnailImage;
  const shapes = thumbnail.anyOf.map(shape => Object.keys(shape.properties).sort().join(','));
  assert.deepEqual(shapes.sort(), ['attachment', 'base64,contentType']);
  for (const sequence of ['tools_nocode_form_create', 'tools_nocode_form_update']) {
    const text = JSON.stringify(inputOf(sequence));
    assert.match(text, /thumbnailImage=\{attachment:'<file name>'\}/, sequence);
  }
});
