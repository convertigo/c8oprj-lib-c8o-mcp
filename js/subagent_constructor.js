/*
 * The constructor sub-agent (profile "constructor" of js/subagents.js, runner "vibe-session"): a Mistral Vibe
 * programmatic session (node/vibe_subagent_runner.cjs runs `vibe -p`) builds one lot in one project through the
 * Convertigo MCP, with a fresh context, the profile's model (default glm-5-3) and Vibe's own limits on turns, price and
 * time. It works with the caller's MCP bearer, in a Vibe home of its own built from the conversation's Tigo home.
 *
 * One constructor at a time per project: the run holds the lock "project:<name>", and while it runs the MCP router
 * refuses the writes of anyone else to that project (see projectWriteBlocked). The report lists the objects created and
 * modified (QNames), the checks run, the open issues and the project files written during the run.
 */
if (typeof C8O === "undefined") { var C8O = {}; }
C8O.constructorRunner = C8O.constructorRunner || {};

(function (api) {
  function str(value) {
    return value == null ? "" : String(value).trim();
  }

  // The tools a constructor never calls: no sub-agent of its own, no browser proof.
  api.DISABLED_TOOLS = ["Convertigo_subagent-run", "Convertigo_browser-verify", "Convertigo_project-delete"];

  function inputsOf(params) {
    return C8O.subagents.objectArg(params.inputs);
  }

  api.runner = {
    prepare: function (params, profile, ctx, host) {
      var inputs = inputsOf(params);
      var project = str(inputs.project || params.project);
      if (!project.length) {
        throw new Error("The constructor needs inputs.project: the one project it builds in.");
      }
      var projectDir = host.projectDir(project);
      if (!projectDir) {
        throw new Error("Project " + project + " is not loaded in this Studio.");
      }
      var bearer = host.callerBearer();
      if (!bearer.length) {
        throw new Error("The constructor works with the caller's MCP bearer, and this call has none.");
      }
      var template = host.vibeTemplate(str(params.conversationId));
      var env = {};
      env[template.mcpTokenEnv] = bearer;
      return {
        command: [host.nodePath(), host.runnerScript()],
        env: env,
        lockKey: "project:" + project,
        task: str(params.task),
        config: {
          vibeBin: host.vibeBin(),
          templateHome: template.home,
          workdir: projectDir,
          projectDir: projectDir,
          project: project,
          model: profile.model,
          task: str(params.task),
          inputs: inputs,
          reportFormat: str(params.reportFormat),
          maxSteps: profile.limits.maxSteps,
          timeBudgetMs: profile.limits.timeBudgetSec * 1000,
          maxCostUsd: profile.limits.maxCostUsd,
          disabledTools: api.DISABLED_TOOLS
        }
      };
    },
    toResult: function (output, run, root) {
      var report = output.report || {};
      return {
        status: "finished",
        runId: run.runId,
        profile: run.profile,
        model: run.model,
        task: run.task,
        report: {
          verdict: str(report.verdict) || "partial",
          summary: str(report.summary),
          created: report.created || [],
          modified: report.modified || [],
          checks: report.checks || [],
          openIssues: report.openIssues || [],
          changedFiles: report.changedFiles || []
        },
        reportFile: C8O.subagents.relativePath(root, output.reportFile),
        stopReason: str(output.stopReason),
        modelCalls: Number(output.usage && output.usage.requests) || 0,
        actions: Number(output.toolCalls) || 0,
        durationMs: Number(output.durationMs) || 0,
        usage: C8O.subagents.usageOf(output.usage, run, output.usage && output.usage.tool)
      };
    }
  };

  // The constructor's part of the Studio host: the project folder, the caller's bearer, the Vibe binary and the Tigo
  // home the child home is built from (the conversation's own, else the user's).
  api.extendHost = function (host, contextObject) {
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    var File = java.io.File;
    var Files = java.nio.file.Files;
    var workspace = new File(String(Engine.USER_WORKSPACE_PATH)).getCanonicalFile();
    var windows = String(java.lang.System.getProperty("os.name")).toLowerCase().indexOf("win") >= 0;
    var read = function (file) { return String(new java.lang.String(Files.readAllBytes(file.toPath()), "UTF-8")); };

    host.projectDir = function (project) {
      try {
        var p = Engine.theApp.databaseObjectsManager.getOriginalProjectByName(project);
        return p ? String(p.getDirPath()) : "";
      } catch (_noProject) {
        return "";
      }
    };
    host.callerBearer = function () {
      try {
        var header = str(contextObject.httpServletRequest.getHeader("Authorization"));
        var match = /^Bearer\s+(.+)$/i.exec(header);
        return match ? str(match[1]) : "";
      } catch (_noRequest) {
        return "";
      }
    };
    host.vibeBin = function () {
      var bin = windows
        ? new File(new File(new File(new File(new File(workspace, "agents"), "vibe"), ".venv"), "Scripts"), "vibe.exe")
        : new File(new File(new File(new File(new File(workspace, "agents"), "vibe"), ".venv"), "bin"), "vibe");
      if (!bin.isFile()) {
        throw new Error("Mistral Vibe is not installed in this Studio (" + bin.getPath() + "): start a Tigo conversation with Vibe once.");
      }
      return String(bin.getPath());
    };
    host.runnerScript = function () {
      var project = Engine.theApp.databaseObjectsManager.getOriginalProjectByName("lib_ConvertigoMCP");
      return String(new File(new File(new File(String(project.getDirPath())), "node"), "vibe_subagent_runner.cjs").getPath());
    };
    // The conversation's Vibe home names it in X-Convertigo-Conversation-Id; without one, the most recent user home.
    host.vibeTemplate = function (conversationId) {
      var homes = new File(new File(new File(workspace, "agents"), "vibe"), "homes-convertigo");
      var users = new File(homes, "users").listFiles();
      var best = null, bestTime = -1, owned = null;
      for (var u = 0; users !== null && u < users.length; u++) {
        var userHome = new File(users[u], ".vibe-home");
        if (new File(userHome, "config.toml").isFile() && userHome.lastModified() > bestTime) {
          best = userHome;
          bestTime = userHome.lastModified();
        }
        var conversations = new File(users[u], "conversations").listFiles();
        for (var c = 0; conversationId.length && owned === null && conversations !== null && c < conversations.length; c++) {
          var config = new File(new File(conversations[c], ".vibe-home"), "config.toml");
          if (config.isFile() && read(config).indexOf('"' + conversationId + '"') >= 0) {
            owned = config.getParentFile();
          }
        }
      }
      var home = owned || best;
      if (home === null) {
        throw new Error("No Tigo Vibe home in this Studio to build the constructor's home from: start a Tigo conversation with Vibe once.");
      }
      var text = read(new File(home, "config.toml"));
      var env = /api_key_env\s*=\s*"([^"]+)"/.exec(text.substring(Math.max(0, text.indexOf('name = "Convertigo"'))));
      return { home: String(home.getPath()), mcpTokenEnv: env ? env[1] : "CONVERTIGO_MCP_TOKEN" };
    };
    return host;
  };
})(C8O.constructorRunner);
