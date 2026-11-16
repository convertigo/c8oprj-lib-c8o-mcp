// project-brief and project-notes-write (js/project_brief.js): what an agent needs before it changes an existing project,
// in one call, and the notes the next turns start from. On SalesPipeline (16/11) a one-column change took 15 min with 8 s
// of editing and 6.2 min of exploring; a KPI restyle read for 8.4 min looking for where `.app-kpi` was defined.
// node --test tests/scripts/validate_project_brief.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const same = (actual, expected) => assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), expected);

function load() {
  const context = { C8O: {} };
  vm.createContext(context);
  vm.runInContext(read('js/project_brief.js'), context, { filename: 'project_brief.js' });
  return context.C8O.projectBrief;
}

const LAYOUT = [
  '/* app-locale: en-US */',
  '.app-page { max-width: 1120px; margin: 0 auto; }',
  '.app-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }',
  '.app-kpi { --app-accent: var(--ion-color-primary); border-radius: var(--app-radius-lg, 12px); }',
  '.app-kpi .label::before { content: "it\'s"; }',
  '.app-accent-success { --app-accent: var(--ion-color-success); --app-accent-rgb: var(--ion-color-success-rgb); }',
  '.app-page-form .app-form, .app-page-form .app-title { max-width: 720px; }',
  '.app-page-form .app-form, .app-page-form .app-title { max-width: 720px; }',
  '@media (min-width: 768px) { .app-table-head { display: block; } .app-cols-3 { grid-template-columns: 2fr 1fr 1fr; } .app-cols-4 { grid-template-columns: 2fr 1fr 1fr 1fr; } }',
  'ion-item.ion-color { --x: 1; } .ios .md { color: red; }'
].join('\n');

test('the CSS of an app style: rules, media queries, strings, and a stray quote that hides nothing', () => {
  const brief = load();
  const rules = brief.parseCss(LAYOUT);
  const cols4 = rules.find((r) => r.selector === '.app-cols-4');
  same(cols4, { selector: '.app-cols-4', declarations: 'grid-template-columns: 2fr 1fr 1fr 1fr;', media: '@media (min-width: 768px)' });
  assert.ok(rules.find((r) => r.selector === '.app-kpi .label::before'), 'a quote inside a string');
  // a style written between quotes by mistake: the lone quote does not swallow the sheet
  const quoted = brief.parseCss("'.app-kpi { color: red; }\n.app-row { display: grid; }'");
  assert.ok(quoted.find((r) => /app-row/.test(r.selector)));
  // SCSS nesting: the outer declarations and the nested rule
  const nested = brief.parseCss('.card { padding: 4px; .title { font-weight: 600; } }');
  assert.ok(nested.find((r) => r.selector === '.card' && /padding: 4px/.test(r.declarations)));
  assert.ok(nested.find((r) => r.selector === '.title'));
  same(brief.classesOfSelector('.app-page-form .app-form, ion-item.ion-color[data-x=".no"]'), ['app-page-form', 'app-form', 'ion-color']);
});

test('the style index: where each class is defined, which pages use it, the rules asked, the undefined ones', () => {
  const brief = load();
  const sources = [
    { name: 'Style', qname: 'P.Application.NgxApp.sl:Style', kind: 'app', css: '.ios .md { color: red; }' },
    { name: 'AppTheme', qname: 'P.Application.NgxApp.sl:AppTheme', kind: 'theme', css: ':root { --ion-color-primary: #2563eb; --ion-color-primary-rgb: 37,99,235; --app-radius-lg: 12px; --app-space-4: 16px; }' },
    { name: 'AppLayout', qname: 'P.Application.NgxApp.sl:AppLayout', kind: 'app', css: LAYOUT }
  ];
  const index = brief.styleIndex(sources, { Dashboard: ['app-page', 'app-kpis', 'app-kpi', 'app-accent-violet', 'class1794588611450'], Companies: ['app-page', 'app-cols-3'] }, ['app-kpi', 'app-page-form', 'app-title']);
  const kpi = index.classes.find((c) => c.name === 'app-kpi');
  same(kpi.definedIn, ['AppLayout']);
  same(kpi.usedIn, ['Dashboard']);
  assert.equal(kpi.rules.length, 2);
  assert.equal(index.classes.find((c) => c.name === 'app-title').rules.length, 1, 'a rule written twice is listed once');
  assert.equal(index.classes.find((c) => c.name === 'app-cols-3').rules, undefined, 'rules only for the classes asked');
  same(index.undefinedClasses, ['app-accent-violet']);
  assert.ok(!index.classes.find((c) => /^class\d+$/.test(c.name)), 'the generated classNNN are not app classes');
  same(index.variables.ionColors, ['primary']);
  assert.ok(index.variables.app.includes('--app-radius-lg'));
  same(index.sources.map((s) => s.kind), ['app', 'theme', 'app']);
  assert.equal(brief.mainAppStyle(sources, index.classes), 'P.Application.NgxApp.sl:AppLayout', 'the app style the pages classes come from, not the starter Style');
  const compact = brief.compactClasses(index.classes).map((c) => c.name);
  assert.ok(compact.includes('app-cols-4'), 'an app class not used yet stays: the agent sees what exists');
  assert.ok(!compact.includes('ios') && !compact.includes('md') && !compact.includes('ion-color'), 'Ionic internals go');
});

test('values of NGX objects as the agent reads them', () => {
  const brief = load();
  assert.equal(brief.renderValue('PLAIN', 'Company'), '"Company"');
  assert.equal(brief.renderValue('SCRIPT', "(company?.name ?? '')"), "{{(company?.name ?? '')}}");
  const source = 'source:' + JSON.stringify({ filter: 'Local', model: { data: [{ localObject: 'local' }], path: '?.data?.rows' } });
  assert.equal(brief.renderValue('', source), '{{local?.data?.rows}}');
  assert.equal(brief.renderValue('', 'plain:app-row app-cols-3'), '"app-row app-cols-3"');
  same(brief.classTokens('PLAIN', 'app-row  app-cols-3'), ['app-row', 'app-cols-3']);
  same(brief.classTokens('SCRIPT', "'app-badge ' + (x ? 'app-accent-success' : 'app-accent-danger')"), ['app-badge', 'app-accent-success', 'app-accent-danger']);
  same(brief.bindingsOf("(company?.name ?? '') + ' ' + company?.city + c8oPage.local?.x"), ['name', 'city']);
  same(brief.propsText({ requestable: { mode: 'PLAIN', value: 'P.crm_list' }, cachePolicy: { mode: 'PLAIN', value: 'not set' }, comment: 'x', Value: { mode: 'SCRIPT', value: 'out' } }),
    ['Value={{out}}', 'requestable="P.crm_list"']);
  same(brief.parseClasses('["app-kpi", ".app-cols-4"]'), ['app-kpi', 'app-cols-4']);
  same(brief.parseClasses('app-kpi, app-row;bad class!'), ['app-kpi', 'app-row', 'bad']);
});

test('notes: secrets masked when read, a text holding one refused when written', () => {
  const brief = load();
  const masked = brief.maskSecrets([
    'Demo account demo@salespipeline.io (password given at hand-off, not stored in the docs)',
    'password: Demo2026!',
    'Mot de passe : secret42',
    'api_key = sk-abcdefghijklmnopqrstuvwx',
    'Authorization: Bearer abcdefghijklmnop0123',
    'https://admin:hunter2@db.example.com/x',
    'token "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop"'
  ].join('\n'));
  assert.match(masked.text, /password given at hand-off/);
  for (const secret of ['Demo2026!', 'secret42', 'sk-abcdefghijklmnopqrstuvwx', 'abcdefghijklmnop0123', 'hunter2', 'eyJhbGciOiJIUzI1NiJ9']) {
    assert.ok(!masked.text.includes(secret), secret + ' is masked');
  }
  assert.ok(masked.masked >= 6);
  assert.throws(() => brief.checkNotesText('# Notes\n- demo account demo@x.io, password: Demo2026!'), /never write a secret in the project/);
  assert.throws(() => brief.checkNotesText('   '), /text is required/);
  assert.throws(() => brief.checkNotesText('x'.repeat(20001)), /under 20000/);
  assert.equal(brief.checkNotesText('# Notes\r\n- Styles live in AppLayout.\n- Demo account demo@x.io (password given to the user).'),
    '# Notes\n- Styles live in AppLayout.\n- Demo account demo@x.io (password given to the user).');
});

test('the three tools are registered, classified and described with closed input schemas', () => {
  const project = read('c8oProject.yaml');
  for (const seq of ['tools_project_brief', 'tools_project_notes_write', 'tools_viewer_sign_in', 'viewer_session_claim']) {
    assert.ok(project.includes('  ↓' + seq + ' [sequences.GenericSequence]: \u{1F5CF} sequences/' + seq + '.yaml\n'), seq + ' registered with its header space');
    const yaml = read('_c8oProject/sequences/' + seq + '.yaml');
    for (const line of yaml.split('\n').filter((l) => /^\s*↓\S+ \[/.test(l))) {
      assert.ok(line.endsWith(': '), 'header keeps its trailing space: ' + line);
    }
  }
  assert.match(read('_c8oProject/sequences/viewer_session_claim.yaml'), /^accessibility: Hidden\n/);
  const confirm = read('js/studio_write_confirm.js');
  assert.match(confirm, /tools_project_brief: true/);
  assert.match(confirm, /tools_viewer_sign_in: true/);
  assert.match(confirm, /tools_project_notes_write: "project-notes-write"/);
  const vibe = read('js/setup_vibe.js');
  for (const tool of ['Convertigo_project-brief', 'Convertigo_project-notes-write', 'Convertigo_viewer-sign-in']) {
    assert.ok(vibe.includes('"' + tool + '"'), tool + ' allowed in Vibe');
  }
  assert.match(read('js/mcp_endpoint_router.js'), /targetSequence === "tools_viewer_sign_in"/, 'the viewer debug port reaches viewer-sign-in');

  const context = { C8O: {}, include() {} };
  vm.createContext(context);
  vm.runInContext(read('js/schema_overrides.js'), context, { filename: 'schema_overrides.js' });
  const overrides = context.C8O.schemaOverrides;
  for (const [seq, required] of [['tools_project_brief', ['project']], ['tools_project_notes_write', ['project', 'text']], ['tools_viewer_sign_in', ['project', 'user']]]) {
    const input = overrides.applyInput(seq, {});
    assert.equal(input.additionalProperties, false, seq);
    same(input.required, required);
    const output = overrides.applyOutput(seq, {});
    assert.ok(output.properties && Object.keys(output.properties).length >= 4, seq + ' declares its answer');
  }
  const briefOut = overrides.applyOutput('tools_project_brief', {});
  for (const field of ['notes', 'app', 'pages', 'page', 'pageSummary', 'sequences', 'data', 'auth', 'references', 'styles', 'warnings', 'next']) {
    assert.ok(briefOut.properties[field], 'project-brief declares ' + field);
  }
  for (const field of ['mainAppStyle', 'pageStyle', 'pagesWithoutStyle', 'undefinedClasses', 'classes', 'variables']) {
    assert.ok(briefOut.properties.styles.properties[field], 'styles declares ' + field);
  }
  assert.ok(overrides.applyInput('tools_browser_verify', {}).properties.signInAs, 'browser-verify takes signInAs');
  assert.ok(overrides.applyOutput('tools_browser_verify', {}).properties.signedInAs, 'and says it');
});

test('the guides route an existing project through the brief and forbid password guessing', () => {
  const skill = read('resources/convertigo_common_skill.md');
  assert.match(skill, /## Existing project: notes and brief first/);
  assert.match(skill, /## Frequent changes: where they go/);
  assert.match(skill, /Never guess, try, crack or brute-force a password, never read, compute or compare stored password hashes or salts/);
  assert.match(skill, /viewer-sign-in\(\{project, user, page\}\)/);
  assert.match(skill, /project-notes-write\(\{project, text, mode\}\)/);
  assert.match(skill, /\$event\.stopPropagation\(\)/);
  assert.doesNotMatch(skill, /demo accounts and passwords/, 'the verifier no longer gets passwords in its hints');
  assert.match(read('resources/convertigo_authentication.md'), /Never guess, try, crack or brute-force a password/);
  assert.match(read('resources/convertigo_frontend_ngx.md'), /as `signInAs`/);
  assert.match(read('resources/convertigo_start.md'), /"name":"project-brief"/);
});
