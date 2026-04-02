include("js/util.js");

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.maintainerDocs = C8O.maintainerDocs || {};

(function () {
  var File = Packages.java.io.File;
  var Files = Packages.java.nio.file.Files;
  var StandardCharsets = Packages.java.nio.charset.StandardCharsets;
  var StandardOpenOption = Packages.java.nio.file.StandardOpenOption;
  var InternalRequester = Packages.com.twinsoft.convertigo.engine.requesters.InternalRequester;
  var HashMap = Packages.java.util.HashMap;
  var SimpleDateFormat = Packages.java.text.SimpleDateFormat;
  var Date = Packages.java.util.Date;
  var XMLUtils = Packages.com.twinsoft.convertigo.engine.util.XMLUtils;

  function trim(value) {
    return C8O.util.toTrimmedString ? C8O.util.toTrimmedString(value) : (value == null ? "" : String(value).trim());
  }

  function toBoolean(value, defaultValue) {
    if (value === null || value === undefined || trim(value).length === 0) {
      return defaultValue === true;
    }
    var text = trim(value).toLowerCase();
    return text === "true" || text === "1" || text === "yes";
  }

  function resolveProjectRoot() {
    return C8O.project.resolveProjectDirectory({ projectName: "ConvertigoMCP" });
  }

  function resolveOutputRoot(input) {
    var raw = trim(input);
    if (!raw.length) {
      return resolveProjectRoot();
    }
    if (raw === "~") {
      raw = String(java.lang.System.getProperty("user.home"));
    } else if (raw.indexOf("~/") === 0 || raw.indexOf("~\\") === 0) {
      raw = String(java.lang.System.getProperty("user.home")) + raw.substring(1);
    }
    return new File(raw).getCanonicalFile();
  }

  function readText(file) {
    return String(new java.lang.String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
  }

  function readTextIfExists(file) {
    if (!file || !file.isFile()) {
      return "";
    }
    return readText(file);
  }

  function writeText(file, text) {
    Files.createDirectories(file.getParentFile().toPath());
    Files.write(
      file.toPath(),
      new java.lang.String(String(text == null ? "" : text)).getBytes(StandardCharsets.UTF_8),
      StandardOpenOption.CREATE,
      StandardOpenOption.TRUNCATE_EXISTING,
      StandardOpenOption.WRITE
    );
  }

  function extractPayloadFromResponse(response) {
    var root = null;
    try {
      root = response && response.getDocumentElement ? response.getDocumentElement() : response;
    } catch (_ignoreRoot) {
      root = response;
    }
    if (!root) {
      return null;
    }
    var parsed = JSON.parse(String(XMLUtils.XmlToJson(root, true, true)));
    var payload = parsed && parsed.document ? parsed.document : parsed;
    if (payload && payload.error) {
      throw new Error("Internal MCP sequence failed: " + trim(payload.error.message || payload.error.details || payload.error));
    }
    if (payload && payload.result !== undefined) {
      return payload.result;
    }
    return payload;
  }

  function internalSequence(sequenceName, argsMap) {
    var request = new HashMap();
    request.put("__project", "ConvertigoMCP");
    request.put("__sequence", sequenceName);
    request.put("__nolog", "true");

    var keys = Object.keys(argsMap || {});
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (!Object.prototype.hasOwnProperty.call(argsMap, key)) {
        continue;
      }
      var value = argsMap[key];
      if (value === undefined || value === null) {
        continue;
      }
      if (typeof value === "object") {
        request.put(String(key), JSON.stringify(value));
      } else {
        request.put(String(key), String(value));
      }
    }

    var requester = null;
    try {
      requester = new InternalRequester(request, context.httpServletRequest);
    } catch (_ignoreHttpRequest) {
      requester = new InternalRequester(request);
    }
    return extractPayloadFromResponse(requester.processRequest());
  }

  function fetchInitialize() {
    return internalSequence("mcp_initialize", {
      idJson: "1",
      paramsJson: JSON.stringify({
        protocolVersion: "2025-06-18"
      })
    }) || {};
  }

  function fetchTools() {
    var payload = internalSequence("mcp_tools_list", {
      idJson: "1",
      paramsJson: "{}"
    }) || {};
    return payload.tools || [];
  }

  function fetchResources() {
    var payload = internalSequence("mcp_resources_list", {
      idJson: "1",
      paramsJson: "{}"
    }) || {};
    return payload.resources || [];
  }

  function fetchPrompts() {
    var payload = internalSequence("mcp_prompts_list", {
      idJson: "1",
      paramsJson: "{}"
    }) || {};
    return payload.prompts || [];
  }

  function loadTemplate(filename) {
    var file = new File(resolveProjectRoot(), "knowledge/templates/" + filename);
    if (!file.isFile()) {
      throw new Error("Maintainer docs template not found: " + file.getAbsolutePath());
    }
    return readText(file);
  }

  function normalizeWhitespace(value) {
    return trim(value).replace(/\r\n?/g, "\n");
  }

  function oneLine(value) {
    return normalizeWhitespace(value).replace(/\s+/g, " ");
  }

  function mdEscape(value) {
    return oneLine(value)
      .replace(/\|/g, "\\|")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function code(value) {
    return "`" + String(value == null ? "" : value).replace(/`/g, "\\`") + "`";
  }

  function formatDateUtc(now) {
    return String(new SimpleDateFormat("yyyy-MM-dd").format(now || new Date()));
  }

  function formatDateTimeUtc(now) {
    return String(new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(now || new Date()));
  }

  function renderTable(headers, rows) {
    var lines = [];
    lines.push("| " + headers.join(" | ") + " |");
    lines.push("|" + headers.map(function () { return "---"; }).join("|") + "|");
    for (var i = 0; i < rows.length; i++) {
      lines.push("| " + rows[i].join(" | ") + " |");
    }
    return lines.join("\n");
  }

  function sortByName(items, field) {
    return (items || []).slice().sort(function (a, b) {
      var left = trim(a && a[field]).toLowerCase();
      var right = trim(b && b[field]).toLowerCase();
      if (left < right) {
        return -1;
      }
      if (left > right) {
        return 1;
      }
      return 0;
    });
  }

  function buildToolTable(tools) {
    var rows = [];
    var sorted = sortByName(tools, "name");
    for (var i = 0; i < sorted.length; i++) {
      var tool = sorted[i] || {};
      rows.push([
        code(trim(tool.name)),
        code(trim(tool.sequence)),
        mdEscape(tool.title),
        mdEscape(tool.description)
      ]);
    }
    return renderTable(["Tool", "Sequence", "Title", "Description"], rows);
  }

  function buildResourceTable(resources) {
    var rows = [];
    var sorted = sortByName(resources, "uri");
    for (var i = 0; i < sorted.length; i++) {
      var item = sorted[i] || {};
      rows.push([
        code(trim(item.uri)),
        mdEscape(item.title || item.name),
        mdEscape(item.description),
        mdEscape(item.guidanceLevel || "")
      ]);
    }
    return renderTable(["URI", "Title", "Description", "Guidance"], rows);
  }

  function buildPromptTable(prompts) {
    var rows = [];
    var sorted = sortByName(prompts, "name");
    for (var i = 0; i < sorted.length; i++) {
      var item = sorted[i] || {};
      rows.push([
        code(trim(item.name)),
        mdEscape(item.title || item.name),
        mdEscape(item.description),
        mdEscape(item.roleId || "")
      ]);
    }
    return renderTable(["Prompt", "Title", "Description", "Role"], rows);
  }

  function replaceVars(template, vars) {
    return String(template).replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, function (_all, key) {
      return Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : "";
    });
  }

  function buildAgentDoc(snapshot, now) {
    return replaceVars(loadTemplate("maintainer_agent.template.md"), {
      generatedAt: formatDateTimeUtc(now),
      reviewDate: formatDateUtc(now),
      serverName: trim(snapshot.initialize && snapshot.initialize.serverInfo && snapshot.initialize.serverInfo.name),
      serverTitle: trim(snapshot.initialize && snapshot.initialize.serverInfo && snapshot.initialize.serverInfo.title),
      serverVersion: trim(snapshot.initialize && snapshot.initialize.serverInfo && snapshot.initialize.serverInfo.version),
      protocolVersion: trim(snapshot.initialize && snapshot.initialize.protocolVersion),
      toolCount: String((snapshot.tools || []).length),
      resourceCount: String((snapshot.resources || []).length),
      promptCount: String((snapshot.prompts || []).length)
    });
  }

  function buildToolsDoc(snapshot, now) {
    return replaceVars(loadTemplate("maintainer_tools.template.md"), {
      generatedAt: formatDateTimeUtc(now),
      reviewDate: formatDateUtc(now),
      serverVersion: trim(snapshot.initialize && snapshot.initialize.serverInfo && snapshot.initialize.serverInfo.version),
      toolCount: String((snapshot.tools || []).length),
      resourceCount: String((snapshot.resources || []).length),
      promptCount: String((snapshot.prompts || []).length),
      toolTable: buildToolTable(snapshot.tools || []),
      resourceTable: buildResourceTable(snapshot.resources || []),
      promptTable: buildPromptTable(snapshot.prompts || [])
    });
  }

  function summarizeWrite(targetFile, content, dryRun) {
    var previous = readTextIfExists(targetFile);
    var next = String(content == null ? "" : content);
    var changed = previous !== next;
    var status = changed ? (previous.length ? "updated" : "created") : "unchanged";
    if (!dryRun && changed) {
      writeText(targetFile, next);
    }
    return {
      path: targetFile.getAbsolutePath(),
      status: status,
      changed: changed,
      bytes: next.length
    };
  }

  C8O.maintainerDocs.refresh = function (options) {
    var now = new Date();
    var dryRun = toBoolean(options && options.dryRun, false);
    var root = resolveOutputRoot(options && options.docsRoot);

    var snapshot = {
      initialize: fetchInitialize(),
      tools: fetchTools(),
      resources: fetchResources(),
      prompts: fetchPrompts()
    };

    var agentTarget = new File(root, "AGENT.md");
    var toolsTarget = new File(root, "TOOLS.md");
    var agentContent = buildAgentDoc(snapshot, now);
    var toolsContent = buildToolsDoc(snapshot, now);

    return {
      status: "success",
      dryRun: dryRun,
      generatedAt: formatDateTimeUtc(now),
      root: root.getAbsolutePath(),
      snapshot: {
        protocolVersion: trim(snapshot.initialize && snapshot.initialize.protocolVersion),
        serverName: trim(snapshot.initialize && snapshot.initialize.serverInfo && snapshot.initialize.serverInfo.name),
        serverTitle: trim(snapshot.initialize && snapshot.initialize.serverInfo && snapshot.initialize.serverInfo.title),
        serverVersion: trim(snapshot.initialize && snapshot.initialize.serverInfo && snapshot.initialize.serverInfo.version),
        toolCount: (snapshot.tools || []).length,
        resourceCount: (snapshot.resources || []).length,
        promptCount: (snapshot.prompts || []).length
      },
      files: [
        summarizeWrite(agentTarget, agentContent, dryRun),
        summarizeWrite(toolsTarget, toolsContent, dryRun)
      ],
      previews: dryRun ? {
        agent: agentContent,
        tools: toolsContent
      } : {}
    };
  };
})();

var refreshMaintainerDocsResult = C8O.maintainerDocs.refresh({
  docsRoot: (typeof docsRoot !== "undefined") ? docsRoot : "",
  dryRun: (typeof dryRun !== "undefined") ? dryRun : false
});
