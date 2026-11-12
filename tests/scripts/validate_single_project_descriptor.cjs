// The archive (CAR) of this library holds the whole project folder, and an engine that deploys it takes the first
// c8oProject.yaml it finds: MCP 0.3.0-beta.12 shipped a test fixture first and deployed YamlFormatsSample as
// lib_ConvertigoMCP. Only the project's own descriptor may be named c8oProject.yaml (fixtures use .fixture).
// node --test tests/scripts/validate_single_project_descriptor.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const SKIP = new Set(['.git', 'node_modules', 'build', '.gradle', '_private']);

function descriptors(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name) && !entry.name.startsWith('.night-')) {
        descriptors(path.join(dir, entry.name), found);
      }
    } else if (entry.name === 'c8oProject.yaml' || entry.name === 'c8oProject.xml') {
      found.push(path.relative(root, path.join(dir, entry.name)));
    }
  }
  return found;
}

test('the project folder holds one project descriptor, its own', () => {
  assert.deepEqual(descriptors(root), ['c8oProject.yaml']);
  for (const kind of ['legacy', 'standard']) {
    assert.ok(fs.existsSync(path.join(root, 'tests/fixtures/yaml-formats', kind, 'YamlFormatsSample/c8oProject.yaml.fixture')), kind);
  }
});
