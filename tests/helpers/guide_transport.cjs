// Offline adapter for the production resource resolver and the two public read
// paths. File IO is stubbed; routing, aliases and Markdown are production code.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function resources() {
  const sandbox = {
    C8O: { util: { toTrimmedString: v => String(v || '').trim() }, project: {},
      MCP_GUIDANCE_VERSION: '2026-09-18.skill-layers.0123456789abcdef' },
    include() {},
    c8oReadCatalogFile: (folder, file) => read(folder + '/' + file),
    c8oLoadCatalogIndex: (folder, file, opts) => JSON.parse(read(folder + '/' + file)).map(opts.normalize),
    c8oFindCatalogEntry: (entries, key, value) => entries.find(e => String(e[key]).toLowerCase() === String(value).toLowerCase())
  };
  vm.createContext(sandbox);
  vm.runInContext(read('js/resources.js'), sandbox);
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
module.exports = { root, read, resources, envelopes, sizes };
