/*
 * mobile-builder-build: the production build of the NGX application of a project, as the Build button of the Studio's
 * Build panel runs it (the "Build locally" production mode of the Eclipse application editor): npm run build in
 * _private/ionic, written to DisplayObjects/mobile, which a deployed project serves. Without it a deployed app shows
 * "Not built" (13/11: the agent had no tool for it, the user clicked Build before deploying).
 *
 * The engine entry point is WsBuilder.buildForServer (Convertigo 8.5): it runs the build in the calling thread, so the
 * tool runs it in a thread of its own and waits up to waitSec; a longer build answers status "running" with its
 * buildId, and mobile-builder-build({project, buildId}) waits again. The Studio's Build panel sees it as a local build
 * of the project. An engine without the entry point answers status "unsupported": the user clicks Build in the Studio.
 */
if (typeof C8O === "undefined") { var C8O = {}; }
C8O.mobileBuilderBuild = C8O.mobileBuilderBuild || {};

(function (api) {
  var STORE_KEY = "lib_ConvertigoMCP.ngxProductionBuilds.v1";
  var DEFAULT_WAIT_SEC = 40;
  // A tool call longer than about a minute fails on the client side; the poll and the answer fit in 45 s.
  var MAX_WAIT_SEC = 40;
  var MAX_LINES = 40;
  var MAX_ERRORS = 20;
  var POLL_MS = 500;

  api.STORE_KEY = STORE_KEY;
  api.MAX_WAIT_SEC = MAX_WAIT_SEC;

  function str(value) {
    return value == null ? "" : String(value).trim();
  }

  function bool(value) {
    return value === true || str(value).toLowerCase() === "true";
  }

  // A line of the build that tells an error, as esbuild, the Angular compiler and the engine write them.
  api.isErrorLine = function (line) {
    var lower = str(line).toLowerCase();
    return /^✘ \[error\]|^\[error\]|^error:|^error (ts|ng)\d+|^exception:|bundle generation failed|failed to compile|^npm err!/.test(lower);
  };

  function waitSecOf(value) {
    var n = parseInt(str(value), 10);
    if (isNaN(n)) {
      return DEFAULT_WAIT_SEC;
    }
    return Math.max(0, Math.min(MAX_WAIT_SEC, n));
  }


  // The shared map of the builds, by project: each entry a map of texts (buildId, status, startedAt, endedAt, endpoint)
  // and two lists (lines: the last output lines, errors).
  function buildsOf(host) {
    var store = host.server();
    // the store has no putIfAbsent: the first build of the engine creates the map
    if (store.get(STORE_KEY) == null) {
      store.set(STORE_KEY, host.newMap());
    }
    return store.get(STORE_KEY);
  }

  function snapshot(host, entry) {
    if (entry == null) {
      return null;
    }
    return {
      buildId: str(entry.get("buildId")),
      status: str(entry.get("status")),
      startedAt: Number(str(entry.get("startedAt")) || 0),
      endedAt: Number(str(entry.get("endedAt")) || 0),
      endpoint: str(entry.get("endpoint")),
      lines: host.listOf(entry.get("lines")),
      errors: host.listOf(entry.get("errors"))
    };
  }

  function start(host, builds, project, endpoint) {
    var entry = host.newMap();
    var startedAt = host.now();
    var buildId = "build-" + startedAt;
    var lines = host.newList();
    var errors = host.newList();
    entry.put("buildId", buildId);
    entry.put("status", "running");
    entry.put("startedAt", String(startedAt));
    entry.put("endedAt", "0");
    entry.put("endpoint", endpoint);
    entry.put("lines", lines);
    entry.put("errors", errors);
    builds.put(project, entry);
    host.startThread("lib_ConvertigoMCP-ngx-production-build-" + project, function () {
      var status = "failed";
      try {
        var built = host.build(project, endpoint, function (line) {
          var text = String(line);
          lines.add(text);
          while (lines.size() > MAX_LINES) {
            lines.remove(0);
          }
          if (api.isErrorLine(text) && errors.size() < MAX_ERRORS) {
            errors.add(text.substring(0, 2000));
          }
        });
        status = built === true ? "success" : (host.stopped(lines) ? "stopped" : "failed");
      } catch (buildError) {
        var message = "Exception: " + String(buildError && buildError.message ? buildError.message : buildError);
        lines.add(message);
        if (errors.size() < MAX_ERRORS) {
          errors.add(message);
        }
      } finally {
        entry.put("endedAt", String(host.now()));
        entry.put("status", status);
      }
    });
    return entry;
  }

  // host: server() -> {get(key), set(key, value)}, newMap(), newList(), listOf(list) -> its texts, now(), sleep(ms),
  // startThread(name, fn),
  // build(project, endpoint, onLine) -> whether built, stopped(lines), supported() -> whether the engine has the entry
  // point, application(project) -> {exists, ngx, dir}, defaultEndpoint(), output(project) -> {built, indexHtml}.
  api.run = function (params, host) {
    params = params || {};
    var project = str(params.project);
    if (!project.length) {
      throw new Error("project is required: the project whose NGX application to build for production.");
    }
    var application = host.application(project);
    if (!application.exists) {
      throw new Error("Project not found: " + project + ". project-list gives the loaded projects.");
    }
    if (!application.ngx) {
      throw new Error("The project " + project + " has no NGX application to build (no mobile application with an NGX application component).");
    }
    var outputFolder = str(application.dir) + "/DisplayObjects/mobile";
    var endpoint = (str(params.endpoint) || str(host.defaultEndpoint())).replace(/\/+$/, "");
    var applicationPath = (function () {
      var path = /^https?:\/\/[^\/]+(\/[^?#]*)?/i.exec(endpoint);
      return ((path && path[1]) || "/convertigo").replace(/\/+$/, "") + "/projects/" + project + "/DisplayObjects/mobile/";
    })();
    if (!host.supported()) {
      return {
        status: "unsupported",
        project: project,
        buildId: "",
        built: host.output(project).built === true,
        outputFolder: outputFolder,
        applicationPath: applicationPath,
        durationMs: 0,
        errors: [],
        logs: [],
        message: "This engine has no production build entry point for tools (WsBuilder.buildForServer, Convertigo 8.5).",
        next: "Before a deployment, ask the user to run the production build in the Studio: Build in the Build panel of the web or " +
          "desktop Studio, or Build locally > Production in the application editor of the Eclipse Studio. It writes " +
          "DisplayObjects/mobile; a project deployed without it shows \"Not built\"."
      };
    }
    var builds = buildsOf(host);
    var entry = builds.get(project);
    var current = snapshot(host, entry);
    var asked = str(params.buildId);
    var started = false;
    if (asked.length && (!current || current.buildId !== asked)) {
      throw new Error("No build " + asked + " for " + project + (current ? " (its last build is " + current.buildId + ")" : "") +
        ": call mobile-builder-build({project}) to start one.");
    }
    if (!asked.length && (!current || current.status !== "running")) {
      entry = start(host, builds, project, endpoint);
      started = true;
    }
    var waitMs = waitSecOf(params.waitSec) * 1000;
    var deadline = host.now() + waitMs;
    current = snapshot(host, entry);
    while (current.status === "running" && host.now() < deadline) {
      host.sleep(POLL_MS);
      current = snapshot(host, entry);
    }
    var output = host.output(project);
    var result = {
      status: current.status,
      project: project,
      buildId: current.buildId,
      started: started,
      built: current.status === "success" && output.built === true,
      outputFolder: outputFolder,
      applicationPath: applicationPath,
      durationMs: Math.max(0, (current.endedAt || host.now()) - current.startedAt),
      errors: current.errors,
      logs: current.lines.slice(-MAX_LINES)
    };
    if (current.status === "running") {
      result.message = "The production build runs (npm run build, a few minutes on a first build).";
      result.next = "Call mobile-builder-build({project:\"" + project + "\", buildId:\"" + current.buildId + "\"}) again to wait for it; " +
        "keep doing other work in between if there is any.";
    } else if (current.status === "success") {
      result.message = output.built === true ? "The application is built for production in DisplayObjects/mobile."
        : "The build ended without error, but DisplayObjects/mobile holds no production build (no env.json with appGenerationTime).";
      result.next = output.built === true
        ? "Deploy or export the project now: the production build is part of the project folder. On this engine the built app opens at " +
          applicationPath + "home (the dev viewer stays at viewerHomeUrl)."
        : "Read the logs, fix the cause, and build again.";
    } else {
      result.message = current.status === "stopped" ? "The production build was stopped (another build of the project replaced it)."
        : "The production build failed: " + (current.errors.length ? current.errors[0] : "see the logs.");
      result.next = "Fix the Convertigo source objects the errors name (never the generated files in _private/ionic or DisplayObjects), " +
        "check the dev build with mobile-builder-open(stateOnly=true, wait=true), then call mobile-builder-build again.";
    }
    return result;
  };

  // The host of the engine.
  api.javaHost = function (context) {
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    var WsBuilder = null;
    try {
      WsBuilder = Packages.com.twinsoft.convertigo.engine.admin.services.studio.ngxbuilder.WsBuilder;
      if (typeof WsBuilder.buildForServer !== "function") {
        WsBuilder = null;
      }
    } catch (_noWsBuilder) {
      WsBuilder = null;
    }
    function projectOf(name) {
      try {
        return Engine.theApp.databaseObjectsManager.getOriginalProjectByName(String(name));
      } catch (_notLoaded) {
        return null;
      }
    }
    return {
      server: function () {
        return context.server;
      },
      newMap: function () {
        return new java.util.concurrent.ConcurrentHashMap();
      },
      newList: function () {
        return java.util.Collections.synchronizedList(new java.util.ArrayList());
      },
      // a copy first: the build thread adds lines while the tool reads them
      listOf: function (list) {
        var out = [];
        if (list == null) {
          return out;
        }
        var copy = new java.util.ArrayList(list);
        for (var i = 0; i < copy.size(); i++) {
          out.push(String(copy.get(i)));
        }
        return out;
      },
      now: function () {
        return Number(java.lang.System.currentTimeMillis());
      },
      sleep: function (ms) {
        java.lang.Thread.sleep(ms);
      },
      startThread: function (name, fn) {
        // the thread inherits the log context of the MCP request, which a managed client sends without log: cleared, as
        // WsBuilder does for its own builds, so the output of the build stays in the Studio log
        var run = function () {
          try {
            Packages.com.twinsoft.convertigo.engine.util.Log4jHelper.mdcClear();
          } catch (_noLog4jHelper) {}
          fn();
        };
        var thread = new java.lang.Thread(new java.lang.Runnable({ run: run }), String(name));
        thread.setDaemon(true);
        thread.start();
      },
      supported: function () {
        return WsBuilder !== null;
      },
      build: function (project, endpoint, onLine) {
        return WsBuilder.buildForServer(String(project), String(endpoint), new java.util.function.Consumer({
          accept: function (line) {
            onLine(String(line));
          }
        })) === true;
      },
      stopped: function (lines) {
        for (var i = lines.size() - 1; i >= 0 && i >= lines.size() - 5; i--) {
          if (/The build is stopped/.test(String(lines.get(i)))) {
            return true;
          }
        }
        return false;
      },
      application: function (name) {
        var project = projectOf(name);
        if (project == null) {
          return { exists: false, ngx: false, dir: "" };
        }
        var ngx = false;
        try {
          var mobile = project.getMobileApplication();
          var component = mobile == null ? null : mobile.getApplicationComponent();
          ngx = component != null && String(component.getClass().getName()) === "com.twinsoft.convertigo.beans.ngx.components.ApplicationComponent";
        } catch (_noApplication) {
          ngx = false;
        }
        return { exists: true, ngx: ngx, dir: String(project.getDirPath()) };
      },
      defaultEndpoint: function () {
        try {
          var EPM = Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager;
          return String(EPM.getProperty(EPM.PropertyName.APPLICATION_SERVER_CONVERTIGO_URL));
        } catch (_noProperty) {
          return "";
        }
      },
      // A production build writes env.json with appGenerationTime, which the page of an unbuilt application has not.
      output: function (name) {
        var project = projectOf(name);
        if (project == null) {
          return { built: false };
        }
        var mobile = new java.io.File(String(project.getDirPath()), "DisplayObjects/mobile");
        var built = false;
        try {
          var env = new java.io.File(mobile, "env.json");
          built = env.isFile() && String(new java.lang.String(java.nio.file.Files.readAllBytes(env.toPath()), "UTF-8")).indexOf("\"appGenerationTime\"") >= 0;
        } catch (_noEnv) {
          built = false;
        }
        return { built: built && new java.io.File(mobile, "index.html").isFile() };
      }
    };
  };

  api.execute = function (context, params) {
    return api.run(params, api.javaHost(context));
  };
})(C8O.mobileBuilderBuild);
