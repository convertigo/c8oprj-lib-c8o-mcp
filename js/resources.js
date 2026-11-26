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
    guidanceLevel: "summary",
    drawerUris: ["convertigo://guides/capabilities/details-1", "convertigo://guides/capabilities/details-2", "convertigo://guides/capabilities/details-3"],
    text: [
      "# Convertigo MCP capabilities",
      "",
      "- MCP guidance version: `" + C8O.MCP_GUIDANCE_VERSION + "`. Compare the installed skill once; rerun the setup for your harness on mismatch before mutation. Missing transport metadata is advisory when the installed version matches.",
      "- No Code (C8Oforms) work: the skill `convertigo-nocode` of this version, served as convertigo://skills/convertigo-nocode and one URI per drawer (convertigo://skills/convertigo-nocode/<file>). Not installed, or another version: call `skill-install` before any No Code change, apply the SKILL.md it answers at once, and write its files for the next sessions.",
      "- Live tools/list, resources/list and prompts/list are the contract. Read known guide URIs directly; open one summary or exact drawer per call, never a batch of guide reads.",
      "- Inspect with databaseobject-tree-get; mutate with databaseobject-tree-apply; order dependent writes in batch-call; prove with requestable-execute; persist with project-save.",
      "- Keep the exact requested project name. New NGX apps start with marketplace-import(template_ngxBuilderIonic), then mobile-builder-open(wait=false). Use typed HTTP/SQL transactions behind business sequences; prove application data before wiring UI events/actions and SC locals.",
      "- Standard CRUD: upsert-crud -> backend crud-proof -> ngx-page-create per page -> viewer readiness -> project-lint -> browser-verify. Existing pages are patched through databaseobject-tree-apply or deleted and recreated; ngx-page-create never overwrites them. Generated auth_login is a demo skeleton requiring replacement before delivery.",
      "- Never edit descriptors or generated artifacts. Preserve scriptContent markers. Read valid SmartSources; do not invent their internal JSON. Prove visible behavior, report missing proof, and stop after the requested result is green.",
      "",
      "## Drawers",
      "- convertigo://guides/capabilities/details-1 — guidance handshake and authoring/CRUD rails.",
      "- convertigo://guides/capabilities/details-2 — authentication and managed viewer/browser control.",
      "- convertigo://guides/capabilities/details-3 — source boundaries and generated artifacts."
    ].join("\n")
  },
  {
    uri: "convertigo://recipes/quickstart",
    name: "Convertigo MCP quickstart recipes",
    title: "Convertigo MCP quickstart recipes",
    description: "Minimal MCP-first recipes for fast project delivery.",
    mimeType: "text/markdown",
    guidanceLevel: "summary",
    drawerUris: ["convertigo://guides/crud/deterministic-rail", "convertigo://guides/crud-edit/overview", "convertigo://guides/ngx/viewer"],
    text: [
      "# Quickstart recipes",
      "",
      "Read convertigo://capabilities once to check guidance freshness. Follow the managed skill's one matching route; read known URIs directly. If no route is known, read convertigo://guides/start. Read one guide per call.",
      "Keep the exact target project name. For new NGX apps import template_ngxBuilderIonic and launch mobile-builder-open(wait=false), then work while it builds. For CRUD use upsert-crud, backend crud-proof, ngx-page-create per page, project-lint and browser-verify. Patch an existing page through databaseobject-tree-apply or delete and recreate it. Replace the generated demo auth_login before delivery.",
      "Inspect/mutate source objects through MCP. Prove application data, viewer readiness and visible behavior, then project-save. Never edit descriptors or generated artifacts. On compile_error repair the source objects. Do not repeat catalog discovery, unchanged proof or unsolicited UX passes.",
      "",
      "## Drawers",
      "- convertigo://guides/crud/deterministic-rail — new standard SQL CRUD rail.",
      "- convertigo://guides/crud-edit/overview — existing deterministic CRUD edits.",
      "- convertigo://guides/ngx/viewer — builder launch and managed browser control."
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
  var builtins = C8O_RESOURCES_BUILTIN.concat(c8oSkillResourceEntries());
  for (var j = 0; j < builtins.length; j++) {
    var builtin = builtins[j];
    var key = String(builtin.uri || "").toLowerCase();
    if (!key.length || seen[key]) {
      continue;
    }
    parsed.push(builtin);
  }
  return parsed;
}

// The No Code skill as resources (js/skill_package.js): its SKILL.md and one URI per drawer, at the current version.
function c8oSkillResourceEntries() {
  try {
    if (typeof C8O.skillPackage === "undefined" || typeof C8O.skillPackage.resourceEntries !== "function") {
      include("js/skill_package.js");
    }
    return C8O.skillPackage.resourceEntries();
  } catch (_noSkillResources) {
    return [];
  }
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
  var entries = c8oLoadResourcesIndex();
  var found = c8oFindCatalogEntry(entries, "uri", resourceUri);
  if (found) {
    // A former guide URI (entry.aliasOf, split into a summary and drawers in 0.3.0-beta.31) is not listed any more and
    // answers the summary it became, so an existing client reads it in one call.
    var target = found.aliasOf ? c8oFindCatalogEntry(entries, "uri", found.aliasOf) : null;
    return target || found;
  }
  // A renamed guide still answers at its former URI (entry.aliases).
  var wanted = String(resourceUri).toLowerCase();
  for (var i = 0; i < entries.length; i++) {
    var aliases = entries[i] && entries[i].aliases;
    for (var k = 0; aliases && k < aliases.length; k++) {
      if (String(aliases[k]).toLowerCase() === wanted) {
        var aliased = entries[i].aliasOf ? c8oFindCatalogEntry(entries, "uri", entries[i].aliasOf) : null;
        return aliased || entries[i];
      }
    }
  }
  return null;
}

function c8oReadResourceFile(entry) {
  if (!entry) {
    throw new Error("Resource entry is required");
  }
  if (entry.text != null) {
    return String(entry.text);
  }
  if (entry.skillFile) {
    if (typeof C8O.skillPackage === "undefined" || typeof C8O.skillPackage.fileText !== "function") {
      include("js/skill_package.js");
    }
    return C8O.skillPackage.fileText(entry.skillFile.skill, entry.skillFile.path);
  }
  if (!entry.file) {
    throw new Error("Resource entry has no file property");
  }
  var text = String(c8oReadCatalogFile("resources", entry.file));
  if (entry.expandGuidance === true) {
    text = text.replace(/\{\{GUIDANCE_VERSION\}\}/g, String(C8O.MCP_GUIDANCE_VERSION))
      .replace(/\{\{SETUP_SEQUENCE\}\}/g, "_setupVibe, _setupCodex or _setupClaude for your harness")
      .replace(/\{\{TASK_ROUTES\}\}/g, "Read `convertigo://resources/convertigo-task-routes` for the current routes.");
  }
  return text;
}
