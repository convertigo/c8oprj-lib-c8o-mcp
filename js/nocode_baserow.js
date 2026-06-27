/*
 * No Code Baserow helpers for ConvertigoMCP.
 * Baserow access stays delegated to lib_BaseRow requestables.
 */

var HashMap = Packages.java.util.HashMap;
var InternalRequester = Packages.com.twinsoft.convertigo.engine.requesters.InternalRequester;
var InternalHttpServletRequest = Packages.com.twinsoft.convertigo.engine.requesters.InternalHttpServletRequest;
var XMLUtils = Packages.com.twinsoft.convertigo.engine.util.XMLUtils;
var JsonOutput = Packages.com.twinsoft.convertigo.engine.enums.JsonOutput;
var Engine = Packages.com.twinsoft.convertigo.engine.Engine;

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.nocodeBaserow = C8O.nocodeBaserow || {};

(function () {
  function trimmed(value) {
    return value == null ? "" : String(value).trim();
  }

  function requestBearerToken() {
    try {
      if (typeof context === "undefined" || !context || !context.httpServletRequest) {
        return "";
      }
      var authorization = context.httpServletRequest.getHeader("Authorization");
      var value = trimmed(authorization);
      var prefix = "Bearer ";
      if (value.substring(0, prefix.length).toLowerCase() === prefix.toLowerCase()) {
        return trimmed(value.substring(prefix.length));
      }
    } catch (_ignoreBearer) {}
    return "";
  }

  function ensureArray(value) {
    if (value == null) {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  }

  function callC8oSequence(project, sequence, variables) {
    var params = new HashMap();
    var projectArray = java.lang.reflect.Array.newInstance(java.lang.String, 1);
    projectArray[0] = project;
    params.put("__project", projectArray);
    params.put("__sequence", sequence);
    params.put("__context", "syncContext_" + java.lang.System.currentTimeMillis());
    var keys = Object.keys(variables || {});
    for (var i = 0; i < keys.length; i++) {
      if (variables[keys[i]] != null) {
        params.put(keys[i], variables[keys[i]]);
      }
    }
    var hasContext = typeof context !== "undefined" && context;
    var request = hasContext && context.httpServletRequest ? context.httpServletRequest : new InternalHttpServletRequest();
    var requester = new InternalRequester(params, request);
    var response = requester.processRequest();
    var json = JSON.parse(XMLUtils.XmlToJson(response.getDocumentElement(), true, true, JsonOutput.JsonRoot.docNode).toString());
    try {
      var ctx2 = requester.getContext();
      Engine.theApp.contextManager.remove(ctx2);
    } catch (_ignoreCtx) {}
    if (hasContext && context.logParameters) {
      org.apache.log4j.MDC.put("ContextualParameters", context.logParameters);
    }
    return json;
  }

  function callC8oTransaction(project, connector, transaction, variables) {
    var params = new HashMap();
    var projectArray = java.lang.reflect.Array.newInstance(java.lang.String, 1);
    projectArray[0] = project;
    params.put("__project", projectArray);
    params.put("__connector", connector);
    params.put("__transaction", transaction);
    params.put("__context", "syncContext_" + java.lang.System.currentTimeMillis());
    var keys = Object.keys(variables || {});
    for (var i = 0; i < keys.length; i++) {
      if (variables[keys[i]] != null) {
        params.put(keys[i], variables[keys[i]]);
      }
    }
    var hasContext = typeof context !== "undefined" && context;
    var request = hasContext && context.httpServletRequest ? context.httpServletRequest : new InternalHttpServletRequest();
    var requester = new InternalRequester(params, request);
    var response = requester.processRequest();
    var json = JSON.parse(XMLUtils.XmlToJson(response.getDocumentElement(), true, true, JsonOutput.JsonRoot.docNode).toString());
    try {
      var ctx2 = requester.getContext();
      Engine.theApp.contextManager.remove(ctx2);
    } catch (_ignoreCtx) {}
    if (hasContext && context.logParameters) {
      org.apache.log4j.MDC.put("ContextualParameters", context.logParameters);
    }
    return json;
  }

  function currentMcpProjectName() {
    try {
      if (typeof context !== "undefined" && context && context.project && context.project.getName) {
        return String(context.project.getName());
      }
    } catch (_ignoreProjectName) {}
    return "ConvertigoMCP";
  }

  function unwrapSequenceResult(response) {
    if (!response) {
      return response;
    }
    if (response.document && response.document.result) {
      return response.document.result;
    }
    if (response.doc && response.doc.document && response.doc.document.result) {
      return response.doc.document.result;
    }
    if (response.result) {
      return response.result;
    }
    return response;
  }

  function apiError(response) {
    if (!response) {
      return null;
    }
    if (response.document && response.document.error) {
      return response.document.error;
    }
    if (response.doc && response.doc.document && response.doc.document.error) {
      return response.doc.document.error;
    }
    if (response.error) {
      return response.error;
    }
    if (response.detail || response.code) {
      return {
        code: response.code || "baserow_error",
        message: response.detail || response.message || response.code
      };
    }
    if (response.document && (response.document.detail || response.document.code)) {
      return {
        code: response.document.code || "baserow_error",
        message: response.document.detail || response.document.message || response.document.code
      };
    }
    return null;
  }

  function validateToken(token) {
    var tokenValue = trimmed(token) || requestBearerToken();
    if (!tokenValue.length) {
      return {
        status: "invalid",
        authenticated: false,
        error: { code: "missing_token", message: "No Code assistant authentication is required." }
      };
    }
    var response = callC8oSequence(currentMcpProjectName(), "nocode_validate_token", { token: tokenValue });
    var error = apiError(response);
    if (error) {
      return {
        status: "invalid",
        authenticated: false,
        error: error,
        response: unwrapSequenceResult(response)
      };
    }
    return unwrapSequenceResult(response);
  }

  function readApplications() {
    var response = callC8oSequence("lib_BaseRow", "formscommon_ApplicationsList", {});
    var error = apiError(response);
    if (error) {
      throw new Error(String(error.message || error.code || JSON.stringify(error)));
    }
    if (response && response.document && response.document.array != null) {
      return ensureArray(response.document.array);
    }
    if (response && response.doc && response.doc.document && response.doc.document.array != null) {
      return ensureArray(response.doc.document.array);
    }
    if (response && response.array != null) {
      return ensureArray(response.array);
    }
    return [];
  }

  function readTableFields(tableId, editor) {
    var fieldsConfig = {
      table_id: baserowId(tableId),
      editor: trimmed(editor)
    };
    var response = callC8oSequence("lib_BaseRow", "formscommon_FieldsList", {
      forms_config: JSON.stringify(fieldsConfig)
    });
    var error = apiError(response);
    if (error) {
      throw new Error("table " + tableId + ": " + String(error.message || error.code || JSON.stringify(error)));
    }
    if (response && response.document && response.document.array != null) {
      return ensureArray(response.document.array);
    }
    if (response && response.doc && response.doc.document && response.doc.document.array != null) {
      return ensureArray(response.doc.document.array);
    }
    if (response && response.array != null) {
      return ensureArray(response.array);
    }
    return [];
  }

  function numberOrNull(value) {
    if (value == null || value === "") {
      return null;
    }
    var parsed = Number(value);
    return isNaN(parsed) ? null : parsed;
  }

  function baserowId(value) {
    var parsed = numberOrNull(value);
    if (parsed == null) {
      return "";
    }
    return String(Math.round(parsed));
  }

  function normalizeTable(table, base, workspace) {
    var raw = table || {};
    return {
      id: numberOrNull(raw.id),
      name: trimmed(raw.name),
      order: numberOrNull(raw.order),
      databaseId: numberOrNull(raw.database_id || raw.databaseId || (base && base.id)),
      baseId: numberOrNull(base && base.id),
      baseName: trimmed(base && base.name),
      workspaceId: numberOrNull(workspace && workspace.id),
      workspaceName: trimmed(workspace && workspace.name)
    };
  }

  function booleanValue(value) {
    if (value === true) {
      return true;
    }
    if (value === false || value == null) {
      return false;
    }
    var text = trimmed(value).toLowerCase();
    return text === "true" || text === "1" || text === "yes";
  }

  function booleanDefault(value, defaultValue) {
    if (value == null || value === "") {
      return defaultValue;
    }
    return booleanValue(value);
  }

  function cloneShallow(value) {
    var out = {};
    if (!value) {
      return out;
    }
    var keys = Object.keys(value);
    for (var i = 0; i < keys.length; i++) {
      out[keys[i]] = value[keys[i]];
    }
    return out;
  }

  function normalizeColumn(field, table) {
    var raw = cloneShallow(field);
    raw.id = numberOrNull(raw.id);
    raw.name = trimmed(raw.name);
    raw.type = trimmed(raw.type);
    raw.order = numberOrNull(raw.order);
    raw.primary = raw.primary === true || raw.primary === "true";
    raw.readOnly = raw.read_only === true || raw.readOnly === true || raw.read_only === "true" || raw.readOnly === "true";
    raw.tableId = numberOrNull(table && table.id);
    raw.tableName = trimmed(table && table.name);
    raw.databaseId = numberOrNull(table && table.databaseId);
    raw.baseId = numberOrNull(table && table.baseId);
    raw.baseName = trimmed(table && table.baseName);
    raw.workspaceId = numberOrNull(table && table.workspaceId);
    raw.workspaceName = trimmed(table && table.workspaceName);
    return raw;
  }

  function filterCatalog(catalog, filters) {
    var workspaceId = numberOrNull(filters.workspaceId);
    var databaseId = numberOrNull(filters.databaseId);
    var tableId = numberOrNull(filters.tableId);
    if (workspaceId == null && databaseId == null && tableId == null) {
      return catalog;
    }

    var workspaces = [];
    var bases = [];
    var tables = [];
    var workspaceById = {};
    var baseById = {};
    var catalogBaseById = {};

    for (var b = 0; b < catalog.bases.length; b++) {
      var catalogBase = catalog.bases[b];
      if (catalogBase.id != null) {
        catalogBaseById["id:" + catalogBase.id] = catalogBase;
      }
    }

    function workspaceKey(table) {
      return table.workspaceId == null ? "name:" + table.workspaceName : "id:" + table.workspaceId;
    }

    function baseKey(table) {
      return table.baseId == null ? "name:" + table.workspaceId + ":" + table.baseName : "id:" + table.baseId;
    }

    for (var i = 0; i < catalog.tables.length; i++) {
      var table = catalog.tables[i];
      if (workspaceId != null && table.workspaceId !== workspaceId) {
        continue;
      }
      if (databaseId != null && table.databaseId !== databaseId && table.baseId !== databaseId) {
        continue;
      }
      if (tableId != null && table.id !== tableId) {
        continue;
      }

      var wKey = workspaceKey(table);
      if (!workspaceById[wKey]) {
        workspaceById[wKey] = {
          id: table.workspaceId,
          name: table.workspaceName,
          bases: []
        };
        workspaces.push(workspaceById[wKey]);
      }

      var bKey = baseKey(table);
      if (!baseById[bKey]) {
        var baseMeta = catalogBaseById[bKey] || {};
        baseById[bKey] = {
          id: table.baseId,
          name: table.baseName,
          order: numberOrNull(baseMeta.order),
          type: trimmed(baseMeta.type) || "database",
          workspaceId: table.workspaceId,
          workspaceName: table.workspaceName,
          tables: []
        };
        bases.push(baseById[bKey]);
        workspaceById[wKey].bases.push(baseById[bKey]);
      }

      var tableCopy = cloneShallow(table);
      baseById[bKey].tables.push(tableCopy);
      tables.push(tableCopy);
    }

    return {
      workspaces: workspaces,
      bases: bases,
      tables: tables
    };
  }

  function hydrateColumns(catalog, authentication) {
    var columns = [];
    var editor = authentication && authentication.user;
    for (var i = 0; i < catalog.tables.length; i++) {
      var table = catalog.tables[i];
      var rawFields = readTableFields(table.id, editor);
      table.columns = [];
      for (var f = 0; f < rawFields.length; f++) {
        var column = normalizeColumn(rawFields[f], table);
        table.columns.push(column);
        columns.push(column);
      }
      table.columnCount = table.columns.length;
    }
    return columns;
  }

  function normalizeBase(application) {
    var app = application || {};
    var workspace = app.workspace || app.group || {};
    var base = {
      id: numberOrNull(app.id),
      name: trimmed(app.name),
      order: numberOrNull(app.order),
      type: trimmed(app.type),
      workspaceId: numberOrNull(workspace.id),
      workspaceName: trimmed(workspace.name),
      tables: []
    };
    var tables = ensureArray(app.tables);
    for (var i = 0; i < tables.length; i++) {
      base.tables.push(normalizeTable(tables[i], base, workspace));
    }
    return base;
  }

  function normalizeCatalog(applications) {
    var apps = ensureArray(applications);
    var workspaceById = {};
    var workspaces = [];
    var bases = [];
    var tables = [];

    for (var i = 0; i < apps.length; i++) {
      var app = apps[i] || {};
      if (trimmed(app.type) !== "database") {
        continue;
      }
      var workspace = app.workspace || app.group || {};
      var workspaceId = numberOrNull(workspace.id);
      var workspaceKey = workspaceId == null ? "name:" + trimmed(workspace.name) : "id:" + workspaceId;
      if (!workspaceById[workspaceKey]) {
        workspaceById[workspaceKey] = {
          id: workspaceId,
          name: trimmed(workspace.name),
          bases: []
        };
        workspaces.push(workspaceById[workspaceKey]);
      }
      var base = normalizeBase(app);
      bases.push(base);
      workspaceById[workspaceKey].bases.push(base);
      for (var t = 0; t < base.tables.length; t++) {
        tables.push(base.tables[t]);
      }
    }
    return {
      workspaces: workspaces,
      bases: bases,
      tables: tables
    };
  }

  function parseJsonInput(value, label, fallback) {
    if (value == null || value === "") {
      return fallback;
    }
    var isJavaString = false;
    try {
      isJavaString = value.getClass && String(value.getClass().getName()) === "java.lang.String";
    } catch (_ignoreStringClass) {}
    if (typeof value === "string" || value instanceof String || isJavaString) {
      try {
        return JSON.parse(String(value));
      } catch (e) {
        throw new Error(label + " must be valid JSON: " + e.message);
      }
    }
    return value;
  }

  function callBaserowTransaction(transaction, variables) {
    return callC8oTransaction("lib_BaseRow", "Baserow_API_spec", transaction, variables || {});
  }

  function getBaserowBearer() {
    var response = callC8oSequence("lib_BaseRow", "TokenGetOrRefresh", {});
    var error = apiError(response);
    if (error) {
      throw new Error(String(error.message || error.code || JSON.stringify(error)));
    }
    var bearer = "";
    if (response && response.document && response.document.Bearer) {
      bearer = trimmed(response.document.Bearer);
    } else if (response && response.doc && response.doc.document && response.doc.document.Bearer) {
      bearer = trimmed(response.doc.document.Bearer);
    } else if (response && response.Bearer) {
      bearer = trimmed(response.Bearer);
    }
    if (!/^JWT\s+\S+/.test(bearer)) {
      throw new Error("lib_BaseRow.TokenGetOrRefresh did not return a valid JWT bearer token.");
    }
    return bearer;
  }

  function firstObject(response) {
    if (!response) {
      return null;
    }
    if (response.document && response.document.object) {
      return response.document.object;
    }
    if (response.doc && response.doc.document && response.doc.document.object) {
      return response.doc.document.object;
    }
    if (response.object) {
      return response.object;
    }
    if (response.document) {
      return response.document;
    }
    return response;
  }

  function pathValue(value, path) {
    var current = value;
    for (var i = 0; i < path.length; i++) {
      if (current == null) {
        return null;
      }
      current = current[path[i]];
    }
    return current;
  }

  function transactionError(response) {
    var error = apiError(response);
    if (error) {
      return error;
    }
    var object = firstObject(response);
    if (object && object.error) {
      return object.error;
    }
    if (object && object.detail && String(object.detail).length) {
      return { code: "baserow_error", message: String(object.detail) };
    }
    var httpStatus = pathValue(response, ["document", "HttpInfo", "status"]);
    if (httpStatus && numberOrNull(httpStatus.code) >= 400) {
      return {
        code: "http_" + httpStatus.code,
        message: String(httpStatus.text || "HTTP " + httpStatus.code)
      };
    }
    var httpErrors = pathValue(response, ["document", "HttpInfo", "errors"]);
    if (httpErrors) {
      return {
        code: "http_error",
        message: String(httpErrors)
      };
    }
    return null;
  }

  function callBaserowJson(transaction, variables) {
    var response = callBaserowTransaction(transaction, variables);
    var error = transactionError(response);
    if (error) {
      throw new Error(String(error.message || error.detail || error.code || JSON.stringify(error)));
    }
    return firstObject(response);
  }

  function isUrlNotFoundError(error) {
    return String(error && error.message ? error.message : error).indexOf("URL_NOT_FOUND") !== -1;
  }

  function normalizeFieldType(type) {
    var value = trimmed(type).toLowerCase();
    var aliases = {
      link: "link_row",
      relation: "link_row",
      relationship: "link_row",
      lookup_field: "lookup",
      reported: "lookup",
      rapport: "lookup",
      single: "single_select",
      select: "single_select",
      multiselect: "multiple_select",
      multi_select: "multiple_select",
      multiple: "multiple_select",
      checkbox: "boolean",
      bool: "boolean",
      integer: "number",
      decimal: "number",
      text_long: "long_text",
      datetime: "date"
    };
    return aliases[value] || value;
  }

  function normalizeSelectOptions(values) {
    var array = ensureArray(values);
    var out = [];
    var colors = ["light-blue", "light-green", "light-orange", "light-red", "light-purple", "light-pink", "light-gray"];
    for (var i = 0; i < array.length; i++) {
      var value = array[i];
      if (value && typeof value === "object") {
        out.push(value);
      } else if (trimmed(value).length) {
        out.push({ value: trimmed(value), color: colors[i % colors.length] });
      }
    }
    return out;
  }

  function indexByName(items) {
    var map = {};
    for (var i = 0; i < ensureArray(items).length; i++) {
      var item = items[i];
      var name = trimmed(item && item.name).toLowerCase();
      if (name.length) {
        map[name] = item;
      }
    }
    return map;
  }

  function fieldNameKey(name) {
    return trimmed(name).toLowerCase();
  }

  function buildRowFieldResolver(tableSpec, existingFields) {
    var existingByName = {};
    var primaryField = null;
    var fields = ensureArray(existingFields);
    for (var i = 0; i < fields.length; i++) {
      var existing = fields[i] || {};
      var existingName = trimmed(existing.name);
      if (existingName.length) {
        existingByName[fieldNameKey(existingName)] = existing;
      }
      if (existing.primary === true || existing.primary === "true") {
        primaryField = existing;
      }
    }

    var byInputKey = {};
    for (var f = 0; f < tableSpec.fields.length; f++) {
      var spec = tableSpec.fields[f];
      var key = fieldNameKey(spec.name);
      var realField = existingByName[key] || null;
      byInputKey[key] = {
        spec: spec,
        name: realField ? trimmed(realField.name) : spec.name,
        field: realField || spec
      };
    }

    if (primaryField) {
      var primaryName = trimmed(primaryField.name);
      if (tableSpec.primaryField.length) {
        byInputKey[fieldNameKey(tableSpec.primaryField)] = {
          spec: null,
          name: primaryName,
          field: primaryField
        };
      }
      byInputKey[fieldNameKey(primaryName)] = {
        spec: null,
        name: primaryName,
        field: primaryField
      };
      byInputKey.name = byInputKey.name || {
        spec: null,
        name: primaryName,
        field: primaryField
      };
      byInputKey.nom = byInputKey.nom || {
        spec: null,
        name: primaryName,
        field: primaryField
      };
    }

    return {
      resolve: function (name) {
        var key = fieldNameKey(name);
        return byInputKey[key] || {
          spec: null,
          name: name,
          field: existingByName[key] || null
        };
      }
    };
  }

  function findByIdOrName(items, id, name) {
    var targetId = numberOrNull(id);
    var targetName = trimmed(name).toLowerCase();
    for (var i = 0; i < ensureArray(items).length; i++) {
      var item = items[i];
      if (targetId != null && numberOrNull(item && item.id) === targetId) {
        return item;
      }
      if (targetName.length && trimmed(item && item.name).toLowerCase() === targetName) {
        return item;
      }
    }
    return null;
  }

  function findTableInBase(catalog, table, base) {
    var targetId = numberOrNull(table && table.id);
    var targetName = trimmed(table && table.name).toLowerCase();
    var baseId = numberOrNull(base && base.id);
    for (var i = 0; i < ensureArray(catalog && catalog.tables).length; i++) {
      var candidate = catalog.tables[i];
      var candidateBaseId = numberOrNull(candidate.baseId || candidate.databaseId);
      if (baseId != null && candidateBaseId !== baseId) {
        continue;
      }
      if (targetId != null && numberOrNull(candidate.id) === targetId) {
        return candidate;
      }
      if (targetName.length && trimmed(candidate.name).toLowerCase() === targetName) {
        return candidate;
      }
    }
    return null;
  }

  function buildTableMapForSchema(schema, catalog, base) {
    var map = {};
    for (var i = 0; i < ensureArray(schema && schema.tables).length; i++) {
      var table = findTableInBase(catalog, schema.tables[i], base);
      if (table) {
        map[schema.tables[i].name.toLowerCase()] = table;
      }
    }
    return map;
  }

  function normalizeSchema(rawSchema) {
    var schema = rawSchema || {};
    var tables = ensureArray(schema.tables || schema.entities || schema.collections);
    var normalizedTables = [];
    for (var i = 0; i < tables.length; i++) {
      var table = tables[i] || {};
      var tableName = trimmed(table.name || table.table || table.id);
      if (!tableName.length) {
        throw new Error("schema.tables[" + i + "].name is required.");
      }
      var fields = ensureArray(table.fields || table.columns);
      var normalizedFields = [];
      for (var f = 0; f < fields.length; f++) {
        var field = fields[f] || {};
        var fieldName = trimmed(field.name || field.column);
        if (!fieldName.length) {
          throw new Error("schema.tables[" + i + "].fields[" + f + "].name is required.");
        }
        var type = normalizeFieldType(field.type || "text");
        normalizedFields.push({
          name: fieldName,
          type: type,
          required: booleanValue(field.required || field.mandatory || field.obligatoire),
          description: trimmed(field.description || field.notes || field.comment),
          values: field.values || field.options,
          targetTable: trimmed(field.targetTable || field.linkRowTable || field.relation || field.target || field.table),
          through: trimmed(field.through || field.throughField || field.linkField),
          targetField: trimmed(field.targetField || field.lookupField || field.field),
          multiple: field.multiple,
          createRelatedField: field.createRelatedField,
          relatedFieldName: trimmed(field.relatedFieldName || field.linkRowRelatedFieldName),
          formula: trimmed(field.formula),
          baserowOptions: field.baserowOptions || field.optionsObject || {},
          raw: field
        });
      }
      normalizedTables.push({
        id: numberOrNull(table.id || table.tableId),
        name: tableName,
        primaryField: trimmed(table.primaryField || table.primary || table.displayField),
        fields: normalizedFields,
        views: ensureArray(table.views),
        sampleRows: ensureArray(table.sampleRows || table.rows || table.data),
        upsertKey: trimmed(table.upsertKey || table.keyField),
        raw: table
      });
    }
    return {
      workspaceId: numberOrNull(schema.workspaceId),
      workspaceName: trimmed(schema.workspaceName || schema.workspace),
      baseId: numberOrNull(schema.baseId || schema.databaseId),
      baseName: trimmed(schema.baseName || schema.databaseName || schema.base || schema.database),
      tables: normalizedTables
    };
  }

  function pushAction(plan, type, message, extra) {
    var item = { type: type, message: message };
    var keys = Object.keys(extra || {});
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] !== "type" && keys[i] !== "message") {
        item[keys[i]] = extra[keys[i]];
      }
    }
    plan.actions.push(item);
    return item;
  }

  function formatLibWriteError(label, error) {
    var message = String(error && (error.message || error.code) ? (error.message || error.code) : JSON.stringify(error));
    if (message.indexOf("URL_NOT_FOUND") !== -1) {
      return label + ": lib_BaseRow write primitive returned URL_NOT_FOUND. The schema is valid, but the loaded lib_BaseRow Baserow_API_spec connector cannot persist this write endpoint in the current runtime.";
    }
    return label + ": " + message;
  }

  function ensureWorkspace(plan, schema, create, apply, bearer, catalog) {
    if (schema.workspaceId != null) {
      return { id: schema.workspaceId, name: schema.workspaceName || "" };
    }
    if (!schema.workspaceName.length) {
      return null;
    }
    var workspace = findByIdOrName(catalog.workspaces, null, schema.workspaceName);
    if (workspace) {
      pushAction(plan, "workspace_exists", "Workspace already exists.", { workspaceId: workspace.id, workspaceName: workspace.name });
      return workspace;
    }
    if (!booleanDefault(create.workspace, false)) {
      pushAction(plan, "workspace_missing", "Workspace is missing and create.workspace is false.", { workspaceName: schema.workspaceName });
      return null;
    }
    pushAction(plan, "create_workspace", "Create workspace.", { workspaceName: schema.workspaceName });
    if (!apply) {
      return { id: null, name: schema.workspaceName };
    }
    var bearerToken = bearer || getBaserowBearer();
    var created = callBaserowJson("_api_workspaces__POST", {
      name: schema.workspaceName,
      __header_Authorization: bearerToken
    });
    return { id: numberOrNull(created.id), name: trimmed(created.name || schema.workspaceName) };
  }

  function ensureBase(plan, schema, create, apply, bearer, catalog, workspace) {
    if (schema.baseId != null) {
      return { id: schema.baseId, name: schema.baseName || "" };
    }
    if (!schema.baseName.length) {
      throw new Error("schema.baseId or schema.baseName is required.");
    }
    var base = findByIdOrName(catalog.bases, null, schema.baseName);
    if (base) {
      pushAction(plan, "base_exists", "Base already exists.", { baseId: base.id, baseName: base.name, workspaceId: base.workspaceId });
      return base;
    }
    if (!workspace || numberOrNull(workspace.id) == null) {
      throw new Error("Cannot create base without an existing or newly created workspace id.");
    }
    if (!booleanDefault(create.base, true)) {
      pushAction(plan, "base_missing", "Base is missing and create.base is false.", { baseName: schema.baseName, workspaceId: workspace.id });
      return null;
    }
    pushAction(plan, "create_base", "Create Baserow database application.", { baseName: schema.baseName, workspaceId: workspace.id });
    if (!apply) {
      return { id: null, name: schema.baseName, workspaceId: workspace.id };
    }
    var created;
    var bearerToken = bearer || getBaserowBearer();
    try {
      created = callBaserowJson("_api_applications_workspace__workspace_id___POST", {
        workspace_id: baserowId(workspace.id),
        name: schema.baseName,
        type: "database",
        __body: JSON.stringify({ name: schema.baseName, type: "database" }),
        __contentType: "application/json",
        __header_Authorization: bearerToken
      });
    } catch (workspaceCreateError) {
      try {
        created = callBaserowJson("_api_applications_group__group_id___POST", {
          group_id: baserowId(workspace.id),
          __body: JSON.stringify({ name: schema.baseName, type: "database" }),
          __contentType: "application/json",
          __header_Authorization: bearerToken
        });
      } catch (groupCreateError) {
        if (isUrlNotFoundError(workspaceCreateError) && isUrlNotFoundError(groupCreateError)) {
          throw new Error("Baserow base creation is unavailable in the loaded lib_BaseRow Baserow_API_spec connector (URL_NOT_FOUND). Use an existing baseId/baseName, or update the lib_BaseRow connector endpoints.");
        }
        throw workspaceCreateError;
      }
    }
    return { id: numberOrNull(created.id), name: trimmed(created.name || schema.baseName), workspaceId: workspace.id };
  }

  function ensureTable(plan, table, create, apply, bearer, base, catalog) {
    var existing = findTableInBase(catalog, table, base);
    if (existing) {
      pushAction(plan, "table_exists", "Table already exists.", { table: table.name, tableId: existing.id });
      return existing;
    }
    if (!booleanDefault(create.tables, true)) {
      pushAction(plan, "table_missing", "Table is missing and create.tables is false.", { table: table.name });
      return null;
    }
    if ((!base || numberOrNull(base.id) == null) && apply) {
      throw new Error("Cannot create table " + table.name + " without an existing or newly created base id.");
    }
    pushAction(plan, "create_table", "Create table.", { table: table.name, baseId: base ? base.id : null });
    if (!apply) {
      return { id: null, name: table.name, baseId: base ? base.id : null, databaseId: base ? base.id : null };
    }
    var body = { name: table.name };
    if (table.raw.data != null) {
      body.data = table.raw.data;
    }
    if (table.raw.first_row_header != null) {
      body.first_row_header = booleanValue(table.raw.first_row_header);
    }
    var created;
    var bearerToken = bearer || getBaserowBearer();
    try {
      created = callBaserowJson("_api_database_tables_database__database_id___POST", {
        database_id: baserowId(base.id),
        __body: JSON.stringify(body),
        __header_Authorization: bearerToken
      });
    } catch (tableCreateError) {
      if (isUrlNotFoundError(tableCreateError)) {
        throw new Error("Baserow table creation is unavailable in the loaded lib_BaseRow Baserow_API_spec connector (URL_NOT_FOUND). Use an existing table id/name, or update the lib_BaseRow connector endpoints.");
      }
      throw tableCreateError;
    }
    return { id: numberOrNull(created.id), name: trimmed(created.name || table.name), baseId: base.id, databaseId: base.id };
  }

  function buildFieldBody(field, tableByName, fieldsByTableName, allowUnresolved) {
    var body = { name: field.name, type: field.type };
    if (field.description.length) {
      body.description = field.description;
    }
    var optionKeys = Object.keys(field.baserowOptions || {});
    for (var i = 0; i < optionKeys.length; i++) {
      body[optionKeys[i]] = field.baserowOptions[optionKeys[i]];
    }
    if (field.type === "single_select" || field.type === "multiple_select") {
      body.select_options = normalizeSelectOptions(field.values);
    }
    if (field.type === "link_row") {
      var linkedTable = tableByName[field.targetTable.toLowerCase()];
      if (!linkedTable || numberOrNull(linkedTable.id) == null) {
        if (!allowUnresolved) {
          throw new Error("Field " + field.name + " links to unknown or unsaved table " + field.targetTable + ".");
        }
        body.link_row_table_id = null;
        body.link_row_table_name = field.targetTable;
      } else {
        body.link_row_table_id = numberOrNull(linkedTable.id);
      }
      if (field.createRelatedField != null) {
        body.has_related_field = booleanValue(field.createRelatedField);
      }
      if (field.relatedFieldName.length) {
        body.link_row_related_field_name = field.relatedFieldName;
      }
      if (field.multiple != null) {
        body.link_row_multiple_relationships = booleanValue(field.multiple);
      }
    }
    if (field.type === "lookup") {
      var currentFields = fieldsByTableName[trimmed(field.raw.tableName || "").toLowerCase()] || [];
      var throughField = findByIdOrName(currentFields, field.raw.throughFieldId, field.through);
      if (!throughField) {
        if (!allowUnresolved) {
          throw new Error("Lookup field " + field.name + " needs an existing link field " + field.through + ".");
        }
        body.through_field_name = field.through;
        body.target_field_name = field.targetField;
        return body;
      }
      body.through_field_id = numberOrNull(throughField.id);
      var linkedTableId = numberOrNull(throughField.link_row_table_id || throughField.linkRowTableId);
      var targetFields = [];
      var tableNames = Object.keys(tableByName);
      for (var t = 0; t < tableNames.length; t++) {
        if (numberOrNull(tableByName[tableNames[t]].id) === linkedTableId) {
          targetFields = fieldsByTableName[tableNames[t]] || [];
          break;
        }
      }
      var targetField = findByIdOrName(targetFields, field.raw.targetFieldId, field.targetField);
      if (!targetField) {
        if (!allowUnresolved) {
          throw new Error("Lookup field " + field.name + " needs target field " + field.targetField + " in the linked table.");
        }
        body.target_field_name = field.targetField;
        return body;
      }
      body.target_field_id = numberOrNull(targetField.id);
    }
    if (field.type === "formula" && field.formula.length) {
      body.formula = field.formula;
    }
    return body;
  }

  function ensureFields(plan, tableSpec, table, create, apply, fieldsByTableName, tableByName, editor) {
    if ((!table || numberOrNull(table.id) == null) && apply) {
      pushAction(plan, "fields_skipped", "Fields skipped because table is not available.", { table: tableSpec.name });
      return;
    }
    table = table || { id: null, name: tableSpec.name };
    var tableKey = tableSpec.name.toLowerCase();
    var existingFields = fieldsByTableName[tableKey] || [];
    var existingByName = indexByName(existingFields);
    var phases = [
      function (field) { return field.type !== "link_row" && field.type !== "lookup" && field.type !== "rollup" && field.type !== "count"; },
      function (field) { return field.type === "link_row"; },
      function (field) { return field.type === "lookup" || field.type === "rollup" || field.type === "count"; }
    ];
    for (var p = 0; p < phases.length; p++) {
      for (var f = 0; f < tableSpec.fields.length; f++) {
        var field = tableSpec.fields[f];
        field.raw.tableName = tableSpec.name;
        if (!phases[p](field)) {
          continue;
        }
        var existing = existingByName[field.name.toLowerCase()];
        if (existing) {
          pushAction(plan, "field_exists", "Field already exists.", { table: tableSpec.name, field: field.name, fieldId: existing.id, type: existing.type });
          if (existing.type && normalizeFieldType(existing.type) !== field.type) {
            plan.warnings.push({
              code: "field_type_mismatch",
              table: tableSpec.name,
              field: field.name,
              existingType: existing.type,
              requestedType: field.type,
              message: "Existing field type differs from requested type. The tool does not change field types automatically."
            });
          } else if ((field.type === "single_select" || field.type === "multiple_select") && field.values != null) {
            updateSelectOptions(plan, tableSpec, existing, field, apply);
          }
          continue;
        }
        if (!booleanDefault(create.fields, true)) {
          pushAction(plan, "field_missing", "Field is missing and create.fields is false.", { table: tableSpec.name, field: field.name, type: field.type });
          continue;
        }
        var body = buildFieldBody(field, tableByName, fieldsByTableName, !apply);
        pushAction(plan, "create_field", "Create field.", { table: tableSpec.name, tableId: table.id, field: field.name, fieldType: field.type, body: body });
        if (apply) {
          var response = callC8oSequence("lib_BaseRow", "TableCreateColumn", {
            table_id: baserowId(table.id),
            data: JSON.stringify(body)
          });
          var error = apiError(response);
          if (error) {
            throw new Error(formatLibWriteError("Create field " + tableSpec.name + "." + field.name, error));
          }
          existingFields = readTableFields(table.id, editor);
          fieldsByTableName[tableKey] = existingFields;
          existingByName = indexByName(existingFields);
        }
      }
    }
  }

  function selectOptionValueMap(options) {
    var map = {};
    var list = ensureArray(options);
    for (var i = 0; i < list.length; i++) {
      var value = list[i] && typeof list[i] === "object" ? list[i].value : list[i];
      if (trimmed(value).length) {
        map[trimmed(value)] = true;
      }
    }
    return map;
  }

  function updateSelectOptions(plan, tableSpec, existing, field, apply) {
    var desired = normalizeSelectOptions(field.values);
    var existingOptions = ensureArray(existing.select_options || existing.selectOptions);
    var existingMap = selectOptionValueMap(existingOptions);
    var missing = [];
    for (var i = 0; i < desired.length; i++) {
      if (!existingMap[trimmed(desired[i].value)]) {
        missing.push(desired[i]);
      }
    }
    if (!missing.length) {
      return;
    }
    var combined = existingOptions.concat(missing);
    pushAction(plan, "update_select_options", "Append missing select options.", {
      table: tableSpec.name,
      field: field.name,
      fieldId: existing.id,
      missingOptions: missing
    });
    if (!apply) {
      return;
    }
    callBaserowJson("_api_database_fields__field_id___PATCH", {
      field_id: baserowId(existing.id),
      __body: JSON.stringify({
        name: existing.name,
        type: existing.type,
        select_options: combined
      }),
      __header_Authorization: getBaserowBearer()
    });
  }

  function normalizeRowValue(value, field, rowKeyLookup) {
    if (!field) {
      return value;
    }
    if (field.type === "link_row") {
      if (value == null || value === "") {
        return [];
      }
      var values = ensureArray(value);
      var out = [];
      for (var i = 0; i < values.length; i++) {
        var item = values[i];
        var id = numberOrNull(item && typeof item === "object" ? item.id : item);
        if (id == null) {
          var key = trimmed(item && typeof item === "object" ? (item.key || item.value || item.name) : item);
          var target = rowKeyLookup[field.targetTable.toLowerCase()] || {};
          id = numberOrNull(target[key]);
        }
        if (id != null) {
          out.push(id);
        }
      }
      return out;
    }
    if (field.type === "multiple_select") {
      return ensureArray(value);
    }
    return value;
  }

  function extractRows(response) {
    var object = firstObject(response);
    if (!object) {
      return [];
    }
    if (object.results != null) {
      return ensureArray(object.results);
    }
    if (object.rows != null) {
      return ensureArray(object.rows);
    }
    if (object.array != null) {
      return ensureArray(object.array);
    }
    if (response && response.document && response.document.array != null) {
      return ensureArray(response.document.array);
    }
    return [];
  }

  function readTableRowsPage(tableId, size, page) {
    var response = callC8oSequence("lib_BaseRow", "TableGetData", {
      table_id: baserowId(tableId),
      size: String(size || 200),
      page: String(page || 1)
    });
    var error = apiError(response);
    if (error) {
      throw new Error(formatLibWriteError("Read rows from table " + tableId, error));
    }
    return extractRows(response);
  }

  function readTableRows(tableId) {
    var all = [];
    var size = 100;
    for (var page = 1; page <= 20; page++) {
      var rows = readTableRowsPage(tableId, size, page);
      for (var i = 0; i < rows.length; i++) {
        all.push(rows[i]);
      }
      if (rows.length < size) {
        break;
      }
    }
    return all;
  }

  function rowValueKey(value) {
    if (value == null) {
      return "";
    }
    if (value && typeof value === "object") {
      if (value.value != null) {
        return rowValueKey(value.value);
      }
      if (value.name != null) {
        return rowValueKey(value.name);
      }
      if (value.id != null) {
        return rowValueKey(value.id);
      }
    }
    return trimmed(value);
  }

  function indexRowsByField(rows, fieldName) {
    var map = {};
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i] || {};
      var key = rowValueKey(row[fieldName]);
      if (!key.length) {
        continue;
      }
      map[key] = map[key] || [];
      map[key].push(row);
    }
    return map;
  }

  function buildRowItems(tableSpec, rowKeyLookup, existingFields) {
    var fieldResolver = buildRowFieldResolver(tableSpec, existingFields);
    var rows = [];
    for (var i = 0; i < tableSpec.sampleRows.length; i++) {
      var raw = tableSpec.sampleRows[i] || {};
      var item = {};
      var keys = Object.keys(raw);
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        if (key.charAt(0) === "_") {
          continue;
        }
        var resolved = fieldResolver.resolve(key);
        item[resolved.name] = normalizeRowValue(raw[key], resolved.spec || resolved.field, rowKeyLookup);
      }
      rows.push({ raw: raw, item: item });
    }
    return {
      rows: rows,
      fieldResolver: fieldResolver
    };
  }

  function createRows(plan, tableSpec, table, create, apply, bearer, rowKeyLookup, existingFields) {
    if (!tableSpec.sampleRows.length) {
      return;
    }
    if ((!table || numberOrNull(table.id) == null) && apply) {
      pushAction(plan, "rows_skipped", "Sample rows skipped because table is not available.", { table: tableSpec.name, count: tableSpec.sampleRows.length });
      return;
    }
    table = table || { id: null, name: tableSpec.name };
    if (!booleanDefault(create.sampleRows, true)) {
      pushAction(plan, "rows_skipped", "Sample rows are present but create.sampleRows is false.", { table: tableSpec.name, count: tableSpec.sampleRows.length });
      return;
    }
    var built = buildRowItems(tableSpec, rowKeyLookup, existingFields);
    var items = [];
    for (var bi = 0; bi < built.rows.length; bi++) {
      items.push(built.rows[bi].item);
    }
    var upsertKey = trimmed(tableSpec.upsertKey);
    var upsertField = upsertKey.length ? built.fieldResolver.resolve(upsertKey) : null;
    var action = pushAction(plan, upsertKey.length ? "upsert_rows" : "create_rows", upsertKey.length ? "Upsert sample rows." : "Create sample rows.", {
      table: tableSpec.name,
      tableId: table.id,
      count: items.length,
      upsertKey: upsertKey || null
    });
    if (!apply || !items.length) {
      return;
    }
    var rowsByKey = {};
    if (upsertField && trimmed(upsertField.name).length) {
      rowsByKey = indexRowsByField(readTableRows(table.id), upsertField.name);
    }
    var createdItems = [];
    var createdRows = 0;
    var updatedRows = 0;
    for (var c = 0; c < built.rows.length; c++) {
      var rawItem = built.rows[c].raw;
      var rowItem = built.rows[c].item;
      var upsertValue = upsertField ? rowValueKey(rowItem[upsertField.name]) : "";
      var matchingRows = upsertValue.length ? ensureArray(rowsByKey[upsertValue]) : [];
      if (matchingRows.length) {
        for (var m = 0; m < matchingRows.length; m++) {
          var existingRow = matchingRows[m] || {};
          if (existingRow.id == null) {
            continue;
          }
          var updateResponse = callC8oSequence("lib_BaseRow", "TableUpdateRow", {
            table_id: baserowId(table.id),
            row_id: baserowId(existingRow.id),
            data: JSON.stringify(rowItem)
          });
          var updateError = apiError(updateResponse);
          if (updateError) {
            throw new Error(formatLibWriteError("Update row " + tableSpec.name + "#" + existingRow.id, updateError));
          }
          updatedRows += 1;
          createdItems.push(firstObject(updateResponse));
        }
        continue;
      }
      var response = callC8oSequence("lib_BaseRow", "TableCreateRow", {
        table_id: baserowId(table.id),
        data: JSON.stringify(rowItem)
      });
      var error = apiError(response);
      if (error) {
        throw new Error(formatLibWriteError("Create row " + tableSpec.name + "#" + (c + 1), error));
      }
      createdItems.push(firstObject(response));
      plan.created.rows += 1;
      createdRows += 1;
    }
    rowKeyLookup[tableSpec.name.toLowerCase()] = rowKeyLookup[tableSpec.name.toLowerCase()] || {};
    var keyField = tableSpec.upsertKey || tableSpec.primaryField || "name";
    for (var r = 0; r < createdItems.length; r++) {
      var rawRow = tableSpec.sampleRows[Math.min(r, tableSpec.sampleRows.length - 1)] || {};
      var createdRow = createdItems[r] || {};
      var key = trimmed(rawRow._key || rawRow[keyField] || rawRow.name || rawRow.nom || rawRow.reference);
      if (key.length && createdRow.id != null) {
        rowKeyLookup[tableSpec.name.toLowerCase()][key] = numberOrNull(createdRow.id);
      }
    }
    action.created = createdRows;
    action.updated = updatedRows;
  }

  function createViews(plan, tableSpec, table, create, apply) {
    if (!tableSpec.views.length) {
      return;
    }
    if ((!table || numberOrNull(table.id) == null) && apply) {
      pushAction(plan, "views_skipped", "Views skipped because table is not available.", { table: tableSpec.name, count: tableSpec.views.length });
      return;
    }
    table = table || { id: null, name: tableSpec.name };
    if (!booleanDefault(create.views, true)) {
      pushAction(plan, "views_skipped", "Views are present but create.views is false.", { table: tableSpec.name, count: tableSpec.views.length });
      return;
    }
    for (var i = 0; i < tableSpec.views.length; i++) {
      var view = tableSpec.views[i] || {};
      var body = {
        name: trimmed(view.name || view.view || ("View " + (i + 1))),
        type: trimmed(view.type || "grid"),
        filter_type: trimmed(view.filterType || view.filter_type || "AND"),
        filters_disabled: booleanValue(view.filtersDisabled || view.filters_disabled),
        public: booleanValue(view.public)
      };
      pushAction(plan, "create_view", "Create view.", { table: tableSpec.name, tableId: table.id, view: body.name, body: body });
      if (!apply) {
        continue;
      }
      var response = callC8oSequence("lib_BaseRow", "TableCreateView", {
        table_id: baserowId(table.id),
        data: JSON.stringify(body)
      });
      var error = apiError(response);
      if (error) {
        throw new Error(formatLibWriteError("Create view " + tableSpec.name + "." + body.name, error));
      }
      var viewObject = firstObject(response);
      var filters = ensureArray(view.filters);
      for (var f = 0; f < filters.length; f++) {
        var filter = filters[f] || {};
        if (!viewObject || numberOrNull(viewObject.id) == null) {
          continue;
        }
        callC8oSequence("lib_BaseRow", "TableCreateViewFilter", {
          table_id: baserowId(table.id),
          view_id: baserowId(viewObject.id),
          data: JSON.stringify({
            field: filter.field,
            type: filter.type,
            value: filter.value
          })
        });
      }
    }
  }

  C8O.nocodeBaserow.schemaApply = function (options) {
    var opts = options || {};
    var mode = trimmed(opts.mode || "plan").toLowerCase();
    var apply = mode === "apply";
    var create = parseJsonInput(opts.create, "create", {});
    var authentication = validateToken(opts.token);
    if (!authentication || authentication.authenticated !== true) {
      return {
        status: "auth_required",
        authentication: authentication || { authenticated: false },
        actions: []
      };
    }
    var plan = {
      status: "ok",
      mode: apply ? "apply" : "plan",
      authentication: authentication,
      actions: [],
      warnings: [],
      created: {
        workspaces: [],
        bases: [],
        tables: [],
        fields: [],
        rows: 0,
        views: []
      },
      readBack: null
    };
    try {
      var schema = normalizeSchema(parseJsonInput(opts.schema, "schema", {}));
      var bearer = "";
      var applications = readApplications();
      var catalog = normalizeCatalog(applications);
      var workspace = ensureWorkspace(plan, schema, create, apply, bearer, catalog);
      if (apply) {
        catalog = normalizeCatalog(readApplications());
      }
      var base = ensureBase(plan, schema, create, apply, bearer, catalog, workspace);
      if (apply) {
        catalog = normalizeCatalog(readApplications());
      }

      var tableByName = buildTableMapForSchema(schema, catalog, base);
      for (var t = 0; t < schema.tables.length; t++) {
        var ensuredTable = ensureTable(plan, schema.tables[t], create, apply, bearer, base, catalog);
        if (ensuredTable) {
          tableByName[schema.tables[t].name.toLowerCase()] = ensuredTable;
        }
        if (apply) {
          catalog = normalizeCatalog(readApplications());
          tableByName = buildTableMapForSchema(schema, catalog, base);
          var refreshedTable = findTableInBase(catalog, schema.tables[t], base);
          if (refreshedTable) {
            tableByName[schema.tables[t].name.toLowerCase()] = refreshedTable;
          } else if (ensuredTable) {
            tableByName[schema.tables[t].name.toLowerCase()] = ensuredTable;
          }
        }
      }

      var fieldsByTableName = {};
      for (var ft = 0; ft < schema.tables.length; ft++) {
        var spec = schema.tables[ft];
        var existingTable = tableByName[spec.name.toLowerCase()];
        if (existingTable && numberOrNull(existingTable.id) != null) {
          fieldsByTableName[spec.name.toLowerCase()] = readTableFields(existingTable.id, authentication.user);
        } else {
          fieldsByTableName[spec.name.toLowerCase()] = [];
        }
      }
      for (var ef = 0; ef < schema.tables.length; ef++) {
        ensureFields(plan, schema.tables[ef], tableByName[schema.tables[ef].name.toLowerCase()], create, apply, fieldsByTableName, tableByName, authentication.user);
      }

      var rowKeyLookup = {};
      for (var sr = 0; sr < schema.tables.length; sr++) {
        createRows(
          plan,
          schema.tables[sr],
          tableByName[schema.tables[sr].name.toLowerCase()],
          create,
          apply,
          bearer,
          rowKeyLookup,
          fieldsByTableName[schema.tables[sr].name.toLowerCase()] || []
        );
      }
      for (var cv = 0; cv < schema.tables.length; cv++) {
        createViews(plan, schema.tables[cv], tableByName[schema.tables[cv].name.toLowerCase()], create, apply);
      }

      if (booleanDefault(opts.readBack, true)) {
        var finalCatalog = normalizeCatalog(readApplications());
        var readFilter = {};
        if (base && numberOrNull(base.id) != null) {
          readFilter.databaseId = numberOrNull(base.id);
        }
        var scoped = filterCatalog(finalCatalog, readFilter);
        if (base && numberOrNull(base.id) != null) {
          hydrateColumns(scoped, authentication);
        }
        plan.readBack = scoped;
      }
      plan.counts = {
        actions: plan.actions.length,
        warnings: plan.warnings.length
      };
      return plan;
    } catch (e) {
      plan.status = "error";
      plan.error = {
        code: "baserow_schema_apply_failed",
        message: String(e && e.message ? e.message : e)
      };
      return plan;
    }
  };

  C8O.nocodeBaserow.catalogList = function (options) {
    var opts = options || {};
    var includeColumns = booleanValue(opts.includeColumns);
    var authentication = validateToken(opts.token);
    if (!authentication || authentication.authenticated !== true) {
      return {
        status: "auth_required",
        authentication: authentication || { authenticated: false },
        workspaces: [],
        bases: [],
        tables: []
      };
    }
    try {
      var applications = readApplications();
      var allCatalog = normalizeCatalog(applications);
      var catalog = filterCatalog(allCatalog, opts);
      var columns = [];
      if (includeColumns) {
        if (numberOrNull(opts.workspaceId) == null && numberOrNull(opts.databaseId) == null && numberOrNull(opts.tableId) == null) {
          return {
            status: "invalid_request",
            authentication: authentication,
            error: {
              code: "columns_filter_required",
              message: "includeColumns=true requires workspaceId, databaseId, or tableId to avoid hydrating all " + allCatalog.tables.length + " tables."
            },
            workspaces: [],
            bases: [],
            tables: [],
            columns: [],
            counts: {
              workspaces: 0,
              bases: 0,
              tables: 0,
              columns: 0,
              availableTables: allCatalog.tables.length
            }
          };
        }
        columns = hydrateColumns(catalog, authentication);
      }
      return {
        status: "ok",
        authentication: authentication,
        workspaces: catalog.workspaces,
        bases: catalog.bases,
        tables: catalog.tables,
        columns: columns,
        counts: {
          workspaces: catalog.workspaces.length,
          bases: catalog.bases.length,
          tables: catalog.tables.length,
          columns: columns.length,
          availableTables: allCatalog.tables.length
        }
      };
    } catch (e) {
      return {
        status: "error",
        authentication: authentication,
        error: {
          code: "baserow_catalog_failed",
          message: String(e && e.message ? e.message : e)
        },
        workspaces: [],
        bases: [],
        tables: [],
        columns: []
      };
    }
  };
})();
