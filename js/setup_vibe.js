include("js/util.js");
include("js/resources.js");
include("js/prompts.js");

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.setupVibe = C8O.setupVibe || {};

(function () {
  function trim(value) {
    return value == null ? "" : String(value).trim();
  }

  function userHomeDirectory() {
    return trim(java.lang.System.getProperty("user.home"));
  }

  function resolveVibeHome(input) {
    var File = Packages.java.io.File;
    var raw = trim(input);
    if (!raw.length) {
      raw = "~/.vibe";
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
    return trim(url).replace(/\/+$/g, "");
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
        if (warnings && warnings.push) {
          warnings.push("Resolved MCP URL from the local server base URL using the default /convertigo/api/mcp suffix.");
        }
        return ensureTrailingPath(baseUrl, "/convertigo/api/mcp");
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
      resourceSummary("convertigo://resources/convertigo-vibe-start", "Convertigo Vibe Start"),
      resourceSummary("convertigo://resources/convertigo-vibe-http-ngx-fastpath", "Convertigo Vibe HTTP NGX Fast Path"),
      resourceSummary("convertigo://resources/convertigo-recipe-starter-extension", "Convertigo Starter Extension Recipe"),
      resourceSummary("convertigo://resources/convertigo-recipe-ngx-data-page", "Convertigo NGX Data Page Recipe"),
      resourceSummary("convertigo://resources/convertigo-frontend-ngx", "Convertigo Frontend NGX"),
      promptSummary("convertigo-vibe-quickstart", "Convertigo Vibe Quickstart"),
      promptSummary("convertigo-quickstart", "Convertigo MCP Quickstart")
    ];
    var lines = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var pointer = item.uri ? ("`" + item.uri + "`") : ("`" + item.name + "`");
      var label = trim(item.title);
      var description = trim(item.description);
      lines.push("- " + pointer + " - " + label + (description.length ? (": " + description) : ""));
    }
    return lines;
  }

  function buildSkillMarkdown(mcpUrl) {
    var referenceLines = buildReferenceLines();
    return [
      "---",
      "name: convertigo-vibe-generalist",
      "description: Bootstrap Mistral Vibe for Convertigo MCP work. Use it to select the smallest Convertigo MCP guide, prefer the compact HTTP NGX fast path for fresh web-service data apps, and mutate Convertigo projects only through MCP tools.",
      "---",
      "",
      "# Convertigo Vibe Generalist",
      "",
      "Use this skill for Convertigo work from Mistral Vibe. Keep the prompt small; this skill chooses the Convertigo guide rail.",
      "",
      "## Skill freshness",
      "",
      "- Skill guidance version: `" + C8O.MCP_GUIDANCE_VERSION + "`.",
      "- During bootstrap, compare this value with `MCP guidance version` in `convertigo://capabilities`. If the MCP value differs or is missing, treat the installed skill and MCP endpoint as out of sync; rerun `_setupVibe` for the current MCP endpoint or ask before project mutation.",
      "- When the caller surface supports MCP request metadata, send `params._meta.convertigoGuidanceVersion` with this skill guidance version on the first guarded Convertigo `tools/call`; raw HTTP clients may use the `X-Convertigo-Guidance-Version` header. The MCP only warns on bootstrap or mutation guard tools, so treat `_meta.convertigoGuidanceWarning` as a setup refresh signal before further project mutation.",
      "",
      "## Mandatory bootstrap",
      "",
      "1. Use the configured MCP server named `Convertigo`.",
      "2. When an exact guide URI is named below, skip broad catalog/list calls and read that URI directly with `Convertigo_requestable-execute` -> `ConvertigoMCP.mcp_resources_read` using `variables.uri`. Do not use `variables.path` for resource reads.",
      "3. For a fresh NGX app backed by an HTTP web service, read only `convertigo://resources/convertigo-vibe-http-ngx-fastpath` before mutation.",
      "4. For other or blocked tasks, fall back to `convertigo://resources/convertigo-start` and `convertigo://resources/convertigo-vibe-start`, then choose the smallest matching recipe.",
      "5. Read `convertigo://capabilities` and verify the skill freshness rule above against the `MCP guidance version`.",
      "6. Read `convertigo://recipes/quickstart` before broad fallback routing.",
      "7. Do not call `Convertigo_rag-query` before the selected guide has been read and tried.",
      "",
      "## Headless Discipline",
      "",
      "- Treat guides as technical invariants only: MCP call ordering, object creation, readback, proof, binding modes, error handling, and generated-artifact boundaries.",
      "- Do not turn example prompts into provider-, dataset-, locale-, language-, or feature-specific requirements unless the current user task explicitly asks for them.",
      "- For HTTP-backed apps, prove the application contract before choosing a provider or mutating the project: requested record/entity class, user-facing query/filter, collection shape, fields that prove each item is a real requested record, and adjacent artifacts that would not satisfy the request. Structured JSON alone is not proof if it contains only labels, suggestions, documents, metadata, or generic lookup results.",
      "- Do not install or modify the Codex `convertigo-generalist` skill from this Vibe adapter.",
      "- Keep the exact requested project name when technically valid.",
      "- When restricting tools with `--enabled-tools`, repeat the flag once per tool. Do not pass a comma-separated list.",
      "- Work through Convertigo MCP source-object tools; never edit `_private/ionic`, `DisplayObjects`, `dist`, or generated artifacts.",
      "- Do not probe public HTTP URLs through guessed ConvertigoMCP helpers such as `mcp_http_get`. Prove HTTP APIs only by creating a typed Convertigo HTTP transaction and executing that transaction.",
      "- Keep automated generation isolated: do not call `project-list`, do not inspect existing local projects, and do not copy patterns from other projects unless the user prompt explicitly names a reference project to inspect. Only the requested target project, explicitly named reference projects, ConvertigoMCP resource reads, and marketplace import are in scope.",
      "- After the guide read, every project QName you inspect or mutate must start with the requested target project name, except the single `marketplace-import` template id and `ConvertigoMCP.*` resource reads. Do not target generic roots such as `Convertigo`, `WorkSpace`, `Projects`, `C8O`, or another project. Do not create a project manually with `databaseobject-tree-apply`; project creation must come from `marketplace-import`.",
      "- Treat `status:\"partial\"`, skipped properties, stale incompatible properties, failed operations, child patch errors, failed palette creation, or metadata-only runtime output as failed proof to repair before continuing. If a partial create touched the UI tree, read back the affected root and delete/recreate the malformed child before adding more objects.",
      "- Never choose an HTTP API that requires credentials, API keys, tokens, usernames, demo accounts, or quota-limited sample access. Do not hide those values in backend defaults; choose a no-credential direct record endpoint or report proof incomplete.",
      "- In Vibe, MCP tool calls in one assistant message may run concurrently. Use parallel calls only for independent reads; keep dependent mutations sequential.",
      "- Avoid broad `log-view` and broad deep `databaseobject-tree-get` in headless loops. Prefer targeted readback of the object just created or edited.",
      "- Stop after first green backend proof, final project save, and mobile-builder proof. External callers may perform independent validation.",
      "- After a green proof, readback, or successful delete, continue with the next required MCP mutation immediately. Keep reasoning short; do not spend a turn restating evidence or composing optional UI when the guide already gives the next required object.",
      "- For result loops, `directiveName:\"ForEach\"` is not enough. Before adding any row text, read back the `UIControlDirective`; it must show `directiveSource`, `directiveItemName`, and `directiveIndexName`. The exact root used by row text must match `directiveItemName`: `{{ item.x }}` requires `directiveItemName:\"item\"`, and `{{ record.x }}` requires `directiveItemName:\"record\"`. The visible row components that use that root must be children of the `UIControlDirective`, not siblings before or after it; otherwise Angular compiles the alias as a missing page property.",
      "",
      "## Core Rails",
      "",
      "- Fresh NGX app: import `template_ngxBuilderIonic` exactly once with the exact requested project name as imported project name, then mutate the visible entry page. Open the mobile builder only once, after backend, UI, save, and targeted readback are complete, as the final proof step.",
      "- HTTP data app: keep `HttpConnector` + typed HTTP transaction + public facade sequence. Do not replace live web-service integration with stubs, hard-coded records, `SimpleStep`, or `JavaScriptStep` after proof failures.",
      "- Direct HTTP and facade proofs are green only when the live payload contains records that satisfy the application contract. If the payload is structured but represents adjacent artifacts, keep the rail and report proof incomplete instead of moving to UI work or switching provider.",
      "- If the first direct HTTP proof is metadata-only, empty, or malformed, repair only the same connector/transaction shape first: read back `server`, `baseDir`, `subDir`, and request-variable `httpName`, then retry the alternate slash shape before adding fixed technical variables, guessed headers, extra query variables, or changing provider.",
      "- HTTP transaction proof and `TransactionStep.sourceTransaction` use the runtime path `<Project>.<Connector>.<Transaction>`, never the Studio QName `<Project>.cn:<Connector>.tr:<Transaction>`.",
      "- UI data page: initialize page locals on page enter with `SetLocalAction`; each local initializer must set `Property` to the local name in PLAIN mode and `Value` to a concrete SCRIPT/PLAIN assignment. Bind page locals with Local SmartSource/source mode; bind user input controls via `Binding`/`DoubleBinding`, not `ionChange`.",
      "- Backend call UI: create `SetLocalAction(loading=true)` under the `UIControlEvent`, then create `CallSequenceAction(requestable=<Project>.<Facade>)` under the same event. `UIControlVariable`, `StoreResults`, and `SetLoadingFalse` must be children of that `CallSequenceAction`; any action that reads `out` is invalid as a sibling under the event.",
      "- `UIControlVariable` only passes request variables to the backend call. Never use it to store results and never set guessed result-storage properties on it. Store the call output with a child `SetLocalAction` named `StoreResults`, with `Property=results`, under the `CallSequenceAction`.",
      "- Before builder proof, verify the visible starter body was removed by deleting exact starter placeholder nodes or replacing the whole visible content with a complete subtree. A starter placeholder left empty, commented, renamed, or still present by QName is not removed.",
      "- Every primary visible trigger must have a direct `UIText` child with a non-empty plain label before final save. A compiled empty button is a failed UI proof.",
      "- Facade output consumed by UI must be a public application contract such as `array`, `items`, `features`, or `{items,total,query}`; final UI must not read `out.transaction`, `transaction.document`, `HttpInfo`, or headers.",
      "- After deleting starter content, do not pause to design a large custom UI. Immediately create the page-enter local initializers, then the minimum visible data page: heading, query input bound with Local SmartSource, primary trigger with `UIText`, call action chain, result list, save, builder proof.",
      "",
      "## Important Guide URIs",
      "",
      "- `convertigo://resources/convertigo-vibe-http-ngx-fastpath` - compact path for fresh HTTP-backed NGX data apps.",
      "- `convertigo://resources/convertigo-recipe-http-facade` - detailed fallback for HTTP connector/facade issues.",
      "- `convertigo://resources/convertigo-recipe-ngx-data-page` - detailed fallback for NGX page binding/action issues.",
      "- `convertigo://resources/convertigo-vibe-start` - broader Vibe adapter guidance.",
      "- `convertigo://resources/convertigo-start` - general Convertigo start guide.",
      "",
      "## Current Public References",
      ""
    ].concat(referenceLines).concat([
      "",
      "## Local MCP Endpoint",
      "",
      "- Expected local MCP entry: `" + trim(mcpUrl) + "`",
      "- If Vibe is not yet configured for Convertigo, run `_setupVibe` from the ConvertigoMCP project.",
      ""
    ]).join("\n");
    return [
      "---",
      "name: convertigo-vibe-generalist",
      "description: Bootstrap Mistral Vibe for general Convertigo MCP work. Use it to connect to the Convertigo MCP server, read the MCP guides first, and follow shared Convertigo recipes without touching Codex resources.",
      "---",
      "",
      "# Convertigo Vibe Generalist",
      "",
      "Use this skill for Convertigo work from Mistral Vibe. Keep this adapter thin: the MCP resources are the source of truth.",
      "",
      "## Skill freshness",
      "",
      "- Skill guidance version: `" + C8O.MCP_GUIDANCE_VERSION + "`.",
      "- During bootstrap, compare this value with `MCP guidance version` in `convertigo://capabilities`. If the MCP value differs or is missing, treat the installed skill and MCP endpoint as out of sync; rerun `_setupVibe` for the current MCP endpoint or ask before project mutation.",
      "- When the caller surface supports MCP request metadata, send `params._meta.convertigoGuidanceVersion` with this skill guidance version on the first guarded Convertigo `tools/call`; raw HTTP clients may use the `X-Convertigo-Guidance-Version` header. The MCP only warns on bootstrap or mutation guard tools, so treat `_meta.convertigoGuidanceWarning` as a setup refresh signal before further project mutation.",
      "",
      "## Mandatory bootstrap",
      "",
      "1. Use the configured MCP server named `Convertigo`.",
      "2. If native MCP resources and prompts are visible in Vibe, call their list/read operations first.",
      "3. If Vibe only exposes Convertigo as tools, use `Convertigo_requestable-execute` to call:",
      "   - `ConvertigoMCP.mcp_resources_list` with no `uri` argument",
      "   - `ConvertigoMCP.mcp_prompts_list` with no `name` argument",
      "   - `ConvertigoMCP.mcp_resources_read` with `variables.uri` for each exact guide URI",
      "4. Read `convertigo://capabilities`.",
      "5. Verify the skill freshness rule above against the `MCP guidance version` from capabilities.",
      "6. Read `convertigo://recipes/quickstart`.",
      "7. Read `convertigo://resources/convertigo-start`.",
      "8. Read `convertigo://resources/convertigo-vibe-start`.",
      "9. Pick the smallest matching shared recipe before mutating anything.",
      "10. Do not call `Convertigo_rag-query` before the start guide and the chosen recipe were read.",
      "",
      "## MCP call discipline",
      "",
      "- Treat the Convertigo MCP guides as technical invariants only: call ordering, object creation, readback, proof, binding modes, error handling, and generated-artifact boundaries. Do not turn example prompts into provider-, dataset-, locale-, language-, or feature-specific requirements unless the current user task explicitly asks for them.",
      "- Use `Convertigo_requestable-execute` only for existing Convertigo requestables such as `ConvertigoMCP.mcp_resources_read`.",
      "- `ConvertigoMCP.mcp_resources_read` reads MCP guide resources only. Never pass an external HTTP URL to it, and do not invent helper requestables such as `ConvertigoMCP.mcp_http_get` for arbitrary URL probes. Prove HTTP APIs only by creating a typed Convertigo HTTP transaction and executing that transaction.",
      "- Do not invent requestable names such as `ConvertigoMCP.resources/templates/list`.",
      "- Do not pass a guide URI to `mcp_resources_list`; list is for catalog discovery, read is for one URI.",
      "- When a guide URI is already known, skip list retries and call `ConvertigoMCP.mcp_resources_read` directly.",
      "- Treat a `status:\"partial\"`, skipped property, or failed palette creation as a failed mutation to correct before continuing.",
      "- Never choose an HTTP API that requires credentials, API keys, tokens, usernames, demo accounts, or quota-limited sample access. Do not hide those values in backend defaults; choose a no-credential direct record endpoint or report proof incomplete.",
      "- In Vibe, multiple MCP tool calls in one assistant message are executed concurrently. Use parallel calls only for independent reads. In headless automation loops, avoid parallel MCP mutations entirely; direct sequential mutations are easier to validate and recover.",
      "",
      "## Vibe isolation",
      "",
      "- Prefer a task-local `VIBE_HOME` for isolated generation and skill-adjustment loops.",
      "- Keep `enabled_skills = [\"convertigo-vibe-generalist\"]` in isolated Vibe homes so global skills do not influence the run.",
      "- Do not install or modify the Codex `convertigo-generalist` skill from this Vibe adapter.",
      "- Do not copy API keys, `.env` files, or unrelated user configuration into an isolated Vibe home.",
      "",
      "## Prompt discipline",
      "",
      "- The user prompt should ask Vibe to use this skill and state the product goal.",
      "- Do not expect the user prompt to repeat Convertigo rules; the guides provide those constraints.",
      "- In headless runs, do not ask the user for clarifications unless blocked by missing credentials or destructive ambiguity.",
      "- When restricting tools with `--enabled-tools`, repeat the flag once per tool. Do not pass a comma-separated list.",
      "- Use exact requested project names when technically valid.",
      "",
      "## Fresh starter app rail",
      "",
      "- For a fresh NGX app, after reading `convertigo://resources/convertigo-recipe-starter-extension`, import `template_ngxBuilderIonic` with the exact requested project name.",
      "- Do not guess marketplace names such as `NGXAppStarter`.",
      "- Open the mobile builder early with `Convertigo_mobile-builder-open wait=false`, continue other work while it starts, then call `Convertigo_mobile-builder-open stateOnly=true wait=true` before live proof. If a JxBrowser debug endpoint is returned, attach Playwright or browser-control MCP to that endpoint for the visible Studio viewer proof. Studio JxBrowser exposes one visible viewer target over CDP; do not create new browser tabs or pages.",
      "- For any app that consumes an HTTP web service, read `convertigo://resources/convertigo-recipe-http-facade` before creating the connector, transaction, or facade sequence. This applies to HTTP-backed data flows regardless of provider, dataset, or requested contract.",
      "- Before choosing an HTTP provider or mutating the project, prove the application contract in neutral terms: requested record/entity class, user-facing query/filter, collection shape, fields that prove each item is a real requested record, and adjacent artifacts that would not satisfy the request. Structured JSON alone is not proof if it contains only labels, suggestions, documents, metadata, technical identifiers without usable fields, or generic lookup results.",
      "- The chosen HTTP provider must satisfy the requested data contract. If the app is about queryable records, the endpoint must return records with useful fields for that contract, not only adjacent artifacts such as labels, suggestions, URLs, display metadata, generic lookup output, or documentation text. If proof fails because of malformed paths, metadata-only output, empty text, DNS, TLS, missing credentials, quota, or provider errors, first fix the same connector/transaction settings. In headless automation loops, do not switch providers for metadata-only, empty-text, or malformed-path failures; keep the HTTP rail and mark the live proof incomplete unless the provider returns an explicit application/domain error proving that endpoint cannot satisfy the requested contract.",
      "- For data-backed pages, including pages backed by HTTP web services, read `convertigo://resources/convertigo-recipe-ngx-data-page` before the first UI mutation.",
      "- Mutate the actual visible entry page first. On the starter this is usually `Application.NgxApp.pg:Page`, especially `Page.Content`.",
      "- Do not create only a secondary feature page while the visible entry page still shows the starter body.",
      "- Immediately after deleting starter placeholder content, create the `UIPageEvent` local initializers. Do not insert an explanatory turn or a broad page redesign step between the delete and the local initialization.",
      "- In Vibe, do not use `Convertigo_batch-call` for dependent mutations or the first UI event/action chain. Use direct `Convertigo_databaseobject-tree-apply` calls and read back each created event/action. If a later independent batch is truly necessary, each nested `calls[].tool` value must be the unprefixed MCP tool id such as `databaseobject-tree-apply`, not the Vibe-exposed name `Convertigo_databaseobject-tree-apply`. If that distinction is uncertain, do not batch.",
      "- Use `Convertigo_databaseobject-delete` for actual object deletion. `databaseobject-tree-apply` with `mode:\"replace\"` and `{}` does not delete the target object; it only patches nothing and can leave empty `REMOVED` shells behind. After a delete, read back the parent and require that the deleted QName is absent.",
      "- For HTTP connectors, use the real Convertigo properties: `server` host, `https`, `port`, optional `baseDir`; do not set skipped or guessed properties such as `url`, `timeout`, `parameters`, or `httpParameters` unless readback has already shown they exist on that exact object type.",
      "- Always set `baseDir` explicitly on HTTP connectors. For a root-level endpoint use the empty string `\"\"`; for a shared path prefix use no trailing slash. If readback shows `baseDir:\"/\"` and the transaction `subDir` starts with `/`, fix `baseDir` before trying headers, provider changes, or alternate APIs.",
      "- Before creating an HTTP connector, choose a direct record endpoint, not a provider catalog, dataset discovery, autocomplete, documentation, generic search, generic normalization, or entity-lookup endpoint. You must know the host-only `server`, the stable path split, one public user-facing request variable, and the expected record collection shape such as `array`, `items`, `features`, or `records`.",
      "- A generic search-style endpoint is not a direct record endpoint merely because it returns labels, display names, descriptions, URLs, display metadata, or suggestions. Unless the user explicitly asked for a generic search or lookup app, the first rail must expose records whose fields already represent the requested application entities, with stable identifiers and useful domain fields in the payload.",
      "- When the product goal says users can search, treat that as a UI/filtering requirement, not permission to use a generic provider. The backend fast path still needs an endpoint that can be filtered by a public variable while returning structured records for the requested entities. Endpoint names or paths such as `lookup`, `autocomplete`, `suggest`, or `entity` are disqualifying for the first rail unless the requested application contract is explicitly those generic results. A path segment named `search` is acceptable only when live proof returns structured application records with useful fields, not labels/descriptions alone.",
      "- Creating an `HttpConnector` commits the run to that HTTP rail. Do not create exploratory connectors for multiple providers. A second `HttpConnector` for another host is not a repair; it is a failed headless run. Patching the same connector with a different `server` hostname is also a provider switch. If the first chosen rail cannot be proven after the allowed repairs, keep the rail and report the live proof incomplete instead of deleting it, changing its hostname, or trying another provider.",
      "- If the only endpoint you know requires uncertain dataset ids, fixed hidden variables, provider-specific headers, provider accounts, quota-limited demo credentials, catalog/discovery semantics, generic normalization or entity-lookup semantics, generic search semantics, or a static raw file URL with no server-side user filter variable, do not start mutating the project with that endpoint. Choose a simpler direct record endpoint when one is already known; otherwise report the HTTP proof incomplete.",
      "- A static file endpoint such as a raw `.json`, `.csv`, `.ndjson`, or repository-hosted data file is not a web-service search/list endpoint for this fast path unless the user explicitly asked for static-file integration. Do not compensate by downloading all records and filtering them in the UI or facade; that hides the missing HTTP request contract and usually bloats the run.",
      "- An endpoint whose result contract is selected by a technical query variable such as `dataset`, `table`, `source`, `index`, `catalog`, `collection`, `resource`, or equivalent is a catalog-style endpoint, not a direct record endpoint. Do not use that shape for this fast path unless the user explicitly supplied the exact dataset/resource identifier in the task.",
      "- Compose HTTP URLs from `server` + optional `baseDir` + transaction `subDir`; do not invent `/api` or switch provider paths after a runtime failure unless a readback or live proof supports it. If readback or runtime logs show a malformed path such as a doubled slash between base directory and transaction path, fix `baseDir`/`subDir` and rerun the transaction proof.",
      "- Do not put generic lookup path segments such as `/search`, `/lookup`, `/autocomplete`, `/suggest`, or `/entity` in `baseDir` or `subDir` for the first rail unless the user explicitly requested that result type.",
      "- Do not use static raw file paths such as `*.json`, `*.csv`, or `*.ndjson` in `subDir` for the first rail unless the user explicitly requested static-file integration.",
      "- If direct proof is empty or metadata-only and slash placement between connector `baseDir` and transaction `subDir` is ambiguous, retry the same provider once with the alternate root slash shape (`subDir:\"records\"` vs `subDir:\"/records\"`) before adding fixed technical variables, guessed headers, extra query variables, or changing provider. For `baseDir:\"\"` and a root endpoint, try the leading-slash `subDir` shape before any other repair. A shared path prefix should usually live in `baseDir` without trailing slash, with `subDir` as the remaining path without leading slash.",
      "- The first direct HTTP proof must create only the public user-facing query/filter variable. Set only accepted request-variable properties such as `httpName`; do not set guessed defaults such as `defaultValue` before readback proves the real property name. Do not create fixed technical variables such as format, limit, mode, action, fields, type, scope, token, username, or API-key defaults before direct records are proven. If the endpoint returns HTML or invalid JSON until a technical constant such as `format=json` is added, it is not a clean first rail for this fast path. After direct records are proven, fixed technical parameters may be added only as backend-owned defaults, not UI variables.",
      "- When a direct HTTP proof returns HTML, documentation, login content, CSS/JavaScript, an error page, DNS/TLS/timeout failure, missing credentials, quota/auth messages, or metadata-only output for an expected JSON/XML API, do one same-rail repair based on readback or runtime evidence and rerun proof. If the second proof has the same payload class or transport problem, stop toggling settings; in headless automation loops, keep the HTTP rail and report the proof incomplete instead of switching providers or changing the connector `server` hostname unless there is explicit evidence that the selected provider cannot satisfy the requested contract. Do not try static files, raw source hosts, generic search/lookup providers, documentation hosts, encyclopedia/entity search, or another API family as a fallback.",
      "- Do not repair HTML/CSS/documentation output by adding guessed HTTP headers or mutating `httpParameters`. Fix `server`, explicit `baseDir`, `subDir`, and `RequestableHttpVariable.httpName` first. Only set header/list properties when the provider contract explicitly requires them and readback has proven the exact property shape.",
      "- Once direct HTTP proof shows application records, freeze that connector/transaction rail. Do not change provider, `server`, transaction name, or proven request variables while repairing facade or UI issues.",
      "- A direct HTTP proof that only succeeds when callers supply fixed technical variables such as `format`, `mode`, `action`, `type`, `limit`, `fields`, or headers is not yet a clean public contract. Put such constants behind backend defaults only after the public user-facing variable has already proven records, otherwise stop and report proof incomplete.",
      "- Create tightly related backend objects in one `databaseobject-tree-apply` when the parent already exists and the child classes/properties are known, for example an HTTP transaction with all required `RequestableHttpVariable` children. Use separate awaited calls only when the next target QName depends on a just-created result or when readback is needed to resolve uncertainty.",
      "- For HTTP query parameters, create `variables.RequestableHttpVariable` children under the transaction with `httpName` for the first proof. Do not rely on skipped `parameters`, `httpParameters`, or guessed `defaultValue` properties.",
      "- For JSON APIs, create `transactions.JsonHttpTransaction` on the first transaction creation. If you accidentally created `transactions.HttpTransaction`, do not try to change its class with `databaseobject-tree-apply`; class replacement does not retag an existing object. Delete the wrong transaction with `Convertigo_databaseobject-delete`, recreate it as `transactions.JsonHttpTransaction`, recreate its `RequestableHttpVariable` children, then rerun direct transaction and facade proof.",
      "- For public facade sequences created through `Convertigo_databaseobject-tree-apply`, use `className:\"sequences.GenericSequence\"`. Do not guess `sequences.Sequence`; if sequence creation fails or the class is uncertain, call `Convertigo_palette-list` on the project and retry with the listed class before adding steps.",
      "- When creating `sequences.GenericSequence`, set only known sequence properties such as `comment` unless readback proves another property exists. Do not set `output` on the sequence object; current trees skip it. Put temporary proof output on the child `TransactionStep` instead.",
      "- For tree writes, `tree` must be one concrete object with `name` and `className`. Do not call `databaseobject-tree-apply` with `at:\"inside\"` and a wrapper object that only contains `children`; create each child as its own concrete tree node.",
      "- Execute transactions through requestable names like `Project.Connector.Transaction`, not database object QNames like `Project.cn:Connector.tr:Transaction`.",
      "- Set facade `TransactionStep.sourceTransaction` to the runtime requestable path, for example `<Project>.<Connector>.<Transaction>`. Do not use a Studio QName such as `<Project>.cn:<Connector>.tr:<Transaction>`; if runtime says `There is no connector named \"cn:...\"`, fix `sourceTransaction` and rerun the facade proof.",
      "- A facade sequence that forwards a user query or filter to an HTTP transaction must have both a public sequence variable and a `StepVariable` under the `TransactionStep`. Choose one request variable object name before creating the facade. For simple pass-through, keep the same object name on the HTTP transaction variable, public facade variable, child `StepVariable`, and UI `UIControlVariable`, then set the `StepVariable.value` to that same variable name. Do not create a public alias and repair it later; without the same-name child, or when renamed variables are not proven, the direct transaction may work but the facade ignores the user input.",
      "- Read back the facade before UI work and verify the public `variables.RequestableVariable` exists as a direct sequence child. A `variables.StepVariable` under `TransactionStep` alone is not a public facade input and will not give UI/user calls a stable contract.",
      "- If direct transaction proof is green but facade proof is empty or errors, repair only facade wiring: existing `sourceTransaction` path, same-name `StepVariable`, and `XMLCopyStep.sourceDefinition` using the readback `TransactionStep.priority`. Do not switch provider, rename/delete the proven transaction, delete `XMLCopyStep`, or set `TransactionStep.output:true` as a facade repair.",
      "- Facade proof must use the facade requestable and show the query/filter was actually forwarded. The returned HTTP info or application payload should prove that the user value affected the upstream request or result set. If the direct transaction proof includes the parameter but the facade proof omits it or returns a broad unfiltered payload, fix the facade before any UI work; do not claim success merely because the unfiltered response contains records.",
      "- Facade proof must use the same public input variables that the UI/user is expected to supply. If the facade only works when the UI supplies fixed provider constants such as format/action/limit/type parameters, put those constants in transaction/facade defaults or choose an endpoint whose required technical parameters can be hidden behind the facade; do not let the UI be the only layer that makes the backend request valid.",
      "- If the facade returns provider help, HTML documentation, or a default/unfiltered response when called with only the public input, do not conclude that the UI must pass technical constants. Repair the backend contract or report the live proof incomplete. Switch provider only when explicit provider evidence proves the current endpoint cannot satisfy the requested contract.",
      "- Facade proof must show application data, not only `status:\"ok\"`. If `Convertigo_requestable-execute` on the facade returns only metadata fields such as `project`, `sequence`, `context`, and `generated`, the facade has not emitted a usable contract. Fix the `TransactionStep` output/shaping before UI completion proof.",
      "- For a JSON HTTP facade, `HttpInfo`, headers, `context`, `project`, and `sequence` are transport metadata. They do not count as application data. Before UI work, the facade proof must expose a stable app contract such as `{items:[...], total, query}` or an equivalent raw JSON array containing application records.",
      "- Do not count generic search suggestions, article titles, or raw URLs as application records unless the user explicitly requested those artifacts. The payload should expose fields the UI can use as real record details, such as names, identifiers, categories, locations, dates, quantitative values, statuses, or other properties meaningful for the requested contract.",
      "- If the task asks for an app that consumes an HTTP web service, do not replace the integration with a `SimpleStep`, hard-coded sample data, or a stub-only sequence after `requestable-execute` fails. DNS, TLS, timeout, provider 4xx/5xx, and path errors are live web-service proof failures, not tool failures. Keep the `HttpConnector`, typed HTTP transaction, facade `TransactionStep`, and mark the runtime proof incomplete if needed.",
      "- Do not disable `httpInfo` merely to turn an HTTP transaction into `status:\"ok\"`. If turning off `httpInfo` hides the response and leaves only metadata, that is not proof. Fix the URL or transaction settings and prove a payload with application fields.",
      "- Do not call `Convertigo_log-view` in the Vibe HTTP NGX fast path. If `requestable-execute` already shows the URL, content type, or payload issue, correct the connector/transaction and rerun the requestable proof. Logs can return huge generated XML and consume the automation budget.",
      "- Avoid broad deep `databaseobject-tree-get` calls after identifying the target page. Prefer targeted reads such as the project root at depth 1, the visible page at depth 2, or the exact object being edited.",
      "- The starter visible page QName is known. Do not inspect broad application subtrees such as `<Project>.Application` at depth 2 or deeper just to find the page; those reads can return large style blocks and waste the headless budget. Use targeted reads of `<Project>.Application.NgxApp.pg:Page` or exact objects being edited.",
      "- For NGX backend calls, set `CallSequenceAction.requestable` to the facade requestable. Do not set a skipped `Sequence` property.",
      "- Put `UIControlVariable` children under the `CallSequenceAction`, and set `varValue` with a Local SmartSource/source binding such as `?.searchQuery`; do not use `script:this.local?.searchQuery` for page locals.",
      "- Do not add hidden provider constants as `UIControlVariable` children, for example `action='opensearch'`, `format='json'`, `limit='20'`, `type`, `mode`, or fixed `fields`. The page may pass user-entered filters and explicitly visible user options only.",
      "- Every `SetLocalAction` that initializes or updates page-local state must set both `Property` and `Value`: `Property` is the local name in PLAIN mode, and `Value` is the assignment. Every `SetLocalAction.Value` that is a JavaScript literal or expression must use SCRIPT mode: empty strings as `script:''`, booleans as `script:true` / `script:false`, objects as `script:{items:[], total:0, query:''}`, and result normalizers as a SCRIPT body. Never use `plain:true`, `plain:false`, `plain:{...}`, `plain:''''`, or any other `plain:` JavaScript fragment for page-local state; it can generate invalid TypeScript or store text instead of values. Do not feed page locals with `SetLocalAction.Value` in `source:` mode: storing local state needs a concrete SCRIPT/PLAIN value, not a Sequence/Local SmartSource that can compile as `Value: ,`.",
      "- The input `DoubleBinding` object contains only `mode` and `value`. Do not nest unrelated input properties such as placeholders, labels, colors, or helper text inside `DoubleBinding`; skipped or ignored cosmetics waste headless turns.",
      "- Once the query/filter input is accepted, continue immediately with the required trigger action chain and results list. Do not pause for optional styling, placeholder repair, extra page reads, broad replanning, or explanatory prose between the input, trigger, action chain, and list creation.",
      "- Do not stop after creating only the input and submit/refresh trigger. Apply the input `DoubleBinding` Local SmartSource and create the button `UIControlEvent -> SetLocalAction -> CallSequenceAction -> UIControlVariable` chain before final proof. If JSON escaping is awkward, copy the compact `SOURCE` examples from `convertigo-recipe-ngx-data-page` exactly and change only `project`, `path`, and requestable names.",
      "- Preferred first trigger write: create the submit/refresh button under visible content with child `UIText` and the click subtree through `CallSequenceAction + UIControlVariable` in the same focused tree. Do not create a bare button and postpone the event chain to later reasoning. The first trigger subtree is `Button -> UIText + UIControlEvent -> SetLocalAction(loading=true) + CallSequenceAction(requestable=<Project>.<Facade>) -> UIControlVariable`. Then add `StoreResults` and `SetLoadingFalse` as separate `SetLocalAction` children under the exact `CallSequenceAction` QName, never under the `UIControlEvent`. There is no `ngx.components.UIDynamicAction#StoreResults` class.",
      "- For `DoubleBinding`, `varValue`, and `directiveSource`, the actual SmartSource `value` string stored in the decoded MCP tool argument must begin with `{\"filter\":\"Local\"`, not with `{\\\\\"filter`. In other words, pass normal JSON text as the string value, not pre-escaped backslash text. If readback displays `'{\\\\\"filter\\\\\":...}'` or `'{\\\\\\\\\"filter\\\\\\\\\":...}'`, the SmartSource is still double escaped.",
      "- Empty generated Angular bindings such as `[(ngModel)]=\"\"` or `*ngFor=\"\"` are SmartSource escaping failures. Do not blame the input default `Value` property, do not delete/recreate visual components, and do not set `Value:null` as the repair. Patch only the offending `DoubleBinding`, `varValue`, or `directiveSource` with unescaped JSON text, then rerun `mobile-builder-open`.",
      "- After the facade proof is green, the minimum UI completion path is: delete starter content, initialize page locals, create heading, create a query/filter input, create a submit/refresh trigger with `UIText`, create button `UIControlEvent`, create `SetLocalAction(loading=true)`, create `CallSequenceAction`, add same-name `UIControlVariable`, add child `SetLocalAction(results)` normalizer, add child `SetLocalAction(loading=false)`, create a result collection view with `ForEach`, save, open builder, answer.",
      "- Keep moving through that path with short direct MCP writes. Only stop to read back when a write returns `partial`, skipped properties, an error, or when a required `priority`/QName is needed for the next object.",
      "- If a searched class name fails, use `palette-list` on the exact parent and retry with the returned `className`. Common NGX action classes are `ngx.components.UIDynamicAction#SetLocalAction` and `ngx.components.UIDynamicAction#CallSequenceAction`, not bare component class names.",
      "- Do not invent visual component classes or properties that were not confirmed by palette/readback. There is no guarantee that semantic guesses such as `UIDynamicElement#Anchor`, skipped `IonName`, or ad hoc link properties exist in the target palette. Use `palette-list` once on the exact parent and then choose a returned class, or display the URL/text through known primitives.",
      "- When `SetLocalAction` is created, read it back. Use the real `Property` and `Value` properties from the palette/template; skipped `varName` or `varValue` means the action is not wired.",
      "- The input value must be bound with the input `Binding`/`DoubleBinding` property to a Local SmartSource path such as `?.searchQuery`. Do not replace that with an `ionChange`/`onChange` event or DOM reads.",
      "- Vibe is more reliable when early NGX UI objects are created as focused stable subtrees, with a readback after each important event/action. Avoid one huge page-level nested `tree.children` patch, but do not split stable pairs such as button+text, event+loading, call+variable, or list+ForEach into unnecessary turns unless a write fails.",
      "- If Vibe starts struggling to emit valid JSON for a nested event/action tree, stop composing the large subtree immediately. Create `UIControlEvent`, `SetLocalAction`, `CallSequenceAction`, `UIControlVariable`, `StoreResults`, and `SetLoadingFalse` with separate awaited `Convertigo_databaseobject-tree-apply` calls. If malformed prose or repeated tokens appear inside a tool argument, abandon that call, read back/delete the affected child if it was partially created, then retry with a small flat tree.",
      "- With `databaseobject-tree-apply` and `at:\"inside\"`, the `tree` argument must be one concrete node with `name` and `className`. Do not send a wrapper object containing only `children`; create each child node one at a time or replace the parent with a complete subtree.",
      "- Do not set labels by guessing `textValue` on every `UIDynamicElement`. For `Button`, `Heading1`/`Heading2`/`Heading3`, card, paragraph, list item, or similar visual components, create the component with structural properties only, then create a child `ngx.components.UIText#UIText` for the visible text. If readback reports skipped `textValue`, treat it as a failed mutation to avoid repeating.",
      "- For `ngx.components.UIText#UIText`, set `textValue` and optional `comment` only. Do not add a guessed `mode` property such as `\"mode\":\"PLAIN\"`; current trees skip it because `UIText.textValue` is already the text property.",
      "- For the main submit/refresh button in a data page, always create a visible `UIText` child with plain text matching the intended action label under the button. An `ion-button` without child text can compile successfully but remains blank or hard to exercise in UI proof.",
      "- Do not finish after writing `results` with `SetLocalAction`. Create a visible result surface that reads result state with Local SmartSource/source mode for the collection, such as `?.results?.items`, `?.results?.total`, or a selected/result item path. The visible surface must include real fields from the facade contract when available. In a `ForEach`, bind the collection from Local, set `directiveItemName` to a neutral row name such as `item` or `record`, set `directiveIndexName`, and bind row fields from that current iterator item; do not create fake page locals for row fields.",
      "- Derive the `StoreResults.items` expression from the proven shaped facade payload. Use explicit application fields such as `out.items`, `out.contract?.items`, `out.response?.items`, or another non-transport object proven by facade execution. Do not use `out.transaction`, `out?.transaction`, `response?.transaction`, `transaction.document`, `HttpInfo`, headers, or raw HTTP transaction subtrees in final UI mapping. If those paths seem necessary, stop UI work and repair the facade so it emits `items`/`total`/`query` or equivalent application fields, then rerun facade proof before resuming UI.",
      "- Before any UI mutation for an HTTP-backed list/search page, run a facade self-audit. If the final facade proof or your final summary would describe the public payload as `transaction.document`, `transaction.document.array`, `HttpInfo`, or headers, the facade is still diagnostic. Read `convertigo://resources/convertigo-backend-sequences` and `convertigo://resources/convertigo-json-quickref`, then add explicit JSON/XML shaping steps so the public sequence emits application fields such as `items`, `total`, `query`, and optional `error`. Keep `TransactionStep.output=false` for the final facade when shaping is present; the shaping step owns the public output. Do not continue to UI while the only useful records live under the raw transaction subtree.",
      "- Minimum proven facade repair for an HTTP JSON array when richer JSON shaping is slow: set the `TransactionStep.output` property to `false`, then add an `steps.XMLCopyStep` under the facade sequence with `sourceDefinition:[\"<TransactionStep priority>\",\"./document/array\"]`. Rerun the facade proof; it should expose a top-level `array` field and no `transaction` field. Then `StoreResults` may normalize `out.array` into `{items,total,query}`. This is a public facade contract because the raw transaction subtree is hidden.",
      "- Do not change that copy XPath to `array`, `./array`, `payload/array`, or other guessed paths just because `requestable-execute` displays the transaction response as a root JSON `array`; that display is the serialized response body, not the internal step XPath used by `sourceDefinition`. If the `./document/array` copy is empty, first verify that the transaction is still producing JSON records, the `TransactionStep` priority is the real producer priority, and same-name variable pass-through is correct. If it still cannot emit records, stop and report the facade proof incomplete instead of changing provider or moving to UI work.",
      "- Avoid custom JavaScript DOM parsing to shape a standard HTTP JSON facade. Prefer Convertigo JSON steps or the `XMLCopyStep` fallback above. If you temporarily set `TransactionStep.output=true` for diagnosis, set it back to `false` before completion and keep only the explicit shaped/copy output public.",
      "- Before final save/answer, read back the result-mapping action and reject the page if its script contains `out.transaction`, `out?.transaction`, `transaction.document`, `HttpInfo`, or `headers`. Repair the facade contract first, then make `StoreResults` read only shaped fields such as `out.items`.",
      "- Do not put `SetLocalAction(Value=script:out)` as a sibling of `CallSequenceAction` under the same `UIControlEvent`. Sibling actions are generated in a parallel `Promise.all` block and `out` is still the click event or previous sibling output. Put success mapping actions as children of `CallSequenceAction`, or put a small normalizer `UICustomAction` child under the call and let later child `SetLocalAction` nodes consume that normalized output. Read generated diagnostics or runtime UI proof if unsure.",
      "- When rebuilding a button event from a large subtree, re-check the QName of `StoreResults`: it must be under `...CallSequenceAction.StoreResults`, not under the click event. If a readback shows the results `SetLocalAction` as a sibling of the call, delete that action and recreate it under the call before final proof.",
      "- UIControlVariable names are request variables, not JavaScript locals in child action scripts. A child `SetLocalAction` like `Value=script:{items: out.items, query: query}` compiles with an undefined bare identifier and produces no usable results. Use only `out` for the call response plus `c8oPage.local?.searchQuery` if the stored result needs the current query, or omit `query`.",
      "- Do not bind iterator fields through a Local SmartSource path. A Local source with path `record.name` is treated as a page-local path and generates invalid template variables. For text inside a `ForEach` with `directiveItemName: record`, use a `UIText` plain template expression such as `{{ record.name }}` or another field from the facade contract. Keep Local SmartSource/source mode for page-local collections like `?.results?.items`, not for iterator row fields.",
      "- `directiveName:\"ForEach\"` does not define the template variable by itself. The exact root used by row text must be the `directiveItemName`: if text uses `{{ item.name }}`, set `directiveItemName:\"item\"`; if text uses `{{ record.name }}`, set `directiveItemName:\"record\"`.",
      "- After creating a ForEach directive, read it back with `properties:\"all\"` and verify `directiveSource`, `directiveItemName`, and `directiveIndexName` are present as separate directive properties. Some readbacks omit the default directive name, so do not repair only for a missing `directiveName` if item/source fields are accepted. If the apply result updated only `directiveSource`, if it updated only `directiveName`, or if readback misses `directiveItemName`, patch the directive itself before adding row text. If row text uses `record.*`, `directiveItemName` must be exactly `record`; if row text uses `item.*`, `directiveItemName` must be exactly `item`. Generated HTML should contain `let <directiveItemName> of ...`, not only an auto-generated item variable. The row item/card/text nodes that interpolate that variable must be descendants of the ForEach directive; a sibling node is outside the Angular scope and will compile as a missing page property.",
      "- Do not put a visibility condition on the same `UIControlDirective` as `ForEach`. Use a parent/sibling `If` directive with raw string `directiveExpression`; keep the `ForEach` focused on `directiveSource`, `directiveItemName`, and `directiveIndexName`.",
      "- For `If` directives, `directiveExpression` is a raw Angular template expression string such as `local?.loading` or `!local?.loading && !local?.error`. `databaseobject-tree-apply` with `mode:\"merge\"` updates properties but does not remove stale incompatible properties. When converting or repairing a directive, read it back and ensure only the properties for that directive remain: `If` uses `directiveExpression` and no `directiveSource`; `ForEach` uses `directiveSource`, `directiveItemName`, and `directiveIndexName` and no visibility `directiveExpression`. If readback still shows an incompatible property, delete and recreate the directive or replace it with a complete compliant subtree instead of claiming the merge fixed it.",
      "- Error text is page-local state. Display it with Local SmartSource/source mode on `?.errorMessage`; do not use `plain:{{ local.errorMessage }}`, `plain:{{ local?.errorMessage || 'fallback' }}`, or `script:local?.errorMessage || 'fallback'` in `UIText.textValue`.",
      "- Count/empty/selected display text that reads page locals must not use `mode:\"SCRIPT\"` text over `local?.*`, and must not use plain Angular interpolation such as `{{ local?.results?.total }}`. Use a static label plus a separate Local SOURCE binding such as `?.results?.total`, or omit the count on the first pass.",
      "- In `UIText.textValue`, Angular interpolation is allowed for iterator variables such as `{{ record.name }}` inside a `ForEach`, but not for page-local state. Never write `{{ local?.x }}`, `{{ local.x }}`, or a fallback expression such as `{{ local?.errorMessage || '...' }}` in visible text. Bind page-local state with a Local SOURCE SmartSource instead; put fallback strings into the local through `SetLocalAction`.",
      "- Before final save/answer, read back every `UIText` that displays count, empty, selected, or error page-local state. Reject and repair any `textValue` containing `plain:` plus `local?.`, `local.`, or `{{ local`. Use separate static text and a Local SOURCE value, or omit the optional sentence.",
      "- Error handlers are not children of visual elements. Create `ngx.components.UIActionErrorEvent#UIActionErrorEvent` under the `UIControlEvent` or the action that owns the failure scope, as returned by `palette-list` on that exact parent. Do not place it as a direct child of the submit button or another `UIDynamicElement`.",
      "- Error handlers do not share the success `out` scope. Never use `out`, `out.message`, `out.error`, or any `out.*` expression in a `UIActionErrorEvent` or `UIActionFailureEvent` `SetLocalAction`. Use a static fallback string or a known local value and display it with Local SmartSource/source mode.",
      "- Do not clean up UI by calling `databaseobject-tree-apply` with `mode:\"replace\"` and empty or qname-only `children`. Delete exact unwanted nodes with `Convertigo_databaseobject-delete`, or replace with a complete subtree. If starter placeholder content remains, even empty or commented `REMOVED`, the page is not cleaned up.",
      "- In headless Vibe, the reliable starter cleanup path is either: (a) delete the starter placeholder component with `Convertigo_databaseobject-delete`, read back its parent, and continue only when the QName is absent; or (b) replace the visible content container at `self` with a complete content node and verify no starter placeholder or `REMOVED` comments remain. If `mode:\"replace\"` leaves a starter placeholder, immediately switch to `databaseobject-delete`; do not add duplicate placeholders or comments.",
      "- Result locals must be fed by the backend action, not only initialized on page enter. Put result-mapping actions as children of `CallSequenceAction`, preferably storing a normalized contract such as `{items,total,query}` in `results`, then make `ForEach.directiveSource` match `?.results?.items`. Raw transport paths such as `?.results?.transaction?.document?.array` are acceptable only as temporary diagnostics, not final UI.",
      "- Before saving, compare the facade proof body, the result normalizer, and row bindings. The stored `items` array must contain the objects whose fields are rendered by the row template.",
      "",
      "## Project and viewer rules",
      "",
      "- Inspect the target project through MCP before writing.",
      "- Apply project changes with `Convertigo_databaseobject-tree-apply` or purpose-built Convertigo tools. Avoid `Convertigo_batch-call` in Vibe unless the operation is independent and the nested unprefixed tool id is known.",
      "- Never edit `_private/ionic`, `DisplayObjects`, `dist`, or other generated artifacts.",
      "- For live mobile proof, prefer the URL returned by the waited `Convertigo_mobile-builder-open`. If it returns `browserDebugUrl`, `browserDevToolsJsonUrl`, or `browserDevToolsWebSocketUrl`, those values target the visible Studio mobile viewer; use them for Playwright or browser-control MCP smoke proof instead of opening an unrelated browser page. Reuse the current CDP target; do not create a new browser tab or page.",
      "- If the integrated assistant or host context says Convertigo reveal mode is enabled, pass `reveal:true` only on supported mutation/viewer tools that should visibly move Studio while you work: `Convertigo_databaseobject-tree-apply`, `Convertigo_mobile-builder-open`, `Convertigo_nocode-form-create`, `Convertigo_nocode-form-edit`, and `Convertigo_nocode-form-update`. For `Convertigo_mobile-builder-open`, use `wait:false` for reveal/focus polls; reserve long `wait:true` calls for readiness proof and omit `reveal` unless UI focus is specifically needed. Treat skipped/unsupported reveal results as UI hints, not mutation failures.",
      "- Save successful Convertigo mutations with `Convertigo_project-save`.",
      "- After a final backend proof, save, and mobile-builder proof, do not reload the skill or restart broad verification in the same headless run. Provide the final answer; external callers may perform an independent validation pass.",
      "",
      "## Current public references",
      ""
    ].concat(referenceLines).concat([
      "",
      "## Local MCP endpoint",
      "",
      "- Expected local MCP entry: `" + trim(mcpUrl) + "`",
      "- If Vibe is not yet configured for Convertigo, run the local Studio sequence `_setupVibe` from the ConvertigoMCP project.",
      ""
    ]).join("\n");
  }

  function buildAgentsMarkdown(mcpUrl) {
    return [
      "# Convertigo Vibe Workspace",
      "",
      "- For Convertigo tasks, use the `convertigo-vibe-generalist` skill.",
      "- Use the `Convertigo` MCP server at `" + trim(mcpUrl) + "`.",
      "- Compare the skill `Skill guidance version` with `MCP guidance version` in `convertigo://capabilities`; rerun `_setupVibe` if they differ.",
      "- Pass `params._meta.convertigoGuidanceVersion` on the first guarded Convertigo tool call when the MCP client supports request metadata, or `X-Convertigo-Guidance-Version` for raw HTTP calls; treat `_meta.convertigoGuidanceWarning` as a setup refresh signal.",
      "- Read the MCP guides before project mutation; start with `convertigo://resources/convertigo-start` and `convertigo://resources/convertigo-vibe-start`.",
      "- For fresh HTTP-backed NGX data apps, read `convertigo://resources/convertigo-vibe-http-ngx-fastpath` directly before mutation; use the broader start guides only as fallback.",
      "- Keep benchmark runs isolated. Do not rely on global skills or Codex setup state.",
      "- Provide model credentials through the process environment, for example `MISTRAL_API_KEY`; do not copy secrets into this isolated home.",
      "- Do not edit generated Convertigo artifacts; mutate source objects through MCP tools.",
      ""
    ].join("\n");
  }

  function toolPermissionBlock(toolName) {
    return [
      "[tools." + toolName + "]",
      'permission = "always"'
    ].join("\n");
  }

  function vibeToolNames() {
    return [
      "skill",
      "read",
      "grep",
      "bash",
      "write_file",
      "edit",
      "Convertigo_project-list",
      "Convertigo_project-list-symbols",
      "Convertigo_marketplace-list",
      "Convertigo_marketplace-import",
      "Convertigo_requestable-execute",
      "Convertigo_databaseobject-tree-get",
      "Convertigo_databaseobject-search",
      "Convertigo_palette-list",
      "Convertigo_palette-describe",
      "Convertigo_databaseobject-tree-apply",
      "Convertigo_databaseobject-delete",
      "Convertigo_mobile-builder-open",
      "Convertigo_project-save",
      "Convertigo_project-reload",
      "Convertigo_log-view",
      "Convertigo_crud-status",
      "Convertigo_crud-proof",
      "Convertigo_upsert-crud",
      "Convertigo_upsert-ngx-crud-kit",
      "Convertigo_rag-query"
    ];
  }

  function buildFullConfig(mcpUrl) {
    var lines = [
      'active_model = "mistral-medium-3.5"',
      "include_prompt_detail = true",
      'enabled_skills = ["convertigo-vibe-generalist"]',
      "",
      "[[mcp_servers]]",
      'name = "Convertigo"',
      'transport = "http"',
      'url = "' + tomlEscape(mcpUrl) + '"',
      "tool_timeout_sec = 180",
      ""
    ];
    var tools = vibeToolNames();
    for (var i = 0; i < tools.length; i++) {
      lines.push(toolPermissionBlock(tools[i]));
      lines.push("");
    }
    return lines.join("\n").replace(/\n+$/, "\n");
  }

  function hasConvertigoMcpServer(text) {
    var value = String(text == null ? "" : text);
    return /mcp_servers\s*=\s*\[[\s\S]*?name\s*=\s*["']Convertigo["']/m.test(value) ||
      /\[\[mcp_servers\]\][\s\S]*?name\s*=\s*["']Convertigo["']/m.test(value);
  }

  function hasToolPermission(text, toolName) {
    var header = "[tools." + toolName + "]";
    var lines = splitLines(text);
    for (var i = 0; i < lines.length; i++) {
      if (trim(lines[i]) === header) {
        return true;
      }
    }
    return false;
  }

  function patchExistingConfig(existingText, mcpUrl, warnings) {
    var text = String(existingText == null ? "" : existingText).replace(/\r\n?/g, "\n");
    var lines = splitLines(text);

    if (!/^\s*enabled_skills\s*=/m.test(text)) {
      lines.unshift('enabled_skills = ["convertigo-vibe-generalist"]', "");
    } else if (text.indexOf("convertigo-vibe-generalist") < 0 && warnings && warnings.push) {
      warnings.push("Existing enabled_skills does not include convertigo-vibe-generalist; left unchanged to avoid rewriting user skill filters.");
    }

    if (!hasConvertigoMcpServer(text)) {
      if (lines.length && trim(lines[lines.length - 1]).length) {
        lines.push("");
      }
      lines.push("[[mcp_servers]]");
      lines.push('name = "Convertigo"');
      lines.push('transport = "http"');
      lines.push('url = "' + tomlEscape(mcpUrl) + '"');
      lines.push("tool_timeout_sec = 180");
      lines.push("");
    }

    var next = lines.join("\n").replace(/\n+$/, "\n");
    var tools = vibeToolNames();
    for (var i = 0; i < tools.length; i++) {
      if (!hasToolPermission(next, tools[i])) {
        if (trim(next).length) {
          next = next.replace(/\n*$/, "\n\n");
        }
        next += toolPermissionBlock(tools[i]) + "\n";
      }
    }
    return next.replace(/\n+$/, "\n");
  }

  function patchConfigToml(existingText, mcpUrl, replaceConfig, warnings) {
    var existing = String(existingText == null ? "" : existingText).replace(/\r\n?/g, "\n");
    var next = (replaceConfig === true || trim(existing).length === 0)
      ? buildFullConfig(mcpUrl)
      : patchExistingConfig(existing, mcpUrl, warnings);
    var normalizedExisting = existing.replace(/\n+$/, "\n");
    var normalizedNext = next.replace(/\n+$/, "\n");
    return {
      status: normalizedExisting === normalizedNext ? "unchanged" : (trim(existing).length ? "updated" : "created"),
      text: normalizedNext
    };
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

  C8O.setupVibe.run = function (options) {
    var File = Packages.java.io.File;
    var opts = options || {};
    var warnings = [];
    var dryRun = C8O.util.toBoolean(opts.dryRun, false) === true;
    var replaceConfig = C8O.util.toBoolean(opts.replaceConfig, false) === true;
    var vibeHome = resolveVibeHome(opts.vibeHome);
    var resolvedMcpUrl = deriveMcpUrl(opts.mcpUrl, warnings);
    var skillsDir = new File(vibeHome, "skills");
    var skillDir = new File(skillsDir, "convertigo-vibe-generalist");
    var skillFile = new File(skillDir, "SKILL.md");
    var agentsFile = new File(vibeHome, "AGENTS.md");
    var configFile = new File(vibeHome, "config.toml");
    var skillContent = buildSkillMarkdown(resolvedMcpUrl);
    var agentsContent = buildAgentsMarkdown(resolvedMcpUrl);
    var skillWrite = writeManagedFile(skillFile, skillContent, dryRun);
    var agentsWrite = writeManagedFile(agentsFile, agentsContent, dryRun);

    var existingConfig = readTextIfExists(configFile);
    var patchedConfig = patchConfigToml(existingConfig, resolvedMcpUrl, replaceConfig, warnings);
    if (patchedConfig.status !== "unchanged" && dryRun !== true) {
      writeText(configFile, patchedConfig.text);
    }

    return {
      skillStatus: skillWrite.status,
      agentsStatus: agentsWrite.status,
      configStatus: patchedConfig.status,
      resolvedVibeHome: String(vibeHome.getAbsolutePath()),
      resolvedMcpUrl: resolvedMcpUrl,
      skillPath: String(skillFile.getAbsolutePath()),
      agentsPath: String(agentsFile.getAbsolutePath()),
      configPath: String(configFile.getAbsolutePath()),
      replaceConfig: replaceConfig,
      warnings: warnings,
      nextSteps: [
        "Run Vibe with VIBE_HOME=" + String(vibeHome.getAbsolutePath()) + " for isolated generation runs.",
        "Provide MISTRAL_API_KEY through the shell environment or CI secret store before launching Vibe.",
        "Ask Vibe to use the convertigo-vibe-generalist skill and the Convertigo MCP server.",
        "For headless loops, pass --agent auto-approve --trust and repeat --enabled-tools once per allowed tool."
      ],
      dryRun: dryRun
    };
  };
})();

var setupVibeResult = C8O.setupVibe.run({
  vibeHome: (typeof vibeHome !== "undefined") ? vibeHome : "",
  mcpUrl: (typeof mcpUrl !== "undefined") ? mcpUrl : "",
  dryRun: (typeof dryRun !== "undefined") ? dryRun : false,
  replaceConfig: (typeof replaceConfig !== "undefined") ? replaceConfig : false
});
