var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
var XMLUtils = Packages.com.twinsoft.convertigo.engine.util.XMLUtils;
var YamlConverter = Packages.com.twinsoft.convertigo.engine.util.YamlConverter;
var Pattern = Packages.java.util.regex.Pattern;

var sourceQName = C8O.util.toTrimmedString(qname);
var searchRaw = filter == null ? "" : String(filter);
var searchText = searchRaw.trim();
var matchCaseFlag = C8O.util.toBoolean(matchCase, false) === true;
var useRegExpFlag = C8O.util.toBoolean(useRegExp, false) === true;
var objectTypeText = objectType == null ? "*" : String(objectType).trim();
if (!objectTypeText.length) {
  objectTypeText = "*";
}

var defaultLimit = 200;
var maxLimit = 1000;
var limitValue = defaultLimit;
if (limit != null) {
  try {
    var parsedLimit = parseInt(String(limit).trim(), 10);
    if (!isNaN(parsedLimit)) {
      limitValue = parsedLimit;
    }
  } catch (_ignoredLimit) {}
}
if (limitValue < 1) { limitValue = 1; }
if (limitValue > maxLimit) { limitValue = maxLimit; }

var cursorRaw = "";
if (_nextCursor !== undefined && _nextCursor !== null) {
  var cursorText = String(_nextCursor).trim();
  if (cursorText.length && cursorText.toLowerCase() !== "undefined" && cursorText.indexOf("org.mozilla.javascript.Undefined") !== 0) {
    cursorRaw = cursorText;
  }
}
var startIndex = 0;
if (cursorRaw.length > 0) {
  try {
    var parsedCursor = parseInt(cursorRaw, 10);
    if (!isNaN(parsedCursor) && parsedCursor >= 0) {
      startIndex = parsedCursor;
    }
  } catch (_ignoredCursor) {}
}
var pageUpperBound = startIndex + limitValue;

var searchActive = searchText.length > 0;
var pattern = null;
var substringText = matchCaseFlag ? searchText : searchText.toLowerCase();
if (useRegExpFlag && searchActive) {
  try {
    pattern = matchCaseFlag ? Pattern.compile(searchText) : Pattern.compile(searchText, Pattern.CASE_INSENSITIVE);
  } catch (_ignoredPattern) {}
}

var manager = Engine.theApp.databaseObjectsManager;
var matchesWindow = [];
var scanned = 0;
var totalMatches = 0;
var hasMore = false;
var snippetRadius = 20;

function buildRecord(dbo, depth, contextSnippet) {
  var record = {};
  var qnameInfo = C8O.dbo.buildQNameInfo ? C8O.dbo.buildQNameInfo(dbo) : {
    canonicalQName: C8O.dbo.safeQName(dbo),
    legacyQName: C8O.dbo.safeQName(dbo)
  };
  record.qname = qnameInfo.canonicalQName;
  record.canonicalQName = qnameInfo.canonicalQName;
  record.legacyQName = qnameInfo.legacyQName;
  try { record.name = String(dbo.getName()); } catch (_ignoredNameField) { record.name = ""; }
  var comment = "";
  try {
    var rawComment = dbo.getComment();
    if (rawComment != null) {
      comment = String(rawComment).replace(/\s+/g, " ").trim();
    }
  } catch (_ignoredComment) {}
  if (comment.length > 512) {
    comment = comment.substring(0, 509) + "...";
  }
  if (comment.length > 0) {
    record.comment = comment;
  }
  try { record.className = C8O.util.fromFqcn ? C8O.util.fromFqcn(dbo.getClass().getName()) : dbo.getClass().getName(); } catch (_ignoredCls) { record.className = ""; }
  var priorityValue = null;
  try {
    if (dbo.priority !== undefined && dbo.priority !== null) {
      priorityValue = String(dbo.priority);
    }
  } catch (_ignoredPriority) {}
  if (priorityValue && priorityValue.length && priorityValue !== "0") {
    record.priority = priorityValue;
  }
  try {
    record.databaseType = dbo.getDatabaseType ? String(dbo.getDatabaseType()) : "";
  } catch (_ignoredDbType) {
    record.databaseType = "";
  }
  if (contextSnippet && contextSnippet.length) {
    record.context = contextSnippet;
  }
  return record;
}

function matchesObjectType(dbo) {
  if (objectTypeText === "*" || objectTypeText.length === 0) {
    return true;
  }
  try {
    return objectTypeText.equalsIgnoreCase ? objectTypeText.equalsIgnoreCase(dbo.getDatabaseType()) : objectTypeText === dbo.getDatabaseType();
  } catch (_ignoredType) {
    try {
      return objectTypeText === String(dbo.getDatabaseType());
    } catch (_ignoredStringType) {
      return false;
    }
  }
}

function extractSnippet(text, start, end) {
  if (text == null) {
    return "";
  }
  var left = Math.max(0, start - snippetRadius);
  var right = Math.min(text.length, end + snippetRadius);
  var snippet = text.substring(left, right);
  if (left > 0) {
    snippet = "..." + snippet;
  }
  if (right < text.length) {
    snippet = snippet + "...";
  }
  return snippet;
}

function matchesSearch(dbo) {
  if (!searchActive) {
    return null;
  }
  var text = "";
  try {
    text = YamlConverter.toYaml(dbo.toXml(XMLUtils.createDom()));
  } catch (_ignoredYaml) {
    try {
      text = dbo.toString();
    } catch (_ignoredToString) {
      text = "";
    }
  }
  if (text == null) {
    text = "";
  }
  text = String(text);
  if (useRegExpFlag && pattern != null) {
    try {
      var matcher = pattern.matcher(text);
      if (matcher.find()) {
        return extractSnippet(text, matcher.start(), matcher.end());
      }
    } catch (_ignoredPatternMatch) {}
    return null;
  }
  var haystack = matchCaseFlag ? text : text.toLowerCase();
  var idx = haystack.indexOf(substringText);
  if (idx !== -1) {
    return extractSnippet(text, idx, idx + substringText.length);
  }
  return null;
}

if (searchActive) {
  var stack = [];
  var projectNames = manager.getAllProjectNamesList();

  function pushNode(dbo, depth) {
    if (!dbo) {
      return;
    }
    stack.push({ dbo: dbo, depth: depth });
  }

  if (sourceQName.length > 0) {
    var rootDbo = C8O.dbo.resolve(sourceQName, { messagePrefix: "qname" });
    pushNode(rootDbo, 0);
  } else {
    for (var i = 0; i < projectNames.size(); i++) {
      var projectName = projectNames.get(i);
      try {
        var project = manager.getOriginalProjectByName(projectName);
        if (project != null) {
          pushNode(project, 0);
        }
      } catch (_ignoredProject) {}
    }
  }

  var abortSearch = false;

  while (stack.length > 0) {
    if (abortSearch) {
      break;
    }
    var entry = stack.pop();
    var dbo = entry.dbo;
    var depth = entry.depth || 0;
    if (!dbo) {
      continue;
    }
    scanned++;
    var typeMatch = matchesObjectType(dbo);
    var snippet = typeMatch ? matchesSearch(dbo) : null;
    var searchMatch = typeMatch && snippet !== null;
    if (searchMatch) {
      var currentIndex = totalMatches;
      totalMatches++;
      if (currentIndex >= startIndex && matchesWindow.length < limitValue) {
        var record = buildRecord(dbo, depth, snippet);
        matchesWindow.push(record);
      } else if (currentIndex >= pageUpperBound) {
        hasMore = true;
        abortSearch = true;
        break;
      }
    }
    var children = null;
    try {
      children = dbo.getDatabaseObjectChildren();
    } catch (_ignoredChildren) {}
    if (children != null) {
      for (var idx = children.size() - 1; idx >= 0; idx--) {
        var child = children.get(idx);
        if (child != null) {
          stack.push({ dbo: child, depth: depth + 1 });
        }
      }
    }
  }
}

var nextCursorValue = hasMore ? String(startIndex + matchesWindow.length) : "";
searchQuery = {
  qname: sourceQName,
  search: searchRaw,
  matchCase: matchCaseFlag,
  useRegExp: useRegExpFlag,
  objectType: objectTypeText,
  limit: limitValue,
  active: searchActive,
  startIndex: startIndex,
  cursorInput: cursorRaw
};
searchSummary = {
  scanned: scanned,
  returned: matchesWindow.length,
  hasMore: hasMore,
  startIndex: startIndex,
  limit: limitValue,
  cursorInput: cursorRaw,
  nextCursor: nextCursorValue,
  timestamp: java.lang.System.currentTimeMillis()
};
searchMatches = matchesWindow;
nextCursorToken = nextCursorValue;

