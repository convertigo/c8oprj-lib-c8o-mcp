/*
 * Shared skill generator for the Convertigo agent harnesses.
 *
 * Three layers:
 *  1. a short per-harness bootstrap defined here (tool naming, transport
 *     quirks, resource reads, file locations),
 *  2. one common Convertigo skill stored as Markdown in
 *     resources/convertigo_common_skill.md and installed identically by
 *     _setupCodex, _setupVibe and _setupClaude,
 *  3. the specialised guides, which stay MCP resources read on demand.
 *
 * This file is part of the guidance fingerprint (see js/guidance_version.js),
 * so any change to a bootstrap automatically changes C8O.MCP_GUIDANCE_VERSION.
 */

if (typeof C8O === "undefined" || typeof C8O.project === "undefined") {
  include("js/util.js");
}
include("js/catalog_loader.js");
include("js/guidance_version.js");

C8O.setupCommon = C8O.setupCommon || {};

(function () {
  var COMMON_SKILL_FILE = "convertigo_common_skill.md";
  var TASK_ROUTES_FILE = "convertigo_task_routes.json";

  function trim(value) {
    return value == null ? "" : String(value).replace(/^\s+|\s+$/g, "");
  }

  // Per-harness bootstrap. Keep each `bootstrap` array short: only what is
  // specific to the harness. Everything else belongs to the common skill.
  var HARNESSES = {
    codex: {
      id: "codex",
      label: "OpenAI Codex CLI",
      skillSlug: "convertigo-generalist",
      setupSequence: "_setupCodex",
      description: "Bootstrap Codex for general Convertigo work. Use it to discover Convertigo MCP guides first, choose between exploratory work and the CRUD fast path, and apply the correct naming and viewer rules.",
      readsMcpResources: true,
      copyResourceSkills: false,
      bootstrap: [
        "- Harness: OpenAI Codex CLI. The Convertigo MCP server is declared in `~/.codex/config.toml` under `[mcp_servers.convertigo]`; this skill lives in `~/.codex/skills/convertigo-generalist/SKILL.md`.",
        "- Codex exposes MCP tools under their plain MCP name on the `convertigo` server, so the tool ids used in this skill (`project-list`, `databaseobject-tree-apply`, `batch-call`, ...) are the names you call.",
        "- Codex reads MCP resources natively. Read a `convertigo://...` guide directly with the MCP resource read of the `convertigo` server; do not list catalogs when the route already names the URI.",
        "- Codex may issue several MCP calls in one turn. Group independent or ordered source-object changes into one `batch-call` with `{calls:[{tool:\"databaseobject-tree-apply\",arguments:{...}}],onError:\"stop\",optimizeMutations:true}`; the optimized batch performs one final refresh, save, and mobile-builder notification. Nested `calls[].tool` values are plain MCP tool ids. Keep the default compact response and use `responseDetail:\"full\"` only to diagnose a batch failure.",
        "- Named core tools in this skill are already routed. Do not inspect `ALL_TOOLS` to rediscover `batch-call`, `mobile-builder-open`, `log-view`, or browser tools.",
        "- Browser proof uses the managed Playwright MCP server against the Studio viewer. The known-good fast check is `playwright.browser_tabs({action:\"list\"})`, then `playwright.browser_find({text:\"<visible text>\"})`, and `playwright.browser_evaluate({function:\"...\"})` only when DOM state or timing must be measured.",
        "- If Codex is not yet configured for Convertigo, run the local Studio sequence `_setupCodex` from the lib_ConvertigoMCP project."
      ]
    },
    vibe: {
      id: "vibe",
      label: "Mistral Vibe CLI",
      skillSlug: "convertigo-vibe-generalist",
      setupSequence: "_setupVibe",
      description: "Route Mistral Vibe Convertigo work to the smallest provider-neutral MCP resource set and keep all project authoring inside Convertigo MCP tools.",
      readsMcpResources: false,
      copyResourceSkills: false,
      bootstrap: [
        "- Harness: Mistral Vibe CLI (ACP). The Convertigo MCP server is declared in `~/.vibe/config.toml` as `[[mcp_servers]]` with `name = \"Convertigo\"`; this skill lives in `~/.vibe/skills/convertigo-vibe-generalist/SKILL.md`.",
        "- Vibe prefixes MCP tools with the server name: every tool id used in this skill is called as `Convertigo_<tool-id>`, for example `Convertigo_databaseobject-tree-apply` or `Convertigo_project-save`.",
        "- The Convertigo MCP transport is serial in Vibe. Issue exactly one `Convertigo_*` tool call per assistant message, including read-only calls. Vibe executes several tool calls of one message concurrently, and concurrent calls can reset the shared transport and turn independent operations into long `TaskGroup` failures.",
        "- Vibe has no native MCP resource read. Read an exact guide URI with `Convertigo_requestable-execute` using `requestable:\"lib_ConvertigoMCP.mcp_resources_read\"` and `variables:{uri:\"<exact-uri>\"}`. Use `variables.uri`, never `variables.path`, and never pass an external HTTP URL to that requestable.",
        "- MCP arguments are structured values, not JSON strings: pass `tree` as an object and `calls` as an array, never as serialized text. A SmartSource `value` must be plain JSON text starting with a quoted `filter` key; if a readback shows backslash-escaped quotes, the value was double escaped and must be patched with unescaped JSON. Empty generated bindings such as `[(ngModel)]=\"\"` are escaping failures, not component failures.",
        "- Prefer direct `Convertigo_databaseobject-tree-apply` calls over `Convertigo_batch-call` for dependent mutations. If a batch is genuinely independent, each nested `calls[].tool` must be the unprefixed MCP tool id such as `databaseobject-tree-apply`, not the Vibe-exposed name.",
        "- Browser proof is available only when a browser-control MCP server is configured for this Vibe home; otherwise report the result as implemented but functionally unvalidated.",
        "- Keep isolated runs isolated: a task-local `VIBE_HOME`, `enabled_skills = [\"convertigo-vibe-generalist\"]`, no copied API keys or `.env` files, and no edits to the Codex `convertigo-generalist` skill. When restricting tools with `--enabled-tools`, repeat the flag once per tool instead of passing a comma-separated list.",
        "- Rerun `_setupVibe` when the MCP endpoint or the guidance version changes."
      ]
    },
    claude: {
      id: "claude",
      label: "Claude Code",
      skillSlug: "convertigo-generalist",
      setupSequence: "_setupClaude",
      description: "Bootstrap Claude Code for general Convertigo work. Use it to discover Convertigo MCP guides first, choose between exploratory work and the CRUD fast path, and apply the correct naming and viewer rules.",
      readsMcpResources: true,
      copyResourceSkills: false,
      bootstrap: [
        "- Harness: Claude Code. The Convertigo MCP server is declared as `convertigo` in the `.claude.json` of the active `CLAUDE_CONFIG_DIR`; this skill lives in `<CLAUDE_CONFIG_DIR>/skills/convertigo-generalist/SKILL.md`.",
        "- Claude Code namespaces MCP tools: every tool id used in this skill is called as `mcp__convertigo__<tool-id>`, for example `mcp__convertigo__project-list` or `mcp__convertigo__batch-call`.",
        "- Claude Code reads MCP resources natively. Read a `convertigo://...` guide with the MCP resource tool of the `convertigo` server instead of guessing its content.",
        "- Claude Code may issue several MCP calls in one turn. Group independent or ordered source-object changes into one `batch-call`; nested `calls[].tool` values are plain MCP tool ids without the `mcp__convertigo__` prefix.",
        "- Studio viewer automation is not available in a Claude Code session unless a browser-control MCP server is configured separately. When browser proof is impossible, report the result as implemented but functionally unvalidated.",
        "- If Claude Code is not yet configured for Convertigo, run the local Studio sequence `_setupClaude` from the lib_ConvertigoMCP project."
      ]
    },
    generic: {
      id: "generic",
      label: "Unknown harness",
      skillSlug: "convertigo-generalist",
      setupSequence: "_setupCodex",
      description: "Bootstrap an unidentified coding agent for general Convertigo work through the Convertigo MCP server.",
      readsMcpResources: false,
      copyResourceSkills: true,
      bootstrap: [
        "- Harness: unknown. WARNING: this bootstrap was generated without a harness-specific adapter, so tool naming, transport limits, and resource reads were not verified for this agent.",
        "- Discover the real Convertigo tool names once from the live catalog (`tools/list` or the host tool list) before the first call. Tool ids in this skill are the plain MCP names; your host may prefix or namespace them.",
        "- If the host can read MCP resources, read `convertigo://...` guides directly. Otherwise read them through the tool `requestable-execute` with `requestable:\"lib_ConvertigoMCP.mcp_resources_read\"` and `variables:{uri:\"<exact-uri>\"}`, or from the specialised skill files copied next to this skill at install time.",
        "- Assume the MCP transport is serial until proven otherwise: issue one Convertigo tool call per assistant message.",
        "- Ask the user before the first project mutation, and report which harness you are so a dedicated bootstrap can be added to lib_ConvertigoMCP."
      ]
    }
  };

  function readProjectFile(folder, name) {
    return String(c8oReadCatalogFile(folder, name));
  }

  C8O.setupCommon.readProjectFile = readProjectFile;

  C8O.setupCommon.harness = function (harnessId) {
    var key = trim(harnessId).toLowerCase();
    return HARNESSES[key] || HARNESSES.generic;
  };

  C8O.setupCommon.harnessIds = function () {
    var ids = [];
    for (var key in HARNESSES) {
      if (Object.prototype.hasOwnProperty.call(HARNESSES, key)) {
        ids.push(key);
      }
    }
    return ids;
  };

  C8O.setupCommon.bootstrapLines = function (harnessId) {
    return C8O.setupCommon.harness(harnessId).bootstrap.slice(0);
  };

  C8O.setupCommon.commonSkillTemplate = function () {
    return C8O.setupCommon.readProjectFile("resources", COMMON_SKILL_FILE);
  };

  function routeList(values) {
    var items = values && values.length ? values : [];
    var formatted = [];
    for (var i = 0; i < items.length; i++) {
      formatted.push("`" + trim(items[i]) + "`");
    }
    return formatted.join(" -> ");
  }

  C8O.setupCommon.taskRouteLines = function () {
    var catalog = JSON.parse(C8O.setupCommon.readProjectFile("resources", TASK_ROUTES_FILE));
    if (!catalog || !catalog.routes || !catalog.routes.length) {
      throw new Error("Convertigo task route catalog has no routes.");
    }
    var lines = [];
    for (var i = 0; i < catalog.routes.length; i++) {
      var route = catalog.routes[i] || {};
      if (!trim(route.id).length || !trim(route.match).length || !route.required || !route.required.length) {
        throw new Error("Invalid Convertigo task route at index " + i + ".");
      }
      var line = "- `" + route.id + "`: " + trim(route.match) + ". Read " + routeList(route.required) + ".";
      if (route.fallback && route.fallback.length) {
        line += " Only if blocked, continue with " + routeList(route.fallback) + ".";
      }
      lines.push(line);
    }
    return lines;
  };

  C8O.setupCommon.commonSkillBody = function (harnessId) {
    var harness = C8O.setupCommon.harness(harnessId);
    var values = {
      GUIDANCE_VERSION: String(C8O.MCP_GUIDANCE_VERSION),
      SETUP_SEQUENCE: harness.setupSequence,
      TASK_ROUTES: C8O.setupCommon.taskRouteLines().join("\n")
    };
    var text = C8O.setupCommon.commonSkillTemplate().replace(/\{\{([A-Z_]+)\}\}/g, function (match, key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match;
    });
    return text.replace(/\s+$/, "");
  };

  C8O.setupCommon.buildSkillMarkdown = function (harnessId, mcpUrl) {
    var harness = C8O.setupCommon.harness(harnessId);
    var header = [
      "---",
      "name: " + harness.skillSlug,
      "description: " + harness.description,
      "---",
      "",
      "# Convertigo Generalist (" + harness.label + ")",
      "",
      "Layer 1 of this skill is the harness bootstrap below. Layer 2 is the common Convertigo skill, identical for every harness. Layer 3 are the specialised guides, read on demand as MCP resources.",
      "",
      "## Harness bootstrap",
      ""
    ].concat(C8O.setupCommon.bootstrapLines(harnessId)).concat([
      "",
      ""
    ]);
    var footer = [
      "",
      "## Local MCP endpoint",
      "",
      "- Expected local MCP entry: `" + trim(mcpUrl) + "`",
      "- Rerun `" + harness.setupSequence + "` for the current MCP endpoint when the endpoint or the guidance version changes.",
      ""
    ];
    return header.join("\n") + C8O.setupCommon.commonSkillBody(harnessId) + "\n" + footer.join("\n");
  };

  // Layer 3 fallback: harnesses that cannot read MCP resources receive the very
  // same guide files as local skill files. Same source, no fork.
  C8O.setupCommon.resourceSkillFiles = function () {
    var index = JSON.parse(C8O.setupCommon.readProjectFile("resources", "resources_index.json"));
    var files = [];
    for (var i = 0; i < index.length; i++) {
      var entry = index[i];
      if (entry && trim(entry.file).length && /\.md$/i.test(trim(entry.file))) {
        files.push({ uri: trim(entry.uri), file: trim(entry.file) });
      }
    }
    return files;
  };

  C8O.setupCommon.copyResourceSkills = function (skillsDir, harnessId, dryRun, writeManagedFile) {
    var harness = C8O.setupCommon.harness(harnessId);
    var copied = [];
    if (harness.copyResourceSkills !== true) {
      return copied;
    }
    var File = Packages.java.io.File;
    var files = C8O.setupCommon.resourceSkillFiles();
    for (var i = 0; i < files.length; i++) {
      var entry = files[i];
      var slug = trim(entry.file).replace(/^.*[\\\/]/, "").replace(/\.md$/i, "").replace(/_/g, "-");
      var target = new File(new File(skillsDir, slug), "SKILL.md");
      var content = C8O.setupCommon.readProjectFile("resources", entry.file);
      writeManagedFile(target, content, dryRun);
      copied.push(slug);
    }
    return copied;
  };
})();
