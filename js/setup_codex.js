include("js/util.js");
include("js/resources.js");
include("js/prompts.js");
include("js/setup_common.js");

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.setupCodex = C8O.setupCodex || {};

(function () {
  var FLOW_MINIMUM_CONVERTIGO_VERSION = "8.5.0";
  var FLOW_REQUIRED_PROJECTS = ["lib_flow_engine", "lib_flow_mcp"];

  function trim(value) {
    return value == null ? "" : String(value).trim();
  }

  function numericVersionParts(value) {
    var match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(trim(value));
    if (match === null) {
      return null;
    }
    return [Number(match[1] || 0), Number(match[2] || 0), Number(match[3] || 0)];
  }

  function versionAtLeast(value, minimum) {
    var actual = numericVersionParts(value);
    var required = numericVersionParts(minimum);
    if (actual === null || required === null) {
      return false;
    }
    for (var i = 0; i < 3; i++) {
      if (actual[i] !== required[i]) {
        return actual[i] > required[i];
      }
    }
    return true;
  }

  function loadedProjectDirectory(projectName) {
    try {
      var manager = Packages.com.twinsoft.convertigo.engine.Engine.theApp.databaseObjectsManager;
      var project = manager.getOriginalProjectByName(String(projectName));
      if (project === null || typeof project === "undefined") {
        project = manager.getProjectByName(String(projectName));
      }
      var dir = project && project.getDirFile ? project.getDirFile() : null;
      return dir !== null && typeof dir !== "undefined" && dir.isDirectory() === true;
    } catch (_ignoreLoadedProjectDirectory) {
      return false;
    }
  }

  function flowCapabilityAvailable() {
    var engineVersion = "";
    try {
      engineVersion = trim(Packages.com.twinsoft.convertigo.engine.Version.version);
    } catch (_ignoreEngineProductVersion) {}
    if (!versionAtLeast(engineVersion, FLOW_MINIMUM_CONVERTIGO_VERSION)) {
      return false;
    }
    for (var i = 0; i < FLOW_REQUIRED_PROJECTS.length; i++) {
      if (!loadedProjectDirectory(FLOW_REQUIRED_PROJECTS[i])) {
        return false;
      }
    }
    return true;
  }

  function ensureTrailingPath(base, suffix) {
    var text = trim(base);
    if (!text.length) {
      return trim(suffix);
    }
    if (text.indexOf(trim(suffix)) === text.length - trim(suffix).length) {
      return text;
    }
    return text + trim(suffix);
  }

  function userHomeDirectory() {
    return trim(java.lang.System.getProperty("user.home"));
  }

  function resolveCodexHome(input) {
    var File = Packages.java.io.File;
    var raw = trim(input);
    if (!raw.length) {
      raw = "~/.codex";
    }
    if (raw === "~") {
      raw = userHomeDirectory();
    } else if (raw.indexOf("~/") === 0 || raw.indexOf("~\\") === 0) {
      raw = userHomeDirectory() + raw.substring(1);
    }
    return new File(raw).getCanonicalFile();
  }

  function readTextIfExists(file) {
    var Files = Packages.java.nio.file.Files;
    var StandardCharsets = Packages.java.nio.charset.StandardCharsets;
    if (!file || !file.isFile()) {
      return "";
    }
    return String(new java.lang.String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
  }

  function writeText(file, text) {
    var Files = Packages.java.nio.file.Files;
    var StandardCharsets = Packages.java.nio.charset.StandardCharsets;
    java.nio.file.Files.createDirectories(file.getParentFile().toPath());
    Files.write(
      file.toPath(),
      new java.lang.String(String(text == null ? "" : text)).getBytes(StandardCharsets.UTF_8),
      java.nio.file.StandardOpenOption.CREATE,
      java.nio.file.StandardOpenOption.TRUNCATE_EXISTING,
      java.nio.file.StandardOpenOption.WRITE
    );
  }

  function normalizeBaseUrl(url) {
    var text = trim(url).replace(/\/+$/g, "");
    return text;
  }

  function deriveMcpUrl(input, warnings) {
    var explicit = normalizeBaseUrl(input);
    if (explicit.length) {
      return explicit;
    }
    try {
      var EnginePropertiesManager = Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager;
      var PropertyName = Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager.PropertyName;
      var baseUrl = normalizeBaseUrl(EnginePropertiesManager.getProperty(PropertyName.APPLICATION_SERVER_CONVERTIGO_URL));
      if (/\/api\/mcp$/i.test(baseUrl)) {
        return baseUrl;
      }
      if (/\/convertigo$/i.test(baseUrl)) {
        return baseUrl + "/api/mcp";
      }
      if (/\/convertigo\/api$/i.test(baseUrl)) {
        return baseUrl + "/mcp";
      }
      if (baseUrl.length) {
        var candidate = ensureTrailingPath(baseUrl, "/convertigo/api/mcp");
        if (warnings && warnings.push) {
          warnings.push("Resolved MCP URL from the local server base URL using the default /convertigo/api/mcp suffix.");
        }
        return candidate;
      }
    } catch (deriveError) {
      if (warnings && warnings.push) {
        warnings.push("Unable to derive MCP URL from Engine properties: " + String(deriveError));
      }
    }
    if (warnings && warnings.push) {
      warnings.push("Falling back to the default local MCP URL.");
    }
    return "http://localhost:18080/convertigo/api/mcp";
  }

  function configuredMcpUrl(url) {
    var text = trim(url);
    var fragment = "";
    var hash = text.indexOf("#");
    if (hash >= 0) {
      fragment = text.substring(hash);
      text = text.substring(0, hash);
    }
    if (/(^|[?&])jsonOnly=[^&]*/i.test(text)) {
      text = text.replace(/(^|[?&])jsonOnly=[^&]*/i, "$1jsonOnly=true");
    } else {
      text += (text.indexOf("?") >= 0 ? "&" : "?") + "jsonOnly=true";
    }
    return text + fragment;
  }

  // Same cross-project contract as _setupVibe (see AGENT.md, "Who owns the
  // managed MCP url"): a url the Bridge marked with `from_bridge=true` is the
  // Bridge's, and this setup only repairs the rest of the entry. The Bridge
  // does not mark the Codex url today, so in practice nothing changes here;
  // the check exists so the contract does not have to be re-litigated the day
  // it does.
  function isBridgeOwnedMcpUrl(line) {
    var match = String(line == null ? "" : line).match(/url\s*=\s*["']([^"']*)["']/);
    if (!match) {
      return false;
    }
    return /(^|[?&])from_bridge=true(&|#|$)/i.test(match[1]);
  }

  function flowMcpUrl(url) {
    var text = trim(url);
    if (/\/api\/mcp(?=\?|#|$)/i.test(text)) {
      return text.replace(/\/api\/mcp(?=\?|#|$)/i, "/api/flow-mcp");
    }
    return text;
  }

  function tomlEscape(value) {
    return String(value == null ? "" : value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');
  }

  function splitLines(text) {
    return String(text == null ? "" : text).replace(/\r\n?/g, "\n").split("\n");
  }

  function findSectionRange(lines, sectionName) {
    var header = "[" + sectionName + "]";
    var start = -1;
    var end = lines.length;
    for (var i = 0; i < lines.length; i++) {
      if (trim(lines[i]) === header) {
        start = i;
        break;
      }
    }
    if (start < 0) {
      return { found: false, start: -1, end: -1 };
    }
    for (var j = start + 1; j < lines.length; j++) {
      if (/^\s*\[.+\]\s*$/.test(lines[j])) {
        end = j;
        break;
      }
    }
    return { found: true, start: start, end: end };
  }

  function removeSection(lines, sectionName) {
    var range = findSectionRange(lines, sectionName);
    return range.found ? lines.slice(0, range.start).concat(lines.slice(range.end)) : lines;
  }

  function inlineMapEntries(line) {
    var source = String(line || "");
    var open = source.indexOf("{");
    var close = source.lastIndexOf("}");
    if (open < 0 || close <= open) {
      return [];
    }
    var body = source.substring(open + 1, close);
    var entries = [];
    var start = 0;
    var quote = "";
    var escaped = false;
    for (var i = 0; i <= body.length; i++) {
      var character = i < body.length ? body.charAt(i) : ",";
      if (escaped) {
        escaped = false;
      } else if (quote.length && character === "\\") {
        escaped = true;
      } else if (character === '"' || character === "'") {
        quote = quote === character ? "" : (quote.length ? quote : character);
      } else if (!quote.length && character === ",") {
        var entry = trim(body.substring(start, i));
        if (entry.length) {
          entries.push(entry);
        }
        start = i + 1;
      }
    }
    return entries;
  }

  function assignmentKey(line) {
    var match = /^\s*([^=]+?)\s*=/.exec(String(line || ""));
    if (!match) {
      return "";
    }
    return trim(match[1]).replace(/^["']|["']$/g, "").toLowerCase();
  }

  function removeMisconfiguredTokenHeader(lines, serverName, warnings) {
    var range = findSectionRange(lines, "mcp_servers." + serverName + ".env_http_headers");
    if (!range.found) {
      return lines;
    }
    var section = lines.slice(range.start, range.end);
    var removed = false;
    var kept = [section[0]];
    for (var i = 1; i < section.length; i++) {
      if (assignmentKey(section[i]) === "convertigo_mcp_token" && /=\s*["']eyJ[A-Za-z0-9_-]*\./.test(section[i])) {
        removed = true;
      } else {
        kept.push(section[i]);
      }
    }
    if (!removed) {
      return lines;
    }
    if (warnings && warnings.push) {
      warnings.push("Removed a token incorrectly stored in env_http_headers; Codex treats those values as environment variable names, not credentials.");
    }
    var hasAssignments = false;
    for (var j = 1; j < kept.length; j++) {
      if (assignmentKey(kept[j]).length) {
        hasAssignments = true;
        break;
      }
    }
    var replacement = hasAssignments ? kept : [];
    return lines.slice(0, range.start).concat(replacement).concat(lines.slice(range.end));
  }

  function upsertHeader(section, key, line) {
    var expectedKey = String(key).toLowerCase();
    for (var i = 1; i < section.length; i++) {
      if (assignmentKey(section[i]) === expectedKey) {
        section[i] = line;
        return;
      }
    }
    section.push(line);
  }

  function patchMcpServer(lines, serverName, mcpUrl, mcpToken, warnings) {
    lines = removeMisconfiguredTokenHeader(lines, serverName, warnings);
    var sectionName = "mcp_servers." + serverName;
    var range = findSectionRange(lines, sectionName);
    var urlLine = 'url = "' + tomlEscape(mcpUrl) + '"';
    var timeoutLine = "startup_timeout_sec = 60";
    var token = trim(mcpToken);

    if (!range.found) {
      if (lines.length && trim(lines[lines.length - 1]).length) {
        lines.push("");
      }
      lines.push("[" + sectionName + "]");
      lines.push(urlLine);
      lines.push(timeoutLine);
      range = findSectionRange(lines, sectionName);
    } else {
      var sectionLines = lines.slice(range.start, range.end);
      var replacedUrl = false;
      var replacedTimeout = false;
      for (var i = 1; i < sectionLines.length; i++) {
        if (/^\s*url\s*=/.test(sectionLines[i])) {
          if (!isBridgeOwnedMcpUrl(sectionLines[i])) {
            sectionLines[i] = urlLine;
          }
          replacedUrl = true;
        } else if (/^\s*startup_timeout_sec\s*=/.test(sectionLines[i])) {
          sectionLines[i] = timeoutLine;
          replacedTimeout = true;
        }
      }
      if (!replacedUrl) {
        sectionLines.splice(1, 0, urlLine);
      }
      if (!replacedTimeout) {
        sectionLines.splice(2, 0, timeoutLine);
      }
      lines = lines.slice(0, range.start).concat(sectionLines).concat(lines.slice(range.end));
      range = findSectionRange(lines, sectionName);
    }

    var migratedHeaders = [];
    var parent = lines.slice(range.start, range.end);
    var parentWithoutInlineHeaders = [];
    for (var parentIndex = 0; parentIndex < parent.length; parentIndex++) {
      if (/^\s*http_headers\s*=/.test(parent[parentIndex])) {
        migratedHeaders = migratedHeaders.concat(inlineMapEntries(parent[parentIndex]));
      } else {
        parentWithoutInlineHeaders.push(parent[parentIndex]);
      }
    }
    lines = lines.slice(0, range.start).concat(parentWithoutInlineHeaders).concat(lines.slice(range.end));

    var headersSectionName = sectionName + ".http_headers";
    var headersRange = findSectionRange(lines, headersSectionName);
    var headersSection;
    if (headersRange.found) {
      headersSection = lines.slice(headersRange.start, headersRange.end);
    } else {
      headersSection = ["[" + headersSectionName + "]"];
      var refreshedParent = findSectionRange(lines, sectionName);
      lines = lines.slice(0, refreshedParent.end).concat(headersSection).concat(lines.slice(refreshedParent.end));
      headersRange = findSectionRange(lines, headersSectionName);
      headersSection = lines.slice(headersRange.start, headersRange.end);
    }

    for (var migratedIndex = 0; migratedIndex < migratedHeaders.length; migratedIndex++) {
      var migratedKey = assignmentKey(migratedHeaders[migratedIndex]);
      var exists = false;
      for (var headerIndex = 1; headerIndex < headersSection.length; headerIndex++) {
        if (assignmentKey(headersSection[headerIndex]) === migratedKey) {
          exists = true;
          break;
        }
      }
      if (migratedKey.length && !exists) {
        headersSection.push(migratedHeaders[migratedIndex]);
      }
    }
    upsertHeader(
      headersSection,
      "X-Convertigo-Guidance-Version",
      '"X-Convertigo-Guidance-Version" = "' + tomlEscape(C8O.MCP_GUIDANCE_VERSION) + '"'
    );
    if (token.length) {
      upsertHeader(headersSection, "Authorization", 'Authorization = "Bearer ' + tomlEscape(token) + '"');
    }
    lines = lines.slice(0, headersRange.start).concat(headersSection).concat(lines.slice(headersRange.end));

    return lines;
  }

  function patchConfigToml(existingText, mcpUrl, mcpToken, warnings, enableFlow) {
    var text = String(existingText == null ? "" : existingText).replace(/\r\n?/g, "\n");
    var lines = splitLines(text);
    lines = patchMcpServer(lines, "convertigo", mcpUrl, mcpToken, warnings);
    if (enableFlow === true) {
      lines = patchMcpServer(lines, "convertigo-flow", flowMcpUrl(mcpUrl), mcpToken, warnings);
    } else {
      lines = removeSection(lines, "mcp_servers.convertigo-flow.env_http_headers");
      lines = removeSection(lines, "mcp_servers.convertigo-flow.http_headers");
      lines = removeSection(lines, "mcp_servers.convertigo-flow");
    }

    var nextText = lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "\n");
    var normalizedExisting = text.replace(/\n+$/, "\n");
    return {
      status: nextText === normalizedExisting ? "unchanged" : (trim(text).length ? "updated" : "created"),
      text: nextText,
      tokenConfigured: trim(mcpToken).length > 0
    };
  }

  function buildSkillMarkdown(mcpUrl) {
    return C8O.setupCommon.buildSkillMarkdown("codex", mcpUrl);
  }

  function buildNoCodeSkillMarkdown(mcpUrl) {
    var text = String(c8oReadCatalogFile("resources", "convertigo-nocode/SKILL.md"));
    var versionLine = "- Skill guidance version: `" + C8O.MCP_GUIDANCE_VERSION + "`.";
    var endpointLine = "- Expected MCP endpoint: `" + trim(mcpUrl) + "`.";

    if (/^- Skill guidance version: `[^`]*`\./m.test(text)) {
      text = text.replace(/^- Skill guidance version: `[^`]*`\./m, versionLine);
    } else {
      text = text.replace(
        "The core rule is simple: stay on the no-code form rail. Do not use Convertigo low-code tools to compensate for missing no-code capability.",
        "The core rule is simple: stay on the no-code form rail. Do not use Convertigo low-code tools to compensate for missing no-code capability.\n\n" +
        "## Skill freshness\n\n" +
        versionLine + "\n" +
        "- During bootstrap, compare this value with `MCP guidance version` in `convertigo://capabilities`. If the MCP value differs or is missing, rerun `_setupCodex` for the current MCP endpoint before using no-code mutation tools.\n" +
        "- When the caller surface supports MCP request metadata, send `params._meta.convertigoGuidanceVersion` with this skill guidance version on the first guarded Convertigo `tools/call`; raw HTTP clients may use the `X-Convertigo-Guidance-Version` header. An `_meta.convertigoGuidanceWarning` mismatch requires setup refresh before no-code mutation. A missing-version warning is advisory when this skill version already matches `convertigo://capabilities`: continue the current task and let the managed host refresh its transport configuration."
      );
    }

    if (/^- Expected MCP endpoint: `[^`]*`\./m.test(text)) {
      text = text.replace(/^- Expected MCP endpoint: `[^`]*`\./m, endpointLine);
    } else {
      text = text.replace(
        "## Workflow",
        "## Convertigo MCP entry\n\n" +
        endpointLine + "\n" +
        "- Prefer the no-code MCP tools listed below over filesystem edits or low-code project mutations.\n\n" +
        "## Workflow"
      );
    }

    return text.replace(/\n*$/g, "\n");
  }

  function writeManagedFile(file, content, dryRun) {
    var existed = file.isFile();
    var previous = readTextIfExists(file);
    var next = String(content == null ? "" : content);
    if (previous === next) {
      return {
        status: "unchanged",
        existed: existed
      };
    }
    if (dryRun !== true) {
      writeText(file, next);
    }
    return {
      status: existed ? "updated" : "created",
      existed: existed
    };
  }

  function combineSkillStatuses(statuses) {
    var hasCreated = false;
    var hasUpdated = false;
    for (var i = 0; i < statuses.length; i++) {
      var status = trim(statuses[i]);
      if (status === "created") {
        hasCreated = true;
      } else if (status === "updated") {
        hasUpdated = true;
      }
    }
    if (hasCreated) {
      return "created";
    }
    if (hasUpdated) {
      return "updated";
    }
    return "unchanged";
  }

  C8O.setupCodex.run = function (options) {
    var File = Packages.java.io.File;
    var opts = options || {};
    var warnings = [];
    var dryRun = C8O.util.toBoolean(opts.dryRun, false) === true;
    var codexHome = resolveCodexHome(opts.codexHome);
    var resolvedMcpUrl = deriveMcpUrl(opts.mcpUrl, warnings);
    var compactMcpUrl = configuredMcpUrl(resolvedMcpUrl);
    var enableFlow = flowCapabilityAvailable();
    var skillsDir = new File(codexHome, "skills");
    var generalistSkillDir = new File(skillsDir, "convertigo-generalist");
    var generalistSkillFile = new File(generalistSkillDir, "SKILL.md");
    var noCodeSkillDir = new File(skillsDir, "convertigo-nocode");
    var noCodeSkillFile = new File(noCodeSkillDir, "SKILL.md");
    var configFile = new File(codexHome, "config.toml");
    var generalistSkillContent = buildSkillMarkdown(resolvedMcpUrl);
    var noCodeSkillContent = buildNoCodeSkillMarkdown(resolvedMcpUrl);
    var generalistSkillWrite = writeManagedFile(generalistSkillFile, generalistSkillContent, dryRun);
    var noCodeSkillWrite = writeManagedFile(noCodeSkillFile, noCodeSkillContent, dryRun);
    var combinedSkillStatus = combineSkillStatuses([generalistSkillWrite.status, noCodeSkillWrite.status]);

    var existingConfig = readTextIfExists(configFile);
    var patchedConfig = patchConfigToml(existingConfig, compactMcpUrl, opts.mcpToken, warnings, enableFlow);
    if (patchedConfig.status !== "unchanged" && dryRun !== true) {
      writeText(configFile, patchedConfig.text);
    }

    var result = {
      skillStatus: combinedSkillStatus,
      configStatus: patchedConfig.status,
      resolvedCodexHome: String(codexHome.getAbsolutePath()),
      resolvedMcpUrl: resolvedMcpUrl,
      configuredMcpUrl: compactMcpUrl,
      tokenConfigured: patchedConfig.tokenConfigured,
      configPath: String(configFile.getAbsolutePath()),
      skillPath: String(generalistSkillFile.getAbsolutePath()),
      skillPaths: {
        generalist: String(generalistSkillFile.getAbsolutePath()),
        nocode: String(noCodeSkillFile.getAbsolutePath())
      },
      skills: {
        generalist: {
          slug: "convertigo-generalist",
          status: generalistSkillWrite.status,
          path: String(generalistSkillFile.getAbsolutePath())
        },
        nocode: {
          slug: "convertigo-nocode",
          status: noCodeSkillWrite.status,
          path: String(noCodeSkillFile.getAbsolutePath())
        }
      },
      warnings: warnings,
      nextSteps: [
        "Restart Codex to pick up the updated skill list.",
        "Start a fresh Codex session in the Convertigo workspace.",
        "Use the generated convertigo-generalist or convertigo-nocode skill for the current Convertigo surface."
      ],
      dryRun: dryRun
    };
    if (enableFlow) {
      result.resolvedFlowMcpUrl = flowMcpUrl(resolvedMcpUrl);
      result.configuredFlowMcpUrl = flowMcpUrl(compactMcpUrl);
    }
    return result;
  };

  // Shared helpers reused by sibling setup scripts such as setup_claude.js.
  C8O.setupCodex._helpers = {
    trim: trim,
    userHomeDirectory: userHomeDirectory,
    readTextIfExists: readTextIfExists,
    writeText: writeText,
    deriveMcpUrl: deriveMcpUrl,
    configuredMcpUrl: configuredMcpUrl,
    flowMcpUrl: flowMcpUrl,
    flowCapabilityAvailable: flowCapabilityAvailable,
    buildSkillMarkdown: buildSkillMarkdown,
    buildNoCodeSkillMarkdown: buildNoCodeSkillMarkdown,
    writeManagedFile: writeManagedFile,
    combineSkillStatuses: combineSkillStatuses
  };
})();

if (C8O.setupCodex.autoRun !== false) {
  var setupCodexResult = C8O.setupCodex.run({
    codexHome: (typeof codexHome !== "undefined") ? codexHome : "",
    mcpUrl: (typeof mcpUrl !== "undefined") ? mcpUrl : "",
    mcpToken: (typeof mcpToken !== "undefined") ? mcpToken : "",
    dryRun: (typeof dryRun !== "undefined") ? dryRun : false
  });
}
