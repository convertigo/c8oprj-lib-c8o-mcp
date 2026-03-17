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

  function httpFetchText(url, timeoutMs) {
    var URL = Packages.java.net.URL;
    var connection = null;
    var responseCode = 0;
    var responseText = "";
    var errorText = "";
    var finalUrl = trimmed(url);
    var timeout = toInt(timeoutMs, 10000);
    try {
      connection = new URL(finalUrl).openConnection();
      if (connection.setConnectTimeout) {
        connection.setConnectTimeout(timeout);
      }
      if (connection.setReadTimeout) {
        connection.setReadTimeout(timeout);
      }
      if (connection.setRequestMethod) {
        connection.setRequestMethod("GET");
      }
      if (connection.setRequestProperty) {
        connection.setRequestProperty("Accept", "text/html,application/javascript,text/javascript,*/*");
        connection.setRequestProperty("Accept-Encoding", "identity");
      }
      responseCode = connection.getResponseCode ? Number(connection.getResponseCode() || 0) : 200;
      try {
        finalUrl = String(connection.getURL ? connection.getURL() : finalUrl);
      } catch (_ignoreFinalUrl) {}
      if (responseCode >= 400 && connection.getErrorStream) {
        errorText = readJavaStream(connection.getErrorStream());
      } else if (connection.getInputStream) {
        responseText = readJavaStream(connection.getInputStream());
      }
    } finally {
      if (connection && connection.disconnect) {
        try {
          connection.disconnect();
        } catch (_ignoreDisconnect) {}
      }
    }
    return {
      url: trimmed(url),
      finalUrl: finalUrl,
      statusCode: responseCode,
      body: responseText,
      errorBody: errorText
    };
  }

  function resolveUrl(baseUrl, relativeUrl) {
    var URL = Packages.java.net.URL;
    var base = trimmed(baseUrl);
    var relative = trimmed(relativeUrl);
    if (!relative.length) {
      return base;
    }
    try {
      return String(new URL(new URL(base), relative).toString());
    } catch (_ignoreResolveUrl) {
      return relative;
    }
  }

  function parseScriptUrls(html, baseUrl) {
    var sources = [];
    var seen = {};
    var text = String(html || "");
    var htmlBase = trimmed(baseUrl);
    var baseMatch = /<base[^>]+href=["']([^"']+)["']/i.exec(text);
    if (baseMatch && baseMatch.length > 1) {
      htmlBase = resolveUrl(baseUrl, baseMatch[1]);
    }
    var pattern = /<script[^>]+src=["']([^"']+\.js[^"']*)["']/ig;
    var match = null;
    while ((match = pattern.exec(text)) !== null) {
      var resolved = resolveUrl(htmlBase || baseUrl, match[1]);
      if (!resolved.length || seen[resolved]) {
        continue;
      }
      seen[resolved] = true;
      sources.push(resolved);
    }
    return sources;
  }

  function readTextFile(fileRef) {
    var Files = Packages.java.nio.file.Files;
    var StandardCharsets = Packages.java.nio.charset.StandardCharsets;
    if (!fileRef || !fileRef.exists || !fileRef.exists()) {
      return "";
    }
    return String(Files.readString(fileRef.toPath(), StandardCharsets.UTF_8));
  }

  function listViewerBundleFiles(projectName) {
    var File = Packages.java.io.File;
    var projectDir = C8O.project.resolveProjectDirectory({ projectName: projectName });
    var displayDir = new File(projectDir, "DisplayObjects/mobile");
    var result = {
      displayDir: displayDir,
      indexFile: new File(displayDir, "index.html"),
      bundles: []
    };
    if (!displayDir.exists() || !displayDir.isDirectory()) {
      return result;
    }
    var children = displayDir.listFiles() || [];
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (!child || !child.isFile || !child.isFile()) {
        continue;
      }
      var childName = trimmed(child.getName());
      if (/\.js$/i.test(childName)) {
        result.bundles.push(child);
      }
    }
    return result;
  }

  function viewerBundleMarkers(projectName, facadePrefix, hasCrmRelation, sequenceQNames) {
    var prefix = trimmed(facadePrefix || "crud");
    var markers = [];
    var sequences = ensureArray(sequenceQNames);
    for (var i = 0; i < sequences.length; i++) {
      var qname = trimmed(sequences[i]);
      if (!qname.length) {
        continue;
      }
      var basename = qname.indexOf(".") === -1 ? qname : qname.split(".").pop();
      if (basename.indexOf(":") !== -1) {
        basename = basename.split(":").pop();
      }
      if (basename.indexOf(prefix + "_list_") === 0) {
        markers.push(basename);
      }
    }
    if (hasCrmRelation) {
      markers.push(prefix + "_list_company_contacts");
      markers.push(trimmed(projectName) + ".crm_list_company_contacts");
    }
    markers = dedupeList(markers);
    if (!markers.length) {
      markers = ["crudFacadeRequestables"];
    }
    return markers;
  }

  function parseImportedScriptUrls(bundleText, baseUrl) {
    var urls = [];
    var seen = {};
    var text = String(bundleText || "");
    var pattern = /["']((?:\.\/|\.\.\/|\/)[^"']+\.js(?:\?[^"']*)?)["']/g;
    var match = null;
    while ((match = pattern.exec(text)) !== null) {
      var resolved = resolveUrl(baseUrl, match[1]);
      if (!resolved.length || seen[resolved]) {
        continue;
      }
      seen[resolved] = true;
      urls.push(resolved);
    }
    return urls;
  }

  function dedupeList(values) {
    var out = [];
    var seen = {};
    var list = ensureArray(values);
    for (var i = 0; i < list.length; i++) {
      var value = trimmed(list[i]);
      if (!value.length || seen[value]) {
        continue;
      }
      seen[value] = true;
      out.push(value);
    }
    return out;
  }

  function normalizeViewerCandidateUrls(viewerUrl) {
    var raw = trimmed(viewerUrl);
    var candidates = [];
    if (!raw.length) {
      return candidates;
    }
    candidates.push(raw);
    var noHash = raw.replace(/#.*$/, "").replace(/\?.*$/, "");
    candidates.push(noHash);
    if (/\/displayobjects\/mobile\/index\.html$/i.test(noHash)) {
      var prodRoot = noHash.replace(/\/displayobjects\/mobile\/index\.html$/i, "");
      candidates.push(prodRoot);
      candidates.push(prodRoot + "/home");
    }
    if (/\/home$/i.test(noHash)) {
      candidates.push(noHash.replace(/\/home$/i, ""));
    }
    return dedupeList(candidates);
  }

  function probeViewer(viewerUrl, projectName, facadePrefix, hasCrmRelation, sequenceQNames, warnings) {
    var probe = {
      attempted: false,
      ok: false,
      url: trimmed(viewerUrl),
      finalUrl: trimmed(viewerUrl),
      statusCode: 0,
      htmlOk: false,
      bundleCount: 0,
      displayPath: "",
      indexPath: "",
      scriptUrls: [],
      fetchedBundles: [],
      markersFound: [],
      missingMarkers: [],
      message: ""
    };
    probe.attempted = true;
    try {
      var rootFetch = null;
      var appHtml = "";
      var appUrl = trimmed(viewerUrl);
      if (probe.url.length) {
        var remoteCandidates = normalizeViewerCandidateUrls(probe.url);
        for (var remoteIndex = 0; remoteIndex < remoteCandidates.length && !appHtml.length; remoteIndex++) {
          try {
            rootFetch = httpFetchText(remoteCandidates[remoteIndex], 10000);
            probe.statusCode = Number(rootFetch.statusCode || 0);
            probe.finalUrl = trimmed(rootFetch.finalUrl || remoteCandidates[remoteIndex]);
            var rootBody = String(rootFetch.body || "");
            if (rootBody.indexOf("<app-root") !== -1 || rootBody.indexOf("<ion-app") !== -1) {
              appHtml = rootBody;
              appUrl = probe.finalUrl;
            } else if (rootBody.indexOf("Convertigo FlashUpdate") !== -1 || rootBody.indexOf("flashupdate.js") !== -1) {
              var candidateUrls = [
                resolveUrl(probe.finalUrl || remoteCandidates[remoteIndex], "displayobjects/mobile/index.html"),
                resolveUrl(probe.finalUrl || remoteCandidates[remoteIndex], "DisplayObjects/mobile/index.html")
              ];
              for (var candidateIndex = 0; candidateIndex < candidateUrls.length; candidateIndex++) {
                var candidateFetch = httpFetchText(candidateUrls[candidateIndex], 10000);
                var candidateBody = String(candidateFetch.body || "");
                if (candidateFetch.statusCode >= 200 && candidateFetch.statusCode < 400 && (candidateBody.indexOf("<app-root") !== -1 || candidateBody.indexOf("<ion-app") !== -1)) {
                  appHtml = candidateBody;
                  appUrl = trimmed(candidateFetch.finalUrl || candidateUrls[candidateIndex]);
                  probe.statusCode = Number(candidateFetch.statusCode || probe.statusCode || 0);
                  probe.finalUrl = appUrl;
                  break;
                }
              }
            }
          } catch (remoteViewerError) {
            if (warnings) {
              warnings.push("Viewer remote probe candidate failed for " + remoteCandidates[remoteIndex] + ": " + String(remoteViewerError));
            }
          }
        }
      }
      var viewerFiles = listViewerBundleFiles(projectName);
      probe.displayPath = viewerFiles.displayDir ? String(viewerFiles.displayDir.getAbsolutePath()) : "";
      probe.indexPath = viewerFiles.indexFile ? String(viewerFiles.indexFile.getAbsolutePath()) : "";
      var htmlBody = appHtml.length ? appHtml : readTextFile(viewerFiles.indexFile);
      if (!probe.statusCode) {
        probe.statusCode = htmlBody.length ? 200 : 0;
      }
      probe.htmlOk = htmlBody.length > 0 && (htmlBody.indexOf("<app-root") !== -1 || htmlBody.indexOf("<ion-app") !== -1 || htmlBody.indexOf("<title>") !== -1);
      probe.scriptUrls = appUrl.length ? parseScriptUrls(htmlBody, appUrl) : [];
      var bundleSources = [];
      var maxBundles = Math.min(probe.scriptUrls.length, 24);
      for (var i = 0; i < maxBundles; i++) {
        var bundleUrl = probe.scriptUrls[i];
        try {
          var bundleFetch = httpFetchText(bundleUrl, 10000);
          var bundleText = String(bundleFetch.body || "");
          probe.fetchedBundles.push({
            url: bundleUrl,
            statusCode: Number(bundleFetch.statusCode || 0),
            size: bundleText.length
          });
          if (bundleText.length) {
            bundleSources.push(bundleText);
          }
        } catch (bundleFetchError) {
          probe.fetchedBundles.push({
            url: bundleUrl,
            statusCode: 0,
            size: 0
          });
          if (warnings) {
            warnings.push("Viewer bundle fetch fallback to local file for " + bundleUrl + ": " + String(bundleFetchError));
          }
        }
      }
      var importedBundleUrls = [];
      for (var sourceIndex = 0; sourceIndex < bundleSources.length; sourceIndex++) {
        importedBundleUrls = importedBundleUrls.concat(parseImportedScriptUrls(bundleSources[sourceIndex], appUrl));
      }
      importedBundleUrls = dedupeList(importedBundleUrls);
      var importedLimit = Math.min(importedBundleUrls.length, 12);
      for (var importedIndex = 0; importedIndex < importedLimit; importedIndex++) {
        var importedUrl = importedBundleUrls[importedIndex];
        try {
          var importedFetch = httpFetchText(importedUrl, 10000);
          var importedText = String(importedFetch.body || "");
          probe.fetchedBundles.push({
            url: importedUrl,
            statusCode: Number(importedFetch.statusCode || 0),
            size: importedText.length
          });
          if (importedText.length) {
            bundleSources.push(importedText);
          }
        } catch (importedFetchError) {
          probe.fetchedBundles.push({
            url: importedUrl,
            statusCode: 0,
            size: 0
          });
          if (warnings) {
            warnings.push("Viewer imported bundle fallback to local file for " + importedUrl + ": " + String(importedFetchError));
          }
        }
      }
      if (!bundleSources.length && viewerFiles.bundles && viewerFiles.bundles.length) {
        var fallbackBundleCount = Math.min(viewerFiles.bundles.length, 24);
        for (var fallbackIndex = 0; fallbackIndex < fallbackBundleCount; fallbackIndex++) {
          var fallbackBundleFile = viewerFiles.bundles[fallbackIndex];
          var fallbackBundleUrl = String(fallbackBundleFile.getAbsolutePath());
          var fallbackBundleText = readTextFile(fallbackBundleFile);
          probe.fetchedBundles.push({
            url: fallbackBundleUrl,
            statusCode: fallbackBundleText.length ? 200 : 0,
            size: fallbackBundleText.length
          });
          if (fallbackBundleText.length) {
            bundleSources.push(fallbackBundleText);
          }
        }
      }
      probe.bundleCount = probe.fetchedBundles.length;
      var bundleTextJoined = bundleSources.join("\n");
      var markers = viewerBundleMarkers(projectName, facadePrefix, hasCrmRelation, sequenceQNames);
      for (var markerIndex = 0; markerIndex < markers.length; markerIndex++) {
        var marker = markers[markerIndex];
        if (bundleTextJoined.indexOf(marker) !== -1) {
          probe.markersFound.push(marker);
        } else {
          probe.missingMarkers.push(marker);
        }
      }
      probe.markersFound = dedupeList(probe.markersFound);
      probe.missingMarkers = dedupeList(probe.missingMarkers);
      probe.ok = probe.htmlOk && probe.missingMarkers.length === 0;
      probe.message = probe.ok
        ? "Viewer build artifacts exist and include the expected CRM bundle markers."
        : ("Viewer probe failed. statusCode=" + probe.statusCode + ", missingMarkers=" + probe.missingMarkers.join(", "));
    } catch (viewerError) {
      probe.ok = false;
      probe.message = "Viewer probe failed: " + String(viewerError);
      if (warnings) {
        warnings.push(probe.message);
      }
    }
    return probe;
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
      trimmed: trimmed,
      ensureArray: ensureArray,
      pluralize: pluralize,
      normalizedIdentifier: normalizedIdentifier,
      crmRelationContext: crmRelationContext,
      buildSeedSql: buildSeedSql,
      ensureChild: ensureChild,
      createChild: createChild,
      findChild: findChild,
      applyUpdates: applyUpdates,
      connectorProperties: connectorProperties,
      priorityOf: priorityOf,
      ucfirst: ucfirst
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
      normalizedIdentifier: normalizedIdentifier,
      normalizeStatus: normalizeStatus,
      isSuccessLikeStatus: isSuccessLikeStatus,
      dedupeStrings: dedupeStrings,
      toJsonSafe: C8O.util && typeof C8O.util.toJsonSafe === "function" ? C8O.util.toJsonSafe : null,
      callInternalSequence: callInternalSequence
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

  function triggerUiSourceRefreshTargets(targets, result, evidencePath) {
    var summary = {
      requested: false,
      studioMode: false,
      mobileObject: false,
      triggered: false,
      message: "",
      strategy: "",
      resetQNames: [],
      targets: []
    };
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    var MobileBuilder = Packages.com.twinsoft.convertigo.engine.mobile.MobileBuilder;
    var BatchOperationHelper = Packages.com.twinsoft.convertigo.engine.helpers.BatchOperationHelper;
    try {
      summary.studioMode = Engine.isStudioMode() === true;
    } catch (_ignoreStudioMode) {
      summary.studioMode = false;
    }
    var unique = {};
    var entries = ensureArray(targets);
    var strategySet = {};
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var qname = trimmed(typeof entry === "string" ? entry : (entry && entry.qname));
      if (!qname.length || unique[qname]) {
        continue;
      }
      unique[qname] = true;
      var targetResult = {
        target: qname,
        requested: false,
        triggered: false,
        strategy: "",
        resetQNames: [],
        message: ""
      };
      var dbo = null;
      try {
        dbo = C8O.dbo.resolve(qname, { optional: true });
      } catch (_ignoreResolveTarget) {
        dbo = null;
      }
      if (!dbo) {
        targetResult.message = "Skipped: target not found";
        summary.targets.push(targetResult);
        continue;
      }
      var mobileObject = false;
      try {
        mobileObject = C8O.dbo._isMobileObject(dbo) === true;
      } catch (_ignoreMobileObject) {
        mobileObject = false;
      }
      summary.mobileObject = summary.mobileObject || mobileObject;
      targetResult.requested = summary.studioMode && mobileObject;
      summary.requested = summary.requested || targetResult.requested;
      if (!targetResult.requested) {
        targetResult.message = !summary.studioMode ? "Skipped: Studio mode required" : "Skipped: target is not a mobile object";
        summary.targets.push(targetResult);
        continue;
      }
      try {
        var mb = MobileBuilder.getBuilderOf(dbo);
        if (mb == null) {
          targetResult.message = "Skipped: no mobile builder for target";
          summary.targets.push(targetResult);
          continue;
        }
        var context = C8O.dbo._resolveNgxRefreshContext ? C8O.dbo._resolveNgxRefreshContext(dbo) : {
          mainScriptComponent: null,
          application: null,
          resetQNames: []
        };
        if (context && context.resetQNames && context.resetQNames.length) {
          targetResult.resetQNames = ensureArray(context.resetQNames);
          summary.resetQNames = summary.resetQNames.concat(targetResult.resetQNames);
        }
        var batchStarted = false;
        var batchStopped = false;
        try {
          mb.prepareBatchBuild();
          BatchOperationHelper.start();
          batchStarted = true;
          var strategies = [];
          var mainComponent = context ? context.mainScriptComponent : null;
          var application = context ? context.application : null;
          if (mainComponent != null && typeof mainComponent.updateSourceFiles === "function") {
            mainComponent.updateSourceFiles();
            strategies.push("mainScriptComponent.updateSourceFiles");
          }
          if (application != null
            && typeof application.updateSourceFiles === "function"
            && application !== mainComponent) {
            application.updateSourceFiles();
            strategies.push("application.updateSourceFiles");
          }
          if (!strategies.length) {
            mb.appChanged();
            strategies.push("builder.appChanged");
          }
          BatchOperationHelper.stop();
          batchStopped = true;
          targetResult.triggered = true;
          targetResult.strategy = strategies.join(" + ");
          targetResult.message = "Mobile builder refresh triggered via " + targetResult.strategy;
          for (var strategyIndex = 0; strategyIndex < strategies.length; strategyIndex++) {
            strategySet[strategies[strategyIndex]] = true;
          }
          summary.triggered = true;
        } finally {
          if (batchStarted && !batchStopped) {
            try {
              BatchOperationHelper.stop();
            } catch (_ignoreBatchStop) {}
          }
        }
      } catch (refreshError) {
        targetResult.message = "Unable to trigger mobile builder refresh: " + String(refreshError);
        addWarning(result, targetResult.message + " (" + qname + ")");
      }
      summary.targets.push(targetResult);
    }
    var strategiesOut = Object.keys(strategySet);
    summary.strategy = strategiesOut.join(" | ");
    summary.message = summary.triggered
      ? "Mobile builder refresh triggered for " + String(summary.targets.filter(function (item) { return item.triggered; }).length) + " target(s)."
      : "Mobile builder refresh skipped.";
    if (!summary.resetQNames.length) {
      delete summary.resetQNames;
    }
    return summary;
  }

  function dboCommentText(dbo) {
    if (!dbo || typeof dbo.getComment !== "function") {
      return "";
    }
    try {
      return trimmed(dbo.getComment());
    } catch (_ignoreComment) {
      return "";
    }
  }

  function isManagedCrudPage(page) {
    var comment = dboCommentText(page);
    return comment.indexOf("Deterministic CRUD entity page") === 0;
  }

  function isManagedCrudSharedComponent(component) {
    var comment = dboCommentText(component);
    if (!comment.length) {
      return false;
    }
    return comment.indexOf("Deterministic CRUD") === 0
      || comment.indexOf("CRM live-state") === 0
      || comment.indexOf("Temporary dashboard bootstrap card") === 0;
  }

  function isManagedCrudSharedAction(actionStack) {
    var name = "";
    try {
      name = trimmed(actionStack && actionStack.getName ? actionStack.getName() : "");
    } catch (_ignoreActionName) {
      name = "";
    }
    if (name.indexOf("crud_") === 0 || name.indexOf("crm_") === 0) {
      return true;
    }
    var comment = dboCommentText(actionStack);
    return comment.indexOf("CRUD ") === 0 || comment.indexOf("CRM ") === 0;
  }

  function collectManagedCrudCleanupQNames(ngxApp, expectedQNames) {
    var expected = {};
    var entries = ensureArray(expectedQNames);
    for (var i = 0; i < entries.length; i++) {
      var expectedQName = trimmed(entries[i]);
      if (expectedQName.length) {
        expected[expectedQName] = true;
      }
    }
    var stale = [];
    function pushIfManaged(list, predicate) {
      var values = ensureArray(list);
      for (var index = 0; index < values.length; index++) {
        var dbo = values[index];
        var qname = "";
        try {
          qname = trimmed(dbo && dbo.getQName ? dbo.getQName() : "");
        } catch (_ignoreQName) {
          qname = "";
        }
        if (!qname.length || expected[qname]) {
          continue;
        }
        if (predicate(dbo)) {
          stale.push(qname);
        }
      }
    }
    try {
      pushIfManaged(ngxApp && ngxApp.getPageComponentList ? ngxApp.getPageComponentList() : [], isManagedCrudPage);
    } catch (_ignorePages) {}
    try {
      pushIfManaged(ngxApp && ngxApp.getSharedActionList ? ngxApp.getSharedActionList() : [], isManagedCrudSharedAction);
    } catch (_ignoreActions) {}
    try {
      pushIfManaged(ngxApp && ngxApp.getSharedComponentList ? ngxApp.getSharedComponentList() : [], isManagedCrudSharedComponent);
    } catch (_ignoreComponents) {}
    return stale;
  }

  function deleteFileRecursively(file) {
    if (!file || !file.exists()) {
      return 0;
    }
    var deleted = 0;
    if (file.isDirectory()) {
      var children = file.listFiles();
      if (children != null) {
        for (var i = 0; i < children.length; i++) {
          deleted += deleteFileRecursively(children[i]);
        }
      }
    }
    if (file.delete()) {
      deleted += 1;
    }
    return deleted;
  }

  function cleanupGeneratedIonicSources(projectName, ngxApp) {
    var File = Packages.java.io.File;
    var projectDir = C8O.project.resolveProjectDirectory({ projectName: projectName });
    var appDir = new File(projectDir, "_private/ionic/src/app");
    var pagesDir = new File(appDir, "pages");
    var componentsDir = new File(appDir, "components");
    var expectedPageDirs = {};
    var expectedComponentDirs = {};
    var projectPrefix = normalizedIdentifier(projectName).toLowerCase();
    try {
      var pageList = ensureArray(ngxApp && ngxApp.getPageComponentList ? ngxApp.getPageComponentList() : []);
      for (var pageIndex = 0; pageIndex < pageList.length; pageIndex++) {
        var pageName = trimmed(pageList[pageIndex] && pageList[pageIndex].getName ? pageList[pageIndex].getName() : "").toLowerCase();
        if (pageName.length) {
          expectedPageDirs[pageName] = true;
        }
      }
    } catch (_ignorePageList) {}
    try {
      var sharedList = ensureArray(ngxApp && ngxApp.getSharedComponentList ? ngxApp.getSharedComponentList() : []);
      for (var sharedIndex = 0; sharedIndex < sharedList.length; sharedIndex++) {
        var sharedName = trimmed(sharedList[sharedIndex] && sharedList[sharedIndex].getName ? sharedList[sharedIndex].getName() : "");
        if (sharedName.length) {
          expectedComponentDirs[projectPrefix + "." + normalizedIdentifier(sharedName).toLowerCase()] = true;
        }
      }
    } catch (_ignoreSharedList) {}
    var summary = {
      pagesRemoved: [],
      componentsRemoved: [],
      deletedCount: 0
    };
    if (pagesDir.exists()) {
      var pageDirs = pagesDir.listFiles();
      if (pageDirs != null) {
        for (var i = 0; i < pageDirs.length; i++) {
          var pageDir = pageDirs[i];
          if (!pageDir.isDirectory()) {
            continue;
          }
          var pageDirName = String(pageDir.getName()).toLowerCase();
          if (expectedPageDirs[pageDirName]) {
            continue;
          }
          summary.deletedCount += deleteFileRecursively(pageDir);
          summary.pagesRemoved.push(pageDirName);
        }
      }
    }
    if (componentsDir.exists()) {
      var componentDirs = componentsDir.listFiles();
      if (componentDirs != null) {
        for (var j = 0; j < componentDirs.length; j++) {
          var componentDir = componentDirs[j];
          if (!componentDir.isDirectory()) {
            continue;
          }
          var componentDirName = String(componentDir.getName()).toLowerCase();
          if (componentDirName.indexOf(projectPrefix + ".") !== 0) {
            continue;
          }
          if (expectedComponentDirs[componentDirName]) {
            continue;
          }
          summary.deletedCount += deleteFileRecursively(componentDir);
          summary.componentsRemoved.push(componentDirName);
        }
      }
    }
    return summary;
  }

  function purgeManagedGeneratedIonicSources(projectName, pageNames, sharedComponentNames) {
    var File = Packages.java.io.File;
    var projectDir = C8O.project.resolveProjectDirectory({ projectName: projectName });
    var appDir = new File(projectDir, "_private/ionic/src/app");
    var pagesDir = new File(appDir, "pages");
    var componentsDir = new File(appDir, "components");
    var projectPrefix = normalizedIdentifier(projectName).toLowerCase();
    var summary = {
      pageDirsPurged: [],
      componentDirsPurged: [],
      deletedCount: 0
    };
    var seen = {};
    var pageEntries = ensureArray(pageNames);
    for (var i = 0; i < pageEntries.length; i++) {
      var pageName = trimmed(pageEntries[i]).toLowerCase();
      if (!pageName.length || seen["page:" + pageName]) {
        continue;
      }
      seen["page:" + pageName] = true;
      var pageDir = new File(pagesDir, pageName);
      if (pageDir.exists()) {
        summary.deletedCount += deleteFileRecursively(pageDir);
        summary.pageDirsPurged.push(pageName);
      }
    }
    var sharedEntries = ensureArray(sharedComponentNames);
    for (var j = 0; j < sharedEntries.length; j++) {
      var rawShared = trimmed(sharedEntries[j]);
      if (!rawShared.length) {
        continue;
      }
      var sharedName = rawShared;
      var lastDot = sharedName.lastIndexOf(".");
      if (lastDot >= 0) {
        sharedName = sharedName.substring(lastDot + 1);
      }
      var componentDirName = projectPrefix + "." + normalizedIdentifier(sharedName).toLowerCase();
      if (!componentDirName.length || seen["component:" + componentDirName]) {
        continue;
      }
      seen["component:" + componentDirName] = true;
      var componentDir = new File(componentsDir, componentDirName);
      if (componentDir.exists()) {
        summary.deletedCount += deleteFileRecursively(componentDir);
        summary.componentDirsPurged.push(componentDirName);
      }
    }
    return summary;
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

  function extractRowField(row, candidates) {
    return C8O.crudProof.extractRowField(crudProofContext(), row, candidates);
  }

  function dedupeStrings(values) {
    var seen = {};
    var deduped = [];
    var items = ensureArray(values);
    for (var i = 0; i < items.length; i++) {
      var current = trimmed(items[i]);
      if (!current.length || seen[current]) {
        continue;
      }
      seen[current] = true;
      deduped.push(current);
    }
    return deduped;
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
    if (!result.missing) {
      result.missing = [];
    }
    if (trimmed(value).length) {
      result.missing.push(String(value));
    }
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

  function dashboardStatCardTree(componentName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Deterministic CRUD dashboard stat card."
      },
      children: [
        compVariableNode("Title", "'Title'"),
        compVariableNode("Value", "'0'"),
        compVariableNode("Caption", "''"),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "DashboardCard",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "DashboardHeader",
              children: [
                {
                  className: "ngx.components.UIDynamicElement#CardTitle",
                  name: "DashboardTitleSlot",
                  children: [plainTextNode("TitleText", "Title")]
                }
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "DashboardContent",
              children: [
                plainTextNode("ValueText", "0"),
                plainTextNode("CaptionText", "")
              ]
            }
          ]
        }
      ]
    };
  }

  function crudPageHeaderTree(componentName, projectName, entities) {
    var defaultTitle = ucfirst(projectName) + " Live Dashboard";
    var defaultSubtitle = entities.map(function (entity) {
      return entity.label;
    }).join(" and ");
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Deterministic CRUD page header shared shell."
      },
      children: [
        compVariableNode("Title", scriptLiteral(defaultTitle)),
        compVariableNode("Subtitle", scriptLiteral(defaultSubtitle)),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "CrudPageHeaderCard",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "CrudPageHeaderHeader",
              children: [
                {
                  className: "ngx.components.UIDynamicElement#CardTitle",
                  name: "CrudPageHeaderTitleSlot",
                  children: [plainTextNode("TitleText", defaultTitle)]
                }
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "CrudPageHeaderContent",
              children: [plainTextNode("SubtitleText", defaultSubtitle)]
            }
          ]
        }
      ]
    };
  }

  function stateComponentTree(componentName, comment, variableSpecs, shellName, lines, includeRetryButton) {
    var children = [];
    for (var i = 0; i < variableSpecs.length; i++) {
      children.push(compVariableNode(variableSpecs[i].name, variableSpecs[i].defaultValue, variableSpecs[i].comment));
    }
    var contentChildren = [];
    for (var line = 0; line < lines.length; line++) {
      contentChildren.push(plainTextNode(lines[line].nodeName, lines[line].defaultText));
    }
    if (includeRetryButton) {
      contentChildren.push({
        className: "ngx.components.UIDynamicElement#Button",
        name: "RetryButton",
        children: [plainTextNode("RetryText", "Retry")]
      });
    }
    children.push({
      className: "ngx.components.UIDynamicElement#Card",
      name: shellName,
      children: [
        {
          className: "ngx.components.UIDynamicElement#CardContent",
          name: shellName + "Content",
          children: contentChildren
        }
      ]
    });
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: comment
      },
      children: children
    };
  }

  function entityTableTree(entity) {
    var componentName = ucfirst(entity.singular) + "Table";
    var previewFields = schemaPreviewFields(entity, 3, false);
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Deterministic CRUD table summary for " + entity.label + "."
      },
      children: [
        compVariableNode("Title", scriptLiteral(entity.label)),
        compVariableNode("CountLabel", "'0 items'"),
        compVariableNode("Summary", "'Awaiting facade proof'"),
        compVariableNode("Source", "''"),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: componentName + "Card",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: componentName + "Header",
              children: [
                {
                  className: "ngx.components.UIDynamicElement#CardTitle",
                  name: componentName + "TitleSlot",
                  children: [plainTextNode("TitleText", entity.label)]
                }
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: componentName + "Content",
              children: [
                plainTextNode("CountText", "0 items"),
                plainTextNode("SummaryText", "Awaiting facade proof"),
                plainTextNode("SourceText", ""),
                plainTextNode("ColumnsHeading", "Preview columns"),
                previewListNode(componentName + "ColumnsList", previewFields, "No schema columns")
              ]
            }
          ]
        }
      ]
    };
  }

  function entityCardTree(entity) {
    var componentName = ucfirst(entity.singular) + "Card";
    var previewFields = schemaPreviewFields(entity, 3, false);
    var primaryField = previewFields[0] || entity.primaryField || null;
    var secondaryField = previewFields[1] || previewFields[0] || entity.primaryField || null;
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Deterministic CRUD entity card for " + entity.label + "."
      },
      children: [
        compVariableNode("Title", scriptLiteral(ucfirst(entity.singular) + " snapshot")),
        compVariableNode("Primary", scriptLiteral(primaryField ? primaryField.label + " ready for live binding" : "Primary field ready for live binding")),
        compVariableNode("Secondary", scriptLiteral(secondaryField ? secondaryField.label + " ready for live binding" : "Secondary field ready for live binding")),
        compVariableNode("Insight", scriptLiteral("Live facade preview")),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: componentName + "Root",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: componentName + "Header",
              children: [
                {
                  className: "ngx.components.UIDynamicElement#CardTitle",
                  name: componentName + "TitleSlot",
                  children: [plainTextNode("TitleText", ucfirst(entity.singular))]
                }
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: componentName + "Content",
              children: [
                plainTextNode("PrimaryText", primaryField ? primaryField.label + " ready for live binding" : "Primary field ready for live binding"),
                plainTextNode("SecondaryText", secondaryField ? secondaryField.label + " ready for live binding" : "Secondary field ready for live binding"),
                plainTextNode("InsightText", "Live facade preview")
              ]
            }
          ]
        }
      ]
    };
  }

  function entityFormTree(entity) {
    var componentName = ucfirst(entity.singular) + "Form";
    var editableFields = schemaPreviewFields(entity, 4, false);
    var helperText = editableFields.length
      ? "Prepare " + editableFields.map(function (field) { return field.label; }).join(", ") + " before wiring save actions"
      : "Fields will be wired in a second pass";
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Deterministic CRUD form shell for " + entity.label + "."
      },
      children: [
        compVariableNode("Title", scriptLiteral("Edit " + ucfirst(entity.singular))),
        compVariableNode("Helper", scriptLiteral(helperText)),
        compVariableNode("Sample", scriptLiteral("Awaiting live facade sample")),
        compVariableNode("ActionLabel", scriptLiteral("Save " + entity.singular)),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: componentName + "Root",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: componentName + "Header",
              children: [
                {
                  className: "ngx.components.UIDynamicElement#CardTitle",
                  name: componentName + "TitleSlot",
                  children: [plainTextNode("TitleText", "Edit " + ucfirst(entity.singular))]
                }
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: componentName + "Content",
              children: [
                plainTextNode("HelperText", helperText),
                plainTextNode("SampleText", "Awaiting live facade sample"),
                {
                  className: "ngx.components.UIDynamicElement#Button",
                  name: "SubmitButton",
                  children: [plainTextNode("ActionText", "Save " + entity.singular)]
                }
              ]
            }
          ]
        }
      ]
    };
  }

  function buildSharedComponentsTree(projectName, entities) {
    var components = [
      dashboardStatCardTree("DashboardStatCard"),
      crudPageHeaderTree("CrudPageHeader", projectName, entities),
      stateComponentTree(
        "CrudLoadingState",
        "Deterministic CRUD loading state.",
        [{ name: "Message", defaultValue: "'Loading data from public facade...'" }],
        "LoadingStateCard",
        [{ nodeName: "LoadingText", defaultText: "Loading data from public facade..." }],
        false
      ),
      stateComponentTree(
        "CrudEmptyState",
        "Deterministic CRUD empty state.",
        [{ name: "Message", defaultValue: "'No rows available yet.'" }],
        "EmptyStateCard",
        [{ nodeName: "EmptyText", defaultText: "No rows available yet." }],
        false
      ),
      stateComponentTree(
        "CrudErrorRetryState",
        "Deterministic CRUD error and retry state.",
        [
          { name: "Message", defaultValue: "'Retry to reload the public facade.'" },
          { name: "ButtonLabel", defaultValue: "'Retry'" }
        ],
        "ErrorStateCard",
        [{ nodeName: "ErrorText", defaultText: "Retry to reload the public facade." }],
        true
      )
    ];
    for (var i = 0; i < entities.length; i++) {
      components.push(entityTableTree(entities[i]));
      components.push(entityCardTree(entities[i]));
      components.push(entityFormTree(entities[i]));
    }
    return {
      qnames: components.map(function (component) { return sharedComponentQName(projectName, component.name); }),
      tree: {
        children: components
      }
    };
  }

  function buildPageShellTree(projectName, entryPage, entities, evidence, facadePrefix) {
    var contactEntity = entities[0];
    var companyEntity = entities[Math.min(1, entities.length - 1)];
    var facadeToken = trimmed(facadePrefix || "crud");
    var pageTitle = ucfirst(projectName) + " Live Dashboard";
    var pageSubtitle = entities.map(function (entity) { return entity.label.toLowerCase(); }).join(" and ");
    var contactPreviewFields = schemaPreviewFields(contactEntity, 2, false);
    var companyPreviewFields = schemaPreviewFields(companyEntity, 2, false);
    var contactPrimary = contactPreviewFields[0] || contactEntity.primaryField || null;
    var contactSecondary = contactPreviewFields[1] || contactPreviewFields[0] || contactEntity.primaryField || null;
    var companyPrimary = companyPreviewFields[0] || companyEntity.primaryField || null;
    var companySecondary = companyPreviewFields[1] || companyPreviewFields[0] || companyEntity.primaryField || null;
    var contactCountSequence = facadeSequenceQName(projectName, facadeToken, contactEntity, "count");
    var companyCountSequence = facadeSequenceQName(projectName, facadeToken, companyEntity, "count");
    var contactListSequence = facadeSequenceQName(projectName, facadeToken, contactEntity, "list");
    var companyListSequence = facadeSequenceQName(projectName, facadeToken, companyEntity, "list");
    var contactCountSource = sequenceSourceValue(projectName, contactCountSequence, "?.sql_output?.[0]?.TOTAL");
    var companyCountSource = sequenceSourceValue(projectName, companyCountSequence, "?.sql_output?.[0]?.TOTAL");
    return {
      className: "ngx.components.UIDynamicElement#Content",
      name: "Content",
      children: [
        {
          className: "ngx.components.UIDynamicElement#Grid",
          name: "CrudDashboardGrid",
          children: [
            {
              className: "ngx.components.UIDynamicElement#GridRow",
              name: "HeaderRow",
              children: [
                {
                  className: "ngx.components.UIDynamicElement#GridCol",
                  name: "HeaderCol",
                  children: [
                    buildUseSharedNode(sharedComponentQName(projectName, "CrudPageHeader"), "UseCrudPageHeader", [
                      useVariableNode("Title", scriptLiteral(pageTitle)),
                      useVariableNode("Subtitle", scriptLiteral(pageSubtitle))
                    ])
                  ]
                }
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#GridRow",
              name: "MetricsRow",
              children: [
                {
                  className: "ngx.components.UIDynamicElement#GridCol",
                  name: "ContactsStatCol",
                  children: [
                    buildUseSharedNode(sharedComponentQName(projectName, "DashboardStatCard"), "UseContactsStatCard", [
                      useVariableNode("Title", scriptLiteral(contactEntity.label)),
                      useVariableNode("Value", contactCountSource),
                      useVariableNode("Caption", scriptLiteral("Loaded from public facade"))
                    ])
                  ]
                },
                {
                  className: "ngx.components.UIDynamicElement#GridCol",
                  name: "CompaniesStatCol",
                  children: [
                    buildUseSharedNode(sharedComponentQName(projectName, "DashboardStatCard"), "UseCompaniesStatCard", [
                      useVariableNode("Title", scriptLiteral(companyEntity.label)),
                      useVariableNode("Value", companyCountSource),
                      useVariableNode("Caption", scriptLiteral("Loaded from public facade"))
                    ])
                  ]
                }
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#GridRow",
              name: "EntityTablesRow",
              children: [
                {
                  className: "ngx.components.UIDynamicElement#GridCol",
                  name: "ContactsTableCol",
                  children: [
                    buildUseSharedNode(sharedComponentQName(projectName, ucfirst(contactEntity.singular) + "Table"), "Use" + ucfirst(contactEntity.singular) + "Table", [
                      useVariableNode("Title", scriptLiteral(contactEntity.label)),
                      useVariableNode("CountLabel", sequenceSourceValue(projectName, contactCountSequence, "?.sql_output?.[0]?.TOTAL", {
                        prefix: "'' + ",
                        suffix: " + ' rows'"
                      })),
                      useVariableNode("Summary", sequenceSourceValue(projectName, contactListSequence, "?.sql_output?.[0]", {
                        custom: "listen(['" + contactListSequence + "'])?.sql_output?.length + ' contact rows proved'",
                        useCustom: true
                      })),
                      useVariableNode("Source", scriptLiteral("Facade " + contactListSequence))
                    ])
                  ]
                },
                {
                  className: "ngx.components.UIDynamicElement#GridCol",
                  name: "CompaniesTableCol",
                  children: [
                    buildUseSharedNode(sharedComponentQName(projectName, ucfirst(companyEntity.singular) + "Table"), "Use" + ucfirst(companyEntity.singular) + "Table", [
                      useVariableNode("Title", scriptLiteral(companyEntity.label)),
                      useVariableNode("CountLabel", sequenceSourceValue(projectName, companyCountSequence, "?.sql_output?.[0]?.TOTAL", {
                        prefix: "'' + ",
                        suffix: " + ' rows'"
                      })),
                      useVariableNode("Summary", sequenceSourceValue(projectName, companyListSequence, "?.sql_output?.[0]", {
                        custom: "listen(['" + companyListSequence + "'])?.sql_output?.length + ' company rows proved'",
                        useCustom: true
                      })),
                      useVariableNode("Source", scriptLiteral("Facade " + companyListSequence))
                    ])
                  ]
                }
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#GridRow",
              name: "EntityCardsRow",
              children: [
                {
                  className: "ngx.components.UIDynamicElement#GridCol",
                  name: "ContactsCardCol",
                  children: [
                    buildUseSharedNode(sharedComponentQName(projectName, ucfirst(contactEntity.singular) + "Card"), "Use" + ucfirst(contactEntity.singular) + "Card", [
                      useVariableNode("Title", scriptLiteral(ucfirst(contactEntity.singular) + " snapshot")),
                      useVariableNode("Primary", sequenceSourceValue(projectName, contactListSequence, sqlOutputFieldPath(contactPrimary, 0))),
                      useVariableNode("Secondary", sequenceSourceValue(projectName, contactListSequence, sqlOutputFieldPath(contactSecondary, 0))),
                      useVariableNode("Insight", sequenceSourceValue(projectName, contactCountSequence, "?.sql_output?.[0]?.TOTAL", {
                        prefix: "'Facade snapshot: ' + ",
                        suffix: " + ' contacts'"
                      }))
                    ])
                  ]
                },
                {
                  className: "ngx.components.UIDynamicElement#GridCol",
                  name: "CompaniesCardCol",
                  children: [
                    buildUseSharedNode(sharedComponentQName(projectName, ucfirst(companyEntity.singular) + "Card"), "Use" + ucfirst(companyEntity.singular) + "Card", [
                      useVariableNode("Title", scriptLiteral(ucfirst(companyEntity.singular) + " snapshot")),
                      useVariableNode("Primary", sequenceSourceValue(projectName, companyListSequence, sqlOutputFieldPath(companyPrimary, 0))),
                      useVariableNode("Secondary", sequenceSourceValue(projectName, companyListSequence, sqlOutputFieldPath(companySecondary, 0))),
                      useVariableNode("Insight", sequenceSourceValue(projectName, companyCountSequence, "?.sql_output?.[0]?.TOTAL", {
                        prefix: "'Facade snapshot: ' + ",
                        suffix: " + ' companies'"
                      }))
                    ])
                  ]
                }
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#GridRow",
              name: "EntityFormsRow",
              children: [
                {
                  className: "ngx.components.UIDynamicElement#GridCol",
                  name: "ContactsFormCol",
                  children: [
                    buildUseSharedNode(sharedComponentQName(projectName, ucfirst(contactEntity.singular) + "Form"), "Use" + ucfirst(contactEntity.singular) + "Form", [
                      useVariableNode("Title", scriptLiteral("Edit " + ucfirst(contactEntity.singular))),
                      useVariableNode("Helper", sequenceSourceValue(projectName, contactCountSequence, "?.sql_output?.[0]?.TOTAL", {
                        prefix: "'Facade rows available: ' + ",
                        suffix: " + ' for contacts'"
                      })),
                      useVariableNode("Sample", sequenceSourceValue(projectName, contactListSequence, sqlOutputFieldPath(contactSecondary, 0), {
                        prefix: "'Sample live value: ' + ",
                        suffix: ""
                      })),
                      useVariableNode("ActionLabel", scriptLiteral("Save " + contactEntity.singular))
                    ])
                  ]
                },
                {
                  className: "ngx.components.UIDynamicElement#GridCol",
                  name: "CompaniesFormCol",
                  children: [
                    buildUseSharedNode(sharedComponentQName(projectName, ucfirst(companyEntity.singular) + "Form"), "Use" + ucfirst(companyEntity.singular) + "Form", [
                      useVariableNode("Title", scriptLiteral("Edit " + ucfirst(companyEntity.singular))),
                      useVariableNode("Helper", sequenceSourceValue(projectName, companyCountSequence, "?.sql_output?.[0]?.TOTAL", {
                        prefix: "'Facade rows available: ' + ",
                        suffix: " + ' for companies'"
                      })),
                      useVariableNode("Sample", sequenceSourceValue(projectName, companyListSequence, sqlOutputFieldPath(companySecondary, 0), {
                        prefix: "'Sample live value: ' + ",
                        suffix: ""
                      })),
                      useVariableNode("ActionLabel", scriptLiteral("Save " + companyEntity.singular))
                    ])
                  ]
                }
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#GridRow",
              name: "StatesRow",
              children: [
                {
                  className: "ngx.components.UIDynamicElement#GridCol",
                  name: "LoadingCol",
                  children: [
                    buildUseSharedNode(sharedComponentQName(projectName, "CrudLoadingState"), "UseCrudLoadingState", [
                      useVariableNode("Message", scriptLiteral("Loading data from public facade..."))
                    ])
                  ]
                },
                {
                  className: "ngx.components.UIDynamicElement#GridCol",
                  name: "ErrorRetryCol",
                  children: [
                    buildUseSharedNode(sharedComponentQName(projectName, "CrudErrorRetryState"), "UseCrudErrorRetryState", [
                      useVariableNode("Message", scriptLiteral("Retry if one facade call fails.")),
                      useVariableNode("ButtonLabel", scriptLiteral("Retry"))
                    ])
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
  }

  function buildPageLoadTree(projectName, entryPage, entities, facadePrefix) {
    return {
      qname: pageQName(projectName, entryPage),
      legacyQNames: [
        pageQName(projectName, entryPage) + ".PageEvent",
        pageQName(projectName, entryPage) + ".LoadCrudFacadeOnEnter"
      ],
      tree: {
        properties: {
          scriptContent: buildPageScriptContent(projectName, entities, facadePrefix)
        },
        children: []
      }
    };
  }

  function buildSharedBindingOperations(projectName, entities, result) {
    var componentBindings = [
      {
        componentName: "CrudPageHeader",
        bindings: [
          { suffix: ".CrudPageHeaderCard.CrudPageHeaderHeader.CrudPageHeaderTitleSlot.TitleText", variableName: "Title" },
          { suffix: ".CrudPageHeaderCard.CrudPageHeaderContent.SubtitleText", variableName: "Subtitle" }
        ]
      },
      {
        componentName: "DashboardStatCard",
        bindings: [
          { suffix: ".DashboardCard.DashboardHeader.DashboardTitleSlot.TitleText", variableName: "Title" },
          { suffix: ".DashboardCard.DashboardContent.ValueText", variableName: "Value" },
          { suffix: ".DashboardCard.DashboardContent.CaptionText", variableName: "Caption" }
        ]
      },
      {
        componentName: "CrudLoadingState",
        bindings: [
          { suffix: ".LoadingStateCard.LoadingStateCardContent.LoadingText", variableName: "Message" }
        ]
      },
      {
        componentName: "CrudEmptyState",
        bindings: [
          { suffix: ".EmptyStateCard.EmptyStateCardContent.EmptyText", variableName: "Message" }
        ]
      },
      {
        componentName: "CrudErrorRetryState",
        bindings: [
          { suffix: ".ErrorStateCard.ErrorStateCardContent.ErrorText", variableName: "Message" },
          { suffix: ".ErrorStateCard.ErrorStateCardContent.RetryButton.RetryText", variableName: "ButtonLabel" }
        ]
      }
    ];

    for (var i = 0; i < entities.length; i++) {
      var componentPrefix = ucfirst(entities[i].singular);
      componentBindings.push({
        componentName: componentPrefix + "Table",
        bindings: [
          { suffix: "." + componentPrefix + "TableCard." + componentPrefix + "TableHeader." + componentPrefix + "TableTitleSlot.TitleText", variableName: "Title" },
          { suffix: "." + componentPrefix + "TableCard." + componentPrefix + "TableContent.CountText", variableName: "CountLabel" },
          { suffix: "." + componentPrefix + "TableCard." + componentPrefix + "TableContent.SummaryText", variableName: "Summary" },
          { suffix: "." + componentPrefix + "TableCard." + componentPrefix + "TableContent.SourceText", variableName: "Source" }
        ]
      });
      componentBindings.push({
        componentName: componentPrefix + "Card",
        bindings: [
          { suffix: "." + componentPrefix + "CardRoot." + componentPrefix + "CardHeader." + componentPrefix + "CardTitleSlot.TitleText", variableName: "Title" },
          { suffix: "." + componentPrefix + "CardRoot." + componentPrefix + "CardContent.PrimaryText", variableName: "Primary" },
          { suffix: "." + componentPrefix + "CardRoot." + componentPrefix + "CardContent.SecondaryText", variableName: "Secondary" },
          { suffix: "." + componentPrefix + "CardRoot." + componentPrefix + "CardContent.InsightText", variableName: "Insight" }
        ]
      });
      componentBindings.push({
        componentName: componentPrefix + "Form",
        bindings: [
          { suffix: "." + componentPrefix + "FormRoot." + componentPrefix + "FormHeader." + componentPrefix + "FormTitleSlot.TitleText", variableName: "Title" },
          { suffix: "." + componentPrefix + "FormRoot." + componentPrefix + "FormContent.HelperText", variableName: "Helper" },
          { suffix: "." + componentPrefix + "FormRoot." + componentPrefix + "FormContent.SampleText", variableName: "Sample" },
          { suffix: "." + componentPrefix + "FormRoot." + componentPrefix + "FormContent.SubmitButton.ActionText", variableName: "ActionLabel" }
        ]
      });
    }

    var operations = [];
    for (var bindingIndex = 0; bindingIndex < componentBindings.length; bindingIndex++) {
      var componentQName = sharedComponentQName(projectName, componentBindings[bindingIndex].componentName);
      var componentDbo = C8O.dbo.resolve(componentQName, { optional: true });
      if (!componentDbo) {
        addWarning(result, "Shared component missing after apply: " + componentQName);
        continue;
      }
      var componentPriority = priorityOf(componentDbo);
      for (var bindingEntry = 0; bindingEntry < componentBindings[bindingIndex].bindings.length; bindingEntry++) {
        var binding = componentBindings[bindingIndex].bindings[bindingEntry];
        operations.push({
          type: "setProperties",
          opId: "bind_" + normalizedIdentifier(componentBindings[bindingIndex].componentName + "_" + binding.variableName),
          qname: componentQName + binding.suffix,
          properties: {
            textValue: sharedSourceValue(projectName, componentPriority, binding.variableName)
          }
        });
      }
    }
    return operations;
  }

  function auditUiTreePayload(uiTree) {
    var serialized = JSON.stringify(uiTree || {});
    return {
      starterDominant: serialized.indexOf("WelcomeCard") !== -1,
      visibleShellPresent: /FeatureShell|CrudDashboardGrid|CrudEntityPageGrid|CrmMasterDetailGrid|UseCrudPageHeader|UseWorkInProgressCard|UseCrudLoadingState|UseCrudErrorRetryState|UseContactCard|UseContactTable|UseCompanyCard|UseCompanyTable|ListPanel|DetailCard|EditForm/.test(serialized),
      liveBindingPresent: /UIDynamicAction|UIDynamicInvoke|UIActionStack|UIControlDirective|UIControlVariable|UIUseShared|UIUseVariable|UIControlEvent/.test(serialized)
    };
  }

  function collectSharedRefs(node, refs) {
    refs = refs || [];
    if (!node || typeof node !== "object") {
      return refs;
    }
    if (node.properties && node.properties.sharedcomponent) {
      refs.push(String(node.properties.sharedcomponent));
    }
    var children = ensureArray(node.children);
    for (var i = 0; i < children.length; i++) {
      collectSharedRefs(children[i], refs);
    }
    return refs;
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
    var project = findProjectByName(spec.project);
    var crm = crmRelationContext(spec);
    var status = {
      status: "ok",
      project: spec.project,
      driverFamily: spec.database.driver.id,
      connectorQname: connector && connector.getFullQName ? String(connector.getFullQName()) : "",
      transactions: {
        present: [],
        missing: []
      },
      sequences: {
        present: [],
        missing: []
      },
      ui: {
        starterDominant: null,
        visibleShellPresent: false,
        liveBindingPresent: false,
        statefulActionsPresent: false,
        pageBootstrapPresent: false,
        workInProgressVisible: null,
        expectedGlobals: statefulUiGlobals(spec.ui.variant),
        targetQName: findPageContentQName(spec.project, spec.ui.entryPage)
      },
      crm: {
        enabled: !!crm,
        relationRequestable: crm ? (spec.project + "." + spec.facade.prefix + "_list_company_contacts") : ""
      },
      missing: [],
      warnings: []
    };

    var expectedTransactions = ["init_schema"];
    for (var i = 0; i < spec.entities.length; i++) {
      expectedTransactions.push(txName(spec.entities[i], "list"));
      expectedTransactions.push(txName(spec.entities[i], "count"));
      expectedTransactions.push(txName(spec.entities[i], "read"));
      expectedTransactions.push(txName(spec.entities[i], "create"));
      expectedTransactions.push(txName(spec.entities[i], "update"));
      expectedTransactions.push(txName(spec.entities[i], "delete"));
    }
    if (!spec.entities.length && connector && connector.getTransactionsList) {
      try {
        var txList = connector.getTransactionsList();
        for (var txIndex = 0; txIndex < txList.size(); txIndex++) {
          var txNameValue = trimmed(txList.get(txIndex).getName());
          if (txNameValue.length && expectedTransactions.indexOf(txNameValue) === -1) {
            expectedTransactions.push(txNameValue);
          }
        }
      } catch (_ignoreTxList) {}
    }

    for (var j = 0; j < expectedTransactions.length; j++) {
      var txQName = spec.project + "." + spec.database.connector + "." + expectedTransactions[j];
      if (C8O.dbo.resolve(txQName, { optional: true })) {
        status.transactions.present.push(txQName);
      } else {
        status.transactions.missing.push(txQName);
        status.missing.push(txQName);
      }
    }
    if (!crm && C8O.dbo.resolve(spec.project + "." + spec.database.connector + ".list_contacts", { optional: true }) && C8O.dbo.resolve(spec.project + "." + spec.database.connector + ".list_companies", { optional: true })) {
      crm = { inferred: true };
      status.crm.enabled = true;
      status.crm.relationRequestable = spec.project + "." + spec.facade.prefix + "_list_company_contacts";
    }
    if (status.crm.enabled) {
      var relationTxQName = spec.project + "." + spec.database.connector + ".list_company_contacts";
      if (C8O.dbo.resolve(relationTxQName, { optional: true })) {
        status.transactions.present.push(relationTxQName);
      } else {
        status.transactions.missing.push(relationTxQName);
        status.missing.push(relationTxQName);
      }
    }

    if (toBoolean(result.sequence, true)) {
      for (var k = 0; k < spec.entities.length; k++) {
        var entity = spec.entities[k];
        var verbs = ["list", "count", "read", "create", "update", "delete"];
        for (var v = 0; v < verbs.length; v++) {
          var seqName = spec.facade.prefix + "_" + txName(entity, verbs[v]);
          var seqQName = spec.project + "." + seqName;
          if (C8O.dbo.resolve(seqQName, { optional: true })) {
            status.sequences.present.push(seqQName);
          } else {
            status.sequences.missing.push(seqQName);
            status.missing.push(seqQName);
          }
        }
      }
      if (!spec.entities.length && project && project.getSequencesList) {
        try {
          var sequences = project.getSequencesList();
          var sequencePrefix = spec.project + ".sq:" + spec.facade.prefix + "_";
          for (var seqIndex = 0; seqIndex < sequences.size(); seqIndex++) {
            var sequence = sequences.get(seqIndex);
            var seqQNameAny = sequence.getFullQName ? String(sequence.getFullQName()) : "";
            if (seqQNameAny.indexOf(sequencePrefix) === 0) {
              status.sequences.present.push(seqQNameAny);
            }
          }
        } catch (_ignoreSequencesList) {}
      }
      if (status.crm.enabled) {
        var relationSeqQName = spec.project + "." + spec.facade.prefix + "_list_company_contacts";
        if (C8O.dbo.resolve(relationSeqQName, { optional: true })) {
          status.sequences.present.push(relationSeqQName);
        } else {
          status.sequences.missing.push(relationSeqQName);
          status.missing.push(relationSeqQName);
        }
      }
    }

    try {
      var uiTree = callInternalSequence("tools_databaseobject_tree_get", {
        target: status.ui.targetQName,
        childrenDepth: 5,
        properties: "none",
        limit: 320
      });
      var uiAudit = auditUiTreePayload(uiTree);
      status.ui.starterDominant = uiAudit.starterDominant;
      status.ui.visibleShellPresent = uiAudit.visibleShellPresent;
      status.ui.liveBindingPresent = uiAudit.liveBindingPresent;
    } catch (uiError) {
      addWarning(status, "Unable to inspect UI target: " + String(uiError));
    }

    try {
      var bootstrapStackQName = trimmed(spec.ui.variant).toLowerCase() === "master-detail"
        ? crmActionQName(spec.project, "crm_bootstrap_dashboard")
        : dashboardActionQName(spec.project, "crud_bootstrap_dashboard");
      var retryStackQName = trimmed(spec.ui.variant).toLowerCase() === "master-detail"
        ? crmActionQName(spec.project, "crm_retry_dashboard")
        : dashboardActionQName(spec.project, "crud_retry_dashboard");
      status.ui.statefulActionsPresent = !!(C8O.dbo.resolve(bootstrapStackQName, { optional: true }) && C8O.dbo.resolve(retryStackQName, { optional: true }));
    } catch (uiActionError) {
      addWarning(status, "Unable to inspect UI shared actions: " + String(uiActionError));
    }

    try {
      var pageTree = callInternalSequence("tools_databaseobject_tree_get", {
        target: pageQName(spec.project, spec.ui.entryPage),
        childrenDepth: 2,
        properties: "all",
        limit: 180
      });
      var pageNames = collectTreeNames(pageTree && pageTree.tree, []);
      var pageScriptContent = "";
      if (pageTree && pageTree.tree && pageTree.tree.properties && pageTree.tree.properties.scriptContent != null) {
        pageScriptContent = String(pageTree.tree.properties.scriptContent);
      }
      var hasPageEventBootstrap = pageNames.indexOf("PageEvent") !== -1 && pageNames.indexOf("InvokeBootstrapDashboard") !== -1;
      var hasScriptBootstrap = trimmed(spec.ui.variant).toLowerCase() === "master-detail"
        ? /bootstrapCrmDashboardState|crmBuildStage/.test(pageScriptContent)
        : /bootstrapCrudDashboardState|crudBuildStage/.test(pageScriptContent);
      status.ui.pageBootstrapPresent = hasPageEventBootstrap || hasScriptBootstrap;
    } catch (pageInspectError) {
      addWarning(status, "Unable to inspect UI page bootstrap hook: " + String(pageInspectError));
    }

    if (status.missing.length) {
      status.status = "partial";
    }
    return status;
  }

  function upsertCrud(options) {
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
      sequence: toBoolean(options.sequence, true),
      uiEnabled: toBoolean(options.ui, false)
    };

    var spec = normalizeSpec(options.spec);
    result.project = spec.project;
    result.driverFamily = spec.database.driver.id;
    var project = ensureProject(spec, result);
    var connector = ensureConnector(project, spec, result);
    result.connectorQname = connector.getFullQName ? String(connector.getFullQName()) : (spec.project + "." + spec.database.connector);
    result.primaryTargets.sql = result.connectorQname;

    ensureSqlTransaction(connector, "BeginTransaction", "BEGIN;", SqlTransaction.AUTOCOMMIT_OFF, result);
    ensureSqlTransaction(connector, "CommitTransaction", "COMMIT;", SqlTransaction.AUTOCOMMIT_OFF, result);
    ensureSqlTransaction(connector, "RollbackTransaction", "ROLLBACK;", SqlTransaction.AUTOCOMMIT_OFF, result);
    ensureSqlTransaction(connector, "init_schema", buildInitSql(spec), SqlTransaction.AUTOCOMMIT_OFF, result);

    var crm = crmRelationContext(spec);
    for (var i = 0; i < spec.entities.length; i++) {
      var entity = spec.entities[i];
      var listTx = ensureSqlTransaction(connector, txName(entity, "list"), buildCrudSql(spec, entity, "list"), SqlTransaction.AUTOCOMMIT_EACH, result);
      var countTx = ensureSqlTransaction(connector, txName(entity, "count"), buildCrudSql(spec, entity, "count"), SqlTransaction.AUTOCOMMIT_EACH, result);
      var readTx = ensureSqlTransaction(connector, txName(entity, "read"), buildCrudSql(spec, entity, "read"), SqlTransaction.AUTOCOMMIT_EACH, result);
      var createTx = ensureSqlTransaction(connector, txName(entity, "create"), buildCrudSql(spec, entity, "create"), SqlTransaction.AUTOCOMMIT_EACH, result);
      var updateTx = ensureSqlTransaction(connector, txName(entity, "update"), buildCrudSql(spec, entity, "update"), SqlTransaction.AUTOCOMMIT_EACH, result);
      var deleteTx = ensureSqlTransaction(connector, txName(entity, "delete"), buildCrudSql(spec, entity, "delete"), SqlTransaction.AUTOCOMMIT_EACH, result);

      if (result.sequence) {
        var listVars = collectTransactionVariables(listTx);
        var countVars = collectTransactionVariables(countTx);
        var readVars = collectTransactionVariables(readTx);
        var createVars = collectTransactionVariables(createTx);
        var updateVars = collectTransactionVariables(updateTx);
        var deleteVars = collectTransactionVariables(deleteTx);
        var publicNames = [
          spec.facade.prefix + "_" + txName(entity, "list"),
          spec.facade.prefix + "_" + txName(entity, "count"),
          spec.facade.prefix + "_" + txName(entity, "read"),
          spec.facade.prefix + "_" + txName(entity, "create"),
          spec.facade.prefix + "_" + txName(entity, "update"),
          spec.facade.prefix + "_" + txName(entity, "delete")
        ];
        var publicSources = [
          connectorRequestableQName(spec.project, spec.database.connector, txName(entity, "list")),
          connectorRequestableQName(spec.project, spec.database.connector, txName(entity, "count")),
          connectorRequestableQName(spec.project, spec.database.connector, txName(entity, "read")),
          connectorRequestableQName(spec.project, spec.database.connector, txName(entity, "create")),
          connectorRequestableQName(spec.project, spec.database.connector, txName(entity, "update")),
          connectorRequestableQName(spec.project, spec.database.connector, txName(entity, "delete"))
        ];
        var publicVars = [listVars, countVars, readVars, createVars, updateVars, deleteVars];
        for (var p = 0; p < publicNames.length; p++) {
          var seq = ensurePublicSequence(project, publicNames[p], publicSources[p], publicVars[p], result);
          result.primaryTargets.flow.push(seq.getFullQName ? String(seq.getFullQName()) : (spec.project + "." + publicNames[p]));
        }
      }
    }

    if (crm) {
      var companyContactsTx = ensureSqlTransaction(connector, "list_company_contacts", buildCrmCompanyContactsSql(spec), SqlTransaction.AUTOCOMMIT_EACH, result);
      if (result.sequence) {
        var companyContactsVars = collectTransactionVariables(companyContactsTx);
        var companyContactsSeq = ensurePublicSequence(
          project,
          spec.facade.prefix + "_list_company_contacts",
          connectorRequestableQName(spec.project, spec.database.connector, "list_company_contacts"),
          companyContactsVars,
          result
        );
        result.primaryTargets.flow.push(companyContactsSeq.getFullQName ? String(companyContactsSeq.getFullQName()) : (spec.project + "." + spec.facade.prefix + "_list_company_contacts"));
      }
    }

    var saveResult = C8O.dbo.saveProject(project, []);
    result.runtimeEvidence.projectSave = summarizeSaveResult(saveResult, result);
    result.runtimeEvidence.studioRefresh = refreshStudioProjectTree(project, result, "studioRefresh");
    result.runtimeEvidence.init_schema = proofRequestable(spec.project + "." + spec.database.connector + ".init_schema", {}, result);
    for (var e = 0; e < spec.entities.length; e++) {
      var currentEntity = spec.entities[e];
      result.runtimeEvidence[txName(currentEntity, "list")] = proofRequestable(spec.project + "." + spec.database.connector + "." + txName(currentEntity, "list"), {}, result);
      result.runtimeEvidence[txName(currentEntity, "count")] = proofRequestable(spec.project + "." + spec.database.connector + "." + txName(currentEntity, "count"), {}, result);
    }
    if (crm) {
      result.runtimeEvidence.list_company_contacts = {
        requestable: spec.project + "." + spec.database.connector + ".list_company_contacts",
        status: "pending",
        ok: true,
        message: "Relation facade created. Runtime relation proof happens in crud-proof."
      };
    }

    if (result.uiEnabled) {
      var uiResult = upsertNgxCrudKit({
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
          addWarning(result, uiResult.warnings[w]);
        }
      }
    }

    result.status = result.warnings.length ? "partial" : "success";
    return C8O.util.toJsonSafe ? C8O.util.toJsonSafe(result, { warnings: ensureWarnings(result), path: "$" }) : result;
  }

  function inspectCrudStatus(options) {
    var projectName = trimmed(options.project);
    if (!projectName.length) {
      throw new Error("project is required");
    }
    var project = findProjectByName(projectName);
    if (!project) {
      return {
        status: "not_found",
        project: projectName,
        connectorQname: "",
        driverFamily: "",
        missing: [projectName],
        warnings: []
      };
    }
    var fakeSpec = {
      project: projectName,
      starter: "ngx",
      facade: {
        prefix: trimmed(options.facadePrefix || "crud"),
        publicListSequence: ""
      },
      seed: {
        enabled: true,
        profile: trimmed(options.profile || (trimmed(options.facadePrefix || "crud").toLowerCase() === "crm" ? "crm" : "realistic")),
        rowsPerEntity: trimmed(options.profile || "").toLowerCase() === "crm" || trimmed(options.facadePrefix || "crud").toLowerCase() === "crm" ? 20 : 2
      },
      ui: {
        entryPage: trimmed(options.entryPage || "Page"),
        variant: trimmed(options.variant || (trimmed(options.facadePrefix || "crud").toLowerCase() === "crm" ? "master-detail" : "entity-pages"))
      },
      database: normalizeDatabaseSpec({
        project: projectName,
        database: {
          mode: options.mode || "hsqldb",
          connector: options.connector || "appdb"
        }
      }, {}),
      entities: []
    };
    var connectorName = trimmed(options.connector || "");
    var connector = findSqlConnectorInProject(project, connectorName);
    if (!connectorName.length && connector && connector.getName) {
      connectorName = String(connector.getName());
    }
    if (!connector && !connectorName.length) {
      connectorName = fakeSpec.database.connector;
    }
    var status = buildCrudStatus(fakeSpec, connector, {
      sequence: true,
      warnings: []
    });
    if (!connector) {
      status.status = "partial";
      status.missing.push(projectName + "." + connectorName);
    } else {
      status.driverFamily = inferDriverFamilyFromConnector(connector);
    }
    return status;
  }

  function crudStatus(options) {
    var status = inspectCrudStatus(options || {});
    return C8O.util.toJsonSafe ? C8O.util.toJsonSafe(status, { warnings: ensureWarnings(status), path: "$" }) : status;
  }

  function crudProof(options) {
    var result = inspectCrudStatus(options || {});
    result.entryPage = trimmed((options || {}).entryPage || "Page");
    result.expectUiShell = toBoolean((options || {}).expectUiShell, false);
    result.viewerUrl = trimmed((options || {}).viewerUrl || "");
    result.requestables = [];
    result.checks = [];

    if (result.status === "not_found") {
      result.checks.push(proofCheck("project", false, "Project was not found.", result.project));
      return C8O.util.toJsonSafe ? C8O.util.toJsonSafe(result, { warnings: ensureWarnings(result), path: "$" }) : result;
    }

    result.checks.push(proofCheck("transactions", !(result.transactions && result.transactions.missing && result.transactions.missing.length), (result.transactions && result.transactions.missing && result.transactions.missing.length) ? "Missing SQL transactions remain." : "", result.connectorQname));
    result.checks.push(proofCheck("sequences", !(result.sequences && result.sequences.missing && result.sequences.missing.length), (result.sequences && result.sequences.missing && result.sequences.missing.length) ? "Missing public CRUD sequences remain." : "", result.project));

    var requestables = normalizeProofRequestablesInput((options || {}).proofRequestables);
    var connectorName = "";
    if (result.connectorQname && result.connectorQname.indexOf(".") !== -1) {
      connectorName = String(result.connectorQname).split(".").slice(1).join(".");
    } else {
      connectorName = trimmed((options || {}).connector || "");
    }
    for (var i = 0; i < requestables.length; i++) {
      var qname = resolveProofRequestableQName(requestables[i], result.project, connectorName);
      if (!qname.length) {
        continue;
      }
      var proof = proofRequestable(qname, {}, result);
      result.requestables.push(proof);
      result.checks.push(proofCheck("requestable:" + normalizedIdentifier(qname), proof.ok === true, proof.ok === true ? "" : (proof.message || "Runtime proof failed."), qname));
      if (proof.ok !== true) {
        pushMissing(result, qname);
      }
    }

    if (result.crm && result.crm.enabled) {
      var companiesRequestable = result.project + "." + trimmed((options || {}).facadePrefix || "crud") + "_list_companies";
      var companyListPayload = requestablePayload(companiesRequestable, {}, result);
      var companyListProof = summarizeRequestableProof(companyListPayload, companiesRequestable, result);
      result.requestables.push(companyListProof);
      result.checks.push(proofCheck("requestable:" + normalizedIdentifier(companiesRequestable), companyListProof.ok === true, companyListProof.ok ? "" : (companyListProof.message || "Company list proof failed."), companiesRequestable));
      var firstCompanyRow = firstSqlOutputRow(companyListPayload);
      var firstCompanyId = extractRowField(firstCompanyRow, ["ID", "id"]);
      var relationRequestable = result.crm.relationRequestable;
      if (firstCompanyId == null || firstCompanyId === "") {
        result.checks.push(proofCheck("crm-company-selection", false, "No company row was available to prove the company->contacts relation.", companiesRequestable));
        pushMissing(result, relationRequestable);
      } else {
        var relationPayload = requestablePayload(relationRequestable, { company_id: String(firstCompanyId) }, result);
        var relationProof = summarizeRequestableProof(relationPayload, relationRequestable, result);
        result.requestables.push(relationProof);
        result.checks.push(proofCheck("crm-company-contacts", relationProof.ok === true, relationProof.ok ? "" : (relationProof.message || "Company contacts relation proof failed."), relationRequestable));
        if (relationProof.ok !== true) {
          pushMissing(result, relationRequestable);
        }
      }
    }

    if (result.expectUiShell) {
      var shellVisible = result.ui && result.ui.visibleShellPresent === true;
      var starterReplaced = result.ui && result.ui.starterDominant === false;
      var liveBinding = result.ui && result.ui.liveBindingPresent === true;
      var statefulActions = result.ui && result.ui.statefulActionsPresent === true;
      var pageBootstrap = result.ui && result.ui.pageBootstrapPresent === true;
      var builderProbe = null;
      function refreshBuilderProbe(currentProbe) {
        try {
          return callInternalSequence("tools_mobile_builder_open", {
            project: result.project,
            timeoutSec: 20,
            logsLimit: 30,
            forceRestart: false
          });
        } catch (builderProbeRetryError) {
          addWarning(result, "Unable to refresh the mobile builder probe from crud-proof: " + String(builderProbeRetryError));
          return currentProbe;
        }
      }
      try {
        builderProbe = callInternalSequence("tools_mobile_builder_open", {
          project: result.project,
          timeoutSec: 20,
          logsLimit: 30,
          forceRestart: false
        });
        result.ui.builderProbe = builderProbe || {};
        if (!result.viewerUrl.length) {
          result.viewerUrl = trimmed(
            (builderProbe && (builderProbe.viewerHomeUrl || builderProbe.viewerBaseUrl || builderProbe.viewerUrl)) || ""
          );
        }
      } catch (builderProbeError) {
        addWarning(result, "Unable to probe the mobile builder from crud-proof: " + String(builderProbeError));
        result.ui.builderProbe = {
          status: "error",
          message: String(builderProbeError),
          compileErrors: []
        };
      }
      var builderProbeAttempts = 0;
      while (builderProbeAttempts < 8) {
        var currentProbe = result.ui.builderProbe || {};
        var currentReady = currentProbe.status === "ready";
        var currentBodyText = trimmed(currentProbe.browser && currentProbe.browser.bodyTextSample);
        var currentWorkInProgressVisible = currentReady && /work in progress/i.test(currentBodyText);
        if ((currentReady && !currentWorkInProgressVisible) || (currentProbe.status !== "compile_error" && currentProbe.status !== "building")) {
          break;
        }
        builderProbeAttempts += 1;
        try {
          java.lang.Thread.sleep(1500);
        } catch (_ignoreBuilderProbeSleep) {}
        result.ui.builderProbe = refreshBuilderProbe(currentProbe) || currentProbe;
      }
      var builderReady = !!(result.ui.builderProbe && result.ui.builderProbe.status === "ready");
      var builderCompileError = !!(result.ui.builderProbe && result.ui.builderProbe.status === "compile_error");
      var builderBodyText = trimmed(result.ui && result.ui.builderProbe && result.ui.builderProbe.browser && result.ui.builderProbe.browser.bodyTextSample);
      var workInProgressVisible = /work in progress/i.test(builderBodyText);
      result.ui.workInProgressVisible = builderReady ? workInProgressVisible : null;
      result.checks.push(proofCheck("ui-visible-shell", shellVisible, shellVisible ? "" : "Visible CRUD shell is not present on the entry page.", result.ui && result.ui.targetQName));
      result.checks.push(proofCheck("ui-starter-replaced", starterReplaced, starterReplaced ? "" : "Starter content is still dominant on the entry page.", result.ui && result.ui.targetQName));
      result.checks.push(proofCheck("ui-live-binding", liveBinding, liveBinding ? "" : "Live state bindings are missing from the entry page.", result.ui && result.ui.targetQName));
      result.checks.push(proofCheck("ui-stateful-actions", statefulActions, statefulActions ? "" : "Shared action stacks are missing for the UI state flow.", result.project));
      result.checks.push(proofCheck("ui-page-bootstrap", pageBootstrap, pageBootstrap ? "" : "Entry page does not bootstrap the stateful UI flow.", result.project + ".Application.NgxApp." + result.entryPage));
      result.checks.push(proofCheck(
        "ui-mobile-builder",
        builderReady,
        builderReady
          ? ""
          : (
            builderCompileError
              ? (
                result.ui.builderProbe && result.ui.builderProbe.message
                  ? result.ui.builderProbe.message
                  : "Mobile builder compile failed."
              )
              : "Mobile builder did not reach the ready state."
          ),
        result.project
      ));
      result.checks.push(proofCheck(
        "ui-work-in-progress-hidden",
        !builderReady || !workInProgressVisible,
        !builderReady || !workInProgressVisible
          ? ""
          : "Work in progress marker is still visible in the live viewer after finalization.",
        result.viewerUrl || result.project
      ));
      if (result.viewerUrl.length && builderReady) {
        result.ui.viewerProbe = probeViewer(
          result.viewerUrl,
          result.project,
          trimmed((options || {}).facadePrefix || "crud"),
          result.crm && result.crm.enabled === true,
          result.sequences && result.sequences.present ? result.sequences.present : [],
          ensureWarnings(result)
        );
        result.checks.push(proofCheck(
          "ui-viewer-probe",
          result.ui.viewerProbe && result.ui.viewerProbe.ok === true,
          result.ui.viewerProbe && result.ui.viewerProbe.ok === true ? "" : (result.ui.viewerProbe && result.ui.viewerProbe.message ? result.ui.viewerProbe.message : "Viewer proof failed."),
          result.viewerUrl
        ));
      }
      if (builderCompileError) {
        var compileErrors = ensureArray(result.ui.builderProbe && result.ui.builderProbe.compileErrors);
        if (compileErrors.length) {
          addWarning(result, "Mobile builder compile errors: " + trimmed((compileErrors[0].message || "") + " " + (compileErrors[0].extra || "")));
        }
      }
      if (!shellVisible || !starterReplaced || !liveBinding || !statefulActions || !pageBootstrap) {
        pushMissing(result, result.ui && result.ui.targetQName ? result.ui.targetQName : (result.project + ".Application.NgxApp." + result.entryPage + ".Content"));
      }
      if (!builderReady) {
        pushMissing(result, result.project);
      }
      if (result.viewerUrl.length && !(result.ui && result.ui.viewerProbe && result.ui.viewerProbe.ok === true)) {
        pushMissing(result, result.viewerUrl);
      }
    }

    if (result.transactions && result.transactions.missing) {
      result.missing = result.missing.concat(result.transactions.missing);
    }
    if (result.sequences && result.sequences.missing) {
      result.missing = result.missing.concat(result.sequences.missing);
    }
    result.missing = dedupeStrings(result.missing);

    result.status = result.missing.length ? "partial" : "success";
    return C8O.util.toJsonSafe ? C8O.util.toJsonSafe(result, { warnings: ensureWarnings(result), path: "$" }) : result;
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
