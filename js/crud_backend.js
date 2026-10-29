if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.crudBackend = C8O.crudBackend || {};

(function () {
  function safeComment(dbo, text) {
    if (!dbo || typeof dbo.setComment !== "function") {
      return;
    }
    try {
      dbo.setComment(String(text || ""));
    } catch (_ignoreComment) {}
  }

  function safeDescription(dbo, text) {
    if (!dbo || typeof dbo.setDescription !== "function") {
      return;
    }
    try {
      dbo.setDescription(String(text || ""));
    } catch (_ignoreDescription) {}
  }

  function applySequenceSecurity(ctx, requestable, accessibility, authenticatedContextRequired, result) {
    if (!ctx || !requestable || typeof ctx.applyUpdates !== "function") {
      return;
    }
    var updates = {};
    var accessText = ctx.trimmed(accessibility || "");
    if (accessText.length) {
      updates.accessibility = accessText.charAt(0).toUpperCase() + accessText.substring(1).toLowerCase();
    }
    if (authenticatedContextRequired != null) {
      updates.authenticatedContextRequired = authenticatedContextRequired === true;
    }
    ctx.applyUpdates(requestable, updates, result);
  }

  function fieldLabel(ctx, field) {
    var raw = ctx.trimmed(field && (field.label || field.name || field.column) || "");
    if (raw.length) {
      return raw;
    }
    return ctx.humanizeIdentifier ? ctx.humanizeIdentifier(field && (field.column || field.name) || "") : String(field && (field.column || field.name) || "");
  }

  function entityLabel(ctx, entity) {
    var raw = ctx.trimmed(entity && (entity.displayLabel || entity.label || entity.name) || "");
    if (raw.length) {
      return raw;
    }
    return ctx.humanizeIdentifier ? ctx.humanizeIdentifier(entity && entity.name || "") : String(entity && entity.name || "");
  }

  function txComment(ctx, spec, options) {
    var current = options || {};
    if (current.kind === "connector") {
      return spec.database.driver.technology + " CRUD data source for " + spec.project + ".";
    }
    if (current.kind === "init") {
      var labels = [];
      for (var i = 0; i < spec.entities.length; i++) {
        labels.push(entityLabel(ctx, spec.entities[i]));
      }
      return "Create or update the SQL schema for " + labels.join(", ") + " and seed demo rows.";
    }
    if (current.kind === "relation" && current.relation && current.entity) {
      return "List " + entityLabel(ctx, current.entity) + " rows filtered by " + current.relation.fromField + ".";
    }
    if (current.kind !== "crud" || !current.entity) {
      return "";
    }
    var label = entityLabel(ctx, current.entity);
    switch (current.verb) {
      case "list":
        return "List " + label + " rows.";
      case "count":
        return "Count " + label + " rows.";
      case "read":
        return "Read one " + current.entity.singular + " row by primary key.";
      case "create":
        return "Create one " + current.entity.singular + " row.";
      case "update":
        return "Update one " + current.entity.singular + " row by primary key.";
      case "delete":
        return "Delete one " + current.entity.singular + " row by primary key.";
      default:
        return "";
    }
  }

  function sequenceComment(ctx, options) {
    var current = options || {};
    if (current.kind === "relation" && current.relation && current.entity) {
      return "Business sequence exposing the relation list for " + entityLabel(ctx, current.entity) + " by " + current.relation.fromField + ".";
    }
    if (current.kind !== "crud" || !current.entity) {
      return "";
    }
    var label = entityLabel(ctx, current.entity);
    switch (current.verb) {
      case "list":
        return "Business sequence listing " + label + ".";
      case "count":
        return "Business sequence counting " + label + ".";
      case "read":
        return "Business sequence reading one " + current.entity.singular + " by primary key.";
      case "create":
        return "Business sequence creating one " + current.entity.singular + ".";
      case "update":
        return "Business sequence updating one " + current.entity.singular + ".";
      case "delete":
        return "Business sequence deleting one " + current.entity.singular + ".";
      default:
        return "";
    }
  }

  function authSequenceComment(kind) {
    if (kind === "login") {
      return "Authentication skeleton. Marks the current session as authenticated with the provided username.";
    }
    if (kind === "logout") {
      return "Authentication skeleton. Clears the current session authenticated user.";
    }
    return "";
  }

  function authVariableDescription(name) {
    var key = String(name || "");
    if (key === "username") {
      return "Skeleton username used to flag the HTTP session as authenticated.";
    }
    if (key === "password") {
      return "Skeleton password placeholder. No credential check is performed in the generated scaffold.";
    }
    return "Authentication input `" + key + "`.";
  }

  function findEntityField(ctx, entity, fieldName) {
    return ctx.findField(entity, function (field) {
      return ctx.normalizedIdentifier(field && (field.column || field.name)) === ctx.normalizedIdentifier(fieldName || "");
    });
  }

  function findRelationForField(ctx, spec, entity, fieldName) {
    var relations = ctx.ensureArray(spec && spec.relations);
    var entityName = entity && entity.name ? entity.name : "";
    var normalizedFieldName = ctx.normalizedIdentifier(fieldName || "");
    for (var i = 0; i < relations.length; i++) {
      var relation = relations[i];
      if (!relation || relation.type !== "many-to-one") {
        continue;
      }
      if (ctx.pluralize(ctx.normalizedIdentifier(relation.fromEntity || "")) !== entityName) {
        continue;
      }
      if (ctx.normalizedIdentifier(relation.fromField || "") !== normalizedFieldName) {
        continue;
      }
      return relation;
    }
    return null;
  }

  function fieldVariableDescription(ctx, spec, entity, fieldName) {
    var field = findEntityField(ctx, entity, fieldName);
    if (!field) {
      if (ctx.normalizedIdentifier(fieldName || "") === ctx.normalizedIdentifier(entity && entity.primaryField && entity.primaryField.column || "id")) {
        return entity && entity.singular ? (entity.singular + " primary key.") : (String(fieldName || "id") + " primary key.");
      }
      return "Input `" + String(fieldName || "") + "`.";
    }
    if (field.primary === true) {
      return entity.singular + " primary key.";
    }
    var relation = findRelationForField(ctx, spec, entity, field.column);
    if (relation) {
      return fieldLabel(ctx, field) + " foreign key referencing " + relation.toEntity + "." + relation.toField + ".";
    }
    return fieldLabel(ctx, field) + " for " + entity.singular + ".";
  }

  function requestableVariableDescription(ctx, spec, options, variableName) {
    var current = options || {};
    if (current.kind === "relation" && current.entity) {
      return fieldVariableDescription(ctx, spec, current.entity, variableName);
    }
    if (current.kind === "crud" && current.entity) {
      return fieldVariableDescription(ctx, spec, current.entity, variableName);
    }
    return "Input `" + String(variableName || "") + "`.";
  }

  function stepVariableDescription(ctx, spec, options, variableName) {
    return "Forward " + requestableVariableDescription(ctx, spec, options, variableName);
  }

  function authSequenceQName(projectName, sequenceName) {
    return String(projectName || "") + ".sq:" + String(sequenceName || "");
  }

  function normalizeVariableEntries(variableEntries) {
    var entries = [];
    for (var i = 0; i < variableEntries.length; i++) {
      var raw = variableEntries[i];
      if (raw == null) {
        continue;
      }
      if (typeof raw === "string") {
        entries.push({ name: String(raw) });
        continue;
      }
      if (typeof raw === "object" && raw.name) {
        entries.push(raw);
      }
    }
    return entries;
  }

  function rowFieldValue(ctx, row, fieldName) {
    if (!row || typeof row !== "object") {
      return null;
    }
    var candidates = [];
    var normalized = ctx.normalizedIdentifier(fieldName || "");
    if (normalized.length) {
      candidates.push(normalized);
      candidates.push(normalized.toUpperCase());
      candidates.push(normalized.toLowerCase());
    }
    for (var i = 0; i < candidates.length; i++) {
      if (row[candidates[i]] !== undefined && row[candidates[i]] !== null && row[candidates[i]] !== "") {
        return row[candidates[i]];
      }
    }
    return null;
  }

  function sourceSmartType(priority, xpath) {
    return {
      mode: "SOURCE",
      sources: [String(priority || ""), String(xpath || "")]
    };
  }

  function plainSmartType(value) {
    return {
      mode: "PLAIN",
      value: String(value == null ? "" : value)
    };
  }

  function jsonFieldTypeForColumn(field) {
    var rawType = String(field && field.type || "").toUpperCase();
    if (/INT|DECIMAL|NUMERIC|DOUBLE|FLOAT|REAL/.test(rawType)) {
      return "number";
    }
    return "string";
  }

  function rawSqlOutputKey(ctx, fieldName) {
    return ctx.normalizedIdentifier(fieldName || "").toUpperCase();
  }

  function facadeRowFieldEntries(ctx, spec, entity) {
    var entries = [];
    var fields = ctx.ensureArray(entity && entity.fields);
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      if (!field) {
        continue;
      }
      entries.push({
        key: ctx.normalizedIdentifier(field.column || field.name || ""),
        sourceKey: rawSqlOutputKey(ctx, field.column || field.name || ""),
        type: jsonFieldTypeForColumn(field)
      });
    }
    var relations = relationsForEntity(ctx, spec, entity);
    for (var relationIndex = 0; relationIndex < relations.length; relationIndex++) {
      var relation = relations[relationIndex];
      if (!relation) {
        continue;
      }
      var alias = relationLabelAlias(ctx, relation);
      entries.push({
        key: alias,
        sourceKey: rawSqlOutputKey(ctx, alias),
        type: "string"
      });
    }
    return entries;
  }

  function pruneNamedSteps(ctx, parent, names, result) {
    var allowed = {};
    var entries = ctx.ensureArray(names);
    for (var i = 0; i < entries.length; i++) {
      allowed[String(entries[i])] = true;
    }
    if (!parent || typeof parent.getDatabaseObjectChildren !== "function") {
      return;
    }
    var children = parent.getDatabaseObjectChildren();
    var toRemove = [];
    for (var childIndex = 0; childIndex < children.size(); childIndex++) {
      var child = children.get(childIndex);
      var childName = String(child.getName ? child.getName() : "");
      if (allowed[childName]) {
        toRemove.push(child);
      }
    }
    for (var removeIndex = 0; removeIndex < toRemove.length; removeIndex++) {
      removeChild(parent, toRemove[removeIndex], result);
    }
  }

  function pruneVariables(ctx, container, keptNames, className, result) {
    if (!container || typeof container.getDatabaseObjectChildren !== "function") {
      return;
    }
    var kept = {};
    ctx.ensureArray(keptNames).forEach(function (name) { kept[String(name)] = true; });
    var children = container.getDatabaseObjectChildren();
    var toRemove = [];
    for (var i = 0; i < children.size(); i++) {
      var child = children.get(i);
      if (ctx.logicalClassName(child) === className && !kept[String(child.getName())]) {
        toRemove.push(child);
      }
    }
    for (var r = 0; r < toRemove.length; r++) {
      removeChild(container, toRemove[r], result);
    }
  }

  function pruneUnexpectedChildSteps(ctx, parent, allowedNames, result) {
    if (!parent || typeof parent.getDatabaseObjectChildren !== "function") {
      return;
    }
    var allowed = {};
    var entries = ctx.ensureArray(allowedNames);
    for (var i = 0; i < entries.length; i++) {
      allowed[String(entries[i])] = true;
    }
    var children = parent.getDatabaseObjectChildren();
    var toRemove = [];
    for (var childIndex = 0; childIndex < children.size(); childIndex++) {
      var child = children.get(childIndex);
      var logical = ctx.logicalClassName(child);
      if (logical.indexOf("steps.") !== 0) {
        continue;
      }
      var childName = String(child.getName ? child.getName() : "");
      if (!allowed[childName]) {
        toRemove.push(child);
      }
    }
    for (var removeIndex = 0; removeIndex < toRemove.length; removeIndex++) {
      removeChild(parent, toRemove[removeIndex], result);
    }
  }

  function ensureFacadeJsonField(ctx, parent, name, key, valueSmartType, type, result) {
    var field = ctx.ensureChild(parent, "steps.JsonFieldStep", name, result);
    var updates = {
      key: plainSmartType(key),
      value: valueSmartType
    };
    if (ctx.trimmed(type).length) {
      updates.type = ctx.trimmed(type);
    }
    ctx.applyUpdates(field, updates, result);
    return field;
  }

  function buildCanonicalRowsPayload(ctx, sequence, txStep, spec, entity, result) {
    pruneNamedSteps(ctx, sequence, ["CopyPayload", "Total", "Message", "AffectedRows", "AffectedRowsText", "Row"], result);
    var rowsStep = ctx.ensureChild(sequence, "steps.JsonArrayStep", "Rows", result);
    ctx.applyUpdates(rowsStep, {
      key: plainSmartType("rows")
    }, result);
    var iterator = ctx.ensureChild(rowsStep, "steps.IteratorStep", "RowsIterator", result);
    ctx.applyUpdates(iterator, {
      condition: "",
      sourceDefinition: [ctx.priorityOf(txStep), "./document/sql_output/row"]
    }, result);
    var rowStep = ctx.ensureChild(iterator, "steps.JsonObjectStep", "Item", result);
    var fields = facadeRowFieldEntries(ctx, spec, entity);
    var allowedNames = ["Item"];
    var rowPriority = ctx.priorityOf(iterator);
    for (var fieldIndex = 0; fieldIndex < fields.length; fieldIndex++) {
      var entry = fields[fieldIndex];
      var stepName = ctx.pascalize ? ctx.pascalize(entry.key.replace(/__/g, "_")) : entry.key;
      allowedNames.push(stepName);
      ensureFacadeJsonField(
        ctx,
        rowStep,
        stepName,
        entry.key,
        sourceSmartType(rowPriority, "./" + entry.sourceKey + "/text()"),
        entry.type,
        result
      );
    }
    pruneUnexpectedChildSteps(ctx, sequence, ["Call" + ctx.ucfirst(sequence.getName()), "Rows"], result);
    pruneUnexpectedChildSteps(ctx, rowsStep, ["RowsIterator"], result);
    pruneUnexpectedChildSteps(ctx, iterator, ["Item"], result);
    pruneUnexpectedChildSteps(ctx, rowStep, allowedNames, result);
  }

  function buildCanonicalSingleRowPayload(ctx, sequence, txStep, spec, entity, result) {
    pruneNamedSteps(ctx, sequence, ["CopyPayload", "SqlOutput", "Rows", "Total", "Message", "AffectedRows", "AffectedRowsText"], result);
    var rowStep = ctx.ensureChild(sequence, "steps.JsonObjectStep", "Row", result);
    ctx.applyUpdates(rowStep, {
      key: plainSmartType("row")
    }, result);
    var fields = facadeRowFieldEntries(ctx, spec, entity);
    var allowedNames = ["Row"];
    var txPriority = ctx.priorityOf(txStep);
    for (var fieldIndex = 0; fieldIndex < fields.length; fieldIndex++) {
      var entry = fields[fieldIndex];
      var stepName = ctx.pascalize ? ctx.pascalize(entry.key.replace(/__/g, "_")) : entry.key;
      allowedNames.push(stepName);
      ensureFacadeJsonField(
        ctx,
        rowStep,
        stepName,
        entry.key,
        sourceSmartType(txPriority, "./document/sql_output/row/" + entry.sourceKey + "/text()"),
        entry.type,
        result
      );
    }
    pruneUnexpectedChildSteps(ctx, sequence, ["Call" + ctx.ucfirst(sequence.getName()), "Row"], result);
    pruneUnexpectedChildSteps(ctx, rowStep, allowedNames, result);
  }

  function buildCanonicalCountPayload(ctx, sequence, txStep, result) {
    pruneNamedSteps(ctx, sequence, ["CopyPayload", "SqlOutput", "Message", "AffectedRows", "AffectedRowsText"], result);
    ensureFacadeJsonField(
      ctx,
      sequence,
      "Total",
      "total",
      sourceSmartType(ctx.priorityOf(txStep), "./document/sql_output/row/TOTAL/text()"),
      "number",
      result
    );
    pruneUnexpectedChildSteps(ctx, sequence, ["Call" + ctx.ucfirst(sequence.getName()), "Total"], result);
  }

  function buildCanonicalMutationPayload(ctx, sequence, txStep, result) {
    pruneNamedSteps(ctx, sequence, ["CopyPayload", "SqlOutput", "Total", "AffectedRows", "AffectedRowsText"], result);
    ensureFacadeJsonField(
      ctx,
      sequence,
      "Message",
      "message",
      sourceSmartType(ctx.priorityOf(txStep), "./document/sql_output/text()"),
      "string",
      result
    );
    pruneUnexpectedChildSteps(ctx, sequence, ["Call" + ctx.ucfirst(sequence.getName()), "Message"], result);
  }

  function configurePublicSequencePayload(ctx, sequence, txStep, options, result) {
    var current = options || {};
    if (current.kind === "relation" && current.entity) {
      buildCanonicalRowsPayload(ctx, sequence, txStep, current.spec, current.entity, result);
      return;
    }
    if (current.kind !== "crud" || !current.entity) {
      return;
    }
    switch (String(current.verb || "")) {
      case "list":
        buildCanonicalRowsPayload(ctx, sequence, txStep, current.spec, current.entity, result);
        return;
      case "read":
        buildCanonicalSingleRowPayload(ctx, sequence, txStep, current.spec, current.entity, result);
        return;
      case "count":
        buildCanonicalCountPayload(ctx, sequence, txStep, result);
        return;
      case "create":
      case "update":
      case "delete":
        buildCanonicalMutationPayload(ctx, sequence, txStep, result);
        return;
      default:
        return;
    }
  }

  // The id of the row the sample create added: the one id of the list that was not in it before. Both reads hold the
  // whole list, so a row that was already there is never updated or deleted, and two new ids (another client wrote
  // meanwhile) give no id.
  function createdRowId(ctx, entity, rowsBefore, rowsAfter) {
    var column = entity.primaryField.column;
    var known = {};
    ctx.ensureArray(rowsBefore).forEach(function (row) {
      var id = rowFieldValue(ctx, row, column);
      if (id != null) {
        known[String(id)] = true;
      }
    });
    var createdId = null;
    var rows = ctx.ensureArray(rowsAfter);
    for (var i = 0; i < rows.length; i++) {
      var id = rowFieldValue(ctx, rows[i], column);
      if (id == null || known[String(id)]) {
        continue;
      }
      if (createdId != null) {
        return null;
      }
      createdId = id;
    }
    return createdId;
  }

  function pickDefaultTransaction(ctx, connector, spec) {
    if (!connector) {
      return null;
    }
    if (spec && spec.entities && spec.entities.length) {
      var firstListName = C8O.crudBackend.txName(ctx, spec.entities[0], "list");
      var firstList = ctx.findChild(connector, firstListName, "transactions.SqlTransaction");
      if (firstList) {
        return firstList;
      }
    }
    return ctx.findChild(connector, "init_schema", "transactions.SqlTransaction");
  }

  function ensureDefaultTransaction(connector, tx, result) {
    if (!connector || !tx) {
      return;
    }
    try {
      connector.setDefaultTransaction(tx);
      if (result && result.updated) {
        result.updated.push(tx.getFullQName ? String(tx.getFullQName()) : String(tx.getName()));
      }
    } catch (_ignoreDefaultTx) {
      try {
        tx.setByDefault();
        if (result && result.updated) {
          result.updated.push(tx.getFullQName ? String(tx.getFullQName()) : String(tx.getName()));
        }
      } catch (_ignoreDefaultTxFallback) {}
    }
  }

  function removeChild(parent, child, result) {
    if (!parent || !child || typeof parent.remove !== "function") {
      return false;
    }
    // Its QName is read before it is detached: afterwards it was only "cn:void" or "st:body" (preflight checks).
    var removedQName = "";
    try {
      removedQName = child.getFullQName ? String(child.getFullQName()) : String(child.getName());
    } catch (_ignoreRemovedQName) {
      removedQName = String(child.getName());
    }
    try {
      parent.remove(child);
      try {
        parent.hasChanged = true;
      } catch (_ignoreParentChanged) {}
      try {
        var project = parent.getProject ? parent.getProject() : null;
        if (project) {
          project.hasChanged = true;
        }
      } catch (_ignoreProjectChanged) {}
      if (result && result.deleted) {
        result.deleted.push(removedQName);
      } else if (result && result.updated) {
        result.updated.push(removedQName);
      }
      return true;
    } catch (_ignoreRemoveChild) {
      return false;
    }
  }

  // The lists hold QNames only: a "... +N more" marker inside them read as a QName (preflight checks). The first ones
  // are kept, without duplicates, and the counts give the rest.
  function compactMutationList(ctx, entries, limit) {
    var items = [];
    var seen = {};
    ctx.ensureArray(entries).forEach(function (item) {
      var key = String(item);
      if (!seen[key]) {
        seen[key] = true;
        items.push(key);
      }
    });
    var maxItems = Math.max(1, parseInt(limit, 10) || 20);
    return items.slice(0, maxItems);
  }

  function finalizeUpsertCrudResult(ctx, result) {
    result.createdCount = ctx.ensureArray(result.created).length;
    result.updatedCount = ctx.ensureArray(result.updated).length;
    result.deletedCount = ctx.ensureArray(result.deleted).length;
    result.created = compactMutationList(ctx, result.created, 25);
    result.updated = compactMutationList(ctx, result.updated, 25);
    result.deleted = compactMutationList(ctx, result.deleted, 25);
    return result;
  }

  function prunePlaceholderVoidConnector(ctx, project, connectorName, result) {
    if (!project) {
      return;
    }
    var voidConnector = ctx.findChild(project, "void", "connectors.SqlConnector");
    if (!voidConnector) {
      return;
    }
    if (ctx.trimmed(connectorName) === "void") {
      return;
    }
    removeChild(project, voidConnector, result);
  }

  function pruneObsoleteTransactions(ctx, connector, result) {
    var names = ["BeginTransaction", "CommitTransaction", "RollbackTransaction"];
    for (var i = 0; i < names.length; i++) {
      var tx = ctx.findChild(connector, names[i], "transactions.SqlTransaction");
      if (tx) {
        removeChild(connector, tx, result);
      }
    }
  }

  function createSampleVariables(ctx, spec, entity, rowIndex, cachedRows) {
    var variables = {};
    var fields = ctx.ensureArray(entity && entity.fields);
    var rowsByEntity = cachedRows || {};
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      if (!field || field.primary === true) {
        continue;
      }
      if (field.references && field.references.entity) {
        var relatedRows = rowsByEntity[field.references.entity] || [];
        var relatedRow = relatedRows[0] || null;
        var relatedId = rowFieldValue(ctx, relatedRow, field.references.field || "id");
        if (relatedId == null) {
          continue;
        }
        variables[field.column] = String(relatedId);
        continue;
      }
      var sampleValue = ctx.sampleValueForField(entity, field, rowIndex);
      if (sampleValue == null) {
        continue;
      }
      variables[field.column] = String(sampleValue);
    }
    return variables;
  }

  function summarizeSchemaLearning(ctx, requestable, payload, result, bucket) {
    var summary = ctx.summarizeRequestableProof(payload, requestable, result);
    if (bucket && bucket.push) {
      bucket.push({
        requestable: requestable,
        status: summary.status,
        ok: summary.ok === true
      });
    }
    return summary;
  }

  function learnRequestableSchema(ctx, requestable, variables, result, bucket) {
    var payload = ctx.requestablePayload(requestable, variables || {}, result, { recordSchema: true });
    return {
      payload: payload,
      summary: summarizeSchemaLearning(ctx, requestable, payload, result, bucket)
    };
  }

  function learnEntitySchemas(ctx, spec, entity, result, cachedRows, bucket) {
    var project = spec.project;
    var connector = spec.database.connector;
    var listName = C8O.crudBackend.txName(ctx, entity, "list");
    var countName = C8O.crudBackend.txName(ctx, entity, "count");
    var readName = C8O.crudBackend.txName(ctx, entity, "read");
    var createName = C8O.crudBackend.txName(ctx, entity, "create");
    var updateName = C8O.crudBackend.txName(ctx, entity, "update");
    var deleteName = C8O.crudBackend.txName(ctx, entity, "delete");
    var listQName = project + "." + connector + "." + listName;
    var countQName = project + "." + connector + "." + countName;
    var readQName = project + "." + connector + "." + readName;
    var createQName = project + "." + connector + "." + createName;
    var updateQName = project + "." + connector + "." + updateName;
    var deleteQName = project + "." + connector + "." + deleteName;

    var listLearning = learnRequestableSchema(ctx, listQName, {}, result, bucket);
    var countLearning = learnRequestableSchema(ctx, countQName, {}, result, bucket);
    var rows = ctx.collectSqlOutputRows(listLearning.payload || {});
    cachedRows[entity.name] = rows;
    var firstExistingRow = rows[0] || null;
    var firstExistingId = rowFieldValue(ctx, firstExistingRow, entity.primaryField.column);
    if (firstExistingId != null) {
      learnRequestableSchema(ctx, readQName, (function () {
        var args = {};
        args[entity.primaryField.column] = String(firstExistingId);
        return args;
      })(), result, bucket);
    }

    var sampleIndex = Math.max(5, Number(spec.seed && spec.seed.rowsPerEntity || 0)) + 50;
    var createVars = createSampleVariables(ctx, spec, entity, sampleIndex, cachedRows);
    if (Object.keys(createVars).length) {
      // requestable-execute keeps the first 12 rows of a list, and the list is in id order: the created row is read in
      // the whole list of the transaction.
      var beforeCreateRows = ctx.transactionRows(project, connector, listName, result);
      learnRequestableSchema(ctx, createQName, createVars, result, bucket);
      var afterCreateRows = ctx.transactionRows(project, connector, listName, result);
      cachedRows[entity.name] = afterCreateRows.length ? afterCreateRows : rows;
      var createdId = createdRowId(ctx, entity, beforeCreateRows, afterCreateRows);
      if (createdId != null) {
        var updateVars = {};
        var createKeys = Object.keys(createVars);
        for (var keyIndex = 0; keyIndex < createKeys.length; keyIndex++) {
          updateVars[createKeys[keyIndex]] = createVars[createKeys[keyIndex]];
        }
        updateVars[entity.primaryField.column] = String(createdId);
        learnRequestableSchema(ctx, updateQName, updateVars, result, bucket);
        learnRequestableSchema(ctx, deleteQName, (function () {
          var args = {};
          args[entity.primaryField.column] = String(createdId);
          return args;
        })(), result, bucket);
      } else {
        ctx.addWarning(result, "Unable to infer created `" + entity.name + "` id to learn update/delete schemas.");
      }
    }
    return {
      list: listLearning.summary,
      count: countLearning.summary
    };
  }

  function learnRelationSchemas(ctx, spec, cachedRows, result, bucket) {
    var relations = ctx.ensureArray(spec && spec.relations);
    for (var relationIndex = 0; relationIndex < relations.length; relationIndex++) {
      var relation = relations[relationIndex];
      if (!relation || relation.type !== "many-to-one") {
        continue;
      }
      var parentEntity = relationTargetEntity(ctx, spec, relation);
      if (!parentEntity) {
        continue;
      }
      var parentRows = cachedRows[parentEntity.name] || [];
      var parentRow = parentRows[0] || null;
      var parentId = rowFieldValue(ctx, parentRow, relation.toField);
      if (parentId == null) {
        continue;
      }
      var requestable = spec.project + "." + spec.database.connector + "." + relationListName(ctx, spec, relation);
      learnRequestableSchema(ctx, requestable, (function () {
        var args = {};
        args[relation.fromField] = String(parentId);
        return args;
      })(), result, bucket);
    }
  }

  function relationLabelAlias(ctx, relation) {
    return ctx.normalizedIdentifier(relation && relation.fromField || "") + "__label";
  }

  function relationsForEntity(ctx, spec, entity) {
    var entries = ctx.ensureArray(spec && spec.relations);
    var matches = [];
    for (var i = 0; i < entries.length; i++) {
      var relation = entries[i];
      if (!relation || relation.type !== "many-to-one") {
        continue;
      }
      if (ctx.pluralize(ctx.normalizedIdentifier(relation.fromEntity)) !== entity.name) {
        continue;
      }
      matches.push(relation);
    }
    return matches;
  }

  function relationTargetEntity(ctx, spec, relation) {
    return typeof ctx.findEntityByName === "function"
      ? ctx.findEntityByName(spec && spec.entities, relation && relation.toEntity)
      : null;
  }

  function relationListName(ctx, spec, relation) {
    var child = typeof ctx.findEntityByName === "function"
      ? ctx.findEntityByName(spec && spec.entities, relation && relation.fromEntity)
      : null;
    var parent = relationTargetEntity(ctx, spec, relation);
    var childPlural = child && child.name ? child.name : ctx.pluralize(ctx.normalizedIdentifier(relation && relation.fromEntity || ""));
    var parentSingular = parent && parent.singular ? parent.singular : ctx.normalizedIdentifier(relation && relation.toEntity || "parent");
    var suffix = parentSingular;
    var duplicateCount = 0;
    var relations = ctx.ensureArray(spec && spec.relations);
    for (var i = 0; i < relations.length; i++) {
      var current = relations[i];
      if (!current || current.type !== "many-to-one") {
        continue;
      }
      if (ctx.normalizedIdentifier(current.fromEntity || "") !== ctx.normalizedIdentifier(relation && relation.fromEntity || "")) {
        continue;
      }
      if (ctx.normalizedIdentifier(current.toEntity || "") !== ctx.normalizedIdentifier(relation && relation.toEntity || "")) {
        continue;
      }
      duplicateCount += 1;
    }
    if (duplicateCount > 1) {
      var fromFieldSuffix = ctx.normalizedIdentifier(relation && relation.fromField || "").replace(/_id$/, "");
      if (fromFieldSuffix.length) {
        suffix = fromFieldSuffix;
      }
    }
    return "list_" + childPlural + "_by_" + suffix;
  }

  function buildJoinedSelectSql(ctx, spec, entity, options) {
    var currentOptions = options || {};
    var baseAlias = currentOptions.baseAlias || "base";
    var columns = C8O.crudBackend.listColumns(ctx, entity);
    var relations = relationsForEntity(ctx, spec, entity);
    var selectSegments = [];
    for (var columnIndex = 0; columnIndex < columns.length; columnIndex++) {
      selectSegments.push(baseAlias + "." + columns[columnIndex]);
    }
    var joinLines = [];
    for (var relationIndex = 0; relationIndex < relations.length; relationIndex++) {
      var relation = relations[relationIndex];
      var targetEntity = relationTargetEntity(ctx, spec, relation);
      if (!targetEntity) {
        continue;
      }
      var joinAlias = "rel_" + (relationIndex + 1);
      var labelField = ctx.normalizedIdentifier((relation.ui && relation.ui.optionLabelField) || "");
      if ((!labelField.length || labelField === "unnamed") && typeof ctx.preferredRelationLabelField === "function") {
        var preferredLabelField = ctx.preferredRelationLabelField(targetEntity);
        labelField = ctx.normalizedIdentifier(preferredLabelField && (preferredLabelField.column || preferredLabelField.name) || "");
      }
      if (!labelField.length || labelField === "unnamed") {
        labelField = ctx.normalizedIdentifier(relation.toField || "id");
      }
      joinLines.push("LEFT JOIN " + targetEntity.name + " " + joinAlias + " ON " + baseAlias + "." + relation.fromField + " = " + joinAlias + "." + relation.toField);
      selectSegments.push(joinAlias + "." + labelField + " AS " + relationLabelAlias(ctx, relation));
    }
    var lines = [
      "SELECT " + selectSegments.join(", "),
      "FROM " + entity.name + " " + baseAlias
    ];
    for (var joinIndex = 0; joinIndex < joinLines.length; joinIndex++) {
      lines.push(joinLines[joinIndex]);
    }
    var whereSegments = ctx.ensureArray(currentOptions.whereSegments);
    for (var whereIndex = 0; whereIndex < whereSegments.length; whereIndex++) {
      if (ctx.trimmed(whereSegments[whereIndex]).length) {
        lines.push(whereSegments[whereIndex]);
      }
    }
    if (ctx.trimmed(currentOptions.orderBy).length) {
      lines.push("ORDER BY " + currentOptions.orderBy);
    }
    return lines.join("\n");
  }

  C8O.crudBackend.mapSqlType = function (ctx, field, driver) {
    var raw = ctx.trimmed(field.type || "").toUpperCase();
    if (!raw.length) {
      raw = "VARCHAR(255)";
    }
    if (raw === "STRING") {
      raw = "VARCHAR(255)";
    }
    if (raw === "TEXT") {
      return driver.textType;
    }
    if (raw === "BOOLEAN") {
      return driver.booleanType;
    }
    if (raw === "INT" || raw === "INTEGER") {
      return driver.id === "oracle" ? "NUMBER" : "INT";
    }
    // A bare DECIMAL or NUMERIC has scale 0 on HSQLDB, SQL Server and MySQL: 980.50 is stored 980. An amount keeps its cents.
    if (raw === "DECIMAL" || raw === "NUMERIC" || raw === "MONEY" || raw === "CURRENCY") {
      return driver.id === "oracle" ? "NUMBER(12,2)" : "DECIMAL(12,2)";
    }
    return raw;
  };

  C8O.crudBackend.renderDefaultValue = function (_ctx, value, driver) {
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value === "boolean") {
      return driver.booleanType === "BOOLEAN" ? (value ? "TRUE" : "FALSE") : (value ? "1" : "0");
    }
    if (typeof value === "number") {
      return String(value);
    }
    return "'" + String(value).replace(/'/g, "''") + "'";
  };

  C8O.crudBackend.renderColumnDefinition = function (ctx, field, driver) {
    if (field.primary) {
      if (field.column === "id") {
        return field.column + " " + driver.identityColumn;
      }
      var pkType = C8O.crudBackend.mapSqlType(ctx, field, driver);
      return field.column + " " + pkType + " PRIMARY KEY";
    }
    var segments = [field.column, C8O.crudBackend.mapSqlType(ctx, field, driver)];
    if (field.defaultValue !== null && field.defaultValue !== undefined) {
      segments.push("DEFAULT " + C8O.crudBackend.renderDefaultValue(ctx, field.defaultValue, driver));
    }
    if (field.required) {
      segments.push("NOT NULL");
    }
    if (field.unique) {
      segments.push("UNIQUE");
    }
    if (field.references && field.references.entity) {
      var target = ctx.pluralize(ctx.normalizedIdentifier(field.references.entity));
      var targetColumn = ctx.normalizedIdentifier(field.references.field || "id");
      segments.push("REFERENCES " + target + "(" + targetColumn + ")");
    }
    return segments.join(" ");
  };

  C8O.crudBackend.buildCreateTableSql = function (ctx, spec, entity) {
    var driver = spec.database.driver;
    var columnLines = [];
    for (var i = 0; i < entity.fields.length; i++) {
      columnLines.push("  " + C8O.crudBackend.renderColumnDefinition(ctx, entity.fields[i], driver));
    }
    var createPrefix = driver.id === "oracle" ? "CREATE TABLE " : "CREATE TABLE IF NOT EXISTS ";
    return createPrefix + entity.name + " (\n" + columnLines.join(",\n") + "\n)";
  };

  C8O.crudBackend.orderedEntities = function (ctx, spec) {
    var entities = ctx.ensureArray(spec && spec.entities);
    var map = {};
    var ordered = [];
    var visiting = {};
    var visited = {};
    for (var i = 0; i < entities.length; i++) {
      map[entities[i].name] = entities[i];
    }
    function visit(entity) {
      if (!entity || visited[entity.name]) {
        return;
      }
      if (visiting[entity.name]) {
        return;
      }
      visiting[entity.name] = true;
      var fields = ctx.ensureArray(entity.fields);
      for (var f = 0; f < fields.length; f++) {
        if (!fields[f].references || !fields[f].references.entity) {
          continue;
        }
        visit(map[ctx.pluralize(ctx.normalizedIdentifier(fields[f].references.entity))]);
      }
      visiting[entity.name] = false;
      visited[entity.name] = true;
      ordered.push(entity);
    }
    for (var j = 0; j < entities.length; j++) {
      visit(entities[j]);
    }
    return ordered;
  };

  C8O.crudBackend.buildDeleteSql = function (_ctx, entity) {
    return "DELETE FROM " + entity.name + ";";
  };

  C8O.crudBackend.buildSeedSql = function (ctx, spec, entity) {
    return ctx.buildSeedSql(spec, entity);
  };

  C8O.crudBackend.buildInitSql = function (ctx, spec) {
    var entityOrder = C8O.crudBackend.orderedEntities(ctx, spec);
    var chunks = [];
    for (var i = 0; i < entityOrder.length; i++) {
      chunks.push(C8O.crudBackend.buildCreateTableSql(ctx, spec, entityOrder[i]) + ";");
    }
    if (spec.seed.enabled === true) {
      for (var j = entityOrder.length - 1; j >= 0; j--) {
        chunks.push(C8O.crudBackend.buildDeleteSql(ctx, entityOrder[j]));
      }
      for (var k = 0; k < entityOrder.length; k++) {
        var seedSql = C8O.crudBackend.buildSeedSql(ctx, spec, entityOrder[k]);
        if (seedSql.length) {
          chunks.push(seedSql);
        }
      }
    }
    return chunks.join("\n\n");
  };

  // An existing database, the one of an app in use: upsert-crud keeps its rows and adds the columns the spec has and the
  // tables lack. CREATE TABLE IF NOT EXISTS adds no column (every query then failed on the new one, usage tests 29/10)
  // and the seed of init_schema deletes every row. seed.reset:true resets the tables to the demo rows as before.
  C8O.crudBackend.planExistingDatabase = function (ctx, spec, inspection, options) {
    var plan = { inspected: !!(inspection && inspection.reachable), keep: false, rows: {}, alters: [], notes: [] };
    if (!plan.inspected) {
      // A connector that was there before the call points at a database that may hold the user's rows: one the probe
      // could not open is kept as it is. Treated as fresh, init_schema deleted the rows of an app whose connector the
      // engine had not opened yet (usage tests 29/10).
      if (options && options.connectorExisted === true && !(spec.seed && spec.seed.reset === true)) {
        plan.keep = true;
        plan.notes.push("The database of connector " + spec.database.connector + " could not be inspected (" +
          ((inspection && inspection.error) || "no answer") + "): upsert-crud kept it as it is, seeded nothing and added no " +
          "column. Add the columns of new fields with a one-shot ALTER TABLE transaction, or pass seed.reset:true to reset it.");
      }
      return plan;
    }
    var driver = spec.database.driver;
    var tables = inspection.tables || {};
    var entities = C8O.crudBackend.orderedEntities(ctx, spec);
    for (var i = 0; i < entities.length; i++) {
      var entity = entities[i];
      var table = tables[String(entity.name).toLowerCase()];
      if (!table) {
        continue;
      }
      var rows = Number(table.rows) || 0;
      plan.rows[entity.name] = rows;
      if (rows > 0) {
        plan.keep = true;
      }
      for (var f = 0; f < entity.fields.length; f++) {
        var field = entity.fields[f];
        var existing = (table.columns || {})[String(field.column).toLowerCase()];
        var declaredType = C8O.crudBackend.mapSqlType(ctx, field, driver);
        if (!existing) {
          var hasDefault = field.defaultValue !== null && field.defaultValue !== undefined;
          var column = field;
          if (field.required && !hasDefault && rows > 0) {
            // NOT NULL without a default fails on a table that has rows: the column comes nullable.
            column = ctx.clone ? ctx.clone(field) : JSON.parse(JSON.stringify(field));
            column.required = false;
            plan.notes.push(entity.name + "." + field.column + " is required but has no default: it was added nullable and the " +
              rows + " existing rows hold NULL. Give the field a default (fields[].default) to fill them.");
          }
          plan.alters.push({
            table: entity.name,
            column: field.column,
            sql: C8O.crudBackend.buildAddColumnSql(ctx, entity.name, column, driver)
          });
          continue;
        }
        var declaredScale = /^(DECIMAL|NUMERIC|NUMBER)\s*\(\s*\d+\s*,\s*(\d+)\s*\)$/i.exec(declaredType);
        if (declaredScale && existing.digits !== null && existing.digits !== undefined && Number(existing.digits) < Number(declaredScale[2])) {
          plan.notes.push(entity.name + "." + field.column + " keeps " + existing.digits + " decimals in the database (" + existing.type +
            ") and the spec says " + declaredType + ": upsert-crud never changes an existing column. Change it with " +
            C8O.crudBackend.alterColumnTypeSql(entity.name, field.column, declaredType, driver) + ".");
        }
      }
    }
    if (spec.seed && spec.seed.reset === true) {
      plan.keep = false;
    }
    return plan;
  };

  // The spec type of a column read from the JDBC metadata.
  C8O.crudBackend.specTypeOfColumn = function (column) {
    var name = String(column.typeName || "VARCHAR").toUpperCase();
    if (/^(VARCHAR|CHAR|CHARACTER|CHARACTER VARYING|NVARCHAR|NCHAR|VARCHAR2|NVARCHAR2)$/.test(name) && Number(column.size) > 0) {
      return name + "(" + column.size + ")";
    }
    if (/^(DECIMAL|NUMERIC|NUMBER)$/.test(name) && Number(column.size) > 0 && column.digits !== null && column.digits !== undefined) {
      return name + "(" + column.size + "," + column.digits + ")";
    }
    return name;
  };

  // A column default as the JDBC metadata gives it ('normale', 0, TRUE), as fields[].default takes it; null for an
  // expression (CURRENT_TIMESTAMP, a sequence), which upsert-crud does not copy.
  C8O.crudBackend.specDefaultOfColumn = function (column) {
    var text = column.defaultValue === null || column.defaultValue === undefined ? "" : String(column.defaultValue).trim();
    var quoted = /^'((?:[^']|'')*)'$/.exec(text);
    if (quoted) {
      return quoted[1].replace(/''/g, "'");
    }
    if (/^-?\d+(\.\d+)?$/.test(text)) {
      return Number(text);
    }
    if (/^(TRUE|FALSE)$/i.test(text)) {
      return text.toUpperCase() === "TRUE";
    }
    return null;
  };

  // An app in use: an entity the spec names with some of its fields (or none, only to point a relation at it) keeps
  // the other columns of its table. Without this, upsert-crud regenerated its transactions, sequences and pages from
  // the listed fields only: an agent that cited clients for a relation got read_client selecting the id alone and an
  // update_client with an empty SET (usage tests 29/10). Returns the raw spec with the kept columns as fields, in the
  // table's column order, the fields the table does not have yet after them, and the kept columns by entity.
  C8O.crudBackend.keepExistingColumns = function (ctx, rawSpec, spec, inspection) {
    var out = { spec: null, kept: {} };
    if (!inspection || !inspection.reachable) {
      return out;
    }
    var raw = JSON.parse(JSON.stringify(C8O.util.parseObjectInput(rawSpec, { label: "spec", allowEmpty: false })));
    var rawEntities = ctx.ensureArray(raw.entities);
    var tables = inspection.tables || {};
    var changed = false;
    for (var i = 0; i < spec.entities.length && i < rawEntities.length; i++) {
      var entity = spec.entities[i];
      var table = tables[String(entity.name).toLowerCase()];
      if (!table || !rawEntities[i] || typeof rawEntities[i] !== "object") {
        continue;
      }
      var known = {};
      for (var f = 0; f < entity.fields.length; f++) {
        known[String(entity.fields[f].column).toLowerCase()] = true;
      }
      var rawFields = ctx.ensureArray(rawEntities[i].fields);
      var rawByColumn = {};
      for (var r = 0; r < rawFields.length; r++) {
        var rawField = rawFields[r] || {};
        rawByColumn[ctx.normalizedIdentifier(rawField.column || rawField.name || "")] = rawField;
      }
      var ordered = [];
      var kept = [];
      var columns = table.columns || {};
      var names = Object.keys(columns);
      for (var c = 0; c < names.length; c++) {
        var name = names[c];
        var listed = rawByColumn[ctx.normalizedIdentifier(name)];
        if (listed) {
          ordered.push(listed);
          delete rawByColumn[ctx.normalizedIdentifier(name)];
        } else if (!known[name]) {
          var column = columns[name];
          var keptField = { name: name, type: C8O.crudBackend.specTypeOfColumn(column), required: column.nullable === false };
          var keptDefault = C8O.crudBackend.specDefaultOfColumn(column);
          if (keptDefault !== null) {
            keptField["default"] = keptDefault;
          }
          ordered.push(keptField);
          kept.push(name);
        }
      }
      if (!kept.length) {
        continue;
      }
      for (var n = 0; n < rawFields.length; n++) {
        var rest = rawFields[n] || {};
        if (rawByColumn[ctx.normalizedIdentifier(rest.column || rest.name || "")] === rest) {
          ordered.push(rest);
        }
      }
      rawEntities[i].fields = ordered;
      out.kept[entity.name] = kept;
      changed = true;
    }
    if (changed) {
      raw.entities = rawEntities;
      out.spec = raw;
    }
    return out;
  };

  C8O.crudBackend.buildAddColumnSql = function (ctx, table, field, driver) {
    var definition = C8O.crudBackend.renderColumnDefinition(ctx, field, driver);
    if (driver.id === "oracle") {
      return "ALTER TABLE " + table + " ADD (" + definition + ")";
    }
    return "ALTER TABLE " + table + " ADD " + (driver.id === "sqlserver" ? "" : "COLUMN ") + definition;
  };

  C8O.crudBackend.alterColumnTypeSql = function (table, column, type, driver) {
    switch (driver.id) {
      case "hsqldb": return "ALTER TABLE " + table + " ALTER COLUMN " + column + " SET DATA TYPE " + type;
      case "postgresql": return "ALTER TABLE " + table + " ALTER COLUMN " + column + " TYPE " + type;
      case "mysql":
      case "mariadb": return "ALTER TABLE " + table + " MODIFY " + column + " " + type;
      case "oracle": return "ALTER TABLE " + table + " MODIFY (" + column + " " + type + ")";
      default: return "ALTER TABLE " + table + " ALTER COLUMN " + column + " " + type;
    }
  };

  function jdbcUrlOf(connector) {
    var url = "";
    try {
      url = String(connector.getRealJdbcURL() || "");
    } catch (_noRealUrl) {}
    if (!url.length || url === "null") {
      url = String(connector.getJdbcURL() || "");
      if (url.indexOf("jdbc:hsqldb:file:") === 0) {
        // The connector of a project reloaded since its last transaction has no real URL yet (usage tests 29/10).
        url = "jdbc:hsqldb:file:" + String(Packages.com.twinsoft.convertigo.engine.Engine.theApp.filePropertyManager.getFilepathFromProperty(
          url.substring("jdbc:hsqldb:file:".length), String(connector.getProject().getName())));
      }
    }
    if (url.indexOf("jdbc:hsqldb:file:") === 0) {
      // ifexists: the probe never creates a database; and no shutdown=true, which would close it under the engine.
      url = url.split(";")[0] + ";ifexists=true";
    }
    return url;
  }

  function withJdbc(connector, work) {
    var jdbc = null;
    try {
      try {
        java.lang.Class.forName(String(connector.getJdbcDriverClassName()));
      } catch (_driverLoaded) {}
      var user = "";
      var password = "";
      try { user = String(connector.getRealJdbcUserName() || ""); } catch (_noUser) {}
      try { password = String(connector.getRealJdbcUserPassword() || ""); } catch (_noPassword) {}
      jdbc = java.sql.DriverManager.getConnection(jdbcUrlOf(connector), user, password);
      return work(jdbc);
    } finally {
      if (jdbc) {
        try { jdbc.close(); } catch (_closed) {}
      }
    }
  }

  // Tables of the entities, with their columns (lower case) and row count, from the JDBC metadata of the connector's
  // database: the same on every engine. unreachable (a database not created yet, a driver not loaded) means fresh.
  C8O.crudBackend.inspectDatabase = function (ctx, connector, tableNames) {
    var out = { reachable: false, tables: {}, error: "" };
    try {
      withJdbc(connector, function (jdbc) {
        var meta = jdbc.getMetaData();
        var escape = String(meta.getSearchStringEscape() || "");
        for (var i = 0; i < tableNames.length; i++) {
          var name = String(tableNames[i]);
          var variants = [name, name.toUpperCase(), name.toLowerCase()];
          var columns = {};
          var found = "";
          for (var v = 0; v < variants.length && !found.length; v++) {
            var pattern = escape.length ? variants[v].replace(/[_%]/g, function (c) { return escape + c; }) : variants[v];
            var rs = meta.getColumns(null, null, pattern, "%");
            try {
              while (rs.next()) {
                var digits = rs.getInt("DECIMAL_DIGITS");
                var noDigits = rs.wasNull();
                var size = rs.getInt("COLUMN_SIZE");
                var columnDefault = rs.getString("COLUMN_DEF");
                columns[String(rs.getString("COLUMN_NAME")).toLowerCase()] = {
                  type: String(rs.getString("TYPE_NAME")) + "(" + size + (noDigits ? "" : "," + digits) + ")",
                  typeName: String(rs.getString("TYPE_NAME")),
                  size: size,
                  digits: noDigits ? null : digits,
                  nullable: rs.getInt("NULLABLE") !== java.sql.DatabaseMetaData.columnNoNulls,
                  defaultValue: columnDefault == null ? null : String(columnDefault)
                };
                found = String(rs.getString("TABLE_NAME"));
              }
            } finally {
              rs.close();
            }
          }
          if (!found.length) {
            continue;
          }
          var statement = jdbc.createStatement();
          try {
            var count = statement.executeQuery("SELECT COUNT(*) FROM " + found);
            out.tables[name.toLowerCase()] = { name: found, columns: columns, rows: count.next() ? count.getLong(1) : 0 };
          } finally {
            statement.close();
          }
        }
        out.reachable = true;
      });
    } catch (e) {
      out.error = String(e).substring(0, 300);
    }
    return out;
  };

  C8O.crudBackend.applyAlters = function (ctx, connector, alters) {
    var applied = [];
    if (!alters.length) {
      return applied;
    }
    try {
      withJdbc(connector, function (jdbc) {
        for (var i = 0; i < alters.length; i++) {
          var statement = jdbc.createStatement();
          try {
            statement.execute(alters[i].sql);
            applied.push({ sql: alters[i].sql, status: "ok" });
          } catch (e) {
            applied.push({ sql: alters[i].sql, status: "error", error: String(e).substring(0, 300) });
          } finally {
            statement.close();
          }
        }
      });
    } catch (e) {
      applied.push({ sql: "", status: "error", error: String(e).substring(0, 300) });
    }
    return applied;
  };

  C8O.crudBackend.listColumns = function (_ctx, entity) {
    var columns = [];
    for (var i = 0; i < entity.fields.length; i++) {
      columns.push(entity.fields[i].column);
    }
    return columns;
  };

  C8O.crudBackend.txName = function (_ctx, entity, verb) {
    var plural = entity.name;
    var singular = entity.singular;
    switch (verb) {
      case "init":
        return "init_schema";
      case "seed":
        return "seed_" + plural;
      case "list":
        return "list_" + plural;
      case "count":
        return "count_" + plural;
      case "read":
        return "read_" + singular;
      case "create":
        return "create_" + singular;
      case "update":
        return "update_" + singular;
      case "delete":
        return "delete_" + singular;
      default:
        return verb + "_" + plural;
    }
  };

  C8O.crudBackend.buildCrudSql = function (ctx, spec, entity, verb) {
    var columns = C8O.crudBackend.listColumns(ctx, entity);
    var pk = entity.primaryField.column;
    var nonPkFields = entity.fields.filter(function (field) { return !field.primary; });
    var crm = ctx.crmRelationContext(spec);
    if (verb === "list") {
      if (crm && entity.name === crm.contacts.name) {
        return [
          "SELECT c." + columns.join(", c."),
          ", co.name AS " + relationLabelAlias(ctx, { fromField: crm.relationField.column }),
          ", co.name AS company_name, co.city AS company_city, co.industry AS company_industry",
          "FROM " + entity.name + " c",
          "LEFT JOIN " + crm.companies.name + " co ON c." + crm.relationField.column + " = co." + crm.companies.primaryField.column,
          "ORDER BY c." + pk + " ASC"
        ].join("\n");
      }
      if (crm && entity.name === crm.companies.name) {
        return [
          "SELECT co." + columns.join(", co."),
          ", (SELECT COUNT(*) FROM " + crm.contacts.name + " ct WHERE ct." + crm.relationField.column + " = co." + crm.companies.primaryField.column + ") AS contact_count",
          "FROM " + entity.name + " co",
          "ORDER BY co." + pk + " ASC"
        ].join("\n");
      }
      return buildJoinedSelectSql(ctx, spec, entity, {
        baseAlias: "base",
        orderBy: "base." + pk + " ASC"
      });
    }
    if (verb === "count") {
      return "SELECT COUNT(*) AS total\nFROM " + entity.name;
    }
    if (verb === "read") {
      return buildJoinedSelectSql(ctx, spec, entity, {
        baseAlias: "base",
        whereSegments: ["WHERE base." + pk + " = {" + pk + "}"]
      });
    }
    if (verb === "create") {
      return "INSERT INTO " + entity.name + " (" + nonPkFields.map(function (field) { return field.column; }).join(", ") + ")\nVALUES (" + nonPkFields.map(function (field) { return "{" + field.column + "}"; }).join(", ") + ")";
    }
    if (verb === "update") {
      return "UPDATE " + entity.name + "\nSET " + nonPkFields.map(function (field) { return field.column + " = {" + field.column + "}"; }).join(",\n    ") + "\nWHERE " + pk + " = {" + pk + "}";
    }
    if (verb === "delete") {
      return "DELETE FROM " + entity.name + "\nWHERE " + pk + " = {" + pk + "}";
    }
    return "";
  };

  C8O.crudBackend.buildCrmCompanyContactsSql = function (ctx, spec) {
    var crm = ctx.crmRelationContext(spec);
    if (!crm) {
      return "";
    }
    var contactColumns = C8O.crudBackend.listColumns(ctx, crm.contacts);
    return [
      "SELECT c." + contactColumns.join(", c."),
      ", co.name AS " + relationLabelAlias(ctx, { fromField: crm.relationField.column }),
      ", co.name AS company_name, co.city AS company_city, co.industry AS company_industry",
      "FROM " + crm.contacts.name + " c",
      "LEFT JOIN " + crm.companies.name + " co ON c." + crm.relationField.column + " = co." + crm.companies.primaryField.column,
      "WHERE c." + crm.relationField.column + " = {company_id}",
      "ORDER BY c." + crm.contacts.primaryField.column + " ASC"
    ].join("\n");
  };

  C8O.crudBackend.ensureConnector = function (ctx, project, spec, result) {
    var connector = ctx.ensureChild(project, "connectors.SqlConnector", spec.database.connector, result);
    ctx.applyUpdates(connector, ctx.connectorProperties(spec), result);
    safeComment(connector, txComment(ctx, spec, { kind: "connector" }));
    try {
      project.setDefaultConnector(connector);
    } catch (_ignoreDefaultConnector) {}
    return connector;
  };

  C8O.crudBackend.findSqlConnectorInProject = function (ctx, project, preferredName) {
    if (!project) {
      return null;
    }
    var preferred = ctx.trimmed(preferredName);
    if (preferred.length) {
      var byName = C8O.dbo.resolve(String(project.getName()) + "." + preferred, { optional: true });
      if (byName) {
        return byName;
      }
    }
    try {
      var defaultConnector = project.getDefaultConnector ? project.getDefaultConnector() : null;
      if (defaultConnector && String(defaultConnector.getClass().getName()).indexOf("SqlConnector") !== -1) {
        return defaultConnector;
      }
    } catch (_ignoreDefaultSqlConnector) {}
    try {
      var connectors = project.getConnectorsList();
      for (var i = 0; i < connectors.size(); i++) {
        var connector = connectors.get(i);
        if (connector && String(connector.getClass().getName()).indexOf("SqlConnector") !== -1) {
          return connector;
        }
      }
    } catch (_ignoreConnectorsList) {}
    return null;
  };

  C8O.crudBackend.ensureSqlTransaction = function (ctx, connector, name, sqlQuery, autoCommit, result, options) {
    var tx = ctx.ensureChild(connector, "transactions.SqlTransaction", name, result);
    var currentOptions = options || {};
    safeComment(tx, currentOptions.comment || "");
    tx.setSqlQuery(String(sqlQuery || ""));
    tx.setAutoCommit(autoCommit);
    tx.initializeQueries(true);
    // initializeQueries adds the variables of the SQL but keeps the ones it no longer uses (a dropped field).
    var sqlNames = [];
    String(sqlQuery || "").replace(/\{\{?([A-Za-z_]\w*)\}?\}/g, function (_match, varName) { sqlNames.push(varName); return _match; });
    pruneVariables(ctx, tx, sqlNames, "variables.RequestableVariable", result);
    var variableEntries = normalizeVariableEntries(ctx.ensureArray(currentOptions.variableEntries));
    for (var i = 0; i < variableEntries.length; i++) {
      var variable = ctx.findChild(tx, variableEntries[i].name, "variables.RequestableVariable");
      if (!variable) {
        continue;
      }
      safeDescription(variable, variableEntries[i].description || "");
      safeComment(variable, variableEntries[i].comment || "");
    }
    result.updated.push(tx.getFullQName ? String(tx.getFullQName()) : name);
    return tx;
  };

  C8O.crudBackend.collectTransactionVariables = function (_ctx, tx) {
    var names = [];
    try {
      var vars = tx.getVariables();
      for (var i = 0; i < vars.size(); i++) {
        var variable = vars.get(i);
        names.push(String(variable.getName()));
      }
    } catch (_ignoreTxVariables) {}
    return names;
  };

  C8O.crudBackend.ensureRequestableVariables = function (ctx, container, variableEntries, result) {
    var normalizedEntries = normalizeVariableEntries(ctx.ensureArray(variableEntries));
    for (var i = 0; i < normalizedEntries.length; i++) {
      var name = String(normalizedEntries[i].name);
      var variable = ctx.findChild(container, name, "variables.RequestableVariable");
      if (!variable) {
        variable = ctx.createChild(container, "variables.RequestableVariable", name);
        result.created.push(variable.getFullQName ? String(variable.getFullQName()) : name);
      }
      safeDescription(variable, normalizedEntries[i].description || "");
      safeComment(variable, normalizedEntries[i].comment || "");
    }
    // These are all the variables of the container: a field dropped from the spec left its variable, which filtered
    // silently (preflight checks).
    pruneVariables(ctx, container, normalizedEntries.map(function (entry) { return String(entry.name); }), "variables.RequestableVariable", result);
  };

  C8O.crudBackend.ensureStepVariables = function (ctx, step, variableEntries, result) {
    var normalizedEntries = normalizeVariableEntries(ctx.ensureArray(variableEntries));
    for (var i = 0; i < normalizedEntries.length; i++) {
      var name = String(normalizedEntries[i].name);
      var variable = ctx.findChild(step, name, "variables.StepVariable");
      if (!variable) {
        variable = ctx.createChild(step, "variables.StepVariable", name);
        result.created.push(variable.getFullQName ? String(variable.getFullQName()) : name);
      }
      safeDescription(variable, normalizedEntries[i].description || "");
      safeComment(variable, normalizedEntries[i].comment || "");
    }
    // These are all the variables of the container: a field dropped from the spec left its variable, which filtered
    // silently (preflight checks).
    pruneVariables(ctx, step, normalizedEntries.map(function (entry) { return String(entry.name); }), "variables.StepVariable", result);
  };

  C8O.crudBackend.ensurePublicSequence = function (ctx, project, sequenceName, sourceTransaction, variableEntries, result, options) {
    var sequence = ctx.ensureChild(project, "sequences.GenericSequence", sequenceName, result);
    var currentOptions = options || {};
    applySequenceSecurity(ctx, sequence, currentOptions.accessibility || "Hidden", currentOptions.authenticatedContextRequired == null ? true : currentOptions.authenticatedContextRequired, result);
    safeComment(sequence, currentOptions.comment || "");
    var normalizedEntries = normalizeVariableEntries(ctx.ensureArray(variableEntries));
    C8O.crudBackend.ensureRequestableVariables(ctx, sequence, normalizedEntries, result);
    var txStep = ctx.ensureChild(sequence, "steps.TransactionStep", "Call" + ctx.ucfirst(sequenceName), result);
    txStep.setSourceTransaction(sourceTransaction);
    txStep.setOutput(false);
    C8O.crudBackend.ensureStepVariables(ctx, txStep, normalizedEntries, result);
    configurePublicSequencePayload(ctx, sequence, txStep, currentOptions, result);
    return sequence;
  };

  C8O.crudBackend.ensureAuthLoginSequence = function (ctx, project, result) {
    var sequence = ctx.ensureChild(project, "sequences.GenericSequence", "auth_login", result);
    applySequenceSecurity(ctx, sequence, "Hidden", false, result);
    safeComment(sequence, authSequenceComment("login"));
    C8O.crudBackend.ensureRequestableVariables(ctx, sequence, [
      {
        name: "username",
        description: authVariableDescription("username"),
        comment: authVariableDescription("username")
      },
      {
        name: "password",
        description: authVariableDescription("password"),
        comment: authVariableDescription("password")
      }
    ], result);
    var setStep = ctx.ensureChild(sequence, "steps.SetAuthenticatedUserStep", "SetAuthenticatedUser", result);
    ctx.applyUpdates(setStep, {
      output: false,
      userid: {
        mode: "JS",
        value: "username"
      }
    }, result);
    safeComment(setStep, "Store the provided username as the current authenticated user.");
    var currentUserStep = ctx.ensureChild(sequence, "steps.GetAuthenticatedUserStep", "AuthenticatedUser", result);
    ctx.applyUpdates(currentUserStep, {
      output: true
    }, result);
    safeComment(currentUserStep, "Expose the current authenticated user after the login skeleton runs.");
    return sequence;
  };

  C8O.crudBackend.ensureAuthLogoutSequence = function (ctx, project, result) {
    var sequence = ctx.ensureChild(project, "sequences.GenericSequence", "auth_logout", result);
    applySequenceSecurity(ctx, sequence, "Hidden", false, result);
    safeComment(sequence, authSequenceComment("logout"));
    var removeStep = ctx.ensureChild(sequence, "steps.SimpleStep", "RemoveAuthenticatedUser", result);
    ctx.applyUpdates(removeStep, {
      output: false,
      expression: "context.removeAuthenticatedUser();"
    }, result);
    safeComment(removeStep, "Clear the current authenticated user for this HTTP session.");
    var currentUserStep = ctx.ensureChild(sequence, "steps.GetAuthenticatedUserStep", "AuthenticatedUser", result);
    ctx.applyUpdates(currentUserStep, {
      output: true
    }, result);
    safeComment(currentUserStep, "Expose the current authenticated user after the logout skeleton runs.");
    return sequence;
  };

  C8O.crudBackend.upsertCrud = function (ctx, options) {
    var result = {
      status: "success",
      project: "",
      driverFamily: "",
      connectorQname: "",
      primaryTargets: {
        sql: "",
        flow: [],
        ui: []
      },
      created: [],
      deleted: [],
      updated: [],
      runtimeEvidence: {},
      warnings: [],
      sequence: ctx.toBoolean(options.sequence, true),
      uiEnabled: ctx.toBoolean(options.ui, false)
    };

    var spec = ctx.normalizeSpec(options.spec);
    result.project = spec.project;
    result.driverFamily = spec.database.driver.id;
    if (spec.database.source === "connector") {
      // Not a warning: any warning makes the status partial.
      result.runtimeEvidence.database = {
        mode: spec.database.mode,
        source: "connector",
        note: "spec.database.mode was not given: the engine is the one of the existing connector " + spec.database.connector +
          ", which keeps its connection settings."
      };
    }
    var project = ctx.ensureProject(spec, result);
    var createdBeforeConnector = result.created.length;
    var connector = C8O.crudBackend.ensureConnector(ctx, project, spec, result);
    var connectorExisted = result.created.length === createdBeforeConnector;
    result.connectorQname = connector.getFullQName ? String(connector.getFullQName()) : (spec.project + "." + spec.database.connector);
    result.primaryTargets.sql = result.connectorQname;

    var inspection = (ctx.inspectDatabase || C8O.crudBackend.inspectDatabase)(ctx, connector, spec.entities.map(function (entity) { return entity.name; }));
    var keptColumns = C8O.crudBackend.keepExistingColumns(ctx, options.spec, spec, inspection);
    if (keptColumns.spec) {
      var widened = ctx.normalizeSpec(keptColumns.spec);
      spec.entities = widened.entities;
      spec.relations = widened.relations;
      spec.seed.data = widened.seed.data;
    }
    var existingDatabase = C8O.crudBackend.planExistingDatabase(ctx, spec, inspection, { connectorExisted: connectorExisted });
    if (existingDatabase.keep) {
      // The rows are the user's: init_schema only creates what is missing, and nothing reseeds them.
      spec.seed.enabled = false;
    }
    pruneObsoleteTransactions(ctx, connector, result);
    C8O.crudBackend.ensureSqlTransaction(ctx, connector, "init_schema", C8O.crudBackend.buildInitSql(ctx, spec), ctx.SqlTransaction.AUTOCOMMIT_EACH, result, {
      kind: "init",
      comment: txComment(ctx, spec, { kind: "init" }),
      variableEntries: []
    });

    if (result.sequence) {
      var authLoginSequence = C8O.crudBackend.ensureAuthLoginSequence(ctx, project, result);
      var authLogoutSequence = C8O.crudBackend.ensureAuthLogoutSequence(ctx, project, result);
      result.primaryTargets.flow.push(authLoginSequence.getFullQName ? String(authLoginSequence.getFullQName()) : authSequenceQName(spec.project, "auth_login"));
      result.primaryTargets.flow.push(authLogoutSequence.getFullQName ? String(authLogoutSequence.getFullQName()) : authSequenceQName(spec.project, "auth_logout"));
      result.runtimeEvidence.auth = {
        loginRequestable: authLoginSequence.getFullQName ? String(authLoginSequence.getFullQName()) : authSequenceQName(spec.project, "auth_login"),
        logoutRequestable: authLogoutSequence.getFullQName ? String(authLogoutSequence.getFullQName()) : authSequenceQName(spec.project, "auth_logout")
      };
    }

    var crm = ctx.crmRelationContext(spec);
    var defaultTransaction = null;
    for (var i = 0; i < spec.entities.length; i++) {
      var entity = spec.entities[i];
      var listVarsEntries = [];
      var countVarsEntries = [];
      var readVarsEntries = [{ name: entity.primaryField.column, description: fieldVariableDescription(ctx, spec, entity, entity.primaryField.column), comment: fieldVariableDescription(ctx, spec, entity, entity.primaryField.column) }];
      var createVarsEntries = [];
      var updateVarsEntries = [];
      var deleteVarsEntries = [{ name: entity.primaryField.column, description: fieldVariableDescription(ctx, spec, entity, entity.primaryField.column), comment: fieldVariableDescription(ctx, spec, entity, entity.primaryField.column) }];
      for (var fieldIndex = 0; fieldIndex < entity.fields.length; fieldIndex++) {
        var entityField = entity.fields[fieldIndex];
        if (!entityField || entityField.primary === true) {
          continue;
        }
        var entityFieldDoc = fieldVariableDescription(ctx, spec, entity, entityField.column);
        createVarsEntries.push({ name: entityField.column, description: entityFieldDoc, comment: entityFieldDoc });
        updateVarsEntries.push({ name: entityField.column, description: entityFieldDoc, comment: entityFieldDoc });
      }
      updateVarsEntries.push({ name: entity.primaryField.column, description: fieldVariableDescription(ctx, spec, entity, entity.primaryField.column), comment: fieldVariableDescription(ctx, spec, entity, entity.primaryField.column) });

      var listTx = C8O.crudBackend.ensureSqlTransaction(ctx, connector, C8O.crudBackend.txName(ctx, entity, "list"), C8O.crudBackend.buildCrudSql(ctx, spec, entity, "list"), ctx.SqlTransaction.AUTOCOMMIT_EACH, result, {
        kind: "crud",
        verb: "list",
        entity: entity,
        comment: txComment(ctx, spec, { kind: "crud", verb: "list", entity: entity }),
        variableEntries: listVarsEntries
      });
      var countTx = C8O.crudBackend.ensureSqlTransaction(ctx, connector, C8O.crudBackend.txName(ctx, entity, "count"), C8O.crudBackend.buildCrudSql(ctx, spec, entity, "count"), ctx.SqlTransaction.AUTOCOMMIT_EACH, result, {
        kind: "crud",
        verb: "count",
        entity: entity,
        comment: txComment(ctx, spec, { kind: "crud", verb: "count", entity: entity }),
        variableEntries: countVarsEntries
      });
      var readTx = C8O.crudBackend.ensureSqlTransaction(ctx, connector, C8O.crudBackend.txName(ctx, entity, "read"), C8O.crudBackend.buildCrudSql(ctx, spec, entity, "read"), ctx.SqlTransaction.AUTOCOMMIT_EACH, result, {
        kind: "crud",
        verb: "read",
        entity: entity,
        comment: txComment(ctx, spec, { kind: "crud", verb: "read", entity: entity }),
        variableEntries: readVarsEntries
      });
      var createTx = C8O.crudBackend.ensureSqlTransaction(ctx, connector, C8O.crudBackend.txName(ctx, entity, "create"), C8O.crudBackend.buildCrudSql(ctx, spec, entity, "create"), ctx.SqlTransaction.AUTOCOMMIT_EACH, result, {
        kind: "crud",
        verb: "create",
        entity: entity,
        comment: txComment(ctx, spec, { kind: "crud", verb: "create", entity: entity }),
        variableEntries: createVarsEntries
      });
      var updateTx = C8O.crudBackend.ensureSqlTransaction(ctx, connector, C8O.crudBackend.txName(ctx, entity, "update"), C8O.crudBackend.buildCrudSql(ctx, spec, entity, "update"), ctx.SqlTransaction.AUTOCOMMIT_EACH, result, {
        kind: "crud",
        verb: "update",
        entity: entity,
        comment: txComment(ctx, spec, { kind: "crud", verb: "update", entity: entity }),
        variableEntries: updateVarsEntries
      });
      var deleteTx = C8O.crudBackend.ensureSqlTransaction(ctx, connector, C8O.crudBackend.txName(ctx, entity, "delete"), C8O.crudBackend.buildCrudSql(ctx, spec, entity, "delete"), ctx.SqlTransaction.AUTOCOMMIT_EACH, result, {
        kind: "crud",
        verb: "delete",
        entity: entity,
        comment: txComment(ctx, spec, { kind: "crud", verb: "delete", entity: entity }),
        variableEntries: deleteVarsEntries
      });
      if (!defaultTransaction) {
        defaultTransaction = listTx;
      }

      if (result.sequence) {
        var listVars = listVarsEntries;
        var countVars = countVarsEntries;
        var readVars = readVarsEntries;
        var createVars = createVarsEntries;
        var updateVars = updateVarsEntries;
        var deleteVars = deleteVarsEntries;
        var publicNames = [
          spec.facade.prefix + "_" + C8O.crudBackend.txName(ctx, entity, "list"),
          spec.facade.prefix + "_" + C8O.crudBackend.txName(ctx, entity, "count"),
          spec.facade.prefix + "_" + C8O.crudBackend.txName(ctx, entity, "read"),
          spec.facade.prefix + "_" + C8O.crudBackend.txName(ctx, entity, "create"),
          spec.facade.prefix + "_" + C8O.crudBackend.txName(ctx, entity, "update"),
          spec.facade.prefix + "_" + C8O.crudBackend.txName(ctx, entity, "delete")
        ];
        var publicSources = [
          ctx.connectorRequestableQName(spec.project, spec.database.connector, C8O.crudBackend.txName(ctx, entity, "list")),
          ctx.connectorRequestableQName(spec.project, spec.database.connector, C8O.crudBackend.txName(ctx, entity, "count")),
          ctx.connectorRequestableQName(spec.project, spec.database.connector, C8O.crudBackend.txName(ctx, entity, "read")),
          ctx.connectorRequestableQName(spec.project, spec.database.connector, C8O.crudBackend.txName(ctx, entity, "create")),
          ctx.connectorRequestableQName(spec.project, spec.database.connector, C8O.crudBackend.txName(ctx, entity, "update")),
          ctx.connectorRequestableQName(spec.project, spec.database.connector, C8O.crudBackend.txName(ctx, entity, "delete"))
        ];
        var publicVars = [listVars, countVars, readVars, createVars, updateVars, deleteVars];
        var publicVerbs = ["list", "count", "read", "create", "update", "delete"];
        for (var p = 0; p < publicNames.length; p++) {
          var seq = C8O.crudBackend.ensurePublicSequence(ctx, project, publicNames[p], publicSources[p], publicVars[p], result, {
            kind: "crud",
            verb: publicVerbs[p],
            entity: entity,
            spec: spec,
            comment: sequenceComment(ctx, { kind: "crud", verb: publicVerbs[p], entity: entity })
          });
          result.primaryTargets.flow.push(seq.getFullQName ? String(seq.getFullQName()) : (spec.project + "." + publicNames[p]));
        }
      }
    }

    if (crm) {
      var companyContactsTx = C8O.crudBackend.ensureSqlTransaction(ctx, connector, "list_company_contacts", C8O.crudBackend.buildCrmCompanyContactsSql(ctx, spec), ctx.SqlTransaction.AUTOCOMMIT_EACH, result);
      if (result.sequence) {
        var companyContactsVars = C8O.crudBackend.collectTransactionVariables(ctx, companyContactsTx);
        var companyContactsSeq = C8O.crudBackend.ensurePublicSequence(
          ctx,
          project,
          spec.facade.prefix + "_list_company_contacts",
          ctx.connectorRequestableQName(spec.project, spec.database.connector, "list_company_contacts"),
          companyContactsVars,
          result
        );
        result.primaryTargets.flow.push(companyContactsSeq.getFullQName ? String(companyContactsSeq.getFullQName()) : (spec.project + "." + spec.facade.prefix + "_list_company_contacts"));
      }
    }

    var relations = ctx.ensureArray(spec && spec.relations);
    for (var relationIndex = 0; relationIndex < relations.length; relationIndex++) {
      var relation = relations[relationIndex];
      if (!relation || relation.type !== "many-to-one") {
        continue;
      }
      if (crm && relation.fromEntity === crm.contacts.name && relation.toEntity === crm.companies.name && relation.fromField === crm.relationField.column) {
        continue;
      }
      var relatedEntity = ctx.findEntityByName(spec.entities, relation.fromEntity);
      if (!relatedEntity) {
        continue;
      }
      var relationTxName = relationListName(ctx, spec, relation);
      var relationSql = buildJoinedSelectSql(ctx, spec, relatedEntity, {
        baseAlias: "base",
        whereSegments: ["WHERE base." + relation.fromField + " = {" + relation.fromField + "}"],
        orderBy: "base." + relatedEntity.primaryField.column + " ASC"
      });
      var relationFieldDoc = fieldVariableDescription(ctx, spec, relatedEntity, relation.fromField);
      var relationTx = C8O.crudBackend.ensureSqlTransaction(ctx, connector, relationTxName, relationSql, ctx.SqlTransaction.AUTOCOMMIT_EACH, result, {
        kind: "relation",
        relation: relation,
        entity: relatedEntity,
        comment: txComment(ctx, spec, { kind: "relation", relation: relation, entity: relatedEntity }),
        variableEntries: [{ name: relation.fromField, description: relationFieldDoc, comment: relationFieldDoc }]
      });
      if (result.sequence) {
        var relationVars = [{ name: relation.fromField, description: relationFieldDoc, comment: relationFieldDoc }];
        var relationSeq = C8O.crudBackend.ensurePublicSequence(
          ctx,
          project,
          spec.facade.prefix + "_" + relationTxName,
          ctx.connectorRequestableQName(spec.project, spec.database.connector, relationTxName),
          relationVars,
          result,
          {
            kind: "relation",
            relation: relation,
            entity: relatedEntity,
            spec: spec,
            comment: sequenceComment(ctx, { kind: "relation", relation: relation, entity: relatedEntity })
          }
        );
        result.primaryTargets.flow.push(relationSeq.getFullQName ? String(relationSeq.getFullQName()) : (spec.project + "." + spec.facade.prefix + "_" + relationTxName));
      }
    }

    defaultTransaction = defaultTransaction || pickDefaultTransaction(ctx, connector, spec);
    ensureDefaultTransaction(connector, defaultTransaction, result);
    prunePlaceholderVoidConnector(ctx, project, spec.database.connector, result);

    var saveResult = ctx.saveProject(project, []);
    result.runtimeEvidence.projectSave = ctx.summarizeSaveResult(saveResult, result);
    result.runtimeEvidence.studioRefresh = ctx.refreshStudioProjectTree(project, result, "studioRefresh");
    var learnedSchemas = [];
    result.runtimeEvidence.init_schema = summarizeSchemaLearning(
      ctx,
      spec.project + "." + spec.database.connector + ".init_schema",
      // The demo seed of a new, empty or reset database: no user rows there (the tables that hold some are kept).
      ctx.requestablePayload(spec.project + "." + spec.database.connector + ".init_schema", {}, result, { recordSchema: true, allowDataReset: !existingDatabase.keep }),
      result,
      learnedSchemas
    );
    if (!existingDatabase.inspected) {
      for (var u = 0; u < existingDatabase.notes.length; u++) {
        ctx.addWarning(result, existingDatabase.notes[u]);
      }
    }
    if (existingDatabase.inspected) {
      var applied = existingDatabase.alters.length ? (ctx.applyAlters || C8O.crudBackend.applyAlters)(ctx, connector, existingDatabase.alters) : [];
      result.runtimeEvidence.existingDatabase = {
        rowsKept: existingDatabase.keep,
        rows: existingDatabase.rows,
        addedColumns: applied.filter(function (a) { return a.status === "ok"; }).map(function (a) { return a.sql; }),
        note: existingDatabase.keep ? "The tables hold rows: upsert-crud kept them, added the missing columns and seeded nothing. " +
          "seed.reset:true resets them to the demo rows." : ""
      };
      if (Object.keys(keptColumns.kept).length) {
        result.runtimeEvidence.existingDatabase.keptColumns = keptColumns.kept;
        result.runtimeEvidence.existingDatabase.keptColumnsNote = "Columns of the existing tables the spec did not list stay " +
          "fields of their entity (transactions, sequences and pages keep them): list only the fields you add or change.";
      }
      for (var a = 0; a < applied.length; a++) {
        if (applied[a].status !== "ok") {
          ctx.addWarning(result, "Adding a column failed: " + applied[a].sql + " -> " + applied[a].error);
        }
      }
      for (var n = 0; n < existingDatabase.notes.length; n++) {
        ctx.addWarning(result, existingDatabase.notes[n]);
      }
    }
    var cachedRows = {};
    for (var e = 0; e < spec.entities.length; e++) {
      var currentEntity = spec.entities[e];
      var entityLearn = learnEntitySchemas(ctx, spec, currentEntity, result, cachedRows, learnedSchemas);
      result.runtimeEvidence[C8O.crudBackend.txName(ctx, currentEntity, "list")] = entityLearn.list;
      result.runtimeEvidence[C8O.crudBackend.txName(ctx, currentEntity, "count")] = entityLearn.count;
    }
    learnRelationSchemas(ctx, spec, cachedRows, result, learnedSchemas);
    if (spec.entities.length && !existingDatabase.keep) {
      ctx.requestablePayload(spec.project + "." + spec.database.connector + ".init_schema", {}, result, { allowDataReset: true });
    }
    result.runtimeEvidence.schemaLearning = learnedSchemas;
    if (crm) {
      result.runtimeEvidence.list_company_contacts = {
        requestable: spec.project + "." + spec.database.connector + ".list_company_contacts",
        status: "pending",
        ok: true,
        message: "Relation business sequence created. Runtime relation proof happens in crud-proof."
      };
    }
    if (relations.length) {
      result.runtimeEvidence.relations = relations.map(function (relation) {
        return {
          name: relation.name,
          type: relation.type,
          requestable: spec.project + "." + spec.facade.prefix + "_" + relationListName(ctx, spec, relation)
        };
      });
    }

    if (result.uiEnabled) {
      var uiResult = ctx.upsertNgxCrudKit({
        project: spec.project,
        entities: spec.entities,
        variant: spec.ui.variant,
        stage: "bootstrap",
        facadePrefix: spec.facade.prefix,
        entryPage: spec.ui.entryPage,
        language: spec.ui.language,
        runtimeEvidence: result.runtimeEvidence
      });
      result.runtimeEvidence.ui = {
        status: uiResult.status,
        pageTargets: uiResult.pageTargets || [],
        shellVisible: uiResult.runtimeEvidence ? uiResult.runtimeEvidence.shellVisible === true : false,
        starterDominant: uiResult.runtimeEvidence ? uiResult.runtimeEvidence.starterDominant === true : null
      };
      result.primaryTargets.ui = uiResult.pageTargets || [];
      if (uiResult.status !== "success") {
        result.status = "partial";
      }
      if (uiResult.runtimeEvidence && uiResult.runtimeEvidence.projectSave) {
        result.runtimeEvidence.uiProjectSave = uiResult.runtimeEvidence.projectSave;
      }
      if (uiResult.warnings && uiResult.warnings.length) {
        for (var w = 0; w < uiResult.warnings.length; w++) {
          ctx.addWarning(result, uiResult.warnings[w]);
        }
      }
    }

    result.status = result.warnings.length ? "partial" : "success";
    return finalizeUpsertCrudResult(ctx, result);
  };

  C8O.crudBackend.relationsForEntity = relationsForEntity;
  C8O.crudBackend.relationListName = relationListName;
  C8O.crudBackend.learnEntitySchemas = learnEntitySchemas;
})();
