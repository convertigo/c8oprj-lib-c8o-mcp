/*
 * ngx-page-create: a list, detail, form or dashboard page built with the patterns of the "Basic presentation"
 * section of convertigo_frontend_ngx and the NGX pages of convertigo_recipe_multipage_app: page-enter event
 * with locals and a CallSequenceAction of the data business sequence, lost-session redirect, record and label/value
 * lists, KPI cards, table lists, empty states, UIForm with Form SmartSources, toast and navigation, and the AppLayout style.
 * The AppLayout classes read the tokens of AppTheme (js/tools_generators_ngx_theme.js), which a new app gets with its first page.
 * Uses the validation and all-or-nothing helpers of js/tools_generators.js.
 */
include("js/tools_generators_ngx_theme.js");

(function () {
  var G = C8O.generators;
  var H = G._;
  var str = H.str, isObj = H.isObj, parseJson = H.parseJson, list = H.list, IDENT = H.IDENT, jsString = H.jsString,
    upperFirst = H.upperFirst, lowerFirst = H.lowerFirst, qnameOf = H.qnameOf, childNamed = H.childNamed, invalid = H.invalid,
    projectOf = H.projectOf, variableNames = H.variableNames, batchErrors = H.batchErrors, batchWarnings = H.batchWarnings, Session = H.Session;

  // --- NGX page ----------------------------------------------------------------------------------

  // The classes of the generated pages. They read the tokens of AppTheme (ngx-theme-apply) and keep a plain fallback, so an
  // app without AppTheme still renders. An existing AppLayout is only completed with the rules it lacks (by selector).
  var ACCENTS = ["primary", "secondary", "tertiary", "success", "warning", "danger", "medium"];
  // The icon of a KPI card that gives none, after its accent.
  var KPI_ICONS = { success: "checkmark-circle-outline", danger: "alert-circle-outline", warning: "time-outline", medium: "pause-circle-outline",
    primary: "stats-chart-outline", secondary: "stats-chart-outline", tertiary: "stats-chart-outline" };
  // The AG Grid of lib_ExtendedComponents_ui_ngx sorts, filters, pages and exports a list: agents rebuilt admin tables by
  // hand and never looked for it (PCA eval 31/10). A list of GRID_AUTO_CELLS cells or more gets it unless grid is false.
  var GRID_LIBRARY = "lib_ExtendedComponents_ui_ngx";
  var GRID_COMPONENT = "agGrid";
  var GRID_AUTO_CELLS = 5;
  var SURFACE = "var(--app-surface, var(--ion-item-background, #fff))";
  var BORDER = "1px solid var(--app-border, var(--ion-border-color, rgba(127,127,127,0.2)))";
  var MUTED = "var(--app-muted, var(--ion-color-medium, #64748b))";
  var APP_LAYOUT_RULES = [
    [".app-page", ".app-page { max-width: 1120px; margin: 0 auto; padding: var(--app-space-5, 24px) var(--app-space-4, 16px) var(--app-space-6, 32px); }"],
    [".app-title", ".app-title { margin: 0 0 var(--app-space-4, 16px); font-size: var(--app-font-size-2xl, 28px); font-weight: var(--app-heading-weight, 650); letter-spacing: -0.02em; line-height: 1.2; }"],
    [".app-section", ".app-section { margin: var(--app-space-6, 32px) 0 var(--app-space-3, 12px); font-size: var(--app-font-size-lg, 18px); font-weight: var(--app-heading-weight, 650); }"],
    [".app-filters", ".app-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--app-space-3, 12px); align-items: end; " +
      "margin-bottom: var(--app-space-4, 16px); padding: var(--app-space-3, 12px) var(--app-space-4, 16px); background: " + SURFACE + "; border: " + BORDER + "; border-radius: var(--app-radius-lg, 12px); }"],
    [".app-filter", ".app-filter { flex: 1 1 180px; min-width: 160px; }"],
    [".app-kpis", ".app-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--app-space-3, 12px); }"],
    [".app-kpi", ".app-kpi { --app-accent: var(--ion-color-primary, #2563eb); --app-accent-rgb: var(--ion-color-primary-rgb, 37,99,235); padding: var(--app-space-4, 16px); " +
      "border-radius: var(--app-radius-lg, 12px); background: " + SURFACE + "; border: " + BORDER + "; border-left: 4px solid var(--app-accent); box-shadow: var(--app-shadow-sm, none); }"],
    [".app-kpi.app-kpi-iconed", ".app-kpi.app-kpi-iconed { display: grid; grid-template-columns: auto 1fr; grid-template-areas: \"icon value\" \"icon label\"; column-gap: var(--app-space-3, 12px); align-items: center; }"],
    [".app-kpi-icon", ".app-kpi-icon { grid-area: icon; width: 44px; height: 44px; padding: 11px; box-sizing: border-box; font-size: 22px; border-radius: var(--app-radius, 10px); " +
      "color: var(--app-accent, var(--ion-color-primary)); background: rgba(var(--app-accent-rgb, var(--ion-color-primary-rgb)), 0.12); }"],
    [".app-kpi-value", ".app-kpi-value { grid-area: value; display: block; font-size: var(--app-font-size-2xl, 28px); font-weight: 700; line-height: 1.15; font-variant-numeric: tabular-nums; }"],
    [".app-kpi-label", ".app-kpi-label { grid-area: label; display: block; margin-top: var(--app-space-1, 4px); font-size: var(--app-font-size-sm, 14px); color: " + MUTED + "; }"]
  ].concat(ACCENTS.map(function (c) {
    return [".app-accent-" + c, ".app-accent-" + c + " { --app-accent: var(--ion-color-" + c + "); --app-accent-rgb: var(--ion-color-" + c + "-rgb); }"];
  })).concat([
    [".app-list", ".app-list { margin: 0; padding: 0; background: " + SURFACE + "; border: " + BORDER + "; border-radius: var(--app-radius-lg, 12px); overflow: hidden; box-shadow: var(--app-shadow-sm, none); }"],
    [".app-list ion-item", ".app-list ion-item { --min-height: var(--app-row-height, 52px); }"],
    [".app-list ion-note", ".app-list ion-note { font-size: var(--app-font-size-sm, 14px); }"],
    // Label and value: the value is what the reader looks for, the label stays muted. :root and the class outrank Ionic's
    // scoped label color (.item .sc-ion-label-md-h) and TailwindTheme's dark label color.
    [".app-fields ion-note", ".app-fields ion-note { color: var(--ion-text-color, inherit); font-size: var(--app-font-size-base, 16px); font-weight: 600; }\n" +
      ":root .app-fields ion-label.app-field-label { color: " + MUTED + "; font-size: var(--app-font-size-sm, 14px); }"],
    [".app-form", ".app-form { max-width: 720px; padding: var(--app-space-4, 16px); background: " + SURFACE + "; border: " + BORDER + "; border-radius: var(--app-radius-lg, 12px); }"],
    [".app-form > ion-button", ".app-form > ion-button { margin: var(--app-space-4, 16px) var(--app-space-2, 8px) 0 0; }"],
    [".app-actions", ".app-actions { display: flex; flex-wrap: wrap; gap: var(--app-space-2, 8px); margin-top: var(--app-space-4, 16px); }"],
    [".app-empty-state", ".app-empty-state { display: flex; flex-direction: column; align-items: center; gap: var(--app-space-2, 8px); padding: var(--app-space-6, 32px) var(--app-space-4, 16px); " +
      "text-align: center; border: 1px dashed var(--app-border, var(--ion-border-color, rgba(127,127,127,0.3))); border-radius: var(--app-radius-lg, 12px); background: var(--app-surface-2, transparent); }"],
    [".app-empty-icon", ".app-empty-icon { font-size: 40px; color: var(--ion-color-primary, #2563eb); opacity: 0.75; }"],
    [".app-empty", ".app-empty { margin: 0; color: " + MUTED + "; }"],
    [".app-field-empty", ".app-field-empty { margin: var(--app-space-1, 4px) 0 var(--app-space-3, 12px); font-size: var(--app-font-size-sm, 14px); color: var(--ion-color-danger, #c0392b); }"],
    [".app-error", ".app-error { color: var(--ion-color-danger, #c0392b); padding: var(--app-space-3, 12px) var(--app-space-4, 16px); margin: 0 0 var(--app-space-4, 16px); " +
      "background: rgba(var(--ion-color-danger-rgb, 192,57,43), 0.08); border: 1px solid rgba(var(--ion-color-danger-rgb, 192,57,43), 0.25); border-radius: var(--app-radius, 8px); }"],
    [".app-badge", ".app-badge { margin-inline: var(--app-space-2, 8px); padding: 4px 10px; border-radius: 999px; font-size: var(--app-font-size-xs, 12px); font-weight: 600; letter-spacing: 0.01em; }"],
    // A colored badge is a soft pill: its color at 14 % behind a darker (light theme) or lighter (dark theme) text.
    ["ion-badge.app-badge.ion-color", "ion-badge.app-badge.ion-color { background: rgba(var(--ion-color-base-rgb), 0.14); color: color-mix(in srgb, var(--ion-color-base) 70%, #000); }\n" +
      ":root.force-dark ion-badge.app-badge.ion-color { color: color-mix(in srgb, var(--ion-color-base) 75%, #fff); }\n" +
      "@media (prefers-color-scheme: dark) { :root:not(.force-light) ion-badge.app-badge.ion-color { color: color-mix(in srgb, var(--ion-color-base) 75%, #fff); } }"],
    // Table layout of a list with columns: a header row and aligned cells on a wide screen, label and value lines on a phone.
    [".app-row", ".app-row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px var(--app-space-4, 16px); align-items: center; width: 100%; padding: var(--app-space-1, 4px) 0; }"],
    // break-word, not anywhere: a date or a status in a narrow column broke letter by letter (run 3).
    [".app-cell", ".app-cell { min-width: 0; overflow-wrap: break-word; }\n" +
      ".app-cell:not(.app-cell-main) { display: flex; justify-content: space-between; gap: var(--app-space-3, 12px); }\n" +
      ".app-cell:not(.app-cell-main)[data-label]::before { content: attr(data-label); color: " + MUTED + "; font-size: var(--app-font-size-sm, 14px); }"],
    [".app-cell-main", ".app-cell-main { font-weight: 600; }"],
    [".app-cell-sub", ".app-cell-sub { display: block; font-weight: 400; font-size: var(--app-font-size-sm, 14px); color: " + MUTED + "; }"],
    [".app-table-head", ".app-table-head { display: none; --detail-icon-opacity: 0; }"],
    // The AG Grid of a grid list: its quartz theme takes the AppTheme tokens, so it follows the app's light or dark mode.
    [".app-grid", ".app-grid { margin: 0; }\n" +
      ".app-grid .ag-theme-quartz { --ag-font-family: var(--ion-font-family, inherit); --ag-font-size: var(--app-font-size-sm, 14px); " +
      "--ag-foreground-color: var(--ion-text-color, #0f172a); --ag-data-color: var(--ion-text-color, #0f172a); --ag-secondary-foreground-color: " + MUTED + "; " +
      "--ag-background-color: " + SURFACE + "; --ag-odd-row-background-color: " + SURFACE + "; " +
      "--ag-header-background-color: var(--app-surface-2, var(--ion-background-color-step-50, #f4f5f7)); --ag-header-foreground-color: var(--ion-text-color, #0f172a); " +
      "--ag-control-panel-background-color: var(--app-surface-2, var(--ion-background-color-step-50, #f4f5f7)); " +
      "--ag-border-color: var(--app-border, var(--ion-border-color, rgba(127,127,127,0.2))); --ag-row-border-color: var(--app-border, var(--ion-border-color, rgba(127,127,127,0.2))); " +
      "--ag-secondary-border-color: var(--app-border, var(--ion-border-color, rgba(127,127,127,0.2))); --ag-header-column-separator-color: var(--app-border, var(--ion-border-color, rgba(127,127,127,0.2))); " +
      "--ag-input-border-color: var(--app-border, var(--ion-border-color, rgba(127,127,127,0.3))); " +
      "--ag-row-hover-color: rgba(var(--ion-color-primary-rgb, 37,99,235), 0.06); --ag-selected-row-background-color: rgba(var(--ion-color-primary-rgb, 37,99,235), 0.12); " +
      "--ag-active-color: var(--ion-color-primary, #2563eb); --ag-input-focus-border-color: var(--ion-color-primary, #2563eb); " +
      "--ag-range-selection-border-color: var(--ion-color-primary, #2563eb); --ag-checkbox-checked-color: var(--ion-color-primary, #2563eb); " +
      "--ag-modal-overlay-background-color: rgba(var(--ion-background-color-rgb, 255,255,255), 0.66); " +
      "--ag-wrapper-border-radius: var(--app-radius-lg, 12px); --ag-border-radius: var(--app-radius-sm, 6px); }\n" +
      ".app-grid-clickable .ag-row { cursor: pointer; }\n" +
      ".app-grid .app-grid-badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: var(--app-font-size-xs, 12px); font-weight: 600; line-height: 1.6; }"],
    // Ionic stretches a checkbox in an item over the whole row (it acts as the row's label): it pushed the texts to the middle.
    [".app-has-select ion-checkbox.in-item", ".app-has-select ion-checkbox.in-item { flex: 0 0 auto; width: auto; margin-inline-end: var(--app-space-3, 12px); }\n" +
      ".app-table ion-checkbox.in-item { margin-inline-end: 0; }"],
    [".app-has-select .app-row", ".app-has-select .app-row { grid-template-columns: 24px minmax(0, 1fr); }\n" +
      ".app-has-select .app-row > :not(ion-checkbox) { grid-column: 2; }"],
    ["@media (min-width: 768px) { .app-table-head", "@media (min-width: 768px) { .app-table-head { display: block; --background: var(--app-surface-2, transparent); } " +
      ".app-table-head .app-cell { font-size: var(--app-font-size-xs, 12px); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: " + MUTED + "; } " +
      ".app-cell:not(.app-cell-main) { display: block; } .app-cell:not(.app-cell-main)[data-label]::before { content: none; } " +
      ".app-has-select .app-row > :not(ion-checkbox) { grid-column: auto; } " +
      [2, 3, 4, 5, 6, 7, 8].map(function (n) {
        var cols = "minmax(0, 2fr) repeat(" + (n - 1) + ", minmax(0, 1fr))";
        return ".app-cols-" + n + " { grid-template-columns: " + cols + "; } .app-has-select .app-cols-" + n + " { grid-template-columns: 24px " + cols + "; }";
      }).join(" ") + " }"]
  ]);

  function nx(bean, name, props, children) {
    var node = { className: "ngx.components.UIDynamicElement#" + bean, name: name, properties: props || {} };
    if (children && children.length) {
      node.children = children;
    }
    return node;
  }

  function nxAction(bean, name, props, children) {
    var node = { className: "ngx.components.UIDynamicAction#" + bean, name: name, properties: props || {} };
    if (children && children.length) {
      node.children = children;
    }
    return node;
  }

  function txt(value, name) {
    return { className: "ngx.components.UIText#UIText", name: name || "Text", properties: { textValue: { mode: "PLAIN", value: String(value) } } };
  }

  function expr(value, name) {
    return { className: "ngx.components.UIText#UIText", name: name || "Text", properties: { textValue: { mode: "SCRIPT", value: String(value) } } };
  }

  function cls(value) {
    return { className: "ngx.components.UIAttribute#UIAttribute", name: "Attr_class", properties: { attrName: "class", attrValue: { mode: "PLAIN", value: value } } };
  }

  function attr(attrName, nodeName, value) {
    return { className: "ngx.components.UIAttribute#UIAttribute", name: nodeName, properties: { attrName: attrName, attrValue: { mode: "SCRIPT", value: value } } };
  }

  function plainAttr(attrName, nodeName, value) {
    return { className: "ngx.components.UIAttribute#UIAttribute", name: nodeName, properties: { attrName: attrName, attrValue: { mode: "PLAIN", value: String(value) } } };
  }

  // The menu adds -outline (iOS) or -sharp (Android) to a page icon: a page icon is the base ionicons name. Other icons
  // keep their name; only a name made of lower-case words joined by dashes is accepted.
  function menuIcon(name) {
    var n = str(name).trim().toLowerCase();
    return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(n) ? n : "";
  }

  // The classes a generated tree uses (its class attributes).
  function usedClasses(node, out) {
    out = out || {};
    if (node && /UIAttribute/.test(String(node.className)) && node.properties && node.properties.attrName === "class") {
      String(node.properties.attrValue && node.properties.attrValue.value || "").split(/\s+/).forEach(function (c) {
        if (c.length) {
          out[c] = true;
        }
      });
    }
    ((node && node.children) || []).forEach(function (child) { usedClasses(child, out); });
    return out;
  }

  // Words of a status code or label and the color they mean, in the languages the apps are written in. Checked in this
  // order: a word of a later group inside an earlier phrase ("non conforme", "pas a jour") is the earlier group's.
  var STATUS_WORDS = [
    ["medium", ["inactive", "inactif", "inactiv", "archived", "archive", "archivee", "disabled", "desactive", "desactivee", "deactivated", "suspended", "suspendu",
      "closed", "ferme", "fermee", "clos", "close", "cancelled", "canceled", "annule", "annulee", "unknown", "inconnu", "none", "aucun", "n a"]],
    ["danger", ["late", "overdue", "retard", "en retard", "error", "erreur", "failed", "failure", "echec", "echoue", "rejected", "rejete", "rejetee", "refused", "refuse",
      "refusee", "denied", "ko", "expired", "expire", "expiree", "blocked", "bloque", "bloquee", "critical", "critique", "urgent", "missing", "manquant", "lost", "perdu",
      "non conforme", "not compliant", "non compliant", "pas a jour", "not up to date", "out of date", "outdated", "obsolete", "hors delai", "invalid", "invalide",
      "depasse", "depassee", "exceeded"]],
    ["warning", ["pending", "en attente", "attente", "waiting", "to do", "todo", "a faire", "draft", "brouillon", "soon", "bientot", "a venir", "upcoming", "due", "echeance",
      "in progress", "en cours", "ongoing", "review", "a valider", "to validate", "to review", "a verifier", "partial", "partiel", "partielle", "warning", "attention",
      "reminder", "relance", "a relancer", "to remind", "reserved", "reserve", "reservee", "on hold", "submitted", "soumis", "new request"]],
    ["success", ["ok", "done", "fait", "active", "actif", "valid", "valide", "validee", "approved", "approuve", "approuvee", "accepted", "accepte", "acceptee",
      "completed", "complete", "termine", "terminee", "paid", "paye", "payee", "up to date", "a jour", "published", "publie", "publiee", "delivered", "livre", "livree",
      "available", "disponible", "success", "succes", "reussi", "resolved", "resolu", "compliant", "conforme", "signed", "signe", "returned", "rendu", "yes", "oui"]],
    ["primary", ["open", "ouvert", "ouverte", "new", "nouveau", "nouvelle", "info", "information", "planned", "planifie", "scheduled", "programme",
      "on loan", "en pret", "prete", "borrowed", "emprunte", "in use", "en service", "assigned", "assigne", "affecte"]]
  ];

  function statusWords(text) {
    var plain = String(text || "").toLowerCase();
    try {
      plain = String(java.text.Normalizer.normalize(plain, java.text.Normalizer.Form.NFD)).replace(/[\u0300-\u036f]/g, "");
    } catch (_noJava) {
      plain = typeof plain.normalize === "function" ? plain.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : plain;
    }
    return " " + plain.replace(/[^a-z0-9]+/g, " ").trim() + " ";
  }

  G.statusColor = function (code, label) {
    var words = statusWords(code + " " + (label || ""));
    for (var g = 0; g < STATUS_WORDS.length; g++) {
      for (var w = 0; w < STATUS_WORDS[g][1].length; w++) {
        if (words.indexOf(" " + STATUS_WORDS[g][1][w] + " ") >= 0) {
          return STATUS_WORDS[g][0];
        }
      }
    }
    return "";
  };

  // A color per code of a labels map; a code no word explains takes the next accent, so two of them never look alike.
  G.statusColors = function (labels) {
    var out = {};
    var spare = ["primary", "tertiary", "secondary"];
    var next = 0;
    Object.keys(labels).forEach(function (code) {
      out[code] = G.statusColor(code, labels[code]) || spare[next++ % spare.length];
    });
    return out;
  };

  function directive(name, kind, props, children) {
    var p = props || {};
    p.directiveName = kind;
    return { className: "ngx.components.UIControlDirective#UIControlDirective", name: name, properties: p, children: children || [] };
  }

  function ifDirective(name, expression, children) {
    return directive(name, "If", { directiveExpression: expression }, children);
  }

  function forEach(name, localPath, item, children) {
    return directive(name, "ForEach", { directiveSource: { mode: "SOURCE", local: localPath }, directiveItemName: item, directiveIndexName: "index" }, children);
  }

  function controlEvent(name, eventName, children) {
    var props = { eventName: eventName };
    if (eventName === "onSubmit") {
      props.attrName = "(ngSubmit)";
    }
    return { className: "ngx.components.UIControlEvent#UIControlEvent", name: name, properties: props, children: children || [] };
  }

  function setLocal(name, property, value) {
    return nxAction("SetLocalAction", name, { Property: { mode: "PLAIN", value: property }, Value: { mode: "SCRIPT", value: value } });
  }

  // A value set deep in an action chain (under an IfAction, after a call) showed only at the next change detection: the
  // form's error stayed hidden after a refusal (runs 9b and 10). The same custom action the guide gives renders it now.
  function refreshView(name) {
    return { className: "ngx.components.UICustomAction#UICustomAction", name: name || "RefreshView",
      properties: { actionValue: "page.ref.detectChanges(); resolve(true);" } };
  }

  function heading(name, level, value, mode) {
    return nx("Heading" + level, name, {}, [mode === "SCRIPT" ? expr(value) : txt(value)]);
  }

  function field(path, item) {
    var p = str(path).replace(/^\.+/, "");
    // A path that already starts with the item name ("p.numeroPoste" with item p) is not prefixed twice.
    var itemName = String(item).replace(/\?/g, "").split(".").pop();
    if (itemName && p.indexOf(itemName + ".") === 0) {
      p = p.substring(itemName.length + 1);
    }
    return item + "?." + p.split(".").join("?.");
  }

  function localPath(path) {
    return "local?." + str(path).replace(/^\.+/, "").split(".").join("?.");
  }

  // Display value of a record field: optional labels map (status codes) as a ternary chain.
  function valueExpr(base, spec) {
    var f = isObj(spec) ? spec : { field: spec };
    var value = base(f.field);
    if (isObj(f.labels)) {
      var chain = "";
      Object.keys(f.labels).forEach(function (k) {
        chain += value + " === " + jsString(k) + " ? " + jsString(f.labels[k]) + " : ";
      });
      return "(" + chain + "(" + value + " ?? ''))";
    }
    // Prefix and suffix keep their spaces ("Due " + date).
    var prefix = f.prefix != null ? String(f.prefix) : "";
    var suffix = f.suffix != null ? String(f.suffix) : "";
    if (prefix.length || suffix.length) {
      return jsString(prefix) + " + (" + value + " ?? '') + " + jsString(suffix);
    }
    return "(" + value + " ?? '')";
  }

  function colorExpr(value, colors) {
    var chain = "";
    Object.keys(colors).forEach(function (k) {
      chain += value + " === " + jsString(k) + " ? " + jsString(colors[k]) + " : ";
    });
    return chain + "'medium'";
  }

  function uniqueName(base, used) {
    var name = base.replace(/[^A-Za-z0-9_]/g, "");
    if (!name.length || !/^[A-Za-z_]/.test(name)) {
      name = "N" + name;
    }
    var candidate = name;
    var i = 2;
    while (used[candidate]) {
      candidate = name + i++;
    }
    used[candidate] = true;
    return candidate;
  }

  function pascal(text) {
    return str(text).replace(/[^A-Za-z0-9]+(.)?/g, function (_m, c) { return c ? c.toUpperCase() : ""; }).replace(/^./, function (c) { return c.toUpperCase(); });
  }

  // Variables of a business sequence, to give every one of them explicitly on each call.
  function sequenceVariables(projectDbo, seqName) {
    var seq = childNamed(projectDbo, seqName);
    return seq ? variableNames(seq) : null;
  }

  function callVariable(name, value) {
    return { className: "ngx.components.UIControlVariable#UIControlVariable", name: name, properties: { varValue: value } };
  }

  // Navigation action from {page, kind: push|root|pop, data: {param: "TS expression"}}. On a list row a bare field name is
  // the row's field: scope.<item> in a ForEach, rowBase (the row of a grid event, event?.data?.) otherwise.
  function navAction(name, nav, scopeItem, rowBase) {
    var kind = str(nav.kind || nav.mode || "push");
    if (kind === "pop") {
      return nxAction("PopPageAction", name, {});
    }
    var props = { page: { mode: "PLAIN", value: str(nav.page) } };
    if (isObj(nav.data) && Object.keys(nav.data).length) {
      props.data = { mode: "SCRIPT", value: "{" + Object.keys(nav.data).map(function (k) {
        var v = str(nav.data[k]);
        // {id: "id"} on a list row means the row field.
        if (rowBase && IDENT.test(v)) {
          v = rowBase + v;
        } else if (scopeItem && IDENT.test(v)) {
          v = "scope." + scopeItem + "?." + v;
        }
        return k + ": " + v;
      }).join(", ") + "}" };
    }
    return nxAction(kind === "root" ? "RootPageAction" : "PushPageAction", name, props);
  }

  // The auto menu shows a page through the translate pipe with a key made from its title, every character that is not an
  // ASCII letter or digit turned into "_" ("Sélection" -> "S_lection"). A key missing from the i18n files shows as is, so
  // an accented title read "S_lection" in the menu. The key is added, with the title as value, to each i18n file without it.
  G.menuTitleKey = function (title) {
    return String(title).replace(/[^A-Za-z0-9]/g, "_");
  };

  G.addMenuTranslation = function (projectDbo, title) {
    var key = G.menuTitleKey(title);
    var result = { key: key, added: [] };
    if (key === String(title)) {
      return result;
    }
    try {
      var dir = new java.io.File(String(projectDbo.getDirPath()), "DisplayObjects/mobile/assets/i18n");
      var files = dir.isDirectory() ? dir.listFiles() : null;
      for (var i = 0; files && i < files.length; i++) {
        var name = String(files[i].getName());
        if (!/\.json$/.test(name)) {
          continue;
        }
        var text = String(new java.lang.String(java.nio.file.Files.readAllBytes(files[i].toPath()), "UTF-8"));
        var json = JSON.parse(text);
        if (json[key] !== undefined) {
          continue;
        }
        json[key] = String(title);
        java.nio.file.Files.write(files[i].toPath(), new java.lang.String(JSON.stringify(json, null, 2) + "\n").getBytes("UTF-8"));
        result.added.push(name);
      }
    } catch (i18nError) {
      result.error = String(i18nError && i18nError.message ? i18nError.message : i18nError);
    }
    return result;
  };

  // The pages of the application and its entry page (isRoot): the app opens on it.
  function appPages(app) {
    var out = [];
    var children = app.getAllChildren();
    for (var i = 0; i < children.size(); i++) {
      var child = children.get(i);
      if (/PageComponent/.test(String(child.getClass().getName()))) {
        out.push(child);
      }
    }
    return out;
  }

  function isRootPage(page) {
    try {
      return page.isRoot === true || String(page.isRoot) === "true";
    } catch (_noRoot) {
      return false;
    }
  }

  // The starter's own page (Page, "Default home page"), which apps delete once they have theirs.
  function isStarterPage(page) {
    var comment = "";
    try {
      comment = str(page.getComment());
    } catch (_noComment) {}
    return String(page.getName()) === "Page" && /^Default home page$/i.test(comment);
  }

  // A library a generated page uses: referenced by the app already, else imported from the marketplace when the workspace
  // lacks it, then referenced (marketplace-import does the same). Returns {library, status, sharedComponent} with the
  // QName of the shared component the page binds, or {error}.
  G.ensureLibrary = function (projectDbo, library, component) {
    if (!C8O.marketplace || typeof C8O.marketplace.importLibrary !== "function") {
      include("js/marketplace.js");
    }
    var M = C8O.marketplace;
    var appName = String(projectDbo.getName());
    var status = "referenced";
    try {
      var refs = M.getProjectReferenceMap(projectDbo);
      if (!(refs && refs.lower && refs.lower[library.toLowerCase()])) {
        var loadedBefore = M.resolveProject(library) != null;
        var imported = M.importLibrary({ project: library, save: true, forceImport: false });
        if (!imported || imported.status !== "ready") {
          return { library: library, error: library + " could not be imported from the marketplace (" +
            str(imported && (imported.importMessage || imported.status)) + ")." };
        }
        var ref = M.addReference(appName, library, imported.projectUrl);
        if (!ref.referenceAdded && !ref.referenceAlready) {
          return { library: library, error: "the reference to " + library + " could not be added to " + appName + ": " + (ref.warnings || []).join(" ") };
        }
        status = loadedBefore ? "reference added" : "imported and referenced";
      }
      var libProject = M.resolveProject(library);
      var libApp = libProject ? libProject.getMobileApplication().getApplicationComponent() : null;
      var shared = libApp ? childNamed(libApp, component) : null;
      if (!shared) {
        return { library: library, error: library + " has no shared component " + component + "." };
      }
      return { library: library, status: status, sharedComponent: qnameOf(shared) };
    } catch (e) {
      return { library: library, error: library + ": " + String(e && e.message ? e.message : e) };
    }
  };

  G.ngxPageCreate = function (args) {
    var tool = "ngx-page-create";
    var projectDbo = projectOf(args.project, tool);
    var projectName = String(projectDbo.getName());
    var errors = [];
    var warnings = [];
    // A text the spec leaves out gets an English default: an app in another language must give it.
    var defaulted = [];
    var textOr = function (value, fallback, field) {
      var given = str(value);
      if (given.length) {
        return given;
      }
      if (defaulted.indexOf(field + " \"" + fallback + "\"") < 0) {
        defaulted.push(field + " \"" + fallback + "\"");
      }
      return fallback;
    };
    var spec = parseJson(args.spec, "spec", "object") || {};
    ["name", "title", "kind", "sequence", "facade", "authRedirect", "root", "inMenu", "params", "vars", "filters", "list", "detail", "form", "dashboard", "actions", "heading",
      "authCodes", "segment", "icon", "filterLabel", "locals", "home", "comment", "theme"].forEach(function (k) {
      if (spec[k] === undefined && args[k] !== undefined && args[k] !== null && str(args[k]) !== "") {
        var raw = args[k];
        spec[k] = (["name", "title", "kind", "sequence", "facade", "authRedirect", "heading", "segment", "icon", "filterLabel"].indexOf(k) >= 0) ? str(raw) : parseJson(raw, k, "string");
      }
    });
    var app = null;
    try {
      app = projectDbo.getMobileApplication().getApplicationComponent();
    } catch (_noApp) {
      app = null;
    }
    if (app == null) {
      invalid(tool, [projectName + " has no NGX application (start from template_ngxBuilderIonic with marketplace-import)."]);
    }
    var appQName = qnameOf(app);
    var name = str(spec.name);
    var kind = str(spec.kind);
    var title = str(spec.title) || name;
    if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
      errors.push("name must be a PascalCase page name (for example ManageOrders).");
    } else if (childNamed(app, name)) {
      errors.push("page " + name + " already exists: delete it first, or pick another name.");
    }
    if (["list", "detail", "form", "dashboard"].indexOf(kind) < 0) {
      errors.push("kind must be list, detail, form or dashboard.");
    }
    // sequence: the business sequence the page calls at page enter (facade is its former name).
    var facade = str(spec.sequence) || str(spec.facade);
    var facadeVars = null;
    if (facade.length) {
      facadeVars = sequenceVariables(projectDbo, facade);
      if (facadeVars === null) {
        errors.push("sequence " + facade + " is not a sequence of " + projectName + ": create it first (business-sequence-create).");
      }
    } else if (kind !== "form" && !(kind === "detail" && !(isObj(spec.detail) && list(spec.detail.fields).length))) {
      errors.push("sequence is required for a " + kind + " page: the business sequence the page calls at page enter " +
        "(a page with only a heading and buttons, such as a login or home page, is a detail page without sequence nor detail).");
    }
    // theme: the tokens of ngx-theme-apply, written to AppTheme with this page (checked before anything is created).
    var themeSpec = spec.theme;
    if (themeSpec !== undefined) {
      if (!isObj(themeSpec)) {
        errors.push("theme must be an object: {preset, primary, secondary, tertiary, radius, density, toolbar, mode, font, appName} (see ngx-theme-apply).");
        themeSpec = undefined;
      } else {
        var themeErrors = [];
        G.themeTokens(themeSpec, themeErrors);
        themeErrors.forEach(function (e) { errors.push("theme: " + e); });
      }
    }
    var params = list(spec.params).map(str);
    params.forEach(function (p) {
      if (!IDENT.test(p)) {
        errors.push("params entry " + p + " must be an identifier (a navParams data key copied into a local at page enter).");
      }
    });
    var vars = isObj(spec.vars) ? spec.vars : {};
    var filters = list(spec.filters);
    var authCodes = list(spec.authCodes || ["UNAUTHENTICATED"]).map(str);
    var authRedirect = str(spec.authRedirect);
    var used = {};
    // Badge colors read from the status words, given back so the agent can check them (list.badge.colors overrides).
    var derivedColors = {};
    // The paths of the page data are read in the data of the business sequence's answer (out.data, kept in local.data):
    // "items", not "data.items", which bound local?.data?.data?.items (run 3, F-P-19). A path written from out, local or
    // data comes back to that base and says so; the answer gives each binding made (bindings).
    var bindings = {};
    function dataPath(path, label) {
      var raw = str(path).replace(/\?\./g, ".").replace(/^\.+/, "");
      var m = /^(?:c8oPage\.)?(?:local\.|out\.)?data\.(.+)$/.exec(raw);
      if (m) {
        warnings.push(label + " \"" + str(path) + "\": the paths are read in the data of the answer of " + (facade || "the page sequence") +
          ", so \"" + m[1] + "\" (" + localPath("data." + m[1]) + ").");
        raw = m[1];
      }
      bindings[label] = localPath("data." + raw);
      return raw;
    }
    // pageWillEnter sets these locals while Angular checks the page that the menu or a link opens: a binding whose value
    // changes then (undefined -> null) throws NG0100 in dev on every generated page (run 9a). The conditions are written so
    // that the first render already reads the values set here: !!local?.error, and an unset loading counts as loading.
    // On a page entered again (back, menu) the view still shows the previous data: setting data to null there threw NG0100
    // (Previous value: '7', run 10). These locals keep their value on re-entry until the data call replaces them.
    var locals = { data: "c8oPage.local?.data ?? null", error: "c8oPage.local?.error ?? null", loading: "c8oPage.local?.loading ?? true" };
    // The lists built as an AG Grid, each with its native blocks: an automatic grid falls back to them when the library
    // cannot be had. A native table where a grid fits gets a hint naming the library.
    var gridPlans = [];
    var gridHints = [];
    params.forEach(function (p) {
      locals[p] = "c8oPage.navParams?.data?." + p + " != null ? '' + c8oPage.navParams.data." + p + " : ''";
    });
    if (spec.locals !== undefined) {
      if (!isObj(spec.locals)) {
        errors.push("locals must be an object {local: \"TypeScript expression\"} evaluated at page enter.");
      } else {
        Object.keys(spec.locals).forEach(function (l) {
          if (!IDENT.test(l)) {
            errors.push("locals." + l + " must be an identifier.");
          }
          locals[l] = String(spec.locals[l]);
        });
      }
    }
    var filterNodes = [];
    filters.forEach(function (f, i) {
      if (!isObj(f) || !IDENT.test(str(f.name))) {
        errors.push("filters[" + i + "] must be {name, label, type?: text|search|select|toggle, options?, optionsFrom?}.");
        return;
      }
      if (facadeVars && facadeVars.indexOf(str(f.name)) < 0) {
        errors.push("filters[" + i + "].name " + f.name + " is not a variable of " + facade + " (" + facadeVars.join(", ") + ").");
      }
      var localName = "filter" + upperFirst(str(f.name));
      locals[localName] = "c8oPage.local?." + localName + " ?? " + (f.value !== undefined ? jsString(String(f.value)) : "''");
      var type = str(f.type || "search");
      var item = uniqueName("Fi" + pascal(f.name), used);
      var control;
      var common = { ControlName: { mode: "PLAIN", value: localName }, Label: { mode: "PLAIN", value: str(f.label) || str(f.name) },
        LabelPlacement: { mode: "PLAIN", value: "stacked" }, DoubleBinding: { mode: "SOURCE", local: localName } };
      if (type === "select") {
        var options = list(f.options).map(function (o, oi) {
          var opt = isObj(o) ? o : { value: o, label: o };
          return nx("SelectOption", "Opt" + oi, { Value: { mode: "PLAIN", value: String(opt.value) } }, [txt(str(opt.label) || String(opt.value))]);
        });
        // Options read from the page data (a list of RPCA, of services...), after the fixed ones such as {value:"", label:"Tous"}.
        if (isObj(f.optionsFrom)) {
          var fsrc = f.optionsFrom;
          var fit = str(fsrc.item || "opt");
          var flabel = fsrc.label !== undefined ? fsrc.label : "label";
          var filterOptions = dataPath(fsrc.items || "items", "filters[" + i + "].optionsFrom.items");
          options.push(forEach("Each" + pascal(f.name), "data." + filterOptions, fit, [nx("SelectOption", "Opt",
            { Value: { mode: "SCRIPT", value: "'' + " + field(fsrc.value || "id", fit) } },
            [expr(valueExpr(function (p) { return field(p, fit); }, flabel))])]));
        }
        if (!options.length) {
          errors.push("filters[" + i + "] is a select without options or optionsFrom.");
        }
        common.Interface = { mode: "PLAIN", value: "popover" };
        control = nx("Select", "Sel" + pascal(f.name), common, options);
      } else {
        common.Type = { mode: "PLAIN", value: type === "text" ? "text" : (type === "date" ? "date" : "search") };
        control = nx("Input", "In" + pascal(f.name), common);
      }
      filterNodes.push(nx("FormItem", item, {}, [cls("app-filter"), control]));
    });
    Object.keys(vars).forEach(function (v) {
      if (facadeVars && facadeVars.indexOf(v) < 0) {
        errors.push("vars." + v + " is not a variable of " + facade + " (" + facadeVars.join(", ") + ").");
      }
    });

    // Variables of the data call: filters, params, explicit vars, else '' (every variable explicit).
    function dataCallVariables() {
      return (facadeVars || []).map(function (v) {
        if (vars[v] !== undefined) {
          return callVariable(v, { mode: "SCRIPT", value: String(vars[v]) });
        }
        var filter = filters.filter(function (f) { return isObj(f) && str(f.name) === v; })[0];
        if (filter) {
          return callVariable(v, { mode: "SOURCE", local: "filter" + upperFirst(v) });
        }
        if (params.indexOf(v) >= 0) {
          return callVariable(v, { mode: "SOURCE", local: v });
        }
        return callVariable(v, { mode: "SCRIPT", value: "''" });
      });
    }

    function authBranch(name) {
      var cond = "!out?.success && (" + JSON.stringify(authCodes).replace(/"/g, "'") + ".indexOf(out?.errors?.[0]?.code) >= 0 || JSON.stringify(out ?? '').indexOf('Authentication required') >= 0)";
      return nxAction("IfAction", name, { condition: { mode: "SCRIPT", value: cond } }, [navAction("GoEntry", { page: authRedirect, kind: "root" })]);
    }

    function dataCall(name, cacheTtl) {
      var children = dataCallVariables();
      children.push(setLocal("StoreData", "data", "out?.success ? (out?.data ?? null) : null"));
      children.push(setLocal("StoreError", "error", "out?.success ? null : (out?.errors?.[0]?.message || 'Error')"));
      var stopLoading = setLocal("StopLoading", "loading", "false");
      stopLoading.children = [refreshView()];
      children.push(stopLoading);
      if (authRedirect.length) {
        children.push(authBranch("IfSessionLost"));
      }
      var props = { requestable: { mode: "PLAIN", value: projectName + "." + facade } };
      if (cacheTtl !== undefined) {
        props.cacheTtl = { mode: "PLAIN", value: String(cacheTtl) };
      }
      return nxAction("CallSequenceAction", name, props, children);
    }

    if (authRedirect.length && !childNamed(app, authRedirect)) {
      warnings.push("authRedirect " + authRedirect + " is not a page of " + projectName + " yet: create it before the build.");
    }

    // Record list: List > ForEach > ListItem > Label (h3 + p) + Note + Badge; with columns, a table: a header row and one
    // row of aligned cells per record on a wide screen, label and value lines on a phone.
    function recordList(prefix, spec2, label) {
      if (!isObj(spec2)) {
        errors.push(label + " must be an object.");
        return [];
      }
      var item = str(spec2.item || "row");
      var itemsPath = "data." + dataPath(spec2.items || "items", label + ".items");
      if (!IDENT.test(item)) {
        errors.push(label + ".item must be an identifier.");
      }
      if (!str(spec2.title).length && !isObj(spec2.title)) {
        errors.push(label + ".title is required (the main field of a row).");
      }
      var rowField = function (f) { return field(f, item); };
      var badgeNode = null;
      if (spec2.badge !== undefined) {
        var badge = isObj(spec2.badge) ? spec2.badge : { field: spec2.badge };
        // Without colors, the codes of labels get the color their words say (G.statusColor); colors overrides it.
        var badgeColors = isObj(badge.colors) ? badge.colors : (isObj(badge.labels) ? G.statusColors(badge.labels) : null);
        if (badgeColors && !isObj(badge.colors)) {
          derivedColors[label + ".badge"] = badgeColors;
        }
        var badgeChildren = [cls("app-badge"), expr(valueExpr(rowField, badge))];
        if (badgeColors) {
          badgeChildren.push(attr("[color]", "Attr_color", colorExpr(rowField(badge.field), badgeColors)));
        }
        // A row without the field showed an empty grey pill (run 3, F-P-18): no value, no badge.
        badgeChildren.push(attr("[hidden]", "Attr_hidden", "(" + rowField(badge.field) + " ?? '') === ''"));
        badgeNode = nx("Badge", "Status", {}, badgeChildren);
      }
      var columns = spec2.columns;
      if (columns !== undefined && (!Array.isArray(columns) || !columns.length)) {
        errors.push(label + ".columns must be a non-empty array of {label, field, labels?, prefix?, suffix?}.");
        columns = undefined;
      }
      var rowChildren;
      var head = null;
      // The columns once the duplicates of the title, subtitle, note and badge are left out: the native table and the grid
      // show the same cells (F-P-16).
      var table = null;
      if (columns === undefined) {
        var labelChildren = [nx("Heading3", "Main", {}, [expr(valueExpr(rowField, spec2.title))])];
        if (spec2.subtitle !== undefined) {
          labelChildren.push(nx("Paragraph", "Second", {}, [expr(valueExpr(rowField, spec2.subtitle))]));
        }
        rowChildren = [nx("Label", "Lb", {}, labelChildren)];
        if (badgeNode) {
          rowChildren.push(badgeNode);
        }
        if (spec2.note !== undefined) {
          rowChildren.push(nx("Note", "Nt", { IonSlot: { mode: "PLAIN", value: "end" } }, [expr(valueExpr(rowField, spec2.note))]));
        }
      } else {
        // Columns that repeated the title, the subtitle, the note or the status made duplicate cells, cells without header and
        // more cells than the grid holds (run 3, F-P-16). A column of the title or subtitle field is left out (its label heads
        // the title column), a column of the note field replaces the note cell, a column of the badge field or of its label
        // field (statusLabel, statutLibelle...) shows the badge. A note or a badge without column nor label goes in the title
        // cell. Every column has a header, and the title column needs one in the app's language.
        var fieldOf = function (v) { return str(isObj(v) ? v.field : v); };
        var titleField = fieldOf(spec2.title), subField = fieldOf(spec2.subtitle), noteField = fieldOf(spec2.note);
        var badgeField = badgeNode ? fieldOf(spec2.badge) : "";
        var isStatusField = function (f) {
          return badgeField.length > 0 && (f === badgeField || (f.toLowerCase().indexOf(badgeField.toLowerCase()) === 0 &&
            /^(label|libelle|lib|text|texte|name|nom|display|caption)$/i.test(f.substring(badgeField.length))));
        };
        var titleLabel = str(spec2.titleLabel), subColumnLabel = "";
        var kept = [], dropped = [];
        var badgeInColumns = false, noteInColumns = false;
        columns.forEach(function (c, ci) {
          var col = isObj(c) ? c : { field: c };
          if (!str(col.field).length || !str(col.label).length) {
            errors.push(label + ".columns[" + ci + "] must be {label, field, labels?, prefix?, suffix?}.");
            return;
          }
          var f = str(col.field);
          if (f === titleField || (subField.length && f === subField)) {
            if (f === titleField && !titleLabel.length) {
              titleLabel = str(col.label);
            } else if (f !== titleField && !subColumnLabel.length) {
              subColumnLabel = str(col.label);
            }
            dropped.push("columns[" + ci + "] " + f + " is the " + (f === titleField ? "title" : "subtitle") + ", shown in the title column");
            return;
          }
          if (isStatusField(f)) {
            if (!badgeInColumns) {
              kept.push({ col: col, badge: true });
            }
            badgeInColumns = true;
            dropped.push("columns[" + ci + "] " + f + " shows the badge " + badgeField);
            return;
          }
          if (noteField.length && f === noteField) {
            noteInColumns = true;
          }
          kept.push({ col: col });
        });
        if (!titleLabel.length) {
          errors.push(label + ".titleLabel is required with columns: the header of the title column, in the app's language (a column of the title field gives it too).");
        }
        var mainCell = [cls("app-cell app-cell-main"), plainAttr("data-label", "Attr_label", titleLabel), expr(valueExpr(rowField, spec2.title))];
        var badgeLabel = str(spec2.badgeLabel), noteLabel = str(spec2.noteLabel);
        if (badgeNode && !badgeInColumns && !badgeLabel.length) {
          mainCell.push(badgeNode);
        }
        if (spec2.subtitle !== undefined) {
          mainCell.push(nx("SpanTag", "Second", {}, [cls("app-cell-sub"), expr(valueExpr(rowField, spec2.subtitle))]));
        }
        if (spec2.note !== undefined && !noteInColumns && !noteLabel.length) {
          mainCell.push(nx("SpanTag", "NoteSub", {}, [cls("app-cell-sub"), expr(valueExpr(rowField, spec2.note))]));
        }
        var headLabels = [titleLabel];
        var cells = [nx("SpanTag", "Main", {}, mainCell)];
        var usedCells = { Main: true };
        var cell = function (base, cellLabel, children) {
          headLabels.push(cellLabel);
          return nx("SpanTag", uniqueName(base, usedCells), {}, [cls("app-cell"), plainAttr("data-label", "Attr_label", cellLabel)].concat(children));
        };
        kept.forEach(function (k) {
          cells.push(k.badge ? cell("StatusCell", str(k.col.label), [badgeNode])
            : cell("C" + pascal(str(k.col.field).split(".").pop()), str(k.col.label), [expr(valueExpr(rowField, k.col))]));
        });
        if (spec2.note !== undefined && !noteInColumns && noteLabel.length) {
          cells.push(cell("NoteCell", noteLabel, [expr(valueExpr(rowField, spec2.note))]));
        }
        if (badgeNode && !badgeInColumns && badgeLabel.length) {
          cells.push(cell("StatusCell", badgeLabel, [badgeNode]));
        }
        if (dropped.length) {
          warnings.push(label + ".columns: " + dropped.join("; ") + ".");
        }
        table = { titleLabel: titleLabel, subColumnLabel: subColumnLabel, kept: kept, noteInColumns: noteInColumns, badgeInColumns: badgeInColumns,
          cells: 1 + kept.length + (spec2.note !== undefined && !noteInColumns ? 1 : 0) + (badgeNode && !badgeInColumns ? 1 : 0), nativeCells: cells.length };
        var rowClass = "app-row app-cols-" + Math.min(8, cells.length);
        rowChildren = [nx("DivTag", "Cells", {}, [cls(rowClass)].concat(cells))];
        var usedHeads = {};
        head = nx("ListItem", "Head", {}, [cls("app-table-head"), nx("DivTag", "HeadRow", {}, [cls(rowClass)].concat(headLabels.map(function (h) {
          return nx("SpanTag", uniqueName("H" + (pascal(h) || "Cell"), usedHeads), {}, [cls("app-cell"), txt(h)]);
        })))]);
      }
      var gridChoice = gridChoiceOf(prefix, spec2, label, columns, table);
      if (table && table.nativeCells > 8 && !gridChoice) {
        errors.push(label + ".columns: " + table.nativeCells + " cells in a row (the title column and " + (table.nativeCells - 1) + " others): a table shows 8 at most " +
          "on a wide screen; keep the columns that matter and show the others on the detail page, or give grid true for the AG Grid, which scrolls.");
      }
      var itemProps = {};
      // Multiple selection: a checkbox per row adds or removes the row key in the local selected (an array of strings),
      // and the select actions below the list receive it as a comma-separated list.
      var selectSpec = spec2.select === true ? { field: "id" } : spec2.select;
      if (selectSpec !== undefined) {
        if (!isObj(selectSpec)) {
          errors.push(label + ".select must be true or {field, actions:[...]}.");
          selectSpec = null;
        }
      }
      if (selectSpec) {
        var keyPath = str(selectSpec.field || "id");
        locals.selected = "[]";
        var keyInTemplate = "'' + " + field(keyPath, item);
        var keyInAction = "'' + scope." + field(keyPath, item);
        // ion-checkbox has no slot property (IonSlot is only on ion-note): first in the row, it sits at the start.
        // Its click stops there: it reached the row, whose onItem opened the next page on every check (run 13b F-09).
        var pick = nx("CheckBox", "Pick", {
          Checked: { mode: "SCRIPT", value: "(local?.selected || []).indexOf(" + keyInTemplate + ") >= 0" } }, [
          { className: "ngx.components.UIAttribute#UIAttribute", name: "Attr_stopClick",
            properties: { attrName: "(click)", attrValue: { mode: "PLAIN", value: "$event.stopPropagation()" } } },
          controlEvent("EventonChange", "ionChange", [setLocal("Toggle", "selected",
            "((s: any[], v: string) => s.indexOf(v) >= 0 ? s.filter((x: any) => x !== v) : s.concat([v]))((c8oPage.local.selected || []).slice(), " + keyInAction + ")")])
        ]);
        if (head) {
          // In a table the checkbox is the first cell of the grid, and the header row keeps its place empty: the columns align.
          rowChildren[0].children.splice(1, 0, pick);
          head.children[1].children.splice(1, 0, nx("SpanTag", "HPick", {}, [cls("app-cell app-cell-pick")]));
        } else {
          rowChildren.unshift(pick);
        }
      }
      if (isObj(spec2.onItem)) {
        if (!childNamed(app, str(spec2.onItem.page))) {
          warnings.push(label + ".onItem.page " + spec2.onItem.page + " is not a page of " + projectName + " yet: create it before the build.");
        }
        itemProps.Button = { mode: "PLAIN", value: "true" };
        itemProps.Detail = { mode: "PLAIN", value: "true" };
        if (head) {
          // The header row takes the same chevron, hidden, so that its cells keep the width of the rows' cells.
          head.properties.Detail = { mode: "PLAIN", value: "true" };
        }
        rowChildren.push(controlEvent("EventonClick", "onClick", [navAction("Open", spec2.onItem, item)]));
      }
      var empty = textOr(spec2.empty, "No record.", label + ".empty");
      // Empty state: an icon and the sentence, in a dashed panel (a search icon on a filtered list).
      var emptyIcon = menuIcon(str(spec2.emptyIcon)) || (filters.length ? "search-outline" : "file-tray-outline");
      var listChildren = [cls("app-list" + (columns !== undefined ? " app-table" : "") + (selectSpec ? " app-has-select" : ""))];
      if (head) {
        listChildren.push(head);
      }
      listChildren.push(forEach(prefix + "ForEach", itemsPath, item, [nx("ListItem", "Row", itemProps, rowChildren)]));
      var blocks = [
        ifDirective(prefix + "IfEmpty", "local?.loading === false && !local?.error && !(" + localPath(itemsPath) + "?.length)", [nx("DivTag", "EmptyState", {}, [
          cls("app-empty-state"), nx("Icon", "EmptyIcon", { IconName: { mode: "PLAIN", value: emptyIcon } }, [cls("app-empty-icon")]),
          nx("Paragraph", "EmptyText", {}, [cls("app-empty"), txt(empty)])])]),
        nx("List", prefix + "List", {}, listChildren)
      ];
      if (selectSpec) {
        var selActions = list(selectSpec.actions);
        if (!selActions.length) {
          errors.push(label + ".select.actions is required: the buttons that use the selection, [{label, page, data:{ids:\"selection\"}} | {label, sequence, vars:{ids:\"selection\"}}].");
        }
        var bar = actionButtons(selActions, label + ".select.actions", { selection: true });
        if (bar) {
          bar.name = prefix + "SelectionActions";
          blocks.push(bar);
        }
      }
      if (!gridChoice) {
        return blocks;
      }
      var gridBlocks = [blocks[0], gridNode(prefix, spec2, label, gridChoice, item, itemsPath, selectSpec, empty, table)].concat(blocks.slice(2));
      gridPlans.push({ mode: gridChoice.mode, label: label, cells: gridChoice.cells, nativeCells: gridChoice.nativeCells, csv: gridChoice.csv || gridChoice.xlsx, nativeBlocks: blocks, gridBlocks: gridBlocks, local: gridChoice.local,
        use: gridBlocks[1].children[1].children[0] });
      return gridBlocks;
    }

    // grid: true, {pageSize, csv, xlsx, locale} or false; left out, a list of GRID_AUTO_CELLS cells or more (title, columns,
    // note, badge) gets the grid. Returns null for a native list.
    function gridChoiceOf(prefix, spec2, label, columns, table) {
      var g = spec2.grid;
      if (g === false || str(g) === "false") {
        return null;
      }
      var cellCount = table ? table.cells : 1 + (spec2.note !== undefined ? 1 : 0) + (spec2.badge !== undefined ? 1 : 0);
      var mode = g === true || str(g) === "true" || isObj(g) ? "asked" : "auto";
      if (g !== undefined && mode === "auto") {
        errors.push(label + ".grid must be true, false or {pageSize, csv, xlsx, locale}.");
        return null;
      }
      if (mode === "auto" && (!Array.isArray(columns) || cellCount < GRID_AUTO_CELLS)) {
        if (Array.isArray(columns)) {
          gridHints.push(label);
        }
        return null;
      }
      var o = isObj(g) ? g : {};
      var pageSize = o.pageSize === undefined ? 20 : Number(o.pageSize);
      if (!(pageSize >= 1 && pageSize <= 500 && Math.floor(pageSize) === pageSize)) {
        errors.push(label + ".grid.pageSize must be an integer from 1 to 500.");
        pageSize = 20;
      }
      var locale = str(o.locale);
      if (locale.length && !/^[a-z]{2}(-[A-Z]{2})?$/.test(locale)) {
        errors.push(label + ".grid.locale must be a language code such as fr or fr-FR.");
        locale = "";
      }
      return { mode: mode, pageSize: pageSize, csv: o.csv === true, xlsx: o.xlsx === true, locale: locale, cells: cellCount,
        nativeCells: table ? table.nativeCells : 1, local: "grid" + upperFirst(prefix) + "Columns" };
    }

    // The column definitions of a grid list, as TypeScript run at page enter (functions are allowed there, not in the
    // template): header, field, labels shown and filtered by, prefix and suffix, the badge as a colored pill.
    function gridColumns(spec2, label, item, selectSpec, table) {
      var path = function (f) {
        var fp = str(f).replace(/^\.+/, "");
        return fp.indexOf(item + ".") === 0 ? fp.substring(item.length + 1) : fp;
      };
      var mapOf = function (o) {
        return "({" + Object.keys(o).map(function (k) { return jsString(k) + ": " + jsString(o[k]); }).join(", ") + "} as any)";
      };
      var column = function (header, spec3, extra) {
        var f = isObj(spec3) ? spec3 : { field: spec3 };
        var fp = path(f.field);
        var getter = "p.data?." + fp.split(".").join("?.");
        var parts = ["headerName: " + jsString(header), "field: " + jsString(fp)];
        if (isObj(f.labels)) {
          parts.push("valueFormatter: (p: any) => " + mapOf(f.labels) + "[p.value] ?? (p.value ?? '')");
          parts.push("filterValueGetter: (p: any) => " + mapOf(f.labels) + "[" + getter + "] ?? " + getter);
        } else if ((f.prefix != null && String(f.prefix).length) || (f.suffix != null && String(f.suffix).length)) {
          parts.push("valueFormatter: (p: any) => p.value == null || p.value === '' ? '' : " + jsString(f.prefix != null ? String(f.prefix) : "") +
            " + p.value + " + jsString(f.suffix != null ? String(f.suffix) : ""));
        }
        return "{" + parts.concat(["comparator: cmp"], extra || []).join(", ") + "}";
      };
      // The title column needs a header in the app's language, as in a native table: a grid without columns has one too.
      var titleHeader = table ? table.titleLabel : str(spec2.titleLabel);
      if (!titleHeader.length && !table) {
        errors.push(label + ".titleLabel is required with a grid: the header of the title column, in the app's language.");
      }
      var cols = [column(titleHeader, spec2.title,
        ["minWidth: 140"].concat(selectSpec ? ["checkboxSelection: true", "headerCheckboxSelection: true"] : []))];
      // The subtitle is the longer text (a label, a description, an email): it gets the room. A column that repeated it
      // gives its header.
      if (spec2.subtitle !== undefined) {
        var subHeader = str(spec2.subtitleLabel) || (table ? table.subColumnLabel : "");
        cols.push(column(subHeader.length ? subHeader : textOr(spec2.subtitleLabel, "Details", label + ".subtitleLabel"), spec2.subtitle, ["flex: 2", "minWidth: 200"]));
      }
      var badge = spec2.badge === undefined ? null : (isObj(spec2.badge) ? spec2.badge : { field: spec2.badge });
      var badgeColumn = function (header) {
        var colors = isObj(badge.colors) ? badge.colors : (isObj(badge.labels) ? G.statusColors(badge.labels) : {});
        // The pill of the native badge: its color at 14 % behind a text mixed with the text color (darker in light mode,
        // lighter in dark mode).
        var renderer = "cellRenderer: (p: any) => { const c = " + mapOf(colors) + "[p.value] || 'medium'; const s = document.createElement('span'); " +
          "s.className = 'app-grid-badge'; s.style.background = 'rgba(var(--ion-color-' + c + '-rgb), 0.14)'; " +
          "s.style.color = 'color-mix(in srgb, var(--ion-color-' + c + ') 72%, var(--ion-text-color, #000))'; " +
          "s.textContent = p.valueFormatted ?? p.value ?? ''; return p.value == null || p.value === '' ? '' : s; }";
        return column(header, badge, [renderer]);
      };
      // The columns of the table analysis: a column of the badge field or of its label field is the badge column, a column
      // of the note field is the note.
      (table ? table.kept : []).forEach(function (k) {
        cols.push(k.badge && badge ? badgeColumn(str(k.col.label)) : column(str(k.col.label), k.col));
      });
      if (spec2.note !== undefined && !(table && table.noteInColumns)) {
        cols.push(column(textOr(spec2.noteLabel, "Note", label + ".noteLabel"), spec2.note));
      }
      if (badge && !(table && table.badgeInColumns)) {
        cols.push(badgeColumn(textOr(spec2.badgeLabel, "Status", label + ".badgeLabel")));
      }
      // One natural order for every column: numbers the database sends as text ("1290.00", "320.00") and codes with a
      // number (PC-0002, PC-0010) sort by value, accented words next to the others.
      return "(() => { const cmp = (a: any, b: any) => String(a ?? '').localeCompare(String(b ?? ''), undefined, {numeric: true, sensitivity: 'base'}); " +
        "return [" + cols.join(", ") + "]; })()";
    }

    function useVar(name, value) {
      return { className: "ngx.components.UIUseVariable#UIUseVariable", name: name,
        properties: { varValue: typeof value === "object" ? value : { mode: "SCRIPT", value: String(value) } } };
    }

    // The grid list: the agGrid shared component of lib_ExtendedComponents_ui_ngx bound to the page data, sorting,
    // filtering and paging on the client, the row click and the selection of the native list.
    function gridNode(prefix, spec2, label, choice, item, itemsPath, selectSpec, empty, table) {
      locals[choice.local] = gridColumns(spec2, label, item, selectSpec, table);
      var vars = [
        useVar("columnDefs", { mode: "SOURCE", local: choice.local }),
        useVar("rowData", { mode: "SOURCE", local: itemsPath }),
        useVar("defaultColDef", "{sortable: true, filter: true, resizable: true, editable: false, flex: 1, minWidth: 120}"),
        useVar("autoSizeColumns", "false"),
        useVar("pagination", "true"),
        useVar("paginationPageSize", String(choice.pageSize)),
        useVar("paginationPageSizeSelector", "true"),
        useVar("rowHeight", "44"),
        useVar("domLayout", "'autoHeight'"),
        useVar("class", "'ag-theme-quartz'"),
        // The grid's own texts (filter menu, paging) in the app's language unless the spec gives one.
        useVar("localeText", choice.locale.length ? jsString(choice.locale) : "this.translate?.currentLang || 'en'"),
        useVar("overlayNoRowsTemplate", jsString("<span>" + String(empty).replace(/[<>&]/g, "") + "</span>")),
        useVar("rowSelection", selectSpec ? "'multiple'" : "'single'"),
        useVar("suppressRowClickSelection", selectSpec ? "true" : "false")
      ];
      if (choice.csv) {
        vars.push(useVar("showCsvDownload", "true"));
      }
      if (choice.xlsx) {
        vars.push(useVar("showXlsxDownload", "true"));
      }
      if (isObj(spec2.onItem)) {
        vars.push({ className: "ngx.components.UIControlEvent#UIControlEvent", name: "EventRowClicked",
          properties: { eventName: "RowClicked", attrName: "(RowClicked)" }, children: [navAction("Open", spec2.onItem, null, "event?.data?.")] });
      }
      if (selectSpec) {
        var key = str(selectSpec.field || "id").split(".").join("?.");
        vars.push({ className: "ngx.components.UIControlEvent#UIControlEvent", name: "EventSelectionChanged",
          properties: { eventName: "SelectionChanged", attrName: "(SelectionChanged)" },
          children: [setLocal("Pick", "selected", "(event?.api?.getSelectedRows?.() || []).map((r: any) => '' + r?." + key + ")")] });
      }
      var use = { className: "ngx.components.UIUseShared#UIUseShared", name: prefix + "Grid",
        properties: { sharedcomponent: GRID_LIBRARY + ".MobileApplication.Application." + GRID_COMPONENT }, children: vars };
      return nx("DivTag", prefix + "GridBox", {}, [cls("app-grid" + (isObj(spec2.onItem) ? " app-grid-clickable" : "")),
        ifDirective(prefix + "IfRows", "!!(" + localPath(itemsPath) + "?.length)", [use])]);
    }

    function labelValueList(name, fields, base, label) {
      if (!Array.isArray(fields) || !fields.length) {
        errors.push(label + " must be a non-empty array of {label, field}.");
        return null;
      }
      var usedItems = {};
      return nx("List", name, { Lines: { mode: "PLAIN", value: "none" } }, [cls("app-list app-fields")].concat(fields.map(function (f, i) {
        if (!isObj(f) || !str(f.field).length) {
          errors.push(label + "[" + i + "] must be {label, field, labels?}.");
          return nx("ListItem", "F" + i, {}, []);
        }
        return nx("ListItem", uniqueName("F" + pascal(f.field), usedItems), {}, [
          nx("Label", "Lb", {}, [cls("app-field-label"), txt(str(f.label) || str(f.field))]),
          nx("Note", "Nt", { IonSlot: { mode: "PLAIN", value: "end" } }, [expr(valueExpr(function (p) { return localPath(base + "." + p); }, f))])
        ]);
      })));
    }

    // "selection" in data or vars is the comma-separated list of the selected rows (see recordList select).
    var SELECTION_EXPR = "(c8oPage.local.selected || []).join(',')";
    function withSelection(values) {
      if (!isObj(values)) {
        return values;
      }
      var out = {};
      Object.keys(values).forEach(function (k) {
        out[k] = str(values[k]) === "selection" ? SELECTION_EXPR : values[k];
      });
      return out;
    }

    function actionButtons(actions, label, options) {
      options = options || {};
      if (!actions.length) {
        return null;
      }
      var usedButtons = {};
      return nx("DivTag", "Actions", {}, [cls("app-actions")].concat(actions.map(function (a, i) {
        if (!isObj(a) || !str(a.label).length) {
          errors.push(label + "[" + i + "] must be {label, page?, kind?, data?, sequence?}.");
          return txt("");
        }
        var chain;
        if (str(a.page).length && !childNamed(app, str(a.page))) {
          warnings.push(label + "[" + i + "].page " + a.page + " is not a page of " + projectName + " yet: create it before the build.");
        }
        if (str(a.sequence).length) {
          if (sequenceVariables(projectDbo, str(a.sequence)) === null) {
            errors.push(label + "[" + i + "].sequence " + a.sequence + " is not a sequence of " + projectName + ".");
          }
          var callChildren = [];
          if (isObj(a.vars)) {
            var seqVars = sequenceVariables(projectDbo, str(a.sequence)) || [];
            var avars = withSelection(a.vars);
            Object.keys(avars).forEach(function (v) {
              if (seqVars.length && seqVars.indexOf(v) < 0) {
                errors.push(label + "[" + i + "].vars." + v + " is not a variable of " + a.sequence + " (" + seqVars.join(", ") + ").");
              }
              callChildren.push(callVariable(v, { mode: "SCRIPT", value: String(avars[v]) }));
            });
          }
          // data goes to the next page (navParams), vars to the called sequence: say it when data names its variables.
          if (isObj(a.data)) {
            var calledVars = sequenceVariables(projectDbo, str(a.sequence)) || [];
            var misplaced = Object.keys(a.data).filter(function (k) { return calledVars.indexOf(k) >= 0 && !(isObj(a.vars) && a.vars[k] !== undefined); });
            if (misplaced.length) {
              errors.push(label + "[" + i + "].data." + misplaced[0] + " is a variable of " + a.sequence + ": pass it in vars:{" + misplaced[0] +
                ": ...}. data is what the next page receives in navParams.");
            }
          }
          // The navigation waits for the sequence's success, as the form submit does; a failure shows its first error.
          var callError = "stack['Call'].out?.errors?.[0]?.message || 'Error'";
          var okChildren = str(a.page).length ? [navAction("Go", { page: a.page, kind: a.kind || "root", data: withSelection(a.data) })] : [];
          if (okChildren.length) {
            callChildren.push(nxAction("IfAction", "IfOk", { condition: { mode: "SCRIPT", value: "out?.success" } }, okChildren));
          }
          callChildren.push(nxAction("IfAction", "IfKo", { condition: { mode: "SCRIPT", value: "!out?.success" } }, [
            setLocal("StoreCallError", "error", callError),
            nxAction("ToastAction", "ToastKo", { message: { mode: "SCRIPT", value: callError }, IonColor: { mode: "PLAIN", value: "danger" },
              duration: { mode: "PLAIN", value: "4000" } })]));
          chain = nxAction("CallSequenceAction", "Call", { requestable: { mode: "PLAIN", value: projectName + "." + str(a.sequence) }, noAutoLogin: { mode: "PLAIN", value: "true" },
            cacheTtl: { mode: "PLAIN", value: "0" } }, callChildren);
        } else if (str(a.page).length || str(a.kind) === "pop") {
          chain = navAction("Go", { page: a.page, kind: a.kind, data: withSelection(a.data) });
        } else {
          errors.push(label + "[" + i + "] needs page (navigation) or sequence (a call, then page).");
          chain = null;
        }
        var props = {};
        if (str(a.fill).length) {
          props.IonFill = { mode: "PLAIN", value: str(a.fill) };
        }
        if (str(a.color).length) {
          props.IonColor = { mode: "PLAIN", value: str(a.color) };
        }
        if (options.selection) {
          props.Disabled = { mode: "SCRIPT", value: "!(local?.selected?.length)" };
        }
        return nx("Button", uniqueName("Btn" + pascal(a.label), usedButtons), props, [txt(a.label)].concat(chain ? [controlEvent("EventonClick", "onClick", [chain])] : []));
      })));
    }

    var content = [cls("app-page")];
    var headingText = spec.heading !== undefined ? str(spec.heading) : title;
    if (headingText.length) {
      var titleNode = heading("Title", 2, headingText);
      titleNode.children.unshift(cls("app-title"));
      content.push(titleNode);
    }
    var formPlan = null;
    if (kind === "list") {
      var listSpec = isObj(spec.list) ? spec.list : null;
      if (!listSpec) {
        errors.push("list is required for a list page: {items, title, subtitle?, note?, badge?, empty?, onItem?}.");
      }
      if (filterNodes.length) {
        filterNodes.push(nx("Button", "BtnFilter", {}, [txt(textOr(spec.filterLabel, "Filter", "filterLabel")),
          controlEvent("EventonClick", "onClick", [dataCall("Reload", 0)])]));
        content.push(nx("DivTag", "Filters", {}, [cls("app-filters")].concat(filterNodes)));
      }
      content.push(ifDirective("IfError", "!!local?.error", [nx("Paragraph", "ErrorText", {}, [cls("app-error"), expr("local?.error")])]));
      if (listSpec) {
        content = content.concat(recordList("Rec", listSpec, "list"));
      }
    } else if (kind === "detail") {
      var detail = isObj(spec.detail) ? spec.detail : null;
      if (!detail && !facade.length) {
        // A page without data (login with demo buttons, home): header, heading and actions, and the error of an action.
        content.push(ifDirective("IfError", "!!local?.error", [nx("Paragraph", "ErrorText", {}, [cls("app-error"), expr("local?.error")])]));
      } else if (!detail) {
        errors.push("detail is required for a detail page with a sequence: {record?, fields:[{label, field}]}.");
      } else {
        content.push(ifDirective("IfError", "!!local?.error", [nx("Paragraph", "ErrorText", {}, [cls("app-error"), expr("local?.error")])]));
        var base = "data" + (str(detail.record).length ? "." + dataPath(detail.record, "detail.record") : "");
        var lv = labelValueList("Fields", detail.fields, base, "detail.fields");
        if (lv) {
          content.push(ifDirective("IfRecord", localPath(base), [lv]));
        }
      }
    } else if (kind === "dashboard") {
      var dash = isObj(spec.dashboard) ? spec.dashboard : null;
      if (!dash) {
        errors.push("dashboard is required for a dashboard page: {kpis:[{label, field}], sections?:[{title, items, title...}]}.");
      } else {
        content.push(ifDirective("IfError", "!!local?.error", [nx("Paragraph", "ErrorText", {}, [cls("app-error"), expr("local?.error")])]));
        var kpis = list(dash.kpis);
        if (kpis.length) {
          var usedKpis = {};
          content.push(nx("DivTag", "Kpis", {}, [cls("app-kpis")].concat(kpis.map(function (k, i) {
            if (!isObj(k) || !str(k.field).length) {
              errors.push("dashboard.kpis[" + i + "] must be {label, field, icon?, color?}.");
              return txt("");
            }
            // A card per counter: an icon in a tinted square and an accent color (left border and icon). Not given, the
            // label says them: "En retard" is danger with an alert icon, "À jour" success with a check; icon "none" has none.
            var said = G.statusColor(str(k.label) || str(k.field), "");
            var kpiColor = str(k.color) || said || "primary";
            if (ACCENTS.indexOf(kpiColor) < 0) {
              errors.push("dashboard.kpis[" + i + "].color must be " + ACCENTS.join(", ") + ".");
            }
            var kpiIcon = k.icon === undefined || k.icon === null || str(k.icon) === "" ? (KPI_ICONS[kpiColor] || KPI_ICONS.primary)
              : (str(k.icon) === "none" ? "" : menuIcon(str(k.icon)));
            var kpiChildren = [cls("app-kpi" + (kpiIcon.length ? " app-kpi-iconed" : "") + " app-accent-" + kpiColor)];
            if (kpiIcon.length) {
              kpiChildren.push(nx("Icon", "Icon", { IconName: { mode: "PLAIN", value: kpiIcon } }, [cls("app-kpi-icon")]));
            }
            return nx("DivTag", uniqueName("Kpi" + pascal(k.field.split(".").pop()), usedKpis), {}, kpiChildren.concat([
              nx("SpanTag", "Value", {}, [cls("app-kpi-value"), expr("(" + localPath("data." + dataPath(k.field, "dashboard.kpis[" + i + "].field")) + " ?? 0)")]),
              nx("SpanTag", "Label", {}, [cls("app-kpi-label"), txt(str(k.label) || k.field)])]));
          }))));
        }
        list(dash.sections).forEach(function (s, i) {
          if (!isObj(s)) {
            errors.push("dashboard.sections[" + i + "] must be an object.");
            return;
          }
          var prefix = "S" + (i + 1);
          content.push(nx("Heading3", prefix + "Title", {}, [cls("app-section"), txt(str(s.heading || s.label) || ("Section " + (i + 1)))]));
          if (Array.isArray(s.fields)) {
            var sbase = "data." + dataPath(s.record, "dashboard.sections[" + i + "].record");
            var slv = labelValueList(prefix + "Fields", s.fields, sbase, "dashboard.sections[" + i + "].fields");
            if (slv) {
              content.push(ifDirective(prefix + "IfRecord", localPath(sbase), [slv]));
            }
          } else {
            content = content.concat(recordList(prefix, s, "dashboard.sections[" + i + "]"));
          }
        });
      }
    } else if (kind === "form") {
      var form = isObj(spec.form) ? spec.form : null;
      if (!form) {
        errors.push("form is required for a form page: {submit, fields:[{name, label, type, required?, options?}], success?}.");
      } else {
        var submitVars = sequenceVariables(projectDbo, str(form.submit));
        if (submitVars === null) {
          errors.push("form.submit " + form.submit + " is not a sequence of " + projectName + ": create the business sequence first.");
          submitVars = [];
        }
        var identifier = lowerFirst(name).replace(/Form$/, "") + "Form";
        var usedItems = {};
        var fieldsNodes = list(form.fields).map(function (f, i) {
          if (!isObj(f) || !IDENT.test(str(f.name))) {
            errors.push("form.fields[" + i + "] must be {name, label, type?, required?, options?, optionsFrom?, multiple?, value?, disabled?}.");
            return null;
          }
          if (submitVars.length && submitVars.indexOf(str(f.name)) < 0) {
            errors.push("form.fields[" + i + "].name " + f.name + " is not a variable of " + form.submit + " (" + submitVars.join(", ") + ").");
          }
          var type = str(f.type || "text");
          var props = { ControlName: { mode: "PLAIN", value: str(f.name) }, Label: { mode: "PLAIN", value: str(f.label) || str(f.name) },
            LabelPlacement: { mode: "PLAIN", value: "stacked" } };
          // Required exists on inputs and text areas only (a Select or Toggle has no such property).
          if (f.required === true && ["select", "toggle"].indexOf(type) < 0) {
            props.Required = { mode: "PLAIN", value: "true" };
          }
          if (str(f.helper).length) {
            props.HelperText = { mode: "PLAIN", value: str(f.helper) };
          }
          if (f.from !== undefined && str(f.from).length) {
            // An edit form shows the record the page loaded: the control reads the page data, filled when the page's
            // business sequence answers. A value computed at page enter came before that answer, so the form of a
            // generated edit page never filled (usage tests 29/10).
            props.Value = { mode: "SOURCE", local: "data." + str(f.from).replace(/^\.+/, "").replace(/^data\./, "") };
          } else if (f.value !== undefined) {
            // The initial value is a TypeScript expression (new Date()..., c8oPage.navParams...): it is computed at page
            // enter into a local and the control reads that local. Written in the template, it broke the Angular build.
            var initLocal = "init" + pascal(f.name);
            locals[initLocal] = String(f.value);
            props.Value = { mode: "SOURCE", local: initLocal };
            if (/(^|[^\w.])(c8oPage\.)?(local\??\.)?data\??\./.test(String(f.value))) {
              warnings.push("form.fields " + str(f.name) + ": value is computed at page enter, before the page data arrives " +
                "(and c8oPage.data is never set): write from: \"<path in the page data>\" to show the loaded record.");
            }
          }
          if (f.disabled !== undefined && f.disabled !== false && str(f.disabled) !== "false") {
            // Read-only when the expression is true. Computed at page enter like value: written in the template, an
            // expression with c8oPage.navParams broke the Angular build (TS2339, run 13b F-10); the template has no c8oPage.
            var disabledLocal = "disabled" + pascal(f.name);
            locals[disabledLocal] = f.disabled === true || str(f.disabled) === "true" ? "true" : "!!(" + String(f.disabled) + ")";
            props.Disabled = { mode: "SCRIPT", value: "local?." + disabledLocal + " === true" };
          }
          var control;
          var afterField = null;
          var cname = pascal(f.name);
          if (type === "textarea") {
            if (f.maxLength !== undefined) {
              props.MaxLength = { mode: "PLAIN", value: String(f.maxLength) };
              props.Counter = { mode: "PLAIN", value: "true" };
            }
            props.Rows = { mode: "PLAIN", value: String(f.rows || 3) };
            control = nx("TextArea", "Ta" + cname, props);
          } else if (type === "select") {
            var opts = [];
            if (isObj(f.optionsFrom)) {
              var src = f.optionsFrom;
              var it = str(src.item || "opt");
              var labelField = src.label !== undefined ? src.label : "label";
              // The options are read in the answer of the page sequence: a list it does not return left the select empty with
              // no sign (run 3, F-P-17). No sequence is an error; otherwise the answer says where the list must be, and the page
              // says when it is empty.
              var optionsPath = dataPath(src.items || "items", "form.fields[" + i + "].optionsFrom.items");
              var optionsBinding = localPath("data." + optionsPath);
              var noOption = textOr(src.empty, "No option to choose from.", "form.fields[" + i + "].optionsFrom.empty");
              if (!facade.length) {
                errors.push("form.fields[" + i + "].optionsFrom reads the page data, but the page has no sequence: give sequence, the business sequence " +
                  "whose answer holds data." + optionsPath + " (it is called at page enter).");
              } else {
                warnings.push("form.fields[" + i + "].optionsFrom: the options are " + optionsBinding + ", so the answer of " + facade + " must hold data." +
                  optionsPath + " (check it with requestable-execute); without it the select stays empty and the page shows \"" + noOption + "\".");
              }
              afterField = ifDirective("If" + cname + "NoOption", "local?.loading === false && !(" + optionsBinding + "?.length)", [
                nx("Paragraph", cname + "NoOption", {}, [cls("app-field-empty"), txt(noOption)])]);
              opts.push(forEach("Each" + cname, "data." + optionsPath, it, [nx("SelectOption", "Opt", { Value: { mode: "SCRIPT", value: "'' + " + field(src.value || "id", it) } },
                [expr(valueExpr(function (p) { return field(p, it); }, labelField))])]));
            } else {
              opts = list(f.options).map(function (o, oi) {
                var opt = isObj(o) ? o : { value: o, label: o };
                return nx("SelectOption", "Opt" + oi, { Value: { mode: "PLAIN", value: String(opt.value) } }, [txt(str(opt.label) || String(opt.value))]);
              });
            }
            if (!opts.length) {
              errors.push("form.fields[" + i + "] is a select without options or optionsFrom.");
            }
            props.Interface = { mode: "PLAIN", value: f.multiple === true ? "alert" : "popover" };
            if (f.multiple === true) {
              props.Multiple = { mode: "PLAIN", value: "true" };
            }
            control = nx("Select", "Sel" + cname, props, opts);
          } else if (type === "toggle") {
            // A Toggle has no Label property (it was skipped, so the toggle showed no text, run 9a): its label is its text child.
            var toggleLabel = props.Label.value;
            delete props.Label;
            delete props.LabelPlacement;
            // The toggle's state is Checked, which the template binds to ngModel; Value is only the value it submits when
            // on, so value:"true" in Value showed the toggle off and created inactive records (run 10).
            if (props.Value) {
              props.Checked = props.Value;
              delete props.Value;
            }
            control = nx("Toggle", "Tg" + cname, props, [txt(toggleLabel)]);
          } else {
            if (["text", "email", "password", "number", "tel", "url", "date", "time"].indexOf(type) < 0) {
              errors.push("form.fields[" + i + "].type must be text, email, password, number, tel, url, date, time, textarea, select or toggle.");
            }
            props.Type = { mode: "PLAIN", value: type };
            control = nx("Input", "In" + cname, props);
          }
          return { spec: f, node: nx("FormItem", uniqueName("Fi" + cname, usedItems), {}, [control]), after: afterField };
        }).filter(function (x) { return x; });
        var formChildren = [];
        fieldsNodes.forEach(function (x) {
          formChildren.push(x.node);
          if (x.after) {
            formChildren.push(x.after);
          }
        });
        if (form.cancel !== false) {
          formChildren.push(nx("Button", "BtnCancel", { IonFill: { mode: "PLAIN", value: "outline" } }, [txt(textOr(form.cancelLabel, "Cancel", "form.cancelLabel")),
            controlEvent("EventonClick", "onClick", [navAction("Back", isObj(form.cancel) ? form.cancel : { kind: "pop" })])]));
        }
        formChildren.push(nx("SubmitButton", "BtnSubmit", { IonColor: { mode: "PLAIN", value: "primary" } }, [txt(textOr(form.submitLabel, "Save", "form.submitLabel"))]));
        content.push(ifDirective("IfError", "!!local?.error", [nx("Paragraph", "ErrorText", {}, [cls("app-error"), expr("local?.error")])]));
        content.push({ className: "ngx.components.UIForm#UIForm", name: "Form", properties: { identifier: identifier }, children: [cls("app-form")].concat(formChildren) });
        var success = isObj(form.success) ? form.success : {};
        if (str(success.page).length && !childNamed(app, str(success.page))) {
          warnings.push("form.success.page " + success.page + " is not a page of " + projectName + " yet: create it before the build.");
        }
        formPlan = { identifier: identifier, fields: fieldsNodes.map(function (x) { return x.spec; }), submit: str(form.submit), submitVars: submitVars,
          extra: isObj(form.vars) ? form.vars : {}, success: success };
        Object.keys(formPlan.extra).forEach(function (v) {
          if (submitVars.length && submitVars.indexOf(v) < 0) {
            errors.push("form.vars." + v + " is not a variable of " + form.submit + ".");
          }
        });
      }
    }
    var actions = actionButtons(list(spec.actions), "actions");
    if (actions) {
      content.push(actions);
    }
    var pageEventChildren = [];
    Object.keys(locals).forEach(function (l) {
      pageEventChildren.push(setLocal("Init" + upperFirst(l), l, locals[l]));
    });
    // Last: siblings start in tree order and a SetLocalAction sets its local when it starts, so the call reads the
    // params, filters and locals just set (run 13a F-06 took it for a race; checked live: push, deep link, re-entry).
    if (facade.length) {
      pageEventChildren.push(dataCall("Load"));
    } else {
      pageEventChildren.push(setLocal("Loaded", "loading", "false"));
    }
    if (errors.length) {
      invalid(tool, errors);
    }
    // A grid list needs lib_ExtendedComponents_ui_ngx in the app: referenced already, else imported from the marketplace
    // and referenced, as marketplace-import does (that stays if the page then fails). An automatic grid falls back to the
    // native table when the library cannot be had; an asked one refuses the page.
    var gridLibrary = null;
    if (gridPlans.length) {
      gridLibrary = G.ensureLibrary(projectDbo, GRID_LIBRARY, GRID_COMPONENT);
      if (gridLibrary.error) {
        var askedGrids = gridPlans.filter(function (gp) { return gp.mode === "asked"; }).map(function (gp) { return gp.label + ".grid"; });
        if (askedGrids.length) {
          invalid(tool, [askedGrids.join(", ") + ": " + gridLibrary.error + " Give grid:false for a native table."]);
        }
        // A native table aligns 8 cells at most (F-P-16): a wider list that was to be a grid is refused, not misaligned.
        var tooWide = gridPlans.filter(function (gp) { return gp.nativeCells > 8; }).map(function (gp) { return gp.label + ".columns: " + gp.nativeCells + " cells in a row"; });
        if (tooWide.length) {
          invalid(tool, [tooWide.join("; ") + ": a native table shows 8 at most on a wide screen and the AG Grid cannot be had: " + gridLibrary.error +
            " Keep the columns that matter and show the others on the detail page."]);
        }
        gridPlans.forEach(function (gp) {
          content.splice(content.indexOf(gp.gridBlocks[1]), 1, gp.nativeBlocks[1]);
          pageEventChildren = pageEventChildren.filter(function (n) { return n.name !== "Init" + upperFirst(gp.local); });
          delete locals[gp.local];
        });
        warnings.push("The list was built as a native table: " + gridLibrary.error);
      } else {
        gridPlans.forEach(function (gp) {
          gp.use.properties.sharedcomponent = gridLibrary.sharedComponent;
        });
      }
    }

    // Entry page: root:true makes this page the one the app opens on; with no root page at all (the starter page
    // deleted), the new page becomes it, else the viewer stayed on /home, "Cannot match any routes" (run 13a F-09).
    var askedRoot = spec.root === true || str(spec.root) === "true";
    var currentRoot = appPages(app).filter(isRootPage)[0] || null;
    var makeRoot = askedRoot || !currentRoot;

    // The route the user reads in the address bar: livre-modification, not the Studio's path-to-livremodification
    // (usage tests 29/10, an app built with this tool).
    var segment = str(spec.segment) || (name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "page");
    // In the menu by default: list and dashboard pages, which need no parameter; forms and details open from a page.
    var inMenu = spec.inMenu === undefined ? (kind === "list" || kind === "dashboard") : (spec.inMenu === true || String(spec.inMenu) === "true");
    var pageProps = { title: title, segment: segment, inAutoMenu: inMenu,
      comment: str(spec.comment) || (upperFirst(kind) + " page \"" + title + "\"" + (facade.length ? ", data from " + projectName + "." + facade : "") +
        (formPlan ? ", submits " + projectName + "." + formPlan.submit : "") + ". Generated by ngx-page-create.") };
    // The menu shows an icon per page: the one given (its base name, the menu adds -outline or -sharp), else one for the kind.
    var givenIcon = str(spec.icon).trim();
    var icon = menuIcon(givenIcon.replace(/-(outline|sharp)$/, ""));
    if (givenIcon.length && icon !== givenIcon) {
      warnings.push(icon.length ? "icon " + givenIcon + ": the menu adds -outline or -sharp itself, so the page icon is " + icon + "."
        : "icon " + givenIcon + " is not an ionicons name (lower-case words joined by dashes, such as people or calendar): the icon of a " + kind + " page is used.");
    }
    if (!icon.length && inMenu) {
      icon = { list: "list", dashboard: "grid", form: "create", detail: "document-text" }[kind];
    }
    if (icon.length) {
      pageProps.icon = icon;
    }
    // Header navigation: the menu button (shown when the app has a menu), the back button (shown when there is a page to
    // go back to, else it opens the home page when one is given), the title, and a home button.
    var home = str(spec.home);
    var homeSegment = "";
    if (home.length) {
      var homePage = childNamed(app, home);
      if (!homePage && home !== name) {
        warnings.push("home " + home + " is not a page of " + projectName + " yet: create it before the build.");
      }
      try {
        homeSegment = homePage ? str(homePage.getSegment()) : (home === name ? segment : "");
      } catch (_noSegment) {}
    }
    var backProps = homeSegment.length ? { DefaultHref: { mode: "PLAIN", value: "/" + homeSegment.replace(/^\//, "") } } : {};
    var headerChildren = [
      nx("ButtonSet", "Start", { SetPosition: { mode: "PLAIN", value: "start" } }, [nx("MenuButton", "Menu", {}), nx("BackButton", "Back", backProps)]),
      nx("BarTitle", "BarTitle", {}, [txt(title)])
    ];
    if (home.length && home !== name) {
      headerChildren.push(nx("ButtonSet", "End", { SetPosition: { mode: "PLAIN", value: "end" } }, [
        nx("Button", "Home", {}, [nx("Icon", "Icon", { IconName: { mode: "PLAIN", value: "home" } }),
          controlEvent("EventonClick", "onClick", [navAction("GoHome", { page: home, kind: "root" })])])
      ]));
    }
    var pageNode = {
      className: "ngx.components.PageComponent#PageComponent", name: name, properties: pageProps, children: [
        nx("Header", "Header", {}, [nx("ToolBar", "ToolBar", {}, headerChildren)]),
        nx("Content", "Content", {}, content),
        // pageWillEnter, not the default pageDidEnter: ionViewDidEnter does not fire when the app opens on this page's URL
        // (reload, deep link), which left the page without its locals and data.
        { className: "ngx.components.UIPageEvent#UIPageEvent", name: "PageEvent", properties: { viewEvent: "pageWillEnter" }, children: pageEventChildren }
      ]
    };

    var session = new Session(tool, projectDbo);
    // AppLayout: created when missing, completed with the rules this page uses.
    var style = childNamed(app, "AppLayout");
    var styleStatus = "kept";
    var used = usedClasses(pageNode);
    var neededRules = APP_LAYOUT_RULES.filter(function (r) {
      var tokens = r[0].match(/\.app-[a-z0-9-]+/g) || [];
      return tokens.length > 0 && tokens.every(function (t) { return used[t.substring(1)] === true; });
    });
    if (!style) {
      session.create(appQName, { className: "ngx.components.UIStyle#UIStyle", name: "AppLayout",
        properties: { styleContent: APP_LAYOUT_RULES.map(function (r) { return r[1]; }).join("\n") + "\n" } });
      styleStatus = "created";
    } else {
      var css = "";
      try {
        css = String(style.getStyleContent().getString());
      } catch (_noCss) {
        css = "";
      }
      var missing = neededRules.filter(function (r) { return css.indexOf(r[0] + " ") < 0 && css.indexOf(r[0] + "{") < 0; });
      if (missing.length) {
        var updated = css.replace(/\s*$/, "\n") + missing.map(function (r) { return r[1]; }).join("\n") + "\n";
        var res = C8O.dbo.batchApply({ target: qnameOf(style), operations: [{ type: "setProperties", qname: qnameOf(style), properties: { styleContent: updated } }],
          onError: "stop", autoSave: false, triggerMobileBuilder: false });
        if (!res || res.status === "failed") {
          invalid(tool, ["AppLayout could not be completed: " + batchErrors(res).join(" | ")]);
        }
        styleStatus = "completed with " + missing.map(function (r) { return r[0]; }).join(", ");
      }
    }
    var page = session.create(appQName, pageNode);
    var pageQName = qnameOf(page);
    if (formPlan) {
      // The Form SmartSource needs the priority of the created UIForm: wire the submit chain now.
      var formDbo = C8O.dbo.resolve(pageQName + ".Content.Form", { optional: true });
      if (!formDbo) {
        session.rollback();
        throw new Error(tool + ": the form was not created; nothing was kept.");
      }
      var priority = Number(String(formDbo.priority));
      var submitChildren = formPlan.submitVars.map(function (v) {
        if (formPlan.extra[v] !== undefined) {
          return callVariable(v, { mode: "SCRIPT", value: String(formPlan.extra[v]) });
        }
        var f = formPlan.fields.filter(function (x) { return str(x.name) === v; })[0];
        if (!f) {
          return callVariable(v, params.indexOf(v) >= 0 ? { mode: "SOURCE", local: v } : { mode: "SCRIPT", value: "''" });
        }
        if (f.multiple === true) {
          return callVariable(v, { mode: "SCRIPT", value: "(c8oPage." + formPlan.identifier + "?.controls?.['" + v + "']?.value || []).join(',')" });
        }
        return callVariable(v, { mode: "SOURCE", value: JSON.stringify({ filter: "Form", project: projectName, input: "", model: {
          data: [{ priority: priority, identifier: formPlan.identifier }], path: "?.controls?.['" + v + "']?.value", prefix: "", suffix: "", custom: "", useCustom: false } }) });
      });
      var ok = [nxAction("ToastAction", "ToastOk", { message: { mode: "SCRIPT", value: jsString(textOr(formPlan.success.message, "Saved.", "form.success.message")) },
        IonColor: { mode: "PLAIN", value: "success" }, duration: { mode: "PLAIN", value: "3000" } })];
      if (str(formPlan.success.page).length) {
        ok.push(navAction("Next", { page: formPlan.success.page, kind: formPlan.success.kind || "root", data: formPlan.success.data }));
      } else if (str(formPlan.success.kind) === "pop") {
        ok.push(navAction("Next", { kind: "pop" }));
      }
      submitChildren.push(nxAction("IfAction", "IfOk", { condition: { mode: "SCRIPT", value: "out?.success" } }, ok));
      // Under an IfAction, out is the If's own result: the call's response is stack["Submit"].out.
      var submitError = "stack['Submit'].out?.errors?.[0]?.message || 'Error'";
      var storeSubmitError = setLocal("StoreSubmitError", "error", submitError);
      storeSubmitError.children = [refreshView()];
      var koChildren = [storeSubmitError,
        nxAction("ToastAction", "ToastKo", { message: { mode: "SCRIPT", value: submitError }, IonColor: { mode: "PLAIN", value: "danger" },
          duration: { mode: "PLAIN", value: "4000" } })];
      submitChildren.push(nxAction("IfAction", "IfKo", { condition: { mode: "SCRIPT", value: "!out?.success" } }, koChildren));
      if (authRedirect.length) {
        submitChildren.push(authBranch("IfSubmitSessionLost"));
      }
      var submitEvent = controlEvent("EventonSubmit", "onSubmit", [nxAction("CallSequenceAction", "Submit", {
        requestable: { mode: "PLAIN", value: projectName + "." + formPlan.submit }, cacheTtl: { mode: "PLAIN", value: "0" } }, submitChildren)]);
      var formQName = qnameOf(formDbo);
      var wired = C8O.dbo.batchApply({ target: formQName, operations: [{ type: "create", opId: "submit", related: formQName, mode: "inside",
        className: submitEvent.className, name: submitEvent.name, properties: submitEvent.properties, children: submitEvent.children }],
        onError: "stop", autoSave: false, triggerMobileBuilder: false });
      if (!wired || wired.status === "failed" || (wired.errors && wired.errors.length)) {
        var why = batchErrors(wired).join(" | ");
        session.rollback();
        throw new Error(tool + ": wiring the submit chain failed: " + why + " Nothing was kept.");
      }
      batchWarnings(wired).forEach(function (w) { session.warnings.push(w); });
    }
    if (makeRoot) {
      var rooted = C8O.dbo.batchApply({ target: pageQName, operations: [{ type: "setProperties", qname: pageQName, properties: { isRoot: true } }],
        onError: "stop", autoSave: false, triggerMobileBuilder: false });
      if (!rooted || rooted.status === "failed" || (rooted.errors && rooted.errors.length)) {
        var rootWhy = batchErrors(rooted).join(" | ");
        session.rollback();
        throw new Error(tool + ": making " + name + " the root page failed: " + rootWhy + " Nothing was kept.");
      }
      if (!askedRoot) {
        session.warnings.push("The application had no root page: " + name + " is now its entry page (isRoot), the one it opens on. " +
          "Give root:true to the page that must be the entry page (a login page...).");
      }
    } else if (isStarterPage(currentRoot)) {
      session.warnings.push("The application still opens on the starter page Page: give root:true to the entry page (a login page...) " +
        "before deleting Page, or the app has no root page.");
    }
    // The visual identity: the theme given, else the default preset for an app that still shows the starter's colors,
    // whatever made its AppLayout (an agent wrote it by hand before the first generated page). An app whose styles give
    // it a primary color of its own keeps its look: changing it is ngx-theme-apply's job.
    var hadTheme = !!childNamed(app, "AppTheme");
    var themeApplied = null;
    try {
      if (themeSpec !== undefined) {
        themeApplied = G.applyTheme(projectDbo, app, themeSpec, session, tool);
      } else if (!hadTheme && G.hasStarterColors(app)) {
        themeApplied = G.applyTheme(projectDbo, app, {}, session, tool);
        session.warnings.push("The app still had the starter's colors: the default preset " + themeApplied.preset + " (" + themeApplied.tokens.brand + ", " +
          themeApplied.mode + ") was applied. Give the app its own identity with ngx-theme-apply (the user's brand color, or the preset that fits: " +
          Object.keys(G.THEME_PRESETS).join(", ") + ").");
      }
    } catch (themeError) {
      session.rollback();
      throw themeError;
    }
    if (themeApplied) {
      themeApplied.warnings.forEach(function (w) { session.warnings.push(w); });
    }
    var rootPage = makeRoot ? name : String(currentRoot.getName());
    var finish = session.finish(page);
    // The grid reaches the build only once the app is loaded again, when the app never used it (databaseobject_batch.js).
    if (gridLibrary && !gridLibrary.error && finish.saved) {
      var reload = C8O.dbo.reloadForLibraryComponents(projectName, { sharedcomponent: gridLibrary.sharedComponent });
      if (reload.length) {
        session.warnings.push(reload);
      }
    }
    var menuLabel = inMenu ? G.addMenuTranslation(projectDbo, title) : null;
    return {
      status: "ok",
      page: pageQName,
      kind: kind,
      created: session.created,
      style: "AppLayout " + styleStatus,
      theme: themeApplied ? themeApplied.style + " (preset " + themeApplied.preset + ", primary " + themeApplied.tokens.brand + ", mode " + themeApplied.mode + ")"
        : (hadTheme ? "AppTheme kept" : "none"),
      rootPage: rootPage,
      locals: Object.keys(locals),
      calls: (facade.length ? [projectName + "." + facade + " at page enter" + (filters.length ? " and on the filter button" : "")] : [])
        .concat(formPlan ? [projectName + "." + formPlan.submit + " on submit (" + formPlan.identifier + ")"] : []),
      saved: finish.saved,
      mobileBuilder: finish.mobileBuilder,
      menuLabel: menuLabel,
      badgeColors: Object.keys(derivedColors).length ? derivedColors : undefined,
      bindings: Object.keys(bindings).length ? bindings : undefined,
      library: gridLibrary && !gridLibrary.error ? { name: gridLibrary.library, status: gridLibrary.status, sharedComponent: gridLibrary.sharedComponent } : undefined,
      listRendering: gridPlans.length && !(gridLibrary && gridLibrary.error)
        ? gridPlans.map(function (gp) { return gp.label + ": AG Grid of " + GRID_LIBRARY + " (" + (gp.mode === "asked" ? "grid asked" : gp.cells + " cells") +
          "): sorting, filtering and paging in the grid, " + (gp.csv ? "a CSV button (in the dev viewer only, the library's CSV button logs an " +
          "NG0100 ExpressionChangedAfterItHasBeenChecked error: a defect of the library, not of the page, absent from a production build)" : "CSV export with grid.csv") +
          "; local " + gp.local + " holds its columns."; })
        : (gridHints.length ? gridHints.map(function (h) { return h + ": native table. The AG Grid of " + GRID_LIBRARY + " (marketplace library, a " +
          "standard Convertigo component) sorts, filters, pages and exports it: create the page again with " + h + ".grid true (" + h + ".grid {csv:true} for a CSV button)."; })
        : undefined),
      warnings: (defaulted.length ? ["English default texts were used for " + defaulted.join(", ") +
        ": if the app is in another language, change those texts on the page, or delete it and create it again with these fields in that language."] : [])
        .concat(warnings, session.warnings),
      next: "mobile-builder-open({project:\"" + projectName + "\", stateOnly:true}) to wait for the build, then open /" + segment + " in the viewer and check it with a screenshot."
    };
  };
})();
