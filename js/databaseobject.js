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
C8O.dbo.resolve = function (qname, options) {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var opts = options || {};
  var text = C8O.util.toTrimmedString(qname);
  if (!text.length) {
    throw new Error((opts.messagePrefix || "") + "QName is required");
  }
  try {
    var dbo = Engine.theApp.databaseObjectsManager.getDatabaseObjectByQName(text);
    if (dbo == null && !opts.optional) {
      throw new Error("Database object not found: " + text);
    }
    return dbo;
  } catch (lookupError) {
    if (opts.optional) {
      return null;
    }
    throw lookupError instanceof Error ? lookupError : new Error(String(lookupError));
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
  if (!parsed) {
    return {};
  }
  if (!C8O.util.isPlainObject(parsed)) {
    if (errors && errors.push) {
      errors.push({ name: "properties", message: "Properties payload must be a JSON object" });
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

C8O.dbo.exportProjectIfNeeded = function (project, commitFlag, errors) {
  if (!commitFlag || project == null) {
    return { exported: false, message: "" };
  }
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  try {
    Engine.theApp.databaseObjectsManager.exportProject(project);
    return { exported: true, message: "" };
  } catch (exportError) {
    var message = String(exportError);
    if (errors && errors.push) {
      errors.push({ name: "__export__", message: message });
    }
    return { exported: false, message: message };
  }
};
