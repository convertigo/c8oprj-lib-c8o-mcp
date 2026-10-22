if (typeof C8O === "undefined" || typeof C8O.project === "undefined") {
  include("js/util.js");
}

C8O.reporting = C8O.reporting || {};

C8O.reporting._MODE_EXPRESSION = "${mcp.report.mode=off}";
C8O.reporting._ALLOWED_MODES = {
  off: true,
  suggest: true,
  benchmark: true
};

C8O.reporting.resolveMode = function () {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var rawValue = "off";
  try {
    rawValue = Engine.theApp.databaseObjectsManager.getCompiledValue(C8O.reporting._MODE_EXPRESSION);
  } catch (_ignoredCompiledValue) {
    rawValue = "off";
  }
  var mode = C8O.util.toTrimmedString(rawValue).toLowerCase();
  if (!C8O.reporting._ALLOWED_MODES[mode] || mode === "off") {
    // Without a benchmark mode, the Studio user's consent to send feedback to Convertigo (Tigo /retours) opens it.
    return C8O.reporting.tigoMode() === "off" ? "off" : "tigo";
  }
  return mode;
};

// The folder of Tigo's feedback for this request: the Studio's, or on a server the No Code Studio user's
// (agents/feedback/users/<userKey>), or "" when there is none.
C8O.reporting._feedbackDirectory = function (userKey) {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  if (Engine.isStudioMode()) {
    return "agents/feedback";
  }
  if (!C8O.reporting.serverFeedbackKeyInstalled()) {
    return "";
  }
  var key = C8O.util.toTrimmedString(userKey === undefined ? C8O.reporting.requestFeedbackUserKey() : userKey);
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,159}$/.test(key) || key.indexOf("..") !== -1 || key === "studio") {
    return "";
  }
  return "agents/feedback/users/" + key;
};

// A server sends Tigo's feedback with the feedback key Convertigo ops installed: the TIGO_FEEDBACK_KEY environment
// variable, else <workspace>/agents/feedback/server-key (lib_ConvertigoAssistant docs/tigo-feedback.md).
C8O.reporting.serverFeedbackKeyInstalled = function () {
  try {
    var key = C8O.util.toTrimmedString(java.lang.System.getenv("TIGO_FEEDBACK_KEY"));
    if (!key.length) {
      var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
      var file = new java.io.File(String(Engine.USER_WORKSPACE_PATH), "agents/feedback/server-key");
      if (file.isFile() && file.length() < 512 && !java.nio.file.Files.isSymbolicLink(file.toPath())) {
        key = C8O.util.toTrimmedString(new java.lang.String(java.nio.file.Files.readAllBytes(file.toPath()), "UTF-8"));
      }
    }
    return /^sk-[A-Za-z0-9_-]{32,128}$/.test(key);
  } catch (_ignoredServerKey) {
    return false;
  }
};

// The key of a No Code Studio user's Tigo conversations and feedback, from the user C8Oforms signs their MCP token for
// (the engine's authenticated user): the email of an OAuth user (provider:subject:email), the whole name otherwise.
// Same rule as lib_ConvertigoAssistant agent_bridge_client.js (callerUserId, then userPathSlug).
C8O.reporting.feedbackUserKey = function (user) {
  var text = C8O.util.toTrimmedString(user);
  var parts = text.split(":");
  var last = parts[parts.length - 1];
  if (parts.length > 2 && last.indexOf("@") > 0) {
    text = last;
  }
  if (!text.length || text.toLowerCase() === "studio") {
    return "";
  }
  var readable = text.toLowerCase().replace(/[^A-Za-z0-9_.-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  if (!readable.length) {
    readable = "user";
  }
  if (readable.length > 80) {
    readable = readable.substring(0, 80).replace(/[_.-]+$/g, "");
  }
  var digest = java.security.MessageDigest.getInstance("SHA-256").digest(new java.lang.String(text).getBytes("UTF-8"));
  var hex = "";
  for (var i = 0; i < digest.length && hex.length < 16; i++) {
    var n = Number(digest[i]);
    if (n < 0) {
      n += 256;
    }
    hex += (n < 16 ? "0" : "") + n.toString(16);
  }
  return readable + "--" + hex.substring(0, 16);
};

// The No Code Studio user of this MCP request on a server: only a token C8Oforms signed names one.
C8O.reporting.requestFeedbackUserKey = function () {
  try {
    if (typeof context === "undefined" || !context) {
      return "";
    }
    if (typeof C8O.mcpAuth === "undefined" || typeof C8O.mcpAuth.authenticateRequest !== "function") {
      include("js/mcp_auth.js");
    }
    var authentication = C8O.mcpAuth.authenticateRequest(context);
    if (!authentication || authentication.authenticated !== true || authentication.kind !== "nocode") {
      return "";
    }
    return C8O.reporting.feedbackUserKey(authentication.user);
  } catch (_ignoredRequestUser) {
    return "";
  }
};

// The report tool this request lists: a No Code Studio token has its own (nocode-report-create).
C8O.reporting.reportToolName = function () {
  try {
    if (typeof C8O.mcpAuth === "undefined" || typeof C8O.mcpAuth.authenticateRequest !== "function") {
      include("js/mcp_auth.js");
    }
    var authentication = typeof context !== "undefined" && context ? C8O.mcpAuth.authenticateRequest(context) : null;
    return authentication && authentication.authenticated === true && authentication.kind === "nocode" ? "nocode-report-create" : "report-create";
  } catch (_ignoredToolName) {
    return "report-create";
  }
};

// Consent of Tigo's feedback to Convertigo (lib_ConvertigoAssistant docs/tigo-feedback.md): the administrator's
// assistant.feedback.policy symbol, else the user's choice in <engine workspace>/agents/feedback/settings.json, or on a
// server (once its feedback key is installed) in the No Code Studio user's agents/feedback/users/<userKey>/settings.json.
C8O.reporting.tigoMode = function (userKey) {
  try {
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    var directory = C8O.reporting._feedbackDirectory(userKey);
    if (!directory.length) {
      return "off";
    }
    var policy = C8O.util.toTrimmedString(Engine.theApp.databaseObjectsManager.symbolsGetValue("assistant.feedback.policy")).toLowerCase();
    if (policy === "off" || policy === "ask" || policy === "auto") {
      return policy;
    }
    var file = new java.io.File(String(Engine.USER_WORKSPACE_PATH), directory + "/settings.json");
    if (!file.isFile() || file.length() > 65536) {
      return "off";
    }
    var settings = JSON.parse(String(new java.lang.String(java.nio.file.Files.readAllBytes(file.toPath()), "UTF-8")));
    var mode = C8O.util.toTrimmedString(settings && settings.mode).toLowerCase();
    return mode === "ask" || mode === "auto" ? mode : "off";
  } catch (_ignoredConsent) {
    return "off";
  }
};

C8O.reporting.isEnabled = function () {
  return C8O.reporting.resolveMode() !== "off";
};

C8O.reporting.promptSuffix = function (mode) {
  if (mode === "suggest" || mode === "tigo") {
    return [
      "## Optional MCP feedback",
      "If you hit reusable MCP, guide, or prompt friction during this run, submit at most one short `report-create` call.",
      "Report only reusable product insights. Do not report generic task failure without a concrete MCP/doc/prompt issue."
    ].join("\n");
  }
  if (mode === "benchmark") {
    return [
      "## Benchmark feedback",
      "If you hit reusable MCP, guide, or prompt friction during this run, submit at most one short `report-create` call before finishing.",
      "Report only reusable product insights. Do not report generic task failure without a concrete MCP/doc/prompt issue."
    ].join("\n");
  }
  return "";
};

C8O.reporting.appendPromptFeedback = function (promptText) {
  var baseText = promptText == null ? "" : String(promptText);
  var mode = C8O.reporting.resolveMode();
  if (mode === "off") {
    return baseText;
  }
  var suffix = C8O.reporting.promptSuffix(mode);
  if (!suffix.length) {
    return baseText;
  }
  var trimmed = baseText.replace(/\s+$/, "");
  return trimmed.length ? trimmed + "\n\n" + suffix + "\n" : suffix + "\n";
};

C8O.reporting.sanitizeSegment = function (value) {
  var text = C8O.util.toTrimmedString(value).toLowerCase();
  if (!text.length) {
    return "item";
  }
  text = text.replace(/[^a-z0-9._-]+/g, "-");
  text = text.replace(/-+/g, "-");
  text = text.replace(/^[-.]+|[-.]+$/g, "");
  if (!text.length) {
    return "item";
  }
  return text;
};

C8O.reporting._resolveProjectInfo = function () {
  var projectInstance = null;
  try {
    projectInstance = context && context.project ? context.project : null;
  } catch (_ignoredContextProject) {
    projectInstance = null;
  }
  if (!projectInstance) {
    throw new Error("No project context available");
  }
  var projectDir = C8O.project.resolveProjectDirectory({ project: projectInstance, projectName: String(projectInstance.getName()) });
  var projectName = String(projectInstance.getName());
  var projectVersion = C8O.util.toTrimmedString(projectInstance.getVersion ? projectInstance.getVersion() : "");
  return {
    project: projectInstance,
    projectDir: projectDir,
    projectName: projectName,
    projectVersion: projectVersion,
    serverVersion: projectVersion
  };
};

C8O.reporting._resolveFeedbackDirectory = function (projectInfo, createdAtDate) {
  var File = Packages.java.io.File;
  var year = String(createdAtDate.getUTCFullYear());
  var month = String(createdAtDate.getUTCMonth() + 1);
  if (month.length < 2) {
    month = "0" + month;
  }
  var feedbackDir = new File(projectInfo.projectDir, "feedback/inbox/" + year + "/" + month).getCanonicalFile();
  java.nio.file.Files.createDirectories(feedbackDir.toPath());
  return feedbackDir;
};

C8O.reporting._validateEnum = function (label, value, allowed) {
  var normalized = C8O.util.toTrimmedString(value).toLowerCase();
  if (!allowed[normalized]) {
    throw new Error(label + " must be one of: " + Object.keys(allowed).join(", "));
  }
  return normalized;
};

C8O.reporting._optionalString = function (value) {
  var text = C8O.util.toTrimmedString(value);
  return text.length ? text : null;
};

C8O.reporting.writeReport = function (input) {
  var mode = C8O.reporting.resolveMode();
  if (mode === "off") {
    throw new Error("Reporting is disabled");
  }

  if (mode === "tigo") {
    return C8O.reporting.writeTigoReport(input);
  }

  var info = C8O.reporting._resolveProjectInfo();
  var area = C8O.reporting._validateEnum("area", input && input.area, {
    tool: true,
    guide: true,
    prompt: true,
    scenario: true,
    fixture: true,
    "product-knowledge-gap": true
  });
  var severity = C8O.reporting._validateEnum("severity", input && input.severity, {
    low: true,
    medium: true,
    high: true
  });
  var subjectId = C8O.util.toTrimmedString(input && input.subjectId);
  if (!subjectId.length) {
    throw new Error("subjectId is required");
  }
  var summary = C8O.util.toTrimmedString(input && input.summary);
  if (!summary.length) {
    throw new Error("summary is required");
  }

  var createdDate = new Date();
  var createdAt = createdDate.toISOString();
  var reportId = String(Packages.java.util.UUID.randomUUID().toString());
  var subjectSlug = C8O.reporting.sanitizeSegment(subjectId);
  var timestampSlug = createdAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace("T", "_");
  var shortId = reportId.substring(0, 8);
  var filename = timestampSlug + "_" + area + "_" + subjectSlug + "_" + shortId + ".json";
  var feedbackDir = C8O.reporting._resolveFeedbackDirectory(info, createdDate);
  var projectPath = info.projectDir.getCanonicalFile().toPath();
  var targetFile = new Packages.java.io.File(feedbackDir, filename).getCanonicalFile();
  var targetPath = targetFile.toPath();
  if (!targetPath.startsWith(projectPath)) {
    throw new Error("Resolved feedback path escapes project directory");
  }

  var payload = {
    schemaVersion: "1.0.0",
    reportId: reportId,
    createdAt: createdAt,
    mode: mode,
    finding: {
      area: area,
      subjectId: subjectId,
      severity: severity,
      summary: summary,
      evidence: C8O.reporting._optionalString(input && input.evidence),
      suggestion: C8O.reporting._optionalString(input && input.suggestion)
    },
    source: {
      serverVersion: info.serverVersion || null,
      projectVersion: info.projectVersion || null,
      rolePrompt: C8O.reporting._optionalString(input && input.rolePrompt),
      project: C8O.reporting._optionalString(input && input.project),
      runMode: C8O.reporting._optionalString(input && input.runMode),
      runId: C8O.reporting._optionalString(input && input.runId),
      provider: C8O.reporting._optionalString(input && input.provider),
      model: C8O.reporting._optionalString(input && input.model)
    }
  };

  var jsonText = JSON.stringify(payload, null, 2) + "\n";
  java.nio.file.Files.write(
    targetPath,
    new java.lang.String(jsonText).getBytes(java.nio.charset.StandardCharsets.UTF_8),
    java.nio.file.StandardOpenOption.CREATE_NEW,
    java.nio.file.StandardOpenOption.WRITE
  );

  return {
    status: "written",
    message: "Feedback report written",
    reportId: reportId,
    mode: mode,
    path: String(targetFile.getPath()),
    relativePath: String(projectPath.relativize(targetPath).toString()),
    createdAt: createdAt
  };
};

// With Tigo's consent, the report is a raw agent friction for the Assistant's feedback outbox: it masks it, counts it
// with the same ones, and shows it to the user before it is sent (or sends it after the turn in automatic mode).
C8O.reporting.writeTigoReport = function (input) {
  // On a server, the No Code Studio user of this request, read once: their consent and their incoming/ folder.
  var userKey = Packages.com.twinsoft.convertigo.engine.Engine.isStudioMode() ? undefined : C8O.reporting.requestFeedbackUserKey();
  var directory = C8O.reporting._feedbackDirectory(userKey);
  var mode = directory.length ? C8O.reporting.tigoMode(userKey) : "off";
  if (mode === "off") {
    throw new Error("Reporting is disabled");
  }
  var area = C8O.reporting._validateEnum("area", input && input.area, {
    tool: true,
    guide: true,
    prompt: true,
    scenario: true,
    fixture: true,
    "product-knowledge-gap": true
  });
  var severity = C8O.reporting._validateEnum("severity", input && input.severity, { low: true, medium: true, high: true });
  var subjectId = C8O.util.toTrimmedString(input && input.subjectId);
  var summary = C8O.util.toTrimmedString(input && input.summary);
  if (!subjectId.length || !summary.length) {
    throw new Error("subjectId and summary are required");
  }
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var createdAt = new Date().toISOString();
  var reportId = String(Packages.java.util.UUID.randomUUID().toString());
  var workspace = java.nio.file.Paths.get(String(Engine.USER_WORKSPACE_PATH)).toRealPath();
  var incoming = workspace.resolve(directory).resolve("incoming");
  for (var p = incoming; p != null && !p.equals(workspace); p = p.getParent()) {
    if (java.nio.file.Files.isSymbolicLink(p)) {
      throw new Error("Unsafe feedback path");
    }
  }
  java.nio.file.Files.createDirectories(incoming);
  var payload = {
    kind: "agent_friction",
    createdAt: createdAt,
    finding: {
      area: area,
      subject: subjectId.substring(0, 120),
      severity: severity,
      summary: summary.substring(0, 2000),
      suggestion: C8O.util.toTrimmedString(input && input.suggestion).substring(0, 2000)
    },
    provider: C8O.reporting._optionalString(input && input.provider),
    model: C8O.reporting._optionalString(input && input.model)
  };
  java.nio.file.Files.write(
    incoming.resolve(reportId + ".json"),
    new java.lang.String(JSON.stringify(payload, null, 2) + "\n").getBytes(java.nio.charset.StandardCharsets.UTF_8),
    java.nio.file.StandardOpenOption.CREATE_NEW,
    java.nio.file.StandardOpenOption.WRITE
  );
  return {
    status: "written",
    message: mode === "auto"
      ? "Friction queued: Tigo sends it to Convertigo after this turn, masked."
      : "Friction queued: the user reviews it before it is sent to Convertigo.",
    reportId: reportId,
    mode: "tigo",
    path: "",
    relativePath: directory + "/incoming/" + reportId + ".json",
    createdAt: createdAt
  };
};
