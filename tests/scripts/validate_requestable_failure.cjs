// Run: node --test tests/scripts/validate_requestable_failure.cjs
// requestable-execute answered "An exception occured while executing step" 22 times without a cause on existing sequences
// (some of a library project), and the last hint told the agent to disable steps one by one: a customer's agent found
// the cause by elimination for 5 hours (feedback reports 25/11). js/requestable_failure.js lifts the failing step and the
// root cause from the error document of the run (details and the stack trace of the internal call), the steps of the
// sequence, and the engine log lines of the call when there are some; stepErrorHints stays the last fallback. The
// engine texts below were captured on a Convertigo engine (requestable-execute on test sequences, 25/11).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function load() {
  const sandbox = { C8O: {} };
  vm.createContext(sandbox);
  vm.runInContext(read('js/requestable_failure.js'), sandbox, { filename: 'js/requestable_failure.js' });
  const api = sandbox.C8O.requestableFailure;
  return { api, plain: value => JSON.parse(JSON.stringify(value)) };
}

const ENGINE_HEAD = 'com.twinsoft.convertigo.engine.EngineException: An exception occured while executing step\n' +
  '\tat com.twinsoft.convertigo.beans.core.Step.execute(Step.java:666)\n' +
  '\tat com.twinsoft.convertigo.beans.core.Sequence.executeNextStep(Sequence.java:1668)\n' +
  '\tat com.twinsoft.convertigo.beans.sequences.GenericSequence.runCore(GenericSequence.java:41)\n' +
  '\tat com.twinsoft.convertigo.beans.core.RequestableObject$RequestableThread.run(RequestableObject.java:1158)\n';

// A script error in a sequence of a library project (ErrLib.libScriptError, step badScript).
const LIB_SCRIPT_ERROR = {
  code: '-1',
  message: 'An exception occured while executing step',
  details: "Unable to evaluate step expression code for 'expression' property or variable.\nStep: \"badScript (priority:0)\"\n" +
    'A Javascript runtime error has occured at line 1, column 0: TypeError: Cannot set property "foo" of null to "1" (expression#1) \nnull',
  exception: 'com.twinsoft.convertigo.engine.EngineException',
  stacktrace: ENGINE_HEAD +
    "Caused by: com.twinsoft.convertigo.engine.EngineException: Unable to evaluate step expression code for 'expression' property or variable.\n" +
    'Step: "badScript (priority:0)"\n' +
    'A Javascript runtime error has occured at line 1, column 0: TypeError: Cannot set property "foo" of null to "1" (expression#1) \nnull\n' +
    '\tat com.twinsoft.convertigo.beans.core.Step.evaluate(Step.java:877)\n' +
    '\tat com.twinsoft.convertigo.beans.steps.SimpleStep.stepExecute(SimpleStep.java:81)\n' +
    '\t... 7 more\n',
  attr: { project: 'ErrLib', sequence: 'libScriptError', type: 'c8o' }
};

// A Java step that fails on the error document a call left (a JsonToXmlStep after a TransactionStep whose SQL failed):
// on a JRE without helpful NullPointerException messages, details are empty and the cause has no message.
const JSON_STEP_NPE = {
  code: '-1',
  message: 'An exception occured while executing step',
  details: '',
  exception: 'com.twinsoft.convertigo.engine.EngineException',
  stacktrace: ENGINE_HEAD +
    'Caused by: java.lang.NullPointerException\n' +
    '\tat com.twinsoft.convertigo.beans.steps.JsonToXmlStep.createStepNode(JsonToXmlStep.java:195)\n' +
    '\tat com.twinsoft.convertigo.beans.core.Step.getStepNode(Step.java:358)\n' +
    '\tat com.twinsoft.convertigo.beans.core.Sequence.appendStepNode(Sequence.java:1722)\n' +
    '\t... 7 more\n',
  attr: { project: 'ErrApp', sequence: 'callSqlThenJson', type: 'c8o' }
};

const CALL_SQL_THEN_JSON_STEPS = [
  { qname: 'ErrApp.sq:callSqlThenJson.st:callSql2', name: 'callSql2', type: 'TransactionStep', enabled: true, calls: 'ErrLib.db.badSelect' },
  { qname: 'ErrApp.sq:callSqlThenJson.st:useRows', name: 'useRows', type: 'JsonToXmlStep', enabled: true }
];

// The engine log of the same call, when the engine writes one (a Tigo agent's calls carry X-Convertigo-No-Log): the SQL
// error of the transaction the step called, with its statement (and its values) after the cause.
const SQL_LOG_LINES = [
  {
    category: 'Context', time: '14:19:20,101', level: 'INFO', thread: 'http-nio-1/RequestableThread/RequestableThread',
    message: 'Starting transaction', extras: { project: 'ErrLib', connector: 'db', transaction: 'badSelect' }
  },
  {
    category: 'Context', time: '14:19:20,140', level: 'ERROR', thread: 'http-nio-1/RequestableThread/RequestableThread',
    message: 'Exception thrown during requested object execution\n' +
      'com.twinsoft.convertigo.engine.EngineException: An unexpected error occured while executing transaction. Could not execute the SQL query.\n' +
      '\tat com.twinsoft.convertigo.beans.transactions.SqlTransaction.runCore(SqlTransaction.java:1203)\n' +
      'Caused by: java.sql.SQLSyntaxErrorException: user lacks privilege or object not found: NO_SUCH_TABLE_X in statement [SELECT ID FROM NO_SUCH_TABLE_X WHERE EMAIL = \'jane@example.org\']\n' +
      '\tat org.hsqldb.jdbc.JDBCUtil.sqlException(Unknown Source)\n' +
      '\t... 6 more',
    extras: { project: 'ErrLib', connector: 'db', transaction: 'badSelect' }
  },
  {
    category: 'Context', time: '14:19:20,190', level: 'ERROR', thread: 'http-nio-1/RequestableThread',
    message: 'Exception thrown during requested object execution\n' + JSON_STEP_NPE.stacktrace,
    extra: 'project=ErrApp sequence=callSqlThenJson'
  }
];

// A script error in a step after a SequenceStep whose sequence failed and answered its error document as data.
const NESTED_SEQUENCE_ERROR = {
  code: '-1',
  message: 'An exception occured while executing step',
  details: "Unable to evaluate step expression code for 'expression' property or variable.\nStep: \"useIt (priority:0)\"\n" +
    'A Javascript runtime error has occured at line 1, column 0: TypeError: Cannot read property "length" from undefined (expression#1) \nnull',
  exception: 'com.twinsoft.convertigo.engine.EngineException',
  stacktrace: ENGINE_HEAD,
  attr: { project: 'ErrApp', sequence: 'nestedThenUse', type: 'c8o' }
};

test('a script error of a library sequence names the step and the script message', () => {
  const { api, plain } = load();
  const described = plain(api.describe(LIB_SCRIPT_ERROR));
  assert.equal(described.step, 'badScript');
  assert.equal(described.script, true);
  assert.equal(described.line, 1);
  assert.equal(described.cause, 'TypeError: Cannot set property "foo" of null to "1"');
  const steps = [
    { qname: 'ErrLib.sq:libScriptError.st:prepare', name: 'prepare', type: 'SimpleStep', enabled: true },
    { qname: 'ErrLib.sq:libScriptError.st:badScript', name: 'badScript', type: 'SimpleStep', enabled: true }
  ];
  const explained = plain(api.explain(LIB_SCRIPT_ERROR, api.locate(steps, api.describe(LIB_SCRIPT_ERROR)), null));
  assert.equal(explained.message, 'Step ErrLib.sq:libScriptError.st:badScript (SimpleStep) failed: TypeError: Cannot set property "foo" of null to "1".');
  assert.equal(explained.failure.step, 'ErrLib.sq:libScriptError.st:badScript (SimpleStep)');
  assert.equal(explained.failure.callsBefore, undefined, 'no call before the step');
});

test('a Java step without a message is found by its class, and the transaction it read is named', () => {
  const { api, plain } = load();
  const described = plain(api.describe(JSON_STEP_NPE));
  assert.equal(described.exception, 'java.lang.NullPointerException');
  assert.equal(described.stepType, 'JsonToXmlStep');
  assert.match(described.cause, /^java\.lang\.NullPointerException in JsonToXmlStep$/);
  const located = plain(api.locate(CALL_SQL_THEN_JSON_STEPS, api.describe(JSON_STEP_NPE)));
  assert.deepEqual(located.step, { qname: 'ErrApp.sq:callSqlThenJson.st:useRows', type: 'JsonToXmlStep' });
  assert.deepEqual(located.callsBefore, [{ step: 'ErrApp.sq:callSqlThenJson.st:callSql2', calls: 'ErrLib.db.badSelect' }]);
  const explained = plain(api.explain(JSON_STEP_NPE, located, null));
  assert.match(explained.message, /^Step ErrApp\.sq:callSqlThenJson\.st:useRows \(JsonToXmlStep\) failed: java\.lang\.NullPointerException in JsonToXmlStep\./);
  assert.match(explained.message, /Before it, the run called ErrLib\.db\.badSelect \(step callSql2\)\. A call that answers an error does not stop the sequence/);
  assert.match(explained.message, /run that call alone with requestable-execute/);
  assert.deepEqual(explained.failure.callsBefore, [{ step: 'ErrApp.sq:callSqlThenJson.st:callSql2', calls: 'ErrLib.db.badSelect' }]);
});

test('the SQL error of a transaction called by a TransactionStep, read from the engine log lines of the call', () => {
  const { api, plain } = load();
  const fromLogs = plain(api.fromLogLines(SQL_LOG_LINES));
  assert.equal(fromLogs.length, 2, 'INFO lines are skipped');
  assert.equal(fromLogs[0].where.transaction, 'badSelect');
  assert.equal(fromLogs[0].exception, 'java.sql.SQLSyntaxErrorException');
  assert.equal(fromLogs[0].cause, 'SQLSyntaxErrorException: user lacks privilege or object not found: NO_SUCH_TABLE_X');
  assert.equal(fromLogs[1].where.sequence, 'callSqlThenJson', 'extras read from the extra text too');
  const explained = plain(api.explain(JSON_STEP_NPE, api.locate(CALL_SQL_THEN_JSON_STEPS, api.describe(JSON_STEP_NPE)), SQL_LOG_LINES));
  assert.deepEqual(explained.failure.nested, [{
    requestable: 'ErrLib.db.badSelect',
    exception: 'java.sql.SQLSyntaxErrorException',
    cause: 'SQLSyntaxErrorException: user lacks privilege or object not found: NO_SUCH_TABLE_X'
  }]);
  assert.match(explained.message, /Before it, ErrLib\.db\.badSelect called in this run answered an error: SQLSyntaxErrorException: user lacks privilege or object not found: NO_SUCH_TABLE_X\. .*Fix that call first\./);
  assert.equal(explained.failure.callsBefore, undefined, 'the logged error replaces the list of calls');
  const all = JSON.stringify(explained);
  assert.doesNotMatch(all, /jane@example\.org|SELECT ID FROM/, 'never the statement nor its values');
});

test('an error after a nested SequenceStep names the step and the sequence it called', () => {
  const { api, plain } = load();
  const steps = [
    { qname: 'ErrApp.sq:nestedThenUse.st:callApp2', name: 'callApp2', type: 'SequenceStep', enabled: true, calls: 'ErrApp.callLibScript' },
    { qname: 'ErrApp.sq:nestedThenUse.st:useIt', name: 'useIt', type: 'SimpleStep', enabled: true },
    { qname: 'ErrApp.sq:nestedThenUse.st:after', name: 'after', type: 'SequenceStep', enabled: true, calls: 'ErrLib.other' }
  ];
  const explained = plain(api.explain(NESTED_SEQUENCE_ERROR, api.locate(steps, api.describe(NESTED_SEQUENCE_ERROR)), []));
  assert.match(explained.message, /^Step ErrApp\.sq:nestedThenUse\.st:useIt \(SimpleStep\) failed: TypeError: Cannot read property "length" from undefined\. Before it, the run called ErrApp\.callLibScript \(step callApp2\)\./);
  assert.doesNotMatch(explained.message, /ErrLib\.other/, 'a call after the failed step is not listed');
});

test('a nested step is found by name below its parent, a disabled step is not a candidate', () => {
  const { api, plain } = load();
  const error = {
    message: 'An exception occured while executing step',
    details: "Unable to evaluate step expression code for 'expression' property or variable.\nStep: \"inner (priority:0)\"\nA Javascript error has occured: boom (expression#1)",
    stacktrace: ''
  };
  const steps = [
    { qname: 'P.sq:s.st:ifBlock', name: 'ifBlock', type: 'IfStep', enabled: true },
    { qname: 'P.sq:s.st:ifBlock.inner', name: 'inner', type: 'SimpleStep', enabled: true },
    { qname: 'P.sq:s.st:old.inner', name: 'inner', type: 'SimpleStep', enabled: false }
  ];
  const explained = plain(api.explain(error, api.locate(steps, api.describe(error)), null));
  assert.equal(explained.message, 'Step P.sq:s.st:ifBlock.inner (SimpleStep) failed: boom.');
});

test('several steps of the failing class are given as candidates', () => {
  const { api, plain } = load();
  const steps = [
    { qname: 'P.sq:s.st:a', name: 'a', type: 'JsonToXmlStep', enabled: true },
    { qname: 'P.sq:s.st:call', name: 'call', type: 'SequenceStep', enabled: true, calls: 'Lib.read' },
    { qname: 'P.sq:s.st:b', name: 'b', type: 'JsonToXmlStep', enabled: true }
  ];
  const explained = plain(api.explain(JSON_STEP_NPE, api.locate(steps, api.describe(JSON_STEP_NPE)), null));
  assert.match(explained.message, /^In the sequence, a JsonToXmlStep \(one of a, b\) failed: java\.lang\.NullPointerException in JsonToXmlStep\./);
  assert.deepEqual(explained.failure.candidates, ['P.sq:s.st:a', 'P.sq:s.st:b']);
  assert.deepEqual(explained.failure.callsBefore, [{ step: 'P.sq:s.st:call', calls: 'Lib.read' }]);
});

test('no detail, no stack trace, no log: nothing is made up and stepErrorHints stays the fallback', () => {
  const { api } = load();
  const bare = { code: '-1', message: 'An exception occured while executing step', details: '', exception: 'com.twinsoft.convertigo.engine.EngineException', stacktrace: '' };
  assert.equal(api.describe(bare), null);
  assert.equal(api.explain(bare, { step: null, candidates: [], callsBefore: [] }, null), null);
  assert.equal(api.explain(bare, {}, []), null);
  // the generic messages joined in details say nothing either
  assert.equal(api.describe(Object.assign({}, bare, { details: 'An exception occured while executing step, An exception occured while executing step' })), null);
});

test('the answer keeps a short stack trace: headers and first frames only', () => {
  const { api } = load();
  const short = api.shortTrace(LIB_SCRIPT_ERROR.stacktrace + '\tat a.b.C.d(C.java:1)\n'.repeat(200));
  assert.ok(short.length <= 1500);
  assert.match(short, /^com\.twinsoft\.convertigo\.engine\.EngineException: An exception occured while executing step\n\tat com\.twinsoft\.convertigo\.beans\.core\.Step\.execute/);
  assert.match(short, /\nCaused by: com\.twinsoft\.convertigo\.engine\.EngineException: Unable to evaluate step expression code/);
  assert.doesNotMatch(short, /Sequence\.executeNextStep/);
  assert.equal(api.cut('x in statement [SELECT secret]'), 'x');
});

test('requestable-execute wires it, with stepErrorHints as the last fallback worded as such', () => {
  const yaml = read('_c8oProject/sequences/tools_requestable_execute.yaml');
  assert.match(yaml, /include\("js\/requestable_failure\.js"\);\n\s+failureExplained = C8O\.requestableFailure\.explain\(source\.error, C8O\.requestableFailure\.collect\(executionPlan, source\.error\),/);
  assert.match(yaml, /if \(!failureExplained && executionPlan && executionPlan\.isSequence && \/executing step\/i/);
  assert.match(yaml, /out\.error\.stacktrace = C8O\.requestableFailure\.shortTrace\(out\.error\.stacktrace\);/);
  const dbo = read('js/databaseobject.js');
  assert.match(dbo, /First run alone, with requestable-execute, each sequence " \+\n\s+"or transaction this sequence calls/);
  assert.match(dbo, /Last resort only, as it changes the project: disable steps from the end/);
});
