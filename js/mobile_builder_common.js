include("js/util.js");
include("js/requestable_logs.js");
include("js/mobile_builder_cycle.js");

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.mobileBuilderCommon = C8O.mobileBuilderCommon || {};

(function () {
  function parseIntBounded(value, defaultValue, minValue, maxValue) {
    var out = defaultValue;
    if (value !== null && value !== undefined) {
      try {
        var parsed = parseInt(String(value).trim(), 10);
        if (!isNaN(parsed)) {
          out = parsed;
        }
      } catch (_ignoreInt) {}
    }
    if (out < minValue) {
      out = minValue;
    }
    if (out > maxValue) {
      out = maxValue;
    }
    return out;
  }

  function parseBoolean(value, defaultValue) {
    if (value === null || value === undefined) {
      return defaultValue === true;
    }
    var text = String(value).trim().toLowerCase();
    if (!text.length) {
      return defaultValue === true;
    }
    if (text === "true" || text === "1" || text === "yes" || text === "on") {
      return true;
    }
    if (text === "false" || text === "0" || text === "no" || text === "off") {
      return false;
    }
    return defaultValue === true;
  }

  function lower(value) {
    return value == null ? "" : String(value).toLowerCase();
  }

  function trim(value) {
    return value == null ? "" : String(value).trim();
  }

  function containsAny(text, tokens) {
    if (!tokens || !tokens.length) {
      return false;
    }
    for (var i = 0; i < tokens.length; i++) {
      if (text.indexOf(tokens[i]) !== -1) {
        return true;
      }
    }
    return false;
  }

  function compactText(value) {
    return trim(value).replace(/\s+/g, " ");
  }

  function parseJsonText(value) {
    var text = trim(value);
    if (!text.length) {
      return null;
    }
    try {
      return JSON.parse(String(text));
    } catch (_ignoreJsonParse) {}
    return null;
  }

  function isCompileErrorMessage(message, extra, level) {
    var merged = lower((message == null ? "" : String(message)) + " " + (extra == null ? "" : String(extra)));
    if (!merged.length) {
      return false;
    }
    if (
      (merged.indexOf("npm warn tar") !== -1 || merged.indexOf("tar_entry_error") !== -1) &&
      merged.indexOf("enoent") !== -1 &&
      merged.indexOf("node_modules/") !== -1
    ) {
      return false;
    }
    if (merged.indexOf("failed to compile") !== -1) {
      return true;
    }
    if (merged.indexOf("application bundle generation failed") !== -1) {
      return true;
    }
    if (merged.indexOf("compilation failed") !== -1) {
      return true;
    }
    if (merged.indexOf("build failed") !== -1) {
      return true;
    }
    if (/\bts[0-9]{4}\b/.test(merged) || /\bng[0-9]{4}\b/.test(merged)) {
      return true;
    }
    if (merged.indexOf("[error]") !== -1 || merged.indexOf("✘ [error]") !== -1) {
      return true;
    }
    if (merged.indexOf("plugin angular-compiler") !== -1) {
      return true;
    }
    if (merged.indexOf("error:") !== -1 && (merged.indexOf("src/") !== -1 || merged.indexOf(".ts") !== -1 || merged.indexOf(".html") !== -1)) {
      return true;
    }
    if (lower(level) === "error" && (merged.indexOf("src/") !== -1 || merged.indexOf(".ts") !== -1 || merged.indexOf(".html") !== -1)) {
      return true;
    }
    return false;
  }

  function pushCompileError(result, line) {
    if (!result.compileErrors) {
      result.compileErrors = [];
    }
    var entry = {
      time: line.time == null ? "" : String(line.time),
      level: line.level == null ? "" : String(line.level),
      category: line.category == null ? "" : String(line.category),
      message: line.message == null ? "" : String(line.message),
      extra: line.extra == null ? "" : String(line.extra)
    };
    var fingerprint = compactText(entry.level + " " + entry.category + " " + entry.message + " " + entry.extra);
    if (!fingerprint.length) {
      return;
    }
    for (var i = 0; i < result.compileErrors.length; i++) {
      var existing = result.compileErrors[i];
      var existingFingerprint = compactText(
        String(existing.level || "") + " " +
        String(existing.category || "") + " " +
        String(existing.message || "") + " " +
        String(existing.extra || "")
      );
      if (existingFingerprint === fingerprint) {
        return;
      }
    }
    result.compileErrors.push(entry);
  }

  function parseOpenUrl(text) {
    if (!text || !String(text).length) {
      return "";
    }
    var input = String(text);
    var match = /open your browser on (http\S*)/i.exec(input);
    if (match && match.length > 1) {
      return String(match[1]);
    }
    match = /local:\s*(http\S*)/i.exec(input);
    if (match && match.length > 1) {
      return String(match[1]);
    }
    return "";
  }

  function parsePortFromUrl(url) {
    var text = trim(url);
    if (!text.length) {
      return 0;
    }
    var match = /https?:\/\/[^/:]+:(\d+)/i.exec(text);
    if (match && match.length > 1) {
      try {
        return parseInt(match[1], 10);
      } catch (_ignorePort) {}
    }
    return 0;
  }

  function isBlankBrowserUrl(url) {
    var text = lower(trim(url));
    return !text.length || text === "about:blank";
  }

  function normalizeEndpoint(endpoint) {
    var text = trim(endpoint);
    while (text.length > 0 && text.charAt(text.length - 1) === "/") {
      text = text.substring(0, text.length - 1);
    }
    return text;
  }

  function stripQueryAndHash(url) {
    var text = trim(url);
    if (!text.length) {
      return "";
    }
    var hashIndex = text.indexOf("#");
    if (hashIndex >= 0) {
      text = text.substring(0, hashIndex);
    }
    var queryIndex = text.indexOf("?");
    if (queryIndex >= 0) {
      text = text.substring(0, queryIndex);
    }
    return normalizeEndpoint(text);
  }

  function deriveViewerBaseUrl(viewerUrl, nodeUrl) {
    var text = stripQueryAndHash(viewerUrl || nodeUrl || "");
    if (!text.length) {
      return normalizeEndpoint(nodeUrl || "");
    }
    text = text.replace(/\/displayobjects\/mobile\/home$/i, "");
    text = text.replace(/\/displayobjects\/mobile\/index\.html$/i, "");
    text = text.replace(/\/home$/i, "");
    text = text.replace(/\/index\.html$/i, "");
    return normalizeEndpoint(text);
  }

  function deriveViewerHomeUrl(viewerBaseUrl, viewerUrl, rootPageSegment) {
    var base = normalizeEndpoint(viewerBaseUrl);
    var segment = trim(rootPageSegment || "home").replace(/^\/+|\/+$/g, "");
    if (base.length) {
      return base + "/" + (segment.length ? segment : "home");
    }
    var raw = stripQueryAndHash(viewerUrl || "");
    if (segment.length && lower(raw).slice(-(segment.length + 1)) === "/" + lower(segment)) {
      return raw;
    }
    return raw.length ? raw : "";
  }

  function browserShowsInstaller(browserState) {
    var merged = lower(
      (browserState && browserState.title ? browserState.title : "") + " " +
      (browserState && browserState.currentUrl ? browserState.currentUrl : "") + " " +
      (browserState && browserState.locationHref ? browserState.locationHref : "") + " " +
      (browserState && browserState.statusText ? browserState.statusText : "") + " " +
      (browserState && browserState.errorText ? browserState.errorText : "") + " " +
      (browserState && browserState.bodyTextSample ? browserState.bodyTextSample : "")
    );
    if (!merged.length) {
      return false;
    }
    return (
      merged.indexOf("your application will be displayed here") !== -1 ||
      merged.indexOf("install angular and ionic npm dependencies") !== -1 ||
      merged.indexOf("visual app viewer") !== -1 ||
      merged.indexOf("convertigo flashupdate") !== -1 ||
      merged.indexOf("launching application") !== -1 ||
      merged.indexOf("checking for updates") !== -1
    );
  }

  function hasViewerReadyEvidence(snapshot, editorState, browserState, nodeUrl) {
    var browserPresent = !!(browserState && browserState.hasBrowser === true);
    if (browserPresent) {
      if (browserState.hasError === true) {
        return false;
      }
      if (browserShowsInstaller(browserState)) {
        return false;
      }
      if (isBlankBrowserUrl(browserState.currentUrl || browserState.locationHref)) {
        return false;
      }
      return true;
    }
    if (snapshot && snapshot.compiled === true) {
      return true;
    }
    if (editorState && !isBlankBrowserUrl(editorState.currentUrl || editorState.viewerUrl)) {
      return true;
    }
    var openUrl = snapshot && snapshot.openUrl ? snapshot.openUrl : "";
    if (trim(openUrl).length && normalizeEndpoint(stripQueryAndHash(openUrl)) !== normalizeEndpoint(nodeUrl || "")) {
      return true;
    }
    return false;
  }

  function classifyReadiness(options) {
    var opts = options || {};
    var viewerReady = opts.viewerReady === true;
    var browserControlReady = opts.browserControlReady === true;
    var failed = opts.failed === true;
    var compileSucceeded = opts.compileSucceeded === true;
    var generationNoChange = opts.generationNoChange === true;
    var explicitBuildWait = opts.buildActive === true ||
      opts.waitingForGeneration === true ||
      opts.waitingForScheduledCycle === true ||
      opts.waitingForPendingCycle === true ||
      opts.waitingForViewerReload === true;
    var inferredBuildWait = opts.reportedBuilding === true &&
      browserControlReady !== true &&
      compileSucceeded !== true &&
      generationNoChange !== true;
    var compileBlocking = explicitBuildWait || inferredBuildWait;
    var compileState = failed
      ? "failed"
      : (compileBlocking
        ? "building"
        : (compileSucceeded
          ? "success"
          : (generationNoChange ? "not_required" : "unknown")));
    var ready = viewerReady && failed !== true && compileBlocking !== true;
    var readyReason = "";
    if (ready) {
      readyReason = compileState === "success"
        ? "compiled"
        : (compileState === "not_required"
          ? "generation_no_change"
          : (browserControlReady ? "browser_control_ready" : "viewer_ready"));
    }
    return {
      ready: ready,
      viewerReady: viewerReady,
      browserControlReady: browserControlReady,
      compileBlocking: compileBlocking,
      compileState: compileState,
      readyReason: readyReason
    };
  }

  function urlReachable(url, timeoutMs) {
    var text = trim(url);
    if (!text.length) {
      return false;
    }
    var URL = Packages.java.net.URL;
    var connection = null;
    var timeout = parseIntBounded(timeoutMs, 1500, 200, 10000);
    try {
      connection = new URL(text).openConnection();
      if (connection.setConnectTimeout) {
        connection.setConnectTimeout(timeout);
      }
      if (connection.setReadTimeout) {
        connection.setReadTimeout(timeout);
      }
      if (connection.setRequestMethod) {
        connection.setRequestMethod("GET");
      }
      if (connection.setRequestProperty) {
        connection.setRequestProperty("Accept", "text/html,application/javascript,text/javascript,*/*");
      }
      var code = connection.getResponseCode ? Number(connection.getResponseCode() || 0) : 200;
      return code >= 200 && code < 500;
    } catch (_ignoreReachable) {
      return false;
    } finally {
      if (connection && connection.disconnect) {
        try {
          connection.disconnect();
        } catch (_ignoreDisconnect) {}
      }
    }
  }

  function parseReadyState(lines, projectName) {
    var result = {
      openUrl: "",
      port: 0,
      compiled: false,
      failed: false,
      building: false,
      terminal: false,
      compileErrors: [],
      relevant: []
    };
    var projectToken = lower(projectName);
    var signals = [
      "open your browser on",
      "compiled",
      "application bundle generation complete",
      "failed to compile",
      "application source files updated",
      "ngxbuilder",
      "mobile builder"
    ];

    var list = lines || [];
    for (var i = 0; i < list.length; i++) {
      var line = list[i] || {};
      var message = line.message == null ? "" : String(line.message);
      var extra = line.extra == null ? "" : String(line.extra);
      var merged = lower(message + " " + extra);

      var openCandidate = parseOpenUrl(message);
      if (!openCandidate.length) {
        openCandidate = parseOpenUrl(extra);
      }
      if (openCandidate.length) {
        result.openUrl = openCandidate;
      }
      if (result.port <= 0) {
        var directPort = parsePortFromUrl(openCandidate);
        if (directPort > 0) {
          result.port = directPort;
        }
      }
      if (result.port <= 0) {
        var portMatch = /--port=([0-9]+)/i.exec(message);
        if (portMatch && portMatch.length > 1) {
          try {
            result.port = parseInt(portMatch[1], 10);
          } catch (_ignoreParsePort) {}
        }
      }
      if (merged.indexOf("building") !== -1 || merged.indexOf("rebuilding") !== -1 || merged.indexOf("bundle generation") !== -1) {
        result.building = true;
      }
      if (merged.indexOf("application source files updated") !== -1 || merged.indexOf("autobuild mode set to") !== -1) {
        result.building = true;
      }
      if (merged.indexOf("compiled") !== -1 && merged.indexOf("success") !== -1) {
        result.compiled = true;
        result.failed = false;
        result.building = false;
        result.terminal = true;
        result.compileErrors = [];
      }
      if (merged.indexOf("application bundle generation complete") !== -1) {
        result.compiled = true;
        result.failed = false;
        result.building = false;
        result.terminal = true;
        result.compileErrors = [];
      }
      if (isCompileErrorMessage(message, extra, line.level)) {
        result.failed = true;
        pushCompileError(result, line);
      }
      if (merged.indexOf("failed to compile") !== -1 || merged.indexOf("application bundle generation failed") !== -1) {
        result.building = false;
        result.terminal = true;
      }

      var isRelevant = containsAny(merged, signals);
      if (!isRelevant && projectToken.length) {
        isRelevant = merged.indexOf(projectToken) !== -1;
      }
      if (isRelevant && lower(line.category) === "context" && !openCandidate.length && result.port <= 0 && !containsAny(merged, signals)) {
        isRelevant = false;
      }
      if (isRelevant) {
        result.relevant.push({
          time: line.time == null ? "" : String(line.time),
          level: line.level == null ? "" : String(line.level),
          category: line.category == null ? "" : String(line.category),
          message: message,
          extra: extra
        });
      }
    }
    return result;
  }

  function collectBuilderLogs(projectName, startedAt, logsLimit, exactStart) {
    var now = java.lang.System.currentTimeMillis();
    var fetchLimit = Math.max(logsLimit * 8, 120);
    var maxScan = Math.max(fetchLimit * 40, 2000);
    var raw = C8O.requestableLogs.collect({
      category: "Studio",
      startTime: startedAt - (exactStart === true ? 0 : 1000),
      endTime: now + 1000,
      limit: fetchLimit,
      maxScan: maxScan,
      timeoutMs: 250
    });
    var parsed = parseReadyState(raw && raw.lines ? raw.lines : [], projectName);
    var relevant = parsed.relevant;
    if (relevant.length > logsLimit) {
      relevant = relevant.slice(relevant.length - logsLimit);
    }
    return {
      openUrl: parsed.openUrl,
      port: parsed.port,
      compiled: parsed.compiled,
      failed: parsed.failed,
      building: parsed.building,
      terminal: parsed.terminal,
      compileErrors: parsed.compileErrors || [],
      lines: relevant,
      query: raw && raw.query ? raw.query : {}
    };
  }

  C8O.mobileBuilderCommon.parseIntBounded = parseIntBounded;
  C8O.mobileBuilderCommon.parseBoolean = parseBoolean;
  C8O.mobileBuilderCommon.lower = lower;
  C8O.mobileBuilderCommon.trim = trim;
  C8O.mobileBuilderCommon.compactText = compactText;
  C8O.mobileBuilderCommon.parseJsonText = parseJsonText;
  C8O.mobileBuilderCommon.isCompileErrorMessage = isCompileErrorMessage;
  C8O.mobileBuilderCommon.pushCompileError = pushCompileError;
  C8O.mobileBuilderCommon.parsePortFromUrl = parsePortFromUrl;
  C8O.mobileBuilderCommon.normalizeEndpoint = normalizeEndpoint;
  C8O.mobileBuilderCommon.deriveViewerBaseUrl = deriveViewerBaseUrl;
  C8O.mobileBuilderCommon.deriveViewerHomeUrl = deriveViewerHomeUrl;
  C8O.mobileBuilderCommon.browserShowsInstaller = browserShowsInstaller;
  C8O.mobileBuilderCommon.hasViewerReadyEvidence = hasViewerReadyEvidence;
  C8O.mobileBuilderCommon.classifyReadiness = classifyReadiness;
  C8O.mobileBuilderCommon.urlReachable = urlReachable;
  C8O.mobileBuilderCommon.readiness = {
    parseOpenUrl: parseOpenUrl,
    collectBuilderLogs: collectBuilderLogs
  };
})();
