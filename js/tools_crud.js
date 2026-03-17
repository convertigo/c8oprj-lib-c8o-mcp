include("js/util.js");
include("js/databaseobject.js");
include("js/databaseobject_batch.js");
include("js/marketplace.js");
include("js/crud_naming.js");
include("js/crud_seed.js");
include("js/crud_spec.js");
include("js/crud_runtime.js");
include("js/crud_backend.js");
include("js/crud_ui_nodes.js");
include("js/crud_ui_state.js");
include("js/crud_ui_meta.js");
include("js/crud_ui_shared.js");
include("js/crud_ui_pages.js");
include("js/crud_ui_actions.js");
include("js/crud_ui_dashboard.js");
include("js/crud_ui_crm.js");
include("js/crud_ui_crm_actions.js");
include("js/crud_ui_refresh.js");
include("js/crud_ui_audit.js");
include("js/crud_ui_kit.js");
include("js/crud_proof.js");
include("js/crud_viewer.js");

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.crud = C8O.crud || {};

(function () {
  if (C8O.crud._initialized === true) {
    return;
  }
  C8O.crud._initialized = true;

  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var InternalRequester = Packages.com.twinsoft.convertigo.engine.requesters.InternalRequester;
  var HashMap = Packages.java.util.HashMap;
  var SqlTransaction = Packages.com.twinsoft.convertigo.beans.transactions.SqlTransaction;
  var GenericSequence = Packages.com.twinsoft.convertigo.beans.core.GenericSequence;
  var TransactionStep = Packages.com.twinsoft.convertigo.beans.steps.TransactionStep;
  var XMLCopyStep = Packages.com.twinsoft.convertigo.beans.steps.XMLCopyStep;
  var RequestableVariable = Packages.com.twinsoft.convertigo.beans.variables.RequestableVariable;
  var StepVariable = Packages.com.twinsoft.convertigo.beans.variables.StepVariable;

  function trimmed(value) {
    return C8O.util.toTrimmedString ? C8O.util.toTrimmedString(value) : (value == null ? "" : String(value).trim());
  }

  function toBoolean(value, defaultValue) {
    if (C8O.util.toBoolean) {
      return C8O.util.toBoolean(value, defaultValue);
    }
    return value == null ? !!defaultValue : String(value).toLowerCase() === "true";
  }

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_ignoreClone) {
      return value;
    }
  }

  function ensureArray(value) {
    if (!value) {
      return [];
    }
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value !== "string" && typeof value.length === "number") {
      var byLength = [];
      for (var i = 0; i < value.length; i++) {
        byLength.push(value[i]);
      }
      return byLength;
    }
    if (typeof value.size === "function" && typeof value.get === "function") {
      var bySize = [];
      var size = 0;
      try {
        size = value.size();
      } catch (_ignoreSize) {
        size = 0;
      }
      for (var j = 0; j < size; j++) {
        bySize.push(value.get(j));
      }
      return bySize;
    }
    if (typeof value.iterator === "function") {
      var byIterator = [];
      try {
        var iterator = value.iterator();
        while (iterator.hasNext()) {
          byIterator.push(iterator.next());
        }
        return byIterator;
      } catch (_ignoreIterator) {}
    }
    return [value];
  }

  function ensureWarnings(target) {
    if (!target.warnings) {
      target.warnings = [];
    }
    return target.warnings;
  }

  function addWarning(target, message) {
    ensureWarnings(target).push(String(message));
  }

  function ucfirst(value) {
    return C8O.crudNaming.ucfirst(namingContext(), value);
  }

  function pascalize(value) {
    return C8O.crudNaming.pascalize(namingContext(), value);
  }

  function singularize(name) {
    return C8O.crudNaming.singularize(namingContext(), name);
  }

  function pluralize(name) {
    return C8O.crudNaming.pluralize(namingContext(), name);
  }

  function semanticToken(value) {
    return C8O.crudNaming.semanticToken(namingContext(), value);
  }

  function semanticFieldToken(field) {
    return C8O.crudNaming.semanticFieldToken(namingContext(), field);
  }

  function semanticEntityToken(entity) {
    return C8O.crudNaming.semanticEntityToken(namingContext(), entity);
  }

  function tokenMatches(token, patterns) {
    return C8O.crudNaming.tokenMatches(namingContext(), token, patterns);
  }

  function humanizeIdentifier(value) {
    return C8O.crudNaming.humanizeIdentifier(namingContext(), value);
  }

  function normalizeEntityNames(rawEntity, fallbackName) {
    return C8O.crudNaming.normalizeEntityNames(namingContext(), rawEntity, fallbackName);
  }

  function escapeSqlString(value) {
    return String(value == null ? "" : value).replace(/'/g, "''");
  }

  function toInt(value, defaultValue) {
    if (value == null || value === "") {
      return defaultValue;
    }
    try {
      var parsed = parseInt(String(value), 10);
      return isNaN(parsed) ? defaultValue : parsed;
    } catch (_ignoreInt) {
      return defaultValue;
    }
  }

  function closeQuietly(closeable) {
    if (!closeable || !closeable.close) {
      return;
    }
    try {
      closeable.close();
    } catch (_ignoreClose) {}
  }

  function readJavaStream(stream) {
    if (!stream) {
      return "";
    }
    var Scanner = Packages.java.util.Scanner;
    var scanner = null;
    try {
      scanner = new Scanner(stream, "UTF-8").useDelimiter("\\A");
      return scanner.hasNext() ? String(scanner.next()) : "";
    } finally {
      closeQuietly(scanner);
    }
  }

  function normalizedIdentifier(name) {
    var text = trimmed(name).replace(/[^A-Za-z0-9_]/g, "_");
    if (!text.length) {
      return "unnamed";
    }
    if (/^[0-9]/.test(text)) {
      text = "x_" + text;
    }
    return text.toLowerCase();
  }

  function optionalNormalizedIdentifier(name) {
    var text = trimmed(name);
    return text.length ? normalizedIdentifier(text) : "";
  }

  function namingContext() {
    return {
      trimmed: trimmed,
      ensureArray: ensureArray,
      normalizedIdentifier: normalizedIdentifier,
      optionalNormalizedIdentifier: optionalNormalizedIdentifier
    };
  }

  function crudSpecContext() {
    return {
      trimmed: trimmed,
      clone: clone,
      ensureArray: ensureArray,
      toBoolean: toBoolean,
      pluralize: pluralize,
      normalizedIdentifier: normalizedIdentifier,
      normalizeEntityNames: normalizeEntityNames
    };
  }

  function crudRuntimeContext() {
    return {
      Engine: Engine,
      trimmed: trimmed,
      ensureArray: ensureArray,
      normalizedIdentifier: normalizedIdentifier,
      addWarning: addWarning
    };
  }

  function crudBackendContext() {
    return {
      SqlTransaction: SqlTransaction,
      trimmed: trimmed,
      toBoolean: toBoolean,
      ensureArray: ensureArray,
      pluralize: pluralize,
      normalizedIdentifier: normalizedIdentifier,
      normalizeSpec: normalizeSpec,
      ensureProject: ensureProject,
      crmRelationContext: crmRelationContext,
      buildSeedSql: buildSeedSql,
      ensureChild: ensureChild,
      createChild: createChild,
      findChild: findChild,
      applyUpdates: applyUpdates,
      connectorProperties: connectorProperties,
      priorityOf: priorityOf,
      ucfirst: ucfirst,
      connectorRequestableQName: connectorRequestableQName,
      saveProject: function (project, warnings) {
        return C8O.dbo.saveProject(project, warnings || []);
      },
      summarizeSaveResult: summarizeSaveResult,
      refreshStudioProjectTree: refreshStudioProjectTree,
      proofRequestable: proofRequestable,
      upsertNgxCrudKit: upsertNgxCrudKit,
      addWarning: addWarning
    };
  }

  function crudUiContext() {
    return {
      trimmed: trimmed,
      ensureArray: ensureArray,
      toBoolean: toBoolean
    };
  }

  function crudUiStateContext() {
    return {
      trimmed: trimmed,
      ensureArray: ensureArray,
      resolveQName: function (qname) {
        return C8O.dbo.resolve(qname, { optional: true });
      },
      crmActionQName: crmActionQName,
      dashboardActionQName: dashboardActionQName,
      pageQName: pageQName,
      sharedComponentQName: sharedComponentQName,
      ifDirectiveNode: ifDirectiveNode,
      buildUseSharedNode: buildUseSharedNode,
      scriptLiteral: function (value) {
        return scriptLiteral(value);
      }
    };
  }

  function crudUiMetaContext() {
    return {
      trimmed: trimmed,
      clone: clone,
      ensureArray: ensureArray,
      pascalize: pascalize,
      pluralize: pluralize,
      normalizedIdentifier: normalizedIdentifier,
      semanticFieldToken: semanticFieldToken,
      tokenMatches: tokenMatches,
      facadeSequenceQName: facadeSequenceQName
    };
  }

  function crudProofContext() {
    return {
      trimmed: trimmed,
      ensureArray: ensureArray,
      ensureWarnings: ensureWarnings,
      addWarning: addWarning,
      toBoolean: toBoolean,
      normalizedIdentifier: normalizedIdentifier,
      normalizeStatus: normalizeStatus,
      isSuccessLikeStatus: isSuccessLikeStatus,
      toJsonSafe: C8O.util && typeof C8O.util.toJsonSafe === "function" ? C8O.util.toJsonSafe : null,
      callInternalSequence: callInternalSequence,
      crmRelationContext: crmRelationContext,
      statefulUiGlobals: statefulUiGlobals,
      findPageContentQName: findPageContentQName,
      txName: txName,
      resolveQName: function (qname, options) {
        return C8O.dbo.resolve(qname, options || {});
      },
      dashboardActionQName: dashboardActionQName,
      crmActionQName: crmActionQName,
      pageQName: pageQName,
      collectTreeNames: collectTreeNames,
      auditUiTreePayload: auditUiTreePayload,
      proofRequestable: proofRequestable,
      requestablePayload: requestablePayload,
      summarizeRequestableProof: summarizeRequestableProof,
      firstSqlOutputRow: firstSqlOutputRow,
      extractRowField: extractRowField,
      inferDriverFamilyFromConnector: inferDriverFamilyFromConnector,
      findProjectByName: findProjectByName,
      findSqlConnectorInProject: findSqlConnectorInProject,
      normalizeDatabaseSpec: normalizeDatabaseSpec,
      probeViewer: probeViewer
    };
  }

  function crudViewerContext() {
    return {
      trimmed: trimmed,
      ensureArray: ensureArray,
      normalizedIdentifier: normalizedIdentifier
    };
  }

  function crudUiRefreshContext() {
    return {
      trimmed: trimmed,
      ensureArray: ensureArray,
      normalizedIdentifier: normalizedIdentifier,
      addWarning: addWarning
    };
  }

  function crudUiKitContext() {
    return {
      trimmed: trimmed,
      clone: clone,
      ensureArray: ensureArray,
      toBoolean: toBoolean,
      normalizeEntityNames: normalizeEntityNames,
      normalizedIdentifier: normalizedIdentifier,
      facadeSequenceQName: facadeSequenceQName,
      requestablePayload: requestablePayload,
      collectSqlOutputRows: collectSqlOutputRows,
      nowMillis: nowMillis,
      setDuration: setDuration,
      addWarning: addWarning,
      countTreeNodes: countTreeNodes,
      findProjectByName: findProjectByName,
      pageQName: pageQName,
      findPageContentQName: findPageContentQName,
      ngxAppQName: ngxAppQName,
      entityPageContentQName: entityPageContentQName,
      entityRoutePath: entityRoutePath,
      sharedComponentQName: sharedComponentQName,
      resolveQName: function (qname, options) {
        return C8O.dbo.resolve(qname, options || {});
      },
      buildCrmSharedComponentsTree: buildCrmSharedComponentsTree,
      buildEntityPagesSharedComponentsTree: buildEntityPagesSharedComponentsTree,
      buildDashboardSharedComponentsTree: buildDashboardSharedComponentsTree,
      buildCrmActionStacksTree: buildCrmActionStacksTree,
      buildEntityPagesActionStacksTree: buildEntityPagesActionStacksTree,
      buildDashboardActionStacksTree: buildDashboardActionStacksTree,
      buildCrmMasterDetailPageShellTree: buildCrmMasterDetailPageShellTree,
      buildEntityPagesLandingShellTree: buildEntityPagesLandingShellTree,
      buildDashboardPageShellTree: buildDashboardPageShellTree,
      buildCrmPageLoadTree: buildCrmPageLoadTree,
      buildEntityPagesLandingLoadTree: buildEntityPagesLandingLoadTree,
      buildDashboardPageLoadTree: buildDashboardPageLoadTree,
      buildEntityPageRootTree: buildEntityPageRootTree,
      buildEntityPageShellTree: buildEntityPageShellTree,
      appendEntityPageRows: appendEntityPageRows,
      buildEntityPageLoadTree: buildEntityPageLoadTree,
      everyQNameExists: everyQNameExists,
      statefulUiGlobals: statefulUiGlobals,
      collectManagedCrudCleanupQNames: collectManagedCrudCleanupQNames,
      statefulBootstrapStageQName: statefulBootstrapStageQName,
      scriptLiteral: scriptLiteral,
      batchApply: function (options) {
        return C8O.dbo.batchApply(options);
      },
      summarizeTreeApplyResult: summarizeTreeApplyResult,
      operationSummary: operationSummary,
      firstBatchErrorMessage: firstBatchErrorMessage,
      collectBatchWarnings: collectBatchWarnings,
      callInternalSequence: callInternalSequence,
      auditUiTreePayload: auditUiTreePayload,
      summarizeSaveResult: summarizeSaveResult,
      saveProject: function (project, warnings) {
        return C8O.dbo.saveProject(project, warnings || []);
      },
      cleanupGeneratedIonicSources: cleanupGeneratedIonicSources,
      triggerUiSourceRefreshTargets: triggerUiSourceRefreshTargets,
      refreshStudioProjectTree: refreshStudioProjectTree,
      normalizeStatus: normalizeStatus,
      collectSharedRefs: collectSharedRefs
    };
  }

  function crudUiSharedContext() {
    return {
      trimmed: trimmed,
      ensureArray: ensureArray,
      ucfirst: ucfirst,
      pascalize: pascalize,
      pluralize: pluralize,
      normalizedIdentifier: normalizedIdentifier,
      scriptLiteral: scriptLiteral,
      compVariableNode: compVariableNode,
      scriptTextNode: scriptTextNode,
      smartTextNode: smartTextNode,
      plainTextNode: plainTextNode,
      textElementNode: textElementNode,
      ifDirectiveNode: ifDirectiveNode,
      iterationDirectiveNode: iterationDirectiveNode,
      iterationSourceValue: iterationSourceValue,
      controlEventNode: controlEventNode,
      dynamicInvokeNode: dynamicInvokeNode,
      controlVariableNode: controlVariableNode,
      customAsyncActionNode: customAsyncActionNode,
      dashboardCountExpression: dashboardCountExpression,
      dashboardRowsExpression: dashboardRowsExpression,
      dashboardSampleExpression: dashboardSampleExpression,
      dynamicFieldAccessExpression: dynamicFieldAccessExpression,
      buildUseSharedNode: buildUseSharedNode,
      sharedComponentQName: sharedComponentQName,
      schemaPreviewFields: schemaPreviewFields,
      firstNonPrimaryField: firstNonPrimaryField,
      secondPreviewField: secondPreviewField,
      entityUiConfig: entityUiConfig,
      crudSelectedExpression: crudSelectedExpression,
      crudModeExpression: crudModeExpression,
      crudEntityStatusExpression: crudEntityStatusExpression,
      crudEntityErrorExpression: crudEntityErrorExpression,
      crudDraftExpression: crudDraftExpression,
      dashboardActionQName: dashboardActionQName,
      entityPagesButtonNode: entityPagesButtonNode,
      findEntityByName: findEntityByName
    };
  }

  function crudUiPagesContext() {
    return {
      ensureArray: ensureArray,
      ucfirst: ucfirst,
      pascalize: pascalize,
      scriptLiteral: scriptLiteral,
      plainTextNode: plainTextNode,
      scriptTextNode: scriptTextNode,
      textElementNode: textElementNode,
      ifDirectiveNode: ifDirectiveNode,
      pageEventNode: pageEventNode,
      dynamicInvokeNode: dynamicInvokeNode,
      buildUseSharedNode: buildUseSharedNode,
      useVariableNode: useVariableNode,
      dashboardCountExpression: dashboardCountExpression,
      dashboardSampleExpression: dashboardSampleExpression,
      dynamicFieldAccessExpression: dynamicFieldAccessExpression,
      buildStatefulBootstrapRow: buildStatefulBootstrapRow,
      crudEntityStatusExpression: crudEntityStatusExpression,
      crudEntityErrorExpression: crudEntityErrorExpression,
      schemaPreviewFields: schemaPreviewFields,
      firstNonPrimaryField: firstNonPrimaryField,
      entityRoutePath: entityRoutePath,
      entityRouteSegment: entityRouteSegment,
      entityPageName: entityPageName,
      entityPageQName: entityPageQName,
      pageQName: pageQName,
      sharedComponentQName: sharedComponentQName,
      dashboardActionQName: dashboardActionQName,
      entityPagesButtonNode: entityPagesButtonNode,
      buildDashboardPageScriptContent: buildDashboardPageScriptContent
    };
  }

  function crudUiActionsContext() {
    return {
      ensureArray: ensureArray,
      trimmed: trimmed,
      clone: clone,
      pascalize: pascalize,
      scriptLiteral: scriptLiteral,
      actionCallSnippet: actionCallSnippet,
      actionCallFromExpressionSnippet: actionCallFromExpressionSnippet,
      entityUiConfig: entityUiConfig,
      dashboardActionQName: dashboardActionQName,
      actionStackNode: actionStackNode,
      stackVariableNode: stackVariableNode,
      dynamicInvokeNode: dynamicInvokeNode,
      customAsyncActionNode: customAsyncActionNode
    };
  }

  function crudUiDashboardContext() {
    return {
      trimmed: trimmed,
      scriptLiteral: scriptLiteral,
      ucfirst: ucfirst,
      actionCallSnippet: actionCallSnippet,
      actionCallFromExpressionSnippet: actionCallFromExpressionSnippet,
      actionRowsExpression: actionRowsExpression,
      facadeSequenceQName: facadeSequenceQName,
      dashboardActionQName: dashboardActionQName,
      actionStackNode: actionStackNode,
      dynamicInvokeNode: dynamicInvokeNode,
      customAsyncActionNode: customAsyncActionNode
    };
  }

  function crudUiCrmContext() {
    return {
      trimmed: trimmed,
      ucfirst: ucfirst,
      plainTextNode: plainTextNode,
      scriptTextNode: scriptTextNode,
      textElementNode: textElementNode,
      ifDirectiveNode: ifDirectiveNode,
      buildUseSharedNode: buildUseSharedNode,
      sharedComponentQName: sharedComponentQName,
      buildStatefulBootstrapRow: buildStatefulBootstrapRow,
      pageQName: pageQName,
      pageEventNode: pageEventNode,
      dynamicInvokeNode: dynamicInvokeNode,
      crmActionQName: crmActionQName,
      sourceDirectiveNode: sourceDirectiveNode,
      globalSourceValue: globalSourceValue,
      smartTextNode: smartTextNode,
      iterationSourceValue: iterationSourceValue,
      controlEventNode: controlEventNode,
      controlVariableNode: controlVariableNode,
      customAsyncActionNode: customAsyncActionNode
    };
  }

  function crudUiCrmActionsContext() {
    return {
      trimmed: trimmed,
      scriptLiteral: scriptLiteral,
      crmActionQName: crmActionQName,
      actionStackNode: actionStackNode,
      callSequenceActionNode: callSequenceActionNode,
      setGlobalActionNode: setGlobalActionNode,
      stackVariableNode: stackVariableNode,
      dynamicInvokeNode: dynamicInvokeNode,
      controlVariableNode: controlVariableNode
    };
  }

  function normalizeDriver(databaseSpec) {
    return C8O.crudSpec.normalizeDriver(crudSpecContext(), databaseSpec);
  }

  function inferDriverFamilyFromConnector(connector) {
    return C8O.crudSpec.inferDriverFamilyFromConnector(crudSpecContext(), connector);
  }

  function normalizeDatabaseSpec(spec, result) {
    return C8O.crudSpec.normalizeDatabaseSpec(crudSpecContext(), spec, result);
  }

  function normalizeField(field, entityName, index, result) {
    return C8O.crudSpec.normalizeField(crudSpecContext(), field, entityName, index, result);
  }

  function normalizeEntity(rawEntity, result) {
    return C8O.crudSpec.normalizeEntity(crudSpecContext(), rawEntity, result);
  }

  function normalizeSpec(specInput) {
    return C8O.crudSpec.normalizeSpec(crudSpecContext(), specInput);
  }

  function findEntityByName(entities, entityName) {
    return C8O.crudSpec.findEntityByName(crudSpecContext(), entities, entityName);
  }

  function findField(entity, predicate) {
    return C8O.crudSpec.findField(crudSpecContext(), entity, predicate);
  }

  function crmRelationContext(spec) {
    return C8O.crudSpec.crmRelationContext(crudSpecContext(), spec);
  }

  function applyCrmDefaults(spec) {
    return C8O.crudSpec.applyCrmDefaults(crudSpecContext(), spec);
  }

	  function findProjectByName(projectName) {
	    return C8O.crudRuntime.findProjectByName(crudRuntimeContext(), projectName);
	  }

  function ensureProject(spec, result) {
    return C8O.crudRuntime.ensureProject(crudRuntimeContext(), spec, result);
  }

  function logicalClassName(node) {
    return C8O.crudRuntime.logicalClassName(node);
  }

  function findChild(parent, name, className) {
    return C8O.crudRuntime.findChild(crudRuntimeContext(), parent, name, className);
  }

  function createChild(parent, className, name) {
    return C8O.crudRuntime.createChild(crudRuntimeContext(), parent, className, name);
  }

  function ensureChild(parent, className, name, result) {
    return C8O.crudRuntime.ensureChild(crudRuntimeContext(), parent, className, name, result);
  }

  function priorityOf(dbo) {
    return C8O.crudRuntime.priorityOf(dbo);
  }

  function applyUpdates(dbo, updates, result) {
    return C8O.crudRuntime.applyUpdates(crudRuntimeContext(), dbo, updates, result);
  }

  function nowMillis() {
    return C8O.crudRuntime.nowMillis();
  }

  function setDuration(bucket, key, startedAt) {
    return C8O.crudRuntime.setDuration(bucket, key, startedAt);
  }

  function countTreeNodes(node) {
    return C8O.crudRuntime.countTreeNodes(crudRuntimeContext(), node);
  }

  function collectTreeNames(node, names) {
    return C8O.crudRuntime.collectTreeNames(crudRuntimeContext(), node, names);
  }

	  function connectorProperties(spec) {
	    return C8O.crudRuntime.connectorProperties(crudRuntimeContext(), spec);
	  }

	  function buildJdbcUrl(databaseSpec, spec) {
	    return C8O.crudRuntime.buildJdbcUrl(crudRuntimeContext(), databaseSpec, spec);
	  }

  function mapSqlType(field, driver) {
    return C8O.crudBackend.mapSqlType(crudBackendContext(), field, driver);
  }

  function renderColumnDefinition(field, driver) {
    return C8O.crudBackend.renderColumnDefinition(crudBackendContext(), field, driver);
  }

  function buildCreateTableSql(spec, entity) {
    return C8O.crudBackend.buildCreateTableSql(crudBackendContext(), spec, entity);
  }

  function crudSeedContext() {
    return {
      trimmed: trimmed,
      ensureArray: ensureArray,
      ucfirst: ucfirst,
      semanticToken: semanticToken,
      semanticFieldToken: semanticFieldToken,
      semanticEntityToken: semanticEntityToken,
      tokenMatches: tokenMatches,
      escapeSqlString: escapeSqlString,
      normalizedIdentifier: normalizedIdentifier,
      findEntityByName: findEntityByName,
      findField: findField
    };
  }

  function sampleValueForField(entity, field, rowIndex) {
    return C8O.crudSeed.sampleValueForField(crudSeedContext(), entity, field, rowIndex);
  }

  function pickSeedLookupField(entity) {
    return C8O.crudSeed.pickSeedLookupField(crudSeedContext(), entity);
  }

  function orderedEntities(spec) {
    return C8O.crudBackend.orderedEntities(crudBackendContext(), spec);
  }

  function renderSeedValue(spec, entity, field, rowIndex) {
    return C8O.crudSeed.renderSeedValue(crudSeedContext(), spec, entity, field, rowIndex);
  }

  function buildDeleteSql(entity) {
    return C8O.crudBackend.buildDeleteSql(crudBackendContext(), entity);
  }

  function buildSeedSql(spec, entity) {
    return C8O.crudSeed.buildSeedSql(crudSeedContext(), spec, entity);
  }

  function buildInitSql(spec) {
    return C8O.crudBackend.buildInitSql(crudBackendContext(), spec);
  }

  function listColumns(entity) {
    return C8O.crudBackend.listColumns(crudBackendContext(), entity);
  }

  function txName(entity, verb) {
    return C8O.crudBackend.txName(crudBackendContext(), entity, verb);
  }

  function buildCrudSql(spec, entity, verb) {
    return C8O.crudBackend.buildCrudSql(crudBackendContext(), spec, entity, verb);
  }

  function buildCrmCompanyContactsSql(spec) {
    return C8O.crudBackend.buildCrmCompanyContactsSql(crudBackendContext(), spec);
  }

  function ensureConnector(project, spec, result) {
    return C8O.crudBackend.ensureConnector(crudBackendContext(), project, spec, result);
  }

  function findSqlConnectorInProject(project, preferredName) {
    return C8O.crudBackend.findSqlConnectorInProject(crudBackendContext(), project, preferredName);
  }

  function ensureSqlTransaction(connector, name, sqlQuery, autoCommit, result) {
    return C8O.crudBackend.ensureSqlTransaction(crudBackendContext(), connector, name, sqlQuery, autoCommit, result);
  }

  function collectTransactionVariables(tx) {
    var names = [];
    try {
      var vars = tx.getVariables();
      for (var i = 0; i < vars.size(); i++) {
        var variable = vars.get(i);
        names.push(String(variable.getName()));
      }
    } catch (_ignoreTxVariables) {}
    return names;
  }

  function ensureRequestableVariables(container, variableNames, result) {
    return C8O.crudBackend.ensureRequestableVariables(crudBackendContext(), container, variableNames, result);
  }

  function ensureStepVariables(step, variableNames, result) {
    return C8O.crudBackend.ensureStepVariables(crudBackendContext(), step, variableNames, result);
  }

  function ensurePublicSequence(project, sequenceName, sourceTransaction, variableNames, result) {
    return C8O.crudBackend.ensurePublicSequence(crudBackendContext(), project, sequenceName, sourceTransaction, variableNames, result);
  }

  function callInternalSequence(sequenceName, argsMap) {
    var request = new HashMap();
    request.put("__project", "ConvertigoMCP");
    request.put("__sequence", sequenceName);
    request.put("__nolog", "true");
    var keys = Object.keys(argsMap || {});
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var value = argsMap[key];
      if (value === undefined || value === null) {
        continue;
      }
      if (typeof value === "object") {
        request.put(String(key), JSON.stringify(value));
      } else {
        request.put(String(key), String(value));
      }
    }
    var requester = null;
    try {
      requester = new InternalRequester(request, context.httpServletRequest);
    } catch (_ignoreHttpRequest) {
      requester = new InternalRequester(request);
    }
    var response = requester.processRequest();
    var root = response && response.getDocumentElement ? response.getDocumentElement() : response;
    var XMLUtils = Packages.com.twinsoft.convertigo.engine.util.XMLUtils;
    var parsed = JSON.parse(String(XMLUtils.XmlToJson(root, true, true)));
    var payload = parsed && parsed.document ? parsed.document : parsed;
    return payload && payload.result !== undefined ? payload.result : payload;
  }

  function normalizeStatus(value, fallback) {
    var text = trimmed(value || fallback || "");
    return text.length ? text : (fallback || "");
  }

  function isSuccessLikeStatus(value) {
    var status = normalizeStatus(value, "ok").toLowerCase();
    return status !== "error" && status !== "failed" && status !== "not_found";
  }

  function summarizeSaveResult(saveResult, result) {
    var safe = C8O.util.toJsonSafe ? C8O.util.toJsonSafe(saveResult, {
      warnings: ensureWarnings(result),
      path: "$.runtimeEvidence.projectSave"
    }) : saveResult;
    return {
      status: normalizeStatus(safe && safe.status, "ok")
    };
  }

  function summarizeStudioRefreshResult(refreshResult, targetQName, result, path) {
    var safe = C8O.util.toJsonSafe ? C8O.util.toJsonSafe(refreshResult, {
      warnings: ensureWarnings(result),
      path: path || "$.runtimeEvidence.studioRefresh"
    }) : refreshResult;
    return {
      status: normalizeStatus(safe && safe.status, "skipped"),
      target: trimmed(safe && safe.targetQName) || trimmed(safe && safe.qname) || trimmed(targetQName),
      refreshed: safe && safe.refreshed === true,
      refreshedQName: trimmed(safe && safe.refreshedQName),
      executed: safe && safe.executed === true,
      studioMode: safe && safe.studioMode === true
    };
  }

  function refreshStudioProjectTree(project, result, evidenceKey) {
    var projectQName = "";
    try {
      projectQName = project && project.getQName ? String(project.getQName()) : "";
    } catch (_ignoreProjectQName) {
      projectQName = "";
    }
    if (!projectQName.length) {
      addWarning(result, "Unable to refresh Studio tree: project QName is unavailable");
      return {
        status: "error",
        target: "",
        refreshed: false,
        refreshedQName: "",
        executed: false,
        studioMode: false
      };
    }
    var refreshResult = C8O.dbo.refreshStudioTreeByQName(projectQName, ensureWarnings(result));
    return summarizeStudioRefreshResult(
      refreshResult,
      projectQName,
      result,
      "$.runtimeEvidence." + trimmed(evidenceKey || "studioRefresh")
    );
  }

  function triggerUiSourceRefreshTargets(targets, result) {
    return C8O.crudUiRefresh.triggerUiSourceRefreshTargets(crudUiRefreshContext(), targets, result);
  }

  function collectManagedCrudCleanupQNames(ngxApp, expectedQNames) {
    return C8O.crudUiRefresh.collectManagedCrudCleanupQNames(crudUiRefreshContext(), ngxApp, expectedQNames);
  }

  function cleanupGeneratedIonicSources(projectName, ngxApp) {
    return C8O.crudUiRefresh.cleanupGeneratedIonicSources(crudUiRefreshContext(), projectName, ngxApp);
  }

  function purgeManagedGeneratedIonicSources(projectName, pageNames, sharedComponentNames) {
    return C8O.crudUiRefresh.purgeManagedGeneratedIonicSources(crudUiRefreshContext(), projectName, pageNames, sharedComponentNames);
  }

  function summarizeRequestableProof(payload, requestable, result) {
    return C8O.crudProof.summarizeRequestableProof(crudProofContext(), payload, requestable, result);
  }

  function requestablePayload(requestable, variables, result) {
    return C8O.crudProof.requestablePayload(crudProofContext(), requestable, variables, result);
  }

  function proofRequestable(requestable, variables, result) {
    return C8O.crudProof.proofRequestable(crudProofContext(), requestable, variables, result);
  }

  function firstSqlOutputRow(payload) {
    return C8O.crudProof.firstSqlOutputRow(crudProofContext(), payload);
  }

  function collectSqlOutputRows(payload) {
    return C8O.crudProof.collectSqlOutputRows(crudProofContext(), payload);
  }

  function probeViewer(viewerUrl, projectName, facadePrefix, hasCrmRelation, sequenceQNames, warnings) {
    return C8O.crudViewer.probeViewer(
      crudViewerContext(),
      viewerUrl,
      projectName,
      facadePrefix,
      hasCrmRelation,
      sequenceQNames,
      warnings
    );
  }

  function extractRowField(row, candidates) {
    return C8O.crudProof.extractRowField(crudProofContext(), row, candidates);
  }

  function dedupeStrings(values) {
    return C8O.crudProof.dedupeStrings(crudProofContext(), values);
  }

  function normalizeProofRequestablesInput(value) {
    return C8O.crudProof.normalizeProofRequestablesInput(crudProofContext(), value);
  }

  function resolveProofRequestableQName(requestable, projectName, connectorName) {
    return C8O.crudProof.resolveProofRequestableQName(crudProofContext(), requestable, projectName, connectorName);
  }

  function proofCheck(id, ok, message, target) {
    return C8O.crudProof.proofCheck(crudProofContext(), id, ok, message, target);
  }

  function pushMissing(result, value) {
    return C8O.crudProof.pushMissing(crudProofContext(), result, value);
  }

  function summarizeTreeApplyResult(treeResult, target, result) {
    var safe = C8O.util.toJsonSafe ? C8O.util.toJsonSafe(treeResult, {
      warnings: ensureWarnings(result),
      path: "$.runtimeEvidence.treeApply"
    }) : treeResult;
    return {
      status: normalizeStatus(safe && safe.status, "success"),
      target: target,
      durationMs: safe && safe.durationMs != null ? Number(safe.durationMs) : 0,
      summary: safe && safe.summary ? safe.summary : {}
    };
  }

  function firstBatchErrorMessage(batchResult) {
    if (batchResult && Array.isArray(batchResult.errors) && batchResult.errors.length) {
      var firstError = batchResult.errors[0];
      if (firstError && firstError.message) {
        return String(firstError.message);
      }
      return String(firstError);
    }
    if (batchResult && batchResult.stop && batchResult.stop.message) {
      return String(batchResult.stop.message);
    }
    return "Batch apply failed.";
  }

  function collectBatchWarnings(batchResult, result, prefix) {
    var warnings = batchResult && Array.isArray(batchResult.warnings) ? batchResult.warnings : [];
    var label = trimmed(prefix);
    for (var i = 0; i < warnings.length; i++) {
      addWarning(result, (label.length ? label + ": " : "") + String(warnings[i]));
    }
  }

  function operationSummary(batchResult, opId, target) {
    var operations = batchResult && Array.isArray(batchResult.operations) ? batchResult.operations : [];
    for (var i = 0; i < operations.length; i++) {
      var operation = operations[i];
      if (trimmed(operation && operation.opId) !== trimmed(opId)) {
        continue;
      }
      return {
        status: normalizeStatus(operation && operation.status, "success"),
        target: target,
        phase: trimmed(operation && operation.phase),
        appliedCount: Array.isArray(operation && operation.applied) ? operation.applied.length : 0
      };
    }
    return {
      status: "unknown",
      target: target
    };
  }

  function applicationQName(projectName) {
    return C8O.crudUiMeta.applicationQName(crudUiMetaContext(), projectName);
  }

  function ngxAppQName(projectName) {
    return C8O.crudUiMeta.ngxAppQName(crudUiMetaContext(), projectName);
  }

  function pageQName(projectName, entryPage) {
    return C8O.crudUiMeta.pageQName(crudUiMetaContext(), projectName, entryPage);
  }

  function findPageContentQName(projectName, entryPage) {
    return C8O.crudUiMeta.findPageContentQName(crudUiMetaContext(), projectName, entryPage);
  }

  function sharedComponentQName(projectName, componentName) {
    return C8O.crudUiMeta.sharedComponentQName(crudUiMetaContext(), projectName, componentName);
  }

  function entityPageName(entity) {
    return C8O.crudUiMeta.entityPageName(crudUiMetaContext(), entity);
  }

  function entityPageQName(projectName, entity) {
    return C8O.crudUiMeta.entityPageQName(crudUiMetaContext(), projectName, entity);
  }

  function entityPageContentQName(projectName, entity) {
    return C8O.crudUiMeta.entityPageContentQName(crudUiMetaContext(), projectName, entity);
  }

  function entityRouteSegment(entity) {
    return C8O.crudUiMeta.entityRouteSegment(crudUiMetaContext(), entity);
  }

  function entityRoutePath(entity) {
    return C8O.crudUiMeta.entityRoutePath(crudUiMetaContext(), entity);
  }

  function firstNonPrimaryField(entity) {
    return C8O.crudUiMeta.firstNonPrimaryField(crudUiMetaContext(), entity);
  }

  function secondPreviewField(entity) {
    return C8O.crudUiMeta.secondPreviewField(crudUiMetaContext(), entity);
  }

  function entityUiConfig(projectName, facadePrefix, entity) {
    return C8O.crudUiMeta.entityUiConfig(crudUiMetaContext(), projectName, facadePrefix, entity);
  }

  function normalizeUiEntities(rawEntities) {
    return C8O.crudUiKit.normalizeUiEntities(crudUiKitContext(), rawEntities);
  }

  function hydrateUiEntityFromFacade(projectName, facadePrefix, entity, result) {
    return C8O.crudUiKit.hydrateUiEntityFromFacade(crudUiKitContext(), projectName, facadePrefix, entity, result);
  }

  function hydrateUiEntitiesFromFacade(projectName, facadePrefix, entities, result) {
    return C8O.crudUiKit.hydrateUiEntitiesFromFacade(crudUiKitContext(), projectName, facadePrefix, entities, result);
  }

  function scriptLiteral(value) {
    return C8O.crudUi.scriptLiteral(crudUiContext(), value);
  }

  function compVariableNode(name, valueExpression, comment) {
    return C8O.crudUi.compVariableNode(crudUiContext(), name, valueExpression, comment);
  }

  function useVariableNode(name, valueExpression, comment) {
    return C8O.crudUi.useVariableNode(crudUiContext(), name, valueExpression, comment);
  }

  function controlVariableNode(name, valueExpression, comment) {
    return C8O.crudUi.controlVariableNode(crudUiContext(), name, valueExpression, comment);
  }

  function pageEventNode(name, viewEvent, children, comment) {
    return C8O.crudUi.pageEventNode(crudUiContext(), name, viewEvent, children, comment);
  }

  function buildPageScriptContent(projectName, entities, facadePrefix) {
    var facadeToken = trimmed(facadePrefix || "crud");
    var requestables = [];
    for (var i = 0; i < entities.length; i++) {
      requestables.push(facadeSequenceQName(projectName, facadeToken, entities[i], "count"));
      requestables.push(facadeSequenceQName(projectName, facadeToken, entities[i], "list"));
    }
    return [
      "/*Begin_c8o_PageImport*/",
      "/*End_c8o_PageImport*/",
      "/*Begin_c8o_PageDeclaration*/",
      "\tpublic crudFacadeRequestables: string[] = [" + requestables.map(function (requestable) { return scriptLiteral(requestable); }).join(", ") + "];",
      "/*End_c8o_PageDeclaration*/",
      "/*Begin_c8o_PageConstructor*/",
      "\t\tsetTimeout(() => {",
      "\t\t\tthis.loadCrudFacade();",
      "\t\t}, 0);",
      "/*End_c8o_PageConstructor*/",
      "/*Begin_c8o_PageFunction*/",
      "\tpublic loadCrudFacade(): Promise<any> {",
      "\t\tlet requestables = this.crudFacadeRequestables || [];",
      "\t\treturn Promise.all(requestables.map((requestable) => this['call'].apply(this, [requestable, {__localCache_priority: null, __localCache_ttl: 3000}, null, 5000, false]).catch((error: any) => {",
      "\t\t\tthis.c8o.log.debug('[MB] loadCrudFacade:', error && error.message ? error.message : error);",
      "\t\t\treturn false;",
      "\t\t})));",
      "\t}",
      "/*End_c8o_PageFunction*/",
      ""
    ].join("\n");
  }

  function callSequenceActionNode(name, requestableQName, variables, options) {
    return C8O.crudUi.callSequenceActionNode(crudUiContext(), name, requestableQName, variables, options);
  }

  function customAsyncActionNode(name, actionValue, comment) {
    return C8O.crudUi.customAsyncActionNode(crudUiContext(), name, actionValue, comment);
  }

  function smartTextNode(name, smartValue) {
    return C8O.crudUi.smartTextNode(crudUiContext(), name, smartValue);
  }

  function plainTextNode(name, value) {
    return C8O.crudUi.plainTextNode(crudUiContext(), name, value);
  }

  function scriptTextNode(name, valueExpression) {
    return C8O.crudUi.scriptTextNode(crudUiContext(), name, valueExpression);
  }

  function attributeNode(name, attrName, smartValue) {
    return C8O.crudUi.attributeNode(crudUiContext(), name, attrName, smartValue);
  }

  function labelNode(name, value) {
    return C8O.crudUi.labelNode(crudUiContext(), name, value);
  }

  function textElementNode(className, name, textNode) {
    return C8O.crudUi.textElementNode(crudUiContext(), className, name, textNode);
  }

  function schemaPreviewFields(entity, limit, includePrimary) {
    return C8O.crudUiMeta.schemaPreviewFields(crudUiMetaContext(), entity, limit, includePrimary);
  }

  function schemaFieldHint(field) {
    if (!field) {
      return "Field preview";
    }
    var parts = [];
    if (field.type) {
      parts.push(String(field.type));
    }
    if (field.required) {
      parts.push("required");
    }
    if (field.unique) {
      parts.push("unique");
    }
    if (field.primary) {
      parts.push("primary key");
    }
    return parts.length ? parts.join(" | ") : "Field preview";
  }

  function previewListItemNode(name, titleText, detailText) {
    var children = [labelNode(name + "Title", titleText)];
    if (trimmed(detailText).length) {
      children.push(labelNode(name + "Detail", detailText));
    }
    return {
      className: "ngx.components.UIDynamicElement#ListItem",
      name: name,
      children: children
    };
  }

  function previewListNode(name, fields, emptyText) {
    var listChildren = [];
    var entries = ensureArray(fields);
    if (!entries.length) {
      listChildren.push(previewListItemNode(name + "EmptyItem", emptyText || "No preview fields", ""));
    }
    for (var i = 0; i < entries.length; i++) {
      listChildren.push(previewListItemNode(
        name + "Item" + (i + 1),
        entries[i].label || entries[i].name,
        schemaFieldHint(entries[i])
      ));
    }
    return {
      className: "ngx.components.UIDynamicElement#List",
      name: name,
      children: listChildren
    };
  }

  function sharedSourceValue(projectName, priority, variableName) {
    return C8O.crudUi.sharedSourceValue(crudUiContext(), projectName, priority, variableName);
  }

  function sequenceSourceValue(projectName, sequenceName, path, options) {
    return C8O.crudUi.sequenceSourceValue(crudUiContext(), projectName, sequenceName, path, options);
  }

  function connectorRequestableQName(projectName, connectorName, requestableName) {
    return trimmed(projectName) + "." + trimmed(connectorName) + "." + trimmed(requestableName);
  }

  function globalSourceValue(projectName, path, options) {
    return C8O.crudUi.globalSourceValue(crudUiContext(), projectName, path, options);
  }

  function iterationSourceValue(projectName, inputExpression) {
    return C8O.crudUi.iterationSourceValue(crudUiContext(), projectName, inputExpression);
  }

  function facadeSequenceQName(projectName, facadePrefix, entity, verb) {
    return trimmed(projectName) + "." + trimmed(facadePrefix) + "_" + txName(entity, verb);
  }

  function sqlOutputFieldPath(field, rowIndex) {
    var currentRow = rowIndex == null ? 0 : Number(rowIndex);
    var outputKey = field && field.column ? String(field.column).toUpperCase() : "";
    return "?.sql_output?.[" + currentRow + "]" + (outputKey.length ? "?." + outputKey : "");
  }

  function buildUseSharedNode(sharedQName, name, variables) {
    return C8O.crudUi.buildUseSharedNode(crudUiContext(), sharedQName, name, variables);
  }

  function dashboardActionQName(projectName, actionName) {
    return ngxAppQName(projectName) + "." + trimmed(actionName);
  }

  function dashboardUiGlobals() {
    return C8O.crudUiState.dashboardUiGlobals(crudUiStateContext());
  }

  function entityPagesUiGlobals() {
    return C8O.crudUiState.entityPagesUiGlobals(crudUiStateContext());
  }

  function crmUiGlobals() {
    return C8O.crudUiState.crmUiGlobals(crudUiStateContext());
  }

  function statefulUiGlobals(variant) {
    return C8O.crudUiState.statefulUiGlobals(crudUiStateContext(), variant);
  }

  function everyQNameExists(qnames) {
    return C8O.crudUiState.everyQNameExists(crudUiStateContext(), qnames);
  }

  function statefulBootstrapStageQName(projectName, variant) {
    return C8O.crudUiState.statefulBootstrapStageQName(crudUiStateContext(), projectName, variant);
  }

  function statefulBootstrapRowQName(projectName, entryPage, variant) {
    return C8O.crudUiState.statefulBootstrapRowQName(crudUiStateContext(), projectName, entryPage, variant);
  }

  function workInProgressVisibilityExpression(globalStageExpression) {
    return C8O.crudUiState.workInProgressVisibilityExpression(crudUiStateContext(), globalStageExpression);
  }

  function buildStatefulBootstrapRow(projectName, globalStageExpression) {
    return C8O.crudUiState.buildStatefulBootstrapRow(crudUiStateContext(), projectName, globalStageExpression);
  }

  function dashboardRowsExpression(entityKeyExpression) {
    return C8O.crudUiState.dashboardRowsExpression(crudUiStateContext(), entityKeyExpression);
  }

  function dashboardCountExpression(entityKeyExpression) {
    return C8O.crudUiState.dashboardCountExpression(crudUiStateContext(), entityKeyExpression);
  }

  function dashboardSampleExpression(entityKeyExpression) {
    return C8O.crudUiState.dashboardSampleExpression(crudUiStateContext(), entityKeyExpression);
  }

  function crudSelectedExpression(entityKeyExpression) {
    return C8O.crudUiState.crudSelectedExpression(crudUiStateContext(), entityKeyExpression);
  }

  function crudDraftExpression(entityKeyExpression) {
    return C8O.crudUiState.crudDraftExpression(crudUiStateContext(), entityKeyExpression);
  }

  function crudModeExpression(entityKeyExpression) {
    return C8O.crudUiState.crudModeExpression(crudUiStateContext(), entityKeyExpression);
  }

  function crudEntityStatusExpression(entityKeyExpression) {
    return C8O.crudUiState.crudEntityStatusExpression(crudUiStateContext(), entityKeyExpression);
  }

  function crudEntityErrorExpression(entityKeyExpression) {
    return C8O.crudUiState.crudEntityErrorExpression(crudUiStateContext(), entityKeyExpression);
  }

  function dynamicFieldAccessExpression(targetExpression, fieldExpression, fallbackExpression) {
    return C8O.crudUiState.dynamicFieldAccessExpression(crudUiStateContext(), targetExpression, fieldExpression, fallbackExpression);
  }

  function buildDashboardSharedComponentsTree(projectName, entities, stage) {
    return C8O.crudUiShared.buildDashboardSharedComponentsTree(crudUiSharedContext(), projectName, entities, stage);
  }

  function actionRowsExpression(resultVar) {
    var target = trimmed(resultVar || "result");
    return "Array.isArray(" + target + "?.sql_output) ? " + target + ".sql_output : (Array.isArray(" + target + "?.transaction?.document?.sql_output) ? " + target + ".transaction.document.sql_output : [])";
  }

  function actionCallSnippet(requestableQName, variablesExpression, cacheTtl, threshold, noLoading) {
    return "await page['call'].apply(page, [" + scriptLiteral(trimmed(requestableQName)) + ", Object.assign({__localCache_priority: null, __localCache_ttl: " + String(cacheTtl == null ? 3000 : cacheTtl) + "}, " + (trimmed(variablesExpression) || "{}") + "), null, " + String(threshold == null ? 5000 : threshold) + ", " + (toBoolean(noLoading, true) ? "true" : "false") + "])";
  }

  function actionCallFromExpressionSnippet(requestableExpression, variablesExpression, cacheTtl, threshold, noLoading) {
    return "await page['call'].apply(page, [" + (trimmed(requestableExpression) || "''") + ", Object.assign({__localCache_priority: null, __localCache_ttl: " + String(cacheTtl == null ? 3000 : cacheTtl) + "}, " + (trimmed(variablesExpression) || "{}") + "), null, " + String(threshold == null ? 5000 : threshold) + ", " + (toBoolean(noLoading, true) ? "true" : "false") + "])";
  }

  function buildDashboardRefreshActionScript(entity, requestableQName) {
    return C8O.crudUiDashboard.buildDashboardRefreshActionScript(crudUiDashboardContext(), entity, requestableQName);
  }

  function buildDashboardBootstrapActionScript(projectName, facadePrefix, entities, stage) {
    return C8O.crudUiDashboard.buildDashboardBootstrapActionScript(crudUiDashboardContext(), projectName, facadePrefix, entities, stage);
  }

  function buildDashboardPageScriptContent(projectName, facadePrefix, entities, stage) {
    return C8O.crudUiDashboard.buildDashboardPageScriptContent(crudUiDashboardContext(), projectName, facadePrefix, entities, stage);
  }

  function buildDashboardActionStacksTree(projectName, facadePrefix, entities, stage) {
    return C8O.crudUiDashboard.buildDashboardActionStacksTree(crudUiDashboardContext(), projectName, facadePrefix, entities, stage);
  }

  function buildDashboardPageShellTree(projectName, entities, stage) {
    return C8O.crudUiPages.buildDashboardPageShellTree(crudUiPagesContext(), projectName, entities, stage);
  }

  function buildDashboardPageLoadTree(projectName, entryPage, facadePrefix, entities, stage) {
    return C8O.crudUiPages.buildDashboardPageLoadTree(crudUiPagesContext(), projectName, entryPage, facadePrefix, entities, stage);
  }

  function blankPageScriptContent() {
    return C8O.crudUiPages.blankPageScriptContent();
  }

  function entityPagesDefaultDraft(config) {
    return C8O.crudUiActions.entityPagesDefaultDraft(crudUiActionsContext(), config);
  }

  function entityPagesButtonNode(name, label, options, children) {
    var extra = options && typeof options === "object" ? options : {};
    var properties = {};
    if (extra.color) {
      properties.IonColor = {
        mode: "PLAIN",
        value: String(extra.color)
      };
    }
    if (extra.fill) {
      properties.IonFill = {
        mode: "PLAIN",
        value: String(extra.fill)
      };
    }
    if (extra.routerPath) {
      properties.LinkRouterPath = {
        mode: "PLAIN",
        value: String(extra.routerPath)
      };
      properties.LinkRouterDirection = {
        mode: "PLAIN",
        value: String(extra.routerDirection || "forward")
      };
    }
    return {
      className: "ngx.components.UIDynamicElement#Button",
      name: name,
      properties: properties,
      children: [plainTextNode(name + "Text", label)].concat(ensureArray(children))
    };
  }

  function buildEntityPagesSharedComponentsTree(projectName, entities, stage) {
    return C8O.crudUiShared.buildEntityPagesSharedComponentsTree(crudUiSharedContext(), projectName, entities, stage);
  }

  function buildEntityPagesBootstrapActionScript(projectName, facadePrefix, entities, stage) {
    return C8O.crudUiActions.buildEntityPagesBootstrapActionScript(crudUiActionsContext(), projectName, facadePrefix, entities, stage);
  }

  function buildEntityPagesRefreshActionScript(config) {
    return C8O.crudUiActions.buildEntityPagesRefreshActionScript(crudUiActionsContext(), config);
  }

  function buildEntityPagesOpenPageScript(config) {
    return C8O.crudUiActions.buildEntityPagesOpenPageScript(crudUiActionsContext(), config);
  }

  function buildEntityPagesBootstrapPageScript(config) {
    return C8O.crudUiActions.buildEntityPagesBootstrapPageScript(crudUiActionsContext(), config);
  }

  function buildEntityPagesSelectActionScript(config) {
    return C8O.crudUiActions.buildEntityPagesSelectActionScript(crudUiActionsContext(), config);
  }

  function buildEntityPagesNewActionScript(config) {
    return C8O.crudUiActions.buildEntityPagesNewActionScript(crudUiActionsContext(), config);
  }

  function buildEntityPagesCancelActionScript(config) {
    return C8O.crudUiActions.buildEntityPagesCancelActionScript(crudUiActionsContext(), config);
  }

  function buildEntityPagesSaveActionScript(config) {
    return C8O.crudUiActions.buildEntityPagesSaveActionScript(crudUiActionsContext(), config);
  }

  function buildEntityPagesDeleteActionScript(config) {
    return C8O.crudUiActions.buildEntityPagesDeleteActionScript(crudUiActionsContext(), config);
  }

  function buildEntityPagesActionStacksTree(projectName, facadePrefix, entities, stage) {
    return C8O.crudUiActions.buildEntityPagesActionStacksTree(crudUiActionsContext(), projectName, facadePrefix, entities, stage);
  }

  function buildEntityPagesLandingShellTree(projectName, entities, stage) {
    return C8O.crudUiPages.buildEntityPagesLandingShellTree(crudUiPagesContext(), projectName, entities, stage);
  }

  function buildEntityPageShellTree(projectName, entity, stage) {
    return C8O.crudUiPages.buildEntityPageShellTree(crudUiPagesContext(), projectName, entity, stage);
  }

  function appendEntityPageRows(projectName, entity, shellTree, stage) {
    return C8O.crudUiPages.appendEntityPageRows(crudUiPagesContext(), projectName, entity, shellTree, stage);
  }

  function buildEntityPageRootTree(entity) {
    return C8O.crudUiPages.buildEntityPageRootTree(crudUiPagesContext(), entity);
  }

  function buildEntityPagesLandingLoadTree(projectName, entryPage) {
    return C8O.crudUiPages.buildEntityPagesLandingLoadTree(crudUiPagesContext(), projectName, entryPage);
  }

  function buildEntityPageLoadTree(projectName, entity) {
    return C8O.crudUiPages.buildEntityPageLoadTree(crudUiPagesContext(), projectName, entity);
  }

  function crmActionQName(projectName, actionName) {
    return ngxAppQName(projectName) + "." + trimmed(actionName);
  }

  function crmHeaderComponentTree(componentName, projectName) {
    return C8O.crudUiCrm.crmHeaderComponentTree(crudUiCrmContext(), componentName, projectName);
  }

  function crmWorkInProgressCardTree(componentName) {
    return C8O.crudUiCrm.crmWorkInProgressCardTree(crudUiCrmContext(), componentName);
  }

  function crmLoadingStateTree(componentName) {
    return C8O.crudUiCrm.crmLoadingStateTree(crudUiCrmContext(), componentName);
  }

  function crmErrorRetryStateTree(componentName, projectName) {
    return C8O.crudUiCrm.crmErrorRetryStateTree(crudUiCrmContext(), componentName, projectName);
  }

  function companyTableTreeGlobal(projectName, componentName) {
    return C8O.crudUiCrm.companyTableTreeGlobal(crudUiCrmContext(), projectName, componentName);
  }

  function companyCardTreeGlobal(componentName) {
    return C8O.crudUiCrm.companyCardTreeGlobal(crudUiCrmContext(), componentName);
  }

  function contactTableTreeGlobal(projectName, componentName) {
    return C8O.crudUiCrm.contactTableTreeGlobal(crudUiCrmContext(), projectName, componentName);
  }

  function contactCardTreeGlobal(projectName, componentName) {
    return C8O.crudUiCrm.contactCardTreeGlobal(crudUiCrmContext(), projectName, componentName);
  }

  function buildCrmSharedComponentsTree(projectName, stage) {
    return C8O.crudUiCrm.buildCrmSharedComponentsTree(crudUiCrmContext(), projectName, stage);
  }

  function buildCrmActionStacksTree(projectName, facadePrefix, stage) {
    return C8O.crudUiCrmActions.buildCrmActionStacksTree(crudUiCrmActionsContext(), projectName, facadePrefix, stage);
  }

  function buildCrmMasterDetailPageShellTree(projectName, stage) {
    return C8O.crudUiCrm.buildCrmMasterDetailPageShellTree(crudUiCrmContext(), projectName, stage);
  }

  function buildCrmPageLoadTree(projectName, entryPage, stage) {
    return C8O.crudUiCrm.buildCrmPageLoadTree(crudUiCrmContext(), projectName, entryPage, stage);
  }

  function ifDirectiveNode(name, expression, children) {
    return C8O.crudUi.ifDirectiveNode(crudUiContext(), name, expression, children);
  }

  function iterationDirectiveNode(name, projectName, itemName, inputExpression, children) {
    return C8O.crudUi.iterationDirectiveNode(crudUiContext(), name, projectName, itemName, inputExpression, children);
  }

  function sourceDirectiveNode(name, itemName, sourceValue, children, indexName) {
    return C8O.crudUi.sourceDirectiveNode(crudUiContext(), name, itemName, sourceValue, children, indexName);
  }

  function controlEventNode(name, children, options) {
    return C8O.crudUi.controlEventNode(crudUiContext(), name, children, options);
  }

  function stackVariableNode(name, defaultValue) {
    return C8O.crudUi.stackVariableNode(crudUiContext(), name, defaultValue);
  }

  function setGlobalActionNode(name, propertyName, valueExpression) {
    return C8O.crudUi.setGlobalActionNode(crudUiContext(), name, propertyName, valueExpression);
  }

  function setLocalActionNode(name, propertyName, valueExpression) {
    return C8O.crudUi.setLocalActionNode(crudUiContext(), name, propertyName, valueExpression);
  }

  function dynamicInvokeNode(name, stackQName, variables) {
    return C8O.crudUi.dynamicInvokeNode(crudUiContext(), name, stackQName, variables);
  }

  function actionStackNode(name, variables, children, comment) {
    return C8O.crudUi.actionStackNode(crudUiContext(), name, variables, children, comment);
  }

  function auditUiTreePayload(uiTree) {
    return C8O.crudUiAudit.auditUiTreePayload(uiTree);
  }

  function collectSharedRefs(node, refs) {
    return C8O.crudUiAudit.collectSharedRefs(node, refs);
  }

  function upsertNgxCrudKit(options) {
    return C8O.crudUiKit.upsertNgxCrudKit(crudUiKitContext(), options || {});
  }

  function buildCrudStatus(spec, connector, result) {
    return C8O.crudProof.buildCrudStatus(crudProofContext(), spec, connector, result);
  }

  function upsertCrud(options) {
    var result = C8O.crudBackend.upsertCrud(crudBackendContext(), options || {});
    return C8O.util.toJsonSafe ? C8O.util.toJsonSafe(result, { warnings: ensureWarnings(result), path: "$" }) : result;
  }

  function inspectCrudStatus(options) {
    return C8O.crudProof.inspectCrudStatus(crudProofContext(), options || {});
  }

  function crudStatus(options) {
    var status = C8O.crudProof.crudStatus(crudProofContext(), options || {});
    return C8O.util.toJsonSafe ? C8O.util.toJsonSafe(status, { warnings: ensureWarnings(status), path: "$" }) : status;
  }

  function crudProof(options) {
    return C8O.crudProof.crudProof(crudProofContext(), options || {});
  }

  C8O.crud.normalizeSpec = normalizeSpec;
  C8O.crud.upsertCrud = function (options) {
    return upsertCrud(options || {});
  };
  C8O.crud.crudStatus = function (options) {
    return crudStatus(options || {});
  };
  C8O.crud.crudProof = function (options) {
    return crudProof(options || {});
  };
  C8O.crud.upsertNgxCrudKit = function (options) {
    var result = upsertNgxCrudKit(options || {});
    return C8O.util.toJsonSafe ? C8O.util.toJsonSafe(result, { warnings: ensureWarnings(result), path: "$" }) : result;
  };
})();
