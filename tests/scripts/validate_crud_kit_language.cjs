const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The CRUD kit wrote its buttons, titles, states and messages in English: in a usage run the user's French app took
// 13 minutes and 233 tool calls to translate by hand (S6, 29/10). With language "fr" the kit translates the texts its
// operations show, and only those: identifiers, events and page names stay.

const root = path.resolve(__dirname, '../..');

function kit() {
  const context = { C8O: {}, include() {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/crud_ui_kit.js'), 'utf8'), context);
  return context.C8O.crudUiKit;
}

const node = (className, name, properties) => ({ className: 'ngx.components.' + className, name, properties });

test('French texts for the shown values, nothing else', () => {
  const K = kit();
  const ops = [{ type: 'upsertTree', patch: { className: 'ngx.components.UISharedRegularComponent', name: 'InterventionsEditForm', children: [
    node('UICompVariable', 'Subtitle', { value: "'Manage your records'" }),
    node('UICompVariable', 'CreateTitle', { value: { mode: 'SCRIPT', value: "'Create intervention'" } }),
    node('UICompVariable', 'ActionLabel', { value: { mode: 'SCRIPT', value: "'Save intervention'" } }),
    node('UIText', 'RowsText', { textValue: { mode: 'SCRIPT', value: "'Rows: ' + (this.rows || []).length" } }),
    node('UIText', 'Back', { textValue: { mode: 'PLAIN', value: 'Back to home' } }),
    node('UIText', 'Manage', { textValue: { mode: 'SCRIPT', value: "'Manage Interventions'" } }),
    node('UIUseVariable', 'ActionLabel', { varValue: "script:'New intervention'" }),
    node('UIControlVariable', 'id', { varValue: { mode: 'SCRIPT', value: "'Login'" }, value: 'Home' }),
    node('UIDynamicEmit', 'EmitSaved', { beanData: '{"event":"plain:App.Saved","data":"script:{ mode: \'create\' }"}' }),
    node('PageComponent', 'Home', { title: 'Home', segment: 'home' }),
  ] } }];
  K.translateOperations(ops, 'fr');
  const all = JSON.parse(JSON.stringify(ops[0].patch.children.map(c => c.properties)));
  assert.equal(all[0].value, "'Gérez vos enregistrements'", 'a component variable default is a bare expression');
  const props = all.slice(1);
  assert.equal(props[0].value.value, "'Création : intervention'");
  assert.equal(props[1].value.value, "'Enregistrer'");
  assert.equal(props[2].textValue.value, "'Lignes : ' + (this.rows || []).length");
  assert.equal(props[3].textValue.value, "Retour à l'accueil");
  assert.equal(props[4].textValue.value, "'Gérer les interventions'");
  assert.equal(props[5].varValue, "script:'Ajouter'");
  assert.deepEqual(props[6], { varValue: { mode: 'SCRIPT', value: "'Login'" }, value: 'Home' }, 'a value passed to an action stays');
  assert.equal(props[7].beanData, '{"event":"plain:App.Saved","data":"script:{ mode: \'create\' }"}', 'events stay');
  assert.deepEqual(props[8], { title: 'Accueil', segment: 'home' });
});

test('a field label before its value takes the French colon', () => {
  const K = kit();
  assert.equal(K.translateText('Auteur: ', 'fr'), 'Auteur : ');
  assert.equal(K.translateText('Montant (€): ', 'fr'), 'Montant (€) : ');
  assert.equal(K.translateText('Rows: ', 'fr'), 'Lignes : ');
  assert.equal(K.translateText('Auteur: ', 'en'), 'Auteur: ');
});

test('an apostrophe stays valid in a script literal, and English is left as it is', () => {
  const K = kit();
  const ops = [{ tree: node('UIText', 'Back', { textValue: { mode: 'SCRIPT', expression: "'Back to home'" } }) }];
  K.translateOperations(ops, 'fr');
  assert.equal(ops[0].tree.properties.textValue.expression, "'Retour à l\\'accueil'", 'the {mode, expression} form of a template clone');
  const en = [{ tree: node('UIText', 'Back', { textValue: { mode: 'SCRIPT', value: "'Back to home'" } }) }];
  K.translateOperations(en, 'en');
  assert.equal(en[0].tree.properties.textValue.value, "'Back to home'");
  const source = fs.readFileSync(path.join(root, 'js/crud_ui_kit.js'), 'utf8');
  assert.match(source, /C8O\.crudUiKit\.translateOperations\(batchOperations, language\);\n[^\n]*translatedTexts[^\n]*\n\s*var batchApplyResult = ctx\.batchApply\(/);
  assert.match(source, /C8O\.crudUiKit\.translateOperations\(sharedBindingOperations, language\);/);
  assert.match(fs.readFileSync(path.join(root, 'js/crud_backend.js'), 'utf8'), /language: spec\.ui\.language,/);
});
