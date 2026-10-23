/*
 * No Code form publication for lib_ConvertigoMCP.
 * Publishes a draft only through C8Oforms.APIV2_Publish, the sequence of the No Code Studio Publish button:
 * C8Oforms checks that the authenticated No Code user may publish the draft and copies its current revision
 * (C8Oforms 2.2 ignores the rev it is given), so the tool refuses a draft saved after the revision the user checked.
 * Requires js/nocode_forms.js (form read and validation, No Code token authentication).
 */

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.nocodePublish = C8O.nocodePublish || {};

(function () {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var HashMap = Packages.java.util.HashMap;
  var InternalHttpServletRequest = Packages.com.twinsoft.convertigo.engine.requesters.InternalHttpServletRequest;
  var InternalRequester = Packages.com.twinsoft.convertigo.engine.requesters.InternalRequester;
  var XMLUtils = Packages.com.twinsoft.convertigo.engine.util.XMLUtils;
  var JsonOutput = Packages.com.twinsoft.convertigo.engine.enums.JsonOutput;

  // The defaults of the No Code Studio "create the application" dialog.
  var DEFAULT_BACKGROUND_COLOR = "#ffffff";
  var DEFAULT_THEME_COLOR = "#0cbbe7";
  var ICON_SIZE = 512;

  function trimmed(value) {
    return value == null ? "" : String(value).trim();
  }

  function isTrue(value) {
    return value === true || trimmed(value).toLowerCase() === "true";
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

  function apiResult(response) {
    if (response && response.document && Object.prototype.hasOwnProperty.call(response.document, "res")) {
      return response.document.res;
    }
    if (response && response.doc && response.doc.document && Object.prototype.hasOwnProperty.call(response.doc.document, "res")) {
      return response.doc.document.res;
    }
    return null;
  }

  // A document the No Code user may read, or null (missing and forbidden look the same).
  function readDocument(project, id) {
    var response = callC8oSequence(project, "APIV2_getDocument", { id: id, fromResponse: "false", exportForm: "false" });
    if (apiError(response)) {
      return null;
    }
    var doc = apiResult(response);
    if (doc && Object.prototype.hasOwnProperty.call(doc, "res")) {
      doc = doc.res;
    }
    return doc && typeof doc === "object" && doc._id && !doc.error ? doc : null;
  }

  function accessOf(pwaDoc, publishedDoc) {
    if (pwaDoc && pwaDoc.notAnonymous != null) {
      return isTrue(pwaDoc.notAnonymous) ? "authenticated" : "anonymous";
    }
    if (publishedDoc) {
      return isTrue(publishedDoc.sharedAnonymous) ? "anonymous" : "authenticated";
    }
    return null;
  }

  function hexColor(value) {
    var text = trimmed(value);
    if (/^#[0-9a-fA-F]{6}$/.test(text)) {
      return text.toLowerCase();
    }
    if (/^#[0-9a-fA-F]{3}$/.test(text)) {
      return ("#" + text.charAt(1) + text.charAt(1) + text.charAt(2) + text.charAt(2) + text.charAt(3) + text.charAt(3)).toLowerCase();
    }
    return null;
  }

  // The file name is one C8Oforms accepts as an MCP upload (js/upload_path.js): c8o-nocode-thumbnail-<n>.png.
  function writeColorIcon(color) {
    var BufferedImage = java.awt.image.BufferedImage;
    var image = new BufferedImage(ICON_SIZE, ICON_SIZE, BufferedImage.TYPE_INT_RGB);
    var graphics = image.createGraphics();
    try {
      graphics.setColor(new java.awt.Color(parseInt(color.substring(1), 16)));
      graphics.fillRect(0, 0, ICON_SIZE, ICON_SIZE);
    } finally {
      graphics.dispose();
    }
    var file = java.io.File.createTempFile("c8o-nocode-thumbnail-", ".png");
    file.deleteOnExit();
    javax.imageio.ImageIO.write(image, "png", file);
    return file;
  }

  // First publication: the application of the form, as the No Code Studio dialog creates it with its defaults.
  // The icon is the custom thumbnail of the draft, else a plain icon of its thumbnail color or of the theme color.
  // originalThumbnail is never sent: with an uploaded icon, APIV2_Publish would write it on the draft.
  function applicationMeta(id, draft, access) {
    var thumbnail = draft.thumbnail && typeof draft.thumbnail === "object" ? draft.thumbnail : {};
    var attachments = draft._attachments && typeof draft._attachments === "object" ? draft._attachments : {};
    var pwa = {
      name: trimmed(draft.name) || id,
      shortName: trimmed(draft.name) || id,
      backgroundColor: DEFAULT_BACKGROUND_COLOR,
      themeColor: DEFAULT_THEME_COLOR,
      notAnonymous: access !== "anonymous",
      originalFormId: "published_" + id,
      querystr: "",
      queryStr: ""
    };
    if (thumbnail.type === "custom" && Object.prototype.hasOwnProperty.call(attachments, "thumbnail")) {
      pwa.thumbnail = { fromVar: false, fromId: id, content_type: "" };
      return { pwa: pwa, iconColor: null };
    }
    var iconColor = (thumbnail.type === "color" && hexColor(thumbnail.color)) || DEFAULT_THEME_COLOR;
    pwa.thumbnail = { fromVar: true, fromId: "", content_type: "image/png" };
    return { pwa: pwa, iconColor: iconColor };
  }

  // The link No Code Studio opens: <server>/convertigo/projects/C8Oforms/DisplayObjects/<pwa_subPath>.
  function publishedLink(project, publishedDoc, publishedId) {
    var subPath = publishedDoc && trimmed(publishedDoc.pwa_subPath) ? trimmed(publishedDoc.pwa_subPath) : "pwas/" + publishedId + "/index.html";
    try {
      if (typeof context === "undefined" || !context || !context.httpServletRequest) {
        return null;
      }
      var request = context.httpServletRequest;
      var url = String(Packages.com.twinsoft.convertigo.engine.util.HttpUtils.originalRequestURL(request));
      var base = /^(.*?)\/(?:api|admin|projects\/[^\/]+)\/.*$/.exec(url);
      var root = base ? base[1] : (/^(https?:\/\/[^\/]+)/.exec(url) || [null, ""])[1] + String(request.getContextPath() || "");
      return /^https?:\/\//.test(root) ? root + "/projects/" + project + "/DisplayObjects/" + subPath : null;
    } catch (_ignoreLink) {
      return null;
    }
  }

  function refused(status, code, message, extra) {
    var out = { status: status, published: false, error: { code: code, message: message } };
    Object.keys(extra || {}).forEach(function (key) { out[key] = extra[key]; });
    return out;
  }

  function callPublish(project, id, rev, meta, file) {
    var variables = { id: id, rev: rev, meta: JSON.stringify(meta) };
    if (file) {
      variables.file = String(file.getAbsolutePath());
    }
    var response = callC8oSequence(project, "APIV2_Publish", variables);
    var error = apiError(response);
    if (error) {
      return { error: error };
    }
    var res = apiResult(response);
    return { res: res && typeof res === "object" ? res : {} };
  }

  C8O.nocodePublish.publish = function (id, options) {
    var opts = options || {};
    var project = trimmed(opts.project) || "C8Oforms";
    var formId = trimmed(id);
    var rev = trimmed(opts.rev);
    var access = trimmed(opts.access).toLowerCase();
    if (!formId.length) {
      return refused("invalid", "missing_id", "id is the draft form id to publish.");
    }
    if (formId.indexOf("published_") === 0) {
      return refused("invalid", "published_id", "Pass the draft form id, without the published_ prefix.");
    }
    if (!isTrue(opts.confirm)) {
      return refused("confirmation_required", "confirmation_required",
        "Publishing makes the form available to its respondents. Call this tool only when the user explicitly asked to publish this form, with confirm:true.");
    }
    if (!rev.length) {
      return refused("invalid", "missing_revision", "Read the form with nocode-form-get and pass the revision (_rev) the user checked.");
    }
    if (access.length && access !== "authenticated" && access !== "anonymous") {
      return refused("invalid", "invalid_access", "access is authenticated or anonymous.");
    }

    var draft = C8O.nocodeForms.get(formId, { project: project, token: opts.token });
    if (!draft || draft.fetched === false) {
      var unread = draft || { status: "error" };
      unread.published = false;
      delete unread.fetched;
      return unread;
    }
    if (draft.c8o_view_type_drafts_form !== true && trimmed(draft.c8o_view_type_drafts_form) !== "true") {
      return refused("invalid", "not_a_draft", "This document is not a No Code form draft.");
    }
    if (trimmed(draft._rev) !== rev) {
      return refused("conflict", "revision_changed",
        "The form changed since the revision you read: read it again and check it with the user before publishing.",
        { id: formId, rev: trimmed(draft._rev) });
    }
    var checked = JSON.parse(JSON.stringify(draft));
    delete checked._attachments;
    delete checked._c8oMeta;
    var validation = C8O.nocodeForms.validate(checked, { project: project }).validation;
    if (!validation.valid) {
      return refused("invalid", "form_invalid", "The form has blocking issues: fix them before publishing.",
        { id: formId, rev: rev, validation: validation });
    }

    var publishedId = "published_" + formId;
    var pwaBefore = readDocument(project, publishedId + "_pwa_document");
    var publishedBefore = readDocument(project, publishedId);
    var accessBefore = accessOf(pwaBefore, publishedBefore);
    if (access.length && accessBefore && access !== accessBefore) {
      return refused("refused", "access_change_not_supported",
        "This form is already published with " + accessBefore + " access. Publishing does not change who may answer: " +
        "the user changes it in No Code Studio, Manage access rights. Publish again without access to keep " + accessBefore + " access.",
        { id: formId, rev: rev, access: accessBefore });
    }

    var outcome = callPublish(project, formId, rev, { publishing: true }, null);
    var firstPublication = false;
    if (!outcome.error && isTrue(outcome.res.pwa_required)) {
      firstPublication = true;
      var application = applicationMeta(formId, draft, access || accessBefore || "authenticated");
      var icon = null;
      try {
        if (application.iconColor) {
          icon = writeColorIcon(application.iconColor);
        }
        outcome = callPublish(project, formId, rev, { publishing: true, pwa: application.pwa }, icon);
      } finally {
        if (icon) {
          try { icon["delete"](); } catch (_ignoreIconDelete) {}
        }
      }
    }
    if (outcome.error) {
      var detail = typeof outcome.error === "object" ? trimmed(outcome.error.message || outcome.error.code) : trimmed(outcome.error);
      return refused("error", "publish_failed",
        "C8Oforms reported an error while publishing" + (detail.length ? " (" + detail + ")" : "") +
        ": the form may be partly published. Do not retry: tell the user to check it in No Code Studio.", { id: formId, rev: rev });
    }
    var serverRefusal = trimmed(outcome.res.error);
    if (serverRefusal === "unauthorized") {
      return refused("unauthorized", "unauthorized",
        "C8Oforms refused the publication: only the owner of the form or an editor with the publication right may publish it.", { id: formId, rev: rev });
    }
    if (serverRefusal.length) {
      return refused("error", serverRefusal === "draft_not_found" ? "draft_not_found" : "publish_refused",
        "C8Oforms refused the publication (" + serverRefusal + "). Do not retry: tell the user.", { id: formId, rev: rev });
    }
    if (isTrue(outcome.res.pwa_required)) {
      return refused("error", "application_required", "C8Oforms did not create the application of the form.", { id: formId, rev: rev });
    }

    var published = readDocument(project, publishedId);
    var pwa = readDocument(project, publishedId + "_pwa_document");
    var result = {
      status: "ok",
      published: true,
      id: formId,
      rev: rev,
      publishedId: publishedId,
      version: published && published.version != null ? String(published.version) : null,
      firstPublication: firstPublication,
      access: accessOf(pwa, published),
      link: publishedLink(project, published, publishedId)
    };
    // A save between the revision check and the publication: C8Oforms published that newer revision.
    if (published && trimmed(published.parentRev).length && trimmed(published.parentRev) !== rev) {
      result.publishedRev = trimmed(published.parentRev);
      result.warnings = [{
        code: "newer_revision_published",
        message: "The form was saved again during the publication: C8Oforms published revision " + result.publishedRev +
          ", not the revision the user checked. Tell the user."
      }];
    }
    if (validation.warningCount) {
      result.validation = { warningCount: validation.warningCount, warnings: validation.warnings };
    }
    return result;
  };
})();
