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
      "- Treat the live MCP catalog as the public source of truth: `tools/list`, `resources/list`, `prompts/list`.",
      "- Primitive authoring stays tree-first: inspect with `databaseobject-tree-get`, discover with `project-list` and `databaseobject-search`, create with `palette-list` and `palette-describe`, mutate with `databaseobject-tree-apply`, and group changes with `batch-call`.",
      "- Runtime proof uses `requestable-execute`, `crud-status`, `crud-proof`, and `log-view` when execution feedback is not enough.",
      "- New UI projects start from `marketplace-import` and `mobile-builder-open` so the live viewer is visible early.",
      "- For a standard SQL CRUD + starter NGX UI task, the current recommended public rail is `marketplace-import` -> `mobile-builder-open` -> `upsert-crud` -> backend `crud-proof` -> `upsert-ngx-crud-kit stage=bootstrap` -> `mobile-builder-open` -> `upsert-ngx-crud-kit stage=final` -> final `crud-proof(viewerUrl)` -> `project-save`.",
      "- In the live dev viewer, prefer `viewerHomeUrl` or `viewerBaseUrl`. Reserve `.../DisplayObjects/mobile/home` for production builds.",
      "- Never patch `_private/ionic`, `DisplayObjects`, `dist`, or other generated frontend artifacts. Fix the Convertigo source objects or the MCP generator instead."
    ].join("\n")
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
      "1. Start every fresh session with `resources/list`, then `prompts/list` when the caller exposes prompt discovery.",
      "2. Read `convertigo://capabilities`, then `convertigo://recipes/quickstart`, then `convertigo://resources/convertigo-start` before the first broad mutation.",
      "3. Decide whether the task really fits the deterministic CRUD fast path. For standard SQL CRUD + starter NGX UI, prefer `convertigo-crud-fastpath`; existing-project edits or non-CRUD work stay exploratory.",
      "4. For a new UI project, keep the exact requested project name, call `marketplace-import`, then `mobile-builder-open` immediately so the viewer is visible before the rest of the scaffolding.",
      "5. Use `databaseobject-tree-get` and `databaseobject-search` to inspect live state, `palette-list` and `palette-describe` to confirm legal creations, and `databaseobject-tree-apply` or `batch-call` for mutations.",
      "6. Validate runtime behavior with `requestable-execute` or `crud-proof`, then persist with `project-save`.",
      "7. If `mobile-builder-open` reports `compile_error`, fix the Convertigo source objects or MCP generator path. Do not repair generated runtime artifacts."
    ].join("\n")
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
  for (var k = 0; k < parsed.length; k++) {
    var normalizedEntry = c8oNormalizeResourceEntry(parsed[k]);
    if (normalizedEntry) {
      parsed[k] = normalizedEntry;
    }
  }
  return parsed;
}

function c8oNormalizeResourceEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return entry;
  }
  if (!entry.resourceKind && entry.templateId) {
    entry.resourceKind = "template";
  }
  if (!entry.templateKind && entry.resourceKind === "template") {
    entry.templateKind = "catalog-template";
  }
  return entry;
}

function c8oListTemplateResources() {
  var index = c8oLoadResourcesIndex();
  var results = [];
  for (var i = 0; i < index.length; i++) {
    var entry = index[i];
    if (!entry || typeof entry !== "object") {
      continue;
    }
    if (String(entry.resourceKind || "").toLowerCase() === "template" || C8O.util.toTrimmedString(entry.templateId).length > 0) {
      results.push(entry);
    }
  }
  return results;
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
