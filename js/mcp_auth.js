if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.mcpAuth = C8O.mcpAuth || {};

(function () {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var Role = Packages.com.twinsoft.convertigo.engine.AuthenticatedSessionManager.Role;
  var SessionKey = Packages.com.twinsoft.convertigo.engine.AuthenticatedSessionManager.SessionKey;
  var InternalRequester = Packages.com.twinsoft.convertigo.engine.requesters.InternalRequester;
  var XMLUtils = Packages.com.twinsoft.convertigo.engine.util.XMLUtils;
  var JsonOutput = Packages.com.twinsoft.convertigo.engine.enums.JsonOutput;
  var File = Packages.java.io.File;
  var Files = Packages.java.nio.file.Files;
  var StandardCharsets = Packages.java.nio.charset.StandardCharsets;
  var StandardOpenOption = Packages.java.nio.file.StandardOpenOption;
  var StandardCopyOption = Packages.java.nio.file.StandardCopyOption;
  var AtomicMoveNotSupportedException = Packages.java.nio.file.AtomicMoveNotSupportedException;
  var Base64 = Packages.java.util.Base64;
  var SecureRandom = Packages.java.security.SecureRandom;
  var MessageDigest = Packages.java.security.MessageDigest;
  var Mac = Packages.javax.crypto.Mac;
  var SecretKeySpec = Packages.javax.crypto.spec.SecretKeySpec;
  var UUID = Packages.java.util.UUID;
  var HashMap = Packages.java.util.HashMap;
  var SimpleDateFormat = Packages.java.text.SimpleDateFormat;
  var TimeZone = Packages.java.util.TimeZone;

  var ISSUER = "lib_ConvertigoMCP";
  var AUDIENCE = "ConvertigoMCP";
  var DEFAULT_DURABLE_DAYS = 365;
  var MAX_DURABLE_DAYS = 3650;
  var DEFAULT_MANAGED_SECONDS = 7200;
  var MIN_MANAGED_SECONDS = 300;
  var MAX_MANAGED_SECONDS = 86400;
  var LAST_USED_WRITE_INTERVAL_MS = 300000;

  function trim(value) {
    return value === null || typeof value === "undefined"
      ? ""
      : String(value).replace(/^\s+|\s+$/g, "");
  }

  function bytes(value) {
    return new java.lang.String(String(value)).getBytes(StandardCharsets.UTF_8);
  }

  function base64UrlBytes(value) {
    return String(Base64.getUrlEncoder().withoutPadding().encodeToString(value));
  }

  function base64Url(value) {
    return base64UrlBytes(bytes(value));
  }

  function decodeBase64Url(value) {
    return String(new java.lang.String(Base64.getUrlDecoder().decode(String(value)), StandardCharsets.UTF_8));
  }

  function randomBase64Url(size) {
    var random = new SecureRandom();
    var data = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, size);
    random.nextBytes(data);
    return base64UrlBytes(data);
  }

  function signBytes(data, secret) {
    var mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(bytes(secret), "HmacSHA256"));
    return mac.doFinal(bytes(data));
  }

  function sign(data, secret) {
    return base64UrlBytes(signBytes(data, secret));
  }

  function signaturesEqual(actual, expected) {
    try {
      return MessageDigest.isEqual(
        Base64.getUrlDecoder().decode(String(actual)),
        Base64.getUrlDecoder().decode(String(expected))
      );
    } catch (_invalidSignatureEncoding) {
      return false;
    }
  }

  function sha256(value) {
    var digest = MessageDigest.getInstance("SHA-256");
    return base64UrlBytes(digest.digest(bytes(value)));
  }

  function isoDate(ms) {
    var format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
    format.setTimeZone(TimeZone.getTimeZone("UTC"));
    return String(format.format(new java.util.Date(ms)));
  }

  function parseIsoDate(value) {
    var text = trim(value);
    if (!text.length) {
      return 0;
    }
    try {
      return Number(java.time.Instant.parse(text).toEpochMilli());
    } catch (_invalidDate) {
      return 0;
    }
  }

  function rootDirectory() {
    var override = trim(Packages.java.lang.System.getProperty("convertigo.mcp.jwt.path"));
    return override.length
      ? new File(override)
      : new File(new File(String(Engine.USER_WORKSPACE_PATH), "jwt"), "mcp");
  }

  function legacyRootDirectory() {
    var override = trim(Packages.java.lang.System.getProperty("convertigo.mcp.jwt.path"));
    return override.length ? rootDirectory() : new File(String(Engine.USER_WORKSPACE_PATH), "mcp");
  }

  function keysDirectory(root) {
    return new File(root || rootDirectory(), "keys");
  }

  function activeDirectory(root) {
    return new File(new File(root || rootDirectory(), "tokens"), "active");
  }

  function revokedDirectory(root) {
    return new File(new File(root || rootDirectory(), "tokens"), "revoked");
  }

  function tokenRoots() {
    var canonical = rootDirectory();
    var legacy = legacyRootDirectory();
    return String(canonical.getAbsolutePath()) === String(legacy.getAbsolutePath())
      ? [canonical]
      : [canonical, legacy];
  }

  function ensureDirectory(directory) {
    if (!directory.isDirectory() && !directory.mkdirs() && !directory.isDirectory()) {
      throw new Error("Unable to create MCP token directory: " + directory.getAbsolutePath());
    }
    return directory;
  }

  function protectFile(file) {
    try {
      file.setReadable(false, false);
      file.setWritable(false, false);
      file.setExecutable(false, false);
      file.setReadable(true, true);
      file.setWritable(true, true);
    } catch (_permissionsUnsupported) {}
  }

  function readText(file) {
    return String(new java.lang.String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
  }

  function writeCreateOnly(file, content) {
    ensureDirectory(file.getParentFile());
    Files.write(
      file.toPath(),
      bytes(content),
      StandardOpenOption.CREATE_NEW,
      StandardOpenOption.WRITE
    );
    protectFile(file);
  }

  function atomicWrite(file, content) {
    ensureDirectory(file.getParentFile());
    var temporary = new File(file.getParentFile(), file.getName() + ".tmp-" + String(UUID.randomUUID()));
    try {
      writeCreateOnly(temporary, content);
      try {
        Files.move(
          temporary.toPath(),
          file.toPath(),
          StandardCopyOption.ATOMIC_MOVE,
          StandardCopyOption.REPLACE_EXISTING
        );
      } catch (moveError) {
        if (!(moveError instanceof AtomicMoveNotSupportedException)) {
          var className = "";
          try {
            className = String(moveError.getClass().getName());
          } catch (_ignoreMoveClass) {}
          if (className.indexOf("AtomicMoveNotSupportedException") === -1) {
            throw moveError;
          }
        }
        Files.move(temporary.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING);
      }
      protectFile(file);
    } finally {
      try {
        if (temporary.exists()) {
          temporary.delete();
        }
      } catch (_ignoreTempDelete) {}
    }
  }

  function signingKeyFile() {
    return new File(keysDirectory(), "signing-current.key");
  }

  function signingKey() {
    var file = signingKeyFile();
    if (file.isFile()) {
      var existing = trim(readText(file));
      if (existing.length >= 32) {
        return existing;
      }
      throw new Error("The MCP signing key is invalid.");
    }
    ensureDirectory(keysDirectory());
    var candidate = "";
    var legacyFile = new File(keysDirectory(legacyRootDirectory()), "signing-current.key");
    if (legacyFile.isFile()) {
      candidate = trim(readText(legacyFile));
      if (candidate.length < 32) {
        throw new Error("The legacy MCP signing key is invalid.");
      }
    } else {
      candidate = randomBase64Url(64);
    }
    try {
      writeCreateOnly(file, candidate + "\n");
      return candidate;
    } catch (createError) {
      if (file.isFile()) {
        var raced = trim(readText(file));
        if (raced.length >= 32) {
          return raced;
        }
      }
      throw createError;
    }
  }

  function safeIdentifier(value) {
    var text = trim(value);
    return /^[A-Za-z0-9_-]{8,160}$/.test(text) ? text : "";
  }

  function tokenFile(directory, tokenId) {
    var safe = safeIdentifier(tokenId);
    if (!safe.length) {
      throw new Error("Invalid MCP token identifier.");
    }
    return new File(directory, safe + ".json");
  }

  function parseJsonFile(file) {
    return JSON.parse(readText(file));
  }

  function publicRecord(record) {
    record = record || {};
    var revoked = trim(record.revokedAt).length > 0;
    var expiration = parseIsoDate(record.expiresAt);
    return {
      id: trim(record.id),
      name: trim(record.name),
      kind: trim(record.kind) || "durable",
      scope: trim(record.scope) || "mcp:full",
      createdAt: trim(record.createdAt),
      expiresAt: trim(record.expiresAt),
      lastUsedAt: trim(record.lastUsedAt),
      revokedAt: trim(record.revokedAt),
      createdBy: trim(record.createdBy),
      status: revoked ? "revoked" : (expiration > 0 && java.lang.System.currentTimeMillis() >= expiration ? "expired" : "active")
    };
  }

  function currentAdminUser(contextObject) {
    var user = "";
    try {
      user = trim(contextObject.getAuthenticatedUser());
    } catch (_ignoreAuthenticatedUser) {}
    if (!user.length) {
      try {
        var request = contextObject.httpServletRequest;
        var session = request === null ? null : request.getSession(false);
        var value = session === null ? null : session.getAttribute(SessionKey.ADMIN_USER.toString());
        user = trim(value);
      } catch (_ignoreAdminUser) {}
    }
    return user.length ? user : "studio-admin";
  }

  function isWebAdmin(contextObject) {
    try {
      var request = contextObject && contextObject.httpServletRequest;
      var session = request === null ? null : request.getSession(false);
      return session !== null && Engine.authenticatedSessionManager.hasRole(session, Role.WEB_ADMIN);
    } catch (_notAdmin) {
      return false;
    }
  }

  function requireWebAdmin(contextObject) {
    if (!isWebAdmin(contextObject)) {
      var error = new Error("A WEB_ADMIN session is required.");
      error.code = "forbidden";
      throw error;
    }
  }

  function isStudioMode() {
    try {
      return Engine.isStudioMode() === true;
    } catch (_studioModeUnavailable) {
      return false;
    }
  }

  function endpointUrl(contextObject) {
    try {
      var base = trim(contextObject.getConvertigoUrl()).replace(/\/+$/g, "");
      if (base.length) {
        return base + "/api/mcp";
      }
    } catch (_ignoreConvertigoUrl) {}
    return "http://localhost:18080/convertigo/api/mcp";
  }

  function buildToken(header, payload, secret) {
    var signingInput = base64Url(JSON.stringify(header)) + "." + base64Url(JSON.stringify(payload));
    return signingInput + "." + sign(signingInput, secret);
  }

  function createResultError(code, message) {
    return {
      status: "error",
      error: {
        code: String(code || "mcp_token_error"),
        message: String(message || "MCP token operation failed.")
      }
    };
  }

  function tokenLabel(value, fallback) {
    var label = trim(value);
    if (!label.length) {
      label = fallback;
    }
    return label.length > 100 ? label.substring(0, 100) : label;
  }

  function boundedInteger(value, fallback, minimum, maximum) {
    var parsed = parseInt(trim(value), 10);
    if (isNaN(parsed)) {
      parsed = fallback;
    }
    return Math.max(minimum, Math.min(maximum, parsed));
  }

  function createDurable(contextObject, name, expiresInDays) {
    try {
      requireWebAdmin(contextObject);
      var label = tokenLabel(name, "");
      if (!label.length) {
        return createResultError("missing_token_name", "A token label is required.");
      }
      var days = boundedInteger(expiresInDays, DEFAULT_DURABLE_DAYS, 1, MAX_DURABLE_DAYS);
      var nowMs = java.lang.System.currentTimeMillis();
      var nowSeconds = Math.floor(nowMs / 1000);
      var expiresSeconds = nowSeconds + days * 86400;
      var tokenId = "mcp_" + String(UUID.randomUUID()).replace(/-/g, "");
      var jti = String(UUID.randomUUID());
      var record = {
        id: tokenId,
        name: label,
        kind: "durable",
        scope: "mcp:full",
        jtiHash: sha256(jti),
        createdAt: isoDate(nowMs),
        expiresAt: isoDate(expiresSeconds * 1000),
        lastUsedAt: "",
        revokedAt: "",
        createdBy: currentAdminUser(contextObject)
      };
      var secret = signingKey();
      var active = tokenFile(ensureDirectory(activeDirectory()), tokenId);
      writeCreateOnly(active, JSON.stringify(record, null, 2) + "\n");
      var token = buildToken(
        { alg: "HS256", typ: "JWT", kid: tokenId },
        {
          iss: ISSUER,
          aud: AUDIENCE,
          sub: record.createdBy,
          jti: jti,
          kind: "durable",
          scope: "mcp:full",
          iat: nowSeconds,
          nbf: nowSeconds,
          exp: expiresSeconds
        },
        secret
      );
      return {
        status: "ok",
        token: token,
        tokenInfo: publicRecord(record),
        tokens: listRecords(),
        mcpUrl: endpointUrl(contextObject),
        tokenEnvironmentVariable: "CONVERTIGO_MCP_TOKEN",
        instructions: "Copy this token now. It will not be shown again."
      };
    } catch (error) {
      return createResultError(error.code || "token_creation_failed", String(error.message || error));
    }
  }

  function createManaged(contextObject, label, ttlSeconds) {
    try {
      requireWebAdmin(contextObject);
      var lifetime = boundedInteger(ttlSeconds, DEFAULT_MANAGED_SECONDS, MIN_MANAGED_SECONDS, MAX_MANAGED_SECONDS);
      var nowSeconds = Math.floor(java.lang.System.currentTimeMillis() / 1000);
      var tokenId = "managed_" + String(UUID.randomUUID()).replace(/-/g, "");
      var token = buildToken(
        { alg: "HS256", typ: "JWT", kid: tokenId },
        {
          iss: ISSUER,
          aud: AUDIENCE,
          sub: currentAdminUser(contextObject),
          jti: String(UUID.randomUUID()),
          kind: "managed",
          label: tokenLabel(label, "Convertigo Assistant"),
          scope: "mcp:full",
          iat: nowSeconds,
          nbf: nowSeconds,
          exp: nowSeconds + lifetime
        },
        signingKey()
      );
      return {
        status: "ok",
        token: token,
        tokenInfo: {
          id: tokenId,
          name: tokenLabel(label, "Convertigo Assistant"),
          kind: "managed",
          scope: "mcp:full",
          createdAt: isoDate(nowSeconds * 1000),
          expiresAt: isoDate((nowSeconds + lifetime) * 1000),
          status: "active"
        },
        mcpUrl: endpointUrl(contextObject)
      };
    } catch (error) {
      return createResultError(error.code || "managed_token_creation_failed", String(error.message || error));
    }
  }

  function filesIn(directory) {
    if (!directory.isDirectory()) {
      return [];
    }
    var files = directory.listFiles();
    var result = [];
    if (files !== null) {
      for (var i = 0; i < files.length; i++) {
        if (files[i].isFile() && /\.json$/.test(String(files[i].getName()))) {
          result.push(files[i]);
        }
      }
    }
    return result;
  }

  function listRecords() {
    var byId = {};
    var roots = tokenRoots();
    var directories = [];
    for (var rootIndex = 0; rootIndex < roots.length; rootIndex++) {
      directories.push(activeDirectory(roots[rootIndex]));
      directories.push(revokedDirectory(roots[rootIndex]));
    }
    for (var d = 0; d < directories.length; d++) {
      var files = filesIn(directories[d]);
      for (var i = 0; i < files.length; i++) {
        try {
          var record = parseJsonFile(files[i]);
          if (d % 2 === 1 && !trim(record.revokedAt).length) {
            record.revokedAt = isoDate(files[i].lastModified());
          }
          var item = publicRecord(record);
          if (item.id.length && (!byId[item.id] || d % 2 === 1)) {
            byId[item.id] = item;
          }
        } catch (_invalidRecord) {}
      }
    }
    var result = [];
    for (var id in byId) {
      if (Object.prototype.hasOwnProperty.call(byId, id)) {
        result.push(byId[id]);
      }
    }
    result.sort(function (left, right) {
      return String(right.createdAt).localeCompare(String(left.createdAt));
    });
    return result;
  }

  function adminStatus(contextObject) {
    var authorized = isWebAdmin(contextObject);
    var studioMode = isStudioMode();
    return {
      status: authorized ? "ok" : "forbidden",
      authorized: authorized,
      studioMode: studioMode,
      localSetupAvailable: authorized && studioMode,
      storagePath: authorized ? String(rootDirectory().getAbsolutePath()) : "",
      mcpUrl: endpointUrl(contextObject),
      tokens: authorized ? listRecords() : [],
      error: authorized ? null : {
        code: "forbidden",
        message: "A WEB_ADMIN session is required."
      }
    };
  }

  function list(contextObject) {
    try {
      requireWebAdmin(contextObject);
      return {
        status: "ok",
        mcpUrl: endpointUrl(contextObject),
        tokenEnvironmentVariable: "CONVERTIGO_MCP_TOKEN",
        tokens: listRecords()
      };
    } catch (error) {
      return createResultError(error.code || "token_list_failed", String(error.message || error));
    }
  }

  function revoke(contextObject, tokenId) {
    try {
      requireWebAdmin(contextObject);
      var roots = tokenRoots();
      var active = null;
      var revokedExisting = null;
      for (var rootIndex = 0; rootIndex < roots.length; rootIndex++) {
        var activeCandidate = tokenFile(activeDirectory(roots[rootIndex]), tokenId);
        var revokedCandidate = tokenFile(revokedDirectory(roots[rootIndex]), tokenId);
        if (active === null && activeCandidate.isFile()) {
          active = activeCandidate;
        }
        if (revokedExisting === null && revokedCandidate.isFile()) {
          revokedExisting = revokedCandidate;
        }
      }
      if (active === null) {
        if (revokedExisting !== null) {
          return {
            status: "ok",
            token: publicRecord(parseJsonFile(revokedExisting)),
            tokens: listRecords()
          };
        }
        return createResultError("token_not_found", "MCP token was not found.");
      }
      var record = parseJsonFile(active);
      record.revokedAt = trim(record.revokedAt) || isoDate(java.lang.System.currentTimeMillis());
      var revoked = tokenFile(ensureDirectory(revokedDirectory()), tokenId);
      atomicWrite(revoked, JSON.stringify(record, null, 2) + "\n");
      if (!active.delete() && active.exists()) {
        throw new Error("Unable to remove the active token record after revocation.");
      }
      return {
        status: "ok",
        token: publicRecord(record),
        tokens: listRecords()
      };
    } catch (error) {
      return createResultError(error.code || "token_revoke_failed", String(error.message || error));
    }
  }

  function unwrapSequenceResult(response) {
    if (response && response.document && response.document.result) {
      return response.document.result;
    }
    if (response && response.doc && response.doc.document && response.doc.document.result) {
      return response.doc.document.result;
    }
    if (response && response.result) {
      return response.result;
    }
    return response;
  }

  function callSequence(contextObject, project, sequence, variables) {
    var params = new HashMap();
    var projectArray = java.lang.reflect.Array.newInstance(java.lang.String, 1);
    projectArray[0] = String(project);
    params.put("__project", projectArray);
    params.put("__sequence", String(sequence));
    params.put("__context", "mcpAuth_" + String(UUID.randomUUID()));
    variables = variables || {};
    for (var key in variables) {
      if (Object.prototype.hasOwnProperty.call(variables, key) && variables[key] !== null && typeof variables[key] !== "undefined") {
        params.put(key, variables[key]);
      }
    }
    var requester = new InternalRequester(params, contextObject.httpServletRequest);
    try {
      var response = requester.processRequest();
      var json = JSON.parse(XMLUtils.XmlToJson(response.getDocumentElement(), true, true, JsonOutput.JsonRoot.docNode).toString());
      return unwrapSequenceResult(json);
    } finally {
      try {
        Engine.theApp.contextManager.remove(requester.getContext());
      } catch (_ignoreContextCleanup) {}
    }
  }

  function setupLocalAgent(contextObject, agent, token) {
    try {
      requireWebAdmin(contextObject);
      if (!isStudioMode()) {
        return createResultError(
          "local_setup_unavailable",
          "Local agent setup is available only when this application runs from Convertigo Studio on the same workstation."
        );
      }
      var validation = validate(token, contextObject);
      if (!validation || validation.authenticated !== true) {
        return validation && validation.error
          ? createResultError(validation.error.code, validation.error.message)
          : createResultError("invalid_token", "The MCP bearer token is invalid.");
      }
      var normalizedAgent = trim(agent).toLowerCase();
      var sequence;
      var variables = {
        mcpUrl: endpointUrl(contextObject),
        mcpToken: trim(token)
      };
      if (normalizedAgent === "codex") {
        sequence = "_setupCodex";
      } else if (normalizedAgent === "vibe") {
        sequence = "_setupVibe";
        variables.replaceConfig = false;
      } else {
        return createResultError("unsupported_agent", "Choose Codex or Vibe for local setup.");
      }
      var setup = callSequence(contextObject, "lib_ConvertigoMCP", sequence, variables) || {};
      if (String(setup.status || "").toLowerCase() === "error") {
        return setup;
      }
      return {
        status: "ok",
        agent: normalizedAgent,
        configStatus: trim(setup.configStatus),
        configPath: trim(setup.configPath),
        tokenConfigured: setup.tokenConfigured === true || String(setup.tokenConfigured) === "true",
        warnings: setup.warnings || [],
        message: normalizedAgent === "codex"
          ? "Codex is configured. Restart Codex before using the Convertigo MCP server."
          : "Vibe is configured. Restart Vibe before using the Convertigo MCP server."
      };
    } catch (error) {
      return createResultError(error.code || "local_setup_failed", String(error.message || error));
    }
  }

  function invalid(code, message) {
    return {
      status: "error",
      authenticated: false,
      error: {
        code: String(code || "invalid_token"),
        message: String(message || "MCP token is invalid.")
      }
    };
  }

  function validateC8oForms(contextObject, parts, header, payload) {
    try {
      var validation = callSequence(contextObject, "C8Oforms", "APIV2_McpTokenValidate", {
        headerJson: JSON.stringify(header),
        payloadJson: JSON.stringify(payload),
        signingInput: parts[0] + "." + parts[1],
        signature: parts[2]
      });
      if (validation && String(validation.status) === "ok" && (validation.authenticated === true || String(validation.authenticated) === "true")) {
        return {
          status: "ok",
          authenticated: true,
          kind: "nocode",
          scope: trim(validation.payload && validation.payload.scope) || "forms:write",
          user: trim(validation.user || (validation.payload && validation.payload.user)),
          payload: validation.payload || payload
        };
      }
      var error = validation && validation.error ? validation.error : {};
      return invalid(error.code || "invalid_token", error.message || "The C8Oforms MCP token is invalid.");
    } catch (error) {
      return invalid("invalid_nocode_token", String(error.message || error));
    }
  }

  function updateLastUsed(file, record, nowMs) {
    var previous = parseIsoDate(record.lastUsedAt);
    if (previous > 0 && nowMs - previous < LAST_USED_WRITE_INTERVAL_MS) {
      return;
    }
    record.lastUsedAt = isoDate(nowMs);
    try {
      atomicWrite(file, JSON.stringify(record, null, 2) + "\n");
    } catch (_ignoreLastUsedWrite) {}
  }

  function validate(token, contextObject) {
    var raw = trim(token);
    if (!raw.length) {
      return invalid("missing_token", "An MCP bearer token is required.");
    }
    var parts = raw.split(".");
    if (parts.length !== 3) {
      return invalid("invalid_token_format", "The MCP bearer token is malformed.");
    }
    var header;
    var payload;
    try {
      header = JSON.parse(decodeBase64Url(parts[0]));
      payload = JSON.parse(decodeBase64Url(parts[1]));
    } catch (_decodeError) {
      return invalid("invalid_token_encoding", "The MCP bearer token cannot be decoded.");
    }
    if (String(header.alg || "") !== "HS256" || String(header.typ || "JWT").toUpperCase() !== "JWT") {
      return invalid("unsupported_token", "The MCP bearer token must be an HS256 JWT.");
    }
    if (String(payload.iss || "") === "C8Oforms") {
      return validateC8oForms(contextObject, parts, header, payload);
    }
    if (String(payload.iss || "") !== ISSUER || String(payload.aud || "") !== AUDIENCE) {
      return invalid("invalid_token_claims", "The MCP bearer token issuer or audience is invalid.");
    }
    var nowSeconds = Math.floor(java.lang.System.currentTimeMillis() / 1000);
    if (payload.exp !== null && typeof payload.exp !== "undefined" && nowSeconds >= Number(payload.exp)) {
      return invalid("expired_token", "The MCP bearer token has expired.");
    }
    if (payload.nbf !== null && typeof payload.nbf !== "undefined" && nowSeconds < Number(payload.nbf)) {
      return invalid("token_not_yet_valid", "The MCP bearer token is not valid yet.");
    }
    var signingInput = parts[0] + "." + parts[1];
    var expected;
    try {
      expected = sign(signingInput, signingKey());
    } catch (keyError) {
      return invalid("signing_key_unavailable", String(keyError.message || keyError));
    }
    if (!signaturesEqual(parts[2], expected)) {
      return invalid("invalid_token_signature", "The MCP bearer token signature is invalid.");
    }
    var kind = trim(payload.kind) || "durable";
    if (kind === "managed") {
      return {
        status: "ok",
        authenticated: true,
        kind: "managed",
        scope: trim(payload.scope) || "mcp:full",
        user: trim(payload.sub),
        payload: payload
      };
    }
    if (kind !== "durable") {
      return invalid("invalid_token_kind", "The MCP bearer token kind is invalid.");
    }
    var tokenId = safeIdentifier(header.kid);
    var jti = trim(payload.jti);
    if (!tokenId.length || !jti.length) {
      return invalid("missing_token_identifier", "The MCP bearer token identifier is missing.");
    }
    var file = null;
    try {
      var roots = tokenRoots();
      for (var rootIndex = 0; rootIndex < roots.length; rootIndex++) {
        if (tokenFile(revokedDirectory(roots[rootIndex]), tokenId).isFile()) {
          return invalid("revoked_token", "The MCP bearer token has been revoked.");
        }
        var candidate = tokenFile(activeDirectory(roots[rootIndex]), tokenId);
        if (file === null && candidate.isFile()) {
          file = candidate;
        }
      }
    } catch (identifierError) {
      return invalid("invalid_token_identifier", String(identifierError.message || identifierError));
    }
    if (file === null) {
      return invalid("revoked_or_unknown_token", "The MCP bearer token is revoked or unknown.");
    }
    try {
      var record = parseJsonFile(file);
      if (trim(record.id) !== tokenId || trim(record.jtiHash) !== sha256(jti)) {
        return invalid("invalid_token_record", "The MCP bearer token does not match its active record.");
      }
      if (trim(record.revokedAt).length) {
        return invalid("revoked_token", "The MCP bearer token has been revoked.");
      }
      var recordExpiration = parseIsoDate(record.expiresAt);
      if (recordExpiration > 0 && java.lang.System.currentTimeMillis() >= recordExpiration) {
        return invalid("expired_token", "The MCP bearer token has expired.");
      }
      updateLastUsed(file, record, java.lang.System.currentTimeMillis());
      return {
        status: "ok",
        authenticated: true,
        kind: "durable",
        scope: trim(record.scope) || "mcp:full",
        user: trim(record.createdBy),
        tokenId: tokenId,
        payload: payload
      };
    } catch (recordError) {
      return invalid("invalid_token_record", String(recordError.message || recordError));
    }
  }

  function bearerToken(contextObject) {
    try {
      var request = contextObject && contextObject.httpServletRequest;
      var authorization = request === null ? null : request.getHeader("Authorization");
      var match = /^\s*Bearer\s+(.+?)\s*$/i.exec(String(authorization || ""));
      return match ? trim(match[1]) : "";
    } catch (_missingRequest) {
      return "";
    }
  }

  function authenticateRequest(contextObject) {
    return validate(bearerToken(contextObject), contextObject);
  }

  C8O.mcpAuth.adminStatus = adminStatus;
  C8O.mcpAuth.list = list;
  C8O.mcpAuth.createDurable = createDurable;
  C8O.mcpAuth.createManaged = createManaged;
  C8O.mcpAuth.revoke = revoke;
  C8O.mcpAuth.validate = validate;
  C8O.mcpAuth.authenticateRequest = authenticateRequest;
  C8O.mcpAuth.setupLocalAgent = setupLocalAgent;
  C8O.mcpAuth.isWebAdmin = isWebAdmin;
  C8O.mcpAuth.endpointUrl = endpointUrl;
})();
