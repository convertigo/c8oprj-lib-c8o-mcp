#!/usr/bin/env node
// Run after editing a summary/drawer. Its hashes form part of the guidance
// version, so the installed skills are refreshed when moved instructions change.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { root, read } = require('../helpers/guide_transport.cjs');
const manifest = JSON.parse(read('resources/guide_drawers.json'));
const index = JSON.parse(read('resources/resources_index.json'));
const sha = file => crypto.createHash('sha256').update(read('resources/' + file)).digest('hex');
for (const guide of manifest) {
  guide.summarySha256 = sha(index.find(e => e.uri === guide.summaryUri).file);
  for (const drawer of guide.drawers) {
    const content = read('resources/' + drawer.file);
    const marker = '\n---\n\n';
    if (!content.includes(marker)) throw new Error('Missing drawer navigation separator: ' + drawer.file);
    drawer.bodyOffset = content.indexOf(marker) + marker.length;
    drawer.servedSha256 = sha(drawer.file);
  }
}
// Built-in summaries live in js/resources.js; their file-backed drawers still
// need content hashes in the index so editing one refreshes the guidance.
for (const entry of index.filter(e => e.parentUri === 'convertigo://capabilities')) entry.contentSha256 = sha(entry.file);
fs.writeFileSync(path.join(root, 'resources/guide_drawers.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'resources/resources_index.json'), JSON.stringify(index, null, 2) + '\n');
console.log('Updated ' + manifest.length + ' guide fingerprints.');
