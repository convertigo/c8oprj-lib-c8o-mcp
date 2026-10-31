/*
 * Changes the No Code user confirms ("Confirmer avant de modifier" in the Tigo panel). While the user has it on, the MCP
 * router (js/mcp_endpoint_router.js) holds every No Code write until the user answers a card of the conversation's
 * panel; reads, validate, preview capture and report-create are never held. Every provider goes through the router:
 * Vibe, Codex and Claude alike.
 *
 * What it shares with lib_ConvertigoAssistant, in the store the server shares between projects (context.server):
 * - lib_ConvertigoAssistant.writeConfirm, a map of JSON strings: "user:<owner>" is {on, at}, the user's choice, which the
 *   Assistant writes when the user switches and at each message from the choice it keeps for the user;
 *   "grant:<conversation>" is {user, at}, the card's "allow all for this turn", which the Assistant drops at the next
 *   message and at the end of the turn.
 * - lib_ConvertigoAssistant.hostRequests, the requests of the conversations the preview capture uses too: one
 *   "write-confirm" request per held change, with what it changes (items). The panel takes it while it reads the turn
 *   (readResponse), shows the card and answers through lib_ConvertigoAssistant.AgentWriteConfirm (allowed, allowed_turn,
 *   refused), or closes it at the end of the turn (expired).
 *
 * A held call waits 40 s at most: Codex and code run by Vibe give up on an MCP call after about a minute. It then
 * answers awaiting_confirmation and the agent calls again with the same arguments, which finds the same request. A card
 * nobody answers within 5 minutes refuses the change. Switching off answers no card: an open card stays until the user
 * answers it or it expires, and only the next writes go through without one.
 */

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.nocodeWriteConfirm = C8O.nocodeWriteConfirm || {};

(function (api) {
  var CONFIRM_KEY = "lib_ConvertigoAssistant.writeConfirm";
  var REQUESTS_KEY = "lib_ConvertigoAssistant.hostRequests";
  var WAIT_MS = 40000;
  var POLL_MS = 250;
  var EXPIRES_MS = 5 * 60000;
  // the grant of a turn the Assistant could not drop (a panel closed during the turn) ends anyway
  var GRANT_MS = 2 * 3600000;
  // requests kept for a conversation after their end, as the preview capture keeps them
  var KEEP_MS = 10 * 60000;
  var MAX_ITEMS = 30;

  // The sequences of the writes, by tool name.
  api.WRITE_TOOLS = {
    tools_nocode_form_create: "nocode-form-create",
    tools_nocode_form_edit: "nocode-form-edit",
    tools_nocode_form_update: "nocode-form-update",
    tools_nocode_form_publish: "nocode-form-publish",
    tools_nocode_app_create: "nocode-app-create",
    tools_nocode_baserow_schema_apply: "nocode-baserow-schema-apply"
  };
  // Never part of what a call changes: the credential, the reveal hint, what the router adds.
  var IGNORED_ARGUMENTS = { token: true, reveal: true, confirmId: true, conversationId: true, browserDebugPort: true, _showExperimental: true, __nolog: true, _nextCursor: true, _progressToken: true, _meta: true };

  function trimmed(value) {
    return value == null ? "" : String(value).trim();
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function conversationIdOf(value) {
    var id = trimmed(value);
    return /^[A-Za-z0-9._-]{1,128}$/.test(id) ? id : "";
  }

  // A JSON text the agent passed for an object or an array (operations, spec, schema, patch, reduced) is that value.
  function parsed(value) {
    if (typeof value === "string") {
      var text = value.trim();
      if (text.charAt(0) === "{" || text.charAt(0) === "[") {
        try {
          return JSON.parse(text);
        } catch (_notJson) {}
      }
    }
    return value;
  }

  function list(value) {
    value = parsed(value);
    return value == null ? [] : (Array.isArray(value) ? value : [value]);
  }

  function truthy(value) {
    return value === true || /^(true|1|yes)$/i.test(trimmed(value));
  }

  // The owner of the conversations, as the Assistant names it: C8Oforms signs an OAuth user in as
  // "provider:subject:email", and the conversations, the panel and the choice go by the email.
  api.owner = function (user) {
    var text = trimmed(user);
    var parts = text.split(":");
    var last = parts[parts.length - 1];
    return parts.length > 2 && last.indexOf("@") > 0 ? last : text;
  };

  // Whether the call writes: schema-apply in plan mode, an app in plan mode and a publication without confirm do not.
  api.holds = function (sequence, args) {
    if (!hasOwn(api.WRITE_TOOLS, String(sequence))) {
      return false;
    }
    args = args || {};
    if (sequence === "tools_nocode_baserow_schema_apply") {
      return trimmed(args.mode).toLowerCase() === "apply";
    }
    if (sequence === "tools_nocode_app_create") {
      var spec = parsed(args.spec);
      return !(spec && typeof spec === "object" && trimmed(spec.mode).toLowerCase() === "plan");
    }
    if (sequence === "tools_nocode_form_publish") {
      return truthy(args.confirm);
    }
    return true;
  };

  function canonical(value) {
    value = parsed(value);
    if (Array.isArray(value)) {
      return "[" + value.map(canonical).join(",") + "]";
    }
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ":" + canonical(value[key]);
      }).join(",") + "}";
    }
    return JSON.stringify(value == null ? null : value);
  }

  // The same change called again gives the same text, whatever the order of its keys or a JSON text for an object.
  api.fingerprint = function (sequence, args) {
    var kept = {};
    Object.keys(args || {}).forEach(function (key) {
      if (!IGNORED_ARGUMENTS[key] && args[key] != null && trimmed(args[key]) !== "") {
        kept[key] = args[key];
      }
    });
    var text = String(sequence) + ":" + canonical(kept);
    var hash = 5381;
    for (var i = 0; i < text.length; i++) {
      hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16) + ":" + text.length;
  };

  // ---- What the change does, for the card ----------------------------------------------------------------------
  // Items name what the user knows: a field by its name (and its label), a page by its name, a flow by its name. The
  // panel words them in the user's language.

  function plain(text, max) {
    var value = trimmed(text).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return value.length > max ? value.substring(0, max - 1) + "…" : value;
  }

  function fieldOf(form, op) {
    var id = trimmed(op.fieldId || op.componentId || op.id);
    var name = trimmed(op.fieldName || op.componentName || op.name);
    var fields = list(form && form.formulaire);
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i] || {};
      if ((id.length && trimmed(field.id) === id) || (name.length && trimmed(field.name) === name)) {
        return field;
      }
    }
    return null;
  }

  function pageName(form, op) {
    var tech = trimmed(op.pageTechName);
    var name = trimmed(op.pageName);
    var pages = list(form && form.pages);
    for (var i = 0; i < pages.length; i++) {
      var page = pages[i] || {};
      if ((tech.length && trimmed(page.pageTechName) === tech) || (name.length && trimmed(page.name) === name)) {
        return trimmed(page.name) || trimmed(page.pageTechName);
      }
    }
    return name || tech;
  }

  function flowName(form, id) {
    var flows = list(form && form.flows);
    for (var i = 0; i < flows.length; i++) {
      var flow = flows[i] || {};
      if (trimmed(flow.id) === trimmed(id) || trimmed(flow.name) === trimmed(id)) {
        return trimmed(flow.name) || trimmed(flow.id);
      }
    }
    return trimmed(id);
  }

  function changedKeys(patch) {
    var keys = [];
    var walk = function (value, prefix) {
      if (value && typeof value === "object" && !Array.isArray(value) && prefix.split(".").length < 3) {
        Object.keys(value).forEach(function (key) { walk(value[key], prefix.length ? prefix + "." + key : key); });
      } else if (prefix.length && keys.length < 6) {
        keys.push(prefix);
      }
    };
    walk(parsed(patch) || {}, "");
    return keys;
  }

  var ACTION_ALIASES = {
    add_component: "add_field", add_element: "add_field",
    update_component: "update_field", update_element: "update_field",
    remove_component: "remove_field", remove_element: "remove_field", delete_component: "remove_field",
    delete_element: "remove_field", delete_field: "remove_field",
    move_component: "move_field", move_element: "move_field",
    delete_page: "remove_page", delete_flow: "remove_flow", delete_flow_element: "remove_flow_element",
    set_media: "set_root"
  };

  function operationItems(op, form, items) {
    op = op || {};
    if (!op.action && !op.op && !op.type) {
      if (op.operation && typeof op.operation === "object") {
        return operationItems(op.operation, form, items);
      }
      if (op.operations != null) {
        list(op.operations).forEach(function (nested) { operationItems(nested, form, items); });
        return;
      }
    }
    var action = trimmed(op.action || op.op || op.type).toLowerCase();
    action = ACTION_ALIASES[action] || action;
    var item = { action: action };
    if (/_field$/.test(action)) {
      var field = action === "add_field" ? (parsed(op.fieldObject) || {}) : (fieldOf(form, op) || {});
      item.target = trimmed(field.name) || trimmed(op.fieldName || op.fieldId);
      var label = plain(field.label || (field.config && field.config.label) || field.title || "", 60);
      if (label.length && label !== item.target) {
        item.label = label;
      }
      if (trimmed(field.type).length) {
        item.kind = trimmed(field.type);
      }
      if (action === "add_field" || action === "move_field") {
        var parent = trimmed(op.parentFieldId).length ? fieldOf(form, { fieldId: op.parentFieldId }) : null;
        item.page = parent ? trimmed(parent.name) : pageName(form, op);
      }
      if (action === "update_field") {
        item.keys = changedKeys(op.patch);
      }
    } else if (/_page$/.test(action)) {
      item.target = action === "add_page" ? trimmed(op.name) : pageName(form, op);
      if (action === "update_page") {
        item.keys = changedKeys(op.patch);
      }
    } else if (action === "add_flow" || action === "update_flow" || action === "remove_flow") {
      item.target = action === "add_flow" ? (trimmed(op.name) || trimmed(op.flowId)) : flowName(form, op.flowId || op.flowName || op.name);
    } else if (/_flow_element$/.test(action)) {
      item.flow = flowName(form, op.flowId || op.flowName || op.toFlowId || op.fromFlowId);
      var element = parsed(op.element) || {};
      if (trimmed(element.type).length) {
        item.kind = trimmed(element.type);
      }
    }
    if (items.length < MAX_ITEMS) {
      items.push(item);
    } else if (items.length === MAX_ITEMS) {
      items.push({ action: "more" });
    }
  }

  function countFields(fields) {
    var count = 0;
    list(fields).forEach(function (field) {
      count++;
      if (field && typeof field === "object") {
        count += countFields(field.fields) + countFields(field.children);
      }
    });
    return count;
  }

  // {formId, formName, items}. form: the saved form the call changes (edit, update, publish), null otherwise.
  api.summary = function (sequence, args, form) {
    args = args || {};
    var items = [];
    var summary = { formId: trimmed(args.id), formName: trimmed(form && form.name), items: items };
    if (sequence === "tools_nocode_form_edit") {
      var operations = list(args.operations);
      if (!operations.length && args.operation != null) {
        operations = list(args.operation);
      }
      operations.forEach(function (op) { operationItems(parsed(op), form, items); });
    } else if (sequence === "tools_nocode_form_update") {
      items.push({ action: "update_form", keys: changedKeys(args.patch) });
    } else if (sequence === "tools_nocode_form_publish") {
      items.push({ action: "publish", target: summary.formName || summary.formId, access: trimmed(args.access) });
    } else if (sequence === "tools_nocode_form_create") {
      var reduced = parsed(args.reduced) || {};
      summary.formName = trimmed(reduced.name);
      items.push({ action: "create_form", target: summary.formName, pages: list(reduced.pages).length, fields: list(reduced.pages).reduce(function (n, page) { return n + countFields(page && page.fields); }, 0) });
    } else if (sequence === "tools_nocode_app_create") {
      var spec = parsed(args.spec) || {};
      summary.formName = trimmed(spec.name);
      items.push({ action: "create_app", target: summary.formName, tables: list(spec.entities).map(function (entity) { return trimmed(entity && (entity.plural || entity.name || entity.table)); }).filter(function (name) { return name.length; }).slice(0, 10) });
    } else if (sequence === "tools_nocode_baserow_schema_apply") {
      var schema = parsed(args.schema) || {};
      var base = schema.base && typeof schema.base === "object" ? schema.base.name : schema.base;
      summary.formName = trimmed(schema.baseName || base || schema.databaseName);
      items.push({ action: "apply_schema", target: summary.formName, tables: list(schema.tables).map(function (table) { return trimmed(table && (table.name || table.tableName)); }).filter(function (name) { return name.length; }).slice(0, 10) });
    }
    if (!items.length) {
      items.push({ action: "change" });
    }
    return summary;
  };

  // ---- The store --------------------------------------------------------------------------------------------------

  function readJson(map, key) {
    var json = map == null ? null : map.get(key);
    if (json == null) {
      return null;
    }
    try {
      return JSON.parse(String(json));
    } catch (_unreadable) {
      return null;
    }
  }

  // The user's choice: off unless the Assistant wrote it on.
  api.isOn = function (store, user) {
    var choice = readJson(store.get(CONFIRM_KEY), "user:" + api.owner(user).toLowerCase());
    return !!choice && choice.on === true;
  };

  function granted(store, conversationId, user, now) {
    var grant = readJson(store.get(CONFIRM_KEY), "grant:" + conversationId);
    return !!grant && trimmed(grant.user).toLowerCase() === user.toLowerCase() && now - Number(grant.at || 0) < GRANT_MS;
  }

  function requestsOf(store, conversationId, host) {
    if (store.get(REQUESTS_KEY) == null) {
      // context.server has no putIfAbsent: only the first request of the engine creates the map of the conversations
      store.set(REQUESTS_KEY, host.newMap());
    }
    var conversations = store.get(REQUESTS_KEY);
    conversations.putIfAbsent(conversationId, host.newMap());
    return conversations.get(conversationId);
  }

  function keysOf(map) {
    var ids = [];
    var keys = map.keySet().toArray();
    for (var i = 0; i < keys.length; i++) {
      ids.push(String(keys[i]));
    }
    return ids;
  }

  // compare-and-set on the JSON string: the panel may have answered meanwhile
  function update(map, id, before, changes) {
    var next = JSON.parse(JSON.stringify(before));
    Object.keys(changes).forEach(function (key) { next[key] = changes[key]; });
    return map.replace(id, JSON.stringify(before), JSON.stringify(next)) ? next : null;
  }

  function sweep(map, now) {
    keysOf(map).forEach(function (id) {
      var request = readJson(map, id);
      if (!request || now - Number(request.createdAt || 0) > KEEP_MS) {
        map.remove(id);
      }
    });
  }

  var OPEN = { pending: true, taken: true };
  var ANSWERED = { allowed: true, allowed_turn: true, refused: true, expired: true };

  // The request of this change, open or answered and not used yet; a card of the same form and tool that nobody waits
  // for any more (the agent changed the call) is closed: the new one replaces it.
  function requestFor(map, user, sequence, fingerprint, formId, now) {
    var found = null;
    keysOf(map).forEach(function (id) {
      var request = readJson(map, id);
      if (!request || request.kind !== "write-confirm" || trimmed(request.user).toLowerCase() !== user.toLowerCase()) {
        return;
      }
      if (request.fingerprint === fingerprint && (OPEN[request.status] || ANSWERED[request.status])) {
        found = found || request;
      } else if (OPEN[request.status] && request.sequence === sequence && trimmed(request.formId) === trimmed(formId)
          && now >= Number(request.waitUntil || 0)) {
        update(map, id, request, { status: "expired", reason: "replaced" });
      }
    });
    return found;
  }

  // ---- The answers ------------------------------------------------------------------------------------------------

  function refused(tool, reason) {
    var messages = {
      user: "The user refused this change on the confirmation card of the Tigo panel: nothing was saved. Do not retry it, nor a variant of it. Ask the user in one sentence what they want instead.",
      no_answer: "The user did not answer the confirmation card within 5 minutes: nothing was saved. Do not retry the change: tell the user in one sentence what you wanted to change and ask whether to do it.",
      turn_end: "The turn ended before the user answered the confirmation card: nothing was saved.",
      replaced: "A later call replaced this change on the confirmation card: nothing was saved by this call.",
      cannot_ask: "The user asked to confirm every change, and this session cannot show them the confirmation card: nothing was saved. Tell the user, and that turning off \"Confirmer avant de modifier\" next to the input bar lets you make the change."
    };
    return { status: "refused", saved: false, reason: reason, tool: tool, message: messages[reason] || messages.no_answer };
  }

  // An agent that stopped calling after a few waits ended its turn saying the card still waited, while the end of the
  // turn had closed it (usage tests 31/10): the answer gives the time the card stays open and what ending the turn does.
  function awaiting(tool, request, now) {
    var left = Math.max(0, Math.ceil((Number(request.expiresAt || 0) - now) / 1000));
    return {
      status: "awaiting_confirmation",
      saved: false,
      tool: tool,
      requestId: request.id,
      secondsLeft: left,
      message: "The change waits for the user's answer on the confirmation card of the Tigo panel, open " + left +
        " s more. Call " + tool + " again with exactly the same arguments to keep waiting, and change nothing else" +
        " meanwhile. Do not end your turn while the card is open: the end of the turn closes it and nothing is saved."
    };
  }

  // null: the call goes on. Otherwise what the agent gets instead of the tool's answer.
  // who: {user (the authenticated No Code user), conversationId (X-Convertigo-Conversation-Id)}.
  // host: server() -> {get, set}, newMap(), getForm(id, project) -> the saved form or null, now(), sleep(ms), uuid().
  api.run = function (sequence, args, who, host) {
    args = args || {};
    if (!api.holds(sequence, args)) {
      return null;
    }
    var user = api.owner(who && who.user);
    if (!user.length) {
      return null;
    }
    var tool = api.WRITE_TOOLS[sequence];
    var store = host.server();
    var conversationId = conversationIdOf(who && who.conversationId);
    var fingerprint = api.fingerprint(sequence, args);
    var now = host.now();
    var conversations = store.get(REQUESTS_KEY);
    var map = conversationId.length && conversations != null ? conversations.get(conversationId) : null;
    var request = map != null ? requestFor(map, user, sequence, fingerprint, args.id, now) : null;
    if (!request) {
      // An open card is answered even after the user switched off; without one, the choice decides.
      if (!api.isOn(store, user)) {
        return null;
      }
      if (!conversationId.length) {
        return refused(tool, "cannot_ask");
      }
      if (granted(store, conversationId, user, now)) {
        return null;
      }
      var form = trimmed(args.id).length && sequence !== "tools_nocode_form_create" ? host.getForm(trimmed(args.id), trimmed(args.project) || "C8Oforms") : null;
      var summary = api.summary(sequence, args, form);
      map = requestsOf(store, conversationId, host);
      sweep(map, now);
      request = {
        id: "wc-" + host.uuid(),
        kind: "write-confirm",
        conversationId: conversationId,
        user: user,
        sequence: sequence,
        tool: tool,
        formId: summary.formId,
        formName: summary.formName,
        items: summary.items,
        fingerprint: fingerprint,
        createdAt: now,
        expiresAt: now + EXPIRES_MS,
        waitUntil: now + WAIT_MS,
        status: "pending",
        takenAt: 0,
        decidedAt: 0
      };
      map.put(request.id, JSON.stringify(request));
    } else if (OPEN[request.status]) {
      request = update(map, request.id, request, { waitUntil: now + WAIT_MS }) || readJson(map, request.id) || request;
    }
    var until = now + WAIT_MS;
    while (true) {
      now = host.now();
      var raw = map.get(request.id);
      var current = readJson(map, request.id);
      if (!current) {
        return refused(tool, "no_answer");
      }
      if (current.status === "allowed" || current.status === "allowed_turn") {
        // used once: two calls of the same change would otherwise both go on
        if (map.remove(current.id, raw)) {
          return null;
        }
        continue;
      }
      if (current.status === "refused" || current.status === "expired") {
        map.remove(current.id);
        return refused(tool, current.status === "refused" ? "user" : (current.reason === "turn_end" || current.reason === "replaced" ? current.reason : "no_answer"));
      }
      if (now > Number(current.expiresAt || 0)) {
        if (update(map, current.id, current, { status: "expired", reason: "no_answer" })) {
          map.remove(current.id);
          return refused(tool, "no_answer");
        }
        continue;
      }
      if (now >= until) {
        return awaiting(tool, current, now);
      }
      host.sleep(POLL_MS);
    }
  };

  // The host of the engine: the shared store and the saved form, read with the user's No Code token.
  api.javaHost = function () {
    return {
      server: function () {
        return context.server;
      },
      newMap: function () {
        return new java.util.concurrent.ConcurrentHashMap();
      },
      getForm: function (id, project) {
        try {
          if (typeof C8O.nocodeForms === "undefined" || typeof C8O.nocodeForms.get !== "function") {
            include("js/nocode_forms.js");
          }
          var read = C8O.nocodeForms.get(id, { project: project });
          var form = read && read.res ? read.res : read;
          return form && form.fetched !== false && form._id ? form : null;
        } catch (_unreadable) {
          return null;
        }
      },
      now: function () {
        return Number(java.lang.System.currentTimeMillis());
      },
      sleep: function (ms) {
        java.lang.Thread.sleep(ms);
      },
      uuid: function () {
        return String(java.util.UUID.randomUUID());
      }
    };
  };
})(C8O.nocodeWriteConfirm);
