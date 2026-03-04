var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
var CachedIntrospector = Packages.com.twinsoft.convertigo.engine.util.CachedIntrospector;
var MySimpleBeanInfo = Packages.com.twinsoft.convertigo.beans.core.MySimpleBeanInfo;
var ITagsProperty = Packages.com.twinsoft.convertigo.beans.core.ITagsProperty;
var EnumUtils = Packages.com.twinsoft.convertigo.engine.util.EnumUtils;
var NativeJavaObject = Packages.org.mozilla.javascript.NativeJavaObject;

var includeRawXml = false;
var includeHintsFlag = false;
try {
  includeHintsFlag = C8O.util.toBoolean(includeHints, false) === true;
} catch (_ignoreIncludeHints) {
  includeHintsFlag = String(includeHints || "").toLowerCase() === "true";
}

if (!qname || String(qname).trim().length === 0) {
  throw new Error("qname is required");
}

qname = String(qname);
var dbo = C8O.dbo.resolve(qname, { messagePrefix: "" });
if (dbo && dbo.getQName) {
  qname = String(dbo.getQName());
}

function toLowerKey(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim().toLowerCase();
}

function parseIncludeMap(rawValue) {
  var includeSelectorText = rawValue ? String(rawValue).trim() : "";
  if (!includeSelectorText.length) {
    return null;
  }
  var includeMap = {};
  try {
    var parsedFilter = JSON.parse(includeSelectorText);
    if (Array.isArray(parsedFilter)) {
      for (var fi = 0; fi < parsedFilter.length; fi++) {
        var key = String(parsedFilter[fi]).trim();
        if (key.length) {
          includeMap[key.toLowerCase()] = true;
        }
      }
    } else if (typeof parsedFilter === "string") {
      var parsedKey = parsedFilter.trim();
      if (parsedKey.length) {
        includeMap[parsedKey.toLowerCase()] = true;
      }
    }
  } catch (_ignoreFilter) {
    var parts = includeSelectorText.split(",");
    for (var pi = 0; pi < parts.length; pi++) {
      var keyPart = parts[pi].trim();
      if (keyPart.length) {
        includeMap[keyPart.toLowerCase()] = true;
      }
    }
  }
  return Object.keys(includeMap).length ? includeMap : null;
}

function parseFilterText(rawValue) {
  var text = rawValue ? String(rawValue).trim() : "";
  if (!text.length) {
    return { hasFilter: false, text: "" };
  }
  return { hasFilter: true, text: text.toLowerCase() };
}

function parsePagination(limitRaw, cursorRaw) {
  var defaultLimit = 25;
  var maxLimit = 200;
  var limitValue = defaultLimit;
  if (typeof limitRaw !== "undefined" && limitRaw !== null) {
    try {
      var parsedLimit = parseInt(String(limitRaw).trim(), 10);
      if (!isNaN(parsedLimit)) {
        limitValue = parsedLimit;
      }
    } catch (_ignoreLimit) {}
  }
  if (limitValue < 1) {
    limitValue = defaultLimit;
  }
  if (limitValue > maxLimit) {
    limitValue = maxLimit;
  }

  var cursorText = typeof cursorRaw === "undefined" || cursorRaw == null ? "" : String(cursorRaw).trim();
  var startIndex = 0;
  if (cursorText.length > 0) {
    try {
      var parsedCursor = parseInt(cursorText, 10);
      if (!isNaN(parsedCursor) && parsedCursor >= 0) {
        startIndex = parsedCursor;
      }
    } catch (_ignoreCursor) {}
  }

  return {
    limit: limitValue,
    cursorInput: cursorText,
    startIndex: startIndex
  };
}

function cloneJson(value) {
  if (value === null || value === undefined) {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_ignoreClone) {
    return value;
  }
}

function normalizeFriendlyValue(pd, value) {
  var friendly = C8O.dbo.normalizeValue(pd, value);
  var valueKind = "null";

  if (friendly === null || friendly === undefined) {
    return { value: null, valueKind: "null" };
  }
  if (typeof friendly === "string") {
    return { value: friendly, valueKind: "string" };
  }
  if (typeof friendly === "number") {
    return { value: Number(friendly), valueKind: "number" };
  }
  if (typeof friendly === "boolean") {
    return { value: friendly, valueKind: "boolean" };
  }
  if (Array.isArray(friendly)) {
    return { value: cloneJson(friendly), valueKind: "array" };
  }
  if (typeof friendly === "object") {
    if (friendly && friendly.mode !== undefined) {
      valueKind = "smartType";
    } else {
      valueKind = "object";
    }
    return { value: cloneJson(friendly), valueKind: valueKind };
  }
  return { value: String(friendly), valueKind: "string" };
}

function toJsArray(javaArrayLike) {
  var list = [];
  if (!javaArrayLike) {
    return list;
  }
  try {
    for (var i = 0; i < javaArrayLike.length; i++) {
      list.push(javaArrayLike[i]);
    }
    return list;
  } catch (_ignoreLength) {}
  try {
    var iterator = javaArrayLike.iterator();
    while (iterator.hasNext()) {
      list.push(iterator.next());
    }
  } catch (_ignoreIterator) {}
  return list;
}

function buildDynamicOptionInfo(ionProperty) {
  var values = [];
  try {
    values = toJsArray(ionProperty.getValues());
  } catch (_ignoreValues) {
    values = [];
  }

  var options = [];
  var hasNotSetSentinel = false;
  var isEditable = false;

  if (values.length) {
    var lastValue = values[values.length - 1];
    try {
      isEditable = java.lang.Boolean.TRUE.equals(lastValue);
    } catch (_ignoreEditable) {
      isEditable = false;
    }
    if (!isEditable) {
      try {
        isEditable = String(lastValue).toLowerCase() === "true";
      } catch (_ignoreEditableText) {}
    }

    var size = isEditable ? values.length - 1 : values.length;
    for (var i = 0; i < size; i++) {
      var optionValue = values[i];
      var isNotSet = false;
      try {
        isNotSet = optionValue === false || java.lang.Boolean.FALSE.equals(optionValue);
      } catch (_ignoreNotSet) {
        isNotSet = optionValue === false;
      }
      if (isNotSet) {
        hasNotSetSentinel = true;
        options.push("not set");
      } else {
        options.push(String(optionValue));
      }
    }
  }

  return {
    values: values,
    options: options,
    hasNotSetSentinel: hasNotSetSentinel,
    isEditable: isEditable
  };
}

function getIonBeanMetadata(targetDbo) {
  var ionBean = null;
  try {
    if (targetDbo && typeof targetDbo.getIonBean === "function") {
      ionBean = targetDbo.getIonBean();
    }
  } catch (_ignoreIonBean) {
    ionBean = null;
  }
  if (!ionBean) {
    return null;
  }

  var byName = {};
  var orderedKeys = [];
  var propertiesMap = null;
  try {
    propertiesMap = ionBean.getProperties();
  } catch (_ignorePropertiesMap) {
    propertiesMap = null;
  }
  if (!propertiesMap) {
    return {
      ionBean: ionBean,
      byName: byName,
      orderedKeys: orderedKeys
    };
  }

  try {
    var valuesIterator = propertiesMap.values().iterator();
    while (valuesIterator.hasNext()) {
      var ionProperty = valuesIterator.next();
      if (!ionProperty) {
        continue;
      }

      var hidden = false;
      try {
        hidden = ionProperty.isHidden() === true;
      } catch (_ignoreHidden) {
        hidden = false;
      }
      if (hidden) {
        continue;
      }

      var propertyName = "";
      try {
        propertyName = String(ionProperty.getName());
      } catch (_ignorePropertyName) {
        propertyName = "";
      }
      if (!propertyName.length) {
        continue;
      }

      var optionInfo = buildDynamicOptionInfo(ionProperty);
      var editor = "";
      try {
        editor = String(ionProperty.getEditor() || "");
      } catch (_ignoreEditor) {
        editor = "";
      }
      var label = propertyName;
      try {
        label = String(ionProperty.getLabel() || propertyName);
      } catch (_ignoreLabel) {
        label = propertyName;
      }
      var description = "";
      try {
        description = String(ionProperty.getDescription() || "");
      } catch (_ignoreDescription) {
        description = "";
      }
      var category = "";
      try {
        category = String(ionProperty.getCategory() || "");
      } catch (_ignoreCategory) {
        category = "";
      }

      var readOnly = false;
      if (editor.length === 0) {
        if (optionInfo.values.length === 1) {
          readOnly = true;
        } else if (optionInfo.values.length > 1) {
          readOnly = !optionInfo.isEditable;
        }
      }

      var key = propertyName.toLowerCase();
      byName[key] = {
        name: propertyName,
        title: label,
        description: description,
        category: category,
        editor: editor,
        readOnly: readOnly,
        options: optionInfo.options,
        hasNotSetSentinel: optionInfo.hasNotSetSentinel,
        scriptable: true,
        multiline: false,
        type: "com.twinsoft.convertigo.beans.ngx.components.MobileSmartSourceType"
      };
      orderedKeys.push(key);
    }
  } catch (_ignoreValuesIterator) {}

  return {
    ionBean: ionBean,
    byName: byName,
    orderedKeys: orderedKeys
  };
}

function shouldKeepByFilter(entry, hasFilter, filterText) {
  if (!hasFilter) {
    return true;
  }

  var haystacks = [entry.name, entry.title, entry.description, entry.type, entry.category];
  for (var h = 0; h < haystacks.length; h++) {
    var hayValue = haystacks[h];
    if (hayValue && String(hayValue).toLowerCase().indexOf(filterText) !== -1) {
      return true;
    }
  }

  if (entry.options && entry.options.length) {
    for (var o = 0; o < entry.options.length; o++) {
      var option = entry.options[o];
      if (option && String(option).toLowerCase().indexOf(filterText) !== -1) {
        return true;
      }
    }
  }

  if (entry.valueKind === "string" && entry.value) {
    return String(entry.value).toLowerCase().indexOf(filterText) !== -1;
  }

  if (entry.valueKind === "array" || entry.valueKind === "object" || entry.valueKind === "smartType") {
    try {
      return JSON.stringify(entry.value).toLowerCase().indexOf(filterText) !== -1;
    } catch (_ignoreStringifyFilter) {}
  }

  return false;
}

function buildDynamicEntry(dynamicMeta, ionBean, includeHintsFlag) {
  var entry = {
    name: dynamicMeta.name,
    title: dynamicMeta.title,
    description: dynamicMeta.description,
    category: dynamicMeta.category,
    type: dynamicMeta.type,
    expert: false,
    multiline: dynamicMeta.multiline === true,
    scriptable: dynamicMeta.scriptable === true,
    readOnly: dynamicMeta.readOnly === true,
    valueXml: null,
    valueXmlError: null,
    nillable: false,
    isNull: false
  };

  var rawValue = null;
  try {
    rawValue = ionBean.getPropertyValue(dynamicMeta.name);
  } catch (_ignoreGetDynamicValue) {
    rawValue = null;
  }
  if (rawValue instanceof NativeJavaObject) {
    rawValue = rawValue.unwrap();
  }

  var normalized = normalizeFriendlyValue(null, rawValue);
  if (dynamicMeta.hasNotSetSentinel === true) {
    if (normalized.value === false || normalized.value === "false") {
      normalized.value = null;
      normalized.valueKind = "null";
    }
  }

  entry.value = normalized.value;
  entry.valueKind = normalized.valueKind;

  entry.options = includeHintsFlag && dynamicMeta.options && dynamicMeta.options.length
    ? cloneJson(dynamicMeta.options)
    : null;

  return entry;
}

var includeMap = parseIncludeMap(properties);
var filterState = parseFilterText(filter);
var pagination = parsePagination(limit, _nextCursor);

var beanInfo = CachedIntrospector.getBeanInfo(dbo.getClass());
var descriptors = beanInfo.getPropertyDescriptors();

var ionMetadata = getIonBeanMetadata(dbo);
var ionBean = ionMetadata ? ionMetadata.ionBean : null;
var ionMetaMap = ionMetadata ? ionMetadata.byName : {};
var ionOrder = ionMetadata ? ionMetadata.orderedKeys : [];
var consumedDynamic = {};

var propertiesEntries = [];

for (var i = 0; i < descriptors.length; i++) {
  var pd = descriptors[i];
  var getter = pd.getReadMethod();
  if (getter == null) {
    continue;
  }

  var name = String(pd.getName());
  if (name === "class") {
    continue;
  }

  var keyLower = toLowerKey(name);

  // Hide internal dynamic payload from MCP output for NGX dynamic beans.
  if (ionBean != null && keyLower === "beandata") {
    continue;
  }

  if (includeMap && !includeMap[keyLower]) {
    continue;
  }

  var dynamicMeta = ionMetaMap[keyLower] || null;
  if (dynamicMeta != null) {
    var dynamicEntry = buildDynamicEntry(dynamicMeta, ionBean, includeHintsFlag);
    consumedDynamic[keyLower] = true;
    if (!shouldKeepByFilter(dynamicEntry, filterState.hasFilter, filterState.text)) {
      continue;
    }
    propertiesEntries.push(dynamicEntry);
    continue;
  }

  var setter = pd.getWriteMethod();
  var readOnly = setter == null;
  if (readOnly && includeMap == null) {
    continue;
  }

  var entry = {
    name: name,
    title: pd.getDisplayName() != null ? String(pd.getDisplayName()) : name,
    description: pd.getShortDescription() != null ? String(pd.getShortDescription()) : "",
    category: "",
    expert: Boolean(pd.isExpert()),
    multiline: Boolean(java.lang.Boolean.TRUE.equals(pd.getValue(MySimpleBeanInfo.MULTILINE))),
    scriptable: Boolean(java.lang.Boolean.TRUE.equals(pd.getValue(MySimpleBeanInfo.SCRIPTABLE))),
    readOnly: readOnly,
    valueXml: null,
    valueXmlError: null
  };

  var propertyType = pd.getPropertyType();
  entry.type = propertyType != null ? String(propertyType.getName()) : "";

  var value = null;
  try {
    value = getter.invoke(dbo, null);
  } catch (_ignoreValue) {
    value = null;
  }
  if (value instanceof NativeJavaObject) {
    value = value.unwrap();
  }

  var normalizedEntryValue = normalizeFriendlyValue(pd, value);
  entry.value = normalizedEntryValue.value;
  entry.valueKind = normalizedEntryValue.valueKind;

  if (includeRawXml) {
    try {
      entry.valueXml = C8O.xml.serialize(value);
    } catch (serializeError) {
      entry.valueXml = null;
      entry.valueXmlError = String(serializeError);
    }
  }

  var possibleValues = [];
  if (dbo instanceof ITagsProperty) {
    try {
      var tags = dbo.getTagsForProperty(name);
      if (tags != null) {
        for (var t = 0; t < tags.length; t++) {
          possibleValues.push(String(tags[t]));
        }
      }
    } catch (_ignoreTags) {}
  } else {
    try {
      var editorClass = pd.getPropertyEditorClass();
      if (editorClass != null) {
        var names = EnumUtils.toNames(editorClass);
        if (names != null) {
          for (var n = 0; n < names.length; n++) {
            possibleValues.push(String(names[n]));
          }
        }
      }
    } catch (_ignoreEnum) {}
  }

  entry.options = includeHintsFlag && possibleValues.length ? cloneJson(possibleValues) : null;

  var llmHintKey = "";
  try {
    llmHintKey = dbo.getClass().getName() + "#" + name;
  } catch (_ignoreHintKey) {}
  if (includeHintsFlag && llmHintKey && C8O.dbo && C8O.dbo.LLM_HINTS && C8O.dbo.LLM_HINTS[llmHintKey]) {
    entry.llmHint = String(C8O.dbo.LLM_HINTS[llmHintKey]);
  }

  var nillable = java.lang.Boolean.TRUE.equals(pd.getValue(MySimpleBeanInfo.NILLABLE));
  entry.nillable = Boolean(nillable);
  entry.isNull = false;
  if (nillable) {
    try {
      var isNullMethod = dbo.getClass().getMethod("isNullProperty", [java.lang.String.class]);
      entry.isNull = Boolean(java.lang.Boolean.TRUE.equals(isNullMethod.invoke(dbo, [name])));
    } catch (_ignoreNull) {}
  }

  if (!shouldKeepByFilter(entry, filterState.hasFilter, filterState.text)) {
    continue;
  }

  propertiesEntries.push(entry);
}

// Add dynamic properties not exposed by java bean descriptors.
if (ionBean != null && ionOrder.length) {
  for (var d = 0; d < ionOrder.length; d++) {
    var ionKey = ionOrder[d];
    if (consumedDynamic[ionKey]) {
      continue;
    }

    var dynamicMetaMissing = ionMetaMap[ionKey];
    if (!dynamicMetaMissing) {
      continue;
    }

    if (includeMap && !includeMap[ionKey]) {
      continue;
    }

    var dynamicEntryMissing = buildDynamicEntry(dynamicMetaMissing, ionBean, includeHintsFlag);
    if (!shouldKeepByFilter(dynamicEntryMissing, filterState.hasFilter, filterState.text)) {
      continue;
    }

    propertiesEntries.push(dynamicEntryMissing);
  }
}

var totalMatching = propertiesEntries.length;
var effectiveStart = pagination.startIndex;
if (effectiveStart < 0) {
  effectiveStart = 0;
}
if (effectiveStart > totalMatching) {
  effectiveStart = totalMatching;
}

var endIndex = effectiveStart + pagination.limit;
if (endIndex > totalMatching) {
  endIndex = totalMatching;
}

var pagedProperties = [];
for (var pos = effectiveStart; pos < endIndex; pos++) {
  pagedProperties.push(propertiesEntries[pos]);
}

var returnedCount = pagedProperties.length;
var hasMorePages = endIndex < totalMatching;
var nextCursorValue = hasMorePages ? String(endIndex) : "";

var beanDescriptor = beanInfo.getBeanDescriptor();
propertiesList = pagedProperties;
propertiesCount = totalMatching;
targetClassName = C8O.util.fromFqcn ? C8O.util.fromFqcn(dbo.getClass().getName()) : dbo.getClass().getName();
beanDisplayName = beanDescriptor != null && beanDescriptor.getDisplayName() != null ? String(beanDescriptor.getDisplayName()) : "";
paginationInfo = {
  startIndex: effectiveStart,
  limit: pagination.limit,
  returned: returnedCount,
  hasMore: hasMorePages,
  nextCursor: nextCursorValue,
  cursorInput: pagination.cursorInput
};
nextCursorToken = nextCursorValue;
