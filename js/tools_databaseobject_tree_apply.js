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
var safeJsonStringify = _treeApplyRequireHelper("batchSafeJsonStringify");
var parseObjectInput = _treeApplyRequireHelper("batchParseObjectInput");
var firstProvidedInput = _treeApplyRequireHelper("batchFirstProvidedInput");
var unwrapValue = _treeApplyRequireHelper("batchUnwrapValue");

var strictInput = (typeof strict !== "undefined") ? strict : false;
var autoSaveInput = (typeof autoSave !== "undefined") ? autoSave : null;
var onErrorInput = (typeof onError !== "undefined") ? onError : "stop";
var resumeFromInput = (typeof resumeFrom !== "undefined") ? resumeFrom : null;
var executionIdInput = (typeof executionId !== "undefined") ? executionId : null;
var dryRunInput = (typeof dryRun !== "undefined") ? dryRun : false;
var refreshInput = (typeof refresh !== "undefined") ? refresh : true;
var triggerMobileBuilderInput = (typeof triggerMobileBuilder !== "undefined") ? triggerMobileBuilder : true;

var targetInput = asTrimmed(target);
var treeCandidate = firstProvidedInput([
  { name: "payload", value: (typeof payload !== "undefined") ? payload : null },
  { name: "patch", value: (typeof patch !== "undefined") ? patch : null },
  { name: "tree", value: (typeof tree !== "undefined") ? tree : null }
]);
var treeInputRaw = treeCandidate.value;
var treeInputLabel = treeCandidate.name || "tree";
var treeObject = parseObjectInput(treeInputRaw, treeInputLabel, treeApplyInputErrors);

if (!targetInput.length && treeObject && treeObject.qname) {
  targetInput = asTrimmed(treeObject.qname);
}
if (!targetInput.length) {
  throw new Error("target is required (or tree.qname must be provided).");
}
if (!treeObject) {
  throw new Error("tree is required and must be a JSON object.");
}

var treeQName = asTrimmed(treeObject.qname);
if (treeQName.length && treeQName !== targetInput) {
  treeApplyWarnings.push("tree.qname differs from target; target is used as the apply root.");
}

var op = {
  type: "upsertTree",
  opId: "tree_apply_root",
  qname: targetInput,
  patch: treeObject
};
var strategyInput = (typeof strategy !== "undefined") ? unwrapValue(strategy) : null;
if (strategyInput !== null && strategyInput !== undefined) {
  if (typeof strategyInput !== "string" || asTrimmed(strategyInput).length > 0) {
    op.strategy = strategyInput;
  }
}

treeApplyResult = C8O.dbo.batchApply({
  target: targetInput,
  operations: [op],
  onError: onErrorInput,
  strict: strictInput,
  autoSave: autoSaveInput,
  triggerMobileBuilder: triggerMobileBuilderInput,
  strategy: strategy,
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

treeApplyStop = treeApplyResult && treeApplyResult.stop ? treeApplyResult.stop : {};
treeApplyResume = treeApplyResult && treeApplyResult.resume ? treeApplyResult.resume : {};
treeApplyReportJson = treeApplyResult ? safeJsonStringify(treeApplyResult) : "{}";
treeApplyFailedOpIdsJson = treeApplyResume && treeApplyResume.failedOpIds ? safeJsonStringify(treeApplyResume.failedOpIds) : "[]";
treeApplyWarningsJson = treeApplyResult && treeApplyResult.warnings ? safeJsonStringify(treeApplyResult.warnings) : "[]";
