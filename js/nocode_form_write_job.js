/*
 * nocode-form-edit, nocode-form-update and nocode-form-create within the time an agent waits for a tool call. On the
 * 5.6 MB application of the Pilotage KPI import (test-nocode, 23/11) an edit timed out on the client side while it went on
 * and saved revision 5: an agent that retried would have applied its operations twice. A creation retried after a timeout
 * made a second form (« Candidature emploi », 19/11). Agent hosts stop a tool call after about a minute (Vibe's
 * run_typescript, Codex), and the sequences of the tools answered at their 60 s response timeout.
 *
 * The write runs in a thread of its own; the call waits for it CALL_BUDGET_MS at most. Past it, it answers status running
 * with the id of the write (editId, updateId or createId), and the same tool called with that id alone waits for the same
 * write again: its answer, once done, is the one the write would have given. The same write sent again (same operations
 * or patch on the same form, same reduced form for a creation) while it runs, or after it ended without its answer
 * reaching the caller, joins it instead of writing again. The thread calls C8Oforms through an internal request of its
 * own, whose session it authenticates with the bearer of the call: the engine invalidates the session of an MCP request
 * when the call answers ("Session request-... is invalidated", measured on a headless 8.5 engine, 23/11), so a copy of
 * the request of the call failed after it. A write is kept KEEP_MS for its caller only: the digest of the bearer of the
 * call binds it.
 * C8O.nocodeFormWriteJob.run(params, host) holds the logic; javaHost(context) gives it the engine, a test gives its own.
 */
if (typeof C8O === "undefined") { var C8O = {}; }
C8O.nocodeFormWriteJob = C8O.nocodeFormWriteJob || {};

(function (api) {
  var STORE_KEY = "lib_ConvertigoMCP.nocodeFormWrites.v1";
  var CALL_BUDGET_MS = 38000;
  var POLL_MS = 250;
  var KEEP_MS = 30 * 60000;
  var MAX_WRITES = 200;

  // What each tool writes, the name of the id of a write, and what the agent must not send again.
  var KINDS = {
    edit: { tool: "nocode-form-edit", idName: "editId", what: "operations", of: "The edit of this form" },
    update: { tool: "nocode-form-update", idName: "updateId", what: "patch", of: "The update of this form" },
    create: { tool: "nocode-form-create", idName: "createId", what: "reduced form", of: "The creation of this form" }
  };

  api.STORE_KEY = STORE_KEY;
  api.CALL_BUDGET_MS = CALL_BUDGET_MS;
  api.KEEP_MS = KEEP_MS;
  api.KINDS = KINDS;

  function str(value) {
    return value == null ? "" : String(value).replace(/^\s+|\s+$/g, "");
  }

  // The input as one text, keys in order: the same write sent again gives the same text.
  function canonical(value) {
    if (Array.isArray(value)) {
      return "[" + value.map(canonical).join(",") + "]";
    }
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ":" + canonical(value[key]); }).join(",") + "}";
    }
    return JSON.stringify(value === undefined ? null : value);
  }

  function read(writes, jobId) {
    var text = writes.get(jobId);
    if (text == null) {
      return null;
    }
    try {
      return JSON.parse(String(text));
    } catch (_unreadable) {
      return null;
    }
  }

  function write(writes, entry) {
    writes.put(entry.jobId, JSON.stringify(entry));
  }

  // Drops the writes older than KEEP_MS, then the oldest ended ones past MAX_WRITES.
  function prune(writes, now) {
    var ended = [];
    writes.keys().forEach(function (jobId) {
      var entry = read(writes, jobId);
      if (!entry || now - Number(entry.startedAt || 0) > KEEP_MS) {
        writes.remove(jobId);
      } else if (entry.status !== "running") {
        ended.push(entry);
      }
    });
    ended.sort(function (a, b) { return a.startedAt - b.startedAt; });
    while (writes.keys().length > MAX_WRITES && ended.length) {
      writes.remove(ended.shift().jobId);
    }
  }

  // The running write, or the ended one whose answer reached no caller, of this input on this form for this owner.
  function sameWrite(writes, kind, owner, formId, fingerprint) {
    var found = null;
    writes.keys().forEach(function (jobId) {
      var entry = read(writes, jobId);
      if (entry && entry.kind === kind && entry.owner === owner && entry.formId === formId && entry.fingerprint === fingerprint &&
        (entry.status === "running" || entry.delivered !== true) && (!found || entry.startedAt > found.startedAt)) {
        found = entry;
      }
    });
    return found;
  }

  // An exception may come after the save (the read back): whether the write was saved is not known.
  function unknownOutcome(kind, answer) {
    delete answer.saved;
    answer.next = kind === "create"
      ? "The form may have been created before this error: list your forms with nocode-form-list before creating it again."
      : "The change may have been saved before this error: read the form with nocode-form-get (its rev, find a word of the change) before any retry.";
    return answer;
  }

  function start(writes, host, kind, owner, formId, fingerprint, input, options) {
    var startedAt = host.now();
    var entry = {
      jobId: kind + "-" + startedAt + "-" + host.uuid().replace(/-/g, "").substring(0, 8),
      kind: kind,
      owner: owner,
      formId: formId,
      fingerprint: fingerprint,
      status: "running",
      startedAt: startedAt,
      endedAt: 0,
      delivered: false,
      answer: null
    };
    write(writes, entry);
    host.startThread("lib_ConvertigoMCP-nocode-form-" + kind + (formId ? "-" + formId : ""), function () {
      var answer;
      try {
        answer = host.write(kind, formId, input, options);
      } catch (writeError) {
        answer = unknownOutcome(kind, { status: "error", error: { code: kind + "_failed", message: String(writeError && writeError.message ? writeError.message : writeError) } });
      }
      // nocode-form-edit turns its own exceptions into edit_failed
      if (answer && answer.status === "error" && answer.error && answer.error.code === kind + "_failed" && answer.next == null) {
        unknownOutcome(kind, answer);
      }
      var ended = read(writes, entry.jobId) || entry;
      ended.status = "done";
      ended.endedAt = host.now();
      ended.answer = answer;
      write(writes, ended);
    });
    return entry;
  }

  function waitCall(kind, entry) {
    var spec = KINDS[kind];
    var args = (entry.formId ? "id:\"" + entry.formId + "\", " : "") + spec.idName + ":\"" + entry.jobId + "\"";
    return spec.tool + "({" + args + "})";
  }

  function running(kind, entry, host, joined) {
    var spec = KINDS[kind];
    var out = { status: "running" };
    if (entry.formId) {
      out.id = entry.formId;
    }
    out[spec.idName] = entry.jobId;
    out.elapsedMs = Math.max(0, host.now() - entry.startedAt);
    out.message = spec.of + " goes on on the server (a large form takes longer than one tool call). It is written once: do not send the " + spec.what + " again.";
    out.next = "Call " + waitCall(kind, entry) + " to wait for its answer, with no " + spec.what + ".";
    if (joined) {
      out.joined = "The same " + spec.what + " " + (spec.what === "operations" ? "were" : "was") + " already being written (" + spec.idName + " " + entry.jobId + "): this call waits for that write instead of writing again.";
    }
    return out;
  }

  // params: {kind (edit, update or create), id (the form; none for a creation), input (the operations, the patch or the
  // reduced form), jobId (the id of a running write, to wait for it), owner (the digest of the caller's bearer), options}.
  // host: store() -> {get(key), put(key, text), remove(key), keys() -> [keys]}, now(), sleep(ms), uuid(),
  // startThread(name, fn), write(kind, id, input, options) -> the answer of C8O.nocodeForms.edit, update or create.
  api.run = function (params, host) {
    params = params || {};
    var kind = str(params.kind);
    var spec = KINDS[kind];
    if (!spec) {
      throw new Error("Unknown form write: " + kind);
    }
    var formId = kind === "create" ? "" : str(params.id);
    var owner = str(params.owner);
    var askedId = str(params.jobId);
    var writes = host.store();
    var deadline = host.now() + CALL_BUDGET_MS;
    prune(writes, host.now());
    var entry = null;
    var joined = false;
    if (askedId.length) {
      entry = read(writes, askedId);
      if (!entry || entry.kind !== kind || entry.owner !== owner || (formId.length && entry.formId !== formId)) {
        var check = kind === "create"
          ? "List your forms with nocode-form-list: a form of that name may exist; do not create it again before checking."
          : "Read the form with nocode-form-get: its rev says whether the change was saved; do not send the " + spec.what + " again before checking.";
        var refused = { status: "error" };
        if (formId.length) {
          refused.id = formId;
        }
        refused[spec.idName] = askedId;
        refused.error = {
          code: "unknown_write",
          message: "No " + spec.idName + " " + askedId + (formId.length ? " of form " + formId : "") + " for this caller (a write is kept " + Math.round(KEEP_MS / 60000) + " minutes). " + check
        };
        return refused;
      }
      formId = entry.formId;
    } else {
      var fingerprint = canonical(params.input);
      entry = sameWrite(writes, kind, owner, formId, fingerprint);
      joined = !!entry;
      if (!entry) {
        entry = start(writes, host, kind, owner, formId, fingerprint, params.input, params.options || {});
      }
    }
    while (entry && entry.status === "running" && host.now() < deadline) {
      host.sleep(POLL_MS);
      entry = read(writes, entry.jobId) || entry;
    }
    if (entry.status === "running") {
      return running(kind, entry, host, joined);
    }
    entry.delivered = true;
    write(writes, entry);
    var answer = entry.answer && typeof entry.answer === "object" ? entry.answer : unknownOutcome(kind, { status: "error", error: { code: kind + "_failed", message: "The write gave no answer." } });
    if (askedId.length || joined || host.now() - entry.startedAt >= CALL_BUDGET_MS) {
      answer[spec.idName] = entry.jobId;
    }
    if (joined) {
      answer.joined = "The same " + spec.what + " had already been written by a call whose answer did not reach you (" + spec.idName + " " + entry.jobId + "): " + (kind === "create" ? "no second form was created." : "it was not applied again.");
    }
    return answer;
  };

  // The host of the engine. Called in the thread of the tool call: it takes there what the thread needs after the call.
  api.javaHost = function (context) {
    var InternalHttpServletRequest = Packages.com.twinsoft.convertigo.engine.requesters.InternalHttpServletRequest;
    var server = context.server;
    // the store has no putIfAbsent: the first write of the engine creates the map
    if (server.get(STORE_KEY) == null) {
      server.set(STORE_KEY, new java.util.concurrent.ConcurrentHashMap());
    }
    var map = server.get(STORE_KEY);
    // An internal request of the write's own, with its own session (InternalHttpServletRequest keeps the session it
    // creates): the write authenticates it with the bearer given in its options, and it outlives the call.
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
          // the log context of the MCP request does not follow the write into its thread
          try {
            Packages.com.twinsoft.convertigo.engine.util.Log4jHelper.mdcClear();
          } catch (_noLog4jHelper) {}
          fn();
        };
        var thread = new java.lang.Thread(new java.lang.Runnable({ run: run }), String(name));
        thread.setDaemon(true);
        thread.start();
      },
      write: function (kind, id, input, options) {
        if (kind === "create") {
          return C8O.nocodeForms.create(input, options);
        }
        return kind === "update" ? C8O.nocodeForms.update(id, input, options) : C8O.nocodeForms.edit(id, input, options);
      }
    };
  };

  // The digest of the bearer of the call, as the answer pages bind their answers: a write is its caller's only.
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

  // A write tool's argument that asks for nothing: absent, empty, "null", [] or {}.
  api.empty = function (value) {
    if (value == null) {
      return true;
    }
    if (typeof value === "object" && typeof value.getClass !== "function") {
      return Array.isArray(value) ? !value.length : !Object.keys(value).length;
    }
    var text = str(value);
    return text === "" || text === "null" || text === "undefined" || text === "[]" || text === "{}";
  };

  // The id of a running write given to its tool ("" when none: a Convertigo variable left empty can arrive as "null").
  api.jobIdOf = function (value) {
    var text = str(value);
    return text === "null" || text === "undefined" ? "" : text;
  };
})(C8O.nocodeFormWriteJob);
