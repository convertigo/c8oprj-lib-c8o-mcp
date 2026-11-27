if (typeof C8O === "undefined") {
  var C8O = {};
}

// The requestable-execute calls that fail again with the same cause in a conversation.
//
// One transaction answered "unknown token:" 36 times in 5 minutes (TigoAccess 9213aceb, 17/11): the agent changed a
// value or the SQL a little between the calls and nothing told it the cause had not moved (js/mcp_repeated_failures.js
// notes an identical call only, same tool and same arguments). Per requestable, the count of its failures in a row with
// the same cause is kept: from NOTE_FROM on, the answer says so. A cause the database gives while it reads the statement
// (LEXICAL: an unreadable character, a token out of place) comes back for the same SQL and the same values: that same
// run is refused without running anything. A success of the requestable clears its count.
//
// Keyed like js/before_guard.js (a digest of X-Convertigo-Conversation-Id, else of the bearer), in context.server under
// STORE_KEY: a map from that key to a JSON text {"at": <ms>, "c": {<requestable digest>: {"k": <cause digest>, "n": <count>,
// "at": <ms>}}, "s": {<run digest>: {"r": <requestable digest>, "cause": <cause, cut>, "at": <ms>}}}. Digests only (the
// values of a call may hold a password), the cause cut to CAUSE_CHARS. Bounded like the before guard.
(function () {
  var api = C8O.repeatedFailure = C8O.repeatedFailure || {};
  api.STORE_KEY = "lib_ConvertigoMCP.sameCauseFailures";
  api.KEEP_MS = 3600000;
  api.MAX_SCOPES = 64;
  api.MAX_ITEMS = 50;
  api.NOTE_FROM = 3;
  api.CAUSE_CHARS = 160;
  api.LEXICAL = /\b(unknown token|unexpected token|unexpected end of statement|malformed (string|numeric|quoted identifier))\b/i;

  var CONVERSATION_ID = /^[A-Za-z0-9._-]{1,128}$/;

  function text(value) {
    return value === null || value === undefined ? "" : String(value).replace(/^\s+|\s+$/g, "");
  }

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
    return JSON.stringify(String(value));
  }

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
    }
  };

  function header(contextObject, name) {
    try {
      var request = contextObject ? contextObject.httpServletRequest : null;
      return request ? text(request.getHeader(name)) : "";
    } catch (_noRequest) {
      return "";
    }
  }

  api.scopeOf = function (contextObject) {
    var id = header(contextObject, "X-Convertigo-Conversation-Id");
    if (CONVERSATION_ID.test(id)) {
      return api.host.digest("repeated-failure 1\nconversation\n" + id);
    }
    var authorization = header(contextObject, "Authorization");
    return authorization.length ? api.host.digest("repeated-failure 1\ntoken\n" + authorization) : "";
  };

  // The cause of an error answer, the same for two failures of the same cause: blanks folded, numbers and quoted values
  // out (a row id, a timestamp, a value of the call).
  api.causeOf = function (error) {
    var raw = error && typeof error === "object" ? text(error.cause || error.message) : text(error);
    return raw.replace(/\s+/g, " ").replace(/'[^']*'|"[^"]*"/g, "''").replace(/\d+/g, "#").substring(0, api.CAUSE_CHARS);
  };

  api.runDigest = function (requestable, variables, source) {
    return api.host.digest("repeated-failure 1\nrun\n" + text(requestable) + "\n" + canonical(variables || {}) + "\n" + String(source || ""));
  };

  function readScope(store, scope, now) {
    var map = store ? store.get(api.STORE_KEY) : null;
    var raw = map == null ? null : map.get(scope);
    var state = null;
    try {
      state = raw == null ? null : JSON.parse(String(raw));
    } catch (_unreadable) {}
    state = state && typeof state === "object" ? state : { at: 0, c: {}, s: {} };
    ["c", "s"].forEach(function (part) {
      state[part] = state[part] && typeof state[part] === "object" ? state[part] : {};
      Object.keys(state[part]).forEach(function (key) {
        if (!(now - Number(state[part][key] && state[part][key].at) < api.KEEP_MS)) {
          delete state[part][key];
        }
      });
    });
    return state;
  }

  function writeScope(store, scope, state, now) {
    if (store.get(api.STORE_KEY) == null) {
      store.set(api.STORE_KEY, api.host.newMap());
    }
    var map = store.get(api.STORE_KEY);
    ["c", "s"].forEach(function (part) {
      var keys = Object.keys(state[part]).sort(function (a, b) { return state[part][a].at - state[part][b].at; });
      while (keys.length > api.MAX_ITEMS) {
        delete state[part][keys.shift()];
      }
    });
    state.at = now;
    map.put(scope, JSON.stringify(state));
    var all = map.keySet().toArray();
    var ages = [];
    for (var i = 0; i < all.length; i++) {
      var key = String(all[i]);
      if (key === scope) {
        continue;
      }
      var at = 0;
      try {
        at = Number(JSON.parse(String(map.get(key))).at) || 0;
      } catch (_unreadableScope) {}
      if (!(now - at < api.KEEP_MS)) {
        map.remove(key);
      } else {
        ages.push({ key: key, at: at });
      }
    }
    ages.sort(function (a, b) { return a.at - b.at; });
    while (ages.length + 1 > api.MAX_SCOPES) {
      map.remove(ages.shift().key);
    }
  }

  // The run (its digest, null when the source of the requestable cannot be read) already failed with a cause it gives
  // again: {cause} to refuse it, else null.
  api.check = function (store, scope, run, now) {
    if (!store || !scope || !run) {
      return null;
    }
    var known = readScope(store, scope, now).s[run];
    return known && api.LEXICAL.test(String(known.cause || "")) ? { cause: String(known.cause) } : null;
  };

  // A failure of requestable with error: its count of failures in a row with that cause (1 for a new cause).
  api.failed = function (store, scope, requestable, error, run, now) {
    if (!store || !scope) {
      return 0;
    }
    var state = readScope(store, scope, now);
    var req = api.host.digest("repeated-failure 1\nrequestable\n" + text(requestable));
    var cause = api.causeOf(error);
    var kind = api.host.digest("repeated-failure 1\ncause\n" + cause);
    var count = state.c[req] && state.c[req].k === kind ? Number(state.c[req].n || 0) + 1 : 1;
    state.c[req] = { k: kind, n: count, at: now };
    if (run && api.LEXICAL.test(cause)) {
      state.s[run] = { r: req, cause: cause, at: now };
    }
    writeScope(store, scope, state, now);
    return count;
  };

  // A success of requestable: its count and its refused runs go.
  api.succeeded = function (store, scope, requestable, now) {
    if (!store || !scope) {
      return;
    }
    var map = store.get(api.STORE_KEY);
    if (map == null || map.get(scope) == null) {
      return;
    }
    var state = readScope(store, scope, now);
    var req = api.host.digest("repeated-failure 1\nrequestable\n" + text(requestable));
    var changed = state.c[req] !== undefined;
    delete state.c[req];
    Object.keys(state.s).forEach(function (key) {
      if (state.s[key].r === req) {
        delete state.s[key];
        changed = true;
      }
    });
    if (changed) {
      writeScope(store, scope, state, now);
    }
  };

  // In the engine (C8O.requestable). Never throw.
  api.refusal = function (contextObject, run) {
    try {
      return api.check(contextObject ? contextObject.server : null, api.scopeOf(contextObject), run, api.host.now());
    } catch (_ignoreCheck) {
      return null;
    }
  };

  api.recordFailure = function (contextObject, requestable, error, run) {
    try {
      return api.failed(contextObject ? contextObject.server : null, api.scopeOf(contextObject), requestable, error, run, api.host.now());
    } catch (_ignoreRecord) {
      return 0;
    }
  };

  api.recordSuccess = function (contextObject, requestable) {
    try {
      api.succeeded(contextObject ? contextObject.server : null, api.scopeOf(contextObject), requestable, api.host.now());
    } catch (_ignoreSuccess) {}
  };
})();
