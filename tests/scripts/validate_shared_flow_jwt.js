var legacyProjectDir = arguments.length > 0 ? arguments[0] : ".";
var flowProjectDir = arguments.length > 1 ? arguments[1] : "../lib_flow_mcp";
var File = Packages.java.io.File;
var Files = Packages.java.nio.file.Files;
var System = Packages.java.lang.System;
var FileUtils = Packages.org.apache.commons.io.FileUtils;
var temporary = Files.createTempDirectory("convertigo-shared-mcp-jwt-").toFile();
System.setProperty("convertigo.mcp.jwt.path", String(temporary.getAbsolutePath()));

function readSource(root, relativePath) {
  return String(FileUtils.readFileToString(new File(root, relativePath), "UTF-8"));
}

function assertTrue(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  var legacySource = readSource(legacyProjectDir, "js/mcp_auth.js").replace(
    /\}\)\(\);\s*$/,
    "C8O.mcpAuth._contractTest = { buildToken: buildToken, rootDirectory: rootDirectory, signingKey: signingKey };})();"
  );
  eval(legacySource);
  var flowJwt = eval(readSource(flowProjectDir, "_flow/lib/jwt.js"));
  var now = Math.floor(System.currentTimeMillis() / 1000);
  var claims = {
    iss: "lib_ConvertigoMCP",
    aud: "ConvertigoMCP",
    sub: "shared-contract",
    jti: "shared-contract-jti",
    kind: "managed",
    scope: "mcp:full",
    iat: now,
    nbf: now,
    exp: now + 300
  };
  var legacyToken = C8O.mcpAuth._contractTest.buildToken(
    { alg: "HS256", typ: "JWT", kid: "managed_shared_contract" },
    claims,
    C8O.mcpAuth._contractTest.signingKey()
  );
  var flowValidation = flowJwt.validate(legacyToken);
  assertTrue(flowValidation.authenticated === true,
    "Flow MCP rejected a token created with the Legacy MCP contract");

  var flowToken = flowJwt._test.buildToken(
    { alg: "HS256", typ: "JWT", kid: "managed_shared_contract_2" },
    claims,
    flowJwt._test.signingKey()
  );
  var legacyValidation = C8O.mcpAuth.validate(flowToken, {});
  assertTrue(legacyValidation.authenticated === true,
    "Legacy MCP rejected a token created with the Flow MCP contract");
  // Both accept only the canonical signature encoding: a tampered character, a non-zero unused trailing
  // bit (the last character of a 32-byte HMAC carries only 4 meaningful bits) and padding are refused.
  var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  [legacyToken, flowToken].forEach(function (token) {
    var signatureStart = token.lastIndexOf(".") + 1;
    var lastIndex = alphabet.indexOf(token.charAt(token.length - 1));
    assertTrue(lastIndex % 4 === 0, "An issued signature is not canonical: " + token.substring(signatureStart));
    [
      token.substring(0, signatureStart) + (token.charAt(signatureStart) === "a" ? "b" : "a") + token.substring(signatureStart + 1),
      token.substring(0, token.length - 1) + alphabet.charAt(lastIndex + 1),
      token + "="
    ].forEach(function (variant) {
      [flowJwt.validate(variant), C8O.mcpAuth.validate(variant, {})].forEach(function (result) {
        assertTrue(result.authenticated === false && result.error.code === "invalid_token_signature",
          "A tampered or non canonical signature was accepted: " + JSON.stringify(result));
      });
    });
  });
  assertTrue(String(flowJwt._test.rootDirectory().getAbsolutePath()) ===
      String(C8O.mcpAuth._contractTest.rootDirectory().getAbsolutePath()),
    "Legacy and Flow MCP do not use the same JWT registry");

  print(JSON.stringify({ ok: true, sameTokenContract: true, storage: String(temporary.getAbsolutePath()) }));
} finally {
  System.clearProperty("convertigo.mcp.jwt.path");
  FileUtils.deleteDirectory(temporary);
}
