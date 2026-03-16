/*
 * Launches (or relaunches) the NGX mobile builder through Studio's WsBuilder
 * service and waits until the builder exposes its browser URL.
 */

include("js/util.js");
include("js/requestable_logs.js");

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.mobileBuilder = C8O.mobileBuilder || {};

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

  function deriveViewerHomeUrl(viewerBaseUrl, viewerUrl) {
    var base = normalizeEndpoint(viewerBaseUrl);
    if (base.length) {
      return base + "/home";
    }
    var raw = stripQueryAndHash(viewerUrl || "");
    if (/\/home$/i.test(raw)) {
      return raw;
    }
    return raw.length ? raw : "";
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

  function isStudioRuntime(Engine) {
    try {
      if (Engine && typeof Engine.isStudio === "function") {
        return Engine.isStudio() === true;
      }
    } catch (_ignoreIsStudioFn) {}
    try {
      if (Engine && typeof Engine.isStudio !== "undefined") {
        return Engine.isStudio === true;
      }
    } catch (_ignoreIsStudioField) {}
    try {
      if (Engine && Engine.isStudioMode) {
        return Engine.isStudioMode() === true;
      }
    } catch (_ignoreIsStudioMode) {}
    return false;
  }

  function readPrivateField(target, fieldName) {
    if (target == null || !fieldName) {
      return null;
    }
    try {
      var clazz = target.getClass ? target.getClass() : null;
      while (clazz != null) {
        try {
          var field = clazz.getDeclaredField(String(fieldName));
          field.setAccessible(true);
          return field.get(target);
        } catch (_ignoreMissingField) {
          clazz = clazz.getSuperclass ? clazz.getSuperclass() : null;
        }
      }
    } catch (_ignoreReadField) {}
    return null;
  }

  function readEditorState(editorRef) {
    var state = {
      hasEditor: editorRef != null,
      port: 0,
      baseUrl: "",
      currentUrl: "",
      viewerUrl: "",
      nodeUrl: ""
    };
    if (editorRef == null) {
      return state;
    }

    try {
      var rawPort = readPrivateField(editorRef, "portNode");
      if (rawPort != null) {
        var parsedPort = parseInt(String(rawPort), 10);
        if (!isNaN(parsedPort) && parsedPort > 0) {
          state.port = parsedPort;
        }
      }
    } catch (_ignorePortField) {}

    try {
      var rawBaseUrl = readPrivateField(editorRef, "baseUrl");
      state.baseUrl = trim(rawBaseUrl);
    } catch (_ignoreBaseField) {}

    try {
      if (editorRef.getCurrentUrl) {
        state.currentUrl = trim(editorRef.getCurrentUrl());
      }
    } catch (_ignoreCurrentUrl) {}

    if (state.baseUrl.length) {
      state.viewerUrl = state.baseUrl;
    } else if (state.currentUrl.length && lower(state.currentUrl) !== "about:blank") {
      state.viewerUrl = state.currentUrl;
    }

    if (!(state.port > 0)) {
      state.port = parsePortFromUrl(state.viewerUrl);
    }
    if (state.port > 0) {
      state.nodeUrl = "http://localhost:" + state.port;
      if (!state.viewerUrl.length) {
        state.viewerUrl = state.nodeUrl;
      }
    }

    return state;
  }

  function parseReadyState(lines, projectName) {
    var result = {
      openUrl: "",
      port: 0,
      compiled: false,
      failed: false,
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
      if (merged.indexOf("compiled") !== -1 && merged.indexOf("success") !== -1) {
        result.compiled = true;
      }
      if (merged.indexOf("application bundle generation complete") !== -1) {
        result.compiled = true;
      }
      if (merged.indexOf("failed to compile") !== -1 || merged.indexOf("error: ") !== -1) {
        result.failed = true;
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

  function collectBuilderLogs(projectName, startedAt, logsLimit) {
    var now = java.lang.System.currentTimeMillis();
    var fetchLimit = Math.max(logsLimit * 8, 120);
    var maxScan = Math.max(fetchLimit * 40, 2000);
    var raw = C8O.requestableLogs.collect({
      startTime: startedAt - 1000,
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
      lines: relevant,
      query: raw && raw.query ? raw.query : {}
    };
  }

  function ensureNgxProject(projectRef, projectName) {
    var application = null;
    try {
      application = projectRef.getMobileApplication();
    } catch (_ignoreMobileApplication) {
      application = null;
    }
    var appComponent = null;
    try {
      appComponent = application != null ? application.getApplicationComponent() : null;
    } catch (_ignoreApplicationComponent) {
      appComponent = null;
    }
    if (appComponent == null) {
      throw new Error("Project '" + projectName + "' has no mobile application component.");
    }
    var appClass = "";
    try {
      appClass = String(appComponent.getClass().getName());
    } catch (_ignoreClassName) {
      appClass = "";
    }
    if (appClass.indexOf("com.twinsoft.convertigo.beans.ngx.components.ApplicationComponent") !== 0) {
      throw new Error("Project '" + projectName + "' is not an NGX application project.");
    }
  }

  function openStudioNgxEditor(projectRef, forceRestart) {
    var result = {
      requested: false,
      opened: false,
      builderLaunchRequested: false,
      editorRef: null,
      editorState: {
        hasEditor: false,
        port: 0,
        baseUrl: "",
        currentUrl: "",
        viewerUrl: "",
        nodeUrl: ""
      },
      message: "",
      error: ""
    };

    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    var studioMode = isStudioRuntime(Engine);
    if (!studioMode) {
      result.message = "Studio mode required";
      return result;
    }

    result.requested = true;

    var appComponent = null;
    try {
      var mobileApplication = projectRef.getMobileApplication();
      appComponent = mobileApplication ? mobileApplication.getApplicationComponent() : null;
    } catch (_ignoreGetApp) {
      appComponent = null;
    }
    if (appComponent == null) {
      result.message = "Application component not found";
      return result;
    }

    try {
      var ConvertigoPlugin = Packages.com.twinsoft.convertigo.eclipse.ConvertigoPlugin;
      var NgxApplicationComponentTreeObject = Packages.com.twinsoft.convertigo.eclipse.views.projectexplorer.model.NgxApplicationComponentTreeObject;
      var Runnable = Packages.java.lang.Runnable;
      var plugin = ConvertigoPlugin.getDefault();
      if (plugin == null) {
        result.message = "Convertigo plugin is not available";
        return result;
      }

      ConvertigoPlugin.syncExec(new Runnable({ run: function () {
        try {
          var view = plugin.getProjectExplorerView ? plugin.getProjectExplorerView() : null;
          if (view == null) {
            result.message = "Project Explorer view is not available";
            return;
          }

          try {
            view.reloadDatabaseObject(appComponent);
          } catch (_ignoreReloadTree) {}

          var treeObject = null;
          try {
            treeObject = view.findTreeObjectByUserObject(appComponent);
          } catch (_ignoreFindTree) {
            treeObject = null;
          }
          if (treeObject == null) {
            result.message = "Unable to locate application tree object";
            return;
          }

          try {
            if (treeObject instanceof NgxApplicationComponentTreeObject) {
              var editor = treeObject.activeEditor(false);
              if (editor != null) {
                result.editorRef = editor;
                result.editorState = readEditorState(editor);
                var alreadyRunning = result.editorState.port > 0 || result.editorState.viewerUrl.length > 0;
                var editorReachable = urlReachable(result.editorState.viewerUrl || result.editorState.nodeUrl, 1500);
                var shouldLaunch = forceRestart === true || !alreadyRunning || !editorReachable;
                if (shouldLaunch) {
                  editor.launchBuilder(false, false);
                  result.builderLaunchRequested = true;
                }
              }
              result.opened = true;
              if (result.builderLaunchRequested) {
                result.message = forceRestart === true
                  ? "NGX editor opened and builder restart requested"
                  : "NGX editor opened and builder launch requested";
              } else {
                result.message = "NGX editor already running; reused current builder";
              }
              return;
            }
          } catch (activeError) {
            result.error = String(activeError);
          }

          try {
            if (treeObject.launchEditor) {
              treeObject.launchEditor(null);
              try {
                if (treeObject.activeEditor) {
                  var fallbackEditor = treeObject.activeEditor(false);
                  if (fallbackEditor != null) {
                    result.editorRef = fallbackEditor;
                    result.editorState = readEditorState(fallbackEditor);
                  }
                }
              } catch (_ignoreFallbackEditor) {}
              result.opened = true;
              result.message = "NGX editor opened";
              return;
            }
          } catch (launchError) {
            result.error = String(launchError);
          }

          if (result.error && result.error.length) {
            result.message = "Unable to open NGX editor: " + result.error;
          } else {
            result.message = "Tree object does not expose editor openers";
          }
        } catch (uiError) {
          result.error = String(uiError);
          result.message = "Unable to open NGX editor: " + result.error;
        }
      }}));
    } catch (openError) {
      result.error = String(openError);
      result.message = "Unable to open NGX editor: " + result.error;
    }

    return result;
  }

  function startBuildWithWsBuilder(projectName, endpoint) {
    var WsBuilder = Packages.com.twinsoft.convertigo.engine.admin.services.studio.ngxbuilder.WsBuilder;
    var JSONObject = Packages.org.codehaus.jettison.json.JSONObject;

    var payload = new JSONObject();
    payload.put("project", projectName);
    payload.put("action", "build_dev");
    var params = new JSONObject();
    params.put("endpoint", endpoint);
    payload.put("params", params);

    var ws = new WsBuilder();
    ws.onMessage(String(payload.toString()), null);
  }

  C8O.mobileBuilder.open = function (options) {
    var opts = options || {};
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    var MobileBuilder = Packages.com.twinsoft.convertigo.engine.mobile.MobileBuilder;
    var EnginePropertiesManager = Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager;
    var PropertyName = Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager.PropertyName;

    var projectName = trim(opts.project);
    if (!projectName.length) {
      throw new Error("project is required");
    }
    var timeoutSecValue = parseIntBounded(opts.timeoutSec, 90, 5, 600);
    var logsLimitValue = parseIntBounded(opts.logsLimit, 40, 5, 200);
    var forceRestartValue = parseBoolean(opts.forceRestart, false);
    var startedAt = java.lang.System.currentTimeMillis();
    var studioMode = isStudioRuntime(Engine);

    var endpoint = normalizeEndpoint(EnginePropertiesManager.getProperty(PropertyName.APPLICATION_SERVER_CONVERTIGO_URL));
    var projectRef = Engine.theApp.databaseObjectsManager.getOriginalProjectByName(projectName);
    if (projectRef == null) {
      throw new Error("Target project not found: " + projectName);
    }
    ensureNgxProject(projectRef, projectName);
    var editorResult = openStudioNgxEditor(projectRef, forceRestartValue);
    var editorRef = editorResult && editorResult.editorRef ? editorResult.editorRef : null;

    var hasReusableEditor = false;
    try {
      var editorBootState = editorResult && editorResult.editorState ? editorResult.editorState : {};
      hasReusableEditor = editorBootState.port > 0 || String(editorBootState.viewerUrl || "").length > 0;
    } catch (_ignoreBootState) {}
    var launchedFromEditor = editorResult && editorResult.builderLaunchRequested === true;
    var reusableEditorReachable = false;
    try {
      reusableEditorReachable = urlReachable((editorBootState && (editorBootState.viewerUrl || editorBootState.nodeUrl)) || "", 1500);
    } catch (_ignoreReusableReachable) {}
    var reusedExistingBuilder = hasReusableEditor && reusableEditorReachable && !forceRestartValue && !launchedFromEditor;
    if (!launchedFromEditor && !reusedExistingBuilder) {
      MobileBuilder.initBuilder(projectRef);
      startBuildWithWsBuilder(projectName, endpoint);
    }

    var deadline = startedAt + (timeoutSecValue * 1000);
    var ready = false;
    var snapshot = {
      openUrl: "",
      compiled: false,
      failed: false,
      lines: [],
      query: {}
    };
    var editorState = readEditorState(editorRef);

    while (java.lang.System.currentTimeMillis() < deadline) {
      snapshot = collectBuilderLogs(projectName, startedAt, logsLimitValue);
      editorState = readEditorState(editorRef);
      if (!snapshot.openUrl.length && editorState.viewerUrl.length) {
        snapshot.openUrl = editorState.viewerUrl;
      }
      if (!(snapshot.port > 0) && editorState.port > 0) {
        snapshot.port = editorState.port;
      }
      var candidateUrl = snapshot.openUrl.length ? snapshot.openUrl : ((snapshot.port != null && snapshot.port > 0) ? ("http://localhost:" + snapshot.port) : "");
      if (candidateUrl.length && urlReachable(candidateUrl, 1500)) {
        ready = true;
        break;
      }
      try {
        java.lang.Thread.sleep(800);
      } catch (_ignoreSleep) {}
    }

    if (!ready) {
      snapshot = collectBuilderLogs(projectName, startedAt, logsLimitValue);
      editorState = readEditorState(editorRef);
      if (!snapshot.openUrl.length && editorState.viewerUrl.length) {
        snapshot.openUrl = editorState.viewerUrl;
      }
      if (!(snapshot.port > 0) && editorState.port > 0) {
        snapshot.port = editorState.port;
      }
      var finalCandidateUrl = snapshot.openUrl.length ? snapshot.openUrl : ((snapshot.port != null && snapshot.port > 0) ? ("http://localhost:" + snapshot.port) : "");
      if (finalCandidateUrl.length && urlReachable(finalCandidateUrl, 1500)) {
        ready = true;
      }
    }

    var finishedAt = java.lang.System.currentTimeMillis();
    var elapsedMs = finishedAt - startedAt;
    var viewerUrl = snapshot.openUrl || "";
    var port = snapshot.port != null ? parseInt(snapshot.port, 10) : 0;
    if (!(port > 0)) {
      port = parsePortFromUrl(viewerUrl);
    }
    var nodeUrl = port > 0 ? ("http://localhost:" + port) : "";
    if (!viewerUrl.length && nodeUrl.length) {
      viewerUrl = nodeUrl;
    }
    var viewerBaseUrl = deriveViewerBaseUrl(viewerUrl, nodeUrl);
    var viewerHomeUrl = deriveViewerHomeUrl(viewerBaseUrl, viewerUrl);
    if (!viewerUrl.length && viewerHomeUrl.length) {
      viewerUrl = viewerHomeUrl;
    }

    var status = ready ? "ready" : "timeout";
    var message = ready
      ? (snapshot.openUrl.length ? "Mobile builder is ready." : "Mobile builder Node listener detected.")
      : "Mobile builder start timed out before detecting the browser URL.";
    if (!studioMode) {
      message = message + " Studio mode is disabled; this tool is intended for Studio usage.";
    }
    var publicEditorResult = {
      requested: editorResult && editorResult.requested === true,
      opened: editorResult && editorResult.opened === true,
      builderLaunchRequested: editorResult && editorResult.builderLaunchRequested === true,
      message: editorResult && editorResult.message ? editorResult.message : "",
      error: editorResult && editorResult.error ? editorResult.error : ""
    };

    return {
      status: status,
      project: projectName,
      message: message,
      ready: ready,
      launched: true,
      reusedBuild: reusedExistingBuilder,
      studioMode: studioMode === true,
      threadAlive: ready || status === "timeout",
      timeoutSec: timeoutSecValue,
      elapsedMs: elapsedMs,
      startedAt: startedAt,
      finishedAt: finishedAt,
      endpoint: endpoint,
      baseUrl: viewerBaseUrl,
      viewerUrl: viewerUrl,
      viewerBaseUrl: viewerBaseUrl,
      viewerHomeUrl: viewerHomeUrl,
      port: port,
      nodeUrl: nodeUrl,
      editor: publicEditorResult,
      editorOpened: publicEditorResult.opened === true,
      logs: snapshot.lines || [],
      logQuery: snapshot.query || {}
    };
  };
})();

var openMobileBuilderResult = C8O.mobileBuilder.open({
  project: project,
  timeoutSec: (typeof timeoutSec !== "undefined") ? timeoutSec : 90,
  logsLimit: (typeof logsLimit !== "undefined") ? logsLimit : 40,
  forceRestart: (typeof forceRestart !== "undefined") ? forceRestart : false
});
var openMobileBuilderLogs = openMobileBuilderResult && openMobileBuilderResult.logs ? openMobileBuilderResult.logs : [];
var openMobileBuilderLogQuery = openMobileBuilderResult && openMobileBuilderResult.logQuery ? openMobileBuilderResult.logQuery : {};
