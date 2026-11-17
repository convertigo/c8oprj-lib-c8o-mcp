if (typeof C8O === "undefined") {
  var C8O = {};
}

// The journal of the writes made through the MCP, for project-changes.
//
// Agents ended runs with final reports the MCP could have contradicted: "nothing else was modified in the project" after
// changing two existing server objects nobody asked for, "seed verified" after the seed's last run answered an error.
// mcp_endpoint records here, after each tool answer that is not an error (journalAfterToolCall of
// js/mcp_endpoint_router.js), what a write tool of C8O.studioWriteConfirm.WRITE_TOOLS created, changed, renamed, moved or
// deleted, read from its answer, and the requestables run with requestable-execute; batch-call records each of its writes
// with the whole answer of its tool (its own compact answer keeps only a slot for a clean mutation). project-changes
// answers the journal of the caller grouped by object, so the final summary is built from facts.
//
// The journal of a conversation is kept under a digest of its X-Convertigo-Conversation-Id (the header the managed agent
// hosts send), without one under a digest of the bearer of the call (as js/mcp_answer_pages.js binds its answers), in the
// store the server shares between requests (context.server): a map of journals, each a deque of entries as JSON text.
// Bounded: MAX_ENTRIES entries and MAX_JOURNAL_CHARS characters per journal, MAX_JOURNALS journals, nothing older than
// KEEP_MS. An entry holds the time, the tool, the objects with their change and the status, or the run of a requestable
// with ok or not: QNames, names of the tools and statuses only, never an argument value (data, secrets).
(function () {
  var api = C8O.writeJournal = C8O.writeJournal || {};
  api.STORE_KEY = "lib_ConvertigoMCP.writeJournal";
  api.MAX_ENTRIES = 400;
  api.MAX_JOURNALS = 64;
  api.KEEP_MS = 24 * 3600000;
  api.MAX_JOURNAL_CHARS = 160000;
  api.MAX_ENTRY_CHARS = 2000;
  api.MAX_OBJECTS_PER_ENTRY = 40;
  // What project-changes answers, indented by 2 as a script gets it, stays under the 14,000 of js/mcp_answer_pages.js with
  // room for the notes of the endpoint.
  api.BUDGET = 12500;
  api.MAX_LINE = 400;
  api.TOOL = "project-changes";
  api.SEQUENCE = "tools_project_changes";
  api.HOW_TO_USE = "Build your final summary from this list: name every object, file and run it lists, say which objects " +
    "the user did not ask to change, and report the last status of each run; an empty list for a project means no object " +
    "of it was changed through the MCP (changes made outside the MCP are not recorded).";

  var CONVERSATION_ID = /^[A-Za-z0-9._-]{1,128}$/;
  var SAFE_ID = /^[A-Za-z0-9_.:-]{1,80}$/;
  var ERROR_STATUS = /^(error|failed|failure|refused|invalid|conflict|auth_required|unauthorized|forbidden|unavailable|awaiting_confirmation|not_found)$/i;
  var EXECUTE = "tools_requestable_execute";
  var BATCH = "tools_batch_call";

  function text(value) {
    return value === null || value === undefined ? "" : String(value).replace(/^\s+|\s+$/g, "");
  }

  // A Convertigo variable left empty can arrive as "null" or "undefined".
  function given(value) {
    var t = text(value);
    return t === "null" || t === "undefined" ? "" : t;
  }

  function truthy(value) {
    return value === true || text(value).toLowerCase() === "true";
  }

  // A Java string (typeof "object" in the engine's JavaScript) is read as text.
  function javaString(value) {
    try {
      return value !== null && typeof value === "object" && typeof value.getClass === "function" &&
        String(value.getClass().getName()) === "java.lang.String";
    } catch (_notJava) {
      return false;
    }
  }

  function parsed(value) {
    if (javaString(value)) {
      value = String(value);
    }
    if (typeof value !== "string") {
      return value;
    }
    var t = text(value);
    if (!t.length || (t.charAt(0) !== "{" && t.charAt(0) !== "[")) {
      return value;
    }
    try {
      return JSON.parse(t);
    } catch (_notJson) {
      return value;
    }
  }

  function list(value) {
    value = parsed(value);
    if (value === null || value === undefined || value === "") {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) && !javaString(value);
  }

  function filled(value) {
    if (value === null || value === undefined || value === false) {
      return false;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === "object" && !javaString(value)) {
      return Object.keys(value).length > 0;
    }
    return text(value).length > 0;
  }

  // A QName or a path: no space, bounded.
  function qnameOf(value) {
    var q = text(isObject(value) ? (value.qname || value.requestable || "") : value);
    return q.length && q.length <= 300 && !/\s/.test(q) ? q : "";
  }

  function projectOf(qname) {
    return text(qname).split(/[./]/)[0];
  }

  function parentOf(qname) {
    var at = qname.lastIndexOf(".");
    return at > 0 ? qname.substring(0, at) : "";
  }

  function under(qname, ancestor) {
    return qname.length > ancestor.length && qname.indexOf(ancestor + ".") === 0;
  }

  api.toolName = function (sequence) {
    var writes = api.writeTools();
    var known = writes && typeof writes[sequence] === "string" ? writes[sequence] : "";
    return known || text(sequence).replace(/^tools_/, "").replace(/_/g, "-");
  };

  // Java behind the engine; the tests give their own.
  api.host = api.host || {
    now: function () {
      return Number(java.lang.System.currentTimeMillis());
    },
    digest: function (value) {
      var bytes = java.security.MessageDigest.getInstance("SHA-256").digest(new java.lang.String(value).getBytes("UTF-8"));
      var hex = "";
      for (var i = 0; i < bytes.length; i++) {
        var n = Number(bytes[i]);
        if (n < 0) {
          n += 256;
        }
        hex += (n < 16 ? "0" : "") + n.toString(16);
      }
      return hex;
    },
    newMap: function () {
      return new java.util.concurrent.ConcurrentHashMap();
    },
    // Two calls of one conversation at once each add their entry: no read-modify-write of a shared text.
    newDeque: function () {
      return new java.util.concurrent.ConcurrentLinkedDeque();
    },
    // The QName of the child named name under parentQName, "" when there is none: a compact tree-apply answer names the
    // parent of what it created (its touched roots), not the object.
    childQName: function (parentQName, name) {
      try {
        var manager = Packages.com.twinsoft.convertigo.engine.Engine.theApp.databaseObjectsManager;
        var parent = manager.getDatabaseObjectByQName(String(parentQName));
        var children = parent != null && parent.getAllChildren ? parent.getAllChildren() : null;
        for (var i = 0; children != null && i < children.size(); i++) {
          if (String(children.get(i).getName()) === String(name)) {
            return String(children.get(i).getFullQName());
          }
        }
      } catch (_noChild) {}
      return "";
    },
    warn: function (message) {
      try {
        Packages.com.twinsoft.convertigo.engine.Engine.logEngine.warn("[lib_ConvertigoMCP] " + message);
      } catch (_ignoreLog) {}
    }
  };

  // The writes recorded are the tools of C8O.studioWriteConfirm.WRITE_TOOLS (every tool is a write or a read there).
  api.writeTools = function () {
    if ((typeof C8O.studioWriteConfirm === "undefined" || !C8O.studioWriteConfirm.WRITE_TOOLS) && typeof include === "function") {
      include("js/studio_write_confirm.js");
    }
    return C8O.studioWriteConfirm && C8O.studioWriteConfirm.WRITE_TOOLS ? C8O.studioWriteConfirm.WRITE_TOOLS : null;
  };

  // ---- What a write answered -------------------------------------------------------------------------------------
  // Each handler returns {objects: [{q, c, p?, fp?, k?, pr?, d?}], run?} or null (nothing to record). c: created,
  // changed, renamed (p: the QName before), moved (fp: the parent before), deleted. k: file, project, job, form or other
  // for what is not a project object (pr: its project); d: a short detail.

  function objectOut(out, q, change, extra) {
    q = qnameOf(q);
    if (!q.length) {
      return;
    }
    var o = { q: q, c: change };
    for (var key in (extra || {})) {
      if (extra[key] !== undefined && extra[key] !== "") {
        o[key] = extra[key];
      }
    }
    out.push(o);
  }

  function projectOut(out, project, change, detail) {
    project = qnameOf(project);
    if (project.length && project.indexOf(".") < 0) {
      out.push(detail ? { q: project, c: change, k: "project", pr: project, d: detail } : { q: project, c: change, k: "project", pr: project });
    }
  }

  function fileOut(out, project, path, change) {
    project = qnameOf(project);
    path = text(path).replace(/\\/g, "/").replace(/^\/+/, "");
    if (project.length && path.length && !/^[A-Za-z]:/.test(path) && path.indexOf("..") < 0) {
      out.push({ q: project + "/" + path, c: change, k: "file", pr: project });
    }
  }

  function appliedOut(out, applied) {
    var a = applied || {};
    var action = text(a.action);
    if (action === "create") {
      objectOut(out, a.qname, "created");
    } else if (action === "delete") {
      objectOut(out, a.qname, "deleted");
    } else if (action === "move") {
      objectOut(out, a.qname, "moved", { fp: qnameOf(a.fromParent) });
    } else {
      // updateExisting, setProperties, importVariables, setHandlers, declareSqlVariables...
      objectOut(out, a.qname, "changed");
    }
  }

  function sumActions(operations) {
    var sum = {};
    operations.forEach(function (op) {
      var byAction = op && isObject(op.appliedByAction) ? op.appliedByAction : {};
      for (var action in byAction) {
        sum[action] = (sum[action] || 0) + (Number(byAction[action]) || 0);
      }
    });
    return sum;
  }

  function treeApply(r, args, ctx) {
    if (truthy(r.dryRun)) {
      return null;
    }
    var out = [];
    var operations = list(r.operations).filter(function (op) {
      return isObject(op) && !/^(failed|skipped|not_run|pending)$/.test(text(op.status));
    });
    var full = operations.some(function (op) { return Array.isArray(op.applied); });
    if (full) {
      operations.forEach(function (op) {
        list(op.applied).forEach(function (applied) { appliedOut(out, applied); });
      });
      return { objects: out };
    }
    // The default compact answer: touchedQNames are roots, appliedByAction counts per action.
    var at = text(args.at).toLowerCase();
    at = at === "inside" || at === "before" || at === "after" ? at : "self";
    var roots = list(r.touchedQNames).map(qnameOf).filter(function (q) { return q.length; });
    var byAction = sumActions(operations);
    var applied = 0;
    for (var action in byAction) {
      applied += byAction[action];
    }
    if (!applied && !roots.length) {
      return null;
    }
    var target = qnameOf(args.target) || qnameOf(r.targetQName);
    if (at === "self") {
      var root = roots.indexOf(target) >= 0 || roots.length !== 1 ? target : roots[0];
      objectOut(out, root, "changed", { d: byAction["delete"] ? byAction["delete"] + " deleted inside" : "" });
      roots.forEach(function (q) {
        if (q !== root && !under(q, root) && !under(root, q)) {
          objectOut(out, q, "changed");
        }
      });
      return { objects: out };
    }
    var tree = parsed(args.tree);
    var name = isObject(tree) ? text(tree.name) : "";
    var notes = [].concat(list(r.notes), operations.reduce(function (all, op) { return all.concat(list(op.notes)); }, [])).join("\n");
    // at:"inside" over an existing child of that name updates it in place (databaseobject_batch.js): a change.
    var updated = (byAction.updateExisting || 0) > 0 || /already exists[\s\S]*updated in place/.test(notes);
    var change = !updated && (byAction.create || 0) > 0 ? "created" : "changed";
    var parents = roots.length ? roots.slice() : [];
    if (at === "inside" && target.length && parents.indexOf(target) < 0) {
      parents.push(target);
    }
    var child = "";
    for (var i = 0; i < parents.length && !child.length && name.length; i++) {
      child = qnameOf(ctx.host.childQName(parents[i], name));
    }
    if (child.length) {
      objectOut(out, child, change);
      roots.forEach(function (q) {
        if (q !== child && !under(child, q) && !under(q, child)) {
          objectOut(out, q, "changed");
        }
      });
    } else {
      (roots.length ? roots : [target]).forEach(function (q) {
        objectOut(out, q, "changed", { d: name.length ? (change === "created" ? "created " : "updated ") + name + " inside" : "" });
      });
    }
    return { objects: out };
  }

  function rename(r) {
    var from = qnameOf(r.qname);
    var to = qnameOf(r.newQName);
    if (!truthy(r.renamed) || !to.length || to === from) {
      return null;
    }
    var out = [];
    objectOut(out, to, "renamed", { p: from });
    return { objects: out };
  }

  function move(r) {
    if (!(truthy(r.done) || truthy(r.moved) || truthy(r.reordered))) {
      return null;
    }
    var out = [];
    objectOut(out, r.qname, "moved", { fp: qnameOf(r.fromParent) });
    return { objects: out };
  }

  function remove(r) {
    if (r.removed !== undefined && !truthy(r.removed)) {
      return null;
    }
    var out = [];
    objectOut(out, r.qname, "deleted");
    return { objects: out };
  }

  // The generators answer the roots they created (created), a page or a sequence, and the transactions with their status.
  function generated(r) {
    var out = [];
    list(r.created).forEach(function (q) { objectOut(out, q, "created"); });
    list(r.transactionsCreated).forEach(function (t) { objectOut(out, t, "created"); });
    list(r.transactions).forEach(function (t) {
      var status = text(t && t.status).toLowerCase();
      if (status !== "kept") {
        objectOut(out, t, status === "replaced" ? "changed" : "created");
      }
    });
    return out;
  }

  function sequenceCreate(r) {
    var out = generated(r);
    objectOut(out, r.qname, "created");
    return { objects: out };
  }

  function sqlTransactionCreate(r) {
    return { objects: generated(r) };
  }

  function pageCreate(r, args) {
    var out = generated(r);
    objectOut(out, r.page, "changed");
    var project = text(args.project) || projectOf(r.page);
    var details = [];
    var style = text(r.style);
    if (style.length && !/ kept$/.test(style)) {
      details.push(style.substring(0, 60));
    }
    var theme = text(r.theme);
    if (theme.length && !/^(none|AppTheme kept)/.test(theme)) {
      details.push("theme applied");
    }
    if (details.length) {
      projectOut(out, project, "changed", details.join(", "));
    }
    return { objects: out };
  }

  function themeApply(r, args) {
    var out = [];
    projectOut(out, text(r.project) || text(args.project), "changed", "theme" + (text(r.style).length ? " (" + text(r.style).substring(0, 40) + ")" : ""));
    return { objects: out };
  }

  // upsert-crud answers created, updated and deleted (25 each at most, with their counts).
  function crud(r, args) {
    var out = [];
    list(r.created).forEach(function (q) { objectOut(out, q, "created"); });
    list(r.updated).forEach(function (q) { objectOut(out, q, "changed"); });
    list(r.deleted).forEach(function (q) { objectOut(out, q, "deleted"); });
    var more = 0;
    ["created", "updated", "deleted"].forEach(function (key) {
      more += Math.max(0, (Number(r[key + "Count"]) || 0) - list(r[key]).length);
    });
    if (!out.length) {
      projectOut(out, text(r.project) || text(args.project), "changed", "data access");
    }
    return { objects: out, more: more };
  }

  function jsSet(r, args) {
    var out = [];
    // relativePath is relative to the js/ folder of the project
    var relative = text(r.relativePath) || (text(r.filename) || text(args.filename)).replace(/\\/g, "/").replace(/^\/+/, "").replace(/^js\//, "");
    fileOut(out, args.project, "js/" + relative.replace(/\\/g, "/").replace(/^\/+/, ""), truthy(r.created) ? "created" : "changed");
    return { objects: out };
  }

  function notesWrite(r, args) {
    var out = [];
    fileOut(out, text(r.project) || text(args.project), r.path, text(r.status) === "created" ? "created" : "changed");
    return { objects: out };
  }

  function stubSet(r) {
    var out = [];
    fileOut(out, r.project, r.relativePath, truthy(r.created) ? "created" : "changed");
    return { objects: out };
  }

  function projectDelete(r, args) {
    if (!truthy(r.deleted)) {
      return null;
    }
    var out = [];
    projectOut(out, text(r.project) || text(args.project), "deleted");
    return { objects: out };
  }

  function marketplaceImport(r, args) {
    var out = [];
    if (String(r.loadedBefore) !== "true" && truthy(r.loadedAfter)) {
      projectOut(out, r.project, "created", text(r.library) && text(r.library) !== text(r.project) ? "from " + text(r.library) : "");
    }
    var target = text(args.targetProject);
    if (target.length && (truthy(r.referenceAdded) || truthy(r.referenceUpdated))) {
      projectOut(out, target, "changed", "reference to " + (text(r.library) || text(r.project)));
    }
    return out.length ? { objects: out } : null;
  }

  function schedulerApply(r, args) {
    var status = text(r.status).toLowerCase();
    var change = status === "created" ? "created" : status === "deleted" ? "deleted" : status === "updated" ? "changed" : "";
    var name = qnameOf(r.name) || qnameOf(args.name);
    if (!change.length || !name.length) {
      return null;
    }
    return { objects: [{ q: name, c: change, k: "job", pr: text(args.project) }] };
  }

  function tagsApply(r, args) {
    var out = [];
    var project = text(r.project) || text(args.project);
    if (project.length) {
      projectOut(out, project, "changed", "tags");
    } else {
      out.push({ q: "workspace project tags", c: "changed", k: "other" });
    }
    return { objects: out };
  }

  // No Code: a form or an application of C8Oforms, by its id; never a value of the form.
  function form(change, detail) {
    return function (r, args) {
      if (text(args.mode).toLowerCase() === "plan" || text(r.mode).toLowerCase() === "plan" || truthy(r.dryRun) || r.saved === false) {
        return null;
      }
      var response = isObject(r.response) ? r.response : {};
      var candidates = [r.formId, r.id, isObject(r.form) ? r.form._id : "", response._id, response.id, args.id];
      var id = "";
      for (var i = 0; i < candidates.length && !id.length; i++) {
        id = SAFE_ID.test(text(candidates[i])) ? text(candidates[i]) : "";
      }
      var o = { q: id.length ? "form " + id : "a form", c: change, k: "form", pr: "C8Oforms" };
      if (detail) {
        o.d = detail;
      }
      return { objects: [o] };
    };
  }

  function baserowSchema(r, args) {
    if (text(args.mode).toLowerCase() === "plan" || text(r.mode).toLowerCase() === "plan" || truthy(r.dryRun)) {
      return null;
    }
    return { objects: [{ q: "Baserow schema", c: "changed", k: "other", pr: "C8Oforms" }] };
  }

  function nothing() {
    return null;
  }

  // databaseobject-copy: the copy is a new object, with its source named.
  function copy(r) {
    var out = [];
    objectOut(out, r.qname, "created", { d: qnameOf(r.source).length ? "copy of " + qnameOf(r.source) : "" });
    return out.length ? { objects: out } : null;
  }

  // A write tool with no handler of its own (a tool added later): what its answer names.
  function generic(r, args, ctx) {
    var out = generated(r);
    list(r.updated).forEach(function (q) { objectOut(out, q, "changed"); });
    list(r.deleted).forEach(function (q) { objectOut(out, q, "deleted"); });
    if (!out.length && qnameOf(r.newQName).length && qnameOf(r.qname).length && qnameOf(r.newQName) !== qnameOf(r.qname)) {
      objectOut(out, r.newQName, "renamed", { p: qnameOf(r.qname) });
    }
    if (!out.length && qnameOf(r.qname).length) {
      objectOut(out, r.qname, /(create|copy|add|import)/.test(ctx.tool) ? "created" : "changed");
    }
    if (!out.length) {
      projectOut(out, text(r.project) || text(args.project), "changed", ctx.tool);
    }
    return out.length ? { objects: out } : null;
  }

  // requestable-execute: a run of the application, ok or not. A write tool of this MCP run that way is that write.
  function runFailed(res) {
    if (text(res.status).toLowerCase() === "error" || filled(res.error)) {
      return true;
    }
    var payload = isObject(res.payload) ? res.payload : null;
    if (!payload) {
      return false;
    }
    if (isObject(payload.document)) {
      payload = payload.document;
    }
    return filled(payload.error) || payload.success === false || text(payload.success) === "false" ||
      (Array.isArray(payload.errors) && payload.errors.length > 0) || ERROR_STATUS.test(text(payload.status));
  }

  function execute(r, args, ctx) {
    var res = isObject(r.result) && (r.result.requestable !== undefined || r.result.status !== undefined) ? r.result : r;
    var requestable = qnameOf(res.requestable) || qnameOf(args.requestable);
    if (!requestable.length) {
      return null;
    }
    var parts = requestable.split(".");
    if (parts[0] === "lib_ConvertigoMCP") {
      var sequence = (parts[1] || "").replace(/^sq:/, "");
      var writes = api.writeTools() || {};
      if (parts.length !== 2 || writes[sequence] === undefined || sequence === EXECUTE || sequence === BATCH || runFailed(res)) {
        // the guides, the prompts and the reads of this MCP are not runs of an application
        return null;
      }
      var inner = isObject(res.payload) ? res.payload : null;
      inner = inner && isObject(inner.result) ? inner.result : inner;
      var innerArgs = parsed(args.variables);
      return inner ? api.entryOf(sequence, inner, isObject(innerArgs) ? innerArgs : {}, { via: "requestable-execute", host: ctx.host }) : null;
    }
    return { run: { r: requestable, ok: !runFailed(res) } };
  }

  api.HANDLERS = {
    tools_databaseobject_tree_apply: treeApply,
    tools_databaseobject_rename: rename,
    tools_databaseobject_move: move,
    tools_databaseobject_delete: remove,
    tools_databaseobject_copy: copy,
    tools_business_sequence_create: sequenceCreate,
    tools_sql_transaction_create: sqlTransactionCreate,
    tools_upsert_crud: crud,
    tools_ngx_page_create: pageCreate,
    tools_ngx_theme_apply: themeApply,
    tools_project_js_set: jsSet,
    tools_project_notes_write: notesWrite,
    tools_requestable_stub_set: stubSet,
    tools_project_delete: projectDelete,
    tools_marketplace_import: marketplaceImport,
    tools_scheduler_apply: schedulerApply,
    tools_tags_apply: tagsApply,
    tools_requestable_execute: execute,
    tools_nocode_form_create: form("created"),
    tools_nocode_app_create: form("created"),
    tools_nocode_form_edit: form("changed"),
    tools_nocode_form_update: form("changed"),
    tools_nocode_form_publish: form("changed", "published"),
    tools_nocode_baserow_schema_apply: baserowSchema,
    // batch-call records each of its writes itself (js/tools_batch_call.js), with the whole answer of its tool
    tools_batch_call: nothing,
    // a save or a reload changes no object, the production build writes generated files only
    tools_project_save: nothing,
    tools_project_reload: nothing,
    tools_mobile_builder_build: nothing,
    // the writes of a constructor go through this MCP under the conversation of the caller
    tools_subagent_run: nothing
  };

  var RANK = { deleted: 0, moved: 1, renamed: 1, created: 2, changed: 3 };

  // Within an entry: one record per object, in the order of the call (deleted then created again is a change, created
  // then deleted is nothing, else the strongest change), nothing under an object the call created (it came with it),
  // the most telling first, MAX_OBJECTS_PER_ENTRY at most.
  function reduce(objects) {
    var byKey = {};
    var order = [];
    objects.forEach(function (o) {
      var key = (o.k || "") + "\n" + o.q;
      var known = byKey[key];
      if (!known) {
        byKey[key] = o;
        order.push(key);
      } else if (known.c === "deleted" && o.c === "created") {
        var replaced = {};
        for (var field in o) {
          replaced[field] = o[field];
        }
        replaced.c = "changed";
        byKey[key] = replaced;
      } else if (known.c === "created" && o.c === "deleted") {
        byKey[key] = null;
      } else if (known.c !== "created" && RANK[o.c] < RANK[known.c]) {
        byKey[key] = o;
      }
    });
    var kept = order.map(function (key) { return byKey[key]; }).filter(function (o) { return o !== null; });
    var created = kept.filter(function (o) { return !o.k && o.c === "created"; }).map(function (o) { return o.q; });
    kept = kept.filter(function (o) {
      return o.k || !created.some(function (q) { return under(o.q, q); });
    });
    kept.sort(function (a, b) { return RANK[a.c] - RANK[b.c]; });
    return kept;
  }

  // The entry of a call, or null: a read, an error, a call that changed nothing. {tool, via?, status, objects?, more?, run?}
  api.entryOf = function (sequence, answer, args, options) {
    var opts = options || {};
    var writes = api.writeTools();
    if (!writes || writes[sequence] === undefined || !isObject(answer)) {
      return null;
    }
    if (sequence !== EXECUTE && (ERROR_STATUS.test(text(answer.status)) || filled(answer.error))) {
      return null;
    }
    var tool = api.toolName(sequence);
    var handler = api.HANDLERS[sequence] || generic;
    var found = handler(answer, isObject(args) ? args : {}, { host: opts.host || api.host, tool: tool });
    if (!found) {
      return null;
    }
    if (found.tool) {
      // a write of this MCP run through requestable-execute
      return found;
    }
    var entry = { tool: tool };
    if (opts.via) {
      entry.via = String(opts.via);
    }
    entry.status = text(answer.status).toLowerCase() === "partial" ? "partial" : "ok";
    if (found.run) {
      entry.run = found.run;
      entry.status = found.run.ok ? "ok" : "error";
      return entry;
    }
    var objects = reduce(found.objects || []);
    if (!objects.length) {
      return null;
    }
    var more = Number(found.more) || 0;
    if (objects.length > api.MAX_OBJECTS_PER_ENTRY) {
      more += objects.length - api.MAX_OBJECTS_PER_ENTRY;
      objects = objects.slice(0, api.MAX_OBJECTS_PER_ENTRY);
    }
    entry.objects = objects;
    while (entry.objects.length > 1 && JSON.stringify(entry).length > api.MAX_ENTRY_CHARS) {
      entry.objects.pop();
      more++;
    }
    if (more > 0) {
      entry.more = more;
    }
    return entry;
  };

  // ---- The store -------------------------------------------------------------------------------------------------

  function header(contextObject, name) {
    try {
      var request = contextObject ? contextObject.httpServletRequest : null;
      return request ? text(request.getHeader(name)) : "";
    } catch (_noRequest) {
      return "";
    }
  }

  // {scope, key}: the conversation of the call, else its bearer, as a digest (the store never holds either).
  api.keyOf = function (contextObject, conversationId) {
    var id = text(conversationId);
    if (!CONVERSATION_ID.test(id)) {
      id = header(contextObject, "X-Convertigo-Conversation-Id");
    }
    if (CONVERSATION_ID.test(id)) {
      return { scope: "conversation", key: api.host.digest("write-journal 1\nconversation\n" + id) };
    }
    return { scope: "token", key: api.host.digest("write-journal 1\ntoken\n" + header(contextObject, "Authorization")) };
  };

  function timeOf(serialized) {
    var match = /^\{"t":(\d+)/.exec(String(serialized));
    return match ? Number(match[1]) : 0;
  }

  function keysOf(map) {
    var keys = map.keySet().toArray();
    var out = [];
    for (var i = 0; i < keys.length; i++) {
      out.push(String(keys[i]));
    }
    return out;
  }

  function itemsOf(deque) {
    var items = deque.toArray();
    var out = [];
    for (var i = 0; i < items.length; i++) {
      out.push(String(items[i]));
    }
    return out;
  }

  function trim(deque, now) {
    var items = itemsOf(deque);
    var total = 0;
    items.forEach(function (item) { total += item.length; });
    var count = items.length;
    var head = deque.peekFirst();
    while (head != null && (count > api.MAX_ENTRIES || total > api.MAX_JOURNAL_CHARS || now - timeOf(head) >= api.KEEP_MS)) {
      var dropped = deque.pollFirst();
      if (dropped == null) {
        break;
      }
      total -= String(dropped).length;
      count--;
      head = deque.peekFirst();
    }
  }

  // Journals expired or over MAX_JOURNALS (the least recently written first) leave the store; never the current one.
  function evict(journals, current, now) {
    var ages = [];
    keysOf(journals).forEach(function (key) {
      var deque = journals.get(key);
      var last = deque == null ? null : deque.peekLast();
      var at = last == null ? 0 : timeOf(last);
      if (key !== current && (last == null || now - at >= api.KEEP_MS)) {
        journals.remove(key);
      } else if (key !== current) {
        ages.push({ key: key, at: at });
      }
    });
    ages.sort(function (a, b) { return a.at - b.at; });
    while (ages.length && ages.length + 1 > api.MAX_JOURNALS) {
      journals.remove(ages.shift().key);
    }
  }

  // store: {get(key), set(key, value)} (context.server).
  api.append = function (store, key, entry, now) {
    // context.server has no putIfAbsent: of two first writes at once, one map is kept (as js/mcp_answer_pages.js)
    if (store.get(api.STORE_KEY) == null) {
      store.set(api.STORE_KEY, api.host.newMap());
    }
    var journals = store.get(api.STORE_KEY);
    var deque = journals.get(key);
    if (deque == null) {
      var fresh = api.host.newDeque();
      var prior = journals.putIfAbsent(key, fresh);
      deque = prior == null ? fresh : prior;
    }
    var serialized = { t: now };
    for (var field in entry) {
      if (field !== "t") {
        serialized[field] = entry[field];
      }
    }
    deque.addLast(JSON.stringify(serialized));
    trim(deque, now);
    evict(journals, key, now);
  };

  // {entries (oldest first), full: the journal holds MAX_ENTRIES and older ones may be gone}
  api.read = function (store, key, now) {
    var journals = store ? store.get(api.STORE_KEY) : null;
    var deque = journals == null ? null : journals.get(key);
    if (deque == null) {
      return { entries: [], full: false };
    }
    var entries = [];
    var items = itemsOf(deque);
    items.forEach(function (item) {
      if (now - timeOf(item) < api.KEEP_MS) {
        try {
          entries.push(JSON.parse(item));
        } catch (_unreadable) {}
      }
    });
    entries.sort(function (a, b) { return a.t - b.t; });
    return { entries: entries, full: items.length >= api.MAX_ENTRIES };
  };

  // The QNames this conversation (else this bearer) created through the MCP, for the tools that tell a new object from one
  // that existed before (js/requestable_contract.js). [] when unknown; never throws.
  api.createdQNames = function (contextObject) {
    try {
      var store = contextObject ? contextObject.server : null;
      if (store == null) {
        return [];
      }
      var read = api.read(store, api.keyOf(contextObject, "").key, api.host.now());
      var out = [];
      read.entries.forEach(function (entry) {
        (entry.objects || []).forEach(function (o) {
          if (o && o.c === "created" && typeof o.q === "string" && out.indexOf(o.q) < 0) {
            out.push(o.q);
          }
        });
      });
      return out;
    } catch (_unknownJournal) {
      return [];
    }
  };

  // How many distinct objects of a project this conversation (else this bearer) wrote: created, changed, moved, renamed or
  // deleted. 0 when unknown.
  api.changedCount = function (contextObject, project) {
    try {
      var store = contextObject ? contextObject.server : null;
      var name = text(project);
      if (store == null || !name.length) {
        return 0;
      }
      var seen = {};
      var count = 0;
      api.read(store, api.keyOf(contextObject, "").key, api.host.now()).entries.forEach(function (entry) {
        (entry.objects || []).forEach(function (o) {
          var q = o && typeof o.q === "string" ? o.q : "";
          if ((q === name || q.indexOf(name + ".") === 0) && !seen[q]) {
            seen[q] = true;
            count++;
          }
        });
      });
      return count;
    } catch (_unknownChanges) {
      return 0;
    }
  };

  // How many runs of a requestable this conversation (else this bearer) recorded, with requestable-execute. 0 when unknown.
  api.runCount = function (contextObject, requestable) {
    try {
      var store = contextObject ? contextObject.server : null;
      var wanted = text(requestable);
      if (store == null || !wanted.length) {
        return 0;
      }
      var count = 0;
      api.read(store, api.keyOf(contextObject, "").key, api.host.now()).entries.forEach(function (entry) {
        if (entry.run && text(entry.run.r) === wanted) {
          count++;
        }
      });
      return count;
    } catch (_unknownRuns) {
      return 0;
    }
  };

  // mcp_endpoint after a tool answer (journalAfterToolCall) and batch-call after each of its writes. Never throws.
  // options: {conversationId (the router's, already checked), via}
  api.recordCall = function (contextObject, sequence, answer, args, options) {
    try {
      var opts = options || {};
      var entry = api.entryOf(String(sequence || ""), answer, args, { via: opts.via, host: api.host });
      var store = contextObject ? contextObject.server : null;
      if (!entry || store == null) {
        return null;
      }
      api.append(store, api.keyOf(contextObject, opts.conversationId).key, entry, api.host.now());
      return entry;
    } catch (journalError) {
      api.host.warn("write journal: " + journalError);
      return null;
    }
  };

  // ---- project-changes -------------------------------------------------------------------------------------------

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function day(t) {
    var d = new Date(t);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }

  function clock(t) {
    var d = new Date(t);
    return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds()) + "Z";
  }

  api.time = function (t) {
    return day(t) + " " + clock(t);
  };

  function span(first, last) {
    if (first === last) {
      return "at " + api.time(first);
    }
    return api.time(first) + " to " + (day(first) === day(last) ? clock(last) : api.time(last));
  }

  function line(value) {
    return value.length > api.MAX_LINE ? value.substring(0, api.MAX_LINE - 1) + "…" : value;
  }

  // The objects, as the calls left them: a rename or a move carries what was under the object to its new QName.
  function replay(entries) {
    var states = {};
    function keyOf(kind, q) {
      return kind + "\n" + q;
    }
    function state(o) {
      var key = keyOf(o.k || "", o.q);
      if (!states[key]) {
        states[key] = { k: o.k || "", q: o.q, pr: o.pr || "", entries: {}, details: [] };
      }
      return states[key];
    }
    function carry(from, to) {
      Object.keys(states).forEach(function (key) {
        var s = states[key];
        if (s.k || !(s.q === from || under(s.q, from))) {
          return;
        }
        var q = to + s.q.substring(from.length);
        delete states[key];
        var other = states[keyOf("", q)];
        if (other) {
          ["created", "changed", "deleted", "reordered"].forEach(function (flag) { other[flag] = other[flag] || s[flag]; });
          other.renamedFrom = other.renamedFrom || s.renamedFrom;
          other.movedFrom = other.movedFrom || s.movedFrom;
          for (var index in s.entries) {
            other.entries[index] = true;
          }
          other.details = other.details.concat(s.details);
        } else {
          s.q = q;
          states[keyOf("", q)] = s;
        }
      });
    }
    entries.forEach(function (entry, index) {
      (entry.objects || []).forEach(function (o) {
        var s;
        if (o.c === "renamed" && o.p && o.p !== o.q) {
          s = state({ q: o.p });
          if (!s.created && !s.renamedFrom) {
            s.renamedFrom = o.p;
          }
          carry(o.p, o.q);
          s = state(o);
        } else if (o.c === "moved") {
          var previous = o.fp && parentOf(o.q) !== o.fp ? o.fp + "." + o.q.substring(o.q.lastIndexOf(".") + 1) : "";
          if (previous.length) {
            s = state({ q: previous });
            if (!s.created && !s.movedFrom) {
              s.movedFrom = o.fp;
            }
            carry(previous, o.q);
            s = state(o);
          } else {
            s = state(o);
            s.reordered = true;
          }
        } else {
          s = state(o);
          if (o.c === "created") {
            if (s.deleted && !s.created) {
              // deleted, then made again: the object of the project was replaced
              s.deleted = false;
              s.changed = true;
            } else {
              s.created = true;
              s.deleted = false;
            }
          } else if (o.c === "deleted") {
            s.deleted = true;
            if (!o.k) {
              Object.keys(states).forEach(function (key) {
                if (!states[key].k && under(states[key].q, o.q)) {
                  states[key].deleted = true;
                }
              });
            }
          } else {
            s.changed = true;
          }
        }
        s.entries[index] = true;
        if (o.d && s.details.indexOf(o.d) < 0 && s.details.length < 4) {
          s.details.push(o.d);
        }
        if (!s.pr && o.pr) {
          s.pr = o.pr;
        }
      });
    });
    return Object.keys(states).map(function (key) {
      var s = states[key];
      s.project = s.pr || (s.k === "file" ? s.q.split("/")[0] : projectOf(s.q));
      return s;
    });
  }

  // An object folds into the nearest object listed above it when it is part of it: everything under a new object (but
  // what was moved there), what was deleted with its parent, a change under an object that changed. A deletion, a rename
  // or a move under an existing object keeps its own line.
  function fold(states) {
    var objects = states.filter(function (s) { return !s.k; });
    var byQName = {};
    objects.forEach(function (s) { byQName[s.q] = s; });
    objects.sort(function (a, b) { return a.q.length - b.q.length; });
    objects.forEach(function (s) {
      var parent = parentOf(s.q);
      var a = null;
      while (parent.length && parent.indexOf(".") > 0 && !a) {
        a = byQName[parent] || null;
        parent = parentOf(parent);
      }
      if (!a) {
        return;
      }
      var top = a.into || a;
      var onlyChanged = !s.created && !s.deleted && !s.renamedFrom && !s.movedFrom && !s.reordered;
      var folds = (a.deleted && s.deleted) ||
        (a.created && !a.deleted && !s.movedFrom) ||
        (!a.created && !a.deleted && !a.renamedFrom && !a.movedFrom && onlyChanged);
      if (folds) {
        s.into = top;
        top.inside = (top.inside || 0) + 1 + (s.inside || 0);
        for (var index in s.entries) {
          top.entries[index] = true;
        }
      }
    });
    return states.filter(function (s) { return !s.into; });
  }

  function stateText(s) {
    var parts = [];
    if (s.created && s.deleted) {
      parts.push("created then deleted");
    } else if (s.created) {
      parts.push("created");
    } else if (s.deleted) {
      parts.push("deleted");
    } else {
      // renamed back to its first name: no rename left
      if (s.renamedFrom && s.renamedFrom !== s.q) {
        parts.push("renamed from " + s.renamedFrom);
      }
      if (s.movedFrom && s.movedFrom !== parentOf(s.q)) {
        parts.push("moved from " + s.movedFrom);
      }
      if (s.reordered && !s.movedFrom) {
        parts.push("reordered");
      }
      if (s.changed || !parts.length) {
        parts.push("changed");
      }
    }
    var out = parts.join(", ");
    if (s.details.length) {
      out += " (" + s.details.join(", ") + ")";
    }
    if (s.inside) {
      out += " (+" + s.inside + " inside)";
    }
    return out;
  }

  function group(s) {
    if (s.created && s.deleted) {
      return 5;
    }
    if (s.deleted) {
      return 0;
    }
    if (s.created) {
      return 4;
    }
    if (s.renamedFrom || s.movedFrom || s.reordered) {
      return 1;
    }
    return s.k && s.k !== "file" ? 3 : 2;
  }

  function labelOf(s) {
    if (s.k === "project") {
      return s.q + " (project)";
    }
    if (s.k === "job") {
      return "scheduler job " + s.q + (s.pr ? " (" + s.pr + ")" : "");
    }
    if (s.k === "form") {
      return s.q + " (No Code)";
    }
    return s.q;
  }

  function usage(s, entries) {
    var counts = {};
    var order = [];
    var first = 0;
    var last = 0;
    Object.keys(s.entries).map(Number).sort(function (a, b) { return a - b; }).forEach(function (index) {
      var entry = entries[index];
      if (!counts[entry.tool]) {
        counts[entry.tool] = 0;
        order.push(entry.tool);
      }
      counts[entry.tool]++;
      first = first || entry.t;
      last = entry.t;
    });
    return order.map(function (tool) { return tool + " x" + counts[tool]; }).join(", ") + "; " + span(first, last);
  }

  // The answer of project-changes over the entries of a journal. options: {scope, project, since, full}
  // A name an agent gives to an object it means to delete: a probe, a test, a scratch copy. A run stopped at its time cap
  // left six probe transactions (zz_probe, zz_p_*) in an application's connector (17/11).
  api.TEMPORARY_NAME = /^(zz|tmp|temp|scratch|probe|test|essai)(_|\d|$)|(^|_)(probe|tmp|scratch)(_|\d|$)/i;

  api.summarize = function (entries, options) {
    var opts = options || {};
    var project = text(opts.project);
    var since = Number(opts.since) || 0;
    var considered = entries.filter(function (e) { return !since || e.t >= since; });
    var states = replay(considered.map(function (e) { return { tool: e.tool, objects: e.objects || [], t: e.t }; }));
    // the runs, per requestable
    var runs = {};
    considered.forEach(function (e) {
      if (!e.run || !e.run.r) {
        return;
      }
      var r = runs[e.run.r] || (runs[e.run.r] = { r: e.run.r, runs: 0, errors: 0, last: 0, ok: true });
      r.runs++;
      if (!e.run.ok) {
        r.errors++;
      }
      r.last = e.t;
      r.ok = e.run.ok === true;
    });
    var runList = Object.keys(runs).map(function (key) { return runs[key]; }).filter(function (r) {
      return !project.length || projectOf(r.r) === project;
    });
    states = states.filter(function (s) { return !project.length || s.project === project; });
    var shown = fold(states);
    var objects = shown.filter(function (s) { return s.k !== "file"; });
    var files = shown.filter(function (s) { return s.k === "file"; });
    var sortStates = function (a, b) {
      return group(a) - group(b) || (labelOf(a) < labelOf(b) ? -1 : labelOf(a) > labelOf(b) ? 1 : 0);
    };
    objects.sort(sortStates);
    files.sort(sortStates);
    runList.sort(function (a, b) { return b.errors - a.errors || (a.r < b.r ? -1 : 1); });
    var used = {};
    considered.forEach(function (e, index) {
      if (e.run ? (!project.length || projectOf(e.run.r) === project) : states.some(function (s) { return s.entries[index]; })) {
        used[index] = true;
      }
    });
    var times = Object.keys(used).map(function (index) { return considered[Number(index)].t; });

    var answer = { scope: opts.scope === "conversation" ? "conversation" : "token" };
    if (project.length) {
      answer.project = project;
    }
    if (since) {
      answer.since = api.time(since);
    }
    answer.calls = Object.keys(used).length;
    if (times.length) {
      answer.from = api.time(Math.min.apply(null, times));
      answer.to = api.time(Math.max.apply(null, times));
    }
    answer.objects = objects.map(function (s) { return line(labelOf(s) + ": " + stateText(s) + "; " + usage(s, considered)); });
    answer.files = files.map(function (s) { return line(s.q + ": " + stateText(s) + "; " + usage(s, considered)); });
    // Objects this conversation created that are still there and named as a probe: delete them, or say why they stay.
    var temporary = objects.filter(function (s) {
      var last = String(s.q).split(".").pop().replace(/^[a-z]{2,3}:/, "");
      return s.created && !s.deleted && api.TEMPORARY_NAME.test(last);
    }).map(function (s) { return labelOf(s); });
    if (temporary.length) {
      answer.temporary = temporary.slice(0, 20);
      answer.temporaryNote = "Created by this conversation, still there, and named as a probe or a test: delete them with " +
        "databaseobject-delete before the final report, unless the user asked for them (an SQL expression is tried with sql-select, " +
        "not with a transaction created for it).";
    }
    answer.runs = runList.map(function (r) {
      return line(r.r + ": " + r.runs + (r.runs > 1 ? " runs, " + r.errors + (r.errors === 1 ? " error" : " errors") + ", the last " : " run, ") +
        (r.ok ? "ok" : "in error") + " at " + api.time(r.last));
    });
    var perProject = {};
    shown.concat(runList.map(function (r) { return { run: true, project: projectOf(r.r) }; })).forEach(function (s) {
      var p = perProject[s.project] || (perProject[s.project] = { objects: 0, files: 0, runs: 0 });
      if (s.run) {
        p.runs++;
      } else if (s.k === "file") {
        p.files++;
      } else {
        p.objects++;
      }
    });
    var plural = function (n, word) {
      return n + " " + word + (n === 1 ? "" : "s");
    };
    answer.projects = Object.keys(perProject).sort().map(function (p) {
      var c = perProject[p];
      return line(p + ": " + plural(c.objects, "object") + ", " + plural(c.files, "file") + ", " + plural(c.runs, "run"));
    });
    if (!answer.objects.length && !answer.files.length && !answer.runs.length) {
      answer.note = "No write and no run recorded through the MCP" + (project.length ? " for " + project : "") +
        (since ? " since " + answer.since : "") + " in this " + (answer.scope === "conversation" ? "conversation" : "token's calls") + ".";
    }
    var unlisted = 0;
    Object.keys(used).forEach(function (index) {
      unlisted += Number(considered[Number(index)].more) || 0;
    });
    if (unlisted > 0) {
      answer.notListed = unlisted + " more object" + (unlisted === 1 ? "" : "s") + " of large calls (inside the objects they created " +
        "or changed) are not listed one by one.";
    }
    if (opts.full === true) {
      answer.kept = "Only the last " + api.MAX_ENTRIES + " writes are kept: older ones are not listed.";
    }
    answer.howToUse = api.HOW_TO_USE;
    return api.bound(answer);
  };

  function size(answer) {
    return JSON.stringify(answer, null, 2).length;
  }

  // Under BUDGET: the runs and the files first keep at most 40 and 30 lines, then the objects as many as fit (the most
  // telling first), then the others; what is left out is counted.
  api.bound = function (answer) {
    var omitted = {};
    var all = { objects: answer.objects, files: answer.files, runs: answer.runs, projects: answer.projects };
    function keep(name, count) {
      answer[name] = all[name].slice(0, count);
      var left = all[name].length - answer[name].length;
      if (left > 0) {
        omitted[name] = left;
      } else {
        delete omitted[name];
      }
      answer.omitted = omitted;
      if (!Object.keys(omitted).length) {
        delete answer.omitted;
      }
    }
    function fit(name) {
      if (size(answer) <= api.BUDGET) {
        return;
      }
      var low = 0;
      var high = answer[name].length;
      while (low < high) {
        var mid = Math.ceil((low + high) / 2);
        keep(name, mid);
        if (size(answer) <= api.BUDGET) {
          low = mid;
        } else {
          high = mid - 1;
        }
      }
      keep(name, low);
    }
    if (size(answer) > api.BUDGET) {
      answer.omitted = omitted;
      answer.more = "Lines left out to stay short (counted in omitted): call project-changes again with project or since.";
      keep("runs", Math.min(all.runs.length, 40));
      keep("files", Math.min(all.files.length, 30));
      keep("projects", Math.min(all.projects.length, 30));
      ["objects", "runs", "files", "projects"].forEach(fit);
      if (!answer.omitted) {
        delete answer.more;
      }
    }
    // the help goes last, where a reader ends
    var howToUse = answer.howToUse;
    delete answer.howToUse;
    answer.howToUse = howToUse;
    return answer;
  };

  // project-changes: the journal of the caller's conversation, or of its bearer.
  api.execute = function (contextObject, params) {
    if (C8O.mcpAuth && typeof C8O.mcpAuth.authenticateRequest === "function") {
      var auth = C8O.mcpAuth.authenticateRequest(contextObject);
      if (!auth || auth.authenticated !== true) {
        throw new Error("A Convertigo MCP bearer token is required");
      }
    }
    var p = params || {};
    var project = given(p.project);
    var sinceText = given(p.since);
    var since = 0;
    if (sinceText.length) {
      since = /^\d+(\.0+)?$/.test(sinceText) ? Number(sinceText) : Date.parse(sinceText);
      if (!(since >= 0)) {
        throw new Error("since must be a time in milliseconds since 1970 (such as 1795000000000), or empty for the whole journal.");
      }
    }
    var who = api.keyOf(contextObject, "");
    var now = api.host.now();
    var journal = api.read(contextObject ? contextObject.server : null, who.key, now);
    return api.summarize(journal.entries, { scope: who.scope, project: project, since: since, full: journal.full });
  };
})();
