// Centralized dispatcher for MCP requests (initialize/tools/prompts/etc.).
include("js/nocode_tool_policy.js");
include("js/gateway_tool_policy.js");
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
var managedViewerDebugPort = 0;
try {
  var managedViewerDebugPortHeader = context && context.httpServletRequest
    ? context.httpServletRequest.getHeader("X-Convertigo-Viewer-Debug-Port")
    : null;
  managedViewerDebugPort = parseInt(String(managedViewerDebugPortHeader || "0"), 10);
  if (isNaN(managedViewerDebugPort) || managedViewerDebugPort < 1024 || managedViewerDebugPort > 65535) {
    managedViewerDebugPort = 0;
  }
} catch (_ignoreManagedViewerDebugPort) {
  managedViewerDebugPort = 0;
}
// The managed agent hosts name the Tigo conversation: sub-agent runs are recorded under it.
var managedConversationId = "";
try {
  var managedConversationIdHeader = context && context.httpServletRequest
    ? context.httpServletRequest.getHeader("X-Convertigo-Conversation-Id")
    : null;
  managedConversationId = String(managedConversationIdHeader || "").trim();
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(managedConversationId)) {
    managedConversationId = "";
  }
} catch (_ignoreManagedConversationId) {
  managedConversationId = "";
}
// Reveal mode requested by the agent host through the MCP client configuration:
// inject reveal=true on the tools that support it when the model did not pass it.
var managedRevealMode = false;
try {
  var managedRevealModeHeader = context && context.httpServletRequest
    ? context.httpServletRequest.getHeader("X-Convertigo-Reveal-Mode")
    : null;
  managedRevealMode = String(managedRevealModeHeader || "").trim().toLowerCase() === "true";
} catch (_ignoreManagedRevealMode) {
  managedRevealMode = false;
}
// X-Convertigo-No-Log mutes the engine logs of this request. From Convertigo 8.4.6
// the engine MdcFilter already does it for the whole request; before, the /api path
// is not covered by ProjectsDataFilter, so the marker is set here and log4j2 thread
// context inheritance propagates it to the tool sequence threads.
try {
  var managedNoLogHeader = context && context.httpServletRequest
    ? context.httpServletRequest.getHeader("X-Convertigo-No-Log")
    : null;
  if (String(managedNoLogHeader || "").trim().toLowerCase() === "true") {
    Packages.org.apache.log4j.MDC.put("nolog", Packages.java.lang.Boolean.TRUE);
  }
} catch (_ignoreManagedNoLog) {}
var REVEAL_CAPABLE_SEQUENCES = {
  tools_mobile_builder_open: true,
  tools_databaseobject_tree_apply: true,
  tools_batch_call: true,
  tools_nocode_form_create: true,
  tools_nocode_form_edit: true,
  tools_nocode_form_update: true
};

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

// Arguments agents give under another name: the tool ignored them and answered as if they were absent
// (databaseobject-search with query and project scanned nothing and found nothing, run 9a).
var ARGUMENT_ALIASES = {
  tools_databaseobject_search: { query: "filter", q: "filter", text: "filter", search: "filter", project: "qname", target: "qname" }
};

function applyArgumentAliases(sequenceName, args) {
  var aliases = ARGUMENT_ALIASES[sequenceName];
  if (!aliases || !args || typeof args !== "object") {
    return args;
  }
  for (var alias in aliases) {
    if (Object.prototype.hasOwnProperty.call(aliases, alias) && Object.prototype.hasOwnProperty.call(args, alias)) {
      var canonical = aliases[alias];
      if (args[canonical] === undefined || args[canonical] === null || String(args[canonical]).trim() === "") {
        args[canonical] = args[alias];
      }
      delete args[alias];
    }
  }
  return args;
}

// Arguments that are neither in the tool's schema nor variables of its sequence were dropped with no word: marketplace-list
// called with query instead of search listed the whole marketplace (2026-10-19). Name them, and the arguments the tool takes.
var ROUTER_SET_ARGUMENTS = { browserDebugPort: true, conversationId: true, reveal: true };

function schemaPropertyNames(schema, into, depth) {
  if (!schema || typeof schema !== "object" || depth > 4) {
    return into;
  }
  if (schema.properties && typeof schema.properties === "object") {
    for (var name in schema.properties) {
      if (Object.prototype.hasOwnProperty.call(schema.properties, name)) {
        into[name] = true;
      }
    }
  }
  ["oneOf", "anyOf", "allOf"].forEach(function (union) {
    if (Array.isArray(schema[union])) {
      schema[union].forEach(function (part) { schemaPropertyNames(part, into, depth + 1); });
    }
  });
  return into;
}

function unknownArgumentsWarning(sequenceName, requestableObject, args) {
  try {
    var schema = null;
    try {
      schema = C8O.schemaOverrides.applyInput(sequenceName, null, requestableObject);
    } catch (_noSchema) {}
    if (schema && (schema.additionalProperties === true || (schema.additionalProperties && typeof schema.additionalProperties === "object"))) {
      return "";
    }
    var allowed = schemaPropertyNames(schema, {}, 0);
    var variables = requestableObject ? requestableObject.getVariablesList() : null;
    for (var v = 0; variables != null && v < variables.size(); v++) {
      allowed[String(variables.get(v).getName())] = true;
    }
    var unknown = [];
    for (var key in args) {
      if (Object.prototype.hasOwnProperty.call(args, key) && allowed[key] !== true && key.charAt(0) !== "_" && ROUTER_SET_ARGUMENTS[key] !== true) {
        unknown.push(key);
      }
    }
    if (!unknown.length) {
      return "";
    }
    var names = Object.keys(allowed).filter(function (k) { return k.charAt(0) !== "_"; }).sort();
    return (unknown.length > 1 ? "Ignored arguments " : "Ignored argument ") + unknown.join(", ") +
      ": not taken by this tool, the call ran without " + (unknown.length > 1 ? "them" : "it") + ". Its arguments: " + names.join(", ") + ".";
  } catch (_ignoreArgumentCheck) {
    return "";
  }
}

// Notes for the agent at work from the person who supervises it: a file under <engine workspace>/agents/notes, named after
// the conversation (the X-Convertigo-Conversation-Id the Bridge sends) or next.md for the next call of any conversation.
// The next successful tool answer carries it once, as operatorNote, and the file is renamed .delivered. Vibe and Claude
// read the user only between turns: in run 10 every note waited for the end of a 47 min turn and arrived too late.
function takeOperatorNote() {
  try {
    var Files = java.nio.file.Files;
    var dir = new java.io.File(new java.io.File(String(Packages.com.twinsoft.convertigo.engine.Engine.USER_WORKSPACE_PATH), "agents"), "notes");
    var names = managedConversationId.length ? [managedConversationId + ".md", "next.md"] : ["next.md"];
    for (var i = 0; i < names.length; i++) {
      var file = new java.io.File(dir, names[i]);
      if (!file.isFile()) {
        continue;
      }
      // Renamed before it is read: of two calls at once, only one takes it.
      var taken = new java.io.File(dir, names[i].replace(/\.md$/, "") + "." + java.lang.System.currentTimeMillis() + ".delivered.md");
      if (!file.renameTo(taken)) {
        continue;
      }
      var text = String(new java.lang.String(Files.readAllBytes(taken.toPath()), "UTF-8")).trim();
      if (text.length) {
        return text.length > 4000 ? text.substring(0, 4000) + " [cut]" : text;
      }
    }
  } catch (_ignoreOperatorNote) {}
  return "";
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
  // Clients ping often to check the connection: answer inline in mcp_endpoint,
  // without internal_call or mcp_ping, and keep these calls out of the engine logs.
  pingInline = true;
  try {
    Packages.org.apache.log4j.MDC.put("nolog", Packages.java.lang.Boolean.TRUE);
  } catch (_ignorePingNoLog) {}
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
  callVariables = {
    paramsJson: paramsJson,
    authKind: typeof mcpAuthentication !== "undefined" && mcpAuthentication && mcpAuthentication.kind
      ? String(mcpAuthentication.kind)
      : ""
  };
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
  var normalizedRequestedTool = String(toolNameRaw || "").trim().toLowerCase();
  if (typeof mcpAuthentication !== "undefined" && mcpAuthentication && mcpAuthentication.kind === "nocode"
      && normalizedRequestedTool.indexOf("nocode-") !== 0
      && normalizedRequestedTool.indexOf("nocode.") !== 0) {
    mappingError = {
      status: "403",
      code: "-32003",
      message: "This token is restricted to Convertigo No Code tools",
      data: { name: toolNameRaw, scope: mcpAuthentication.scope || "forms:write" }
    };
  }
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
  if (!mappingError && (!toolNameRaw || String(toolNameRaw).trim().length === 0)) {
    mappingError = { status: "400", code: "-32602", message: "Missing tool name" };
  } else if (!mappingError) {
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
  // Former tool names still answer: facade-create became business-sequence-create.
  var RENAMED_TOOL_SEQUENCES = { tools_facade_create: "tools_business_sequence_create" };
  if (!mappingError && RENAMED_TOOL_SEQUENCES[targetSequence]) {
    targetSequence = RENAMED_TOOL_SEQUENCES[targetSequence];
  }
  if (!mappingError) {
    if (String(toolNameRaw || "").trim().toLowerCase() === "requestable-execute") {
      var nestedRequestable = toolArgs && toolArgs.requestable != null ? String(toolArgs.requestable).trim() : "";
      if (/^(lib_ConvertigoMCP\.)?mcp_endpoint$/i.test(nestedRequestable)) {
        mappingError = {
          status: "400",
          code: "-32602",
          message: "Refusing recursive MCP endpoint execution",
          data: { requestable: nestedRequestable }
        };
      }
    }
  }
  var gatewayPolicy = C8O.gatewayToolPolicy || null;
  if (!mappingError && gatewayPolicy && !gatewayPolicy.allows(targetSequence)) {
    mappingError = { status: "403", code: "-32601", message: gatewayPolicy.refusal(targetSequence) };
  }
  // The text review of project-lint calls a gateway model too: the agent reviews the texts itself.
  if (!mappingError && targetSequence === "tools_project_lint" && gatewayPolicy && gatewayPolicy.active() && toolArgs) {
    toolArgs.checkTexts = false;
  }
  if (!mappingError && C8O.nocodeToolPolicy.active() && !C8O.nocodeToolPolicy.allows(targetSequence)) {
    mappingError = {
      status: "403", code: "-32601",
      message: "This tool is not available in the No Code assistant. Use the no-code tools only."
    };
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
    var projectRef = Engine.theApp.databaseObjectsManager.getOriginalProjectByName("lib_ConvertigoMCP");
    // getSequenceByName throws for a missing name: an unknown tool answered "Internal MCP routing error" (preflight checks).
    var requestable = null;
    try {
      requestable = projectRef ? projectRef.getSequenceByName(targetSequence) : null;
    } catch (_unknownSequence) {
      requestable = null;
    }
    if (requestable == null) {
      callSequence = "mcp_error_response";
      responseStatus = "404";
      var closeTools = [];
      try {
        var asked = String(toolNameRaw || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
        var words = asked.split("-").filter(function (w) { return w.length > 2; });
        var scored = [];
        var sequences = projectRef ? projectRef.getSequencesList() : null;
        for (var si = 0; sequences && si < sequences.size(); si++) {
          var seqName = String(sequences.get(si).getName());
          if (seqName.indexOf("tools_") !== 0) {
            continue;
          }
          var toolName = seqName.substring(6).replace(/_/g, "-");
          // A name that starts the asked one or the reverse first (project-save for project-saved), then shared words.
          var score = (asked.indexOf(toolName) === 0 || toolName.indexOf(asked) === 0) ? 10 : 0;
          words.forEach(function (w) {
            if (toolName.indexOf(w) !== -1) {
              score += 1;
            }
          });
          if (score > 0) {
            scored.push({ name: toolName, score: score });
          }
        }
        scored.sort(function (a, b) { return b.score - a.score || (a.name < b.name ? -1 : 1); });
        closeTools = scored.slice(0, 5).map(function (x) { return x.name; });
      } catch (_noSuggestions) {}
      callVariables = {
        status: "404",
        code: "-32601",
        message: "Unknown tool " + toolNameRaw + (closeTools.length ? ". Close tools: " + closeTools.join(", ") : "") + ". tools/list gives every tool.",
        dataJson: JSON.stringify({ name: toolNameRaw, sequence: targetSequence, closeTools: closeTools }),
        requestIdJson: requestIdJson
      };
    } else {
      callSequence = targetSequence;
      responseStatus = "200";
      callVariables = coerceToolArguments(applyArgumentAliases(targetSequence, toolArgs || {}), targetSequence, requestable);
      mcpArgumentWarning = unknownArgumentsWarning(targetSequence, requestable, toolArgs || {});
      // Sub-agents drive the same viewer as the agent's Playwright MCP (the conversation's debug port) and are recorded
      // under the conversation.
      var subagentSequence = targetSequence === "tools_browser_verify" || targetSequence === "tools_subagent_run";
      if ((targetSequence === "tools_mobile_builder_open" || subagentSequence) && managedViewerDebugPort > 0) {
        callVariables.browserDebugPort = managedViewerDebugPort;
      }
      if (subagentSequence && managedConversationId.length) {
        callVariables.conversationId = managedConversationId;
      }
      // One writer per project while a constructor sub-agent builds it: its own session only.
      try {
        if (typeof C8O.subagents === "undefined" || !C8O.subagents.projectsOfCall) {
          include("js/subagents.js");
        }
        var writtenProjects = C8O.subagents.projectsOfCall(targetSequence, toolArgs || {});
        if (writtenProjects.length) {
          var subagentRunHeader = context && context.httpServletRequest
            ? String(context.httpServletRequest.getHeader("X-Convertigo-Subagent-Run") || "") : "";
          var lockHost = C8O.subagents.javaHost();
          for (var wp = 0; wp < writtenProjects.length; wp++) {
            var blocked = C8O.subagents.projectWriteBlocked(writtenProjects[wp], subagentRunHeader, lockHost);
            if (blocked) {
              callSequence = "mcp_error_response";
              responseStatus = "409";
              callVariables = {
                status: "409",
                code: "-32010",
                message: blocked.message,
                dataJson: JSON.stringify({ project: writtenProjects[wp], runId: blocked.runId }),
                requestIdJson: requestIdJson
              };
              break;
            }
          }
        }
      } catch (_ignoreProjectLock) {}
      if (callSequence === targetSequence && managedRevealMode && REVEAL_CAPABLE_SEQUENCES[targetSequence] === true
          && (callVariables.reveal === undefined || callVariables.reveal === null || String(callVariables.reveal).trim().length === 0)) {
        callVariables.reveal = "true";
      }
      if (callSequence === targetSequence) {
        injectMeta(callVariables);
      }
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
