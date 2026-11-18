// Run: node --test tests/scripts/validate_step_source_names.cjs
// A step source given with the step's name where its priority goes (measured run, 18/11): a seed's summary field was stored
// with {"mode":"SOURCE","sources":["CountAll", "./document/sql_output/row"]}, unchecked because the check only read
// sourceDefinition, and stayed empty; three more calls went into sources refused for naming a step (["SeedCompanies", ...],
// [{"step":"CountAll", ...}]). A name of a step now resolves to its priority, in sourceDefinition and in a SmartType SOURCE;
// a name of no step is refused with the steps the sequence has.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'js/databaseobject.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function slice(startMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, startMarker);
  const end = source.indexOf('\n};\n', start);
  return source.slice(start, end + 4);
}

function load() {
  const sandbox = { C8O: { dbo: {}, util: { toTrimmedString: v => (v === null || v === undefined ? '' : String(v).trim()) } } };
  vm.createContext(sandbox);
  vm.runInContext(slice('C8O.dbo._stepSourceNameForm = function'), sandbox);
  vm.runInContext(slice('C8O.dbo._expandStepSourceShorthand = function'), sandbox);
  vm.runInContext(slice('C8O.dbo._stepSourceProblem = function'), sandbox);
  return sandbox.C8O.dbo;
}

const list = items => ({ size: () => items.length, get: i => items[i] });

// A seed: three calls, a count read, then a summary field reading the count.
function seed() {
  const steps = ['SeedCompanies', 'SeedContacts', 'CountAll', 'Summary'].map((name, i) => ({
    priority: 301 + i, getName: () => name, getSteps: () => list([]),
  }));
  const seq = {
    getName: () => 'seed_demo_data', getAllSteps: () => list(steps), getStep: () => null,
    getVariablesList: () => list([{ priority: 110, getName: () => 'limit' }]), getParent: () => null,
  };
  steps.forEach(step => { step.getParent = () => seq; });
  return { seq, summary: steps[3], firstCall: steps[0] };
}

test('a step name where the priority goes resolves to that step, in sourceDefinition and in a SmartType SOURCE', () => {
  const dbo = load();
  const { summary } = seed();
  assert.deepEqual(plain(dbo._expandStepSourceShorthand(['CountAll', './document/sql_output/row'], summary, 'sourcedefinition')),
    ['303', './document/sql_output/row']);
  assert.deepEqual(plain(dbo._expandStepSourceShorthand('["CountAll", "./document"]', summary, 'sourcedefinition')), ['303', './document']);
  assert.deepEqual(plain(dbo._expandStepSourceShorthand([{ step: 'CountAll', xpath: './document' }], summary, 'sourcedefinition')),
    ['303', './document'], 'a one-item list of the {step} form');
  assert.deepEqual(plain(dbo._expandStepSourceShorthand({ mode: 'SOURCE', sources: ['CountAll', './document/sql_output/row'] }, summary, 'value')),
    { mode: 'SOURCE', sources: ['303', './document/sql_output/row'] });
  assert.deepEqual(plain(dbo._expandStepSourceShorthand({ mode: 'source', sources: [{ step: 'SeedContacts', xpath: './document/error' }] }, summary, 'value')),
    { mode: 'SOURCE', sources: ['302', './document/error'] });
});

test('a priority, another shape or a value that is not a source is left as it is', () => {
  const dbo = load();
  const { summary } = seed();
  assert.deepEqual(plain(dbo._expandStepSourceShorthand(['303', './document'], summary, 'sourcedefinition')), ['303', './document']);
  assert.deepEqual(plain(dbo._expandStepSourceShorthand({ mode: 'SOURCE', sources: ['303', '.'] }, summary, 'value')), { mode: 'SOURCE', sources: ['303', '.'] });
  assert.deepEqual(plain(dbo._expandStepSourceShorthand({ mode: 'PLAIN', value: 'CountAll' }, summary, 'value')), { mode: 'PLAIN', value: 'CountAll' });
  assert.deepEqual(plain(dbo._expandStepSourceShorthand(['a', 'b', 'c'], summary, 'value')), ['a', 'b', 'c'], 'a list on another property');
  assert.equal(dbo._expandStepSourceShorthand('plain text', summary, 'sourcedefinition'), 'plain text');
  assert.deepEqual(plain(dbo._expandStepSourceShorthand(['./document', '.'], summary, 'sourcedefinition')), ['./document', '.'],
    'an xpath first is no name: the source check answers it');
  assert.deepEqual(plain(dbo._expandStepSourceShorthand({ mode: 'SOURCE', local: '?.items' }, summary, 'source')), { mode: 'SOURCE', local: '?.items' },
    'the NGX short forms are untouched');
});

test('a name of no step is refused with the steps the sequence has; an input name says how to pass an input', () => {
  const dbo = load();
  const { summary } = seed();
  assert.throws(() => dbo._expandStepSourceShorthand(['Counts', './document'], summary, 'sourcedefinition'),
    /^Error: No step named Counts in sequence seed_demo_data \(its steps: SeedCompanies, SeedContacts, CountAll, Summary\): create it before the step that sources it/);
  assert.throws(() => dbo._expandStepSourceShorthand({ mode: 'SOURCE', sources: ['Counts', '.'] }, summary, 'value'), /^Error: No step named Counts in sequence seed_demo_data/);
  assert.throws(() => dbo._expandStepSourceShorthand(['limit', '.'], summary, 'sourcedefinition'),
    /^Error: limit is an input variable of sequence seed_demo_data, not a step: a source naming it resolves to nothing\. Source an InputVariablesStep \(\.\/limit\/text\(\)\), or set var <step variable name> = limit; in a SimpleStep before the call\./);
});

test('a SmartType SOURCE is checked like a sourceDefinition: a step that runs after it is refused, named after the property', () => {
  const dbo = load();
  const { firstCall } = seed();
  const expanded = dbo._expandStepSourceShorthand({ mode: 'SOURCE', sources: ['CountAll', '.'] }, firstCall, 'value');
  assert.match(dbo._stepSourceProblem(expanded.sources, firstCall, 'value (SOURCE)'),
    /^value \(SOURCE\) names 303, the step CountAll, which runs after SeedCompanies: it has no output yet/);
  assert.match(dbo._stepSourceProblem(['999', '.'], firstCall), /^sourceDefinition names 999, the priority of no step of seed_demo_data/);
});

test('the SmartType SOURCE check runs before the value is stored', () => {
  const expand = source.indexOf('var rawSpec = C8O.dbo._expandStepSourceShorthand(updates[requestedName], dbo, requestedLookup);');
  const hook = source.indexOf('var smartProblem = C8O.dbo._stepSourceProblem(rawSpec.sources, dbo, requestedName + " (SOURCE)");');
  assert.ok(expand > 0 && hook > expand);
  assert.ok(hook < source.indexOf('var setter = pd.getWriteMethod();'));
});

test('outside a sequence a name form is left as it was given', () => {
  const dbo = load();
  const loose = { getParent: () => null };
  assert.deepEqual(plain(dbo._expandStepSourceShorthand({ mode: 'SOURCE', sources: ['CountAll', '.'] }, loose, 'value')), { mode: 'SOURCE', sources: ['CountAll', '.'] });
  assert.throws(() => dbo._expandStepSourceShorthand({ step: 'CountAll', xpath: '.' }, loose, 'sourcedefinition'), /only works inside a sequence/);
});

test('a pair wrapped in a list is the pair; a name two steps share is refused rather than guessed', () => {
  const dbo = load();
  const { summary, seq } = seed();
  assert.deepEqual(plain(dbo._expandStepSourceShorthand([['CountAll', './document']], summary, 'sourcedefinition')), ['303', './document']);
  assert.deepEqual(plain(dbo._expandStepSourceShorthand([['301', './document/error']], summary, 'sourcedefinition')), ['301', './document/error']);
  assert.deepEqual(plain(dbo._expandStepSourceShorthand({ mode: 'SOURCE', sources: [['CountAll', './text()']] }, summary, 'value')), { mode: 'SOURCE', sources: ['303', './text()'] });
  assert.deepEqual(plain(dbo._expandStepSourceShorthand({ mode: 'SOURCE', sources: [['302', '.']] }, summary, 'value')), { mode: 'SOURCE', sources: ['302', '.'] });
  const twin = { priority: 309, getName: () => 'CountAll', getSteps: () => list([]) };
  const branch = { priority: 308, getName: () => 'IfEmpty', getSteps: () => list([twin]) };
  const steps = [];
  for (let i = 0; i < seq.getAllSteps().size(); i++) steps.push(seq.getAllSteps().get(i));
  seq.getAllSteps = () => list(steps.concat([branch]));
  assert.throws(() => dbo._expandStepSourceShorthand(['CountAll', '.'], summary, 'sourcedefinition'),
    /^Error: 2 steps are named CountAll in sequence seed_demo_data: give the priority of the one to read/);
});
