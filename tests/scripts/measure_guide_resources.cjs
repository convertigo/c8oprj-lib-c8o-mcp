#!/usr/bin/env node
// Read-only inventory, including built-ins and aliases. Redirect stdout to keep
// a before/after snapshot; no Studio, Docker or benchmark is started.
// --ref <git-ref> reads an immutable Git snapshot without changing the checkout.
const { execFileSync } = require('node:child_process');
const { root, resources, sizes } = require('../helpers/guide_transport.cjs');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--ref')) {
  throw new Error('Usage: node tests/scripts/measure_guide_resources.cjs [--ref <git-ref>]');
}
let readSnapshot;
if (args.length) {
  const commit = execFileSync('git', ['rev-parse', '--verify', '--end-of-options', args[1] + '^{commit}'], { cwd: root, encoding: 'utf8' }).trim();
  readSnapshot = file => execFileSync('git', ['show', commit + ':' + file], { cwd: root, encoding: 'utf8' });
}
const api = resources(readSnapshot);
const inventory = api.c8oLoadResourcesIndex().map(entry => {
  const text = String(api.c8oReadResourceFile(entry));
  return { uri: entry.uri, file: entry.file || null, kind: entry.guidanceLevel || 'builtin',
    aliases: entry.aliases || [], characters: text.length, ...sizes(entry, text) };
});
console.log(JSON.stringify(inventory, null, 2));
