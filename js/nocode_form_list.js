/*
 * nocode-form-list for lib_ConvertigoMCP: the forms and applications the authenticated No Code user can see, as the
 * Édition list of the No Code Studio home shows them. C8Oforms.APIV2_ExecuteView with target formsV2/search is the
 * search of that list (mobileSharedActions/searchForm): the drafts the user owns or that their groups share with
 * them (the ACLs of C8Oforms, ~c8oAcl and c8oGrp), the forms in folders included, the newest first, a name matched
 * without case nor accents, a page with its token, the total and the publication status of each draft. It runs in
 * the session the No Code token authenticated, as nocode-form-get runs APIV2_getDocument, with the filters of the
 * home left off: an administrator lists their own forms, never every user's. Never writes.
 * Requires js/nocode_forms.js for the No Code token authentication (javaHost).
 */

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.nocodeFormList = C8O.nocodeFormList || {};

(function () {
  var DEFAULT_LIMIT = 20;
  // 40 forms with long names and folders stay under the 16 KB of indented JSON Vibe keeps inline (about 12 KB).
  var MAX_LIMIT = 40;
  // The filters of the home page as a signed-in user opens it: show_all_apps would list every user's forms to an
  // administrator, hide_apps_i_created and my_collaborations narrow the list to a creator.
  var HOME_FILTERS = { hide_apps_i_created: false, hide_folders: false, show_all_apps: false, my_collaborations: false };

  function trimmed(value) {
    return value == null ? "" : String(value).trim();
  }

  // An empty array or object comes back from the XML response of the sequence as an empty string, one value alone
  // may come back without its array.
  function ensureArray(value) {
    if (value == null || value === "") {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  }

  function userKey(value) {
    var text = trimmed(value);
    return (text.indexOf("C8Oreserved_") === 0 ? text.substring("C8Oreserved_".length) : text).toLowerCase();
  }

  function limitOf(value) {
    var limit = Math.floor(Number(trimmed(value).length ? value : DEFAULT_LIMIT));
    if (!isFinite(limit) || limit < 1) {
      return DEFAULT_LIMIT;
    }
    return Math.min(limit, MAX_LIMIT);
  }

  // C8Oforms dates are epoch milliseconds, as a number or a text; the answer keeps the second.
  function isoDate(value) {
    var ms = Number(trimmed(value));
    if (!isFinite(ms) || ms <= 0) {
      return null;
    }
    try {
      return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
    } catch (_invalidDate) {
      return null;
    }
  }

  // The draft as the agent needs it to answer and to go on with nocode-form-get: its id, its name, whether the user
  // owns it or it is shared with them (then who created it), its publication, its last change and its folders. Its
  // creation date is left out: a page must stay under the 16 KB an agent keeps inline, and the id is that date.
  function entry(doc, user) {
    var out = { id: trimmed(doc._id), name: trimmed(doc.name) };
    var creator = trimmed(doc.creator);
    out.access = creator.length && userKey(creator) === userKey(user) ? "owner" : "shared";
    if (out.access === "shared" && creator.length) {
      out.creator = creator.indexOf("C8Oreserved_") === 0 ? creator.substring("C8Oreserved_".length) : creator;
    }
    var publication = doc.publication && typeof doc.publication === "object" ? doc.publication : null;
    var status = publication ? trimmed(publication.status) : "";
    // never, published, or changed: saved again since its last publication.
    out.publication = status.length ? status : "unknown";
    if (publication && trimmed(publication.version).length && status !== "never") {
      out.version = trimmed(publication.version);
    }
    var modified = isoDate(doc.lastMofification);
    if (modified) {
      out.modified = modified;
    }
    var folders = ensureArray(doc.tag).map(trimmed).filter(function (tag) { return tag.length > 0; });
    if (folders.length) {
      out.folders = folders;
    }
    return out;
  }

  function failed(code, message) {
    return { status: "error", error: { code: code, message: message } };
  }

  // args: { name, limit, cursor, token }. host: authenticate(token) -> { authenticated, user }, search(variables) ->
  // { res } or { error }, the answer of APIV2_ExecuteView.
  C8O.nocodeFormList.list = function (args, host) {
    var opts = args || {};
    var authentication = host.authenticate(trimmed(opts.token));
    if (!authentication || authentication.authenticated !== true) {
      var refused = { authenticated: false };
      if (authentication && authentication.error) {
        refused.error = authentication.error;
      }
      return { status: "auth_required", authentication: refused };
    }
    var name = trimmed(opts.name);
    var limit = limitOf(opts.limit);
    var cursor = trimmed(opts.cursor);
    var params = {
      query: name,
      tag: [],
      subTag: [],
      filters: HOME_FILTERS,
      pagination: { pageSize: limit, pageToken: cursor.length ? cursor : null, withTotal: true }
    };
    var answer;
    try {
      answer = host.search({ target: "formsV2/search", dynamicParams: JSON.stringify(params) });
    } catch (e) {
      return failed("form_list_failed", "Unable to list the forms through the No Code API: " + (e && e.message ? e.message : e));
    }
    if (!answer || answer.error || !answer.res || typeof answer.res !== "object") {
      var detail = answer && answer.error ? trimmed(answer.error.message || answer.error.code || answer.error) : "";
      return failed("form_list_failed", "C8Oforms did not list the forms" + (detail.length ? " (" + detail + ")" : "") + ".");
    }
    var docs = ensureArray(answer.res.docs).filter(function (doc) {
      return doc && typeof doc === "object" && trimmed(doc._id).length && doc.isAtag !== true;
    });
    var pagination = answer.res.pagination && typeof answer.res.pagination === "object" ? answer.res.pagination : {};
    var total = Number(trimmed(pagination.totalCount));
    var nextCursor = trimmed(pagination.nextPageToken);
    var hasNext = pagination.hasNextPage === true || trimmed(pagination.hasNextPage) === "true";
    var result = {
      status: "ok",
      total: isFinite(total) && trimmed(pagination.totalCount).length ? total : null,
      count: docs.length,
      forms: docs.map(function (doc) { return entry(doc, authentication.user); }),
      nextCursor: hasNext && nextCursor.length ? nextCursor : null
    };
    if (name.length) {
      result.name = name;
    }
    return result;
  };

  // The host of the engine: the No Code token authenticates the session (js/nocode_forms.js), then APIV2_ExecuteView
  // runs in it as the No Code Studio home calls it.
  C8O.nocodeFormList.javaHost = function (options) {
    var opts = options || {};
    var project = trimmed(opts.project) || "C8Oforms";
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    var HashMap = Packages.java.util.HashMap;
    var InternalHttpServletRequest = Packages.com.twinsoft.convertigo.engine.requesters.InternalHttpServletRequest;
    var InternalRequester = Packages.com.twinsoft.convertigo.engine.requesters.InternalRequester;
    var XMLUtils = Packages.com.twinsoft.convertigo.engine.util.XMLUtils;
    var JsonOutput = Packages.com.twinsoft.convertigo.engine.enums.JsonOutput;

    function callC8oSequence(sequence, variables) {
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
        Engine.theApp.contextManager.remove(requester.getContext());
      } catch (_ignoreCtx) {}
      if (hasContext && context.logParameters) {
        org.apache.log4j.MDC.put("ContextualParameters", context.logParameters);
      }
      return json;
    }

    return {
      authenticate: function (token) {
        return C8O.nocodeForms.authentication({ token: token });
      },
      search: function (variables) {
        var response = callC8oSequence("APIV2_ExecuteView", variables);
        var document = response && (response.document || (response.doc && response.doc.document)) || response || {};
        if (document.error) {
          return { error: document.error };
        }
        return { res: Object.prototype.hasOwnProperty.call(document, "res") ? document.res : null };
      }
    };
  };
})();
