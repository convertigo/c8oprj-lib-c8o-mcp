#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const batchSource = fs.readFileSync(path.join(root, "js/tools_batch_call.js"), "utf8");
const schemaSource = fs.readFileSync(path.join(root, "js/schema_overrides.js"), "utf8");
const sequenceSource = fs.readFileSync(path.join(root, "_c8oProject/sequences/tools_batch_call.yaml"), "utf8");

assert.match(batchSource, /var revealRequested = C8O\.util\.toBoolean\(params\.reveal, false\) === true/);
assert.match(batchSource, /isRevealSequence\(sequenceName\)/);
assert.match(batchSource, /mutationFinalize\.reveal = C8O\.dbo\.revealStudioTreeByQName/);
assert.match(batchSource, /mutationTouchedQNames\[mutationTouchedQNames\.length - 1\]/);
assert.match(batchSource, /Batch call completed with warnings\./);
assert.match(batchSource, /function compactMutationPayload\(payload\)/);
assert.match(batchSource, /var responseDetail = normalizeResponseDetail\(params\.responseDetail\)/);
assert.match(batchSource, /compactRefs\[id\] = \{/);
assert.match(batchSource, /callIndex: matchingReport\.index/);
assert.match(schemaSource, /description: "Set true when host UI reveal mode is enabled\. The batch propagates reveal/);
assert.match(schemaSource, /enum: \["compact", "full"\]/);
assert.match(schemaSource, /reveal: nullableSchema\(revealOutputSchema\(\)\)/);
assert.match(sequenceSource, /reveal: \(typeof reveal !== "undefined"\) \? reveal : false/);
assert.match(sequenceSource, /responseDetail: \(typeof responseDetail !== "undefined"\) \? responseDetail : "compact"/);
assert.match(sequenceSource, /↓reveal \[variables\.RequestableVariable-/);
assert.match(sequenceSource, /↓responseDetail \[variables\.RequestableVariable-/);

// The compact answer of a generator keeps what tells the look of the app: the theme written and the badge colors read
// from the status words (31/10); ngx-theme-apply is compacted like the other generators.
assert.match(batchSource, /GENERATOR_SEQUENCES = \{[^}]*tools_ngx_page_create: true,\s*tools_ngx_theme_apply: true \}/);
assert.match(batchSource, /"created", "style", "theme", "preset", "mode", "badgeColors", "warnings", "errors"\]\.forEach/);

console.log("batch reveal and compact response contract tests passed");
