const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The kit edit form submits whatever its validity and NOT NULL takes '': a verifier that clicked the save button saved
// an empty row (usage tests 29/10, S5 replay). The create and update business sequences now check their required
// fields before the call: an empty one answers the error the kit form shows, and nothing is written.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function backend() {
  const context = { C8O: { util: {} }, java: { lang: { Long: { valueOf: n => n } } } };
  vm.createContext(context);
  vm.runInContext(read('js/crud_proof.js'), context);
  vm.runInContext(read('js/crud_backend.js'), context);
  return context.C8O.crudBackend;
}

function world() {
  let priority = 100;
  const make = (name, parent) => ({ name, priority: priority++, props: {}, children: [], parent, getName() { return this.name; },
    getFullQName() { return 'App.sq:crud_create_item.st:' + this.name; } });
  const sequence = make('crud_create_item', null);
  const ordered = [];
  sequence.getOrderedSteps = () => ({ get: () => ({ indexOf: v => ordered.indexOf(v), remove: i => ordered.splice(i, 1), add: (i, v) => ordered.splice(i, 0, v) }) });
  sequence.getDatabaseObjectChildren = () => ({ size: () => sequence.children.length, get: i => sequence.children[i] });
  sequence.remove = child => { sequence.children = sequence.children.filter(c => c !== child); ordered.splice(ordered.indexOf(child.priority), 1); };
  const ctx = {
    ensureArray: v => (Array.isArray(v) ? v : v == null ? [] : [v]),
    trimmed: v => String(v == null ? '' : v).trim(),
    logicalClassName: () => 'steps.IfStep',
    ensureChild: (parent, _className, name) => {
      let child = parent.children.find(c => c.name === name);
      if (!child) {
        child = make(name, parent);
        parent.children.push(child);
        if (parent === sequence) ordered.push(child.priority);
      }
      return child;
    },
    applyUpdates: (dbo, updates) => Object.assign(dbo.props, updates),
  };
  const call = ctx.ensureChild(sequence, 'steps.TransactionStep', 'CallCrud_create_item');
  return { sequence, ordered, ctx, call };
}

test('each required field gets a check before the call, in the spec language, and loses it when it is no longer required', () => {
  const B = backend();
  const { sequence, ordered, ctx, call } = world();
  const entity = { fields: [{ column: 'id', primary: true, required: true }, { column: 'titre', label: 'titre', required: true },
    { column: 'statut', label: 'Statut', required: true }, { column: 'montant', required: false }] };
  B.ensureRequiredChecks(ctx, sequence, call, entity, { ui: { language: 'fr' } }, { deleted: [], created: [] });
  const names = ordered.map(p => sequence.children.find(c => c.priority === p).name);
  assert.deepEqual(names, ['Require_titre', 'Require_statut', 'CallCrud_create_item']);
  const titre = sequence.children.find(c => c.name === 'Require_titre');
  assert.equal(titre.props.condition, "typeof titre === 'undefined' || titre == null || String(titre).trim() === ''");
  assert.deepEqual(titre.children.map(c => c.name), ['RequiredError', 'StopBeforeWrite']);
  assert.equal(titre.children[0].props.message.value, 'Titre est obligatoire.');
  B.ensureRequiredChecks(ctx, sequence, call, { fields: [entity.fields[0], entity.fields[1], { column: 'statut', required: false }] }, {}, { deleted: [] });
  assert.deepEqual(sequence.children.map(c => c.name), ['CallCrud_create_item', 'Require_titre'], 'statut is no longer required');
  assert.equal(sequence.children.find(c => c.name === 'Require_titre').children[0].props.message.value, 'Titre is required.');
  assert.match(read('js/crud_backend.js'), /currentOptions\.verb === "create" \|\| currentOptions\.verb === "update"\)\) \{\s*C8O\.crudBackend\.ensureRequiredChecks\(/);
});
