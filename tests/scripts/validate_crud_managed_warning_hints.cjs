const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The warning on a direct edit of a kit-managed object listed the hints of the first kit only: an agent built status and
// search filters by hand in a managed list panel (overwritten by the next kit run), while ui.listFilters does it
// (usage tests 30/10, mistral-large-4). It now names every ui hint and the auth option.

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'crud_ui_refresh.js'), 'utf8');

test('the managed edit warning names every kit ui hint, the auth option and the language option', () => {
  const start = src.indexOf('function managedCrudMutationWarning');
  const body = src.slice(start, src.indexOf('\n  }\n', start));
  for (const hint of ['listFields', 'detailFields', 'formFields', 'fieldLabels', 'actionLabel', 'relationFields', 'fieldOptions',
    'fieldDefaults', 'listFilters (status select and text search above the list)', 'auth option', 'language option']) {
    assert.ok(body.includes(hint), hint);
  }
  assert.ok(body.includes('are overwritten by the next kit run'));
});
