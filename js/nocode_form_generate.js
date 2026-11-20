// Shared storage contract across Tigo projects. Resolved only on the engine.
if (typeof C8O === "undefined") { var C8O = {}; }
if (typeof C8O.tigoAgentsDirectory !== "function") {
  C8O.tigoAgentsDirectory = function (workspaceRoot, FileClass) {
    var F = FileClass || Packages.java.io.File;
    var configured = "";
    try {
      var value = Packages.com.twinsoft.convertigo.engine.Engine.theApp.databaseObjectsManager.symbolsGetValue("assistant.agents.directory");
      configured = value == null ? "" : String(value).replace(/^\s+|\s+$/g, "");
    } catch (_noAgentsDirectorySymbol) {}
    if (!configured.length) { return new F(workspaceRoot, "agents"); }
    if (configured.indexOf("\u0000") !== -1) { throw new Error("Invalid assistant.agents.directory"); }
    var directory = new F(configured);
    if (!directory.isAbsolute()) { throw new Error("assistant.agents.directory must be an absolute path"); }
    if (directory.getParentFile() === null) { throw new Error("assistant.agents.directory must be a dedicated directory, not a filesystem root"); }
    return directory;
  };
}
// End shared storage contract.
/*
 * C8O.nocodeFormGenerate: the generator behind the Flash mode of the Tigo panel (lib_ConvertigoAssistant, AgentFlashForm).
 * The panel sends the first request of a conversation here instead of starting an agent turn; one model call writes
 * the result, the user waits in front of the screen.
 *  - A stable system prompt: the contract of the installed C8Oforms (contract-get core + the sections the generator
 *    needs) and the rules below. The same text on every call for a given contract and rules, so that the gateway's
 *    prompt cache serves it; built once and kept under <agents>/nocode/form-generator/.
 *  - The 3 validated examples closest to the request (BM25 over the request text, the request's language first), from
 *    the bank of request -> reduced JSON pairs of resources/nocode-form-generator/bank.json.gz.
 *  - mistral/mistral-large-4 through the Convertigo LLM gateway, temperature 0, the reasoning effort of the panel.
 *  - Two routes: a form (compile + validate with the internals of nocode-form-compile / nocode-form-validate, up to 2
 *    repairs from the exact errors, then saved as nocode-form-create does), or a data application (the business spec of
 *    nocode-app-create, which builds the base, the tables and the application in one call). What Flash cannot do is
 *    declined in one short answer (kind clarify, app, tables or edit) and the panel offers the agent.
 *  - The gateway key: the user's own key when the server gives one per user (the Assistant passes its handle, as it does
 *    for an agent turn; never a fallback to the server key then), else the key of Tigo's built-in agent. Never returned.
 *  - A call waits CALL_BUDGET_MS at most: past it, it answers status running with a jobId, and the next call with that
 *    jobId resumes the job. The model calls run asynchronously; all the engine work (compile, validate, save) runs in the
 *    thread of the call that resumes the job.
 * C8O.nocodeFormGenerate.run(params, host) holds the logic; javaHost() gives it the engine, a test gives its own host.
 */
if (typeof C8O === "undefined") { var C8O = {}; }
C8O.nocodeFormGenerate = C8O.nocodeFormGenerate || {};

(function (api) {
  var MODEL = "mistral/mistral-large-4";
  var GATEWAY_URL = "https://llm.convertigo.com/v1/chat/completions";
  var K = 3;
  var MAX_REPAIRS = 2;
  var MAX_TOKENS = 16000;
  var CALL_TIMEOUT_MS = 240000;
  var CALL_BUDGET_MS = 38000;
  var JOB_KEEP_MS = 30 * 60000;
  var AUTH_RETRY_PAUSE_MS = 300;
  var EXPECTED_WARNINGS = { baserow_identity_pending_creation: true };
  var CONTRACT_SECTIONS = ["example", "reducedSample", "conditionFields", "pageFields", "baserowShorthand", "generationQuality"];
  var REASONING = { minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "high", max: "high" };

  var RULES = "Rules for your answer:\n" +
    "- Answer with ONE JSON object: the reduced form that nocode-form-compile accepts. No markdown fence, no comment, no prose.\n" +
    "- \"language\": \"fr\" or \"en\", the language of the request; every visible text (names of pages, labels, values, messages) in that language.\n" +
    "- A questionnaire that respondents fill in and send: navigationMode \"buttons\" (one page per step), and no submit button of your own (the viewer's Envoyer button saves the responses on the last page).\n" +
    "- An application with a home page and buttons that navigate: navigationMode \"custom\", page.header on each page, buttons with flows (push_page, submit with saveTo, toast).\n" +
    "- Technical names (field \"name\", flow \"id\"): short snake_case ASCII, unique in the form.\n" +
    "- Use the component types of the contract (text with config.type email/tel/number..., select, radio, checkbox, datetime, time, slider, img, file, signature, section, layout, button, grid...). Mandatory fields: \"mandatory\": true.\n" +
    "- Layout: a page with more than 5 fields groups them in sections (type section with a short title, columns 2; fullWidth: true for a long text, a file, a signature or a choice with long labels), one section per group of related fields (identity, contact, the request itself...). A page of 5 fields or fewer stays a simple list.\n" +
    "- A submit flow element always saves somewhere: saveTo (or deleteFrom) a listed table, or an action of the contract. With no table listed, write no submit step: answers that are just sent use navigationMode \"buttons\" and the viewer's own submit; records to list and follow later (tickets, loans, orders) are a data application.\n" +
    "- Conditions: visibleIf (or disabledIf on a button) with the operators of the contract only.\n" +
    "- No Code database (Baserow) tables: use only the tables listed with the request, write \"table\" as the exact {\"id\": ..., \"path\": \"...\"} object given there, and use their column names exactly as listed.\n" +
    "- Keep it to what is asked, with sensible labels: no styles, boxStyle, colors, thumbnail or wallpaper unless the request asks for a look.";

  var FLASH_RULES = "Flash mode: the user waits in front of the screen for the result. Choose ONE of two routes from the request.\n" +
    "Route 1, a form: a questionnaire, a registration, a request, a declaration or a small application with a few pages and buttons, whose answers are sent by the submit button of the viewer (saved as the responses of the form, natively, no table needed). " +
    "Write the reduced form JSON as described above, choosing sensible fields, labels, choices and pages yourself: a short request such as \"a satisfaction survey for my restaurant\" is enough.\n" +
    "Route 2, a data application: screens over business records kept in a No Code database table: a list of the records (with search or filters), an entry form that adds a record, the detail of a selected record, a dashboard or chart of the records " +
    "(a CRM, an inventory, a tracking of visits, tickets, loans or orders with their list). Answer only {\"flash\": \"app\", \"spec\": <spec>}, the small business spec that the tool nocode-app-create builds in one call (tables, fields and screens): " +
    "spec = {\"name\": visible name, \"language\": \"fr\"|\"en\", \"description\": one line, \"entities\": [{\"name\": singular business name in lower case (demande, ticket), \"plural\": optional, \"feminine\": true for a feminine French noun, " +
    "\"table\": optional id of an existing table listed with the request, \"fields\": [{\"name\": column name as the list header reads, \"type\": text|long_text|number|date|single_select|boolean|email|phone_number|url|rating|link_row, " +
    "\"required\": bool, \"options\": [choices of a single_select], \"default\": user|user.email|today, \"targetTable\": entity name for a link_row}], " +
    "\"screens\": {\"list\": true or {\"columns\": [at most 5], \"search\": true, \"filters\": [single_select columns], \"sort\": \"-Column\"}, \"form\": true, \"detail\": true, \"dashboard\": {\"groupBy\": column, \"aggregations\": [\"count\"], \"chart\": \"bar\"|\"pie\"|\"donut\"|\"line\"}}}]}. " +
    "The first text field of an entity is its primary field; at most 4 entities; no screen the request does not imply beyond list and form.\n" +
    "A survey or a form whose answers are just sent is ALWAYS route 1, even when the request says \"save\" or \"record\": only explicit lists, details or dashboards of records make route 2.\n" +
    "Answer instead with exactly {\"flash\": \"decline\", \"kind\": \"<kind>\", \"reason\": \"<one sentence of at most 25 words to the user, in the request's language, saying what Flash cannot do; no question, no offer>\"} only in these cases:\n" +
    "- kind \"clarify\": the request does not say what to build (\"make me a form\", \"help me\", \"a proof of concept\"), or it is a question, not something to build;\n" +
    "- kind \"app\": approval workflows or circuits between several users, more than 4 kinds of records, or several applications at once;\n" +
    "- kind \"tables\": it asks to change, import into or fill existing tables rather than build screens;\n" +
    "- kind \"edit\": it asks to change an existing form instead of creating a new one.";

  var NON_FIELD_TYPES = { "ion-card": 1, section: 1, layout: 1, description: 1, label: 1, title: 1, html: 1, img: 1, image: 1, grid: 1, gallery: 1,
    chart: 1, map: 1, button: 1, separator: 1, divider: 1, spacer: 1, workflow_instance: 1, workflow_status: 1, workflow_token: 1, workflow_progress: 1 };

  var STOP = {};
  ("le la les un une des de du et ou au aux en dans pour par sur avec sans ce cet cette ces mon ma mes ton ta tes son " +
   "sa ses notre nos votre vos leur leurs qui que quoi dont est sont etre avoir il elle ils elles on nous vous je tu me te se ne pas " +
   "plus faire fais veux voudrais besoin merci peux pouvez the an of and or to in for on with by at from is are be it this that these " +
   "those my your our their we you me please can could would will should need want make create build add").split(" ").forEach(function (w) { STOP[w] = true; });

  function str(value) { return value == null ? "" : String(value).trim(); }
  function errorOf(e) { return str(e && e.message ? e.message : e); }

  // ---- the text of a request: the tokens of the bank (BM25, k1 1.2, b 0.75) ----
  // fold: lower case without accents (the host's NFKD); the bank was tokenised the same way when it was built.
  function toks(text, host) {
    var folded = host.fold(String(text || "").toLowerCase());
    var out = [];
    var re = /[a-z0-9]+/g;
    var m;
    while ((m = re.exec(folded)) !== null) {
      var w = m[0];
      if (w.length < 2 || STOP[w] === true) { continue; }
      if (w.length > 4 && w.charAt(w.length - 1) === "s") { w = w.substring(0, w.length - 1); }
      out.push(w);
    }
    return out;
  }

  function indexBank(docs, host) {
    var df = {};
    var total = 0;
    var indexed = [];
    for (var i = 0; i < docs.length; i++) {
      var d = docs[i];
      if (!d || !str(d.u).length || !str(d.a).length) { continue; }
      var words = toks(d.u, host);
      total += words.length;
      var seen = {};
      for (var j = 0; j < words.length; j++) {
        if (seen[words[j]] !== true) { seen[words[j]] = true; df[words[j]] = (df[words[j]] || 0) + 1; }
      }
      indexed.push({ id: str(d.id), lang: str(d.lang), u: String(d.u), a: String(d.a), words: words });
    }
    return { docs: indexed, df: df, avg: indexed.length ? total / indexed.length : 1, n: indexed.length };
  }

  // The K closest examples, those in the request's language first; the most similar is the last one sent.
  function retrieve(bank, userText, lang, host) {
    var query = {};
    toks(userText, host).forEach(function (w) { query[w] = true; });
    var terms = Object.keys(query);
    var scored = [];
    for (var i = 0; i < bank.docs.length; i++) {
      var d = bank.docs[i];
      var tf = {};
      for (var j = 0; j < d.words.length; j++) { if (query[d.words[j]] === true) { tf[d.words[j]] = (tf[d.words[j]] || 0) + 1; } }
      var s = 0;
      var norm = 1.2 * (1 - 0.75 + 0.75 * d.words.length / bank.avg);
      for (var t = 0; t < terms.length; t++) {
        var f = tf[terms[t]];
        if (f) {
          var x = bank.df[terms[t]] || 0;
          s += Math.log(1 + (bank.n - x + 0.5) / (x + 0.5)) * f * 2.2 / (f + norm);
        }
      }
      scored.push({ i: i, s: s });
    }
    scored.sort(function (a, b) { return b.s - a.s || a.i - b.i; });
    var picked = [];
    for (var k = 0; k < scored.length && picked.length < K; k++) {
      if (bank.docs[scored[k].i].lang === lang && scored[k].s > 0) { picked.push(scored[k]); }
    }
    for (var k2 = 0; k2 < scored.length && picked.length < K; k2++) {
      if (picked.indexOf(scored[k2]) < 0) { picked.push(scored[k2]); }
    }
    return picked.map(function (p) { var d = bank.docs[p.i]; return { id: d.id, user: d.u, assistant: d.a, score: Math.round(p.s * 100) / 100 }; });
  }

  function bankOf(host) {
    return host.cached("bank", function () { return indexBank(host.bankDocs(), host); });
  }

  // ---- the stable prompt: built once per contract version and rules, then read back as is ----
  function contractSections(project) {
    var out = {};
    var queue = CONTRACT_SECTIONS.slice();
    for (var guard = 0; queue.length && guard < 12; guard++) {
      var answer = C8O.nocodeForms.contract({ project: project, sections: queue });
      Object.keys(answer.sections || {}).forEach(function (key) { out[key] = answer.sections[key]; });
      queue = answer.remaining || [];
    }
    return out;
  }

  function stablePrompt(project, host) {
    var core = C8O.nocodeForms.contract({ project: project });
    var version = str(core && core.contractVersion);
    if (!version.length || !core.quickReference) {
      throw new Error("The No Code form contract of " + project + " could not be read.");
    }
    var name = "prompt-" + version.replace(/[^A-Za-z0-9._+-]/g, "_") + "-" + host.sha1(RULES + "\n" + FLASH_RULES) + ".txt";
    var kept = str(host.readPrompt(name));
    if (kept.indexOf("You are the expert author") === 0) {
      return { text: kept, version: version, id: host.sha1(kept) };
    }
    var sections = contractSections(project);
    var parts = [
      "You are the expert author of C8Oforms No Code forms. You turn a user's request into the reduced JSON of the contract below.",
      RULES,
      "CONTRACT " + version + " - core (quickReference):\n" + JSON.stringify(core.quickReference),
      "Component types: " + JSON.stringify(core.types) + "; aliases " + JSON.stringify(core.aliases)
    ];
    Object.keys(sections).sort().forEach(function (key) {
      parts.push("Section " + key + ":\n" + JSON.stringify(sections[key]));
    });
    parts.push(FLASH_RULES);
    var text = parts.join("\n\n");
    host.writePrompt(name, text);
    return { text: text, version: version, id: host.sha1(text) };
  }

  // ---- the request turn (the same shape as the bank's user turns) ----
  function tablesBlock(tables, fr) {
    var list = Array.isArray(tables) ? tables : [];
    if (!list.length) { return ""; }
    var lines = ["", fr ? "Tables de la base de données no-code :" : "No-code database tables:"];
    list.forEach(function (t) {
      if (!t || typeof t !== "object") { return; }
      var cols = (Array.isArray(t.columns) ? t.columns : []).map(function (c) {
        var s = str(c && c.name) + " (" + str(c && c.type);
        if (c && Array.isArray(c.options) && c.options.length) { s += ": " + c.options.join(", "); }
        return s + ")";
      });
      var name = String(t.path || t.name || "").split("~>").pop();
      lines.push("- " + name + ": " + JSON.stringify({ id: t.id, path: t.path }) + "; " + (fr ? "colonnes : " : "columns: ") + cols.join("; "));
    });
    return lines.join("\n");
  }

  function guessLanguage(text) {
    var words = String(text || "").toLowerCase().split(/[^a-zà-ÿ']+/);
    var fr = 0, en = 0;
    var FR = { le: 1, la: 1, les: 1, des: 1, une: 1, pour: 1, avec: 1, et: 1, du: 1, de: 1, est: 1, qui: 1, sur: 1, "à": 1 };
    var EN = { the: 1, and: 1, "with": 1, "for": 1, of: 1, a: 1, to: 1, an: 1, is: 1, that: 1, on: 1 };
    words.forEach(function (w) { if (FR[w]) { fr++; } if (EN[w]) { en++; } });
    return fr >= en ? "fr" : "en";
  }

  function parseTables(value) {
    var tables = value;
    if (typeof tables === "string") {
      if (!str(tables).length) { return []; }
      try { tables = JSON.parse(tables); } catch (_badTables) { return []; }
    }
    if (tables && !Array.isArray(tables) && typeof tables === "object") { tables = [tables]; }
    return Array.isArray(tables) ? tables : [];
  }

  // ---- the model's answer ----
  function extractJson(text) {
    var t = str(text);
    if (t.indexOf("```") === 0) {
      t = t.indexOf("\n") >= 0 ? t.substring(t.indexOf("\n") + 1) : t.substring(3);
      if (t.lastIndexOf("```") >= 0) { t = t.substring(0, t.lastIndexOf("```")); }
    }
    var i = t.indexOf("{"), j = t.lastIndexOf("}");
    if (i < 0 || j < 0) { throw new Error("no JSON object in the answer"); }
    return JSON.parse(t.substring(i, j + 1));
  }

  // { text, call } from the gateway's answer (OpenAI-compatible LiteLLM); the cost comes from x-litellm-response-cost.
  function readAnswer(answer, pending, host) {
    if (answer.status < 200 || answer.status >= 300) {
      throw new Error("The LLM gateway refused the request (HTTP " + answer.status + "): " + str(answer.body).substring(0, 400));
    }
    var data = JSON.parse(answer.body);
    var choice = (data.choices && data.choices[0]) || {};
    var content = choice.message ? choice.message.content : "";
    if (Array.isArray(content)) {
      content = content.filter(function (c) { return c && c.type === "text"; }).map(function (c) { return c.text || ""; }).join("");
    }
    var usage = data.usage || {};
    var cost = parseFloat(answer.cost);
    return {
      text: str(content),
      call: {
        stage: pending.stage,
        ms: host.now() - pending.t0,
        inputTokens: Number(usage.prompt_tokens) || 0,
        cachedTokens: Number((usage.prompt_tokens_details || {}).cached_tokens) || 0,
        outputTokens: Number(usage.completion_tokens) || 0,
        reasoningTokens: Number((usage.completion_tokens_details || {}).reasoning_tokens) || 0,
        cost: isFinite(cost) ? cost : null,
        callId: str(answer.callId) || str(data.id),
        finish: str(choice.finish_reason)
      }
    };
  }

  // ---- compile + validate: the internals of nocode-form-compile and nocode-form-validate ----
  function short(item) { return { code: str(item && item.code), message: str(item && item.message).substring(0, 300), path: str(item && item.path) }; }

  function check(reduced, opts) {
    var res = { ok: false, compiled: false, valid: false, issues: [], warnings: [], error: null };
    var compiled;
    try {
      compiled = C8O.nocodeForms.compile(reduced, { project: opts.project, token: opts.token });
    } catch (e) {
      res.error = errorOf(e).substring(0, 600);
      return res;
    }
    if (!compiled || compiled.error || !compiled.form) {
      var err = compiled && compiled.error;
      res.error = (err && typeof err === "object" ? str(err.message || err.code) : str(err || JSON.stringify(compiled))).substring(0, 600);
      var cv = compiled && compiled.validation;
      if (cv && Array.isArray(cv.issues)) { res.issues = cv.issues.map(short); }
      return res;
    }
    res.compiled = true;
    var v1 = compiled.validation || {};
    var v2 = {};
    try {
      var v = C8O.nocodeForms.validate(compiled.form, { project: opts.project, token: opts.token });
      v2 = (v && v.validation) || {};
    } catch (e2) {
      res.error = "validate: " + errorOf(e2).substring(0, 400);
    }
    var seen = {};
    var warnings = [];
    (v1.warnings || []).concat(v2.warnings || []).forEach(function (w) {
      if (!w || EXPECTED_WARNINGS[w.code] === true) { return; }
      var key = w.code + "|" + w.path;
      if (!seen[key]) { seen[key] = true; warnings.push(short(w)); }
    });
    var seenIssues = {};
    res.issues = (v1.issues || []).concat(v2.issues || []).map(short).filter(function (i) {
      var key = i.code + "|" + i.path;
      if (seenIssues[key]) { return false; }
      seenIssues[key] = true;
      return true;
    });
    res.warnings = warnings;
    res.valid = v1.valid === true && v2.valid === true && !res.error;
    res.ok = res.valid && !res.issues.length;
    return res;
  }

  function feedback(res) {
    if (res.error && !res.compiled) { return "nocode-form-compile refused it: " + res.error + "\nFix it and answer with the whole corrected JSON object only."; }
    var lines = res.issues.concat(res.warnings).slice(0, 15).map(function (x) { return x.code + ": " + x.message + " (" + x.path + ")"; });
    if (res.error) { lines.unshift(res.error); }
    return "nocode-form-compile/validate reported:\n" + lines.join("\n") + "\nFix it and answer with the whole corrected JSON object only.";
  }

  function formSummary(red) {
    var fields = 0, sections = 0;
    function walk(list) {
      (Array.isArray(list) ? list : []).forEach(function (f) {
        if (!f || typeof f !== "object") { return; }
        if (String(f.type || "") === "section") { sections++; }
        if (f.name && NON_FIELD_TYPES[String(f.type || "")] !== 1) { fields++; }
        walk(f.fields); walk(f.children);
      });
    }
    var pages = Array.isArray(red && red.pages) ? red.pages : [];
    pages.forEach(function (p) { walk(p && p.fields); });
    return { name: str(red && red.name), pages: pages.length, fields: fields, sections: sections, language: str(red && red.language), navigationMode: str(red && red.navigationMode) };
  }

  // A save that met auth_required is tried once more: the token is checked again on each call, and a check that failed
  // while another call of the same user ran gave auth_required to a valid token.
  function withAuthRetry(save, host) {
    var result = save();
    if (result && result.status === "auth_required") {
      host.pause(AUTH_RETRY_PAUSE_MS);
      result = save();
      if (result && typeof result === "object") { result.authRetried = true; }
    }
    return result;
  }

  // ---- route 2: a data application written as the business spec of nocode-app-create ----
  var APP_TYPES = { text: 1, long_text: 1, number: 1, date: 1, single_select: 1, "boolean": 1, email: 1, phone_number: 1, url: 1, rating: 1, link_row: 1 };
  var APP_TYPE_ALIASES = { select: "single_select", choice: "single_select", radio: "single_select", textarea: "long_text", multiline: "long_text", phone: "phone_number", tel: "phone_number",
    datetime: "date", integer: "number", decimal: "number", checkbox: "boolean", yesno: "boolean", link: "link_row" };

  // The slips of the model nocode-app-create would refuse, fixed without a model call (each one is listed in the answer).
  function sanitizeSpec(spec) {
    var fixes = [];
    (Array.isArray(spec.entities) ? spec.entities : []).forEach(function (en, i) {
      (Array.isArray(en && en.fields) ? en.fields : []).forEach(function (f, j) {
        if (!f || typeof f !== "object") { return; }
        var path = "entities[" + i + "].fields[" + j + "]";
        if (f.type != null && APP_TYPES[f.type] !== 1) {
          var alias = APP_TYPE_ALIASES[String(f.type).toLowerCase()];
          fixes.push(path + ".type " + f.type + " -> " + (alias || "text"));
          f.type = alias || "text";
        }
        if (f["default"] != null && ["user", "user.email", "today"].indexOf(String(f["default"])) < 0) {
          fixes.push(path + ".default " + f["default"] + " dropped");
          delete f["default"];
        }
        if (f.options != null && !Array.isArray(f.options)) { delete f.options; fixes.push(path + ".options dropped"); }
        if (f.type !== "single_select" && Array.isArray(f.options)) { delete f.options; }
      });
    });
    return fixes;
  }

  function appRoute(job, opts, spec, host) {
    job.stage = "app";
    if (!C8O.nocodeApp || typeof C8O.nocodeApp.create !== "function") {
      return { out: { status: "error", route: "app", error: { code: "no_app_tool", message: "nocode-app-create is not available on this server." } } };
    }
    job.specFixes = (job.specFixes || []).concat(sanitizeSpec(spec));
    spec.mode = job.mode === "create" ? "apply" : "plan";
    if (!str(spec.language).length) { spec.language = job.lang; }
    var t0 = host.now();
    var app = withAuthRetry(function () {
      try {
        return C8O.nocodeApp.create(spec, { project: opts.project, token: opts.token });
      } catch (e) {
        return { status: "error", saved: false, error: { code: "app_create_failed", message: errorOf(e) } };
      }
    }, host) || {};
    var tables = (app.baserow && Array.isArray(app.baserow.tables)) ? app.baserow.tables : [];
    var fields = 0;
    (Array.isArray(spec.entities) ? spec.entities : []).forEach(function (en) { fields += Array.isArray(en && en.fields) ? en.fields.length : 0; });
    job.appSummary = { name: str(spec.name), pages: Array.isArray(app.pages) ? app.pages.length : 0, fields: fields, tables: tables.length,
      base: app.baserow && app.baserow.base ? str(app.baserow.base.name) : "", language: str(spec.language), navigationMode: "custom", route: "app" };
    var out = { status: app.saved === true ? "created" : (spec.mode === "plan" && app.status === "ok" ? "draft" : "error"), saved: app.saved === true, route: "app",
      appMs: host.now() - t0, validation: { ok: app.saved === true && app.status === "ok" || !!(app.validation && (app.validation.valid === true || app.validation.ok === true)) },
      tables: tables.map(function (t) { return { id: t.id, name: t.name, created: t.created }; }),
      base: app.baserow && app.baserow.base ? { id: app.baserow.base.id, name: str(app.baserow.base.name) } : null,
      pages: (Array.isArray(app.pages) ? app.pages : []).map(function (p) { return p && p.name; }) };
    if (app.id) { out.id = app.id; }
    if (app.error) { out.error = app.error; }
    if (app.authRetried) { out.authRetried = true; }
    if (job.mode !== "create") { out.spec = spec; }
    if (job.specFixes.length) { out.specFixes = job.specFixes; }
    // a spec the tool refused before writing anything: the model fixes it from the exact error
    if (app.saved !== true && app.error && /^invalid_spec|^spec_/.test(str(app.error.code))) {
      return { out: out, repair: "nocode-app-create refused the spec: " + str(app.error.path) + ": " + str(app.error.message) +
        "\nFix it and answer with the whole corrected JSON object only ({\"flash\": \"app\", \"spec\": ...})." };
    }
    return { out: out };
  }

  // ---- the job: resumable across calls ----
  function chatBody(messages, reasoning) {
    var body = { model: MODEL, messages: messages, temperature: 0, top_p: 1, max_tokens: MAX_TOKENS };
    if (reasoning) { body.reasoning_effort = reasoning; }
    return body;
  }

  function send(job, host, key, stage) {
    job.pending = { stage: stage, t0: host.now(), call: host.startChat(key, chatBody(job.messages, job.reasoning)) };
  }

  // the next model call of the job, with the key resolved again (the Assistant may have renewed the user's key meanwhile);
  // null once sent, else the error that stopped it
  function sendRepair(job, host, answerText, content) {
    var credential = host.gatewayKey(job.keyParams);
    if (credential.error) { return credential.error; }
    job.messages.push({ role: "assistant", content: answerText });
    job.messages.push({ role: "user", content: content });
    job.attempts++;
    send(job, host, credential.key, "repair");
    return null;
  }

  function callerOf(params, host) {
    return host.sha1(str(params.token) + "|" + str(params.userId));
  }

  function finish(job, out, host) {
    var cost = 0, costKnown = 0, inTok = 0, cached = 0, outTok = 0, reasoningTok = 0;
    job.ledger.forEach(function (c) {
      inTok += c.inputTokens; cached += c.cachedTokens; outTok += c.outputTokens; reasoningTok += c.reasoningTokens;
      if (c.cost !== null) { cost += c.cost; costKnown++; }
    });
    out.jobId = job.id;
    out.contractVersion = job.prompt.version;
    out.promptId = job.prompt.id;
    out.examples = job.shots.map(function (x) { return x.id; });
    out.attempts = job.attempts;
    out.reasoning = job.reasoning || "default";
    out.durationMs = host.now() - job.startedAt;
    if (job.appSummary) { out.summary = job.appSummary; } else if (job.best && job.best.reduced) { out.summary = formSummary(job.best.reduced); }
    out.usage = { model: MODEL, keySource: job.keySource, requests: job.ledger.length, inputTokens: inTok, cachedTokens: cached, outputTokens: outTok,
      reasoningTokens: reasoningTok, cost: costKnown ? Math.round(cost * 1e6) / 1e6 : null, currency: "USD", costSource: "gateway",
      perCall: job.ledger.map(function (c) { return { stage: c.stage, ms: c.ms, in: c.inputTokens, cached: c.cachedTokens, out: c.outputTokens, usd: c.cost }; }) };
    job.done = out;
    job.messages = null;
    return out;
  }

  function running(job, host) {
    return { status: "running", jobId: job.id, stage: job.pending ? job.pending.stage : job.stage, attempts: job.attempts, elapsedMs: host.now() - job.startedAt };
  }

  function complete(job, opts, host) {
    var best = job.best;
    var validation = { ok: best.res.ok, compiled: best.res.compiled, issues: best.res.issues, warnings: best.res.warnings };
    if (best.res.error) { validation.error = best.res.error; }
    if (!best.res.ok) {
      return finish(job, { status: "invalid", saved: false, route: "form", reduced: best.reduced, validation: validation }, host);
    }
    if (job.mode !== "create") {
      return finish(job, { status: "draft", saved: false, route: "form", reduced: best.reduced, validation: validation }, host);
    }
    job.stage = "save";
    var saved = withAuthRetry(function () { return C8O.nocodeForms.create(best.reduced, { project: opts.project, token: opts.token }); }, host) || {};
    var out = { status: saved.saved === true ? "created" : "error", saved: saved.saved === true, route: "form", validation: validation };
    if (saved.id) { out.id = saved.id; }
    if (saved.rev) { out.rev = saved.rev; }
    if (saved.authRetried) { out.authRetried = true; }
    if (saved.validation) {
      out.validation.afterSave = { valid: saved.validation.valid, issues: (saved.validation.issues || []).map(short),
        warnings: (saved.validation.warnings || []).filter(function (w) { return EXPECTED_WARNINGS[w.code] !== true; }).map(short) };
    }
    if (saved.saved !== true) { out.error = saved.error || { code: str(saved.status) || "save_failed", message: "The form was not saved." }; }
    return finish(job, out, host);
  }

  // Advances the job until it is done or the budget of this call is spent.
  function advance(job, opts, deadline, host) {
    while (true) {
      if (job.done) { return job.done; }
      if (!job.pending) { return finish(job, { status: "error", error: { code: "job_state", message: "Nothing under way in this job." } }, host); }
      var pending = job.pending;
      var answer = null;
      try {
        var raw = host.awaitChat(pending.call, deadline - host.now());
        if (raw === null) {
          if (host.now() - pending.t0 <= CALL_TIMEOUT_MS) { return running(job, host); }
          host.cancelChat(pending.call);
          throw new Error("The LLM gateway did not answer within " + Math.round(CALL_TIMEOUT_MS / 1000) + " s.");
        }
        answer = readAnswer(raw, pending, host);
        job.ledger.push(answer.call);
      } catch (callError) {
        job.pending = null;
        var message = host.redact(errorOf(callError));
        var budget = /budget|exceeded|429/i.test(message);
        if (!job.best) { return finish(job, { status: "error", error: { code: budget ? "gateway_budget" : "gateway_error", message: message } }, host); }
        job.gatewayError = message;
        return complete(job, opts, host);
      }
      job.pending = null;
      var reduced = null, res;
      try {
        reduced = extractJson(answer.text);
        if (reduced && reduced.flash === "decline") {
          return finish(job, { status: "declined", kind: str(reduced.kind) || "other", reason: str(reduced.reason).substring(0, 700) }, host);
        }
        if (reduced && reduced.flash === "app" && reduced.spec && typeof reduced.spec === "object") {
          var routed = appRoute(job, opts, reduced.spec, host);
          if (routed.repair && job.attempts <= MAX_REPAIRS && sendRepair(job, host, answer.text, routed.repair) === null) {
            continue;
          }
          return finish(job, routed.out, host);
        }
        res = check(reduced, opts);
      } catch (parseError) {
        res = { ok: false, compiled: false, valid: false, issues: [], warnings: [], error: "the answer was not a JSON object: " + errorOf(parseError) };
      }
      if (reduced && (!job.best || res.ok || (!job.best.res.ok && res.issues.length <= job.best.res.issues.length && (res.compiled || !job.best.res.compiled)))) {
        job.best = { reduced: reduced, res: res };
      }
      if (!res.ok && job.attempts <= MAX_REPAIRS && sendRepair(job, host, answer.text, feedback(res)) === null) {
        continue;
      }
      if (!job.best) {
        return finish(job, { status: "error", error: { code: "no_json", message: "The generator gave no usable JSON." } }, host);
      }
      return complete(job, opts, host);
    }
  }

  // params: request, tables (the No Code database tables to use), language (fr|en, guessed when empty), mode (create,
  // or draft to only write it), reasoning (low|medium|high, empty for the gateway default), project, token (the user's
  // No Code bearer), userId and gatewayKeyHandle (the user's gateway key, see javaHost().gatewayKey); or jobId alone,
  // with the same token and userId, to resume a generation that answered status running.
  api.run = function (params, host) {
    params = params || {};
    host = host || api.javaHost();
    var deadline = host.now() + CALL_BUDGET_MS;
    var opts = { project: str(params.project) || "C8Oforms", token: str(params.token) };
    var jobs = host.jobs();
    jobs.keys().forEach(function (id) {
      var old = jobs.get(id);
      if (old && host.now() - old.startedAt > JOB_KEEP_MS) { jobs.remove(id); }
    });
    var jobId = str(params.jobId);
    if (jobId.length) {
      var job = jobs.get(jobId);
      if (job == null || job.caller !== callerOf(params, host)) {
        return { status: "error", error: { code: "unknown_job", message: "No generation " + jobId + " for this user (generations are kept 30 minutes)." } };
      }
      return advance(job, opts, deadline, host);
    }
    var request = str(params.request);
    if (!request.length) {
      return { status: "error", error: { code: "missing_request", message: "Give the request: what the user wants, in their words." } };
    }
    if (!opts.token.length) {
      return { status: "error", error: { code: "missing_token", message: "No Code authentication is required." } };
    }
    var keyParams = { gatewayKeyHandle: str(params.gatewayKeyHandle), userId: str(params.userId) };
    var credential = host.gatewayKey(keyParams);
    if (credential.error) { return { status: "error", error: credential.error }; }
    var lang = str(params.language).toLowerCase().substring(0, 2);
    if (lang !== "fr" && lang !== "en") { lang = guessLanguage(request); }
    var prompt;
    try {
      prompt = stablePrompt(opts.project, host);
    } catch (contractError) {
      return { status: "error", error: { code: "no_contract", message: errorOf(contractError) } };
    }
    var user = request + tablesBlock(parseTables(params.tables), lang === "fr");
    var shots = retrieve(bankOf(host), user, lang, host);
    var messages = [{ role: "system", content: prompt.text }];
    for (var s = shots.length - 1; s >= 0; s--) {
      messages.push({ role: "user", content: shots[s].user });
      messages.push({ role: "assistant", content: shots[s].assistant });
    }
    messages.push({ role: "user", content: user });
    var newJob = { id: "gen-" + host.uuid(), caller: callerOf(params, host), keyParams: keyParams, keySource: credential.source, startedAt: host.now(),
      mode: str(params.mode).toLowerCase() === "draft" ? "draft" : "create", prompt: prompt, shots: shots, messages: messages, ledger: [], attempts: 1,
      best: null, pending: null, done: null, stage: "generate", lang: lang, reasoning: REASONING[str(params.reasoning).toLowerCase()] || "" };
    send(newJob, host, credential.key, "generate");
    jobs.put(newJob.id, newJob);
    return advance(newJob, opts, deadline, host);
  };

  api.MODEL = MODEL;
  api.RULES = RULES;
  api.FLASH_RULES = FLASH_RULES;
  api.internals = { toks: toks, indexBank: indexBank, retrieve: retrieve, extractJson: extractJson, sanitizeSpec: sanitizeSpec, guessLanguage: guessLanguage,
    formSummary: formSummary, tablesBlock: tablesBlock, userGatewayKey: userGatewayKey };

  // ---- the gateway key ----
  // The user's key behind the handle the Assistant keeps in the engine's server store (lib_ConvertigoAssistant
  // userGatewayKeyHandle, the same handle an agent turn gets): it must belong to this user. {key} or {error}.
  var USER_KEY_HANDLE_PATTERN = /^lib_ConvertigoAssistant\.gatewayKey\.[A-Za-z0-9_-]{8,128}$/;
  var USER_KEY_PATTERN = /^sk-[A-Za-z0-9_-]{16,256}$/;
  function userGatewayKey(handle, userId, bundleText) {
    var refuse = function (code, message) { return { error: { code: code, message: message } }; };
    if (!USER_KEY_HANDLE_PATTERN.test(str(handle))) { return refuse("gateway_credential_invalid", "The gateway key handle is not valid."); }
    var bundle = null;
    try { bundle = JSON.parse(str(bundleText) || "null"); } catch (_badBundle) { bundle = null; }
    if (!bundle || typeof bundle !== "object") { return refuse("gateway_credential_missing", "Your Tigo key is no longer available: send your request again."); }
    if (!str(userId).length || str(bundle.owner) !== str(userId)) { return refuse("gateway_credential_foreign", "This Tigo key belongs to another user."); }
    if (!USER_KEY_PATTERN.test(str(bundle.key))) { return refuse("gateway_credential_invalid", "The Tigo key is not valid."); }
    return { key: str(bundle.key), source: "user" };
  }

  // ---- the engine ----
  api.javaHost = function () {
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    var File = java.io.File;
    var Files = java.nio.file.Files;
    var UTF8 = java.nio.charset.StandardCharsets.UTF_8;
    var STORE_PREFIX = "lib_ConvertigoMCP.nocodeFormGenerate.";
    function store() { return context.server; }
    function readText(file) { return String(new java.lang.String(Files.readAllBytes(file.toPath()), UTF8)); }
    function projectDir() {
      var name = "lib_ConvertigoMCP";
      try { if (context && context.project && context.project.getName) { name = String(context.project.getName()); } } catch (_noProject) {}
      return new File(String(Engine.theApp.databaseObjectsManager.getOriginalProjectByName(name).getDirPath()));
    }
    function bankFile() { return new File(new File(new File(projectDir(), "resources"), "nocode-form-generator"), "bank.json.gz"); }
    function promptDir() {
      return new File(new File(C8O.tigoAgentsDirectory(String(Engine.USER_WORKSPACE_PATH), File), "nocode"), "form-generator");
    }
    function perUserKeys() {
      try {
        if (Engine.isStudioMode() == true) { return false; }
        var forms = Engine.theApp.databaseObjectsManager.getOriginalProjectByName("C8Oforms");
        if (forms == null || forms.getSequenceByName("APIV2_TigoUserKey") == null) { return false; }
        return str(Engine.theApp.databaseObjectsManager.symbolsGetValue("C8Oforms.tigo.server.id")).length > 0;
      } catch (_noUserKeys) {
        return false;
      }
    }
    function serverKey() {
      try {
        var keyFile = new File(new File(C8O.tigoAgentsDirectory(String(Engine.USER_WORKSPACE_PATH), File), "convertigo"), "llm-api-key");
        if (keyFile.isFile()) {
          var first = str(readText(keyFile).split(/\r?\n/)[0]);
          if (first.length && first.indexOf("#") !== 0) { return first; }
        }
      } catch (_noKeyFile) {}
      return str(java.lang.System.getenv("CONVERTIGO_LLM_API_KEY"));
    }
    return {
      now: function () { return Number(java.lang.System.currentTimeMillis()); },
      uuid: function () { return String(java.util.UUID.randomUUID()); },
      pause: function (ms) { try { java.lang.Thread.sleep(ms); } catch (_interrupted) {} },
      sha1: function (text) {
        var bytes = java.security.MessageDigest.getInstance("SHA-1").digest(new java.lang.String(text).getBytes(UTF8));
        var hex = "";
        for (var i = 0; i < 6; i++) { var b = (bytes[i] & 0xff).toString(16); hex += b.length < 2 ? "0" + b : b; }
        return hex;
      },
      fold: function (text) {
        return String(java.text.Normalizer.normalize(new java.lang.String(text), java.text.Normalizer.Form.NFKD)).replace(/[̀-ͯ]/g, "");
      },
      // what a computation gives once per engine, kept with the version of its source (the bank file)
      cached: function (name, compute) {
        var file = bankFile();
        var key = STORE_PREFIX + name + "|" + file.length() + "|" + file.lastModified();
        var kept = store().get(key);
        if (kept != null) { return kept; }
        var value = compute();
        store().set(key, value);
        return value;
      },
      bankDocs: function () {
        var input = new java.util.zip.GZIPInputStream(new java.io.FileInputStream(bankFile()));
        try {
          return JSON.parse(String(new java.lang.String(input.readAllBytes(), UTF8))).docs || [];
        } finally {
          input.close();
        }
      },
      readPrompt: function (name) {
        var file = new File(promptDir(), name);
        return file.isFile() ? readText(file) : "";
      },
      writePrompt: function (name, text) {
        var file = new File(promptDir(), name);
        file.getParentFile().mkdirs();
        Files.write(file.toPath(), new java.lang.String(text).getBytes(UTF8));
      },
      jobs: function () {
        var map = store().get(STORE_PREFIX + "jobs");
        if (map == null) { map = new java.util.concurrent.ConcurrentHashMap(); store().set(STORE_PREFIX + "jobs", map); }
        return {
          get: function (id) { return map.get(id); },
          put: function (id, job) { map.put(id, job); },
          remove: function (id) { map.remove(id); },
          keys: function () { var out = []; var it = map.keySet().iterator(); while (it.hasNext()) { out.push(String(it.next())); } return out; }
        };
      },
      gatewayKey: function (keyParams) {
        var handle = str(keyParams && keyParams.gatewayKeyHandle);
        if (handle.length) {
          var raw = "";
          try { raw = USER_KEY_HANDLE_PATTERN.test(handle) ? str(store().get(handle)) : ""; } catch (_noBundle) { raw = ""; }
          return userGatewayKey(handle, keyParams.userId, raw);
        }
        if (perUserKeys()) {
          return { error: { code: "gateway_credential_missing", message: "Your Tigo key could not be obtained: send your request again." } };
        }
        var key = serverKey();
        return key.length ? { key: key, source: "server" } : { error: { code: "no_gateway_key", message: "No Convertigo agent key on this server." } };
      },
      startChat: function (key, body) {
        var Http = java.net.http;
        var client = Http.HttpClient.newBuilder().connectTimeout(java.time.Duration.ofMillis(20000)).build();
        var request = Http.HttpRequest.newBuilder(java.net.URI.create(GATEWAY_URL))
          .timeout(java.time.Duration.ofMillis(CALL_TIMEOUT_MS))
          .header("Content-Type", "application/json")
          .header("Authorization", "Bearer " + key)
          .POST(Http.HttpRequest.BodyPublishers.ofString(JSON.stringify(body), UTF8))
          .build();
        return client.sendAsync(request, Http.HttpResponse.BodyHandlers.ofString(UTF8));
      },
      // null while the call still runs after ms, else {status, body, cost, callId}; throws when it failed
      awaitChat: function (future, ms) {
        var response;
        try {
          response = future.get(Math.max(1, ms), java.util.concurrent.TimeUnit.MILLISECONDS);
        } catch (e) {
          if (/TimeoutException/.test(String(e && e.javaException ? e.javaException : e))) { return null; }
          throw new Error("The LLM gateway could not be reached: " + errorOf(e).substring(0, 300));
        }
        var header = function (name) { var v = response.headers().firstValue(name); return v.isPresent() ? String(v.get()) : ""; };
        return { status: Number(response.statusCode()), body: String(response.body()), cost: header("x-litellm-response-cost"), callId: header("x-litellm-call-id") };
      },
      cancelChat: function (future) { try { future.cancel(true); } catch (_ignoreCancel) {} },
      redact: function (text) {
        return String(text == null ? "" : text).replace(/\bsk-[A-Za-z0-9_\-.]{4,}/g, "sk-[redacted]");
      }
    };
  };
})(C8O.nocodeFormGenerate);
