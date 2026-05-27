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

  function pageDefaults(page, index) {
    var id = "Page_" + nextId();
    return {
      name: trimmed(page && page.name) || ("Page " + (index + 1)),
      pageTechName: id,
      desc: trimmed(page && (page.description || page.desc)),
      iconName: trimmed(page && (page.ionicIcon || page.iconFromIonicons)) || "document-text-outline",
      positionTab: "bottom",
      enabledTab: false,
      included: true,
      enabledButtons: true,
      positionButtons: "tab"
    };
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
    for (var p = 0; p < pages.length; p++) {
      var page = pageDefaults(pages[p], p);
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

  C8O.nocodeForms.contract = function (options) {
    var opts = options || {};
    var contract = readAllTypes(opts.project || opts.projectName || "C8Oforms");
    return {
      status: "ok",
      project: opts.project || opts.projectName || "C8Oforms",
      allTypesPath: contract.file,
      types: contract.catalog.map(function (item) { return item.type; }),
      aliases: clone(aliases, {}),
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
  C8O.nocodeForms.parseObject = parseObject;
  C8O.nocodeForms.parseArray = parseArray;
})();
