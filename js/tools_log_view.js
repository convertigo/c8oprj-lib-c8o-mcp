include("js/util.js");

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

function parseDateMillis(value) {
  if (value === null || value === undefined) {
    return null;
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
  // The form of the log lines themselves (2026-10-17 14:19:01,502), with T or a space and no offset,
  // is the Studio's local time; Rhino's Date.parse rejects it.
  var local = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,3}))?)?)?$/.exec(text);
  if (local) {
    return new Date(+local[1], +local[2] - 1, +local[3], +(local[4] || 0), +(local[5] || 0),
      +(local[6] || 0), +((local[7] || "0") + "00").substring(0, 3)).getTime();
  }
  try {
    var stamp = Date.parse(text);
    if (!isNaN(stamp)) {
      return stamp;
    }
  } catch (_ignoreDateParse) {}
  throw new Error("Unreadable date \"" + text + "\": use epoch millis or YYYY-MM-DD HH:mm:ss (Studio local time, as in the log lines).");
}

function lowerToken(value) {
  return value == null ? "" : String(value).trim().toLowerCase();
}

function pickFirstNonEmpty(primary, secondary) {
  var p = primary == null ? "" : String(primary).trim();
  if (p.length) {
    return primary;
  }
  var s = secondary == null ? "" : String(secondary).trim();
  if (s.length) {
    return secondary;
  }
  return primary;
}

function containsExpr(scopeVar, token) {
  var encoded = JSON.stringify(String(token));
  return "(typeof " + scopeVar + " !== 'undefined' && String(" + scopeVar + ").toLowerCase().indexOf(" + encoded + ") !== -1)";
}

function messageContainsExpr(token) {
  var encoded = JSON.stringify(String(token));
  return "(message.toLowerCase().indexOf(" + encoded + ") !== -1)";
}

function buildFilterExpression(options) {
  var parts = [];

  var categoryValue = lowerToken(options.category);
  if (categoryValue.length) {
    parts.push(containsExpr("category", categoryValue));
  }

  var levelValue = lowerToken(options.level);
  if (levelValue.length) {
    parts.push(containsExpr("level", levelValue));
  }

  var threadValue = lowerToken(options.thread);
  if (threadValue.length) {
    parts.push(containsExpr("thread", threadValue));
  }

  // A line that carries its project is kept only for that project: the message test brought back the Assistant's and the
  // MCP's lines that quote the project name (run 9a). Lines without a project context are still matched on their message,
  // except the MCP's own JSON-RPC answers, which quote the project of every tool call.
  var projectValue = lowerToken(options.project);
  if (projectValue.length) {
    parts.push("(typeof project !== 'undefined' ? String(project).toLowerCase().indexOf(" + JSON.stringify(projectValue) + ") !== -1 : (" +
      messageContainsExpr(projectValue) + " && message.indexOf('jsonrpc') === -1))");
  }

  var requestableValue = lowerToken(options.requestable);
  if (requestableValue.length) {
    parts.push("(" + containsExpr("sequence", requestableValue) + " || " + containsExpr("requestable", requestableValue) + " || " + messageContainsExpr(requestableValue) + ")");
  }

  var connectorValue = lowerToken(options.connector);
  if (connectorValue.length) {
    parts.push("(" + containsExpr("connector", connectorValue) + " || " + messageContainsExpr(connectorValue) + ")");
  }

  var transactionValue = lowerToken(options.transaction);
  if (transactionValue.length) {
    parts.push("(" + containsExpr("transaction", transactionValue) + " || " + messageContainsExpr(transactionValue) + ")");
  }

  var textValue = lowerToken(options.text);
  if (textValue.length) {
    parts.push("(" + messageContainsExpr(textValue) + " || " + containsExpr("extra", textValue) + ")");
  }

  var rawFilter = options.filter == null ? "" : String(options.filter).trim();
  if (rawFilter.length) {
    parts.push("(" + rawFilter + ")");
  }

  if (!parts.length) {
    return "";
  }
  return parts.join(" && ");
}

function parseLineEntry(row, index) {
  var entry = {
    index: index,
    category: "",
    time: "",
    level: "",
    thread: "",
    message: "",
    extras: {}
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
      }
    }
  } catch (_ignoreExtras) {}

  if (extrasText.length) {
    entry.extra = extrasText.join(" ");
  }
  return entry;
}

var limitValue = parseIntBounded(limit, 100, 1, 500);
var startOffset = parseIntBounded(_nextCursor, 0, 0, 1000000000);
var timeoutValue = parseIntBounded(timeoutMs, 200, 0, 10000);
var textInput = pickFirstNonEmpty(text, typeof q !== "undefined" ? q : null);
var startDateInput = pickFirstNonEmpty(startDate, typeof since !== "undefined" ? since : null);
var endDateInput = pickFirstNonEmpty(endDate, typeof until !== "undefined" ? until : null);
var filterExpression = buildFilterExpression({
  filter: filter,
  text: textInput,
  level: level,
  category: category,
  project: project,
  requestable: requestable,
  connector: connector,
  transaction: transaction,
  thread: thread
});

var startDateMillis = parseDateMillis(startDateInput);
var endDateMillis = parseDateMillis(endDateInput);

// The newest lines come first by default: an agent reading the logs after a failed call wants the last lines, and the
// oldest-first page started hours earlier (run 9a). Without a lower bound, newest reads the last 24 hours.
var orderValue = String(typeof order !== "undefined" && order !== null ? order : "").trim().toLowerCase() === "oldest" ? "oldest" : "newest";
var sinceDefaulted = false;
if (orderValue === "newest" && startDateMillis === null) {
  startDateMillis = new Date().getTime() - 24 * 3600 * 1000;
  sinceDefaulted = true;
}
var MAX_NEWEST_SCAN = 50000;
var newestScanned = 0;
var newestCapped = false;
var readFromMillis = startDateMillis;

var maxNeeded = startOffset + limitValue + 1;
var fetchChunk = parseIntBounded(fetchSize, 200, 20, 1000);
if (fetchChunk < limitValue) {
  fetchChunk = limitValue;
}

var allLines = [];
var hasMoreResults = false;

function openLogManager(fromMillis) {
  var manager = new LogManager();
  if (filterExpression.length) {
    manager.setFilter(filterExpression);
  }
  if (fromMillis !== null) {
    manager.setDateStart(new java.util.Date(fromMillis));
  }
  if (endDateMillis !== null) {
    manager.setDateEnd(new java.util.Date(endDateMillis));
  }
  manager.setMaxLines(fetchChunk);
  manager.setTimeout(timeoutValue);
  manager.setContinue(true);
  return manager;
}

// Reads from fromMillis to the end of the range, keeping only the last maxNeeded lines. A fetch can come back empty
// while the filter is still scanning (timeoutMs): only hasMoreResults ends the range, and deadline bounds the read.
function readNewestTail(fromMillis, deadline) {
  var manager = openLogManager(fromMillis);
  var read = { tail: [], scanned: 0, capped: false };
  try {
    var guard = 0;
    while (manager.hasMoreResults() && guard < 10000 && read.scanned < MAX_NEWEST_SCAN) {
      guard++;
      if (new Date().getTime() > deadline) {
        read.capped = true;
        break;
      }
      var rows = manager.getLines();
      var count = rows != null ? rows.length() : 0;
      for (var n = 0; n < count; n++) {
        read.tail.push(rows.getJSONArray(n));
        read.scanned++;
        if (read.tail.length > maxNeeded) {
          read.tail.shift();
        }
      }
    }
    read.capped = read.capped || read.scanned >= MAX_NEWEST_SCAN;
  } finally {
    try {
      manager.close();
    } catch (_ignoreClose) {}
  }
  return read;
}

if (orderValue === "newest") {
  // The filter is evaluated on every line: reading 24 hours took 15 s. Without since, read the last 15 minutes,
  // then 2 hours, then 24 hours, and stop as soon as a window holds enough lines.
  var nowMillis = new Date().getTime();
  var windows = sinceDefaulted ? [nowMillis - 15 * 60 * 1000, nowMillis - 2 * 3600 * 1000, startDateMillis] : [startDateMillis];
  var deadline = nowMillis + 20000;
  var read = null;
  for (var w = 0; w < windows.length; w++) {
    read = readNewestTail(windows[w], deadline);
    readFromMillis = windows[w];
    if (read.tail.length >= maxNeeded || read.capped) {
      break;
    }
  }
  newestScanned = read.scanned;
  newestCapped = read.capped;
  for (var t = read.tail.length - 1; t >= 0; t--) {
    allLines.push(parseLineEntry(read.tail[t], allLines.length));
  }
  hasMoreResults = newestScanned > allLines.length || readFromMillis !== startDateMillis;
} else {
  var lm = openLogManager(startDateMillis);
  try {
    var guard = 0;
    while (allLines.length < maxNeeded && lm.hasMoreResults() && guard < 10000) {
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
        allLines.push(parseLineEntry(rows.getJSONArray(i), allLines.length));
        if (allLines.length >= maxNeeded) {
          break;
        }
      }
    }
    hasMoreResults = lm.hasMoreResults();
  } finally {
    try {
      lm.close();
    } catch (_ignoreClose) {}
  }
}

var effectiveStart = startOffset;
if (effectiveStart > allLines.length) {
  effectiveStart = allLines.length;
}
var endOffset = effectiveStart + limitValue;
if (endOffset > allLines.length) {
  endOffset = allLines.length;
}

// A log line can hold a whole SQL result or a stack trace: 20 lines once made 80 000 characters, more than an
// agent can read in one tool result. Long messages keep their start and end, and the page stops at ~24 000
// characters; the cursor continues from the first line left out.
var MAX_MESSAGE_CHARS = 2000;
var MAX_PAGE_CHARS = 24000;
var returnedLines = [];
var pageChars = 0;
var cutMessages = 0;
for (var p = effectiveStart; p < endOffset; p++) {
  var line = allLines[p];
  if (line && typeof line.message === "string" && line.message.length > MAX_MESSAGE_CHARS) {
    var cut = line.message.length - 1900;
    line.message = line.message.substring(0, 1500) + " … [" + cut + " characters cut] … " + line.message.substring(line.message.length - 400);
    cutMessages++;
  }
  var size = JSON.stringify(line).length;
  if (returnedLines.length && pageChars + size > MAX_PAGE_CHARS) {
    endOffset = p;
    break;
  }
  pageChars += size;
  returnedLines.push(line);
}

var hasMore = hasMoreResults || (allLines.length > endOffset);
var nextCursor = hasMore ? String(endOffset) : "";

logViewLines = returnedLines;
logViewQuery = {
  startIndex: effectiveStart,
  limit: limitValue,
  returned: returnedLines.length,
  scanned: orderValue === "newest" ? newestScanned : allLines.length,
  hasMore: hasMore,
  nextCursor: nextCursor,
  filterExpression: filterExpression,
  text: textInput == null ? "" : String(textInput),
  startDate: startDateMillis,
  endDate: endDateMillis,
  timeoutMs: timeoutValue,
  order: orderValue,
  cutMessages: cutMessages,
  note: [
    orderValue === "newest" ? "Newest lines first" + (sinceDefaulted ? ", read back from now up to 24 hours (pass since for older ones)" : "") +
      (newestCapped ? "; the read stopped after " + newestScanned + " matching lines (" + MAX_NEWEST_SCAN + " lines or 20 s), so newer ones may be missing: narrow with since or q" : "") +
      "; the cursor goes back in time." : "",
    cutMessages || returnedLines.length < limitValue && hasMore
      ? "Long messages are cut in the middle and a page stops near " + MAX_PAGE_CHARS + " characters: continue with cursor, or narrow with q, level or the dates."
      : ""
  ].filter(function (x) { return x.length; }).join(" ")
};
logViewHasMore = hasMore;
logViewNextCursor = nextCursor;
