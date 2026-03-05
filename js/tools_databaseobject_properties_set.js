if (typeof C8O === "undefined" || typeof C8O.dbo === "undefined") {
  include("js/databaseobject.js");
}
include("js/databaseobject_batch.js");

function _propsSetRequireHelper(name) {
  if (!C8O.dbo || typeof C8O.dbo[name] !== "function") {
    throw new Error("Missing helper C8O.dbo." + name + " (include js/databaseobject_batch.js).");
  }
  return C8O.dbo[name];
}

var asTrimmed = _propsSetRequireHelper("batchAsTrimmed");
var asBoolean = _propsSetRequireHelper("batchAsBoolean");
var safeJsonStringify = _propsSetRequireHelper("batchSafeJsonStringify");

var propsSetInputErrors = [];
var propsSetWarnings = [];

var qnameInput = asTrimmed(qname);
if (!qnameInput.length) {
  throw new Error("qname is required.");
}

var strictInput = (typeof strict !== "undefined") ? strict : false;
var onErrorInput = (typeof onError !== "undefined") ? onError : "stop";
var autoSaveInput = (typeof autoSave !== "undefined") ? autoSave : null;
var resumeFromInput = (typeof resumeFrom !== "undefined") ? resumeFrom : null;
var executionIdInput = (typeof executionId !== "undefined") ? executionId : null;
var dryRunInput = (typeof dryRun !== "undefined") ? dryRun : false;
var refreshInput = (typeof refresh !== "undefined") ? refresh : true;
var triggerMobileBuilderInput = (typeof triggerMobileBuilder !== "undefined") ? triggerMobileBuilder : true;

var op = {
  type: "setProperties",
  opId: "set_properties_root",
  qname: qnameInput,
  properties: (typeof properties !== "undefined") ? properties : null
};

propsSetResult = C8O.dbo.batchApply({
  target: qnameInput,
  operations: [op],
  onError: onErrorInput,
  strict: strictInput,
  autoSave: autoSaveInput,
  triggerMobileBuilder: triggerMobileBuilderInput,
  resumeFrom: resumeFromInput,
  executionId: executionIdInput,
  dryRun: dryRunInput
});

if (propsSetInputErrors.length > 0) {
  if (!propsSetResult.errors) {
    propsSetResult.errors = [];
  }
  for (var pei = 0; pei < propsSetInputErrors.length; pei++) {
    propsSetResult.errors.push(propsSetInputErrors[pei]);
  }
}
if (propsSetWarnings.length > 0) {
  if (!propsSetResult.warnings) {
    propsSetResult.warnings = [];
  }
  for (var pwi = 0; pwi < propsSetWarnings.length; pwi++) {
    propsSetResult.warnings.push(propsSetWarnings[pwi]);
  }
}

propsSetRefreshRequested = asBoolean(refreshInput, true) === true;
propsSetRefreshQName = "";
propsSetStudioRefresh = null;
if (propsSetRefreshRequested) {
  propsSetRefreshQName = C8O.dbo.computeBatchRefreshQName(propsSetResult);
}
if (propsSetRefreshRequested && propsSetRefreshQName.length > 0 && propsSetResult && propsSetResult.dryRun !== true) {
  propsSetStudioRefresh = C8O.dbo.refreshStudioTreeByQName(propsSetRefreshQName, propsSetResult.errors);
}

propsSetStop = propsSetResult && propsSetResult.stop ? propsSetResult.stop : {};
propsSetResume = propsSetResult && propsSetResult.resume ? propsSetResult.resume : {};
propsSetWarningsJson = propsSetResult && propsSetResult.warnings ? safeJsonStringify(propsSetResult.warnings) : "[]";
propsSetFailedOpIdsJson = propsSetResume && propsSetResume.failedOpIds ? safeJsonStringify(propsSetResume.failedOpIds) : "[]";
propsSetReportJson = propsSetResult ? safeJsonStringify(propsSetResult) : "{}";

propsSetUpdatedEntries = [];
if (propsSetResult && propsSetResult.operations && propsSetResult.operations.length > 0) {
  var rootOp = propsSetResult.operations[0];
  var applied = rootOp && rootOp.applied ? rootOp.applied : [];
  for (var ai = 0; ai < applied.length; ai++) {
    var item = applied[ai];
    if (item && item.action === "setProperties" && item.names && item.names.length) {
      for (var ni = 0; ni < item.names.length; ni++) {
        propsSetUpdatedEntries.push({
          name: String(item.names[ni]),
          previousValue: null,
          newValue: null
        });
      }
    }
  }
}
