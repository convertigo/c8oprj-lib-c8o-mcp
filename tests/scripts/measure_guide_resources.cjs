#!/usr/bin/env node
// Read-only inventory, including built-ins and aliases. Redirect stdout to keep
// a before/after snapshot; no Studio, Docker or benchmark is started.
const { resources, sizes } = require('../helpers/guide_transport.cjs');
const api = resources();
const inventory = api.c8oLoadResourcesIndex().map(entry => {
  const text = String(api.c8oReadResourceFile(entry));
  return { uri: entry.uri, file: entry.file || null, kind: entry.guidanceLevel || 'builtin',
    aliases: entry.aliases || [], characters: text.length, ...sizes(entry, text) };
});
console.log(JSON.stringify(inventory, null, 2));
