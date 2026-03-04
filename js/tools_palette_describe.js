var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
var BeanInfo = Packages.java.beans.BeanInfo;
var MySimpleBeanInfo = Packages.com.twinsoft.convertigo.beans.core.MySimpleBeanInfo;

function toJsString(value) {
  return value == null ? "" : String(value);
}

function parseOptionBoolean(value, defaultValue) {
  if (value === null || typeof value === "undefined") {
    return defaultValue;
  }
  var text = String(value).trim();
  if (!text.length) {
    return defaultValue;
  }
  text = text.toLowerCase();
  if (text === "true" || text === "1" || text === "yes" || text === "on") {
    return true;
  }
  if (text === "false" || text === "0" || text === "no" || text === "off") {
    return false;
  }
  return defaultValue;
}

function splitDescription(raw) {
  var text = toJsString(raw);
  if (!text.length) {
    return { short: "", long: "" };
  }
  var parts = text.split("|");
  return {
    short: parts[0].trim(),
    long: parts.length > 1 ? parts.slice(1).join("|").trim() : ""
  };
}

function mapTemplate(template) {
  if (!template) {
    return null;
  }
  var props = [];
  var list = template.properties || [];
  for (var i = 0; i < list.length; i++) {
    var entry = list[i];
    if (!entry) {
      continue;
    }
    props.push({
      name: toJsString(entry.name),
      kind: toJsString(entry.kind),
      value: entry.value
    });
  }
  return {
    related: toJsString(template.related || "<parent QName>"),
    mode: toJsString(template.mode || "inside"),
    className: C8O.util.fromFqcn ? C8O.util.fromFqcn(template.className || "") : toJsString(template.className || ""),
    name: toJsString(template.name || ""),
    payloadJson: toJsString(template.payloadJson || ""),
    properties: props
  };
}

function mapHints(hints, className) {
  if (!hints || !hints.length) {
    return [];
  }
  var classLabel = C8O.util ? C8O.util.toTrimmedString(className || "") : String(className || "");
  var results = [];
  for (var i = 0; i < hints.length; i++) {
    var hint = hints[i];
    if (!hint) {
      continue;
    }
    var hintPayload = {
      name: toJsString(hint.name),
      displayName: toJsString(hint.displayName || hint.name),
      description: toJsString(hint.description || ""),
      type: toJsString(hint.type || ""),
      kind: toJsString(hint.kind || ""),
      defaultValue: hint.defaultValue
    };
    if (hint.scriptable === true) {
      hintPayload.scriptable = true;
    }
    if (hint.multiline === true) {
      hintPayload.multiline = true;
    }
    if (hint.nillable === true) {
      hintPayload.nillable = true;
    }
    if (classLabel && C8O && C8O.dbo && typeof C8O.dbo.resolveLlmHint === "function") {
      try {
        var resolved = C8O.dbo.resolveLlmHint(classLabel, hint.name, hint);
        if (resolved) {
          hintPayload.llmHint = String(resolved);
        }
      } catch (_ignoreHint) {}
    }
    results.push(hintPayload);
  }
  return results;
}

function locateExplorerEntry(classNameText) {
  var explorer = Engine.theApp.getDboExplorerManager();
  var groups = explorer.getGroups();
  var groupIt = groups.iterator();
  var expectedLower = classNameText.toLowerCase();
  while (groupIt.hasNext()) {
    var group = groupIt.next();
    var groupName = toJsString(group.getName());
    var categoryIt = group.getCategories().iterator();
    while (categoryIt.hasNext()) {
      var category = categoryIt.next();
      var categoryName = category.getName().isEmpty() ? groupName : toJsString(category.getName());
      var beansIt = category.getBeans().iterator();
      while (beansIt.hasNext()) {
        var beans = beansIt.next();
        var label = beans.getName().isEmpty() ? categoryName : toJsString(beans.getName());
        var beanIt = beans.getBeans().iterator();
        while (beanIt.hasNext()) {
          var bean = beanIt.next();
          var beanClassName = bean.getClassName();
          if (!beanClassName) {
            continue;
          }
          var classText = String(beanClassName);
          if (classText === classNameText || classText.toLowerCase() === expectedLower) {
            var beanInfoClass = Packages.java.lang.Class.forName(classText + "BeanInfo");
            var beanInfo = beanInfoClass.getConstructor().newInstance();
            return {
              bean: bean,
              beanInfo: beanInfo,
              group: groupName,
              category: label
            };
          }
        }
      }
    }
  }
  return null;
}

function locateNgxEntry(classNameToken) {
  var resolved = null;
  try {
    resolved = C8O.dbo.findNgxComponentByLogicalClass(classNameToken, null, { requireAllowedInParent: false });
  } catch (_ignoreResolve) {
    resolved = null;
  }
  if (!resolved || !resolved.component || !resolved.sampleDbo) {
    return null;
  }
  var component = resolved.component;
  var logicalClassName = resolved.logicalClassName || classNameToken;
  var name = "";
  var description = "";
  var icon = "";
  var category = "";
  try { name = String(component.getLabel() || ""); } catch (_ignoreLabel) { name = ""; }
  if (!name.length) {
    try { name = String(component.getName() || ""); } catch (_ignoreName) { name = ""; }
  }
  try { description = String(component.getDescription() || ""); } catch (_ignoreDescription) { description = ""; }
  try { icon = String(component.getImagePath() || ""); } catch (_ignoreIcon) { icon = ""; }
  try { category = String(component.getGroup() || ""); } catch (_ignoreGroup) { category = ""; }
  return {
    className: logicalClassName,
    name: name,
    description: description,
    icon: icon,
    group: "NGX",
    category: category || "Components",
    sampleDbo: resolved.sampleDbo
  };
}

var requestedClassToken = C8O.util.toTrimmedString(className || "");
if (!requestedClassToken.length) {
  throw new Error("className is required");
}
var verboseMode = parseOptionBoolean(typeof verbose !== "undefined" ? verbose : null, false);
var parsedRequested = C8O.dbo.parseLogicalClassToken(requestedClassToken);

var entryPayload = null;
var describeData = null;
var hintClassLabel = parsedRequested.baseClassName || parsedRequested.baseClassFqcn || requestedClassToken;

if (C8O.dbo._isNgxClassFqcn(parsedRequested.baseClassFqcn)) {
  if (!parsedRequested.hasLogicalId) {
    throw new Error("For NGX palette describe, className must include '#<logicalId>'");
  }
  var ngxEntry = locateNgxEntry(requestedClassToken);
  if (!ngxEntry) {
    throw new Error("Palette entry not found for className '" + requestedClassToken + "'");
  }
  var ngxDesc = splitDescription(ngxEntry.description);
  entryPayload = {
    className: ngxEntry.className,
    name: ngxEntry.name,
    shortDescription: ngxDesc.short,
    longDescription: ngxDesc.long,
    description: ngxEntry.description,
    icon: ngxEntry.icon,
    group: ngxEntry.group,
    category: ngxEntry.category
  };
  try {
    describeData = C8O.palette.describePaletteEntry({
      className: ngxEntry.className,
      name: ngxEntry.name,
      sampleDbo: ngxEntry.sampleDbo
    });
  } catch (_ignoreNgxDescribe) {}
} else {
  var requestedClass = parsedRequested.baseClassFqcn;
  var match = locateExplorerEntry(requestedClass);
  if (!match) {
    throw new Error("Palette entry not found for className '" + requestedClassToken + "'");
  }

  var descriptor = match.beanInfo.getBeanDescriptor();
  var descriptionText = match.bean.isDocumented() ? descriptor.getShortDescription() : "Not yet documented |";
  var descParts = splitDescription(descriptionText);
  var iconPath = MySimpleBeanInfo.getIconName(match.beanInfo, BeanInfo.ICON_COLOR_32x32);
  var displayName = toJsString(descriptor.getDisplayName());

  entryPayload = {
    className: C8O.util.fromFqcn ? C8O.util.fromFqcn(requestedClass) : requestedClass,
    name: displayName,
    shortDescription: descParts.short,
    longDescription: descParts.long,
    description: toJsString(descriptionText),
    icon: toJsString(iconPath),
    group: toJsString(match.group),
    category: toJsString(match.category)
  };

  try {
    describeData = C8O.palette.describePaletteEntry({
      className: requestedClass,
      name: displayName,
      beanInfo: match.beanInfo
    });
  } catch (_ignoreDescribe) {}
}

var templateMeta = describeData && describeData.creationTemplate ? mapTemplate(describeData.creationTemplate) : null;
var hintsPayload = describeData && describeData.propertyHints ? mapHints(describeData.propertyHints, hintClassLabel) : [];
if (!verboseMode) {
  templateMeta = null;
  hintsPayload = [];
}

paletteDescribeEntry = entryPayload;
paletteDescribeTemplate = templateMeta;
paletteDescribeTemplateProperties = templateMeta ? templateMeta.properties : [];
paletteDescribeTemplateMeta = templateMeta ? {
  related: templateMeta.related,
  mode: templateMeta.mode,
  className: C8O.util.fromFqcn ? C8O.util.fromFqcn(templateMeta.className) : templateMeta.className,
  name: templateMeta.name,
  payloadJson: templateMeta.payloadJson
} : null;
paletteDescribeHints = hintsPayload;
paletteDescribeNameSuggestion = describeData && describeData.nameSuggestion ?
  describeData.nameSuggestion :
  C8O.palette.suggestTechnicalName((entryPayload && entryPayload.name) || requestedClassToken);


