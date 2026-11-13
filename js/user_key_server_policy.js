// A server whose C8Oforms gives each No Code user a Tigo gateway key of their own (piece A4,
// convertigo/c8oprj-tigoaccess#1): every agent there must run confined, with its user's key in its environment only,
// and the Agent Bridge refuses any other one (agent_isolation_unavailable), whatever its profile. The MCP tools that
// start an agent of their own (subagent-run and browser-verify: a vision browser runner, a Vibe constructor session)
// start it outside the Bridge, unconfined or with the workspace key file, so they get the same refusal on such a server,
// whatever the bearer (WEB_ADMIN included): they leave the catalog, a call is refused, and the runner refuses to start.
// Detection as the Bridge's serverUsesUserGatewayKeys: not the Studio, and C8Oforms has APIV2_TigoUserKey with
// C8Oforms.tigo.server.id set, or the Bridge or this policy saw it since the engine started (sticky: removing the symbol
// does not bring the shared key back while the engine runs).
if (typeof C8O === "undefined") { var C8O = {}; }
C8O.userKeyServerPolicy = {
  AGENT_TOOLS: ["tools_subagent_run", "tools_browser_verify"],
  CODE: "agent_isolation_unavailable",
  SEEN: "lib_ConvertigoAgentBridge.userGatewayKeysSeen",
  store: function (contextObject) {
    try {
      if (contextObject && contextObject.server) { return contextObject.server; }
    } catch (_noContextObjectServer) {}
    try {
      if (typeof context !== "undefined" && context && context.server) { return context.server; }
    } catch (_noContextServer) {}
    // as the Bridge's getServerStore
    try {
      if (typeof server !== "undefined" && server) { return server; }
    } catch (_noServer) {}
    return null;
  },
  studio: function () {
    try {
      return Packages.com.twinsoft.convertigo.engine.Engine.isStudioMode() == true;
    } catch (_noEngineMode) {
      return false;
    }
  },
  configured: function () {
    try {
      var manager = Packages.com.twinsoft.convertigo.engine.Engine.theApp.databaseObjectsManager;
      var project = manager.getOriginalProjectByName("C8Oforms");
      if (project == null || project.getSequenceByName("APIV2_TigoUserKey") == null) { return false; }
      var server = manager.symbolsGetValue("C8Oforms.tigo.server.id");
      return server != null && String(server).replace(/^\s+|\s+$/g, "").length > 0;
    } catch (_notConfigured) {
      // getSequenceByName throws for a missing sequence
      return false;
    }
  },
  active: function (contextObject) {
    if (this.studio()) { return false; }
    var store = this.store(contextObject);
    if (this.configured()) {
      try { if (store) { store.set(this.SEEN, "true"); } } catch (_ignoreSeenWrite) {}
      return true;
    }
    try {
      var seen = store ? store.get(this.SEEN) : null;
      return seen != null && String(seen) === "true";
    } catch (_ignoreSeenRead) {
      return false;
    }
  },
  startsAgent: function (sequence) {
    return this.AGENT_TOOLS.indexOf(String(sequence)) !== -1;
  },
  allows: function (sequence, contextObject) {
    return !this.startsAgent(sequence) || !this.active(contextObject);
  },
  refusal: function (sequence) {
    var tool = String(sequence).replace(/^tools_/, "").replace(/_/g, "-");
    return this.CODE + ": " + tool + " starts an agent that cannot run confined with its user's Tigo key on this server" +
      " (each No Code user has a key of their own here). Do the work in this conversation instead.";
  },
  // For the runner itself (C8O.subagents.run), whoever calls it: an Error with the code, never a start.
  assertAllows: function (sequence, contextObject) {
    if (this.allows(sequence, contextObject)) { return; }
    var error = new Error(this.refusal(sequence));
    error.code = this.CODE;
    throw error;
  }
};
