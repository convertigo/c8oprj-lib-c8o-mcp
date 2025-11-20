var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
var XMLUtils = Packages.com.twinsoft.convertigo.engine.util.XMLUtils;
var GetChildren = Packages.com.twinsoft.convertigo.engine.admin.services.database_objects.GetChildren;

var manager = Engine.theApp.databaseObjectsManager;
var sourceQName = qname ? String(qname).trim() : "";
var filterRaw = filter == null ? "" : String(filter);
var filterText = filterRaw.trim();
var hasFilter = filterText.length > 0;
if (hasFilter) {
  filterText = filterText.toLowerCase();
}
if (sourceQName.length > 0) {
  // Fail fast with helpful hints if the provided QName is invalid.
  C8O.dbo.resolve(sourceQName, { messagePrefix: "qname" });
}


var depthRaw = depth == null ? "" : String(depth).trim();
var depthLimit = parseInt(depthRaw, 10);
if (isNaN(depthLimit) || depthLimit < 1) {
  depthLimit = 1;
}
var maxDepth = 5;
if (depthLimit > maxDepth) {
  depthLimit = maxDepth;
}

var defaultLimit = 25;
var maxLimit = 200;
var limitValue = defaultLimit;
if (typeof limit !== "undefined" && limit !== null) {
  try {
    var parsedLimit = parseInt(String(limit).trim(), 10);
    if (!isNaN(parsedLimit)) {
      limitValue = parsedLimit;
    }
  } catch(ignoreLimit) {}
}
if (limitValue < 1) { limitValue = defaultLimit; }
if (limitValue > maxLimit) { limitValue = maxLimit; }

var cursorRaw = typeof _nextCursor === "undefined" || _nextCursor == null ? "" : String(_nextCursor).trim();
var startIndex = 0;
if (cursorRaw.length > 0) {
  try {
    var parsedCursor = parseInt(cursorRaw, 10);
    if (!isNaN(parsedCursor) && parsedCursor >= 0) {
      startIndex = parsedCursor;
    }
  } catch(ignoreCursor) {}
}

function asArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function fetchRawChildren(qnameValue) {
  var doc = XMLUtils.getDefaultDocumentBuilder().newDocument();
  var root = doc.createElement("children");
  doc.appendChild(root);

  if (qnameValue && qnameValue.length > 0) {
    GetChildren.getChildren(qnameValue, root, 1);
  } else {
    var names = manager.getAllProjectNamesList();
    var rawProjects = [];
    for (var p = 0; p < names.size(); p++) {
      rawProjects.push(names.get(p));
    }
    rawProjects.sort();
    for (var i = 0; i < rawProjects.length; i++) {
      GetChildren.getChildren(rawProjects[i], root, 0);
    }
  }

  var json = JSON.parse(XMLUtils.XmlToJson(root, true, true));
  var result = { parentNode: null, children: [] };
  if (qnameValue && qnameValue.length > 0) {
    if (json.children && json.children.dbo) {
      result.parentNode = json.children.dbo;
      result.children = asArray(result.parentNode.dbo);
    }
  } else if (json.children && json.children.dbo) {
    result.children = asArray(json.children.dbo);
  }
  return result;
}

function resolveDboQName(shortQName) {
  if (!shortQName || !shortQName.length) {
    return { qname: "", dbo: null };
  }
  var resolved = C8O.dbo.resolve(shortQName, { optional: true });
  if (resolved != null) {
    return { qname: String(resolved.getFullQName()), dbo: resolved };
  }
  return { qname: shortQName, dbo: null };
}

function mapAttributes(node, remainingDepth) {
  if (!node) {
    return null;
  }
  var attr = node.attr || {};
  var resolution = resolveDboQName(attr.qname || "");
  var resolvedDbo = resolution.dbo;
  var priority = Number(attr.priority !== undefined ? attr.priority : 0);
  if (isNaN(priority)) {
    priority = 0;
  }
  var displayName = attr.name || "";
  var logicalName = resolvedDbo && resolvedDbo.getName ? String(resolvedDbo.getName()) : displayName;
  var entry = {
    qname: resolution.qname,
    name: logicalName,
    displayName: displayName || logicalName,
    category: attr.category || "",
    className: C8O.util.fromFqcn ? C8O.util.fromFqcn(attr.beanClass || "") : (attr.beanClass || "")
    priority: "" + priority
  };

  var hasChildrenFlag = C8O.util.toBoolean(attr.hasChildren, false) === true;
  var canExpand = remainingDepth > 1 && hasChildrenFlag && resolution.qname.length > 0;
  if (canExpand) {
    var nested = collectChildren(resolution.qname, remainingDepth - 1).children;
    if (nested.length > 0) {
      entry.children = nested;
    }
  }

  if (!entry.children && hasChildrenFlag) {
    entry.hasChildren = true;
  }

  return entry;
}

function collectChildren(qnameValue, remainingDepth) {
  var raw = fetchRawChildren(qnameValue);
  var childrenList = [];
  var nodes = raw.children || [];
  for (var idx = 0; idx < nodes.length; idx++) {
    var mapped = mapAttributes(nodes[idx], remainingDepth);
    if (!mapped) {
      continue;
    }
    childrenList.push(mapped);
  }
  return { parentNode: raw.parentNode, children: childrenList };
}

function matchesFilter(entry) {
  if (!hasFilter) {
    return true;
  }
  var nameLower = (entry.name || "").toLowerCase();
  var displayNameLower = (entry.displayName || "").toLowerCase();
  var categoryLower = (entry.category || "").toLowerCase();
  var qnameLower = (entry.qname || "").toLowerCase();
  if (nameLower.indexOf(filterText) !== -1) {
    return true;
  }
  if (displayNameLower.indexOf(filterText) !== -1) {
    return true;
  }
  if (categoryLower.indexOf(filterText) !== -1) {
    return true;
  }
  if (qnameLower.indexOf(filterText) !== -1) {
    return true;
  }
  return false;
}

function filterEntries(entries) {
  if (!hasFilter) {
    return entries;
  }
  var filtered = [];
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var childEntries = [];
    if (entry.children && entry.children.length > 0) {
      childEntries = filterEntries(entry.children.slice());
    }
    var nodeMatches = matchesFilter(entry);
    if (childEntries.length > 0) {
      entry.children = childEntries;
    } else if (entry.children) {
      delete entry.children;
    }
    if (nodeMatches || childEntries.length > 0) {
      filtered.push(entry);
    }
  }
  return filtered;
}

var rootCollection = collectChildren(sourceQName, depthLimit);
if (hasFilter) {
  rootCollection.children = filterEntries(rootCollection.children.slice());
}
var mappedChildren = rootCollection.children;
var parentNode = rootCollection.parentNode;

var totalChildrenCount = mappedChildren.length;
var effectiveStart = startIndex;
if (effectiveStart < 0) { effectiveStart = 0; }
if (effectiveStart > totalChildrenCount) { effectiveStart = totalChildrenCount; }
var endIndex = effectiveStart + limitValue;
if (endIndex > totalChildrenCount) { endIndex = totalChildrenCount; }
var pagedChildren = [];
for (var pos = effectiveStart; pos < endIndex; pos++) {
  pagedChildren.push(mappedChildren[pos]);
}
var hasMorePages = endIndex < totalChildrenCount;
var nextCursorValue = hasMorePages ? String(endIndex) : "";

parentData = mapAttributes(parentNode, depthLimit);
childrenData = pagedChildren;
totalChildren = totalChildrenCount;
nextCursorToken = nextCursorValue;



