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

  var NOCODE_SKILL_FOLDER = "convertigo-nocode";
  var NOCODE_SKILL_FILE = NOCODE_SKILL_FOLDER + "/SKILL.md";

  // The drawer files the No Code skill names, in its order (the drawer lines of SKILL.md, as tests/helpers/nocode_skill
  // and the setups read them).
  function noCodeDrawerNames(skillText) {
    var names = [];
    var pattern = /^> Drawer `([a-z0-9][a-z0-9-]*\.md)`/gm;
    var match;
    while ((match = pattern.exec(String(skillText == null ? "" : skillText))) !== null) {
      if (names.indexOf(match[1]) < 0) {
        names.push(match[1]);
      }
    }
    return names;
  }

  // Files whose content defines the installed guidance. The common skill and
  // the per-harness bootstraps (js/setup_common.js) are the skill text itself;
  // the resources index and the task routes define layer 3 and the routing
  // table embedded in the common skill.
  var FINGERPRINT_SOURCES = [
    ["resources", "convertigo_common_skill.md"],
    ["resources", "convertigo_task_routes.json"],
    ["resources", "resources_index.json"],
    ["resources", "guide_drawers.json"],
    ["js", "resources.js"],
    ["js", "setup_common.js"],
    // The No Code skill and its drawers (named by its "> Drawer `x.md`" lines, read below): an installed copy of it
    // (_setupCodex, _setupClaude, the Agent Bridge) carries this version, so a change of it makes the copy stale.
    ["resources", NOCODE_SKILL_FILE]
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

  // The texts the version is the fingerprint of: the sources above, then the drawers the No Code skill names.
  // readFile(folder, name): c8oReadCatalogFile in the engine, a file read in the Agent Bridge and the tests.
  C8O.guidance.fingerprintParts = function (readFile) {
    var parts = [];
    var skillText = "";
    for (var i = 0; i < FINGERPRINT_SOURCES.length; i++) {
      var text = String(readFile(FINGERPRINT_SOURCES[i][0], FINGERPRINT_SOURCES[i][1]));
      if (FINGERPRINT_SOURCES[i][1] === NOCODE_SKILL_FILE) {
        skillText = text;
      }
      parts.push(text);
    }
    var drawers = noCodeDrawerNames(skillText);
    for (var d = 0; d < drawers.length; d++) {
      parts.push(String(readFile("resources", NOCODE_SKILL_FOLDER + "/" + drawers[d])));
    }
    return parts;
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
    // every file of the No Code skill folder, the drawers included
    var folder = new File(c8oResolveCatalogDirectory("resources"), NOCODE_SKILL_FOLDER);
    var files = folder.listFiles();
    var names = [];
    for (var f = 0; files !== null && f < files.length; f++) {
      names.push(String(files[f].getName()) + "=" + String(files[f].length()) + "@" + String(files[f].lastModified()));
    }
    names.sort();
    parts.push(names.join(","));
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
    var parts = C8O.guidance.fingerprintParts(c8oReadCatalogFile);
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
  C8O.guidance.noCodeDrawerNames = noCodeDrawerNames;

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
      "business-sequence-create": true,
      "facade-create": true,
      "marketplace-import": true,
      "ngx-page-create": true,
      "ngx-theme-apply": true,
      "nocode-app-create": true,
      "nocode-baserow-schema-apply": true,
      "nocode-form-publish": true,
      "nocode-form-update": true,
      "project-delete": true,
      "project-js-set": true,
      "project-reload": true,
      "project-save": true,
      "requestable-stub-set": true,
      "scheduler-apply": true,
      "sql-transaction-create": true,
      "upsert-crud": true
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

  // A No Code write from a client whose installed skill carries another guidance version (a Codex or Claude Code home set
  // up by an earlier _setupCodex, an agent outside Tigo): its skill is out of date. Said once per session (the
  // conversation, else the bearer: js/mcp_repeated_failures.js sessionKey), on the writes only, and only when the client
  // sends its version; a client that sends none is not told. Answers null for a tool that is not a No Code one (its
  // guarded warning, if any, stays), "" when there is nothing to say.
  var NOCODE_WRITE_TOOLS = {
    "nocode-form-create": true, "nocode-form-edit": true, "nocode-form-update": true, "nocode-form-publish": true,
    "nocode-app-create": true, "nocode-baserow-schema-apply": true, "nocode-baserow-rows-delete": true
  };
  var NOCODE_NOTICE_KEY = "lib_ConvertigoMCP.noCodeSkillNotices";
  var NOCODE_NOTICE_MAX = 5000;
  C8O.guidance.noCodeSkillNotice = function (toolName, params, headerVersion, toolArguments, store, sessionKey, newMap) {
    var name = trim(toolName).toLowerCase().replace(/_/g, "-");
    if (!/^nocode-/.test(name)) {
      return null;
    }
    if (NOCODE_WRITE_TOOLS[name] !== true) {
      return "";
    }
    var expected = C8O.guidance.expectedVersion();
    var received = C8O.guidance.versionFromRequest(params, headerVersion, toolArguments);
    if (!received.length || received === expected) {
      return "";
    }
    try {
      if (store && typeof newMap === "function") {
        if (store.get(NOCODE_NOTICE_KEY) == null) {
          store.set(NOCODE_NOTICE_KEY, newMap());
        }
        var seen = store.get(NOCODE_NOTICE_KEY);
        if (seen.size() > NOCODE_NOTICE_MAX) {
          seen.clear();
        }
        if (seen.putIfAbsent(trim(sessionKey) + "|" + received + "|" + expected, "1") != null) {
          return "";
        }
      }
    } catch (_noNoticeStore) {}
    return "convertigo_nocode_skill_outdated: the installed Convertigo No Code skill is out of date (installed " + received +
      ", this MCP serves " + expected + "). Rerun the setup of your harness for this MCP endpoint (_setupCodex, _setupClaude or " +
      "_setupVibe) and reload the skill before the next change. Said once per session.";
  };

  C8O.guidance.warningForToolCall = function (toolName, params, headerVersion, toolArguments) {
    if (!C8O.guidance.isGuardedTool(toolName)) {
      return "";
    }
    return C8O.guidance.warningForRequest(params, headerVersion, toolArguments);
  };
})();
