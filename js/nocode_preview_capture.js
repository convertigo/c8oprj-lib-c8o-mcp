/*
 * nocode-form-preview-capture for lib_ConvertigoMCP: an image of the preview of a form, taken by the C8Oforms page the
 * user has open (its tab shared with getDisplayMedia, one click per session), never by a browser of the server.
 *
 * The tool leaves a request in the store the server shares between projects (context.server), under the Tigo
 * conversation of the call (X-Convertigo-Conversation-Id): lib_ConvertigoAssistant.hostRequests is a map of the
 * conversations, each one a map of its requests, one JSON string per request. The Tigo panel takes it while it reads the turn (readResponse), passes it to the page, and
 * the page's image comes back through lib_ConvertigoAssistant.AgentHostRequestResult, which writes the PNG in the
 * conversation's attachments and marks the request done (or failed with a reason). The tool waits 25 s at most, then
 * answers pending with a captureId the agent gives back to keep waiting. A request nobody took expires after 60 s.
 * The image is described for the agent with the key of the user's agent (image-describe): the No Code models do not
 * see images. Design: "Capture de l'aperçu No Code par le vrai navigateur" (23/10).
 * Requires js/nocode_forms.js (form access, No Code token) and js/tools_image_describe.js.
 */

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.nocodePreviewCapture = C8O.nocodePreviewCapture || {};

(function (api) {
  var STORE_KEY = "lib_ConvertigoAssistant.hostRequests";
  var WAIT_MS = 25000;
  var POLL_MS = 250;
  // a request nobody took, or a capture the page never finished, stops waiting after this
  var EXPIRES_MS = 60000;
  // requests kept for a conversation after their end (a late pending call can still read them)
  var KEEP_MS = 10 * 60000;
  var DEVICES = { desktop: true, mobile: true };

  var REASONS = {
    sharing_off: "The user did not allow Tigo to see the preview in time (the card \"Autoriser l'aperçu\" in the Tigo panel shares the tab for the session).",
    declined: "The user declined to share the preview.",
    no_page: "No No Code Studio page with this Tigo conversation took the request: the preview can only be captured while the user has No Code Studio open with Tigo.",
    unsupported: "This version of No Code Studio cannot capture a preview yet.",
    unsupported_browser: "This browser cannot share a tab (Safari): the preview can be captured in Chrome or Edge.",
    render_timeout: "The preview did not finish rendering within 10 s.",
    timeout: "The page did not answer within 60 s.",
    no_conversation: "The call names no Tigo conversation, so no page can take the request."
  };

  function trimmed(value) {
    return value == null ? "" : String(value).trim();
  }

  function conversationIdOf(value) {
    var id = trimmed(value);
    return /^[A-Za-z0-9._-]{1,128}$/.test(id) ? id : "";
  }

  // The owner of the conversations, as the Assistant names it (agent_bridge_client.js callerUserId): C8Oforms signs an
  // OAuth user in as "provider:subject:email", and the conversations, the Vibe home and the panel go by the email.
  api.owner = function (user) {
    var text = trimmed(user);
    var parts = text.split(":");
    var last = parts[parts.length - 1];
    return parts.length > 2 && last.indexOf("@") > 0 ? last : text;
  };

  // The same folder name as the Assistant and the Bridge give a user (agent_workspace_image.js userPathSlug).
  api.userPathSlug = function (value, sha256Hex) {
    var text = trimmed(value);
    if (!text.length || text.toLowerCase() === "studio") {
      return "studio";
    }
    var readable = text.toLowerCase().replace(/[^A-Za-z0-9_.-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
    if (!readable.length) {
      readable = "user";
    }
    if (readable.length > 80) {
      readable = readable.substring(0, 80).replace(/[_.-]+$/g, "");
    }
    return readable + "--" + sha256Hex(text).substring(0, 16);
  };

  // What the description checks: the exact texts, the layout and the visual defects of the preview.
  api.question = function (device, question) {
    var text = "This is a screenshot of the preview of a No Code form (" + (device === "mobile" ? "phone, 390 px wide" : "desktop, 1280 px wide") +
      "). Transcribe every visible text exactly (titles, labels, buttons, values, messages), describe the layout from top to bottom, " +
      "and report any visual defect: cut, hidden or overlapping elements, empty areas, unreadable contrast, misaligned controls.";
    return trimmed(question).length ? text + " Then answer: " + trimmed(question) : text;
  };

  function unavailable(reason, captureId) {
    return {
      status: "unavailable",
      reason: reason,
      captureId: captureId || "",
      message: (REASONS[reason] || REASONS.timeout) + " Tell the user in one sentence, do not ask for a capture again in this turn, and rely on nocode-form-validate."
    };
  }

  function readRequest(map, id) {
    var json = map.get(id);
    return json == null ? null : JSON.parse(String(json));
  }

  // compare-and-set on the JSON string: the panel or the result may have changed it meanwhile
  function update(map, id, before, changes) {
    var next = JSON.parse(JSON.stringify(before));
    for (var key in changes) {
      if (Object.prototype.hasOwnProperty.call(changes, key)) {
        next[key] = changes[key];
      }
    }
    return map.replace(id, JSON.stringify(before), JSON.stringify(next)) ? next : null;
  }

  function sweep(map, now) {
    var ids = [];
    var keys = map.keySet().toArray();
    for (var i = 0; i < keys.length; i++) {
      ids.push(String(keys[i]));
    }
    ids.forEach(function (id) {
      try {
        var request = readRequest(map, id);
        if (request && now - Number(request.createdAt || 0) > KEEP_MS) {
          map.remove(id);
        }
      } catch (_unreadable) {
        map.remove(id);
      }
    });
  }

  function captured(request, host, params) {
    var result = request.result || {};
    var answer = {
      status: "captured",
      captureId: request.id,
      formId: request.formId,
      page: request.page,
      device: request.device,
      path: trimmed(result.path),
      width: Number(result.width) || 0,
      height: Number(result.height) || 0
    };
    try {
      var described = host.describe({ path: trimmed(result.absolutePath) || trimmed(result.path), question: api.question(request.device, params.question) }, request.user);
      answer.description = described.description;
      answer.model = described.model;
      answer.usage = described.usage;
      if (described.warning) {
        answer.warning = described.warning;
      }
    } catch (e) {
      answer.descriptionError = "The capture is saved but could not be described: " + (e && e.message ? e.message : e);
    }
    return answer;
  }

  // host: header(name), server() -> {get(key), set(key, value)}, newMap() -> a ConcurrentHashMap, getForm(id, project, token) -> nocode-form-get
  // answer, describe({path, question}, user), now(), sleep(ms), uuid().
  api.run = function (params, host) {
    params = params || {};
    var formId = trimmed(params.formId || params.id);
    if (!formId.length) {
      return { status: "error", error: { code: "missing_form", message: "formId is required: the id of the form whose preview to capture." } };
    }
    var device = trimmed(params.device).toLowerCase() || "desktop";
    if (!DEVICES[device]) {
      return { status: "error", error: { code: "invalid_device", message: "device is desktop (1280 px) or mobile (390 px)." } };
    }
    var read = host.getForm(formId, trimmed(params.project) || "C8Oforms", trimmed(params.token));
    if (!read || read.status === "auth_required") {
      return { status: "error", error: { code: "auth_required", message: "No Code assistant authentication is required." } };
    }
    if (read.status !== "ok" || !read.form) {
      return { status: "error", error: { code: "forbidden", message: "The form " + formId + " cannot be read with the user's rights: no capture is requested." } };
    }
    var user = api.owner(read.authentication && read.authentication.user);
    // set by the MCP router from X-Convertigo-Conversation-Id
    var conversationId = conversationIdOf(params.conversationId) || conversationIdOf(host.header("X-Convertigo-Conversation-Id"));
    if (!conversationId.length || !user.length) {
      return unavailable("no_conversation");
    }
    // context.server has no putIfAbsent: only the first capture of the engine creates the map of the conversations
    var store = host.server();
    if (store.get(STORE_KEY) == null) {
      store.set(STORE_KEY, host.newMap());
    }
    var conversations = store.get(STORE_KEY);
    conversations.putIfAbsent(conversationId, host.newMap());
    var map = conversations.get(conversationId);
    var now = host.now();
    sweep(map, now);
    var captureId = trimmed(params.captureId);
    var request;
    if (captureId.length) {
      request = readRequest(map, captureId);
      if (!request || trimmed(request.user).toLowerCase() !== user.toLowerCase()) {
        return { status: "error", error: { code: "unknown_capture", message: "No capture " + captureId + " waits in this conversation: request a new one without captureId." } };
      }
    } else {
      request = {
        id: "cap-" + host.uuid(),
        kind: "preview-capture",
        conversationId: conversationId,
        user: user,
        formId: formId,
        formName: trimmed(read.form.name),
        page: trimmed(params.page),
        device: device,
        createdAt: now,
        expiresAt: now + EXPIRES_MS,
        status: "pending",
        takenAt: 0,
        note: "",
        result: null,
        error: null
      };
      map.put(request.id, JSON.stringify(request));
    }
    var until = now + WAIT_MS;
    while (true) {
      now = host.now();
      request = readRequest(map, request.id);
      if (!request) {
        return unavailable("timeout", captureId);
      }
      if (request.status === "done") {
        map.remove(request.id);
        return captured(request, host, params);
      }
      if (request.status === "failed") {
        map.remove(request.id);
        return unavailable(trimmed(request.error && request.error.reason) || "timeout", request.id);
      }
      if (request.status === "pending" && now > Number(request.expiresAt || 0)) {
        if (update(map, request.id, request, { status: "failed", error: { reason: "no_page" } })) {
          map.remove(request.id);
          return unavailable("no_page", request.id);
        }
        continue;
      }
      if (request.status === "taken" && now - Number(request.takenAt || 0) > EXPIRES_MS) {
        var reason = trimmed(request.note) || "timeout";
        if (update(map, request.id, request, { status: "failed", error: { reason: reason } })) {
          map.remove(request.id);
          return unavailable(reason, request.id);
        }
        continue;
      }
      if (now >= until) {
        return {
          status: "pending",
          captureId: request.id,
          message: request.status === "taken" && request.note === "sharing_off"
            ? "The user is asked to allow the preview in the Tigo panel: call nocode-form-preview-capture again with this captureId to keep waiting."
            : "The page is still capturing: call nocode-form-preview-capture again with this captureId to keep waiting."
        };
      }
      host.sleep(POLL_MS);
    }
  };

  // The host of the engine: the shared store, the request headers, nocode-form-get, image-describe with the key of
  // the user's agent (their VIBE_HOME .env, else the key of the server).
  api.javaHost = function () {
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    var File = java.io.File;
    var Files = java.nio.file.Files;
    function sha256Hex(text) {
      var bytes = java.security.MessageDigest.getInstance("SHA-256").digest(new java.lang.String(text).getBytes("UTF-8"));
      var hex = "";
      for (var i = 0; i < bytes.length; i++) {
        var n = Number(bytes[i]) & 0xff;
        hex += (n < 16 ? "0" : "") + n.toString(16);
      }
      return hex;
    }
    function userAgentKey(user) {
      try {
        var env = new File(String(Engine.USER_WORKSPACE_PATH) + "/agents/vibe/homes-convertigo/users/" + api.userPathSlug(user, sha256Hex) + "/.vibe-home/.env");
        if (env.isFile()) {
          var lines = String(new java.lang.String(Files.readAllBytes(env.toPath()), "UTF-8")).split(/\r?\n/);
          for (var i = 0; i < lines.length; i++) {
            var match = /^\s*CONVERTIGO_LLM_API_KEY\s*=\s*"?([^"\s]+)"?\s*$/.exec(lines[i]);
            if (match) {
              return match[1];
            }
          }
        }
      } catch (_noUserKey) {}
      return "";
    }
    return {
      header: function (name) {
        var request = typeof context !== "undefined" && context ? context.httpServletRequest : null;
        return request ? trimmed(request.getHeader(name)) : "";
      },
      server: function () {
        return context.server;
      },
      newMap: function () {
        return new java.util.concurrent.ConcurrentHashMap();
      },
      getForm: function (id, project, token) {
        return C8O.nocodeForms.get(id, { project: project, token: token });
      },
      describe: function (params, user) {
        var host = C8O.imageDescribe.javaHost();
        var serverKey = host.readKey;
        host.readKey = function () {
          return userAgentKey(user) || serverKey();
        };
        return C8O.imageDescribe.run(params, host);
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
})(C8O.nocodePreviewCapture);
