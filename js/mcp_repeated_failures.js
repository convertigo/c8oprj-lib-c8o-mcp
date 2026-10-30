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
    return digest(trim(toolName).toLowerCase() + "\n" + canonical(args || {}));
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

  // signature: "" for a call that worked, which forgets the failures of the same call.
  api.afterCall = function (contextObject, callKey, signature) {
    try {
      return api.record(contextObject ? contextObject.server : null, function () {
        return new java.util.concurrent.ConcurrentHashMap();
      }, api.sessionKey(contextObject), callKey, signature, Number(java.lang.System.currentTimeMillis()));
    } catch (_ignoreRepeat) {
      return "";
    }
  };
})();
