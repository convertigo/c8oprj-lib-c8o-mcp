if (typeof C8O === "undefined") {
  var C8O = {};
}

if (!C8O.util || typeof C8O.util.toTrimmedString !== "function") {
  include("js/util.js");
}

if (typeof C8O.dbo === "undefined" || typeof C8O.dbo.batchUnwrapValue !== "function") {
  include("js/databaseobject_batch.js");
}

(function () {
  C8O.mcp = C8O.mcp || {};

  function nowMillis() {
    return java.lang.System.currentTimeMillis();
  }

  function asTrimmed(value) {
    if (C8O.util && typeof C8O.util.toTrimmedString === "function") {
      return C8O.util.toTrimmedString(value);
    }
    return value == null ? "" : String(value).trim();
  }

  function safeString(value) {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value);
  }

  function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    return Object.prototype.toString.call(value) === "[object Object]";
  }

  function unwrapValue(value) {
    if (typeof C8O.dbo !== "undefined" && typeof C8O.dbo.batchUnwrapValue === "function") {
      return C8O.dbo.batchUnwrapValue(value);
    }
    return value;
  }

  function toArrayValue(value) {
    var current = unwrapValue(value);
    if (current == null) {
      return null;
    }
    if (Array.isArray(current)) {
      return current;
    }
    if (
      typeof current !== "string" &&
      typeof current.length === "number" &&
      !(typeof current.charAt === "function" && typeof current.substring === "function")
    ) {
      var outByLength = [];
      for (var i = 0; i < current.length; i++) {
        outByLength.push(unwrapValue(current[i]));
      }
      return outByLength;
    }
    if (typeof current.size === "function" && typeof current.get === "function") {
      var outBySize = [];
      var size = 0;
      try {
        size = current.size();
      } catch (_ignoreSize) {
        size = 0;
      }
      for (var j = 0; j < size; j++) {
        outBySize.push(unwrapValue(current.get(j)));
      }
      return outBySize;
    }
    return null;
  }

  function parseJsonMaybe(value, label, errors, expectedType) {
    var raw = unwrapValue(value);
    if (raw === null || raw === undefined) {
      return null;
    }
    if (expectedType === "array") {
      var asArray = toArrayValue(raw);
      if (asArray != null) {
        return asArray;
      }
    }
    if (expectedType === "object" && isPlainObject(raw)) {
      return raw;
    }
    if (typeof raw === "string") {
      var text = asTrimmed(raw);
      if (!text.length) {
        return null;
      }
      try {
        var parsed = JSON.parse(text);
        if (expectedType === "array" && !Array.isArray(parsed)) {
          if (errors && errors.push) {
            errors.push({ code: "validation_error", message: label + " must be a JSON array." });
          }
          return null;
        }
        if (expectedType === "object" && !isPlainObject(parsed)) {
          if (errors && errors.push) {
            errors.push({ code: "validation_error", message: label + " must be a JSON object." });
          }
          return null;
        }
        return parsed;
      } catch (parseError) {
        if (errors && errors.push) {
          errors.push({ code: "validation_error", message: label + " JSON parse error: " + String(parseError) });
        }
        return null;
      }
    }
    var fallbackText = asTrimmed(String(raw));
    if (fallbackText.length && fallbackText !== "[object Object]") {
      return parseJsonMaybe(fallbackText, label, errors, expectedType);
    }
    return null;
  }

  function parseCallsInput(rawCalls, errors) {
    var input = unwrapValue(rawCalls);
    if (input == null) {
      return [];
    }
    var asArray = toArrayValue(input);
    if (asArray != null) {
      return asArray;
    }
    var parsedArray = parseJsonMaybe(input, "calls", errors, "array");
    if (parsedArray) {
      return parsedArray;
    }
    if (errors && errors.push) {
      errors.push({ code: "validation_error", message: "calls must be a JSON array." });
    }
    return [];
  }

  function normalizeOnError(rawOnError) {
    var text = asTrimmed(rawOnError).toLowerCase();
    return text === "continue" ? "continue" : "stop";
  }

  function parseResumeFrom(rawValue) {
    if (rawValue === null || rawValue === undefined) {
      return 0;
    }
    try {
      var parsed = parseInt(String(rawValue), 10);
      return isNaN(parsed) || parsed < 0 ? 0 : parsed;
    } catch (_ignore) {
      return 0;
    }
  }

  function sanitizeToken(value, replaceWithUnderscore) {
    var token = String(value || "").toLowerCase();
    if (replaceWithUnderscore) {
      token = token.replace(/[^a-z0-9]+/g, "_");
    } else {
      token = token.replace(/[^a-z0-9-]+/g, "-");
    }
    token = token.replace(/[_-]{2,}/g, function (match) {
      return match.charAt(0);
    });
    token = token.replace(/^[-_]+|[-_]+$/g, "");
    return token;
  }

  function mapToolToSequence(rawToolName) {
    var toolName = asTrimmed(rawToolName);
    if (!toolName.length) {
      throw new Error("tool is required");
    }
    var targetSequence = "";
    if (toolName.indexOf(".") !== -1) {
      var dotParts = toolName.split(".");
      if (dotParts.length < 2) {
        throw new Error("Invalid tool identifier: " + toolName);
      }
      var cat = sanitizeToken(dotParts[0], true);
      var actionTokens = [];
      for (var di = 1; di < dotParts.length; di++) {
        var clean = sanitizeToken(dotParts[di], true);
        if (clean.length) {
          actionTokens.push(clean);
        }
      }
      if (!cat.length || actionTokens.length === 0) {
        throw new Error("Invalid tool identifier: " + toolName);
      }
      targetSequence = "tools_" + cat + "_" + actionTokens.join("_");
    } else {
      var slug = sanitizeToken(toolName, false);
      var parts = slug.split("-");
      if (parts.length < 2) {
        parts = sanitizeToken(toolName, true).split("_");
      }
      if (parts.length < 2) {
        throw new Error("Invalid tool identifier: " + toolName);
      }
      var catSlug = sanitizeToken(parts.shift(), true);
      var actionSlug = sanitizeToken(parts.join("-"), true);
      if (!catSlug.length || !actionSlug.length) {
        throw new Error("Invalid tool identifier: " + toolName);
      }
      targetSequence = "tools_" + catSlug + "_" + actionSlug;
    }
    return targetSequence;
  }

  function resolveSequence(sequenceName) {
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    var project = Engine.theApp.databaseObjectsManager.getOriginalProjectByName("ConvertigoMCP");
    if (!project) {
      throw new Error("Project ConvertigoMCP is not available.");
    }
    return project.getSequenceByName(sequenceName);
  }

  function toRequestValue(value) {
    var current = unwrapValue(value);
    if (current === null || current === undefined) {
      return null;
    }
    if (typeof current === "string") {
      return current;
    }
    if (typeof current === "number" || typeof current === "boolean") {
      return String(current);
    }
    try {
      return JSON.stringify(current);
    } catch (_ignore) {
      return String(current);
    }
  }

  function extractPayloadFromDocument(document) {
    if (!document) {
      return null;
    }
    var root = null;
    try {
      root = document.getDocumentElement ? document.getDocumentElement() : document;
    } catch (_ignoreRoot) {
      root = null;
    }
    if (!root) {
      return null;
    }

    var XMLUtils = Packages.com.twinsoft.convertigo.engine.util.XMLUtils;
    var asJson = null;
    try {
      asJson = JSON.parse(String(XMLUtils.XmlToJson(root, true, true)));
    } catch (jsonError) {
      throw new Error("Unable to parse internal response XML: " + String(jsonError));
    }

    var node = asJson && asJson.document ? asJson.document : asJson;
    if (node == null) {
      return null;
    }
    if (node.result !== undefined) {
      return node.result;
    }
    return node;
  }

  function internalCallSequence(sequenceName, argsMap) {
    var InternalRequester = Packages.com.twinsoft.convertigo.engine.requesters.InternalRequester;
    var HashMap = Packages.java.util.HashMap;

    var request = new HashMap();
    request.put("__project", "ConvertigoMCP");
    request.put("__sequence", sequenceName);
    request.put("__nolog", "true");

    var keys = Object.keys(argsMap || {});
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (!Object.prototype.hasOwnProperty.call(argsMap, key)) {
        continue;
      }
      var requestValue = toRequestValue(argsMap[key]);
      if (requestValue === null) {
        continue;
      }
      request.put(String(key), String(requestValue));
    }

    var requester = null;
    try {
      requester = new InternalRequester(request, context.httpServletRequest);
    } catch (_ignoreHttpRequest) {
      requester = new InternalRequester(request);
    }
    var response = requester.processRequest();
    return extractPayloadFromDocument(response);
  }

  function deepClone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_ignoreClone) {
      return value;
    }
  }

  function isMutationSequence(sequenceName) {
    if (!sequenceName || !sequenceName.length) {
      return false;
    }
    return (
      sequenceName === "tools_databaseobject_create" ||
      sequenceName === "tools_databaseobject_delete" ||
      sequenceName === "tools_databaseobject_move" ||
      sequenceName === "tools_databaseobject_rename" ||
      sequenceName === "tools_databaseobject_properties_set" ||
      sequenceName === "tools_databaseobject_tree_apply"
    );
  }

  function optimizeMutationArgs(sequenceName, argsMap) {
    var optimized = deepClone(argsMap || {});
    if (!isPlainObject(optimized)) {
      optimized = {};
    }

    // Defer persistence/refresh to a single post-batch finalization.
    optimized.autoSave = false;
    optimized.triggerMobileBuilder = false;
    if (sequenceName === "tools_databaseobject_create" ||
        sequenceName === "tools_databaseobject_delete" ||
        sequenceName === "tools_databaseobject_move" ||
        sequenceName === "tools_databaseobject_rename" ||
        sequenceName === "tools_databaseobject_properties_set" ||
        sequenceName === "tools_databaseobject_tree_apply") {
      optimized.refresh = false;
    }
    return optimized;
  }

  function addUnique(list, set, value) {
    var text = asTrimmed(value);
    if (!text.length || set[text]) {
      return;
    }
    set[text] = true;
    list.push(text);
  }

  function collectTouchedQNamesFromPayload(payload, touchedList, touchedSet) {
    if (payload == null) {
      return;
    }
    if (Array.isArray(payload.touchedQNames)) {
      for (var t = 0; t < payload.touchedQNames.length; t++) {
        addUnique(touchedList, touchedSet, payload.touchedQNames[t]);
      }
    }
    addUnique(touchedList, touchedSet, payload.targetQName);
    addUnique(touchedList, touchedSet, payload.qname);
    addUnique(touchedList, touchedSet, payload.parentQName);
    addUnique(touchedList, touchedSet, payload.newQName);
    addUnique(touchedList, touchedSet, payload.fromParent);
    addUnique(touchedList, touchedSet, payload.toParent);

    var operations = payload.operations;
    if (!Array.isArray(operations)) {
      return;
    }
    for (var i = 0; i < operations.length; i++) {
      var op = operations[i];
      if (!op || !Array.isArray(op.applied)) {
        continue;
      }
      for (var a = 0; a < op.applied.length; a++) {
        var applied = op.applied[a];
        if (!applied) {
          continue;
        }
        addUnique(touchedList, touchedSet, applied.qname);
        addUnique(touchedList, touchedSet, applied.parentQName);
      }
    }
  }

  function registerRef(refs, callId, payload) {
    var id = asTrimmed(callId);
    if (!id.length) {
      return;
    }
    refs[id] = payload === undefined ? null : payload;
  }

  function resolveRefToken(refs, token) {
    var text = asTrimmed(token);
    if (!text.length) {
      throw new Error("Empty $ref token.");
    }

    var dot = text.indexOf(".");
    var refId = dot >= 0 ? text.substring(0, dot) : text;
    var path = dot >= 0 ? text.substring(dot + 1) : "";

    if (!Object.prototype.hasOwnProperty.call(refs, refId)) {
      throw new Error("Unknown $ref id: " + refId);
    }

    var value = refs[refId];
    if (!path.length) {
      return value;
    }

    var segments = path.split(".");
    for (var i = 0; i < segments.length; i++) {
      var segment = segments[i];
      if (value == null) {
        throw new Error("Unknown $ref path: " + text);
      }
      if (Array.isArray(value)) {
        var index = parseInt(segment, 10);
        if (isNaN(index) || index < 0 || index >= value.length) {
          throw new Error("Unknown $ref path: " + text);
        }
        value = value[index];
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(value, segment)) {
        throw new Error("Unknown $ref path: " + text);
      }
      value = value[segment];
    }
    return value;
  }

  function resolveRefsInValue(refs, value) {
    if (value === null || value === undefined) {
      return value;
    }
    if (Array.isArray(value)) {
      var arr = [];
      for (var i = 0; i < value.length; i++) {
        arr.push(resolveRefsInValue(refs, value[i]));
      }
      return arr;
    }
    if (isPlainObject(value)) {
      if (value.$ref !== undefined) {
        return resolveRefToken(refs, value.$ref);
      }
      var out = {};
      var keys = Object.keys(value);
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        out[key] = resolveRefsInValue(refs, value[key]);
      }
      return out;
    }
    return value;
  }

  function normalizeCallItem(rawItem) {
    var item = unwrapValue(rawItem);
    if (!isPlainObject(item)) {
      throw new Error("Each call entry must be an object.");
    }

    var tool = asTrimmed(item.tool || item.name);
    if (!tool.length) {
      throw new Error("call.tool is required.");
    }

    var args = item.arguments;
    if (args === undefined || args === null) {
      args = item.args;
    }
    if (args === undefined || args === null) {
      args = {};
    }
    if (typeof args === "string") {
      var parsedArgs = parseJsonMaybe(args, "call.arguments", null, "object");
      if (parsedArgs) {
        args = parsedArgs;
      }
    }
    if (!isPlainObject(args)) {
      throw new Error("call.arguments must be a JSON object.");
    }

    return {
      id: asTrimmed(item.id || item.callId || item.opId),
      tool: tool,
      arguments: args
    };
  }

  C8O.mcp.batchCall = function (args) {
    var params = args || {};
    var startedAt = nowMillis();

    var errors = [];
    var calls = parseCallsInput(params.calls, errors);
    var onError = normalizeOnError(params.onError);
    var resumeFrom = parseResumeFrom(params.resumeFrom);
    var optimizeMutations = true;
    if (params.optimizeMutations !== undefined) {
      optimizeMutations = C8O.util.toBoolean(params.optimizeMutations, true) === true;
    }

    var executionId = asTrimmed(params.executionId);
    if (!executionId.length) {
      executionId = "batch-" + String(startedAt);
    }

    var reports = [];
    var refs = {};
    var failedCallIds = [];
    var mutationTouchedQNames = [];
    var mutationTouchedQNameSet = {};
    var optimizedMutationCalls = 0;

    var summary = {
      planned: calls.length,
      applied: 0,
      successfulCalls: 0,
      failedCalls: 0,
      skippedCalls: 0,
      notRunCalls: 0
    };

    var stop = null;
    var i = 0;

    for (i = 0; i < calls.length; i++) {
      var report = {
        index: i,
        callId: "call_" + i,
        tool: "",
        sequence: "",
        status: "pending",
        warnings: [],
        errors: []
      };

      if (i < resumeFrom) {
        report.status = "skipped";
        report.phase = "resume_skip";
        reports.push(report);
        summary.skippedCalls += 1;
        continue;
      }

      try {
        var normalized = normalizeCallItem(resolveRefsInValue(refs, calls[i]));
        report.tool = normalized.tool;
        if (normalized.id.length) {
          report.callId = normalized.id;
        }

        var sequenceName = mapToolToSequence(normalized.tool);
        report.sequence = sequenceName;

        if (sequenceName === "tools_batch_call") {
          throw new Error("Recursive call to batch-call is not allowed.");
        }

        var requestable = resolveSequence(sequenceName);
        if (!requestable) {
          throw new Error("Unknown tool: " + normalized.tool + " (sequence " + sequenceName + " not found)");
        }

        var callArguments = resolveRefsInValue(refs, normalized.arguments);
        if (optimizeMutations && isMutationSequence(sequenceName)) {
          callArguments = optimizeMutationArgs(sequenceName, callArguments);
          optimizedMutationCalls += 1;
          report.optimizedMutation = true;
        }

        var payload = internalCallSequence(sequenceName, callArguments);
        report.payload = payload;
        report.status = "applied";

        registerRef(refs, report.callId, payload);
        if (isMutationSequence(sequenceName) && !(payload && payload.dryRun === true)) {
          collectTouchedQNamesFromPayload(payload, mutationTouchedQNames, mutationTouchedQNameSet);
        }
        summary.applied += 1;
        summary.successfulCalls += 1;
      } catch (callError) {
        var message = safeString(callError);
        report.status = "failed";
        report.phase = "call";
        report.errors.push({ code: "call_error", message: message });
        summary.failedCalls += 1;
        failedCallIds.push(report.callId);

        if (!stop && onError === "stop") {
          stop = {
            opIndex: i,
            opId: report.callId,
            type: report.tool,
            phase: "call",
            code: "call_error",
            message: message
          };
          reports.push(report);
          break;
        }
      }

      reports.push(report);
    }

    if (stop) {
      for (var nr = i + 1; nr < calls.length; nr++) {
        reports.push({
          index: nr,
          callId: "call_" + nr,
          tool: "",
          sequence: "",
          status: "not_run",
          phase: "not_run",
          warnings: [],
          errors: []
        });
        summary.notRunCalls += 1;
      }
    }

    var status = "ok";
    if (stop) {
      status = "failed";
    } else if (summary.failedCalls > 0 || errors.length > 0) {
      status = "partial";
    }

    var message = "Batch call completed.";
    if (status === "failed") {
      message = "Batch call stopped on error.";
    } else if (status === "partial") {
      message = "Batch call completed with errors.";
    }

    var resumeFromIndex = calls.length;
    if (stop && stop.opIndex != null) {
      resumeFromIndex = stop.opIndex + 1;
    }
    var remaining = Math.max(0, calls.length - resumeFromIndex);

    var finishedAt = nowMillis();

    var mutationFinalize = {
      optimized: optimizeMutations,
      optimizedCalls: optimizedMutationCalls,
      touchedQNames: mutationTouchedQNames,
      refreshQName: "",
      studioRefresh: null,
      mobileBuilder: [],
      saveResults: [],
      errors: []
    };

    if (optimizeMutations && mutationTouchedQNames.length > 0) {
      try {
        mutationFinalize.refreshQName = C8O.dbo.computeBatchRefreshQName({
          targetQName: "",
          touchedQNames: mutationTouchedQNames,
          status: "ok",
          dryRun: false
        });
      } catch (_ignoreRefreshQNameCompute) {
        mutationFinalize.refreshQName = "";
      }

      if (mutationFinalize.refreshQName.length > 0) {
        try {
          mutationFinalize.studioRefresh = C8O.dbo.refreshStudioTreeByQName(mutationFinalize.refreshQName, mutationFinalize.errors);
        } catch (refreshError) {
          mutationFinalize.errors.push({ code: "refresh_error", message: String(refreshError) });
        }
      }

      try {
        var finalizeResult = C8O.dbo.finalizeMutationsByQNames({
          qnames: mutationTouchedQNames,
          autoSave: true,
          triggerMobileBuilder: true,
          errors: mutationFinalize.errors
        });
        mutationFinalize.mobileBuilder = finalizeResult && finalizeResult.mobileBuilder ? finalizeResult.mobileBuilder : [];
        mutationFinalize.saveResults = finalizeResult && finalizeResult.saveResults ? finalizeResult.saveResults : [];
      } catch (finalizeError) {
        mutationFinalize.errors.push({ code: "finalize_error", message: String(finalizeError) });
      }
    }

    if (mutationFinalize.errors.length > 0) {
      status = status === "ok" ? "partial" : status;
      for (var me = 0; me < mutationFinalize.errors.length; me++) {
        errors.push(mutationFinalize.errors[me]);
      }
    }

    return {
      status: status,
      message: message,
      targetQName: "",
      onError: onError,
      strict: false,
      dryRun: false,
      autoSave: false,
      saved: false,
      summary: summary,
      touchedQNames: mutationTouchedQNames,
      refs: refs,
      operations: reports,
      calls: reports,
      errors: errors,
      stop: stop,
      resume: {
        executionId: executionId,
        fromOpIndex: resumeFromIndex,
        totalOperations: calls.length,
        remaining: remaining,
        canResume: remaining > 0,
        failedOpIds: failedCallIds,
        failedCallIds: failedCallIds
      },
      saveResults: mutationFinalize.saveResults,
      mobileBuilder: mutationFinalize.mobileBuilder,
      mutationFinalize: mutationFinalize,
      durationMs: finishedAt - startedAt,
      timestamp: finishedAt
    };
  };
})();
