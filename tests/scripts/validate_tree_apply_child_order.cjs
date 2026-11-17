// Run: node --test tests/scripts/validate_tree_apply_child_order.cjs
// A child that databaseobject-tree-apply adds to an ordered parent (the steps of a sequence or of a block, the components of
// a page, the variables of a requestable) goes where the tree lists it: after its previous sibling of the same folder in
// the tree, or before the next sibling that exists. A merge used to append it: a SimpleStep sent between the step that
// counted rows and the IfStep reading its variable was saved last, and the sequence failed on every run with
// "ReferenceError: <variable> is not defined" (measured run, 17/11). The fake engine below keeps the engine's semantics of
// IContainerOrdered.add(dbo, after): inserted after the child whose priority is after, first for 0, last for null.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

let lastPriority = 1700000000000;
const nextPriority = () => ++lastPriority;

function folderOf(className) {
  // NGX: the engine's folders of UIAttribute (and its kinds) and UIDynamicAttr, of UIStyle (and UITheme), none for an element
  if (/^ngx\./.test(className)) {
    return /UIAttribute|UIDynamicAttr/.test(className) ? 'ATTRIBUTE' : (/UIStyle|UITheme/.test(className) ? 'STYLE' : 'NONE');
  }
  return /Variable$/.test(className) ? 'VARIABLE' : (/Transaction$/.test(className) ? 'TRANSACTION' : 'STEP');
}

function isOrderedClass(className) {
  return /(Sequence|IfStep|ThenStep|ElseStep|IfExistThenElseStep|Block)$/.test(className) || /^ngx\.components\.UIDynamicElement/.test(className);
}

class Bean {
  constructor(className, name) {
    this.className = className;
    this.name = name;
    this.parent = null;
    this.priority = nextPriority();
    this.children = [];
    this.props = {};
    if (/UIAttribute/.test(className)) {
      this.getAttrName = () => this.props.attrName || 'attr';
    }
    // Only an ordered container has the methods of IContainerOrdered.
    if (isOrderedClass(className)) {
      this.increasePriority = () => {};
      this.ordered = true;
    }
  }
  getClass() { return { getName: () => 'com.twinsoft.convertigo.beans.' + this.className }; }
  getName() { return this.name; }
  setName(name) { this.name = name; }
  getParent() { return this.parent; }
  getFullQName() { return (this.parent ? this.parent.getFullQName() + '.' : '') + this.name; }
  getQName() { return this.getFullQName(); }
  getFolderType() { return folderOf(this.className); }
  getProject() { let p = this; while (p.parent) { p = p.parent; } return p; }
  getDatabaseObjectChildren() { const list = this.children.slice(); return { size: () => list.length, get: i => list[i] }; }
  equals(other) { return other === this; }
  getPreviousSiblingInFolder() {
    const siblings = this.parent.children.filter(c => c.getFolderType() === this.getFolderType());
    const index = siblings.indexOf(this);
    return index > 0 ? siblings[index - 1] : null;
  }
  add(dbo, after) {
    dbo.parent = this;
    if (!this.ordered || after === undefined || after === null || this.ignoresAfter) {
      this.children.push(dbo);
      return;
    }
    const value = Number(after);
    const index = this.children.findIndex(c => c.priority === value);
    if (index < 0) {
      // after 0 (or an unknown priority): first of its folder, as the engine inserts at the head of the ordered list
      const first = this.children.findIndex(c => c.getFolderType() === dbo.getFolderType());
      this.children.splice(first < 0 ? this.children.length : first, 0, dbo);
      return;
    }
    this.children.splice(index + 1, 0, dbo);
  }
  remove(dbo) {
    this.children = this.children.filter(c => c !== dbo);
    dbo.parent = null;
  }
  delete() { if (this.parent) { this.parent.remove(this); } }
}

function build(spec, parent) {
  const bean = new Bean(spec.className, spec.name);
  Object.assign(bean.props, spec.props || {});
  if (parent) {
    parent.children.push(bean);
    bean.parent = parent;
  }
  (spec.children || []).forEach(child => build(child, bean));
  return bean;
}

function names(bean) {
  return bean.children.map(c => c.name);
}

function load(project, options = {}) {
  const all = () => {
    const out = [];
    const walk = b => { out.push(b); b.children.forEach(walk); };
    walk(project);
    return out;
  };
  const resolve = (qname, opts) => {
    const found = all().find(b => b.getFullQName() === String(qname));
    if (!found && !(opts && opts.optional)) {
      throw new Error('not found: ' + qname);
    }
    return found || null;
  };
  const sandbox = {
    include() {},
    java: { lang: { System: { currentTimeMillis: () => Date.now() }, Long: { valueOf: v => Number(v) } } },
    C8O: {
      util: {
        toFqcn: v => String(v),
        fromFqcn: v => String(v).replace(/^com\.twinsoft\.convertigo\.beans\./, ''),
        toTrimmedString: v => (v == null ? '' : String(v).trim()),
        toBoolean: (v, d) => (v === undefined || v === null || v === '' ? d : v === true || String(v) === 'true'),
        parseAutoSaveFlag: (v, d) => (v === undefined || v === null ? d : v === true || String(v) === 'true'),
        tryParseJson: text => { try { return JSON.parse(text); } catch (e) { return null; } },
      },
      dbo: {
        resolve,
        withStudioLock: fn => fn(),
        instantiateForCreate: (className) => new Bean(String(className), String(className).split('.').pop()),
        suggestBeanClasses: () => [],
        _normalizePropertyLookupKey: key => String(key).toLowerCase(),
        parsePropertyUpdates: text => JSON.parse(text),
        applyPropertyUpdates: (dbo, updates) => {
          Object.assign(dbo.props, updates);
          return { applied: Object.keys(updates).map(name => ({ name })), skipped: [], errors: [] };
        },
        saveProject: () => ({ saved: true, message: '' }),
        triggerMobileBuilderRefresh: () => ({ requested: false, triggered: false, message: '' }),
        computeBatchRefreshQName: () => '',
        reloadForLibraryComponents: () => '',
        removeObject: ({ qname }) => {
          const dbo = resolve(qname);
          const parent = dbo.parent;
          parent.remove(dbo);
          return { removed: true, qname: String(qname), parentQName: parent.getFullQName(), errors: [] };
        },
        existedBeforeConversation: options.existedBefore,
        logicalClassNameForDbo: options.logicalClass,
        moveObject: options.moveObject || (({ qname, target, position }) => {
          const dbo = resolve(qname);
          const anchor = resolve(target);
          const parent = anchor.parent;
          parent.remove(dbo);
          let after = null;
          if (position === 'after') {
            after = anchor.priority;
          } else {
            const previous = anchor.getPreviousSiblingInFolder();
            after = previous ? previous.priority : 0;
          }
          parent.add(dbo, after);
          return { done: true, qname: dbo.getFullQName(), errors: [] };
        }),
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(read('js/databaseobject_batch.js'), sandbox, { filename: 'js/databaseobject_batch.js' });
  const inVm = value => vm.runInContext('(' + JSON.stringify(value) + ')', sandbox);
  return {
    apply: args => JSON.parse(JSON.stringify(sandbox.C8O.dbo.batchApply(inVm(args)))),
  };
}

const step = (name, className = 'steps.SimpleStep', children) => ({ name, className, ...(children ? { children } : {}) });

function sequenceProject() {
  return build({
    className: 'core.Project', name: 'P', children: [
      {
        className: 'sequences.GenericSequence', name: 'Seed', children: [
          { className: 'variables.RequestableVariable', name: 'mode' },
          step('Count', 'steps.TransactionStep'),
          step('Total', 'steps.JsonFieldStep'),
          step('IfEmpty', 'steps.IfStep', [step('Insert', 'steps.TransactionStep'), step('Check', 'steps.IfExistThenElseStep')]),
          step('Final', 'steps.JsonFieldStep'),
        ],
      },
    ],
  });
}

test('a step the tree adds between two existing steps of a sequence is saved between them, not last', () => {
  const project = sequenceProject();
  const D = load(project);
  const result = D.apply({
    target: 'P',
    operations: [{
      type: 'create', related: 'P', mode: 'inside', className: 'sequences.GenericSequence', name: 'Seed',
      children: [step('Count', 'steps.TransactionStep'), step('Total', 'steps.JsonFieldStep'), step('ReadTotal'),
        step('IfEmpty', 'steps.IfStep'), step('Final', 'steps.JsonFieldStep')],
    }],
  });
  assert.ok(['ok', 'partial'].includes(result.status) && result.errors.length === 0, JSON.stringify(result.errors));
  assert.deepEqual(names(project.children[0]), ['mode', 'Count', 'Total', 'ReadTotal', 'IfEmpty', 'Final']);
});

test('a step listed first goes before the next existing step; one listed after a step goes right after it', () => {
  const project = sequenceProject();
  const D = load(project);
  let result = D.apply({ target: 'P.Seed', operations: [{ type: 'upsertTree', qname: 'P.Seed', patch: { children: [step('Init'), step('Count', 'steps.TransactionStep')] } }] });
  assert.ok(['ok', 'partial'].includes(result.status) && result.errors.length === 0, JSON.stringify(result.errors));
  assert.deepEqual(names(project.children[0]), ['mode', 'Init', 'Count', 'Total', 'IfEmpty', 'Final']);
  // a partial tree: the new step follows the last step the tree names before it, whatever comes after in the sequence
  result = D.apply({ target: 'P.Seed', operations: [{ type: 'upsertTree', qname: 'P.Seed', patch: { children: [step('Count', 'steps.TransactionStep'), step('Log')] } }] });
  assert.ok(['ok', 'partial'].includes(result.status) && result.errors.length === 0, JSON.stringify(result.errors));
  assert.deepEqual(names(project.children[0]), ['mode', 'Init', 'Count', 'Log', 'Total', 'IfEmpty', 'Final']);
});

test('only siblings of the same folder count: a step after a variable in the tree is the first step', () => {
  const project = sequenceProject();
  const D = load(project);
  const result = D.apply({
    target: 'P.Seed',
    operations: [{ type: 'upsertTree', qname: 'P.Seed', patch: { children: [{ name: 'mode', className: 'variables.RequestableVariable' }, step('Start'), step('Count', 'steps.TransactionStep')] } }],
  });
  assert.ok(['ok', 'partial'].includes(result.status) && result.errors.length === 0, JSON.stringify(result.errors));
  assert.deepEqual(names(project.children[0]), ['mode', 'Start', 'Count', 'Total', 'IfEmpty', 'Final']);
});

test('inside a block, a new step goes where the tree lists it too', () => {
  const project = sequenceProject();
  const D = load(project);
  const result = D.apply({
    target: 'P.Seed',
    operations: [{ type: 'upsertTree', qname: 'P.Seed', patch: { children: [step('IfEmpty', 'steps.IfStep', [step('Insert', 'steps.TransactionStep'), step('ReadInsert'), step('Check', 'steps.IfExistThenElseStep')])] } }],
  });
  assert.ok(['ok', 'partial'].includes(result.status) && result.errors.length === 0, JSON.stringify(result.errors));
  const ifEmpty = project.children[0].children.find(c => c.name === 'IfEmpty');
  assert.deepEqual(names(ifEmpty), ['Insert', 'ReadInsert', 'Check']);
});

test('a whole new tree keeps its order, and a parent without order appends as before', () => {
  const project = build({ className: 'core.Project', name: 'P', children: [{ className: 'connectors.SqlConnector', name: 'db', children: [{ className: 'transactions.SqlTransaction', name: 'b' }] }] });
  const D = load(project);
  let result = D.apply({
    target: 'P',
    operations: [{ type: 'create', related: 'P', mode: 'inside', className: 'sequences.GenericSequence', name: 'Fresh', children: [step('One'), step('Two'), step('Three', 'steps.IfStep', [step('Inner')])] }],
  });
  assert.ok(['ok', 'partial'].includes(result.status) && result.errors.length === 0, JSON.stringify(result.errors));
  assert.deepEqual(names(project.children[1]), ['One', 'Two', 'Three']);
  result = D.apply({ target: 'P.db', operations: [{ type: 'upsertTree', qname: 'P.db', patch: { children: [{ name: 'a', className: 'transactions.SqlTransaction' }, { name: 'b', className: 'transactions.SqlTransaction' }] } }] });
  assert.ok(['ok', 'partial'].includes(result.status) && result.errors.length === 0, JSON.stringify(result.errors));
  assert.deepEqual(names(project.children[0]), ['b', 'a']);
  assert.equal(JSON.stringify(result).includes('databaseobject-move'), false);
});

test('existing steps listed in another order are not moved: the answer says which move follows the tree', () => {
  const project = sequenceProject();
  const D = load(project);
  const result = D.apply({ target: 'P.Seed', operations: [{ type: 'upsertTree', qname: 'P.Seed', patch: { children: [step('Total', 'steps.JsonFieldStep'), step('Count', 'steps.TransactionStep')] } }] });
  assert.deepEqual(names(project.children[0]), ['mode', 'Count', 'Total', 'IfEmpty', 'Final']);
  const warnings = JSON.stringify(result);
  assert.match(warnings, /the tree lists Count after Total, but Count comes first in P\.Seed/);
  assert.match(warnings, /databaseobject-move \{qname:\\"P\.Seed\.Count\\", target:\\"P\.Seed\.Total\\", position:\\"after\\"\}/);
});

test('a new step that cannot be placed is removed and the call fails with what to do', () => {
  const project = sequenceProject();
  const sequence = project.children[0];
  sequence.ignoresAfter = true;
  const D = load(project, { moveObject: () => ({ done: false, errors: [{ message: 'refused' }] }) });
  const result = D.apply({ target: 'P.Seed', operations: [{ type: 'upsertTree', qname: 'P.Seed', patch: { children: [step('Total', 'steps.JsonFieldStep'), step('ReadTotal'), step('IfEmpty', 'steps.IfStep')] } }] });
  assert.ok(result.errors.length > 0 || result.status === 'failed', result.status);
  assert.match(JSON.stringify(result), /ReadTotal could not be placed after Total in P\.Seed, where the tree puts it, so it was not created/);
  assert.deepEqual(names(sequence), ['mode', 'Count', 'Total', 'IfEmpty', 'Final']);
});

function runTreeApply(globals, fakes = {}) {
  const calls = { batch: [], rename: [] };
  const target = fakes.target;
  const sandbox = {
    include() {},
    java: { lang: { System: { currentTimeMillis: () => Date.now() }, Long: { valueOf: v => Number(v) } } },
    C8O: {
      util: {
        toTrimmedString: v => (v == null ? '' : String(v).trim()),
        toBoolean: (v, d) => (v === undefined || v === null || v === '' ? d : v === true || String(v) === 'true'),
        parseAutoSaveFlag: (v, d) => (v === undefined || v === null ? d : v === true || String(v) === 'true'),
        tryParseJson: text => { try { return JSON.parse(text); } catch (e) { return null; } },
      },
      dbo: {},
      editProfile: { current: () => 'mcp' },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(read('js/databaseobject_batch.js'), sandbox, { filename: 'js/databaseobject_batch.js' });
  Object.assign(sandbox.C8O.dbo, {
    resolve: () => target,
    safeName: dbo => dbo.getName(),
    safeQName: dbo => dbo.getFullQName(),
    logicalClassNameForDbo: dbo => dbo.className,
    withStudioLock: fn => fn(),
    renameObject: args => {
      calls.rename.push(JSON.parse(JSON.stringify(args)));
      const from = target.getFullQName();
      target.setName(args.name);
      return { renamed: true, qname: from, newQName: target.getFullQName(), newName: args.name, updatedIds: ['a', 'b'], project: null, errors: [] };
    },
    batchApply: args => {
      calls.batch.push(JSON.parse(JSON.stringify(args)));
      return { status: fakes.batchStatus || 'ok', operations: [{ index: 0, applied: [], warnings: [], errors: [] }], warnings: [], errors: [], touchedQNames: [], saveResults: [{ project: 'P', saved: true }] };
    },
    reloadForLibraryComponents: () => '',
    computeBatchRefreshQName: () => '',
  });
  Object.assign(sandbox, globals);
  vm.runInContext(read('js/tools_databaseobject_tree_apply.js'), sandbox, { filename: 'js/tools_databaseobject_tree_apply.js' });
  return { calls, result: JSON.parse(JSON.stringify(sandbox.treeApplyResult)) };
}

test('at:self naming the target otherwise with the same class renames it first, then patches it under its new name', () => {
  const project = build({ className: 'core.Project', name: 'P', children: [{ className: 'sequences.GenericSequence', name: 'S', children: [step('NAME', 'steps.JsonFieldStep')] }] });
  const field = project.children[0].children[0];
  const { calls, result } = runTreeApply({ target: 'P.S.NAME', at: 'self', tree: { name: 'name', className: 'steps.JsonFieldStep', properties: { key: 'name' } } }, { target: field });
  assert.deepEqual(calls.rename, [{ qname: 'P.S.NAME', name: 'name', update: 'update_local' }]);
  assert.equal(calls.batch[0].operations[0].qname, 'P.S.name');
  assert.equal(result.operations[0].appliedByAction.rename, 1);
  assert.match(result.operations[0].notes.join(' '), /Renamed NAME to name \(P\.S\.NAME is now P\.S\.name; 2 reference\(s\) in the project updated\)/);
  assert.ok(result.touchedQNames.includes('P.S.name'));
});

test('at:self with another class is still refused, and a dry run or a taken name renames nothing', () => {
  const project = build({ className: 'core.Project', name: 'P', children: [{ className: 'sequences.GenericSequence', name: 'S', children: [step('A', 'steps.JsonFieldStep'), step('B', 'steps.JsonFieldStep')] }] });
  const a = project.children[0].children[0];
  assert.throws(() => runTreeApply({ target: 'P.S.A', at: 'self', tree: { name: 'Child', className: 'steps.SimpleStep' } }, { target: a }),
    /at:"self" \(the default\) patches the target itself, A \(steps\.JsonFieldStep\), but tree names Child/);
  assert.throws(() => runTreeApply({ target: 'P.S.A', at: 'self', tree: { name: 'B', className: 'steps.JsonFieldStep' } }, { target: a }),
    /renames A, but P\.S already has B\. Nothing was changed/);
  const dry = runTreeApply({ target: 'P.S.A', at: 'self', dryRun: true, tree: { name: 'C', properties: {} } }, { target: a });
  assert.deepEqual(dry.calls.rename, []);
  assert.match(JSON.stringify(dry.result.warnings), /dryRun: A would be renamed C before the patch/);
  assert.equal(a.getName(), 'A');
});

test('outside steps and page components, an object the engine keeps in its own order stays there, with a warning', () => {
  const project = build({ className: 'core.Project', name: 'P', children: [{ className: 'sequences.GenericSequence', name: 'S', children: [
    { className: 'variables.RequestableVariable', name: 'first' }, { className: 'variables.RequestableVariable', name: 'second' }] }] });
  const sequence = project.children[0];
  sequence.ignoresAfter = true;
  const D = load(project, { moveObject: () => ({ done: false, errors: [{ message: 'kept in order' }] }) });
  const result = D.apply({ target: 'P.S', operations: [{ type: 'upsertTree', qname: 'P.S', patch: { children: [
    { name: 'first', className: 'variables.RequestableVariable' }, { name: 'between', className: 'variables.RequestableVariable' },
    { name: 'second', className: 'variables.RequestableVariable' }] } }] });
  assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
  assert.deepEqual(names(sequence), ['first', 'second', 'between']);
  assert.match(JSON.stringify(result), /between stays where P\.S orders its children, not after first as the tree lists it/);
});

test('at:self renames only for the exact class, NGX kind included, or a properties-only tree', () => {
  const project = build({ className: 'core.Project', name: 'P', children: [{ className: 'sequences.GenericSequence', name: 'S', children: [step('A', 'steps.JsonFieldStep')] }] });
  const a = project.children[0].children[0];
  // a tree with children and no class may be a child sent without at:"inside"
  assert.throws(() => runTreeApply({ target: 'P.S.A', at: 'self', tree: { name: 'Child', children: [{ name: 'x', className: 'steps.SimpleStep' }] } }, { target: a }),
    /send its own className \(steps\.JsonFieldStep\) or only properties; or use databaseobject-rename/);
  // an NGX element of another kind is not the same class
  const list = { className: 'ngx.components.UIDynamicElement#ion-list', name: 'list', parent: null, children: [],
    getName() { return this.name; }, setName(n) { this.name = n; }, getParent() { return { getDatabaseObjectChildren: () => ({ size: () => 0 }) }; },
    getFullQName() { return 'P.App.pg:Home.' + this.name; }, getClass() { return { getName: () => 'x' }; }, equals(o) { return o === this; } };
  assert.throws(() => runTreeApply({ target: 'P.App.pg:Home.list', at: 'self', tree: { name: 'item', className: 'ngx.components.UIDynamicElement#ion-item' } }, { target: list }),
    /but tree names item \(ngx\.components\.UIDynamicElement#ion-item\)/);
  assert.equal(list.name, 'list');
});

test('a rename made before a patch that failed is undone', () => {
  const project = build({ className: 'core.Project', name: 'P', children: [{ className: 'sequences.GenericSequence', name: 'S', children: [step('OLD', 'steps.JsonFieldStep')] }] });
  const field = project.children[0].children[0];
  const { calls, result } = runTreeApply({ target: 'P.S.OLD', at: 'self', tree: { name: 'new', properties: { key: 'x' } } }, { target: field, batchStatus: 'failed' });
  assert.deepEqual(calls.rename.map(r => r.name), ['new', 'OLD']);
  assert.equal(field.getName(), 'OLD');
  assert.match(JSON.stringify(result.warnings), /The patch failed, so the rename of OLD to new was undone/);
});

test('mode replace: a new step listed before an existing step it keeps goes before it, the steps left out are removed', () => {
  // Measured run (17/11): a replace listing the inputs, a new SimpleStep preparing a variable, then the existing call
  // step reading it saved the call step first, so the call ran before the variable existed.
  const project = build({
    className: 'core.Project', name: 'P', children: [{
      className: 'sequences.GenericSequence', name: 'login', children: [
        { className: 'variables.RequestableVariable', name: 'username' },
        step('SignIn', 'steps.SequenceStep'),
        step('Old', 'steps.JsonFieldStep'),
      ],
    }],
  });
  const D = load(project);
  const result = D.apply({
    target: 'P.login',
    operations: [{
      type: 'upsertTree', qname: 'P.login', strategy: 'replace',
      patch: { children: [{ name: 'username', className: 'variables.RequestableVariable' }, step('Prepare'),
        step('SignIn', 'steps.SequenceStep'), step('GetAccount', 'steps.SequenceStep'), step('User', 'steps.JsonFieldStep')] },
    }],
  });
  assert.ok(['ok', 'partial'].includes(result.status) && result.errors.length === 0, JSON.stringify(result.errors));
  assert.deepEqual(names(project.children[0]), ['username', 'Prepare', 'SignIn', 'GetAccount', 'User']);
});

// mode replace rewrites what an element contains, not the element: an agent filling the content zone of a page copied
// from a model sent the zone with its new content only (at:"self", mode:"replace"), and the zone's own class attribute
// was pruned with the old content, so the zone lost its look (measured run, 17/11).
const ngxAttr = (name, attrName, attrValue) => ({ className: 'ngx.components.UIAttribute#UIAttribute', name, props: { attrName, attrValue } });
const ngxStyle = name => ({ className: 'ngx.components.UIStyle#UIStyle', name, props: { styleContent: ':host { display: block; }' } });
const ngxDiv = (name, children) => ({ className: 'ngx.components.UIDynamicElement#DivTag', name, ...(children ? { children } : {}) });
const ngxText = name => ({ className: 'ngx.components.UIText', name });

function zoneProject() {
  return build({
    className: 'core.Project', name: 'P', children: [{
      className: 'ngx.components.ApplicationComponent', name: 'App', children: [{
        className: 'ngx.components.PageComponent', name: 'Page', children: [
          ngxDiv('Header', [ngxAttr('Attr_class', 'class', 'page-header')]),
          ngxDiv('Zone', [ngxAttr('Attr_class', 'class', 'page-content'), ngxStyle('ZoneStyle'),
            ngxDiv('OldCard', [ngxAttr('Attr_class', 'class', 'card'), ngxText('OldTitle')]), ngxText('OldText')]),
        ],
      }],
    }],
  });
}

const replaceZone = children => ({
  target: 'P.App.Page.Zone',
  operations: [{ type: 'upsertTree', qname: 'P.App.Page.Zone', strategy: 'replace',
    patch: { name: 'Zone', className: 'ngx.components.UIDynamicElement#DivTag', children } }],
});

test('mode replace on an element keeps its own attributes and styles the tree does not list, and the answer names them', () => {
  const project = zoneProject();
  const zone = project.children[0].children[0].children[1];
  const D = load(project);
  const result = D.apply(replaceZone([{ name: 'NewCard', className: 'ngx.components.UIDynamicElement#DivTag', children: [{ name: 'Label', className: 'ngx.components.UIText' }] }]));
  assert.ok(['ok', 'partial'].includes(result.status) && result.errors.length === 0, JSON.stringify(result.errors));
  assert.deepEqual(names(zone), ['Attr_class', 'ZoneStyle', 'NewCard']);
  assert.equal(zone.children[0].props.attrValue, 'page-content');
  assert.deepEqual(names(zone.children[2]), ['Label']);
  const warnings = result.operations[0].warnings.join(' ');
  assert.match(warnings, /Kept the attribute\(s\)\/style\(s\) of P\.App\.Page\.Zone the tree did not list: Attr_class \(class\), ZoneStyle\./);
  assert.match(warnings, /To remove one, use databaseobject-delete\./);
  // the other zones of the page are not touched
  assert.deepEqual(names(project.children[0].children[0].children[0]), ['Attr_class']);
  // tree-apply sends its mode as the strategy of the upsertTree it runs
  const target = zone;
  const { calls } = runTreeApply({ target: 'P.App.Page.Zone', at: 'self', mode: 'replace', tree: { name: 'Zone', className: 'ngx.components.UIDynamicElement#DivTag', children: [] } }, { target });
  assert.equal(calls.batch[0].operations[0].strategy, 'replace');
});

test('mode replace: an attribute the tree lists is updated as before, and one listed with the same attrName under another name replaces it', () => {
  let project = zoneProject();
  let zone = project.children[0].children[0].children[1];
  let D = load(project);
  let result = D.apply(replaceZone([{ name: 'Attr_class', className: 'ngx.components.UIAttribute#UIAttribute', properties: { attrName: 'class', attrValue: 'page-content wide' } },
    ngxText('Intro')]));
  assert.ok(['ok', 'partial'].includes(result.status) && result.errors.length === 0, JSON.stringify(result.errors));
  assert.deepEqual(names(zone), ['Attr_class', 'ZoneStyle', 'Intro']);
  assert.equal(zone.children[0].props.attrValue, 'page-content wide');
  assert.match(result.operations[0].warnings.join(' '), /of P\.App\.Page\.Zone the tree did not list: ZoneStyle\./);

  // the attributes shortcut of tree-apply names the child Class: it replaces Attr_class, the zone never gets two class attributes
  project = zoneProject();
  zone = project.children[0].children[0].children[1];
  D = load(project);
  result = D.apply(replaceZone([{ name: 'Class', className: 'ngx.components.UIAttribute#UIAttribute', properties: { attrName: 'class', attrValue: { mode: 'PLAIN', value: 'page-content' } } },
    ngxStyle('ZoneStyle'), ngxText('Intro')]));
  assert.ok(['ok', 'partial'].includes(result.status) && result.errors.length === 0, JSON.stringify(result.errors));
  assert.deepEqual(names(zone).sort(), ['Class', 'Intro', 'ZoneStyle']);
  assert.equal(JSON.stringify(result).includes('Kept the attribute'), false);
});

test('mode replace still removes the content the tree leaves out; a nested element listed keeps its own attributes too', () => {
  const project = zoneProject();
  const zone = project.children[0].children[0].children[1];
  const D = load(project);
  const result = D.apply(replaceZone([ngxDiv('OldCard', [ngxText('NewTitle')])]));
  assert.ok(['ok', 'partial'].includes(result.status) && result.errors.length === 0, JSON.stringify(result.errors));
  assert.deepEqual(names(zone), ['Attr_class', 'ZoneStyle', 'OldCard']);
  assert.deepEqual(names(zone.children[2]), ['Attr_class', 'NewTitle']);
  const deleted = result.operations[0].applied.filter(a => a.action === 'delete').map(a => a.qname).sort();
  assert.deepEqual(deleted, ['P.App.Page.Zone.OldCard.OldTitle', 'P.App.Page.Zone.OldText']);
  const warnings = result.operations[0].warnings.join(' ');
  assert.match(warnings, /Kept the attribute\(s\)\/style\(s\) of these elements the tree did not list: P\.App\.Page\.Zone\.OldCard: Attr_class \(class\); P\.App\.Page\.Zone: Attr_class \(class\), ZoneStyle\./);
  // a merge prunes nothing and says nothing about kept attributes
  const merged = load(zoneProject()).apply({ target: 'P.App.Page.Zone', operations: [{ type: 'upsertTree', qname: 'P.App.Page.Zone', patch: { children: [ngxText('More')] } }] });
  assert.equal(JSON.stringify(merged).includes('Kept the attribute'), false);
});

test('a tree-apply create named like a sequence the conversation did not create is refused; one it created merges as before', () => {
  // Measured run (17/11): an agent that missed an existing sequence created its own under the same name; the create merged
  // into the existing one and changed an output the app reads.
  const create = keep => ({ type: 'create', related: 'P', mode: 'inside', className: 'sequences.GenericSequence', name: 'Seed',
    keepExistingRequestable: keep, children: [step('Other', 'steps.SimpleStep')] });
  let project = sequenceProject();
  let result = load(project, { existedBefore: () => true }).apply({ target: 'P', operations: [create(true)] });
  assert.equal(result.status, 'failed');
  assert.match(JSON.stringify(result), /P\.Seed already exists and this conversation did not create it: a create with its name would merge into it/);
  assert.deepEqual(names(project.children[0]), ['mode', 'Count', 'Total', 'IfEmpty', 'Final'], 'nothing merged');
  project = sequenceProject();
  result = load(project, { existedBefore: () => false }).apply({ target: 'P', operations: [create(true)] });
  assert.ok(['ok', 'partial'].includes(result.status), 'created by this conversation: merged');
  assert.ok(names(project.children[0]).includes('Other'));
  project = sequenceProject();
  result = load(project, { existedBefore: () => true }).apply({ target: 'P', operations: [create(undefined)] });
  assert.ok(['ok', 'partial'].includes(result.status), 'other tools (no flag) keep their upsert');
  assert.match(read('js/tools_databaseobject_tree_apply.js'), /keepExistingRequestable: true/);
});

test('mode merge on NGX elements listed with their kind keeps what the tree leaves out; another kind is still replaced', () => {
  // Measured run (17/11): a merge on a copied page listed Header > ToolBar > BarTitle and Content > Bandeau with their
  // kinds (UIDynamicElement#Header...). The Java class of an element never carries the kind, so each one was taken for a
  // class change, deleted and created again with only the listed children: the menu button, the footer and the classes
  // of the zones were lost.
  const ngx = (name, kind, children) => ({ className: 'ngx.components.UIDynamicElement', name, kind, children: children || [] });
  const project = build({ className: 'core.Project', name: 'P', children: [{ className: 'ngx.components.PageComponent', name: 'Page', children: [
    ngx('Header', 'Header', [ngx('ToolBar', 'ToolBar', [ngx('Start', 'ButtonSet'), ngx('BarTitle', 'BarTitle')])]),
    ngx('Content', 'Content', [{ className: 'ngx.components.UIAttribute', name: 'Attr_class' }, ngx('Bandeau', 'DivTag'), ngx('Pied', 'DivTag')]),
  ] }] });
  const kinds = new Map();
  (function index(b, spec) { (spec.children || []).forEach((c, i) => { kinds.set(b.children[i], c.kind); index(b.children[i], c); }); })(project.children[0],
    { children: [{ kind: 'Header', children: [{ kind: 'ToolBar', children: [{ kind: 'ButtonSet' }, { kind: 'BarTitle' }] }] },
      { kind: 'Content', children: [{}, { kind: 'DivTag' }, { kind: 'DivTag' }] }] });
  const logicalClass = dbo => 'ngx.components.UIDynamicElement' + (kinds.get(dbo) ? '#' + kinds.get(dbo) : '');
  const D = load(project, { logicalClass });
  const el = (name, kind, children) => ({ name, className: 'ngx.components.UIDynamicElement#' + kind, ...(children ? { children } : {}) });
  let result = D.apply({ target: 'P.Page', operations: [{ type: 'upsertTree', qname: 'P.Page', strategy: 'merge', patch: { children: [
    el('Header', 'Header', [el('ToolBar', 'ToolBar', [el('BarTitle', 'BarTitle')])]),
    el('Content', 'Content', [el('Bandeau', 'DivTag')]),
  ] } }] });
  assert.ok(['ok', 'partial'].includes(result.status), JSON.stringify(result.errors));
  const page = project.children[0];
  assert.deepEqual(names(page.children[0].children[0]), ['Start', 'BarTitle'], 'the menu button stays');
  assert.deepEqual(names(page.children[1]), ['Attr_class', 'Bandeau', 'Pied'], 'the class and the footer stay');
  assert.equal(JSON.stringify(result).includes('"action":"delete"'), false);
  result = D.apply({ target: 'P.Page', operations: [{ type: 'upsertTree', qname: 'P.Page', strategy: 'merge', patch: { children: [
    el('Content', 'Content', [el('Bandeau', 'Paragraph')]),
  ] } }] });
  assert.match(JSON.stringify(result), /"action":"delete","qname":"P\.Page\.Content\.Bandeau"/, 'a DivTag listed as a Paragraph is replaced');
  assert.match(read('js/databaseobject_batch.js'), /\} else if \(isPlainObject\(input\) \|\| Array\.isArray\(input\)\) \{/, 'a list of {name, value} properties is read as JSON');
});
