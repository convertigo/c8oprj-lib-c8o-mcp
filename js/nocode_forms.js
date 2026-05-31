if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.nocodeForms = C8O.nocodeForms || {};

(function () {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var File = Packages.java.io.File;
  var FileUtils = Packages.org.apache.commons.io.FileUtils;
  var HashMap = Packages.java.util.HashMap;
  var InternalHttpServletRequest = Packages.com.twinsoft.convertigo.engine.requesters.InternalHttpServletRequest;
  var InternalRequester = Packages.com.twinsoft.convertigo.engine.requesters.InternalRequester;
  var XMLUtils = Packages.com.twinsoft.convertigo.engine.util.XMLUtils;
  var JsonOutput = Packages.com.twinsoft.convertigo.engine.enums.JsonOutput;

  function trimmed(value) {
    return value == null ? "" : String(value).trim();
  }

  function clone(value, fallback) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_ignoreClone) {
      return fallback;
    }
  }

  function parseObject(value, label, fallback) {
    if (value == null || trimmed(value).length === 0) {
      return fallback;
    }
    var text = trimmed(value);
    if (text.charAt(0) === "{") {
      try {
        var parsedText = JSON.parse(text);
        if (parsedText && typeof parsedText === "object" && !Array.isArray(parsedText)) {
          return parsedText;
        }
      } catch (_ignoreTextParse) {}
    }
    if (typeof value === "object" && !Array.isArray(value)) {
      return value;
    }
    try {
      var parsed = JSON.parse(String(value));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch (_ignoreParse) {}
    throw new Error((label || "value") + " must be a JSON object");
  }

  function parseArray(value, label, fallback) {
    if (value == null || trimmed(value).length === 0) {
      return fallback;
    }
    var text = trimmed(value);
    if (text.charAt(0) === "[") {
      try {
        var parsedText = JSON.parse(text);
        if (Array.isArray(parsedText)) {
          return parsedText;
        }
      } catch (_ignoreTextParse) {}
    }
    if (Array.isArray(value)) {
      return value;
    }
    try {
      var parsed = JSON.parse(String(value));
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (_ignoreParse) {}
    throw new Error((label || "value") + " must be a JSON array");
  }

  function parseOperations(value, label, fallback) {
    if (value == null || trimmed(value).length === 0) {
      return fallback || [];
    }
    if (Array.isArray(value)) {
      return value;
    }
    var text = trimmed(value);
    if (text.charAt(0) === "{" || text.charAt(0) === "[") {
      try {
        return parseOperations(JSON.parse(text), label, fallback);
      } catch (_ignoreOperationTextParse) {}
    }
    if (typeof value === "object") {
      if (value.operations != null) {
        return parseOperations(value.operations, label, fallback);
      }
      if (value.operation != null) {
        return parseOperations(value.operation, label, fallback);
      }
      if (value.arguments && typeof value.arguments === "object" && value.arguments.operations != null) {
        return parseOperations(value.arguments.operations, label, fallback);
      }
      return [value];
    }
    try {
      var parsed = JSON.parse(text);
      return parseOperations(parsed, label, fallback);
    } catch (_ignoreOperationParse) {}
    throw new Error((label || "operations") + " must be a JSON array or operation object");
  }

  function ensureArray(value) {
    if (Array.isArray(value)) {
      return value;
    }
    if (value == null) {
      return [];
    }
    return [value];
  }

  function nowText() {
    return String(java.lang.System.currentTimeMillis());
  }

  var idSeed = java.lang.System.currentTimeMillis();
  function nextId() {
    idSeed += 1;
    return Number(idSeed);
  }

  function slug(value, fallback) {
    var text = trimmed(value || fallback || "item").replace(/[^A-Za-z0-9_]+/g, "_");
    text = text.replace(/^_+|_+$/g, "");
    return text.length ? text : String(fallback || "item");
  }

  function projectByName(projectName) {
    var name = trimmed(projectName) || "C8Oforms";
    var project = Engine.theApp.databaseObjectsManager.getOriginalProjectByName(name);
    if (project == null) {
      throw new Error("Project not loaded: " + name);
    }
    return project;
  }

  function readJsonFile(file, label) {
    if (file == null || !file.isFile()) {
      throw new Error((label || "JSON file") + " not found: " + (file == null ? "" : file.getAbsolutePath()));
    }
    return JSON.parse(String(FileUtils.readFileToString(file, "UTF-8")));
  }

  function allTypesFile(projectName) {
    return new File(projectByName(projectName).getDirFile(), "DisplayObjects/mobile/assets/components/AllTypes.json");
  }

  function readAllTypes(projectName) {
    var file = allTypesFile(projectName);
    var catalog = readJsonFile(file, "AllTypes.json");
    if (!Array.isArray(catalog)) {
      throw new Error("AllTypes.json must contain an array");
    }
    return { file: String(file.getAbsolutePath()), catalog: catalog };
  }

  function sampleContract() {
    return {
      name: "Customer feedback",
      description: "Tell us what you think.",
      language: "en",
      backgroundColor: "rgba(32,38,70,0.06)",
      thumbnailUrl: "https://example.com/thumbnail.png",
      pages: [
        {
          name: "General",
          description: "General questions",
          ionicIcon: "information-circle-outline",
          fields: [
            { name: "full_name", type: "text", description: "Full name", mandatory: true },
            { name: "rating", type: "slider", description: "Rating", min: 0, max: 10, step: 1 },
            { name: "category", type: "radio", description: "Category", values: ["Question", "Bug", "Feature request"] }
          ]
        }
      ],
      flows: [
        { id: "submit", elements: [{ type: "submit" }, { type: "toast", message: "Thanks!" }] }
      ]
    };
  }

  function baserowSourceContract() {
    var filterOperators = [
      "equal",
      "not_equal",
      "filename_contains",
      "files_lower_than",
      "has_file_type",
      "contains",
      "contains_not",
      "contains_word",
      "doesnt_contain_word",
      "length_is_lower_than",
      "higher_than",
      "higher_than_or_equal",
      "lower_than",
      "lower_than_or_equal",
      "is_even_and_whole",
      "date_equal",
      "date_before",
      "date_before_or_equal",
      "date_after_days_ago",
      "date_after",
      "date_after_or_equal",
      "date_not_equal",
      "date_equals_today",
      "date_before_today",
      "date_after_today",
      "date_within_days",
      "date_within_weeks",
      "date_within_months",
      "date_equals_days_ago",
      "date_equals_months_ago",
      "date_equals_years_ago",
      "date_equals_week",
      "date_equals_month",
      "date_equals_day_of_month",
      "date_equals_year",
      "date_is",
      "date_is_not",
      "date_is_before",
      "date_is_on_or_before",
      "date_is_after",
      "date_is_on_or_after",
      "date_is_within",
      "single_select_equal",
      "single_select_not_equal",
      "single_select_is_any_of",
      "single_select_is_none_of",
      "link_row_has",
      "link_row_has_not",
      "link_row_contains",
      "link_row_not_contains",
      "boolean",
      "empty",
      "not_empty",
      "multiple_select_has",
      "multiple_select_has_not",
      "multiple_collaborators_has",
      "multiple_collaborators_has_not",
      "user_is",
      "user_is_not",
      "has_value_equal",
      "has_not_value_equal",
      "has_value_contains",
      "has_not_value_contains",
      "has_value_contains_word",
      "has_not_value_contains_word",
      "has_value_length_is_lower_than",
      "has_empty_value",
      "has_not_empty_value"
    ];
    return {
      learnedFrom: [
        "lib_BaseRow.formssource_GetTableData",
        "lib_BaseRow.formssource_GetSelectData",
        "lib_BaseRow.TableGetData",
        "lib_BaseRow.Baserow_API_spec"
      ],
      sourceKeys: {
        tableData: "lib_BaseRow.formssource_GetTableData",
        selectData: "lib_BaseRow.formssource_GetSelectData",
        fieldValues: "lib_BaseRow.formssource_GetFieldValues"
      },
      sourceVariableEncoding: "C8Oforms sources use the sequence key as the source object key. For No Code Studio Baserow sources, the only valid contract shape is { enabled: true, fullsync: false, vars: { ... } } with UI-authored variables. Every lib_BaseRow source variable must preserve { str: stringValue, html: false }. Filter and sort variables must keep their UI metadata such as conds, condVisible, and type.",
      editableNoCodeStudioRule: {
        required: "Use UI-authored variable objects for lib_BaseRow.formssource_GetTableData, lib_BaseRow.formssource_GetSelectData, and lib_BaseRow.formssource_GetFieldValues.",
        outsideContract: "Any Baserow source object that does not preserve the UI-authored variable shape is outside this No Code contract.",
        reason: "No Code Studio needs the UI metadata to keep the Baserow source editable and to avoid forms_config/filter conversion errors."
      },
      supportedComponents: {
        tableData: ["grid", "chart", "map"],
        selectData: ["select", "checkbox", "radio", "checkbox_group", "radio_group"],
        fieldValues: ["select", "checkbox", "radio"]
      },
      formsConfig: {
        noCodeStudioIdentityRule: {
          requiredTogether: ["table_id", "table_id_int"],
          table_id: "The UI path string, for example Workspace~>Database~>Table. Keep it even when table_id_int is present.",
          table_id_int: "The numeric Baserow table id.",
          outsideContract: "table_id_int alone can pass low-level validation but is not a robust No Code Studio source configuration."
        },
        tableData: { required: ["table_id", "table_id_int", "columns"], optional: ["view_id", "hidden", "form_id", "source_id", "source_owner", "link_row_table_id"], example: { table_id: "Workspace~>Database~>Table", table_id_int: 123, columns: ["Name", "Amount"], hidden: [], link_row_table_id: [] } },
        selectData: { required: ["table_id", "table_id_int", "columns"], optional: ["view_id", "displayValue", "value", "hidden", "form_id", "source_id", "source_owner", "link_row_table_id"], example: { table_id: "Workspace~>Database~>Table", table_id_int: 123, columns: ["Name", "Code"], displayValue: "Name", value: "Code", hidden: [] } },
        fieldValues: { required: ["table_id", "columns"], example: { table_id: 123, columns: ["Status"] } }
      },
      filter: {
        variablesBySource: {
          tableData: "forms_tableFilter",
          selectData: "forms_Filter",
          selectSearch: "forms_filter"
        },
        uiAuthoredShape: {
          str: "",
          html: false,
          conds: [
            {
              val1: { name: "Opportunity", displayName: "Opportunity" },
              val2: { type: "text", str: "A", html: false, arr: [] },
              operator: "contains"
            }
          ],
          condVisible: "and",
          type: "filter"
        },
        groupOperators: ["and", "or"],
        operators: filterOperators,
        notes: [
          "Use Baserow column names in val1.name.",
          "Use condVisible with and/or for the top-level filter group operator.",
          "For equal with an empty value, lib_BaseRow sends __empty to avoid returning every row.",
          "SelectData also supports forms_filter as a simple search string; it is separate from forms_Filter.",
          "For source objects copied from C8Oforms, keep the conds/condVisible/type metadata."
        ]
      },
      sort: {
        variablesBySource: { tableData: "forms_tableSort", selectData: "forms_tableSort" },
        syntax: "Comma-separated column names. Prefix a column with - for descending order.",
        uiAuthoredShape: { str: "", html: false, conds: [{ name: "Opportunity", order: "asc" }, { name: "Stage", order: "asc" }], type: "sort" },
        examples: ["Name", "Name,-Created on"]
      },
      distinct: {
        variablesBySource: { tableData: "forms_tableDistinct", selectData: "forms_tableDistinct" },
        syntax: "Comma-separated column names.",
        example: "Country,City",
        behavior: "Keeps only the first row for each unique combination of the listed columns.",
        notes: ["When forms_tableGroupBy is set on tableData, distinct is ignored."]
      },
      groupBy: {
        source: "tableData only",
        variable: "forms_tableGroupBy",
        syntax: "Comma-separated column names.",
        example: "Service,Region",
        behavior: "Returns one row per unique group key combination.",
        defaultAggregation: "count"
      },
      groupAggregations: {
        source: "tableData only",
        variable: "forms_tableAggregations",
        operators: ["count", "sum", "avg", "min", "max"],
        syntax: "Comma-separated aggregation specs: count or operator:Column name.",
        examples: ["count", "sum:Amount", "avg:Amount", "min:Date", "max:Score"],
        recommendedUse: [
          "count works for any grouped data.",
          "sum and avg should target numeric columns.",
          "min and max should target simple single-value columns."
        ],
        unsupportedColumns: ["files", "linked rows", "multiple selections", "other multi-value columns"]
      },
      sourceExamples: {
        gridWithUiAuthoredSourceConfig: {
          type: "grid",
          name: "pipeline",
          sourceEnabled: true,
          columns: [{ name: "Opportunity", type: "text" }, { name: "Company", type: "text" }, { name: "Stage", type: "text" }],
          sources: {
            "lib_BaseRow.formssource_GetTableData": {
              vars: {
                forms_config: { str: "{\"table_id\":\"Mini CRM~>Lightweight CRM~>Pipelines\",\"table_id_int\":3162,\"columns\":[\"Opportunity\",\"Company\",\"Stage\"],\"hidden\":[],\"form_id\":\"1780132303501\",\"source_id\":1780132310205,\"source_owner\":\"user@example.com\",\"link_row_table_id\":[]}", html: false },
                forms_tableFilter: { str: "", html: false, conds: [{ val1: { name: "Opportunity", displayName: "Opportunity" }, val2: { type: "text", str: "A", html: false, arr: [] }, operator: "contains" }], condVisible: "and", type: "filter" },
                forms_tableSort: { str: "", html: false, conds: [{ name: "Opportunity", order: "asc" }, { name: "Stage", order: "asc" }], type: "sort" },
                forms_tableDistinct: { str: "Opportunity,Stage", html: false },
                forms_tableGroupBy: { str: "Opportunity", html: false },
                forms_tableAggregations: { str: "count", html: false }
              },
              enabled: true,
              fullsync: false
            }
          }
        },
        selectWithFilterAndDistinct: {
          type: "select",
          name: "customer",
          sourceEnabled: true,
          sources: {
            "lib_BaseRow.formssource_GetSelectData": {
              enabled: true,
              fullsync: false,
              vars: {
                forms_config: { str: "{\"table_id\":\"Workspace~>Database~>Customers\",\"table_id_int\":123,\"columns\":[\"Customer\",\"Customer ID\"],\"displayValue\":\"Customer\",\"value\":\"Customer ID\",\"hidden\":[]}", html: false },
                forms_Filter: { str: "", html: false, conds: [{ val1: { name: "Active", displayName: "Active" }, val2: { type: "checkbox", str: "true", html: false, arr: [] }, operator: "boolean" }], condVisible: "and", type: "filter" },
                forms_filter: { str: "", html: false },
                forms_tableSort: { str: "", html: false, conds: [{ name: "Customer", order: "asc" }], type: "sort" },
                forms_tableDistinct: { str: "Customer", html: false }
              }
            }
          }
        }
      }
    };
  }

  function detailedAuthoringContract(types) {
    return {
      format: "reduced-authoring-json",
      intent: "Generate this reduced JSON. The MCP tool compiles it to full C8Oforms JSON, validates it, and persists through C8Oforms APIs.",
      forbiddenFields: ["_id", "_rev", "_c8oMeta", "creator", "~c8oAcl", "c8oGrp", "formulaire", "pageTechName", "creationDate", "lastMofification", "__importAttachments"],
      rootFields: {
        name: { type: "string", required: true, description: "Visible form name." },
        description: { type: "string", html: true, mapsTo: "descform" },
        language: { type: "string", default: "en", mapsTo: "lang" },
        backgroundColor: { type: "string", optional: true, example: "rgba(32,38,70,0.06)", mapsTo: "wallpaper.type=color" },
        thumbnailUrl: { type: "string", optional: true, example: "https://example.com/thumbnail.png", mapsTo: "thumbnail.type=url" },
        tag: { oneOf: ["string", "string[]"], optional: true },
        subTag: { oneOf: ["string", "string[]"], optional: true },
        appLike: { type: "boolean", optional: true, description: "When true, pages default to persisted tab navigation." },
        navigationMode: { type: "string", enum: ["tabs", "buttons"], default: "tabs for multi-page forms, buttons for single-page forms" },
        config: { type: "object", optional: true, description: "Advanced root responsive sizing. Omit unless needed." },
        pages: { type: "array", required: true },
        flows: { type: "array", optional: true, description: "Only include when a button, automation, formula, or submit behavior needs it." }
      },
      mediaSupport: {
        supported: {
          backgroundColor: "Creates a color wallpaper.",
          thumbnailUrl: "Creates a URL thumbnail."
        },
        notYetSupportedInReducedInput: [
          "custom thumbnail binary/base64 uploads",
          "custom wallpaper binary/base64 uploads",
          "external image-search prompts"
        ]
      },
      pageFields: {
        name: { type: "string", required: true },
        description: { type: "string", html: true, optional: true },
        ionicIcon: { type: "string", optional: true, examples: ["home", "list", "people", "calendar-clear", "settings"] },
        iconName: { type: "string", optional: true, description: "Alias of ionicIcon. Use simple base icon names for tabs." },
        enabledTab: { type: "boolean", optional: true, default: "true in tab mode" },
        enabledButtons: { type: "boolean", optional: true, default: "false in tab mode" },
        positionTab: { type: "string", optional: true, default: "bottom" },
        positionButtons: { type: "string", optional: true, default: "tab" },
        isNameDisplayed: { type: "boolean", optional: true, default: "false in tab mode" },
        checkMandatoryInCurrentPage: { type: "boolean", optional: true, default: true },
        fields: { type: "array", required: true, aliases: ["components", "formulaire"] }
      },
      commonFieldFields: {
        name: { type: "string", required: true, description: "Stable technical name used by formulas as fields.<name>." },
        type: { type: "string", required: true, enum: types },
        description: { type: "string", html: true, optional: true, mapsTo: "config.html" },
        label: { type: "string", optional: true },
        placeholder: { type: "string", optional: true },
        mandatory: { type: "boolean", optional: true },
        disabled: { type: "boolean", optional: true },
        short: { type: "boolean", optional: true },
        config: { type: "object", optional: true, description: "Merged onto the component config for advanced supported properties." },
        sources: { type: "object", optional: true, description: "Advanced C8Oforms source configuration; prefer contract/actions from GetSequences before using." },
        actions: { type: "object", optional: true, description: "Advanced C8Oforms action configuration; prefer flows for ordinary buttons." },
        flow: { type: "string", optional: true, description: "For button fields, references a flows[].id." }
      },
      componentAuthoring: {
        layout: {
          fields: ["name", "cols", "tablet", "phoneL", "phoneP", "children"],
          description: "Responsive row/container. children are nested fields; compiler creates childrenRefs and parentRef.",
          colsExample: [{ size: 3 }, { size: 3 }, { size: 6 }, { size: 0 }, { size: 0 }, { size: 0 }]
        },
        description: { fields: ["name", "description"], note: "Use HTML for headings, dashboards, explanatory bands, and visual grouping." },
        text: { fields: ["name", "description", "placeholder", "mandatory", "short", "config"] },
        datetime: { fields: ["name", "description", "placeholder", "mandatory", "config"], configHints: ["display_format", "picker_format", "min_datetime", "max_datetime"] },
        time: { fields: ["name", "description", "placeholder", "mandatory", "config"], configHints: ["display_format", "picker_format"] },
        slider: { fields: ["name", "description", "min", "max", "step"] },
        radio: { fields: ["name", "description", "values", "config"], values: "string[] or option objects" },
        checkbox: { fields: ["name", "description", "values", "config"], values: "string[] or option objects" },
        select: { fields: ["name", "description", "placeholder", "values", "sources", "sourceEnabled", "config"], values: "string[] or option objects" },
        radio_group: { fields: ["name", "description", "columns", "rows"] },
        checkbox_group: { fields: ["name", "description", "columns", "rows"] },
        grid: { fields: ["name", "description", "columns", "sources", "sourceEnabled", "returned_value", "AutoSizeColumns", "config"], columnsExample: [{ name: "Child", type: "text" }, { name: "Status", type: "text" }] },
        button: { fields: ["name", "flow", "label", "icon", "iconPosition", "backgroundColor", "color", "fill", "expand", "config"], configHints: ["label", "icon", "iconPosition", "backgroundColor", "color", "fill", "expand"] },
        img: { fields: ["name", "description", "config"] },
        file: { fields: ["name", "description", "mandatory", "config"] },
        signature: { fields: ["name", "description", "mandatory", "config"] },
        location: { fields: ["name", "description", "config"] },
        barcode: { fields: ["name", "description", "config"] },
        chart: { fields: ["name", "description", "sources", "config"] },
        map: { fields: ["name", "description", "sources", "config"] }
      },
      baserowSources: baserowSourceContract(),
      flowAuthoring: {
        rule: "Use flows only when referenced by a button or when formulas/business logic are needed.",
        formulas: "Put business_logic elements in the flow with id formulas.",
        buttonFlow: "A button field may set flow to a custom flow id.",
        elementTypes: ["business_logic", "toast", "submit", "if_else", "for_loop", "push_page", "push_app", "add_row_to_local_grid", "remove_row_from_local_grid", "refresh_grid"],
        examples: [
          { id: "flow_save", elements: [{ type: "submit" }, { type: "toast", message: "Saved" }] },
          { id: "formulas", elements: [{ name: "full_name", type: "business_logic", expression: "fields.first_name + ' ' + fields.last_name" }] }
        ]
      },
      editTool: {
        tool: "nocode-form-edit",
        whenToUse: "Use for incremental changes to an existing form: add/update/delete/move pages, components, flows, or flow elements. Prefer this over nocode-form-update for structural edits.",
        persistence: "The tool fetches through C8Oforms.APIV2_getDocument and saves through C8Oforms.APIV2_updateFormulaireDocument. Never write FullSync directly.",
        requiredInputs: ["id", "operations", "token"],
        operationsShape: "Pass operations as an array for multiple edits or as one operation object for a single edit.",
        commonOperations: [
          { action: "add_page", required: ["name"], optional: ["index", "navigationMode", "iconName"], example: { action: "add_page", name: "Details", index: 1, navigationMode: "tabs" } },
          { action: "update_page", requiredOneOf: ["pageTechName", "pageName"], required: ["patch"], example: { action: "update_page", pageName: "Details", patch: { iconName: "people", enabledTab: true } } },
          { action: "add_field", aliases: ["add_component", "add_element"], requiredOneOf: ["pageTechName", "pageName"], required: ["fieldObject"], example: { action: "add_field", pageName: "Details", fieldObject: { type: "text", name: "child_name", description: "Child name", mandatory: true } } },
          { action: "add_field", note: "To add inside a layout/container, provide parentFieldId instead of an index-only top-level insertion.", example: { action: "add_field", parentFieldId: "1779979310404", fieldObject: { type: "select", name: "status", description: "Status", values: ["Open", "Closed"] } } },
          { action: "update_field", requiredOneOf: ["fieldId", "fieldName"], required: ["patch"], example: { action: "update_field", fieldName: "child_name", patch: { config: { mandatory: false, label: "Child" } } } },
          { action: "remove_field", aliases: ["delete_field", "remove_component"], requiredOneOf: ["fieldId", "fieldName"], example: { action: "remove_field", fieldName: "obsolete_field" } },
          { action: "move_field", requiredOneOf: ["fieldId", "fieldName"], optional: ["pageName", "pageTechName", "parentFieldId", "index"], example: { action: "move_field", fieldName: "status", pageName: "Details", index: 0 } },
          { action: "add_flow", required: ["flowId"], example: { action: "add_flow", flowId: "flow_save", name: "Save", flowData: { elements: [] } } },
          { action: "add_flow_element", required: ["flowId", "element"], example: { action: "add_flow_element", flowId: "flow_save", element: { type: "toast", message: "Saved" } } }
        ],
        notes: [
          "Use fieldObject with the same reduced component shape accepted by nocode-form-compile.",
          "Use patch for updates; component settings usually live under config.",
          "Use ids when available; names are accepted for user-friendly edits but must be unique."
        ]
      },
      realWorldPatternsFromGestionDesCreches: [
        "Multi-page operational apps can use 8+ pages with ionicIcon values such as list, home, people, receipt, and settings.",
        "Use description components with rich HTML for headers, dashboards, explanatory bands, and visual grouping.",
        "Use layout components heavily to create responsive rows; provide cols and nested children in reduced JSON.",
        "Use grids for tabular operational data and pair them with source-enabled config when data comes from sequences.",
        "Use buttons with icons and named flows for save/status actions.",
        "Use a formulas flow for computed state and validation helpers, and custom flows for submit/toast/if_else sequences."
      ]
    };
  }

  var aliases = {
    image: "img",
    camera: "img",
    date: "datetime",
    date_range: "datetime"
  };

  function normalizeType(type) {
    var raw = trimmed(type || "text");
    return aliases[raw] || raw;
  }

  function indexCatalog(catalog) {
    var byType = {};
    for (var i = 0; i < catalog.length; i++) {
      var item = catalog[i];
      if (item && item.type != null && byType[item.type] == null) {
        byType[item.type] = item;
      }
    }
    return byType;
  }

  function hasOwn(value, key) {
    return value != null && Object.prototype.hasOwnProperty.call(value, key);
  }

  function copyConfigValue(target, source, sourceKey, targetKey) {
    if (!hasOwn(source, sourceKey)) {
      return;
    }
    target.config = target.config && typeof target.config === "object" ? target.config : {};
    target.config[targetKey || sourceKey] = source[sourceKey];
  }

  function copyConfigValues(target, source, keys) {
    for (var i = 0; i < keys.length; i++) {
      copyConfigValue(target, source, keys[i]);
    }
  }

  function copyObjectValues(target, source, keys) {
    for (var i = 0; i < keys.length; i++) {
      if (hasOwn(source, keys[i])) {
        target[keys[i]] = source[keys[i]];
      }
    }
  }

  function boolLike(value) {
    return value === true || String(value).toLowerCase() === "true";
  }

  function tabModeFor(input, pageCount) {
    var mode = trimmed(input && (input.navigationMode || input.navigation || input.pageNavigation));
    if (mode.length) {
      return mode === "tabs" || mode === "tab";
    }
    if (hasOwn(input, "tabMode")) {
      return boolLike(input.tabMode);
    }
    if (hasOwn(input, "appLike")) {
      return boolLike(input.appLike);
    }
    return pageCount > 1;
  }

  function defaultPageIcon(index) {
    var icons = ["home", "list", "people", "person", "calendar", "document-text", "receipt", "settings", "stats-chart", "search"];
    return icons[index % icons.length];
  }

  function normalizedPageIcon(page, index, tabMode) {
    var icon = trimmed(page && (page.iconName || page.ionicIcon || page.iconFromIonicons));
    if (!icon.length) {
      return tabMode ? defaultPageIcon(index) : "document-text-outline";
    }
    if (tabMode && icon.lastIndexOf("-outline") === icon.length - 8) {
      return icon.substring(0, icon.length - 8);
    }
    return icon;
  }

  function pageDefaults(page, index, tabMode) {
    var id = "Page_" + nextId();
    var out = {
      name: trimmed(page && page.name) || ("Page " + (index + 1)),
      pageTechName: id,
      desc: trimmed(page && (page.description || page.desc)),
      iconName: normalizedPageIcon(page, index, tabMode),
      positionTab: "bottom",
      enabledTab: tabMode === true,
      included: true,
      enabledButtons: tabMode !== true,
      positionButtons: "tab",
      checkMandatoryInCurrentPage: true
    };
    if (tabMode === true) {
      out.isNameDisplayed = false;
    }
    copyObjectValues(out, page || {}, ["positionTab", "enabledTab", "included", "enabledButtons", "positionButtons", "checkMandatoryInCurrentPage", "isNameDisplayed"]);
    return out;
  }

  function defaultRootConfig() {
    return {
      desktop: { horizontalMargin: { unit: "px", value: "100" }, width: { unit: "px", value: "1280" }, "font-size": { unit: "px", value: "16" } },
      tablet: { horizontalMargin: { unit: "px", value: "60" }, width: { unit: "px", value: "940" }, "font-size": { unit: "px", value: "16" } },
      phoneL: { horizontalMargin: { unit: "px", value: "10" }, width: { unit: "%", value: "100" }, "font-size": { unit: "px", value: "16" } },
      phoneP: { horizontalMargin: { unit: "px", value: "10" }, width: { unit: "%", value: "100" }, "font-size": { unit: "px", value: "16" } }
    };
  }

  function defaultDoc(reduced) {
    var random = "assets/images/svg/imgplaceholder/placeholder0.svg";
    return {
      name: trimmed(reduced.name || reduced.question) || "Untitled form",
      descform: trimmed(reduced.description),
      namePosition: "text-center",
      descformPosition: "text-left",
      respNameRequired: false,
      technicalVersion: "1.0.16",
      lang: trimmed(reduced.language) || "en",
      loopToForm: true,
      progressIndicator: false,
      wallpaper: reduced.backgroundColor ? { enabled: true, index: 0, random: random, type: "color", link: null, color: String(reduced.backgroundColor) } : { link: null, enabled: false, index: null, random: random },
      thumbnail: reduced.thumbnailUrl ? { enabled: true, index: 0, type: "url", url: String(reduced.thumbnailUrl) } : { enabled: false, index: null, random: random },
      config: clone(reduced.config, defaultRootConfig()) || defaultRootConfig(),
      pages: [],
      formulaire: [],
      flows: [{ id: "formulas", elements: [] }, { id: "submit", elements: [] }],
      actions: []
    };
  }

  function applyCommonFieldConfig(target, field, pageTechName) {
    target.config = target.config && typeof target.config === "object" ? target.config : {};
    target.config.page = pageTechName;
    if (field.description != null && target.type !== "ion-card") {
      target.config.html = String(field.description);
      target.config.personalized = true;
    }
    if (field.label != null) {
      target.config.label = String(field.label);
    } else if (field.description != null && target.config.label != null) {
      target.config.label = String(field.description).replace(/<[^>]*>/g, "");
    }
    if (field.placeholder != null && target.config.placeholder != null) {
      target.config.placeholder = String(field.placeholder);
    }
    copyConfigValues(target, field, [
      "defaultValue",
      "position",
      "display_format",
      "picker_format",
      "min_datetime",
      "max_datetime",
      "date_less_than_today",
      "date_more_than_today",
      "cancelText",
      "okText",
      "returned_value",
      "sourceEnabled",
      "AutoSizeColumns",
      "label_color",
      "icon",
      "iconPosition",
      "backgroundColor",
      "color",
      "expand",
      "fill",
      "shape",
      "size",
      "justify",
      "align",
      "checkMandatoryInCurrentPage"
    ]);
    if (field.mandatory != null && target.config.mandatory != null) {
      target.config.mandatory = field.mandatory === true || String(field.mandatory) === "true";
    }
    if (field.disabled != null && target.config.disabled != null) {
      target.config.disabled = field.disabled === true || String(field.disabled) === "true";
    }
    if (field.short != null && target.config.short != null) {
      target.config.short = field.short === true || String(field.short) === "true";
    }
    if (field.min != null && target.config.min != null) {
      target.config.min = field.min;
    }
    if (field.max != null && target.config.max != null) {
      target.config.max = field.max;
    }
    if (field.step != null && target.config.step != null) {
      target.config.step = field.step;
    }
    if (field.config && typeof field.config === "object" && !Array.isArray(field.config)) {
      for (var key in field.config) {
        if (Object.prototype.hasOwnProperty.call(field.config, key)) {
          target.config[key] = field.config[key];
        }
      }
    }
  }

  function optionChildren(values) {
    var out = [];
    var list = ensureArray(values);
    for (var i = 0; i < list.length; i++) {
      var current = list[i];
      if (current && typeof current === "object") {
        var child = clone(current, {});
        child.id = child.id != null ? String(child.id) : String(nextId());
        if (child.selected == null) {
          child.selected = i === 0;
        }
        if (child.position == null) {
          child.position = "unset";
        }
        out.push(child);
      } else {
        out.push({ value: String(current), selected: i === 0, label_color: "#202124", position: "unset", id: String(nextId()) });
      }
    }
    return out;
  }

  function compileFlowElement(element, catalogByType) {
    if (!element || typeof element !== "object") {
      return null;
    }
    var type = normalizeType(element.type);
    var proto = catalogByType[type];
    var out = proto ? clone(proto, {}) : {};
    out.type = type;
    out.id = element.id != null ? element.id : nextId();
    out.name = trimmed(element.name) || (type + out.id);
    if (type === "toast") {
      out.message = trimmed(element.message) || trimmed(element.text) || "Done";
    }
    if (type === "submit" && element.actions) {
      out.actions = element.actions;
    }
    if (type === "business_logic") {
      out.cat = "action";
      out.sources = out.sources || { self: { enabled: true, vars: { selfVar: { str: "", type: "ts" } } } };
      out.sources.self = out.sources.self || { enabled: true, vars: {} };
      out.sources.self.vars = out.sources.self.vars || {};
      out.sources.self.vars.selfVar = out.sources.self.vars.selfVar || { str: "", type: "ts" };
      out.sources.self.vars.selfVar.str = trimmed(element.expression || element.code || out.sources.self.vars.selfVar.str);
      out.sources.self.vars.selfVar.type = "ts";
      out.config = out.config || {};
      out.config.page = "formulas";
    }
    if (element.config && typeof element.config === "object") {
      out.config = out.config || {};
      for (var key in element.config) {
        if (Object.prototype.hasOwnProperty.call(element.config, key)) {
          out.config[key] = element.config[key];
        }
      }
    }
    copyObjectValues(out, element, ["sources", "actions", "children", "childrenRefs", "vars"]);
    copyConfigValues(out, element, ["condition", "operator", "message", "target", "page", "flow", "delay", "loopSource", "itemName"]);
    return out;
  }

  function compileField(field, pageTechName, catalogByType, formulaire, parentId) {
    if (!field || typeof field !== "object") {
      return null;
    }
    var type = normalizeType(field.type);
    var proto = catalogByType[type];
    if (!proto) {
      throw new Error("Unsupported form component type: " + type);
    }
    var out = clone(proto, {});
    out.type = type;
    out.id = field.id != null ? field.id : nextId();
    out.name = trimmed(field.name) || (type + out.id);
    if (parentId != null) {
      out.parentRef = parentId;
    }
    applyCommonFieldConfig(out, field, pageTechName);
    if (type === "layout") {
      out.childrenRefs = [];
      if (field.cols) {
        out.config.cols = field.cols;
      }
      copyConfigValues(out, field, ["tablet", "phoneL", "phoneP"]);
      var children = ensureArray(field.children || field.fields);
      formulaire.push(out);
      for (var i = 0; i < children.length; i++) {
        var child = compileField(children[i], pageTechName, catalogByType, formulaire, out.id);
        if (child) {
          out.childrenRefs.push(child.id);
        }
      }
      return out;
    }
    if ((type === "radio" || type === "checkbox" || type === "select") && field.values != null) {
      out.children = optionChildren(field.values);
    }
    if ((type === "radio_group" || type === "checkbox_group") && field.rows != null) {
      out.lines = optionChildren(field.rows).map(function (row) {
        return { title: row.value, value: [], id: row.id };
      });
    }
    if ((type === "radio_group" || type === "checkbox_group") && field.columns != null) {
      out.children = optionChildren(field.columns);
    }
    if (type === "grid" && field.columns != null) {
      out.config.columns = ensureArray(field.columns);
    }
    if (field.sources) {
      out.sources = field.sources;
    }
    if (field.actions) {
      out.actions = field.actions;
    }
    if (field.flow) {
      out.flow = field.flow;
    }
    formulaire.push(out);
    return out;
  }

  function compileReduced(reduced, options) {
    var opts = options || {};
    var contract = readAllTypes(opts.project || opts.projectName || "C8Oforms");
    var byType = indexCatalog(contract.catalog);
    var input = clone(reduced, {});
    var doc = defaultDoc(input);
    var pages = ensureArray(input.pages);
    if (!pages.length) {
      pages = [{ name: "Page 1", fields: ensureArray(input.fields) }];
    }
    var useTabMode = tabModeFor(input, pages.length);
    for (var p = 0; p < pages.length; p++) {
      var page = pageDefaults(pages[p], p, useTabMode);
      doc.pages.push(page);
      var fields = ensureArray(pages[p].fields || pages[p].formulaire || pages[p].components);
      for (var f = 0; f < fields.length; f++) {
        compileField(fields[f], page.pageTechName, byType, doc.formulaire, null);
      }
    }
    var flows = ensureArray(input.flows);
    for (var fl = 0; fl < flows.length; fl++) {
      var flowIn = flows[fl];
      if (!flowIn || typeof flowIn !== "object") {
        continue;
      }
      var flowId = trimmed(flowIn.id || flowIn.name);
      if (!flowId.length) {
        flowId = "flow_" + nextId();
      }
      var target = null;
      for (var existing = 0; existing < doc.flows.length; existing++) {
        if (doc.flows[existing].id === flowId) {
          target = doc.flows[existing];
          break;
        }
      }
      if (target == null) {
        target = { id: flowId, elements: [] };
        if (flowIn.name) {
          target.name = flowIn.name;
        }
        doc.flows.push(target);
      }
      var elements = ensureArray(flowIn.elements);
      for (var e = 0; e < elements.length; e++) {
        var compiledElement = compileFlowElement(elements[e], byType);
        if (compiledElement) {
          target.elements.push(compiledElement);
        }
      }
    }
    if (input.tag != null) {
      doc.tag = Array.isArray(input.tag) ? input.tag : [String(input.tag)];
    }
    if (input.subTag != null) {
      doc.subTag = Array.isArray(input.subTag) ? input.subTag : [String(input.subTag)];
    }
    doc.chatSummary = input.chatSummary || "";
    doc.chatResponse = input.chatResponse || "";
    return {
      status: "ok",
      project: opts.project || opts.projectName || "C8Oforms",
      allTypesPath: contract.file,
      form: doc,
      validation: validateForm(doc, { project: opts.project || opts.projectName || "C8Oforms" }).validation
    };
  }

  function validateForm(form, options) {
    var opts = options || {};
    var issues = [];
    var warnings = [];
    var contract = null;
    var byType = {};
    try {
      contract = readAllTypes(opts.project || opts.projectName || "C8Oforms");
      byType = indexCatalog(contract.catalog);
    } catch (e) {
      warnings.push({ code: "catalog_unavailable", message: String(e) });
    }
    function issue(code, message, path) {
      issues.push({ code: code, message: message, path: path || "" });
    }
    if (!form || typeof form !== "object" || Array.isArray(form)) {
      issue("invalid_form", "Form must be a JSON object", "");
    } else {
      if (!Array.isArray(form.pages) || form.pages.length === 0) {
        issue("missing_pages", "Form must contain at least one page", "/pages");
      }
      if (!Array.isArray(form.formulaire)) {
        issue("missing_formulaire", "Form must contain formulaire array", "/formulaire");
      }
      var pageMap = {};
      ensureArray(form.pages).forEach(function (page, idx) {
        if (!page || typeof page !== "object") {
          issue("invalid_page", "Page must be an object", "/pages/" + idx);
          return;
        }
        if (!trimmed(page.pageTechName).length) {
          issue("missing_page_tech_name", "Page is missing pageTechName", "/pages/" + idx + "/pageTechName");
        } else {
          pageMap[String(page.pageTechName)] = true;
        }
      });
      var ids = {};
      ensureArray(form.formulaire).forEach(function (item, idx) {
        if (!item || typeof item !== "object") {
          issue("invalid_component", "Component must be an object", "/formulaire/" + idx);
          return;
        }
        var type = normalizeType(item.type);
        if (!type.length) {
          issue("missing_component_type", "Component is missing type", "/formulaire/" + idx + "/type");
        } else if (contract && byType[type] == null) {
          issue("unsupported_component_type", "Unsupported component type: " + type, "/formulaire/" + idx + "/type");
        }
        if (item.id == null || trimmed(item.id).length === 0) {
          issue("missing_component_id", "Component is missing id", "/formulaire/" + idx + "/id");
        } else if (ids[String(item.id)]) {
          issue("duplicate_component_id", "Duplicate component id: " + item.id, "/formulaire/" + idx + "/id");
        } else {
          ids[String(item.id)] = { item: item, path: "/formulaire/" + idx };
        }
        var pageName = item.config && item.config.page != null ? String(item.config.page) : "";
        if (pageName.length && !pageMap[pageName] && pageName !== "formulas") {
          issue("unknown_component_page", "Component references unknown page: " + pageName, "/formulaire/" + idx + "/config/page");
        }
      });
      ensureArray(form.formulaire).forEach(function (item, idx) {
        if (!item || typeof item !== "object") {
          return;
        }
        if (item.parentRef != null && !ids[String(item.parentRef)]) {
          issue("unknown_parent_ref", "parentRef points to a missing component: " + item.parentRef, "/formulaire/" + idx + "/parentRef");
        }
        ensureArray(item.childrenRefs).forEach(function (childId, cidx) {
          var child = ids[String(childId)];
          if (!child) {
            issue("unknown_child_ref", "childrenRefs points to a missing component: " + childId, "/formulaire/" + idx + "/childrenRefs/" + cidx);
          } else if (String(child.item.parentRef) !== String(item.id)) {
            issue("child_parent_mismatch", "Referenced child does not point back to parent", child.path + "/parentRef");
          }
        });
      });
      if (form.flows != null && !Array.isArray(form.flows)) {
        issue("invalid_flows", "flows must be an array", "/flows");
      }
      var flowIds = {};
      ensureArray(form.flows).forEach(function (flow, idx) {
        if (!flow || typeof flow !== "object") {
          issue("invalid_flow", "Flow must be an object", "/flows/" + idx);
          return;
        }
        var id = trimmed(flow.id || flow.name);
        if (!id.length) {
          issue("missing_flow_id", "Flow must define id or name", "/flows/" + idx);
        } else {
          flowIds[id] = true;
        }
        if (!Array.isArray(flow.elements)) {
          issue("invalid_flow_elements", "Flow elements must be an array", "/flows/" + idx + "/elements");
        }
      });
      ensureArray(form.formulaire).forEach(function (item, idx) {
        if (item && item.flow && !flowIds[String(item.flow)]) {
          issue("unknown_field_flow", "Field references unknown flow: " + item.flow, "/formulaire/" + idx + "/flow");
        }
      });
    }
    return {
      status: issues.length ? "invalid" : "ok",
      validation: {
        valid: issues.length === 0,
        issueCount: issues.length,
        warningCount: warnings.length,
        issues: issues,
        warnings: warnings
      }
    };
  }

  function callC8oSequence(project, sequence, variables) {
    var params = new HashMap();
    var projectArray = java.lang.reflect.Array.newInstance(java.lang.String, 1);
    projectArray[0] = project;
    params.put("__project", projectArray);
    params.put("__sequence", sequence);
    params.put("__context", "syncContext_" + java.lang.System.currentTimeMillis());
    var keys = Object.keys(variables || {});
    for (var i = 0; i < keys.length; i++) {
      if (variables[keys[i]] != null) {
        params.put(keys[i], variables[keys[i]]);
      }
    }
    var hasContext = typeof context !== "undefined" && context;
    var request = hasContext && context.httpServletRequest ? context.httpServletRequest : new InternalHttpServletRequest();
    var requester = new InternalRequester(params, request);
    var response = requester.processRequest();
    var json = JSON.parse(XMLUtils.XmlToJson(response.getDocumentElement(), true, true, JsonOutput.JsonRoot.docNode).toString());
    try {
      var ctx2 = requester.getContext();
      Engine.theApp.contextManager.remove(ctx2);
    } catch (_ignoreCtx) {}
    if (hasContext && context.logParameters) {
      org.apache.log4j.MDC.put("ContextualParameters", context.logParameters);
    }
    return json;
  }

  function currentMcpProjectName() {
    try {
      if (typeof context !== "undefined" && context && context.project && context.project.getName) {
        return String(context.project.getName());
      }
    } catch (_ignoreProjectName) {}
    return "ConvertigoMCP";
  }

  function unwrapSequenceResult(response) {
    if (!response) {
      return response;
    }
    if (response.document && response.document.result) {
      return response.document.result;
    }
    if (response.doc && response.doc.document && response.doc.document.result) {
      return response.doc.document.result;
    }
    if (response.result) {
      return response.result;
    }
    return response;
  }

  function apiError(response) {
    if (!response) {
      return null;
    }
    if (response.document && response.document.error) {
      return response.document.error;
    }
    if (response.doc && response.doc.document && response.doc.document.error) {
      return response.doc.document.error;
    }
    if (response.error) {
      return response.error;
    }
    return null;
  }

  function validateToken(options) {
    var opts = options || {};
    var token = trimmed(opts.token);
    if (!token.length) {
      return {
        status: "invalid",
        authenticated: false,
        error: { code: "missing_token", message: "No Code token is required." }
      };
    }
    var response = callC8oSequence(currentMcpProjectName(), "nocode_validate_token", { token: token });
    var error = apiError(response);
    if (error) {
      return {
        status: "invalid",
        authenticated: false,
        error: error,
        response: unwrapSequenceResult(response)
      };
    }
    return unwrapSequenceResult(response);
  }

  function unwrapApiResult(response) {
    if (!response) {
      return response;
    }
    if (response.document && response.document.res) {
      return response.document.res;
    }
    if (response.doc && response.doc.document && response.doc.document.res) {
      return response.doc.document.res;
    }
    return response;
  }

  function saveForm(form, options) {
    var opts = options || {};
    var validation = validateForm(form, opts).validation;
    if (!validation.valid) {
      return { status: "invalid", saved: false, validation: validation };
    }
    var authentication = validateToken(opts);
    if (!authentication || authentication.authenticated !== true) {
      return {
        status: "auth_required",
        saved: false,
        validation: validation,
        authentication: authentication || { authenticated: false }
      };
    }
    var response = callC8oSequence(opts.project || opts.projectName || "C8Oforms", "APIV2_updateFormulaireDocument", {
      meta: JSON.stringify(form)
    });
    var error = apiError(response);
    if (error) {
      return {
        status: "error",
        saved: false,
        validation: validation,
        authentication: authentication,
        error: error,
        response: unwrapApiResult(response)
      };
    }
    return {
      status: "ok",
      saved: true,
      validation: validation,
      authentication: authentication,
      response: unwrapApiResult(response)
    };
  }

  function getForm(id, options) {
    var opts = options || {};
    if (!trimmed(id).length) {
      throw new Error("id is required");
    }
    var authentication = validateToken(opts);
    if (!authentication || authentication.authenticated !== true) {
      return {
        status: "auth_required",
        fetched: false,
        authentication: authentication || { authenticated: false }
      };
    }
    var response = callC8oSequence(opts.project || opts.projectName || "C8Oforms", "APIV2_getDocument", {
      id: String(id),
      rev: opts.rev || "",
      fromResponse: "false",
      exportForm: "false"
    });
    var error = apiError(response);
    if (error) {
      return {
        status: "error",
        fetched: false,
        authentication: authentication,
        error: error,
        response: unwrapApiResult(response)
      };
    }
    return unwrapApiResult(response);
  }

  function applyMergePatch(target, patch) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return target;
    }
    var out = clone(target, {});
    for (var key in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) {
        continue;
      }
      var value = patch[key];
      if (value === null) {
        try { delete out[key]; } catch (_ignoreDelete) {}
      } else if (value && typeof value === "object" && !Array.isArray(value) && out[key] && typeof out[key] === "object" && !Array.isArray(out[key])) {
        out[key] = applyMergePatch(out[key], value);
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  function normalizeIndex(index, length, defaultIndex) {
    var out = index == null || index === "" ? defaultIndex : Number(index);
    if (!isFinite(out)) {
      out = defaultIndex;
    }
    out = Math.floor(out);
    if (out < 0) {
      out = 0;
    }
    if (out > length) {
      out = length;
    }
    return out;
  }

  function findByIdOrName(list, id, name, label) {
    var items = ensureArray(list);
    var textId = trimmed(id);
    var textName = trimmed(name);
    if (!textId.length && !textName.length) {
      throw new Error((label || "item") + " id or name is required");
    }
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item || typeof item !== "object") {
        continue;
      }
      if (textId.length && String(item.id) === textId) {
        return { item: item, index: i };
      }
      if (textName.length && String(item.name) === textName) {
        return { item: item, index: i };
      }
      if (textName.length && String(item.pageTechName) === textName) {
        return { item: item, index: i };
      }
    }
    throw new Error((label || "item") + " not found: " + (textId || textName));
  }

  function findPage(form, op) {
    return findByIdOrName(form.pages, op.pageTechName || op.pageId || op.page, op.pageName || op.name, "page");
  }

  function findField(form, op) {
    return findByIdOrName(form.formulaire, op.fieldId || op.id || op.field, op.fieldName || op.name, "field");
  }

  function findFlow(form, op) {
    return findByIdOrName(form.flows, op.flowId || op.id || op.flow, op.flowName || op.name, "flow");
  }

  function findFlowElement(flow, op) {
    return findByIdOrName(flow.elements, op.elementId || op.id || op.element, op.elementName || op.name, "flow element");
  }

  function makePageFromOperation(op, index, tabMode) {
    var page = op.pageObject || op.pageData || (op.page && typeof op.page === "object" && !Array.isArray(op.page) ? op.page : op);
    return pageDefaults(page, index, tabMode);
  }

  function pageTechNameForOperation(form, op, fallback) {
    if (op.pageTechName || op.pageId || op.page || op.pageName) {
      return findPage(form, op).item.pageTechName;
    }
    if (fallback != null) {
      return fallback;
    }
    if (form.pages && form.pages[0]) {
      return form.pages[0].pageTechName;
    }
    throw new Error("No target page found");
  }

  function childRefId(ref) {
    return ref && typeof ref === "object" ? ref.id : ref;
  }

  function collectDescendantIds(list, rootId, out) {
    var ids = out || {};
    var id = String(rootId);
    if (ids[id]) {
      return ids;
    }
    ids[id] = true;
    var items = ensureArray(list);
    var changed = true;
    while (changed) {
      changed = false;
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item || item.id == null) {
          continue;
        }
        var itemId = String(item.id);
        if (ids[itemId]) {
          var refs = ensureArray(item.childrenRefs).concat(ensureArray(item.childrenRefsElse));
          for (var r = 0; r < refs.length; r++) {
            var refId = childRefId(refs[r]);
            if (refId != null && !ids[String(refId)]) {
              ids[String(refId)] = true;
              changed = true;
            }
          }
        } else if (item.parentRef != null && ids[String(item.parentRef)]) {
          ids[itemId] = true;
          changed = true;
        }
      }
    }
    return ids;
  }

  function removeRefsToIds(list, ids) {
    var items = ensureArray(list);
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item || typeof item !== "object") {
        continue;
      }
      ["childrenRefs", "childrenRefsElse"].forEach(function (key) {
        if (Array.isArray(item[key])) {
          item[key] = item[key].filter(function (ref) {
            var refId = childRefId(ref);
            return refId == null || !ids[String(refId)];
          });
        }
      });
    }
  }

  function removeItemsByIds(list, ids) {
    var out = [];
    var items = ensureArray(list);
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item && item.id != null && ids[String(item.id)]) {
        continue;
      }
      out.push(item);
    }
    return out;
  }

  function removeFieldById(form, id) {
    var ids = collectDescendantIds(form.formulaire, id, {});
    removeRefsToIds(form.formulaire, ids);
    form.formulaire = removeItemsByIds(form.formulaire, ids);
    return Object.keys(ids);
  }

  function removeFlowElementById(flow, id) {
    var ids = collectDescendantIds(flow.elements, id, {});
    removeRefsToIds(flow.elements, ids);
    flow.elements = removeItemsByIds(flow.elements, ids);
    return Object.keys(ids);
  }

  function moveFieldById(form, id, pageTechName, parentId, index) {
    var found = findField(form, { id: id });
    var ids = collectDescendantIds(form.formulaire, found.item.id, {});
    var moving = [];
    var remaining = [];
    for (var i = 0; i < form.formulaire.length; i++) {
      var item = form.formulaire[i];
      if (item && item.id != null && ids[String(item.id)]) {
        moving.push(item);
      } else {
        remaining.push(item);
      }
    }
    form.formulaire = remaining;
    removeRefsToIds(form.formulaire, ids);
    if (parentId != null && parentId !== "") {
      var parent = findField(form, { id: parentId }).item;
      parent.childrenRefs = ensureArray(parent.childrenRefs);
      parent.childrenRefs.splice(normalizeIndex(index, parent.childrenRefs.length, parent.childrenRefs.length), 0, found.item.id);
      found.item.parentRef = parent.id;
      var parentIndex = findField(form, { id: parent.id }).index;
      form.formulaire.splice(parentIndex + 1, 0, found.item);
      for (var m = 1; m < moving.length; m++) {
        form.formulaire.splice(parentIndex + 1 + m, 0, moving[m]);
      }
    } else {
      try { delete found.item.parentRef; } catch (_ignoreParentDelete) {}
      var insertAt = normalizeIndex(index, form.formulaire.length, form.formulaire.length);
      form.formulaire.splice(insertAt, 0, found.item);
      for (var n = 1; n < moving.length; n++) {
        form.formulaire.splice(insertAt + n, 0, moving[n]);
      }
    }
    for (var j = 0; j < moving.length; j++) {
      moving[j].config = moving[j].config && typeof moving[j].config === "object" ? moving[j].config : {};
      moving[j].config.page = pageTechName;
    }
  }

  function applyRootIntent(form, op) {
    var patch = {};
    if (op.patch && typeof op.patch === "object" && !Array.isArray(op.patch)) {
      patch = op.patch;
    }
    if (hasOwn(op, "name")) {
      patch.name = op.name;
    }
    if (hasOwn(op, "description")) {
      patch.descform = op.description;
    }
    if (hasOwn(op, "language")) {
      patch.lang = op.language;
    }
    if (hasOwn(op, "backgroundColor")) {
      patch.wallpaper = { enabled: true, index: 0, random: "assets/images/svg/imgplaceholder/placeholder0.svg", type: "color", link: null, color: String(op.backgroundColor) };
    }
    if (hasOwn(op, "thumbnailUrl")) {
      patch.thumbnail = { enabled: true, index: 0, type: "url", url: String(op.thumbnailUrl) };
    }
    return applyMergePatch(form, patch);
  }

  function applyEditOperation(form, op, catalogByType, summary) {
    if (op && typeof op === "object" && !Array.isArray(op) && !op.action && !op.op && !op.type) {
      if (op.operation && typeof op.operation === "object") {
        op = op.operation;
      } else if (op.operations != null) {
        var nested = parseOperations(op.operations, "operations", []);
        for (var nestedIndex = 0; nestedIndex < nested.length; nestedIndex++) {
          applyEditOperation(form, nested[nestedIndex], catalogByType, summary);
        }
        return;
      }
    }
    if (!op || typeof op !== "object" || Array.isArray(op)) {
      throw new Error("Each operation must be an object");
    }
    var action = trimmed(op.action || op.op || op.type).toLowerCase();
    if (!action.length) {
      throw new Error("operation.action is required; received keys: " + Object.keys(op || {}).join(", "));
    }
    var actionAliases = {
      add_component: "add_field",
      update_component: "update_field",
      remove_component: "remove_field",
      delete_component: "delete_field",
      move_component: "move_field",
      add_element: "add_field",
      update_element: "update_field",
      remove_element: "remove_field",
      delete_element: "delete_field",
      move_element: "move_field"
    };
    action = actionAliases[action] || action;
    form.pages = ensureArray(form.pages);
    form.formulaire = ensureArray(form.formulaire);
    form.flows = ensureArray(form.flows);

    if (action === "set_root" || action === "set_media") {
      var updated = applyRootIntent(form, op);
      for (var rootKey in updated) {
        if (Object.prototype.hasOwnProperty.call(updated, rootKey)) {
          form[rootKey] = updated[rootKey];
        }
      }
      summary.push({ action: action });
      return;
    }
    if (action === "add_page") {
      var pageIndex = normalizeIndex(op.index, form.pages.length, form.pages.length);
      var page = makePageFromOperation(op, pageIndex, tabModeFor({ navigationMode: op.navigationMode || "tabs" }, form.pages.length + 1));
      form.pages.splice(pageIndex, 0, page);
      summary.push({ action: action, pageTechName: page.pageTechName, index: pageIndex });
      return;
    }
    if (action === "update_page") {
      var pageFound = findPage(form, op);
      var pagePatch = op.patch && typeof op.patch === "object" ? op.patch : op.pageObject || op.pageData || (op.page && typeof op.page === "object" ? op.page : {});
      if (hasOwn(op, "description")) {
        pagePatch.desc = op.description;
      }
      form.pages[pageFound.index] = applyMergePatch(pageFound.item, pagePatch);
      summary.push({ action: action, pageTechName: form.pages[pageFound.index].pageTechName });
      return;
    }
    if (action === "remove_page" || action === "delete_page") {
      var removePage = findPage(form, op);
      var removePageTech = removePage.item.pageTechName;
      var idsToRemove = {};
      for (var rf = 0; rf < form.formulaire.length; rf++) {
        var field = form.formulaire[rf];
        if (field && field.config && String(field.config.page) === String(removePageTech) && field.id != null) {
          collectDescendantIds(form.formulaire, field.id, idsToRemove);
        }
      }
      removeRefsToIds(form.formulaire, idsToRemove);
      form.formulaire = removeItemsByIds(form.formulaire, idsToRemove);
      form.pages.splice(removePage.index, 1);
      if (!form.pages.length) {
        form.pages.push(pageDefaults({ name: "Page 1" }, 0, false));
      }
      summary.push({ action: action, pageTechName: removePageTech, removedFieldIds: Object.keys(idsToRemove) });
      return;
    }
    if (action === "move_page") {
      var fromIndex = op.fromIndex != null ? Number(op.fromIndex) : findPage(form, op).index;
      if (!isFinite(fromIndex) || !form.pages[fromIndex]) {
        throw new Error("source page not found");
      }
      var destIndex = normalizeIndex(op.toIndex != null ? op.toIndex : op.index, form.pages.length - 1, form.pages.length - 1);
      var movingPage = form.pages.splice(fromIndex, 1)[0];
      form.pages.splice(destIndex, 0, movingPage);
      var order = {};
      for (var po = 0; po < form.pages.length; po++) {
        order[String(form.pages[po].pageTechName)] = po;
      }
      form.formulaire.sort(function (a, b) {
        var ap = a && a.config ? order[String(a.config.page)] : null;
        var bp = b && b.config ? order[String(b.config.page)] : null;
        return (ap == null ? 999999 : ap) - (bp == null ? 999999 : bp);
      });
      summary.push({ action: action, pageTechName: movingPage.pageTechName, fromIndex: fromIndex, toIndex: destIndex });
      return;
    }
    if (action === "add_field") {
      var fieldDef = op.fieldObject || (op.field && typeof op.field === "object" && !Array.isArray(op.field) ? op.field : op);
      var pageTech = pageTechNameForOperation(form, op, null);
      var beforeLength = form.formulaire.length;
      var parentId = trimmed(op.parentId || op.parent || op.parentFieldId);
      var compiled = compileField(fieldDef, pageTech, catalogByType, form.formulaire, parentId.length ? parentId : null);
      if (parentId.length) {
        var parentField = findField(form, { id: parentId }).item;
        parentField.childrenRefs = ensureArray(parentField.childrenRefs);
        if (parentField.childrenRefs.indexOf(compiled.id) < 0) {
          parentField.childrenRefs.splice(normalizeIndex(op.index, parentField.childrenRefs.length, parentField.childrenRefs.length), 0, compiled.id);
        }
        var addedChildren = form.formulaire.splice(beforeLength);
        var parentIndexForAdd = findField(form, { id: parentField.id }).index;
        Array.prototype.splice.apply(form.formulaire, [parentIndexForAdd + 1, 0].concat(addedChildren));
      } else if (op.index != null) {
        var added = form.formulaire.splice(beforeLength);
        Array.prototype.splice.apply(form.formulaire, [normalizeIndex(op.index, form.formulaire.length, form.formulaire.length), 0].concat(added));
      }
      summary.push({ action: action, fieldId: compiled.id, name: compiled.name, pageTechName: pageTech });
      return;
    }
    if (action === "update_field") {
      var fieldFound = findField(form, op);
      var fieldPatch = op.patch && typeof op.patch === "object" ? op.patch : op.fieldObject || (op.field && typeof op.field === "object" ? op.field : {});
      form.formulaire[fieldFound.index] = applyMergePatch(fieldFound.item, fieldPatch);
      summary.push({ action: action, fieldId: form.formulaire[fieldFound.index].id, name: form.formulaire[fieldFound.index].name });
      return;
    }
    if (action === "remove_field" || action === "delete_field") {
      var removeField = findField(form, op);
      var removed = removeFieldById(form, removeField.item.id);
      summary.push({ action: action, fieldId: removeField.item.id, removedFieldIds: removed });
      return;
    }
    if (action === "move_field") {
      var moveField = findField(form, op);
      var movePage = pageTechNameForOperation(form, op, moveField.item.config && moveField.item.config.page);
      var moveParentId = trimmed(op.parentId || op.parent || op.parentFieldId);
      moveFieldById(form, moveField.item.id, movePage, moveParentId.length ? moveParentId : null, op.index);
      summary.push({ action: action, fieldId: moveField.item.id, pageTechName: movePage, parentId: moveParentId || null });
      return;
    }
    if (action === "add_flow") {
      var flow = op.flowData || (op.flow && typeof op.flow === "object" && !Array.isArray(op.flow) ? clone(op.flow, {}) : {});
      flow.id = trimmed(flow.id || op.flowId || op.id || op.name) || ("flow_" + nextId());
      flow.name = trimmed(flow.name || op.flowName || op.name) || flow.id;
      flow.elements = ensureArray(flow.elements);
      form.flows.splice(normalizeIndex(op.index, form.flows.length, form.flows.length), 0, flow);
      summary.push({ action: action, flowId: flow.id });
      return;
    }
    if (action === "update_flow") {
      var flowFound = findFlow(form, op);
      var flowPatch = op.patch && typeof op.patch === "object" ? op.patch : op.flowData || (op.flow && typeof op.flow === "object" ? op.flow : {});
      form.flows[flowFound.index] = applyMergePatch(flowFound.item, flowPatch);
      summary.push({ action: action, flowId: form.flows[flowFound.index].id });
      return;
    }
    if (action === "remove_flow" || action === "delete_flow") {
      var removeFlow = findFlow(form, op);
      form.flows.splice(removeFlow.index, 1);
      summary.push({ action: action, flowId: removeFlow.item.id || removeFlow.item.name });
      return;
    }
    if (action === "add_flow_element") {
      var targetFlow = findFlow(form, op).item;
      targetFlow.elements = ensureArray(targetFlow.elements);
      var flowElementDef = op.element && typeof op.element === "object" && !Array.isArray(op.element) ? op.element : op;
      var flowElement = compileFlowElement(flowElementDef, catalogByType);
      var flowParentId = trimmed(op.parentId || op.parent || op.parentElementId);
      if (flowParentId.length) {
        var flowParent = findFlowElement(targetFlow, { id: flowParentId }).item;
        var refKey = trimmed(op.refKey || op.targetCardChild) || "childrenRefs";
        flowParent[refKey] = ensureArray(flowParent[refKey]);
        flowElement.parentRef = flowParent.id;
        flowParent[refKey].splice(normalizeIndex(op.index, flowParent[refKey].length, flowParent[refKey].length), 0, flowElement.id);
        var flowParentIndex = findFlowElement(targetFlow, { id: flowParent.id }).index;
        targetFlow.elements.splice(flowParentIndex + 1, 0, flowElement);
      } else {
        targetFlow.elements.splice(normalizeIndex(op.index, targetFlow.elements.length, targetFlow.elements.length), 0, flowElement);
      }
      summary.push({ action: action, flowId: targetFlow.id || targetFlow.name, elementId: flowElement.id });
      return;
    }
    if (action === "update_flow_element") {
      var updateFlow = findFlow(form, op).item;
      var flowElementFound = findFlowElement(updateFlow, op);
      var flowElementPatch = op.patch && typeof op.patch === "object" ? op.patch : op.element || {};
      updateFlow.elements[flowElementFound.index] = applyMergePatch(flowElementFound.item, flowElementPatch);
      summary.push({ action: action, flowId: updateFlow.id || updateFlow.name, elementId: updateFlow.elements[flowElementFound.index].id });
      return;
    }
    if (action === "remove_flow_element" || action === "delete_flow_element") {
      var removeFromFlow = findFlow(form, op).item;
      var removeElement = findFlowElement(removeFromFlow, op);
      var removedFlowElements = removeFlowElementById(removeFromFlow, removeElement.item.id);
      summary.push({ action: action, flowId: removeFromFlow.id || removeFromFlow.name, removedElementIds: removedFlowElements });
      return;
    }
    if (action === "move_flow_element") {
      var sourceFlow = findFlow(form, { flowId: op.fromFlowId || op.flowId || op.flow, flowName: op.fromFlowName || op.flowName }).item;
      var destinationFlow = op.toFlowId || op.toFlowName ? findFlow(form, { flowId: op.toFlowId, flowName: op.toFlowName }).item : sourceFlow;
      var sourceElement = findFlowElement(sourceFlow, op);
      var flowIds = collectDescendantIds(sourceFlow.elements, sourceElement.item.id, {});
      var flowMoving = [];
      var flowRemaining = [];
      for (var fe = 0; fe < sourceFlow.elements.length; fe++) {
        var currentElement = sourceFlow.elements[fe];
        if (currentElement && currentElement.id != null && flowIds[String(currentElement.id)]) {
          flowMoving.push(currentElement);
        } else {
          flowRemaining.push(currentElement);
        }
      }
      sourceFlow.elements = flowRemaining;
      removeRefsToIds(sourceFlow.elements, flowIds);
      var destParentId = trimmed(op.parentId || op.parent || op.parentElementId);
      if (destParentId.length) {
        var destParent = findFlowElement(destinationFlow, { id: destParentId }).item;
        var destRefKey = trimmed(op.refKey || op.targetCardChild) || "childrenRefs";
        destParent[destRefKey] = ensureArray(destParent[destRefKey]);
        flowMoving[0].parentRef = destParent.id;
        destParent[destRefKey].splice(normalizeIndex(op.index, destParent[destRefKey].length, destParent[destRefKey].length), 0, flowMoving[0].id);
      } else {
        try { delete flowMoving[0].parentRef; } catch (_ignoreFlowParentDelete) {}
      }
      destinationFlow.elements = ensureArray(destinationFlow.elements);
      Array.prototype.splice.apply(destinationFlow.elements, [normalizeIndex(destParentId.length ? null : op.index, destinationFlow.elements.length, destinationFlow.elements.length), 0].concat(flowMoving));
      summary.push({ action: action, fromFlowId: sourceFlow.id || sourceFlow.name, toFlowId: destinationFlow.id || destinationFlow.name, elementId: sourceElement.item.id });
      return;
    }
    throw new Error("Unsupported no-code edit action: " + action);
  }

  function applyEditOperations(form, operations, options) {
    var opts = options || {};
    var contract = readAllTypes(opts.project || opts.projectName || "C8Oforms");
    var catalogByType = indexCatalog(contract.catalog);
    var edited = clone(form, {});
    var ops = ensureArray(operations);
    var summary = [];
    for (var i = 0; i < ops.length; i++) {
      applyEditOperation(edited, ops[i], catalogByType, summary);
    }
    return { form: edited, operations: summary, allTypesPath: contract.file };
  }

  C8O.nocodeForms.contract = function (options) {
    var opts = options || {};
    var contract = readAllTypes(opts.project || opts.projectName || "C8Oforms");
    var types = contract.catalog.map(function (item) { return item.type; });
    return {
      status: "ok",
      project: opts.project || opts.projectName || "C8Oforms",
      allTypesPath: contract.file,
      types: types,
      aliases: clone(aliases, {}),
      authoringContract: detailedAuthoringContract(types),
      reducedSample: sampleContract(),
      allTypes: opts.includeAllTypes === true ? contract.catalog : null
    };
  };

  C8O.nocodeForms.compile = compileReduced;
  C8O.nocodeForms.validate = validateForm;
  C8O.nocodeForms.save = saveForm;
  C8O.nocodeForms.get = getForm;
  C8O.nocodeForms.create = function (reduced, options) {
    var compiled = compileReduced(reduced, options);
    var saved = saveForm(compiled.form, options);
    saved.form = compiled.form;
    saved.allTypesPath = compiled.allTypesPath;
    return saved;
  };
  C8O.nocodeForms.update = function (id, patch, options) {
    var current = getForm(id, options);
    if (current && current.fetched === false) {
      current.saved = false;
      return current;
    }
    var currentForm = current && current.res ? current.res : current;
    var patched = applyMergePatch(currentForm, patch);
    var saved = saveForm(patched, options);
    saved.form = patched;
    return saved;
  };
  C8O.nocodeForms.edit = function (id, operations, options) {
    try {
      var current = getForm(id, options);
      if (current && current.fetched === false) {
        current.saved = false;
        return current;
      }
      var currentForm = current && current.res ? current.res : current;
      var applied = applyEditOperations(currentForm, operations, options);
      var saved = saveForm(applied.form, options);
      saved.form = applied.form;
      saved.operations = applied.operations;
      saved.allTypesPath = applied.allTypesPath;
      return saved;
    } catch (e) {
      return {
        status: "error",
        saved: false,
        error: {
          code: "edit_failed",
          message: String(e && e.message ? e.message : e)
        }
      };
    }
  };
  C8O.nocodeForms.parseObject = parseObject;
  C8O.nocodeForms.parseArray = parseArray;
  C8O.nocodeForms.parseOperations = parseOperations;
})();
