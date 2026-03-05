if (typeof C8O === "undefined" || typeof C8O.dbo === "undefined") {
  include("js/databaseobject.js");
}
include("js/databaseobject_batch.js");

function _createRequireHelper(name) {
  if (!C8O.dbo || typeof C8O.dbo[name] !== "function") {
    throw new Error("Missing helper C8O.dbo." + name + " (include js/databaseobject_batch.js).");
  }
  return C8O.dbo[name];
}

function _createParseChildren(value, errors) {
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value.size === "function" && typeof value.get === "function") {
    var outBySize = [];
    var size = 0;
    try {
      size = value.size();
    } catch (_ignoreSize) {
      size = 0;
    }
    for (var j = 0; j < size; j++) {
      outBySize.push(value.get(j));
    }
    return outBySize;
  }

  // Convert string-like inputs (including Java String wrappers) before array-like checks.
  var stringCandidate = null;
  if (typeof value === "string") {
    stringCandidate = value;
  } else {
    try {
      var cls = value && value.getClass ? String(value.getClass().getName()) : "";
      if (cls === "java.lang.String") {
        stringCandidate = String(value);
      }
    } catch (_ignoreJavaClass) {}
    if (stringCandidate === null) {
      try {
        if (Object.prototype.toString.call(value) === "[object String]") {
          stringCandidate = String(value);
        }
      } catch (_ignoreStringTag) {}
    }
  }
  if (stringCandidate !== null) {
    var text = C8O.util.toTrimmedString(stringCandidate);
    if (!text.length) {
      return [];
    }
    try {
      var parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (errors && errors.push) {
        errors.push({ code: "validation_error", message: "children must be a JSON array." });
      }
      return [];
    } catch (parseError) {
      if (errors && errors.push) {
        errors.push({ code: "validation_error", message: "children JSON parse error: " + String(parseError) });
      }
      return [];
    }
  }

  if (typeof value === "string") {
    var text = C8O.util.toTrimmedString(value);
    if (!text.length) {
      return [];
    }
    try {
      var parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (errors && errors.push) {
        errors.push({ code: "validation_error", message: "children must be a JSON array." });
      }
      return [];
    } catch (parseError) {
      if (errors && errors.push) {
        errors.push({ code: "validation_error", message: "children JSON parse error: " + String(parseError) });
      }
      return [];
    }
  }
  if (typeof value === "object" && typeof value.length === "number") {
    if (typeof value.charAt === "function" && typeof value.substring === "function") {
      if (errors && errors.push) {
        errors.push({ code: "validation_error", message: "children must be a JSON array." });
      }
      return [];
    }
    var out = [];
    for (var i = 0; i < value.length; i++) {
      out.push(value[i]);
    }
    return out;
  }
  if (errors && errors.push) {
    errors.push({ code: "validation_error", message: "children must be a JSON array." });
  }
  return [];
}

var asTrimmed = _createRequireHelper("batchAsTrimmed");
var asBoolean = _createRequireHelper("batchAsBoolean");
var unwrapValue = _createRequireHelper("batchUnwrapValue");
var safeJsonStringify = _createRequireHelper("batchSafeJsonStringify");

var createInputErrors = [];
var createWarnings = [];

var relatedInput = asTrimmed(related);
if (!relatedInput.length) {
  throw new Error("related is required.");
}

var modeInput = asTrimmed(mode || "inside");
if (!modeInput.length) {
  modeInput = "inside";
}

var classNameInput = asTrimmed(className);
if (!classNameInput.length) {
  throw new Error("className is required.");
}

var nameInput = asTrimmed(name);
if (!nameInput.length) {
  throw new Error("name is required.");
}

var childrenRaw = null;
if (typeof children !== "undefined") {
  childrenRaw = unwrapValue(children);
}
var childrenList = _createParseChildren(childrenRaw, createInputErrors);

var strictInput = (typeof strict !== "undefined") ? strict : false;
var onErrorInput = (typeof onError !== "undefined") ? onError : "stop";
var autoSaveInput = (typeof autoSave !== "undefined") ? autoSave : ((typeof commit !== "undefined") ? commit : null);
var resumeFromInput = (typeof resumeFrom !== "undefined") ? resumeFrom : null;
var executionIdInput = (typeof executionId !== "undefined") ? executionId : null;
var dryRunInput = (typeof dryRun !== "undefined") ? dryRun : false;
var refreshInput = (typeof refresh !== "undefined") ? refresh : true;
var triggerMobileBuilderInput = (typeof triggerMobileBuilder !== "undefined") ? triggerMobileBuilder : true;

var op = {
  type: "create",
  opId: "create_root",
  related: relatedInput,
  mode: modeInput,
  className: classNameInput,
  name: nameInput,
  properties: (typeof properties !== "undefined") ? properties : null
};
if (childrenList.length > 0) {
  op.children = childrenList;
}

createResult = C8O.dbo.batchApply({
  target: relatedInput,
  operations: [op],
  onError: onErrorInput,
  strict: strictInput,
  autoSave: autoSaveInput,
  triggerMobileBuilder: triggerMobileBuilderInput,
  resumeFrom: resumeFromInput,
  executionId: executionIdInput,
  dryRun: dryRunInput
});

if (createInputErrors.length > 0) {
  if (!createResult.errors) {
    createResult.errors = [];
  }
  for (var ci = 0; ci < createInputErrors.length; ci++) {
    createResult.errors.push(createInputErrors[ci]);
  }
}
if (createWarnings.length > 0) {
  if (!createResult.warnings) {
    createResult.warnings = [];
  }
  for (var cw = 0; cw < createWarnings.length; cw++) {
    createResult.warnings.push(createWarnings[cw]);
  }
}

createRefreshRequested = asBoolean(refreshInput, true) === true;
createRefreshQName = "";
createStudioRefresh = null;
if (createRefreshRequested) {
  createRefreshQName = C8O.dbo.computeBatchRefreshQName(createResult);
}
if (createRefreshRequested && createRefreshQName.length > 0 && createResult && createResult.dryRun !== true) {
  createStudioRefresh = C8O.dbo.refreshStudioTreeByQName(createRefreshQName, createResult.errors);
}

createStop = createResult && createResult.stop ? createResult.stop : {};
createResume = createResult && createResult.resume ? createResult.resume : {};
createWarningsJson = createResult && createResult.warnings ? safeJsonStringify(createResult.warnings) : "[]";
createFailedOpIdsJson = createResume && createResume.failedOpIds ? safeJsonStringify(createResume.failedOpIds) : "[]";
createReportJson = createResult ? safeJsonStringify(createResult) : "{}";

createQName = "";
createParentQName = "";
createClassName = "";
if (createResult && createResult.operations && createResult.operations.length > 0) {
  var rootOp = createResult.operations[0];
  var applied = rootOp && rootOp.applied ? rootOp.applied : [];
  for (var ai = 0; ai < applied.length; ai++) {
    var item = applied[ai];
    if (item && item.action === "create" && !createQName.length) {
      createQName = item.qname ? String(item.qname) : "";
      createParentQName = item.parentQName ? String(item.parentQName) : "";
      createClassName = item.className ? String(item.className) : "";
      break;
    }
  }
}
