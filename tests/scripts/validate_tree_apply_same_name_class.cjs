const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// A usage run (30/10) had 6 of its 12 failures on a className with another package: connectors.SqlTransaction,
// sequences.RequestableVariable, steps.StepVariable. The answer named the right class, and the agent sent the same call
// again first. When no class has the name sent and one bean class has its simple name, tree-apply creates that one and
// says so. Checked live: the three are created with "className X was read as Y"; nope.NoSuchThing is still refused.

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'databaseobject_batch.js'), 'utf8');

test('a missing class with one same-named bean class is created as that class, with a warning', () => {
  assert.match(src, /if \(!dbo && sameName\.length === 1 && !beanClassExists\(normalizedClassName\)\) \{\s*try \{\s*dbo = C8O\.dbo\.instantiateForCreate\(C8O\.util\.toFqcn\(sameName\[0\]\), parent, updateHints\);/);
  assert.match(src, /ctx\.classNameNotes = \(ctx\.classNameNotes \|\| \[\]\)\.concat\(\["className " \+ className \+ " was read as " \+ sameName\[0\] \+ "\."\]\);/);
  assert.match(src, /function beanClassExists\(className\) \{[\s\S]*?Packages\.java\.lang\.Class\.forName\(text\);\s*return true;/);
});

test('an existing abstract class or several candidates still fail, and every create reports the note', () => {
  assert.match(src, /": this class cannot be created \(missing or abstract\), use className " \+ sameName\.join\(" or "\)/);
  const creates = src.match(/= createObject\(ctx, [^\n]+\n\s*flushClassNameNotes\(ctx, report\);/g) || [];
  assert.equal(creates.length, 3);
});
