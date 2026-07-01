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
      "- Treat the Convertigo MCP guides as technical invariants only: call ordering, object creation, readback, proof, binding modes, error handling, and generated-artifact boundaries. Do not turn benchmark scenarios into provider-, dataset-, country-, language-, or feature-specific requirements unless the current user task explicitly asks for them.",
      "- Use `Convertigo_requestable-execute` only for existing Convertigo requestables such as `ConvertigoMCP.mcp_resources_read`.",
      "- Do not invent requestable names such as `ConvertigoMCP.resources/templates/list`.",
      "- Do not pass a guide URI to `mcp_resources_list`; list is for catalog discovery, read is for one URI.",
      "- When a guide URI is already known, skip list retries and call `ConvertigoMCP.mcp_resources_read` directly.",
      "- Treat a `status:\"partial\"`, skipped property, or failed palette creation as a failed mutation to correct before continuing.",
      "- In Vibe, multiple MCP tool calls in one assistant message are executed concurrently. Use parallel calls only for independent reads. In headless benchmark loops, avoid parallel MCP mutations entirely; direct sequential mutations are easier to validate and recover.",
      "",
      "## Vibe isolation",
      "",
      "- Prefer a task-local `VIBE_HOME` for benchmarks and skill-adjustment loops.",
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
      "- The chosen HTTP provider must satisfy the requested data contract. If the app is about searchable records, the endpoint must return records with useful fields for that contract, not only generic article titles, URLs, autocomplete suggestions, or documentation text. If the first provider fails because of malformed paths, DNS, TLS, missing credentials, quota, or provider errors, either fix the connector settings or choose another public endpoint that still returns records for the requested contract. Otherwise keep the HTTP rail and mark the live proof incomplete.",
      "- For data-backed pages, including pages backed by HTTP web services, read `convertigo://resources/convertigo-recipe-ngx-data-page` before the first UI mutation.",
      "- Mutate the actual visible entry page first. On the starter this is usually `Application.NgxApp.pg:Page`, especially `Page.Content`.",
      "- Do not create only a secondary feature page while the visible entry page still shows the starter body.",
      "- In Vibe, do not use `Convertigo_batch-call` for dependent mutations or the first UI event/action chain. Use direct `Convertigo_databaseobject-tree-apply` calls and read back each created event/action. If a later independent batch is truly necessary, each nested `calls[].tool` value must be the unprefixed MCP tool id such as `databaseobject-tree-apply`, not the Vibe-exposed name `Convertigo_databaseobject-tree-apply`. If that distinction is uncertain, do not batch.",
      "- Use `Convertigo_databaseobject-delete` for actual object deletion. `databaseobject-tree-apply` with `mode:\"replace\"` and `{}` does not delete the target object; it only patches nothing and can leave empty `REMOVED` shells behind. After a delete, read back the parent and require that the deleted QName is absent.",
      "- For HTTP connectors, use the real Convertigo properties: `server` host, `https`, `port`, optional `baseDir`; do not set skipped or guessed properties such as `url`, `timeout`, `parameters`, or `httpParameters` unless readback has already shown they exist on that exact object type.",
      "- Compose HTTP URLs from `server` + optional `baseDir` + transaction `subDir`; do not invent `/api` or switch provider paths after a runtime failure unless a readback or live proof supports it. If readback or runtime logs show a malformed path such as a doubled slash between base directory and transaction path, fix `baseDir`/`subDir` and rerun the transaction proof.",
      "- If slash placement between connector `baseDir` and transaction `subDir` is ambiguous, use one coherent single-slash shape and verify immediately with `requestable-execute`; do not alternate blindly between guessed paths.",
      "- For HTTP query parameters, create `variables.RequestableHttpVariable` children under the transaction. Do not rely on skipped `parameters` or `httpParameters` properties.",
      "- For JSON APIs, create `transactions.JsonHttpTransaction` on the first transaction creation. If you accidentally created `transactions.HttpTransaction`, do not try to change its class with `databaseobject-tree-apply`; class replacement does not retag an existing object. Delete the wrong transaction with `Convertigo_databaseobject-delete`, recreate it as `transactions.JsonHttpTransaction`, recreate its `RequestableHttpVariable` children, then rerun direct transaction and facade proof.",
      "- For public facade sequences created through `Convertigo_databaseobject-tree-apply`, use `className:\"sequences.GenericSequence\"`. Do not guess `sequences.Sequence`; if sequence creation fails or the class is uncertain, call `Convertigo_palette-list` on the project and retry with the listed class before adding steps.",
      "- When creating `sequences.GenericSequence`, set only known sequence properties such as `comment` unless readback proves another property exists. Do not set `output` on the sequence object; current trees skip it. Put temporary proof output on the child `TransactionStep` instead.",
      "- Execute transactions through requestable names like `Project.Connector.Transaction`, not database object QNames like `Project.cn:Connector.tr:Transaction`.",
      "- Set facade `TransactionStep.sourceTransaction` to the runtime requestable path, for example `<Project>.<Connector>.<Transaction>`. Do not use a Studio QName such as `<Project>.cn:<Connector>.tr:<Transaction>`; if runtime says `There is no connector named \"cn:...\"`, fix `sourceTransaction` and rerun the facade proof.",
      "- A facade sequence that forwards a user query or filter to an HTTP transaction must have both a public sequence variable and a `StepVariable` under the `TransactionStep`. For simple pass-through, keep the same object name on the HTTP transaction variable, public facade variable, and child `StepVariable`, then set the `StepVariable.value` to that same variable name. Without that child, or when renamed variables are not proven, the direct transaction may work but the facade ignores the user input.",
      "- Facade proof must use the facade requestable and show the query/filter was actually forwarded. The returned HTTP info or application payload should prove that the user value affected the upstream request or result set. If the direct transaction proof includes the parameter but the facade proof omits it or returns a broad unfiltered payload, fix the facade before any UI work; do not claim success merely because the unfiltered response contains records.",
      "- Facade proof must use the same public input variables that the UI/user is expected to supply. If the facade only works when the UI supplies fixed provider constants such as format/action/limit/type parameters, put those constants in transaction/facade defaults or choose an endpoint whose required technical parameters can be hidden behind the facade; do not let the UI be the only layer that makes the backend request valid.",
      "- If the facade returns provider help, HTML documentation, or a default/unfiltered response when called with only the public input, do not conclude that the UI must pass technical constants. Repair the backend contract, switch to a better provider endpoint, or report the live proof incomplete.",
      "- Facade proof must show application data, not only `status:\"ok\"`. If `Convertigo_requestable-execute` on the facade returns only metadata fields such as `project`, `sequence`, `context`, and `generated`, the facade has not emitted a usable contract. Fix the `TransactionStep` output/shaping before UI completion proof.",
      "- For a JSON HTTP facade, `HttpInfo`, headers, `context`, `project`, and `sequence` are transport metadata. They do not count as application data. Before UI work, the facade proof must expose a stable app contract such as `{items:[...], total, query}` or an equivalent raw JSON array containing application records.",
      "- Do not count generic search suggestions, article titles, or raw URLs as application records unless the user explicitly requested those artifacts. The payload should expose fields the UI can use as real record details, such as names, identifiers, categories, locations, dates, quantitative values, statuses, or other properties meaningful for the requested contract.",
      "- If the task asks for an app that consumes an HTTP web service, do not replace the integration with a `SimpleStep`, hard-coded sample data, or a stub-only sequence after `requestable-execute` fails. DNS, TLS, timeout, provider 4xx/5xx, and path errors are live web-service proof failures, not tool failures. Keep the `HttpConnector`, typed HTTP transaction, facade `TransactionStep`, and mark the runtime proof incomplete if needed.",
      "- Do not disable `httpInfo` merely to turn an HTTP transaction into `status:\"ok\"`. If turning off `httpInfo` hides the response and leaves only metadata, that is not proof. Fix the URL or transaction settings and prove a payload with application fields.",
      "- Avoid broad `Convertigo_log-view` calls for HTTP URL debugging in headless loops. If `requestable-execute` already shows the URL, content type, or payload issue, correct the connector/transaction and rerun the requestable proof. `log-view` can return huge generated XML and consume the run budget.",
      "- Avoid broad deep `databaseobject-tree-get` calls after identifying the target page. Prefer targeted reads such as the project root at depth 1, the visible page at depth 2, or the exact object being edited.",
      "- For NGX backend calls, set `CallSequenceAction.requestable` to the facade requestable. Do not set a skipped `Sequence` property.",
      "- Put `UIControlVariable` children under the `CallSequenceAction`, and set `varValue` with a Local SmartSource/source binding such as `?.searchQuery`; do not use `script:this.local?.searchQuery` for page locals.",
      "- Do not add hidden provider constants as `UIControlVariable` children, for example `action='opensearch'`, `format='json'`, `limit='20'`, `type`, `mode`, or fixed `fields`. The page may pass user-entered filters and explicitly visible user options only.",
      "- Do not stop after creating only `SearchInput` and `SearchButton`. Apply the input `DoubleBinding` Local SmartSource and create the button `UIControlEvent -> SetLocalAction -> CallSequenceAction -> UIControlVariable` chain before final proof. If JSON escaping is awkward, copy the compact `SOURCE` examples from `convertigo-recipe-ngx-data-page` exactly and change only `project`, `path`, and requestable names.",
      "- If a searched class name fails, use `palette-list` on the exact parent and retry with the returned `className`. Common NGX action classes are `ngx.components.UIDynamicAction#SetLocalAction` and `ngx.components.UIDynamicAction#CallSequenceAction`, not bare component class names.",
      "- Do not invent visual component classes or properties that were not confirmed by palette/readback. There is no guarantee that semantic guesses such as `UIDynamicElement#Anchor`, skipped `IonName`, or ad hoc link properties exist in the target palette. Use `palette-list` once on the exact parent and then choose a returned class, or display the URL/text through known primitives.",
      "- When `SetLocalAction` is created, read it back. Use the real `Property` and `Value` properties from the palette/template; skipped `varName` or `varValue` means the action is not wired.",
      "- The input value must be bound with the input `Binding`/`DoubleBinding` property to a Local SmartSource path such as `?.searchQuery`. Do not replace that with an `ionChange`/`onChange` event or DOM reads.",
      "- Vibe is more reliable when early NGX UI objects are created one object/action at a time, with a readback after each important event/action. Avoid large nested `tree.children` patches for the first visible shell, page-enter initialization, and event/action chain unless the same shape already succeeded in the current tree.",
      "- If Vibe starts struggling to emit valid JSON for a nested event/action tree, stop composing the large subtree immediately. Create `UIControlEvent`, `SetLocalAction`, `CallSequenceAction`, `UIControlVariable`, `StoreResults`, and `SetLoadingFalse` with separate awaited `Convertigo_databaseobject-tree-apply` calls.",
      "- With `databaseobject-tree-apply` and `at:\"inside\"`, the `tree` argument must be one concrete node with `name` and `className`. Do not send a wrapper object containing only `children`; create each child node one at a time or replace the parent with a complete subtree.",
      "- Do not set labels by guessing `textValue` on every `UIDynamicElement`. For `Button`, `Heading1`/`Heading2`/`Heading3`, card, paragraph, list item, or similar visual components, create the component with structural properties only, then create a child `ngx.components.UIText#UIText` for the visible text. If readback reports skipped `textValue`, treat it as a failed mutation to avoid repeating.",
      "- For `ngx.components.UIText#UIText`, set `textValue` and optional `comment` only. Do not add a guessed `mode` property such as `\"mode\":\"PLAIN\"`; current trees skip it because `UIText.textValue` is already the text property.",
      "- For the main search/submit button in a data page, always create a visible `UIText` child with plain text matching the intended action label under the button. An `ion-button` without child text can compile successfully but browser smoke cannot click it by text and users see a blank control.",
      "- Do not finish after writing `results` with `SetLocalAction`. Create a visible result surface that reads result state with Local SmartSource/source mode for the collection, such as `?.results?.items`, `?.results?.total`, or a selected/result item path. The visible surface must include real fields from the facade contract when available. In a `ForEach`, bind the collection from Local, set `directiveItemName` to a neutral row name such as `item` or `record`, and bind row fields from that current iterator item; do not create fake page locals for row fields.",
      "- Derive the `StoreResults.items` expression from the proven facade payload. If the payload contains nested record objects, store `items` from the exact array whose elements match the row bindings; do not use an array/items fallback that leaves the list empty.",
      "- Do not put `SetLocalAction(Value=script:out)` as a sibling of `CallSequenceAction` under the same `UIControlEvent`. Sibling actions are generated in a parallel `Promise.all` block and `out` is still the click event or previous sibling output. Put success mapping actions as children of `CallSequenceAction`, or put a small normalizer `UICustomAction` child under the call and let later child `SetLocalAction` nodes consume that normalized output. Read the generated code or browser smoke proof if unsure.",
      "- When rebuilding a button event from a large subtree, re-check the QName of `StoreResults`: it must be under `...CallSequenceAction.StoreResults`, not under `...SearchClick.StoreResults`. If a readback shows the results `SetLocalAction` as a sibling of the call, delete that action and recreate it under the call before final proof.",
      "- UIControlVariable names are request variables, not JavaScript locals in child action scripts. A child `SetLocalAction` like `Value=script:{items: out.items, query: query}` compiles with an undefined bare identifier and browser smoke shows no results. Use only `out` for the call response plus `c8oPage.local?.searchQuery` if the stored result needs the current query, or omit `query`.",
      "- Do not bind iterator fields through a Local SmartSource path. A Local source with path `record.name` is treated as a page-local path and generates invalid template variables. For text inside a `ForEach` with `directiveItemName: record`, use a `UIText` plain template expression such as `{{ record.name }}` or another field from the facade contract. Keep Local SmartSource/source mode for page-local collections like `?.results?.items`, not for iterator row fields.",
      "- Do not put a visibility condition on the same `UIControlDirective` as `ForEach`. Use a parent/sibling `If` directive with raw string `directiveExpression`; keep the `ForEach` focused on `directiveSource`, `directiveItemName`, and `directiveIndexName`.",
      "- For `If` directives, `directiveExpression` is a raw Angular template expression string such as `local?.loading` or `!local?.loading && !local?.error`. `databaseobject-tree-apply` with `mode:\"merge\"` updates properties but does not remove stale incompatible properties. When converting or repairing a directive, read it back and ensure only the properties for that directive remain: `If` uses `directiveExpression` and no `directiveSource`; `ForEach` uses `directiveSource`, `directiveItemName`, and `directiveIndexName` and no visibility `directiveExpression`. If readback still shows an incompatible property, delete and recreate the directive or replace it with a complete compliant subtree instead of claiming the merge fixed it.",
      "- Error text is page-local state. Display it with Local SmartSource/source mode on `?.errorMessage`; do not use `plain:{{ local.errorMessage }}`, `plain:{{ local?.errorMessage || 'fallback' }}`, or `script:local?.errorMessage || 'fallback'` in `UIText.textValue`.",
      "- Count/empty/selected display text that reads page locals must not use `mode:\"SCRIPT\"` text over `local?.*`, and must not use plain Angular interpolation such as `{{ local?.results?.total }}`. Use a static label plus a separate Local SOURCE binding such as `?.results?.total`, or omit the count on the first pass.",
      "- In `UIText.textValue`, Angular interpolation is allowed for iterator variables such as `{{ record.name }}` inside a `ForEach`, but not for page-local state. Never write `{{ local?.x }}`, `{{ local.x }}`, or a fallback expression such as `{{ local?.errorMessage || '...' }}` in visible text. Bind page-local state with a Local SOURCE SmartSource instead; put fallback strings into the local through `SetLocalAction`.",
      "- Error handlers are not children of visual elements. Create `ngx.components.UIActionErrorEvent#UIActionErrorEvent` under the `UIControlEvent` or the action that owns the failure scope, as returned by `palette-list` on that exact parent. Do not place it as a direct child of `SearchButton` or another `UIDynamicElement`.",
      "- Error handlers do not share the success `out` scope. Never use `out`, `out.message`, `out.error`, or any `out.*` expression in a `UIActionErrorEvent` or `UIActionFailureEvent` `SetLocalAction`. Use a static fallback string or a known local value and display it with Local SmartSource/source mode.",
      "- Do not clean up UI by calling `databaseobject-tree-apply` with `mode:\"replace\"` and empty or qname-only `children`. Delete exact unwanted nodes with `Convertigo_databaseobject-delete`, or replace with a complete subtree. If the starter `WelcomeCard` remains, even empty or commented `REMOVED`, the page is not cleaned up.",
      "- In headless Vibe, the reliable starter cleanup path is either: (a) delete `<Project>.Application.NgxApp.pg:Page.Content.WelcomeCard` with `Convertigo_databaseobject-delete`, read back `Page.Content`, and continue only when the QName is absent; or (b) replace `<Project>.Application.NgxApp.pg:Page.Content` at `self` with a complete `Content` node and verify no `WelcomeCard` or `REMOVED` comments remain. If `mode:\"replace\"` leaves `WelcomeCard`, immediately switch to `databaseobject-delete`; do not add `WelcomeCard1` or comments.",
      "- Result locals must be fed by the backend action, not only initialized on page enter. Put result-mapping actions as children of `CallSequenceAction`, preferably storing a normalized contract such as `{items,total,query}` in `results`, then make `ForEach.directiveSource` match `?.results?.items`. Raw transport paths such as `?.results?.transaction?.document?.array` are acceptable only as temporary diagnostics, not final UI.",
      "- Before saving, compare the facade proof body, the result normalizer, and row bindings. The stored `items` array must contain the objects whose fields are rendered by the row template.",
      "",
      "## Project and viewer rules",
      "",
      "- Inspect the target project through MCP before writing.",
      "- Apply project changes with `Convertigo_databaseobject-tree-apply` or purpose-built Convertigo tools. Avoid `Convertigo_batch-call` in Vibe unless the operation is independent and the nested unprefixed tool id is known.",
      "- Never edit `_private/ionic`, `DisplayObjects`, `dist`, or other generated artifacts.",
      "- For live mobile proof, prefer the URL returned by the waited `Convertigo_mobile-builder-open`. If it returns `browserDebugUrl`, `browserDevToolsJsonUrl`, or `browserDevToolsWebSocketUrl`, those values target the visible Studio mobile viewer; use them for Playwright or browser-control MCP smoke proof instead of opening an unrelated browser page. Reuse the current CDP target; do not create a new browser tab or page.",
      "- Save successful Convertigo mutations with `Convertigo_project-save`.",
      "- After a final backend proof, save, and mobile-builder proof, do not reload the skill or restart broad verification in the same headless run. Provide the final answer; the external harness will perform the independent validation pass.",
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
        "Run Vibe with VIBE_HOME=" + String(vibeHome.getAbsolutePath()) + " for isolated benchmark runs.",
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
