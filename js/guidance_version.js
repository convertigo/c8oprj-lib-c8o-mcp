if (typeof C8O === "undefined") {
  var C8O = {};
}

// Bump this value whenever setup-generated skills or mandatory MCP onboarding
// guidance changes in a way agents should detect before mutating projects.
C8O.MCP_GUIDANCE_VERSION = "2026-07-01.skill-sync-v3";

C8O.guidance = C8O.guidance || {};

(function () {
  function trim(value) {
    return value == null ? "" : String(value).replace(/^\s+|\s+$/g, "");
  }

  function firstNonEmpty(values) {
    for (var i = 0; i < values.length; i++) {
      var text = trim(values[i]);
      if (text.length) {
        return text;
      }
    }
    return "";
  }

  C8O.guidance.expectedVersion = function () {
    return C8O.MCP_GUIDANCE_VERSION;
  };

  C8O.guidance.versionFromRequest = function (params, headerVersion, toolArguments) {
    var meta = params && typeof params._meta === "object" && !Array.isArray(params._meta) ? params._meta : {};
    var args = toolArguments && typeof toolArguments === "object" && !Array.isArray(toolArguments) ? toolArguments : {};
    return firstNonEmpty([
      meta.convertigoGuidanceVersion,
      meta.guidanceVersion,
      meta["convertigo.guidanceVersion"],
      headerVersion,
      args.__convertigoGuidanceVersion,
      args.__guidanceVersion
    ]);
  };

  C8O.guidance.stripToolArguments = function (toolArguments) {
    if (!toolArguments || typeof toolArguments !== "object" || Array.isArray(toolArguments)) {
      return toolArguments;
    }
    delete toolArguments.__convertigoGuidanceVersion;
    delete toolArguments.__guidanceVersion;
    return toolArguments;
  };

  C8O.guidance.isGuardedTool = function (toolName) {
    var name = trim(toolName).toLowerCase();
    if (!name.length) {
      return false;
    }
    var guarded = {
      "project-list": true,
      "batch-call": true,
      "databaseobject-delete": true,
      "databaseobject-move": true,
      "databaseobject-rename": true,
      "databaseobject-tree-apply": true,
      "marketplace-import": true,
      "nocode-baserow-schema-apply": true,
      "nocode-form-update": true,
      "project-delete": true,
      "project-js-set": true,
      "project-reload": true,
      "project-save": true,
      "requestable-stub-set": true,
      "upsert-crud": true,
      "upsert-ngx-crud-kit": true
    };
    return guarded[name] === true;
  };

  C8O.guidance.warningForRequest = function (params, headerVersion, toolArguments) {
    var expected = C8O.guidance.expectedVersion();
    var received = C8O.guidance.versionFromRequest(params, headerVersion, toolArguments);
    if (!received.length) {
      return "mcp_guidance_version_missing expected=" + expected;
    }
    if (received !== expected) {
      return "mcp_guidance_version_mismatch expected=" + expected + " got=" + received;
    }
    return "";
  };

  C8O.guidance.warningForToolCall = function (toolName, params, headerVersion, toolArguments) {
    if (!C8O.guidance.isGuardedTool(toolName)) {
      return "";
    }
    return C8O.guidance.warningForRequest(params, headerVersion, toolArguments);
  };
})();
