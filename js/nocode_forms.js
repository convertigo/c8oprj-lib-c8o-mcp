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
    var name = label || "value";
    var stack = [], inString = false, escaped = false, started = false, endedAt = -1;
    function fail(reason, pos) {
      var from = Math.max(0, pos - 40), to = Math.min(text.length, pos + 40);
      throw new Error(name + " is not valid JSON (" + text.length + " characters were received in full, this is not a transport truncation): " + reason + " at position " + pos + ": ..." + text.substring(from, to) + "...");
    }
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (inString) {
        if (escaped) { escaped = false; }
        else if (ch === "\\") { escaped = true; }
        else if (ch === "\"") { inString = false; if (!stack.length && endedAt < 0) { endedAt = i; } }
        continue;
      }
      if (endedAt >= 0 && !/\s/.test(ch)) { fail("unexpected content after the end of the JSON value", i); }
      if (ch === "\"") { inString = true; started = true; }
      else if (ch === "{" || ch === "[") { stack.push({ ch: ch, pos: i }); started = true; }
      else if (ch === "}" || ch === "]") {
        if (!stack.length) { fail("unexpected '" + ch + "' with nothing left to close", i); }
        var open = stack.pop();
        var expected = open.ch === "{" ? "}" : "]";
        if (ch !== expected) { fail("unexpected '" + ch + "': the " + (open.ch === "{" ? "object" : "array") + " opened at position " + open.pos + " must be closed with '" + expected + "' first", i); }
        if (!stack.length && endedAt < 0) { endedAt = i; }
      }
    }
    if (inString) { fail("unterminated string", text.length); }
    if (stack.length) {
      var last = stack[stack.length - 1];
      fail(stack.length + " bracket(s) left open; the " + (last.ch === "{" ? "object" : "array") + " opened here is never closed", last.pos);
    }
    if (!started) { fail("no JSON value", 0); }
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
          groups: [],
          type: "filter"
        },
        groups: {
          shape: "groups: [{ type: \"filter\", condVisible: \"and\"|\"or\", conds: [...], groups: [...] }], recursive: a sub-group combines its conditions and its own sub-groups with its condVisible, and takes part in its parent as one condition.",
          depth: "Up to 4 levels below the top-level group; deeper sub-groups are not sent. A sub-group without any complete condition is left out.",
          variables: "The same shape in forms_tableFilter (tableData) and forms_Filter (selectData). Older viewers send two levels of sub-groups only.",
          example: {
            description: "(First name contains X OR Last name contains X) AND Rank >= 3",
            filter: {
              str: "",
              html: false,
              type: "filter",
              condVisible: "and",
              conds: [{ val1: { name: "Rank", displayName: "Rank" }, val2: { type: "text", str: "3", html: false, arr: [] }, operator: "higher_than_or_equal" }],
              groups: [{
                type: "filter",
                condVisible: "or",
                conds: [
                  { val1: { name: "First name", displayName: "First name" }, val2: { type: "text", str: "X", html: false, arr: [] }, operator: "contains" },
                  { val1: { name: "Last name", displayName: "Last name" }, val2: { type: "text", str: "X", html: false, arr: [] }, operator: "contains" }
                ],
                groups: []
              }]
            }
          }
        },
        groupOperators: ["and", "or"],
        operators: filterOperators,
        notes: [
          "Use Baserow column names in val1.name.",
          "Use condVisible with and/or for the top-level filter group operator; mix AND and OR with groups (sub-groups), never by chaining conditions.",
          "For equal with an empty value, lib_BaseRow sends __empty to avoid returning every row.",
          "SelectData also supports forms_filter as a simple search string; it is separate from forms_Filter.",
          "For source objects copied from C8Oforms, keep the conds/condVisible/groups/type metadata.",
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
        syntax: "Comma-separated aggregation specs: count or operator:Column name, each with an optional label after = (count=Deals, sum:Contract Value=Revenue).",
        examples: ["count", "sum:Amount", "avg:Amount", "min:Date", "max:Score", "count=Nombre de ventes,sum:Contract Value=Montant,sum:Expected revenue=Revenu attendu"],
        labels: {
          purpose: "The label names the value in chart legends and grid headers. Without a label the viewer shows the operator and the column in the language of the user (Somme · Contract Value, Nombre).",
          key: "The key of the value stays count or <operator>_<column> (sum_Contract Value): paths and references to it (<grid>.0.sum_Contract Value) do not change with the label.",
          rules: "Plain text of at most 128 characters, without comma, =, < or >. Give one per aggregation shown to end users, in their language, so a chart can show several readable series.",
          compatibility: "Older viewers and lib_BaseRow versions show the key (sum_Contract Value) in legends and headers."
        },
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
      capabilities: {
        read: "Source-backed grids, cards and selects read Baserow rows and field values (formssource_*), with filters that may reference fields, the selected row or the connected user.",
        create: "lib_BaseRow.forms_AddRow / forms_AddRowFromData with an empty forms_id create a row.",
        update: "The same two actions UPDATE an existing row when forms_id holds its Baserow row id. 'AddRow' in the name does not mean create-only. forms_id is usually a SmartSource reference to the id of the row selected in a grid, or to a field holding the id.",
        remove: "lib_BaseRow.forms_DeleteRow deletes the row identified by forms_id.",
        severalTables: "A flow may contain several submit elements, and a submit element several actions, each with its own forms_config. One button can therefore create a row in one table and update a row in another.",
        computedValues: "A value written to Baserow can be a SmartSource reference to a calculated field (defaultFrom source 'expression', mode 'reactive'), so arithmetic such as a remaining balance is computed in the form and then written.",
        limits: "No server-side transaction across actions, no server-side arithmetic inside an action, no access control from the form itself: enforce ownership and approval rules with Baserow permissions or filtered sources.",
        rule: "Before telling the user that something is technically impossible, re-read this section and knownNoCodeBackendActions, and quote the sentence that establishes the limit. If no sentence establishes it, the capability is not proven missing: propose the closest recipe instead."
      },
      recipes: {
        updateExistingRow: "Grid bound to the table with returned_value row_selected; edit fields prefilled from the selection (defaultFrom source 'field', path to the selected row columns); save button flow = submit with lib_BaseRow.forms_AddRowFromData, forms_id referencing <grid>.id.value, forms_freeVars mapping each column to its field.",
        updateRelatedTable: "Example: a leave request decrements a balance. 1) Load the collaborator's balance row in a source-backed grid (filtered on the connected user) so its id and current value are available. 2) Add a disabled calculated field new_balance = current balance - requested days (defaultFrom expression, reactive). 3) The submit flow contains two submit elements: the first creates the request row (forms_id empty), the second targets the balances table with forms_AddRowFromData, forms_id referencing the balance row id and forms_freeVars writing new_balance. If the business rule is 'decrement on approval', put the second submit element in the approval button flow instead.",
        approvalWorkflow: "Status changes are updates: an approve/refuse button flow uses forms_AddRowFromData with forms_id of the selected request row and forms_freeVars {Status: 'Approved'}."
      },
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
            forms_freeVars: "Multi-value variable (__c8o_multi): the list [{ name: \"Column\", str: \"value or SmartSource\" }] the editor writes; the viewer sends the backend { Column: value }. The tools also take { Column: value }; saveTo.values of baserowShorthand writes it for you.",
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
                    forms_freeVars: [{ name: "Name", str: "$$START1780215220834{\"c8otype\":\"path\",\"c8opath\":\"company_name\",\"c8oPrettyPath\":\"\",\"c8obuiltin\":\"false\",\"fakeId\":\"fakeId1780215220834\",\"c8oName\":null}END1780215220834$$" }]
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
      contractVersion: "2026-10-23.questionnaire-send-v13",
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
        config: {
          type: "object",
          optional: true,
          description: "Root sizing of the page container, per device: config.<device>.<key>. Choose it deliberately for an application. Omitted, an application (navigationMode custom or tabs) gets the recommended.application values and a linear questionnaire the editor creation values; a partial object changes only the keys it gives (also with set_root).",
          devices: { desktop: "viewport 992px and wider", tablet: "768 to 991px", phoneL: "576 to 767px", phoneP: "below 576px" },
          valueShape: "{ unit: 'px' | '%', value: '<number>' }: value is a number written as a string, as the editor writes it (a number is accepted and stored as a string).",
          keys: {
            horizontalMargin: "margin-left and margin-right of the page container, outside its padding. With vertical page tabs it starts after the tab bar.",
            padding: "padding of the same page container, inside horizontalMargin.",
            width: "max-width of the content column inside the padding (desktop 1280px, tablet and phones 100%). While the room is narrower the column fills it; on wider screens it is capped and centered (auto margins on both sides).",
            "font-size": "base font size of the page, 16px."
          },
          spacing: "horizontalMargin and padding add up on each side: the content starts horizontalMargin + padding from the screen edge, or from the tab bar. Do not double them (horizontalMargin 24px + padding 24px is already 48px per side). A vertical page tab bar already takes horizontal room (about 158px at 1440px, 106px on a 375px phone): keep the margins small, 0 on phones.",
          measured: "Vertical page tabs at 1440px: horizontalMargin 100px + padding 24px leave 1034px of content starting at x=282; the recommended 32px + 24px leave 1170px. At 800px (tablet) the recommended 16px + 20px leave 570px. At 375px the creation 10px + 12px after the tab bar leave only 225px, the recommended 0 + 12px leave 245px.",
          recommended: {
            application: APP_ROOT_SPACING,
            questionnaire: "A linear questionnaire (navigationMode buttons) can keep the creation values (horizontalMargin 100px desktop, 60px tablet, 10px phones; width 1280px desktop, 940px tablet) for a narrower reading column, or lower the desktop width (for example 760px) to keep a narrow column that stays centered on wide screens."
          },
          example: { desktop: { horizontalMargin: { unit: "px", value: "32" }, padding: { unit: "px", value: "24" }, width: { unit: "px", value: "1280" } }, tablet: { horizontalMargin: { unit: "px", value: "16" }, padding: { unit: "px", value: "20" }, width: { unit: "%", value: "100" } }, phoneL: { horizontalMargin: { unit: "px", value: "0" }, padding: { unit: "px", value: "12" } }, phoneP: { horizontalMargin: { unit: "px", value: "0" }, padding: { unit: "px", value: "12" } } },
          validation: "wide_page_margin warns when an application keeps a horizontalMargin above 48px on desktop or 16px on phones."
        },
        titleDisplay: { type: "string", enum: ["form", "page", "none"], optional: true, mapsTo: "config.titleDisplay", description: "Title card at the top of the pages: the form name (form, the viewer default), the name of the current page (page) or none. A page with isNameDisplayed=false never shows it. Read by C8Oforms viewers that have this option; older viewers always show the form name." },
        styleDefaults: { type: "boolean", optional: true, default: true, description: "false keeps the viewer card around every component instead of the role spacing of applications. See the styles section (roleDefaults)." },
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
          roleDefaults: {
            rule: "In an application (navigationMode custom or tabs) the compiler gives every new component without a style of its own the spacing of its role; a linear questionnaire keeps the viewer card around each question. Author styles only to depart from these defaults; an explicit style object replaces the default of that scope.",
            roles: { field: "top-level input: flat, 16px below", text: "top-level description: flat, 16px below", dataView: "top-level grid/chart/map/gallery: white card, 16px padding", button: "top-level button: transparent wrapper", actions: "layout of buttons: transparent, children 4px apart", row: "layout of fields: flat, 12px gutters between columns and rows", section: "section: white card with a title, see componentAuthoring.section" },
            values: ROLE_STYLES,
            optOut: "Root styleDefaults:false, or add_field with styleDefaults:false, keeps the viewer cards."
          },
          mobile: "Root config.<device> sets the page container: horizontalMargin outside, padding inside, adding up on each side. New applications get horizontalMargin 32px desktop, 16px tablet, 0 on phones and padding 24px, 20px, 12px; a linear questionnaire keeps the wider creation margins (100/60/10px). See rootFields.config. Box styles are the same on every device: prefer the 8/12/16/24px values of the role defaults to larger ones, and columns that collapse to one on phones.",
          richText: "Label and description HTML is rendered as written: inline style attributes (color, font-size, font-weight, text-align, margins) and the global Ionic utility classes work; font-family is overridden by the viewer font. The form document has no stylesheet, custom CSS class, theme color or dark mode: apply the design tokens explicitly. Do not rely on <style> blocks or event attributes.",
          boxStyles: "Only the keys of styleObjectFields are rendered; see styleRendering for the parts, the precedence (application, page, parent layoutChildrenStyle, component), the text color rules and the nesting of containers.",
          nesting: "One surface per logical group. Use boxStyle for outer margin/padding, questionBoxStyle only for the header and componentBoxStyle only for the inner control. Child boxStyle can override layoutChildrenStyle: do not double-pad or combine conflicting shorthand and per-side values. Preserve native input affordances.",
          review: "Review all visible blocks, including inputs, grids and action groups, not only the welcome card. Use a consistent spacing scale (for example 8/16/24px), verify mobile overflow and desktop density. Empty spacing alone is not an error.",
          actionGroups: "Put related buttons in a native layout: two columns on desktop/tablet, one on phones. Keep group spacing on the layout and avoid a separate full-width card per button. Do not group unrelated actions automatically.",
          buttonSurfaces: "Standalone buttons and action-only layouts use explicit boxStyle.backgroundColor=transparent and border=0 by default, not a white full-width card. Empty or omitted values may keep the white Forms default. Check parent layout and layoutChildrenStyle surfaces too. This is the wrapper only: preserve the clickable button's own backgroundColor/config.backgroundColor and readable text. Keep a surrounding content card only when semantically intended or requested.",
          acceptance: ["Check every page: introduction, section groups, inputs, data views and action groups, including nested children.", "Verify margin/padding/borders survived saved-form readback. Color/radius alone is not spacing; defaults or parent-provided spacing must be deliberate.", "Resolve partial_page_styling and ungrouped_adjacent_buttons warnings by reviewing the actual design, not by applying one card style everywhere.", "When browser access is authorized, check desktop/mobile gaps, field widths, button wrapping and overflow. Otherwise report visual verification pending."]
        },
        designTokens: {
          rule: "One small palette for the whole application, chosen for contrast on a light page. Reuse these values in styles, HTML, buttons and toasts instead of inventing new ones; keep a user-requested brand color instead of primary when given.",
          tokens: DESIGN_TOKENS,
          typography: "Page title h2 1.5rem in text color, subtitle and hints in muted color, section titles h3. Never repeat the application name as the title of every page.",
          mobileFirst: "Design for a phone first: one column on phoneP/phoneL (size 12), two on tablet, more only on desktop. Buttons stack on phones. Lists show few short columns; details go on a detail page."
        },
        pageHeader: {
          rule: "Every page of an application needs its own header: a page title, an optional one-line subtitle and, on task and detail pages, a back action. The viewer otherwise shows the form name in a large title card on every page with isNameDisplayed not false.",
          reduced: "page.header: { title, subtitle } adds a description block at the top of the page (h2 title, muted subtitle, no card). With navigationMode custom, pages default to isNameDisplayed=false; set it true on the home page only if the application name should appear there. Root titleDisplay (form, page, none) chooses what that title card shows where it is displayed.",
          example: { name: "Contact", header: { title: "Fiche contact", subtitle: "Les informations du contact sélectionné." }, fields: [{ type: "section", name: "contact_main", title: "Identité", fields: [{ type: "text", name: "contact_first_name", label: "Prénom" }, { type: "text", name: "contact_last_name", label: "Nom" }] }] },
          back: "Put the back action in the page action bar as a ghost or secondary button whose flow is push_page to the list page (or __c8o_back)."
        },
        actionBar: {
          rule: "One primary action per page or section, visually dominant; the others are secondary; destructive actions are danger and separated from the primary. Cancel is secondary or ghost, never primary.",
          variants: "button.variant: primary (solid primary), secondary (outline: transparent background, primary text and border), danger (solid red), ghost (text only). Explicit fill/backgroundColor/color override the variant. Do not set fill outline/clear with a solid backgroundColor: the viewer paints it solid.",
          order: "Primary action first in reading order, on the left of the group (it stacks on top on phones). Navigation buttons (Home, Contacts...) are a separate group from task actions: make the current page's entry primary or omit it, the others ghost or secondary.",
          example: { type: "layout", name: "contact_actions", cols: [{ size: 6 }, { size: 6 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }], phoneP: [{ size: 12 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }], phoneL: [{ size: 12 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }], boxStyle: { margin: "16px 0 24px 0", padding: "0", border: "0", backgroundColor: "transparent" }, layoutChildrenStyle: { default: { margin: "0", padding: "4px", border: "0", backgroundColor: "transparent" } }, children: [{ type: "button", name: "save_contact", label: "Enregistrer", icon: "save", variant: "primary", flow: "save_contact" }, { type: "button", name: "cancel_contact", label: "Annuler", icon: "close", variant: "secondary", flow: "cancel_contact" }] },
          width: "A button keeps the width of its label, centered in its column (justify). expand block or full makes it fill the width of its column in recent viewers (older ones keep the width of the label): use it so the buttons of a group have equal widths, and keep their labels of similar length for older viewers."
        },
        listDetail: {
          rule: "A list page shows a source-backed grid of a few short columns (name, status, date, amount) and the actions that apply to the selected row; a detail page shows the selected record in fields grouped in sections (type section), with save/cancel in its action bar.",
          selection: "Detail fields read the list grid selection through defaultFrom source field, mode reactive (path [column, 'value']). Write expressions with a fallback (value ?? ''): older viewers keep the previous value when the expression gives null or undefined, so a cleared selection would leave stale text (recent viewers empty a reactive field then).",
          guard: "Disable the row actions until a row is selected with disabledIf: { field: '<grid>', operator: 'is_empty' }, instead of a mandatory guard field.",
          runtime: "Clicking the selected row again deselects it, unless the grid sets deselectOnSecondClick:false (config.deselectOnSecondClick in a native or patched field; compile and nocode-form-edit put the reduced key there) (viewers that have this option). Recent viewers select the row again by its id after a refresh, older ones by its content: there a modified row is no longer selected after a save. Do not promise that the edited record stays selected."
        },
        emptyStates: {
          rule: "A list or dashboard needs an explicit empty state: a muted hint telling what will appear and which action creates the first record, next to that action.",
          example: { type: "description", name: "contacts_empty", description: "<p style=\"margin:0;color:#64748B\">Aucun contact pour l'instant ? Utilisez « Nouveau contact » pour créer le premier.</p>", boxStyle: { margin: "0 0 8px 0", padding: "0", border: "0", backgroundColor: "transparent" } },
          note: "A row_selected grid is empty until a row is selected, so is_empty on it does not mean 'no record'. Showing the hint only when the table is empty needs a runtime check of the chosen condition in a browser."
        },
        toasts: {
          rule: "A toast confirms the outcome of an action in a few words. color must be a 6-digit hex: the viewer derives the text color from it and any other value gives a transparent toast with white text. The names success, danger, warning, info are compiled to readable hex values; a toast without color is success.",
          recipes: { success: { type: "toast", message: "Contact enregistré", color: "success", duration: 3, position: "bottom" }, error: { type: "toast", message: "Le contact n'a pas pu être enregistré", color: "danger", duration: 6, position: "top", closeBtn: true }, info: { type: "toast", message: "Sélectionnez d'abord un contact", color: "info", duration: 4, position: "top" } },
          duration: "duration is in seconds (3 to 6), not milliseconds.",
          afterSubmit: "A failed submit stops its flow and the viewer shows its own error message: steps after it, including a success toast, run only when the save succeeded. No if_else is needed to guard a success toast. A network failure also stops the flow; older viewers show no message then."
        },
        dataViews: {
          grids: "Lists: at most 5 short visible columns; hide long text (notes, descriptions) and technical columns with forms_config.hidden and show them on the detail page. AutoSizeColumns true sizes columns to their content and scrolls horizontally: set it false for wide tables so columns fit the width. Number columns keep the Baserow decimal places; aggregation results (sum, average) are not rounded by the source, so prefer a count or show amounts on rows.",
          label: "The grid label is small plain text: put the section title in a description block (h3) above the grid and keep the grid label short or empty.",
          headers: "Grid column headers show the source column names as they are, and aggregation columns their label (authoringContract.baserowSources.groupAggregations.labels: sum:Amount=Montant, else Somme · Amount); no grid property renames them. When the application creates its Baserow schema, name the fields in the user's language as they should read in the grids (Montant du contrat, not contract_value). With an existing base whose names do not suit, show few columns and explain them in the title above the grid; label the aggregations of a grid or a chart shown to end users.",
          selects: "A source-backed select lists every row, including rows whose display column is empty (blank options). Add a not-empty rule on the display column in forms_Filter and sort with forms_tableSort. A select default from a grid selection uses sources.self.vars.selfVar { type: 'ts', str: \"(fields.<grid> && fields.<grid>['<column>'] ? fields.<grid>['<column>'].value : '')\" }, the same cell path as a defaultFrom field source on that grid, giving a value that exists among the options (otherwise the select stays empty).",
          placeholders: "Give text, select and date inputs a useful placeholder or none: a missing placeholder is compiled to an empty one, never the prototype example text."
        },
        data: {
          local: "sourceEnabled=false is transient UI state, never a substitute for business storage. Use local row actions only for an explicitly temporary interaction; never deliver fictitious-row buttons as an application feature.",
          connected: "Deliver an operational application. For Baserow, discover the authorized workspace/base, plan and create the dedicated schema required by the application (field names in the user's language: they are the grid column headers), then bind save actions and result views to those tables. Ask for an unresolved destination or access; do not fall back to a local demonstration. Do not seed invented records unless explicitly requested.",
          unsupported: "Do not put rows/sampleRows/data directly on a reduced grid: Forms does not initialize local grid rows from those properties. Do not use a self source as a pretend grid backend.",
          tracking: "A tracking page must contain a real source-backed grid/cards view, not explanatory HTML or a local demonstration. Show an empty state until real records exist. Filter private data server-side; a UI filter is not access control."
        },
        incrementalCreation: {
          rule: "Tool arguments are generated token by token by the model; a reduced JSON above roughly 4 KB is likely to arrive with a structural typo and be refused. Build large applications in steps, each with a short argument, and pass reduced as a JSON object, not as a string.",
          step1: "nocode-form-create with the skeleton: name, descform, navigationMode, pages with header and iconName, their fields grouped in sections and action layouts (type, name, label, mandatory, choices, Baserow sources/actions with columns), button fields with their variant and flow ids and the push_page/submit flows. No style objects: the role defaults space an application. Remaining design warnings (ungrouped_adjacent_buttons) are expected at this step.",
          step2: "One nocode-form-edit per page for what the skeleton left: add_flow_element for toasts/refresh, update_field for a deliberate style change, update_page for icons/flags. Keep each call to one page so a refused call costs one page, not the application.",
          step3: "nocode-form-get, then nocode-form-validate: all design warnings of step 1 must be resolved before delivery.",
          onInvalidJson: "A 'reduced is not valid JSON' error names the position and shows the surrounding text: fix the JSON at that position and resend the same call. The whole argument was received; it is never a transport truncation."
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
        isNameDisplayed: { type: "boolean", optional: true, default: "false in tab and custom navigation", description: "Shows the form name in a large title card at the top of the page. Keep it off on application pages and use header." },
        header: { type: "object", optional: true, fields: { title: "string, required", subtitle: "string", name: "technical name of the generated description block" }, description: "Page title block added as the first component. See generationQuality.pageHeader." },
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
        sticky: { type: "string", optional: true, enum: ["always", "notOnPhone"], mapsTo: "config.sticky", description: "Keeps the component at the top of the screen while the page scrolls under it (a search bar, a summary, an action bar): always, or notOnPhone (not below 768px). A component of a layout or a card sticks along its layout or card only; a sticky child of a layout takes its own height. Older viewers ignore it." },
        visibleIf: { type: "object", optional: true, mapsTo: "conditions.visibleIf", description: "Shows the component only when the condition is true. Reduced condition shape: see conditionFields." },
        disabledIf: { type: "object", optional: true, mapsTo: "conditions.buttonStateIf", description: "Button-only shorthand: disables the button when the condition is true. Reduced condition shape: see conditionFields." },
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
        margin: { type: "string", optional: true, example: "0 0 16px 0", description: "Outer margin: one CSS shorthand (1 to 4 values). There are no per-side keys." },
        padding: { type: "string", optional: true, example: "16px", description: "Inner padding: one CSS shorthand (1 to 4 values)." },
        backgroundColor: { type: "string", optional: true, example: "#FFFFFF" },
        textColor: { type: "string", optional: true, example: "#0F172A", description: "Text color of the part and of everything inside it, or auto (black or white by contrast with the background). Forced with !important on the buttons, icons and inputs inside: see styleRendering.textColor." },
        textColorMode: { type: "string", optional: true, enum: ["", "auto", "custom", "none"], description: "auto computes the color, custom uses textColor, none (or no key) keeps the default." },
        border: { type: "string", optional: true, example: "1px solid #E2E8F0", description: "Border shorthand (width style color)." },
        borderTop: { type: "string", optional: true, example: "1px solid #E2E8F0", description: "One side, a full shorthand applied after border; borderRight, borderBottom and borderLeft likewise." },
        borderRight: { type: "string", optional: true },
        borderBottom: { type: "string", optional: true },
        borderLeft: { type: "string", optional: true },
        borderRadius: { type: "string", optional: true, example: "12px", description: "One radius for all corners." },
        verticalAlign: { type: "string", optional: true, enum: ["", "start", "center", "end", "stretch"], description: "Only for the children of a layout (their boxStyle or the layout's layoutChildrenStyle): aligns the child in its column; stretch (default) makes the columns of a row as tall as each other. Ignored elsewhere." },
        borderWidth: { type: "string", optional: true, legacy: true, description: "Legacy: read when border is empty, removed by the editor. Use border." },
        borderStyle: { type: "string", optional: true, legacy: true, description: "Legacy, see borderWidth." },
        borderColor: { type: "string", optional: true, legacy: true, description: "Legacy, see borderWidth." }
      },
      styleRendering: {
        parts: { boxStyle: "the card around the component (its container)", questionBoxStyle: "the label (question) of the component; description, button and chart have none", componentBoxStyle: "the control: the ion-item of an input, the radio or checkbox list, the signature pad, the gallery; on a grid it is the refresh/deselect toolbar, not the table" },
        ignoredKeys: "The viewer reads only the keys of styleObjectFields; any other key is ignored without error and refused at creation (unsupported_style_key): marginTop and other sides (use the margin/padding shorthand), color (use textColor), boxShadow, width, height, minHeight, opacity, fontSize, fontWeight, fontFamily, textAlign (put text styles in the HTML of a label or description).",
        values: "CSS strings with units (16px, 1rem, 50%, calc(...)); !important is removed; a bare nonzero number is not a length. An empty string or a missing key keeps the default.",
        precedence: "From weakest to strongest: the application config.<part>, the page config.<part>, the parent's layoutChildrenStyle (default, then first, then last), the component's own style. Inside a layout, the container of a child takes the layoutChildrenStyle value first and the application/page/child boxStyle over it; inside a card, layoutChildrenStyle wins over the application and the page.",
        layoutChildrenStyle: "{ default, first, last }: each a box style for the container of the children, which may also hold questionBoxStyle and componentBoxStyle for their parts. In a layout first and last are the first and last child of each visual row (per device); in a card, the first and last child.",
        globalStyles: "Avoid boxStyle on the application or a page: it applies to every top-level component, to root layouts and cards and to the children of layouts, so spacing and borders add up (global_box_style). The role defaults style components one by one.",
        textColor: "A text color (custom or auto) on a container is forced on what it contains: button labels and icons take it whatever the button color, inputs lose their light grey background, grids and galleries are tinted. Keep it for text-only blocks (a dark band of description) or color the text inside the HTML (container_text_color).",
        perDevice: "Box styles are the same on every screen. Only the root config.<device>, the layout columns (cols, tablet, phoneL, phoneP), the gallery cards per line and the phone navigation change with the screen.",
        nesting: "A layout renders the simple components and nested layouts, not a card; a card (ion-card) renders the simple components, not a layout, a card or a map (unrendered_nesting). Group fields with a section or a layout.",
        mandatoryError: "A mandatory component left empty is painted light red (#ffebee, !important) whatever its backgroundColor.",
        editorCanvas: "The editor canvas does not draw box styles nor the root config.<device>: check them in the viewer or the preview."
      },
      conditionFields: {
        visibleIf: { type: "object", optional: true, description: "Visibility condition group." },
        goToPageIf: { type: "object", optional: true, description: "Navigation authorization condition group (native shape only)." },
        buttonStateIf: { type: "object", optional: true, description: "Button enabled/disabled condition group." },
        disabledIf: { type: "object", optional: true, description: "Reduced authoring alias for buttonStateIf with __uiMode=button_state_disabled_when_condition." },
        reducedShape: {
          condition: "{ field: '<technical name of a component or formula>', operator, value }. value is omitted for is_filled/is_empty and is an array for among_following/out_following.",
          group: "{ all: [conditions or groups] } (and) or { any: [...] } (or). A single condition is a group of one.",
          never: "{ never: true } hides a component permanently, for example a hidden data-provider grid or its layout.",
          operators: CONDITION_OPERATORS,
          aliases: CONDITION_OPERATOR_ALIASES,
          semantics: "is_filled/is_empty test a value; a grid is empty until a row is selected (row_selected) and again after deselection. equals/different/greater/minus compare with value. Any other operator name is refused: the viewer would silently evaluate it as false. Field names are resolved to component ids and types; native groups (with conds/groups) are kept as they are.",
          examples: [
            { visibleIf: { field: "contacts", operator: "is_filled" } },
            { disabledIf: { field: "contacts", operator: "is_empty" } },
            { visibleIf: { all: [{ field: "status", operator: "equals", value: "Open" }, { any: [{ field: "amount", operator: "greater", value: "1000" }, { field: "priority", operator: "among_following", value: ["High", "Urgent"] }] }] } },
            { visibleIf: { never: true } }
          ],
          hiddenFields: "A hidden component is not checked as mandatory. Hide a component rather than adding a mandatory guard field."
        }
      },
      dynamicReferences: dynamicReferenceContract(),
      componentAuthoring: {
        layout: {
          fields: ["name", "cols", "tablet", "phoneL", "phoneP", "children"],
          description: "Responsive row/container. children are nested fields; compiler creates childrenRefs and parentRef.",
          colsExample: [{ size: 3 }, { size: 3 }, { size: 6 }, { size: 0 }, { size: 0 }, { size: 0 }],
          actionGroupExample: { type: "layout", name: "request_actions", cols: [{ size: 6 }, { size: 6 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }], tablet: [{ size: 6 }, { size: 6 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }], phoneL: [{ size: 12 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }], phoneP: [{ size: 12 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }], boxStyle: { margin: "0 0 16px 0", padding: "0" }, children: [{ type: "button", name: "open_requests", label: "My requests", flow: "open_requests" }, { type: "button", name: "return_home", label: "Home", flow: "return_home" }] }
        },
        section: {
          fields: ["name", "title", "subtitle", "columns", "fields", "visibleIf", "boxStyle", "layoutChildrenStyle"],
          description: "A group of fields in one white card with an h3 title: compiled to a layout (one column) holding the title, rows of fields in columns (columns 1 to 4, default 2; at most 2 on tablets, 1 on phones) and, on a line of their own, the fields with fullWidth:true and nested layouts. Use one section per logical group of a detail or entry page (Identité, Coordonnées, Contrat) instead of loose rows.",
          example: { type: "section", name: "contact_identity", title: "Identité", subtitle: "Le contact et son entreprise", columns: 2, fields: [{ type: "text", name: "first_name", label: "Prénom" }, { type: "text", name: "last_name", label: "Nom", mandatory: true }, { type: "select", name: "company", label: "Entreprise", values: ["A", "B"] }, { type: "text", name: "notes", label: "Notes", fullWidth: true }] }
        },
        description: { fields: ["name", "description"], note: "Use HTML for headings, dashboards, explanatory bands, and visual grouping." },
        text: { visual: "config.type: unset, text, password, email, number, search, tel, url (input type and keyboard); short:false gives a growing multi-line field.", fields: ["name", "description", "placeholder", "mandatory", "short", "config"] },
        datetime: { visual: "display_format and picker_format take the same value: MM/DD/YY, DD/MM/YY, MM/DD/YYYY, DD/MM/YYYY or YYYY/MM/DD.", fields: ["name", "description", "placeholder", "mandatory", "config"], configHints: ["display_format", "picker_format", "min_datetime", "max_datetime"] },
        time: { visual: "display_format and picker_format: HH:mm, HH:mm:ss, hh:mm:A or hh:mm:ss:A.", fields: ["name", "description", "placeholder", "mandatory", "config"], configHints: ["display_format", "picker_format"] },
        slider: { visual: "config.pin (value bubble while dragging), config.snaps (ticks), config.sliderLeftLabel and sliderRightLabel (texts at the ends).", fields: ["name", "description", "min", "max", "step"] },
        radio: { fields: ["name", "description", "values", "config"], values: "string[] or option objects" },
        checkbox: { fields: ["name", "description", "values", "config"], values: "string[] or option objects" },
        select: { visual: "config.type: popover (default), action-sheet or alert (not action-sheet with selectionMode multiple); config.selectionMode: single or multiple.", fields: ["name", "description", "placeholder", "values", "sources", "sourceEnabled", "config"], values: "string[] or option objects" },
        radio_group: { fields: ["name", "description", "columns", "rows"] },
        checkbox_group: { fields: ["name", "description", "columns", "rows"] },
        grid: { visual: "Table look: config.gridCellPadding (number of px, 0 to 60, default 21), gridFooterEnabled, gridFiltersEnabled, gridPaginationEnabled with gridRowsPerPage (default 10). componentBoxStyle styles the table (its margin, border, background); boxStyle the card around it. Older viewers put componentBoxStyle on the refresh/deselect toolbar above the table.", fields: ["name", "description", "columns", "sources", "sourceEnabled", "returned_value", "AutoSizeColumns", "deselectOnSecondClick", "config"], headers: "Column headers are the source column names (Baserow field names) and aggregation keys (count, sum_<column>); no grid property renames them. See generationQuality.dataViews.headers.", deselectOnSecondClick: "false keeps the selected row selected when it is clicked again (viewers that have this option).", columnsExample: [{ name: "Child", type: "text" }, { name: "Status", type: "text" }] },
        button: { visual: "config.shape: default or round; size: small, default or large; justify and align (flex-start, center, flex-end) place the button in its block; iconPosition: start or end. color and backgroundColor win over componentBoxStyle colors; a textColor on a container around the button overrides its label color. buttonDisplayMode advanced renders the label as HTML and ignores fill, colors, shape, size and icon.", fields: ["name", "flow", "label", "icon", "iconPosition", "variant", "backgroundColor", "color", "fill", "expand", "disabledIf", "config"], configHints: ["label", "icon", "iconPosition", "backgroundColor", "color", "fill", "expand"], variants: BUTTON_VARIANTS, note: "Prefer variant over raw colors; see generationQuality.actionBar. expand block or full renders a full-width button in recent viewers; older ones keep the width of the label." },
        img: { visual: "config.width and height are a number of pixels ('240') or a percentage ('100%'); another unit is read as pixels (image_size_unit). Older viewers append px to the width, so a percentage needs a recent viewer. config.alt is the alternative text.", fields: ["name", "description", "config"] },
        file: { fields: ["name", "description", "mandatory", "config"] },
        signature: { fields: ["name", "description", "mandatory", "config"] },
        location: { fields: ["name", "description", "config"] },
        barcode: { fields: ["name", "description", "config"] },
        chart: { visual: "config.type: line, area, bar, pie or donut; config.height: 'auto' or a number of pixels ('320'); firstColAsXAxis. Chart colors, legend and theme cannot be set.", fields: ["name", "description", "sources", "config"] },
        gallery: { fields: ["name", "description", "sources", "config"], visual: "config.cardsPerLine, cardsPerLineTablet, cardsPerLinePhoneL, cardsPerLinePhoneP: 1, 2, 3, 4 or 6 cards per line (an empty value takes the next larger screen's; phoneP falls back to 1); config.galleryTemplate { str, html: true, type: 'html' } is the HTML of a card. Card images are 180px high (object-fit cover) whatever the template says." },
        "ion-card": { fields: ["name", "label", "description"], visual: "A card with a title: config.title (text, html with personalized:true, size H1 to H6, position text-left/text-center/text-right, label_color). Its children are not compiled by the reduced contract (refused): use a section to group fields in a titled card." },
        map: { visual: "config.minHeight in pixels ('320', default 400px; any other unit becomes px), config.zoom (0 to 18), config.autoCenter.", fields: ["name", "description", "sources", "config"] }
      },
      baserowShorthand: {
        rule: "Prefer these reduced forms to the native sources and actions (baserowSources, backendActions): the tools find the table path and id in the user's catalog, encode every variable and resolve the references to fields and grids. table is a table id or its path Workspace~>Base~>Table from nocode-baserow-catalog-list.",
        dataView: { on: "grid, chart, map, gallery", shape: "source: { table, columns: [...], hidden, filter, sort: \"Name,-Date\", distinct, groupBy, aggregations: \"count=Label,sum:Amount=Label\" }" },
        choices: { on: "select, radio, checkbox", columnChoices: "source: { table, field: \"Status\" } lists the options of a single select column", rows: "source: { table, display: \"Name\", value: \"Code\", filter, sort } lists the rows of a table" },
        filter: "A condition { column, operator, value }, or { all: [...] } / { any: [...] } nested: { all: [{ any: [{ column: \"Title\", operator: \"contains\", value: { field: \"search\" } }, { column: \"Description\", operator: \"contains\", value: { field: \"search\" } }] }, { column: \"Priority\", operator: \"single_select_equal\", value: \"High\" }] }. A plain value is a literal; { field: \"name\" } reads that component at runtime.",
        operators: { text: ["contains", "contains_not", "contains_word", "equal", "not_equal", "empty", "not_empty"], number: ["equal", "higher_than", "higher_than_or_equal", "lower_than", "lower_than_or_equal"], singleSelect: ["single_select_equal", "single_select_not_equal", "single_select_is_any_of"], other: ["boolean", "link_row_has", "multiple_select_has"], all: "baserowSources.filter.operators lists every Baserow filter type" },
        save: { on: "a submit element of a flow", add: "{ type: \"submit\", saveTo: { table } } adds a row from the inputs named like its columns (forms_AddRow)", map: "saveTo: { table, values: { \"Column\": \"field_name\", \"Status\": { value: \"New\" } } } writes the columns given (forms_AddRowFromData): a string names a field, { value } is a literal, { field, path } reads a part of a field", update: "saveTo: { table, row: \"grid_name\", values } updates the row selected in that grid", remove: "{ type: \"submit\", deleteFrom: { table, row: \"grid_name\" } } deletes the selected row" },
        edits: "add_field, add_flow and add_flow_element take the same shapes; update_field with patch.source replaces the component's source."
      },
      baserowSources: baserowSourceContract(),
      backendActions: backendActionContract(),
      flowAuthoring: {
        rule: "Use flows only when referenced by a button, when formulas/business logic are needed, or when a submit step must execute backend actions.",
        formulas: "Put business_logic elements in the flow with id formulas.",
        buttonFlow: "A button field sets flow to the stable flow id. Set a meaningful visible flow.name in the user's language; do not confuse it with the id. Missing names fall back to the unique triggering button label or a humanized id. Explicit names also apply to the built-in formulas/submit flows.",
        backendActions: "Attach backend sequence actions to submit elements through submit.actions; see authoringContract.backendActions.",
        toast: "message is translated into sources.self.vars.selfVar.str (text, html=false). Explicit sources take precedence. position (top, middle, bottom), duration (seconds), color and closeBtn map into config. color must be a 6-digit hex or success/danger/warning/info (compiled to readable hex); default success. See generationQuality.toasts.",
        ifElse: {
          shape: "{ type: 'if_else', condition: <reduced condition, see conditionFields.reducedShape>, then: [elements], else: [elements] }",
          compilation: "then/else elements are compiled after the if_else with parentRef set to it and listed in childrenRefs/childrenRefsElse. Branches can be nested. In edits, add_flow and add_flow_element compile reduced elements; update_flow_element stores native elements as given.",
          example: { type: "if_else", condition: { field: "amount", operator: "greater", value: "1000" }, then: [{ type: "push_page", targetPage: "Approval" }], else: [{ type: "submit", actions: {} }, { type: "toast", message: "Saved", color: "success" }] },
          submit: "Do not test the outcome of a submit with if_else: a failed submit stops the flow (see generationQuality.toasts.afterSubmit). An if_else without a condition always runs its then branch: it is refused at creation and reported on existing forms."
        },
        resetFields: {
          shape: "{ type: 'reset_fields', scope: 'application' | 'page' | 'component', targetPage: '<page name>', targetField: '<component name>' }",
          semantics: "page resets the input values of that page (default: the current page); component resets the named component and its children; application resets every input. Values are rebuilt from their defaults. scope defaults to component with targetField, page with targetPage, otherwise application.",
          order: "Put reset_fields before the push_page that leaves the page, or target the page explicitly; resetting a list grid does not clear its visual selection."
        },
        gridActions: "targetGrid accepts a unique field name in reduced JSON, resolved to the component id: a grid for add_row_to_local_grid and remove_row_from_local_grid; a grid, a gallery or a chart for refresh_grid (it reloads the data source of its target; a map is not reloaded). add_row_to_local_grid accepts row as a literal JSON object or an explicit object-valued SmartSource. Local insertions are not persistent saves.",
        elementTypes: ["business_logic", "toast", "submit", "if_else", "for_loop", "push_page", "push_app", "add_row_to_local_grid", "remove_row_from_local_grid", "refresh_grid", "reset_fields"],
        examples: [
          { id: "open_requests", name: "Open my requests", elements: [{ type: "push_page", targetPage: "My requests" }] },
          { id: "refresh_requests", name: "Refresh requests", elements: [{ type: "refresh_grid", targetGrid: "requests" }] },
          { id: "save_contact", name: "Enregistrer le contact", elements: [{ type: "submit", actions: {} }, { type: "toast", message: "Contact enregistré", color: "success", duration: 3 }, { type: "refresh_grid", targetGrid: "contacts" }, { type: "reset_fields", scope: "page", targetPage: "Contact" }, { type: "push_page", targetPage: "Contacts" }] },
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
          { action: "add_field", note: "On an application page a new top-level component gets the role spacing (styleDefaults:false keeps the viewer card); a section can be added the same way.", example: { action: "add_field", pageName: "Details", fieldObject: { type: "section", name: "contract", title: "Contrat", fields: [{ type: "text", name: "amount", label: "Montant" }, { type: "datetime", name: "signed_on", label: "Signé le" }] } } },
          { action: "add_field", note: "To add inside a layout/container, provide parentFieldId instead of an index-only top-level insertion.", example: { action: "add_field", parentFieldId: "1779979310404", fieldObject: { type: "select", name: "status", description: "Status", values: ["Open", "Closed"] } } },
          { action: "update_field", requiredOneOf: ["fieldId", "fieldName"], required: ["patch"], example: { action: "update_field", fieldName: "child_name", patch: { config: { mandatory: false, label: "Child" } } } },
          { action: "remove_field", aliases: ["delete_field", "remove_component"], requiredOneOf: ["fieldId", "fieldName"], example: { action: "remove_field", fieldName: "obsolete_field" } },
          { action: "move_field", requiredOneOf: ["fieldId", "fieldName"], optional: ["pageName", "pageTechName", "parentFieldId", "index"], example: { action: "move_field", fieldName: "status", pageName: "Details", index: 0 } },
          { action: "add_flow", required: ["flowId"], example: { action: "add_flow", flowId: "flow_save", name: "Save", flowData: { elements: [] } } },
          { action: "set_root", note: "config is merged device by device and key by key; see rootFields.config.", example: { action: "set_root", config: { desktop: { horizontalMargin: { unit: "px", value: "32" } }, phoneL: { horizontalMargin: { unit: "px", value: "0" } }, phoneP: { horizontalMargin: { unit: "px", value: "0" } } } } },
          { action: "add_flow_element", required: ["flowId", "element"], example: { action: "add_flow_element", flowId: "flow_save", element: { type: "toast", message: "Saved", color: "success" } } },
          { action: "update_field", note: "Reduced conditions and button variants are accepted in patches; a reduced condition replaces the whole group.", example: { action: "update_field", fieldName: "open_contact", patch: { variant: "secondary", disabledIf: { field: "contacts", operator: "is_empty" } } } },
          { action: "add_page", note: "header adds the page title block (add_page and create only); custom navigation pages default to isNameDisplayed=false.", example: { action: "add_page", name: "Contact", navigationMode: "custom", header: { title: "Fiche contact", subtitle: "Les informations du contact sélectionné." } } }
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

  // Sources and backend actions keep the UI-authored encoding of their variables: { str, html:false }, forms_config
  // and forms_freeVars as JSON text in str, filters and sorts with their conds. An agent that wrote forms_config as an
  // object, or a variable as a plain value, was refused ("forms_config must be a JSON string") and spent several calls
  // finding the native shape: encode them here. Only qualified requestable entries (lib_BaseRow.formssource_GetTableData,
  // lib_BaseRow.forms_AddRow...) are touched, not the self source; null is kept (a merge patch removes with it).
  // forms_freeVars (forms_AddRowFromData) is a multi-value variable: the editor stores it as the list of
  // { name: column, str: value } it shows, the viewer resolves each str and sends the backend { column: value }. A JSON
  // object text in str also runs, but breaks on a quote in a value and the editor empties it when the action is opened.
  function freeVarsColumns(value) {
    if (Array.isArray(value)) { return value.map(function (item) { return item && typeof item === "object" ? trimmed(item.name) : ""; }); }
    if (value && typeof value === "object" && typeof value.str === "string") {
      var mapping = null;
      try { mapping = JSON.parse(value.str); } catch (_invalidMapping) { mapping = null; }
      return mapping && typeof mapping === "object" && !Array.isArray(mapping) ? Object.keys(mapping).map(trimmed) : null;
    }
    return null;
  }

  function freeVarsList(map) {
    return Object.keys(map).map(function (column) { return { name: column, str: map[column] == null ? "" : String(map[column]) }; });
  }

  function normalizeRequestableEntries(entries) {
    if (!entries || typeof entries !== "object" || Array.isArray(entries)) { return entries; }
    Object.keys(entries).forEach(function (key) {
      var entry = entries[key];
      if (key.indexOf(".") < 1 || !entry || typeof entry !== "object" || Array.isArray(entry)) { return; }
      if (!hasOwn(entry, "enabled")) { entry.enabled = true; }
      if (entry.vars == null || typeof entry.vars !== "object" || Array.isArray(entry.vars)) { entry.vars = {}; }
      Object.keys(entry.vars).forEach(function (name) {
        var value = entry.vars[name];
        if (value === null) { return; }
        if (name === "forms_freeVars") {
          if (Array.isArray(value)) {
            entry.vars[name] = value.map(function (item) { return item && typeof item === "object" ? { name: trimmed(item.name), str: item.str == null ? "" : String(item.str) } : { name: "", str: "" }; });
          } else if (typeof value === "object" && !hasOwn(value, "str")) {
            entry.vars[name] = freeVarsList(value);
          } else if (typeof value === "string") {
            var parsed = null;
            try { parsed = JSON.parse(value); } catch (_notJson) { parsed = null; }
            entry.vars[name] = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? freeVarsList(parsed) : { str: value, html: false };
          }
          return;
        }
        if (typeof value !== "object") {
          entry.vars[name] = { str: String(value), html: false };
        } else if (Array.isArray(value) || (!hasOwn(value, "str") && !hasOwn(value, "conds") && !hasOwn(value, "groups"))) {
          entry.vars[name] = { str: JSON.stringify(value), html: false };
        } else if (!hasOwn(value, "str")) {
          value.str = "";
          if (!hasOwn(value, "html")) { value.html = false; }
          if (!hasOwn(value, "type")) { value.type = /sort/i.test(name) ? "sort" : "filter"; }
        }
      });
    });
    return entries;
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

  // Readable defaults for generated applications. White text on each colored
  // token, except text/muted/border/surface which are page colors.
  var DESIGN_TOKENS = {
    primary: "#2563EB",
    onPrimary: "#FFFFFF",
    text: "#0F172A",
    muted: "#64748B",
    border: "#E2E8F0",
    surface: "#FFFFFF",
    success: "#15803D",
    danger: "#B91C1C",
    warning: "#B45309",
    info: "#1E293B"
  };

  // The viewer writes a toast color as CSS --background and derives the text
  // color from a 6-digit hex only: a name such as "success" gives white on white.
  var TOAST_COLORS = {
    success: DESIGN_TOKENS.success,
    danger: DESIGN_TOKENS.danger,
    error: DESIGN_TOKENS.danger,
    warning: DESIGN_TOKENS.warning,
    info: DESIGN_TOKENS.info,
    dark: DESIGN_TOKENS.info,
    primary: DESIGN_TOKENS.primary,
    medium: "#475569"
  };

  // The viewer sets the inline --background of a button from config.backgroundColor
  // whatever its fill, so outline/clear need a transparent background to look so.
  var BUTTON_VARIANTS = {
    primary: { fill: "solid", backgroundColor: DESIGN_TOKENS.primary, color: DESIGN_TOKENS.onPrimary },
    secondary: { fill: "outline", backgroundColor: "transparent", color: DESIGN_TOKENS.primary, border: "1px solid " + DESIGN_TOKENS.primary },
    danger: { fill: "solid", backgroundColor: DESIGN_TOKENS.danger, color: DESIGN_TOKENS.onPrimary },
    ghost: { fill: "clear", backgroundColor: "transparent", color: DESIGN_TOKENS.primary }
  };

  var PROTOTYPE_PLACEHOLDERS = { text: "Exemple de placeholder", select: "Exemple de réponse", datetime: "Datetime", time: "Time", barcode: "Exemple de placeholder", location: "Exemple de placeholder", file: "Exemple de fichier" };

  // Each operator is the name of the viewer method that evaluates it.
  var CONDITION_OPERATORS = ["equals", "different", "greater", "greaterequals", "minus", "minusequals", "among_following", "out_following", "contains", "not_contains", "contains_multiple_files", "contains_a_file", "does_not_contain_file", "is_filled", "is_empty"];
  var CONDITION_OPERATOR_ALIASES = { "==": "equals", "=": "equals", "!=": "different", ">": "greater", ">=": "greaterequals", "<": "minus", "<=": "minusequals", in: "among_following", not_in: "out_following", not_empty: "is_filled", filled: "is_filled", empty: "is_empty" };
  var UNARY_CONDITION_OPERATORS = ["is_filled", "is_empty", "contains_a_file", "does_not_contain_file", "contains_multiple_files"];

  function normalizeToastColor(value) {
    var text = trimmed(value);
    if (hasOwn(TOAST_COLORS, text.toLowerCase())) { return TOAST_COLORS[text.toLowerCase()]; }
    var short = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
    if (short) { return "#" + short[1] + short[1] + short[2] + short[2] + short[3] + short[3]; }
    if (/^#?[0-9a-f]{6}$/i.test(text)) { return text.charAt(0) === "#" ? text : "#" + text; }
    return value;
  }

  function isReadableToastColor(value) {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
  }

  function isOpaqueColor(value) {
    var text = trimmed(value).toLowerCase().replace(/\s/g, "");
    return text.length > 0 && text !== "transparent" && !/^rgba\(.*,0(\.0*)?\)$/.test(text) && !/^#[0-9a-f]{6}00$/.test(text);
  }

  function isWhiteColor(value) {
    return ["white", "#fff", "#ffffff", "rgb(255,255,255)", "rgba(255,255,255,1)"].indexOf(trimmed(value).toLowerCase().replace(/\s/g, "")) >= 0;
  }

  function explicitConfigValue(field, key) {
    return hasOwn(field, key) || (field && field.config && typeof field.config === "object" && hasOwn(field.config, key));
  }

  // variant gives coherent fill/colors; explicit fill/backgroundColor/color win.
  // A bare outline/clear fill drops the solid prototype colors it would inherit.
  function applyButtonVariant(target, field) {
    var config = target.config || (target.config = {});
    var variant = trimmed(field.variant != null ? field.variant : field.config && field.config.variant);
    delete config.variant;
    delete target.variant;
    var recipe = null;
    if (variant.length) {
      recipe = hasOwn(BUTTON_VARIANTS, variant) ? BUTTON_VARIANTS[variant] : null;
      if (!recipe) { throw new Error("Unknown button variant: " + variant + " (use " + Object.keys(BUTTON_VARIANTS).join(", ") + ")"); }
    } else if (["outline", "clear"].indexOf(trimmed(config.fill)) >= 0 && explicitConfigValue(field, "fill")) {
      // Only what would make the button solid or unreadable is replaced.
      recipe = {};
      if (isOpaqueColor(config.backgroundColor)) { recipe.backgroundColor = "transparent"; }
      if (!trimmed(config.color).length || isWhiteColor(config.color)) { recipe.color = DESIGN_TOKENS.primary; }
    }
    if (!recipe) { return; }
    ["fill", "backgroundColor", "color"].forEach(function (key) {
      if (hasOwn(recipe, key) && !explicitConfigValue(field, key)) { config[key] = recipe[key]; }
    });
    var explicitBorder = (field.componentBoxStyle && hasOwn(field.componentBoxStyle, "border")) || (field.config && field.config.componentBoxStyle && hasOwn(field.config.componentBoxStyle, "border"));
    if (variant.length && !explicitBorder && (recipe.border || (config.componentBoxStyle && trimmed(config.componentBoxStyle.border).length))) {
      // A variant owns the button border: switching variants removes the previous one.
      config.componentBoxStyle = config.componentBoxStyle && typeof config.componentBoxStyle === "object" ? config.componentBoxStyle : {};
      config.componentBoxStyle.border = recipe.border || "";
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Spacing the compiler gives the new components of an application by role,
  // instead of the viewer's default white card (padding 20px 27px) around each.
  var FLAT_BLOCK = { margin: "0 0 16px 0", padding: "0", border: "0", backgroundColor: "transparent" };
  var ROLE_STYLES = {
    field: { boxStyle: FLAT_BLOCK },
    text: { boxStyle: FLAT_BLOCK },
    dataView: { boxStyle: { margin: "0 0 24px 0", padding: "16px", border: "1px solid " + DESIGN_TOKENS.border, borderRadius: "12px", backgroundColor: DESIGN_TOKENS.surface } },
    button: { boxStyle: { margin: "8px 0 16px 0", padding: "0", border: "0", backgroundColor: "transparent" } },
    actions: {
      boxStyle: { margin: "8px 0 24px 0", padding: "0", border: "0", backgroundColor: "transparent" },
      layoutChildrenStyle: { "default": { margin: "0", padding: "4px", border: "0", backgroundColor: "transparent" } }
    },
    row: {
      boxStyle: FLAT_BLOCK,
      // A gutter on the right of every column but the last one of its row.
      layoutChildrenStyle: { "default": { margin: "0 0 12px 0", padding: "0 12px 0 0", border: "0", backgroundColor: "transparent" }, last: { padding: "0" } }
    },
    section: {
      // The children keep a 12px bottom margin, hence the smaller bottom padding.
      boxStyle: { margin: "0 0 24px 0", padding: "16px 16px 4px 16px", border: "1px solid " + DESIGN_TOKENS.border, borderRadius: "12px", backgroundColor: DESIGN_TOKENS.surface },
      layoutChildrenStyle: { "default": { margin: "0 0 12px 0", padding: "0", border: "0", backgroundColor: "transparent" } }
    }
  };
  // Keys of a box style the viewer reads (getViewerItemBoxStyleRaw); it
  // silently ignores any other one. borderWidth/Style/Color are legacy keys
  // the editor still reads but removes when it writes a border.
  // Reduced field keys that live in config: compile copies them there, and nocode-form-edit moves them there
  // when a patch gives them at the root of the field (the viewer reads config.<key>).
  var REDUCED_CONFIG_KEYS = ["defaultValue", "position", "display_format", "picker_format", "min_datetime", "max_datetime", "date_less_than_today", "date_more_than_today", "cancelText", "okText", "returned_value", "sourceEnabled", "AutoSizeColumns", "deselectOnSecondClick", "label_color", "icon", "iconPosition", "backgroundColor", "color", "expand", "fill", "shape", "size", "justify", "align", "checkMandatoryInCurrentPage"];
  var REDUCED_STYLE_CONFIG_KEYS = ["componentDisabled", "boxStyle", "questionBoxStyle", "componentBoxStyle", "layoutChildrenStyle", "sticky"];
  var BOX_STYLE_KEYS = ["margin", "padding", "backgroundColor", "textColor", "textColorMode", "border", "borderTop", "borderRight", "borderBottom", "borderLeft", "borderRadius", "verticalAlign", "borderWidth", "borderStyle", "borderColor"];
  var BOX_STYLE_SUBSTITUTES = {
    side: "one margin or padding shorthand, for example margin: '8px 0 16px 0'",
    color: "textColor",
    font: "inline styles in the label or description HTML (the viewer imposes its font family)",
    none: "nothing: the viewer has no such box style"
  };
  function boxStyleSubstitute(key) {
    if (/^(margin|padding)(Top|Right|Bottom|Left|Block|Inline)/.test(key)) { return BOX_STYLE_SUBSTITUTES.side; }
    if (key === "color") { return BOX_STYLE_SUBSTITUTES.color; }
    if (/^(font|lineHeight|textAlign|textTransform|textDecoration|letterSpacing|whiteSpace)/.test(key)) { return BOX_STYLE_SUBSTITUTES.font; }
    return BOX_STYLE_SUBSTITUTES.none;
  }
  // The text color a box style gives, as the viewer resolves it
  // (getViewerResolvedTextColor): "" when none, "auto" for the computed one.
  function activeTextColor(style) {
    if (!style || typeof style !== "object") { return ""; }
    var color = trimmed(style.textColor), mode = trimmed(style.textColorMode).toLowerCase();
    if (["none", "unset", "default"].indexOf(mode) >= 0 || ["none", "unset"].indexOf(color.toLowerCase()) >= 0) { return ""; }
    if (!color.length) { return mode === "auto" ? "auto" : ""; }
    // Legacy: white text without a mode nor a background of its own is ignored.
    if (!mode.length && !trimmed(style.backgroundColor).length && isWhiteColor(color)) { return ""; }
    return color;
  }
  // Child types each container renders (itemLayoutViewer_Elem, itemCardViewer_Elem):
  // a layout renders nested layouts but no card, a card no layout, card or map.
  var CONTAINER_UNRENDERED_CHILDREN = { layout: ["ion-card", "card"], "ion-card": ["layout", "ion-card", "card", "map"], card: ["layout", "ion-card", "card", "map"] };
  // Components a container text color recolors (viewer rules on [style*="--c8o-box-text-color"]).
  var TEXT_COLOR_CONTROL_TYPES = ["button", "text", "select", "datetime", "time", "checkbox", "radio", "slider", "barcode", "file", "location", "radio_group", "checkbox_group", "signature", "grid"];
  var DATA_VIEW_TYPES = ["grid", "chart", "map", "gallery"];
  // what refresh_grid can reload: the viewer reloads the "sources" of its target; a map loads sourcesMarkers,
  // sourcesCircles... and is not reloaded by it
  var REFRESHABLE_TYPES = ["grid", "gallery", "chart"];
  var NO_ROLE_TYPES = ["ion-card", "card"];

  function hasStyleValues(style) {
    return !!style && typeof style === "object" && !Array.isArray(style) && Object.keys(style).some(function (key) {
      var value = style[key];
      return value != null && (typeof value === "object" ? hasStyleValues(value) : trimmed(value).length > 0);
    });
  }

  function explicitStyle(field, key) {
    return hasStyleValues(field[key]) || hasStyleValues(field.config && field.config[key]);
  }

  function styleRole(type, field, parentId) {
    if (field.__role) { return field.__role; }
    if (type === "layout") {
      var children = ensureArray(field.children || field.fields);
      return children.length && children.every(function (child) { return child && normalizeType(child.type) === "button"; }) ? "actions" : "row";
    }
    if (parentId != null || NO_ROLE_TYPES.indexOf(type) >= 0) { return null; }
    if (type === "description") { return "text"; }
    if (type === "button") { return "button"; }
    return DATA_VIEW_TYPES.indexOf(type) >= 0 ? "dataView" : "field";
  }

  // Fills only the empty values: prototype placeholders ("") and the button
  // wrapper defaults stay, a style the author wrote is never touched.
  function applyRoleStyles(target, field, parentId) {
    var role = ROLE_STYLES[styleRole(target.type, field, parentId)];
    if (!role) { return; }
    var config = target.config;
    if (role.boxStyle && parentId == null && !explicitStyle(field, "boxStyle")) {
      config.boxStyle = config.boxStyle && typeof config.boxStyle === "object" ? config.boxStyle : {};
      Object.keys(role.boxStyle).forEach(function (key) { if (!trimmed(config.boxStyle[key]).length) { config.boxStyle[key] = role.boxStyle[key]; } });
    }
    if (role.layoutChildrenStyle && !explicitStyle(field, "layoutChildrenStyle")) {
      config.layoutChildrenStyle = clone(role.layoutChildrenStyle, {});
    }
  }

  function layoutSizes(columns) {
    var sizes = [];
    for (var i = 0; i < 6; i++) { sizes.push({ size: i < columns ? Math.floor(12 / columns) : 0 }); }
    return sizes;
  }

  // Device columns a layout does not give would keep the prototype's (six
  // desktop columns, three on tablets, two on large phones): cols follows the
  // children (at most 4), tablets keep up to two of its columns, phones one.
  function deriveLayoutColumns(config, given, childCount) {
    if (!given("cols")) { config.cols = layoutSizes(Math.max(1, Math.min(4, childCount))); }
    var desktop = ensureArray(config.cols).filter(function (col) { return col && Number(col.size) > 0; });
    if (!given("tablet")) {
      config.tablet = desktop.length <= 2 ? desktop.map(function (col) { return { size: Number(col.size) }; }) : layoutSizes(2);
      while (config.tablet.length < 6) { config.tablet.push({ size: 0 }); }
    }
    if (!given("phoneL")) { config.phoneL = layoutSizes(1); }
    if (!given("phoneP")) { config.phoneP = layoutSizes(1); }
  }

  // section: a card with an optional h3 title; its fields in columns (one on
  // phones), a fullWidth field or a nested layout on a line of its own.
  function sectionToLayout(section) {
    var name = trimmed(section.name);
    if (!name.length) { throw new Error("A section needs a technical name"); }
    var columns = section.columns == null ? 2 : Number(section.columns);
    if ([1, 2, 3, 4].indexOf(columns) < 0) { throw new Error("section.columns must be 1, 2, 3 or 4"); }
    var layout = {};
    ["id", "visibleIf", "conditions", "componentDisabled", "boxStyle", "layoutChildrenStyle", "config"].forEach(function (key) { if (hasOwn(section, key)) { layout[key] = section[key]; } });
    layout.type = "layout";
    layout.name = name;
    layout.__role = "section";
    layout.cols = layoutSizes(1);
    layout.tablet = layoutSizes(1);
    layout.phoneL = layoutSizes(1);
    layout.phoneP = layoutSizes(1);
    var children = [];
    if (trimmed(section.title).length) {
      var html = "<h3 style=\"margin:0;font-size:1.125rem;line-height:1.4;color:" + DESIGN_TOKENS.text + "\">" + escapeHtml(trimmed(section.title)) + "</h3>";
      if (trimmed(section.subtitle).length) {
        html += "<p style=\"margin:2px 0 0 0;color:" + DESIGN_TOKENS.muted + "\">" + escapeHtml(trimmed(section.subtitle)) + "</p>";
      }
      children.push({ type: "description", name: name + "_title", description: html });
    }
    var row = null;
    var rowCount = 0;
    ensureArray(section.fields || section.children).forEach(function (child) {
      if (!child || typeof child !== "object") { return; }
      var childType = normalizeType(child.type);
      if (columns === 1 || boolLike(child.fullWidth) || childType === "layout" || childType === "section") {
        row = null;
        children.push(child);
        return;
      }
      if (!row) {
        rowCount++;
        row = { type: "layout", name: name + "_row" + rowCount, __role: "row", cols: layoutSizes(columns), tablet: layoutSizes(Math.min(columns, 2)), phoneL: layoutSizes(1), phoneP: layoutSizes(1), children: [] };
        children.push(row);
      }
      row.children.push(child);
    });
    layout.children = children;
    return layout;
  }

  // page.header: { title, subtitle } becomes the first block of the page: a
  // page title distinct from the form name, without a card around it.
  function pageHeaderField(page) {
    var header = page && page.header;
    if (header == null) { return null; }
    if (typeof header === "string") { header = { title: header }; }
    if (typeof header !== "object" || Array.isArray(header) || !trimmed(header.title)) { throw new Error("page.header needs a title"); }
    var html = "<h2 style=\"margin:0;font-size:1.5rem;line-height:1.3;color:" + DESIGN_TOKENS.text + "\">" + escapeHtml(trimmed(header.title)) + "</h2>";
    if (trimmed(header.subtitle)) {
      html += "<p style=\"margin:4px 0 0 0;color:" + DESIGN_TOKENS.muted + "\">" + escapeHtml(trimmed(header.subtitle)) + "</p>";
    }
    var slug = trimmed(page.name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    return {
      type: "description",
      // Without a usable slug the compiler names the block after its id.
      name: trimmed(header.name) || (slug.length ? "header_" + slug : ""),
      description: html,
      boxStyle: { margin: "0 0 16px 0", padding: "0", border: "0", backgroundColor: "transparent" }
    };
  }

  // The page description as the block No Code Studio's 1.0.17 migration makes of a page desc.
  function pageDescriptionField(page, html) {
    var slug = trimmed(page.name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    return { type: "description", name: slug.length ? "description_" + slug : "", description: html };
  }

  function normalizeConditionOperator(value) {
    var text = trimmed(value);
    var operator = hasOwn(CONDITION_OPERATOR_ALIASES, text.toLowerCase()) ? CONDITION_OPERATOR_ALIASES[text.toLowerCase()] : text;
    if (CONDITION_OPERATORS.indexOf(operator) < 0) { throw new Error("Unknown condition operator: " + text + " (use " + CONDITION_OPERATORS.join(", ") + ")"); }
    return operator;
  }

  function isNativeConditionGroup(spec) {
    return !Object.keys(spec).length || ["conds", "cond", "groups", "condVisible", "type", "__legacyConds", "__uiMode"].some(function (key) { return hasOwn(spec, key); });
  }

  // Reduced condition: { field, operator, value }, { all: [...] }, { any: [...] }
  // or { never: true }. field names are resolved to ids once the form is built.
  function compileConditionGroup(spec) {
    if (spec == null || typeof spec !== "object" || Array.isArray(spec)) { throw new Error("A condition must be an object"); }
    if (isNativeConditionGroup(spec)) { return clone(spec, spec); }
    var group = { type: "visibleIf", condVisible: "and", conds: [], groups: [] };
    if (hasOwn(spec, "never")) {
      if (hasOwn(spec, "field") || hasOwn(spec, "all") || hasOwn(spec, "any")) { throw new Error("never cannot be combined with other conditions"); }
      // { never: false } is no condition: always visible.
      if (boolLike(spec.never)) { group.conds.push({ type: "visibleIf", subject: "never_visible" }); }
      return group;
    }
    var items;
    if (hasOwn(spec, "all") || hasOwn(spec, "any")) {
      if (hasOwn(spec, "all") && hasOwn(spec, "any")) { throw new Error("A condition group uses all or any, not both"); }
      group.condVisible = hasOwn(spec, "any") ? "or" : "and";
      items = ensureArray(hasOwn(spec, "any") ? spec.any : spec.all);
      if (!items.length) { throw new Error("A condition group needs at least one condition"); }
    } else {
      items = [spec];
    }
    items.forEach(function (item) {
      if (item && typeof item === "object" && !Array.isArray(item) && (hasOwn(item, "all") || hasOwn(item, "any") || hasOwn(item, "never") || isNativeConditionGroup(item))) {
        group.groups.push(compileConditionGroup(item));
        return;
      }
      group.conds.push(compileCondition(item));
    });
    return group;
  }

  function compileCondition(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) { throw new Error("A condition must be an object"); }
    var name = trimmed(item.field);
    if (!name.length) { throw new Error("A condition needs the technical name of a field"); }
    var operator = normalizeConditionOperator(item.operator);
    var unary = UNARY_CONDITION_OPERATORS.indexOf(operator) >= 0;
    if (!unary && (!hasOwn(item, "value") || item.value == null || item.value === "" || (Array.isArray(item.value) && !item.value.length))) {
      // The viewer ignores a comparison without a value.
      throw new Error("Condition operator " + operator + " needs a value; use is_empty or is_filled to test an empty field");
    }
    var val2 = { str: "", source: false, type: "text", arr: [], html: false };
    if (!unary) {
      if (Array.isArray(item.value)) { val2.arr = item.value.map(function (v) { return String(v); }); }
      else { val2.str = item.value == null ? "" : String(item.value); }
    }
    return {
      type: "visibleIf",
      subject: "field",
      val1: { name: name, displayName: name, str: name, source: true, type: "", arr: [], __ref: name },
      val2: val2,
      operator: operator
    };
  }

  function eachConditionGroup(form, visit) {
    ensureArray(form.formulaire).forEach(function (item, index) {
      var conditions = item && item.conditions;
      if (!conditions || typeof conditions !== "object") { return; }
      ["visibleIf", "buttonStateIf", "goToPageIf"].forEach(function (key) {
        if (conditions[key] && typeof conditions[key] === "object") { visit(conditions[key], "/formulaire/" + index + "/conditions/" + key, item); }
      });
    });
    ensureArray(form.flows).forEach(function (flow, fi) {
      ensureArray(flow && flow.elements).forEach(function (element, ei) {
        var selfVar = element && element.type === "if_else" && element.sources && element.sources.self && element.sources.self.vars && element.sources.self.vars.selfVar;
        if (selfVar && typeof selfVar === "object") {
          visit({ conds: ensureArray(selfVar.conds || selfVar.cond), groups: ensureArray(selfVar.groups) }, "/flows/" + fi + "/elements/" + ei + "/sources/self/vars/selfVar", element);
        }
      });
    });
  }

  function eachCondition(group, path, visit) {
    ensureArray(group && group.conds).forEach(function (cond, index) { visit(cond, path + "/conds/" + index); });
    ensureArray(group && group.groups).forEach(function (child, index) { eachCondition(child, path + "/groups/" + index, visit); });
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

  var ROOT_DEVICES = ["desktop", "tablet", "phoneL", "phoneP"];
  // Root spacing of an application (custom or tab navigation): the page tab
  // bar already takes horizontal room, the creation margins of the editor
  // (100/60/10px) would only narrow the content.
  var APP_ROOT_SPACING = {
    desktop: { horizontalMargin: { unit: "px", value: "32" }, width: { unit: "px", value: "1280" }, padding: { unit: "px", value: "24" } },
    tablet: { horizontalMargin: { unit: "px", value: "16" }, width: { unit: "%", value: "100" }, padding: { unit: "px", value: "20" } },
    phoneL: { horizontalMargin: { unit: "px", value: "0" }, width: { unit: "%", value: "100" }, padding: { unit: "px", value: "12" } },
    phoneP: { horizontalMargin: { unit: "px", value: "0" }, width: { unit: "%", value: "100" }, padding: { unit: "px", value: "12" } }
  };
  // Largest horizontalMargin (px) an application keeps without a wide_page_margin warning.
  var APP_MARGIN_LIMITS = { desktop: 48, phoneL: 16, phoneP: 16 };

  function defaultRootConfig(application) {
    var config = {
      // padding: inner margin of the page content, denser on phones (the viewer uses 24px without it).
      desktop: { horizontalMargin: { unit: "px", value: "100" }, width: { unit: "px", value: "1280" }, "font-size": { unit: "px", value: "16" }, padding: { unit: "px", value: "24" } },
      tablet: { horizontalMargin: { unit: "px", value: "60" }, width: { unit: "px", value: "940" }, "font-size": { unit: "px", value: "16" }, padding: { unit: "px", value: "20" } },
      phoneL: { horizontalMargin: { unit: "px", value: "10" }, width: { unit: "%", value: "100" }, "font-size": { unit: "px", value: "16" }, padding: { unit: "px", value: "12" } },
      phoneP: { horizontalMargin: { unit: "px", value: "10" }, width: { unit: "%", value: "100" }, "font-size": { unit: "px", value: "16" }, padding: { unit: "px", value: "12" } }
    };
    return application ? mergeRootConfig(config, APP_ROOT_SPACING) : config;
  }

  // Merges a reduced root config over defaults, device by device and key by
  // key: { desktop: { horizontalMargin: { unit: "px", value: 32 } } } changes
  // that value only. Numeric values are written as strings, as the editor does.
  function mergeRootConfig(defaults, given) {
    var out = clone(defaults, {}) || {};
    if (!given || typeof given !== "object" || Array.isArray(given)) { return out; }
    Object.keys(given).forEach(function (key) {
      var value = given[key];
      if (ROOT_DEVICES.indexOf(key) < 0 || !value || typeof value !== "object" || Array.isArray(value)) {
        out[key] = clone(value, value);
        return;
      }
      var device = out[key] && typeof out[key] === "object" ? out[key] : (out[key] = {});
      Object.keys(value).forEach(function (setting) {
        var entry = clone(value[setting], value[setting]);
        if (entry && typeof entry === "object" && typeof entry.value === "number") { entry.value = String(entry.value); }
        device[setting] = entry;
      });
    });
    return out;
  }

  function defaultDoc(reduced, application) {
    var random = "assets/images/svg/imgplaceholder/placeholder0.svg";
    return {
      name: trimmed(reduced.name || reduced.question) || "Untitled form",
      descform: trimmed(reduced.description),
      namePosition: "text-center",
      descformPosition: "text-left",
      respNameRequired: false,
      // No Code Studio migrates a form older than its own version when it opens it and saves the result. From 1.0.16
      // its migration turns each page desc into a description block and sets isNameDisplayed=true on every other
      // page: the form name came back in a title card on all the pages of a compiled application (22/10 on
      // test-nocode, revealed forms). The compiler does that migration itself (compileReduced); the later ones only
      // fill navigation defaults and still run.
      technicalVersion: "1.0.17",
      lang: trimmed(reduced.language) || "en",
      loopToForm: true,
      progressIndicator: false,
      wallpaper: reduced.backgroundColor ? { enabled: true, index: 0, random: random, type: "color", link: null, color: String(reduced.backgroundColor) } : { link: null, enabled: false, index: null, random: random },
      thumbnail: reduced.thumbnailImage ? { enabled: true, index: 0, type: "custom" } : (reduced.thumbnailColor ? { enabled: true, index: 0, type: "color", color: String(reduced.thumbnailColor) } : { enabled: false, index: null, random: random }),
      config: mergeRootConfig(defaultRootConfig(application === true), reduced.config),
      pages: [],
      formulaire: [],
      flows: [{ id: "formulas", elements: [] }, { id: "submit", elements: [] }],
      actions: []
    };
  }

  var DATA_VIEW_TYPES = ["grid", "gallery", "chart", "map"];

  function isPrototypeQuestion(html) {
    return typeof html === "string" && /^exemple de question[.!?]?$/i.test(trimmed(html.replace(/<[^>]*>/g, "")));
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
    } else if (hasOwn(PROTOTYPE_PLACEHOLDERS, target.type) && target.config.placeholder === PROTOTYPE_PLACEHOLDERS[target.type]) {
      // The prototype text would be shown to end users as a hint.
      target.config.placeholder = "";
    }
    copyConfigValues(target, field, REDUCED_CONFIG_KEYS);
    copyConfigValues(target, field, REDUCED_STYLE_CONFIG_KEYS);
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
    applyFieldConditions(target, field);
  }

  // Native condition groups are kept as they are; reduced conditions
  // ({ field, operator, value }, all/any, never) are compiled to them.
  function applyFieldConditions(target, field) {
    if (field.conditions && typeof field.conditions === "object" && !Array.isArray(field.conditions)) {
      target.conditions = clone(field.conditions, {});
      ["visibleIf", "buttonStateIf"].forEach(function (key) {
        if (target.conditions[key] != null) { target.conditions[key] = compileConditionGroup(target.conditions[key]); }
      });
    }
    if (field.visibleIf != null || field.goToPageIf != null || field.buttonStateIf != null || field.disabledIf != null) {
      target.conditions = target.conditions && typeof target.conditions === "object" && !Array.isArray(target.conditions) ? target.conditions : {};
      if (field.visibleIf != null) {
        target.conditions.visibleIf = compileConditionGroup(field.visibleIf);
      }
      if (field.goToPageIf != null) {
        target.conditions.goToPageIf = clone(field.goToPageIf, field.goToPageIf);
      }
      if (field.buttonStateIf != null) {
        target.conditions.buttonStateIf = compileConditionGroup(field.buttonStateIf);
      }
      if (field.disabledIf != null) {
        var disabledIf = compileConditionGroup(field.disabledIf);
        if (disabledIf && typeof disabledIf === "object" && !Array.isArray(disabledIf)) {
          disabledIf.__uiMode = "button_state_disabled_when_condition";
        }
        target.conditions.buttonStateIf = disabledIf;
      }
    }
  }

  // A new select or checkbox list has no answer chosen, like the C8Oforms prototypes; a radio list has its first
  // option chosen, like the radio prototype. Explicit option objects keep their selected flag.
  function optionChildren(values, firstSelected) {
    var out = [];
    var list = ensureArray(values);
    for (var i = 0; i < list.length; i++) {
      var current = list[i];
      if (current && typeof current === "object") {
        var child = clone(current, {});
        child.id = child.id != null ? String(child.id) : String(nextId());
        if (child.selected == null) {
          child.selected = firstSelected !== false && i === 0;
        }
        if (child.position == null) {
          child.position = "unset";
        }
        out.push(child);
      } else {
        out.push({ value: String(current), selected: firstSelected !== false && i === 0, label_color: "#202124", position: "unset", id: String(nextId()) });
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
    if (element.saveTo != null || element.deleteFrom != null) {
      if (type !== "submit") { throw new Error(out.name + ": saveTo and deleteFrom belong to a submit element"); }
      out.__reducedSave = { saveTo: element.saveTo, deleteFrom: element.deleteFrom };
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
    delete out.saveTo;
    delete out.deleteFrom;
    if (out.actions) { out.actions = normalizeRequestableEntries(clone(out.actions, {})); }
    copyConfigValues(out, element, ["condition", "operator", "message", "target", "page", "flow", "delay", "loopSource", "itemName"]);
    copyConfigValues(out, element, ["targetPage", "targetGrid", "position", "duration", "color", "closeBtn", "scope", "targetElement"]);
    if (type === "toast") {
      // The viewer reads selfVar, not message/config.message. Explicit sources win.
      if (!hasOwn(element, "sources")) {
        var message = hasOwn(element, "message") ? element.message : (hasOwn(element, "text") ? element.text : element.config && element.config.message);
        out.sources = { self: { enabled: true, vars: { selfVar: { str: message == null ? "" : String(message), type: "text", html: false } } } };
      }
      delete out.message;
      out.config = out.config || {};
      delete out.config.message;
      // Named colors become readable hex values; no color means success.
      out.config.color = explicitConfigValue(element, "color") ? normalizeToastColor(out.config.color) : TOAST_COLORS.success;
    }
    if (type === "reset_fields") {
      out.config = out.config || {};
      var scope = trimmed(out.config.scope).toLowerCase();
      var resetScopes = { app: "application", form: "application", element: "component", field: "component" };
      if (hasOwn(resetScopes, scope)) { scope = resetScopes[scope]; }
      if (hasOwn(element, "targetField")) { out.config.targetElement = element.targetField; }
      if (!explicitConfigValue(element, "scope")) {
        scope = trimmed(out.config.targetElement).length ? "component" : (trimmed(out.config.targetPage).length ? "page" : "application");
      }
      out.config.scope = scope;
    }
    if (type === "if_else" && hasOwn(element, "condition")) {
      var group = compileConditionGroup(element.condition);
      // A native if_else condition (as read back) lists its conditions in cond.
      out.sources = { self: { enabled: true, vars: { selfVar: { str: "", type: "condition", cond: ensureArray(group.conds || group.cond), condVisible: group.condVisible || "and", groups: ensureArray(group.groups) } } } };
      if (out.config) { delete out.config.condition; }
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

  // An element and the elements of its then/else branches, children after
  // their parent in the flow (the viewer only starts elements without parentRef).
  function compileFlowElements(element, catalogByType) {
    var out = compileFlowElement(element, catalogByType);
    if (!out) { return []; }
    var all = [out];
    if (out.type !== "if_else") {
      if (hasOwn(element, "then") || hasOwn(element, "else")) { throw new Error("then/else branches belong to an if_else element"); }
      return all;
    }
    [["then", "childrenRefs"], ["else", "childrenRefsElse"]].forEach(function (branch) {
      if (!hasOwn(element, branch[0])) { return; }
      out[branch[1]] = ensureArray(out[branch[1]]);
      ensureArray(element[branch[0]]).forEach(function (childInput) {
        var children = compileFlowElements(childInput, catalogByType);
        if (!children.length) { return; }
        children[0].parentRef = out.id;
        out[branch[1]].push(children[0].id);
        all = all.concat(children);
      });
    });
    return all;
  }

  var TABLE_SOURCE_TYPES = ["grid", "chart", "map", "gallery"];
  var CHOICE_SOURCE_TYPES = ["select", "radio", "checkbox"];

  // A SmartSource reference to the runtime value of a component, the encoding the editor writes in a source or an
  // action variable: an agent had to find it and choose the ids itself.
  function smartSourceReference(item, path) {
    var id = String(item.id);
    var payload = { c8otype: "path", c8opath: path, c8oPrettyPath: "", c8obuiltin: "false", fakeId: "fakeId" + id, c8oName: null };
    return "$$START" + id + JSON.stringify(payload) + "END" + id + "$$";
  }

  function listText(value) {
    return Array.isArray(value) ? value.map(function (item) { return trimmed(item); }).join(",") : trimmed(value);
  }

  // The reduced Baserow source and save shorthands, compiled to the UI-authored sources and backend actions:
  //   grid/chart/map/gallery  source: { table, columns, hidden, filter, sort, distinct, groupBy, aggregations }
  //   select/radio/checkbox   source: { table, field }              (the choices of a single select column)
  //                           source: { table, display, value, columns, filter, sort }   (the rows of a table)
  //   submit element          saveTo: { table, row, values }        (forms_AddRow, or forms_AddRowFromData with values)
  //                           deleteFrom: { table, row }            (forms_DeleteRow)
  // table is the id or the path Workspace~>Base~>Table of a table of the user's catalog, or { id, path }; row names a
  // grid whose selected row is updated or deleted; a value or a filter value naming a field, or { field, path },
  // reads that field at runtime, { value } is a literal.
  function applyReducedBaserow(doc, options) {
    var opts = options || {};
    var sources = ensureArray(doc.formulaire).filter(function (item) { return item && item.__reducedSource; });
    var saves = [];
    ensureArray(doc.flows).forEach(function (flow) {
      ensureArray(flow && flow.elements).forEach(function (element) { if (element && element.__reducedSave) { saves.push(element); } });
    });
    if (!sources.length && !saves.length) { return; }
    var findTable = tableFinder(opts);
    function component(name, what) {
      var matches = ensureArray(doc.formulaire).filter(function (item) { return item && item.name === trimmed(name); });
      if (matches.length !== 1) { throw new Error(what + ": no single component named \"" + name + "\" in the form"); }
      return matches[0];
    }
    function fieldValue(value, what) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        if (hasOwn(value, "value")) { return value.value == null ? "" : String(value.value); }
        if (hasOwn(value, "field")) {
          var target = component(value.field, what);
          return smartSourceReference(target, [trimmed(target.name)].concat(ensureArray(value.path).map(String)).join("."));
        }
        throw new Error(what + ": give a field name, { field, path } or { value }");
      }
      if (typeof value === "string") {
        var named = component(value, what + " (a string names a field; write { value: \"" + value + "\" } for a literal)");
        return smartSourceReference(named, trimmed(named.name));
      }
      return value == null ? "" : String(value);
    }
    function rowReference(gridName, what) {
      var grid = component(gridName, what);
      if (grid.type !== "grid") { throw new Error(what + ": row names a grid, " + grid.name + " is a " + grid.type); }
      return smartSourceReference(grid, trimmed(grid.name) + ".id.value");
    }
    function filterCondition(spec, what) {
      if (!trimmed(spec.column).length || !trimmed(spec.operator).length) { throw new Error(what + ": a filter condition is { column, operator, value }"); }
      var operator = trimmed(spec.operator);
      var val2 = { type: operator === "boolean" ? "checkbox" : "text", str: "", html: false, arr: [] };
      if (Array.isArray(spec.value)) { val2.arr = spec.value.map(String); }
      else if (hasOwn(spec, "value")) { val2.str = fieldValueOrLiteral(spec.value, what); }
      return { val1: { name: trimmed(spec.column), displayName: trimmed(spec.column) }, val2: val2, operator: operator };
    }
    // In a filter a plain string is a literal (a search text, a choice); { field } reads a field.
    function fieldValueOrLiteral(value, what) {
      return value && typeof value === "object" && !Array.isArray(value) ? fieldValue(value, what) : (value == null ? "" : String(value));
    }
    function filterGroup(spec, what) {
      var group = { type: "filter", condVisible: "and", conds: [], groups: [] };
      var items = [spec];
      if (spec && Array.isArray(spec.all)) { items = spec.all; }
      else if (spec && Array.isArray(spec.any)) { group.condVisible = "or"; items = spec.any; }
      items.forEach(function (item) {
        if (item && (Array.isArray(item.all) || Array.isArray(item.any))) { group.groups.push(filterGroup(item, what)); }
        else { group.conds.push(filterCondition(item || {}, what)); }
      });
      return group;
    }
    function filterVariable(spec, what) {
      if (spec && (hasOwn(spec, "conds") || hasOwn(spec, "groups"))) {
        var native = clone(spec, {});
        if (!hasOwn(native, "str")) { native.str = ""; }
        if (!hasOwn(native, "html")) { native.html = false; }
        if (!hasOwn(native, "type")) { native.type = "filter"; }
        return native;
      }
      var group = filterGroup(spec, what);
      return { str: "", html: false, type: "filter", condVisible: group.condVisible, conds: group.conds, groups: group.groups };
    }
    function sortVariable(spec) {
      var conds = (Array.isArray(spec) ? spec : String(spec).split(",")).map(function (entry) {
        if (entry && typeof entry === "object") { return { name: trimmed(entry.name || entry.column), order: trimmed(entry.order) === "desc" ? "desc" : "asc" }; }
        var name = trimmed(entry);
        return name.charAt(0) === "-" ? { name: trimmed(name.substring(1)), order: "desc" } : { name: name, order: "asc" };
      }).filter(function (entry) { return entry.name.length; });
      return { str: "", html: false, type: "sort", conds: conds };
    }
    function plain(value) { return { str: value == null ? "" : String(value), html: false }; }

    sources.forEach(function (item) {
      var spec = item.__reducedSource;
      delete item.__reducedSource;
      var what = item.name + ".source";
      var table = findTable(spec.table, what);
      var columns = ensureArray(spec.columns).map(function (column) { return trimmed(column); }).filter(function (column) { return column.length; });
      var vars = {};
      var key;
      if (CHOICE_SOURCE_TYPES.indexOf(item.type) >= 0 && trimmed(spec.field).length) {
        key = "lib_BaseRow.formssource_GetFieldValues";
        vars.forms_config = plain(JSON.stringify({ table_id: table.id, columns: [trimmed(spec.field)] }));
      } else if (CHOICE_SOURCE_TYPES.indexOf(item.type) >= 0) {
        if (!trimmed(spec.display).length) { throw new Error(what + ": a choice list reads a column (field) or rows (display, value)"); }
        key = "lib_BaseRow.formssource_GetSelectData";
        var display = trimmed(spec.display);
        var valueColumn = trimmed(spec.value) || display;
        if (!columns.length) { columns = valueColumn === display ? [display] : [display, valueColumn]; }
        vars.forms_config = plain(JSON.stringify({ table_id: table.path, table_id_int: table.id, columns: columns, displayValue: display, value: valueColumn, hidden: ensureArray(spec.hidden), link_row_table_id: [] }));
        if (spec.filter != null) { vars.forms_Filter = filterVariable(spec.filter, what); }
        if (spec.sort != null) { vars.forms_tableSort = sortVariable(spec.sort); }
      } else if (TABLE_SOURCE_TYPES.indexOf(item.type) >= 0) {
        if (!columns.length) { throw new Error(what + ": columns lists the table columns to read"); }
        key = "lib_BaseRow.formssource_GetTableData";
        vars.forms_config = plain(JSON.stringify({ table_id: table.path, table_id_int: table.id, columns: columns, hidden: ensureArray(spec.hidden), link_row_table_id: [] }));
        if (spec.filter != null) { vars.forms_tableFilter = filterVariable(spec.filter, what); }
        if (spec.sort != null) { vars.forms_tableSort = sortVariable(spec.sort); }
        if (spec.distinct != null) { vars.forms_tableDistinct = plain(listText(spec.distinct)); }
        if (spec.groupBy != null) { vars.forms_tableGroupBy = plain(listText(spec.groupBy)); }
        if (spec.aggregations != null) { vars.forms_tableAggregations = plain(listText(spec.aggregations)); }
        if (item.type === "grid" && !ensureArray(item.config.columns).length) {
          item.config.columns = columns.map(function (column) { return { name: column, type: "text" }; });
        }
      } else {
        throw new Error(what + ": a " + item.type + " has no Baserow source");
      }
      item.sources = item.sources && typeof item.sources === "object" ? item.sources : {};
      item.sources[key] = { enabled: true, fullsync: false, vars: vars };
    });

    saves.forEach(function (element) {
      var spec = element.__reducedSave;
      delete element.__reducedSave;
      element.actions = element.actions && typeof element.actions === "object" ? element.actions : {};
      if (spec.saveTo != null) {
        var save = spec.saveTo;
        var what = element.name + ".saveTo";
        var target = findTable(save.table, what);
        var vars = {
          forms_config: plain(JSON.stringify({ table_id: target.path, table_id_int: target.id, link_row_table_id: [] })),
          forms_id: plain(save.row != null ? rowReference(save.row, what) : ""),
          forms_createColumn: plain("false")
        };
        var actionKey = "lib_BaseRow.forms_AddRow";
        if (save.values != null) {
          if (typeof save.values !== "object" || Array.isArray(save.values)) { throw new Error(what + ": values maps column names to a field name, { field, path } or { value }"); }
          var free = {};
          Object.keys(save.values).forEach(function (column) { free[column] = fieldValue(save.values[column], what + "." + column); });
          vars.forms_freeVars = freeVarsList(free);
          actionKey = "lib_BaseRow.forms_AddRowFromData";
        }
        element.actions[actionKey] = { enabled: true, fullsync: false, vars: vars };
      }
      if (spec.deleteFrom != null) {
        var removal = spec.deleteFrom;
        var removeWhat = element.name + ".deleteFrom";
        if (removal.row == null) { throw new Error(removeWhat + ": row names the grid whose selected row is deleted"); }
        var removed = findTable(removal.table, removeWhat);
        element.actions["lib_BaseRow.forms_DeleteRow"] = { enabled: true, fullsync: false, vars: {
          forms_config: plain(JSON.stringify({ table_id: removed.path, table_id_int: removed.id, link_row_table_id: [] })),
          forms_id: plain(rowReference(removal.row, removeWhat))
        } };
      }
    });
  }

  // { id, path } of a table named by its id, its path or both; the user's catalog completes what is missing.
  function tableFinder(options) {
    var index = Array.isArray(options.tableIndex) ? options.tableIndex : null;
    function catalog() {
      if (index) { return index; }
      try {
        if ((typeof C8O.nocodeBaserow === "undefined" || !C8O.nocodeBaserow.tableIndex) && typeof include === "function") {
          include("js/nocode_baserow.js");
        }
        index = typeof C8O.nocodeBaserow !== "undefined" && C8O.nocodeBaserow.tableIndex ? C8O.nocodeBaserow.tableIndex(options.token) : null;
      } catch (_ignoreCatalog) {
        index = null;
      }
      index = index || [];
      return index;
    }
    return function (ref, what) {
      var id = null;
      var path = "";
      if (ref && typeof ref === "object" && !Array.isArray(ref)) { id = ref.id; path = trimmed(ref.path); }
      else if (typeof ref === "number" || /^\d+$/.test(trimmed(ref))) { id = ref; }
      else { path = trimmed(ref); }
      id = id == null || trimmed(id) === "" ? null : Number(id);
      if (id != null && path.length) { return { id: id, path: path }; }
      if (id == null && !path.length) { throw new Error(what + ": table is the id or the path Workspace~>Base~>Table of a table of nocode-baserow-catalog-list"); }
      var found = catalog().filter(function (table) { return id != null ? Number(table.id) === id : table.path.toLowerCase() === path.toLowerCase(); });
      if (found.length !== 1) {
        throw new Error(what + ": table " + (id != null ? id : path) + " is not in the Baserow catalog of the authenticated user (nocode-baserow-catalog-list)" + (catalog().length ? "" : "; with nocode-form-compile alone, give { id, path }"));
      }
      return { id: Number(found[0].id), path: found[0].path };
    };
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
    var refreshTargets = doc.formulaire.filter(function (item) { return REFRESHABLE_TYPES.indexOf(item.type) >= 0; });
    doc.flows.forEach(function (flow) {
      ensureArray(flow.elements).forEach(function (element) {
        var config = element.config || {};
        if (element.type === "push_page") { config.targetPage = resolve(config.targetPage, doc.pages, "pageTechName"); }
        if (["add_row_to_local_grid", "remove_row_from_local_grid"].indexOf(element.type) >= 0) {
          config.targetGrid = resolve(config.targetGrid, grids, "id");
        }
        if (element.type === "refresh_grid") {
          config.targetGrid = resolve(config.targetGrid, refreshTargets, "id");
        }
        if (element.type === "reset_fields") {
          if (trimmed(config.targetPage).length) { config.targetPage = resolve(config.targetPage, doc.pages, "pageTechName"); }
          if (trimmed(config.targetElement).length) { config.targetElement = resolve(config.targetElement, doc.formulaire, "id"); }
        }
      });
    });
    // Reduced conditions name a field (or a formula); the viewer reads its id
    // and needs its component type to choose the comparison.
    var formulas = [];
    doc.flows.forEach(function (flow) {
      ensureArray(flow.elements).forEach(function (element) { if (element && element.type === "business_logic") { formulas.push(element); } });
    });
    eachConditionGroup(doc, function (group, path) {
      eachCondition(group, path, function (cond) {
        var ref = cond && cond.val1 && cond.val1.__ref;
        if (ref == null) { return; }
        var matches = doc.formulaire.filter(function (item) { return item && item.name === ref; });
        if (!matches.length) { matches = formulas.filter(function (item) { return item.name === ref; }); }
        if (matches.length !== 1) { return; } // Validation reports it.
        cond.val1.str = String(matches[0].id);
        cond.val1.type = matches[0].type;
        delete cond.val1.__ref;
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

  // options.roleStyles: the spacing of an application (custom or tab
  // navigation) is given to new components that carry no style of their own.
  function compileField(field, pageTechName, catalogByType, formulaire, parentId, options) {
    if (!field || typeof field !== "object") {
      return null;
    }
    var opts = options || {};
    if (normalizeType(field.type) === "section") {
      field = sectionToLayout(field);
    }
    var type = normalizeType(field.type);
    var proto = catalogByType[type];
    if (!proto) {
      throw new Error("Unsupported form component type: " + type);
    }
    if ((type === "ion-card" || type === "card") && (ensureArray(field.children).length || ensureArray(field.fields).length)) {
      throw new Error("ion-card children are not compiled by the reduced contract and would be lost: use a section (a titled card of fields) or a layout");
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
    if (DATA_VIEW_TYPES.indexOf(type) >= 0 && isPrototypeQuestion(out.config.html) && field.label == null && field.description == null
        && !(field.config && (hasOwn(field.config, "html") || hasOwn(field.config, "label")))) {
      // A list or a chart without a label showed "Exemple de question" above it.
      out.config.html = "";
    }
    if (type === "button") {
      // The prototype's icon (bulb) would show on every button.
      if (!hasOwn(field, "icon") && !(field.config && hasOwn(field.config, "icon"))) { out.config.icon = ""; }
      if (opts.explicitMandatoryChecks && (hasOwn(field, "checkMandatoryInCurrentPage") || (field.config && hasOwn(field.config, "checkMandatoryInCurrentPage")))) {
        opts.explicitMandatoryChecks[String(out.id)] = true;
      }
      applyButtonVariant(out, field);
      out.config.boxStyle = out.config.boxStyle || {};
      // Only new buttons receive these defaults; explicit custom surfaces win.
      if (!trimmed(out.config.boxStyle.backgroundColor)) { out.config.boxStyle.backgroundColor = "transparent"; }
      if (!trimmed(out.config.boxStyle.border)) { out.config.boxStyle.border = "0"; }
    }
    if (opts.roleStyles === true || field.__role === "section" || field.__role === "row") {
      // A section and its rows are always styled: that is what they are for.
      applyRoleStyles(out, field, parentId);
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
      deriveLayoutColumns(out.config, function (key) { return hasOwn(field, key) || !!(field.config && hasOwn(field.config, key)); }, children.length);
      formulaire.push(out);
      for (var i = 0; i < children.length; i++) {
        var child = compileField(children[i], pageTechName, catalogByType, formulaire, out.id, opts);
        if (child) {
          out.childrenRefs.push(child.id);
        }
      }
      return out;
    }
    if ((type === "radio" || type === "checkbox" || type === "select") && field.values != null) {
      out.children = optionChildren(field.values, type === "radio");
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
    } else if (type === "grid") {
      // The prototype's columns (Make, Model, Price) would stay in a grid given none: take the columns of its Baserow
      // source, else none (a local grid without columns is then reported).
      out.config.columns = [];
    }
    if (field.source != null) {
      // A reduced Baserow source ({ table, columns, filter, sort... }): built by applyReducedBaserow once every
      // component has its id, since a filter can read another field.
      if (field.sources != null) { throw new Error(out.name + ": give source (reduced) or sources (native), not both"); }
      if (!field.source || typeof field.source !== "object" || Array.isArray(field.source)) { throw new Error(out.name + ": source must be an object { table, columns, ... }"); }
      out.__reducedSource = clone(field.source, {});
      out.config.sourceEnabled = true;
      if (CHOICE_SOURCE_TYPES.indexOf(type) >= 0 && field.values == null) { out.children = []; }
    }
    if (field.sources) {
      out.sources = normalizeRequestableEntries(clone(field.sources, {}));
      if (type === "grid" && field.columns == null) {
        var gridSource = out.sources["lib_BaseRow.formssource_GetTableData"];
        var gridConfig = null;
        try { gridConfig = gridSource && gridSource.vars && gridSource.vars.forms_config ? JSON.parse(gridSource.vars.forms_config.str) : null; } catch (_ignoreGridConfig) { gridConfig = null; }
        out.config.columns = gridConfig && Array.isArray(gridConfig.columns) ? gridConfig.columns.map(function (column) { return { name: String(column), type: "text" }; }) : [];
      }
    }
    if (field.actions) {
      out.actions = normalizeRequestableEntries(clone(field.actions, {}));
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
    var pages = ensureArray(input.pages);
    if (!pages.length) {
      pages = [{ name: "Page 1", fields: ensureArray(input.fields) }];
    }
    var useTabMode = tabModeFor(input, pages.length);
    // An application gets the narrow root margins of APP_ROOT_SPACING.
    var doc = defaultDoc(input, input.navigationMode === "custom" || useTabMode);
    if (hasOwn(input, "titleDisplay")) {
      if (["form", "page", "none"].indexOf(input.titleDisplay) < 0) { throw new Error("titleDisplay must be form, page or none"); }
      doc.config.titleDisplay = input.titleDisplay;
    }
    // Applications (custom or tab navigation) get role spacing; a linear
    // questionnaire keeps the card around each question.
    var fieldOptions = { roleStyles: input.styleDefaults !== false && (input.navigationMode === "custom" || useTabMode), explicitMandatoryChecks: {} };
    for (var p = 0; p < pages.length; p++) {
      var page = pageDefaults(pages[p], p, useTabMode);
      if (input.navigationMode === "custom") {
        page.enabledTab = false;
        page.enabledButtons = false;
        // The viewer repeats the form name in a title card on every page that
        // does not set this flag; a custom application gives each page a header.
        if (!hasOwn(pages[p], "isNameDisplayed")) { page.isNameDisplayed = false; }
      }
      // A 1.0.17 document has no page desc: like the editor's migration, it becomes the first block after the header
      // and the page drops the title card.
      var pageDescription = page.desc;
      delete page.desc;
      if (pageDescription.length && !hasOwn(pages[p], "isNameDisplayed")) { page.isNameDisplayed = false; }
      doc.pages.push(page);
      var fields = ensureArray(pages[p].fields || pages[p].formulaire || pages[p].components);
      if (pageDescription.length) { fields = [pageDescriptionField(pages[p], pageDescription)].concat(fields); }
      var header = pageHeaderField(pages[p]);
      if (header) { fields = [header].concat(fields); }
      for (var f = 0; f < fields.length; f++) {
        compileField(fields[f], page.pageTechName, byType, doc.formulaire, null, fieldOptions);
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
        Array.prototype.push.apply(target.elements, compileFlowElements(elements[e], byType));
      }
    }
    if (input.tag != null) {
      doc.tag = Array.isArray(input.tag) ? input.tag : [String(input.tag)];
    }
    if (input.subTag != null) {
      doc.subTag = Array.isArray(input.subTag) ? input.subTag : [String(input.subTag)];
    }
    ensureButtonFlows(doc);
    applyReducedBaserow(doc, opts);
    // A button that submits checks the required fields of its page, unless the reduced JSON says otherwise.
    doc.formulaire.forEach(function (item) {
      if (!item || item.type !== "button" || fieldOptions.explicitMandatoryChecks[String(item.id)] === true) { return; }
      var buttonFlow = doc.flows.filter(function (flow) { return flow && flow.id === item.flow; })[0];
      if (buttonFlow && ensureArray(buttonFlow.elements).some(function (element) { return element && element.type === "submit"; })) {
        item.config.checkMandatoryInCurrentPage = true;
      }
    });
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
        // A form not saved yet (create refused before its first save) has no id to finalize either.
        var beforeFirstSave = opts.generation === true || !trimmed(form._id).length;
        warning(beforeFirstSave ? "baserow_identity_pending_creation" : "baserow_identity_incomplete", beforeFirstSave ? "Expected before creation: nocode-form-create automatically binds the saved form id, actual component ids and authenticated owner. Continue with create; do not invent identities or stop for this warning" : "Baserow identity is incomplete. For an unfinished creation, use nocode-form-edit with finalize_baserow_bindings on this saved id, not another create", path + "/vars/forms_config");
      } else if (form._id != null && String(binding.form_id) !== String(form._id)) {
        incomplete("baserow_form_identity_mismatch", "Baserow binding belongs to a different form; use the saved owning document id", path + "/vars/forms_config");
      }
      var freeVars = entry.vars.forms_freeVars;
      if (key === "lib_BaseRow.forms_AddRowFromData" && !(Array.isArray(freeVars) ? freeVars.length : (freeVars && trimmed(freeVars.str)))) {
        incomplete("missing_baserow_values", "Explicit Baserow save requires forms_freeVars mapping actual input values to columns", path + "/vars/forms_freeVars");
      } else if (key === "lib_BaseRow.forms_AddRowFromData") {
        var freeColumns = freeVarsColumns(freeVars);
        if (!freeColumns || !freeColumns.length || freeColumns.some(function (column) { return !column; })) {
          incomplete("invalid_baserow_values", "forms_freeVars lists { name: exact Baserow column, str: value or SmartSource }, or maps columns to values (saveTo.values of baserowShorthand writes it)", path + "/vars/forms_freeVars");
        } else if (!Array.isArray(freeVars)) {
          warning("freevars_text_shape", "forms_freeVars is JSON text: a quote in a value breaks it and No Code Studio empties it when the action is opened. Write it as { Column: value } or with saveTo.values, which store the editor's list", path + "/vars/forms_freeVars");
        }
      }
    }
    // parts: a layoutChildrenStyle scope also holds the questionBoxStyle and
    // componentBoxStyle of the children, as the editor writes them.
    function validateStyle(style, path, parts) {
      if (style == null) { return; }
      if (typeof style !== "object" || Array.isArray(style)) { issue("invalid_style_object", "Style must be an object of CSS string values", path); return; }
      Object.keys(style).forEach(function (property) {
        var value = style[property];
        if (parts === true && (property === "questionBoxStyle" || property === "componentBoxStyle")) { validateStyle(value, path + "/" + property); return; }
        if (BOX_STYLE_KEYS.indexOf(property) < 0) {
          incomplete("unsupported_style_key", "The viewer ignores the box style key " + property + ". Use " + boxStyleSubstitute(property) + ". Box style keys: " + BOX_STYLE_KEYS.slice(0, 12).join(", "), path + "/" + property);
          return;
        }
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
          if (element.type === "toast" && !isReadableToastColor(config.color)) {
            incomplete("unreadable_toast_color", "The viewer only reads a 6-digit hex toast color (for example " + TOAST_COLORS.success + "); any other value gives a transparent toast with white text. Use a hex color or success, danger, warning, info", path + "/config/color");
          }
          if (element.type === "toast" && isFinite(Number(config.duration)) && Number(config.duration) > 60) {
            warning("toast_duration_seconds", "Toast duration is in seconds: " + config.duration + " keeps the toast on screen for more than a minute", path + "/config/duration");
          }
          if (element.type === "reset_fields") {
            if (["application", "page", "component"].indexOf(config.scope || "application") < 0) {
              incomplete("invalid_reset_scope", "reset_fields scope must be application, page or component", path + "/config/scope");
            } else if (config.scope === "page" && trimmed(config.targetPage).length && !pageMap[String(config.targetPage)]) {
              incomplete("unknown_reset_target", "reset_fields must target an existing page (its unique name in reduced JSON)", path + "/config/targetPage");
            } else if (config.scope === "component" && !ids[String(config.targetElement)]) {
              incomplete("unknown_reset_target", "reset_fields with scope component must target an existing component (its unique name in reduced JSON)", path + "/config/targetElement");
            }
          }
          if (element.type === "if_else") {
            var branchCondition = value && value.type === "condition" ? ensureArray(value.conds || value.cond).concat(ensureArray(value.groups)) : [];
            if (!value || (value.type === "condition" && !branchCondition.some(function (cond) { return cond && (trimmed(cond.operator).length || cond.subject === "never_visible" || ensureArray(cond.conds).length || ensureArray(cond.groups).length); })) || (value.type !== "condition" && !trimmed(value.str))) {
              incomplete("empty_if_else_condition", "An if_else without a condition always runs its then branch. Give it a condition", path + "/sources/self/vars/selfVar");
            }
          }
          if (element.type === "submit" && !enabledEntries(element.actions).length) {
            incomplete("unconfigured_submit", "This submit step has no backend action, so its button saves nothing. A plain questionnaire stores its responses through the automatic submit of its last page: leave the custom button out. To save from a button, give the submit saveTo (a Baserow row, see quickReference.baserow.save) or an action, for example lib_Actions_C8Oforms.forms_notify_response_simple_by_mail_simple (an e-mail; backendActions section of nocode-form-contract-get)", path + "/actions");
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
            // refresh_grid reloads the source of any data view the viewer loads from its sources (performRefreshGrid):
            // a grid, a gallery or a chart; the local rows of add/remove belong to a grid
            if (!grid || (element.type === "refresh_grid" ? REFRESHABLE_TYPES.indexOf(grid.item.type) < 0 : grid.item.type !== "grid")) {
              issue("unknown_grid_target", element.type === "refresh_grid" ? "refresh_grid must target an existing grid, gallery or chart" : "Action must target an existing grid", path + "/config/targetGrid");
            }
            else if (element.type === "add_row_to_local_grid" && grid.item.config.sourceEnabled !== false) {
              incomplete("local_grid_action_on_source", "Local insertion requires sourceEnabled=false; use a backend action for persistent data", path);
            }
            if (element.type === "add_row_to_local_grid" && (!value || !trimmed(value.str))) {
              incomplete("missing_grid_row", "Local grid insertion needs an object-valued row source", path + "/sources");
            }
          }
        });
        // A flow that announces a success and empties the inputs without a submit loses the respondent's entry (23/10 on
        // test-nocode: an "Envoyer" button next to the questionnaire's own Envoyer button, the one that saves).
        var flowElements = ensureArray(flow.elements).filter(function (element) { return element && typeof element === "object"; });
        var announcesSuccess = flowElements.some(function (element) { return element.type === "toast" && String((element.config || {}).color || "").toUpperCase() === TOAST_COLORS.success.toUpperCase(); });
        if (announcesSuccess && flowElements.some(function (element) { return element.type === "reset_fields"; }) && !flowElements.some(function (element) { return element.type === "submit"; })) {
          incomplete("success_without_save", "This flow shows a success message and empties the inputs, but nothing saves them: the entry is lost. A questionnaire (navigationMode buttons) saves its responses with the viewer's own Envoyer button on its last page: leave this button out. To save from a button, put a submit with saveTo or an action before the toast", "/flows/" + idx);
        }
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
      var itemById = {}, childrenByParent = {};
      ensureArray(form.formulaire).forEach(function (item) {
        if (!item || typeof item !== "object" || item.id == null) { return; }
        itemById[String(item.id)] = item;
        if (item.parentRef != null) { (childrenByParent[String(item.parentRef)] = childrenByParent[String(item.parentRef)] || []).push(item); }
      });
      // The spacing a layout gives its children (layoutChildrenStyle), as the section the compiler builds does.
      function childSpacingFromParent(item) {
        var parent = item.parentRef != null ? itemById[String(item.parentRef)] : null;
        var styles = parent && parent.config && parent.config.layoutChildrenStyle;
        return !!styles && typeof styles === "object" && ["default", "first", "last"].some(function (scope) {
          return styles[scope] && (trimmed(styles[scope].margin).length || trimmed(styles[scope].padding).length);
        });
      }
      function descendants(item) {
        var out = [], queue = (childrenByParent[String(item.id)] || []).slice();
        while (queue.length && out.length < 500) {
          var next = queue.shift();
          out.push(next);
          queue = queue.concat(childrenByParent[String(next.id)] || []);
        }
        return out;
      }
      function isControl(item) { return TEXT_COLOR_CONTROL_TYPES.indexOf(item.type) >= 0 && !boolLike(item.config && item.config.componentDisabled); }
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
        if (item.type === "button" && !boolLike(config.componentDisabled) && ["outline", "clear"].indexOf(trimmed(config.fill)) >= 0) {
          if (isOpaqueColor(config.backgroundColor)) {
            warning("button_fill_overridden", "The viewer paints config.backgroundColor whatever the fill: this " + config.fill + " button renders solid. Use variant secondary/ghost or backgroundColor transparent", path + "/config/backgroundColor");
          } else if (isWhiteColor(config.color)) {
            warning("button_text_unreadable", "White text on a " + config.fill + " button with a transparent background is invisible on a light page. Use variant secondary/ghost or a dark text color", path + "/config/color");
          }
        }
        if (hasOwn(PROTOTYPE_PLACEHOLDERS, item.type) && !boolLike(config.componentDisabled) && trimmed(config.placeholder) === PROTOTYPE_PLACEHOLDERS[item.type]) {
          warning("prototype_placeholder", "End users see the prototype hint \"" + config.placeholder + "\". Set a useful placeholder or an empty one", path + "/config/placeholder");
        }
        if (item.type === "grid") {
          var gridColumns = ensureArray(config.columns);
          var gridSource = Object.keys(item.sources || {}).filter(function (key) { return /formssource_GetTableData$/.test(key) && boolLike(item.sources[key].enabled); })[0];
          if (gridSource) {
            var gridConfig = null;
            try { gridConfig = JSON.parse(item.sources[gridSource].vars.forms_config.str); } catch (_invalidGridConfig) { gridConfig = null; }
            if (gridConfig && Array.isArray(gridConfig.columns)) {
              var hiddenColumns = ensureArray(gridConfig.hidden).map(String);
              gridColumns = gridConfig.columns.filter(function (column) { return hiddenColumns.indexOf(String(column && column.name != null ? column.name : column)) < 0; });
            }
          }
          if (!boolLike(config.componentDisabled) && config.returned_value !== "all_the_data" && gridColumns.length > 5) {
            warning("wide_list_grid", "This grid shows " + gridColumns.length + " columns: it scrolls horizontally and long text makes tall rows. Show at most 5 short columns in a list and put the others (notes, descriptions) on the detail page", path);
          }
          if (config.sourceEnabled !== false && !enabledEntries(item.sources).length) { incomplete("grid_without_source", "Source-backed grid needs an enabled data source; use sourceEnabled=false for a local grid", path + "/sources"); }
          if (config.sourceEnabled !== false && enabledEntries(item.sources).indexOf("self") >= 0) { incomplete("invalid_grid_self_source", "Grid data needs a backend source or a local grid, not a scalar self source", path + "/sources/self"); }
          if (config.sourceEnabled === false && !ensureArray(config.columns).length) { issue("grid_without_columns", "Local grid needs columns", path + "/config/columns"); }
          if (config.sourceEnabled === false) { warning("local_grid_not_persistent", "Local grid rows disappear on reload. This cannot deliver business storage or tracking; bind a real source unless transient UI state is intended", path); }
        }
        ["boxStyle", "questionBoxStyle", "componentBoxStyle"].forEach(function (key) {
          validateStyle(config[key], path + "/config/" + key);
        });
        if (config.sticky != null && ["always", "notOnPhone"].indexOf(config.sticky) < 0) {
          issue("invalid_sticky", "sticky is always or notOnPhone (or absent)", path + "/config/sticky");
        }
        if (config.layoutChildrenStyle != null) {
          if (typeof config.layoutChildrenStyle !== "object" || Array.isArray(config.layoutChildrenStyle)) { issue("invalid_style_object", "layoutChildrenStyle must contain default/first/last style objects", path + "/config/layoutChildrenStyle"); }
          else { Object.keys(config.layoutChildrenStyle).forEach(function (scope) { validateStyle(config.layoutChildrenStyle[scope], path + "/config/layoutChildrenStyle/" + scope, true); }); }
        }
        if (item.type === "description" && /style\s*=/.test(config.html || "") && !(config.boxStyle && (config.boxStyle.margin || config.boxStyle.padding)) && !childSpacingFromParent(item)) {
          warning("html_spacing_without_container_style", "Styled HTML has no explicit Forms container spacing; check outer margin and avoid double padding", path + "/config/boxStyle");
        }
        var parentItem = item.parentRef != null ? itemById[String(item.parentRef)] : null;
        if (parentItem && hasOwn(CONTAINER_UNRENDERED_CHILDREN, parentItem.type) && CONTAINER_UNRENDERED_CHILDREN[parentItem.type].indexOf(item.type) >= 0) {
          incomplete("unrendered_nesting", "The viewer does not render a " + item.type + " inside a " + parentItem.type + ": " + item.name + " would not appear. Group fields with a layout or a section; a card only holds simple components", path + "/parentRef");
        }
        if (boolLike(config.componentDisabled)) { return; }
        if (item.type === "img") {
          ["width", "height"].forEach(function (key) {
            if (config[key] != null && trimmed(config[key]).length && !/^\d+(\.\d+)?%?$/.test(trimmed(config[key]))) {
              warning("image_size_unit", "Image " + key + " is a number of pixels ('240') or a percentage ('100%'): the image reads " + config[key] + " as a number of pixels", path + "/config/" + key);
            }
          });
        }
        if (item.type === "map" && config.minHeight != null && trimmed(config.minHeight).length && !/^\d+(\.\d+)?(px)?$/.test(trimmed(config.minHeight))) {
          warning("map_height_unit", "map minHeight is in pixels ('320' or '320px'): the viewer turns " + config.minHeight + " into px", path + "/config/minHeight");
        }
        var recolored = function (scopeItems) { return scopeItems.some(function (child) { return isControl(child) || descendants(child).some(isControl); }); };
        var ownTextColor = activeTextColor(config.boxStyle);
        if (ownTextColor && (isControl(item) || descendants(item).some(isControl))) {
          warning("container_text_color", "textColor " + ownTextColor + " on " + item.name + " is forced on the buttons, icons and inputs inside it: button labels lose their own color and inputs their light background. Keep textColor for text-only blocks, or color the text in the HTML", path + "/config/boxStyle/textColor");
        }
        if (config.layoutChildrenStyle && typeof config.layoutChildrenStyle === "object") {
          Object.keys(config.layoutChildrenStyle).forEach(function (scope) {
            var scoped = activeTextColor(config.layoutChildrenStyle[scope]);
            if (scoped && recolored(childrenByParent[String(item.id)] || [])) {
              warning("container_text_color", "layoutChildrenStyle." + scope + ".textColor " + scoped + " is forced on the buttons, icons and inputs of the children of " + item.name + ". Keep textColor for text-only children", path + "/config/layoutChildrenStyle/" + scope + "/textColor");
            }
          });
        }
      });
      var globalStyles = [{ owner: form.config, path: "/config", name: "the application" }].concat(ensureArray(form.pages).map(function (page, index) { return { owner: page && page.config, path: "/pages/" + index + "/config", name: "page " + (page && page.name) }; }));
      globalStyles.forEach(function (scope) {
        if (!scope.owner || typeof scope.owner !== "object") { return; }
        ["boxStyle", "questionBoxStyle", "componentBoxStyle"].forEach(function (key) { validateStyle(scope.owner[key], scope.path + "/" + key); });
        var box = scope.owner.boxStyle;
        if (box && typeof box === "object" && ["margin", "padding", "border", "backgroundColor"].some(function (key) { return trimmed(box[key]).length > 0; })) {
          warning("global_box_style", "The boxStyle of " + scope.name + " applies to every top-level component, to root layouts and cards and to the children of layouts, over their layoutChildrenStyle: spacing and borders add up. Style the components instead (role defaults)", scope.path + "/boxStyle");
        }
      });
      validateContextDefaults(form, issue, warning);
      eachConditionGroup(form, function (group, groupPath) {
        eachCondition(group, groupPath, function (cond, condPath) {
          if (!cond || typeof cond !== "object" || cond.subject !== "field") { return; }
          if (trimmed(cond.operator).length && CONDITION_OPERATORS.indexOf(cond.operator) < 0) {
            incomplete("invalid_condition_operator", "Unknown condition operator " + cond.operator + ": the viewer silently evaluates it as false. Use " + CONDITION_OPERATORS.join(", "), condPath + "/operator");
          }
          if (cond.val1 && cond.val1.__ref != null) {
            incomplete("unknown_condition_field", "Condition field must resolve to exactly one component or formula: " + cond.val1.__ref, condPath + "/val1");
          }
        });
      });
      var customPages = ensureArray(form.pages).filter(function (page) { return page && !boolLike(page.enabledTab) && !boolLike(page.enabledButtons); });
      if (customPages.length >= 2 && customPages.length === ensureArray(form.pages).length && customPages.filter(function (page) { return page.isNameDisplayed !== false; }).length >= 2) {
        warning("repeated_form_title", "The form name is repeated in a title card on every page. Set isNameDisplayed=false on the pages and give each one a page header (page.header or a description block)", "/pages");
      }
      // A page that shows the form name in its title card and opens on a header with the same title shows it twice.
      if (!form.config || ["page", "none"].indexOf(form.config.titleDisplay) < 0) {
        ensureArray(form.pages).forEach(function (page, idx) {
          if (!page || page.isNameDisplayed === false) { return; }
          var first = ensureArray(form.formulaire).filter(function (item) { return item && item.parentRef == null && item.config && item.config.page === page.pageTechName; })[0];
          var heading = first && first.type === "description" && /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(String(first.config.html || ""));
          var headingText = heading && heading[1].replace(/<[^>]+>/g, "").replace(/&#39;/g, "'").replace(/&quot;/g, "\"").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
          if (heading && trimmed(headingText).toLowerCase() === trimmed(form.name).toLowerCase()) {
            warning("repeated_title_in_header", "This page shows the form name in its title card, then the same title in its header block. Give the header another title (or none), or set isNameDisplayed=false on the page", "/pages/" + idx);
          }
        });
      }
      var formPages = ensureArray(form.pages);
      var applicationPages = formPages.length && (formPages.every(function (page) { return page && boolLike(page.enabledTab); }) || customPages.length === formPages.length);
      if (applicationPages && form.config && typeof form.config === "object") {
        Object.keys(APP_MARGIN_LIMITS).forEach(function (device) {
          var margin = form.config[device] && form.config[device].horizontalMargin;
          var value = margin ? parseFloat(margin.value) : NaN;
          if (margin && trimmed(margin.unit || "px") === "px" && value > APP_MARGIN_LIMITS[device]) {
            warning("wide_page_margin", "This application keeps a horizontalMargin of " + value + "px on " + device + ", added on each side to the page padding, after the page tab bar. Use " + APP_ROOT_SPACING[device].horizontalMargin.value + "px (see rootFields.config.recommended): set_root { config: { " + device + ": { horizontalMargin: { unit: 'px', value: '" + APP_ROOT_SPACING[device].horizontalMargin.value + "' } } } }", "/config/" + device + "/horizontalMargin");
          }
        });
      }
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
          if (applicationPages && !hasSpacing(item.config.boxStyle) && !hasSpacing(parent && parent.config.boxStyle) && !hasSpacing(inherited && inherited.default)) {
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

  function readBaserowTableFields(tableId, authentication, session) {
    // lib_BaseRow serves the fields of a table from a 60-second cache: a column nocode-baserow-schema-apply had just
    // created was refused as unknown. nocode_baserow.js reads them past that cache with the user's Baserow account.
    try {
      if ((typeof C8O.nocodeBaserow === "undefined" || !C8O.nocodeBaserow.tableFields) && typeof include === "function") {
        include("js/nocode_baserow.js");
      }
      if (typeof C8O.nocodeBaserow !== "undefined" && C8O.nocodeBaserow.tableFields) {
        var read = C8O.nocodeBaserow.tableFields(tableId, authentication.user, session && session.bearer);
        if (session) { session.bearer = read.bearer; }
        if (read.fields && read.fields.length) { return ensureArray(read.fields); }
      }
    } catch (_freshFieldsError) {}
    var response = callC8oSequence("lib_BaseRow", "formscommon_FieldsList", { forms_config: JSON.stringify({ table_id: tableId, editor: authentication.user }) });
    var error = apiError(response);
    var envelope = response && (response.document || response.doc && response.doc.document || response);
    return !error && envelope && envelope.array ? ensureArray(envelope.array) : null;
  }

  function validateBaserowColumns(form, authentication, options, validation) {
    var cache = {};
    var baserowSession = { bearer: "" };
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
        try { fetched = readBaserowTableFields(binding.config.table_id_int, authentication, baserowSession); } catch (_fieldsError) { fetched = null; }
        if ((!fetched || !fetched.length) && primeBaserowSession()) {
          try { fetched = readBaserowTableFields(binding.config.table_id_int, authentication, baserowSession); } catch (_retryError) { fetched = null; }
        }
        cache[table] = fetched;
      }
      var fields = cache[table];
      if (!fields || !fields.length) { problem("baserow_schema_unavailable", "Cannot read the columns of Baserow table " + table + " with the authenticated No Code account, even after opening a Baserow session; check that this account can access the table before saving. Do not remove the connection to work around this"); return; }
      var names = fields.map(function (field) { return String(field.name); });
      var columns = /\/sources[^/]*\//.test(binding.path) ? ensureArray(binding.config.columns) : [];
      if (/\/lib_BaseRow\.forms_AddRowFromData$/.test(binding.path)) {
        columns = freeVarsColumns(binding.entry.vars.forms_freeVars);
        if (!columns) { return; }
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
    if (hasOwn(op, "config")) {
      patch.config = mergeRootConfig(form.config || {}, op.config);
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
      var pageInput = op.pageObject || op.pageData || (op.page && typeof op.page === "object" && !Array.isArray(op.page) ? op.page : op);
      var page = makePageFromOperation(op, pageIndex, mode === "tabs");
      if (mode === "custom") {
        page.enabledTab = false;
        page.enabledButtons = false;
        if (!hasOwn(pageInput, "isNameDisplayed")) { page.isNameDisplayed = false; }
      }
      form.pages.splice(pageIndex, 0, page);
      var addedHeader = pageHeaderField(pageInput);
      if (addedHeader) {
        var headerIndex = form.formulaire.length;
        compileField(addedHeader, page.pageTechName, catalogByType, form.formulaire, null, { roleStyles: true });
        var nextPage = form.pages[pageIndex + 1];
        var insertAt = nextPage ? form.formulaire.slice(0, headerIndex).map(function (item) { return item && item.config && item.config.page; }).indexOf(nextPage.pageTechName) : -1;
        if (insertAt >= 0) { form.formulaire.splice(insertAt, 0, form.formulaire.pop()); }
      }
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
      var targetPage = ensureArray(form.pages).filter(function (candidate) { return candidate && candidate.pageTechName === pageTech; })[0];
      // Same spacing as at creation on an application page (tab or custom navigation).
      var applicationPage = !!targetPage && (boolLike(targetPage.enabledTab) || !boolLike(targetPage.enabledButtons));
      var compiled = compileField(fieldDef, pageTech, catalogByType, form.formulaire, parentId.length ? parentId : null, { roleStyles: op.styleDefaults !== false && fieldDef.styleDefaults !== false && applicationPage });
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
      var mergePatch = clone(fieldPatch, {});
      // Reduced conditions replace the whole group: merging them into a
      // native group would mix both shapes.
      var conditionPatch = {};
      ["visibleIf", "disabledIf", "buttonStateIf", "goToPageIf"].forEach(function (key) {
        if (hasOwn(mergePatch, key)) { conditionPatch[key] = mergePatch[key]; delete mergePatch[key]; }
      });
      if (mergePatch.conditions && typeof mergePatch.conditions === "object" && !Array.isArray(mergePatch.conditions)) {
        ["visibleIf", "buttonStateIf"].forEach(function (key) {
          var group = mergePatch.conditions[key];
          if (group && typeof group === "object" && !Array.isArray(group) && !isNativeConditionGroup(group)) { conditionPatch[key] = group; delete mergePatch.conditions[key]; }
        });
      }
      // The reduced keys that compile puts in config (deselectOnSecondClick, sticky, the button look...) go there
      // too in a patch: stored at the root of the component, the viewer would not read them.
      REDUCED_CONFIG_KEYS.concat(REDUCED_STYLE_CONFIG_KEYS).forEach(function (key) {
        if (hasOwn(mergePatch, key)) {
          mergePatch.config = mergePatch.config && typeof mergePatch.config === "object" ? mergePatch.config : {};
          if (!hasOwn(mergePatch.config, key)) { mergePatch.config[key] = mergePatch[key]; }
          delete mergePatch[key];
        }
      });
      if (fieldFound.item.type === "button") {
        delete mergePatch.variant;
        if (mergePatch.config) { delete mergePatch.config.variant; }
      }
      if (mergePatch.source != null) {
        // The reduced Baserow source replaces the component's source; applyReducedBaserow builds it after the edits.
        if (!mergePatch.source || typeof mergePatch.source !== "object" || Array.isArray(mergePatch.source)) { throw new Error(fieldFound.item.name + ": source must be an object { table, columns, ... }"); }
        fieldFound.item.__reducedSource = clone(mergePatch.source, {});
        Object.keys(fieldFound.item.sources || {}).forEach(function (key) { if (/^lib_BaseRow\.formssource_/.test(key)) { delete fieldFound.item.sources[key]; } });
        fieldFound.item.config = fieldFound.item.config || {};
        fieldFound.item.config.sourceEnabled = true;
        delete mergePatch.source;
      }
      if (mergePatch.sources) { normalizeRequestableEntries(mergePatch.sources); }
      if (mergePatch.actions) { normalizeRequestableEntries(mergePatch.actions); }
      form.formulaire[fieldFound.index] = applyMergePatch(fieldFound.item, mergePatch);
      if (Object.keys(conditionPatch).length) {
        var compiledConditions = {};
        applyFieldConditions(compiledConditions, conditionPatch);
        var updatedConditions = form.formulaire[fieldFound.index].conditions;
        updatedConditions = updatedConditions && typeof updatedConditions === "object" && !Array.isArray(updatedConditions) ? updatedConditions : {};
        // null removes the condition, as in a merge patch.
        Object.keys(conditionPatch).forEach(function (key) {
          if (conditionPatch[key] == null) { delete updatedConditions[key === "disabledIf" ? "buttonStateIf" : key]; }
        });
        Object.keys(compiledConditions.conditions || {}).forEach(function (key) { updatedConditions[key] = compiledConditions.conditions[key]; });
        form.formulaire[fieldFound.index].conditions = updatedConditions;
      }
      if (fieldFound.item.type === "button" && (hasOwn(fieldPatch, "variant") || explicitConfigValue(fieldPatch, "variant") || explicitConfigValue(fieldPatch, "fill"))) {
        applyButtonVariant(form.formulaire[fieldFound.index], fieldPatch);
      }
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
      // An element read back from a saved flow (id and config) is kept as given; the others are reduced elements,
      // compiled like add_flow_element does. A reduced push_page given here used to be stored as is and refused.
      flow.elements = ensureArray(flow.elements).reduce(function (all, element) {
        var native = element && typeof element === "object" && element.id != null && element.config && typeof element.config === "object";
        return all.concat(native ? [element] : compileFlowElements(element, catalogByType));
      }, []);
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
      var compiledFlowElements = compileFlowElements(flowElementDef, catalogByType);
      var flowElement = compiledFlowElements[0];
      var flowParentId = trimmed(op.parentId || op.parent || op.parentElementId);
      if (flowParentId.length) {
        var flowParent = findFlowElement(targetFlow, { id: flowParentId }).item;
        var refKey = trimmed(op.refKey || op.targetCardChild) || "childrenRefs";
        flowParent[refKey] = ensureArray(flowParent[refKey]);
        flowElement.parentRef = flowParent.id;
        flowParent[refKey].splice(normalizeIndex(op.index, flowParent[refKey].length, flowParent[refKey].length), 0, flowElement.id);
        var flowParentIndex = findFlowElement(targetFlow, { id: flowParent.id }).index;
        Array.prototype.splice.apply(targetFlow.elements, [flowParentIndex + 1, 0].concat(compiledFlowElements));
      } else {
        Array.prototype.splice.apply(targetFlow.elements, [normalizeIndex(op.index, targetFlow.elements.length, targetFlow.elements.length), 0].concat(compiledFlowElements));
      }
      summary.push({ action: action, flowId: targetFlow.id || targetFlow.name, elementId: flowElement.id });
      return;
    }
    if (action === "update_flow_element") {
      var updateFlow = findFlow(form, op).item;
      var flowElementFound = findFlowElement(updateFlow, op);
      var flowElementPatch = op.patch && typeof op.patch === "object" ? op.patch : op.element || {};
      updateFlow.elements[flowElementFound.index] = applyMergePatch(flowElementFound.item, flowElementPatch);
      var patchedElement = updateFlow.elements[flowElementFound.index];
      if (patchedElement.type === "toast" && patchedElement.config && (hasOwn(flowElementPatch, "color") || explicitConfigValue(flowElementPatch, "color"))) {
        patchedElement.config.color = normalizeToastColor(hasOwn(flowElementPatch, "color") ? flowElementPatch.color : patchedElement.config.color);
        delete patchedElement.color;
      }
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
    applyReducedBaserow(edited, opts);
    return { form: edited, operations: summary, allTypesPath: contract.file };
  }

  // The whole contract is about 100 KB (146 KB indented). Vibe keeps a tool result inline up to about 16 KB of its
  // indented JSON and spills a larger one to a file, which its agent then read with 14 to 20 shell commands per turn
  // (22/10 on test-nocode); it reads at most 64 KB of that file. The core is therefore this quick reference, under
  // 14 KB indented, with the index of the sections; sections returns the parts asked for, sections ["all"] the whole
  // contract (not offered to agents).
  function quickReferenceContract() {
    return {
      use: "Write reduced JSON: nocode-form-create, nocode-form-edit and nocode-form-compile compile it to C8Oforms JSON, validate it and save it. This core covers usual forms and applications; sectionIndex says which section to ask (sections:[...]) for details. Return each contract answer from its own call: one answer over about 16 KB is spilled to a file.",
      form: "{ name, description, language: \"fr\", navigationMode: custom (an application: buttons and push_page flows) | buttons (a linear questionnaire) | tabs, titleDisplay: form|page|none, backgroundColor, thumbnailColor, thumbnailImage: { contentType, base64 } (below 512x512 px), pages: [...], flows: [...] }. Pass reduced as a JSON object, not a string. The tools write _id, _rev, formulaire, pageTechName, creator and ACLs: never give them.",
      page: "{ name (unique, the target of push_page), iconName: home|list|people|person|business|calendar|calendar-clear|document-text|receipt|settings|stats-chart|search, header: { title, subtitle } (title block first on the page), description (HTML block after the header), isNameDisplayed (false by default in custom and tabs navigation), fields: [...] }.",
      field: "Every component: { type, name (unique technical name, read as fields.<name>), label (plain question or button text), description (HTML question, wins over label), placeholder, mandatory, disabled, sticky: always|notOnPhone (stays at the top while the page scrolls), visibleIf, defaultFrom, boxStyle, config (merged onto the native config) }. Section componentAuthoring lists each component's options.",
      components: {
        text: "config.type: text, email, number, tel, url, password or search; short:false makes it a growing multi-line field.",
        choices: "select, radio, checkbox: values [\"A\", \"B\"] or [{ value, selected }]; select and checkbox start with no answer, radio with its first option. select config.selectionMode single|multiple. A Baserow column's options: source (see baserow).",
        dates: "datetime, time: config.display_format and picker_format (DD/MM/YYYY, YYYY/MM/DD, HH:mm), min_datetime, max_datetime.",
        slider: "min, max, step; config.pin, config.snaps.",
        description: "description: an HTML block for titles, explanations or a summary.",
        section: "{ type: \"section\", name, title, subtitle, columns: 1 to 4 (default 2), fields: [...] }: a titled card grouping fields; fullWidth:true puts a field on its own line. Use one section per group of an entry or detail page.",
        layout: "{ type: \"layout\", name, cols, tablet, phoneL, phoneP: six { size } summing to 12 each, children: [...] }: a row, for example an action bar of buttons.",
        button: "{ type: \"button\", name, label, flow: <flow id>, variant: primary|secondary|danger|ghost, icon, expand: \"block\", disabledIf }.",
        dataViews: "grid, chart, gallery, map: source (see baserow), or a local grid with columns: [{ name, type }]. chart config.type: line, area, bar, pie or donut; grid config.gridPaginationEnabled and gridRowsPerPage.",
        others: "img, file, signature, location, barcode: name, label, mandatory, config. ion-card is a card title only: group fields with section."
      },
      conditions: "visibleIf, and disabledIf on a button: { field, operator, value }, { all: [...] } or { any: [...] } nested, or { never: true }. Operators: equals, different, greater, greaterequals, minus, minusequals, among_following and out_following (value is an array), contains, not_contains, is_filled and is_empty (no value). A grid is empty until a row is selected. A hidden component is not checked as mandatory.",
      defaults: "defaultFrom on text, slider, datetime, time, barcode: { source: \"user\", property: name|email|authenticatedUserID } (the respondent), { source: \"clock\", property: today|now }, { source: \"field\", field, path: [\"Column\", \"value\"], mode: \"reactive\" } (grid cells are { value }), { source: \"query\", parameter }, { source: \"expression\", expression: \"fields.qty * fields.price\", mode: \"reactive\" }, { source: \"literal\", value }; fallback replaces null. Section contextualDefaults has the rules.",
      flows: "flows: [{ id, name (visible, in the user's language), elements: [...] }]; a button's flow is the flow id. Elements: push_page { targetPage: page name, or __c8o_back }, submit with saveTo or deleteFrom (Baserow, see baserow) or actions (section backendActions: an e-mail...), toast { message, color: success|danger|warning|info, duration }, reset_fields { scope: page|component|application, targetPage, targetField }, refresh_grid { targetGrid }, if_else { condition, then: [...], else: [...] }, add_row_to_local_grid { targetGrid, row }. Computed values: business_logic { name, expression } in the flow with id formulas, read as actions.<name>. A submit without an action saves nothing and is refused. A questionnaire (navigationMode buttons) ends with the viewer's own Envoyer button on its last page, which saves the responses: add no button of your own for that, and no page header repeating the form name (shown in the title card). Put reset_fields before the push_page that leaves the page; never test a submit's outcome with if_else (a failed submit stops the flow).",
      baserow: {
        tables: "table is a table id or its path Workspace~>Base~>Table from nocode-baserow-catalog-list; the tools find the other half, encode the variables and resolve { field } and row references. Columns must be the table's real names.",
        dataView: "grid, chart, gallery, map: source: { table, columns: [...], hidden, filter, sort: \"Name,-Date\", distinct, groupBy, aggregations: \"count=Label,sum:Amount=Label\" }.",
        choices: "select, radio, checkbox: source: { table, field: \"Status\" } (the options of a single select column; the answer is the option id) or { table, display: \"Name\", value: \"Code\", filter, sort } (rows of a table).",
        filter: "{ column, operator, value }, or { all: [...] } / { any: [...] } nested. value is a literal, or { field: \"name\" } to read that component at runtime. A search over two columns: { all: [{ any: [{ column: \"Title\", operator: \"contains\", value: { field: \"search\" } }, { column: \"Description\", operator: \"contains\", value: { field: \"search\" } }] }, { column: \"Priority\", operator: \"single_select_equal\", value: { field: \"priority\" } }] }.",
        operators: "text: contains, contains_not, contains_word, equal, not_equal, empty, not_empty; number: equal, higher_than, higher_than_or_equal, lower_than, lower_than_or_equal; single select: single_select_equal, single_select_not_equal, single_select_is_any_of (an option label or id); other: boolean, link_row_has, multiple_select_has. Section baserowSources lists every Baserow filter type.",
        save: "On a submit element: saveTo: { table } adds a row from the inputs named like its columns; saveTo: { table, values: { \"Column\": \"field_name\", \"Status\": { value: \"New\" } } } writes the columns given ({ field, path } reads a part of a field); saveTo: { table, row: \"grid_name\", values } updates the row selected in that grid; deleteFrom: { table, row: \"grid_name\" } deletes it."
      },
      edit: "nocode-form-edit { id, operations: [...] }, reduced shapes everywhere except update_flow_element: add_page { name, header, navigationMode, index }, update_page { pageName, patch }, add_field { pageName or parentFieldId, fieldObject, index }, update_field { fieldName, patch } (patch.label, patch.source, patch.visibleIf, patch.variant...), remove_field { fieldName }, move_field { fieldName, pageName, parentFieldId, index }, add_flow { flowId, name, flowData: { elements } }, add_flow_element { flowId, element, index, parentId }, update_flow_element { flowId, elementId, patch } (native), remove_flow { flowId }, remove_flow_element { flowId, elementId }, set_root { config }, finalize_baserow_bindings (alone, resumes a creation). A revision conflict means: read the form again, never retry blindly. Section editTool has an example of each.",
      lifecycle: "Create once. saved=true with bindingFinalization.status=ready ends a creation; saved=true with status partial means the form exists: follow bindingFinalization.recovery, never create again. A refused call saves nothing: fix what it names and call again. Fix every design warning with nocode-form-edit before delivery; validation does not run the business flow nor test Baserow permissions.",
      example: {
        name: "Demandes", language: "fr", navigationMode: "custom",
        pages: [
          { name: "Accueil", iconName: "home", header: { title: "Demandes" }, fields: [{ type: "button", name: "open_new", label: "Nouvelle demande", flow: "open_new", variant: "primary" }] },
          { name: "Nouvelle demande", iconName: "document-text", header: { title: "Nouvelle demande" }, fields: [
            { type: "section", name: "request", title: "Demande", fields: [{ type: "text", name: "requester", label: "Demandeur", mandatory: true }] },
            { type: "button", name: "save", label: "Enregistrer", flow: "save", variant: "primary" }
          ] }
        ],
        flows: [
          { id: "open_new", name: "Nouvelle demande", elements: [{ type: "push_page", targetPage: "Nouvelle demande" }] },
          { id: "save", name: "Enregistrer", elements: [{ type: "submit", saveTo: { table: 5271, values: { "Demandeur": "requester" } } }, { type: "toast", message: "Demande enregistrée" }, { type: "push_page", targetPage: "Accueil" }] }
        ]
      }
    };
  }

  // What each section holds, for the index of the core.
  var CONTRACT_SECTION_PURPOSES = {
    generationQuality: "design rules of an application (headers, action bars, list and detail, empty states, toasts, data views): read before generating one",
    generationSteps: "building a large application in steps, checks before delivery",
    styles: "native style recipes, role spacing, mobile margins",
    componentAuthoring: "each component's fields and visual options",
    commonFieldFields: "every field property and its native mapping",
    pageFields: "page properties",
    rootFields: "form properties, page sizing per device",
    conditionFields: "conditions with examples",
    contextualDefaults: "defaultFrom sources and modes, what each can be trusted for",
    flowAuthoring: "flow elements with examples",
    editTool: "an example of each nocode-form-edit operation",
    baserowShorthand: "the reduced Baserow forms with examples",
    baserowSources: "native Baserow sources and every Baserow filter type",
    backendActions: "native submit actions, e-mails, other sequences",
    dynamicReferences: "SmartSource references written by hand",
    styleObjectFields: "the keys of a style object",
    styleRendering: "how the viewer renders styles",
    creationLifecycle: "creation and Baserow binding recovery",
    editingLifecycle: "edited bindings, revision conflicts",
    bindingValidation: "how Baserow columns are checked",
    forbiddenFields: "fields the tools manage",
    mediaSupport: "wallpaper and thumbnails",
    reducedSample: "a reduced questionnaire",
    realWorldPatternsFromGestionDesCreches: "patterns of a real application"
  };
  var CONTRACT_INLINE_PARTS = ["types", "aliases", "format", "intent", "contractVersion", "quickReference"];

  function contractSectionList(value) {
    if (value == null || value === "") { return []; }
    var list = Array.isArray(value) ? value : String(value).replace(/^\s*\[|\]\s*$/g, "").split(",");
    return list.map(function (name) { return trimmed(String(name).replace(/^["']|["']$/g, "")); }).filter(function (name) { return name.length > 0; });
  }

  C8O.nocodeForms.contract = function (options) {
    var opts = options || {};
    var contract = readAllTypes(opts.project || opts.projectName || "C8Oforms");
    var types = contract.catalog.map(function (item) { return item.type; });
    var authoring = detailedAuthoringContract(types);
    var parts = { types: types, aliases: clone(aliases, {}), reducedSample: sampleContract(), quickReference: quickReferenceContract() };
    Object.keys(authoring).forEach(function (key) { parts[key] = authoring[key]; });
    // Asked alone, generationQuality (26 KB indented) would be spilled too: its style recipes are their own section.
    parts.generationQuality = {};
    Object.keys(authoring.generationQuality).forEach(function (key) { if (key !== "styles") { parts.generationQuality[key] = authoring.generationQuality[key]; } });
    parts.generationQuality.styles = "Ask sections:[\"styles\"] for the native style recipes.";
    parts.styles = authoring.generationQuality.styles;
    parts.generationSteps = { incrementalCreation: authoring.generationQuality.incrementalCreation, completion: authoring.generationQuality.completion };
    delete parts.generationQuality.incrementalCreation;
    delete parts.generationQuality.completion;
    parts.generationQuality.steps = "Ask sections:[\"generationSteps\"] for building in steps and the checks before delivery.";
    var asked = contractSectionList(opts.sections);
    var whole = opts.includeAllTypes === true || asked.indexOf("all") >= 0;
    var sectionIndex = {};
    Object.keys(parts).forEach(function (key) {
      if (CONTRACT_INLINE_PARTS.indexOf(key) < 0) {
        sectionIndex[key] = (CONTRACT_SECTION_PURPOSES[key] || key) + " (" + Math.max(1, Math.round(JSON.stringify(parts[key]).length / 1000)) + " KB)";
      }
    });
    if (asked.length && !whole) {
      var sections = {};
      var unknown = [];
      asked.forEach(function (name) {
        if (hasOwn(parts, name)) { sections[name] = parts[name]; } else { unknown.push(name); }
      });
      var answer = { status: unknown.length && !Object.keys(sections).length ? "invalid" : "ok", contractVersion: authoring.contractVersion, sections: sections };
      if (unknown.length) {
        answer.unknownSections = unknown;
        answer.availableSections = Object.keys(parts);
      }
      return answer;
    }
    if (!whole) {
      return {
        status: "ok",
        contractVersion: authoring.contractVersion,
        quickReference: parts.quickReference,
        types: types,
        aliases: parts.aliases,
        sectionIndex: sectionIndex,
        moreSections: "Ask nocode-form-contract-get with sections:[...] for a section of sectionIndex the task needs, a few at a time: generationQuality before generating an application, styles for style recipes, componentAuthoring or editTool for a component or an operation this core does not show."
      };
    }
    var all = clone(authoring, {});
    all.quickReference = parts.quickReference;
    return {
      status: "ok",
      project: opts.project || opts.projectName || "C8Oforms",
      allTypesPath: contract.file,
      sectionIndex: sectionIndex,
      types: types,
      aliases: parts.aliases,
      authoringContract: all,
      reducedSample: parts.reducedSample,
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
  // What the form tools answer an agent: the form without its empty values and empty condition groups, the write
  // without the CouchDB transport details (internal host and headers) and the authentication without the token
  // payload. Sources and actions stay exactly as saved, since an agent copies them into its edits. A three-page
  // application went from 21 KB to 10 KB, for each create, edit and read.
  var AGENT_VIEW_VERBATIM_KEYS = { sources: true, sourcesMarkers: true, sourcesCircles: true, sourcesPolygons: true, actions: true };
  function agentView(value) {
    if (Array.isArray(value)) {
      return value.map(function (item) { return agentView(item); });
    }
    if (!value || typeof value !== "object") {
      return value;
    }
    var out = {};
    Object.keys(value).forEach(function (key) {
      var item = value[key];
      if (key === "_c8oMeta") { return; }
      if (AGENT_VIEW_VERBATIM_KEYS[key] === true) { out[key] = item; return; }
      if (key === "conditions" && item && typeof item === "object" && !Array.isArray(item)) {
        var kept = {};
        Object.keys(item).forEach(function (name) {
          var group = item[name];
          if (group && typeof group === "object" && (ensureArray(group.conds).length || ensureArray(group.groups).length)) { kept[name] = group; }
        });
        if (Object.keys(kept).length) { out[key] = kept; }
        return;
      }
      var compact = agentView(item);
      if (compact === "" || compact == null) { return; }
      if (typeof compact === "object" && !Array.isArray(compact) && !Object.keys(compact).length) { return; }
      out[key] = compact;
    });
    return out;
  }
  function agentResult(result) {
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      return result;
    }
    // The id and the revision first: an agent that cut a long answer to summarize it lost the id of its new form.
    var out = {};
    var savedId = (result.response && result.response.id) || (result.form && result.form._id);
    var savedRev = (result.response && result.response.rev) || (result.form && result.form._rev);
    if (savedId != null) { out.id = String(savedId); }
    if (savedRev != null) { out.rev = String(savedRev); }
    Object.keys(result).forEach(function (key) { if (!hasOwn(out, key)) { out[key] = result[key]; } });
    if (out.form && typeof out.form === "object") { out.form = agentView(out.form); }
    if (out.response && typeof out.response === "object") { out.response = agentView(out.response); }
    if (out.authentication && typeof out.authentication === "object") {
      var auth = { status: out.authentication.status, authenticated: out.authentication.authenticated === true, user: out.authentication.user };
      if (out.authentication.error) { auth.error = out.authentication.error; }
      out.authentication = auth;
    }
    delete out.allTypesPath;
    return out;
  }
  ["create", "update", "edit"].forEach(function (name) {
    var raw = C8O.nocodeForms[name];
    C8O.nocodeForms[name] = function () { return agentResult(raw.apply(null, arguments)); };
  });
  C8O.nocodeForms.agentView = agentView;
  C8O.nocodeForms.parseObject = parseObject;
  C8O.nocodeForms.assertStrictJsonText = assertStrictJsonText;
  C8O.nocodeForms.parseArray = parseArray;
  C8O.nocodeForms.parseOperations = parseOperations;
})();
