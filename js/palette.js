include("js/databaseobject.js");

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.palette = C8O.palette || {};

C8O.palette._describeSummaryCache = {};
C8O.palette._listCountCache = {};

C8O.palette._MAX_TEMPLATE_PROPS = 12;
C8O.palette._MAX_PROPERTY_HINTS = 32;

C8O.palette.suggestTechnicalName = function (label) {
  var raw = C8O.util.toTrimmedString(label || "");
  if (!raw.length) {
    raw = "NewObject";
  }
  raw = raw.replace(/[^A-Za-z0-9]+/g, " ");
  var parts = raw.split(/\s+/).filter(function (part) {
    return part.length > 0;
  });
  if (!parts.length) {
    parts = ["Object"];
  }
  var base = parts[0].toLowerCase();
  for (var i = 1; i < parts.length; i++) {
    var fragment = parts[i];
    base += fragment.charAt(0).toUpperCase() + fragment.slice(1);
  }
  if (!/^[A-Za-z_]/.test(base)) {
    base = "c8o" + base.charAt(0).toUpperCase() + base.slice(1);
  }
  return base;
};

C8O.palette.describePaletteEntry = function (entry) {
  if (!entry || !entry.className) {
    return null;
  }
  var className = String(entry.className);
  var displayName = entry.name || "";
  var beanInfo = entry.beanInfo || null;
  if (!beanInfo) {
    try {
      var beanInfoClass = Packages.java.lang.Class.forName(className + "BeanInfo");
      beanInfo = beanInfoClass.getDeclaredConstructor().newInstance();
    } catch (_ignoreBeanInfo) {}
  }
  return C8O.palette.describeBeanTemplate({
    className: className,
    beanInfo: beanInfo,
    displayName: displayName
  });
};

C8O.palette.describeBeanTemplate = function (options) {
  options = options || {};
  var className = C8O.util.toTrimmedString(options.className || "");
  if (!className.length) {
    return null;
  }
  var beanInfo = options.beanInfo || null;
  var propHints = C8O.dbo.describeBeanProperties(beanInfo);
  if (!propHints.length) {
    return null;
  }
  var visibleHints = [];
  for (var i = 0; i < propHints.length; i++) {
    var hint = propHints[i];
    if (!hint || hint.hidden) {
      continue;
    }
    visibleHints.push(hint);
    if (visibleHints.length >= C8O.palette._MAX_PROPERTY_HINTS) {
      break;
    }
  }
  var templateProps = [];
  var templateCount = 0;
  for (var j = 0; j < visibleHints.length; j++) {
    var entry = visibleHints[j];
    if (entry.readOnly) {
      continue;
    }
    if (entry.exampleValue === null || typeof entry.exampleValue === "undefined") {
      continue;
    }
    templateProps.push({
      name: entry.name,
      kind: entry.kind,
      value: entry.exampleValue
    });
    templateCount++;
    if (templateCount >= C8O.palette._MAX_TEMPLATE_PROPS) {
      break;
    }
  }
  var payloadObject = {};
  for (var p = 0; p < templateProps.length; p++) {
    var prop = templateProps[p];
    if (prop && prop.name && typeof prop.value !== "undefined") {
      payloadObject[prop.name] = prop.value;
    }
  }
  var nameSuggestion = C8O.palette.suggestTechnicalName(options.displayName || className);
  var creationTemplate = {
    related: "<parent QName>",
    mode: "inside",
    className: className,
    name: nameSuggestion,
    properties: templateProps,
    payload: payloadObject,
    payloadJson: (function () {
      try {
        return JSON.stringify({
          related: "<parent QName>",
          mode: "inside",
          className: className,
          name: nameSuggestion,
          properties: payloadObject
        }, null, 2);
      } catch (_ignorePayload) {
        return "";
      }
    })()
  };
  return {
    nameSuggestion: nameSuggestion,
    propertyHints: visibleHints,
    creationTemplate: creationTemplate
  };
};

C8O.palette._getDescribeSummary = function (className, options) {
  className = C8O.util.toTrimmedString(className || "");
  if (!className.length) {
    return null;
  }
  var cache = C8O.palette._describeSummaryCache;
  if (cache.hasOwnProperty(className)) {
    return cache[className];
  }
  var describeData = null;
  try {
    describeData = C8O.palette.describePaletteEntry({
      className: className,
      name: options && options.displayName ? options.displayName : "",
      beanInfo: options && options.beanInfo ? options.beanInfo : null
    });
  } catch (_ignoreSummaryError) {}
  if (!describeData) {
    cache[className] = null;
    return null;
  }
  var propertyHintCount = describeData.propertyHints ? describeData.propertyHints.length : 0;
  var templatePropertyCount = describeData.creationTemplate && describeData.creationTemplate.properties ? describeData.creationTemplate.properties.length : 0;
  var summary = {
    propertyHintCount: propertyHintCount,
    templatePropertyCount: templatePropertyCount,
    propertyCount: propertyHintCount || templatePropertyCount
  };
  cache[className] = summary;
  return summary;
};

C8O.palette.attachListEntrySummary = function (item, options) {
  if (!item) {
    return;
  }
  var summary = C8O.palette._getDescribeSummary(item.className, options || {});
  if (!summary) {
    return;
  }
  item.propertyCount = summary.propertyCount || summary.propertyHintCount || 0;
};

C8O.palette.computeListEntryCounts = function (className) {
  className = C8O.util.toTrimmedString(className || "");
  if (!className.length) {
    return null;
  }
  var cache = C8O.palette._listCountCache;
  if (cache.hasOwnProperty(className)) {
    return cache[className];
  }
  var counts = null;
  try {
    var beanInfoClass = Packages.java.lang.Class.forName(className + "BeanInfo");
    var beanInfo = beanInfoClass.getDeclaredConstructor().newInstance();
    var propHints = C8O.dbo.describeBeanProperties(beanInfo);
    if (propHints && propHints.length) {
      var hintCount = 0;
      for (var i = 0; i < propHints.length; i++) {
        var hint = propHints[i];
        if (!hint || hint.hidden) {
          continue;
        }
        hintCount++;
      }
      counts = {
        propertyCount: hintCount
      };
    }
  } catch (_ignoreCounts) {}
  cache[className] = counts;
  return counts;
};
