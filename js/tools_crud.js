include("js/util.js");
include("js/databaseobject.js");
include("js/databaseobject_batch.js");
include("js/marketplace.js");

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

  function driverProfiles() {
    return {
      hsqldb: {
        id: "hsqldb",
        technology: "HSQLDB",
        jdbcDriverClassName: "org.hsqldb.jdbcDriver",
        defaultPort: 9001,
        urlBuilder: function (databaseSpec, spec) {
          return "jdbc:hsqldb:file:./database/" + normalizedIdentifier(spec.project) + ";shutdown=true";
        },
        identityColumn: "INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY",
        autoIncrementKeyword: "",
        booleanType: "BOOLEAN",
        textType: "VARCHAR(1024)"
      },
      postgresql: {
        id: "postgresql",
        technology: "PostgreSQL",
        jdbcDriverClassName: "org.postgresql.Driver",
        defaultPort: 5432,
        urlBuilder: function (databaseSpec) {
          return "jdbc:postgresql://" + databaseSpec.host + ":" + databaseSpec.port + "/" + databaseSpec.database;
        },
        identityColumn: "SERIAL PRIMARY KEY",
        autoIncrementKeyword: "",
        booleanType: "BOOLEAN",
        textType: "TEXT"
      },
      mariadb: {
        id: "mariadb",
        technology: "MariaDB",
        jdbcDriverClassName: "org.mariadb.jdbc.Driver",
        defaultPort: 3306,
        urlBuilder: function (databaseSpec) {
          return "jdbc:mariadb://" + databaseSpec.host + ":" + databaseSpec.port + "/" + databaseSpec.database;
        },
        identityColumn: "INT AUTO_INCREMENT PRIMARY KEY",
        autoIncrementKeyword: "AUTO_INCREMENT",
        booleanType: "BOOLEAN",
        textType: "TEXT"
      },
      mysql: {
        id: "mysql",
        technology: "MySQL",
        jdbcDriverClassName: "com.mysql.cj.jdbc.Driver",
        defaultPort: 3306,
        urlBuilder: function (databaseSpec) {
          return "jdbc:mysql://" + databaseSpec.host + ":" + databaseSpec.port + "/" + databaseSpec.database;
        },
        identityColumn: "INT AUTO_INCREMENT PRIMARY KEY",
        autoIncrementKeyword: "AUTO_INCREMENT",
        booleanType: "BOOLEAN",
        textType: "TEXT"
      },
      sqlserver: {
        id: "sqlserver",
        technology: "SQLServer",
        jdbcDriverClassName: "net.sourceforge.jtds.jdbc.Driver",
        defaultPort: 1433,
        urlBuilder: function (databaseSpec) {
          return "jdbc:jtds:sqlserver://" + databaseSpec.host + ":" + databaseSpec.port + "/" + databaseSpec.database;
        },
        identityColumn: "INT IDENTITY(1,1) PRIMARY KEY",
        autoIncrementKeyword: "",
        booleanType: "BIT",
        textType: "VARCHAR(MAX)"
      },
      oracle: {
        id: "oracle",
        technology: "Oracle",
        jdbcDriverClassName: "oracle.jdbc.driver.OracleDriver",
        defaultPort: 1521,
        urlBuilder: function (databaseSpec) {
          return "jdbc:oracle:thin:@//" + databaseSpec.host + ":" + databaseSpec.port + "/" + databaseSpec.database;
        },
        identityColumn: "NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY",
        autoIncrementKeyword: "",
        booleanType: "NUMBER(1)",
        textType: "CLOB"
      }
    };
  }

  function normalizeDriver(databaseSpec) {
    var rawMode = trimmed(databaseSpec.mode || databaseSpec.technology).toLowerCase();
    if (rawMode === "postgres" || rawMode === "postgresql") {
      rawMode = "postgresql";
    } else if (rawMode === "maria" || rawMode === "mariadb") {
      rawMode = "mariadb";
    } else if (rawMode === "mssql" || rawMode === "sqlserver") {
      rawMode = "sqlserver";
    } else if (rawMode === "oracle") {
      rawMode = "oracle";
    } else if (rawMode === "mysql") {
      rawMode = "mysql";
    } else if (rawMode === "hsql" || rawMode === "hsqldb") {
      rawMode = "hsqldb";
    }
    var profile = driverProfiles()[rawMode];
    if (!profile) {
      throw new Error("Unsupported database mode/technology: " + rawMode);
    }
    return clone(profile);
  }

  function inferDriverFamilyFromConnector(connector) {
    var jdbcClass = "";
    try {
      jdbcClass = trimmed(connector && connector.getJdbcDriverClassName ? connector.getJdbcDriverClassName() : "");
    } catch (_ignoreJdbcClass) {
      jdbcClass = "";
    }
    if (!jdbcClass.length) {
      return "";
    }
    if (jdbcClass.indexOf("postgresql") !== -1) {
      return "postgresql";
    }
    if (jdbcClass.indexOf("mariadb") !== -1) {
      return "mariadb";
    }
    if (jdbcClass.indexOf("mysql") !== -1) {
      return "mysql";
    }
    if (jdbcClass.indexOf("jtds") !== -1 || jdbcClass.indexOf("sqlserver") !== -1) {
      return "sqlserver";
    }
    if (jdbcClass.indexOf("oracle") !== -1) {
      return "oracle";
    }
    if (jdbcClass.indexOf("hsqldb") !== -1) {
      return "hsqldb";
    }
    return jdbcClass;
  }

  function normalizeDatabaseSpec(spec, result) {
    var raw = spec.database || {};
    var driver = normalizeDriver(raw);
    return {
      mode: driver.id,
      technology: driver.technology,
      connector: trimmed(raw.connector || spec.project + "db") || "appdb",
      host: trimmed(raw.host || "localhost"),
      port: raw.port != null && String(raw.port).length ? String(raw.port) : String(driver.defaultPort),
      database: trimmed(raw.database || normalizedIdentifier(spec.project)),
      user: trimmed(raw.user || (driver.id === "postgresql" ? "postgres" : (driver.id === "oracle" ? "system" : "root"))),
      password: raw.password == null ? "" : String(raw.password),
      driver: driver
    };
  }

  function normalizeField(field, entityName, index, result) {
    var rawField = field || {};
    var rawName = trimmed(rawField.name || rawField.column || "");
    if (!rawName.length) {
      throw new Error("Field #" + index + " for entity " + entityName + " is missing name");
    }
    return {
      name: rawName,
      column: normalizedIdentifier(rawField.column || rawName),
      type: trimmed(rawField.type || "VARCHAR(255)"),
      label: trimmed(rawField.label || rawName),
      primary: toBoolean(rawField.primary, false),
      unique: toBoolean(rawField.unique, false),
      required: rawField.required == null ? false : toBoolean(rawField.required, false),
      references: rawField.references && typeof rawField.references === "object" ? clone(rawField.references) : null
    };
  }

  function normalizeEntity(rawEntity, result) {
    if (!rawEntity || typeof rawEntity !== "object") {
      throw new Error("Each entity must be an object");
    }
    var entityName = pluralize(normalizedIdentifier(rawEntity.name || rawEntity.entity || ""));
    if (!entityName.length) {
      throw new Error("Entity name is required");
    }
    var normalized = {
      name: entityName,
      singular: singularize(entityName),
      label: trimmed(rawEntity.label || ucfirst(entityName)),
      fields: [],
      primaryField: null
    };
    var rawFields = ensureArray(rawEntity.fields);
    for (var i = 0; i < rawFields.length; i++) {
      var field = normalizeField(rawFields[i], entityName, i + 1, result);
      normalized.fields.push(field);
      if (field.primary && normalized.primaryField == null) {
        normalized.primaryField = field;
      }
    }
    if (normalized.primaryField == null) {
      normalized.primaryField = {
        name: "Id",
        column: "id",
        type: "INT",
        label: "Id",
        primary: true,
        unique: true,
        required: true,
        references: null
      };
      normalized.fields.unshift(normalized.primaryField);
    }
    return normalized;
  }

  function normalizeSpec(specInput) {
    var spec = C8O.util.parseObjectInput(specInput, {
      label: "spec",
      allowEmpty: false
    });
    var result = {
      project: trimmed(spec.project),
      starter: trimmed(spec.starter || "ngx").toLowerCase(),
      facade: spec.facade && typeof spec.facade === "object" ? clone(spec.facade) : {},
      seed: spec.seed && typeof spec.seed === "object" ? clone(spec.seed) : {},
      ui: spec.ui && typeof spec.ui === "object" ? clone(spec.ui) : {},
      entities: []
    };
    if (!result.project.length) {
      throw new Error("spec.project is required");
    }
    result.database = normalizeDatabaseSpec(spec, result);
    var rawEntities = ensureArray(spec.entities);
    if (!rawEntities.length) {
      throw new Error("spec.entities must contain at least one entity");
    }
    for (var i = 0; i < rawEntities.length; i++) {
      result.entities.push(normalizeEntity(rawEntities[i], result));
    }
    result.facade.prefix = trimmed(result.facade.prefix || "crud");
    result.facade.publicListSequence = trimmed(result.facade.publicListSequence || "");
    result.seed.enabled = result.seed.enabled == null ? true : toBoolean(result.seed.enabled, true);
    result.seed.profile = trimmed(result.seed.profile || "");
    result.seed.rowsPerEntity = parseInt(result.seed.rowsPerEntity, 10);
    result.ui.entryPage = trimmed(result.ui.entryPage || "Page");
    result.ui.variant = trimmed(result.ui.variant || "entity-pages");
    applyCrmDefaults(result);
    if (isNaN(result.seed.rowsPerEntity) || result.seed.rowsPerEntity <= 0) {
      result.seed.rowsPerEntity = result.seed.profile === "crm" ? 20 : 2;
    }
    return result;
  }

  function findEntityByName(entities, entityName) {
    var expected = pluralize(normalizedIdentifier(entityName || ""));
    var entries = ensureArray(entities);
    for (var i = 0; i < entries.length; i++) {
      if (entries[i] && entries[i].name === expected) {
        return entries[i];
      }
    }
    return null;
  }

  function findField(entity, predicate) {
    var fields = ensureArray(entity && entity.fields);
    for (var i = 0; i < fields.length; i++) {
      if (predicate(fields[i], i)) {
        return fields[i];
      }
    }
    return null;
  }

  function crmRelationContext(spec) {
    var contacts = findEntityByName(spec && spec.entities, "contacts");
    var companies = findEntityByName(spec && spec.entities, "companies");
    if (!contacts || !companies) {
      return null;
    }
    var relationField = findField(contacts, function (field) {
      return field && field.references && pluralize(normalizedIdentifier(field.references.entity)) === companies.name;
    });
    if (!relationField) {
      relationField = findField(contacts, function (field) {
        var column = normalizedIdentifier(field && field.column);
        return column === "company_id" || column === "companyid";
      });
      if (relationField && !relationField.references) {
        relationField.references = {
          entity: companies.name,
          field: companies.primaryField ? companies.primaryField.column : "id"
        };
      }
    }
    if (!relationField) {
      return null;
    }
    return {
      contacts: contacts,
      companies: companies,
      relationField: relationField
    };
  }

  function applyCrmDefaults(spec) {
    var contacts = findEntityByName(spec.entities, "contacts");
    var companies = findEntityByName(spec.entities, "companies");
    var isCrm = !!(contacts && companies);
    if (!spec.seed.profile.length) {
      spec.seed.profile = isCrm ? "crm" : "realistic";
    }
    if (!isCrm) {
      return spec;
    }

    var companyRelationField = findField(contacts, function (field) {
      var column = normalizedIdentifier(field && field.column);
      return column === "company_id" || column === "companyid" || normalizedIdentifier(field && field.name) === "companyid";
    });
    if (!companyRelationField) {
      companyRelationField = {
        name: "CompanyId",
        column: "company_id",
        type: "INT",
        label: "Company",
        primary: false,
        unique: false,
        required: true,
        references: {
          entity: companies.name,
          field: companies.primaryField ? companies.primaryField.column : "id"
        }
      };
      contacts.fields.push(companyRelationField);
    } else if (!companyRelationField.references) {
      companyRelationField.references = {
        entity: companies.name,
        field: companies.primaryField ? companies.primaryField.column : "id"
      };
      if (companyRelationField.required == null) {
        companyRelationField.required = true;
      }
    }

    if (trimmed(spec.ui.variant).toLowerCase() === "dashboard" || trimmed(spec.ui.variant).toLowerCase() === "entity-pages" || !trimmed(spec.ui.variant).length) {
      spec.ui.variant = "master-detail";
    }
    return spec;
  }

	  function findProjectByName(projectName) {
	    var projectToken = trimmed(projectName);
	    if (!projectToken.length) {
	      return null;
	    }
	    try {
	      return Engine.theApp.databaseObjectsManager.getOriginalProjectByName(projectToken, false);
	    } catch (_ignoreProjectByNameWithFlag) {
	      try {
	        return Engine.theApp.databaseObjectsManager.getOriginalProjectByName(projectToken);
	      } catch (_ignoreProjectByName) {
	        try {
	          var names = C8O.dbo && C8O.dbo._listProjectNames ? C8O.dbo._listProjectNames() : [];
	          for (var i = 0; i < names.length; i++) {
	            if (String(names[i]) === projectToken) {
	              return C8O.dbo.resolve(projectToken, { optional: true });
	            }
	          }
	        } catch (_ignoreResolveProjectByQName) {}
	        return null;
	      }
	    }
	  }

  function ensureProject(spec, result) {
    var project = findProjectByName(spec.project);
    if (project) {
      return project;
    }
    if (spec.starter !== "ngx") {
      throw new Error("Project " + spec.project + " is not loaded and only starter=\"ngx\" auto-import is supported");
    }
    var importResult = C8O.marketplace.importLibrary({
      project: "template_ngxBuilderIonic",
      importedProjectName: spec.project,
      save: true,
      forceImport: false
    });
    var importReady = !!(
      importResult &&
      (
        importResult.status === "ready" ||
        importResult.status === "ok" ||
        importResult.imported === true ||
        importResult.loadedAfter === true
      )
    );
    if (!importReady) {
      var importMessage = importResult && importResult.importMessage ? String(importResult.importMessage) : "";
      throw new Error(
        "Unable to import NGX starter for project " +
        spec.project +
        (importMessage.length ? " (" + importMessage + ")" : "")
      );
    }
    result.created.push(spec.project);
    project = findProjectByName(spec.project);
    if (!project) {
      throw new Error("Imported project " + spec.project + " is still not available in memory");
    }
    return project;
  }

  function logicalClassName(node) {
    if (!node || !node.getClass) {
      return "";
    }
    try {
      return C8O.util.fromFqcn(String(node.getClass().getName() || ""));
    } catch (_ignoreLogicalClass) {
      return "";
    }
  }

  function findChild(parent, name, className) {
    if (!parent || !parent.getDatabaseObjectChildren) {
      return null;
    }
    var children = parent.getDatabaseObjectChildren();
    for (var i = 0; i < children.size(); i++) {
      var child = children.get(i);
      var matchesName = !name;
      if (!matchesName) {
        try {
          matchesName = String(child.getName()) === name;
        } catch (_ignoreChildName) {
          matchesName = false;
        }
      }
      if (!matchesName) {
        continue;
      }
      if (!className) {
        return child;
      }
      var logical = logicalClassName(child);
      if (logical === className || String(child.getClass().getName()) === C8O.util.toFqcn(className)) {
        return child;
      }
    }
    return null;
  }

  function createChild(parent, className, name) {
    var dbo = C8O.dbo.instantiateForCreate(className, parent, {});
    dbo.setName(name);
    if (typeof parent.addVariable === "function" && (className === "variables.RequestableVariable" || className === "variables.StepVariable")) {
      parent.addVariable(dbo);
    } else {
      parent.add(dbo);
    }
    try {
      dbo.hasChanged = true;
    } catch (_ignoreDboChanged) {}
    try {
      parent.hasChanged = true;
    } catch (_ignoreParentChanged) {}
    try {
      var project = parent.getProject ? parent.getProject() : null;
      if (project) {
        project.hasChanged = true;
      }
    } catch (_ignoreProjectChanged) {}
    return dbo;
  }

  function ensureChild(parent, className, name, result) {
    var existing = findChild(parent, name, className);
    if (existing) {
      return existing;
    }
    var created = createChild(parent, className, name);
    result.created.push(created.getFullQName ? String(created.getFullQName()) : name);
    return created;
  }

  function priorityOf(dbo) {
    try {
      if (dbo.getPriority) {
        return String(dbo.getPriority());
      }
    } catch (_ignorePriorityMethod) {}
    try {
      if (dbo.priority != null) {
        return String(dbo.priority);
      }
    } catch (_ignorePriorityField) {}
    return "";
  }

  function applyUpdates(dbo, updates, result) {
    var applied = C8O.dbo.applyPropertyUpdates(dbo, updates || {});
    if (applied && applied.errors && applied.errors.length) {
      for (var i = 0; i < applied.errors.length; i++) {
        addWarning(result, applied.errors[i].message || applied.errors[i]);
      }
    }
    if (applied && applied.applied && applied.applied.length) {
      result.updated.push(dbo.getFullQName ? String(dbo.getFullQName()) : String(dbo));
    }
    return applied;
  }

  function nowMillis() {
    return java.lang.System.currentTimeMillis();
  }

  function setDuration(bucket, key, startedAt) {
    if (!bucket || !key) {
      return 0;
    }
    var duration = nowMillis() - startedAt;
    bucket[key] = duration;
    return duration;
  }

  function countTreeNodes(node) {
    if (!node || typeof node !== "object") {
      return 0;
    }
    var total = 1;
    var children = ensureArray(node.children);
    for (var i = 0; i < children.length; i++) {
      total += countTreeNodes(children[i]);
    }
    return total;
  }

  function collectTreeNames(node, names) {
    var out = names || [];
    if (!node || typeof node !== "object") {
      return out;
    }
    if (node.name != null && String(node.name).length) {
      out.push(String(node.name));
    }
    var children = ensureArray(node.children);
    for (var i = 0; i < children.length; i++) {
      collectTreeNames(children[i], out);
    }
    return out;
  }

	  function connectorProperties(spec) {
	    var db = spec.database;
	    return {
	      jdbcDriverClassName: db.driver.jdbcDriverClassName,
	      jdbcURL: buildJdbcUrl(db, spec),
	      jdbcUserName: db.driver.id === "hsqldb" ? "SA" : db.user,
	      jdbcUserPassword: db.driver.id === "hsqldb" ? "" : db.password,
	      comment: "Deterministic CRUD connector (" + db.driver.technology + ") for " + spec.project
	    };
	  }

	  function buildJdbcUrl(databaseSpec, spec) {
	    var driverId = databaseSpec && databaseSpec.driver && databaseSpec.driver.id ? String(databaseSpec.driver.id) : "hsqldb";
	    if (driverId === "postgresql") {
	      return "jdbc:postgresql://" + databaseSpec.host + ":" + databaseSpec.port + "/" + databaseSpec.database;
	    }
	    if (driverId === "mariadb") {
	      return "jdbc:mariadb://" + databaseSpec.host + ":" + databaseSpec.port + "/" + databaseSpec.database;
	    }
	    if (driverId === "mysql") {
	      return "jdbc:mysql://" + databaseSpec.host + ":" + databaseSpec.port + "/" + databaseSpec.database;
	    }
	    if (driverId === "sqlserver") {
	      return "jdbc:jtds:sqlserver://" + databaseSpec.host + ":" + databaseSpec.port + "/" + databaseSpec.database;
	    }
	    if (driverId === "oracle") {
	      return "jdbc:oracle:thin:@//" + databaseSpec.host + ":" + databaseSpec.port + "/" + databaseSpec.database;
	    }
	    return "jdbc:hsqldb:file:./database/" + normalizedIdentifier(spec.project) + ";shutdown=true";
	  }

  function mapSqlType(field, driver) {
    var raw = trimmed(field.type || "").toUpperCase();
    if (!raw.length) {
      raw = "VARCHAR(255)";
    }
    if (raw === "TEXT") {
      return driver.textType;
    }
    if (raw === "BOOLEAN") {
      return driver.booleanType;
    }
    if (raw === "INT" || raw === "INTEGER") {
      return driver.id === "oracle" ? "NUMBER" : "INT";
    }
    return raw;
  }

  function renderColumnDefinition(field, driver) {
    if (field.primary) {
      if (field.column === "id") {
        return field.column + " " + driver.identityColumn;
      }
      var pkType = mapSqlType(field, driver);
      return field.column + " " + pkType + " PRIMARY KEY";
    }
    var segments = [field.column, mapSqlType(field, driver)];
    if (field.required) {
      segments.push("NOT NULL");
    }
    if (field.unique) {
      segments.push("UNIQUE");
    }
    if (field.references && field.references.entity) {
      var target = pluralize(normalizedIdentifier(field.references.entity));
      var targetColumn = normalizedIdentifier(field.references.field || "id");
      segments.push("REFERENCES " + target + "(" + targetColumn + ")");
    }
    return segments.join(" ");
  }

  function buildCreateTableSql(spec, entity) {
    var driver = spec.database.driver;
    var columnLines = [];
    for (var i = 0; i < entity.fields.length; i++) {
      columnLines.push("  " + renderColumnDefinition(entity.fields[i], driver));
    }
    var createPrefix = driver.id === "oracle" ? "CREATE TABLE " : "CREATE TABLE IF NOT EXISTS ";
    return createPrefix + entity.name + " (\n" + columnLines.join(",\n") + "\n)";
  }

  function sampleValueForField(entity, field, rowIndex) {
    var FIRST_NAMES = ["Camille", "Nora", "Leo", "Ines", "Arthur", "Maya", "Jules", "Sarah", "Lucas", "Emma"];
    var LAST_NAMES = ["Martin", "Bernard", "Petit", "Robert", "Richard", "Dubois", "Moreau", "Simon", "Laurent", "Michel"];
    var CITIES = ["Paris", "Lyon", "Bordeaux", "Nantes", "Lille", "Toulouse", "Marseille", "Rennes"];
    var INDUSTRIES = ["Software", "Health", "Retail", "Education", "Finance", "Services"];
    var CATEGORIES = ["Dinner", "Culture", "Outdoor", "Music", "Cinema", "Family"];
    var DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    var STATUSES = ["active", "lead", "draft", "confirmed"];
    var COMMENTS = [
      "Prefers small groups and central venues.",
      "Available after work during the week.",
      "Would like a quieter option this month.",
      "Happy to help with coordination.",
      "Interested if the venue is easy to reach."
    ];
    var COMPANY_NAMES = ["Blue Orbit", "North Harbor", "Golden Fern", "Urban Echo", "Silver Maple", "Bright Atlas"];
    var GROUP_NAMES = ["City Explorers", "Weekend Makers", "Food Lovers", "Culture Circle", "Sunset Club"];
    var OUTING_TITLES = ["Sunset Picnic", "Jazz Night", "Street Food Tour", "Museum Late Opening", "Riverside Brunch"];
    var base = rowIndex + 1;
    var column = normalizedIdentifier(field && (field.column || field.name));
    var entityName = normalizedIdentifier(entity && entity.name);
    if (field.primary) {
      return null;
    }

    function pick(list) {
      return list[rowIndex % list.length];
    }

    function normalizedFieldType(fieldValue) {
      return trimmed(fieldValue && fieldValue.type).toUpperCase().replace(/\(.*\)/, "");
    }

    function isNumericField(fieldValue) {
      var type = normalizedFieldType(fieldValue);
      return /^(INT|INTEGER|BIGINT|SMALLINT|DECIMAL|NUMERIC|NUMBER|DOUBLE|FLOAT|REAL)$/.test(type);
    }

    function isBooleanField(fieldValue) {
      var type = normalizedFieldType(fieldValue);
      return /^(BOOLEAN|BIT)$/.test(type);
    }

    if (isBooleanField(field)) {
      return rowIndex % 2 === 0;
    }
    if (isNumericField(field)) {
      if (column.indexOf("year") !== -1) {
        return 2020 + (rowIndex % 6);
      }
      if (column.indexOf("score") !== -1 || column.indexOf("rank") !== -1 || column.indexOf("priority") !== -1) {
        return (rowIndex % 5) + 1;
      }
      return base;
    }
    if (column.indexOf("email") !== -1) {
      var first = FIRST_NAMES[rowIndex % FIRST_NAMES.length].toLowerCase();
      var last = LAST_NAMES[rowIndex % LAST_NAMES.length].toLowerCase();
      return first + "." + last + base + "@example.test";
    }
    if (column.indexOf("first") !== -1) {
      return pick(FIRST_NAMES);
    }
    if (column.indexOf("last") !== -1) {
      return pick(LAST_NAMES);
    }
    if (column.indexOf("phone") !== -1) {
      return "+33 6 " + String(10 + (base % 80)) + " " + String(10 + ((base + 7) % 80)) + " " + String(10 + ((base + 13) % 80)) + " " + String(10 + ((base + 19) % 80));
    }
    if (column.indexOf("status") !== -1) {
      return pick(STATUSES);
    }
    if (column.indexOf("city") !== -1) {
      return pick(CITIES);
    }
    if (column.indexOf("country") !== -1) {
      return ["France", "Belgium", "Spain", "Italy"][rowIndex % 4];
    }
    if (column.indexOf("industry") !== -1) {
      return pick(INDUSTRIES);
    }
    if (column.indexOf("category") !== -1) {
      return pick(CATEGORIES);
    }
    if (column.indexOf("preferred_day") !== -1 || column.indexOf("day") !== -1) {
      return pick(DAYS);
    }
    if (column.indexOf("vote") !== -1) {
      return ["yes", "maybe", "no"][rowIndex % 3];
    }
    if (column.indexOf("comment") !== -1 || column.indexOf("note") !== -1 || column.indexOf("description") !== -1) {
      return pick(COMMENTS);
    }
    if (column.indexOf("title") !== -1) {
      return pick(OUTING_TITLES) + " " + base;
    }
    if (column.indexOf("name") !== -1) {
      if (entityName === "companies") {
        return pick(COMPANY_NAMES) + " " + base;
      }
      if (entityName === "groups") {
        return pick(GROUP_NAMES) + " " + base;
      }
      return ucfirst(entity.singular) + " " + base;
    }
    if (column.indexOf("website") !== -1 || column.indexOf("url") !== -1) {
      return "https://demo" + base + ".example.test";
    }
    return ucfirst(field.label || field.name) + " " + base;
  }

  function pickSeedLookupField(entity) {
    var fields = ensureArray(entity && entity.fields);
    var preferred = ["name", "email", "title", "firstname"];
    for (var p = 0; p < preferred.length; p++) {
      var preferredField = findField(entity, function (field) {
        return !field.primary && normalizedIdentifier(field.column) === preferred[p];
      });
      if (preferredField) {
        return preferredField;
      }
    }
    var uniqueField = findField(entity, function (field) {
      return !field.primary && field.unique === true;
    });
    if (uniqueField) {
      return uniqueField;
    }
    var firstField = findField(entity, function (field) {
      return !field.primary;
    });
    return firstField || (entity && entity.primaryField) || null;
  }

  function orderedEntities(spec) {
    var entities = ensureArray(spec && spec.entities);
    var map = {};
    var ordered = [];
    var visiting = {};
    var visited = {};
    for (var i = 0; i < entities.length; i++) {
      map[entities[i].name] = entities[i];
    }
    function visit(entity) {
      if (!entity || visited[entity.name]) {
        return;
      }
      if (visiting[entity.name]) {
        return;
      }
      visiting[entity.name] = true;
      var fields = ensureArray(entity.fields);
      for (var f = 0; f < fields.length; f++) {
        if (!fields[f].references || !fields[f].references.entity) {
          continue;
        }
        visit(map[pluralize(normalizedIdentifier(fields[f].references.entity))]);
      }
      visiting[entity.name] = false;
      visited[entity.name] = true;
      ordered.push(entity);
    }
    for (var j = 0; j < entities.length; j++) {
      visit(entities[j]);
    }
    return ordered;
  }

  function renderSeedValue(spec, entity, field, rowIndex) {
    function normalizedFieldType(fieldValue) {
      return trimmed(fieldValue && fieldValue.type).toUpperCase().replace(/\(.*\)/, "");
    }

    function seedLiteral(value, fieldValue) {
      if (value === null || value === undefined) {
        return "NULL";
      }
      if (typeof value === "number") {
        return String(value);
      }
      if (typeof value === "boolean") {
        if (/^(POSTGRESQL|HSQLDB|MARIADB|MYSQL)$/.test(String(spec.database.driver.id || "").toUpperCase())) {
          return value ? "TRUE" : "FALSE";
        }
        return value ? "1" : "0";
      }
      var type = normalizedFieldType(fieldValue);
      if (/^(INT|INTEGER|BIGINT|SMALLINT|DECIMAL|NUMERIC|NUMBER|DOUBLE|FLOAT|REAL)$/.test(type) && /^-?[0-9]+(?:\.[0-9]+)?$/.test(String(value))) {
        return String(value);
      }
      return "'" + escapeSqlString(String(value)) + "'";
    }

    if (field.primary) {
      return "DEFAULT";
    }
    if (field.references && field.references.entity) {
      var targetEntity = findEntityByName(spec.entities, field.references.entity);
      var lookupField = pickSeedLookupField(targetEntity);
      if (targetEntity && lookupField) {
        var targetValue = sampleValueForField(targetEntity, lookupField, rowIndex % Math.max(1, spec.seed.rowsPerEntity));
        return "(SELECT " + targetEntity.primaryField.column + " FROM " + targetEntity.name + " WHERE " + lookupField.column + " = " + seedLiteral(targetValue, lookupField) + ")";
      }
    }
    return seedLiteral(sampleValueForField(entity, field, rowIndex), field);
  }

  function buildDeleteSql(entity) {
    return "DELETE FROM " + entity.name + ";";
  }

  function buildSeedSql(spec, entity) {
    if (spec.seed.enabled !== true) {
      return "";
    }
    var fields = [];
    for (var i = 0; i < entity.fields.length; i++) {
      if (!entity.fields[i].primary) {
        fields.push(entity.fields[i]);
      }
    }
    if (!fields.length) {
      return "";
    }
    var rowCount = Math.max(1, spec.seed.rowsPerEntity);
    var values = [];
    for (var row = 0; row < rowCount; row++) {
      var rowValues = [];
      for (var j = 0; j < fields.length; j++) {
        rowValues.push(renderSeedValue(spec, entity, fields[j], row));
      }
      values.push("  (" + rowValues.join(", ") + ")");
    }
    return "INSERT INTO " + entity.name + " (" + fields.map(function (item) { return item.column; }).join(", ") + ") VALUES\n" + values.join(",\n") + ";";
  }

  function buildInitSql(spec) {
    var entityOrder = orderedEntities(spec);
    var chunks = [];
    for (var i = 0; i < entityOrder.length; i++) {
      chunks.push(buildCreateTableSql(spec, entityOrder[i]) + ";");
    }
    if (spec.seed.enabled === true) {
      for (var j = entityOrder.length - 1; j >= 0; j--) {
        chunks.push(buildDeleteSql(entityOrder[j]));
      }
      for (var k = 0; k < entityOrder.length; k++) {
        var seedSql = buildSeedSql(spec, entityOrder[k]);
        if (seedSql.length) {
          chunks.push(seedSql);
        }
      }
    }
    return chunks.join("\n\n");
  }

  function listColumns(entity) {
    var columns = [];
    for (var i = 0; i < entity.fields.length; i++) {
      columns.push(entity.fields[i].column);
    }
    return columns;
  }

  function txName(entity, verb) {
    var plural = entity.name;
    var singular = entity.singular;
    switch (verb) {
      case "init":
        return "init_schema";
      case "seed":
        return "seed_" + plural;
      case "list":
        return "list_" + plural;
      case "count":
        return "count_" + plural;
      case "read":
        return "read_" + singular;
      case "create":
        return "create_" + singular;
      case "update":
        return "update_" + singular;
      case "delete":
        return "delete_" + singular;
      default:
        return verb + "_" + plural;
    }
  }

  function buildCrudSql(spec, entity, verb) {
    var columns = listColumns(entity);
    var pk = entity.primaryField.column;
    var nonPkFields = entity.fields.filter(function (field) { return !field.primary; });
    var crm = crmRelationContext(spec);
    if (verb === "list") {
      if (crm && entity.name === crm.contacts.name) {
        return [
          "SELECT c." + columns.join(", c."),
          ", co.name AS company_name, co.city AS company_city, co.industry AS company_industry",
          "FROM " + entity.name + " c",
          "LEFT JOIN " + crm.companies.name + " co ON c." + crm.relationField.column + " = co." + crm.companies.primaryField.column,
          "ORDER BY c." + pk + " ASC"
        ].join("\n");
      }
      if (crm && entity.name === crm.companies.name) {
        return [
          "SELECT co." + columns.join(", co."),
          ", (SELECT COUNT(*) FROM " + crm.contacts.name + " ct WHERE ct." + crm.relationField.column + " = co." + crm.companies.primaryField.column + ") AS contact_count",
          "FROM " + entity.name + " co",
          "ORDER BY co." + pk + " ASC"
        ].join("\n");
      }
      return "SELECT " + columns.join(", ") + "\nFROM " + entity.name + "\nORDER BY " + pk + " ASC";
    }
    if (verb === "count") {
      return "SELECT COUNT(*) AS total\nFROM " + entity.name;
    }
    if (verb === "read") {
      return "SELECT " + columns.join(", ") + "\nFROM " + entity.name + "\nWHERE " + pk + " = {" + pk + "}";
    }
    if (verb === "create") {
      return "INSERT INTO " + entity.name + " (" + nonPkFields.map(function (field) { return field.column; }).join(", ") + ")\nVALUES (" + nonPkFields.map(function (field) { return "{" + field.column + "}"; }).join(", ") + ")";
    }
    if (verb === "update") {
      return "UPDATE " + entity.name + "\nSET " + nonPkFields.map(function (field) { return field.column + " = {" + field.column + "}"; }).join(",\n    ") + "\nWHERE " + pk + " = {" + pk + "}";
    }
    if (verb === "delete") {
      return "DELETE FROM " + entity.name + "\nWHERE " + pk + " = {" + pk + "}";
    }
    return "";
  }

  function buildCrmCompanyContactsSql(spec) {
    var crm = crmRelationContext(spec);
    if (!crm) {
      return "";
    }
    var contactColumns = listColumns(crm.contacts);
    return [
      "SELECT c." + contactColumns.join(", c."),
      ", co.name AS company_name, co.city AS company_city, co.industry AS company_industry",
      "FROM " + crm.contacts.name + " c",
      "LEFT JOIN " + crm.companies.name + " co ON c." + crm.relationField.column + " = co." + crm.companies.primaryField.column,
      "WHERE c." + crm.relationField.column + " = {company_id}",
      "ORDER BY c." + crm.contacts.primaryField.column + " ASC"
    ].join("\n");
  }

  function ensureConnector(project, spec, result) {
    var connector = ensureChild(project, "connectors.SqlConnector", spec.database.connector, result);
    applyUpdates(connector, connectorProperties(spec), result);
    try {
      project.setDefaultConnector(connector);
    } catch (_ignoreDefaultConnector) {}
    return connector;
  }

  function findSqlConnectorInProject(project, preferredName) {
    if (!project) {
      return null;
    }
    var preferred = trimmed(preferredName);
    if (preferred.length) {
      var byName = C8O.dbo.resolve(String(project.getName()) + "." + preferred, { optional: true });
      if (byName) {
        return byName;
      }
    }
    try {
      var defaultConnector = project.getDefaultConnector ? project.getDefaultConnector() : null;
      if (defaultConnector && String(defaultConnector.getClass().getName()).indexOf("SqlConnector") !== -1) {
        return defaultConnector;
      }
    } catch (_ignoreDefaultSqlConnector) {}
    try {
      var connectors = project.getConnectorsList();
      for (var i = 0; i < connectors.size(); i++) {
        var connector = connectors.get(i);
        if (connector && String(connector.getClass().getName()).indexOf("SqlConnector") !== -1) {
          return connector;
        }
      }
    } catch (_ignoreConnectorsList) {}
    return null;
  }

  function ensureSqlTransaction(connector, name, sqlQuery, autoCommit, result) {
    var tx = ensureChild(connector, "transactions.SqlTransaction", name, result);
    try {
      tx.setComment("Deterministic CRUD transaction " + name);
    } catch (_ignoreTxComment) {}
    tx.setSqlQuery(String(sqlQuery || ""));
    tx.setAutoCommit(autoCommit);
    tx.initializeQueries(true);
    result.updated.push(tx.getFullQName ? String(tx.getFullQName()) : name);
    return tx;
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
    for (var i = 0; i < variableNames.length; i++) {
      var name = String(variableNames[i]);
      var variable = findChild(container, name, "variables.RequestableVariable");
      if (!variable) {
        variable = createChild(container, "variables.RequestableVariable", name);
        result.created.push(variable.getFullQName ? String(variable.getFullQName()) : name);
      }
      try {
        variable.setDescription("Deterministic CRUD variable " + name);
      } catch (_ignoreRequestableVariableDescription) {}
    }
  }

  function ensureStepVariables(step, variableNames, result) {
    for (var i = 0; i < variableNames.length; i++) {
      var name = String(variableNames[i]);
      var variable = findChild(step, name, "variables.StepVariable");
      if (!variable) {
        variable = createChild(step, "variables.StepVariable", name);
        result.created.push(variable.getFullQName ? String(variable.getFullQName()) : name);
      }
      try {
        variable.setDescription("Forward request variable " + name);
      } catch (_ignoreStepVariableDescription) {}
    }
  }

  function ensurePublicSequence(project, sequenceName, sourceTransaction, variableNames, result) {
    var sequence = ensureChild(project, "sequences.GenericSequence", sequenceName, result);
    try {
      sequence.setComment("Deterministic CRUD facade " + sequenceName);
    } catch (_ignoreSequenceComment) {}
    ensureRequestableVariables(sequence, variableNames, result);
    var txStep = ensureChild(sequence, "steps.TransactionStep", "Call" + ucfirst(sequenceName), result);
    txStep.setSourceTransaction(sourceTransaction);
    txStep.setOutput(true);
    ensureStepVariables(txStep, variableNames, result);
    var copyStep = ensureChild(sequence, "steps.XMLCopyStep", "CopyPayload", result);
    var sourcePriority = priorityOf(txStep);
    applyUpdates(copyStep, {
      sourceDefinition: [sourcePriority, "./document/*"]
    }, result);
    return sequence;
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

  function collectNestedValue(payload, paths) {
    for (var i = 0; i < paths.length; i++) {
      var current = payload;
      var parts = paths[i];
      var ok = true;
      for (var j = 0; j < parts.length; j++) {
        var key = parts[j];
        if (current == null || typeof current !== "object" || !(key in current)) {
          ok = false;
          break;
        }
        current = current[key];
      }
      if (ok && current !== undefined && current !== null) {
        return current;
      }
    }
    return null;
  }

  function summarizeRequestableProof(payload, requestable, result) {
    var safe = C8O.util.toJsonSafe ? C8O.util.toJsonSafe(payload, {
      warnings: ensureWarnings(result),
      path: "$.runtimeEvidence." + normalizedIdentifier(requestable)
    }) : payload;
    var summary = {
      requestable: requestable,
      status: normalizeStatus(safe && safe.status, "ok"),
      ok: isSuccessLikeStatus(safe && safe.status)
    };

    var totalValue = collectNestedValue(safe, [
      ["total"],
      ["result", "total"],
      ["response", "total"],
      ["item", "total"],
      ["document", "total"]
    ]);
    if (totalValue != null && totalValue !== "") {
      var totalNumber = Number(totalValue);
      summary.total = isNaN(totalNumber) ? String(totalValue) : totalNumber;
    }

    var itemsValue = collectNestedValue(safe, [
      ["items"],
      ["result", "items"],
      ["response", "items"],
      ["document", "items"]
    ]);
    if (Array.isArray(itemsValue)) {
      summary.itemCount = itemsValue.length;
    }

    var sourceValue = collectNestedValue(safe, [
      ["source"],
      ["result", "source"],
      ["response", "source"],
      ["document", "source"]
    ]);
    if (sourceValue != null && sourceValue !== "") {
      summary.source = String(sourceValue);
    }

    var messageValue = collectNestedValue(safe, [
      ["message"],
      ["result", "message"],
      ["response", "message"],
      ["error"],
      ["result", "error"],
      ["response", "error"]
    ]);
    if (!summary.ok && messageValue != null && messageValue !== "") {
      summary.message = String(messageValue);
    }

    return summary;
  }

  function requestablePayload(requestable, variables, result) {
    try {
      return callInternalSequence("tools_requestable_execute", {
        requestable: requestable,
        variables: variables || {}
      });
    } catch (proofError) {
      addWarning(result, "Unable to execute proof for " + requestable + ": " + String(proofError));
      return {
        status: "error",
        error: String(proofError)
      };
    }
  }

  function proofRequestable(requestable, variables, result) {
    var payload = requestablePayload(requestable, variables, result);
    return summarizeRequestableProof(payload, requestable, result);
  }

  function firstSqlOutputRow(payload) {
    var sqlOutput = collectNestedValue(payload, [
      ["sql_output"],
      ["result", "sql_output"],
      ["response", "sql_output"],
      ["document", "sql_output"]
    ]);
    if (Array.isArray(sqlOutput) && sqlOutput.length) {
      return sqlOutput[0];
    }
    return null;
  }

  function collectSqlOutputRows(payload) {
    var sqlOutput = collectNestedValue(payload, [
      ["sql_output"],
      ["result", "sql_output"],
      ["response", "sql_output"],
      ["document", "sql_output"],
      ["transaction", "document", "sql_output"],
      ["result", "transaction", "document", "sql_output"],
      ["response", "transaction", "document", "sql_output"]
    ]);
    return Array.isArray(sqlOutput) ? sqlOutput : [];
  }

  function extractRowField(row, candidates) {
    if (!row || typeof row !== "object") {
      return null;
    }
    for (var i = 0; i < candidates.length; i++) {
      if (row[candidates[i]] !== undefined && row[candidates[i]] !== null && row[candidates[i]] !== "") {
        return row[candidates[i]];
      }
    }
    return null;
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

  function parseLooseJson(value) {
    var candidate = value;
    for (var depth = 0; depth < 3; depth++) {
      if (typeof candidate !== "string") {
        return candidate;
      }
      var text = trimmed(candidate);
      if (!text.length) {
        return "";
      }
      try {
        candidate = JSON.parse(text);
      } catch (_ignoreLooseJson) {
        return text;
      }
    }
    return candidate;
  }

  function toArrayLike(value) {
    if (value == null) {
      return null;
    }
    if (Array.isArray(value)) {
      return value.slice();
    }
    try {
      var NativeArray = Packages.org.mozilla.javascript.NativeArray;
      if (value instanceof NativeArray) {
        var nativeLength = Number(value.getLength ? value.getLength() : value.length);
        var nativeItems = [];
        for (var i = 0; i < nativeLength; i++) {
          nativeItems.push(value[i]);
        }
        return nativeItems;
      }
    } catch (_ignoreNativeArray) {}
    try {
      if (value instanceof Packages.java.util.Collection) {
        var collectionItems = [];
        var iterator = value.iterator();
        while (iterator.hasNext()) {
          collectionItems.push(iterator.next());
        }
        return collectionItems;
      }
    } catch (_ignoreJavaCollection) {}
    try {
      var javaClass = value && value.getClass ? value.getClass() : null;
      if (javaClass && javaClass.isArray && javaClass.isArray()) {
        var JavaArray = Packages.java.lang.reflect.Array;
        var arrayLength = JavaArray.getLength(value);
        var arrayItems = [];
        for (var j = 0; j < arrayLength; j++) {
          arrayItems.push(JavaArray.get(value, j));
        }
        return arrayItems;
      }
    } catch (_ignoreJavaArray) {}
    return null;
  }

  function normalizeProofRequestablesInput(value) {
    var source = value;
    if (source == null) {
      return [];
    }
    var arrayLike = toArrayLike(source);
    if (arrayLike) {
      return dedupeStrings(arrayLike);
    }
    if (C8O.util && typeof C8O.util.toJsonSafe === "function") {
      source = C8O.util.toJsonSafe(source, { maxDepth: 4 });
      arrayLike = toArrayLike(source);
      if (arrayLike) {
        return dedupeStrings(arrayLike);
      }
    }
    if (typeof source === "string") {
      source = parseLooseJson(source);
    }
    arrayLike = toArrayLike(source);
    if (arrayLike) {
      return dedupeStrings(arrayLike);
    }
    if (Array.isArray(source)) {
      return dedupeStrings(source);
    }
    if (source && typeof source === "object") {
      if (Array.isArray(source.requestables)) {
        return dedupeStrings(source.requestables);
      }
      arrayLike = toArrayLike(source.requestables);
      if (arrayLike) {
        return dedupeStrings(arrayLike);
      }
      if (typeof source.requestables === "string") {
        return normalizeProofRequestablesInput(source.requestables);
      }
    }
    var text = trimmed(source);
    if (!text.length) {
      return [];
    }
    if (text.indexOf(",") !== -1) {
      return dedupeStrings(text.split(","));
    }
    return [text];
  }

  function resolveProofRequestableQName(requestable, projectName, connectorName) {
    var text = trimmed(requestable);
    if (!text.length) {
      return "";
    }
    if (text.indexOf(".") !== -1) {
      if (text.indexOf(projectName + ".") === 0) {
        return text;
      }
      if (text.split(".").length >= 3) {
        return text;
      }
      return projectName + "." + text;
    }
    if (trimmed(connectorName).length) {
      return projectName + "." + connectorName + "." + text;
    }
    return projectName + "." + text;
  }

  function proofCheck(id, ok, message, target) {
    var check = {
      id: trimmed(id),
      status: ok ? "ok" : "missing",
      ok: ok === true
    };
    if (trimmed(message).length) {
      check.message = String(message);
    }
    if (trimmed(target).length) {
      check.target = String(target);
    }
    return check;
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
      var entityName = pluralize(normalizedIdentifier(raw.name || raw.entity || raw.label || ("entity_" + (i + 1))));
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
        singular: singularize(entityName),
        label: trimmed(raw.label || ucfirst(entityName)),
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
    if (value === null || value === undefined) {
      return "''";
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return "'" + String(value)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n") + "'";
  }

  function compVariableNode(name, valueExpression, comment) {
    var node = {
      className: "ngx.components.UICompVariable#UICompVariable",
      name: name
    };
    var properties = {};
    if (comment) {
      properties.comment = String(comment);
    }
    properties.value = valueExpression || "''";
    node.properties = properties;
    return node;
  }

  function useVariableNode(name, valueExpression, comment) {
    var smartValue = null;
    if (valueExpression && typeof valueExpression === "object" && valueExpression.mode) {
      smartValue = valueExpression;
    } else {
      smartValue = {
        mode: "SCRIPT",
        value: valueExpression || "''"
      };
    }
    var node = {
      className: "ngx.components.UIUseVariable#UIUseVariable",
      name: name,
      properties: {
        varValue: smartValue
      }
    };
    if (comment) {
      node.properties.comment = String(comment);
    }
    return node;
  }

  function controlVariableNode(name, valueExpression, comment) {
    var smartValue = null;
    if (valueExpression && typeof valueExpression === "object" && valueExpression.mode) {
      smartValue = valueExpression;
    } else {
      smartValue = {
        mode: "SCRIPT",
        value: valueExpression || "''"
      };
    }
    var node = {
      className: "ngx.components.UIControlVariable#UIControlVariable",
      name: name,
      properties: {
        varValue: smartValue
      }
    };
    if (comment) {
      node.properties.comment = String(comment);
    }
    return node;
  }

  function pageEventNode(name, viewEvent, children, comment) {
    var node = {
      className: "ngx.components.UIPageEvent#UIPageEvent",
      name: name,
      properties: {
        viewEvent: trimmed(viewEvent || "onWillEnter")
      },
      children: ensureArray(children)
    };
    if (comment) {
      node.properties.comment = String(comment);
    }
    return node;
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
    var extra = options && typeof options === "object" ? options : {};
    var properties = {
      requestable: trimmed(requestableQName)
    };
    if (extra.threshold != null) {
      properties.threshold = String(extra.threshold);
    }
    if (extra.noLoading != null) {
      properties.noLoading = String(toBoolean(extra.noLoading, false));
    }
    if (extra.cacheTtl != null) {
      properties.cacheTtl = String(extra.cacheTtl);
    }
    if (extra.timeout != null) {
      properties.timeout = String(extra.timeout);
    }
    return {
      className: "ngx.components.UIDynamicAction#CallSequenceAction",
      name: name,
      properties: properties,
      children: ensureArray(variables)
    };
  }

  function customAsyncActionNode(name, actionValue, comment) {
    var properties = {
      actionValue: actionValue || "return;"
    };
    if (trimmed(comment).length) {
      properties.comment = String(comment);
    }
    return {
      className: "ngx.components.UICustomAsyncAction#UICustomAsyncAction",
      name: name,
      properties: properties
    };
  }

  function smartTextNode(name, smartValue) {
    return {
      className: "ngx.components.UIText#UIText",
      name: name,
      properties: {
        textValue: smartValue
      }
    };
  }

  function plainTextNode(name, value) {
    return smartTextNode(name, {
      mode: "PLAIN",
      value: value == null ? "" : String(value)
    });
  }

  function scriptTextNode(name, valueExpression) {
    return smartTextNode(name, {
      mode: "SCRIPT",
      value: valueExpression || "''"
    });
  }

  function attributeNode(name, attrName, smartValue) {
    return {
      className: "ngx.components.UIAttribute#UIAttribute",
      name: name,
      properties: {
        attrName: String(attrName),
        attrValue: smartValue
      }
    };
  }

  function labelNode(name, value) {
    return {
      className: "ngx.components.UIDynamicElement#Label",
      name: name,
      children: [
        plainTextNode(name + "Text", value)
      ]
    };
  }

  function textElementNode(className, name, textNode) {
    return {
      className: className,
      name: name,
      children: [textNode]
    };
  }

  function schemaPreviewFields(entity, limit, includePrimary) {
    var fields = ensureArray(entity && entity.fields);
    var ranked = [];
    function fieldPriority(field) {
      var column = normalizedIdentifier(field && (field.column || field.name));
      if (!column.length) {
        return 900;
      }
      if (field.primary) {
        return includePrimary ? 800 : 1000;
      }
      if (field.references || /(^|_)(id|.*_id)$/.test(column)) {
        return 300;
      }
      var preferred = [
        "name",
        "title",
        "firstname",
        "lastname",
        "email",
        "city",
        "industry",
        "category",
        "status",
        "vote",
        "comment",
        "preferred_day",
        "phone"
      ];
      for (var p = 0; p < preferred.length; p++) {
        if (column === preferred[p]) {
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
    return {
      mode: "SOURCE",
      value: JSON.stringify({
        filter: "Shared",
        project: projectName,
        input: "",
        model: {
          data: [{ priority: Number(priority), regular: true }],
          path: "?." + variableName,
          prefix: "",
          suffix: "",
          custom: "",
          useCustom: false
        }
      })
    };
  }

  function sequenceSourceValue(projectName, sequenceName, path, options) {
    var sequenceQName = trimmed(sequenceName);
    var extra = options && typeof options === "object" ? options : {};
    return {
      mode: "SOURCE",
      value: JSON.stringify({
        filter: "Sequence",
        project: projectName,
        input: trimmed(extra.input || ""),
        model: {
          data: [{ sequence: sequenceQName, marker: "" }],
          path: trimmed(path || ""),
          prefix: extra.prefix == null ? "" : String(extra.prefix),
          suffix: extra.suffix == null ? "" : String(extra.suffix),
          custom: extra.custom == null ? "" : String(extra.custom),
          useCustom: toBoolean(extra.useCustom, false)
        }
      })
    };
  }

  function connectorRequestableQName(projectName, connectorName, requestableName) {
    return trimmed(projectName) + "." + trimmed(connectorName) + "." + trimmed(requestableName);
  }

  function globalSourceValue(projectName, path, options) {
    var extra = options && typeof options === "object" ? options : {};
    return {
      mode: "SOURCE",
      value: JSON.stringify({
        filter: "Global",
        project: projectName,
        input: trimmed(extra.input || ""),
        model: {
          data: [{ sharedObject: "router.sharedObject" }],
          path: trimmed(path || ""),
          prefix: extra.prefix == null ? "" : String(extra.prefix),
          suffix: extra.suffix == null ? "" : String(extra.suffix),
          custom: extra.custom == null ? "" : String(extra.custom),
          useCustom: toBoolean(extra.useCustom, false)
        }
      })
    };
  }

  function iterationSourceValue(projectName, inputExpression) {
    return {
      mode: "SOURCE",
      value: JSON.stringify({
        filter: "Iteration",
        project: projectName,
        input: String(inputExpression || "")
      })
    };
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
    return {
      className: "ngx.components.UIUseShared#" + sharedQName,
      name: name,
      properties: {
        sharedcomponent: sharedQName
      },
      children: variables || []
    };
  }

  function dashboardActionQName(projectName, actionName) {
    return ngxAppQName(projectName) + "." + trimmed(actionName);
  }

  function dashboardUiGlobals() {
    return [
      "crudBuildStage",
      "crudLoading",
      "crudError",
      "crudStatus",
      "crudRows",
      "crudCounts",
      "crudSamples"
    ];
  }

  function entityPagesUiGlobals() {
    return [
      "crudBuildStage",
      "crudLoading",
      "crudError",
      "crudStatus",
      "crudRows",
      "crudCounts",
      "crudSamples",
      "crudSelected",
      "crudDrafts",
      "crudModes",
      "crudEntityStatus",
      "crudEntityErrors"
    ];
  }

  function crmUiGlobals() {
    return [
      "crmBuildStage",
      "crmLoading",
      "crmError",
      "crmStatus",
      "crmCompanies",
      "crmContacts",
      "crmCounts",
      "crmSelectedCompany",
      "crmCompanyContacts"
    ];
  }

  function statefulUiGlobals(variant) {
    var normalizedVariant = trimmed(variant).toLowerCase();
    if (normalizedVariant === "master-detail") {
      return crmUiGlobals();
    }
    if (normalizedVariant === "entity-pages") {
      return entityPagesUiGlobals();
    }
    return dashboardUiGlobals();
  }

  function everyQNameExists(qnames) {
    var entries = ensureArray(qnames);
    if (!entries.length) {
      return false;
    }
    for (var i = 0; i < entries.length; i++) {
      var qname = trimmed(entries[i]);
      if (!qname.length || !C8O.dbo.resolve(qname, { optional: true })) {
        return false;
      }
    }
    return true;
  }

  function statefulBootstrapStageQName(projectName, variant) {
    var normalizedVariant = trimmed(variant).toLowerCase();
    return (normalizedVariant === "master-detail"
      ? crmActionQName(projectName, "crm_bootstrap_dashboard")
      : dashboardActionQName(projectName, "crud_bootstrap_dashboard")) + ".SetBuildStage";
  }

  function statefulBootstrapRowQName(projectName, entryPage, variant) {
    var normalizedVariant = trimmed(variant).toLowerCase();
    var pageRoot = pageQName(projectName, entryPage) + ".Content.";
    return normalizedVariant === "master-detail"
      ? pageRoot + "CrmMasterDetailGrid.BootstrapRow"
      : pageRoot + "CrudDashboardGrid.BootstrapRow";
  }

  function dashboardRowsExpression(entityKeyExpression) {
    var keyExpr = trimmed(entityKeyExpression || "''") || "''";
    return "(((this.global?.crudRows || {})[" + keyExpr + "]) || [])";
  }

  function dashboardCountExpression(entityKeyExpression) {
    var keyExpr = trimmed(entityKeyExpression || "''") || "''";
    var rowsExpr = dashboardRowsExpression(keyExpr);
    return "((this.global?.crudCounts || {})[" + keyExpr + "] ?? ((" + rowsExpr + ").length ?? 0))";
  }

  function dashboardSampleExpression(entityKeyExpression) {
    var keyExpr = trimmed(entityKeyExpression || "''") || "''";
    return "(((this.global?.crudSamples || {})[" + keyExpr + "]) || null)";
  }

  function crudSelectedExpression(entityKeyExpression) {
    var keyExpr = trimmed(entityKeyExpression || "''") || "''";
    return "(((this.global?.crudSelected || {})[" + keyExpr + "]) || null)";
  }

  function crudDraftExpression(entityKeyExpression) {
    var keyExpr = trimmed(entityKeyExpression || "''") || "''";
    return "(((this.global?.crudDrafts || {})[" + keyExpr + "]) || {})";
  }

  function crudModeExpression(entityKeyExpression) {
    var keyExpr = trimmed(entityKeyExpression || "''") || "''";
    return "(((this.global?.crudModes || {})[" + keyExpr + "]) || 'update')";
  }

  function crudEntityStatusExpression(entityKeyExpression) {
    var keyExpr = trimmed(entityKeyExpression || "''") || "''";
    return "(((this.global?.crudEntityStatus || {})[" + keyExpr + "]) || 'idle')";
  }

  function crudEntityErrorExpression(entityKeyExpression) {
    var keyExpr = trimmed(entityKeyExpression || "''") || "''";
    return "(((this.global?.crudEntityErrors || {})[" + keyExpr + "]) || '')";
  }

  function dynamicFieldAccessExpression(targetExpression, fieldExpression, fallbackExpression) {
    var targetExpr = trimmed(targetExpression || "null") || "null";
    var fieldExpr = trimmed(fieldExpression || "''") || "''";
    var fallbackExpr = fallbackExpression == null ? "''" : String(fallbackExpression);
    var literalField = null;
    if ((fieldExpr.charAt(0) === "'" && fieldExpr.charAt(fieldExpr.length - 1) === "'") ||
      (fieldExpr.charAt(0) === "\"" && fieldExpr.charAt(fieldExpr.length - 1) === "\"")) {
      literalField = fieldExpr.substring(1, fieldExpr.length - 1);
      if (fieldExpr.charAt(0) === "'") {
        literalField = literalField.replace(/\\'/g, "'");
      } else {
        literalField = literalField.replace(/\\"/g, "\"");
      }
    }
    if (literalField != null) {
      return "(" + targetExpr + "?.[" + fieldExpr + "] ?? " +
        targetExpr + "?.[" + scriptLiteral(literalField.toUpperCase()) + "] ?? " +
        targetExpr + "?.[" + scriptLiteral(literalField.toLowerCase()) + "] ?? " +
        fallbackExpr + ")";
    }
    return "(" + targetExpr + "?.[" + fieldExpr + "] ?? " +
      targetExpr + "?.[(('' + (" + fieldExpr + " || '')).toUpperCase())] ?? " +
      targetExpr + "?.[(('' + (" + fieldExpr + " || '')).toLowerCase())] ?? " +
      fallbackExpr + ")";
  }

  function dashboardHeaderComponentTree(componentName, projectName, entities) {
    var defaultTitle = ucfirst(projectName) + " Live Dashboard";
    var defaultSubtitle = entities.map(function (entity) {
      return entity.label;
    }).join(" and ");
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Deterministic CRUD dashboard header bound to global state."
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
                textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  "CrudPageHeaderTitleSlot",
                  scriptTextNode("TitleText", "this.Title || " + scriptLiteral(defaultTitle))
                ),
                textElementNode(
                  "ngx.components.UIDynamicElement#CardSubTitle",
                  "CrudPageHeaderSubtitleSlot",
                  scriptTextNode("SubtitleText", "this.Subtitle || (this.global?.crudStatus === 'ok' ? 'Public facade data is live.' : (this.global?.crudLoading ? 'Loading public facade...' : (this.global?.crudError || 'Preparing public facade state.')))")
                )
              ]
            }
          ]
        }
      ]
    };
  }

  function dashboardWorkInProgressCardTree(componentName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Temporary dashboard bootstrap card."
      },
      children: [
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "WorkInProgressCard",
          properties: {
            IonColor: {
              mode: "PLAIN",
              value: "warning"
            }
          },
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "WorkInProgressHeader",
              children: [
                textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  "WorkInProgressTitle",
                  plainTextNode("WorkInProgressTitleText", "Work in progress")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "WorkInProgressContent",
              children: [
                scriptTextNode("WorkInProgressText", "'Bootstrap stage visible. Current build stage: ' + (this.global?.crudBuildStage ?? 'bootstrap')"),
                plainTextNode("WorkInProgressHint", "The CRUD shell is visible while live shared actions populate global state.")
              ]
            }
          ]
        }
      ]
    };
  }

  function dashboardStatCardGlobalTree(componentName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Deterministic CRUD dashboard stat card bound to global state."
      },
      children: [
        compVariableNode("Title", "'Title'"),
        compVariableNode("EntityKey", "'items'"),
        compVariableNode("Caption", "'Loaded from public facade'"),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "DashboardCard",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "DashboardHeader",
              children: [
                textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  "DashboardTitleSlot",
                  scriptTextNode("TitleText", "this.Title || 'Title'")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "DashboardContent",
              children: [
                scriptTextNode("ValueText", "'' + (" + dashboardCountExpression("this.EntityKey") + ")"),
                scriptTextNode("CaptionText", "this.Caption || (this.global?.crudLoading ? 'Loading public facade...' : (this.global?.crudError || 'Loaded from public facade'))")
              ]
            }
          ]
        }
      ]
    };
  }

  function dashboardLoadingStateTree(componentName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Deterministic CRUD loading state bound to global state."
      },
      children: [
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "LoadingCard",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "LoadingContent",
              children: [
                scriptTextNode("LoadingText", "this.global?.crudLoading ? 'Loading public facade rows...' : ('State: ' + (this.global?.crudStatus ?? 'idle'))")
              ]
            }
          ]
        }
      ]
    };
  }

  function dashboardErrorRetryStateTree(componentName, projectName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Deterministic CRUD error state with retry action."
      },
      children: [
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "ErrorCard",
          properties: {
            IonColor: {
              mode: "PLAIN",
              value: "warning"
            }
          },
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "ErrorHeader",
              children: [
                textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  "ErrorTitle",
                  plainTextNode("ErrorTitleText", "Retry public facade")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "ErrorContent",
              children: [
                scriptTextNode("ErrorText", "this.global?.crudError || 'Retry if one public facade call fails.'"),
                {
                  className: "ngx.components.UIDynamicElement#Button",
                  name: "RetryButton",
                  properties: {
                    IonColor: {
                      mode: "PLAIN",
                      value: "primary"
                    }
                  },
                  children: [
                    plainTextNode("RetryText", "Retry"),
                    controlEventNode("Event", [
                      customAsyncActionNode(
                        "RetryDashboard",
                        [
                          "try {",
                          "  if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {",
                          "    window.location.reload();",
                          "  }",
                          "} finally {",
                          "  return;",
                          "}"
                        ].join("\n"),
                        "Reload the current page to rerun the dashboard bootstrap action."
                      )
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

  function dashboardEntityTableTreeGlobal(projectName, entity) {
    var componentName = ucfirst(entity.singular) + "Table";
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Deterministic CRUD table summary bound to global state for " + entity.label + "."
      },
      children: [
        compVariableNode("Title", scriptLiteral(entity.label)),
        compVariableNode("EntityKey", scriptLiteral(entity.name)),
        compVariableNode("PrimaryField", scriptLiteral((entity.primaryField && entity.primaryField.column) || "id")),
        compVariableNode("SecondaryField", scriptLiteral(((schemaPreviewFields(entity, 2, false)[0] || entity.primaryField || {}).column) || "id")),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: componentName + "Card",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: componentName + "Header",
              children: [
                textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  componentName + "TitleSlot",
                  scriptTextNode("TitleText", "this.Title || " + scriptLiteral(entity.label))
                ),
                textElementNode(
                  "ngx.components.UIDynamicElement#CardSubTitle",
                  componentName + "SubtitleSlot",
                  scriptTextNode("SubtitleText", "'Loaded ' + (" + dashboardCountExpression("this.EntityKey") + ") + ' rows'")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: componentName + "Content",
              children: [
                ifDirectiveNode(
                  componentName + "Empty",
                  dashboardCountExpression("this.EntityKey") + " === 0",
                  [
                    textElementNode(
                      "ngx.components.UIDynamicElement#Paragraph",
                      componentName + "EmptyParagraph",
                      plainTextNode("EmptyText", "No rows available yet.")
                    )
                  ]
                ),
                {
                  className: "ngx.components.UIDynamicElement#List",
                  name: componentName + "List",
                  children: [
                    iterationDirectiveNode(
                      componentName + "Loop",
                      projectName,
                      "row",
                      dashboardRowsExpression("this.EntityKey"),
                      [
                        {
                          className: "ngx.components.UIDynamicElement#ListItem",
                          name: componentName + "Item",
                          properties: {
                            Detail: {
                              mode: "PLAIN",
                              value: "false"
                            }
                          },
                          children: [
                            {
                              className: "ngx.components.UIDynamicElement#Label",
                              name: componentName + "Label",
                              children: [
                                textElementNode(
                                  "ngx.components.UIDynamicElement#Heading2",
                                  componentName + "Heading",
                                  smartTextNode("HeadingText", iterationSourceValue(projectName, dynamicFieldAccessExpression("row", "this.PrimaryField", scriptLiteral("No primary value"))))
                                ),
                                textElementNode(
                                  "ngx.components.UIDynamicElement#Paragraph",
                                  componentName + "Paragraph",
                                  smartTextNode("ParagraphText", iterationSourceValue(projectName, dynamicFieldAccessExpression("row", "this.SecondaryField", scriptLiteral("No secondary value"))))
                                )
                              ]
                            }
                          ]
                        }
                      ]
                    )
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
  }

  function dashboardEntityCardTreeGlobal(entity) {
    var componentName = ucfirst(entity.singular) + "Card";
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Deterministic CRUD entity card bound to global sample state for " + entity.label + "."
      },
      children: [
        compVariableNode("Title", scriptLiteral(ucfirst(entity.singular) + " snapshot")),
        compVariableNode("EntityKey", scriptLiteral(entity.name)),
        compVariableNode("PrimaryField", scriptLiteral((schemaPreviewFields(entity, 2, false)[0] || entity.primaryField || {}).column || "id")),
        compVariableNode("SecondaryField", scriptLiteral((schemaPreviewFields(entity, 2, false)[1] || schemaPreviewFields(entity, 2, false)[0] || entity.primaryField || {}).column || "id")),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: componentName + "Root",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: componentName + "Header",
              children: [
                textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  componentName + "TitleSlot",
                  scriptTextNode("TitleText", "this.Title || " + scriptLiteral(ucfirst(entity.singular) + " snapshot"))
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: componentName + "Content",
              children: [
                scriptTextNode("PrimaryText", dynamicFieldAccessExpression(dashboardSampleExpression("this.EntityKey"), "this.PrimaryField", scriptLiteral("No sample loaded yet"))),
                scriptTextNode("SecondaryText", dynamicFieldAccessExpression(dashboardSampleExpression("this.EntityKey"), "this.SecondaryField", scriptLiteral("No secondary value yet"))),
                scriptTextNode("InsightText", "'Rows loaded: ' + (" + dashboardCountExpression("this.EntityKey") + ")")
              ]
            }
          ]
        }
      ]
    };
  }

  function dashboardEntityFormTreeGlobal(entity) {
    var componentName = ucfirst(entity.singular) + "Form";
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Deterministic CRUD form shell bound to global sample state for " + entity.label + "."
      },
      children: [
        compVariableNode("Title", scriptLiteral("Edit " + ucfirst(entity.singular))),
        compVariableNode("EntityKey", scriptLiteral(entity.name)),
        compVariableNode("PrimaryField", scriptLiteral((schemaPreviewFields(entity, 2, false)[0] || entity.primaryField || {}).column || "id")),
        compVariableNode("SecondaryField", scriptLiteral((schemaPreviewFields(entity, 2, false)[1] || schemaPreviewFields(entity, 2, false)[0] || entity.primaryField || {}).column || "id")),
        compVariableNode("ActionLabel", scriptLiteral("Save " + entity.singular)),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: componentName + "Root",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: componentName + "Header",
              children: [
                textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  componentName + "TitleSlot",
                  scriptTextNode("TitleText", "this.Title || " + scriptLiteral("Edit " + ucfirst(entity.singular)))
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: componentName + "Content",
              children: [
                scriptTextNode("HelperText", "'Facade rows available: ' + (" + dashboardCountExpression("this.EntityKey") + ") + ' for ' + (this.EntityKey || 'entity')"),
                scriptTextNode("SampleText", "'Sample live value: ' + (" + dynamicFieldAccessExpression(dashboardSampleExpression("this.EntityKey"), "this.SecondaryField", scriptLiteral("n/a")) + ")"),
                {
                  className: "ngx.components.UIDynamicElement#Button",
                  name: "SubmitButton",
                  children: [
                    scriptTextNode("ActionText", "this.ActionLabel || " + scriptLiteral("Save " + entity.singular))
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
  }

  function buildDashboardSharedComponentsTree(projectName, entities, stage) {
    var components = [
      dashboardHeaderComponentTree("CrudPageHeader", projectName, entities),
      dashboardStatCardGlobalTree("DashboardStatCard"),
      dashboardLoadingStateTree("CrudLoadingState"),
      dashboardErrorRetryStateTree("CrudErrorRetryState", projectName)
    ];
    if (trimmed(stage).toLowerCase() !== "final") {
      components.push(dashboardWorkInProgressCardTree("WorkInProgressCard"));
    }
    for (var i = 0; i < entities.length; i++) {
      components.push(dashboardEntityTableTreeGlobal(projectName, entities[i]));
      components.push(dashboardEntityCardTreeGlobal(entities[i]));
      components.push(dashboardEntityFormTreeGlobal(entities[i]));
    }
    return {
      qnames: components.map(function (component) { return sharedComponentQName(projectName, component.name); }),
      tree: {
        children: components
      }
    };
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
    var entityKeyLiteral = scriptLiteral(entity.name);
    var errorMessageLiteral = scriptLiteral("Unable to load " + entity.label.toLowerCase());
    var logPrefixLiteral = scriptLiteral("[MB] crud_refresh_" + entity.name + " failed");
    return [
      "page.global = page.global || {};",
      "try {",
      "  var result = " + actionCallSnippet(requestableQName, "{}", 3000, 5000, true) + ";",
      "  var rows = " + actionRowsExpression("result") + ";",
      "  page.global.crudRows = Object.assign({}, page.global.crudRows || {}, { " + entityKeyLiteral + ": rows });",
      "  page.global.crudCounts = Object.assign({}, page.global.crudCounts || {}, { " + entityKeyLiteral + ": rows.length });",
      "  page.global.crudSamples = Object.assign({}, page.global.crudSamples || {}, { " + entityKeyLiteral + ": (rows[0] ?? null) });",
      "  var status = (result && result.status) ? result.status : 'ok';",
      "  if (status !== 'ok') {",
      "    page.global.crudError = page.global.crudError || (result?.error ?? " + errorMessageLiteral + ");",
      "    page.global.crudStatus = 'error';",
      "  } else {",
      "    page.global.crudError = page.global.crudError || '';",
      "    page.global.crudStatus = page.global.crudError ? 'error' : 'ok';",
      "  }",
      "  page.ref.markForCheck();",
      "  return result;",
      "} catch (e) {",
      "  var message = (e && e.message) ? e.message : ('' + e);",
      "  page.global.crudRows = Object.assign({}, page.global.crudRows || {}, { " + entityKeyLiteral + ": [] });",
      "  page.global.crudCounts = Object.assign({}, page.global.crudCounts || {}, { " + entityKeyLiteral + ": 0 });",
      "  page.global.crudSamples = Object.assign({}, page.global.crudSamples || {}, { " + entityKeyLiteral + ": null });",
      "  page.global.crudError = page.global.crudError || message || " + errorMessageLiteral + ";",
      "  page.global.crudStatus = 'error';",
      "  page.c8o.log.debug(" + logPrefixLiteral + ", e);",
      "  page.ref.markForCheck();",
      "  return { status: 'error', error: page.global.crudError, sql_output: [] };",
      "}"
    ].join("\n");
  }

  function buildDashboardBootstrapActionScript(projectName, facadePrefix, entities, stage) {
    var configs = entities.map(function (entity) {
      return {
        key: entity.name,
        label: entity.label,
        requestable: facadeSequenceQName(projectName, facadePrefix, entity, "list")
      };
    });
    return [
      "page.global = page.global || {};",
      "page.global.crudBuildStage = " + scriptLiteral(trimmed(stage || "bootstrap")) + ";",
      "page.global.crudLoading = true;",
      "page.global.crudError = '';",
      "page.global.crudStatus = 'loading';",
      "page.global.crudRows = {};",
      "page.global.crudCounts = {};",
      "page.global.crudSamples = {};",
      "page.ref.markForCheck();",
      "var configs = " + JSON.stringify(configs) + ";",
      "var runRefresh = async function(config) {",
      "  try {",
      "    var result = " + actionCallFromExpressionSnippet("config.requestable", "{}", 3000, 5000, true) + ";",
      "    var rows = " + actionRowsExpression("result") + ";",
      "    var status = (result && result.status) ? result.status : 'ok';",
      "    return { key: config.key, rows: rows, status: status, error: status !== 'ok' ? (result?.error ?? ('Unable to load ' + String(config.label || config.key).toLowerCase())) : '', result: result };",
      "  } catch (e) {",
      "    var message = (e && e.message) ? e.message : ('' + e);",
      "    page.c8o.log.debug('[MB] crud_bootstrap_dashboard refresh failed for ' + String((config && config.key) || 'entity'), e);",
      "    return { key: config.key, rows: [], status: 'error', error: message || ('Unable to load ' + String(config.label || config.key).toLowerCase()), result: { status: 'error', error: message || ('Unable to load ' + String(config.label || config.key).toLowerCase()), sql_output: [] } };",
      "  }",
      "};",
      "try {",
      "  var results = await Promise.all(configs.map(function(config) { return runRefresh(config); }));",
      "  var rowsByKey = {};",
      "  var countsByKey = {};",
      "  var samplesByKey = {};",
      "  var firstError = '';",
      "  for (var i = 0; i < results.length; i++) {",
      "    var item = results[i];",
      "    var rows = Array.isArray(item.rows) ? item.rows : [];",
      "    rowsByKey[item.key] = rows;",
      "    countsByKey[item.key] = rows.length;",
      "    samplesByKey[item.key] = rows[0] ?? null;",
      "    if (!firstError && item.status !== 'ok') {",
      "      firstError = item.error || ('Unable to load ' + String(item.key || 'entity'));",
      "    }",
      "  }",
      "  page.global.crudRows = rowsByKey;",
      "  page.global.crudCounts = countsByKey;",
      "  page.global.crudSamples = samplesByKey;",
      "  page.global.crudError = firstError;",
      "  page.global.crudStatus = firstError ? 'error' : 'ok';",
      "  page.ref.markForCheck();",
      "  return { status: page.global.crudStatus, results: results };",
      "} finally {",
      "  page.global.crudLoading = false;",
      "  page.ref.markForCheck();",
      "}"
    ].join("\n");
  }

  function buildDashboardPageScriptContent(projectName, facadePrefix, entities, stage) {
    var configs = entities.map(function (entity) {
      return {
        key: entity.name,
        label: entity.label,
        requestable: facadeSequenceQName(projectName, facadePrefix, entity, "list")
      };
    });
    return [
      "/*Begin_c8o_PageDeclaration*/",
      "\tpublic __crudBootstrapStarted: boolean = false;",
      "/*End_c8o_PageDeclaration*/",
      "/*Begin_c8o_PageConstructor*/",
      "\t\tsetTimeout(() => {",
      "\t\t\tthis.bootstrapCrudDashboardState().catch((error: any) => {",
      "\t\t\t\tthis.c8o.log.debug('[MB] bootstrapCrudDashboardState failed', error);",
      "\t\t\t\tthis.__crudBootstrapStarted = false;",
      "\t\t\t});",
      "\t\t}, 0);",
      "/*End_c8o_PageConstructor*/",
      "/*Begin_c8o_PageFunction*/",
      "\tpublic async bootstrapCrudDashboardState(): Promise<any> {",
      "\t\tif (this.__crudBootstrapStarted && (this.global?.crudLoading === true || this.global?.crudStatus === 'ok')) {",
      "\t\t\treturn this.global?.crudStatus ?? 'ok';",
      "\t\t}",
      "\t\tthis.__crudBootstrapStarted = true;",
      "\t\tthis.global = this.global || {};",
      "\t\tthis.global.crudBuildStage = " + scriptLiteral(trimmed(stage || "bootstrap")) + ";",
      "\t\tthis.global.crudLoading = true;",
      "\t\tthis.global.crudError = '';",
      "\t\tthis.global.crudStatus = 'loading';",
      "\t\tthis.global.crudRows = {};",
      "\t\tthis.global.crudCounts = {};",
      "\t\tthis.global.crudSamples = {};",
      "\t\tthis.ref.markForCheck();",
      "\t\tconst configs = " + JSON.stringify(configs) + ";",
      "\t\ttry {",
      "\t\t\tconst results = await Promise.all(configs.map(async (config) => {",
      "\t\t\t\ttry {",
      "\t\t\t\t\tconst result: any = await this['call'].apply(this, [config.requestable, {__localCache_priority: null, __localCache_ttl: 3000}, null, 5000, true]);",
      "\t\t\t\t\tconst rows = Array.isArray(result?.sql_output) ? result.sql_output : (Array.isArray(result?.transaction?.document?.sql_output) ? result.transaction.document.sql_output : []);",
      "\t\t\t\t\tconst status = (result && result.status) ? result.status : 'ok';",
      "\t\t\t\t\treturn { key: config.key, rows, status, error: status !== 'ok' ? (result?.error ?? ('Unable to load ' + String(config.label || config.key).toLowerCase())) : '', result };",
      "\t\t\t\t} catch (e: any) {",
      "\t\t\t\t\tconst message = (e && e.message) ? e.message : ('' + e);",
      "\t\t\t\t\tthis.c8o.log.debug('[MB] bootstrapCrudDashboardState refresh failed for ' + String((config && config.key) || 'entity'), e);",
      "\t\t\t\t\treturn { key: config.key, rows: [], status: 'error', error: message || ('Unable to load ' + String(config.label || config.key).toLowerCase()), result: { status: 'error', error: message || ('Unable to load ' + String(config.label || config.key).toLowerCase()), sql_output: [] } };",
      "\t\t\t\t}",
      "\t\t\t}));",
      "\t\t\tconst rowsByKey: any = {};",
      "\t\t\tconst countsByKey: any = {};",
      "\t\t\tconst samplesByKey: any = {};",
      "\t\t\tlet firstError = '';",
      "\t\t\tfor (const item of results) {",
      "\t\t\t\tconst rows = Array.isArray(item.rows) ? item.rows : [];",
      "\t\t\t\trowsByKey[item.key] = rows;",
      "\t\t\t\tcountsByKey[item.key] = rows.length;",
      "\t\t\t\tsamplesByKey[item.key] = rows[0] ?? null;",
      "\t\t\t\tif (!firstError && item.status !== 'ok') {",
      "\t\t\t\t\tfirstError = item.error || ('Unable to load ' + String(item.key || 'entity'));",
      "\t\t\t\t}",
      "\t\t\t}",
      "\t\t\tthis.global.crudRows = rowsByKey;",
      "\t\t\tthis.global.crudCounts = countsByKey;",
      "\t\t\tthis.global.crudSamples = samplesByKey;",
      "\t\t\tthis.global.crudError = firstError;",
      "\t\t\tthis.global.crudStatus = firstError ? 'error' : 'ok';",
      "\t\t\tthis.ref.markForCheck();",
      "\t\t\treturn { status: this.global.crudStatus, results };",
      "\t\t} finally {",
      "\t\t\tthis.global.crudLoading = false;",
      "\t\t\tthis.ref.markForCheck();",
      "\t\t}",
      "\t}",
      "/*End_c8o_PageFunction*/",
      ""
    ].join("\n");
  }

  function buildDashboardActionStacksTree(projectName, facadePrefix, entities, stage) {
    var qnames = [];
    var children = [];
    var bootstrapQName = dashboardActionQName(projectName, "crud_bootstrap_dashboard");
    var retryQName = dashboardActionQName(projectName, "crud_retry_dashboard");
    for (var i = 0; i < entities.length; i++) {
      var entity = entities[i];
      var actionName = "crud_refresh_" + entity.name;
      var actionQName = dashboardActionQName(projectName, actionName);
      var entityKeyLiteral = scriptLiteral(entity.name);
      var requestableQName = facadeSequenceQName(projectName, facadePrefix, entity, "list");
      qnames.push(actionQName);
      children.push(
        actionStackNode(
          actionName,
          [],
          [
            customAsyncActionNode(
              "Refresh" + ucfirst(entity.name),
              buildDashboardRefreshActionScript(entity, requestableQName),
              "Refresh CRUD global state for " + entity.label + "."
            )
          ],
          "CRUD dashboard refresh action for " + entity.label + "."
        )
      );
    }
    qnames.push(bootstrapQName, retryQName);
    children.push(
      actionStackNode(
        "crud_bootstrap_dashboard",
        [],
        [
          customAsyncActionNode(
            "BootstrapDashboard",
            buildDashboardBootstrapActionScript(projectName, facadePrefix, entities, stage),
            "Bootstrap CRUD dashboard global state."
          )
        ],
        "CRUD dashboard bootstrap action."
      ),
      actionStackNode(
        "crud_retry_dashboard",
        [],
        [
          dynamicInvokeNode("InvokeBootstrapDashboard", bootstrapQName, [])
        ],
        "CRUD dashboard retry action."
      )
    );
    return {
      qnames: qnames,
      tree: {
        children: children
      }
    };
  }

  function buildDashboardPageShellTree(projectName, entities, stage) {
    var children = [
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
                    useVariableNode("Title", scriptLiteral(ucfirst(projectName) + " Live Dashboard")),
                    useVariableNode("Subtitle", scriptLiteral(entities.map(function (entity) { return entity.label.toLowerCase(); }).join(" and ")))
                  ])
                ]
              }
            ]
          }
        ]
      }
    ];
    var gridChildren = children[0].children;
    if (trimmed(stage).toLowerCase() !== "final") {
      gridChildren.push({
        className: "ngx.components.UIDynamicElement#GridRow",
        name: "BootstrapRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: "BootstrapCol",
            children: [
              buildUseSharedNode(sharedComponentQName(projectName, "WorkInProgressCard"), "UseWorkInProgressCard", [])
            ]
          }
        ]
      });
    }
    gridChildren.push({
      className: "ngx.components.UIDynamicElement#GridRow",
      name: "MetricsRow",
      children: entities.map(function (entity) {
        return {
          className: "ngx.components.UIDynamicElement#GridCol",
          name: ucfirst(entity.singular) + "StatCol",
          children: [
            buildUseSharedNode(sharedComponentQName(projectName, "DashboardStatCard"), "Use" + ucfirst(entity.singular) + "StatCard", [
              useVariableNode("Title", scriptLiteral(entity.label)),
              useVariableNode("EntityKey", scriptLiteral(entity.name)),
              useVariableNode("Caption", scriptLiteral("Loaded from public facade"))
            ])
          ]
        };
      })
    });
    for (var i = 0; i < entities.length; i++) {
      var entity = entities[i];
      var previewFields = schemaPreviewFields(entity, 2, false);
      var primaryField = (previewFields[0] || entity.primaryField || {}).column || "id";
      var secondaryField = (previewFields[1] || previewFields[0] || entity.primaryField || {}).column || primaryField;
      gridChildren.push({
        className: "ngx.components.UIDynamicElement#GridRow",
        name: ucfirst(entity.singular) + "Row",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: ucfirst(entity.singular) + "TableCol",
            children: [
              buildUseSharedNode(sharedComponentQName(projectName, ucfirst(entity.singular) + "Table"), "Use" + ucfirst(entity.singular) + "Table", [
                useVariableNode("Title", scriptLiteral(entity.label)),
                useVariableNode("EntityKey", scriptLiteral(entity.name)),
                useVariableNode("PrimaryField", scriptLiteral(primaryField)),
                useVariableNode("SecondaryField", scriptLiteral(secondaryField))
              ])
            ]
          },
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: ucfirst(entity.singular) + "CardCol",
            children: [
              buildUseSharedNode(sharedComponentQName(projectName, ucfirst(entity.singular) + "Card"), "Use" + ucfirst(entity.singular) + "Card", [
                useVariableNode("Title", scriptLiteral(ucfirst(entity.singular) + " snapshot")),
                useVariableNode("EntityKey", scriptLiteral(entity.name)),
                useVariableNode("PrimaryField", scriptLiteral(primaryField)),
                useVariableNode("SecondaryField", scriptLiteral(secondaryField))
              ])
            ]
          },
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: ucfirst(entity.singular) + "FormCol",
            children: [
              buildUseSharedNode(sharedComponentQName(projectName, ucfirst(entity.singular) + "Form"), "Use" + ucfirst(entity.singular) + "Form", [
                useVariableNode("Title", scriptLiteral("Edit " + ucfirst(entity.singular))),
                useVariableNode("EntityKey", scriptLiteral(entity.name)),
                useVariableNode("PrimaryField", scriptLiteral(primaryField)),
                useVariableNode("SecondaryField", scriptLiteral(secondaryField)),
                useVariableNode("ActionLabel", scriptLiteral("Save " + entity.singular))
              ])
            ]
          }
        ]
      });
    }
    gridChildren.push(
      {
        className: "ngx.components.UIDynamicElement#GridRow",
        name: "LoadingRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: "LoadingCol",
            children: [
              ifDirectiveNode(
                "LoadingVisible",
                "this.global?.crudLoading === true",
                [buildUseSharedNode(sharedComponentQName(projectName, "CrudLoadingState"), "UseCrudLoadingState", [])]
              )
            ]
          }
        ]
      },
      {
        className: "ngx.components.UIDynamicElement#GridRow",
        name: "ErrorRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: "ErrorCol",
            children: [
              ifDirectiveNode(
                "ErrorVisible",
                "!!this.global?.crudError",
                [buildUseSharedNode(sharedComponentQName(projectName, "CrudErrorRetryState"), "UseCrudErrorRetryState", [])]
              )
            ]
          }
        ]
      }
    );
    return {
      className: "ngx.components.UIDynamicElement#Content",
      name: "Content",
      properties: {
        Padding: {
          mode: "PLAIN",
          value: "ion-padding"
        }
      },
      children: children
    };
  }

  function buildDashboardPageLoadTree(projectName, entryPage, facadePrefix, entities, stage) {
    return {
      qname: pageQName(projectName, entryPage),
      legacyQNames: [
        pageQName(projectName, entryPage) + ".PageEvent",
        pageQName(projectName, entryPage) + ".LoadCrudFacadeOnEnter"
      ],
      tree: {
        properties: {
          scriptContent: buildDashboardPageScriptContent(projectName, facadePrefix, entities, stage)
        },
        children: [
          pageEventNode(
            "PageEvent",
            "onWillLoad",
            [
              dynamicInvokeNode("InvokeBootstrapDashboard", dashboardActionQName(projectName, "crud_bootstrap_dashboard"), [])
            ],
            "Bootstrap CRUD global state on page load."
          )
        ]
      }
    };
  }

  function blankPageScriptContent() {
    return [
      "/*Begin_c8o_PageImport*/",
      "/*End_c8o_PageImport*/",
      "/*Begin_c8o_PageDeclaration*/",
      "/*End_c8o_PageDeclaration*/",
      "/*Begin_c8o_PageConstructor*/",
      "/*End_c8o_PageConstructor*/",
      "/*Begin_c8o_PageFunction*/",
      "/*End_c8o_PageFunction*/",
      ""
    ].join("\n");
  }

  function entityPagesDefaultDraft(config) {
    var draft = {};
    var fields = ensureArray(config && config.editableFields);
    for (var i = 0; i < fields.length; i++) {
      draft[fields[i].column] = "";
    }
    return draft;
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

  function entityPagesHeaderTitleTree(titleText) {
    return {
      className: "ngx.components.UIDynamicElement#Header",
      name: "Header",
      children: [
        {
          className: "ngx.components.UIDynamicElement#ToolBar",
          name: "ToolBar",
          children: [
            {
              className: "ngx.components.UIDynamicElement#BarTitle",
              name: "BarTitle",
              children: [
                plainTextNode("Text", titleText)
              ]
            }
          ]
        }
      ]
    };
  }

  function entityPagesSharedRetryStateTree(componentName, projectName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "CRUD entity-pages error state with retry action."
      },
      children: [
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "ErrorCard",
          properties: {
            IonColor: {
              mode: "PLAIN",
              value: "warning"
            }
          },
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "ErrorHeader",
              children: [
                textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  "ErrorTitle",
                  plainTextNode("ErrorTitleText", "Retry CRUD state")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "ErrorContent",
              children: [
                scriptTextNode("ErrorText", "this.global?.crudError || 'Retry if one facade call fails.'"),
                entityPagesButtonNode(
                  "RetryButton",
                  "Retry",
                  { color: "primary" },
                  [
                    controlEventNode("Event", [
                      dynamicInvokeNode("InvokeRetryDashboard", dashboardActionQName(projectName, "crud_retry_dashboard"), [])
                    ])
                  ]
                )
              ]
            }
          ]
        }
      ]
    };
  }

  function entityPagesListPanelTree(projectName, entity) {
    var componentName = pascalize(entity.name) + "ListPanel";
    var config = entityUiConfig(projectName, "crud", entity);
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Stateful CRUD list panel for " + entity.label + "."
      },
      children: [
        compVariableNode("Title", scriptLiteral(entity.label)),
        compVariableNode("EntityKey", scriptLiteral(config.key)),
        compVariableNode("PrimaryField", scriptLiteral(config.previewPrimaryColumn)),
        compVariableNode("SecondaryField", scriptLiteral(config.previewSecondaryColumn)),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: componentName + "Card",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: componentName + "Header",
              children: [
                textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  componentName + "Title",
                  scriptTextNode("TitleText", "this.Title || " + scriptLiteral(entity.label))
                ),
                textElementNode(
                  "ngx.components.UIDynamicElement#CardSubTitle",
                  componentName + "Subtitle",
                  scriptTextNode("SubtitleText", "'Loaded ' + (" + dashboardCountExpression("this.EntityKey") + ") + ' rows'")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: componentName + "Content",
              children: [
                entityPagesButtonNode(
                  "NewButton",
                  "New " + entity.singular,
                  { fill: "outline" },
                  [
                    controlEventNode("Event", [
                      dynamicInvokeNode("InvokeNew", dashboardActionQName(projectName, "crud_new_" + entity.singular), [])
                    ])
                  ]
                ),
                ifDirectiveNode(
                  componentName + "Empty",
                  dashboardCountExpression("this.EntityKey") + " === 0",
                  [
                    textElementNode(
                      "ngx.components.UIDynamicElement#Paragraph",
                      componentName + "EmptyParagraph",
                      plainTextNode("EmptyText", "No rows available yet.")
                    )
                  ]
                ),
                {
                  className: "ngx.components.UIDynamicElement#List",
                  name: componentName + "List",
                  children: [
                    iterationDirectiveNode(
                      componentName + "Loop",
                      projectName,
                      "row",
                      dashboardRowsExpression("this.EntityKey"),
                      [
                        {
                          className: "ngx.components.UIDynamicElement#ListItem",
                          name: componentName + "Item",
                          properties: {
                            Button: {
                              mode: "PLAIN",
                              value: "true"
                            },
                            Detail: {
                              mode: "PLAIN",
                              value: "false"
                            }
                          },
                          children: [
                            {
                              className: "ngx.components.UIDynamicElement#Label",
                              name: componentName + "Label",
                              children: [
                                textElementNode(
                                  "ngx.components.UIDynamicElement#Heading2",
                                  componentName + "Heading",
                                  smartTextNode("HeadingText", iterationSourceValue(projectName, dynamicFieldAccessExpression("row", "this.PrimaryField", scriptLiteral("No primary value"))))
                                ),
                                textElementNode(
                                  "ngx.components.UIDynamicElement#Paragraph",
                                  componentName + "Paragraph",
                                  smartTextNode("ParagraphText", iterationSourceValue(projectName, dynamicFieldAccessExpression("row", "this.SecondaryField", scriptLiteral("No secondary value"))))
                                )
                              ]
                            },
                            controlEventNode("Event", [
                              dynamicInvokeNode("InvokeSelect", dashboardActionQName(projectName, "crud_select_" + entity.singular), [
                                controlVariableNode("row_id", iterationSourceValue(projectName, "row?.ID ?? row?.id"))
                              ])
                            ])
                          ]
                        }
                      ],
                      "idx"
                    )
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
  }

  function entityPagesDetailCardTree(entity) {
    var componentName = pascalize(entity.name) + "DetailCard";
    var primaryField = (firstNonPrimaryField(entity) || entity.primaryField || {}).column || "id";
    var secondaryField = (secondPreviewField(entity) || firstNonPrimaryField(entity) || entity.primaryField || {}).column || primaryField;
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Stateful CRUD detail card for " + entity.label + "."
      },
      children: [
        compVariableNode("Title", scriptLiteral(ucfirst(entity.singular) + " detail")),
        compVariableNode("EntityKey", scriptLiteral(entity.name)),
        compVariableNode("PrimaryField", scriptLiteral(primaryField)),
        compVariableNode("SecondaryField", scriptLiteral(secondaryField)),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: componentName + "Root",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: componentName + "Header",
              children: [
                textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  componentName + "TitleSlot",
                  scriptTextNode("TitleText", "this.Title || " + scriptLiteral(ucfirst(entity.singular) + " detail"))
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: componentName + "Content",
              children: [
                scriptTextNode("PrimaryText", dynamicFieldAccessExpression(crudSelectedExpression("this.EntityKey"), "this.PrimaryField", scriptLiteral("No record selected"))),
                scriptTextNode("SecondaryText", dynamicFieldAccessExpression(crudSelectedExpression("this.EntityKey"), "this.SecondaryField", scriptLiteral("No secondary value"))),
                scriptTextNode("StatusText", "'Mode: ' + (" + crudModeExpression("this.EntityKey") + ") + ' | Status: ' + (" + crudEntityStatusExpression("this.EntityKey") + ")"),
                ifDirectiveNode(
                  componentName + "ErrorVisible",
                  "!!" + crudEntityErrorExpression("this.EntityKey"),
                  [
                    textElementNode(
                      "ngx.components.UIDynamicElement#Paragraph",
                      componentName + "ErrorText",
                      scriptTextNode("ErrorTextValue", crudEntityErrorExpression("this.EntityKey"))
                    )
                  ]
                )
              ]
            }
          ]
        }
      ]
    };
  }

  function buildDraftFieldUpdateScript(entityKey, fieldColumn) {
    return [
      "page.global = page.global || {};",
      "var drafts = Object.assign({}, page.global.crudDrafts || {});",
      "var draft = Object.assign({}, drafts[" + scriptLiteral(entityKey) + "] || {});",
      "var value = event && event.detail && event.detail.value != null ? event.detail.value : ((event && event.target && event.target.value != null) ? event.target.value : '');",
      "draft[" + scriptLiteral(fieldColumn) + "] = value == null ? '' : value;",
      "drafts[" + scriptLiteral(entityKey) + "] = draft;",
      "page.global.crudDrafts = drafts;",
      "page.ref.markForCheck();",
      "return draft;"
    ].join("\n");
  }

  function buildRelationSelectNode(projectName, entityKey, field, entities) {
    var relatedEntity = findEntityByName(entities, field.references && field.references.entity);
    var relatedPreview = relatedEntity ? (firstNonPrimaryField(relatedEntity) || relatedEntity.primaryField || {}) : {};
    var relatedLabelField = relatedPreview.column || "id";
    var relatedKey = relatedEntity ? relatedEntity.name : pluralize(normalizedIdentifier(field.references.entity));
    return {
      className: "ngx.components.UIDynamicElement#Select",
      name: pascalize(field.column) + "Select",
      properties: {
        Label: {
          mode: "PLAIN",
          value: field.label
        },
        LabelPlacement: {
          mode: "PLAIN",
          value: "stacked"
        },
        Placeholder: {
          mode: "PLAIN",
          value: "Select " + field.label
        },
        Interface: {
          mode: "PLAIN",
          value: "popover"
        },
        Value: {
          mode: "SCRIPT",
          value: dynamicFieldAccessExpression(crudDraftExpression(scriptLiteral(entityKey)), scriptLiteral(field.column), "''")
        }
      },
      children: [
        iterationDirectiveNode(
          pascalize(field.column) + "OptionLoop",
          projectName,
          "option",
          "((this.global?.crudRows || {})[" + scriptLiteral(relatedKey) + "] || [])",
          [
            {
              className: "ngx.components.UIDynamicElement#SelectOption",
              name: pascalize(field.column) + "Option",
              properties: {
                Value: {
                  mode: "SCRIPT",
                  value: "String(option?.ID ?? option?.id ?? '')"
                }
              },
              children: [
                smartTextNode("OptionText", iterationSourceValue(projectName, dynamicFieldAccessExpression("option", scriptLiteral(relatedLabelField), scriptLiteral("Option"))))
              ]
            }
          ],
          "idx"
        ),
        controlEventNode("ChangeEvent", [
          customAsyncActionNode(
            "Store" + pascalize(field.column),
            buildDraftFieldUpdateScript(entityKey, field.column),
            "Store selected relation value into CRUD draft state."
          )
        ], {
          attrName: "(ionChange)",
          eventName: "ionChange"
        })
      ]
    };
  }

  function buildTextInputNode(entityKey, field) {
    return {
      className: "ngx.components.UIDynamicElement#Input",
      name: pascalize(field.column) + "Input",
      properties: {
        Label: {
          mode: "PLAIN",
          value: field.label
        },
        LabelPlacement: {
          mode: "PLAIN",
          value: "stacked"
        },
        Placeholder: {
          mode: "PLAIN",
          value: field.label
        },
        Value: {
          mode: "SCRIPT",
          value: dynamicFieldAccessExpression(crudDraftExpression(scriptLiteral(entityKey)), scriptLiteral(field.column), "''")
        },
        Required: {
          mode: "PLAIN",
          value: field.required ? "true" : "false"
        }
      },
      children: [
        controlEventNode("InputEvent", [
          customAsyncActionNode(
            "Store" + pascalize(field.column),
            buildDraftFieldUpdateScript(entityKey, field.column),
            "Store input value into CRUD draft state."
          )
        ], {
          attrName: "(ionInput)",
          eventName: "ionInput"
        })
      ]
    };
  }

  function entityPagesFormFieldNode(projectName, entity, field, entities) {
    return {
      className: "ngx.components.UIDynamicElement#FormItem",
      name: pascalize(field.column) + "Item",
      children: [
        field.references ? buildRelationSelectNode(projectName, entity.name, field, entities) : buildTextInputNode(entity.name, field)
      ]
    };
  }

  function entityPagesEditFormTree(projectName, entity, entities) {
    var componentName = pascalize(entity.name) + "EditForm";
    var nonPrimaryFields = ensureArray(entity.fields).filter(function (field) {
      return field && field.primary !== true;
    });
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Stateful CRUD edit form for " + entity.label + "."
      },
      children: [
        compVariableNode("EntityKey", scriptLiteral(entity.name)),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: componentName + "Root",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: componentName + "Header",
              children: [
                textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  componentName + "Title",
                  scriptTextNode("TitleText", "(" + crudModeExpression("this.EntityKey") + " === 'create' ? " + scriptLiteral("Create " + entity.singular) + " : " + scriptLiteral("Edit " + entity.singular) + ")")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: componentName + "Content",
              children: nonPrimaryFields.map(function (field) {
                return entityPagesFormFieldNode(projectName, entity, field, entities);
              }).concat([
                scriptTextNode("FormStatus", "'Entity status: ' + (" + crudEntityStatusExpression("this.EntityKey") + ")"),
                ifDirectiveNode(
                  componentName + "ErrorVisible",
                  "!!" + crudEntityErrorExpression("this.EntityKey"),
                  [
                    textElementNode(
                      "ngx.components.UIDynamicElement#Paragraph",
                      componentName + "ErrorMessage",
                      scriptTextNode("ErrorText", crudEntityErrorExpression("this.EntityKey"))
                    )
                  ]
                ),
                entityPagesButtonNode(
                  "SaveButton",
                  "Save " + entity.singular,
                  { color: "primary" },
                  [
                    controlEventNode("Event", [
                      dynamicInvokeNode("InvokeSave", dashboardActionQName(projectName, "crud_save_" + entity.singular), [])
                    ])
                  ]
                ),
                entityPagesButtonNode(
                  "CancelButton",
                  "Cancel",
                  { fill: "outline" },
                  [
                    controlEventNode("Event", [
                      dynamicInvokeNode("InvokeCancel", dashboardActionQName(projectName, "crud_cancel_" + entity.singular), [])
                    ])
                  ]
                ),
                ifDirectiveNode(
                  componentName + "DeleteVisible",
                  "!!" + crudSelectedExpression("this.EntityKey"),
                  [
                    entityPagesButtonNode(
                      "DeleteButton",
                      "Delete " + entity.singular,
                      { color: "danger", fill: "outline" },
                      [
                        controlEventNode("Event", [
                          dynamicInvokeNode("InvokeDelete", dashboardActionQName(projectName, "crud_delete_" + entity.singular), [])
                        ])
                      ]
                    )
                  ]
                )
              ])
            }
          ]
        }
      ]
    };
  }

  function buildEntityPagesSharedComponentsTree(projectName, entities, stage) {
    var components = [
      dashboardHeaderComponentTree("CrudPageHeader", projectName, entities),
      dashboardStatCardGlobalTree("DashboardStatCard"),
      dashboardLoadingStateTree("CrudLoadingState"),
      entityPagesSharedRetryStateTree("CrudErrorRetryState", projectName)
    ];
    if (trimmed(stage).toLowerCase() !== "final") {
      components.push(dashboardWorkInProgressCardTree("WorkInProgressCard"));
    }
    for (var i = 0; i < entities.length; i++) {
      components.push(entityPagesListPanelTree(projectName, entities[i]));
      components.push(entityPagesDetailCardTree(entities[i]));
      components.push(entityPagesEditFormTree(projectName, entities[i], entities));
    }
    return {
      qnames: components.map(function (component) { return sharedComponentQName(projectName, component.name); }),
      tree: {
        children: components
      }
    };
  }

  function buildEntityPagesBootstrapActionScript(projectName, facadePrefix, entities, stage) {
    var configs = entities.map(function (entity) {
      var config = entityUiConfig(projectName, facadePrefix, entity);
      config.defaultDraft = entityPagesDefaultDraft(config);
      return config;
    });
    return [
      "page.global = page.global || {};",
      "var configs = " + JSON.stringify(configs) + ";",
      "var cloneRecord = function(item) { try { return JSON.parse(JSON.stringify(item || {})); } catch (e) { return item || {}; } };",
      "var extractRows = function(result) { return Array.isArray(result?.sql_output) ? result.sql_output : (Array.isArray(result?.transaction?.document?.sql_output) ? result.transaction.document.sql_output : []); };",
      "var statusOf = function(result) { return (result && result.status) ? result.status : 'ok'; };",
      "page.global.crudBuildStage = " + scriptLiteral(trimmed(stage || "bootstrap")) + ";",
      "page.global.crudLoading = true;",
      "page.global.crudError = '';",
      "page.global.crudStatus = 'loading';",
      "page.global.crudRows = {};",
      "page.global.crudCounts = {};",
      "page.global.crudSamples = {};",
      "page.global.crudSelected = {};",
      "page.global.crudDrafts = {};",
      "page.global.crudModes = {};",
      "page.global.crudEntityStatus = {};",
      "page.global.crudEntityErrors = {};",
      "page.ref.markForCheck();",
      "try {",
      "  var results = await Promise.all(configs.map(async function(config) {",
      "    try {",
      "      var result = " + actionCallFromExpressionSnippet("config.listRequestable", "{}", 3000, 5000, true) + ";",
      "      return { config: config, rows: extractRows(result), status: statusOf(result), error: statusOf(result) === 'ok' ? '' : (result?.error || ('Unable to load ' + String(config.label || config.key).toLowerCase())) };",
      "    } catch (e) {",
      "      var message = (e && e.message) ? e.message : ('' + e);",
      "      page.c8o.log.debug('[MB] crud_bootstrap_dashboard failed for ' + String((config && config.key) || 'entity'), e);",
      "      return { config: config, rows: [], status: 'error', error: message || ('Unable to load ' + String(config.label || config.key).toLowerCase()) };",
      "    }",
      "  }));",
      "  var rowsByKey = {};",
      "  var countsByKey = {};",
      "  var samplesByKey = {};",
      "  var selectedByKey = {};",
      "  var draftsByKey = {};",
      "  var modesByKey = {};",
      "  var statusByKey = {};",
      "  var errorsByKey = {};",
      "  var firstError = '';",
      "  for (var i = 0; i < results.length; i++) {",
      "    var item = results[i];",
      "    var key = item.config.key;",
      "    var rows = Array.isArray(item.rows) ? item.rows : [];",
      "    var selected = rows[0] || null;",
      "    rowsByKey[key] = rows;",
      "    countsByKey[key] = rows.length;",
      "    samplesByKey[key] = rows[0] || null;",
      "    selectedByKey[key] = selected;",
      "    draftsByKey[key] = cloneRecord(selected || item.config.defaultDraft || {});",
      "    modesByKey[key] = selected ? 'update' : 'create';",
      "    statusByKey[key] = item.status === 'ok' ? (rows.length ? 'ready' : 'empty') : 'error';",
      "    errorsByKey[key] = item.status === 'ok' ? '' : (item.error || ('Unable to load ' + String(item.config.label || key).toLowerCase()));",
      "    if (!firstError && errorsByKey[key]) {",
      "      firstError = errorsByKey[key];",
      "    }",
      "  }",
      "  page.global.crudRows = rowsByKey;",
      "  page.global.crudCounts = countsByKey;",
      "  page.global.crudSamples = samplesByKey;",
      "  page.global.crudSelected = selectedByKey;",
      "  page.global.crudDrafts = draftsByKey;",
      "  page.global.crudModes = modesByKey;",
      "  page.global.crudEntityStatus = statusByKey;",
      "  page.global.crudEntityErrors = errorsByKey;",
      "  page.global.crudError = firstError;",
      "  page.global.crudStatus = firstError ? 'error' : 'ok';",
      "  page.ref.markForCheck();",
      "  return { status: page.global.crudStatus, results: results };",
      "} finally {",
      "  page.global.crudLoading = false;",
      "  page.ref.markForCheck();",
      "}"
    ].join("\n");
  }

  function buildEntityPagesRefreshActionScript(config) {
    var cfg = clone(config);
    cfg.defaultDraft = entityPagesDefaultDraft(config);
    return [
      "page.global = page.global || {};",
      "var config = " + JSON.stringify(cfg) + ";",
      "var cloneRecord = function(item) { try { return JSON.parse(JSON.stringify(item || {})); } catch (e) { return item || {}; } };",
      "var extractRows = function(result) { return Array.isArray(result?.sql_output) ? result.sql_output : (Array.isArray(result?.transaction?.document?.sql_output) ? result.transaction.document.sql_output : []); };",
      "var normalizeId = function(item) { return item ? String(item?.ID ?? item?.id ?? '') : ''; };",
      "var hasAnyErrors = function() { var errors = page.global?.crudEntityErrors || {}; for (var key in errors) { if (errors[key]) { return true; } } return false; };",
      "var key = config.key;",
      "var previousSelected = ((page.global?.crudSelected || {})[key]) || null;",
      "var previousDraft = cloneRecord(((page.global?.crudDrafts || {})[key]) || {});",
      "var previousMode = ((page.global?.crudModes || {})[key]) || 'update';",
      "var previousSelectedId = normalizeId(previousSelected);",
      "page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [key]: 'loading' });",
      "page.global.crudEntityErrors = Object.assign({}, page.global.crudEntityErrors || {}, { [key]: '' });",
      "page.ref.markForCheck();",
      "try {",
      "  var result = " + actionCallSnippet(cfg.listRequestable, "{}", 3000, 5000, true) + ";",
      "  var rows = extractRows(result);",
      "  var selected = rows.find(function(row) { return normalizeId(row) === previousSelectedId; }) || rows[0] || null;",
      "  var mode = previousMode === 'create' && !previousSelectedId ? 'create' : (selected ? 'update' : 'create');",
      "  var draft = mode === 'create' ? Object.assign({}, config.defaultDraft || {}, previousDraft || {}) : cloneRecord(selected || config.defaultDraft || {});",
      "  page.global.crudRows = Object.assign({}, page.global.crudRows || {}, { [key]: rows });",
      "  page.global.crudCounts = Object.assign({}, page.global.crudCounts || {}, { [key]: rows.length });",
      "  page.global.crudSamples = Object.assign({}, page.global.crudSamples || {}, { [key]: rows[0] || null });",
      "  page.global.crudSelected = Object.assign({}, page.global.crudSelected || {}, { [key]: selected });",
      "  page.global.crudDrafts = Object.assign({}, page.global.crudDrafts || {}, { [key]: draft });",
      "  page.global.crudModes = Object.assign({}, page.global.crudModes || {}, { [key]: mode });",
      "  page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [key]: rows.length ? 'ready' : 'empty' });",
      "  page.global.crudEntityErrors = Object.assign({}, page.global.crudEntityErrors || {}, { [key]: '' });",
      "  page.global.crudError = hasAnyErrors() ? (page.global.crudError || '') : '';",
      "  page.global.crudStatus = hasAnyErrors() ? 'error' : 'ok';",
      "  page.ref.markForCheck();",
      "  return result;",
      "} catch (e) {",
      "  var message = (e && e.message) ? e.message : ('' + e);",
      "  page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [key]: 'error' });",
      "  page.global.crudEntityErrors = Object.assign({}, page.global.crudEntityErrors || {}, { [key]: message || ('Unable to load ' + String(config.label || key).toLowerCase()) });",
      "  page.global.crudError = page.global.crudEntityErrors[key];",
      "  page.global.crudStatus = 'error';",
      "  page.c8o.log.debug('[MB] crud_refresh_' + key + ' failed', e);",
      "  page.ref.markForCheck();",
      "  return { status: 'error', error: page.global.crudError, sql_output: [] };",
      "}"
    ].join("\n");
  }

  function buildEntityPagesOpenPageScript(config) {
    return [
      "var route = " + scriptLiteral(config.routePath) + ";",
      "try {",
      "  if (page && page['angularRouter'] && typeof page['angularRouter'].navigateByUrl === 'function') {",
      "    return await page['angularRouter'].navigateByUrl(route);",
      "  }",
      "  if (page && page.router && page.router['angularRouter'] && typeof page.router['angularRouter'].navigateByUrl === 'function') {",
      "    return await page.router['angularRouter'].navigateByUrl(route);",
      "  }",
      "  if (page && typeof page['navigateByUrl'] === 'function') {",
      "    return await page['navigateByUrl'](route);",
      "  }",
      "  if (typeof window !== 'undefined' && window.location) {",
      "    window.location.assign(route);",
      "  }",
      "} finally {",
      "  return;",
      "}"
    ].join("\n");
  }

  function buildEntityPagesBootstrapPageScript(config) {
    var cfg = clone(config);
    cfg.defaultDraft = entityPagesDefaultDraft(config);
    return [
      "page.global = page.global || {};",
      "var config = " + JSON.stringify(cfg) + ";",
      "var cloneRecord = function(item) { try { return JSON.parse(JSON.stringify(item || {})); } catch (e) { return item || {}; } };",
      "var normalizeId = function(item) { return item ? String(item?.ID ?? item?.id ?? '') : ''; };",
      "var key = config.key;",
      "var rows = ((page.global?.crudRows || {})[key]) || [];",
      "var previousSelected = ((page.global?.crudSelected || {})[key]) || null;",
      "var previousSelectedId = normalizeId(previousSelected);",
      "var selected = rows.find(function(row) { return normalizeId(row) === previousSelectedId; }) || rows[0] || null;",
      "var mode = ((page.global?.crudModes || {})[key]) || (selected ? 'update' : 'create');",
      "var existingDraft = cloneRecord(((page.global?.crudDrafts || {})[key]) || {});",
      "var draft = mode === 'create' ? Object.assign({}, config.defaultDraft || {}, existingDraft || {}) : cloneRecord(selected || config.defaultDraft || {});",
      "page.global.crudSelected = Object.assign({}, page.global.crudSelected || {}, { [key]: selected });",
      "page.global.crudDrafts = Object.assign({}, page.global.crudDrafts || {}, { [key]: draft });",
      "page.global.crudModes = Object.assign({}, page.global.crudModes || {}, { [key]: mode });",
      "page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [key]: rows.length ? 'ready' : 'empty' });",
      "page.global.crudEntityErrors = Object.assign({}, page.global.crudEntityErrors || {}, { [key]: ((page.global?.crudEntityErrors || {})[key]) || '' });",
      "page.ref.markForCheck();",
      "return { status: 'ok', rows: rows.length, mode: mode };"
    ].join("\n");
  }

  function buildEntityPagesSelectActionScript(config) {
    var cfg = clone(config);
    cfg.defaultDraft = entityPagesDefaultDraft(config);
    return [
      "page.global = page.global || {};",
      "var config = " + JSON.stringify(cfg) + ";",
      "var cloneRecord = function(item) { try { return JSON.parse(JSON.stringify(item || {})); } catch (e) { return item || {}; } };",
      "var key = config.key;",
      "var rows = ((page.global?.crudRows || {})[key]) || [];",
      "var rowId = String(vars.row_id ?? '');",
      "var selected = rows.find(function(row) { return String(row?.ID ?? row?.id ?? '') === rowId; }) || null;",
      "page.global.crudSelected = Object.assign({}, page.global.crudSelected || {}, { [key]: selected });",
      "page.global.crudDrafts = Object.assign({}, page.global.crudDrafts || {}, { [key]: cloneRecord(selected || config.defaultDraft || {}) });",
      "page.global.crudModes = Object.assign({}, page.global.crudModes || {}, { [key]: selected ? 'update' : 'create' });",
      "page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [key]: 'ready' });",
      "page.global.crudEntityErrors = Object.assign({}, page.global.crudEntityErrors || {}, { [key]: '' });",
      "page.ref.markForCheck();",
      "return selected;"
    ].join("\n");
  }

  function buildEntityPagesNewActionScript(config) {
    var cfg = clone(config);
    cfg.defaultDraft = entityPagesDefaultDraft(config);
    return [
      "page.global = page.global || {};",
      "var config = " + JSON.stringify(cfg) + ";",
      "page.global.crudSelected = Object.assign({}, page.global.crudSelected || {}, { [config.key]: null });",
      "page.global.crudDrafts = Object.assign({}, page.global.crudDrafts || {}, { [config.key]: JSON.parse(JSON.stringify(config.defaultDraft || {})) });",
      "page.global.crudModes = Object.assign({}, page.global.crudModes || {}, { [config.key]: 'create' });",
      "page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [config.key]: 'editing' });",
      "page.global.crudEntityErrors = Object.assign({}, page.global.crudEntityErrors || {}, { [config.key]: '' });",
      "page.ref.markForCheck();",
      "return page.global.crudDrafts[config.key];"
    ].join("\n");
  }

  function buildEntityPagesCancelActionScript(config) {
    var cfg = clone(config);
    cfg.defaultDraft = entityPagesDefaultDraft(config);
    return [
      "page.global = page.global || {};",
      "var config = " + JSON.stringify(cfg) + ";",
      "var cloneRecord = function(item) { try { return JSON.parse(JSON.stringify(item || {})); } catch (e) { return item || {}; } };",
      "var selected = ((page.global?.crudSelected || {})[config.key]) || null;",
      "var draft = cloneRecord(selected || config.defaultDraft || {});",
      "page.global.crudDrafts = Object.assign({}, page.global.crudDrafts || {}, { [config.key]: draft });",
      "page.global.crudModes = Object.assign({}, page.global.crudModes || {}, { [config.key]: selected ? 'update' : 'create' });",
      "page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [config.key]: selected ? 'ready' : 'editing' });",
      "page.global.crudEntityErrors = Object.assign({}, page.global.crudEntityErrors || {}, { [config.key]: '' });",
      "page.ref.markForCheck();",
      "return draft;"
    ].join("\n");
  }

  function buildEntityPagesSaveActionScript(config) {
    var cfg = clone(config);
    cfg.defaultDraft = entityPagesDefaultDraft(config);
    return [
      "page.global = page.global || {};",
      "var config = " + JSON.stringify(cfg) + ";",
      "var cloneRecord = function(item) { try { return JSON.parse(JSON.stringify(item || {})); } catch (e) { return item || {}; } };",
      "var normalizeId = function(item) { return item ? String(item?.ID ?? item?.id ?? '') : ''; };",
      "var extractRows = function(result) { return Array.isArray(result?.sql_output) ? result.sql_output : (Array.isArray(result?.transaction?.document?.sql_output) ? result.transaction.document.sql_output : []); };",
      "var key = config.key;",
      "var draft = cloneRecord(((page.global?.crudDrafts || {})[key]) || {});",
      "var selected = ((page.global?.crudSelected || {})[key]) || null;",
      "var mode = ((page.global?.crudModes || {})[key]) || (selected ? 'update' : 'create');",
      "var entityErrors = Object.assign({}, page.global.crudEntityErrors || {});",
      "var entityStatus = Object.assign({}, page.global.crudEntityStatus || {});",
      "var variables = {};",
      "for (var i = 0; i < config.editableFields.length; i++) {",
      "  var field = config.editableFields[i];",
      "  variables[field.column] = draft[field.column] == null ? '' : String(draft[field.column]);",
      "}",
      "if (mode !== 'create') {",
      "  variables[config.primaryColumn] = normalizeId(selected || draft || {});",
      "}",
      "entityStatus[key] = 'saving';",
      "entityErrors[key] = '';",
      "page.global.crudEntityStatus = entityStatus;",
      "page.global.crudEntityErrors = entityErrors;",
      "page.ref.markForCheck();",
      "try {",
      "  var requestable = mode === 'create' ? config.createRequestable : config.updateRequestable;",
      "  await page['call'].apply(page, [requestable, Object.assign({__localCache_priority: null, __localCache_ttl: 0}, variables), null, 10000, true]);",
      "  var listResult = " + actionCallSnippet(cfg.listRequestable, "{}", 0, 10000, true) + ";",
      "  var rows = extractRows(listResult);",
      "  var selectedId = normalizeId(selected || draft || {});",
      "  var nextSelected = null;",
      "  if (mode === 'create') {",
      "    if (Array.isArray(config.uniqueFields) && config.uniqueFields.length) {",
      "      nextSelected = rows.find(function(row) {",
      "        for (var index = 0; index < config.uniqueFields.length; index++) {",
      "          var column = config.uniqueFields[index];",
      "          var expected = draft[column] == null ? '' : String(draft[column]);",
      "          var actual = row ? String(row[column.toUpperCase()] ?? row[column] ?? '') : '';",
      "          if (actual !== expected) {",
      "            return false;",
      "          }",
      "        }",
      "        return true;",
      "      }) || null;",
      "    }",
      "    nextSelected = nextSelected || (rows.length ? rows[rows.length - 1] : null);",
      "  } else {",
      "    nextSelected = rows.find(function(row) { return normalizeId(row) === selectedId; }) || null;",
      "  }",
      "  page.global.crudRows = Object.assign({}, page.global.crudRows || {}, { [key]: rows });",
      "  page.global.crudCounts = Object.assign({}, page.global.crudCounts || {}, { [key]: rows.length });",
      "  page.global.crudSamples = Object.assign({}, page.global.crudSamples || {}, { [key]: rows[0] || null });",
      "  page.global.crudSelected = Object.assign({}, page.global.crudSelected || {}, { [key]: nextSelected });",
      "  page.global.crudDrafts = Object.assign({}, page.global.crudDrafts || {}, { [key]: cloneRecord(nextSelected || config.defaultDraft || {}) });",
      "  page.global.crudModes = Object.assign({}, page.global.crudModes || {}, { [key]: nextSelected ? 'update' : 'create' });",
      "  page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [key]: 'saved' });",
      "  page.global.crudEntityErrors = Object.assign({}, page.global.crudEntityErrors || {}, { [key]: '' });",
      "  page.global.crudError = '';",
      "  page.global.crudStatus = 'ok';",
      "  page.ref.markForCheck();",
      "  return { status: 'ok', mode: mode };",
      "} catch (e) {",
      "  var message = (e && e.message) ? e.message : ('' + e);",
      "  page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [key]: 'error' });",
      "  page.global.crudEntityErrors = Object.assign({}, page.global.crudEntityErrors || {}, { [key]: message || ('Unable to save ' + String(config.label || key).toLowerCase()) });",
      "  page.global.crudError = page.global.crudEntityErrors[key];",
      "  page.global.crudStatus = 'error';",
      "  page.c8o.log.debug('[MB] crud_save_' + key + ' failed', e);",
      "  page.ref.markForCheck();",
      "  return { status: 'error', error: page.global.crudError };",
      "}"
    ].join("\n");
  }

  function buildEntityPagesDeleteActionScript(config) {
    var cfg = clone(config);
    cfg.defaultDraft = entityPagesDefaultDraft(config);
    return [
      "page.global = page.global || {};",
      "var config = " + JSON.stringify(cfg) + ";",
      "var normalizeId = function(item) { return item ? String(item?.ID ?? item?.id ?? '') : ''; };",
      "var extractRows = function(result) { return Array.isArray(result?.sql_output) ? result.sql_output : (Array.isArray(result?.transaction?.document?.sql_output) ? result.transaction.document.sql_output : []); };",
      "var cloneRecord = function(item) { try { return JSON.parse(JSON.stringify(item || {})); } catch (e) { return item || {}; } };",
      "var key = config.key;",
      "var selected = ((page.global?.crudSelected || {})[key]) || null;",
      "var selectedId = normalizeId(selected);",
      "if (!selectedId) {",
      "  page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [key]: 'ready' });",
      "  page.ref.markForCheck();",
      "  return { status: 'skipped', message: 'No selected row.' };",
      "}",
      "if (typeof window !== 'undefined' && typeof window.confirm === 'function') {",
      "  var confirmed = window.confirm('Delete ' + String(config.singular || 'record') + ' #' + selectedId + '?');",
      "  if (!confirmed) {",
      "    page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [key]: 'cancelled' });",
      "    page.ref.markForCheck();",
      "    return { status: 'cancelled' };",
      "  }",
      "}",
      "page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [key]: 'deleting' });",
      "page.global.crudEntityErrors = Object.assign({}, page.global.crudEntityErrors || {}, { [key]: '' });",
      "page.ref.markForCheck();",
      "try {",
      "  await page['call'].apply(page, [config.deleteRequestable, Object.assign({__localCache_priority: null, __localCache_ttl: 0}, { [config.primaryColumn]: selectedId }), null, 10000, true]);",
      "  var listResult = " + actionCallSnippet(cfg.listRequestable, "{}", 0, 10000, true) + ";",
      "  var rows = extractRows(listResult);",
      "  var nextSelected = rows[0] || null;",
      "  page.global.crudRows = Object.assign({}, page.global.crudRows || {}, { [key]: rows });",
      "  page.global.crudCounts = Object.assign({}, page.global.crudCounts || {}, { [key]: rows.length });",
      "  page.global.crudSamples = Object.assign({}, page.global.crudSamples || {}, { [key]: rows[0] || null });",
      "  page.global.crudSelected = Object.assign({}, page.global.crudSelected || {}, { [key]: nextSelected });",
      "  page.global.crudDrafts = Object.assign({}, page.global.crudDrafts || {}, { [key]: cloneRecord(nextSelected || config.defaultDraft || {}) });",
      "  page.global.crudModes = Object.assign({}, page.global.crudModes || {}, { [key]: nextSelected ? 'update' : 'create' });",
      "  page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [key]: 'deleted' });",
      "  page.global.crudEntityErrors = Object.assign({}, page.global.crudEntityErrors || {}, { [key]: '' });",
      "  page.global.crudError = '';",
      "  page.global.crudStatus = 'ok';",
      "  page.ref.markForCheck();",
      "  return { status: 'ok' };",
      "} catch (e) {",
      "  var message = (e && e.message) ? e.message : ('' + e);",
      "  page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [key]: 'error' });",
      "  page.global.crudEntityErrors = Object.assign({}, page.global.crudEntityErrors || {}, { [key]: message || ('Unable to delete ' + String(config.label || key).toLowerCase()) });",
      "  page.global.crudError = page.global.crudEntityErrors[key];",
      "  page.global.crudStatus = 'error';",
      "  page.c8o.log.debug('[MB] crud_delete_' + key + ' failed', e);",
      "  page.ref.markForCheck();",
      "  return { status: 'error', error: page.global.crudError };",
      "}"
    ].join("\n");
  }

  function buildEntityPagesActionStacksTree(projectName, facadePrefix, entities, stage) {
    var qnames = [];
    var children = [];
    var configs = entities.map(function (entity) {
      return entityUiConfig(projectName, facadePrefix, entity);
    });
    var bootstrapQName = dashboardActionQName(projectName, "crud_bootstrap_dashboard");
    qnames.push(bootstrapQName, dashboardActionQName(projectName, "crud_retry_dashboard"));
    children.push(
      actionStackNode(
        "crud_bootstrap_dashboard",
        [],
        [
          customAsyncActionNode(
            "BootstrapDashboard",
            buildEntityPagesBootstrapActionScript(projectName, facadePrefix, entities, stage),
            "Bootstrap landing and entity-page CRUD state."
          )
        ],
        "CRUD entity-pages bootstrap action."
      ),
      actionStackNode(
        "crud_retry_dashboard",
        [],
        [
          dynamicInvokeNode("InvokeBootstrapDashboard", bootstrapQName, [])
        ],
        "CRUD entity-pages retry action."
      )
    );
    for (var i = 0; i < configs.length; i++) {
      var config = configs[i];
      var refreshName = "crud_refresh_" + config.key;
      var bootstrapPageName = "crud_bootstrap_" + config.key + "_page";
      var selectName = "crud_select_" + config.singular;
      var newName = "crud_new_" + config.singular;
      var saveName = "crud_save_" + config.singular;
      var deleteName = "crud_delete_" + config.singular;
      var cancelName = "crud_cancel_" + config.singular;
      var openName = "crud_open_" + config.key + "_page";
      qnames.push(
        dashboardActionQName(projectName, refreshName),
        dashboardActionQName(projectName, bootstrapPageName),
        dashboardActionQName(projectName, selectName),
        dashboardActionQName(projectName, newName),
        dashboardActionQName(projectName, saveName),
        dashboardActionQName(projectName, deleteName),
        dashboardActionQName(projectName, cancelName),
        dashboardActionQName(projectName, openName)
      );
      children.push(
        actionStackNode(
          refreshName,
          [],
          [
            customAsyncActionNode(
              "Refresh" + pascalize(config.key),
              buildEntityPagesRefreshActionScript(config),
              "Refresh CRUD state for " + config.label + "."
            )
          ],
          "CRUD refresh action for " + config.label + "."
        ),
        actionStackNode(
          bootstrapPageName,
          [],
          [
            customAsyncActionNode(
              "Bootstrap" + pascalize(config.key) + "Page",
              buildEntityPagesBootstrapPageScript(config),
              "Prepare selection and draft state for the " + config.label + " page."
            )
          ],
          "CRUD entity page bootstrap for " + config.label + "."
        ),
        actionStackNode(
          selectName,
          [stackVariableNode("row_id", "''")],
          [
            customAsyncActionNode(
              "Select" + pascalize(config.singular),
              buildEntityPagesSelectActionScript(config),
              "Select one " + config.singular + " row."
            )
          ],
          "CRUD select action for " + config.label + "."
        ),
        actionStackNode(
          newName,
          [],
          [
            customAsyncActionNode(
              "New" + pascalize(config.singular),
              buildEntityPagesNewActionScript(config),
              "Prepare a new " + config.singular + " draft."
            )
          ],
          "CRUD new action for " + config.label + "."
        ),
        actionStackNode(
          saveName,
          [],
          [
            customAsyncActionNode(
              "Save" + pascalize(config.singular),
              buildEntityPagesSaveActionScript(config),
              "Persist the current " + config.singular + " draft."
            )
          ],
          "CRUD save action for " + config.label + "."
        ),
        actionStackNode(
          deleteName,
          [],
          [
            customAsyncActionNode(
              "Delete" + pascalize(config.singular),
              buildEntityPagesDeleteActionScript(config),
              "Delete the selected " + config.singular + "."
            )
          ],
          "CRUD delete action for " + config.label + "."
        ),
        actionStackNode(
          cancelName,
          [],
          [
            customAsyncActionNode(
              "Cancel" + pascalize(config.singular),
              buildEntityPagesCancelActionScript(config),
              "Reset the current " + config.singular + " draft."
            )
          ],
          "CRUD cancel action for " + config.label + "."
        ),
        actionStackNode(
          openName,
          [],
          [
            customAsyncActionNode(
              "Open" + pascalize(config.key) + "Page",
              buildEntityPagesOpenPageScript(config),
              "Navigate to the " + config.label + " page."
            )
          ],
          "CRUD navigation action for " + config.label + "."
        )
      );
    }
    return {
      qnames: qnames,
      tree: {
        children: children
      }
    };
  }

  function landingRouteCardNode(entity) {
    var componentPrefix = pascalize(entity.name);
    return {
      className: "ngx.components.UIDynamicElement#GridCol",
      name: componentPrefix + "RouteCol",
      children: [
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: componentPrefix + "RouteCard",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: componentPrefix + "RouteHeader",
              children: [
                textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  componentPrefix + "RouteTitle",
                  plainTextNode(componentPrefix + "RouteTitleText", entity.label)
                ),
                textElementNode(
                  "ngx.components.UIDynamicElement#CardSubTitle",
                  componentPrefix + "RouteSubtitle",
                  scriptTextNode("RouteSubtitleText", "'Rows: ' + (" + dashboardCountExpression(scriptLiteral(entity.name)) + ")")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: componentPrefix + "RouteContent",
              children: [
                scriptTextNode("RoutePreview", dynamicFieldAccessExpression(dashboardSampleExpression(scriptLiteral(entity.name)), scriptLiteral(((firstNonPrimaryField(entity) || entity.primaryField || {}).column) || "id"), scriptLiteral("No live sample yet"))),
                entityPagesButtonNode("OpenPageButton", "Open " + entity.label, { routerPath: entityRoutePath(entity), routerDirection: "forward", color: "primary" }, [])
              ]
            }
          ]
        }
      ]
    };
  }

  function buildEntityPagesLandingShellTree(projectName, entities, stage) {
    var children = [
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
                    useVariableNode("Title", scriptLiteral(ucfirst(projectName) + " CRUD landing")),
                    useVariableNode("Subtitle", scriptLiteral("Open an entity page to edit live facade data."))
                  ])
                ]
              }
            ]
          }
        ]
      }
    ];
    var gridChildren = children[0].children;
    if (trimmed(stage).toLowerCase() !== "final") {
      gridChildren.push({
        className: "ngx.components.UIDynamicElement#GridRow",
        name: "BootstrapRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: "BootstrapCol",
            children: [
              buildUseSharedNode(sharedComponentQName(projectName, "WorkInProgressCard"), "UseWorkInProgressCard", [])
            ]
          }
        ]
      });
    }
    gridChildren.push({
      className: "ngx.components.UIDynamicElement#GridRow",
      name: "MetricsRow",
      children: entities.map(function (entity) {
        return {
          className: "ngx.components.UIDynamicElement#GridCol",
          name: pascalize(entity.name) + "MetricCol",
          children: [
            buildUseSharedNode(sharedComponentQName(projectName, "DashboardStatCard"), "Use" + pascalize(entity.name) + "StatCard", [
              useVariableNode("Title", scriptLiteral(entity.label)),
              useVariableNode("EntityKey", scriptLiteral(entity.name)),
              useVariableNode("Caption", scriptLiteral("Landing state is live"))
            ])
          ]
        };
      })
    });
    gridChildren.push({
      className: "ngx.components.UIDynamicElement#GridRow",
      name: "RouteRow",
      children: entities.map(function (entity) {
        return landingRouteCardNode(entity);
      })
    });
    gridChildren.push(
      {
        className: "ngx.components.UIDynamicElement#GridRow",
        name: "LoadingRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: "LoadingCol",
            children: [
              ifDirectiveNode(
                "LoadingVisible",
                "this.global?.crudLoading === true",
                [buildUseSharedNode(sharedComponentQName(projectName, "CrudLoadingState"), "UseCrudLoadingState", [])]
              )
            ]
          }
        ]
      },
      {
        className: "ngx.components.UIDynamicElement#GridRow",
        name: "ErrorRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: "ErrorCol",
            children: [
              ifDirectiveNode(
                "ErrorVisible",
                "!!this.global?.crudError",
                [buildUseSharedNode(sharedComponentQName(projectName, "CrudErrorRetryState"), "UseCrudErrorRetryState", [])]
              )
            ]
          }
        ]
      }
    );
    return {
      className: "ngx.components.UIDynamicElement#Content",
      name: "Content",
      properties: {
        Padding: {
          mode: "PLAIN",
          value: "ion-padding"
        }
      },
      children: children
    };
  }

  function buildEntityPageShellTree(projectName, entity, stage) {
    var prefix = pascalize(entity.name);
    return {
      className: "ngx.components.UIDynamicElement#Content",
      name: "Content",
      properties: {
        Padding: {
          mode: "PLAIN",
          value: "ion-padding"
        }
      },
      children: [
        {
          className: "ngx.components.UIDynamicElement#Grid",
          name: "CrudEntityPageGrid",
          children: [
            {
              className: "ngx.components.UIDynamicElement#GridRow",
              name: "PageHeaderRow",
              children: [
                {
                  className: "ngx.components.UIDynamicElement#GridCol",
                  name: "PageHeaderCol",
                  children: [
                    buildUseSharedNode(sharedComponentQName(projectName, "CrudPageHeader"), "UseCrudPageHeader", [
                      useVariableNode("Title", scriptLiteral(entity.label + " workspace")),
                      useVariableNode("Subtitle", scriptLiteral("Select, edit, create, then return to the landing page if needed."))
                    ]),
                    entityPagesButtonNode("BackToLanding", "Back to landing", { routerPath: "/home", routerDirection: "back", fill: "outline" }, [])
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
  }

  function appendEntityPageRows(projectName, entity, shellTree, stage) {
    var prefix = pascalize(entity.name);
    var gridChildren = ensureArray(shellTree && shellTree.children && shellTree.children[0] && shellTree.children[0].children);
    if (trimmed(stage).toLowerCase() !== "final") {
      gridChildren.push({
        className: "ngx.components.UIDynamicElement#GridRow",
        name: "BootstrapRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: "BootstrapCol",
            children: [
              buildUseSharedNode(sharedComponentQName(projectName, "WorkInProgressCard"), "UseWorkInProgressCard", [])
            ]
          }
        ]
      });
    }
    gridChildren.push(
      {
        className: "ngx.components.UIDynamicElement#GridRow",
        name: prefix + "ListRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: prefix + "ListCol",
            children: [
              buildUseSharedNode(sharedComponentQName(projectName, prefix + "ListPanel"), "Use" + prefix + "ListPanel", [])
            ]
          }
        ]
      },
      {
        className: "ngx.components.UIDynamicElement#GridRow",
        name: prefix + "DetailRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: prefix + "DetailCol",
            children: [
              buildUseSharedNode(sharedComponentQName(projectName, prefix + "DetailCard"), "Use" + prefix + "DetailCard", [])
            ]
          }
        ]
      },
      {
        className: "ngx.components.UIDynamicElement#GridRow",
        name: prefix + "FormRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: prefix + "FormCol",
            children: [
              buildUseSharedNode(sharedComponentQName(projectName, prefix + "EditForm"), "Use" + prefix + "EditForm", [])
            ]
          }
        ]
      },
      {
        className: "ngx.components.UIDynamicElement#GridRow",
        name: prefix + "LoadingRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: prefix + "LoadingCol",
            children: [
              ifDirectiveNode(
                prefix + "LoadingVisible",
                "this.global?.crudLoading === true || " + crudEntityStatusExpression(scriptLiteral(entity.name)) + " === 'loading'",
                [buildUseSharedNode(sharedComponentQName(projectName, "CrudLoadingState"), "UseCrudLoadingState", [])]
              )
            ]
          }
        ]
      },
      {
        className: "ngx.components.UIDynamicElement#GridRow",
        name: prefix + "ErrorRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: prefix + "ErrorCol",
            children: [
              ifDirectiveNode(
                prefix + "ErrorVisible",
                "!!this.global?.crudError || !!" + crudEntityErrorExpression(scriptLiteral(entity.name)),
                [buildUseSharedNode(sharedComponentQName(projectName, "CrudErrorRetryState"), "UseCrudErrorRetryState", [])]
              )
            ]
          }
        ]
      }
    );
    shellTree.children[0].children = gridChildren;
    return shellTree;
  }

  function buildEntityPageRootTree(entity) {
    return {
      className: "ngx.components.PageComponent#PageComponent",
      name: entityPageName(entity),
      properties: {
        comment: "Deterministic CRUD entity page for " + entity.label + ".",
        icon: "list",
        preloadPriority: "low",
        segment: entityRouteSegment(entity),
        title: entity.label
      },
      children: [
        entityPagesHeaderTitleTree(entity.label),
        {
          className: "ngx.components.UIDynamicElement#Content",
          name: "Content",
          properties: {
            Padding: {
              mode: "PLAIN",
              value: "ion-padding"
            }
          },
          children: []
        }
      ]
    };
  }

  function buildEntityPagesLandingLoadTree(projectName, entryPage) {
    return {
      qname: pageQName(projectName, entryPage),
      legacyQNames: [
        pageQName(projectName, entryPage) + ".PageEvent",
        pageQName(projectName, entryPage) + ".LoadCrudFacadeOnEnter"
      ],
      tree: {
        properties: {
          scriptContent: blankPageScriptContent()
        },
        children: [
          pageEventNode(
            "PageEvent",
            "onWillLoad",
            [
              dynamicInvokeNode("InvokeBootstrapDashboard", dashboardActionQName(projectName, "crud_bootstrap_dashboard"), [])
            ],
            "Bootstrap CRUD entity-pages state on landing load."
          )
        ]
      }
    };
  }

  function buildEntityPageLoadTree(projectName, entity) {
    return {
      qname: entityPageQName(projectName, entity),
      legacyQNames: [
        entityPageQName(projectName, entity) + ".PageEvent"
      ],
      tree: {
        properties: {
          scriptContent: blankPageScriptContent()
        },
        children: [
          pageEventNode(
            "PageEvent",
            "onWillLoad",
            [
              dynamicInvokeNode("InvokeBootstrapDashboard", dashboardActionQName(projectName, "crud_bootstrap_dashboard"), []),
              dynamicInvokeNode("InvokeBootstrap" + pascalize(entity.name) + "Page", dashboardActionQName(projectName, "crud_bootstrap_" + entity.name + "_page"), [])
            ],
            "Bootstrap CRUD entity page state on page load."
          )
        ]
      }
    };
  }

  function crmActionQName(projectName, actionName) {
    return ngxAppQName(projectName) + "." + trimmed(actionName);
  }

  function crmHeaderComponentTree(componentName, projectName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "CRM live-state header."
      },
      children: [
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "HeaderCard",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "HeaderCardHeader",
              children: [
                textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  "HeaderTitle",
                  plainTextNode("HeaderTitleText", ucfirst(projectName) + " CRM")
                ),
                textElementNode(
                  "ngx.components.UIDynamicElement#CardSubTitle",
                  "HeaderSubtitle",
                  scriptTextNode("HeaderSubtitleText", "(this.global?.crmStatus === 'ok') ? 'Companies, contacts, and relations are live.' : (this.global?.crmLoading ? 'Loading CRM facade...' : (this.global?.crmError || 'Preparing CRM facade state.'))")
                )
              ]
            }
          ]
        }
      ]
    };
  }

  function crmWorkInProgressCardTree(componentName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Temporary CRM bootstrap card."
      },
      children: [
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "WorkInProgressCard",
          properties: {
            IonColor: {
              mode: "PLAIN",
              value: "warning"
            }
          },
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "WorkInProgressHeader",
              children: [
                textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  "WorkInProgressTitle",
                  plainTextNode("WorkInProgressTitleText", "Work in progress")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "WorkInProgressContent",
              children: [
                scriptTextNode("WorkInProgressText", "'Bootstrap stage visible. Current build stage: ' + (this.global?.crmBuildStage ?? 'bootstrap')"),
                plainTextNode("WorkInProgressHint", "The shell is already alive while live CRM actions finish wiring data.")
              ]
            }
          ]
        }
      ]
    };
  }

  function crmLoadingStateTree(componentName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "CRM loading state bound to global state."
      },
      children: [
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "LoadingCard",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "LoadingContent",
              children: [
                scriptTextNode("LoadingText", "this.global?.crmLoading ? 'Loading companies, contacts, and company contacts...' : 'Loading idle.'")
              ]
            }
          ]
        }
      ]
    };
  }

  function crmErrorRetryStateTree(componentName, projectName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "CRM error state with retry action."
      },
      children: [
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "ErrorCard",
          properties: {
            IonColor: {
              mode: "PLAIN",
              value: "warning"
            }
          },
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "ErrorHeader",
              children: [
                textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  "ErrorTitle",
                  plainTextNode("ErrorTitleText", "Retry live CRM facade")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "ErrorContent",
              children: [
                scriptTextNode("ErrorText", "this.global?.crmError || 'Retry if one CRM sequence fails.'"),
                {
                  className: "ngx.components.UIDynamicElement#Button",
                  name: "RetryButton",
                  properties: {
                    IonColor: {
                      mode: "PLAIN",
                      value: "primary"
                    }
                  },
                  children: [
                    plainTextNode("RetryText", "Retry"),
                    controlEventNode("Event", [
                      customAsyncActionNode(
                        "RetryDashboard",
                        [
                          "try {",
                          "  if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {",
                          "    window.location.reload();",
                          "  }",
                          "} finally {",
                          "  return;",
                          "}"
                        ].join("\n"),
                        "Reload the current page to rerun the CRM bootstrap action."
                      )
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

  function companyTableTreeGlobal(projectName, componentName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "CRM companies master list bound to global state."
      },
      children: [
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "CompanyListCard",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "CompanyListHeader",
              children: [
                textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  "CompanyListTitle",
                  plainTextNode("CompanyListTitleText", "Companies")
                ),
                textElementNode(
                  "ngx.components.UIDynamicElement#CardSubTitle",
                  "CompanyListSubtitle",
                  scriptTextNode("CompanyListSubtitleText", "'Loaded ' + ((this.global?.crmCompanies || []).length) + ' companies'")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "CompanyListContent",
              children: [
                ifDirectiveNode(
                  "CompanyListEmpty",
                  "(this.global?.crmCompanies || []).length === 0",
                  [
                    textElementNode(
                      "ngx.components.UIDynamicElement#Paragraph",
                      "CompanyListEmptyParagraph",
                      plainTextNode("CompanyListEmptyText", "No companies loaded yet.")
                    )
                  ]
                ),
                {
                  className: "ngx.components.UIDynamicElement#List",
                  name: "CompanyList",
                  children: [
                    sourceDirectiveNode(
                      "CompanyLoop",
                      "company",
                      globalSourceValue(projectName, "?.crmCompanies"),
                      [
                        {
                          className: "ngx.components.UIDynamicElement#ListItem",
                          name: "CompanyItem",
                          properties: {
                            Button: {
                              mode: "PLAIN",
                              value: "true"
                            },
                            Detail: {
                              mode: "PLAIN",
                              value: "false"
                            }
                          },
                          children: [
                            {
                              className: "ngx.components.UIDynamicElement#Label",
                              name: "CompanyLabel",
                              children: [
                                textElementNode(
                                  "ngx.components.UIDynamicElement#Heading2",
                                  "CompanyHeading",
                                  smartTextNode("CompanyHeadingText", iterationSourceValue(projectName, "company?.NAME ?? company?.name"))
                                ),
                                textElementNode(
                                  "ngx.components.UIDynamicElement#Paragraph",
                                  "CompanyParagraph",
                                  smartTextNode("CompanyParagraphText", iterationSourceValue(projectName, "(company?.INDUSTRY ?? company?.industry ?? '') + ' - ' + (company?.CITY ?? company?.city ?? '')"))
                                )
                              ]
                            },
                            textElementNode(
                              "ngx.components.UIDynamicElement#Note",
                              "CompanyCountNote",
                              smartTextNode("CompanyCountNoteText", iterationSourceValue(projectName, "'' + (company?.CONTACT_COUNT ?? company?.contact_count ?? 0) + ' contacts'"))
                            ),
                            controlEventNode("Event", [
                              dynamicInvokeNode("InvokeSelectCompany", crmActionQName(projectName, "crm_select_company"), [
                                controlVariableNode("company_id", iterationSourceValue(projectName, "company?.ID ?? company?.id"))
                              ])
                            ])
                          ]
                        }
                      ],
                      "idx"
                    )
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
  }

  function companyCardTreeGlobal(componentName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "CRM selected company detail bound to global state."
      },
      children: [
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "SelectedCompanyCard",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "SelectedCompanyHeader",
              children: [
                textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  "SelectedCompanyTitle",
                  plainTextNode("SelectedCompanyTitleText", "Selected company")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "SelectedCompanyContent",
              children: [
                scriptTextNode("SelectedCompanyName", "this.global?.crmSelectedCompany?.NAME ?? this.global?.crmSelectedCompany?.name ?? 'No company selected'"),
                scriptTextNode("SelectedCompanyIndustry", "(this.global?.crmSelectedCompany?.INDUSTRY ?? this.global?.crmSelectedCompany?.industry ?? 'No industry yet')"),
                scriptTextNode("SelectedCompanyCity", "(this.global?.crmSelectedCompany?.CITY ?? this.global?.crmSelectedCompany?.city ?? 'No city yet')"),
                scriptTextNode("SelectedCompanyCount", "'Contacts in company: ' + (this.global?.crmSelectedCompany?.CONTACT_COUNT ?? this.global?.crmSelectedCompany?.contact_count ?? (this.global?.crmCompanyContacts || []).length ?? 0)")
              ]
            }
          ]
        }
      ]
    };
  }

  function contactTableTreeGlobal(projectName, componentName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "CRM company contacts detail bound to global state."
      },
      children: [
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "CompanyContactsCard",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "CompanyContactsHeader",
              children: [
                textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  "CompanyContactsTitle",
                  plainTextNode("CompanyContactsTitleText", "Contacts for selected company")
                ),
                textElementNode(
                  "ngx.components.UIDynamicElement#CardSubTitle",
                  "CompanyContactsSubtitle",
                  scriptTextNode("CompanyContactsSubtitleText", "'Selected: ' + (this.global?.crmSelectedCompany?.NAME ?? this.global?.crmSelectedCompany?.name ?? 'none')")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "CompanyContactsContent",
              children: [
                ifDirectiveNode(
                  "CompanyContactsEmpty",
                  "(this.global?.crmCompanyContacts || []).length === 0",
                  [
                    textElementNode(
                      "ngx.components.UIDynamicElement#Paragraph",
                      "CompanyContactsEmptyParagraph",
                      plainTextNode("CompanyContactsEmptyText", "No contacts linked to the selected company yet.")
                    )
                  ]
                ),
                {
                  className: "ngx.components.UIDynamicElement#List",
                  name: "CompanyContactsList",
                  children: [
                    sourceDirectiveNode(
                      "CompanyContactsLoop",
                      "contact",
                      globalSourceValue(projectName, "?.crmCompanyContacts"),
                      [
                        {
                          className: "ngx.components.UIDynamicElement#ListItem",
                          name: "CompanyContactItem",
                          properties: {
                            Detail: {
                              mode: "PLAIN",
                              value: "false"
                            }
                          },
                          children: [
                            {
                              className: "ngx.components.UIDynamicElement#Label",
                              name: "CompanyContactLabel",
                              children: [
                                textElementNode(
                                  "ngx.components.UIDynamicElement#Heading2",
                                  "CompanyContactHeading",
                                  smartTextNode("CompanyContactHeadingText", iterationSourceValue(projectName, "(contact?.FIRSTNAME ?? contact?.firstname ?? '') + ' ' + (contact?.LASTNAME ?? contact?.lastname ?? '')"))
                                ),
                                textElementNode(
                                  "ngx.components.UIDynamicElement#Paragraph",
                                  "CompanyContactParagraph",
                                  smartTextNode("CompanyContactParagraphText", iterationSourceValue(projectName, "contact?.EMAIL ?? contact?.email ?? 'No email'"))
                                )
                              ]
                            }
                          ]
                        }
                      ],
                      "idx"
                    )
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
  }

  function contactCardTreeGlobal(projectName, componentName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "CRM all contacts overview bound to global state."
      },
      children: [
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "ContactsOverviewCard",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "ContactsOverviewHeader",
              children: [
                textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  "ContactsOverviewTitle",
                  plainTextNode("ContactsOverviewTitleText", "Contacts overview")
                ),
                textElementNode(
                  "ngx.components.UIDynamicElement#CardSubTitle",
                  "ContactsOverviewSubtitle",
                  scriptTextNode("ContactsOverviewSubtitleText", "'Loaded ' + ((this.global?.crmContacts || []).length) + ' contacts'")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "ContactsOverviewContent",
              children: [
                scriptTextNode("ContactsOverviewLead", "(this.global?.crmContacts || [])[0] ? (((this.global?.crmContacts || [])[0]?.FIRSTNAME ?? (this.global?.crmContacts || [])[0]?.firstname ?? '') + ' ' + ((this.global?.crmContacts || [])[0]?.LASTNAME ?? (this.global?.crmContacts || [])[0]?.lastname ?? '')) : 'No contact loaded yet'"),
                scriptTextNode("ContactsOverviewCompany", "(this.global?.crmContacts || [])[0] ? ('Company: ' + (((this.global?.crmContacts || [])[0]?.COMPANY_NAME ?? (this.global?.crmContacts || [])[0]?.company_name ?? 'n/a'))) : 'Awaiting company relation preview'"),
                scriptTextNode("ContactsOverviewStatus", "'Counts => companies: ' + ((this.global?.crmCounts || {}).companies ?? 0) + ', contacts: ' + ((this.global?.crmCounts || {}).contacts ?? 0)")
              ]
            }
          ]
        }
      ]
    };
  }

  function buildCrmSharedComponentsTree(projectName, stage) {
    var components = [
      crmHeaderComponentTree("CrudPageHeader", projectName),
      crmLoadingStateTree("CrudLoadingState"),
      crmErrorRetryStateTree("CrudErrorRetryState", projectName),
      companyTableTreeGlobal(projectName, "CompanyTable"),
      companyCardTreeGlobal("CompanyCard"),
      contactTableTreeGlobal(projectName, "ContactTable"),
      contactCardTreeGlobal(projectName, "ContactCard")
    ];
    if (trimmed(stage).toLowerCase() !== "final") {
      components.push(crmWorkInProgressCardTree("WorkInProgressCard"));
    }
    return {
      qnames: components.map(function (component) { return sharedComponentQName(projectName, component.name); }),
      tree: {
        children: components
      }
    };
  }

  function buildCrmActionStacksTree(projectName, facadePrefix, stage) {
    var listCompaniesQName = trimmed(projectName) + "." + trimmed(facadePrefix) + "_list_companies";
    var listContactsQName = trimmed(projectName) + "." + trimmed(facadePrefix) + "_list_contacts";
    var listCompanyContactsQName = trimmed(projectName) + "." + trimmed(facadePrefix) + "_list_company_contacts";
    var refreshCompaniesQName = crmActionQName(projectName, "crm_refresh_companies");
    var refreshContactsQName = crmActionQName(projectName, "crm_refresh_contacts");
    var refreshCompanyContactsQName = crmActionQName(projectName, "crm_refresh_company_contacts");
    var selectCompanyQName = crmActionQName(projectName, "crm_select_company");
    var bootstrapQName = crmActionQName(projectName, "crm_bootstrap_dashboard");
    return {
      qnames: [
        refreshCompaniesQName,
        refreshContactsQName,
        refreshCompanyContactsQName,
        selectCompanyQName,
        bootstrapQName,
        crmActionQName(projectName, "crm_retry_dashboard")
      ],
      tree: {
        children: [
          actionStackNode(
            "crm_refresh_companies",
            [],
            [
              callSequenceActionNode("CallCompanies", listCompaniesQName, [], { noLoading: true, cacheTtl: 3000 }),
              setGlobalActionNode("SetCompanies", "crmCompanies", "parent.out?.sql_output ?? []"),
              setGlobalActionNode("SetCompanyCount", "crmCounts", "Object.assign({}, this.global?.crmCounts || {}, { companies: Number(parent.out?.sql_output?.length ?? 0) })"),
              setGlobalActionNode("SetCompanyStatus", "crmStatus", "parent.out?.status ?? 'ok'"),
              setGlobalActionNode("SetCompanyError", "crmError", "(parent.out?.status && parent.out?.status !== 'ok') ? (parent.out?.error ?? 'Unable to load companies') : ''"),
              setGlobalActionNode("SetSelectedCompany", "crmSelectedCompany", "(this.global?.crmSelectedCompany && (parent.out?.sql_output || []).some((item) => String(item?.ID ?? item?.id) === String(this.global?.crmSelectedCompany?.ID ?? this.global?.crmSelectedCompany?.id))) ? this.global?.crmSelectedCompany : ((parent.out?.sql_output || [])[0] ?? null)")
            ],
            "CRM companies refresh action."
          ),
          actionStackNode(
            "crm_refresh_contacts",
            [],
            [
              callSequenceActionNode("CallContacts", listContactsQName, [], { noLoading: true, cacheTtl: 3000 }),
              setGlobalActionNode("SetContacts", "crmContacts", "parent.out?.sql_output ?? []"),
              setGlobalActionNode("SetContactCount", "crmCounts", "Object.assign({}, this.global?.crmCounts || {}, { contacts: Number(parent.out?.sql_output?.length ?? 0) })"),
              setGlobalActionNode("SetContactsStatus", "crmStatus", "(this.global?.crmError ? 'error' : (parent.out?.status ?? 'ok'))"),
              setGlobalActionNode("SetContactsError", "crmError", "(parent.out?.status && parent.out?.status !== 'ok') ? (parent.out?.error ?? 'Unable to load contacts') : (this.global?.crmError || '')")
            ],
            "CRM contacts refresh action."
          ),
          actionStackNode(
            "crm_refresh_company_contacts",
            [stackVariableNode("company_id", "0")],
            [
              callSequenceActionNode("CallCompanyContacts", listCompanyContactsQName, [
                controlVariableNode("company_id", "Number(vars.company_id ?? this.global?.crmSelectedCompany?.ID ?? this.global?.crmSelectedCompany?.id ?? 0)")
              ], { noLoading: true, cacheTtl: 3000 }),
              setGlobalActionNode("SetCompanyContacts", "crmCompanyContacts", "parent.out?.sql_output ?? []"),
              setGlobalActionNode("SetCompanyContactsStatus", "crmStatus", "(this.global?.crmError ? 'error' : (parent.out?.status ?? 'ok'))"),
              setGlobalActionNode("SetCompanyContactsError", "crmError", "(parent.out?.status && parent.out?.status !== 'ok') ? (parent.out?.error ?? 'Unable to load company contacts') : (this.global?.crmError || '')")
            ],
            "CRM selected-company contacts refresh action."
          ),
          actionStackNode(
            "crm_select_company",
            [stackVariableNode("company_id", "0")],
            [
              setGlobalActionNode("SetSelectedCompany", "crmSelectedCompany", "(this.global?.crmCompanies || []).find((item) => String(item?.ID ?? item?.id) === String(vars.company_id ?? '')) || null"),
              dynamicInvokeNode("InvokeRefreshCompanyContacts", refreshCompanyContactsQName, [
                controlVariableNode("company_id", "Number(vars.company_id ?? this.global?.crmSelectedCompany?.ID ?? this.global?.crmSelectedCompany?.id ?? 0)")
              ])
            ],
            "CRM company selection action."
          ),
          actionStackNode(
            "crm_bootstrap_dashboard",
            [],
            [
              setGlobalActionNode("SetBuildStage", "crmBuildStage", scriptLiteral(trimmed(stage || "bootstrap"))),
              setGlobalActionNode("SetLoading", "crmLoading", "true"),
              setGlobalActionNode("ResetError", "crmError", "''"),
              setGlobalActionNode("SetBootstrapStatus", "crmStatus", "'loading'"),
              dynamicInvokeNode("InvokeRefreshCompanies", refreshCompaniesQName, []),
              dynamicInvokeNode("InvokeRefreshContacts", refreshContactsQName, []),
              dynamicInvokeNode("InvokeRefreshCompanyContacts", refreshCompanyContactsQName, [
                controlVariableNode("company_id", "Number(this.global?.crmSelectedCompany?.ID ?? this.global?.crmSelectedCompany?.id ?? 0)")
              ]),
              setGlobalActionNode("ClearLoading", "crmLoading", "false"),
              setGlobalActionNode("FinalizeStatus", "crmStatus", "this.global?.crmError ? 'error' : 'ok'")
            ],
            "CRM dashboard bootstrap action."
          ),
          actionStackNode(
            "crm_retry_dashboard",
            [],
            [
              dynamicInvokeNode("InvokeBootstrapDashboard", bootstrapQName, [])
            ],
            "CRM retry action."
          )
        ]
      }
    };
  }

  function countCardNode(name, title, valueExpression, caption) {
    return {
      className: "ngx.components.UIDynamicElement#Card",
      name: name,
      children: [
        {
          className: "ngx.components.UIDynamicElement#CardHeader",
          name: name + "Header",
          children: [
            textElementNode(
              "ngx.components.UIDynamicElement#CardTitle",
              name + "Title",
              plainTextNode(name + "TitleText", title)
            )
          ]
        },
        {
          className: "ngx.components.UIDynamicElement#CardContent",
          name: name + "Content",
          children: [
            scriptTextNode(name + "ValueText", valueExpression),
            plainTextNode(name + "CaptionText", caption)
          ]
        }
      ]
    };
  }

  function buildCrmMasterDetailPageShellTree(projectName, stage) {
    var pageTitle = ucfirst(projectName) + " CRM";
    var headerUse = buildUseSharedNode(sharedComponentQName(projectName, "CrudPageHeader"), "UseCrudPageHeader", []);
    var children = [
      {
        className: "ngx.components.UIDynamicElement#Grid",
        name: "CrmMasterDetailGrid",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridRow",
            name: "HeaderRow",
            children: [
              {
                className: "ngx.components.UIDynamicElement#GridCol",
                name: "HeaderCol",
                children: [headerUse]
              }
            ]
          }
        ]
      }
    ];

    if (trimmed(stage).toLowerCase() !== "final") {
      children[0].children.push({
        className: "ngx.components.UIDynamicElement#GridRow",
        name: "BootstrapRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: "BootstrapCol",
            children: [
              buildUseSharedNode(sharedComponentQName(projectName, "WorkInProgressCard"), "UseWorkInProgressCard", [])
            ]
          }
        ]
      });
    }

    children[0].children.push(
      {
        className: "ngx.components.UIDynamicElement#GridRow",
        name: "CountsRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: "CompaniesCountCol",
            children: [
              countCardNode("CompaniesCountCard", "Companies", "'' + ((this.global?.crmCounts || {}).companies ?? 0)", "Loaded from public facade")
            ]
          },
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: "ContactsCountCol",
            children: [
              countCardNode("ContactsCountCard", "Contacts", "'' + ((this.global?.crmCounts || {}).contacts ?? 0)", "Loaded from public facade")
            ]
          }
        ]
      },
      {
        className: "ngx.components.UIDynamicElement#GridRow",
        name: "MasterDetailRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: "CompaniesListCol",
            children: [
              buildUseSharedNode(sharedComponentQName(projectName, "CompanyTable"), "UseCompanyTable", [])
            ]
          },
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: "CompanyDetailCol",
            children: [
              buildUseSharedNode(sharedComponentQName(projectName, "CompanyCard"), "UseCompanyCard", [])
            ]
          }
        ]
      },
      {
        className: "ngx.components.UIDynamicElement#GridRow",
        name: "ContactsRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: "CompanyContactsCol",
            children: [
              buildUseSharedNode(sharedComponentQName(projectName, "ContactTable"), "UseContactTable", [])
            ]
          },
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: "ContactsOverviewCol",
            children: [
              buildUseSharedNode(sharedComponentQName(projectName, "ContactCard"), "UseContactCard", [])
            ]
          }
        ]
      },
      {
        className: "ngx.components.UIDynamicElement#GridRow",
        name: "LoadingRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: "LoadingCol",
            children: [
              ifDirectiveNode(
                "LoadingVisible",
                "this.global?.crmLoading === true",
                [buildUseSharedNode(sharedComponentQName(projectName, "CrudLoadingState"), "UseCrudLoadingState", [])]
              )
            ]
          }
        ]
      },
      {
        className: "ngx.components.UIDynamicElement#GridRow",
        name: "ErrorRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: "ErrorCol",
            children: [
              ifDirectiveNode(
                "ErrorVisible",
                "!!this.global?.crmError",
                [buildUseSharedNode(sharedComponentQName(projectName, "CrudErrorRetryState"), "UseCrudErrorRetryState", [])]
              )
            ]
          }
        ]
      }
    );

    return {
      className: "ngx.components.UIDynamicElement#Content",
      name: "Content",
      properties: {
        Padding: {
          mode: "PLAIN",
          value: "ion-padding"
        }
      },
      children: children
    };
  }

  function buildCrmPageLoadTree(projectName, entryPage, stage) {
    return {
      qname: pageQName(projectName, entryPage),
      legacyQNames: [
        pageQName(projectName, entryPage) + ".PageEvent",
        pageQName(projectName, entryPage) + ".LoadCrudFacadeOnEnter"
      ],
      tree: {
        properties: {
          scriptContent: ""
        },
        children: [
          pageEventNode(
            "PageEvent",
            "onWillLoad",
            [
              dynamicInvokeNode("InvokeBootstrapDashboard", crmActionQName(projectName, "crm_bootstrap_dashboard"), [])
            ],
            "Bootstrap CRM global state on page load."
          )
        ]
      }
    };
  }

  function ifDirectiveNode(name, expression, children) {
    return {
      className: "ngx.components.UIControlDirective#UIControlDirective",
      name: name,
      properties: {
        directiveName: "If",
        directiveExpression: String(expression || "false")
      },
      children: ensureArray(children)
    };
  }

  function iterationDirectiveNode(name, projectName, itemName, inputExpression, children) {
    return {
      className: "ngx.components.UIControlDirective#UIControlDirective",
      name: name,
      properties: {
        directiveItemName: trimmed(itemName || "item"),
        directiveSource: iterationSourceValue(projectName, inputExpression)
      },
      children: ensureArray(children)
    };
  }

  function sourceDirectiveNode(name, itemName, sourceValue, children, indexName) {
    var properties = {
      directiveItemName: trimmed(itemName || "item"),
      directiveSource: sourceValue
    };
    if (trimmed(indexName).length) {
      properties.directiveIndexName = String(indexName);
    }
    return {
      className: "ngx.components.UIControlDirective#UIControlDirective",
      name: name,
      properties: properties,
      children: ensureArray(children)
    };
  }

  function controlEventNode(name, children, options) {
    var node = {
      className: "ngx.components.UIControlEvent#UIControlEvent",
      name: name,
      children: ensureArray(children)
    };
    var extra = options && typeof options === "object" ? options : {};
    var properties = {};
    if (trimmed(extra.attrName).length) {
      properties.attrName = String(extra.attrName);
    };
    if (trimmed(extra.eventName).length) {
      properties.eventName = String(extra.eventName);
    }
    if (trimmed(extra.comment).length) {
      properties.comment = String(extra.comment);
    }
    if (Object.keys(properties).length) {
      node.properties = properties;
    }
    return node;
  }

  function stackVariableNode(name, defaultValue) {
    var node = {
      className: "ngx.components.UIStackVariable#UIStackVariable",
      name: name
    };
    if (defaultValue != null) {
      node.properties = {
        value: String(defaultValue)
      };
    }
    return node;
  }

  function setGlobalActionNode(name, propertyName, valueExpression) {
    return {
      className: "ngx.components.UIDynamicAction#SetGlobalAction",
      name: name,
      properties: {
        Property: {
          mode: "PLAIN",
          value: String(propertyName || "")
        },
        Value: {
          mode: "SCRIPT",
          value: valueExpression || "''"
        }
      }
    };
  }

  function setLocalActionNode(name, propertyName, valueExpression) {
    return {
      className: "ngx.components.UIDynamicAction#SetLocalAction",
      name: name,
      properties: {
        Property: {
          mode: "PLAIN",
          value: String(propertyName || "")
        },
        Value: {
          mode: "SCRIPT",
          value: valueExpression || "''"
        }
      }
    };
  }

  function dynamicInvokeNode(name, stackQName, variables) {
    return {
      className: "ngx.components.UIDynamicInvoke#InvokeAction",
      name: name,
      properties: {
        stack: String(stackQName || "")
      },
      children: ensureArray(variables)
    };
  }

  function actionStackNode(name, variables, children, comment) {
    var stackChildren = [];
    var vars = ensureArray(variables);
    for (var i = 0; i < vars.length; i++) {
      stackChildren.push(vars[i]);
    }
    stackChildren = stackChildren.concat(ensureArray(children));
    var node = {
      className: "ngx.components.UIActionStack#UIActionStack",
      name: name,
      children: stackChildren
    };
    if (trimmed(comment).length) {
      node.properties = {
        comment: String(comment)
      };
    }
    return node;
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
    var reuseExistingSharedActions = stage === "final" && !isEntityPages && everyQNameExists(sharedActions.qnames);
    var sharedActionChildren = reuseExistingSharedActions ? [] : ensureArray(sharedActions.tree.children);
    setDuration(timings, "buildSharedComponentsMs", sharedBuildStartedAt);
    result.runtimeEvidence.sharedComponentsRequested = ensureArray(sharedComponents.tree.children).length;
    result.runtimeEvidence.sharedComponentTreeNodeCount = countTreeNodes(sharedComponents.tree);
    result.runtimeEvidence.sharedActionsRequested = ensureArray(sharedActions.tree.children).length;
    result.runtimeEvidence.sharedActionTreeNodeCount = countTreeNodes(sharedActions.tree);
    result.runtimeEvidence.sharedActionsReused = reuseExistingSharedActions;
    result.runtimeEvidence.uiGlobals = statefulUiGlobals(variant);
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
      var managedPageNames = [entryPage];
      for (var managedPageIndex = 0; managedPageIndex < entityPageShells.length; managedPageIndex++) {
        var managedPageQName = trimmed(entityPageShells[managedPageIndex] && entityPageShells[managedPageIndex].qname);
        if (!managedPageQName.length) {
          continue;
        }
        managedPageNames.push(managedPageQName.substring(managedPageQName.lastIndexOf(".") + 1));
      }
      var managedSourcePurgeStartedAt = nowMillis();
      result.runtimeEvidence.generatedSourcesPurge = purgeManagedGeneratedIonicSources(
        projectName,
        managedPageNames,
        sharedComponents.qnames || []
      );
      setDuration(timings, "generatedSourcesPurgeMs", managedSourcePurgeStartedAt);
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
      result.checks.push(proofCheck("ui-visible-shell", shellVisible, shellVisible ? "" : "Visible CRUD shell is not present on the entry page.", result.ui && result.ui.targetQName));
      result.checks.push(proofCheck("ui-starter-replaced", starterReplaced, starterReplaced ? "" : "Starter content is still dominant on the entry page.", result.ui && result.ui.targetQName));
      result.checks.push(proofCheck("ui-live-binding", liveBinding, liveBinding ? "" : "Live state bindings are missing from the entry page.", result.ui && result.ui.targetQName));
      result.checks.push(proofCheck("ui-stateful-actions", statefulActions, statefulActions ? "" : "Shared action stacks are missing for the UI state flow.", result.project));
      result.checks.push(proofCheck("ui-page-bootstrap", pageBootstrap, pageBootstrap ? "" : "Entry page does not bootstrap the stateful UI flow.", result.project + ".Application.NgxApp." + result.entryPage));
      if (result.viewerUrl.length) {
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
      if (!shellVisible || !starterReplaced || !liveBinding || !statefulActions || !pageBootstrap) {
        pushMissing(result, result.ui && result.ui.targetQName ? result.ui.targetQName : (result.project + ".Application.NgxApp." + result.entryPage + ".Content"));
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
