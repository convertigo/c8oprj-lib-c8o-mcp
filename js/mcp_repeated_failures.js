if (typeof C8O === "undefined") {
  var C8O = {};
}
if (!C8O.guidance || !C8O.guidance.fingerprintOf) {
  include("js/guidance_version.js");
}

// A tool call that fails again with the same error as an identical call (same tool, same arguments) of the same MCP
// session says so. An agent sent the same failing requestable-execute 8 times in a row, reading the same error each
// time (usage tests 30/10, r48). The failures are kept per session (the Tigo conversation the Agent Bridge names, else
// the bearer token) for REPEAT_KEEP_MS, in the store the server shares between requests; a success of the same call
// forgets them.
(function () {
  var api = C8O.mcpRepeat = C8O.mcpRepeat || {};
  var REPEAT_STORE_KEY = "lib_ConvertigoMCP.repeatedFailures";
  var REPEAT_KEEP_MS = 15 * 60000;
  var REPEAT_MAX_ENTRIES = 2000;

  function trim(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  // A short key whatever the size of the arguments (the 64-bit FNV-1a of the guidance fingerprint, pure JavaScript).
  function digest(text) {
    return C8O.guidance.fingerprintOf([text]) + ":" + text.length;
  }

  // Arguments in the same order whatever order the model wrote them in.
  function canonical(value) {
    if (value === null || value === undefined) {
      return "null";
    }
    if (Array.isArray(value)) {
      return "[" + value.map(canonical).join(",") + "]";
    }
    if (typeof value === "object") {
      return "{" + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ":" + canonical(value[key]);
      }).join(",") + "}";
    }
    return JSON.stringify(value);
  }

  api.callKey = function (toolName, args) {
    // the call of this request, for the not-found streak of the lookup tools (afterCall)
    api.current = api.callInfo(toolName, args);
    return digest(trim(toolName).toLowerCase() + "\n" + canonical(args || {}));
  };

  // ---- Lookups that find nothing, whatever the target ----------------------------------------------------------
  // databaseobject-tree-get answered "Database object not found ... Objects named ...: a, b, c" 18 times in 5 minutes,
  // then 9 more, the candidates in each answer (feedback reports 25/11). The guard above did not stop it: it counts an
  // identical call (same tool, same arguments) failing with the same message, and each try asked another QName, so each
  // was a new call with a new message; and it only adds a note. The lookup tools now count their "not found" answers in a
  // row per session, whatever the target: from LOOKUP_STREAK on, the answer says to stop guessing and to copy a QName
  // from project-brief (or databaseobject-search); any lookup that finds its object starts the count again.
  api.LOOKUP_TOOLS = {
    "databaseobject-tree-get": true,
    "databaseobject-delete": true,
    "databaseobject-search": true,
    "databaseobject-tree-apply": true,
    "databaseobject-move": true,
    "databaseobject-rename": true,
    "databaseobject-copy": true
  };
  api.LOOKUP_STREAK = 3;
  api.NOT_FOUND = /Database object not found/i;
  var STREAK_STORE_KEY = "lib_ConvertigoMCP.lookupStreaks";

  function toolOf(name) {
    return trim(name).toLowerCase().replace(/^.*?(databaseobject)/, "$1").replace(/[._]/g, "-");
  }

  api.callInfo = function (toolName, args) {
    var a = args && typeof args === "object" ? args : {};
    var asked = trim(a.target || a.qname || a.project || "");
    return { tool: toolOf(toolName), project: asked.split(/[.:\/]/)[0] || "" };
  };

  // "Call again with target <QName>." of a not-found message: the QName to use, else "".
  api.useOf = function (message) {
    var m = /Call again with target (\S+?)\.(?:\s|$)/.exec(trim(message));
    return m ? m[1] : "";
  };

  // The first not-found message inside an answer (a tree-apply that stopped on its target answers it in its operations).
  api.notFoundIn = function (value) {
    var seen = 0;
    var found = "";
    var walk = function (v, depth) {
      if (found || depth > 6 || seen > 400) {
        return;
      }
      seen++;
      if (typeof v === "string") {
        if (api.NOT_FOUND.test(v)) {
          found = v;
        }
      } else if (Array.isArray(v)) {
        v.forEach(function (x) { walk(x, depth + 1); });
      } else if (v && typeof v === "object") {
        Object.keys(v).forEach(function (k) { walk(v[k], depth + 1); });
      }
    };
    walk(value, 0);
    return found;
  };

  // A failed answer with a not-found inside whose QName to use is known gets use and the sentence, at its top.
  api.annotateNotFound = function (value) {
    try {
      if (!value || typeof value !== "object" || Array.isArray(value) || value.use) {
        return value;
      }
      var status = trim(value.status).toLowerCase();
      if (status !== "error" && status !== "failed") {
        return value;
      }
      var use = api.useOf(api.notFoundIn(value));
      if (use) {
        value.use = use;
        if (value.message === undefined || typeof value.message === "string") {
          value.message = (value.message ? value.message + " " : "") + "Call again with target " + use + ".";
        }
      }
    } catch (_ignoreAnnotate) {}
    return value;
  };

  // store: as record. info: api.current. signature: "" for a call that worked. The note to add, or "".
  api.lookupStreak = function (store, newMap, sessionKey, info, signature, now) {
    if (!store || !sessionKey || !info || api.LOOKUP_TOOLS[info.tool] !== true) {
      return "";
    }
    if (store.get(STREAK_STORE_KEY) == null) {
      store.set(STREAK_STORE_KEY, newMap());
    }
    var streaks = store.get(STREAK_STORE_KEY);
    if (!signature) {
      streaks.remove(sessionKey);
      return "";
    }
    if (!api.NOT_FOUND.test(signature)) {
      // another error neither counts nor ends the streak
      return "";
    }
    var kept = streaks.entrySet().iterator();
    while (kept.hasNext()) {
      var entry = null;
      try {
        entry = JSON.parse(String(kept.next().getValue()));
      } catch (_unreadableStreak) {}
      if (!entry || !(now - Number(entry.at) < REPEAT_KEEP_MS)) {
        kept.remove();
      }
    }
    if (streaks.size() >= REPEAT_MAX_ENTRIES) {
      streaks.clear();
    }
    var previous = null;
    try {
      previous = streaks.get(sessionKey) == null ? null : JSON.parse(String(streaks.get(sessionKey)));
    } catch (_unreadablePrevious) {}
    var count = (previous ? Number(previous.count) || 0 : 0) + 1;
    var project = info.project || (previous && previous.project) || "";
    streaks.put(sessionKey, JSON.stringify({ at: now, count: count, project: project }));
    if (count < api.LOOKUP_STREAK) {
      return "";
    }
    var briefArgs = project ? "{project: \"" + project + "\"}" : "{project}";
    return count + " lookups in a row found nothing in this session: stop guessing QNames. Call project-brief " + briefArgs +
      " once (or databaseobject-search with the name you look for) and copy a QName from its answer, or use the QName " +
      "this answer gives in use.";
  };

  api.sessionKey = function (contextObject) {
    try {
      var request = contextObject && contextObject.httpServletRequest;
      if (!request) {
        return "";
      }
      var conversationId = trim(request.getHeader("X-Convertigo-Conversation-Id"));
      if (/^[A-Za-z0-9._-]{1,128}$/.test(conversationId)) {
        return "conversation:" + conversationId;
      }
      var bearer = /^\s*Bearer\s+(.+?)\s*$/i.exec(trim(request.getHeader("Authorization")));
      return bearer ? "token:" + digest(bearer[1]) : "";
    } catch (_ignoreSessionKey) {
      return "";
    }
  };

  // The error of a failed call as one comparable line: its code and its message.
  api.errorSignature = function (error) {
    error = error || {};
    var message = trim(error.message) || trim(error.details).substring(0, 200);
    return (trim(error.code) + "|" + message).substring(0, 400);
  };

  // A tool answer can report a failure without being an MCP error: {status: "error" | "failed", error: {code, message}}.
  api.failureOf = function (value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return "";
    }
    var status = trim(value.status).toLowerCase();
    if (status !== "error" && status !== "failed") {
      return "";
    }
    return api.errorSignature(value.error && typeof value.error === "object" ? value.error : { message: value.message || status });
  };

  // store: {get(key), set(key, value)} (context.server); map: a ConcurrentHashMap of JSON strings {at, signature, count}.
  api.record = function (store, newMap, sessionKey, callKey, signature, now) {
    if (!store || !sessionKey || !callKey) {
      return "";
    }
    if (store.get(REPEAT_STORE_KEY) == null) {
      store.set(REPEAT_STORE_KEY, newMap());
    }
    var failures = store.get(REPEAT_STORE_KEY);
    var key = sessionKey + "\n" + callKey;
    if (!signature) {
      failures.remove(key);
      return "";
    }
    var kept = failures.entrySet().iterator();
    while (kept.hasNext()) {
      var entry = null;
      try {
        entry = JSON.parse(String(kept.next().getValue()));
      } catch (_unreadable) {}
      if (!entry || !(now - Number(entry.at) < REPEAT_KEEP_MS)) {
        kept.remove();
      }
    }
    if (failures.size() >= REPEAT_MAX_ENTRIES) {
      failures.clear();
    }
    var previous = null;
    try {
      previous = failures.get(key) == null ? null : JSON.parse(String(failures.get(key)));
    } catch (_unreadablePrevious) {}
    var earlier = previous && previous.signature === signature ? Number(previous.count) || 0 : 0;
    failures.put(key, JSON.stringify({ at: now, signature: signature, count: earlier + 1 }));
    if (!earlier) {
      return "";
    }
    return "This exact call (same tool, same arguments) already failed " + earlier + (earlier > 1 ? " times" : " time") +
      " in this session with this error: change the call or the approach instead of sending it again.";
  };

  // signature: "" for a call that worked, which forgets the failures of the same call. value: the answer of a call that
  // did not throw (a not-found inside it is read, and its QName to use added).
  api.afterCall = function (contextObject, callKey, signature, value) {
    var notes = [];
    var newMap = function () {
      return new java.util.concurrent.ConcurrentHashMap();
    };
    var store = contextObject ? contextObject.server : null;
    var now = Number(java.lang.System.currentTimeMillis());
    try {
      if (value !== undefined) {
        api.annotateNotFound(value);
        var inside = signature ? api.notFoundIn(value) : "";
        if (inside && !api.NOT_FOUND.test(signature)) {
          signature = (signature + "|" + inside).substring(0, 400);
        }
      }
    } catch (_ignoreValue) {}
    try {
      var repeated = api.record(store, newMap, api.sessionKey(contextObject), callKey, signature, now);
      if (repeated) {
        notes.push(repeated);
      }
    } catch (_ignoreRepeat) {}
    try {
      var streak = api.lookupStreak(store, newMap, api.sessionKey(contextObject), api.current, signature, now);
      if (streak) {
        notes.push(streak);
      }
    } catch (_ignoreStreak) {}
    return notes.join(" ");
  };
})();
