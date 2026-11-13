const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The Bridge gives each conversation a temporary folder, <workspace>/.agent-tmp/<conversation>, and names it at each turn.
// An agent wrote its payloads at the workspace root (workspace/_mcp_payloads/app_js.txt, PipelineCrm3 13/11), as the guides
// said. Where the projects are in <workspace>/projects (Electron Studio, servers), that folder is outside the projects
// workspace: batch-call callsFile and project-js-set contentFile read it too, and nothing else of the workspace
// (configuration, keys). The Bridge no longer offers browser_run_code_unsafe: no guide sends the agent to it.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('callsFile and contentFile read the projects workspace and the temporary folder of a conversation only', () => {
  const tempRoot = /new (?:java\.io\.)?File\(String\(Packages\.com\.twinsoft\.convertigo\.engine\.Engine\.USER_WORKSPACE_PATH\), "\.agent-tmp"\)\.getCanonicalFile\(\)/;
  const batch = read('js/tools_batch_call.js');
  assert.match(batch, tempRoot);
  assert.match(batch, /if \(!file\.toPath\(\)\.startsWith\(root\.toPath\(\)\) && !file\.toPath\(\)\.startsWith\(agentTmp\.toPath\(\)\)\) \{/);
  const jsSet = read('_c8oProject/sequences/tools_project_js_set.yaml');
  assert.match(jsSet, tempRoot);
  assert.match(jsSet, /if \(!sourceFile\.toPath\(\)\.startsWith\(wsRoot\.toPath\(\)\) && !sourceFile\.toPath\(\)\.startsWith\(agentTmp\.toPath\(\)\)\) \{ throw/);
  // The workspace root itself stays refused.
  assert.doesNotMatch(batch + jsSet, /startsWith\(new (?:java\.io\.)?File\(String\(Packages\.com\.twinsoft\.convertigo\.engine\.Engine\.USER_WORKSPACE_PATH\)\)/);
});

test('the guides send payloads to the temporary folder, and never to browser_run_code_unsafe', () => {
  const texts = fs.readdirSync(path.join(root, 'resources')).filter(f => /\.(md|json)$/.test(f)).map(f => read('resources/' + f))
    .concat(['js/schema_overrides.js', 'js/resources.js', 'js/setup_common.js', 'js/setup_vibe.js', 'TOOLS.md'].map(read))
    .concat(fs.readdirSync(path.join(root, '_c8oProject/sequences')).map(f => read('_c8oProject/sequences/' + f)));
  const all = texts.join('\n');
  assert.doesNotMatch(all, /browser_run_code_unsafe/);
  assert.doesNotMatch(all, /_mcp_payloads/);
  assert.match(read('resources/convertigo_common_skill.md'), /in the temporary folder of this conversation \(each turn names it: `Temporary folder of this conversation: <path>`/);
});
