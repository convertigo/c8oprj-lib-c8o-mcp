if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.dbo = C8O.dbo || {};
include("js/mobile_builder_cycle.js");

C8O.dbo.saveProject = function (project, errors) {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  if (project == null) {
    var message = "No project reference provided";
    if (errors && errors.push) {
      errors.push({ name: "__save__", message: message });
    }
    return { saved: false, message: message };
  }
  try {
    var versionUpdate = null;
    try {
      versionUpdate = C8O.project.checkUpdateProjectVersion(project);
    } catch (versionError) {
      versionUpdate = {
        checked: false,
        bumped: false,
        dirty: false,
        previousVersion: "",
        version: C8O.util.toTrimmedString(project && project.getVersion ? project.getVersion() : ""),
        headVersion: "",
        gitRoot: "",
        reason: String(versionError),
        message: ""
      };
    }
    Engine.theApp.databaseObjectsManager.exportProject(project);
    var invalidation = C8O.dbo.invalidateProjectRuntime(project, errors);
    var finalVersion = "";
    try {
      finalVersion = C8O.util.toTrimmedString(project.getVersion ? project.getVersion() : "");
    } catch (_ignoreFinalVersion) {
      finalVersion = versionUpdate && versionUpdate.version ? String(versionUpdate.version) : "";
    }
    return {
      saved: true,
      message: "",
      versionChecked: !!(versionUpdate && versionUpdate.checked === true),
      versionDirty: !!(versionUpdate && versionUpdate.dirty === true),
      versionBumped: !!(versionUpdate && versionUpdate.bumped === true),
      previousVersion: versionUpdate && versionUpdate.previousVersion ? String(versionUpdate.previousVersion) : "",
      version: finalVersion,
      headVersion: versionUpdate && versionUpdate.headVersion ? String(versionUpdate.headVersion) : "",
      versionReason: versionUpdate && versionUpdate.reason ? String(versionUpdate.reason) : "",
      versionMessage: versionUpdate && versionUpdate.message ? String(versionUpdate.message) : "",
      runtimeInvalidated: invalidation.invalidated === true,
      invalidatedProject: invalidation.project || "",
      invalidatedQNames: invalidation.resetQNames || []
    };
  } catch (saveError) {
    var saveMessage = String(saveError);
    if (errors && errors.push) {
      errors.push({ name: "__save__", message: saveMessage });
    }
    return { saved: false, message: saveMessage };
  }
};

C8O.dbo.invalidateProjectRuntime = function (projectOrName, errors) {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var project = null;
  if (projectOrName != null) {
    if (typeof projectOrName === "string") {
      try {
        project = Engine.theApp.databaseObjectsManager.getOriginalProjectByName(C8O.util.toTrimmedString(projectOrName));
      } catch (_ignoreProjectLookup) {
        project = null;
      }
    } else {
      project = projectOrName;
    }
  }
  var result = {
    invalidated: false,
    project: "",
    resetQNames: [],
    schemaCacheCleared: false,
    message: ""
  };
  if (project == null) {
    result.message = "No project reference provided";
    return result;
  }
  try {
    result.project = String(project.getName());
  } catch (_ignoreProjectName) {
    result.project = "";
  }
  try {
    C8O.dbo._resetIfNeeded(project, result.resetQNames);
  } catch (resetError) {
    result.message = String(resetError);
    if (errors && errors.push) {
      errors.push({ name: "__invalidate__", message: result.message });
    }
  }
  try {
    Engine.theApp.schemaManager.clearCache(result.project);
    result.schemaCacheCleared = true;
  } catch (_ignoreSchemaCache) {}
  result.invalidated = result.resetQNames.length > 0 || result.schemaCacheCleared === true;
  return result;
};

C8O.dbo.saveProjectIfNeeded = function (project, autoSaveFlag, errors) {
  if (!autoSaveFlag) {
    return {
      saved: false,
      message: "",
      skipped: true,
      versionChecked: false,
      versionDirty: false,
      versionBumped: false,
      previousVersion: "",
      version: "",
      headVersion: "",
      versionReason: "auto-save-disabled",
      versionMessage: ""
    };
  }
  return C8O.dbo.saveProject(project, errors);
};

C8O.dbo._isMobileObject = function (dbo) {
  if (!dbo) {
    return false;
  }
  try {
    var MobileObjectClass = Packages.com.twinsoft.convertigo.beans.core.MobileObject;
    return MobileObjectClass.isInstance(dbo);
  } catch (_ignoreMobileObjectClass) {}
  try {
    var className = String(dbo.getClass().getName());
    return className.indexOf(".beans.ngx.") !== -1 || className.indexOf(".beans.mobile.") !== -1;
  } catch (_ignoreMobileObjectName) {
    return false;
  }
};

C8O.dbo._isInstanceOf = function (value, fqcn) {
  if (!value || !fqcn) {
    return false;
  }
  try {
    var cls = Packages.java.lang.Class.forName(String(fqcn));
    return cls.isInstance(value);
  } catch (_ignoreIsInstance) {
    return false;
  }
};

C8O.dbo._safeQName = function (dbo) {
  if (!dbo) {
    return "";
  }
  try {
    if (dbo.getQName) {
      return String(dbo.getQName());
    }
  } catch (_ignoreQName) {}
  try {
    if (dbo.getFullQName) {
      return String(dbo.getFullQName());
    }
  } catch (_ignoreFullQName) {}
  return "";
};

C8O.dbo._resetIfNeeded = function (target, resetQNames) {
  if (!target) {
    return;
  }
  var qname = C8O.dbo._safeQName(target);
  try {
    if (typeof target.isReset === "function" && typeof target.reset === "function") {
      if (!target.isReset()) {
        target.reset();
        if (resetQNames && resetQNames.push && qname.length) {
          resetQNames.push(qname);
        }
      }
      return;
    }
    if (typeof target.reset === "function") {
      target.reset();
      if (resetQNames && resetQNames.push && qname.length) {
        resetQNames.push(qname);
      }
    }
  } catch (_ignoreReset) {}
};

C8O.dbo._resolveNgxRefreshContext = function (dbo) {
  var context = {
    mainScriptComponent: null,
    application: null,
    resetQNames: []
  };
  if (!dbo) {
    return context;
  }

  var main = null;
  try {
    if (C8O.dbo._isInstanceOf(dbo, "com.twinsoft.convertigo.beans.ngx.components.UIComponent") && typeof dbo.getMainScriptComponent === "function") {
      main = dbo.getMainScriptComponent();
    }
  } catch (_ignoreMainScriptComponent) {
    main = null;
  }

  if (!main) {
    try {
      if (C8O.dbo._isInstanceOf(dbo, "com.twinsoft.convertigo.beans.ngx.components.ApplicationComponent")
        || C8O.dbo._isInstanceOf(dbo, "com.twinsoft.convertigo.beans.ngx.components.PageComponent")
        || C8O.dbo._isInstanceOf(dbo, "com.twinsoft.convertigo.beans.ngx.components.UISharedComponent")) {
        main = dbo;
      }
    } catch (_ignoreMainFallback) {
      main = null;
    }
  }
  context.mainScriptComponent = main;

  var app = null;
  try {
    if (main && typeof main.getApplication === "function") {
      app = main.getApplication();
    }
  } catch (_ignoreMainApplication) {
    app = null;
  }
  if (!app) {
    try {
      if (typeof dbo.getApplication === "function") {
        app = dbo.getApplication();
      }
    } catch (_ignoreDboApplication) {
      app = null;
    }
  }
  context.application = app;

  C8O.dbo._resetIfNeeded(main, context.resetQNames);
  C8O.dbo._resetIfNeeded(app, context.resetQNames);

  return context;
};

C8O.dbo.triggerMobileBuilderRefresh = function (dbo, errors) {
  var result = {
    requested: false,
    studioMode: false,
    mobileObject: false,
    triggered: false,
    message: "",
    strategy: "",
    resetQNames: []
  };

  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var MobileBuilder = Packages.com.twinsoft.convertigo.engine.mobile.MobileBuilder;
  var BatchOperationHelper = Packages.com.twinsoft.convertigo.engine.helpers.BatchOperationHelper;

  try {
    result.studioMode = Engine.isStudioMode() === true;
  } catch (_ignoreStudioMode) {
    result.studioMode = false;
  }
  result.mobileObject = C8O.dbo._isMobileObject(dbo);
  result.requested = result.studioMode && result.mobileObject;

  if (!result.requested) {
    result.message = !result.studioMode ? "Skipped: Studio mode required" : "Skipped: target is not a mobile object";
    return result;
  }

  var mb = null;
  try {
    mb = MobileBuilder.getBuilderOf(dbo);
  } catch (builderLookupError) {
    var lookupMessage = "Unable to resolve mobile builder: " + String(builderLookupError);
    result.message = lookupMessage;
    if (errors && errors.push) {
      errors.push({ name: "__mobileBuilder__", message: lookupMessage });
    }
    return result;
  }
  if (mb == null) {
    result.message = "Skipped: no mobile builder for target";
    return result;
  }

  var context = C8O.dbo._resolveNgxRefreshContext(dbo);
  if (context && context.resetQNames && context.resetQNames.length) {
    result.resetQNames = context.resetQNames;
  }

  var batchStarted = false;
  var batchStopped = false;
  var pendingProjectName = "";
  var pendingBuildTimestamp = 0;
  try {
    try {
      var refreshProject = dbo.getProject ? dbo.getProject() : null;
      pendingProjectName = refreshProject && refreshProject.getName ? String(refreshProject.getName()) : "";
      if (pendingProjectName.length) {
        pendingBuildTimestamp = C8O.mobileBuilderCycle.mark(pendingProjectName);
      }
    } catch (_ignorePendingBuildMarker) {
      pendingProjectName = "";
      pendingBuildTimestamp = 0;
    }
    mb.prepareBatchBuild();
    BatchOperationHelper.start();
    batchStarted = true;
    var refreshStrategies = [];
    var refreshed = false;
    var mainComponent = context ? context.mainScriptComponent : null;
    var application = context ? context.application : null;
    if (mainComponent != null && typeof mainComponent.updateSourceFiles === "function") {
      mainComponent.updateSourceFiles();
      refreshStrategies.push("mainScriptComponent.updateSourceFiles");
      refreshed = true;
    }
    if (application != null
      && typeof application.updateSourceFiles === "function"
      && application !== mainComponent) {
      application.updateSourceFiles();
      refreshStrategies.push("application.updateSourceFiles");
      refreshed = true;
    }
    if (refreshed) {
      result.strategy = refreshStrategies.join(" + ");
    } else {
      mb.appChanged();
      result.strategy = "builder.appChanged";
    }
    C8O.mobileBuilderCycle.completeAfterBatch(pendingProjectName, pendingBuildTimestamp);
    BatchOperationHelper.stop();
    batchStopped = true;

    result.triggered = true;
    result.message = "Mobile builder refresh triggered via " + result.strategy;
  } catch (builderError) {
    if (pendingProjectName.length && pendingBuildTimestamp > 0) {
      C8O.mobileBuilderCycle.fail(pendingProjectName, pendingBuildTimestamp, String(builderError));
    }
    var builderMessage = "Unable to trigger mobile builder refresh: " + String(builderError);
    result.message = builderMessage;
    if (errors && errors.push) {
      errors.push({ name: "__mobileBuilder__", message: builderMessage });
    }
  } finally {
    if (batchStarted && !batchStopped) {
      try {
        BatchOperationHelper.stop();
      } catch (_ignoreStopBatch) {}
    }
    try {
      BatchOperationHelper.cancel();
    } catch (_ignoreCancelBatch) {}
  }

  return result;
};

C8O.dbo.applyUpdatesAndPersist = function (options) {
  options = options || {};

  var dbo = options.dbo || null;
  var projectRef = options.project || null;
  var updates = (options.updates && typeof options.updates === "object") ? options.updates : {};
  var errors = options.errors && options.errors.push ? options.errors : [];
  var autoSaveFlag = options.autoSave === true;
  var persistIfNoUpdate = options.persistIfNoUpdate === true;
  var markChanged = options.markChanged !== false;
  var triggerMobileBuilder = options.triggerMobileBuilder !== false;

  var appliedEntries = [];
  var skippedEntries = [];
  if (dbo && updates && Object.keys(updates).length > 0) {
    var applyResult = C8O.dbo.applyPropertyUpdates(dbo, updates);
    appliedEntries = applyResult.applied || [];
    skippedEntries = applyResult.skipped || [];
    if (applyResult.errors && applyResult.errors.length) {
      Array.prototype.push.apply(errors, applyResult.errors);
    }
  }

  if (projectRef == null && dbo && dbo.getProject) {
    try {
      projectRef = dbo.getProject();
    } catch (_ignoreProjectLookup) {}
  }

  var changed = appliedEntries.length > 0 || persistIfNoUpdate;
  var mobileBuilderRefresh = { requested: false, studioMode: false, mobileObject: false, triggered: false, message: "" };
  var saveResult = { saved: false, message: "", skipped: true };

  if (changed) {
    if (markChanged && dbo != null) {
      try {
        dbo.hasChanged = true;
      } catch (_ignoreDboChanged) {}
    }
    if (markChanged && projectRef != null) {
      try {
        projectRef.hasChanged = true;
      } catch (_ignoreProjectChanged) {}
    }
    if (triggerMobileBuilder && dbo != null) {
      mobileBuilderRefresh = C8O.dbo.triggerMobileBuilderRefresh(dbo, errors);
    }
    saveResult = C8O.dbo.saveProjectIfNeeded(projectRef, autoSaveFlag, errors);
  }

  return {
    applied: appliedEntries,
    skipped: skippedEntries,
    errors: errors,
    project: projectRef,
    changed: changed,
    mobileBuilderRefresh: mobileBuilderRefresh,
    saveResult: saveResult,
    saved: saveResult && saveResult.saved === true
  };
};

C8O.dbo.finalizeMutationsByQNames = function (options) {
  options = options || {};
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var autoSave = options.autoSave !== false;
  var triggerMobileBuilder = options.triggerMobileBuilder !== false;
  var errors = options.errors && options.errors.push ? options.errors : [];
  var sourceQNames = Array.isArray(options.qnames) ? options.qnames : [];

  var touchedQNames = [];
  var touchedQNameSet = {};
  var projectMap = {};
  var projectAnchorMap = {};

  function addTouchedQName(value) {
    var text = C8O.util.toTrimmedString(value);
    if (!text.length || touchedQNameSet[text]) {
      return;
    }
    touchedQNameSet[text] = true;
    touchedQNames.push(text);
  }

  function resolveProjectByName(projectName) {
    var text = C8O.util.toTrimmedString(projectName);
    if (!text.length) {
      return null;
    }
    try {
      return Engine.theApp.databaseObjectsManager.getOriginalProjectByName(text, false);
    } catch (_ignoreProjectByNameWithFlag) {
      try {
        return Engine.theApp.databaseObjectsManager.getOriginalProjectByName(text);
      } catch (_ignoreProjectByName) {
        return null;
      }
    }
  }

  for (var i = 0; i < sourceQNames.length; i++) {
    var qname = C8O.util.toTrimmedString(sourceQNames[i]);
    if (!qname.length) {
      continue;
    }
    addTouchedQName(qname);

    var dbo = C8O.dbo.resolve(qname, { optional: true });
    if (dbo) {
      try {
        var projectRef = dbo.getProject ? dbo.getProject() : null;
        if (projectRef && projectRef.getName) {
          var projectName = String(projectRef.getName());
          if (projectName.length) {
            projectMap[projectName] = projectRef;
            if (!projectAnchorMap[projectName]) {
              projectAnchorMap[projectName] = dbo;
            }
          }
        }
      } catch (_ignoreResolvedProject) {}
      continue;
    }

    var fallbackProjectName = C8O.dbo._extractProjectName ? C8O.dbo._extractProjectName(qname) : "";
    if (fallbackProjectName.length && !projectMap[fallbackProjectName]) {
      var fallbackProject = resolveProjectByName(fallbackProjectName);
      if (fallbackProject) {
        projectMap[fallbackProjectName] = fallbackProject;
      }
    }
  }

  var mobileBuilderResults = [];
  if (triggerMobileBuilder) {
    var anchorNames = Object.keys(projectAnchorMap);
    for (var m = 0; m < anchorNames.length; m++) {
      var anchorProjectName = anchorNames[m];
      var anchor = projectAnchorMap[anchorProjectName];
      if (!anchor) {
        continue;
      }
      var refreshInfo = C8O.dbo.triggerMobileBuilderRefresh(anchor, errors);
      mobileBuilderResults.push({
        project: anchorProjectName,
        requested: refreshInfo && refreshInfo.requested === true,
        triggered: refreshInfo && refreshInfo.triggered === true,
        message: refreshInfo && refreshInfo.message ? String(refreshInfo.message) : ""
      });
    }
  }

  var saveResults = [];
  if (autoSave) {
    var projectNames = Object.keys(projectMap);
    for (var s = 0; s < projectNames.length; s++) {
      var projectNameForSave = projectNames[s];
      var projectToSave = projectMap[projectNameForSave];
      if (!projectToSave) {
        continue;
      }
      var saveResult = C8O.dbo.saveProject(projectToSave, errors);
      saveResults.push({
        project: projectNameForSave,
        saved: saveResult && saveResult.saved === true,
        message: saveResult && saveResult.message ? String(saveResult.message) : ""
      });
    }
  }

  return {
    touchedQNames: touchedQNames,
    projects: Object.keys(projectMap),
    mobileBuilder: mobileBuilderResults,
    saveResults: saveResults
  };
};

C8O.dbo.exportProjectIfNeeded = function (project, commitFlag, errors) {
  var result = C8O.dbo.saveProjectIfNeeded(project, commitFlag, errors);
  return { exported: result.saved === true, message: result.message || "" };
};
