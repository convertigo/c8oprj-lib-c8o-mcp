var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
var File = Packages.java.io.File;
var FileInputStream = Packages.java.io.FileInputStream;
var Properties = Packages.java.util.Properties;
var ArrayList = Packages.java.util.ArrayList;
var LinkedHashMap = Packages.java.util.LinkedHashMap;
var LinkedHashSet = Packages.java.util.LinkedHashSet;
var FileUtils = Packages.org.apache.commons.io.FileUtils;

var requestedProject = project == null ? "" : String(project).trim();
var filterText = filter == null ? "" : String(filter).trim().toLowerCase();
var requestedScope = scope == null ? "" : String(scope).trim().toLowerCase();
var includeFullValues = String(includeValues) == "true";
var dbom = Engine.theApp.databaseObjectsManager;
var scopeApplied = requestedProject.length > 0 ? "project" : "all";
if (requestedScope === "all") {
  scopeApplied = "all";
}
if (requestedScope === "project" && requestedProject.length > 0) {
  scopeApplied = "project";
}
var projectFound = requestedProject.length === 0;
var symbolsStatus = "ok";

function trimmed(value) {
  return value == null ? "" : String(value).trim();
}

function hasKey(map, key) {
  return map[key] !== undefined;
}

function maskValue(value) {
  var text = trimmed(value);
  if (text.length === 0) {
    return "";
  }
  if (includeFullValues) {
    return text;
  }
  if (text.length <= 4) {
    return "****";
  }
  return text.substring(0, 2) + "****" + text.substring(text.length - 2);
}

var symbolsList = new ArrayList();
var seenKeys = new LinkedHashSet();

function parseSymbolReference(expression) {
  var raw = trimmed(expression);
  var eqIndex = raw.indexOf("=");
  if (eqIndex === -1) {
    return {
      name: raw,
      hasInlineDefault: false,
      inlineDefault: ""
    };
  }
  return {
    name: trimmed(raw.substring(0, eqIndex)),
    hasInlineDefault: true,
    inlineDefault: raw.substring(eqIndex + 1)
  };
}

function addSymbol(projectName, name, scope, visibility, value, source) {
  var symbolName = trimmed(name);
  if (symbolName.length === 0) {
    return;
  }
  if (filterText.length > 0 && symbolName.toLowerCase().indexOf(filterText) === -1) {
    return;
  }

  var dedupeKey = trimmed(projectName) + "|" + trimmed(scope) + "|" + symbolName;
  if (seenKeys.contains(dedupeKey)) {
    return;
  }
  seenKeys.add(dedupeKey);

  var entry = new LinkedHashMap();
  entry.put("project", trimmed(projectName));
  entry.put("name", symbolName);
  entry.put("scope", trimmed(scope));
  entry.put("visibility", trimmed(visibility));
  entry.put("hasValue", java.lang.Boolean.valueOf(trimmed(value).length > 0));
  entry.put("value", includeFullValues ? trimmed(value) : "");
  entry.put("valuePreview", maskValue(value));
  entry.put("source", trimmed(source));
  symbolsList.add(entry);
}

function loadProperties(file) {
  var props = new Properties();
  var fis = new FileInputStream(file);
  try {
    props.load(fis);
  } finally {
    try { fis.close(); } catch (_ignoreClose) {}
  }
  return props;
}

function scanYamlFile(projectName, file, globalValues, defaultValues) {
  var text = "";
  try {
    text = String(FileUtils.readFileToString(file, "utf-8"));
  } catch (_readError) {
    return;
  }

  var regex = /\$\{([^}]+)\}/g;
  var match = null;
  while ((match = regex.exec(text)) !== null) {
    var parsedRef = parseSymbolReference(match[1]);
    var symbolName = parsedRef.name;
    if (symbolName.length === 0) {
      continue;
    }

    var visibility = "missing";
    var value = "";
    if (hasKey(globalValues, symbolName)) {
      visibility = "resolved-global";
      value = globalValues[symbolName];
    } else if (hasKey(defaultValues, symbolName)) {
      visibility = "resolved-default";
      value = defaultValues[symbolName];
    } else if (parsedRef.hasInlineDefault) {
      visibility = "resolved-inline-default";
      value = parsedRef.inlineDefault;
    }
    addSymbol(projectName, symbolName, "project-reference", visibility, value, file.getAbsolutePath());
  }
}

function scanProjectReferences(projectName, globalValues, defaultValues) {
  var rootYaml = null;
  try {
    rootYaml = Engine.projectYamlFile(projectName);
  } catch (_ignoreProjectYaml) {
    rootYaml = null;
  }
  if (rootYaml != null && rootYaml.exists()) {
    scanYamlFile(projectName, rootYaml, globalValues, defaultValues);
  }

  var projectDir = null;
  try {
    projectDir = new File(Engine.projectDir(projectName), "_c8oProject");
  } catch (_ignoreProjectDir) {
    projectDir = null;
  }
  if (projectDir == null || !projectDir.exists()) {
    return;
  }

  var stack = new ArrayList();
  stack.add(projectDir);
  while (!stack.isEmpty()) {
    var current = stack.remove(stack.size() - 1);
    var children = current.listFiles();
    if (children == null) {
      continue;
    }
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (child.isDirectory()) {
        stack.add(child);
      } else if (String(child.getName()).toLowerCase().endsWith(".yaml")) {
        scanYamlFile(projectName, child, globalValues, defaultValues);
      }
    }
  }
}

var globalValues = {};
var globalSymbolsFile = null;
var explicitGlobalFile = java.lang.System.getProperty(Engine.JVM_PROPERTY_GLOBAL_SYMBOLS_FILE);
if (trimmed(explicitGlobalFile).length > 0) {
  globalSymbolsFile = new File(String(explicitGlobalFile));
}
if ((globalSymbolsFile == null || !globalSymbolsFile.exists()) && Engine.CONFIGURATION_PATH != null) {
  var fallbackFile = new File(String(Engine.CONFIGURATION_PATH), "global_symbols.properties");
  if (fallbackFile.exists()) {
    globalSymbolsFile = fallbackFile;
  }
}

if (globalSymbolsFile != null && globalSymbolsFile.exists()) {
  var props = loadProperties(globalSymbolsFile);
  var names = props.propertyNames();
  while (names.hasMoreElements()) {
    var key = String(names.nextElement());
    var value = props.getProperty(key);
    globalValues[key] = value;
    if (scopeApplied === "all" && projectFound) {
      addSymbol("", key, "global", "resolved", value, globalSymbolsFile.getAbsolutePath());
    }
  }
}

var projectNames = new ArrayList();
if (requestedProject.length > 0) {
  var requested = dbom.getOriginalProjectByName(requestedProject);
  if (requested == null) {
    projectFound = false;
    symbolsStatus = "not_found";
  } else {
    projectFound = true;
    projectNames.add(requestedProject);
  }
} else {
  var namesList = dbom.getAllProjectNamesList();
  for (var ni = 0; ni < namesList.size(); ni++) {
    projectNames.add(String(namesList.get(ni)));
  }
}

var scannedReferenceProjects = 0;
var referenceScanEnabled = projectFound && (requestedProject.length > 0 || projectNames.size() <= 10);

for (var pi = 0; pi < projectNames.size(); pi++) {
  var projectName = String(projectNames.get(pi));
  var projectObject = dbom.getOriginalProjectByName(projectName);
  if (projectObject == null) {
    continue;
  }

  var defaultValues = {};
  try {
    var defaults = projectObject.defaultSymbols;
    if (defaults != null) {
      var iterator = defaults.iterator();
      while (iterator.hasNext()) {
        var pair = iterator.next();
        var name = pair.getLeft();
        var value = pair.getRight();
        defaultValues[String(name)] = value;
        addSymbol(projectName, name, "project-default", "default", value, "Project.defaultSymbols");
      }
    }
  } catch (_ignoreDefaults) {}

  if (referenceScanEnabled) {
    scannedReferenceProjects++;
    scanProjectReferences(projectName, globalValues, defaultValues);
  }
}

var summaryMap = new LinkedHashMap();
summaryMap.put("status", symbolsStatus);
summaryMap.put("scopeApplied", scopeApplied);
summaryMap.put("projectFound", java.lang.Boolean.valueOf(projectFound));
summaryMap.put("requestedProject", requestedProject);
summaryMap.put("returned", java.lang.Integer.valueOf(symbolsList.size()));
summaryMap.put("projectCount", java.lang.Integer.valueOf(projectNames.size()));
summaryMap.put("referenceScanEnabled", java.lang.Boolean.valueOf(referenceScanEnabled));
summaryMap.put("scannedReferenceProjects", java.lang.Integer.valueOf(scannedReferenceProjects));
summaryMap.put("globalSymbolsFile", scopeApplied === "all" && globalSymbolsFile != null ? globalSymbolsFile.getAbsolutePath() : "");
