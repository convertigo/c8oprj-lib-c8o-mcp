/*
 * nocode-form-edit within the time an agent waits for a tool call. On the 5.6 MB application of the Pilotage KPI import
 * (test-nocode, 23/11) an edit timed out on the client side while it went on and saved revision 5: an agent that retried
 * would have applied its operations twice. Agent hosts stop a tool call after about a minute (Vibe's run_typescript,
 * Codex), and the sequence of the tool answered at its 60 s response timeout.
 *
 * The edit runs in a thread of its own; the call waits for it CALL_BUDGET_MS at most. Past it, it answers status running
 * with an editId, and nocode-form-edit({id, editId}) waits for the same edit again: its answer, once done, is the one the
 * edit would have given. The same operations sent again for the same form while that edit runs, or after it ended
 * without its answer reaching the caller, join it instead of applying again. The thread calls C8Oforms through an
 * internal request of its own, whose session it authenticates with the bearer of the call: the engine invalidates the
 * session of an MCP request when the call answers ("Session request-... is invalidated", measured on a headless 8.5
 * engine, 23/11), so a copy of the request of the call failed after it. An edit is kept EDIT_KEEP_MS for its caller only:
 * the digest of the bearer of the call binds it.
 * C8O.nocodeFormEditJob.run(params, host) holds the logic; javaHost(context) gives it the engine, a test gives its own.
 */
if (typeof C8O === "undefined") { var C8O = {}; }
C8O.nocodeFormEditJob = C8O.nocodeFormEditJob || {};

(function (api) {
  var STORE_KEY = "lib_ConvertigoMCP.nocodeFormEdits.v1";
  var CALL_BUDGET_MS = 38000;
  var POLL_MS = 250;
  var EDIT_KEEP_MS = 30 * 60000;
  var MAX_EDITS = 200;

  api.STORE_KEY = STORE_KEY;
  api.CALL_BUDGET_MS = CALL_BUDGET_MS;
  api.EDIT_KEEP_MS = EDIT_KEEP_MS;

  function str(value) {
    return value == null ? "" : String(value).replace(/^\s+|\s+$/g, "");
  }

  // The operations as one text, keys in order: the same edit sent again gives the same text.
  function canonical(value) {
    if (Array.isArray(value)) {
      return "[" + value.map(canonical).join(",") + "]";
    }
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ":" + canonical(value[key]); }).join(",") + "}";
    }
    return JSON.stringify(value === undefined ? null : value);
  }

  function read(edits, editId) {
    var text = edits.get(editId);
    if (text == null) {
      return null;
    }
    try {
      return JSON.parse(String(text));
    } catch (_unreadable) {
      return null;
    }
  }

  function write(edits, entry) {
    edits.put(entry.editId, JSON.stringify(entry));
  }

  // Drops the edits older than EDIT_KEEP_MS, then the oldest ended ones past MAX_EDITS.
  function prune(edits, now) {
    var ended = [];
    edits.keys().forEach(function (editId) {
      var entry = read(edits, editId);
      if (!entry || now - Number(entry.startedAt || 0) > EDIT_KEEP_MS) {
        edits.remove(editId);
      } else if (entry.status !== "running") {
        ended.push(entry);
      }
    });
    ended.sort(function (a, b) { return a.startedAt - b.startedAt; });
    while (edits.keys().length > MAX_EDITS && ended.length) {
      edits.remove(ended.shift().editId);
    }
  }

  // The running edit, or the ended one whose answer reached no caller, of these operations on this form for this owner.
  function sameEdit(edits, owner, formId, fingerprint) {
    var found = null;
    edits.keys().forEach(function (editId) {
      var entry = read(edits, editId);
      if (entry && entry.owner === owner && entry.formId === formId && entry.fingerprint === fingerprint &&
        (entry.status === "running" || entry.delivered !== true) && (!found || entry.startedAt > found.startedAt)) {
        found = entry;
      }
    });
    return found;
  }

  function start(edits, host, owner, formId, fingerprint, operations, options) {
    var startedAt = host.now();
    var entry = {
      editId: "edit-" + startedAt + "-" + host.uuid().replace(/-/g, "").substring(0, 8),
      owner: owner,
      formId: formId,
      fingerprint: fingerprint,
      status: "running",
      startedAt: startedAt,
      endedAt: 0,
      delivered: false,
      answer: null
    };
    write(edits, entry);
    host.startThread("lib_ConvertigoMCP-nocode-form-edit-" + formId, function () {
      var answer;
      try {
        answer = host.edit(formId, operations, options);
      } catch (editError) {
        answer = { status: "error", error: { code: "edit_failed", message: String(editError && editError.message ? editError.message : editError) } };
      }
      if (answer && answer.status === "error" && answer.error && answer.error.code === "edit_failed") {
        // an exception may come after the save (the read back): saved is not known
        delete answer.saved;
        answer.next = "The edit may have been saved before this error: read the form with nocode-form-get (its rev, find a word of the change) before any retry.";
      }
      var ended = read(edits, entry.editId) || entry;
      ended.status = "done";
      ended.endedAt = host.now();
      ended.answer = answer;
      write(edits, ended);
    });
    return entry;
  }

  function running(entry, host, joined) {
    var out = {
      status: "running",
      id: entry.formId,
      editId: entry.editId,
      elapsedMs: Math.max(0, host.now() - entry.startedAt),
      message: "The edit of this form goes on on the server (a large form takes longer than one tool call). Its operations are applied once: do not send them again.",
      next: "Call nocode-form-edit({id:\"" + entry.formId + "\", editId:\"" + entry.editId + "\"}) to wait for its answer, with no operations."
    };
    if (joined) {
      out.joined = "The same operations were already being applied to this form (editId " + entry.editId + "): this call waits for that edit instead of applying them again.";
    }
    return out;
  }

  // params: {id, operations (an array), editId, owner (the digest of the caller's bearer), options}.
  // host: store() -> {get(key), put(key, text), remove(key), keys() -> [keys]}, now(), sleep(ms), uuid(),
  // startThread(name, fn), edit(id, operations, options) -> the answer of C8O.nocodeForms.edit.
  api.run = function (params, host) {
    params = params || {};
    var formId = str(params.id);
    var owner = str(params.owner);
    var askedId = str(params.editId);
    var edits = host.store();
    var deadline = host.now() + CALL_BUDGET_MS;
    prune(edits, host.now());
    var entry = null;
    var joined = false;
    if (askedId.length) {
      entry = read(edits, askedId);
      if (!entry || entry.owner !== owner || (formId.length && entry.formId !== formId)) {
        return {
          status: "error",
          id: formId,
          editId: askedId,
          error: {
            code: "unknown_edit",
            message: "No edit " + askedId + (formId.length ? " of form " + formId : "") + " for this caller (an edit is kept " + Math.round(EDIT_KEEP_MS / 60000) +
              " minutes). Read the form with nocode-form-get: its rev says whether the edit was saved; do not send the operations again before checking."
          }
        };
      }
      formId = entry.formId;
    } else {
      var operations = params.operations;
      var fingerprint = canonical(operations);
      entry = sameEdit(edits, owner, formId, fingerprint);
      joined = !!entry;
      if (!entry) {
        entry = start(edits, host, owner, formId, fingerprint, operations, params.options || {});
      }
    }
    while (entry && entry.status === "running" && host.now() < deadline) {
      host.sleep(POLL_MS);
      entry = read(edits, entry.editId) || entry;
    }
    if (entry.status === "running") {
      return running(entry, host, joined);
    }
    entry.delivered = true;
    write(edits, entry);
    var answer = entry.answer && typeof entry.answer === "object" ? entry.answer : { status: "error", saved: false, error: { code: "edit_failed", message: "The edit gave no answer." } };
    if (askedId.length || joined || host.now() - entry.startedAt >= CALL_BUDGET_MS) {
      answer.editId = entry.editId;
    }
    if (joined) {
      answer.joined = "The same operations had already been applied to this form by an edit whose answer did not reach you (editId " + entry.editId + "): they were not applied again.";
    }
    return answer;
  };

  // The host of the engine. Called in the thread of the tool call: it takes there what the thread needs after the call.
  api.javaHost = function (context) {
    var InternalHttpServletRequest = Packages.com.twinsoft.convertigo.engine.requesters.InternalHttpServletRequest;
    var server = context.server;
    // the store has no putIfAbsent: the first edit of the engine creates the map
    if (server.get(STORE_KEY) == null) {
      server.set(STORE_KEY, new java.util.concurrent.ConcurrentHashMap());
    }
    var map = server.get(STORE_KEY);
    // An internal request of the edit's own, with its own session (InternalHttpServletRequest keeps the session it creates):
    // the edit authenticates it with the bearer given in its options, and it outlives the call.
    var detached = new InternalHttpServletRequest();
    return {
      detachedRequest: detached,
      store: function () {
        return {
          get: function (key) { return map.get(key); },
          put: function (key, text) { map.put(key, text); },
          remove: function (key) { map.remove(key); },
          keys: function () {
            var keys = [];
            var it = map.keySet().iterator();
            while (it.hasNext()) {
              keys.push(String(it.next()));
            }
            return keys;
          }
        };
      },
      now: function () { return Number(java.lang.System.currentTimeMillis()); },
      sleep: function (ms) { try { java.lang.Thread.sleep(ms); } catch (_interrupted) {} },
      uuid: function () { return String(java.util.UUID.randomUUID()); },
      startThread: function (name, fn) {
        var run = function () {
          // the log context of the MCP request does not follow the edit into its thread
          try {
            Packages.com.twinsoft.convertigo.engine.util.Log4jHelper.mdcClear();
          } catch (_noLog4jHelper) {}
          fn();
        };
        var thread = new java.lang.Thread(new java.lang.Runnable({ run: run }), String(name));
        thread.setDaemon(true);
        thread.start();
      },
      edit: function (id, operations, options) {
        return C8O.nocodeForms.edit(id, operations, options);
      }
    };
  };

  // The digest of the bearer of the call, as the answer pages bind their answers: an edit is its caller's only.
  api.owner = function (token) {
    var text = str(token);
    if (!text.length) {
      return "";
    }
    var digest = java.security.MessageDigest.getInstance("SHA-256").digest(new java.lang.String(text).getBytes("UTF-8"));
    var hex = "";
    for (var i = 0; i < digest.length; i++) {
      hex += ("0" + ((digest[i] + 256) % 256).toString(16)).slice(-2);
    }
    return hex;
  };
})(C8O.nocodeFormEditJob);
