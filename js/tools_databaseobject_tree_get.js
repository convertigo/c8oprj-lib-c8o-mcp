var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
var manager = Engine.theApp.databaseObjectsManager;

var sourceQName = qname == null ? "" : String(qname).trim();
var includePropertiesFlag = C8O.util.toBoolean(includeProperties, false) === true;
var includeReadOnlyFlag = C8O.util.toBoolean(includeReadOnly, false) === true;

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

function normalizeView(raw) {
  var text = raw == null ? "" : String(raw).trim().toLowerCase();
  if (text === "full" || text === "children" || text === "summary") {
    return text;
  }
  return "children";
}

var viewMode = normalizeView(view);
var maxDepthValue = parseIntBounded(maxDepth, 4, 1, 20);
var maxNodesValue = parseIntBounded(maxNodes, 200, 1, 5000);
var startOffset = parseIntBounded(_nextCursor, 0, 0, 1000000000);

function safeQName(dbo) {
  if (!dbo) {
    return "";
  }
  try {
    if (dbo.getFullQName) {
      return String(dbo.getFullQName());
    }
    if (dbo.getQName) {
      return String(dbo.getQName());
    }
  } catch (_ignoreQName) {}
  return "";
}

function safeName(dbo) {
  if (!dbo) {
    return "";
  }
  try {
    if (dbo.getName) {
      return String(dbo.getName());
    }
  } catch (_ignoreName) {}
  return "";
}

function safePriority(dbo) {
  if (!dbo) {
    return "";
  }
  try {
    if (dbo.priority !== undefined && dbo.priority !== null) {
      return String(dbo.priority);
    }
  } catch (_ignorePriority) {}
  return "";
}

function getDirectChildren(parentDbo) {
  var result = [];
  if (!parentDbo || !parentDbo.getDatabaseObjectChildren) {
    return result;
  }
  var list = null;
  try {
    list = parentDbo.getDatabaseObjectChildren();
  } catch (_ignoreChildrenList) {
    list = null;
  }
  if (!list) {
    return result;
  }
  for (var i = 0; i < list.size(); i++) {
    var child = list.get(i);
    if (!child) {
      continue;
    }
    try {
      if (child.getParent() !== parentDbo) {
        continue;
      }
    } catch (_ignoreParentCheck) {}
    result.push(child);
  }
  return result;
}

function logicalClassNameForDbo(dbo) {
  if (!dbo || !dbo.getClass) {
    return "";
  }
  var runtimeClass = "";
  try {
    runtimeClass = String(dbo.getClass().getName());
  } catch (_ignoreClass) {
    runtimeClass = "";
  }
  if (!runtimeClass.length) {
    return "";
  }

  var shortName = C8O.util.fromFqcn ? C8O.util.fromFqcn(runtimeClass) : runtimeClass;
  if (!C8O.dbo._isNgxClassFqcn || C8O.dbo._isNgxClassFqcn(runtimeClass) !== true) {
    return shortName;
  }

  var logicalId = "";
  try {
    if (C8O.dbo.getNgxComponentLogicalId) {
      logicalId = String(C8O.dbo.getNgxComponentLogicalId(null, dbo) || "");
    }
  } catch (_ignoreLogicalId) {
    logicalId = "";
  }
  if (!logicalId.length) {
    var simpleName = runtimeClass;
    var lastDot = runtimeClass.lastIndexOf(".");
    if (lastDot >= 0 && lastDot + 1 < runtimeClass.length) {
      simpleName = runtimeClass.substring(lastDot + 1);
    }
    logicalId = simpleName;
  }

  if (C8O.dbo.buildLogicalClassName) {
    return C8O.dbo.buildLogicalClassName(shortName, logicalId);
  }
  return shortName + "#" + logicalId;
}

function buildPropertiesMap(dbo) {
  if (!includePropertiesFlag) {
    return null;
  }
  var properties = {};
  var hints = [];
  try {
    hints = C8O.dbo.describeDatabaseObjectProperties ? C8O.dbo.describeDatabaseObjectProperties(dbo) : [];
  } catch (_ignoreHints) {
    hints = [];
  }
  for (var i = 0; i < hints.length; i++) {
    var hint = hints[i];
    if (!hint || !hint.name) {
      continue;
    }
    if (hint.hidden === true) {
      continue;
    }
    if (!includeReadOnlyFlag && hint.readOnly === true) {
      continue;
    }
    if (hint.defaultValue === undefined) {
      continue;
    }
    properties[String(hint.name)] = hint.defaultValue;
  }
  return properties;
}

function resolveRoots() {
  var roots = [];
  if (sourceQName.length > 0) {
    var single = C8O.dbo.resolve(sourceQName, { messagePrefix: "qname" });
    roots.push(single);
    return roots;
  }

  var names = manager.getAllProjectNamesList();
  var projectNames = [];
  for (var i = 0; i < names.size(); i++) {
    projectNames.push(String(names.get(i)));
  }
  projectNames.sort();
  for (var p = 0; p < projectNames.length; p++) {
    var projectQName = projectNames[p];
    var projectDbo = C8O.dbo.resolve(projectQName, { optional: true });
    if (projectDbo) {
      roots.push(projectDbo);
    }
  }
  return roots;
}

var subtreeCountCache = {};
function countSubtreeNodes(dbo) {
  var key = safeQName(dbo);
  if (!key.length) {
    return 0;
  }
  if (subtreeCountCache[key] !== undefined) {
    return subtreeCountCache[key];
  }
  var children = getDirectChildren(dbo);
  var count = children.length;
  for (var i = 0; i < children.length; i++) {
    count += countSubtreeNodes(children[i]);
  }
  subtreeCountCache[key] = count;
  return count;
}

function buildShallowNode(dbo, depth, includeChildrenArray) {
  var children = getDirectChildren(dbo);
  var node = {
    qname: safeQName(dbo),
    name: safeName(dbo),
    className: logicalClassNameForDbo(dbo),
    depth: depth,
    hasChildren: children.length > 0,
    directChildrenCount: children.length,
    subtreeCount: countSubtreeNodes(dbo)
  };
  var priority = safePriority(dbo);
  if (priority.length && priority !== "0") {
    node.priority = priority;
  }
  if (includePropertiesFlag && viewMode !== "summary") {
    var props = buildPropertiesMap(dbo);
    if (props && Object.keys(props).length > 0) {
      node.properties = props;
    }
  }
  if (includeChildrenArray === true) {
    node.children = [];
  }
  return node;
}

function executeChildrenOrSummaryView() {
  var roots = resolveRoots();
  if (sourceQName.length > 0) {
    var root = roots.length ? roots[0] : null;
    var rootChildren = root ? getDirectChildren(root) : [];
    var start = startOffset;
    if (start > rootChildren.length) {
      start = rootChildren.length;
    }
    var end = start + maxNodesValue;
    if (end > rootChildren.length) {
      end = rootChildren.length;
    }

    var rootNode = root ? buildShallowNode(root, 1, true) : null;
    if (rootNode) {
      for (var i = start; i < end; i++) {
        rootNode.children.push(buildShallowNode(rootChildren[i], 2, false));
      }
    }

    treeData = rootNode;
    forestData = [];
    treeReturnedNodes = end - start;
    treeScannedNodes = rootChildren.length;
    treeHasMore = end < rootChildren.length;
    treeTruncated = treeHasMore;
    treeStartOffset = start;
    treeMaxDepth = 2;
    treeMaxNodes = maxNodesValue;
    treeRootQName = sourceQName;
    treeRootCount = rootNode ? 1 : 0;
    treeNextCursor = treeHasMore ? String(end) : "";
    treeTotalNodes = rootChildren.length;
    return;
  }

  var startRoots = startOffset;
  if (startRoots > roots.length) {
    startRoots = roots.length;
  }
  var endRoots = startRoots + maxNodesValue;
  if (endRoots > roots.length) {
    endRoots = roots.length;
  }

  var forest = [];
  for (var r = startRoots; r < endRoots; r++) {
    forest.push(buildShallowNode(roots[r], 1, false));
  }

  treeData = null;
  forestData = forest;
  treeReturnedNodes = endRoots - startRoots;
  treeScannedNodes = roots.length;
  treeHasMore = endRoots < roots.length;
  treeTruncated = treeHasMore;
  treeStartOffset = startRoots;
  treeMaxDepth = 1;
  treeMaxNodes = maxNodesValue;
  treeRootQName = "";
  treeRootCount = forest.length;
  treeNextCursor = treeHasMore ? String(endRoots) : "";
  treeTotalNodes = roots.length;
}

function executeFullView() {
  function cloneMeta(meta) {
    return {
      qname: meta.qname,
      name: meta.name,
      className: meta.className,
      priority: meta.priority,
      depth: meta.depth,
      directChildrenCount: meta.directChildrenCount,
      subtreeCount: meta.subtreeCount
    };
  }

  var nodeMap = {};
  var nodeOrder = [];
  var rootMarks = {};
  var linkMap = {};

  function ensureNode(meta, partial) {
    var key = meta.qname;
    var node = nodeMap[key];
    if (!node) {
      node = {
        qname: meta.qname,
        name: meta.name,
        className: meta.className,
        depth: meta.depth,
        hasChildren: meta.directChildrenCount > 0,
        directChildrenCount: meta.directChildrenCount,
        subtreeCount: meta.subtreeCount
      };
      if (meta.priority.length && meta.priority !== "0") {
        node.priority = meta.priority;
      }
      if (partial === true) {
        node.partial = true;
      }
      nodeMap[key] = node;
      nodeOrder.push(key);
      rootMarks[key] = true;
      return node;
    }
    if (partial !== true) {
      delete node.partial;
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
    rootMarks[childNode.qname] = false;
  }

  function addIncludedNode(meta, ancestors, dbo) {
    var previous = null;
    for (var i = 0; i < ancestors.length; i++) {
      var anc = ancestors[i];
      var ancNode = ensureNode(anc, true);
      if (previous) {
        linkParentChild(previous, ancNode);
      }
      previous = ancNode;
    }

    var currentNode = ensureNode(meta, false);
    if (previous) {
      linkParentChild(previous, currentNode);
    }

    if (includePropertiesFlag) {
      var props = buildPropertiesMap(dbo);
      if (props && Object.keys(props).length > 0) {
        currentNode.properties = props;
      } else {
        delete currentNode.properties;
      }
    }
  }

  var indexCounter = 0;
  var returnedNodes = 0;
  var stopTraversal = false;
  var hasMore = false;
  var scannedNodes = 0;

  function visitNode(dbo, depth, ancestors) {
    if (stopTraversal) {
      return;
    }
    var currentQName = safeQName(dbo);
    if (!currentQName.length) {
      return;
    }

    var children = getDirectChildren(dbo);
    var childCount = children.length;
    var meta = {
      qname: currentQName,
      name: safeName(dbo),
      className: logicalClassNameForDbo(dbo),
      priority: safePriority(dbo),
      depth: depth,
      directChildrenCount: childCount,
      subtreeCount: countSubtreeNodes(dbo)
    };

    var currentIndex = indexCounter;
    indexCounter += 1;
    scannedNodes += 1;

    if (currentIndex >= startOffset) {
      if (returnedNodes < maxNodesValue) {
        addIncludedNode(meta, ancestors, dbo);
        returnedNodes += 1;
      } else {
        hasMore = true;
        stopTraversal = true;
        return;
      }
    }

    if (depth >= maxDepthValue) {
      return;
    }

    var nextAncestors = ancestors.slice();
    nextAncestors.push(cloneMeta(meta));
    for (var i = 0; i < children.length; i++) {
      visitNode(children[i], depth + 1, nextAncestors);
      if (stopTraversal) {
        return;
      }
    }
  }

  var roots = resolveRoots();
  for (var r = 0; r < roots.length; r++) {
    visitNode(roots[r], 1, []);
    if (stopTraversal) {
      break;
    }
  }

  var rootsOut = [];
  for (var n = 0; n < nodeOrder.length; n++) {
    var qn = nodeOrder[n];
    if (rootMarks[qn] === true) {
      rootsOut.push(nodeMap[qn]);
    }
  }

  treeData = null;
  forestData = [];
  if (sourceQName.length > 0) {
    treeData = rootsOut.length > 0 ? rootsOut[0] : null;
    if (rootsOut.length > 1) {
      forestData = rootsOut.slice(1);
    }
  } else {
    forestData = rootsOut;
  }

  treeHasMore = hasMore;
  treeTruncated = hasMore;
  treeReturnedNodes = returnedNodes;
  treeScannedNodes = scannedNodes;
  treeStartOffset = startOffset;
  treeMaxDepth = maxDepthValue;
  treeMaxNodes = maxNodesValue;
  treeRootQName = sourceQName;
  treeRootCount = rootsOut.length;
  treeNextCursor = hasMore ? String(startOffset + returnedNodes) : "";
  treeTotalNodes = hasMore ? -1 : (startOffset + returnedNodes);
}

if (viewMode === "full") {
  executeFullView();
} else {
  executeChildrenOrSummaryView();
}

treeView = viewMode;
