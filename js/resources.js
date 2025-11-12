if (typeof C8O === "undefined" || typeof C8O.util === "undefined" || typeof C8O.project === "undefined") {
  include("js/util.js");
}

function c8oResolveResourcesDirectory() {
  return C8O.project.resolveProjectDirectory({ projectName: "ConvertigoMCP" });
}

function c8oLoadResourcesIndex() {
  var File = Packages.java.io.File;
  var Files = Packages.java.nio.file.Files;
  var StandardCharsets = Packages.java.nio.charset.StandardCharsets;
  var projectDir = c8oResolveResourcesDirectory();
  var resourcesDir = new File(projectDir, "resources");
  var indexFile = new File(resourcesDir, "resources_index.json");
  if (!indexFile.isFile()) {
    throw new Error("Resources index file not found: " + indexFile.getAbsolutePath());
  }
  var jsonText = new java.lang.String(Files.readAllBytes(indexFile.toPath()), StandardCharsets.UTF_8);
  var parsed = JSON.parse(String(jsonText));
  if (!parsed || !parsed.length) {
    return [];
  }
  return parsed;
}

function c8oFindResourceByUri(resourceUri) {
  if (!resourceUri) {
    return null;
  }
  var index = c8oLoadResourcesIndex();
  var needle = String(resourceUri).toLowerCase();
  for (var i = 0; i < index.length; i++) {
    var entry = index[i];
    if (entry && entry.uri && String(entry.uri).toLowerCase() === needle) {
      return entry;
    }
  }
  return null;
}

function c8oReadResourceFile(entry) {
  var File = Packages.java.io.File;
  var Files = Packages.java.nio.file.Files;
  var StandardCharsets = Packages.java.nio.charset.StandardCharsets;
  if (!entry || !entry.file) {
    throw new Error("Resource entry has no file property");
  }
  var projectDir = c8oResolveResourcesDirectory();
  var resourcesDir = new File(projectDir, "resources");
  var resourceFile = new File(resourcesDir, entry.file);
  if (!resourceFile.isFile()) {
    throw new Error("Resource file not found: " + resourceFile.getAbsolutePath());
  }
  return new java.lang.String(Files.readAllBytes(resourceFile.toPath()), StandardCharsets.UTF_8);
}
