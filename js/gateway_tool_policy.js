// Tools that call a model of the Convertigo LLM gateway (Mistral, GLM) on the agent's behalf.
// An agent host that sees images and runs its own sub-agents (Claude Code) says so with
// X-Convertigo-Agent-Provider: those tools then leave its catalog, and a call names what to use instead.
if (typeof C8O === "undefined") { var C8O = {}; }
C8O.gatewayToolPolicy = {
  PROVIDERS_WITHOUT_GATEWAY: ["claude"],
  INSTEAD: {
    tools_image_describe: "read the image yourself (Read the PNG file, or the screenshot of your Playwright tools)",
    tools_subagent_run: "hand the piece to a sub-agent of your own host (its sub-agent or task tool), with a self-contained task and the report you need",
    tools_browser_verify: "prove the pages yourself with your Playwright browser tools (navigate, click, take a screenshot and look at it), or through a sub-agent of your own host"
  },
  provider: function () {
    var request = typeof context !== "undefined" && context ? context.httpServletRequest : null;
    return request ? String(request.getHeader("X-Convertigo-Agent-Provider") || "").trim().toLowerCase() : "";
  },
  active: function () {
    return this.PROVIDERS_WITHOUT_GATEWAY.indexOf(this.provider()) !== -1;
  },
  allows: function (sequence) {
    return !this.active() || !Object.prototype.hasOwnProperty.call(this.INSTEAD, String(sequence));
  },
  refusal: function (sequence) {
    return "This tool calls a model of the Convertigo gateway, which this " + this.provider() +
      " conversation does not use: " + this.INSTEAD[String(sequence)] + ".";
  }
};
