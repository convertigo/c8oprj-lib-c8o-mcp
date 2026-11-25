if (typeof C8O === "undefined") {
  var C8O = {};
}

// Why a requestable-execute run failed, in its answer.
//
// A sequence that fails in a step answers the generic "An exception occured while executing step". The engine puts the
// cause in details (the messages of the causes, joined) and the stack trace with its "Caused by:" chain in the error
// document of an internal call (not cleaned for an internal requester), but neither names the step unless a script
// failed, and a NullPointerException of a Java step can come with no message at all. When a step calls a sequence or a
// transaction (a library of the project) that answers an error, the caller does not fail: the error document becomes the
// data of the next steps, and a later step fails on it with no word of the first error. A customer's agent looked for
// such causes for hours by disabling steps one by one (feedback reports 25/11). The engine log of the call is no help:
// a Tigo agent's MCP calls carry X-Convertigo-No-Log, so the engine writes nothing for them.
//
// So the answer is built from what the engine keeps for the run: its error document (an internal call keeps the stack
// trace), the steps of its sequence (the failing step by the name a script error gives, else by the class of the step
// the stack trace runs in; and the sequences and transactions the steps before it called), and the lines of an engine
// log (includeLogs, log-view) when the engine wrote some. The run's context is cleared when it answers (requestedObject,
// parentContext), so the step it stopped at cannot be read there. Only QNames, step names, exception classes and
// messages, each cut, go to the answer: never variable values, rows or SQL statements (their values).
(function () {
  var api = C8O.requestableFailure = C8O.requestableFailure || {};
  api.GENERIC = /^\s*An exception occured while executing step\.?\s*$/i;
  api.MAX_TEXT = 300;
  api.MAX_NESTED = 5;

  function text(value) {
    return value === null || value === undefined ? "" : String(value).replace(/^\s+|\s+$/g, "");
  }

  // A message cut to max characters, on one line, without the text of an SQL statement (its values).
  api.cut = function (value, max) {
    var t = text(value).replace(/ in statement \[[\s\S]*$/, "").replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ");
    var limit = max || api.MAX_TEXT;
    return t.length > limit ? t.substring(0, limit - 1) + "…" : t;
  };

  function generic(value) {
    return api.GENERIC.test(text(value));
  }

  // The exceptions of a Java stack trace, the outer one first: [{exception, message, frames}]. A message can hold
  // several lines (a step error names its step on the second); a frame line starts with a tab and "at ".
  api.parseTrace = function (trace) {
    var lines = text(trace).split(/\r?\n/);
    var causes = [];
    var current = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var frame = /^\s+at\s+(\S+)/.exec(line);
      if (frame) {
        if (current && current.frames.length < 8) {
          current.frames.push(frame[1]);
        }
        continue;
      }
      if (/^\s+\.\.\.\s+\d+\s+more\s*$/.test(line)) {
        continue;
      }
      var header = /^(?:Caused by:\s*)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+(?:Exception|Error|Throwable)|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\$[\w$]+)(?::\s?([\s\S]*))?$/.exec(line);
      if (header && (causes.length === 0 || /^Caused by:/.test(line) || (current && current.frames.length > 0))) {
        current = { exception: header[1], message: header[2] === undefined ? "" : header[2], frames: [] };
        causes.push(current);
        continue;
      }
      if (current && !current.frames.length) {
        current.message += (current.message.length ? "\n" : "") + line;
      }
    }
    causes.forEach(function (c) {
      c.message = text(c.message);
    });
    return causes;
  };

  // The kind of the object a frame of the root cause runs in: a step (JsonToXmlStep), a transaction or a connector.
  function objectKind(frames) {
    for (var i = 0; i < (frames || []).length; i++) {
      var m = /\.beans\.(steps|transactions|connectors)\.([A-Z][\w]*?)(?:\$[\w$]+)?\.[\w$<>]+\(/.exec(frames[i]);
      if (m && !/^(Step|StepWithExpressions|RequestableStep)$/.test(m[2])) {
        return m[2];
      }
    }
    return "";
  }

  function simpleName(exception) {
    var t = text(exception);
    return t.substring(t.lastIndexOf(".") + 1);
  }

  // What an engine message says, step and cause: a script error ("A Javascript [runtime |evaluation ]error has occured"),
  // an SQL cause ("on connection, <cause> in statement ["), a step condition, or the message itself.
  api.readMessage = function (message) {
    var t = text(message);
    var out = { step: "", property: "", cause: "", line: 0, script: false, sql: false };
    if (!t.length) {
      return out;
    }
    var step = /Step: "([^"\n]+?)(?: \(priority:-?\d+\))?"/.exec(t);
    if (step) {
      out.step = step[1];
    }
    var property = /code for '([^']+)' property/.exec(t);
    if (property) {
      out.property = property[1];
    }
    var script = /A Javascript (?:runtime |evaluation )?error has occured(?: at line (\d+), column \d+)?: (?:Error: |JavaException: )?([\s\S]*?)(?: \([^()\n]*#\d+\))?\s*(?:\n[\s\S]*)?$/.exec(t);
    if (script && text(script[2]).length) {
      out.script = true;
      out.cause = text(script[2]);
      out.line = script[1] ? Number(script[1]) : 0;
      return out;
    }
    var sql = /on connection, ([\s\S]+?) in statement \[/.exec(t);
    if (sql) {
      out.sql = true;
      out.cause = text(sql[1]);
      return out;
    }
    // The messages of the causes joined by ", ": the last one that is not the generic one.
    var parts = t.split(/,\s+(?=An exception occured while executing step)|\n/).map(text).filter(function (p) {
      return p.length && !generic(p) && !/^Step: "/.test(p) && !/^Unable to evaluate step expression/.test(p);
    });
    out.cause = parts.length ? parts.join(" ") : "";
    return out;
  };

  // What an error document of the engine says: {step, stepType, exception, cause, script, sql, where}, or null when it
  // says nothing more than the generic message. error: {message, details, exception, stacktrace, attr}.
  api.describe = function (error) {
    var e = error && typeof error === "object" ? error : {};
    var attr = e.attr && typeof e.attr === "object" ? e.attr : {};
    var where = {
      project: text(e.project || attr.project),
      sequence: text(e.sequence || attr.sequence),
      connector: text(e.connector || attr.connector),
      transaction: text(e.transaction || attr.transaction)
    };
    var fromDetails = api.readMessage(e.details);
    var fromMessage = generic(e.message) ? api.readMessage("") : api.readMessage(e.message);
    var causes = api.parseTrace(e.stacktrace);
    var root = null;
    for (var i = causes.length - 1; i >= 0 && !root; i--) {
      if (!generic(causes[i].message) || i === 0) {
        root = causes[i];
      }
    }
    var fromRoot = root ? api.readMessage(root.message) : api.readMessage("");
    // The step: named by a script error (details or the stack trace); else the kind of object of the root frames.
    var out = {
      step: fromDetails.step || fromRoot.step || fromMessage.step,
      stepType: "",
      exception: "",
      cause: "",
      line: fromDetails.line || fromRoot.line || 0,
      script: fromDetails.script || fromRoot.script,
      sql: fromDetails.sql || fromRoot.sql || fromMessage.sql,
      where: where
    };
    var deepest = causes.length ? causes[causes.length - 1] : null;
    if (deepest) {
      out.stepType = objectKind(deepest.frames) || objectKind(root ? root.frames : []);
      if (!/^com\.twinsoft\.convertigo\.engine\.EngineException$/.test(deepest.exception)) {
        out.exception = deepest.exception;
      }
    }
    if (!out.exception && text(e.exception).length && !/EngineException$/.test(text(e.exception))) {
      out.exception = text(e.exception);
    }
    out.cause = fromDetails.cause || fromRoot.cause || fromMessage.cause;
    if (!out.cause && deepest && text(deepest.message).length && !generic(deepest.message)) {
      out.cause = text(deepest.message);
    }
    if (!out.cause && out.exception) {
      // a Java exception without a message (a NullPointerException): its class is the cause
      out.cause = out.exception + (out.stepType ? " in " + out.stepType : "");
    }
    if (out.exception && out.cause && out.cause.indexOf(simpleName(out.exception)) < 0 && !out.script && !out.sql) {
      out.cause = simpleName(out.exception) + ": " + out.cause;
    }
    out.cause = api.cut(out.cause);
    if (!out.cause.length && !out.step.length) {
      return null;
    }
    return out;
  };

  // The engine log lines of a call ({level, message, extras|extra}, as log-view and includeLogs give them): the errors
  // they hold, described as error documents are. A line holds its stack trace after the first line of its message.
  api.fromLogLines = function (lines) {
    var out = [];
    (Array.isArray(lines) ? lines : []).forEach(function (line) {
      if (!line || typeof line !== "object") {
        return;
      }
      var level = text(line.level).toUpperCase();
      var message = text(line.message);
      if (!/^(ERROR|FATAL|WARN)/.test(level) || !message.length) {
        return;
      }
      var extras = line.extras && typeof line.extras === "object" ? line.extras : {};
      var extraText = text(line.extra);
      var pick = function (key) {
        var direct = extras[key] !== undefined ? extras[key] : extras["$" + key];
        if (direct !== undefined) {
          return text(direct);
        }
        var m = new RegExp("(?:^|\\s|\\|)\\$?" + key + "=([^\\s|]+)", "i").exec(extraText);
        return m ? m[1] : "";
      };
      var firstLine = message.split(/\r?\n/)[0];
      var trace = message.indexOf("\n") >= 0 ? message.substring(message.indexOf("\n") + 1) : "";
      var described = api.describe({
        message: firstLine,
        details: "",
        stacktrace: trace,
        project: pick("project"),
        sequence: pick("sequence"),
        connector: pick("connector"),
        transaction: pick("transaction")
      });
      if (described && (described.cause.length || described.step.length)) {
        described.level = level;
        out.push(described);
      }
    });
    return out;
  };

  function requestableOf(where) {
    if (!where) {
      return "";
    }
    if (where.transaction) {
      return where.project + "." + where.connector + "." + where.transaction;
    }
    return where.sequence ? where.project + "." + where.sequence : where.project;
  }

  function stepLabel(described, stepQName) {
    if (stepQName) {
      return stepQName + (described.stepType ? " (" + described.stepType + ")" : "");
    }
    if (described.step) {
      var base = described.where && described.where.sequence ? described.where.project + ".sq:" + described.where.sequence + ".st:" : "";
      return base + described.step + (described.stepType ? " (" + described.stepType + ")" : "");
    }
    return described.stepType ? "a " + described.stepType : "";
  }

  // The name of a step from its QName (<project>.sq:<sequence>.st:<step>.<nested step>).
  function shortStep(qname) {
    var m = /\.st:(.+)$/.exec(text(qname));
    return m ? m[1] : text(qname);
  }

  function sameRequestable(a, b) {
    return requestableOf(a) === requestableOf(b);
  }

  // The answer for a failed run: {message, failure} or null when nothing names the step or the cause.
  // root: the error document of the run. runtime (collect): {step: {qname, type}, callsBefore: [{step, calls}]}.
  // logs: engine log lines of the call, when the engine wrote some (a Tigo agent's calls carry X-Convertigo-No-Log).
  api.explain = function (rootError, runtime, logs) {
    var rt = runtime && typeof runtime === "object" ? runtime : {};
    var described = api.describe(rootError);
    var fromLogs = api.fromLogLines(logs);
    var rootWhere = described ? described.where : null;
    if (!described && fromLogs.length) {
      described = fromLogs[fromLogs.length - 1];
      rootWhere = described.where;
    }
    var stepQName = rt.step && rt.step.qname ? text(rt.step.qname) : "";
    // The errors the log shows in other requestables of the call: the calls inside the run that answered an error.
    var nested = [];
    fromLogs.forEach(function (d) {
      if (nested.length >= api.MAX_NESTED || !d.where || !requestableOf(d.where) || (rootWhere && sameRequestable(d.where, rootWhere))) {
        return;
      }
      var item = { requestable: requestableOf(d.where) };
      var nestedStep = stepLabel(d, "");
      if (nestedStep) {
        item.step = nestedStep;
      }
      if (d.exception) {
        item.exception = d.exception;
      }
      item.cause = d.cause || "an error";
      if (!nested.some(function (n) { return n.requestable === item.requestable && n.cause === item.cause; })) {
        nested.push(item);
      }
    });
    if (!described && !stepQName && !nested.length) {
      return null;
    }
    described = described || { step: "", stepType: "", exception: "", cause: "", where: {} };
    if (rt.step && rt.step.type && (!described.stepType || stepQName)) {
      described.stepType = text(rt.step.type);
    }
    var failure = {};
    var label = stepLabel(described, stepQName);
    var candidates = Array.isArray(rt.candidates) ? rt.candidates.slice(0, api.MAX_NESTED) : [];
    if (!stepQName && candidates.length > 1) {
      // several steps of that class: the engine does not say which one
      label = (described.stepType ? "a " + described.stepType : "a step") + " (one of " + candidates.map(shortStep).join(", ") + ")";
      failure.candidates = candidates;
    }
    if (label) {
      failure.step = label;
    }
    if (described.exception) {
      failure.exception = described.exception;
    }
    if (described.cause) {
      failure.cause = described.cause;
    }
    if (described.line) {
      failure.line = described.line;
    }
    if (nested.length) {
      failure.nested = nested;
    }
    var calls = Array.isArray(rt.callsBefore) ? rt.callsBefore.filter(function (c) { return c && c.calls; }).slice(0, api.MAX_NESTED) : [];
    if (calls.length && !nested.length) {
      failure.callsBefore = calls;
    }
    var parts = [];
    if (failure.step && failure.cause) {
      parts.push((/^a /.test(failure.step) ? "In the sequence, " : "Step ") + failure.step + " failed: " + failure.cause + ".");
    } else if (failure.cause) {
      parts.push(failure.cause + ".");
    } else if (failure.step) {
      parts.push("Step " + failure.step + " failed (the engine gave no message" + (described.exception ? ", " + described.exception : "") + ").");
    }
    if (nested.length) {
      var first = nested[0];
      parts.push("Before it, " + first.requestable + " called in this run answered an error" + (first.step ? " at step " + first.step : "") +
        ": " + first.cause + ". A step that calls a sequence or a transaction does not stop on its error: the next steps " +
        "read its error document as data. Fix that call first" + (nested.length > 1 ? " (" + (nested.length - 1) + " more in failure.nested)" : "") + ".");
    } else if (calls.length) {
      parts.push("Before it, the run called " + calls.slice(0, 3).map(function (c) {
        return c.calls + " (step " + shortStep(c.step) + ")";
      }).join(", ") + (calls.length > 3 ? " and more (failure.callsBefore)" : "") + ". A call that answers an error does not stop " +
        "the sequence: the next steps read its error document as data. If the failed step reads what a call returned, run " +
        "that call alone with requestable-execute (same variables) to see its own error.");
    }
    if (!parts.length) {
      return null;
    }
    return { message: parts.join(" ").replace(/\.\./g, "."), failure: failure };
  };

  // The stack trace of an answer: each exception with the first line of its message and its first frame, 1,500
  // characters at most (the whole trace weighed several thousand characters and said nothing more).
  api.shortTrace = function (trace) {
    var causes = api.parseTrace(trace);
    if (!causes.length) {
      return api.cut(trace, 1500);
    }
    var lines = causes.map(function (c, i) {
      var head = (i ? "Caused by: " : "") + c.exception + (c.message ? ": " + api.cut(c.message.split("\n")[0], 200) : "");
      return head + (c.frames.length ? "\n\tat " + c.frames[0] : "");
    });
    var out = lines.join("\n");
    return out.length > 1500 ? out.substring(0, 1499) + "…" : out;
  };

  // ---- In the engine: the steps of the sequence that failed --------------------------------------------------------
  // The engine gives no handle on a run once it answered (its context is cleared), and the failing step is always one of
  // the run's own sequence (an error inside a called sequence or transaction does not stop the caller). So the step is
  // found in the sequence by the name the error gives (a script error, a condition), else by the class of the step the
  // stack trace runs in (JsonToXmlStep): the only one of that class, or the candidates.

  // The steps of a sequence in the order they run: [{qname, name, type, dbo, enabled}].
  api.stepsOf = function (sequence) {
    var out = [];
    var walk = function (dbo, enabled, depth) {
      var kids = C8O.dbo.getDirectChildren(dbo);
      for (var k = 0; k < kids.length && out.length < 2000 && depth < 40; k++) {
        var kid = kids[k];
        if (!(kid instanceof Packages.com.twinsoft.convertigo.beans.core.Step)) {
          continue;
        }
        var on = enabled && kid.isEnabled() === true;
        out.push({ qname: String(kid.getFullQName()), name: String(kid.getName()), type: String(kid.getClass().getSimpleName()), dbo: kid, enabled: on });
        walk(kid, on, depth + 1);
      }
    };
    walk(sequence, true, 0);
    return out;
  };

  // Pure: the failing step among steps ({qname, name, type, enabled, calls?}) from what the error says; and the calls
  // (SequenceStep, TransactionStep) that run before it, the nearest first. {step, candidates, callsBefore}
  api.locate = function (steps, described) {
    var d = described || {};
    var enabled = (steps || []).filter(function (s) { return s.enabled !== false; });
    var matches = [];
    if (d.step) {
      matches = enabled.filter(function (s) { return s.name === d.step; });
    }
    if (!matches.length && d.stepType) {
      matches = enabled.filter(function (s) { return s.type === d.stepType; });
    }
    var out = { step: null, candidates: [], callsBefore: [] };
    if (matches.length === 1) {
      out.step = { qname: matches[0].qname, type: matches[0].type };
    } else if (matches.length > 1) {
      out.candidates = matches.slice(0, api.MAX_NESTED).map(function (s) { return s.qname; });
    }
    var last = out.step ? out.step.qname : (matches.length ? matches[matches.length - 1].qname : "");
    for (var i = 0; i < enabled.length; i++) {
      if (last && enabled[i].qname === last) {
        break;
      }
      if (enabled[i].calls) {
        out.callsBefore.push({ step: enabled[i].qname, calls: enabled[i].calls });
      }
    }
    out.callsBefore = out.callsBefore.reverse().slice(0, api.MAX_NESTED);
    return out;
  };

  // What the project says of a failed run of executionPlan (a sequence): the failing step or its candidates, and the
  // calls before it. Never throws.
  api.collect = function (executionPlan, rootError) {
    var out = { step: null, candidates: [], callsBefore: [] };
    try {
      if (!executionPlan || executionPlan.isSequence !== true) {
        return out;
      }
      if (typeof C8O.dbo === "undefined" || typeof C8O.dbo.getDirectChildren !== "function") {
        include("js/databaseobject.js");
      }
      var project = Packages.com.twinsoft.convertigo.engine.Engine.theApp.databaseObjectsManager.getOriginalProjectByName(String(executionPlan.project), false);
      var sequence = project ? project.getSequenceByName(String(executionPlan.name)) : null;
      if (sequence == null) {
        return out;
      }
      var steps = api.stepsOf(sequence);
      steps.forEach(function (s) {
        try {
          if (s.dbo instanceof Packages.com.twinsoft.convertigo.beans.steps.SequenceStep) {
            s.calls = String(s.dbo.getSourceSequence());
          } else if (s.dbo instanceof Packages.com.twinsoft.convertigo.beans.steps.TransactionStep) {
            s.calls = String(s.dbo.getSourceTransaction());
          }
        } catch (_noSource) {}
        delete s.dbo;
      });
      out = api.locate(steps, api.describe(rootError) || {});
    } catch (_noSteps) {}
    return out;
  };
})();
