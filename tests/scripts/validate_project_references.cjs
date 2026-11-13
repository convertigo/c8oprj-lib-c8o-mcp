const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The CRUD kit templates this project held (since removed) named __PROJECT_NAME__ in their sources (the app they were
// cloned into). A Studio save turned that placeholder into a reference of lib_ConvertigoMCP itself (commit e51f583,
// 20/03), shipped up to 0.3.0-beta.22 and shown under References as "__PROJECT_NAME__ ! broken project !" (13/11).

const root = path.resolve(__dirname, '../..');

test('every reference of the project names a real project, never a placeholder', () => {
  const yaml = fs.readFileSync(path.join(root, 'c8oProject.yaml'), 'utf8');
  const names = [...yaml.matchAll(/\[references\.ProjectSchemaReference\]: \n\s+projectName: ([^\n]+)/g)].map(m => m[1].split('=')[0].trim());
  assert.ok(names.length > 0);
  names.forEach(name => {
    assert.doesNotMatch(name, /^__\w+__$/, name);
    assert.match(name, /^[A-Za-z][A-Za-z0-9_]*$/, name);
  });
  assert.doesNotMatch(fs.readFileSync(path.join(root, '.github/workflows/build-and-release.yml'), 'utf8'), /Check the references name real projects[\s\S]*?exit 0/);
  assert.match(fs.readFileSync(path.join(root, '.github/workflows/build-and-release.yml'), 'utf8'), /grep -E '\^ \+projectName: \*__\[A-Za-z0-9_\]\+__'/);
});
