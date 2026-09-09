if (typeof C8O === "undefined" || typeof C8O.project === "undefined") {
  include("js/util.js");
}

function c8oResolveCatalogDirectory(folderName) {
  var File = Packages.java.io.File;
  var projectDir = C8O.project.resolveProjectDirectory({ projectName: "lib_ConvertigoMCP" });
  return new File(projectDir, String(folderName || ""));
}

function c8oLoadCatalogIndex(folderName, indexFilename, options) {
  var Files = Packages.java.nio.file.Files;
  var StandardCharsets = Packages.java.nio.charset.StandardCharsets;
  var opts = options || {};
  var indexFile = new Packages.java.io.File(c8oResolveCatalogDirectory(folderName), String(indexFilename || ""));
  if (!indexFile.isFile()) {
    if (opts.required) {
      throw new Error("Catalog index file not found: " + indexFile.getAbsolutePath());
    }
    return [];
  }
  var jsonText = new java.lang.String(Files.readAllBytes(indexFile.toPath()), StandardCharsets.UTF_8);
  var parsed = JSON.parse(String(jsonText));
  if (!parsed || !parsed.length) {
    return [];
  }
  if (typeof opts.normalize === "function") {
    for (var i = 0; i < parsed.length; i++) {
      parsed[i] = opts.normalize(parsed[i]);
    }
  }
  return parsed;
}

function c8oFindCatalogEntry(entries, fieldName, fieldValue) {
  if (!entries || !entries.length || fieldValue == null) {
    return null;
  }
  var needle = String(fieldValue).toLowerCase();
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (entry && entry[fieldName] != null && String(entry[fieldName]).toLowerCase() === needle) {
      return entry;
    }
  }
  return null;
}

function c8oReadCatalogFile(folderName, fileName) {
  var Files = Packages.java.nio.file.Files;
  var StandardCharsets = Packages.java.nio.charset.StandardCharsets;
  var resourceFile = new Packages.java.io.File(c8oResolveCatalogDirectory(folderName), String(fileName || ""));
  if (!resourceFile.isFile()) {
    throw new Error("Catalog file not found: " + resourceFile.getAbsolutePath());
  }
  return new java.lang.String(Files.readAllBytes(resourceFile.toPath()), StandardCharsets.UTF_8);
}
