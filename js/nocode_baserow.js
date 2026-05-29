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
    return null;
  }

  function validateToken(token) {
    var tokenValue = trimmed(token);
    if (!tokenValue.length) {
      return {
        status: "invalid",
        authenticated: false,
        error: { code: "missing_token", message: "No Code token is required." }
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

  function numberOrNull(value) {
    if (value == null || value === "") {
      return null;
    }
    var parsed = Number(value);
    return isNaN(parsed) ? null : parsed;
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

  C8O.nocodeBaserow.catalogList = function (options) {
    var opts = options || {};
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
      var catalog = normalizeCatalog(applications);
      return {
        status: "ok",
        authentication: authentication,
        workspaces: catalog.workspaces,
        bases: catalog.bases,
        tables: catalog.tables,
        counts: {
          workspaces: catalog.workspaces.length,
          bases: catalog.bases.length,
          tables: catalog.tables.length
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
        tables: []
      };
    }
  };
})();
