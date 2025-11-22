/*
 * Helper functions for mutating DatabaseObjects (delete, move, rename).
 * This module expects js/databaseobject.js to be loaded first.
 */

if (typeof C8O === "undefined" || typeof C8O.dbo === "undefined") {
  include("js/databaseobject.js");
}

(function () {
  if (typeof C8O === "undefined") {
    return;
  }

  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var DboUtils = Packages.com.twinsoft.convertigo.engine.admin.services.studio.dbo.DboUtils;
  var BuilderUtils = Packages.com.twinsoft.convertigo.engine.admin.services.studio.ngxbuilder.BuilderUtils;
  var JSONArray = Packages.org.codehaus.jettison.json.JSONArray;
  var IContainerOrdered = Packages.com.twinsoft.convertigo.beans.core.IContainerOrdered;
  var BooleanClass = Packages.java.lang.Boolean;
  var DboUtilsClass = Packages.java.lang.Class.forName("com.twinsoft.convertigo.engine.admin.services.studio.dbo.DboUtils");
  var JSONArrayClass = Packages.java.lang.Class.forName("org.codehaus.jettison.json.JSONArray");
  var DatabaseObjectClass = Packages.java.lang.Class.forName("com.twinsoft.convertigo.beans.core.DatabaseObject");
  var ObjectClass = Packages.java.lang.Class.forName("java.lang.Object");
  var StringClass = Packages.java.lang.Class.forName("java.lang.String");
  var changeBeanNameMethod = null;
  try {
    changeBeanNameMethod = DboUtilsClass.getDeclaredMethod(
      "changeBeanName",
      JSONArrayClass,
      DatabaseObjectClass,
      ObjectClass,
      ObjectClass,
      StringClass
    );
    changeBeanNameMethod.setAccessible(true);
  } catch (_ignoredChangeMethod) {}

  C8O.dbo = C8O.dbo || {};

  function normalizeUpdateMode(input) {
    if (input == null) {
      return "UPDATE_NONE";
    }
    var text = String(input).trim().toUpperCase();
    if (text === "" || text === "NONE") {
      return "UPDATE_NONE";
    }
    if (text === "LOCAL") {
      return "UPDATE_LOCAL";
    }
    if (text === "ALL") {
      return "UPDATE_ALL";
    }
    if (text !== "UPDATE_NONE" && text !== "UPDATE_LOCAL" && text !== "UPDATE_ALL") {
      return "UPDATE_NONE";
    }
    return text;
  }

  C8O.dbo.removeObject = function (args) {
    args = args || {};
    var errors = [];
    var qname = args.qname != null ? String(args.qname).trim() : "";
    if (!qname.length) {
      throw new Error("qname is required");
    }

    var dbo = C8O.dbo.resolve(qname);
    if (!dbo) {
      throw new Error("Database object not found: " + qname);
    }

    var parent = dbo.getParent();
    if (parent == null) {
      throw new Error("Cannot remove root object: " + qname);
    }

    var project = null;
    try {
      project = dbo.getProject();
    } catch (_ignoredProject) {}

    var info = {
      qname: String(dbo.getFullQName()),
      name: String(dbo.getName()),
      className: (C8O.util.fromFqcn ? C8O.util.fromFqcn(dbo.getClass().getName()) : dbo.getClass().getName()),
      parentQName: String(parent.getFullQName()),
      project: project,
      projectName: project != null ? String(project.getName()) : "",
      removed: false,
      errors: errors
    };

    try {
      parent.remove(dbo);
      info.removed = true;
      parent.hasChanged = true;
      if (project != null) {
        project.hasChanged = true;
      }
      try {
        BuilderUtils.dboRemoved(parent, dbo);
      } catch (_ignoredNotify) {}
    } catch (removeError) {
      errors.push({ name: "remove", message: String(removeError) });
    }

    return info;
  };

  C8O.dbo.renameObject = function (args) {
    args = args || {};
    var errors = [];
    var qname = args.qname != null ? String(args.qname).trim() : "";
    var newName = args.name != null ? String(args.name).trim() : "";
    var updateMode = normalizeUpdateMode(args.update);

    if (!qname.length) {
      throw new Error("qname is required");
    }
    if (!newName.length) {
      throw new Error("name is required");
    }

    var dbo = C8O.dbo.resolve(qname);
    if (!dbo) {
      throw new Error("Database object not found: " + qname);
    }

    var project = null;
    try {
      project = dbo.getProject();
    } catch (_ignoredProject) {}

    var parent = dbo.getParent();
    var parentQName = parent != null ? String(parent.getFullQName()) : "";
    var oldName = String(dbo.getName());
    var previousQName = String(dbo.getFullQName());
    var ids = new JSONArray();
    var done = false;
    if (changeBeanNameMethod == null) {
      errors.push({ name: "rename", message: "changeBeanName helper unavailable" });
    } else {
      try {
        var invoked = changeBeanNameMethod.invoke(null, ids, dbo, oldName, newName, updateMode);
        done = BooleanClass.TRUE.equals(invoked);
        if (done) {
          dbo.hasChanged = true;
          if (project != null) {
            project.hasChanged = true;
          }
        }
      } catch (renameError) {
        errors.push({ name: "rename", message: String(renameError) });
      }
    }

    var refUpdates = [];
    for (var i = 0; i < ids.length(); i++) {
      try {
        refUpdates.push(String(ids.get(i)));
      } catch (_ignoredArray) {}
    }

    var currentQName = done ? String(dbo.getFullQName()) : String(previousQName);

    return {
      qname: String(previousQName),
      newQName: currentQName,
      parentQName: parentQName,
      oldName: oldName,
      newName: done ? String(dbo.getName()) : String(oldName),
      className: (C8O.util.fromFqcn ? C8O.util.fromFqcn(dbo.getClass().getName()) : dbo.getClass().getName()),
      project: project,
      projectName: project != null ? String(project.getName()) : "",
      updateMode: updateMode,
      updatedIds: refUpdates,
      renamed: done,
      errors: errors
    };
  };

  C8O.dbo.moveObject = function (args) {
    args = args || {};
    var errors = [];
    var sourceQName = args.qname != null ? String(args.qname).trim() : "";
    var targetQName = args.target != null ? String(args.target).trim() : "";
    var position = args.position != null ? String(args.position).trim().toLowerCase() : "";
    if (!position.length) {
      position = "inside";
    }
    if (position !== "inside" && position !== "before" && position !== "after") {
      position = "inside";
    }

    if (!sourceQName.length) {
      throw new Error("qname is required");
    }
    if (!targetQName.length) {
      throw new Error("target is required");
    }

    var dbo = C8O.dbo.resolve(sourceQName);
    if (!dbo) {
      throw new Error("Database object not found: " + sourceQName);
    }

    var targetDbo = C8O.dbo.resolve(targetQName);
    if (!targetDbo) {
      throw new Error("Target database object not found: " + targetQName);
    }

    var parentDestination = null;
    var afterPriority = null;

    if (position === "inside") {
      parentDestination = targetDbo;
    } else {
      parentDestination = targetDbo.getParent();
      if (parentDestination == null) {
        throw new Error("Unable to resolve parent for position '" + position + "'");
      }
      if (position === "after") {
        afterPriority = java.lang.Long.valueOf(targetDbo.priority);
      } else {
        var previous = targetDbo.getPreviousSiblingInFolder();
        afterPriority = previous != null ? java.lang.Long.valueOf(previous.priority) : java.lang.Long.valueOf(0);
      }
    }

    if (parentDestination == null) {
      throw new Error("Unable to resolve destination parent");
    }

    if (dbo.equals(parentDestination)) {
      throw new Error("Cannot move a database object inside itself");
    }

    var currentParent = dbo.getParent();
    if (currentParent == null) {
      throw new Error("Source has no parent");
    }

    var isOrdering = parentDestination.equals(currentParent);
    var isMoving = !isOrdering;
    if (!isOrdering && !isMoving) {
      throw new Error("Move operation not permitted for " + sourceQName);
    }

    var project = null;
    try {
      project = parentDestination.getProject();
    } catch (_ignoredProject) {}

    var previousParent = currentParent;
    var previousSibling = dbo.getPreviousSiblingInFolder();
    var done = false;

    try {
      dbo.delete();
      if (parentDestination instanceof IContainerOrdered) {
        parentDestination.add(dbo, afterPriority);
      } else {
        parentDestination.add(dbo);
      }
      done = true;
      parentDestination.hasChanged = true;
      dbo.hasChanged = true;
      if (project != null) {
        project.hasChanged = true;
      }
      try {
        if (isOrdering) {
          BuilderUtils.dboUpdated(parentDestination);
        } else {
          BuilderUtils.dboMoved(previousParent, parentDestination, dbo);
        }
      } catch (_ignoredNotify) {}
    } catch (moveError) {
      errors.push({ name: "move", message: String(moveError) });
      try {
        if (dbo.getParent() == null && previousParent != null) {
          var restoreAfter = previousSibling == null ? java.lang.Long.valueOf(0)
              : java.lang.Long.valueOf(previousSibling.priority);
          if (previousParent instanceof IContainerOrdered) {
            previousParent.add(dbo, restoreAfter);
          } else {
            previousParent.add(dbo);
          }
        }
      } catch (_ignoredRestore) {}
    }

    return {
      qname: String(dbo.getFullQName()),
      name: String(dbo.getName()),
      className: (C8O.util.fromFqcn ? C8O.util.fromFqcn(dbo.getClass().getName()) : dbo.getClass().getName()),
      fromParent: previousParent != null ? String(previousParent.getFullQName()) : "",
      toParent: String(parentDestination.getFullQName()),
      position: position,
      after: afterPriority != null ? afterPriority.longValue() : null,
      reordered: done && isOrdering,
      moved: done && !isOrdering,
      project: project,
      projectName: project != null ? String(project.getName()) : "",
      errors: errors,
      done: done
    };
  };
})();




