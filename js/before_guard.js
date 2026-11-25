if (typeof C8O === "undefined") {
  var C8O = {};
}

// The sign-ins of requestable-execute's before that already failed in a conversation.
//
// A requestable-execute answered "Authentication required"; the agent then ran a login through before with a wrong
// password 8 times in a row ("wrong login or password"), though the guide forbids guessing passwords (feedback reports
// 25/11). When a before requestable answers an error, a digest of (that requestable, its variable values) is kept for
// the conversation: a later call whose before holds the same digest is refused at once, without running anything. The
// same requestable failing with REQUESTABLE_TRIES different values in the conversation is a guessing loop: its next try
// is refused too. Only digests are kept, never a variable value (a password) in clear.
//
// Keyed like js/write_journal.js: a digest of X-Convertigo-Conversation-Id, else of the bearer of the call. In the store
// the server shares between requests (context.server), under STORE_KEY: a map from that key to a JSON text
// {"at": <last write ms>, "d": {<digest of requestable and values>: <ms>}, "r": {<digest of requestable>: [<ms>...]}}.
// Bounded: MAX_SCOPES conversations (the oldest dropped), MAX_ITEMS digests per conversation, nothing older than KEEP_MS.
(function () {
  var api = C8O.beforeGuard = C8O.beforeGuard || {};
  api.STORE_KEY = "lib_ConvertigoMCP.failedBefore";
  api.KEEP_MS = 24 * 3600000;
  api.MAX_SCOPES = 64;
  api.MAX_ITEMS = 50;
  api.REQUESTABLE_TRIES = 3;

  var CONVERSATION_ID = /^[A-Za-z0-9._-]{1,128}$/;

  function text(value) {
    return value === null || value === undefined ? "" : String(value).replace(/^\s+|\s+$/g, "");
  }

  // Values in the same order whatever order they were written in.
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

  // The conversation of the call, else its bearer, as a digest; "" when neither is known.
  api.scopeOf = function (contextObject) {
    var id = header(contextObject, "X-Convertigo-Conversation-Id");
    if (CONVERSATION_ID.test(id)) {
      return api.host.digest("before-guard 1\nconversation\n" + id);
    }
    var authorization = header(contextObject, "Authorization");
    return authorization.length ? api.host.digest("before-guard 1\ntoken\n" + authorization) : "";
  };

  api.itemDigest = function (requestable, variables) {
    return api.host.digest("before-guard 1\nitem\n" + text(requestable) + "\n" + canonical(variables || {}));
  };

  api.requestableDigest = function (requestable) {
    return api.host.digest("before-guard 1\nrequestable\n" + text(requestable));
  };

  function readScope(store, scope, now) {
    var map = store ? store.get(api.STORE_KEY) : null;
    var raw = map == null ? null : map.get(scope);
    var state = null;
    try {
      state = raw == null ? null : JSON.parse(String(raw));
    } catch (_unreadable) {}
    state = state && typeof state === "object" ? state : { at: 0, d: {}, r: {} };
    state.d = state.d && typeof state.d === "object" ? state.d : {};
    state.r = state.r && typeof state.r === "object" ? state.r : {};
    Object.keys(state.d).forEach(function (key) {
      if (!(now - Number(state.d[key]) < api.KEEP_MS)) {
        delete state.d[key];
      }
    });
    Object.keys(state.r).forEach(function (key) {
      var kept = (Array.isArray(state.r[key]) ? state.r[key] : []).filter(function (t) { return now - Number(t) < api.KEEP_MS; });
      if (kept.length) {
        state.r[key] = kept;
      } else {
        delete state.r[key];
      }
    });
    return state;
  }

  // items: [{requestable, variables}]. The refusal of the call ({index, requestable, message}) or null.
  api.check = function (store, scope, items, now) {
    if (!store || !scope) {
      return null;
    }
    var state = readScope(store, scope, now);
    for (var i = 0; i < items.length; i++) {
      var requestable = text(items[i].requestable);
      if (state.d[api.itemDigest(requestable, items[i].variables)] !== undefined) {
        return {
          index: i,
          requestable: requestable,
          message: "Refused without running anything: before[" + i + "] " + requestable + " already answered an error in this " +
            "conversation with these same values (a sign-in that failed fails again). Do not try it again nor guess other " +
            "values: ask the user once for a working test account (or take it from the project notes or project-brief), or " +
            "run the call with authenticatedUser (the user name the login sets) when the sequence only checks the user."
        };
      }
      var tries = state.r[api.requestableDigest(requestable)];
      if (Array.isArray(tries) && tries.length >= api.REQUESTABLE_TRIES) {
        return {
          index: i,
          requestable: requestable,
          message: "Refused without running anything: before[" + i + "] " + requestable + " already answered an error " +
            tries.length + " times in this conversation with different values. Trying values is guessing a password: stop. " +
            "Ask the user once for a working test account (or take it from the project notes or project-brief), or run the " +
            "call with authenticatedUser (the user name the login sets) when the sequence only checks the user."
        };
      }
    }
    return null;
  };

  // A before requestable answered an error with these values: kept as digests for the conversation.
  api.remember = function (store, scope, requestable, variables, now) {
    if (!store || !scope) {
      return;
    }
    if (store.get(api.STORE_KEY) == null) {
      store.set(api.STORE_KEY, api.host.newMap());
    }
    var map = store.get(api.STORE_KEY);
    var state = readScope(store, scope, now);
    var item = api.itemDigest(requestable, variables);
    var isNew = state.d[item] === undefined;
    state.d[item] = now;
    var req = api.requestableDigest(requestable);
    if (isNew) {
      state.r[req] = (state.r[req] || []).concat([now]);
    }
    var keys = Object.keys(state.d).sort(function (a, b) { return state.d[a] - state.d[b]; });
    while (keys.length > api.MAX_ITEMS) {
      delete state.d[keys.shift()];
    }
    var reqKeys = Object.keys(state.r);
    while (reqKeys.length > api.MAX_ITEMS) {
      delete state.r[reqKeys.shift()];
    }
    state.at = now;
    map.put(scope, JSON.stringify(state));
    // conversations past KEEP_MS or over MAX_SCOPES leave the store, the least recently written first; never this one
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
  };

  // In the engine, around C8O.requestable.runBefore. Never throws.
  api.refusal = function (contextObject, items) {
    try {
      return api.check(contextObject ? contextObject.server : null, api.scopeOf(contextObject), items, api.host.now());
    } catch (_ignoreCheck) {
      return null;
    }
  };

  api.failed = function (contextObject, requestable, variables) {
    try {
      api.remember(contextObject ? contextObject.server : null, api.scopeOf(contextObject), requestable, variables, api.host.now());
    } catch (_ignoreRemember) {}
  };
})();
