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
// A cursor "p<projects>.<objects>.<matches>" goes on where the scan stopped: the projects finished before are skipped
// without being loaded, the objects of the project in progress scanned before are walked, not read, and the matches
// are counted from <matches>. A plain number (older answers) counts matches from the start.
var resumeProjects = 0;
var resumeObjects = 0;
var resumed = false;
if (cursorRaw.length > 0) {
  var scanCursor = /^p(\d+)\.(\d+)\.(\d+)$/.exec(cursorRaw);
  if (scanCursor) {
    resumed = true;
    resumeProjects = parseInt(scanCursor[1], 10);
    resumeObjects = parseInt(scanCursor[2], 10);
    startIndex = parseInt(scanCursor[3], 10);
  } else {
    try {
      var parsedCursor = parseInt(cursorRaw, 10);
      if (!isNaN(parsedCursor) && parsedCursor >= 0) {
        startIndex = parsedCursor;
      }
    } catch (_ignoredCursor) {}
  }
}
var pageUpperBound = startIndex + limitValue;

var searchActive = searchText.length > 0;

// A * in qname makes it a QName pattern (App.*.q_top): looked up as a QName, it was never found (17/11). The scan runs
// under its leading segments without *, all projects when there are none, and keeps the objects whose full QName
// matches: * stands for any characters, dots included; a segment written without its type prefix (cn:, tr:, sq:...)
// matches with any, as in C8O.dbo.resolve, and one written with a prefix keeps it.
var qnamePattern = null;
var rootQName = sourceQName;
if (sourceQName.indexOf("*") !== -1) {
  var patternSegments = sourceQName.split(".");
  var fixedSegments = [];
  for (var ps = 0; ps < patternSegments.length && patternSegments[ps].indexOf("*") === -1; ps++) {
    fixedSegments.push(patternSegments[ps]);
  }
  rootQName = fixedSegments.join(".");
  qnamePattern = new RegExp("^" + patternSegments.map(function (segment) {
    var typed = /^([A-Za-z]{1,4}:)(.*)$/.exec(segment);
    return (typed ? typed[1] : "(?:[A-Za-z]{1,4}:)?") + (typed ? typed[2] : segment).split("*").map(function (part) {
      return part.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }).join(".*");
  }).join("\\.") + "$", matchCaseFlag ? "" : "i");
}
var typeActive = objectTypeText !== "*";
// qname alone, without *, answers the object at that QName: an agent checking that an object exists, or what it is,
// got "filter is required" (17/11).
var singleObject = !searchActive && !typeActive && qnamePattern === null && sourceQName.length > 0;
if (!searchActive && !typeActive && !sourceQName.length) {
  // Without any, the search scanned nothing and answered no match, which read as "not found" (run 9a).
  throw new Error("filter is required: the text to find (space-separated terms that must all appear in the object's YAML), or objectType to list one type. qname limits the search to a project or a subtree; alone, it answers the object at that QName, and with * it is a QName pattern (App.*.q_*).");
}
var pattern = null;
var substringText = matchCaseFlag ? searchText : searchText.toLowerCase();
if (useRegExpFlag && searchActive) {
  try {
    // MULTILINE so ^ and $ also match line boundaries in the object's YAML.
    pattern = matchCaseFlag ? Pattern.compile(searchText, Pattern.MULTILINE) : Pattern.compile(searchText, Pattern.CASE_INSENSITIVE | Pattern.MULTILINE);
  } catch (_ignoredPattern) {}
}

var manager = Engine.theApp.databaseObjectsManager;
var matchesWindow = [];
var scanned = 0;
var totalMatches = 0;
// A common word matched 200 objects with their comments and snippets: 50 000 characters (preflight checks). The page
// also stops near MAX_MATCHES_CHARS of matches as Vibe 3.1 prints them, indented by 2 (each record measured so, plus
// its place in the matches array), under the 16 000 characters over which Vibe saves the answer to a file the agent
// then reads with bash; nextCursor goes on.
var MAX_MATCHES_CHARS = 13000;
var matchesChars = 0;
var hasMore = false;
// A search across the projects of a customer's Studio ran 405 s (TigoAccess 174f1807, 24/11): the client had failed the
// call after a minute. The scan stops after SEARCH_TIME_BUDGET_MS and answers what it found, with a cursor that goes on
// from the object it stopped at.
var SEARCH_TIME_BUDGET_MS = 20000;
var searchStartedAt = Number(java.lang.System.currentTimeMillis());
var timeBudgetReached = false;
// the position of the scan: objects scanned before the next one, and matches counted before it
var scanPosition = null;
var projectsTotal = 0;
// the project entries taken from the stack (skipped ones included), and the objects scanned in the current project (or
// under qname)
var projectsReached = 0;
var inProject = 0;
// objects read (not walked) by this call: the budget stops a call only once it read one, so every call goes on
var evaluated = 0;
if (resumed) {
  // the matches before the cursor were counted by the calls before
  totalMatches = startIndex;
}
// Where the next call goes on: before the next entry of the stack (atNext), or before the object just taken.
function positionOf(atNext) {
  var nextIsProject = atNext && stack.length > 0 && stack[stack.length - 1].projectName !== undefined;
  if (projectsTotal === 0) {
    return { projects: 0, objects: atNext ? inProject : inProject - 1, matches: totalMatches };
  }
  return nextIsProject
    ? { projects: projectsReached, objects: 0, matches: totalMatches }
    : { projects: Math.max(0, projectsReached - 1), objects: atNext ? inProject : inProject - 1, matches: totalMatches };
}
var snippetRadius = 20;

function buildRecord(dbo, depth, contextSnippet) {
  var record = {};
  record.qname = C8O.dbo.safeFullQName ? C8O.dbo.safeFullQName(dbo) : C8O.dbo.safeQName(dbo);
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

// objectType accepts the database type returned in matches ("Step", "Sequence", "Variable"...)
// and the class tokens used everywhere else ("steps.SequenceStep", or "SequenceStep").
var objectTypeLower = objectTypeText.toLowerCase();
function matchesObjectType(dbo) {
  if (objectTypeText === "*" || objectTypeText.length === 0) {
    return true;
  }
  var candidates = [];
  try {
    candidates.push(String(dbo.getDatabaseType()));
  } catch (_ignoredType) {}
  try {
    var fqcn = String(dbo.getClass().getName());
    candidates.push(C8O.util.fromFqcn ? String(C8O.util.fromFqcn(fqcn)) : fqcn);
    candidates.push(fqcn.substring(fqcn.lastIndexOf(".") + 1));
    candidates.push(fqcn);
  } catch (_ignoredClass) {}
  for (var ci = 0; ci < candidates.length; ci++) {
    if (candidates[ci].toLowerCase() === objectTypeLower) {
      return true;
    }
  }
  return false;
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

function matchesQNamePattern(dbo) {
  if (qnamePattern === null) {
    return true;
  }
  return qnamePattern.test(C8O.dbo.safeFullQName ? C8O.dbo.safeFullQName(dbo) : C8O.dbo.safeQName(dbo));
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
    // The regex is tried on the object name first, so ^call finds callProbeA.
    try {
      var objectName = String(dbo.getName());
      var nameMatcher = pattern.matcher(objectName);
      if (nameMatcher.find()) {
        return extractSnippet(objectName, nameMatcher.start(), nameMatcher.end());
      }
    } catch (_ignoredNameMatch) {}
    try {
      var matcher = pattern.matcher(text);
      if (matcher.find()) {
        return extractSnippet(text, matcher.start(), matcher.end());
      }
    } catch (_ignoredPatternMatch) {}
    return null;
  }
  // Space-separated terms must all be present (as the tool description says); the snippet
  // is taken around the first term.
  var haystack = matchCaseFlag ? text : text.toLowerCase();
  var terms = substringText.split(/\s+/);
  var firstIdx = -1;
  for (var ti = 0; ti < terms.length; ti++) {
    if (!terms[ti].length) {
      continue;
    }
    var termIdx = haystack.indexOf(terms[ti]);
    if (termIdx === -1) {
      return null;
    }
    if (firstIdx === -1) {
      firstIdx = termIdx;
      var firstLength = terms[ti].length;
    }
  }
  if (firstIdx !== -1) {
    return extractSnippet(text, firstIdx, firstIdx + firstLength);
  }
  return null;
}

if (singleObject) {
  var singleDbo = C8O.dbo.resolve(sourceQName, { messagePrefix: "qname" });
  scanned = 1;
  totalMatches = 1;
  if (startIndex === 0) {
    matchesWindow.push(buildRecord(singleDbo, 0, ""));
  }
} else {
  var stack = [];
  var projectNames = manager.getAllProjectNamesList();

  function pushNode(dbo, depth) {
    if (!dbo) {
      return;
    }
    stack.push({ dbo: dbo, depth: depth });
  }

  if (rootQName.length > 0) {
    var rootDbo = C8O.dbo.resolve(rootQName, { messagePrefix: "qname" });
    pushNode(rootDbo, 0);
  } else {
    // Every project is loaded when the scan reaches it, not all of them before it starts (loading them took the time).
    for (var i = 0; i < projectNames.size(); i++) {
      stack.push({ projectName: String(projectNames.get(i)), depth: 0 });
    }
    projectsTotal = projectNames.size();
  }

  var abortSearch = false;

  while (stack.length > 0) {
    if (abortSearch) {
      break;
    }
    if (evaluated > 0 && resumeObjects === 0 && Number(java.lang.System.currentTimeMillis()) - searchStartedAt >= SEARCH_TIME_BUDGET_MS) {
      timeBudgetReached = true;
      hasMore = true;
      scanPosition = positionOf(true);
      break;
    }
    var entry = stack.pop();
    var dbo = entry.dbo;
    var depth = entry.depth || 0;
    if (entry.projectName !== undefined) {
      projectsReached++;
      inProject = 0;
      // finished by the calls before this one: not loaded again
      if (resumeProjects > 0) {
        resumeProjects--;
        continue;
      }
      dbo = null;
      try {
        dbo = manager.getOriginalProjectByName(entry.projectName);
      } catch (_ignoredProject) {
        dbo = null;
      }
    }
    if (!dbo) {
      continue;
    }
    scanned++;
    inProject++;
    // The objects of this project scanned by the calls before this one are walked, not read again.
    if (resumeObjects > 0) {
      resumeObjects--;
      var walkedChildren = null;
      try {
        walkedChildren = dbo.getDatabaseObjectChildren();
      } catch (_ignoredWalkedChildren) {}
      for (var w = walkedChildren != null ? walkedChildren.size() - 1 : -1; w >= 0; w--) {
        if (walkedChildren.get(w) != null) {
          stack.push({ dbo: walkedChildren.get(w), depth: depth + 1 });
        }
      }
      continue;
    }
    evaluated++;
    var typeMatch = matchesObjectType(dbo) && matchesQNamePattern(dbo);
    // Without filter, objectType or the qname pattern selects alone: the scan listed nothing before (objectType only).
    var snippet = typeMatch ? (searchActive ? matchesSearch(dbo) : "") : null;
    var searchMatch = typeMatch && snippet !== null;
    if (searchMatch) {
      var currentIndex = totalMatches;
      totalMatches++;
      if (currentIndex >= startIndex && matchesWindow.length < limitValue && matchesWindow.length > 0 && matchesChars >= MAX_MATCHES_CHARS) {
        hasMore = true;
        abortSearch = true;
        // the next call reads this object again: it is the first of its page
        totalMatches = currentIndex;
        scanPosition = positionOf(false);
        break;
      }
      if (currentIndex >= startIndex && matchesWindow.length < limitValue) {
        var record = buildRecord(dbo, depth, snippet);
        matchesWindow.push(record);
        matchesChars += JSON.stringify(record, null, 2).length + 60;
      } else if (currentIndex >= pageUpperBound) {
        hasMore = true;
        abortSearch = true;
        totalMatches = currentIndex;
        scanPosition = positionOf(false);
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

var nextCursorValue = hasMore
  ? (scanPosition !== null ? "p" + scanPosition.projects + "." + scanPosition.objects + "." + scanPosition.matches : String(startIndex + matchesWindow.length))
  : "";
var searchElapsedMs = Number(java.lang.System.currentTimeMillis()) - searchStartedAt;
searchQuery = {
  qname: sourceQName,
  search: searchRaw,
  matchCase: matchCaseFlag,
  useRegExp: useRegExpFlag,
  objectType: objectTypeText,
  limit: limitValue,
  active: searchActive,
  pattern: qnamePattern !== null,
  startIndex: startIndex,
  cursorInput: cursorRaw
};
searchSummary = {
  scanned: scanned,
  returned: matchesWindow.length,
  hasMore: hasMore,
  timeBudgetReached: timeBudgetReached,
  elapsedMs: searchElapsedMs,
  message: timeBudgetReached
    ? "The search stopped after " + Math.round(searchElapsedMs / 1000) + " s, its time budget, with " + matchesWindow.length +
      " match(es) in this answer" + (projectsTotal > 0 ? ", " + projectsReached + " of " + projectsTotal + " projects reached" : "") +
      ". Call again with _nextCursor " + JSON.stringify(nextCursorValue) + " to go on from there" +
      (rootQName.length ? "" : ", or give qname (a project, or a part of it) to search less") + "."
    : "",
  startIndex: startIndex,
  limit: limitValue,
  cursorInput: cursorRaw,
  nextCursor: nextCursorValue,
  timestamp: java.lang.System.currentTimeMillis()
};
searchMatches = matchesWindow;
nextCursorToken = nextCursorValue;
