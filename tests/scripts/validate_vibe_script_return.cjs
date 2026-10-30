const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Vibe saves a run_typescript return longer than about 16 000 characters to a file (the smallest one seen: 16 146);
// agents then read it with bash and jq, one call per look: 142 bash calls in one usage run (29/10), 9 to 29 in most
// others. The Vibe bootstrap tells to filter in the script and return only what is looked for.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function bootstrap(harness) {
  const sandbox = { C8O: { util: {} }, JSON, include() {}, c8oReadCatalogFile: (folder, name) => read(folder + '/' + name) };
  vm.createContext(sandbox);
  const strip = source => source.replace(/^include\([^\n]+\);\s*$/gm, '');
  vm.runInContext(strip(read('js/guidance_version.js')), sandbox);
  vm.runInContext(strip(read('js/setup_common.js')), sandbox);
  return sandbox.C8O.setupCommon.bootstrapLines(harness).join('\n');
}

test('the Vibe bootstrap keeps run_typescript returns small enough to come back whole', () => {
  const vibe = bootstrap('vibe');
  assert.match(vibe, /What a `run_typescript` script returns reaches you whole only under about 15 000 characters/);
  assert.match(vibe, /Filter in the script and return only what you look for/);
  assert.doesNotMatch(bootstrap('claude'), /run_typescript/);
});
