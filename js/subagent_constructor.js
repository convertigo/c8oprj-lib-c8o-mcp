// Shared storage contract across Tigo projects. Resolved only on the engine.
if (typeof C8O === "undefined") { var C8O = {}; }
if (typeof C8O.tigoAgentsDirectory !== "function") {
  C8O.tigoAgentsDirectory = function (workspaceRoot, FileClass) {
    var F = FileClass || Packages.java.io.File;
    var configured = "";
    try {
      var value = Packages.com.twinsoft.convertigo.engine.Engine.theApp.databaseObjectsManager.symbolsGetValue("assistant.agents.directory");
      configured = value == null ? "" : String(value).replace(/^\s+|\s+$/g, "");
    } catch (_noAgentsDirectorySymbol) {}
    if (!configured.length) { return new F(workspaceRoot, "agents"); }
    if (configured.indexOf("\u0000") !== -1) { throw new Error("Invalid assistant.agents.directory"); }
    var directory = new F(configured);
    if (!directory.isAbsolute()) { throw new Error("assistant.agents.directory must be an absolute path"); }
    if (directory.getParentFile() === null) { throw new Error("assistant.agents.directory must be a dedicated directory, not a filesystem root"); }
    return directory;
  };
}
// End shared storage contract.

/*
 * The constructor sub-agent (profile "constructor" of js/subagents.js, runner "vibe-session"): a Mistral Vibe
 * programmatic session (node/vibe_subagent_runner.cjs runs `vibe -p`) builds one lot in one project through the
 * Convertigo MCP, with a fresh context, the profile's model (default glm-5-3) and Vibe's own limits on turns, price and
 * time. It works with the caller's MCP bearer, in a Vibe home of its own built from the conversation's Tigo home.
 *
 * One constructor at a time per project: the run holds the lock "project:<name>", and while it runs the MCP router
 * refuses the writes of anyone else to that project (see projectWriteBlocked). The report lists the objects created and
 * modified (QNames), the checks run, the open issues and the project files written during the run.
 *
 * inputs.pack "flow" (set by the relay of the convertigo-flow server, never chosen by the model there) runs the session
 * with the convertigo-flow server alone, the same token and headers, on one side of the project (inputs.scope backend
 * or frontend): one constructor per side, so the two sides of a parallel build run at the same time. Its lock is
 * "flow:<project>:<scope>", and its session sends X-Convertigo-Subagent-Scope, by which that server refuses its writes
 * to the other side.
 */
if (typeof C8O === "undefined") { var C8O = {}; }
C8O.constructorRunner = C8O.constructorRunner || {};

(function (api) {
  function str(value) {
    return value == null ? "" : String(value).trim();
  }

  // The tools a constructor never calls: no sub-agent of its own, no browser proof.
  api.DISABLED_TOOLS = ["Convertigo_subagent-run", "Convertigo_browser-verify", "Convertigo_project-delete"];

  // The pack whose server the session of inputs.pack "flow" keeps, the sides it may own, and the tools it never calls:
  // the main agent's (sub-agents, browser proofs, save, project creation and removal, imports, schedules, reports),
  // the shell and the file writers (its sources go through the server's tools), and the other side's own tools.
  api.FLOW_SERVER = "convertigo-flow";
  api.FLOW_SCOPES = ["backend", "frontend"];
  api.FLOW_DISABLED_TOOLS = ["subagent-run", "browser-verify", "report-create", "project-save", "flow-project-bootstrap",
    "flow-project-remove", "marketplace-import", "scheduler-apply"].map(function (tool) { return api.FLOW_SERVER + "_" + tool; })
    .concat(["bash", "git_bash", "powershell", "write_file", "edit", "task"]);
  api.FLOW_SCOPE_DISABLED_TOOLS = {
    backend: [api.FLOW_SERVER + "_frontend-svelte-*"],
    frontend: ["flow-block-mock", "flow-schema-reset", "flow-sync-inputs", "flow-object-remove", "flow-fullsync-scaffold"]
      .map(function (tool) { return api.FLOW_SERVER + "_" + tool; })
  };

  function inputsOf(params) {
    return C8O.subagents.objectArg(params.inputs);
  }

  // The pack of a constructor call: null for the Convertigo MCP, else {pack, scope, server}.
  api.packOf = function (inputs) {
    inputs = inputs || {};
    var pack = str(inputs.pack).toLowerCase();
    if (!pack.length || pack === "convertigo") {
      return null;
    }
    if (pack !== "flow") {
      throw new Error("Unknown pack " + str(inputs.pack) + ": a constructor builds with the Convertigo MCP (no pack) or with pack flow.");
    }
    var scope = str(inputs.scope).toLowerCase();
    if (api.FLOW_SCOPES.indexOf(scope) < 0) {
      throw new Error("A constructor of pack flow needs inputs.scope " + api.FLOW_SCOPES.join(" or ") + ": the side of the project it owns.");
    }
    return { pack: "flow", scope: scope, server: api.FLOW_SERVER };
  };

  // Does a Vibe config.toml declare this MCP server ([[mcp_servers]] name = "<server>")?
  api.declaresServer = function (text, server) {
    var name = str(server).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("^\\s*name\\s*=\\s*[\"']" + name + "[\"']\\s*$", "m").test(String(text || ""));
  };

  // The environment variable of the bearer of that server in a Vibe config.toml (its static auth), by default
  // CONVERTIGO_MCP_TOKEN.
  api.mcpTokenEnvOf = function (text, server) {
    text = String(text || "");
    var name = str(server).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var at = text.search(new RegExp("^\\s*name\\s*=\\s*[\"']" + name + "[\"']", "m"));
    var env = /api_key_env\s*=\s*"([^"]+)"/.exec(text.substring(Math.max(0, at)));
    return env ? env[1] : "CONVERTIGO_MCP_TOKEN";
  };

  // Full author tokens on a local Studio have the owner's existing authoring rights.
  // No Code credentials and server runtimes never receive this exception.
  api.isStudioOwner = function (auth, studioMode) {
    return studioMode === true && !!auth && auth.authenticated === true &&
      auth.scope === "mcp:full" && (auth.kind === "managed" || auth.kind === "durable");
  };

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
      var pack = api.packOf(inputs);
      var template = host.vibeTemplate(str(params.conversationId), pack ? pack.server : "Convertigo");
      var env = {};
      env[template.mcpTokenEnv] = bearer;
      return {
        command: [host.nodePath(), host.runnerScript()],
        env: env,
        lockKey: pack ? "flow:" + project + ":" + pack.scope : "project:" + project,
        task: str(params.task),
        meta: pack ? { pack: pack.pack, scope: pack.scope } : {},
        config: {
          vibeBin: host.vibeBin(),
          executionScope: host.executionScope ? host.executionScope() : "shared",
          sandboxHelper: host.sandboxHelper ? host.sandboxHelper() : "",
          sandboxPythonPath: host.sandboxPythonPath ? host.sandboxPythonPath() : "",
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
          server: pack ? pack.server : "Convertigo",
          pack: pack ? pack.pack : "",
          scope: pack ? pack.scope : "",
          disabledTools: pack ? api.FLOW_DISABLED_TOOLS.concat(api.FLOW_SCOPE_DISABLED_TOOLS[pack.scope]) : api.DISABLED_TOOLS
        }
      };
    },
    toResult: function (output, run, root) {
      var report = output.report || {};
      var result = {
        execution: output.execution || null,
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
      if (str(run.scope).length) {
        result.report.pack = str(run.pack);
        result.report.scope = str(run.scope);
      }
      return result;
    }
  };

  // The constructor's part of the Studio host: the project folder, the caller's bearer, the Vibe binary and the Tigo
  // home the child home is built from (the conversation's own, else the user's).
  api.extendHost = function (host, contextObject, authenticatedCaller) {
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    var File = java.io.File;
    var Files = java.nio.file.Files;
    var workspace = new File(String(Engine.USER_WORKSPACE_PATH)).getCanonicalFile();
    var windows = String(java.lang.System.getProperty("os.name")).toLowerCase().indexOf("win") >= 0;
    var read = function (file) { return String(new java.lang.String(Files.readAllBytes(file.toPath()), "UTF-8")); };

    // The owner of a desktop Studio: the Eclipse Studio (Studio mode) or the Electron Studio (Engine.isDesktopStudio,
    // Convertigo 8.5; an older engine has no such method). A server never has one.
    host.executionScope = function () {
      var studio = false;
      try { studio = Engine.isStudioMode() === true; } catch (_noStudioMode) {}
      if (!studio) {
        try { studio = Engine.isDesktopStudio() === true; } catch (_noDesktopStudio) {}
      }
      return api.isStudioOwner(authenticatedCaller, studio) ? "studio-owner" : "shared";
    };
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
        ? new File(new File(new File(new File(C8O.tigoAgentsDirectory(workspace, File), "vibe"), ".venv"), "Scripts"), "vibe.exe")
        : new File(new File(new File(new File(C8O.tigoAgentsDirectory(workspace, File), "vibe"), ".venv"), "bin"), "vibe");
      if (!bin.isFile()) {
        throw new Error("Mistral Vibe is not installed in this Studio (" + bin.getPath() + "): start a Tigo conversation with Vibe once.");
      }
      return String(bin.getPath());
    };
    // Resolve only server-owned paths, never a tool parameter or a profile input.
    host.sandboxHelper = function () {
      var configured = str(java.lang.System.getProperty("convertigo.agent.sandbox.helper"));
      if (configured.length) return configured;
      var arch = String(java.lang.System.getProperty("os.arch")).toLowerCase();
      var target = /^(aarch64|arm64)$/.test(arch) ? "linux-arm64" : "linux-amd64";
      var bridge = Engine.theApp.databaseObjectsManager.getOriginalProjectByName("lib_ConvertigoAgentBridge");
      var shipped = bridge ? new File(String(bridge.getDirPath()), "sandbox/" + target + "/c8o-agent-sandbox") : null;
      if (shipped !== null && shipped.isFile()) {
        if (!shipped.canExecute()) shipped.setExecutable(true, true);
        return String(shipped.getCanonicalPath());
      }
      return "/usr/local/bin/c8o-agent-sandbox";
    };
    host.sandboxPythonPath = function () {
      var bridge = Engine.theApp.databaseObjectsManager.getOriginalProjectByName("lib_ConvertigoAgentBridge");
      var folder = bridge ? new File(String(bridge.getDirPath()), "sandbox/python") : null;
      return folder !== null && new File(folder, "sitecustomize.py").isFile() ? String(folder.getCanonicalPath()) : "";
    };
    host.runnerScript = function () {
      var project = Engine.theApp.databaseObjectsManager.getOriginalProjectByName("lib_ConvertigoMCP");
      return String(new File(new File(new File(String(project.getDirPath())), "node"), "vibe_subagent_runner.cjs").getPath());
    };
    // The conversation's Vibe home names it in X-Convertigo-Conversation-Id; without one, the most recent user home.
    // The home must declare the MCP server the session keeps (Convertigo, or the server of the call's pack).
    host.vibeTemplate = function (conversationId, server) {
      server = str(server) || "Convertigo";
      var homes = new File(new File(C8O.tigoAgentsDirectory(workspace, File), "vibe"), "homes-convertigo");
      var users = new File(homes, "users").listFiles();
      var best = null, bestTime = -1, owned = null;
      var declares = function (config) { return server === "Convertigo" || api.declaresServer(read(config), server); };
      for (var u = 0; users !== null && u < users.length; u++) {
        var userHome = new File(users[u], ".vibe-home");
        var userConfig = new File(userHome, "config.toml");
        if (userConfig.isFile() && userHome.lastModified() > bestTime && declares(userConfig)) {
          best = userHome;
          bestTime = userHome.lastModified();
        }
        var conversations = new File(users[u], "conversations").listFiles();
        for (var c = 0; conversationId.length && owned === null && conversations !== null && c < conversations.length; c++) {
          var config = new File(new File(conversations[c], ".vibe-home"), "config.toml");
          if (config.isFile() && read(config).indexOf('"' + conversationId + '"') >= 0 && declares(config)) {
            owned = config.getParentFile();
          }
        }
      }
      var home = owned || best;
      if (home === null) {
        throw new Error(server === "Convertigo"
          ? "No Tigo Vibe home in this Studio to build the constructor's home from: start a Tigo conversation with Vibe once."
          : "No Tigo Vibe home with the " + server + " server in this Studio to build the constructor's home from: start a Tigo conversation with Vibe on such a project once.");
      }
      return { home: String(home.getPath()), mcpTokenEnv: api.mcpTokenEnvOf(read(new File(home, "config.toml")), server) };
    };
    return host;
  };
})(C8O.constructorRunner);
