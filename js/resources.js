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
      "- Guidance handshake: compare versions during bootstrap. When the client can attach MCP request metadata, send `params._meta.convertigoGuidanceVersion` on the first guarded `tools/call`; raw HTTP clients may instead send `X-Convertigo-Guidance-Version`. A mismatch warning requires setup refresh before mutation. A missing-version warning is advisory when the installed skill version already matches this capability version, so the current task may continue while the managed host refreshes its transport configuration.",
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
      "- In the live dev viewer, prefer `viewerHomeUrl` or `viewerBaseUrl`. Use `mobile-builder-open(wait=false)` early for async launch, continue useful inspection or mutation while it starts, then `mobile-builder-open(stateOnly=true, wait=true)` before final proof. A state-only `status:\"stopped\"` is terminal for that poll: call `mobile-builder-open(stateOnly=false, wait=false)` once instead of waiting again. Use Playwright only when both `browserDebugPortMatched:true` and `browserControlReady:true` are reported. Studio JxBrowser exposes one existing visible page over CDP, not a normal multi-tab browser. The known-good fast check is `playwright.browser_tabs` for list/URL confirmation, `playwright.browser_find` for visible UI, and `playwright.browser_evaluate` only for DOM state or timing; do not create or navigate tabs/pages or probe extra browser features first. If the target is `about:blank` with status `building`, poll; if status is `stopped`, launch asynchronously. If MCP browser tools are unavailable, stale, or attached elsewhere, report the managed Playwright configuration problem instead of using Node, raw CDP, or another browser. Reserve `.../DisplayObjects/mobile/home` for production builds.",
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
      "1. When a managed skill already names the required resource URI or tool, read it directly. Do not list resources, templates, or prompts again unless routing is ambiguous, a named entry is missing, or guidance versions disagree.",
      "2. Read `convertigo://capabilities` to verify guidance freshness, then read only the smallest entry recipe matching the task. Use `convertigo://resources/convertigo-start` when no route is known and this quickstart only when route selection remains ambiguous.",
      "3. Decide whether the task really fits the deterministic CRUD fast path. For a new standard SQL CRUD + starter NGX UI project, prefer `convertigo-crud-fastpath`; for an existing deterministic CRUD project edit, prefer `convertigo://resources/convertigo-crud-edit-fastpath`; other tasks stay exploratory.",
      "4. For a new UI project, keep the exact requested project name, call `marketplace-import`, then `mobile-builder-open` with `wait=false` immediately so the viewer starts while the rest of the scaffolding proceeds.",
      "5. For an existing deterministic CRUD project edit, do not run a bootstrap UI pass again: `crud-status` -> optional early `mobile-builder-open(wait=false)` when UI work is likely -> `upsert-crud` -> backend `crud-proof` -> one `upsert-ngx-crud-kit stage=final` -> `mobile-builder-open(stateOnly=true, wait=true)` -> final `crud-proof`.",
      "6. In generated CRUD UI apps, initialize the session once on the generated `Login` root page, then let the visible pages call only the CRUD facades they need.",
      "7. For a low-detail CRUD request, stop after the first green scaffold + seeded demo data. Do not start a second UX refinement pass unless the user explicitly asked for it.",
      "8. Once the fast path is chosen, do not call `rag-query` unless the built-in guides and tools are exhausted.",
      "9. Do not grep the local workspace to rediscover `relations[]`, `ui.relationFields`, or `seed.data` once the CRUD guides already document them.",
      "10. Use targeted `databaseobject-tree-get` or `databaseobject-search` reads, consult palette metadata only for uncertain object contracts, and group coherent mutations with `batch-call` when safe.",
      "11. For UI work, mutate while the asynchronously opened viewer builds, then perform one readiness check and one acceptance-oriented browser proof. Repeat only to repair a concrete failed criterion.",
      "12. Validate backend behavior with `requestable-execute` or `crud-proof`, then persist with `project-save`.",
      "13. If a waited `mobile-builder-open` reports `compile_error`, fix the Convertigo source objects or MCP generator path. Do not repair generated runtime artifacts."
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
