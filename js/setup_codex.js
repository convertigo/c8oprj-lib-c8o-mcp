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

  function configuredMcpUrl(url) {
    var text = trim(url);
    var fragment = "";
    var hash = text.indexOf("#");
    if (hash >= 0) {
      fragment = text.substring(hash);
      text = text.substring(0, hash);
    }
    if (/(^|[?&])jsonOnly=[^&]*/i.test(text)) {
      text = text.replace(/(^|[?&])jsonOnly=[^&]*/i, "$1jsonOnly=true");
    } else {
      text += (text.indexOf("?") >= 0 ? "&" : "?") + "jsonOnly=true";
    }
    return text + fragment;
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
    var guidanceHeaderEntry = '"X-Convertigo-Guidance-Version" = "' + tomlEscape(C8O.MCP_GUIDANCE_VERSION) + '"';
    var guidanceHeadersLine = "http_headers = { " + guidanceHeaderEntry + " }";
    var status = "unchanged";

    var mergeGuidanceHeader = function (line) {
      var source = String(line || "");
      var open = source.indexOf("{");
      var close = source.lastIndexOf("}");
      if (open < 0 || close <= open) {
        return guidanceHeadersLine;
      }
      var body = trim(source.substring(open + 1, close));
      var guidancePattern = /(["']X-Convertigo-Guidance-Version["']\s*=\s*)["'][^"']*["']/;
      if (guidancePattern.test(body)) {
        body = body.replace(guidancePattern, guidanceHeaderEntry);
      } else {
        body = body.length ? body + ", " + guidanceHeaderEntry : guidanceHeaderEntry;
      }
      return "http_headers = { " + body + " }";
    };

    if (!range.found) {
      if (lines.length && trim(lines[lines.length - 1]).length) {
        lines.push("");
      }
      lines.push("[mcp_servers.convertigo]");
      lines.push(urlLine);
      lines.push(timeoutLine);
      lines.push(guidanceHeadersLine);
      status = text.length ? "updated" : "created";
      return {
        status: status,
        text: lines.join("\n").replace(/\n+$/, "\n")
      };
    }

    var sectionLines = lines.slice(range.start, range.end);
    var replacedUrl = false;
    var replacedTimeout = false;
    var replacedGuidanceHeaders = false;
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
        continue;
      }
      if (/^\s*http_headers\s*=/.test(sectionLines[i])) {
        var mergedGuidanceHeaders = mergeGuidanceHeader(sectionLines[i]);
        if (trim(sectionLines[i]) !== mergedGuidanceHeaders) {
          sectionLines[i] = mergedGuidanceHeaders;
          status = "updated";
        }
        replacedGuidanceHeaders = true;
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
    if (!replacedGuidanceHeaders) {
      sectionLines.push(guidanceHeadersLine);
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
      resourceSummary("convertigo://resources/convertigo-project-review", "Convertigo Project Review Guide"),
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
      "- When the caller surface supports MCP request metadata, send `params._meta.convertigoGuidanceVersion` with this skill guidance version on the first guarded Convertigo `tools/call`; raw HTTP clients may use the `X-Convertigo-Guidance-Version` header. An `_meta.convertigoGuidanceWarning` mismatch requires setup refresh before project mutation. A missing-version warning is advisory when this skill version already matches `convertigo://capabilities`: continue the current task and let the managed host refresh its transport configuration.",
      "",
      "## Mandatory bootstrap",
      "",
      "Bootstrap is required once per agent conversation for a given MCP endpoint and guidance version, not once per user message. On follow-up turns, reuse the skill, capabilities, and route guides already present in the conversation context. Do not reopen this `SKILL.md`, reread `convertigo://capabilities`, or reread an already-used guide unless the MCP endpoint changed, the MCP reports a guidance-version mismatch, or the required bootstrap context is explicitly unavailable.",
      "",
      "1. Read `convertigo://capabilities` directly and verify the skill freshness rule above.",
      "2. Do not call `resources/list`, `resources/templates/list`, or `prompts/list` when this skill already names the required URI or tool. Use catalog discovery only when the task cannot be routed from this skill, a named resource is missing, or the MCP reports a guidance mismatch.",
      "3. Select the smallest matching route and read only its entry recipe before mutation:",
      "   - Project review, audit, expertise note, client synthesis, hardening plan, recommendations, or V1/V2 comparison: read `convertigo://resources/convertigo-project-review` before inspecting or reporting.",
      "   - Standard SQL CRUD + starter NGX UI: read `convertigo://resources/convertigo-crud-fastpath` and use `convertigo-crud-fastpath`.",
      "   - Existing deterministic CRUD project edits: also read `convertigo://resources/convertigo-crud-edit-fastpath`, then stay on the CRUD rail without replaying the new-project bootstrap.",
      "   - New starter NGX app outside the CRUD rail: read `convertigo://resources/convertigo-recipe-starter-extension` before import, then if the app has backend or open-data results, read `convertigo://resources/convertigo-recipe-ngx-data-page` before any page mutation.",
      "   - NGX / Ionic UI creation or edits outside the CRUD rail: read `convertigo://resources/convertigo-recipe-ngx-data-page` for data-backed pages. Read `convertigo://resources/convertigo-frontend-ngx` only when the recipe and live palette contract leave an implementation question.",
      "   - Other tasks: read `convertigo://resources/convertigo-start`, then the smallest matching recipe. Read `convertigo://recipes/quickstart` only when route selection remains ambiguous.",
      "4. Do not call `rag-query` before the chosen recipe was tried.",
      "5. If the user explicitly wants MCP-only work or the starting workspace is empty/non-relevant, do not inspect the local shell workspace before the MCP route decision is made.",
      "",
      "## Tool economy and convergence",
      "",
      "- Treat every tool round trip and large response as part of the task cost. Prefer targeted reads and request only the depth, properties, logs, or detail needed for the next decision.",
      "- The active skill text is already in conversation context. Do not use shell, grep, or file-reading tools to rediscover installed skill files after bootstrap; read a named MCP guide directly only when the current task needs it.",
      "- Do not repeat catalog, guide, palette, tree, builder, or browser reads whose answer is already present in the current conversation.",
      "- Use `palette-list` to locate an unfamiliar object type and `palette-describe` only for properties that remain uncertain. Group independent descriptions when the caller can do so safely.",
      "- Build one coherent mutation plan before the first write. Prefer one optimized `batch-call` for independent or ordered source-object changes, followed by one targeted readback.",
      "- A class/property shape already used successfully in the current conversation or returned by a targeted tree read is a confirmed contract. Do not reconfirm it through palette calls or tool-metadata inspection.",
      "- Common NGX contracts that do not require palette discovery are `UIStyle#UIStyle.styleContent`, `UIAttribute#UIAttribute.attrName/attrValue`, `UIDynamicElement#TextItem`, and `UIText#UIText.textValue`.",
      "- For one intent spanning independent targets, call `batch-call` with `{calls:[{tool:\"databaseobject-tree-apply\",arguments:{...}}],onError:\"stop\",optimizeMutations:true}`. The optimized batch performs one final refresh, save, and mobile-builder notification. Keep the default compact response; use `responseDetail:\"full\"` only to diagnose a specific batch failure.",
      "- Named core tools in this skill are already routed. Do not inspect `ALL_TOOLS` merely to rediscover the signatures of `batch-call`, `mobile-builder-open`, or Playwright snapshot/find/evaluate calls.",
      "- For `databaseobject-tree-get`, use `childrenDepth` for recursive descendants and request the needed subtree once instead of walking one QName level per call. `depth` is accepted only as a compatibility alias.",
      "- For `databaseobject-tree-apply` with `at:\"inside\"`, `tree` is the one child being created and must include its own `className` and `name`; never submit a children-only wrapper. Put sibling creations in separate optimized `batch-call` entries.",
      "- For an unfamiliar NGX object, call `palette-list` with the exact intended parent QName as `target`, then pass its returned logical `className` unchanged to `palette-describe`. Do not list at project scope and guess a `#logicalId`.",
      "- Start the viewer asynchronously once UI work is known. Finish the source mutations while it builds, then perform one readiness check and one acceptance-oriented browser proof. Add another cycle only when the proof identifies a concrete defect.",
      "- A browser proof should evaluate all relevant acceptance criteria together when practical: visible content, layout/style, interaction or timed state, and console/runtime errors.",
      "- Stop after the requested behavior is green. Do not add an unsolicited polish pass or repeat proof that cannot change the conclusion.",
      "",
      "## NGX authoring invariants",
      "",
      "- Use the exact SmartType shape reported by the live palette or a successful readback. Do not invent aliases such as `JS`, `SCRIPT`, `PLAIN`, `expression`, or `value` interchangeably.",
      "- For page state changed outside an Angular/Ionic event, such as timers, external callbacks, or third-party subscriptions, ensure Angular change detection is triggered through the supported page context before claiming live updates.",
      "- Scope page CSS to the element that actually paints the visible area. Do not assume a class or CSS variable crosses an Ionic shadow boundary; include background coverage in the first browser proof.",
      "- When a mutation result reports skipped or normalized properties, repair them before browser proof instead of relying on runtime trial and error.",
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
      "- The low-detail stop rule applies only when the user requested generic CRUD. Before mutation, list the explicit acceptance behaviors from the request. Filters, counters, domain actions, dashboards, or other named interactions are not proven by the presence of fields or a generic list/detail/form shell; implement and validate each one before claiming completion.",
      "- If the CRUD kit has no declarative hint for an explicit interaction, treat the generated kit as a starting point and perform one focused source-object extension before the final builder and browser proof.",
      "- When relations are obvious, declare them explicitly in `spec.relations[]` instead of relying only on flat FK fields. Prefer entity UI hints such as `ui.relationFields` over direct edits on generated CRUD-kit components.",
      "- Prefer `seed.data` for explicit business demo rows. Do not patch `init_schema` manually after generation when `seed.data` can express the dataset in the spec.",
      "- Once the CRUD guides already documented the contract, do not grep the local workspace to rediscover the shapes of `relations[]`, `ui.relationFields`, or `seed.data`.",
      "- Generated CRUD facade sequences are hidden requestables that require an authenticated context. The generated UI now initializes that session once through a `Login` page that calls `auth_login(username,password)` and then redirects to the visible home page; the business pages should only bootstrap the CRUD data they need.",
      "- Do not start a second refinement pass on screens, layout, labels, or field-level UX unless the user explicitly asked for it.",
      "- Once the CRUD fast path is chosen, do not call `rag-query` unless the built-in guides and CRUD tools are no longer sufficient.",
      "- Prefer best-case-first generated code. Trust the standard error bubble for normal failures instead of adding defensive wrappers by default.",
      "",
      "## Optional project review route",
      "",
      "- Use this route when the user asks for a Convertigo project review, audit, expertise report, security/quality review, hardening plan, recommendations, client synthesis, or V1/V2 comparison.",
      "- This route is static review by default. Do not mutate the project unless the user explicitly asks for fixes; clearly label the limit as `static review only`, `static review plus runtime checks`, or `static review plus code changes`.",
      "- Choose the mode first: `fresh review`, `progress review`, `client synthesis`, or `detailed expertise note`. If older reviews exist, prefer `progress review` and compare old recommendations against the current state before adding new findings.",
      "- Frame the scope explicitly as backend only, frontend only, or both. Keep detailed backend and frontend conclusions separate first; merge only at synthesis level unless the user asks for one combined report.",
      "- Inventory before judging. Backend inventory covers connectors, transactions, sequences, requestable exposure, references, authentication, administration, files/exports/mail, dynamic SQL, tests/debug/disabled nodes, and branch/tag governance. Frontend inventory covers pages, backend calls, shared components, shared actions, fragments, menus, disabled nodes, console logs, duplicated orchestration, old project references, and branch/tag governance.",
      "- Reason from effective runtime exposure: absent `accessibility` means effectively `Public`; absent `authenticatedContextRequired` means effectively `false`. Recommend hardening targets such as `Public -> Hidden`, `Public -> Private`, and `false -> true`; do not recommend merely defining the property.",
      "- Backend default stance: `Public` should be exceptional and deliberate; business sequences usually target `Hidden + authenticatedContextRequired=true`; internal helpers usually target `Private`; transactions should not remain directly requestable by convenience alone.",
      "- Before recommending `Private`, map visible callers first: frontend calls, other sequences, shared actions, and shared components.",
      "- Frontend doctrine: fragments are a bad practice unless narrowly justified; large admin pages are architecture smells; repeated orchestration chains should become shared actions; reusable shared components may belong in a shared library.",
      "- Build findings from direct evidence. Present findings first, ordered by severity. For each finding name the affected sequence, transaction, page, shared component, or shared action; state observed evidence, risk, and recommended target state.",
      "- For V1/V2 comparisons, structure the review as: major V1 recommendations, current-state changes, `treated` / `partially treated` / `not treated` / `removed from the perimeter`, then new priorities.",
      "- For client-facing reports, avoid repository jargon such as `YAML`, `_c8oProject`, descriptor, or file-level paths unless implementation detail is requested. Use audience terms: sequence, transaction, page, shared component, shared action, backend service, flow, exposure, access control, delivery governance.",
      "- Suggested deliverables when files are requested: `revue_securite_qualite.md`, `revue_frontend_securite_qualite.md`, `synthese_client_backend_preconisations.md`, and `synthese_client_frontend_preconisations.md`; use `_v2` or `_v3` for explicit later passes.",
      "",
      "## Project naming",
      "",
      "- Use exactly the project name requested by the user when it is technically valid.",
      "- If no project is selected and the user explicitly asks to create a new project or application without giving a technical name, derive one concise valid name from the requested product or function, check `project-list` for collisions, then proceed without asking the user to select a project.",
      "- Do not invent prefixes, suffixes, or dates.",
      "- If the requested name collides with an existing project, surface the collision explicitly instead of renaming it.",
      "",
      "## Viewer rule",
      "",
      "- In dev, `mobile-builder-open` serves the live app from the viewer root. Prefer `viewerHomeUrl`, or fall back to `viewerBaseUrl`.",
      "- For frontend work, call `mobile-builder-open` with `wait=false` as soon as the UI project is known, continue other work while it starts, then call `mobile-builder-open(stateOnly=true, wait=true)` or a normal waited call before browser smoke or final proof.",
      "- If a state-only call returns `status:\"stopped\"`, do not poll it again: immediately call `mobile-builder-open(stateOnly=false, wait=false)` once, continue other work while it starts, then poll readiness.",
      "- Use Playwright MCP only after `mobile-builder-open` reports both `browserDebugPortMatched:true` and `browserControlReady:true`.",
      "- Studio JxBrowser exposes one existing visible page over CDP, not a normal multi-tab browser. Do not create, open, close, select, or navigate tabs/pages; reuse the current page.",
      "- Known-good fast check on this JxBrowser target: call `playwright.browser_tabs` only to list and confirm the single current viewer URL, use `playwright.browser_find` for visible UI, and use `playwright.browser_evaluate` only when DOM state or timing must be measured. Do not probe unsupported browser features before this minimal check.",
      "- An `about:blank` target means the loader is not ready. If the builder status is `building`, poll `mobile-builder-open(stateOnly=true, wait=true)`; if it is `stopped`, launch it asynchronously as described above.",
      "- If a waited `mobile-builder-open` result reports `browserControlReady:true` but Playwright/browser-control MCP tools are missing, disabled, stale, or still attached to another URL, stop the browser proof and tell the user that the managed Playwright MCP configuration must be refreshed. Do not work around it with Node scripts, raw CDP, or a new browser.",
      "- Do not open `DisplayObjects/mobile/...` against the live HMR viewer.",
      "- In prod, the application URL is `.../DisplayObjects/mobile/home`.",
      "- If `mobile-builder-open` reports `compile_error`, treat that as a generator or source-object issue. Do not patch generated runtime sources.",
      "",
      "## Optional UI reveal mode",
      "",
      "- If the integrated assistant or host context says Convertigo reveal mode is enabled, pass `reveal:true` only on supported mutation/viewer tools that should visibly move Studio while you work: `databaseobject-tree-apply`, `mobile-builder-open`, `nocode-form-create`, `nocode-form-edit`, and `nocode-form-update`.",
      "- If those mutations are grouped with `batch-call`, pass top-level `reveal:true`; the batch reveals the final touched object after its deferred refresh.",
      "- Do not add `reveal:true` to every read-only call. Use it for object creation/patches, mobile builder opening/polling when focusing the builder is useful, and no-code form mutations that should switch the visible No Code editor.",
      "- For `mobile-builder-open`, do not combine `reveal:true` with a long synchronous poll just to focus the UI. Use `wait:false` for reveal/focus polls; reserve long `wait:true` calls for readiness proof and omit `reveal` unless the user specifically needs UI focus.",
      "- Treat a `result.reveal.status` of `skipped`, `unsupported`, or `intent` as a UI hint result, not as a project mutation failure.",
      "",
      "## MCP-only boundary",
      "",
      "- Convertigo project descriptors are MCP-owned. Never read or edit `c8oProject.yaml`, `_c8oProject/**/*.yaml`, or `project.xml` as an authoring fallback. If a required MCP operation still fails after one targeted retry, stop and report the blocker without mutating project files.",
      "- Never edit or repair `_private/ionic`, `DisplayObjects`, `dist`, or other generated artifacts.",
      "- Generated artifacts are diagnostic-only surfaces. Fix the Convertigo source objects or the MCP generator instead.",
      "- Do not run `npm run build` or other manual frontend builds outside MCP to close a task.",
      "- For NGX shared actions/custom actions that need npm packages, declare dependencies on the action with `package_dependencies`; do not patch generated package files or rely on manual `npm install`.",
      "- For `UICustomAsyncAction` code emitted in `actionbeans.service.ts`, put npm API imports in `app_ts_imports`. Example: import clause `{ loadStripe }` from module `@stripe/stripe-js` for Stripe.js.",
      "- Keep Convertigo import/dependency properties as nested XMLVector rows: imports are `[importClause, moduleName]`, dependencies are `[packageName, version]`. The tree view may display compact rows such as `[{ loadStripe }, @stripe/stripe-js]` or `[@stripe/stripe-js, 9.9.0]`, but the source must not be a single CSV-like string.",
      "- Use `UICustomAsyncAction` when action code contains `await`; plain `UICustomAction` code must not contain top-level `await`.",
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
        "- When the caller surface supports MCP request metadata, send `params._meta.convertigoGuidanceVersion` with this skill guidance version on the first guarded Convertigo `tools/call`; raw HTTP clients may use the `X-Convertigo-Guidance-Version` header. An `_meta.convertigoGuidanceWarning` mismatch requires setup refresh before no-code mutation. A missing-version warning is advisory when this skill version already matches `convertigo://capabilities`: continue the current task and let the managed host refresh its transport configuration."
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
    var compactMcpUrl = configuredMcpUrl(resolvedMcpUrl);
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
    var patchedConfig = patchConfigToml(existingConfig, compactMcpUrl);
    if (patchedConfig.status !== "unchanged" && dryRun !== true) {
      writeText(configFile, patchedConfig.text);
    }

    return {
      skillStatus: combinedSkillStatus,
      configStatus: patchedConfig.status,
      resolvedCodexHome: String(codexHome.getAbsolutePath()),
      resolvedMcpUrl: resolvedMcpUrl,
      configuredMcpUrl: compactMcpUrl,
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
