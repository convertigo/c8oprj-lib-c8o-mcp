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

var doc = XMLUtils.getDefaultDocumentBuilder().newDocument();
var root = doc.createElement("children");
doc.appendChild(root);

if (sourceQName.length > 0) {
  GetChildren.getChildren(sourceQName, root, 1);
} else {
  var names = manager.getAllProjectNamesList();
  for (var i = 0; i < names.size(); i++) {
    GetChildren.getChildren(names.get(i), root, 0);
  }
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

function mapAttributes(node) {
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
    className: attr.beanClass || "",
    priority: "" + priority
  };
  var hasChildrenFlag = C8O.util.toBoolean(attr.hasChildren, false) === true;
  if (hasChildrenFlag) {
    entry.hasChildren = true;
  }
  var isEnabledFlag = attr.isEnabled == null ? true : C8O.util.toBoolean(attr.isEnabled, true);
  if (!isEnabledFlag) {
    entry.isEnabled = false;
  }
  entry._filterComment = attr.comment || "";
  return entry;
}

function asArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

var json = JSON.parse(XMLUtils.XmlToJson(root, true, true));
var rawChildren = [];
var parentNode = null;

if (sourceQName.length > 0) {
  if (json.children && json.children.dbo) {
    parentNode = json.children.dbo;
    rawChildren = asArray(parentNode.dbo);
  }
} else if (json.children && json.children.dbo) {
  rawChildren = asArray(json.children.dbo);
}

var mappedChildren = [];
for (var idx = 0; idx < rawChildren.length; idx++) {
  var mapped = mapAttributes(rawChildren[idx]);
  if (!mapped) {
    continue;
  }
  if (hasFilter) {
    var nameLower = (mapped.name || "").toLowerCase();
    var categoryLower = (mapped.category || "").toLowerCase();
    var classLower = (mapped.className || "").toLowerCase();
    var commentLower = (mapped._filterComment || "").toLowerCase();
    var qnameLower = (mapped.qname || "").toLowerCase();
    if (nameLower.indexOf(filterText) === -1 &&
        categoryLower.indexOf(filterText) === -1 &&
        classLower.indexOf(filterText) === -1 &&
        commentLower.indexOf(filterText) === -1 &&
        qnameLower.indexOf(filterText) === -1) {
      continue;
    }
  }
  delete mapped._filterComment;
  mappedChildren.push(mapped);
}

var totalChildren = mappedChildren.length;
var effectiveStart = startIndex;
if (effectiveStart < 0) { effectiveStart = 0; }
if (effectiveStart > totalChildren) { effectiveStart = totalChildren; }
var endIndex = effectiveStart + limitValue;
if (endIndex > totalChildren) { endIndex = totalChildren; }
var pagedChildren = [];
for (var pos = effectiveStart; pos < endIndex; pos++) {
  pagedChildren.push(mappedChildren[pos]);
}
var returnedCount = pagedChildren.length;
var hasMorePages = endIndex < totalChildren;
var nextCursorValue = hasMorePages ? String(endIndex) : "";

parentData = mapAttributes(parentNode);
if (parentData) {
  delete parentData._filterComment;
}
childrenData = pagedChildren;
nextCursorToken = nextCursorValue;
