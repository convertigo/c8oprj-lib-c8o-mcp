if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.uiReveal = C8O.uiReveal || {};

(function () {
  if (C8O.uiReveal.version) {
    return;
  }

  function trim(value) {
    return value == null ? "" : String(value).replace(/^\s+|\s+$/g, "");
  }

  function boolValue(value, fallback) {
    if (value === undefined || value === null) {
      return fallback;
    }
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      return value !== 0;
    }
    var text = trim(value).toLowerCase();
    if (!text.length) {
      return fallback;
    }
    if (text === "true" || text === "1" || text === "yes" || text === "y" || text === "on") {
      return true;
    }
    if (text === "false" || text === "0" || text === "no" || text === "n" || text === "off") {
      return false;
    }
    return fallback;
  }

  function revealEnabled(value, fallback) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (value.reveal !== undefined) {
        return boolValue(value.reveal, fallback);
      }
      if (value.uiReveal !== undefined) {
        return boolValue(value.uiReveal, fallback);
      }
      if (value.convertigoReveal !== undefined) {
        return boolValue(value.convertigoReveal, fallback);
      }
      if (value.enabled !== undefined) {
        return boolValue(value.enabled, fallback);
      }
    }
    return boolValue(value, fallback);
  }

  function base(action, target) {
    return {
      requested: true,
      status: "intent",
      action: action,
      target: trim(target),
      message: ""
    };
  }

  function addUrlHints(out, result) {
    result = result || {};
    out.viewerUrl = trim(result.viewerHomeUrl || result.viewerBaseUrl || result.viewerUrl);
    out.nodeUrl = trim(result.nodeUrl);
    out.browserDebugUrl = trim(result.browserDebugUrl);
    out.browserDevToolsJsonUrl = trim(result.browserDevToolsJsonUrl);
    out.browserDevToolsWebSocketUrl = trim(result.browserDevToolsWebSocketUrl);
    return out;
  }

  function formIdFromResult(result) {
    result = result || {};
    var form = result.form || result.document || result.savedForm || {};
    return trim(
      result.id ||
      result.formId ||
      result.documentId ||
      form._id ||
      form.id ||
      form.formId
    );
  }

  C8O.uiReveal.version = "1";
  C8O.uiReveal.enabled = revealEnabled;

  C8O.uiReveal.disabled = function (action, target) {
    return {
      requested: false,
      status: "disabled",
      action: action || "",
      target: trim(target),
      message: "Reveal not requested"
    };
  };

  C8O.uiReveal.databaseObject = function (qname, options) {
    var target = trim(qname);
    if (!revealEnabled(options, true)) {
      return C8O.uiReveal.disabled("studio-tree-reveal", target);
    }
    if (!target.length) {
      var missing = base("studio-tree-reveal", "");
      missing.status = "skipped";
      missing.message = "No database object target to reveal";
      return missing;
    }
    if (C8O.dbo && typeof C8O.dbo.revealStudioTreeByQName === "function") {
      return C8O.dbo.revealStudioTreeByQName(target, options && options.errors);
    }
    var unsupported = base("studio-tree-reveal", target);
    unsupported.status = "unsupported";
    unsupported.message = "Studio tree reveal is not available in this runtime";
    return unsupported;
  };

  C8O.uiReveal.mobileBuilder = function (project, result, options) {
    var out = base("mobile-builder-reveal", trim(project));
    out.project = trim(project);
    out.stateOnly = result && result.stateOnly === true;
    out.ready = result && result.ready === true;
    out.editorOpened = result && result.editorOpened === true;
    out.status = out.editorOpened ? "revealed" : (result && result.studioMode === false ? "skipped" : "intent");
    out.message = out.editorOpened
      ? "Mobile builder editor is visible"
      : (result && result.studioMode === false
        ? "Mobile builder reveal skipped: Convertigo Studio required"
        : "Mobile builder reveal requested");
    if (options && trim(options.message).length) {
      out.message = trim(options.message);
    }
    return addUrlHints(out, result);
  };

  C8O.uiReveal.nocodeForm = function (action, result, options) {
    var formId = formIdFromResult(result);
    var out = base(action || "nocode-form-reveal", formId);
    out.project = trim(options && options.project) || "C8Oforms";
    out.formId = formId;
    out.status = formId.length ? "intent" : "skipped";
    out.message = formId.length
      ? "No Code Studio form reveal requested"
      : "No saved form id was returned";
    return out;
  };
})();
