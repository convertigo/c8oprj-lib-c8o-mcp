if (typeof C8O === "undefined") {
  var C8O = {};
}

// The Studio browser that a Tigo agent and its verifier drive (CDP), when it does not answer.
//
// With the CDP port of the Studio browser refusing connections, the agent's Playwright failed with
// "connect ECONNREFUSED 127.0.0.1:<port>"; mobile-builder-open already answered browserControlReady:false, but its hint
// said to poll again, and the agent waited and retried for 5 minutes before reporting (feedback reports 25/11). Now
// mobile-builder-open, browser-verify and the verifier of subagent-run probe the endpoint once and, when it does not
// answer, say so at once: the cause, and that browser proof is impossible in this turn (one retry after about 10 s at
// most, then prove the backend and report every page and visual check as not verified). The verifier tools answer
// before they start, so they spend none of their time budget.
(function () {
  var api = C8O.browserReach = C8O.browserReach || {};

  api.INSTRUCTION = "Browser proof is impossible in this turn: retry at most once, after about 10 s; if the browser still " +
    "does not answer, stop waiting: prove the backend with requestable-execute and report every page and visual check as " +
    "NOT verified (never \"fixed\", \"works\" or \"build OK\").";

  function text(value) {
    return value === null || value === undefined ? "" : String(value).replace(/^\s+|\s+$/g, "");
  }

  // http://127.0.0.1:39084/json -> 127.0.0.1:39084
  api.hostPort = function (endpoint) {
    var t = text(endpoint);
    var m = /^[a-z]+:\/\/([^\/?#]+)/i.exec(t);
    return m ? m[1] : t.replace(/\/.*$/, "");
  };

  // The cause of a failed connection, from a Java exception (its class and message) or a JavaScript error.
  api.causeOf = function (error, timeoutMs) {
    var javaError = error && error.javaException ? error.javaException : error;
    var className = "";
    var message = "";
    try {
      className = javaError && javaError.getClass ? String(javaError.getClass().getName()) : text(error && error.name);
    } catch (_noClass) {}
    try {
      message = javaError && javaError.getMessage ? text(javaError.getMessage()) : text(error && error.message);
    } catch (_noMessage) {}
    if (/ConnectException$/.test(className) || /connection refused|ECONNREFUSED/i.test(message)) {
      return "connection refused";
    }
    if (/SocketTimeoutException$|HttpConnectTimeoutException$|HttpTimeoutException$/.test(className) || /timed? ?out/i.test(message)) {
      var seconds = (Number(timeoutMs) || 1500) / 1000;
      return "no answer within " + (seconds % 1 ? seconds.toFixed(1) : String(seconds)) + " s";
    }
    if (/UnknownHostException$/.test(className)) {
      return "unknown host";
    }
    return message.length ? message.substring(0, 160) : (className || "no answer");
  };

  // "the Studio browser does not answer on 127.0.0.1:<port>: connection refused"
  api.errorText = function (endpoint, cause) {
    return "the Studio browser does not answer on " + api.hostPort(endpoint) + ": " + (text(cause) || "no answer");
  };

  // The message of a tool that cannot start because of it.
  api.refusal = function (endpoint, cause) {
    return "browserControlReady false: " + api.errorText(endpoint, cause) + ". " + api.INSTRUCTION;
  };

  // {ok: true} or {ok: false, cause}: GET <endpoint>/json/version within timeoutMs. open(url, timeoutMs) returns the HTTP
  // status and throws as java.net does; the tests give their own.
  api.probe = function (endpoint, timeoutMs, open) {
    var base = text(endpoint).replace(/\/+$/, "").replace(/\/json(\/(list|version))?$/, "");
    if (!base.length) {
      return { ok: false, cause: "no Studio browser for this conversation" };
    }
    var timeout = Number(timeoutMs) || 1500;
    var opener = open || function (url, ms) {
      var connection = new java.net.URL(url).openConnection();
      connection.setConnectTimeout(ms);
      connection.setReadTimeout(ms);
      try {
        return Number(connection.getResponseCode());
      } finally {
        try {
          connection.disconnect();
        } catch (_ignoreDisconnect) {}
      }
    };
    try {
      var status = opener(base + "/json/version", timeout);
      if (status >= 200 && status < 300) {
        return { ok: true };
      }
      return { ok: false, cause: "HTTP " + status + " on /json/version" };
    } catch (error) {
      return { ok: false, cause: api.causeOf(error, timeout) };
    }
  };
})();
