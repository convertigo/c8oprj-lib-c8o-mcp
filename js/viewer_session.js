/*
 * viewer-sign-in: the Studio browser signed in as an account of the application, without a password.
 *
 * Agents spent most of their verification on the sign-in page of the app they had just changed: in the SalesPipeline
 * runs of 16/11 one agent spent 20 of its 30 minutes trying passwords for the demo account (a dictionary in bash, the
 * SHA-1 of the stored hash and salt, then Angular internals), another one guessed and tried to crack it too. The
 * password was given to the user at hand-off and is stored nowhere. In a Studio the developer already owns the engine
 * and every account of the app under development: this tool signs the Studio browser in as the account the agent
 * names, as requestable-execute already runs a sequence as an authenticated user.
 *
 * How (no public sign-in, no password, nothing stored in the project):
 * 1. The tool (full MCP bearer, local Studio only) issues a one-time ticket: 32 random bytes, valid 60 s, for that
 *    project and account, kept in the engine memory (context.server).
 * 2. A Node helper (node/viewer_session.cjs, playwright-core over the CDP endpoint the agent's Playwright MCP and
 *    browser-verify use) makes the viewer page itself POST the ticket to lib_ConvertigoMCP.viewer_session_claim, in the
 *    browser's own HTTP session. The claim sequence takes the ticket once and sets the authenticated user of that
 *    session (context.setAuthenticatedUser), as a sign-in sequence does.
 * 3. The helper reads user.Get (what the AuthorizePages guard of the NGX template reads), opens the page asked and
 *    reports where the browser is.
 * The app's own sign-in sequence does not run: what it stores besides the user (a role in the session, a FullSync
 * session) is not there. Generated business sequences read the role per call and work; the report says when the page
 * still shows the sign-in.
 */
if (typeof C8O === "undefined") { var C8O = {}; }
C8O.viewerSession = C8O.viewerSession || {};

(function (api) {
  var TICKETS_KEY = "lib_ConvertigoMCP.viewerSession.tickets";
  api.TICKET_TTL_MS = 60000;
  api.CLAIM_SEQUENCE = "viewer_session_claim";

  function str(value) {
    return value == null ? "" : String(value);
  }

  function trim(value) {
    return str(value).replace(/^\s+|\s+$/g, "");
  }

  api.isLocalStudio = function () {
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    try {
      if (Engine.isStudioMode() === true) {
        return true;
      }
    } catch (_noStudioMode) {}
    try {
      return Engine.isDesktopStudio() === true;
    } catch (_noDesktopStudio) {
      return false;
    }
  };

  // An account name as an app signs it in: an e-mail or a login, no control character, no markup.
  api.checkUser = function (user) {
    var value = trim(user);
    if (!value.length) {
      throw new Error("user is required: the login of an account of the application (its e-mail for most apps). Ask the user which account to use when the project notes name none.");
    }
    if (value.length > 200 || /[\u0000-\u001f<>"'\\]/.test(value)) {
      throw new Error("user is not an account name: " + value.substring(0, 60));
    }
    return value;
  };

  // The page to open after the sign-in: a route segment ("dashboard", "companies/12") or a full URL of the same app.
  api.checkPage = function (page) {
    var value = trim(page).replace(/^\/+/, "");
    if (value.length > 300 || /[\s<>"'\\]/.test(value)) {
      throw new Error("page must be a route segment of the app, such as dashboard.");
    }
    return value;
  };

  function store(contextObject) {
    var server = contextObject ? contextObject.server : null;
    if (!server) {
      throw new Error("No engine store for the sign-in ticket.");
    }
    var map = server.get(TICKETS_KEY);
    if (map == null) {
      map = new Packages.org.mozilla.javascript.Synchronizer(function () {
        if (server.get(TICKETS_KEY) == null) {
          server.set(TICKETS_KEY, new java.util.concurrent.ConcurrentHashMap());
        }
        return server.get(TICKETS_KEY);
      }, server)();
    }
    return map;
  }

  api.newTicket = function () {
    var bytes = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, 32);
    new java.security.SecureRandom().nextBytes(bytes);
    var hex = "";
    for (var i = 0; i < bytes.length; i++) {
      var b = (bytes[i] + 256) % 256;
      hex += (b < 16 ? "0" : "") + b.toString(16);
    }
    return hex;
  };

  api.issue = function (contextObject, project, user, now) {
    var map = store(contextObject);
    var time = now || Number(java.lang.System.currentTimeMillis());
    var expired = map.entrySet().iterator();
    while (expired.hasNext()) {
      var entry = null;
      try {
        entry = JSON.parse(String(expired.next().getValue()));
      } catch (_unreadable) {}
      if (!entry || !(Number(entry.expiresAt) > time)) {
        expired.remove();
      }
    }
    if (map.size() > 50) {
      map.clear();
    }
    var ticket = api.newTicket();
    map.put(ticket, JSON.stringify({ project: project, user: user, expiresAt: time + api.TICKET_TTL_MS }));
    return ticket;
  };

  // The claim, in the browser's request: the ticket is taken once, then the session of that request signs in.
  api.claim = function (contextObject, ticket) {
    if (!api.isLocalStudio()) {
      return { signedIn: false, error: "Only a Studio signs its browser in this way." };
    }
    var key = trim(ticket);
    if (!/^[0-9a-f]{64}$/.test(key)) {
      return { signedIn: false, error: "No valid ticket." };
    }
    var raw = store(contextObject).remove(key);
    var entry = null;
    try {
      entry = raw == null ? null : JSON.parse(String(raw));
    } catch (_unreadable) {}
    if (!entry || !(Number(entry.expiresAt) > Number(java.lang.System.currentTimeMillis()))) {
      return { signedIn: false, error: "The ticket is unknown, used or expired: call viewer-sign-in again." };
    }
    try {
      var session = contextObject.httpSession;
      if (session != null) {
        Packages.com.twinsoft.convertigo.engine.enums.SessionAttribute.authenticatedUserGrp.remove(session);
      }
    } catch (_noFullSyncAuth) {}
    contextObject.setAuthenticatedUser(String(entry.user));
    return { signedIn: true, user: String(entry.user), project: String(entry.project) };
  };

  function runHelper(host, input) {
    var command = new java.util.ArrayList();
    command.add(host.nodePath());
    command.add(host.helperPath());
    var builder = new java.lang.ProcessBuilder(command);
    builder.redirectErrorStream(false);
    var process = builder.start();
    var stdin = process.getOutputStream();
    try {
      stdin.write(new java.lang.String(JSON.stringify(input)).getBytes("UTF-8"));
    } finally {
      stdin.close();
    }
    var out = new java.io.ByteArrayOutputStream();
    var err = new java.io.ByteArrayOutputStream();
    var outReader = new java.lang.Thread(function () { process.getInputStream().transferTo(out); });
    var errReader = new java.lang.Thread(function () { process.getErrorStream().transferTo(err); });
    outReader.start();
    errReader.start();
    var finished = process.waitFor(Number(input.timeoutMs) + 10000, java.util.concurrent.TimeUnit.MILLISECONDS);
    if (!finished) {
      process.destroyForcibly();
      throw new Error("The Studio browser did not answer in " + Math.round((Number(input.timeoutMs) + 10000) / 1000) + " s.");
    }
    outReader.join(2000);
    errReader.join(2000);
    var text = String(out.toString("UTF-8"));
    var lines = text.split(/\r?\n/).filter(function (l) { return trim(l).length; });
    var last = lines.length ? lines[lines.length - 1] : "";
    try {
      return JSON.parse(last);
    } catch (_notJson) {
      throw new Error("The browser helper failed: " + trim(String(err.toString("UTF-8")) || text).substring(0, 400));
    }
  }

  api.javaHost = function () {
    include("js/subagents.js");
    include("js/tools_browser_verify.js");
    var host = C8O.browserVerify.javaHost();
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    host.helperPath = function () {
      var project = Engine.theApp.databaseObjectsManager.getOriginalProjectByName("lib_ConvertigoMCP");
      return String(new java.io.File(new java.io.File(new java.io.File(String(project.getDirPath())), "node"), "viewer_session.cjs").getPath());
    };
    host.run = runHelper;
    return host;
  };

  // params: {project, user, page, url, browserDebugPort, cdpEndpoint}
  api.signIn = function (contextObject, params, host) {
    var p = params || {};
    if (!api.isLocalStudio()) {
      throw new Error("viewer-sign-in works in a Studio only: on a server, sign in through the application with an account the user gives.");
    }
    var project = trim(p.project);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(project)) {
      throw new Error("project is required: the project whose application is open in the Studio browser.");
    }
    var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
    if (!Engine.theApp.databaseObjectsManager.existsProject(project)) {
      throw new Error("No project " + project + " in this Studio.");
    }
    var user = api.checkUser(p.user);
    var page = api.checkPage(p.page);
    var url = trim(p.url);
    if (url.length && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|[a-z0-9-]+\.localhost)(:\d+)?\//i.test(url)) {
      throw new Error("url must be the viewerHomeUrl of mobile-builder-open (a local address of this Studio).");
    }
    var h = host || api.javaHost();
    var endpoint = h.cdpEndpoint({ browserDebugPort: p.browserDebugPort, cdpEndpoint: p.cdpEndpoint });
    if (!endpoint.length) {
      throw new Error("No Studio browser for this conversation: call mobile-builder-open first (its browserDebugUrl is the browser to sign in).");
    }
    var reachable = h.probe(endpoint);
    if (!reachable.length) {
      throw new Error("The Studio browser does not answer at " + endpoint + ": call mobile-builder-open, then viewer-sign-in again.");
    }
    var ticket = api.issue(contextObject, project, user);
    var answer = h.run(h, {
      playwrightModule: h.playwrightModule(),
      cdpEndpoint: reachable,
      project: project,
      url: url,
      page: page,
      ticket: ticket,
      claimSequence: api.CLAIM_SEQUENCE,
      timeoutMs: 25000
    });
    try {
      store(contextObject).remove(ticket);
    } catch (_alreadyTaken) {}
    var result = {
      status: answer && answer.status ? String(answer.status) : "failed",
      project: project,
      user: user,
      signedIn: answer && answer.signedIn === true,
      url: answer && answer.url ? String(answer.url) : "",
      sessionUser: answer && answer.sessionUser ? String(answer.sessionUser) : "",
      signInPageShown: answer && answer.signInPageShown === true,
      message: answer && answer.message ? String(answer.message) : ""
    };
    if (result.signedIn && result.signInPageShown) {
      result.message = (result.message ? result.message + " " : "") + "The browser session is signed in as " + user +
        " but the page still shows a sign-in form: open the page to check with page:\"<route segment>\". If it still asks to sign in, the app keeps its own state at sign-in: ask the user for the account's password instead of guessing it.";
    }
    return result;
  };

  api.execute = function (contextObject, params) {
    var auth = C8O.mcpAuth.authenticateRequest(contextObject);
    if (!auth.authenticated || auth.kind === "nocode" || auth.scope !== "mcp:full") {
      throw new Error("A full Convertigo MCP bearer token is required");
    }
    return api.signIn(contextObject, params);
  };
})(C8O.viewerSession);
