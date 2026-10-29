const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Tigo frictions of 22/10 (Studio 8.4.6, MCP 0.2.26, GLM 5.3): palette-describe and palette-list got NGX palette names
// the model guessed (a class without '#<logicalId>', an id that does not exist, a className as target) and answered
// with nothing to try next. They now give the close entries and how to list the real names.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const dboSource = read('js/databaseobject.js');
const describeSource = read('js/tools_palette_describe.js');

function slice(source, from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, 'Unable to isolate ' + from);
  return source.slice(start, end);
}

const classTokens = slice(dboSource, 'var _BEANS_PREFIX = ', '(function () {\n  function getProjectStore');
const isNgxClass = slice(dboSource, 'C8O.dbo._isNgxClassFqcn = function', 'C8O.dbo.getNgxComponentLogicalId = function');
const closeNames = slice(dboSource, 'C8O.dbo.closePaletteNames = function', 'C8O.dbo.findNgxComponentByLogicalClass = function');

const PREFIX = 'com.twinsoft.convertigo.beans.';
// [class, logical id, palette label, HTML tag]
const NGX = [
  ['UIDynamicElement', 'Button', 'Button', 'ion-button'],
  ['UIDynamicElement', 'SubmitButton', 'Submit Button', 'ion-button'],
  ['UIDynamicElement', 'Card', 'Card Container', 'ion-card'],
  ['UIDynamicElement', 'CardTitle', 'Card Title', 'ion-card-title'],
  ['UIDynamicElement', 'GridCol', 'Grid Column', 'ion-col'],
  ['UIDynamicElement', 'Heading2', 'H2', 'h2'],
  ['UIDynamicElement', 'Input', 'Input', 'ion-input'],
  ['UIDynamicAction', 'CallSequenceAction', 'CallSequence', ''],
  ['UIDynamicAction', 'SetLocalAction', 'SetLocal', ''],
  ['UIText', 'UIText', 'Text', '']
];
// [class, display name]
const BUILT_IN = [['steps.SimpleStep', 'Sequence JS'], ['steps.SequenceStep', 'Call Sequence'],
  ['variables.RequestableVariable', 'Variable'], ['ngx.components.UIText', 'Text']];

function list(items) {
  return {
    iterator() {
      let i = 0;
      return { hasNext: () => i < items.length, next: () => items[i++] };
    }
  };
}

function javaString(text) {
  const value = new String(text);
  value.isEmpty = () => text.length === 0;
  return value;
}

function ngxCandidate(entry) {
  const [base, id, label, tag] = entry;
  return {
    component: { getLabel: () => label, getTag: () => tag, getName: () => id, getDescription: () => label + '|long',
      getImagePath: () => '', getGroup: () => 'Components' },
    sampleDbo: {},
    logicalId: id,
    baseClassFqcn: PREFIX + 'ngx.components.' + base,
    // buildLogicalClassName writes it without the beans package.
    logicalClassName: 'ngx.components.' + base + '#' + id
  };
}

function beanInfo(displayName) {
  return { getConstructor: () => ({ newInstance: () => ({ getBeanDescriptor: () => ({
    getDisplayName: () => displayName, getShortDescription: () => displayName + '|long' }) }) }) };
}

function world(vars) {
  const classes = {};
  for (const [base] of NGX) {
    classes[PREFIX + 'ngx.components.' + base] = {};
  }
  for (const [name, displayName] of BUILT_IN) {
    classes[PREFIX + name] = {};
    classes[PREFIX + name + 'BeanInfo'] = beanInfo(displayName);
  }
  const explorer = {
    getGroups: () => list([{
      getName: () => javaString('Beans'),
      getCategories: () => list([{
        getName: () => javaString('All'),
        getBeans: () => list([{ getName: () => javaString(''), getBeans: () => list(BUILT_IN.map(([name]) => ({
          getClassName: () => PREFIX + name, isDocumented: () => true }))) }])
      }])
    }])
  };
  const ctx = Object.assign({
    Packages: {
      com: { twinsoft: { convertigo: {
        engine: { Engine: { theApp: { getDboExplorerManager: () => explorer } } },
        beans: { core: { MySimpleBeanInfo: { getIconName: () => 'icon.png' } } }
      } } },
      java: {
        beans: { BeanInfo: { ICON_COLOR_32x32: 2 } },
        lang: { Class: { forName: (name) => {
          if (!classes[name]) {
            throw new Error('ClassNotFoundException: ' + name);
          }
          return classes[name];
        } } }
      }
    },
    C8O: {
      util: { toTrimmedString: v => (v == null ? '' : String(v).trim()) },
      dbo: {
        isHiddenExperimentalBean: () => false,
        _listNgxComponentsByBaseClass: (base, ref, options) => NGX.map(ngxCandidate)
          .filter(c => (options && options.anyBaseClass) || c.baseClassFqcn === base),
        findNgxComponentByLogicalClass: (token) => {
          const parsed = ctx.C8O.dbo.parseLogicalClassToken(token);
          const found = NGX.map(ngxCandidate).find(c => c.baseClassFqcn === parsed.baseClassFqcn &&
            c.logicalId.toLowerCase() === parsed.logicalId.toLowerCase());
          return found || null;
        }
      },
      palette: {
        describePaletteEntry: () => ({ propertyHints: [], creationTemplate: null, nameSuggestion: 'item' }),
        describeBeanTemplate: () => ({ propertyHints: [] }),
        suggestTechnicalName: () => 'item'
      }
    }
  }, vars);
  vm.createContext(ctx);
  vm.runInContext(classTokens + '\n' + isNgxClass + '\n' + closeNames, ctx);
  return ctx;
}

// palette-describe for a className: the entry it describes, or the error it answers.
function describe(className) {
  const ctx = world({ className, verbose: false });
  try {
    vm.runInContext(describeSource, ctx);
  } catch (error) {
    return { error: String(error.message) };
  }
  return { entry: ctx.paletteDescribeEntry };
}

const plain = value => JSON.parse(JSON.stringify(value));

function closeEntries(message) {
  const match = /Close entries: (.*?)\. palette-list with target=/.exec(message);
  return match ? match[1].split(', ') : [];
}

const LIST_HINT = /palette-list with target=<parent QName> lists the exact classNames that parent accepts \(filter=<word> narrows it\); NGX entries, ngx\.components\.<Class>#<logicalId>, are listed only for an NGX target such as <Project>\.Application\.NgxApp\.pg:<Page>\.$/;

test('close palette names: case, separators, ion/UI prefixes, one inside the other, typos; closest first', () => {
  const closePaletteNames = world().C8O.dbo.closePaletteNames;
  const close = (words, candidates, max) => plain(closePaletteNames(words, candidates, max));
  const candidates = [
    { name: 'Button', keys: ['Button', 'Button', 'ion-button'] },
    { name: 'ButtonSet', keys: ['ButtonSet', 'Button Set', 'ion-buttons'] },
    { name: 'FabButton', keys: ['FabButton', 'FAB Button', 'ion-fab-button'] },
    { name: 'Card', keys: ['Card', 'Card Container', 'ion-card'] },
    { name: 'GridCol', keys: ['GridCol', 'Grid Column', 'ion-col'] }
  ];
  for (const guess of ['IonButton', 'ion-button', 'UIButton', 'UIDynamicButton', 'button', 'Buton']) {
    assert.equal(close([guess], candidates, 6)[0], 'Button', guess);
  }
  assert.deepEqual(close(['button'], candidates, 6), ['Button', 'ButtonSet', 'FabButton'], 'exact, then the nearest length');
  assert.deepEqual(close(['button'], candidates, 2), ['Button', 'ButtonSet'], 'at most maxItems names');
  assert.deepEqual(close(['IonCard'], candidates, 6), ['Card']);
  assert.deepEqual(close(['column'], candidates, 6), ['GridCol'], 'the palette label holds the word');
  assert.deepEqual(close(['Spinner'], candidates, 6), [], 'nothing close');
  assert.deepEqual(close(['ab'], candidates, 6), [], 'a word under three letters matches nothing');
  // A synonym matches only by equality or inclusion, after the guessed word.
  assert.deepEqual(close(['table', 'grid'], candidates, 6), ['GridCol']);
  assert.deepEqual(close(['table'], candidates, 6), []);
  // Same distance: the entries of the class asked for (rank 0) come first.
  assert.deepEqual(close(['Card'], [{ name: 'other', keys: ['Card'], rank: 1 }, { name: 'same', keys: ['Card'], rank: 0 }], 6),
    ['same', 'other']);
});

test('palette-describe gives the close NGX entries of any class for a guessed logical id', () => {
  for (const guess of ['IonButton', 'ion-button', 'Buton', 'BUTTON']) {
    const answer = describe('ngx.components.UIDynamicElement#' + guess);
    if (guess === 'BUTTON') {
      assert.equal(answer.entry.className, 'ngx.components.UIDynamicElement#Button', 'an id in another case is the entry');
      continue;
    }
    assert.match(answer.error, /^Palette entry not found for className 'ngx\.components\.UIDynamicElement#/, guess);
    assert.equal(closeEntries(answer.error)[0], 'ngx.components.UIDynamicElement#Button (Button)', guess);
    assert.match(answer.error, LIST_HINT, guess);
  }
  // The id of another class.
  assert.deepEqual(closeEntries(describe('ngx.components.UIDynamicElement#CallSequenceAction').error),
    ['ngx.components.UIDynamicAction#CallSequenceAction (CallSequence)']);
  // A usual synonym (run 5: #Column, #Table).
  assert.deepEqual(closeEntries(describe('ngx.components.UIDynamicElement#Column').error),
    ['ngx.components.UIDynamicElement#GridCol (Grid Column)']);
  // Nothing close: the way to list the real names only.
  const none = describe('ngx.components.UIDynamicElement#ResultsPanel').error;
  assert.equal(none, "Palette entry not found for className 'ngx.components.UIDynamicElement#ResultsPanel'. " +
    'palette-list with target=<parent QName> lists the exact classNames that parent accepts (filter=<word> narrows it); ' +
    'NGX entries, ngx.components.<Class>#<logicalId>, are listed only for an NGX target such as <Project>.Application.NgxApp.pg:<Page>.');
});

test('palette-describe takes an NGX class of one entry without its #logicalId, and names the entries of the others', () => {
  // palette-list without target lists ngx.components.UIText: palette-describe refused it.
  assert.equal(describe('ngx.components.UIText').entry.className, 'ngx.components.UIText#UIText');
  const many = describe('ngx.components.UIDynamicElement').error;
  assert.match(many, /^For NGX palette describe, className must include '#<logicalId>': ngx\.components\.UIDynamicElement is the class of 7 palette entries, such as ngx\.components\.UIDynamicElement#Button, ngx\.components\.UIDynamicElement#Input, ngx\.components\.UIDynamicElement#Card, /);
  assert.match(many, LIST_HINT);
  const actions = describe('ngx.components.UIDynamicAction').error;
  assert.match(actions, /class of 2 palette entries, such as ngx\.components\.UIDynamicAction#CallSequenceAction, ngx\.components\.UIDynamicAction#SetLocalAction\./);
});

test('palette-describe tells a guessed NGX class that does not exist from a missing logical id', () => {
  const answer = describe('ngx.components.UIButton').error;
  assert.match(answer, /^Palette entry not found for className 'ngx\.components\.UIButton': there is no NGX class ngx\.components\.UIButton\. Close entries: ngx\.components\.UIDynamicElement#Button \(Button\), /);
  assert.match(answer, LIST_HINT);
  assert.equal(closeEntries(describe('ngx.components.IonCard#IonCard').error)[0], 'ngx.components.UIDynamicElement#Card (Card Container)');
});

test('palette-describe gives close entries for a built-in or NGX name written without its package', () => {
  // Without ngx.components. the class is looked for among the built-in entries.
  assert.equal(closeEntries(describe('UIDynamicElement#Button').error)[0], 'ngx.components.UIDynamicElement#Button (Button)');
  assert.equal(closeEntries(describe('UIDynamicButton').error)[0], 'ngx.components.UIDynamicElement#Button (Button)');
  assert.equal(closeEntries(describe('ion-button').error)[0], 'ngx.components.UIDynamicElement#Button (Button)');
  for (const guess of ['steps.SimpleStp', 'SimpleStep', 'steps.SimpleSteps']) {
    assert.equal(closeEntries(describe(guess).error)[0], 'steps.SimpleStep (Sequence JS)', guess);
  }
  assert.ok(!closeEntries(describe('SimpleStep').error).some(name => name.indexOf('ngx.components.UIText (') === 0),
    'an NGX class is never proposed without its #logicalId');
  assert.match(describe('steps.SimpleStp').error, LIST_HINT);
  // A known entry is still described, in any case as before.
  assert.equal(describe('steps.SimpleStep').entry.className, 'steps.SimpleStep');
  assert.equal(describe('steps.simplestep').entry.className, 'steps.simplestep');
  assert.equal(describe('ngx.components.UIDynamicElement#Button').entry.className, 'ngx.components.UIDynamicElement#Button');
});

// The JavaScript of a step expression in a sequence YAML: the literal block holds one single-quoted string.
function stepExpression(file, step) {
  const lines = read(file).split('\n');
  const at = lines.findIndex(l => l.startsWith('↓' + step + ' [steps.SimpleStep'));
  const start = lines.findIndex((l, i) => i > at && /^\s*expression: \|\s*$/.test(l));
  const indent = lines[start + 1].match(/^\s*/)[0];
  const body = [];
  for (let i = start + 1; i < lines.length && (lines[i].startsWith(indent) || !lines[i].trim()); i++) {
    body.push(lines[i].slice(indent.length));
  }
  return body.join('\n').trim().replace(/^'|'$/g, '').replace(/''/g, "'");
}

const PALETTE_LIST = '_c8oProject/sequences/tools_palette_list.yaml';

// palette-list's target resolution: the objects the engine knows by QName, and those C8O.dbo.resolve finds besides.
function paletteListInit(target) {
  const page = qname => ({ getQName: () => qname, getClass: () => ({ getName: () => PREFIX + 'ngx.components.PageComponent' }) });
  const ctx = {
    target, includeBuiltIn: 'true', includeShared: 'true', filter: '', limit: '',
    Packages: { com: { twinsoft: { convertigo: { engine: { Engine: { theApp: { databaseObjectsManager: {
      getDatabaseObjectByQName: q => (q === 'ContactsMix.Application.NgxApp.pg:Contacts' ? page(q) : null),
      existsProject: name => name === 'ContactsMix'
    } } } } } } } },
    C8O: { dbo: {
      resolve: (q, options) => {
        assert.equal(options.optional, true);
        return q === 'ContactsMix.Application.NgxApp.Contacts' ? page('ContactsMix.Application.NgxApp.pg:Contacts') : null;
      },
      _buildResolveError: (q, options) => new Error(options.messagePrefix + ': Database object not found: ' + q +
        '. Children of the closest existing ancestor with a close name: ContactsMix.Application.NgxApp.pg:Contacts.')
    } }
  };
  vm.createContext(ctx);
  try {
    vm.runInContext(stepExpression(PALETTE_LIST, 'InitContext'), ctx);
  } catch (error) {
    return { error: String(error.message) };
  }
  return { parentQName: ctx.resultInfo.parentQName };
}

test('palette-list finds a target as the other tools do, and answers an unknown one with its close QNames', () => {
  assert.deepEqual(paletteListInit('ContactsMix.Application.NgxApp.pg:Contacts'), { parentQName: 'ContactsMix.Application.NgxApp.pg:Contacts' });
  assert.deepEqual(paletteListInit('ContactsMix.Application.NgxApp.Contacts'), { parentQName: 'ContactsMix.Application.NgxApp.pg:Contacts' },
    'a guessed type prefix is resolved by C8O.dbo.resolve');
  assert.deepEqual(paletteListInit(''), { parentQName: '' });
  assert.equal(paletteListInit('ContactsMix.Application.NgxApp.pg:Contact').error,
    'target: Database object not found: ContactsMix.Application.NgxApp.pg:Contact. Children of the closest existing ancestor with a close name: ' +
    'ContactsMix.Application.NgxApp.pg:Contacts. If it does not exist yet, create it first. Without target, palette-list lists the built-in ' +
    'entries and the NGX classes without their #logicalId: NGX palette names need an NGX target.');
});

test('palette-list tells a className given as target from a missing object', () => {
  for (const target of ['ngx.components.UIDynamicElement#Button', 'UIDynamicElement#Button', 'ngx.components.UIText', 'steps.SimpleStep']) {
    assert.equal(paletteListInit(target).error, 'target: ' + target + ' is a palette className, not a database object. target takes the ' +
      'QName of the parent whose entries are listed (<Project>.Application.NgxApp.pg:<Page> for NGX components, <Project>.sq:<sequence> ' +
      'for steps); palette-describe takes the className.', target);
  }
  // A QName of a loaded project is never taken for a className.
  assert.match(paletteListInit('ContactsMix.steps.Missing').error, /^target: Database object not found: /);
});

test('palette-list without target says where the NGX palette names are listed', () => {
  const line = read(PALETTE_LIST).split('\n').find(l => l.includes('"Use describe.tool with arguments.className'));
  const expression = line.replace(/^\s*- →→: '/, '').replace(/'$/, '').replace(/''/g, "'");
  const reminder = parentQName => vm.runInNewContext(expression, { resultInfo: { parentQName } });
  assert.match(reminder(''), / Without target, NGX components are listed by class only \(ngx\.components\.UIText\): their palette names, ngx\.components\.<Class>#<logicalId>, are listed for an NGX target such as <Project>\.Application\.NgxApp\.pg:<Page>\.$/);
  assert.doesNotMatch(reminder('ContactsMix.Application.NgxApp.pg:Contacts'), /Without target/);
  assert.match(reminder('ContactsMix'), /This lists what goes directly under a project/);
});

test('the guidance gives the NGX naming rules', () => {
  const guide = read('resources/convertigo_frontend_ngx.md');
  const section = guide.slice(guide.indexOf('## NGX palette names'), guide.indexOf('## Basic presentation'));
  assert.match(section, /^## NGX palette names$/m);
  assert.match(section, /`ngx\.components\.<Class>#<logicalId>`, always written in full/);
  assert.match(section, /not the HTML tag \(`ion-button`/);
  assert.match(section, /`palette-list` with an NGX parent as `target`/);
  assert.match(section, /take one of the close entries it lists/);
  const skill = read('resources/convertigo_common_skill.md');
  assert.match(skill, /An NGX palette name is written in full, `ngx\.components\.<Class>#<logicalId>`/);
  const index = JSON.parse(read('resources/resources_index.json'));
  assert.ok(index.find(entry => entry.guideId === 'convertigo/frontend-ngx').revision >= 36);
  // The input schemas say it too.
  const schemas = read('js/schema_overrides.js');
  assert.match(schemas, /An NGX entry is ngx\.components\.<Class>#<logicalId> \(ngx\.components\.UIDynamicElement#Button\)/);
  assert.match(schemas, /QName of the parent whose creatable entries are listed, not a className/);
});
