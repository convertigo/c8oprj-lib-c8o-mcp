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

// --- cross-project contract: the Bridge owns a url marked from_bridge=true ---
// lib_ConvertigoAgentBridge writes the managed config.toml first, then calls this
// setup. A url it marked must survive byte for byte, otherwise its cache-busting
// `toolsRevision` and its `descriptorVersion` never reach the running Vibe.
const bridgeUrl =
  "http://localhost:18082/convertigo/api/mcp?jsonOnly=false&from_bridge=true" +
  "&descriptorVersion=2026-09-04.vibe-serial-transport-v1&toolsRevision=a1b2c3";
const bridgeConfig = [
  'active_model = "vibe-thinking"',
  "",
  "[[mcp_servers]]",
  'name = "Convertigo"',
  'transport = "http"',
  'url = "' + bridgeUrl + '"',
  "tool_timeout_sec = 180",
  "",
  "[mcp_servers.auth]",
  'type = "static"',
  'api_key_env = "CONVERTIGO_MCP_TOKEN"',
  'api_key_header = "Authorization"',
  'api_key_format = "Bearer {token}"',
  ""
].join("\n");

const bridgeOwned = patchConfigToml(
  bridgeConfig,
  "http://localhost:18080/convertigo/api/mcp?jsonOnly=true",
  "token-value",
  false,
  []
);
assert.match(
  bridgeOwned.text,
  new RegExp("^url = \"" + bridgeUrl.replace(/[.?*+^$[\]\\(){}|-]/g, "\\$&") + "\"$", "m"),
  "a Bridge-owned MCP url must be left untouched, parameters included"
);
assert.doesNotMatch(
  bridgeOwned.text,
  /^url = "http:\/\/localhost:18080/m,
  "the MCP setup must not add its own url next to the Bridge's"
);
// Everything else in the entry is still repaired.
assert.match(bridgeOwned.text, /^\[mcp_servers\.auth\]$/m);
assert.match(bridgeOwned.text, /headers = \{ [^\n]*Authorization = "Bearer token-value"/);
assert.match(bridgeOwned.text, /"X-Convertigo-Guidance-Version" = "2026-09-04\.vibe-serial-transport-v1"/);
assert.match(bridgeOwned.text, /^\[tools\./m, "tool permissions are still installed");

// Degrade safely: an old Bridge writes no marker, so the entry is repaired as before.
const unmarkedConfig = bridgeConfig.replace("&from_bridge=true", "");
const unmarked = patchConfigToml(
  unmarkedConfig,
  "http://localhost:18080/convertigo/api/mcp?jsonOnly=true",
  "token-value",
  false,
  []
);
assert.match(
  unmarked.text,
  /^url = "http:\/\/localhost:18080\/convertigo\/api\/mcp\?jsonOnly=true"$/m,
  "without the marker the MCP setup keeps repairing a stale or hand-written url"
);

// --- X-Convertigo-No-Log: true writes it, false removes it, undefined keeps it ---
const mcpUrl = "http://localhost:18080/convertigo/api/mcp?jsonOnly=true";
const noLogHeader = /"X-Convertigo-No-Log" = "true"/;
const quiet = patchConfigToml("", mcpUrl, "token-value", true, [], true);
assert.match(quiet.text, /headers = \{ [^\n]*"X-Convertigo-No-Log" = "true"/);
assert.match(quiet.text, /headers = \{ [^\n]*Authorization = "Bearer token-value"/);
const quietRepaired = patchConfigToml(quiet.text, mcpUrl, "token-value", false, [], true);
assert.equal(quietRepaired.text.match(/X-Convertigo-No-Log/g).length, 1, "the header is never duplicated");
assert.equal(patchConfigToml(quietRepaired.text, mcpUrl, "token-value", false, [], true).status, "unchanged");
assert.doesNotMatch(patchConfigToml("", mcpUrl, "token-value", true, [], false).text, noLogHeader);

const quietPatched = patchConfigToml(migrated.text, mcpUrl, "", false, [], true);
assert.match(quietPatched.text, noLogHeader, "an existing entry gets the header");
assert.match(quietPatched.text, /X-Custom-Header = "preserved"/);
const loud = patchConfigToml(quietPatched.text, mcpUrl, "", false, [], false);
assert.doesNotMatch(loud.text, noLogHeader, "mcpNoLog=false removes the header");
assert.match(loud.text, /X-Custom-Header = "preserved"/);
assert.match(patchConfigToml(quietPatched.text, mcpUrl, "", false, []).text, noLogHeader,
  "without a decision the header is left as found");

// The Bridge chose its own header: the setup keeps it, present or absent.
const bridgeQuiet = bridgeConfig.replace('api_key_format = "Bearer {token}"',
  'api_key_format = "Bearer {token}"\nheaders = { "X-Convertigo-No-Log" = "true" }');
assert.match(patchConfigToml(bridgeQuiet, mcpUrl, "", false, [], false).text, noLogHeader,
  "a Bridge-owned entry keeps the header the Bridge wrote");
assert.doesNotMatch(patchConfigToml(bridgeConfig, mcpUrl, "", false, [], true).text, noLogHeader,
  "a Bridge-owned entry without the header does not get one");

console.log(JSON.stringify({ status: "ok", validated: "setup-vibe-config" }));
