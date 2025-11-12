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
