if (typeof C8O === "undefined") {
  var C8O = {};
}

// Vibe 3 opens an MCP session of its own for each tool call (its Unified Harness pools stdio servers only): initialize,
// notifications/initialized, tools/call, then a tools/list that the MCP Python SDK of that session sends after every call
// that worked, to read the output schema of the tool (ClientSession._validate_tool_result: a new session has none). Each
// of those tools/list built the whole catalog again, two sequence calls per tool: 1.25 s for the 15 No Code tools on
// test-nocode (16/11), once per Vibe tool call. The answer of a tools/list is now kept KEEP_MS in the store the server
// shares between requests, for the same request only: the same credentials (Authorization, Cookie), the same
// X-Convertigo-* headers, User-Agent and MCP-Protocol-Version, the same query string and paging, the same token kind,
// scope and user, and the same loaded lib_ConvertigoMCP (a reload or another version is another key). What else decides
// the catalog (engine symbols such as the feedback policy) is read again at most KEEP_MS later.
(function () {
  var api = C8O.mcpToolsListCache = C8O.mcpToolsListCache || {};
  var STORE_KEY = "lib_ConvertigoMCP.toolsListCache";
  api.KEEP_MS = 60000;
  api.MAX_ENTRIES = 32;
  // A low-code catalog answers about 430 000 characters; a bigger answer is not kept.
  api.MAX_CHARS = 1000000;
  // Answered on every tools/list that went through the cache: hit (the kept answer) or miss (built, then kept).
  api.HEADER = "X-Convertigo-Tools-List-Cache";

  var KEY_HEADERS = { "authorization": true, "cookie": true, "user-agent": true, "mcp-protocol-version": true };

  function text(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  // The same params in another key order are the same request.
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

  // _meta.progressToken changes with each request and decides nothing in the catalog; a _meta left empty is no _meta.
  function paramsForKey(params) {
    if (!params || typeof params !== "object" || Array.isArray(params)) {
      return {};
    }
    var out = {};
    Object.keys(params).forEach(function (key) {
      var value = params[key];
      if (key === "_meta" && value && typeof value === "object" && !Array.isArray(value)) {
        var meta = {};
        var kept = 0;
        Object.keys(value).forEach(function (metaKey) {
          if (metaKey !== "progressToken") {
            meta[metaKey] = value[metaKey];
            kept++;
          }
        });
        if (!kept) {
          return;
        }
        value = meta;
      }
      out[key] = value;
    });
    return out;
  }

  // The headers that identify the requester and choose its catalog, in a fixed order, then the query string.
  api.requestText = function (request) {
    var lines = [];
    var seen = {};
    var names = request.getHeaderNames();
    while (names != null && names.hasMoreElements()) {
      var lower = text(names.nextElement()).toLowerCase();
      if (seen[lower] === true || (KEY_HEADERS[lower] !== true && lower.indexOf("x-convertigo-") !== 0)) {
        continue;
      }
      seen[lower] = true;
      var values = [];
      var all = request.getHeaders(lower);
      while (all != null && all.hasMoreElements()) {
        values.push(text(all.nextElement()));
      }
      lines.push(lower + ": " + values.join("\n "));
    }
    lines.sort();
    lines.push("?" + text(request.getQueryString()));
    return lines.join("\n");
  };

  // The loaded MCP project: its name, version and the instance the engine holds, which a reload replaces.
  api.projectStamp = function (contextObject) {
    try {
      var name = text(contextObject.project.getName());
      var manager = Packages.com.twinsoft.convertigo.engine.Engine.theApp.databaseObjectsManager;
      var original = manager.getOriginalProjectByName(name, false);
      return name + "@" + text(original.getVersion()) + "#" + java.lang.System.identityHashCode(original);
    } catch (_noProject) {
      return "";
    }
  };

  api.digest = function (value) {
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
  };

  // "" when the request cannot be told apart from another one: no HTTP request, or no loaded project.
  api.key = function (contextObject, input) {
    var request = contextObject ? contextObject.httpServletRequest : null;
    if (!request) {
      return "";
    }
    var project = api.projectStamp(contextObject);
    if (!project.length) {
      return "";
    }
    var auth = input && input.authentication ? input.authentication : {};
    return api.digest([
      "tools/list 1",
      api.requestText(request),
      "params " + canonical(paramsForKey(input ? input.params : null)),
      "auth " + text(auth.kind) + "|" + text(auth.scope) + "|" + text(auth.user),
      "project " + project
    ].join("\n"));
  };

  // store: {get(key), set(key, value)} (context.server); its map holds "<at>\n<answer JSON>" per key.
  api.read = function (store, key, now) {
    if (!store || !key) {
      return null;
    }
    var answers = store.get(STORE_KEY);
    var kept = answers == null ? null : answers.get(key);
    if (kept == null) {
      return null;
    }
    kept = String(kept);
    var cut = kept.indexOf("\n");
    var at = cut > 0 ? Number(kept.substring(0, cut)) : NaN;
    if (!(now - at >= 0 && now - at < api.KEEP_MS)) {
      answers.remove(key);
      return null;
    }
    try {
      return JSON.parse(kept.substring(cut + 1));
    } catch (_unreadable) {
      answers.remove(key);
      return null;
    }
  };

  api.write = function (store, newMap, key, answer, now) {
    if (!store || !key || !answer || typeof answer !== "object" || !Array.isArray(answer.tools)) {
      return false;
    }
    var json = JSON.stringify(answer);
    if (json.length > api.MAX_CHARS) {
      return false;
    }
    // context.server has no putIfAbsent: of two first writes at once, one map is kept
    if (store.get(STORE_KEY) == null) {
      store.set(STORE_KEY, newMap());
    }
    var answers = store.get(STORE_KEY);
    var oldestKey = null;
    var oldestAt = Infinity;
    var entries = answers.entrySet().iterator();
    while (entries.hasNext()) {
      var entry = entries.next();
      var value = String(entry.getValue());
      var at = Number(value.substring(0, Math.max(0, value.indexOf("\n"))));
      if (!(now - at >= 0 && now - at < api.KEEP_MS)) {
        entries.remove();
      } else if (at < oldestAt) {
        oldestAt = at;
        oldestKey = entry.getKey();
      }
    }
    if (answers.size() >= api.MAX_ENTRIES && oldestKey !== null && answers.get(key) == null) {
      answers.remove(oldestKey);
    }
    answers.put(key, String(now) + "\n" + json);
    return true;
  };

  function now() {
    return Number(java.lang.System.currentTimeMillis());
  }

  // The router: the kept answer of this tools/list, or null. Sets the key the endpoint keeps a built answer under.
  api.lookup = function (contextObject, input) {
    try {
      var key = api.key(contextObject, input);
      if (!key.length) {
        return { key: "", answer: null };
      }
      var answer = api.read(contextObject.server, key, now());
      try {
        contextObject.httpServletResponse.setHeader(api.HEADER, answer === null ? "miss" : "hit");
      } catch (_ignoreHeader) {}
      return { key: answer === null ? key : "", answer: answer };
    } catch (_ignoreLookup) {
      return { key: "", answer: null };
    }
  };

  // The endpoint, once mcp_tools_list answered: keeps that answer.
  api.keep = function (contextObject, key, answer) {
    try {
      return api.write(contextObject ? contextObject.server : null, function () {
        return new java.util.concurrent.ConcurrentHashMap();
      }, key, answer, now());
    } catch (_ignoreKeep) {
      return false;
    }
  };
})();
