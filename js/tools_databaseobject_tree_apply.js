if (typeof C8O === "undefined" || typeof C8O.dbo === "undefined") {
  include("js/databaseobject.js");
}
include("js/databaseobject_batch.js");

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

treeApplyRefreshRequested = asBoolean(refreshInput, true) === true;
treeApplyRefreshQName = "";
treeApplyStudioRefresh = null;
if (treeApplyRefreshRequested) {
  treeApplyRefreshQName = C8O.dbo.computeBatchRefreshQName(treeApplyResult);
}
if (treeApplyRefreshRequested && treeApplyRefreshQName.length > 0 && treeApplyResult && treeApplyResult.dryRun !== true) {
  treeApplyStudioRefresh = C8O.dbo.refreshStudioTreeByQName(treeApplyRefreshQName, treeApplyResult.errors);
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
