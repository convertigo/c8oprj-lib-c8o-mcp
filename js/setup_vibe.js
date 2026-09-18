include("js/util.js");
include("js/setup_common.js");

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.setupVibe = C8O.setupVibe || {};

(function () {
  function trim(value) {
    return value == null ? "" : String(value).trim();
  }

  function userHomeDirectory() {
    return trim(java.lang.System.getProperty("user.home"));
  }

  function resolveVibeHome(input) {
    var File = Packages.java.io.File;
    var raw = trim(input);
    if (!raw.length) {
      raw = "~/.vibe";
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
    return trim(url).replace(/\/+$/g, "");
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
        if (warnings && warnings.push) {
          warnings.push("Resolved MCP URL from the local server base URL using the default /convertigo/api/mcp suffix.");
        }
        return ensureTrailingPath(baseUrl, "/convertigo/api/mcp");
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

  function tomlEscape(value) {
    return String(value == null ? "" : value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');
  }

  function splitLines(text) {
    return String(text == null ? "" : text).replace(/\r\n?/g, "\n").split("\n");
  }

  function buildSkillMarkdown(mcpUrl) {
    return C8O.setupCommon.buildSkillMarkdown("vibe", mcpUrl);
  }

  function buildAgentsMarkdown(mcpUrl) {
    return [
      "# Convertigo Vibe Workspace",
      "",
      "- For Convertigo tasks, use the `convertigo-vibe-generalist` skill.",
      "- Use the `Convertigo` MCP server at `" + trim(mcpUrl) + "`.",
      "- Let the skill route the task to the smallest required MCP resource set. Do not preload the general start guides.",
      "- Compare the skill `Skill guidance version` with `MCP guidance version` in `convertigo://capabilities` once per conversation; rerun `_setupVibe` if they differ.",
      "- Keep benchmark runs isolated. Do not rely on global skills or Codex setup state.",
      "- Provide model credentials through the process environment, for example `MISTRAL_API_KEY`; do not copy secrets into this isolated home.",
      "- Do not edit generated Convertigo artifacts; mutate source objects through MCP tools.",
      ""
    ].join("\n");
  }

  function toolPermissionBlock(toolName) {
    return [
      "[tools." + toolName + "]",
      'permission = "always"'
    ].join("\n");
  }

  function vibeToolNames() {
    return [
      "skill",
      "read",
      "grep",
      "bash",
      "write_file",
      "edit",
      "Convertigo_project-list",
      "Convertigo_project-list-symbols",
      "Convertigo_marketplace-list",
      "Convertigo_marketplace-import",
      "Convertigo_requestable-execute",
      "Convertigo_databaseobject-tree-get",
      "Convertigo_databaseobject-search",
      "Convertigo_palette-list",
      "Convertigo_palette-describe",
      "Convertigo_databaseobject-tree-apply",
      "Convertigo_databaseobject-delete",
      "Convertigo_mobile-builder-open",
      "Convertigo_project-save",
      "Convertigo_project-reload",
      "Convertigo_log-view",
      "Convertigo_crud-status",
      "Convertigo_crud-proof",
      "Convertigo_upsert-crud",
      "Convertigo_upsert-ngx-crud-kit",
      "Convertigo_rag-query"
    ];
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

  function mcpHeadersLine(existingLine, mcpToken) {
    var entries = inlineMapEntries(existingLine);
    var byKey = {};
    var order = [];
    for (var i = 0; i < entries.length; i++) {
      var key = assignmentKey(entries[i]);
      if (key.length && !Object.prototype.hasOwnProperty.call(byKey, key)) {
        order.push(key);
      }
      if (key.length) {
        byKey[key] = entries[i];
      }
    }
    var guidanceKey = "x-convertigo-guidance-version";
    if (!Object.prototype.hasOwnProperty.call(byKey, guidanceKey)) {
      order.push(guidanceKey);
    }
    byKey[guidanceKey] = '"X-Convertigo-Guidance-Version" = "' + tomlEscape(C8O.MCP_GUIDANCE_VERSION) + '"';
    var token = trim(mcpToken);
    if (token.length) {
      var authorizationKey = "authorization";
      if (!Object.prototype.hasOwnProperty.call(byKey, authorizationKey)) {
        order.push(authorizationKey);
      }
      byKey[authorizationKey] = 'Authorization = "Bearer ' + tomlEscape(token) + '"';
    }
    var merged = [];
    for (var orderIndex = 0; orderIndex < order.length; orderIndex++) {
      merged.push(byKey[order[orderIndex]]);
    }
    return "headers = { " + merged.join(", ") + " }";
  }

  function findConvertigoMcpServerRange(lines) {
    for (var i = 0; i < lines.length; i++) {
      if (trim(lines[i]) !== "[[mcp_servers]]") {
        continue;
      }
      var end = lines.length;
      for (var j = i + 1; j < lines.length; j++) {
        var sectionName = trim(lines[j]);
        var nestedConvertigoSection = sectionName === "[mcp_servers.headers]" ||
          sectionName === "[mcp_servers.auth]" ||
          sectionName === "[mcp_servers.auth.headers]";
        if (/^\[\[.+\]\]$/.test(sectionName) ||
            (/^\[.+\]$/.test(sectionName) && !nestedConvertigoSection)) {
          end = j;
          break;
        }
      }
      var isConvertigo = false;
      for (var itemIndex = i + 1; itemIndex < end && !/^\[.+\]$/.test(trim(lines[itemIndex])); itemIndex++) {
        if (/^\s*name\s*=\s*["']Convertigo["']\s*$/.test(lines[itemIndex])) {
          isConvertigo = true;
          break;
        }
      }
      if (isConvertigo) {
        return { found: true, start: i, end: end };
      }
    }
    return { found: false, start: -1, end: -1 };
  }

  function collectHeaderEntries(entries, line) {
    var inlineEntries = inlineMapEntries(line);
    if (inlineEntries.length) {
      for (var inlineIndex = 0; inlineIndex < inlineEntries.length; inlineIndex++) {
        entries.push(inlineEntries[inlineIndex]);
      }
      return;
    }
    if (/^\s*[^#=]+\s*=/.test(String(line || ""))) {
      entries.push(trim(line));
    }
  }

  function normalizeConvertigoMcpAuth(section, mcpToken) {
    var headerEntries = [];
    var normalized = [];
    var skippedHeaderSection = false;
    var authStart = -1;
    var authEnd = -1;

    for (var i = 0; i < section.length; i++) {
      var value = trim(section[i]);
      if (value === "[mcp_servers.headers]" || value === "[mcp_servers.auth.headers]") {
        skippedHeaderSection = true;
        continue;
      }
      if (skippedHeaderSection && /^\[.+\]$/.test(value)) {
        skippedHeaderSection = false;
      }
      if (skippedHeaderSection) {
        collectHeaderEntries(headerEntries, section[i]);
        continue;
      }
      if (/^\s*headers\s*=/.test(section[i])) {
        collectHeaderEntries(headerEntries, section[i]);
        continue;
      }
      normalized.push(section[i]);
    }

    for (var normalizedIndex = 0; normalizedIndex < normalized.length; normalizedIndex++) {
      if (trim(normalized[normalizedIndex]) === "[mcp_servers.auth]") {
        authStart = normalizedIndex;
        authEnd = normalized.length;
        for (var authIndex = authStart + 1; authIndex < normalized.length; authIndex++) {
          if (/^\[.+\]$/.test(trim(normalized[authIndex]))) {
            authEnd = authIndex;
            break;
          }
        }
        break;
      }
    }

    var headersLine = mcpHeadersLine("headers = { " + headerEntries.join(", ") + " }", mcpToken);
    if (authStart < 0) {
      if (normalized.length && trim(normalized[normalized.length - 1]).length) {
        normalized.push("");
      }
      normalized.push("[mcp_servers.auth]");
      normalized.push('type = "static"');
      normalized.push(headersLine);
      return normalized;
    }

    var hasType = false;
    for (var authLineIndex = authStart + 1; authLineIndex < authEnd; authLineIndex++) {
      if (/^\s*type\s*=/.test(normalized[authLineIndex])) {
        hasType = true;
        break;
      }
    }
    var additions = [];
    if (!hasType) {
      additions.push('type = "static"');
    }
    additions.push(headersLine);
    return normalized.slice(0, authEnd).concat(additions).concat(normalized.slice(authEnd));
  }

  function patchConvertigoMcpServer(lines, mcpUrl, mcpToken) {
    var range = findConvertigoMcpServerRange(lines);
    if (!range.found) {
      if (lines.length && trim(lines[lines.length - 1]).length) {
        lines.push("");
      }
      lines.push("[[mcp_servers]]");
      lines.push('name = "Convertigo"');
      lines.push('transport = "http"');
      lines.push('url = "' + tomlEscape(mcpUrl) + '"');
      lines.push("tool_timeout_sec = 180");
      lines.push("");
      lines.push("[mcp_servers.auth]");
      lines.push('type = "static"');
      lines.push(mcpHeadersLine("", mcpToken));
      lines.push("");
      return lines;
    }
    var section = lines.slice(range.start, range.end);
    var urlLine = 'url = "' + tomlEscape(mcpUrl) + '"';
    var timeoutLine = "tool_timeout_sec = 180";
    var hasUrl = false;
    var hasTimeout = false;
    for (var i = 1; i < section.length; i++) {
      if (/^\s*url\s*=/.test(section[i])) {
        section[i] = urlLine;
        hasUrl = true;
      } else if (/^\s*tool_timeout_sec\s*=/.test(section[i])) {
        section[i] = timeoutLine;
        hasTimeout = true;
      }
    }
    // Insert missing server-level keys before the first nested table
    // ([mcp_servers.auth], [mcp_servers.auth.headers], ...): appending them at
    // the end of the range would place them inside that nested table.
    var insertAt = section.length;
    for (var nestedIndex = 1; nestedIndex < section.length; nestedIndex++) {
      if (/^\[.+\]$/.test(trim(section[nestedIndex]))) {
        insertAt = nestedIndex;
        break;
      }
    }
    while (insertAt > 1 && !trim(section[insertAt - 1]).length) {
      insertAt--;
    }
    var missing = [];
    if (!hasUrl) {
      missing.push(urlLine);
    }
    if (!hasTimeout) {
      missing.push(timeoutLine);
    }
    if (missing.length) {
      section = section.slice(0, insertAt).concat(missing).concat(section.slice(insertAt));
    }
    section = normalizeConvertigoMcpAuth(section, mcpToken);
    return lines.slice(0, range.start).concat(section).concat(lines.slice(range.end));
  }

  function buildFullConfig(mcpUrl, mcpToken) {
    var lines = [
      'active_model = "mistral-medium-3.5"',
      "include_prompt_detail = true",
      'enabled_skills = ["convertigo-vibe-generalist"]',
      "",
      "[[mcp_servers]]",
      'name = "Convertigo"',
      'transport = "http"',
      'url = "' + tomlEscape(mcpUrl) + '"',
      "tool_timeout_sec = 180",
      "",
      "[mcp_servers.auth]",
      'type = "static"',
      mcpHeadersLine("", mcpToken),
      ""
    ];
    var tools = vibeToolNames();
    for (var i = 0; i < tools.length; i++) {
      lines.push(toolPermissionBlock(tools[i]));
      lines.push("");
    }
    return lines.join("\n").replace(/\n+$/, "\n");
  }

  function hasConvertigoMcpServer(text) {
    var value = String(text == null ? "" : text);
    return /mcp_servers\s*=\s*\[[\s\S]*?name\s*=\s*["']Convertigo["']/m.test(value) ||
      /\[\[mcp_servers\]\][\s\S]*?name\s*=\s*["']Convertigo["']/m.test(value);
  }

  function hasToolPermission(text, toolName) {
    var header = "[tools." + toolName + "]";
    var lines = splitLines(text);
    for (var i = 0; i < lines.length; i++) {
      if (trim(lines[i]) === header) {
        return true;
      }
    }
    return false;
  }

  function patchExistingConfig(existingText, mcpUrl, mcpToken, warnings) {
    var text = String(existingText == null ? "" : existingText).replace(/\r\n?/g, "\n");
    var lines = splitLines(text);

    if (!/^\s*enabled_skills\s*=/m.test(text)) {
      lines.unshift('enabled_skills = ["convertigo-vibe-generalist"]', "");
    } else if (text.indexOf("convertigo-vibe-generalist") < 0 && warnings && warnings.push) {
      warnings.push("Existing enabled_skills does not include convertigo-vibe-generalist; left unchanged to avoid rewriting user skill filters.");
    }

    lines = patchConvertigoMcpServer(lines, mcpUrl, mcpToken);

    var next = lines.join("\n").replace(/\n+$/, "\n");
    var tools = vibeToolNames();
    for (var i = 0; i < tools.length; i++) {
      if (!hasToolPermission(next, tools[i])) {
        if (trim(next).length) {
          next = next.replace(/\n*$/, "\n\n");
        }
        next += toolPermissionBlock(tools[i]) + "\n";
      }
    }
    return next.replace(/\n+$/, "\n");
  }

  function patchConfigToml(existingText, mcpUrl, mcpToken, replaceConfig, warnings) {
    var existing = String(existingText == null ? "" : existingText).replace(/\r\n?/g, "\n");
    var next = (replaceConfig === true || trim(existing).length === 0)
      ? buildFullConfig(mcpUrl, mcpToken)
      : patchExistingConfig(existing, mcpUrl, mcpToken, warnings);
    var normalizedExisting = existing.replace(/\n+$/, "\n");
    var normalizedNext = next.replace(/\n+$/, "\n");
    return {
      status: normalizedExisting === normalizedNext ? "unchanged" : (trim(existing).length ? "updated" : "created"),
      text: normalizedNext
    };
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

  C8O.setupVibe.run = function (options) {
    var File = Packages.java.io.File;
    var opts = options || {};
    var warnings = [];
    var dryRun = C8O.util.toBoolean(opts.dryRun, false) === true;
    var replaceConfig = C8O.util.toBoolean(opts.replaceConfig, false) === true;
    var vibeHome = resolveVibeHome(opts.vibeHome);
    var resolvedMcpUrl = deriveMcpUrl(opts.mcpUrl, warnings);
    var compactMcpUrl = configuredMcpUrl(resolvedMcpUrl);
    var skillsDir = new File(vibeHome, "skills");
    var skillDir = new File(skillsDir, "convertigo-vibe-generalist");
    var skillFile = new File(skillDir, "SKILL.md");
    var agentsFile = new File(vibeHome, "AGENTS.md");
    var configFile = new File(vibeHome, "config.toml");
    var skillContent = buildSkillMarkdown(resolvedMcpUrl);
    var agentsContent = buildAgentsMarkdown(resolvedMcpUrl);
    var skillWrite = writeManagedFile(skillFile, skillContent, dryRun);
    var agentsWrite = writeManagedFile(agentsFile, agentsContent, dryRun);

    var existingConfig = readTextIfExists(configFile);
    var patchedConfig = patchConfigToml(existingConfig, compactMcpUrl, opts.mcpToken, replaceConfig, warnings);
    if (patchedConfig.status !== "unchanged" && dryRun !== true) {
      writeText(configFile, patchedConfig.text);
    }

    return {
      skillStatus: skillWrite.status,
      agentsStatus: agentsWrite.status,
      configStatus: patchedConfig.status,
      resolvedVibeHome: String(vibeHome.getAbsolutePath()),
      resolvedMcpUrl: resolvedMcpUrl,
      configuredMcpUrl: compactMcpUrl,
      tokenConfigured: trim(opts.mcpToken).length > 0,
      skillPath: String(skillFile.getAbsolutePath()),
      agentsPath: String(agentsFile.getAbsolutePath()),
      configPath: String(configFile.getAbsolutePath()),
      replaceConfig: replaceConfig,
      warnings: warnings,
      nextSteps: [
        "Run Vibe with VIBE_HOME=" + String(vibeHome.getAbsolutePath()) + " for isolated generation runs.",
        "Provide MISTRAL_API_KEY through the shell environment or CI secret store before launching Vibe.",
        "Ask Vibe to use the convertigo-vibe-generalist skill and the Convertigo MCP server.",
        "For headless loops, pass --agent auto-approve --trust and repeat --enabled-tools once per allowed tool."
      ],
      dryRun: dryRun
    };
  };
})();

var setupVibeResult = C8O.setupVibe.run({
  vibeHome: (typeof vibeHome !== "undefined") ? vibeHome : "",
  mcpUrl: (typeof mcpUrl !== "undefined") ? mcpUrl : "",
  mcpToken: (typeof mcpToken !== "undefined") ? mcpToken : "",
  dryRun: (typeof dryRun !== "undefined") ? dryRun : false,
  replaceConfig: (typeof replaceConfig !== "undefined") ? replaceConfig : false
});
