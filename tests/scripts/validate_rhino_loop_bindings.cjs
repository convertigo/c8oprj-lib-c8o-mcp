const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const cache = path.join(os.homedir(), '.gradle/caches/modules-2/files-2.1/org.mozilla/rhino/1.9.2');
const cached = fs.existsSync(cache) ? fs.readdirSync(cache).map(dir => path.join(cache, dir, 'rhino-1.9.2.jar')).find(p => fs.existsSync(p)) : null;
const jar = process.env.RHINO_TEST_JAR || cached;
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';

test('loop compatibility uses the real Rhino parser and evaluator', { skip: !jar && 'Set RHINO_TEST_JAR to a Rhino 1.9.2 jar (JDK 17+ required)' }, () => {
  const run = baseline => spawnSync(java, ['-cp', jar, path.join(__dirname, 'RhinoLoopBindingsTest.java'), root, ...(baseline ? ['--baseline'] : [])], { encoding: 'utf8', timeout: 60000 });
  const before = run(true);
  assert.notEqual(before.status, 0, 'the uncorrected case must fail');
  assert.match(before.stderr, /Check 1: expected 0,2,4, got 0,0,0/);
  const after = run(false);
  assert.equal(after.status, 0, after.stderr || String(after.error));
  assert.match(after.stdout, /PASS optimization=-1[\s\S]*PASS optimization=0[\s\S]*PASS optimization=9/);
});

test('the common write path normalizes before compilation and reports batch warnings', () => {
  const dbo = fs.readFileSync(path.join(root, 'js/databaseobject.js'), 'utf8');
  assert.match(dbo, /include\("js\/rhino_loop_bindings.js"\)/);
  assert.ok(dbo.indexOf('C8O.rhinoLoopBindings.prepareProperty(dbo, name, preparedValue)') < dbo.indexOf('var compiledValue = dbo.compileProperty(propertyType, name, preparedValue)'));
  assert.match(dbo, /code: "JS-LOOP-CONST"/);
  const batch = fs.readFileSync(path.join(root, 'js/databaseobject_batch.js'), 'utf8');
  assert.match(batch, /report.warnings.push\(scopeName \+ ": " \+ applied\[a\].name/);
});
