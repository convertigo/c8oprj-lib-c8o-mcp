const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// In-memory checks of sql-transaction-create, facade-create and ngx-page-create
// (js/tools_generators.js, js/tools_generators_ngx.js). The Convertigo beans and the
// batch engine are faked: what is checked is the spec validation, the trees handed to
// C8O.dbo.batchApply, the generated JavaScript and the all-or-nothing rollback. A live
// run on a Studio is still the proof that the engine accepts the trees and the pages build.

const root = path.resolve(__dirname, '../..');
const sources = {
  'js/sql_dialect.js': fs.readFileSync(path.join(root, 'js/sql_dialect.js'), 'utf8'),
  'js/tools_generators.js': fs.readFileSync(path.join(root, 'js/tools_generators.js'), 'utf8'),
  'js/tools_generators_ngx.js': fs.readFileSync(path.join(root, 'js/tools_generators_ngx.js'), 'utf8')
};

// --- fake beans ---------------------------------------------------------------------------------

function list(items) {
  return { size: () => items.length, get: i => items[i] };
}

let priority = 1000;

function bean(name, javaClass, parent, props) {
  const node = {
    name, javaClass, parent, props: props || {}, children: [], priority: ++priority,
    getName: () => name,
    getQName: () => (parent ? parent.getQName() + '.' : '') + name,
    getClass: () => ({ getName: () => javaClass }),
    getAllChildren: () => list(node.children),
    getVariablesList: () => list(node.children.filter(c => /Variable$/.test(c.javaClass))),
    getConnectorsList: () => list(node.children.filter(c => /Connector$/.test(c.javaClass))),
    getStyleContent: () => ({ getString: () => node.props.styleContent || '' }),
    getSequencesList: () => list(node.children.filter(c => /Sequence$/.test(c.javaClass))),
    getReferenceList: () => list((node.references || []).map(n => ({ getParser: () => ({ getProjectName: () => n }) }))),
    getHttpInfo: () => node.props.httpInfo === true,
    getHttpInfoTagName: () => node.props.httpInfoTagName || 'HttpInfo'
  };
  if (parent) {
    parent.children.push(node);
  }
  return node;
}

const JAVA = {
  'transactions.SqlTransaction': 'com.twinsoft.convertigo.beans.transactions.SqlTransaction',
  'variables.RequestableVariable': 'com.twinsoft.convertigo.beans.variables.RequestableVariable',
  'sequences.GenericSequence': 'com.twinsoft.convertigo.beans.sequences.GenericSequence'
};

function makeWorld(options) {
  const opts = options || {};
  const project = bean('App', 'com.twinsoft.convertigo.beans.core.Project');
  project.getDirPath = () => '/ws/App';
  const db = bean('db', 'com.twinsoft.convertigo.beans.connectors.SqlConnector', project);
  const tx = (name, vars) => {
    const t = bean(name, JAVA['transactions.SqlTransaction'], db);
    vars.forEach(v => bean(v, JAVA['variables.RequestableVariable'], t));
    return t;
  };
  tx('q_user_by_email', ['email']);
  tx('q_postes', ['recherche', 'rpcaId', 'actif']);
  tx('w_journal_insert', ['utilisateurId', 'resume']);
  const appComp = bean('NgxApp', 'com.twinsoft.convertigo.beans.ngx.components.ApplicationComponent', bean('Application', 'x.MobileApplication', project));
  project.getMobileApplication = () => ({ getApplicationComponent: () => appComp });
  bean('Login', 'x.PageComponent', appComp);
  if (opts.style) {
    bean('AppLayout', 'x.UIStyle', appComp, { styleContent: opts.style });
  }
  const seq = bean('poste_list', JAVA['sequences.GenericSequence'], project);
  ['recherche', 'statut', 'rpcaId'].forEach(v => bean(v, JAVA['variables.RequestableVariable'], seq));
  const submit = bean('declaration_declare', JAVA['sequences.GenericSequence'], project);
  ['posteIds', 'dateEffective', 'commentaire', 'source'].forEach(v => bean(v, JAVA['variables.RequestableVariable'], submit));
  bean('auth_logout', JAVA['sequences.GenericSequence'], project);
  // Other sources: an HTTP connector, a local sequence, a referenced library and a loaded but unreferenced one.
  const api = bean('api', 'com.twinsoft.convertigo.beans.connectors.HttpConnector', project);
  const http = (name, vars, props) => {
    const t = bean(name, 'com.twinsoft.convertigo.beans.transactions.JsonHttpTransaction', api, props);
    vars.forEach(v => bean(v, 'com.twinsoft.convertigo.beans.variables.RequestableHttpVariable', t));
    return t;
  };
  http('getTodos', ['userId'], { httpInfo: true });
  http('postTodo', ['title', 'ownerId'], { httpInfo: true });
  http('getRaw', ['id'], {});
  http('q_postes', [], { httpInfo: true });
  const boom = bean('boom', JAVA['sequences.GenericSequence'], project);
  bean('fail', JAVA['variables.RequestableVariable'], boom);
  project.references = ['lib_csv'];
  const libs = {};
  ['lib_csv', 'lib_other'].forEach(n => {
    libs[n] = bean(n, 'com.twinsoft.convertigo.beans.core.Project');
    const lseq = bean('api_data_pure', JAVA['sequences.GenericSequence'], libs[n]);
    bean('nb_lines', JAVA['variables.RequestableVariable'], lseq);
  });
  const files = Object.assign({ '/ws/App/js/app.js': 'var App = { posteList: function (ctx) {}, declare: function (ctx) {} };' }, opts.files || {});
  return { project, db, appComp, files, libs, ops: [], deleted: [], failOn: opts.failOn || null };
}

function find(rootBean, qname) {
  if (rootBean.getQName() === qname) {
    return rootBean;
  }
  for (const child of rootBean.children) {
    const hit = find(child, qname);
    if (hit) {
      return hit;
    }
  }
  return null;
}

function buildTree(parent, node) {
  const created = bean(node.name, JAVA[node.className] || node.className, parent, Object.assign({}, node.properties));
  if (/SqlTransaction/.test(created.javaClass)) {
    const sql = String((node.properties || {}).sqlQuery || '');
    const names = [];
    sql.replace(/\{\{?([A-Za-z_]\w*)\}?\}/g, (_m, n) => { if (!names.includes(n)) names.push(n); });
    names.forEach(n => bean(n, JAVA['variables.RequestableVariable'], created));
  }
  (node.children || []).forEach(child => {
    if (!created.children.some(c => c.name === child.name)) {
      buildTree(created, child);
    }
  });
  return created;
}

function load(world) {
  const sandbox = {
    Packages: { com: { twinsoft: { convertigo: { engine: { Engine: { theApp: { databaseObjectsManager: {
      getOriginalProjectByName: name => (name === 'App' ? world.project : world.libs[name] || null)
    } } } } } } } },
    java: {
      io: { File: function (dir, p) { const full = dir + '/' + p; this.isFile = () => full in world.files; this.toPath = () => full; } },
      nio: { file: { Files: { readAllBytes: full => world.files[full] } } },
      lang: { String: function (content) { return new String(content); } }
    },
    C8O: {
      dbo: {
        resolve: (qname, o) => {
          const hit = find(world.project, String(qname));
          if (!hit && !(o && o.optional)) {
            throw new Error('not found ' + qname);
          }
          return hit;
        },
        batchApply: args => {
          const op = args.operations[0];
          world.ops.push(JSON.parse(JSON.stringify(op)));
          if (op.type === 'delete') {
            const hit = find(world.project, op.qname);
            if (hit) {
              hit.parent.children.splice(hit.parent.children.indexOf(hit), 1);
              world.deleted.push(op.qname);
            }
            return { status: 'ok', summary: {}, errors: [], operations: [], warnings: [] };
          }
          if (op.type === 'create') {
            if (world.failOn === op.name) {
              return { status: 'failed', summary: { failedOps: 1 }, errors: [], operations: [{ errors: [{ message: 'boom on ' + op.name }] }], warnings: [] };
            }
            buildTree(find(world.project, op.related), op);
          }
          if (op.type === 'setProperties') {
            Object.assign(find(world.project, op.qname).props, op.properties);
          }
          return { status: 'ok', summary: {}, errors: [], operations: [], warnings: [] };
        },
        saveProject: () => ({ saved: true }),
        refreshStudioTreeByQName: () => ({}),
        triggerMobileBuilderRefresh: () => ({ triggered: true })
      }
    }
  };
  sandbox.include = file => {
    if (sources[file]) {
      vm.runInContext(sources[file], sandbox);
    }
  };
  vm.createContext(sandbox);
  sandbox.include('js/tools_generators_ngx.js');
  return sandbox.C8O.generators;
}

function walk(node, visit, parents) {
  visit(node, parents || []);
  (node.children || []).forEach(c => walk(c, visit, (parents || []).concat([node])));
}

// Values built in the vm context have other prototypes: compare their JSON.
const plain = value => JSON.parse(JSON.stringify(value));

function creates(world, className) {
  return world.ops.filter(op => op.type === 'create' && (!className || op.className === className));
}

// --- SQL ---------------------------------------------------------------------------------------

test('lintSql refuses the SQL guide mistakes and explains the fix', () => {
  const G = load(makeWorld());
  const bad = G.lintSql("SELECT id, numero_poste AS num, x AS \"Bad_Alias\" FROM t WHERE ({a} IS NULL OR id IN ({ids})) AND d > CURRENT_DATE - 30 AND l LIKE '{q}%'");
  const text = bad.errors.join('\n');
  assert.match(text, /'\{q\}%' puts a \{variable\} inside a string literal/);
  assert.match(text, /CURRENT_DATE - 30 DAY/);
  assert.match(text, /\{a\} IS NULL is never true/);
  assert.match(text, /IN \(\{ids\}\) binds one value.*POSITION/);
  assert.match(text, /id -> id AS "id"/);
  assert.match(text, /numero_poste AS num -> numero_poste AS "numeroPoste"/);
  assert.match(text, /"Bad_Alias" is not camelCase/);
  assert.equal(G.lintSql('SELECT * FROM t').errors.length, 1);
  const good = G.lintSql("SELECT p.id AS \"id\", COUNT(*) AS \"total\", COALESCE(p.l, '') AS \"libelle\" FROM poste p WHERE ({x} = '' OR p.id = {x}) AND p.d > CURRENT_DATE - 2 MONTH GROUP BY p.id");
  assert.deepEqual(plain(good.errors), []);
  assert.equal(G.lintSql('UPDATE t SET a = {a} WHERE id = {id}; INSERT INTO j (r) VALUES ({r})').statements, 2);
  assert.match(G.lintSql('SELECT a AS "a" FROM {{table}}').warnings[0], /raw text substitution/);
});

test('the SQL rules and the written SQL follow the database of the connector', () => {
  const G = load(makeWorld());
  const date = "SELECT p.id AS \"id\" FROM p WHERE p.d > CURRENT_DATE - 30";
  assert.match(G.lintSql(date, 'mysql').errors.join('\n'), /silently wrong.*CURRENT_DATE - INTERVAL 30 DAY/);
  assert.deepEqual(plain(G.lintSql(date, 'postgresql').errors), [], 'a PostgreSQL date minus a number is days');
  assert.match(G.lintSql("SELECT a AS \"a\" FROM t WHERE l LIKE '{q}%'", 'mysql').errors[0], /CONCAT\(\{x\}, '%'\)/);
  const errors = [];
  const sql = G.buildSql({ select: { from: 'orders o', columns: ['o.id'], where: [{ variable: 'q', column: 'o.label', op: 'contains' },
    { variable: 'ids', column: 'o.id', op: 'in' }], limit: 5 } }, errors, 't', 'mysql');
  assert.deepEqual(plain(errors), []);
  assert.match(sql, /LOWER\(COALESCE\(CAST\(o\.label AS CHAR\), ''\)\) LIKE CONCAT\('%', LOWER\(\{q\}\), '%'\)/);
  assert.match(sql, /FIND_IN_SET\(CAST\(o\.id AS CHAR\), \{ids\}\) > 0/);
  assert.doesNotMatch(sql, /\|\|/, 'no || on MariaDB, where it is OR');
  assert.deepEqual(plain(G.lintSql(sql, 'mysql').errors), []);
  G.buildSql({ select: { from: 'orders o', columns: ['o.id'], limit: 5 } }, errors, 't', 'sqlserver');
  assert.match(errors[0], /limit needs orderBy on SQL Server/);
});

test('the starter void SqlConnector does not make the connector argument required', () => {
  const world = makeWorld();
  bean('void', 'com.twinsoft.convertigo.beans.connectors.SqlConnector', world.project);
  const G = load(world);
  const out = G.sqlTransactionCreate({ project: 'App', name: 'q_probe', sql: 'SELECT a AS "a" FROM t' });
  assert.equal(out.transactions[0].qname, 'App.db.q_probe');
});

test('a structured select writes aliases and the optional, contains, list and boolean filters', () => {
  const G = load(makeWorld());
  const errors = [];
  const sql = G.buildSql({ select: { from: 'poste_pca p', columns: ['p.id', 'p.numero_poste'],
    where: [{ variable: 'rpcaId', column: 'p.rpca_id' }, { variable: 'q', columns: ['p.numero_poste', 'p.libelle'], op: 'contains' },
      { variable: 'ids', column: 'p.id', op: 'in' }, { variable: 'actif', column: 'p.actif', op: 'bool' },
      { variable: 'id', column: 'p.id', required: true }, { sql: 'p.x = 1' }], orderBy: 'p.id', limit: 10 } }, errors, 't');
  assert.deepEqual(plain(errors), []);
  assert.match(sql, /^SELECT p\.id AS "id", p\.numero_poste AS "numeroPoste"\nFROM poste_pca p\nWHERE/);
  assert.match(sql, /\(\{rpcaId\} = '' OR p\.rpca_id = \{rpcaId\}\)/);
  assert.match(sql, /\(\{q\} = '' OR \(LOWER\(COALESCE\(CAST\(p\.numero_poste AS VARCHAR\(4000\)\), ''\)\) LIKE '%' \|\| LOWER\(\{q\}\) \|\| '%' OR /);
  assert.match(sql, /\(\{ids\} = '' OR POSITION\(',' \|\| CAST\(p\.id AS VARCHAR\(40\)\) \|\| ',' IN ',' \|\| \{ids\} \|\| ','\) > 0\)/);
  assert.match(sql, /\(\{actif\} = '' OR p\.actif = \(\{actif\} = 'true'\)\)/);
  assert.match(sql, /\n  AND \(p\.id = \{id\}\)\n/);
  assert.match(sql, /ORDER BY p\.id\nLIMIT 10$/);
  assert.deepEqual(plain(G.lintSql(sql).errors), []);
  assert.equal(G.buildSql({ insert: { table: 'j', values: { a: 'a', d: { sql: 'CURRENT_TIMESTAMP' } } } }, errors, 't'), 'INSERT INTO j (a, d)\nVALUES ({a}, CURRENT_TIMESTAMP)');
  assert.equal(G.buildSql({ update: { table: 'p', set: { v: 'v' }, where: { id: 'id' } } }, errors, 't'), 'UPDATE p SET v = {v}\nWHERE id = {id}');
  assert.equal(G.buildSql({ delete: { table: 'p', where: { id: 'id' } } }, errors, 't'), 'DELETE FROM p\nWHERE id = {id}');
  const bad = [];
  G.buildSql({ select: { from: 't', columns: { Bad: 'x' } } }, bad, 't');
  assert.match(bad[0], /must be camelCase/);
});

test('sql-transaction-create validates everything first, then creates the transactions with their variables', () => {
  const world = makeWorld();
  const G = load(world);
  assert.throws(() => G.sqlTransactionCreate({ project: 'App', transactions: JSON.stringify([
    { name: 'q_ok', sql: 'SELECT a AS "a" FROM t' }, { name: 'q_postes', sql: 'SELECT b FROM t' }, { name: 'w_x', sql: 'UPDATE t SET a = {a}', variables: { zz: 1 } }]) }),
    err => /nothing was created/.test(err.message) && /q_postes already exists/.test(err.message) && /b -> b AS "b"/.test(err.message) && /variables\.zz is not used/.test(err.message));
  assert.equal(creates(world).length, 0);
  const out = G.sqlTransactionCreate({ project: 'App', transactions: [
    { name: 'q_last', select: { from: 'd', columns: { id: 'd.id' }, orderBy: 'd.id DESC', limit: 5 } },
    { name: 'w_two', sql: 'UPDATE t SET a = {a} WHERE id = {id}; INSERT INTO j (a) VALUES ({a})', variables: { id: { value: 0, description: 'Id' } } }] });
  assert.equal(out.status, 'ok');
  assert.deepEqual(plain(out.created), ['App.db.q_last', 'App.db.w_two']);
  assert.deepEqual(plain(out.transactions[1].variables), ['a', 'id']);
  const two = creates(world).find(op => op.name === 'w_two');
  assert.equal(two.properties.autoCommit, '2');
  assert.deepEqual(plain(two.children), [{ className: 'variables.RequestableVariable', name: 'id', properties: { description: 'Id', value: '0' } }]);
  const replaced = G.sqlTransactionCreate({ project: 'App', name: 'q_postes', sql: 'SELECT p.id AS "id" FROM p WHERE ({recherche} = \'\' OR p.n = {recherche})', ifExists: 'replace' });
  assert.equal(replaced.transactions[0].status, 'replaced');
  assert.equal(world.ops[world.ops.length - 1].type, 'upsertTree');
});

// --- facade ------------------------------------------------------------------------------------

function facadeSpec(extra) {
  return Object.assign({ project: 'App', name: 'poste_get', logic: 'App.posteList', inputs: ['id', { name: 'statut', value: 'A' }], roles: ['ADMIN', 'RPCA'],
    reads: [{ name: 'postes', transaction: 'q_postes', vars: { rpcaId: "me.role === 'ADMIN' ? '' : me.id" }, perimeter: { field: 'rpcaId', bypassRoles: ['ADMIN'], mode: 'deny' }, required: true },
      { name: 'last', select: { from: 'd', columns: { id: 'd.id' } } }],
    writes: [{ name: 'journal', transaction: 'w_journal_insert' }, { name: 'stamp', update: { table: 'p', set: { v: 'v' }, where: { id: 'id' } } }] }, extra || {});
}

test('facade-create checks the active column the spec names', () => {
  const world = makeWorld();
  const G = load(world);
  G.facadeCreate(facadeSpec({ auth: { activeField: 'enabled' } }));
  const seq = creates(world, 'sequences.GenericSequence')[0];
  const auth = seq.children.find(c => c.name === 'auth');
  assert.match(auth.properties.expression, /me\.enabled === true \|\| String\(me\.enabled\) === "true"/);
});

test('facade-create builds the recipe shape and valid JavaScript', () => {
  const world = makeWorld();
  const G = load(world);
  const out = G.facadeCreate(facadeSpec());
  assert.equal(out.sequence, 'App.poste_get');
  assert.deepEqual(plain(out.created), ['App.db.q_last', 'App.db.w_stamp', 'App.poste_get']);
  const seq = creates(world, 'sequences.GenericSequence')[0];
  assert.deepEqual(plain(seq.properties), { accessibility: 'Hidden', authenticatedContextRequired: true });
  assert.deepEqual(plain(seq.children.map(c => c.name)), ['init', 'callMe', 'srcMe', 'auth', 'ifAllowed', 'guard', 'logic', 'ifWrite_journal', 'ifWrite_stamp',
    'outSuccess', 'outData', 'outErrors', 'outMeta', 'id', 'statut']);
  const byName = {};
  walk({ children: seq.children }, n => { if (n.name) byName[n.name] = n; });
  assert.equal(byName.callMe.properties.sourceTransaction, 'App.db.q_user_by_email');
  assert.equal(byName.callMe.importVariables, true);
  assert.deepEqual(plain(byName.srcMe.properties.sourceDefinition), { step: 'callMe', xpath: './document/sql_output' });
  assert.deepEqual(plain(byName.src_postes.properties.sourceDefinition), { step: 'call_postes', xpath: './document' });
  assert.equal(byName.call_last.properties.sourceTransaction, 'App.db.q_last');
  assert.equal(byName.ifAllowed.properties.condition, 'resp === null');
  assert.match(byName.auth.properties.expression, /\["ADMIN","RPCA"\]\.indexOf\(String\(me\.role\)\) < 0\) \{ resp = \{ success: false, data: null, errors: \[\{ code: 'FORBIDDEN'/);
  assert.doesNotMatch(byName.auth.properties.expression, /actif/, 'no active column unless the spec names one');
  assert.match(byName.prep_postes.properties.expression, /rpcaId = String\(me\.role === 'ADMIN' \? '' : me\.id\);/);
  assert.match(byName.guard.properties.expression, /\["ADMIN"\]\.indexOf\(String\(me\.role\)\) < 0/);
  assert.match(byName.guard.properties.expression, /'NOT_FOUND'/);
  assert.match(byName.guard.properties.expression, /'READ_FAILED'/);
  assert.match(byName.logic.properties.expression, /resp = App\.posteList\(\{ me: me, input: facadeInput, reads: reads, today: new Date\(\) \}\);/);
  assert.equal(byName.ifWrite_journal.properties.condition, 'resp && resp.success === true && rows_journal.length > 0');
  assert.equal(byName.set_journal.properties.expression.split('\n').length, 2);
  assert.match(byName.set_stamp.properties.expression, /^v = .*\nid = /);
  assert.equal(byName.ifOk_journal.properties.condition, 'resp.success === true');
  assert.match(byName.check_journal.properties.expression, /d_w\.error\) \{ resp = .*'WRITE_FAILED'/);
  assert.deepEqual(plain(byName.outData.properties.key), { mode: 'PLAIN', expression: 'data' });
  assert.deepEqual(plain(byName.statut.properties), { description: 'statut', value: 'A' });
  for (const name of ['init', 'auth', 'prep_postes', 'guard', 'logic', 'set_journal', 'check_journal']) {
    assert.doesNotThrow(() => new Function(byName[name].properties.expression), name + ' must be valid JavaScript');
  }
  for (const name of ['outSuccess', 'outData', 'outErrors', 'outMeta']) {
    assert.doesNotThrow(() => new Function('return ' + byName[name].properties.jsonObject.expression), name);
  }
});

test('the generated facade runs: role, perimeter, logic and writes', () => {
  const world = makeWorld();
  const G = load(world);
  G.facadeCreate(facadeSpec());
  const seq = creates(world, 'sequences.GenericSequence')[0];
  const byName = {};
  walk({ children: seq.children }, n => { if (n.name) byName[n.name] = n; });
  // Run the step code in order with the transaction results faked, as Rhino would share one scope.
  function run(me, rows, logic) {
    const scope = { context: { getAuthenticatedUser: () => 'a@b' }, include: () => {}, App: { posteList: logic }, id: '7', statut: 'A', calls: [] };
    vm.createContext(scope);
    const exec = name => vm.runInContext(byName[name].properties.expression, scope);
    exec('init');
    scope.meRows = me ? [me] : [];
    exec('auth');
    if (scope.resp === null) {
      exec('prep_postes');
      scope.doc_postes = { document: { sql_output: rows } };
      scope.doc_last = { document: { sql_output: [] } };
    }
    exec('guard');
    exec('logic');
    if (scope.resp && scope.resp.success === true) {
      for (const item of scope.rows_journal) {
        scope.item = item;
        exec('set_journal');
        scope.calls.push({ utilisateurId: scope.utilisateurId, resume: scope.resume });
        scope.docW_journal = { document: item.fail ? { error: { details: 'no table' } } : { sql_output: '1 row(s) updated' } };
        exec('check_journal');
        if (scope.resp.success !== true) break;
      }
    }
    return scope;
  }
  const ok = (data, writes) => ctx => ({ success: true, data: data(ctx), errors: [], meta: {}, writes });
  let s = run(null, [], ok(() => 1));
  assert.equal(s.resp.errors[0].code, 'UNAUTHENTICATED');
  s = run({ id: 2, role: 'GUEST', actif: true }, [], ok(() => 1));
  assert.equal(s.resp.errors[0].code, 'FORBIDDEN');
  s = run({ id: 2, role: 'RPCA', actif: 'true' }, [{ id: 7, rpcaId: 3 }], ok(() => 1));
  assert.equal(s.resp.errors[0].code, 'FORBIDDEN', 'deny perimeter');
  assert.deepEqual(plain(s.reads.postes), [], 'no out-of-perimeter row kept');
  s = run({ id: 2, role: 'RPCA', actif: true }, [], ok(() => 1));
  assert.equal(s.resp.errors[0].code, 'NOT_FOUND');
  assert.equal(s.rpcaId, '2', 'read variable from vars');
  s = run({ id: 1, role: 'ADMIN', actif: true }, [{ id: 7, rpcaId: 3 }], ok(ctx => ctx.reads.postes.length + ':' + ctx.input.statut,
    { journal: [{ utilisateurId: 1, resume: 'r1' }, { utilisateurId: 1, resume: null }] }));
  assert.equal(s.resp.data, '1:A');
  assert.equal(s.resp.writes, undefined, 'writes never reach the response');
  assert.deepEqual(plain(s.calls), [{ utilisateurId: '1', resume: 'r1' }, { utilisateurId: '1', resume: '' }]);
  assert.equal(s.written.journal, 2);
  s = run({ id: 1, role: 'ADMIN', actif: true }, [{ id: 7 }], ok(() => 1, { journal: [{ fail: true }, { resume: 'never' }] }));
  assert.equal(s.resp.errors[0].code, 'WRITE_FAILED');
  assert.match(s.resp.errors[0].message, /journal: no table/);
  assert.equal(s.calls.length, 1, 'later rows skipped after a failed write');
  s = run({ id: 1, role: 'ADMIN', actif: true }, [{ id: 7 }], () => null);
  assert.equal(s.resp.errors[0].code, 'LOGIC_FAILED');
});

test('facade-create refuses a bad spec and removes what it created when a step fails', () => {
  const world = makeWorld();
  const G = load(world);
  assert.throws(() => G.facadeCreate({ project: 'App', name: 'poste_list', logic: 'App.missing', reads: [{ name: 'x', transaction: 'q_nope' }, { name: 'x', transaction: 'q_postes', vars: { nope: '1' } }] }),
    err => ['poste_list already exists', 'App.missing is not found in js/app.js', 'no transaction q_nope', 'name x is used twice', 'vars.nope is not a variable of q_postes']
      .every(text => err.message.includes(text)));
  assert.throws(() => G.facadeCreate({ project: 'App', name: 'f', logic: 'App.posteList', script: 'js/none.js' }), /js\/none\.js does not exist/);
  assert.equal(creates(world).length, 0);
  world.failOn = 'poste_get';
  assert.throws(() => G.facadeCreate(facadeSpec()), /Nothing was kept/);
  assert.deepEqual(plain(world.deleted), ['App.db.w_stamp', 'App.db.q_last']);
  assert.equal(find(world.project, 'App.db.q_last'), null);
  const anonymous = makeWorld();
  const G2 = load(anonymous);
  G2.facadeCreate({ project: 'App', name: 'pub', logic: 'App.posteList', auth: false });
  const seq = creates(anonymous, 'sequences.GenericSequence')[0];
  assert.equal(seq.properties.authenticatedContextRequired, false);
  assert.deepEqual(plain(seq.children.map(c => c.name)), ['init', 'logic', 'outSuccess', 'outData', 'outErrors', 'outMeta']);
});

// --- facade over other sources -------------------------------------------------------------------

function anySourceSpec(extra) {
  return Object.assign({ project: 'App', name: 'todo_board', logic: 'App.posteList', inputs: ['userId', 'nb'], roles: ['USER', 'ADMIN'],
    auth: { userSequence: 'boom', roles: ['USER', 'ADMIN'] },
    reads: [{ name: 'todos', transaction: 'api.getTodos', perimeter: { field: 'userId', bypassRoles: ['ADMIN'] } },
      { name: 'people', sequence: 'lib_csv.api_data_pure', vars: { nb_lines: 'nb' }, path: 'people', required: true }],
    writes: [{ name: 'post', transaction: 'postTodo' }, { name: 'boom', sequence: 'boom' }] }, extra || {});
}

function stepsByName(seq) {
  const byName = {};
  walk({ children: seq.children }, n => { if (n.name) byName[n.name] = n; });
  return byName;
}

test('facade-create calls transactions of any connector and library sequences', () => {
  const world = makeWorld();
  const G = load(world);
  const out = G.facadeCreate(anySourceSpec());
  assert.deepEqual(plain(out.created), ['App.todo_board'], 'nothing but the facade is created');
  assert.match(out.contract.logic, /todos: JSON body of App\.api\.getTodos, people: JSON of lib_csv\.api_data_pure at people/);
  const byName = stepsByName(creates(world, 'sequences.GenericSequence')[0]);
  assert.equal(byName.callMe.className, 'steps.SequenceStep');
  assert.equal(byName.callMe.properties.sourceSequence, 'App.boom');
  assert.deepEqual(plain(byName.srcMe.properties.sourceDefinition), { step: 'callMe', xpath: './document' });
  assert.equal(byName.call_todos.className, 'steps.TransactionStep');
  assert.equal(byName.call_todos.properties.sourceTransaction, 'App.api.getTodos');
  assert.equal(byName.call_people.className, 'steps.SequenceStep');
  assert.equal(byName.call_people.properties.sourceSequence, 'lib_csv.api_data_pure');
  assert.equal(byName.call_people.importVariables, true);
  assert.equal(byName.prep_people.properties.expression, 'nb_lines = String(nb);');
  assert.equal(byName.callW_post.properties.sourceTransaction, 'App.api.postTodo');
  assert.equal(byName.callW_boom.className, 'steps.SequenceStep');
  assert.match(byName.set_post.properties.expression, /^title = .*\nownerId = /);
  assert.match(byName.init.properties.expression, /function facadeFailure\(d, source, infoTag\)/);
  assert.match(byName.guard.properties.expression, /facadeFailure\(d_todos, 'http', 'HttpInfo'\)/);
  assert.match(byName.guard.properties.expression, /facadePath\(facadeBody\(d_people, 'sequence', ''\), \["people"\]\)/);
  assert.match(byName.check_boom.properties.expression, /facadeFailure\(d_w, 'sequence', ''\)/);
  for (const name of ['init', 'auth', 'prep_people', 'guard', 'logic', 'set_post', 'check_post', 'check_boom']) {
    assert.doesNotThrow(() => new Function(byName[name].properties.expression), name + ' must be valid JavaScript');
  }
  // A name alone still finds the SQL transaction first, then any connector; SQL facades keep their exact code.
  const sqlOnly = makeWorld();
  const G2 = load(sqlOnly);
  G2.facadeCreate(facadeSpec());
  const sqlSteps = stepsByName(creates(sqlOnly, 'sequences.GenericSequence')[0]);
  assert.equal(sqlSteps.call_postes.properties.sourceTransaction, 'App.db.q_postes');
  assert.doesNotMatch(sqlSteps.init.properties.expression, /facadeFailure/);
  assert.equal(sqlSteps.srcMe.properties.sourceDefinition.xpath, './document/sql_output');
  const raw = makeWorld();
  find(raw.project, 'App.api.getRaw').props.httpInfo = true;
  load(raw).facadeCreate({ project: 'App', name: 'raw', logic: 'App.posteList', auth: false, reads: [{ name: 'raw', transaction: 'getRaw' }] });
  assert.equal(stepsByName(creates(raw, 'sequences.GenericSequence')[0]).call_raw.properties.sourceTransaction, 'App.api.getRaw');
});

test('the generated calls detect HTTP and sequence failures and expose the JSON', () => {
  const world = makeWorld();
  const G = load(world);
  G.facadeCreate(anySourceSpec());
  const byName = stepsByName(creates(world, 'sequences.GenericSequence')[0]);
  const meta = { connector: 'api', project: 'App' };
  const info = code => ({ url: 'https://x/todos', status: { text: '', attr: { code: String(code), text: code === 200 ? 'OK' : 'Not Found' } } });
  // docs: documents the faked calls return, by step; writes: documents per write call, in order.
  function run(docs, logic, writes) {
    const scope = { context: { getAuthenticatedUser: () => 'a@b' }, include: () => {}, App: { posteList: logic }, userId: '2', nb: '3', calls: [] };
    vm.createContext(scope);
    const exec = name => vm.runInContext(byName[name].properties.expression, scope);
    exec('init');
    scope.meDoc = { document: docs.me };
    exec('auth');
    if (scope.resp === null) {
      exec('prep_people');
      scope.doc_todos = { document: docs.todos };
      scope.doc_people = { document: docs.people };
    }
    exec('guard');
    exec('logic');
    const queue = (writes || []).slice();
    for (const w of ['post', 'boom']) {
      if (!(scope.resp && scope.resp.success === true)) break;
      for (const item of scope['rows_' + w]) {
        scope.item = item;
        exec('set_' + w);
        scope.calls.push(w);
        scope['docW_' + w] = { document: queue.shift() || { object: { id: 1 }, attr: meta } };
        exec('check_' + w);
        if (scope.resp.success !== true) break;
      }
    }
    return scope;
  }
  const user = { id: 2, role: 'USER', email: 'a@b', attr: meta };
  const todos = { HttpInfo: info(200), array: [{ id: 1, userId: 2 }, { id: 2, userId: 3 }], attr: meta };
  const people = { people: [{ firstname: 'Ann' }], attr: meta };
  const ok = (data, writes) => ctx => ({ success: true, data: data(ctx), errors: [], meta: {}, writes });
  let s = run({ me: { text: '', attr: meta }, todos, people }, ok(() => 1));
  assert.equal(s.resp.errors[0].code, 'UNAUTHENTICATED', 'an empty user document is no user');
  s = run({ me: { id: 9, role: 'GUEST', attr: meta }, todos, people }, ok(() => 1));
  assert.equal(s.resp.errors[0].code, 'FORBIDDEN');
  s = run({ me: user, todos, people }, ok(ctx => ctx));
  assert.deepEqual(plain(s.resp.data.reads.todos), [{ id: 1, userId: 2 }], 'JSON array unwrapped, HttpInfo dropped, perimeter applied');
  assert.deepEqual(plain(s.resp.data.reads.people), [{ firstname: 'Ann' }], 'path picks the rows of the sequence');
  assert.equal(s.resp.data.me.id, 2);
  s = run({ me: Object.assign({}, user, { role: 'ADMIN' }), todos, people }, ok(ctx => ctx.reads.todos.length));
  assert.equal(s.resp.data, 2, 'bypass role keeps every row');
  s = run({ me: user, todos: { HttpInfo: info(404), object: {}, attr: meta }, people }, ok(() => 1));
  assert.equal(s.resp.errors[0].code, 'READ_FAILED');
  assert.match(s.resp.errors[0].message, /todos: HTTP 404 Not Found/);
  s = run({ me: user, todos, people: { error: { message: 'm', details: 'lib down' }, attr: meta } }, ok(() => 1));
  assert.match(s.resp.errors[0].message, /people: lib down/);
  s = run({ me: user, todos, people: { people: [], attr: meta } }, ok(() => 1));
  assert.equal(s.resp.errors[0].code, 'NOT_FOUND', 'required on an empty JSON list');
  s = run({ me: user, todos, people: { success: false, errors: [{ code: 'X', message: 'refused' }], attr: meta } }, ok(() => 1));
  assert.match(s.resp.errors[0].message, /people: success false: refused/, 'a sequence answering success false failed');
  s = run({ me: user, todos, people }, ok(() => 1, { post: [{ title: 't', ownerId: 2 }, { title: 'u' }], boom: { fail: '1' } }));
  assert.equal(s.resp.success, true);
  assert.deepEqual(plain(s.calls), ['post', 'post', 'boom']);
  assert.equal(s.written.post, 2);
  assert.equal(s.title, 'u');
  assert.equal(s.ownerId, '', 'a missing field is an empty variable');
  s = run({ me: user, todos, people }, ok(() => 1, { post: [{ title: 'a' }, { title: 'b' }], boom: { fail: '1' } }),
    [{ HttpInfo: info(500), object: {}, attr: meta }]);
  assert.equal(s.resp.errors[0].code, 'WRITE_FAILED');
  assert.match(s.resp.errors[0].message, /post: HTTP 500/);
  assert.deepEqual(plain(s.calls), ['post'], 'later rows and writes skipped after a failed HTTP write');
  s = run({ me: user, todos, people }, ok(() => 1, { post: [], boom: [{ fail: '0' }, { fail: '1' }, { fail: '0' }] }),
    [{ ok: true, attr: meta }, { error: { message: 'An exception occured', details: 'boom asked' }, attr: meta }]);
  assert.equal(s.resp.errors[0].code, 'WRITE_FAILED');
  assert.match(s.resp.errors[0].message, /boom: boom asked/);
  assert.deepEqual(plain(s.calls), ['boom', 'boom'], 'the third sequence call is skipped');
});

test('facade-create refuses calls it cannot reach or check', () => {
  const world = makeWorld();
  const G = load(world);
  bean('getTodos', 'com.twinsoft.convertigo.beans.transactions.JsonHttpTransaction', bean('api2', 'com.twinsoft.convertigo.beans.connectors.HttpConnector', world.project), { httpInfo: true });
  const expected = [
    'reads[0]: App.api.getRaw has httpInfo off', 'databaseobject-tree-apply({target:"App.api.getRaw", tree:{properties:{httpInfo:true}}})',
    'reads[1]: App does not reference lib_other', 'marketplace-import({project:"lib_other", targetProject:"App"})',
    'reads[2]: project lib_gone is not loaded', 'marketplace-import({project:"lib_gone", targetProject:"App"})',
    'reads[3]: no sequence nope in lib_csv', 'reads[4] gives sequence and transaction',
    'reads[5]: getTodos exists in several connectors (App.api.getTodos, App.api2.getTodos)',
    'reads[6].path must be a dotted key path', 'reads[7].path picks a part of the JSON', 'reads[8]: no connector nope in App',
    'reads[9].vars.zz is not a variable of lib_csv.api_data_pure (nb_lines)', 'writes[0]: no transaction nothing in App.api'
  ];
  assert.throws(() => G.facadeCreate({ project: 'App', name: 'bad', logic: 'App.posteList', auth: false, reads: [
    { name: 'raw', transaction: 'getRaw' },
    { name: 'other', sequence: 'lib_other.api_data_pure' },
    { name: 'gone', sequence: 'lib_gone.x' },
    { name: 'nope', sequence: 'lib_csv.nope' },
    { name: 'both', sequence: 'boom', transaction: 'q_postes' },
    { name: 'twice', transaction: 'getTodos' },
    { name: 'badPath', sequence: 'boom', path: 'a..b' },
    { name: 'sqlPath', transaction: 'q_postes', path: 'rows' },
    { name: 'noConn', transaction: 'nope.getTodos' },
    { name: 'badVar', sequence: 'lib_csv.api_data_pure', vars: { zz: '1' } }
  ], writes: [{ name: 'w', transaction: 'api.nothing' }] }), err => {
    const missing = expected.filter(text => !err.message.includes(text));
    assert.deepEqual(missing, [], err.message);
    return true;
  });
  assert.equal(creates(world).length, 0, 'nothing created');
});

// --- page --------------------------------------------------------------------------------------

function templateValues(node, out, inAction) {
  const action = inAction || /UIDynamicAction|UIControlVariable|UICustomAction/.test(node.className || '');
  for (const [key, value] of Object.entries(node.properties || {})) {
    const text = value && typeof value === 'object' ? (value.value || value.local || '') : value;
    out.push({ node: node.name, key, text: String(text), action });
  }
  (node.children || []).forEach(c => templateValues(c, out, action));
  return out;
}

test('ngx-page-create builds a list page with filters, badges and the session redirect', () => {
  const world = makeWorld();
  const G = load(world);
  const out = G.ngxPageCreate({ project: 'App', name: 'Postes', title: 'Postes', kind: 'list', facade: 'poste_list', authRedirect: 'Login',
    filters: JSON.stringify([{ name: 'recherche', label: 'Recherche' }, { name: 'statut', type: 'select', options: [{ value: '', label: 'Tous' }, 'A'] }]),
    list: { item: 'poste', title: 'numeroPoste', note: { field: 'dateEcheance', prefix: 'Due ' }, badge: { field: 'statut', labels: { A: 'OK' }, colors: { A: 'success' } },
      onItem: { page: 'Detail', data: { id: 'id' } } },
    actions: [{ label: 'Logout', sequence: 'auth_logout', page: 'Login' }] });
  assert.equal(out.page, 'App.Application.NgxApp.Postes');
  assert.equal(out.style, 'AppLayout created');
  assert.deepEqual(plain(out.created), ['App.Application.NgxApp.AppLayout', 'App.Application.NgxApp.Postes']);
  assert.match(out.warnings.join(' '), /onItem\.page Detail is not a page of App yet/);
  assert.match(out.warnings[0], /^English default texts were used for .*list\.empty "No record\."/);
  assert.match(out.warnings[0], /filterLabel "Filter"/);
  const page = creates(world, 'ngx.components.PageComponent#PageComponent')[0];
  const values = templateValues(page, []);
  assert.deepEqual(plain(values.filter(v => !v.action && /c8oPage/.test(v.text))), [], 'templates never use c8oPage');
  const nodes = {};
  walk(page, n => { nodes[n.name] = n; });
  assert.deepEqual(plain(nodes.RecForEach.properties.directiveSource), { mode: 'SOURCE', local: 'data.items' });
  assert.equal(nodes.RecForEach.properties.directiveItemName, 'poste');
  assert.equal(nodes.Main.children[0].properties.textValue.value, '(poste?.numeroPoste ?? \'\')');
  assert.equal(nodes.Nt.children[0].properties.textValue.value, "'Due ' + (poste?.dateEcheance ?? '') + ''");
  assert.match(nodes.Status.children[2].properties.attrValue.value, /poste\?\.statut === 'A' \? 'success' : 'medium'/);
  assert.equal(nodes.InRecherche.properties.DoubleBinding.local, 'filterRecherche');
  const load1 = nodes.Load;
  assert.deepEqual(plain(load1.children.filter(c => /UIControlVariable/.test(c.className)).map(c => [c.name, c.properties.varValue])),
    [['recherche', { mode: 'SOURCE', local: 'filterRecherche' }], ['statut', { mode: 'SOURCE', local: 'filterStatut' }], ['rpcaId', { mode: 'SCRIPT', value: "''" }]]);
  assert.equal(nodes.Reload.properties.cacheTtl.value, '0');
  assert.match(nodes.IfSessionLost.properties.condition.value, /\['UNAUTHENTICATED'\]\.indexOf\(out\?\.errors\?\.\[0\]\?\.code\)/);
  assert.equal(nodes.GoEntry.properties.page.value, 'Login');
  assert.equal(nodes.PageEvent.properties.viewEvent, 'pageWillEnter', 'pageDidEnter does not fire on a deep link');
  assert.equal(nodes.Open.properties.data.value, '{id: scope.poste?.id}');
  assert.equal(nodes.Call.properties.requestable.value, 'App.auth_logout');
  const style = creates(world, 'ngx.components.UIStyle#UIStyle')[0];
  assert.match(style.properties.styleContent, /\.app-page \{/);
});

test('an existing AppLayout is completed with the missing rules only', () => {
  const world = makeWorld({ style: '.app-page { padding: 4px; }\n' });
  const G = load(world);
  const out = G.ngxPageCreate({ project: 'App', name: 'Dash', kind: 'dashboard', facade: 'poste_list',
    dashboard: { kpis: [{ label: 'Actifs', field: 'compteurs.actifs' }], sections: [{ heading: 'Job', record: 'job', fields: [{ label: 'Date', field: 'date' }] }] } });
  assert.match(out.style, /^AppLayout completed with .*\.app-kpis/);
  const css = find(world.project, 'App.Application.NgxApp.AppLayout').props.styleContent;
  assert.equal(css.split('.app-page').length, 2, 'existing rule kept, not duplicated');
  const nodes = {};
  walk(creates(world, 'ngx.components.PageComponent#PageComponent')[0], n => { nodes[n.name] = n; });
  assert.equal(nodes.Value.children[1].properties.textValue.value, '(local?.data?.compteurs?.actifs ?? 0)');
  assert.equal(nodes.S1IfRecord.properties.directiveExpression, 'local?.data?.job');
});

test('a form page wires its submit chain with Form SmartSources on the created UIForm', () => {
  const world = makeWorld();
  const G = load(world);
  const out = G.ngxPageCreate({ project: 'App', name: 'DeclarationForm', kind: 'form', facade: 'poste_list', params: ['posteIds'], locals: { today: "'2026-10-17'" },
    form: { submit: 'declaration_declare', fields: [
      { name: 'posteIds', type: 'select', multiple: true, required: true, optionsFrom: { items: 'items', item: 'p', value: 'id', label: 'numeroPoste' } },
      { name: 'dateEffective', type: 'date', required: true, value: 'local?.today' }, { name: 'commentaire', type: 'textarea', maxLength: 1000 }],
      vars: { source: "'RPCA'" }, success: { message: 'Saved', page: 'Postes', kind: 'root' } } });
  assert.deepEqual(plain(out.calls), ['App.poste_list at page enter', 'App.declaration_declare on submit (declarationForm)']);
  assert.match(out.warnings[0], /form\.submitLabel "Save", form\.cancelLabel "Cancel"|form\.cancelLabel "Cancel", form\.submitLabel "Save"/);
  assert.doesNotMatch(out.warnings[0], /success\.message/, 'a given text is not reported');
  const form = find(world.project, 'App.Application.NgxApp.DeclarationForm.Content.Form');
  assert.equal(form.props.identifier, 'declarationForm');
  const submit = world.ops.filter(op => op.type === 'create' && op.name === 'EventonSubmit')[0];
  assert.equal(submit.related, 'App.Application.NgxApp.DeclarationForm.Content.Form');
  const call = submit.children[0];
  assert.equal(call.properties.requestable.value, 'App.declaration_declare');
  const vars = {};
  call.children.filter(c => /UIControlVariable/.test(c.className)).forEach(c => { vars[c.name] = c.properties.varValue; });
  assert.deepEqual(plain(Object.keys(vars)), ['posteIds', 'dateEffective', 'commentaire', 'source']);
  const date = JSON.parse(vars.dateEffective.value);
  assert.equal(date.filter, 'Form');
  assert.deepEqual(plain(date.model.data), [{ priority: form.priority, identifier: 'declarationForm' }]);
  assert.equal(date.model.path, "?.controls?.['dateEffective']?.value");
  assert.equal(vars.posteIds.value, "(c8oPage.declarationForm?.controls?.['posteIds']?.value || []).join(',')");
  assert.deepEqual(plain(vars.source), { mode: 'SCRIPT', value: "'RPCA'" });
  const pageNodes = {};
  walk(creates(world, 'ngx.components.PageComponent#PageComponent')[0], n => { pageNodes[n.name] = n; });
  assert.equal(pageNodes.SelPosteIds.properties.Required, undefined, 'a Select has no Required property');
  assert.equal(pageNodes.InDateEffective.properties.Required.value, 'true');
  assert.equal(pageNodes.InitToday.properties.Value.value, "'2026-10-17'");
  assert.match(pageNodes.InitPosteIds.properties.Value.value, /^c8oPage\.navParams\?\.data\?\.posteIds/);
  assert.equal(call.children.find(c => c.name === 'IfOk').children[1].properties.page.value, 'Postes');
  // Under an IfAction, out is the If's result: the error message comes from the call through stack.
  const ko = call.children.find(c => c.name === 'IfKo');
  assert.equal(ko.children.find(c => c.name === 'ToastKo').properties.message.value, "stack['Submit'].out?.errors?.[0]?.message || 'Error'");
  const page = creates(world, 'ngx.components.PageComponent#PageComponent')[0];
  [page, submit].forEach(tree => walk(tree, (n, parents) => {
    if (parents.some(p => /IfAction/.test(p.className || '')) && /UIDynamicAction/.test(n.className || '')) {
      assert.doesNotMatch(JSON.stringify(n.properties), /(^|[^.\]'])out\?/, n.name + ' reads out under an IfAction');
    }
  }));
});

test('ngx-page-create refuses a bad spec and creates nothing', () => {
  const world = makeWorld();
  const G = load(world);
  assert.throws(() => G.ngxPageCreate({ project: 'App', name: 'bad name', kind: 'grid', facade: 'nope', filters: [{ name: 'zz' }] }),
    err => ['PascalCase page name', 'kind must be list', 'facade nope is not a sequence'].every(t => err.message.includes(t)));
  assert.throws(() => G.ngxPageCreate({ project: 'App', name: 'Login', kind: 'list', facade: 'poste_list', filters: [{ name: 'zz' }], list: {} }),
    err => ['page Login already exists', 'filters[0].name zz is not a variable of poste_list', 'list.title is required'].every(t => err.message.includes(t)));
  assert.throws(() => G.ngxPageCreate({ project: 'App', name: 'F', kind: 'form', form: { submit: 'declaration_declare', fields: [{ name: 'other' }] } }),
    /form\.fields\[0\]\.name other is not a variable of declaration_declare/);
  assert.equal(creates(world).length, 0);
  world.failOn = 'Broken';
  assert.throws(() => G.ngxPageCreate({ project: 'App', name: 'Broken', kind: 'detail', facade: 'poste_list', detail: { fields: [{ label: 'Id', field: 'id' }] } }), /Nothing was kept/);
  assert.deepEqual(plain(world.deleted), ['App.Application.NgxApp.AppLayout']);
});
