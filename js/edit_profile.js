// The edit profile of the calling conversation, for the A/B of the surfaces an agent changes a project with.
// lib_ConvertigoAgentBridge sends X-Convertigo-Edit-Profile on the MCP connection of a Tigo Studio conversation the
// user switched ("/profil yaml|html" in the Tigo panel, kept per conversation by lib_ConvertigoAssistant). Without the
// header, or with any other value, nothing changes: that default is the MCP edit tools.
// - yaml: the tools that change a project are neither listed nor run. The agent edits c8oProject.yaml, _c8oProject/**
//   and js/** of the project with its own file tools, then calls project-reload (convertigo://resources/
//   convertigo-yaml-editing). project-reload and mobile-builder-build stay (a reload of the edited files, a build
//   check); batch-call, requestable-execute and subagent-run stay for what changes nothing.
// - html: every tool stays; project-reload imports the edited generated files of the NGX pages (fromIonic,
//   js/ionic_roundtrip.js), mobile-builder-open lists them, and a tree change of a page waits for its file edits to be
//   imported (convertigo://resources/convertigo-ngx-html-roundtrip).
if (typeof C8O === "undefined") { var C8O = {}; }
C8O.editProfile = (function () {
  var api = {};
  api.HEADER = "X-Convertigo-Edit-Profile";
  api.PROFILES = { yaml: true, html: true };
  api.YAML_GUIDE = "convertigo://resources/convertigo-yaml-editing";
  api.HTML_GUIDE = "convertigo://resources/convertigo-ngx-html-roundtrip";

  // What the yaml profile takes away: the writers of js/subagents.js WRITE_SEQUENCES but project-reload and
  // mobile-builder-build, and project-delete. batch-call, requestable-execute and subagent-run are refused for what
  // they would change (refused below).
  api.YAML_REFUSED = {
    tools_databaseobject_tree_apply: "databaseobject-tree-apply",
    tools_databaseobject_delete: "databaseobject-delete",
    tools_databaseobject_move: "databaseobject-move",
    tools_databaseobject_rename: "databaseobject-rename",
    tools_project_save: "project-save",
    tools_project_js_set: "project-js-set",
    tools_project_delete: "project-delete",
    tools_upsert_crud: "upsert-crud",
    tools_sql_transaction_create: "sql-transaction-create",
    tools_business_sequence_create: "business-sequence-create",
    tools_facade_create: "facade-create",
    tools_ngx_page_create: "ngx-page-create",
    tools_ngx_theme_apply: "ngx-theme-apply",
    tools_marketplace_import: "marketplace-import",
    tools_requestable_stub_set: "requestable-stub-set",
    tools_scheduler_apply: "scheduler-apply"
  };
  // the Tigo projects, whose sequences change the agents' own setup: requestable-execute does not run them in yaml
  var TIGO_PROJECTS = { lib_ConvertigoAssistant: true, lib_ConvertigoAgentBridge: true };

  function trimmed(value) {
    return value == null ? "" : String(value).trim();
  }

  function parsed(value) {
    if (value != null && typeof value === "object") {
      return value;
    }
    try {
      return trimmed(value).length ? JSON.parse(trimmed(value)) : null;
    } catch (_notJson) {
      return null;
    }
  }

  // "yaml", "html" or "" (the default), from the header of the request being served.
  api.current = function () {
    try {
      var request = typeof context !== "undefined" && context ? context.httpServletRequest : null;
      var value = request ? trimmed(request.getHeader(api.HEADER)).toLowerCase() : "";
      return api.PROFILES[value] === true ? value : "";
    } catch (_noRequest) {
      return "";
    }
  };

  // Whether tools/list shows this tool sequence.
  api.lists = function (sequence, profile) {
    profile = profile === undefined ? api.current() : profile;
    return profile !== "yaml" || api.YAML_REFUSED[String(sequence)] === undefined;
  };

  // The tool a call of this sequence with these arguments would run that the profile refuses, "" when none.
  api.refused = function (sequence, args, profile) {
    profile = profile === undefined ? api.current() : profile;
    sequence = String(sequence || "");
    args = args || {};
    if (profile !== "yaml") {
      return "";
    }
    if (api.YAML_REFUSED[sequence] !== undefined) {
      return api.YAML_REFUSED[sequence];
    }
    if (sequence === "tools_subagent_run") {
      // runId alone collects the report of a run already started; a verifier only reads; a constructor changes the project
      return !trimmed(args.runId).length && trimmed(args.profile).toLowerCase() !== "verifier" ? "subagent-run (constructor)" : "";
    }
    if (sequence === "tools_requestable_execute") {
      var parts = trimmed(args.requestable).split(".");
      if (parts.length < 2) {
        return "";
      }
      if (TIGO_PROJECTS[parts[0]] === true) {
        return "requestable-execute of " + trimmed(args.requestable);
      }
      if (parts[0] !== "lib_ConvertigoMCP" || parts.length !== 2) {
        return "";
      }
      var name = parts[1].replace(/^sq:/, "");
      if (api.YAML_REFUSED[name] !== undefined) {
        return api.YAML_REFUSED[name];
      }
      if (name === "tools_batch_call" || name === "tools_subagent_run" || name === "tools_requestable_execute") {
        return api.refused(name, parsed(args.variables) || {}, profile);
      }
    }
    return "";
  };

  api.refusal = function (tool, profile) {
    profile = profile === undefined ? api.current() : profile;
    return trimmed(tool) + " is not available in the yaml edit profile of this conversation: change the project by"
      + " editing its YAML files (c8oProject.yaml, _c8oProject/**, js/**) with your file tools, then call project-reload"
      + " and read its errors. Read " + api.YAML_GUIDE + " first.";
  };

  // Throws the refusal of a call the profile refuses (the inner calls of batch-call).
  api.assertAllowed = function (sequence, args) {
    var tool = api.refused(sequence, args);
    if (tool.length) {
      throw new Error(api.refusal(tool));
    }
  };

  // The resources of a profile (resources_index.json "profile"): listed only in their profile, read by uri in any.
  api.listsResource = function (entry, profile) {
    profile = profile === undefined ? api.current() : profile;
    var owner = entry && entry.profile ? trimmed(entry.profile).toLowerCase() : "";
    return !owner.length || owner === profile;
  };

  return api;
})();
