"use strict";
/*
 * The visual finishing pass of browser-verify (design: true). No walk and no clicks: each page is opened by its address,
 * at a desktop width and at a phone width. A scan in the page measures what can be measured (contrast of every text,
 * overflow and tap targets at the phone width, raw technical values, empty lists without an empty state, two titles,
 * blocks that do not share the page's left edge, the visual signature compared with the other pages); then one call to
 * the vision model per page judges the six points of the checklist on the two screenshots and says what to change.
 *
 * Bounded: the pages given (6 by default, 8 at most), one model call per page, the time and cost budgets of the verifier
 * profile. The calling agent fixes what failed and checks those pages once more; the MCP refuses a third round.
 */
var fs = require("fs");
var path = require("path");

var CHECKLIST = [
  { id: "spacing", text: "Spacing and alignment: the blocks share the page's left edge, gaps are regular, nothing touches the edge of its panel, columns and their headers line up, numbers are right-aligned in tables." },
  { id: "hierarchy", text: "Visual hierarchy: one clear page title (not twice), sections and key figures stand out, secondary text is muted, the main action is easy to find and looks like the main one." },
  { id: "states", text: "Empty and loading states: an empty list says so with an icon and a sentence; no blank area where data is expected; no raw technical value (null, undefined, NaN, an ISO date or timestamp, an internal code)." },
  { id: "contrast", text: "Contrast: every text, badge and button reads clearly on its background, in the theme shown (WCAG AA: 4.5:1, 3:1 for large text)." },
  { id: "consistency", text: "Consistency: the same colors, corner radius, spacing, button styles and title sizes as the other pages of the app." },
  { id: "phone", text: "Phone width (390 px): nothing overflows or is cut, no horizontal scroll, tap targets at least 32 px, a table becomes readable label and value lines, the header and its buttons fit." }
];
var CHECK_IDS = CHECKLIST.map(function (c) { return c.id; });

var DESKTOP = { width: 1280, height: 800 };
var PHONE = { width: 390, height: 844 };
var MAX_PAGES = 8;
var DEFAULT_PAGES = 6;
var REVIEW_MAX_TOKENS = 8000;
// The reviews run side by side (one per page) and reason little: a page took 90 s and 6000 tokens of thinking (16/11).
var REVIEW_CONCURRENCY = 3;
var REVIEW_REASONING = "low";

var SYSTEM_PROMPT = [
  "You are a senior UI designer reviewing one page of a business web application, as the last pass before it is shown to its users. You see two screenshots of the page, at a desktop width and at a phone width, and the facts a script measured on it.",
  "Judge the page against each point of the checklist: passed, or failed with what you see and the change that fixes it. Be demanding about what makes a page look hand-made (alignment, hierarchy, rhythm, density, status colors, empty and loading states) but never invent a defect the screenshots do not show. A measured fact is evidence: a contrast below the threshold or an overflow at the phone width is a failure of that point.",
  "Each fix says concretely what to change and where on the page, in terms of the page (for example: give the list page a subtitle with the count of rows; put the main action in the page header; right-align the amount column; show the stages as bars; give the empty list an icon and a sentence; darken the muted text of the KPI labels). The app's pages come from a generator whose options are: page subtitle, actions in the header, list columns with a number or date format, dashboard KPI hint, dashboard sections as cards or bar charts, a theme preset and its primary color, the side menu. Name the option when one fits.",
  "Answer with the review tool only, in the language of the request. At most one entry per checklist point, the most important problem of that point."
].join("\n");

var REVIEW_TOOL = {
  type: "function",
  "function": {
    name: "review",
    description: "The design review of this page: one entry per checklist point.",
    parameters: {
      type: "object",
      properties: {
        checks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", "enum": CHECK_IDS },
              status: { type: "string", "enum": ["passed", "failed"] },
              severity: { type: "string", "enum": ["major", "minor"], description: "For a failure: major when a user notices it at once." },
              finding: { type: "string", description: "What is seen, on which part of the page and at which width." },
              fix: { type: "string", description: "For a failure: the change that fixes it, concretely." }
            },
            required: ["id", "status", "finding"]
          }
        },
        summary: { type: "string", description: "One sentence on the page's look." }
      },
      required: ["checks", "summary"]
    }
  }
};

function str(value) {
  return value == null ? "" : String(value).trim();
}

// Runs in the page. What can be measured of the design, at the current width. Light DOM and open shadow roots of the
// Ionic components are read through their computed styles and their CSS variables (an ion-item or an ion-content draws
// its background in its shadow DOM from --background).
function designScan(phone) {
  var out = { findings: [], signature: {} };
  var vw = window.innerWidth;
  var canvas = document.createElement("canvas").getContext("2d");
  function norm(color) {
    if (!color) {
      return null;
    }
    // Chrome computes color-mix() and some theme colors as color(srgb r g b / a), with channels from 0 to 1: a canvas
    // does not read it, and a white chip was taken for the toolbar behind it (a 1:1 contrast, 16/11).
    var srgb = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/.exec(String(color));
    if (srgb) {
      var alpha = srgb[4] === undefined ? 1 : (/%$/.test(srgb[4]) ? parseFloat(srgb[4]) / 100 : +srgb[4]);
      return { r: +srgb[1] * 255, g: +srgb[2] * 255, b: +srgb[3] * 255, a: alpha };
    }
    try {
      canvas.fillStyle = "#010203";
      canvas.fillStyle = color;
      var v = canvas.fillStyle;
      if (v === "#010203" && !/^#010203$/i.test(color)) {
        return null;
      }
      var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
      if (m) {
        return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16), a: 1 };
      }
      m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/.exec(v);
      if (m) {
        return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
      }
    } catch (_badColor) {}
    return null;
  }
  function lum(c) {
    var f = function (v) {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function ratio(a, b) {
    var la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function blend(top, under) {
    var a = top.a;
    return { r: top.r * a + under.r * (1 - a), g: top.g * a + under.g * (1 - a), b: top.b * a + under.b * (1 - a), a: 1 };
  }
  function parentOf(el) {
    if (el.assignedSlot) {
      return el.assignedSlot;
    }
    if (el.parentElement) {
      return el.parentElement;
    }
    var root = el.getRootNode && el.getRootNode();
    return root && root.host ? root.host : null;
  }
  // The background under an element: the first opaque one up the tree, the translucent ones on the way blended over it.
  function backgroundOf(el) {
    var layers = [];
    for (var node = el, depth = 0; node && node.nodeType === 1 && depth < 40; node = parentOf(node), depth++) {
      var style = getComputedStyle(node);
      var c = norm(style.backgroundColor);
      if ((!c || c.a === 0) && /^ion-/i.test(node.tagName)) {
        c = norm(style.getPropertyValue("--background").trim());
      }
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 0.99) {
          break;
        }
      }
    }
    var base = { r: 255, g: 255, b: 255, a: 1 };
    if (layers.length && layers[layers.length - 1].a >= 0.99) {
      base = layers.pop();
    }
    for (var i = layers.length - 1; i >= 0; i--) {
      base = blend(layers[i], base);
    }
    return base;
  }
  function visible(el) {
    var style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) {
      return false;
    }
    var r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < window.innerHeight * 3;
  }
  function hiddenPage(el) {
    for (var node = el; node; node = parentOf(node)) {
      if (node.classList && (node.classList.contains("ion-page-hidden") || node.getAttribute("aria-hidden") === "true")) {
        return true;
      }
      if (/^ion-menu$/i.test(node.tagName) && !node.classList.contains("menu-pane-visible") && !node.classList.contains("show-menu")) {
        return true;
      }
    }
    return false;
  }
  function where(el) {
    var cls = typeof el.className === "string" ? el.className.split(/\s+/).filter(function (c) { return c && /^app-|^ion-/.test(c); }).slice(0, 2).join(".") : "";
    return el.tagName.toLowerCase() + (cls ? "." + cls : "");
  }
  function add(check, issue, el, extra) {
    if (out.findings.filter(function (f) { return f.check === check; }).length >= 5) {
      return;
    }
    out.findings.push({ check: check, issue: issue + (extra ? " " + extra : ""), where: el ? where(el) : "" });
  }
  // Text leaves, through open shadow roots.
  var texts = [];
  (function collect(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    for (var n = walker.currentNode; n; n = walker.nextNode()) {
      if (n.shadowRoot) {
        collect(n.shadowRoot);
      }
      if (n.nodeType !== 1 || /^(script|style|svg|path|template|ion-icon)$/i.test(n.tagName)) {
        continue;
      }
      var own = "";
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) {
          own += c.nodeValue;
        }
      }
      own = own.replace(/\s+/g, " ").trim();
      if (own.length && texts.length < 1500) {
        texts.push({ el: n, text: own });
      }
    }
  })(document.body);
  var shown = texts.filter(function (t) { return visible(t.el) && !hiddenPage(t.el); });

  // contrast
  var worst = [];
  shown.forEach(function (t) {
    var style = getComputedStyle(t.el);
    var fg = norm(style.color);
    if (!fg) {
      return;
    }
    var bg = backgroundOf(t.el);
    if (fg.a < 1) {
      fg = blend(fg, bg);
    }
    var size = parseFloat(style.fontSize) || 16;
    var weight = parseInt(style.fontWeight, 10) || 400;
    var large = size >= 24 || (size >= 18.66 && weight >= 700);
    var r = ratio(fg, bg);
    if (r < (large ? 3 : 4.5)) {
      worst.push({ el: t.el, text: t.text, r: r, min: large ? 3 : 4.5 });
    }
  });
  worst.sort(function (a, b) { return a.r - b.r; }).slice(0, 5).forEach(function (w) {
    add("contrast", "\"" + w.text.substring(0, 50) + "\" reads at " + (Math.round(w.r * 100) / 100) + ":1 (" + w.min + ":1 needed).", w.el);
  });

  // raw technical values, unformatted numbers and dates
  shown.forEach(function (t) {
    var v = t.text;
    if (/^(null|undefined|NaN|\[object Object\]|Invalid Date|true|false)$/i.test(v) || /\b(undefined|NaN|\[object Object\])\b/.test(v)) {
      add("states", "Raw technical value \"" + v.substring(0, 60) + "\".", t.el);
    } else if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(v)) {
      add("states", "Date shown as the database stores it: \"" + v + "\".", t.el);
    } else if (/^-?\d{6,}(\.\d+)?$|^-?\d{4,}\.\d{2}$/.test(v)) {
      add("states", "Number without grouping or unit: \"" + v + "\".", t.el);
    }
  });

  // titles
  var titles = shown.filter(function (t) { return /^h[1-2]$/i.test(t.el.tagName) || (t.el.classList && t.el.classList.contains("app-title")); });
  if (!titles.length) {
    add("hierarchy", "No page title in the content.", null);
  } else if (titles.length > 1) {
    add("hierarchy", titles.length + " page titles: " + titles.slice(0, 3).map(function (t) { return "\"" + t.text.substring(0, 40) + "\""; }).join(", ") + ".", titles[1].el);
  }
  if (!phone && titles.length) {
    var bar = shown.filter(function (t) { return /^ion-title$/i.test(t.el.tagName) || (t.el.closest && t.el.closest("ion-title")); })
      .filter(function (t) { return !(t.el.closest && t.el.closest("ion-menu")); });
    if (bar.some(function (t) { return t.text === titles[0].text; })) {
      add("hierarchy", "The title \"" + titles[0].text.substring(0, 40) + "\" is shown twice, in the toolbar and in the page.", null);
    }
  }

  // empty lists without an empty state
  Array.prototype.forEach.call(document.querySelectorAll("ion-list"), function (list) {
    if (!visible(list) || hiddenPage(list) || (list.closest && list.closest("ion-menu"))) {
      return;
    }
    var rows = Array.prototype.filter.call(list.querySelectorAll("ion-item"), function (i) { return !i.classList.contains("app-table-head") && visible(i); });
    var page = list.closest(".ion-page") || document.body;
    var emptyShown = Array.prototype.some.call(page.querySelectorAll(".app-empty-state, .app-empty, .app-loading, ion-spinner"), visible);
    if (!rows.length && !emptyShown) {
      add("states", "A list shows no row and no empty state.", list);
    }
  });

  // the page's left edge
  var content = Array.prototype.filter.call(document.querySelectorAll("ion-content.app-page, ion-content"), function (c) { return visible(c) && !hiddenPage(c) && !(c.closest && c.closest("ion-menu")); })[0];
  if (content) {
    var blocks = Array.prototype.filter.call(content.children, function (c) {
      return visible(c) && c.getBoundingClientRect().width > content.getBoundingClientRect().width * 0.4;
    });
    var lefts = {};
    blocks.forEach(function (b) {
      lefts[Math.round(b.getBoundingClientRect().left / 4) * 4] = b;
    });
    var keys = Object.keys(lefts);
    if (keys.length > 1) {
      add("spacing", "The page blocks start at " + keys.length + " different left edges (" + keys.join(", ") + " px).", lefts[keys[1]]);
    }
    if (!phone) {
      var cr = content.getBoundingClientRect();
      if (cr.width > 1000 && blocks.length) {
        var right = Math.max.apply(null, blocks.map(function (b) { return b.getBoundingClientRect().right; }));
        var left = Math.min.apply(null, blocks.map(function (b) { return b.getBoundingClientRect().left; }));
        if (left - cr.left < 8 && cr.right - right > cr.width * 0.3) {
          add("spacing", "The content stays on the left of a wide screen.", content);
        }
      }
    }
  }

  // phone width: overflow and tap targets
  if (phone) {
    var scroller = document.scrollingElement || document.documentElement;
    if (scroller.scrollWidth > vw + 2) {
      add("phone", "The page scrolls sideways (" + scroller.scrollWidth + " px wide in " + vw + " px).", null);
    }
    shown.forEach(function (t) {
      var r = t.el.getBoundingClientRect();
      if (r.right > vw + 2 && !(t.el.closest && t.el.closest(".ag-root, .ag-body, [style*='overflow']"))) {
        add("phone", "\"" + t.text.substring(0, 40) + "\" goes past the right edge (" + Math.round(r.right) + " px of " + vw + ").", t.el);
      }
    });
    Array.prototype.forEach.call(document.querySelectorAll("ion-button, button, a[href], ion-item[button], ion-back-button, ion-menu-button"), function (b) {
      if (!visible(b) || hiddenPage(b) || (b.closest && (b.closest("ion-menu") || b.closest("ion-item ion-item")))) {
        return;
      }
      var r = b.getBoundingClientRect();
      if (r.height < 30 || r.width < 30) {
        add("phone", "Tap target of " + Math.round(r.width) + "x" + Math.round(r.height) + " px.", b);
      }
    });
  }

  // signature, compared across the pages
  var first = function (selector) {
    return Array.prototype.filter.call(document.querySelectorAll(selector), function (e) { return visible(e) && !hiddenPage(e); })[0] || null;
  };
  var sig = out.signature;
  sig.font = (getComputedStyle(document.body).fontFamily || "").split(",")[0].replace(/["']/g, "").trim();
  var t0 = titles[0] ? getComputedStyle(titles[0].el) : null;
  sig.titleSize = t0 ? Math.round(parseFloat(t0.fontSize)) : 0;
  var panel = first(".app-card, .app-list, .app-kpi, .app-form, ion-card");
  sig.panelRadius = panel ? Math.round(parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 0) : -1;
  var btn = first("ion-button:not([fill=clear]):not([fill=outline])");
  if (btn) {
    var bs = getComputedStyle(btn);
    var bg = norm(bs.getPropertyValue("--background").trim()) || norm(bs.backgroundColor);
    sig.buttonColor = bg ? "rgb(" + Math.round(bg.r) + "," + Math.round(bg.g) + "," + Math.round(bg.b) + ")" : "";
  } else {
    sig.buttonColor = "";
  }
  var bgc = content ? backgroundOf(content) : null;
  sig.pageBackground = bgc ? "rgb(" + Math.round(bgc.r) + "," + Math.round(bgc.g) + "," + Math.round(bgc.b) + ")" : "";
  out.title = titles[0] ? titles[0].text.substring(0, 80) : document.title;
  out.textCount = shown.length;
  return out;
}

// What differs from most pages: the same font, title size, panel radius, button color and page background everywhere.
function consistencyFindings(pages) {
  var keys = ["font", "titleSize", "panelRadius", "buttonColor", "pageBackground"];
  var labels = { font: "font", titleSize: "title size", panelRadius: "panel corner radius", buttonColor: "main button color", pageBackground: "page background" };
  var byPage = pages.map(function () { return []; });
  keys.forEach(function (k) {
    var counts = {};
    pages.forEach(function (p) {
      var v = p.signature && p.signature[k];
      if (v !== undefined && v !== "" && v !== 0 && v !== -1) {
        counts[v] = (counts[v] || 0) + 1;
      }
    });
    var values = Object.keys(counts);
    if (values.length < 2) {
      return;
    }
    var common = values.sort(function (a, b) { return counts[b] - counts[a]; })[0];
    pages.forEach(function (p, i) {
      var v = p.signature && p.signature[k];
      if (v !== undefined && v !== "" && v !== 0 && v !== -1 && String(v) !== String(common)) {
        byPage[i].push({ check: "consistency", issue: "The " + labels[k] + " is " + v + (k === "titleSize" || k === "panelRadius" ? " px" : "") +
          " here, " + common + (k === "titleSize" || k === "panelRadius" ? " px" : "") + " on most pages.", where: "" });
      }
    });
  });
  return byPage;
}

// One line per step in activity.jsonl, as the walk writes it: the calling agent and Tigo follow the review page by page.
function activity(helpers, config, text) {
  if (typeof helpers.logActivity === "function") {
    try {
      helpers.logActivity(config, { at: Date.now(), turn: 0, text: text });
    } catch (_noActivity) {}
  }
}

function pageList(value) {
  var items = Array.isArray(value) ? value : str(value).split(/\r?\n|,/);
  var out = [];
  items.forEach(function (item) {
    var entry = item && typeof item === "object" ? { name: str(item.name), path: str(item.path || item.url) } : { name: "", path: str(item) };
    entry.path = entry.path.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "");
    if (entry.path.length) {
      entry.name = entry.name || entry.path.replace(/^.*\/(?=[^/]+$)/, "").replace(/[?#].*$/, "") || "home";
      out.push(entry);
    }
  });
  return out;
}

async function emulate(state, viewport) {
  if (state.cdp) {
    try {
      await state.cdp.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width < 600 });
      return;
    } catch (_noCdp) {}
  }
  if (typeof state.page.setViewportSize === "function") {
    await state.page.setViewportSize(viewport);
  }
}

// One page: open it, settle, scan and capture at both widths.
async function capturePage(state, entry, index, config, helpers) {
  var base = config.url || state.page.url();
  var target = new URL(entry.path, /\/$/.test(base) ? base : base.replace(/[^/]*$/, "")).href;
  var shots = {};
  var scans = {};
  await emulate(state, DESKTOP);
  var response = await state.page.goto(target, { waitUntil: "domcontentloaded", timeout: 20000 });
  if (response && response.status() >= 400) {
    throw new Error("HTTP " + response.status() + " on " + target);
  }
  await helpers.settle(state.page);
  // Let the page's data arrive: the spinner goes, or 4 s.
  try {
    await state.page.waitForFunction(function () {
      var spin = document.querySelector(".ion-page:not(.ion-page-hidden) .app-loading, .ion-page:not(.ion-page-hidden) ion-spinner");
      return !spin || spin.getBoundingClientRect().height === 0;
    }, null, { timeout: 4000 });
  } catch (_stillLoading) {}
  await helpers.sleep(500);
  var stem = String(index + 1).padStart(2, "0") + "-" + entry.name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").substring(0, 40);
  for (var w = 0; w < 2; w++) {
    var phone = w === 1;
    if (phone) {
      await emulate(state, PHONE);
      await helpers.sleep(700);
    }
    scans[phone ? "phone" : "desktop"] = await state.page.evaluate(designScan, phone);
    var file = path.join(config.outDir, (config.outPrefix || "") + "design-" + stem + (phone ? "-phone" : "-desktop") + ".png");
    var buffer = await state.page.screenshot({ path: file, fullPage: false, timeout: 15000, animations: "disabled", scale: "css" });
    shots[phone ? "phone" : "desktop"] = { file: file, image: buffer.toString("base64") };
    state.screenshots.push({ name: "design-" + stem + (phone ? "-phone" : "-desktop"), file: file, url: state.page.url() });
  }
  await emulate(state, DESKTOP);
  return { name: entry.name, path: entry.path, url: state.page.url(), title: scans.desktop.title, scans: scans, shots: shots,
    signature: scans.desktop.signature };
}

function reviewMessages(page, measured, config) {
  var facts = measured.length ? measured.map(function (f) { return "- [" + f.check + "] " + f.issue + (f.where ? " (" + f.where + ")" : ""); }).join("\n") : "- nothing";
  var text = [
    "Page \"" + page.name + "\" (" + page.url + "), title \"" + str(page.title) + "\".",
    config.context ? "Context from the requesting agent: " + config.context : "",
    "",
    "Checklist:",
    CHECKLIST.map(function (c) { return "- " + c.id + ": " + c.text; }).join("\n"),
    "",
    "Measured by the script (desktop " + DESKTOP.width + " px and phone " + PHONE.width + " px):",
    facts,
    "",
    "First screenshot: desktop. Second screenshot: phone."
  ].filter(function (l) { return l !== null; }).join("\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: [
      { type: "text", text: text },
      { type: "image_url", image_url: { url: "data:image/png;base64," + page.shots.desktop.image } },
      { type: "image_url", image_url: { url: "data:image/png;base64," + page.shots.phone.image } }
    ] }
  ];
}

function normalizeChecks(args, measured) {
  var given = args && Array.isArray(args.checks) ? args.checks : [];
  var byId = {};
  given.forEach(function (c) {
    if (c && CHECK_IDS.indexOf(str(c.id)) >= 0 && !byId[str(c.id)]) {
      byId[str(c.id)] = { id: str(c.id), status: str(c.status) === "failed" ? "failed" : "passed", severity: str(c.severity) === "major" ? "major" : (str(c.status) === "failed" ? "minor" : ""),
        finding: str(c.finding).substring(0, 400), fix: str(c.fix).substring(0, 400) };
    }
  });
  // A measured contrast, overflow or raw value fails its point whatever the model said.
  measured.forEach(function (f) {
    if (["contrast", "phone", "states"].indexOf(f.check) < 0) {
      return;
    }
    var c = byId[f.check];
    if (!c || c.status !== "failed") {
      byId[f.check] = { id: f.check, status: "failed", severity: "major", finding: (c && c.finding ? c.finding + " Measured: " : "Measured: ") + f.issue,
        fix: c && c.fix ? c.fix : "" };
    }
  });
  return CHECK_IDS.map(function (id) {
    return byId[id] || { id: id, status: "not_checked", severity: "", finding: "", fix: "" };
  });
}

// mode "design": returns the same output shape as the walk (report, screenshots, usage...), with report.design.
async function runDesign(config, deps, helpers) {
  var started = Date.now();
  var key = str(deps.key);
  var pages = pageList(config.pages);
  if (!pages.length) {
    throw new Error("pages is required for a design review: the addresses of the pages to review, relative to url (for example [\"dashboard\", \"deals\"]).");
  }
  var maxPages = Math.max(1, Math.min(MAX_PAGES, Number(config.maxPages) || DEFAULT_PAGES));
  var skipped = pages.slice(maxPages).map(function (p) { return p.path; });
  pages = pages.slice(0, maxPages);
  fs.mkdirSync(config.outDir, { recursive: true });
  var gateway = helpers.createGateway(config, key, deps.fetch || fetch);
  var browserState = await helpers.openBrowser(Object.assign({}, config, { viewport: DESKTOP }), deps.playwright);
  var state = { page: browserState.page, screenshots: [], cdp: browserState.emulation };
  if (!state.cdp && typeof browserState.context.newCDPSession === "function" && config.cdpEndpoint) {
    try { state.cdp = await browserState.context.newCDPSession(state.page); } catch (_noSession) {}
  }
  var consoleErrors = [];
  if (typeof state.page.on === "function") {
    state.page.on("pageerror", function (e) { consoleErrors.push(str(e && e.message).substring(0, 300)); });
  }
  var captured = [];
  var errors = [];
  var stopReason = "finished";
  try {
    for (var i = 0; i < pages.length; i++) {
      // Each page needs about 20 s with its model call: no page starts in the last 25 s of the budget.
      if (Date.now() - started > config.timeBudgetMs - 25000) {
        stopReason = "time budget";
        skipped = skipped.concat(pages.slice(i).map(function (p) { return p.path; }));
        break;
      }
      try {
        captured.push(await capturePage(state, pages[i], i, config, helpers));
        activity(helpers, config, "Page " + pages[i].name + ": captured at " + DESKTOP.width + " and " + PHONE.width + " px, measured.");
      } catch (e) {
        errors.push(pages[i].path + ": " + helpers.shortError(e));
        activity(helpers, config, "Page " + pages[i].name + ": could not be opened (" + helpers.shortError(e) + ").");
      }
    }
  } finally {
    await helpers.restoreViewport({ emulation: state.cdp });
  }
  var across = consistencyFindings(captured);
  async function reviewPage(p) {
    var page = captured[p];
    var measured = page.scans.desktop.findings.concat(page.scans.phone.findings.filter(function (f) {
      return !page.scans.desktop.findings.some(function (d) { return d.issue === f.issue; });
    })).concat(across[p]);
    var args = null;
    var overCost = config.maxCostUsd > 0 && gateway.spentCost() >= config.maxCostUsd * 0.9;
    if (!overCost && Date.now() - started < config.timeBudgetMs - 20000) {
      try {
        // A model that reasons before it answers spent 1600 tokens thinking and gave no review (16/11): room for both.
        var body = await gateway.complete(reviewMessages(page, measured, config), { tools: [REVIEW_TOOL], toolChoice: { type: "function", "function": { name: "review" } },
          maxTokens: REVIEW_MAX_TOKENS, reasoning: REVIEW_REASONING });
        var choice = (body.choices || [])[0] || {};
        var call = (choice.message || {}).tool_calls;
        args = call && call[0] ? helpers.parseArgs(call[0]["function"].arguments) : null;
        if (!args) {
          errors.push(page.path + " review: the model gave no review" + (choice.finish_reason === "length" ? " (its answer was cut at " + REVIEW_MAX_TOKENS + " tokens)" : "") + "; only the measures count for this page.");
        }
      } catch (e) {
        errors.push(page.path + " review: " + helpers.shortError(e));
      }
    } else {
      stopReason = overCost ? "cost budget" : "time budget";
      errors.push(page.path + " review: not done (" + stopReason + "); only the measures count for this page.");
    }
    var checks = normalizeChecks(args, measured);
    activity(helpers, config, "Page " + page.name + " reviewed: " + checks.filter(function (c) { return c.status === "failed"; }).length + " point(s) to fix.");
    results[p] = {
      name: page.name,
      url: page.url,
      title: page.title,
      summary: str(args && args.summary).substring(0, 300),
      checks: checks,
      measured: measured,
      screenshots: { desktop: page.shots.desktop.file, phone: page.shots.phone.file }
    };
  }
  var results = new Array(captured.length);
  var next = 0;
  async function worker() {
    while (next < captured.length) {
      var p = next++;
      await reviewPage(p);
    }
  }
  var workers = [];
  for (var w = 0; w < Math.min(REVIEW_CONCURRENCY, captured.length); w++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  var failed = [];
  results.forEach(function (r) {
    r.checks.forEach(function (c) {
      if (c.status === "failed") {
        failed.push({ page: r.name, id: c.id, severity: c.severity, finding: c.finding, fix: c.fix });
      }
    });
  });
  var majors = failed.filter(function (f) { return f.severity === "major"; }).length;
  var report = {
    verdict: failed.length ? "failed" : (results.length && !errors.length ? "passed" : "partial"),
    summary: results.length + " page(s) reviewed at " + DESKTOP.width + " and " + PHONE.width + " px: " + failed.length + " point(s) to fix (" + majors + " major)" +
      (skipped.length ? ", not reviewed: " + skipped.join(", ") : "") + (errors.length ? ", errors: " + errors.join("; ") : "") + ".",
    checks: [],
    visualDefects: [],
    designSuggestions: [],
    design: { checklist: CHECKLIST, pages: results, toFix: failed, skipped: skipped, errors: errors, consoleErrors: consoleErrors.slice(0, 10) }
  };
  var result = {
    report: report,
    screenshots: state.screenshots.map(function (s) { return { name: s.name, file: s.file, url: s.url }; }),
    finalUrl: state.page.url(),
    startUrl: browserState.startUrl,
    turns: gateway.usage.requests,
    toolCalls: captured.length * 2,
    stopReason: stopReason,
    durationMs: Date.now() - started,
    usage: gateway.finalUsage(),
    trace: []
  };
  try {
    fs.writeFileSync(path.join(config.outDir, (config.outPrefix || "") + "report.json"), JSON.stringify(result, null, 2));
  } catch (_noReportFile) {}
  return result;
}

module.exports = {
  CHECKLIST: CHECKLIST,
  CHECK_IDS: CHECK_IDS,
  REVIEW_TOOL: REVIEW_TOOL,
  designScan: designScan,
  consistencyFindings: consistencyFindings,
  normalizeChecks: normalizeChecks,
  pageList: pageList,
  reviewMessages: reviewMessages,
  runDesign: runDesign
};
