/*
 * Launches (or relaunches) the NGX mobile builder through Studio's WsBuilder
 * service and waits until the builder exposes its browser URL.
 */

include("js/util.js");
include("js/mobile_builder_common.js");

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.mobileBuilder = C8O.mobileBuilder || {};

(function () {
  var helper = C8O.mobileBuilderCommon || {};
  var parseIntBounded = helper.parseIntBounded;
  var parseBoolean = helper.parseBoolean;
  var lower = helper.lower;
  var trim = helper.trim;
  var compactText = helper.compactText;
  var parseJsonText = helper.parseJsonText;
  var isCompileErrorMessage = helper.isCompileErrorMessage;
  var pushCompileError = helper.pushCompileError;
  var parsePortFromUrl = helper.parsePortFromUrl;
  var normalizeEndpoint = helper.normalizeEndpoint;
  var deriveViewerBaseUrl = helper.deriveViewerBaseUrl;
  var deriveViewerHomeUrl = helper.deriveViewerHomeUrl;
  var hasViewerReadyEvidence = helper.hasViewerReadyEvidence;
  var urlReachable = helper.urlReachable;
  var parseOpenUrl = helper.readiness.parseOpenUrl;
  var collectBuilderLogs = helper.readiness.collectBuilderLogs;

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

  function readBrowserState(editorRef) {
    var state = {
      hasBrowser: false,
      currentUrl: "",
      locationHref: "",
      title: "",
      statusText: "",
      errorText: "",
      bodyTextSample: "",
      hasError: false,
      progress: 0
    };
    if (editorRef == null) {
      return state;
    }

    try {
      var ConvertigoPlugin = Packages.com.twinsoft.convertigo.eclipse.ConvertigoPlugin;
      var Runnable = Packages.java.lang.Runnable;
      ConvertigoPlugin.syncExec(new Runnable({ run: function () {
        try {
          var browser = readPrivateField(editorRef, "c8oBrowser");
          if (browser == null) {
            return;
          }
          state.hasBrowser = true;
          try {
            state.currentUrl = trim(browser.getURL ? browser.getURL() : "");
          } catch (_ignoreBrowserUrl) {}
          var raw = "";
          try {
            raw = trim(browser.executeJavaScriptAndReturnValue(
              "(function(){try{" +
                "var l1=document.getElementById('l1');" +
                "var pre=document.querySelector('pre');" +
                "var message=document.getElementById('Message');" +
                "var text=l1&&l1.textContent?String(l1.textContent):'';" +
                "var preText=pre&&pre.textContent?String(pre.textContent):'';" +
                "var bodyText=document.body&&document.body.innerText?String(document.body.innerText):'';" +
                "var progress=0;" +
                "try{progress=Number(window._last_doProgress||0)||0;}catch(progressError){}" +
                "var loaderHasError=!!(typeof window._loaderHasError!=='undefined'&&window._loaderHasError);" +
                "return JSON.stringify({" +
                  "locationHref:String(location.href||'')," +
                  "title:String(document.title||'')," +
                  "statusText:String(text||'')," +
                  "errorText:String(preText||text||'')," +
                  "bodyTextSample:String(bodyText||'').substring(0,800)," +
                  "loaderHasError:!!loaderHasError," +
                  "progress:progress," +
                  "messageHidden:!!(message&&message.style&&message.style.display==='none')" +
                "});" +
              "}catch(e){return JSON.stringify({error:String(e)});}})();"
            ));
          } catch (_ignoreBrowserEval) {}
          var parsed = parseJsonText(raw);
          if (!parsed) {
            return;
          }
          state.locationHref = trim(parsed.locationHref || "");
          state.title = trim(parsed.title || "");
          state.statusText = trim(parsed.statusText || "");
          state.errorText = trim(parsed.errorText || "");
          state.bodyTextSample = trim(parsed.bodyTextSample || "");
          state.hasError = parsed.loaderHasError === true || isCompileErrorMessage(parsed.errorText || "", parsed.statusText || "", "error");
          try {
            state.progress = parseInt(String(parsed.progress), 10);
            if (isNaN(state.progress) || state.progress < 0) {
              state.progress = 0;
            }
          } catch (_ignoreBrowserProgress) {
            state.progress = 0;
          }
        } catch (_ignoreBrowserState) {}
      }}));
    } catch (_ignoreBrowserRead) {}

    return state;
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
    var failureGraceMs = 8000;
    var firstFailureAt = 0;
    var ready = false;
    var snapshot = {
      openUrl: "",
      compiled: false,
      failed: false,
      building: false,
      compileErrors: [],
      lines: [],
      query: {}
    };
    var editorState = readEditorState(editorRef);
    var browserState = readBrowserState(editorRef);

    while (java.lang.System.currentTimeMillis() < deadline) {
      snapshot = collectBuilderLogs(projectName, startedAt, logsLimitValue);
      editorState = readEditorState(editorRef);
      browserState = readBrowserState(editorRef);
      if (!snapshot.openUrl.length && editorState.viewerUrl.length) {
        snapshot.openUrl = editorState.viewerUrl;
      }
      if (!(snapshot.port > 0) && editorState.port > 0) {
        snapshot.port = editorState.port;
      }
      if (browserState.currentUrl.length && !snapshot.openUrl.length && lower(browserState.currentUrl) !== "about:blank") {
        snapshot.openUrl = browserState.currentUrl;
      }
      if (!snapshot.building && (
        snapshot.lines.length > 0 ||
        (editorState && editorState.hasEditor) ||
        (editorResult && editorResult.opened === true) ||
        browserState.hasBrowser === true ||
        browserState.progress > 0
      )) {
        snapshot.building = true;
      }
      if (browserState.hasError === true) {
        snapshot.failed = true;
        pushCompileError(snapshot, {
          time: "",
          level: "ERROR",
          category: "Loader",
          message: browserState.errorText || browserState.statusText || "Compilation failed, please fix this error and reload the page.",
          extra: browserState.title || browserState.locationHref || browserState.currentUrl || ""
        });
      }
      var candidateUrl = snapshot.openUrl.length ? snapshot.openUrl : ((snapshot.port != null && snapshot.port > 0) ? ("http://localhost:" + snapshot.port) : "");
      if (candidateUrl.length && urlReachable(candidateUrl, 1500) && hasViewerReadyEvidence(snapshot, editorState, browserState, (snapshot.port != null && snapshot.port > 0) ? ("http://localhost:" + snapshot.port) : "")) {
        ready = true;
        break;
      }
      if (snapshot.failed === true) {
        if (!(firstFailureAt > 0)) {
          firstFailureAt = java.lang.System.currentTimeMillis();
        } else if ((java.lang.System.currentTimeMillis() - firstFailureAt) >= failureGraceMs) {
          break;
        }
      } else {
        firstFailureAt = 0;
      }
      try {
        java.lang.Thread.sleep(800);
      } catch (_ignoreSleep) {}
    }

    if (!ready) {
      snapshot = collectBuilderLogs(projectName, startedAt, logsLimitValue);
      editorState = readEditorState(editorRef);
      browserState = readBrowserState(editorRef);
      if (!snapshot.openUrl.length && editorState.viewerUrl.length) {
        snapshot.openUrl = editorState.viewerUrl;
      }
      if (!(snapshot.port > 0) && editorState.port > 0) {
        snapshot.port = editorState.port;
      }
      if (browserState.currentUrl.length && !snapshot.openUrl.length && lower(browserState.currentUrl) !== "about:blank") {
        snapshot.openUrl = browserState.currentUrl;
      }
      if (!snapshot.building && (
        snapshot.lines.length > 0 ||
        (editorState && editorState.hasEditor) ||
        (editorResult && editorResult.opened === true) ||
        browserState.hasBrowser === true ||
        browserState.progress > 0
      )) {
        snapshot.building = true;
      }
      if (browserState.hasError === true) {
        snapshot.failed = true;
        pushCompileError(snapshot, {
          time: "",
          level: "ERROR",
          category: "Loader",
          message: browserState.errorText || browserState.statusText || "Compilation failed, please fix this error and reload the page.",
          extra: browserState.title || browserState.locationHref || browserState.currentUrl || ""
        });
      }
      var finalCandidateUrl = snapshot.openUrl.length ? snapshot.openUrl : ((snapshot.port != null && snapshot.port > 0) ? ("http://localhost:" + snapshot.port) : "");
      if (finalCandidateUrl.length && urlReachable(finalCandidateUrl, 1500) && hasViewerReadyEvidence(snapshot, editorState, browserState, (snapshot.port != null && snapshot.port > 0) ? ("http://localhost:" + snapshot.port) : "")) {
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

    var status = ready ? "ready" : (snapshot.failed === true ? "compile_error" : (snapshot.building === true ? "building" : "timeout"));
    var message = ready
      ? (snapshot.openUrl.length ? "Mobile builder is ready." : "Mobile builder Node listener detected.")
      : (status === "compile_error"
        ? (
          snapshot.compileErrors && snapshot.compileErrors.length
            ? ("Mobile builder compile failed: " + compactText((snapshot.compileErrors[0].message || "") + " " + (snapshot.compileErrors[0].extra || "")))
            : "Mobile builder compile failed before exposing the browser URL."
        )
        : (status === "building"
          ? (
            browserState && compactText(browserState.statusText || "").length
              ? ("Mobile builder is still building: " + compactText(browserState.statusText))
              : "Mobile builder is still building and did not expose the browser URL before the timeout."
          )
          : "Mobile builder start timed out before detecting the browser URL."));
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
      threadAlive: ready || status === "building",
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
      browser: {
        currentUrl: browserState && browserState.currentUrl ? browserState.currentUrl : "",
        locationHref: browserState && browserState.locationHref ? browserState.locationHref : "",
        title: browserState && browserState.title ? browserState.title : "",
        statusText: browserState && browserState.statusText ? browserState.statusText : "",
        errorText: browserState && browserState.errorText ? browserState.errorText : "",
        bodyTextSample: browserState && browserState.bodyTextSample ? browserState.bodyTextSample : "",
        progress: browserState && browserState.progress ? browserState.progress : 0
      },
      compileErrors: snapshot.compileErrors || [],
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
