include("js/databaseobject.js");

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.palette = C8O.palette || {};

C8O.palette._describeSummaryCache = {};
C8O.palette._listCountCache = {};

C8O.palette._MAX_TEMPLATE_PROPS = 12;
C8O.palette._MAX_PROPERTY_HINTS = 32;
C8O.palette._NULL_SENTINEL = "__c8o_palette_null__";
C8O.palette._DESCRIBE_CACHE_KEY = "c8o.palette.describeSummary";
C8O.palette._COUNT_CACHE_KEY = "c8o.palette.listCounts";

C8O.palette._getProjectCacheBucket = function (key, fallback) {
  if (C8O.cache && typeof C8O.cache.getProjectMap === "function") {
    var bucket = C8O.cache.getProjectMap(key);
    if (bucket) {
      return bucket;
    }
  }
  return fallback;
};

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

C8O.palette._buildTemplateFromPropertyHints = function (options, propHints) {
  options = options || {};
  var className = C8O.util.toTrimmedString(options.className || "");
  var displayName = options.displayName || "";
  if (!className.length || !propHints || !propHints.length) {
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
  if (!visibleHints.length) {
    return null;
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
  var nameSuggestion = C8O.palette.suggestTechnicalName(displayName || className);
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

C8O.palette.describeDatabaseObjectTemplate = function (options) {
  options = options || {};
  var dbo = options.dbo || null;
  if (!dbo) {
    return null;
  }
  var className = C8O.util.toTrimmedString(options.className || "");
  if (!className.length) {
    try {
      className = C8O.util.fromFqcn ? C8O.util.fromFqcn(dbo.getClass().getName()) : String(dbo.getClass().getName());
    } catch (_ignoreDboClass) {
      className = "";
    }
  }
  var propHints = [];
  try {
    propHints = C8O.dbo.describeDatabaseObjectProperties(dbo);
  } catch (_ignoreDescribeDbo) {
    propHints = [];
  }
  return C8O.palette._buildTemplateFromPropertyHints({
    className: className,
    displayName: options.displayName || className
  }, propHints);
};

C8O.palette.describePaletteEntry = function (entry) {
  if (!entry || !entry.className) {
    return null;
  }
  var classToken = C8O.util.toTrimmedString(entry.className || "");
  var parsed = C8O.dbo.parseLogicalClassToken(classToken);
  var fqcn = parsed.baseClassFqcn;
  var className = C8O.util && C8O.util.fromFqcn ? C8O.util.fromFqcn(fqcn) : fqcn;
  var displayName = entry.name || "";

  if (parsed.hasLogicalId && C8O.dbo._isNgxClassFqcn(parsed.baseClassFqcn)) {
    var sampleDbo = entry.sampleDbo || null;
    if (!sampleDbo) {
      var resolved = C8O.dbo.findNgxComponentByLogicalClass(classToken, entry.parentDbo || null, { requireAllowedInParent: false });
      sampleDbo = resolved && resolved.sampleDbo ? resolved.sampleDbo : null;
    }
    if (sampleDbo) {
      return C8O.palette.describeDatabaseObjectTemplate({
        className: C8O.util.fromFqcn ? C8O.util.fromFqcn(parsed.baseClassFqcn) + "#" + parsed.logicalId : classToken,
        displayName: displayName,
        dbo: sampleDbo
      });
    }
  }

  var beanInfo = entry.beanInfo || null;
  if (!beanInfo) {
    try {
      var beanInfoClass = Packages.java.lang.Class.forName(fqcn + "BeanInfo");
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
  var propHints = options.propertyHints || null;
  if (!propHints) {
    var beanInfo = options.beanInfo || null;
    propHints = C8O.dbo.describeBeanProperties(beanInfo);
  }
  return C8O.palette._buildTemplateFromPropertyHints({
    className: className,
    displayName: options.displayName || className
  }, propHints || []);
};

C8O.palette._getDescribeSummary = function (className, options) {
  var classToken = C8O.util && C8O.util.toTrimmedString ? C8O.util.toTrimmedString(className || "") : String(className || "").trim();
  if (!classToken.length) {
    return null;
  }
  var cacheKey = C8O.util && C8O.util.toFqcn ? C8O.util.toFqcn(classToken) : classToken;
  var cache = C8O.palette._getProjectCacheBucket(
    C8O.palette._DESCRIBE_CACHE_KEY,
    C8O.palette._describeSummaryCache
  );
  var cached = cache && Object.prototype.hasOwnProperty.call(cache, cacheKey)
    ? cache[cacheKey]
    : undefined;
  if (typeof cached !== "undefined") {
    return cached === C8O.palette._NULL_SENTINEL ? null : cached;
  }
  var describeData = null;
  try {
    describeData = C8O.palette.describePaletteEntry({
      className: classToken,
      name: options && options.displayName ? options.displayName : "",
      beanInfo: options && options.beanInfo ? options.beanInfo : null,
      sampleDbo: options && options.sampleDbo ? options.sampleDbo : null,
      parentDbo: options && options.parentDbo ? options.parentDbo : null
    });
  } catch (_ignoreSummaryError) {}
  var summary = null;
  if (describeData) {
    var propertyHintCount = describeData.propertyHints ? describeData.propertyHints.length : 0;
    var templatePropertyCount = describeData.creationTemplate && describeData.creationTemplate.properties ? describeData.creationTemplate.properties.length : 0;
    summary = {
      propertyHintCount: propertyHintCount,
      templatePropertyCount: templatePropertyCount,
      propertyCount: propertyHintCount || templatePropertyCount
    };
  }
  if (!cache) {
    cache = {};
  }
  cache[cacheKey] = summary ? summary : C8O.palette._NULL_SENTINEL;
  return summary;
};
C8O.palette.attachListEntrySummary = function (item, options) {
  if (!item) {
    return;
  }
  var classToken = C8O.util.toTrimmedString(item.className || "");
  var summary = C8O.palette._getDescribeSummary(classToken, options || {});
  item.className = C8O.util && C8O.util.fromFqcn ? C8O.util.fromFqcn(classToken) : classToken;
  if (!summary) {
    return;
  }
  item.propertyCount = summary.propertyCount || summary.propertyHintCount || 0;
};

C8O.palette.computeListEntryCounts = function (className, options) {
  options = options || {};
  var classToken = C8O.util && C8O.util.toTrimmedString ? C8O.util.toTrimmedString(className || "") : String(className || "").trim();
  if (!classToken.length) {
    return null;
  }
  var cacheKey = C8O.util && C8O.util.toFqcn ? C8O.util.toFqcn(classToken) : classToken;
  var cache = C8O.palette._getProjectCacheBucket(
    C8O.palette._COUNT_CACHE_KEY,
    C8O.palette._listCountCache
  );
  var cached = cache && Object.prototype.hasOwnProperty.call(cache, cacheKey)
    ? cache[cacheKey]
    : undefined;
  if (typeof cached !== "undefined") {
    return cached === C8O.palette._NULL_SENTINEL ? null : cached;
  }
  var counts = null;
  try {
    var sampleDbo = options.sampleDbo || null;
    if (!sampleDbo) {
      var parsed = C8O.dbo.parseLogicalClassToken(classToken);
      if (parsed.hasLogicalId && C8O.dbo._isNgxClassFqcn(parsed.baseClassFqcn)) {
        var resolved = C8O.dbo.findNgxComponentByLogicalClass(classToken, options.parentDbo || null, { requireAllowedInParent: false });
        sampleDbo = resolved && resolved.sampleDbo ? resolved.sampleDbo : null;
      }
    }

    if (sampleDbo) {
      counts = {
        propertyCount: C8O.dbo.countVisibleProperties(sampleDbo)
      };
    } else {
      var parsedClass = C8O.dbo.parseLogicalClassToken(classToken);
      var fqcn = parsedClass.baseClassFqcn;
      if (fqcn.length) {
        var beanInfoClass = Packages.java.lang.Class.forName(fqcn + "BeanInfo");
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
      }
    }
  } catch (_ignoreCounts) {}
  if (!cache) {
    cache = {};
  }
  cache[cacheKey] = counts ? counts : C8O.palette._NULL_SENTINEL;
  return counts;
};

C8O.palette.splitDescription = function (raw) {
  var text = C8O.util && C8O.util.toTrimmedString ? C8O.util.toTrimmedString(raw || "") : String(raw || "").trim();
  if (!text.length) {
    return { short: "", long: "" };
  }
  var parts = text.split("|");
  return {
    short: parts.length > 0 ? String(parts[0]).trim() : "",
    long: parts.length > 1 ? String(parts.slice(1).join("|")).trim() : ""
  };
};

C8O.palette.isNgxParent = function (parentDbo) {
  if (!parentDbo) {
    return false;
  }
  try {
    return parentDbo instanceof Packages.com.twinsoft.convertigo.beans.ngx.components.MobileComponent;
  } catch (_ignoreInstanceOf) {}
  try {
    var className = String(parentDbo.getClass().getName());
    return className.indexOf("com.twinsoft.convertigo.beans.ngx.") === 0;
  } catch (_ignoreClassName) {
    return false;
  }
};

C8O.palette._containsFilter = function (value, filterText) {
  if (!filterText || !filterText.length) {
    return false;
  }
  if (value === null || value === undefined) {
    return false;
  }
  return String(value).toLowerCase().indexOf(filterText) !== -1;
};

C8O.palette.matchesFilter = function (entry, filterText) {
  if (!filterText || !filterText.length) {
    return true;
  }
  return (
    C8O.palette._containsFilter(entry.name, filterText) ||
    C8O.palette._containsFilter(entry.className, filterText) ||
    C8O.palette._containsFilter(entry.shortDescription, filterText) ||
    C8O.palette._containsFilter(entry.longDescription, filterText) ||
    C8O.palette._containsFilter(entry.description, filterText) ||
    C8O.palette._containsFilter(entry.group, filterText) ||
    C8O.palette._containsFilter(entry.category, filterText) ||
    C8O.palette._containsFilter(entry.componentName, filterText) ||
    C8O.palette._containsFilter(entry.tag, filterText)
  );
};

C8O.palette._buildEntry = function (options) {
  options = options || {};
  var fqcn = options.classFqcn || "";
  var className = options.className != null
    ? String(options.className)
    : (C8O.util && C8O.util.fromFqcn ? C8O.util.fromFqcn(fqcn) : String(fqcn || ""));
  var rawDescription = options.description == null ? "" : String(options.description);
  var desc = C8O.palette.splitDescription(rawDescription);
  var name = options.name == null ? "" : String(options.name);
  return {
    type: "dbo",
    id: options.id != null ? String(options.id) : className,
    name: name,
    className: className,
    description: rawDescription,
    shortDescription: desc.short,
    longDescription: desc.long,
    icon: options.icon == null ? "" : String(options.icon),
    builtin: options.builtin !== false,
    additional: options.additional === true,
    group: options.group == null ? "" : String(options.group),
    category: options.category == null ? "" : String(options.category),
    componentName: options.componentName == null ? "" : String(options.componentName),
    tag: options.tag == null ? "" : String(options.tag),
    nameSuggestion: ""
  };
};

C8O.palette._collectExplorerEntries = function (context) {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var DatabaseObjectsManager = Packages.com.twinsoft.convertigo.engine.DatabaseObjectsManager;
  var DatabaseObject = Packages.com.twinsoft.convertigo.beans.core.DatabaseObject;
  var MySimpleBeanInfo = Packages.com.twinsoft.convertigo.beans.core.MySimpleBeanInfo;
  var BeanInfo = Packages.java.beans.BeanInfo;

  var parentDbo = context.parentDbo || null;
  var folderType = context.folderType || null;
  var pushEntry = context.pushEntry;
  var stop = false;

  var explorer = Engine.theApp.getDboExplorerManager();
  var groups = explorer.getGroups();
  var groupIt = groups.iterator();

  while (groupIt.hasNext() && !stop) {
    var group = groupIt.next();
    var groupName = String(group.getName());
    var categoryIt = group.getCategories().iterator();
    while (categoryIt.hasNext() && !stop) {
      var category = categoryIt.next();
      var categoryName = category.getName().isEmpty() ? groupName : String(category.getName());
      var beansIt = category.getBeans().iterator();
      while (beansIt.hasNext() && !stop) {
        var beans = beansIt.next();
        var categoryLabel = beans.getName().isEmpty() ? categoryName : String(beans.getName());
        var beanIt = beans.getBeans().iterator();
        while (beanIt.hasNext() && !stop) {
          var bean = beanIt.next();
          var classFqcn = bean.getClassName();
          if (!classFqcn) {
            continue;
          }

          var isAllowed = parentDbo == null;
          try {
            var force = false;
            if (parentDbo != null) {
              if (parentDbo instanceof Packages.com.twinsoft.convertigo.beans.core.Sequence) {
                force = classFqcn.indexOf("com.twinsoft.convertigo.beans.steps.") === 0 ||
                  classFqcn.indexOf("com.twinsoft.convertigo.beans.variables.Step") === 0;
              } else if (parentDbo instanceof Packages.com.twinsoft.convertigo.beans.ngx.components.ApplicationComponent) {
                force = classFqcn.indexOf("com.twinsoft.convertigo.beans.ngx.") === 0;
              } else if (parentDbo instanceof Packages.com.twinsoft.convertigo.beans.mobile.components.ApplicationComponent) {
                force = classFqcn.indexOf("com.twinsoft.convertigo.beans.mobile.") === 0;
              }
            }
            if (parentDbo != null) {
              isAllowed = force || DatabaseObjectsManager.checkParent(parentDbo.getClass(), bean);
            }
            if (folderType != null && String(folderType).length && isAllowed) {
              isAllowed = DatabaseObject.getFolderType(Packages.java.lang.Class.forName(classFqcn)) == folderType;
            }
          } catch (_ignoreAllowedCheck) {
            isAllowed = false;
          }
          if (!isAllowed) {
            continue;
          }

          try {
            var beanInfoClass = Packages.java.lang.Class.forName(classFqcn + "BeanInfo");
            var beanInfo = beanInfoClass.getConstructor().newInstance();
            var descriptor = beanInfo.getBeanDescriptor();
            var rawDescription = bean.isDocumented() ? descriptor.getShortDescription() : "Not yet documented |";
            var entry = C8O.palette._buildEntry({
              id: C8O.util && C8O.util.fromFqcn ? C8O.util.fromFqcn(classFqcn) : String(classFqcn),
              name: descriptor.getDisplayName(),
              classFqcn: classFqcn,
              description: rawDescription,
              icon: MySimpleBeanInfo.getIconName(beanInfo, BeanInfo.ICON_COLOR_32x32),
              builtin: true,
              additional: false,
              group: groupName,
              category: categoryLabel
            });
            if (!pushEntry(entry, { classFqcn: classFqcn, beanInfo: beanInfo, displayName: entry.name })) {
              stop = true;
            }
          } catch (_ignoreBeanInfo) {}
        }
      }
    }
  }
};

C8O.palette._collectNgxEntries = function (context) {
  var ComponentManager = Packages.com.twinsoft.convertigo.beans.ngx.components.dynamic.ComponentManager;
  var parentDbo = context.parentDbo || null;
  var pushEntry = context.pushEntry;

  if (!parentDbo) {
    return;
  }

  var manager = null;
  try {
    manager = ComponentManager.of(parentDbo.getProject ? parentDbo.getProject() : parentDbo);
    if (manager && typeof manager.reloadComponents === "function") {
      manager.reloadComponents();
    }
  } catch (_ignoreManagerLoad) {
    manager = null;
  }
  if (!manager) {
    return;
  }

  var components = null;
  try {
    components = manager.getComponentsByGroup();
  } catch (_ignoreComponentsByGroup) {
    components = null;
  }
  if (!components) {
    return;
  }

  for (var i = 0; i < components.size(); i++) {
    var comp = components.get(i);
    if (!comp) {
      continue;
    }

    var allowed = false;
    try {
      allowed = comp.isAllowedIn(parentDbo) === true;
    } catch (_ignoreAllowed) {
      allowed = false;
    }
    if (!allowed) {
      continue;
    }

    var dbo = null;
    try {
      dbo = manager.createBean(comp);
    } catch (_ignoreBeanCreate) {}
    if (!dbo) {
      continue;
    }

    var classFqcn = "";
    try {
      classFqcn = String(dbo.getClass().getName());
    } catch (_ignoreClassName) {
      classFqcn = "";
    }
    if (!classFqcn.length) {
      continue;
    }

    var categoryName = "";
    var componentName = "";
    var label = "";
    var rawDescription = "";
    var iconPath = "";
    var tagName = "";
    var isBuiltIn = true;
    var isAdditional = false;
    try { categoryName = String(comp.getGroup()); } catch (_ignoreGroup) { categoryName = ""; }
    try { componentName = String(comp.getName()); } catch (_ignoreName) { componentName = ""; }
    try { label = String(comp.getLabel()); } catch (_ignoreLabel) { label = ""; }
    try { rawDescription = String(comp.getDescription()); } catch (_ignoreDescription) { rawDescription = ""; }
    try { iconPath = String(comp.getImagePath()); } catch (_ignoreIcon) { iconPath = ""; }
    try { tagName = String(comp.getTag()); } catch (_ignoreTag) { tagName = ""; }
    try { isBuiltIn = comp.isBuiltIn() === true; } catch (_ignoreBuiltIn) { isBuiltIn = true; }
    try { isAdditional = comp.isAdditional() === true; } catch (_ignoreAdditional) { isAdditional = false; }

    var logicalId = C8O.dbo.getNgxComponentLogicalId(comp, dbo);
    if (!logicalId.length) {
      continue;
    }
    var logicalClassName = C8O.dbo.buildLogicalClassName(classFqcn, logicalId);
    var entryId = "ngx [" + (categoryName || "") + "] " + logicalClassName;
    var entry = C8O.palette._buildEntry({
      id: entryId,
      name: label || componentName || (C8O.util && C8O.util.fromFqcn ? C8O.util.fromFqcn(classFqcn) : classFqcn),
      classFqcn: classFqcn,
      className: logicalClassName,
      description: rawDescription,
      icon: iconPath,
      builtin: isBuiltIn,
      additional: isAdditional,
      group: "NGX",
      category: categoryName || "Components",
      componentName: componentName,
      tag: tagName
    });
    if (!pushEntry(entry, { classFqcn: classFqcn, displayName: entry.name, sampleDbo: dbo, parentDbo: parentDbo })) {
      break;
    }
  }
};

C8O.palette.listEntries = function (options) {
  options = options || {};
  var parentDbo = options.parentDbo || null;
  var folderType = options.folderType || null;
  var filterInfo = options.filterInfo || {};
  var includeBuiltIn = options.includeBuiltIn !== false;
  var includeShared = options.includeShared !== false;
  var hasFilter = filterInfo.hasFilter === true;
  var filterText = hasFilter ? String(filterInfo.text || "").toLowerCase() : "";
  var limitValue = options.limit && Number(options.limit) > 0 ? Number(options.limit) : 0;
  var startIndex = options.startIndex && Number(options.startIndex) > 0 ? Number(options.startIndex) : 0;

  var categories = [];
  var categoryIndex = {};
  var totalMatches = 0;
  var returned = 0;
  var hasMore = false;
  var nextCursor = "";

  function ensureCategory(name, type) {
    var categoryName = name && String(name).length ? String(name) : "General";
    var key = categoryName.toLowerCase();
    var existing = categoryIndex[key];
    if (!existing) {
      existing = { name: categoryName, type: type || "Category", items: [] };
      categoryIndex[key] = existing;
      categories.push(existing);
    }
    return existing;
  }

  function pushEntry(entry, meta) {
    if (!entry) {
      return true;
    }
    var isBuiltIn = entry.builtin !== false;
    if ((isBuiltIn && !includeBuiltIn) || (!isBuiltIn && !includeShared)) {
      return true;
    }
    if (hasFilter && !C8O.palette.matchesFilter(entry, filterText)) {
      return true;
    }

    totalMatches++;
    if (totalMatches <= startIndex) {
      return true;
    }

    if (limitValue > 0 && returned >= limitValue) {
      hasMore = true;
      nextCursor = String(startIndex + returned);
      return false;
    }

    var classToken = entry.className || "";
    var displayName = meta && meta.displayName ? String(meta.displayName) : (entry.name || "");
    var beanInfo = meta && meta.beanInfo ? meta.beanInfo : null;
    var sampleDbo = meta && meta.sampleDbo ? meta.sampleDbo : null;
    var sampleParent = meta && meta.parentDbo ? meta.parentDbo : parentDbo;
    try {
      C8O.palette.attachListEntrySummary(entry, {
        displayName: displayName,
        beanInfo: beanInfo,
        sampleDbo: sampleDbo,
        parentDbo: sampleParent
      });
    } catch (_ignoreSummary) {}
    try {
      var counts = C8O.palette.computeListEntryCounts(classToken, {
        sampleDbo: sampleDbo,
        parentDbo: sampleParent
      });
      if (counts && counts.propertyCount != null) {
        entry.propertyCount = counts.propertyCount;
      }
    } catch (_ignoreCounts) {}
    if (typeof entry.propertyCount === "undefined" || entry.propertyCount === null) {
      entry.propertyCount = 0;
    }

    var category = ensureCategory(entry.category || entry.group || "General", "Category");
    category.items.push(entry);
    returned++;

    if (limitValue > 0 && returned >= limitValue) {
      hasMore = true;
      nextCursor = String(startIndex + returned);
      return false;
    }
    return true;
  }

  if (C8O.palette.isNgxParent(parentDbo)) {
    C8O.palette._collectNgxEntries({
      parentDbo: parentDbo,
      pushEntry: pushEntry
    });
  } else {
    C8O.palette._collectExplorerEntries({
      parentDbo: parentDbo,
      folderType: folderType,
      pushEntry: pushEntry
    });
  }

  if (returned <= 0) {
    hasMore = false;
    nextCursor = "";
  }

  return {
    categories: categories,
    returned: returned,
    totalMatches: totalMatches,
    hasMore: hasMore,
    nextCursor: nextCursor
  };
};
