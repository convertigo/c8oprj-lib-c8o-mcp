var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
var BeanInfo = Packages.java.beans.BeanInfo;
var MySimpleBeanInfo = Packages.com.twinsoft.convertigo.beans.core.MySimpleBeanInfo;

function toJsString(value) {
  return value == null ? "" : String(value);
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
    className: toJsString(template.className || ""),
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

function locateEntry(classNameText) {
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

var requestedClass = C8O.util.toTrimmedString(className || "");
if (!requestedClass.length) {
  throw new Error("className is required");
}

var match = locateEntry(requestedClass);
if (!match) {
  throw new Error("Palette entry not found for className '" + requestedClass + "'");
}

var descriptor = match.beanInfo.getBeanDescriptor();
var descriptionText = match.bean.isDocumented() ? descriptor.getShortDescription() : "Not yet documented |";
var descParts = splitDescription(descriptionText);
var iconPath = MySimpleBeanInfo.getIconName(match.beanInfo, BeanInfo.ICON_COLOR_32x32);
var displayName = toJsString(descriptor.getDisplayName());

var entryPayload = {
  className: requestedClass,
  name: displayName,
  shortDescription: descParts.short,
  longDescription: descParts.long,
  description: toJsString(descriptionText),
  icon: toJsString(iconPath),
  group: toJsString(match.group),
  category: toJsString(match.category)
};

var describeData = null;
try {
  describeData = C8O.palette.describePaletteEntry({
    className: requestedClass,
    name: displayName,
    beanInfo: match.beanInfo
  });
} catch (_ignoreDescribe) {}

var templateMeta = describeData && describeData.creationTemplate ? mapTemplate(describeData.creationTemplate) : null;
var hintsPayload = describeData && describeData.propertyHints ? mapHints(describeData.propertyHints, requestedClass) : [];

paletteDescribeEntry = entryPayload;
paletteDescribeTemplate = templateMeta;
paletteDescribeTemplateProperties = templateMeta ? templateMeta.properties : [];
paletteDescribeTemplateMeta = templateMeta ? {
  related: templateMeta.related,
  mode: templateMeta.mode,
  className: templateMeta.className,
  name: templateMeta.name,
  payloadJson: templateMeta.payloadJson
} : null;
paletteDescribeHints = hintsPayload;
paletteDescribeNameSuggestion = describeData && describeData.nameSuggestion ?
  describeData.nameSuggestion :
  C8O.palette.suggestTechnicalName(displayName || requestedClass);
