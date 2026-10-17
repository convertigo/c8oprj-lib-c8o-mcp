/*
 * ngx-page-create: a list, detail, form or dashboard page built with the patterns of the "Basic presentation"
 * section of convertigo_frontend_ngx and the NGX pages of convertigo_recipe_multipage_app: page-enter event
 * with locals and a CallSequenceAction of the data facade, lost-session redirect, record and label/value
 * lists, KPI grid, UIForm with Form SmartSources, toast and navigation, and the AppLayout style.
 * Uses the validation and all-or-nothing helpers of js/tools_generators.js.
 */
include("js/tools_generators.js");

(function () {
  var G = C8O.generators;
  var H = G._;
  var str = H.str, isObj = H.isObj, parseJson = H.parseJson, list = H.list, IDENT = H.IDENT, jsString = H.jsString,
    upperFirst = H.upperFirst, lowerFirst = H.lowerFirst, qnameOf = H.qnameOf, childNamed = H.childNamed, invalid = H.invalid,
    projectOf = H.projectOf, variableNames = H.variableNames, batchErrors = H.batchErrors, batchWarnings = H.batchWarnings, Session = H.Session;

  // --- NGX page ----------------------------------------------------------------------------------

  var APP_LAYOUT_RULES = [
    [".app-page", ".app-page { max-width: 960px; margin: 0 auto; padding: 16px; }"],
    [".app-section", ".app-section { margin: 24px 0 8px; }"],
    [".app-filters", ".app-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; align-items: end; margin-bottom: 12px; }"],
    [".app-filter", ".app-filter { flex: 1 1 180px; min-width: 160px; }"],
    [".app-kpis", ".app-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }"],
    [".app-kpi", ".app-kpi { padding: 16px; border-radius: 12px; background: var(--ion-color-step-50, rgba(127,127,127,0.08)); }"],
    [".app-kpi-value", ".app-kpi-value { display: block; font-size: 28px; font-weight: 600; }"],
    [".app-kpi-label", ".app-kpi-label { display: block; opacity: 0.7; margin-top: 4px; }"],
    [".app-actions", ".app-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }"],
    [".app-empty", ".app-empty { opacity: 0.7; padding: 8px 0; }"],
    [".app-error", ".app-error { color: var(--ion-color-danger, #c0392b); padding: 8px 0; }"],
    [".app-badge", ".app-badge { margin-left: 8px; }"]
  ];

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

  // Variables of a facade sequence, to give every one of them explicitly on each call.
  function sequenceVariables(projectDbo, seqName) {
    var seq = childNamed(projectDbo, seqName);
    return seq ? variableNames(seq) : null;
  }

  function callVariable(name, value) {
    return { className: "ngx.components.UIControlVariable#UIControlVariable", name: name, properties: { varValue: value } };
  }

  // Navigation action from {page, kind: push|root|pop, data: {param: "TS expression"}}.
  function navAction(name, nav, scopeItem) {
    var kind = str(nav.kind || nav.mode || "push");
    if (kind === "pop") {
      return nxAction("PopPageAction", name, {});
    }
    var props = { page: { mode: "PLAIN", value: str(nav.page) } };
    if (isObj(nav.data) && Object.keys(nav.data).length) {
      props.data = { mode: "SCRIPT", value: "{" + Object.keys(nav.data).map(function (k) {
        var v = str(nav.data[k]);
        // {id: "id"} on a list row means the row field.
        if (scopeItem && IDENT.test(v)) {
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
      defaulted.push(field + " \"" + fallback + "\"");
      return fallback;
    };
    var spec = parseJson(args.spec, "spec", "object") || {};
    ["name", "title", "kind", "facade", "authRedirect", "root", "inMenu", "params", "vars", "filters", "list", "detail", "form", "dashboard", "actions", "heading",
      "authCodes", "segment", "icon", "filterLabel", "locals", "home", "comment"].forEach(function (k) {
      if (spec[k] === undefined && args[k] !== undefined && args[k] !== null && str(args[k]) !== "") {
        var raw = args[k];
        spec[k] = (["name", "title", "kind", "facade", "authRedirect", "heading", "segment", "icon", "filterLabel"].indexOf(k) >= 0) ? str(raw) : parseJson(raw, k, "string");
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
    var facade = str(spec.facade);
    var facadeVars = null;
    if (facade.length) {
      facadeVars = sequenceVariables(projectDbo, facade);
      if (facadeVars === null) {
        errors.push("facade " + facade + " is not a sequence of " + projectName + ": create it first (facade-create).");
      }
    } else if (kind !== "form") {
      errors.push("facade is required for a " + kind + " page (the sequence the page calls at page enter).");
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
    var classesUsed = { ".app-page": 1, ".app-error": 1 };
    var locals = { data: "null", error: "null", loading: "true" };
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
      locals[localName] = f.value !== undefined ? jsString(String(f.value)) : "''";
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
          options.push(forEach("Each" + pascal(f.name), "data." + str(fsrc.items || "items"), fit, [nx("SelectOption", "Opt",
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
      children.push(setLocal("StopLoading", "loading", "false"));
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

    // Record list: List > ForEach > ListItem > Label (h3 + p) + Note + Badge.
    function recordList(prefix, spec2, label) {
      if (!isObj(spec2)) {
        errors.push(label + " must be an object.");
        return [];
      }
      var item = str(spec2.item || "row");
      var itemsPath = "data." + str(spec2.items || "items");
      if (!IDENT.test(item)) {
        errors.push(label + ".item must be an identifier.");
      }
      if (!str(spec2.title).length && !isObj(spec2.title)) {
        errors.push(label + ".title is required (the main field of a row).");
      }
      var rowField = function (f) { return field(f, item); };
      var labelChildren = [nx("Heading3", "Main", {}, [expr(valueExpr(rowField, spec2.title))])];
      if (spec2.subtitle !== undefined) {
        labelChildren.push(nx("Paragraph", "Second", {}, [expr(valueExpr(rowField, spec2.subtitle))]));
      }
      var rowChildren = [nx("Label", "Lb", {}, labelChildren)];
      if (spec2.badge !== undefined) {
        var badge = isObj(spec2.badge) ? spec2.badge : { field: spec2.badge };
        var badgeChildren = [cls("app-badge"), expr(valueExpr(rowField, badge))];
        if (isObj(badge.colors)) {
          badgeChildren.push(attr("[color]", "Attr_color", colorExpr(rowField(badge.field), badge.colors)));
        }
        classesUsed[".app-badge"] = 1;
        rowChildren.push(nx("Badge", "Status", {}, badgeChildren));
      }
      if (spec2.note !== undefined) {
        rowChildren.push(nx("Note", "Nt", { IonSlot: { mode: "PLAIN", value: "end" } }, [expr(valueExpr(rowField, spec2.note))]));
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
        rowChildren.unshift(nx("CheckBox", "Pick", { IonSlot: { mode: "PLAIN", value: "start" },
          Checked: { mode: "SCRIPT", value: "(local?.selected || []).indexOf(" + keyInTemplate + ") >= 0" } }, [
          controlEvent("EventonChange", "ionChange", [setLocal("Toggle", "selected",
            "((s: any[], v: string) => s.indexOf(v) >= 0 ? s.filter((x: any) => x !== v) : s.concat([v]))((c8oPage.local.selected || []).slice(), " + keyInAction + ")")])
        ]));
      }
      if (isObj(spec2.onItem)) {
        if (!childNamed(app, str(spec2.onItem.page))) {
          warnings.push(label + ".onItem.page " + spec2.onItem.page + " is not a page of " + projectName + " yet: create it before the build.");
        }
        itemProps.Button = { mode: "PLAIN", value: "true" };
        itemProps.Detail = { mode: "PLAIN", value: "true" };
        rowChildren.push(controlEvent("EventonClick", "onClick", [navAction("Open", spec2.onItem, item)]));
      }
      classesUsed[".app-empty"] = 1;
      var empty = textOr(spec2.empty, "No record.", label + ".empty");
      var blocks = [
        ifDirective(prefix + "IfEmpty", "!local?.loading && !local?.error && !(" + localPath(itemsPath) + "?.length)", [nx("Paragraph", "EmptyText", {}, [cls("app-empty"), txt(empty)])]),
        nx("List", prefix + "List", {}, [forEach(prefix + "ForEach", itemsPath, item, [nx("ListItem", "Row", itemProps, rowChildren)])])
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
      return blocks;
    }

    function labelValueList(name, fields, base, label) {
      if (!Array.isArray(fields) || !fields.length) {
        errors.push(label + " must be a non-empty array of {label, field}.");
        return null;
      }
      var usedItems = {};
      return nx("List", name, { Lines: { mode: "PLAIN", value: "none" } }, fields.map(function (f, i) {
        if (!isObj(f) || !str(f.field).length) {
          errors.push(label + "[" + i + "] must be {label, field, labels?}.");
          return nx("ListItem", "F" + i, {}, []);
        }
        return nx("ListItem", uniqueName("F" + pascal(f.field), usedItems), {}, [
          nx("Label", "Lb", {}, [txt(str(f.label) || str(f.field))]),
          nx("Note", "Nt", { IonSlot: { mode: "PLAIN", value: "end" } }, [expr(valueExpr(function (p) { return localPath(base + "." + p); }, f))])
        ]);
      }));
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
      classesUsed[".app-actions"] = 1;
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
          if (str(a.page).length) {
            callChildren.push(navAction("Go", { page: a.page, kind: a.kind || "root", data: withSelection(a.data) }));
          }
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
      content.push(heading("Title", 2, headingText));
    }
    var formPlan = null;
    if (kind === "list") {
      var listSpec = isObj(spec.list) ? spec.list : null;
      if (!listSpec) {
        errors.push("list is required for a list page: {items, title, subtitle?, note?, badge?, empty?, onItem?}.");
      }
      if (filterNodes.length) {
        classesUsed[".app-filters"] = classesUsed[".app-filter"] = 1;
        filterNodes.push(nx("Button", "BtnFilter", {}, [txt(textOr(spec.filterLabel, "Filter", "filterLabel")),
          controlEvent("EventonClick", "onClick", [dataCall("Reload", 0)])]));
        content.push(nx("DivTag", "Filters", {}, [cls("app-filters")].concat(filterNodes)));
      }
      content.push(ifDirective("IfError", "local?.error", [nx("Paragraph", "ErrorText", {}, [cls("app-error"), expr("local?.error")])]));
      if (listSpec) {
        content = content.concat(recordList("Rec", listSpec, "list"));
      }
    } else if (kind === "detail") {
      var detail = isObj(spec.detail) ? spec.detail : null;
      if (!detail) {
        errors.push("detail is required for a detail page: {record?, fields:[{label, field}]}.");
      } else {
        content.push(ifDirective("IfError", "local?.error", [nx("Paragraph", "ErrorText", {}, [cls("app-error"), expr("local?.error")])]));
        var base = "data" + (str(detail.record).length ? "." + str(detail.record) : "");
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
        content.push(ifDirective("IfError", "local?.error", [nx("Paragraph", "ErrorText", {}, [cls("app-error"), expr("local?.error")])]));
        var kpis = list(dash.kpis);
        if (kpis.length) {
          classesUsed[".app-kpis"] = classesUsed[".app-kpi"] = classesUsed[".app-kpi-value"] = classesUsed[".app-kpi-label"] = 1;
          var usedKpis = {};
          content.push(nx("DivTag", "Kpis", {}, [cls("app-kpis")].concat(kpis.map(function (k, i) {
            if (!isObj(k) || !str(k.field).length) {
              errors.push("dashboard.kpis[" + i + "] must be {label, field}.");
              return txt("");
            }
            return nx("DivTag", uniqueName("Kpi" + pascal(k.field.split(".").pop()), usedKpis), {}, [cls("app-kpi"),
              nx("SpanTag", "Value", {}, [cls("app-kpi-value"), expr("(" + localPath("data." + k.field) + " ?? 0)")]),
              nx("SpanTag", "Label", {}, [cls("app-kpi-label"), txt(str(k.label) || k.field)])]);
          }))));
        }
        list(dash.sections).forEach(function (s, i) {
          if (!isObj(s)) {
            errors.push("dashboard.sections[" + i + "] must be an object.");
            return;
          }
          var prefix = "S" + (i + 1);
          classesUsed[".app-section"] = 1;
          content.push(nx("Heading3", prefix + "Title", {}, [cls("app-section"), txt(str(s.heading || s.label) || ("Section " + (i + 1)))]));
          if (Array.isArray(s.fields)) {
            var sbase = "data." + str(s.record);
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
          errors.push("form.submit " + form.submit + " is not a sequence of " + projectName + ": create the facade first.");
          submitVars = [];
        }
        var identifier = lowerFirst(name).replace(/Form$/, "") + "Form";
        var usedItems = {};
        var fieldsNodes = list(form.fields).map(function (f, i) {
          if (!isObj(f) || !IDENT.test(str(f.name))) {
            errors.push("form.fields[" + i + "] must be {name, label, type?, required?, options?, optionsFrom?, multiple?, value?}.");
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
          if (f.value !== undefined) {
            // The initial value is a TypeScript expression (new Date()..., c8oPage.navParams...): it is computed at page
            // enter into a local and the control reads that local. Written in the template, it broke the Angular build.
            var initLocal = "init" + pascal(f.name);
            locals[initLocal] = String(f.value);
            props.Value = { mode: "SOURCE", local: initLocal };
          }
          var control;
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
              opts.push(forEach("Each" + cname, "data." + str(src.items || "items"), it, [nx("SelectOption", "Opt", { Value: { mode: "SCRIPT", value: "'' + " + field(src.value || "id", it) } },
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
            delete props.LabelPlacement;
            control = nx("Toggle", "Tg" + cname, props);
          } else {
            if (["text", "email", "password", "number", "tel", "url", "date", "time"].indexOf(type) < 0) {
              errors.push("form.fields[" + i + "].type must be text, email, password, number, tel, url, date, time, textarea, select or toggle.");
            }
            props.Type = { mode: "PLAIN", value: type };
            control = nx("Input", "In" + cname, props);
          }
          return { spec: f, node: nx("FormItem", uniqueName("Fi" + cname, usedItems), {}, [control]) };
        }).filter(function (x) { return x; });
        var formChildren = fieldsNodes.map(function (x) { return x.node; });
        if (form.cancel !== false) {
          formChildren.push(nx("Button", "BtnCancel", { IonFill: { mode: "PLAIN", value: "outline" } }, [txt(textOr(form.cancelLabel, "Cancel", "form.cancelLabel")),
            controlEvent("EventonClick", "onClick", [navAction("Back", isObj(form.cancel) ? form.cancel : { kind: "pop" })])]));
        }
        formChildren.push(nx("SubmitButton", "BtnSubmit", { IonColor: { mode: "PLAIN", value: "primary" } }, [txt(textOr(form.submitLabel, "Save", "form.submitLabel"))]));
        content.push(ifDirective("IfError", "local?.error", [nx("Paragraph", "ErrorText", {}, [cls("app-error"), expr("local?.error")])]));
        content.push({ className: "ngx.components.UIForm#UIForm", name: "Form", properties: { identifier: identifier }, children: formChildren });
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
    if (facade.length) {
      pageEventChildren.push(dataCall("Load"));
    } else {
      pageEventChildren.push(setLocal("Loaded", "loading", "false"));
    }
    if (errors.length) {
      invalid(tool, errors);
    }

    var segment = str(spec.segment) || "path-to-" + name.toLowerCase();
    // In the menu by default: list and dashboard pages, which need no parameter; forms and details open from a page.
    var inMenu = spec.inMenu === undefined ? (kind === "list" || kind === "dashboard") : (spec.inMenu === true || String(spec.inMenu) === "true");
    var pageProps = { title: title, segment: segment, inAutoMenu: inMenu,
      comment: str(spec.comment) || (upperFirst(kind) + " page \"" + title + "\"" + (facade.length ? ", data from " + projectName + "." + facade : "") +
        (formPlan ? ", submits " + projectName + "." + formPlan.submit : "") + ". Generated by ngx-page-create.") };
    if (str(spec.icon).length) {
      pageProps.icon = str(spec.icon);
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
    var neededRules = APP_LAYOUT_RULES.filter(function (r) { return classesUsed[r[0]]; });
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
      var koChildren = [setLocal("StoreSubmitError", "error", submitError),
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
    var finish = session.finish(page);
    var menuLabel = inMenu ? G.addMenuTranslation(projectDbo, title) : null;
    return {
      status: "ok",
      page: pageQName,
      kind: kind,
      created: session.created,
      style: "AppLayout " + styleStatus,
      locals: Object.keys(locals),
      calls: (facade.length ? [projectName + "." + facade + " at page enter" + (filters.length ? " and on the filter button" : "")] : [])
        .concat(formPlan ? [projectName + "." + formPlan.submit + " on submit (" + formPlan.identifier + ")"] : []),
      saved: finish.saved,
      mobileBuilder: finish.mobileBuilder,
      menuLabel: menuLabel,
      warnings: (defaulted.length ? ["English default texts were used for " + defaulted.join(", ") +
        ": if the app is in another language, change those texts on the page, or delete it and create it again with these fields in that language."] : [])
        .concat(warnings, session.warnings),
      next: "mobile-builder-open({project:\"" + projectName + "\", stateOnly:true}) to wait for the build, then open /" + segment + " in the viewer and check it with a screenshot."
    };
  };
})();
