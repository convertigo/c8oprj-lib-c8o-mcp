/*
 * subagent-run: the main agent hands a piece of work to a sub-agent (js/subagents.js) with a profile, a task, its inputs
 * and the report it wants back, and gets a short report; the sub-agent's context is thrown away. A call waits up to
 * waitSec; a longer run answers status "running" with its runId, and subagent-run({runId}) waits again.
 */
if (typeof C8O === "undefined") { var C8O = {}; }
C8O.subagentRun = C8O.subagentRun || {};

(function (api) {
  // The runners this version provides, by runner name.
  api.runners = function () {
    var runners = {};
    var verifier = C8O.browserVerify.runners();
    for (var name in verifier) {
      runners[name] = verifier[name];
    }
    if (C8O.constructorRunner && C8O.constructorRunner.runner) {
      runners["vibe-session"] = C8O.constructorRunner.runner;
    }
    return runners;
  };

  api.run = function (params, host) {
    params = params || {};
    if (!C8O.subagents.str(params.runId).length && !C8O.subagents.str(params.task).length) {
      throw new Error("task is required: what the sub-agent must do, in plain language, with what it needs to know.");
    }
    return C8O.subagents.run(params, host, api.runners(), {});
  };

  api.execute = function (contextObject, params) {
    var auth = C8O.mcpAuth.authenticateRequest(contextObject);
    if (!auth.authenticated || auth.kind === "nocode" || auth.scope !== "mcp:full") {
      throw new Error("A full Convertigo MCP bearer token is required");
    }
    return api.run(params, C8O.constructorRunner.extendHost(C8O.browserVerify.javaHost(), contextObject));
  };
})(C8O.subagentRun);
