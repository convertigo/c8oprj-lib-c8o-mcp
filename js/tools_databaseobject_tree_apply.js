if (typeof C8O === "undefined" || typeof C8O.dbo === "undefined") {
  include("js/databaseobject.js");
}
include("js/databaseobject_batch.js");
include("js/ui_reveal.js");

function _treeApplyRequireHelper(name) {
  if (!C8O.dbo || typeof C8O.dbo[name] !== "function") {
    throw new Error("Missing helper C8O.dbo." + name + " (include js/databaseobject_batch.js).");
  }
  return C8O.dbo[name];
}

treeApplyInputErrors = [];
treeApplyWarnings = [];

var asTrimmed = _treeApplyRequireHelper("batchAsTrimmed");
var asBoolean = _treeApplyRequireHelper("batchAsBoolean");
var parseObjectInput = _treeApplyRequireHelper("batchParseObjectInput");

function normalizeAt(rawValue) {
  var text = asTrimmed(rawValue || "self").toLowerCase();
  if (text === "self" || text === "inside" || text === "before" || text === "after") {
    return text;
  }
  return "self";
}

function normalizeMode(rawValue) {
  var text = asTrimmed(rawValue || "merge").toLowerCase();
  if (text === "merge" || text === "replace") {
    return text;
  }
  return "merge";
}

var strictInput = (typeof strict !== "undefined") ? strict : false;
var autoSaveInput = (typeof autoSave !== "undefined") ? autoSave : null;
var onErrorInput = (typeof onError !== "undefined") ? onError : "stop";
var resumeFromInput = (typeof resumeFrom !== "undefined") ? resumeFrom : null;
var executionIdInput = (typeof executionId !== "undefined") ? executionId : null;
var dryRunInput = (typeof dryRun !== "undefined") ? dryRun : false;
var refreshInput = (typeof refresh !== "undefined") ? refresh : true;
var triggerMobileBuilderInput = (typeof triggerMobileBuilder !== "undefined") ? triggerMobileBuilder : true;
var revealInput = (typeof reveal !== "undefined") ? reveal : false;

var targetInput = asTrimmed(target);
if (!targetInput.length) {
  throw new Error("target is required.");
}

var atInput = normalizeAt((typeof at !== "undefined") ? at : "self");
var modeInput = normalizeMode((typeof mode !== "undefined") ? mode : "merge");
var treeObject = parseObjectInput((typeof tree !== "undefined") ? tree : null, "tree", treeApplyInputErrors);
if (!treeObject) {
  throw new Error("tree is required and must be a JSON object.");
}

// Node shortcuts expanded into ordinary children before the apply, so an app build does not
// spell one object per HTML attribute or per local:
//   attributes: {"class": "card", "[hidden]": {...SmartType}}  -> UIAttribute children
//   setLocals:  {"loading": "false", "items": "[]"}            -> SetLocalAction children (SCRIPT values)
// An explicit child with the same name wins. importVariables:true is handled by the batch engine.
function treeApplyShortcutName(prefix, key) {
  var cleaned = String(key).replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (!cleaned.length) {
    cleaned = "value";
  }
  return prefix + cleaned.charAt(0).toUpperCase() + cleaned.substring(1);
}

function treeApplyShortcutScript(value) {
  if (value && typeof value === "object" && !Array.isArray(value) && value.mode !== undefined) {
    return value;
  }
  return { mode: "SCRIPT", value: typeof value === "string" ? value : JSON.stringify(value) };
}

function treeApplyExpandShortcuts(node, path) {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return;
  }
  var children = Array.isArray(node.children) ? node.children : [];
  var existing = {};
  for (var ci = 0; ci < children.length; ci++) {
    if (children[ci] && children[ci].name !== undefined) {
      existing[String(children[ci].name)] = true;
    }
  }
  // Any other node key is a property written at the wrong level (tree:{scriptContent:...}): it used
  // to be dropped without a word. Move it under properties, where it applies or is reported unknown.
  var nodeKeys = { className: 1, name: 1, properties: 1, children: 1, attributes: 1, setLocals: 1,
    importVariables: 1, handlers: 1, id: 1, qname: 1, priority: 1, depth: 1, hasChildren: 1,
    directChildrenCount: 1, subtreeCount: 1, partial: 1, mode: 1 };
  var strayKeys = Object.keys(node).filter(function (key) { return !nodeKeys[key]; });
  if (strayKeys.length) {
    if (!node.properties || typeof node.properties !== "object" || Array.isArray(node.properties)) {
      node.properties = node.properties && typeof node.properties === "object" && !Array.isArray(node.properties) ? node.properties : {};
    }
    for (var sk = 0; sk < strayKeys.length; sk++) {
      if (node.properties[strayKeys[sk]] === undefined) {
        node.properties[strayKeys[sk]] = node[strayKeys[sk]];
      }
      delete node[strayKeys[sk]];
    }
    treeApplyWarnings.push((path || "tree") + ": " + strayKeys.join(", ") + " moved under properties (properties go in tree.properties).");
  }
  // handlers (a transaction's JavaScript handlers) is a node key too: it is not a bean property.
  if (node.properties && typeof node.properties === "object" && !Array.isArray(node.properties) &&
      node.properties.handlers !== undefined) {
    if (node.handlers === undefined) {
      node.handlers = node.properties.handlers;
    }
    delete node.properties.handlers;
  }
  // importVariables is a node key; accept it inside properties too, where agents tend to put it.
  if (node.properties && typeof node.properties === "object" && !Array.isArray(node.properties) &&
      node.properties.importVariables !== undefined) {
    if (node.importVariables === undefined) {
      node.importVariables = node.properties.importVariables === true || String(node.properties.importVariables) === "true";
    }
    delete node.properties.importVariables;
  }
  var added = [];
  var shortcuts = [
    { key: "attributes", build: function (attr, value) {
      return { className: "ngx.components.UIAttribute#UIAttribute", name: treeApplyShortcutName("", attr),
        properties: { attrName: String(attr), attrValue: value } };
    } },
    { key: "setLocals", build: function (prop, value) {
      return { className: "ngx.components.UIDynamicAction#SetLocalAction", name: treeApplyShortcutName("Set", prop),
        properties: { Property: String(prop), Value: treeApplyShortcutScript(value) } };
    } }
  ];
  for (var si = 0; si < shortcuts.length; si++) {
    var map = node[shortcuts[si].key];
    if (map === undefined) {
      continue;
    }
    if (!map || typeof map !== "object" || Array.isArray(map)) {
      throw new Error(path + "." + shortcuts[si].key + " must be an object map.");
    }
    var keys = Object.keys(map);
    for (var ki = 0; ki < keys.length; ki++) {
      var built = shortcuts[si].build(keys[ki], map[keys[ki]]);
      if (!existing[built.name]) {
        existing[built.name] = true;
        added.push(built);
      }
    }
    delete node[shortcuts[si].key];
  }
  if (added.length) {
    node.children = added.concat(children);
    children = node.children;
  }
  for (var ri = 0; ri < children.length; ri++) {
    treeApplyExpandShortcuts(children[ri], path + ".children[" + ri + "]");
  }
}
treeApplyExpandShortcuts(treeObject, "tree");

function treeApplyPropertyValue(properties, propertyName) {
  if (!properties) {
    return null;
  }
  if (!Array.isArray(properties)) {
    return Object.prototype.hasOwnProperty.call(properties, propertyName) ? properties[propertyName] : null;
  }
  for (var propertyIndex = 0; propertyIndex < properties.length; propertyIndex++) {
    var propertyEntry = properties[propertyIndex] || {};
    var entryName = asTrimmed(propertyEntry.name || propertyEntry.key || propertyEntry.property);
    if (entryName === propertyName) {
      return propertyEntry.value !== undefined ? propertyEntry.value : propertyEntry.newValue;
    }
  }
  return null;
}

function treeApplyCodeText(value) {
  if (value === null || typeof value === "undefined") {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch (_ignoreCodeStringify) {
    return String(value);
  }
}

function treeApplyIsNgxCustomAction(node) {
  var className = asTrimmed(node && node.className).toLowerCase();
  return className === "uicustomaction" || /(?:^|[.#])uicustomaction$/.test(className);
}

function treeApplyIsNgxPageEvent(node) {
  var className = asTrimmed(node && node.className).toLowerCase();
  return className === "uipageevent" || /(?:^|[.#])uipageevent$/.test(className);
}

function treeApplyScalarText(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (value.value !== undefined) {
      return asTrimmed(value.value);
    }
    if (value.text !== undefined) {
      return asTrimmed(value.text);
    }
  }
  return asTrimmed(value);
}

function validateTreeApplyIdentifiers(node, path) {
  if (!node || typeof node !== "object") {
    return;
  }
  var identifier = treeApplyPropertyValue(node.properties, "identifier");
  var identifierText = asTrimmed(identifier);
  if (identifierText.length && !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(identifierText)) {
    treeApplyInputErrors.push(path + ".properties.identifier must be a valid TypeScript identifier (for example clockDisplay, never clock-display). Got: " + identifierText);
  }
  if (treeApplyIsNgxCustomAction(node)) {
    var actionValue = treeApplyPropertyValue(node.properties, "actionValue");
    var actionCode = treeApplyCodeText(actionValue);
    if (actionCode.length && !/(^|[^.$A-Za-z0-9_])(?:resolve|reject)\s*\(/.test(actionCode)) {
      treeApplyInputErrors.push(path + ".properties.actionValue must call resolve(...) or reject(...) on every completion path. NGX UICustomAction wraps this code in a Promise; leaving it unsettled blocks the action chain.");
    }
    if (/\bthis\.c8o\.page\.detectChanges\s*\(/.test(actionCode)) {
      treeApplyInputErrors.push(path + ".properties.actionValue must use page.ref.detectChanges(), not this.c8o.page.detectChanges(). The latter is not a supported NGX custom-action page context.");
    }
  }
  if (treeApplyIsNgxPageEvent(node)) {
    var viewEvent = treeApplyScalarText(treeApplyPropertyValue(node.properties, "viewEvent"));
    var allowedViewEvents = {
      onWillLoad: true,
      onDidLoad: true,
      onWillEnter: true,
      onDidEnter: true,
      onWillLeave: true,
      onDidLeave: true,
      onWillUnload: true
    };
    if (viewEvent.length && allowedViewEvents[viewEvent] !== true) {
      treeApplyInputErrors.push(path + ".properties.viewEvent must be one of onWillLoad, onDidLoad, onWillEnter, onDidEnter, onWillLeave, onDidLeave, or onWillUnload. Got: " + viewEvent);
    }
  }
  if (Array.isArray(node.children)) {
    for (var childIndex = 0; childIndex < node.children.length; childIndex++) {
      validateTreeApplyIdentifiers(node.children[childIndex], path + ".children[" + childIndex + "]");
    }
  }
}

validateTreeApplyIdentifiers(treeObject, "tree");
if (treeApplyInputErrors.length > 0) {
  throw new Error(treeApplyInputErrors.join(" "));
}

var treeQName = asTrimmed(treeObject.qname);
if (treeQName.length) {
  var normalizedTargetQName = "";
  var normalizedTreeQName = "";
  try {
    normalizedTargetQName = C8O.dbo.safeQName(C8O.dbo.resolve(targetInput, { optional: true })) || "";
  } catch (_ignoreResolveTarget) {
    normalizedTargetQName = "";
  }
  try {
    normalizedTreeQName = C8O.dbo.safeQName(C8O.dbo.resolve(treeQName, { optional: true })) || "";
  } catch (_ignoreResolveTree) {
    normalizedTreeQName = "";
  }
  if (normalizedTargetQName.length && normalizedTreeQName.length) {
    if (normalizedTargetQName !== normalizedTreeQName) {
      treeApplyWarnings.push("tree.qname differs from target; target is used as the apply root.");
    }
  } else if (treeQName !== targetInput) {
    treeApplyWarnings.push("tree.qname differs from target; target is used as the apply root.");
  }
}

var op = null;
if (atInput === "self") {
  // at:"self" (the default) patches the target itself. A tree that names another object is almost
  // always a create/update of a child sent without at:"inside": refuse it instead of patching the
  // parent with properties it does not have.
  var selfTarget = null;
  try {
    selfTarget = C8O.dbo.resolve(targetInput, { optional: true });
  } catch (_ignoreSelfTarget) {
    selfTarget = null;
  }
  if (selfTarget && typeof C8O.dbo.safeName === "function" && typeof C8O.dbo.logicalClassNameForDbo === "function") {
    var selfName = String(C8O.dbo.safeName(selfTarget));
    var selfClass = String(C8O.dbo.logicalClassNameForDbo(selfTarget));
    var treeName = asTrimmed(treeObject.name);
    var treeClass = asTrimmed(treeObject.className).split("#")[0];
    var selfClassBase = selfClass.split("#")[0];
    var lastSegment = function (value) {
      return value.toLowerCase().split(".").pop();
    };
    var classDiffers = treeClass.length > 0 && treeClass.toLowerCase() !== selfClassBase.toLowerCase() &&
      lastSegment(treeClass) !== lastSegment(selfClassBase);
    if ((treeName.length && treeName !== selfName) || classDiffers) {
      throw new Error("at:\"self\" (the default) patches the target itself, " + selfName + " (" + selfClass + "), but tree names " +
        (treeName || selfName) + (treeClass ? " (" + treeClass + ")" : "") + ". To create or update that child, add at:\"inside\"; " +
        "to patch an existing object, use its own QName as target. To rename the target, use databaseobject-rename.");
    }
  }
  op = {
    type: "upsertTree",
    opId: "tree_apply_root",
    qname: targetInput,
    patch: treeObject,
    strategy: modeInput
  };
} else {
  var classNameInput = asTrimmed(treeObject.className);
  var nameInput = asTrimmed(treeObject.name);
  if (!classNameInput.length) {
    throw new Error("tree.className is required when at is inside/before/after.");
  }
  if (!nameInput.length) {
    throw new Error("tree.name is required when at is inside/before/after.");
  }

  var createOpId = asTrimmed(treeObject.id);
  if (!createOpId.length) {
    createOpId = "tree_apply_root_create";
  }
  op = {
    type: "create",
    opId: createOpId,
    related: targetInput,
    mode: atInput,
    className: classNameInput,
    name: nameInput
  };

  if (treeObject.properties !== undefined) {
    op.properties = treeObject.properties;
  }
  if (Array.isArray(treeObject.children) && treeObject.children.length > 0) {
    op.children = treeObject.children;
  }
  if (treeObject.importVariables === true) {
    op.importVariables = true;
  }
  if (treeObject.handlers !== undefined) {
    op.handlers = treeObject.handlers;
  }
}

treeApplyResult = C8O.dbo.batchApply({
  target: targetInput,
  operations: [op],
  onError: onErrorInput,
  strict: strictInput,
  autoSave: autoSaveInput,
  triggerMobileBuilder: triggerMobileBuilderInput,
  resumeFrom: resumeFromInput,
  executionId: executionIdInput,
  dryRun: dryRunInput
});

if (treeApplyInputErrors.length > 0) {
  if (!treeApplyResult.errors) {
    treeApplyResult.errors = [];
  }
  for (var ei = 0; ei < treeApplyInputErrors.length; ei++) {
    treeApplyResult.errors.push(treeApplyInputErrors[ei]);
  }
}
if (treeApplyWarnings.length > 0) {
  if (!treeApplyResult.warnings) {
    treeApplyResult.warnings = [];
  }
  for (var wi = 0; wi < treeApplyWarnings.length; wi++) {
    treeApplyResult.warnings.push(treeApplyWarnings[wi]);
  }
}

var treeApplySerializationWarnings = [];
if (C8O.util && typeof C8O.util.toJsonSafe === "function") {
  treeApplyResult = C8O.util.toJsonSafe(treeApplyResult, {
    path: "treeApplyResult",
    maxDepth: 16,
    warnings: treeApplySerializationWarnings
  });
}
if (treeApplySerializationWarnings.length > 0) {
  if (!treeApplyResult.warnings) {
    treeApplyResult.warnings = [];
  }
  for (var swi = 0; swi < treeApplySerializationWarnings.length; swi++) {
    treeApplyResult.warnings.push("serialization: " + treeApplySerializationWarnings[swi]);
  }
}

treeApplyRefreshRequested = asBoolean(refreshInput, true) === true;
treeApplyRefreshQName = "";
treeApplyStudioRefresh = null;
if (treeApplyRefreshRequested) {
  treeApplyRefreshQName = C8O.dbo.computeBatchRefreshQName(treeApplyResult);
}
if (treeApplyRefreshRequested && treeApplyRefreshQName.length > 0 && treeApplyResult && treeApplyResult.dryRun !== true) {
  treeApplyStudioRefresh = C8O.dbo.refreshStudioTreeByQName(treeApplyRefreshQName, treeApplyResult.errors);
}

function treeApplyRevealQName(result, fallbackQName) {
  if (result && result.touchedQNames && result.touchedQNames.length > 0) {
    for (var rqi = result.touchedQNames.length - 1; rqi >= 0; rqi--) {
      var touched = asTrimmed(result.touchedQNames[rqi]);
      if (touched.length) {
        return touched;
      }
    }
  }
  if (result && result.operations && result.operations.length > 0) {
    for (var roi = result.operations.length - 1; roi >= 0; roi--) {
      var opReport = result.operations[roi] || {};
      var candidates = [
        opReport.qname,
        opReport.targetQName,
        opReport.createdQName
      ];
      for (var ci = 0; ci < candidates.length; ci++) {
        var candidate = asTrimmed(candidates[ci]);
        if (candidate.length) {
          return candidate;
        }
      }
      if (opReport.applied && opReport.applied.length > 0) {
        for (var ai = opReport.applied.length - 1; ai >= 0; ai--) {
          var applied = opReport.applied[ai] || {};
          var appliedQName = asTrimmed(applied.qname || applied.targetQName || applied.createdQName);
          if (appliedQName.length) {
            return appliedQName;
          }
        }
      }
    }
  }
  return asTrimmed(fallbackQName || targetInput);
}

if (treeApplyResult && C8O.uiReveal && C8O.uiReveal.enabled(revealInput, false) === true && treeApplyResult.dryRun !== true) {
  treeApplyResult.reveal = C8O.uiReveal.databaseObject(treeApplyRevealQName(treeApplyResult, treeApplyRefreshQName), {
    reveal: true,
    errors: treeApplyResult.errors
  });
}

// Compact by default: a 200-object subtree used to return every applied entry (~100 KB).
// batch-call asks for "full" because its deferred finalize reads touchedQNames and applied.
function treeApplyRootQNames(qnames) {
  var sorted = [];
  for (var i = 0; i < qnames.length; i++) {
    var text = asTrimmed(qnames[i]);
    if (text.length) {
      sorted.push(text);
    }
  }
  sorted.sort();
  var roots = [];
  for (var j = 0; j < sorted.length; j++) {
    var last = roots.length ? roots[roots.length - 1] : null;
    if (last !== null && (sorted[j] === last || sorted[j].indexOf(last + ".") === 0)) {
      continue;
    }
    roots.push(sorted[j]);
  }
  return roots;
}

function treeApplyCompactResult(result) {
  var operations = Array.isArray(result.operations) ? result.operations : [];
  var compactOperations = [];
  for (var oi = 0; oi < operations.length; oi++) {
    var opReport = operations[oi] || {};
    var compactOp = {};
    var keys = Object.keys(opReport);
    for (var ki = 0; ki < keys.length; ki++) {
      if (keys[ki] !== "applied") {
        compactOp[keys[ki]] = opReport[keys[ki]];
      }
    }
    if (Array.isArray(opReport.applied)) {
      var byAction = {};
      for (var ai = 0; ai < opReport.applied.length; ai++) {
        var action = asTrimmed((opReport.applied[ai] || {}).action) || "other";
        byAction[action] = (byAction[action] || 0) + 1;
      }
      compactOp.appliedCount = opReport.applied.length;
      compactOp.appliedByAction = byAction;
    }
    compactOperations.push(compactOp);
  }
  result.operations = compactOperations;
  if (Array.isArray(result.touchedQNames)) {
    result.touchedQNames = treeApplyRootQNames(result.touchedQNames);
  }
  return result;
}

// A TransactionStep or SequenceStep that passes none of the variables its target declares sends empty
// values without any error (the target runs with ""): say so while the tree is being written.
function treeApplyStepVariableWarnings(result) {
  var touched = result && Array.isArray(result.touchedQNames) ? result.touchedQNames : [];
  var seen = {};
  for (var ti = 0; ti < touched.length; ti++) {
    var qn = String(touched[ti]);
    if (seen[qn] || !/(\.st:|\.)[^.]+$/.test(qn)) {
      continue;
    }
    seen[qn] = true;
    var step = null;
    try {
      step = C8O.dbo.resolve(qn, { optional: true });
    } catch (_ignoreStep) {
      step = null;
    }
    if (!step || typeof step.numberOfVariables !== "function") {
      continue;
    }
    var target = null;
    try {
      target = typeof step.getTargetTransaction === "function" ? step.getTargetTransaction()
        : (typeof step.getTargetSequence === "function" ? step.getTargetSequence() : null);
    } catch (_ignoreTarget) {
      target = null;
    }
    if (!target || typeof target.numberOfVariables !== "function") {
      continue;
    }
    var expected = target.numberOfVariables();
    if (expected > 0 && step.numberOfVariables() === 0) {
      var names = [];
      try {
        var it = target.getVariablesList().iterator();
        while (it.hasNext() && names.length < 8) {
          names.push(String(it.next().getName()));
        }
      } catch (_ignoreNames) {}
      result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
      result.warnings.push(qn + " passes no variable to " + String(target.getName()) + ", which declares " + expected +
        (names.length ? " (" + names.join(", ") + ")" : "") + ": they will arrive empty. Add importVariables:true on the step " +
        "(the step variables then take the JavaScript variables of the same name) or explicit StepVariables.");
    }
  }
}
if (treeApplyResult && treeApplyResult.dryRun !== true) {
  try {
    treeApplyStepVariableWarnings(treeApplyResult);
  } catch (_ignoreStepVariableCheck) {}
}

var responseDetailInput = (typeof responseDetail !== "undefined" && asTrimmed(responseDetail).toLowerCase() === "full") ? "full" : "compact";
if (treeApplyResult && responseDetailInput !== "full") {
  treeApplyResult = treeApplyCompactResult(treeApplyResult);
}

treeApplyStop = treeApplyResult && treeApplyResult.stop ? treeApplyResult.stop : null;
treeApplyResume = treeApplyResult && treeApplyResult.resume ? treeApplyResult.resume : {
  executionId: "",
  fromOpIndex: 0,
  totalOperations: 0,
  remaining: 0,
  canResume: false,
  failedOpIds: []
};
