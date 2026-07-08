if (typeof C8O === "undefined" || typeof C8O.util === "undefined" || typeof C8O.project === "undefined") {
  include("js/util.js");
}
include("js/guidance_version.js");
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
      "- MCP guidance version: `" + C8O.MCP_GUIDANCE_VERSION + "`. Setup-generated skills declare the same `Skill guidance version`; if the installed skill differs from this value or has no version, rerun `_setupCodex` or `_setupVibe` for the current MCP endpoint before project mutation.",
      "- Guidance handshake: compare versions during bootstrap. When the client can attach MCP request metadata, send `params._meta.convertigoGuidanceVersion` on the first guarded `tools/call`; raw HTTP clients may instead send `X-Convertigo-Guidance-Version`. The MCP only emits `_meta.convertigoGuidanceWarning` on bootstrap or mutation guard tools such as `project-list`, `databaseobject-tree-apply`, `marketplace-import`, `upsert-crud`, and `project-save`; treat it as a setup refresh signal before further project mutation.",
      "- Treat the live MCP catalog as the public source of truth: `tools/list`, `resources/list`, `prompts/list`.",
      "- Primitive authoring stays tree-first: inspect with `databaseobject-tree-get`, discover with `project-list` and `databaseobject-search`, create with `palette-list` and `palette-describe`, mutate with `databaseobject-tree-apply`, and group changes with `batch-call`.",
      "- Optional UI reveal mode is opt-in per call. When the host asks for live reveal, pass `reveal:true` only on supported mutation/viewer tools such as `databaseobject-tree-apply`, `mobile-builder-open`, `nocode-form-create`, `nocode-form-edit`, and `nocode-form-update`; skipped or unsupported reveal results are UI hints, not mutation failures.",
      "- Runtime proof uses `requestable-execute`, `crud-status`, `crud-proof`, and `log-view` when execution feedback is not enough.",
      "- HTTP integration must keep transport in `HttpConnector` plus typed HTTP transactions; facade sequences call them with `TransactionStep` and only orchestrate or shape contracts.",
      "- New UI projects start from `marketplace-import` and `mobile-builder-open(wait=false)` so the live viewer opens asynchronously while the agent continues backend or UI work.",
      "- For a new standard SQL CRUD + starter NGX UI task, the current recommended public rail is `marketplace-import` -> `mobile-builder-open(wait=false)` -> `upsert-crud` -> backend `crud-proof` -> `upsert-ngx-crud-kit stage=bootstrap` -> `mobile-builder-open(stateOnly=true, wait=true)` -> `upsert-ngx-crud-kit stage=final` -> final `crud-proof(viewerUrl)` -> `project-save`.",
      "- For an existing deterministic CRUD project that is already green, prefer the edit rail: `crud-status` -> `mobile-builder-open(wait=false)` when UI work is likely -> `upsert-crud` -> backend `crud-proof` -> one `upsert-ngx-crud-kit stage=final` -> `mobile-builder-open(stateOnly=true, wait=true)` -> final `crud-proof(viewerUrl)` -> `project-save`.",
      "- For a low-detail CRUD request, stop after that first green end-to-end scaffold plus seeded demo data. Do not improvise a second UX/layout pass unless the user asked for it.",
      "- Treat `spec.relations[]`, `entities[].ui.relationFields`, and `seed.data` as first-class public CRUD inputs. Do not reverse-engineer them from the local workspace once the CRUD guides were read.",
      "- Generated CRUD facade sequences are hidden requestables that require an authenticated context. The generated `auth_login(username,password)` and `auth_logout()` skeleton sequences stay hidden, and the generated UI uses a `Login` page to establish that session once before the visible CRUD home page opens.",
      "- Prefer best-case-first generated code. Trust the standard runtime error bubble for ordinary failures instead of adding defensive wrappers by default.",
      "- In the live dev viewer, prefer `viewerHomeUrl` or `viewerBaseUrl`. Use `mobile-builder-open(wait=false)` early for async launch, continue useful inspection or mutation while it starts, then `mobile-builder-open(stateOnly=true, wait=true)` or a normal waited call before final smoke/proof. Use Playwright or browser-control MCP only when the waited result reports `browserControlReady:true`; while `browserControlTargetUrl` is `about:blank`, the Studio loader is still building and you must poll instead of opening a separate browser, tab, page, Node script, or raw CDP workaround. Studio JxBrowser exposes one visible viewer target over CDP; do not create new browser tabs or pages, reuse the current target. Before browser smoke, inspect the current browser target and confirm it is the returned viewer, not `about:blank` or another URL. If the MCP browser tools are unavailable, disabled, stale, or attached elsewhere, report the managed Playwright MCP configuration problem. Reserve `.../DisplayObjects/mobile/home` for production builds.",
      "- Never patch `_private/ionic`, `DisplayObjects`, `dist`, or other generated frontend artifacts. Fix the Convertigo source objects or the MCP generator instead.",
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
      "3. Decide whether the task really fits the deterministic CRUD fast path. For a new standard SQL CRUD + starter NGX UI project, prefer `convertigo-crud-fastpath`; for an existing deterministic CRUD project edit, prefer `convertigo://resources/convertigo-crud-edit-fastpath`; other tasks stay exploratory.",
      "4. For a new UI project, keep the exact requested project name, call `marketplace-import`, then `mobile-builder-open` with `wait=false` immediately so the viewer starts while the rest of the scaffolding proceeds.",
      "5. For an existing deterministic CRUD project edit, do not run a bootstrap UI pass again: `crud-status` -> optional early `mobile-builder-open(wait=false)` when UI work is likely -> `upsert-crud` -> backend `crud-proof` -> one `upsert-ngx-crud-kit stage=final` -> `mobile-builder-open(stateOnly=true, wait=true)` -> final `crud-proof`.",
      "6. In generated CRUD UI apps, initialize the session once on the generated `Login` root page, then let the visible pages call only the CRUD facades they need.",
      "7. For a low-detail CRUD request, stop after the first green scaffold + seeded demo data. Do not start a second UX refinement pass unless the user explicitly asked for it.",
      "8. Once the fast path is chosen, do not call `rag-query` unless the built-in guides and tools are exhausted.",
      "9. Do not grep the local workspace to rediscover `relations[]`, `ui.relationFields`, or `seed.data` once the CRUD guides already document them.",
      "10. Use `databaseobject-tree-get` and `databaseobject-search` to inspect live state, `palette-list` and `palette-describe` to confirm legal creations, and `databaseobject-tree-apply` or `batch-call` for mutations.",
      "11. Validate runtime behavior with `requestable-execute` or `crud-proof`, then persist with `project-save`.",
      "12. If a waited `mobile-builder-open` reports `compile_error`, fix the Convertigo source objects or MCP generator path. Do not repair generated runtime artifacts."
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
