/*
 * nocode-app-create for lib_ConvertigoMCP: a Baserow application of C8Oforms from a short business spec, the No Code
 * counterpart of upsert-crud. An agent rebuilt the same patterns piece by piece in each conversation (3 to 7.5 minutes
 * and 30 to 64 tool calls for a data application on test-nocode, most of them reading contract sections and writing
 * the native Baserow encodings). This tool plans and applies the tables with C8O.nocodeBaserow.schemaApply, reads
 * their columns, writes the reduced form JSON of the proven patterns with the Baserow shorthand of the compiler
 * (source, saveTo, { field } references) and creates it with C8O.nocodeForms.create.
 * Requires js/nocode_forms.js and js/nocode_baserow.js.
 */

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.nocodeApp = C8O.nocodeApp || {};

(function () {
  var FIELD_TYPES = ["text", "long_text", "number", "date", "boolean", "single_select", "email", "phone_number", "url", "link_row", "rating"];
  var FIELD_TYPE_ALIASES = { string: "text", textarea: "long_text", integer: "number", decimal: "number", amount: "number", datetime: "date", select: "single_select", choice: "single_select", checkbox: "boolean", bool: "boolean", phone: "phone_number", tel: "phone_number", link: "link_row", relation: "link_row" };
  // Computed or managed by Baserow: shown in lists and details, never entered.
  var READ_ONLY_TYPES = ["formula", "lookup", "rollup", "count", "created_on", "created_by", "last_modified", "last_modified_by", "autonumber", "uuid"];
  // What lib_BaseRow.forms_AddRow writes from an input of the same name. A boolean is entered with a Oui/Non radio and
  // written by a hidden field of the column's name (booleanInput).
  var ENTERED_TYPES = ["text", "long_text", "number", "date", "single_select", "email", "phone_number", "url", "rating", "link_row", "boolean"];
  var SCREENS = ["list", "form", "detail", "dashboard"];
  var AGGREGATIONS = ["count", "sum", "avg", "min", "max"];
  var NUMERIC_TYPES = ["number", "rating", "count", "rollup", "autonumber"];
  var PAGE_ICONS = { home: "home", list: "list", form: "add", detail: "document-text", dashboard: "stats-chart" };
  var LIST_COLUMN_LIMIT = 5;
  // A choice list fed by the options of a column (formssource_GetFieldValues) submits the id of the option: the
  // viewer sent "12779" for Haute on test-nocode, which contains never matches. The viewer drops a condition whose
  // value is empty, so an empty choice or search keeps every row.
  var CHOICE_FILTER_OPERATOR = "single_select_equal";
  var SEARCH_OPERATOR = "contains";
  var SEARCH_BAR_STYLE = { margin: "0 0 16px 0", padding: "12px 12px 0 12px", border: "1px solid #E2E8F0", borderRadius: "12px", backgroundColor: "#FFFFFF" };
  var THUMBNAIL_COLOR = "#2563EB";
  var BACKGROUND_COLOR = "#F8FAFC";

  function trimmed(value) {
    return value == null ? "" : String(value).trim();
  }

  function ensureArray(value) {
    if (Array.isArray(value)) { return value; }
    if (value == null) { return []; }
    return [value];
  }

  function hasOwn(value, key) {
    return value != null && Object.prototype.hasOwnProperty.call(value, key);
  }

  function capitalize(text) {
    var value = trimmed(text);
    return value.length ? value.charAt(0).toUpperCase() + value.substring(1) : value;
  }

  function lowerFirst(text) {
    var value = trimmed(text);
    // Keep acronyms (ID, TVA) as they are.
    return value.length > 1 && value.charAt(1) === value.charAt(1).toLowerCase() ? value.charAt(0).toLowerCase() + value.substring(1) : value;
  }

  var ACCENTS = { "à": "a", "â": "a", "ä": "a", "á": "a", "ç": "c", "é": "e", "è": "e", "ê": "e", "ë": "e", "î": "i", "ï": "i", "í": "i", "ô": "o", "ö": "o", "ó": "o", "ù": "u", "û": "u", "ü": "u", "ú": "u", "ÿ": "y", "ñ": "n", "œ": "oe", "æ": "ae" };
  function slug(text) {
    var value = trimmed(text).toLowerCase().replace(/[^\u0000-\u007f]/g, function (c) { return hasOwn(ACCENTS, c) ? ACCENTS[c] : "_"; });
    value = value.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return value.length ? value : "item";
  }

  function fail(path, message) {
    throw { specError: true, path: path, message: message };
  }

  // ---- Texts -------------------------------------------------------------------------------------------------------

  var VOWEL = /^[aeiouyhàâäéèêëîïôöùûü]/i;
  function frenchArticle(word, feminine) { return VOWEL.test(word) ? "l'" : (feminine ? "la " : "le "); }

  function entityTexts(language, entity, multiple) {
    var one = trimmed(entity.name);
    var many = trimmed(entity.plural);
    var fem = entity.feminine === true;
    if (language === "fr") {
      var newTitle = (fem ? "Nouvelle " : (VOWEL.test(one) ? "Nouvel " : "Nouveau ")) + one;
      return {
        listTitle: capitalize(many),
        listSubtitle: (fem ? "Toutes les " : "Tous les ") + many + ".",
        formTitle: newTitle,
        formSubtitle: "Remplissez les champs puis enregistrez.",
        detailTitle: capitalize(one),
        detailSubtitle: capitalize(frenchArticle(one, fem) + one) + " sélectionné" + (fem ? "e" : "") + " dans la liste.",
        dashboardTitle: multiple ? "Tableau de bord des " + many : "Tableau de bord",
        chartLabel: function (groupBy) { return capitalize(many) + " par " + lowerFirst(groupBy); },
        section: capitalize(one),
        save: "Enregistrer",
        cancel: "Annuler",
        back: "Retour à la liste",
        home: "Accueil",
        openDetail: "Voir le détail",
        search: "Rechercher",
        searchPlaceholder: function (columns) { return "Rechercher dans " + columns.map(lowerFirst).join(", "); },
        clear: "Effacer",
        apply: "Rechercher",
        all: "Tous",
        saved: capitalize(one) + " enregistré" + (fem ? "e" : ""),
        // Shown under the list whether it has rows or not: a hint, not an empty state.
        empty: function (hasForm) { return "Les " + many + " enregistré" + (fem ? "es" : "s") + " apparaissent ici." + (hasForm ? " Utilisez « " + newTitle + " » pour en ajouter " + (fem ? "une." : "un.") : ""); },
        saveFlow: "Enregistrer " + frenchArticle(one, fem) + one,
        cancelFlow: "Annuler la saisie",
        clearFlow: "Effacer la recherche",
        applyFlow: "Appliquer les filtres",
        open: function (title) { return "Afficher " + lowerFirst(title); },
        aggregation: { count: "Nombre de " + many, sum: "Total ", avg: "Moyenne ", min: "Minimum ", max: "Maximum " },
        yesNo: ["Oui", "Non"]
      };
    }
    return {
      listTitle: capitalize(many),
      listSubtitle: "All " + many + ".",
      formTitle: "New " + one,
      formSubtitle: "Fill in the fields, then save.",
      detailTitle: capitalize(one),
      detailSubtitle: "The " + one + " selected in the list.",
      dashboardTitle: multiple ? capitalize(many) + " dashboard" : "Dashboard",
      chartLabel: function (groupBy) { return capitalize(many) + " by " + lowerFirst(groupBy); },
      section: capitalize(one),
      save: "Save",
      cancel: "Cancel",
      back: "Back to the list",
      home: "Home",
      openDetail: "View details",
      search: "Search",
      searchPlaceholder: function (columns) { return "Search in " + columns.map(lowerFirst).join(", "); },
      clear: "Clear",
      apply: "Search",
      all: "All",
      saved: capitalize(one) + " saved",
      empty: function (hasForm) { return "Saved " + many + " show here." + (hasForm ? " Use “New " + one + "” to add one." : ""); },
      saveFlow: "Save the " + one,
      cancelFlow: "Cancel the entry",
      clearFlow: "Clear the search",
      applyFlow: "Apply the filters",
      open: function (title) { return "Open " + lowerFirst(title); },
      aggregation: { count: "Number of " + many, sum: "Total ", avg: "Average ", min: "Minimum ", max: "Maximum " },
      yesNo: ["Yes", "No"]
    };
  }

  function appTexts(language) {
    return language === "fr"
      ? { homeTitle: "Accueil", homeSubtitle: "Choisissez ce que vous voulez faire.", home: "Accueil", homeFlow: "Revenir à l'accueil" }
      : { homeTitle: "Home", homeSubtitle: "Choose what you want to do.", home: "Home", homeFlow: "Back to home" };
  }

  // ---- Spec --------------------------------------------------------------------------------------------------------

  function normalizeFieldSpec(raw, path, language) {
    if (typeof raw === "string") { raw = { name: raw }; }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { fail(path, "a field is { name, type, required, options, default }"); }
    var name = trimmed(raw.name);
    if (!name.length) { fail(path + ".name", "a field needs the name of its Baserow column, in the user's language (it is the list header)"); }
    var type = trimmed(raw.type || "text").toLowerCase();
    if (hasOwn(FIELD_TYPE_ALIASES, type)) { type = FIELD_TYPE_ALIASES[type]; }
    if (FIELD_TYPES.indexOf(type) < 0) { fail(path + ".type", "type is one of " + FIELD_TYPES.join(", ")); }
    var field = { name: name, type: type, required: raw.required === true || raw.mandatory === true };
    if (type === "single_select") {
      field.options = ensureArray(raw.options || raw.values || raw.choices).map(trimmed).filter(function (option) { return option.length; });
    }
    if (type === "boolean") {
      // See ENTERED_TYPES: a yes/no question is a single select the list and the filters read as text.
      field.type = "single_select";
      field.options = language === "fr" ? ["Oui", "Non"] : ["Yes", "No"];
      field.fromBoolean = true;
    }
    if (type === "number" && raw.decimals != null) {
      var decimals = Number(raw.decimals);
      if (!(decimals >= 0 && decimals <= 10 && Math.floor(decimals) === decimals)) { fail(path + ".decimals", "decimals is a whole number from 0 to 10"); }
      field.decimals = decimals;
    }
    if (type === "rating" && raw.max != null) { field.max = Number(raw.max); }
    if (type === "link_row") {
      field.targetTable = raw.targetTable != null ? raw.targetTable : (raw.table != null ? raw.table : raw.target);
      if (field.targetTable == null || !trimmed(field.targetTable).length) { fail(path + ".targetTable", "a link_row names the entity or the table it points to"); }
    }
    if (raw["default"] != null) {
      var value = trimmed(raw["default"]);
      if (["user", "user.name", "user.email", "today", "now"].indexOf(value) < 0) { fail(path + ".default", "default is user, user.email or today"); }
      field.defaultValue = value;
    }
    if (trimmed(raw.label).length) { field.label = trimmed(raw.label); }
    if (trimmed(raw.placeholder).length) { field.placeholder = trimmed(raw.placeholder); }
    return field;
  }

  function normalizeScreens(raw, path) {
    var screens = {};
    if (raw == null) { raw = { list: true, form: true }; }
    if (Array.isArray(raw)) {
      raw.forEach(function (name) { screens[trimmed(name)] = {}; });
    } else if (typeof raw === "object") {
      Object.keys(raw).forEach(function (name) {
        var value = raw[name];
        if (value === false || value == null) { return; }
        screens[name] = value === true ? {} : value;
      });
    } else {
      fail(path, "screens is { list, form, detail, dashboard }, each true or an object");
    }
    Object.keys(screens).forEach(function (name) {
      if (SCREENS.indexOf(name) < 0) { fail(path + "." + name, "screens are " + SCREENS.join(", ")); }
      if (typeof screens[name] !== "object" || Array.isArray(screens[name])) { fail(path + "." + name, "a screen is true or an object"); }
    });
    if (!Object.keys(screens).length) { fail(path, "ask for at least one screen: list, form, detail or dashboard"); }
    if (screens.detail && !screens.list) { fail(path + ".detail", "the detail page shows the row selected in the list: ask for the list too"); }
    return screens;
  }

  function normalizeEntity(raw, index, language) {
    var path = "entities[" + index + "]";
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { fail(path, "an entity is { name, plural, table, fields, screens }"); }
    var name = trimmed(raw.name || raw.singular);
    if (!name.length) { fail(path + ".name", "name is the singular business name, for example \"demande\""); }
    var entity = {
      name: name,
      plural: trimmed(raw.plural) || name + "s",
      feminine: raw.feminine === true || (raw.masculine === false) || ["f", "feminine", "féminin"].indexOf(trimmed(raw.gender).toLowerCase()) >= 0,
      key: slug(name),
      fields: ensureArray(raw.fields || raw.columns).map(function (field, f) { return normalizeFieldSpec(field, path + ".fields[" + f + "]", language); }),
      screens: normalizeScreens(raw.screens, path + ".screens")
    };
    var table = raw.table != null ? raw.table : (raw.tableId != null ? raw.tableId : null);
    if (table && typeof table === "object" && !Array.isArray(table)) { table = table.id != null ? table.id : table.name; }
    if (typeof table === "number" || /^\d+$/.test(trimmed(table))) {
      entity.tableId = Number(table);
    } else {
      entity.tableName = trimmed(table) || capitalize(entity.plural);
      if (!entity.fields.length) { fail(path + ".fields", "a new table needs its fields; give the id of an existing table in table to reuse its columns"); }
      if (!entity.fields.some(function (field) { return field.type === "text"; })) { fail(path + ".fields", "a new table needs a text field: the first one is its primary field"); }
    }
    var seen = {};
    entity.fields.forEach(function (field, f) {
      var key = field.name.toLowerCase();
      if (seen[key]) { fail(path + ".fields[" + f + "].name", "two fields are named " + field.name); }
      seen[key] = true;
    });
    return entity;
  }

  function normalizeSpec(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { fail("", "the spec is { name, language, baserow, entities }"); }
    var name = trimmed(raw.name);
    if (!name.length) { fail("name", "name is the visible name of the application"); }
    var language = trimmed(raw.language || raw.lang || "fr").toLowerCase().substring(0, 2);
    if (["fr", "en"].indexOf(language) < 0) { fail("language", "language is fr or en"); }
    var mode = trimmed(raw.mode || "apply").toLowerCase();
    if (["plan", "apply"].indexOf(mode) < 0) { fail("mode", "mode is plan or apply"); }
    var entities = ensureArray(raw.entities);
    if (!entities.length) { fail("entities", "list the business entities: [{ name, plural, table, fields, screens }]"); }
    var app = {
      name: name,
      description: trimmed(raw.description),
      language: language,
      mode: mode,
      baserow: raw.baserow && typeof raw.baserow === "object" ? raw.baserow : {},
      entities: entities.map(function (entity, e) { return normalizeEntity(entity, e, language); })
    };
    var keys = {};
    app.entities.forEach(function (entity, e) {
      if (keys[entity.key]) { fail("entities[" + e + "].name", "two entities are named " + entity.name); }
      keys[entity.key] = true;
    });
    // The list is the hub of its entity: its buttons open the entry form and the detail. A home page links the
    // entities, and the screens a list does not lead to (a dashboard, a form without a list).
    var needsHome = app.entities.length > 1 || app.entities.some(function (entity) {
      var s = entity.screens;
      return s.list ? !!s.dashboard : !!(s.form && s.dashboard);
    });
    if (raw.home === true || (raw.home && typeof raw.home === "object")) {
      app.home = raw.home === true ? {} : raw.home;
    } else if (raw.home !== false && needsHome) {
      app.home = {};
    } else if (raw.home === false && needsHome) {
      fail("home", "without a home page some pages could not be reached: keep it or ask for fewer screens");
    }
    return app;
  }

  // ---- Baserow -----------------------------------------------------------------------------------------------------

  function flattenCatalog(workspaces) {
    var catalog = { workspaces: [], bases: [], tables: [] };
    ensureArray(workspaces).forEach(function (workspace) {
      catalog.workspaces.push({ id: workspace.id, name: workspace.name });
      ensureArray(workspace.bases).forEach(function (base) {
        catalog.bases.push({ id: base.id, name: base.name, workspaceId: workspace.id, workspaceName: workspace.name });
        ensureArray(base.tables).forEach(function (table) {
          catalog.tables.push({ id: Number(table.id), name: table.name, baseId: base.id, baseName: base.name, workspaceId: workspace.id, path: [workspace.name, base.name, table.name].join("~>") });
        });
      });
    });
    return catalog;
  }

  function catalogTable(catalog, id) {
    return catalog.tables.filter(function (table) { return Number(table.id) === Number(id); })[0] || null;
  }

  function baseTable(catalog, baseId, name) {
    return catalog.tables.filter(function (table) { return Number(table.baseId) === Number(baseId) && trimmed(table.name).toLowerCase() === trimmed(name).toLowerCase(); })[0] || null;
  }

  // The workspaces to choose from, without listing every base: a test account answered more than 30 of them.
  function workspaceSummary(catalog) {
    return catalog.workspaces.map(function (workspace) {
      var bases = catalog.bases.filter(function (base) { return base.workspaceId === workspace.id; });
      var out = { id: workspace.id, name: workspace.name, baseCount: bases.length };
      if (bases.length) { out.bases = bases.slice(0, 5).map(function (base) { return { id: base.id, name: base.name }; }); }
      return out;
    });
  }

  // No Code Studio gives each user a workspace of their own, named after their e-mail ("Convertigo NoCode Databases -
  // <e-mail>" on test-nocode): with several workspaces it is the one an application of the user goes to.
  function ownWorkspace(catalog, user) {
    var email = trimmed(user).toLowerCase().split(":").pop();
    if (email.indexOf("@") < 0) { return null; }
    var own = catalog.workspaces.filter(function (workspace) { return trimmed(workspace.name).toLowerCase().indexOf(email) >= 0; });
    return own.length === 1 ? own[0] : null;
  }

  // The base of the new tables: the one given, else the one of the existing tables, else a base named after the
  // application in the user's only workspace. Several workspaces and nothing given: the user chooses.
  function destination(app, catalog, user) {
    var given = app.baserow;
    var existing = app.entities.filter(function (entity) { return entity.tableId != null; }).map(function (entity) { return catalogTable(catalog, entity.tableId); });
    var needsBase = app.entities.some(function (entity) { return entity.tableId == null; });
    var base = null;
    if (given.baseId != null) {
      base = catalog.bases.filter(function (item) { return Number(item.id) === Number(given.baseId); })[0];
      if (!base) { return { error: { code: "base_not_in_catalog", message: "Base " + given.baseId + " is not among the bases of the authenticated user.", workspaces: workspaceSummary(catalog) } }; }
      return { base: base };
    }
    var workspace = null;
    if (given.workspaceId != null || trimmed(given.workspaceName).length) {
      workspace = catalog.workspaces.filter(function (item) { return given.workspaceId != null ? Number(item.id) === Number(given.workspaceId) : trimmed(item.name).toLowerCase() === trimmed(given.workspaceName).toLowerCase(); })[0];
      if (!workspace) { return { error: { code: "workspace_not_in_catalog", message: "Workspace " + (given.workspaceId != null ? given.workspaceId : given.workspaceName) + " is not among the workspaces of the authenticated user.", workspaces: workspaceSummary(catalog) } }; }
    }
    var baseName = trimmed(given.baseName);
    if (!baseName.length && !needsBase && existing.length) {
      base = catalog.bases.filter(function (item) { return Number(item.id) === Number(existing[0].baseId); })[0];
      return { base: base };
    }
    if (!workspace) {
      if (existing.length) {
        workspace = catalog.workspaces.filter(function (item) { return item.id === existing[0].workspaceId; })[0];
      } else if (catalog.workspaces.length === 1) {
        workspace = catalog.workspaces[0];
      } else if (ownWorkspace(catalog, user)) {
        workspace = ownWorkspace(catalog, user);
      } else {
        return { error: { code: catalog.workspaces.length ? "workspace_required" : "no_workspace", message: catalog.workspaces.length ? "The user has several Baserow workspaces: give baserow.baseId (an existing base) or baserow.workspaceId with baserow.baseName (a new base)." : "The user has no Baserow workspace: ask them to open the No Code Studio data tab once.", workspaces: workspaceSummary(catalog) } };
      }
    }
    baseName = baseName || app.name;
    base = catalog.bases.filter(function (item) { return item.workspaceId === workspace.id && trimmed(item.name).toLowerCase() === baseName.toLowerCase(); })[0];
    return base ? { base: base } : { base: { id: null, name: baseName, workspaceId: workspace.id, workspaceName: workspace.name }, newBase: true };
  }

  function schemaField(field, app) {
    var out = { name: field.name, type: field.type };
    if (field.type === "single_select") { out.values = field.options; }
    if (field.type === "link_row") { out.targetTable = field.targetTableName; }
    if (field.type === "number") { out.baserowOptions = { number_decimal_places: field.decimals || 0 }; }
    if (field.type === "date") { out.baserowOptions = { date_format: app.language === "fr" ? "EU" : "US", date_include_time: false }; }
    if (field.type === "rating") { out.baserowOptions = { max_value: field.max || 5 }; }
    return out;
  }

  // The tables to create, and the fields an existing table of the target base lacks.
  function buildSchema(app, catalog, target, columnsByEntity) {
    var tables = [];
    app.entities.forEach(function (entity) {
      entity.fields.forEach(function (field) {
        if (field.type !== "link_row") { return; }
        var other = app.entities.filter(function (item) { return item.key === slug(field.targetTable) || trimmed(item.tableName).toLowerCase() === trimmed(field.targetTable).toLowerCase() || (item.tableId != null && String(item.tableId) === trimmed(field.targetTable)); })[0];
        if (other && other.tableName) { field.targetTableName = other.tableName; }
        else if (other) { field.targetTableName = catalogTable(catalog, other.tableId).name; }
        else { field.targetTableName = trimmed(field.targetTable); }
      });
      if (entity.tableId == null) {
        var primary = entity.fields.filter(function (field) { return field.type === "text"; })[0];
        tables.push({ name: entity.tableName, primaryField: primary.name, fields: entity.fields.map(function (field) { return schemaField(field, app); }) });
        return;
      }
      var known = {};
      ensureArray(columnsByEntity[entity.key]).forEach(function (column) { known[trimmed(column.name).toLowerCase()] = true; });
      var missing = entity.fields.filter(function (field) { return !known[field.name.toLowerCase()]; });
      if (!missing.length) { return; }
      var table = catalogTable(catalog, entity.tableId);
      if (target.base.id == null || Number(table.baseId) !== Number(target.base.id)) {
        fail("entities[" + app.entities.indexOf(entity) + "].fields", "table " + table.name + " has no column " + missing.map(function (field) { return field.name; }).join(", ") + ", and it is not in the base of the application: add them with nocode-baserow-schema-apply first");
      }
      tables.push({ id: table.id, name: table.name, fields: missing.map(function (field) { return schemaField(field, app); }) });
    });
    if (!tables.length) { return null; }
    var schema = { tables: tables };
    if (target.base.id != null) { schema.baseId = target.base.id; } else { schema.baseName = target.base.name; schema.workspaceId = target.base.workspaceId; }
    return schema;
  }

  // ---- Reduced form ------------------------------------------------------------------------------------------------

  function cols(sizes) {
    var out = sizes.map(function (size) { return { size: size }; });
    while (out.length < 6) { out.push({ size: 0 }); }
    return out;
  }

  function actionLayout(name, buttons) {
    var size = buttons.length >= 3 ? 4 : (buttons.length === 2 ? 6 : 12);
    var sizes = buttons.map(function () { return size; });
    return { type: "layout", name: name, cols: cols(sizes), tablet: cols(sizes), phoneL: cols([12]), phoneP: cols([12]), children: buttons };
  }

  function button(name, label, icon, variant, flow, extra) {
    var out = { type: "button", name: name, label: label, icon: icon, variant: variant, flow: flow, expand: "block" };
    Object.keys(extra || {}).forEach(function (key) { out[key] = extra[key]; });
    return out;
  }

  function isReadOnly(column) {
    return column.read_only === true || column.readOnly === true || READ_ONLY_TYPES.indexOf(trimmed(column.type)) >= 0;
  }

  // The reduced JSON and the outline of the application, from the entities and the actual columns of their tables.
  function buildReduced(app, model) {
    var reduced = {
      name: app.name,
      description: app.description || undefined,
      language: app.language,
      navigationMode: "custom",
      thumbnailColor: THUMBNAIL_COLOR,
      backgroundColor: BACKGROUND_COLOR,
      pages: [],
      flows: []
    };
    if (!reduced.description) { delete reduced.description; }
    var outline = { pages: [] };
    var global = appTexts(app.language);
    var multiple = app.entities.length > 1;
    var usedNames = {};
    var usedPages = {};
    function claim(name, what) {
      var key = trimmed(name);
      if (usedNames[key]) { fail("", "two components would be named " + key + " (" + what + "): rename a field or an entity"); }
      usedNames[key] = true;
      return key;
    }
    function page(title, kind, header, fields, notes) {
      if (usedPages[title.toLowerCase()]) { fail("", "two pages would be named " + title + ": give the screens a title"); }
      usedPages[title.toLowerCase()] = true;
      reduced.pages.push({ name: title, iconName: PAGE_ICONS[kind], header: header, fields: fields });
      outline.pages.push({ name: title, kind: kind, components: notes });
    }
    function flow(id, name, elements) {
      reduced.flows.push({ id: id, name: name, elements: elements });
      return id;
    }
    // Inputs carry the names of their columns (forms_AddRow matches them); a name another entity took first is
    // prefixed, and that entity's form writes its columns explicitly (forms_AddRowFromData).
    var inputNames = {};
    app.entities.forEach(function (entity) {
      var spec = model[entity.key];
      spec.inputs = spec.columns.filter(function (column) { return spec.entered(column); }).map(function (column) {
        var name = column.name;
        if (usedNames[name] || inputNames[name]) { name = entity.key + "_" + slug(column.name); spec.explicitSave = true; }
        inputNames[name] = true;
        return { column: column, name: name };
      });
    });
    Object.keys(inputNames).forEach(function (name) { claim(name, "an input"); });

    var homeTitle = app.home ? (trimmed(app.home.title) || global.homeTitle) : null;
    var homeButtons = [];

    app.entities.forEach(function (entity) {
      var spec = model[entity.key];
      var t = entityTexts(app.language, entity, multiple);
      var screens = entity.screens;
      var k = entity.key;
      var titles = {
        list: trimmed(screens.list && screens.list.title) || t.listTitle,
        form: trimmed(screens.form && screens.form.title) || t.formTitle,
        detail: trimmed(screens.detail && screens.detail.title) || t.detailTitle,
        dashboard: trimmed(screens.dashboard && screens.dashboard.title) || t.dashboardTitle
      };
      var listName = k + "_list";
      var chartName = k + "_chart";
      var flows = {};
      SCREENS.forEach(function (screen) {
        if (screens[screen]) { flows[screen] = flow("open_" + k + "_" + screen, t.open(titles[screen]), [{ type: "push_page", targetPage: titles[screen] }]); }
      });
      // Where the form goes back to; a single page needs none.
      var backPage = screens.list ? titles.list : homeTitle;
      function homeButton(where) { return button(claim(k + "_" + where + "_home", "a button"), global.home, "home", "ghost", "open_home"); }

      if (screens.form) { homeButtons.push(button(claim(k + "_home_form", "a button"), titles.form, "add", "primary", flows.form)); }
      if (screens.list) { homeButtons.push(button(claim(k + "_home_list", "a button"), titles.list, "list", "secondary", flows.list)); }
      if (screens.dashboard) { homeButtons.push(button(claim(k + "_home_dashboard", "a button"), titles.dashboard, "stats-chart", "secondary", flows.dashboard)); }

      if (screens.list) {
        var list = screens.list;
        var listColumns = spec.listColumns;
        var notes = [];
        var fields = [];
        var searchColumns = spec.searchColumns;
        var filterColumns = spec.filterColumns;
        var conditions = [];
        var searchName = k + "_search";
        filterColumns.forEach(function (column) {
          conditions.push({ column: column, operator: CHOICE_FILTER_OPERATOR, value: { field: k + "_filter_" + slug(column) } });
        });
        if (searchColumns.length) {
          var search = searchColumns.map(function (column) { return { column: column, operator: SEARCH_OPERATOR, value: { field: searchName } }; });
          conditions.push(search.length > 1 ? { any: search } : search[0]);
        }
        if (searchColumns.length || filterColumns.length) {
          if (filterColumns.length > 2) { fail("entities[" + app.entities.indexOf(entity) + "].screens.list.filters", "a list takes at most two filters next to its search"); }
          var inputs = [];
          if (searchColumns.length) {
            inputs.push({ type: "text", name: claim(searchName, "the search field"), label: t.search, placeholder: t.searchPlaceholder(searchColumns), config: { type: "search" } });
          }
          filterColumns.forEach(function (column) {
            inputs.push({ type: "select", name: claim(k + "_filter_" + slug(column), "a filter"), label: column, placeholder: t.all, source: { table: spec.table, field: column } });
          });
          var clear = button(claim(k + "_clear", "a button"), t.clear, "close", "ghost", flow("clear_" + k, t.clearFlow, [
            { type: "reset_fields", scope: "component", targetField: k + "_search_bar" },
            { type: "refresh_grid", targetGrid: listName }
          ]));
          var bar;
          if (!filterColumns.length) {
            // A typed search reloads the list by itself.
            bar = { type: "layout", name: claim(k + "_search_bar", "the search bar"), cols: cols([9, 3]), tablet: cols([9, 3]), phoneL: cols([12]), phoneP: cols([12]), children: inputs.concat([clear]) };
          } else {
            // Choosing an option does not reload the list (C8Oforms viewer, 22/10 on test-nocode): a button applies it.
            var apply = button(claim(k + "_apply", "a button"), t.apply, "search", "secondary", flow("apply_" + k, t.applyFlow, [{ type: "refresh_grid", targetGrid: listName }]));
            var widths = inputs.length === 1 ? [12] : (inputs.length === 2 ? [7, 5] : [6, 3, 3]);
            // Inside the bar the compiler gives no role spacing: the group of buttons is made transparent here.
            apply.expand = "false";
            clear.expand = "false";
            var searchActions = { type: "layout", name: claim(k + "_search_actions", "the search actions"), cols: cols([3, 3]), tablet: cols([4, 4]), phoneL: cols([6, 6]), phoneP: cols([6, 6]), children: [apply, clear] };
            searchActions.boxStyle = { margin: "0 0 12px 0", padding: "0", border: "0", backgroundColor: "transparent" };
            searchActions.layoutChildrenStyle = { "default": { margin: "0", padding: "0 8px 0 0", border: "0", backgroundColor: "transparent" } };
            bar = { type: "layout", name: claim(k + "_search_bar", "the search bar"), cols: cols([12]), tablet: cols([12]), phoneL: cols([12]), phoneP: cols([12]), children: [
              { type: "layout", name: claim(k + "_search_fields", "the search fields"), cols: cols(widths), tablet: cols(widths), phoneL: cols([12]), phoneP: cols([12]), children: inputs },
              searchActions
            ] };
          }
          bar.sticky = "always";
          bar.boxStyle = SEARCH_BAR_STYLE;
          fields.push(bar);
          notes.push(k + "_search_bar: always visible" + (searchColumns.length ? ", search in " + searchColumns.join(" OR ") : "") + (filterColumns.length ? ", filter by " + filterColumns.join(", ") + " (applied by its " + t.apply + " button)" : ""));
        }
        var source = { table: spec.table, columns: spec.gridColumns, hidden: spec.gridColumns.filter(function (column) { return listColumns.indexOf(column) < 0; }) };
        if (conditions.length) { source.filter = conditions.length > 1 ? { all: conditions } : conditions[0]; }
        if (trimmed(list.sort).length) { source.sort = trimmed(list.sort); }
        fields.push({ type: "grid", name: claim(listName, "the list"), returned_value: "row_selected", AutoSizeColumns: false, source: source });
        notes.push(listName + ": " + spec.tableLabel + ", columns " + listColumns.join(", ") + (source.hidden.length ? " (hidden for the detail: " + source.hidden.join(", ") + ")" : "") + (source.sort ? ", sort " + source.sort : ""));
        fields.push({ type: "description", name: claim(k + "_empty", "the empty state"), description: "<p style=\"margin:0;color:#64748B\">" + escapeHtml(t.empty(!!screens.form)) + "</p>" });
        var listButtons = [];
        if (screens.form) { listButtons.push(button(claim(k + "_list_new", "a button"), titles.form, "add", "primary", flows.form)); }
        if (screens.detail) { listButtons.push(button(claim(k + "_list_detail", "a button"), t.openDetail, "document-text", screens.form ? "secondary" : "primary", flows.detail, { disabledIf: { field: listName, operator: "is_empty" } })); }
        if (homeTitle) { listButtons.push(homeButton("list")); }
        if (listButtons.length) {
          fields.push(actionLayout(claim(k + "_list_actions", "the actions"), listButtons));
          notes.push(k + "_list_actions: " + listButtons.map(function (item) { return item.label; }).join(", "));
        }
        page(titles.list, "list", { title: titles.list, subtitle: trimmed(list.subtitle) || t.listSubtitle }, fields, notes);
      }

      if (screens.detail) {
        var detailFields = spec.detailColumns.map(function (column) {
          return detailField(column, claim(k + "_detail_" + slug(column.name), "a detail field"), listName, app, t);
        });
        page(titles.detail, "detail", { title: titles.detail, subtitle: trimmed(screens.detail.subtitle) || t.detailSubtitle }, [
          { type: "section", name: claim(k + "_detail_main", "the detail section"), title: t.section, columns: 2, fields: detailFields },
          actionLayout(claim(k + "_detail_actions", "the actions"), [button(claim(k + "_detail_back", "a button"), t.back, "arrow-back", "secondary", flows.list)])
        ], [k + "_detail_main: " + spec.detailColumns.map(function (column) { return column.name; }).join(", ") + ", read from the row selected in " + listName]);
      }

      if (screens.form) {
        var inputs = [];
        spec.inputs.forEach(function (input) {
          if (trimmed(input.column.type) === "boolean") { Array.prototype.push.apply(inputs, booleanInput(input, spec, t, claim)); return; }
          inputs.push(inputField(input, spec, entity, app, t));
        });
        var save = { type: "submit", name: k + "_save_row", saveTo: { table: spec.table } };
        if (spec.explicitSave) {
          save.saveTo.values = {};
          spec.inputs.forEach(function (input) { save.saveTo.values[input.column.name] = input.name; });
        }
        var saveElements = [save, { type: "toast", message: t.saved, color: "success", duration: 3, position: "bottom" }];
        if (screens.list) { saveElements.push({ type: "refresh_grid", targetGrid: listName }); }
        if (screens.dashboard) { saveElements.push({ type: "refresh_grid", targetGrid: chartName }); }
        saveElements.push({ type: "reset_fields", scope: "page", targetPage: titles.form });
        if (backPage) { saveElements.push({ type: "push_page", targetPage: backPage }); }
        var cancelElements = [{ type: "reset_fields", scope: "page", targetPage: titles.form }];
        if (backPage) { cancelElements.push({ type: "push_page", targetPage: backPage }); }
        var formButtons = [
          button(claim(k + "_save", "a button"), t.save, "save", "primary", flow("save_" + k, t.saveFlow, saveElements)),
          button(claim(k + "_cancel", "a button"), t.cancel, "close", "secondary", flow("cancel_" + k, t.cancelFlow, cancelElements))
        ];
        page(titles.form, "form", { title: titles.form, subtitle: trimmed(screens.form.subtitle) || t.formSubtitle }, [
          { type: "section", name: claim(k + "_form_main", "the form section"), title: t.section, columns: 2, fields: inputs },
          actionLayout(claim(k + "_form_actions", "the actions"), formButtons)
        ], [
          k + "_form_main: " + spec.inputs.map(function (input) { return input.name === input.column.name ? input.name : input.name + " -> " + input.column.name; }).join(", "),
          "save_" + k + ": " + (spec.explicitSave ? "forms_AddRowFromData" : "forms_AddRow") + " on " + spec.tableLabel + ", toast, " + (screens.list ? "refresh " + listName + ", " : "") + "reset, " + (backPage ? "back to " + backPage : "stay")
        ]);
      }

      if (screens.dashboard) {
        var board = spec.dashboard;
        var chart = { type: "chart", name: claim(chartName, "the chart"), label: t.chartLabel(board.groupBy), config: { type: board.chart, height: "320" }, source: { table: spec.table, columns: board.columns, groupBy: board.groupBy, aggregations: board.aggregations.join(",") } };
        var boardFields = [chart];
        if (homeTitle) { boardFields.push(actionLayout(claim(k + "_dashboard_actions", "the actions"), [homeButton("dashboard")])); }
        page(titles.dashboard, "dashboard", { title: titles.dashboard, subtitle: trimmed(screens.dashboard.subtitle) || t.chartLabel(board.groupBy) + "." }, boardFields,
          [chartName + ": " + board.chart + " grouped by " + board.groupBy + ", " + board.aggregations.join(", ")]);
      }
    });

    if (homeTitle) {
      if (homeButtons.length > 1) {
        // One primary action on the home page.
        var primary = false;
        homeButtons.forEach(function (item) { if (item.variant === "primary") { if (primary) { item.variant = "secondary"; } primary = true; } });
      }
      reduced.flows.push({ id: "open_home", name: global.homeFlow, elements: [{ type: "push_page", targetPage: homeTitle }] });
      if (usedPages[homeTitle.toLowerCase()]) { fail("home.title", "the home page and another page are both named " + homeTitle); }
      reduced.pages.unshift({ name: homeTitle, iconName: PAGE_ICONS.home, header: { title: app.name, subtitle: trimmed(app.home.subtitle) || app.description || global.homeSubtitle }, fields: [
        actionLayout(claim("home_actions", "the home actions"), homeButtons)
      ] });
      outline.pages.unshift({ name: homeTitle, kind: "home", components: ["home_actions: " + homeButtons.map(function (item) { return item.label; }).join(", ")] });
    }
    return { reduced: reduced, outline: outline };
  }

  function escapeHtml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // A read-only field showing a column of the row selected in the list. The grid row holds Baserow cells as
  // { value }: a single select's value is { id, value, color }, a link or a multiple select a list of { id, value }, a
  // date an ISO text (test-nocode, lean cells of lib_BaseRow): each is read so that it shows its text.
  function detailField(column, name, listName, app, t) {
    var type = trimmed(column.type);
    var field = { type: "text", name: name, label: column.name, disabled: true };
    var cell = "(fields[" + JSON.stringify(listName) + "] ? fields[" + JSON.stringify(listName) + "][" + JSON.stringify(column.name) + "] : null)";
    if (type === "single_select") {
      field.defaultFrom = { source: "field", field: listName, path: [column.name, "value", "value"], mode: "reactive", fallback: "" };
    } else if (type === "date") {
      field.type = "datetime";
      field.display_format = app.language === "fr" ? "DD/MM/YYYY" : "MM/DD/YYYY";
      field.picker_format = field.display_format;
      field.defaultFrom = { source: "field", field: listName, path: [column.name, "value"], mode: "reactive", fallback: "" };
    } else if (type === "link_row" || type === "multiple_select" || type === "lookup") {
      field.defaultFrom = { source: "expression", mode: "reactive", expression: "(function (c) { var v = c && c.value; return Array.isArray(v) ? v.map(function (x) { return x && typeof x === 'object' ? (x.value != null ? x.value : '') : x; }).join(', ') : (v == null ? '' : v); })" + cell };
    } else if (type === "boolean") {
      field.defaultFrom = { source: "expression", mode: "reactive", expression: "(function (c) { var v = c && c.value; return v === true || v === 'true' ? " + JSON.stringify(t.yesNo[0]) + " : (v === false || v === 'false' ? " + JSON.stringify(t.yesNo[1]) + " : ''); })" + cell };
    } else {
      field.defaultFrom = { source: "field", field: listName, path: [column.name, "value"], mode: "reactive", fallback: "" };
    }
    if (type === "long_text") { field.short = false; field.fullWidth = true; }
    return field;
  }

  // A static radio shows the value it submits, and Baserow refuses Oui as a boolean (an unanswered one too). The radio
  // shows Oui and Non; a hidden field named after the column writes true or false from it, false when unanswered.
  function booleanInput(input, spec, t, claim) {
    var fieldSpec = spec.fieldSpecs[input.column.name.toLowerCase()] || {};
    var choice = claim(input.name + "_choice", "a yes/no choice");
    var radio = { type: "radio", name: choice, label: fieldSpec.label || input.column.name, values: [{ value: t.yesNo[0], selected: false }, { value: t.yesNo[1], selected: false }] };
    if (fieldSpec.required) { radio.mandatory = true; }
    var written = { type: "text", name: input.name, label: input.column.name, disabled: true, visibleIf: { never: true },
      defaultFrom: { source: "expression", mode: "reactive", expression: "(function (v) { v = v && typeof v === 'object' ? v.value : v; return v === " + JSON.stringify(t.yesNo[0]) + " ? 'true' : 'false'; })(fields[" + JSON.stringify(choice) + "])" } };
    return [radio, written];
  }

  function inputField(input, spec, entity, app, t) {
    var column = input.column;
    var fieldSpec = spec.fieldSpecs[column.name.toLowerCase()] || {};
    var field = { type: "text", name: input.name, label: fieldSpec.label || column.name };
    if (fieldSpec.required) { field.mandatory = true; }
    if (fieldSpec.placeholder) { field.placeholder = fieldSpec.placeholder; }
    var type = trimmed(column.type);
    if (type === "long_text") { field.short = false; field.fullWidth = true; }
    if (type === "number") { field.config = { type: "number" }; }
    if (type === "email") { field.config = { type: "email" }; }
    if (type === "phone_number") { field.config = { type: "tel" }; }
    if (type === "url") { field.config = { type: "url" }; }
    if (type === "date") {
      field.type = "datetime";
      field.display_format = app.language === "fr" ? "DD/MM/YYYY" : "MM/DD/YYYY";
      field.picker_format = field.display_format;
    }
    if (type === "rating") {
      field.type = "slider";
      field.min = 0;
      field.max = Number(column.max_value) || 5;
      field.step = 1;
    }
    if (type === "single_select") {
      field.type = "select";
      field.source = { table: spec.table, field: column.name };
    }
    if (type === "link_row") {
      var target = spec.links[column.name.toLowerCase()];
      field.type = "select";
      field.source = { table: target.table, display: target.display, value: target.display, sort: target.display };
    }
    var value = fieldSpec.defaultValue;
    if (value === "user" || value === "user.name") { field.defaultFrom = { source: "user", property: "name", fallback: "" }; }
    if (value === "user.email") { field.defaultFrom = { source: "user", property: "email", fallback: "" }; }
    if ((value === "today" || value === "now") && field.type === "datetime") { field.defaultFrom = { source: "clock", property: "today" }; }
    if (field.defaultFrom && ["text", "datetime", "slider"].indexOf(field.type) < 0) { delete field.defaultFrom; }
    return field;
  }

  // What the pages show of each entity, from the actual columns of its table.
  function entityModel(app, entity, table, columns, catalog, columnsByTable) {
    var index = app.entities.indexOf(entity);
    var path = "entities[" + index + "].screens";
    var byName = {};
    columns.forEach(function (column) { byName[trimmed(column.name).toLowerCase()] = column; });
    function column(name, where) {
      var found = byName[trimmed(name).toLowerCase()];
      if (!found) { fail(where, "table " + table.name + " has no column " + name + " (its columns: " + columns.map(function (item) { return item.name; }).join(", ") + ")"); }
      return found;
    }
    var fieldSpecs = {};
    entity.fields.forEach(function (field) { fieldSpecs[field.name.toLowerCase()] = field; });
    // An existing table keeps its order; the fields of the spec choose and order the columns when given. A table
    // reused by its name keeps a primary column the spec does not name (Name of an earlier table on test-nocode): it
    // stays out of the application.
    var ordered = entity.fields.length ? entity.fields.map(function (field) { return column(field.name, "entities[" + index + "].fields"); }) : columns.slice();
    var model = { table: { id: Number(table.id), path: table.path }, tableLabel: Number(table.id) > 0 ? "table " + table.id : "new table " + table.name, columns: ordered, fieldSpecs: fieldSpecs, links: {}, skipped: [] };
    ordered.forEach(function (item) {
      if (trimmed(item.type) !== "link_row") { return; }
      var targetTable = catalogTable(catalog, item.link_row_table_id);
      var targetColumns = targetTable ? columnsByTable(targetTable.id) : [];
      var display = targetColumns.filter(function (targetColumn) { return targetColumn.primary === true; })[0];
      if (targetTable && display) { model.links[trimmed(item.name).toLowerCase()] = { table: { id: Number(targetTable.id), path: targetTable.path }, display: display.name }; }
    });
    model.entered = function (item) {
      if (isReadOnly(item) || ENTERED_TYPES.indexOf(trimmed(item.type)) < 0) { return false; }
      return trimmed(item.type) !== "link_row" || !!model.links[trimmed(item.name).toLowerCase()];
    };
    ordered.forEach(function (item) {
      if (entity.screens.form && !model.entered(item)) { model.skipped.push(item.name + " (" + item.type + "): shown, not entered"); }
    });
    var shown = ordered.filter(function (item) { return ["file", "password"].indexOf(trimmed(item.type)) < 0; });
    var list = entity.screens.list || {};
    model.listColumns = list.columns ? ensureArray(list.columns).map(function (name) { return column(name, path + ".list.columns").name; }) : shown.filter(function (item) { return trimmed(item.type) !== "long_text"; }).slice(0, 4).map(function (item) { return item.name; });
    if (model.listColumns.length > LIST_COLUMN_LIMIT) { fail(path + ".list.columns", "a list shows at most " + LIST_COLUMN_LIMIT + " columns; the others go on the detail page"); }
    var search = list.search === true ? shown.filter(function (item) { return ["text", "long_text", "email"].indexOf(trimmed(item.type)) >= 0; }).slice(0, 3).map(function (item) { return item.name; }) : ensureArray(list.search);
    model.searchColumns = search.map(function (name) { return column(name, path + ".list.search").name; });
    model.filterColumns = ensureArray(list.filters || list.filter).map(function (name) {
      var found = column(name, path + ".list.filters");
      if (trimmed(found.type) !== "single_select") { fail(path + ".list.filters", found.name + " is a " + found.type + ": a list filters on single select columns; search finds the text ones"); }
      return found.name;
    });
    model.detailColumns = entity.screens.detail ? shown : [];
    var gridColumns = model.listColumns.slice();
    model.detailColumns.forEach(function (item) { if (gridColumns.indexOf(item.name) < 0) { gridColumns.push(item.name); } });
    model.gridColumns = gridColumns;
    if (entity.screens.dashboard) {
      var board = entity.screens.dashboard;
      if (!trimmed(board.groupBy).length) { fail(path + ".dashboard.groupBy", "a dashboard groups the rows by a column, for example the status"); }
      var groupBy = column(board.groupBy, path + ".dashboard.groupBy").name;
      var t = entityTexts(app.language, entity, app.entities.length > 1);
      var chartColumns = [groupBy];
      var aggregations = ensureArray(board.aggregations || "count").map(function (spec) {
        var text = trimmed(spec);
        var label = "";
        if (text.indexOf("=") >= 0) { label = trimmed(text.substring(text.indexOf("=") + 1)); text = trimmed(text.substring(0, text.indexOf("="))); }
        var operator = text.indexOf(":") >= 0 ? trimmed(text.substring(0, text.indexOf(":"))).toLowerCase() : text.toLowerCase();
        if (AGGREGATIONS.indexOf(operator) < 0) { fail(path + ".dashboard.aggregations", "an aggregation is count or sum:Column, avg:, min:, max:, with an optional =Label"); }
        if (operator === "count") { return "count=" + (label || t.aggregation.count); }
        var target = column(text.substring(text.indexOf(":") + 1), path + ".dashboard.aggregations");
        if ((operator === "sum" || operator === "avg") && NUMERIC_TYPES.indexOf(trimmed(target.type)) < 0) { fail(path + ".dashboard.aggregations", operator + " needs a number column, " + target.name + " is a " + target.type); }
        if (chartColumns.indexOf(target.name) < 0) { chartColumns.push(target.name); }
        if (/[,=<>]/.test(label)) { fail(path + ".dashboard.aggregations", "a label has no comma, =, < or >"); }
        return operator + ":" + target.name + "=" + (label || t.aggregation[operator] + lowerFirst(target.name));
      });
      var chartType = trimmed(board.chart || board.type || "bar").toLowerCase();
      if (["bar", "line", "area", "pie", "donut"].indexOf(chartType) < 0) { fail(path + ".dashboard.chart", "chart is bar, line, area, pie or donut"); }
      model.dashboard = { groupBy: groupBy, aggregations: aggregations, columns: chartColumns, chart: chartType };
    }
    return model;
  }

  // ---- Tool --------------------------------------------------------------------------------------------------------

  function specErrorResult(e) {
    return { status: "invalid_spec", saved: false, error: { code: "invalid_spec", path: e.path, message: e.message } };
  }

  // The identities a plan cannot have yet are bound by the creation: not a warning to act on. Nor are, in a plan, the
  // tables it has not created yet, nor the runtime check asked of any expression: the tool's expressions (the detail of
  // a link or a boolean, the value written for a yes/no choice) were checked in the viewer on test-nocode.
  var EXPECTED_BEFORE_CREATION = ["baserow_identity_pending_creation", "context_expression_runtime_check"];
  var EXPECTED_BEFORE_TABLES = ["missing_baserow_table"];
  function compactValidation(validation, tablesPending) {
    var value = validation || {};
    var warnings = ensureArray(value.warnings).filter(function (item) { return EXPECTED_BEFORE_CREATION.indexOf(item && item.code) < 0; });
    var issues = ensureArray(value.issues).filter(function (item) { return !tablesPending || EXPECTED_BEFORE_TABLES.indexOf(item && item.code) < 0; });
    var out = { valid: tablesPending ? !issues.length : value.valid === true, issueCount: issues.length, warningCount: warnings.length };
    if (issues.length) { out.issues = issues.slice(0, 10).map(function (item) { return { code: item.code, message: item.message, path: item.path }; }); }
    if (warnings.length) { out.warnings = warnings.slice(0, 10).map(function (item) { return { code: item.code, message: item.message, path: item.path }; }); }
    return out;
  }

  // options: { project, token }. A plan reads the catalog and the columns and compiles the application without writing
  // anything; an apply creates the tables and fields, then the form.
  C8O.nocodeApp.create = function (rawSpec, options) {
    var opts = options || {};
    var app;
    try {
      app = normalizeSpec(rawSpec);
    } catch (e) {
      if (e && e.specError) { return specErrorResult(e); }
      throw e;
    }
    var apply = app.mode === "apply";
    var listed = C8O.nocodeBaserow.catalogList({ token: opts.token, view: "compact" });
    if (!listed || listed.status !== "ok") {
      return { status: listed && listed.status === "auth_required" ? "auth_required" : "error", saved: false, authentication: listed && listed.authentication, error: listed && listed.error };
    }
    var user = trimmed(listed.authentication && listed.authentication.user);
    var catalog = flattenCatalog(listed.workspaces);
    var bearer = "";
    var fieldCache = {};
    function readColumns(tableId) {
      if (!fieldCache[tableId]) {
        var read = C8O.nocodeBaserow.tableFields(tableId, user, bearer);
        bearer = read.bearer || bearer;
        fieldCache[tableId] = ensureArray(read.fields);
      }
      return fieldCache[tableId];
    }
    var result = { status: "ok", mode: app.mode, saved: false };
    try {
      var columnsByEntity = {};
      app.entities.forEach(function (entity, e) {
        if (entity.tableId == null) { return; }
        if (!catalogTable(catalog, entity.tableId)) { fail("entities[" + e + "].table", "table " + entity.tableId + " is not in the Baserow catalog of the authenticated user (nocode-baserow-catalog-list)"); }
        columnsByEntity[entity.key] = readColumns(entity.tableId);
      });
      var target = destination(app, catalog, user);
      if (target.error) { return { status: "error", saved: false, error: target.error }; }
      var schema = buildSchema(app, catalog, target, columnsByEntity);
      result.baserow = { base: { id: target.base.id, name: target.base.name, created: false }, tables: [] };
      var applied = null;
      if (schema) {
        applied = C8O.nocodeBaserow.schemaApply({
          token: opts.token,
          mode: app.mode,
          schema: schema,
          create: { workspace: false, base: true, tables: true, fields: true, views: false, sampleRows: false },
          readBack: false,
          view: "compact"
        });
        result.baserow.actions = ensureArray(applied && applied.actions).map(function (action) { return action.type + (action.table ? " " + action.table : "") + (action.field ? "." + action.field : ""); });
        if (!applied || applied.status !== "ok") {
          result.status = "error";
          result.stage = "baserow";
          result.error = applied && applied.error ? applied.error : { code: "baserow_schema_apply_failed", message: "The Baserow schema could not be applied." };
          result.next = "Nothing was saved in C8Oforms. Fix the cause, then call nocode-app-create again with the same spec: the tables and fields already created are reused.";
          return result;
        }
        if (apply) {
          listed = C8O.nocodeBaserow.catalogList({ token: opts.token, view: "compact" });
          catalog = flattenCatalog(listed.workspaces);
          ensureArray(applied.created && applied.created.bases).forEach(function (base) { result.baserow.base = { id: base.id, name: base.name, created: true }; });
          if (result.baserow.base.id == null) {
            var foundBase = catalog.bases.filter(function (base) { return base.workspaceId === target.base.workspaceId && trimmed(base.name).toLowerCase() === trimmed(target.base.name).toLowerCase(); })[0];
            if (foundBase) { result.baserow.base.id = foundBase.id; }
          }
        } else {
          result.baserow.base.created = target.newBase === true;
        }
      }
      var model = {};
      var placeholderId = -1;
      var createdTables = {};
      ensureArray(applied && applied.created && applied.created.tables).forEach(function (table) { createdTables[trimmed(table.name).toLowerCase()] = true; });
      ensureArray(applied && applied.actions).forEach(function (action) { if (action.type === "create_table" && action.table) { createdTables[trimmed(action.table).toLowerCase()] = true; } });
      if (schema && apply) { fieldCache = {}; }
      app.entities.forEach(function (entity) {
        var table;
        var columns;
        if (entity.tableId != null) {
          table = catalogTable(catalog, entity.tableId);
          columns = readColumns(entity.tableId);
        } else {
          table = result.baserow.base.id != null ? baseTable(catalog, result.baserow.base.id, entity.tableName) : null;
          if (table) {
            columns = readColumns(table.id);
          } else if (!apply) {
            // A plan has no table yet: the columns are the ones it would create.
            var primaryName = entity.fields.filter(function (item) { return item.type === "text"; })[0].name;
            table = { id: placeholderId--, name: entity.tableName, path: [target.base.workspaceName || "", target.base.name, entity.tableName].join("~>") };
            columns = entity.fields.map(function (field) { return { name: field.name, type: field.type, primary: field.name === primaryName, select_options: (field.options || []).map(function (option) { return { value: option }; }) }; });
          } else {
            fail("entities[" + app.entities.indexOf(entity) + "].table", "table " + entity.tableName + " was not found after the schema was applied");
          }
        }
        var created = entity.tableId == null && createdTables[trimmed(entity.tableName).toLowerCase()] === true;
        model[entity.key] = entityModel(app, entity, table, columns, catalog, readColumns);
        var tableSummary = { id: table.id > 0 ? table.id : null, name: table.name, created: created, columns: model[entity.key].columns.map(function (column) { return column.name; }) };
        if (model[entity.key].skipped.length) { tableSummary.notEntered = model[entity.key].skipped; }
        result.baserow.tables.push(tableSummary);
      });
      var built = buildReduced(app, model);
      result.pages = built.outline.pages;
      var formOptions = { project: opts.project, token: opts.token };
      if (!apply) {
        var compiled = C8O.nocodeForms.compile(built.reduced, formOptions);
        result.validation = compactValidation(compiled && compiled.validation, placeholderId < -1);
        result.status = result.validation.valid ? "ok" : "invalid";
        result.next = result.status === "ok" ? "Nothing was written. Call nocode-app-create again with mode apply to create the tables and the form." : "Fix the spec from the validation issues.";
        return result;
      }
      var saved = C8O.nocodeForms.create(built.reduced, formOptions);
      result.saved = saved && saved.saved === true;
      result.status = saved && saved.status ? saved.status : "error";
      if (saved && saved.id) { result.id = saved.id; result.rev = saved.rev; }
      if (saved && saved.form && saved.form._id) {
        // The Assistant opens the saved form in the No Code Studio editor from these.
        result.form = { _id: String(saved.form._id), _rev: String(saved.form._rev || saved.rev || ""), name: saved.form.name };
      }
      if (saved && saved.bindingFinalization) { result.bindings = saved.bindingFinalization; }
      result.validation = compactValidation(saved && saved.validation);
      if (saved && saved.error) { result.error = saved.error; }
      if (result.saved && result.status === "ok") {
        result.next = "The application is saved, read back and validated (validation above): report this outline to the user without reading the form again. Change it with nocode-form-edit on id " + result.id + "; never call nocode-app-create again for this application.";
      } else if (result.saved) {
        result.next = "The form is saved but not finished: follow bindings.recovery on id " + result.id + "; never call nocode-app-create again for this application.";
      } else {
        result.next = "No form was saved" + (schema ? "; the Baserow tables are created and reused if you call nocode-app-create again with the same spec" : "") + ". Fix the cause from validation or error first.";
      }
      return result;
    } catch (e) {
      if (e && e.specError) {
        var invalid = specErrorResult(e);
        if (result.baserow) { invalid.baserow = result.baserow; }
        return invalid;
      }
      return { status: "error", saved: false, baserow: result.baserow, error: { code: "app_create_failed", message: String(e && e.message ? e.message : e) } };
    }
  };

  C8O.nocodeApp.normalizeSpec = normalizeSpec;
  C8O.nocodeApp.buildReduced = buildReduced;
  C8O.nocodeApp.entityModel = entityModel;
})();
