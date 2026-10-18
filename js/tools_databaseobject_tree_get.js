var Engine = Packages.com.twinsoft.convertigo.engine.Engine;

function parseIntBounded(value, defaultValue, minValue, maxValue) {
  var out = defaultValue;
  if (value !== null && value !== undefined) {
    try {
      var parsed = parseInt(String(value).trim(), 10);
      if (!isNaN(parsed)) {
        out = parsed;
      }
    } catch (_ignoreParse) {}
  }
  if (out < minValue) {
    out = minValue;
  }
  if (out > maxValue) {
    out = maxValue;
  }
  return out;
}

function normalizePropertiesMode(rawMode) {
  var text = rawMode == null ? "" : String(rawMode).trim().toLowerCase();
  if (text === "none" || text === "all" || text === "changed") {
    return text;
  }
  return "changed";
}

function normalizeTarget() {
  var fromTarget = "";
  if (typeof target !== "undefined" && target !== null) {
    fromTarget = String(target).trim();
  }
  if (fromTarget.length) {
    return fromTarget;
  }
  if (typeof qname !== "undefined" && qname !== null) {
    return String(qname).trim();
  }
  return "";
}

function normalizeChildrenDepth() {
  // Compatibility alias used by older clients and common generated calls.
  if (typeof depth !== "undefined" && depth !== null) {
    return parseIntBounded(depth, 1, 0, 20);
  }
  if (typeof maxDepth !== "undefined" && maxDepth !== null) {
    return parseIntBounded(maxDepth, 1, 0, 20);
  }
  if (typeof childrenDepth !== "undefined" && childrenDepth !== null) {
    return parseIntBounded(childrenDepth, 1, 0, 20);
  }
  return 1;
}

function normalizeLimit() {
  if (typeof limit !== "undefined" && limit !== null) {
    return parseIntBounded(limit, 200, 1, 5000);
  }
  if (typeof maxNodes !== "undefined" && maxNodes !== null) {
    return parseIntBounded(maxNodes, 200, 1, 5000);
  }
  return 200;
}

function normalizeProperties() {
  if (typeof properties !== "undefined" && properties !== null) {
    return normalizePropertiesMode(properties);
  }
  // Legacy fallback for old sequence variables.
  var legacy = (typeof includeProperties !== "undefined" && C8O.util.toBoolean(includeProperties, false) === true)
    ? "all"
    : "none";
  return normalizePropertiesMode(legacy);
}

var targetQName = normalizeTarget();
if (!targetQName.length) {
  throw new Error("target is required.");
}

var childrenDepthValue = normalizeChildrenDepth();
var limitValue = normalizeLimit();
var propertiesMode = normalizeProperties();
var startOffset = parseIntBounded(_nextCursor, 0, 0, 1000000000);
var includePropertiesFlag = propertiesMode !== "none";

var root = C8O.dbo.resolve(targetQName, { messagePrefix: "target" });
var rootQName = C8O.dbo.safeFullQName ? C8O.dbo.safeFullQName(root) : C8O.dbo.safeQName(root);

var subtreeCountCache = {};
function countSubtreeNodes(dbo) {
  var key = C8O.dbo.safeQName(dbo);
  if (!key.length) {
    return 0;
  }
  if (subtreeCountCache[key] !== undefined) {
    return subtreeCountCache[key];
  }
  var children = C8O.dbo.getDirectChildren(dbo);
  var count = children.length;
  for (var i = 0; i < children.length; i++) {
    count += countSubtreeNodes(children[i]);
  }
  subtreeCountCache[key] = count;
  return count;
}

function buildNodeMeta(dbo, depth) {
  var children = C8O.dbo.getDirectChildren(dbo);
  var meta = {
    qname: C8O.dbo.safeFullQName ? C8O.dbo.safeFullQName(dbo) : C8O.dbo.safeQName(dbo),
    name: C8O.dbo.safeName(dbo),
    className: C8O.dbo.logicalClassNameForDbo(dbo),
    depth: depth,
    hasChildren: children.length > 0,
    directChildrenCount: children.length,
    subtreeCount: countSubtreeNodes(dbo)
  };
  var priority = C8O.dbo.safePriority(dbo);
  if (priority.length && priority !== "0") {
    meta.priority = priority;
  }
  // A transaction's JavaScript handlers are not a bean property but change what it does (a starter
  // placeholder cancels itself in onTransactionStarted): show them on every transaction. tree-apply writes the same key.
  try {
    if (dbo.handlers !== undefined && typeof dbo.getExpression === "function") {
      // Always present on a transaction ("" when it has none), so its absence is never ambiguous.
      var handlersText = String(dbo.getExpression() || "");
      meta.handlers = handlersText.trim().length ? handlersText : "";
    }
  } catch (_ignoreHandlers) {}
  return meta;
}

// Long values (an app's scriptContent or styles, a page template) made answers that agents refuse:
// 115 000 characters for one NgxApp node (run 9a). A value over maxValueLength is cut in the middle,
// with a marker that tree-apply refuses to write back; cutProperties gives the full lengths, and
// maxValueLength=0 on that node returns the values whole.
var TREE_GET_CUT_MARKER = "characters cut by databaseobject-tree-get";

function normalizeMaxValueLength() {
  var fallback = childrenDepthValue === 0 ? 20000 : 2000;
  if (typeof maxValueLength === "undefined" || maxValueLength === null || !String(maxValueLength).trim().length) {
    return fallback;
  }
  return parseIntBounded(maxValueLength, fallback, 0, 100000000);
}

var maxValueLengthValue = normalizeMaxValueLength();

function cutLongValues(value, path, cut) {
  if (typeof value === "string" || value instanceof java.lang.String) {
    var text = String(value);
    if (maxValueLengthValue > 0 && text.length > maxValueLengthValue) {
      var keep = Math.floor(maxValueLengthValue / 2);
      cut[path] = text.length;
      return text.substring(0, keep) + "\n... [" + (text.length - 2 * keep) + " " + TREE_GET_CUT_MARKER +
        "; call it on this node with maxValueLength=0 for the whole value] ...\n" + text.substring(text.length - keep);
    }
    return value;
  }
  // Only plain JS objects and arrays: a Java object's for-in would list its methods.
  if (value && (Array.isArray(value) || Object.prototype.toString.call(value) === "[object Object]")) {
    for (var key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        value[key] = cutLongValues(value[key], path + "." + key, cut);
      }
    }
  }
  return value;
}

function applyPropertiesIfNeeded(node, dbo) {
  if (!includePropertiesFlag) {
    return;
  }
  var map = C8O.dbo.getCanonicalPropertiesMap(dbo, propertiesMode, { includeReadOnly: false });
  if (map && Object.keys(map).length > 0) {
    var cut = {};
    for (var name in map) {
      if (Object.prototype.hasOwnProperty.call(map, name)) {
        map[name] = cutLongValues(map[name], name, cut);
      }
    }
    node.properties = map;
    if (Object.keys(cut).length) {
      node.cutProperties = cut;
    }
  }
}

var rootMeta = buildNodeMeta(root, 0);
treeData = {
  qname: rootMeta.qname,
  name: rootMeta.name,
  className: rootMeta.className,
  depth: 0,
  hasChildren: rootMeta.hasChildren,
  directChildrenCount: rootMeta.directChildrenCount,
  subtreeCount: rootMeta.subtreeCount
};
if (rootMeta.priority) {
  treeData.priority = rootMeta.priority;
}
if (rootMeta.handlers !== undefined) {
  treeData.handlers = rootMeta.handlers;
}
applyPropertiesIfNeeded(treeData, root);

var nodeMap = {};
var linkMap = {};
nodeMap[rootQName] = treeData;

function ensureNode(meta, dbo, partial) {
  var key = meta.qname;
  var node = nodeMap[key];
  if (!node) {
    node = {
      qname: meta.qname,
      name: meta.name,
      className: meta.className,
      depth: meta.depth,
      hasChildren: meta.hasChildren,
      directChildrenCount: meta.directChildrenCount,
      subtreeCount: meta.subtreeCount
    };
    if (meta.priority) {
      node.priority = meta.priority;
    }
    if (meta.handlers !== undefined) {
      node.handlers = meta.handlers;
    }
    if (partial === true) {
      node.partial = true;
    }
    nodeMap[key] = node;
    applyPropertiesIfNeeded(node, dbo);
    return node;
  }
  if (partial !== true && node.partial === true) {
    delete node.partial;
    applyPropertiesIfNeeded(node, dbo);
  }
  return node;
}

function linkParentChild(parentNode, childNode) {
  if (!parentNode || !childNode) {
    return;
  }
  var linkKey = parentNode.qname + "->" + childNode.qname;
  if (linkMap[linkKey]) {
    return;
  }
  linkMap[linkKey] = true;
  if (!Array.isArray(parentNode.children)) {
    parentNode.children = [];
  }
  parentNode.children.push(childNode);
}

function includeNode(pathItems, meta, dbo) {
  var parentNode = treeData;
  for (var i = 0; i < pathItems.length; i++) {
    var ancestor = pathItems[i];
    var ancestorNode = ensureNode(ancestor.meta, ancestor.dbo, true);
    linkParentChild(parentNode, ancestorNode);
    parentNode = ancestorNode;
  }
  var node = ensureNode(meta, dbo, false);
  linkParentChild(parentNode, node);
}

var cursor = 0;
var returnedNodes = 0;
var scannedNodes = 0;
var hasMore = false;
var stopTraversal = false;
var fullyScanned = true;

function visitChildren(parentDbo, depth, pathItems) {
  if (stopTraversal) {
    return;
  }
  if (depth > childrenDepthValue) {
    return;
  }

  var children = C8O.dbo.getDirectChildren(parentDbo);
  for (var i = 0; i < children.length; i++) {
    if (stopTraversal) {
      return;
    }

    var child = children[i];
    var meta = buildNodeMeta(child, depth);
    scannedNodes += 1;

    var currentIndex = cursor;
    cursor += 1;

    if (currentIndex >= startOffset) {
      if (returnedNodes < limitValue) {
        includeNode(pathItems, meta, child);
        returnedNodes += 1;
      } else {
        hasMore = true;
        fullyScanned = false;
        stopTraversal = true;
        return;
      }
    }

    if (depth < childrenDepthValue) {
      var nextPath = pathItems.slice();
      nextPath.push({ meta: meta, dbo: child });
      visitChildren(child, depth + 1, nextPath);
    }
  }
}

if (childrenDepthValue > 0) {
  visitChildren(root, 1, []);
}

treeRootQName = rootQName;
treeView = "tree";
treeStartOffset = startOffset;
treeReturnedNodes = returnedNodes;
treeScannedNodes = scannedNodes;
treeMaxDepth = childrenDepthValue;
treeMaxNodes = limitValue;
treeRootCount = 1;
treeHasMore = hasMore;
treeTruncated = hasMore;
treeNextCursor = hasMore ? String(startOffset + returnedNodes) : "";
treeTotalNodes = fullyScanned ? cursor : -1;
forestData = [];
