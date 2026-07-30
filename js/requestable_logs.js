if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.requestableLogs = C8O.requestableLogs || {};

(function () {
  var LogManager = Packages.com.twinsoft.convertigo.engine.admin.logmanager.LogManager;

  function parseIntBounded(value, defaultValue, minValue, maxValue) {
    var out = defaultValue;
    if (value !== null && value !== undefined) {
      try {
        var parsed = parseInt(String(value).trim(), 10);
        if (!isNaN(parsed)) {
          out = parsed;
        }
      } catch (_ignoreInt) {}
    }
    if (out < minValue) {
      out = minValue;
    }
    if (out > maxValue) {
      out = maxValue;
    }
    return out;
  }

  function parseMillis(value) {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === "number") {
      return value;
    }
    var text = String(value).trim();
    if (!text.length) {
      return null;
    }
    if (/^\d+$/.test(text)) {
      try {
        return java.lang.Long.parseLong(text);
      } catch (_ignoreLong) {}
    }
    try {
      var stamp = Date.parse(text);
      if (!isNaN(stamp)) {
        return stamp;
      }
    } catch (_ignoreDateParse) {}
    return null;
  }

  function lower(value) {
    return value == null ? "" : String(value).trim().toLowerCase();
  }

  function parseLineEntry(row, index) {
    var entry = {
      index: index,
      category: "",
      time: "",
      level: "",
      thread: "",
      message: "",
      extra: "",
      extras: {},
      extrasLower: {}
    };

    try { entry.category = String(row.get(0)); } catch (_ignoreCategory) {}
    try { entry.time = String(row.get(1)); } catch (_ignoreTime) {}
    try { entry.level = String(row.get(2)); } catch (_ignoreLevel) {}
    try { entry.thread = String(row.get(3)); } catch (_ignoreThread) {}
    try { entry.message = String(row.get(4)); } catch (_ignoreMessage) {}

    var extrasText = [];
    try {
      var length = row.length();
      for (var i = 5; i < length; i++) {
        var token = String(row.get(i));
        if (!token.length) {
          continue;
        }
        extrasText.push(token);
        var eq = token.indexOf("=");
        if (eq > 0) {
          var key = token.substring(0, eq);
          var value = token.substring(eq + 1);
          entry.extras[key] = value;
          entry.extrasLower[lower(key)] = lower(value);
        }
      }
    } catch (_ignoreExtras) {}

    if (extrasText.length) {
      entry.extra = extrasText.join(" ");
    }
    return entry;
  }

  function containsToken(value, token) {
    if (!token.length) {
      return true;
    }
    if (value === null || value === undefined) {
      return false;
    }
    return lower(value).indexOf(token) !== -1;
  }

  function containsAny(entry, token) {
    return containsToken(entry.message, token) || containsToken(entry.extra, token);
  }

  function containsExtraKeys(entry, keys, token) {
    if (!token.length) {
      return true;
    }
    for (var i = 0; i < keys.length; i++) {
      var key = lower(keys[i]);
      if (!key.length) {
        continue;
      }
      var value = entry.extrasLower[key];
      if (value && value.indexOf(token) !== -1) {
        return true;
      }
    }
    return false;
  }

  function matches(entry, options) {
    var categoryFilter = lower(options.category);
    if (categoryFilter.length && !containsToken(entry.category, categoryFilter)) {
      return false;
    }
    var contextIdFilter = lower(options.contextId);
    if (contextIdFilter.length) {
      var entryContextId = entry.extrasLower.contextid || "";
      if (!entryContextId.length || entryContextId !== contextIdFilter) {
        return false;
      }
    }
    var contextIdPrefixFilter = lower(options.contextIdPrefix);
    if (contextIdPrefixFilter.length) {
      var prefContextId = entry.extrasLower.contextid || "";
      if (!prefContextId.length || prefContextId.indexOf(contextIdPrefixFilter) !== 0) {
        return false;
      }
    }

    var projectFilter = lower(options.project);
    if (projectFilter.length && !containsExtraKeys(entry, ["project"], projectFilter)) {
      return false;
    }

    var requestableFilter = lower(options.requestable);
    if (requestableFilter.length && !containsExtraKeys(entry, ["sequence", "requestable", "transaction"], requestableFilter)) {
      return false;
    }

    var connectorFilter = lower(options.connector);
    if (connectorFilter.length && !containsExtraKeys(entry, ["connector"], connectorFilter)) {
      return false;
    }

    var transactionFilter = lower(options.transaction);
    if (transactionFilter.length && !containsExtraKeys(entry, ["transaction"], transactionFilter)) {
      return false;
    }

    return true;
  }

  C8O.requestableLogs.collect = function (options) {
    var opts = options || {};
    var now = java.lang.System.currentTimeMillis();
    var limitValue = parseIntBounded(opts.limit, 120, 1, 500);
    var timeoutValue = parseIntBounded(opts.timeoutMs, 250, 0, 10000);
    var fetchChunk = parseIntBounded(opts.fetchSize, 300, 20, 1000);
    if (fetchChunk < limitValue) {
      fetchChunk = limitValue;
    }

    var startMillis = parseMillis(opts.startTime);
    if (startMillis === null) {
      startMillis = now - 30000;
    }
    var endMillis = parseMillis(opts.endTime);
    if (endMillis === null) {
      endMillis = now + 1000;
    }
    if (endMillis < startMillis) {
      endMillis = startMillis + 1;
    }

    var maxScan = parseIntBounded(opts.maxScan, Math.max(limitValue * 20, 200), limitValue, 20000);

    var lines = [];
    var scanned = 0;
    var hasMore = false;
    var lm = null;

    try {
      lm = new LogManager();
      lm.setDateStart(new java.util.Date(startMillis));
      lm.setDateEnd(new java.util.Date(endMillis));
      lm.setMaxLines(fetchChunk);
      lm.setTimeout(timeoutValue);
      lm.setContinue(true);

      var guard = 0;
      while (lines.length < limitValue && lm.hasMoreResults() && scanned < maxScan && guard < 10000) {
        guard++;
        var rows = lm.getLines();
        var count = rows != null ? rows.length() : 0;
        if (count <= 0) {
          if (!lm.hasMoreResults()) {
            break;
          }
          continue;
        }
        for (var i = 0; i < count; i++) {
          var parsed = parseLineEntry(rows.getJSONArray(i), scanned);
          scanned++;
          if (matches(parsed, opts)) {
            delete parsed.extrasLower;
            lines.push(parsed);
            if (lines.length >= limitValue) {
              break;
            }
          }
          if (scanned >= maxScan) {
            break;
          }
        }
      }
      hasMore = lm.hasMoreResults() || scanned >= maxScan;
    } finally {
      if (lm != null) {
        try {
          lm.close();
        } catch (_ignoreClose) {}
      }
    }

    return {
      lines: lines,
      lineCount: lines.length,
      hasMore: hasMore,
      query: {
        category: opts.category == null ? "" : String(opts.category),
        contextId: opts.contextId == null ? "" : String(opts.contextId),
        project: opts.project == null ? "" : String(opts.project),
        requestable: opts.requestable == null ? "" : String(opts.requestable),
        connector: opts.connector == null ? "" : String(opts.connector),
        transaction: opts.transaction == null ? "" : String(opts.transaction),
        startMillis: startMillis,
        endMillis: endMillis,
        limit: limitValue,
        scanned: scanned
      }
    };
  };
})();
