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

test('revealChange: an engine that has it is told what changed; an older engine keeps reveal', () => {
  const calls = [];
  const engine = {
    reveal: q => { calls.push(['reveal', q]); return JSON.stringify({ status: 'published', id: q, listening: true }); },
    revealChange: (q, d) => { calls.push(['revealChange', q, JSON.parse(d)]); return JSON.stringify({ status: 'published', id: q, listening: true }); }
  };
  const dbo = treeReveal({ studioMode: false, StudioReveal: engine });
  const touched = ['App.pg:Stats', 'App.pg:Stats', 'App.sq:stats'].concat(Array.from({ length: 60 }, (_, i) => 'App.sq:s' + i));
  const r = dbo.revealStudioTreeByQName('App.sq:stats', [], { change: 'renamed', previous: 'App.sq:deal_stats', tool: 'databaseobject-rename', summary: 'Renamed deal_stats to stats', touched });
  assert.equal(r.status, 'revealed');
  assert.equal(r.change, 'renamed');
  assert.equal(calls[0][0], 'revealChange');
  const sent = calls[0][2];
  assert.equal(sent.previous, 'App.sq:deal_stats');
  assert.equal(sent.tool, 'databaseobject-rename');
  assert.equal(sent.touched[0], 'App.pg:Stats', 'unique, without the revealed object');
  assert.equal(sent.touched.length, 50, 'at most 50');
  assert.ok(!sent.touched.includes('App.sq:stats'));

  calls.length = 0;
  dbo.revealStudioTreeByQName('App.sq:x', [], { change: 'exploded', previous: 'App.sq:x' });
  assert.deepEqual(calls, [['reveal', 'App.sq:x']], 'nothing usable: the plain reveal');
  calls.length = 0;
  dbo.revealStudioTreeByQName('App.sq:x', []);
  assert.deepEqual(calls, [['reveal', 'App.sq:x']], 'no details: the plain reveal');

  const older = treeReveal({ studioMode: false, StudioReveal: { reveal: q => { calls.push(['older', q]); return JSON.stringify({ status: 'published', id: q }); } } });
  calls.length = 0;
  const o = older.revealStudioTreeByQName('App.sq:x', [], { change: 'created', tool: 'x' });
  assert.deepEqual(calls, [['older', 'App.sq:x']], 'an engine without revealChange');
  assert.equal(o.status, 'revealed');
  assert.equal(o.change, undefined);
});

test('the building tools say what they did: created, renamed, moved, deleted, with the QName before and the other objects', () => {
  const router = read('js/mcp_endpoint_router.js');
  const code = router.match(/\/\/ In reveal mode \(the Reveal of the Assistant\)[\s\S]*?\nfunction revealAfterToolCall\(sequenceName, toolResult\) \{\n[\s\S]*?\n\}\n/)[0];
  const run = (sequence, result) => {
    const sent = [];
    const box = { managedRevealMode: true, include: () => {}, C8O: { dbo: { revealStudioTreeByQName: (q, errors, details) => { sent.push({ q, details }); return { status: 'revealed' }; } } } };
    vm.runInNewContext(code + '\nrevealAfterToolCall(' + JSON.stringify(sequence) + ', ' + JSON.stringify(result) + ');', box);
    return JSON.parse(JSON.stringify(sent[0]));
  };
  const page = run('tools_ngx_page_create', { status: 'ok', page: 'Shop.Application.NgxApp.Orders',
    created: ['Shop.Application.NgxApp.sty:AppLayout', 'Shop.Application.NgxApp.pg:Orders'] });
  assert.equal(page.q, 'Shop.Application.NgxApp.pg:Orders');
  assert.deepEqual(page.details, { change: 'created', summary: 'Created the page Orders', touched: ['Shop.Application.NgxApp.sty:AppLayout', 'Shop.Application.NgxApp.pg:Orders'], tool: 'ngx-page-create' });
  const renamed = run('tools_databaseobject_rename', { renamed: true, qname: 'Shop.sq:deal_stats', newQName: 'Shop.sq:stats', oldName: 'deal_stats', newName: 'stats' });
  assert.deepEqual(renamed.details, { change: 'renamed', previous: 'Shop.sq:deal_stats', summary: 'Renamed deal_stats to stats', tool: 'databaseobject-rename' });
  const moved = run('tools_databaseobject_move', { moved: true, name: 'y', qname: 'Shop.sq:b.st:y', fromParent: 'Shop.sq:a', toParent: 'Shop.sq:b' });
  assert.equal(moved.details.change, 'moved');
  assert.equal(moved.details.previous, 'Shop.sq:a.st:y');
  const deleted = run('tools_databaseobject_delete', { removed: true, name: 'Attr_label', qname: 'Shop.Application.NgxApp.pg:Stats.at:Attr_label', parentQName: 'Shop.Application.NgxApp.pg:Stats' });
  assert.equal(deleted.q, 'Shop.Application.NgxApp.pg:Stats');
  assert.deepEqual(deleted.details, { change: 'deleted', previous: 'Shop.Application.NgxApp.pg:Stats.at:Attr_label', summary: 'Deleted Attr_label', tool: 'databaseobject-delete' });
  const sql = run('tools_sql_transaction_create', { status: 'ok', transactions: [{ qname: 'Shop.cn:db.tr:a' }, { qname: 'Shop.cn:db.tr:b' }] });
  assert.deepEqual(sql.details.touched, ['Shop.cn:db.tr:a', 'Shop.cn:db.tr:b']);
  assert.equal(sql.details.summary, 'Created 2 transactions');
});

test('tree-apply and batch-call light every object they touched, not only the last one', () => {
  const tree = read('js/tools_databaseobject_tree_apply.js');
  const fn = tree.match(/\nfunction treeApplyRevealDetails\(result, qname\) \{\n[\s\S]*?\n\}\n/)[0];
  const details = (result, q) => JSON.parse(JSON.stringify(vm.runInNewContext(fn + 'treeApplyRevealDetails(' + JSON.stringify(result) + ', ' + JSON.stringify(q) + ');',
    { asTrimmed: v => String(v == null ? '' : v).trim() })));
  assert.deepEqual(details({ operations: [{ createdQName: 'A.pg:P.Content.Subtitle' }], touchedQNames: ['A.pg:P', 'A.pg:P.Content.Subtitle'] }, 'A.pg:P.Content.Subtitle'),
    { change: 'created', tool: 'databaseobject-tree-apply', summary: 'Created Subtitle (2 objects)', touched: ['A.pg:P', 'A.pg:P.Content.Subtitle'] });
  assert.equal(details({ operations: [{ qname: 'A.sq:s' }], touchedQNames: ['A.sq:s'] }, 'A.sq:s').change, 'changed');
  assert.match(tree, /details: treeApplyRevealDetails\(treeApplyResult, treeApplyRevealTarget\)/);
  assert.match(read('js/tools_batch_call.js'), /revealStudioTreeByQName\(\n\s+batchRevealTarget,\n\s+mutationFinalize\.errors,\n\s+\{\n\s+change: "changed",\n\s+tool: "batch-call",[\s\S]{0,200}touched: mutationTouchedQNames/);
  assert.match(read('js/ui_reveal.js'), /revealStudioTreeByQName\(target, options && options\.errors, options && options\.details\)/);
});
