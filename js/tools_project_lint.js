// project-lint: one read-only pass over a project for the pitfalls seen in the supervised runs.
// Each rule names what breaks and the fix; tree-apply warns on most of them at write time, this
// tool finds them in objects already built. Result: {project, scanned, counts, findings}.
(function () {
  C8O.lint = C8O.lint || {};

  var MAX_FINDINGS = 300;
  // Ionic and action properties that hold text shown to the user.
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
  var REVIEW_PROMPT = "You proofread the user-facing strings of a software application. Each line is `id<TAB>text`. " +
    "Ellipses (…) mark values inserted at run time. Check every line, short labels included: one missing accent is a problem. Report only real problems: misspelled words, missing or wrong accents " +
    "or diacritics, typos, broken grammar, and strings written in another language than the one expected. Ignore product names, " +
    "codes, identifiers, units and abbreviations. Answer with JSON only: {\"language\":\"<detected or given language>\"," +
    "\"issues\":[{\"id\":<id>,\"fixed\":\"<the corrected string>\",\"kind\":\"accents|spelling|grammar|language\"}]}. " +
    "Return an empty issues array when everything is correct.";

  // One review per language: the app's own texts (the language is detected) and each i18n file in its language.
  C8O.lint.reviewTexts = function (options, order, owners, i18n, add, project) {
    if (options.checkTexts === false) {
      // The router also sets it to false for an agent that calls no gateway model (Claude): checkTexts:true then reads as
      // ignored (run 10 F-08). Say both.
      return { skipped: "No text review: checkTexts is false, or this agent calls no gateway model (Claude agents always get false). " +
        "Review the texts the user sees yourself (language, spelling, accents, tone, no placeholder)." };
    }
    // A long list makes the model skip strings: review at most REVIEW_BATCH strings per call.
    var groups = [];
    var pushGroups = function (label, language, items) {
      for (var from = 0; from < items.length && from < REVIEW_MAX; from += REVIEW_BATCH) {
        groups.push({ label: label, language: language, items: items.slice(from, from + REVIEW_BATCH) });
      }
    };
    pushGroups("app texts", "", order.map(function (text) { return { text: text, where: owners[text].join(", ") }; }));
    for (var lang in i18n.values) {
      if (Object.prototype.hasOwnProperty.call(i18n.values, lang)) {
        pushGroups(lang + ".json", lang, i18n.values[lang].map(function (entry) {
          return { text: entry.text, where: "DisplayObjects/mobile/assets/i18n/" + lang + ".json#" + entry.key };
        }));
      }
    }
    if (!groups.length) {
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
    var usages = [];
    var reviewed = 0;
    var problems = 0;
    for (var g = 0; g < groups.length; g++) {
      var items = groups[g].items;
      var lines = [];
      for (var it = 0; it < items.length; it++) {
        lines.push(it + "\t" + items[it].text.replace(/[\t\r\n]+/g, " ").substring(0, 300));
      }
      var request = {
        model: model,
        max_tokens: 4000,
        temperature: 0,
        reasoning_effort: "none",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: REVIEW_PROMPT },
          { role: "user", content: (groups[g].language ? "Expected language: " + groups[g].language + "\n" : "") + lines.join("\n") }
        ]
      };
      var started = host.now();
      var response;
      try {
        response = host.post(C8O.imageDescribe.GATEWAY_URL + "/chat/completions", key, JSON.stringify(request), 120000);
      } catch (postError) {
        return { skipped: "gateway call failed: " + C8O.imageDescribe.redact(String(postError), key), usages: usages };
      }
      if (response.status < 200 || response.status >= 300) {
        return { skipped: "gateway answered " + response.status, usages: usages };
      }
      var body = JSON.parse(response.body);
      var usage = C8O.imageDescribe.usageOf(body, model, response.header("x-litellm-response-cost"), host.now() - started, response.header("x-litellm-call-id"));
      usage.tool = "project-lint";
      usages.push(usage);
      var content = String((((body.choices || [])[0] || {}).message || {}).content || "");
      var jsonText = content.substring(content.indexOf("{"), content.lastIndexOf("}") + 1);
      var answer = {};
      try {
        answer = JSON.parse(jsonText);
      } catch (_badAnswer) {
        answer = { issues: [] };
      }
      reviewed += items.length;
      var issues = Array.isArray(answer.issues) ? answer.issues : [];
      for (var q = 0; q < issues.length; q++) {
        var item = items[Number(issues[q].id)];
        if (!item || !str(issues[q].fixed).length || str(issues[q].fixed) === item.text) {
          continue;
        }
        problems++;
        add("TEXT-REVIEW", "warning", item.where.split(", ")[0],
          "\"" + item.text.substring(0, 80) + "\" (" + str(issues[q].kind || "spelling") + ", " + groups[g].label +
          (answer.language ? ", " + answer.language : "") + ")" + (item.where.indexOf(",") > 0 ? "; also in " + item.where.substring(item.where.indexOf(",") + 2) : ""),
          "Write \"" + str(issues[q].fixed).substring(0, 120) + "\".");
      }
    }
    return { reviewed: reviewed, problems: problems, model: model, usages: usages };
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

    function add(rule, severity, dbo, message, fix) {
      counts.byRule[rule] = (counts.byRule[rule] || 0) + 1;
      counts.bySeverity[severity] = (counts.bySeverity[severity] || 0) + 1;
      if (findings.length < MAX_FINDINGS) {
        findings.push({ rule: rule, severity: severity, qname: typeof dbo === "string" ? dbo : qnameOf(dbo), message: message, fix: fix });
      }
    }

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
        add("SQL-ALIAS-CASE", "warning", dbo, "Unquoted alias " + alias[1] + ": " + (D.name(dialect) || "the database") + " " + folding +
          " it (" + (folding === "lower-cases" ? alias[1].toLowerCase() : alias[1].toUpperCase()) + "), so row." + alias[1] + " is undefined.",
          "Quote the aliases: AS \"" + alias[1] + "\".");
      }
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
    }

    function lintNgx(dbo, className) {
      if (className === "UIText") {
        var text = smartText(call(dbo, "getTextSmartType") || call(dbo, "getTextValue"));
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
        var directive = str(call(dbo, "getDirectiveExpression")) + " " + smartText(call(dbo, "getDirectiveSource"));
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
            for (var bk in elementProps) {
              var bv = Object.prototype.hasOwnProperty.call(elementProps, bk) && TEXT_PROPERTIES.test(bk) ? elementProps[bk] : null;
              var plain = bv && typeof bv === "object" ? (String(bv.mode).toLowerCase() === "plain" ? bv.value : null)
                : (typeof bv === "string" && /^plain:/.test(bv) ? bv.substring(6) : null);
              if (typeof plain === "string" && plain.trim().toLowerCase() !== C8O.dbo._NGX_NOT_SET) {
                collectText(plain, dbo, "PLAIN");
              }
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

    // Objects a reader of the project needs explained, kept without a comment; and the starter's own page.
    var uncommented = { sequence: [], transaction: [], connector: [], page: [] };
    var pages = [];
    var queue = [project];
    while (queue.length) {
      var dbo = queue.shift();
      scanned++;
      var className = simpleClassName(dbo);
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
      if (/^(UI|PageComponent)/.test(className)) {
        lintNgx(dbo, className);
      }
      var next = C8O.dbo.getDirectChildren(dbo);
      for (var i = 0; i < next.length; i++) {
        queue.push(next[i]);
      }
    }

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
    // Without a root page the app opens on no route: the viewer stayed on /home, "Cannot match any routes" (run 13a F-09).
    if (pages.length && !pages.some(isRoot)) {
      add("NGX-NO-ROOT-PAGE", "error", pages[0], "No page of the application is its root page (isRoot): the app opens on no route " +
        "(\"Cannot match any routes\").", "Set isRoot on the entry page: databaseobject-tree-apply {properties:{isRoot:true}} on it.");
    }

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
