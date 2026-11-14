/*
 * The changes of Tigo in a Studio (Eclipse 8.4, web and Electron 8.5), as the user set them in the Tigo panel:
 * - "Confirmer avant de modifier" (confirm): each write of the agent waits for the user's answer on a card of the
 *   conversation, as in No Code (js/nocode_write_confirm.js, whose wait this module uses: 40 s per call, then
 *   awaiting_confirmation and the same call again; 5 minutes without an answer refuse the change);
 * - "Lecture seule" (readonly): every write is refused at once, and the answer tells the agent why;
 * - off, the default: nothing changes.
 * The MCP router (js/mcp_endpoint_router.js) applies it to the calls of the managed tokens the Agent Bridge gives Tigo's
 * agents and their sub-agents (kind "managed"), whatever the provider and however the agent calls: a tool, a batch-call
 * (each write of the batch is on the card), a call made from its code (Vibe run_typescript, which goes through the same
 * endpoint), requestable-execute of a write tool. The durable tokens of other MCP clients are not concerned: the choice
 * belongs to the Tigo panel.
 *
 * The choice is "user:studio" in lib_ConvertigoAssistant.writeConfirm (context.server): {on, mode, at}, which
 * lib_ConvertigoAssistant writes when the user switches and at each message; the Studio panel's user is "studio" there.
 * The cards are "write-confirm" requests of lib_ConvertigoAssistant.hostRequests with scope "studio", the projects and
 * the changes (items: action, project, target QName, names, detail).
 *
 * Every tool sequence of lib_ConvertigoMCP is in WRITE_TOOLS or in READ_TOOLS: tests/scripts/
 * validate_studio_write_confirm.cjs fails on a tool in neither list, which would be a write nobody confirms.
 */

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.studioWriteConfirm = C8O.studioWriteConfirm || {};

(function (api) {
  var CONFIRM_KEY = "lib_ConvertigoAssistant.writeConfirm";
  var MAX_ITEMS = 30;
  // The Studio panel's user for lib_ConvertigoAssistant (getAgentContextUserId), and the owner of its cards.
  api.OWNER = "studio";
  api.MODES = { off: true, confirm: true, readonly: true };

  // The tools that change a project, the Studio or its data, by sequence. Some change nothing with some arguments
  // (writesOf): a dry run of tree-apply, a batch of reads, the report of a sub-agent already running.
  api.WRITE_TOOLS = {
    tools_databaseobject_tree_apply: "databaseobject-tree-apply",
    tools_databaseobject_delete: "databaseobject-delete",
    tools_databaseobject_move: "databaseobject-move",
    tools_databaseobject_rename: "databaseobject-rename",
    tools_batch_call: "batch-call",
    tools_business_sequence_create: "business-sequence-create",
    tools_sql_transaction_create: "sql-transaction-create",
    tools_upsert_crud: "upsert-crud",
    tools_ngx_page_create: "ngx-page-create",
    tools_ngx_theme_apply: "ngx-theme-apply",
    tools_project_js_set: "project-js-set",
    tools_project_save: "project-save",
    tools_project_delete: "project-delete",
    // discards the changes not saved yet, and loads what was written in the project's files
    tools_project_reload: "project-reload",
    // the production build: overwrites DisplayObjects/mobile, what a deployed project serves
    tools_mobile_builder_build: "mobile-builder-build",
    tools_marketplace_import: "marketplace-import",
    tools_scheduler_apply: "scheduler-apply",
    tools_requestable_stub_set: "requestable-stub-set",
    tools_tags_apply: "tags-apply",
    // a write tool of lib_ConvertigoMCP, or a requestable of the Tigo stack (its settings, its conversations)
    tools_requestable_execute: "requestable-execute",
    // a constructor builds in a project
    tools_subagent_run: "subagent-run",
    tools_nocode_form_create: "nocode-form-create",
    tools_nocode_form_edit: "nocode-form-edit",
    tools_nocode_form_update: "nocode-form-update",
    tools_nocode_form_publish: "nocode-form-publish",
    tools_nocode_app_create: "nocode-app-create",
    tools_nocode_baserow_schema_apply: "nocode-baserow-schema-apply"
  };

  // The tools that change nothing in a project or in the Studio. requestable-execute and crud-proof may change an
  // application's data, as running the application does: the user tests with them, they are not project changes.
  api.READ_TOOLS = {
    tools_browser_verify: true,
    tools_crud_proof: true,
    tools_crud_status: true,
    tools_databaseobject_schema: true,
    tools_databaseobject_search: true,
    tools_databaseobject_tree_get: true,
    tools_image_describe: true,
    tools_log_view: true,
    tools_marketplace_describe: true,
    tools_marketplace_list: true,
    // builds and shows the application: generated files only
    tools_mobile_builder_open: true,
    tools_nocode_baserow_catalog_list: true,
    tools_nocode_baserow_rows_list: true,
    tools_nocode_form_compile: true,
    tools_nocode_form_contract_get: true,
    tools_nocode_form_get: true,
    tools_nocode_form_list: true,
    tools_nocode_form_preview_capture: true,
    tools_nocode_form_validate: true,
    // a feedback report of the agent, never a project
    tools_nocode_report_create: true,
    tools_report_create: true,
    tools_palette_describe: true,
    tools_palette_list: true,
    tools_project_js_get: true,
    tools_project_lint: true,
    tools_project_list: true,
    tools_project_list_symbols: true,
    tools_project_security_audit: true,
    tools_rag_query: true,
    tools_requestable_stub_get: true,
    tools_scheduler_list: true,
    tools_sql_select: true,
    tools_tags_get: true,
    tools_tigo_resources: true
  };

  // requestable-execute of these projects changes Tigo itself.
  var TIGO_PROJECTS = { lib_ConvertigoAssistant: true, lib_ConvertigoAgentBridge: true };

  function trimmed(value) {
    return value == null ? "" : String(value).trim();
  }

  function nocode() {
    if (typeof C8O.nocodeWriteConfirm === "undefined" || typeof C8O.nocodeWriteConfirm.hold !== "function") {
      include("js/nocode_write_confirm.js");
    }
    return C8O.nocodeWriteConfirm;
  }

  function parsed(value) {
    return nocode().parsed(value);
  }

  function list(value) {
    value = parsed(value);
    return value == null ? [] : (Array.isArray(value) ? value : [value]);
  }

  function truthy(value) {
    return nocode().truthy(value);
  }

  function plain(text, max) {
    var value = trimmed(text).replace(/\s+/g, " ");
    return value.length > max ? value.substring(0, max - 1) + "…" : value;
  }

  function projectOf(qname) {
    return trimmed(qname).split(".")[0];
  }

  // The sequence of a tool name, as the router and batch-call map it: databaseobject-tree-apply, databaseobject_tree_apply,
  // databaseobject.tree.apply.
  function token(value, underscore) {
    var text = String(value || "").toLowerCase().replace(underscore ? /[^a-z0-9]+/g : /[^a-z0-9-]+/g, underscore ? "_" : "-");
    return text.replace(/[_-]{2,}/g, function (match) { return match.charAt(0); }).replace(/^[-_]+|[-_]+$/g, "");
  }

  api.sequenceOf = function (tool) {
    var name = trimmed(tool);
    var parts;
    if (name.indexOf(".") !== -1) {
      parts = name.split(".").map(function (part) { return token(part, true); }).filter(function (part) { return part.length; });
    } else {
      parts = token(name, false).split("-");
      if (parts.length < 2) {
        parts = token(name, true).split("_");
      }
      parts = parts.length < 2 ? parts : [token(parts.shift(), true), token(parts.join("-"), true)];
    }
    var sequence = parts.length >= 2 ? "tools_" + parts.join("_") : "";
    return sequence === "tools_facade_create" ? "tools_business_sequence_create" : sequence;
  };

  // The user's choice: off unless lib_ConvertigoAssistant wrote another one.
  api.mode = function (store) {
    var map = store == null ? null : store.get(CONFIRM_KEY);
    var json = map == null ? null : map.get("user:" + api.OWNER);
    var choice = null;
    try {
      choice = json == null ? null : JSON.parse(String(json));
    } catch (_unreadable) {}
    if (!choice) {
      return "off";
    }
    var mode = trimmed(choice.mode).toLowerCase();
    if (api.MODES[mode] === true) {
      return mode;
    }
    return choice.on === true ? "confirm" : "off";
  };

  function writes(sequence, args) {
    args = args || {};
    if (sequence === "tools_databaseobject_tree_apply") {
      return !truthy(args.dryRun);
    }
    if (sequence === "tools_subagent_run") {
      // runId alone collects the report of a run already started; a verifier only reads
      return !trimmed(args.runId).length && trimmed(args.profile).toLowerCase() !== "verifier";
    }
    if (sequence === "tools_requestable_execute") {
      var text = trimmed(args.requestable);
      var parts = text.split(".");
      if (parts.length < 2) {
        return false;
      }
      var project = parts[0];
      if (TIGO_PROJECTS[project] === true) {
        return true;
      }
      if (project !== "lib_ConvertigoMCP") {
        return false;
      }
      var name = parts.length === 2 ? parts[1].replace(/^sq:/, "") : "";
      if (!name.length || /^mcp_/.test(name) || api.READ_TOOLS[name] === true) {
        return false;
      }
      // a write tool, or another sequence of the MCP: it is the user's to allow
      return api.WRITE_TOOLS[name] ? (name === "tools_requestable_execute" || writes(name, parsed(args.variables) || {})) : true;
    }
    if (sequence === "tools_batch_call") {
      return api.writesOf(sequence, args).length > 0;
    }
    if (nocode().WRITE_TOOLS[sequence]) {
      return nocode().holds(sequence, args);
    }
    return api.WRITE_TOOLS[sequence] !== undefined;
  }

  // The writes a call makes, as [{sequence, tool, args}]: the call itself, or each write of a batch (its calls, inline:
  // the router reads callsFile first). [] when it changes nothing.
  api.writesOf = function (sequence, args) {
    args = args || {};
    if (sequence !== "tools_batch_call") {
      return writes(sequence, args) ? [{ sequence: sequence, tool: api.WRITE_TOOLS[sequence] || sequence, args: args }] : [];
    }
    var found = [];
    list(args.calls).forEach(function (call) {
      call = parsed(call) || {};
      var inner = api.sequenceOf(call.tool || call.name);
      var innerArgs = parsed(call.arguments || call.args) || {};
      // batch-call refuses a batch in a batch
      if (inner.length && inner !== "tools_batch_call" && writes(inner, innerArgs)) {
        found.push({ sequence: inner, tool: api.WRITE_TOOLS[inner] || inner, args: innerArgs });
      }
    });
    return found;
  };

  api.holds = function (sequence, args) {
    return api.writesOf(sequence, args).length > 0;
  };

  // ---- What the change does, for the card ----------------------------------------------------------------------
  // Items name what the user knows: the project, the QName of the object, the names it creates. The panel words them.

  function nodeNames(tree) {
    var names = [];
    list(tree).forEach(function (node) {
      node = parsed(node) || {};
      var name = trimmed(node.name);
      if (name.length && names.length < 5) {
        names.push(name);
      }
    });
    return names;
  }

  function itemOf(sequence, args) {
    args = args || {};
    var project = trimmed(args.project);
    switch (sequence) {
      case "tools_databaseobject_tree_apply":
        // at inside, before or after creates the tree there; self (the default) changes the target
        var at = trimmed(args.at).toLowerCase();
        return { action: at === "inside" ? "tree_create" : (at === "before" || at === "after" ? "tree_insert" : "tree_apply"), project: projectOf(args.target), target: trimmed(args.target), names: nodeNames(args.tree), detail: trimmed(args.mode) === "replace" ? "replace" : "" };
      case "tools_databaseobject_delete":
        return { action: "delete", project: projectOf(args.qname || args.target), target: trimmed(args.qname || args.target) };
      case "tools_databaseobject_move":
        return { action: "move", project: projectOf(args.qname), target: trimmed(args.qname), to: trimmed(args.target), detail: trimmed(args.position) };
      case "tools_databaseobject_rename":
        return { action: "rename", project: projectOf(args.qname), target: trimmed(args.qname), name: trimmed(args.name) };
      case "tools_business_sequence_create":
        return { action: "create_sequence", project: project, name: trimmed(args.name) };
      case "tools_sql_transaction_create":
        var transactions = list(args.transactions).map(function (t) { return trimmed(parsed(t) && parsed(t).name); }).filter(function (n) { return n.length; });
        return { action: "create_transactions", project: project, target: trimmed(args.connector), names: transactions.length ? transactions.slice(0, 10) : [trimmed(args.name)].filter(function (n) { return n.length; }) };
      case "tools_upsert_crud":
        var spec = parsed(args.spec) || {};
        return { action: "crud", project: trimmed(spec.project) || project, names: list(spec.entities).map(function (e) { e = parsed(e) || {}; return trimmed(e.name || e.table || e.plural); }).filter(function (n) { return n.length; }).slice(0, 10) };
      case "tools_ngx_page_create":
        return { action: "create_page", project: project, name: trimmed(args.name) };
      case "tools_ngx_theme_apply":
        return { action: "apply_theme", project: project, name: trimmed(args.preset || args.appName) };
      case "tools_project_js_set":
        return { action: "write_js", project: project, name: trimmed(args.filename) };
      case "tools_project_save":
        return { action: "save", project: project };
      case "tools_project_delete":
        return { action: "delete_project", project: project, detail: truthy(args.deleteCar) ? "car" : "" };
      case "tools_project_reload":
        return { action: "reload", project: project };
      case "tools_mobile_builder_build":
        return { action: "build", project: project };
      case "tools_marketplace_import":
        return { action: "import", project: trimmed(args.importedProjectName) || project, name: project, to: trimmed(args.targetProject) };
      case "tools_scheduler_apply":
        return { action: trimmed(args.action).toLowerCase() === "delete" ? "unschedule" : "schedule", project: project, name: trimmed(args.name), target: project.length && trimmed(args.sequence).length ? project + "." + trimmed(args.sequence) : "", detail: trimmed(args.cron) };
      case "tools_requestable_stub_set":
        return { action: "write_stub", project: projectOf(args.targetRequestable), target: trimmed(args.targetRequestable) };
      case "tools_tags_apply":
        return { action: "tags", project: project, detail: trimmed(args.action) };
      case "tools_requestable_execute":
        return { action: "execute", project: projectOf(args.requestable), target: trimmed(args.requestable) };
      case "tools_subagent_run":
        var inputs = parsed(args.inputs) || {};
        return { action: "subagent", project: trimmed(inputs.project) || project, detail: plain(args.task, 160) };
    }
    return { action: "change", project: project, target: sequence.replace(/^tools_/, "").replace(/_/g, "-") };
  }

  // {projects, items}: every write of the call, the No Code ones as js/nocode_write_confirm.js words them.
  api.summary = function (found) {
    var items = [];
    var projects = [];
    var push = function (item) {
      if (trimmed(item.project).length && projects.indexOf(trimmed(item.project)) < 0) {
        projects.push(trimmed(item.project));
      }
      if (items.length < MAX_ITEMS) {
        items.push(item);
      } else if (items.length === MAX_ITEMS) {
        items.push({ action: "more" });
      }
    };
    (found || []).forEach(function (write) {
      if (nocode().WRITE_TOOLS[write.sequence]) {
        var form = nocode().summary(write.sequence, write.args, null);
        form.items.forEach(function (item) {
          item.project = "C8Oforms";
          if (!trimmed(item.target).length && form.formName.length) {
            item.target = form.formName;
          }
          push(item);
        });
      } else {
        var item = itemOf(write.sequence, write.args);
        Object.keys(item).forEach(function (key) {
          if (item[key] === "" || (Array.isArray(item[key]) && !item[key].length)) {
            delete item[key];
          }
        });
        push(item);
      }
    });
    return { projects: projects, items: items };
  };

  // ---- The answers ------------------------------------------------------------------------------------------------

  function refused(tool, reason, found) {
    var messages = {
      user: "The user refused this change on the confirmation card of the Tigo panel: nothing was saved. Do not retry it, nor a variant of it, nor the same change another way. Ask the user in one sentence what they want instead.",
      user_again: "The user already refused this same change in this turn: nothing was saved, and the same call is refused again until the turn ends. Stop calling it: end your turn and ask the user in one sentence what they want instead.",
      no_answer: "The user did not answer the confirmation card within 5 minutes: nothing was saved. Do not retry the change: tell the user in one sentence what you wanted to change and ask whether to do it.",
      turn_end: "The turn ended before the user answered the confirmation card: nothing was saved.",
      replaced: "A later call replaced this change on the confirmation card: nothing was saved by this call.",
      cannot_ask: "The user asked to confirm every change, and this call does not name its Tigo conversation, so no card can ask them: nothing was saved. Make the change with the Convertigo tools of your session, not from another client or a direct HTTP call; or tell the user that \"Confirmer avant de modifier\" is turned off in the Tigo settings.",
      read_only: "Tigo is in read-only mode in this Studio: every change is refused, and nothing was saved. Do not retry it, nor make it another way (another tool, a file edit, a shell command). Answer with what you found, tell the user what you would change, and that read-only mode (\"Lecture seule\") is turned off in the Tigo settings or with /confirmer off."
    };
    var answer = { status: "refused", saved: false, reason: reason, tool: tool, message: messages[reason] || messages.no_answer };
    if (tool === "batch-call" && found && found.length) {
      answer.writes = found.map(function (write) { return write.tool; });
      answer.message += " No call of the batch ran" + (reason === "read_only" ? ": run the reads alone." : ".");
    }
    return answer;
  }

  function awaiting(tool, request, now) {
    var left = Math.max(0, Math.ceil((Number(request.expiresAt || 0) - now) / 1000));
    return {
      status: "awaiting_confirmation",
      saved: false,
      tool: tool,
      requestId: request.id,
      secondsLeft: left,
      message: "The change waits for the user's answer on the confirmation card of the Tigo panel, open " + left +
        " s more. Call " + tool + " again with exactly the same arguments to keep waiting, and change nothing else" +
        " meanwhile. Do not end your turn while the card is open: the end of the turn closes it and nothing is saved."
    };
  }

  // null: the call goes on. Otherwise what the agent gets instead of the tool's answer.
  // who: {conversationId (X-Convertigo-Conversation-Id), subagentRun (X-Convertigo-Subagent-Run)}.
  // host: the host of js/nocode_write_confirm.js (server, newMap, now, sleep, uuid), and subagentRun(runId) ->
  // {alive, profile, conversationId} or null.
  api.run = function (sequence, args, who, host) {
    args = args || {};
    var found = api.writesOf(sequence, args);
    if (!found.length) {
      return null;
    }
    var store = host.server();
    var tool = api.WRITE_TOOLS[sequence] || sequence;
    var conversationId = trimmed(who && who.conversationId);
    var mode = api.mode(store);
    if (mode === "off" && !conversationId.length) {
      return null;
    }
    // A constructor the user allowed builds in its project: its own calls name its run, live, of this conversation.
    var runId = trimmed(who && who.subagentRun);
    if (mode !== "readonly" && runId.length && typeof host.subagentRun === "function") {
      var run = host.subagentRun(runId);
      if (run && run.alive === true && trimmed(run.profile) !== "verifier" && trimmed(run.conversationId) === conversationId) {
        return null;
      }
    }
    var summary = null;
    var describe = function () {
      summary = summary || api.summary(found);
      return summary;
    };
    return nocode().hold({
      sequence: sequence,
      tool: tool,
      user: api.OWNER,
      conversationId: conversationId,
      fingerprint: nocode().fingerprint(sequence, args),
      targetKey: describe().projects.join(","),
      keepRefused: true,
      on: function () {
        return api.mode(store) === "confirm";
      },
      stop: function () {
        return api.mode(store) === "readonly" ? "read_only" : "";
      },
      describe: function () {
        var described = describe();
        return { scope: "studio", project: described.projects[0] || "", projects: described.projects, items: described.items };
      },
      refused: function (reason) {
        return refused(tool, reason, sequence === "tools_batch_call" ? found : null);
      },
      awaiting: function (request, now) {
        return awaiting(tool, request, now);
      }
    }, host);
  };

  // What the user confirms is what runs: the calls of a batch read from its file (callsFile) before the card, and passed
  // inline to batch-call. {calls} or {error}; the same rules as batch-call (a .json file of at most 10 MB, in the projects
  // workspace or the temporary folder of the conversations).
  api.inlineCallsFile = function (args, host) {
    if (!args || !trimmed(args.callsFile).length || (args.calls != null && trimmed(args.calls).length)) {
      return null;
    }
    var read = host.readCallsFile(trimmed(args.callsFile));
    if (read && read.calls) {
      args.calls = read.calls;
      delete args.callsFile;
      return null;
    }
    return {
      status: "error",
      saved: false,
      tool: "batch-call",
      message: "callsFile could not be read (" + trimmed(read && read.error) + "): no call of the batch ran. Fix the file, or pass the calls inline."
    };
  };

  // The host of the engine: the shared store, the runs of the sub-agents (<user workspace>/subagents/<runId>/run.json)
  // and the file of a batch.
  api.javaHost = function () {
    var host = nocode().javaHost();
    host.readCallsFile = function (pathText) {
      try {
        var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
        var File = java.io.File;
        var root = new File(String(Engine.PROJECTS_PATH)).getCanonicalFile();
        var agentTmp = new File(String(Engine.USER_WORKSPACE_PATH), ".agent-tmp").getCanonicalFile();
        var file = new File(pathText);
        if (!file.isAbsolute()) {
          file = new File(root, pathText);
        }
        file = file.getCanonicalFile();
        if (!file.toPath().startsWith(root.toPath()) && !file.toPath().startsWith(agentTmp.toPath())) {
          return { error: "outside the projects workspace and the temporary folder of the conversations" };
        }
        if (!/\.json$/i.test(String(file.getName())) || !file.isFile() || file.length() > 10 * 1024 * 1024) {
          return { error: "not a .json file of at most 10 MB" };
        }
        var value = JSON.parse(String(new java.lang.String(java.nio.file.Files.readAllBytes(file.toPath()), "UTF-8")));
        var calls = value && !Array.isArray(value) && Array.isArray(value.calls) ? value.calls : value;
        return Array.isArray(calls) ? { calls: calls } : { error: "not a JSON array of calls" };
      } catch (unreadable) {
        return { error: String(unreadable && unreadable.message ? unreadable.message : unreadable) };
      }
    };
    host.subagentRun = function (runId) {
      try {
        if (!/^(verify|build|sa)-\d{8}-\d{6}-[0-9a-f]{8}$/.test(trimmed(runId))) {
          return null;
        }
        var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
        var file = new java.io.File(new java.io.File(new java.io.File(String(Engine.USER_WORKSPACE_PATH), "subagents"), trimmed(runId)), "run.json");
        if (!file.isFile()) {
          return null;
        }
        var meta = JSON.parse(String(new java.lang.String(java.nio.file.Files.readAllBytes(file.toPath()), "UTF-8")));
        var alive = false;
        try {
          var handle = java.lang.ProcessHandle.of(Number(meta.pid || 0));
          alive = handle.isPresent() && handle.get().isAlive();
        } catch (_noHandle) {}
        return { alive: alive, profile: trimmed(meta.profile), conversationId: trimmed(meta.conversationId) };
      } catch (_unreadableRun) {
        return null;
      }
    };
    return host;
  };
})(C8O.studioWriteConfirm);
