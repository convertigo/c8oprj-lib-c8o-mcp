/*
 * project-brief: what an agent needs before it changes an existing project, in one call.
 *
 * Measured on SalesPipeline (16/11, A/B harness of the Electron Studio): adding one column to a list page took 15 min
 * with 8 s of editing and 6.2 min of exploring (52 reading calls: databaseobject-search to find the page, tree-get of
 * the whole page cut by the client, palette lookups, a search for where `app-cols-4` is defined); a KPI restyle spent
 * 8.4 min reading before its first edit, looking for where `.app-kpi` was defined. The brief answers those questions
 * from the loaded project, so it is never stale:
 * - the pages, with their route segment, the sequences they call, the pages they open and their main components;
 * - one page in detail (`page`): every object with its QName suffix, classes, texts, bindings, events and actions;
 * - the sequences with who can call them, the tables and their fields, the sign-in flow and the roles, the references;
 * - the style index: each CSS class the pages use, where it is defined (an app style such as AppLayout, the theme, a
 *   page style) and, for the classes asked or used by the detailed page, its rules; the pages without a style of their own;
 * - the project notes (_private/docs/PROGRESS.md, never served; docs/generated/PROGRESS.md before 0.3.0-beta.31),
 *   written by earlier turns, with their secrets masked.
 *
 * The pure helpers (CSS parsing, the style index, masking, value rendering) run without an engine and are tested by
 * tests/scripts/validate_project_brief.cjs; build() reads the engine objects.
 */
if (typeof C8O === "undefined") { var C8O = {}; }
C8O.projectBrief = C8O.projectBrief || {};

(function (api) {
  // The notes of a project and the documents its builds write live under _private/docs: the engine never serves
  // _private (403) and leaves it out of the CAR. docs/ is served as static files (anyone could read notes there on a
  // deployed server, 16/11): notes written there up to 0.3.0-beta.30 are read as a fallback and moved by the next
  // project-notes-write.
  api.DOCS_DIR = "_private/docs";
  api.NOTES_PATH = api.DOCS_DIR + "/PROGRESS.md";
  api.LEGACY_NOTES_PATH = "docs/generated/PROGRESS.md";
  // the folders whose text files a deployed server serves, where builds used to write their documents
  api.SERVED_DOCS_DIRS = ["docs", "docs/generated"];

  // Where the notes are read from: the private file, else the legacy served one. isFile(relativePath) -> boolean.
  api.notesSource = function (isFile) {
    if (isFile(api.NOTES_PATH)) {
      return { path: api.NOTES_PATH, legacy: false, present: true };
    }
    if (isFile(api.LEGACY_NOTES_PATH)) {
      return { path: api.LEGACY_NOTES_PATH, legacy: true, present: true };
    }
    return { path: api.NOTES_PATH, legacy: false, present: false };
  };
  var MAX_NOTES_CHARS = 4000;
  var MAX_OUTLINE_LINES = 400;
  var MAX_VALUE_CHARS = 120;
  var MAX_PAGES = 60;
  var MAX_SEQUENCES = 120;
  var MAX_TABLES = 40;
  var MAX_FIELDS = 40;
  var MAX_RULES_PER_CLASS = 8;
  var MAX_DETAILED_CLASSES = 40;

  function str(value) {
    return value == null ? "" : String(value);
  }

  function trim(value) {
    return str(value).replace(/^\s+|\s+$/g, "");
  }

  function clip(value, max) {
    var text = trim(value).replace(/\s+/g, " ");
    var limit = max || MAX_VALUE_CHARS;
    return text.length > limit ? text.substring(0, limit - 1) + "…" : text;
  }

  function uniquePush(list, value) {
    if (value != null && str(value).length && list.indexOf(value) === -1) {
      list.push(value);
    }
  }

  // --- secrets ---------------------------------------------------------------------------------------------------

  // A value that looks like a secret in notes written by an agent: the value after a password, secret, token or key
  // label, a bearer token, a URL with credentials, a private key block, a long random-looking string. The label stays
  // so the reader knows a value was there (the Assistant masks the agent's texts the same way).
  var SECRET_LABEL = /((?:pass(?:word|wd|phrase)?|mot de passe|mdp|pwd|secret|token|api[ _-]?key|apikey|access[ _-]?key|client[ _-]?secret|private[ _-]?key|credentials?)\s*(?:\([^)]{0,40}\))?\s*(?:[:=]|\bis\b|\best\b)\s*)(["'`]?)([^\s"'`,;]{3,})\2/gi;
  var BEARER = /(\bbearer\s+)[A-Za-z0-9._~+\/-]{12,}=*/gi;
  var URL_CREDENTIALS = /(\b[a-z][a-z0-9+.-]*:\/\/[^\/\s:@]+:)[^\/\s@]+@/gi;
  var PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
  var KNOWN_TOKENS = /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g;

  api.maskSecrets = function (text) {
    var out = str(text);
    var count = 0;
    out = out.replace(PRIVATE_KEY, function () { count++; return "[private key masked]"; });
    out = out.replace(URL_CREDENTIALS, function (_m, head) { count++; return head + "••••••@"; });
    out = out.replace(BEARER, function (_m, head) { count++; return head + "••••••"; });
    out = out.replace(KNOWN_TOKENS, function () { count++; return "••••••"; });
    out = out.replace(SECRET_LABEL, function (match, head, quote, value) {
      // "password given at hand-off", "password: see the user" are words, not a value
      if (/^(?:given|see|not|none|n\/a|unknown|stored|hashed|salted|the|a|an|at|in|from|by|is|asked|provided|set|required|masked|••••••)$/i.test(value)) {
        return match;
      }
      count++;
      return head + quote + "••••••" + quote;
    });
    return { text: out, masked: count };
  };

  // --- CSS -----------------------------------------------------------------------------------------------------------

  function stripComments(css) {
    return str(css).replace(/\/\*[\s\S]*?\*\//g, " ");
  }

  // A CSS string ends on its line (a raw newline cannot be in it): a lone quote, as in a style written between quotes
  // by mistake, is an ordinary character instead of hiding the rest of the sheet.
  function closingQuote(source, at, quote) {
    for (var q = at + 1; q < source.length; q++) {
      var c = source.charAt(q);
      if (c === "\\") { q++; continue; }
      if (c === quote) { return q; }
      if (c === "\n") { return -1; }
    }
    return -1;
  }

  // The rules of a style sheet, nested blocks (@media, @supports, @container, @layer) flattened with their condition.
  // Not a full CSS parser: enough for the styles of an NGX app (SCSS nesting is reported under its outer selector).
  api.parseCss = function (css) {
    var text = stripComments(css);
    var rules = [];
    function walk(source, media) {
      var i = 0;
      var n = source.length;
      while (i < n) {
        var open = -1;
        for (var j = i; j < n; j++) {
          var ch = source.charAt(j);
          if (ch === "\"" || ch === "'") {
            var close = closingQuote(source, j, ch);
            if (close > 0) { j = close; }
            continue;
          }
          if (ch === "{") { open = j; break; }
          if (ch === ";" && trim(source.substring(i, j)).charAt(0) === "@") { i = j + 1; j = i - 1; continue; }
        }
        if (open < 0) {
          return;
        }
        var head = trim(source.substring(i, open));
        var depth = 1;
        var k = open + 1;
        for (; k < n && depth > 0; k++) {
          var c = source.charAt(k);
          if (c === "\"" || c === "'") {
            var end = closingQuote(source, k, c);
            if (end > 0) { k = end; }
          }
          else if (c === "{") { depth++; }
          else if (c === "}") { depth--; }
        }
        var body = source.substring(open + 1, Math.max(open + 1, k - 1));
        if (/^@(media|supports|container|layer|document)\b/i.test(head)) {
          walk(body, media.length ? media + " and " + head.replace(/^@\w+\s*/, "") : head);
        } else if (head.length && head.charAt(0) !== "@") {
          var declarations = body;
          var nested = body.indexOf("{") >= 0;
          if (nested) {
            // SCSS nesting: keep the declarations of the outer rule, report the nested ones under it
            declarations = body.replace(/[^;{}]*\{[^{}]*\}/g, " ");
            walk(body.replace(/^[^{]*?;/, ""), media);
          }
          rules.push({ selector: clip(head, 300), declarations: clip(declarations, 1200), media: media });
        }
        i = k;
      }
    }
    walk(text, "");
    return rules;
  };

  api.classesOfSelector = function (selector) {
    var out = [];
    var re = /\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g;
    var m;
    var text = str(selector).replace(/\[[^\]]*\]/g, " ").replace(/"[^"]*"|'[^']*'/g, " ");
    while ((m = re.exec(text)) !== null) {
      uniquePush(out, m[1]);
    }
    return out;
  };

  // The custom properties a style sheet defines (--ion-color-primary, --app-space-4...).
  api.variablesOf = function (css) {
    var out = [];
    var re = /(--[a-zA-Z0-9_-]+)\s*:/g;
    var m;
    var text = stripComments(css);
    while ((m = re.exec(text)) !== null) {
      uniquePush(out, m[1]);
    }
    return out;
  };

  // Class tokens of a class attribute: a plain value, or the string literals of an expression ("'app-badge ' + x").
  api.classTokens = function (mode, value) {
    var out = [];
    var text = str(value);
    if (String(mode).toUpperCase() === "PLAIN") {
      text.split(/\s+/).forEach(function (token) {
        if (/^-?[_a-zA-Z][_a-zA-Z0-9-]*$/.test(token)) {
          uniquePush(out, token);
        }
      });
      return out;
    }
    var re = /(["'`])([^"'`]*)\1/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      m[2].split(/\s+/).forEach(function (token) {
        if (/^-?[_a-zA-Z][_a-zA-Z0-9-]*$/.test(token) && token.length > 1) {
          uniquePush(out, token);
        }
      });
    }
    return out;
  };

  // The style index from the style sources ({name, qname, kind, page, css}) and the classes each page uses
  // ({page: [classes]}). detailClasses: the classes whose rules are returned.
  api.styleIndex = function (sources, usedByPage, detailClasses) {
    var byClass = {};
    var detail = {};
    (detailClasses || []).forEach(function (c) { detail[String(c).replace(/^\./, "")] = true; });
    function entry(name) {
      if (!byClass[name]) {
        byClass[name] = { name: name, definedIn: [], usedIn: [], rules: [] };
      }
      return byClass[name];
    }
    var variables = { app: [], ionColors: [], other: 0 };
    var outSources = [];
    (sources || []).forEach(function (source) {
      var rules = api.parseCss(source.css);
      outSources.push({ name: source.name, qname: source.qname, kind: source.kind, page: source.page || "", chars: str(source.css).length, rules: rules.length });
      rules.forEach(function (rule) {
        api.classesOfSelector(rule.selector).forEach(function (name) {
          var e = entry(name);
          uniquePush(e.definedIn, source.name);
          // a rule written twice (an app style completed several times) is listed once
          var duplicate = e.rules.some(function (r) { return r.selector === rule.selector && r.media === rule.media && r.declarations === rule.declarations; });
          if (detail[name] && !duplicate && e.rules.length < MAX_RULES_PER_CLASS) {
            e.rules.push({ source: source.name, selector: rule.selector, media: rule.media, declarations: rule.declarations });
          }
        });
      });
      api.variablesOf(source.css).forEach(function (v) {
        var color = /^--ion-color-([a-z]+)$/.exec(v);
        if (color) {
          uniquePush(variables.ionColors, color[1]);
        } else if (/^--app-/.test(v)) {
          uniquePush(variables.app, v);
        } else {
          variables.other++;
        }
      });
    });
    Object.keys(usedByPage || {}).forEach(function (page) {
      (usedByPage[page] || []).forEach(function (name) {
        if (/^class\d+$/.test(name)) {
          return;
        }
        uniquePush(entry(name).usedIn, page);
      });
    });
    var classes = Object.keys(byClass).sort().map(function (name) {
      var e = byClass[name];
      var out = { name: name, definedIn: e.definedIn, usedIn: e.usedIn };
      if (detail[name]) {
        out.rules = e.rules;
      }
      return out;
    });
    return {
      sources: outSources,
      classes: classes,
      undefinedClasses: classes.filter(function (c) { return !c.definedIn.length && c.usedIn.length; }).map(function (c) { return c.name; }),
      variables: variables
    };
  };

  // --- values of NGX beans ---------------------------------------------------------------------------------------

  // A MobileSmartSourceType or a beanData value ("plain:x", "script:x", "source:{...}") as the agent reads it.
  api.renderValue = function (mode, value, label) {
    var m = String(mode || "").toUpperCase();
    var text = str(value);
    if (!m.length) {
      var prefixed = /^(plain|script|source):([\s\S]*)$/.exec(text);
      if (prefixed) {
        m = prefixed[1].toUpperCase();
        text = prefixed[2];
      } else {
        m = "PLAIN";
      }
    }
    if (m === "PLAIN") {
      return "\"" + clip(text) + "\"";
    }
    if (m === "SOURCE") {
      var path = "";
      try {
        var json = JSON.parse(text);
        var model = json && json.model ? json.model : {};
        var data = model.data && model.data[0] ? model.data[0] : {};
        var root = data.localObject || data.globalObject || (json.filter ? String(json.filter).toLowerCase() : "");
        path = (root || "") + (model.path || "");
      } catch (_notJson) {}
      return "{{" + clip(path || label || text) + "}}";
    }
    return "{{" + clip(text) + "}}";
  };

  // The properties of a beanData JSON worth showing (the ionBean and its non-default values), as "key=value" texts.
  api.beanSummary = function (beanData) {
    var json = null;
    try {
      json = JSON.parse(str(beanData));
    } catch (_badBean) {
      return { bean: "", props: [] };
    }
    if (!json || typeof json !== "object") {
      return { bean: "", props: [] };
    }
    var props = [];
    Object.keys(json).forEach(function (key) {
      if (key === "ionBean") {
        return;
      }
      var value = json[key];
      if (value == null || value === "" || value === "plain:" || value === "script:") {
        return;
      }
      props.push(key + "=" + api.renderValue("", str(value)));
    });
    return { bean: str(json.ionBean), props: props, json: json };
  };

  // Bindings of a script value: item?.field and local?.x paths.
  api.bindingsOf = function (text) {
    var out = [];
    var re = /\b([A-Za-z_$][\w$]*)\??\.([A-Za-z_$][\w$]*)/g;
    var m;
    var source = str(text);
    while ((m = re.exec(source)) !== null) {
      if (/^(Math|JSON|Number|String|Date|Object|Array|console|window|document|c8oPage|page|scope|out|this)$/.test(m[1])) {
        continue;
      }
      uniquePush(out, m[2]);
    }
    return out;
  };

  // --- engine part ---------------------------------------------------------------------------------------------------

  function call(dbo, method, fallback) {
    try {
      if (dbo != null && typeof dbo[method] === "function") {
        var value = dbo[method]();
        return value == null ? fallback : value;
      }
    } catch (_callFailed) {}
    return fallback;
  }

  function javaList(list) {
    var out = [];
    if (list == null) {
      return out;
    }
    try {
      for (var i = 0; i < list.size(); i++) {
        out.push(list.get(i));
      }
    } catch (_notAList) {}
    return out;
  }

  function simpleClass(dbo) {
    try {
      return String(dbo.getClass().getSimpleName());
    } catch (_noClass) {
      return "";
    }
  }

  function qnameOf(dbo) {
    return C8O.dbo.safeFullQName ? C8O.dbo.safeFullQName(dbo) : C8O.dbo.safeQName(dbo);
  }

  function nameOf(dbo) {
    return C8O.dbo.safeName(dbo);
  }

  function children(dbo) {
    return C8O.dbo.getDirectChildren(dbo);
  }

  function smart(mst) {
    if (mst == null) {
      return { mode: "PLAIN", value: "", label: "" };
    }
    return {
      mode: str(call(mst, "getMode", "PLAIN")),
      value: str(call(mst, "getSmartValue", "")),
      label: str(call(mst, "getLabel", ""))
    };
  }

  function formatedText(fc) {
    if (fc == null) {
      return "";
    }
    return str(call(fc, "getString", ""));
  }

  // The properties of an object as tree-get shows them (dynamic ion properties included): {name: {mode, value}}.
  var SKIP_PROPS = { comment: true, identifier: true, isEnabled: true, selfClose: true, tagName: true, beanData: true, name: true, priority: true };
  function propsOf(dbo) {
    try {
      return C8O.dbo.getCanonicalPropertiesMap(dbo, "changed") || {};
    } catch (_noProps) {
      return {};
    }
  }

  function propValue(entry) {
    if (entry && typeof entry === "object" && !Array.isArray(entry) && Object.prototype.hasOwnProperty.call(entry, "value")) {
      var v = entry.value;
      return { mode: str(entry.mode || "PLAIN"), value: v != null && typeof v === "object" ? JSON.stringify(v) : str(v) };
    }
    return { mode: "PLAIN", value: entry != null && typeof entry === "object" ? JSON.stringify(entry) : str(entry) };
  }

  api.propsText = function (props) {
    var out = [];
    Object.keys(props || {}).sort().forEach(function (key) {
      if (SKIP_PROPS[key]) {
        return;
      }
      var v = propValue(props[key]);
      if (!trim(v.value).length || v.value === "not set" || v.value === "null") {
        return;
      }
      out.push(key + "=" + api.renderValue(v.mode, v.value, ""));
    });
    return out;
  };

  // The bean of an NGX object: CallSequenceAction, ListItem, Button... (the logical class after #).
  function beanOf(dbo) {
    var logical = "";
    try {
      logical = str(C8O.dbo.logicalClassNameForDbo(dbo));
    } catch (_noLogical) {}
    var at = logical.indexOf("#");
    return at >= 0 ? logical.substring(at + 1) : simpleClass(dbo);
  }

  function relative(qname, base) {
    var q = str(qname);
    return q.indexOf(base + ".") === 0 ? q.substring(base.length + 1) : q;
  }

  // One page: its calls, navigations, classes, own styles and an outline of its objects.
  function scanPage(page, project, withOutline) {
    var base = qnameOf(page);
    var info = { calls: [], opens: [], classes: [], styles: [], lists: [], forms: 0, inputs: 0, buttons: [], kpis: 0, outline: [], truncated: false };
    function addLine(dbo, text) {
      if (!withOutline) {
        return;
      }
      if (info.outline.length >= MAX_OUTLINE_LINES) {
        info.truncated = true;
        return;
      }
      info.outline.push(relative(qnameOf(dbo), base) + "  " + text);
    }
    function textsUnder(dbo, out, depth) {
      if (depth > 6) {
        return out;
      }
      children(dbo).forEach(function (child) {
        var cls = simpleClass(child);
        if (cls === "UIText") {
          var s = smart(call(child, "getTextSmartType", null));
          out.push({ mode: s.mode, value: s.value });
        } else if (cls !== "UIAttribute" && cls !== "UIControlEvent") {
          textsUnder(child, out, depth + 1);
        }
      });
      return out;
    }
    function actionText(action) {
      var cls = simpleClass(action);
      if (cls === "UICustomAction") {
        var code = formatedText(call(action, "getActionValue", null)) || str(call(action, "getActionCode", ""));
        return "custom " + clip(code, 200);
      }
      var bean = beanOf(action);
      var props = propsOf(action);
      var requestable = props.requestable ? propValue(props.requestable).value : "";
      if (requestable.length && requestable !== "not set") {
        uniquePush(info.calls, requestable.replace(/^\./, project + "."));
      }
      var target = props.page ? propValue(props.page).value : "";
      if (target.length && target !== "not set" && /Page|Navigate|Modal/.test(bean)) {
        uniquePush(info.opens, target.replace(/^.*\./, "").replace(/^pg:/, ""));
      }
      if (!withOutline) {
        return "";
      }
      var text = api.propsText(props);
      return bean + (text.length ? " " + text.join(" ") : "");
    }
    function walk(dbo, depth) {
      var siblings = children(dbo);
      siblings.forEach(function (child, index) {
        var cls = simpleClass(child);
        if (cls === "UIAttribute") {
          return; // shown on its element's line
        }
        if (cls === "UIStyle") {
          var css = formatedText(call(child, "getStyleContent", null));
          if (trim(css).length) {
            info.styles.push({ name: nameOf(child), qname: qnameOf(child), css: css });
          }
          addLine(child, "style (" + css.length + " chars, page style)");
          return;
        }
        if (cls === "UIText") {
          var t = smart(call(child, "getTextSmartType", null));
          addLine(child, "text " + api.renderValue(t.mode, t.value, t.label));
          return;
        }
        if (cls === "UIControlEvent" || cls === "UIPageEvent" || cls === "UIEventSubscriber") {
          var eventName = cls === "UIPageEvent" ? str(call(child, "getViewEvent", "")) : str(call(child, "getEventName", call(child, "getTopic", "")));
          addLine(child, "event " + eventName);
          walk(child, depth + 1);
          return;
        }
        if (/Action$/.test(cls) || cls === "UIActionStack") {
          addLine(child, "action " + actionText(child));
          walk(child, depth + 1);
          return;
        }
        if (cls === "UIControlDirective") {
          var src = smart(call(child, "getSourceSmartType", null));
          var directive = str(call(child, "getDirectiveName", ""));
          var item = str(call(child, "getDirectiveItemName", ""));
          var source = api.renderValue(src.mode, src.value, src.label);
          if (!trim(src.value).length) {
            var dprops = propsOf(child);
            var expr = dprops.directiveExpression || dprops.directiveSource || dprops.condition;
            if (expr) {
              var ev = propValue(expr);
              source = api.renderValue(ev.mode === "PLAIN" ? "SCRIPT" : ev.mode, ev.value, "");
            }
          }
          if (/each|for/i.test(directive)) {
            var head = null;
            for (var s = index - 1; s >= 0 && head === null; s--) {
              if (simpleClass(siblings[s]) !== "UIAttribute") {
                head = siblings[s];
              }
            }
            var headTexts = head && simpleClass(head) !== "UIControlDirective"
              ? textsUnder(head, [], 0).filter(function (x) { return String(x.mode).toUpperCase() === "PLAIN" && trim(x.value).length; }).map(function (x) { return trim(x.value); })
              : [];
            var fields = [];
            textsUnder(child, [], 0).forEach(function (x) {
              if (String(x.mode).toUpperCase() !== "PLAIN") {
                api.bindingsOf(x.value).forEach(function (b) { uniquePush(fields, b); });
              }
            });
            info.lists.push({ name: nameOf(child), item: item, source: source, columns: headTexts.slice(0, 12), fields: fields.slice(0, 16) });
          }
          addLine(child, (directive || "directive") + (item.length ? " " + item + " of" : "") + " " + source);
          walk(child, depth + 1);
          return;
        }
        if (cls === "UIUseShared") {
          addLine(child, "uses shared " + str(call(child, "getSharedComponentQName", "")));
          walk(child, depth + 1);
          return;
        }
        // an element: tag, bean, attributes, texts
        var tag = str(call(child, "getTagName", ""));
        var bean = { bean: beanOf(child), props: withOutline ? api.propsText(propsOf(child)) : [] };
        var attrs = [];
        children(child).forEach(function (a) {
          if (simpleClass(a) !== "UIAttribute") {
            return;
          }
          var name = str(call(a, "getAttrName", ""));
          var v = smart(call(a, "getAttrSmartType", null));
          if (name === "class" || name === "[class]" || name === "[ngClass]") {
            api.classTokens(v.mode, v.value).forEach(function (c) { uniquePush(info.classes, c); });
          }
          attrs.push(relative(qnameOf(a), qnameOf(child)) + " " + name + "=" + api.renderValue(v.mode, v.value, v.label));
        });
        if (/^ion-button$|^button$/.test(tag) || /Button$/.test(bean.bean)) {
          var label = textsUnder(child, [], 0).map(function (x) { return trim(x.value); }).filter(function (x) { return x.length; })[0] || nameOf(child);
          info.buttons.push(clip(label, 40));
        }
        if (/^ion-input$|^ion-select$|^ion-textarea$|^ion-checkbox$|^ion-toggle$|^ion-datetime$|^input$|^select$|^textarea$/.test(tag)) {
          info.inputs++;
        }
        if (/Form$/.test(bean.bean) || tag === "form") {
          info.forms++;
        }
        addLine(child, "<" + (tag || bean.bean || cls) + ">" + (bean.bean && bean.bean !== tag ? " " + bean.bean : "") +
          (bean.props.length ? " " + bean.props.join(" ") : "") + (attrs.length ? " {" + attrs.join("; ") + "}" : ""));
        walk(child, depth + 1);
      });
    }
    walk(page, 0);
    info.kpis = info.classes.indexOf("app-kpi") >= 0 ? 1 : 0;
    return info;
  }

  function countClassUses(page) {
    var count = 0;
    (function walk(dbo) {
      children(dbo).forEach(function (child) {
        if (simpleClass(child) === "UIAttribute" && str(call(child, "getAttrName", "")) === "class") {
          var v = smart(call(child, "getAttrSmartType", null));
          if (api.classTokens(v.mode, v.value).indexOf("app-kpi") >= 0) {
            count++;
          }
        }
        walk(child);
      });
    })(page);
    return count;
  }

  function pageSummary(page, scan, inMenu) {
    var parts = [];
    scan.lists.forEach(function (l) {
      parts.push("list " + l.name + " (" + (l.item ? l.item + " of " : "") + l.source + ")" +
        (l.columns.length ? " columns " + l.columns.join(", ") : "") + (l.fields.length ? " fields " + l.fields.join(", ") : ""));
    });
    if (scan.kpis) {
      parts.push(countClassUses(page) + " KPI cards (.app-kpi)");
    }
    if (scan.forms || scan.inputs) {
      parts.push((scan.forms ? "form, " : "") + scan.inputs + " inputs");
    }
    if (scan.buttons.length) {
      parts.push("buttons " + scan.buttons.slice(0, 6).join(", "));
    }
    return {
      name: nameOf(page),
      qname: qnameOf(page),
      segment: str(call(page, "getSegment", "")),
      title: str(call(page, "getTitle", "")),
      inMenu: inMenu,
      calls: scan.calls.map(function (q) { return q; }),
      opens: scan.opens,
      ownStyle: scan.styles.length > 0,
      components: parts
    };
  }

  // The app objects: root page, menus, guard, app-level styles, shared components.
  function scanApp(app) {
    var out = { qname: qnameOf(app), rootPage: "", menus: [], guard: null, styles: [], sharedComponents: [] };
    try {
      var root = app.getRootPage();
      out.rootPage = root ? nameOf(root) : "";
    } catch (_noRoot) {}
    javaList(call(app, "getMenuComponentList", null)).forEach(function (menu) {
      var items = [];
      (function walk(dbo) {
        children(dbo).forEach(function (child) {
          var page = str(call(child, "getItemPage", ""));
          if (page.length) {
            items.push(page.replace(/^.*\./, ""));
          }
          walk(child);
        });
      })(menu);
      out.menus.push({ name: nameOf(menu), qname: qnameOf(menu), pages: items });
    });
    children(app).forEach(function (child) {
      var cls = simpleClass(child);
      if (cls === "UIStyle") {
        var css = formatedText(call(child, "getStyleContent", null));
        var vars = api.variablesOf(css).length;
        var kind = /theme/i.test(nameOf(child)) || (vars > 20 && api.parseCss(css).every(function (r) { return !api.classesOfSelector(r.selector).filter(function (c) { return !/^(force-(light|dark)|dark|ios|md|plt-\w+|ion-color-\w+)$/.test(c); }).length; }))
          ? "theme" : "app";
        out.styles.push({ name: nameOf(child), qname: qnameOf(child), kind: kind, css: css });
      } else if (cls === "UIAppGuard") {
        var guard = { qname: qnameOf(child), type: str(call(child, "getGuardType", "")), redirectUnauthenticatedTo: "", protectedPages: [], guestOnlyPages: [], allowByDefault: null };
        (function walk(dbo) {
          children(dbo).forEach(function (action) {
            var bean = api.beanSummary(call(action, "getBeanData", ""));
            var json = bean.json || {};
            if (bean.bean === "AuthorizePagesAction") {
              guard.redirectUnauthenticatedTo = str(json.redirectUnauthenticatedTo || "").replace(/^plain:/, "");
              guard.protectedPages = str(json.protectedPages || "").replace(/^plain:/, "").split(/[,;\s]+/).filter(function (x) { return x.length && x !== "[]"; });
              guard.guestOnlyPages = str(json.guestOnlyPages || "").replace(/^plain:/, "").split(/[,;\s]+/).filter(function (x) { return x.length && x !== "[]"; });
              guard.allowByDefault = json.allowByDefault == null ? null : !/false/i.test(str(json.allowByDefault));
            }
            walk(action);
          });
        })(child);
        out.guard = guard;
      }
    });
    javaList(call(app, "getSharedComponentList", null)).forEach(function (shared) {
      out.sharedComponents.push(nameOf(shared));
    });
    return out;
  }

  // Tables and fields of the SQL connectors, from the JDBC metadata (the database as it is now).
  function jdbcUrlOf(connector) {
    var url = "";
    try { url = String(connector.getRealJdbcURL() || ""); } catch (_noRealUrl) {}
    if (!url.length || url === "null") {
      url = String(call(connector, "getJdbcURL", ""));
      if (url.indexOf("jdbc:hsqldb:file:") === 0) {
        url = "jdbc:hsqldb:file:" + String(Packages.com.twinsoft.convertigo.engine.Engine.theApp.filePropertyManager.getFilepathFromProperty(
          url.substring("jdbc:hsqldb:file:".length), String(connector.getProject().getName())));
      }
    }
    if (url.indexOf("jdbc:hsqldb:file:") === 0) {
      url = url.split(";")[0] + ";ifexists=true";
    }
    return url;
  }

  function sqlTables(connector) {
    var out = { tables: [], error: "" };
    var jdbc = null;
    try {
      try { java.lang.Class.forName(String(connector.getJdbcDriverClassName())); } catch (_driverLoaded) {}
      var user = "";
      var password = "";
      try { user = String(connector.getRealJdbcUserName() || ""); } catch (_noUser) {}
      try { password = String(connector.getRealJdbcUserPassword() || ""); } catch (_noPassword) {}
      java.sql.DriverManager.setLoginTimeout(5);
      jdbc = java.sql.DriverManager.getConnection(jdbcUrlOf(connector), user, password);
      var meta = jdbc.getMetaData();
      var rs = meta.getTables(null, null, "%", ["TABLE", "VIEW"]);
      var names = [];
      try {
        while (rs.next() && names.length < MAX_TABLES) {
          var schema = String(rs.getString("TABLE_SCHEM") || "");
          if (/^(INFORMATION_SCHEMA|SYSTEM_LOBS|SYS|SYSTEM|pg_catalog|mysql|performance_schema)$/i.test(schema)) {
            continue;
          }
          names.push({ schema: schema, name: String(rs.getString("TABLE_NAME")), view: String(rs.getString("TABLE_TYPE")) === "VIEW" });
        }
      } finally {
        rs.close();
      }
      names.forEach(function (t) {
        var fields = [];
        var keys = {};
        try {
          var pk = meta.getPrimaryKeys(null, t.schema.length ? t.schema : null, t.name);
          try {
            while (pk.next()) { keys[String(pk.getString("COLUMN_NAME"))] = true; }
          } finally { pk.close(); }
        } catch (_noPk) {}
        var cols = meta.getColumns(null, t.schema.length ? t.schema : null, t.name, "%");
        try {
          while (cols.next() && fields.length < MAX_FIELDS) {
            var name = String(cols.getString("COLUMN_NAME"));
            fields.push(name.toLowerCase() + " " + String(cols.getString("TYPE_NAME")).toLowerCase() + (keys[name] ? " pk" : "") +
              (cols.getInt("NULLABLE") === java.sql.DatabaseMetaData.columnNoNulls && !keys[name] ? " required" : ""));
          }
        } finally {
          cols.close();
        }
        out.tables.push({ name: t.name.toLowerCase(), view: t.view, fields: fields });
      });
    } catch (e) {
      out.error = clip(String(e), 200);
    } finally {
      if (jdbc) {
        try { jdbc.close(); } catch (_closed) {}
      }
    }
    return out;
  }

  // Role names: the string literals of the role checks of the project's sequences (IfStep on me.role, the auth step of
  // business-sequence-create, hasRole calls).
  function roleNames(project, model) {
    var roles = [];
    var ROLE = /\broles?\b|hasRole|isUserInRole/i;
    (model.steps || []).forEach(function (s) {
      if (!(s.signals && s.signals.checksRole)) {
        return;
      }
      try {
        var dbo = C8O.dbo.resolve(s.qname);
        var text = str(call(dbo, "getExpression", "")) + "\n" + str(call(dbo, "getCondition", ""));
        text.split(/\n/).forEach(function (line) {
          if (!ROLE.test(line)) {
            return;
          }
          var re = /(["'])([A-Za-z][\w-]{1,30})\1/g;
          var m;
          while ((m = re.exec(line)) !== null) {
            if (!/^(role|roles|user|me|string|object|undefined|null|true|false|id|name|code|message|error|FORBIDDEN|UNAUTHENTICATED|AUTH_REQUIRED)$/i.test(m[2])) {
              uniquePush(roles, m[2]);
            }
          }
        });
      } catch (_noStep) {}
    });
    return roles.slice(0, 20);
  }

  function readNotes(project) {
    var out = { path: api.NOTES_PATH, present: false, chars: 0, text: "", truncated: false, masked: 0, otherFiles: [], servedDocs: [] };
    try {
      var dir = new java.io.File(String(project.getDirPath()));
      var source = api.notesSource(function (relativePath) { return new java.io.File(dir, relativePath).isFile(); });
      if (source.present) {
        var text = readUtf8(new java.io.File(dir, source.path));
        var masked = api.maskSecrets(text);
        out.path = source.path;
        out.present = true;
        if (source.legacy) {
          out.legacy = true;
        }
        out.chars = text.length;
        out.masked = masked.masked;
        out.truncated = masked.text.length > MAX_NOTES_CHARS;
        out.text = out.truncated ? masked.text.substring(0, MAX_NOTES_CHARS) + "\n…" : masked.text;
      }
      var listMarkdown = function (folder, into, skip) {
        var listed = new java.io.File(dir, folder).listFiles();
        for (var i = 0; listed !== null && i < listed.length && into.length < 10; i++) {
          var name = String(listed[i].getName());
          if (listed[i].isFile() && /\.(md|txt)$/i.test(name) && folder + "/" + name !== skip) {
            into.push(folder + "/" + name);
          }
        }
      };
      listMarkdown(api.DOCS_DIR, out.otherFiles, api.NOTES_PATH);
      api.SERVED_DOCS_DIRS.forEach(function (folder) {
        listMarkdown(folder, out.servedDocs, source.legacy ? "" : api.LEGACY_NOTES_PATH);
      });
    } catch (_noNotes) {}
    return out;
  }

  api.build = function (projectName, options) {
    var opts = options || {};
    var project = C8O.dbo.resolve(projectName, { messagePrefix: "project" });
    var name = nameOf(project);
    var warnings = [];
    var model = { requestables: [], steps: [], variables: [], references: [], externalRequestables: [] };
    try {
      model = C8O.securityAudit.collect(name, { includeEngine: false, includeFrontend: false });
    } catch (collectError) {
      warnings.push("Sequences not read: " + clip(String(collectError), 200));
    }
    var access = {};
    try {
      var summary = C8O.securityAudit.accessSummary(model);
      ["roleChecked", "signedInOnly", "anonymous", "private"].forEach(function (k) {
        (summary[k] || []).forEach(function (n) { access[n] = k; });
      });
    } catch (_noAccess) {}

    // sequences
    var inputsByOwner = {};
    (model.variables || []).forEach(function (v) {
      if (v.scope === "requestable") {
        (inputsByOwner[v.owner] = inputsByOwner[v.owner] || []).push(v.name);
      }
    });
    var sequences = [];
    var signIn = [];
    var signOut = [];
    var calledProjects = {};
    (model.requestables || []).forEach(function (r) {
      (r.calls || []).forEach(function (t) { calledProjects[str(t).split(".")[0]] = true; });
      if (r.kind !== "sequence" || str(r.qname).indexOf(name + ".") !== 0) {
        return;
      }
      var short = str(r.qname).replace(/^.*[.:]/, "");
      var session = "";
      try {
        session = C8O.securityAudit.sessionChange(model, r.qname);
      } catch (_noSession) {}
      if (session === "open") {
        signIn.push(short);
      } else if (session === "close") {
        signOut.push(short);
      }
      if (sequences.length < MAX_SEQUENCES) {
        sequences.push({
          name: short,
          access: access[short] || (r.accessibility === "Private" ? "private" : (r.authenticatedContextRequired ? "signedInOnly" : "anonymous")),
          inputs: (inputsByOwner[r.qname] || []).slice(0, 20),
          calls: (r.calls || []).map(function (t) { return str(t).indexOf(name + ".") === 0 ? str(t).substring(name.length + 1) : str(t); }).slice(0, 20),
          session: session
        });
      }
    });

    // data
    var data = [];
    javaList(call(project, "getConnectorsList", null)).forEach(function (connector) {
      var cls = simpleClass(connector);
      var transactions = javaList(call(connector, "getTransactionsList", null)).map(nameOf);
      var entry = { name: nameOf(connector), kind: cls.replace(/Connector$/, ""), transactions: transactions.length, tables: [], error: "" };
      if (cls === "SqlConnector" && opts.tables !== false) {
        var t = sqlTables(connector);
        entry.tables = t.tables;
        entry.error = t.error;
      }
      data.push(entry);
    });

    // references
    var references = (model.references || []).map(function (ref) {
      return { project: ref.projectName, used: false };
    });

    // frontend
    var frontend = { present: false, app: null, pages: [], detail: null };
    var styleSources = [];
    var usedByPage = {};
    var mobile = call(project, "getMobileApplication", null);
    var app = mobile ? call(mobile, "getApplicationComponent", null) : null;
    var detailClasses = (opts.classes || []).slice(0, MAX_DETAILED_CLASSES);
    var pagesWithoutStyle = [];
    if (app) {
      frontend.present = true;
      var appInfo = scanApp(app);
      appInfo.styles.forEach(function (s) {
        styleSources.push({ name: s.name, qname: s.qname, kind: s.kind, css: s.css });
      });
      var inMenu = {};
      appInfo.menus.forEach(function (m) { m.pages.forEach(function (p) { inMenu[p] = true; }); });
      var wanted = trim(opts.page || "").replace(/^.*\./, "").replace(/^pg:/, "");
      var pages = javaList(call(app, "getPageComponentList", null));
      pages.forEach(function (page, index) {
        var pageName = nameOf(page);
        var detailed = wanted.length && pageName.toLowerCase() === wanted.toLowerCase();
        var scan = scanPage(page, name, detailed);
        usedByPage[pageName] = scan.classes;
        scan.calls.forEach(function (q) { calledProjects[str(q).split(".")[0]] = true; });
        scan.styles.forEach(function (s) {
          styleSources.push({ name: pageName + "." + s.name, qname: s.qname, kind: "page", page: pageName, css: s.css });
        });
        if (!scan.styles.length) {
          pagesWithoutStyle.push(pageName);
        }
        if (index < MAX_PAGES) {
          var autoMenu = call(page, "isInAutoMenu", false) === true;
          frontend.pages.push(pageSummary(page, scan, inMenu[pageName] === true || autoMenu));
        }
        if (detailed) {
          scan.classes.forEach(function (c) { uniquePush(detailClasses, c); });
          frontend.detail = { page: pageName, qname: qnameOf(page), lines: scan.outline, truncated: scan.truncated };
        }
      });
      if (wanted.length && !frontend.detail) {
        warnings.push("No page " + wanted + " in " + name + ": pages are " + pages.map(nameOf).join(", ") + ".");
      }
      javaList(call(app, "getSharedComponentList", null)).forEach(function (shared) {
        children(shared).forEach(function (child) {
          if (simpleClass(child) === "UIStyle") {
            var css = formatedText(call(child, "getStyleContent", null));
            if (trim(css).length) {
              styleSources.push({ name: nameOf(shared) + "." + nameOf(child), qname: qnameOf(child), kind: "shared", css: css });
            }
          }
        });
      });
      delete appInfo.styles;
      frontend.app = appInfo;
    }
    references.forEach(function (ref) { ref.used = calledProjects[ref.project] === true; });

    var styles = api.styleIndex(styleSources, usedByPage, detailClasses.slice(0, MAX_DETAILED_CLASSES));
    styles.appStyles = styleSources.filter(function (s) { return s.kind === "app"; }).map(function (s) { return s.qname; });
    styles.theme = styleSources.filter(function (s) { return s.kind === "theme"; }).map(function (s) { return s.qname; });
    styles.mainAppStyle = api.mainAppStyle(styleSources, styles.classes);
    var loginPages = frontend.pages.filter(function (p) {
      return p.calls.some(function (c) { return signIn.indexOf(str(c).replace(/^.*\./, "")) >= 0; });
    }).map(function (p) { return p.name; });
    var auth = {
      signIn: signIn,
      signOut: signOut,
      loginPages: loginPages,
      roles: roleNames(project, model),
      testSession: signIn.length && frontend.present
        ? "To check pages behind the sign-in in the Studio browser, call viewer-sign-in({project:\"" + name + "\", user:\"<an account of the app>\", page:\"<route segment>\"}): it signs the browser in as that account without a password. Never guess, crack or reset a password."
        : ""
    };
    var notes = readNotes(project);
    var result;
    if (frontend.detail) {
      // one page: what its change needs, the rest of the project was in the overview
      var pageEntry = frontend.pages.filter(function (p) { return p.name === frontend.detail.page; })[0] || null;
      var called = {};
      (pageEntry ? pageEntry.calls : []).forEach(function (q) { called[str(q).replace(/^.*\./, "")] = true; });
      var pageStyle = styleSources.filter(function (s) { return s.kind === "page" && s.page === frontend.detail.page; }).map(function (s) { return s.qname; });
      result = {
        project: name,
        version: str(call(project, "getVersion", "")),
        notes: notes.legacy ? { path: notes.path, present: notes.present, chars: notes.chars, legacy: true } : { path: notes.path, present: notes.present, chars: notes.chars },
        page: frontend.detail,
        pageSummary: pageEntry,
        sequences: sequences.filter(function (s) { return called[s.name] === true; }),
        data: data,
        auth: { signIn: signIn, loginPages: loginPages, testSession: auth.testSession },
        styles: {
          classes: styles.classes.filter(function (c) { return c.rules !== undefined; }),
          undefinedClasses: styles.undefinedClasses.filter(function (c) { return (usedByPage[frontend.detail.page] || []).indexOf(c) >= 0; }),
          pageStyle: pageStyle.length ? pageStyle[0] : "",
          mainAppStyle: styles.mainAppStyle,
          appStyles: styles.appStyles,
          theme: styles.theme,
          variables: styles.variables
        },
        warnings: warnings
      };
    } else {
      styles.classes = api.compactClasses(styles.classes);
      styles.pagesWithoutStyle = pagesWithoutStyle;
      result = {
        project: name,
        version: str(call(project, "getVersion", "")),
        notes: notes,
        app: frontend.app,
        pages: frontend.pages,
        sequences: sequences,
        data: data,
        auth: auth,
        references: references,
        styles: styles,
        warnings: warnings
      };
    }
    result.next = nextHints(result);
    return result;
  };

  // Classes worth listing: used by a page, or defined by an app style and not an Ionic, AG Grid or theme internal.
  var NOISE_CLASS = /^(ion-|ag-|in-|force-|plt-|title-|sc-|md-|ios-)|^(ios|md|selected|hydrated|dark|light|activated|focused|disabled)$/;
  api.compactClasses = function (classes) {
    return (classes || []).filter(function (c) {
      return c.usedIn.length > 0 || (c.definedIn.length > 0 && !NOISE_CLASS.test(c.name));
    }).map(function (c) {
      var out = { name: c.name, definedIn: c.definedIn, usedIn: c.usedIn };
      if (c.rules) {
        out.rules = c.rules;
      }
      return out;
    });
  };

  // The app style the pages' classes come from: the app-level style defining the most classes the pages use.
  api.mainAppStyle = function (sources, classes) {
    var score = {};
    (classes || []).forEach(function (c) {
      if (!c.usedIn.length) {
        return;
      }
      c.definedIn.forEach(function (s) { score[s] = (score[s] || 0) + 1; });
    });
    var best = "";
    var bestScore = -1;
    (sources || []).forEach(function (s) {
      if (s.kind === "app" && (score[s.name] || 0) > bestScore) {
        best = s.qname;
        bestScore = score[s.name] || 0;
      }
    });
    return best;
  };

  function nextHints(brief) {
    var hints = [];
    if (brief.page) {
      hints.push("The QName of an object of " + brief.page.page + " is " + brief.page.qname + ".<the path at the start of its line>; patch it with databaseobject-tree-apply, no tree-get needed.");
    } else if (brief.pages.length) {
      hints.push("Call project-brief again with page:\"<name>\" for the objects of the page you change, with their QNames.");
    }
    if (brief.styles.mainAppStyle) {
      hints.push("A style shared by several pages goes in the app style " + brief.styles.mainAppStyle + " (styleContent); a style of one page goes in a UIStyle of that page" +
        (brief.page ? (brief.styles.pageStyle ? " (" + brief.styles.pageStyle + ")" : " (it has none yet: create one)") : " (pagesWithoutStyle have none yet)") +
        ". Reuse the classes listed and the theme variables (--app-*, --ion-color-<name>, -rgb) before new colours.");
    }
    if (brief.notes.present && brief.notes.text !== undefined) {
      hints.push("notes.text is the project's " + brief.notes.path + ": follow its conventions, and add what this turn decides with project-notes-write.");
    }
    if (brief.notes.legacy) {
      hints.push("The notes are still in " + api.LEGACY_NOTES_PATH + ", which a deployed server serves to anyone: the next project-notes-write moves them to " + api.NOTES_PATH + ".");
    }
    if (brief.notes.servedDocs && brief.notes.servedDocs.length) {
      hints.push("servedDocs are text files that a deployed server serves to anyone (" + brief.notes.servedDocs.join(", ") + "): keep build documents under " + api.DOCS_DIR + "/, never a password or key in a served file.");
    }
    return hints;
  }

  // --- project-notes-write -------------------------------------------------------------------------------------------

  var MAX_NOTES_WRITE = 20000;

  // The notes of a project, written in _private/docs/PROGRESS.md: replace (the whole file) or append (a section at the
  // end). A text holding a secret is refused, never written masked: the agent rewrites it without the value.
  api.checkNotesText = function (text) {
    var value = str(text).replace(/\r\n?/g, "\n");
    if (!trim(value).length) {
      throw new Error("text is required: the Markdown of the notes.");
    }
    if (value.length > MAX_NOTES_WRITE) {
      throw new Error("text has " + value.length + " characters: keep the notes under " + MAX_NOTES_WRITE + " (conventions, decisions, inventory, next step), not a log.");
    }
    var masked = api.maskSecrets(value);
    if (masked.masked > 0) {
      var lines = [];
      masked.text.split("\n").forEach(function (line, i) {
        if (line.indexOf("••••••") >= 0 || line.indexOf("[private key masked]") >= 0) {
          lines.push(i + 1);
        }
      });
      throw new Error("The notes hold a password, token or key (line " + lines.slice(0, 5).join(", ") + "): never write a secret in the project. " +
        "Name the account only, and say where the secret is kept (\"password given to the user\").");
    }
    return value;
  };

  // What a write of the notes does, from the texts of the private file and of the legacy served one (null when absent).
  // The legacy file is removed by any write: it is served. Its text, when it is the one appended to, moves masked: it
  // was written before the secret check and may hold a password.
  api.planNotesWrite = function (privateText, legacyText, text, mode) {
    var value = api.checkNotesText(text);
    var how = trim(mode || "replace").toLowerCase();
    if (how !== "replace" && how !== "append") {
      throw new Error("mode must be replace or append.");
    }
    var hasPrivate = privateText !== null && privateText !== undefined;
    var hasLegacy = legacyText !== null && legacyText !== undefined;
    var previous = hasPrivate ? str(privateText) : "";
    var maskedOnMove = 0;
    if (!hasPrivate && hasLegacy) {
      var moved = api.maskSecrets(str(legacyText));
      previous = moved.text;
      maskedOnMove = moved.masked;
    }
    var next = how === "append" && trim(previous).length ? previous.replace(/\n*$/, "\n\n") + value.replace(/\n*$/, "\n") : value.replace(/\n*$/, "\n");
    if (next.length > MAX_NOTES_WRITE * 2) {
      throw new Error("The notes would have " + next.length + " characters: rewrite them shorter with mode replace.");
    }
    var plan = {
      next: next,
      status: trim(previous).length ? (how === "append" ? "appended" : "replaced") : "created",
      removeLegacy: hasLegacy
    };
    if (hasLegacy) {
      plan.movedFrom = api.LEGACY_NOTES_PATH;
      if (how === "append" && maskedOnMove > 0) {
        plan.maskedOnMove = maskedOnMove;
      }
    }
    return plan;
  };

  function readUtf8(file) {
    return String(new java.lang.String(java.nio.file.Files.readAllBytes(file.toPath()), "UTF-8"));
  }

  api.writeNotes = function (projectName, text, mode) {
    var project = C8O.dbo.resolve(projectName, { messagePrefix: "project" });
    var dir = new java.io.File(String(project.getDirPath()));
    var file = new java.io.File(dir, api.NOTES_PATH);
    var legacy = new java.io.File(dir, api.LEGACY_NOTES_PATH);
    var plan = api.planNotesWrite(file.isFile() ? readUtf8(file) : null, legacy.isFile() ? readUtf8(legacy) : null, text, mode);
    file.getParentFile().mkdirs();
    java.nio.file.Files.write(file.toPath(), new java.lang.String(plan.next).getBytes("UTF-8"));
    var out = { project: nameOf(project), path: api.NOTES_PATH, status: plan.status, chars: plan.next.length };
    if (plan.removeLegacy) {
      if (legacy["delete"]()) {
        out.movedFrom = plan.movedFrom;
        var parent = legacy.getParentFile();
        var left = parent.list();
        if (left !== null && left.length === 0) {
          parent["delete"]();
        }
        if (plan.maskedOnMove) {
          out.maskedOnMove = plan.maskedOnMove;
        }
      } else {
        out.warning = api.LEGACY_NOTES_PATH + " could not be removed: the web server still serves it. Delete it.";
      }
    }
    return out;
  };

  // --- tool entry points ---------------------------------------------------------------------------------------------

  // classes: a JSON array, a comma or space separated list, or an array.
  api.parseClasses = function (value) {
    if (value == null) {
      return [];
    }
    var items = value;
    if (!Array.isArray(items)) {
      var text = trim(value);
      if (!text.length || text === "null" || text === "undefined") {
        return [];
      }
      try {
        items = text.charAt(0) === "[" ? JSON.parse(text) : text.split(/[\s,;]+/);
      } catch (_notJson) {
        items = text.replace(/[\[\]"']/g, " ").split(/[\s,;]+/);
      }
    }
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var name = trim(items[i]).replace(/^\./, "");
      if (/^-?[_a-zA-Z][_a-zA-Z0-9-]*$/.test(name)) {
        uniquePush(out, name);
      }
    }
    return out;
  };

  // The engine helpers (C8O.dbo) when the sequence did not load them.
  function engineHelpers() {
    if ((typeof C8O.dbo === "undefined" || typeof C8O.dbo.resolve !== "function") && typeof include === "function") {
      include("js/databaseobject.js");
    }
  }

  function requireFullBearer(contextObject) {
    if (!C8O.mcpAuth || typeof C8O.mcpAuth.authenticateRequest !== "function") {
      return;
    }
    var auth = C8O.mcpAuth.authenticateRequest(contextObject);
    if (!auth.authenticated || auth.kind === "nocode") {
      throw new Error("A Convertigo MCP bearer token is required");
    }
  }

  api.execute = function (contextObject, params) {
    requireFullBearer(contextObject);
    engineHelpers();
    var p = params || {};
    var project = trim(p.project);
    if (!project.length || project === "null") {
      throw new Error("project is required: the project to describe (project-list gives them).");
    }
    var tables = trim(p.tables).toLowerCase();
    return api.build(project, {
      page: trim(p.page) === "null" ? "" : trim(p.page),
      classes: api.parseClasses(p.classes),
      tables: tables !== "false" && tables !== "0" && tables !== "no"
    });
  };

  api.executeWrite = function (contextObject, params) {
    requireFullBearer(contextObject);
    engineHelpers();
    var p = params || {};
    var project = trim(p.project);
    if (!project.length || project === "null") {
      throw new Error("project is required.");
    }
    var mode = trim(p.mode);
    return api.writeNotes(project, p.text, mode.length && mode !== "null" ? mode : "replace");
  };
})(C8O.projectBrief);
