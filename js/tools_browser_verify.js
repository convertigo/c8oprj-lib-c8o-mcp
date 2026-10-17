/*
 * browser-verify: a verification sub-agent for the functional and visual browser proofs of an agent.
 * A vision model of the Convertigo LLM gateway (default mistral/mistral-large-4) drives the Studio browser of the
 * conversation (the JxBrowser viewer, through the same CDP endpoint as the agent's Playwright MCP), walks the paths it
 * is given in plain language, looks at its own screenshots and returns a short report: each check passed or failed
 * with its evidence, the visual defects seen, the screenshots saved in the Studio workspace.
 *
 * The calling agent keeps a small context: one tool call instead of one model step per click, evaluate or find.
 * The sub-agent only observes: it has no project, file or Convertigo tool, only the page.
 *
 * It runs as a Node child process (node/browser_verify_agent.cjs, the Studio Node.js and the playwright-core package
 * the Agent Bridge installs for the managed Playwright MCP). The gateway key stays server side, as for image-describe:
 * it goes to the child through its environment only. The result carries the usage of every model request of the
 * verification (usage.tool = "browser-verify") for the Agent Bridge to add to the conversation usage per model.
 */
if (typeof C8O === "undefined") { var C8O = {}; }
C8O.browserVerify = C8O.browserVerify || {};

(function (api) {
  var GATEWAY_URL = "https://llm.convertigo.com/v1";
  var DEFAULT_MODEL = "mistral/mistral-large-4";
  var KEY_ENV = "CONVERTIGO_LLM_API_KEY";
  var DEFAULT_TIME_BUDGET_SEC = 150;
  var MAX_TIME_BUDGET_SEC = 540;
  var DEFAULT_MAX_STEPS = 40;
  var MAX_PATHS = 8;
  var MAX_CHECKS = 20;
  var LOCK_GRACE_MS = 90 * 1000;
  var DEFAULT_WAIT_SEC = 50;
  var MAX_WAIT_SEC = 280;
  var VERIFICATION_ID = /^verify-\d{8}-\d{6}-[0-9a-f]{8}$/;

  api.DEFAULT_MODEL = DEFAULT_MODEL;
  api.DEFAULT_TIME_BUDGET_SEC = DEFAULT_TIME_BUDGET_SEC;

  function str(value) {
    return value == null ? "" : String(value).trim();
  }

  function intIn(value, fallback, min, max, name) {
    var text = str(value);
    if (!text.length) {
      return fallback;
    }
    var parsed = parseInt(text, 10);
    if (isNaN(parsed)) {
      throw new Error(name + " must be a number.");
    }
    return Math.max(min, Math.min(max, parsed));
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

  // Absolute screenshot paths become relative to the Studio user workspace, as image-describe and the agent use them.
  api.relativePath = function (root, file) {
    var r = str(root).replace(/\\/g, "/").replace(/\/+$/, "");
    var f = str(file).replace(/\\/g, "/");
    if (r.length && f.indexOf(r + "/") === 0) {
      return f.substring(r.length + 1);
    }
    return f;
  };

  api.buildConfig = function (params, resolved) {
    var paths = api.parseList(params.paths, "paths", MAX_PATHS);
    if (!paths.length) {
      throw new Error("paths is required: the paths to walk and check, in plain language, for example " +
        "[\"Log in as the demo user, open the orders list, check that 3 orders are shown\"].");
    }
    var reasoning = str(params.reasoning).toLowerCase();
    if (reasoning.length && reasoning !== "none" && reasoning !== "high") {
      throw new Error("reasoning must be none or high.");
    }
    var timeBudgetSec = intIn(params.timeBudgetSec, DEFAULT_TIME_BUDGET_SEC, 30, MAX_TIME_BUDGET_SEC, "timeBudgetSec");
    return {
      gatewayUrl: GATEWAY_URL,
      model: str(params.model) || DEFAULT_MODEL,
      reasoning: reasoning || "none",
      cdpEndpoint: resolved.cdpEndpoint,
      url: str(params.url),
      paths: paths,
      checks: api.parseList(params.checks, "checks", MAX_CHECKS),
      context: str(params.hints).substring(0, 2000),
      outDir: resolved.outDir,
      callId: resolved.callId,
      maxSteps: intIn(params.maxSteps, DEFAULT_MAX_STEPS, 6, 80, "maxSteps"),
      timeBudgetMs: timeBudgetSec * 1000,
      playwrightModule: resolved.playwrightModule
    };
  };

  // What the calling agent gets back: the report, workspace-relative screenshot paths, the run figures and the usage.
  // The step trace stays in report.json next to the screenshots.
  api.toResult = function (output, root) {
    var report = output.report || {};
    var rel = function (file) { return file ? api.relativePath(root, file) : ""; };
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
      verdict: str(report.verdict) || "partial",
      summary: str(report.summary),
      checks: (report.checks || []).map(mapShot),
      visualDefects: (report.visualDefects || []).map(mapShot),
      screenshots: (output.screenshots || []).map(function (s) {
        return { name: str(s.name), path: rel(s.file), url: str(s.url) };
      }),
      reportFile: rel(output.reportFile),
      finalUrl: str(output.finalUrl),
      stopReason: str(output.stopReason),
      modelCalls: Number(usage.requests) || 0,
      browserActions: Number(output.toolCalls) || 0,
      durationMs: Number(output.durationMs) || 0,
      usage: {
        tool: "browser-verify",
        callId: str(usage.callId),
        model: str(usage.model),
        requests: Number(usage.requests) || 0,
        inputTokens: Number(usage.inputTokens) || 0,
        cachedTokens: Number(usage.cachedTokens) || 0,
        outputTokens: Number(usage.outputTokens) || 0,
        reasoningTokens: Number(usage.reasoningTokens) || 0,
        totalTokens: Number(usage.totalTokens) || 0,
        cost: usage.cost === null || usage.cost === undefined || !isFinite(Number(usage.cost)) ? null : Number(usage.cost),
        currency: usage.cost === null || usage.cost === undefined ? "" : "USD",
        durationMs: Number(usage.durationMs) || 0
      }
    };
  };

  // The last JSON line of the agent output, or null while the agent still runs.
  api.parseOutput = function (text) {
    var lines = str(text).split(/\r?\n/);
    for (var i = lines.length - 1; i >= 0; i--) {
      if (str(lines[i]).charAt(0) === "{") {
        try {
          return JSON.parse(lines[i]);
        } catch (_notJsonLine) {}
      }
    }
    return null;
  };

  api.normalizeWaitSec = function (value) {
    return intIn(value, DEFAULT_WAIT_SEC, 5, MAX_WAIT_SEC, "waitSec");
  };

  // Waits up to waitSec for the report of a started verification. A verification runs longer than some agent hosts let
  // one tool call last (Vibe stops a call made from its code after about one minute), so a call that would outlast
  // waitSec answers status "running" with the verificationId to collect the report with.
  api.collect = function (verificationId, waitSec, host) {
    var deadline = host.now() + waitSec * 1000;
    var state = host.readRun(verificationId);
    if (!state.exists) {
      throw new Error("Unknown verificationId " + verificationId + ": start a verification with paths first.");
    }
    while (true) {
      var output = api.parseOutput(state.output);
      if (output !== null) {
        host.finishRun(verificationId);
        if (output.ok !== true) {
          throw new Error("The verification failed: " + str(output.error));
        }
        output.reportFile = state.outDir + "/report.json";
        var result = api.toResult(output, host.workspaceRoot());
        result.status = "finished";
        result.verificationId = verificationId;
        return result;
      }
      if (!state.alive) {
        host.finishRun(verificationId);
        throw new Error("The verification agent ended without a result; its log is in " +
          api.relativePath(host.workspaceRoot(), state.outDir) + "/agent.log.");
      }
      if (host.now() >= deadline) {
        return {
          status: "running",
          verificationId: verificationId,
          elapsedMs: Math.max(0, host.now() - state.startedAt),
          screenshots: state.screenshots.map(function (file) {
            return { name: file.replace(/^.*[\/\\]/, "").replace(/\.png$/, ""), path: api.relativePath(host.workspaceRoot(), file), url: "" };
          }),
          message: "The verification is still running. Call browser-verify again with this verificationId (and nothing " +
            "else) to wait for its report; do not start another verification meanwhile."
        };
      }
      host.sleep(1000);
      state = host.readRun(verificationId);
    }
  };

  // host: readKey(), cdpEndpoint(params) -> "", probe(endpoint) -> true|false, nodePath(), playwrightModule(),
  // scriptPath(), workspaceRoot(), newRun() -> {callId, outDir}, lock(endpoint, callId) -> lock file path (throws when
  // busy), start(command[], env, stdinText, outDir) -> starts the agent without waiting, readRun(id) -> {exists, outDir,
  // output, alive, startedAt, screenshots[]}, finishRun(id), now(), sleep(ms).
  api.run = function (params, host) {
    params = params || {};
    var waitSec = api.normalizeWaitSec(params.waitSec);
    var resume = str(params.verificationId);
    if (resume.length) {
      if (!VERIFICATION_ID.test(resume)) {
        throw new Error("verificationId must be the id a previous browser-verify call returned.");
      }
      return api.collect(resume, waitSec, host);
    }
    var cdpEndpoint = host.cdpEndpoint(params);
    if (!cdpEndpoint.length) {
      throw new Error("No Studio browser for this conversation: open the application with mobile-builder-open first " +
        "(it starts the viewer this tool drives), then call browser-verify again.");
    }
    if (!host.probe(cdpEndpoint)) {
      throw new Error("The Studio browser does not answer on " + cdpEndpoint + ": open the application with " +
        "mobile-builder-open (it restarts the viewer with its debug port), then call browser-verify again.");
    }
    var key = str(host.readKey());
    if (!key.length) {
      throw new Error("No Convertigo agent key in this Studio: set it from the Tigo assistant (the same key the agent uses), " +
        "or define " + KEY_ENV + " for the Studio process.");
    }
    var run = host.newRun();
    var config = api.buildConfig(params, {
      cdpEndpoint: cdpEndpoint,
      outDir: run.outDir,
      callId: run.callId,
      playwrightModule: host.playwrightModule()
    });
    // The agent removes the lock when it exits; a lock older than its budget is stale.
    config.lockFile = host.lock(cdpEndpoint, run.callId, config.timeBudgetMs);
    var env = {};
    env[KEY_ENV] = key;
    env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
    try {
      host.start([host.nodePath(), host.scriptPath()], env, JSON.stringify(config), run.outDir);
    } catch (e) {
      host.unlock(config.lockFile);
      throw e;
    }
    return api.collect(run.callId, waitSec, host);
  };

  api.javaHost = function (contextObject) {
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    var File = java.io.File;
    var Files = java.nio.file.Files;
    var workspace = new File(String(Engine.USER_WORKSPACE_PATH)).getCanonicalFile();
    var windows = String(java.lang.System.getProperty("os.name")).toLowerCase().indexOf("win") >= 0;

    function projectDir() {
      var project = Engine.theApp.databaseObjectsManager.getOriginalProjectByName("lib_ConvertigoMCP");
      return new File(String(project.getDirPath()));
    }

    return {
      readKey: function () {
        try {
          var keyFile = new File(new File(new File(workspace, "agents"), "convertigo"), "llm-api-key");
          if (keyFile.isFile()) {
            var first = str(String(new java.lang.String(Files.readAllBytes(keyFile.toPath()), "UTF-8")).split(/\r?\n/)[0]);
            if (first.length && first.indexOf("#") !== 0) {
              return first;
            }
          }
        } catch (_noKeyFile) {}
        return str(java.lang.System.getenv(KEY_ENV));
      },
      // The managed agent hosts send their conversation's viewer debug port in X-Convertigo-Viewer-Debug-Port; the
      // MCP router passes it as browserDebugPort. An explicit cdpEndpoint (loopback only) is the fallback.
      cdpEndpoint: function (params) {
        return api.normalizeCdpEndpoint(params.browserDebugPort, params.cdpEndpoint);
      },
      probe: function (endpoint) {
        try {
          var Http = java.net.http;
          var client = Http.HttpClient.newBuilder().connectTimeout(java.time.Duration.ofSeconds(3)).build();
          var request = Http.HttpRequest.newBuilder(java.net.URI.create(endpoint + "/json/version"))
            .timeout(java.time.Duration.ofSeconds(5)).GET().build();
          var response = client.send(request, Http.HttpResponse.BodyHandlers.ofString());
          return Number(response.statusCode()) === 200;
        } catch (_noBrowser) {
          return false;
        }
      },
      nodePath: function () {
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
      },
      // playwright-core comes with the Playwright MCP the Agent Bridge installs for each agent runtime.
      playwrightModule: function () {
        var runtimes = ["vibe", "codex", "claude"];
        for (var i = 0; i < runtimes.length; i++) {
          var dir = new File(new File(new File(new File(workspace, "agents"), runtimes[i]), "npm"), "node_modules/playwright-core");
          if (new File(dir, "package.json").isFile()) {
            return String(dir.getPath());
          }
        }
        throw new Error("Playwright is not installed in this Studio's agent runtimes (" + workspace.getPath() +
          "/agents/*/npm): start a Tigo conversation once so the Agent Bridge installs the Playwright MCP.");
      },
      scriptPath: function () {
        return String(new File(new File(projectDir(), "node"), "browser_verify_agent.cjs").getPath());
      },
      workspaceRoot: function () {
        return String(workspace.getPath());
      },
      newRun: function () {
        var stamp = new java.text.SimpleDateFormat("yyyyMMdd-HHmmss").format(new java.util.Date());
        var callId = "verify-" + stamp + "-" + String(java.util.UUID.randomUUID().toString()).substring(0, 8);
        var dir = new File(new File(new File(workspace, ".playwright-mcp"), "verify"), callId);
        dir.mkdirs();
        return { callId: callId, outDir: String(dir.getPath()) };
      },
      // One verification at a time per browser: two agents clicking in the same viewer would spoil both proofs. The lock
      // names the running verification; the agent deletes it when it exits, and it expires after the agent's budget.
      lock: function (endpoint, callId, timeBudgetMs) {
        var root = new File(new File(workspace, ".playwright-mcp"), "verify");
        root.mkdirs();
        var lockFile = new File(root, ".lock-" + String(endpoint).replace(/[^0-9A-Za-z]+/g, "_"));
        if (lockFile.isFile()) {
          var holder = {};
          try {
            holder = JSON.parse(String(new java.lang.String(Files.readAllBytes(lockFile.toPath()), "UTF-8")));
          } catch (_badLock) {}
          var holderRun = VERIFICATION_ID.test(str(holder.callId)) ? this.readRun(str(holder.callId)) : { exists: false };
          if (Number(holder.expiresAt || 0) < java.lang.System.currentTimeMillis() || !holderRun.exists || !holderRun.alive) {
            lockFile["delete"]();
          } else {
            throw new Error("Another verification (" + holder.callId + ") is running on this Studio browser: call " +
              "browser-verify with verificationId " + holder.callId + " to wait for its report.");
          }
        }
        var content = JSON.stringify({ callId: callId, expiresAt: java.lang.System.currentTimeMillis() + timeBudgetMs + LOCK_GRACE_MS });
        try {
          Files.write(lockFile.toPath(), new java.lang.String(content).getBytes("UTF-8"),
            java.nio.file.StandardOpenOption.CREATE_NEW, java.nio.file.StandardOpenOption.WRITE);
        } catch (_busy) {
          throw new Error("Another browser-verify call is starting on this Studio browser: wait for its report.");
        }
        return String(lockFile.getPath());
      },
      unlock: function (lockPath) {
        try {
          new File(String(lockPath))["delete"]();
        } catch (_ignoreUnlock) {}
      },
      // The agent runs on after this call returns: its output, log and process id stay in its run folder.
      start: function (command, env, stdinText, outDir) {
        var list = new java.util.ArrayList();
        for (var i = 0; i < command.length; i++) {
          list.add(String(command[i]));
        }
        var builder = new java.lang.ProcessBuilder(list);
        var environment = builder.environment();
        for (var name in env) {
          if (Object.prototype.hasOwnProperty.call(env, name)) {
            environment.put(String(name), String(env[name]));
          }
        }
        builder.directory(workspace);
        builder.redirectOutput(new File(outDir, "agent-output.json"));
        builder.redirectError(new File(outDir, "agent.log"));
        var process = builder.start();
        var run = JSON.stringify({ pid: Number(process.pid()), startedAt: java.lang.System.currentTimeMillis() });
        Files.write(new File(outDir, "run.json").toPath(), new java.lang.String(run).getBytes("UTF-8"));
        var stdin = process.getOutputStream();
        try {
          stdin.write(new java.lang.String(stdinText).getBytes("UTF-8"));
        } finally {
          stdin.close();
        }
      },
      readRun: function (callId) {
        var dir = new File(new File(new File(workspace, ".playwright-mcp"), "verify"), callId);
        var runFile = new File(dir, "run.json");
        if (!runFile.isFile()) {
          return { exists: false };
        }
        var run = {};
        try {
          run = JSON.parse(String(new java.lang.String(Files.readAllBytes(runFile.toPath()), "UTF-8")));
        } catch (_badRun) {}
        var outFile = new File(dir, "agent-output.json");
        var alive = false;
        try {
          var handle = java.lang.ProcessHandle.of(Number(run.pid || 0));
          alive = handle.isPresent() && handle.get().isAlive();
        } catch (_noHandle) {}
        var shots = [];
        var files = dir.listFiles();
        for (var i = 0; files !== null && i < files.length; i++) {
          if (/\.png$/.test(String(files[i].getName()))) {
            shots.push(String(files[i].getPath()));
          }
        }
        shots.sort();
        return {
          exists: true,
          outDir: String(dir.getPath()),
          output: outFile.isFile() ? String(new java.lang.String(Files.readAllBytes(outFile.toPath()), "UTF-8")) : "",
          alive: alive,
          startedAt: Number(run.startedAt || 0),
          screenshots: shots
        };
      },
      finishRun: function (_callId) {
        // The agent removes its lock itself; nothing else to release.
      },
      now: function () {
        return Number(java.lang.System.currentTimeMillis());
      },
      sleep: function (ms) {
        java.lang.Thread.sleep(ms);
      }
    };
  };

  // Private alone is not an HTTP authentication boundary in Eclipse Studio, and this tool spends gateway credits:
  // the full MCP bearer is checked again here, as image-describe does.
  api.execute = function (contextObject, params) {
    var auth = C8O.mcpAuth.authenticateRequest(contextObject);
    if (!auth.authenticated || auth.kind === "nocode" || auth.scope !== "mcp:full") {
      throw new Error("A full Convertigo MCP bearer token is required");
    }
    return api.run(params, api.javaHost(contextObject));
  };
})(C8O.browserVerify);
