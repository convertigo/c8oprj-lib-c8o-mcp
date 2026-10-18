/*
 * Tigo sub-agents: the main agent hands a large piece of work to a sub-agent with a fresh context, its own model, its own
 * tools and its own limits, and gets back a short report; the sub-agent's context is then thrown away. The main agent
 * keeps the specification, the plan, the decisions and the reports, not the clicks or the tree reads of each piece.
 *
 * One service, several profiles. A profile names its runner (how the sub-agent runs), its default model, whether it may
 * write the project, its default limits (model turns, time, gateway cost) and the shape of its report:
 * - verifier: functional and visual browser proofs, read-only. Runner "vision-browser": a vision model of the gateway
 *   drives the Studio viewer through Playwright over CDP in a Node child process (node/browser_verify_agent.cjs).
 * - constructor: builds sequences, pages and tests through the Convertigo MCP. Runner "vibe-session" (stage 2).
 * A workspace file agents/convertigo/subagent-profiles.json may change a profile's model and limits.
 *
 * Every run lives in <user workspace>/subagents/<runId>/: run.json (profile, model, task, process, limits),
 * activity.jsonl (one line per step), agent-output.json (the final JSON line), agent.log, report.json, screenshots.
 * A call waits up to waitSec for the report: runs outlast some agent hosts' tool call limit (Vibe stops a call made from
 * its code after about one minute), so a longer run answers status "running" with its runId, and the same tool called
 * with that runId waits again. The report carries the usage of all the run's model calls, counted once by the Agent
 * Bridge per model and per sub-agent. The gateway key stays server side: it reaches the runner through its environment.
 */
if (typeof C8O === "undefined") { var C8O = {}; }
C8O.subagents = C8O.subagents || {};

(function (api) {
  var GATEWAY_URL = "https://llm.convertigo.com/v1";
  var KEY_ENV = "CONVERTIGO_LLM_API_KEY";
  var DEFAULT_WAIT_SEC = 50;
  var MAX_WAIT_SEC = 280;
  var LOCK_GRACE_MS = 90 * 1000;
  var RUN_ID = /^(verify|build|sa)-\d{8}-\d{6}-[0-9a-f]{8}$/;
  var ACTIVITY_SHOWN = 6;

  api.GATEWAY_URL = GATEWAY_URL;
  api.RUN_ID = RUN_ID;

  // Defaults; agents/convertigo/subagent-profiles.json may override model and limits per profile.
  api.PROFILES = {
    verifier: {
      label: "Vérificateur",
      description: "Functional and visual browser proofs on the Studio viewer, with a vision model. Read-only.",
      runner: "vision-browser",
      model: "mistral/mistral-large-4",
      readOnly: true,
      idPrefix: "verify",
      limits: { maxSteps: 40, timeBudgetSec: 150, maxCostUsd: 0.5 },
      bounds: { maxSteps: [6, 80], timeBudgetSec: [30, 540], maxCostUsd: [0.02, 5] }
    },
    constructor: {
      label: "Constructeur",
      description: "Builds a lot (sequences, a page, tests) in the project through the Convertigo MCP. One at a time per project.",
      runner: "vibe-session",
      model: "glm-5-3",
      readOnly: false,
      idPrefix: "build",
      limits: { maxSteps: 120, timeBudgetSec: 900, maxCostUsd: 1.5 },
      bounds: { maxSteps: [10, 400], timeBudgetSec: [60, 3600], maxCostUsd: [0.05, 10] }
    }
  };

  function str(value) {
    return value == null ? "" : String(value).trim();
  }

  function numberIn(value, fallback, min, max, name, integer) {
    var text = str(value);
    if (!text.length) {
      return fallback;
    }
    var parsed = integer ? parseInt(text, 10) : Number(text);
    if (isNaN(parsed)) {
      throw new Error(name + " must be a number.");
    }
    return Math.max(min, Math.min(max, parsed));
  }

  api.str = str;

  // An object argument as a plain JS object: the MCP router passes it to the sequence as JSON text (a Java string in
  // Rhino, whose typeof is not "string").
  api.objectArg = function (value) {
    if (value === null || value === undefined) {
      return {};
    }
    if (Object.prototype.toString.call(value) === "[object Object]") {
      return value;
    }
    var text = str(value);
    if (text.charAt(0) === "{") {
      try {
        var parsed = JSON.parse(text);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch (_notJson) {}
    }
    return {};
  };
  api.numberIn = numberIn;

  api.normalizeWaitSec = function (value) {
    return numberIn(value, DEFAULT_WAIT_SEC, 5, MAX_WAIT_SEC, "waitSec", true);
  };

  // The profile with the workspace overrides, then the call's own model and limits within the profile bounds.
  api.resolveProfile = function (name, params, settings) {
    var key = str(name).toLowerCase() || "verifier";
    var base = api.PROFILES[key];
    if (!base) {
      throw new Error("Unknown profile " + name + ": use one of " + Object.keys(api.PROFILES).join(", ") + ".");
    }
    var override = (settings && settings.profiles && settings.profiles[key]) || {};
    var limits = {};
    ["maxSteps", "timeBudgetSec", "maxCostUsd"].forEach(function (limit) {
      var bounds = base.bounds[limit];
      var fallback = numberIn(override[limit], base.limits[limit], bounds[0], bounds[1], limit, limit !== "maxCostUsd");
      limits[limit] = numberIn(params && params[limit], fallback, bounds[0], bounds[1], limit, limit !== "maxCostUsd");
    });
    return {
      name: key,
      label: base.label,
      runner: base.runner,
      model: str(params && params.model) || str(override.model) || base.model,
      readOnly: base.readOnly,
      idPrefix: base.idPrefix,
      limits: limits
    };
  };

  // The last JSON line of the runner output, or null while the run goes on.
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

  api.relativePath = function (root, file) {
    var r = str(root).replace(/\\/g, "/").replace(/\/+$/, "");
    var f = str(file).replace(/\\/g, "/");
    if (r.length && f.indexOf(r + "/") === 0) {
      return f.substring(r.length + 1);
    }
    return f;
  };

  // The usage block the Agent Bridge sums per model and per sub-agent (counted once by runId).
  api.usageOf = function (usage, run, tool) {
    usage = usage || {};
    var cost = usage.cost === null || usage.cost === undefined || !isFinite(Number(usage.cost)) ? null : Number(usage.cost);
    return {
      tool: tool || "subagent-run",
      callId: str(usage.callId) || run.runId,
      runId: run.runId,
      profile: run.profile,
      model: str(usage.model) || run.model,
      requests: Number(usage.requests) || 0,
      inputTokens: Number(usage.inputTokens) || 0,
      cachedTokens: Number(usage.cachedTokens) || 0,
      outputTokens: Number(usage.outputTokens) || 0,
      reasoningTokens: Number(usage.reasoningTokens) || 0,
      totalTokens: Number(usage.totalTokens) || 0,
      cost: cost,
      // gateway: the cost the gateway charged; journal: the agent's estimate from its configured prices.
      costSource: cost === null ? "" : (usage.costSource === "journal" ? "journal" : "gateway"),
      currency: cost === null ? "" : "USD",
      durationMs: Number(usage.durationMs) || 0
    };
  };

  function activityOf(run) {
    var lines = run.activity || [];
    return lines.slice(Math.max(0, lines.length - ACTIVITY_SHOWN));
  }

  // Waits up to waitSec for the run's report. toResult(output, run, root) shapes a finished run's answer.
  api.collect = function (runId, waitSec, host, runners) {
    var run = host.readRun(runId);
    if (!run.exists) {
      throw new Error("Unknown runId " + runId + ": start a sub-agent with a profile and a task first.");
    }
    var deadline = host.now() + waitSec * 1000;
    var runner = runners[run.runner];
    while (true) {
      var output = api.parseOutput(run.output);
      if (output !== null) {
        if (output.ok !== true) {
          throw new Error("The " + run.profile + " sub-agent failed: " + str(output.error));
        }
        output.reportFile = run.outDir + "/report.json";
        return runner.toResult(output, run, host.workspaceRoot());
      }
      if (!run.alive) {
        throw new Error("The " + run.profile + " sub-agent ended without a report; its log is in " +
          api.relativePath(host.workspaceRoot(), run.outDir) + "/agent.log.");
      }
      if (host.now() >= deadline) {
        return {
          status: "running",
          runId: runId,
          profile: run.profile,
          model: run.model,
          task: run.task,
          elapsedMs: Math.max(0, host.now() - run.startedAt),
          activity: activityOf(run),
          message: "The sub-agent is still working. Call the same tool again with this runId alone to wait for its report; " +
            "do not start another sub-agent on the same browser or project meanwhile."
        };
      }
      host.sleep(1000);
      run = host.readRun(runId);
    }
  };

  // runner: { prepare(params, profile, ctx, host) -> {command[], env, stdin, lockKey, task, extra}, toResult(output, run,
  // root) }. host: readKey(), readSettings(), newRun(prefix) -> {runId, outDir}, lock(key, runId, budgetMs) -> lockFile,
  // unlock(file), start(command[], env, stdinText, outDir, meta), readRun(runId), workspaceRoot(), now(), sleep(ms).
  api.run = function (params, host, runners, options) {
    params = params || {};
    options = options || {};
    var waitSec = api.normalizeWaitSec(params.waitSec);
    var resume = str(params.runId);
    if (resume.length) {
      if (!RUN_ID.test(resume)) {
        throw new Error("runId must be the id a previous call returned.");
      }
      return api.collect(resume, waitSec, host, runners);
    }
    var profile = api.resolveProfile(options.profile || params.profile, params, host.readSettings());
    var runner = runners[profile.runner];
    if (!runner) {
      throw new Error("The " + profile.name + " profile is not available in this version of the Convertigo MCP.");
    }
    var key = str(host.readKey());
    if (!key.length) {
      throw new Error("No Convertigo agent key in this Studio: set it from the Tigo assistant (the same key the agent uses), " +
        "or define " + KEY_ENV + " for the Studio process.");
    }
    var prepared = runner.prepare(params, profile, { gatewayUrl: GATEWAY_URL }, host);
    var run = host.newRun(profile.idPrefix);
    var config = prepared.config;
    config.outDir = run.outDir;
    config.callId = run.runId;
    config.profile = profile.name;
    config.usageTool = options.usageTool || "subagent-run";
    // The runner removes the lock when it exits; a lock older than its budget is stale.
    config.lockFile = host.lock(prepared.lockKey, run.runId, profile.limits.timeBudgetSec * 1000);
    var env = {};
    env[KEY_ENV] = key;
    for (var name in prepared.env || {}) {
      env[name] = prepared.env[name];
    }
    try {
      host.start(prepared.command, env, JSON.stringify(config), run.outDir, {
        runId: run.runId,
        profile: profile.name,
        runner: profile.runner,
        model: profile.model,
        task: str(prepared.task).substring(0, 500),
        limits: profile.limits,
        conversationId: str(params.conversationId),
        lockFile: config.lockFile
      });
    } catch (e) {
      host.unlock(config.lockFile);
      throw e;
    }
    return api.collect(run.runId, waitSec, host, runners);
  };

  // The tools that write a project. While a constructor builds a project, the MCP router refuses their calls on that
  // project from anyone but the constructor's own session (header X-Convertigo-Subagent-Run).
  api.WRITE_SEQUENCES = {
    tools_databaseobject_tree_apply: true, tools_databaseobject_delete: true, tools_databaseobject_move: true,
    tools_databaseobject_rename: true, tools_batch_call: true, tools_project_save: true, tools_project_reload: true,
    tools_project_js_set: true, tools_upsert_crud: true, tools_upsert_ngx_crud_kit: true, tools_sql_transaction_create: true,
    tools_business_sequence_create: true, tools_facade_create: true, tools_ngx_page_create: true, tools_marketplace_import: true, tools_requestable_stub_set: true,
    tools_scheduler_apply: true
  };

  function projectOfArguments(args) {
    args = args || {};
    var named = str(args.project || args.targetProject || args.projectName);
    if (named.length) {
      return named;
    }
    var spec = args.spec;
    if (typeof spec === "string" && str(spec).charAt(0) === "{") {
      try { spec = JSON.parse(spec); } catch (_notJson) { spec = null; }
    }
    if (spec && typeof spec === "object" && str(spec.project).length) {
      return str(spec.project);
    }
    var qname = str(args.target || args.qname || args.parentQName || args.source || args.requestable);
    return qname.length ? qname.split(".")[0] : "";
  }

  // The projects a tool call writes: its own arguments, or each call of a batch.
  api.projectsOfCall = function (sequence, args) {
    if (api.WRITE_SEQUENCES[sequence] !== true) {
      return [];
    }
    var projects = [];
    var add = function (p) {
      if (p.length && projects.indexOf(p) < 0) {
        projects.push(p);
      }
    };
    if (sequence === "tools_batch_call") {
      var calls = args && args.calls;
      if (typeof calls === "string" && str(calls).charAt(0) === "[") {
        try { calls = JSON.parse(calls); } catch (_notJson) { calls = []; }
      }
      (Array.isArray(calls) ? calls : []).forEach(function (call) {
        var nested = call && call.arguments;
        if (typeof nested === "string" && str(nested).charAt(0) === "{") {
          try { nested = JSON.parse(nested); } catch (_notJsonArgs) { nested = {}; }
        }
        add(projectOfArguments(nested));
      });
      add(projectOfArguments(args));
      return projects;
    }
    add(projectOfArguments(args));
    return projects;
  };

  // A constructor holding the project's lock, unless the call comes from that constructor: {runId, message} or null.
  api.projectWriteBlocked = function (project, runHeader, host) {
    var holder = host.readLock("project:" + project);
    if (!holder || !RUN_ID.test(str(holder.runId)) || Number(holder.expiresAt || 0) < host.now()) {
      return null;
    }
    if (str(runHeader) === str(holder.runId)) {
      return null;
    }
    var run = host.readRun(str(holder.runId));
    if (!run.exists || !run.alive) {
      return null;
    }
    return {
      runId: holder.runId,
      message: "A constructor sub-agent (" + holder.runId + ") is building project " + project + ": wait for its report " +
        "(subagent-run with runId " + holder.runId + ") before writing to this project."
    };
  };

  // The Studio side of the host: run folders, process start and state, locks, settings and the gateway key.
  api.javaHost = function () {
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    var File = java.io.File;
    var Files = java.nio.file.Files;
    var workspace = new File(String(Engine.USER_WORKSPACE_PATH)).getCanonicalFile();
    var runsRoot = new File(workspace, "subagents");

    function readText(file) {
      return String(new java.lang.String(Files.readAllBytes(file.toPath()), "UTF-8"));
    }

    function writeText(file, text) {
      Files.write(file.toPath(), new java.lang.String(text).getBytes("UTF-8"));
    }

    var host = {
      readKey: function () {
        try {
          var keyFile = new File(new File(new File(workspace, "agents"), "convertigo"), "llm-api-key");
          if (keyFile.isFile()) {
            var first = str(readText(keyFile).split(/\r?\n/)[0]);
            if (first.length && first.indexOf("#") !== 0) {
              return first;
            }
          }
        } catch (_noKeyFile) {}
        return str(java.lang.System.getenv(KEY_ENV));
      },
      readSettings: function () {
        try {
          var file = new File(new File(new File(workspace, "agents"), "convertigo"), "subagent-profiles.json");
          return file.isFile() ? JSON.parse(readText(file)) : {};
        } catch (_badSettings) {
          return {};
        }
      },
      workspaceRoot: function () {
        return String(workspace.getPath());
      },
      newRun: function (prefix) {
        var stamp = new java.text.SimpleDateFormat("yyyyMMdd-HHmmss").format(new java.util.Date());
        var runId = (prefix || "sa") + "-" + stamp + "-" + String(java.util.UUID.randomUUID().toString()).substring(0, 8);
        var dir = new File(runsRoot, runId);
        dir.mkdirs();
        return { runId: runId, outDir: String(dir.getPath()) };
      },
      // One run at a time per lock key (the browser of a verifier, the project of a constructor). The lock names the
      // running sub-agent; the runner deletes it when it exits, and it expires after the run's budget.
      lock: function (lockKey, runId, timeBudgetMs) {
        runsRoot.mkdirs();
        var lockFile = new File(runsRoot, ".lock-" + String(lockKey).replace(/[^0-9A-Za-z]+/g, "_"));
        if (lockFile.isFile()) {
          var holder = {};
          try {
            holder = JSON.parse(readText(lockFile));
          } catch (_badLock) {}
          var holderRun = RUN_ID.test(str(holder.runId)) ? host.readRun(str(holder.runId)) : { exists: false };
          if (Number(holder.expiresAt || 0) < java.lang.System.currentTimeMillis() || !holderRun.exists || !holderRun.alive) {
            lockFile["delete"]();
          } else {
            throw new Error("Another sub-agent (" + holder.runId + ") is working on " + lockKey + ": call the tool with runId " +
              holder.runId + " to wait for its report.");
          }
        }
        var content = JSON.stringify({ runId: runId, expiresAt: java.lang.System.currentTimeMillis() + timeBudgetMs + LOCK_GRACE_MS });
        try {
          Files.write(lockFile.toPath(), new java.lang.String(content).getBytes("UTF-8"),
            java.nio.file.StandardOpenOption.CREATE_NEW, java.nio.file.StandardOpenOption.WRITE);
        } catch (_busy) {
          throw new Error("Another sub-agent is starting on " + lockKey + ": wait for its report.");
        }
        return String(lockFile.getPath());
      },
      readLock: function (lockKey) {
        var lockFile = new File(runsRoot, ".lock-" + String(lockKey).replace(/[^0-9A-Za-z]+/g, "_"));
        try {
          return lockFile.isFile() ? JSON.parse(readText(lockFile)) : null;
        } catch (_badLock) {
          return null;
        }
      },
      unlock: function (lockPath) {
        try {
          new File(String(lockPath))["delete"]();
        } catch (_ignoreUnlock) {}
      },
      // The runner process goes on after this call returns: its output, log, activity and process id stay in its folder.
      start: function (command, env, stdinText, outDir, meta) {
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
        meta.pid = Number(process.pid());
        meta.startedAt = Number(java.lang.System.currentTimeMillis());
        writeText(new File(outDir, "run.json"), JSON.stringify(meta));
        var stdin = process.getOutputStream();
        try {
          stdin.write(new java.lang.String(stdinText).getBytes("UTF-8"));
        } finally {
          stdin.close();
        }
      },
      readRun: function (runId) {
        var dir = new File(runsRoot, runId);
        var runFile = new File(dir, "run.json");
        if (!runFile.isFile()) {
          return { exists: false };
        }
        var meta = {};
        try {
          meta = JSON.parse(readText(runFile));
        } catch (_badRun) {}
        var alive = false;
        try {
          var handle = java.lang.ProcessHandle.of(Number(meta.pid || 0));
          alive = handle.isPresent() && handle.get().isAlive();
        } catch (_noHandle) {}
        var outFile = new File(dir, "agent-output.json");
        var activity = [];
        var activityFile = new File(dir, "activity.jsonl");
        if (activityFile.isFile()) {
          var lines = readText(activityFile).split(/\r?\n/);
          for (var i = Math.max(0, lines.length - 40); i < lines.length; i++) {
            try {
              if (str(lines[i]).length) {
                activity.push(JSON.parse(lines[i]));
              }
            } catch (_partialLine) {}
          }
        }
        var shots = [];
        var files = dir.listFiles();
        for (var f = 0; files !== null && f < files.length; f++) {
          if (/\.png$/.test(String(files[f].getName()))) {
            shots.push(String(files[f].getPath()));
          }
        }
        shots.sort();
        return {
          exists: true,
          runId: runId,
          outDir: String(dir.getPath()),
          profile: str(meta.profile),
          runner: str(meta.runner),
          model: str(meta.model),
          task: str(meta.task),
          limits: meta.limits || {},
          output: outFile.isFile() ? readText(outFile) : "",
          alive: alive,
          startedAt: Number(meta.startedAt || 0),
          activity: activity,
          screenshots: shots
        };
      },
      now: function () {
        return Number(java.lang.System.currentTimeMillis());
      },
      sleep: function (ms) {
        java.lang.Thread.sleep(ms);
      }
    };
    return host;
  };
})(C8O.subagents);
