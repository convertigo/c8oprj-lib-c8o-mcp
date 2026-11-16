#!/usr/bin/env node
/*
 * The browser part of viewer-sign-in (js/viewer_session.js). Reads one JSON object on stdin:
 *   {playwrightModule, cdpEndpoint, project, url, page, ticket, claimSequence, timeoutMs}
 * connects to the Studio browser over CDP (the browser of the agent's Playwright MCP and of browser-verify), makes the
 * viewer page of the project POST the one-time ticket to lib_ConvertigoMCP.<claimSequence> in its own HTTP session,
 * checks user.Get, opens the page asked and prints one JSON line:
 *   {status, signedIn, sessionUser, url, signInPageShown, message}
 * It never opens a new tab (the Studio viewer exposes one page), never types a password and never closes the browser.
 */
"use strict";

function str(value) {
  return value == null ? "" : String(value);
}

function readStdin() {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    process.stdin.on("data", function (c) { chunks.push(c); });
    process.stdin.on("end", function () { resolve(Buffer.concat(chunks).toString("utf8")); });
    process.stdin.on("error", reject);
  });
}

// The base of the application in an URL: http://host:port/convertigo/projects/<P>/DisplayObjects/<dir>/
function appBase(url, project) {
  var m = new RegExp("^(https?://[^/]+)(/[^?#]*?)?/projects/" + project + "/DisplayObjects/([^/?#]+)/", "i").exec(str(url));
  if (!m) {
    return null;
  }
  return { origin: m[1], engine: (m[2] || ""), base: m[1] + (m[2] || "") + "/projects/" + project + "/DisplayObjects/" + m[3] + "/" };
}

// The route segment the app shows, after its base (no query, no hash).
function routeOf(url, base) {
  var rest = str(url).substring(base.length).replace(/[?#].*$/, "");
  return rest.replace(/^\/+|\/+$/g, "");
}

async function signInPageShown(page) {
  try {
    return await page.evaluate(function () {
      var inputs = Array.prototype.slice.call(document.querySelectorAll("input[type=password]"));
      return inputs.some(function (i) {
        var r = i.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
    });
  } catch (_noPage) {
    return false;
  }
}

async function settle(page, ms) {
  try {
    await page.waitForLoadState("networkidle", { timeout: ms });
  } catch (_stillBusy) {}
  await page.waitForTimeout(600);
}

async function main() {
  var input = JSON.parse(await readStdin());
  var project = str(input.project);
  var timeout = Math.max(5000, Number(input.timeoutMs) || 25000);
  var playwright = require(str(input.playwrightModule) || "playwright-core");
  var browser = await playwright.chromium.connectOverCDP(str(input.cdpEndpoint), { timeout: 15000 });
  try {
    var context = browser.contexts()[0];
    if (!context) {
      return { status: "no_viewer", signedIn: false, message: "The Studio browser has no page: call mobile-builder-open first." };
    }
    var pages = context.pages().filter(function (p) { return !/^devtools:|^chrome-extension:/.test(p.url()); });
    var page = pages.filter(function (p) { return appBase(p.url(), project) !== null; })[0]
      || pages.filter(function (p) { return /^https?:/.test(p.url()); })[0] || pages[0] || null;
    if (!page) {
      return { status: "no_viewer", signedIn: false, message: "The Studio browser shows no page: call mobile-builder-open first." };
    }
    var target = appBase(input.url, project);
    var current = appBase(page.url(), project);
    if (!current && !target) {
      return { status: "no_viewer", signedIn: false, url: page.url(),
        message: "The Studio browser does not show the application of " + project + ": pass url (the viewerHomeUrl of mobile-builder-open)." };
    }
    if (!current || (target && current.base !== target.base)) {
      await page.goto(str(input.url), { waitUntil: "domcontentloaded", timeout: timeout });
      await settle(page, 4000);
      current = appBase(page.url(), project) || target;
    }
    var claimUrl = current.engine + "/projects/lib_ConvertigoMCP/.json?__sequence=" + encodeURIComponent(str(input.claimSequence || "viewer_session_claim"));
    var claim = await page.evaluate(async function (args) {
      var response = await fetch(args.url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "ticket=" + encodeURIComponent(args.ticket)
      });
      return { status: response.status, text: (await response.text()).slice(0, 4000) };
    }, { url: claimUrl, ticket: str(input.ticket) });
    var claimed = null;
    try {
      claimed = JSON.parse(claim.text);
    } catch (_notJson) {}
    var answer = claimed && (claimed.result || claimed.document || claimed);
    if (!answer || answer.signedIn !== true && answer.signedIn !== "true") {
      return { status: "refused", signedIn: false, url: page.url(),
        message: "The engine refused the sign-in: " + str(answer && answer.error || claim.text).slice(0, 300) };
    }
    var userGet = await page.evaluate(async function (url) {
      try {
        var response = await fetch(url, { credentials: "include" });
        return await response.json();
      } catch (e) {
        return { error: String(e) };
      }
    }, current.engine + "/services/user.Get");
    var route = str(input.page).replace(/^\/+/, "");
    var next = route.length ? (/^https?:/.test(route) ? route : current.base + route) : "";
    if (!next.length) {
      // the page open now, again, unless it is the sign-in page: then the app's entry
      next = (await signInPageShown(page)) ? current.base : page.url();
    }
    await page.goto(next, { waitUntil: "domcontentloaded", timeout: timeout });
    await settle(page, 6000);
    var shown = await signInPageShown(page);
    var sessionUser = str(userGet && userGet.user);
    return {
      status: shown ? "signed_in_page_asks_sign_in" : "signed_in",
      signedIn: userGet && (userGet.authenticated === true || userGet.authenticated === "true"),
      sessionUser: sessionUser,
      url: page.url(),
      route: routeOf(page.url(), current.base),
      signInPageShown: shown,
      message: shown ? "" : "The Studio browser is signed in as " + sessionUser + " and shows " + page.url() +
        ". Your Playwright tools and browser-verify use this browser: do not sign in again."
    };
  } finally {
    try {
      await browser.close();
    } catch (_disconnected) {}
  }
}

main().then(function (result) {
  process.stdout.write(JSON.stringify(result) + "\n");
  process.exit(0);
}, function (error) {
  process.stdout.write(JSON.stringify({ status: "failed", signedIn: false, message: str(error && error.message || error).slice(0, 400) }) + "\n");
  process.exit(0);
});
