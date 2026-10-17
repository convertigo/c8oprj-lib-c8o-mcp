/*
 * image-describe: a vision model of the Convertigo LLM gateway (OpenAI-compatible LiteLLM) describes an
 * image for an agent that cannot see one, such as GLM 5.3 ("Image input is not enabled for this model").
 * The gateway key stays server side: the workspace key file used by lib_ConvertigoAgentBridge
 * (<user workspace>/agents/convertigo/llm-api-key, first line), else CONVERTIGO_LLM_API_KEY. It is never
 * returned, logged or echoed in an error. Every call returns its usage (model, tokens, gateway cost) so
 * that the Agent Bridge can add it to the conversation usage per model.
 */
if (typeof C8O === "undefined") { var C8O = {}; }
C8O.imageDescribe = C8O.imageDescribe || {};

(function (api) {
  var GATEWAY_URL = "https://llm.convertigo.com/v1";
  var DEFAULT_MODEL = "mistral/mistral-large-4";
  var KEY_ENV = "CONVERTIGO_LLM_API_KEY";
  var MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  var DEFAULT_MAX_TOKENS = 2000;
  var REQUEST_TIMEOUT_MS = 120000;
  var DEFAULT_QUESTION = "Describe this screenshot for a developer who cannot see it: the visible text, the layout, " +
    "the colors, and anything that looks broken (overlapping, cut off, misaligned, empty, unreadable or error states).";
  var SYSTEM_PROMPT = "You describe images for a software agent that cannot see them. Answer the question about the image " +
    "precisely and factually. Quote visible text exactly. Give positions (top, left, inside the card, ...), sizes relative " +
    "to each other and colors when they matter. Report visual defects plainly. Say what you cannot read or are unsure of " +
    "instead of guessing. No preamble.";

  api.GATEWAY_URL = GATEWAY_URL;
  api.DEFAULT_MODEL = DEFAULT_MODEL;
  api.MAX_IMAGE_BYTES = MAX_IMAGE_BYTES;

  function str(value) {
    return value == null ? "" : String(value).trim();
  }

  function byteAt(bytes, index) {
    return Number(bytes[index]) & 0xff;
  }

  // The content decides the type, never the file name: anything else than a PNG, JPEG or WebP image is refused.
  api.detectMimeType = function (bytes) {
    var length = bytes ? Number(bytes.length) : 0;
    if (length >= 8 && byteAt(bytes, 0) === 0x89 && byteAt(bytes, 1) === 0x50 && byteAt(bytes, 2) === 0x4e &&
      byteAt(bytes, 3) === 0x47 && byteAt(bytes, 4) === 0x0d && byteAt(bytes, 5) === 0x0a && byteAt(bytes, 6) === 0x1a &&
      byteAt(bytes, 7) === 0x0a) {
      return "image/png";
    }
    if (length >= 3 && byteAt(bytes, 0) === 0xff && byteAt(bytes, 1) === 0xd8 && byteAt(bytes, 2) === 0xff) {
      return "image/jpeg";
    }
    if (length >= 12 && byteAt(bytes, 0) === 0x52 && byteAt(bytes, 1) === 0x49 && byteAt(bytes, 2) === 0x46 &&
      byteAt(bytes, 3) === 0x46 && byteAt(bytes, 8) === 0x57 && byteAt(bytes, 9) === 0x45 && byteAt(bytes, 10) === 0x42 &&
      byteAt(bytes, 11) === 0x50) {
      return "image/webp";
    }
    return "";
  };

  // Raw base64 or a data URL; whitespace is ignored.
  api.stripBase64 = function (text) {
    var value = str(text);
    var match = /^data:[^;,]*(?:;[^,]*)?,/i.exec(value);
    if (match) {
      value = value.substring(match[0].length);
    }
    value = value.replace(/\s+/g, "");
    if (!value.length || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
      throw new Error("base64 must be a base64 image or a data:image/...;base64, URL.");
    }
    return value;
  };

  api.normalizeMaxTokens = function (value) {
    var parsed = parseInt(str(value), 10);
    if (isNaN(parsed)) {
      return DEFAULT_MAX_TOKENS;
    }
    return Math.max(200, Math.min(8000, parsed));
  };

  api.buildRequest = function (options) {
    return {
      model: options.model,
      max_tokens: options.maxTokens,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: options.question },
            { type: "image_url", image_url: { url: "data:" + options.mimeType + ";base64," + options.base64 } }
          ]
        }
      ]
    };
  };

  function numberOrNull(value) {
    if (value === null || value === undefined || str(value) === "") {
      return null;
    }
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : null;
  }

  function contentText(content) {
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      var parts = [];
      for (var i = 0; i < content.length; i++) {
        if (content[i] && typeof content[i].text === "string") {
          parts.push(content[i].text);
        }
      }
      return parts.join("\n");
    }
    return "";
  }

  // usage.tool marks the result for the Agent Bridge, which sums these calls per model in the conversation usage;
  // callId (the gateway call id) lets it count a call once even when the agent echoes the result elsewhere.
  api.usageOf = function (body, requestedModel, costHeader, durationMs, callId) {
    var usage = (body && body.usage) || {};
    var inputTokens = Number(usage.prompt_tokens) || 0;
    var outputTokens = Number(usage.completion_tokens) || 0;
    var details = usage.completion_tokens_details || {};
    var promptDetails = usage.prompt_tokens_details || {};
    var cost = numberOrNull(costHeader);
    if (cost === null) {
      cost = numberOrNull(usage.cost);
    }
    return {
      tool: "image-describe",
      callId: str(callId) || str(body && body.id),
      model: str(body && body.model) || requestedModel,
      inputTokens: inputTokens,
      cachedTokens: Number(promptDetails.cached_tokens) || 0,
      outputTokens: outputTokens,
      reasoningTokens: Number(details.reasoning_tokens) || 0,
      totalTokens: Number(usage.total_tokens) || inputTokens + outputTokens,
      cost: cost,
      currency: cost === null ? "" : "USD",
      durationMs: durationMs
    };
  };

  api.redact = function (text, key) {
    var value = String(text == null ? "" : text);
    if (key && key.length >= 4) {
      value = value.split(key).join("[redacted]");
    }
    return value.replace(/\bsk-[A-Za-z0-9_\-.]{4,}/g, "sk-[redacted]");
  };

  function gatewayError(status, bodyText, key) {
    var message = "";
    try {
      var parsed = JSON.parse(bodyText);
      var error = parsed && parsed.error;
      message = error && typeof error === "object" ? str(error.message) : str(error || parsed.detail);
    } catch (_notJson) {
      message = str(bodyText);
    }
    if (message.length > 600) {
      message = message.substring(0, 600) + "...";
    }
    var hint = status === 401 || status === 403
      ? " Check the Convertigo agent key of this Studio (the same key Tigo uses)."
      : (/image input/i.test(message) ? " This model does not read images: use another model, for example " + DEFAULT_MODEL + "." : "");
    return new Error("The LLM gateway refused the image request (HTTP " + status + "): " + api.redact(message, key) + hint);
  }

  // host: readKey(), readImageFile(path) -> {bytes, path}, decodeBase64(text) -> bytes, encodeBase64(bytes) -> text,
  // post(url, key, bodyText, timeoutMs) -> {status, body, header(name)}, now() -> ms.
  api.run = function (params, host) {
    params = params || {};
    var pathText = str(params.path);
    var base64Text = str(params.base64);
    if ((pathText.length ? 1 : 0) + (base64Text.length ? 1 : 0) !== 1) {
      throw new Error("Give exactly one image: path (a PNG, JPEG or WebP file of the Studio workspace) or base64.");
    }
    var image = { source: pathText.length ? "file" : "base64" };
    var bytes;
    if (pathText.length) {
      var file = host.readImageFile(pathText);
      bytes = file.bytes;
      image.path = file.path;
    } else {
      bytes = host.decodeBase64(api.stripBase64(base64Text));
    }
    if (!bytes || !bytes.length) {
      throw new Error("The image is empty.");
    }
    if (bytes.length > MAX_IMAGE_BYTES) {
      throw new Error("The image is larger than 10 MB: take a smaller screenshot (one element, or a smaller viewport).");
    }
    image.mimeType = api.detectMimeType(bytes);
    image.bytes = Number(bytes.length);
    if (!image.mimeType) {
      throw new Error("Only PNG, JPEG and WebP images are supported.");
    }
    var model = str(params.model) || DEFAULT_MODEL;
    var question = str(params.question) || DEFAULT_QUESTION;
    var key = str(host.readKey());
    if (!key.length) {
      throw new Error("No Convertigo agent key in this Studio: set it from the Tigo assistant (the same key the agent uses), " +
        "or define " + KEY_ENV + " for the Studio process.");
    }
    var request = api.buildRequest({
      model: model,
      question: question,
      mimeType: image.mimeType,
      base64: host.encodeBase64(bytes),
      maxTokens: api.normalizeMaxTokens(params.maxTokens)
    });
    var started = host.now();
    var response;
    try {
      response = host.post(GATEWAY_URL + "/chat/completions", key, JSON.stringify(request), REQUEST_TIMEOUT_MS);
    } catch (e) {
      throw new Error("The LLM gateway could not be reached: " + api.redact(e && e.message ? e.message : e, key));
    }
    var durationMs = host.now() - started;
    if (response.status < 200 || response.status >= 300) {
      throw gatewayError(response.status, response.body, key);
    }
    var body;
    try {
      body = JSON.parse(response.body);
    } catch (_invalidBody) {
      throw new Error("The LLM gateway answered with an unreadable body (HTTP " + response.status + ").");
    }
    var choice = (body.choices && body.choices[0]) || {};
    var description = str(contentText(choice.message && choice.message.content));
    var result = {
      description: description,
      model: str(body.model) || model,
      usage: api.usageOf(body, model, response.header("x-litellm-response-cost"), durationMs, response.header("x-litellm-call-id")),
      image: image
    };
    if (choice.finish_reason === "length") {
      result.truncated = true;
      result.warning = description.length
        ? "The answer was cut at maxTokens; raise maxTokens or ask a narrower question."
        : "The model spent maxTokens before answering; raise maxTokens or ask a narrower question.";
    } else if (!description.length) {
      result.warning = "The model returned no text.";
    }
    return result;
  };

  // Roots an image path may resolve into: the Studio user workspace (where the managed Playwright MCP writes
  // its screenshots, .playwright-mcp/) and the projects folder. A relative path is tried in that order.
  api.javaHost = function () {
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    var File = java.io.File;
    var Files = java.nio.file.Files;
    var roots = [];
    [Engine.USER_WORKSPACE_PATH, Engine.PROJECTS_PATH].forEach(function (root) {
      if (str(root).length) {
        roots.push(new File(String(root)).getCanonicalFile());
      }
    });
    function inside(file) {
      for (var i = 0; i < roots.length; i++) {
        if (file.toPath().startsWith(roots[i].toPath())) {
          return true;
        }
      }
      return false;
    }
    return {
      readKey: function () {
        try {
          var keyFile = new File(new File(new File(String(Engine.USER_WORKSPACE_PATH), "agents"), "convertigo"), "llm-api-key");
          if (keyFile.isFile()) {
            var first = str(String(new java.lang.String(Files.readAllBytes(keyFile.toPath()), "UTF-8")).split(/\r?\n/)[0]);
            if (first.length && first.indexOf("#") !== 0) {
              return first;
            }
          }
        } catch (_noKeyFile) {}
        return str(java.lang.System.getenv(KEY_ENV));
      },
      readImageFile: function (pathText) {
        var candidates = [];
        var given = new File(pathText);
        if (given.isAbsolute()) {
          candidates.push(given.getCanonicalFile());
        } else {
          for (var i = 0; i < roots.length; i++) {
            candidates.push(new File(roots[i], pathText).getCanonicalFile());
          }
        }
        var file = null;
        for (var j = 0; j < candidates.length && file === null; j++) {
          if (inside(candidates[j]) && candidates[j].isFile()) {
            file = candidates[j];
          }
        }
        if (file === null) {
          var outside = candidates.length && !inside(candidates[0]);
          throw new Error(outside
            ? "path must be inside the Studio workspace (" + roots.map(String).join(" or ") + ")."
            : "Image not found: " + pathText + " (relative paths start from " + roots.map(String).join(" then ") + ").");
        }
        if (file.length() > MAX_IMAGE_BYTES) {
          throw new Error("The image is larger than 10 MB: take a smaller screenshot (one element, or a smaller viewport).");
        }
        return { bytes: Files.readAllBytes(file.toPath()), path: String(file.getPath()) };
      },
      decodeBase64: function (text) {
        try {
          return java.util.Base64.getMimeDecoder().decode(String(text).replace(/-/g, "+").replace(/_/g, "/"));
        } catch (_badBase64) {
          throw new Error("base64 must be a base64 image or a data:image/...;base64, URL.");
        }
      },
      encodeBase64: function (bytes) {
        return String(java.util.Base64.getEncoder().encodeToString(bytes));
      },
      post: function (url, key, bodyText, timeoutMs) {
        var Http = java.net.http;
        var client = Http.HttpClient.newBuilder().connectTimeout(java.time.Duration.ofSeconds(20)).build();
        var request = Http.HttpRequest.newBuilder(java.net.URI.create(url))
          .timeout(java.time.Duration.ofMillis(timeoutMs))
          .header("Content-Type", "application/json")
          .header("Authorization", "Bearer " + key)
          .POST(Http.HttpRequest.BodyPublishers.ofString(bodyText, java.nio.charset.StandardCharsets.UTF_8))
          .build();
        var response = client.send(request, Http.HttpResponse.BodyHandlers.ofString(java.nio.charset.StandardCharsets.UTF_8));
        return {
          status: Number(response.statusCode()),
          body: String(response.body()),
          header: function (name) {
            var value = response.headers().firstValue(name);
            return value.isPresent() ? String(value.get()) : "";
          }
        };
      },
      now: function () {
        return Number(java.lang.System.currentTimeMillis());
      }
    };
  };

  // Private alone is not an HTTP authentication boundary in Eclipse Studio, and this tool spends gateway credits:
  // the full MCP bearer is checked again here, as tools_tigo_resources does.
  api.execute = function (contextObject, params) {
    var auth = C8O.mcpAuth.authenticateRequest(contextObject);
    if (!auth.authenticated || auth.kind === "nocode" || auth.scope !== "mcp:full") {
      throw new Error("A full Convertigo MCP bearer token is required");
    }
    return api.run(params, api.javaHost());
  };
})(C8O.imageDescribe);
