/*
 * Collector for project-security-audit.
 * Walks one project's beans and YAML sources and builds the normalized model consumed
 * by security_audit_rules.js. Secret values never leave this file: they are reduced to
 * literal/symbol/empty statuses before being stored in the model.
 */
include("js/databaseobject.js");

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.securityAudit = C8O.securityAudit || {};

(function (api) {
  if (api._collectInitialized === true) {
    return;
  }
  api._collectInitialized = true;

  var MAX_OBJECTS = 200000;
  var MAX_SOURCE_CHARS = 20000000;

  var FILE_STEP_PATH_GETTERS = {
    WriteFileStep: ["getDataFile"],
    WriteCSVStep: ["getDataFile"],
    WriteXMLStep: ["getDataFile"],
    WriteJSONStep: ["getDataFile"],
    WriteBase64Step: ["getDataFile"],
    ReadFileStep: ["getDataFile"],
    ReadCSVStep: ["getDataFile"],
    ReadXMLStep: ["getDataFile"],
    ReadJSONStep: ["getDataFile"],
    MoveFileStep: ["getDataFile", "getNewFilename"],
    CopyStep: ["getSourcePath", "getDestinationPath"],
    RenameStep: ["getSourcePath", "getNewName"],
    DeleteStep: ["getSourcePath"],
    CreateDirectoryStep: ["getDestinationPath"],
    ListDirStep: ["getSourceDirectory"]
  };

  var PRIVILEGED_JS = [
    { id: "java.lang.Runtime", regex: /Runtime\s*\.\s*getRuntime|java\.lang\.Runtime/ },
    { id: "ProcessBuilder", regex: /ProcessBuilder/ },
    { id: "java.io file streams", regex: /java\.io\.(File(OutputStream|Writer|InputStream|Reader)?|RandomAccessFile)\b|java\.nio\.file\./ },
    { id: "FileUtils write/delete", regex: /FileUtils\s*\.\s*(write\w*|copy\w*|delete\w*|forceDelete\w*|move\w*)\s*\(/ }
  ];
  var DYNAMIC_CODE_JS = /(^|[^\w.])eval\s*\(|new\s+Function\s*\(/;

  var FRONTEND_PATTERNS = [
    { id: "bypassSecurityTrust", kind: "sanitizer", regex: /bypassSecurityTrust(Html|Script|Style|Url|ResourceUrl)\s*\(/g },
    { id: "innerHTML assignment", kind: "sanitizer", regex: /\.(inner|outer)HTML\s*=(?!=)/g },
    { id: "insertAdjacentHTML/document.write", kind: "sanitizer", regex: /insertAdjacentHTML\s*\(|document\s*\.\s*write(ln)?\s*\(/g },
    { id: "eval/new Function", kind: "sanitizer", regex: /(^|[^\w.])eval\s*\(|new\s+Function\s*\(/g },
    { id: "credential in web storage", kind: "localStorageSecret", regex: /(localStorage|sessionStorage)\s*\.\s*setItem\s*\(\s*['"`][^'"`]*(token|jwt|passw|secret|credential|api_?key)[^'"`]*['"`]/gi }
  ];

  function str(value) {
    return value == null ? "" : String(value);
  }

  function simpleClassName(dbo) {
    try {
      return String(dbo.getClass().getSimpleName());
    } catch (_ignore) {
      return "";
    }
  }

  function qnameOf(dbo) {
    return C8O.dbo.safeQName(dbo) || C8O.dbo.safeName(dbo);
  }

  function has(dbo, method) {
    try {
      return dbo != null && typeof dbo[method] === "function";
    } catch (_ignore) {
      return false;
    }
  }

  function call(dbo, method, fallback) {
    if (!has(dbo, method)) {
      return fallback;
    }
    try {
      return dbo[method]();
    } catch (_ignore) {
      return fallback;
    }
  }

  function javaList(list) {
    var out = [];
    if (list == null) {
      return out;
    }
    try {
      for (var i = 0; i < list.size(); i++) {
        out.push(list.get(i));
      }
    } catch (_ignore) {}
    return out;
  }

  /*
   * JavaScript-valued step properties are literal when the whole expression is one
   * quoted string without concatenation.
   */
  api.isLiteralJsString = function (expression) {
    var text = str(expression).trim();
    if (!text.length) {
      return true;
    }
    return /^'[^'\\]*'$/.test(text) || /^"[^"\\]*"$/.test(text);
  };

  api.scanJsSignals = function (source) {
    var text = str(source);
    var privileged = [];
    for (var i = 0; i < PRIVILEGED_JS.length; i++) {
      if (PRIVILEGED_JS[i].regex.test(text)) {
        privileged.push(PRIVILEGED_JS[i].id);
      }
    }
    return { dynamicCode: DYNAMIC_CODE_JS.test(text), privileged: privileged };
  };

  api.rawSqlPlaceholders = function (query) {
    var names = [];
    var regex = /\{\{([^{}]+)\}\}/g;
    var match = null;
    var text = str(query);
    while ((match = regex.exec(text)) !== null) {
      var name = match[1].trim();
      if (name.length && names.indexOf(name) === -1) {
        names.push(name);
      }
    }
    return names;
  };

  api.scanSymbols = function (text, relativePath, symbols) {
    var regex = /\$\{([^}=\s]+)(=([^}]*))?\}/g;
    var match = null;
    while ((match = regex.exec(text)) !== null) {
      var name = match[1];
      var entry = symbols[name];
      if (!entry) {
        entry = symbols[name] = { name: name, inlineDefault: false, files: [] };
      }
      if (match[3] != null && String(match[3]).trim().length > 0) {
        entry.inlineDefault = true;
      }
      if (entry.files.length < 5 && entry.files.indexOf(relativePath) === -1) {
        entry.files.push(relativePath);
      }
    }
  };

  api.scanFrontendSource = function (text, relativePath, frontend) {
    var perKind = {};
    for (var i = 0; i < FRONTEND_PATTERNS.length; i++) {
      var pattern = FRONTEND_PATTERNS[i];
      pattern.regex.lastIndex = 0;
      var count = 0;
      while (pattern.regex.exec(text) !== null) {
        count++;
      }
      if (count > 0) {
        if (!perKind[pattern.kind]) {
          perKind[pattern.kind] = { kind: pattern.kind, file: relativePath, patterns: [], count: 0 };
        }
        perKind[pattern.kind].patterns.push(pattern.id);
        perKind[pattern.kind].count += count;
      }
    }
    var kinds = Object.keys(perKind);
    for (var k = 0; k < kinds.length; k++) {
      frontend.signals.push(perKind[kinds[k]]);
    }
    var lines = text.split(/\r?\n/);
    for (var l = 0; l < lines.length; l++) {
      if (lines[l].indexOf("CallSequenceAction") === -1) {
        continue;
      }
      var target = /"requestable"\s*:\s*"(?:plain:)?([^"]+)"/.exec(lines[l]);
      if (target) {
        frontend.calls.push({ file: relativePath, target: target[1] });
      }
    }
  };

  function secretStatus(dbo, propertyName, value) {
    if (value == null || !str(value).length) {
      return "empty";
    }
    var source = null;
    try {
      source = dbo.getCompilablePropertySourceValue(propertyName);
    } catch (_ignore) {
      source = null;
    }
    if (source != null && str(source).indexOf("${") !== -1) {
      return "symbol";
    }
    return "literal";
  }

  var cipheredByClass = {};

  function cipheredPropertyNames(dbo) {
    var className = "";
    try {
      className = String(dbo.getClass().getName());
    } catch (_ignoreClass) {
      return [];
    }
    if (cipheredByClass[className]) {
      return cipheredByClass[className];
    }
    var names = [];
    try {
      var CachedIntrospector = Packages.com.twinsoft.convertigo.engine.util.CachedIntrospector;
      var descriptors = CachedIntrospector.getBeanInfo(dbo.getClass()).getPropertyDescriptors();
      for (var i = 0; i < descriptors.length; i++) {
        var name = String(descriptors[i].getName());
        if (dbo.isCipheredProperty(name) === true) {
          names.push({ name: name, getter: descriptors[i].getReadMethod() });
        }
      }
    } catch (_ignoreIntrospection) {}
    cipheredByClass[className] = names;
    return names;
  }

  function collectSecretProperties(dbo, model) {
    var names = cipheredPropertyNames(dbo);
    for (var i = 0; i < names.length; i++) {
      var value = null;
      try {
        value = names[i].getter ? names[i].getter.invoke(dbo) : null;
      } catch (_ignoreInvoke) {
        try {
          value = dbo[names[i].name];
        } catch (_ignoreBeanProperty) {
          value = null;
        }
      }
      model.secretProperties.push({
        qname: qnameOf(dbo),
        objectClass: simpleClassName(dbo),
        property: names[i].name,
        status: secretStatus(dbo, names[i].name, value)
      });
    }
  }

  function variableScope(className) {
    if (/^TestCase/.test(className)) {
      return "testCase";
    }
    if (/^Step/.test(className)) {
      return "step";
    }
    return "requestable";
  }

  function collectVariable(dbo, className, model) {
    var Visibility = Packages.com.twinsoft.convertigo.engine.enums.Visibility;
    var value = call(dbo, "getValueOrNull", null);
    var visibility = call(dbo, "getVisibility", 0);
    var logsMasked = false;
    try {
      logsMasked = Visibility.Logs.isMasked(visibility) === true;
    } catch (_ignoreVisibility) {}
    model.variables.push({
      qname: qnameOf(dbo),
      name: C8O.dbo.safeName(dbo),
      scope: variableScope(className),
      valueStatus: secretStatus(dbo, "value", value),
      logsMasked: logsMasked
    });
  }

  function collectStep(dbo, className, owner, model, requestable) {
    var step = { qname: qnameOf(dbo), owner: owner, stepClass: className, enabled: call(dbo, "isEnabled", true) !== false };
    if (className === "SimpleStep") {
      step.kind = "js";
      step.signals = api.scanJsSignals(call(dbo, "getExpression", ""));
    } else if (className === "ProcessExecStep") {
      step.kind = "processExec";
      step.dynamic = !api.isLiteralJsString(call(dbo, "getCommandLine", ""));
    } else if (FILE_STEP_PATH_GETTERS[className]) {
      step.kind = "file";
      step.dynamicProperties = [];
      var getters = FILE_STEP_PATH_GETTERS[className];
      for (var i = 0; i < getters.length; i++) {
        if (!api.isLiteralJsString(call(dbo, getters[i], ""))) {
          step.dynamicProperties.push(getters[i].replace(/^get/, "").replace(/^./, function (c) { return c.toLowerCase(); }));
        }
      }
      step.dynamic = step.dynamicProperties.length > 0;
    } else if (className === "SmtpStep") {
      step.kind = "smtp";
      step.dynamic = !api.isLiteralJsString(call(dbo, "getSmtpRecipients", ""));
    } else if (className === "SetAuthenticatedUserStep") {
      step.kind = "setAuthenticatedUser";
    } else if (className === "LDAPAuthenticationStep") {
      step.kind = "ldapAuth";
    } else if (has(dbo, "getSourceSequence")) {
      step.kind = "call";
      step.target = str(call(dbo, "getSourceSequence", ""));
    } else if (has(dbo, "getSourceTransaction")) {
      step.kind = "call";
      step.target = str(call(dbo, "getSourceTransaction", ""));
    } else {
      return;
    }
    if (step.kind === "call" && step.target.length && step.enabled && requestable.calls.indexOf(step.target) === -1) {
      requestable.calls.push(step.target);
    }
    model.steps.push(step);
  }

  /*
   * Preorder walk of one requestable subtree (steps, variables, test cases), so that
   * step order within a sequence matches execution order.
   */
  function walkRequestable(root, requestable, model, budget) {
    var stack = C8O.dbo.getDirectChildren(root).reverse();
    while (stack.length) {
      if (budget.count++ > MAX_OBJECTS) {
        model.collectionTruncated = true;
        return;
      }
      var dbo = stack.pop();
      var className = simpleClassName(dbo);
      if (/Variable$/.test(className)) {
        collectVariable(dbo, className, model);
      } else if (/Step$/.test(className)) {
        collectStep(dbo, className, requestable.qname, model, requestable);
        collectSecretProperties(dbo, model);
      }
      var children = C8O.dbo.getDirectChildren(dbo);
      for (var i = children.length - 1; i >= 0; i--) {
        stack.push(children[i]);
      }
    }
  }

  function baseRequestable(dbo, kind) {
    var accessibility = str(call(dbo, "getAccessibility", ""));
    return {
      qname: qnameOf(dbo),
      kind: kind,
      requestableClass: simpleClassName(dbo),
      accessibility: accessibility.length ? accessibility : (kind === "transaction" ? "Private" : "Public"),
      authenticatedContextRequired: call(dbo, "getAuthenticatedContextRequired", false) === true,
      secureConnectionRequired: call(dbo, "isSecureConnectionRequired", false) === true,
      responseCached: str(call(dbo, "getResponseExpiryDate", "")).trim().length > 0,
      authenticatedUserAsCacheKey: call(dbo, "isAuthenticatedUserAsCacheKey", false) === true,
      autoStart: call(dbo, "isAutoStart", false) === true,
      calls: []
    };
  }

  function collectTransaction(tx, model, budget) {
    var r = baseRequestable(tx, "transaction");
    if (has(tx, "getSqlQuery")) {
      r.rawSqlPlaceholders = api.rawSqlPlaceholders(call(tx, "getSqlQuery", ""));
    }
    if (has(tx, "getAllowedUriOverride")) {
      r.allowedUriOverride = str(call(tx, "getAllowedUriOverride", "deny"));
      r.allowUndeclaredHeaderOverride = call(tx, "isAllowUndeclaredHeaderOverride", false) === true;
      var rows = javaList(call(tx, "getHttpParameters", null));
      for (var i = 0; i < rows.length; i++) {
        var row = javaList(rows[i]);
        var header = str(row[0]);
        var value = str(row[1]);
        if (/^authorization$/i.test(header.trim()) && value.trim().length && value.indexOf("${") === -1) {
          model.staticAuthHeaders.push({ qname: r.qname, header: header.trim() });
        }
      }
    }
    if (has(tx, "getFullSyncAclPolicy")) {
      r.fullSyncAclPolicy = str(call(tx, "getFullSyncAclPolicy", ""));
    }
    model.requestables.push(r);
    walkRequestable(tx, r, model, budget);
  }

  function collectConnector(connector, model, budget) {
    var className = simpleClassName(connector);
    var entry = { qname: qnameOf(connector), connectorClass: className, type: "other" };
    if (has(connector, "getJdbcURL")) {
      entry.type = "sql";
    } else if (has(connector, "getAnonymousReplication")) {
      entry.type = "fullsync";
      entry.anonymousReplication = str(call(connector, "getAnonymousReplication", "deny"));
    } else if (has(connector, "isHttps") && has(connector, "getServer")) {
      entry.type = "http";
    }
    if (has(connector, "isHttps")) {
      entry.https = call(connector, "isHttps", false) === true;
      entry.server = str(call(connector, "getServer", ""));
    }
    if (has(connector, "isTrustAllServerCertificates")) {
      entry.trustAllServerCertificates = call(connector, "isTrustAllServerCertificates", false) === true;
    }
    model.connectors.push(entry);
    collectSecretProperties(connector, model);
    var transactions = javaList(call(connector, "getTransactionsList", null));
    for (var i = 0; i < transactions.length; i++) {
      collectTransaction(transactions[i], model, budget);
    }
  }

  function collectMappings(project, model) {
    var mapper = call(project, "getUrlMapper", null);
    if (mapper == null) {
      return;
    }
    var prefix = str(call(mapper, "getPrefix", ""));
    var mappings = javaList(call(mapper, "getMappingList", null));
    for (var i = 0; i < mappings.length; i++) {
      var path = prefix + str(call(mappings[i], "getPath", ""));
      var operations = javaList(call(mappings[i], "getOperationList", null));
      for (var j = 0; j < operations.length; j++) {
        model.mappings.push({
          qname: qnameOf(operations[j]),
          path: path,
          method: str(call(operations[j], "getMethod", "")),
          target: str(call(operations[j], "getTargetRequestable", ""))
        });
      }
    }
  }

  function collectReferences(project, model) {
    var references = javaList(call(project, "getReferenceList", null));
    for (var i = 0; i < references.length; i++) {
      var parser = call(references[i], "getParser", null);
      if (parser == null || call(parser, "isValid", false) !== true) {
        continue;
      }
      var url = str(call(parser, "getGitUrl", "")) || str(call(parser, "getProjectUrl", ""));
      var branch = str(call(parser, "getGitBranch", ""));
      var host = (/^[a-z]+:\/\/(?:[^@\/]*@)?([^\/:]+)/i.exec(url) || [])[1] || "";
      model.references.push({
        qname: qnameOf(references[i]),
        projectName: str(call(parser, "getProjectName", "")),
        autoPull: call(parser, "isAutoPull", false) === true,
        branch: branch,
        pinned: /^v?\d+(\.\d+)+([-.+][\w.]+)?$/.test(branch),
        insecureTransport: /^http:\/\//i.test(url) && !/^(localhost|127\.|\[::1\])/.test(host),
        embeddedCredentials: /^[a-z]+:\/\/[^\/@\s:]+:[^\/@\s]+@/i.test(url)
      });
    }
  }

  function collectEngine(model) {
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    var EnginePropertiesManager = Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager;
    var PropertyName = Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager.PropertyName;
    try {
      model.engine = {
        available: true,
        studioMode: Engine.isStudioMode() === true,
        corsPolicy: str(EnginePropertiesManager.getProperty(PropertyName.CORS_POLICY)),
        xsrfApi: str(EnginePropertiesManager.getProperty(PropertyName.XSRF_API)).toLowerCase() === "true",
        cryptoPassphraseDefault: str(EnginePropertiesManager.getProperty(PropertyName.CRYPTO_PASSPHRASE)) === str(PropertyName.CRYPTO_PASSPHRASE.getDefaultValue()),
        adminPasswordDefault: str(EnginePropertiesManager.getProperty(PropertyName.ADMIN_USERNAME)) === "admin" &&
          EnginePropertiesManager.checkProperty(PropertyName.ADMIN_PASSWORD, "admin") === true
      };
    } catch (engineError) {
      model.engine = { available: false };
      model.warnings.push("Engine properties unavailable: " + String(engineError));
    }
  }

  function collectSources(projectName, model, includeFrontend) {
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    var FileUtils = Packages.org.apache.commons.io.FileUtils;
    var File = Packages.java.io.File;
    var root = null;
    try {
      root = new File(String(Engine.projectDir(projectName)));
    } catch (_ignoreDir) {
      root = null;
    }
    if (root == null || !root.exists()) {
      model.warnings.push("Project directory not found; symbol and frontend scans skipped.");
      model.sourcesScanned = false;
      return;
    }
    var symbols = {};
    var files = [new File(root, "c8oProject.yaml")];
    var stack = [new File(root, "_c8oProject")];
    while (stack.length) {
      var dir = stack.pop();
      var listed = dir.exists() ? dir.listFiles() : null;
      if (listed == null) {
        continue;
      }
      for (var i = 0; i < listed.length; i++) {
        if (listed[i].isDirectory()) {
          stack.push(listed[i]);
        } else if (/\.yaml$/i.test(String(listed[i].getName()))) {
          files.push(listed[i]);
        }
      }
    }
    var rootPath = String(root.getAbsolutePath());
    var totalChars = 0;
    for (var f = 0; f < files.length; f++) {
      if (!files[f].isFile()) {
        continue;
      }
      var relative = String(files[f].getAbsolutePath()).substring(rootPath.length + 1).replace(/\\/g, "/");
      var text = "";
      try {
        text = String(FileUtils.readFileToString(files[f], "UTF-8"));
      } catch (_ignoreRead) {
        continue;
      }
      totalChars += text.length;
      if (totalChars > MAX_SOURCE_CHARS) {
        model.collectionTruncated = true;
        model.warnings.push("Source scan stopped after " + MAX_SOURCE_CHARS + " characters.");
        break;
      }
      api.scanSymbols(text, relative, symbols);
      if (includeFrontend && model.frontend.present && /^(_c8oProject\/mobile|c8oProject\.yaml$)/.test(relative)) {
        model.frontend.sources++;
        api.scanFrontendSource(text, relative, model.frontend);
      }
    }
    model.sourcesScanned = true;
    var names = Object.keys(symbols).sort();
    for (var n = 0; n < names.length; n++) {
      model.symbols.push(symbols[names[n]]);
    }
  }

  /*
   * Builds the normalized model for one project. Throws the standard resolve error when
   * the project is not loaded.
   */
  api.collect = function (projectName, options) {
    var opts = options || {};
    var project = C8O.dbo.resolve(projectName, { messagePrefix: "project" });
    var model = {
      project: {
        name: C8O.dbo.safeName(project),
        version: str(call(project, "getVersion", "")),
        corsOrigin: str(call(project, "getCorsOrigin", "=Global")),
        httpSessionTimeout: call(project, "getHttpSessionTimeout", null),
        contextTimeout: call(project, "getContextTimeout", null)
      },
      engine: null,
      requestables: [],
      steps: [],
      variables: [],
      secretProperties: [],
      staticAuthHeaders: [],
      connectors: [],
      mappings: [],
      references: [],
      symbols: [],
      frontend: { present: call(project, "getMobileApplication", null) != null, scanned: opts.includeFrontend !== false, sources: 0, signals: [], calls: [] },
      warnings: [],
      collectionTruncated: false
    };
    var budget = { count: 0 };
    var sequences = javaList(call(project, "getSequencesList", null));
    for (var i = 0; i < sequences.length; i++) {
      var r = baseRequestable(sequences[i], "sequence");
      model.requestables.push(r);
      walkRequestable(sequences[i], r, model, budget);
    }
    var connectors = javaList(call(project, "getConnectorsList", null));
    for (var c = 0; c < connectors.length; c++) {
      collectConnector(connectors[c], model, budget);
    }
    collectMappings(project, model);
    collectReferences(project, model);
    if (opts.includeEngine !== false) {
      collectEngine(model);
    }
    collectSources(model.project.name, model, opts.includeFrontend !== false);
    return model;
  };
})(C8O.securityAudit);
