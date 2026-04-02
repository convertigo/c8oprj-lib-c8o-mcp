include("js/palette.js");

var DocumentBuilderFactory = Packages.javax.xml.parsers.DocumentBuilderFactory;
var YamlConverter = Packages.com.twinsoft.convertigo.engine.util.YamlConverter;
var File = Packages.java.io.File;
var Files = Packages.java.nio.file.Files;
var StandardCharsets = Packages.java.nio.charset.StandardCharsets;

function toTrimmed(value) {
  return value == null ? "" : String(value).trim();
}

function parseBoolean(value, defaultValue) {
  if (value === null || typeof value === "undefined") {
    return defaultValue;
  }
  var text = String(value).trim().toLowerCase();
  if (!text.length) {
    return defaultValue;
  }
  if (text === "true" || text === "1" || text === "yes" || text === "on") {
    return true;
  }
  if (text === "false" || text === "0" || text === "no" || text === "off") {
    return false;
  }
  return defaultValue;
}

function cloneJson(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_ignoreClone) {
    return fallback;
  }
}

function mapHints(hints, className) {
  if (!hints || !hints.length) {
    return [];
  }
  var classLabel = toTrimmed(className);
  var results = [];
  for (var i = 0; i < hints.length; i++) {
    var hint = hints[i];
    if (!hint) {
      continue;
    }
    var payload = {
      name: hint.name == null ? "" : String(hint.name),
      displayName: hint.displayName == null ? (hint.name == null ? "" : String(hint.name)) : String(hint.displayName),
      description: hint.description == null ? "" : String(hint.description),
      type: hint.type == null ? "" : String(hint.type),
      kind: hint.kind == null ? "" : String(hint.kind),
      defaultValue: cloneJson(hint.defaultValue, hint.defaultValue),
      exampleValue: cloneJson(hint.exampleValue, hint.exampleValue)
    };
    if (hint.scriptable === true) {
      payload.scriptable = true;
    }
    if (hint.multiline === true) {
      payload.multiline = true;
    }
    if (hint.nillable === true) {
      payload.nillable = true;
    }
    if (classLabel && C8O && C8O.dbo && typeof C8O.dbo.resolveLlmHint === "function") {
      try {
        var resolved = C8O.dbo.resolveLlmHint(classLabel, hint.name, hint);
        if (resolved) {
          payload.llmHint = String(resolved);
        }
      } catch (_ignoreHint) {}
    }
    results.push(payload);
  }
  return results;
}

function toArray(value) {
  if (value == null || typeof value === "undefined") {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value.length === "number") {
    var byLength = [];
    for (var i = 0; i < value.length; i++) {
      byLength.push(value[i]);
    }
    return byLength;
  }
  return [];
}

function slugify(value) {
  var text = toTrimmed(value).toLowerCase().replace(/[^a-z0-9]+/g, "_");
  text = text.replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "");
  return text.length ? text : "project";
}

function safeProjectName(dbo) {
  if (!dbo || !dbo.getProject) {
    return "";
  }
  try {
    var projectObject = dbo.getProject();
    return projectObject ? String(projectObject.getName() || "") : "";
  } catch (_ignoreProjectName) {
    return "";
  }
}

function readJsonFile(file) {
  return JSON.parse(String(Files.readString(file.toPath(), StandardCharsets.UTF_8)));
}

function getRegistryFiles() {
  var projectDir = context && context.project ? new File(String(context.project.getDirPath())) : null;
  var cacheDir = projectDir == null ? null : new File(projectDir, "js/cache");
  if (cacheDir == null || !cacheDir.exists() || !cacheDir.isDirectory()) {
    return [];
  }
  var listed = cacheDir.listFiles();
  var files = [];
  for (var i = 0; i < listed.length; i++) {
    var file = listed[i];
    var name = String(file.getName() || "");
    if (file.isFile() && name.indexOf("palette_registry_") === 0 && name.lastIndexOf(".json") === name.length - 5) {
      files.push(file);
    }
  }
  files.sort(function (left, right) {
    var leftName = String(left.getName() || "");
    var rightName = String(right.getName() || "");
    if (leftName === rightName) {
      return 0;
    }
    return leftName < rightName ? -1 : 1;
  });
  return files;
}

function getClassChain(javaClass) {
  var chain = [];
  var current = javaClass;
  while (current != null) {
    try {
      chain.push(String(current.getName()));
    } catch (_ignoreCurrentName) {}
    current = current.getSuperclass();
  }
  return chain;
}

function containsValue(values, expected) {
  var list = toArray(values);
  var target = toTrimmed(expected);
  if (!target.length) {
    return false;
  }
  for (var i = 0; i < list.length; i++) {
    if (toTrimmed(list[i]) === target) {
      return true;
    }
  }
  return false;
}

function selectRegistryEntry(parentDbo, classToken) {
  var registryFiles = getRegistryFiles();
  if (!registryFiles.length) {
    return null;
  }

  var parentQName = toTrimmed(parentDbo && parentDbo.getQName ? parentDbo.getQName() : "");
  var projectName = toTrimmed(parentDbo && parentDbo.getProject ? safeProjectName(parentDbo) : "");
  var classChain = getClassChain(parentDbo.getClass ? parentDbo.getClass() : null);
  var preferredRegistryFilename = projectName.length ? "palette_registry_" + slugify(projectName) + ".json" : "";
  var best = null;

  function consider(candidate) {
    if (!candidate || !candidate.entry) {
      return;
    }
    if (best == null || candidate.score > best.score) {
      best = candidate;
    }
  }

  for (var fileIndex = 0; fileIndex < registryFiles.length; fileIndex++) {
    var registryFile = registryFiles[fileIndex];
    var registry = null;
    try {
      registry = readJsonFile(registryFile);
    } catch (_ignoreRegistryRead) {
      continue;
    }

    var targetBuckets = toArray(registry.targets);
    for (var targetIndex = 0; targetIndex < targetBuckets.length; targetIndex++) {
      var targetBucket = targetBuckets[targetIndex];
      if (!targetBucket || toTrimmed(targetBucket.qname) !== parentQName) {
        continue;
      }
      var targetEntries = targetBucket.entries || {};
      if (Object.prototype.hasOwnProperty.call(targetEntries, classToken)) {
        var targetEntry = targetEntries[classToken];
        var targetScore = 10000;
        if (toTrimmed(registryFile.getName()) === preferredRegistryFilename) {
          targetScore += 100;
        }
        if (targetEntry && targetEntry.yamlTemplate) {
          targetScore += 50;
        }
        consider({
          source: "palette-registry-target",
          score: targetScore,
          file: registryFile,
          parentBucket: targetBucket,
          parentClassName: null,
          entry: targetEntry
        });
      }
    }

    var parentBuckets = registry.parents || {};
    for (var classIndex = 0; classIndex < classChain.length; classIndex++) {
      var parentClassName = classChain[classIndex];
      var parentBucket = parentBuckets[parentClassName];
      if (!parentBucket || !parentBucket.entries || !Object.prototype.hasOwnProperty.call(parentBucket.entries, classToken)) {
        continue;
      }
      var parentEntry = parentBucket.entries[classToken];
      var parentScore = 5000 - (classIndex * 100);
      if (toTrimmed(registryFile.getName()) === preferredRegistryFilename) {
        parentScore += 100;
      }
      if (containsValue(parentBucket.projects, projectName)) {
        parentScore += 50;
      }
      if (parentEntry && parentEntry.yamlTemplate) {
        parentScore += 25;
      }
      consider({
        source: "palette-registry-parent",
        score: parentScore,
        file: registryFile,
        parentBucket: parentBucket,
        parentClassName: parentClassName,
        entry: parentEntry
      });
    }
  }

  return best;
}

function toBeanJson(element) {
  if (!element || String(element.getTagName()) !== "bean") {
    return null;
  }
  var selector = element.hasAttribute("yaml_key") ? "yaml_key" : (element.hasAttribute("yaml_attr") ? "yaml_attr" : "");
  if (!selector.length) {
    return null;
  }
  var raw = String(element.getAttribute(selector) || "");
  var payload = {
    selector: selector,
    raw: raw
  };
  var matches = raw.match(/^(.*) \[(.*?)(?:-(.*))?\]$/);
  if (matches) {
    payload.name = matches[1];
    payload.className = matches[2];
    if (matches[3] !== undefined) {
      if (/^-?\d+$/.test(matches[3])) {
        try {
          payload.priority = parseInt(matches[3], 10);
        } catch (_ignorePriority) {
          payload.priority = matches[3];
        }
      } else {
        payload.priority = matches[3];
      }
    }
  }
  return payload;
}

function toAttributesJson(element) {
  var attributes = element.getAttributes();
  if (!attributes || attributes.getLength() === 0) {
    return null;
  }
  var names = [];
  for (var i = 0; i < attributes.getLength(); i++) {
    names.push(String(attributes.item(i).getNodeName()));
  }
  names.sort();
  var payload = {};
  for (var j = 0; j < names.length; j++) {
    var name = names[j];
    var attr = attributes.getNamedItem(name);
    payload[name] = attr == null ? "" : String(attr.getNodeValue());
  }
  return Object.keys(payload).length ? payload : null;
}

function toFilteredAttributesJson(element, excludedNames) {
  var attributes = element.getAttributes();
  if (!attributes || attributes.getLength() === 0) {
    return null;
  }
  var names = [];
  for (var i = 0; i < attributes.getLength(); i++) {
    var name = String(attributes.item(i).getNodeName());
    if (excludedNames && Object.prototype.hasOwnProperty.call(excludedNames, name)) {
      continue;
    }
    names.push(name);
  }
  names.sort();
  var payload = {};
  for (var j = 0; j < names.length; j++) {
    var attrName = names[j];
    var attr = attributes.getNamedItem(attrName);
    payload[attrName] = attr == null ? "" : String(attr.getNodeValue());
  }
  return Object.keys(payload).length ? payload : null;
}

function readYamlTemplateRoot(yamlText) {
  var tempPath = Files.createTempFile("palette-json-skeleton-", ".yaml");
  try {
    Files.writeString(tempPath, String(yamlText || ""), StandardCharsets.UTF_8);
    var templateDoc = YamlConverter.readYaml(tempPath.toFile());
    var root = templateDoc.getDocumentElement();
    if (root != null && String(root.getTagName()) === "convertigo") {
      var child = root.getFirstChild();
      while (child != null) {
        if (Number(child.getNodeType()) === 1) {
          return child;
        }
        child = child.getNextSibling();
      }
    }
    return root;
  } finally {
    try {
      Files.deleteIfExists(tempPath);
    } catch (_ignoreDeleteTemp) {}
  }
}

function buildLiveXmlRoot(dbo) {
  var document = DocumentBuilderFactory.newInstance().newDocumentBuilder().newDocument();
  return dbo.toXml(document);
}

function buildRootSkeleton(documentJson) {
  return {
    format: "convertigo-dom",
    representation: "shrink",
    document: documentJson
  };
}

function toBeanRaw(bean) {
  if (!bean) {
    return "";
  }
  var name = toTrimmed(bean.name);
  var className = toTrimmed(bean.className);
  if (!name.length || !className.length) {
    return toTrimmed(bean.raw);
  }
  if (bean.priority !== null && typeof bean.priority !== "undefined" && String(bean.priority).length) {
    return name + " [" + className + "-" + String(bean.priority) + "]";
  }
  return name + " [" + className + "]";
}

function setPropertyText(documentJson, tagName, textValue) {
  if (!documentJson || !documentJson.children || !documentJson.children.length) {
    return;
  }
  for (var i = 0; i < documentJson.children.length; i++) {
    var child = documentJson.children[i];
    if (!child || child.kind !== "element" || child.tag !== tagName) {
      continue;
    }
    child.children = [{
      kind: "text",
      value: textValue
    }];
    return;
  }
}

function hasNonWhitespaceText(text) {
  return text != null && String(text).replace(/\s+/g, "").length > 0;
}

function isScalarValueElement(element) {
  if (!element || Number(element.getNodeType()) !== 1 || !element.hasAttribute("value")) {
    return false;
  }
  var child = element.getFirstChild();
  while (child != null) {
    if (Number(child.getNodeType()) === 1) {
      return false;
    }
    if ((Number(child.getNodeType()) === 3 || Number(child.getNodeType()) === 4) && hasNonWhitespaceText(child.getNodeValue())) {
      return false;
    }
    child = child.getNextSibling();
  }
  return true;
}

function templateNodeToJson(node) {
  if (!node) {
    return null;
  }
  var nodeType = Number(node.getNodeType());
  if (nodeType === 3) {
    if (!hasNonWhitespaceText(node.getNodeValue())) {
      return null;
    }
    return {
      kind: "text",
      value: String(node.getNodeValue())
    };
  }
  if (nodeType === 4) {
    return {
      kind: "cdata",
      value: node.getNodeValue() == null ? "" : String(node.getNodeValue())
    };
  }
  if (nodeType !== 1) {
    return null;
  }

  var element = node;
  if (String(element.getTagName()) === "property") {
    var propertyJson = {
      kind: "element",
      tag: toTrimmed(element.getAttribute("name")) || "property"
    };
    var propertyAttributes = toFilteredAttributesJson(element, { name: true });
    if (propertyAttributes) {
      propertyJson.attributes = propertyAttributes;
    }
    var propertyChildren = [];
    var propertyChild = element.getFirstChild();
    while (propertyChild != null) {
      var propertyChildJson = templateNodeToJson(propertyChild);
      if (propertyChildJson != null) {
        propertyChildren.push(propertyChildJson);
      }
      propertyChild = propertyChild.getNextSibling();
    }
    if (propertyChildren.length) {
      propertyJson.children = propertyChildren;
    }
    return propertyJson;
  }

  if (isScalarValueElement(element)) {
    return {
      kind: "text",
      value: String(element.getAttribute("value"))
    };
  }

  var payload = {
    kind: "element",
    tag: String(element.getTagName())
  };
  var attributes = toFilteredAttributesJson(element, {});
  if (attributes) {
    payload.attributes = attributes;
  }
  var children = [];
  var child = element.getFirstChild();
  while (child != null) {
    var jsonChild = templateNodeToJson(child);
    if (jsonChild != null) {
      children.push(jsonChild);
    }
    child = child.getNextSibling();
  }
  if (children.length) {
    payload.children = children;
  }
  return payload;
}

function buildDocumentJsonFromXmlRoot(rootElement, logicalClassName, nameValue, priorityValue) {
  if (rootElement == null) {
    throw new Error("Unable to build a JSON skeleton from a null XML root");
  }
  var bean = {
    selector: "yaml_key",
    name: nameValue,
    className: logicalClassName,
    priority: priorityValue
  };
  bean.raw = toBeanRaw(bean);
  var attributes = {
    yaml_key: bean.raw
  };
  var extraAttributes = toFilteredAttributesJson(rootElement, { classname: true, priority: true });
  if (extraAttributes) {
    var extraNames = Object.keys(extraAttributes);
    extraNames.sort();
    for (var i = 0; i < extraNames.length; i++) {
      attributes[extraNames[i]] = extraAttributes[extraNames[i]];
    }
  }
  var documentJson = {
    kind: "element",
    tag: "bean",
    attributes: attributes,
    bean: bean
  };
  var children = [];
  var child = rootElement.getFirstChild();
  while (child != null) {
    var jsonChild = templateNodeToJson(child);
    if (jsonChild != null) {
      children.push(jsonChild);
    }
    child = child.getNextSibling();
  }
  if (children.length) {
    documentJson.children = children;
  }
  return normalizeRootBean(documentJson, nameValue, priorityValue);
}

function buildDocumentJsonFromYamlTemplate(yamlText, logicalClassName, nameValue, priorityValue) {
  return buildDocumentJsonFromXmlRoot(readYamlTemplateRoot(yamlText), logicalClassName, nameValue, priorityValue);
}

function buildDocumentJsonFromLivePalette(dbo, logicalClassName, nameValue, priorityValue) {
  return buildDocumentJsonFromXmlRoot(buildLiveXmlRoot(dbo), logicalClassName, nameValue, priorityValue);
}

function normalizeRootBean(documentJson, nameValue, priorityValue) {
  if (!documentJson || documentJson.kind !== "element" || documentJson.tag !== "bean" || !documentJson.bean) {
    return documentJson;
  }
  if (nameValue && nameValue.length) {
    documentJson.bean.name = nameValue;
    setPropertyText(documentJson, "name", nameValue);
  }
  if (typeof priorityValue !== "undefined" && priorityValue !== null) {
    documentJson.bean.priority = priorityValue;
  }
  var raw = toBeanRaw(documentJson.bean);
  if (raw.length) {
    documentJson.bean.raw = raw;
    documentJson.attributes = documentJson.attributes || {};
    if (documentJson.bean.selector && documentJson.bean.selector.length) {
      documentJson.attributes[documentJson.bean.selector] = raw;
    } else if (documentJson.attributes.yaml_key) {
      documentJson.attributes.yaml_key = raw;
    }
  }
  return documentJson;
}

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.paletteJsonSkeleton = C8O.paletteJsonSkeleton || {};

function resolvePaletteJsonSkeleton(options) {
  var opts = options || {};
  var requestedParent = toTrimmed(opts.parent);
  var requestedClassName = toTrimmed(opts.className);
  var requestedName = toTrimmed(opts.name);
  var includeHintsFlag = parseBoolean(opts.includeHints, false);

  if (!requestedParent.length) {
    throw new Error("parent is required");
  }
  if (!requestedClassName.length) {
    throw new Error("className is required");
  }

  var parentDbo = opts.parentDbo || C8O.dbo.resolve(requestedParent, { optional: true });
  if (!parentDbo) {
    throw new Error("Parent database object not found: " + requestedParent);
  }

  var describeData = C8O.palette.describePaletteEntry({
    className: requestedClassName,
    parentDbo: parentDbo
  }) || {};

  var nameSuggestion = requestedName;
  if (!nameSuggestion.length) {
    nameSuggestion = toTrimmed(describeData.nameSuggestion);
  }
  if (!nameSuggestion.length) {
    nameSuggestion = C8O.palette.suggestTechnicalName(requestedClassName);
  }
  var registrySelection = selectRegistryEntry(parentDbo, requestedClassName);
  var registryEntry = registrySelection && registrySelection.entry ? registrySelection.entry : null;

  if (!requestedName.length && registryEntry && toTrimmed(registryEntry.nameSuggestion).length) {
    nameSuggestion = toTrimmed(registryEntry.nameSuggestion);
  }
  if (!nameSuggestion.length) {
    nameSuggestion = C8O.palette.suggestTechnicalName(requestedClassName);
  }

  var source = "live-palette";
  var sourceDetails = null;
  var resolvedClassName = requestedClassName;
  var propertyHints = describeData.propertyHints || [];
  var warnings = [];
  var documentJson = null;

  if (registryEntry && toTrimmed(registryEntry.yamlTemplate).length) {
    source = registrySelection.source;
    sourceDetails = {
      registryFile: String(registrySelection.file.getName()),
      parentClassName: registrySelection.parentClassName,
      sampleTargets: cloneJson(registrySelection.parentBucket && registrySelection.parentBucket.sampleTargets ? registrySelection.parentBucket.sampleTargets : [], []),
      projects: cloneJson(registrySelection.parentBucket && registrySelection.parentBucket.projects ? registrySelection.parentBucket.projects : [], [])
    };
    if (registryEntry.propertyHints && registryEntry.propertyHints.length) {
      propertyHints = registryEntry.propertyHints;
    }
    if (toTrimmed(registryEntry.className).length) {
      resolvedClassName = toTrimmed(registryEntry.className);
    }
    if (toTrimmed(registryEntry.yamlTemplateWarning).length) {
      warnings.push(String(registryEntry.yamlTemplateWarning));
    }
    documentJson = buildDocumentJsonFromYamlTemplate(registryEntry.yamlTemplate, resolvedClassName || requestedClassName, nameSuggestion, 0);
  } else {
    var dbo = C8O.dbo.instantiateForCreate(requestedClassName, parentDbo, {});
    if (!dbo) {
      throw new Error("Unable to instantiate palette entry: " + requestedClassName);
    }
    if (dbo.setName && nameSuggestion.length) {
      dbo.setName(nameSuggestion);
    }
    try {
      dbo.priority = 0;
    } catch (_ignorePriorityReset) {}
    try {
      resolvedClassName = C8O.dbo.logicalClassNameForDbo(dbo);
    } catch (_ignoreResolvedClass) {
      resolvedClassName = requestedClassName;
    }
    documentJson = buildDocumentJsonFromLivePalette(dbo, resolvedClassName || requestedClassName, nameSuggestion, 0);
  }

  var skeleton = buildRootSkeleton(documentJson);
  var splitFileSkeleton = buildRootSkeleton(cloneJson(documentJson, documentJson));
  var coverage = source !== "live-palette" ? "template" : "serialized";
  splitFileSkeleton.yamlFile = "<set yaml_file>";

  warnings.push("Assign a unique priority before importing this skeleton into a real project.");
  warnings.push("Set yamlFile/yaml_file only when externalizing this object into _c8oProjectJson.");
  if (source !== "live-palette") {
    warnings.push("This skeleton preserves the palette registry yamlTemplate shape and keeps explicit default properties that may be omitted by project shrink mirrors.");
  } else {
    warnings.push("This skeleton was built from the live palette full XML export, so it keeps the bean's serialized properties without shrink pruning.");
  }

  var result = {
    status: "ok",
    source: source,
    coverage: coverage,
    parent: {
      qname: String(parentDbo.getQName()),
      className: C8O.dbo.logicalClassNameForDbo(parentDbo)
    },
    entry: {
      className: requestedClassName,
      resolvedClassName: resolvedClassName || requestedClassName,
      nameSuggestion: nameSuggestion
    },
    template: {
      related: String(parentDbo.getQName()),
      mode: "inside",
      className: resolvedClassName || requestedClassName,
      name: nameSuggestion
    },
    skeleton: skeleton,
    splitFileSkeleton: splitFileSkeleton,
    warnings: warnings
  };

  if (sourceDetails != null) {
    result.sourceDetails = sourceDetails;
  }

  if (includeHintsFlag) {
    result.propertyHints = mapHints(propertyHints, resolvedClassName || requestedClassName);
  }

  return result;
}

C8O.paletteJsonSkeleton.resolve = resolvePaletteJsonSkeleton;

var __c8oPaletteJsonSkeletonShouldRun = typeof __c8oPaletteJsonSkeletonAutoRun === "undefined" || __c8oPaletteJsonSkeletonAutoRun !== false;
if (__c8oPaletteJsonSkeletonShouldRun) {
  paletteJsonSkeletonResult = resolvePaletteJsonSkeleton({
    parent: typeof parent === "undefined" ? null : parent,
    className: typeof className === "undefined" ? null : className,
    name: typeof name === "undefined" ? null : name,
    includeHints: typeof includeHints === "undefined" ? null : includeHints
  });
}
