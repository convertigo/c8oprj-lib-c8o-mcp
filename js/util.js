/*
 * Generic utility helpers shared across ConvertigoMCP scripts.
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
  if (opts.project) {
    projectInstance = opts.project;
  } else if (context && context.requestedObject && context.requestedObject.getProject) {
    try {
      projectInstance = context.requestedObject.getProject();
    } catch (_ignore) {
      projectInstance = null;
    }
  }
  var projectName = opts.projectName || (context && context.projectName) || (context && context.project) || "ConvertigoMCP";
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


