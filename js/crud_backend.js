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
      return "Facade exposing the relation list for " + entityLabel(ctx, current.entity) + " by " + current.relation.fromField + ".";
    }
    if (current.kind !== "crud" || !current.entity) {
      return "";
    }
    var label = entityLabel(ctx, current.entity);
    switch (current.verb) {
      case "list":
        return "Facade listing " + label + ".";
      case "count":
        return "Facade counting " + label + ".";
      case "read":
        return "Facade reading one " + current.entity.singular + " by primary key.";
      case "create":
        return "Facade creating one " + current.entity.singular + ".";
      case "update":
        return "Facade updating one " + current.entity.singular + ".";
      case "delete":
        return "Facade deleting one " + current.entity.singular + ".";
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

  function lastRow(rows) {
    return Array.isArray(rows) && rows.length ? rows[rows.length - 1] : null;
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
      if (result && result.updated) {
        result.updated.push(child.getFullQName ? String(child.getFullQName()) : String(child.getName()));
      }
      return true;
    } catch (_ignoreRemoveChild) {
      return false;
    }
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
      learnRequestableSchema(ctx, createQName, createVars, result, bucket);
      var afterCreateRows = ctx.collectSqlOutputRows(ctx.requestablePayload(listQName, {}, result, {}) || {});
      cachedRows[entity.name] = afterCreateRows;
      var createdRow = lastRow(afterCreateRows);
      var createdId = rowFieldValue(ctx, createdRow, entity.primaryField.column);
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
    return "list_" + childPlural + "_by_" + parentSingular;
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
    return raw;
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
    var copyStep = ctx.ensureChild(sequence, "steps.XMLCopyStep", "CopyPayload", result);
    copyStep.setOutput(true);
    var sourcePriority = ctx.priorityOf(txStep);
    ctx.applyUpdates(copyStep, {
      sourceDefinition: [sourcePriority, "./document/*"]
    }, result);
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
    var project = ctx.ensureProject(spec, result);
    var connector = C8O.crudBackend.ensureConnector(ctx, project, spec, result);
    result.connectorQname = connector.getFullQName ? String(connector.getFullQName()) : (spec.project + "." + spec.database.connector);
    result.primaryTargets.sql = result.connectorQname;

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
      ctx.requestablePayload(spec.project + "." + spec.database.connector + ".init_schema", {}, result, { recordSchema: true }),
      result,
      learnedSchemas
    );
    var cachedRows = {};
    for (var e = 0; e < spec.entities.length; e++) {
      var currentEntity = spec.entities[e];
      var entityLearn = learnEntitySchemas(ctx, spec, currentEntity, result, cachedRows, learnedSchemas);
      result.runtimeEvidence[C8O.crudBackend.txName(ctx, currentEntity, "list")] = entityLearn.list;
      result.runtimeEvidence[C8O.crudBackend.txName(ctx, currentEntity, "count")] = entityLearn.count;
    }
    learnRelationSchemas(ctx, spec, cachedRows, result, learnedSchemas);
    if (spec.entities.length) {
      ctx.requestablePayload(spec.project + "." + spec.database.connector + ".init_schema", {}, result, {});
    }
    result.runtimeEvidence.schemaLearning = learnedSchemas;
    if (crm) {
      result.runtimeEvidence.list_company_contacts = {
        requestable: spec.project + "." + spec.database.connector + ".list_company_contacts",
        status: "pending",
        ok: true,
        message: "Relation facade created. Runtime relation proof happens in crud-proof."
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
    return result;
  };

  C8O.crudBackend.relationsForEntity = relationsForEntity;
  C8O.crudBackend.relationListName = relationListName;
})();
