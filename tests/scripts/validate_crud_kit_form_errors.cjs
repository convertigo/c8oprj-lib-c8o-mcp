const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The CRUD kit edit form called the create or update sequence and emitted Saved whatever it answered: a save refused by
// a server check (an error element, the call resolves) closed the form as if saved and the message never showed. In a
// usage run asked for server-side validation, the agent spent its second turn wiring the message by hand (S4, 29/10).
// The form now keeps the answer, shows its error above the buttons and emits Saved only without one. Checked live on a
// generated app: an empty name shows "Le nom est obligatoire.", a valid save creates the row and clears the message.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// Names of the YAML nodes as an indented outline: "  ↓Name [class-priority]: ".
function outline(yaml) {
  return yaml.split('\n').filter(l => /^\s*↓/.test(l)).map(l => ({ depth: l.search(/↓/), name: l.trim().slice(1).split(' ')[0] }));
}

function path_(nodes, names) {
  // Each name is a direct child of the previous one.
  let from = 0;
  let depth = -1;
  for (const name of names) {
    const at = nodes.findIndex((n, i) => i >= from && n.name === name && (depth < 0 || n.depth > depth));
    if (at < 0) return false;
    if (depth >= 0 && nodes.slice(from, at).some(n => n.depth <= depth)) return false;
    depth = nodes[at].depth;
    from = at + 1;
  }
  return true;
}

test('the template edit form keeps the save answer, shows its error and emits Saved only without one', () => {
  const yaml = read('_c8oProject/mobileSharedComponents/TplEntityEditForm.yaml');
  const nodes = outline(yaml);
  assert.ok(path_(nodes, ['Load', 'ClearSaveResult']), 'a new selection clears the last error');
  assert.ok(path_(nodes, ['Form', 'SaveErrorVisible', 'SaveError', 'SaveErrorText']));
  assert.ok(nodes.findIndex(n => n.name === 'SaveErrorVisible') < nodes.findIndex(n => n.name === 'ActionsGrid'), 'above the buttons');
  assert.ok(path_(nodes, ['Submit1', 'WhenCreateMode', 'Create', 'KeepCreateResult', 'WhenCreateSaved', 'EmitSaved']));
  assert.ok(path_(nodes, ['Submit1', 'WhenUpdateMode', 'Update', 'KeepUpdateResult', 'WhenUpdateSaved', 'EmitSaved']));
  assert.match(yaml, /"condition":"script:!this\.local\?\.lastSave\?\.error"/);
  assert.match(yaml, /directiveExpression: '!!this\.local\?\.lastSave\?\.error'/);
});

test('the template builder, the clone and the bindings follow the same form', () => {
  const builder = read('js/crud_ui_templates.js');
  for (const name of ['ClearSaveResult', 'SaveErrorVisible', 'KeepCreateResult', 'WhenCreateSaved', 'KeepUpdateResult', 'WhenUpdateSaved']) {
    assert.ok(builder.includes('"' + name + '"'), name + ' in templateEntityEditFormTree');
  }
  // The clone puts the entity fields first and keeps every other child of the template form (it kept the last two).
  assert.match(builder, /buildFormFieldChildren\(ctx, config, entities, projectName\)\.concat\(existingChildren\.filter\(/);
  const kit = read('js/crud_ui_kit.js');
  assert.match(kit, /Submit1\.WhenCreateMode\.Create\.KeepCreateResult\.WhenCreateSaved\.EmitSaved", property: "data", value: "\{ id: \(this\.local\.lastSave\.row/);
  assert.match(kit, /Submit1\.WhenUpdateMode\.Update\.KeepUpdateResult\.WhenUpdateSaved\.EmitSaved/);
});
