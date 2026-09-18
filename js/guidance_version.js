if (typeof C8O === "undefined") {
  var C8O = {};
}

include("js/catalog_loader.js");

C8O.guidance = C8O.guidance || {};

(function () {
  function trim(value) {
    return value == null ? "" : String(value).replace(/^\s+|\s+$/g, "");
  }

  // Human-readable label only. Freshness is guaranteed by the content
  // fingerprint appended below, not by this constant: never rely on editing it.
  var GUIDANCE_LABEL = "2026-09-18.skill-layers";

  // Files whose content defines the installed guidance. The common skill and
  // the per-harness bootstraps (js/setup_common.js) are the skill text itself;
  // the resources index and the task routes define layer 3 and the routing
  // table embedded in the common skill.
  var FINGERPRINT_SOURCES = [
    ["resources", "convertigo_common_skill.md"],
    ["resources", "convertigo_task_routes.json"],
    ["resources", "resources_index.json"],
    ["js", "setup_common.js"]
  ];

  function mul32(a, b) {
    // Exact 32-bit multiply without Math.imul (Rhino 1.7 does not expose it).
    var aLow = a & 0xffff;
    var aHigh = (a >>> 16) & 0xffff;
    return (((aLow * b) >>> 0) + ((((aHigh * b) & 0xffff) << 16) >>> 0)) >>> 0;
  }

  function hashPart(text, seed) {
    // FNV-1a, 32 bits.
    var hash = seed >>> 0;
    var source = String(text == null ? "" : text);
    for (var i = 0; i < source.length; i++) {
      hash = (hash ^ (source.charCodeAt(i) & 0xffff)) >>> 0;
      hash = mul32(hash, 0x01000193);
    }
    var hex = (hash >>> 0).toString(16);
    while (hex.length < 8) {
      hex = "0" + hex;
    }
    return hex;
  }

  // Pure JavaScript so the same value can be recomputed by the Node tests.
  C8O.guidance.fingerprintOf = function (parts) {
    var joined = [];
    var items = parts && parts.length ? parts : [];
    for (var i = 0; i < items.length; i++) {
      joined.push(String(items[i] == null ? "" : items[i]).replace(/\r\n?/g, "\n"));
    }
    var text = joined.join("\n--c8o-guidance-part--\n");
    return hashPart(text, 0x811c9dc5) + hashPart(text, 0x9e3779b9);
  };

  C8O.guidance.fingerprintSources = function () {
    var names = [];
    for (var i = 0; i < FINGERPRINT_SOURCES.length; i++) {
      names.push(FINGERPRINT_SOURCES[i][0] + "/" + FINGERPRINT_SOURCES[i][1]);
    }
    return names;
  };

  var CACHE_KEY_PROPERTY = "convertigo.mcp.guidanceVersion.key";
  var CACHE_VALUE_PROPERTY = "convertigo.mcp.guidanceVersion.value";

  function sourceStamp() {
    // Cheap change detector so the fingerprint is not recomputed on every MCP
    // request. Editing any source file changes its size or timestamp.
    var File = Packages.java.io.File;
    var parts = [];
    for (var i = 0; i < FINGERPRINT_SOURCES.length; i++) {
      var file = new File(
        c8oResolveCatalogDirectory(FINGERPRINT_SOURCES[i][0]),
        FINGERPRINT_SOURCES[i][1]
      );
      parts.push(String(file.length()) + "@" + String(file.lastModified()));
    }
    return parts.join("|");
  }

  function computeGuidanceVersion() {
    var stamp = "";
    try {
      stamp = sourceStamp();
      if (String(java.lang.System.getProperty(CACHE_KEY_PROPERTY)) === stamp) {
        var cached = trim(java.lang.System.getProperty(CACHE_VALUE_PROPERTY));
        if (cached.length) {
          return cached;
        }
      }
    } catch (_ignoreStamp) {
      stamp = "";
    }
    var parts = [];
    for (var i = 0; i < FINGERPRINT_SOURCES.length; i++) {
      parts.push(String(c8oReadCatalogFile(FINGERPRINT_SOURCES[i][0], FINGERPRINT_SOURCES[i][1])));
    }
    var version = GUIDANCE_LABEL + "." + C8O.guidance.fingerprintOf(parts);
    if (stamp.length) {
      try {
        java.lang.System.setProperty(CACHE_VALUE_PROPERTY, version);
        java.lang.System.setProperty(CACHE_KEY_PROPERTY, stamp);
      } catch (_ignoreCacheWrite) {}
    }
    return version;
  }

  C8O.guidance.computeVersion = computeGuidanceVersion;

  if (!trim(C8O.MCP_GUIDANCE_VERSION).length) {
    try {
      C8O.MCP_GUIDANCE_VERSION = computeGuidanceVersion();
    } catch (_ignoreFingerprint) {
      // No project directory (unit tests, early engine startup): keep a stable
      // label so guarded tool calls still have a comparable value.
      C8O.MCP_GUIDANCE_VERSION = GUIDANCE_LABEL + ".unresolved";
    }
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
