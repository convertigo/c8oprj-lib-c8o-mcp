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
// Classname helpers: Convertigo beans live under com.twinsoft.convertigo.beans.*
var _BEANS_PREFIX = "com.twinsoft.convertigo.beans.";
C8O.util.toFqcn = C8O.util.toFqcn || function (name) {
  var text = C8O.util.toTrimmedString ? C8O.util.toTrimmedString(name || "") : String(name || "");
  if (!text.length) {
    return text;
  }
  return text.indexOf("com.") === 0 ? text : _BEANS_PREFIX + text;
};
C8O.util.fromFqcn = C8O.util.fromFqcn || function (name) {
  var text = C8O.util.toTrimmedString ? C8O.util.toTrimmedString(name || "") : String(name || "");
  if (!text.length) {
    return text;
  }
  return text.indexOf(_BEANS_PREFIX) === 0 ? text.substring(_BEANS_PREFIX.length) : text;
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
  'The first element is the numeric priority of the step exposing the XML (for example an InputVariablesStep), ' +
  'the second element is the XPath to the desired node (for example ./email/text()). ' +
  'Do not reference requestable variable names or QNames directly, and never merge both values into a single string (e.g., no "123,./text()").';

var SMART_TYPE_VALUE_HINT =
  'SmartType values are JSON objects like {"mode":"PLAIN","expression":"text"}. ' +
  'Use "mode":"JS" with "expression":"<javascript>" for evaluated expressions, or "mode":"SOURCE" with a ' +
  '"sources":[["<stepPriority>","<xpath>"]] array to pull data from another step.';

var MULTI_SOURCES_HINT =
  'sourcesDefinition expects an array of entries, each entry providing a label, a SmartType source (same ["<stepPriority>", "<xpath>"] structure), and an optional fallback value. ' +
  'Build it as a JSON array of objects such as { description: "optional", source: ["1234567890", "./text()"], defaultValue: "" } so the picker-style data is preserved.';

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
        ". Call tools_databaseobject_children with qname \"" +
        ancestorQName +
        "\" to enumerate its children."
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
 * Parses a JSON payload expected to be an object. Returns an empty object when invalid.
 */
C8O.dbo.parsePropertyUpdates = function (text, errors) {
  var trimmed = C8O.util.toTrimmedString(text);
  if (!trimmed.length) {
    return {};
  }
  var parsed = C8O.util.tryParseJson(trimmed, errors, "properties");
  // If caller provided a JSON string (e.g., "\"{...}\""), try to parse it again.
  if (parsed && typeof parsed === "string") {
    var nested = C8O.util.tryParseJson(parsed, errors, "properties");
    if (nested) {
      parsed = nested;
    }
  }
  if (!parsed) {
    if (errors && errors.push) {
      errors.push({ name: "properties", message: "Properties payload must be a JSON object (use {} when empty, or call palette-describe for a template)." });
    }
    return {};
  }
  if (!C8O.util.isPlainObject(parsed)) {
    if (errors && errors.push) {
      errors.push({ name: "properties", message: "Properties payload must be a JSON object (use {} when empty, or call palette-describe for a template)." });
    }
    return {};
  }
  return parsed;
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

  if (C8O.dbo._isSmartTypeClass(propertyType) || C8O.dbo._isClass('com.twinsoft.convertigo.beans.steps.SmartType', value) || (value != null && value.getClass && String(value.getClass().getName()) === 'com.twinsoft.convertigo.beans.steps.SmartType')) {
    return C8O.dbo._normalizeSmartType(value);
  }

  if (C8O.dbo._isXMLVectorClass(propertyType) || C8O.dbo._isClass('com.twinsoft.convertigo.beans.common.XMLVector', value) || (value != null && value.getClass && String(value.getClass().getName()) === 'com.twinsoft.convertigo.beans.common.XMLVector')) {
    return C8O.dbo._normalizeXMLVector(value);
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
  var applied = [];
  var skipped = [];
  var errors = [];

  if (!updates || typeof updates !== "object") {
    return { applied: applied, skipped: skipped, errors: errors };
  }

  var propertyNames = Object.keys(updates);
  for (var i = 0; i < propertyNames.length; i++) {
    var name = propertyNames[i];
    var pd = descriptorMap[name];
    if (!pd) {
      skipped.push({ name: name, reason: "Unknown property" });
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

    var rawSpec = updates[name];
    var applyNull = (rawSpec === null || rawSpec === undefined || (rawSpec && rawSpec.__isNull === true));
    var propertyType = pd.getPropertyType();

    try {
      if (applyNull) {
        setter.invoke(dbo, [null]);
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
      setter.invoke(dbo, [compiledValue]);

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

  if (propertyTypeName === "com.twinsoft.convertigo.beans.ngx.components.MobileSmartSourceType") {
    return C8O.dbo._buildMobileSmartSourceType(rawSpec);
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

C8O.dbo.reloadProject = function (projectOrName, errors) {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var name = "";
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
    return { reloaded: false, message: message };
  }
  try {
    Engine.theApp.databaseObjectsManager.getStudioProjects().reloadProject(name);
    return { reloaded: true, message: "" };
  } catch (reloadError) {
    var message = String(reloadError);
    if (errors && errors.push) {
      errors.push({ name: "__reload__", message: message });
    }
    return { reloaded: false, message: message };
  }
};

C8O.dbo.exportProjectIfNeeded = function (project, commitFlag, errors) {
  var result = C8O.dbo.saveProjectIfNeeded(project, commitFlag, errors);
  return { exported: result.saved === true, message: result.message || "" };
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







