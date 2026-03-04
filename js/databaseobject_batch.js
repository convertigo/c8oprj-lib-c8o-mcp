/*
 * Batch helpers for DatabaseObject operations.
 *
 * Supported operation types:
 * - create
 * - delete
 * - move
 * - setProperties
 * - upsertTree
 *
 * Execution semantics:
 * - Default behavior stops on first failed operation (onError=stop).
 * - onError=continue applies best-effort and reports all failures.
 * - No automatic rollback is attempted.
 * - Response includes enough information to resume from a specific op index.
 */

if (typeof C8O === "undefined" || typeof C8O.dbo === "undefined") {
  include("js/databaseobject.js");
}
include("js/databaseobject_ops.js");

(function () {
  if (typeof C8O === "undefined") {
    return;
  }

  C8O.dbo = C8O.dbo || {};

  function nowMillis() {
    return java.lang.System.currentTimeMillis();
  }

  function asTrimmed(value) {
    if (C8O.util && typeof C8O.util.toTrimmedString === "function") {
      return C8O.util.toTrimmedString(value);
    }
    return value == null ? "" : String(value).trim();
  }

  function asBoolean(value, defaultValue) {
    if (C8O.util && typeof C8O.util.toBoolean === "function") {
      return C8O.util.toBoolean(value, defaultValue);
    }
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
  }

  function safeString(value) {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value);
  }

  function safeJsonStringify(value) {
    try {
      return JSON.stringify(value);
    } catch (_ignoreStringify) {
      return "";
    }
  }

  function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    var tag = Object.prototype.toString.call(value);
    return tag === "[object Object]";
  }

  function unwrapValue(value) {
    if (value && typeof value.unwrap === "function") {
      try {
        value = value.unwrap();
      } catch (_ignoreUnwrap) {}
    }
    if (value != null && typeof value !== "string") {
      try {
        if (value.getClass && String(value.getClass().getName()) === "java.lang.String") {
          return String(value);
        }
      } catch (_ignoreJavaString) {}
    }
    return value;
  }

  function toArrayValue(value) {
    var current = unwrapValue(value);
    if (current == null) {
      return null;
    }
    if (Array.isArray(current)) {
      return current;
    }
    if (
      typeof current !== "string" &&
      typeof current.length === "number" &&
      !(typeof current.charAt === "function" && typeof current.substring === "function")
    ) {
      var outByLength = [];
      for (var i = 0; i < current.length; i++) {
        outByLength.push(unwrapValue(current[i]));
      }
      return outByLength;
    }
    if (typeof current.size === "function" && typeof current.get === "function") {
      var outBySize = [];
      var size = 0;
      try {
        size = current.size();
      } catch (_ignoreSize) {
        size = 0;
      }
      for (var j = 0; j < size; j++) {
        outBySize.push(unwrapValue(current.get(j)));
      }
      return outBySize;
    }
    return null;
  }

  function parseJsonMaybe(value, label, errors, expectedType) {
    var raw = unwrapValue(value);
    if (raw === null || raw === undefined) {
      return null;
    }
    if (expectedType === "array") {
      var arrayValue = toArrayValue(raw);
      if (arrayValue != null) {
        return arrayValue;
      }
    }
    if (expectedType === "object" && isPlainObject(raw)) {
      return raw;
    }
    if (typeof raw === "string") {
      var text = asTrimmed(raw);
      if (!text.length) {
        return null;
      }
      var parsed = C8O.util.tryParseJson ? C8O.util.tryParseJson(text, errors, label) : null;
      if (parsed && typeof parsed === "string") {
        parsed = C8O.util.tryParseJson ? C8O.util.tryParseJson(parsed, errors, label) : null;
      }
      if (expectedType === "array" && !Array.isArray(parsed)) {
        if (errors && errors.push) {
          errors.push({ name: label, message: "Expected a JSON array." });
        }
        return null;
      }
      if (expectedType === "object" && !isPlainObject(parsed)) {
        if (errors && errors.push) {
          errors.push({ name: label, message: "Expected a JSON object." });
        }
        return null;
      }
      return parsed;
    }
    var fallbackText = asTrimmed(String(raw));
    if (fallbackText.length && fallbackText !== "[object Object]") {
      return parseJsonMaybe(fallbackText, label, errors, expectedType);
    }
    return null;
  }

  function parseOperationsInput(rawOperations, errors) {
    var input = unwrapValue(rawOperations);
    if (input == null) {
      return [];
    }
    var asArray = toArrayValue(input);
    if (asArray != null) {
      return asArray;
    }
    if (isPlainObject(input)) {
      return [input];
    }
    var parsedArray = parseJsonMaybe(input, "operations", errors, "array");
    if (parsedArray) {
      return parsedArray;
    }
    if (errors && errors.push) {
      errors.push({ name: "operations", message: "operations must be a JSON array of operation objects." });
    }
    return [];
  }

  function parseChildrenInput(rawChildren, label, errors) {
    var input = unwrapValue(rawChildren);
    if (input === null || input === undefined) {
      return [];
    }
    var asArray = toArrayValue(input);
    if (asArray != null) {
      return asArray;
    }
    var parsed = parseJsonMaybe(input, label, errors, "array");
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (errors && errors.push) {
      errors.push({ name: label, message: "Expected a JSON array of child nodes." });
    }
    return [];
  }

  function parsePropertiesMap(rawValue, errors, label) {
    var input = unwrapValue(rawValue);
    if (input === null || input === undefined) {
      return {};
    }
    var text = "";
    if (typeof input === "string") {
      text = input;
    } else if (isPlainObject(input)) {
      text = safeJsonStringify(input);
    } else {
      var parsed = parseJsonMaybe(input, label, errors, "object");
      if (parsed) {
        text = safeJsonStringify(parsed);
      } else {
        text = safeJsonStringify(input);
      }
    }
    if (!text.length) {
      var fallback = asTrimmed(String(input));
      if (fallback.length && fallback !== "[object Object]") {
        text = fallback;
      }
    }
    if (!text.length) {
      if (errors && errors.push) {
        errors.push({ name: label, message: "Invalid properties payload." });
      }
      return {};
    }
    return C8O.dbo.parsePropertyUpdates(text, errors) || {};
  }

  function normalizeOnError(rawOnError, strict) {
    if (strict === true) {
      return "stop";
    }
    var text = asTrimmed(rawOnError).toLowerCase();
    if (text === "continue") {
      return "continue";
    }
    return "stop";
  }

  function normalizeStrategy(rawStrategy, fallback) {
    var base = fallback || {};
    var strategy = {
      replaceOnClassMismatch: asBoolean(base.replaceOnClassMismatch, true),
      pruneMissing: asBoolean(base.pruneMissing, false),
      reorder: asBoolean(base.reorder, true)
    };
    if (!rawStrategy) {
      return strategy;
    }
    if (typeof rawStrategy === "string") {
      var parsed = parseJsonMaybe(rawStrategy, "strategy", null, "object");
      if (parsed) {
        rawStrategy = parsed;
      }
    }
    if (!isPlainObject(rawStrategy)) {
      return strategy;
    }
    if (rawStrategy.replaceOnClassMismatch !== undefined) {
      strategy.replaceOnClassMismatch = asBoolean(rawStrategy.replaceOnClassMismatch, strategy.replaceOnClassMismatch);
    }
    if (rawStrategy.pruneMissing !== undefined) {
      strategy.pruneMissing = asBoolean(rawStrategy.pruneMissing, strategy.pruneMissing);
    }
    if (rawStrategy.reorder !== undefined) {
      strategy.reorder = asBoolean(rawStrategy.reorder, strategy.reorder);
    }
    return strategy;
  }

  function shortClassName(className) {
    if (!className) {
      return "";
    }
    return C8O.util.fromFqcn ? C8O.util.fromFqcn(String(className)) : String(className);
  }

  function classNamesMatch(runtimeClassName, desiredClassName) {
    var runtimeText = asTrimmed(runtimeClassName);
    var desiredText = asTrimmed(desiredClassName);
    if (!desiredText.length) {
      return true;
    }
    var desiredFqcn = C8O.util.toFqcn ? C8O.util.toFqcn(desiredText) : desiredText;
    if (runtimeText === desiredText || runtimeText === desiredFqcn) {
      return true;
    }
    var runtimeShort = shortClassName(runtimeText);
    var desiredShort = shortClassName(desiredFqcn);
    return runtimeShort === desiredText || runtimeShort === desiredShort;
  }

  function makeOpError(code, message, phase, detail, qname) {
    var out = {
      code: code || "unknown_error",
      message: safeString(message || ""),
      phase: phase || "",
      qname: qname || ""
    };
    if (detail != null && safeString(detail).length) {
      out.detail = safeString(detail);
    }
    return out;
  }

  function safeQName(dbo) {
    if (!dbo) {
      return "";
    }
    try {
      return String(dbo.getFullQName ? dbo.getFullQName() : dbo.getQName());
    } catch (_ignoreQName) {
      return "";
    }
  }

  function getProjectRef(dbo) {
    if (!dbo) {
      return null;
    }
    try {
      return dbo.getProject ? dbo.getProject() : null;
    } catch (_ignoreProjectRef) {
      return null;
    }
  }

  function addTouchedQName(ctx, qname) {
    var text = asTrimmed(qname);
    if (!text.length) {
      return;
    }
    if (ctx.touchedQNameSet[text]) {
      return;
    }
    ctx.touchedQNameSet[text] = true;
    ctx.touchedQNames.push(text);
  }

  function markProjectTouched(ctx, project, anchorDbo) {
    if (!project || !project.getName) {
      return;
    }
    var name = String(project.getName());
    if (!name.length) {
      return;
    }
    ctx.projectMap[name] = project;
    if (anchorDbo && !ctx.projectAnchorMap[name]) {
      ctx.projectAnchorMap[name] = anchorDbo;
    }
  }

  function markDirty(ctx, dbo) {
    if (!dbo) {
      return;
    }
    try {
      dbo.hasChanged = true;
    } catch (_ignoreDboDirty) {}

    var project = getProjectRef(dbo);
    if (project != null) {
      try {
        project.hasChanged = true;
      } catch (_ignoreProjectDirty) {}
      markProjectTouched(ctx, project, dbo);
    }
    addTouchedQName(ctx, safeQName(dbo));
  }

  function markParentDirty(ctx, dbo) {
    if (!dbo || !dbo.getParent) {
      return;
    }
    var parent = null;
    try {
      parent = dbo.getParent();
    } catch (_ignoreParent) {
      parent = null;
    }
    if (parent) {
      markDirty(ctx, parent);
    }
  }

  function incrementMutation(ctx, kind) {
    ctx.summary[kind] = (ctx.summary[kind] || 0) + 1;
  }

  function registerRef(ctx, refId, dbo) {
    var id = asTrimmed(refId);
    if (!id.length || !dbo) {
      return;
    }
    var qname = safeQName(dbo);
    var name = "";
    var priority = "";
    try {
      name = String(dbo.getName());
    } catch (_ignoreName) {
      name = "";
    }
    try {
      priority = String(dbo.priority);
    } catch (_ignorePriority) {
      priority = "";
    }
    var entry = { qname: qname, name: name, priority: priority };
    ctx.refs[id] = entry;
  }

  function resolveRefToken(ctx, token) {
    var text = asTrimmed(token);
    if (!text.length) {
      throw new Error("Empty $ref token.");
    }
    var dot = text.indexOf(".");
    var refId = dot >= 0 ? text.substring(0, dot) : text;
    var field = dot >= 0 ? text.substring(dot + 1) : "qname";
    var entry = ctx.refs[refId];
    if (!entry) {
      throw new Error("Unknown $ref id: " + refId);
    }
    if (entry[field] === undefined || entry[field] === null || String(entry[field]).length === 0) {
      throw new Error("Unknown $ref field: " + text);
    }
    return entry[field];
  }

  function resolveRefsInValue(ctx, value) {
    if (value === null || value === undefined) {
      return value;
    }
    if (Array.isArray(value)) {
      var arrayOut = [];
      for (var i = 0; i < value.length; i++) {
        arrayOut.push(resolveRefsInValue(ctx, value[i]));
      }
      return arrayOut;
    }
    if (isPlainObject(value)) {
      if (value.$ref !== undefined) {
        return resolveRefToken(ctx, value.$ref);
      }
      var objectOut = {};
      var keys = Object.keys(value);
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        objectOut[key] = resolveRefsInValue(ctx, value[key]);
      }
      return objectOut;
    }
    return value;
  }

  function getDirectChildren(parentDbo) {
    var result = [];
    if (!parentDbo || !parentDbo.getDatabaseObjectChildren) {
      return result;
    }
    var list = null;
    try {
      list = parentDbo.getDatabaseObjectChildren();
    } catch (_ignoreChildrenList) {
      list = null;
    }
    if (!list) {
      return result;
    }
    for (var i = 0; i < list.size(); i++) {
      var child = list.get(i);
      if (!child) {
        continue;
      }
      try {
        if (child.getParent() !== parentDbo) {
          continue;
        }
      } catch (_ignoreParentCheck) {}
      result.push(child);
    }
    return result;
  }

  function getChildMapByName(parentDbo, warnings, parentQName) {
    var map = {};
    var duplicates = {};
    var children = getDirectChildren(parentDbo);
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      var name = "";
      try {
        name = String(child.getName());
      } catch (_ignoreChildName) {
        name = "";
      }
      if (!name.length) {
        continue;
      }
      if (map[name]) {
        duplicates[name] = true;
        continue;
      }
      map[name] = child;
    }
    var duplicateKeys = Object.keys(duplicates);
    if (duplicateKeys.length && warnings && warnings.push) {
      warnings.push((parentQName || "<unknown>") + ": duplicate child names detected (" + duplicateKeys.join(", ") + ").");
    }
    return map;
  }

  function resolveCreateContext(relatedDbo, modeText) {
    var mode = asTrimmed(modeText).toLowerCase();
    if (!mode.length) {
      mode = "inside";
    }
    if (mode !== "inside" && mode !== "before" && mode !== "after") {
      mode = "inside";
    }
    var parent = null;
    var sibling = null;
    var afterValue = null;
    if (mode === "inside") {
      parent = relatedDbo;
    } else {
      sibling = relatedDbo;
      parent = sibling.getParent();
    }
    if (parent == null) {
      throw new Error("Unable to resolve parent for mode " + mode);
    }
    if (mode === "after" && sibling != null) {
      afterValue = java.lang.Long.valueOf(sibling.priority);
    } else if (mode === "before" && sibling != null) {
      var previous = sibling.getPreviousSiblingInFolder ? sibling.getPreviousSiblingInFolder() : null;
      afterValue = previous != null ? java.lang.Long.valueOf(previous.priority) : java.lang.Long.valueOf(0);
    }
    return {
      mode: mode,
      parent: parent,
      sibling: sibling,
      afterValue: afterValue
    };
  }

  function createObject(ctx, parent, className, name, afterValue, updatesForInstantiation) {
    if (!parent) {
      throw new Error("Parent is required");
    }
    var normalizedClassName = className;
    if (normalizedClassName) {
      try {
        normalizedClassName = C8O.util && C8O.util.toFqcn ? C8O.util.toFqcn(normalizedClassName) : normalizedClassName;
      } catch (_ignoreFqcn) {}
    }
    var updateHints = updatesForInstantiation && typeof updatesForInstantiation === "object" ? updatesForInstantiation : {};
    var dbo = C8O.dbo.instantiateForCreate(normalizedClassName, parent, updateHints);
    if (!dbo) {
      throw new Error("Unable to instantiate class " + normalizedClassName);
    }
    dbo.bNew = true;
    dbo.hasChanged = true;
    if (name && name.length) {
      dbo.setName(name);
    }
    if (afterValue != null) {
      parent.add(dbo, afterValue);
    } else {
      parent.add(dbo);
    }
    markDirty(ctx, parent);
    markDirty(ctx, dbo);
    return dbo;
  }

  function deleteObject(ctx, qname) {
    var removeInfo = C8O.dbo.removeObject({ qname: qname });
    if (!removeInfo || removeInfo.removed !== true) {
      var reason = removeInfo && removeInfo.errors && removeInfo.errors.length
        ? removeInfo.errors[0].message
        : "delete operation failed";
      throw new Error(reason);
    }
    return removeInfo;
  }

  function moveObject(ctx, qname, target, position) {
    var moveInfo = C8O.dbo.moveObject({
      qname: qname,
      target: target,
      position: position
    });
    if (!moveInfo || moveInfo.done !== true) {
      var reason = moveInfo && moveInfo.errors && moveInfo.errors.length
        ? moveInfo.errors[0].message
        : "move operation failed";
      throw new Error(reason);
    }
    return moveInfo;
  }

  function applyProperties(ctx, dbo, rawProperties, scopeName, report) {
    var localErrors = [];
    var updates = parsePropertiesMap(rawProperties, localErrors, scopeName + ".properties");
    for (var e = 0; e < localErrors.length; e++) {
      report.errors.push(makeOpError("set_properties_error", localErrors[e].message || localErrors[e], "parse_properties", "", safeQName(dbo)));
    }

    var propertyNames = Object.keys(updates || {});
    if (!propertyNames.length) {
      return { changed: false, names: [], updated: 0 };
    }

    var applyResult = C8O.dbo.applyPropertyUpdates(dbo, updates);
    var applied = applyResult && applyResult.applied ? applyResult.applied : [];
    var skipped = applyResult && applyResult.skipped ? applyResult.skipped : [];
    var applyErrors = applyResult && applyResult.errors ? applyResult.errors : [];

    if (skipped.length) {
      report.warnings.push(scopeName + ": " + skipped.length + " property(ies) skipped.");
    }
    for (var i = 0; i < applyErrors.length; i++) {
      var err = applyErrors[i];
      report.errors.push(
        makeOpError(
          "set_properties_error",
          err && err.message ? err.message : String(err),
          "apply_properties",
          err && err.detail ? err.detail : "",
          safeQName(dbo)
        )
      );
    }

    var changedNames = [];
    for (var a = 0; a < applied.length; a++) {
      if (applied[a] && applied[a].name) {
        changedNames.push(String(applied[a].name));
      }
    }

    if (applied.length) {
      markDirty(ctx, dbo);
      ctx.summary.updatedProperties += applied.length;
      report.applied.push({
        action: "setProperties",
        qname: safeQName(dbo),
        updated: applied.length,
        names: changedNames
      });
    }

    return { changed: applied.length > 0, names: changedNames, updated: applied.length };
  }

  function upsertChildren(ctx, parentDbo, parentQName, childrenPatch, strategy, report) {
    if (!Array.isArray(childrenPatch)) {
      return;
    }

    var runtimeChildMap = getChildMapByName(parentDbo, report.warnings, parentQName);
    var desiredNames = [];
    var desiredNameSet = {};

    for (var i = 0; i < childrenPatch.length; i++) {
      var childPatch = childrenPatch[i];
      if (!isPlainObject(childPatch)) {
        report.errors.push(makeOpError("upsert_error", parentQName + ": child patch must be an object.", "upsert_validate", "", parentQName));
        continue;
      }

      var childName = asTrimmed(childPatch.name);
      if (!childName.length) {
        report.errors.push(makeOpError("upsert_error", parentQName + ": child patch requires name.", "upsert_validate", "", parentQName));
        continue;
      }

      desiredNames.push(childName);
      desiredNameSet[childName] = true;

      var childClass = asTrimmed(childPatch.className);
      var childQName = parentQName + "." + childName;
      var nestedChildren = parseChildrenInput(childPatch.children, childQName + ".children", []);
      var runtimeChild = runtimeChildMap[childName] || null;

      if (!runtimeChild) {
        if (!childClass.length) {
          report.errors.push(makeOpError("upsert_error", parentQName + ": className required to create child " + childName, "upsert_create", "", parentQName));
          continue;
        }
        var childUpdates = parsePropertiesMap(childPatch.properties, [], childQName + ".properties");
        var createdChild = createObject(ctx, parentDbo, childClass, childName, null, childUpdates);
        report.applied.push({
          action: "create",
          parentQName: parentQName,
          qname: safeQName(createdChild),
          name: String(createdChild.getName()),
          className: shortClassName(createdChild.getClass().getName())
        });
        incrementMutation(ctx, "created");
        if (childPatch.id !== undefined) {
          registerRef(ctx, childPatch.id, createdChild);
        }

        applyProperties(ctx, createdChild, childPatch.properties, safeQName(createdChild), report);
        upsertChildren(ctx, createdChild, safeQName(createdChild), nestedChildren, strategy, report);
        continue;
      }

      var runtimeClass = runtimeChild.getClass ? String(runtimeChild.getClass().getName()) : "";
      if (childClass.length && !classNamesMatch(runtimeClass, childClass)) {
        if (!strategy.replaceOnClassMismatch) {
          report.errors.push(
            makeOpError(
              "upsert_error",
              parentQName + ": class mismatch for child " + childName + " (runtime=" + shortClassName(runtimeClass) + ", desired=" + childClass + ")",
              "upsert_class_mismatch",
              "",
              safeQName(runtimeChild)
            )
          );
          continue;
        }

        var deleted = deleteObject(ctx, safeQName(runtimeChild));
        report.applied.push({ action: "delete", qname: deleted.qname });
        incrementMutation(ctx, "deleted");

        var recreateUpdates = parsePropertiesMap(childPatch.properties, [], childQName + ".properties");
        var recreated = createObject(ctx, parentDbo, childClass, childName, null, recreateUpdates);
        report.applied.push({
          action: "create",
          parentQName: parentQName,
          qname: safeQName(recreated),
          name: String(recreated.getName()),
          className: shortClassName(recreated.getClass().getName())
        });
        incrementMutation(ctx, "created");
        ctx.summary.replaced += 1;
        if (childPatch.id !== undefined) {
          registerRef(ctx, childPatch.id, recreated);
        }

        applyProperties(ctx, recreated, childPatch.properties, safeQName(recreated), report);
        upsertChildren(ctx, recreated, safeQName(recreated), nestedChildren, strategy, report);
        continue;
      }

      if (childPatch.id !== undefined) {
        registerRef(ctx, childPatch.id, runtimeChild);
      }
      applyProperties(ctx, runtimeChild, childPatch.properties, safeQName(runtimeChild), report);
      upsertChildren(ctx, runtimeChild, safeQName(runtimeChild), nestedChildren, strategy, report);
    }

    if (strategy.pruneMissing) {
      var runtimeChildren = getDirectChildren(parentDbo);
      for (var r = 0; r < runtimeChildren.length; r++) {
        var runtime = runtimeChildren[r];
        var runtimeName = String(runtime.getName());
        if (desiredNameSet[runtimeName]) {
          continue;
        }
        var runtimeQName = safeQName(runtime);
        var pruneDeleted = deleteObject(ctx, runtimeQName);
        report.applied.push({ action: "delete", qname: pruneDeleted.qname });
        incrementMutation(ctx, "deleted");
      }
    }
  }

  function runCreateOperation(ctx, op, report) {
    var relatedQName = asTrimmed(op.related || ctx.targetQName);
    if (!relatedQName.length) {
      throw makeOpError("validation_error", "create operation requires related (or global target)", "validate", "");
    }
    var relatedDbo = C8O.dbo.resolve(relatedQName, { messagePrefix: "related" });
    var mode = asTrimmed(op.mode || "inside").toLowerCase();
    var className = asTrimmed(op.className);
    var name = asTrimmed(op.name);
    var children = parseChildrenInput(op.children, "create.children", []);
    var createCtx = resolveCreateContext(relatedDbo, mode);

    if (!className.length) {
      throw makeOpError("validation_error", "create operation requires className", "validate", "", relatedQName);
    }
    if (!name.length) {
      throw makeOpError("validation_error", "create operation requires name", "validate", "", relatedQName);
    }

    var updates = parsePropertiesMap(op.properties, [], "create.properties");
    var created = createObject(ctx, createCtx.parent, className, name, createCtx.afterValue, updates);
    var createdQName = safeQName(created);

    report.applied.push({
      action: "create",
      related: relatedQName,
      parentQName: safeQName(createCtx.parent),
      mode: createCtx.mode,
      qname: createdQName,
      name: String(created.getName()),
      className: shortClassName(created.getClass().getName())
    });
    incrementMutation(ctx, "created");
    if (op.opId !== undefined) {
      registerRef(ctx, op.opId, created);
    }

    applyProperties(ctx, created, op.properties, createdQName, report);
    if (children.length) {
      upsertChildren(
        ctx,
        created,
        createdQName,
        children,
        { replaceOnClassMismatch: true, pruneMissing: false, reorder: false },
        report
      );
    }
  }

  function runDeleteOperation(ctx, op, report) {
    var qname = asTrimmed(resolveRefsInValue(ctx, op.qname || op.target));
    if (!qname.length) {
      throw makeOpError("validation_error", "delete operation requires qname", "validate", "", "");
    }
    var deleted = deleteObject(ctx, qname);
    report.applied.push({ action: "delete", qname: deleted.qname, parentQName: deleted.parentQName });
    incrementMutation(ctx, "deleted");
  }

  function runMoveOperation(ctx, op, report) {
    var qname = asTrimmed(resolveRefsInValue(ctx, op.qname));
    var target = asTrimmed(resolveRefsInValue(ctx, op.target || op.related));
    var position = asTrimmed(op.position || op.mode || "inside").toLowerCase();
    if (!qname.length) {
      throw makeOpError("validation_error", "move operation requires qname", "validate", "", "");
    }
    if (!target.length) {
      throw makeOpError("validation_error", "move operation requires target", "validate", "", qname);
    }
    var moved = moveObject(ctx, qname, target, position);
    report.applied.push({
      action: "move",
      qname: moved.qname,
      fromParent: moved.fromParent,
      toParent: moved.toParent,
      position: moved.position
    });
    incrementMutation(ctx, "moved");
  }

  function runSetPropertiesOperation(ctx, op, report) {
    var resolvedQName = resolveRefsInValue(ctx, op.qname || ctx.targetQName);
    var qname = asTrimmed(resolvedQName);
    if (!qname.length) {
      throw makeOpError("validation_error", "setProperties operation requires qname (or global target)", "validate", "", "");
    }
    var dbo = C8O.dbo.resolve(qname, { messagePrefix: "qname" });
    applyProperties(ctx, dbo, op.properties, qname, report);
  }

  function runUpsertTreeOperation(ctx, op, report) {
    var resolvedQName = resolveRefsInValue(ctx, op.qname || ctx.targetQName);
    var qname = asTrimmed(resolvedQName);
    if (!qname.length) {
      throw makeOpError("validation_error", "upsertTree operation requires qname (or global target)", "validate", "", "");
    }

    var patch = op.patch;
    if (!patch) {
      patch = op.node || op.tree;
    }
    patch = resolveRefsInValue(ctx, patch);
    if (typeof patch === "string") {
      patch = parseJsonMaybe(patch, "upsertTree.patch", [], "object");
    }
    if (!isPlainObject(patch)) {
      throw makeOpError("validation_error", "upsertTree requires patch/node/tree JSON object", "validate", "", qname);
    }

    var strategy = normalizeStrategy(op.strategy, ctx.strategy);
    var root = C8O.dbo.resolve(qname, { messagePrefix: "qname" });

    if (patch.properties !== undefined) {
      applyProperties(ctx, root, patch.properties, qname, report);
    }

    var childrenPatch = parseChildrenInput(patch.children, qname + ".children", []);
    upsertChildren(ctx, root, qname, childrenPatch, strategy, report);
  }

  function saveTouchedProjects(ctx, globalErrors) {
    var names = Object.keys(ctx.projectMap || {});
    var saveResults = [];
    if (!ctx.autoSave || !names.length) {
      return saveResults;
    }
    for (var i = 0; i < names.length; i++) {
      var projectName = names[i];
      var project = ctx.projectMap[projectName];
      var saveResult = C8O.dbo.saveProject(project, globalErrors);
      saveResults.push({
        project: projectName,
        saved: saveResult && saveResult.saved === true,
        message: saveResult && saveResult.message ? String(saveResult.message) : ""
      });
    }
    return saveResults;
  }

  function triggerMobileBuilderByProject(ctx, globalErrors) {
    var names = Object.keys(ctx.projectAnchorMap || {});
    var refreshResults = [];
    for (var i = 0; i < names.length; i++) {
      var projectName = names[i];
      var anchor = ctx.projectAnchorMap[projectName];
      if (!anchor) {
        continue;
      }
      var refreshInfo = C8O.dbo.triggerMobileBuilderRefresh(anchor, globalErrors);
      refreshResults.push({
        project: projectName,
        requested: refreshInfo && refreshInfo.requested === true,
        triggered: refreshInfo && refreshInfo.triggered === true,
        message: refreshInfo && refreshInfo.message ? String(refreshInfo.message) : ""
      });
    }
    return refreshResults;
  }

  C8O.dbo.batchApply = function (args) {
    var params = args || {};
    var startedAt = nowMillis();

    var targetQName = asTrimmed(params.target);
    var strict = asBoolean(params.strict, false) === true;
    var onError = normalizeOnError(params.onError, strict);
    var autoSave = C8O.util.parseAutoSaveFlag ? C8O.util.parseAutoSaveFlag(params.autoSave, true) : asBoolean(params.autoSave, true);
    var dryRun = asBoolean(params.dryRun, false) === true;
    var resumeFrom = 0;
    if (params.resumeFrom !== undefined && params.resumeFrom !== null) {
      try {
        var parsedResume = parseInt(String(params.resumeFrom), 10);
        if (!isNaN(parsedResume) && parsedResume >= 0) {
          resumeFrom = parsedResume;
        }
      } catch (_ignoreResumeFrom) {}
    }

    var globalErrors = [];
    var operations = parseOperationsInput(params.operations, globalErrors);
    var strategy = normalizeStrategy(params.strategy, null);
    var executionId = asTrimmed(params.executionId);
    if (!executionId.length) {
      executionId = "exec-" + String(startedAt);
    }

    var ctx = {
      targetQName: targetQName,
      strict: strict,
      onError: onError,
      autoSave: autoSave,
      dryRun: dryRun,
      strategy: strategy,
      touchedQNames: [],
      touchedQNameSet: {},
      projectMap: {},
      projectAnchorMap: {},
      refs: {},
      summary: {
        planned: operations.length,
        applied: 0,
        created: 0,
        deleted: 0,
        moved: 0,
        updatedProperties: 0,
        replaced: 0,
        failedOps: 0,
        successfulOps: 0,
        skippedOps: 0,
        notRunOps: 0
      }
    };

    var opReports = [];
    var stop = null;
    var failedOpIds = [];
    var i = 0;

    for (i = 0; i < operations.length; i++) {
      var op = operations[i];
      var report = {
        index: i,
        opId: "",
        type: "",
        status: "pending",
        phase: "",
        qname: "",
        warnings: [],
        errors: [],
        applied: []
      };

      if (i < resumeFrom) {
        report.opId = "op_" + i;
        if (isPlainObject(op) && op.opId !== undefined) {
          report.opId = asTrimmed(op.opId) || report.opId;
        }
        report.type = isPlainObject(op) ? asTrimmed(op.type) : "";
        report.status = "skipped";
        report.phase = "resume_skip";
        opReports.push(report);
        ctx.summary.skippedOps += 1;
        continue;
      }

      if (!isPlainObject(op)) {
        report.opId = "op_" + i;
        report.status = "failed";
        report.phase = "validate";
        report.errors.push(makeOpError("validation_error", "Operation must be an object.", "validate", "", ""));
        opReports.push(report);
        ctx.summary.failedOps += 1;
        failedOpIds.push(report.opId);
        if (onError === "stop") {
          stop = {
            opIndex: i,
            opId: report.opId,
            type: "",
            phase: report.phase,
            qname: "",
            code: "validation_error",
            message: "Operation must be an object."
          };
          break;
        }
        continue;
      }

      var opType = asTrimmed(op.type).toLowerCase();
      report.type = opType;
      report.opId = asTrimmed(op.opId);
      if (!report.opId.length) {
        report.opId = "op_" + i;
      }

      try {
        if (!opType.length) {
          throw makeOpError("validation_error", "type is required", "validate", "", "");
        }
        if (dryRun) {
          report.status = "skipped";
          report.phase = "dry_run";
          report.warnings.push("dryRun=true: operation not executed");
          opReports.push(report);
          ctx.summary.skippedOps += 1;
          continue;
        }

        if (opType === "create") {
          report.phase = "create";
          runCreateOperation(ctx, resolveRefsInValue(ctx, op), report);
        } else if (opType === "delete") {
          report.phase = "delete";
          runDeleteOperation(ctx, resolveRefsInValue(ctx, op), report);
        } else if (opType === "move") {
          report.phase = "move";
          runMoveOperation(ctx, resolveRefsInValue(ctx, op), report);
        } else if (opType === "setproperties") {
          report.phase = "set_properties";
          runSetPropertiesOperation(ctx, resolveRefsInValue(ctx, op), report);
        } else if (opType === "upserttree") {
          report.phase = "upsert_tree";
          runUpsertTreeOperation(ctx, resolveRefsInValue(ctx, op), report);
        } else {
          throw makeOpError("validation_error", "Unsupported operation type: " + op.type, "validate", "", "");
        }

        if (report.errors.length > 0) {
          report.status = report.applied.length > 0 ? "partial" : "failed";
        } else {
          report.status = "applied";
        }
      } catch (opError) {
        var normalizedError = null;
        if (isPlainObject(opError) && opError.code && opError.message) {
          normalizedError = opError;
        } else {
          var rawMessage = safeString(opError);
          var code = "operation_error";
          if (rawMessage.indexOf("$ref") >= 0) {
            code = "reference_error";
          }
          normalizedError = makeOpError(code, rawMessage, report.phase || "operation", "", report.qname || "");
        }
        report.status = "failed";
        report.errors.push(normalizedError);
      }

      if (report.status === "failed") {
        ctx.summary.failedOps += 1;
        failedOpIds.push(report.opId);
        if (!stop && onError === "stop") {
          var stopError = report.errors.length ? report.errors[0] : makeOpError("operation_error", "Operation failed", report.phase, "", report.qname);
          stop = {
            opIndex: i,
            opId: report.opId,
            type: report.type,
            phase: stopError.phase || report.phase || "",
            qname: stopError.qname || report.qname || "",
            code: stopError.code || "operation_error",
            message: stopError.message || "Operation failed"
          };
          opReports.push(report);
          break;
        }
      } else {
        ctx.summary.successfulOps += 1;
        ctx.summary.applied += 1;
      }

      opReports.push(report);
    }

    if (stop) {
      for (var nr = i + 1; nr < operations.length; nr++) {
        var pendingOp = operations[nr];
        var pendingOpId = "op_" + nr;
        var pendingType = "";
        if (isPlainObject(pendingOp)) {
          pendingType = asTrimmed(pendingOp.type).toLowerCase();
          var pendingRawId = asTrimmed(pendingOp.opId);
          if (pendingRawId.length) {
            pendingOpId = pendingRawId;
          }
        }
        opReports.push({
          index: nr,
          opId: pendingOpId,
          type: pendingType,
          status: "not_run",
          phase: "not_run",
          qname: "",
          warnings: [],
          errors: [],
          applied: []
        });
        ctx.summary.notRunOps += 1;
      }
    }

    var mobileBuilderResults = [];
    if (!dryRun) {
      mobileBuilderResults = triggerMobileBuilderByProject(ctx, globalErrors);
    }
    var saveResults = [];
    if (!dryRun) {
      saveResults = saveTouchedProjects(ctx, globalErrors);
    }

    var status = "ok";
    if (stop) {
      status = "failed";
    } else if (ctx.summary.failedOps > 0 || globalErrors.length > 0) {
      status = "partial";
    }

    var message = "Batch apply completed.";
    if (status === "failed") {
      message = "Batch apply stopped on error.";
    } else if (status === "partial") {
      message = "Batch apply completed with errors.";
    }

    var savedFlag = false;
    if (!dryRun && autoSave) {
      if (saveResults.length > 0) {
        savedFlag = true;
        for (var sr = 0; sr < saveResults.length; sr++) {
          if (saveResults[sr].saved !== true) {
            savedFlag = false;
            break;
          }
        }
      }
    }

    var resumeFromIndex = operations.length;
    if (stop && stop.opIndex != null) {
      resumeFromIndex = stop.opIndex + 1;
    }
    var remaining = Math.max(0, operations.length - resumeFromIndex);

    var finishedAt = nowMillis();

    return {
      status: status,
      message: message,
      targetQName: targetQName,
      onError: onError,
      strict: strict,
      dryRun: dryRun,
      autoSave: autoSave,
      saved: savedFlag,
      summary: ctx.summary,
      touchedQNames: ctx.touchedQNames,
      refs: ctx.refs,
      operations: opReports,
      errors: globalErrors,
      stop: stop,
      resume: {
        executionId: executionId,
        fromOpIndex: resumeFromIndex,
        totalOperations: operations.length,
        remaining: remaining,
        canResume: remaining > 0,
        failedOpIds: failedOpIds
      },
      saveResults: saveResults,
      mobileBuilder: mobileBuilderResults,
      durationMs: finishedAt - startedAt,
      timestamp: finishedAt
    };
  };
})();
