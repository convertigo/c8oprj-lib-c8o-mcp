const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The kit's Delete button emitted Deleted whatever the delete answered: a refused delete closed the form as if the row
// was gone (usage tests 30/10). It now keeps the answer like a save, shows its error above the buttons and emits Deleted
// only without one. Checked live: deleting a client still referenced shows "Cet enregistrement est encore utilisé par
// interventions." and keeps the client selected; deleting a free intervention removes it.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('the template chain keeps the delete answer and emits Deleted only without an error', () => {
  const src = read('js/crud_ui_templates.js');
  assert.match(src, /keepSaveResultNode\(ctx, "KeepDeleteResult"\),\s*ctx\.ifActionNode\(\s*"WhenDeleted",\s*"!this\.local\?\.lastSave\?\.error",\s*\[\s*ctx\.emitEventActionNode\(\s*"EmitDeleted",/);
});

test('the stored template component and the kit bindings follow the new path', () => {
  const yaml = read('_c8oProject/mobileSharedComponents/TplEntityEditForm.yaml');
  assert.match(yaml, /↓KeepDeleteResult \[ngx\.components\.UIDynamicAction-\d+\]: \n {22}beanData: \|\n {24}'\{\n {25}"ionBean": "SetLocalAction",\n {25}"Property": "plain:lastSave",\n {25}"Value": "script:out"/);
  assert.match(yaml, /↓WhenDeleted \[ngx\.components\.UIDynamicAction-\d+\]: \n {24}beanData: '\{"ionBean":"IfAction","condition":"script:!this\.local\?\.lastSave\?\.error"\}'\n {24}↓EmitDeleted \[/);
  const kit = read('js/crud_ui_kit.js');
  for (const col of ['ActionsCol', 'DangerActionCol']) {
    assert.ok(kit.includes(col + '.DeleteVisible.Delete.Event.Delete.KeepDeleteResult.WhenDeleted.EmitDeleted"'), col);
  }
});
