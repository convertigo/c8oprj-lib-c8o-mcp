var paramsJson = "{}";
try { paramsJson = JSON.stringify(paramsObject); } catch (_p) { paramsJson = "{}"; }
var metaObject = paramsObject && typeof paramsObject._meta === "object" ? paramsObject._meta : null;
var metaNextCursor = metaObject && metaObject.nextCursor !== undefined ? metaObject.nextCursor : null;
var metaProgressToken = metaObject && metaObject.progressToken !== undefined ? metaObject.progressToken : null;
function injectMeta(target) {
  if (!target || typeof target !== "object") { return; }
  if (metaNextCursor !== null && metaNextCursor !== undefined) {
    var cursorText = String(metaNextCursor);
    if (cursorText.length > 0) {
      target._nextCursor = cursorText;
    }
  }
  if (metaProgressToken !== null && metaProgressToken !== undefined) {
    target._progressToken = metaProgressToken;
  }
}
if (methodName === "initialize") {
    callSequence = "mcp_initialize";
    callVariables = { initProtocol: SUPPORTED_PROTOCOL };
} else if (methodName === "notifications/initialized") {
  responseStatus = "202";
  responseHasBody = false;
} else if (methodName === "ping") {
  callSequence = "mcp_ping";
} else if (methodName === "prompts/list") {
  callSequence = "mcp_prompts_list";
  callVariables = {};
  injectMeta(callVariables);
} else if (methodName === "prompts/call") {
  var promptNameRaw = paramsObject && typeof paramsObject.name === "string" ? paramsObject.name : "";
  var promptName = String(promptNameRaw || "").trim();
  if (!promptName.length) {
    callSequence = "mcp_error_response";
    responseStatus = "400";
    callVariables = { status: "400", code: "-32602", message: "Missing prompt name", dataJson: JSON.stringify({ name: promptNameRaw }), requestIdJson: requestIdJson };
  } else {
    callSequence = "mcp_prompts_call";
    callVariables = { name: promptName };
    injectMeta(callVariables);
  }
} else if (methodName === "tools/list") {
  callSequence = "mcp_tools_list";
  callVariables = { paramsJson: paramsJson };
  injectMeta(callVariables);
} else if (methodName === "tools/call") {
  var toolNameRaw = paramsObject && typeof paramsObject.name === "string" ? paramsObject.name : "";
  var toolArgs = paramsObject && typeof paramsObject.arguments === "object" && !Array.isArray(paramsObject.arguments) ? paramsObject.arguments : {};
  var targetSequence = "";
  var mappingError = null;
  function sanitizeToken(value, replaceWithUnderscore) {
    var token = String(value || "").toLowerCase();
    if (replaceWithUnderscore) {
      token = token.replace(/[^a-z0-9]+/g, "_");
    } else {
      token = token.replace(/[^a-z0-9-]+/g, "-");
    }
    token = token.replace(/[_-]{2,}/g, function(match) { return match.charAt(0); });
    token = token.replace(/^[-_]+|[-_]+$/g, "");
    return token;
  }
  if (!toolNameRaw || String(toolNameRaw).trim().length === 0) {
    mappingError = { status: "400", code: "-32602", message: "Missing tool name" };
  } else {
    var normalizedName = String(toolNameRaw).trim();
    if (normalizedName.indexOf('.') !== -1) {
      var dotParts = normalizedName.split('.');
      if (dotParts.length < 2) {
        mappingError = { status: "400", code: "-32602", message: "Invalid tool identifier", data: { name: toolNameRaw } };
      } else {
        var cat = sanitizeToken(dotParts[0], true);
        var actionTokens = [];
        for (var di = 1; di < dotParts.length; di++) {
          var clean = sanitizeToken(dotParts[di], true);
          if (clean.length) { actionTokens.push(clean); }
        }
        if (!cat.length || actionTokens.length === 0) {
          mappingError = { status: "400", code: "-32602", message: "Invalid tool identifier", data: { name: toolNameRaw } };
        } else {
          targetSequence = "tools_" + cat + "_" + actionTokens.join("_");
        }
      }
    } else {
      var slug = sanitizeToken(normalizedName, false);
      var parts = slug.split('-');
      if (parts.length < 2) {
        parts = sanitizeToken(normalizedName, true).split('_');
      }
      if (parts.length < 2) {
        mappingError = { status: "400", code: "-32602", message: "Invalid tool identifier", data: { name: toolNameRaw } };
      } else {
        var catSlug = sanitizeToken(parts.shift(), true);
        var actionSlug = sanitizeToken(parts.join('-'), true);
        if (!catSlug.length || !actionSlug.length) {
          mappingError = { status: "400", code: "-32602", message: "Invalid tool identifier", data: { name: toolNameRaw } };
        } else {
          targetSequence = "tools_" + catSlug + "_" + actionSlug;
        }
      }
    }
  }
  if (mappingError) {
    callSequence = "mcp_error_response";
    responseStatus = mappingError.status;
    callVariables = { status: mappingError.status, code: mappingError.code, message: mappingError.message, dataJson: mappingError.data ? JSON.stringify(mappingError.data) : "", requestIdJson: requestIdJson };
  } else {
    var projectRef = Engine.theApp.databaseObjectsManager.getOriginalProjectByName("ConvertigoMCP");
    var requestable = projectRef ? projectRef.getSequenceByName(targetSequence) : null;
    if (requestable == null) {
      callSequence = "mcp_error_response";
      responseStatus = "404";
      callVariables = { status: "404", code: "-32601", message: "Unknown tool", dataJson: JSON.stringify({ name: toolNameRaw, sequence: targetSequence }), requestIdJson: requestIdJson };
    } else {
      callSequence = targetSequence;
      responseStatus = "200";
      callVariables = toolArgs || {};
      injectMeta(callVariables);
    }
  }
} else if (methodName === "logging/setLevel") {
  callSequence = "mcp_logging_set_level";
  responseStatus = "200";
  callVariables = { requestIdJson: requestIdJson, paramsJson: paramsJson };
} else {
  callSequence = "mcp_error_response";
  responseStatus = "404";
  callVariables = { status: "404", code: "-32601", message: "Method not implemented", dataJson: JSON.stringify({ method: methodName }), requestIdJson: requestIdJson };
}
