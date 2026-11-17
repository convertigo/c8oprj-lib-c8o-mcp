/*
 * seed-proof: proves in one call that a seed (a sequence or transaction that puts demo or reference rows in the database)
 * is replayable. An agent reported its seed "replayable without duplicates on a fresh or existing server" from a second
 * run that answered status error: the counts were unchanged because nothing ran, and earlier versions of the seed had
 * inserted duplicates that it deleted one by one.
 *
 * The tool counts the tables the seed writes (SELECT COUNT(*) on a read-only connection, js/tools_sql_select.js), runs the
 * seed as requestable-execute does (its tools_requestable_execute sequence through an internal request, as crud-proof
 * runs requestables), counts, runs it again and counts. replayable: both runs answered ok and the second run left every
 * count as the first left it. The tables by default: the ones the SQL transactions the seed reaches write, found with the
 * security audit model (js/security_audit_collect.js, writesReachedFrom). It never empties nor deletes a row and changes
 * nothing in the project; the two runs write the application's data as the seed itself does.
 */
if (typeof C8O === "undefined") {
  var C8O = {};
}
C8O.seedProof = C8O.seedProof || {};

(function (api) {
  var TOOL = "seed-proof";
  // The answer as a client weighs it (its structured content indented by 2) stays under the paging budget (14 000).
  api.BUDGET = 13500;
  api.MAX_TABLES = 60;
  api.ERROR_CHARS = 400;
  // Their requestables change the MCP or Tigo itself: never the seed of an application.
  var OWN_PROJECTS = { lib_ConvertigoMCP: true, lib_ConvertigoAssistant: true, lib_ConvertigoAgentBridge: true };
  // A table name as SQL writes it: plain, "quoted", `quoted` or [quoted], with its schema before a dot.
  var NAME = "(?:\"[^\"]+\"|`[^`]+`|\\[[^\\]]+\\]|[A-Za-z_][\\w$#]*)";
  var VALID_TABLE = new RegExp("^" + NAME + "(?:\\." + NAME + "){0,2}$");
  // Words that follow a write verb without being a table (UPDATE SET in a MERGE, ON UPDATE CASCADE in a foreign key,
  // AFTER UPDATE ON in a trigger, GRANT UPDATE ON).
  var NOT_A_TABLE = /^(set|only|cascade|restrict|no|row|rows|of|on|nowait|skip|from|into|table|select|values|with|default)$/i;
  var DATA_WRITE = /^SQL (INSERT|UPDATE|DELETE|MERGE|REPLACE|TRUNCATE)$/;

  function trimmed(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function given(value) {
    var text = trimmed(value);
    return text.length > 0 && text !== "null" && text !== "undefined";
  }

  function refuse(message) {
    var error = new Error(TOOL + ": " + message);
    error.code = "invalid_arguments";
    throw error;
  }

  function short(text, max) {
    var value = trimmed(text).replace(/\s+/g, " ");
    var limit = max || api.ERROR_CHARS;
    return value.length > limit ? value.substring(0, limit - 1) + "…" : value;
  }

  function messageOf(error) {
    var text = "";
    try {
      text = error && error.javaException ? String(error.javaException.getMessage()) : "";
    } catch (_noJava) {}
    if (!text.length || text === "null") {
      text = error && error.message ? String(error.message) : String(error);
    }
    return text.replace(/^(?:[\w.]+(?:Exception|Error):\s*)+/, "");
  }

  function arr(value) {
    return Array.isArray(value) ? value : [];
  }

  // --- The tables a SQL text writes ----------------------------------------------------------------------------------

  // The tables an SQL text writes, as written (schema included), in the order met: INSERT [IGNORE] INTO, REPLACE INTO,
  // UPSERT INTO, MERGE INTO, UPDATE [ONLY], DELETE FROM, TRUNCATE [TABLE]. Texts and comments are not read (bare of
  // js/tools_sql_select.js); ON DUPLICATE KEY UPDATE, DO UPDATE, THEN UPDATE, FOR UPDATE and ON UPDATE are not writes of a
  // table.
  api.writtenTables = function (sql) {
    var text = C8O.sqlSelect && typeof C8O.sqlSelect.bare === "function" ? C8O.sqlSelect.bare(sql, true) : String(sql || "");
    var re = new RegExp("\\b(INSERT\\s+(?:IGNORE\\s+)?INTO|REPLACE\\s+INTO|UPSERT\\s+INTO|MERGE\\s+INTO|DELETE\\s+FROM|" +
      "TRUNCATE(?:\\s+TABLE)?|UPDATE(?:\\s+ONLY)?)\\s+(" + NAME + "(?:\\s*\\.\\s*" + NAME + ")*)", "gi");
    var out = [];
    var seen = {};
    var m = null;
    while ((m = re.exec(text)) !== null) {
      var name = m[2].replace(/\s*\.\s*/g, ".");
      if (NOT_A_TABLE.test(name)) {
        continue;
      }
      if (/^UPDATE/i.test(m[1]) && /\b(KEY|DO|THEN|FOR|ON)\s*$/i.test(text.substring(0, m.index))) {
        continue;
      }
      var key = /["`\[]/.test(name) ? name : name.toLowerCase();
      if (!seen[key]) {
        seen[key] = true;
        out.push(name);
      }
    }
    return out;
  };

  // The tables argument: an array, its JSON text, or names separated by commas.
  api.parseTables = function (value) {
    if (value === null || value === undefined) {
      return [];
    }
    var javaArray = false;
    try {
      javaArray = !!(value.getClass && value.getClass().isArray());
    } catch (_notJava) {}
    if (javaArray) {
      var all = [];
      for (var j = 0; j < value.length; j++) {
        all = all.concat(api.parseTables(value[j]));
      }
      return all;
    }
    var items = value;
    if (!Array.isArray(items)) {
      var text = trimmed(value);
      if (!given(text)) {
        return [];
      }
      if (text.charAt(0) === "[") {
        try {
          items = JSON.parse(text);
        } catch (_notJson) {
          refuse("tables is a list of table names, such as [\"db.items\", \"db.item_lines\"].");
        }
      } else {
        items = text.split(/[\s,;]+/);
      }
    }
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var name = trimmed(items[i]);
      if (name.length && out.indexOf(name) < 0) {
        out.push(name);
      }
    }
    return out;
  };

  // --- What the seed writes, from the security audit model -----------------------------------------------------------

  function byQNameOf(model) {
    var byQName = {};
    arr(model.externalRequestables).concat(arr(model.requestables)).forEach(function (r) {
      byQName[r.qname] = r;
    });
    return byQName;
  }

  // The requestables a requestable reaches through its SequenceStep and TransactionStep calls, itself first.
  function reached(model, qname) {
    var byQName = byQNameOf(model);
    var seen = {};
    var out = [];
    var queue = [qname];
    while (queue.length) {
      var current = byQName[queue.shift()];
      if (!current || seen[current.qname]) {
        continue;
      }
      seen[current.qname] = true;
      out.push(current);
      queue = queue.concat(arr(current.calls));
    }
    return out;
  }

  // {tables: [{project, connector, table, label}], resets: [{project, connector, table, by}], notCounted: [{requestable,
  // writes}]}: the tables the SQL transactions reached by qname write, the tables they empty or drop, and the writes
  // that cannot be counted. transactionOf(qname) gives {sql} of a transaction.
  api.reach = function (model, qname, audit, transactionOf, ownProject) {
    var tables = [];
    var resets = [];
    var notCounted = [];
    var listed = {};
    var seenTable = {};
    function addTable(project, connector, name) {
      var key = (project + "." + connector + "." + name).toLowerCase();
      if (seenTable[key]) {
        return;
      }
      seenTable[key] = true;
      tables.push({ project: project, connector: connector, table: name,
        label: (project === ownProject ? "" : project + ".") + connector + "." + name });
    }
    function notCountedOne(requestable, writes) {
      if (!listed[requestable]) {
        listed[requestable] = true;
        notCounted.push({ requestable: requestable, writes: writes });
      }
    }
    var writes = audit && typeof audit.writesReachedFrom === "function" ? arr(audit.writesReachedFrom(model, qname)) : [];
    writes.forEach(function (w) {
      var verbs = arr(w.writes);
      var data = verbs.filter(function (v) { return DATA_WRITE.test(v); });
      var other = verbs.filter(function (v) { return !/^SQL /.test(v); });
      var parts = String(w.qname).split(".");
      if (parts.length === 3 && verbs.some(function (v) { return /^SQL /.test(v); })) {
        var tx = null;
        try {
          tx = transactionOf(w.qname);
        } catch (_noTransaction) {
          tx = null;
        }
        var sql = tx && tx.sql ? String(tx.sql) : "";
        if (data.length) {
          var names = sql.length ? api.writtenTables(sql) : [];
          if (!names.length) {
            notCountedOne(w.qname, data.join(", ") + ": no table name read in its SQL");
          }
          names.forEach(function (name) {
            addTable(parts[0], parts[1], name);
          });
        }
        if (sql.length && C8O.requestable && typeof C8O.requestable.resetTables === "function") {
          C8O.requestable.resetTables(sql).forEach(function (table) {
            resets.push({ project: parts[0], connector: parts[1], table: table, by: w.qname });
          });
        }
      }
      if (other.length) {
        notCountedOne(w.qname, other.join(", "));
      }
    });
    // writesReachedFrom names the library sequences that change accounts only when it sees no other write, and an HTTP
    // transaction writes on the remote side, which nothing here counts.
    reached(model, qname).forEach(function (entry) {
      if (arr(entry.writes).length) {
        return;
      }
      if (entry.accountChange === true) {
        notCountedOne(entry.qname, "accounts, by its name or comment");
      } else if (entry.kind === "transaction" && /Http|Rest|Soap|Html/i.test(trimmed(entry.requestableClass))) {
        notCountedOne(entry.qname, "HTTP call: what the remote side stores is not counted");
      }
    });
    return { tables: tables, resets: resets, notCounted: notCounted };
  };

  // The tables argument resolved on the SQL connectors of the seed's project: "connector.table", or "table" when the
  // project has one SQL connector (the NGX starter's placeholder void apart).
  function wantedTables(specs, project, connectorNames) {
    var real = connectorNames.filter(function (name) { return name !== "void"; });
    var fallback = connectorNames.length === 1 ? connectorNames[0] : (real.length === 1 ? real[0] : "");
    return specs.map(function (spec) {
      if (!VALID_TABLE.test(spec)) {
        refuse("tables: " + short(spec, 80) + " is not a table name: give connector.table, such as db.items.");
      }
      var parts = spec.match(new RegExp(NAME, "g"));
      if (parts.length > 1 && connectorNames.indexOf(parts[0]) >= 0) {
        return { project: project, connector: parts[0], table: parts.slice(1).join("."), label: spec };
      }
      if (!fallback.length) {
        refuse("tables: give the connector of " + spec + " (connector.table): " + (connectorNames.length
          ? project + " has several SQL connectors (" + connectorNames.join(", ") + ")." : project + " has no SQL connector."));
      }
      return { project: project, connector: fallback, table: spec, label: fallback + "." + spec };
    });
  }

  // --- A run of the seed ---------------------------------------------------------------------------------------------

  // The answer of tools_requestable_execute ({requestable, status, error, payload...}) from its document.
  api.executionOf = function (parsed) {
    var doc = parsed && typeof parsed === "object" && parsed.document !== undefined ? parsed.document : parsed;
    if (!doc || typeof doc !== "object") {
      return { status: "error", error: { message: "requestable-execute gave no answer" } };
    }
    if (doc.error) {
      return { status: "error", error: doc.error };
    }
    var outer = doc.result;
    if (outer && typeof outer === "object" && outer.result && typeof outer.result === "object" && outer.result.status !== undefined) {
      return outer.result;
    }
    if (outer && typeof outer === "object" && outer.status !== undefined) {
      return outer;
    }
    return { status: "error", error: { message: "requestable-execute gave no result" } };
  };

  function errorText(error) {
    if (error === null || error === undefined) {
      return "";
    }
    if (typeof error !== "object") {
      return String(error);
    }
    if (Array.isArray(error)) {
      return error.length ? errorText(error[0]) : "";
    }
    var message = trimmed(error.message);
    var cause = trimmed(error.cause);
    // "An exception occured while executing step" says nothing: the engine's details name the step and the error
    // (a ReferenceError on a variable a misplaced step should have set, for example).
    var details = trimmed(error.details).split("\n").filter(function (line) {
      return /\S/.test(line) && !/^null$/.test(line.trim());
    }).join(" ");
    if (details.length && (!message.length || /exception occured while executing step/i.test(message))) {
      message = details;
    }
    if (message.length) {
      return cause.length && message.indexOf(cause) < 0 ? message + " Cause: " + cause : message;
    }
    return cause.length ? cause : JSON.stringify(error);
  }

  function filled(value) {
    if (value === null || value === undefined || value === false || value === "") {
      return false;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return typeof value !== "object" || Object.keys(value).length > 0;
  }

  // A failure the seed's own answer reports without an engine error: an error field, or a status error / failed.
  function payloadFailure(value, depth) {
    if (!value || typeof value !== "object" || Array.isArray(value) || depth > 3) {
      return "";
    }
    var keys = Object.keys(value);
    for (var i = 0; i < keys.length; i++) {
      var v = value[keys[i]];
      if (/^errors?$/i.test(keys[i]) && filled(v)) {
        return keys[i] + ": " + errorText(v);
      }
      if (/^(status|state|outcome)$/i.test(keys[i]) && typeof v === "string" && /^(error|errors|failed|failure|fail|ko)$/i.test(v.trim())) {
        return keys[i] + " " + v.trim();
      }
    }
    for (var k = 0; k < keys.length; k++) {
      var inner = payloadFailure(value[keys[k]], depth + 1);
      if (inner) {
        return inner;
      }
    }
    return "";
  }

  // Why a run failed, "" when it answered ok: the error of requestable-execute (status error), or an error the seed's
  // answer holds.
  api.failureOf = function (answer) {
    if (!answer || typeof answer !== "object") {
      return "requestable-execute gave no answer";
    }
    if (filled(answer.error)) {
      return errorText(answer.error) || "error";
    }
    if (trimmed(answer.status).toLowerCase() !== "ok") {
      return "status " + (trimmed(answer.status) || "missing");
    }
    var inPayload = payloadFailure(answer.payload, 0);
    return inPayload ? "its answer reports a failure (" + inPayload + ")" : "";
  };

  // --- The verdict ----------------------------------------------------------------------------------------------------

  function changes(rows, sign) {
    return rows.filter(function (r) {
      return r.afterRun1 !== null && r.afterRun2 !== null && (sign > 0 ? r.afterRun2 > r.afterRun1 : r.afterRun2 < r.afterRun1);
    }).map(function (r) {
      var delta = r.afterRun2 - r.afterRun1;
      return r.table + " (" + (delta > 0 ? "+" : "") + delta + ")";
    });
  }

  // {verdict, reasons, freshRun} of the counted tables [{table, before, afterRun1, afterRun2, error}] and the runs.
  api.judge = function (rows, runs) {
    var reasons = [];
    var run1 = runs[0] || { status: "skipped" };
    var run2 = runs[1] || { status: "skipped" };
    var fresh = rows.length > 0 && rows.every(function (r) {
      return r.before === 0 || (r.before === null && r.afterRun1 !== null);
    });
    if (run1.status !== "ok") {
      reasons.push("Run 1 answered an error: " + (run1.error || run1.status) + ". The seed fails: fix it and prove it again. Counts " +
        "unchanged after an error prove nothing, and no success may be reported about this seed until a proof passes.");
    } else if (run2.status !== "ok") {
      reasons.push("Run 2 answered an error: " + (run2.error || run2.status) + ". A seed that fails once its rows are there is not " +
        "replayable: fix it and prove it again. Counts unchanged after an error prove nothing.");
    }
    var unread = rows.filter(function (r) {
      return r.afterRun1 === null || (run1.status === "ok" && run2.status !== "skipped" && r.afterRun2 === null);
    });
    if (unread.length) {
      reasons.push("Not counted after a run: " + unread.map(function (r) { return r.table; }).join(", ") +
        (unread[0].error ? " (" + unread[0].error + ")" : "") + ". The replay is not proven on these tables.");
    }
    if (run1.status === "ok" && run2.status === "ok") {
      var added = changes(rows, 1);
      if (added.length) {
        reasons.push("Run 2 added rows: " + added.join(", ") + ". The seed inserts again what is already there (duplicates): " +
          "insert a row only when it is missing (INSERT ... SELECT ... WHERE NOT EXISTS on its natural key, or MERGE), and give " +
          "the table a unique key on that natural key.");
      }
      var removed = changes(rows, -1);
      if (removed.length) {
        reasons.push("Run 2 removed rows: " + removed.join(", ") + ". A seed that deletes and inserts again loses the rows users " +
          "entered: insert only what is missing.");
      }
    }
    if (run1.status === "ok" && fresh && rows.every(function (r) { return r.afterRun1 === 0; })) {
      reasons.push("Run 1 answered ok and wrote no row in the empty tables: the seed creates nothing. Check that it reaches its " +
        "inserts (a condition always false, a step that reads a variable the seed never sets).");
    }
    return { verdict: reasons.length ? "failed" : "replayable", reasons: reasons, freshRun: fresh };
  };

  // --- The answer -----------------------------------------------------------------------------------------------------

  function size(answer) {
    return JSON.stringify(answer, null, 2).length;
  }

  // The answer within BUDGET as a client weighs it: shorter errors, then fewer writes not counted, then fewer tables
  // (the ones a reason names first); what is left out is counted.
  api.fit = function (answer) {
    if (size(answer) <= api.BUDGET) {
      return answer;
    }
    arr(answer.runs).forEach(function (r) {
      if (r.error) {
        r.error = short(r.error, 160);
      }
    });
    arr(answer.tables).forEach(function (t) {
      if (t.error) {
        t.error = short(t.error, 120);
      }
    });
    answer.reasons = arr(answer.reasons).map(function (r) { return short(r, 600); });
    if (size(answer) > api.BUDGET && arr(answer.notCounted).length > 8) {
      answer.notCountedMore = answer.notCounted.length - 8;
      answer.notCounted = answer.notCounted.slice(0, 8);
    }
    if (size(answer) > api.BUDGET && arr(answer.tables).length) {
      var kept = answer.tables.slice().sort(function (a, b) {
        var ca = a.afterRun2 !== a.afterRun1 || a.afterRun1 === null ? 0 : 1;
        var cb = b.afterRun2 !== b.afterRun1 || b.afterRun1 === null ? 0 : 1;
        return ca - cb;
      });
      var omitted = 0;
      while (kept.length > 1 && size(answer) > api.BUDGET) {
        kept.pop();
        omitted++;
        answer.tables = kept;
        answer.tablesOmitted = omitted;
      }
    }
    while (size(answer) > api.BUDGET && arr(answer.reasons).length) {
      answer.reasons = answer.reasons.map(function (r) { return short(r, 200); });
      if (size(answer) > api.BUDGET) {
        answer.reasons = answer.reasons.slice(0, Math.max(1, answer.reasons.length - 1));
        if (answer.reasons.length === 1) {
          break;
        }
      }
    }
    return answer;
  };

  // --- The proof ------------------------------------------------------------------------------------------------------

  // args: {requestable, variables, authenticatedUser, tables}. host: {audit(), model(project), transaction(qname),
  // sqlConnectors(project), count(project, connector, tables) -> [{table, rows, error}], execute(requestable, variables,
  // authenticatedUser, run) -> requestable-execute's answer, now()}: the engine (api.engineHost), or the tests' fakes.
  api.prove = function (args, host) {
    args = args || {};
    if (!given(args.requestable)) {
      refuse("requestable is required: the seed to prove, as <project>.<sequence> (or <project>.sq:<sequence>).");
    }
    var target = C8O.requestable.parseTarget(args.requestable);
    if (OWN_PROJECTS[target.project] === true) {
      refuse(target.project + " is part of the Convertigo MCP and Tigo, not an application: seed-proof runs the seed of an application.");
    }
    var variables = given(args.variables) || (args.variables && typeof args.variables === "object")
      ? C8O.util.parseObjectInput(args.variables, { label: "variables", allowEmpty: true }) || {} : {};
    var user = given(args.authenticatedUser) ? trimmed(args.authenticatedUser) : "";
    var model = host.model(target.project);
    var byQName = byQNameOf(model);
    var qname = target.isSequence ? target.project + "." + target.name : target.project + "." + target.connector + "." + target.name;
    if (!byQName[qname] && !target.isSequence && /^(sequences|sq)$/.test(target.connector) && byQName[target.project + "." + target.name]) {
      qname = target.project + "." + target.name;
    }
    var seed = byQName[qname];
    if (!seed || seed.external === true) {
      refuse(trimmed(args.requestable) + " is not a sequence or a transaction of project " + target.project + " (project-brief lists its sequences).");
    }
    var reach = api.reach(model, qname, host.audit(), function (q) { return host.transaction(q); }, target.project);
    var specs = api.parseTables(args.tables);
    if (specs.length > api.MAX_TABLES) {
      refuse("tables: " + specs.length + " names, " + api.MAX_TABLES + " at most.");
    }
    var counted = specs.length ? wantedTables(specs, target.project, arr(host.sqlConnectors(target.project))) : reach.tables.slice(0, api.MAX_TABLES);
    var answer = {
      status: "ok",
      requestable: trimmed(args.requestable),
      verdict: "failed",
      reasons: [],
      freshRun: false,
      note: "",
      tables: [],
      runs: [],
      notCounted: reach.notCounted,
      warnings: []
    };
    if (!specs.length && reach.tables.length > api.MAX_TABLES) {
      answer.notCounted.push({ requestable: "", writes: (reach.tables.length - api.MAX_TABLES) + " more tables beyond the first " + api.MAX_TABLES + ": give tables to choose them" });
    }
    if (seed.accessibility && seed.accessibility !== "Private") {
      answer.warnings.push(qname + " is " + seed.accessibility + ": " + (seed.authenticatedContextRequired === true ? "any signed-in user" : "anyone, without signing in,") +
        " can run it. A seed stays Private: on a new server it runs from a scheduler job (scheduler-apply) or by an administrator " +
        "(requestable-execute in the Studio, or an administrator's sequence that calls it). Replayable never means callable anonymously.");
    }
    if (!counted.length) {
      answer.reasons.push("No table to count: the seed reaches no SQL transaction whose SQL names the table it writes" +
        (answer.notCounted.length ? " (its writes are in notCounted)" : "") + ". Give tables (\"connector.table\") to count, then prove again.");
      answer.note = "Nothing was run: a run that cannot be counted proves nothing.";
      return api.fit(answer);
    }

    function countAll(list) {
      var out = [];
      var groups = {};
      var order = [];
      list.forEach(function (t, i) {
        var key = t.project + "\u0000" + t.connector;
        if (!groups[key]) {
          groups[key] = { project: t.project, connector: t.connector, items: [] };
          order.push(key);
        }
        groups[key].items.push(i);
      });
      order.forEach(function (key) {
        var g = groups[key];
        var counts = [];
        var failure = "";
        try {
          counts = arr(host.count(g.project, g.connector, g.items.map(function (i) { return list[i].table; })));
        } catch (countError) {
          failure = messageOf(countError);
        }
        g.items.forEach(function (i, k) {
          var c = counts[k] || { rows: null, error: failure || "not counted" };
          var rows = typeof c.rows === "number" && isFinite(c.rows) ? c.rows : null;
          out[i] = { rows: rows, error: rows === null ? short(c.error || "not counted", 200) : "" };
        });
      });
      return out;
    }

    var before = countAll(counted);
    // A seed that empties or drops a table holding rows deletes them: seed-proof never runs it.
    var resets = reach.resets.filter(function (r) { return r.table !== "*"; });
    var resetCounts = resets.length ? countAll(resets) : [];
    var holding = [];
    resets.forEach(function (r, i) {
      if (resetCounts[i] && resetCounts[i].rows > 0) {
        holding.push(r.connector + "." + r.table + " (" + resetCounts[i].rows + " rows, by " + r.by + ")");
      } else if (!resetCounts[i] || resetCounts[i].rows === null) {
        // A table it empties or drops that cannot be counted (a schema or a quoted name read otherwise) may hold rows:
        // never run it on a guess.
        holding.push(r.connector + "." + r.table + " (could not be counted, by " + r.by + ")");
      }
    });
    reach.resets.filter(function (r) { return r.table === "*"; }).forEach(function (r) {
      counted.forEach(function (t, i) {
        if (t.project === r.project && t.connector === r.connector && before[i].rows > 0) {
          holding.push(t.label + " (" + before[i].rows + " rows, by " + r.by + ", which drops the schema)");
        }
      });
    });
    var rows = counted.map(function (t, i) {
      var row = { table: t.label, before: before[i].rows, afterRun1: null, afterRun2: null };
      if (before[i].error) {
        row.error = before[i].error;
      }
      return row;
    });
    if (holding.length) {
      answer.tables = rows;
      answer.reasons.push("The seed empties or drops tables that hold rows or could not be counted: " + holding.join(", ") +
        ". Run, it may delete their rows; seed-proof never empties data, so nothing was run. A seed inserts what is missing " +
        "and deletes nothing.");
      answer.note = "Nothing was run.";
      return api.fit(answer);
    }

    function runOnce(n) {
      var started = Number(host.now());
      var result = null;
      try {
        result = host.execute(answer.requestable, variables, user, n);
      } catch (runError) {
        result = { status: "error", error: { message: messageOf(runError) } };
      }
      var run = { run: n, status: "ok", ms: Math.max(0, Number(host.now()) - started) };
      var failure = api.failureOf(result);
      if (failure) {
        run.status = "error";
        run.error = short(failure);
      }
      return run;
    }

    function record(counts, field) {
      counts.forEach(function (c, i) {
        rows[i][field] = c.rows;
        if (c.error && !rows[i].error) {
          rows[i].error = c.error;
        }
      });
    }

    var run1 = runOnce(1);
    record(countAll(counted), "afterRun1");
    var run2 = { run: 2, status: "skipped", note: "not run: run 1 failed" };
    if (run1.status === "ok") {
      run2 = runOnce(2);
      record(countAll(counted), "afterRun2");
    }
    var judged = api.judge(rows, [run1, run2]);
    answer.verdict = judged.verdict;
    answer.reasons = judged.reasons;
    answer.freshRun = judged.freshRun;
    answer.tables = rows;
    answer.runs = [run1, run2];
    if (judged.freshRun) {
      answer.note = "Every counted table was empty (or missing) before run 1: " + (run1.status === "ok"
        ? "run 1 is also the fresh-server proof (one run answering ok, then these counts)."
        : "the seed does not initialize a fresh server.");
    } else {
      answer.note = "The tables held rows before run 1: this proves the replay on existing data, not a fresh server. seed-proof " +
        "never empties a table; emptying one (or using a new database) to prove a fresh server needs the user's OK.";
    }
    return api.fit(answer);
  };

  // --- The engine -----------------------------------------------------------------------------------------------------

  api.engineHost = function (contextObject) {
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    function projectOf(name) {
      try {
        return Engine.theApp.databaseObjectsManager.getOriginalProjectByName(String(name));
      } catch (_notLoaded) {
        return null;
      }
    }
    return {
      audit: function () {
        return C8O.securityAudit;
      },
      model: function (projectName) {
        return C8O.securityAudit.collect(projectName, { includeEngine: false, includeFrontend: false });
      },
      transaction: function (qname) {
        var parts = String(qname).split(".");
        var project = parts.length === 3 ? projectOf(parts[0]) : null;
        var connector = project ? project.getConnectorByName(parts[1]) : null;
        var tx = connector ? connector.getTransactionByName(parts[2]) : null;
        return tx && typeof tx.getSqlQuery === "function" ? { sql: String(tx.getSqlQuery()) } : null;
      },
      sqlConnectors: function (projectName) {
        var project = projectOf(projectName);
        return project ? C8O.sqlSelect.sqlConnectors(project).map(function (c) { return String(c.getName()); }) : [];
      },
      // Each table counted with SELECT COUNT(*) on a new read-only connection (rolled back, closed).
      count: function (projectName, connectorName, tables) {
        var out = [];
        var project = projectOf(projectName);
        var connector = null;
        try {
          connector = project ? project.getConnectorByName(String(connectorName)) : null;
        } catch (_noConnector) {
          connector = null;
        }
        var i = 0;
        if (!connector || typeof connector.getJdbcURL !== "function") {
          for (i = 0; i < tables.length; i++) {
            out.push({ table: tables[i], rows: null, error: projectName + "." + connectorName + " is not an SQL connector" });
          }
          return out;
        }
        var jdbc = null;
        try {
          jdbc = C8O.sqlSelect.connect(connector);
        } catch (connectError) {
          for (i = 0; i < tables.length; i++) {
            out.push({ table: tables[i], rows: null, error: "the database cannot be opened: " + messageOf(connectError) });
          }
          return out;
        }
        try {
          for (i = 0; i < tables.length; i++) {
            try {
              var read = C8O.sqlSelect.query(jdbc, "SELECT COUNT(*) FROM " + tables[i], 1);
              var row = read.rows && read.rows.length ? read.rows[0] : null;
              var keys = row ? Object.keys(row) : [];
              var n = keys.length ? Number(row[keys[0]]) : NaN;
              out.push(isFinite(n) ? { table: tables[i], rows: n } : { table: tables[i], rows: null, error: "no count read" });
            } catch (countError) {
              out.push({ table: tables[i], rows: null, error: messageOf(countError) });
            }
          }
        } finally {
          try {
            jdbc.close();
          } catch (_closed) {}
        }
        return out;
      },
      // The seed run as requestable-execute runs it: its sequence, through an internal request in the HTTP session of
      // this call, in a context of its own that is removed afterwards.
      execute: function (requestable, variables, user, run) {
        var HashMap = Packages.java.util.HashMap;
        var InternalRequester = Packages.com.twinsoft.convertigo.engine.requesters.InternalRequester;
        var XMLUtils = Packages.com.twinsoft.convertigo.engine.util.XMLUtils;
        var request = new HashMap();
        request.put("__project", "lib_ConvertigoMCP");
        request.put("__sequence", "tools_requestable_execute");
        request.put("__context", "seed_proof_" + java.lang.System.currentTimeMillis() + "_" + run);
        request.put("__nolog", "true");
        request.put("requestable", String(requestable));
        request.put("variables", JSON.stringify(variables || {}));
        if (user) {
          request.put("authenticatedUser", String(user));
        }
        var requester = null;
        try {
          requester = contextObject && contextObject.httpServletRequest ? new InternalRequester(request, contextObject.httpServletRequest) : new InternalRequester(request);
        } catch (_noHttpRequest) {
          requester = new InternalRequester(request);
        }
        var response = null;
        try {
          response = requester.processRequest();
        } finally {
          try {
            Engine.theApp.contextManager.remove(requester.getContext());
          } catch (_ignoreContext) {}
        }
        var root = response && response.getDocumentElement ? response.getDocumentElement() : response;
        return api.executionOf(JSON.parse(String(XMLUtils.XmlToJson(root, true, true))));
      },
      now: function () {
        return Number(java.lang.System.currentTimeMillis());
      }
    };
  };

  function requireFullBearer(contextObject) {
    if (!C8O.mcpAuth || typeof C8O.mcpAuth.authenticateRequest !== "function") {
      return;
    }
    var auth = C8O.mcpAuth.authenticateRequest(contextObject);
    if (!auth.authenticated || auth.kind === "nocode") {
      throw new Error("A Convertigo MCP bearer token is required");
    }
  }

  api.execute = function (contextObject, params) {
    requireFullBearer(contextObject);
    if ((typeof C8O.dbo === "undefined" || typeof C8O.dbo.resolve !== "function") && typeof include === "function") {
      include("js/databaseobject.js");
    }
    return api.prove(params, api.engineHost(contextObject));
  };
})(C8O.seedProof);
