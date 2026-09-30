/*
 * Security audit rules for project-security-audit.
 * Pure JavaScript: evaluates the normalized model built by security_audit_collect.js
 * and never touches engine APIs, so it runs unchanged under Rhino and Node tests.
 * Findings carry only property names, statuses and pattern names, never values.
 */
if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.securityAudit = C8O.securityAudit || {};

(function (api) {
  if (api._rulesInitialized === true) {
    return;
  }
  api._rulesInitialized = true;

  api.RULESET_VERSION = "2";
  api.SEVERITIES = ["info", "low", "medium", "high", "critical"];
  api.CATEGORIES = ["exposure", "auth", "secrets", "injection", "capabilities", "transport", "session", "supplychain", "frontend", "engine"];
  api.WEIGHTS = { critical: 25, high: 10, medium: 4, low: 1, info: 0 };
  api.RULE_CAPS = { critical: 40, high: 20, medium: 8, low: 3, info: 0 };
  api.GRADE_BANDS = [
    { grade: "A", min: 90 },
    { grade: "B", min: 75 },
    { grade: "C", min: 60 },
    { grade: "D", min: 40 },
    { grade: "F", min: 0 }
  ];
  api.LIMITATIONS = [
    "Static analysis: custom JavaScript, handlers and TypeScript are pattern-scanned, not executed.",
    "Authentication performed inside JavaScript (for example a bearer check) is not recognized; acknowledge such findings with suppress.",
    "Anonymous reachability follows SequenceStep and TransactionStep calls inside the audited project only; calls built in JavaScript or into other projects are not followed.",
    "Engine checks describe the engine running this audit, which may differ from the production server.",
    "Sensitive names are detected heuristically (password, secret, token, apiKey, authorization...)."
  ];

  var RULES = {
    "EXP-01": { category: "exposure", title: "Public sequence callable without authentication", recommendation: "Set accessibility to Private for helpers, or keep the sequence callable and set authenticatedContextRequired=true. A sequence without an accessibility line is Public." },
    "EXP-02": { category: "exposure", title: "Hidden sequence callable without authentication", recommendation: "Hidden only hides the sequence from the Test Platform and WSDL; any client can still call it. Set authenticatedContextRequired=true, or Private when only other requestables call it." },
    "EXP-03": { category: "exposure", title: "URL mapping target reachable without authentication", recommendation: "URL mappings ignore accessibility, even Private. Set authenticatedContextRequired=true on the target (optionally with a UrlMapper authentication), or verify credentials explicitly at the start of the target." },
    "EXP-04": { category: "exposure", title: "Transaction directly exposed to clients", recommendation: "Transactions default to Private. Keep them Private and expose a sequence facade that validates inputs and authentication." },
    "EXP-05": { category: "exposure", title: "Exposed HTTP transaction lets callers override the target", recommendation: "Keep allowedUriOverride=deny and allowUndeclaredHeaderOverride=false, or make the transaction Private, to prevent server-side request forgery." },
    "EXP-06": { category: "exposure", title: "Authenticated response cached without the user in the cache key", recommendation: "Enable authenticatedUserAsCacheKey, or remove responseExpiryDate, so one user's cached response is never served to another." },
    "AUTH-01": { category: "auth", title: "Authenticated user set without prior credential verification", recommendation: "Verify credentials (transaction, sequence, LDAP step or JavaScript check) before SetAuthenticatedUserStep. Generated auth_login skeletons accept any password." },
    "AUTH-02": { category: "auth", title: "FullSync data open to anonymous users", recommendation: "Set anonymousReplication=deny and use fromAuthenticatedUser or fromKeyC8oAcl ACL policies." },
    "AUTH-03": { category: "auth", title: "Client can set identity-provider or email parameters", recommendation: "Remove the variable from the exposed requestable and set the value server side from a symbol on the StepVariable of a Hidden facade. See convertigo://resources/convertigo-authentication." },
    "AUTH-04": { category: "auth", title: "Password hashed with SHA-1 or MD5", recommendation: "Move password handling to lib_UserManager. Code that must still hash passwords (such as an authentication library) uses a slow salted algorithm like bcrypt (org.bouncycastle.crypto.generators.OpenBSDBCrypt) and compares with MessageDigest.isEqual." },
    "AUTH-05": { category: "auth", title: "Logout keeps the HTTP session alive", recommendation: "Add a RemoveSessionStep after RemoveAuthenticatedUserStep and call the logout with __disableAutologin=true." },
    "AUTH-06": { category: "auth", title: "Application code hashes or verifies passwords", recommendation: "Keep email + password accounts in lib_UserManager and call it from a Hidden facade; do not store or verify credentials in application code. Suppress with a reason only when auditing the authentication library itself. See convertigo://resources/convertigo-authentication." },
    "SEC-01": { category: "secrets", title: "Credential stored as a literal in the project", recommendation: "Move the value to a symbol whose name ends with .secret (for example ${db.password.secret}). Ciphered project values are only as strong as the engine crypto.passphrase." },
    "SEC-02": { category: "secrets", title: "Sensitive symbol with an inline default value", recommendation: "Remove the inline default (${name=value}) and define the value in the engine global symbols, with a .secret suffix." },
    "SEC-03": { category: "secrets", title: "Sensitive variable with a literal default value", recommendation: "Remove the default value, or bind it to a .secret symbol. Test case values are exported with the project." },
    "SEC-04": { category: "secrets", title: "Sensitive variable not masked in logs", recommendation: "Set the variable visibility to 15 (Logs=1, Studio=2, Platform=4, XmlFile=8) so its value is never traced; an even value leaves it in the logs." },
    "SEC-05": { category: "secrets", title: "Static Authorization header in an HTTP transaction", recommendation: "Pass the credential through a .secret symbol or a masked variable instead of a literal header." },
    "SEC-06": { category: "secrets", title: "Sensitive symbol not stored ciphered", recommendation: "Rename the symbol with a .secret suffix so the engine stores it ciphered and masks it in the administration console." },
    "INJ-01": { category: "injection", title: "Raw SQL substitution {{variable}}", recommendation: "Use {variable} placeholders, which become prepared-statement parameters. {{variable}} is plain text replacement and allows SQL injection." },
    "INJ-02": { category: "injection", title: "Dynamic code evaluation in JavaScript", recommendation: "Avoid eval() and new Function(); parse data with JSON.parse and dispatch explicitly." },
    "CAP-01": { category: "capabilities", title: "Operating system command execution", recommendation: "Avoid ProcessExecStep in requestables; if unavoidable, keep the sequence Private, never build the command from input, and require authentication upstream." },
    "CAP-02": { category: "capabilities", title: "File system access with a computed path", recommendation: "Build file paths from a fixed base directory and validated identifiers; reject '..' and absolute paths coming from input." },
    "CAP-03": { category: "capabilities", title: "JavaScript uses privileged Java APIs", recommendation: "Review Runtime/ProcessBuilder/java.io usage; keep it out of anonymously reachable requestables and never pass request input to it." },
    "CAP-04": { category: "capabilities", title: "E-mail recipients computed at runtime", recommendation: "Restrict recipients to trusted values so the sequence cannot be used as an open mail relay." },
    "NET-01": { category: "transport", title: "TLS certificate validation disabled", recommendation: "Set trustAllServerCertificates=false and import the server certificate in the engine truststore instead." },
    "NET-02": { category: "transport", title: "Plain HTTP connection to a remote host", recommendation: "Enable https on the connector for any non-local server." },
    "NET-03": { category: "transport", title: "Permissive CORS policy with credentials", recommendation: "Set corsOrigin to the explicit list of allowed origins (url1#url2) and enable convertigo.xsrf.projects on the engine." },
    "SES-01": { category: "session", title: "Long session lifetime", recommendation: "Keep httpSessionTimeout and contextTimeout at or below one hour unless a longer session is a deliberate choice." },
    "SUP-01": { category: "supplychain", title: "Unpinned or insecure project reference", recommendation: "Reference a tag or released .car over HTTPS, disable autoPull on moving branches, and never embed credentials in the URL." },
    "FE-01": { category: "frontend", title: "Angular sanitization bypass or dynamic code in the frontend", recommendation: "Avoid bypassSecurityTrust*, direct innerHTML assignments and eval() on data that can come from users or the backend." },
    "FE-02": { category: "frontend", title: "Credential stored in browser localStorage", recommendation: "Rely on the Convertigo session cookie, or keep short-lived tokens in memory, instead of localStorage." },
    "FE-03": { category: "frontend", title: "Frontend calls a backend requestable that anyone can call", recommendation: "Confirm the target is meant to be anonymous; otherwise require authentication on it." },
    "ENG-01": { category: "engine", title: "Engine administrator uses the default password", recommendation: "Change admin.password (and admin.username) on every engine, including development ones." },
    "ENG-02": { category: "engine", title: "Engine crypto passphrase left at its default", recommendation: "Set crypto.passphrase to a private value before storing ciphered values; with the default, ciphered values in project YAML can be decrypted by anyone." },
    "ENG-03": { category: "engine", title: "Project XSRF protection disabled with an origin-echoing CORS policy", recommendation: "Enable convertigo.xsrf.projects, or restrict cors.policy to explicit origins." }
  };
  api.RULES = RULES;

  var SENSITIVE_NAME = /(passw(or)?d|pwd|secret|token|api[-_.]?key|private[-_.]?key|credential|authorization)/i;
  var NOT_SECRET_SUFFIX = /(id|ids|name|names|type|types|ttl|url|uri|count|label|labels|expiry|expires|expiresat|expiresin|seconds|days|length|hint|mode|kind|field|header|policy|endpoint|audience|issuer|scope|scopes|required|enabled|visible|mask)$/i;

  api.isSensitiveName = function (name) {
    var text = name == null ? "" : String(name).replace(/\.secret$/, "");
    return SENSITIVE_NAME.test(text) && !NOT_SECRET_SUFFIX.test(text);
  };

  api.severityRank = function (severity) {
    var index = api.SEVERITIES.indexOf(String(severity));
    return index < 0 ? 0 : index;
  };

  function raise(severity) {
    var index = api.severityRank(severity);
    return api.SEVERITIES[Math.min(index + 1, api.SEVERITIES.length - 1)];
  }

  function arr(value) {
    return Array.isArray(value) ? value : [];
  }

  function makeFinding(ruleId, severity, qname, evidence, extras) {
    var rule = RULES[ruleId];
    var finding = {
      ruleId: ruleId,
      severity: severity,
      category: rule.category,
      title: rule.title,
      qname: qname || "",
      evidence: evidence || {},
      recommendation: rule.recommendation,
      confidence: "high"
    };
    var keys = extras ? Object.keys(extras) : [];
    for (var i = 0; i < keys.length; i++) {
      finding[keys[i]] = extras[keys[i]];
    }
    return finding;
  }

  /*
   * Anonymous reachability: entry points are requestables callable from outside
   * (non-Private or URL-mapped) without authenticatedContextRequired. Reachability
   * then follows SequenceStep/TransactionStep calls, which bypass accessibility.
   */
  api.computeReachability = function (model) {
    var byQName = {};
    var requestables = arr(model.requestables);
    for (var i = 0; i < requestables.length; i++) {
      byQName[requestables[i].qname] = requestables[i];
    }
    var mapped = {};
    var mappings = arr(model.mappings);
    for (var m = 0; m < mappings.length; m++) {
      if (mappings[m].target) {
        mapped[mappings[m].target] = true;
      }
    }
    var reachable = {};
    var queue = [];
    for (var j = 0; j < requestables.length; j++) {
      var r = requestables[j];
      var exposed = r.accessibility !== "Private" || mapped[r.qname] === true;
      if (exposed && r.authenticatedContextRequired !== true) {
        reachable[r.qname] = { entry: r.qname, via: mapped[r.qname] === true && r.accessibility === "Private" ? "urlMapping" : "direct" };
        queue.push(r.qname);
      }
    }
    while (queue.length) {
      var current = byQName[queue.shift()];
      if (!current) {
        continue;
      }
      var calls = arr(current.calls);
      for (var c = 0; c < calls.length; c++) {
        var target = calls[c];
        if (!reachable[target] && byQName[target]) {
          reachable[target] = { entry: reachable[current.qname].entry, via: "call" };
          queue.push(target);
        }
      }
    }
    return { reachable: reachable, mapped: mapped, byQName: byQName };
  };

  function evaluateExposure(model, reach, out) {
    var requestables = arr(model.requestables);
    var hasAuthenticated = false;
    for (var i = 0; i < requestables.length; i++) {
      var r = requestables[i];
      if (r.authenticatedContextRequired === true) {
        hasAuthenticated = true;
      }
      var isMapped = reach.mapped[r.qname] === true;
      var anonymous = !!reach.reachable[r.qname];
      if (r.kind === "sequence" && r.authenticatedContextRequired !== true) {
        if (r.accessibility === "Public") {
          out.push(makeFinding("EXP-01", "high", r.qname, { accessibility: "Public", authenticatedContextRequired: false }, { anonymousReachable: true }));
        } else if (r.accessibility === "Hidden") {
          out.push(makeFinding("EXP-02", "high", r.qname, { accessibility: "Hidden", authenticatedContextRequired: false }, { anonymousReachable: true }));
        }
      }
      if (isMapped && r.authenticatedContextRequired !== true) {
        var privateTarget = r.accessibility === "Private";
        out.push(makeFinding("EXP-03", privateTarget ? "critical" : "high", r.qname, {
          accessibility: r.accessibility,
          authenticatedContextRequired: false,
          paths: arr(model.mappings).filter(function (mp) { return mp.target === r.qname; }).map(function (mp) { return mp.method + " " + mp.path; })
        }, { anonymousReachable: true, confidence: privateTarget ? "medium" : "high" }));
      }
      if (r.kind === "transaction" && r.accessibility !== "Private") {
        out.push(makeFinding("EXP-04", r.authenticatedContextRequired === true ? "low" : "medium", r.qname, { accessibility: r.accessibility, authenticatedContextRequired: r.authenticatedContextRequired === true }, { anonymousReachable: anonymous }));
      }
      if (r.kind === "transaction" && r.accessibility !== "Private" && (r.allowedUriOverride === "absolute" || r.allowUndeclaredHeaderOverride === true)) {
        out.push(makeFinding("EXP-05", anonymous ? "critical" : "high", r.qname, { allowedUriOverride: r.allowedUriOverride || "deny", allowUndeclaredHeaderOverride: r.allowUndeclaredHeaderOverride === true }, { anonymousReachable: anonymous }));
      }
      if (r.authenticatedContextRequired === true && r.responseCached === true && r.authenticatedUserAsCacheKey !== true) {
        out.push(makeFinding("EXP-06", "medium", r.qname, { responseExpiryDate: "set", authenticatedUserAsCacheKey: false }));
      }
      if (r.kind === "transaction" && r.fullSyncAclPolicy === "anonymous") {
        out.push(makeFinding("AUTH-02", anonymous ? "high" : "medium", r.qname, { fullSyncAclPolicy: "anonymous" }, { anonymousReachable: anonymous }));
      }
    }
    return hasAuthenticated;
  }

  function evaluateSteps(model, reach, out) {
    var steps = arr(model.steps);
    var verifiedBefore = {};
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      if (s.enabled === false) {
        continue;
      }
      var owner = s.owner;
      var anonymous = !!reach.reachable[owner];
      var extras = { anonymousReachable: anonymous, requestable: owner };
      if (s.kind === "call" || s.kind === "ldapAuth" || s.kind === "js") {
        verifiedBefore[owner] = true;
      }
      if (s.kind === "setAuthenticatedUser" && verifiedBefore[owner] !== true) {
        out.push(makeFinding("AUTH-01", anonymous ? "critical" : "medium", s.qname, { step: "SetAuthenticatedUserStep", precedingVerification: false }, extras));
      }
      if (s.kind === "processExec") {
        out.push(makeFinding("CAP-01", anonymous ? "critical" : "high", s.qname, { step: "ProcessExecStep", commandDynamic: s.dynamic === true }, extras));
      }
      if (s.kind === "file" && s.dynamic === true) {
        out.push(makeFinding("CAP-02", anonymous ? "high" : "medium", s.qname, { step: s.stepClass, pathProperties: arr(s.dynamicProperties) }, extras));
      }
      if (s.kind === "smtp" && s.dynamic === true) {
        out.push(makeFinding("CAP-04", anonymous ? "medium" : "low", s.qname, { step: "SmtpStep", recipients: "computed" }, extras));
      }
      if (s.kind === "js" && s.signals) {
        if (s.signals.dynamicCode === true) {
          out.push(makeFinding("INJ-02", anonymous ? "high" : "medium", s.qname, { patterns: ["eval/new Function"] }, extras));
        }
        if (s.signals.managesPassword === true) {
          out.push(makeFinding("AUTH-06", "medium", s.qname, { patterns: ["password hashing or comparison in JavaScript"] }, { anonymousReachable: anonymous, requestable: owner, confidence: "medium" }));
        }
        if (s.signals.weakPasswordHash === true) {
          out.push(makeFinding("AUTH-04", "medium", s.qname, { patterns: ["SHA-1/MD5 with a password"] }, { anonymousReachable: anonymous, requestable: owner, confidence: "medium" }));
        }
        var privileged = arr(s.signals.privileged);
        if (privileged.length) {
          out.push(makeFinding("CAP-03", anonymous ? "high" : "medium", s.qname, { patterns: privileged }, extras));
        }
      }
    }
  }

  var CLIENT_CONTROLLED_IDP_PARAM = /^(introspect_?url|redirect_?uri|client_?id|key_?secret|client_?secret|token_?endpoint|authorization_?endpoint|issuer|jwks_?uri|email_?(subject|body|logo)|target_?application_?name)$/i;

  var STORED_CREDENTIAL_PARAM = /^(pass(word)?_?hash|hash(ed)?_?pass(word)?|pwd_?hash|password_?salt)$/i;

  function evaluateAuthentication(model, reach, out) {
    var variables = arr(model.variables);
    var credentialOwners = {};
    for (var cv = 0; cv < variables.length; cv++) {
      var credential = variables[cv];
      if (credential.scope === "requestable" && STORED_CREDENTIAL_PARAM.test(String(credential.name || "")) && !credentialOwners[credential.owner]) {
        credentialOwners[credential.owner] = true;
        out.push(makeFinding("AUTH-06", "medium", credential.owner, { variable: credential.name, storesCredentials: true }, { anonymousReachable: !!reach.reachable[credential.owner], confidence: "medium" }));
      }
    }
    for (var v = 0; v < variables.length; v++) {
      var variable = variables[v];
      if (variable.scope !== "requestable" || !CLIENT_CONTROLLED_IDP_PARAM.test(String(variable.name || ""))) {
        continue;
      }
      var owner = reach.byQName[variable.owner];
      if (!owner || (owner.accessibility === "Private" && reach.mapped[owner.qname] !== true)) {
        continue;
      }
      var anonymous = !!reach.reachable[owner.qname];
      out.push(makeFinding("AUTH-03", anonymous ? "critical" : "medium", variable.qname, { variable: variable.name, requestable: owner.qname, accessibility: owner.accessibility, authenticatedContextRequired: owner.authenticatedContextRequired === true }, { anonymousReachable: anonymous }));
    }
    var steps = arr(model.steps);
    var logout = {};
    var order = [];
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      if (s.enabled === false) {
        continue;
      }
      var removes = s.kind === "removeUser" || (s.kind === "js" && s.signals && s.signals.removesUser === true);
      var ends = s.kind === "endSession" || (s.kind === "js" && s.signals && s.signals.endsSession === true);
      if (!removes && !ends) {
        continue;
      }
      if (!logout[s.owner]) {
        logout[s.owner] = { removes: false, ends: false };
        order.push(s.owner);
      }
      logout[s.owner].removes = logout[s.owner].removes || removes;
      logout[s.owner].ends = logout[s.owner].ends || ends;
    }
    for (var o = 0; o < order.length; o++) {
      if (logout[order[o]].removes && !logout[order[o]].ends) {
        out.push(makeFinding("AUTH-05", "low", order[o], { removesAuthenticatedUser: true, endsSession: false }));
      }
    }
  }

  function evaluateSecrets(model, out) {
    var props = arr(model.secretProperties);
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (p.status === "literal") {
        out.push(makeFinding("SEC-01", "high", p.qname, { property: p.property, objectClass: p.objectClass, status: "literal" }));
      }
    }
    var variables = arr(model.variables);
    for (var v = 0; v < variables.length; v++) {
      var variable = variables[v];
      if (!api.isSensitiveName(variable.name)) {
        continue;
      }
      if (variable.valueStatus === "literal") {
        out.push(makeFinding("SEC-03", "high", variable.qname, { variable: variable.name, scope: variable.scope, status: "literal" }, { confidence: "medium" }));
      }
      if (variable.scope === "requestable" && variable.logsMasked !== true) {
        out.push(makeFinding("SEC-04", "medium", variable.qname, { variable: variable.name, logsMasked: false }, { confidence: "medium" }));
      }
    }
    var headers = arr(model.staticAuthHeaders);
    for (var h = 0; h < headers.length; h++) {
      out.push(makeFinding("SEC-05", "medium", headers[h].qname, { header: headers[h].header, status: "literal" }));
    }
    var symbols = arr(model.symbols);
    for (var s = 0; s < symbols.length; s++) {
      var symbol = symbols[s];
      if (!api.isSensitiveName(symbol.name)) {
        continue;
      }
      if (symbol.inlineDefault === true) {
        out.push(makeFinding("SEC-02", "high", symbol.name, { symbol: symbol.name, files: arr(symbol.files), inlineDefault: true }, { confidence: "medium" }));
      }
      if (!/\.secret$/.test(symbol.name)) {
        out.push(makeFinding("SEC-06", "low", symbol.name, { symbol: symbol.name, files: arr(symbol.files) }, { confidence: "medium" }));
      }
    }
  }

  function evaluateInjection(model, reach, out) {
    var requestables = arr(model.requestables);
    for (var i = 0; i < requestables.length; i++) {
      var r = requestables[i];
      var raw = arr(r.rawSqlPlaceholders);
      if (raw.length) {
        var anonymous = !!reach.reachable[r.qname];
        out.push(makeFinding("INJ-01", anonymous ? "critical" : "high", r.qname, { property: "sqlQuery", placeholders: raw.map(function (n) { return "{{" + n + "}}"; }) }, { anonymousReachable: anonymous }));
      }
    }
  }

  function isLocalHost(server) {
    var text = String(server || "").toLowerCase();
    return !text.length || text === "localhost" || /^127\./.test(text) || text === "::1" || text === "[::1]" || /\.localhost$/.test(text);
  }

  function evaluateConnectors(model, out) {
    var connectors = arr(model.connectors);
    for (var i = 0; i < connectors.length; i++) {
      var c = connectors[i];
      if (c.trustAllServerCertificates === true) {
        out.push(makeFinding("NET-01", "high", c.qname, { trustAllServerCertificates: true }));
      }
      if (c.type === "http" && c.https === false && !isLocalHost(c.server)) {
        out.push(makeFinding("NET-02", "medium", c.qname, { https: false, remoteHost: true }));
      }
      if (c.anonymousReplication === "allow") {
        out.push(makeFinding("AUTH-02", "medium", c.qname, { anonymousReplication: "allow" }));
      }
    }
  }

  function evaluateProject(model, hasAuthenticated, out) {
    var project = model.project || {};
    var engine = model.engine || null;
    var declared = String(project.corsOrigin == null ? "=Global" : project.corsOrigin);
    var effective = declared;
    var resolved = true;
    if (declared === "=Global") {
      if (engine && engine.available === true && engine.corsPolicy != null) {
        effective = String(engine.corsPolicy);
      } else {
        effective = "=Origin";
        resolved = false;
      }
    }
    if (effective === "=Origin" || effective === "*") {
      var xsrfOff = !engine || engine.available !== true || engine.xsrfApi !== true;
      var severity = xsrfOff && hasAuthenticated ? "high" : "medium";
      out.push(makeFinding("NET-03", severity, project.name, {
        corsOrigin: declared,
        effectivePolicy: effective,
        xsrfProtection: engine && engine.available === true ? engine.xsrfApi === true : "unknown",
        authenticatedRequestables: hasAuthenticated
      }, { confidence: resolved ? "high" : "medium" }));
    }
    var session = Number(project.httpSessionTimeout);
    var contextTimeout = Number(project.contextTimeout);
    if ((!isNaN(session) && session > 3600) || (!isNaN(contextTimeout) && contextTimeout > 3600)) {
      out.push(makeFinding("SES-01", "low", project.name, { httpSessionTimeout: isNaN(session) ? null : session, contextTimeout: isNaN(contextTimeout) ? null : contextTimeout }));
    }
    var references = arr(model.references);
    for (var i = 0; i < references.length; i++) {
      var ref = references[i];
      if (ref.embeddedCredentials === true) {
        out.push(makeFinding("SUP-01", "high", ref.qname, { reference: ref.projectName, embeddedCredentials: true }));
      } else if (ref.insecureTransport === true || (ref.autoPull === true && ref.pinned !== true)) {
        out.push(makeFinding("SUP-01", "medium", ref.qname, { reference: ref.projectName, autoPull: ref.autoPull === true, branch: ref.branch || "", pinned: ref.pinned === true, insecureTransport: ref.insecureTransport === true }));
      }
    }
  }

  function evaluateFrontend(model, reach, out) {
    var frontend = model.frontend;
    if (!frontend || frontend.present !== true) {
      return;
    }
    var signals = arr(frontend.signals);
    for (var i = 0; i < signals.length; i++) {
      var sig = signals[i];
      if (sig.kind === "localStorageSecret") {
        out.push(makeFinding("FE-02", "medium", sig.file, { patterns: arr(sig.patterns), occurrences: sig.count }, { confidence: "medium" }));
      } else {
        out.push(makeFinding("FE-01", "medium", sig.file, { patterns: arr(sig.patterns), occurrences: sig.count }, { confidence: "medium" }));
      }
    }
    var calls = arr(frontend.calls);
    var seen = {};
    for (var c = 0; c < calls.length; c++) {
      var target = calls[c].target;
      if (seen[target] || !reach.reachable[target]) {
        continue;
      }
      seen[target] = true;
      out.push(makeFinding("FE-03", "info", target, { calledFrom: calls[c].file }, { anonymousReachable: true }));
    }
  }

  function evaluateEngine(model) {
    var out = [];
    var engine = model.engine;
    if (!engine || engine.available !== true) {
      return out;
    }
    if (engine.adminPasswordDefault === true) {
      out.push(makeFinding("ENG-01", "critical", "engine", { adminPasswordDefault: true, studioMode: engine.studioMode === true }));
    }
    if (engine.cryptoPassphraseDefault === true) {
      out.push(makeFinding("ENG-02", "high", "engine", { cryptoPassphraseDefault: true }));
    }
    if (engine.xsrfApi !== true && String(engine.corsPolicy) === "=Origin") {
      out.push(makeFinding("ENG-03", "medium", "engine", { xsrfProjects: false, corsPolicy: "=Origin" }));
    }
    return out;
  }

  api.evaluate = function (model) {
    var reach = api.computeReachability(model);
    var findings = [];
    var hasAuthenticated = evaluateExposure(model, reach, findings);
    evaluateSteps(model, reach, findings);
    evaluateAuthentication(model, reach, findings);
    evaluateSecrets(model, findings);
    evaluateInjection(model, reach, findings);
    evaluateConnectors(model, findings);
    evaluateProject(model, hasAuthenticated, findings);
    evaluateFrontend(model, reach, findings);
    return {
      findings: findings,
      engineFindings: evaluateEngine(model),
      reachableCount: Object.keys(reach.reachable).length
    };
  };

  api.normalizeSuppress = function (value) {
    var list = arr(value);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var entry = list[i];
      if (!entry || typeof entry !== "object" || !entry.ruleId) {
        continue;
      }
      out.push({
        ruleId: String(entry.ruleId),
        qname: entry.qname == null ? "" : String(entry.qname),
        reason: entry.reason == null ? "" : String(entry.reason)
      });
    }
    return out;
  };

  api.applySuppressions = function (findings, suppress) {
    var rules = api.normalizeSuppress(suppress);
    for (var i = 0; i < findings.length; i++) {
      var f = findings[i];
      for (var j = 0; j < rules.length; j++) {
        if (rules[j].ruleId === f.ruleId && (!rules[j].qname.length || rules[j].qname === f.qname)) {
          f.suppressed = true;
          f.suppressionReason = rules[j].reason;
          break;
        }
      }
    }
    return findings;
  };

  api.gradeFor = function (score) {
    for (var i = 0; i < api.GRADE_BANDS.length; i++) {
      if (score >= api.GRADE_BANDS[i].min) {
        return api.GRADE_BANDS[i].grade;
      }
    }
    return "F";
  };

  /*
   * Deterministic score: each rule deducts the sum of its findings' weights, capped by
   * the cap of the rule's most severe finding. Suppressed findings deduct nothing.
   * Any active critical finding caps the grade at D.
   */
  api.score = function (findings) {
    var byRule = {};
    var ruleOrder = [];
    var summary = { critical: 0, high: 0, medium: 0, low: 0, info: 0, suppressed: 0, byCategory: {} };
    var hasCritical = false;
    for (var i = 0; i < findings.length; i++) {
      var f = findings[i];
      if (f.suppressed === true) {
        summary.suppressed++;
        continue;
      }
      summary[f.severity]++;
      summary.byCategory[f.category] = (summary.byCategory[f.category] || 0) + 1;
      if (f.severity === "critical") {
        hasCritical = true;
      }
      if (!byRule[f.ruleId]) {
        byRule[f.ruleId] = { category: f.category, sum: 0, maxRank: 0 };
        ruleOrder.push(f.ruleId);
      }
      byRule[f.ruleId].sum += api.WEIGHTS[f.severity] || 0;
      byRule[f.ruleId].maxRank = Math.max(byRule[f.ruleId].maxRank, api.severityRank(f.severity));
    }
    var total = 0;
    var categoryDeduction = {};
    var ruleDeductions = {};
    for (var r = 0; r < ruleOrder.length; r++) {
      var entry = byRule[ruleOrder[r]];
      var cap = api.RULE_CAPS[api.SEVERITIES[entry.maxRank]];
      var deduction = Math.min(entry.sum, cap);
      total += deduction;
      categoryDeduction[entry.category] = (categoryDeduction[entry.category] || 0) + deduction;
      ruleDeductions[ruleOrder[r]] = { deduction: deduction, cap: cap, uncapped: entry.sum };
    }
    var score = Math.max(0, 100 - total);
    var grade = api.gradeFor(score);
    var cappedBy = "";
    if (hasCritical && api.GRADE_BANDS.map(function (b) { return b.grade; }).indexOf(grade) < 3) {
      grade = "D";
      cappedBy = "critical-finding";
    }
    var categories = [];
    for (var c = 0; c < api.CATEGORIES.length; c++) {
      var id = api.CATEGORIES[c];
      if (id === "engine") {
        continue;
      }
      var ded = categoryDeduction[id] || 0;
      categories.push({ id: id, score: Math.max(0, 100 - ded), deduction: ded, findings: summary.byCategory[id] || 0 });
    }
    return { score: score, grade: grade, gradeCappedBy: cappedBy, summary: summary, categories: categories, ruleDeductions: ruleDeductions };
  };

  function some(list, predicate) {
    var items = arr(list);
    for (var i = 0; i < items.length; i++) {
      if (predicate(items[i])) {
        return true;
      }
    }
    return false;
  }

  function isSequence(r) { return r.kind === "sequence"; }
  function isTransaction(r) { return r.kind === "transaction"; }
  function isHttpTransaction(r) { return r.kind === "transaction" && r.allowedUriOverride !== undefined; }
  function stepKind(kind) { return function (s) { return s.kind === kind; }; }

  /*
   * Returns "" when the audited model contains what a rule inspects, otherwise the
   * reason the rule could not apply. A rule that applied and found nothing passed.
   */
  api.ruleApplicability = function (ruleId, model) {
    var requestables = arr(model.requestables);
    var steps = arr(model.steps);
    var connectors = arr(model.connectors);
    var frontend = model.frontend || {};
    var noSequence = some(requestables, isSequence) ? "" : "No sequence in the project.";
    var noHttpTransaction = some(requestables, isHttpTransaction) ? "" : "No HTTP transaction in the project.";
    var noJsStep = some(steps, stepKind("js")) ? "" : "No JavaScript step in the project.";
    var noSources = model.sourcesScanned === false ? "Project sources could not be scanned." : "";
    var noFrontend = frontend.present !== true ? "No NGX mobile application in the project."
      : (frontend.scanned === false ? "Frontend scan disabled (includeFrontend=false)." : noSources);
    var noEngine = model.engine && model.engine.available === true ? "" : "Engine checks disabled or unavailable.";
    switch (ruleId) {
      case "EXP-01": case "EXP-02": case "CAP-01": case "CAP-02": return noSequence;
      case "EXP-03": return arr(model.mappings).length ? "" : "No URL mapping in the project.";
      case "EXP-04": return some(requestables, isTransaction) ? "" : "No transaction in the project.";
      case "EXP-05": case "SEC-05": return noHttpTransaction;
      case "EXP-06": return some(requestables, function (r) { return r.authenticatedContextRequired === true; }) ? "" : "No requestable requires an authenticated context.";
      case "AUTH-01": return some(steps, stepKind("setAuthenticatedUser")) ? "" : "No SetAuthenticatedUserStep in the project.";
      case "AUTH-02": return some(connectors, function (c) { return c.type === "fullsync"; }) || some(requestables, function (r) { return r.fullSyncAclPolicy !== undefined; }) ? "" : "No FullSync connector or ACL-driven transaction in the project.";
      case "AUTH-03": return some(model.variables, function (v) { return v.scope === "requestable"; }) ? "" : "No requestable input variable in the project.";
      case "AUTH-04": return noJsStep;
      case "AUTH-06": return noJsStep.length && !some(model.variables, function (v) { return v.scope === "requestable"; }) ? "No JavaScript step or requestable input variable in the project." : "";
      case "AUTH-05": return some(steps, function (s) { return s.kind === "removeUser" || (s.kind === "js" && s.signals && s.signals.removesUser === true); }) ? "" : "No logout in the project.";
      case "SEC-01": return arr(model.secretProperties).length ? "" : "No object with a ciphered credential property.";
      case "SEC-02": case "SEC-06": return noSources;
      case "SEC-03": case "SEC-04": return arr(model.variables).length ? "" : "No variable in the project.";
      case "INJ-01": return some(requestables, function (r) { return Array.isArray(r.rawSqlPlaceholders); }) ? "" : "No SQL transaction in the project.";
      case "INJ-02": case "CAP-03": return noJsStep;
      case "CAP-04": return some(steps, stepKind("smtp")) ? "" : "No SmtpStep in the project.";
      case "NET-01": return some(connectors, function (c) { return c.trustAllServerCertificates !== undefined; }) ? "" : "No connector with TLS settings.";
      case "NET-02": return some(connectors, function (c) { return c.type === "http"; }) ? "" : "No HTTP connector in the project.";
      case "SUP-01": return arr(model.references).length ? "" : "No project reference with a git or archive URL.";
      case "FE-01": case "FE-02": case "FE-03": return noFrontend;
      case "ENG-01": case "ENG-02": case "ENG-03": return noEngine;
      default: return "";
    }
  };

  /*
   * One entry per rule of the scope, independent of minSeverity and limit, so the
   * report reads as a complete checklist and the score is the sum of deductions.
   */
  api.ruleChecks = function (model, findings, scored, engineScope) {
    var checks = [];
    var counts = { passed: 0, failed: 0, info: 0, suppressed: 0, notApplicable: 0 };
    var ids = Object.keys(RULES);
    for (var i = 0; i < ids.length; i++) {
      var ruleId = ids[i];
      var rule = RULES[ruleId];
      if ((rule.category === "engine") !== (engineScope === true)) {
        continue;
      }
      var active = 0;
      var suppressed = 0;
      var maxRank = -1;
      for (var f = 0; f < findings.length; f++) {
        if (findings[f].ruleId !== ruleId) {
          continue;
        }
        if (findings[f].suppressed === true) {
          suppressed++;
        } else {
          active++;
          maxRank = Math.max(maxRank, api.severityRank(findings[f].severity));
        }
      }
      var reason = active + suppressed === 0 ? api.ruleApplicability(ruleId, model) : "";
      var status = active > 0 ? (maxRank > 0 ? "failed" : "info") : (suppressed > 0 ? "suppressed" : (reason.length ? "notApplicable" : "passed"));
      var deduction = scored.ruleDeductions[ruleId];
      var check = {
        ruleId: ruleId,
        category: rule.category,
        title: rule.title,
        status: status,
        findings: active,
        suppressed: suppressed,
        maxSeverity: maxRank >= 0 ? api.SEVERITIES[maxRank] : "",
        deduction: deduction ? deduction.deduction : 0,
        cap: deduction ? deduction.cap : 0
      };
      if (reason.length) {
        check.reason = reason;
      }
      if (status === "failed" || status === "info" || status === "suppressed") {
        check.recommendation = rule.recommendation;
      }
      counts[status]++;
      checks.push(check);
    }
    return { checks: checks, counts: counts };
  };

  api.sortFindings = function (findings) {
    return findings.slice().sort(function (a, b) {
      var suppressedOrder = (a.suppressed === true ? 1 : 0) - (b.suppressed === true ? 1 : 0);
      if (suppressedOrder !== 0) {
        return suppressedOrder;
      }
      var rank = api.severityRank(b.severity) - api.severityRank(a.severity);
      if (rank !== 0) {
        return rank;
      }
      if (a.ruleId !== b.ruleId) {
        return a.ruleId < b.ruleId ? -1 : 1;
      }
      return a.qname < b.qname ? -1 : (a.qname > b.qname ? 1 : 0);
    });
  };

  api.scoreModel = function () {
    return {
      start: 100,
      weights: api.WEIGHTS,
      perRuleCaps: api.RULE_CAPS,
      gradeBands: api.GRADE_BANDS,
      gradeCap: "Any active critical finding caps the grade at D."
    };
  };

  /*
   * Builds the tool result from a collected model. Pure, so tests can drive it.
   */
  api.buildReport = function (model, options) {
    var opts = options || {};
    var minRank = api.severityRank(opts.minSeverity || "low");
    var limit = opts.limit > 0 ? opts.limit : 200;
    var evaluation = api.evaluate(model);
    var findings = api.sortFindings(api.applySuppressions(evaluation.findings, opts.suppress));
    var scored = api.score(findings);
    var rules = api.ruleChecks(model, findings, scored, false);
    scored.summary.rules = rules.counts;
    var listed = findings.filter(function (f) { return api.severityRank(f.severity) >= minRank; });
    var report = {
      project: (model.project && model.project.name) || "",
      projectVersion: (model.project && model.project.version) || "",
      rulesetVersion: api.RULESET_VERSION,
      auditedAt: opts.auditedAt || "",
      score: scored.score,
      grade: scored.grade,
      gradeCappedBy: scored.gradeCappedBy,
      summary: scored.summary,
      categories: scored.categories,
      rules: rules.checks,
      findings: listed.slice(0, limit),
      coverage: {
        requestables: (model.requestables || []).length,
        steps: (model.steps || []).length,
        connectors: (model.connectors || []).length,
        mappings: (model.mappings || []).length,
        mobileSources: model.frontend && model.frontend.present ? model.frontend.sources || 0 : 0,
        anonymousReachable: evaluation.reachableCount,
        findingsTotal: findings.length,
        findingsListed: Math.min(listed.length, limit),
        truncated: listed.length > limit,
        collectionTruncated: model.collectionTruncated === true
      },
      scoreModel: api.scoreModel(),
      limitations: api.LIMITATIONS.slice(),
      warnings: (model.warnings || []).slice(0, 20)
    };
    if (opts.includeEngine !== false && model.engine && model.engine.available === true) {
      var engineFindings = api.sortFindings(api.applySuppressions(evaluation.engineFindings, opts.suppress));
      var engineScore = api.score(engineFindings);
      report.engine = {
        score: engineScore.score,
        grade: engineScore.grade,
        gradeCappedBy: engineScore.gradeCappedBy,
        studioMode: model.engine.studioMode === true,
        rules: api.ruleChecks(model, engineFindings, engineScore, true).checks,
        findings: engineFindings
      };
    }
    return report;
  };
})(C8O.securityAudit);
