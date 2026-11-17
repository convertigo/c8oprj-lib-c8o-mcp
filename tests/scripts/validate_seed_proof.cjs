// seed-proof (js/tools_seed_proof.js): a seed proven replayable in one call. An agent reported its seed "replayable
// without duplicates on a fresh or existing server" from a second run that answered status error: the counts were
// unchanged because nothing ran, and earlier versions had inserted duplicates. The tool counts the tables the seed
// writes, runs it as requestable-execute does, counts, runs it again and counts; replayable only when both runs answered
// ok and run 2 left every count as run 1 left it.
// node --test tests/scripts/validate_seed_proof.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function load() {
  const context = { C8O: {}, Packages: { java: { util: { Map: function JavaMap() {} } } }, JSON };
  vm.createContext(context);
  for (const file of ['js/util.js', 'js/tools_sql_select.js', 'js/security_audit_rules.js', 'js/tools_seed_proof.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return context.C8O;
}

const tx = (name, writes, extra) => Object.assign({ qname: 'P.db.' + name, kind: 'transaction', requestableClass: 'SqlTransaction',
  accessibility: 'Private', authenticatedContextRequired: false, calls: [], writes }, extra);
const seq = (name, calls, extra) => Object.assign({ qname: 'P.' + name, kind: 'sequence', requestableClass: 'GenericSequence',
  accessibility: 'Private', authenticatedContextRequired: false, calls }, extra);

// A seed that writes three tables through a helper sequence, and reads one.
function appModel(extra) {
  return {
    project: { name: 'P' },
    requestables: [
      seq('seed_demo', ['P.db.parents_seed', 'P.fill_children', 'P.db.parents_count'], extra && extra.seed),
      seq('fill_children', ['P.db.children_seed', 'P.db.events_seed']),
      tx('parents_seed', ['SQL INSERT']),
      tx('children_seed', ['SQL INSERT']),
      tx('events_seed', ['SQL MERGE']),
      tx('parents_count', [])
    ].concat((extra && extra.requestables) || []),
    externalRequestables: (extra && extra.external) || [],
    steps: [], variables: []
  };
}

const SQL = {
  'P.db.parents_seed': "INSERT INTO parents (code, label) SELECT 'P01', 'First -- not a comment' WHERE NOT EXISTS (SELECT 1 FROM parents WHERE code = 'P01')",
  'P.db.children_seed': 'INSERT INTO public.children (parent_id, label) SELECT p.id, {label} FROM parents p /* INSERT INTO ghosts */',
  'P.db.events_seed': 'MERGE INTO "Events" e USING (VALUES (1)) s(id) ON e.id = s.id WHEN NOT MATCHED THEN INSERT (id) VALUES (s.id) WHEN MATCHED THEN UPDATE SET id = s.id',
  'P.db.parents_count': 'SELECT COUNT(*) FROM parents'
};

// A database of row counts, a seed that changes it on each run (behave(db, run) -> requestable-execute's answer), and the
// calls the tool made.
function fakeHost({ model = appModel(), db = { parents: 0, 'public.children': 0, '"Events"': 0 }, behave, connectors = ['db'], sql = SQL } = {}) {
  const calls = { execute: [], count: [] };
  let clock = 1000;
  const host = {
    audit: () => C8O.securityAudit,
    model: name => { assert.equal(name, 'P'); return model; },
    transaction: qname => (qname in sql ? { sql: sql[qname] } : null),
    sqlConnectors: () => connectors,
    count: (project, connector, tables) => {
      calls.count.push(project + '.' + connector + ':' + tables.join(','));
      return tables.map(table => (table in db && db[table] !== null ? { table, rows: db[table] } : { table, rows: null, error: 'user lacks privilege or object not found: ' + table }));
    },
    execute: (requestable, variables, user, run) => {
      calls.execute.push({ requestable, variables: plain(variables), user, run });
      clock += 40;
      return behave(db, run);
    },
    now: () => clock
  };
  return { host, calls, db };
}

const C8O = load();
const S = C8O.seedProof;
const ok = payload => ({ requestable: 'P.seed_demo', status: 'ok', truncated: false, payload: payload || { created: 0 } });

// Inserts only what is missing.
function idempotent(db) {
  db.parents = 12;
  db['public.children'] = 30;
  db['"Events"'] = 20;
  return ok({ created: 62 });
}

test('a seed that inserts only what is missing is replayable, and on empty tables run 1 is the fresh-server proof', () => {
  const { host, calls } = fakeHost({ behave: idempotent });
  const answer = plain(S.prove({ requestable: 'P.sq:seed_demo', variables: { demoPassword: 'x' }, authenticatedUser: 'admin' }, host));
  assert.equal(answer.verdict, 'replayable');
  assert.deepEqual(answer.reasons, []);
  assert.equal(answer.freshRun, true);
  assert.match(answer.note, /run 1 is also the fresh-server proof/);
  assert.deepEqual(answer.tables, [
    { table: 'db.parents', before: 0, afterRun1: 12, afterRun2: 12 },
    { table: 'db.public.children', before: 0, afterRun1: 30, afterRun2: 30 },
    { table: 'db."Events"', before: 0, afterRun1: 20, afterRun2: 20 }
  ]);
  assert.deepEqual(answer.runs, [{ run: 1, status: 'ok', ms: 40 }, { run: 2, status: 'ok', ms: 40 }]);
  assert.deepEqual(answer.notCounted, []);
  assert.deepEqual(answer.warnings, []);
  // Each run is requestable-execute's, with the variables and the user given; one connection round per count.
  assert.deepEqual(calls.execute, [
    { requestable: 'P.sq:seed_demo', variables: { demoPassword: 'x' }, user: 'admin', run: 1 },
    { requestable: 'P.sq:seed_demo', variables: { demoPassword: 'x' }, user: 'admin', run: 2 }
  ]);
  assert.equal(calls.count.length, 3);
  assert.equal(JSON.stringify(answer).indexOf('"x"'), -1, 'the variables are never echoed');
});

test('a seed that inserts again what is there fails on the duplicates of run 2', () => {
  const { host } = fakeHost({ behave: db => { db.parents += 12; db['public.children'] += 30; return ok(); } });
  const answer = plain(S.prove({ requestable: 'P.seed_demo' }, host));
  assert.equal(answer.verdict, 'failed');
  assert.equal(answer.reasons.length, 1);
  assert.match(answer.reasons[0], /^Run 2 added rows: db\.parents \(\+12\), db\.public\.children \(\+30\)\. The seed inserts again what is already there \(duplicates\)/);
  assert.match(answer.reasons[0], /WHERE NOT EXISTS/);
  assert.deepEqual(answer.tables[0], { table: 'db.parents', before: 0, afterRun1: 12, afterRun2: 24 });
});

test('run 2 answering an error fails, though the counts did not move: nothing ran', () => {
  const { host } = fakeHost({ behave: (db, run) => (run === 1 ? idempotent(db)
    : { requestable: 'P.seed_demo', status: 'error', error: { message: 'An exception occured while executing step', cause: 'unique constraint violated' } }) });
  const answer = plain(S.prove({ requestable: 'P.seed_demo' }, host));
  assert.equal(answer.verdict, 'failed');
  assert.deepEqual(answer.runs.map(r => r.status), ['ok', 'error']);
  assert.equal(answer.runs[1].error, 'An exception occured while executing step Cause: unique constraint violated');
  assert.match(answer.reasons[0], /^Run 2 answered an error: An exception occured while executing step Cause: unique constraint violated\. A seed that fails once its rows are there is not replayable/);
  assert.match(answer.reasons[0], /Counts unchanged after an error prove nothing/);
  assert.deepEqual(answer.tables.map(t => [t.afterRun1, t.afterRun2]), [[12, 12], [30, 30], [20, 20]]);
});

test('run 1 answering an error fails and run 2 is not made', () => {
  const { host, calls } = fakeHost({ behave: () => ({ status: 'error', error: { message: 'Step Seed: ReferenceError: "rows" is not defined' } }) });
  const answer = plain(S.prove({ requestable: 'P.seed_demo' }, host));
  assert.equal(answer.verdict, 'failed');
  assert.equal(calls.execute.length, 1);
  assert.deepEqual(answer.runs[1], { run: 2, status: 'skipped', note: 'not run: run 1 failed' });
  assert.match(answer.reasons[0], /^Run 1 answered an error: Step Seed: ReferenceError/);
  assert.match(answer.reasons[0], /no success may be reported about this seed until a proof passes/);
  assert.equal(answer.freshRun, true);
  assert.match(answer.note, /the seed does not initialize a fresh server/);
  assert.deepEqual(answer.tables[0], { table: 'db.parents', before: 0, afterRun1: 0, afterRun2: null });
});

test('an answer that reports a failure in its payload is a failed run too', () => {
  const { host } = fakeHost({ behave: (db, run) => (run === 1 ? idempotent(db) : ok({ result: { status: 'failed', message: 'already there' } })) });
  const answer = plain(S.prove({ requestable: 'P.seed_demo' }, host));
  assert.equal(answer.verdict, 'failed');
  assert.equal(answer.runs[1].error, 'its answer reports a failure (status failed)');
  assert.equal(S.failureOf(ok({ created: 3, errors: [] })), '');
  assert.equal(S.failureOf(ok({ errors: [{ message: 'bad row' }] })), 'its answer reports a failure (errors: bad row)');
  assert.equal(S.failureOf({ status: 'ok', error: '' }), '');
  assert.equal(S.failureOf(null), 'requestable-execute gave no answer');
});

test('nothing to count: nothing is run, and the writes it cannot count are listed', () => {
  const model = {
    project: { name: 'P' },
    requestables: [
      seq('seed_docs', ['P.store.put_doc', 'P.api.post_item', 'lib_Accounts.CreateAccount']),
      tx('put_doc', ['CouchDB PostDocument'], { qname: 'P.store.put_doc', requestableClass: 'PostDocumentTransaction' }),
      tx('post_item', [], { qname: 'P.api.post_item', requestableClass: 'JsonHttpTransaction' })
    ],
    externalRequestables: [{ qname: 'lib_Accounts.CreateAccount', kind: 'sequence', external: true, calls: [], writes: [], accountChange: true }]
  };
  const { host, calls } = fakeHost({ model, behave: () => assert.fail('never run') });
  const answer = plain(S.prove({ requestable: 'P.seed_docs' }, host));
  assert.equal(answer.verdict, 'failed');
  assert.match(answer.reasons[0], /^No table to count: .* \(its writes are in notCounted\)\. Give tables \("connector\.table"\)/);
  assert.equal(answer.note, 'Nothing was run: a run that cannot be counted proves nothing.');
  assert.deepEqual(answer.runs, []);
  assert.deepEqual(answer.notCounted, [
    { requestable: 'P.store.put_doc', writes: 'CouchDB PostDocument' },
    { requestable: 'P.api.post_item', writes: 'HTTP call: what the remote side stores is not counted' },
    { requestable: 'lib_Accounts.CreateAccount', writes: 'accounts, by its name or comment' }
  ]);
  assert.equal(calls.execute.length, 0);
  assert.equal(calls.count.length, 0);
});

test('tables that held rows: the replay on existing data, not a fresh server', () => {
  const { host } = fakeHost({ db: { parents: 12, 'public.children': 30, '"Events"': 20 }, behave: () => ok() });
  const answer = plain(S.prove({ requestable: 'P.seed_demo' }, host));
  assert.equal(answer.verdict, 'replayable');
  assert.equal(answer.freshRun, false);
  assert.match(answer.note, /^The tables held rows before run 1: this proves the replay on existing data, not a fresh server\. .*needs the user's OK\.$/);
});

test('freshRun: a table the seed creates counts as empty before run 1, a table that holds rows does not', () => {
  const missing = fakeHost({ db: { parents: null, 'public.children': 0, '"Events"': 0 }, behave: idempotent });
  const answer = plain(S.prove({ requestable: 'P.seed_demo' }, missing.host));
  assert.equal(answer.freshRun, true);
  assert.equal(answer.verdict, 'replayable');
  assert.deepEqual(answer.tables[0], { table: 'db.parents', before: null, afterRun1: 12, afterRun2: 12, error: 'user lacks privilege or object not found: parents' });
  const judged = plain(S.judge([{ table: 'a', before: 0, afterRun1: 3, afterRun2: 3 }, { table: 'b', before: 2, afterRun1: 2, afterRun2: 2 }],
    [{ status: 'ok' }, { status: 'ok' }]));
  assert.deepEqual(judged, { verdict: 'replayable', reasons: [], freshRun: false });
});

test('a seed that answers ok and writes nothing in empty tables fails', () => {
  const { host } = fakeHost({ behave: () => ok() });
  const answer = plain(S.prove({ requestable: 'P.seed_demo' }, host));
  assert.equal(answer.verdict, 'failed');
  assert.match(answer.reasons[0], /^Run 1 answered ok and wrote no row in the empty tables: the seed creates nothing/);
});

test('a table that cannot be counted after a run leaves the replay unproven', () => {
  const { host } = fakeHost({ behave: (db, run) => { idempotent(db); if (run === 2) { db['"Events"'] = null; } return ok(); } });
  const answer = plain(S.prove({ requestable: 'P.seed_demo' }, host));
  assert.equal(answer.verdict, 'failed');
  assert.match(answer.reasons[0], /^Not counted after a run: db\."Events" \(user lacks privilege or object not found: "Events"\)\. The replay is not proven on these tables\.$/);
});

test('a seed that empties a table holding rows is never run', () => {
  const model = appModel({ requestables: [tx('reset_parents', ['SQL DELETE'])] });
  model.requestables[0].calls.unshift('P.db.reset_parents');
  const sql = Object.assign({ 'P.db.reset_parents': 'DELETE FROM parents' }, SQL);
  const { host, calls } = fakeHost({ model, sql, db: { parents: 5, 'public.children': 0, '"Events"': 0 }, behave: () => assert.fail('never run') });
  const answer = plain(S.prove({ requestable: 'P.seed_demo' }, host));
  assert.equal(answer.verdict, 'failed');
  assert.match(answer.reasons[0], /^The seed empties or drops tables that hold rows or could not be counted: db\.parents \(5 rows, by P\.db\.reset_parents\)\. .*seed-proof never empties data, so nothing was run/);
  assert.equal(calls.execute.length, 0);
  // On empty tables it deletes nothing: the proof runs.
  const empty = fakeHost({ model, sql, behave: idempotent });
  assert.equal(plain(S.prove({ requestable: 'P.seed_demo' }, empty.host)).verdict, 'replayable');
});

test('a Public seed is proven, with a warning: replayable never means callable anonymously', () => {
  const { host } = fakeHost({ model: appModel({ seed: { accessibility: 'Public' } }), behave: idempotent });
  const answer = plain(S.prove({ requestable: 'P.seed_demo' }, host));
  assert.equal(answer.verdict, 'replayable');
  assert.match(answer.warnings[0], /^P\.seed_demo is Public: anyone, without signing in, can run it\. A seed stays Private: .*scheduler-apply.*Replayable never means callable anonymously\.$/);
});

test('the tables argument: connector.table, a table of the only SQL connector, nothing else', () => {
  const { host } = fakeHost({ behave: idempotent, connectors: ['void', 'db'] });
  const answer = plain(S.prove({ requestable: 'P.seed_demo', tables: '["db.parents", "public.children"]' }, host));
  assert.deepEqual(answer.tables.map(t => t.table), ['db.parents', 'db.public.children']);
  assert.deepEqual(plain(S.parseTables('db.a, db.b;db.c')), ['db.a', 'db.b', 'db.c']);
  assert.deepEqual(plain(S.parseTables(['db.a', ' db.a ', 'db.b'])), ['db.a', 'db.b']);
  assert.deepEqual(plain(S.parseTables('')), []);
  assert.throws(() => S.prove({ requestable: 'P.seed_demo', tables: ['db.parents; DROP TABLE parents'] }, host), /seed-proof: tables: db\.parents; DROP TABLE parents is not a table name/);
  const two = fakeHost({ behave: idempotent, connectors: ['db', 'audit'] });
  assert.throws(() => S.prove({ requestable: 'P.seed_demo', tables: 'parents' }, two.host), /give the connector of parents \(connector\.table\): P has several SQL connectors \(db, audit\)/);
  assert.throws(() => S.prove({ requestable: 'P.seed_demo', tables: Array.from({ length: 61 }, (_, i) => 'db.t' + i) }, host), /61 names, 60 at most/);
});

test('the seed is a requestable of an application: missing, unknown or the MCP itself are refused', () => {
  const { host } = fakeHost({ behave: idempotent });
  assert.throws(() => S.prove({}, host), /seed-proof: requestable is required/);
  assert.throws(() => S.prove({ requestable: 'P.nope' }, host), /P\.nope is not a sequence or a transaction of project P/);
  assert.throws(() => S.prove({ requestable: 'lib_ConvertigoMCP.tools_project_list' }, host), /is part of the Convertigo MCP and Tigo/);
  assert.throws(() => S.prove({ requestable: 'lib_ConvertigoAssistant.settings_set' }, host), /is part of the Convertigo MCP and Tigo/);
  // a transaction seed, and the sequences alias of requestable-execute
  assert.equal(plain(S.prove({ requestable: 'P.cn:db.tr:parents_seed' }, fakeHost({ behave: db => { db.parents = 1; return ok(); } }).host)).verdict, 'replayable');
  assert.equal(plain(S.prove({ requestable: 'P.sequences.seed_demo' }, fakeHost({ behave: idempotent }).host)).verdict, 'replayable');
});

test('the tables an SQL text writes, texts, comments and non-writes left out', () => {
  const t = sql => plain(S.writtenTables(sql));
  assert.deepEqual(t(SQL['P.db.parents_seed']), ['parents']);
  assert.deepEqual(t(SQL['P.db.children_seed']), ['public.children']);
  assert.deepEqual(t(SQL['P.db.events_seed']), ['"Events"']);
  assert.deepEqual(t(SQL['P.db.parents_count']), []);
  assert.deepEqual(t("insert into items(a) values ('UPDATE x SET'); update items set a = 1; DELETE FROM item_lines WHERE id = 2; -- DELETE FROM ghosts"),
    ['items', 'item_lines']);
  assert.deepEqual(t('INSERT INTO t (a) VALUES (1) ON DUPLICATE KEY UPDATE a = 1'), ['t']);
  assert.deepEqual(t('INSERT INTO t (a) VALUES (1) ON CONFLICT (a) DO UPDATE SET a = 1'), ['t']);
  assert.deepEqual(t('SELECT * FROM t FOR UPDATE'), []);
  assert.deepEqual(t('CREATE TABLE IF NOT EXISTS a (id INT, b_id INT REFERENCES b(id) ON UPDATE CASCADE ON DELETE CASCADE)'), []);
  assert.deepEqual(t('TRUNCATE TABLE logs; TRUNCATE stats; UPDATE ONLY s.items SET a = 1; REPLACE INTO r VALUES (1); INSERT IGNORE INTO i VALUES (1)'),
    ['logs', 'stats', 's.items', 'r', 'i']);
  assert.deepEqual(t('UPSERT INTO u VALUES (1); MERGE INTO [Dbo].[Orders] o USING x ON 1 = 1 WHEN MATCHED THEN DELETE'), ['u', '[Dbo].[Orders]']);
  assert.deepEqual(t('INSERT INTO Items VALUES (1); insert into items values (2); INSERT INTO {{table}} VALUES (3)'), ['Items']);
  // a raw {{table}} gives no name: the write is listed as not counted
  const model = appModel();
  const reach = plain(S.reach(model, 'P.seed_demo', C8O.securityAudit, q => ({ sql: q === 'P.db.parents_seed' ? 'INSERT INTO {{t}} VALUES (1)' : SQL[q] }), 'P'));
  assert.deepEqual(reach.notCounted, [{ requestable: 'P.db.parents_seed', writes: 'SQL INSERT: no table name read in its SQL' }]);
  assert.deepEqual(reach.tables.map(x => x.label), ['db.public.children', 'db."Events"']);
});

test('the tables of a library the seed calls are counted on its own connector', () => {
  const model = appModel({ external: [
    { qname: 'lib_Ref.load', kind: 'sequence', external: true, calls: ['lib_Ref.refdb.countries_seed'], writes: [] },
    { qname: 'lib_Ref.refdb.countries_seed', kind: 'transaction', external: true, requestableClass: 'SqlTransaction', calls: [], writes: ['SQL INSERT'] }
  ] });
  model.requestables[0].calls.push('lib_Ref.load');
  const sql = Object.assign({ 'lib_Ref.refdb.countries_seed': 'INSERT INTO countries (code) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM countries)' }, SQL);
  const { host, calls } = fakeHost({ model, sql, db: { parents: 1, 'public.children': 1, '"Events"': 1, countries: 3 }, behave: () => ok() });
  const answer = plain(S.prove({ requestable: 'P.seed_demo' }, host));
  assert.deepEqual(answer.tables.map(t => t.table), ['db.parents', 'db.public.children', 'db."Events"', 'lib_Ref.refdb.countries']);
  assert.deepEqual(calls.count.slice(0, 2), ['P.db:parents,public.children,"Events"', 'lib_Ref.refdb:countries']);
});

test('the answer stays under the paging budget as a client weighs it (indented by 2)', () => {
  const long = 'x'.repeat(3000);
  const db = {};
  const tables = Array.from({ length: 60 }, (_, i) => 'db.table_with_a_rather_long_name_' + i);
  tables.forEach(name => { db[name.substring(3)] = null; });
  const external = Array.from({ length: 40 }, (_, i) => ({ qname: 'lib_X.store.put_' + i + '_' + 'y'.repeat(60), kind: 'transaction', external: true,
    requestableClass: 'PutDocumentTransaction', calls: [], writes: ['CouchDB PutDocument'] }));
  const model = appModel({ external });
  model.requestables[0].calls = model.requestables[0].calls.concat(external.map(e => e.qname));
  const { host } = fakeHost({ model, db, behave: () => ({ status: 'error', error: { message: long } }) });
  host.count = (project, connector, list) => list.map(table => ({ table, rows: null, error: 'cannot read ' + table + ' ' + long }));
  const answer = plain(S.prove({ requestable: 'P.seed_demo', tables }, host));
  const size = JSON.stringify(answer, null, 2).length;
  assert.ok(size <= 14000, 'indented size ' + size);
  assert.equal(answer.verdict, 'failed');
  assert.ok(answer.runs[0].error.length <= 400);
  assert.ok(answer.notCountedMore > 0 || answer.notCounted.length === 40);
  // A normal answer is far below it and keeps every table.
  const normal = plain(S.prove({ requestable: 'P.seed_demo' }, fakeHost({ behave: idempotent }).host));
  assert.ok(JSON.stringify(normal, null, 2).length < 2000);
});

test('a run reads the answer of tools_requestable_execute as the internal request returns it', () => {
  assert.deepEqual(plain(S.executionOf({ document: { result: { result: { requestable: 'P.s', status: 'ok', payload: { n: 1 } } } } })),
    { requestable: 'P.s', status: 'ok', payload: { n: 1 } });
  assert.deepEqual(plain(S.executionOf({ document: { error: { message: 'There is no sequence named s in project P.' } } })),
    { status: 'error', error: { message: 'There is no sequence named s in project P.' } });
  assert.equal(S.executionOf({ document: {} }).status, 'error');
  const source = read('js/tools_seed_proof.js');
  assert.match(source, /request\.put\("__sequence", "tools_requestable_execute"\);/);
  assert.match(source, /C8O\.sqlSelect\.query\(jdbc, "SELECT COUNT\(\*\) FROM " \+ tables\[i\], 1\)/);
  assert.match(source, /jdbc = C8O\.sqlSelect\.connect\(connector\);/);
  assert.doesNotMatch(source, /allowDataReset/, 'never asks requestable-execute to empty a table');
});

test('seed-proof is a registered read tool with closed schemas, offered to Vibe', () => {
  assert.match(read('c8oProject.yaml'), /\n  ↓tools_seed_proof \[sequences\.GenericSequence\]: 🗏 sequences\/tools_seed_proof\.yaml\n/);
  const yaml = read('_c8oProject/sequences/tools_seed_proof.yaml');
  assert.match(yaml, /^accessibility: Private\ncomment: \|\n  Prove that a seed is replayable\n/);
  for (const line of yaml.split('\n').filter(l => /^\s*(↓.*\]|[A-Za-z]+|- [A-Za-z.]+):$/.test(l.trim()) || /\]: $/.test(l))) {
    assert.ok(/: $/.test(line), 'trailing space kept: ' + JSON.stringify(line));
  }
  assert.match(yaml, /include\("js\/tools_sql_select\.js"\); include\("js\/tools_seed_proof\.js"\);/);
  assert.match(yaml, /C8O\.seedProof\.execute\(context, \{requestable: requestable, variables: variables, authenticatedUser: authenticatedUser, tables: tables\}\)/);
  const confirm = { C8O: {} };
  vm.createContext(confirm);
  vm.runInContext(read('js/studio_write_confirm.js'), confirm);
  assert.equal(confirm.C8O.studioWriteConfirm.READ_TOOLS.tools_seed_proof, true);
  assert.equal(confirm.C8O.studioWriteConfirm.WRITE_TOOLS.tools_seed_proof, undefined);
  assert.match(read('js/setup_vibe.js'), /"Convertigo_crud-proof",\n\s+"Convertigo_seed-proof",/);
  const overrides = { C8O: {} };
  overrides.include = file => vm.runInContext(read(file), overrides);
  vm.createContext(overrides);
  vm.runInContext(read('js/schema_overrides.js'), overrides);
  const O = overrides.C8O.schemaOverrides;
  const input = plain(O.applyInput('tools_seed_proof', null, null));
  assert.deepEqual(input.required, ['requestable']);
  assert.deepEqual(Object.keys(input.properties), ['requestable', 'variables', 'authenticatedUser', 'tables']);
  assert.equal(input.additionalProperties, false);
  const output = plain(O.applyOutput('tools_seed_proof', null, null));
  assert.equal(output.additionalProperties, false);
  assert.deepEqual(output.properties.verdict.enum, ['replayable', 'failed']);
  // every field an answer can hold is declared (a strict client refuses the others)
  const { host } = fakeHost({ behave: idempotent });
  for (const key of Object.keys(plain(S.prove({ requestable: 'P.seed_demo' }, host))).concat(['tablesOmitted', 'notCountedMore'])) {
    assert.ok(output.properties[key], key);
  }
  assert.match(read('TOOLS.md'), /\| `seed-proof` \| `tools_seed_proof` \|/);
  assert.doesNotMatch(read('js/nocode_tool_policy.js'), /tools_seed_proof/, 'not a No Code tool');
});

test('the seed guide says what a replay proof and a fresh-server proof are, and points to seed-proof', () => {
  const guide = read('resources/guides/common/seed.md');
  assert.match(guide, /A replay proof is: the seed answers status ok on a second run, and the counts of the tables it writes are the same after the second run as after the first\./);
  assert.match(guide, /A fresh-server proof is: the tables empty \(or the database new\), one run answering ok, then the expected counts\./);
  assert.match(guide, /An answer `status: error` \(or any error field\) from the seed blocks every success report about it: fix the seed and prove it again\. Counts unchanged after an error prove nothing/);
  assert.match(guide, /"Replayable on a fresh server" never means callable anonymously\./);
  assert.match(guide, /Never put a `public-write` line on a seed, an init or any job/);
  assert.match(guide, /Prove a seed with `seed-proof`/);
  assert.match(read('resources/convertigo_common_skill.md'), /prove idempotence with `seed-proof`/);
});

test('a trigger or a grant naming UPDATE ON is not a write of a table named ON', () => {
  const S = load().seedProof;
  assert.deepEqual(plain(S.writtenTables('CREATE TRIGGER t AFTER UPDATE ON items FOR EACH ROW CALL x')), []);
  assert.deepEqual(plain(S.writtenTables('GRANT SELECT, UPDATE ON items TO app; INSERT INTO items (n) VALUES (1)')), ['items']);
});
