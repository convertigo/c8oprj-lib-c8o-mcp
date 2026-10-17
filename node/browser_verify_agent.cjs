#!/usr/bin/env node
/*
 * browser-verify sub-agent: a vision model of the Convertigo LLM gateway (default mistral/mistral-large-4) drives the
 * Studio browser through Playwright over CDP, walks the paths it is given, looks at its own screenshots and returns a
 * short report. It runs as a child process of the MCP tool browser-verify (js/tools_browser_verify.js), with a small
 * fresh context of its own, so the main agent spends one tool call instead of one model step per click.
 *
 * It only observes: no project, file or Convertigo tool, only the page. Screenshots go to config.outDir.
 *
 * Input: one JSON object on stdin (see normalizeConfig). The gateway key comes from CONVERTIGO_LLM_API_KEY and is
 * never written anywhere. Output: one JSON line on stdout {report, usage, ...}; diagnostics go to stderr.
 */
"use strict";

var fs = require("fs");
var path = require("path");

var DEFAULTS = {
  gatewayUrl: "https://llm.convertigo.com/v1",
  model: "mistral/mistral-large-4",
  reasoning: "none",
  maxSteps: 40,
  timeBudgetMs: 240000,
  actionTimeoutMs: 6000,
  maxTokens: 3000,
  keepImages: 2,
  keepSnapshots: 3,
  keepResults: 6
};

var SNAPSHOT_LIMIT = 7000;
var AUTO_SNAPSHOT_LIMIT = 3500;
var FINISH_RESERVE_MS = 30000;

function str(value) {
  return value == null ? "" : String(value).trim();
}

function clampInt(value, fallback, min, max) {
  var parsed = parseInt(str(value), 10);
  if (isNaN(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function asList(value) {
  if (value == null || value === "") {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    var text = value.trim();
    if (text.charAt(0) === "[") {
      try {
        var parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (_notJson) {}
    }
    return text.split(/\r?\n/).map(function (line) { return line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim(); })
      .filter(function (line) { return line.length > 0; });
  }
  return [value];
}

function normalizeConfig(raw) {
  raw = raw || {};
  var paths = asList(raw.paths).map(function (item, index) {
    if (item && typeof item === "object") {
      return { name: str(item.name) || "Path " + (index + 1), steps: str(item.steps || item.description || item.path) };
    }
    return { name: "Path " + (index + 1), steps: str(item) };
  }).filter(function (item) { return item.steps.length > 0; });
  if (!paths.length) {
    throw new Error("paths is required: at least one path to check, in plain language.");
  }
  if (!str(raw.cdpEndpoint).length && !(raw.launch && typeof raw.launch === "object")) {
    throw new Error("No browser: cdpEndpoint is required.");
  }
  if (!str(raw.outDir).length) {
    throw new Error("outDir is required.");
  }
  var reasoning = str(raw.reasoning).toLowerCase() || DEFAULTS.reasoning;
  if (reasoning !== "none" && reasoning !== "high") {
    throw new Error("reasoning must be none or high.");
  }
  return {
    gatewayUrl: str(raw.gatewayUrl) || DEFAULTS.gatewayUrl,
    model: str(raw.model) || DEFAULTS.model,
    reasoning: reasoning,
    cdpEndpoint: str(raw.cdpEndpoint),
    launch: raw.launch && typeof raw.launch === "object" ? raw.launch : null,
    url: str(raw.url),
    paths: paths,
    checks: asList(raw.checks).map(str).filter(function (c) { return c.length > 0; }),
    context: str(raw.context),
    language: str(raw.language),
    outDir: path.resolve(str(raw.outDir)),
    outPrefix: str(raw.outPrefix),
    callId: str(raw.callId) || "verify-" + Date.now().toString(36),
    maxSteps: clampInt(raw.maxSteps, DEFAULTS.maxSteps, 4, 80),
    timeBudgetMs: clampInt(raw.timeBudgetMs, DEFAULTS.timeBudgetMs, 30000, 900000),
    actionTimeoutMs: clampInt(raw.actionTimeoutMs, DEFAULTS.actionTimeoutMs, 1000, 30000),
    maxTokens: clampInt(raw.maxTokens, DEFAULTS.maxTokens, 300, 8000),
    maxCostUsd: isFinite(Number(raw.maxCostUsd)) && Number(raw.maxCostUsd) > 0 ? Number(raw.maxCostUsd) : 0,
    usageTool: str(raw.usageTool) || "browser-verify",
    profile: str(raw.profile) || "verifier",
    viewport: raw.viewport && raw.viewport.width && raw.viewport.height
      ? { width: clampInt(raw.viewport.width, 1280, 320, 3840), height: clampInt(raw.viewport.height, 800, 320, 2160) }
      : null,
    playwrightModule: str(raw.playwrightModule) || "playwright-core"
  };
}

var SYSTEM_PROMPT = [
  "You are a browser verification agent. Another agent built a web application and asks you to prove that given paths work and look right. You drive the browser with the tools, you look at your screenshots, and you finish with a short factual report. You report; you never fix.",
  "",
  "Rules:",
  "- You only observe and use the application like a user (log in, click, fill forms, as the paths say). You never change its code, configuration or files, and you never read its source: no fetch of scripts, bundles or routes, no study of how it is built.",
  "- When a step's precondition already holds (for example the app is already signed in and shows its home page), say so in the evidence and go on. When a step stays blocked after two attempts, mark its checks not_checked with what you saw and go to the next path: every path must get its turn. Each tool result ends with the time and turns used so far.",
  "- Walk each path once, exactly as written. Never repeat an action that changes data (save, declare, delete, submit...) to get a better result: the first outcome is the result. Retry only an action that did not happen (the tool returned an error), once, another way.",
  "- Read the result right after the action that should produce it, and quote it exactly. A check passes only on evidence you saw: the exact text or value read, or what a screenshot shows. Anything different from what the path or check expects is a failure, even if it looks minor.",
  "- Be fast: a few tool calls per path; several independent tool calls may go in one turn. The page snapshot (accessibility tree) comes back after each click, navigation, key press and scroll. Use evaluate only for a value no other tool gives.",
  "- To see what lies below the screen, use scroll, then screenshot. Ionic apps scroll inside ion-content, not the body: a body with overflow hidden and a document as high as the screen are normal, never a defect; a full-page screenshot does not show such content.",
  "- Targets: copy them from the snapshot as role \"name\" (for example button \"Save\" or textbox \"Email\"), or use text=Some text, label=Email, placeholder=Search, or a CSS selector. Add nth (0-based) when several elements match.",
  "- On each page or state a check depends on: take a screenshot and LOOK at it, run layout_check, and read every visible text. Report as visual defects: texts glued together without a space, overlapping elements, cut or overflowing text, unreadable or low-contrast text, misaligned or broken layout, empty areas where data is expected, error messages or raw technical values shown to the user, and, for French text, every word missing its accent (for example Declarer for Déclarer, selection for sélection, Comptabilite for Comptabilité, a jour for à jour). layout_check lists geometric suspects: a hidden-text entry means a text is covered by another element (a card over a title, a block over a button), report it when the screenshot shows that text missing or partly covered; keep the other suspects a screenshot confirms.",
  "- Finish with the finish tool, in the language of the paths: one entry per acceptance check (or per path when there is none), and every visual defect seen. Keep it short.",
].join("\n");

function buildTask(config) {
  var lines = [];
  if (config.url.length) {
    lines.push("Application: " + config.url);
  } else {
    lines.push("Application: the page currently open in the browser.");
  }
  if (config.context.length) {
    lines.push("Context from the requesting agent: " + config.context);
  }
  lines.push("");
  lines.push("Paths to walk and check, in order:");
  config.paths.forEach(function (item, index) {
    lines.push((index + 1) + ". " + item.name + ": " + item.steps);
  });
  if (config.checks.length) {
    lines.push("");
    lines.push("Acceptance checks (report each one):");
    config.checks.forEach(function (check, index) {
      lines.push("- C" + (index + 1) + ": " + check);
    });
  }
  lines.push("");
  lines.push("Budget: at most " + config.maxSteps + " model turns and " + Math.round(config.timeBudgetMs / 1000) +
    " s in all. Start now" + (config.url.length ? " by navigating to the application." : " with a snapshot."));
  return lines.join("\n");
}

var TOOLS = [
  tool("navigate", "Open a URL in the current tab. Returns the page snapshot.", {
    url: { type: "string", description: "Absolute URL, or a path relative to the current page." }
  }, ["url"]),
  tool("snapshot", "Accessibility tree of the current page (roles, names, values), with its URL and title.", {}, []),
  tool("click", "Click an element. Returns the page snapshot after the click.", targetProps({}), ["target"]),
  tool("fill", "Type a value into an input or textarea (replaces its content).", targetProps({
    value: { type: "string" }
  }), ["target", "value"]),
  tool("select", "Choose an option of a select element, by label or value.", targetProps({
    value: { type: "string" }
  }), ["target", "value"]),
  tool("check", "Tick or untick a checkbox, radio or toggle.", targetProps({
    checked: { type: "boolean", description: "true to tick (default), false to untick." }
  }), ["target"]),
  tool("press", "Press a key on the focused element or on a target, for example Enter or Escape. Returns the page snapshot.", targetProps({
    key: { type: "string" }
  }), ["key"]),
  tool("wait_for", "Wait until a text appears (or disappears with gone true), or for a delay. At most 10 s.", {
    text: { type: "string" },
    gone: { type: "boolean" },
    ms: { type: "integer", description: "Plain delay in milliseconds when no text is given." }
  }, []),
  tool("scroll", "Scroll the page the way a user does: the app's own scroll container (Ionic scrolls inside ion-content, not the body), or bring a target into view. Returns the snapshot.", targetProps({
    to: { type: "string", enum: ["down", "up", "top", "bottom"], description: "Without target: one screen down or up, or to the top or bottom." }
  }), []),
  tool("read_text", "Visible text of the elements matching a target (all matches, up to 20), or of the whole page without target.", {
    target: { type: "string" }
  }, []),
  tool("screenshot", "Take a screenshot of the viewport (or the full page, or one element) and look at it. Saved as evidence.", {
    name: { type: "string", description: "Short file name, for example login or list-after-declare." },
    fullPage: { type: "boolean" },
    target: { type: "string", description: "Optional element to capture alone." }
  }, ["name"]),
  tool("layout_check", "Geometric scan of the visible page: overlapping texts or controls, text cut by its box, texts glued to their neighbour without a space, elements outside the viewport. Suspects only: confirm on a screenshot.", {}, []),
  tool("evaluate", "Run a short read-only JavaScript expression on the current page and return its JSON value: a computed style, a count, an attribute or a value. Never change the page, never fetch anything, never read scripts or source code.", {
    expression: { type: "string" }
  }, ["expression"]),
  tool("finish", "Final report. Call it once, at the end.", {
    verdict: { type: "string", enum: ["passed", "failed", "partial"], description: "passed when every check passed and no blocking defect was seen." },
    summary: { type: "string", description: "Two or three sentences." },
    checks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "C1, C2... for the acceptance checks, P1, P2... for a path without explicit check." },
          path: { type: "string" },
          check: { type: "string" },
          status: { type: "string", enum: ["passed", "failed", "not_checked"] },
          evidence: { type: "string", description: "What was seen: exact text, value, or screenshot finding." },
          screenshot: { type: "string", description: "Screenshot name that shows it, if any." }
        },
        required: ["check", "status", "evidence"]
      }
    },
    visualDefects: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["blocking", "major", "minor"] },
          description: { type: "string" },
          location: { type: "string", description: "Page and area." },
          screenshot: { type: "string" }
        },
        required: ["description"]
      }
    }
  }, ["verdict", "summary", "checks"])
];

function tool(name, description, properties, required) {
  return {
    type: "function",
    "function": {
      name: name,
      description: description,
      parameters: { type: "object", properties: properties, required: required }
    }
  };
}

function targetProps(extra) {
  var props = {
    target: { type: "string", description: "role=button[name=\"...\"], text=..., label=..., placeholder=..., or a CSS selector." },
    nth: { type: "integer", description: "0-based index when several elements match." }
  };
  for (var key in extra) {
    props[key] = extra[key];
  }
  return props;
}

// ---------------------------------------------------------------------------------------------------------------
// Gateway

function createGateway(config, key, fetchImpl) {
  var usage = {
    tool: config.usageTool,
    callId: config.callId,
    runId: config.callId,
    profile: config.profile,
    model: config.model,
    requests: 0,
    inputTokens: 0,
    cachedTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    cost: 0,
    pricedRequests: 0,
    currency: "USD",
    durationMs: 0
  };
  var reasoning = config.reasoning;

  function add(body, headers, started) {
    var u = (body && body.usage) || {};
    var input = Number(u.prompt_tokens) || 0;
    var output = Number(u.completion_tokens) || 0;
    usage.requests++;
    usage.inputTokens += input;
    usage.outputTokens += output;
    usage.cachedTokens += Number((u.prompt_tokens_details || {}).cached_tokens) || 0;
    usage.reasoningTokens += Number((u.completion_tokens_details || {}).reasoning_tokens) || 0;
    usage.totalTokens += Number(u.total_tokens) || input + output;
    usage.durationMs += Date.now() - started;
    var costText = headers && headers.get ? headers.get("x-litellm-response-cost") : null;
    var cost = costText == null || costText === "" ? Number(u.cost) : Number(costText);
    if (costText != null && costText !== "" && isFinite(cost)) {
      usage.cost += cost;
      usage.pricedRequests++;
    } else if (u.cost != null && isFinite(cost)) {
      usage.cost += cost;
      usage.pricedRequests++;
    }
    if (body && body.model) {
      usage.model = String(body.model);
    }
  }

  async function post(request) {
    var lastError = null;
    // The gateway limits requests per minute and per key, a key the main agent shares: on HTTP 429 wait as long as it
    // asks (Retry-After), else longer each time, up to 75 s of waiting in all, instead of failing the verification.
    var waitedMs = 0;
    for (var attempt = 0; attempt < 6; attempt++) {
      var started = Date.now();
      var response;
      try {
        response = await fetchImpl(config.gatewayUrl.replace(/\/+$/, "") + "/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(120000)
        });
      } catch (e) {
        lastError = new Error("The LLM gateway could not be reached: " + redact(e && e.message ? e.message : e, key));
        await sleep(1500 * (attempt + 1));
        continue;
      }
      var text = await response.text();
      if (response.status === 400 && request.reasoning_effort && /reasoning_effort/i.test(text)) {
        delete request.reasoning_effort;
        reasoning = "";
        continue;
      }
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error("The LLM gateway answered HTTP " + response.status + ": " + redact(text.substring(0, 300), key));
        var retryAfter = Number(response.headers && response.headers.get ? response.headers.get("retry-after") : NaN);
        var wait = response.status === 429
          ? (isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(30000, 5000 * Math.pow(2, attempt)))
          : 2000 * (attempt + 1);
        wait = Math.min(wait, 30000, Math.max(0, 75000 - waitedMs));
        if (wait <= 0) {
          break;
        }
        waitedMs += wait;
        if (typeof config.onWait === "function") {
          config.onWait(response.status, wait);
        }
        await sleep(wait);
        continue;
      }
      if (response.status < 200 || response.status >= 300) {
        throw new Error("The LLM gateway refused the request (HTTP " + response.status + "): " + redact(text.substring(0, 600), key));
      }
      var body;
      try {
        body = JSON.parse(text);
      } catch (_badBody) {
        throw new Error("The LLM gateway answered with an unreadable body (HTTP " + response.status + ").");
      }
      add(body, response.headers, started);
      return body;
    }
    throw lastError || new Error("The LLM gateway failed.");
  }

  return {
    usage: usage,
    complete: function (messages, options) {
      var request = {
        model: config.model,
        max_tokens: config.maxTokens,
        messages: messages,
        tools: TOOLS,
        tool_choice: (options && options.toolChoice) || "auto"
      };
      if (reasoning) {
        request.reasoning_effort = reasoning;
      }
      return post(request);
    },
    spentCost: function () {
      return usage.cost;
    },
    finalUsage: function () {
      var result = {};
      for (var k in usage) {
        result[k] = usage[k];
      }
      result.cost = usage.requests > 0 && usage.pricedRequests === usage.requests ? round(usage.cost) : null;
      result.currency = result.cost === null ? "" : "USD";
      delete result.pricedRequests;
      return result;
    }
  };
}

function round(value) {
  return Math.round(value * 1e8) / 1e8;
}

function redact(text, key) {
  var value = String(text == null ? "" : text);
  if (key && key.length >= 4) {
    value = value.split(key).join("[redacted]");
  }
  return value.replace(/\bsk-[A-Za-z0-9_\-.]{4,}/g, "sk-[redacted]");
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// ---------------------------------------------------------------------------------------------------------------
// Browser

async function openBrowser(config, playwright) {
  var browser;
  if (config.cdpEndpoint.length) {
    browser = await playwright.chromium.connectOverCDP(config.cdpEndpoint, { timeout: 15000 });
  } else {
    browser = await playwright.chromium.launch(config.launch);
  }
  var context = browser.contexts()[0] || await browser.newContext(config.viewport ? { viewport: config.viewport } : {});
  var pages = context.pages().filter(function (p) {
    var url = p.url();
    return !/^devtools:|^chrome-extension:/.test(url);
  });
  var page = null;
  if (config.url.length) {
    var origin = originOf(config.url);
    page = pages.filter(function (p) { return origin && originOf(p.url()) === origin; })[0] || null;
  }
  if (!page) {
    page = pages.filter(function (p) { return /^https?:/.test(p.url()); })[0] || pages[0] || null;
  }
  if (!page) {
    // The Studio viewer exposes one page and cannot open another one over CDP.
    if (config.cdpEndpoint.length) {
      throw new Error("The Studio browser shows no page: open the application with mobile-builder-open, then call again.");
    }
    page = await context.newPage();
  }
  if (config.viewport && !config.cdpEndpoint.length) {
    await page.setViewportSize(config.viewport);
  }
  return { browser: browser, context: context, page: page, startUrl: page.url() };
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch (_badUrl) {
    return "";
  }
}

function locate(page, target, nth) {
  var text = str(target);
  if (!text.length) {
    throw new Error("target is required.");
  }
  var locator;
  var match;
  if ((match = /^([a-z]+)\s+"((?:[^"\\]|\\.)*)"(?:\s*\[.*\])?$/.exec(text)) && ARIA_ROLES.test(match[1])) {
    // The snapshot notation: button "Save", textbox "Email".
    locator = page.getByRole(match[1], { name: match[2].replace(/\\(.)/g, "$1") });
  } else if ((match = /^label=(.+)$/i.exec(text))) {
    locator = page.getByLabel(unquote(match[1]));
  } else if ((match = /^placeholder=(.+)$/i.exec(text))) {
    locator = page.getByPlaceholder(unquote(match[1]));
  } else if ((match = /^text=(.+)$/i.exec(text)) && !/^["']/.test(match[1])) {
    locator = page.getByText(match[1].trim());
  } else {
    locator = page.locator(text);
  }
  if (nth !== undefined && nth !== null && nth !== "") {
    return { locator: locator.nth(Number(nth)), nth: Number(nth) };
  }
  return { locator: locator, nth: null };
}

var ARIA_ROLES = /^(alert|alertdialog|button|cell|checkbox|columnheader|combobox|dialog|gridcell|heading|img|link|listbox|listitem|menu|menubar|menuitem|menuitemcheckbox|menuitemradio|navigation|option|radio|region|row|rowheader|searchbox|slider|spinbutton|switch|tab|tablist|tabpanel|textbox|treeitem)$/;

function unquote(text) {
  var value = text.trim();
  if (/^".*"$|^'.*'$/.test(value)) {
    return value.substring(1, value.length - 1);
  }
  return value;
}

async function single(page, args) {
  var found = locate(page, args.target, args.nth);
  if (found.nth !== null) {
    return { locator: found.locator, note: "" };
  }
  var count = await found.locator.count();
  if (count === 0) {
    // Not attached yet: let the action wait for it.
    return { locator: found.locator.first(), note: "" };
  }
  var visible = found.locator.filter({ visible: true });
  var visibleCount = await visible.count().catch(function () { return 0; });
  if (visibleCount >= 1) {
    return { locator: visible.first(), note: visibleCount > 1 ? " (first of " + visibleCount + " visible matches; use nth to pick another)" : "" };
  }
  return { locator: found.locator.first(), note: count > 1 ? " (first of " + count + " matches)" : "" };
}

async function fillable(locator) {
  var tag = await locator.evaluate(function (el) {
    return el.tagName.toLowerCase() + (el.isContentEditable ? ":editable" : "");
  });
  if (/^(input|textarea|select)$/.test(tag) || /:editable$/.test(tag)) {
    return locator;
  }
  // Ionic and other wrappers (ion-input, mat-form-field...): the native control is inside.
  return locator.locator("input, textarea, select").first();
}

async function ariaSnapshot(page, limit) {
  var text;
  try {
    text = await page.locator("body").ariaSnapshot({ timeout: 5000 });
  } catch (e) {
    text = "(snapshot failed: " + shortError(e) + ")";
  }
  var title = "";
  try {
    title = await page.title();
  } catch (_noTitle) {}
  var header = "URL: " + page.url() + "\nTitle: " + title + "\n";
  if (text.length > limit) {
    text = text.substring(0, limit) + "\n... (snapshot cut at " + limit + " characters; use read_text or a narrower target)";
  }
  return header + text;
}

async function settle(page) {
  try {
    await page.waitForLoadState("domcontentloaded", { timeout: 3000 });
  } catch (_slow) {}
  await sleep(400);
}

function shortError(e) {
  var message = String(e && e.message ? e.message : e);
  message = message.replace(/\u001b\[[0-9;]*m/g, "");
  var cut = message.indexOf("Call log:");
  if (cut > 0) {
    message = message.substring(0, cut);
  }
  return message.trim().substring(0, 400);
}

function safeName(name, fallback) {
  var value = str(name).toLowerCase().replace(/\.png$/i, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return value.substring(0, 60) || fallback;
}

// Runs in the page. Visible text leaves and controls, through open shadow roots. Reports, most reliable first: a text
// hidden under another element (hit test at the text's own points), texts overlapping each other, a text touching the
// next one with no space between, a text cut by its own box, and elements outside the viewport.
function layoutScan() {
  var vw = window.innerWidth, vh = window.innerHeight;
  var items = [];
  function visible(el) {
    var style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) {
      return false;
    }
    var r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  }
  function label(el) {
    var text = (el.innerText || el.value || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
    return el.tagName.toLowerCase() + (text ? " \"" + text.substring(0, 50) + "\"" : "");
  }
  // Containment across shadow boundaries: an ion-button contains the button of its shadow root.
  function within(outer, node) {
    for (var n = node; n; n = n.parentNode || n.host) {
      if (n === outer) {
        return true;
      }
    }
    return false;
  }
  function related(x, y) {
    return within(x, y) || within(y, x);
  }
  function hitAt(x, y) {
    var hit = document.elementFromPoint(x, y);
    while (hit && hit.shadowRoot && hit.shadowRoot.elementFromPoint) {
      var inner = hit.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === hit) {
        break;
      }
      hit = inner;
    }
    return hit;
  }
  function collect(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    var node = walker.currentNode;
    while (node) {
      if (node.shadowRoot) {
        collect(node.shadowRoot);
      }
      var el = node;
      if (el.nodeType === 1 && visible(el)) {
        var tag = el.tagName.toLowerCase();
        var ownText = "";
        for (var c = el.firstChild; c; c = c.nextSibling) {
          if (c.nodeType === 3) {
            ownText += c.nodeValue;
          }
        }
        ownText = ownText.replace(/\s+/g, " ").trim();
        var control = /^(button|input|select|textarea|a|ion-button|ion-input|ion-select|ion-checkbox)$/.test(tag);
        if (ownText.length || control) {
          items.push({ el: el, rect: el.getBoundingClientRect(), text: ownText, control: control });
        }
      }
      node = walker.nextNode();
    }
  }
  collect(document.body);
  var hidden = [], others = [];
  var limit = 25;
  for (var i = 0; i < items.length; i++) {
    var a = items[i];
    var ra = a.rect;
    var inView = ra.bottom > 0 && ra.right > 0 && ra.top < vh && ra.left < vw;
    if (!inView) {
      continue;
    }
    if (ra.right > vw + 2) {
      others.push({ kind: "outside-viewport", element: label(a.el), right: Math.round(ra.right), viewport: vw });
    }
    if (a.text.length) {
      // The text's own points: its middle and near its start. Covered when the top element there is unrelated to it.
      var points = [[ra.left + ra.width / 2, ra.top + ra.height / 2], [ra.left + Math.min(6, ra.width / 4), ra.top + ra.height / 2]];
      for (var p = 0; p < points.length; p++) {
        var x = points[p][0], y = points[p][1];
        if (x < 0 || y < 0 || x >= vw || y >= vh) {
          continue;
        }
        var hit = hitAt(x, y);
        if (hit && !related(a.el, hit)) {
          hidden.push({ kind: "hidden-text", element: label(a.el), coveredBy: label(hit) });
          break;
        }
      }
      if (a.el.scrollWidth > a.el.clientWidth + 2 || a.el.scrollHeight > a.el.clientHeight + 4) {
        var style = getComputedStyle(a.el);
        if (style.overflow !== "visible" || style.textOverflow === "ellipsis") {
          others.push({ kind: "text-cut", element: label(a.el), scrollWidth: a.el.scrollWidth, width: a.el.clientWidth });
        }
      }
    }
    for (var j = i + 1; j < items.length && others.length < limit; j++) {
      var b = items[j];
      if (related(a.el, b.el) || !a.text.length || !b.text.length) {
        continue;
      }
      var rb = b.rect;
      var ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      var iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ix > 3 && iy > 3 && ix * iy > 0.15 * Math.min(ra.width * ra.height, rb.width * rb.height)) {
        others.push({ kind: "overlap", a: label(a.el), b: label(b.el), area: Math.round(ix * iy) });
        continue;
      }
      var sameLine = Math.abs((ra.top + ra.bottom) / 2 - (rb.top + rb.bottom) / 2) < Math.min(ra.height, rb.height) / 2;
      var gap = rb.left - ra.right;
      if (sameLine && gap >= -1 && gap < 1.5 &&
        /[\p{L}\p{N}:;,.!?)]$/u.test(a.text) && /^[\p{L}\p{N}(]/u.test(b.text)) {
        others.push({ kind: "glued-text", a: label(a.el), b: label(b.el), gap: Math.round(gap * 10) / 10 });
      }
    }
  }
  return { viewport: { width: vw, height: vh }, scanned: items.length, issues: hidden.slice(0, limit).concat(others).slice(0, limit) };
}

// ---------------------------------------------------------------------------------------------------------------
// Tool execution

function createTools(state, config) {
  var page = function () { return state.page; };
  var t = config.actionTimeoutMs;
  var shots = state.screenshots;

  async function withSnapshot(prefix) {
    await settle(page());
    return { text: prefix + "\n" + await ariaSnapshot(page(), AUTO_SNAPSHOT_LIMIT), snapshot: true };
  }

  return {
    navigate: async function (args) {
      var target = str(args.url);
      if (!target.length) {
        throw new Error("url is required.");
      }
      var absolute = new URL(target, page().url() && /^https?:/.test(page().url()) ? page().url() : (config.url || undefined)).href;
      await page().goto(absolute, { waitUntil: "domcontentloaded", timeout: 20000 });
      return withSnapshot("Navigated.");
    },
    snapshot: async function () {
      return { text: await ariaSnapshot(page(), SNAPSHOT_LIMIT), snapshot: true };
    },
    click: async function (args) {
      var found = await single(page(), args);
      await found.locator.click({ timeout: t });
      return withSnapshot("Clicked" + found.note + ".");
    },
    fill: async function (args) {
      var found = await single(page(), args);
      var control = await fillable(found.locator);
      await control.fill(String(args.value == null ? "" : args.value), { timeout: t });
      return { text: "Filled" + found.note + "." };
    },
    select: async function (args) {
      var found = await single(page(), args);
      var value = String(args.value == null ? "" : args.value);
      var tag = await found.locator.evaluate(function (el) { return el.tagName.toLowerCase(); });
      if (tag === "select") {
        try {
          await found.locator.selectOption({ label: value }, { timeout: t });
        } catch (_byLabel) {
          await found.locator.selectOption(value, { timeout: t });
        }
        return { text: "Selected" + found.note + "." };
      }
      // A custom select (ion-select, mat-select...): open it, then click the option text.
      await found.locator.click({ timeout: t });
      await sleep(300);
      await page().getByText(value, { exact: true }).filter({ visible: true }).first().click({ timeout: t });
      return withSnapshot("Opened the select and clicked the option" + found.note + ".");
    },
    check: async function (args) {
      var found = await single(page(), args);
      var checked = args.checked !== false;
      try {
        await found.locator.setChecked(checked, { timeout: t });
      } catch (_notNative) {
        await found.locator.click({ timeout: t });
      }
      return { text: (checked ? "Checked" : "Unchecked") + found.note + "." };
    },
    press: async function (args) {
      var key = str(args.key);
      if (!key.length) {
        throw new Error("key is required.");
      }
      if (str(args.target).length) {
        var found = await single(page(), args);
        await found.locator.press(key, { timeout: t });
      } else {
        await page().keyboard.press(key);
      }
      return withSnapshot("Pressed " + key + ".");
    },
    scroll: async function (args) {
      if (str(args.target).length) {
        var found = await single(page(), args);
        await found.locator.scrollIntoViewIfNeeded({ timeout: t });
        return withSnapshot("Scrolled to the target" + found.note + ".");
      }
      var to = str(args.to) || "down";
      var position = await page().evaluate(async function (direction) {
        // The visible ion-content's scroll element first, then the largest scrollable element, then the document.
        var scroller = null;
        var contents = Array.prototype.slice.call(document.querySelectorAll("ion-content"));
        for (var i = contents.length - 1; i >= 0 && !scroller; i--) {
          var rect = contents[i].getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && contents[i].getScrollElement) {
            scroller = await contents[i].getScrollElement();
          }
        }
        if (!scroller) {
          var best = null;
          Array.prototype.forEach.call(document.querySelectorAll("*"), function (el) {
            var style = getComputedStyle(el);
            if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 10 &&
              (!best || el.clientHeight * el.clientWidth > best.clientHeight * best.clientWidth)) {
              best = el;
            }
          });
          scroller = best || document.scrollingElement || document.documentElement;
        }
        var step = Math.round(scroller.clientHeight * 0.8);
        var top = direction === "top" ? 0 : direction === "bottom" ? scroller.scrollHeight :
          scroller.scrollTop + (direction === "up" ? -step : step);
        scroller.scrollTop = top;
        return { scrollTop: Math.round(scroller.scrollTop), scrollHeight: scroller.scrollHeight, height: scroller.clientHeight };
      }, to);
      return withSnapshot("Scrolled " + to + ": " + position.scrollTop + " of " + Math.max(0, position.scrollHeight - position.height) + " px.");
    },
    wait_for: async function (args) {
      var text = str(args.text);
      if (text.length) {
        var locator = page().getByText(text).first();
        await locator.waitFor({ state: args.gone ? "hidden" : "visible", timeout: 10000 });
        return { text: args.gone ? "The text is gone." : "The text is visible." };
      }
      var ms = clampInt(args.ms, 1000, 0, 10000);
      await sleep(ms);
      return { text: "Waited " + ms + " ms." };
    },
    read_text: async function (args) {
      if (!str(args.target).length) {
        var body = await page().locator("body").innerText({ timeout: t });
        return { text: cut(body, 5000), snapshot: true };
      }
      var found = locate(page(), args.target, args.nth);
      var texts = await found.locator.evaluateAll(function (els) {
        return els.slice(0, 20).map(function (el) {
          return (el.innerText || el.value || el.textContent || "").replace(/[ \t]+/g, " ").trim();
        });
      });
      if (!texts.length) {
        return { text: "No element matches " + args.target + "." };
      }
      return { text: texts.map(function (x, i) { return "[" + i + "] " + cut(x, 600); }).join("\n"), snapshot: true };
    },
    screenshot: async function (args) {
      var name = safeName(args.name, "shot-" + (shots.length + 1));
      if (shots.some(function (s) { return s.name === name; })) {
        name = name + "-" + (shots.length + 1);
      }
      var file = path.join(config.outDir, (config.outPrefix ? config.outPrefix : "") + name + ".png");
      var buffer;
      if (str(args.target).length) {
        var found = await single(page(), args);
        buffer = await found.locator.screenshot({ path: file, timeout: t, animations: "disabled", scale: "css" });
      } else {
        // CSS pixels: a 2x screen would double the image tokens without showing the model more.
        buffer = await page().screenshot({ path: file, fullPage: args.fullPage === true, timeout: 15000, animations: "disabled", scale: "css" });
      }
      shots.push({ name: name, file: file, url: page().url() });
      return { text: "Screenshot " + name + " (" + page().url() + "). Look at it:", image: buffer.toString("base64") };
    },
    layout_check: async function () {
      var scan = await page().evaluate(layoutScan);
      return { text: JSON.stringify(scan) };
    },
    evaluate: async function (args) {
      var expression = str(args.expression);
      if (!expression.length) {
        throw new Error("expression is required.");
      }
      var value = await page().evaluate(function (source) {
        // eslint-disable-next-line no-eval
        var result = (0, eval)(source);
        return Promise.resolve(result).then(function (v) {
          try {
            return JSON.stringify(v === undefined ? null : v);
          } catch (_cyclic) {
            return String(v);
          }
        });
      }, expression);
      return { text: cut(String(value), 1500) };
    }
  };
}

function cut(text, limit) {
  var value = String(text == null ? "" : text);
  return value.length > limit ? value.substring(0, limit) + "... (cut)" : value;
}

// Older screenshots and results are replaced by a short note, so the context stays small: the model keeps the last
// keepImages images, keepSnapshots page texts and keepResults other results whole.
function compactHistory(messages, config) {
  var images = 0, snapshots = 0, texts = 0;
  for (var i = messages.length - 1; i >= 0; i--) {
    var m = messages[i];
    if (m.role !== "tool") {
      continue;
    }
    if (Array.isArray(m.content)) {
      images++;
      if (images > DEFAULTS.keepImages) {
        m.content = m.content.filter(function (part) { return part.type === "text"; }).map(function (part) { return part.text; }).join("\n") +
          " (image no longer shown)";
      }
    } else {
      // Page texts: the last keepSnapshots stay whole; any other older result is cut short.
      texts++;
      if (m._snapshot) {
        snapshots++;
      }
      if (m.content.length > 400 && (m._snapshot ? snapshots > DEFAULTS.keepSnapshots : texts > DEFAULTS.keepResults)) {
        m.content = m.content.substring(0, 240) + "\n... (older result elided)";
        m._snapshot = false;
      }
    }
  }
}

function wireMessages(messages) {
  return messages.map(function (m) {
    var copy = {};
    for (var k in m) {
      if (k.charAt(0) !== "_") {
        copy[k] = m[k];
      }
    }
    return copy;
  });
}

function parseArgs(text) {
  if (text && typeof text === "object") {
    return text;
  }
  try {
    var parsed = JSON.parse(text || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_badArgs) {
    return null;
  }
}

function normalizeReport(args, config, shots) {
  var known = {};
  shots.forEach(function (s) {
    known[s.name] = s.file;
  });
  function shotPath(name) {
    var key = safeName(name, "");
    return key && known[key] ? known[key] : (str(name) || "");
  }
  var checks = Array.isArray(args.checks) ? args.checks : [];
  var defects = Array.isArray(args.visualDefects) ? args.visualDefects : [];
  var report = {
    verdict: /^(passed|failed|partial)$/.test(str(args.verdict)) ? str(args.verdict) : "partial",
    summary: str(args.summary),
    checks: checks.slice(0, 40).map(function (c) {
      c = c || {};
      return {
        id: str(c.id),
        path: str(c.path),
        check: str(c.check),
        status: /^(passed|failed|not_checked)$/.test(str(c.status)) ? str(c.status) : "not_checked",
        evidence: str(c.evidence),
        screenshot: shotPath(c.screenshot)
      };
    }),
    visualDefects: defects.slice(0, 30).map(function (d) {
      d = d || {};
      return {
        severity: /^(blocking|major|minor)$/.test(str(d.severity)) ? str(d.severity) : "minor",
        description: str(d.description),
        location: str(d.location),
        screenshot: shotPath(d.screenshot)
      };
    })
  };
  // A failed check or a blocking defect never yields a passed verdict.
  if (report.verdict === "passed" && (report.checks.some(function (c) { return c.status !== "passed"; }) ||
    report.visualDefects.some(function (d) { return d.severity === "blocking"; }))) {
    report.verdict = report.checks.some(function (c) { return c.status === "failed"; }) ? "failed" : "partial";
  }
  return report;
}

// ---------------------------------------------------------------------------------------------------------------
// Loop

async function run(rawConfig, deps) {
  var config = normalizeConfig(rawConfig);
  var started = Date.now();
  var key = str(deps.key);
  if (!key.length) {
    throw new Error("No gateway key.");
  }
  fs.mkdirSync(config.outDir, { recursive: true });
  var gateway = createGateway(config, key, deps.fetch || fetch);
  var browserState = await openBrowser(config, deps.playwright);
  var state = { page: browserState.page, screenshots: [] };
  var tools = createTools(state, config);
  var messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildTask(config) }
  ];
  var trace = [];
  var report = null;
  var turns = 0;
  var nudged = false;
  var forcing = false;
  var stopReason = "";

  while (!report) {
    var elapsed = Date.now() - started;
    // The last turns are kept for the report: the step, time or cost budget ends the walk a little before its limit.
    var overCost = config.maxCostUsd > 0 && gateway.spentCost() >= config.maxCostUsd * 0.85;
    var mustFinish = turns >= config.maxSteps - 1 || elapsed > config.timeBudgetMs - FINISH_RESERVE_MS || overCost;
    if (mustFinish && !forcing) {
      forcing = true;
      stopReason = turns >= config.maxSteps - 1 ? "step budget" : (overCost ? "cost budget" : "time budget");
      messages.push({ role: "user", content: "The " + stopReason + " is used up. Call finish now with what you have seen; mark what you could not check as not_checked." });
    }
    if (forcing && turns > config.maxSteps + 1) {
      break;
    }
    compactHistory(messages, config);
    var body = await gateway.complete(wireMessages(messages), forcing ? { toolChoice: "required" } : null);
    turns++;
    var choice = (body.choices && body.choices[0]) || {};
    var message = choice.message || {};
    var calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    var assistant = { role: "assistant", content: typeof message.content === "string" ? message.content : "" };
    if (calls.length) {
      assistant.tool_calls = calls.map(function (c) {
        return { id: c.id, type: "function", "function": { name: c["function"].name, arguments: c["function"].arguments || "{}" } };
      });
    }
    messages.push(assistant);
    if (!calls.length) {
      if (!nudged) {
        nudged = true;
        messages.push({ role: "user", content: "Continue with the tools, and end with the finish tool." });
        continue;
      }
      report = normalizeReport({ verdict: "partial", summary: str(assistant.content) || "The verification agent stopped without a report.", checks: [] }, config, state.screenshots);
      stopReason = stopReason || "no report";
      break;
    }
    for (var i = 0; i < calls.length; i++) {
      var call = calls[i];
      var name = call["function"] && call["function"].name;
      var args = parseArgs(call["function"] && call["function"].arguments);
      var callStarted = Date.now();
      var outcome;
      if (name === "finish" && args) {
        report = normalizeReport(args, config, state.screenshots);
        outcome = { text: "Report received." };
      } else if (!args) {
        outcome = { text: name === "finish" && choice.finish_reason === "length"
          ? "Error: the report was cut at the answer limit. Call finish again with shorter evidence."
          : "Error: the arguments are not valid JSON." };
      } else if (!Object.prototype.hasOwnProperty.call(tools, name)) {
        outcome = { text: "Error: unknown tool " + name + "." };
      } else {
        try {
          outcome = await tools[name](args);
        } catch (e) {
          outcome = { text: "Error: " + shortError(e) };
        }
      }
      trace.push({ turn: turns, tool: name, args: summarizeArgs(args), ms: Date.now() - callStarted, result: cut(outcome.text, 160).replace(/\s+/g, " ") });
      logActivity(config, { at: Date.now(), turn: turns, text: activityText(name, args, outcome) });
      var progress = "\n[" + Math.round((Date.now() - started) / 1000) + " s of " + Math.round(config.timeBudgetMs / 1000) +
        " s, turn " + turns + " of " + config.maxSteps + "]";
      var toolMessage = { role: "tool", tool_call_id: call.id, content: outcome.text + progress };
      if (outcome.image) {
        toolMessage.content = [
          { type: "text", text: outcome.text + progress },
          { type: "image_url", image_url: { url: "data:image/png;base64," + outcome.image } }
        ];
      } else if (outcome.snapshot) {
        toolMessage._snapshot = true;
      }
      messages.push(toolMessage);
    }
  }

  if (!report) {
    report = normalizeReport({ verdict: "partial", summary: "The verification agent did not send a report within its budget.", checks: [] }, config, state.screenshots);
  }
  var result = {
    report: report,
    screenshots: state.screenshots.map(function (s) { return { name: s.name, file: s.file, url: s.url }; }),
    finalUrl: state.page.url(),
    startUrl: browserState.startUrl,
    turns: turns,
    toolCalls: trace.length,
    stopReason: stopReason || "finished",
    durationMs: Date.now() - started,
    usage: gateway.finalUsage(),
    trace: trace
  };
  try {
    fs.writeFileSync(path.join(config.outDir, (config.outPrefix || "") + "report.json"), JSON.stringify(result, null, 2));
  } catch (_noReportFile) {}
  return result;
}

// One line per step in activity.jsonl: the calling agent sees it while the run goes on, and Tigo shows it in the block of
// the sub-agent.
function activityText(name, args, outcome) {
  args = args || {};
  var target = str(args.target || args.url || args.name || args.text || args.key || args.to || args.expression);
  var failed = /^Error:/.test(str(outcome && outcome.text));
  return (failed ? "! " : "") + name + (target ? " " + cut(target, 80) : "") + (failed ? " — " + cut(str(outcome.text).substring(7), 100) : "");
}

function logActivity(config, entry) {
  try {
    fs.appendFileSync(path.join(config.outDir, "activity.jsonl"), JSON.stringify(entry) + "\n");
  } catch (_noActivity) {}
}

function summarizeArgs(args) {
  if (!args) {
    return null;
  }
  var out = {};
  for (var k in args) {
    if (k === "checks" || k === "visualDefects" || k === "summary") {
      continue;
    }
    out[k] = typeof args[k] === "string" ? cut(args[k], 120) : args[k];
  }
  return out;
}

function readStdin() {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    process.stdin.on("data", function (c) { chunks.push(c); });
    process.stdin.on("end", function () { resolve(Buffer.concat(chunks).toString("utf8")); });
    process.stdin.on("error", reject);
  });
}

// The MCP tool returns before the agent ends; the agent releases the browser lock itself, and a watchdog makes sure it
// ends even if the browser or the gateway hangs.
function finish(output, lockFile) {
  process.stdout.write(JSON.stringify(output) + "\n", function () {
    if (lockFile) {
      try {
        fs.unlinkSync(lockFile);
      } catch (_noLock) {}
    }
    // The CDP connection stays open on purpose (closing it could close the Studio browser): exit instead.
    process.exit(0);
  });
}

async function main() {
  var key = process.env.CONVERTIGO_LLM_API_KEY || "";
  var output;
  var input = {};
  try {
    input = JSON.parse(await readStdin() || "{}");
    var budget = clampInt(input.timeBudgetMs, DEFAULTS.timeBudgetMs, 30000, 900000);
    setTimeout(function () {
      finish({ ok: false, error: "The verification agent was stopped after its time budget and 60 s more." }, str(input.lockFile));
    }, budget + 60000).unref();
    var playwright = require(str(input.playwrightModule) || "playwright-core");
    output = await run(input, { key: key, playwright: playwright, fetch: fetch });
    output.ok = true;
  } catch (e) {
    output = { ok: false, error: redact(shortError(e), key) };
  }
  finish(output, str(input.lockFile));
}

module.exports = {
  normalizeConfig: normalizeConfig,
  buildTask: buildTask,
  createGateway: createGateway,
  normalizeReport: normalizeReport,
  compactHistory: compactHistory,
  layoutScan: layoutScan,
  createTools: createTools,
  locate: locate,
  run: run,
  TOOLS: TOOLS,
  SYSTEM_PROMPT: SYSTEM_PROMPT
};

if (require.main === module) {
  main();
}
