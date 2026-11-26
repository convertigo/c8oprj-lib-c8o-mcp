if (typeof C8O === "undefined") {
  var C8O = {};
}

// The instructions of the MCP initialize answer (mcp_initialize). A client shows them to its model before any tool:
// they bootstrap the skill, they never replace it. A client with no Convertigo skill, or one of another guidance
// version, calls skill-install (js/skill_package.js), which answers the whole skill to apply at once and to write for
// the next sessions. A No Code token (authKind "nocode", js/mcp_auth.js) gets the No Code bootstrap and the few rules
// that must hold even before the skill is read; any other caller keeps the engine sentence and gets the skill check.
C8O.serverInstructions = C8O.serverInstructions || {};

(function (api) {
  api.STUDIO_HEAD = "Use Convertigo MCP tools to inspect and manage the engine.";

  api.text = function (authKind, version) {
    var kind = String(authKind == null ? "" : authKind).replace(/^\s+|\s+$/g, "").toLowerCase();
    var tag = "`" + String(version == null ? "" : version) + "`";
    if (kind === "nocode") {
      return [
        "Convertigo No Code MCP: C8Oforms forms and their Baserow data, through the nocode-* tools. Guidance version " + tag + ".",
        "Before any No Code action: if the skill `convertigo-nocode` is not installed, or the `Skill guidance version` line of its SKILL.md is not " + tag +
          ", call `skill-install` (harness codex, claude, vibe or generic; installedVersion) and apply the SKILL.md it answers at once. " +
          "It says how to read the drawers and how to write the files for the next sessions.",
        "Always: use only the nocode-* tools, never low-code, project, shell or file tools on Convertigo; read a form with nocode-form-get before changing it; " +
          "never ask for, print or store the bearer token."
      ].join("\n");
    }
    return api.STUDIO_HEAD + " Guidance version " + tag + ": when your Convertigo skill (convertigo-generalist, or convertigo-nocode for No Code forms) " +
      "is missing or has another `Skill guidance version`, call `skill-install` (skill, harness, installedVersion) before changing anything, and apply what it answers.";
  };
})(C8O.serverInstructions);
