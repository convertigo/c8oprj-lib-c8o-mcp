// Run: node --test tests/scripts/validate_tool_schemas.cjs
// Every tool this MCP lists answers its input and output JSON Schemas (js/schema_overrides.js) to clients that check
// them strictly: Vibe turns each tool of a server into typed functions of its code mode, and an MCP SDK validates each
// answer against the output schema. A schema such a client cannot read can cost the agent the whole server, not one
// tool. This check walks the schemas of every tools_* sequence of c8oProject.yaml, as tools/list answers them, with the
// rules of JSON Schema (draft 2020-12 vocabulary, the one MCP names) a strict client applies. The CI runs it before it
// builds the CAR (.github/workflows/build-and-release.yml).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const TYPES = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null']);
const SCHEMA_MAPS = ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas'];
const SCHEMA_LISTS = ['anyOf', 'oneOf', 'allOf', 'prefixItems'];
const SCHEMA_ONE = ['items', 'additionalProperties', 'not', 'if', 'then', 'else', 'contains', 'propertyNames', 'unevaluatedProperties', 'additionalItems'];

function sequences() {
  return [...read('c8oProject.yaml').matchAll(/↓(tools_[a-z0-9_]+) \[sequences\.GenericSequence\]/g)].map(m => m[1]);
}

// The variables of a sequence, as the engine derives the input schema from them before the overrides apply.
function derivedInput(sequence) {
  const yaml = read(`_c8oProject/sequences/${sequence}.yaml`);
  const properties = {};
  for (const m of yaml.matchAll(/^↓([A-Za-z_][A-Za-z0-9_]*) \[variables\.RequestableVariable-\d+\]:/gm)) {
    properties[m[1]] = { type: 'string' };
  }
  return { type: 'object', properties };
}

function loadOverrides() {
  const sandbox = { C8O: {} };
  sandbox.include = file => vm.runInContext(read(file), sandbox, { filename: file });
  vm.createContext(sandbox);
  vm.runInContext(read('js/schema_overrides.js'), sandbox, { filename: 'js/schema_overrides.js' });
  return sandbox.C8O.schemaOverrides;
}

function typeOk(type) {
  if (typeof type === 'string') {
    return TYPES.has(type);
  }
  return Array.isArray(type) && type.length > 0 && type.every(t => TYPES.has(t)) && new Set(type).size === type.length;
}

function valueMatches(value, type) {
  const types = Array.isArray(type) ? type : [type];
  return types.some(t => (t === 'null' && value === null)
    || (t === 'string' && typeof value === 'string')
    || (t === 'boolean' && typeof value === 'boolean')
    || (t === 'number' && typeof value === 'number' && Number.isFinite(value))
    || (t === 'integer' && Number.isInteger(value))
    || (t === 'array' && Array.isArray(value))
    || (t === 'object' && value !== null && typeof value === 'object' && !Array.isArray(value)));
}

// Problems of one schema node and its children, each with its path.
function check(schema, at, problems) {
  if (typeof schema === 'boolean') {
    return;
  }
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    problems.push(`${at}: a schema is an object or a boolean, not ${JSON.stringify(schema)}`);
    return;
  }
  for (const [key, value] of Object.entries(schema)) {
    if (value === undefined || typeof value === 'function' || (typeof value === 'number' && !Number.isFinite(value))) {
      problems.push(`${at}.${key}: not JSON (${String(value)})`);
    }
  }
  if ('type' in schema && !typeOk(schema.type)) {
    problems.push(`${at}.type: ${JSON.stringify(schema.type)} is not a JSON Schema type`);
  }
  for (const key of SCHEMA_MAPS) {
    if (key in schema) {
      const map = schema[key];
      if (map === null || typeof map !== 'object' || Array.isArray(map)) {
        problems.push(`${at}.${key}: an object of schemas`);
        continue;
      }
      for (const [name, child] of Object.entries(map)) {
        if (!name.length) {
          problems.push(`${at}.${key}: an empty name`);
        }
        check(child, `${at}.${key}.${name}`, problems);
      }
    }
  }
  for (const key of SCHEMA_LISTS) {
    if (key in schema) {
      if (!Array.isArray(schema[key]) || !schema[key].length) {
        problems.push(`${at}.${key}: a non-empty array of schemas`);
        continue;
      }
      schema[key].forEach((child, i) => check(child, `${at}.${key}[${i}]`, problems));
    }
  }
  for (const key of SCHEMA_ONE) {
    if (key in schema) {
      if (key === 'items' && Array.isArray(schema.items)) {
        problems.push(`${at}.items: one schema (an array of them is prefixItems)`);
        continue;
      }
      check(schema[key], `${at}.${key}`, problems);
    }
  }
  if ('required' in schema) {
    const req = schema.required;
    if (!Array.isArray(req) || req.some(r => typeof r !== 'string') || new Set(req).size !== req.length) {
      problems.push(`${at}.required: an array of distinct names`);
    } else if (schema.properties && schema.additionalProperties === false) {
      for (const name of req) {
        if (!(name in schema.properties)) {
          problems.push(`${at}.required: ${name} is required but no property declares it`);
        }
      }
    }
  }
  if ('enum' in schema) {
    if (!Array.isArray(schema.enum) || !schema.enum.length) {
      problems.push(`${at}.enum: a non-empty array`);
    } else if (schema.type && typeOk(schema.type)) {
      for (const value of schema.enum) {
        if (!valueMatches(value, schema.type)) {
          problems.push(`${at}.enum: ${JSON.stringify(value)} is not of type ${JSON.stringify(schema.type)}`);
        }
      }
    }
  }
  if ('default' in schema && schema.type && typeOk(schema.type) && !valueMatches(schema.default, schema.type)) {
    problems.push(`${at}.default: ${JSON.stringify(schema.default)} is not of type ${JSON.stringify(schema.type)}`);
  }
  for (const [low, high] of [['minimum', 'maximum'], ['minLength', 'maxLength'], ['minItems', 'maxItems'], ['minProperties', 'maxProperties']]) {
    for (const key of [low, high]) {
      if (key in schema && (typeof schema[key] !== 'number' || !Number.isFinite(schema[key]))) {
        problems.push(`${at}.${key}: a number`);
      }
    }
    if (typeof schema[low] === 'number' && typeof schema[high] === 'number' && schema[low] > schema[high]) {
      problems.push(`${at}: ${low} ${schema[low]} is above ${high} ${schema[high]}`);
    }
  }
  if ('pattern' in schema) {
    try {
      new RegExp(schema.pattern, 'u');
    } catch (e) {
      problems.push(`${at}.pattern: ${e.message}`);
    }
  }
  if ('$ref' in schema && (typeof schema.$ref !== 'string' || !/^#(\/|$)/.test(schema.$ref))) {
    problems.push(`${at}.$ref: only a local reference (#/...) is resolvable without fetching`);
  }
}

const overrides = loadOverrides();
const tools = sequences();

test('the project lists its tools', () => {
  assert.ok(tools.length > 40, String(tools.length));
  assert.ok(tools.includes('tools_nocode_attachment_read'));
  // the read and the write of a no-code database schema
  assert.ok(tools.includes('tools_nocode_baserow_schema_get'));
  assert.ok(tools.includes('tools_nocode_baserow_schema_apply'));
});

test('nocode-baserow-schema-get takes tables as ids, names or references, and its read id alone', () => {
  const input = JSON.parse(JSON.stringify(overrides.applyInput('tools_nocode_baserow_schema_get', derivedInput('tools_nocode_baserow_schema_get'), null)));
  assert.deepEqual(Object.keys(input.properties).sort(), ['base', 'describeId', 'linked', 'rows', 'tables', 'token']);
  assert.deepEqual(input.properties.tables.items.anyOf.map(s => s.type), ['integer', 'string', 'object']);
  assert.deepEqual(input.properties.base.anyOf.map(s => s.type), ['integer', 'string']);
  assert.equal(input.required, undefined);
  const problems = [];
  check(input, 'tools_nocode_baserow_schema_get input', problems);
  assert.deepEqual(problems, []);
});

test('every tool answers an object input schema and an object output schema a strict client reads', () => {
  const problems = [];
  for (const sequence of tools) {
    const input = JSON.parse(JSON.stringify(overrides.applyInput(sequence, derivedInput(sequence), null)));
    const output = JSON.parse(JSON.stringify(overrides.decorateOutput(sequence, overrides.applyOutput(sequence, { type: 'object', properties: {} }, null), null, null)));
    for (const [kind, schema] of [['input', input], ['output', output]]) {
      if (!schema || schema.type !== 'object') {
        problems.push(`${sequence} ${kind}: the root is an object schema (type "object"), not ${JSON.stringify(schema && schema.type)}`);
      }
      check(schema, `${sequence} ${kind}`, problems);
    }
  }
  assert.deepEqual(problems, []);
});

test('the check refuses what a strict client refuses', () => {
  const problems = [];
  check({ type: 'object', properties: { a: { type: 'text' }, b: { type: 'array', items: [{ type: 'string' }] } }, required: ['c'], additionalProperties: false }, 'bad', problems);
  check({ type: 'integer', minimum: 5, maximum: 1, default: 'x', enum: [] }, 'bad2', problems);
  check({ anyOf: [], $ref: 'https://example.invalid/schema' }, 'bad3', problems);
  assert.deepEqual(problems, [
    'bad.type: "text" is not a JSON Schema type'.replace('bad.type', 'bad.properties.a.type'),
    'bad.properties.b.items: one schema (an array of them is prefixItems)',
    'bad.required: c is required but no property declares it',
    'bad2.enum: a non-empty array',
    'bad2.default: "x" is not of type "integer"',
    'bad2: minimum 5 is above maximum 1',
    'bad3.anyOf: a non-empty array of schemas',
    'bad3.$ref: only a local reference (#/...) is resolvable without fetching'
  ]);
});
