// Local Claude Code onboarding for lib_ConvertigoMCP.
// Generates the managed Convertigo skills inside a CLAUDE_CONFIG_DIR and, when
// requested, declares the Convertigo MCP server in that home's .claude.json.
if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.setupCodex = C8O.setupCodex || {};
C8O.setupCodex.autoRun = false;
include("js/setup_codex.js");

C8O.setupClaude = C8O.setupClaude || {};

(function () {
  var helpers = C8O.setupCodex._helpers;
  var trim = helpers.trim;
  var CLAUDE_STATE_FILE = ".claude.json";

  function resolveClaudeHome(input) {
    var File = Packages.java.io.File;
    var raw = trim(input);
    if (!raw.length) {
      raw = "~/.claude";
    }
    if (raw === "~") {
      raw = helpers.userHomeDirectory();
    } else if (raw.indexOf("~/") === 0 || raw.indexOf("~\\") === 0) {
      raw = helpers.userHomeDirectory() + raw.substring(1);
    }
    return new File(raw).getCanonicalFile();
  }

  function buildClaudeSkillMarkdown(mcpUrl) {
    return C8O.setupCommon.buildSkillMarkdown("claude", mcpUrl);
  }

  function buildClaudeNoCodeSkillMarkdown(mcpUrl) {
    return String(helpers.buildNoCodeSkillMarkdown(mcpUrl)).replace(/`_setupCodex`/g, "`_setupClaude`");
  }

  function parseJsonSafe(text, fallback) {
    try {
      var parsed = JSON.parse(String(text));
      return parsed === null || typeof parsed !== "object" ? fallback : parsed;
    } catch (_ignoreJson) {
      return fallback;
    }
  }

  function patchClaudeState(existingText, mcpUrl, mcpToken, warnings, enableFlow) {
    var state = parseJsonSafe(existingText, null);
    var created = state === null;
    if (state === null) {
      state = {};
    }
    if (!state.mcpServers || typeof state.mcpServers !== "object") {
      state.mcpServers = {};
    }
    var token = trim(mcpToken);
    var patchServer = function (name, url) {
      var previous = state.mcpServers[name] && typeof state.mcpServers[name] === "object" ? state.mcpServers[name] : {};
      var previousHeaders = previous.headers && typeof previous.headers === "object" ? previous.headers : {};
      var headers = {};
      for (var key in previousHeaders) {
        if (Object.prototype.hasOwnProperty.call(previousHeaders, key)) {
          headers[key] = previousHeaders[key];
        }
      }
      headers["X-Convertigo-Guidance-Version"] = C8O.MCP_GUIDANCE_VERSION;
      if (token.length) {
        headers.Authorization = "Bearer " + token;
      } else if (!trim(headers.Authorization).length) {
        warnings.push("No MCP bearer token was provided for " + name + "; add an Authorization: Bearer header before using the protected MCP endpoint.");
      }
      // Same cross-project contract as _setupVibe (see AGENT.md, "Who owns the
      // managed MCP url"): a url carrying `from_bridge=true` belongs to
      // lib_ConvertigoAgentBridge and is kept as it is; the headers below are
      // still ours to repair. Without the marker the url is rewritten exactly
      // as before.
      var previousUrl = trim(previous.url);
      var keepUrl = /(^|[?&])from_bridge=true(&|#|$)/i.test(previousUrl);
      state.mcpServers[name] = {
        type: "http",
        url: keepUrl ? previousUrl : url,
        headers: headers
      };
    };
    patchServer("convertigo", mcpUrl);
    if (enableFlow === true) {
      patchServer("convertigo-flow", helpers.flowMcpUrl(mcpUrl));
    }
    var nextText = JSON.stringify(state, null, 2) + "\n";
    var normalizedExisting = String(existingText == null ? "" : existingText).replace(/\n+$/, "\n");
    return {
      status: nextText === normalizedExisting ? "unchanged" : (created ? "created" : "updated"),
      text: nextText,
      tokenConfigured: token.length > 0
    };
  }

  C8O.setupClaude.run = function (options) {
    var File = Packages.java.io.File;
    var opts = options || {};
    var warnings = [];
    var dryRun = C8O.util.toBoolean(opts.dryRun, false) === true;
    var configureMcp = C8O.util.toBoolean(typeof opts.configureMcp === "undefined" || String(opts.configureMcp).length === 0 ? true : opts.configureMcp, true) === true;
    var claudeHome = resolveClaudeHome(opts.claudeHome);
    var resolvedMcpUrl = helpers.deriveMcpUrl(opts.mcpUrl, warnings);
    var compactMcpUrl = helpers.configuredMcpUrl(resolvedMcpUrl);
    var enableFlow = helpers.flowCapabilityAvailable();
    var skillsDir = new File(claudeHome, "skills");
    var generalistSkillFile = new File(new File(skillsDir, "convertigo-generalist"), "SKILL.md");
    var noCodeSkillFile = new File(new File(skillsDir, "convertigo-nocode"), "SKILL.md");
    var stateFile = new File(claudeHome, CLAUDE_STATE_FILE);
    var generalistWrite = helpers.writeManagedFile(generalistSkillFile, buildClaudeSkillMarkdown(resolvedMcpUrl), dryRun);
    var noCodeWrite = helpers.writeManagedFile(noCodeSkillFile, buildClaudeNoCodeSkillMarkdown(resolvedMcpUrl), dryRun);
    var combinedSkillStatus = helpers.combineSkillStatuses([generalistWrite.status, noCodeWrite.status]);

    var configStatus = "skipped";
    var tokenConfigured = false;
    if (configureMcp) {
      var existing = helpers.readTextIfExists(stateFile);
      var patched = patchClaudeState(existing, compactMcpUrl, opts.mcpToken, warnings, enableFlow);
      configStatus = patched.status;
      tokenConfigured = patched.tokenConfigured;
      if (patched.status !== "unchanged" && dryRun !== true) {
        helpers.writeText(stateFile, patched.text);
      }
    }

    var result = {
      skillStatus: combinedSkillStatus,
      configStatus: configStatus,
      configureMcp: configureMcp,
      resolvedClaudeHome: String(claudeHome.getAbsolutePath()),
      resolvedMcpUrl: resolvedMcpUrl,
      configuredMcpUrl: compactMcpUrl,
      tokenConfigured: tokenConfigured,
      configPath: String(stateFile.getAbsolutePath()),
      skillPath: String(generalistSkillFile.getAbsolutePath()),
      skillPaths: {
        generalist: String(generalistSkillFile.getAbsolutePath()),
        nocode: String(noCodeSkillFile.getAbsolutePath())
      },
      skills: {
        generalist: { slug: "convertigo-generalist", status: generalistWrite.status, path: String(generalistSkillFile.getAbsolutePath()) },
        nocode: { slug: "convertigo-nocode", status: noCodeWrite.status, path: String(noCodeSkillFile.getAbsolutePath()) }
      },
      warnings: warnings,
      nextSteps: [
        "Start a new Claude Code session so the updated skills and MCP configuration are loaded.",
        "Run `claude mcp list` to confirm the convertigo server is connected.",
        "Invoke the convertigo-generalist or convertigo-nocode skill for the current Convertigo surface."
      ],
      dryRun: dryRun
    };
    if (enableFlow) {
      result.resolvedFlowMcpUrl = helpers.flowMcpUrl(resolvedMcpUrl);
      result.configuredFlowMcpUrl = helpers.flowMcpUrl(compactMcpUrl);
    }
    return result;
  };
})();

var setupClaudeResult = C8O.setupClaude.run({
  claudeHome: (typeof claudeHome !== "undefined") ? claudeHome : "",
  mcpUrl: (typeof mcpUrl !== "undefined") ? mcpUrl : "",
  mcpToken: (typeof mcpToken !== "undefined") ? mcpToken : "",
  dryRun: (typeof dryRun !== "undefined") ? dryRun : false,
  configureMcp: (typeof configureMcp !== "undefined") ? configureMcp : true
});
