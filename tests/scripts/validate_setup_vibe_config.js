#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
let source = fs.readFileSync(path.join(root, "js/setup_vibe.js"), "utf8");
source = source.replace(/^include\([^\n]+\);\s*$/gm, "");
source = source.slice(0, source.lastIndexOf("var setupVibeResult"));
source = source.replace(
  /\}\)\(\);\s*$/,
  "C8O.setupVibe._test = { patchConfigToml: patchConfigToml };}());"
);

const sandbox = {
  C8O: {
    MCP_GUIDANCE_VERSION: "2026-09-04.vibe-serial-transport-v1",
    util: {}
  }
};
vm.runInNewContext(source, sandbox, { filename: "setup_vibe.js" });

const patchConfigToml = sandbox.C8O.setupVibe._test.patchConfigToml;
const invalidConfig = [
  'active_model = "vibe-thinking"',
  "",
  "[[mcp_servers]]",
  'name = "Convertigo"',
  'transport = "http"',
  'url = "http://localhost:18080/convertigo/api/mcp?jsonOnly=true"',
  "tool_timeout_sec = 180",
  "",
  "[mcp_servers.headers]",
  'X-Custom-Header = "preserved"',
  'X-Convertigo-Guidance-Version = "old"',
  "",
  "[mcp_servers.auth]",
  'type = "static"',
  'api_key_env = "CONVERTIGO_MCP_TOKEN"',
  'api_key_header = "Authorization"',
  'api_key_format = "Bearer {token}"',
  "",
  "[tools.read]",
  'permission = "always"',
  ""
].join("\n");

const migrated = patchConfigToml(
  invalidConfig,
  "http://localhost:18080/convertigo/api/mcp?jsonOnly=true",
  "",
  false,
  []
);
assert.equal(migrated.status, "updated");
assert.doesNotMatch(migrated.text, /^\[mcp_servers\.headers\]$/m);
assert.doesNotMatch(migrated.text, /^\[mcp_servers\.auth\.headers\]$/m);
assert.match(migrated.text, /^\[mcp_servers\.auth\]$/m);
assert.match(migrated.text, /^type = "static"$/m);
assert.match(migrated.text, /^api_key_env = "CONVERTIGO_MCP_TOKEN"$/m);
assert.match(migrated.text, /headers = \{ [^\n]*X-Custom-Header = "preserved"/);
assert.match(migrated.text, /"X-Convertigo-Guidance-Version" = "2026-09-04\.vibe-serial-transport-v1"/);
assert.match(migrated.text, /^\[tools\.read\]$/m);

const repeated = patchConfigToml(
  migrated.text,
  "http://localhost:18080/convertigo/api/mcp?jsonOnly=true",
  "",
  false,
  []
);
assert.equal(repeated.status, "unchanged");
assert.equal(repeated.text, migrated.text);

const created = patchConfigToml(
  "",
  "http://localhost:18080/convertigo/api/mcp?jsonOnly=true",
  "token-value",
  true,
  []
);
assert.match(created.text, /^\[mcp_servers\.auth\]$/m);
assert.match(created.text, /headers = \{ [^\n]*Authorization = "Bearer token-value"/);
assert.ok(created.text.indexOf("[mcp_servers.auth]") < created.text.indexOf("headers = {"));

console.log(JSON.stringify({ status: "ok", validated: "setup-vibe-config" }));
