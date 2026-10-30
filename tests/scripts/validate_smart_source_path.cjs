const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// PCA eval 30/10: a constructor sub-agent wrote its Local sources with the path beside model,
// {"filter":"Local","model":{"data":[{"localObject":"local"}]},"path":"?.data?.postesARelancer"}. The template read
// local alone: the ForEach failed at run time (NG02200) and the KPI texts showed {{local}}, while tree-apply and
// project-lint passed it; the agent lost about 30 min and 8 $. tree-apply now puts such keys back into model, and
// project-lint reports a source already written so (NGX-SOURCE-PATH).

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function dbo() {
  const sandbox = { C8O: { util: {} }, JSON, include() {} };
  vm.createContext(sandbox);
  const src = read('js/databaseobject.js');
  const start = src.indexOf('C8O.dbo._SMART_SOURCE_MODEL_KEYS');
  const end = src.indexOf('C8O.dbo._buildMobileSmartSourceType = function');
  sandbox.C8O.dbo = {};
  vm.runInContext(src.slice(start, end), sandbox);
  return sandbox.C8O.dbo;
}

const broken = '{"filter": "Local", "project": "P", "input": "", "model": {"data": [{"localObject": "local"}]}, "path": "?.data?.items", "prefix": "", "suffix": ""}';

test('a path written beside model goes back into it', () => {
  const D = dbo();
  const fixed = JSON.parse(D._normalizeSmartSourceJson(broken));
  assert.equal(fixed.model.path, '?.data?.items');
  assert.equal(fixed.path, undefined);
  assert.deepEqual([...D._misplacedSmartSourceKeys(fixed)], []);
  assert.deepEqual([...D._misplacedSmartSourceKeys(JSON.parse(broken))], ['path']);
});

test('a well-formed source, a script and a model that has its own path are left as they are', () => {
  const D = dbo();
  const good = '{"filter":"Local","project":"P","input":"","model":{"data":[{"localObject":"local"}],"path":"?.rows","prefix":"","suffix":"","custom":"","useCustom":false}}';
  assert.equal(D._normalizeSmartSourceJson(good), good);
  assert.equal(D._normalizeSmartSourceJson('this.local?.rows'), 'this.local?.rows');
  const both = '{"filter":"Local","model":{"path":"?.a"},"path":"?.b"}';
  assert.equal(D._normalizeSmartSourceJson(both), both);
});

test('tree-apply normalizes every SOURCE value, and project-lint reports the ones already written', () => {
  assert.match(read('js/databaseobject.js'), /smartValue = C8O\.dbo\._normalizeSmartSourceJson\(smartValue\);\s*\}\s*smart\.setSmartValue\(smartValue\);/);
  const lint = read('js/tools_project_lint.js');
  assert.match(lint, /add\("NGX-SOURCE-PATH", "error", dbo, "The source has " \+ misplaced\.join\(", "\) \+ " beside model, not in it/);
  assert.match(lint, /lintSourcePath\(dbo, call\(dbo, className === "UIText" \? "getTextSmartType" : className === "UIAttribute" \? "getAttrSmartType" : "getSourceSmartType"\)\);/);
});
