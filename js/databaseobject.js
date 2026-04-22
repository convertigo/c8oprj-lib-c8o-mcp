/*
 * Shared helpers for ConvertigoMCP sequences.
 * These functions run in the Rhino context used by Convertigo sequences.
 */

include("js/util.js");
include("js/xmlizable.js");

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.util = C8O.util || {};
C8O.dbo = C8O.dbo || {};
C8O.cache = C8O.cache || {};

include("js/databaseobject_persist.js");
include("js/databaseobject_studio.js");
// Classname helpers: Convertigo beans live under com.twinsoft.convertigo.beans.*
var _BEANS_PREFIX = "com.twinsoft.convertigo.beans.";

// Simple helper to test non-empty values.
function notEmpty(value) {
  return value !== null && value !== undefined && String(value).length > 0;
}
C8O.util.notEmpty = notEmpty;

C8O.util.toFqcn = C8O.util.toFqcn || function (name) {
  var text = C8O.util.toTrimmedString ? C8O.util.toTrimmedString(name || "") : String(name || "");
  if (!text.length) {
    return text;
  }
  var hashIndex = text.indexOf("#");
  if (hashIndex !== -1) {
    var baseText = text.substring(0, hashIndex);
    var logicalId = text.substring(hashIndex + 1);
    var fqcnBase = baseText.indexOf("com.") === 0 ? baseText : _BEANS_PREFIX + baseText;
    return fqcnBase + "#" + logicalId;
  }
  return text.indexOf("com.") === 0 ? text : _BEANS_PREFIX + text;
};
C8O.util.fromFqcn = C8O.util.fromFqcn || function (name) {
  var text = C8O.util.toTrimmedString ? C8O.util.toTrimmedString(name || "") : String(name || "");
  if (!text.length) {
    return text;
  }
  var hashIndex = text.indexOf("#");
  if (hashIndex !== -1) {
    var baseText = text.substring(0, hashIndex);
    var logicalId = text.substring(hashIndex + 1);
    var shortBase = baseText.indexOf(_BEANS_PREFIX) === 0 ? baseText.substring(_BEANS_PREFIX.length) : baseText;
    return shortBase + "#" + logicalId;
  }
  return text.indexOf(_BEANS_PREFIX) === 0 ? text.substring(_BEANS_PREFIX.length) : text;
};

C8O.dbo.parseLogicalClassToken = function (value) {
  var raw = C8O.util.toTrimmedString ? C8O.util.toTrimmedString(value || "") : String(value || "").trim();
  var hashIndex = raw.indexOf("#");
  var baseText = hashIndex === -1 ? raw : raw.substring(0, hashIndex);
  var logicalId = hashIndex === -1 ? "" : raw.substring(hashIndex + 1);
  var baseFqcn = C8O.util.toFqcn ? C8O.util.toFqcn(baseText) : baseText;
  return {
    raw: raw,
    baseClassName: C8O.util.fromFqcn ? C8O.util.fromFqcn(baseFqcn) : baseFqcn,
    baseClassFqcn: baseFqcn,
    logicalId: logicalId,
    hasLogicalId: logicalId.length > 0
  };
};

C8O.dbo.buildLogicalClassName = function (classNameOrFqcn, logicalId) {
  var baseText = C8O.util.toTrimmedString ? C8O.util.toTrimmedString(classNameOrFqcn || "") : String(classNameOrFqcn || "").trim();
  var shortBase = C8O.util.fromFqcn ? C8O.util.fromFqcn(baseText) : baseText;
  var idText = C8O.util.toTrimmedString ? C8O.util.toTrimmedString(logicalId || "") : String(logicalId || "").trim();
  return idText.length ? shortBase + "#" + idText : shortBase;
};

(function () {
  function getProjectStore() {
    try {
      if (typeof context !== "undefined" && context && context.project) {
        var project = context.project;
        if (project && typeof project.get === "function" && typeof project.set === "function") {
          return project;
        }
      }
    } catch (_ignoreProjectStore) {}
    return null;
  }

  C8O.cache._getProjectStore = getProjectStore;

  C8O.cache.getProjectValue = function (key) {
    var store = getProjectStore();
    if (!store) {
      return null;
    }
    var value = store.get(key);
    return typeof value === "undefined" ? null : value;
  };

  C8O.cache.setProjectValue = function (key, value) {
    var store = getProjectStore();
    if (!store) {
      return false;
    }
    store.set(key, value);
    return true;
  };

  C8O.cache.getProjectMap = function (key) {
    var store = getProjectStore();
    if (!store) {
      return null;
    }
    var bucket = store.get(key);
    if (!bucket || typeof bucket !== "object") {
      bucket = {};
      store.set(key, bucket);
    }
    return bucket;
  };
})();


C8O.dbo.LLM_HINTS = C8O.dbo.LLM_HINTS || {};

var SINGLE_SOURCE_HINT =
  'SmartType sources must be JSON arrays of the form ["<stepPriority>", "<xpath>"]. ' +
  'The first element is the numeric priority of the step exposing the source document, ' +
  'the second element is the XPath evaluated against that step output. ' +
  'For TransactionStep or RequestableStep output, start from ./document/... (for example ./document/object/ip/text()). ' +
  'Do not reference requestable variable names or QNames directly, and never merge both values into a single string (e.g., no "123,./text()").';

var SMART_TYPE_VALUE_HINT =
  'SmartType values are JSON objects like {"mode":"PLAIN","expression":"text"}. ' +
  'Use {"mode":"JS","expression":"<javascript>"} for evaluated expressions, or {"mode":"SOURCE","sources":["<stepPriority>","<xpath>"]} to pull data from another step output.';

var MULTI_SOURCES_HINT =
  'sourcesDefinition expects an array of entries, each entry providing a label, a SmartType source (same ["<stepPriority>", "<xpath>"] structure), and an optional fallback value. ' +
  'Build it as a JSON array of objects such as { description: "optional", source: ["1234567890", "./text()"], defaultValue: "" } so the picker-style data is preserved.';

// HTTP connector hints
var HTTP_URL_HINT =
  'Set the base URL with scheme + host, no trailing slash (e.g., https://httpbin.org). Do not set it to "/" else subPath will produce //path.';
var HTTP_BASEDIR_HINT =
  'Root path (baseDir) is appended after host and before subPath. Leave empty or without trailing slash to avoid // when subPath starts with "/". Example: host=https://httpbin.org, baseDir="", subPath="/ip" -> https://httpbin.org/ip.';
var HTTP_SUBPATH_HINT =
  'SubPath must start with "/" (e.g., /ip). The final URL is base url + subPath (e.g., https://httpbin.org/ip). Avoid double slashes.';

var singleSourceClasses = [
  "com.twinsoft.convertigo.beans.variables.StepVariable",
  "com.twinsoft.convertigo.beans.steps.IfExistStep",
  "com.twinsoft.convertigo.beans.steps.IfExistThenElseStep",
  "com.twinsoft.convertigo.beans.steps.IsInStep",
  "com.twinsoft.convertigo.beans.steps.IsInThenElseStep",
  "com.twinsoft.convertigo.beans.steps.IteratorStep",
  "com.twinsoft.convertigo.beans.steps.JsonSourceStep",
  "com.twinsoft.convertigo.beans.steps.SimpleSourceStep",
  "com.twinsoft.convertigo.beans.steps.SmtpStep",
  "com.twinsoft.convertigo.beans.steps.SourceStep",
  "com.twinsoft.convertigo.beans.steps.WriteBase64Step",
  "com.twinsoft.convertigo.beans.steps.WriteCSVStep",
  "com.twinsoft.convertigo.beans.steps.WriteJSONStep",
  "com.twinsoft.convertigo.beans.steps.WriteXMLStep",
  "com.twinsoft.convertigo.beans.steps.XMLAttributeStep",
  "com.twinsoft.convertigo.beans.steps.XMLCopyStep",
  "com.twinsoft.convertigo.beans.steps.XMLCountStep",
  "com.twinsoft.convertigo.beans.steps.XMLElementStep",
  "com.twinsoft.convertigo.beans.steps.XMLSortStep",
  "com.twinsoft.convertigo.beans.steps.XMLSplitStep",
  "com.twinsoft.convertigo.beans.steps.XMLTransformStep"
];

for (var i = 0; i < singleSourceClasses.length; i++) {
  C8O.dbo.LLM_HINTS[singleSourceClasses[i] + "#sourceDefinition"] = SINGLE_SOURCE_HINT;
}

var multiSourceProperties = [
  { className: "com.twinsoft.convertigo.beans.steps.XMLConcatStep", property: "sourcesDefinition" },
  { className: "com.twinsoft.convertigo.beans.steps.XMLDateTimeStep", property: "sourcesDefinition" }
];

for (var j = 0; j < multiSourceProperties.length; j++) {
  var entry = multiSourceProperties[j];
  C8O.dbo.LLM_HINTS[entry.className + "#" + entry.property] = MULTI_SOURCES_HINT;

// HTTP hints keyed on short class names (className is shortened in outputs)
C8O.dbo.LLM_HINTS["connectors.HttpConnector#url"] = HTTP_URL_HINT;
C8O.dbo.LLM_HINTS["connectors.HttpConnector#baseDir"] = HTTP_BASEDIR_HINT;
C8O.dbo.LLM_HINTS["transactions.HttpTransaction#subPath"] = HTTP_SUBPATH_HINT;
}

C8O.dbo.getSmartTypeValueHint = function () {
  return SMART_TYPE_VALUE_HINT;
};

C8O.dbo.resolveLlmHint = function (className, propertyName, propertyEntry) {
  var classLabel = className == null ? "" : String(className);
  var propertyLabel = propertyName == null ? "" : String(propertyName);
  var key = classLabel + "#" + propertyLabel;
  if (C8O.dbo.LLM_HINTS && C8O.dbo.LLM_HINTS[key]) {
    return String(C8O.dbo.LLM_HINTS[key]);
  }
  var normalizedName = propertyLabel.toLowerCase();
  if (normalizedName === "sourcedefinition") {
    return SINGLE_SOURCE_HINT;
  }
  if (normalizedName === "sourcesdefinition") {
    return MULTI_SOURCES_HINT;
  }
  if (propertyEntry) {
    var kind = propertyEntry.kind || propertyEntry.valueKind || "";
    if (kind) {
      kind = String(kind).toLowerCase();
      if (kind === "smarttype") {
        return SMART_TYPE_VALUE_HINT;
      }
    }
    var typeName = propertyEntry.type ? String(propertyEntry.type).toLowerCase() : "";
    if (typeName.indexOf("smarttype") !== -1) {
      return SMART_TYPE_VALUE_HINT;
    }
  }
  return null;
};









/**
 * Returns a trimmed string representation or an empty string when null/undefined.
 */
/**
 * Ensures we have access to the current project from the context.
 */
C8O.dbo.requireProject = function (context) {
  if (!context || !context.project) {
    throw new Error("No project context available");
  }
  return context.project;
};

/**
 * Resolves a database object by QName. Throws when not found unless optional.
 */
C8O.dbo._extractProjectName = function (qname) {
  var input = C8O.util.toTrimmedString(qname);
  if (!input.length) {
    return "";
  }
  var dotIndex = input.indexOf(".");
  var colonIndex = input.indexOf(":");
  var cutIndex = -1;
  if (dotIndex === -1 && colonIndex === -1) {
    cutIndex = -1;
  } else if (dotIndex === -1) {
    cutIndex = colonIndex;
  } else if (colonIndex === -1) {
    cutIndex = dotIndex;
  } else {
    cutIndex = Math.min(dotIndex, colonIndex);
  }
  if (cutIndex <= 0) {
    return input;
  }
  return input.substring(0, cutIndex);
};

C8O.dbo._listProjectNames = function () {
  var names = [];
  try {
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    var javaNames = Engine.theApp.databaseObjectsManager.getAllProjectNamesList();
    if (javaNames != null) {
      for (var i = 0; i < javaNames.size(); i++) {
        names.push(String(javaNames.get(i)));
      }
    }
  } catch (_ignoreProjects) {}
  return names;
};

C8O.dbo._findExistingAncestor = function (qname) {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var manager = Engine.theApp.databaseObjectsManager;
  var candidate = C8O.util.toTrimmedString(qname);
  var seen = {};
  while (candidate.length) {
    var dot = candidate.lastIndexOf(".");
    var colon = candidate.lastIndexOf(":");
    var cut = Math.max(dot, colon);
    if (cut <= 0) {
      break;
    }
    candidate = candidate.substring(0, cut);
    if (!candidate.length || seen[candidate]) {
      continue;
    }
    seen[candidate] = true;
    try {
      var ancestor = manager.getDatabaseObjectByQName(candidate);
      if (ancestor != null) {
        return ancestor;
      }
    } catch (_ignoreAncestor) {}
  }
  return null;
};

C8O.dbo._buildResolveError = function (qname, opts, rootError) {
  var prefix = opts && opts.messagePrefix ? String(opts.messagePrefix) + ": " : "";
  var baseMessage = prefix + "Database object not found: " + qname;
  var hints = [];
  var projectName = C8O.dbo._extractProjectName(qname);
  if (projectName) {
    var knownProjects = C8O.dbo._listProjectNames();
    var hasProject = false;
    for (var i = 0; i < knownProjects.length; i++) {
      if (knownProjects[i] === projectName) {
        hasProject = true;
        break;
      }
    }
    if (!hasProject) {
      hints.push(
        "Project \"" +
          projectName +
          "\" is not loaded. Run project-list to inspect available projects or import \"" +
          projectName +
          "\" before targeting it."
      );
    }
  }
  var ancestor = C8O.dbo._findExistingAncestor(qname);
  if (ancestor != null) {
    var ancestorQName = "";
    try {
      ancestorQName = ancestor.getFullQName ? String(ancestor.getFullQName()) : String(ancestor);
    } catch (_ignoreQName) {
      ancestorQName = String(ancestor);
    }
    var ancestorClass = "";
    try {
      ancestorClass = ancestor.getClass ? String(ancestor.getClass().getName()) : "";
    } catch (_ignoreClass) {}
    var ancestorLabel = ancestorQName;
    if (ancestorClass && ancestorClass.length) {
      ancestorLabel += " (" + ancestorClass + ")";
    }
    hints.push(
      "Closest existing ancestor: " +
        ancestorLabel +
        ". Call databaseobject-tree-get with target=\"" +
        ancestorQName +
        "\", childrenDepth=1, properties=\"none\"."
    );
  }
  if (!hints.length) {
    hints.push('Call tool_project-list to list available roots.');
  }
  var message = baseMessage + ". " + hints.join(" ");
  var error = new Error(message);
  if (rootError && rootError.stack) {
    error.stack = rootError.stack;
  }
  return error;
};

C8O.dbo.resolve = function (qname, options) {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var opts = options || {};
  var text = C8O.util.toTrimmedString(qname);
  if (!text.length) {
    throw new Error((opts.messagePrefix || "") + "QName is required");
  }
  try {
    var dbo = Engine.theApp.databaseObjectsManager.getDatabaseObjectByQName(text);
    if (dbo == null) {
      if (opts.optional) {
        return null;
      }
      throw C8O.dbo._buildResolveError(text, opts);
    }
    return dbo;
  } catch (lookupError) {
    if (opts.optional) {
      return null;
    }
    if (lookupError instanceof Error) {
      throw C8O.dbo._buildResolveError(text, opts, lookupError);
    }
    throw C8O.dbo._buildResolveError(text, opts, new Error(String(lookupError)));
  }
};

/**
 * Normalize property updates from any MCP-friendly representation to
 * a key/value object accepted by applyPropertyUpdates():
 * - map: { "Color": "success" }
 * - array: [{ "name": "Color", "value": "success" }]
 * - object wrapper: { "properties": [ ... ] } or { "entries": [ ... ] }
 */
C8O.dbo._normalizePropertyUpdates = function (input, errors, label) {
  var scope = C8O.util.toTrimmedString(label || "properties");

  function pushError(message) {
    if (errors && errors.push) {
      errors.push({ name: scope, message: String(message) });
    }
  }

  function toMapFromList(list) {
    var out = {};
    for (var i = 0; i < list.length; i++) {
      var entry = list[i];
      if (!entry || !C8O.util.isPlainObject(entry)) {
        pushError("Ignoring non-object property entry at index " + i + ".");
        continue;
      }
      var entryName = C8O.util.toTrimmedString(
        entry.name != null ? entry.name :
        (entry.key != null ? entry.key : entry.property)
      );
      if (!entryName.length) {
        pushError("Ignoring property entry without name at index " + i + ".");
        continue;
      }
      var hasValue = Object.prototype.hasOwnProperty.call(entry, "value");
      var hasNewValue = Object.prototype.hasOwnProperty.call(entry, "newValue");
      if (!hasValue && !hasNewValue) {
        pushError("Ignoring property entry '" + entryName + "' without value.");
        continue;
      }
      out[entryName] = hasValue ? entry.value : entry.newValue;
    }
    return out;
  }

  if (input == null) {
    return {};
  }

  if (Array.isArray(input)) {
    return toMapFromList(input);
  }

  if (C8O.util.isPlainObject(input)) {
    var wrapperList = null;
    if (Array.isArray(input.properties)) {
      wrapperList = input.properties;
    } else if (Array.isArray(input.entries)) {
      wrapperList = input.entries;
    } else if (Array.isArray(input.updates)) {
      wrapperList = input.updates;
    }
    if (wrapperList != null) {
      return toMapFromList(wrapperList);
    }
    return input;
  }

  pushError("Properties payload must be a JSON object or an array of {name,value} entries.");
  return {};
};

/**
 * Parse and normalize property payloads.
 */
C8O.dbo.parsePropertyUpdates = function (input, errors) {
  var payload = input;

  if (payload && typeof payload.unwrap === "function") {
    try {
      payload = payload.unwrap();
    } catch (_ignoreUnwrapPayload) {}
  }

  if (typeof payload === "string") {
    var trimmed = C8O.util.toTrimmedString(payload);
    if (!trimmed.length) {
      return {};
    }
    var parsed = C8O.util.tryParseJson(trimmed, errors, "properties");
    if (parsed && typeof parsed === "string") {
      var nested = C8O.util.tryParseJson(parsed, errors, "properties");
      if (nested) {
        parsed = nested;
      }
    }
    if (!parsed) {
      if (errors && errors.push) {
        errors.push({ name: "properties", message: "Properties payload must be a JSON object or an array of {name,value} entries." });
      }
      return {};
    }
    payload = parsed;
  }

  return C8O.dbo._normalizePropertyUpdates(payload, errors, "properties");
};

C8O.dbo._getDescriptorMap = function (dbo) {
  var CachedIntrospector = Packages.com.twinsoft.convertigo.engine.util.CachedIntrospector;
  var beanInfo = CachedIntrospector.getBeanInfo(dbo.getClass());
  var descriptors = beanInfo.getPropertyDescriptors();
  var map = {};
  for (var i = 0; i < descriptors.length; i++) {
    map[descriptors[i].getName()] = descriptors[i];
  }
  return map;
};

C8O.dbo._toJsArray = function (javaArrayLike) {
  var list = [];
  if (!javaArrayLike) {
    return list;
  }
  try {
    for (var i = 0; i < javaArrayLike.length; i++) {
      list.push(javaArrayLike[i]);
    }
    return list;
  } catch (_ignoreArrayLength) {}
  try {
    var iterator = javaArrayLike.iterator();
    while (iterator.hasNext()) {
      list.push(iterator.next());
    }
  } catch (_ignoreIterator) {}
  return list;
};

C8O.dbo._hasNotSetSentinel = function (ionProperty) {
  var values = [];
  try {
    values = C8O.dbo._toJsArray(ionProperty.getValues());
  } catch (_ignoreValues) {
    values = [];
  }
  for (var i = 0; i < values.length; i++) {
    var value = values[i];
    try {
      if (value === false || java.lang.Boolean.FALSE.equals(value)) {
        return true;
      }
    } catch (_ignoreBooleanFalse) {
      if (value === false) {
        return true;
      }
    }
  }
  return false;
};

C8O.dbo._getDynamicPropertyContext = function (dbo) {
  var ionBean = null;
  try {
    if (dbo && typeof dbo.getIonBean === "function") {
      ionBean = dbo.getIonBean();
    }
  } catch (_ignoreGetIonBean) {
    ionBean = null;
  }
  if (!ionBean) {
    return null;
  }

  var byLookup = {};
  var byName = {};
  var properties = null;
  try {
    properties = ionBean.getProperties();
  } catch (_ignoreGetProperties) {
    properties = null;
  }
  if (!properties) {
    return { ionBean: ionBean, byLookup: byLookup, byName: byName };
  }

  try {
    var iterator = properties.values().iterator();
    while (iterator.hasNext()) {
      var ionProperty = iterator.next();
      if (!ionProperty) {
        continue;
      }
      try {
        if (ionProperty.isHidden() === true) {
          continue;
        }
      } catch (_ignoreIsHidden) {}

      var dynamicName = "";
      try {
        dynamicName = String(ionProperty.getName() || "");
      } catch (_ignorePropertyName) {
        dynamicName = "";
      }
      dynamicName = C8O.util.toTrimmedString(dynamicName);
      if (!dynamicName.length) {
        continue;
      }

      var dynamicLabel = dynamicName;
      try {
        dynamicLabel = String(ionProperty.getLabel() || dynamicName);
      } catch (_ignorePropertyLabel) {
        dynamicLabel = dynamicName;
      }
      dynamicLabel = C8O.util.toTrimmedString(dynamicLabel);

      var meta = {
        name: dynamicName,
        label: dynamicLabel,
        hasNotSetSentinel: C8O.dbo._hasNotSetSentinel(ionProperty)
      };
      byName[dynamicName] = meta;
      byLookup[dynamicName.toLowerCase()] = dynamicName;
      if (dynamicLabel.length) {
        byLookup[dynamicLabel.toLowerCase()] = dynamicName;
      }
    }
  } catch (_ignoreDynamicIterator) {}

  return { ionBean: ionBean, byLookup: byLookup, byName: byName };
};

C8O.dbo._prepareDynamicPropertyValue = function (rawSpec, dynamicMeta) {
  var MobileSmartSourceType = Packages.com.twinsoft.convertigo.beans.ngx.components.MobileSmartSourceType;
  var effectiveSpec = rawSpec;
  if (typeof effectiveSpec === "string") {
    var trimmed = C8O.util.toTrimmedString(effectiveSpec);
    if (dynamicMeta && dynamicMeta.hasNotSetSentinel && trimmed.toLowerCase() === "not set") {
      effectiveSpec = false;
    }
  }
  var applyNull = (effectiveSpec === null || effectiveSpec === undefined || (effectiveSpec && effectiveSpec.__isNull === true));
  if (applyNull) {
    if (dynamicMeta && dynamicMeta.hasNotSetSentinel) {
      return C8O.dbo._buildMobileSmartSourceType(false);
    }
    return null;
  }
  if (effectiveSpec instanceof MobileSmartSourceType) {
    return effectiveSpec;
  }
  if (typeof effectiveSpec === "string") {
    return new MobileSmartSourceType(effectiveSpec);
  }
  return C8O.dbo._buildMobileSmartSourceType(effectiveSpec);
};

C8O.dbo._isNotSetSentinelValue = function (value) {
  if (value === false || value === "false") {
    return true;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  var modeToken = "";
  if (value.mode !== undefined && value.mode !== null) {
    modeToken = String(value.mode);
  } else if (value.type !== undefined && value.type !== null) {
    modeToken = String(value.type);
  }
  modeToken = C8O.util.toTrimmedString ? C8O.util.toTrimmedString(modeToken).toLowerCase() : String(modeToken || "").toLowerCase();

  var rawValue = null;
  if (Object.prototype.hasOwnProperty.call(value, "value")) {
    rawValue = value.value;
  } else if (Object.prototype.hasOwnProperty.call(value, "smartValue")) {
    rawValue = value.smartValue;
  } else if (Object.prototype.hasOwnProperty.call(value, "expression")) {
    rawValue = value.expression;
  }

  if (rawValue === false) {
    return true;
  }
  if (typeof rawValue === "string" && rawValue.toLowerCase() === "false") {
    return modeToken.length === 0 || modeToken === "plain";
  }
  return false;
};

C8O.dbo._isClass = function (className, value) {
  if (value === null || value === undefined) {
    return false;
  }
  try {
    var cls = Packages.java.lang.Class.forName(className);
    return cls.isInstance(value);
  } catch (_ignore) {
    return false;
  }
};

C8O.dbo._isValueAssignableToType = function (propertyType, value) {
  if (value === null || value === undefined || propertyType == null) {
    return true;
  }
  try {
    return propertyType.isInstance(value);
  } catch (_ignoreAssignable) {
    try {
      var typeName = propertyType.getName ? String(propertyType.getName()) : "";
      var valueName = value.getClass ? String(value.getClass().getName()) : "";
      return typeName.length > 0 && typeName === valueName;
    } catch (_ignoreAssignableName) {
      return false;
    }
  }
};

C8O.dbo._parseJsonLike = function (value) {
  if (value == null) {
    return null;
  }
  if (typeof value === "object") {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  var text = String(value).trim();
  if (!text.length) {
    return null;
  }
  // Accept common wrapped forms:
  // - YAML single-quoted payloads: '{...}'
  // - JSON string payloads: "{\"ionBean\":\"ToastAction\"}"
  // - nested JSON string wrappers (double encoding)
  for (var i = 0; i < 4; i++) {
    if (!text.length) {
      return null;
    }

    if (text.length >= 2 && text.charAt(0) === "'" && text.charAt(text.length - 1) === "'") {
      text = text.substring(1, text.length - 1).replace(/''/g, "'").trim();
      continue;
    }

    var first = text.charAt(0);
    if (first === "{" || first === "[") {
      try {
        var parsedJson = JSON.parse(text);
        if (typeof parsedJson === "string") {
          text = String(parsedJson).trim();
          continue;
        }
        return parsedJson && typeof parsedJson === "object" ? parsedJson : null;
      } catch (_ignoreParseJsonLike) {
        return null;
      }
    }

    if (first === "\"") {
      try {
        var unwrapped = JSON.parse(text);
        if (typeof unwrapped === "string") {
          text = String(unwrapped).trim();
          continue;
        }
        return unwrapped && typeof unwrapped === "object" ? unwrapped : null;
      } catch (_ignoreParseJsonString) {
        return null;
      }
    }

    return null;
  }
  return null;
};

C8O.dbo._normalizeIonPropertyToken = function (token) {
  var mode = "plain";
  var value = token;
  if (token == null) {
    return { mode: mode, value: null };
  }
  if (typeof token === "string") {
    var m = token.match(/^([A-Za-z][A-Za-z0-9_-]*):(.*)$/);
    if (m) {
      var candidateMode = String(m[1] || "").toLowerCase();
      if (candidateMode === "plain" || candidateMode === "script" || candidateMode === "source") {
        mode = candidateMode;
        value = m[2];
      }
    }
    return { mode: mode, value: value };
  }
  if (typeof token === "object") {
    if (token.mode !== undefined && token.value !== undefined) {
      return {
        mode: String(token.mode || "plain").toLowerCase() || "plain",
        value: token.value
      };
    }
    return { mode: mode, value: token };
  }
  return { mode: mode, value: token };
};

C8O.dbo._canonicalizeNgxBeanDataValue = function (rawSpec) {
  var parsed = C8O.dbo._parseJsonLike(rawSpec);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return rawSpec;
  }

  var beanName = "";
  if (parsed.ionBean != null) {
    beanName = String(parsed.ionBean);
  } else if (parsed.name != null) {
    beanName = String(parsed.name);
  }
  if (!beanName.length) {
    return rawSpec;
  }

  var normalized = {
    name: beanName,
    properties: {}
  };

  if (parsed.properties && typeof parsed.properties === "object" && !Array.isArray(parsed.properties)) {
    var propertyNames = Object.keys(parsed.properties);
    for (var i = 0; i < propertyNames.length; i++) {
      var pName = propertyNames[i];
      var token = C8O.dbo._normalizeIonPropertyToken(parsed.properties[pName]);
      normalized.properties[pName] = {
        name: pName,
        mode: token.mode,
        value: token.value
      };
    }
  }

  var keys = Object.keys(parsed);
  for (var j = 0; j < keys.length; j++) {
    var key = keys[j];
    if (key === "ionBean" || key === "name" || key === "properties") {
      continue;
    }
    var propertyToken = C8O.dbo._normalizeIonPropertyToken(parsed[key]);
    normalized.properties[key] = {
      name: key,
      mode: propertyToken.mode,
      value: propertyToken.value
    };
  }

  try {
    return JSON.stringify(normalized);
  } catch (_ignoreStringifyBeanData) {
    return rawSpec;
  }
};

C8O.dbo._isDynamicBeanObject = function (dbo) {
  return (
    C8O.dbo._isClass("com.twinsoft.convertigo.beans.ngx.components.UIDynamicElement", dbo) ||
    C8O.dbo._isClass("com.twinsoft.convertigo.beans.mobile.components.UIDynamicElement", dbo)
  );
};

C8O.dbo._clearDynamicIonBeanCache = function (dbo) {
  if (!dbo || !dbo.getClass) {
    return false;
  }
  var clazz = dbo.getClass();
  while (clazz != null) {
    try {
      var field = clazz.getDeclaredField("ionBean");
      field.setAccessible(true);
      field.set(dbo, null);
      return true;
    } catch (_ignoreField) {}
    try {
      clazz = clazz.getSuperclass();
    } catch (_ignoreSuperclass) {
      clazz = null;
    }
  }
  return false;
};

C8O.dbo._reloadDynamicIonBean = function (dbo) {
  if (!dbo) {
    return false;
  }
  try {
    var ngxCm = Packages.com.twinsoft.convertigo.beans.ngx.components.dynamic.ComponentManager;
    var cm = ngxCm.of(dbo);
    if (cm != null && typeof dbo.loadBean === "function") {
      dbo.loadBean(cm);
      return true;
    }
  } catch (_ignoreNgxReload) {}
  try {
    var mobileCm = Packages.com.twinsoft.convertigo.beans.mobile.components.dynamic.ComponentManager;
    var mobile = mobileCm.of(dbo);
    if (mobile != null && typeof dbo.loadBean === "function") {
      dbo.loadBean(mobile);
      return true;
    }
  } catch (_ignoreMobileReload) {}
  return false;
};

C8O.dbo._syncDynamicBeanCacheAfterBeanData = function (dbo) {
  if (!C8O.dbo._isDynamicBeanObject(dbo)) {
    return;
  }
  C8O.dbo._clearDynamicIonBeanCache(dbo);
  C8O.dbo._reloadDynamicIonBean(dbo);
};

C8O.dbo._expandDynamicBeanDataDefaults = function (dbo, beanDataValue) {
  if (!C8O.dbo._isDynamicBeanObject(dbo)) {
    return beanDataValue;
  }
  if (typeof beanDataValue !== "string") {
    return beanDataValue;
  }
  var parsed = C8O.dbo._parseJsonLike(beanDataValue);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return beanDataValue;
  }
  if (!parsed.name && !parsed.ionBean) {
    return beanDataValue;
  }

  var source = beanDataValue;
  try {
    var ngxCm = Packages.com.twinsoft.convertigo.beans.ngx.components.dynamic.ComponentManager;
    var cm = ngxCm.of(dbo);
    if (cm != null) {
      var ionBean = cm.loadBean(source);
      if (ionBean != null && typeof ionBean.toBeanData === "function") {
        return String(ionBean.toBeanData());
      }
    }
  } catch (_ignoreExpandNgx) {}

  try {
    var mobileCm = Packages.com.twinsoft.convertigo.beans.mobile.components.dynamic.ComponentManager;
    var mobile = mobileCm.of(dbo);
    if (mobile != null) {
      var mBean = mobile.loadBean(source);
      if (mBean != null && typeof mBean.toBeanData === "function") {
        return String(mBean.toBeanData());
      }
    }
  } catch (_ignoreExpandMobile) {}

  return beanDataValue;
};

C8O.dbo._isSmartTypeClass = function (propertyType) {
  if (propertyType == null) {
    return false;
  }
  try {
    var smartClass = Packages.java.lang.Class.forName('com.twinsoft.convertigo.beans.steps.SmartType');
    return smartClass.isAssignableFrom(propertyType);
  } catch (_ignoreSmart) {
    try {
      var className = propertyType.getName ? String(propertyType.getName()) : String(propertyType);
      return className === 'com.twinsoft.convertigo.beans.steps.SmartType';
    } catch (_ignoreName) {
      return false;
    }
  }
};

C8O.dbo._isXMLVectorClass = function (propertyType) {
  if (propertyType == null) {
    return false;
  }
  try {
    var vectorClass = Packages.java.lang.Class.forName('com.twinsoft.convertigo.beans.common.XMLVector');
    return vectorClass.isAssignableFrom(propertyType);
  } catch (_ignoreVector) {
    try {
      var className = propertyType.getName ? String(propertyType.getName()) : String(propertyType);
      return className === 'com.twinsoft.convertigo.beans.common.XMLVector';
    } catch (_ignoreName) {
      return false;
    }
  }
};

C8O.dbo._isFormatedContentClass = function (propertyType) {
  if (propertyType == null) {
    return false;
  }
  try {
    var contentClass = Packages.java.lang.Class.forName('com.twinsoft.convertigo.beans.common.FormatedContent');
    return contentClass.isAssignableFrom(propertyType);
  } catch (_ignoreContent) {
    try {
      var className = propertyType.getName ? String(propertyType.getName()) : String(propertyType);
      return className === 'com.twinsoft.convertigo.beans.common.FormatedContent';
    } catch (_ignoreName) {
      return false;
    }
  }
};

C8O.dbo._isMobileSmartSourceTypeClass = function (propertyType) {
  if (propertyType == null) {
    return false;
  }
  try {
    var mobileSmartSourceTypeClass = Packages.java.lang.Class.forName("com.twinsoft.convertigo.beans.ngx.components.MobileSmartSourceType");
    return mobileSmartSourceTypeClass.isAssignableFrom(propertyType);
  } catch (_ignoreMobileSmartSourceType) {
    try {
      var className = propertyType.getName ? String(propertyType.getName()) : String(propertyType);
      return className === "com.twinsoft.convertigo.beans.ngx.components.MobileSmartSourceType";
    } catch (_ignoreMobileSmartSourceTypeName) {
      return false;
    }
  }
};

C8O.dbo._isXmlQNameClass = function (propertyType) {
  if (propertyType == null) {
    return false;
  }
  try {
    var xmlQNameClass = Packages.java.lang.Class.forName("com.twinsoft.convertigo.beans.common.XmlQName");
    return xmlQNameClass.isAssignableFrom(propertyType);
  } catch (_ignoreXmlQName) {
    try {
      var className = propertyType.getName ? String(propertyType.getName()) : String(propertyType);
      return className === "com.twinsoft.convertigo.beans.common.XmlQName";
    } catch (_ignoreXmlQNameName) {
      return false;
    }
  }
};

C8O.dbo._isXMLRectangleClass = function (propertyType) {
  if (propertyType == null) {
    return false;
  }
  try {
    var xmlRectangleClass = Packages.java.lang.Class.forName("com.twinsoft.convertigo.beans.common.XMLRectangle");
    return xmlRectangleClass.isAssignableFrom(propertyType);
  } catch (_ignoreXmlRectangle) {
    try {
      var className = propertyType.getName ? String(propertyType.getName()) : String(propertyType);
      return className === "com.twinsoft.convertigo.beans.common.XMLRectangle";
    } catch (_ignoreXmlRectangleName) {
      return false;
    }
  }
};

C8O.dbo._isFontSourceClass = function (propertyType) {
  if (propertyType == null) {
    return false;
  }
  try {
    var fontSourceClass = Packages.java.lang.Class.forName("com.twinsoft.convertigo.beans.common.FontSource");
    return fontSourceClass.isAssignableFrom(propertyType);
  } catch (_ignoreFontSource) {
    try {
      var className = propertyType.getName ? String(propertyType.getName()) : String(propertyType);
      return className === "com.twinsoft.convertigo.beans.common.FontSource";
    } catch (_ignoreFontSourceName) {
      return false;
    }
  }
};

C8O.dbo._normalizeMobileSmartSourceType = function (mobileSmartValue) {
  var normalized = {
    mode: "PLAIN",
    value: ""
  };
  if (mobileSmartValue === null || mobileSmartValue === undefined) {
    return normalized;
  }

  try {
    if (mobileSmartValue.getMode) {
      var mode = mobileSmartValue.getMode();
      if (mode !== null && mode !== undefined) {
        if (mode.name) {
          normalized.mode = String(mode.name());
        } else {
          normalized.mode = String(mode);
        }
      }
    }
  } catch (_ignoreMobileSmartMode) {}

  try {
    if (mobileSmartValue.getSmartValue) {
      normalized.value = String(mobileSmartValue.getSmartValue());
      return normalized;
    }
  } catch (_ignoreMobileSmartValue) {}

  try {
    normalized.value = String(mobileSmartValue);
  } catch (_ignoreMobileSmartToString) {
    normalized.value = "";
  }
  return normalized;
};

C8O.dbo._normalizeSmartType = function (smartType) {
  var result = {
    mode: String(smartType.getMode())
  };
  var SmartTypeMode = Packages.com.twinsoft.convertigo.beans.steps.SmartType.Mode;
  var mode = smartType.getMode();
  if (mode === SmartTypeMode.SOURCE) {
    var XMLVector = Packages.com.twinsoft.convertigo.beans.common.XMLVector;
    var sources = smartType.getSourceDefinition();
    var list = [];
    if (sources instanceof XMLVector) {
      for (var i = 0; i < sources.size(); i++) {
        list.push(String(sources.get(i)));
      }
    }
    result.sources = list;
  } else {
    result.expression = smartType.getExpression();
  }
  return result;
};

C8O.dbo._normalizeXMLVector = function (xmlVector) {
  var XMLVector = Packages.com.twinsoft.convertigo.beans.common.XMLVector;
  if (!(xmlVector instanceof XMLVector)) {
    return null;
  }
  var list = [];
  for (var i = 0; i < xmlVector.size(); i++) {
    list.push(String(xmlVector.get(i)));
  }
  return list;
};

C8O.dbo.normalizeValue = function (pd, value) {
  var NativeJavaObject = Packages.org.mozilla.javascript.NativeJavaObject;
  if (value instanceof NativeJavaObject) {
    value = value.unwrap();
  }
  if (value === null || value === undefined) {
    return null;
  }

  var propertyType = pd != null ? pd.getPropertyType() : null;
  var typeName = propertyType != null ? propertyType.getName() : (value.getClass ? value.getClass().getName() : typeof value);

  if (C8O.dbo._isMobileSmartSourceTypeClass(propertyType) ||
      C8O.dbo._isClass("com.twinsoft.convertigo.beans.ngx.components.MobileSmartSourceType", value) ||
      (value != null && value.getClass && String(value.getClass().getName()) === "com.twinsoft.convertigo.beans.ngx.components.MobileSmartSourceType")) {
    return C8O.dbo._normalizeMobileSmartSourceType(value);
  }

  if (C8O.dbo._isSmartTypeClass(propertyType) || C8O.dbo._isClass('com.twinsoft.convertigo.beans.steps.SmartType', value) || (value != null && value.getClass && String(value.getClass().getName()) === 'com.twinsoft.convertigo.beans.steps.SmartType')) {
    return C8O.dbo._normalizeSmartType(value);
  }

  if (C8O.dbo._isXMLVectorClass(propertyType) || C8O.dbo._isClass('com.twinsoft.convertigo.beans.common.XMLVector', value) || (value != null && value.getClass && String(value.getClass().getName()) === 'com.twinsoft.convertigo.beans.common.XMLVector')) {
    return C8O.dbo._normalizeXMLVector(value);
  }

  if (C8O.dbo._isFormatedContentClass(propertyType) || C8O.dbo._isClass('com.twinsoft.convertigo.beans.common.FormatedContent', value) || (value != null && value.getClass && String(value.getClass().getName()) === 'com.twinsoft.convertigo.beans.common.FormatedContent')) {
    try {
      return String(value.getString ? value.getString() : value);
    } catch (_ignoreContentString) {
      return String(value);
    }
  }

  if (value instanceof Packages.java.lang.Number) {
    return Number(value);
  }

  if (typeof value === 'number') {
    return value;
  }

  if (value instanceof Packages.java.lang.Boolean) {
    return Boolean(value.booleanValue());
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Packages.java.lang.Enum) {
    return String(value.name());
  }

  if (typeName === 'java.lang.String' || typeof value === 'string') {
    return String(value);
  }

  if (C8O.dbo._isClass('java.lang.CharSequence', value)) {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.slice();
  }

  if (value instanceof Packages.java.util.List) {
    var list = [];
    var iterator = value.iterator();
    while (iterator.hasNext()) {
      list.push(String(iterator.next()));
    }
    return list;
  }

  if (value != null && value.toString) {
    return String(value);
  }
  return null;
};

C8O.dbo._buildXMLVector = function (items) {
  var XMLVector = Packages.com.twinsoft.convertigo.beans.common.XMLVector;
  var vector = new XMLVector();
  if (Array.isArray(items)) {
    for (var i = 0; i < items.length; i++) {
      vector.add(String(items[i]));
    }
  }
  return vector;
};

C8O.dbo._extractFormatedContentString = function (spec) {
  if (spec === null || spec === undefined) {
    return "";
  }

  if (typeof spec === "string") {
    var trimmed = spec.trim();
    if (trimmed.length && (trimmed.charAt(0) === '"' || trimmed.charAt(0) === "{" || trimmed.charAt(0) === "[")) {
      try {
        var parsed = JSON.parse(trimmed);
        if (parsed !== spec) {
          return C8O.dbo._extractFormatedContentString(parsed);
        }
      } catch (_ignoreParseContent) {}
    }
    return spec;
  }

  if (typeof spec === "number" || typeof spec === "boolean") {
    return String(spec);
  }

  if (C8O.dbo._isClass('com.twinsoft.convertigo.beans.common.FormatedContent', spec)) {
    try {
      return String(spec.getString());
    } catch (_ignoreContentClass) {
      return String(spec);
    }
  }

  if (typeof spec === "object") {
    if (spec.root && spec.data !== undefined) {
      return C8O.dbo._extractFormatedContentString(spec.data);
    }
    if (spec["→"] !== undefined) {
      return String(spec["→"]);
    }
    if (spec.content !== undefined) {
      return String(spec.content);
    }
    if (spec.value !== undefined) {
      return String(spec.value);
    }
    if (spec.text !== undefined) {
      return String(spec.text);
    }
    if (spec.expression !== undefined) {
      return String(spec.expression);
    }
    if (spec.data !== undefined) {
      return C8O.dbo._extractFormatedContentString(spec.data);
    }
    var classKey = "com.twinsoft.convertigo.beans.common.FormatedContent";
    if (spec[classKey] !== undefined) {
      return C8O.dbo._extractFormatedContentString(spec[classKey]);
    }
    if (spec.xmlizable && Array.isArray(spec.xmlizable)) {
      for (var i = 0; i < spec.xmlizable.length; i++) {
        var entry = spec.xmlizable[i];
        if (entry && typeof entry === "object") {
          if (entry[classKey] !== undefined) {
            return C8O.dbo._extractFormatedContentString(entry[classKey]);
          }
          if (entry["→"] !== undefined) {
            return String(entry["→"]);
          }
        }
      }
    }
    try {
      return JSON.stringify(spec);
    } catch (_ignoreStringifyContent) {
      return String(spec);
    }
  }

  return String(spec);
};

C8O.dbo._buildFormatedContent = function (spec) {
  var FormatedContent = Packages.com.twinsoft.convertigo.beans.common.FormatedContent;
  if (spec instanceof FormatedContent) {
    return spec;
  }
  return new FormatedContent(C8O.dbo._extractFormatedContentString(spec));
};

C8O.dbo._extractFontSourceString = function (spec) {
  if (spec === null || spec === undefined) {
    return "{}";
  }

  if (typeof spec === "string") {
    return spec;
  }

  if (typeof spec === "number" || typeof spec === "boolean") {
    return String(spec);
  }

  if (C8O.dbo._isClass('com.twinsoft.convertigo.beans.common.FontSource', spec)) {
    try {
      return String(spec.getString());
    } catch (_ignoreFontSourceClass) {
      return String(spec);
    }
  }

  if (typeof spec === "object") {
    if (spec.root && spec.data !== undefined) {
      return C8O.dbo._extractFontSourceString(spec.data);
    }
    if (spec.__kind__ === "FontSource") {
      if (spec.raw != null) {
        return String(spec.raw);
      }
      if (spec.data != null) {
        return C8O.dbo._extractFontSourceString(spec.data);
      }
    }
    if (spec.content !== undefined) {
      return String(spec.content);
    }
    if (spec.value !== undefined) {
      return String(spec.value);
    }
    if (spec.text !== undefined) {
      return String(spec.text);
    }
    if (spec.expression !== undefined) {
      return String(spec.expression);
    }
    if (spec["→"] !== undefined) {
      return String(spec["→"]);
    }
    if (
      spec.fontId !== undefined ||
      spec.fontFamily !== undefined ||
      spec.fontWeight !== undefined ||
      spec.fontStyle !== undefined ||
      spec.fontSubset !== undefined
    ) {
      var jsonFont = {};
      if (spec.fontId != null && String(spec.fontId).length) {
        jsonFont.fontId = String(spec.fontId);
      }
      if (spec.fontFamily != null && String(spec.fontFamily).length) {
        jsonFont.fontFamily = String(spec.fontFamily);
      }
      if (spec.fontWeight != null && String(spec.fontWeight).length) {
        jsonFont.fontWeight = String(spec.fontWeight);
      }
      if (spec.fontStyle != null && String(spec.fontStyle).length) {
        jsonFont.fontStyle = String(spec.fontStyle);
      }
      if (spec.fontSubset != null && String(spec.fontSubset).length) {
        jsonFont.fontSubset = String(spec.fontSubset);
      }
      return JSON.stringify(jsonFont);
    }
    if (spec.data !== undefined) {
      return C8O.dbo._extractFontSourceString(spec.data);
    }
    var classKey = "com.twinsoft.convertigo.beans.common.FontSource";
    if (spec[classKey] !== undefined) {
      return C8O.dbo._extractFontSourceString(spec[classKey]);
    }
    if (spec.xmlizable && Array.isArray(spec.xmlizable)) {
      for (var i = 0; i < spec.xmlizable.length; i++) {
        var entry = spec.xmlizable[i];
        if (entry && typeof entry === "object") {
          if (entry[classKey] !== undefined) {
            return C8O.dbo._extractFontSourceString(entry[classKey]);
          }
          if (entry["→"] !== undefined) {
            return String(entry["→"]);
          }
        }
      }
    }
    try {
      return JSON.stringify(spec);
    } catch (_ignoreStringifyFontSource) {
      return String(spec);
    }
  }

  return String(spec);
};

C8O.dbo._buildFontSource = function (spec) {
  var FontSource = Packages.com.twinsoft.convertigo.beans.common.FontSource;
  if (spec instanceof FontSource) {
    return spec;
  }
  var content = C8O.dbo._extractFontSourceString(spec);
  if (content == null || String(content).trim().length === 0) {
    content = "{}";
  }
  var font = new FontSource();
  font.setString(String(content));
  return font;
};

C8O.dbo._extractXmlQNameParts = function (spec) {
  var result = { localPart: "", namespace: "" };
  var assign = function (obj) {
    if (!obj || typeof obj !== "object") {
      return false;
    }

    if (obj.root && obj.data !== undefined) {
      return assign(obj.data);
    }
    if (obj.data !== undefined) {
      if (assign(obj.data)) {
        return true;
      }
    }

    if (obj.__kind__ === "XmlQName") {
      if (obj.localPart != null) {
        result.localPart = String(obj.localPart);
      }
      if (obj.namespace != null) {
        result.namespace = String(obj.namespace);
      }
      return true;
    }

    if (obj.localPart != null || obj.namespace != null) {
      if (obj.localPart != null) {
        result.localPart = String(obj.localPart);
      }
      if (obj.namespace != null) {
        result.namespace = String(obj.namespace);
      }
      return true;
    }
    if (obj.pLocalPart != null || obj.pNamespace != null) {
      if (obj.pLocalPart != null) {
        result.localPart = String(obj.pLocalPart);
      }
      if (obj.pNamespace != null) {
        result.namespace = String(obj.pNamespace);
      }
      return true;
    }
    if (obj["↑pLocalPart"] != null || obj["↑pNamespace"] != null) {
      if (obj["↑pLocalPart"] != null) {
        result.localPart = String(obj["↑pLocalPart"]);
      }
      if (obj["↑pNamespace"] != null) {
        result.namespace = String(obj["↑pNamespace"]);
      }
      return true;
    }

    if (obj.schemaDefinition !== undefined) {
      if (assign(obj.schemaDefinition)) {
        return true;
      }
    }
    if (obj["com.twinsoft.convertigo.beans.common.XmlQName"] !== undefined) {
      if (assign(obj["com.twinsoft.convertigo.beans.common.XmlQName"])) {
        return true;
      }
    }
    if (obj.xmlizable && Array.isArray(obj.xmlizable)) {
      for (var i = 0; i < obj.xmlizable.length; i++) {
        if (assign(obj.xmlizable[i])) {
          return true;
        }
      }
    }
    if (Array.isArray(obj)) {
      for (var j = 0; j < obj.length; j++) {
        if (assign(obj[j])) {
          return true;
        }
      }
    }
    return false;
  };

  if (spec == null) {
    return result;
  }
  if (typeof spec === "string") {
    var text = String(spec).trim();
    if (text.length && (text.charAt(0) === "{" || text.charAt(0) === "[" || text.charAt(0) === '"')) {
      try {
        var parsed = JSON.parse(text);
        if (assign(parsed)) {
          return result;
        }
      } catch (_ignoreJsonQName) {}
    }
    var stdMatch = text.match(/^\{([^}]*)\}(.*)$/);
    if (stdMatch) {
      result.namespace = stdMatch[1];
      result.localPart = stdMatch[2];
      return result;
    }
    var compactMatch = text.match(/^(.*)\{([^}]*)\}$/);
    if (compactMatch) {
      result.localPart = compactMatch[1];
      result.namespace = compactMatch[2];
      return result;
    }
    result.localPart = text;
    return result;
  }
  assign(spec);
  return result;
};

C8O.dbo._buildXmlQName = function (spec) {
  var XmlQName = Packages.com.twinsoft.convertigo.beans.common.XmlQName;
  if (spec instanceof XmlQName) {
    return spec;
  }
  if (spec && typeof spec === "object" && spec.root && spec.data !== undefined) {
    try {
      return C8O.xml.deserialize(spec);
    } catch (_ignoreDeserializeQName) {}
  }
  var parts = C8O.dbo._extractXmlQNameParts(spec);
  var namespace = parts.namespace != null ? String(parts.namespace) : "";
  var localPart = parts.localPart != null ? String(parts.localPart) : "";
  var QName = Packages.javax.xml.namespace.QName;
  return new XmlQName(new QName(namespace, localPart));
};

C8O.dbo._extractRectangleInteger = function (token) {
  if (token === null || token === undefined) {
    return null;
  }
  if (typeof token === "number") {
    return Math.trunc(token);
  }
  if (typeof token === "boolean") {
    return null;
  }
  if (typeof token === "string") {
    var text = token.trim();
    if (!text.length) {
      return null;
    }
    var direct = parseInt(text, 10);
    if (!isNaN(direct)) {
      return direct;
    }
    var m = text.match(/^\[x=(-?\d+),\s*y=(-?\d+),\s*width=(-?\d+),\s*height=(-?\d+)\]$/);
    if (m) {
      return parseInt(m[1], 10);
    }
    if (text.charAt(0) === "{" || text.charAt(0) === "[") {
      try {
        return C8O.dbo._extractRectangleInteger(JSON.parse(text));
      } catch (_ignoreJsonRectToken) {}
    }
    return null;
  }
  if (Array.isArray(token)) {
    for (var i = 0; i < token.length; i++) {
      var fromArray = C8O.dbo._extractRectangleInteger(token[i]);
      if (fromArray != null) {
        return fromArray;
      }
    }
    return null;
  }
  if (typeof token === "object") {
    if (token.value !== undefined) {
      var fromValue = C8O.dbo._extractRectangleInteger(token.value);
      if (fromValue != null) {
        return fromValue;
      }
    }
    if (token["↑value"] !== undefined) {
      var fromAttrValue = C8O.dbo._extractRectangleInteger(token["↑value"]);
      if (fromAttrValue != null) {
        return fromAttrValue;
      }
    }
    if (token["java.lang.Integer"] !== undefined) {
      var fromJavaInteger = C8O.dbo._extractRectangleInteger(token["java.lang.Integer"]);
      if (fromJavaInteger != null) {
        return fromJavaInteger;
      }
    }
    for (var key in token) {
      if (!Object.prototype.hasOwnProperty.call(token, key)) {
        continue;
      }
      var nested = C8O.dbo._extractRectangleInteger(token[key]);
      if (nested != null) {
        return nested;
      }
    }
  }
  return null;
};

C8O.dbo._extractXMLRectangle = function (spec) {
  var result = { x: null, y: null, width: null, height: null };
  var assignFromObject = function (obj) {
    if (!obj || typeof obj !== "object") {
      return;
    }
    if (obj.root && obj.data !== undefined) {
      assignFromObject(obj.data);
      return;
    }
    if (obj.data !== undefined) {
      assignFromObject(obj.data);
    }
    if (obj.__kind__ === "XMLRectangle") {
      if (obj.x !== undefined) {
        result.x = C8O.dbo._extractRectangleInteger(obj.x);
      }
      if (obj.y !== undefined) {
        result.y = C8O.dbo._extractRectangleInteger(obj.y);
      }
      if (obj.width !== undefined) {
        result.width = C8O.dbo._extractRectangleInteger(obj.width);
      }
      if (obj.height !== undefined) {
        result.height = C8O.dbo._extractRectangleInteger(obj.height);
      }
      return;
    }
    if (obj.x !== undefined) {
      result.x = C8O.dbo._extractRectangleInteger(obj.x);
    }
    if (obj.y !== undefined) {
      result.y = C8O.dbo._extractRectangleInteger(obj.y);
    }
    if (obj.width !== undefined) {
      result.width = C8O.dbo._extractRectangleInteger(obj.width);
    }
    if (obj.height !== undefined) {
      result.height = C8O.dbo._extractRectangleInteger(obj.height);
    }
    if (obj["com.twinsoft.convertigo.beans.common.XMLRectangle"] !== undefined) {
      assignFromObject(obj["com.twinsoft.convertigo.beans.common.XMLRectangle"]);
    }
    if (obj.xmlizable && Array.isArray(obj.xmlizable)) {
      for (var i = 0; i < obj.xmlizable.length; i++) {
        assignFromObject(obj.xmlizable[i]);
      }
    }
    if (Array.isArray(obj)) {
      for (var j = 0; j < obj.length; j++) {
        assignFromObject(obj[j]);
      }
    }
  };

  if (spec == null) {
    return result;
  }
  if (typeof spec === "string") {
    var text = String(spec).trim();
    var m = text.match(/^\[x=(-?\d+),\s*y=(-?\d+),\s*width=(-?\d+),\s*height=(-?\d+)\]$/);
    if (m) {
      result.x = parseInt(m[1], 10);
      result.y = parseInt(m[2], 10);
      result.width = parseInt(m[3], 10);
      result.height = parseInt(m[4], 10);
      return result;
    }
    if (text.length && (text.charAt(0) === "{" || text.charAt(0) === "[")) {
      try {
        assignFromObject(JSON.parse(text));
      } catch (_ignoreJsonRect) {}
      return result;
    }
    return result;
  }

  assignFromObject(spec);
  return result;
};

C8O.dbo._buildXMLRectangle = function (spec) {
  var XMLRectangle = Packages.com.twinsoft.convertigo.beans.common.XMLRectangle;
  if (spec instanceof XMLRectangle) {
    return spec;
  }
  if (spec && typeof spec === "object" && spec.root && spec.data !== undefined) {
    try {
      return C8O.xml.deserialize(spec);
    } catch (_ignoreDeserializeRect) {}
  }
  var values = C8O.dbo._extractXMLRectangle(spec);
  var x = values.x != null ? values.x : 0;
  var y = values.y != null ? values.y : 0;
  var width = values.width != null ? values.width : 0;
  var height = values.height != null ? values.height : 0;
  return new XMLRectangle(x, y, width, height);
};

C8O.dbo._buildSmartType = function (spec) {
  var SmartType = Packages.com.twinsoft.convertigo.beans.steps.SmartType;
  var SmartTypeMode = SmartType.Mode;
  if (spec instanceof SmartType) {
    return spec;
  }
  var smart = new SmartType();
  var modeToken = null;
  var expression = null;
  var sources = null;

  if (spec === null || spec === undefined) {
    smart.setMode(SmartTypeMode.PLAIN);
    smart.setExpression("");
    smart.pack();
    return smart;
  }

  if (typeof spec === 'string' || typeof spec === 'number' || typeof spec === 'boolean') {
    expression = String(spec);
  } else if (typeof spec === 'object') {
    if (spec.mode) {
      modeToken = String(spec.mode).toUpperCase();
    }
    if (spec.expression != null) {
      expression = String(spec.expression);
    } else if (spec.value != null) {
      expression = String(spec.value);
    } else if (spec.text != null) {
      expression = String(spec.text);
    }
    if (spec.sources != null) {
      sources = spec.sources;
    } else if (spec.source != null) {
      sources = spec.source;
    }
  }

  var mode = SmartTypeMode.PLAIN;
  if (modeToken) {
    try {
      mode = SmartTypeMode.valueOf(modeToken);
    } catch (_ignoreMode) {
      mode = SmartTypeMode.PLAIN;
    }
  }
  smart.setMode(mode);

  if (mode === SmartTypeMode.SOURCE) {
    smart.setSourceDefinition(C8O.dbo._buildXMLVector(Array.isArray(sources) ? sources : []));
  } else {
    smart.setExpression(expression != null ? expression : '');
  }
  smart.pack();
  return smart;
};

C8O.dbo.applyPropertyUpdates = function (dbo, updates) {
  var NativeJavaObject = Packages.org.mozilla.javascript.NativeJavaObject;
  var MySimpleBeanInfo = Packages.com.twinsoft.convertigo.beans.core.MySimpleBeanInfo;

  var descriptorMap = C8O.dbo._getDescriptorMap(dbo);
  var dynamicContext = C8O.dbo._getDynamicPropertyContext(dbo);
  var applied = [];
  var skipped = [];
  var errors = [];

  if (!updates || typeof updates !== "object") {
    return { applied: applied, skipped: skipped, errors: errors };
  }

  var propertyNames = Object.keys(updates);
  for (var i = 0; i < propertyNames.length; i++) {
    var requestedName = propertyNames[i];
    var requestedLookup = C8O.util.toTrimmedString(requestedName).toLowerCase();
    var rawSpec = updates[requestedName];
    var name = requestedName;
    var pd = descriptorMap[name];
    if (!pd) {
      var candidateNames = Object.keys(descriptorMap);
      for (var c = 0; c < candidateNames.length && !pd; c++) {
        var candidateName = candidateNames[c];
        var candidate = descriptorMap[candidateName];
        if (candidateName.toLowerCase() === requestedLookup) {
          name = candidateName;
          pd = candidate;
          break;
        }
        try {
          var displayName = candidate.getDisplayName ? String(candidate.getDisplayName() || "") : "";
          if (displayName.toLowerCase() === requestedLookup) {
            name = candidateName;
            pd = candidate;
            break;
          }
        } catch (_ignoreDisplayName) {}
      }
    }

    var dynamicMeta = null;
    if (dynamicContext && dynamicContext.byLookup && requestedLookup.length > 0) {
      var dynamicResolvedName = dynamicContext.byLookup[requestedLookup];
      if (dynamicResolvedName) {
        dynamicMeta = dynamicContext.byName[dynamicResolvedName] || { name: dynamicResolvedName, label: dynamicResolvedName, hasNotSetSentinel: false };
      }
    }

    if (!pd && dynamicMeta != null) {
      var previousDynamicValue = null;
      try {
        previousDynamicValue = dynamicContext.ionBean.getPropertyValue(dynamicMeta.name);
        if (previousDynamicValue instanceof NativeJavaObject) {
          previousDynamicValue = previousDynamicValue.unwrap();
        }
      } catch (_ignorePrevDynamic) {}

      try {
        var preparedDynamicValue = C8O.dbo._prepareDynamicPropertyValue(rawSpec, dynamicMeta);
        dynamicContext.ionBean.setPropertyValue(dynamicMeta.name, preparedDynamicValue);
        applied.push({
          name: dynamicMeta.name,
          previousValue: C8O.util.previewValue(previousDynamicValue),
          newValue: C8O.util.previewValue(rawSpec)
        });
      } catch (applyDynamicError) {
        errors.push({ name: dynamicMeta.name, message: String(applyDynamicError) });
      }
      continue;
    }

    if (!pd) {
      skipped.push({ name: requestedName, reason: "Unknown property" });
      continue;
    }

    if (dynamicContext && C8O.util.toTrimmedString(name).toLowerCase() === "beandata") {
      skipped.push({ name: name, reason: "Internal property" });
      continue;
    }

    var setter = pd.getWriteMethod();
    if (setter == null) {
      skipped.push({ name: name, reason: "Read-only property" });
      continue;
    }

    var getter = pd.getReadMethod();
    var previousValue = null;
    if (getter != null) {
      try {
        previousValue = getter.invoke(dbo, null);
        if (previousValue instanceof NativeJavaObject) {
          previousValue = previousValue.unwrap();
        }
      } catch (_ignorePrev) {}
    }

    var rawSpec = updates[requestedName];
    if (name === "beanData" && C8O.dbo._isDynamicBeanObject(dbo)) {
      rawSpec = C8O.dbo._canonicalizeNgxBeanDataValue(rawSpec);
      rawSpec = C8O.dbo._expandDynamicBeanDataDefaults(dbo, rawSpec);
    }
    var applyNull = (rawSpec === null || rawSpec === undefined || (rawSpec && rawSpec.__isNull === true));
    var propertyType = pd.getPropertyType();

    try {
      if (applyNull) {
        setter.invoke(dbo, [null]);
        if (name === "beanData") {
          C8O.dbo._clearDynamicIonBeanCache(dbo);
        }
        if (java.lang.Boolean.TRUE.equals(pd.getValue(MySimpleBeanInfo.NILLABLE))) {
          try {
            var setNull = dbo.getClass().getMethod("setNullProperty", [java.lang.String.class, java.lang.Boolean.class]);
            setNull.invoke(dbo, [name, java.lang.Boolean.TRUE]);
          } catch (_ignoreNull) {}
        }
        applied.push({
          name: name,
          previousValue: C8O.util.previewValue(previousValue),
          newValue: null
        });
        continue;
      }

      var preparedValue = C8O.dbo._preparePropertyValue(pd, rawSpec);
      var compiledValue = dbo.compileProperty(propertyType, name, preparedValue);
      if (compiledValue instanceof NativeJavaObject) {
        compiledValue = compiledValue.unwrap();
      }
      if (C8O.dbo._isXMLizableClass(propertyType) && preparedValue != null && !C8O.dbo._isValueAssignableToType(propertyType, compiledValue) && C8O.dbo._isValueAssignableToType(propertyType, preparedValue)) {
        compiledValue = preparedValue;
      }
      setter.invoke(dbo, [compiledValue]);
      if (name === "beanData") {
        C8O.dbo._syncDynamicBeanCacheAfterBeanData(dbo);
      }

      if (java.lang.Boolean.TRUE.equals(pd.getValue(MySimpleBeanInfo.NILLABLE))) {
        try {
          var clearNull = dbo.getClass().getMethod("setNullProperty", [java.lang.String.class, java.lang.Boolean.class]);
          clearNull.invoke(dbo, [name, java.lang.Boolean.FALSE]);
        } catch (_ignoreClear) {}
      }

      applied.push({
        name: name,
        previousValue: C8O.util.previewValue(previousValue),
        newValue: C8O.util.previewValue(rawSpec)
      });
    } catch (applyError) {
      errors.push({ name: name, message: String(applyError) });
    }
  }

  return { applied: applied, skipped: skipped, errors: errors };
};

C8O.dbo._preparePropertyValue = function (pd, rawSpec) {
  if (rawSpec === null || rawSpec === undefined) {
    return null;
  }

  var propertyType = pd != null ? pd.getPropertyType() : null;
  var propertyTypeName = propertyType != null ? String(propertyType.getName()) : "";
  if (!propertyTypeName && propertyType != null && propertyType.getClass) {
    try {
      propertyTypeName = String(propertyType.getClass().getName());
    } catch (_ignoreTypeName) {}
  }

  var isNumericProperty =
    propertyTypeName === "byte" ||
    propertyTypeName === "short" ||
    propertyTypeName === "int" ||
    propertyTypeName === "long" ||
    propertyTypeName === "float" ||
    propertyTypeName === "double" ||
    propertyTypeName === "java.lang.Byte" ||
    propertyTypeName === "java.lang.Short" ||
    propertyTypeName === "java.lang.Integer" ||
    propertyTypeName === "java.lang.Long" ||
    propertyTypeName === "java.lang.Float" ||
    propertyTypeName === "java.lang.Double";

  // Rhino numbers are JS doubles. Some Convertigo properties, such as HttpConnector.port,
  // are compiled reliably from string form but can degrade when a raw JS number is passed through.
  if (isNumericProperty && typeof rawSpec === "number" && isFinite(rawSpec)) {
    return String(rawSpec);
  }

  // Allow SmartType / XMLVector values provided as JSON strings (or any stringified JSON).
  if (typeof rawSpec === "string") {
    var trimmedSpec = rawSpec.trim();
    var isStringProperty =
      propertyTypeName === "java.lang.String" ||
      propertyTypeName === "java.lang.CharSequence";
    var shouldTryParse =
      !isStringProperty &&
      (
        C8O.dbo._isSmartTypeClass(propertyType) ||
        C8O.dbo._isXMLVectorClass(propertyType) ||
        (trimmedSpec.length && (trimmedSpec.charAt(0) === "{" || trimmedSpec.charAt(0) === "["))
      );
    if (shouldTryParse) {
      try {
        rawSpec = JSON.parse(trimmedSpec);
      } catch (parseValueErr) {
        // For SmartType/XMLVector we surface a clear error; otherwise keep the raw string.
        if (C8O.dbo._isSmartTypeClass(propertyType) || C8O.dbo._isXMLVectorClass(propertyType)) {
          throw new Error('Unable to parse JSON value for property "' + pd.getName() + '": ' + parseValueErr);
        }
      }
    }
  }
  if (propertyTypeName === "com.twinsoft.convertigo.beans.ngx.components.MobileSmartSourceType") {
    return C8O.dbo._buildMobileSmartSourceType(rawSpec);
  }
  if (C8O.dbo._isXmlQNameClass(propertyType)) {
    return C8O.dbo._buildXmlQName(rawSpec);
  }
  if (C8O.dbo._isXMLRectangleClass(propertyType)) {
    return C8O.dbo._buildXMLRectangle(rawSpec);
  }
  if (C8O.dbo._isFontSourceClass(propertyType)) {
    return C8O.dbo._buildFontSource(rawSpec);
  }
  if (C8O.dbo._isFormatedContentClass(propertyType)) {
    return C8O.dbo._buildFormatedContent(rawSpec);
  }

  if (C8O.dbo._isSmartTypeClass(propertyType)) {
    if (typeof rawSpec === 'object' && rawSpec !== null && rawSpec.root && rawSpec.data !== undefined) {
      var specSmart = rawSpec;
      if (typeof rawSpec.data === 'string') {
        try {
          specSmart = { root: rawSpec.root, data: JSON.parse(rawSpec.data) };
        } catch (parseSmart) {
          throw new Error("Unable to parse serialized SmartType for property \"" + pd.getName() + "\": " + parseSmart);
        }
      }
      return C8O.xml.deserialize(specSmart);
    }
    return C8O.dbo._buildSmartType(rawSpec);
  }

  if (typeof rawSpec === 'object' && rawSpec !== null) {
    if (rawSpec.root && rawSpec.data !== undefined) {
      var spec = rawSpec;
      if (typeof rawSpec.data === 'string') {
        try {
          spec = { root: rawSpec.root, data: JSON.parse(rawSpec.data) };
        } catch (parseError) {
          throw new Error("Unable to parse serialized value for property \"" + pd.getName() + "\": " + parseError);
        }
      }
      try {
        return C8O.xml.deserialize(spec);
      } catch (conversionError) {
        throw new Error("Unable to deserialize property \"" + pd.getName() + "\": " + conversionError);
      }
    }

    if (rawSpec.hasOwnProperty && rawSpec.hasOwnProperty('value') && Object.keys(rawSpec).length === 1) {
      rawSpec = rawSpec.value;
    }
  }

  if (C8O.dbo._isXMLVectorClass(propertyType) && Array.isArray(rawSpec)) {
    return C8O.dbo._buildXMLVector(rawSpec);
  }

  return rawSpec;
};

C8O.dbo._buildMobileSmartSourceType = function (spec) {
  var MobileSmartSourceType = Packages.com.twinsoft.convertigo.beans.ngx.components.MobileSmartSourceType;
  var Mode = Packages.com.twinsoft.convertigo.beans.ngx.components.MobileSmartSourceType.Mode;

  if (spec instanceof MobileSmartSourceType) {
    return spec;
  }

  var modeToken = null;
  var valueToken = null;

  if (spec && typeof spec === "object") {
    if (spec.mode) {
      modeToken = String(spec.mode).trim();
    } else if (spec.type) {
      modeToken = String(spec.type).trim();
    }

    if (spec.value != null) {
      valueToken = String(spec.value);
    } else if (spec.text != null) {
      valueToken = String(spec.text);
    } else if (spec.expression != null) {
      valueToken = String(spec.expression);
    } else if (spec.smartValue != null) {
      valueToken = String(spec.smartValue);
    } else if (spec.data != null && typeof spec.data === "string") {
      valueToken = spec.data;
    }

    if (spec.source != null && valueToken == null) {
      valueToken = typeof spec.source === "string" ? spec.source : JSON.stringify(spec.source);
    }
  } else if (spec != null) {
    valueToken = String(spec);
  }

  if (!modeToken && typeof valueToken === "string") {
    var idx = valueToken.indexOf(":");
    if (idx > 0) {
      var prefix = valueToken.substring(0, idx).trim();
      if (prefix && /^(plain|script|source)$/i.test(prefix)) {
        modeToken = prefix;
        valueToken = valueToken.substring(idx + 1);
      }
    }
  }

  var mode = Mode.PLAIN;
  if (modeToken) {
    try {
      mode = Mode.valueOf(modeToken.trim().toUpperCase());
    } catch (_ignoreMode) {
      mode = Mode.PLAIN;
    }
  }

  var smart = new MobileSmartSourceType();
  smart.setMode(mode);
  var smartValue = valueToken != null ? valueToken : "";

  if (mode === Mode.SOURCE) {
    if (typeof smartValue === "object") {
      smartValue = JSON.stringify(smartValue);
    }
    if (smartValue == null || smartValue.length === 0) {
      smartValue = "{}";
    }
  }
  smart.setSmartValue(smartValue);
  return smart;
};

C8O.dbo.saveProject = function (project, errors) {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  if (project == null) {
    var message = "No project reference provided";
    if (errors && errors.push) {
      errors.push({ name: "__save__", message: message });
    }
    return { saved: false, message: message };
  }
  try {
    Engine.theApp.databaseObjectsManager.exportProject(project);
    return { saved: true, message: "" };
  } catch (saveError) {
    var message = String(saveError);
    if (errors && errors.push) {
      errors.push({ name: "__save__", message: message });
    }
    return { saved: false, message: message };
  }
};

C8O.dbo.saveProjectIfNeeded = function (project, autoSaveFlag, errors) {
  if (!autoSaveFlag) {
    return { saved: false, message: "", skipped: true };
  }
  return C8O.dbo.saveProject(project, errors);
};

C8O.dbo._isMobileObject = function (dbo) {
  if (!dbo) {
    return false;
  }
  try {
    var MobileObjectClass = Packages.com.twinsoft.convertigo.beans.core.MobileObject;
    return MobileObjectClass.isInstance(dbo);
  } catch (_ignoreMobileObjectClass) {}
  try {
    var className = String(dbo.getClass().getName());
    return className.indexOf(".beans.ngx.") !== -1 || className.indexOf(".beans.mobile.") !== -1;
  } catch (_ignoreMobileObjectName) {
    return false;
  }
};

C8O.dbo._isInstanceOf = function (value, fqcn) {
  if (!value || !fqcn) {
    return false;
  }
  try {
    var cls = Packages.java.lang.Class.forName(String(fqcn));
    return cls.isInstance(value);
  } catch (_ignoreIsInstance) {
    return false;
  }
};

C8O.dbo._safeQName = function (dbo) {
  if (!dbo) {
    return "";
  }
  try {
    if (dbo.getQName) {
      return String(dbo.getQName());
    }
  } catch (_ignoreQName) {}
  try {
    if (dbo.getFullQName) {
      return String(dbo.getFullQName());
    }
  } catch (_ignoreFullQName) {}
  return "";
};

C8O.dbo._resetIfNeeded = function (target, resetQNames) {
  if (!target) {
    return;
  }
  var qname = C8O.dbo._safeQName(target);
  try {
    if (typeof target.isReset === "function" && typeof target.reset === "function") {
      if (!target.isReset()) {
        target.reset();
        if (resetQNames && resetQNames.push && qname.length) {
          resetQNames.push(qname);
        }
      }
      return;
    }
    if (typeof target.reset === "function") {
      target.reset();
      if (resetQNames && resetQNames.push && qname.length) {
        resetQNames.push(qname);
      }
    }
  } catch (_ignoreReset) {}
};

C8O.dbo._resolveNgxRefreshContext = function (dbo) {
  var context = {
    mainScriptComponent: null,
    application: null,
    resetQNames: []
  };
  if (!dbo) {
    return context;
  }

  var main = null;
  try {
    if (C8O.dbo._isInstanceOf(dbo, "com.twinsoft.convertigo.beans.ngx.components.UIComponent") && typeof dbo.getMainScriptComponent === "function") {
      main = dbo.getMainScriptComponent();
    }
  } catch (_ignoreMainScriptComponent) {
    main = null;
  }

  if (!main) {
    try {
      if (C8O.dbo._isInstanceOf(dbo, "com.twinsoft.convertigo.beans.ngx.components.ApplicationComponent")
        || C8O.dbo._isInstanceOf(dbo, "com.twinsoft.convertigo.beans.ngx.components.PageComponent")
        || C8O.dbo._isInstanceOf(dbo, "com.twinsoft.convertigo.beans.ngx.components.UISharedComponent")) {
        main = dbo;
      }
    } catch (_ignoreMainFallback) {
      main = null;
    }
  }
  context.mainScriptComponent = main;

  var app = null;
  try {
    if (main && typeof main.getApplication === "function") {
      app = main.getApplication();
    }
  } catch (_ignoreMainApplication) {
    app = null;
  }
  if (!app) {
    try {
      if (typeof dbo.getApplication === "function") {
        app = dbo.getApplication();
      }
    } catch (_ignoreDboApplication) {
      app = null;
    }
  }
  context.application = app;

  C8O.dbo._resetIfNeeded(main, context.resetQNames);
  C8O.dbo._resetIfNeeded(app, context.resetQNames);

  return context;
};

C8O.dbo.triggerMobileBuilderRefresh = function (dbo, errors) {
  var result = {
    requested: false,
    studioMode: false,
    mobileObject: false,
    triggered: false,
    message: "",
    strategy: "",
    resetQNames: []
  };

  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var MobileBuilder = Packages.com.twinsoft.convertigo.engine.mobile.MobileBuilder;
  var BatchOperationHelper = Packages.com.twinsoft.convertigo.engine.helpers.BatchOperationHelper;

  try {
    result.studioMode = Engine.isStudioMode() === true;
  } catch (_ignoreStudioMode) {
    result.studioMode = false;
  }
  result.mobileObject = C8O.dbo._isMobileObject(dbo);
  result.requested = result.studioMode && result.mobileObject;

  if (!result.requested) {
    result.message = !result.studioMode ? "Skipped: Studio mode required" : "Skipped: target is not a mobile object";
    return result;
  }

  var mb = null;
  try {
    mb = MobileBuilder.getBuilderOf(dbo);
  } catch (builderLookupError) {
    var lookupMessage = "Unable to resolve mobile builder: " + String(builderLookupError);
    result.message = lookupMessage;
    if (errors && errors.push) {
      errors.push({ name: "__mobileBuilder__", message: lookupMessage });
    }
    return result;
  }
  if (mb == null) {
    result.message = "Skipped: no mobile builder for target";
    return result;
  }

  var context = C8O.dbo._resolveNgxRefreshContext(dbo);
  if (context && context.resetQNames && context.resetQNames.length) {
    result.resetQNames = context.resetQNames;
  }

  var batchStarted = false;
  var batchStopped = false;
  try {
    mb.prepareBatchBuild();
    BatchOperationHelper.start();
    batchStarted = true;
    if (context && context.application != null && typeof context.application.updateSourceFiles === "function") {
      context.application.updateSourceFiles();
      result.strategy = "application.updateSourceFiles";
    } else if (context && context.mainScriptComponent != null && typeof context.mainScriptComponent.updateSourceFiles === "function") {
      context.mainScriptComponent.updateSourceFiles();
      result.strategy = "mainScriptComponent.updateSourceFiles";
    } else {
      mb.appChanged();
      result.strategy = "builder.appChanged";
    }
    BatchOperationHelper.stop();
    batchStopped = true;

    result.triggered = true;
    result.message = "Mobile builder refresh triggered via " + result.strategy;
  } catch (builderError) {
    var message = "Unable to trigger mobile builder refresh: " + String(builderError);
    result.message = message;
    if (errors && errors.push) {
      errors.push({ name: "__mobileBuilder__", message: message });
    }
  } finally {
    if (batchStarted && !batchStopped) {
      try {
        BatchOperationHelper.stop();
      } catch (_ignoreStopBatch) {}
    }
    try {
      BatchOperationHelper.cancel();
    } catch (_ignoreCancelBatch) {}
  }

  return result;
};

C8O.dbo.applyUpdatesAndPersist = function (options) {
  options = options || {};

  var dbo = options.dbo || null;
  var projectRef = options.project || null;
  var updates = (options.updates && typeof options.updates === "object") ? options.updates : {};
  var errors = options.errors && options.errors.push ? options.errors : [];
  var autoSaveFlag = options.autoSave === true;
  var persistIfNoUpdate = options.persistIfNoUpdate === true;
  var markChanged = options.markChanged !== false;
  var triggerMobileBuilder = options.triggerMobileBuilder !== false;

  var appliedEntries = [];
  var skippedEntries = [];
  if (dbo && updates && Object.keys(updates).length > 0) {
    var applyResult = C8O.dbo.applyPropertyUpdates(dbo, updates);
    appliedEntries = applyResult.applied || [];
    skippedEntries = applyResult.skipped || [];
    if (applyResult.errors && applyResult.errors.length) {
      Array.prototype.push.apply(errors, applyResult.errors);
    }
  }

  if (projectRef == null && dbo && dbo.getProject) {
    try {
      projectRef = dbo.getProject();
    } catch (_ignoreProjectLookup) {}
  }

  var changed = appliedEntries.length > 0 || persistIfNoUpdate;
  var mobileBuilderRefresh = { requested: false, studioMode: false, mobileObject: false, triggered: false, message: "" };
  var saveResult = { saved: false, message: "", skipped: true };

  if (changed) {
    if (markChanged && dbo != null) {
      try {
        dbo.hasChanged = true;
      } catch (_ignoreDboChanged) {}
    }
    if (markChanged && projectRef != null) {
      try {
        projectRef.hasChanged = true;
      } catch (_ignoreProjectChanged) {}
    }
    if (triggerMobileBuilder && dbo != null) {
      mobileBuilderRefresh = C8O.dbo.triggerMobileBuilderRefresh(dbo, errors);
    }
    saveResult = C8O.dbo.saveProjectIfNeeded(projectRef, autoSaveFlag, errors);
  }

  return {
    applied: appliedEntries,
    skipped: skippedEntries,
    errors: errors,
    project: projectRef,
    changed: changed,
    mobileBuilderRefresh: mobileBuilderRefresh,
    saveResult: saveResult,
    saved: saveResult && saveResult.saved === true
  };
};

C8O.dbo.finalizeMutationsByQNames = function (options) {
  options = options || {};
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var autoSave = options.autoSave !== false;
  var triggerMobileBuilder = options.triggerMobileBuilder !== false;
  var errors = options.errors && options.errors.push ? options.errors : [];
  var sourceQNames = Array.isArray(options.qnames) ? options.qnames : [];

  var touchedQNames = [];
  var touchedQNameSet = {};
  var projectMap = {};
  var projectAnchorMap = {};

  function addTouchedQName(value) {
    var text = C8O.util.toTrimmedString(value);
    if (!text.length || touchedQNameSet[text]) {
      return;
    }
    touchedQNameSet[text] = true;
    touchedQNames.push(text);
  }

  function resolveProjectByName(projectName) {
    var text = C8O.util.toTrimmedString(projectName);
    if (!text.length) {
      return null;
    }
    try {
      return Engine.theApp.databaseObjectsManager.getOriginalProjectByName(text, false);
    } catch (_ignoreProjectByNameWithFlag) {
      try {
        return Engine.theApp.databaseObjectsManager.getOriginalProjectByName(text);
      } catch (_ignoreProjectByName) {
        return null;
      }
    }
  }

  for (var i = 0; i < sourceQNames.length; i++) {
    var qname = C8O.util.toTrimmedString(sourceQNames[i]);
    if (!qname.length) {
      continue;
    }
    addTouchedQName(qname);

    var dbo = C8O.dbo.resolve(qname, { optional: true });
    if (dbo) {
      try {
        var projectRef = dbo.getProject ? dbo.getProject() : null;
        if (projectRef && projectRef.getName) {
          var projectName = String(projectRef.getName());
          if (projectName.length) {
            projectMap[projectName] = projectRef;
            if (!projectAnchorMap[projectName]) {
              projectAnchorMap[projectName] = dbo;
            }
          }
        }
      } catch (_ignoreResolvedProject) {}
      continue;
    }

    var fallbackProjectName = C8O.dbo._extractProjectName ? C8O.dbo._extractProjectName(qname) : "";
    if (fallbackProjectName.length && !projectMap[fallbackProjectName]) {
      var fallbackProject = resolveProjectByName(fallbackProjectName);
      if (fallbackProject) {
        projectMap[fallbackProjectName] = fallbackProject;
      }
    }
  }

  var mobileBuilderResults = [];
  if (triggerMobileBuilder) {
    var anchorNames = Object.keys(projectAnchorMap);
    for (var m = 0; m < anchorNames.length; m++) {
      var anchorProjectName = anchorNames[m];
      var anchor = projectAnchorMap[anchorProjectName];
      if (!anchor) {
        continue;
      }
      var refreshInfo = C8O.dbo.triggerMobileBuilderRefresh(anchor, errors);
      mobileBuilderResults.push({
        project: anchorProjectName,
        requested: refreshInfo && refreshInfo.requested === true,
        triggered: refreshInfo && refreshInfo.triggered === true,
        message: refreshInfo && refreshInfo.message ? String(refreshInfo.message) : ""
      });
    }
  }

  var saveResults = [];
  if (autoSave) {
    var projectNames = Object.keys(projectMap);
    for (var s = 0; s < projectNames.length; s++) {
      var projectNameForSave = projectNames[s];
      var projectToSave = projectMap[projectNameForSave];
      if (!projectToSave) {
        continue;
      }
      var saveResult = C8O.dbo.saveProject(projectToSave, errors);
      saveResults.push({
        project: projectNameForSave,
        saved: saveResult && saveResult.saved === true,
        message: saveResult && saveResult.message ? String(saveResult.message) : ""
      });
    }
  }

  return {
    touchedQNames: touchedQNames,
    projects: Object.keys(projectMap),
    mobileBuilder: mobileBuilderResults,
    saveResults: saveResults
  };
};

C8O.dbo.refreshStudioTreeByQName = function (targetQName, errors) {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var System = java.lang.System;

  var requestedQName = C8O.util.toTrimmedString ? C8O.util.toTrimmedString(targetQName || "") : String(targetQName || "").trim();
  var studioMode = false;
  try {
    studioMode = Engine.isStudioMode() === true;
  } catch (_ignoreStudioMode) {
    studioMode = false;
  }

  var result = {
    status: "pending",
    message: "Waiting for refresh",
    qname: requestedQName,
    targetQName: "",
    refreshed: false,
    refreshedQName: "",
    studioMode: studioMode,
    timestamp: System.currentTimeMillis(),
    error: "",
    executed: false
  };

  if (!studioMode) {
    result.status = "skipped";
    result.message = "Refresh skipped: Convertigo Studio required";
    return result;
  }

  if (!requestedQName.length) {
    result.status = "error";
    result.message = "QName is required";
    if (errors && errors.push) {
      errors.push({ name: "__studioRefresh__", message: result.message });
    }
    return result;
  }

  var refreshTarget = null;
  try {
    refreshTarget = Engine.theApp.databaseObjectsManager.getDatabaseObjectByQName(requestedQName);
  } catch (lookupError) {
    result.status = "error";
    result.message = "Unable to resolve QName: " + requestedQName;
    result.error = String(lookupError);
    if (errors && errors.push) {
      errors.push({ name: "__studioRefresh__", message: result.message, detail: result.error });
    }
    return result;
  }

  if (refreshTarget == null) {
    result.status = "error";
    result.message = "Database object not found: " + requestedQName;
    if (errors && errors.push) {
      errors.push({ name: "__studioRefresh__", message: result.message });
    }
    return result;
  }

  try {
    result.targetQName = String(refreshTarget.getQName());
  } catch (_ignoreTargetQName) {
    result.targetQName = requestedQName;
  }

  try {
    var ConvertigoPlugin = Packages.com.twinsoft.convertigo.eclipse.ConvertigoPlugin;
    var Runnable = Packages.java.lang.Runnable;
    var pluginInstance = ConvertigoPlugin.getDefault();
    if (pluginInstance == null) {
      result.status = "skipped";
      result.message = "Project Explorer view not available";
      return result;
    }

    ConvertigoPlugin.syncExec(new Runnable({ run: function () {
      try {
        var view = pluginInstance.getProjectExplorerView();
        if (view == null) {
          result.status = "skipped";
          result.message = "Project Explorer view not available";
          return;
        }
        view.reloadDatabaseObject(refreshTarget);
        result.status = "refreshed";
        result.message = "Project Explorer refreshed";
        result.refreshed = true;
        result.refreshedQName = String(refreshTarget.getQName());
        result.executed = true;
      } catch (uiError) {
        result.status = "error";
        result.message = String(uiError);
        result.error = String(uiError);
      }
    }}));
  } catch (refreshError) {
    result.status = "error";
    result.message = String(refreshError);
    result.error = String(refreshError);
  }

  if (result.status === "error" && errors && errors.push) {
    errors.push({ name: "__studioRefresh__", message: result.message, detail: result.error });
  }
  return result;
};

C8O.dbo._toIonicImportReport = function (imported, defaultProjectName) {
  var warningArray = [];
  if (imported && imported.warnings) {
    try {
      for (var wi = 0; wi < imported.warnings.size(); wi++) {
        warningArray.push(String(imported.warnings.get(wi)));
      }
    } catch (_ignoreIonicWarnings) {
      try {
        for (var wj = 0; wj < imported.warnings.length; wj++) {
          warningArray.push(String(imported.warnings[wj]));
        }
      } catch (_ignoreIonicWarningsArray) {}
    }
  }
  return {
    projectName: imported && imported.projectName != null ? String(imported.projectName) : defaultProjectName,
    processed: imported && imported.processed != null ? Number(imported.processed) : 0,
    pagesUpdated: imported && imported.pagesUpdated != null ? Number(imported.pagesUpdated) : 0,
    sharedComponentsUpdated: imported && imported.sharedComponentsUpdated != null ? Number(imported.sharedComponentsUpdated) : 0,
    templatesUpdated: imported && imported.templatesUpdated != null ? Number(imported.templatesUpdated) : 0,
    stylesUpdated: imported && imported.stylesUpdated != null ? Number(imported.stylesUpdated) : 0,
    scriptsUpdated: imported && imported.scriptsUpdated != null ? Number(imported.scriptsUpdated) : 0,
    skipped: imported && imported.skipped != null ? Number(imported.skipped) : 0,
    warnings: warningArray
  };
};

C8O.dbo._importFromIonicViaStudio = function (projectName, projectDir, errors) {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var ConvertigoPlugin = Packages.com.twinsoft.convertigo.eclipse.ConvertigoPlugin;
  var Runnable = Packages.java.lang.Runnable;
  var Thread = Packages.java.lang.Thread;
  var ProjectTreeObject = Packages.com.twinsoft.convertigo.eclipse.views.projectexplorer.model.ProjectTreeObject;
  var UnloadedProjectTreeObject = Packages.com.twinsoft.convertigo.eclipse.views.projectexplorer.model.UnloadedProjectTreeObject;
  var NgxIonicRoundTripConverter = Packages.com.twinsoft.convertigo.engine.util.NgxIonicRoundTripConverter;
  var result = {
    executed: false,
    imported: false,
    message: "",
    error: null,
    report: null,
    requiresFinalReload: false
  };
  var preparedTreeObject = null;
  var needsLoad = false;

  try {
    var pluginInstance = ConvertigoPlugin.getDefault();
    if (pluginInstance == null) {
      result.message = "Project Explorer view not available";
      return result;
    }

    ConvertigoPlugin.syncExec(new Runnable({ run: function () {
      try {
        var view = pluginInstance.getProjectExplorerView();
        if (view == null) {
          result.message = "Project Explorer view not available";
          return;
        }

        var imported = null;
        var treeObject = null;
        try {
          treeObject = view.getProjectRootObject(projectName);
        } catch (_ignoreProjectRootLookupError) {
          treeObject = null;
        }
        if (treeObject == null) {
          try {
            var provider = view.viewer != null ? view.viewer.getContentProvider() : null;
            if (provider != null) {
              var loadProjectMethod = provider.getClass().getDeclaredMethod("loadProject", Packages.java.lang.String);
              loadProjectMethod.setAccessible(true);
              loadProjectMethod.invoke(provider, projectName);
              treeObject = view.getProjectRootObject(projectName);
            }
          } catch (_ignoreProviderLoadProject) {}
        }
        if (treeObject == null) {
          try {
            view.importProjectTreeObject(projectName);
            treeObject = view.getProjectRootObject(projectName);
          } catch (_ignoreImportProjectTreeObject) {}
        }
        if (treeObject instanceof UnloadedProjectTreeObject) {
          preparedTreeObject = treeObject;
          needsLoad = true;
          result.executed = true;
          return;
        }
        if (treeObject instanceof ProjectTreeObject) {
          preparedTreeObject = treeObject;
          result.executed = true;
          return;
        }
        throw new Error("Project root not found in Project Explorer: " + projectName);
      } catch (uiError) {
        result.error = String(uiError);
        result.message = String(uiError);
      }
    }}));
  } catch (studioError) {
    result.error = String(studioError);
    result.message = String(studioError);
  }

  if (!result.imported && result.message.length && errors && errors.push) {
    errors.push({ name: "__ionicStudio__", message: result.message, detail: result.error });
  }

  if (result.error != null) {
    return result;
  }

  try {
    if (needsLoad && preparedTreeObject != null) {
      ConvertigoPlugin.syncExec(new Runnable({ run: function () {
        try {
          var view = pluginInstance.getProjectExplorerView();
          if (view != null) {
            view.loadProject(preparedTreeObject, false);
          }
        } catch (loadError) {
          result.error = String(loadError);
          result.message = String(loadError);
        }
      }}));
      if (result.error != null) {
        return result;
      }
      var loadedProject = null;
      for (var attempt = 0; attempt < 100; attempt++) {
        try {
          loadedProject = Engine.theApp.databaseObjectsManager.getOriginalProjectByName(projectName, false);
        } catch (_ignoreProjectLoadPoll) {
          loadedProject = null;
        }
        if (loadedProject != null) {
          break;
        }
        Thread.sleep(100);
      }
      if (loadedProject == null) {
        result.error = "Timed out while waiting for project to load: " + projectName;
        result.message = result.error;
        return result;
      }
    }

    ConvertigoPlugin.syncExec(new Runnable({ run: function () {
      try {
        var view = pluginInstance.getProjectExplorerView();
        if (view == null) {
          throw new Error("Project Explorer view not available");
        }
        var treeObject = view.getProjectRootObject(projectName);
        if (!(treeObject instanceof ProjectTreeObject)) {
          throw new Error("Project not loaded in Project Explorer: " + projectName);
        }
        if (treeObject.getModified && treeObject.getModified()) {
          treeObject.save(false);
        }
        var project = Engine.theApp.databaseObjectsManager.getOriginalProjectByName(projectName, false);
        if (project == null) {
          throw new Error("Project not loaded: " + projectName);
        }
        var imported = NgxIonicRoundTripConverter.importFromIonic(project);
        view.reloadProject(treeObject);
        result.executed = true;
        result.imported = true;
        result.report = C8O.dbo._toIonicImportReport(imported, projectName);
      } catch (finalUiError) {
        result.error = String(finalUiError);
        result.message = String(finalUiError);
      }
    }}));
  } catch (lateStudioError) {
    result.error = String(lateStudioError);
    result.message = String(lateStudioError);
  }

  if (!result.imported && result.message.length && errors && errors.push) {
    errors.push({ name: "__ionicStudio__", message: result.message, detail: result.error });
  }
  return result;
};

C8O.dbo.forbiddenIonicAuthoringTarget = function (target) {
  var raw = C8O.util && typeof C8O.util.toTrimmedString === "function"
    ? C8O.util.toTrimmedString(target || "")
    : String(target || "").trim();
  if (!raw.length) {
    return null;
  }
  var normalized = raw.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "").toLowerCase();
  var forbiddenSuffixes = [
    "/src/global.css",
    "/src/global.scss",
    "/src/global.sass"
  ];
  for (var i = 0; i < forbiddenSuffixes.length; i++) {
    var suffix = forbiddenSuffixes[i];
    if (normalized === suffix.substring(1) || normalized.indexOf(suffix) === normalized.length - suffix.length) {
      return suffix.substring(1);
    }
  }
  return null;
};

C8O.dbo.reloadProject = function (projectOrName, errors, options) {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var DatabaseObjectsManager = Packages.com.twinsoft.convertigo.engine.DatabaseObjectsManager;
  var File = Packages.java.io.File;
  var ConvertigoPlugin = Packages.com.twinsoft.convertigo.eclipse.ConvertigoPlugin;
  var name = "";
  var opts = options || {};
  var fromIonic = C8O.util && typeof C8O.util.toBoolean === "function"
    ? C8O.util.toBoolean(opts.fromIonic, false) === true
    : opts.fromIonic === true;
  var preserveIonic = C8O.util && typeof C8O.util.toBoolean === "function"
    ? C8O.util.toBoolean(opts.preserveIonic, false) === true
    : opts.preserveIonic === true;
  var ionicTarget = C8O.util && typeof C8O.util.toTrimmedString === "function"
    ? C8O.util.toTrimmedString(opts.ionicTarget || opts.ionicTargetPath || "")
    : String(opts.ionicTarget || opts.ionicTargetPath || "").trim();
  var ionicImported = false;
  var ionicSource = "";
  var ionicReport = null;
  var studioProjects = Engine.theApp.databaseObjectsManager.getStudioProjects();
  if (projectOrName != null) {
    if (typeof projectOrName === 'string') {
      name = C8O.util.toTrimmedString(projectOrName);
    } else if (projectOrName.getName) {
      name = String(projectOrName.getName());
    } else if (projectOrName.getQName) {
      name = String(projectOrName.getQName());
    }
  }
  if (!name.length) {
    var message = "Project name is required";
    if (errors && errors.push) {
      errors.push({ name: "__reload__", message: message });
    }
    return { reloaded: false, message: message, fromIonic: fromIonic, preserveIonic: preserveIonic, ionicImported: false, ionicSource: "", ionicTarget: ionicTarget, ionicReport: null };
  }
  var projectDir = null;
  if (fromIonic) {
    try {
      if (C8O.project && typeof C8O.project.resolveProjectDirectory === "function") {
        try {
          projectDir = C8O.project.resolveProjectDirectory({ projectName: name });
        } catch (_ignoreResolveProjectDirectoryError) {
          projectDir = null;
        }
      }
      if (projectDir == null) {
        projectDir = new File(String(Engine.projectDir(name)));
      }
      if (projectDir == null) {
        throw new Error("Project directory is not available for '" + name + "'");
      }
    } catch (dirError) {
      var dirMessage = String(dirError);
      if (errors && errors.push) {
        errors.push({ name: "__projectDir__", message: dirMessage });
      }
      return { reloaded: false, message: dirMessage, fromIonic: fromIonic, preserveIonic: preserveIonic, ionicImported: false, ionicSource: "", ionicTarget: ionicTarget, ionicReport: null };
    }
  }
  if (fromIonic && ionicTarget.length) {
    var forbiddenTarget = C8O.dbo.forbiddenIonicAuthoringTarget
      ? C8O.dbo.forbiddenIonicAuthoringTarget(ionicTarget)
      : null;
    if (forbiddenTarget) {
      var forbiddenMessage = "Forbidden Ionic authoring target: " + forbiddenTarget +
        ". Do not edit global styles from the HTML editor workflow; use app.component.scss or the target page/shared-component SCSS instead.";
      if (errors && errors.push) {
        errors.push({ name: "__ionicTarget__", message: forbiddenMessage, target: ionicTarget });
      }
      return { reloaded: false, message: forbiddenMessage, fromIonic: fromIonic, preserveIonic: preserveIonic, ionicImported: false, ionicSource: "", ionicTarget: ionicTarget, ionicReport: null };
    }
  }
  if (preserveIonic === true || fromIonic === true) {
    if (ConvertigoPlugin == null || ConvertigoPlugin.getDefault == null || ConvertigoPlugin.getDefault() == null) {
      var preserveIonicMessage = "preserveIonic requires an updated Studio build.";
      if (errors && errors.push) {
        errors.push({ name: "__preserveIonic__", message: preserveIonicMessage });
      }
      return { reloaded: false, message: preserveIonicMessage, fromIonic: fromIonic, preserveIonic: preserveIonic, ionicImported: ionicImported, ionicSource: ionicSource, ionicTarget: ionicTarget, ionicReport: ionicReport };
    }
  }

  if (fromIonic) {
    try {
      var ionicDir = new File(projectDir, "_private/ionic");
      var projectSource = new File(projectDir, "c8oProject.yaml");
      ionicSource = ionicDir.getCanonicalPath ? String(ionicDir.getCanonicalPath()) : String(ionicDir.getAbsolutePath());
      if (!ionicDir.exists()) {
        throw new Error("Missing Ionic authoring directory: " + ionicSource);
      }
      if (!projectSource.exists()) {
        throw new Error("Missing c8oProject.yaml for '" + name + "' in " + String(projectDir.getAbsolutePath()));
      }
      var imported = ionicTarget.length
        ? ConvertigoPlugin.getDefault().importProjectFromIonic(name, ionicTarget)
        : ConvertigoPlugin.getDefault().reloadProjectFromIonic(name);
      ionicImported = true;
      ionicReport = C8O.dbo._toIonicImportReport(imported, name);
      return {
        reloaded: true,
        message: "",
        fromIonic: true,
        preserveIonic: preserveIonic,
        ionicImported: true,
        ionicSource: ionicSource,
        ionicTarget: ionicTarget,
        ionicReport: ionicReport
      };
    } catch (ionicError) {
      var ionicMessage = String(ionicError);
      if (errors && errors.push) {
        errors.push({ name: "__ionic__", message: ionicMessage });
      }
      return { reloaded: false, message: ionicMessage, fromIonic: true, preserveIonic: preserveIonic, ionicImported: false, ionicSource: ionicSource, ionicTarget: ionicTarget, ionicReport: ionicReport };
    }
  }

  if (preserveIonic === true) {
    try {
      ConvertigoPlugin.getDefault().reloadProjectPreservingIonic(name);
      return { reloaded: true, message: "", fromIonic: false, preserveIonic: true, ionicImported: false, ionicSource: ionicSource, ionicTarget: ionicTarget, ionicReport: ionicReport };
    } catch (preserveIonicError) {
      var preserveMessage = String(preserveIonicError);
      if (errors && errors.push) {
        errors.push({ name: "__preserveIonic__", message: preserveMessage });
      }
      return { reloaded: false, message: preserveMessage, fromIonic: false, preserveIonic: true, ionicImported: false, ionicSource: ionicSource, ionicTarget: ionicTarget, ionicReport: ionicReport };
    }
  }
  try {
    studioProjects.reloadProject(name);
    return { reloaded: true, message: "", fromIonic: fromIonic, preserveIonic: preserveIonic, ionicImported: ionicImported, ionicSource: ionicSource, ionicTarget: ionicTarget, ionicReport: ionicReport };
  } catch (reloadError) {
    var message = String(reloadError);
    if (errors && errors.push) {
      errors.push({ name: "__reload__", message: message });
    }
    return { reloaded: false, message: message, fromIonic: fromIonic, preserveIonic: preserveIonic, ionicImported: ionicImported, ionicSource: ionicSource, ionicTarget: ionicTarget, ionicReport: ionicReport };
  }
};

C8O.dbo.exportProjectIfNeeded = function (project, commitFlag, errors) {
  var result = C8O.dbo.saveProjectIfNeeded(project, commitFlag, errors);
  return { exported: result.saved === true, message: result.message || "" };
};

// Normalize property aliases ("Tag name", "tag_name") to a stable lookup key.
C8O.dbo._normalizePropertyLookupKey = function (name) {
  var text = C8O.util.toTrimmedString ? C8O.util.toTrimmedString(name || "") : String(name || "").trim();
  if (!text.length) {
    return "";
  }
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
};

C8O.dbo._coercePropertyHintString = function (rawSpec) {
  if (rawSpec === null || rawSpec === undefined) {
    return "";
  }
  if (typeof rawSpec === "string" || typeof rawSpec === "number" || typeof rawSpec === "boolean") {
    return C8O.util.toTrimmedString ? C8O.util.toTrimmedString(String(rawSpec)) : String(rawSpec).trim();
  }
  if (typeof rawSpec === "object") {
    if (rawSpec.value !== undefined) {
      return C8O.dbo._coercePropertyHintString(rawSpec.value);
    }
    if (rawSpec.expression !== undefined) {
      return C8O.dbo._coercePropertyHintString(rawSpec.expression);
    }
    if (rawSpec.text !== undefined) {
      return C8O.dbo._coercePropertyHintString(rawSpec.text);
    }
    if (rawSpec.data !== undefined) {
      return C8O.dbo._coercePropertyHintString(rawSpec.data);
    }
  }
  return "";
};

C8O.dbo._safeFullQName = function (dbo) {
  if (!dbo) {
    return "";
  }
  try {
    if (dbo.getFullQName) {
      return String(dbo.getFullQName());
    }
  } catch (_ignoreFullQName) {}
  try {
    if (dbo.getQName) {
      return String(dbo.getQName());
    }
  } catch (_ignoreQName) {}
  return "";
};

C8O.dbo._extractPropertyHint = function (updates, aliases) {
  if (!updates || typeof updates !== "object" || !aliases || !aliases.length) {
    return "";
  }
  var expected = {};
  for (var a = 0; a < aliases.length; a++) {
    var normalizedAlias = C8O.dbo._normalizePropertyLookupKey(aliases[a]);
    if (normalizedAlias.length) {
      expected[normalizedAlias] = true;
    }
  }
  var keys = Object.keys(updates);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var normalizedKey = C8O.dbo._normalizePropertyLookupKey(key);
    if (!expected[normalizedKey]) {
      continue;
    }
    var value = C8O.dbo._coercePropertyHintString(updates[key]);
    if (value.length) {
      return value;
    }
  }
  return "";
};

C8O.dbo.hasAppliedProperty = function (appliedEntries, aliases) {
  if (!appliedEntries || !appliedEntries.length || !aliases || !aliases.length) {
    return false;
  }
  var expected = {};
  for (var a = 0; a < aliases.length; a++) {
    var normalizedAlias = C8O.dbo._normalizePropertyLookupKey(aliases[a]);
    if (normalizedAlias.length) {
      expected[normalizedAlias] = true;
    }
  }
  for (var i = 0; i < appliedEntries.length; i++) {
    var entry = appliedEntries[i];
    var normalizedName = C8O.dbo._normalizePropertyLookupKey(entry && entry.name ? entry.name : "");
    if (normalizedName.length && expected[normalizedName]) {
      return true;
    }
  }
  return false;
};

C8O.dbo._isNgxParent = function (parentDbo) {
  if (!parentDbo) {
    return false;
  }
  try {
    return parentDbo instanceof Packages.com.twinsoft.convertigo.beans.ngx.components.MobileComponent;
  } catch (_ignoreInstance) {}
  try {
    var parentClass = String(parentDbo.getClass().getName());
    return parentClass.indexOf("com.twinsoft.convertigo.beans.ngx.") === 0;
  } catch (_ignoreClassName) {
    return false;
  }
};

C8O.dbo._isNgxClassFqcn = function (className) {
  var text = C8O.util.toTrimmedString ? C8O.util.toTrimmedString(className || "") : String(className || "").trim();
  if (!text.length) {
    return false;
  }
  return text.indexOf("com.twinsoft.convertigo.beans.ngx.") === 0;
};

C8O.dbo.getNgxComponentLogicalId = function (component, sampleDbo) {
  var candidate = sampleDbo || null;
  var className = "";
  try {
    className = candidate && candidate.getClass ? String(candidate.getClass().getName() || "") : "";
  } catch (_ignoreClass) {
    className = "";
  }

  if (className === "com.twinsoft.convertigo.beans.ngx.components.UIDynamicInvoke") {
    try {
      var sharedActionQName = String(candidate.getSharedActionQName() || "");
      if (sharedActionQName.length) {
        return sharedActionQName;
      }
    } catch (_ignoreSharedAction) {}
  }

  if (className === "com.twinsoft.convertigo.beans.ngx.components.UIUseShared") {
    try {
      var sharedComponentQName = String(candidate.getSharedComponentQName() || "");
      if (sharedComponentQName.length) {
        return sharedComponentQName;
      }
    } catch (_ignoreSharedComponent) {}
  }

  try {
    if (candidate && typeof candidate.getIonBean === "function") {
      var ionBean = candidate.getIonBean();
      if (ionBean && typeof ionBean.getName === "function") {
        var ionName = String(ionBean.getName() || "");
        if (ionName.length) {
          return ionName;
        }
      }
    }
  } catch (_ignoreIonBean) {}

  try {
    if (component && typeof component.getName === "function") {
      var componentName = String(component.getName() || "");
      if (componentName.length) {
        return componentName;
      }
    }
  } catch (_ignoreComponentName) {}

  return "";
};

C8O.dbo._collectNgxComponentManagers = function (referenceDbo) {
  var ComponentManager = Packages.com.twinsoft.convertigo.beans.ngx.components.dynamic.ComponentManager;
  var managers = [];
  var seen = {};

  function addManager(manager) {
    if (!manager) {
      return;
    }
    var key = "";
    try {
      key = manager.getTemplateProjectName ? String(manager.getTemplateProjectName() || "") : "";
    } catch (_ignoreTemplateName) {
      key = "";
    }
    if (!key.length) {
      try {
        key = String(manager.toString());
      } catch (_ignoreManagerText) {
        key = "manager-" + String(managers.length);
      }
    }
    if (seen[key]) {
      return;
    }
    seen[key] = true;
    managers.push(manager);
  }

  try {
    addManager(ComponentManager.of(referenceDbo && referenceDbo.getProject ? referenceDbo.getProject() : referenceDbo));
  } catch (_ignoreReferenceManager) {}

  try {
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    var ngxAppClass = Packages.com.twinsoft.convertigo.beans.ngx.components.ApplicationComponent;
    var projectNames = Engine.theApp.databaseObjectsManager.getAllProjectNamesList(true);
    for (var i = 0; i < projectNames.size(); i++) {
      var projectName = String(projectNames.get(i) || "");
      if (!projectName.length) {
        continue;
      }
      try {
        if (!Engine.theApp.databaseObjectsManager.existsProject(projectName)) {
          continue;
        }
        var project = Engine.theApp.databaseObjectsManager.getOriginalProjectByName(projectName, false);
        if (!project || !project.getMobileApplication()) {
          continue;
        }
        var app = project.getMobileApplication().getApplicationComponent();
        if (!app || !(app instanceof ngxAppClass)) {
          continue;
        }
        addManager(ComponentManager.of(project));
      } catch (_ignoreProjectManager) {}
    }
  } catch (_ignoreProjectsList) {}

  try {
    addManager(ComponentManager.of(null));
  } catch (_ignoreDefaultManager) {}

  return managers;
};

C8O.dbo._ngxCreateCandidateCache = C8O.dbo._ngxCreateCandidateCache || {};
C8O.dbo._ngxCreateCatalogCache = C8O.dbo._ngxCreateCatalogCache || {};

C8O.dbo.clearNgxCreateCandidateCache = function () {
  C8O.dbo._ngxCreateCandidateCache = {};
  C8O.dbo._ngxCreateCatalogCache = {};
};

C8O.dbo._getNgxCreateContextKey = function (referenceDbo) {
  var projectName = "";
  var parentClassName = "";
  try {
    var project = referenceDbo && referenceDbo.getProject ? referenceDbo.getProject() : null;
    projectName = project && project.getName ? String(project.getName() || "") : "";
  } catch (_ignoreNgxCreateProjectName) {
    projectName = "";
  }
  try {
    parentClassName = referenceDbo && referenceDbo.getClass ? String(referenceDbo.getClass().getName() || "") : "";
  } catch (_ignoreNgxCreateParentClass) {
    parentClassName = "";
  }
  return projectName + "|" + parentClassName;
};

C8O.dbo._instantiateNgxPaletteCandidate = function (candidate) {
  if (!candidate || !candidate.manager || !candidate.component) {
    return null;
  }
  try {
    return candidate.manager.createBean(candidate.component);
  } catch (_ignoreInstantiateNgxCandidate) {
    return null;
  }
};

C8O.dbo._buildNgxCreateCatalog = function (referenceDbo, options) {
  options = options || {};
  var managers = C8O.dbo._collectNgxComponentManagers(referenceDbo);
  if (!managers || !managers.length) {
    return {};
  }

  var catalog = {};
  var dedupe = {};
  for (var m = 0; m < managers.length; m++) {
    var manager = managers[m];
    if (!manager) {
      continue;
    }
    try {
      if (typeof manager.reloadComponents === "function") {
        manager.reloadComponents();
      }
    } catch (_ignoreReloadForCatalog) {}

    var components = null;
    try {
      components = manager.getComponentsByGroup();
    } catch (_ignoreComponentsForCatalog) {
      components = null;
    }
    if (!components) {
      continue;
    }

    for (var i = 0; i < components.size(); i++) {
      var component = components.get(i);
      if (!component) {
        continue;
      }

      if (options.requireAllowedInParent === true && referenceDbo) {
        var allowed = false;
        try {
          allowed = component.isAllowedIn(referenceDbo) === true;
        } catch (_ignoreAllowedForCatalog) {
          allowed = false;
        }
        if (!allowed) {
          continue;
        }
      }

      var sampleDbo = C8O.dbo._instantiateNgxPaletteCandidate({
        manager: manager,
        component: component
      });
      if (!sampleDbo) {
        continue;
      }

      var candidateClassName = "";
      try {
        candidateClassName = String(sampleDbo.getClass().getName() || "");
      } catch (_ignoreCandidateClassNameForCatalog) {
        candidateClassName = "";
      }
      if (!candidateClassName.length) {
        continue;
      }

      var logicalId = C8O.dbo.getNgxComponentLogicalId(component, sampleDbo);
      if (!logicalId.length) {
        continue;
      }
      var logicalKey = C8O.dbo._normalizePropertyLookupKey(logicalId);
      if (!logicalKey.length) {
        continue;
      }
      var dedupeKey = candidateClassName + "#" + logicalKey;
      if (dedupe[dedupeKey]) {
        continue;
      }
      dedupe[dedupeKey] = true;

      if (!catalog[candidateClassName]) {
        catalog[candidateClassName] = [];
      }
      catalog[candidateClassName].push({
        manager: manager,
        component: component,
        baseClassFqcn: candidateClassName,
        logicalId: logicalId,
        logicalClassName: C8O.dbo.buildLogicalClassName(candidateClassName, logicalId)
      });
    }
  }
  return catalog;
};

C8O.dbo._listNgxCreateCandidatesByBaseClass = function (baseClassFqcn, referenceDbo, options) {
  options = options || {};
  var baseClass = C8O.util.toTrimmedString ? C8O.util.toTrimmedString(baseClassFqcn || "") : String(baseClassFqcn || "").trim();
  if (!baseClass.length || !C8O.dbo._isNgxClassFqcn(baseClass)) {
    return [];
  }

  var cacheKey = "";
  var contextKey = "";
  if (options.requireAllowedInParent === true && referenceDbo) {
    contextKey = C8O.dbo._getNgxCreateContextKey(referenceDbo);
    cacheKey = contextKey + "|" + baseClass;
    if (C8O.dbo._ngxCreateCandidateCache[cacheKey]) {
      return C8O.dbo._ngxCreateCandidateCache[cacheKey];
    }
    if (C8O.dbo._ngxCreateCatalogCache[contextKey]) {
      var cachedMatches = C8O.dbo._ngxCreateCatalogCache[contextKey][baseClass] || [];
      C8O.dbo._ngxCreateCandidateCache[cacheKey] = cachedMatches;
      return cachedMatches;
    }
  }

  if (contextKey.length) {
    var catalog = C8O.dbo._buildNgxCreateCatalog(referenceDbo, options);
    C8O.dbo._ngxCreateCatalogCache[contextKey] = catalog;
    var catalogMatches = catalog[baseClass] || [];
    C8O.dbo._ngxCreateCandidateCache[cacheKey] = catalogMatches;
    return catalogMatches;
  }

  var managers = C8O.dbo._collectNgxComponentManagers(referenceDbo);
  if (!managers || !managers.length) {
    return [];
  }

  var matches = [];
  var dedupe = {};
  for (var m = 0; m < managers.length; m++) {
    var manager = managers[m];
    if (!manager) {
      continue;
    }
    try {
      if (typeof manager.reloadComponents === "function") {
        manager.reloadComponents();
      }
    } catch (_ignoreReloadForCreate) {}

    var components = null;
    try {
      components = manager.getComponentsByGroup();
    } catch (_ignoreComponentsForCreate) {
      components = null;
    }
    if (!components) {
      continue;
    }

    for (var i = 0; i < components.size(); i++) {
      var component = components.get(i);
      if (!component) {
        continue;
      }

      if (options.requireAllowedInParent === true && referenceDbo) {
        var allowed = false;
        try {
          allowed = component.isAllowedIn(referenceDbo) === true;
        } catch (_ignoreAllowedForCreate) {
          allowed = false;
        }
        if (!allowed) {
          continue;
        }
      }

      var sampleDbo = C8O.dbo._instantiateNgxPaletteCandidate({
        manager: manager,
        component: component
      });
      if (!sampleDbo) {
        continue;
      }

      var candidateClassName = "";
      try {
        candidateClassName = String(sampleDbo.getClass().getName() || "");
      } catch (_ignoreCandidateClassNameForCreate) {
        candidateClassName = "";
      }
      if (!candidateClassName.length || candidateClassName !== baseClass) {
        continue;
      }

      var logicalId = C8O.dbo.getNgxComponentLogicalId(component, sampleDbo);
      if (!logicalId.length) {
        continue;
      }
      var logicalKey = C8O.dbo._normalizePropertyLookupKey(logicalId);
      if (!logicalKey.length) {
        continue;
      }
      var dedupeKey = candidateClassName + "#" + logicalKey;
      if (dedupe[dedupeKey]) {
        continue;
      }
      dedupe[dedupeKey] = true;

      matches.push({
        manager: manager,
        component: component,
        baseClassFqcn: candidateClassName,
        logicalId: logicalId,
        logicalClassName: C8O.dbo.buildLogicalClassName(candidateClassName, logicalId)
      });
    }
  }

  if (cacheKey.length) {
    C8O.dbo._ngxCreateCandidateCache[cacheKey] = matches;
  }
  return matches;
};

C8O.dbo._findNgxCreateCandidateByLogicalClass = function (classNameWithLogicalId, referenceDbo, options) {
  options = options || {};
  var parsed = C8O.dbo.parseLogicalClassToken(classNameWithLogicalId || "");
  if (!parsed.baseClassFqcn.length || !parsed.hasLogicalId || !C8O.dbo._isNgxClassFqcn(parsed.baseClassFqcn)) {
    return null;
  }

  var candidates = C8O.dbo._listNgxCreateCandidatesByBaseClass(parsed.baseClassFqcn, referenceDbo, options);
  if (!candidates.length) {
    return null;
  }

  var targetLogicalKey = C8O.dbo._normalizePropertyLookupKey(parsed.logicalId);
  for (var i = 0; i < candidates.length; i++) {
    var logicalKey = C8O.dbo._normalizePropertyLookupKey(candidates[i].logicalId);
    if (logicalKey === targetLogicalKey) {
      return candidates[i];
    }
  }
  return null;
};

C8O.dbo._listNgxComponentsByBaseClass = function (baseClassFqcn, referenceDbo, options) {
  options = options || {};
  var baseClass = C8O.util.toTrimmedString ? C8O.util.toTrimmedString(baseClassFqcn || "") : String(baseClassFqcn || "").trim();
  if (!baseClass.length || !C8O.dbo._isNgxClassFqcn(baseClass)) {
    return [];
  }

  var managers = C8O.dbo._collectNgxComponentManagers(referenceDbo);
  if (!managers || !managers.length) {
    return [];
  }

  var matches = [];
  var dedupe = {};
  for (var m = 0; m < managers.length; m++) {
    var manager = managers[m];
    if (!manager) {
      continue;
    }
    try {
      if (typeof manager.reloadComponents === "function") {
        manager.reloadComponents();
      }
    } catch (_ignoreReload) {}

    var components = null;
    try {
      components = manager.getComponentsByGroup();
    } catch (_ignoreComponents) {
      components = null;
    }
    if (!components) {
      continue;
    }

    for (var i = 0; i < components.size(); i++) {
      var component = components.get(i);
      if (!component) {
        continue;
      }

      if (options.requireAllowedInParent === true && referenceDbo) {
        var allowed = false;
        try {
          allowed = component.isAllowedIn(referenceDbo) === true;
        } catch (_ignoreAllowed) {
          allowed = false;
        }
        if (!allowed) {
          continue;
        }
      }

      var sampleDbo = null;
      try {
        sampleDbo = manager.createBean(component);
      } catch (_ignoreCreateBean) {
        sampleDbo = null;
      }
      if (!sampleDbo) {
        continue;
      }

      var candidateClassName = "";
      try {
        candidateClassName = String(sampleDbo.getClass().getName() || "");
      } catch (_ignoreCandidateClassName) {
        candidateClassName = "";
      }
      if (!candidateClassName.length || candidateClassName !== baseClass) {
        continue;
      }

      var logicalId = C8O.dbo.getNgxComponentLogicalId(component, sampleDbo);
      if (!logicalId.length) {
        continue;
      }
      var logicalKey = C8O.dbo._normalizePropertyLookupKey(logicalId);
      if (!logicalKey.length) {
        continue;
      }
      var dedupeKey = candidateClassName + "#" + logicalKey;
      if (dedupe[dedupeKey]) {
        continue;
      }
      dedupe[dedupeKey] = true;

      matches.push({
        manager: manager,
        component: component,
        sampleDbo: sampleDbo,
        baseClassFqcn: candidateClassName,
        logicalId: logicalId,
        logicalClassName: C8O.dbo.buildLogicalClassName(candidateClassName, logicalId)
      });
    }
  }

  return matches;
};

C8O.dbo._formatNgxCandidates = function (candidates, maxItems) {
  if (!candidates || !candidates.length) {
    return "";
  }
  var limit = maxItems > 0 ? maxItems : 8;
  var labels = [];
  for (var i = 0; i < candidates.length && i < limit; i++) {
    var candidate = candidates[i];
    if (!candidate || !candidate.logicalClassName) {
      continue;
    }
    labels.push(String(candidate.logicalClassName));
  }
  if (candidates.length > limit) {
    labels.push("+" + String(candidates.length - limit) + " more");
  }
  return labels.join(", ");
};

C8O.dbo.findNgxComponentByLogicalClass = function (classNameWithLogicalId, referenceDbo, options) {
  options = options || {};
  var parsed = C8O.dbo.parseLogicalClassToken(classNameWithLogicalId || "");
  if (!parsed.baseClassFqcn.length || !parsed.hasLogicalId || !C8O.dbo._isNgxClassFqcn(parsed.baseClassFqcn)) {
    return null;
  }

  var candidates = C8O.dbo._listNgxComponentsByBaseClass(parsed.baseClassFqcn, referenceDbo, options);
  if (!candidates.length) {
    return null;
  }

  var targetLogicalKey = C8O.dbo._normalizePropertyLookupKey(parsed.logicalId);
  for (var i = 0; i < candidates.length; i++) {
    var logicalKey = C8O.dbo._normalizePropertyLookupKey(candidates[i].logicalId);
    if (logicalKey === targetLogicalKey) {
      return candidates[i];
    }
  }
  return null;
};

C8O.dbo.instantiateForCreate = function (className, parentDbo, updates) {
  var parsed = C8O.dbo.parseLogicalClassToken(className || "");
  var baseClassFqcn = parsed.baseClassFqcn;

  if (C8O.dbo._isNgxParent(parentDbo) && C8O.dbo._isNgxClassFqcn(baseClassFqcn)) {
    var candidates = C8O.dbo._listNgxCreateCandidatesByBaseClass(baseClassFqcn, parentDbo, { requireAllowedInParent: true });

    if (parsed.hasLogicalId) {
      var resolved = C8O.dbo._findNgxCreateCandidateByLogicalClass(className, parentDbo, { requireAllowedInParent: true });
      var resolvedDbo = C8O.dbo._instantiateNgxPaletteCandidate(resolved);
      if (!resolved || !resolvedDbo) {
        C8O.dbo.clearNgxCreateCandidateCache();
        candidates = C8O.dbo._listNgxCreateCandidatesByBaseClass(baseClassFqcn, parentDbo, { requireAllowedInParent: true });
        resolved = C8O.dbo._findNgxCreateCandidateByLogicalClass(className, parentDbo, { requireAllowedInParent: true });
        resolvedDbo = C8O.dbo._instantiateNgxPaletteCandidate(resolved);
      }
      if (!resolved || !resolvedDbo) {
        var hints = C8O.dbo._formatNgxCandidates(candidates, 8);
        if (hints.length) {
          throw new Error("Unable to resolve NGX palette entry '" + className + "' for the current parent. Candidates: " + hints);
        }
        throw new Error("Unable to resolve NGX palette entry '" + className + "' for the current parent");
      }
      return resolvedDbo;
    }

    if (!candidates.length) {
      throw new Error("Unable to resolve NGX palette entry '" + className + "' for the current parent");
    }
    if (candidates.length > 1) {
      throw new Error(
        "Ambiguous NGX palette entry '" + className + "' for the current parent. " +
        "Use className with '#<logicalId>'. Candidates: " + C8O.dbo._formatNgxCandidates(candidates, 8)
      );
    }
    var singleDbo = C8O.dbo._instantiateNgxPaletteCandidate(candidates[0]);
    if (!singleDbo) {
      C8O.dbo.clearNgxCreateCandidateCache();
      candidates = C8O.dbo._listNgxCreateCandidatesByBaseClass(baseClassFqcn, parentDbo, { requireAllowedInParent: true });
      if (!candidates.length) {
        throw new Error("Unable to resolve NGX palette entry '" + className + "' for the current parent");
      }
      singleDbo = C8O.dbo._instantiateNgxPaletteCandidate(candidates[0]);
    }
    if (!singleDbo) {
      throw new Error("Unable to instantiate NGX palette entry '" + className + "' for the current parent");
    }
    return singleDbo;
  }

  return C8O.dbo.instantiateClass(baseClassFqcn || className);
};


C8O.dbo.instantiateClass = function (className) {
  var text = C8O.util.toFqcn ? C8O.util.toFqcn(className || "") : (C8O.util.toTrimmedString ? C8O.util.toTrimmedString(className || "") : String(className || ""));
  if (!text.length) {
    return null;
  }
  try {
    var targetClass = Packages.java.lang.Class.forName(text);
    var constructor = targetClass.getDeclaredConstructor();
    constructor.setAccessible(true);
    return constructor.newInstance();
  } catch (_ignoreInstantiation) {
    return null;
  }
};

C8O.dbo._isXMLizableClass = function (propertyType) {
  if (!propertyType) {
    return false;
  }
  try {
    var xmlizableClass = Packages.com.twinsoft.convertigo.beans.common.XMLizable;
    return xmlizableClass.isAssignableFrom(propertyType);
  } catch (_ignoreXmlizable) {
    try {
      var name = propertyType.getName ? String(propertyType.getName()) : String(propertyType);
      return name === "com.twinsoft.convertigo.beans.common.XMLizable";
    } catch (_ignoreNameXmlizable) {
      return false;
    }
  }
};

C8O.dbo._getBooleanDescriptorFlag = function (descriptor, key) {
  if (!descriptor || !key) {
    return false;
  }
  try {
    var value = descriptor.getValue(key);
    if (typeof value === "boolean") {
      return value;
    }
    if (value instanceof Packages.java.lang.Boolean) {
      return value.booleanValue();
    }
    if (value != null) {
      return /true/i.test(String(value));
    }
  } catch (_ignoreFlag) {}
  return false;
};

C8O.dbo._propertyKindFromType = function (propertyType) {
  if (C8O.dbo._isMobileSmartSourceTypeClass(propertyType)) {
    return "smartType";
  }
  if (C8O.dbo._isSmartTypeClass(propertyType)) {
    return "smartType";
  }
  if (C8O.dbo._isXMLVectorClass(propertyType)) {
    return "xmlVector";
  }
  if (C8O.dbo._isXMLizableClass(propertyType)) {
    return "xmlizable";
  }
  if (!propertyType) {
    return "object";
  }
  try {
    if (propertyType.isEnum && propertyType.isEnum()) {
      return "enum";
    }
  } catch (_ignoreEnum) {}
  var typeName = propertyType.getName ? String(propertyType.getName()) : String(propertyType);
  switch (typeName) {
    case "java.lang.Boolean":
    case "boolean":
      return "boolean";
    case "java.lang.Integer":
    case "java.lang.Long":
    case "java.lang.Double":
    case "java.lang.Float":
    case "int":
    case "long":
    case "double":
    case "float":
      return "number";
    case "java.lang.String":
    case "char":
    case "java.lang.CharSequence":
      return "string";
    default:
      if (typeName.indexOf("java.util.List") === 0 || typeName.indexOf("java.util.Collection") === 0) {
        return "array";
      }
      return "object";
  }
};

C8O.dbo._exampleValueForKind = function (kind, fallback) {
  if (fallback !== null && fallback !== undefined) {
    return fallback;
  }
  switch (kind) {
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "smartType":
      return { mode: "PLAIN", expression: "" };
    case "xmlVector":
    case "array":
      return [];
    default:
      return null;
  }
};

C8O.dbo.describePropertyDescriptor = function (descriptor, sampleInstance) {
  if (!descriptor) {
    return null;
  }
  var name = descriptor.getName ? String(descriptor.getName()) : "";
  if (!name.length || name === "class") {
    return null;
  }
  var propertyType = descriptor.getPropertyType ? descriptor.getPropertyType() : null;
  var readMethod = descriptor.getReadMethod ? descriptor.getReadMethod() : null;
  var writeMethod = descriptor.getWriteMethod ? descriptor.getWriteMethod() : null;
  var defaultValue = null;
  if (sampleInstance && readMethod) {
    try {
      defaultValue = readMethod.invoke(sampleInstance, null);
    } catch (_ignoreRead) {}
  }
  var normalizedValue = C8O.dbo.normalizeValue(descriptor, defaultValue);
  var kind = C8O.dbo._propertyKindFromType(propertyType);
  var exampleValue = C8O.dbo._exampleValueForKind(kind, normalizedValue);
  var description = "";
  try {
    description = descriptor.getShortDescription ? String(descriptor.getShortDescription() || "") : "";
  } catch (_ignoreDesc) {}
  var displayName = "";
  try {
    displayName = descriptor.getDisplayName ? String(descriptor.getDisplayName() || name) : name;
  } catch (_ignoreDisplay) {
    displayName = name;
  }
  return {
    name: name,
    displayName: displayName,
    description: description,
    type: propertyType && propertyType.getName ? String(propertyType.getName()) : "",
    kind: kind,
    hidden: C8O.dbo._getBooleanDescriptorFlag(descriptor, "hidden"),
    expert: C8O.dbo._getBooleanDescriptorFlag(descriptor, "expert"),
    scriptable: C8O.dbo._getBooleanDescriptorFlag(descriptor, "scriptable"),
    nillable: C8O.dbo._getBooleanDescriptorFlag(descriptor, "nillable"),
    readOnly: writeMethod == null,
    defaultValue: normalizedValue,
    exampleValue: exampleValue
  };
};

C8O.dbo.describeBeanProperties = function (beanInfo) {
  var list = [];
  if (!beanInfo) {
    return list;
  }
  var descriptors = [];
  try {
    descriptors = beanInfo.getPropertyDescriptors();
  } catch (_ignoreDescriptors) {
    descriptors = [];
  }
  var beanDescriptor = null;
  try {
    beanDescriptor = beanInfo.getBeanDescriptor();
  } catch (_ignoreBeanDescriptor) {}
  var sampleInstance = null;
  if (beanDescriptor != null) {
    try {
      var beanClass = beanDescriptor.getBeanClass();
      if (beanClass != null) {
        var constructor = beanClass.getDeclaredConstructor();
        constructor.setAccessible(true);
        sampleInstance = constructor.newInstance();
      }
    } catch (_ignoreInstance) {
      sampleInstance = null;
    }
  }
  for (var i = 0; i < descriptors.length; i++) {
    var hint = C8O.dbo.describePropertyDescriptor(descriptors[i], sampleInstance);
    if (hint) {
      list.push(hint);
    }
  }
  return list;
};

C8O.dbo._buildDynamicPropertyHint = function (dynamicMeta, ionBean) {
  if (!dynamicMeta || !dynamicMeta.name) {
    return null;
  }
  var rawValue = null;
  try {
    if (ionBean && typeof ionBean.getPropertyValue === "function") {
      rawValue = ionBean.getPropertyValue(dynamicMeta.name);
    }
  } catch (_ignoreRawValue) {
    rawValue = null;
  }
  var normalizedValue = C8O.dbo.normalizeValue ? C8O.dbo.normalizeValue(null, rawValue) : rawValue;
  if (dynamicMeta.hasNotSetSentinel === true && C8O.dbo._isNotSetSentinelValue(normalizedValue)) {
    normalizedValue = null;
  }
  return {
    name: dynamicMeta.name,
    displayName: dynamicMeta.label || dynamicMeta.name,
    description: "",
    type: "com.twinsoft.convertigo.beans.ngx.components.MobileSmartSourceType",
    kind: "smartType",
    hidden: false,
    expert: false,
    scriptable: true,
    nillable: false,
    readOnly: false,
    defaultValue: normalizedValue,
    exampleValue: C8O.dbo._exampleValueForKind ? C8O.dbo._exampleValueForKind("smartType", normalizedValue) : normalizedValue
  };
};

C8O.dbo.describeDatabaseObjectProperties = function (dbo) {
  var list = [];
  if (!dbo) {
    return list;
  }

  var descriptors = [];
  try {
    var CachedIntrospector = Packages.com.twinsoft.convertigo.engine.util.CachedIntrospector;
    var beanInfo = CachedIntrospector.getBeanInfo(dbo.getClass());
    descriptors = beanInfo && beanInfo.getPropertyDescriptors ? beanInfo.getPropertyDescriptors() : [];
  } catch (_ignoreCachedIntrospector) {
    try {
      var Introspector = Packages.java.beans.Introspector;
      var fallbackInfo = Introspector.getBeanInfo(dbo.getClass());
      descriptors = fallbackInfo && fallbackInfo.getPropertyDescriptors ? fallbackInfo.getPropertyDescriptors() : [];
    } catch (_ignoreIntrospector) {
      descriptors = [];
    }
  }

  var dynamicContext = C8O.dbo._getDynamicPropertyContext(dbo);
  var consumed = {};
  for (var i = 0; i < descriptors.length; i++) {
    var hint = C8O.dbo.describePropertyDescriptor(descriptors[i], dbo);
    if (!hint) {
      continue;
    }
    var normalizedName = C8O.dbo._normalizePropertyLookupKey(hint.name);
    if (normalizedName === "beandata" && dynamicContext) {
      continue;
    }
    if (dynamicContext && dynamicContext.byLookup && normalizedName.length) {
      var resolvedName = dynamicContext.byLookup[normalizedName];
      if (resolvedName && dynamicContext.byName && dynamicContext.byName[resolvedName]) {
        var dynamicHint = C8O.dbo._buildDynamicPropertyHint(dynamicContext.byName[resolvedName], dynamicContext.ionBean);
        if (dynamicHint) {
          list.push(dynamicHint);
          consumed[C8O.dbo._normalizePropertyLookupKey(dynamicHint.name)] = true;
          continue;
        }
      }
    }
    list.push(hint);
    if (normalizedName.length) {
      consumed[normalizedName] = true;
    }
  }

  if (dynamicContext && dynamicContext.byName) {
    var dynamicNames = Object.keys(dynamicContext.byName);
    for (var j = 0; j < dynamicNames.length; j++) {
      var dynamicName = dynamicNames[j];
      var dynamicMeta = dynamicContext.byName[dynamicName];
      var key = C8O.dbo._normalizePropertyLookupKey(dynamicMeta && dynamicMeta.name ? dynamicMeta.name : dynamicName);
      if (!key.length || consumed[key]) {
        continue;
      }
      var extraHint = C8O.dbo._buildDynamicPropertyHint(dynamicMeta, dynamicContext.ionBean);
      if (!extraHint) {
        continue;
      }
      list.push(extraHint);
      consumed[key] = true;
    }
  }

  return list;
};

C8O.dbo.countVisibleProperties = function (dbo) {
  if (!dbo) {
    return 0;
  }
  var hints = C8O.dbo.describeDatabaseObjectProperties(dbo);
  var count = 0;
  for (var i = 0; i < hints.length; i++) {
    if (hints[i] && hints[i].hidden !== true) {
      count++;
    }
  }
  return count;
};

C8O.dbo.safeQName = function (dbo) {
  return C8O.dbo._safeQName ? C8O.dbo._safeQName(dbo) : "";
};

C8O.dbo.safeFullQName = function (dbo) {
  return C8O.dbo._safeFullQName ? C8O.dbo._safeFullQName(dbo) : "";
};

C8O.dbo.safeName = function (dbo) {
  if (!dbo) {
    return "";
  }
  try {
    if (dbo.getName) {
      return String(dbo.getName());
    }
  } catch (_ignoreName) {}
  return "";
};

C8O.dbo.safePriority = function (dbo) {
  if (!dbo) {
    return "";
  }
  try {
    if (dbo.priority !== undefined && dbo.priority !== null) {
      return String(dbo.priority);
    }
  } catch (_ignorePriority) {}
  return "";
};

C8O.dbo.getDirectChildren = function (parentDbo) {
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
};

C8O.dbo.logicalClassNameForDbo = function (dbo) {
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
};

C8O.dbo._stablePropertyValue = function (value) {
  if (value === null || value === undefined) {
    return "null";
  }
  var kind = typeof value;
  if (kind === "string") {
    return "s:" + value;
  }
  if (kind === "number") {
    return "n:" + String(value);
  }
  if (kind === "boolean") {
    return "b:" + String(value);
  }
  try {
    return "j:" + JSON.stringify(value);
  } catch (_ignoreStringify) {
    return "x:" + String(value);
  }
};

C8O.dbo.valuesEqual = function (left, right) {
  if (left === right) {
    return true;
  }
  return C8O.dbo._stablePropertyValue(left) === C8O.dbo._stablePropertyValue(right);
};

C8O.dbo.getDefaultPropertiesMap = function (dbo, options) {
  var includeReadOnly = options && options.includeReadOnly === true;
  var reservedKeys = { name: true, qname: true, priority: true, classname: true };
  var map = {};
  if (!dbo) {
    return map;
  }
  var hints = [];
  try {
    var CachedIntrospector = Packages.com.twinsoft.convertigo.engine.util.CachedIntrospector;
    var beanInfo = CachedIntrospector.getBeanInfo(dbo.getClass());
    hints = C8O.dbo.describeBeanProperties ? C8O.dbo.describeBeanProperties(beanInfo) : [];
  } catch (_ignoreCachedIntrospector) {
    try {
      var Introspector = Packages.java.beans.Introspector;
      var fallbackInfo = Introspector.getBeanInfo(dbo.getClass());
      hints = C8O.dbo.describeBeanProperties ? C8O.dbo.describeBeanProperties(fallbackInfo) : [];
    } catch (_ignoreIntrospector) {
      hints = [];
    }
  }

  var dynamicContext = C8O.dbo._getDynamicPropertyContext ? C8O.dbo._getDynamicPropertyContext(dbo) : null;
  for (var i = 0; i < hints.length; i++) {
    var hint = hints[i];
    if (!hint || !hint.name) {
      continue;
    }
    if (hint.hidden === true) {
      continue;
    }
    var normalizedName = C8O.dbo._normalizePropertyLookupKey ? C8O.dbo._normalizePropertyLookupKey(hint.name) : String(hint.name).toLowerCase();
    if (reservedKeys[normalizedName]) {
      continue;
    }
    if (dynamicContext && normalizedName === "beandata") {
      continue;
    }
    if (!includeReadOnly && hint.readOnly === true) {
      continue;
    }
    map[String(hint.name)] = hint.defaultValue;
  }
  return map;
};

C8O.dbo.getCurrentPropertiesMap = function (dbo, options) {
  var NativeJavaObject = Packages.org.mozilla.javascript.NativeJavaObject;
  var includeReadOnly = options && options.includeReadOnly === true;
  var reservedKeys = { name: true, qname: true, priority: true, classname: true };
  var map = {};
  if (!dbo) {
    return map;
  }

  var descriptorMap = C8O.dbo._getDescriptorMap ? C8O.dbo._getDescriptorMap(dbo) : {};
  var dynamicContext = C8O.dbo._getDynamicPropertyContext ? C8O.dbo._getDynamicPropertyContext(dbo) : null;
  var consumedDynamic = {};

  var descriptorNames = Object.keys(descriptorMap || {});
  descriptorNames.sort();
  for (var i = 0; i < descriptorNames.length; i++) {
    var descriptorName = descriptorNames[i];
    if (!descriptorName || descriptorName === "class") {
      continue;
    }

    var pd = descriptorMap[descriptorName];
    if (!pd) {
      continue;
    }
    var getter = pd.getReadMethod ? pd.getReadMethod() : null;
    if (!getter) {
      continue;
    }
    var setter = pd.getWriteMethod ? pd.getWriteMethod() : null;
    var readOnly = setter == null;
    if (readOnly && !includeReadOnly) {
      continue;
    }

    var normalizedName = C8O.dbo._normalizePropertyLookupKey ? C8O.dbo._normalizePropertyLookupKey(descriptorName) : String(descriptorName).toLowerCase();
    if (reservedKeys[normalizedName]) {
      continue;
    }
    if (dynamicContext && normalizedName === "beandata") {
      continue;
    }

    if (dynamicContext && dynamicContext.byLookup && normalizedName.length) {
      var resolvedName = dynamicContext.byLookup[normalizedName];
      if (resolvedName && dynamicContext.byName && dynamicContext.byName[resolvedName]) {
        var dynamicMeta = dynamicContext.byName[resolvedName];
        var rawDynamic = null;
        try {
          rawDynamic = dynamicContext.ionBean.getPropertyValue(dynamicMeta.name);
          if (rawDynamic instanceof NativeJavaObject) {
            rawDynamic = rawDynamic.unwrap();
          }
        } catch (_ignoreDynamicRead) {
          rawDynamic = null;
        }
        var normalizedDynamic = C8O.dbo.normalizeValue ? C8O.dbo.normalizeValue(null, rawDynamic) : rawDynamic;
        if (dynamicMeta.hasNotSetSentinel === true && C8O.dbo._isNotSetSentinelValue(normalizedDynamic)) {
          normalizedDynamic = null;
        }
        map[String(dynamicMeta.name)] = normalizedDynamic;
        consumedDynamic[String(dynamicMeta.name)] = true;
        continue;
      }
    }

    var rawValue = null;
    try {
      rawValue = getter.invoke(dbo, null);
      if (rawValue instanceof NativeJavaObject) {
        rawValue = rawValue.unwrap();
      }
    } catch (_ignoreReadValue) {
      rawValue = null;
    }
    map[String(descriptorName)] = C8O.dbo.normalizeValue ? C8O.dbo.normalizeValue(pd, rawValue) : rawValue;
  }

  if (dynamicContext && dynamicContext.byName) {
    var dynamicNames = Object.keys(dynamicContext.byName);
    dynamicNames.sort();
    for (var j = 0; j < dynamicNames.length; j++) {
      var dynamicName = dynamicNames[j];
      if (!dynamicName || consumedDynamic[dynamicName]) {
        continue;
      }
      var dynamicMetaExtra = dynamicContext.byName[dynamicName];
      if (!dynamicMetaExtra) {
        continue;
      }
      var rawDynamicExtra = null;
      try {
        rawDynamicExtra = dynamicContext.ionBean.getPropertyValue(dynamicMetaExtra.name);
        if (rawDynamicExtra instanceof NativeJavaObject) {
          rawDynamicExtra = rawDynamicExtra.unwrap();
        }
      } catch (_ignoreDynamicExtraRead) {
        rawDynamicExtra = null;
      }
      var normalizedExtra = C8O.dbo.normalizeValue ? C8O.dbo.normalizeValue(null, rawDynamicExtra) : rawDynamicExtra;
      if (dynamicMetaExtra.hasNotSetSentinel === true && C8O.dbo._isNotSetSentinelValue(normalizedExtra)) {
        normalizedExtra = null;
      }
      map[String(dynamicMetaExtra.name)] = normalizedExtra;
    }
  }

  return map;
};

C8O.dbo.getCanonicalPropertiesMap = function (dbo, propertyMode, options) {
  var mode = C8O.util.toTrimmedString ? C8O.util.toTrimmedString(propertyMode || "changed").toLowerCase() : String(propertyMode || "changed").toLowerCase();
  if (mode !== "none" && mode !== "all" && mode !== "changed") {
    mode = "changed";
  }
  if (mode === "none") {
    return {};
  }

  var current = C8O.dbo.getCurrentPropertiesMap(dbo, options);
  if (mode === "all") {
    return current;
  }

  var defaults = C8O.dbo.getDefaultPropertiesMap(dbo, options);
  var changed = {};
  var names = Object.keys(current || {});
  names.sort();
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    if (!Object.prototype.hasOwnProperty.call(defaults, name)) {
      changed[name] = current[name];
      continue;
    }
    if (!C8O.dbo.valuesEqual(current[name], defaults[name])) {
      changed[name] = current[name];
    }
  }
  return changed;
};
