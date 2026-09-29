const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const SENTINEL = 'S3NT1NEL-do-not-leak';
// Values built inside the vm sandbox have foreign prototypes; compare their JSON shape.
const same = (actual, expected) => assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), expected);

// Loads the pure rules and the collector helpers. The collector only touches
// Packages/Engine inside collect(), which the redaction test mocks explicitly.
function loadAudit(extra) {
  const context = Object.assign({ include() {}, C8O: {} }, extra || {});
  vm.runInNewContext(read('js/security_audit_rules.js'), context, { filename: 'security_audit_rules.js' });
  vm.runInNewContext(read('js/security_audit_collect.js'), context, { filename: 'security_audit_collect.js' });
  return context.C8O.securityAudit;
}

function emptyModel(overrides) {
  return Object.assign({
    project: { name: 'P', version: '1.0.0', corsOrigin: 'https://app.example.com', httpSessionTimeout: 1800, contextTimeout: 300 },
    engine: null,
    requestables: [], steps: [], variables: [], secretProperties: [], staticAuthHeaders: [],
    connectors: [], mappings: [], references: [], symbols: [],
    frontend: { present: false, sources: 0, signals: [], calls: [] },
    warnings: []
  }, overrides || {});
}

function seq(name, accessibility, auth, extra) {
  return Object.assign({ qname: 'P.' + name, kind: 'sequence', accessibility, authenticatedContextRequired: auth, calls: [] }, extra || {});
}

function ruleIds(report) {
  return report.findings.map(f => f.ruleId + ':' + f.severity + ':' + f.qname).sort();
}

test('a clean project scores 100 with grade A', () => {
  const audit = loadAudit();
  const report = audit.buildReport(emptyModel({ requestables: [seq('business', 'Hidden', true), seq('helper', 'Private', false)] }), { minSeverity: 'info' });
  assert.equal(report.score, 100);
  assert.equal(report.grade, 'A');
  same(report.findings, []);
});

test('exposure rules follow the engine semantics of Public, Hidden, Private and URL mappings', () => {
  const audit = loadAudit();
  const model = emptyModel({
    requestables: [
      seq('open', 'Public', false),
      seq('hiddenAnon', 'Hidden', false),
      seq('hiddenAuth', 'Hidden', true),
      seq('mappedPrivate', 'Private', false),
      seq('helper', 'Private', false),
      { qname: 'P.db.select', kind: 'transaction', accessibility: 'Public', authenticatedContextRequired: false, calls: [] }
    ],
    mappings: [{ qname: 'P.UrlMapper.m.Get', path: '/x', method: 'GET', target: 'P.mappedPrivate' }]
  });
  const ids = ruleIds(audit.buildReport(model, { minSeverity: 'info' }));
  assert.ok(ids.includes('EXP-01:high:P.open'));
  const withFrontend = audit.buildReport(emptyModel({
    requestables: [seq('open', 'Public', false)],
    frontend: { present: true, scanned: true, sources: 1, signals: [], calls: [{ file: 'f.yaml', target: 'P.open' }] }
  }), {});
  const fe03 = withFrontend.rules.find(r => r.ruleId === 'FE-03');
  assert.equal(fe03.status, 'info');
  assert.equal(fe03.deduction, 0);
  assert.equal(withFrontend.summary.rules.info, 1);
  assert.ok(ids.includes('EXP-02:high:P.hiddenAnon'));
  assert.ok(ids.includes('EXP-03:critical:P.mappedPrivate'));
  assert.ok(ids.includes('EXP-04:medium:P.db.select'));
  assert.ok(!ids.some(id => id.endsWith(':P.hiddenAuth') || id.endsWith(':P.helper')));
});

test('anonymous reachability propagates through internal calls and escalates dangerous steps', () => {
  const audit = loadAudit();
  const model = emptyModel({
    requestables: [
      seq('entry', 'Hidden', false, { calls: ['P.worker'] }),
      seq('worker', 'Private', false),
      seq('guarded', 'Hidden', true, { calls: ['P.adminWorker'] }),
      seq('adminWorker', 'Private', false)
    ],
    steps: [
      { qname: 'P.worker.exec', owner: 'P.worker', kind: 'processExec', dynamic: true },
      { qname: 'P.adminWorker.exec', owner: 'P.adminWorker', kind: 'processExec', dynamic: false }
    ]
  });
  const report = audit.buildReport(model, { minSeverity: 'info' });
  const byQName = Object.fromEntries(report.findings.filter(f => f.ruleId === 'CAP-01').map(f => [f.qname, f]));
  assert.equal(byQName['P.worker.exec'].severity, 'critical');
  assert.equal(byQName['P.worker.exec'].anonymousReachable, true);
  assert.equal(byQName['P.adminWorker.exec'].severity, 'high');
  assert.equal(report.score, 55, 'one rule deducts 25+10, the Hidden entry deducts 10');
  assert.equal(report.grade, 'D');
  assert.equal(report.gradeCappedBy, '', 'the grade is already D without the critical cap');
});

test('login without prior verification is critical; a verification step before it clears the finding', () => {
  const audit = loadAudit();
  const model = emptyModel({
    requestables: [seq('auth_login', 'Hidden', false), seq('real_login', 'Hidden', false)],
    steps: [
      { qname: 'P.auth_login.SetAuthenticatedUser', owner: 'P.auth_login', kind: 'setAuthenticatedUser' },
      { qname: 'P.real_login.CheckPassword', owner: 'P.real_login', kind: 'call', target: 'P.db.check' },
      { qname: 'P.real_login.SetAuthenticatedUser', owner: 'P.real_login', kind: 'setAuthenticatedUser' }
    ]
  });
  const auth = audit.buildReport(model, { minSeverity: 'info' }).findings.filter(f => f.ruleId === 'AUTH-01');
  same(auth.map(f => f.qname + ':' + f.severity), ['P.auth_login.SetAuthenticatedUser:critical']);
});

test('secret, injection, transport, session and supply-chain rules fire on minimal cases', () => {
  const audit = loadAudit();
  const model = emptyModel({
    project: { name: 'P', version: '1', corsOrigin: '=Origin', httpSessionTimeout: 86400, contextTimeout: 300 },
    requestables: [
      seq('auth', 'Hidden', true),
      { qname: 'P.db.search', kind: 'transaction', accessibility: 'Private', authenticatedContextRequired: false, calls: [], rawSqlPlaceholders: ['filter'] }
    ],
    secretProperties: [
      { qname: 'P.db', objectClass: 'SqlConnector', property: 'jdbcUserPassword', status: 'literal' },
      { qname: 'P.api', objectClass: 'HttpConnector', property: 'authPassword', status: 'symbol' }
    ],
    variables: [
      { qname: 'P.auth.apiKey', name: 'apiKey', scope: 'requestable', valueStatus: 'literal', logsMasked: false },
      { qname: 'P.auth.tokenId', name: 'tokenId', scope: 'requestable', valueStatus: 'literal', logsMasked: false }
    ],
    staticAuthHeaders: [{ qname: 'P.api.call', header: 'Authorization' }],
    symbols: [{ name: 'db.password', inlineDefault: true, files: ['c8oProject.yaml'] }, { name: 'api.token.secret', inlineDefault: false, files: [] }],
    connectors: [{ qname: 'P.api', type: 'http', https: false, server: 'api.example.com', trustAllServerCertificates: true }],
    references: [{ qname: 'P.ref', projectName: 'lib_X', autoPull: true, branch: 'master', pinned: false, insecureTransport: false, embeddedCredentials: false }]
  });
  const ids = ruleIds(audit.buildReport(model, { minSeverity: 'info' }));
  for (const expected of [
    'SEC-01:high:P.db', 'SEC-03:high:P.auth.apiKey', 'SEC-04:medium:P.auth.apiKey', 'SEC-05:medium:P.api.call',
    'SEC-02:high:db.password', 'SEC-06:low:db.password', 'INJ-01:high:P.db.search', 'NET-01:high:P.api',
    'NET-02:medium:P.api', 'NET-03:high:P', 'SES-01:low:P', 'SUP-01:medium:P.ref'
  ]) {
    assert.ok(ids.includes(expected), expected + ' missing from ' + ids.join(', '));
  }
  assert.ok(!ids.some(id => id.includes('P.auth.tokenId')), 'identifier-like names are not secrets');
  assert.ok(!ids.some(id => id.includes('api.token.secret') || id.endsWith(':P.api') && id.startsWith('SEC-01')));
});

test('per-rule caps bound the deduction and the score is deterministic', () => {
  const audit = loadAudit();
  const many = [];
  for (let i = 0; i < 40; i++) {
    many.push(seq('hidden' + i, 'Hidden', false));
  }
  const model = emptyModel({ requestables: many });
  const first = audit.buildReport(model, { minSeverity: 'info', limit: 5 });
  const second = audit.buildReport(model, { minSeverity: 'info', limit: 5 });
  assert.equal(first.score, 80, '40 high findings of one rule deduct the high cap only');
  assert.equal(first.grade, 'B');
  assert.equal(first.summary.high, 40);
  assert.equal(first.findings.length, 5);
  assert.equal(first.coverage.truncated, true);
  same(first.findings, JSON.parse(JSON.stringify(second.findings)));
});

test('suppressed findings stay listed but no longer lower the score or cap the grade', () => {
  const audit = loadAudit();
  const model = emptyModel({
    requestables: [seq('endpoint', 'Private', false)],
    mappings: [{ qname: 'P.m', path: '/api', method: 'POST', target: 'P.endpoint' }]
  });
  const before = audit.buildReport(model, {});
  assert.equal(before.score, 75);
  assert.equal(before.grade, 'D', 'a critical finding caps a B at D');
  assert.equal(before.gradeCappedBy, 'critical-finding');
  const after = audit.buildReport(model, { suppress: [{ ruleId: 'EXP-03', qname: 'P.endpoint', reason: 'bearer checked in JS' }] });
  assert.equal(after.score, 100);
  assert.equal(after.grade, 'A');
  assert.equal(after.summary.suppressed, 1);
  assert.equal(after.findings[0].suppressed, true);
  assert.equal(after.findings[0].suppressionReason, 'bearer checked in JS');
});

test('minSeverity filters the listed findings but the score counts all of them', () => {
  const audit = loadAudit();
  const model = emptyModel({ project: { name: 'P', version: '1', corsOrigin: 'https://a', httpSessionTimeout: 7200, contextTimeout: 300 }, requestables: [seq('open', 'Public', false)] });
  const report = audit.buildReport(model, { minSeverity: 'high' });
  same(report.findings.map(f => f.ruleId), ['EXP-01']);
  assert.equal(report.score, 89);
});

test('engine findings are scored separately and CORS =Global resolves through the engine policy', () => {
  const audit = loadAudit();
  const engine = { available: true, studioMode: true, corsPolicy: '=Origin', xsrfApi: false, cryptoPassphraseDefault: true, adminPasswordDefault: true };
  const model = emptyModel({ project: { name: 'P', version: '1', corsOrigin: '=Global', httpSessionTimeout: 1800, contextTimeout: 300 }, engine });
  const report = audit.buildReport(model, { minSeverity: 'info' });
  same(report.findings.map(f => f.ruleId + ':' + f.severity), ['NET-03:medium']);
  assert.equal(report.findings[0].evidence.effectivePolicy, '=Origin');
  same(report.engine.findings.map(f => f.ruleId), ['ENG-01', 'ENG-02', 'ENG-03']);
  assert.equal(report.engine.grade, 'D');
  assert.equal(audit.buildReport(model, { includeEngine: false }).engine, undefined);
});

test('rules lists every project rule once, and its deductions add up to the score', () => {
  const audit = loadAudit();
  const engine = { available: true, studioMode: false, corsPolicy: '=Origin', xsrfApi: true, cryptoPassphraseDefault: false, adminPasswordDefault: true };
  const model = emptyModel({
    engine,
    requestables: [seq('a', 'Hidden', false), seq('b', 'Hidden', false), seq('c', 'Hidden', false), seq('endpoint', 'Private', false)],
    mappings: [{ qname: 'P.m', path: '/api', method: 'POST', target: 'P.endpoint' }],
    frontend: { present: true, scanned: false, sources: 0, signals: [], calls: [] }
  });
  const report = audit.buildReport(model, { minSeverity: 'critical', limit: 1, suppress: [{ ruleId: 'EXP-03', reason: 'checked in JS' }] });
  const projectRuleIds = Object.keys(audit.RULES).filter(id => audit.RULES[id].category !== 'engine');
  same(report.rules.map(r => r.ruleId), projectRuleIds);
  const byId = Object.fromEntries(report.rules.map(r => [r.ruleId, r]));
  same(byId['EXP-02'], {
    ruleId: 'EXP-02', category: 'exposure', title: audit.RULES['EXP-02'].title, status: 'failed',
    findings: 3, suppressed: 0, maxSeverity: 'high', deduction: 20, cap: 20,
    recommendation: audit.RULES['EXP-02'].recommendation
  });
  assert.equal(byId['EXP-03'].status, 'suppressed');
  assert.equal(byId['EXP-03'].deduction, 0);
  assert.equal(byId['EXP-01'].status, 'passed');
  assert.equal(byId['EXP-01'].recommendation, undefined);
  assert.equal(byId['EXP-04'].status, 'notApplicable');
  assert.equal(byId['EXP-04'].reason, 'No transaction in the project.');
  assert.equal(byId['FE-01'].reason, 'Frontend scan disabled (includeFrontend=false).');
  const total = report.rules.reduce((sum, r) => sum + r.deduction, 0);
  assert.equal(report.score, 100 - total, 'the listed deductions explain the score');
  same(report.summary.rules, {
    passed: report.rules.filter(r => r.status === 'passed').length,
    failed: 1, info: 0, suppressed: 1,
    notApplicable: report.rules.filter(r => r.status === 'notApplicable').length
  });
  same(report.engine.rules.map(r => r.ruleId + ':' + r.status), ['ENG-01:failed', 'ENG-02:passed', 'ENG-03:passed']);
});

test('source scanners detect raw SQL, JS signals, symbols and frontend patterns', () => {
  const audit = loadAudit();
  same(audit.rawSqlPlaceholders("SELECT * FROM t WHERE a={a} AND b LIKE '{{b}}' OR c={{ c }}"), ['b', 'c']);
  assert.equal(audit.isLiteralJsString('"/tmp/out.txt"'), true);
  assert.equal(audit.isLiteralJsString('"/tmp/" + name'), false);
  assert.equal(audit.isLiteralJsString('path'), false);
  const signals = audit.scanJsSignals('var r = java.lang.Runtime.getRuntime(); eval(input); FileUtils.writeStringToFile(f, s);');
  assert.equal(signals.dynamicCode, true);
  same(signals.privileged, ['java.lang.Runtime', 'FileUtils write/delete']);
  assert.equal(audit.scanJsSignals('context.evaluate(x); retrieval(y)').dynamicCode, false);
  const symbols = {};
  audit.scanSymbols('a: ${db.password=' + SENTINEL + '}\nb: ${db.url}\nc: ${empty=}', 'c8oProject.yaml', symbols);
  assert.equal(symbols['db.password'].inlineDefault, true);
  assert.equal(symbols['db.url'].inlineDefault, false);
  assert.equal(symbols.empty.inlineDefault, false);
  assert.ok(!JSON.stringify(symbols).includes(SENTINEL));
  const frontend = { signals: [], calls: [] };
  audit.scanFrontendSource([
    "x: this.sanitizer.bypassSecurityTrustHtml(v); el.innerHTML = v; if (a.innerHTML == b) {}",
    "localStorage.setItem('authToken', t); localStorage.setItem('theme', t);",
    "beanData: '{\"ionBean\":\"CallSequenceAction\",\"requestable\":\"plain:P.open\"}'"
  ].join('\n'), '_c8oProject/mobilePages/Home.yaml', frontend);
  const byKind = Object.fromEntries(frontend.signals.map(s => [s.kind, s]));
  assert.equal(byKind.sanitizer.count, 2);
  assert.equal(byKind.localStorageSecret.count, 1);
  same(frontend.calls, [{ file: '_c8oProject/mobilePages/Home.yaml', target: 'P.open' }]);
});

test('the collector never lets secret values reach the model or the report', () => {
  function javaList(items) { return { size: () => items.length, get: i => items[i] }; }
  function dbo(className, name, parent, methods) {
    const self = Object.assign({
      getClass: () => ({ getSimpleName: () => className, getName: () => 'com.twinsoft.convertigo.beans.' + className }),
      getName: () => name,
      getQName: () => (parent ? parent.getQName() + '.' : '') + name,
      getParent: () => parent,
      children: [],
      getDatabaseObjectChildren: () => javaList(self.children),
      isCipheredProperty: () => false,
      getCompilablePropertySourceValue: () => null
    }, methods || {});
    if (parent) parent.children.push(self);
    return self;
  }
  const project = dbo('Project', 'P', null, {
    getVersion: () => '1', getCorsOrigin: () => '=Origin', getHttpSessionTimeout: () => 1800, getContextTimeout: () => 300,
    getMobileApplication: () => null, getUrlMapper: () => null, getReferenceList: () => javaList([])
  });
  const connector = dbo('SqlConnector', 'db', project, {
    getJdbcURL: () => 'jdbc:hsqldb:mem:x', getJdbcUserPassword: () => SENTINEL,
    isCipheredProperty: name => name === 'jdbcUserPassword', getTransactionsList: () => javaList([tx])
  });
  const tx = dbo('SqlTransaction', 'select', connector, {
    getAccessibility: () => 'Private', getAuthenticatedContextRequired: () => false, getSqlQuery: () => 'SELECT ' + SENTINEL
  });
  const sequence = dbo('GenericSequence', 'login', project, { getAccessibility: () => 'Hidden', getAuthenticatedContextRequired: () => false });
  dbo('RequestableVariable', 'password', sequence, { getValueOrNull: () => SENTINEL, getVisibility: () => 0 });
  dbo('SmtpStep', 'mail', sequence, {
    getSmtpRecipients: () => 'recipient', getSmtpPassword: () => SENTINEL, isEnabled: () => true,
    isCipheredProperty: name => name === 'smtpPassword'
  });
  project.getSequencesList = () => javaList([sequence]);
  project.getConnectorsList = () => javaList([connector]);
  const descriptors = cls => {
    const names = cls === 'SqlConnector' ? ['jdbcURL', 'jdbcUserPassword'] : cls === 'SmtpStep' ? ['smtpRecipients', 'smtpPassword'] : [];
    return names.map(n => ({ getName: () => n, getReadMethod: () => ({ invoke: target => target['get' + n[0].toUpperCase() + n.slice(1)]() }) }));
  };
  const Packages = {
    com: { twinsoft: { convertigo: { engine: {
      util: { CachedIntrospector: { getBeanInfo: klass => ({ getPropertyDescriptors: () => descriptors(klass.getSimpleName()) }) } },
      enums: { Visibility: { Logs: { isMasked: v => (v & 1) !== 0 } } },
      Engine: { projectDir: () => '/nonexistent/P' }
    } } } },
    java: { io: { File: function (p) { this.exists = () => false; this.getAbsolutePath = () => String(p); } } },
    org: { apache: { commons: { io: { FileUtils: {} } } } }
  };
  const context = { include() {}, Packages, C8O: {} };
  vm.runInNewContext(read('js/security_audit_rules.js'), context);
  vm.runInNewContext(read('js/security_audit_collect.js'), context);
  context.C8O.util = { toTrimmedString: v => (v == null ? '' : String(v).trim()) };
  context.C8O.dbo = {
    resolve: () => project,
    safeQName: d => d.getQName(),
    safeName: d => d.getName(),
    getDirectChildren: d => d.children.slice()
  };
  const model = context.C8O.securityAudit.collect('P', { includeEngine: false, includeFrontend: true });
  const report = context.C8O.securityAudit.buildReport(model, { minSeverity: 'info' });
  const serialized = JSON.stringify(model) + JSON.stringify(report);
  assert.ok(!serialized.includes(SENTINEL), 'a secret value leaked into the audit output');
  const ids = ruleIds(report);
  assert.ok(ids.includes('SEC-01:high:P.db'), ids.join(', '));
  assert.ok(ids.includes('SEC-01:high:P.login.mail'), ids.join(', '));
  assert.ok(ids.includes('SEC-03:high:P.login.password'), ids.join(', '));
  assert.ok(ids.includes('CAP-04:medium:P.login.mail'), ids.join(', '));
});

test('project-security-audit routes to its sequence and is refused to NoCode callers', () => {
  const routerSource = read('js/mcp_endpoint_router.js');
  const start = routerSource.indexOf('  var toolNameRaw = paramsObject');
  const end = routerSource.indexOf('  if (mappingError) {', start);
  assert.ok(start > 0 && end > start, 'tools/call decision must be found');
  const decision = routerSource.slice(start, end);
  function route(kind, header) {
    const context = {
      context: { httpServletRequest: { getHeader: () => header } },
      C8O: { guidance: { warningForToolCall: () => '', stripToolArguments: args => args } }
    };
    vm.runInNewContext(read('js/nocode_tool_policy.js'), context);
    context.paramsObject = { name: 'project-security-audit', arguments: { project: 'P' } };
    context.mcpAuthentication = { kind };
    vm.runInNewContext(decision, context);
    return context;
  }
  const studio = route('managed', null);
  assert.equal(studio.mappingError, null);
  assert.equal(studio.targetSequence, 'tools_project_security_audit');
  assert.equal(route('nocode', 'nocode').mappingError.status, '403');
  assert.equal(route('managed', 'nocode').mappingError.status, '403');
});

test('the sequence, schema override and guides stay wired to the tool', () => {
  const sequence = read('_c8oProject/sequences/tools_project_security_audit.yaml');
  assert.match(sequence, /^accessibility: Private$/m);
  for (const variable of ['project', 'includeEngine', 'includeFrontend', 'minSeverity', 'limit', 'suppress']) {
    assert.match(sequence, new RegExp('↓' + variable + ' \\[variables\\.RequestableVariable'), variable);
  }
  assert.match(read('c8oProject.yaml'), /↓tools_project_security_audit \[sequences\.GenericSequence\]/);
  const overrides = read('js/schema_overrides.js');
  assert.match(overrides, /seq === "tools_project_security_audit"\) \{\n\s+return projectSecurityAuditInputSchema\(\);/);
  assert.match(overrides, /seq === "tools_project_security_audit"\) \{\n\s+return projectSecurityAuditOutputSchema\(\);/);
  const review = JSON.parse(read('resources/resources_index.json')).find(entry => entry.guideId === 'convertigo/project-review');
  assert.ok(review.recommendedTools.includes('project-security-audit'));
  assert.match(read('js/setup_vibe.js'), /"Convertigo_project-security-audit"/);
});
