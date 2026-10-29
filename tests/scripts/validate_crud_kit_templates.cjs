const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The kit's work-in-progress card put its message and its hint as two sibling texts: they rendered glued
// ("Preparing the application.This page will be ready in a moment.") and tree-apply warned about it on every
// generation (usage tests 29/10). Each text is now in its own paragraph, in the template and in its builder.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('the work-in-progress message and hint are each in their own paragraph', () => {
  const yaml = read('_c8oProject/mobileSharedComponents/TplWorkInProgressCard.yaml');
  assert.match(yaml, /↓TplWorkInProgressMessage \[ngx\.components\.UIDynamicElement-\d+\]: \n\s+beanData: '\{"ionBean":"Paragraph"\}'\n\s+tagName: p\n\s+↓TplWorkInProgressText \[/);
  assert.match(yaml, /↓TplWorkInProgressHintParagraph \[ngx\.components\.UIDynamicElement-\d+\]: \n\s+beanData: '\{"ionBean":"Paragraph"\}'\n\s+tagName: p\n\s+↓TplWorkInProgressHint \[/);
  const builder = read('js/crud_ui_templates.js');
  assert.match(builder, /"TplWorkInProgressMessage",\s*\n\s*ctx\.scriptTextNode\("TplWorkInProgressText"/);
  assert.match(read('js/crud_ui_kit.js'), /\.TplWorkInProgressMessage\.TplWorkInProgressText"/);
});
