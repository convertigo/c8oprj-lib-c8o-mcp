// project-lint: one read-only pass over a project for the pitfalls seen in the supervised runs.
// Each rule names what breaks and the fix; tree-apply warns on most of them at write time, this
// tool finds them in objects already built. Result: {project, scanned, counts, findings}.
// The security audit's rules, for SEC-ANONYMOUS-WRITE (include is the engine's; a unit test loads this file without it).
if (typeof include === "function") {
  include("js/security_audit_rules.js");
  include("js/security_audit_collect.js");
}
(function () {
  C8O.lint = C8O.lint || {};

  var MAX_FINDINGS = 300;
  // Ionic and action properties that hold text shown to the user.
  var CONTROL_BEANS = /^(Input|Textarea|TextArea|Select|Searchbar|DateTime|Datetime|InputOtp)$/;
  var TEXT_PROPERTIES = /^(Label|label|placeholder|Placeholder|message|Message|header|Header|subHeader|SubHeader|title|Title|text|Text|cancelText|okText|buttonText|ButtonText|helperText|errorText|HelperText|ErrorText|closeButtonText)$/;
  var NON_RENDERING = /UIAttribute|UIControlEvent|UIStyle|UIControlVariable|UIDynamicAction|UIDynamicAttr|UICustomAction|UIEventSubscriber|UIPageEvent/;

  function str(value) {
    if (value === null || value === undefined) {
      return "";
    }
    try {
      if (typeof value.getValue === "function") {
        return String(value.getValue());
      }
      if (typeof value.getString === "function") {
        return String(value.getString());
      }
    } catch (_ignoreValue) {}
    return String(value);
  }

  function call(dbo, method) {
    try {
      return typeof dbo[method] === "function" ? dbo[method]() : null;
    } catch (_ignoreCall) {
      return null;
    }
  }

  function simpleClassName(dbo) {
    var name = String(dbo.getClass().getName());
    return name.substring(name.lastIndexOf(".") + 1);
  }

  function qnameOf(dbo) {
    try {
      return String(dbo.getFullQName());
    } catch (_ignoreQName) {
      return String(dbo.getName());
    }
  }

  function smartText(raw) {
    // MobileSmartSourceType values read as "plain:..." or "script:..."; keep the text part.
    var text = str(raw);
    return text.replace(/^(plain|script|source):/, "");
  }

  // Two adjacent texts are glued when the first does not end with a space or punctuation and
  // the second does not start with one. A bound (non plain) value counts as a word.
  C8O.lint.gluedBoundary = function (previous, current) {
    var endsOpen = previous.plain ? /[\s:;,.!?\-\u2013\u2014(\[«]$/.test(previous.text) || previous.text.length === 0 : false;
    var startsOpen = current.plain ? /^[\s:;,.!?\-\u2013\u2014)\]»]/.test(current.text) || current.text.length === 0 : false;
    return !endsOpen && !startsOpen;
  };

  // Translation files of an NGX app: DisplayObjects/mobile/assets/i18n/<lang>.json, flat or nested keys.
  C8O.lint.readI18n = function (project) {
    var result = { files: [], keys: {}, values: {} };
    try {
      var dir = new java.io.File(String(project.getDirPath()), "DisplayObjects/mobile/assets/i18n");
      var list = dir.isDirectory() ? dir.listFiles() : null;
      for (var i = 0; list && i < list.length; i++) {
        var name = String(list[i].getName());
        if (!/\.json$/.test(name)) {
          continue;
        }
        var lang = name.replace(/\.json$/, "");
        var json = JSON.parse(String(new java.lang.String(java.nio.file.Files.readAllBytes(list[i].toPath()), "UTF-8")));
        var keys = {};
        var values = [];
        (function walk(node, prefix) {
          for (var k in node) {
            if (!Object.prototype.hasOwnProperty.call(node, k)) {
              continue;
            }
            var full = prefix ? prefix + "." + k : k;
            if (node[k] !== null && typeof node[k] === "object") {
              walk(node[k], full);
            } else {
              keys[full] = true;
              values.push({ key: full, text: String(node[k]) });
            }
          }
        })(json, "");
        result.files.push(lang);
        result.keys[lang] = keys;
        result.values[lang] = values;
      }
    } catch (_ignoreI18n) {}
    return result;
  };

  var REVIEW_BATCH = 20;
  var REVIEW_MAX = 400;
  // A text already reviewed with the same model and language is not sent again: a run lints after each fix and the whole
  // review (up to 35 s, through the gateway) ran each time, 16 lints in one CRM conversation (12/11). The verdicts stay
  // in the engine server store for a week.
  var REVIEW_CACHE_KEY = "lib_ConvertigoMCP.lintTextReviews.v1";
  var REVIEW_CACHE_MS = 7 * 24 * 3600 * 1000;
  var REVIEW_CACHE_MAX = 20000;

  function reviewCacheOf(options) {
    try {
      if (options.reviewCache) {
        return options.reviewCache;
      }
      var store = options.context ? options.context.server : null;
      if (!store) {
        return null;
      }
      if (store.get(REVIEW_CACHE_KEY) == null) {
        store.set(REVIEW_CACHE_KEY, new Packages.java.util.concurrent.ConcurrentHashMap());
      }
      return store.get(REVIEW_CACHE_KEY);
    } catch (_noReviewCache) {
      return null;
    }
  }
  var REVIEW_PROMPT = "You proofread the user-facing strings of a software application. Each line is `id<TAB>text`. " +
    "Ellipses (…) mark values inserted at run time. Check every line, short labels included: one missing accent is a problem. Report only real problems: misspelled words, missing or wrong accents " +
    "or diacritics, typos, broken grammar, and strings written in another language than the one expected. Ignore product names, " +
    "codes, identifiers, units and abbreviations. Answer with JSON only: {\"language\":\"<detected or given language>\"," +
    "\"issues\":[{\"id\":<id>,\"fixed\":\"<the corrected string>\",\"kind\":\"accents|spelling|grammar|language\"}]}. " +
    "Return an empty issues array when everything is correct.";

  function gatewayErrorText(body) {
    var text = String(body || "");
    try {
      var parsed = JSON.parse(text);
      text = String((parsed && parsed.error && (parsed.error.message || parsed.error)) || text);
    } catch (_notJson) {}
    var inner = /"message"\s*:\s*"([^"]+)"/.exec(text);
    return (inner ? inner[1] : text).replace(/\s+/g, " ").substring(0, 240);
  }

  // One review per language: the app's own texts (the language is detected) and each i18n file in its language.
  C8O.lint.reviewTexts = function (options, order, owners, i18n, add, project) {
    if (options.checkTexts === false) {
      // The router also sets it to false for an agent that calls no gateway model (Claude): checkTexts:true then reads as
      // ignored (run 10 F-08). Say both.
      return { skipped: "No text review: checkTexts is false, or this agent calls no gateway model (Claude agents always get false). " +
        "Review the texts the user sees yourself (language, spelling, accents, tone, no placeholder)." };
    }
    var sources = [];
    var pushSource = function (label, language, items) {
      if (items.length) {
        sources.push({ label: label, language: language, items: items.slice(0, REVIEW_MAX) });
      }
    };
    pushSource("app texts", "", order.map(function (text) { return { text: text, where: owners[text].join(", ") }; }));
    for (var lang in i18n.values) {
      if (Object.prototype.hasOwnProperty.call(i18n.values, lang)) {
        pushSource(lang + ".json", lang, i18n.values[lang].map(function (entry) {
          return { text: entry.text, where: "DisplayObjects/mobile/assets/i18n/" + lang + ".json#" + entry.key };
        }));
      }
    }
    if (!sources.length) {
      return { reviewed: 0 };
    }
    if (!C8O.imageDescribe || !C8O.imageDescribe.javaHost) {
      return { skipped: "gateway helper not loaded" };
    }
    if (options.context) {
      var auth = C8O.mcpAuth.authenticateRequest(options.context);
      if (!auth.authenticated || auth.kind === "nocode" || auth.scope !== "mcp:full") {
        return { skipped: "the text review needs a full Convertigo MCP bearer token" };
      }
    }
    var host = options.host || C8O.imageDescribe.javaHost();
    var key = str(host.readKey());
    if (!key.length) {
      return { skipped: "no Convertigo agent key in this Studio (set it from the Tigo assistant)" };
    }
    var model = str(options.textModel) || C8O.imageDescribe.DEFAULT_MODEL;
    var reasoningEffort = "low";
    var usages = [];
    var reviewed = 0;
    var notReviewed = 0;
    var problems = 0;
    var fromCache = 0;
    var report = function (item, kind, fixed, label, language) {
      problems++;
      add("TEXT-REVIEW", "warning", item.where.split(", ")[0],
        "\"" + item.text.substring(0, 80) + "\" (" + str(kind || "spelling") + ", " + label +
        (language ? ", " + language : "") + ")" + (item.where.indexOf(",") > 0 ? "; also in " + item.where.substring(item.where.indexOf(",") + 2) : ""),
        "Write \"" + str(fixed).substring(0, 120) + "\".");
    };
    // The verdicts already known: reported again without a call. The other texts are reviewed, REVIEW_BATCH strings per
    // call (a long list makes the model skip strings).
    var cache = reviewCacheOf(options);
    var cacheKey = function (language, text) {
      return model + "\u0001" + language + "\u0001" + text;
    };
    var groups = [];
    for (var sIndex = 0; sIndex < sources.length; sIndex++) {
      var source = sources[sIndex];
      var pending = [];
      for (var iIndex = 0; iIndex < source.items.length; iIndex++) {
        var known = null;
        try {
          var raw = cache ? cache.get(cacheKey(source.language, source.items[iIndex].text)) : null;
          known = raw == null ? null : JSON.parse(String(raw));
        } catch (_badCached) {
          known = null;
        }
        if (known && Number(known.at) + REVIEW_CACHE_MS > host.now()) {
          fromCache++;
          reviewed++;
          if (known.fixed) {
            report(source.items[iIndex], known.kind, known.fixed, source.label, known.language);
          }
        } else {
          pending.push(source.items[iIndex]);
        }
      }
      for (var from = 0; from < pending.length; from += REVIEW_BATCH) {
        groups.push({ label: source.label, language: source.language, items: pending.slice(from, from + REVIEW_BATCH) });
      }
    }
    var remember = function (group, index, verdict) {
      if (!cache) {
        return;
      }
      try {
        if (typeof cache.size === "function" && cache.size() > REVIEW_CACHE_MAX && typeof cache.clear === "function") {
          cache.clear();
        }
        verdict.at = host.now();
        cache.put(cacheKey(group.language, group.items[index].text), JSON.stringify(verdict));
      } catch (_noRemember) {}
    };
    // The review runs inside the tool call, which a client fails after about a minute (Vibe: mcp_transport_failed on a
    // project-lint of 103 texts, usage tests 30/10). Past the budget the groups left are not reviewed, and said so.
    var reviewBudgetMs = Number(options.textReviewBudgetMs) > 0 ? Number(options.textReviewBudgetMs) : 35000;
    var reviewDeadline = host.now() + reviewBudgetMs;
    var outOfTime = false;
    for (var g = 0; g < groups.length; g++) {
      var items = groups[g].items;
      if (host.now() >= reviewDeadline) {
        outOfTime = true;
        notReviewed += items.length;
        continue;
      }
      var lines = [];
      for (var it = 0; it < items.length; it++) {
        lines.push(it + "\t" + items[it].text.replace(/[\t\r\n]+/g, " ").substring(0, 300));
      }
      // mistral-large-4 refuses reasoning_effort "none" (low, medium or high) and, at temperature 0, a top_p other than 1:
      // every review answered 400 (usage tests 29/10). Without an effort it reasons by default and can spend max_tokens on it.
      var request = {
        model: model,
        max_tokens: 4000,
        temperature: 0,
        top_p: 1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: REVIEW_PROMPT },
          { role: "user", content: (groups[g].language ? "Expected language: " + groups[g].language + "\n" : "") + lines.join("\n") }
        ]
      };
      if (reasoningEffort.length) {
        request.reasoning_effort = reasoningEffort;
      }
      var started = host.now();
      var response;
      // A call never runs far past the budget: the time left, plus room for one answer.
      var callTimeoutMs = Math.min(120000, Math.max(5000, reviewDeadline + 15000 - host.now()));
      try {
        response = host.post(C8O.imageDescribe.GATEWAY_URL + "/chat/completions", key, JSON.stringify(request), callTimeoutMs);
        if (response.status === 400 && request.reasoning_effort && /reasoning_effort/i.test(String(response.body || ""))) {
          // A model that takes no reasoning level: the next calls go without one.
          reasoningEffort = "";
          delete request.reasoning_effort;
          response = host.post(C8O.imageDescribe.GATEWAY_URL + "/chat/completions", key, JSON.stringify(request), callTimeoutMs);
        }
      } catch (postError) {
        if (host.now() >= reviewDeadline) {
          outOfTime = true;
          notReviewed += items.length;
          continue;
        }
        return { skipped: "gateway call failed: " + C8O.imageDescribe.redact(String(postError), key), usages: usages };
      }
      if (response.status < 200 || response.status >= 300) {
        return { skipped: "gateway answered " + response.status + ": " + C8O.imageDescribe.redact(gatewayErrorText(response.body), key), usages: usages };
      }
      var answer = readReviewAnswer(response, started);
      // mistral-large-4 at reasoning_effort low once spent its 4 000 tokens reasoning and answered nothing: the group
      // counted as reviewed with no problem (PCA eval 30/10). A cut answer is asked again with more room, then left out.
      if (answer === null && host.now() < reviewDeadline) {
        request.max_tokens = 12000;
        started = host.now();
        try {
          response = host.post(C8O.imageDescribe.GATEWAY_URL + "/chat/completions", key, JSON.stringify(request),
            Math.min(120000, Math.max(5000, reviewDeadline + 15000 - host.now())));
        } catch (_retryFailed) {
          response = null;
        }
        answer = response && response.status >= 200 && response.status < 300 ? readReviewAnswer(response, started) : null;
      }
      if (answer === null) {
        notReviewed += items.length;
        continue;
      }
      reviewed += items.length;
      var issues = Array.isArray(answer.issues) ? answer.issues : [];
      var verdicts = {};
      for (var q = 0; q < issues.length; q++) {
        var item = items[Number(issues[q].id)];
        if (!item || !str(issues[q].fixed).length || str(issues[q].fixed) === item.text) {
          continue;
        }
        verdicts[Number(issues[q].id)] = { kind: str(issues[q].kind || "spelling"), fixed: str(issues[q].fixed), language: str(answer.language) };
        report(item, issues[q].kind, issues[q].fixed, groups[g].label, answer.language);
      }
      for (var v = 0; v < items.length; v++) {
        remember(groups[g], v, verdicts[v] || { ok: true });
      }
    }
    var result = { reviewed: reviewed, problems: problems, model: model, usages: usages };
    if (fromCache > 0) {
      result.fromCache = fromCache;
    }
    if (notReviewed > 0) {
      result.notReviewed = notReviewed;
      result.message = notReviewed + " texts were not reviewed: " + (outOfTime
        ? "the review stopped after " + Math.round(reviewBudgetMs / 1000) + " s, so the lint answers before the client gives up. Run project-lint again to review them."
        : "the model answer was cut twice.");
    }
    return result;

    function readReviewAnswer(answered, since) {
      var answerBody = JSON.parse(answered.body);
      var usage = C8O.imageDescribe.usageOf(answerBody, model, answered.header("x-litellm-response-cost"), host.now() - since, answered.header("x-litellm-call-id"));
      usage.tool = "project-lint";
      usages.push(usage);
      var content = String((((answerBody.choices || [])[0] || {}).message || {}).content || "");
      try {
        var parsed = JSON.parse(content.substring(content.indexOf("{"), content.lastIndexOf("}") + 1));
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch (_badAnswer) {
        return null;
      }
    }
  };

  // The requestable a CallSequence action calls, "Project.sequence", from its bean properties: {requestable: "plain:P.s"}
  // in the YAML, {requestable: {mode, value}} in memory. "" for any other action.
  C8O.lint.callTargetOf = function (bean) {
    var name = String((bean && (bean.ionBean || bean.name)) || "");
    if (!/^CallSequence(Action)?$/.test(name)) {
      return "";
    }
    var props = bean.properties && typeof bean.properties === "object" ? bean.properties : bean;
    var target = props.requestable;
    var value = target && typeof target === "object" ? (String(target.mode).toLowerCase() === "plain" ? target.value : "")
      : (typeof target === "string" ? target.replace(/^plain:/, "") : "");
    return /^[A-Za-z_][\w-]*\.[A-Za-z_]\w*$/.test(String(value || "")) ? String(value) : "";
  };

  // Whether a CallSequence action sets noAutoLogin: {noAutoLogin: "plain:true"} in the YAML, {noAutoLogin: {mode, value}}
  // in memory.
  // The code of a CallSequenceAction's own actions (StoreData, IfOk, IfKo...): the scripts that read its answer as out.
  C8O.lint.callCode = function (dbo) {
    var texts = [];
    var kids = [];
    try {
      kids = C8O.dbo.getDirectChildren(dbo) || [];
    } catch (_noKids) {
      kids = [];
    }
    for (var i = 0; i < kids.length; i++) {
      try {
        var data = typeof kids[i].getBeanData === "function" ? String(kids[i].getBeanData()) : "";
        if (data.length) {
          texts.push(data);
        }
      } catch (_noBeanData) {}
    }
    return texts.join("\n");
  };

  C8O.lint.noAutoLoginOf = function (bean) {
    var props = bean && bean.properties && typeof bean.properties === "object" ? bean.properties : (bean || {});
    var v = props.noAutoLogin;
    var value = v && typeof v === "object" ? v.value : (typeof v === "string" ? v.replace(/^plain:/, "") : v);
    return value === true || String(value) === "true";
  };

  // The requestables of the security audit model that open the user's session (SetAuthenticatedUser, LDAP authentication,
  // context.setAuthenticatedUser) and those that end it (RemoveAuthenticatedUser, RemoveSession, the same calls in
  // JavaScript), with the requestables that call them: {opens: {qname: true}, ends: {qname: true}}.
  C8O.lint.sessionSequences = function (model) {
    var opens = {};
    var ends = {};
    ((model && model.steps) || []).forEach(function (s) {
      var signals = s.signals || {};
      if (s.enabled === false) {
        return;
      }
      if (s.kind === "setAuthenticatedUser" || s.kind === "ldapAuth" || signals.setsUser === true) {
        opens[s.owner] = true;
      }
      if (s.kind === "removeUser" || s.kind === "endSession" || signals.removesUser === true || signals.endsSession === true) {
        ends[s.owner] = true;
      }
    });
    var requestables = (model && model.requestables) || [];
    for (var changed = true; changed;) {
      changed = false;
      requestables.forEach(function (r) {
        (r.calls || []).forEach(function (target) {
          if (opens[target] && !opens[r.qname]) {
            opens[r.qname] = changed = true;
          }
          if (ends[target] && !ends[r.qname]) {
            ends[r.qname] = changed = true;
          }
        });
      });
    }
    return { opens: opens, ends: ends };
  };

  // Sign out (PCA eval 31/10: no generated app had one until a reviewer asked). calls are the app's CallSequence actions,
  // [{dbo, target, noAutoLogin}]. A sequence that opens the session is a login even when it ends a previous one first. The
  // fix names a logout sequence of the app's project when it has one: ngx-page-create calls sequences of that project.
  C8O.lint.sessionFindings = function (roles, calls, projectName) {
    var out = [];
    var logins = calls.filter(function (c) { return roles.opens[c.target] === true; });
    var logouts = calls.filter(function (c) { return roles.ends[c.target] === true && roles.opens[c.target] !== true; });
    if (logins.length && !logouts.length) {
      var known = Object.keys(roles.ends).filter(function (q) {
        var parts = q.split(".");
        return roles.opens[q] !== true && parts.length === 2 && parts[0] === String(projectName);
      });
      out.push({ rule: "NGX-NO-LOGOUT", dbo: null, message: "The app signs users in (" + logins[0].target + ") but nothing in it calls a " +
        "sequence that ends the session: a signed-in user cannot sign out, and the next person on the same browser stays signed in.",
        fix: "Add a logout page to the menu: ngx-page-create kind logout, sequence " + (known.length ? known[0].split(".").pop() + " (it ends the session)"
          : "a logout business sequence (business-sequence-create with session:{logout:true})") + ", logout.page the login page." });
    }
    logouts.forEach(function (c) {
      if (!c.noAutoLogin) {
        out.push({ rule: "NGX-LOGOUT-AUTOLOGIN", dbo: c.dbo, message: "The action calls " + c.target + ", which ends the session, without noAutoLogin: " +
          "the SDK replays the last login as soon as the session ends, so the user is signed in again without knowing it.",
          fix: "Set noAutoLogin to true on this CallSequenceAction (ngx-page-create kind logout does)." });
      }
    });
    return out;
  };

  // Form controls whose label, placeholder or helper text is plain text in an app that translates its texts (UIText i18n,
  // i18n files): one finding per control.
  C8O.lint.controlLabelFindings = function (i18nTextCount, i18nFiles, labels) {
    var out = [];
    if (!i18nTextCount || !(i18nFiles || []).length) {
      return out;
    }
    var seen = [];
    (labels || []).forEach(function (l) {
      if (seen.indexOf(l.dbo) >= 0) {
        return;
      }
      seen.push(l.dbo);
      var key = String(l.text).replace(/\s+/g, "_");
      out.push({ rule: "NGX-I18N-LABEL", dbo: l.dbo, message: "The " + l.property + " \"" + String(l.text).substring(0, 60) + "\" of this control is plain text while the " +
        "app translates its texts (i18n): an attribute is not translated, so it stays \"" + String(l.text).substring(0, 60) + "\" in every language.",
        fix: "Set " + l.property + " to the script '" + key.replace(/'/g, "\\'") + "' | translate (mode SCRIPT) and add the key " + key + " to each of " +
          (i18nFiles || []).map(function (f) { return f + ".json"; }).join(", ") + " (DisplayObjects/mobile/assets/i18n), as for the texts." });
    });
    return out;
  };

  // What a page reads of a call's answer against what the called sequence answers (js/sequence_response.js). calls are
  // [{dbo, target, texts}], texts the code of the call's own actions (StoreData, IfOk...); sequenceOf(target) gives the
  // sequence. A list page that tested out?.success on an upsert-crud facade, which answers {rows}, kept no data and showed
  // "Error" over an answer with rows (PipelineCrm, 12/11): the agent proved each sequence and never saw the page.
  C8O.lint.responseFindings = function (calls, sequenceOf, SR) {
    var out = [];
    if (!SR || typeof SR.of !== "function") {
      return out;
    }
    var ENVELOPE = ["success", "data", "errors", "meta"];
    calls.forEach(function (c) {
      var text = String(c.texts || "");
      if (!text.length || SR.readsEitherShape(text)) {
        return;
      }
      var seq = null;
      try {
        seq = sequenceOf(c.target);
      } catch (_noSequence) {
        seq = null;
      }
      var resp = seq ? SR.of(seq) : null;
      if (!resp || resp.shape === "unknown") {
        return;
      }
      var reads = SR.readKeys(text);
      // Code that reads both out.error and an envelope key handles either answer (a login page written for both).
      if (reads.indexOf("error") >= 0 && reads.some(function (k) { return ENVELOPE.indexOf(k) >= 0; })) {
        return;
      }
      var absent = reads.filter(function (k) { return k !== "error" && resp.keys.indexOf(k) < 0; });
      if (!absent.length) {
        return;
      }
      var envelopeRead = absent.filter(function (k) { return ENVELOPE.indexOf(k) >= 0; });
      if (resp.shape === "plain" && envelopeRead.length) {
        out.push({ rule: "NGX-RESPONSE-CONTRACT", severity: "error", dbo: c.dbo, message: "The action reads out." + envelopeRead.join(", out.") + " of " + c.target +
          ", which answers " + SR.describe(resp) + ", its data itself, without the {success, data, errors} envelope of a business sequence: the test " +
          "never passes, so the page keeps no data and shows its error (\"Error\") although the call answered.",
          fix: "Read the answer itself: data = out != null && out?.error == null ? out : null, error = out?.error?.message, success = out?.error == null " +
            "(the paths then start with " + resp.keys.filter(function (k) { return k !== "error"; }).join(" or ") + "). Or delete the page and create it " +
            "again with ngx-page-create, which writes the tests for what the sequence answers." });
        return;
      }
      out.push({ rule: "NGX-RESPONSE-CONTRACT", severity: "warning", dbo: c.dbo, message: "The action reads out." + absent.join(", out.") + " of " + c.target +
        ", which answers " + SR.describe(resp) + ": " + (absent.length > 1 ? "these keys are" : "this key is") + " never in its answer" +
        (resp.shape === "envelope" ? " (a business sequence's data is in out.data)" : "") + ".",
        fix: resp.shape === "envelope" ? "Read out?.data?." + absent[0] + " (the paths of a page are read in the data of a business sequence)."
          : "Read one of its keys: " + resp.keys.join(", ") + "." });
    });
    return out;
  };

  // The primary colors a framework or the NGX starter ships: an app whose styles declare no other one was never given a
  // visual identity (31/10: every agent-built app showed the starter's blue).
  var DEFAULT_PRIMARIES = ["#2563eb", "#60a5fa", "#3b82f6", "#0054e9", "#3880ff", "#4d8dff", "#428cff"];

  // The finding message for the app-level styles [{name, css}], or "" when one of them gives the app its own primary color.
  C8O.lint.defaultTheme = function (styles) {
    var declared = [];
    (styles || []).forEach(function (style) {
      String(style.css || "").replace(/--ion-color-primary\s*:\s*(#[0-9a-fA-F]{3,8})\b/g, function (_m, color) {
        declared.push(color.toLowerCase());
        return _m;
      });
    });
    var own = declared.filter(function (c) { return DEFAULT_PRIMARIES.indexOf(c) < 0; });
    if (own.length) {
      return "";
    }
    return "The app keeps the starter's default theme" + (declared.length ? " (primary " + declared[0] + ")" : "") + ": no app style gives it its own " +
      "colors, and it follows the browser's light or dark mode, so it looks like every other generated app.";
  };

  // Adds a finding to a list capped at max. A full list still takes an error, in place of its last finding that is not one:
  // on a large app thousands of warnings filled the list before the errors were found (C8Oforms: 2707 i18n warnings hid
  // its 4 SEC-ANONYMOUS-WRITE errors, counted but not listed).
  C8O.lint.keepFinding = function (findings, finding, max) {
    if (findings.length < max) {
      findings.push(finding);
      return;
    }
    if (finding.severity !== "error") {
      return;
    }
    for (var i = findings.length - 1; i >= 0; i--) {
      if (findings[i].severity !== "error") {
        findings.splice(i, 1);
        findings.push(finding);
        return;
      }
    }
  };

  // A "public-write: <reason>" line in a requestable's comment: the reason, "" for a line without one, null without the line.
  C8O.lint.publicWriteReason = function (comment) {
    var match = /^[ \t]*public-write[ \t]*:(.*)$/im.exec(String(comment || ""));
    return match ? match[1].trim() : null;
  };

  // The requestables anyone can call that write data, as the security audit sees them (the exposure findings it refuses to
  // let an agent suppress): [{qname, message, severity, reason}]. Agents shipped such a job without ever running the audit
  // (PCA eval m1 and m2: the anonymous reminder job wrote notifications), while every one of them runs project-lint.
  // A public form or a webhook receiver writes for anyone by design: a "public-write: <reason>" line in its comment
  // (commentOf(qname)) turns the error into a warning that is still reported, with the reason; a line without a reason
  // changes nothing.
  C8O.lint.anonymousWrites = function (audit, projectName, commentOf, collected) {
    if (!audit || typeof audit.collect !== "function" || typeof audit.evaluate !== "function" || typeof audit.suppressionGuard !== "function") {
      return [];
    }
    var model = collected || audit.collect(projectName, { includeEngine: false, includeFrontend: false });
    var guard = audit.suppressionGuard(model);
    var out = [];
    var seen = {};
    (audit.evaluate(model).findings || []).forEach(function (finding) {
      var message = seen[finding.qname] ? "" : String(guard(finding) || "");
      if (!message.length) {
        return;
      }
      seen[finding.qname] = true;
      var qname = String(finding.qname);
      var reason = typeof commentOf === "function" ? C8O.lint.publicWriteReason(commentOf(qname)) : null;
      if (reason === null) {
        out.push({ qname: qname, message: message, severity: "error", reason: null });
      } else if (!reason.length) {
        out.push({ qname: qname, message: message + " Its public-write line gives no reason, so it stays an error.", severity: "error", reason: "" });
      } else {
        out.push({ qname: qname, message: message.replace(/: this risk cannot be accepted\.[\s\S]*$/, ".") +
          " Declared public write: \"" + reason + "\".", severity: "warning", reason: reason });
      }
    });
    return out;
  };

  // The comment of a requestable of the project from the audit's QName: "P.sequence" or "P.connector.transaction".
  function requestableComment(project, qname) {
    var parts = String(qname).split(".");
    try {
      var dbo = parts.length === 2 ? project.getSequenceByName(parts[1])
        : (parts.length === 3 ? project.getConnectorByName(parts[1]).getTransactionByName(parts[2]) : null);
      return dbo ? str(call(dbo, "getComment")) : "";
    } catch (_noRequestable) {
      return "";
    }
  }

  // LIB-* rules: work an agent did by hand that a marketplace library already does (agents hand-built CSV exports, admin
  // grids, chart wrappers and logins, 31/10). Each library: what it gives, and what to use once the app references it.
  C8O.lint.LIBRARIES = {
    lib_csv_response: { gives: "a sequence (generate_csv) that answers plain text CSV from the rows of a sequence", use: "call its generate_csv sequence" },
    lib_download_file: { gives: "a file download controlled by a sequence", use: "call its sequence" },
    lib_ExtendedComponents_ui_ngx: { gives: "the agGrid shared component: sorting, filtering, paging, CSV and XLSX export",
      use: "use its agGrid shared component (ngx-page-create kind list with list.grid:true)" },
    libApexCharts: { gives: "ApexCharts chart shared components (bar, line, area, pie, donut, radar)", use: "use its chart shared components" },
    lib_fill_odt_pdf: { gives: "Word, Excel, PowerPoint or OpenDocument templates filled and converted to PDF", use: "call its sequences" },
    lib_MicrosoftExcel_ui_ngx: { gives: "Excel file import and export in an NGX app", use: "use its shared components and actions" },
    lib_Leaflet: { gives: "Leaflet interactive maps", use: "use its map shared component" },
    lib_FullCalendar: { gives: "the FullCalendar shared component (month, week, day and list views)", use: "use its calendar shared component" },
    lib_UserManager: { gives: "accounts with password and OpenID/OAuth sign-on, sessions and roles", use: "call its sequences (SignIn, CreateAccount, ForgotPassword...)" },
    lib_UserManager_ui_ngx: { gives: "login, sign-up and password reset screens over lib_UserManager", use: "use its screens" },
    lib_OAuth: { gives: "sign-in through an external identity provider (OAuth / OpenID Connect)", use: "call its sequences" }
  };
  C8O.lint.CSV_LIBRARIES = ["lib_csv_response", "lib_download_file"];
  C8O.lint.AUTH_LIBRARIES = ["lib_UserManager", "lib_UserManager_ui_ngx", "lib_OAuth"];

  // The fix of a LIB-* finding: use the first of names the app already references (referenced: lower-cased project names),
  // else import the first one and read what it offers.
  C8O.lint.libraryFix = function (app, names, referenced) {
    var refs = referenced || {};
    for (var i = 0; i < names.length; i++) {
      if (refs[names[i].toLowerCase()] === true) {
        return "The app references " + names[i] + ": " + C8O.lint.LIBRARIES[names[i]].use + " instead; marketplace-describe({project:\"" +
          names[i] + "\"}) gives their QNames.";
      }
    }
    return "Import " + names[0] + ": marketplace-import({project:\"" + names[0] + "\", targetProject:\"" + app + "\"}), then marketplace-describe({project:\"" +
      names[0] + "\"}) for its sequences and shared components" + (names.length > 1 ? "; " + names.slice(1).join(" or ") + " the same way." : ".");
  };

  // LIB-HANDMADE-CSV: code about CSV (the word, text/csv, .csv) that joins cells or rows itself: .join(";"), .join(","),
  // .join("\t"), .join("\n"), .join(separator), "\r\n", + ";" +, + "\n", `${a};${b}`. The join found, "" otherwise;
  // reading a CSV (split) or calling a library sequence joins nothing.
  var CSV_JOINS = [
    /\.join\s*\(\s*(["'`])(?:;|,|\||\t|\\t|\\r\\n|\\n)\1\s*\)/,
    /\.join\s*\(\s*(?:sep|separator|delimiter|delim)\w*\s*\)/i,
    /(["'`])\\r\\n\1/,
    /\+\s*(["'`])[;,]\1\s*\+/,
    /\+\s*(["'`])(?:\\r)?\\n\1/,
    /\$\{[^}]*\}[;,]\$\{/
  ];
  C8O.lint.handmadeCsv = function (code) {
    var text = String(code || "");
    if (!/csv/i.test(text)) {
      return "";
    }
    for (var i = 0; i < CSV_JOINS.length; i++) {
      var match = CSV_JOINS[i].exec(text);
      if (match) {
        return match[0];
      }
    }
    return "";
  };

  // LIB-HANDMADE-AUTH in SQL: a password column, as a whole identifier of the statement once literals, comments and
  // {variables} are out: password, passwd, pwd, mot_de_passe, motdepasse, alone or with a hash, digest, salt or crypt part
  // (password_hash, hashed_password, pwd_salt). password_reset_sent_at or password_changed_at are other columns.
  var PASSWORD_COLUMN = /^(?:(?:hashed|encrypted|crypted)_?)?(?:password|passwd|pwd|mot_?de_?passe)(?:_?(?:hash|hashed|digest|salt|crypt|encrypted))?$/i;
  C8O.lint.passwordColumn = function (sql) {
    var text = String(sql || "").replace(/'(?:[^']|'')*'/g, " ").replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\{[^}]*\}/g, " ");
    var tokens = text.match(/[A-Za-z_][\w$]*/g) || [];
    for (var i = 0; i < tokens.length; i++) {
      if (PASSWORD_COLUMN.test(tokens[i])) {
        return tokens[i];
      }
    }
    return "";
  };

  // LIB-HANDMADE-AUTH in code: a hash call (MessageDigest, DigestUtils, sha256, bcrypt, pbkdf2, argon2, scrypt, createHash,
  // crypto.subtle) with a password word (passw, pwd, mot de passe) within 200 characters of it. The call found, or "".
  var HASH_CALL = /MessageDigest|DigestUtils|sha-?(?:1|256|384|512)|bcrypt|pbkdf2|argon2|scrypt|createHash\s*\(|crypto\.subtle/ig;
  var PASSWORD_WORD = /passw|pwd|mot_?de_?passe/i;
  C8O.lint.passwordHashing = function (code) {
    var text = String(code || "");
    if (!PASSWORD_WORD.test(text)) {
      return "";
    }
    HASH_CALL.lastIndex = 0;
    var match;
    while ((match = HASH_CALL.exec(text)) !== null) {
      if (PASSWORD_WORD.test(text.substring(Math.max(0, match.index - 200), match.index + match[0].length + 200))) {
        return match[0].replace(/\s*\($/, "");
      }
    }
    return "";
  };

  // LIB-NPM-DUPLICATE: npm packages a library already wraps. rows: package_dependencies, [[package, version], ...].
  // Returns [{package, library, also}].
  var NPM_LIBRARIES = {
    "ag-grid-community": "lib_ExtendedComponents_ui_ngx", "ag-grid-angular": "lib_ExtendedComponents_ui_ngx",
    "apexcharts": "libApexCharts", "ng-apexcharts": "libApexCharts", "chart.js": "libApexCharts", "ng2-charts": "libApexCharts",
    "echarts": "libApexCharts", "ngx-echarts": "libApexCharts", "@swimlane/ngx-charts": "libApexCharts",
    "papaparse": "lib_csv_response", "json2csv": "lib_csv_response", "csv-stringify": "lib_csv_response",
    "jspdf": "lib_fill_odt_pdf", "pdfmake": "lib_fill_odt_pdf", "docx": "lib_fill_odt_pdf",
    "xlsx": "lib_MicrosoftExcel_ui_ngx", "exceljs": "lib_MicrosoftExcel_ui_ngx",
    "leaflet": "lib_Leaflet"
  };
  C8O.lint.npmDuplicates = function (rows) {
    var out = [];
    (rows || []).forEach(function (row) {
      var name = String((Array.isArray(row) ? row[0] : row) || "").trim().toLowerCase();
      var library = Object.prototype.hasOwnProperty.call(NPM_LIBRARIES, name) ? NPM_LIBRARIES[name]
        : (/^@fullcalendar\//.test(name) ? "lib_FullCalendar" : "");
      if (library.length) {
        out.push({ package: name, library: library,
          also: library === "lib_csv_response" ? "the agGrid of lib_ExtendedComponents_ui_ngx also exports a list page's rows to CSV" : "" });
      }
    });
    return out;
  };

  // The root locals a ForEach source lists: the first name of a Local source path ({"filter":"Local","model":{"path":
  // "?.data?.items"}} lists data), each local.x of a script or computed source, or the bare member a script starts with.
  C8O.lint.listRoots = function (source) {
    var text = String(source || "").trim();
    var roots = [];
    var push = function (name) {
      if (name && !/^(local|c8oPage|this|router|scope|global)$/.test(name) && roots.indexOf(name) < 0) {
        roots.push(name);
      }
    };
    if (/^\{/.test(text)) {
      try {
        var json = JSON.parse(text);
        var path = json && json.filter === "Local" && json.model ? String(json.model.path || "") : "";
        var first = /^[?.\s]*(?:\[\s*['"])?([A-Za-z_$][\w$]*)/.exec(path);
        push(first && first[1]);
      } catch (_notJson) {}
      return roots;
    }
    text.replace(/\blocal\s*\??\.\s*([A-Za-z_$][\w$]*)/g, function (all, name) {
      push(name);
      return all;
    });
    if (!roots.length) {
      var lead = /^(?:this\s*\??\.\s*)?([A-Za-z_$][\w$]*)/.exec(text);
      push(lead && lead[1]);
    }
    return roots;
  };

  // A SetLocalAction (or any dynamic bean) property as text, from the YAML ("script:...") or the in-memory bean ({mode, value}).
  C8O.lint.beanText = function (bean, key) {
    var props = bean && bean.properties && typeof bean.properties === "object" ? bean.properties : (bean || {});
    var value = props[key];
    return value && typeof value === "object" ? String(value.value == null ? "" : value.value)
      : (typeof value === "string" ? value.replace(/^(plain|script|source):/, "") : "");
  };

  // LIB-HANDMADE-GRID: a page (or shared component) that lists rows with a ForEach and sorts, filters or pages them itself.
  // view: {lists: root locals of its ForEach sources, agGrid: it uses the agGrid, codes: [{where, text, sets}]} from its
  // scriptContent, custom actions, SetLocalAction values (sets: the local set) and ForEach sources. Code counts when it sets
  // or reads a listed local (local.items, this.items, get items()). A filter counts with a search in it (toLowerCase,
  // includes, indexOf...) or a local named filter, search, query, term: removing a deleted row (items.filter(i => i.id !==
  // id)) is no grid. Paging is .slice( with page words, or the slice pipe. Server filters (locals passed to a
  // CallSequenceAction, as ngx-page-create builds them) are no code here. Returns {ops, where} or null.
  var GRID_SORT = /\.sort\s*\(|\blocaleCompare\s*\(/;
  var GRID_FILTER = /\.filter\s*\(/;
  var GRID_SEARCH = /\.(?:toLowerCase|toLocaleLowerCase|toUpperCase|includes|indexOf|startsWith|endsWith|match)\s*\(|\.\s*\w*(?:filter|search|query|term|keyword|criteri)\w*\b(?!\s*\()/i;
  var GRID_PAGE_WORDS = /\b(?:pageIndex|pageNumber|pageSize|pageCount|perPage|currentPage|rowsPerPage|itemsPerPage|pageStart)\b|\.\s*page\b(?!\s*\??\.)/;
  C8O.lint.handmadeGrid = function (view) {
    if (!view || view.agGrid === true || !view.lists || !view.lists.length) {
      return null;
    }
    var reads = new RegExp("(?:\\blocal\\s*\\??\\.\\s*|\\bthis\\s*\\??\\.\\s*|\\bget\\s+)(?:" +
      view.lists.map(function (n) { return String(n).replace(/\$/g, "\\$"); }).join("|") + ")\\b");
    var ops = { sorts: false, filters: false, pages: false };
    var where = [];
    (view.codes || []).forEach(function (code) {
      var text = String(code.text || "");
      if (view.lists.indexOf(code.sets) < 0 && !reads.test(text)) {
        return;
      }
      var sorts = GRID_SORT.test(text);
      var filters = GRID_FILTER.test(text) && GRID_SEARCH.test(text);
      var pages = (/\.slice\s*\(/.test(text) && GRID_PAGE_WORDS.test(text)) || /\|\s*slice\s*:/.test(text);
      if (sorts || filters || pages) {
        ops.sorts = ops.sorts || sorts;
        ops.filters = ops.filters || filters;
        ops.pages = ops.pages || pages;
        if (where.indexOf(code.where) < 0) {
          where.push(code.where);
        }
      }
    });
    var done = ["sorts", "filters", "pages"].filter(function (op) { return ops[op]; });
    return done.length ? { ops: done, where: where } : null;
  };

  // The project's own scripts, js/**/*.js: [{path, text}]. A minified or large file is a vendored library, not app code.
  C8O.lint.readProjectJs = function (project) {
    var out = [];
    try {
      (function walk(dir, prefix, depth) {
        var list = dir.isDirectory() ? dir.listFiles() : null;
        for (var i = 0; list && i < list.length && out.length < 200; i++) {
          var name = String(list[i].getName());
          if (list[i].isDirectory()) {
            if (depth < 3 && name !== "node_modules") {
              walk(list[i], prefix + name + "/", depth + 1);
            }
          } else if (/\.js$/.test(name) && !/\.min\.js$/.test(name) && Number(list[i].length()) <= 262144) {
            out.push({ path: prefix + name, text: String(new java.lang.String(java.nio.file.Files.readAllBytes(list[i].toPath()), "UTF-8")) });
          }
        }
      })(new java.io.File(String(project.getDirPath()), "js"), "js/", 0);
    } catch (_ignoreJs) {}
    return out;
  };

  // The projects a project references, lower-cased: {lib_csv_response: true}. Only project references have a parser.
  function referencedProjects(project) {
    var out = {};
    try {
      var refs = project.getReferenceList();
      for (var i = 0; i < refs.size(); i++) {
        var parser = call(refs.get(i), "getParser");
        var name = parser ? str(call(parser, "getProjectName")).trim() : "";
        if (name.length) {
          out[name.toLowerCase()] = true;
        }
      }
    } catch (_noReferences) {}
    return out;
  }

  // The sources of a project as texts: c8oProject.yaml without its reference declarations, the YAML files of _c8oProject
  // and the scripts of js/. A library the project uses is named in them (a sequence or transaction it calls, a shared
  // component or action it binds, a script it includes); its reference declaration alone is not a use.
  C8O.lint.stripReferenceDeclarations = function (yaml) {
    var out = [];
    var skipIndent = -1;
    String(yaml || "").split("\n").forEach(function (line) {
      var indent = line.length - line.replace(/^\s+/, "").length;
      if (skipIndent >= 0) {
        if (line.trim().length && indent <= skipIndent) {
          skipIndent = -1;
        } else {
          return;
        }
      }
      if (/\[references\.\w+/.test(line)) {
        skipIndent = indent;
        return;
      }
      out.push(line);
    });
    return out.join("\n");
  };

  C8O.lint.readProjectSources = function (project) {
    var texts = [];
    var read = function (file) {
      return String(new java.lang.String(java.nio.file.Files.readAllBytes(file.toPath()), "UTF-8"));
    };
    try {
      var dirPath = String(project.getDirPath());
      var main = new java.io.File(dirPath, "c8oProject.yaml");
      if (main.isFile()) {
        texts.push(C8O.lint.stripReferenceDeclarations(read(main)));
      }
      (function walk(dir, depth) {
        var list = dir.isDirectory() ? dir.listFiles() : null;
        for (var i = 0; list && i < list.length && texts.length < 2000; i++) {
          if (list[i].isDirectory()) {
            if (depth < 6) {
              walk(list[i], depth + 1);
            }
          } else if (/\.yaml$/.test(String(list[i].getName())) && Number(list[i].length()) <= 4194304) {
            texts.push(read(list[i]));
          }
        }
      })(new java.io.File(dirPath, "_c8oProject"), 0);
    } catch (_ignoreSources) {}
    C8O.lint.readProjectJs(project).forEach(function (file) {
      texts.push(file.text);
    });
    return texts;
  };

  // The project references nothing in the project uses: refs [{dbo, name}], texts its sources, keep {name: why} the
  // references that stay (the NGX template of the app, a library another referenced library needs). The first PipelineCrm
  // (12/11) referenced lib_ExtendedComponents_ui_ngx and used none of it.
  C8O.lint.unusedReferences = function (refs, texts, keep) {
    var all = (texts || []).join("\n");
    return (refs || []).filter(function (ref) {
      var name = String(ref.name || "");
      if (!name.length || (keep && keep[name.toLowerCase()])) {
        return false;
      }
      var escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return !new RegExp("(^|[^A-Za-z0-9_])" + escaped + "([^A-Za-z0-9_]|$)").test(all);
    });
  };

  // References to projects that are not loaded: refs [{dbo, name}] -> [{ref, severity, placeholder, message}]. A name
  // like __PROJECT_NAME__ is a placeholder a template kept: no project ever has it.
  C8O.lint.brokenReferences = function (refs) {
    return (refs || []).map(function (ref) {
      var placeholder = /^__[A-Za-z0-9_]+__$/.test(String(ref.name)) || String(ref.name).indexOf("${") >= 0;
      return {
        ref: ref, severity: placeholder ? "error" : "warning", placeholder: placeholder,
        message: placeholder
          ? "The reference names " + ref.name + ", a placeholder a template kept, not a project: the Studio shows it as a broken project and " +
            "nothing can ever resolve it."
          : "The reference names " + ref.name + ", which is not loaded in the workspace: what the project uses from it cannot work, and the " +
            "Studio shows it as a broken project."
      };
    });
  };

  // The shared components of an app that no UIUseShared binds: comps [{dbo, name, qname}], uses the sharedcomponent
  // QNames of the project's UIUseShared. A library's components are for the apps that reference it: not reported there.
  C8O.lint.unusedSharedComponents = function (appName, comps, uses) {
    var used = {};
    (uses || []).forEach(function (q) {
      used[String(q)] = true;
    });
    return (comps || []).filter(function (c) {
      if (used[c.qname]) {
        return false;
      }
      var suffix = "." + c.name;
      return !Object.keys(used).some(function (q) {
        return q.indexOf(appName + ".") === 0 && q.length > suffix.length && q.substring(q.length - suffix.length) === suffix;
      });
    });
  };

  // A call whose answer no step reads, and a constant success answered after it. A public seed called lib_UserManager's
  // CreateAccount, ConfirmAccount and SetUserAttribute, read none of their answers, and answered seeded=ok: on a fresh
  // server the demo account did not exist (13/11).
  // flows: [{qname, steps, read}] where steps run in that order, each {qname, name, className, priority, target, output,
  // enabled, constant: the text a step answers whatever happens, or null, nodeName}, read: {priority: true} for each step
  // whose output another step or a step variable of the sequence sources. writesOf(target): [{qname, writes}] the call
  // writes, itself or through what it calls (the security audit's model), empty when it writes nothing. sessionOf(target):
  // "open" for a call that signs a user in (its refusal is an answer to read), "close" for a sign-out, which the caller
  // follows with its own end of session, "" otherwise.
  var SUCCESS_ANSWER = /^\s*(?:ok|okay|true|yes|1|success(?:ful)?|succeeded|done|completed?|saved|created|updated|deleted|removed|seeded|initiali[sz]ed|ready)\b/i;

  C8O.lint.uncheckedCalls = function (flows, writesOf, sessionOf) {
    var out = [];
    var describe = function (writes) {
      return writes.slice(0, 2).map(function (w) { return w.qname + " (" + w.writes.join(", ") + ")"; }).join(", ") +
        (writes.length > 2 ? " and " + (writes.length - 2) + " more" : "");
    };
    (flows || []).forEach(function (flow) {
      var read = flow.read || {};
      var unchecked = [];
      var answered = false;
      (flow.steps || []).forEach(function (step) {
        if (step.enabled === false) {
          return;
        }
        var isCall = step.className === "SequenceStep" || step.className === "TransactionStep";
        if (isCall && String(step.target || "").length) {
          if (step.output === true || read[step.priority] === true) {
            return;
          }
          var session = typeof sessionOf === "function" ? String(sessionOf(String(step.target)) || "") : "";
          if (session === "close") {
            return;
          }
          var writes = (typeof writesOf === "function" ? writesOf(String(step.target)) : []) || [];
          if (!writes.length && session !== "open") {
            return;
          }
          unchecked.push(step);
          if (step.className === "SequenceStep") {
            out.push({ rule: "SEQ-CALL-UNCHECKED", severity: "warning", qname: step.qname,
              message: "The step " + step.name + " calls " + step.target + (session === "open"
                ? ", which signs the user in, and no step reads its answer: when it refuses the credentials, the sequence goes on and " +
                  "answers as if the user were signed in."
                : ", which writes through " + describe(writes) + ", and no step reads its answer: when the call fails (an account that " +
                  "exists already, an invalid key, a mail relay down, a database error), the sequence goes on as if it had worked."),
              fix: "Read the answer: an IfExistThenElseStep on the call's ./document/error (a JsonSourceStep for a test in JavaScript) " +
                "whose then branch ends with an XMLErrorStep, then answer from what the call returned. marketplace-describe gives a " +
                "library's sequences and their answers." });
          }
          return;
        }
        if (!answered && unchecked.length && step.output === true && step.constant != null && SUCCESS_ANSWER.test(String(step.constant))) {
          answered = true;
          var names = unchecked.slice(0, 3).map(function (s) { return s.name; }).join(", ") + (unchecked.length > 3 ? "..." : "");
          out.push({ rule: "SEQ-CONSTANT-SUCCESS", severity: "error", qname: step.qname,
            message: "The step " + step.name + " answers " + (step.nodeName ? step.nodeName + "=" : "") + JSON.stringify(String(step.constant).trim()) +
              ", a constant, after writing calls whose answers no step reads (" + names + "): the sequence says it worked when they " +
              "failed, as a seed that answered ok and created nothing.",
            fix: "Check each call (an IfExistThenElseStep on its ./document/error, then an XMLErrorStep) and answer what was done, " +
              "from the calls' answers." });
        }
      });
    });
    return out;
  };

  // Names that a JavaScript step reads without a declaration because the engine or JavaScript gives them.
  var JS_GLOBALS = /^(?:context|log|java|javax|Packages|JSON|Math|String|Number|Object|Array|Date|RegExp|Boolean|Error|include|dom|parseInt|parseFloat|isNaN|undefined|null|true|false|this|arguments|com|org|net|C8O)$/;

  function stripJs(code) {
    return String(code || "").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ")
      .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, "\"\"");
  }

  // The JavaScript of a sequence reads a step by its name (Step.document, typeof Step): a step is not a JavaScript variable,
  // so the code reads undefined. A seed's "is the table empty" test always said yes and reseeded the data on every call,
  // and the key of its account confirmation was always empty (13/11). flow: {steps: [{qname, name, js}], declared:
  // {name: true} for the sequence variables and the variables of source steps}. Returns [{qname, name}], one per step and name.
  C8O.lint.stepNamesAsVariables = function (flow) {
    var steps = (flow && flow.steps) || [];
    var declared = {};
    Object.keys((flow && flow.declared) || {}).forEach(function (k) { declared[k] = true; });
    var codes = steps.map(function (s) { return stripJs(s.js); });
    codes.forEach(function (code) {
      code.replace(/\b(?:var|let|const|function)\s+([A-Za-z_$][\w$]*)/g, function (_m, name) { declared[name] = true; return _m; });
      code.replace(/(?:^|[^.\w$])([A-Za-z_$][\w$]*)\s*=(?!=)/g, function (_m, name) { declared[name] = true; return _m; });
      code.replace(/\(\s*([A-Za-z_$][\w$]*(?:\s*,\s*[A-Za-z_$][\w$]*)*)\s*\)\s*(?:=>|\{)/g, function (_m, list) {
        list.split(",").forEach(function (n) { declared[n.trim()] = true; });
        return _m;
      });
    });
    var names = {};
    steps.forEach(function (s) {
      var n = String(s.name || "");
      if (/^[A-Za-z_$][\w$]*$/.test(n) && n.length > 1 && !JS_GLOBALS.test(n) && declared[n] !== true) {
        names[n] = true;
      }
    });
    var out = [];
    steps.forEach(function (s, i) {
      if (!codes[i].length) {
        return;
      }
      Object.keys(names).forEach(function (n) {
        var reads = new RegExp("\\btypeof\\s+" + n + "\\b|(?:^|[^.\\w$])" + n + "\\s*(?:\\.|\\[)").test(codes[i]);
        if (reads) {
          out.push({ qname: s.qname, name: n });
        }
      });
    });
    return out;
  };

  C8O.lint.run = function (projectName, options) {
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    var project = Engine.theApp.databaseObjectsManager.getOriginalProjectByName(String(projectName || ""));
    if (!project) {
      throw new Error("Project not found: " + projectName + ". project-list gives the loaded projects.");
    }
    var findings = [];
    // Texts shown to the user, gathered for one review by a model of the gateway: text -> QNames.
    var shownTexts = {};
    var shownOrder = [];
    function collectText(text, dbo, mode) {
      var value = String(text || "").replace(/\{\{[\s\S]*?\}\}/g, "\u2026").trim();
      if (mode !== "PLAIN" || value.length < 2 || !/[A-Za-z\u00C0-\u024F]{2}/.test(value)) {
        return;
      }
      if (!shownTexts[value]) {
        shownTexts[value] = [];
        shownOrder.push(value);
      }
      if (shownTexts[value].length < 3) {
        shownTexts[value].push(qnameOf(dbo));
      }
    }
    var i18n = C8O.lint.readI18n(project);
    var counts = { byRule: {}, bySeverity: { error: 0, warning: 0, info: 0 } };
    var scanned = 0;
    // The steps of each sequence in the order they run, for the rules on calls (sequenceFlow).
    var sequenceFlows = [];
    // LIB-* rules: the libraries the app references already, and no rule sends a library to itself.
    var appName = String(project.getName());
    var referenced = referencedProjects(project);
    var isOneOf = function (names) {
      return names.some(function (n) { return n.toLowerCase() === appName.toLowerCase(); });
    };

    function add(rule, severity, dbo, message, fix) {
      counts.byRule[rule] = (counts.byRule[rule] || 0) + 1;
      counts.bySeverity[severity] = (counts.bySeverity[severity] || 0) + 1;
      C8O.lint.keepFinding(findings, { rule: rule, severity: severity, qname: typeof dbo === "string" ? dbo : qnameOf(dbo), message: message, fix: fix },
        MAX_FINDINGS);
    }

    var AUTH_LIBRARIES_TEXT = "lib_UserManager keeps accounts with password and OpenID/OAuth sign-on, lib_UserManager_ui_ngx gives " +
      "its login, sign-up and reset screens, lib_OAuth signs in through an external identity provider.";

    function lintSql(dbo) {
      var query = str(call(dbo, "getSqlQuery"));
      if (!query.length) {
        return;
      }
      var D = C8O.sqlDialect;
      var dialect = D.of(dbo);
      var literals = query.match(/'(?:[^']|'')*'/g) || [];
      for (var li = 0; li < literals.length; li++) {
        var inner = literals[li].substring(1, literals[li].length - 1);
        if (/\{[A-Za-z_]\w*\}/.test(inner) && !/^\{[A-Za-z_]\w*\}$/.test(inner)) {
          add("SQL-QUOTED-VARIABLE", "error", dbo, "A {variable} shares a string literal with other text (" + literals[li] + "): the call fails with parameter index out of range.",
            "Concatenate: " + D.likePrefix(dialect, "x") + ".");
          break;
        }
      }
      var openQuote = D.unbalancedQuote(query);
      if (openQuote !== null) {
        add("SQL-UNCLOSED-LITERAL", "error", dbo, "A string literal is never closed near \"" + openQuote + "\": the transaction fails with unexpected token.",
          "Double each apostrophe inside a text: 'd''année'.");
      }
      var dateMath = D.dateMath(dialect, query);
      if (dateMath) {
        add("SQL-DATE-UNIT", "error", dbo, "Bare number added to a date (" + dateMath.expression + "): " + dateMath.message + ".",
          "Write " + dateMath.fix + ".");
      }
      // A warning: the rules match the text, and a database may have the function as a user routine.
      D.foreignSyntax(dialect, query).forEach(function (found) {
        add("SQL-FOREIGN-DIALECT", "warning", dbo, found.expression + ": " + found.message + ".", "Write " + found.fix + ".");
      });
      var inMatch = /\bIN\s*\(\s*\{([A-Za-z_]\w*)\}\s*\)/i.exec(query);
      if (inMatch) {
        var variable = null;
        try {
          variable = dbo.getVariable(inMatch[1]);
        } catch (_ignoreVariable) {}
        if (variable != null && /MultiValued/.test(String(variable.getClass().getName()))) {
          add("SQL-IN-LIST", "error", dbo, "IN ({" + inMatch[1] + "}) with a multivalued variable: it is bound as one value, never as a list.",
            "Pass one comma-separated string and test " + D.inList(dialect, "col", "{" + inMatch[1] + "}") + ".");
        }
      }
      var alias = /\bAS\s+([a-z][A-Za-z0-9_]*)\b/.exec(query);
      var folding = D.aliasFolding(dialect);
      if (alias && folding && (folding !== "lower-cases" || /[A-Z]/.test(alias[1])) && /^\s*(SELECT|WITH)\b/i.test(query)) {
        var folded = folding === "lower-cases" ? alias[1].toLowerCase() : alias[1].toUpperCase();
        // The fix names the other side too: a generated sequence read ./row/TOTAL, and quoting "total" emptied its counter.
        add("SQL-ALIAS-CASE", "warning", dbo, "Unquoted alias " + alias[1] + ": " + (D.name(dialect) || "the database") + " " + folding +
          " it (" + folded + "), so row." + alias[1] + " is undefined.",
          "Quote the aliases: AS \"" + alias[1] + "\". A step that already reads ./row/" + folded + " then reads nothing: quote AS \"" +
          folded + "\" for it instead.");
      }
      var passwordColumn = C8O.lint.passwordColumn(query);
      if (passwordColumn.length && !isOneOf(C8O.lint.AUTH_LIBRARIES)) {
        add("LIB-HANDMADE-AUTH", "warning", dbo, "The SQL reads or writes the password column " + passwordColumn + ": the app stores or checks " +
          "passwords itself, so hashing, salts, reset and lockout are its own code. " + AUTH_LIBRARIES_TEXT,
          C8O.lint.libraryFix(appName, C8O.lint.AUTH_LIBRARIES, referenced) + " Accounts live in the library; business data stays where it is.");
      }
    }

    // Code of the project (a step, a custom action, a page script, js/*.js) that does what a library does: a CSV joined by
    // hand, a password hashed. One finding per object and rule.
    function lintLibraryCode(where, code) {
      if (!code.length) {
        return;
      }
      var join = C8O.lint.handmadeCsv(code);
      if (join.length && !isOneOf(C8O.lint.CSV_LIBRARIES)) {
        add("LIB-HANDMADE-CSV", "warning", where, "Code about CSV joins the cells or rows itself (" + join.substring(0, 40) + "): quoting, " +
          "separators inside values and line ends are its own to get right. lib_csv_response gives " + C8O.lint.LIBRARIES.lib_csv_response.gives +
          ", lib_download_file " + C8O.lint.LIBRARIES.lib_download_file.gives + "; the agGrid of lib_ExtendedComponents_ui_ngx exports a list " +
          "page's rows to CSV itself (ngx-page-create kind list with list.grid:{csv:true}).",
          C8O.lint.libraryFix(appName, C8O.lint.CSV_LIBRARIES, referenced));
      }
      var hash = C8O.lint.passwordHashing(code);
      if (hash.length && !isOneOf(C8O.lint.AUTH_LIBRARIES)) {
        add("LIB-HANDMADE-AUTH", "warning", where, "The code hashes a password (" + hash + " next to a password): the app stores or checks " +
          "passwords itself, so hashing, salts, reset and lockout are its own code. " + AUTH_LIBRARIES_TEXT,
          C8O.lint.libraryFix(appName, C8O.lint.AUTH_LIBRARIES, referenced) + " Accounts live in the library; business data stays where it is.");
      }
    }

    // JavaScript in the SmartType properties of a step (JsonToXmlStep jsonObject, JsonFieldStep value...).
    function stepSmartScripts(step) {
      var out = [];
      ["getJsonObject", "getValue", "getKey", "getHeaderValue"].forEach(function (getter) {
        var smart = call(step, getter);
        try {
          if (smart && typeof smart.getMode === "function" && String(smart.getMode()) === "JS") {
            out.push(str(smart.getExpression()));
          }
        } catch (_ignoreSmartType) {}
      });
      return out.join("\n");
    }

    function lintSequence(sequence) {
      var variableNames = {};
      var children = C8O.dbo.getDirectChildren(sequence);
      for (var vi = 0; vi < children.length; vi++) {
        if (/RequestableVariable$/.test(simpleClassName(children[vi]))) {
          variableNames[String(children[vi].getName())] = true;
        }
      }
      var expressions = [];
      var writes = [];
      var stack = children.slice();
      while (stack.length) {
        var step = stack.shift();
        var className = simpleClassName(step);
        var expression = str(call(step, "getExpression"));
        if (expression.length) {
          expressions.push(expression);
          var getMatch = /context\.get\(\s*["']([A-Za-z_]\w*)["']\s*\)/.exec(expression);
          if (getMatch && variableNames[getMatch[1]]) {
            add("SEQ-CONTEXT-GET", "error", step, "context.get(\"" + getMatch[1] + "\") reads a context attribute, not the sequence variable " + getMatch[1] + ": it returns nothing.",
              "Read the variable by its JavaScript name: " + getMatch[1] + ".");
          }
        }
        // A write checked in an IfStep condition (writeResult.document.error) was reported unchecked: only step
        // expressions were read (usage tests 30/10).
        var condition = str(call(step, "getCondition"));
        if (condition.length) {
          expressions.push(condition);
        }
        var smartScripts = stepSmartScripts(step);
        lintLibraryCode(step, smartScripts.length ? expression + "\n" + smartScripts : expression);
        if (className === "TransactionStep") {
          var target = str(call(step, "getSourceTransaction"));
          var targetName = target.substring(target.lastIndexOf(".") + 1);
          if (/^(w_|ins|upd|del)/i.test(targetName)) {
            writes.push(step);
          }
        }
        var nested = C8O.dbo.getDirectChildren(step);
        for (var ni = 0; ni < nested.length; ni++) {
          if (/Step$/.test(simpleClassName(nested[ni]))) {
            stack.push(nested[ni]);
          }
        }
      }
      if (writes.length && !/\.error\b|document\.error|\berror\b/.test(expressions.join("\n"))) {
        add("SEQ-WRITE-UNCHECKED", "warning", writes[0], "The sequence writes through " + writes.length + " TransactionStep(s) and never reads an error: a failing write does not stop the sequence, and the business sequence still answers success.",
          "Source the write step's ./document and test document.error before counting the write.");
      }
      var flow = sequenceFlow(sequence, variableNames);
      sequenceFlows.push(flow);
      C8O.lint.stepNamesAsVariables(flow).forEach(function (use) {
        add("SEQ-STEP-AS-VARIABLE", "error", use.qname, "The JavaScript reads " + use.name + ", the name of a step of the sequence: a step is not a " +
          "JavaScript variable, so it reads undefined (a test on it always takes the same branch, a value taken from it is empty).",
          "Put the step's output in a variable with a JsonSourceStep or SimpleSourceStep (variableName) sourcing its ./document, " +
          "or source it from the step that needs it (a step variable's source, an IfExistThenElseStep).");
      });
    }

    // The steps of a sequence in the order they run, with what the lint rules on calls need (C8O.lint.uncheckedCalls,
    // C8O.lint.stepNamesAsVariables).
    function sequenceFlow(sequence, variableNames) {
      var flow = { qname: qnameOf(sequence), steps: [], read: {}, declared: {} };
      Object.keys(variableNames).forEach(function (n) { flow.declared[n] = true; });
      var noteSource = function (definition) {
        try {
          if (definition != null && definition.size() > 0 && str(definition.get(0)).length) {
            flow.read[str(definition.get(0))] = true;
          }
        } catch (_noDefinition) {}
      };
      (function walk(parent) {
        var nodes = C8O.dbo.getDirectChildren(parent);
        for (var i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          var cls = simpleClassName(node);
          if (/Variable$/.test(cls)) {
            noteSource(call(node, "getSourceDefinition"));
            continue;
          }
          if (!/Step$/.test(cls)) {
            continue;
          }
          try {
            var sources = node.getSources();
            var it = sources ? sources.iterator() : null;
            while (it && it.hasNext()) {
              var source = it.next();
              if (str(source.getPriority()).length) {
                flow.read[str(source.getPriority())] = true;
              }
            }
          } catch (_noSources) {
            noteSource(call(node, "getSourceDefinition"));
          }
          ["getVariableName", "getFieldsVariableName", "getErrorVariableName"].forEach(function (getter) {
            var declared = str(call(node, getter));
            if (declared.length) {
              flow.declared[declared] = true;
            }
          });
          var constant = null;
          if (cls === "ElementStep") {
            var literal = /^\s*(?:(["'])((?:(?!\1)[^\\])*)\1|(true|false|-?\d+(?:\.\d+)?))\s*;?\s*$/.exec(str(call(node, "getExpression")));
            constant = literal ? (literal[2] !== undefined ? literal[2] : literal[3]) : null;
          } else if (cls === "XMLElementStep") {
            var definition = call(node, "getSourceDefinition");
            var sourced = false;
            try {
              sourced = definition != null && definition.size() > 0 && str(definition.get(0)).length > 0;
            } catch (_noSourceDefinition) {}
            constant = !sourced && str(call(node, "getNodeText")).length ? str(call(node, "getNodeText")) : null;
          }
          var js = [str(call(node, "getExpression")), str(call(node, "getCondition")), stepSmartScripts(node)].join("\n");
          var target = str(call(node, "getSourceSequence")) || str(call(node, "getSourceTransaction"));
          var priority = "";
          try {
            priority = String(node.priority);
          } catch (_noPriority) {}
          flow.steps.push({ qname: qnameOf(node), name: String(node.getName()), className: cls, priority: priority, target: target,
            output: call(node, "isOutput") === true, enabled: call(node, "isEnabled") !== false, constant: constant,
            nodeName: str(call(node, "getNodeName")), js: js });
          walk(node);
        }
      })(sequence);
      return flow;
    }

    // A source with its path beside model reads local alone: {{local}} in a text, NG02200 in a ForEach (PCA eval 30/10).
    function lintSourcePath(dbo, smart) {
      var text = "";
      try {
        text = smart && typeof smart.getMode === "function" && String(smart.getMode()) === "SOURCE" ? str(smart.getSmartValue()) : "";
      } catch (_ignoreSmart) {
        text = "";
      }
      if (!text.length && /^source:/.test(str(smart))) {
        text = str(smart).substring(7);
      }
      var source = null;
      try {
        source = text.length ? JSON.parse(text) : null;
      } catch (_notJson) {
        return;
      }
      var misplaced = C8O.dbo._misplacedSmartSourceKeys(source);
      if (misplaced.length) {
        add("NGX-SOURCE-PATH", "error", dbo, "The source has " + misplaced.join(", ") + " beside model, not in it: the template reads " +
          (source.filter === "Global" ? "the shared object" : "local") + " alone (a ForEach fails with NG02200, a text shows the object).",
          "Write it again with tree-apply, for example {mode: \"SOURCE\", local: \"" + String(source.path || "?.data?.items") + "\"}.");
      }
    }

    function lintNgx(dbo, className) {
      if (className === "UIText" || className === "UIAttribute" || className === "UIControlDirective") {
        lintSourcePath(dbo, call(dbo, className === "UIText" ? "getTextSmartType" : className === "UIAttribute" ? "getAttrSmartType" : "getSourceSmartType"));
      }
      if (className === "UIText") {
        var text = smartText(call(dbo, "getTextSmartType") || call(dbo, "getTextValue"));
        if (call(dbo, "isI18n") === true) {
          i18nTextCount++;
        }
        if (call(dbo, "isI18n") === true && text.length) {
          var i18nKey = text.replace(/\s+/g, "_");
          var missingIn = [];
          for (var lang in i18n.keys) {
            if (Object.prototype.hasOwnProperty.call(i18n.keys, lang) && i18n.keys[lang][text] !== true && i18n.keys[lang][i18nKey] !== true) {
              missingIn.push(lang);
            }
          }
          if (!i18n.files.length || missingIn.length) {
            add("NGX-I18N-KEY", "warning", dbo, "i18n is on, so \"" + text.substring(0, 60) + "\" is a translation key" +
              (i18n.files.length ? ", missing from " + missingIn.join(", ") + ".json" : " and the app has no i18n files") +
              ": the page shows the key, spaces turned into underscores.",
              "Set i18n to false, or add the key to DisplayObjects/mobile/assets/i18n/<lang>.json.");
          }
        }
        if (/\bc8oPage\./.test(text)) {
          add("NGX-C8OPAGE-TEMPLATE", "error", dbo, "c8oPage in a template text: the page has no c8oPage member and fails at run time.",
            "Write local?.x instead of c8oPage.local?.x.");
        }
        // Shown texts are reviewed together at the end (spelling, accents, language), for any language.
        if (!(call(dbo, "isI18n") === true)) {
          collectText(text, dbo, (function () {
            try {
              var smartObj = call(dbo, "getTextSmartType");
              return smartObj && typeof smartObj.getMode === "function" ? String(smartObj.getMode()) : "PLAIN";
            } catch (_ignoreSmart) { return "PLAIN"; }
          })());
        }
      } else if (className === "UIAttribute") {
        if (/\bc8oPage\./.test(smartText(call(dbo, "getAttrSmartType") || call(dbo, "getAttrValue")))) {
          add("NGX-C8OPAGE-TEMPLATE", "error", dbo, "c8oPage in an attribute value: the page has no c8oPage member and fails at run time.",
            "Write local?.x instead of c8oPage.local?.x.");
        }
      } else if (className === "UIControlDirective") {
        var directive = str(call(dbo, "getDirectiveExpression")) + " " + smartText(call(dbo, "getSourceSmartType"));
        if (/\bc8oPage\./.test(directive)) {
          add("NGX-C8OPAGE-TEMPLATE", "error", dbo, "c8oPage in a directive: the page has no c8oPage member and fails at run time.",
            "Write local?.x instead of c8oPage.local?.x.");
        }
      } else if (className === "UICustomAction") {
        var code = str(call(dbo, "getActionValue"));
        if (/\bscope\./.test(code)) {
          add("NGX-SCOPE-IN-CUSTOM", "error", dbo, "scope used in a custom action: its function gets (page, props, vars, event) only, so it does not compile.",
            "Add an action variable whose value is scope.<item> and read vars.<item>.");
        }
      } else if (className === "UIDynamicElement" || className === "UIDynamicAction") {
        var beanData = str(call(dbo, "getBeanData"));
        if (beanData.length) {
          try {
            var bean = JSON.parse(beanData.replace(/^'|'$/g, ""));
            // beanData is {ionBean, Prop: "plain:..."} in the YAML and {name, properties: {Prop: {mode, value}}} in memory,
            // where a property left unset holds false (or the text "not set"): a live lint read no Label of a form.
            var elementProps = bean.properties && typeof bean.properties === "object" ? bean.properties : bean;
            // A page that calls a Private sequence works in the Studio, which does not enforce Private, and is refused on
            // a server (PCA eval 30/10: the "run the reminder check" button of the admin dashboard called the Private job).
            var callTarget = className === "UIDynamicAction" ? C8O.lint.callTargetOf(bean) : "";
            if (callTarget.length) {
              ngxCalls.push({ dbo: dbo, target: callTarget, noAutoLogin: C8O.lint.noAutoLoginOf(bean), texts: C8O.lint.callCode(dbo) });
              try {
                var calledProject = Engine.theApp.databaseObjectsManager.getOriginalProjectByName(callTarget.split(".")[0]);
                var called = calledProject ? calledProject.getSequenceByName(callTarget.split(".")[1]) : null;
                if (called && String(called.getAccessibility()) === "Private") {
                  add("NGX-PRIVATE-CALL", "error", dbo, "The page calls " + callTarget + ", a Private sequence: the Studio runs it (it does not " +
                    "enforce Private), a server refuses the call from the app.",
                    "Make the called sequence Hidden with authenticatedContextRequired=true and a role check inside; a scheduled job can stay a " +
                    "Private sequence that the page's sequence and the scheduler both call.");
                }
              } catch (_ignoreCallTarget) {}
            }
            for (var bk in elementProps) {
              var bv = Object.prototype.hasOwnProperty.call(elementProps, bk) && TEXT_PROPERTIES.test(bk) ? elementProps[bk] : null;
              var plain = bv && typeof bv === "object" ? (String(bv.mode).toLowerCase() === "plain" ? bv.value : null)
                : (typeof bv === "string" && /^plain:/.test(bv) ? bv.substring(6) : null);
              if (typeof plain === "string" && plain.trim().toLowerCase() !== C8O.dbo._NGX_NOT_SET) {
                collectText(plain, dbo, "PLAIN");
              }
            }
            // The label of a form control is an attribute, not a text: i18n does not reach it, so an app that translates its
            // texts showed its input labels in English to a French user (PipelineCrm 12/11). Reported after the walk, when
            // the app translates texts.
            if (className === "UIDynamicElement" && CONTROL_BEANS.test(String(bean.ionBean || bean.name || ""))) {
              ["Label", "Placeholder", "HelperText"].forEach(function (pk) {
                var pv = elementProps[pk];
                var plainLabel = pv && typeof pv === "object" ? (String(pv.mode).toLowerCase() === "plain" ? pv.value : null)
                  : (typeof pv === "string" && /^plain:/.test(pv) ? pv.substring(6) : null);
                if (typeof plainLabel === "string" && /[A-Za-z\u00C0-\u024F]{2}/.test(plainLabel) && plainLabel.trim().toLowerCase() !== C8O.dbo._NGX_NOT_SET) {
                  plainControlLabels.push({ dbo: dbo, property: pk, text: plainLabel });
                }
              });
            }
            // An element's properties are written in the template (Disabled, Checked, Value...): a Disabled with
            // c8oPage.navParams failed the build (run 13b F-10). An action's properties run in the page class.
            if (className === "UIDynamicElement") {
              for (var ek in elementProps) {
                var ev = elementProps[ek];
                var script = ev && typeof ev === "object" ? (String(ev.mode).toLowerCase() === "script" ? ev.value : null)
                  : (typeof ev === "string" && /^script:/.test(ev) ? ev : null);
                if (Object.prototype.hasOwnProperty.call(elementProps, ek) && typeof script === "string" && /\bc8oPage\./.test(script)) {
                  add("NGX-C8OPAGE-TEMPLATE", "error", dbo, "c8oPage in the property " + ek + ", which the template renders: the page has no c8oPage member, " +
                    "so the build fails (TS2339).", "Write local?.x instead of c8oPage.local?.x; compute anything else (navParams...) into a local at page enter with a SetLocalAction.");
                  break;
                }
              }
            }
          } catch (_ignoreBean) {}
        }
      }
      if (className === "PageComponent") {
        collectText(str(call(dbo, "getTitle")), dbo, "PLAIN");
        if (/c8o\.callJson/.test(str(call(dbo, "getScriptContent")))) {
          add("NGX-CALLJSON", "error", dbo, "The page calls the backend from scriptContent with c8o.callJson.",
            "Use events with CallSequenceAction.");
        }
      }
      // Glued texts: two UIText siblings that meet with no space or punctuation between them
      // ("Active orders" then a bound "7"). A composed sentence ("Date : ", value, " (", ...) is fine.
      var kids = C8O.dbo.getDirectChildren(dbo);
      var previous = null;
      for (var ki = 0; ki < kids.length; ki++) {
        var kidClass = simpleClassName(kids[ki]);
        if (NON_RENDERING.test(kidClass)) {
          continue;
        }
        if (kidClass === "UIText") {
          var smart = call(kids[ki], "getTextSmartType") || call(kids[ki], "getTextValue");
          var mode = "";
          try {
            mode = smart && typeof smart.getMode === "function" ? String(smart.getMode()) : "";
          } catch (_ignoreMode) {}
          var current = { name: String(kids[ki].getName()), plain: mode.length ? mode === "PLAIN" : true, text: smartText(smart) };
          if (previous && C8O.lint.gluedBoundary(previous, current)) {
            add("NGX-GLUED-TEXT", "warning", dbo, "UIText " + previous.name + " and " + current.name + " meet with no space or separator: they render glued on one line.",
              "Put each piece in its own element (Label and Note, Heading3 and Paragraph, classed spans), or end the label with \": \".");
            break;
          }
          previous = current;
        } else {
          previous = null;
        }
      }
    }

    // What the LIB-* rules read of the NGX objects: the code of custom actions and page scripts (CSV, password hashing),
    // the npm packages of custom actions, and per view (page or shared component) its ForEach lists, whether it uses the
    // agGrid, and the code that may touch the list (LIB-HANDMADE-GRID, after the walk).
    function noteLibraryUse(dbo, className, view) {
      var name = String(dbo.getName());
      if (className === "PageComponent" || className === "UICustomAction" || className === "UICustomAsyncAction") {
        var code = str(call(dbo, className === "PageComponent" ? "getScriptContent" : "getActionValue"));
        lintLibraryCode(dbo, code);
        if (view && code.length) {
          view.codes.push({ where: className === "PageComponent" ? "scriptContent" : name, text: code, sets: "" });
        }
      }
      if (className === "UICustomAction" || className === "UICustomAsyncAction") {
        var rows = null;
        try {
          rows = C8O.dbo._normalizeXMLVector(call(dbo, "getPackageDependencies"));
        } catch (_ignoreDependencies) {}
        var byLibrary = {};
        C8O.lint.npmDuplicates(rows).forEach(function (d) {
          if (!isOneOf([d.library])) {
            (byLibrary[d.library] = byLibrary[d.library] || []).push(d);
          }
        });
        Object.keys(byLibrary).forEach(function (library) {
          var found = byLibrary[library];
          add("LIB-NPM-DUPLICATE", "warning", dbo, "package_dependencies adds " + found.map(function (d) { return d.package; }).join(", ") +
            ", which the library " + library + " already wraps: " + C8O.lint.LIBRARIES[library].gives + (found[0].also ? "; " + found[0].also : "") +
            ". The app then maintains its own wrapper, with a version of the package that can clash with the library's.",
            C8O.lint.libraryFix(appName, [library], referenced) + " Then take " + (found.length > 1 ? "these packages" : "the package") +
            " out of package_dependencies.");
        });
      }
      if (!view) {
        return;
      }
      if (className === "UIControlDirective" && /^(ForEach|CdkVirtualFor|NewFor)$/.test(str(call(dbo, "getDirectiveName")))) {
        var smart = call(dbo, "getSourceSmartType");
        var source = str(smart);
        var raw = "";
        try {
          raw = smart && typeof smart.getSmartValue === "function" ? str(smart.getSmartValue()) : "";
        } catch (_ignoreRaw) {}
        C8O.lint.listRoots(source).concat(C8O.lint.listRoots(raw)).forEach(function (root) {
          if (view.lists.indexOf(root) < 0) {
            view.lists.push(root);
          }
        });
        view.codes.push({ where: name, text: source + " " + str(call(dbo, "getDirectiveExpression")), sets: "" });
      } else if (className === "UIUseShared" && /\.agGrid$/.test(str(call(dbo, "getSharedComponentQName")))) {
        view.agGrid = true;
      } else if (className === "UIDynamicAction") {
        var beanData = str(call(dbo, "getBeanData"));
        if (beanData.indexOf("SetLocalAction") >= 0) {
          try {
            var bean = JSON.parse(beanData.replace(/^'|'$/g, ""));
            if (String(bean.ionBean || bean.name) === "SetLocalAction") {
              view.codes.push({ where: name, text: C8O.lint.beanText(bean, "Value"), sets: C8O.lint.beanText(bean, "Property").trim() });
            }
          } catch (_ignoreSetLocal) {}
        }
      }
    }

    // Objects a reader of the project needs explained, kept without a comment; and the starter's own page.
    var uncommented = { sequence: [], transaction: [], connector: [], page: [] };
    var pages = [];
    // The CallSequence actions of the app's pages and shared components: [{dbo, target, noAutoLogin}].
    var ngxCalls = [];
    // Texts the app translates (UIText i18n) and the plain labels of its form controls.
    var i18nTextCount = 0;
    var plainControlLabels = [];
    var appStyles = [];
    var appComponent = null;
    var views = [];
    var queue = [project];
    // The page or shared component each queued object sits in.
    var queueViews = [null];
    // The app's shared components and the shared components its UIUseShared bind.
    var sharedComponents = [];
    var sharedUses = [];
    while (queue.length) {
      var dbo = queue.shift();
      var view = queueViews.shift();
      scanned++;
      var className = simpleClassName(dbo);
      if (className === "UIUseShared") {
        var sharedUse = str(call(dbo, "getSharedComponentQName")).trim();
        if (sharedUse.length) {
          sharedUses.push(sharedUse);
        }
      } else if (className === "UISharedRegularComponent" || className === "UISharedComponent") {
        sharedComponents.push({ dbo: dbo, name: String(dbo.getName()), qname: str(call(dbo, "getQName")) || qnameOf(dbo) });
      }
      var docKind = className === "PageComponent" ? "page" : (/Connector$/.test(className) ? "connector" :
        (/Transaction$/.test(className) ? "transaction" : (/Sequence$/.test(className) && className !== "Sequence" ? "sequence" : "")));
      if (docKind.length) {
        if (!str(call(dbo, "getComment")).length) {
          uncommented[docKind].push(dbo);
        }
        if (docKind === "page") {
          pages.push(dbo);
        }
      }
      if (className === "SqlTransaction") {
        lintSql(dbo);
      } else if (/Sequence$/.test(className) && className !== "Sequence") {
        lintSequence(dbo);
      }
      if (className === "PageComponent" || className === "UISharedComponent") {
        view = { dbo: dbo, lists: [], agGrid: false, codes: [] };
        views.push(view);
      }
      if (/^(UI|PageComponent)/.test(className)) {
        lintNgx(dbo, className);
        noteLibraryUse(dbo, className, view);
      }
      if (className === "ApplicationComponent") {
        appComponent = dbo;
      }
      if ((className === "UIStyle" || className === "UITheme") && appComponent && qnameOf(dbo.getParent()) === qnameOf(appComponent)) {
        var styleCss = "";
        try {
          styleCss = String(dbo.getStyleContent().getString());
        } catch (_noCss) {}
        appStyles.push({ name: String(dbo.getName()), css: styleCss });
      }
      var next = C8O.dbo.getDirectChildren(dbo);
      for (var i = 0; i < next.length; i++) {
        queue.push(next[i]);
        queueViews.push(view);
      }
    }

    // A list sorted, filtered or paged by the page itself: one finding per page or shared component.
    if (!isOneOf(["lib_ExtendedComponents_ui_ngx"])) {
      views.forEach(function (v) {
        var grid = C8O.lint.handmadeGrid(v);
        if (grid) {
          var ops = grid.ops.length > 1 ? grid.ops.slice(0, -1).join(", ") + " and " + grid.ops[grid.ops.length - 1] : grid.ops[0];
          add("LIB-HANDMADE-GRID", "warning", v.dbo, "The " + (simpleClassName(v.dbo) === "PageComponent" ? "page" : "shared component") + " " + ops +
            " its list (ForEach over " + v.lists.join(", ") + ") itself, in " + grid.where.slice(0, 4).join(", ") + (grid.where.length > 4 ? "..." : "") +
            ": a hand-made data grid. The agGrid shared component of lib_ExtendedComponents_ui_ngx sorts, filters and pages, and exports to " +
            "CSV and XLSX; ngx-page-create kind list with list.grid:true generates it.",
            C8O.lint.libraryFix(appName, ["lib_ExtendedComponents_ui_ngx"], referenced));
        }
      });
    }
    // The project's own scripts (js/*.js): a CSV joined by hand, a password hashed.
    C8O.lint.readProjectJs(project).forEach(function (file) {
      lintLibraryCode(file.path, file.text);
    });

    Object.keys(uncommented).forEach(function (kind) {
      var missing = uncommented[kind];
      if (missing.length) {
        add("DOC-NO-COMMENT", "warning", missing[0], missing.length + " " + kind + (missing.length > 1 ? "s have" : " has") + " no comment: " +
          missing.slice(0, 12).map(function (d) { return String(d.getName()); }).join(", ") + (missing.length > 12 ? "..." : "") +
          ". The comment is what the Studio shows to whoever maintains the project.",
          "Give each one a one-line comment saying what it does (databaseobject-tree-apply, properties.comment).");
      }
    });
    // The starter's default page (Page, "Default home page") left beside the application's own pages.
    var starter = pages.filter(function (p) { return String(p.getName()) === "Page" && /^Default home page$/i.test(str(call(p, "getComment"))); })[0];
    var isRoot = function (p) {
      try {
        return p.isRoot === true || String(p.isRoot) === "true";
      } catch (_noRoot) {
        return false;
      }
    };
    if (starter && pages.length > 1) {
      add("NGX-STARTER-PAGE", "warning", starter, "The starter page Page (\"Default home page\") is still in the application" +
        (call(starter, "isInAutoMenu") === true ? " and in its menu" : "") + (isRoot(starter) ? ", and the app opens on it (isRoot)" : "") + ".",
        (isRoot(starter) ? "First make the entry page the root (databaseobject-tree-apply {properties:{isRoot:true}} on it), then delete " +
          "Page with databaseobject-delete" : "Delete it with databaseobject-delete") + ", or turn it into the application's real home page.");
    }
    // The app's own pages built on the starter's look: the default blue, light or dark as the browser says.
    if (appComponent && pages.some(function (p) { return p !== starter; })) {
      var themeMessage = C8O.lint.defaultTheme(appStyles);
      if (themeMessage.length) {
        add("NGX-DEFAULT-THEME", "warning", appComponent, themeMessage,
          "Choose the tokens before the pages: ngx-theme-apply with the user's brand color, or the preset that fits the app (institutional, modern, dense), " +
          "light for a business app. See Visual design in convertigo-frontend-ngx.");
      }
    }
    // Without a root page the app opens on no route: the viewer stayed on /home, "Cannot match any routes" (run 13a F-09).
    if (pages.length && !pages.some(isRoot)) {
      add("NGX-NO-ROOT-PAGE", "error", pages[0], "No page of the application is its root page (isRoot): the app opens on no route " +
        "(\"Cannot match any routes\").", "Set isRoot on the entry page: databaseobject-tree-apply {properties:{isRoot:true}} on it.");
    }
    // A page whose segment is ** is the route of an unknown URL. The engine writes the routes in the order of the pages and
    // the router takes the first one that matches: the pages after it never open.
    var fallbacks = pages.filter(function (p) { return str(call(p, "getSegment")) === "**"; });
    fallbacks.forEach(function (f) {
      var after = pages.slice(pages.indexOf(f) + 1).map(function (p) { return String(p.getName()); });
      if (after.length) {
        add("NGX-FALLBACK-ROUTE", "error", f, "The page " + String(f.getName()) + " has the segment **, the route of an unknown URL, but " +
          after.join(", ") + (after.length > 1 ? " come" : " comes") + " after it: the router takes the first route that matches, so " +
          (after.length > 1 ? "these pages never open" : "this page never opens") + " (its URL opens " + String(f.getName()) + ").",
          "Move " + String(f.getName()) + " after " + after[after.length - 1] + " with databaseobject-move (ngx-page-create keeps it the last page)." +
          (fallbacks.length > 1 ? " Keep one page with the segment ** only." : ""));
      }
    });

    // A shared component of the app that no page nor component uses: built for nothing, and a reader takes it for part of
    // the app. A library's components are for the apps that reference it.
    var referencedByOthers = false;
    try {
      var names = Engine.theApp.databaseObjectsManager.getAllProjectNamesList();
      for (var pn = 0; names && pn < names.size() && !referencedByOthers; pn++) {
        var other = String(names.get(pn));
        if (other !== appName) {
          var otherProject = Engine.theApp.databaseObjectsManager.getOriginalProjectByName(other);
          referencedByOthers = !!(otherProject && referencedProjects(otherProject)[appName.toLowerCase()]);
        }
      }
    } catch (_noProjectList) {}
    // A lib_ project is a library by its name, even when the project list cannot be read.
    if (appComponent && pages.length && !referencedByOthers && !/^lib_/i.test(appName)) {
      C8O.lint.unusedSharedComponents(appName, sharedComponents, sharedUses).forEach(function (c) {
        add("NGX-UNUSED-SHARED-COMPONENT", "warning", c.dbo, "The shared component " + c.name + " is used by no page nor component of the app " +
          "(no UIUseShared binds it): it is built for nothing, and whoever maintains the app takes it for a part of it.",
          "Delete it (databaseobject-delete " + c.qname + "), or bind it where it belongs with a UIUseShared. Pages are built with ngx-page-create.");
      });
    }

    // A project reference nothing uses: the engine loads the library for nothing, and a reader looks for what needs it.
    // The NGX template of the app and a library that another referenced library needs stay.
    try {
      var refList = project.getReferenceList();
      var refs = [];
      var keep = {};
      var tpl = appComponent ? str(call(appComponent, "getTplProjectName")).trim() : "";
      if (tpl.length) {
        keep[tpl.toLowerCase()] = true;
      }
      for (var ri = 0; ri < refList.size(); ri++) {
        var refParser = call(refList.get(ri), "getParser");
        var refName = refParser ? str(call(refParser, "getProjectName")).trim() : "";
        if (refName.length) {
          refs.push({ dbo: refList.get(ri), name: refName });
        }
      }
      var broken = [];
      refs.forEach(function (ref) {
        var lib = null;
        try {
          lib = Engine.theApp.databaseObjectsManager.getOriginalProjectByName(ref.name);
        } catch (_notLoaded) {
          lib = null;
        }
        if (!lib) {
          broken.push(ref);
        }
        Object.keys(lib ? referencedProjects(lib) : {}).forEach(function (n) {
          keep[n] = true;
        });
      });
      // A reference to no loaded project: a placeholder never replaced (__PROJECT_NAME__ in lib_ConvertigoMCP up to
      // 0.3.0-beta.22, shown as "! broken project !" in the Studio), or a library not imported.
      C8O.lint.brokenReferences(broken).forEach(function (f) {
        add("PROJECT-BROKEN-REFERENCE", f.severity, f.ref.dbo, f.message, "Delete the reference (databaseobject-delete " + qnameOf(f.ref.dbo) + ")" +
          (f.placeholder ? "." : ", or import " + f.ref.name + " (marketplace-import, or projects import by its URL) when the app uses it."));
      });
      var brokenNames = {};
      broken.forEach(function (b) {
        brokenNames[b.name.toLowerCase()] = true;
      });
      refs = refs.filter(function (r) { return !brokenNames[r.name.toLowerCase()]; });
      if (refs.length) {
        C8O.lint.unusedReferences(refs, C8O.lint.readProjectSources(project), keep).forEach(function (ref) {
          add("PROJECT-UNUSED-REFERENCE", "warning", ref.dbo, "The project references " + ref.name + " but nothing in it uses it: no sequence, " +
            "transaction, page, shared component, action or script names it. The engine loads the library for nothing.",
            "Delete the reference (databaseobject-delete " + qnameOf(ref.dbo) + "), unless this lot is about to use the library.");
        });
      }
    } catch (_noReferences) {}

    C8O.lint.controlLabelFindings(i18nTextCount, i18n.files, plainControlLabels).forEach(function (f) {
      add(f.rule, "warning", f.dbo, f.message, f.fix);
    });

    C8O.lint.responseFindings(ngxCalls, function (target) {
      var parts = String(target).split(".");
      var owner = Engine.theApp.databaseObjectsManager.getOriginalProjectByName(parts[0]);
      return owner && parts.length === 2 ? owner.getSequenceByName(parts[1]) : null;
    }, C8O.sequenceResponse).forEach(function (f) {
      add(f.rule, f.severity, f.dbo, f.message, f.fix);
    });

    var auditModel = null;
    try {
      auditModel = C8O.securityAudit.collect(String(project.getName()), { includeEngine: false, includeFrontend: false });
    } catch (_noAuditModel) {}
    if (auditModel) {
      C8O.lint.uncheckedCalls(sequenceFlows, function (target) {
        return C8O.securityAudit.writesReachedFrom(auditModel, target);
      }, function (target) {
        return C8O.securityAudit.sessionChange(auditModel, target);
      }).forEach(function (f) {
        add(f.rule, f.severity, f.qname, f.message, f.fix);
      });
    }
    if (appComponent && auditModel) {
      C8O.lint.sessionFindings(C8O.lint.sessionSequences(auditModel), ngxCalls, String(project.getName())).forEach(function (f) {
        add(f.rule, "warning", f.dbo || appComponent, f.message, f.fix);
      });
    }

    try {
      var commentOf = function (qname) { return requestableComment(project, qname); };
      C8O.lint.anonymousWrites(C8O.securityAudit, String(project.getName()), commentOf, auditModel).forEach(function (w) {
        add("SEC-ANONYMOUS-WRITE", w.severity, w.qname, w.message, w.severity === "warning"
          ? "Keep it only if anyone must be able to write here; the reviewer sees this warning on every lint."
          : "Private for a job only the scheduler or other sequences call; otherwise authenticatedContextRequired=true and a role check " +
            "inside. Only a write anyone must be able to make (a public form, a webhook receiver), never a job or an admin action, may " +
            "say so with a line \"public-write: <reason>\" in its comment: it then stays reported as a warning. project-security-audit " +
            "gives the full report.");
      });
    } catch (_ignoreAudit) {}

    var textReview = C8O.lint.reviewTexts(options || {}, shownOrder, shownTexts, i18n, add, project);
    textReview.texts = shownOrder.length;
    textReview.i18nFiles = i18n.files;

    return {
      project: String(project.getName()),
      textReview: textReview,
      scanned: scanned,
      counts: counts,
      truncated: findings.length >= MAX_FINDINGS,
      findings: findings
    };
  };
})();
