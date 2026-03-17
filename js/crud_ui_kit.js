if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.crudUiKit = C8O.crudUiKit || {};

(function () {
  if (C8O.crudUiKit._initialized === true) {
    return;
  }
  C8O.crudUiKit._initialized = true;

  function fieldLabelFromKey(ctx, rawKey) {
    var text = ctx.trimmed(rawKey);
    if (!text.length) {
      return "Field";
    }
    return text
      .replace(/_/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .replace(/^\w/, function (char) { return char.toUpperCase(); });
  }

  function needsUiFieldHydration(ctx, entity) {
    var fields = ctx.ensureArray(entity && entity.fields);
    if (!fields.length) {
      return true;
    }
    for (var i = 0; i < fields.length; i++) {
      if (!fields[i].primary) {
        return false;
      }
    }
    return true;
  }

  C8O.crudUiKit.normalizeUiEntities = function (ctx, rawEntities) {
    var entries = ctx.ensureArray(rawEntities);
    var normalized = [];
    for (var i = 0; i < entries.length; i++) {
      var raw = entries[i] || {};
      var naming = ctx.normalizeEntityNames(raw, "entity_" + (i + 1));
      var entityName = naming.name;
      var fields = [];
      var rawFields = ctx.ensureArray(raw.fields);
      for (var fieldIndex = 0; fieldIndex < rawFields.length; fieldIndex++) {
        var rawField = rawFields[fieldIndex] || {};
        var rawFieldName = ctx.trimmed(rawField.name || rawField.column || "");
        if (!rawFieldName.length) {
          continue;
        }
        fields.push({
          name: rawFieldName,
          column: ctx.normalizedIdentifier(rawField.column || rawFieldName),
          label: ctx.trimmed(rawField.label || rawFieldName),
          type: ctx.trimmed(rawField.type || "VARCHAR(255)"),
          primary: ctx.toBoolean(rawField.primary, false),
          unique: ctx.toBoolean(rawField.unique, false),
          required: rawField.required == null ? false : ctx.toBoolean(rawField.required, false),
          references: rawField.references && typeof rawField.references === "object" ? ctx.clone(rawField.references) : null
        });
      }
      var primaryField = null;
      for (var primaryIndex = 0; primaryIndex < fields.length; primaryIndex++) {
        if (fields[primaryIndex].primary) {
          primaryField = fields[primaryIndex];
          break;
        }
      }
      if (!primaryField && fields.length) {
        primaryField = fields[0];
      }
      normalized.push({
        name: entityName,
        singular: naming.singular,
        label: naming.displayLabel,
        displayLabel: naming.displayLabel,
        routeSegment: naming.routeSegment,
        fields: fields,
        primaryField: primaryField
      });
    }
    if (!normalized.length) {
      normalized.push({
        name: "contacts",
        singular: "contact",
        label: "Contacts",
        displayLabel: "Contacts",
        routeSegment: "contacts",
        fields: [
          { name: "Id", column: "id", label: "Id", type: "INT", primary: true, unique: true, required: true },
          { name: "FirstName", column: "firstname", label: "FirstName", type: "VARCHAR(128)", primary: false, unique: false, required: false },
          { name: "LastName", column: "lastname", label: "LastName", type: "VARCHAR(128)", primary: false, unique: false, required: false },
          { name: "Email", column: "email", label: "Email", type: "VARCHAR(255)", primary: false, unique: true, required: false }
        ],
        primaryField: { name: "Id", column: "id", label: "Id", type: "INT", primary: true, unique: true, required: true }
      });
      normalized.push({
        name: "companies",
        singular: "company",
        label: "Companies",
        displayLabel: "Companies",
        routeSegment: "companies",
        fields: [
          { name: "Id", column: "id", label: "Id", type: "INT", primary: true, unique: true, required: true },
          { name: "Name", column: "name", label: "Name", type: "VARCHAR(255)", primary: false, unique: true, required: false },
          { name: "Industry", column: "industry", label: "Industry", type: "VARCHAR(128)", primary: false, unique: false, required: false },
          { name: "City", column: "city", label: "City", type: "VARCHAR(128)", primary: false, unique: false, required: false }
        ],
        primaryField: { name: "Id", column: "id", label: "Id", type: "INT", primary: true, unique: true, required: true }
      });
    }
    return normalized;
  };

  C8O.crudUiKit.hydrateUiEntityFromFacade = function (ctx, projectName, facadePrefix, entity, result) {
    if (!entity || !needsUiFieldHydration(ctx, entity)) {
      return entity;
    }
    var requestable = ctx.facadeSequenceQName(projectName, facadePrefix, entity, "list");
    var payload = ctx.requestablePayload(requestable, {}, result);
    var rows = ctx.collectSqlOutputRows(payload);
    var firstRow = rows.length && rows[0] && typeof rows[0] === "object" ? rows[0] : null;
    if (!firstRow) {
      return entity;
    }
    var existingByColumn = {};
    var existingFields = ctx.ensureArray(entity.fields);
    for (var index = 0; index < existingFields.length; index++) {
      var existingField = existingFields[index];
      existingByColumn[ctx.normalizedIdentifier(existingField && existingField.column)] = existingField;
    }
    var hydratedFields = [];
    var rowKeys = Object.keys(firstRow);
    for (var keyIndex = 0; keyIndex < rowKeys.length; keyIndex++) {
      var rawKey = ctx.trimmed(rowKeys[keyIndex]);
      if (!rawKey.length) {
        continue;
      }
      var column = ctx.normalizedIdentifier(rawKey);
      var current = existingByColumn[column] || null;
      hydratedFields.push({
        name: current && ctx.trimmed(current.name).length ? current.name : rawKey,
        column: column,
        label: current && ctx.trimmed(current.label).length ? current.label : fieldLabelFromKey(ctx, rawKey),
        type: current && ctx.trimmed(current.type).length ? current.type : "VARCHAR(255)",
        primary: current ? ctx.toBoolean(current.primary, false) : column === "id",
        unique: current ? ctx.toBoolean(current.unique, false) : false,
        required: current ? ctx.toBoolean(current.required, false) : false,
        references: current && current.references ? ctx.clone(current.references) : null
      });
    }
    if (!hydratedFields.length) {
      return entity;
    }
    var primaryField = null;
    for (var hydratedIndex = 0; hydratedIndex < hydratedFields.length; hydratedIndex++) {
      if (hydratedFields[hydratedIndex].primary) {
        primaryField = hydratedFields[hydratedIndex];
        break;
      }
    }
    if (!primaryField) {
      primaryField = hydratedFields[0];
      primaryField.primary = true;
    }
    return {
      name: entity.name,
      singular: entity.singular,
      label: entity.label,
      displayLabel: entity.displayLabel,
      routeSegment: entity.routeSegment,
      fields: hydratedFields,
      primaryField: primaryField
    };
  };

  C8O.crudUiKit.hydrateUiEntitiesFromFacade = function (ctx, projectName, facadePrefix, entities, result) {
    var hydrated = [];
    var list = ctx.ensureArray(entities);
    for (var i = 0; i < list.length; i++) {
      hydrated.push(C8O.crudUiKit.hydrateUiEntityFromFacade(ctx, projectName, facadePrefix, list[i], result));
    }
    return hydrated;
  };

  C8O.crudUiKit.upsertNgxCrudKit = function (ctx, options) {
    var startedAt = ctx.nowMillis();
    var result = {
      status: "success",
      project: "",
      sharedComponents: [],
      pageTargets: [],
      runtimeEvidence: {},
      warnings: []
    };
    var projectName = ctx.trimmed(options.project);
    if (!projectName.length) {
      throw new Error("project is required");
    }
    result.project = projectName;
    var project = ctx.findProjectByName(projectName);
    if (!project) {
      throw new Error("Project " + projectName + " is not loaded");
    }
    var facadePrefix = ctx.trimmed(options.facadePrefix || "crud");
    var entities = C8O.crudUiKit.hydrateUiEntitiesFromFacade(
      ctx,
      projectName,
      facadePrefix,
      C8O.crudUiKit.normalizeUiEntities(ctx, options.entities),
      result
    );
    var entryPage = ctx.trimmed(options.entryPage || "Page");
    var variant = ctx.trimmed(options.variant || "entity-pages").toLowerCase() || "entity-pages";
    var stage = ctx.trimmed(options.stage || "final").toLowerCase() || "final";
    var isMasterDetail = variant === "master-detail";
    var isEntityPages = variant === "entity-pages";
    var contentQName = ctx.findPageContentQName(projectName, entryPage);
    var ngxApp = ctx.resolveQName(ctx.ngxAppQName(projectName), { optional: true });
    var contentDbo = ctx.resolveQName(contentQName, { optional: true });
    if (!ngxApp) {
      throw new Error("NGX application root not found for " + projectName);
    }
    if (!contentDbo) {
      throw new Error("Entry page content not found for " + projectName + ": " + contentQName);
    }
    var timings = {};
    result.runtimeEvidence.timings = timings;
    result.runtimeEvidence.variant = variant;
    result.runtimeEvidence.stage = stage;
    result.runtimeEvidence.mutationCounts = {
      created: 0,
      updated: 0
    };
    var sharedBuildStartedAt = ctx.nowMillis();
    var sharedComponents = isMasterDetail
      ? ctx.buildCrmSharedComponentsTree(projectName, stage)
      : (isEntityPages ? ctx.buildEntityPagesSharedComponentsTree(projectName, entities, stage) : ctx.buildDashboardSharedComponentsTree(projectName, entities, stage));
    var sharedActions = isMasterDetail
      ? ctx.buildCrmActionStacksTree(projectName, facadePrefix, stage)
      : (isEntityPages ? ctx.buildEntityPagesActionStacksTree(projectName, facadePrefix, entities, stage) : ctx.buildDashboardActionStacksTree(projectName, facadePrefix, entities, stage));
    var reuseExistingSharedActions = stage === "final" && ctx.everyQNameExists(sharedActions.qnames);
    var sharedActionChildren = reuseExistingSharedActions ? [] : ctx.ensureArray(sharedActions.tree.children);
    ctx.setDuration(timings, "buildSharedComponentsMs", sharedBuildStartedAt);
    result.runtimeEvidence.sharedComponentsRequested = ctx.ensureArray(sharedComponents.tree.children).length;
    result.runtimeEvidence.sharedComponentTreeNodeCount = ctx.countTreeNodes(sharedComponents.tree);
    result.runtimeEvidence.sharedActionsRequested = ctx.ensureArray(sharedActions.tree.children).length;
    result.runtimeEvidence.sharedActionTreeNodeCount = ctx.countTreeNodes(sharedActions.tree);
    result.runtimeEvidence.sharedActionsReused = reuseExistingSharedActions;
    result.runtimeEvidence.uiGlobals = ctx.statefulUiGlobals(variant);
    result.runtimeEvidence.workInProgressMode = "stateful-visibility";
    var pageShellStartedAt = ctx.nowMillis();
    var pageShellTree = isMasterDetail
      ? ctx.buildCrmMasterDetailPageShellTree(projectName, stage)
      : (isEntityPages ? ctx.buildEntityPagesLandingShellTree(projectName, entities, stage) : ctx.buildDashboardPageShellTree(projectName, entities, stage));
    ctx.setDuration(timings, "buildPageShellTreeMs", pageShellStartedAt);
    result.runtimeEvidence.pageShellTreeNodeCount = ctx.countTreeNodes(pageShellTree);
    var pageLoadStartedAt = ctx.nowMillis();
    var pageLoadTree = isMasterDetail
      ? ctx.buildCrmPageLoadTree(projectName, entryPage, stage)
      : (isEntityPages ? ctx.buildEntityPagesLandingLoadTree(projectName, entryPage) : ctx.buildDashboardPageLoadTree(projectName, entryPage, facadePrefix, entities, stage));
    ctx.setDuration(timings, "buildPageLoadTreeMs", pageLoadStartedAt);
    result.runtimeEvidence.pageLoadTreeNodeCount = ctx.countTreeNodes(pageLoadTree.tree);
    var entityPageRoots = [];
    var entityPageShells = [];
    var entityPageLoads = [];
    if (isEntityPages) {
      for (var entityIndex = 0; entityIndex < entities.length; entityIndex++) {
        var currentEntity = entities[entityIndex];
        entityPageRoots.push(ctx.buildEntityPageRootTree(currentEntity));
        var entityShellTree = ctx.buildEntityPageShellTree(projectName, currentEntity, stage);
        ctx.appendEntityPageRows(projectName, currentEntity, entityShellTree, stage);
        entityPageShells.push({
          entity: currentEntity.name,
          qname: ctx.entityPageContentQName(projectName, currentEntity),
          tree: entityShellTree
        });
        entityPageLoads.push({
          entity: currentEntity.name,
          tree: ctx.buildEntityPageLoadTree(projectName, currentEntity)
        });
      }
    }
    result.runtimeEvidence.pageNames = [entryPage].concat(entityPageRoots.map(function (pageTree) {
      return pageTree.name;
    }));
    result.runtimeEvidence.pageRoutes = ["/home"].concat(entityPageRoots.map(function (_pageTree, index) {
      return ctx.entityRoutePath(entities[index]);
    }));
    result.runtimeEvidence.entityPages = entityPageRoots.map(function (pageTree, index) {
      return {
        entity: entities[index].name,
        pageName: pageTree.name,
        route: ctx.entityRoutePath(entities[index]),
        contentQName: entityPageShells[index] ? entityPageShells[index].qname : "",
        sharedRefs: entityPageShells[index] ? ctx.collectSharedRefs(entityPageShells[index].tree, []) : []
      };
    });
    var expectedManagedCrudQNames = [ctx.pageQName(projectName, entryPage)]
      .concat(sharedComponents.qnames || [])
      .concat(sharedActions.qnames || [])
      .concat(entityPageLoads.map(function (item) { return item.tree.qname; }));
    var cleanupQNames = ctx.collectManagedCrudCleanupQNames(ngxApp, expectedManagedCrudQNames);
    result.runtimeEvidence.cleanupTargets = cleanupQNames;
    var batchApplyStartedAt = ctx.nowMillis();
    var pageMutationOperations = [
      {
        type: "upsertTree",
        opId: "entry_page_load",
        qname: ctx.pageQName(projectName, entryPage),
        strategy: {
          replaceOnClassMismatch: true,
          pruneMissing: false,
          reorder: false
        },
        patch: {
          properties: pageLoadTree.tree.properties || {},
          children: ctx.ensureArray(pageLoadTree.tree.children)
        }
      }
    ];
    var legacyPageLoadQNames = ctx.ensureArray(pageLoadTree.legacyQNames);
    for (var legacyIndex = 0; legacyIndex < legacyPageLoadQNames.length; legacyIndex++) {
      var legacyQName = ctx.trimmed(legacyPageLoadQNames[legacyIndex]);
      if (!legacyQName.length) {
        continue;
      }
      if (!ctx.resolveQName(legacyQName, { optional: true })) {
        continue;
      }
      pageMutationOperations.unshift({
        type: "delete",
        opId: "delete_" + ctx.normalizedIdentifier(legacyQName),
        qname: legacyQName
      });
    }
    var cleanupOperations = cleanupQNames.map(function (qname) {
      return {
        type: "delete",
        opId: "cleanup_" + ctx.normalizedIdentifier(qname),
        qname: qname
      };
    });
    var batchOperations = cleanupOperations.concat([
      {
        type: "upsertTree",
        opId: "shared_components",
        qname: ctx.ngxAppQName(projectName),
        strategy: {
          replaceOnClassMismatch: true,
          pruneMissing: false,
          reorder: false
        },
        patch: {
          children: ctx.ensureArray(sharedComponents.tree.children).concat(sharedActionChildren).concat(entityPageRoots)
        }
      },
      {
        type: "upsertTree",
        opId: "entry_page",
        qname: contentQName,
        strategy: {
          replaceOnClassMismatch: true,
          pruneMissing: true,
          reorder: false
        },
        patch: {
          properties: pageShellTree.properties || {},
          children: ctx.ensureArray(pageShellTree.children)
        }
      }
    ]).concat(pageMutationOperations);
    for (var pageIndex = 0; pageIndex < entityPageShells.length; pageIndex++) {
      batchOperations.push(
        {
          type: "upsertTree",
          opId: "entity_page_" + ctx.normalizedIdentifier(entityPageShells[pageIndex].entity),
          qname: entityPageShells[pageIndex].qname,
          strategy: {
            replaceOnClassMismatch: true,
            pruneMissing: true,
            reorder: false
          },
          patch: {
            properties: entityPageShells[pageIndex].tree.properties || {},
            children: ctx.ensureArray(entityPageShells[pageIndex].tree.children)
          }
        },
        {
          type: "upsertTree",
          opId: "entity_page_load_" + ctx.normalizedIdentifier(entityPageLoads[pageIndex].entity),
          qname: entityPageLoads[pageIndex].tree.qname,
          strategy: {
            replaceOnClassMismatch: true,
            pruneMissing: false,
            reorder: false
          },
          patch: {
            properties: entityPageLoads[pageIndex].tree.tree.properties || {},
            children: ctx.ensureArray(entityPageLoads[pageIndex].tree.tree.children)
          }
        }
      );
    }
    if (reuseExistingSharedActions) {
      var buildStageQName = ctx.statefulBootstrapStageQName(projectName, variant);
      if (ctx.resolveQName(buildStageQName, { optional: true })) {
        batchOperations.push({
          type: "setProperties",
          opId: "stateful_build_stage",
          qname: buildStageQName,
          properties: {
            Value: {
              mode: "SCRIPT",
              value: ctx.scriptLiteral(stage)
            }
          }
        });
      } else {
        ctx.addWarning(result, "Unable to reuse stateful actions: build stage node not found for " + buildStageQName);
      }
    }
    var batchApplyResult = ctx.batchApply({
      target: ctx.ngxAppQName(projectName),
      strict: true,
      onError: "stop",
      autoSave: false,
      triggerMobileBuilder: false,
      operations: batchOperations
    });
    ctx.setDuration(timings, "batchTreeApplyMs", batchApplyStartedAt);
    ctx.collectBatchWarnings(batchApplyResult, result, "batchApply");
    if (!batchApplyResult || batchApplyResult.status === "failed" || (batchApplyResult.errors && batchApplyResult.errors.length)) {
      throw new Error(ctx.firstBatchErrorMessage(batchApplyResult));
    }
    result.sharedComponents = sharedComponents.qnames.slice();
    result.runtimeEvidence.batchApply = ctx.summarizeTreeApplyResult(batchApplyResult, ctx.ngxAppQName(projectName), result);
    result.runtimeEvidence.sharedComponentsApply = ctx.operationSummary(batchApplyResult, "shared_components", ctx.ngxAppQName(projectName));
    result.runtimeEvidence.treeApply = ctx.operationSummary(batchApplyResult, "entry_page", contentQName);
    result.runtimeEvidence.pageLoadApply = ctx.operationSummary(batchApplyResult, "entry_page_load", ctx.pageQName(projectName, entryPage));
    result.runtimeEvidence.sharedActions = sharedActions.qnames.slice();
    timings.applySharedComponentsMs = timings.batchTreeApplyMs;
    timings.applyPagePropertiesMs = 0;
    timings.prunePageChildrenMs = 0;
    timings.applyPageChildrenMs = 0;
    var batchSummary = batchApplyResult.summary || {};
    result.runtimeEvidence.mutationCounts.created = Number(batchSummary.created || 0);
    result.runtimeEvidence.mutationCounts.updated = Number(batchSummary.updatedProperties || 0);
    result.runtimeEvidence.mutationCounts.deleted = Number(batchSummary.deleted || 0);
    result.runtimeEvidence.mutationCounts.replaced = Number(batchSummary.replaced || 0);
    var sharedBindingsStartedAt = ctx.nowMillis();
    var sharedBindingOperations = [];
    if (sharedBindingOperations.length) {
      var sharedBindingsBatch = ctx.batchApply({
        target: ctx.ngxAppQName(projectName),
        strict: true,
        onError: "stop",
        autoSave: false,
        triggerMobileBuilder: false,
        operations: sharedBindingOperations
      });
      ctx.collectBatchWarnings(sharedBindingsBatch, result, "sharedBindings");
      if (!sharedBindingsBatch || sharedBindingsBatch.status === "failed" || (sharedBindingsBatch.errors && sharedBindingsBatch.errors.length)) {
        throw new Error(ctx.firstBatchErrorMessage(sharedBindingsBatch));
      }
      result.runtimeEvidence.sharedBindingsApply = ctx.summarizeTreeApplyResult(sharedBindingsBatch, ctx.ngxAppQName(projectName), result);
      var bindingsSummary = sharedBindingsBatch.summary || {};
      result.runtimeEvidence.mutationCounts.updated += Number(bindingsSummary.updatedProperties || 0);
    } else {
      result.runtimeEvidence.sharedBindingsApply = {
        status: "skipped",
        target: ctx.ngxAppQName(projectName)
      };
    }
    ctx.setDuration(timings, "configureSharedBindingsMs", sharedBindingsStartedAt);
    result.pageTargets.push(contentQName);
    for (var targetIndex = 0; targetIndex < entityPageShells.length; targetIndex++) {
      result.pageTargets.push(entityPageShells[targetIndex].qname);
    }
    result.runtimeEvidence.entryPage = entryPage;
    result.runtimeEvidence.facadePrefix = facadePrefix;
    result.runtimeEvidence.pageSharedRefs = ctx.collectSharedRefs(pageShellTree, []);
    result.runtimeEvidence.workInProgressSharedRefPresent = result.runtimeEvidence.pageSharedRefs.indexOf(ctx.sharedComponentQName(projectName, "WorkInProgressCard")) !== -1;
    try {
      var uiAuditStartedAt = ctx.nowMillis();
      var uiTree = ctx.callInternalSequence("tools_databaseobject_tree_get", {
        target: contentQName,
        childrenDepth: 5,
        properties: "none",
        limit: 320
      });
      ctx.setDuration(timings, "uiAuditTreeGetMs", uiAuditStartedAt);
      var uiAudit = ctx.auditUiTreePayload(uiTree);
      result.runtimeEvidence.shellVisible = uiAudit.visibleShellPresent;
      result.runtimeEvidence.starterDominant = uiAudit.starterDominant;
      result.runtimeEvidence.liveBindingPresent = uiAudit.liveBindingPresent;
    } catch (uiInspectError) {
      result.status = "partial";
      ctx.addWarning(result, "Unable to inspect NGX shell after apply: " + String(uiInspectError));
    }
    try {
      var projectSaveStartedAt = ctx.nowMillis();
      result.runtimeEvidence.projectSave = ctx.summarizeSaveResult(ctx.saveProject(project, []), result);
      ctx.setDuration(timings, "projectSaveMs", projectSaveStartedAt);
      var generatedSourcesCleanupStartedAt = ctx.nowMillis();
      result.runtimeEvidence.generatedSourcesCleanup = ctx.cleanupGeneratedIonicSources(projectName, ngxApp);
      ctx.setDuration(timings, "generatedSourcesCleanupMs", generatedSourcesCleanupStartedAt);
      result.runtimeEvidence.generatedSourcesPurge = {
        skipped: true,
        reason: "Managed source purge disabled to avoid transient live-viewer compile failures during watched regeneration.",
        pageDirsPurged: [],
        componentDirsPurged: [],
        deletedCount: 0
      };
      timings.generatedSourcesPurgeMs = 0;
      var mobileBuilderStartedAt = ctx.nowMillis();
      var refreshTargets = [ctx.pageQName(projectName, entryPage)].concat(sharedComponents.qnames || []);
      for (var refreshIndex = 0; refreshIndex < entityPageLoads.length; refreshIndex++) {
        refreshTargets.push(entityPageLoads[refreshIndex].tree.qname);
      }
      result.runtimeEvidence.mobileBuilder = ctx.triggerUiSourceRefreshTargets(
        refreshTargets,
        result,
        "$.runtimeEvidence.mobileBuilder"
      );
      ctx.setDuration(timings, "mobileBuilderMs", mobileBuilderStartedAt);
      var studioRefreshStartedAt = ctx.nowMillis();
      result.runtimeEvidence.studioRefresh = ctx.refreshStudioProjectTree(project, result, "studioRefresh");
      ctx.setDuration(timings, "studioRefreshMs", studioRefreshStartedAt);
    } catch (saveUiError) {
      result.status = "partial";
      ctx.addWarning(result, "Unable to save project after NGX CRUD kit apply: " + String(saveUiError));
    }
    result.runtimeEvidence.totalDurationMs = ctx.setDuration(timings, "totalMs", startedAt);
    return result;
  };
})();
