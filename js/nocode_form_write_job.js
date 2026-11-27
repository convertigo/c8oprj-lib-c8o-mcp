/*
 * The No Code writes within the time an agent waits for a tool call: nocode-form-edit, nocode-form-update,
 * nocode-form-create, nocode-app-create, nocode-baserow-schema-apply (mode apply) and nocode-form-publish (confirm), and the
 * read of nocode-baserow-schema-get, which reads every table asked and, on demand, its rows (KINDS[kind].read: nothing
 * is written, a read that cannot be found is made again, and its answer leaves the store once given). On the
 * 5.6 MB application of the Pilotage KPI import (test-nocode, 23/11) an edit timed out on the client side while it went on
 * and saved revision 5: an agent that retried would have applied its operations twice. A creation retried after a timeout
 * made a second form (« Candidature emploi », 19/11). Agent hosts stop a tool call after about a minute (Vibe's
 * run_typescript, Codex), and the sequences of the tools answered at their response timeout.
 *
 * The write runs in a thread of its own; the call waits for it CALL_BUDGET_MS at most. Past it, it answers status running
 * with the id of the write (KINDS[kind].idName), and the same tool called with that id alone waits for the same write
 * again: its answer, once done, is the one the write would have given. The same write sent again (same input on the same
 * form, or the same input for a creation or a schema) while it runs, or after it ended without its answer reaching the
 * caller, joins it instead of writing again. The thread calls C8Oforms and the no-code database through an internal
 * request of its own, whose session it authenticates with the bearer of the call: the engine invalidates the session of an
 * MCP request when the call answers ("Session request-... is invalidated", measured on a headless 8.5 engine, 23/11), so a
 * copy of the request of the call failed after it. A write is kept KEEP_MS for its caller only: the digest of the bearer
 * of the call binds it.
 * A creation (KINDS[kind].repeat) is not made twice either once its answer reached its caller: the same input sent again
 * by the same caller within REPEAT_MS answers the form it made (repeated), while that form still exists. On test-nocode
 * (26/11) an agent got the answer of nocode-form-create as one page of partialAnswer (js/mcp_answer_pages.js), read
 * r.status and r.id on it, found them empty and sent the same creation 10 s later: a second « Test modale » was made.
 * A form made on purpose with the same content takes another name, which makes it another input.
 * C8O.nocodeFormWriteJob.run(params, host) holds the logic; javaHost(context) gives it the engine, a test gives its own.
 */
if (typeof C8O === "undefined") { var C8O = {}; }
C8O.nocodeFormWriteJob = C8O.nocodeFormWriteJob || {};

(function (api) {
  var STORE_KEY = "lib_ConvertigoMCP.nocodeFormWrites.v1";
  var CALL_BUDGET_MS = 38000;
  var POLL_MS = 250;
  var KEEP_MS = 30 * 60000;
  // a creation sent again within it answers the form already made; an agent's retry comes seconds or minutes later
  var REPEAT_MS = 10 * 60000;
  var MAX_WRITES = 200;

  var GET_CHECK = "read the form with nocode-form-get (its rev, find a word of the change)";
  var LIST_CHECK = "list your forms with nocode-form-list";
  var APP_CHECK = "list your forms with nocode-form-list and the bases with nocode-baserow-catalog-list";
  var BASE_CHECK = "read the base with nocode-baserow-catalog-list, and its rows with nocode-baserow-rows-list";
  // Per tool: the id of a write (idName), whether it writes an existing form (form), what it writes (noun), what the
  // agent must not send again (input), the code of an exception in the thread (failCode), what a write that failed or
  // cannot be found may have done (maybe) and how to check it (check), what a retry did not do (once).
  var KINDS = {
    edit: { tool: "nocode-form-edit", idName: "editId", form: true, noun: "edit", input: "operations", failCode: "edit_failed",
      maybe: "The change may have been saved", check: GET_CHECK, once: "it was not applied again." },
    update: { tool: "nocode-form-update", idName: "updateId", form: true, noun: "update", input: "patch", failCode: "update_failed",
      maybe: "The change may have been saved", check: GET_CHECK, once: "it was not applied again." },
    create: { tool: "nocode-form-create", idName: "createId", form: false, noun: "creation", input: "reduced form", failCode: "create_failed",
      maybe: "The form may have been created", check: LIST_CHECK, once: "no second form was created.",
      repeat: "To make another form with the same content on purpose, give it another name." },
    app: { tool: "nocode-app-create", idName: "createId", form: false, noun: "creation of the application", input: "spec", failCode: "app_create_failed",
      maybe: "The application or its tables may have been created", check: APP_CHECK, once: "no second application was created.",
      repeat: "To make another application with the same content on purpose, give it another name." },
    schema: { tool: "nocode-baserow-schema-apply", idName: "applyId", form: false, noun: "apply of the schema", input: "schema", failCode: "baserow_schema_apply_failed",
      maybe: "Part of the schema or of its rows may have been written", check: BASE_CHECK, once: "it was not applied again." },
    publish: { tool: "nocode-form-publish", idName: "publishId", form: true, noun: "publication", input: "confirm", again: "do not publish it again", failCode: "publish_failed",
      // its input schema asks for rev and confirm: the call that waits gives them back, with the publishId it never publishes
      waitArgs: function (input) { return { rev: input && input.rev != null ? String(input.rev) : "", confirm: true }; },
      waitNote: ": with the publishId it waits and never publishes again",
      maybe: "The form may have been published", check: "read the form with nocode-form-get", once: "it was not published again." },
    // a read: its retry joins it instead of reading every table again, and a read that cannot be found is simply made again
    describe: { tool: "nocode-baserow-schema-get", idName: "describeId", form: false, read: true, noun: "read of the schema", input: "tables",
      again: "a call with the same arguments waits for it too", failCode: "baserow_schema_get_failed",
      check: "call nocode-baserow-schema-get again with the same arguments", once: "the tables were not read again." }
  };

  api.STORE_KEY = STORE_KEY;
  api.CALL_BUDGET_MS = CALL_BUDGET_MS;
  api.KEEP_MS = KEEP_MS;
  api.REPEAT_MS = REPEAT_MS;
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

  // The latest creation of this input by this owner whose answer reached it within REPEAT_MS and saved a form.
  function madeWrite(writes, kind, owner, fingerprint, now) {
    var found = null;
    writes.keys().forEach(function (jobId) {
      var entry = read(writes, jobId);
      var answer = entry && entry.answer;
      if (entry && entry.kind === kind && entry.owner === owner && entry.fingerprint === fingerprint && entry.status === "done" &&
        entry.delivered === true && now - Number(entry.endedAt || entry.startedAt || 0) <= REPEAT_MS && answer && typeof answer === "object" &&
        answer.saved === true && str(answer.id).length && (!found || entry.startedAt > found.startedAt)) {
        found = entry;
      }
    });
    return found;
  }

  // The answer of a creation sent again: the one it got, or, when its form changed since, where it stands now.
  function repeatedAnswer(kind, entry, current, host) {
    var spec = KINDS[kind];
    var made = entry.answer;
    var seconds = Math.max(0, Math.round((host.now() - Number(entry.endedAt || entry.startedAt)) / 1000));
    var note = "The same " + spec.noun + " was made " + seconds + " s ago (" + spec.idName + " " + entry.jobId + ", form " + made.id +
      "): " + spec.once + " " + spec.repeat;
    var currentRev = current && current.rev ? String(current.rev) : "";
    var answer;
    if (currentRev.length && currentRev !== str(made.rev)) {
      answer = { status: made.status, saved: true, id: made.id, rev: currentRev };
      answer.next = "The form changed since (rev " + currentRev + "): read it with nocode-form-get before changing it.";
    } else {
      answer = JSON.parse(JSON.stringify(made));
    }
    answer[spec.idName] = entry.jobId;
    answer.repeated = note;
    return answer;
  }

  // An exception may come after the save (the read back): whether the write was saved is not known. A read wrote nothing.
  function unknownOutcome(kind, answer) {
    var spec = KINDS[kind];
    if (spec.read) {
      answer.next = "Nothing was written: " + spec.check + ".";
      return answer;
    }
    delete answer.saved;
    answer.next = spec.maybe + " before this error: " + spec.check + " before any retry.";
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
    if (KINDS[kind].waitArgs) {
      entry.waitArgs = KINDS[kind].waitArgs(input);
    }
    write(writes, entry);
    host.startThread("lib_ConvertigoMCP-nocode-" + kind + (formId ? "-" + formId : ""), function () {
      var answer;
      try {
        answer = host.write(kind, formId, input, options);
      } catch (writeError) {
        answer = unknownOutcome(kind, { status: "error", error: { code: KINDS[kind].failCode, message: String(writeError && writeError.message ? writeError.message : writeError) } });
      }
      // nocode-form-edit turns its own exceptions into edit_failed
      if (kind === "edit" && answer && answer.status === "error" && answer.error && answer.error.code === "edit_failed" && answer.next == null) {
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

  // What the agent must not do while the write runs or before checking a write it cannot find.
  function again(spec) {
    return spec.again || "do not send the " + spec.input + " again";
  }

  function waitCall(kind, entry) {
    var spec = KINDS[kind];
    var parts = [];
    if (entry.formId) {
      parts.push("id:" + JSON.stringify(entry.formId));
    }
    var extra = entry.waitArgs || {};
    Object.keys(extra).forEach(function (key) {
      parts.push(key + ":" + JSON.stringify(extra[key]));
    });
    parts.push(spec.idName + ":" + JSON.stringify(entry.jobId));
    return spec.tool + "({" + parts.join(", ") + "})";
  }

  function running(kind, entry, host, joined) {
    var spec = KINDS[kind];
    var out = { status: "running" };
    if (entry.formId) {
      out.id = entry.formId;
    }
    out[spec.idName] = entry.jobId;
    out.elapsedMs = Math.max(0, host.now() - entry.startedAt);
    out.message = "The " + spec.noun + " goes on on the server (it takes longer than one tool call)" + (spec.read ? ": " : " and is made once: ") + again(spec) + ".";
    out.next = "Call " + waitCall(kind, entry) + " to wait for its answer" + (spec.waitNote || ", with no " + spec.input) + ".";
    if (joined) {
      out.joined = "The same " + spec.noun + " was already running (" + spec.idName + " " + entry.jobId + "): this call waits for it instead of " + (spec.read ? "reading" : "writing") + " again.";
    }
    return out;
  }

  // params: {kind (a key of KINDS), id (the form of an edit, an update or a publication), input (what the write applies:
  // it identifies a retry; never the bearer), jobId (the id of a running write, to wait for it), owner (the digest of the
  // caller's bearer), options (passed to the write, the bearer included)}.
  // host: store() -> {get(key), put(key, text), remove(key), keys() -> [keys]}, now(), sleep(ms), uuid(),
  // startThread(name, fn), write(kind, id, input, options) -> the answer of the tool.
  api.run = function (params, host) {
    params = params || {};
    var kind = str(params.kind);
    var spec = KINDS[kind];
    if (!spec) {
      throw new Error("Unknown form write: " + kind);
    }
    var formId = spec.form ? str(params.id) : "";
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
        var refused = { status: "error" };
        if (formId.length) {
          refused.id = formId;
        }
        refused[spec.idName] = askedId;
        refused.error = spec.read ? {
          code: "unknown_read",
          message: "No " + spec.idName + " " + askedId + " for this caller (a read is kept " + Math.round(KEEP_MS / 60000) + " minutes, until its answer is given). Nothing was written: " + spec.check + "."
        } : {
          code: "unknown_write",
          message: "No " + spec.idName + " " + askedId + (formId.length ? " of form " + formId : "") + " for this caller (a write is kept " + Math.round(KEEP_MS / 60000) + " minutes). " +
            spec.maybe + ": " + spec.check + "; " + again(spec) + " before checking."
        };
        return refused;
      }
      formId = entry.formId;
    } else {
      var fingerprint = canonical(params.input);
      entry = sameWrite(writes, kind, owner, formId, fingerprint);
      joined = !!entry;
      if (!entry && spec.repeat && owner.length) {
        var made = madeWrite(writes, kind, owner, fingerprint, host.now());
        // the form it made still exists (or cannot be checked): it is answered again; one deleted since is made anew
        var current = made && typeof host.current === "function" ? host.current(kind, made.answer, params.options || {}) : null;
        if (made && !(current && current.exists === false)) {
          return repeatedAnswer(kind, made, current, host);
        }
      }
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
    if (spec.read) {
      // a read answered is done with: a later call reads again, and a large answer does not stay in the store
      writes.remove(entry.jobId);
    } else {
      write(writes, entry);
    }
    var answer = entry.answer && typeof entry.answer === "object" ? entry.answer : unknownOutcome(kind, { status: "error", error: { code: spec.failCode, message: "The write gave no answer." } });
    if (askedId.length || joined || host.now() - entry.startedAt >= CALL_BUDGET_MS) {
      answer[spec.idName] = entry.jobId;
    }
    if (joined) {
      answer.joined = "The same " + spec.noun + " had already been made by a call whose answer did not reach you (" + spec.idName + " " + entry.jobId + "): " + spec.once;
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
      // Whether the form a creation made still exists, and its rev: {exists, rev}, or null when it cannot be told.
      current: function (kind, answer, options) {
        try {
          var got = C8O.nocodeForms.get(String(answer.id), options);
          if (got && got._id) {
            return { exists: true, rev: got._rev == null ? "" : String(got._rev) };
          }
          return got && got.status === "unavailable" ? { exists: false } : null;
        } catch (_unchecked) {
          return null;
        }
      },
      write: function (kind, id, input, options) {
        var merged = function () {
          var out = {};
          [input, options].forEach(function (part) { Object.keys(part || {}).forEach(function (key) { out[key] = part[key]; }); });
          return out;
        };
        switch (kind) {
          case "create": return C8O.nocodeForms.create(input, options);
          case "update": return C8O.nocodeForms.update(id, input, options);
          case "app": return C8O.nocodeApp.create(input, options);
          case "schema": return C8O.nocodeBaserow.schemaApply(merged());
          case "publish": return C8O.nocodePublish.publish(id, merged());
          case "describe": return C8O.nocodeBaserow.schemaGet(merged());
          default: return C8O.nocodeForms.edit(id, input, options);
        }
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
