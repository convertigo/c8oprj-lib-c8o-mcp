if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.crudBackend = C8O.crudBackend || {};

(function () {
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

    C8O.crudBackend.ensureSqlTransaction(ctx, connector, "BeginTransaction", "BEGIN;", ctx.SqlTransaction.AUTOCOMMIT_OFF, result);
    C8O.crudBackend.ensureSqlTransaction(ctx, connector, "CommitTransaction", "COMMIT;", ctx.SqlTransaction.AUTOCOMMIT_OFF, result);
    C8O.crudBackend.ensureSqlTransaction(ctx, connector, "RollbackTransaction", "ROLLBACK;", ctx.SqlTransaction.AUTOCOMMIT_OFF, result);
    C8O.crudBackend.ensureSqlTransaction(ctx, connector, "init_schema", C8O.crudBackend.buildInitSql(ctx, spec), ctx.SqlTransaction.AUTOCOMMIT_OFF, result);

    var crm = ctx.crmRelationContext(spec);
    for (var i = 0; i < spec.entities.length; i++) {
      var entity = spec.entities[i];
      var listTx = C8O.crudBackend.ensureSqlTransaction(ctx, connector, C8O.crudBackend.txName(ctx, entity, "list"), C8O.crudBackend.buildCrudSql(ctx, spec, entity, "list"), ctx.SqlTransaction.AUTOCOMMIT_EACH, result);
      var countTx = C8O.crudBackend.ensureSqlTransaction(ctx, connector, C8O.crudBackend.txName(ctx, entity, "count"), C8O.crudBackend.buildCrudSql(ctx, spec, entity, "count"), ctx.SqlTransaction.AUTOCOMMIT_EACH, result);
      var readTx = C8O.crudBackend.ensureSqlTransaction(ctx, connector, C8O.crudBackend.txName(ctx, entity, "read"), C8O.crudBackend.buildCrudSql(ctx, spec, entity, "read"), ctx.SqlTransaction.AUTOCOMMIT_EACH, result);
      var createTx = C8O.crudBackend.ensureSqlTransaction(ctx, connector, C8O.crudBackend.txName(ctx, entity, "create"), C8O.crudBackend.buildCrudSql(ctx, spec, entity, "create"), ctx.SqlTransaction.AUTOCOMMIT_EACH, result);
      var updateTx = C8O.crudBackend.ensureSqlTransaction(ctx, connector, C8O.crudBackend.txName(ctx, entity, "update"), C8O.crudBackend.buildCrudSql(ctx, spec, entity, "update"), ctx.SqlTransaction.AUTOCOMMIT_EACH, result);
      var deleteTx = C8O.crudBackend.ensureSqlTransaction(ctx, connector, C8O.crudBackend.txName(ctx, entity, "delete"), C8O.crudBackend.buildCrudSql(ctx, spec, entity, "delete"), ctx.SqlTransaction.AUTOCOMMIT_EACH, result);

      if (result.sequence) {
        var listVars = C8O.crudBackend.collectTransactionVariables(ctx, listTx);
        var countVars = C8O.crudBackend.collectTransactionVariables(ctx, countTx);
        var readVars = C8O.crudBackend.collectTransactionVariables(ctx, readTx);
        var createVars = C8O.crudBackend.collectTransactionVariables(ctx, createTx);
        var updateVars = C8O.crudBackend.collectTransactionVariables(ctx, updateTx);
        var deleteVars = C8O.crudBackend.collectTransactionVariables(ctx, deleteTx);
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
        for (var p = 0; p < publicNames.length; p++) {
          var seq = C8O.crudBackend.ensurePublicSequence(ctx, project, publicNames[p], publicSources[p], publicVars[p], result);
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
      var relationTx = C8O.crudBackend.ensureSqlTransaction(ctx, connector, relationTxName, relationSql, ctx.SqlTransaction.AUTOCOMMIT_EACH, result);
      if (result.sequence) {
        var relationVars = C8O.crudBackend.collectTransactionVariables(ctx, relationTx);
        var relationSeq = C8O.crudBackend.ensurePublicSequence(
          ctx,
          project,
          spec.facade.prefix + "_" + relationTxName,
          ctx.connectorRequestableQName(spec.project, spec.database.connector, relationTxName),
          relationVars,
          result
        );
        result.primaryTargets.flow.push(relationSeq.getFullQName ? String(relationSeq.getFullQName()) : (spec.project + "." + spec.facade.prefix + "_" + relationTxName));
      }
    }

    var saveResult = ctx.saveProject(project, []);
    result.runtimeEvidence.projectSave = ctx.summarizeSaveResult(saveResult, result);
    result.runtimeEvidence.studioRefresh = ctx.refreshStudioProjectTree(project, result, "studioRefresh");
    result.runtimeEvidence.init_schema = ctx.proofRequestable(spec.project + "." + spec.database.connector + ".init_schema", {}, result);
    for (var e = 0; e < spec.entities.length; e++) {
      var currentEntity = spec.entities[e];
      result.runtimeEvidence[C8O.crudBackend.txName(ctx, currentEntity, "list")] = ctx.proofRequestable(spec.project + "." + spec.database.connector + "." + C8O.crudBackend.txName(ctx, currentEntity, "list"), {}, result);
      result.runtimeEvidence[C8O.crudBackend.txName(ctx, currentEntity, "count")] = ctx.proofRequestable(spec.project + "." + spec.database.connector + "." + C8O.crudBackend.txName(ctx, currentEntity, "count"), {}, result);
    }
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
