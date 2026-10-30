const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// PCA eval 30/10: marketplace-import named no folder, and the agent ran mdfind and find over the whole disk to find the
// imported project (and saw earlier builds' archives). The answer now gives projectDir.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('importLibrary answers the folder of the project it imported or found loaded', () => {
  const src = read('js/marketplace.js');
  assert.match(src, /var dirProject = importedProject \|\| C8O\.marketplace\.resolveProject\(importedProjectName\);\s*projectDir = dirProject != null \? String\(dirProject\.getDirPath\(\)\) : "";/);
  assert.match(src, /projectUrl: importedProjectName \+ "=" \+ usageUrl,\s*projectDir: projectDir,/);
});

test('the tool sequence returns projectDir, also on a failed import, and keeps its YAML key spaces', () => {
  const yaml = read('_c8oProject/sequences/tools_marketplace_import.yaml');
  assert.match(yaml, /  ↓projectDir \[steps\.JsonFieldStep-1793330000001\]: \n    comment: Folder of the imported project on disk\.\n    key: \n/);
  assert.match(yaml, /→→: 'marketplaceImportResult && marketplaceImportResult\.projectDir \? marketplaceImportResult\.projectDir : ""'/);
  assert.match(yaml, /projectUrl: "",\n\s*projectDir: "",/);
});
