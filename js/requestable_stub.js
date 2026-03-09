include("js/util.js");
include("js/databaseobject.js");

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.requestableStub = C8O.requestableStub || {};

C8O.requestableStub._normalizeFilename = function (value) {
  var text = C8O.util.toTrimmedString(value);
  if (!text.length) {
    return "";
  }
  var normalized = text.replace(/\\/g, "/");
  while (normalized.indexOf("//") >= 0) {
    normalized = normalized.replace("//", "/");
  }
  if (normalized.startsWith("/")) {
    normalized = normalized.substring(1);
  }
  return normalized;
};

C8O.requestableStub._parseRequestable = function (value) {
  var text = C8O.util.toTrimmedString(value);
  if (!text.length) {
    throw new Error("requestable is required");
  }
  var parts = text.split(".");
  if (parts.length < 2) {
    throw new Error("requestable must be <project>[.<connector>].<requestable>");
  }

  var projectName = parts[0];
  var connectorName = null;
  var requestableName = null;
  var isSequence = false;

  if (parts.length === 2) {
    isSequence = true;
    requestableName = parts[1];
  } else {
    connectorName = parts[1];
    requestableName = parts.slice(2).join(".");
  }

  if (!requestableName || !requestableName.length) {
    throw new Error("requestable name is missing");
  }

  var qname = isSequence
    ? projectName + ".sq:" + requestableName
    : projectName + ".cn:" + connectorName + ".tr:" + requestableName;

  return {
    requestable: text,
    project: projectName,
    connector: connectorName,
    name: requestableName,
    isSequence: isSequence,
    qname: qname
  };
};

C8O.requestableStub.resolve = function (requestable, options) {
  var parsed = C8O.requestableStub._parseRequestable(requestable);
  var dbo = C8O.dbo.resolve(parsed.qname, { messagePrefix: "requestable" });
  var project = dbo.getProject();
  var stubsDir = new java.io.File(project.getDirPath(), "stubs").getCanonicalFile();
  var stubsBasePath = stubsDir.toPath();

  var providedFilename = C8O.requestableStub._normalizeFilename(options && options.stubFilename);
  var defaultStubFilename = String(dbo.getDefaultStubFileName());
  var effectiveFilename = providedFilename.length ? providedFilename : defaultStubFilename;

  var targetFile = new java.io.File(stubsDir, effectiveFilename).getCanonicalFile();
  var targetPath = targetFile.toPath();
  if (!targetPath.startsWith(stubsBasePath)) {
    throw new Error("Invalid stubFilename: " + effectiveFilename);
  }

  return {
    requestable: parsed.requestable,
    qname: String(dbo.getFullQName()),
    project: String(project.getName()),
    connector: parsed.connector,
    name: parsed.name,
    isSequence: parsed.isSequence,
    defaultStubFilename: defaultStubFilename,
    stubFilename: effectiveFilename,
    path: String(targetFile.getPath()),
    relativePath: "stubs/" + effectiveFilename,
    directoryExists: stubsDir.exists(),
    exists: targetFile.exists(),
    requestableObject: dbo,
    projectObject: project,
    stubsDir: stubsDir,
    targetFile: targetFile
  };
};

C8O.requestableStub.read = function (requestable, options) {
  var info = C8O.requestableStub.resolve(requestable, options);
  var bytes = 0;
  var content = "";
  var status = "missing";
  var message = "Stub file not found";
  if (!info.directoryExists) {
    status = "uninitialized";
    message = "stubs directory not created";
  } else if (info.exists) {
    var rawBytes = java.nio.file.Files.readAllBytes(info.targetFile.toPath());
    bytes = rawBytes.length;
    content = new java.lang.String(rawBytes, java.nio.charset.StandardCharsets.UTF_8);
    status = "ok";
    message = "Stub loaded";
  }

  return {
    status: status,
    message: message,
    requestable: info.requestable,
    qname: info.qname,
    project: info.project,
    connector: info.connector,
    name: info.name,
    isSequence: info.isSequence,
    defaultStubFilename: info.defaultStubFilename,
    stubFilename: info.stubFilename,
    path: info.path,
    relativePath: info.relativePath,
    directoryExists: info.directoryExists,
    exists: info.exists,
    bytes: bytes,
    timestamp: java.lang.System.currentTimeMillis(),
    content: content
  };
};

C8O.requestableStub.write = function (requestable, content, options) {
  var info = C8O.requestableStub.resolve(requestable, options);
  var xmlText = content == null ? "" : String(content);
  if (!C8O.util.toTrimmedString(xmlText).length) {
    throw new Error("content is required");
  }

  var XMLUtils = Packages.com.twinsoft.convertigo.engine.util.XMLUtils;
  var document = XMLUtils.parseDOMFromString(xmlText);
  var root = document && document.getDocumentElement ? document.getDocumentElement() : null;
  if (!root) {
    throw new Error("Stub XML must contain a root element");
  }
  var rootName = String(root.getTagName ? root.getTagName() : root.getNodeName());
  if (rootName !== "document") {
    throw new Error("Stub XML root element must be <document>");
  }

  java.nio.file.Files.createDirectories(info.targetFile.getParentFile().toPath());
  var existed = info.targetFile.exists();
  XMLUtils.saveXml(document, info.targetFile);
  var rawBytes = java.nio.file.Files.readAllBytes(info.targetFile.toPath());
  var persistedText = new java.lang.String(rawBytes, java.nio.charset.StandardCharsets.UTF_8);

  return {
    status: "written",
    message: existed ? "Stub updated" : "Stub created",
    requestable: info.requestable,
    qname: info.qname,
    project: info.project,
    connector: info.connector,
    name: info.name,
    isSequence: info.isSequence,
    defaultStubFilename: info.defaultStubFilename,
    stubFilename: info.stubFilename,
    path: info.path,
    relativePath: info.relativePath,
    created: !existed,
    bytes: rawBytes.length,
    rootElement: rootName,
    timestamp: java.lang.System.currentTimeMillis(),
    content: persistedText
  };
};
