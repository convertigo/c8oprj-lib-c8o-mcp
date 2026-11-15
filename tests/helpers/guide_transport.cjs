// Offline adapter for the production resource resolver and the two public read
// paths. File IO is stubbed; routing, aliases and Markdown are production code.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function stepExpression(file, step) {
  const source = read(file);
  const at = source.indexOf('↓' + step + ' [steps.SimpleStep');
  if (at < 0) throw new Error('Missing step ' + step);
  const lines = source.slice(at).split('\n');
  const start = lines.findIndex(line => /^\s*expression: \|\s*$/.test(line));
  const indent = lines[start + 1].match(/^\s*/)[0];
  const body = [];
  for (let i = start + 1; i < lines.length && (lines[i].startsWith(indent) || !lines[i].trim()); i++) body.push(lines[i].slice(indent.length));
  return body.join('\n').trim().replace(/^'|'$/g, '').replace(/''/g, "'");
}
// Existing content-policy regressions follow moved prose through the migration
// manifest. Transport tests below still read exactly one resource at a time.
function guidanceText(sourceFile) {
  const manifest = JSON.parse(read('resources/guide_drawers.json'));
  const guide = manifest.find(g => 'resources/' + g.sourceFile === sourceFile);
  if (!guide) return read(sourceFile);
  return guide.drawers.map(d => read('resources/' + d.file).slice(d.bodyOffset) + '\n'.repeat(d.trailingSourceNewlines || 0)).join('');
}
function resources(readProjectFile = read) {
  const sandbox = {
    C8O: { util: { toTrimmedString: v => String(v || '').trim() }, project: {},
      MCP_GUIDANCE_VERSION: '2026-09-18.skill-layers.0123456789abcdef' },
    include() {},
    c8oReadCatalogFile: (folder, file) => readProjectFile(folder + '/' + file),
    c8oLoadCatalogIndex: (folder, file, opts) => JSON.parse(readProjectFile(folder + '/' + file)).map(opts.normalize),
    c8oFindCatalogEntry: (entries, key, value) => entries.find(e => String(e[key]).toLowerCase() === String(value).toLowerCase())
  };
  vm.createContext(sandbox);
  vm.runInContext(readProjectFile('js/resources.js'), sandbox);
  return sandbox;
}
function envelopes(entry, text) {
  // mcp_resources_read.Result and tools_requestable_execute._compactPayload.
  const resource = { contents: [{ uri: entry.uri, mimeType: entry.mimeType || 'text/plain', text }] };
  const value = { result: { requestable: 'lib_ConvertigoMCP.mcp_resources_read', status: 'ok', truncated: false,
    payload: { result: resource } } };
  const rpc = result => ({ jsonrpc: '2.0', id: 1, result });
  return {
    native: rpc(resource),
    jsonOnly: rpc({ structuredContent: value }),
    // jsonOnly=false, used by managed Bridge URLs: the JSON text is escaped
    // once more on the wire, beside the structured copy of the same value.
    tool: rpc({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value })
  };
}
function sizes(entry, text) {
  const wire = envelopes(entry, text);
  return Object.fromEntries(Object.entries(wire).map(([key, value]) => [key, JSON.stringify(value).length]));
}
module.exports = { root, read, resources, envelopes, sizes, stepExpression, guidanceText };
