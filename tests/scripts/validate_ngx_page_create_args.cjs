const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// An argument of ngx-page-create reaches the generator only when its sequence declares it as a variable and passes it
// in the Run step: locale was added to the generator, not to the sequence, so the numbers of a page always fell back to
// English (live check 13/11). Every argument the generator reads must be both.

const root = path.resolve(__dirname, '../..');
const generator = fs.readFileSync(path.join(root, 'js/tools_generators_ngx.js'), 'utf8');
const yaml = fs.readFileSync(path.join(root, '_c8oProject/sequences/tools_ngx_page_create.yaml'), 'utf8');

test('every argument ngx-page-create reads is a variable of its sequence and is passed to the generator', () => {
  const list = /\[("name", "title", "kind"[^\]]*)\]\.forEach\(function \(k\) \{\n\s+if \(spec\[k\] === undefined && args\[k\]/.exec(generator);
  assert.ok(list, 'the argument list of the generator');
  const keys = JSON.parse('[' + list[1].replace(/\s+/g, ' ') + ']');
  assert.ok(keys.includes('locale'));
  const run = /C8O\.generators\.ngxPageCreate\(\{([^}]*)\}\)/.exec(yaml)[1];
  keys.forEach(k => {
    assert.match(run, new RegExp('(^|[ ,])' + k + ': ' + k + '([,}]|$)'), 'Run passes ' + k);
    assert.match(yaml, new RegExp('↓' + k + ' \\[variables\\.RequestableVariable-\\d+\\]: \\n'), 'variable ' + k);
  });
});
