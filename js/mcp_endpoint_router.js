// Centralized dispatcher for MCP requests (initialize/tools/prompts/etc.).
var paramsJson = "{}";
try {
  paramsJson = JSON.stringify(paramsObject);
} catch (_p) {
  paramsJson = "{}";
}

if (typeof C8O === "undefined") {
  var C8O = {};
}
if (!C8O.util || !C8O.util.parseObjectInput || !C8O.util.toBoolean) {
  include("js/util.js");
}
if (!C8O.guidance || !C8O.guidance.warningForToolCall) {
  include("js/guidance_version.js");
}
if (!C8O.schemaOverrides || !C8O.schemaOverrides.applyInput) {
  include("js/schema_overrides.js");
}

// Minimal helper to avoid duplicating truthy checks in sequences.
if (typeof notEmpty === "undefined") {
  function notEmpty(value) {
    return value !== null && value !== undefined && String(value).length > 0;
  }
}
if (typeof C8O !== "undefined" && C8O.util) {
  C8O.util.notEmpty = C8O.util.notEmpty || notEmpty;
}
var metaObject = paramsObject && typeof paramsObject._meta === "object" ? paramsObject._meta : null;
var metaNextCursor = metaObject && metaObject.nextCursor !== undefined ? metaObject.nextCursor : null;
var metaProgressToken = metaObject && metaObject.progressToken !== undefined ? metaObject.progressToken : null;

function getSchemaType(schema) {
  if (!schema || typeof schema !== "object") {
    return null;
  }
  if (typeof schema.type === "string") {
    return schema.type.toLowerCase();
  }
  if (Array.isArray(schema.type)) {
    for (var i = 0; i < schema.type.length; i++) {
      var candidate = String(schema.type[i] || "").toLowerCase();
      if (candidate.length) {
        return candidate;
      }
    }
  }
  return null;
}

function schemaAllowsType(schema, typeName) {
  if (!schema || typeof schema !== "object") {
    return false;
  }
  var expected = String(typeName || "").toLowerCase();
  if (!expected.length) {
    return false;
  }
  var typeValue = schema.type;
  if (typeof typeValue === "string" && typeValue.toLowerCase() === expected) {
    return true;
  }
  if (Array.isArray(typeValue)) {
    for (var i = 0; i < typeValue.length; i++) {
      if (String(typeValue[i] || "").toLowerCase() === expected) {
        return true;
      }
    }
  }
  var unions = ["oneOf", "anyOf", "allOf"];
  for (var u = 0; u < unions.length; u++) {
    var key = unions[u];
    var list = schema[key];
    if (!Array.isArray(list)) {
      continue;
    }
    for (var j = 0; j < list.length; j++) {
      if (schemaAllowsType(list[j], expected)) {
        return true;
      }
    }
  }
  return false;
}

function parseStructuredString(input) {
  var text = C8O.util.toTrimmedString(input);
  if (!text.length) {
    return { ok: false, value: input };
  }
  var first = text.charAt(0);
  if (first !== "{" && first !== "[" && first !== "\"") {
    return { ok: false, value: input };
  }
  var candidate = text;
  for (var depth = 0; depth < 4; depth++) {
    var parsed = null;
    try {
      parsed = JSON.parse(candidate);
    } catch (_parseError) {
      return { ok: false, value: input };
    }
    if (typeof parsed === "string") {
      candidate = C8O.util.toTrimmedString(parsed);
      if (!candidate.length) {
        return { ok: false, value: input };
      }
      continue;
    }
    return { ok: true, value: parsed };
  }
  return { ok: false, value: input };
}

function getPropertySchema(schema, key) {
  if (!schema || typeof schema !== "object" || !key) {
    return null;
  }
  if (schema.properties && typeof schema.properties === "object" && schema.properties[key]) {
    return schema.properties[key];
  }
  var unions = ["oneOf", "anyOf", "allOf"];
  for (var u = 0; u < unions.length; u++) {
    var list = schema[unions[u]];
    if (!Array.isArray(list)) {
      continue;
    }
    for (var i = 0; i < list.length; i++) {
      var fromUnion = getPropertySchema(list[i], key);
      if (fromUnion) {
        return fromUnion;
      }
    }
  }
  if (schema.additionalProperties && typeof schema.additionalProperties === "object" && !Array.isArray(schema.additionalProperties)) {
    return schema.additionalProperties;
  }
  return null;
}

function coerceBySchema(value, schema, depth) {
  var level = depth || 0;
  if (level > 8 || !schema || typeof schema !== "object") {
    return value;
  }

  var result = value;
  if (typeof result === "string") {
    if (schemaAllowsType(schema, "object") || schemaAllowsType(schema, "array")) {
      var parsed = parseStructuredString(result);
      if (parsed.ok) {
        result = parsed.value;
      }
    } else if (schemaAllowsType(schema, "boolean")) {
      result = C8O.util.toBoolean(result, result);
    } else if (schemaAllowsType(schema, "integer")) {
      var trimmedInt = C8O.util.toTrimmedString(result);
      if (/^-?\d+$/.test(trimmedInt)) {
        try {
          result = parseInt(trimmedInt, 10);
        } catch (_ignoreInt) {}
      }
    } else if (schemaAllowsType(schema, "number")) {
      var trimmedNum = C8O.util.toTrimmedString(result);
      if (/^-?\d+(?:\.\d+)?$/.test(trimmedNum)) {
        try {
          result = Number(trimmedNum);
        } catch (_ignoreNum) {}
      }
    }
  }

  if (Array.isArray(result)) {
    var itemSchema = null;
    var typeName = getSchemaType(schema);
    if (typeName === "array" && schema.items && typeof schema.items === "object") {
      itemSchema = schema.items;
    } else {
      var unionKeys = ["oneOf", "anyOf", "allOf"];
      for (var uk = 0; uk < unionKeys.length && !itemSchema; uk++) {
        var entries = schema[unionKeys[uk]];
        if (!Array.isArray(entries)) {
          continue;
        }
        for (var ei = 0; ei < entries.length; ei++) {
          var candidateSchema = entries[ei];
          if (getSchemaType(candidateSchema) === "array" && candidateSchema.items && typeof candidateSchema.items === "object") {
            itemSchema = candidateSchema.items;
            break;
          }
        }
      }
    }
    if (itemSchema) {
      var coercedArray = [];
      for (var ai = 0; ai < result.length; ai++) {
        coercedArray.push(coerceBySchema(result[ai], itemSchema, level + 1));
      }
      return coercedArray;
    }
    return result;
  }

  var isPlainObject = result !== null && typeof result === "object" && !Array.isArray(result);
  if (isPlainObject) {
    var coercedObject = {};
    for (var key in result) {
      if (!Object.prototype.hasOwnProperty.call(result, key)) {
        continue;
      }
      var propertySchema = getPropertySchema(schema, key);
      coercedObject[key] = coerceBySchema(result[key], propertySchema, level + 1);
    }
    return coercedObject;
  }

  return result;
}

function coerceToolArguments(argumentsObject, sequenceName, requestableObject) {
  if (!argumentsObject || typeof argumentsObject !== "object" || Array.isArray(argumentsObject)) {
    return {};
  }
  var schema = null;
  try {
    schema = C8O.schemaOverrides.applyInput(sequenceName, null, requestableObject);
  } catch (_ignoreSchema) {
    schema = null;
  }
  if (!schema || typeof schema !== "object") {
    return argumentsObject;
  }
  return coerceBySchema(argumentsObject, schema, 0);
}

function injectMeta(target) {
  if (!target || typeof target !== "object") {
    return;
  }
  target.__nolog = "true";
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
} else if (methodName === "prompts/call" || methodName === "prompts/get") {
  var promptNameRaw = paramsObject && typeof paramsObject.name === "string" ? paramsObject.name : "";
  var promptName = String(promptNameRaw || "").trim();
  if (!promptName.length) {
    callSequence = "mcp_error_response";
    responseStatus = "400";
    callVariables = {
      status: "400",
      code: "-32602",
      message: "Missing prompt name",
      dataJson: JSON.stringify({ name: promptNameRaw }),
      requestIdJson: requestIdJson
    };
  } else {
    callSequence = "mcp_prompts_call";
    callVariables = { name: promptName };
    injectMeta(callVariables);
  }
} else if (methodName === "resources/list") {
  var listCursor = paramsObject && typeof paramsObject.cursor === "string" ? paramsObject.cursor : "";
  callSequence = "mcp_resources_list";
  callVariables = { cursor: listCursor };
  injectMeta(callVariables);
} else if (methodName === "resources/templates/list") {
  var templatesCursor = paramsObject && typeof paramsObject.cursor === "string" ? paramsObject.cursor : "";
  callSequence = "mcp_resources_templates_list";
  callVariables = { cursor: templatesCursor };
  injectMeta(callVariables);
} else if (methodName === "resources/read") {
  var resourceUriRaw = paramsObject && typeof paramsObject.uri === "string" ? paramsObject.uri : "";
  var resourceUri = String(resourceUriRaw || "").trim();
  if (!resourceUri.length) {
    callSequence = "mcp_error_response";
    responseStatus = "400";
    callVariables = {
      status: "400",
      code: "-32602",
      message: "Missing resource uri",
      dataJson: JSON.stringify({ uri: resourceUriRaw }),
      requestIdJson: requestIdJson
    };
  } else {
    callSequence = "mcp_resources_read";
    callVariables = { uri: resourceUri };
    injectMeta(callVariables);
  }
} else if (methodName === "tools/list") {
  callSequence = "mcp_tools_list";
  callVariables = { paramsJson: paramsJson };
  injectMeta(callVariables);
} else if (methodName === "tools/call") {
  var toolNameRaw = paramsObject && typeof paramsObject.name === "string" ? paramsObject.name : "";
  var toolArgs = paramsObject && typeof paramsObject.arguments === "object" && !Array.isArray(paramsObject.arguments) ? paramsObject.arguments : {};
  try {
    mcpGuidanceWarning = C8O.guidance.warningForToolCall(
      toolNameRaw,
      paramsObject,
      (typeof guidanceHeaderVersion !== "undefined") ? guidanceHeaderVersion : "",
      toolArgs
    );
  } catch (_guidanceError) {
    mcpGuidanceWarning = "";
  }
  toolArgs = C8O.guidance.stripToolArguments(toolArgs);
  var targetSequence = "";
  var mappingError = null;
  function sanitizeToken(value, replaceWithUnderscore) {
    var token = String(value || "").toLowerCase();
    if (replaceWithUnderscore) {
      token = token.replace(/[^a-z0-9]+/g, "_");
    } else {
      token = token.replace(/[^a-z0-9-]+/g, "-");
    }
    token = token.replace(/[_-]{2,}/g, function(match) {
      return match.charAt(0);
    });
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
          if (clean.length) {
            actionTokens.push(clean);
          }
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
    callVariables = {
      status: mappingError.status,
      code: mappingError.code,
      message: mappingError.message,
      dataJson: mappingError.data ? JSON.stringify(mappingError.data) : "",
      requestIdJson: requestIdJson
    };
  } else {
    var projectRef = Engine.theApp.databaseObjectsManager.getOriginalProjectByName("ConvertigoMCP");
    var requestable = projectRef ? projectRef.getSequenceByName(targetSequence) : null;
    if (requestable == null) {
      callSequence = "mcp_error_response";
      responseStatus = "404";
      callVariables = {
        status: "404",
        code: "-32601",
        message: "Unknown tool",
        dataJson: JSON.stringify({ name: toolNameRaw, sequence: targetSequence }),
        requestIdJson: requestIdJson
      };
    } else {
      callSequence = targetSequence;
      responseStatus = "200";
      callVariables = coerceToolArguments(toolArgs || {}, targetSequence, requestable);
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
  callVariables = {
    status: "404",
    code: "-32601",
    message: "Method not implemented",
    dataJson: JSON.stringify({ method: methodName }),
    requestIdJson: requestIdJson
  };
}
