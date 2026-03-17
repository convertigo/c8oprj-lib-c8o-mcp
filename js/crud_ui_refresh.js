if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.crudUiRefresh = C8O.crudUiRefresh || {};

(function () {
  if (C8O.crudUiRefresh._initialized === true) {
    return;
  }
  C8O.crudUiRefresh._initialized = true;

  function triggerUiSourceRefreshTargets(ctx, targets, result) {
    var summary = {
      requested: false,
      studioMode: false,
      mobileObject: false,
      triggered: false,
      message: "",
      strategy: "",
      resetQNames: [],
      targets: []
    };
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    var MobileBuilder = Packages.com.twinsoft.convertigo.engine.mobile.MobileBuilder;
    var BatchOperationHelper = Packages.com.twinsoft.convertigo.engine.helpers.BatchOperationHelper;
    try {
      summary.studioMode = Engine.isStudioMode() === true;
    } catch (_ignoreStudioMode) {
      summary.studioMode = false;
    }
    var unique = {};
    var entries = ctx.ensureArray(targets);
    var strategySet = {};
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var qname = ctx.trimmed(typeof entry === "string" ? entry : (entry && entry.qname));
      if (!qname.length || unique[qname]) {
        continue;
      }
      unique[qname] = true;
      var targetResult = {
        target: qname,
        requested: false,
        triggered: false,
        strategy: "",
        resetQNames: [],
        message: ""
      };
      var dbo = null;
      try {
        dbo = C8O.dbo.resolve(qname, { optional: true });
      } catch (_ignoreResolveTarget) {
        dbo = null;
      }
      if (!dbo) {
        targetResult.message = "Skipped: target not found";
        summary.targets.push(targetResult);
        continue;
      }
      var mobileObject = false;
      try {
        mobileObject = C8O.dbo._isMobileObject(dbo) === true;
      } catch (_ignoreMobileObject) {
        mobileObject = false;
      }
      summary.mobileObject = summary.mobileObject || mobileObject;
      targetResult.requested = summary.studioMode && mobileObject;
      summary.requested = summary.requested || targetResult.requested;
      if (!targetResult.requested) {
        targetResult.message = !summary.studioMode ? "Skipped: Studio mode required" : "Skipped: target is not a mobile object";
        summary.targets.push(targetResult);
        continue;
      }
      try {
        var mb = MobileBuilder.getBuilderOf(dbo);
        if (mb == null) {
          targetResult.message = "Skipped: no mobile builder for target";
          summary.targets.push(targetResult);
          continue;
        }
        var context = C8O.dbo._resolveNgxRefreshContext ? C8O.dbo._resolveNgxRefreshContext(dbo) : {
          mainScriptComponent: null,
          application: null,
          resetQNames: []
        };
        if (context && context.resetQNames && context.resetQNames.length) {
          targetResult.resetQNames = ctx.ensureArray(context.resetQNames);
          summary.resetQNames = summary.resetQNames.concat(targetResult.resetQNames);
        }
        var batchStarted = false;
        var batchStopped = false;
        try {
          mb.prepareBatchBuild();
          BatchOperationHelper.start();
          batchStarted = true;
          var strategies = [];
          var mainComponent = context ? context.mainScriptComponent : null;
          var application = context ? context.application : null;
          if (mainComponent != null && typeof mainComponent.updateSourceFiles === "function") {
            mainComponent.updateSourceFiles();
            strategies.push("mainScriptComponent.updateSourceFiles");
          }
          if (application != null
            && typeof application.updateSourceFiles === "function"
            && application !== mainComponent) {
            application.updateSourceFiles();
            strategies.push("application.updateSourceFiles");
          }
          if (!strategies.length) {
            mb.appChanged();
            strategies.push("builder.appChanged");
          }
          BatchOperationHelper.stop();
          batchStopped = true;
          targetResult.triggered = true;
          targetResult.strategy = strategies.join(" + ");
          targetResult.message = "Mobile builder refresh triggered via " + targetResult.strategy;
          for (var strategyIndex = 0; strategyIndex < strategies.length; strategyIndex++) {
            strategySet[strategies[strategyIndex]] = true;
          }
          summary.triggered = true;
        } finally {
          if (batchStarted && !batchStopped) {
            try {
              BatchOperationHelper.stop();
            } catch (_ignoreBatchStop) {}
          }
        }
      } catch (refreshError) {
        targetResult.message = "Unable to trigger mobile builder refresh: " + String(refreshError);
        ctx.addWarning(result, targetResult.message + " (" + qname + ")");
      }
      summary.targets.push(targetResult);
    }
    var strategiesOut = Object.keys(strategySet);
    summary.strategy = strategiesOut.join(" | ");
    summary.message = summary.triggered
      ? "Mobile builder refresh triggered for " + String(summary.targets.filter(function (item) { return item.triggered; }).length) + " target(s)."
      : "Mobile builder refresh skipped.";
    if (!summary.resetQNames.length) {
      delete summary.resetQNames;
    }
    return summary;
  }

  function dboCommentText(ctx, dbo) {
    if (!dbo || typeof dbo.getComment !== "function") {
      return "";
    }
    try {
      return ctx.trimmed(dbo.getComment());
    } catch (_ignoreComment) {
      return "";
    }
  }

  function isManagedCrudPage(ctx, page) {
    var comment = dboCommentText(ctx, page);
    return comment.indexOf("Deterministic CRUD entity page") === 0;
  }

  function isManagedCrudSharedComponent(ctx, component) {
    var comment = dboCommentText(ctx, component);
    if (!comment.length) {
      return false;
    }
    return comment.indexOf("Deterministic CRUD") === 0
      || comment.indexOf("CRM live-state") === 0
      || comment.indexOf("Temporary dashboard bootstrap card") === 0;
  }

  function isManagedCrudSharedAction(ctx, actionStack) {
    var name = "";
    try {
      name = ctx.trimmed(actionStack && actionStack.getName ? actionStack.getName() : "");
    } catch (_ignoreActionName) {
      name = "";
    }
    if (name.indexOf("crud_") === 0 || name.indexOf("crm_") === 0) {
      return true;
    }
    var comment = dboCommentText(ctx, actionStack);
    return comment.indexOf("CRUD ") === 0 || comment.indexOf("CRM ") === 0;
  }

  function collectManagedCrudCleanupQNames(ctx, ngxApp, expectedQNames) {
    var expected = {};
    var entries = ctx.ensureArray(expectedQNames);
    for (var i = 0; i < entries.length; i++) {
      var expectedQName = ctx.trimmed(entries[i]);
      if (expectedQName.length) {
        expected[expectedQName] = true;
      }
    }
    var stale = [];
    function pushIfManaged(list, predicate) {
      var values = ctx.ensureArray(list);
      for (var index = 0; index < values.length; index++) {
        var dbo = values[index];
        var qname = "";
        try {
          qname = ctx.trimmed(dbo && dbo.getQName ? dbo.getQName() : "");
        } catch (_ignoreQName) {
          qname = "";
        }
        if (!qname.length || expected[qname]) {
          continue;
        }
        if (predicate(dbo)) {
          stale.push(qname);
        }
      }
    }
    try {
      pushIfManaged(ngxApp && ngxApp.getPageComponentList ? ngxApp.getPageComponentList() : [], function (dbo) {
        return isManagedCrudPage(ctx, dbo);
      });
    } catch (_ignorePages) {}
    try {
      pushIfManaged(ngxApp && ngxApp.getSharedActionList ? ngxApp.getSharedActionList() : [], function (dbo) {
        return isManagedCrudSharedAction(ctx, dbo);
      });
    } catch (_ignoreActions) {}
    try {
      pushIfManaged(ngxApp && ngxApp.getSharedComponentList ? ngxApp.getSharedComponentList() : [], function (dbo) {
        return isManagedCrudSharedComponent(ctx, dbo);
      });
    } catch (_ignoreComponents) {}
    return stale;
  }

  function deleteFileRecursively(file) {
    if (!file || !file.exists()) {
      return 0;
    }
    var deleted = 0;
    if (file.isDirectory()) {
      var children = file.listFiles();
      if (children != null) {
        for (var i = 0; i < children.length; i++) {
          deleted += deleteFileRecursively(children[i]);
        }
      }
    }
    if (file.delete()) {
      deleted += 1;
    }
    return deleted;
  }

  function cleanupGeneratedIonicSources(ctx, projectName, ngxApp) {
    var File = Packages.java.io.File;
    var projectDir = C8O.project.resolveProjectDirectory({ projectName: projectName });
    var appDir = new File(projectDir, "_private/ionic/src/app");
    var pagesDir = new File(appDir, "pages");
    var componentsDir = new File(appDir, "components");
    var expectedPageDirs = {};
    var expectedComponentDirs = {};
    var projectPrefix = ctx.normalizedIdentifier(projectName).toLowerCase();
    try {
      var pageList = ctx.ensureArray(ngxApp && ngxApp.getPageComponentList ? ngxApp.getPageComponentList() : []);
      for (var pageIndex = 0; pageIndex < pageList.length; pageIndex++) {
        var pageName = ctx.trimmed(pageList[pageIndex] && pageList[pageIndex].getName ? pageList[pageIndex].getName() : "").toLowerCase();
        if (pageName.length) {
          expectedPageDirs[pageName] = true;
        }
      }
    } catch (_ignorePageList) {}
    try {
      var sharedList = ctx.ensureArray(ngxApp && ngxApp.getSharedComponentList ? ngxApp.getSharedComponentList() : []);
      for (var sharedIndex = 0; sharedIndex < sharedList.length; sharedIndex++) {
        var sharedName = ctx.trimmed(sharedList[sharedIndex] && sharedList[sharedIndex].getName ? sharedList[sharedIndex].getName() : "");
        if (sharedName.length) {
          expectedComponentDirs[projectPrefix + "." + ctx.normalizedIdentifier(sharedName).toLowerCase()] = true;
        }
      }
    } catch (_ignoreSharedList) {}
    var summary = {
      pagesRemoved: [],
      componentsRemoved: [],
      deletedCount: 0
    };
    if (pagesDir.exists()) {
      var pageDirs = pagesDir.listFiles();
      if (pageDirs != null) {
        for (var i = 0; i < pageDirs.length; i++) {
          var pageDir = pageDirs[i];
          if (!pageDir.isDirectory()) {
            continue;
          }
          var pageDirName = String(pageDir.getName()).toLowerCase();
          if (expectedPageDirs[pageDirName]) {
            continue;
          }
          summary.deletedCount += deleteFileRecursively(pageDir);
          summary.pagesRemoved.push(pageDirName);
        }
      }
    }
    if (componentsDir.exists()) {
      var componentDirs = componentsDir.listFiles();
      if (componentDirs != null) {
        for (var j = 0; j < componentDirs.length; j++) {
          var componentDir = componentDirs[j];
          if (!componentDir.isDirectory()) {
            continue;
          }
          var componentDirName = String(componentDir.getName()).toLowerCase();
          if (componentDirName.indexOf(projectPrefix + ".") !== 0) {
            continue;
          }
          if (expectedComponentDirs[componentDirName]) {
            continue;
          }
          summary.deletedCount += deleteFileRecursively(componentDir);
          summary.componentsRemoved.push(componentDirName);
        }
      }
    }
    return summary;
  }

  function purgeManagedGeneratedIonicSources(ctx, projectName, pageNames, sharedComponentNames) {
    var File = Packages.java.io.File;
    var projectDir = C8O.project.resolveProjectDirectory({ projectName: projectName });
    var appDir = new File(projectDir, "_private/ionic/src/app");
    var pagesDir = new File(appDir, "pages");
    var componentsDir = new File(appDir, "components");
    var projectPrefix = ctx.normalizedIdentifier(projectName).toLowerCase();
    var summary = {
      pageDirsPurged: [],
      componentDirsPurged: [],
      deletedCount: 0
    };
    var seen = {};
    var pageEntries = ctx.ensureArray(pageNames);
    for (var i = 0; i < pageEntries.length; i++) {
      var pageName = ctx.trimmed(pageEntries[i]).toLowerCase();
      if (!pageName.length || seen["page:" + pageName]) {
        continue;
      }
      seen["page:" + pageName] = true;
      var pageDir = new File(pagesDir, pageName);
      if (pageDir.exists()) {
        summary.deletedCount += deleteFileRecursively(pageDir);
        summary.pageDirsPurged.push(pageName);
      }
    }
    var sharedEntries = ctx.ensureArray(sharedComponentNames);
    for (var j = 0; j < sharedEntries.length; j++) {
      var rawShared = ctx.trimmed(sharedEntries[j]);
      if (!rawShared.length) {
        continue;
      }
      var sharedName = rawShared;
      var lastDot = sharedName.lastIndexOf(".");
      if (lastDot >= 0) {
        sharedName = sharedName.substring(lastDot + 1);
      }
      var componentDirName = projectPrefix + "." + ctx.normalizedIdentifier(sharedName).toLowerCase();
      if (!componentDirName.length || seen["component:" + componentDirName]) {
        continue;
      }
      seen["component:" + componentDirName] = true;
      var componentDir = new File(componentsDir, componentDirName);
      if (componentDir.exists()) {
        summary.deletedCount += deleteFileRecursively(componentDir);
        summary.componentDirsPurged.push(componentDirName);
      }
    }
    return summary;
  }

  C8O.crudUiRefresh.triggerUiSourceRefreshTargets = triggerUiSourceRefreshTargets;
  C8O.crudUiRefresh.collectManagedCrudCleanupQNames = collectManagedCrudCleanupQNames;
  C8O.crudUiRefresh.cleanupGeneratedIonicSources = cleanupGeneratedIonicSources;
  C8O.crudUiRefresh.purgeManagedGeneratedIonicSources = purgeManagedGeneratedIonicSources;
})();
