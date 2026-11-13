include("js/util.js");
include("js/databaseobject.js");
include("js/databaseobject_ops.js");
include("js/databaseobject_batch.js");
include("js/marketplace.js");
include("js/crud_naming.js");
include("js/crud_seed.js");
include("js/crud_spec.js");
include("js/crud_runtime.js");
include("js/crud_backend.js");
include("js/crud_proof.js");

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
    if (target == null || typeof target !== "object") {
      return [];
    }
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
      optionalNormalizedIdentifier: optionalNormalizedIdentifier,
      ensureArray: ensureArray,
      toBoolean: toBoolean,
      pluralize: pluralize,
      normalizedIdentifier: normalizedIdentifier,
      normalizeEntityNames: normalizeEntityNames,
      connectorEngine: connectorEngine
    };
  }

  // The engine of an existing SQL connector, for a CRUD spec that names the connector without database.mode.
  function connectorEngine(projectName, connectorName) {
    var project = findProjectByName(projectName);
    var connector = null;
    try {
      connector = project ? project.getConnectorByName(connectorName) : null;
    } catch (_noSuchConnector) {
      connector = null;
    }
    if (!connector || String(connector.getClass().getName()).indexOf("SqlConnector") === -1) {
      return null;
    }
    return {
      name: String(connector.getName()),
      jdbcDriverClassName: trimmed(connector.getJdbcDriverClassName()),
      engine: inferDriverFamilyFromConnector(connector)
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
      humanizeIdentifier: humanizeIdentifier,
      normalizeSpec: normalizeSpec,
      findEntityByName: findEntityByName,
      findField: findField,
      preferredRelationLabelField: preferredRelationLabelField,
      sampleValueForField: sampleValueForField,
      ensureProject: ensureProject,
      crmRelationContext: crmRelationContext,
      buildSeedSql: buildSeedSql,
      ensureChild: ensureChild,
      createChild: createChild,
      findChild: findChild,
      logicalClassName: logicalClassName,
      applyUpdates: applyUpdates,
      connectorProperties: connectorProperties,
      priorityOf: priorityOf,
      ucfirst: ucfirst,
      connectorRequestableQName: connectorRequestableQName,
      requestablePayload: requestablePayload,
      summarizeRequestableProof: summarizeRequestableProof,
      collectSqlOutputRows: collectSqlOutputRows,
      transactionRows: transactionRows,
      saveProject: function (project, warnings) {
        return C8O.dbo.saveProject(project, warnings || []);
      },
      summarizeSaveResult: summarizeSaveResult,
      refreshStudioProjectTree: refreshStudioProjectTree,
      proofRequestable: proofRequestable,
      addWarning: addWarning
    };
  }

  function crudProofContext() {
    return {
      trimmed: trimmed,
      pluralize: pluralize,
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
      txName: txName,
      resolveQName: function (qname, options) {
        return C8O.dbo.resolve(qname, options || {});
      },
      proofRequestable: proofRequestable,
      requestablePayload: requestablePayload,
      summarizeRequestableProof: summarizeRequestableProof,
      firstSqlOutputRow: firstSqlOutputRow,
      extractRowField: extractRowField,
      inferDriverFamilyFromConnector: inferDriverFamilyFromConnector,
      findProjectByName: findProjectByName,
      findSqlConnectorInProject: findSqlConnectorInProject,
      normalizeDatabaseSpec: normalizeDatabaseSpec
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

  function preferredRelationLabelField(entity) {
    return C8O.crudSpec.preferredRelationLabelField(crudSpecContext(), entity);
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
      pluralize: pluralize,
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
    request.put("__project", "lib_ConvertigoMCP");
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

  function summarizeRequestableProof(payload, requestable, result) {
    return C8O.crudProof.summarizeRequestableProof(crudProofContext(), payload, requestable, result);
  }

  function requestablePayload(requestable, variables, result, options) {
    return C8O.crudProof.requestablePayload(crudProofContext(), requestable, variables, result, options);
  }

  function proofRequestable(requestable, variables, result, options) {
    return C8O.crudProof.proofRequestable(crudProofContext(), requestable, variables, result, options);
  }

  function firstSqlOutputRow(payload) {
    return C8O.crudProof.firstSqlOutputRow(crudProofContext(), payload);
  }

  function collectSqlOutputRows(payload) {
    return C8O.crudProof.collectSqlOutputRows(crudProofContext(), payload);
  }

  // All the rows of a list transaction: requestable-execute keeps the first 12 for MCP clients.
  function transactionRows(projectName, connectorName, transactionName, result) {
    var request = new HashMap();
    request.put("__project", String(projectName));
    request.put("__connector", String(connectorName));
    request.put("__transaction", String(transactionName));
    request.put("__nolog", "true");
    try {
      var requester = null;
      try {
        requester = new InternalRequester(request, context.httpServletRequest);
      } catch (_ignoreHttpRequest) {
        requester = new InternalRequester(request);
      }
      var response = requester.processRequest();
      var root = response && response.getDocumentElement ? response.getDocumentElement() : response;
      var XMLUtils = Packages.com.twinsoft.convertigo.engine.util.XMLUtils;
      return collectSqlOutputRows(JSON.parse(String(XMLUtils.XmlToJson(root, true, true))));
    } catch (rowsError) {
      addWarning(result, "Unable to read the rows of " + projectName + "." + connectorName + "." + transactionName + ": " + String(rowsError));
      return [];
    }
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

  function connectorRequestableQName(projectName, connectorName, requestableName) {
    return trimmed(projectName) + "." + trimmed(connectorName) + "." + trimmed(requestableName);
  }

  function sqlOutputFieldPath(field, rowIndex) {
    var currentRow = rowIndex == null ? 0 : Number(rowIndex);
    var outputKey = field && field.column ? String(field.column) : "";
    return "?.rows?.[" + currentRow + "]" + (outputKey.length ? "?." + outputKey : "");
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
})();
