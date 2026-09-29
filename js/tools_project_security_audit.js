/*
 * project-security-audit: static security audit of one project with a 0-100 score.
 * Inputs arrive as strings from internal_call; the report is exposed as auditResult.
 */
include("js/security_audit_rules.js");
include("js/security_audit_collect.js");

var auditProjectName = C8O.util.toTrimmedString(project);
if (!auditProjectName.length) {
  throw new Error("project is required");
}

var auditMinSeverity = C8O.util.toTrimmedString(minSeverity).toLowerCase();
if (!auditMinSeverity.length) {
  auditMinSeverity = "low";
}
if (C8O.securityAudit.SEVERITIES.indexOf(auditMinSeverity) === -1) {
  throw new Error("minSeverity must be one of " + C8O.securityAudit.SEVERITIES.join(", "));
}

var auditLimit = parseInt(C8O.util.toTrimmedString(limit), 10);
if (isNaN(auditLimit)) {
  auditLimit = 200;
}
auditLimit = Math.max(1, Math.min(1000, auditLimit));

var auditSuppress = [];
var suppressText = C8O.util.toTrimmedString(suppress);
if (suppressText.length && suppressText !== "null" && suppressText !== "undefined") {
  var parsedSuppress = null;
  try {
    parsedSuppress = JSON.parse(suppressText);
    if (typeof parsedSuppress === "string") {
      parsedSuppress = JSON.parse(parsedSuppress);
    }
  } catch (suppressError) {
    throw new Error("suppress must be a JSON array of {ruleId, qname?, reason}: " + String(suppressError));
  }
  if (!Array.isArray(parsedSuppress)) {
    throw new Error("suppress must be an array of {ruleId, qname?, reason}");
  }
  auditSuppress = parsedSuppress;
}

var auditIncludeEngine = C8O.util.toBoolean(includeEngine, true) !== false;
var auditIncludeFrontend = C8O.util.toBoolean(includeFrontend, true) !== false;

var auditModel = C8O.securityAudit.collect(auditProjectName, {
  includeEngine: auditIncludeEngine,
  includeFrontend: auditIncludeFrontend
});

var auditResult = C8O.securityAudit.buildReport(auditModel, {
  minSeverity: auditMinSeverity,
  limit: auditLimit,
  suppress: auditSuppress,
  includeEngine: auditIncludeEngine,
  auditedAt: new Date().toISOString()
});
