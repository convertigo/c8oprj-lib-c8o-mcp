if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.crudViewer = C8O.crudViewer || {};

(function () {
  if (C8O.crudViewer._initialized === true) {
    return;
  }
  C8O.crudViewer._initialized = true;

  function readJavaStream(stream) {
    if (stream == null) {
      return "";
    }
    var Scanner = Packages.java.util.Scanner;
    var scanner = null;
    try {
      scanner = new Scanner(stream, "UTF-8").useDelimiter("\\A");
      return scanner.hasNext() ? String(scanner.next()) : "";
    } finally {
      try {
        if (scanner != null) {
          scanner.close();
        }
      } catch (_ignoreScannerClose) {}
      try {
        stream.close();
      } catch (_ignoreStreamClose) {}
    }
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

  function httpFetchText(ctx, url, timeoutMs) {
    var URL = Packages.java.net.URL;
    var connection = null;
    var responseCode = 0;
    var responseText = "";
    var errorText = "";
    var finalUrl = ctx.trimmed(url);
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
      url: ctx.trimmed(url),
      finalUrl: finalUrl,
      statusCode: responseCode,
      body: responseText,
      errorBody: errorText
    };
  }

  function resolveUrl(ctx, baseUrl, relativeUrl) {
    var URL = Packages.java.net.URL;
    var base = ctx.trimmed(baseUrl);
    var relative = ctx.trimmed(relativeUrl);
    if (!relative.length) {
      return base;
    }
    try {
      return String(new URL(new URL(base), relative).toString());
    } catch (_ignoreResolveUrl) {
      return relative;
    }
  }

  function parseScriptUrls(ctx, html, baseUrl) {
    var sources = [];
    var seen = {};
    var text = String(html || "");
    var htmlBase = ctx.trimmed(baseUrl);
    var baseMatch = /<base[^>]+href=["']([^"']+)["']/i.exec(text);
    if (baseMatch && baseMatch.length > 1) {
      htmlBase = resolveUrl(ctx, baseUrl, baseMatch[1]);
    }
    var pattern = /<script[^>]+src=["']([^"']+\.js[^"']*)["']/ig;
    var match = null;
    while ((match = pattern.exec(text)) !== null) {
      var resolved = resolveUrl(ctx, htmlBase || baseUrl, match[1]);
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
      var childName = String(child.getName()).trim();
      if (/\.js$/i.test(childName)) {
        result.bundles.push(child);
      }
    }
    return result;
  }

  function dedupeList(ctx, values) {
    var out = [];
    var seen = {};
    var list = ctx.ensureArray(values);
    for (var i = 0; i < list.length; i++) {
      var value = ctx.trimmed(list[i]);
      if (!value.length || seen[value]) {
        continue;
      }
      seen[value] = true;
      out.push(value);
    }
    return out;
  }

  function viewerBundleMarkers(ctx, projectName, facadePrefix, hasCrmRelation, sequenceQNames) {
    var prefix = ctx.trimmed(facadePrefix || "crud");
    var markers = [];
    var sequences = ctx.ensureArray(sequenceQNames);
    for (var i = 0; i < sequences.length; i++) {
      var qname = ctx.trimmed(sequences[i]);
      if (!qname.length) {
        continue;
      }
      var basename = qname.indexOf(".") === -1 ? qname : qname.split(".").pop();
      if (basename.indexOf(":") !== -1) {
        basename = basename.split(":").pop();
      }
      if (basename.indexOf(prefix + "_list_") === 0) {
        if (new RegExp("^" + prefix + "_list_.+_by_.+$").test(basename)) {
          continue;
        }
        markers.push(basename);
      }
    }
    if (hasCrmRelation) {
      markers.push(prefix + "_list_company_contacts");
      markers.push(ctx.trimmed(projectName) + ".crm_list_company_contacts");
    }
    markers = dedupeList(ctx, markers);
    if (!markers.length) {
      markers = ["crudFacadeRequestables"];
    }
    return markers;
  }

  function parseImportedScriptUrls(ctx, bundleText, baseUrl) {
    var urls = [];
    var seen = {};
    var text = String(bundleText || "");
    var pattern = /["']((?:\.\/|\.\.\/|\/)[^"']+\.js(?:\?[^"']*)?)["']/g;
    var match = null;
    while ((match = pattern.exec(text)) !== null) {
      var resolved = resolveUrl(ctx, baseUrl, match[1]);
      if (!resolved.length || seen[resolved]) {
        continue;
      }
      seen[resolved] = true;
      urls.push(resolved);
    }
    return urls;
  }

  function normalizeViewerCandidateUrls(ctx, viewerUrl) {
    var raw = ctx.trimmed(viewerUrl);
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
    return dedupeList(ctx, candidates);
  }

  function probeViewer(ctx, viewerUrl, projectName, facadePrefix, hasCrmRelation, sequenceQNames, warnings) {
    var probe = {
      attempted: false,
      ok: false,
      url: ctx.trimmed(viewerUrl),
      finalUrl: ctx.trimmed(viewerUrl),
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
      var appUrl = ctx.trimmed(viewerUrl);
      if (probe.url.length) {
        var remoteCandidates = normalizeViewerCandidateUrls(ctx, probe.url);
        for (var remoteIndex = 0; remoteIndex < remoteCandidates.length && !appHtml.length; remoteIndex++) {
          try {
            rootFetch = httpFetchText(ctx, remoteCandidates[remoteIndex], 10000);
            probe.statusCode = Number(rootFetch.statusCode || 0);
            probe.finalUrl = ctx.trimmed(rootFetch.finalUrl || remoteCandidates[remoteIndex]);
            var rootBody = String(rootFetch.body || "");
            if (rootBody.indexOf("<app-root") !== -1 || rootBody.indexOf("<ion-app") !== -1) {
              appHtml = rootBody;
              appUrl = probe.finalUrl;
            } else if (rootBody.indexOf("Convertigo FlashUpdate") !== -1 || rootBody.indexOf("flashupdate.js") !== -1) {
              var candidateUrls = [
                resolveUrl(ctx, probe.finalUrl || remoteCandidates[remoteIndex], "displayobjects/mobile/index.html"),
                resolveUrl(ctx, probe.finalUrl || remoteCandidates[remoteIndex], "DisplayObjects/mobile/index.html")
              ];
              for (var candidateIndex = 0; candidateIndex < candidateUrls.length; candidateIndex++) {
                var candidateFetch = httpFetchText(ctx, candidateUrls[candidateIndex], 10000);
                var candidateBody = String(candidateFetch.body || "");
                if (candidateFetch.statusCode >= 200 && candidateFetch.statusCode < 400 && (candidateBody.indexOf("<app-root") !== -1 || candidateBody.indexOf("<ion-app") !== -1)) {
                  appHtml = candidateBody;
                  appUrl = ctx.trimmed(candidateFetch.finalUrl || candidateUrls[candidateIndex]);
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
      probe.scriptUrls = appUrl.length ? parseScriptUrls(ctx, htmlBody, appUrl) : [];
      var bundleSources = [];
      var maxBundles = Math.min(probe.scriptUrls.length, 24);
      for (var i = 0; i < maxBundles; i++) {
        var bundleUrl = probe.scriptUrls[i];
        try {
          var bundleFetch = httpFetchText(ctx, bundleUrl, 10000);
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
        importedBundleUrls = importedBundleUrls.concat(parseImportedScriptUrls(ctx, bundleSources[sourceIndex], appUrl));
      }
      importedBundleUrls = dedupeList(ctx, importedBundleUrls);
      var importedLimit = Math.min(importedBundleUrls.length, 12);
      for (var importedIndex = 0; importedIndex < importedLimit; importedIndex++) {
        var importedUrl = importedBundleUrls[importedIndex];
        try {
          var importedFetch = httpFetchText(ctx, importedUrl, 10000);
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
      var markers = viewerBundleMarkers(ctx, projectName, facadePrefix, hasCrmRelation, sequenceQNames);
      for (var markerIndex = 0; markerIndex < markers.length; markerIndex++) {
        var marker = markers[markerIndex];
        if (bundleTextJoined.indexOf(marker) !== -1) {
          probe.markersFound.push(marker);
        } else {
          probe.missingMarkers.push(marker);
        }
      }
      probe.markersFound = dedupeList(ctx, probe.markersFound);
      probe.missingMarkers = dedupeList(ctx, probe.missingMarkers);
      probe.ok = probe.htmlOk && probe.missingMarkers.length === 0;
      probe.message = probe.ok
        ? "Viewer build artifacts exist and include the expected CRUD bundle markers."
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

  C8O.crudViewer.probeViewer = probeViewer;
})();
