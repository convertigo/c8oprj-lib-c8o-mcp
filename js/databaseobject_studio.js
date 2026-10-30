if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.dbo = C8O.dbo || {};

// One JVM-wide lock for the project writes of the MCP (every batch: tree-apply, batch-call, generators, CRUD kit,
// marketplace), its deletes, renames and moves, and the Project Explorer reloads it asks. An agent ran four deletes in
// parallel: their reloads overlapped and failed with a NullPointerException in copyDatabaseObject, the Studio opened
// modal error dialogs, and every engine request waited for the UI thread until someone clicked them (usage tests
// 29/10). Two tree-apply calls in parallel under one NGX directive left its children list broken (30/10).
// - Reentrant: a batch that moves an object or refreshes the tree takes it again in the same thread.
// - Bounded: a call waits STUDIO_LOCK_WAIT_MS at most, then fails without changing anything, and names the write that
//   holds it (a Studio dialog that blocks a refresh holds it too), instead of hanging past the client's timeout.
// - JVM-wide, not per project: two Studios are two JVMs and never wait on each other; in one Studio a batch can write
//   into several projects and the Project Explorer is one tree, so locks per project could cross and are not safe.
// The ReentrantLock lives in the map the engine shares between projects, created once under an interned monitor.
var STUDIO_LOCK_KEY = "lib_ConvertigoMCP.studioTree";
var STUDIO_LOCK_WAIT_MS = 30000;

C8O.dbo.studioLockStore = function () {
  return Packages.com.twinsoft.convertigo.engine.Engine.theApp.getShareServerMap();
};

C8O.dbo.studioLock = function () {
  var store = C8O.dbo.studioLockStore();
  var lock = store.get(STUDIO_LOCK_KEY);
  if (lock == null) {
    lock = new Packages.org.mozilla.javascript.Synchronizer(function () {
      var existing = store.get(STUDIO_LOCK_KEY);
      if (existing == null) {
        existing = new java.util.concurrent.locks.ReentrantLock();
        store.set(STUDIO_LOCK_KEY, existing);
      }
      return existing;
    }, new java.lang.String(STUDIO_LOCK_KEY).intern())();
  }
  return lock;
};

C8O.dbo.STUDIO_LOCK_BUSY = "studio_write_in_progress";

// label: what the call writes, named to a call that waits too long ("tree-apply under Shop.Application...").
C8O.dbo.withStudioLock = function (fn, label) {
  var store = C8O.dbo.studioLockStore();
  var lock = C8O.dbo.studioLock();
  var acquired = false;
  try {
    acquired = lock.tryLock(STUDIO_LOCK_WAIT_MS, java.util.concurrent.TimeUnit.MILLISECONDS) === true;
  } catch (_interrupted) {
    acquired = false;
  }
  if (!acquired) {
    var holder = null;
    try {
      holder = JSON.parse(String(store.get(STUDIO_LOCK_KEY + ".holder") || "null"));
    } catch (_unreadableHolder) {}
    var busy = new Error("Another write has held the projects of this Studio for more than " + (STUDIO_LOCK_WAIT_MS / 1000) +
      " s" + (holder ? " (" + holder.what + ", for " + Math.round((Number(java.lang.System.currentTimeMillis()) - Number(holder.since)) / 1000) + " s)" : "") +
      ": this call waited and changed nothing. Send it again in a moment; if it keeps failing, a Studio dialog may be waiting for an answer.");
    busy.code = C8O.dbo.STUDIO_LOCK_BUSY;
    throw busy;
  }
  var outermost = lock.getHoldCount() === 1;
  if (outermost) {
    store.set(STUDIO_LOCK_KEY + ".holder", JSON.stringify({ what: String(label || "a project write"), since: Number(java.lang.System.currentTimeMillis()) }));
  }
  try {
    return fn();
  } finally {
    if (outermost) {
      store.set(STUDIO_LOCK_KEY + ".holder", null);
    }
    lock.unlock();
  }
};

C8O.dbo.refreshStudioTreeByQName = function (targetQName, errors) {
  try {
    return C8O.dbo.withStudioLock(function () {
      return C8O.dbo._refreshStudioTreeByQName(targetQName, errors);
    }, "a Studio tree refresh of " + targetQName);
  } catch (busy) {
    if (!busy || busy.code !== C8O.dbo.STUDIO_LOCK_BUSY) {
      throw busy;
    }
    // The write before it is done: only the Project Explorer is not refreshed.
    if (errors && errors.push) {
      errors.push({ name: "__studioRefresh__", message: String(busy.message) });
    }
    return { status: "skipped", message: "Refresh skipped: " + String(busy.message), qname: String(targetQName || ""), refreshed: false, executed: false };
  }
};

C8O.dbo._refreshStudioTreeByQName = function (targetQName, errors) {
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

C8O.dbo.revealStudioTreeByQName = function (targetQName, errors) {
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
    requested: true,
    status: "pending",
    action: "studio-tree-reveal",
    message: "Waiting for Studio reveal",
    qname: requestedQName,
    targetQName: "",
    selected: false,
    expanded: false,
    revealed: false,
    refreshed: false,
    studioMode: studioMode,
    timestamp: System.currentTimeMillis(),
    error: "",
    executed: false
  };

  if (!studioMode) {
    result.status = "skipped";
    result.message = "Reveal skipped: Convertigo Studio required";
    return result;
  }

  if (!requestedQName.length) {
    result.status = "error";
    result.message = "QName is required";
    if (errors && errors.push) {
      errors.push({ name: "__studioReveal__", message: result.message });
    }
    return result;
  }

  var targetObject = null;
  try {
    targetObject = Engine.theApp.databaseObjectsManager.getDatabaseObjectByQName(requestedQName);
  } catch (lookupError) {
    result.status = "error";
    result.message = "Unable to resolve QName: " + requestedQName;
    result.error = String(lookupError);
    if (errors && errors.push) {
      errors.push({ name: "__studioReveal__", message: result.message, detail: result.error });
    }
    return result;
  }

  if (targetObject == null) {
    result.status = "error";
    result.message = "Database object not found: " + requestedQName;
    if (errors && errors.push) {
      errors.push({ name: "__studioReveal__", message: result.message });
    }
    return result;
  }

  try {
    result.targetQName = String(targetObject.getQName());
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
        var view = pluginInstance.getProjectExplorerView ? pluginInstance.getProjectExplorerView() : null;
        if (view == null) {
          result.status = "skipped";
          result.message = "Project Explorer view not available";
          return;
        }

        try {
          view.reloadDatabaseObject(targetObject);
          result.refreshed = true;
        } catch (_ignoreReload) {}

        var treeObject = null;
        try {
          treeObject = view.findTreeObjectByUserObject ? view.findTreeObjectByUserObject(targetObject) : null;
        } catch (_ignoreFind) {
          treeObject = null;
        }
        if (treeObject == null) {
          result.status = "skipped";
          result.message = "Studio tree object not found";
          return;
        }

        try {
          if (view.viewer && view.viewer.expandToLevel) {
            view.viewer.expandToLevel(treeObject, 1);
            result.expanded = true;
          }
        } catch (expandError) {
          result.error = String(expandError);
        }

        try {
          var StructuredSelection = Packages.org.eclipse.jface.viewers.StructuredSelection;
          if (view.viewer && view.viewer.setSelection) {
            view.viewer.setSelection(new StructuredSelection(treeObject), true);
          } else {
            view.setSelectedTreeObject(treeObject);
          }
          result.selected = true;
        } catch (selectError) {
          result.error = String(selectError);
        }

        try {
          if (view.viewer && view.viewer.reveal) {
            view.viewer.reveal(treeObject);
            result.revealed = true;
          }
        } catch (revealError) {
          result.error = result.error || String(revealError);
        }

        result.executed = true;
        result.status = result.selected || result.revealed ? "revealed" : "skipped";
        result.message = result.status === "revealed" ? "Project Explorer target expanded and revealed" : "Studio tree reveal could not select the target";
      } catch (uiError) {
        result.status = "error";
        result.message = String(uiError);
        result.error = String(uiError);
      }
    }}));
  } catch (revealError) {
    result.status = "error";
    result.message = String(revealError);
    result.error = String(revealError);
  }

  if (result.status === "error" && errors && errors.push) {
    errors.push({ name: "__studioReveal__", message: result.message, detail: result.error });
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

C8O.dbo.getReloadStudioPlugin = function () {
  var ConvertigoPlugin = Packages.com.twinsoft.convertigo.eclipse.ConvertigoPlugin;
  var Display = Packages.org.eclipse.swt.widgets.Display;
  var pluginInstance = ConvertigoPlugin.getDefault();
  if (pluginInstance == null) {
    throw new Error("project-reload requires Convertigo Studio");
  }
  if (Display.getCurrent() != null) {
    throw new Error("project-reload cannot wait reliably from the SWT UI thread");
  }

  return ConvertigoPlugin;
};

C8O.dbo.flushStudioUiQueue = function (ConvertigoPlugin) {
  var Runnable = Packages.java.lang.Runnable;
  ConvertigoPlugin.syncExec(new Runnable({ run: function () {} }));
  ConvertigoPlugin.syncExec(new Runnable({ run: function () {} }));
};

// The loaded project, without loading it (null when it is not in the engine cache).
C8O.dbo.getCachedProject = function (projectName) {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var dbom = Engine.theApp.databaseObjectsManager;
  var dbomClass = dbom.getClass();
  while (dbomClass != null) {
    var methods = dbomClass.getDeclaredMethods();
    for (var i = 0; i < methods.length; i++) {
      var method = methods[i];
      if (String(method.getName()) !== "getCachedProject" || method.getParameterTypes().length !== 1) {
        continue;
      }
      method.setAccessible(true);
      return method.invoke(dbom, projectName);
    }
    dbomClass = dbomClass.getSuperclass();
  }
  throw new Error("Unable to inspect loaded project cache");
};

C8O.dbo.getCachedProjectIdentity = function (projectName) {
  var project = C8O.dbo.getCachedProject(projectName);
  return project == null ? 0 : Packages.java.lang.System.identityHashCode(project);
};

C8O.dbo.isStudioProjectTreeLoaded = function (ConvertigoPlugin, projectName) {
  var Runnable = Packages.java.lang.Runnable;
  var result = { loaded: false, error: "" };
  ConvertigoPlugin.syncExec(new Runnable({ run: function () {
    try {
      var pluginInstance = ConvertigoPlugin.getDefault();
      var view = pluginInstance && pluginInstance.getProjectExplorerView ? pluginInstance.getProjectExplorerView() : null;
      var treeObject = view && view.getProjectRootObject ? view.getProjectRootObject(projectName) : null;
      result.loaded = treeObject != null &&
        String(treeObject.getClass().getName()) === "com.twinsoft.convertigo.eclipse.views.projectexplorer.model.ProjectTreeObject";
    } catch (treeError) {
      result.error = String(treeError);
      result.loaded = false;
    }
  }}));
  if (result.error.length) {
    throw new Error(result.error);
  }
  return result.loaded === true;
};

C8O.dbo.waitForProjectReload = function (ConvertigoPlugin, projectName, previousIdentity) {
  var System = Packages.java.lang.System;
  var Thread = Packages.java.lang.Thread;
  var timeoutMs = 120000;
  var deadline = System.currentTimeMillis() + timeoutMs;
  var lastIdentity = 0;
  var treeLoaded = false;

  while (System.currentTimeMillis() <= deadline) {
    lastIdentity = C8O.dbo.getCachedProjectIdentity(projectName);
    var cacheReloaded = lastIdentity !== 0 && (previousIdentity === 0 || lastIdentity !== previousIdentity);

    C8O.dbo.flushStudioUiQueue(ConvertigoPlugin);
    treeLoaded = C8O.dbo.isStudioProjectTreeLoaded(ConvertigoPlugin, projectName);

    if (cacheReloaded && treeLoaded) {
      return;
    }
    Thread.sleep(250);
  }

  throw new Error(
    "Timed out waiting for project reload completion: " + projectName +
    " (previousIdentity=" + previousIdentity +
    ", lastIdentity=" + lastIdentity +
    ", treeLoaded=" + treeLoaded + ")"
  );
};

C8O.dbo.reloadProject = function (projectOrName, errors) {
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
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    if (!Engine.isStudioMode()) {
      // Same engine lifecycle as the web Studio's projects.Reload service.
      // clearCache releases source/tag drafts before the normal project import.
      var dbom = Engine.theApp.databaseObjectsManager;
      Engine.theApp.schemaManager.clearCache(name);
      dbom.clearCache(name);
      if (dbom.getProjectByName(name) == null) {
        throw new Error("Unable to reload project: " + name);
      }
      return { reloaded: true, message: "" };
    }
    var ConvertigoPlugin = C8O.dbo.getReloadStudioPlugin();
    return C8O.dbo.withStudioLock(function () {
      // The Studio closes a modified project with a modal "save your work now?" question on the UI thread: the call,
      // and every engine request behind it, waited until someone answered (usage tests 29/10, after deletes with
      // autoSave false). project-reload means disk state wins, so the in-memory changes are dropped first.
      var cached = C8O.dbo.getCachedProject(name);
      var discarded = cached != null && cached.hasChanged === true;
      if (discarded) {
        cached.hasChanged = false;
      }
      var previousIdentity = C8O.dbo.getCachedProjectIdentity(name);
      ConvertigoPlugin.getDefault().reloadProject(name);
      C8O.dbo.waitForProjectReload(ConvertigoPlugin, name, previousIdentity);
      return {
        reloaded: true,
        message: discarded ? "Unsaved in-memory changes were discarded: the project is the disk state again." : "",
        discardedUnsavedChanges: discarded
      };
    });
  } catch (reloadError) {
    var reloadMessage = String(reloadError);
    if (errors && errors.push) {
      errors.push({ name: "__reload__", message: reloadMessage });
    }
    return { reloaded: false, message: reloadMessage };
  }
};
