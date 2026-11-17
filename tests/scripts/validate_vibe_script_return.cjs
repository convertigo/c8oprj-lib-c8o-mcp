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
  // Vibe 3.1 measures its 16 000 characters on the result indented by 2 (a 9 928-character answer was saved, 16/11).
  assert.match(vibe, /past 16 000 characters \(JSON indented by 2\)/);
  assert.match(vibe, /Filter in the script and return only what you look for/);
  assert.match(vibe, /Never return `JSON\.stringify\(r\)` or a `\.slice\(\)` of it/);
  assert.match(vibe, /call the tool again narrower .*, never read the file with bash or jq/);
  assert.doesNotMatch(bootstrap('claude'), /run_typescript/);
});

// Each run_typescript call is a request that reads the whole context again (286 requests, 170k tokens each at the
// median, for one CRM on 13/11): dependent steps go in one program, tool declarations load in one details call, and a
// program has 60 s, so one waiting call per program.
test('the Vibe bootstrap chains dependent steps in one program and loads declarations at once', () => {
  const vibe = bootstrap('vibe');
  // Vibe 3.1 refuses a details call of more than 10 names (FieldFix, 16/11).
  assert.match(vibe, /in one call \(10 names at most\), `search_tool_functions\(\{mode:\\?"details\\?", functions:\[/);
  assert.match(vibe, /Every `run_typescript` call is one more request that reads your whole context again/);
  assert.match(vibe, /chain dependent steps there \(a write, its save, the call that proves it\)/);
  assert.match(vibe, /A `run_typescript` program stops after 60 s/);
  assert.match(vibe, /Run it once per lot with every path and check of the lot/);
  assert.match(vibe, /Read trees with `properties:\\?"changed\\?"`/);
});
