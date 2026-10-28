/*
 * Workflow tools of lib_ConvertigoMCP (workflow-list, workflow-get, workflow-draft-create, workflow-draft-put,
 * workflow-validate, workflow-simulate, workflow-publish, workflow-requests, workflow-catalog).
 *
 * They call the sequences of lib_WorkflowEngine and nothing else: the engine checks every right. Each tool call runs
 * them in an internal session of its own, signed in as the user of the MCP bearer token of the call (the Studio
 * account that created it), with no workflow role set: the engine resolves the roles of that user as for any user
 * (the session has none, so the roles sequence lib_WorkflowEngine.rolesSequence, then the global symbols
 * lib_WorkflowEngine.admins and lib_WorkflowEngine.designers). The tools never set roles, never use the developer login
 * of the engine and never read or write its CouchDB database. The MCP session of the client is not touched.
 * Requires js/mcp_auth.js (C8O.mcpAuth.authenticateRequest).
 */

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.workflowTools = C8O.workflowTools || {};

(function () {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var HashMap = Packages.java.util.HashMap;
  var UUID = Packages.java.util.UUID;
  var InternalHttpServletRequest = Packages.com.twinsoft.convertigo.engine.requesters.InternalHttpServletRequest;
  var InternalRequester = Packages.com.twinsoft.convertigo.engine.requesters.InternalRequester;
  var XMLUtils = Packages.com.twinsoft.convertigo.engine.util.XMLUtils;
  var JsonOutput = Packages.com.twinsoft.convertigo.engine.enums.JsonOutput;
  var SessionAttribute = Packages.com.twinsoft.convertigo.engine.enums.SessionAttribute;

  var ENGINE_PROJECT = "lib_WorkflowEngine";
  var UI_PROJECT = "lib_WorkflowEngine_ui_ngx";
  var BRIDGE_PROJECT = "lib_WorkflowEngine_c8oforms";
  var GUIDE = "convertigo://resources/convertigo-workflow";
  // Left out of the catalog unless named: the agent stack, and the workflow libraries themselves (the API of the engine
  // and the pages of its own application are not steps of a workflow).
  var UNLISTED_PROJECTS = { lib_ConvertigoMCP: true, lib_ConvertigoAgentBridge: true, lib_ConvertigoAssistant: true, lib_WorkflowEngine: true, lib_WorkflowEngine_ui_ngx: true };
  var CATALOG_LIMIT = 150;
  var KEY_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
  var STATUS_OF_CODE = {
    BAD_REQUEST: "bad_request",
    UNAUTHENTICATED: "auth_required",
    FORBIDDEN: "forbidden",
    NOT_FOUND: "not_found",
    CONFLICT: "conflict",
    VALIDATION: "invalid",
    EXPRESSION: "invalid"
  };

  function trimmed(value) {
    return value === null || value === undefined ? "" : String(value).replace(/^\s+|\s+$/g, "");
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function bool(value, fallback) {
    var text = trimmed(value).toLowerCase();
    if (!text.length) {
      return fallback;
    }
    return text === "true" || text === "1" || text === "yes";
  }

  function integer(value) {
    var text = trimmed(value);
    return /^-?\d+$/.test(text) ? parseInt(text, 10) : null;
  }

  // A variable of the sequence is a text object (a String object or a Java string), not a JavaScript string.
  function isText(value) {
    if (value === null || typeof value !== "object") {
      return typeof value === "string";
    }
    if (Object.prototype.toString.call(value) === "[object String]") {
      return true;
    }
    try {
      return value instanceof java.lang.CharSequence;
    } catch (_noJava) {
      return false;
    }
  }

  // Arguments reach the sequence as texts: objects and lists come as JSON.
  function jsonArgument(name, value) {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === "object" && !isText(value)) {
      return value;
    }
    var text = trimmed(value);
    if (!text.length) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      throw badArgument(name + " must be JSON: " + (e && e.message ? e.message : e));
    }
  }

  function badArgument(message) {
    var error = new Error(message);
    error.toolError = { status: "bad_request", code: "bad_argument", message: message };
    return error;
  }

  function failure(status, code, message, extra) {
    var out = { status: status, error: { code: code, message: message } };
    Object.keys(extra || {}).forEach(function (key) { out[key] = extra[key]; });
    return out;
  }

  function loadedProjects() {
    var loaded = {};
    try {
      var names = Engine.theApp.databaseObjectsManager.getAllProjectNamesList();
      for (var i = 0; i < names.size(); i++) {
        loaded[String(names.get(i))] = true;
      }
    } catch (_ignoreNames) {}
    return loaded;
  }

  function engineMissing() {
    return failure("unavailable", "workflow_engine_missing",
      "lib_WorkflowEngine is not loaded on this Convertigo server, so there is no workflow to read or design. Workflows need " +
      "it, and lib_WorkflowEngine_ui_ngx for the application side: when the user wants workflows, import them " +
      "(marketplace-import when marketplace-list has them, else ask the user to import them into the Studio), then call the " +
      "tool again. " + GUIDE + " explains the whole route.");
  }

  // The user of the MCP bearer token of this call: the Studio account that created the token. A No Code token is a
  // C8Oforms user restricted to the no-code tools; it never reaches these tools.
  function tokenUser() {
    var authentication = null;
    try {
      authentication = C8O.mcpAuth.authenticateRequest(context);
    } catch (e) {
      authentication = { authenticated: false, error: { code: "invalid_token", message: String(e && e.message ? e.message : e) } };
    }
    if (!authentication || authentication.authenticated !== true) {
      var error = authentication && authentication.error ? authentication.error : {};
      return { error: failure("auth_required", error.code || "auth_required",
        "The workflow tools act as the user of the MCP bearer token of the call: " + (error.message || "no valid token was found on this call") + ".") };
    }
    if (authentication.kind === "nocode") {
      return { error: failure("forbidden", "studio_token_required", "The workflow tools need a Convertigo MCP token of the Studio, not a No Code token.") };
    }
    var user = trimmed(authentication.user);
    if (!user.length) {
      return { error: failure("auth_required", "token_without_user", "This MCP token names no user: the workflow engine cannot know who acts. Create a token from a signed-in administration session.") };
    }
    return { user: user, kind: authentication.kind };
  }

  // An internal session signed in as the user, for the calls of one tool call: the engine reads the user from it
  // (context.getAuthenticatedUser()) and keeps there what it resolved (the roles of the roles sequence, delegations).
  function Session(user) {
    this.user = user;
    var first = new InternalHttpServletRequest();
    this.httpSession = first.getSession(true);
    SessionAttribute.authenticatedUser.set(this.httpSession, user);
  }

  Session.prototype.call = function (sequence, variables, project) {
    var params = new HashMap();
    params.put("__project", project || ENGINE_PROJECT);
    params.put("__sequence", sequence);
    params.put("__context", "mcp_workflow_" + String(UUID.randomUUID()));
    params.put("__removeContext", "true");
    var input = variables || {};
    Object.keys(input).forEach(function (key) {
      var value = input[key];
      if (value === null || value === undefined) {
        return;
      }
      params.put(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    });
    var requester = new InternalRequester(params, new InternalHttpServletRequest(this.httpSession));
    var parsed;
    try {
      var document = requester.processRequest();
      parsed = JSON.parse(String(XMLUtils.XmlToJson(document.getDocumentElement(), true, true, JsonOutput.JsonRoot.docChildNodes)));
    } finally {
      try {
        Engine.theApp.contextManager.remove(requester.getContext());
      } catch (_ignoreContextCleanup) {}
    }
    return envelopeOf(parsed, sequence);
  };

  Session.prototype.close = function () {
    try {
      SessionAttribute.authenticatedUser.remove(this.httpSession);
      this.httpSession.invalidate();
    } catch (_ignoreClose) {}
  };

  function isTrue(value) {
    return value === true || trimmed(value) === "true";
  }

  // Every sequence of the engine answers { response: { ok, result } } or { response: { ok: false, error } }.
  function envelopeOf(parsed, sequence) {
    var response = isObject(parsed) && isObject(parsed.response) ? parsed.response : null;
    if (response) {
      if (isTrue(response.ok)) {
        return { ok: true, result: response.result === undefined ? null : response.result };
      }
      var error = isObject(response.error) ? response.error : {};
      return { ok: false, error: { code: trimmed(error.code) || "INTERNAL", message: trimmed(error.message) || "The workflow engine refused the call", details: error.details === undefined ? null : error.details, messageKey: trimmed(error.messageKey) } };
    }
    var engineError = isObject(parsed) && isObject(parsed.error) ? parsed.error : {};
    return { ok: false, error: { code: "INTERNAL", message: "lib_WorkflowEngine." + sequence + " failed: " + (trimmed(engineError.message) || trimmed(engineError.exception) || "no answer"), details: null } };
  }

  function actorOf(session) {
    var answer = session.call("workflowSessionGet", {});
    var info = answer.ok && isObject(answer.result) ? answer.result : {};
    return {
      user: session.user,
      roles: Array.isArray(info.roles) ? info.roles : [],
      isDesigner: isTrue(info.isDesigner),
      isAdmin: isTrue(info.isAdmin),
      studio: isTrue(info.studio),
      engineVersion: info.engineVersion || null
    };
  }

  // What the agent and the user need when the engine refuses: its error, and for a right the roles the token user has
  // and where the engine reads them. The tools grant nothing.
  function refusal(answer, actor, designerOnly) {
    var code = trimmed(answer.error && answer.error.code) || "INTERNAL";
    var out = { status: STATUS_OF_CODE[code] || "error", actor: actor, error: { code: code, message: answer.error.message } };
    if (answer.error.details !== null && answer.error.details !== undefined) {
      out.error.details = answer.error.details;
    }
    if (code === "FORBIDDEN" && actor) {
      out.error.hint = designerOnly && !actor.isDesigner
        ? "This MCP token acts as " + actor.user + ", who has no WorkflowDesigner or WorkflowAdmin role (roles: " + (actor.roles.join(", ") || "none") + "). " +
          "The engine gives these roles to the user names of the global symbols lib_WorkflowEngine.designers and lib_WorkflowEngine.admins (comma separated, or *), " +
          "or through the sequence named by lib_WorkflowEngine.rolesSequence. Ask the user to grant the role; never work around it."
        : "This MCP token acts as " + actor.user + " (roles: " + (actor.roles.join(", ") || "none") + "): the engine does not let this user do it.";
    }
    if (code === "CONFLICT") {
      out.error.hint = answer.error.messageKey === "wf_err_key_exists"
        ? "Choose another workflowKey, or read and edit the existing workflow (workflow-get)."
        : "Read the workflow again (workflow-get), apply the change to what it returns and retry with its draftRevision.";
    }
    return out;
  }

  // Runs one tool: the engine must be loaded, the token user known; the session is closed whatever happens.
  function run(body) {
    try {
      if (!loadedProjects()[ENGINE_PROJECT]) {
        return engineMissing();
      }
      var identity = tokenUser();
      if (identity.error) {
        return identity.error;
      }
      var session = new Session(identity.user);
      try {
        var actor = actorOf(session);
        return body(session, actor);
      } finally {
        session.close();
      }
    } catch (e) {
      if (e && e.toolError) {
        return failure(e.toolError.status, e.toolError.code, e.toolError.message);
      }
      return failure("error", "workflow_tool_failed", "The workflow tool failed: " + (e && e.message ? e.message : e));
    }
  }

  function requireKey(value, name) {
    var key = trimmed(value);
    if (!key.length) {
      throw badArgument((name || "workflowKey") + " is required");
    }
    if (!KEY_PATTERN.test(key)) {
      throw badArgument((name || "workflowKey") + " '" + key + "' is invalid: letters, digits, '-' or '_' (80 at most)");
    }
    return key;
  }

  // ------------------------------------------------------------------ shaping

  function issues(list) {
    return (Array.isArray(list) ? list : []).map(function (item) {
      var out = { path: item.path === undefined ? "" : item.path, message: item.message };
      if (item.code) { out.code = item.code; }
      return out;
    });
  }

  function validationOf(report) {
    if (!isObject(report)) {
      return null;
    }
    return {
      valid: isTrue(report.valid),
      errors: issues(report.errors),
      warnings: issues(report.warnings),
      summary: isObject(report.summary) ? report.summary : null
    };
  }

  // A draft as workflow-get gives it: the definition to edit and its revision, without the copies the Studio uses.
  function draftView(result) {
    var out = {
      workflowKey: result.workflowKey,
      title: result.title,
      description: result.description === undefined ? null : result.description,
      category: result.category === undefined ? null : result.category,
      archived: isTrue(result.archived),
      draftRevision: result.draftRevision,
      draftUpdatedAt: result.draftUpdatedAt || null,
      draftUpdatedBy: result.draftUpdatedBy || null,
      publishedVersion: result.publishedVersion === undefined ? null : result.publishedVersion,
      publishedAt: result.publishedAt || null,
      hasUnpublishedChanges: isTrue(result.hasUnpublishedChanges),
      instances: result.instances || null,
      validation: validationOf(result.validation),
      definition: result.definition
    };
    if (Array.isArray(result.versions)) {
      out.versions = result.versions;
    }
    if (result.draftNotes) {
      out.draftNotes = result.draftNotes;
    }
    return out;
  }

  function fieldNames(fields) {
    return (Array.isArray(fields) ? fields : []).map(function (field) {
      var out = { name: field.name, label: field.label, type: field.type };
      if (isTrue(field.required)) { out.required = true; }
      if (field.mode === "read") { out.mode = "read"; }
      if (field.value !== undefined && field.value !== null && field.value !== "") { out.value = field.value; }
      return out;
    });
  }

  // An object without its null, empty text and empty object members (the ui of a step names one kind).
  function compact(value) {
    if (!isObject(value)) {
      return value === undefined ? null : value;
    }
    var out = {};
    Object.keys(value).forEach(function (key) {
      var item = value[key];
      if (item === null || item === undefined || item === "" || (isObject(item) && !Object.keys(item).length)) {
        return;
      }
      out[key] = item;
    });
    return Object.keys(out).length ? out : null;
  }

  // The screen of a step as the generic components draw it, without the texts and layout details of each field.
  function screenOf(viewModel) {
    if (!isObject(viewModel)) {
      return null;
    }
    var state = isObject(viewModel.state) ? viewModel.state : {};
    var out = {
      state: { key: state.key, label: state.label, kind: state.kind, roles: state.roles, final: isTrue(state.final) },
      status: viewModel.status,
      ui: compact(viewModel.ui),
      service: viewModel.service || null,
      actions: (Array.isArray(viewModel.actions) ? viewModel.actions : []).map(function (action) {
        var item = { event: action.event, label: action.label, target: action.target, roles: action.roles };
        if (isTrue(action.stay)) { item.stay = true; }
        if (action.confirm) { item.confirm = action.confirm; }
        if (isObject(action.payloadForm)) { item.fields = fieldNames(action.payloadForm.fields); }
        if (isTrue(action.asAdmin)) { item.asAdmin = true; }
        return item;
      }),
      sections: (Array.isArray(viewModel.sections) ? viewModel.sections : []).map(function (section) {
        return { title: section.title, fields: fieldNames(section.fields) };
      }),
      notices: viewModel.notices || [],
      fieldErrors: viewModel.fieldErrors || {},
      progress: viewModel.progress || null,
      waitingFor: viewModel.waitingFor || null
    };
    if (isTrue(viewModel.history)) {
      out.history = true;
    }
    return out;
  }

  // ------------------------------------------------------------------ JSON merge patch (RFC 7386)

  function mergePatch(target, patch) {
    if (!isObject(patch)) {
      return clone(patch);
    }
    var out = isObject(target) ? clone(target) : {};
    Object.keys(patch).forEach(function (key) {
      if (patch[key] === null) {
        delete out[key];
      } else {
        out[key] = mergePatch(out[key], patch[key]);
      }
    });
    return out;
  }

  // ------------------------------------------------------------------ tools

  // workflow-list: the workflows and templates (design view, designers), or the published workflows the user can start.
  function list(args) {
    return run(function (session, actor) {
      var view = trimmed(args.view) || "design";
      if (view === "startable") {
        var catalog = session.call("workflowDefinitionList", { startableOnly: "true" });
        if (!catalog.ok) {
          return refusal(catalog, actor, false);
        }
        return {
          status: "ok",
          actor: actor,
          view: "startable",
          workflows: (catalog.result.definitions || []).map(function (item) {
            return { workflowKey: item.workflowKey, title: item.title, description: item.description, category: item.category, version: item.version, canStart: isTrue(item.canStart) };
          })
        };
      }
      if (view !== "design") {
        throw badArgument("view must be design or startable");
      }
      var drafts = session.call("workflowDraftList", { includeArchived: bool(args.includeArchived, false) ? "true" : "false" });
      if (!drafts.ok) {
        return refusal(drafts, actor, true);
      }
      return {
        status: "ok",
        actor: actor,
        view: "design",
        workflows: drafts.result.workflows || [],
        templates: (drafts.result.templates || []).map(function (template) {
          return { templateKey: template.templateKey, title: template.title, description: template.description, category: template.category, stateCount: template.stateCount, valid: isTrue(template.valid) };
        }),
        applicationProjects: { engine: true, ui: !!loadedProjects()[UI_PROJECT], c8oformsBridge: !!loadedProjects()[BRIDGE_PROJECT] }
      };
    });
  }

  // workflow-get: the draft to edit (default), or a published version.
  function get(args) {
    return run(function (session, actor) {
      var key = requireKey(args.workflowKey);
      var version = trimmed(args.version);
      if (!version.length || version === "draft") {
        var draft = session.call("workflowDraftGet", { workflowKey: key });
        if (!draft.ok) {
          return refusal(draft, actor, true);
        }
        var out = draftView(draft.result);
        out.status = "ok";
        out.actor = actor;
        out.source = "draft";
        return out;
      }
      var variables = { workflowKey: key };
      if (version !== "published") {
        if (integer(version) === null) {
          throw badArgument("version must be draft, published or a published version number");
        }
        variables.version = String(integer(version));
      }
      var published = session.call("workflowDefinitionGet", variables);
      if (!published.ok) {
        return refusal(published, actor, false);
      }
      var result = published.result;
      return {
        status: "ok",
        actor: actor,
        source: "published",
        workflowKey: result.workflowKey,
        version: result.version,
        current: isTrue(result.current),
        archived: isTrue(result.archived),
        publishedAt: result.publishedAt || null,
        publishedBy: result.publishedBy || null,
        notes: result.notes || null,
        definition: result.definition
      };
    });
  }

  // workflow-draft-create: blank, from a template, from an inline definition or from a published No Code Studio form.
  function draftCreate(args) {
    return run(function (session, actor) {
      var definition = jsonArgument("definition", args.definition);
      var templateKey = trimmed(args.templateKey);
      var fromForm = trimmed(args.fromForm);
      var sources = (definition !== null ? 1 : 0) + (templateKey.length ? 1 : 0) + (fromForm.length ? 1 : 0);
      if (sources > 1) {
        throw badArgument("give one source at most: templateKey, definition or fromForm");
      }
      if (definition !== null && !isObject(definition)) {
        throw badArgument("definition must be a JSON object");
      }
      var variables = {
        workflowKey: trimmed(args.workflowKey).length ? requireKey(args.workflowKey) : null,
        title: trimmed(args.title) || null,
        description: trimmed(args.description) || null
      };
      if (definition !== null) { variables.definition = definition; }
      if (templateKey.length) { variables.templateKey = templateKey; }
      if (fromForm.length) {
        if (!loadedProjects().C8Oforms) {
          return failure("unavailable", "c8oforms_missing", "fromForm needs C8Oforms (No Code Studio) on this server: its published forms are read from it.", { actor: actor });
        }
        variables.fromForm = /^published_/.test(fromForm) ? fromForm : "published_" + fromForm;
        variables.circuit = trimmed(args.circuit) || "approval";
        variables.language = trimmed(args.language) || "en";
      }
      var created = session.call("workflowDraftCreate", variables);
      if (!created.ok) {
        return refusal(created, actor, true);
      }
      var out = draftView(created.result);
      out.status = "ok";
      out.actor = actor;
      out.created = true;
      out.next = "Edit the draft with workflow-draft-put (expectedRevision " + out.draftRevision + "), check it with workflow-validate and workflow-simulate; publish only when the user asks (workflow-publish).";
      if (fromForm.length) {
        out.next += " The forms of its steps and the Start a workflow action of the form are not created by this tool: the Workflow Studio does it (Execution card, No Code Studio form), or nocode tools for a user of No Code Studio.";
      }
      return out;
    });
  }

  // workflow-draft-put: saves the whole definition, or a JSON merge patch of the draft, at the revision the agent read.
  function draftPut(args) {
    return run(function (session, actor) {
      var key = requireKey(args.workflowKey);
      var expected = integer(args.expectedRevision);
      if (expected === null) {
        throw badArgument("expectedRevision is required: the draftRevision read with workflow-get (or returned by the last save)");
      }
      if (expected < 1) {
        throw badArgument("expectedRevision must be the draftRevision of an existing draft; create a workflow with workflow-draft-create");
      }
      var definition = jsonArgument("definition", args.definition);
      var patch = jsonArgument("patch", args.patch);
      if ((definition === null) === (patch === null)) {
        throw badArgument("give either definition (the whole definition) or patch (a JSON merge patch of the draft)");
      }
      if (definition !== null && !isObject(definition)) {
        throw badArgument("definition must be a JSON object");
      }
      if (patch !== null && !isObject(patch)) {
        throw badArgument("patch must be a JSON object (JSON merge patch: null removes a key, objects merge, lists replace)");
      }
      if (patch !== null) {
        var current = session.call("workflowDraftGet", { workflowKey: key });
        if (!current.ok) {
          return refusal(current, actor, true);
        }
        if (current.result.draftRevision !== expected && String(current.result.draftRevision) !== String(expected)) {
          return refusal({ error: { code: "CONFLICT", message: "The draft is at revision " + current.result.draftRevision + " (saved by " + (current.result.draftUpdatedBy || "someone") + " at " + current.result.draftUpdatedAt + "), not at the revision " + expected + " the patch was written for", details: { draftRevision: current.result.draftRevision } } }, actor, true);
        }
        definition = mergePatch(current.result.definition, patch);
      }
      if (definition.workflowKey !== undefined && trimmed(definition.workflowKey) !== key) {
        throw badArgument("definition.workflowKey is " + definition.workflowKey + ", not " + key + ": a key changes only before the first publication, in the Workflow Studio");
      }
      definition.workflowKey = key;
      var variables = { workflowKey: key, definition: definition, expectedRevision: String(expected) };
      if (trimmed(args.notes).length) { variables.notes = trimmed(args.notes); }
      var saved = session.call("workflowDraftPut", variables);
      if (!saved.ok) {
        return refusal(saved, actor, true);
      }
      var result = saved.result;
      return {
        status: "ok",
        actor: actor,
        saved: true,
        workflowKey: result.workflowKey,
        title: result.title,
        draftRevision: result.draftRevision,
        publishedVersion: result.publishedVersion === undefined ? null : result.publishedVersion,
        hasUnpublishedChanges: isTrue(result.hasUnpublishedChanges),
        validation: validationOf(result.validation)
      };
    });
  }

  // workflow-validate: the validator of the engine on the saved draft or on a definition not saved.
  function validate(args) {
    return run(function (session, actor) {
      var definition = jsonArgument("definition", args.definition);
      var key = trimmed(args.workflowKey);
      if ((definition === null) === (!key.length)) {
        throw badArgument("give either workflowKey (the saved draft) or definition (a definition not saved)");
      }
      var answer = session.call("workflowDraftValidate", definition !== null ? { definition: definition } : { workflowKey: requireKey(key) });
      if (!answer.ok) {
        return refusal(answer, actor, true);
      }
      var report = validationOf(answer.result);
      report.status = "ok";
      report.actor = actor;
      report.source = definition !== null ? "inline" : "draft";
      return report;
    });
  }

  function previewStep(item, preview) {
    var step = { event: item.event, allowed: isTrue(preview.allowed), fromState: preview.fromState };
    if (step.allowed) {
      step.toState = preview.toState;
      step.toStateLabel = preview.toStateLabel;
      step.status = preview.resultingStatus;
      // what the engine went through: the action, then the automatic routing and the steps it entered
      step.moves = (Array.isArray(preview.steps) ? preview.steps : []).map(function (entry) {
        var move = { kind: entry.kind, fromState: entry.fromState, toState: entry.toState };
        if (entry.event) { move.event = entry.event; }
        if (entry.label) { move.label = entry.label; }
        return move;
      });
      if (Array.isArray(preview.skippedActions) && preview.skippedActions.length) {
        step.skippedCalls = preview.skippedActions;
      }
    } else {
      step.reason = preview.reason;
      step.code = preview.code;
      if (preview.details !== undefined && preview.details !== null) { step.details = preview.details; }
    }
    return step;
  }

  // workflow-simulate: what a state shows (actions, forms, sections, notices) and where actions lead, without saving,
  // notifying or calling anything. A path chains actions from a state, each one from where the previous one led.
  function simulate(args) {
    return run(function (session, actor) {
      var instanceId = trimmed(args.instanceId);
      var definition = jsonArgument("definition", args.definition);
      var key = trimmed(args.workflowKey);
      var source = trimmed(args.source) || (trimmed(args.version).length ? "published" : "draft");
      var data = jsonArgument("data", args.data);
      var payload = jsonArgument("payload", args.payload);
      var path = jsonArgument("path", args.path);
      var event = trimmed(args.event);
      var full = bool(args.full, false);
      if (data !== null && !isObject(data)) { throw badArgument("data must be a JSON object"); }
      if (path !== null && !Array.isArray(path)) { throw badArgument("path must be a list of { event, payload }"); }
      if (path !== null && event.length) { throw badArgument("give event (one action) or path (several), not both"); }
      if (path === null && event.length) { path = [{ event: event, payload: payload }]; }
      var base = {};
      if (instanceId.length) {
        if (path === null || path.length !== 1) {
          throw badArgument("on a request (instanceId), give one event: the dry run of an action on it as it is now");
        }
        base.instanceId = instanceId;
      } else if (definition !== null) {
        if (!isObject(definition)) { throw badArgument("definition must be a JSON object"); }
        base.definition = definition;
        if (key.length) { base.workflowKey = requireKey(key); }
      } else {
        base.workflowKey = requireKey(key, "workflowKey (or definition, or instanceId)");
        if (source === "draft") {
          base.useDraft = "true";
        } else if (source === "published") {
          if (trimmed(args.version).length) {
            if (integer(args.version) === null) { throw badArgument("version must be a published version number"); }
            base.version = String(integer(args.version));
          }
        } else {
          throw badArgument("source must be draft or published");
        }
      }
      var state = trimmed(args.state) || null;
      var businessKey = trimmed(args.businessKey) || null;
      var out = { status: "ok", actor: actor, source: instanceId.length ? "request" : (definition !== null ? "inline" : source) };
      if (path === null || !path.length) {
        if (instanceId.length) {
          throw badArgument("on a request, give the event to try");
        }
        var variables = clone(base);
        if (state) { variables.state = state; }
        if (data !== null) { variables.data = data; }
        if (businessKey) { variables.businessKey = businessKey; }
        var model = session.call("workflowGetViewModel", variables);
        if (!model.ok) {
          return refusal(model, actor, true);
        }
        out.workflowKey = model.result.workflowKey;
        out.state = model.result.instance ? model.result.instance.state : state;
        out.screen = screenOf(model.result.viewModel);
        if (full) { out.viewModel = model.result.viewModel; }
        out.note = "Designers see every action of a simulated state (asAdmin marks those their own roles would not allow). Service calls, emails and data stores are skipped.";
        return out;
      }
      if (path.length > 20) {
        throw badArgument("a path has 20 actions at most");
      }
      var currentState = state;
      var currentData = data;
      var steps = [];
      var lastAllowed = null;
      for (var i = 0; i < path.length; i++) {
        var item = isObject(path[i]) ? path[i] : { event: path[i] };
        if (!trimmed(item.event).length) {
          throw badArgument("path[" + i + "].event is required");
        }
        var stepVariables = clone(base);
        stepVariables.event = trimmed(item.event);
        if (item.payload !== undefined && item.payload !== null) {
          if (!isObject(item.payload)) { throw badArgument("path[" + i + "].payload must be a JSON object"); }
          stepVariables.payload = item.payload;
        }
        if (!instanceId.length) {
          if (currentState) { stepVariables.state = currentState; }
          if (currentData !== null) { stepVariables.data = currentData; }
          if (businessKey) { stepVariables.businessKey = businessKey; }
        }
        var answer = session.call("workflowPreviewTransition", stepVariables);
        if (!answer.ok) {
          return refusal(answer, actor, !instanceId.length);
        }
        var preview = isObject(answer.result.preview) ? answer.result.preview : {};
        out.workflowKey = answer.result.workflowKey;
        if (i === 0) {
          out.from = { state: answer.result.instance ? answer.result.instance.state : currentState, screen: screenOf(answer.result.viewModel) };
        }
        var step = previewStep(item, preview);
        steps.push(step);
        if (!step.allowed) {
          break;
        }
        lastAllowed = preview;
        currentState = preview.toState;
        currentData = isObject(preview.data) ? preview.data : currentData;
      }
      out.steps = steps;
      out.completed = steps.length === path.length && steps[steps.length - 1].allowed;
      // where the request is after the last action allowed (the starting state when the first one is refused)
      if (lastAllowed) {
        out.reached = { state: lastAllowed.toState, stateLabel: lastAllowed.toStateLabel, status: lastAllowed.resultingStatus, data: lastAllowed.data, screen: screenOf(lastAllowed.viewModel) };
        if (full) { out.reached.viewModel = lastAllowed.viewModel; }
      } else {
        out.reached = { state: out.from.state, status: "unchanged", data: currentData, screen: out.from.screen };
      }
      out.note = "Dry run: nothing saved, no service call, email or data store. On a simulated state the roles are not checked; on a request they are (the actions of the token user).";
      return out;
    });
  }

  // workflow-publish: publishes the draft the user checked, as a new immutable version, on their explicit request.
  function publish(args) {
    return run(function (session, actor) {
      var key = requireKey(args.workflowKey);
      var expected = integer(args.expectedRevision);
      if (expected === null) {
        throw badArgument("expectedRevision is required: the draftRevision the user checked (workflow-get, or the last workflow-draft-put)");
      }
      if (!bool(args.confirm, false)) {
        var draft = session.call("workflowDraftGet", { workflowKey: key });
        if (!draft.ok) {
          return refusal(draft, actor, true);
        }
        return {
          status: "confirmation_required",
          actor: actor,
          published: false,
          workflowKey: key,
          draftRevision: draft.result.draftRevision,
          publishedVersion: draft.result.publishedVersion === undefined ? null : draft.result.publishedVersion,
          hasUnpublishedChanges: isTrue(draft.result.hasUnpublishedChanges),
          validation: validationOf(draft.result.validation),
          message: "Nothing was published. Publish only when the user explicitly asked to publish this workflow: then call again with confirm true and the draftRevision they checked. Requests already running keep their version; new requests use the new one."
        };
      }
      var variables = { workflowKey: key, expectedRevision: String(expected) };
      if (trimmed(args.notes).length) { variables.notes = trimmed(args.notes); }
      var published = session.call("workflowDraftPublish", variables);
      if (!published.ok) {
        var refused = refusal(published, actor, true);
        refused.published = false;
        if (published.error.code === "VALIDATION" && isObject(published.error.details)) {
          refused.validation = validationOf(published.error.details);
          delete refused.error.details;
        }
        return refused;
      }
      var result = published.result;
      var out = {
        status: "ok",
        actor: actor,
        published: !isTrue(result.unchanged),
        unchanged: isTrue(result.unchanged),
        workflowKey: result.workflowKey,
        publishedVersion: result.publishedVersion,
        publishedAt: result.publishedAt || null,
        publishedBy: result.publishedBy || null,
        validation: validationOf(result.validation)
      };
      if (out.unchanged) {
        out.message = "The draft is the published version " + result.publishedVersion + ": nothing new was published.";
      }
      if (loadedProjects()[BRIDGE_PROJECT]) {
        out.forms = "The No Code Studio forms of the workflow (start form, forms of steps) are published on their own: from the Workflow Studio when it publishes, or in No Code Studio.";
      }
      return out;
    });
  }

  // workflow-requests: one request (its step, actions, history) or a list (inbox, started, involved, all).
  function requests(args) {
    return run(function (session, actor) {
      var instanceId = trimmed(args.instanceId);
      if (instanceId.length) {
        var answer = session.call("workflowGetInstance", { instanceId: instanceId });
        if (!answer.ok) {
          return refusal(answer, actor, false);
        }
        var view = answer.result;
        var instance = isObject(view.instance) ? view.instance : {};
        instance.ui = compact(instance.ui);
        var out = {
          status: "ok",
          actor: actor,
          instance: instance,
          definitionVersion: view.definitionVersion === undefined ? null : view.definitionVersion,
          screen: screenOf(view.viewModel),
          next: view.next || null,
          permissions: view.permissions || null,
          timeline: Array.isArray(view.timeline) ? view.timeline : []
        };
        if (bool(args.full, false)) { out.viewModel = view.viewModel; }
        return out;
      }
      var scope = trimmed(args.scope) || "inbox";
      if (["inbox", "started", "involved", "all"].indexOf(scope) < 0) {
        throw badArgument("scope must be inbox, started, involved or all");
      }
      var variables = { scope: scope };
      ["workflowKey", "status", "state", "businessKey", "search"].forEach(function (name) {
        if (trimmed(args[name]).length) { variables[name] = trimmed(args[name]); }
      });
      if (bool(args.includeTests, false)) { variables.includeTests = "true"; }
      var limit = integer(args.limit);
      var skip = integer(args.skip);
      variables.limit = String(limit === null ? 20 : Math.max(1, Math.min(200, limit)));
      if (skip !== null && skip > 0) { variables.skip = String(skip); }
      var listed = session.call("workflowListInstances", variables);
      if (!listed.ok) {
        return refusal(listed, actor, false);
      }
      var result = listed.result || {};
      var items = (Array.isArray(result.items) ? result.items : []).map(function (item) {
        if (isObject(item)) { item.ui = compact(item.ui); }
        return item;
      });
      var out2 = { status: "ok", actor: actor, scope: scope, items: items };
      Object.keys(result).forEach(function (name) {
        if (name !== "items") { out2[name] = result[name]; }
      });
      return out2;
    });
  }

  function matches(search, values) {
    if (!search.length) {
      return true;
    }
    var needle = search.toLowerCase();
    return values.some(function (value) { return value && String(value).toLowerCase().indexOf(needle) >= 0; });
  }

  // workflow-catalog: what a workflow can orchestrate, from workflowCatalog: the sequences (service steps, calls), the
  // pages and shared components (ui.page, ui.component) of the loaded projects, and the published No Code Studio forms.
  function catalog(args) {
    return run(function (session, actor) {
      var project = trimmed(args.project);
      var kind = trimmed(args.kind) || "all";
      var search = trimmed(args.search);
      var limit = integer(args.limit);
      limit = limit === null ? CATALOG_LIMIT : Math.max(1, Math.min(500, limit));
      var room = limit;
      var truncated = false;
      var left = [];
      // at most limit sequences, pages and components in all: a workspace with C8Oforms has hundreds of sequences
      function take(list) {
        if (list.length > room) {
          truncated = true;
          list = list.slice(0, room);
        }
        room -= list.length;
        return list;
      }
      if (["all", "sequences", "pages", "components", "forms"].indexOf(kind) < 0) {
        throw badArgument("kind must be all, sequences, pages, components or forms");
      }
      var answer = session.call("workflowCatalog", project.length ? { project: project } : {});
      if (!answer.ok) {
        return refusal(answer, actor, true);
      }
      var result = answer.result || {};
      var projects = [];
      (Array.isArray(result.projects) ? result.projects : []).forEach(function (item) {
        if (!project.length && UNLISTED_PROJECTS[item.name]) {
          left.push(item.name);
          return;
        }
        var entry = { name: item.name };
        if (kind === "all" || kind === "sequences") {
          entry.sequences = take((Array.isArray(item.sequences) ? item.sequences : []).filter(function (sequence) {
            return matches(search, [sequence.qname, sequence.comment]);
          })).map(function (sequence) {
            var out = { qname: sequence.qname, accessibility: sequence.accessibility, authenticated: isTrue(sequence.authenticated), variables: (sequence.variables || []).map(function (v) { return v.name; }) };
            // service steps run without the user session: Private and no authenticated context
            out.serviceReady = sequence.accessibility === "Private" && !isTrue(sequence.authenticated);
            if (sequence.comment) { out.comment = String(sequence.comment).substring(0, 160); }
            return out;
          });
        }
        var app = isObject(item.app) ? item.app : null;
        if (app && (kind === "all" || kind === "pages")) {
          entry.pages = take((app.pages || []).filter(function (page) { return matches(search, [page.name, page.route, page.title]); }));
        }
        if (app && (kind === "all" || kind === "components")) {
          entry.components = take((app.components || []).filter(function (component) { return matches(search, [component.qname, component.comment]); }))
            .map(function (component) { return { qname: component.qname, inputs: component.inputs || [] }; });
        }
        var empty = !(entry.sequences && entry.sequences.length) && !(entry.pages && entry.pages.length) && !(entry.components && entry.components.length);
        if (!empty) {
          projects.push(entry);
        }
      });
      var out = { status: "ok", actor: actor, projects: projects };
      if (truncated) {
        out.truncated = true;
        out.hint = "More than " + limit + " sequences, pages and components: narrow with project, kind or search (or raise limit, 500 at most).";
      }
      if (left.length) {
        out.notListed = left;
      }
      if (kind === "all" || kind === "forms") {
        var forms = isObject(result.c8oforms) ? result.c8oforms : null;
        out.c8oforms = forms ? {
          url: forms.url || null,
          generator: isTrue(forms.generator),
          dataStore: isTrue(forms.dataStore),
          forms: (forms.forms || []).filter(function (form) { return matches(search, [form.id, form.name]); })
        } : null;
      }
      out.note = "ui.page takes a route of a page of the application (supplier/:instanceId), ui.component a qname, ui.form a published form id (published_<id>), service.call a sequence qname (serviceReady: Private and no authenticated context, as service steps need).";
      return out;
    });
  }

  C8O.workflowTools.list = list;
  C8O.workflowTools.get = get;
  C8O.workflowTools.draftCreate = draftCreate;
  C8O.workflowTools.draftPut = draftPut;
  C8O.workflowTools.validate = validate;
  C8O.workflowTools.simulate = simulate;
  C8O.workflowTools.publish = publish;
  C8O.workflowTools.requests = requests;
  C8O.workflowTools.catalog = catalog;
  C8O.workflowTools._mergePatch = mergePatch;
})();
