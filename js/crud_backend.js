if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.crudBackend = C8O.crudBackend || {};

(function () {
  C8O.crudBackend.mapSqlType = function (ctx, field, driver) {
    var raw = ctx.trimmed(field.type || "").toUpperCase();
    if (!raw.length) {
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
      return "SELECT " + columns.join(", ") + "\nFROM " + entity.name + "\nORDER BY " + pk + " ASC";
    }
    if (verb === "count") {
      return "SELECT COUNT(*) AS total\nFROM " + entity.name;
    }
    if (verb === "read") {
      return "SELECT " + columns.join(", ") + "\nFROM " + entity.name + "\nWHERE " + pk + " = {" + pk + "}";
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

  C8O.crudBackend.ensureSqlTransaction = function (ctx, connector, name, sqlQuery, autoCommit, result) {
    var tx = ctx.ensureChild(connector, "transactions.SqlTransaction", name, result);
    try {
      tx.setComment("Deterministic CRUD transaction " + name);
    } catch (_ignoreTxComment) {}
    tx.setSqlQuery(String(sqlQuery || ""));
    tx.setAutoCommit(autoCommit);
    tx.initializeQueries(true);
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

  C8O.crudBackend.ensureRequestableVariables = function (ctx, container, variableNames, result) {
    for (var i = 0; i < variableNames.length; i++) {
      var name = String(variableNames[i]);
      var variable = ctx.findChild(container, name, "variables.RequestableVariable");
      if (!variable) {
        variable = ctx.createChild(container, "variables.RequestableVariable", name);
        result.created.push(variable.getFullQName ? String(variable.getFullQName()) : name);
      }
      try {
        variable.setDescription("Deterministic CRUD variable " + name);
      } catch (_ignoreRequestableVariableDescription) {}
    }
  };

  C8O.crudBackend.ensureStepVariables = function (ctx, step, variableNames, result) {
    for (var i = 0; i < variableNames.length; i++) {
      var name = String(variableNames[i]);
      var variable = ctx.findChild(step, name, "variables.StepVariable");
      if (!variable) {
        variable = ctx.createChild(step, "variables.StepVariable", name);
        result.created.push(variable.getFullQName ? String(variable.getFullQName()) : name);
      }
      try {
        variable.setDescription("Forward request variable " + name);
      } catch (_ignoreStepVariableDescription) {}
    }
  };

  C8O.crudBackend.ensurePublicSequence = function (ctx, project, sequenceName, sourceTransaction, variableNames, result) {
    var sequence = ctx.ensureChild(project, "sequences.GenericSequence", sequenceName, result);
    try {
      sequence.setComment("Deterministic CRUD facade " + sequenceName);
    } catch (_ignoreSequenceComment) {}
    C8O.crudBackend.ensureRequestableVariables(ctx, sequence, variableNames, result);
    var txStep = ctx.ensureChild(sequence, "steps.TransactionStep", "Call" + ctx.ucfirst(sequenceName), result);
    txStep.setSourceTransaction(sourceTransaction);
    txStep.setOutput(true);
    C8O.crudBackend.ensureStepVariables(ctx, txStep, variableNames, result);
    var copyStep = ctx.ensureChild(sequence, "steps.XMLCopyStep", "CopyPayload", result);
    var sourcePriority = ctx.priorityOf(txStep);
    ctx.applyUpdates(copyStep, {
      sourceDefinition: [sourcePriority, "./document/*"]
    }, result);
    return sequence;
  };
})();
