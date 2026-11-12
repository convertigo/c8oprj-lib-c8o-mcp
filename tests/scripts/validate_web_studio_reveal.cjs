// The web / Electron Studio follows the agent through its engine (StudioReveal, Convertigo 8.5): a reveal of a database
// object or of the application is published to its web Studios. The Eclipse Studio keeps its own path; an engine
// without StudioReveal keeps "skipped". node --test tests/scripts/validate_web_studio_reveal.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function treeReveal({ studioMode, StudioReveal, found = null }) {
  const source = read('js/databaseobject_studio.js');
  const code = source.match(/\/\/ The web \/ Electron Studio follows the agent[\s\S]*?\nC8O\.dbo\.revealStudioTreeByQName = function[\s\S]*?\n};\n/)[0];
  const box = {
    C8O: { dbo: {}, util: { toTrimmedString: v => String(v).trim() } },
    java: { lang: { System: { currentTimeMillis: () => 1 } } },
    Packages: { com: { twinsoft: { convertigo: { engine: {
      Engine: { isStudioMode: () => studioMode, theApp: { databaseObjectsManager: { getDatabaseObjectByQName: () => found } } },
      studio: { StudioReveal: StudioReveal || {} }
    } } } } }
  };
  vm.runInNewContext(code, box);
  return box.C8O.dbo;
}

test('a database object reveal: the web Studio of the engine, skipped without StudioReveal, never on Eclipse', () => {
  const errors = [];
  const skipped = treeReveal({ studioMode: false }).revealStudioTreeByQName('App.seq', errors);
  assert.equal(skipped.status, 'skipped', 'an engine without StudioReveal');
  assert.equal(skipped.message, 'Reveal skipped: Convertigo Studio required');

  const calls = [];
  const published = { reveal: q => { calls.push(q); return JSON.stringify({ status: 'published', id: 'App.sequences.seq', kind: 'sequence', listening: true }); } };
  const revealed = treeReveal({ studioMode: false, StudioReveal: published }).revealStudioTreeByQName('App.seq', errors);
  assert.deepEqual(calls, ['App.seq']);
  assert.equal(revealed.status, 'revealed');
  assert.equal(revealed.executed, true);
  assert.equal(revealed.targetQName, 'App.sequences.seq');
  assert.equal(revealed.channel, 'web-studio');
  assert.equal(revealed.listening, true);

  const notFound = treeReveal({ studioMode: false, StudioReveal: { reveal: () => JSON.stringify({ status: 'not_found', message: 'Not loaded: App.x' }) } })
    .revealStudioTreeByQName('App.x', errors);
  assert.equal(notFound.status, 'error');
  assert.deepEqual(errors.map(e => ({ ...e })), [{ name: '__studioReveal__', message: 'Not loaded: App.x' }]);

  const off = treeReveal({ studioMode: false, StudioReveal: { reveal: () => JSON.stringify({ status: 'unavailable' }) } }).revealStudioTreeByQName('App.seq', []);
  assert.equal(off.status, 'skipped', 'an engine whose web Studio is off');

  const eclipseCalls = [];
  treeReveal({ studioMode: true, StudioReveal: { reveal: q => { eclipseCalls.push(q); return '{}'; } } }).revealStudioTreeByQName('App.seq', []);
  assert.deepEqual(eclipseCalls, [], 'the Eclipse Studio keeps its own path');
});

test('mobile-builder-open with reveal: the web Studio shows the application, reported as revealed', () => {
  const source = read('js/tools_mobile_builder_open.js');
  const fn = source.match(/\n  function revealWebStudioApplication\(projectName\) \{\n[\s\S]*?\n  \}\n/)[0];
  const run = StudioReveal => {
    const box = { trim: v => String(v ?? '').trim(), Packages: { com: { twinsoft: { convertigo: { engine: { studio: { StudioReveal: StudioReveal || {} } } } } } } };
    const r = vm.runInNewContext(fn + 'revealWebStudioApplication("CRM");', box);
    return r === null ? null : { ...r };
  };
  assert.equal(run(), null, 'an engine without StudioReveal');
  assert.deepEqual(run({ revealApplication: p => JSON.stringify({ status: 'published', id: p + '.MobileApplication.Application', listening: true, message: 'ok' }) }),
    { status: 'published', message: 'ok', id: 'CRM.MobileApplication.Application', listening: true });
  assert.equal(run({ revealApplication: () => { throw new Error('boom'); } }).status, 'error');
  // only in the web Studio, with reveal
  assert.match(source, /var webStudioReveal = webStudio && revealValue === true \? revealWebStudioApplication\(projectName\) : null;/);
  assert.match(source, /webStudioReveal: webStudioReveal,/);
  assert.match(read('js/schema_overrides.js'), /webStudioReveal: nullableSchema\(closedObjectSchema\(\{\n\s+status: \{ type: "string"/);

  const ui = { C8O: {} };
  vm.runInNewContext(read('js/ui_reveal.js'), ui);
  const reveal = result => ({ ...ui.C8O.uiReveal.mobileBuilder('CRM', result, { reveal: true }) });
  const shown = reveal({ studioMode: false, webStudioReveal: { status: 'published', listening: true } });
  assert.equal(shown.status, 'revealed');
  assert.equal(shown.webStudio, true);
  assert.equal(shown.editorOpened, false);
  assert.equal(reveal({ studioMode: false, webStudioReveal: { status: 'not_found', message: 'CRM has no NGX application' } }).status, 'error');
  assert.equal(reveal({ studioMode: false, webStudioReveal: null }).status, 'skipped', 'an engine without StudioReveal, as before');
  assert.equal(reveal({ studioMode: true, editorOpened: true }).status, 'revealed', 'the Eclipse editor');
});

test('in reveal mode, the building tools show what they created or changed (one QName per tool, from its answer)', () => {
  const router = read('js/mcp_endpoint_router.js');
  const code = router.match(/\/\/ In reveal mode \(the Reveal of the Assistant\)[\s\S]*?\nfunction revealAfterToolCall\(sequenceName, toolResult\) \{\n[\s\S]*?\n\}\n/)[0];
  const run = (sequence, result, revealMode = true) => {
    const revealed = [];
    const box = { managedRevealMode: revealMode, include: () => {}, C8O: { dbo: { revealStudioTreeByQName: (q, errors) => { revealed.push(q); return { status: 'revealed' }; } } } };
    vm.runInNewContext(code + '\nthis.out = revealAfterToolCall(' + JSON.stringify(sequence) + ', ' + JSON.stringify(result) + ');', box);
    return revealed;
  };
  assert.deepEqual(run('tools_ngx_page_create', { status: 'ok', page: 'Shop.Application.NgxApp.Orders',
    created: ['Shop.Application.NgxApp.sty:AppLayout', 'Shop.Application.NgxApp.pg:Orders', 'Shop.Application.NgxApp.sty:AppTheme'] }), ['Shop.Application.NgxApp.pg:Orders']);
  assert.deepEqual(run('tools_ngx_page_create', { status: 'ok', page: 'Shop.Application.NgxApp.Orders', created: 'Shop.Application.NgxApp.sty:AppTheme' }), ['Shop.Application.NgxApp.Orders'], 'a single created entry, no page in it');
  assert.deepEqual(run('tools_business_sequence_create', { status: 'ok', sequence: 'Shop.orders_list', qname: 'Shop.sq:orders_list' }), ['Shop.sq:orders_list']);
  assert.deepEqual(run('tools_sql_transaction_create', { status: 'ok', transactions: [{ qname: 'Shop.cn:db.tr:a' }, { qname: 'Shop.cn:db.tr:b' }] }), ['Shop.cn:db.tr:b']);
  assert.deepEqual(run('tools_upsert_crud', { status: 'ok', primaryTargets: { sql: 'Shop.cn:appdb', flow: ['Shop.sq:auth_login', 'Shop.sq:crm_list'] } }), ['Shop.sq:crm_list']);
  assert.deepEqual(run('tools_upsert_ngx_crud_kit', { status: 'ok', pageTargets: ['Shop.Application.NgxApp.Home.Content', 'Shop.Application.NgxApp.Login.Content'] }), ['Shop.Application.NgxApp.Home']);
  assert.deepEqual(run('tools_databaseobject_rename', { renamed: true, newQName: 'Shop.sq:orders2' }), ['Shop.sq:orders2']);
  assert.deepEqual(run('tools_databaseobject_rename', { renamed: false, newQName: 'Shop.sq:orders' }), [], 'a failed rename');
  assert.deepEqual(run('tools_databaseobject_move', { moved: true, qname: 'Shop.sq:x.st:y' }), ['Shop.sq:x.st:y']);
  assert.deepEqual(run('tools_databaseobject_delete', { removed: true, parentQName: 'Shop.sq:orders_list' }), ['Shop.sq:orders_list']);
  assert.deepEqual(run('tools_ngx_theme_apply', { status: 'ok', style: 'AppTheme updated' }), [], 'no QName in its answer');
  assert.deepEqual(run('tools_ngx_page_create', { status: 'error', page: 'Shop.Application.NgxApp.Orders' }), [], 'a failed call');
  assert.deepEqual(run('tools_ngx_page_create', { status: 'ok', page: 'Shop.Application.NgxApp.Orders' }, false), [], 'reveal mode off');
  assert.deepEqual(run('tools_project_lint', { status: 'ok', qname: 'Shop.sq:x' }), [], 'a tool that builds nothing');
  // after the call, in the success path of the endpoint
  assert.match(read('_c8oProject/sequences/mcp_endpoint.yaml'), /↓RevealAfterCall \[steps\.SimpleStep-1794600000001\]: \n\s+comment: [^\n]+\n\s+expression: revealAfterToolCall\(callSequence, result\);/);
});
