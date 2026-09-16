if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.nocodeForms = C8O.nocodeForms || {};

(function () {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var File = Packages.java.io.File;
  var FileUtils = Packages.org.apache.commons.io.FileUtils;
  var HashMap = Packages.java.util.HashMap;
  var Base64 = Packages.java.util.Base64;
  var InternalHttpServletRequest = Packages.com.twinsoft.convertigo.engine.requesters.InternalHttpServletRequest;
  var InternalRequester = Packages.com.twinsoft.convertigo.engine.requesters.InternalRequester;
  var XMLUtils = Packages.com.twinsoft.convertigo.engine.util.XMLUtils;
  var JsonOutput = Packages.com.twinsoft.convertigo.engine.enums.JsonOutput;

  function trimmed(value) {
    return value == null ? "" : String(value).trim();
  }

  function requestBearerToken() {
    try {
      if (typeof context !== "undefined" && context && context.httpServletRequest) {
        var authorization = context.httpServletRequest.getHeader("Authorization");
        var match = /^Bearer\s+(.+)$/i.exec(String(authorization || ""));
        if (match && match[1] != null) {
          return trimmed(match[1]);
        }
      }
    } catch (_ignoreAuthorizationHeader) {}
    return "";
  }

  function clone(value, fallback) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_ignoreClone) {
      return fallback;
    }
  }

  // The Rhino JSON parser tolerates unbalanced or trailing input and silently
  // returns a truncated value; a malformed reduced form then compiled into an
  // empty "Untitled form" without any diagnostic. Refuse such text explicitly.
  function assertStrictJsonText(text, label) {
    var depth = 0, inString = false, escaped = false, started = false, endedAt = -1;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (inString) {
        if (escaped) { escaped = false; }
        else if (ch === "\\") { escaped = true; }
        else if (ch === "\"") { inString = false; if (depth === 0 && endedAt < 0) { endedAt = i; } }
        continue;
      }
      if (ch === "\"") { inString = true; started = true; }
      else if (ch === "{" || ch === "[") { depth++; started = true; }
      else if (ch === "}" || ch === "]") {
        depth--;
        if (depth < 0) { throw new Error((label || "value") + " is not valid JSON: unexpected '" + ch + "' at position " + i); }
        if (depth === 0 && endedAt < 0) { endedAt = i; }
      } else if (endedAt >= 0 && !/\s/.test(ch)) {
        throw new Error((label || "value") + " is not valid JSON: unexpected content after the closing bracket at position " + i);
      }
    }
    if (inString) { throw new Error((label || "value") + " is not valid JSON: unterminated string"); }
    if (depth !== 0 || !started) { throw new Error((label || "value") + " is not valid JSON: " + depth + " bracket(s) left open"); }
    return true;
  }

  function parseObject(value, label, fallback) {
    if (value == null || trimmed(value).length === 0) {
      return fallback;
    }
    var text = trimmed(value);
    if (text.charAt(0) === "{") {
      assertStrictJsonText(text, label);
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
      assertStrictJsonText(text, label);
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
      thumbnailColor: "#2f6fed",
      thumbnailImage: { contentType: "image/png", base64: "<base64 png>" },
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
      flows: []
    };
  }

  function dynamicReferenceContract() {
    return {
      syntax: "$$START<component-formula-or-action-id>{...smart-source-payload...}END<component-formula-or-action-id>$$",
      scope: "This is the general C8Oforms SmartSource reference mechanism. It can appear anywhere a C8Oforms dynamic string is accepted, including labels, source variable values, filter values, formulas, action parameters, conditions, and other UI-authored dynamic text.",
      rule: "The START id and END id identify the referenced component, formula, or action and must match each other. Preserve the full envelope exactly when copying, editing, or generating no-code JSON.",
      example: "$$START1780215220834{\"c8otype\":\"path\",\"c8opath\":\"\",\"c8oPrettyPath\":null,\"c8obuiltin\":null,\"fakeId\":\"${uniqueId}\",\"c8oName\":null}END1780215220834$$",
      complexObjectAccess: {
        field: "The SmartSource payload c8opath is the UI-authored path into the referenced value. For complex values, keep the dot path exactly as authored by C8Oforms.",
        syntax: "<componentName>.<property-or-column>.<nested-property>",
        componentValueShapes: {
          common: {
            submittedValuePath: "Most form components are read through formsSubmit[componentName].value. Components inside ion-card are read through formsSubmit[cardName].children[componentName].value or children.",
            sourceValuePath: "Source-backed components can also keep raw source choices or display models under local.sourceValue[componentName].",
            rule: "A c8opath segment after the component name follows the runtime object shape. Preserve the UI-authored path exactly."
          },
          grid: {
            rowShape: "{ <columnNameOrDisplayName>: <cellValueOrCellObject>, ... }",
            cellObjectFields: {
              value: "Raw/runtime value used for saved responses and comparisons.",
              displayValue: "Formatted value shown by the UI; prefer this for labels when the SmartSource path selected it.",
              displayName: "Visible column label. When present, C8Oforms can use it as the runtime row key and keep the original key in technicalName.",
              technicalName: "Original technical/source column name added by the grid runtime when displayName rewrites the visible key.",
              sortHide: "Source metadata used by the editor to hide the column from sort choices; preserve it when copying source model data.",
              filterHide: "Source metadata used by the editor to hide the column from filter choices; preserve it when copying source model data.",
              filterCompletion: "Optional completion metadata used by filter editors.",
              cType: "Optional source column type metadata used by filter editors.",
              type: "Optional cell rendering/type metadata, for example html."
            },
            returnedValueModes: {
              row_selected: "Paths such as <gridName>.<columnName>.displayValue read from the selected ag-grid row stored in local.techGrid.",
              cell_selected: "Use <gridName>.cellSelected.value/displayValue for the selected cell, or <gridName>.parentRow.<columnName>.displayValue for another value from the same row.",
              multiple_row_selected: "The selection is index-based; paths can target <gridName>.<index>.<columnName>.displayValue.",
              all_the_data: "The full source data is index-based under local.sourceValue; paths can target <gridName>.<index>.<columnName>.displayValue.",
              nothing: "The grid does not contribute a response value, but source data can still exist for UI/runtime access."
            },
            paths: ["<gridName>.<columnName>.displayValue", "<gridName>.cellSelected.displayValue", "<gridName>.parentRow.<columnName>.displayValue", "<gridName>.<index>.<columnName>.displayValue"],
            notes: [
              "The column name is the path segment before value/displayValue, for example Name in companies_grid.Name.displayValue.",
              "A grid row is not a flat map of strings. Cells can be rich objects carrying displayName, value, displayValue, sort/filter metadata, and runtime technicalName.",
              "If displayName differs from the original source key, C8Oforms may expose the row under displayName and store the original key in technicalName."
            ]
          },
          text: {
            submittedShape: "{ name, type: 'text', label, value: string, labelHtml }",
            paths: ["<textName>", "<textName>.<nestedKey> when value is an object"],
            notes: ["Ordinary text values are strings. Empty c8opath can validly mean the component value."]
          },
          slider: {
            submittedShape: "{ name, type: 'slider', label, value: number|string, labelHtml }",
            paths: ["<sliderName>"],
            notes: ["URL/default values can be coerced to number, but persisted responses may still be represented as runtime values."]
          },
          datetime: {
            submittedShape: "{ name, type: 'datetime', label, value: 'YYYY-MM-DD'|string, labelHtml }",
            builtins: ["fulldate", "day", "month", "year"],
            paths: ["<datetimeName>", "<datetimeName>.day via UI-authored builtin SmartSource"]
          },
          time: {
            submittedShape: "{ name, type: 'time', label, value: 'HH:mm'|string, labelHtml }",
            builtins: ["fullhours", "hours", "mins"],
            paths: ["<timeName>", "<timeName>.hours via UI-authored builtin SmartSource"]
          },
          barcode: {
            submittedShape: "{ name, type: 'barcode', label, value: string, labelHtml }",
            paths: ["<barcodeName>"]
          },
          checkbox: {
            submittedShape: "{ name, type: 'checkbox', label, children: [{ value, selected, other?, displayValue? }], labelHtml }",
            sourceShape: "local.sourceValue[name] is the source array; each choice can be a string or an object with value/displayValue.",
            builtins: ["selected_data_c8o_separated_by_coma", "not_selected_data_c8o_separated_by_coma", "selected_data", "not_selected_data", "all_data"],
            paths: ["<checkboxName>.<index>.value", "<checkboxName>.<index>.displayValue", "<checkboxName>.<index>.selected"],
            notes: ["No-path text rendering returns selected values separated by comma."]
          },
          radio: {
            submittedShape: "{ name, type: 'radio', label, value, children: [{ value, selected, other?, displayValue? }], labelHtml }",
            sourceShape: "For sourced radio components, local.sourceValue[name] keeps the available choices and local.techSelect[name] keeps the selected source object.",
            paths: ["<radioName>", "<radioName>.value", "<radioName>.displayValue for sourced selections"],
            notes: ["The submitted value is the raw value. displayValue is read from local.techSelect for sourced radio choices."]
          },
          select: {
            submittedShape: "{ name, type: 'select', label, value, children: [{ value, selected, other?, displayValue? }], labelHtml }",
            sourceShape: "For sourced selects, local.sourceValue[name] keeps the available choices and local.techSelect[name] keeps the selected source object.",
            paths: ["<selectName>", "<selectName>.value", "<selectName>.displayValue for sourced selections"],
            notes: ["Use value for the submitted value, displayValue for the visible selected label when available."]
          },
          radio_group: {
            submittedShape: "{ name, type: 'radio_group', label, children: { [lineTitle]: selectedValue }, children_label, labelHtml }",
            sourceShape: "When source-backed, local.sourceValue[name] carries children: [{ value, selected? }] and lines: [{ title, selected? }].",
            builtins: ["selected_data", "selected_data_c8o_separated_by_coma"],
            paths: ["<radioGroupName>.<lineTitle>"],
            notes: ["The runtime value is a map from row/line title to the selected column value."]
          },
          checkbox_group: {
            submittedShape: "{ name, type: 'checkbox_group', label, children: { [lineTitle]: [{ value, selected }] }, labelHtml }",
            sourceShape: "When source-backed, local.sourceValue[name] carries children: [{ value, selected? }] and lines: [{ title, selected? }].",
            builtins: ["selected_data_c8o_separated_by_coma", "not_selected_data_c8o_separated_by_coma", "selected_data", "not_selected_data", "all_data"],
            paths: ["<checkboxGroupName>.<lineTitle>.<index>.value", "<checkboxGroupName>.<lineTitle>.<index>.selected"],
            notes: ["The runtime value is a map from row/line title to an array of checkbox choices."]
          },
          location: {
            submittedShape: "{ name, type: 'location', label, value: { addr: {...}, gps: {...} }, labelHtml }",
            addrFields: ["AddressLine", "AdminDistrict", "AdminDistrict2", "CountryRegion", "FormattedAddress", "Locality", "PostalCode"],
            gpsFields: ["latitude", "longitude", "altitude", "accuracy", "altitudeAccuracy"],
            paths: ["<locationName>.addr.FormattedAddress", "<locationName>.gps.latitude"],
            notes: ["TEXT_format defaults to addr.FormattedAddress when available."]
          },
          media: {
            img: "{ name, type: 'img', label, value: Blob|File|attachmentName|string, att_type?, labelHtml }",
            signature: "{ name, type: 'signature', label, value: dataUrl|string|Blob, labelHtml }",
            file: "{ name, type: 'file', label, value: Array<File|Blob|attachmentName|string>, labelHtml }",
            paths: ["<imgName>", "<signatureName>", "<fileName>.<index>.name"],
            notes: ["HTML dynamic rendering has special handling: images/signatures can render as img tags, and files can render as links or image previews."]
          },
          chart: {
            sourceShape: "local.sourceValue[name] = { labels: [], xaxis: { categories: [] }, series: [] }.",
            seriesShapes: ["For bar/line/area/treemap: series contains { name, data: number[] } objects.", "For pie/donut/radar: series contains numeric values."],
            paths: ["<chartName>.labels.0", "<chartName>.xaxis.categories.0", "<chartName>.series.0.data.0"]
          },
          map: {
            sourceShape: "local.sourceValue[name] = { markers: [], circles: [], polygons: [], center?, xaxis: { categories: [] }, series: [] }.",
            markerShape: "{ options: { title }, tooltip, popup, lat, lng }",
            circleShape: "{ options: { title }, tooltip, popup, lat, lng, radius }",
            polygonShape: "{ options: { title }, tooltip, popup, coord: [[lat, lng], ...] }",
            paths: ["<mapName>.markers.0.lat", "<mapName>.circles.0.radius", "<mapName>.polygons.0.coord.0.0", "<mapName>.center.lat"]
          },
          ion_card: {
            submittedShape: "{ name, type: 'ion-card', children: { [childName]: childSubmittedShape }, label, labelHtml }",
            paths: ["<childName> references the child directly by id/name; runtime storage is nested under the card in formsSubmit."]
          },
          business_logic: {
            runtimeShape: "actions[name] = { name, type: 'business_logic', value }.",
            paths: ["<businessLogicName>", "<businessLogicName>.<nestedKey>"],
            notes: ["Business logic values are action values, not form response fields."]
          }
        },
        examples: [
          {
            use: "Display the Name column of the selected row in a grid label.",
            reference: "$$START1780214945653{\"c8otype\":\"path\",\"c8opath\":\"companies_grid.Name.displayValue\",\"c8oPrettyPath\":\"\",\"c8obuiltin\":\"false\",\"fakeId\":\"fakeId1780217041094\",\"c8oName\":null}END1780214945653$$",
            meaning: "Read companies_grid, then the Name field of the selected row, then its displayValue."
          },
          {
            use: "Display the currently selected cell value when a grid is configured with returned_value=cell_selected.",
            reference: "$$START1780214945653{\"c8otype\":\"path\",\"c8opath\":\"companies_grid.cellSelected.displayValue\",\"c8oPrettyPath\":\"\",\"c8obuiltin\":\"false\",\"fakeId\":\"fakeId1780217041095\",\"c8oName\":null}END1780214945653$$",
            meaning: "Read companies_grid, then the synthetic cellSelected object, then its displayValue."
          },
          {
            use: "Display another column from the row that owns the selected cell.",
            reference: "$$START1780214945653{\"c8otype\":\"path\",\"c8opath\":\"companies_grid.parentRow.Name.displayValue\",\"c8oPrettyPath\":\"\",\"c8obuiltin\":\"false\",\"fakeId\":\"fakeId1780217041096\",\"c8oName\":null}END1780214945653$$",
            meaning: "Read the parent row of the selected cell, then the Name cell displayValue."
          },
          {
            use: "Use the current value of a simple text component.",
            reference: "$$START1780215220834{\"c8otype\":\"path\",\"c8opath\":\"\",\"c8oPrettyPath\":null,\"c8obuiltin\":null,\"fakeId\":\"${uniqueId}\",\"c8oName\":null}END1780215220834$$",
            meaning: "An empty c8opath can be valid when the envelope already identifies the referenced simple component."
          }
        ],
        rules: [
          "For grids and other complex components, the selected object can expose nested fields such as <gridName>.<columnName>.displayValue.",
          "Use displayValue when the UI-authored SmartSource selected it; do not remove it because raw values and displayed values can differ.",
          "Use value when a raw persisted/runtime value is required; use displayValue when the UI label is required.",
          "Column or property names in c8opath are the authored C8Oforms/Baserow names. Preserve capitalization, spaces, and punctuation exactly when present.",
          "Do not invent c8opath strings manually when editing an existing document; preserve the UI-authored path or derive it from an observed SmartSource expression."
        ]
      },
      notes: [
        "Do not treat an empty c8opath inside the payload as invalid by itself; the START/END id envelope is the important runtime reference.",
        "Do not replace SmartSource envelopes with plain text ids, raw field names, or hand-written JavaScript expressions unless the target property explicitly expects JavaScript.",
        "When the referenced component, formula, or action id changes, update both START and END ids together."
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
      inputComponentGeneration: {
        source: "When generating input components from a Baserow table catalog, use the field type returned by lib_BaseRow.formscommon_FieldsList as the primary signal for the C8Oforms component type.",
        rule: "Do not default every Baserow column to text. Pick the component that best preserves the Baserow data type, choices, and write behavior.",
        fieldTypeToComponent: {
          text: { component: "text", notes: ["Single-line free text."] },
          long_text: { component: "text", configHints: ["Use a multiline/long-text config when available."], notes: ["Do not generate a select for long_text."] },
          email: { component: "text", configHints: ["Use email-oriented placeholder or validation when available."] },
          phone_number: { component: "text", configHints: ["Use phone-oriented placeholder or validation when available."] },
          url: { component: "text", configHints: ["Use URL-oriented placeholder or validation when available."] },
          password: { component: "text", configHints: ["Use hidden/password input config when available."] },
          number: { component: "text", configHints: ["Prefer numeric keyboard/validation config when available."], notes: ["Use slider only when the product intent provides a bounded min/max range."] },
          rating: { component: "slider", configHints: ["Set min/max/step from the Baserow rating metadata when available."], fallback: "text" },
          duration: { component: "text", notes: ["Duration has no dedicated C8Oforms input component in the reduced contract; preserve as a structured/text value unless a project-specific duration UI exists."] },
          date: { component: "datetime", configHints: ["Use Baserow date metadata to decide date-only versus date-time display when available."] },
          boolean: { component: "radio", values: ["true", "false"], fallback: "select", notes: ["Use an explicit binary choice because Baserow expects a boolean-like value for writes."] },
          single_select: {
            component: "select",
            source: "lib_BaseRow.formssource_GetFieldValues",
            staticValuesFallback: "field.select_options[].value only when the user explicitly requests an offline/static form.",
            valueRule: "Use a source-backed select so C8Oforms resolves the current Baserow dropdown values at runtime; lib_BaseRow.forms_AddRow maps the selected display value back to the Baserow option id when needed.",
            notes: [
              "This is the canonical mapping for Baserow dropdown/list fields.",
              "Do not materialize field.select_options as local children unless explicitly requested for an offline/static form."
            ]
          },
          multiple_select: { component: "checkbox", valuesFrom: "field.select_options[].value", writeSupport: "limited", notes: ["C8Oforms can present this as checkbox choices, but lib_BaseRow.forms_AddRow currently logs multiple_select as TODO, so do not promise robust Baserow writes without a tested action path."] },
          link_row: { component: "select", source: "lib_BaseRow.formssource_GetSelectData", valueRule: "Use the linked row id as value and a readable linked row column as displayValue.", notes: ["For one linked row, use select/radio. For many linked rows, use checkbox only when the target write path is tested."] },
          file: { component: "file", alternatives: ["img", "signature"], notes: ["Use img/signature only when the user intent is specifically photo/signature capture; otherwise use file."] },
          created_on: { component: "description", writable: false, notes: ["Read-only Baserow metadata; do not generate an input field for writes."] },
          created_by: { component: "description", writable: false, notes: ["Read-only Baserow metadata; do not generate an input field for writes."] },
          last_modified: { component: "description", writable: false, notes: ["Read-only Baserow metadata; do not generate an input field for writes."] },
          last_modified_by: { component: "description", writable: false, notes: ["Read-only Baserow metadata; do not generate an input field for writes."] },
          formula: { component: "description", writable: false, notes: ["Computed Baserow field; show it only as read-only display unless the app is editing formula inputs instead."] },
          lookup: { component: "description", writable: false, notes: ["Derived Baserow field; show read-only."] },
          rollup: { component: "description", writable: false, notes: ["Derived Baserow field; show read-only."] },
          count: { component: "description", writable: false, notes: ["Derived Baserow field; show read-only."] }
        },
        generationRules: [
          "For Baserow single_select inputs, generate a source-backed select using lib_BaseRow.formssource_GetFieldValues. Do not materialize field.select_options as local children unless explicitly requested for an offline/static form.",
          "For select/radio/checkbox values, preserve Baserow option labels exactly, including capitalization and punctuation.",
          "For link_row inputs, generate a source-backed select using lib_BaseRow.formssource_GetSelectData so the UI displays readable rows while submitting the linked row id.",
          "Do not generate writable inputs for read-only or computed Baserow types such as formula, lookup, rollup, count, created_on, created_by, last_modified, and last_modified_by.",
          "When the target flow will call lib_BaseRow.forms_AddRow or lib_BaseRow.forms_AddRowFromData, prefer Baserow types explicitly handled by those sequences: text, long_text, number, date, boolean, email, phone_number, rating, duration, password, url, single_select, link_row, and file.",
          "For multiple_select, either keep the field read-only or require an explicit tested write strategy, because the observed lib_BaseRow forms add-row sequences do not fully implement multiple_select writes."
        ]
      },
      formsConfig: {
        noCodeStudioIdentityRule: {
          requiredAtRuntime: ["form_id", "source_id", "source_owner"],
          managedDuringCreation: "Omit form_id/source_id/source_owner in new reduced input. Compilation assigns source_id; nocode-form-create fills real saved identities and the authenticated owner automatically, then verifies readback. Do not block creation because these values are initially unavailable.",
          requiredTogether: ["table_id", "table_id_int"],
          form_id: "The C8Oforms document id that owns the component.",
          source_id: "Must exactly match the id of the component carrying this source. formscommon_CheckConfig uses it to find the saved component and compare forms_config identity.",
          source_owner: "The No Code Studio owner/user email stored with the source.",
          table_id: "The UI path string, for example Workspace~>Database~>Table. Keep it even when table_id_int is present.",
          table_id_int: "The numeric Baserow table id.",
          outsideContract: "table_id_int alone is not a full source configuration: supply the discovered table path and requested columns too. Runtime identity fields are automatic for new creation; existing saved bindings must contain verified identities."
        },
        tableData: { required: ["table_id", "table_id_int", "columns"], optional: ["view_id", "hidden", "link_row_table_id"], example: { table_id: "Workspace~>Database~>Table", table_id_int: 123, columns: ["Name", "Amount"], hidden: [], link_row_table_id: [] } },
        selectData: { required: ["table_id", "table_id_int", "columns"], optional: ["view_id", "displayValue", "value", "hidden", "link_row_table_id"], example: { table_id: "Workspace~>Database~>Table", table_id_int: 123, columns: ["Name", "Code"], displayValue: "Name", value: "Code", hidden: [], link_row_table_id: [] } },
        fieldValues: { required: ["table_id", "columns"], example: { table_id: 123, columns: ["Status"] } }
      },
      filter: {
        variablesBySource: {
          tableData: "forms_tableFilter",
          selectData: "forms_Filter",
          selectSearch: "forms_filter"
        },
        dynamicValueReferences: "Filter values in val2.str use the general authoringContract.dynamicReferences SmartSource mechanism.",
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
          "For source objects copied from C8Oforms, keep the conds/condVisible/type metadata.",
          "When val2.str references another form variable, preserve the $$START...END...$$ SmartSource envelope exactly."
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
          id: 1780132310205,
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
          id: 1780132310206,
          name: "customer",
          sourceEnabled: true,
          sources: {
            "lib_BaseRow.formssource_GetSelectData": {
              enabled: true,
              fullsync: false,
              vars: {
                forms_config: { str: "{\"table_id\":\"Workspace~>Database~>Customers\",\"table_id_int\":123,\"columns\":[\"Customer\",\"Customer ID\"],\"displayValue\":\"Customer\",\"value\":\"Customer ID\",\"hidden\":[],\"form_id\":\"1780132303501\",\"source_id\":1780132310206,\"source_owner\":\"user@example.com\",\"link_row_table_id\":[]}", html: false },
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

  function backendActionContract() {
    return {
      runtime: "Backend actions are not standalone visual flow elements. They are stored under a submit flow element actions object and executed by C8Oforms.APIV2_Execute_Sequences when that submit step runs.",
      storagePath: "flows[].elements[type='submit'].actions[sequenceQualifiedName]",
      sequenceKey: "The action object key is the fully qualified backend action sequence name, for example lib_Actions_C8Oforms.forms_notify_response_simple_by_mail_simple.",
      knownNoCodeBackendActions: {
        c8oforms: {
          "lib_Actions_C8Oforms.forms_notify_response_simple_by_mail_simple": {
            purpose: "Send a simple response notification email.",
            displayName: "Send an email.",
            vars: ["forms_mail_recipients_to", "forms_mail_recipients_cc", "forms_mail_recipients_bcc", "forms_mail_sender_alias", "forms_mail_subject", "forms_mail_body", "forms_mail_logo", "forms_mail_summary"],
            runtimeInputs: ["doc", "originalDoc"],
            notes: ["SMTP variables are resolved by the backend and should not be authored as ordinary No Code action vars unless the UI exposes them."]
          },
          "lib_Actions_C8Oforms.forms_delete_response": {
            purpose: "Delete responses from the form.",
            displayName: "Remove responses from the form.",
            vars: [],
            runtimeInputs: ["doc", "originalDoc"]
          },
          "lib_Actions_C8Oforms.forms_edit_field": {
            purpose: "Change a field value in the response document.",
            displayName: "Change the value of a field in the response.",
            vars: ["forms_input_field_name", "forms_input_field_value"],
            runtimeInputs: ["doc", "originalDoc"]
          },
          "lib_Actions_C8Oforms.forms_fill_PDF": {
            purpose: "Fill a PDF document from the form response.",
            displayName: "Fill out a PDF document.",
            vars: ["forms_input_pdf_path"],
            runtimeInputs: ["doc", "originalDoc"]
          }
        },
        baserow: {
          "lib_BaseRow.forms_AddRow": {
            displayName: "Add or update a row in the no-code database by matching form responses.",
            behavior: "Adds a row when forms_id is empty; updates the Baserow row identified by forms_id when it is set. Form response technical ids are matched to Baserow column names.",
            vars: ["forms_config", "forms_id", "forms_createColumn"],
            runtimeInputs: ["doc", "originalDoc"],
            underlyingSequences: ["lib_BaseRow.FieldsList", "lib_BaseRow.TableCreateColumn", "lib_BaseRow.TableCreateRow", "lib_BaseRow.TableUpdateRow"],
            notes: [
              "forms_createColumn=true creates text or file columns when a form field technical id does not match an existing Baserow column.",
              "Selection and linked-row values are converted according to Baserow field metadata."
            ]
          },
          "lib_BaseRow.forms_AddRowFromData": {
            displayName: "Add or update a row in the no-code database from explicit column/value data.",
            behavior: "Adds a row when forms_id is empty; updates the Baserow row identified by forms_id when it is set. Values come from forms_freeVars instead of the whole form response map.",
            vars: ["forms_config", "forms_id", "forms_createColumn", "forms_freeVars"],
            runtimeInputs: ["doc", "originalDoc"],
            underlyingSequences: ["lib_BaseRow.FieldsList", "lib_BaseRow.TableCreateColumn", "lib_BaseRow.TableCreateRow", "lib_BaseRow.TableUpdateRow"],
            forms_freeVars: "UI-authored multi-value variable (__c8o_multi) containing explicit column names and values. Values may include SmartSource references.",
            notes: [
              "Use this action when the UI author chooses the Baserow columns explicitly instead of relying on form field technical ids.",
              "forms_createColumn=true creates text or file columns when an explicit column name does not match an existing Baserow column."
            ]
          },
          "lib_BaseRow.forms_DeleteRow": {
            displayName: "Delete a row in the no-code database.",
            behavior: "Deletes the Baserow row identified by forms_id.",
            vars: ["forms_config", "forms_id"],
            runtimeInputs: ["doc", "originalDoc"],
            underlyingSequences: ["lib_BaseRow.TableDeleteRow"],
            notes: ["forms_id is mandatory; the sequence returns an error when it is empty."]
          }
        }
      },
      shape: {
        enabled: true,
        fullsync: false,
        vars: {
          forms_config: { str: "{\"form_id\":\"<form document id>\",\"source_id\":<submit action id>,\"source_owner\":\"user@example.com\"}", html: false },
          "<variableName>": { str: "<literal or $$START...END...$$ dynamic reference>", html: false }
        }
      },
      uiAuthoredRule: "Preserve the UI-authored action variable objects exactly. Backend action vars can contain SmartSource envelopes and the same { str, html:false } encoding rules as source variables.",
      identityRule: {
        creation: "For new reduced input, omit form_id/source_id/source_owner from forms_config. nocode-form-create binds these automatically from the authoritative saved form and authenticated creator. Never copy identity values from these illustrative saved-document examples.",
        form_id: "The C8Oforms document id that owns the submit action.",
        source_id: "The id of the submit/action element carrying the backend action.",
        source_owner: "The No Code Studio owner/user email stored with the action config.",
        baserowFormsConfig: "For lib_BaseRow.forms_* actions, forms_config is selected with lib_BaseRow/DisplayObjects/mobile/BrowseTables?noCols=true and must preserve the UI-authored table identity, typically table_id, table_id_int, form_id, source_id, and source_owner."
      },
      executionPayload: "At runtime, C8Oforms builds a response document containing resp, formId, timestamp, version, actions, finished:true, and flow:true, then sends it to APIV2_Execute_Sequences with attachments and attachments_meta.",
      resultAccess: "The response from APIV2_Execute_Sequences is written into actions[submitElementName].value and can be referenced later through the general SmartSource action mechanism.",
      rules: [
        "Do not model backend actions as top-level form fields.",
        "Do not put backend sequence calls directly on a button; put a submit element in the button flow and attach backend actions to that submit element.",
        "Use the backend sequence qualified name as the actions object key.",
        "Preserve forms_config and every variable as UI-authored objects; do not collapse them to raw strings.",
        "Dynamic backend action variables may use $$START...END$$ SmartSource references just like filters, labels, and formulas.",
        "For lib_BaseRow.forms_AddRow and lib_BaseRow.forms_DeleteRow, do not call TableCreateRow/TableUpdateRow/TableDeleteRow directly from No Code Studio; use the forms_* wrappers so formscommon_CheckConfig, attachments, field conversion, and UI-authored configuration are honored."
      ],
      example: {
        flow: {
          id: "flow_save",
          elements: [
            {
              type: "submit",
              name: "save_submit",
              actions: {
                "lib_Actions_C8Oforms.forms_notify_response_simple_by_mail_simple": {
                  enabled: true,
                  fullsync: false,
                  vars: {
                    forms_config: { str: "{\"form_id\":\"1780214945733\",\"source_id\":1780217000000,\"source_owner\":\"user@example.com\"}", html: false },
                    forms_mail_summary: { str: "$$START1780215220834{\"c8otype\":\"path\",\"c8opath\":\"\",\"c8oPrettyPath\":null,\"c8obuiltin\":null,\"fakeId\":\"fakeId1780217042000\",\"c8oName\":null}END1780215220834$$", html: false }
                  }
                }
              }
            },
            {
              type: "submit",
              name: "save_to_baserow",
              actions: {
                "lib_BaseRow.forms_AddRowFromData": {
                  enabled: true,
                  fullsync: false,
                  vars: {
                    forms_config: { str: "{\"table_id\":\"Mini CRM~>Lightweight CRM~>Companies\",\"table_id_int\":123,\"form_id\":\"1780214945733\",\"source_id\":1780217000001,\"source_owner\":\"user@example.com\",\"link_row_table_id\":[]}", html: false },
                    forms_id: { str: "$$START1780214945653{\"c8otype\":\"path\",\"c8opath\":\"companies_grid.id.value\",\"c8oPrettyPath\":\"\",\"c8obuiltin\":\"false\",\"fakeId\":\"fakeId1780217042001\",\"c8oName\":null}END1780214945653$$", html: false },
                    forms_createColumn: { str: "false", html: false },
                    forms_freeVars: { str: "{\"Name\":\"$$START1780215220834{\\\"c8otype\\\":\\\"path\\\",\\\"c8opath\\\":\\\"\\\",\\\"c8oPrettyPath\\\":null,\\\"c8obuiltin\\\":null,\\\"fakeId\\\":\\\"fakeId1780217042002\\\",\\\"c8oName\\\":null}END1780215220834$$\"}", html: false }
                  }
                }
              }
            }
          ]
        }
      }
    };
  }

  function detailedAuthoringContract(types) {
    return {
      format: "reduced-authoring-json",
      intent: "Generate this reduced JSON. The MCP tool compiles it to full C8Oforms JSON, validates it, and persists through C8Oforms APIs.",
      contractVersion: "2026-09-14.visible-labels-v8",
      contextualDefaults: contextualDefaultsContract(),
      creationLifecycle: {
        baserow: "Supply the real discovered table path/id, columns, filters and action variables; omit form_id/source_id/source_owner. nocode-form-create compiles, saves, reads the assigned id, binds identities, saves again and verifies. Only form/source identity fields are managed: table selection, data mappings, ACLs and business data are not changed.",
        compile: "bindingFinalization.status=pending_creation and baserow_identity_pending_creation are expected, nonblocking before create. Do not stop or fabricate ids.",
        complete: "saved=true and bindingFinalization.status=ready mean saved identities were verified, not that the business flow was executed or Baserow permissions tested.",
        recovery: "If saved=true with status=partial and bindingFinalization.status=pending, the form already exists. Follow bindingFinalization.recovery: nocode-form-edit with [{action:'finalize_baserow_bindings'}] on the returned id. Do not call create again. This idempotent operation is restricted to the authenticated creator and does not change a different source owner's account."
      },
      editingLifecycle: {
        baserow: "New or changed bindings receive the existing form id and actual component id in the edit save. New bindings use the authenticated caller; existing binding owners are preserved. Unchanged legacy bindings are not rewritten.",
        concurrency: "Existing-form writes are conditional on the revision read. A conflict requires a fresh read and reconsideration of the edit, never a blind retry or a new create. This requires C8Oforms APIV2_updateFormulaireDocument with form_write_guard.js support.",
        navigation: "add_page inherits the adjacent page navigation unless navigationMode is explicit. custom disables automatic tabs and buttons; author entry/return flows."
      },
      bindingValidation: "Before saving new or changed own-account connections, the tool reads the selected table's columns. Source columns and explicit mappings must use real names; forms_AddRow needs at least one input technical name matching a column. Use forms_AddRowFromData otherwise. Compile alone cannot prove catalog access, runtime SmartSource values or successful business writes. Existing other-owner connections retain their owner and report column verification pending.",
      forbiddenFields: ["_id", "_rev", "_c8oMeta", "creator", "~c8oAcl", "c8oGrp", "formulaire", "pageTechName", "creationDate", "lastMofification", "__importAttachments"],
      rootFields: {
        name: { type: "string", required: true, description: "Visible form name." },
        description: { type: "string", html: true, mapsTo: "descform" },
        language: { type: "string", default: "en", mapsTo: "lang" },
        backgroundColor: { type: "string", optional: true, example: "rgba(32,38,70,0.06)", mapsTo: "wallpaper.type=color" },
        thumbnailColor: { type: "string", optional: true, example: "#2f6fed", mapsTo: "thumbnail.type=color" },
        thumbnailImage: { type: "object", optional: true, fields: { contentType: "image/png | image/jpeg | image/webp", base64: "standard or URL-safe base64 image payload, without requiring a data: URL prefix" }, maxDimensions: "smaller than 512x512 px", mapsTo: "thumbnail.type=custom plus attachment named thumbnail" },
        tag: { oneOf: ["string", "string[]"], optional: true },
        subTag: { oneOf: ["string", "string[]"], optional: true },
        appLike: { type: "boolean", optional: true, description: "When true, pages default to persisted tab navigation." },
        navigationMode: { type: "string", enum: ["tabs", "buttons", "custom"], default: "Legacy fallback: tabs for multi-page forms, buttons for single-page forms. Explicitly choose custom for an application with home/action buttons." },
        config: { type: "object", optional: true, description: "Advanced root responsive sizing. Omit unless needed." },
        pages: { type: "array", required: true },
        flows: { type: "array", optional: true, description: "Only include when a button, automation, formula, or submit behavior needs it." }
      },
      mediaSupport: {
        supported: {
          backgroundColor: "Creates a color wallpaper.",
          thumbnailColor: "Creates a color application/form thumbnail.",
          thumbnailImage: "Creates a custom thumbnail by uploading a base64 image smaller than 512x512 px as the C8Oforms attachment named thumbnail through APIV2_updateFormulaireDocument."
        },
        notYetSupportedInReducedInput: [
          "thumbnailUrl: C8Oforms does not render URL thumbnails from form JSON. Generate or fetch the image client-side and pass thumbnailImage.base64 instead.",
          "custom wallpaper binary/base64 uploads",
          "external image-search prompts"
        ]
      },
      generationQuality: {
        labels: {
          rule: "Every visible question needs a domain-appropriate label or rich description. name is technical and defaultFrom supplies the answer, not the question. Resolve prototype_question_label warnings before delivery.",
          mapping: "label populates the plain label and escaped HTML for HTML-backed questions. description supplies rich question HTML, not separate help text. Explicit config.label/config.html and config.personalized take precedence. Unrelated edits preserve existing rich content."
        },
        navigation: {
          custom: "Disables automatic tabs and page buttons. Create native button fields linked to named flows containing push_page. Every page needs a reachable entry and a return path.",
          targetPage: "Use the unique page name in reduced flow targetPage; compilation resolves it to the generated pageTechName. Saved documents use pageTechName. Special targets: __c8o_back, __c8o_next, __c8o_previous.",
          example: { button: { type: "button", name: "open_requests", label: "My requests", icon: "list", flow: "open_requests" }, flow: { id: "open_requests", name: "Open my requests", elements: [{ type: "push_page", targetPage: "My requests" }] } }
        },
        styles: {
          rule: "Native spacing and grouping are a required design pass for generated applications, not an optional decoration. Assign every visible block a spacing role and write its actual style objects or deliberate parent-provided spacing. Use HTML for content, not duplicate container padding. Never overwrite styles on an existing component unless requested.",
          scopes: { boxStyle: "Outer component container: margin separates components, padding separates content from its border.", questionBoxStyle: "Question/header only, when that component has one.", componentBoxStyle: "Inner control only, when supported.", layoutChildrenStyle: "Child containers by default/first/last scope; not the layout container itself." },
          values: "CSS strings: lengths include units (px, rem, %, etc.) except 0. Margin/padding accept 1-4 values. Empty strings preserve Forms defaults. Explicit config overrides shorthand. Individual border properties can override border shorthand: avoid conflicting settings.",
          spacingScale: { close: "8px", normal: "16px", section: "24px", major: "32px" },
          cardExample: { boxStyle: { margin: "0 0 24px 0", padding: "16px", border: "1px solid #E2E8F0", borderRadius: "12px", backgroundColor: "#FFFFFF" } },
          recipes: {
            usage: "Copy/adapt these literal native objects; recipe names are documentation, not extra reduced JSON properties. Keep the user's existing theme and responsive root gutters. Zero or inherited spacing is intentional when it avoids double spacing.",
            welcome: { boxStyle: { margin: "0 0 24px 0", padding: "24px", border: "1px solid #E2E8F0", borderRadius: "12px" } },
            section: { boxStyle: { margin: "0 0 24px 0", padding: "16px", border: "1px solid #E2E8F0", borderRadius: "12px" } },
            fieldInsideSection: { boxStyle: { margin: "0 0 8px 0", padding: "0", border: "0", backgroundColor: "transparent" } },
            dataView: { boxStyle: { margin: "0 0 24px 0", padding: "16px", border: "1px solid #E2E8F0", borderRadius: "12px" } },
            actionGroup: { boxStyle: { margin: "16px 0 24px 0", padding: "0", border: "0", backgroundColor: "transparent" } },
            standaloneButton: { boxStyle: { margin: "8px 0 16px 0", padding: "0", border: "0", backgroundColor: "transparent" } },
            buttonInsideGroup: { boxStyle: { margin: "0", padding: "4px", border: "0", backgroundColor: "transparent" } }
          },
          nesting: "One surface per logical group. Use boxStyle for outer margin/padding, questionBoxStyle only for the header and componentBoxStyle only for the inner control. Child boxStyle can override layoutChildrenStyle: do not double-pad or combine conflicting shorthand and per-side values. Preserve native input affordances.",
          review: "Review all visible blocks, including inputs, grids and action groups, not only the welcome card. Use a consistent spacing scale (for example 8/16/24px), verify mobile overflow and desktop density. Empty spacing alone is not an error.",
          actionGroups: "Put related buttons in a native layout: two columns on desktop/tablet, one on phones. Keep group spacing on the layout and avoid a separate full-width card per button. Do not group unrelated actions automatically.",
          buttonSurfaces: "Standalone buttons and action-only layouts use explicit boxStyle.backgroundColor=transparent and border=0 by default, not a white full-width card. Empty or omitted values may keep the white Forms default. Check parent layout and layoutChildrenStyle surfaces too. This is the wrapper only: preserve the clickable button's own backgroundColor/config.backgroundColor and readable text. Keep a surrounding content card only when semantically intended or requested.",
          acceptance: ["Check every page: introduction, section groups, inputs, data views and action groups, including nested children.", "Verify margin/padding/borders survived saved-form readback. Color/radius alone is not spacing; defaults or parent-provided spacing must be deliberate.", "Resolve partial_page_styling and ungrouped_adjacent_buttons warnings by reviewing the actual design, not by applying one card style everywhere.", "When browser access is authorized, check desktop/mobile gaps, field widths, button wrapping and overflow. Otherwise report visual verification pending."]
        },
        data: {
          local: "sourceEnabled=false is transient UI state, never a substitute for business storage. Use local row actions only for an explicitly temporary interaction; never deliver fictitious-row buttons as an application feature.",
          connected: "Deliver an operational application. For Baserow, discover the authorized workspace/base, plan and create the dedicated schema required by the application, then bind save actions and result views to those tables. Ask for an unresolved destination or access; do not fall back to a local demonstration. Do not seed invented records unless explicitly requested.",
          unsupported: "Do not put rows/sampleRows/data directly on a reduced grid: Forms does not initialize local grid rows from those properties. Do not use a self source as a pretend grid backend.",
          tracking: "A tracking page must contain a real source-backed grid/cards view, not explanatory HTML or a local demonstration. Show an empty state until real records exist. Filter private data server-side; a UI filter is not access control."
        },
        completion: ["Read the saved form and validate it after create/edit.", "Check every requested capability against actual components/actions; report unsupported or unconnected functionality explicitly.", "Test navigation, required fields, success/failure feedback and record persistence after reload using an authorized test record. Do not claim visual/runtime checks without a browser capability.", "New compile/create rejects incomplete toasts, empty button flows and unconfigured submit/source grids. Full-document validation reports these as warnings so existing drafts can still be edited; structural reference errors always block."]
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
        description: { type: "string", html: true, optional: true, mapsTo: "config.html", description: "Rich question/content text, not secondary help text. Takes precedence over label for HTML display; explicit config.html takes precedence over both." },
        label: { type: "string", optional: true, description: "Visible plain-text question/button label. For HTML-backed questions, also replaces the prototype HTML with escaped text. Explicit description/config.html are preserved. Card labels target config.title." },
        placeholder: { type: "string", optional: true },
        defaultFrom: { type: "object", optional: true, description: "Context-derived value. See contextualDefaults for sources, initial/reactive modes and availability. Supported on text, slider, datetime, time and barcode; use native choice defaults for choices." },
        mandatory: { type: "boolean", optional: true },
        disabled: { type: "boolean", optional: true },
        componentDisabled: { type: "boolean", optional: true, mapsTo: "config.componentDisabled", description: "Disables the component as if it did not exist in the viewer." },
        disabledIf: { type: "object", optional: true, mapsTo: "conditions.buttonStateIf", description: "Button-only shorthand: disables the button when the condition group evaluates to true." },
        short: { type: "boolean", optional: true },
        boxStyle: { type: "object", optional: true, mapsTo: "config.boxStyle", description: "Container style overrides. Empty values keep the C8Oforms defaults." },
        questionBoxStyle: { type: "object", optional: true, mapsTo: "config.questionBoxStyle", description: "Question/header part style overrides when the component exposes a question part." },
        componentBoxStyle: { type: "object", optional: true, mapsTo: "config.componentBoxStyle", description: "Inner component part style overrides when available." },
        layoutChildrenStyle: { type: "object", optional: true, mapsTo: "config.layoutChildrenStyle", description: "Layout/group child style overrides by scope: default, first, last." },
        conditions: { type: "object", optional: true, description: "C8Oforms condition groups: visibleIf, goToPageIf, and buttonStateIf." },
        config: { type: "object", optional: true, description: "Merged onto the component config for advanced supported properties." },
        sources: { type: "object", optional: true, description: "Advanced C8Oforms source configuration; prefer contract/actions from GetSequences before using." },
        actions: { type: "object", optional: true, description: "Advanced C8Oforms action configuration; prefer flows for ordinary buttons." },
        flow: { type: "string", optional: true, description: "For button fields, references a flows[].id." }
      },
      styleObjectFields: {
        margin: { type: "string", optional: true, example: "0 0 10px 0" },
        padding: { type: "string", optional: true, example: "20px 27px" },
        backgroundColor: { type: "string", optional: true, example: "#FFFFFF" },
        textColor: { type: "string", optional: true, example: "#202124" },
        textColorMode: { type: "string", optional: true, enum: ["", "auto", "custom", "none"] },
        border: { type: "string", optional: true, example: "1px solid #E5E7EB" },
        borderWidth: { type: "string", optional: true, example: "1px" },
        borderStyle: { type: "string", optional: true, example: "solid" },
        borderColor: { type: "string", optional: true, example: "#E5E7EB" },
        borderRadius: { type: "string", optional: true, example: "10px" },
        borderTop: { type: "string", optional: true },
        borderRight: { type: "string", optional: true },
        borderBottom: { type: "string", optional: true },
        borderLeft: { type: "string", optional: true },
        verticalAlign: { type: "string", optional: true, enum: ["", "start", "center", "end", "stretch"], description: "Mostly used for children inside a layout." }
      },
      conditionFields: {
        visibleIf: { type: "object", optional: true, description: "Visibility condition group." },
        goToPageIf: { type: "object", optional: true, description: "Navigation authorization condition group." },
        buttonStateIf: { type: "object", optional: true, description: "Button enabled/disabled condition group." },
        disabledIf: { type: "object", optional: true, description: "Reduced authoring alias for buttonStateIf with __uiMode=button_state_disabled_when_condition." }
      },
      dynamicReferences: dynamicReferenceContract(),
      componentAuthoring: {
        layout: {
          fields: ["name", "cols", "tablet", "phoneL", "phoneP", "children"],
          description: "Responsive row/container. children are nested fields; compiler creates childrenRefs and parentRef.",
          colsExample: [{ size: 3 }, { size: 3 }, { size: 6 }, { size: 0 }, { size: 0 }, { size: 0 }],
          actionGroupExample: { type: "layout", name: "request_actions", cols: [{ size: 6 }, { size: 6 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }], tablet: [{ size: 6 }, { size: 6 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }], phoneL: [{ size: 12 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }], phoneP: [{ size: 12 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }], boxStyle: { margin: "0 0 16px 0", padding: "0" }, children: [{ type: "button", name: "open_requests", label: "My requests", flow: "open_requests" }, { type: "button", name: "return_home", label: "Home", flow: "return_home" }] }
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
      backendActions: backendActionContract(),
      flowAuthoring: {
        rule: "Use flows only when referenced by a button, when formulas/business logic are needed, or when a submit step must execute backend actions.",
        formulas: "Put business_logic elements in the flow with id formulas.",
        buttonFlow: "A button field sets flow to the stable flow id. Set a meaningful visible flow.name in the user's language; do not confuse it with the id. Missing names fall back to the unique triggering button label or a humanized id. Explicit names also apply to the built-in formulas/submit flows.",
        backendActions: "Attach backend sequence actions to submit elements through submit.actions; see authoringContract.backendActions.",
        toast: "message is translated into sources.self.vars.selfVar.str (text, html=false). Explicit sources take precedence. position, duration (seconds), color and closeBtn map into config.",
        gridActions: "targetGrid accepts a unique grid field name in reduced JSON, resolved to the component id. add_row_to_local_grid accepts row as a literal JSON object or an explicit object-valued SmartSource. Local insertions are not persistent saves.",
        elementTypes: ["business_logic", "toast", "submit", "if_else", "for_loop", "push_page", "push_app", "add_row_to_local_grid", "remove_row_from_local_grid", "refresh_grid"],
        examples: [
          { id: "open_requests", name: "Open my requests", elements: [{ type: "push_page", targetPage: "My requests" }] },
          { id: "refresh_requests", name: "Refresh requests", elements: [{ type: "refresh_grid", targetGrid: "requests" }] },
          { id: "formulas", name: "Computed values", elements: [{ name: "full_name", type: "business_logic", expression: "fields.first_name + ' ' + fields.last_name" }] }
        ]
      },
      editTool: {
        tool: "nocode-form-edit",
        whenToUse: "Use for incremental changes to an existing form: add/update/delete/move pages, components, flows, or flow elements. Prefer this over nocode-form-update for structural edits.",
        persistence: "The tool fetches through C8Oforms.APIV2_getDocument and saves through C8Oforms.APIV2_updateFormulaireDocument. Never write FullSync directly.",
        requiredInputs: ["id", "operations", "token"],
        operationsShape: "Pass operations as an array for multiple edits or as one operation object for a single edit.",
        commonOperations: [
          { action: "finalize_baserow_bindings", note: "Only operation in the call. Resume an already saved creation by returned id; do not manually patch identity fields or recreate the form." },
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
      thumbnail: reduced.thumbnailImage ? { enabled: true, index: 0, type: "custom" } : (reduced.thumbnailColor ? { enabled: true, index: 0, type: "color", color: String(reduced.thumbnailColor) } : { enabled: false, index: null, random: random }),
      config: clone(reduced.config, defaultRootConfig()) || defaultRootConfig(),
      pages: [],
      formulaire: [],
      flows: [{ id: "formulas", elements: [] }, { id: "submit", elements: [] }],
      actions: []
    };
  }

  function labelToHtml(value) {
    // SmartSource envelopes are parsed by Forms; keep their JSON intact while
    // escaping literal text, including markup-looking user labels.
    return String(value).split(/(\$\$START\d+\{[\s\S]*?\}END\d+\$\$)/g).map(function (part, index) {
      return index % 2 ? part : part.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }).join("");
  }

  function applyFieldLabel(target, field) {
    var explicit = field.config || {};
    var config = target.config || (target.config = {});
    var plainKey = "label";
    if (target.type === "ion-card") {
      explicit = explicit.title || {};
      config = config.title || (config.title = {});
      plainKey = "text";
    }
    var hasLabel = explicit[plainKey] != null || field.label != null;
    var label = explicit[plainKey] != null ? explicit[plainKey] : field.label;
    var hasRichText = explicit.html != null || (target.type !== "ion-card" && field.description != null);
    if (hasLabel) { config[plainKey] = String(label); }
    if (hasRichText) {
      config.html = String(explicit.html != null ? explicit.html : field.description);
      if (!hasOwn(explicit, "personalized")) { config.personalized = true; }
      if (!hasLabel && field.description != null) { config[plainKey] = String(field.description).replace(/<[^>]*>/g, ""); }
    } else if (hasLabel && (hasOwn(config, "html") || hasOwn(config, "personalized") || target.type === "description")) {
      config.html = labelToHtml(label);
      // Keep the HTML question renderer (also used for disabled inputs).
      // An explicit plain/rich mode remains authoritative.
      if (!hasOwn(explicit, "personalized")) { config.personalized = true; }
    }
  }

  function applyCommonFieldConfig(target, field, pageTechName) {
    target.config = target.config && typeof target.config === "object" ? target.config : {};
    target.config.page = pageTechName;
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
    copyConfigValues(target, field, [
      "componentDisabled",
      "boxStyle",
      "questionBoxStyle",
      "componentBoxStyle",
      "layoutChildrenStyle"
    ]);
    if (field.mandatory != null && target.config.mandatory != null) {
      target.config.mandatory = field.mandatory === true || String(field.mandatory) === "true";
    }
    if (field.disabled != null && target.config.disabled != null) {
      target.config.disabled = field.disabled === true || String(field.disabled) === "true";
    }
    if (field.componentDisabled != null) {
      target.config.componentDisabled = field.componentDisabled === true || String(field.componentDisabled) === "true";
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
    applyFieldLabel(target, field);
    if (field.conditions && typeof field.conditions === "object" && !Array.isArray(field.conditions)) {
      target.conditions = clone(field.conditions, {});
    }
    if (field.visibleIf != null || field.goToPageIf != null || field.buttonStateIf != null || field.disabledIf != null) {
      target.conditions = target.conditions && typeof target.conditions === "object" && !Array.isArray(target.conditions) ? target.conditions : {};
      if (field.visibleIf != null) {
        target.conditions.visibleIf = clone(field.visibleIf, field.visibleIf);
      }
      if (field.goToPageIf != null) {
        target.conditions.goToPageIf = clone(field.goToPageIf, field.goToPageIf);
      }
      if (field.buttonStateIf != null) {
        target.conditions.buttonStateIf = clone(field.buttonStateIf, field.buttonStateIf);
      }
      if (field.disabledIf != null) {
        var disabledIf = clone(field.disabledIf, field.disabledIf);
        if (disabledIf && typeof disabledIf === "object" && !Array.isArray(disabledIf)) {
          disabledIf.__uiMode = "button_state_disabled_when_condition";
        }
        target.conditions.buttonStateIf = disabledIf;
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

  function ensureButtonFlows(doc) {
    if (doc == null) {
      return;
    }
    doc.flows = ensureArray(doc.flows);
    var known = {};
    for (var i = 0; i < doc.flows.length; i++) {
      if (doc.flows[i] && doc.flows[i].id != null) {
        known[String(doc.flows[i].id)] = true;
      }
    }
    var fields = ensureArray(doc.formulaire);
    for (var f = 0; f < fields.length; f++) {
      var field = fields[f];
      if (field == null || field.type !== "button") {
        continue;
      }
      var flowId = trimmed(field.flow);
      if (!flowId.length) {
        flowId = "flow_" + (field.id != null ? field.id : nextId());
        field.flow = flowId;
      }
      if (!known[flowId]) {
        doc.flows.push({ id: flowId, name: "Flow " + (trimmed(field.name) || flowId), elements: [] });
        known[flowId] = true;
      }
    }
  }

  function flowDisplayName(flow, fields) {
    if (trimmed(flow.name)) { return trimmed(flow.name); }
    var buttons = ensureArray(fields).filter(function (field) { return field && field.type === "button" && String(field.flow) === String(flow.id); });
    var label = buttons.length === 1 && buttons[0].config && buttons[0].config.label;
    if (typeof label === "string" && label.indexOf("$$START") < 0 && trimmed(label.replace(/<[^>]*>/g, ""))) {
      return trimmed(label.replace(/<[^>]*>/g, ""));
    }
    var name = trimmed(flow.id).replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
    return name.charAt(0).toUpperCase() + name.substring(1);
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
    copyObjectValues(out, element, ["sources", "actions", "children", "childrenRefs", "childrenRefsElse", "parentRef", "vars"]);
    copyConfigValues(out, element, ["condition", "operator", "message", "target", "page", "flow", "delay", "loopSource", "itemName"]);
    copyConfigValues(out, element, ["targetPage", "targetGrid", "position", "duration", "color", "closeBtn"]);
    if (type === "toast") {
      // The viewer reads selfVar, not message/config.message. Explicit sources win.
      if (!hasOwn(element, "sources")) {
        var message = hasOwn(element, "message") ? element.message : (hasOwn(element, "text") ? element.text : element.config && element.config.message);
        out.sources = { self: { enabled: true, vars: { selfVar: { str: message == null ? "" : String(message), type: "text", html: false } } } };
      }
      delete out.message;
      if (out.config) { delete out.config.message; }
    }
    if (type === "push_page" && !hasOwn(element, "targetPage") && !(element.config && hasOwn(element.config, "targetPage"))) {
      out.config.targetPage = element.target || element.page || "";
    }
    if (type === "add_row_to_local_grid" && hasOwn(element, "row") && !hasOwn(element, "sources")) {
      // A literal JSON object is evaluated by the existing Forms expression engine.
      out.sources = { self: { enabled: true, vars: { selfVar: { str: "(" + JSON.stringify(element.row) + ")", type: "ts", html: false } } } };
    }
    return out;
  }

  function resolveAuthoringReferences(doc) {
    function resolve(value, collection, idKey) {
      var text = trimmed(value);
      var matches = collection.filter(function (item) { return String(item[idKey]) === text; });
      if (!matches.length) { matches = collection.filter(function (item) { return item.name === text; }); }
      // Keep invalid/ambiguous references visible to validation rather than guessing.
      return matches.length === 1 ? matches[0][idKey] : value;
    }
    var grids = doc.formulaire.filter(function (item) { return item.type === "grid"; });
    doc.flows.forEach(function (flow) {
      ensureArray(flow.elements).forEach(function (element) {
        var config = element.config || {};
        if (element.type === "push_page") { config.targetPage = resolve(config.targetPage, doc.pages, "pageTechName"); }
        if (["add_row_to_local_grid", "remove_row_from_local_grid", "refresh_grid"].indexOf(element.type) >= 0) {
          config.targetGrid = resolve(config.targetGrid, grids, "id");
        }
      });
    });
  }

  function baserowBindings(form, includeDisabled) {
    var bindings = [];
    function visit(item, path) {
      if (!item || typeof item !== "object") { return; }
      ["sources", "sourcesMarkers", "sourcesCircles", "sourcesPolygons", "actions"].forEach(function (group) {
        Object.keys(item[group] || {}).forEach(function (key) {
          var entry = item[group][key];
          if (!/^lib_BaseRow\.(formssource_|forms_)/.test(key) || !entry || (!includeDisabled && !boolLike(entry.enabled))) { return; }
          var variable = entry.vars && entry.vars.forms_config;
          var config;
          try { config = JSON.parse(variable && variable.str); } catch (_invalidConfig) { config = null; }
          bindings.push({ item: item, entry: entry, key: String(item.id) + "/" + group + "/" + key, variable: variable, config: config && typeof config === "object" && !Array.isArray(config) ? config : null, path: path + "/" + group + "/" + key });
        });
      });
      ensureArray(item.children).forEach(function (child, index) { visit(child, path + "/children/" + index); });
    }
    ensureArray(form.formulaire).forEach(function (item, index) { visit(item, "/formulaire/" + index); });
    ensureArray(form.flows).forEach(function (flow, index) {
      ensureArray(flow && flow.elements).forEach(function (item, ei) { visit(item, "/flows/" + index + "/elements/" + ei); });
    });
    return bindings;
  }

  function prepareNewBaserowBindings(form) {
    var bindings = baserowBindings(form);
    bindings.forEach(function (binding) {
      if (!binding.config) { return; }
      // These identities belong to the new document, never to a model-supplied
      // example or to the output of a previous compile call.
      binding.config.source_id = binding.item.id;
      delete binding.config.form_id;
      delete binding.config.source_owner;
      binding.variable.str = JSON.stringify(binding.config);
    });
    return bindings.length;
  }

  function prepareEditedBaserowBindings(current, edited, user) {
    var previous = {};
    baserowBindings(current, true).forEach(function (binding) { previous[binding.key] = binding; });
    var paths = [];
    baserowBindings(edited).forEach(function (binding) {
      var old = previous[binding.key];
      if (old && JSON.stringify(old.entry) === JSON.stringify(binding.entry)) { return; }
      paths.push(binding.path);
      if (!binding.config) { return; } // Validation will reject the touched binding.
      var owner = old && old.config && trimmed(old.config.source_owner);
      if (old && !owner && trimmed(current.creator) !== user) {
        throw new Error("The creator must repair this existing Baserow connection before another user can edit it");
      }
      binding.config.form_id = String(current._id);
      binding.config.source_id = binding.item.id;
      binding.config.source_owner = owner || user;
      binding.variable.str = JSON.stringify(binding.config);
    });
    return paths;
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
    if (type === "grid" && (hasOwn(field, "rows") || hasOwn(field, "sampleRows") || hasOwn(field, "data"))) {
      throw new Error("Unsupported grid seed property: bind business data to a real source; rows/sampleRows/data would not be rendered. Local row actions are only for transient UI state");
    }
    var out = clone(proto, {});
    out.type = type;
    out.id = field.id != null ? field.id : nextId();
    out.name = trimmed(field.name) || (type + out.id);
    if (parentId != null) {
      out.parentRef = parentId;
    }
    applyCommonFieldConfig(out, field, pageTechName);
    if (type === "button") {
      out.config.boxStyle = out.config.boxStyle || {};
      // Only new buttons receive these defaults; explicit custom surfaces win.
      if (!trimmed(out.config.boxStyle.backgroundColor)) { out.config.boxStyle.backgroundColor = "transparent"; }
      if (!trimmed(out.config.boxStyle.border)) { out.config.boxStyle.border = "0"; }
    }
    if (type === "button" && !trimmed(field.flow).length) {
      out.flow = "flow_" + out.id;
    }
    if (type === "layout") {
      out.childrenRefs = [];
      ["cols", "tablet", "phoneL", "phoneP"].forEach(function (key) {
        if (hasOwn(field, key) && !(field.config && hasOwn(field.config, key))) { out.config[key] = field[key]; }
      });
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
    applyContextDefault(out, field);
    formulaire.push(out);
    return out;
  }

  function contextualDefaultsContract() {
    return {
      rule: "Before asking for a value, check whether the runtime context can supply it reliably and appropriately. Do not infer an identity binding from a field label alone. Never embed the app author's identity as an end-user default.",
      fieldExample: { type: "text", name: "requester_email", label: "Email address", defaultFrom: { source: "user", property: "email", fallback: "" } },
      shape: { source: "user | clock | field | query | expression | literal", mode: "initial (default) | reactive", fallback: "Optional JSON value used for null/undefined only; false, 0 and empty string are preserved." },
      sources: {
        user: { property: ["name", "email", "authenticatedUserID", "groups", "authenticated"], example: { source: "user", property: "email", fallback: "" }, availability: "Authenticated runtime respondent, not the MCP caller. name is the display name; separate first/last names are not exposed. Do not split it or guess from email. Profile values may be missing." },
        clock: { property: ["today", "now"], example: { source: "clock", property: "today" }, availability: "Browser clock at evaluation. today is a local YYYY-MM-DD date; now is an ISO instant. Neither is an authoritative server audit timestamp." },
        field: { example: { source: "field", field: "selected_request", path: ["Reference", "value"], fallback: "" }, availability: "Existing unique component technical name. Reads its runtime value through fields; optional path is an array of literal keys/indexes, not JS. Inspect actual grid cell shape. Selection/data must already be available for initial mode. Formula results use actions in an expression." },
        query: { example: { source: "query", parameter: "request_ref", fallback: "" }, availability: "Explicit navigation query parameter, a string or null. Untrusted input, never proof of identity or permission. No query values are fetched during compilation." },
        expression: { example: { source: "expression", expression: "fields.quantity * fields.unit_price", mode: "reactive" }, availability: "Existing Forms TS expression context: fields, actions, api. Use verified sources and correct return types, not guessed globals. Expressions must be side-effect free. Dynamic/computed references and backend availability cannot be proven by compilation." },
        literal: { example: { source: "literal", value: 0 }, availability: "Explicit business default, including false or 0; not fabricated personal information or business records." }
      },
      modes: {
        initial: "Applies at source initialization only; preserves response edits, same-field URL values and an already entered value. Later dependency changes do not reapply it. If prerequisite data is unavailable, use a fallback and manual input; do not promise late auto-fill.",
        reactive: "Explicit derived value: recomputes when Forms observes field/SmartSource dependencies. Use for calculations, usually with a disabled control, not editable identity defaults. Clock and user context are not polling subscriptions."
      },
      native: "defaultFrom compiles into sources.self.vars.selfVar (type=ts, html=false) and config.contextValueMode. Requires a Forms viewer supporting contextValueMode; deploy Forms and MCP together. Existing native sources and drafts without this mode keep their behavior. Conflicting explicit sources/defaults are rejected, not overwritten.",
      otherComponents: "For select/radio/checkbox and groups, use existing sources.self default expressions/config.defaultValuesMode with the actual choice values. External choice options and selected defaults are distinct. Grids/data views use real source connections, never scalar defaultFrom. Location needs user permission; files/signatures must not be fabricated.",
      review: ["For each field choose user input, initial context value, reactive calculation or backend-managed value.", "Preserve existing answers and intentional defaults, including empty strings, false and 0.", "Check auth/profile absence, required fields, record switching, source readiness and expression result type.", "Keep identity/ownership/access checks server-side. Do not populate identifying fields in anonymous/anonymized journeys without explicit intent."]
    };
  }

  function applyContextDefault(target, field) {
    if (!hasOwn(field, "defaultFrom")) { return; }
    var spec = field.defaultFrom;
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) { throw new Error("defaultFrom must be an object"); }
    if (["text", "slider", "datetime", "time", "barcode"].indexOf(target.type) < 0) { throw new Error("defaultFrom is not supported on " + target.type + "; use the component's native default/source contract"); }
    if (hasOwn(field, "sources") || hasOwn(field, "defaultValue") || (field.config && ["defaultValue", "defaultvalue", "defaultValueJs", "defaultValuesJs", "contextValueMode"].some(function (key) { return hasOwn(field.config, key); }))) {
      throw new Error("defaultFrom conflicts with an explicit source/default; choose one rather than overwriting it");
    }
    var mode = spec.mode == null ? "initial" : spec.mode;
    if (["initial", "reactive"].indexOf(mode) < 0) { throw new Error("defaultFrom.mode must be initial or reactive"); }
    var expression;
    var allowed = ["source", "mode", "fallback"];
    if (spec.source === "user") {
      allowed.push("property");
      if (["name", "email", "authenticatedUserID", "groups", "authenticated"].indexOf(spec.property) < 0) { throw new Error("Unknown runtime user property in defaultFrom"); }
      expression = spec.property === "authenticated" ? "!!(api.user && api.user.authenticated)" : "(api.user && api.user.authenticated === true ? api.user[" + JSON.stringify(spec.property) + "] : undefined)";
    } else if (spec.source === "clock") {
      allowed.push("property");
      if (["today", "now"].indexOf(spec.property) < 0) { throw new Error("defaultFrom clock property must be today or now"); }
      expression = spec.property === "now" ? "new Date().toISOString()" : '(function () { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); })()';
    } else if (spec.source === "field") {
      allowed.push("field", "path");
      if (typeof spec.field !== "string" || !trimmed(spec.field)) { throw new Error("defaultFrom.field must be a technical name"); }
      var keys = spec.path == null ? [] : spec.path;
      if (!Array.isArray(keys) || keys.some(function (key) { return (typeof key !== "string" && !(typeof key === "number" && isFinite(key) && key >= 0 && Math.floor(key) === key)) || ["__proto__", "constructor", "prototype"].indexOf(String(key)) >= 0; })) { throw new Error("defaultFrom.path must contain literal property names or nonnegative indexes"); }
      expression = "fields[" + JSON.stringify(spec.field) + "]";
      if (keys.length) { expression = "(function (v) { var keys = " + JSON.stringify(keys) + "; for (var i = 0; i < keys.length; i++) { if (v == null) { return undefined; } v = v[keys[i]]; } return v; })(" + expression + ")"; }
    } else if (spec.source === "query") {
      allowed.push("parameter");
      if (typeof spec.parameter !== "string" || !trimmed(spec.parameter)) { throw new Error("defaultFrom.parameter must be a query parameter name"); }
      expression = "(page.local.urlParams ? page.local.urlParams.get(" + JSON.stringify(spec.parameter) + ") : undefined)";
    } else if (spec.source === "expression") {
      allowed.push("expression");
      if (typeof spec.expression !== "string" || !trimmed(spec.expression)) { throw new Error("defaultFrom.expression must be a non-empty Forms expression"); }
      expression = "(" + spec.expression + "\n)";
    } else if (spec.source === "literal") {
      allowed.push("value");
      if (!hasOwn(spec, "value")) { throw new Error("defaultFrom literal requires value"); }
      expression = "(" + JSON.stringify(spec.value) + ")";
    } else { throw new Error("Unknown defaultFrom.source"); }
    Object.keys(spec).forEach(function (key) { if (allowed.indexOf(key) < 0) { throw new Error("Unknown defaultFrom property: " + key); } });
    if (hasOwn(spec, "fallback")) { expression = "(function (v) { return v == null ? " + JSON.stringify(spec.fallback) + " : v; })(" + expression + ")"; }
    target.sources = { self: { enabled: true, vars: { selfVar: { str: expression, type: "ts", html: false } } } };
    target.config.contextValueMode = mode;
    // Keep only declarative provenance, never the resolved runtime value.
    target.config.contextDefault = clone(spec, {});
    delete target.defaultFrom;
  }

  function validateContextDefaults(form, issue, warning) {
    var fields = ensureArray(form.formulaire);
    var links = Object.create(null);
    fields.forEach(function (item, index) {
      if (!item || !item.config) { return; }
      var config = item.config;
      var spec = config.contextDefault;
      var path = "/formulaire/" + index + "/config/contextDefault";
      if (!spec && config.contextValueMode == null) { return; }
      if (["initial", "reactive"].indexOf(config.contextValueMode) < 0) { issue("invalid_context_value_mode", "Context values require initial or reactive mode", path); }
      if (!spec) { return; }
      try { applyContextDefault({ type: item.type, config: {} }, { defaultFrom: spec }); }
      catch (error) { issue("invalid_context_default", String(error), path); return; }
      var source = item.sources && item.sources.self;
      if (!source || !boolLike(source.enabled) || !source.vars || !source.vars.selfVar || source.vars.selfVar.type !== "ts") { issue("missing_context_default_source", "Context default requires an enabled TS self source", path); }
      if (config.contextValueMode === "reactive" && !boolLike(config.disabled)) { warning("editable_reactive_value", "A reactive value can replace a manual edit when dependencies change; use initial for prefill or a disabled control for a calculation", path); }
      if (spec.source === "expression") { warning("context_expression_runtime_check", "Verify expression result type, dependencies, source readiness and absence of side effects at runtime; arbitrary expressions are not statically proven", path); }
      if (spec.source === "field") {
        var matches = fields.filter(function (candidate) { return candidate && candidate.name === spec.field; });
        if (matches.length !== 1) { issue("unknown_context_field", "Context field must resolve to exactly one component: " + spec.field, path + "/field"); return; }
        if (boolLike((matches[0].config || {}).componentDisabled) || ["button", "description", "layout"].indexOf(matches[0].type) >= 0) { issue("unavailable_context_field", "This component does not supply an enabled runtime input value", path + "/field"); }
        links[item.name] = spec.field;
        if (config.contextValueMode === "initial") { warning("context_default_source_readiness", "An initial default only reads the value available when this page's source initializes. Ensure the referenced field/data is ready; later changes do not refill editable input", path); }
      }
      if (boolLike(config.mandatory) && boolLike(config.disabled) && spec.source !== "literal") { warning("required_context_value_fallback", "A required disabled field can block submission if context is missing. Provide a recovery path, not fabricated identity data", path); }
      if (spec.source === "literal" && ((item.type === "slider" || (item.type === "text" && config.type === "number")) && (typeof spec.value !== "number" || !isFinite(spec.value)))) { issue("invalid_context_default_type", "A numeric control requires a numeric literal default", path + "/value"); }
      if (spec.source === "literal" && ["text", "datetime", "time", "barcode"].indexOf(item.type) >= 0 && spec.value != null && typeof spec.value === "object") { issue("invalid_context_default_type", "A scalar control cannot use an object/array literal; select a scalar path or expression", path + "/value"); }
    });
    Object.keys(links).forEach(function (name) {
      var seen = Object.create(null);
      var current = name;
      while (hasOwn(links, current)) {
        if (hasOwn(seen, current)) { issue("cyclic_context_default", "Context defaults contain a dependency cycle starting at " + name, "/formulaire"); break; }
        seen[current] = true;
        current = links[current];
      }
    });
  }

  function compileReduced(reduced, options) {
    var opts = options || {};
    var projectName = opts.project || opts.projectName || "C8Oforms";
    var contract = readAllTypes(projectName);
    var byType = indexCatalog(contract.catalog);
    var input = clone(reduced, {});
    if (hasOwn(input, "thumbnailUrl")) {
      return {
        status: "invalid",
        project: projectName,
        allTypesPath: contract.file,
        error: {
          code: "unsupported_thumbnail_url",
          message: "thumbnailUrl is not supported by the C8Oforms runtime JSON contract. Generate or fetch the image client-side and pass thumbnailImage.base64 instead."
        },
        validation: {
          valid: false,
          issueCount: 1,
          warningCount: 0,
          issues: [{
            code: "unsupported_thumbnail_url",
            message: "Use thumbnailColor, or pass thumbnailImage with contentType and base64 so the MCP tool uploads the thumbnail attachment through APIV2_updateFormulaireDocument.",
            path: "/thumbnailUrl"
          }],
          warnings: []
        }
      };
    }
    var doc = defaultDoc(input);
    var pages = ensureArray(input.pages);
    if (!pages.length) {
      pages = [{ name: "Page 1", fields: ensureArray(input.fields) }];
    }
    var useTabMode = tabModeFor(input, pages.length);
    for (var p = 0; p < pages.length; p++) {
      var page = pageDefaults(pages[p], p, useTabMode);
      if (input.navigationMode === "custom") { page.enabledTab = false; page.enabledButtons = false; }
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
        doc.flows.push(target);
      }
      if (trimmed(flowIn.name)) { target.name = trimmed(flowIn.name); }
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
    ensureButtonFlows(doc);
    doc.flows.forEach(function (flow) { flow.name = flowDisplayName(flow, doc.formulaire); });
    resolveAuthoringReferences(doc);
    var bindingCount = prepareNewBaserowBindings(doc);
    doc.chatSummary = input.chatSummary || "";
    doc.chatResponse = input.chatResponse || "";
    var validation = validateForm(doc, { project: projectName, generation: true }).validation;
    if (!doc.formulaire.length) {
      // A reduced form without a single component is never a deliverable
      // application; it usually means the reduced JSON was lost on the way.
      validation.issues.unshift({ code: "empty_form", message: "The reduced form contains no component on any page. Nothing to create: check that the complete reduced JSON (name, pages, fields) was sent.", path: "/pages" });
      validation.issueCount = validation.issues.length;
      validation.valid = false;
    }
    return {
      bindingFinalization: { status: bindingCount ? "pending_creation" : "not_required", bindingCount: bindingCount },
      status: validation.valid ? "ok" : "invalid",
      project: projectName,
      allTypesPath: contract.file,
      form: doc,
      validation: validation
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
    function warning(code, message, path) {
      warnings.push({ code: code, message: message, path: path || "" });
    }
    function incomplete(code, message, path) {
      // New generations must be usable. Existing editor drafts remain editable.
      if (opts.generation === true || ensureArray(opts.strictBindingPaths).some(function (prefix) { return path.indexOf(prefix + "/") === 0 || path === prefix; })) { issue(code, message, path); }
      else { warning(code, message, path); }
    }
    function enabledEntries(entries) {
      return Object.keys(entries || {}).filter(function (key) { return entries[key] && boolLike(entries[key].enabled); });
    }
    function validateBaserowBinding(key, entry, owner, path) {
      if (["lib_BaseRow.forms_AddRow", "lib_BaseRow.forms_AddRowFromData", "lib_BaseRow.forms_DeleteRow", "lib_BaseRow.formssource_GetTableData", "lib_BaseRow.formssource_GetSelectData"].indexOf(key) < 0) { return; }
      var payload = entry.vars && entry.vars.forms_config;
      var binding;
      try { binding = JSON.parse(payload && payload.str); } catch (e) { binding = null; }
      if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
        incomplete("invalid_baserow_config", "Baserow requires forms_config as a UI-authored JSON string object; discover the real table before binding", path + "/vars/forms_config");
        return;
      }
      if (!trimmed(binding.table_id) || !isFinite(Number(binding.table_id_int)) || Number(binding.table_id_int) <= 0 || Math.floor(Number(binding.table_id_int)) !== Number(binding.table_id_int)) {
        incomplete("missing_baserow_table", "Baserow requires the discovered table path and positive integer table_id_int, not a placeholder destination", path + "/vars/forms_config");
      }
      if (binding.source_id != null && String(binding.source_id) !== String(owner.id)) {
        incomplete("baserow_source_identity_mismatch", "source_id must match the component or submit element carrying this binding", path + "/vars/forms_config");
      }
      if (/formssource_Get(Table|Select)Data$/.test(key) && (!Array.isArray(binding.columns) || !binding.columns.length || binding.columns.some(function (column) { return typeof column !== "string" || !trimmed(column); }))) {
        incomplete("missing_baserow_columns", "A Baserow data source requires non-empty column names from the discovered table", path + "/vars/forms_config");
      }
      var rowId = entry.vars.forms_id;
      if (key === "lib_BaseRow.forms_DeleteRow" && (!rowId || !trimmed(rowId.str))) {
        incomplete("missing_baserow_row_id", "Deleting a Baserow row requires forms_id bound to the selected row id", path + "/vars/forms_id");
      }
      if (rowId && trimmed(rowId.str) && !/\$\$START/.test(rowId.str) && rowId.type !== "ts" && !/^[1-9]\d*$/.test(trimmed(rowId.str))) {
        incomplete("invalid_baserow_row_id", "forms_id must be a positive row id or a supported dynamic expression", path + "/vars/forms_id");
      }
      if (!trimmed(binding.form_id) || !trimmed(binding.source_owner) || binding.source_id == null) {
        warning(opts.generation === true ? "baserow_identity_pending_creation" : "baserow_identity_incomplete", opts.generation === true ? "Expected before creation: nocode-form-create automatically binds the saved form id, actual component ids and authenticated owner. Continue with create; do not invent identities or stop for this warning" : "Baserow identity is incomplete. For an unfinished creation, use nocode-form-edit with finalize_baserow_bindings on this saved id, not another create", path + "/vars/forms_config");
      } else if (form._id != null && String(binding.form_id) !== String(form._id)) {
        incomplete("baserow_form_identity_mismatch", "Baserow binding belongs to a different form; use the saved owning document id", path + "/vars/forms_config");
      }
      if (key === "lib_BaseRow.forms_AddRowFromData" && !(entry.vars.forms_freeVars && trimmed(entry.vars.forms_freeVars.str))) {
        incomplete("missing_baserow_values", "Explicit Baserow save requires forms_freeVars mapping actual input values to columns", path + "/vars/forms_freeVars");
      } else if (key === "lib_BaseRow.forms_AddRowFromData") {
        var mapping;
        try { mapping = JSON.parse(entry.vars.forms_freeVars.str); } catch (_invalidValues) { mapping = null; }
        if (!mapping || typeof mapping !== "object" || Array.isArray(mapping) || !Object.keys(mapping).length || Object.keys(mapping).some(function (column) { return !trimmed(column); })) {
          incomplete("invalid_baserow_values", "forms_freeVars must encode a non-empty object mapping exact Baserow column names to values or SmartSources", path + "/vars/forms_freeVars");
        }
      }
    }
    function validateStyle(style, path) {
      if (style == null) { return; }
      if (typeof style !== "object" || Array.isArray(style)) { issue("invalid_style_object", "Style must be an object of CSS string values", path); return; }
      Object.keys(style).forEach(function (property) {
        var value = style[property];
        if (typeof value !== "string") { issue("invalid_style_value", "Use CSS strings including units (for example 16px); use an empty string to keep defaults", path + "/" + property); }
        else if (/^(margin|padding)(Top|Right|Bottom|Left)?$|^border(Radius|Width)$/.test(property) && value.split(/\s+/).some(function (part) { return /^-?\d+(\.\d+)?$/.test(part) && Number(part) !== 0; })) {
          issue("missing_style_unit", "Nonzero CSS lengths require a unit, for example 16px", path + "/" + property);
        }
      });
    }
    if (!form || typeof form !== "object" || Array.isArray(form)) {
      issue("invalid_form", "Form must be a JSON object", "");
    } else {
      if (!Array.isArray(form.pages) || form.pages.length === 0) {
        issue("missing_pages", "Form must contain at least one page", "/pages");
      }
      if (form.thumbnail && typeof form.thumbnail === "object" && form.thumbnail.enabled === true) {
        if (form.thumbnail.type === "url" || hasOwn(form.thumbnail, "url")) {
          warning("legacy_thumbnail_url_ignored", "Existing C8Oforms document contains a thumbnail URL. No-code JSON edits ignore this legacy/runtime key; use thumbnailColor or thumbnailImage for thumbnail changes.", "/thumbnail");
        }
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
      var pages = ensureArray(form.pages).filter(function (page) { return page && page.included !== false; });
      if (pages.length > 1 && pages.every(function (page) { return !boolLike(page.enabledTab) && !boolLike(page.enabledButtons); })) {
        var edges = {};
        pages.forEach(function (page) { edges[page.pageTechName] = []; });
        ensureArray(form.formulaire).forEach(function (button) {
          if (!button || button.type !== "button" || !button.config || boolLike(button.config.componentDisabled)) { return; }
          var flow = ensureArray(form.flows).filter(function (flow) { return flow && flow.id === button.flow; })[0];
          ensureArray(flow && flow.elements).forEach(function (step) {
            if (!step || step.type !== "push_page") { return; }
            var target = step.config && step.config.targetPage;
            var from = String(button.config.page);
            var index = pages.map(function (page) { return page.pageTechName; }).indexOf(from);
            if (target === "__c8o_next" && pages[index + 1]) { target = pages[index + 1].pageTechName; }
            if (target === "__c8o_previous" && pages[index - 1]) { target = pages[index - 1].pageTechName; }
            if (target === "__c8o_back") { target = pages[0].pageTechName; }
            if (edges[from] && edges[target]) { edges[from].push(target); }
          });
        });
        var reached = {}, queue = [pages[0].pageTechName];
        while (queue.length) {
          var current = queue.shift();
          if (reached[current]) { continue; }
          reached[current] = true;
          queue = queue.concat(edges[current] || []);
        }
        pages.forEach(function (page) {
          if (!reached[page.pageTechName]) { warning("custom_page_unreachable", "No static button path from the first page to " + page.name + "; verify intended navigation", "/pages"); }
          if (!edges[page.pageTechName].length) { warning("custom_page_without_exit", "No static navigation button leaves " + page.name + "; add a return path unless this is an intentional terminal page", "/pages"); }
        });
      }
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
      var allFlowElementIds = {};
      ensureArray(form.flows).forEach(function (flow, idx) {
        if (!flow || typeof flow !== "object") {
          issue("invalid_flow", "Flow must be an object", "/flows/" + idx);
          return;
        }
        var id = trimmed(flow.id || flow.name);
        if (!trimmed(flow.name)) { incomplete("missing_flow_name", "Flow needs a visible name in addition to its stable id", "/flows/" + idx + "/name"); }
        if (!id.length) {
          issue("missing_flow_id", "Flow must define id or name", "/flows/" + idx);
        } else {
          if (flowIds[id]) { issue("duplicate_flow_id", "Duplicate flow id: " + id, "/flows/" + idx); }
          flowIds[id] = true;
        }
        if (!Array.isArray(flow.elements)) {
          issue("invalid_flow_elements", "Flow elements must be an array", "/flows/" + idx + "/elements");
        }
        var elementIds = {};
        ensureArray(flow.elements).forEach(function (element, eidx) {
          var path = "/flows/" + idx + "/elements/" + eidx;
          if (!element || typeof element !== "object") { issue("invalid_flow_element", "Flow element must be an object", path); return; }
          if (element.id == null || allFlowElementIds[String(element.id)] || ids[String(element.id)]) {
            issue("invalid_flow_element_id", "Flow element id must be present and unique", path + "/id");
          }
          elementIds[String(element.id)] = element;
          allFlowElementIds[String(element.id)] = true;
          if (["business_logic", "toast", "submit", "if_else", "for_loop", "push_page", "push_app", "add_row_to_local_grid", "remove_row_from_local_grid", "refresh_grid", "reset_fields"].indexOf(element.type) < 0) {
            issue("unsupported_flow_element", "Unsupported flow element: " + element.type, path + "/type");
          }
          var config = element.config || {};
          var source = element.sources && element.sources.self;
          var value = source && source.vars && source.vars.selfVar;
          if (element.type === "toast" && (!enabledEntries(element.sources).length || (source && (!value || !trimmed(value.str) || trimmed(value.str) === "toast_example")))) {
            incomplete("unconfigured_toast", "Toast must have an enabled message source without prototype placeholders", path + "/sources");
          }
          if (element.type === "submit" && !enabledEntries(element.actions).length) {
            incomplete("unconfigured_submit", "Select an actual backend action. An empty submit is not an implemented business save", path + "/actions");
          }
          enabledEntries(element.actions).forEach(function (key) {
            var action = element.actions[key];
            if (key.indexOf(".") < 1 || !action.vars || typeof action.vars !== "object") {
              issue("invalid_backend_action", "Use a qualified action name and UI-authored vars object", path + "/actions/" + key);
            }
          });
          if (element.type === "push_page" && !pageMap[String(config.targetPage)] && ["__c8o_back", "__c8o_next", "__c8o_previous"].indexOf(config.targetPage) < 0) {
            issue("unknown_navigation_target", "Navigation must target an existing, unambiguous page", path + "/config/targetPage");
          }
          if (["add_row_to_local_grid", "remove_row_from_local_grid", "refresh_grid"].indexOf(element.type) >= 0) {
            var grid = ids[String(config.targetGrid)];
            if (!grid || grid.item.type !== "grid") { issue("unknown_grid_target", "Action must target an existing grid", path + "/config/targetGrid"); }
            else if (element.type === "add_row_to_local_grid" && grid.item.config.sourceEnabled !== false) {
              incomplete("local_grid_action_on_source", "Local insertion requires sourceEnabled=false; use a backend action for persistent data", path);
            }
            if (element.type === "add_row_to_local_grid" && (!value || !trimmed(value.str))) {
              incomplete("missing_grid_row", "Local grid insertion needs an object-valued row source", path + "/sources");
            }
          }
        });
        ensureArray(flow.elements).forEach(function (element, eidx) {
          if (!element || typeof element !== "object") { return; }
          var path = "/flows/" + idx + "/elements/" + eidx;
          if (element.parentRef != null && !elementIds[String(element.parentRef)]) { issue("unknown_flow_parent", "Missing flow parent", path + "/parentRef"); }
          ["childrenRefs", "childrenRefsElse"].forEach(function (key) {
            ensureArray(element[key]).forEach(function (id) {
              if (!elementIds[String(id)] || String(elementIds[String(id)].parentRef) !== String(element.id)) { issue("invalid_flow_child", "Flow child reference must exist and point back to its parent", path + "/" + key); }
            });
          });
        });
      });
      ensureArray(form.formulaire).forEach(function (item, idx) {
        if (item && item.flow && !flowIds[String(item.flow)]) {
          issue("unknown_field_flow", "Field references unknown flow: " + item.flow, "/formulaire/" + idx + "/flow");
        }
        if (!item || typeof item !== "object") { return; }
        var path = "/formulaire/" + idx;
        var config = item.config || {};
        var displayedQuestion = config.personalized ? config.html : config.label;
        if (!boolLike(config.componentDisabled) && typeof displayedQuestion === "string" && /^exemple de question[.!?]?$/i.test(trimmed(displayedQuestion.replace(/<[^>]*>/g, "")))) {
          warning("prototype_question_label", "The visible question still contains the prototype text. Set label (plain text) or description/config.html (rich text); a technical name or defaultFrom is not a label", path + (config.personalized ? "/config/html" : "/config/label"));
        }
        if (item.type === "button" && !boolLike(config.componentDisabled)) {
          var flow = ensureArray(form.flows).filter(function (flow) { return flow && flow.id === item.flow; })[0];
          if (!flow || !ensureArray(flow.elements).length) { incomplete("empty_button_flow", "Button must have a non-empty flow", path + "/flow"); }
          if (flow && ensureArray(flow.elements).some(function (element) { return element && element.type === "submit"; }) && !boolLike(config.checkMandatoryInCurrentPage)) {
            warning("submit_without_required_check", "Submission button does not validate required fields on its page", path + "/config/checkMandatoryInCurrentPage");
          }
        }
        if (item.type === "grid") {
          if (config.sourceEnabled !== false && !enabledEntries(item.sources).length) { incomplete("grid_without_source", "Source-backed grid needs an enabled data source; use sourceEnabled=false for a local grid", path + "/sources"); }
          if (config.sourceEnabled !== false && enabledEntries(item.sources).indexOf("self") >= 0) { incomplete("invalid_grid_self_source", "Grid data needs a backend source or a local grid, not a scalar self source", path + "/sources/self"); }
          if (config.sourceEnabled === false && !ensureArray(config.columns).length) { issue("grid_without_columns", "Local grid needs columns", path + "/config/columns"); }
          if (config.sourceEnabled === false) { warning("local_grid_not_persistent", "Local grid rows disappear on reload. This cannot deliver business storage or tracking; bind a real source unless transient UI state is intended", path); }
        }
        ["boxStyle", "questionBoxStyle", "componentBoxStyle"].forEach(function (key) {
          validateStyle(config[key], path + "/config/" + key);
        });
        if (config.layoutChildrenStyle != null) {
          if (typeof config.layoutChildrenStyle !== "object" || Array.isArray(config.layoutChildrenStyle)) { issue("invalid_style_object", "layoutChildrenStyle must contain default/first/last style objects", path + "/config/layoutChildrenStyle"); }
          else { Object.keys(config.layoutChildrenStyle).forEach(function (scope) { validateStyle(config.layoutChildrenStyle[scope], path + "/config/layoutChildrenStyle/" + scope); }); }
        }
        if (item.type === "description" && /style\s*=/.test(config.html || "") && !(config.boxStyle && (config.boxStyle.margin || config.boxStyle.padding))) {
          warning("html_spacing_without_container_style", "Styled HTML has no explicit Forms container spacing; check outer margin and avoid double padding", path + "/config/boxStyle");
        }
      });
      validateContextDefaults(form, issue, warning);
      baserowBindings(form).forEach(function (binding) {
        if (!binding.config) { incomplete("invalid_baserow_config", "Baserow requires forms_config as a JSON string object", binding.path + "/vars/forms_config"); return; }
        validateBaserowBinding(binding.path.substring(binding.path.lastIndexOf("/") + 1), binding.entry, binding.item, binding.path);
      });
      ensureArray(form.pages).forEach(function (page, idx) {
        if (!page) { return; }
        var content = ensureArray(form.formulaire).filter(function (item) { return item && item.config && item.config.page === page.pageTechName; });
        if (content.length && content.every(function (item) { return item.type === "description"; })) {
          warning("text_only_page", "This page only contains text. Confirm it does not replace an expected interaction or data view", "/pages/" + idx);
        }
        var topLevel = content.filter(function (item) { return item.parentRef == null && !boolLike(item.config.componentDisabled); });
        function hasBoxStyle(item) {
          var style = item.config.boxStyle || {};
          return Object.keys(style).some(function (key) { return trimmed(style[key]).length > 0; });
        }
        function hasSpacing(style) {
          return Object.keys(style || {}).some(function (key) { return /^(margin|padding)(Top|Right|Bottom|Left)?$/.test(key) && trimmed(style[key]); });
        }
        content.forEach(function (item) {
          if (boolLike(item.config.componentDisabled)) { return; }
          var parent = item.parentRef != null && content.filter(function (other) { return String(other.id) === String(item.parentRef); })[0];
          var inherited = parent && parent.config && parent.config.layoutChildrenStyle;
          if (!hasSpacing(item.config.boxStyle) && !hasSpacing(parent && parent.config.boxStyle) && !hasSpacing(inherited && inherited.default)) {
            warning("missing_block_spacing", "Review native margin/padding on " + item.name + "; surface color alone is not spacing. Intentional defaults are allowed", "/formulaire/" + form.formulaire.indexOf(item) + "/config/boxStyle");
          }
          var childItems = ensureArray(item.childrenRefs).map(function (id) { return content.filter(function (child) { return String(child.id) === String(id); })[0]; }).filter(function (child) { return !!child; });
          var actionOnly = item.type === "button" || (item.type === "layout" && childItems.length && childItems.every(function (child) { return child.type === "button"; }));
          var background = trimmed((item.config.boxStyle || {}).backgroundColor).toLowerCase().replace(/\s/g, "");
          if (actionOnly && (!background || ["white", "#fff", "#ffffff", "rgb(255,255,255)", "rgba(255,255,255,1)"].indexOf(background) >= 0)) {
            warning("action_wrapper_surface", "Review the white/default outer surface on " + item.name + ". Action-only wrappers normally use transparent background and no border; preserve deliberate custom designs", "/formulaire/" + form.formulaire.indexOf(item) + "/config/boxStyle");
          }
        });
        if (topLevel.some(hasBoxStyle) && topLevel.some(function (item) { return !hasBoxStyle(item); })) {
          warning("partial_page_styling", "Some top-level blocks have explicit box styling and others do not. Review spacing on all visible fields, data views and action groups; preserve intentional defaults", "/pages/" + idx);
        }
        for (var b = 1; b < topLevel.length; b++) {
          if (topLevel[b - 1].type === "button" && topLevel[b].type === "button") {
            warning("ungrouped_adjacent_buttons", "Adjacent buttons are separate page blocks. If related, group them in a responsive layout (horizontal desktop/tablet, stacked phones)", "/pages/" + idx);
            break;
          }
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
    return "lib_ConvertigoMCP";
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
    if (response.document && response.document.res && response.document.res.error) {
      return response.document.res;
    }
    if (response.doc && response.doc.document && response.doc.document.res && response.doc.document.res.error) {
      return response.doc.document.res;
    }
    if (response.error) {
      return response.error;
    }
    return null;
  }

  function validateToken(options) {
    var opts = options || {};
    var token = trimmed(opts.token) || requestBearerToken();
    if (!token.length) {
      return {
        status: "invalid",
        authenticated: false,
        error: { code: "missing_token", message: "No Code assistant authentication is required." }
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
    if (response.document && Object.prototype.hasOwnProperty.call(response.document, "res")) {
      return response.document.res;
    }
    if (response.doc && response.doc.document && Object.prototype.hasOwnProperty.call(response.doc.document, "res")) {
      return response.doc.document.res;
    }
    return response;
  }

  function readBaserowTableFields(tableId, authentication) {
    var response = callC8oSequence("lib_BaseRow", "formscommon_FieldsList", { forms_config: JSON.stringify({ table_id: tableId, editor: authentication.user }) });
    var error = apiError(response);
    var envelope = response && (response.document || response.doc && response.doc.document || response);
    return !error && envelope && envelope.array ? ensureArray(envelope.array) : null;
  }

  function validateBaserowColumns(form, authentication, options, validation) {
    var cache = {};
    // formscommon_FieldsList reuses the Baserow token already stored in the HTTP
    // session; with an explicit editor it never resolves the account itself. A
    // fresh MCP session has no token, so the first empty answer primes the
    // session exactly like the catalog tool does, then the read is retried once.
    var sessionPrimed = false;
    function primeBaserowSession() {
      if (sessionPrimed) { return false; }
      sessionPrimed = true;
      try { callC8oSequence("lib_BaseRow", "formscommon_ApplicationsList", {}); } catch (_catalogError) {}
      return true;
    }
    baserowBindings(form).forEach(function (binding) {
      if (form._id && ensureArray(options.strictBindingPaths).indexOf(binding.path) < 0) { return; }
      if (!binding.config || !binding.config.table_id_int) { return; }
      function problem(code, message) { validation.issues.push({ code: code, message: message, path: binding.path }); }
      // Do not fetch another account's catalog while editing a shared binding.
      if (binding.config.source_owner && binding.config.source_owner !== authentication.user) {
        validation.warnings.push({ code: "baserow_columns_unverified", message: "Existing connection owner preserved; column permissions must be verified with that owner", path: binding.path });
        return;
      }
      var table = String(binding.config.table_id_int);
      if (!hasOwn(cache, table)) {
        var fetched = null;
        try { fetched = readBaserowTableFields(binding.config.table_id_int, authentication); } catch (_fieldsError) { fetched = null; }
        if ((!fetched || !fetched.length) && primeBaserowSession()) {
          try { fetched = readBaserowTableFields(binding.config.table_id_int, authentication); } catch (_retryError) { fetched = null; }
        }
        cache[table] = fetched;
      }
      var fields = cache[table];
      if (!fields || !fields.length) { problem("baserow_schema_unavailable", "Cannot read the columns of Baserow table " + table + " with the authenticated No Code account, even after opening a Baserow session; check that this account can access the table before saving. Do not remove the connection to work around this"); return; }
      var names = fields.map(function (field) { return String(field.name); });
      var columns = /\/sources[^/]*\//.test(binding.path) ? ensureArray(binding.config.columns) : [];
      if (/\/lib_BaseRow\.forms_AddRowFromData$/.test(binding.path)) {
        try { columns = Object.keys(JSON.parse(binding.entry.vars.forms_freeVars.str)); } catch (_invalidMapping) { return; }
      }
      columns.forEach(function (column) {
        var readSource = /\/sources[^/]*\//.test(binding.path);
        if (names.indexOf(column) < 0 && !(readSource && column === "id")) { problem("unknown_baserow_column", "Column is not present in the selected table: " + column); }
      });
      if (/\/lib_BaseRow\.forms_AddRow$/.test(binding.path)) {
        var inputs = ensureArray(form.formulaire).filter(function (item) { return ["description", "button", "layout", "grid", "map"].indexOf(item.type) < 0; });
        if (!inputs.some(function (item) { return names.indexOf(item.name) >= 0; })) {
          problem("unmapped_baserow_inputs", "No input technical name matches the selected table columns. Use forms_AddRowFromData with an explicit column/value mapping");
        }
      }
    });
    validation.issueCount = validation.issues.length;
    validation.warningCount = validation.warnings.length;
    validation.valid = validation.issueCount === 0;
  }

  function saveForm(form, options) {
    var opts = options || {};
    var rawThumbnailImage = opts.thumbnailImage || (form && form.thumbnailImage);
    var sanitized = sanitizeFormBeforeSave(form);
    var thumbnailImage = normalizeThumbnailImage(rawThumbnailImage);
    if (thumbnailImage.error) {
      return {
        status: "invalid",
        saved: false,
        validation: {
          valid: false,
          issueCount: 1,
          warningCount: 0,
          issues: [thumbnailImage.error],
          warnings: []
        }
      };
    }
    if (thumbnailImage.media) {
      sanitized.thumbnail = { enabled: true, index: 0, type: "custom" };
    }
    var validation = validateForm(sanitized, opts).validation;
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
    validateBaserowColumns(sanitized, authentication, opts, validation);
    if (!validation.valid) { return { status: "invalid", saved: false, validation: validation, authentication: authentication }; }
    var tempFile = null;
    var meta = clone(sanitized, {});
    // Existing documents are full read/modify/write snapshots. Never merge them
    // onto a newer revision or accidentally recreate a deleted form.
    delete meta._c8oExpectedRevision;
    if (meta._id) {
      if (!trimmed(meta._rev)) { return { status: "conflict", saved: false, validation: validation, error: { code: "missing_revision", message: "Read the current form before saving" } }; }
      meta._c8oExpectedRevision = String(meta._rev);
    }
    var variables = { meta: JSON.stringify(meta) };
    if (thumbnailImage.media) {
      try {
        tempFile = writeThumbnailImageFile(thumbnailImage.media);
        meta._up_thumbnail = true;
        meta._up_content_type = thumbnailImage.media.contentType;
        variables.meta = JSON.stringify(meta);
        variables.file = String(tempFile.getAbsolutePath());
      } catch (mediaError) {
        return {
          status: "invalid",
          saved: false,
          validation: {
            valid: false,
            issueCount: 1,
            warningCount: validation.warningCount,
            issues: [{
              code: "invalid_thumbnail_image",
              message: String(mediaError && mediaError.message ? mediaError.message : mediaError),
              path: "/thumbnailImage/base64"
            }],
            warnings: validation.warnings || []
          },
          authentication: authentication
        };
      }
    }
    var response;
    try {
      response = callC8oSequence(opts.project || opts.projectName || "C8Oforms", "APIV2_updateFormulaireDocument", variables);
    } finally {
      if (tempFile) {
        try { tempFile["delete"](); } catch (_ignoreTempDelete) {}
      }
    }
    var error = apiError(response);
    if (error) {
      return {
        status: error.error === "conflict" || error.code === "conflict" || error === "conflict" ? "conflict" : "error",
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

  function sanitizeFormBeforeSave(form) {
    var out = clone(form, {});
    try { delete out.thumbnailImage; } catch (_ignoreThumbnailImageDelete) {}
    try { delete out._attachments; } catch (_ignoreAttachmentsDelete) {}
    try { delete out._c8oMeta; } catch (_ignoreC8oMetaDelete) {}
    if (out && out.thumbnail && typeof out.thumbnail === "object" && !Array.isArray(out.thumbnail)) {
      if (hasOwn(out.thumbnail, "url")) {
        try { delete out.thumbnail.url; } catch (_ignoreThumbnailUrlDelete) {}
      }
      if (out.thumbnail.type === "url") {
        out.thumbnail.type = out.thumbnail.color ? "color" : "custom";
      }
    }
    return out;
  }

  function normalizeThumbnailImage(input) {
    if (input == null || trimmed(input).length === 0) {
      return { media: null };
    }
    var image = input;
    if (typeof input === "string") {
      try {
        image = parseObject(input, "thumbnailImage", null);
      } catch (_thumbnailParseError) {
        return { error: { code: "invalid_thumbnail_image", message: "thumbnailImage must be an object with contentType and base64.", path: "/thumbnailImage" } };
      }
    }
    if (!image || typeof image !== "object" || Array.isArray(image)) {
      return { error: { code: "invalid_thumbnail_image", message: "thumbnailImage must be an object with contentType and base64.", path: "/thumbnailImage" } };
    }
    var contentType = trimmed(image.contentType || image.mimeType || image.type).toLowerCase();
    var base64 = trimmed(image.base64 || image.data);
    if (!contentType.length) {
      return { error: { code: "invalid_thumbnail_image_content_type", message: "thumbnailImage.contentType is required.", path: "/thumbnailImage/contentType" } };
    }
    if (["image/png", "image/jpeg", "image/jpg", "image/webp"].indexOf(contentType) === -1) {
      return { error: { code: "unsupported_thumbnail_image_content_type", message: "thumbnailImage.contentType must be image/png, image/jpeg, or image/webp.", path: "/thumbnailImage/contentType" } };
    }
    if (contentType === "image/jpg") {
      contentType = "image/jpeg";
    }
    if (!base64.length) {
      return { error: { code: "missing_thumbnail_image_base64", message: "thumbnailImage.base64 is required.", path: "/thumbnailImage/base64" } };
    }
    var dataUrlMatch = /^data:([^;,]+);base64,(.*)$/i.exec(base64);
    if (dataUrlMatch) {
      if (!trimmed(image.contentType || image.mimeType || image.type).length) {
        contentType = String(dataUrlMatch[1]).toLowerCase();
      }
      base64 = dataUrlMatch[2];
    }
    base64 = String(base64).replace(/\s+/g, "");
    base64 = normalizeBase64Payload(base64);
    return { media: { contentType: contentType, base64: base64 } };
  }

  function normalizeBase64Payload(base64) {
    var normalized = String(base64 || "");
    normalized = normalized.replace(/-/g, "+").replace(/_/g, "/");
    var remainder = normalized.length % 4;
    if (remainder === 2) {
      normalized += "==";
    } else if (remainder === 3) {
      normalized += "=";
    }
    return normalized;
  }

  function writeThumbnailImageFile(media) {
    var suffix = media.contentType === "image/jpeg" ? ".jpg" : (media.contentType === "image/webp" ? ".webp" : ".png");
    var file = File.createTempFile("c8o-nocode-thumbnail-", suffix);
    file.deleteOnExit();
    var bytes = Base64.getDecoder().decode(String(media.base64));
    FileUtils.writeByteArrayToFile(file, bytes);
    return file;
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
    var form = unwrapApiResult(response);
    if (form && Object.prototype.hasOwnProperty.call(form, "res")) {
      form = form.res;
    }
    if (!form || typeof form !== "object" || !form._id) {
      return {
        status: "unavailable",
        fetched: false,
        error: {
          code: "form_unavailable",
          message: "The form is missing or not accessible to the authenticated No Code user. The API does not distinguish these cases."
        }
      };
    }
    return form;
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
      throw new Error("thumbnailUrl is not supported by the C8Oforms runtime JSON contract. Generate or fetch the image client-side and pass thumbnailImage.base64 instead.");
    }
    if (hasOwn(op, "thumbnailColor")) {
      patch.thumbnail = { enabled: true, index: 0, type: "color", color: String(op.thumbnailColor) };
    }
    if (hasOwn(op, "thumbnailImage")) {
      patch.thumbnail = { enabled: true, index: 0, type: "custom" };
      patch.thumbnailImage = op.thumbnailImage;
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
      var mode = trimmed(op.navigationMode);
      if (!mode) {
        var reference = form.pages[Math.min(pageIndex, form.pages.length - 1)];
        mode = reference && boolLike(reference.enabledTab) ? "tabs" : reference && boolLike(reference.enabledButtons) ? "buttons" : "custom";
      }
      if (["custom", "tabs", "buttons"].indexOf(mode) < 0) { throw new Error("Unknown navigationMode: " + mode); }
      var page = makePageFromOperation(op, pageIndex, mode === "tabs");
      if (mode === "custom") { page.enabledTab = false; page.enabledButtons = false; }
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
      applyFieldLabel(form.formulaire[fieldFound.index], fieldPatch);
      if (hasOwn(fieldPatch, "label")) { delete form.formulaire[fieldFound.index].label; }
      if (hasOwn(fieldPatch, "description")) { delete form.formulaire[fieldFound.index].description; }
      if (hasOwn(fieldPatch, "defaultFrom")) {
        // An explicit contextual edit replaces the old scalar self default only;
        // never silently replace a backend/choice data source.
        if (Object.keys(fieldFound.item.sources || {}).some(function (key) { return key !== "self" && boolLike(fieldFound.item.sources[key].enabled); })) { throw new Error("Cannot replace an enabled external source with defaultFrom"); }
        applyContextDefault(form.formulaire[fieldFound.index], fieldPatch);
      }
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
      flow.name = trimmed(flow.name || op.flowName || op.name);
      flow.name = flowDisplayName(flow, form.formulaire);
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
    ensureButtonFlows(edited);
    resolveAuthoringReferences(edited);
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
  function attachSavedForm(saved, candidate, options) {
    if (saved.saved !== true) { saved.form = candidate; return saved; }
    var result = saved.response || {};
    var id = result.id || candidate._id;
    // The persisted API document can differ from the compiled one (ids, media,
    // page flags). Never report an unsaved snapshot as a verified saved form.
    var readOptions = clone(options || {}, {});
    delete readOptions.rev;
    try {
      var actual = id ? getForm(String(id), readOptions) : null;
      if (actual && String(actual._id) === String(id)) {
        saved.form = actual;
        saved.readbackVerified = true;
        saved.validation = validateForm(actual, readOptions).validation;
        return saved;
      }
    } catch (_readbackError) {}
    saved.form = clone(candidate, {});
    if (id) { saved.form._id = id; }
    if (result.rev) { saved.form._rev = result.rev; }
    saved.readbackVerified = false;
    saved.validation.warnings.push({ code: "saved_form_readback_unavailable", message: "Save succeeded but readback could not be verified. Re-read this id; do not retry create.", path: "" });
    saved.validation.warningCount = saved.validation.warnings.length;
    return saved;
  }

  function finalizeBaserowBindings(saved, options, expectedCount, newForm) {
    var id = saved.form && saved.form._id || saved.response && saved.response.id;
    function pending(code) {
      saved.status = "partial";
      saved.bindingFinalization = {
        status: "pending", code: code, bindingCount: expectedCount,
        message: "The form is already saved but Baserow identity finalization is not verified. Do not call create again. Resume finalization on this same id.",
        recovery: id ? { tool: "nocode-form-edit", id: String(id), operations: [{ action: "finalize_baserow_bindings" }] } : null
      };
      return saved;
    }
    if (!expectedCount) {
      saved.bindingFinalization = { status: "not_required", bindingCount: 0 };
      return saved;
    }
    if (!id || saved.readbackVerified !== true) { return pending("saved_form_readback_unavailable"); }
    var authentication = saved.authentication || {};
    var user = authentication.authenticated === true ? trimmed(authentication.user) : "";
    // This recovery operation is limited to the creator: never reassign a
    // collaborator's Baserow account to the current caller.
    if (!user || trimmed(saved.form.creator) !== user) { return pending("binding_owner_not_verified"); }
    var candidate = clone(saved.form, {});
    var bindings = baserowBindings(candidate);
    if (bindings.length !== expectedCount) { return pending("binding_count_changed"); }
    var changed = false;
    for (var i = 0; i < bindings.length; i++) {
      var binding = bindings[i];
      if (!binding.config || !binding.variable || binding.item.id == null) { return pending("invalid_baserow_binding"); }
      if (!newForm && trimmed(binding.config.source_owner) && trimmed(binding.config.source_owner) !== user) { return pending("binding_owner_mismatch"); }
      if (String(binding.config.form_id) !== String(id) || String(binding.config.source_id) !== String(binding.item.id) || binding.config.source_owner !== user) {
        binding.config.form_id = String(id);
        binding.config.source_id = binding.item.id;
        binding.config.source_owner = user;
        binding.variable.str = JSON.stringify(binding.config);
        changed = true;
      }
    }
    if (changed) {
      var finalOptions = clone(options || {}, {});
      delete finalOptions.thumbnailImage;
      delete finalOptions.rev;
      try {
        // A fresh revision check prevents knowingly overwriting an intervening
        // editor save. The existing Forms API remains the only write path.
        var latest = getForm(String(id), finalOptions);
        if (!latest || String(latest._id) !== String(id) || latest._rev !== candidate._rev) { return pending("form_changed_before_finalization"); }
        var finalized = saveForm(candidate, finalOptions);
        if (!finalized || finalized.saved !== true) { return pending(finalized && finalized.status === "conflict" ? "form_changed_before_finalization" : "binding_save_failed"); }
        // Keep the successful second revision even if its readback fails.
        saved.response = finalized.response;
        saved.validation = finalized.validation;
        attachSavedForm(saved, candidate, finalOptions);
      } catch (_finalizationError) {
        return pending("binding_finalization_failed");
      }
    }
    if (saved.readbackVerified !== true || String(saved.form._id) !== String(id)) { return pending("binding_readback_unavailable"); }
    var verified = baserowBindings(saved.form);
    if (verified.length !== expectedCount || verified.some(function (binding) {
      return !binding.config || String(binding.config.form_id) !== String(id) || String(binding.config.source_id) !== String(binding.item.id) || binding.config.source_owner !== user;
    })) { return pending("binding_verification_failed"); }
    saved.status = "ok";
    saved.bindingFinalization = { status: "ready", bindingCount: verified.length };
    return saved;
  }

  function resumeBaserowFinalization(id, options) {
    var opts = clone(options || {}, {});
    delete opts.rev;
    var authentication = validateToken(opts);
    if (!authentication || authentication.authenticated !== true) { return { status: "auth_required", saved: false, authentication: authentication }; }
    var form = getForm(id, opts);
    if (!form || !form._id) { return form; }
    if (!baserowBindings(form).length) { return { status: "invalid", saved: false, error: { code: "no_baserow_bindings", message: "No Baserow bindings remain on this form. Inspect the saved form; finalization cannot reconstruct missing business connections." } }; }
    var saved = { status: "ok", saved: true, form: form, response: { id: form._id, rev: form._rev }, authentication: authentication, readbackVerified: true, validation: validateForm(form, opts).validation };
    return finalizeBaserowBindings(saved, opts, baserowBindings(form).length, false);
  }

  function saveEditedForm(current, edited, options) {
    var opts = clone(options || {}, {});
    var authentication = validateToken(opts);
    if (!authentication || authentication.authenticated !== true) { return { status: "auth_required", saved: false, authentication: authentication }; }
    // Root identity cannot be replaced through a merge patch.
    edited._id = current._id;
    edited._rev = current._rev;
    opts.strictBindingPaths = prepareEditedBaserowBindings(current, edited, trimmed(authentication.user));
    var expected = baserowBindings(edited).filter(function (binding) { return opts.strictBindingPaths.indexOf(binding.path) >= 0; });
    var saved = saveForm(edited, opts);
    attachSavedForm(saved, sanitizeFormBeforeSave(edited), opts);
    if (saved.saved === true && opts.strictBindingPaths.length) {
      var actual = {};
      if (saved.readbackVerified) { baserowBindings(saved.form).forEach(function (binding) { actual[binding.key] = binding; }); }
      var verified = saved.readbackVerified && expected.every(function (binding) {
        var found = actual[binding.key];
        return found && found.config && String(found.config.form_id) === String(current._id) &&
          String(found.config.source_id) === String(binding.item.id) && found.config.source_owner === binding.config.source_owner;
      });
      saved.bindingFinalization = { status: verified ? "ready" : "pending", bindingCount: expected.length };
      if (!verified) {
        saved.status = "partial";
        saved.bindingFinalization.code = "edited_binding_readback_unverified";
        saved.bindingFinalization.recovery = { tool: "nocode-form-get", id: String(current._id) };
      }
    }
    return saved;
  }

  C8O.nocodeForms.create = function (reduced, options) {
    var compiled = compileReduced(reduced, options);
    if (!compiled || compiled.status !== "ok") {
      if (compiled) {
        compiled.saved = false;
      }
      return compiled;
    }
    var createOptions = clone(options || {}, {});
    if (reduced && reduced.thumbnailImage) {
      createOptions.thumbnailImage = reduced.thumbnailImage;
    }
    var saved = saveForm(compiled.form, createOptions);
    attachSavedForm(saved, compiled.form, createOptions);
    saved.allTypesPath = compiled.allTypesPath;
    if (saved.saved === true) { finalizeBaserowBindings(saved, createOptions, compiled.bindingFinalization.bindingCount, true); }
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
    return saveEditedForm(currentForm, patched, options);
  };
  C8O.nocodeForms.edit = function (id, operations, options) {
    try {
      var requestedOperations = ensureArray(operations);
      if (requestedOperations.some(function (op) { return op && op.action === "finalize_baserow_bindings"; })) {
        if (requestedOperations.length !== 1) { throw new Error("finalize_baserow_bindings must be the only operation; resume the saved creation before other edits"); }
        return resumeBaserowFinalization(id, options);
      }
      var current = getForm(id, options);
      if (current && current.fetched === false) {
        current.saved = false;
        return current;
      }
      var currentForm = current && current.res ? current.res : current;
      var applied = applyEditOperations(currentForm, operations, options);
      var saved = saveEditedForm(currentForm, applied.form, options);
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
  C8O.nocodeForms.assertStrictJsonText = assertStrictJsonText;
  C8O.nocodeForms.parseArray = parseArray;
  C8O.nocodeForms.parseOperations = parseOperations;
})();
