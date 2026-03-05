if (typeof C8O === "undefined" || typeof C8O.util === "undefined" || typeof C8O.project === "undefined") {
  include("js/util.js");
}

var C8O_RESOURCES_BUILTIN = [
  {
    uri: "convertigo://capabilities",
    name: "Convertigo MCP capabilities",
    title: "Convertigo MCP capabilities",
    description: "Core MCP capabilities and recommended authoring flow.",
    mimeType: "text/markdown",
    text: [
      "# Convertigo MCP capabilities",
      "",
      "- Project discovery: `project-list`, `databaseobject-children`, `databaseobject-tree-get`.",
      "- Authoring: `palette-list`, `palette-describe`, `databaseobject-create`, `databaseobject-properties-set`, `databaseobject-tree-apply`.",
      "- Bulk orchestration: `batch-call`.",
      "- Diagnostics: `log-view`, `requestable-execute`.",
      "- Marketplace: `marketplace-list`, `marketplace-import`."
    ].join("\\n")
  },
  {
    uri: "convertigo://recipes/quickstart",
    name: "Convertigo MCP quickstart recipes",
    title: "Convertigo MCP quickstart recipes",
    description: "Minimal MCP-first recipes for fast project delivery.",
    mimeType: "text/markdown",
    text: [
      "# Quickstart recipes",
      "",
      "1. Discover parent capabilities with `palette-list` then `palette-describe`.",
      "2. Create one-shot trees with `databaseobject-create` + `children`.",
      "3. Apply property batches with `databaseobject-properties-set`.",
      "4. Navigate large trees with `databaseobject-tree-get` (`view=summary` then `view=children`).",
      "5. Orchestrate macro changes with `batch-call` and `$ref`."
    ].join("\\n")
  }
];

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
  var parsed = [];
  if (indexFile.isFile()) {
    var jsonText = new java.lang.String(Files.readAllBytes(indexFile.toPath()), StandardCharsets.UTF_8);
    var loaded = JSON.parse(String(jsonText));
    if (loaded && loaded.length) {
      parsed = loaded;
    }
  }

  var seen = {};
  for (var i = 0; i < parsed.length; i++) {
    var entry = parsed[i];
    if (entry && entry.uri) {
      seen[String(entry.uri).toLowerCase()] = true;
    }
  }
  for (var j = 0; j < C8O_RESOURCES_BUILTIN.length; j++) {
    var builtin = C8O_RESOURCES_BUILTIN[j];
    var key = String(builtin.uri || "").toLowerCase();
    if (!key.length || seen[key]) {
      continue;
    }
    parsed.push(builtin);
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
  if (!entry) {
    throw new Error("Resource entry is required");
  }
  if (entry.text != null) {
    return String(entry.text);
  }
  if (!entry.file) {
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
