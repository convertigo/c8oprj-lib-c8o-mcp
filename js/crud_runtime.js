if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.crudRuntime = C8O.crudRuntime || {};

(function () {
  C8O.crudRuntime.findProjectByName = function (ctx, projectName) {
    var projectToken = ctx.trimmed(projectName);
    if (!projectToken.length) {
      return null;
    }
    try {
      return ctx.Engine.theApp.databaseObjectsManager.getOriginalProjectByName(projectToken, false);
    } catch (_ignoreProjectByNameWithFlag) {
      try {
        return ctx.Engine.theApp.databaseObjectsManager.getOriginalProjectByName(projectToken);
      } catch (_ignoreProjectByName) {
        try {
          var names = C8O.dbo && C8O.dbo._listProjectNames ? C8O.dbo._listProjectNames() : [];
          for (var i = 0; i < names.length; i++) {
            if (String(names[i]) === projectToken) {
              return C8O.dbo.resolve(projectToken, { optional: true });
            }
          }
        } catch (_ignoreResolveProjectByQName) {}
        return null;
      }
    }
  };

  C8O.crudRuntime.ensureProject = function (ctx, spec, result) {
    var project = C8O.crudRuntime.findProjectByName(ctx, spec.project);
    if (project) {
      return project;
    }
    if (spec.starter !== "ngx") {
      throw new Error("Project " + spec.project + " is not loaded and only starter=\"ngx\" auto-import is supported");
    }
    var importResult = C8O.marketplace.importLibrary({
      project: "template_ngxBuilderIonic",
      importedProjectName: spec.project,
      save: true,
      forceImport: false
    });
    var importReady = !!(
      importResult &&
      (
        importResult.status === "ready" ||
        importResult.status === "ok" ||
        importResult.imported === true ||
        importResult.loadedAfter === true
      )
    );
    if (!importReady) {
      var importMessage = importResult && importResult.importMessage ? String(importResult.importMessage) : "";
      throw new Error(
        "Unable to import NGX starter for project " +
        spec.project +
        (importMessage.length ? " (" + importMessage + ")" : "")
      );
    }
    result.created.push(spec.project);
    project = C8O.crudRuntime.findProjectByName(ctx, spec.project);
    if (!project) {
      throw new Error("Imported project " + spec.project + " is still not available in memory");
    }
    return project;
  };

  C8O.crudRuntime.logicalClassName = function (node) {
    if (!node || !node.getClass) {
      return "";
    }
    try {
      return C8O.util.fromFqcn(String(node.getClass().getName() || ""));
    } catch (_ignoreLogicalClass) {
      return "";
    }
  };

  C8O.crudRuntime.findChild = function (ctx, parent, name, className) {
    if (!parent || !parent.getDatabaseObjectChildren) {
      return null;
    }
    var children = parent.getDatabaseObjectChildren();
    for (var i = 0; i < children.size(); i++) {
      var child = children.get(i);
      var matchesName = !name;
      if (!matchesName) {
        try {
          matchesName = String(child.getName()) === name;
        } catch (_ignoreChildName) {
          matchesName = false;
        }
      }
      if (!matchesName) {
        continue;
      }
      if (!className) {
        return child;
      }
      var logical = C8O.crudRuntime.logicalClassName(child);
      if (logical === className || String(child.getClass().getName()) === C8O.util.toFqcn(className)) {
        return child;
      }
    }
    return null;
  };

  C8O.crudRuntime.createChild = function (ctx, parent, className, name) {
    var dbo = C8O.dbo.instantiateForCreate(className, parent, {});
    dbo.setName(name);
    if (typeof parent.addVariable === "function" && (className === "variables.RequestableVariable" || className === "variables.StepVariable")) {
      parent.addVariable(dbo);
    } else {
      parent.add(dbo);
    }
    try {
      dbo.hasChanged = true;
    } catch (_ignoreDboChanged) {}
    try {
      parent.hasChanged = true;
    } catch (_ignoreParentChanged) {}
    try {
      var project = parent.getProject ? parent.getProject() : null;
      if (project) {
        project.hasChanged = true;
      }
    } catch (_ignoreProjectChanged) {}
    return dbo;
  };

  C8O.crudRuntime.ensureChild = function (ctx, parent, className, name, result) {
    var existing = C8O.crudRuntime.findChild(ctx, parent, name, className);
    if (existing) {
      return existing;
    }
    var created = C8O.crudRuntime.createChild(ctx, parent, className, name);
    result.created.push(created.getFullQName ? String(created.getFullQName()) : name);
    return created;
  };

  C8O.crudRuntime.priorityOf = function (dbo) {
    try {
      if (dbo.getPriority) {
        return String(dbo.getPriority());
      }
    } catch (_ignorePriorityMethod) {}
    try {
      if (dbo.priority != null) {
        return String(dbo.priority);
      }
    } catch (_ignorePriorityField) {}
    return "";
  };

  C8O.crudRuntime.applyUpdates = function (ctx, dbo, updates, result) {
    var applied = C8O.dbo.applyPropertyUpdates(dbo, updates || {});
    if (applied && applied.errors && applied.errors.length) {
      for (var i = 0; i < applied.errors.length; i++) {
        ctx.addWarning(result, applied.errors[i].message || applied.errors[i]);
      }
    }
    if (applied && applied.applied && applied.applied.length) {
      result.updated.push(dbo.getFullQName ? String(dbo.getFullQName()) : String(dbo));
    }
    return applied;
  };

  C8O.crudRuntime.nowMillis = function () {
    return java.lang.System.currentTimeMillis();
  };

  C8O.crudRuntime.setDuration = function (bucket, key, startedAt) {
    if (!bucket || !key) {
      return 0;
    }
    var duration = C8O.crudRuntime.nowMillis() - startedAt;
    bucket[key] = duration;
    return duration;
  };

  C8O.crudRuntime.countTreeNodes = function (ctx, node) {
    if (!node || typeof node !== "object") {
      return 0;
    }
    var total = 1;
    var children = ctx.ensureArray(node.children);
    for (var i = 0; i < children.length; i++) {
      total += C8O.crudRuntime.countTreeNodes(ctx, children[i]);
    }
    return total;
  };

  C8O.crudRuntime.collectTreeNames = function (ctx, node, names) {
    var out = names || [];
    if (!node || typeof node !== "object") {
      return out;
    }
    if (node.name != null && String(node.name).length) {
      out.push(String(node.name));
    }
    var children = ctx.ensureArray(node.children);
    for (var i = 0; i < children.length; i++) {
      C8O.crudRuntime.collectTreeNames(ctx, children[i], out);
    }
    return out;
  };

  C8O.crudRuntime.buildJdbcUrl = function (ctx, databaseSpec, spec) {
    var driverId = databaseSpec && databaseSpec.driver && databaseSpec.driver.id ? String(databaseSpec.driver.id) : "hsqldb";
    if (driverId === "postgresql") {
      return "jdbc:postgresql://" + databaseSpec.host + ":" + databaseSpec.port + "/" + databaseSpec.database;
    }
    if (driverId === "mariadb") {
      return "jdbc:mariadb://" + databaseSpec.host + ":" + databaseSpec.port + "/" + databaseSpec.database;
    }
    if (driverId === "mysql") {
      return "jdbc:mysql://" + databaseSpec.host + ":" + databaseSpec.port + "/" + databaseSpec.database;
    }
    if (driverId === "sqlserver") {
      return "jdbc:jtds:sqlserver://" + databaseSpec.host + ":" + databaseSpec.port + "/" + databaseSpec.database;
    }
    if (driverId === "oracle") {
      return "jdbc:oracle:thin:@//" + databaseSpec.host + ":" + databaseSpec.port + "/" + databaseSpec.database;
    }
    return "jdbc:hsqldb:file:./database/" + ctx.normalizedIdentifier(spec.project) + ";shutdown=true";
  };

  C8O.crudRuntime.connectorProperties = function (ctx, spec) {
    var db = spec.database;
    return {
      jdbcDriverClassName: db.driver.jdbcDriverClassName,
      jdbcURL: C8O.crudRuntime.buildJdbcUrl(ctx, db, spec),
      jdbcUserName: db.driver.id === "hsqldb" ? "SA" : db.user,
      jdbcUserPassword: db.driver.id === "hsqldb" ? "" : db.password,
      comment: "Deterministic CRUD connector (" + db.driver.technology + ") for " + spec.project
    };
  };
})();
