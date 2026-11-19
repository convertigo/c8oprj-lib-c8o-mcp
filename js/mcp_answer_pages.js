if (typeof C8O === "undefined") {
  var C8O = {};
}

// Tool answers a client cannot show whole come in pages. Vibe (3.1) sets aside a tool answer over about 16,000
// characters and shows its model about 8,000 of it (head and tail); in its code mode, what a script returns reaches the
// model whole only under about 15,000 characters, and a larger return is saved to a file a No Code agent cannot read (no
// shell, read_file on its skill folder only). On test-nocode an agent asked nocode-form-contract-get, returned only the
// keys of the answer to stay small, then was stuck.
//
// mcp_endpoint measures each tool answer as the client gets it: the text content of a direct call, and the structured
// content a script gets, indented by 2 as Vibe serializes a script's return before comparing it to its 16,000 (each of
// 60 set-aside files was exactly its indent=2 size: 9,928 compact characters weighed 16,103), notes and warnings of the
// endpoint included. Over BUDGET, the whole answer is kept in the store the server shares between requests (context.server), under a random id
// bound to the bearer of the call, for KEEP_MS; the call answers its first page instead:
//   {partialAnswer: {tool, answerId, page: 1, pages, chars, howTo, next, text}}
// and the tool answer-page gives the others. text is a piece of the answer's JSON text: the texts of pages 1 to pages
// joined in order are that JSON, which a script parses. A page stays under PAGE_ROOM, its text counted as escaped in its
// JSON string, leaving room for what the endpoint adds to an answer-page answer. Every output schema declares partialAnswer (js/schema_overrides.js decorateOutput):
// the MCP client of Vibe checks a structured answer against the schema of its tool.
(function () {
  var api = C8O.mcpAnswerPages = C8O.mcpAnswerPages || {};
  api.BUDGET = 14000;
  api.PAGE_ROOM = 12500;
  api.KEEP_MS = 10 * 60000;
  api.MAX_ANSWERS = 32;
  // about 150 pages; a larger answer is not kept: its first page says to ask for less
  api.MAX_ANSWER_CHARS = 2000000;
  api.MAX_STORE_CHARS = 8000000;
  api.TOOL = "answer-page";
  api.SEQUENCE = "tools_answer_page";
  api.STORE_KEY = "lib_ConvertigoMCP.answerPages";
  // mcp_endpoint, the text of a result with a guidance warning
  api.GUIDANCE = "Refresh the Convertigo MCP setup or skill context for this endpoint before further guarded project changes.";
  var NARROWER = "a narrower call (a section, a page, a limit, a filter) may answer at once";
  var ID_PATTERN = /^[0-9a-f]{32}$/;

  function text(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function filled(value) {
    return value !== null && value !== undefined && String(value).length > 0;
  }

  // Java behind the engine; the tests give their own.
  api.host = api.host || {
    now: function () {
      return Number(java.lang.System.currentTimeMillis());
    },
    randomId: function () {
      return String(java.util.UUID.randomUUID()).replace(/-/g, "").toLowerCase();
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
    // task run under the monitor of lock (a Java object: Synchronizer unwraps it), one thread at a time
    locked: function (lock, task) {
      return new Packages.org.mozilla.javascript.Synchronizer(task, lock)();
    },
    warn: function (message) {
      try {
        Packages.com.twinsoft.convertigo.engine.Engine.logEngine.warn("[lib_ConvertigoMCP] " + message);
      } catch (_ignoreLog) {}
    },
    info: function (message) {
      try {
        Packages.com.twinsoft.convertigo.engine.Engine.logEngine.info("[lib_ConvertigoMCP] " + message);
      } catch (_ignoreLog) {}
    }
  };

  api.toolName = function (sequence) {
    return text(sequence).replace(/^tools_/, "").replace(/_/g, "-");
  };

  // The structured answer of mcp_endpoint: its notes first (OperatorNoteIf, ArgumentWarningIf, RepeatedFailureIf), then
  // the answer of the tool.
  api.answerValue = function (value, argumentWarning, operatorNote, repeatedFailure) {
    if (!filled(argumentWarning) && !filled(operatorNote) && !filled(repeatedFailure)) {
      return value;
    }
    var out = {};
    if (filled(operatorNote)) {
      out.operatorNote = String(operatorNote);
    }
    if (filled(argumentWarning)) {
      out.argumentWarning = String(argumentWarning);
    }
    if (filled(repeatedFailure)) {
      out.repeatedFailure = String(repeatedFailure);
    }
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (var key in value) {
        out[key] = value[key];
      }
    } else {
      out.result = value;
    }
    return out;
  };

  // The text content of mcp_endpoint for that structured answer.
  api.deliveredText = function (value, guidanceWarning) {
    if (!filled(guidanceWarning)) {
      return JSON.stringify(value);
    }
    return JSON.stringify({ convertigoGuidanceWarning: String(guidanceWarning), guidance: api.GUIDANCE, result: value });
  };

  // What a client shows of an answer: the text of a direct call (none with jsonOnly), or the structured content a
  // script gets, which Vibe prints indented by 2 (the file it saves a large script return to).
  api.measure = function (deliveredText, structured, jsonOnly) {
    var textSize = jsonOnly === true ? 0 : text(deliveredText).length;
    var structuredSize = 0;
    try {
      structuredSize = text(JSON.stringify(structured === undefined ? null : structured, null, 2)).length;
    } catch (_unmeasurable) {
      structuredSize = 0;
    }
    return Math.max(textSize, structuredSize);
  };

  function isHigh(code) {
    return code >= 0xD800 && code <= 0xDBFF;
  }

  function isLow(code) {
    return code >= 0xDC00 && code <= 0xDFFF;
  }

  // What a character of the answer's JSON text weighs once that text is a JSON string (the text of a page).
  function escapedCost(full, at) {
    var code = full.charCodeAt(at);
    if (code === 34 || code === 92) {
      return 2;
    }
    if (code < 32) {
      return code === 8 || code === 9 || code === 10 || code === 12 || code === 13 ? 2 : 6;
    }
    if (isHigh(code)) {
      return at + 1 < full.length && isLow(full.charCodeAt(at + 1)) ? 1 : 6;
    }
    if (isLow(code)) {
      return at > 0 && isHigh(full.charCodeAt(at - 1)) ? 1 : 6;
    }
    return 1;
  }

  // Where a JSON string of the text is, from a known state.
  function scan(full, from, to, state) {
    var inString = state.inString;
    var escaped = state.escaped;
    for (var i = from; i < to; i++) {
      var code = full.charCodeAt(i);
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (code === 92) {
          escaped = true;
        } else if (code === 34) {
          inString = false;
        }
      } else if (code === 34) {
        inString = true;
      }
    }
    return { inString: inString, escaped: escaped };
  }

  // The offsets that cut the JSON text of an answer in pieces whose JSON string weighs at most firstRoom (the first) and
  // nextRoom (the others). A piece ends after a comma between two values when one is in its last 40 %, else after a space
  // of a long string; never inside an escape or between the two halves of a character.
  api.split = function (full, firstRoom, nextRoom) {
    var cuts = [0];
    var length = full.length;
    var start = 0;
    var state = { inString: false, escaped: false };
    while (start < length) {
      var room = Math.max(200, cuts.length === 1 ? firstRoom : nextRoom);
      var cost = 0;
      var i = start;
      var inString = state.inString;
      var escaped = state.escaped;
      var afterComma = -1;
      var afterSpace = -1;
      while (i < length) {
        var weight = escapedCost(full, i);
        if (cost + weight > room && i > start) {
          break;
        }
        cost += weight;
        var code = full.charCodeAt(i);
        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (code === 92) {
            escaped = true;
          } else if (code === 34) {
            inString = false;
          } else if (code === 32) {
            afterSpace = i + 1;
          }
        } else if (code === 34) {
          inString = true;
        } else if (code === 44) {
          afterComma = i + 1;
        }
        i++;
      }
      if (i >= length) {
        cuts.push(length);
        break;
      }
      var reach = i - start;
      var cut;
      if (afterComma > start && afterComma - start >= reach * 0.6) {
        cut = afterComma;
        state = { inString: false, escaped: false };
      } else {
        cut = afterSpace > start && afterSpace - start >= reach * 0.6 ? afterSpace : i;
        if (cut === i && escaped && cut - 1 > start) {
          cut--;
        }
        if (cut - 1 > start && isHigh(full.charCodeAt(cut - 1)) && isLow(full.charCodeAt(cut))) {
          cut--;
        }
        state = scan(full, start, cut, state);
      }
      cuts.push(cut);
      start = cut;
    }
    if (cuts.length === 1) {
      cuts.push(length);
    }
    return cuts;
  };

  function howTo(record) {
    var pages = record.cuts.length - 1;
    var size = record.chars + " characters";
    if (record.kept !== true) {
      return "The answer of " + record.tool + " is " + size + ", more than a client shows at once (" + api.BUDGET +
        ") and too large to keep in pages (over " + api.MAX_ANSWER_CHARS + "): here is its beginning. Call " + record.tool +
        " again with a narrower request (a section, a page, a limit, a filter).";
    }
    return "The answer of " + record.tool + " is " + size + ", more than a client shows at once (" + api.BUDGET +
      "): it comes as its JSON text in " + pages + " pages. Read pages 2 to " + pages + " with " + api.TOOL +
      " {answerId, page}, in order; the texts of pages 1 to " + pages + " joined are the whole answer (JSON.parse it in a " +
      "script; each page's text is partialAnswer.text of its answer, this one included). Kept " + Math.round(api.KEEP_MS / 60000) + " minutes; " + NARROWER + ".";
  }

  // Page number of a record: {partialAnswer: {...}}, with the notes of the call first on page 1.
  api.page = function (record, number) {
    var pages = record.cuts.length - 1;
    var partial = { tool: record.tool };
    if (record.kept === true) {
      partial.answerId = record.id;
      partial.page = number;
      partial.pages = pages;
    } else {
      partial.kept = false;
    }
    partial.chars = record.chars;
    if (number === 1) {
      partial.howTo = howTo(record);
    }
    if (record.kept === true) {
      if (number < pages) {
        partial.next = api.TOOL + " " + JSON.stringify({ answerId: record.id, page: number + 1 });
      } else {
        partial.last = true;
      }
    }
    partial.text = record.text.substring(record.cuts[number - 1], record.cuts[number]);
    var value = {};
    if (number === 1 && record.notes) {
      ["operatorNote", "argumentWarning", "repeatedFailure"].forEach(function (key) {
        if (filled(record.notes[key])) {
          value[key] = String(record.notes[key]);
        }
      });
    }
    value.partialAnswer = partial;
    return value;
  };

  api.pageSize = function (record, number, guidanceWarning, jsonOnly) {
    var value = api.page(record, number);
    return api.measure(api.deliveredText(value, guidanceWarning), value, jsonOnly);
  };

  // A record of the answer with its cuts: every page under PAGE_ROOM as delivered.
  api.prepare = function (input) {
    var record = {
      id: input.id || "",
      owner: input.owner || "",
      tool: input.tool,
      at: input.at || 0,
      chars: input.text.length,
      text: input.text,
      notes: input.notes || null,
      kept: input.kept === true,
      cuts: [0, 0]
    };
    // What a page weighs around its text, with the largest numbers it may show: the first page (howTo, next, the
    // notes of the call), and a middle page (next).
    function overhead(number) {
      var probe = { id: record.id, tool: record.tool, chars: 9999999, text: "", notes: record.notes, kept: record.kept, cuts: [0, 0, 0, 0] };
      var value = api.page(probe, number);
      var partial = value.partialAnswer;
      if (record.kept === true) {
        partial.page = 99999;
        partial.pages = 99999;
        partial.next = api.TOOL + " " + JSON.stringify({ answerId: record.id, page: 99999 });
      }
      if (number === 1) {
        partial.howTo = howTo({ tool: record.tool, chars: 9999999, kept: record.kept, cuts: new Array(100000) });
      }
      return api.measure(api.deliveredText(value, input.guidanceWarning), value, input.jsonOnly === true);
    }
    var firstRoom = api.PAGE_ROOM - overhead(1);
    var nextRoom = api.PAGE_ROOM - overhead(2);
    for (var attempt = 0; attempt < 4; attempt++) {
      var cuts = api.split(record.text, firstRoom, nextRoom);
      // an answer not kept answers its first page only
      record.cuts = record.kept === true ? cuts : cuts.slice(0, 2);
      var over = false;
      for (var p = 1; p < record.cuts.length && !over; p++) {
        over = api.pageSize(record, p, input.guidanceWarning, input.jsonOnly === true) > api.PAGE_ROOM;
      }
      if (!over) {
        break;
      }
      firstRoom = Math.floor(firstRoom * 0.9);
      nextRoom = Math.floor(nextRoom * 0.9);
    }
    return record;
  };

  // The serialized record in the store: "<at>\n<owner>\n<tool>\n<cuts>\n<notes JSON>\n<text>".
  function serialize(record) {
    return [String(record.at), record.owner, record.tool, record.cuts.join(","), record.notes ? JSON.stringify(record.notes) : "",
      record.text].join("\n");
  }

  function deserialize(id, value) {
    var parts = [];
    var from = 0;
    for (var i = 0; i < 5; i++) {
      var at = value.indexOf("\n", from);
      if (at < 0) {
        return null;
      }
      parts.push(value.substring(from, at));
      from = at + 1;
    }
    var cuts = parts[3].split(",").map(function (n) { return Number(n); });
    return {
      id: id,
      at: Number(parts[0]),
      owner: parts[1],
      tool: parts[2],
      cuts: cuts,
      notes: parts[4].length ? JSON.parse(parts[4]) : null,
      text: value.substring(from),
      chars: value.length - from,
      kept: true
    };
  }

  function keptAt(value) {
    var cut = value.indexOf("\n");
    return cut > 0 ? Number(value.substring(0, cut)) : NaN;
  }

  // A record goes KEEP_MS after its stamp, or at once without a readable stamp. One stamped after now stays: calls of
  // the same bearer run at once, and the answer another call kept while this one read its clock is fresh, not stale.
  function expired(at, now) {
    return isNaN(at) || !(now - at < api.KEEP_MS);
  }

  // The map of the records in store, made once: context.server has no putIfAbsent, and of two first writes at once
  // each making its map, the second set would drop the first map with its record.
  function answersOf(store) {
    var answers = store.get(api.STORE_KEY);
    if (answers == null) {
      answers = api.host.locked(store, function () {
        if (store.get(api.STORE_KEY) == null) {
          store.set(api.STORE_KEY, api.host.newMap());
        }
        return store.get(api.STORE_KEY);
      });
    }
    return answers;
  }

  // store: {get(key), set(key, value)} (context.server); its map holds the serialized records by answer id.
  api.write = function (store, record, now) {
    if (!store) {
      return false;
    }
    var serialized = serialize(record);
    if (serialized.length > api.MAX_ANSWER_CHARS + 4096) {
      return false;
    }
    var answers = answersOf(store);
    var kept = [];
    var total = 0;
    var entries = answers.entrySet().iterator();
    while (entries.hasNext()) {
      var entry = entries.next();
      var value = String(entry.getValue());
      var at = keptAt(value);
      if (expired(at, now)) {
        entries.remove();
      } else {
        kept.push({ key: String(entry.getKey()), at: at, size: value.length });
        total += value.length;
      }
    }
    kept.sort(function (a, b) { return a.at - b.at; });
    while (kept.length && (kept.length >= api.MAX_ANSWERS || total + serialized.length > api.MAX_STORE_CHARS)) {
      var oldest = kept.shift();
      answers.remove(oldest.key);
      total -= oldest.size;
    }
    answers.put(record.id, serialized);
    return true;
  };

  // The record of an answer id for that owner, or null: unknown, expired, or kept for another caller.
  api.read = function (store, id, owner, now) {
    if (!store || !ID_PATTERN.test(text(id))) {
      return null;
    }
    var answers = store.get(api.STORE_KEY);
    var value = answers == null ? null : answers.get(id);
    if (value == null) {
      return null;
    }
    value = String(value);
    if (expired(keptAt(value), now)) {
      answers.remove(id);
      return null;
    }
    var record = deserialize(id, value);
    return record && record.owner === owner ? record : null;
  };

  // The caller: a digest of the bearer of the request (every MCP call carries one), so that only the holder of the same
  // token reads an answer.
  api.ownerOf = function (contextObject) {
    var authorization = "";
    try {
      var request = contextObject ? contextObject.httpServletRequest : null;
      authorization = request ? text(request.getHeader("Authorization")).replace(/^\s+|\s+$/g, "") : "";
    } catch (_noRequest) {
      authorization = "";
    }
    return api.host.digest("answer-page 1\n" + authorization);
  };

  // mcp_endpoint, after a tool answered: null when the answer fits, else {text, structured} of its first page.
  // input: {sequence, value, guidanceWarning, argumentWarning, operatorNote, repeatedFailure, jsonOnly}
  api.bound = function (contextObject, input) {
    try {
      var sequence = text(input && input.sequence);
      if (sequence === api.SEQUENCE || sequence.indexOf("tools_") !== 0) {
        return null;
      }
      var value = api.answerValue(input.value, input.argumentWarning, input.operatorNote, input.repeatedFailure);
      var delivered = api.deliveredText(value, input.guidanceWarning);
      var jsonOnly = input.jsonOnly === true;
      if (api.measure(delivered, value, jsonOnly) <= api.BUDGET) {
        return null;
      }
      var full = JSON.stringify(value);
      var notes = {};
      var anyNote = false;
      ["operatorNote", "argumentWarning", "repeatedFailure"].forEach(function (key) {
        if (filled(input[key])) {
          notes[key] = String(input[key]);
          anyNote = true;
        }
      });
      var store = null;
      try {
        store = contextObject ? contextObject.server : null;
      } catch (_noStore) {
        store = null;
      }
      var kept = store != null && full.length <= api.MAX_ANSWER_CHARS;
      var record = api.prepare({
        id: kept ? api.host.randomId() : "",
        owner: kept ? api.ownerOf(contextObject) : "",
        tool: api.toolName(sequence),
        text: full,
        notes: anyNote ? notes : null,
        kept: kept,
        guidanceWarning: input.guidanceWarning,
        jsonOnly: jsonOnly
      });
      // stamped when kept, after the cut (long for a large answer): its time starts when its client can read it
      record.at = api.host.now();
      if (kept && !api.write(store, record, record.at)) {
        record.kept = false;
        record.id = "";
        record.cuts = record.cuts.slice(0, 2);
      }
      var first = api.page(record, 1);
      api.host.info("answer of " + record.tool + " paged: " + full.length + " characters, " +
        (record.kept ? (record.cuts.length - 1) + " pages" : "not kept, first page only"));
      return { text: api.deliveredText(first, input.guidanceWarning), structured: first, pages: record.cuts.length - 1, kept: record.kept };
    } catch (boundError) {
      // the guard never fails a call: the answer goes out whole
      api.host.warn("answer pages: " + boundError);
      return null;
    }
  };

  // answer-page: page of a kept answer, for the caller that got it.
  api.execute = function (contextObject, params) {
    if (C8O.mcpAuth && typeof C8O.mcpAuth.authenticateRequest === "function") {
      var auth = C8O.mcpAuth.authenticateRequest(contextObject);
      if (!auth || auth.authenticated !== true) {
        throw new Error("A Convertigo MCP bearer token is required");
      }
    }
    var p = params || {};
    var id = text(p.answerId).replace(/^\s+|\s+$/g, "").toLowerCase();
    if (!ID_PATTERN.test(id)) {
      throw new Error("answerId is required: the partialAnswer.answerId of the answer to read (32 hexadecimal characters).");
    }
    var pageText = text(p.page).replace(/^\s+|\s+$/g, "");
    var number = !pageText.length || pageText === "null" || pageText === "undefined" ? 2 : Number(pageText);
    var record = null;
    try {
      record = api.read(contextObject ? contextObject.server : null, id, api.ownerOf(contextObject), api.host.now());
    } catch (_unreadable) {
      record = null;
    }
    if (!record) {
      throw new Error("No answer " + id + " to read: an answer is kept " + Math.round(api.KEEP_MS / 60000) +
        " minutes, for the caller that got it. Call its tool again.");
    }
    var pages = record.cuts.length - 1;
    if (!(number === Math.floor(number) && number >= 1 && number <= pages)) {
      throw new Error("page must be a whole number from 1 to " + pages + " for answer " + id + ".");
    }
    return api.page(record, number);
  };
})();
