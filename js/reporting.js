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
  if (!C8O.reporting._ALLOWED_MODES[mode]) {
    return "off";
  }
  return mode;
};

C8O.reporting.isEnabled = function () {
  return C8O.reporting.resolveMode() !== "off";
};

C8O.reporting.promptSuffix = function (mode) {
  if (mode === "suggest") {
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
