if (typeof C8O === "undefined" || typeof C8O.util === "undefined" || typeof C8O.project === "undefined") {
  include("js/util.js");
}
include("js/catalog_loader.js");

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
      "- Backend and non-visual descriptor authoring stay tree-first: inspect with `databaseobject-tree-get`, discover with `project-list` and `databaseobject-search`, create with `palette-list`, `palette-describe`, and mutate with `databaseobject-tree-apply` or `batch-call` for descriptor/tree work. Visible NGX front-end generation in the HTML editor flavor is different: author it in `_private/ionic` with `palette-authoring-catalog`, `palette-html-skeleton`, and supported sidecars, then reimport with `project-reload { fromIonic=true, ionicTarget=\"<generated file or directory>\" }` when possible, otherwise `project-reload { fromIonic=true }`. Do not generate visible front-end through manual YAML or descriptor tree mutations in that flavor. `palette-json-skeleton` is legacy and not the normal frontend authoring path.",
      "- In `_private/ionic` authored HTML, `class123456...` tokens are unique Convertigo object anchors, not reusable style classes. Preserve each one only on its original generated element, never copy/invent/reuse it elsewhere. Prefer editing anchored elements in place and add semantic classes on those same elements, e.g. `class=\"crm-card class1776709259833\"`.",
      "- Runtime proof uses `requestable-execute`, `crud-status`, `crud-proof`, and `log-view` when execution feedback is not enough.",
      "- New UI projects start from `marketplace-import` and `mobile-builder-open` so the live viewer is visible early.",
      "- For a standard SQL CRUD + starter NGX UI task in the HTML editor flavor, the current recommended public rail is `marketplace-import` -> `mobile-builder-open` -> `upsert-crud` -> backend `crud-proof` -> author the visible NGX shell in `_private/ionic` with palette-backed HTML plus supported sidecars -> `project-reload { fromIonic=true, ionicTarget=\"<generated file or directory>\" }` when targetable, otherwise `project-reload { fromIonic=true }` -> final `crud-proof(viewerUrl)` -> `project-save`.",
      "- For a low-detail CRUD request, stop after that first green end-to-end scaffold plus seeded demo data. Do not improvise a second UX/layout pass unless the user asked for it.",
      "- Generated CRUD facade sequences are hidden requestables that require an authenticated context. The generated `auth_login(username,password)` and `auth_logout()` skeleton sequences stay hidden, and the generated UI uses a `Login` page to establish that session once before the visible CRUD home page opens.",
      "- Prefer best-case-first generated code. Trust the standard runtime error bubble for ordinary failures instead of adding defensive wrappers by default.",
      "- In the live dev viewer, prefer `viewerHomeUrl` or `viewerBaseUrl`. Reserve `.../DisplayObjects/mobile/home` for production builds.",
      "- Do not patch `_private/ionic`, `DisplayObjects`, `dist`, or other generated frontend artifacts except for the supported sidecar-backed HTML editor round-trip under `_private/ionic`; that supported path includes page/shared-component HTML/SCSS plus `sharedComponent`, `useSharedComponent`, `sharedAction`, and `invokeSharedAction` sidecars. Outside that path, fix the Convertigo source objects or MCP generator instead.",
      "- Once the CRUD fast path is selected, do not fall back to `rag-query` unless the built-in guides and CRUD tools no longer answer the task."
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
      "5. In generated CRUD UI apps, initialize the session once on the generated `Login` root page, then let the visible pages call only the CRUD facades they need.",
      "6. For a low-detail CRUD request, stop after the first green scaffold + seeded demo data. Do not start a second UX refinement pass unless the user explicitly asked for it.",
      "7. Once the fast path is chosen, do not call `rag-query` unless the built-in guides and tools are exhausted.",
      "8. Use `databaseobject-tree-get` and `databaseobject-search` to inspect live state. For visible NGX front-end generation in the HTML editor flavor, use `palette-authoring-catalog`, `palette-describe`, `palette-resolve-with-marketplace`, and `palette-html-skeleton`, then reimport with `project-reload { fromIonic=true, ionicTarget=\"<generated file or directory>\" }` when possible. Reserve `databaseobject-tree-apply` and `batch-call` for backend/non-visual descriptor mutations. Avoid JSON mirror workflows in the HTML editor path.",
      "9. Validate runtime behavior with `requestable-execute` or `crud-proof`, then persist with `project-save`.",
      "10. If `mobile-builder-open` reports `compile_error`, fix the Convertigo source objects, the supported `_private/ionic` authoring file when sidecar-backed, or the MCP generator path. Do not repair unsupported generated runtime artifacts."
    ].join("\n")
  }
];

function c8oLoadResourcesIndex() {
  var parsed = c8oLoadCatalogIndex("resources", "resources_index.json", {
    required: false,
    normalize: c8oNormalizeResourceEntry
  });

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
  return c8oFindCatalogEntry(c8oLoadResourcesIndex(), "uri", resourceUri);
}

function c8oReadResourceFile(entry) {
  if (!entry) {
    throw new Error("Resource entry is required");
  }
  if (entry.text != null) {
    return String(entry.text);
  }
  if (!entry.file) {
    throw new Error("Resource entry has no file property");
  }
  return c8oReadCatalogFile("resources", entry.file);
}
