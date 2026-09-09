#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const databaseObjectSource = fs.readFileSync(path.join(root, "js/databaseobject.js"), "utf8");

assert.ok(databaseObjectSource.includes('"Invalid NGX SmartType mode \\"" + modeToken'));
assert.ok(databaseObjectSource.includes('Use PLAIN, SCRIPT, or SOURCE; JavaScript expressions use SCRIPT, not JS.'));
assert.doesNotMatch(
  databaseObjectSource,
  /catch \(_ignoreMode\) \{\s*mode = Mode\.PLAIN;/
);
assert.ok(databaseObjectSource.includes(String.raw`NGX SmartType value. Use {mode:\"PLAIN\",value:\"text\"}`));
assert.ok(databaseObjectSource.includes("the source resolves to an empty Angular expression"));
assert.match(databaseObjectSource, /computedSource = String\(smart\.getValue\(\)\)/);

console.log("NGX SmartType contract tests passed");
