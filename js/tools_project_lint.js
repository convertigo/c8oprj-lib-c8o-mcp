// project-lint: one read-only pass over a project for the pitfalls seen in the supervised runs.
// Each rule names what breaks and the fix; tree-apply warns on most of them at write time, this
// tool finds them in objects already built. Result: {project, scanned, counts, findings}.
(function () {
  C8O.lint = C8O.lint || {};

  var MAX_FINDINGS = 300;
  var NON_RENDERING = /UIAttribute|UIControlEvent|UIStyle|UIControlVariable|UIDynamicAction|UIDynamicAttr|UICustomAction|UIEventSubscriber|UIPageEvent/;
  // French words usually written with an accent, as they appear when accents are stripped.
  var STRIPPED_WORDS = /(^|[^A-Za-zÀ-ÿ])(a jour|Gerer|gerer|echeance|Echeance|Repartition|repartition|Executer|executer|controle|Controle|libelle|Libelle|Numero|numero|Derniere|derniere|Creer|creer|Etat|Equipe|Ecran|Deconnexion|deconnexion|Selection|selection|Securite|Telecharger|Precedent|precedent|Resume|Periode|periode|Donnees|donnees|Parametres|parametres|Supprime|Cree le|Modifie le|Declare le)([^A-Za-zÀ-ÿ]|$)/;

  function str(value) {
    if (value === null || value === undefined) {
      return "";
    }
    try {
      if (typeof value.getValue === "function") {
        return String(value.getValue());
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

  C8O.lint.run = function (projectName) {
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    var project = Engine.theApp.databaseObjectsManager.getOriginalProjectByName(String(projectName || ""));
    if (!project) {
      throw new Error("Project not found: " + projectName + ". project-list gives the loaded projects.");
    }
    var findings = [];
    var counts = { byRule: {}, bySeverity: { error: 0, warning: 0, info: 0 } };
    var scanned = 0;

    function add(rule, severity, dbo, message, fix) {
      counts.byRule[rule] = (counts.byRule[rule] || 0) + 1;
      counts.bySeverity[severity] = (counts.bySeverity[severity] || 0) + 1;
      if (findings.length < MAX_FINDINGS) {
        findings.push({ rule: rule, severity: severity, qname: qnameOf(dbo), message: message, fix: fix });
      }
    }

    function lintSql(dbo) {
      var query = str(call(dbo, "getSqlQuery"));
      if (!query.length) {
        return;
      }
      var literals = query.match(/'(?:[^']|'')*'/g) || [];
      for (var li = 0; li < literals.length; li++) {
        var inner = literals[li].substring(1, literals[li].length - 1);
        if (/\{[A-Za-z_]\w*\}/.test(inner) && !/^\{[A-Za-z_]\w*\}$/.test(inner)) {
          add("SQL-QUOTED-VARIABLE", "error", dbo, "A {variable} shares a string literal with other text (" + literals[li] + "): the call fails with parameter index out of range.",
            "Concatenate: col LIKE {x} || '%'.");
          break;
        }
      }
      var dateMath = /\b(CURRENT_DATE|CURRENT_TIMESTAMP|NOW\(\))\s*[-+]\s*\d+(?!\d|\s*(DAY|MONTH|YEAR|HOUR|MINUTE|SECOND)S?\b)/i.exec(query);
      if (dateMath) {
        add("SQL-DATE-UNIT", "error", dbo, "Bare number added to a date (" + dateMath[0] + "): HSQLDB refuses it (incompatible data types in combination).",
          "Give the unit (" + dateMath[0] + " DAY) or use DATEADD('day', n, CURRENT_DATE).");
      }
      var inMatch = /\bIN\s*\(\s*\{([A-Za-z_]\w*)\}\s*\)/i.exec(query);
      if (inMatch) {
        var variable = null;
        try {
          variable = dbo.getVariable(inMatch[1]);
        } catch (_ignoreVariable) {}
        if (variable != null && /MultiValued/.test(String(variable.getClass().getName()))) {
          add("SQL-IN-LIST", "error", dbo, "IN ({" + inMatch[1] + "}) with a multivalued variable: it is bound as one value, never as a list.",
            "Pass one comma-separated string and test POSITION(',' || CAST(col AS VARCHAR(20)) || ',' IN ',' || {" + inMatch[1] + "} || ',') > 0.");
        }
      }
      var alias = /\bAS\s+([a-z][A-Za-z0-9_]*)\b/.exec(query);
      if (alias && /^\s*(SELECT|WITH)\b/i.test(query)) {
        add("SQL-ALIAS-CASE", "warning", dbo, "Unquoted alias " + alias[1] + ": HSQLDB returns it upper-cased (" + alias[1].toUpperCase() + "), so row." + alias[1] + " is undefined.",
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
        add("SEQ-WRITE-UNCHECKED", "warning", writes[0], "The sequence writes through " + writes.length + " TransactionStep(s) and never reads an error: a failing write does not stop the sequence, and the facade still answers success.",
          "Source the write step's ./document and test document.error before counting the write.");
      }
    }

    function lintNgx(dbo, className) {
      if (className === "UIText") {
        var text = smartText(call(dbo, "getTextValue"));
        if (call(dbo, "isI18n") === true && /\s/.test(text)) {
          add("NGX-I18N-KEY", "warning", dbo, "i18n is on, so \"" + text.substring(0, 60) + "\" is a translation key: without a translation the page shows it with underscores.",
            "Set i18n to false, or add the translation.");
        }
        if (/\bc8oPage\./.test(text)) {
          add("NGX-C8OPAGE-TEMPLATE", "error", dbo, "c8oPage in a template text: the page has no c8oPage member and fails at run time.",
            "Write local?.x instead of c8oPage.local?.x.");
        }
        var stripped = STRIPPED_WORDS.exec(text);
        if (stripped) {
          add("TEXT-ACCENTS", "info", dbo, "\"" + stripped[2] + "\" looks like a French word without its accent.",
            "Write the text with its accents; Convertigo objects are UTF-8.");
        }
      } else if (className === "UIAttribute") {
        if (/\bc8oPage\./.test(smartText(call(dbo, "getAttrValue")))) {
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
      } else if (className === "PageComponent") {
        if (/c8o\.callJson/.test(str(call(dbo, "getScriptContent")))) {
          add("NGX-CALLJSON", "error", dbo, "The page calls the backend from scriptContent with c8o.callJson.",
            "Use events with CallSequenceAction.");
        }
      }
      // Glued texts: two UIText siblings that meet with no space or punctuation between them
      // ("Postes actifs" then a bound "7"). A composed sentence ("Date : ", value, " (", ...) is fine.
      var kids = C8O.dbo.getDirectChildren(dbo);
      var previous = null;
      for (var ki = 0; ki < kids.length; ki++) {
        var kidClass = simpleClassName(kids[ki]);
        if (NON_RENDERING.test(kidClass)) {
          continue;
        }
        if (kidClass === "UIText") {
          var raw = str(call(kids[ki], "getTextValue"));
          var current = { name: String(kids[ki].getName()), plain: /^plain:/.test(raw) || !/^(script|source):/.test(raw), text: smartText(raw) };
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

    var queue = [project];
    while (queue.length) {
      var dbo = queue.shift();
      scanned++;
      var className = simpleClassName(dbo);
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

    return {
      project: String(project.getName()),
      scanned: scanned,
      counts: counts,
      truncated: findings.length >= MAX_FINDINGS,
      findings: findings
    };
  };
})();
