const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The agents of the PCA eval (31/10) read the common skill once, never the recipe, and took the marketplace libraries
// for external dependencies a specification told them to avoid: they rebuilt the CSV export and the admin grids by hand.
// The skill itself must say what a library is, which one fits a need, and put the reuse step in the bootstrap.

const root = path.resolve(__dirname, '../..');
const skill = fs.readFileSync(path.join(root, 'resources/convertigo_common_skill.md'), 'utf8');
const sections = skill.split(/\n(?=## )/);
const indexOf = title => sections.findIndex(s => s.startsWith('## ' + title));

test('the common skill says, before the bootstrap, that the libraries are standard components', () => {
  const at = indexOf('Convertigo libraries are standard components');
  assert.ok(at > 0, 'the section exists');
  assert.ok(at < indexOf('Mandatory bootstrap'), 'it comes before the bootstrap and the task routes');
  assert.match(sections[at], /standard Convertigo components[^.]*: they are not external dependencies/);
  assert.match(sections[at], /limits external dependencies, asks for them/);
  assert.match(sections[at], /reason you write down/);
});

test('the capability table names the library of each common need', () => {
  const table = sections[indexOf('Convertigo libraries are standard components')];
  const rows = table.split('\n').filter(l => l.startsWith('| ') && !/^\| (Need|---)/.test(l));
  assert.ok(rows.length >= 8 && rows.length <= 12, 'compact: ' + rows.length + ' rows');
  const expected = {
    'Admin list': /lib_ExtendedComponents_ui_ngx` agGrid: `ngx-page-create` list `grid`/,
    'Charts': /libApexCharts/,
    'CSV': /lib_csv_response`; `lib_download_file/,
    'Login': /lib_UserManager/,
    'PDF': /lib_fill_odt_pdf/,
    'Sending mail': /steps\.SmtpStep/
  };
  Object.keys(expected).forEach(need => {
    const row = rows.find(r => r.startsWith('| ' + need));
    assert.ok(row, need + ' row');
    assert.match(row, expected[need]);
  });
  assert.match(table, /`_ui_ngx` library, never a `_ui` one/);
});

test('the bootstrap every agent runs has the reuse step, before the first mutation', () => {
  const boot = sections[indexOf('Mandatory bootstrap')];
  assert.match(boot, /\n5\. Before the first project mutation of a build, list the capabilities the task needs and match each one to the table above, or to `marketplace-list\(\{search:"<capability>"\}\)` \(English or French words/);
  assert.match(boot, /write each capability you build yourself, and why/);
  // The how-to stays in one place: no second copy of the long reuse instructions.
  assert.equal(skill.split('Reuse before building').length, 2);
  assert.match(skill, /`ngx-page-create` \(list, detail, form or dashboard page; a table list of 5 cells or more is the agGrid of `lib_ExtendedComponents_ui_ngx`/);
});
