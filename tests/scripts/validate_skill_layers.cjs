#!/usr/bin/env node
/*
 * Validates the three-layer skill architecture:
 *   layer 1 - a short per-harness bootstrap in js/setup_common.js
 *   layer 2 - one common skill in resources/convertigo_common_skill.md
 *   layer 3 - the specialised guides, left as MCP resources
 *
 * Runs offline: the Convertigo file reads are stubbed with plain fs reads.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const COMMON_SKILL = "resources/convertigo_common_skill.md";
const BOOTSTRAP_LINE_BUDGET = 30;
const GENERATORS = ["js/setup_codex.js", "js/setup_vibe.js", "js/setup_claude.js"];

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function stripIncludes(source) {
  return source.replace(/^include\([^\n]+\);\s*$/gm, "");
}

function createSandbox(overrides) {
  const files = overrides || {};
  const sandbox = {
    C8O: { util: {} },
    JSON: JSON,
    console: console,
    include: function () {}
  };
  sandbox.c8oReadCatalogFile = function (folder, name) {
    const relative = String(folder) + "/" + String(name);
    if (Object.prototype.hasOwnProperty.call(files, relative)) {
      return files[relative];
    }
    return read(relative);
  };
  vm.createContext(sandbox);
  vm.runInContext(stripIncludes(read("js/guidance_version.js")), sandbox, { filename: "guidance_version.js" });
  vm.runInContext(stripIncludes(read("js/setup_common.js")), sandbox, { filename: "setup_common.js" });
  return sandbox;
}

function buildVibeSkill(sandbox, mcpUrl) {
  let source = stripIncludes(read("js/setup_vibe.js"));
  source = source.slice(0, source.lastIndexOf("var setupVibeResult"));
  source = source.replace(
    /\}\)\(\);\s*$/,
    "C8O.setupVibe._test = { buildSkillMarkdown: buildSkillMarkdown, buildAgentsMarkdown: buildAgentsMarkdown };}());"
  );
  vm.runInContext(source, sandbox, { filename: "setup_vibe.js" });
  return sandbox.C8O.setupVibe._test.buildSkillMarkdown(mcpUrl);
}

// 1. The common skill exists and every generator installs it through the
//    shared module.
assert.ok(fs.existsSync(path.join(root, COMMON_SKILL)), "Missing " + COMMON_SKILL);
assert.match(read("js/setup_common.js"), /convertigo_common_skill\.md/);
const harnessOfGenerator = {
  "js/setup_codex.js": "codex",
  "js/setup_vibe.js": "vibe",
  "js/setup_claude.js": "claude"
};
for (const generator of GENERATORS) {
  const source = read(generator);
  const harness = harnessOfGenerator[generator];
  assert.ok(
    source.includes('C8O.setupCommon.buildSkillMarkdown("' + harness + '"'),
    generator + " does not build its skill from the shared common skill"
  );
}

const sandbox = createSandbox();
const setupCommon = sandbox.C8O.setupCommon;

// 2. Every harness bootstrap stays short, including the generic one, and the
//    generic bootstrap carries an explicit warning.
for (const harnessId of setupCommon.harnessIds()) {
  const lines = setupCommon.bootstrapLines(harnessId);
  assert.ok(lines.length > 0, "Harness " + harnessId + " has no bootstrap");
  assert.ok(
    lines.length <= BOOTSTRAP_LINE_BUDGET,
    "Harness " + harnessId + " bootstrap is " + lines.length + " lines, budget is " + BOOTSTRAP_LINE_BUDGET
  );
}
assert.match(setupCommon.bootstrapLines("generic").join("\n"), /WARNING/);
assert.strictEqual(setupCommon.harness("something-else").id, "generic");

// Harness-specific facts must live in the bootstrap, not in the common skill.
const commonSkillText = read(COMMON_SKILL);
for (const marker of ["Convertigo_", "mcp__convertigo__", "~/.codex", "~/.vibe", "CLAUDE_CONFIG_DIR"]) {
  assert.ok(
    !commonSkillText.includes(marker),
    "Harness-specific marker " + marker + " leaked into the common skill"
  );
}
// Layer 3 stays MCP resources: a harness that cannot read them natively must
// either document the requestable fallback or receive copies of the very same
// resource files at install time.
assert.strictEqual(typeof setupCommon.copyResourceSkills, "function");
assert.ok(setupCommon.resourceSkillFiles().length > 5, "No specialised guide found in the resources index");
for (const harnessId of setupCommon.harnessIds()) {
  const harness = setupCommon.harness(harnessId);
  if (harness.readsMcpResources === true) {
    continue;
  }
  assert.ok(
    harness.copyResourceSkills === true ||
      setupCommon.bootstrapLines(harnessId).join("\n").includes("mcp_resources_read"),
    "Harness " + harnessId + " cannot reach the specialised guides"
  );
}

assert.match(setupCommon.bootstrapLines("vibe").join("\n"), /Convertigo_/);
assert.match(setupCommon.bootstrapLines("claude").join("\n"), /mcp__convertigo__/);

// 3. No large duplicated paragraph remains between the three generators.
function longLines(source) {
  const result = new Set();
  for (const line of source.split("\n")) {
    const text = line.trim();
    if (text.length >= 120) {
      result.add(text);
    }
  }
  return result;
}
const generatorLongLines = GENERATORS.map((generator) => ({ generator, lines: longLines(read(generator)) }));
for (let i = 0; i < generatorLongLines.length; i++) {
  for (let j = i + 1; j < generatorLongLines.length; j++) {
    for (const line of generatorLongLines[i].lines) {
      assert.ok(
        !generatorLongLines[j].lines.has(line),
        "Duplicated paragraph between " +
          generatorLongLines[i].generator +
          " and " +
          generatorLongLines[j].generator +
          ": " +
          line.slice(0, 80)
      );
    }
  }
}
// Skill prose belongs to the Markdown source, not to the generators. Only the
// no-code skill freshness injection may still emit Markdown bullets.
const PROSE_LINE_BUDGET = 12;
for (const generator of GENERATORS) {
  const prose = read(generator)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^["'](?:- |#|\d+\. )/.test(line));
  assert.ok(
    prose.length <= PROSE_LINE_BUDGET,
    generator + " still carries " + prose.length + " hard-coded skill prose lines (budget " + PROSE_LINE_BUDGET + ")"
  );
}

// 4. The guidance version is a content fingerprint: stable for identical
//    content, different as soon as the common skill changes.
const version = sandbox.C8O.MCP_GUIDANCE_VERSION;
assert.match(version, /^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[a-z-]+\.[0-9a-f]{16}$/);
assert.strictEqual(createSandbox().C8O.MCP_GUIDANCE_VERSION, version, "Guidance version is not stable");
const mutated = createSandbox({ "resources/convertigo_common_skill.md": commonSkillText + "\n- extra rule.\n" });
assert.notStrictEqual(mutated.C8O.MCP_GUIDANCE_VERSION, version, "Guidance version did not follow the common skill");
const mutatedBootstrap = createSandbox({
  "js/setup_common.js": read("js/setup_common.js").replace("// Per-harness bootstrap.", "// Per-harness bootstrap (edited).")
});
assert.notStrictEqual(mutatedBootstrap.C8O.MCP_GUIDANCE_VERSION, version, "Guidance version did not follow the bootstraps");

// 5. The generated Vibe skill carries the bootstrap, the common skill and the
//    guidance version line the agent bridge parses.
const mcpUrl = "http://localhost:18080/convertigo/api/mcp";
const vibeSkill = buildVibeSkill(sandbox, mcpUrl);
assert.match(vibeSkill, /^---\nname: convertigo-vibe-generalist\n/);
assert.ok(vibeSkill.includes(setupCommon.bootstrapLines("vibe")[0]), "Vibe bootstrap missing from the generated skill");
assert.ok(vibeSkill.includes("## MCP-first rule"), "Common skill missing from the generated skill");
assert.ok(vibeSkill.includes("## Task routes"), "Task routes missing from the generated skill");
assert.ok(vibeSkill.includes("- `new-standard-crud`:"), "Route table was not expanded");
assert.ok(vibeSkill.includes("${my.symbol=defaultValue}"), "Symbol rule missing from the generated skill");
assert.ok(vibeSkill.includes("- Expected local MCP entry: `" + mcpUrl + "`"), "MCP endpoint missing");
assert.doesNotMatch(vibeSkill, /\{\{[A-Z_]+\}\}/, "Unresolved placeholder in the generated skill");
const guidanceLine = /^- Skill guidance version:\s*`([^`]+)`\./m.exec(vibeSkill);
assert.ok(guidanceLine !== null, "The agent bridge guidance version line is missing");
assert.strictEqual(guidanceLine[1], version);
assert.ok(vibeSkill.includes("`_setupVibe`"), "Vibe skill should point at its own setup sequence");
assert.ok(!vibeSkill.includes("`_setupCodex`"), "Vibe skill should not point at the Codex setup sequence");

// The same common body is installed by every harness.
const commonBody = setupCommon.commonSkillBody("vibe");
assert.strictEqual(
  commonBody.replace(/`_setupVibe`/g, "X"),
  setupCommon.commonSkillBody("codex").replace(/`_setupCodex`/g, "X"),
  "Codex and Vibe do not share the same common skill body"
);
assert.strictEqual(
  commonBody.replace(/`_setupVibe`/g, "X"),
  setupCommon.commonSkillBody("claude").replace(/`_setupClaude`/g, "X"),
  "Claude and Vibe do not share the same common skill body"
);

console.log(JSON.stringify({
  status: "ok",
  validated: "skill-layers",
  guidanceVersion: version,
  bootstrapLines: setupCommon.harnessIds().reduce((acc, id) => {
    acc[id] = setupCommon.bootstrapLines(id).length;
    return acc;
  }, {}),
  generatedSkillLines: {
    vibe: vibeSkill.split("\n").length
  }
}, null, 2));
