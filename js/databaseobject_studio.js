if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.dbo = C8O.dbo || {};

C8O.dbo.refreshStudioTreeByQName = function (targetQName, errors) {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var System = java.lang.System;

  var requestedQName = C8O.util.toTrimmedString ? C8O.util.toTrimmedString(targetQName || "") : String(targetQName || "").trim();
  var studioMode = false;
  try {
    studioMode = Engine.isStudioMode() === true;
  } catch (_ignoreStudioMode) {
    studioMode = false;
  }

  var result = {
    status: "pending",
    message: "Waiting for refresh",
    qname: requestedQName,
    targetQName: "",
    refreshed: false,
    refreshedQName: "",
    studioMode: studioMode,
    timestamp: System.currentTimeMillis(),
    error: "",
    executed: false
  };

  if (!studioMode) {
    result.status = "skipped";
    result.message = "Refresh skipped: Convertigo Studio required";
    return result;
  }

  if (!requestedQName.length) {
    result.status = "error";
    result.message = "QName is required";
    if (errors && errors.push) {
      errors.push({ name: "__studioRefresh__", message: result.message });
    }
    return result;
  }

  var refreshTarget = null;
  try {
    refreshTarget = Engine.theApp.databaseObjectsManager.getDatabaseObjectByQName(requestedQName);
  } catch (lookupError) {
    result.status = "error";
    result.message = "Unable to resolve QName: " + requestedQName;
    result.error = String(lookupError);
    if (errors && errors.push) {
      errors.push({ name: "__studioRefresh__", message: result.message, detail: result.error });
    }
    return result;
  }

  if (refreshTarget == null) {
    result.status = "error";
    result.message = "Database object not found: " + requestedQName;
    if (errors && errors.push) {
      errors.push({ name: "__studioRefresh__", message: result.message });
    }
    return result;
  }

  try {
    result.targetQName = String(refreshTarget.getQName());
  } catch (_ignoreTargetQName) {
    result.targetQName = requestedQName;
  }

  try {
    var ConvertigoPlugin = Packages.com.twinsoft.convertigo.eclipse.ConvertigoPlugin;
    var Runnable = Packages.java.lang.Runnable;
    var pluginInstance = ConvertigoPlugin.getDefault();
    if (pluginInstance == null) {
      result.status = "skipped";
      result.message = "Project Explorer view not available";
      return result;
    }

    ConvertigoPlugin.syncExec(new Runnable({ run: function () {
      try {
        var view = pluginInstance.getProjectExplorerView();
        if (view == null) {
          result.status = "skipped";
          result.message = "Project Explorer view not available";
          return;
        }
        view.reloadDatabaseObject(refreshTarget);
        result.status = "refreshed";
        result.message = "Project Explorer refreshed";
        result.refreshed = true;
        result.refreshedQName = String(refreshTarget.getQName());
        result.executed = true;
      } catch (uiError) {
        result.status = "error";
        result.message = String(uiError);
        result.error = String(uiError);
      }
    }}));
  } catch (refreshError) {
    result.status = "error";
    result.message = String(refreshError);
    result.error = String(refreshError);
  }

  if (result.status === "error" && errors && errors.push) {
    errors.push({ name: "__studioRefresh__", message: result.message, detail: result.error });
  }
  return result;
};

C8O.dbo.removeStudioProjectTreeByName = function (projectName, errors) {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var System = java.lang.System;

  var requestedProject = C8O.util.toTrimmedString ? C8O.util.toTrimmedString(projectName || "") : String(projectName || "").trim();
  var studioMode = false;
  try {
    studioMode = Engine.isStudioMode() === true;
  } catch (_ignoreStudioMode) {
    studioMode = false;
  }

  var result = {
    status: "pending",
    message: "Waiting for Studio project cleanup",
    project: requestedProject,
    foundTreeObject: false,
    removed: false,
    refreshed: false,
    paletteRefreshed: false,
    studioMode: studioMode,
    timestamp: System.currentTimeMillis(),
    error: "",
    executed: false
  };

  if (!studioMode) {
    result.status = "skipped";
    result.message = "Studio project cleanup skipped: Convertigo Studio required";
    return result;
  }

  if (!requestedProject.length) {
    result.status = "error";
    result.message = "Project name is required";
    if (errors && errors.push) {
      errors.push({ name: "__studioProjectCleanup__", message: result.message });
    }
    return result;
  }

  try {
    var ConvertigoPlugin = Packages.com.twinsoft.convertigo.eclipse.ConvertigoPlugin;
    var Runnable = Packages.java.lang.Runnable;
    var pluginInstance = ConvertigoPlugin.getDefault();
    if (pluginInstance == null) {
      result.status = "skipped";
      result.message = "Convertigo plugin not available";
      return result;
    }

    ConvertigoPlugin.syncExec(new Runnable({ run: function () {
      try {
        var view = pluginInstance.getProjectExplorerView ? pluginInstance.getProjectExplorerView() : null;
        if (view == null) {
          result.status = "skipped";
          result.message = "Project Explorer view not available";
          return;
        }

        var treeObject = null;
        try {
          treeObject = view.getProjectRootObject ? view.getProjectRootObject(requestedProject) : null;
        } catch (_ignoreTreeLookup) {
          treeObject = null;
        }

        result.foundTreeObject = treeObject != null;
        if (treeObject != null && view.removeProjectTreeObject) {
          view.removeProjectTreeObject(treeObject);
          result.removed = true;
        }

        if (view.refreshProjects) {
          view.refreshProjects();
          result.refreshed = true;
        }
        if (view.refreshTree) {
          view.refreshTree();
          result.refreshed = true;
        }
        if (pluginInstance.refreshPaletteView) {
          pluginInstance.refreshPaletteView();
          result.paletteRefreshed = true;
        }

        result.executed = true;
        result.status = "cleaned";
        result.message = treeObject != null
          ? "Studio project tree entry removed"
          : "Studio tree refreshed after project deletion";
      } catch (uiError) {
        result.status = "error";
        result.message = String(uiError);
        result.error = String(uiError);
      }
    }}));
  } catch (cleanupError) {
    result.status = "error";
    result.message = String(cleanupError);
    result.error = String(cleanupError);
  }

  if (result.status === "error" && errors && errors.push) {
    errors.push({ name: "__studioProjectCleanup__", message: result.message, detail: result.error });
  }
  return result;
};

C8O.dbo.reloadProject = function (projectOrName, errors) {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var name = "";
  if (projectOrName != null) {
    if (typeof projectOrName === "string") {
      name = C8O.util.toTrimmedString(projectOrName);
    } else if (projectOrName.getName) {
      name = String(projectOrName.getName());
    } else if (projectOrName.getQName) {
      name = String(projectOrName.getQName());
    }
  }
  if (!name.length) {
    var message = "Project name is required";
    if (errors && errors.push) {
      errors.push({ name: "__reload__", message: message });
    }
    return { reloaded: false, message: message };
  }
  try {
    Engine.theApp.databaseObjectsManager.getStudioProjects().reloadProject(name);
    return { reloaded: true, message: "" };
  } catch (reloadError) {
    var reloadMessage = String(reloadError);
    if (errors && errors.push) {
      errors.push({ name: "__reload__", message: reloadMessage });
    }
    return { reloaded: false, message: reloadMessage };
  }
};
