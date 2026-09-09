/*
 * Generic utility helpers shared across lib_ConvertigoMCP scripts.
 * Can be safely included multiple times (idempotent definitions).
 */

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.util = C8O.util || {};
C8O.project = C8O.project || {};

C8O.project.resolveProjectDirectory = function (options) {
  var File = Packages.java.io.File;
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var opts = options || {};
  var projectInstance = null;
  var projectName = opts.projectName || (context && context.projectName) || (context && context.project) || "lib_ConvertigoMCP";
  if (opts.project) {
    projectInstance = opts.project;
  } else if (opts.projectName) {
    projectInstance = Engine.theApp.databaseObjectsManager.getOriginalProjectByName(String(projectName));
  } else if (context && context.requestedObject && context.requestedObject.getProject) {
    try {
      projectInstance = context.requestedObject.getProject();
    } catch (_ignore) {
      projectInstance = null;
    }
  }
  if (!projectInstance) {
    projectInstance = Engine.theApp.databaseObjectsManager.getOriginalProjectByName(String(projectName));
  }
  if (projectInstance == null) {
    throw new Error("Unable to resolve project '" + projectName + "'");
  }
  var dirFile = null;
  if (projectInstance.getDirFile) {
    var df = projectInstance.getDirFile();
    if (df != null) {
      dirFile = df;
    }
  }
  if (!dirFile && projectInstance.getDirPath) {
    var dirPath = projectInstance.getDirPath();
    if (dirPath != null) {
      dirFile = new File(String(dirPath));
    }
  }
  if (!dirFile && projectInstance.getProjectDirectory) {
    var value = projectInstance.getProjectDirectory();
    if (value != null) {
      dirFile = value instanceof File ? value : new File(String(value));
    }
  }
  if (!dirFile) {
    throw new Error("Project directory is not available for '" + projectName + "'");
  }
  return dirFile;
};

C8O.project._readProcessStream = function (stream) {
  if (!stream) {
    return "";
  }
  var Scanner = Packages.java.util.Scanner;
  var scanner = null;
  try {
    scanner = new Scanner(stream, "UTF-8").useDelimiter("\\A");
    return scanner.hasNext() ? String(scanner.next()) : "";
  } finally {
    if (scanner && scanner.close) {
      try {
        scanner.close();
      } catch (_ignoreScannerClose) {}
    }
  }
};

C8O.project._runCommand = function (args, cwd) {
  var ArrayList = Packages.java.util.ArrayList;
  var File = Packages.java.io.File;
  var ProcessBuilder = Packages.java.lang.ProcessBuilder;
  var command = new ArrayList();
  var items = args || [];
  for (var i = 0; i < items.length; i++) {
    command.add(String(items[i]));
  }
  var builder = new ProcessBuilder(command);
  if (cwd) {
    builder.directory(cwd instanceof File ? cwd : new File(String(cwd)));
  }
  var process = builder.start();
  var stdout = C8O.project._readProcessStream(process.getInputStream());
  var stderr = C8O.project._readProcessStream(process.getErrorStream());
  var exitCode = process.waitFor();
  return {
    exitCode: Number(exitCode || 0),
    stdout: C8O.util.toTrimmedString(stdout),
    stderr: C8O.util.toTrimmedString(stderr)
  };
};

C8O.project.bumpRightmostVersionSegment = function (versionText) {
  var version = C8O.util.toTrimmedString(versionText);
  if (!version.length) {
    return "";
  }
  var parts = version.split(".");
  if (!parts.length) {
    return "";
  }
  var lastIndex = parts.length - 1;
  if (!/^\d+$/.test(parts[lastIndex])) {
    return "";
  }
  var nextValue = parseInt(parts[lastIndex], 10) + 1;
  parts[lastIndex] = String(nextValue);
  return parts.join(".");
};

C8O.project.readHeadProjectVersion = function (projectDir) {
  var root = C8O.util.toTrimmedString(projectDir);
  if (!root.length) {
    return {
      gitRoot: "",
      headVersion: "",
      tracked: false,
      reason: "missing-project-dir"
    };
  }
  try {
    var gitRootResult = C8O.project._runCommand(["git", "-C", root, "rev-parse", "--show-toplevel"], root);
    if (gitRootResult.exitCode !== 0 || !gitRootResult.stdout.length) {
      return {
        gitRoot: "",
        headVersion: "",
        tracked: false,
        reason: "not-git"
      };
    }
    var gitRoot = gitRootResult.stdout;
    var trackedResult = C8O.project._runCommand(["git", "-C", gitRoot, "ls-files", "--error-unmatch", "c8oProject.yaml"], gitRoot);
    if (trackedResult.exitCode !== 0) {
      return {
        gitRoot: gitRoot,
        headVersion: "",
        tracked: false,
        reason: "project-file-not-tracked"
      };
    }
    var headResult = C8O.project._runCommand(["git", "-C", gitRoot, "show", "HEAD:c8oProject.yaml"], gitRoot);
    if (headResult.exitCode !== 0 || !headResult.stdout.length) {
      return {
        gitRoot: gitRoot,
        headVersion: "",
        tracked: false,
        reason: "head-project-file-unavailable"
      };
    }
    var match = /(?:^|\n)\s*version:\s*([^\n#]+)/.exec(headResult.stdout);
    return {
      gitRoot: gitRoot,
      headVersion: match && match[1] ? C8O.util.toTrimmedString(match[1]) : "",
      tracked: true,
      reason: ""
    };
  } catch (commandError) {
    return {
      gitRoot: "",
      headVersion: "",
      tracked: false,
      reason: String(commandError)
    };
  }
};

C8O.project.checkUpdateProjectVersion = function (projectInstance) {
  var result = {
    checked: false,
    bumped: false,
    dirty: false,
    previousVersion: "",
    version: "",
    headVersion: "",
    gitRoot: "",
    reason: "",
    message: ""
  };
  if (!projectInstance) {
    result.reason = "missing-project";
    return result;
  }
  try {
    result.previousVersion = C8O.util.toTrimmedString(projectInstance.getVersion ? projectInstance.getVersion() : "");
    result.version = result.previousVersion;
  } catch (_ignoreCurrentVersion) {}
  try {
    result.dirty = projectInstance.hasChanged === true;
  } catch (_ignoreDirtyFlag) {
    result.dirty = false;
  }
  if (!result.dirty) {
    result.reason = "project-clean";
    return result;
  }
  var projectDir = null;
  try {
    projectDir = C8O.project.resolveProjectDirectory({ project: projectInstance, projectName: String(projectInstance.getName()) });
  } catch (resolveError) {
    result.reason = String(resolveError);
    return result;
  }
  var gitInfo = C8O.project.readHeadProjectVersion(String(projectDir));
  result.checked = true;
  result.gitRoot = C8O.util.toTrimmedString(gitInfo.gitRoot);
  result.headVersion = C8O.util.toTrimmedString(gitInfo.headVersion);
  if (!gitInfo.tracked) {
    result.reason = gitInfo.reason || "not-tracked";
    return result;
  }
  if (!result.previousVersion.length) {
    result.reason = "missing-project-version";
    return result;
  }
  if (!result.headVersion.length) {
    result.reason = "missing-head-version";
    return result;
  }
  if (result.previousVersion !== result.headVersion) {
    result.reason = "version-already-diverged";
    return result;
  }
  var nextVersion = C8O.project.bumpRightmostVersionSegment(result.previousVersion);
  if (!nextVersion.length || nextVersion === result.previousVersion) {
    result.reason = "unsupported-version-format";
    return result;
  }
  try {
    if (typeof projectInstance.setVersion === "function") {
      projectInstance.setVersion(nextVersion);
    } else {
      result.reason = "setVersion-unavailable";
      return result;
    }
    result.bumped = true;
    result.version = nextVersion;
    result.message = "Project version auto-bumped from " + result.previousVersion + " to " + nextVersion + " before save.";
    return result;
  } catch (bumpError) {
    result.reason = String(bumpError);
    return result;
  }
};

/**
 * Returns a trimmed string representation or an empty string when null/undefined.
 */
C8O.util.toTrimmedString = function (value) {
  return value == null ? "" : String(value).trim();
};

/**
 * Parses auto-save flags ("false", "0", "no") into booleans.
 */
C8O.util.parseAutoSaveFlag = function (value, defaultValue) {
  if (value === undefined || value === null) {
    return defaultValue === undefined ? true : !!defaultValue;
  }
  var text = C8O.util.toTrimmedString(value).toLowerCase();
  if (text === "false" || text === "0" || text === "no") {
    return false;
  }
  if (text === "true" || text === "1" || text === "yes") {
    return true;
  }
  return defaultValue === undefined ? true : !!defaultValue;
};

/**
 * Backward-compatible alias for legacy commit flag parsing.
 */
C8O.util.parseCommitFlag = function (value, defaultValue) {
  return C8O.util.parseAutoSaveFlag(value, defaultValue);
};

/**
 * Attempts to JSON.parse the provided text. On failure, pushes an error descriptor when provided.
 */
C8O.util.tryParseJson = function (text, errors, label) {
  if (text == null || String(text).trim().length === 0) {
    return null;
  }
  try {
    return JSON.parse(String(text));
  } catch (parseError) {
    if (errors && errors.push) {
      errors.push({ name: label || "__parse__", message: String(parseError) });
    }
    return null;
  }
};

/**
 * Normalizes a value into boolean. Returns defaultValue when null/undefined.
 */
C8O.util.toBoolean = function (value, defaultValue) {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  var text = String(value).toLowerCase();
  if (text === "true" || text === "1" || text === "yes") {
    return true;
  }
  if (text === "false" || text === "0" || text === "no") {
    return false;
  }
  return defaultValue;
};

C8O.util.isPlainObject = function (value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
};

/**
 * Coerces a request value to a plain object.
 * Accepts plain objects, JSON object strings, and double-stringified JSON object strings.
 */
C8O.util.parseObjectInput = function (value, options) {
  var opts = options || {};
  var label = C8O.util.toTrimmedString(opts.label || "value");
  if (!label.length) {
    label = "value";
  }
  var allowEmpty = opts.allowEmpty !== false;
  var allowArray = opts.allowArray === true;
  var maxDepth = 3;

  function objectFromJavaMap(mapValue) {
    var out = {};
    try {
      var it = mapValue.keySet().iterator();
      while (it.hasNext()) {
        var key = it.next();
        out[String(key)] = mapValue.get(key);
      }
      return out;
    } catch (_ignoreMap) {
      return null;
    }
  }

  if (value != null) {
    try {
      var JavaMap = Packages.java.util.Map;
      if (value instanceof JavaMap) {
        var mapped = objectFromJavaMap(value);
        if (mapped != null) {
          return mapped;
        }
      }
    } catch (_ignoreJavaMap) {}

    // Keep only plain JS objects; Java wrappers (String, JSONObject...) must be parsed from text.
    var tag = "";
    try {
      tag = Object.prototype.toString.call(value);
    } catch (_ignoreTag) {
      tag = "";
    }
    if (tag === "[object Object]") {
      return value;
    }
    if (allowArray && tag === "[object Array]") {
      return value;
    }
  }

  var text = C8O.util.toTrimmedString(value);
  if (!text.length) {
    if (allowEmpty) {
      return {};
    }
    throw new Error(label + " is required");
  }

  var candidate = text;
  var depth = 0;
  while (depth < maxDepth) {
    var parsed = null;
    try {
      parsed = JSON.parse(candidate);
    } catch (parseError) {
      throw new Error(label + " must be a JSON object: " + parseError);
    }
    if (C8O.util.isPlainObject(parsed)) {
      return parsed;
    }
    if (allowArray && Array.isArray(parsed)) {
      return parsed;
    }
    if (typeof parsed === "string") {
      var nested = C8O.util.toTrimmedString(parsed);
      if (nested.length) {
        candidate = nested;
        depth++;
        continue;
      }
    }
    break;
  }

  throw new Error(label + (allowArray ? " must be a JSON object or array" : " must be a JSON object"));
};

/**
 * Converts a Rhino/Java value into a printable preview string.
 */
C8O.util.previewValue = function (value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (_ignore) {
      return String(value);
    }
  }
  return String(value);
};

/**
 * Recursively converts Rhino/Java values into JSON-safe plain JS values.
 */
C8O.util.toJsonSafe = function (value, options) {
  var opts = options || {};
  var warnings = opts.warnings && opts.warnings.push ? opts.warnings : null;
  var path = C8O.util.toTrimmedString(opts.path || "$");
  var maxDepth = opts.maxDepth == null ? 12 : opts.maxDepth;
  var seen = opts._seen || [];

  function addWarning(message) {
    if (warnings) {
      warnings.push(path + ": " + message);
    }
  }

  function convert(current, currentPath, depth) {
    var localOpts = {
      warnings: warnings,
      maxDepth: maxDepth,
      _seen: seen
    };
    localOpts.path = currentPath;
    return C8O.util.toJsonSafe(current, localOpts);
  }

  try {
    var NativeJavaObject = Packages.org.mozilla.javascript.NativeJavaObject;
    if (value instanceof NativeJavaObject) {
      value = value.unwrap();
    }
  } catch (_ignoreNativeJavaObject) {}

  if (value === null || value === undefined) {
    return null;
  }
  if (maxDepth <= 0) {
    addWarning("max depth reached during JSON-safe conversion");
    return C8O.util.previewValue(value);
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  try {
    if (value instanceof Packages.java.lang.Number) {
      return Number(value);
    }
  } catch (_ignoreJavaNumber) {}
  try {
    if (value instanceof Packages.java.lang.Boolean) {
      return Boolean(value.booleanValue());
    }
  } catch (_ignoreJavaBoolean) {}
  try {
    if (value instanceof Packages.java.lang.CharSequence) {
      return String(value);
    }
  } catch (_ignoreJavaCharSequence) {}

  if (Array.isArray(value)) {
    var jsArray = [];
    for (var i = 0; i < value.length; i++) {
      jsArray.push(convert(value[i], path + "[" + i + "]", maxDepth - 1));
    }
    return jsArray;
  }

  try {
    if (value instanceof Packages.java.util.Map) {
      var mapped = {};
      var mapIterator = value.entrySet().iterator();
      while (mapIterator.hasNext()) {
        var mapEntry = mapIterator.next();
        var mapKey = String(mapEntry.getKey());
        mapped[mapKey] = convert(mapEntry.getValue(), path + "." + mapKey, maxDepth - 1);
      }
      return mapped;
    }
  } catch (_ignoreJavaMap) {}

  try {
    if (value instanceof Packages.java.util.Collection) {
      var coll = [];
      var collIterator = value.iterator();
      var index = 0;
      while (collIterator.hasNext()) {
        coll.push(convert(collIterator.next(), path + "[" + index + "]", maxDepth - 1));
        index++;
      }
      return coll;
    }
  } catch (_ignoreJavaCollection) {}

  if (typeof value === "object") {
    for (var si = 0; si < seen.length; si++) {
      if (seen[si] === value) {
        addWarning("circular reference replaced with preview string");
        return C8O.util.previewValue(value);
      }
    }
    seen.push(value);
    try {
      var tag = "";
      try {
        tag = Object.prototype.toString.call(value);
      } catch (_ignoreTag) {
        tag = "";
      }
      if (tag === "[object Object]") {
        var plain = {};
        for (var key in value) {
          if (Object.prototype.hasOwnProperty.call(value, key)) {
            plain[key] = convert(value[key], path + "." + key, maxDepth - 1);
          }
        }
        return plain;
      }
    } finally {
      seen.pop();
    }
  }

  addWarning("non-plain value converted to preview string");
  return C8O.util.previewValue(value);
};

/**
 * Builds a standard result envelope for operations that need status/message metadata.
 */
C8O.util.makeFileResult = function (status, message, extras) {
  var result = {
    status: status || "ok",
    message: message || "",
    timestamp: java.lang.System.currentTimeMillis()
  };
  if (extras && typeof extras === "object") {
    for (var key in extras) {
      if (Object.prototype.hasOwnProperty.call(extras, key)) {
        result[key] = extras[key];
      }
    }
  }
  return result;
};


C8O.requestable = C8O.requestable || {};

C8O.requestable._findChild = function (container, options) {
  var opts = options || {};
  function matches(node) {
    if (!node) {
      return false;
    }
    var matchesName = !opts.name;
    if (!matchesName) {
      try {
        matchesName = node.getName && String(node.getName()) === opts.name;
      } catch (_ignoreName) {
        matchesName = false;
      }
    }
    var matchesClass = !opts.className;
    if (!matchesClass) {
      try {
        matchesClass = node.getClass() && String(node.getClass().getName()) === opts.className;
      } catch (_ignoreClass) {
        matchesClass = false;
      }
    }
    return matchesName && matchesClass;
  }

  function walk(node) {
    if (!node) {
      return null;
    }
    if (matches(node)) {
      return node;
    }
    var children = null;
    try {
      children = node.getDatabaseObjectChildren ? node.getDatabaseObjectChildren() : null;
    } catch (_ignoreChildren) {
      children = null;
    }
    if (!children) {
      return null;
    }
    for (var i = 0; i < children.size(); i++) {
      var child = children.get(i);
      var found = walk(child);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (!container) {
    return null;
  }
  var roots = null;
  try {
    roots = container.getDatabaseObjectChildren ? container.getDatabaseObjectChildren() : null;
  } catch (_ignoreRoot) {
    roots = null;
  }
  if (!roots) {
    return null;
  }
  for (var i = 0; i < roots.size(); i++) {
    var target = walk(roots.get(i));
    if (target) {
      return target;
    }
  }
  return null;
};

C8O.requestable._clearVariables = function (step) {
  if (!step) {
    return;
  }
  var vars = null;
  try {
    vars = step.getVariables ? step.getVariables() : null;
  } catch (_ignoreVars) {
    vars = null;
  }
  if (!vars) {
    return;
  }
  var iter = vars.iterator();
  var buffer = [];
  while (iter.hasNext()) {
    buffer.push(iter.next());
  }
  for (var i = 0; i < buffer.length; i++) {
    step.remove(buffer[i]);
  }
};

C8O.requestable._addVariables = function (step, map) {
  if (!step || !map) {
    return;
  }
  var StepVariable = Packages.com.twinsoft.convertigo.beans.variables.StepVariable;
  function addSingle(key, rawValue) {
    if (rawValue === null || rawValue === undefined) {
      return;
    }
    var sv = new StepVariable();
    sv.setName(String(key));
    sv.setValueOrNull(String(rawValue));
    step.addVariable(sv);
  }
  for (var key in map) {
    if (!Object.prototype.hasOwnProperty.call(map, key)) {
      continue;
    }
    var value = map[key];
    if (value === null || value === undefined) {
      continue;
    }
    try {
      this[key] = value;
    } catch (_ignoreAssign) {}
    if (Object.prototype.toString.call(value) === '[object Array]') {
      for (var i = 0; i < value.length; i++) {
        addSingle(key, value[i]);
      }
    } else if (typeof value === 'object') {
      addSingle(key, JSON.stringify(value));
    } else {
      addSingle(key, value);
    }
  }
};

C8O.requestable._resetExecutionState = function (executionPlan, seqStep, txStep) {
  if (!executionPlan || !C8O.dbo) {
    return;
  }
  if (executionPlan.isSequence) {
    try {
      var seqQName = executionPlan.project + ".sq:" + executionPlan.name;
      var seqDbo = C8O.dbo.resolve(seqQName, { optional: true });
      C8O.dbo._resetIfNeeded(seqStep, []);
      C8O.dbo._resetIfNeeded(seqDbo, []);
      if (seqDbo && seqDbo.getProject) {
        C8O.dbo._resetIfNeeded(seqDbo.getProject(), []);
      }
    } catch (_ignoreSeqReset) {}
    return;
  }
  try {
    var txQName = executionPlan.project + ".cn:" + executionPlan.connector + ".tr:" + executionPlan.name;
    var txDbo = C8O.dbo.resolve(txQName, { optional: true });
    C8O.dbo._resetIfNeeded(txStep, []);
    C8O.dbo._resetIfNeeded(txDbo, []);
    if (txDbo && txDbo.getConnector) {
      C8O.dbo._resetIfNeeded(txDbo.getConnector(), []);
    }
    if (txDbo && txDbo.getProject) {
      C8O.dbo._resetIfNeeded(txDbo.getProject(), []);
    }
  } catch (_ignoreTxReset) {}
};

/**
 * Configures the CallSequence/CallTransaction steps inside tools_requestable_execute
 * so that sequences/transactions can be invoked without relying on a separate internal_call.
 */
C8O.requestable.configureExecutor = function (executionPlan) {
  if (Packages.com.twinsoft.convertigo.engine.Engine.logEngine) {
    Packages.com.twinsoft.convertigo.engine.Engine.logEngine.debug('[tools_requestable_execute] configuring ' + (executionPlan && executionPlan.requestable ? executionPlan.requestable : 'n/a'));
  }
  if (!executionPlan) {
    throw new Error('Execution plan is missing');
  }

  var EngineLog = Packages.com.twinsoft.convertigo.engine.Engine.logEngine;
  var SequenceClassName = 'com.twinsoft.convertigo.beans.steps.SequenceStep';
  var TransactionClassName = 'com.twinsoft.convertigo.beans.steps.TransactionStep';

  var seqStep = C8O.requestable._findChild(context.requestedObject, { name: 'CallSequence', className: SequenceClassName });
  var txStep = C8O.requestable._findChild(context.requestedObject, { name: 'CallTransaction', className: TransactionClassName });

  if (executionPlan.isSequence) {
    if (!seqStep) {
      throw new Error('CallSequence step not found');
    }
    seqStep.setSourceSequence(executionPlan.project + '.' + executionPlan.name);
    C8O.requestable._clearVariables(seqStep);
    C8O.requestable._addVariables(seqStep, executionPlan.variables || {});
    C8O.requestable._resetExecutionState(executionPlan, seqStep, txStep);
    if (EngineLog) {
      var seqCount = seqStep.getVariables() != null ? seqStep.getVariables().size() : 0;
      EngineLog.debug('[tools_requestable_execute] sequence vars=' + seqCount + ' target=' + executionPlan.project + '.' + executionPlan.name);
    }
    if (txStep) {
      C8O.requestable._clearVariables(txStep);
    }
    return;
  }

  if (!executionPlan.connector) {
    throw new Error('connector is required for transactions');
  }
  if (!txStep) {
    throw new Error('CallTransaction step not found');
  }
  txStep.setSourceTransaction(executionPlan.project + '.' + executionPlan.connector + '.' + executionPlan.name);
  C8O.requestable._clearVariables(txStep);
  C8O.requestable._addVariables(txStep, executionPlan.variables || {});
  C8O.requestable._resetExecutionState(executionPlan, seqStep, txStep);
  if (executionPlan.recordSchema === true) {
    try {
      var txQName = executionPlan.project + '.cn:' + executionPlan.connector + '.tr:' + executionPlan.name;
      var txDbo = C8O.dbo.resolve(txQName);
      if (txDbo && txDbo.writeSchemaToFile) {
        txDbo.writeSchemaToFile(null);
        try {
          var txProject = txDbo.getProject ? txDbo.getProject() : null;
          if (txProject) {
            Packages.com.twinsoft.convertigo.engine.Engine.theApp.schemaManager.loadProjectSchema(String(txProject.getName()));
          }
        } catch (_ignoreSchemaReload) {}
      }
    } catch (_ignoreSchemaRecord) {}
  }
  if (EngineLog) {
    var txCount = txStep.getVariables() != null ? txStep.getVariables().size() : 0;
    EngineLog.debug('[tools_requestable_execute] transaction vars=' + txCount + ' target=' + executionPlan.project + '.' + executionPlan.connector + '.' + executionPlan.name);
  }
};
