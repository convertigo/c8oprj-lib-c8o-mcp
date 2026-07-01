include("js/util.js");
include("js/resources.js");
include("js/prompts.js");

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.setupCodex = C8O.setupCodex || {};

(function () {
  function trim(value) {
    return value == null ? "" : String(value).trim();
  }

  function ensureTrailingPath(base, suffix) {
    var text = trim(base);
    if (!text.length) {
      return trim(suffix);
    }
    if (text.indexOf(trim(suffix)) === text.length - trim(suffix).length) {
      return text;
    }
    return text + trim(suffix);
  }

  function userHomeDirectory() {
    return trim(java.lang.System.getProperty("user.home"));
  }

  function resolveCodexHome(input) {
    var File = Packages.java.io.File;
    var raw = trim(input);
    if (!raw.length) {
      raw = "~/.codex";
    }
    if (raw === "~") {
      raw = userHomeDirectory();
    } else if (raw.indexOf("~/") === 0 || raw.indexOf("~\\") === 0) {
      raw = userHomeDirectory() + raw.substring(1);
    }
    return new File(raw).getCanonicalFile();
  }

  function readTextIfExists(file) {
    var Files = Packages.java.nio.file.Files;
    var StandardCharsets = Packages.java.nio.charset.StandardCharsets;
    if (!file || !file.isFile()) {
      return "";
    }
    return String(new java.lang.String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
  }

  function writeText(file, text) {
    var Files = Packages.java.nio.file.Files;
    var StandardCharsets = Packages.java.nio.charset.StandardCharsets;
    java.nio.file.Files.createDirectories(file.getParentFile().toPath());
    Files.write(
      file.toPath(),
      new java.lang.String(String(text == null ? "" : text)).getBytes(StandardCharsets.UTF_8),
      java.nio.file.StandardOpenOption.CREATE,
      java.nio.file.StandardOpenOption.TRUNCATE_EXISTING,
      java.nio.file.StandardOpenOption.WRITE
    );
  }

  function normalizeBaseUrl(url) {
    var text = trim(url).replace(/\/+$/g, "");
    return text;
  }

  function deriveMcpUrl(input, warnings) {
    var explicit = normalizeBaseUrl(input);
    if (explicit.length) {
      return explicit;
    }
    try {
      var EnginePropertiesManager = Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager;
      var PropertyName = Packages.com.twinsoft.convertigo.engine.EnginePropertiesManager.PropertyName;
      var baseUrl = normalizeBaseUrl(EnginePropertiesManager.getProperty(PropertyName.APPLICATION_SERVER_CONVERTIGO_URL));
      if (/\/api\/mcp$/i.test(baseUrl)) {
        return baseUrl;
      }
      if (/\/convertigo$/i.test(baseUrl)) {
        return baseUrl + "/api/mcp";
      }
      if (/\/convertigo\/api$/i.test(baseUrl)) {
        return baseUrl + "/mcp";
      }
      if (baseUrl.length) {
        var candidate = ensureTrailingPath(baseUrl, "/convertigo/api/mcp");
        if (warnings && warnings.push) {
          warnings.push("Resolved MCP URL from the local server base URL using the default /convertigo/api/mcp suffix.");
        }
        return candidate;
      }
    } catch (deriveError) {
      if (warnings && warnings.push) {
        warnings.push("Unable to derive MCP URL from Engine properties: " + String(deriveError));
      }
    }
    if (warnings && warnings.push) {
      warnings.push("Falling back to the default local MCP URL.");
    }
    return "http://localhost:18080/convertigo/api/mcp";
  }

  function tomlEscape(value) {
    return String(value == null ? "" : value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');
  }

  function splitLines(text) {
    return String(text == null ? "" : text).replace(/\r\n?/g, "\n").split("\n");
  }

  function findSectionRange(lines, sectionName) {
    var header = "[" + sectionName + "]";
    var start = -1;
    var end = lines.length;
    for (var i = 0; i < lines.length; i++) {
      if (trim(lines[i]) === header) {
        start = i;
        break;
      }
    }
    if (start < 0) {
      return { found: false, start: -1, end: -1 };
    }
    for (var j = start + 1; j < lines.length; j++) {
      if (/^\s*\[.+\]\s*$/.test(lines[j])) {
        end = j;
        break;
      }
    }
    return { found: true, start: start, end: end };
  }

  function patchConfigToml(existingText, mcpUrl) {
    var text = String(existingText == null ? "" : existingText).replace(/\r\n?/g, "\n");
    var lines = splitLines(text);
    var range = findSectionRange(lines, "mcp_servers.convertigo");
    var urlLine = 'url = "' + tomlEscape(mcpUrl) + '"';
    var timeoutLine = "startup_timeout_sec = 60";
    var status = "unchanged";

    if (!range.found) {
      if (lines.length && trim(lines[lines.length - 1]).length) {
        lines.push("");
      }
      lines.push("[mcp_servers.convertigo]");
      lines.push(urlLine);
      lines.push(timeoutLine);
      status = text.length ? "updated" : "created";
      return {
        status: status,
        text: lines.join("\n").replace(/\n+$/, "\n")
      };
    }

    var sectionLines = lines.slice(range.start, range.end);
    var replacedUrl = false;
    var replacedTimeout = false;
    for (var i = 1; i < sectionLines.length; i++) {
      if (/^\s*url\s*=/.test(sectionLines[i])) {
        if (trim(sectionLines[i]) !== urlLine) {
          sectionLines[i] = urlLine;
          status = "updated";
        }
        replacedUrl = true;
        continue;
      }
      if (/^\s*startup_timeout_sec\s*=/.test(sectionLines[i])) {
        if (trim(sectionLines[i]) !== timeoutLine) {
          sectionLines[i] = timeoutLine;
          status = "updated";
        }
        replacedTimeout = true;
      }
    }
    if (!replacedUrl) {
      sectionLines.splice(1, 0, urlLine);
      status = "updated";
    }
    if (!replacedTimeout) {
      sectionLines.splice(replacedUrl ? 2 : 2, 0, timeoutLine);
      status = "updated";
    }
    var newLines = lines.slice(0, range.start).concat(sectionLines).concat(lines.slice(range.end));
    var nextText = newLines.join("\n").replace(/\n+$/, "\n");
    if (nextText === text.replace(/\n+$/, "\n")) {
      status = "unchanged";
    }
    return {
      status: status,
      text: nextText
    };
  }

  function resourceSummary(uri, fallbackTitle) {
    var entry = null;
    try {
      entry = c8oFindResourceByUri(uri);
    } catch (_ignoreResourceLookup) {
      entry = null;
    }
    return {
      uri: uri,
      title: trim(entry && (entry.title || entry.name)) || fallbackTitle,
      description: trim(entry && entry.description) || ""
    };
  }

  function promptSummary(name, fallbackTitle) {
    var entry = null;
    try {
      entry = c8oFindPromptByName(name);
    } catch (_ignorePromptLookup) {
      entry = null;
    }
    return {
      name: name,
      title: trim(entry && (entry.title || entry.name)) || fallbackTitle,
      description: trim(entry && entry.description) || ""
    };
  }

  function buildReferenceLines() {
    var items = [
      resourceSummary("convertigo://capabilities", "Convertigo MCP capabilities"),
      resourceSummary("convertigo://recipes/quickstart", "Convertigo MCP quickstart recipes"),
      resourceSummary("convertigo://resources/convertigo-start", "Convertigo Start Guide"),
      resourceSummary("convertigo://resources/convertigo-crud-fastpath", "Convertigo CRUD Fast Path"),
      resourceSummary("convertigo://resources/convertigo-recipe-starter-extension", "Convertigo Starter Extension Recipe"),
      resourceSummary("convertigo://resources/convertigo-recipe-ngx-data-page", "Convertigo NGX Data Page Recipe"),
      resourceSummary("convertigo://resources/convertigo-frontend-ngx", "Convertigo Frontend NGX"),
      promptSummary("convertigo-quickstart", "Convertigo MCP Quickstart"),
      promptSummary("convertigo-crud-fastpath", "Convertigo CRUD Fast Path")
    ];
    var lines = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var pointer = item.uri ? ("`" + item.uri + "`") : ("`" + item.name + "`");
      var label = trim(item.title);
      var description = trim(item.description);
      lines.push("- " + pointer + " — " + label + (description.length ? (": " + description) : ""));
    }
    return lines;
  }

  function buildSkillMarkdown(mcpUrl) {
    var referenceLines = buildReferenceLines();
    return [
      "---",
      "name: convertigo-generalist",
      "description: Bootstrap Codex for general Convertigo work. Use it to discover Convertigo MCP guides first, choose between exploratory work and the CRUD fast path, and apply the correct naming and viewer rules.",
      "---",
      "",
      "# Convertigo Generalist",
      "",
      "Use this skill for general Convertigo work. Keep it procedural and rely on the MCP guides for the detailed knowledge.",
      "",
      "## Skill freshness",
      "",
      "- Skill guidance version: `" + C8O.MCP_GUIDANCE_VERSION + "`.",
      "- During bootstrap, compare this value with `MCP guidance version` in `convertigo://capabilities`. If the MCP value differs or is missing, treat the installed skill and MCP endpoint as out of sync; rerun `_setupCodex` for the current MCP endpoint or ask before project mutation.",
      "- When the caller surface supports MCP request metadata, send `params._meta.convertigoGuidanceVersion` with this skill guidance version on the first guarded Convertigo `tools/call`; raw HTTP clients may use the `X-Convertigo-Guidance-Version` header. The MCP only warns on bootstrap or mutation guard tools, so treat `_meta.convertigoGuidanceWarning` as a setup refresh signal before further project mutation.",
      "",
      "## Mandatory bootstrap",
      "",
      "1. Call `resources/list`.",
      "2. If the caller surface exposes it, call `prompts/list`.",
      "3. Read `convertigo://capabilities`.",
      "4. Verify the skill freshness rule above against the `MCP guidance version` from capabilities.",
      "5. Read `convertigo://recipes/quickstart`.",
      "6. Read `convertigo://resources/convertigo-start`.",
      "7. Only then decide the route:",
      "   - Standard SQL CRUD + starter NGX UI: read `convertigo://resources/convertigo-crud-fastpath` and use `convertigo-crud-fastpath`.",
      "   - Existing deterministic CRUD project edits: also read `convertigo://resources/convertigo-crud-edit-fastpath`, then stay on the CRUD rail without replaying the new-project bootstrap.",
      "   - New starter NGX app outside the CRUD rail: read `convertigo://resources/convertigo-recipe-starter-extension` before import, then if the app has backend or open-data results, read `convertigo://resources/convertigo-recipe-ngx-data-page` before any page mutation.",
      "   - NGX / Ionic UI creation or edits outside the CRUD rail: read `convertigo://resources/convertigo-recipe-ngx-data-page` first for data-backed pages, then `convertigo://resources/convertigo-frontend-ngx` before UI mutations.",
      "   - Non-CRUD work or tasks outside the deterministic rail: stay exploratory and follow `convertigo-quickstart`.",
      "8. Do not call `rag-query` before the start guide and the chosen recipe were read.",
      "9. If the user explicitly wants MCP-only work or the starting workspace is empty/non-relevant, do not inspect the local shell workspace before the MCP route decision is made.",
      "",
      "## CRUD routing",
      "",
      "- Do not ask the user to choose `upsert-crud`.",
      "- Decide it yourself: use the CRUD rail only when the task is a standard SQL CRUD + starter NGX UI fit.",
      "- Generic CRUD UI default: `ui.variant=entity-pages`.",
      "- CRM-specific UI default: `ui.variant=master-detail`.",
      "- For a new UI project, validate the name, run `marketplace-import` with that exact name, open the viewer immediately with `mobile-builder-open(wait=false)`, then continue with `upsert-crud` and the staged UI kit while the builder warms up.",
      "- For an existing deterministic CRUD project that is already green, use the edit rail: `crud-status` -> optional early `mobile-builder-open(wait=false)` when UI work is likely -> `upsert-crud` -> backend `crud-proof` -> one `upsert-ngx-crud-kit stage=final` -> `mobile-builder-open(stateOnly=true, wait=true)` -> final `crud-proof(viewerUrl)` -> optional `project-save`.",
      "- For a low-detail CRUD prompt, stop after the first green scaffold + demo data: starter import, viewer open, `upsert-crud`, backend proof, `upsert-ngx-crud-kit` bootstrap/final, final UI proof, optional `project-save`, then return.",
      "- When relations are obvious, declare them explicitly in `spec.relations[]` instead of relying only on flat FK fields. Prefer entity UI hints such as `ui.relationFields` over direct edits on generated CRUD-kit components.",
      "- Prefer `seed.data` for explicit business demo rows. Do not patch `init_schema` manually after generation when `seed.data` can express the dataset in the spec.",
      "- Once the CRUD guides already documented the contract, do not grep the local workspace to rediscover the shapes of `relations[]`, `ui.relationFields`, or `seed.data`.",
      "- Generated CRUD facade sequences are hidden requestables that require an authenticated context. The generated UI now initializes that session once through a `Login` page that calls `auth_login(username,password)` and then redirects to the visible home page; the business pages should only bootstrap the CRUD data they need.",
      "- Do not start a second refinement pass on screens, layout, labels, or field-level UX unless the user explicitly asked for it.",
      "- Once the CRUD fast path is chosen, do not call `rag-query` unless the built-in guides and CRUD tools are no longer sufficient.",
      "- Prefer best-case-first generated code. Trust the standard error bubble for normal failures instead of adding defensive wrappers by default.",
      "",
      "## Project naming",
      "",
      "- Use exactly the project name requested by the user when it is technically valid.",
      "- Do not invent prefixes, suffixes, or dates.",
      "- If the requested name collides with an existing project, surface the collision explicitly instead of renaming it.",
      "",
      "## Viewer rule",
      "",
      "- In dev, `mobile-builder-open` serves the live app from the viewer root. Prefer `viewerHomeUrl`, or fall back to `viewerBaseUrl`.",
      "- For frontend work, call `mobile-builder-open` with `wait=false` as soon as the UI project is known, continue other work while it starts, then call `mobile-builder-open(stateOnly=true, wait=true)` or a normal waited call before browser smoke or final proof.",
      "- If `mobile-builder-open` returns `browserDebugUrl`, `browserDevToolsJsonUrl`, or `browserDevToolsWebSocketUrl`, attach Playwright or browser-control MCP to that endpoint and verify the actual feature in the visible Studio JxBrowser viewer.",
      "- Studio JxBrowser exposes one visible viewer target over CDP. Do not create new browser tabs or pages; reuse the current target returned by Playwright/browser-control.",
      "- Do not open `DisplayObjects/mobile/...` against the live HMR viewer.",
      "- In prod, the application URL is `.../DisplayObjects/mobile/home`.",
      "- If `mobile-builder-open` reports `compile_error`, treat that as a generator or source-object issue. Do not patch generated runtime sources.",
      "",
      "## Optional UI reveal mode",
      "",
      "- If the integrated assistant or host context says Convertigo reveal mode is enabled, pass `reveal:true` only on supported mutation/viewer tools that should visibly move Studio while you work: `databaseobject-tree-apply`, `mobile-builder-open`, `nocode-form-create`, `nocode-form-edit`, and `nocode-form-update`.",
      "- Do not add `reveal:true` to every read-only call. Use it for object creation/patches, mobile builder opening/polling when focusing the builder is useful, and no-code form mutations that should switch the visible No Code editor.",
      "- For `mobile-builder-open`, do not combine `reveal:true` with a long synchronous poll just to focus the UI. Use `wait:false` for reveal/focus polls; reserve long `wait:true` calls for readiness proof and omit `reveal` unless the user specifically needs UI focus.",
      "- Treat a `result.reveal.status` of `skipped`, `unsupported`, or `intent` as a UI hint result, not as a project mutation failure.",
      "",
      "## MCP-only boundary",
      "",
      "- Never edit or repair `_private/ionic`, `DisplayObjects`, `dist`, or other generated artifacts.",
      "- Generated artifacts are diagnostic-only surfaces. Fix the Convertigo source objects or the MCP generator instead.",
      "- Do not run `npm run build` or other manual frontend builds outside MCP to close a task.",
      "",
      "## Seed and visible data",
      "",
      "- Prefer realistic seed data by default.",
      "- Prefer semantic preview fields such as `name`, `title`, `city`, `email`, or `comment` over `id` when a visible choice exists.",
      "",
      "## Current public references",
      ""
    ].concat(referenceLines).concat([
      "",
      "## Local MCP endpoint",
      "",
      "- Expected local MCP entry: `" + trim(mcpUrl) + "`",
      "- If Codex is not yet configured for Convertigo, run the local Studio sequence `_setupCodex` from the ConvertigoMCP project.",
      ""
    ]).join("\n");
  }

  function buildNoCodeSkillMarkdown(mcpUrl) {
    var text = String(c8oReadCatalogFile("resources", "convertigo-nocode/SKILL.md"));
    var versionLine = "- Skill guidance version: `" + C8O.MCP_GUIDANCE_VERSION + "`.";
    var endpointLine = "- Expected MCP endpoint: `" + trim(mcpUrl) + "`.";

    if (/^- Skill guidance version: `[^`]*`\./m.test(text)) {
      text = text.replace(/^- Skill guidance version: `[^`]*`\./m, versionLine);
    } else {
      text = text.replace(
        "The core rule is simple: stay on the no-code form rail. Do not use Convertigo low-code tools to compensate for missing no-code capability.",
        "The core rule is simple: stay on the no-code form rail. Do not use Convertigo low-code tools to compensate for missing no-code capability.\n\n" +
        "## Skill freshness\n\n" +
        versionLine + "\n" +
        "- During bootstrap, compare this value with `MCP guidance version` in `convertigo://capabilities`. If the MCP value differs or is missing, rerun `_setupCodex` for the current MCP endpoint before using no-code mutation tools.\n" +
        "- When the caller surface supports MCP request metadata, send `params._meta.convertigoGuidanceVersion` with this skill guidance version on the first guarded Convertigo `tools/call`; raw HTTP clients may use the `X-Convertigo-Guidance-Version` header. The MCP only warns on bootstrap or mutation guard tools, so treat `_meta.convertigoGuidanceWarning` as a setup refresh signal before further no-code mutation."
      );
    }

    if (/^- Expected MCP endpoint: `[^`]*`\./m.test(text)) {
      text = text.replace(/^- Expected MCP endpoint: `[^`]*`\./m, endpointLine);
    } else {
      text = text.replace(
        "## Workflow",
        "## Convertigo MCP entry\n\n" +
        endpointLine + "\n" +
        "- Prefer the no-code MCP tools listed below over filesystem edits or low-code project mutations.\n\n" +
        "## Workflow"
      );
    }

    return text.replace(/\n*$/g, "\n");
  }

  function writeManagedFile(file, content, dryRun) {
    var existed = file.isFile();
    var previous = readTextIfExists(file);
    var next = String(content == null ? "" : content);
    if (previous === next) {
      return {
        status: "unchanged",
        existed: existed
      };
    }
    if (dryRun !== true) {
      writeText(file, next);
    }
    return {
      status: existed ? "updated" : "created",
      existed: existed
    };
  }

  function combineSkillStatuses(statuses) {
    var hasCreated = false;
    var hasUpdated = false;
    for (var i = 0; i < statuses.length; i++) {
      var status = trim(statuses[i]);
      if (status === "created") {
        hasCreated = true;
      } else if (status === "updated") {
        hasUpdated = true;
      }
    }
    if (hasCreated) {
      return "created";
    }
    if (hasUpdated) {
      return "updated";
    }
    return "unchanged";
  }

  C8O.setupCodex.run = function (options) {
    var File = Packages.java.io.File;
    var opts = options || {};
    var warnings = [];
    var dryRun = C8O.util.toBoolean(opts.dryRun, false) === true;
    var codexHome = resolveCodexHome(opts.codexHome);
    var resolvedMcpUrl = deriveMcpUrl(opts.mcpUrl, warnings);
    var skillsDir = new File(codexHome, "skills");
    var generalistSkillDir = new File(skillsDir, "convertigo-generalist");
    var generalistSkillFile = new File(generalistSkillDir, "SKILL.md");
    var noCodeSkillDir = new File(skillsDir, "convertigo-nocode");
    var noCodeSkillFile = new File(noCodeSkillDir, "SKILL.md");
    var configFile = new File(codexHome, "config.toml");
    var generalistSkillContent = buildSkillMarkdown(resolvedMcpUrl);
    var noCodeSkillContent = buildNoCodeSkillMarkdown(resolvedMcpUrl);
    var generalistSkillWrite = writeManagedFile(generalistSkillFile, generalistSkillContent, dryRun);
    var noCodeSkillWrite = writeManagedFile(noCodeSkillFile, noCodeSkillContent, dryRun);
    var combinedSkillStatus = combineSkillStatuses([generalistSkillWrite.status, noCodeSkillWrite.status]);

    var existingConfig = readTextIfExists(configFile);
    var patchedConfig = patchConfigToml(existingConfig, resolvedMcpUrl);
    if (patchedConfig.status !== "unchanged" && dryRun !== true) {
      writeText(configFile, patchedConfig.text);
    }

    return {
      skillStatus: combinedSkillStatus,
      configStatus: patchedConfig.status,
      resolvedCodexHome: String(codexHome.getAbsolutePath()),
      resolvedMcpUrl: resolvedMcpUrl,
      skillPath: String(generalistSkillFile.getAbsolutePath()),
      skillPaths: {
        generalist: String(generalistSkillFile.getAbsolutePath()),
        nocode: String(noCodeSkillFile.getAbsolutePath())
      },
      skills: {
        generalist: {
          slug: "convertigo-generalist",
          status: generalistSkillWrite.status,
          path: String(generalistSkillFile.getAbsolutePath())
        },
        nocode: {
          slug: "convertigo-nocode",
          status: noCodeSkillWrite.status,
          path: String(noCodeSkillFile.getAbsolutePath())
        }
      },
      warnings: warnings,
      nextSteps: [
        "Restart Codex to pick up the updated skill list.",
        "Start a fresh Codex session in the Convertigo workspace.",
        "Use the generated convertigo-generalist or convertigo-nocode skill for the current Convertigo surface."
      ],
      dryRun: dryRun
    };
  };
})();

var setupCodexResult = C8O.setupCodex.run({
  codexHome: (typeof codexHome !== "undefined") ? codexHome : "",
  mcpUrl: (typeof mcpUrl !== "undefined") ? mcpUrl : "",
  dryRun: (typeof dryRun !== "undefined") ? dryRun : false
});
