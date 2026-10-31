/*
 * The verifier sub-agent (profile "verifier" of js/subagents.js, runner "vision-browser") and its browser-verify tool.
 * A vision model of the Convertigo LLM gateway (default mistral/mistral-large-4) drives the Studio browser of the
 * conversation (the JxBrowser viewer, through the same CDP endpoint as the agent's Playwright MCP), walks the paths it
 * is given in plain language, looks at its own screenshots and returns a short report: each check passed or failed
 * with its evidence, the visual defects seen, the screenshots saved in the Studio workspace.
 *
 * The calling agent keeps a small context: one tool call instead of one model step per click, evaluate or find.
 * The sub-agent only observes: it has no project, file or Convertigo tool, only the page.
 *
 * It runs as a Node child process (node/browser_verify_agent.cjs, the Studio Node.js and the playwright-core package
 * the Agent Bridge installs for the managed Playwright MCP). browser-verify is the verifier profile of subagent-run with
 * flat arguments (paths, checks...) and a flat report; both share the run store, the locks and the usage block.
 */
if (typeof C8O === "undefined") { var C8O = {}; }
C8O.browserVerify = C8O.browserVerify || {};

(function (api) {
  var MAX_PATHS = 8;
  var MAX_CHECKS = 20;

  function sa() {
    return C8O.subagents;
  }

  function str(value) {
    return value == null ? "" : String(value).trim();
  }

  // A JSON array (of strings or {name, steps}) or one item per line; bullets and numbers are dropped.
  api.parseList = function (value, name, max) {
    var items;
    if (Array.isArray(value)) {
      items = value;
    } else {
      var text = str(value);
      if (!text.length) {
        return [];
      }
      items = null;
      if (text.charAt(0) === "[") {
        try {
          items = JSON.parse(text);
        } catch (_notJson) {
          items = null;
        }
      }
      if (!Array.isArray(items)) {
        items = text.split(/\r?\n/).map(function (line) {
          return line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim();
        });
      }
    }
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item && typeof item === "object") {
        var steps = str(item.steps || item.description || item.path || item.check);
        if (steps.length) {
          out.push(str(item.name).length ? { name: str(item.name), steps: steps } : steps);
        }
      } else if (str(item).length) {
        out.push(str(item));
      }
    }
    if (out.length > max) {
      throw new Error(name + ": at most " + max + " items per call; split the verification in several calls.");
    }
    return out;
  };

  // Only a loopback CDP endpoint: the sub-agent must drive the Studio browser, never a remote one.
  api.normalizeCdpEndpoint = function (port, endpoint) {
    var p = parseInt(str(port) || "0", 10);
    if (!isNaN(p) && p >= 1024 && p <= 65535) {
      return "http://127.0.0.1:" + p;
    }
    var text = str(endpoint).replace(/\/json(?:\/version)?\/?$/, "").replace(/\/+$/, "");
    if (!text.length) {
      return "";
    }
    if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d{4,5}$/.test(text)) {
      throw new Error("cdpEndpoint must be a loopback address such as http://127.0.0.1:<port>.");
    }
    return text;
  };

  api.relativePath = function (root, file) {
    return sa().relativePath(root, file);
  };

  // The window the verifier works in. The Studio viewer pane can be very narrow (197 px seen in run 6), which made
  // layouts look broken: the verification emulates this size and the pane gets its own back when the verifier
  // disconnects. "desktop" (default) 1280x800, "mobile" 390x844, "<width>x<height>" or {width, height}.
  api.parseViewport = function (value) {
    var text = str(value).toLowerCase();
    if (value && typeof value === "object" && value.width && value.height) {
      return { width: Math.max(320, Math.min(3840, Number(value.width) || 1280)), height: Math.max(320, Math.min(2160, Number(value.height) || 800)) };
    }
    if (text === "mobile") {
      return { width: 390, height: 844 };
    }
    var m = /^(\d{3,4})\s*x\s*(\d{3,4})$/.exec(text);
    if (m) {
      return api.parseViewport({ width: Number(m[1]), height: Number(m[2]) });
    }
    return { width: 1280, height: 800 };
  };

  // subagent-run passes its inputs in `inputs` (url, paths, checks, hints); browser-verify passes them flat. Without
  // paths, the task itself is the path to walk.
  function verifierInputs(params) {
    var inputs = sa().objectArg(params.inputs);
    var pick = function (key) {
      return params[key] !== undefined && params[key] !== null && str(params[key]).length ? params[key] : inputs[key];
    };
    var paths = api.parseList(pick("paths"), "paths", MAX_PATHS);
    if (!paths.length && str(params.task).length) {
      paths = [str(params.task)];
    }
    return {
      url: str(pick("url")),
      viewport: api.parseViewport(pick("viewport")),
      paths: paths,
      checks: api.parseList(pick("checks"), "checks", MAX_CHECKS),
      hints: [str(pick("hints")), str(params.reportFormat).length ? "Report format asked: " + str(params.reportFormat) : ""]
        .filter(function (x) { return x.length; }).join("\n")
    };
  }

  // The runner of the verifier profile: the browser to drive, the Node agent and its configuration.
  api.runner = {
    prepare: function (params, profile, ctx, host) {
      var inputs = verifierInputs(params);
      if (!inputs.paths.length) {
        throw new Error("paths is required: the paths to walk and check, in plain language, for example " +
          "[\"Log in as the demo user, open the orders list, check that 3 orders are shown\"].");
      }
      var reasoning = str(params.reasoning).toLowerCase();
      if (reasoning.length && reasoning !== "none" && reasoning !== "high") {
        throw new Error("reasoning must be none or high.");
      }
      var cdpEndpoint = host.cdpEndpoint(params);
      if (!cdpEndpoint.length) {
        throw new Error("No Studio browser for this conversation: open the application with mobile-builder-open first " +
          "(it starts the viewer this sub-agent drives), then call again.");
      }
      // The probe answers the loopback address where the viewer shows a page (true keeps the given one).
      var live = host.probe(cdpEndpoint);
      if (!live) {
        throw new Error("The Studio browser does not answer on " + cdpEndpoint + ": open the application with " +
          "mobile-builder-open (it restarts the viewer with its debug port), then call again.");
      }
      if (typeof live === "string") {
        cdpEndpoint = live;
      }
      return {
        command: [host.nodePath(), host.scriptPath()],
        env: { PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1" },
        lockKey: cdpEndpoint,
        task: str(params.task) || inputs.paths.map(function (p) { return typeof p === "string" ? p : p.name + ": " + p.steps; }).join(" / "),
        config: {
          gatewayUrl: ctx.gatewayUrl,
          model: profile.model,
          reasoning: reasoning || "none",
          cdpEndpoint: cdpEndpoint,
          url: inputs.url,
          viewport: inputs.viewport,
          paths: inputs.paths,
          checks: inputs.checks,
          context: inputs.hints.substring(0, 2000),
          maxSteps: profile.limits.maxSteps,
          timeBudgetMs: profile.limits.timeBudgetSec * 1000,
          maxCostUsd: profile.limits.maxCostUsd,
          playwrightModule: host.playwrightModule()
        }
      };
    },
    // A finished verification: the report with workspace-relative screenshots, the run figures and the usage. The step
    // trace stays in report.json next to the screenshots.
    toResult: function (output, run, root) {
      var report = output.report || {};
      var rel = function (file) { return file ? sa().relativePath(root, file) : ""; };
      var mapShot = function (entry) {
        var copy = {};
        for (var k in entry) {
          if (Object.prototype.hasOwnProperty.call(entry, k)) {
            copy[k] = entry[k];
          }
        }
        copy.screenshot = rel(entry.screenshot);
        return copy;
      };
      var usage = output.usage || {};
      return {
        status: "finished",
        runId: run.runId,
        profile: run.profile,
        model: str(usage.model) || run.model,
        task: run.task,
        report: {
          verdict: str(report.verdict) || "partial",
          summary: str(report.summary),
          checks: (report.checks || []).map(mapShot),
          visualDefects: (report.visualDefects || []).map(mapShot),
          designSuggestions: (report.designSuggestions || []).map(mapShot),
          screenshots: (output.screenshots || []).map(function (s) {
            return { name: str(s.name), path: rel(s.file), url: str(s.url) };
          }),
          finalUrl: str(output.finalUrl)
        },
        reportFile: rel(output.reportFile),
        stopReason: str(output.stopReason),
        modelCalls: Number(usage.requests) || 0,
        actions: Number(output.toolCalls) || 0,
        durationMs: Number(output.durationMs) || 0,
        usage: sa().usageOf(usage, run, usage.tool)
      };
    }
  };

  api.runners = function () {
    return { "vision-browser": api.runner };
  };

  // browser-verify keeps its flat shape: the report fields at the top, verificationId for the runId.
  api.flatten = function (result) {
    if (result.status === "running") {
      return {
        status: "running",
        verificationId: result.runId,
        elapsedMs: result.elapsedMs,
        activity: result.activity,
        message: "The verification is still running. Call browser-verify again with this verificationId (and nothing " +
          "else) to wait for its report; do not start another verification meanwhile."
      };
    }
    var report = result.report || {};
    return {
      status: "finished",
      verificationId: result.runId,
      verdict: report.verdict,
      summary: report.summary,
      checks: report.checks,
      visualDefects: report.visualDefects,
      designSuggestions: report.designSuggestions || [],
      screenshots: report.screenshots,
      reportFile: result.reportFile,
      finalUrl: report.finalUrl,
      stopReason: result.stopReason,
      modelCalls: result.modelCalls,
      browserActions: result.actions,
      durationMs: result.durationMs,
      usage: result.usage
    };
  };

  api.run = function (params, host) {
    params = params || {};
    var call = {};
    for (var k in params) {
      if (Object.prototype.hasOwnProperty.call(params, k)) {
        call[k] = params[k];
      }
    }
    call.runId = params.verificationId;
    return api.flatten(sa().run(call, host, api.runners(), { profile: "verifier", usageTool: "browser-verify" }));
  };

  // The verifier's part of the Studio host: the conversation's viewer, Node.js, playwright-core and the agent script.
  api.javaHost = function () {
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    var File = java.io.File;
    var host = sa().javaHost();
    var workspace = new File(String(Engine.USER_WORKSPACE_PATH)).getCanonicalFile();
    var windows = String(java.lang.System.getProperty("os.name")).toLowerCase().indexOf("win") >= 0;

    // The managed agent hosts send their conversation's viewer debug port in X-Convertigo-Viewer-Debug-Port; the MCP
    // router passes it as browserDebugPort. An explicit cdpEndpoint (loopback only) is the fallback.
    host.cdpEndpoint = function (params) {
      return api.normalizeCdpEndpoint(params.browserDebugPort, params.cdpEndpoint);
    };
    // A port can be held twice, on 127.0.0.1 and on [::1], by a stale browser and by the live viewer: the address
    // whose target list shows a page wins, else the first that answers.
    host.probe = function (endpoint) {
      var Http = java.net.http;
      var client = Http.HttpClient.newBuilder().connectTimeout(java.time.Duration.ofSeconds(3)).build();
      var port = (/:(\d+)$/.exec(endpoint) || [])[1];
      var candidates = [endpoint];
      if (port) {
        ["http://127.0.0.1:", "http://[::1]:"].forEach(function (base) {
          if (candidates.indexOf(base + port) < 0) {
            candidates.push(base + port);
          }
        });
      }
      var answering = "";
      for (var i = 0; i < candidates.length; i++) {
        try {
          var request = Http.HttpRequest.newBuilder(java.net.URI.create(candidates[i] + "/json/list"))
            .timeout(java.time.Duration.ofSeconds(5)).GET().build();
          var response = client.send(request, Http.HttpResponse.BodyHandlers.ofString());
          if (Number(response.statusCode()) !== 200) {
            continue;
          }
          answering = answering || candidates[i];
          var targets = JSON.parse(String(response.body()));
          if (targets.some(function (t) { return t && t.type === "page"; })) {
            return candidates[i];
          }
        } catch (_noBrowser) {}
      }
      return answering;
    };
    host.nodePath = function () {
      var dirs = [];
      try {
        dirs.push(Packages.com.twinsoft.convertigo.engine.util.ProcessUtils.getDefaultNodeDir());
      } catch (_noDefaultNode) {}
      var nodes = new File(workspace, "nodes");
      var children = nodes.isDirectory() ? nodes.listFiles() : null;
      if (children !== null) {
        var sorted = [];
        for (var i = 0; i < children.length; i++) {
          sorted.push(children[i]);
        }
        sorted.sort(function (a, b) { return String(b.getName()).localeCompare(String(a.getName())); });
        dirs = dirs.concat(sorted);
      }
      for (var d = 0; d < dirs.length; d++) {
        if (!dirs[d]) {
          continue;
        }
        var candidates = windows
          ? [new File(dirs[d], "node.exe")]
          : [new File(new File(dirs[d], "bin"), "node"), new File(dirs[d], "node")];
        for (var c = 0; c < candidates.length; c++) {
          if (candidates[c].isFile()) {
            return String(candidates[c].getPath());
          }
        }
      }
      throw new Error("No Node.js in this Studio (" + nodes.getPath() + "): open the NGX builder once so the Studio installs it.");
    };
    // playwright-core comes with the Playwright MCP the Agent Bridge installs for each agent runtime.
    host.playwrightModule = function () {
      var runtimes = ["vibe", "codex", "claude"];
      for (var i = 0; i < runtimes.length; i++) {
        var dir = new File(new File(new File(new File(workspace, "agents"), runtimes[i]), "npm"), "node_modules/playwright-core");
        if (new File(dir, "package.json").isFile()) {
          return String(dir.getPath());
        }
      }
      throw new Error("Playwright is not installed in this Studio's agent runtimes (" + workspace.getPath() +
        "/agents/*/npm): start a Tigo conversation once so the Agent Bridge installs the Playwright MCP.");
    };
    host.scriptPath = function () {
      var project = Engine.theApp.databaseObjectsManager.getOriginalProjectByName("lib_ConvertigoMCP");
      return String(new File(new File(new File(String(project.getDirPath())), "node"), "browser_verify_agent.cjs").getPath());
    };
    return host;
  };

  // Private alone is not an HTTP authentication boundary in Eclipse Studio, and this tool spends gateway credits:
  // the full MCP bearer is checked again here, as image-describe does.
  api.execute = function (contextObject, params) {
    var auth = C8O.mcpAuth.authenticateRequest(contextObject);
    if (!auth.authenticated || auth.kind === "nocode" || auth.scope !== "mcp:full") {
      throw new Error("A full Convertigo MCP bearer token is required");
    }
    return api.run(params, api.javaHost());
  };
})(C8O.browserVerify);
