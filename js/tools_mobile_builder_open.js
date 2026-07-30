/*
 * Launches (or relaunches) the NGX mobile builder through Studio's WsBuilder
 * service and waits until the builder exposes its browser URL.
 */

include("js/util.js");
include("js/mobile_builder_common.js");
include("js/ui_reveal.js");

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
  var BUILD_CYCLE_SETTLE_MS = 1200;

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
      nodeUrl: "",
      browserDebugUrl: "",
      browserDevToolsJsonUrl: "",
      browserDevToolsWebSocketUrl: "",
      browserDevToolsTarget: null,
      browserRemoteDebuggingPort: 0
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

    try {
      if (editorRef.getDebugUrl) {
        state.browserDebugUrl = trim(editorRef.getDebugUrl());
      }
    } catch (_ignoreDebugUrlMethod) {}
    if (!state.browserDebugUrl.length) {
      try {
        state.browserDebugUrl = trim(readPrivateField(editorRef, "debugUrl"));
      } catch (_ignoreDebugUrlField) {}
    }
    if (state.browserDebugUrl.length) {
      state.browserDebugUrl = normalizeEndpoint(state.browserDebugUrl);
      state.browserDevToolsJsonUrl = state.browserDebugUrl + "/json";
      state.browserRemoteDebuggingPort = parsePortFromUrl(state.browserDebugUrl);
    }

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
    if (state.browserDevToolsJsonUrl.length) {
      state.browserDevToolsTarget = readDevToolsTarget(state.browserDevToolsJsonUrl, state.currentUrl || state.viewerUrl);
      if (state.browserDevToolsTarget && state.browserDevToolsTarget.webSocketDebuggerUrl) {
        state.browserDevToolsWebSocketUrl = state.browserDevToolsTarget.webSocketDebuggerUrl;
      }
    }

    return state;
  }

  function readUrlText(url, timeoutMs) {
    var text = trim(url);
    if (!text.length) {
      return "";
    }
    var URL = Packages.java.net.URL;
    var BufferedReader = Packages.java.io.BufferedReader;
    var InputStreamReader = Packages.java.io.InputStreamReader;
    var StringBuilder = Packages.java.lang.StringBuilder;
    var connection = null;
    var reader = null;
    var timeout = parseIntBounded(timeoutMs, 1000, 200, 10000);
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
        connection.setRequestProperty("Accept", "application/json,text/plain,*/*");
      }
      var stream = connection.getInputStream();
      reader = new BufferedReader(new InputStreamReader(stream, "UTF-8"));
      var builder = new StringBuilder();
      var line;
      while ((line = reader.readLine()) !== null) {
        builder.append(line).append("\n");
      }
      return String(builder.toString());
    } catch (_ignoreReadUrlText) {
      return "";
    } finally {
      if (reader) {
        try {
          reader.close();
        } catch (_ignoreReaderClose) {}
      }
      if (connection && connection.disconnect) {
        try {
          connection.disconnect();
        } catch (_ignoreConnectionDisconnect) {}
      }
    }
  }

  function devToolsTargetSummary(raw) {
    if (!raw) {
      return null;
    }
    return {
      id: trim(raw.id || ""),
      type: trim(raw.type || ""),
      title: trim(raw.title || ""),
      url: trim(raw.url || ""),
      webSocketDebuggerUrl: trim(raw.webSocketDebuggerUrl || ""),
      devtoolsFrontendUrl: trim(raw.devtoolsFrontendUrl || "")
    };
  }

  function readDevToolsTarget(jsonUrl, expectedUrl) {
    var payload = parseJsonText(readUrlText(jsonUrl, 1000));
    if (!payload || typeof payload.length === "undefined") {
      return null;
    }
    var expected = normalizeEndpoint(expectedUrl || "");
    var firstPage = null;
    for (var i = 0; i < payload.length; i++) {
      var item = payload[i];
      if (!item || trim(item.type) !== "page") {
        continue;
      }
      if (firstPage === null) {
        firstPage = item;
      }
      if (expected.length && normalizeEndpoint(item.url || "") === expected) {
        return devToolsTargetSummary(item);
      }
    }
    return devToolsTargetSummary(firstPage);
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

  function browserHasVisibleDocument(browserState) {
    if (!browserState || browserState.hasBrowser !== true) {
      return false;
    }
    var currentUrl = lower(browserState.currentUrl || browserState.locationHref || "");
    return (
      (currentUrl.length > 0 && currentUrl !== "about:blank") ||
      compactText(browserState.bodyTextSample || "").length > 0 ||
      compactText(browserState.statusText || "").length > 0 ||
      browserState.progress > 0
    );
  }

  function waitForEditorStartupSignal(editorRef, maxWaitMs) {
    var maxWait = parseIntBounded(maxWaitMs, 0, 0, 5000);
    var deadline = java.lang.System.currentTimeMillis() + maxWait;
    var currentEditorState = readEditorState(editorRef);
    var currentBrowserState = readBrowserState(editorRef);
    while (
      editorRef != null &&
      maxWait > 0 &&
      java.lang.System.currentTimeMillis() < deadline &&
      !browserHasVisibleDocument(currentBrowserState)
    ) {
      try {
        java.lang.Thread.sleep(150);
      } catch (_ignoreStartupSleep) {}
      currentEditorState = readEditorState(editorRef);
      currentBrowserState = readBrowserState(editorRef);
    }
    return {
      editorState: currentEditorState,
      browserState: currentBrowserState
    };
  }

  function browserControlTargetUrl(editorState, browserState) {
    var target = editorState && editorState.browserDevToolsTarget ? editorState.browserDevToolsTarget : null;
    var targetUrl = target && target.url ? trim(target.url) : "";
    if (targetUrl.length) {
      return targetUrl;
    }
    if (browserState && browserState.currentUrl) {
      return trim(browserState.currentUrl);
    }
    if (browserState && browserState.locationHref) {
      return trim(browserState.locationHref);
    }
    return "";
  }

  function isBrowserControlReady(editorState, browserState, viewerBaseUrl) {
    var debugUrl = editorState && editorState.browserDebugUrl ? trim(editorState.browserDebugUrl) : "";
    if (!debugUrl.length) {
      return false;
    }
    var targetUrl = browserControlTargetUrl(editorState, browserState);
    var targetLower = lower(targetUrl);
    if (!targetLower.length || targetLower === "about:blank") {
      return false;
    }
    var viewerBaseLower = lower(normalizeEndpoint(viewerBaseUrl || ""));
    if (viewerBaseLower.length && normalizeEndpoint(targetLower).indexOf(viewerBaseLower) !== 0) {
      return false;
    }
    return true;
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

  function liveBuildJobName(projectRef, projectName) {
    var appName = trim(projectName);
    try {
      var mobileApplication = projectRef.getMobileApplication();
      var appComponent = mobileApplication != null ? mobileApplication.getApplicationComponent() : null;
      var parent = appComponent != null ? appComponent.getParent() : null;
      var computedName = parent != null && parent.getComputedApplicationName
        ? trim(parent.getComputedApplicationName())
        : "";
      if (computedName.length) {
        appName = computedName;
      }
    } catch (_ignoreBuildJobName) {}
    return "Live build for " + appName;
  }

  function readLiveBuildJob(jobName) {
    var state = {
      supported: false,
      jobName: trim(jobName),
      active: false,
      state: "none"
    };
    try {
      var Job = Packages.org.eclipse.core.runtime.jobs.Job;
      var manager = Job.getJobManager();
      var jobs = manager.find(null);
      state.supported = true;
      for (var i = 0; i < jobs.length; i++) {
        var job = jobs[i];
        if (job == null || trim(job.getName()) !== state.jobName) {
          continue;
        }
        var jobState = Number(job.getState());
        if (jobState === Number(Job.RUNNING)) {
          state.active = true;
          state.state = "running";
          break;
        }
        if (jobState === Number(Job.WAITING)) {
          state.active = true;
          state.state = "waiting";
        } else if (jobState === Number(Job.SLEEPING) && state.state === "none") {
          state.active = true;
          state.state = "sleeping";
        }
      }
    } catch (_ignoreBuildJobState) {}
    return state;
  }

  function openStudioNgxEditor(projectRef, forceRestart, stateOnly, browserDebugPort) {
    var result = {
      requested: false,
      opened: false,
      builderLaunchRequested: false,
      browserDebugPortRequested: browserDebugPort > 0 ? browserDebugPort : 0,
      browserDebugPortApplied: false,
      browserDebugPortMatched: browserDebugPort > 0 ? false : true,
      stateOnly: stateOnly === true,
      editorRef: null,
      editorState: {
        hasEditor: false,
        port: 0,
        baseUrl: "",
        currentUrl: "",
        viewerUrl: "",
        nodeUrl: "",
        browserDebugUrl: "",
        browserDevToolsJsonUrl: "",
        browserRemoteDebuggingPort: 0
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

    result.requested = stateOnly !== true;

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
      var C8oBrowser = Packages.com.twinsoft.convertigo.eclipse.swt.C8oBrowser;
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
              if (browserDebugPort > 0) {
                C8oBrowser.setPreferredDebugPort(projectRef, browserDebugPort);
              }
              var editor = treeObject.activeEditor(false);
              if (editor != null) {
                result.editorRef = editor;
                result.editorState = readEditorState(editor);
                if (browserDebugPort > 0 && result.editorState.browserRemoteDebuggingPort !== browserDebugPort) {
                  editor.setBrowserDebugPort(browserDebugPort);
                  result.browserDebugPortApplied = true;
                  result.editorState = readEditorState(editor);
                }
              }
              result.browserDebugPortMatched = browserDebugPort <= 0 ||
                result.editorState.browserRemoteDebuggingPort === browserDebugPort;
              if (stateOnly === true) {
                result.opened = editor != null;
                result.message = editor != null
                  ? (result.browserDebugPortApplied
                    ? "Existing NGX editor state read; browser debug port reconciled without restarting the builder"
                    : (result.browserDebugPortMatched
                      ? "Existing NGX editor state read; no builder launch requested"
                      : "Existing NGX editor uses another browser debug port"))
                  : "No active NGX editor found; no launch requested";
                return;
              }
              if (editor != null) {
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

          if (stateOnly === true) {
            result.message = "No active NGX editor found; no launch requested";
            return;
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
                    result.browserDebugPortMatched = browserDebugPort <= 0 ||
                      result.editorState.browserRemoteDebuggingPort === browserDebugPort;
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
    var waitValue = parseBoolean(opts.wait, true);
    var stateOnlyValue = parseBoolean(opts.stateOnly, false);
    var revealValue = parseBoolean(opts.reveal, false);
    var timeoutSecValue = waitValue === true ? parseIntBounded(opts.timeoutSec, 90, 0, 600) : 0;
    var revealWaitCapApplied = false;
    if (stateOnlyValue === true && revealValue === true && waitValue === true && timeoutSecValue > 12) {
      timeoutSecValue = 12;
      revealWaitCapApplied = true;
    }
    var logsLimitValue = parseIntBounded(opts.logsLimit, 40, 5, 200);
    var forceRestartValue = parseBoolean(opts.forceRestart, false);
    var browserDebugPortValue = parseInt(String(opts.browserDebugPort || "0"), 10);
    if (isNaN(browserDebugPortValue)) {
      browserDebugPortValue = 0;
    }
    if (browserDebugPortValue !== 0 && (browserDebugPortValue < 1024 || browserDebugPortValue > 65535)) {
      throw new Error("browserDebugPort must be between 1024 and 65535");
    }
    var startedAt = java.lang.System.currentTimeMillis();
    var studioMode = isStudioRuntime(Engine);

    var endpoint = normalizeEndpoint(EnginePropertiesManager.getProperty(PropertyName.APPLICATION_SERVER_CONVERTIGO_URL));
    var projectRef = Engine.theApp.databaseObjectsManager.getOriginalProjectByName(projectName);
    if (projectRef == null) {
      throw new Error("Target project not found: " + projectName);
    }
    ensureNgxProject(projectRef, projectName);
    var buildJobNameValue = liveBuildJobName(projectRef, projectName);
    var editorResult = studioMode
      ? openStudioNgxEditor(projectRef, forceRestartValue, stateOnlyValue, browserDebugPortValue)
      : {
        requested: false,
        opened: false,
        builderLaunchRequested: false,
        browserDebugPortRequested: browserDebugPortValue,
        browserDebugPortApplied: false,
        browserDebugPortMatched: browserDebugPortValue <= 0,
        stateOnly: stateOnlyValue,
        editorRef: null,
        editorState: {},
        message: "Studio mode is disabled; no Studio editor interaction was attempted.",
        error: ""
      };
    var editorRef = editorResult && editorResult.editorRef ? editorResult.editorRef : null;

    var hasReusableEditor = false;
    var editorBootState = {};
    try {
      editorBootState = editorResult && editorResult.editorState ? editorResult.editorState : {};
      hasReusableEditor = editorBootState.port > 0 || String(editorBootState.viewerUrl || "").length > 0;
    } catch (_ignoreBootState) {}
    var launchedFromEditor = stateOnlyValue !== true && editorResult && editorResult.builderLaunchRequested === true;
    var reusableEditorReachable = false;
    try {
      reusableEditorReachable = urlReachable((editorBootState && (editorBootState.viewerUrl || editorBootState.nodeUrl)) || "", 1500);
    } catch (_ignoreReusableReachable) {}
    var reusedExistingBuilder = stateOnlyValue !== true && hasReusableEditor && reusableEditorReachable && !forceRestartValue && !launchedFromEditor;
    var launchRequested = launchedFromEditor === true;
    if (studioMode && stateOnlyValue !== true && !launchedFromEditor && !reusedExistingBuilder) {
      MobileBuilder.initBuilder(projectRef);
      startBuildWithWsBuilder(projectName, endpoint);
      launchRequested = true;
    }
    var startupSignal = null;
    if (stateOnlyValue !== true && waitValue !== true && launchRequested === true && editorRef != null) {
      startupSignal = waitForEditorStartupSignal(editorRef, 1800);
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
    var editorState = startupSignal && startupSignal.editorState ? startupSignal.editorState : readEditorState(editorRef);
    var browserState = startupSignal && startupSignal.browserState ? startupSignal.browserState : readBrowserState(editorRef);
    var buildJobState = studioMode
      ? readLiveBuildJob(buildJobNameValue)
      : { supported: false, jobName: buildJobNameValue, active: false, state: "none" };
    var buildJobObserved = buildJobState.active === true;
    var previousBuildJobActive = buildJobState.active === true;
    var buildJobFinishedObservedAt = 0;
    var generationState = C8O.mobileBuilderCycle.readState(projectName);
    var pendingBuildCycleId = generationState.id || 0;
    var pendingBuildTimestamp = (
      generationState.status === "pending" ||
      generationState.status === "changed"
    ) ? generationState.startedAt : 0;
    var pendingBuildRequestedAt = generationState.startedAt || 0;
    var generationNoChange = generationState.status === "no_change";
    var generationFailed = generationState.status === "failed";
    var terminalBuildObserved = false;
    var buildSettleDeadline = waitValue === true
      ? Math.min(deadline, startedAt + BUILD_CYCLE_SETTLE_MS)
      : startedAt;

    function syncGenerationState() {
      var current = C8O.mobileBuilderCycle.readState(projectName);
      if (!(current.id > 0)) {
        return;
      }
      if (current.id !== pendingBuildCycleId) {
        pendingBuildCycleId = current.id;
        pendingBuildRequestedAt = current.startedAt || 0;
        terminalBuildObserved = false;
        buildJobObserved = buildJobState.active === true;
        buildJobFinishedObservedAt = 0;
      }
      generationState = current;
      generationNoChange = current.status === "no_change";
      generationFailed = current.status === "failed";
      pendingBuildTimestamp = (
        current.status === "pending" ||
        current.status === "changed"
      ) ? current.startedAt : 0;
      if (generationNoChange || generationFailed) {
        C8O.mobileBuilderCycle.clear(projectName, current.id);
      }
    }

    function refreshCurrentState() {
      syncGenerationState();
      snapshot = collectBuilderLogs(
        projectName,
        pendingBuildTimestamp > 0 ? pendingBuildTimestamp : startedAt,
        logsLimitValue,
        pendingBuildTimestamp > 0
      );
      editorState = readEditorState(editorRef);
      browserState = readBrowserState(editorRef);
      buildJobState = studioMode
        ? readLiveBuildJob(buildJobNameValue)
        : { supported: false, jobName: buildJobNameValue, active: false, state: "none" };
      var buildJobActive = buildJobState.active === true;
      if (pendingBuildTimestamp > 0 && snapshot.terminal === true) {
        terminalBuildObserved = true;
        buildJobObserved = true;
      }
      if (buildJobActive) {
        buildJobObserved = true;
      } else if (previousBuildJobActive && buildJobFinishedObservedAt === 0) {
        buildJobFinishedObservedAt = java.lang.System.currentTimeMillis();
      }
      previousBuildJobActive = buildJobActive;
      if (pendingBuildTimestamp > 0 && (
        terminalBuildObserved === true ||
        (buildJobObserved === true && buildJobActive !== true)
      )) {
        var clearedPendingBuild = C8O.mobileBuilderCycle.clear(projectName, pendingBuildCycleId);
        if (clearedPendingBuild) {
          pendingBuildTimestamp = 0;
        } else {
          var newerGenerationState = C8O.mobileBuilderCycle.readState(projectName);
          if (newerGenerationState.id > 0 && newerGenerationState.id !== pendingBuildCycleId) {
            generationState = newerGenerationState;
            pendingBuildCycleId = newerGenerationState.id;
            pendingBuildTimestamp = newerGenerationState.startedAt;
            pendingBuildRequestedAt = newerGenerationState.startedAt;
            terminalBuildObserved = false;
            buildJobObserved = buildJobActive;
            buildJobFinishedObservedAt = 0;
          } else {
            pendingBuildTimestamp = 0;
          }
        }
      }
      var waitingForScheduledCycle = buildJobState.supported === true &&
        waitValue === true &&
        generationNoChange !== true &&
        java.lang.System.currentTimeMillis() < buildSettleDeadline &&
        buildJobObserved !== true;
      var waitingForGeneration = generationState.supported === true &&
        generationState.status === "pending";
      var waitingForPendingCycle = studioMode === true &&
        pendingBuildTimestamp > 0 &&
        (
          generationState.supported !== true ||
          generationState.status === "changed"
        ) &&
        terminalBuildObserved !== true &&
        buildJobObserved !== true;
      var waitingForViewerReload = buildJobFinishedObservedAt > 0 &&
        java.lang.System.currentTimeMillis() < buildJobFinishedObservedAt + 500;
      if (!snapshot.openUrl.length && editorState.viewerUrl.length) {
        snapshot.openUrl = editorState.viewerUrl;
      }
      if (!(snapshot.port > 0) && editorState.port > 0) {
        snapshot.port = editorState.port;
      }
      if (browserState.currentUrl.length && !snapshot.openUrl.length && lower(browserState.currentUrl) !== "about:blank") {
        snapshot.openUrl = browserState.currentUrl;
      }
      if (buildJobState.supported !== true && !snapshot.building && (
        (editorState && editorState.hasEditor && (editorState.port > 0 || editorState.viewerUrl.length > 0 || lower(editorState.currentUrl || "") !== "about:blank")) ||
        (stateOnlyValue !== true && editorResult && editorResult.opened === true) ||
        browserHasVisibleDocument(browserState) ||
        browserState.progress > 0
      )) {
        snapshot.building = true;
      }
      if (generationFailed) {
        snapshot.failed = true;
        snapshot.building = false;
        pushCompileError(snapshot, {
          time: "",
          level: "ERROR",
          category: "MobileBuilder",
          message: generationState.error || "Mobile source generation failed.",
          extra: ""
        });
      } else if (buildJobActive || waitingForGeneration || waitingForScheduledCycle || waitingForPendingCycle || waitingForViewerReload) {
        snapshot.building = true;
        snapshot.failed = false;
      } else if (buildJobState.supported === true && launchRequested === true && buildJobObserved !== true) {
        snapshot.building = true;
      }
      if (browserState.hasError === true && !buildJobActive && !waitingForGeneration && !waitingForScheduledCycle && !waitingForPendingCycle && !waitingForViewerReload) {
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
      return !buildJobActive &&
        !waitingForGeneration &&
        !waitingForScheduledCycle &&
        !waitingForPendingCycle &&
        !waitingForViewerReload &&
        snapshot.building !== true &&
        snapshot.failed !== true &&
        candidateUrl.length > 0 &&
        urlReachable(candidateUrl, 1500) &&
        hasViewerReadyEvidence(snapshot, editorState, browserState, (snapshot.port != null && snapshot.port > 0) ? ("http://localhost:" + snapshot.port) : "") === true;
    }

    ready = refreshCurrentState();
    var stateOnlyStopped = stateOnlyValue === true &&
      ready !== true &&
      snapshot.failed !== true &&
      snapshot.building !== true;

    while (waitValue === true && !ready && !stateOnlyStopped && java.lang.System.currentTimeMillis() < deadline) {
      ready = refreshCurrentState();
      if (ready) {
        break;
      }
      if (snapshot.failed === true) {
        if (snapshot.terminal === true) {
          break;
        }
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
      ready = refreshCurrentState();
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
    var browserDebugUrl = editorState && editorState.browserDebugUrl ? editorState.browserDebugUrl : "";
    var browserDevToolsJsonUrl = editorState && editorState.browserDevToolsJsonUrl ? editorState.browserDevToolsJsonUrl : "";
    var browserDevToolsWebSocketUrl = editorState && editorState.browserDevToolsWebSocketUrl ? editorState.browserDevToolsWebSocketUrl : "";
    var browserDevToolsTarget = editorState && editorState.browserDevToolsTarget ? editorState.browserDevToolsTarget : null;
    var browserRemoteDebuggingPort = editorState && editorState.browserRemoteDebuggingPort ? editorState.browserRemoteDebuggingPort : parsePortFromUrl(browserDebugUrl);
    var browserDebugPortMatched = browserDebugPortValue <= 0 || browserRemoteDebuggingPort === browserDebugPortValue;
    var browserControlReady = browserDebugPortMatched && isBrowserControlReady(editorState, browserState, viewerBaseUrl);
    var browserControlUrl = browserControlTargetUrl(editorState, browserState);

    var waited = waitValue === true && timeoutSecValue > 0;
    var status = ready
      ? "ready"
      : (snapshot.failed === true
        ? "compile_error"
        : (snapshot.building === true
          ? "building"
          : (launchRequested === true
            ? (waited ? "timeout" : "starting")
            : "stopped")));
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
              : (waitValue === true
                ? "Mobile builder is still building and did not expose the browser URL before the timeout."
                : "Mobile builder is building; call again with wait=true or stateOnly=true to poll readiness.")
          )
          : (status === "starting"
            ? "Mobile builder launch requested; returning without waiting for readiness."
            : (status === "stopped"
              ? "No running mobile builder viewer was detected."
            : "Mobile builder start timed out before detecting the browser URL."))));
    var nextAction = status === "stopped"
      ? {
        tool: "mobile-builder-open",
        arguments: {
          project: projectName,
          stateOnly: false,
          wait: false
        }
      }
      : null;
    if (!studioMode) {
      message = message + " Studio mode is disabled; this tool is intended for Studio usage.";
    }
    var publicEditorResult = {
      requested: editorResult && editorResult.requested === true,
      opened: editorResult && editorResult.opened === true,
      builderLaunchRequested: editorResult && editorResult.builderLaunchRequested === true,
      stateOnly: editorResult && editorResult.stateOnly === true,
      message: editorResult && editorResult.message ? editorResult.message : "",
      error: editorResult && editorResult.error ? editorResult.error : ""
    };

    return {
      status: status,
      project: projectName,
      message: message,
      ready: ready,
      launched: stateOnlyValue !== true,
      launchRequested: launchRequested,
      reusedBuild: reusedExistingBuilder,
      wait: waitValue,
      waited: waited,
      revealWaitCapApplied: revealWaitCapApplied,
      stateOnly: stateOnlyValue,
      studioMode: studioMode === true,
      threadAlive: ready || status === "building" || status === "starting",
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
      browserDebugUrl: browserDebugUrl,
      browserDevToolsJsonUrl: browserDevToolsJsonUrl,
      browserDevToolsWebSocketUrl: browserDevToolsWebSocketUrl,
      browserDevToolsTarget: browserDevToolsTarget,
      browserRemoteDebuggingPort: browserRemoteDebuggingPort,
      browserDebugPortRequested: browserDebugPortValue,
      browserDebugPortApplied: editorResult && editorResult.browserDebugPortApplied === true,
      browserDebugPortMatched: browserDebugPortMatched,
      browserControlReady: browserControlReady,
      browserControlTargetUrl: browserControlUrl,
      browserControlHint: status === "stopped"
        ? "No builder runtime is active. Call mobile-builder-open once with stateOnly=false and wait=false, continue other work, then poll readiness."
        : (browserDebugUrl.length
        ? (!browserDebugPortMatched
          ? "Studio JxBrowser is not using the managed CDP port yet. Retry mobile-builder-open after the Studio classes are updated; do not use Playwright until browserDebugPortMatched is true."
          : (browserControlReady
            ? "Use the existing Studio JxBrowser CDP target through Playwright/browser-control MCP; do not create a new browser tab/page or run ad hoc Node/CDP scripts. If those MCP tools are unavailable or stale, report the configuration problem."
            : "Studio JxBrowser CDP exists, but the current target is still the loader/about:blank. Poll mobile-builder-open with stateOnly=true and wait=true before using Playwright/browser-control."))
        : ""),
      nextAction: nextAction,
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
      build: {
        supported: buildJobState && buildJobState.supported === true,
        jobName: buildJobNameValue,
        active: buildJobState && buildJobState.active === true,
        state: buildJobState && buildJobState.state ? buildJobState.state : "none",
        observed: buildJobObserved === true,
        finishedAtObserved: buildJobFinishedObservedAt,
        requestedAt: pendingBuildRequestedAt,
        terminalObserved: terminalBuildObserved === true,
        generation: {
          supported: generationState && generationState.supported === true,
          id: generationState && generationState.id ? generationState.id : 0,
          status: generationState && generationState.status ? generationState.status : "none",
          startedAt: generationState && generationState.startedAt ? generationState.startedAt : 0,
          completedAt: generationState && generationState.completedAt ? generationState.completedAt : 0,
          changedFileCount: generationState && generationState.changedFileCount ? generationState.changedFileCount : 0,
          noChange: generationNoChange === true,
          failed: generationFailed === true,
          error: generationState && generationState.error ? generationState.error : ""
        }
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
  forceRestart: (typeof forceRestart !== "undefined") ? forceRestart : false,
  browserDebugPort: (typeof browserDebugPort !== "undefined") ? browserDebugPort : 0,
  wait: (typeof wait !== "undefined") ? wait : true,
  stateOnly: (typeof stateOnly !== "undefined") ? stateOnly : false,
  reveal: (typeof reveal !== "undefined") ? reveal : false
});
if (openMobileBuilderResult && C8O.uiReveal && C8O.uiReveal.enabled((typeof reveal !== "undefined") ? reveal : false, false) === true) {
  openMobileBuilderResult.reveal = C8O.uiReveal.mobileBuilder(project, openMobileBuilderResult, { reveal: true });
}
var openMobileBuilderLogs = openMobileBuilderResult && openMobileBuilderResult.logs ? openMobileBuilderResult.logs : [];
var openMobileBuilderLogQuery = openMobileBuilderResult && openMobileBuilderResult.logQuery ? openMobileBuilderResult.logQuery : {};
