include("js/util.js");
include("js/databaseobject.js");
include("js/databaseobject_batch.js");
include("js/marketplace.js");
include("js/crud_seed.js");
include("js/crud_spec.js");
include("js/crud_runtime.js");
include("js/crud_backend.js");
include("js/crud_ui_nodes.js");
include("js/crud_ui_state.js");
include("js/crud_ui_shared.js");
include("js/crud_ui_pages.js");
include("js/crud_ui_actions.js");
include("js/crud_ui_dashboard.js");
include("js/crud_ui_crm.js");
include("js/crud_ui_crm_actions.js");
include("js/crud_ui_refresh.js");
include("js/crud_ui_audit.js");
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
    var text = trimmed(value);
    if (!text.length) {
      return "";
    }
    return text.substring(0, 1).toUpperCase() + text.substring(1);
  }

  function pascalize(value) {
    var text = trimmed(value);
    if (!text.length) {
      return "";
    }
    var parts = String(text).split(/[^A-Za-z0-9]+/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var part = trimmed(parts[i]);
      if (!part.length) {
        continue;
      }
      out.push(ucfirst(part));
    }
    return out.join("");
  }

  function singularize(name) {
    var text = trimmed(name);
    if (!text.length) {
      return text;
    }
    if (/ies$/i.test(text)) {
      return text.substring(0, text.length - 3) + "y";
    }
    if (/ses$/i.test(text)) {
      return text.substring(0, text.length - 2);
    }
    if (/s$/i.test(text) && text.length > 1) {
      return text.substring(0, text.length - 1);
    }
    return text;
  }

  function pluralize(name) {
    var text = trimmed(name);
    if (!text.length) {
      return text;
    }
    if (/y$/i.test(text)) {
      return text.substring(0, text.length - 1) + "ies";
    }
    if (/s$/i.test(text)) {
      return text;
    }
    return text + "s";
  }

  function semanticToken(value) {
    var text = trimmed(value);
    if (!text.length) {
      return "";
    }
    try {
      var Normalizer = Packages.java.text.Normalizer;
      var Form = Packages.java.text.Normalizer.Form;
      text = String(Normalizer.normalize(text, Form.NFD));
    } catch (_ignoreNormalizer) {}
    text = text
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "")
      .toLowerCase();
    return text;
  }

  function semanticFieldToken(field) {
    var parts = [];
    if (field) {
      parts.push(field.column);
      parts.push(field.name);
      parts.push(field.label);
    }
    return semanticToken(parts.join(" "));
  }

  function semanticEntityToken(entity) {
    var parts = [];
    if (entity) {
      parts.push(entity.name);
      parts.push(entity.singular);
      parts.push(entity.label);
      parts.push(entity.displayLabel);
      parts.push(entity.routeSegment);
    }
    return semanticToken(parts.join(" "));
  }

  function tokenMatches(token, patterns) {
    var text = semanticToken(token);
    var values = ensureArray(patterns);
    for (var i = 0; i < values.length; i++) {
      var pattern = semanticToken(values[i]);
      if (pattern.length && text.indexOf(pattern) !== -1) {
        return true;
      }
    }
    return false;
  }

  function humanizeIdentifier(value) {
    var text = trimmed(value).replace(/[_\-]+/g, " ");
    if (!text.length) {
      return "";
    }
    return text.replace(/\b([a-z])/g, function (_all, char) {
      return String(char).toUpperCase();
    });
  }

  function normalizeEntityNames(rawEntity, fallbackName) {
    var raw = rawEntity || {};
    var baseName = optionalNormalizedIdentifier(raw.name || raw.entity || fallbackName || "") || "unnamed";
    var explicitPlural = optionalNormalizedIdentifier(raw.plural || "");
    var explicitSingular = optionalNormalizedIdentifier(raw.singular || "");
    var pluralName = explicitPlural || (explicitSingular.length ? pluralize(explicitSingular) : pluralize(baseName));
    var singularName = explicitSingular || singularize(pluralName);
    var routeSegment = normalizedIdentifier(raw.routeSegment || pluralName).replace(/_/g, "-").toLowerCase();
    var displayLabel = trimmed(raw.displayLabel || raw.label || humanizeIdentifier(pluralName));
    return {
      name: pluralName,
      singular: singularName,
      routeSegment: routeSegment,
      displayLabel: displayLabel
    };
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
    return trimmed(projectName) + ".Application";
  }

  function ngxAppQName(projectName) {
    return applicationQName(projectName) + ".NgxApp";
  }

  function pageQName(projectName, entryPage) {
    return ngxAppQName(projectName) + "." + trimmed(entryPage || "Page");
  }

  function findPageContentQName(projectName, entryPage) {
    return pageQName(projectName, entryPage) + ".Content";
  }

  function sharedComponentQName(projectName, componentName) {
    return ngxAppQName(projectName) + "." + trimmed(componentName);
  }

  function entityPageName(entity) {
    return pascalize(entity && entity.name) + "Page";
  }

  function entityPageQName(projectName, entity) {
    return pageQName(projectName, entityPageName(entity));
  }

  function entityPageContentQName(projectName, entity) {
    return findPageContentQName(projectName, entityPageName(entity));
  }

  function entityRouteSegment(entity) {
    var configured = trimmed(entity && entity.routeSegment);
    if (configured.length) {
      return normalizedIdentifier(configured).replace(/_/g, "-").toLowerCase();
    }
    return normalizedIdentifier(entity && entity.name).replace(/_/g, "-").toLowerCase();
  }

  function entityRoutePath(entity) {
    return "/" + entityRouteSegment(entity);
  }

  function firstNonPrimaryField(entity) {
    var preview = schemaPreviewFields(entity, 1, false);
    return preview.length ? preview[0] : (entity && entity.primaryField ? entity.primaryField : null);
  }

  function secondPreviewField(entity) {
    var preview = schemaPreviewFields(entity, 2, false);
    return preview.length > 1 ? preview[1] : (preview[0] || entity.primaryField || null);
  }

  function entityUiConfig(projectName, facadePrefix, entity) {
    var editableFields = ensureArray(entity && entity.fields).filter(function (field) {
      return field && field.primary !== true;
    });
    var relationFields = editableFields.filter(function (field) {
      return field && field.references;
    });
    var uniqueFields = editableFields.filter(function (field) {
      return field && field.unique === true;
    }).map(function (field) {
      return field.column;
    });
    return {
      key: entity.name,
      singular: entity.singular,
      label: entity.label,
      pageName: entityPageName(entity),
      routeSegment: entityRouteSegment(entity),
      routePath: entityRoutePath(entity),
      primaryColumn: (entity.primaryField && entity.primaryField.column) || "id",
      primaryLabel: (entity.primaryField && entity.primaryField.label) || "Id",
      previewPrimaryColumn: ((firstNonPrimaryField(entity) || entity.primaryField || {}).column) || "id",
      previewSecondaryColumn: ((secondPreviewField(entity) || firstNonPrimaryField(entity) || entity.primaryField || {}).column) || "id",
      listRequestable: facadeSequenceQName(projectName, facadePrefix, entity, "list"),
      readRequestable: facadeSequenceQName(projectName, facadePrefix, entity, "read"),
      createRequestable: facadeSequenceQName(projectName, facadePrefix, entity, "create"),
      updateRequestable: facadeSequenceQName(projectName, facadePrefix, entity, "update"),
      deleteRequestable: facadeSequenceQName(projectName, facadePrefix, entity, "delete"),
      editableFields: editableFields.map(function (field) {
        return {
          name: field.name,
          column: field.column,
          label: field.label,
          type: field.type,
          required: field.required === true,
          unique: field.unique === true,
          references: field.references ? clone(field.references) : null
        };
      }),
      relationFields: relationFields.map(function (field) {
        return {
          column: field.column,
          label: field.label,
          entity: pluralize(normalizedIdentifier(field.references.entity)),
          targetField: normalizedIdentifier(field.references.field || "id")
        };
      }),
      uniqueFields: uniqueFields
    };
  }

  function normalizeUiEntities(rawEntities) {
    var entries = ensureArray(rawEntities);
    var normalized = [];
    for (var i = 0; i < entries.length; i++) {
      var raw = entries[i] || {};
      var naming = normalizeEntityNames(raw, "entity_" + (i + 1));
      var entityName = naming.name;
      var fields = [];
      var rawFields = ensureArray(raw.fields);
      for (var fieldIndex = 0; fieldIndex < rawFields.length; fieldIndex++) {
        var rawField = rawFields[fieldIndex] || {};
        var rawFieldName = trimmed(rawField.name || rawField.column || "");
        if (!rawFieldName.length) {
          continue;
        }
        fields.push({
          name: rawFieldName,
          column: normalizedIdentifier(rawField.column || rawFieldName),
          label: trimmed(rawField.label || rawFieldName),
          type: trimmed(rawField.type || "VARCHAR(255)"),
          primary: toBoolean(rawField.primary, false),
          unique: toBoolean(rawField.unique, false),
          required: rawField.required == null ? false : toBoolean(rawField.required, false),
          references: rawField.references && typeof rawField.references === "object" ? clone(rawField.references) : null
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
  }

  function fieldLabelFromKey(rawKey) {
    var text = trimmed(rawKey);
    if (!text.length) {
      return "Field";
    }
    return text
      .replace(/_/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .replace(/^\w/, function (char) { return char.toUpperCase(); });
  }

  function needsUiFieldHydration(entity) {
    var fields = ensureArray(entity && entity.fields);
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

  function hydrateUiEntityFromFacade(projectName, facadePrefix, entity, result) {
    if (!entity || !needsUiFieldHydration(entity)) {
      return entity;
    }
    var requestable = facadeSequenceQName(projectName, facadePrefix, entity, "list");
    var payload = requestablePayload(requestable, {}, result);
    var rows = collectSqlOutputRows(payload);
    var firstRow = rows.length && rows[0] && typeof rows[0] === "object" ? rows[0] : null;
    if (!firstRow) {
      return entity;
    }
    var existingByColumn = {};
    var existingFields = ensureArray(entity.fields);
    for (var index = 0; index < existingFields.length; index++) {
      var existingField = existingFields[index];
      existingByColumn[normalizedIdentifier(existingField && existingField.column)] = existingField;
    }
    var hydratedFields = [];
    var rowKeys = Object.keys(firstRow);
    for (var keyIndex = 0; keyIndex < rowKeys.length; keyIndex++) {
      var rawKey = trimmed(rowKeys[keyIndex]);
      if (!rawKey.length) {
        continue;
      }
      var column = normalizedIdentifier(rawKey);
      var current = existingByColumn[column] || null;
      hydratedFields.push({
        name: current && trimmed(current.name).length ? current.name : rawKey,
        column: column,
        label: current && trimmed(current.label).length ? current.label : fieldLabelFromKey(rawKey),
        type: current && trimmed(current.type).length ? current.type : "VARCHAR(255)",
        primary: current ? toBoolean(current.primary, false) : column === "id",
        unique: current ? toBoolean(current.unique, false) : false,
        required: current ? toBoolean(current.required, false) : false,
        references: current && current.references ? clone(current.references) : null
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
      fields: hydratedFields,
      primaryField: primaryField
    };
  }

  function hydrateUiEntitiesFromFacade(projectName, facadePrefix, entities, result) {
    var hydrated = [];
    var list = ensureArray(entities);
    for (var i = 0; i < list.length; i++) {
      hydrated.push(hydrateUiEntityFromFacade(projectName, facadePrefix, list[i], result));
    }
    return hydrated;
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
    var fields = ensureArray(entity && entity.fields);
    var ranked = [];
    function fieldPriority(field) {
      var token = semanticFieldToken(field);
      if (!token.length) {
        return 900;
      }
      if (field.primary) {
        return includePrimary ? 800 : 1000;
      }
      if (field.references || /(^|_)(id|.*_id)$/.test(normalizedIdentifier(field && (field.column || field.name)))) {
        return 300;
      }
      var preferred = [
        ["nomcommun", "commonname", "name", "nom", "title", "titre"],
        ["nomscientifique", "scientificname", "firstname", "prenom", "lastname", "surname"],
        ["email", "phone", "telephone"],
        ["city", "ville", "region", "country", "pays"],
        ["industry", "secteur", "category", "categorie", "habitat", "usage"],
        ["comment", "note", "description", "vote", "status", "statut"]
      ];
      for (var p = 0; p < preferred.length; p++) {
        if (tokenMatches(token, preferred[p])) {
          return p;
        }
      }
      if (field.unique === true) {
        return 120;
      }
      return 180;
    }
    for (var i = 0; i < fields.length; i++) {
      if (!includePrimary && fields[i].primary) {
        continue;
      }
      ranked.push({
        field: fields[i],
        order: i,
        priority: fieldPriority(fields[i])
      });
    }
    ranked.sort(function (left, right) {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }
      return left.order - right.order;
    });
    var preview = [];
    for (var index = 0; index < ranked.length; index++) {
      preview.push(ranked[index].field);
      if (limit > 0 && preview.length >= limit) {
        break;
      }
    }
    if (!preview.length && includePrimary && entity && entity.primaryField) {
      preview.push(entity.primaryField);
    }
    return preview;
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
    var startedAt = nowMillis();
    var result = {
      status: "success",
      project: "",
      sharedComponents: [],
      pageTargets: [],
      runtimeEvidence: {},
      warnings: []
    };
    var projectName = trimmed(options.project);
    if (!projectName.length) {
      throw new Error("project is required");
    }
    result.project = projectName;
    var project = findProjectByName(projectName);
    if (!project) {
      throw new Error("Project " + projectName + " is not loaded");
    }
    var entities = hydrateUiEntitiesFromFacade(projectName, trimmed(options.facadePrefix || "crud"), normalizeUiEntities(options.entities), result);
    var entryPage = trimmed(options.entryPage || "Page");
    var facadePrefix = trimmed(options.facadePrefix || "crud");
    var variant = trimmed(options.variant || "entity-pages").toLowerCase() || "entity-pages";
    var stage = trimmed(options.stage || "final").toLowerCase() || "final";
    var isMasterDetail = variant === "master-detail";
    var isEntityPages = variant === "entity-pages";
    var pageQNameValue = pageQName(projectName, entryPage);
    var contentQName = findPageContentQName(projectName, entryPage);
    var ngxApp = C8O.dbo.resolve(ngxAppQName(projectName), { optional: true });
    var pageDbo = C8O.dbo.resolve(pageQNameValue, { optional: true });
    var contentDbo = C8O.dbo.resolve(contentQName, { optional: true });
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
    var sharedBuildStartedAt = nowMillis();
    var sharedComponents = isMasterDetail
      ? buildCrmSharedComponentsTree(projectName, stage)
      : (isEntityPages ? buildEntityPagesSharedComponentsTree(projectName, entities, stage) : buildDashboardSharedComponentsTree(projectName, entities, stage));
    var sharedActions = isMasterDetail
      ? buildCrmActionStacksTree(projectName, facadePrefix, stage)
      : (isEntityPages ? buildEntityPagesActionStacksTree(projectName, facadePrefix, entities, stage) : buildDashboardActionStacksTree(projectName, facadePrefix, entities, stage));
    var reuseExistingSharedActions = stage === "final" && everyQNameExists(sharedActions.qnames);
    var sharedActionChildren = reuseExistingSharedActions ? [] : ensureArray(sharedActions.tree.children);
    setDuration(timings, "buildSharedComponentsMs", sharedBuildStartedAt);
    result.runtimeEvidence.sharedComponentsRequested = ensureArray(sharedComponents.tree.children).length;
    result.runtimeEvidence.sharedComponentTreeNodeCount = countTreeNodes(sharedComponents.tree);
    result.runtimeEvidence.sharedActionsRequested = ensureArray(sharedActions.tree.children).length;
    result.runtimeEvidence.sharedActionTreeNodeCount = countTreeNodes(sharedActions.tree);
    result.runtimeEvidence.sharedActionsReused = reuseExistingSharedActions;
    result.runtimeEvidence.uiGlobals = statefulUiGlobals(variant);
    result.runtimeEvidence.workInProgressMode = "stateful-visibility";
    var pageShellStartedAt = nowMillis();
    var pageShellTree = isMasterDetail
      ? buildCrmMasterDetailPageShellTree(projectName, stage)
      : (isEntityPages ? buildEntityPagesLandingShellTree(projectName, entities, stage) : buildDashboardPageShellTree(projectName, entities, stage));
    setDuration(timings, "buildPageShellTreeMs", pageShellStartedAt);
    result.runtimeEvidence.pageShellTreeNodeCount = countTreeNodes(pageShellTree);
    var pageLoadStartedAt = nowMillis();
    var pageLoadTree = isMasterDetail
      ? buildCrmPageLoadTree(projectName, entryPage, stage)
      : (isEntityPages ? buildEntityPagesLandingLoadTree(projectName, entryPage) : buildDashboardPageLoadTree(projectName, entryPage, facadePrefix, entities, stage));
    setDuration(timings, "buildPageLoadTreeMs", pageLoadStartedAt);
    result.runtimeEvidence.pageLoadTreeNodeCount = countTreeNodes(pageLoadTree.tree);
    var entityPageRoots = [];
    var entityPageShells = [];
    var entityPageLoads = [];
    if (isEntityPages) {
      for (var entityIndex = 0; entityIndex < entities.length; entityIndex++) {
        var currentEntity = entities[entityIndex];
        entityPageRoots.push(buildEntityPageRootTree(currentEntity));
        var entityShellTree = buildEntityPageShellTree(projectName, currentEntity, stage);
        appendEntityPageRows(projectName, currentEntity, entityShellTree, stage);
        entityPageShells.push({
          entity: currentEntity.name,
          qname: entityPageContentQName(projectName, currentEntity),
          tree: entityShellTree
        });
        entityPageLoads.push({
          entity: currentEntity.name,
          tree: buildEntityPageLoadTree(projectName, currentEntity)
        });
      }
    }
    result.runtimeEvidence.pageNames = [entryPage].concat(entityPageRoots.map(function (pageTree) {
      return pageTree.name;
    }));
    result.runtimeEvidence.pageRoutes = ["/home"].concat(entityPageRoots.map(function (pageTree, index) {
      return entityRoutePath(entities[index]);
    }));
    result.runtimeEvidence.entityPages = entityPageRoots.map(function (pageTree, index) {
      return {
        entity: entities[index].name,
        pageName: pageTree.name,
        route: entityRoutePath(entities[index]),
        contentQName: entityPageShells[index] ? entityPageShells[index].qname : "",
        sharedRefs: entityPageShells[index] ? collectSharedRefs(entityPageShells[index].tree, []) : []
      };
    });
    var expectedManagedCrudQNames = [pageQName(projectName, entryPage)]
      .concat(sharedComponents.qnames || [])
      .concat(sharedActions.qnames || [])
      .concat(entityPageLoads.map(function (item) { return item.tree.qname; }));
    var cleanupQNames = collectManagedCrudCleanupQNames(ngxApp, expectedManagedCrudQNames);
    result.runtimeEvidence.cleanupTargets = cleanupQNames;
    var batchApplyStartedAt = nowMillis();
    var pageMutationOperations = [
      {
        type: "upsertTree",
        opId: "entry_page_load",
        qname: pageQName(projectName, entryPage),
        strategy: {
          replaceOnClassMismatch: true,
          pruneMissing: false,
          reorder: false
        },
        patch: {
          properties: pageLoadTree.tree.properties || {},
          children: ensureArray(pageLoadTree.tree.children)
        }
      }
    ];
    var legacyPageLoadQNames = ensureArray(pageLoadTree.legacyQNames);
    for (var legacyIndex = 0; legacyIndex < legacyPageLoadQNames.length; legacyIndex++) {
      var legacyQName = trimmed(legacyPageLoadQNames[legacyIndex]);
      if (!legacyQName.length) {
        continue;
      }
      if (!C8O.dbo.resolve(legacyQName, { optional: true })) {
        continue;
      }
      pageMutationOperations.unshift({
        type: "delete",
        opId: "delete_" + normalizedIdentifier(legacyQName),
        qname: legacyQName
      });
    }
    var cleanupOperations = cleanupQNames.map(function (qname) {
      return {
        type: "delete",
        opId: "cleanup_" + normalizedIdentifier(qname),
        qname: qname
      };
    });
    var batchOperations = cleanupOperations.concat([
      {
        type: "upsertTree",
        opId: "shared_components",
        qname: ngxAppQName(projectName),
        strategy: {
          replaceOnClassMismatch: true,
          pruneMissing: false,
          reorder: false
        },
        patch: {
          children: ensureArray(sharedComponents.tree.children).concat(sharedActionChildren).concat(entityPageRoots)
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
          children: ensureArray(pageShellTree.children)
        }
      }
    ]).concat(pageMutationOperations);
    for (var pageIndex = 0; pageIndex < entityPageShells.length; pageIndex++) {
      batchOperations.push(
        {
          type: "upsertTree",
          opId: "entity_page_" + normalizedIdentifier(entityPageShells[pageIndex].entity),
          qname: entityPageShells[pageIndex].qname,
          strategy: {
            replaceOnClassMismatch: true,
            pruneMissing: true,
            reorder: false
          },
          patch: {
            properties: entityPageShells[pageIndex].tree.properties || {},
            children: ensureArray(entityPageShells[pageIndex].tree.children)
          }
        },
        {
          type: "upsertTree",
          opId: "entity_page_load_" + normalizedIdentifier(entityPageLoads[pageIndex].entity),
          qname: entityPageLoads[pageIndex].tree.qname,
          strategy: {
            replaceOnClassMismatch: true,
            pruneMissing: false,
            reorder: false
          },
          patch: {
            properties: entityPageLoads[pageIndex].tree.tree.properties || {},
            children: ensureArray(entityPageLoads[pageIndex].tree.tree.children)
          }
        }
      );
    }
    if (reuseExistingSharedActions) {
      var buildStageQName = statefulBootstrapStageQName(projectName, variant);
      if (C8O.dbo.resolve(buildStageQName, { optional: true })) {
        batchOperations.push({
          type: "setProperties",
          opId: "stateful_build_stage",
          qname: buildStageQName,
          properties: {
            Value: {
              mode: "SCRIPT",
              value: scriptLiteral(stage)
            }
          }
        });
      } else {
        addWarning(result, "Unable to reuse stateful actions: build stage node not found for " + buildStageQName);
      }
    }
    var batchApplyResult = C8O.dbo.batchApply({
      target: ngxAppQName(projectName),
      strict: true,
      onError: "stop",
      autoSave: false,
      triggerMobileBuilder: false,
      operations: batchOperations
    });
    setDuration(timings, "batchTreeApplyMs", batchApplyStartedAt);
    collectBatchWarnings(batchApplyResult, result, "batchApply");
    if (!batchApplyResult || batchApplyResult.status === "failed" || (batchApplyResult.errors && batchApplyResult.errors.length)) {
      throw new Error(firstBatchErrorMessage(batchApplyResult));
    }
    result.sharedComponents = sharedComponents.qnames.slice();
    result.runtimeEvidence.batchApply = summarizeTreeApplyResult(batchApplyResult, ngxAppQName(projectName), result);
    result.runtimeEvidence.sharedComponentsApply = operationSummary(batchApplyResult, "shared_components", ngxAppQName(projectName));
    result.runtimeEvidence.treeApply = operationSummary(batchApplyResult, "entry_page", contentQName);
    result.runtimeEvidence.pageLoadApply = operationSummary(batchApplyResult, "entry_page_load", pageQName(projectName, entryPage));
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
    var sharedBindingsStartedAt = nowMillis();
    var sharedBindingOperations = [];
    if (sharedBindingOperations.length) {
      var sharedBindingsBatch = C8O.dbo.batchApply({
        target: ngxAppQName(projectName),
        strict: true,
        onError: "stop",
        autoSave: false,
        triggerMobileBuilder: false,
        operations: sharedBindingOperations
      });
      collectBatchWarnings(sharedBindingsBatch, result, "sharedBindings");
      if (!sharedBindingsBatch || sharedBindingsBatch.status === "failed" || (sharedBindingsBatch.errors && sharedBindingsBatch.errors.length)) {
        throw new Error(firstBatchErrorMessage(sharedBindingsBatch));
      }
      result.runtimeEvidence.sharedBindingsApply = summarizeTreeApplyResult(sharedBindingsBatch, ngxAppQName(projectName), result);
      var bindingsSummary = sharedBindingsBatch.summary || {};
      result.runtimeEvidence.mutationCounts.updated += Number(bindingsSummary.updatedProperties || 0);
    } else {
      result.runtimeEvidence.sharedBindingsApply = {
        status: "skipped",
        target: ngxAppQName(projectName)
      };
    }
    setDuration(timings, "configureSharedBindingsMs", sharedBindingsStartedAt);
    result.pageTargets.push(contentQName);
    for (var targetIndex = 0; targetIndex < entityPageShells.length; targetIndex++) {
      result.pageTargets.push(entityPageShells[targetIndex].qname);
    }
    result.runtimeEvidence.entryPage = entryPage;
    result.runtimeEvidence.facadePrefix = facadePrefix;
    result.runtimeEvidence.pageSharedRefs = collectSharedRefs(pageShellTree, []);
    result.runtimeEvidence.workInProgressSharedRefPresent = result.runtimeEvidence.pageSharedRefs.indexOf(sharedComponentQName(projectName, "WorkInProgressCard")) !== -1;
    try {
      var uiAuditStartedAt = nowMillis();
      var uiTree = callInternalSequence("tools_databaseobject_tree_get", {
        target: contentQName,
        childrenDepth: 5,
        properties: "none",
        limit: 320
      });
      setDuration(timings, "uiAuditTreeGetMs", uiAuditStartedAt);
      var uiAudit = auditUiTreePayload(uiTree);
      result.runtimeEvidence.shellVisible = uiAudit.visibleShellPresent;
      result.runtimeEvidence.starterDominant = uiAudit.starterDominant;
      result.runtimeEvidence.liveBindingPresent = uiAudit.liveBindingPresent;
    } catch (uiInspectError) {
      result.status = "partial";
      addWarning(result, "Unable to inspect NGX shell after apply: " + String(uiInspectError));
    }
    try {
      var projectSaveStartedAt = nowMillis();
      result.runtimeEvidence.projectSave = summarizeSaveResult(C8O.dbo.saveProject(project, []), result);
      setDuration(timings, "projectSaveMs", projectSaveStartedAt);
      var generatedSourcesCleanupStartedAt = nowMillis();
      result.runtimeEvidence.generatedSourcesCleanup = cleanupGeneratedIonicSources(projectName, ngxApp);
      setDuration(timings, "generatedSourcesCleanupMs", generatedSourcesCleanupStartedAt);
      result.runtimeEvidence.generatedSourcesPurge = {
        skipped: true,
        reason: "Managed source purge disabled to avoid transient live-viewer compile failures during watched regeneration.",
        pageDirsPurged: [],
        componentDirsPurged: [],
        deletedCount: 0
      };
      timings.generatedSourcesPurgeMs = 0;
      var mobileBuilderStartedAt = nowMillis();
      var refreshTargets = [pageQName(projectName, entryPage)].concat(sharedComponents.qnames || []);
      for (var refreshIndex = 0; refreshIndex < entityPageLoads.length; refreshIndex++) {
        refreshTargets.push(entityPageLoads[refreshIndex].tree.qname);
      }
      result.runtimeEvidence.mobileBuilder = triggerUiSourceRefreshTargets(
        refreshTargets,
        result,
        "$.runtimeEvidence.mobileBuilder"
      );
      setDuration(timings, "mobileBuilderMs", mobileBuilderStartedAt);
      var studioRefreshStartedAt = nowMillis();
      result.runtimeEvidence.studioRefresh = refreshStudioProjectTree(project, result, "studioRefresh");
      setDuration(timings, "studioRefreshMs", studioRefreshStartedAt);
    } catch (saveUiError) {
      result.status = "partial";
      addWarning(result, "Unable to save project after NGX CRUD kit apply: " + String(saveUiError));
    }
    result.runtimeEvidence.totalDurationMs = setDuration(timings, "totalMs", startedAt);
    return result;
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
