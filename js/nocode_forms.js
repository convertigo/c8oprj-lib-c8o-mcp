if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.nocodeForms = C8O.nocodeForms || {};

(function () {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var File = Packages.java.io.File;
  var FileUtils = Packages.org.apache.commons.io.FileUtils;
  var HashMap = Packages.java.util.HashMap;
  var Base64 = Packages.java.util.Base64;
  var InternalHttpServletRequest = Packages.com.twinsoft.convertigo.engine.requesters.InternalHttpServletRequest;
  var InternalRequester = Packages.com.twinsoft.convertigo.engine.requesters.InternalRequester;
  var XMLUtils = Packages.com.twinsoft.convertigo.engine.util.XMLUtils;
  var JsonOutput = Packages.com.twinsoft.convertigo.engine.enums.JsonOutput;

  function trimmed(value) {
    return value == null ? "" : String(value).trim();
  }

  // The HTTP request the calls go through: the internal request of an edit running in a thread of its own
  // (js/nocode_form_edit_job.js), which outlives the call, else the request of the call.
  function callRequest() {
    if (C8O.detachedRequest) {
      return C8O.detachedRequest;
    }
    return typeof context !== "undefined" && context && context.httpServletRequest ? context.httpServletRequest : null;
  }

  function requestBearerToken() {
    try {
      var bearerRequest = callRequest();
      if (bearerRequest) {
        var authorization = bearerRequest.getHeader("Authorization");
        var match = /^Bearer\s+(.+)$/i.exec(String(authorization || ""));
        if (match && match[1] != null) {
          return trimmed(match[1]);
        }
      }
    } catch (_ignoreAuthorizationHeader) {}
    return "";
  }

  function clone(value, fallback) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_ignoreClone) {
      return fallback;
    }
  }

  // The Rhino JSON parser tolerates unbalanced or trailing input and silently
  // returns a truncated value; a malformed reduced form then compiled into an
  // empty "Untitled form" without any diagnostic. Refuse such text explicitly.
  function assertStrictJsonText(text, label) {
    var name = label || "value";
    var stack = [], inString = false, escaped = false, started = false, endedAt = -1;
    function fail(reason, pos) {
      var from = Math.max(0, pos - 40), to = Math.min(text.length, pos + 40);
      throw new Error(name + " is not valid JSON (" + text.length + " characters were received in full, this is not a transport truncation): " + reason + " at position " + pos + ": ..." + text.substring(from, to) + "...");
    }
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (inString) {
        if (escaped) { escaped = false; }
        else if (ch === "\\") { escaped = true; }
        else if (ch === "\"") { inString = false; if (!stack.length && endedAt < 0) { endedAt = i; } }
        continue;
      }
      if (endedAt >= 0 && !/\s/.test(ch)) { fail("unexpected content after the end of the JSON value", i); }
      if (ch === "\"") { inString = true; started = true; }
      else if (ch === "{" || ch === "[") { stack.push({ ch: ch, pos: i }); started = true; }
      else if (ch === "}" || ch === "]") {
        if (!stack.length) { fail("unexpected '" + ch + "' with nothing left to close", i); }
        var open = stack.pop();
        var expected = open.ch === "{" ? "}" : "]";
        if (ch !== expected) { fail("unexpected '" + ch + "': the " + (open.ch === "{" ? "object" : "array") + " opened at position " + open.pos + " must be closed with '" + expected + "' first", i); }
        if (!stack.length && endedAt < 0) { endedAt = i; }
      }
    }
    if (inString) { fail("unterminated string", text.length); }
    if (stack.length) {
      var last = stack[stack.length - 1];
      fail(stack.length + " bracket(s) left open; the " + (last.ch === "{" ? "object" : "array") + " opened here is never closed", last.pos);
    }
    if (!started) { fail("no JSON value", 0); }
    return true;
  }


  // The first syntax error of a JSON text, { pos, reason }, or null when the text is exactly one JSON value: a strict
  // reader of the whole grammar (keys in double quotes, commas, colons), where the Rhino parser accepts some broken text.
  function jsonSyntaxError(text) {
    var i = 0, n = text.length;
    function fail(reason) { throw { jsonPos: i, reason: reason }; }
    function ws() {
      while (i < n) {
        var code = text.charCodeAt(i);
        if (code !== 32 && code !== 9 && code !== 10 && code !== 13) { return; }
        i++;
      }
    }
    function str() {
      i++;
      while (i < n) {
        var ch = text.charAt(i);
        if (ch === "\\") { i += 2; continue; }
        if (ch === "\"") { i++; return; }
        i++;
      }
      fail("unterminated string");
    }
    function num() {
      var start = i;
      if (text.charAt(i) === "-") { i++; }
      while (i < n && /[0-9.eE+\-]/.test(text.charAt(i))) { i++; }
      if (!/^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+\-]?[0-9]+)?$/.test(text.substring(start, i))) { i = start; fail("invalid number"); }
    }
    function value() {
      ws();
      var ch = text.charAt(i);
      if (ch === "{") { obj(); }
      else if (ch === "[") { arr(); }
      else if (ch === "\"") { str(); }
      else if (ch === "-" || (ch >= "0" && ch <= "9")) { num(); }
      else if (text.substr(i, 4) === "true" || text.substr(i, 4) === "null") { i += 4; }
      else if (text.substr(i, 5) === "false") { i += 5; }
      else { fail(i >= n ? "the text ends where a value was expected" : "a value was expected"); }
    }
    function obj() {
      i++;
      ws();
      if (text.charAt(i) === "}") { i++; return; }
      for (;;) {
        ws();
        if (text.charAt(i) !== "\"") { fail("a property name in double quotes was expected"); }
        str();
        ws();
        if (text.charAt(i) !== ":") { fail("':' was expected after a property name"); }
        i++;
        value();
        ws();
        var ch = text.charAt(i);
        if (ch === ",") { i++; continue; }
        if (ch === "}") { i++; return; }
        fail(i >= n ? "the text ends inside an object" : "',' or '}' was expected");
      }
    }
    function arr() {
      i++;
      ws();
      if (text.charAt(i) === "]") { i++; return; }
      for (;;) {
        value();
        ws();
        var ch = text.charAt(i);
        if (ch === ",") { i++; continue; }
        if (ch === "]") { i++; return; }
        fail(i >= n ? "the text ends inside an array" : "',' or ']' was expected");
      }
    }
    try {
      value();
      ws();
      if (i < n) { fail("unexpected content after the end of the JSON value"); }
      return null;
    } catch (e) {
      if (e && typeof e.jsonPos === "number") { return { pos: e.jsonPos, reason: e.reason }; }
      throw e;
    }
  }

  // The text a model wrote with the slips of long JSON repaired: a code fence around it, comments, a comma before a
  // closing bracket, and one or two closing braces or brackets too many, missing or misplaced (the counts of opening and
  // closing brackets say which). Each reading the edits give near the place where the text breaks is weighed by the
  // closing brackets next to the edit: a model loses count in a run such as }}]}}, so the reading that edits the longest
  // run wins, and a tie between two readings is refused. A string is never changed. Measured on 19/11 on 12 malformed
  // answers: the 6 brace slips were all read as the model meant (5 in a run of 2 to 5 closing brackets), the 3 others
  // were comments; the 3 refused ones were not JSON slips. { text, repairs: [text] } or null.
  function repairJsonText(text) {
    var repairs = [];
    var current = text;
    var fence = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```\s*$/.exec(current);
    if (fence) { current = fence[1]; repairs.push("the ``` code fence around the JSON removed"); }
    // outside strings: comments removed, a comma before a closing bracket removed, brackets counted
    function scan(source) {
      var out = [], inString = false, comments = 0, commas = 0, counts = { "{": 0, "}": 0, "[": 0, "]": 0 };
      for (var i = 0; i < source.length; i++) {
        var ch = source.charAt(i);
        if (inString) {
          out.push(ch);
          if (ch === "\\" && i + 1 < source.length) { out.push(source.charAt(++i)); }
          else if (ch === "\"") { inString = false; }
          continue;
        }
        if (ch === "/" && source.charAt(i + 1) === "/") {
          while (i < source.length && source.charAt(i) !== "\n") { i++; }
          comments++;
          out.push("\n");
          continue;
        }
        if (ch === "/" && source.charAt(i + 1) === "*") {
          var end = source.indexOf("*/", i + 2);
          if (end < 0) { return null; }
          i = end + 1;
          comments++;
          continue;
        }
        if (ch === ",") {
          var j = i + 1;
          while (j < source.length && /\s/.test(source.charAt(j))) { j++; }
          if (source.charAt(j) === "}" || source.charAt(j) === "]") { commas++; continue; }
        }
        if (ch === "\"") { inString = true; }
        if (hasOwn(counts, ch)) { counts[ch]++; }
        out.push(ch);
      }
      return { text: out.join(""), comments: comments, commas: commas, counts: counts };
    }
    var scanned = scan(current);
    if (!scanned) { return null; }
    if (scanned.comments) { repairs.push(scanned.comments + " comment(s) removed"); }
    if (scanned.commas) { repairs.push(scanned.commas + " comma(s) before a closing bracket removed"); }
    current = scanned.text;
    var broken = jsonSyntaxError(current);
    if (!broken) { return repairs.length ? { text: current, repairs: repairs } : null; }
    var need = { "}": scanned.counts["{"] - scanned.counts["}"], "]": scanned.counts["["] - scanned.counts["]"] };
    var units = Math.abs(need["}"]) + Math.abs(need["]"]);
    if (units > 2) { return null; }
    var WINDOW = 400, budget = 2500, exhausted = false;
    function reads(source) {
      if (--budget < 0) { exhausted = true; return { pos: -1 }; }
      return jsonSyntaxError(source);
    }
    // the closing brackets next to a place, whitespace between them ignored
    function closersAround(source, at) {
      var n = 0, k;
      for (k = at - 1; k >= 0 && /[\s}\]]/.test(source.charAt(k)); k--) { if (source.charAt(k) !== " " && !/\s/.test(source.charAt(k))) { n++; } }
      for (k = at; k < source.length && /[\s}\]]/.test(source.charAt(k)); k++) { if (!/\s/.test(source.charAt(k))) { n++; } }
      return n;
    }
    // In the window before pos, outside strings, the edits a need asks for: a closing bracket of a kind in excess removed,
    // or one missing added where a value ends (after a string or a closing bracket, before a comma, at pos).
    function editsOf(source, pos, wanted) {
      var edits = [], seen = {}, inString = false, start = pos - WINDOW;
      function add(at, close, removed) {
        var key = at + close + removed;
        if (seen[key]) { return; }
        seen[key] = true;
        edits.push({ at: at, close: close, removed: removed, score: closersAround(source, at),
          text: removed ? source.substring(0, at) + source.substring(at + 1) : source.substring(0, at) + close + source.substring(at) });
      }
      for (var k = 0; k <= Math.min(pos, source.length - 1); k++) {
        var c = source.charAt(k);
        if (inString) {
          if (c === "\\") { k++; }
          else if (c === "\"") {
            inString = false;
            if (k + 1 >= start) { ["}", "]"].forEach(function (close) { if (wanted[close] > 0) { add(k + 1, close, false); } }); }
          }
          continue;
        }
        if (c === "\"") { inString = true; continue; }
        if (k < start) { continue; }
        ["}", "]"].forEach(function (close) {
          if (wanted[close] < 0 && c === close) { add(k, close, true); }
          if (wanted[close] > 0 && (c === "}" || c === "]")) { add(k + 1, close, false); }
          if (wanted[close] > 0 && c === ",") { add(k, close, false); }
        });
      }
      ["}", "]"].forEach(function (close) { if (wanted[close] > 0) { add(pos, close, false); } });
      return edits;
    }
    function minus(wanted, edit) {
      var out = { "}": wanted["}"], "]": wanted["]"] };
      out[edit.close] += edit.removed ? 1 : -1;
      return out;
    }
    // the distinct readings: the best weight of each (a lone edit always before two), then the latest edit
    var readings = {};
    function consider(source, score, steps) {
      var value;
      try { value = JSON.stringify(JSON.parse(source)); } catch (_notRead) { return; }
      var last = Math.max.apply(null, steps.map(function (step) { return step.at; }));
      var known = readings[value];
      if (!known || score > known.score || (score === known.score && last > known.last)) { readings[value] = { score: score, last: last, steps: steps, text: source }; }
    }
    // brackets that balance but break the text: one closing bracket misplaced, added where the text breaks and removed
    // where it then breaks
    var firstNeeds = units === 0 ? [{ "}": 1, "]": 0 }, { "}": 0, "]": 1 }] : [need];
    firstNeeds.forEach(function (wanted) {
      editsOf(current, broken.pos, wanted).forEach(function (first) {
        var after = reads(first.text);
        if (!after) { if (units === 1) { consider(first.text, first.score, [first]); } return; }
        if (units === 1 || after.pos <= broken.pos + 1) { return; }
        var rest = units === 0 ? { "}": first.close === "}" ? -1 : 0, "]": first.close === "]" ? -1 : 0 } : minus(wanted, first);
        editsOf(first.text, after.pos, rest).forEach(function (second) {
          if (!reads(second.text)) { consider(second.text, first.score + second.score - 100, [first, second]); }
        });
      });
    });
    if (exhausted) { return null; }
    var ranked = Object.keys(readings).map(function (key) { return readings[key]; }).sort(function (a, b) { return b.score - a.score || b.last - a.last; });
    if (!ranked.length || (ranked.length > 1 && ranked[1].score === ranked[0].score)) { return null; }
    var chosen = ranked[0];
    var base = current;
    chosen.steps.forEach(function (step, index) {
      var source = index === 0 ? base : chosen.steps[0].text;
      var from = Math.max(0, step.at - 30);
      var what = units === 0 ? (step.removed ? "the misplaced '" + step.close + "' removed" : "a '" + step.close + "' added where it was missing") :
        (step.removed ? "a '" + step.close + "' too many removed" : "a missing '" + step.close + "' added");
      repairs.push(what + " at position " + step.at + (!step.removed && step.at >= source.length ? ", at the end: check that nothing is missing" : "") +
        " (..." + source.substring(from, Math.min(source.length, step.at + 30)).replace(/\s+/g, " ") + "...)");
    });
    return { text: chosen.text, repairs: repairs };
  }

  // The repairs of a JSON text, kept on the value it reads as (not enumerable: never sent nor saved) for the answer.
  function keepTextRepairs(value, label, repairs) {
    if (!value || typeof value !== "object" || !repairs || !repairs.length) { return value; }
    var list = repairs.map(function (text) {
      return { code: "json_text_repaired", at: label || "value", message: text + ". The JSON text was read after this repair: send valid JSON next time." };
    });
    try { Object.defineProperty(value, "__textRepairs", { value: list, enumerable: false, configurable: true, writable: true }); } catch (_frozen) {}
    return value;
  }

  // answer.repairs: the repairs of the JSON text of input (the argument the answer was made from) first, then those of
  // the C8Oforms answer it was made from (from), then its own.
  function withRepairs(answer, input, from) {
    if (!answer || typeof answer !== "object") { return answer; }
    var list = [].concat(input && Array.isArray(input.__textRepairs) ? input.__textRepairs : [], from && from !== answer && Array.isArray(from.repairs) ? from.repairs : []);
    if (Array.isArray(answer.repairs)) { list = list.concat(answer.repairs.filter(function (item) { return list.indexOf(item) < 0; })); }
    if (list.length) { answer.repairs = list; }
    return answer;
  }

  // A JSON object or array text read strictly; with a slip repairJsonText repairs, read after the repair (listed on the
  // value); otherwise refused with the position of the first error.
  function readJsonText(text, label, isWanted) {
    var error = jsonSyntaxError(text);
    if (!error) {
      try { return JSON.parse(text); } catch (e) { throw new Error((label || "value") + " is not valid JSON: " + (e && e.message ? e.message : e)); }
    }
    var repaired = repairJsonText(text);
    if (repaired) {
      var value = JSON.parse(repaired.text);
      if (isWanted(value)) { return keepTextRepairs(value, label, repaired.repairs); }
    }
    assertStrictJsonText(text, label);
    var from = Math.max(0, error.pos - 40), to = Math.min(text.length, error.pos + 40);
    throw new Error((label || "value") + " is not valid JSON (" + text.length + " characters were received in full, this is not a transport truncation): " + error.reason + " at position " + error.pos + ": ..." + text.substring(from, to) + "...");
  }

  function isPlainObject(value) { return !!value && typeof value === "object" && !Array.isArray(value); }

  function parseObject(value, label, fallback) {
    if (value == null || trimmed(value).length === 0) {
      return fallback;
    }
    var text = trimmed(value);
    if (text.charAt(0) === "{" || text.indexOf("```") === 0) {
      var parsedText = readJsonText(text, label, isPlainObject);
      if (isPlainObject(parsedText)) {
        return parsedText;
      }
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
      var parsedText = readJsonText(text, label, Array.isArray);
      if (Array.isArray(parsedText)) {
        return parsedText;
      }
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

  function parseOperations(value, label, fallback) {
    if (value == null || trimmed(value).length === 0) {
      return fallback || [];
    }
    if (Array.isArray(value)) {
      return value;
    }
    var text = trimmed(value);
    if (text.charAt(0) === "{" || text.charAt(0) === "[") {
      var read = null;
      try {
        read = readJsonText(text, label || "operations", function (item) { return item != null && typeof item === "object"; });
      } catch (_ignoreOperationTextParse) {}
      if (read != null) {
        var operations = parseOperations(read, label, fallback);
        return read.__textRepairs ? keepTextRepairs(operations, label || "operations", read.__textRepairs.map(function (item) { return item.message.replace(/\. The JSON text was read after this repair: send valid JSON next time\.$/, ""); })) : operations;
      }
    }
    if (typeof value === "object") {
      if (value.operations != null) {
        return parseOperations(value.operations, label, fallback);
      }
      if (value.operation != null) {
        return parseOperations(value.operation, label, fallback);
      }
      if (value.arguments && typeof value.arguments === "object" && value.arguments.operations != null) {
        return parseOperations(value.arguments.operations, label, fallback);
      }
      return [value];
    }
    try {
      var parsed = JSON.parse(text);
      return parseOperations(parsed, label, fallback);
    } catch (_ignoreOperationParse) {}
    throw new Error((label || "operations") + " must be a JSON array or operation object");
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
  function hasOwn(value, key) {
    return value != null && Object.prototype.hasOwnProperty.call(value, key);
  }

  // The No Code form contract belongs to the C8Oforms of the server: its sections, compiler, validator and edit operations
  // (C8Oforms js/nocode_form_contract.js), run through its private sequences NoCode_Contract and NoCode_Form. This file
  // keeps the agent guidance, the paging of the contract, the token check, the reads made with the rights of the user and
  // the saves (C8Oforms APIV2_updateFormulaireDocument).
  function formsProjectName(options) {
    return trimmed(options && (options.project || options.projectName)) || "C8Oforms";
  }

  function formsContractAvailable(projectName) {
    try {
      var project = Engine.theApp.databaseObjectsManager.getOriginalProjectByName(projectName);
      return project != null && project.getSequenceByName("NoCode_Form") != null;
    } catch (_noContract) {
      return false;
    }
  }

  function formsError(code, message, extra) {
    var error = new Error(message);
    if (code) { error.code = code; }
    if (extra && extra.flowsInUse) { error.flowsInUse = extra.flowsInUse; }
    return error;
  }

  // One operation of the C8Oforms contract: { result } or { needs }; an error of C8Oforms is thrown with its message.
  function callForms(operation, input, options) {
    var projectName = formsProjectName(options);
    if (!formsContractAvailable(projectName)) {
      throw formsError("c8oforms_contract_unavailable", "The C8Oforms of this server (" + projectName + ") does not carry the No Code form contract " +
        "(sequences NoCode_Contract and NoCode_Form, C8Oforms 2.3 and later): update C8Oforms to use the no-code form tools.");
    }
    var response = callC8oSequence(projectName, "NoCode_Form", { operation: operation, input: JSON.stringify(input || {}) });
    var envelope = response && (response.document || (response.doc && response.doc.document) || response);
    var text = envelope && envelope.res ? envelope.res.json : null;
    var answer = null;
    try { answer = JSON.parse(String(text)); } catch (_unreadable) { answer = null; }
    if (!answer || typeof answer !== "object") {
      var failure = apiError(response);
      throw formsError("c8oforms_contract_error", "C8Oforms NoCode_Form " + operation + " gave no answer" + (failure ? ": " + JSON.stringify(failure) : ""));
    }
    if (answer.error) {
      throw formsError(answer.error.code, answer.error.message, answer.error);
    }
    return answer;
  }

  // The catalog of the user's no-code database, read with the user's account (nocode_baserow.js), [] when unreadable.
  function readTableIndex(options) {
    try {
      if ((typeof C8O.nocodeBaserow === "undefined" || !C8O.nocodeBaserow.tableIndex) && typeof include === "function") {
        include("js/nocode_baserow.js");
      }
      var index = typeof C8O.nocodeBaserow !== "undefined" && C8O.nocodeBaserow.tableIndex ? C8O.nocodeBaserow.tableIndex(options && options.token) : null;
      return Array.isArray(index) ? index : [];
    } catch (_ignoreCatalog) {
      return [];
    }
  }

  // An operation of the C8Oforms contract with the reads it asks for: the catalog of the user's no-code database and the
  // columns of tables (reads.fieldsOf, with the authenticated account), sent back in input.options until it answers.
  var FORMS_READ_ROUNDS = 4;
  function formsRun(operation, input, options, reads) {
    var call = input || {};
    call.options = call.options || {};
    for (var round = 0; round <= FORMS_READ_ROUNDS; round++) {
      var answer = callForms(operation, call, options);
      if (!answer.needs) {
        return answer.result;
      }
      if (answer.needs.tableIndex) {
        if (Array.isArray(call.options.tableIndex)) { break; }
        call.options.tableIndex = readTableIndex(options);
      }
      if (answer.needs.tableFields) {
        if (!reads || typeof reads.fieldsOf !== "function") { break; }
        var tableFields = call.options.tableFields && typeof call.options.tableFields === "object" ? call.options.tableFields : {};
        ensureArray(answer.needs.tableFields).forEach(function (tableId) {
          var fields = null;
          try { fields = reads.fieldsOf(tableId); } catch (_unreadableTable) { fields = null; }
          tableFields[String(tableId)] = fields == null ? null : fields;
        });
        call.options.tableFields = tableFields;
      }
    }
    throw formsError("c8oforms_contract_error", "C8Oforms NoCode_Form " + operation + " kept asking for " + JSON.stringify(answer.needs));
  }

  // What the checks of C8Oforms read from the options of a tool: never the token nor the thumbnail.
  function formsOptions(options, extra) {
    var opts = options || {};
    var out = {};
    ["generation", "strictBindingPaths", "keptReferenceTokens", "removedInputNames", "tableIndex", "baserowLinks"].forEach(function (key) {
      if (hasOwn(opts, key) && opts[key] != null) { out[key] = opts[key]; }
    });
    out.project = formsProjectName(opts);
    Object.keys(extra || {}).forEach(function (key) { out[key] = extra[key]; });
    return out;
  }

  function validateForm(form, options) {
    return formsRun("validate", { form: form, options: formsOptions(options) }, options);
  }

  function formBindingCount(form, options) {
    return formsRun("bindings", { form: form }, options).count;
  }

  // The agent guidance of the contract, the same whatever the C8Oforms: how to write an application with the tools,
  // creation and editing lifecycles, design rules, the tool of the edits. forms: the contract of the C8Oforms of the
  // server (NoCode_Contract), for the constants the guidance quotes and the edit operations it lists.
  function guidanceSections(forms) {
    return {
      format: "reduced-authoring-json",
      intent: "Generate this reduced JSON. The MCP tool compiles it to full C8Oforms JSON, validates it, and persists through C8Oforms APIs.",
      creationLifecycle: {
        baserow: "Supply the real discovered table path/id, columns, filters and action variables; omit form_id/source_id/source_owner. nocode-form-create compiles, saves, reads the assigned id, binds identities, saves again and verifies. Only form/source identity fields are managed: table selection, data mappings, ACLs and business data are not changed.",
        compile: "bindingFinalization.status=pending_creation and baserow_identity_pending_creation are expected, nonblocking before create. Do not stop or fabricate ids.",
        complete: "saved=true and bindingFinalization.status=ready mean saved identities were verified, not that the business flow was executed or Baserow permissions tested.",
        recovery: "If saved=true with status=partial and bindingFinalization.status=pending, the form already exists. Follow bindingFinalization.recovery: nocode-form-edit with [{action:'finalize_baserow_bindings'}] on the returned id. Do not call create again. This idempotent operation is restricted to the authenticated creator and does not change a different source owner's account."
      },
      editingLifecycle: {
        find: "A form named without its id: nocode-form-list { name } (part of the name, no case nor accents) gives the id of each form of the user that matches, theirs and those shared with them, as the No Code Studio home lists them; read it with nocode-form-get. Its total answers how many forms or applications the user has. It never writes.",
        baserow: "New or changed bindings receive the existing form id and actual component id in the edit save. New bindings use the authenticated caller; existing binding owners are preserved. Unchanged legacy bindings are not rewritten.",
        concurrency: "Existing-form writes are conditional on the revision read. A conflict requires a fresh read and reconsideration of the edit, never a blind retry or a new create. This requires C8Oforms APIV2_updateFormulaireDocument with form_write_guard.js support.",
        navigation: "add_page inherits the adjacent page navigation unless navigationMode is explicit. custom disables automatic tabs and buttons; author entry/return flows."
      },
      generationQuality: {
        labels: {
          rule: "Every visible question needs a domain-appropriate label or rich description. name is technical and defaultFrom supplies the answer, not the question. Resolve prototype_question_label warnings before delivery.",
          mapping: "A question label is always rich, as the editor writes it: personalized:true, config.html <p>escaped label</p>. description or config.html gives its HTML instead (not help text); text outside a block goes in a <p>. Saves convert plain labels."
        },
        navigation: {
          custom: "Disables automatic tabs and page buttons. Create native button fields linked to named flows containing push_page. Every page needs a reachable entry and a return path.",
          targetPage: "Use the unique page name in reduced flow targetPage; compilation resolves it to the generated pageTechName. Saved documents use pageTechName. Special targets: __c8o_back, __c8o_next, __c8o_previous.",
          example: { button: { type: "button", name: "open_requests", label: "My requests", icon: "list", flow: "open_requests" }, flow: { id: "open_requests", name: "Open my requests", elements: [{ type: "push_page", targetPage: "My requests" }] } }
        },
        styles: {
          rule: "Native spacing and grouping are a required design pass for generated applications, not an optional decoration. Assign every visible block a spacing role and write its actual style objects or deliberate parent-provided spacing. Use HTML for content, not duplicate container padding. Never overwrite styles on an existing component unless requested.",
          scopes: { boxStyle: "Outer component container: margin separates components, padding separates content from its border.", questionBoxStyle: "Question/header only, when that component has one.", componentBoxStyle: "Inner control only, when supported.", layoutChildrenStyle: "Child containers by default/first/last scope; not the layout container itself." },
          values: "CSS strings: lengths include units (px, rem, %, etc.) except 0. Margin/padding accept 1-4 values. Empty strings preserve Forms defaults. Explicit config overrides shorthand. Individual border properties can override border shorthand: avoid conflicting settings.",
          spacingScale: { close: "8px", normal: "16px", section: "24px", major: "32px" },
          cardExample: { boxStyle: { margin: "0 0 24px 0", padding: "16px", border: "1px solid #E2E8F0", borderRadius: "12px", backgroundColor: "#FFFFFF" } },
          recipes: {
            usage: "Copy/adapt these literal native objects; recipe names are documentation, not extra reduced JSON properties. Keep the user's existing theme and responsive root gutters. Zero or inherited spacing is intentional when it avoids double spacing.",
            welcome: { boxStyle: { margin: "0 0 24px 0", padding: "24px", border: "1px solid #E2E8F0", borderRadius: "12px" } },
            section: { boxStyle: { margin: "0 0 24px 0", padding: "16px", border: "1px solid #E2E8F0", borderRadius: "12px" } },
            fieldInsideSection: { boxStyle: { margin: "0 0 8px 0", padding: "0", border: "0", backgroundColor: "transparent" } },
            dataView: { boxStyle: { margin: "0 0 24px 0", padding: "16px", border: "1px solid #E2E8F0", borderRadius: "12px" } },
            actionGroup: { boxStyle: { margin: "16px 0 24px 0", padding: "0", border: "0", backgroundColor: "transparent" } },
            standaloneButton: { boxStyle: { margin: "8px 0 16px 0", padding: "0", border: "0", backgroundColor: "transparent" } },
            buttonInsideGroup: { boxStyle: { margin: "0", padding: "4px", border: "0", backgroundColor: "transparent" } }
          },
          roleDefaults: {
            rule: "In an application (navigationMode custom or tabs) the compiler gives every new component without a style of its own the spacing of its role; a linear questionnaire keeps the viewer card around each question. Author styles only to depart from these defaults; an explicit style object replaces the default of that scope.",
            roles: { field: "top-level input: flat, 16px below", text: "top-level description: flat, 16px below", dataView: "top-level grid/chart/map/gallery: white card, 16px padding", button: "top-level button: transparent wrapper", actions: "layout of buttons: transparent, children 4px apart", row: "layout of fields: flat, 12px gutters between columns and rows", section: "section: white card with a title, see componentAuthoring.section" },
            values: forms.roleStyles,
            optOut: "Root styleDefaults:false, or add_field with styleDefaults:false, keeps the viewer cards."
          },
          mobile: "Root config.<device> sets the page container: horizontalMargin outside, padding inside, adding up on each side. New applications get horizontalMargin 32px desktop, 16px tablet, 0 on phones and padding 24px, 20px, 12px; a linear questionnaire keeps the wider creation margins (100/60/10px). See rootFields.config. Box styles are the same on every device: prefer the 8/12/16/24px values of the role defaults to larger ones, and columns that collapse to one on phones.",
          richText: "Label and description HTML is rendered as written: inline style attributes (color, font-size, font-weight, text-align, margins) and the global Ionic utility classes work; font-family is overridden by the viewer font. The form document has no stylesheet, custom CSS class, theme color or dark mode: apply the design tokens explicitly. Do not rely on <style> blocks or event attributes.",
          boxStyles: "Only the keys of styleObjectFields are rendered; see styleRendering for the parts, the precedence (application, page, parent layoutChildrenStyle, component), the text color rules and the nesting of containers.",
          nesting: "One surface per logical group. Use boxStyle for outer margin/padding, questionBoxStyle only for the header and componentBoxStyle only for the inner control. Child boxStyle can override layoutChildrenStyle: do not double-pad or combine conflicting shorthand and per-side values. Preserve native input affordances.",
          review: "Review all visible blocks, including inputs, grids and action groups, not only the welcome card. Use a consistent spacing scale (for example 8/16/24px), verify mobile overflow and desktop density. Empty spacing alone is not an error.",
          actionGroups: "Put related buttons in a native layout: two columns on desktop/tablet, one on phones. Keep group spacing on the layout and avoid a separate full-width card per button. Do not group unrelated actions automatically.",
          buttonSurfaces: "Standalone buttons and action-only layouts use explicit boxStyle.backgroundColor=transparent and border=0 by default, not a white full-width card. Empty or omitted values may keep the white Forms default. Check parent layout and layoutChildrenStyle surfaces too. This is the wrapper only: preserve the clickable button's own backgroundColor/config.backgroundColor and readable text. Keep a surrounding content card only when semantically intended or requested.",
          acceptance: ["Check every page: introduction, section groups, inputs, data views and action groups, including nested children.", "Verify margin/padding/borders survived saved-form readback. Color/radius alone is not spacing; defaults or parent-provided spacing must be deliberate.", "Resolve partial_page_styling and ungrouped_adjacent_buttons warnings by reviewing the actual design, not by applying one card style everywhere.", "When browser access is authorized, check desktop/mobile gaps, field widths, button wrapping and overflow. Otherwise report visual verification pending."]
        },
        designTokens: {
          rule: "One small palette for the whole application, chosen for contrast on a light page. Reuse these values in styles, HTML, buttons and toasts instead of inventing new ones; keep a user-requested brand color instead of primary when given.",
          tokens: forms.designTokens,
          typography: "Page title h2 1.5rem in text color, subtitle and hints in muted color, section titles h3. Never repeat the application name as the title of every page.",
          mobileFirst: "Design for a phone first: one column on phoneP/phoneL (size 12), two on tablet, more only on desktop. Buttons stack on phones. Lists show few short columns; details go on a detail page."
        },
        pageHeader: {
          rule: "Every page of an application needs its own header: a page title, an optional one-line subtitle and, on task and detail pages, a back action. The viewer otherwise shows the form name in a large title card on every page with isNameDisplayed not false.",
          reduced: "page.header: { title, subtitle } adds a description block at the top of the page (h2 title, muted subtitle, no card). With navigationMode custom, pages default to isNameDisplayed=false; set it true on the home page only if the application name should appear there. Root titleDisplay (form, page, none) chooses what that title card shows where it is displayed.",
          example: { name: "Contact", header: { title: "Fiche contact", subtitle: "Les informations du contact sélectionné." }, fields: [{ type: "section", name: "contact_main", title: "Identité", fields: [{ type: "text", name: "contact_first_name", label: "Prénom" }, { type: "text", name: "contact_last_name", label: "Nom" }] }] },
          back: "Put the back action in the page action bar as a ghost or secondary button whose flow is push_page to the list page (or __c8o_back)."
        },
        actionBar: {
          rule: "One primary action per page or section, visually dominant; the others are secondary; destructive actions are danger and separated from the primary. Cancel is secondary or ghost, never primary.",
          variants: "button.variant: primary (solid primary), secondary (outline: transparent background, primary text and border), danger (solid red), ghost (text only). Explicit fill/backgroundColor/color override the variant. Do not set fill outline/clear with a solid backgroundColor: the viewer paints it solid.",
          order: "Primary action first in reading order, on the left of the group (it stacks on top on phones). Navigation buttons (Home, Contacts...) are a separate group from task actions: make the current page's entry primary or omit it, the others ghost or secondary.",
          example: { type: "layout", name: "contact_actions", cols: [{ size: 6 }, { size: 6 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }], phoneP: [{ size: 12 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }], phoneL: [{ size: 12 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }, { size: 0 }], boxStyle: { margin: "16px 0 24px 0", padding: "0", border: "0", backgroundColor: "transparent" }, layoutChildrenStyle: { default: { margin: "0", padding: "4px", border: "0", backgroundColor: "transparent" } }, children: [{ type: "button", name: "save_contact", label: "Enregistrer", icon: "save", variant: "primary", flow: "save_contact" }, { type: "button", name: "cancel_contact", label: "Annuler", icon: "close", variant: "secondary", flow: "cancel_contact" }] },
          width: "A button keeps the width of its label, centered in its column (justify). expand block or full makes it fill the width of its column in recent viewers (older ones keep the width of the label): use it so the buttons of a group have equal widths, and keep their labels of similar length for older viewers."
        },
        listDetail: {
          rule: "A list page shows a source-backed grid of a few short columns (name, status, date, amount) and the actions that apply to the selected row; a detail page shows the selected record in fields grouped in sections (type section), with save/cancel in its action bar.",
          selection: "Detail fields read the list grid selection through defaultFrom { source: 'field', field: <grid>, column: <column>, mode: 'reactive', fallback: '' }: column reads every cell shape of the selected row (raw text, number or date, single select { id, value, color }, link list of { id, value }, lean { value }) and gives its text; never a path ending in 'value', which reads only a single select. Write expressions with a fallback (value ?? ''): older viewers keep the previous value when the expression gives null or undefined, so a cleared selection would leave stale text (recent viewers empty a reactive field then).",
          guard: "Disable the row actions until a row is selected with disabledIf: { field: '<grid>', operator: 'is_empty' }, instead of a mandatory guard field.",
          runtime: "Clicking the selected row again deselects it, unless the grid sets deselectOnSecondClick:false (config.deselectOnSecondClick in a native or patched field; compile and nocode-form-edit put the reduced key there) (viewers that have this option). Recent viewers select the row again by its id after a refresh, older ones by its content: there a modified row is no longer selected after a save. Do not promise that the edited record stays selected."
        },
        emptyStates: {
          rule: "A list or dashboard needs an explicit empty state: a muted hint telling what will appear and which action creates the first record, next to that action.",
          example: { type: "description", name: "contacts_empty", description: "<p style=\"margin:0;color:#64748B\">Aucun contact pour l'instant ? Utilisez « Nouveau contact » pour créer le premier.</p>", boxStyle: { margin: "0 0 8px 0", padding: "0", border: "0", backgroundColor: "transparent" } },
          note: "A row_selected grid is empty until a row is selected, so is_empty on it does not mean 'no record'. Showing the hint only when the table is empty needs a runtime check of the chosen condition in a browser."
        },
        toasts: {
          rule: "A toast confirms the outcome of an action in a few words. color must be a 6-digit hex: the viewer derives the text color from it and any other value gives a transparent toast with white text. The names success, danger, warning, info are compiled to readable hex values; a toast without color is success.",
          recipes: { success: { type: "toast", message: "Contact enregistré", color: "success", duration: 3, position: "bottom" }, error: { type: "toast", message: "Le contact n'a pas pu être enregistré", color: "danger", duration: 6, position: "top", closeBtn: true }, info: { type: "toast", message: "Sélectionnez d'abord un contact", color: "info", duration: 4, position: "top" } },
          duration: "duration is in seconds (3 to 6), not milliseconds.",
          afterSubmit: "A failed submit stops its flow and the viewer shows its own error message: steps after it, including a success toast, run only when the save succeeded. No if_else is needed to guard a success toast. A network failure also stops the flow; older viewers show no message then."
        },
        dataViews: {
          grids: "Lists: at most 5 short visible columns; hide long text (notes, descriptions) and technical columns with forms_config.hidden and show them on the detail page. AutoSizeColumns true sizes columns to their content and scrolls horizontally: set it false for wide tables so columns fit the width. Number columns keep the Baserow decimal places; aggregation results (sum, average) are not rounded by the source, so prefer a count or show amounts on rows.",
          label: "The grid label is a short line: put the section title in a description block (h3) above the grid and keep the grid label short or empty.",
          headers: "Grid column headers show the source column names as they are, and aggregation columns their label (authoringContract.baserowSources.groupAggregations.labels: sum:Amount=Montant, else Somme · Amount); no grid property renames them. When the application creates its Baserow schema, name the fields in the user's language as they should read in the grids (Montant du contrat, not contract_value). With an existing base whose names do not suit, show few columns and explain them in the title above the grid; label the aggregations of a grid or a chart shown to end users.",
          selects: "A source-backed select lists every row, including rows whose display column is empty (blank options). Add a not-empty rule on the display column in forms_Filter and sort with forms_tableSort. A select default from a grid selection uses sources.self.vars.selfVar { type: 'ts', str: \"(function (v) { while (v != null && typeof v === 'object' && !Array.isArray(v) && 'value' in v) { v = v.value; } return v == null ? '' : v; })(fields.<grid> ? fields.<grid>['<column>'] : null)\" }: the cell of the selected row is raw for a text, { id, value, color } for a single select or { value } in lean cells, so unwrap every value, giving a value that exists among the options (otherwise the select stays empty).",
          placeholders: "Give text, select and date inputs a useful placeholder or none: a missing placeholder is compiled to an empty one, never the prototype example text."
        },
        data: {
          local: "sourceEnabled=false is transient UI state, never a substitute for business storage. Use local row actions only for an explicitly temporary interaction; never deliver fictitious-row buttons as an application feature.",
          connected: "Deliver an operational application. For Baserow, discover the authorized workspace/base, plan and create the dedicated schema required by the application (field names in the user's language: they are the grid column headers), then bind save actions and result views to those tables. Ask for an unresolved destination or access; do not fall back to a local demonstration. Do not seed invented records unless explicitly requested.",
          unsupported: "Do not put rows/sampleRows/data directly on a reduced grid: Forms does not initialize local grid rows from those properties. Do not use a self source as a pretend grid backend.",
          tracking: "A tracking page must contain a real source-backed grid/cards view, not explanatory HTML or a local demonstration. Show an empty state until real records exist. Filter private data server-side; a UI filter is not access control.",
          derivedState: "State in Baserow, not localStorage (browser_storage_state); no count, maximum or 'already exists' over a grid's rows in a formula: it gets the selection and one page (grid_rows_in_formula); no debug_* field (debug_component)."
        },
        incrementalCreation: {
          rule: "Tool arguments are generated token by token by the model; a reduced JSON above roughly 4 KB is likely to arrive with a structural typo and be refused. Build large applications in steps, each with a short argument, and pass reduced as a JSON object, not as a string.",
          step1: "nocode-form-create with the skeleton: name, descform, navigationMode, pages with header and iconName, their fields grouped in sections and action layouts (type, name, label, mandatory, choices, Baserow sources/actions with columns), button fields with their variant and flow ids and the push_page/submit flows. No style objects: the role defaults space an application. Remaining design warnings (ungrouped_adjacent_buttons) are expected at this step.",
          step2: "One nocode-form-edit per page for what the skeleton left: add_flow_element for toasts/refresh, update_field for a deliberate style change, update_page for icons/flags. Keep each call to one page so a refused call costs one page, not the application.",
          step3: "nocode-form-get, then nocode-form-validate: all design warnings of step 1 must be resolved before delivery.",
          onInvalidJson: "A 'reduced is not valid JSON' error names the position and shows the surrounding text: fix the JSON at that position and resend the same call. The whole argument was received; it is never a transport truncation."
        },
        completion: ["Read the saved form and validate it after create/edit.", "Check every requested capability against actual components/actions; report unsupported or unconnected functionality explicitly.", "Test navigation, required fields, success/failure feedback and record persistence after reload using an authorized test record. Do not claim visual/runtime checks without a browser capability.", "New compile/create rejects incomplete toasts, empty button flows and unconfigured submit/source grids. Full-document validation reports these as warnings so existing drafts can still be edited; structural reference errors always block."]
      },
      editTool: {
        tool: "nocode-form-edit",
        whenToUse: "Use for incremental changes to an existing form: add/update/delete/move pages, components, flows, or flow elements. Prefer this over nocode-form-update for structural edits.",
        persistence: "The tool fetches through C8Oforms.APIV2_getDocument and saves through C8Oforms.APIV2_updateFormulaireDocument. Never write FullSync directly.",
        requiredInputs: ["id", "operations", "token"],
        operationsShape: "Pass operations as an array for multiple edits or as one operation object for a single edit.",
        commonOperations: [
          { action: "finalize_baserow_bindings", note: "Only operation in the call. Resume an already saved creation by returned id; do not manually patch identity fields or recreate the form." },
          { action: "update_field", note: "A part of a long defaultFrom expression: defaultFromEdit, each find once in the declared expression; the tools compile the result. Refused when No Code Studio changed the expression that runs: send defaultFrom whole.", example: { action: "update_field", fieldName: "total", patch: { defaultFromEdit: [{ find: "* 1.2", replace: "* 1.055" }] } } }
          // the operations of the C8Oforms of the server follow (forms.editOperations)
        ].concat(ensureArray(forms.editOperations)),
        notes: [
          "Use fieldObject with the same reduced component shape accepted by nocode-form-compile.",
          "Use patch for updates; component settings usually live under config.",
          "Use ids when available; names are accepted for user-friendly edits but must be unique.",
          "A key the operation does not read beside its patch, fieldObject or element, or a patch key the component does not have as saved, is refused with the place it belongs (unread_operation_key, unread_patch_key): nothing is saved.",
          "A flow step No Code Studio wrote that the tools do not write (a modal opened or closed, properties set at run time) is kept as it is (warning editor_flow_element_kept); the tools cannot add one.",
          "The answer lists the warnings the edit brought and those of what it changed; validation.otherWarnings counts the others (nocode-form-get warnings:true lists them)."
        ]
      },
      realWorldPatternsFromGestionDesCreches: [
        "Multi-page operational apps can use 8+ pages with ionicIcon values such as list, home, people, receipt, and settings.",
        "Use description components with rich HTML for headers, dashboards, explanatory bands, and visual grouping.",
        "Use layout components heavily to create responsive rows; provide cols and nested children in reduced JSON.",
        "Use grids for tabular operational data and pair them with source-enabled config when data comes from sequences.",
        "Use buttons with icons and named flows for save/status actions.",
        "Use a formulas flow for computed state and validation helpers, and custom flows for submit/toast/if_else sequences."
      ]
    };
  }
  // What the core of the contract says about the tools themselves; the C8Oforms of the server adds what describes the
  // reduced JSON (forms.quickReference).
  function quickReferenceContract(forms) {
    var described = forms && forms.quickReference && typeof forms.quickReference === "object" ? forms.quickReference : {};
    var out = {};
    out.use = "Write reduced JSON: nocode-form-create, nocode-form-edit and nocode-form-compile compile it to C8Oforms JSON, validate it and save it. This core covers usual forms and applications; sectionIndex says which section to ask for details, section example shows a small complete application. What does not fit one answer comes back in remaining.";
    Object.keys(described).forEach(function (key) { out[key] = described[key]; });
    out.answers = "From run_typescript a tool resolves to its answer itself: r.status, r.form, r.id after a create or an edit (no r.result); a refused call has saved:false with validation.issues or error. A saved form: form.formulaire (components: type, name, config.label, config.page; choice options in children), form.pages, form.flows.";
    out.lifecycle = "Create once. saved=true with bindingFinalization.status=ready ends a creation; saved=true with status partial means the form exists: follow bindingFinalization.recovery, never create again. A refused call saves nothing: fix what it names and call again. Fix every design warning with nocode-form-edit before delivery; validation does not run the business flow nor test Baserow permissions.";
    return out;
  }
  function callC8oSequence(project, sequence, variables) {
    var params = new HashMap();
    var projectArray = java.lang.reflect.Array.newInstance(java.lang.String, 1);
    projectArray[0] = project;
    params.put("__project", projectArray);
    params.put("__sequence", sequence);
    params.put("__context", "syncContext_" + java.util.UUID.randomUUID());
    var keys = Object.keys(variables || {});
    for (var i = 0; i < keys.length; i++) {
      if (variables[keys[i]] != null) {
        params.put(keys[i], variables[keys[i]]);
      }
    }
    // read once: the engine removes context from the scope when the sequence of the call ends, which an edit running
    // in a thread of its own (js/nocode_form_edit_job.js) outlives
    var hasContext = typeof context !== "undefined" && context ? context : null;
    var request = callRequest() || new InternalHttpServletRequest();
    var requester = new InternalRequester(params, request);
    var response = requester.processRequest();
    var json = JSON.parse(XMLUtils.XmlToJson(response.getDocumentElement(), true, true, JsonOutput.JsonRoot.docNode).toString());
    try {
      var ctx2 = requester.getContext();
      Engine.theApp.contextManager.remove(ctx2);
    } catch (_ignoreCtx) {}
    if (hasContext && hasContext.logParameters) {
      org.apache.log4j.MDC.put("ContextualParameters", hasContext.logParameters);
    }
    return json;
  }

  function currentMcpProjectName() {
    try {
      if (typeof context !== "undefined" && context && context.project && context.project.getName) {
        return String(context.project.getName());
      }
    } catch (_ignoreProjectName) {}
    return "lib_ConvertigoMCP";
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
    if (response.document && response.document.res && response.document.res.error) {
      return response.document.res;
    }
    if (response.doc && response.doc.document && response.doc.document.res && response.doc.document.res.error) {
      return response.doc.document.res;
    }
    if (response.error) {
      return response.error;
    }
    return null;
  }

  function validateToken(options) {
    var opts = options || {};
    var token = trimmed(opts.token) || requestBearerToken();
    if (!token.length) {
      return {
        status: "invalid",
        authenticated: false,
        error: { code: "missing_token", message: "No Code assistant authentication is required." }
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
    if (response.document && Object.prototype.hasOwnProperty.call(response.document, "res")) {
      return response.document.res;
    }
    if (response.doc && response.doc.document && Object.prototype.hasOwnProperty.call(response.doc.document, "res")) {
      return response.doc.document.res;
    }
    return response;
  }

  function readBaserowTableFields(tableId, authentication, session) {
    // lib_BaseRow serves the fields of a table from a 60-second cache: a column nocode-baserow-schema-apply had just
    // created was refused as unknown. nocode_baserow.js reads them past that cache with the user's Baserow account.
    try {
      if ((typeof C8O.nocodeBaserow === "undefined" || !C8O.nocodeBaserow.tableFields) && typeof include === "function") {
        include("js/nocode_baserow.js");
      }
      if (typeof C8O.nocodeBaserow !== "undefined" && C8O.nocodeBaserow.tableFields) {
        var read = C8O.nocodeBaserow.tableFields(tableId, authentication.user, session && session.bearer);
        if (session) { session.bearer = read.bearer; }
        if (read.fields && read.fields.length) { return ensureArray(read.fields); }
      }
    } catch (_freshFieldsError) {}
    var response = callC8oSequence("lib_BaseRow", "formscommon_FieldsList", { forms_config: JSON.stringify({ table_id: tableId, editor: authentication.user }) });
    var error = apiError(response);
    var envelope = response && (response.document || response.doc && response.doc.document || response);
    return !error && envelope && envelope.array ? ensureArray(envelope.array) : null;
  }

  // The fields of a table read with the authenticated No Code account, once per table and call.
  function tableFieldsReader(authentication) {
    var cache = {};
    var baserowSession = { bearer: "" };
    // formscommon_FieldsList reuses the Baserow token already stored in the HTTP
    // session; with an explicit editor it never resolves the account itself. A
    // fresh MCP session has no token, so the first empty answer primes the
    // session exactly like the catalog tool does, then the read is retried once.
    var sessionPrimed = false;
    function primeBaserowSession() {
      if (sessionPrimed) { return false; }
      sessionPrimed = true;
      try { callC8oSequence("lib_BaseRow", "formscommon_ApplicationsList", {}); } catch (_catalogError) {}
      return true;
    }
    return function (tableId) {
      var table = String(tableId);
      if (!hasOwn(cache, table)) {
        var fetched = null;
        try { fetched = readBaserowTableFields(tableId, authentication, baserowSession); } catch (_fieldsError) { fetched = null; }
        if ((!fetched || !fetched.length) && primeBaserowSession()) {
          try { fetched = readBaserowTableFields(tableId, authentication, baserowSession); } catch (_retryError) { fetched = null; }
        }
        cache[table] = fetched;
      }
      return cache[table];
    };
  }

  // Usage tests (29/10, test-nocode): an edit removed the only input of a table's primary field (a text column the
  // saves filled); the rows saved since have an empty primary value, and every link to them (a select, a grid column
  // of another table) shows « unnamed row N ». Neither the edit answer nor validate said so.
  // A save through C8Oforms APIV2_updateFormulaireDocument: C8Oforms prepares the form (relation refs, rich labels, the
  // columns a select needs) and checks it, then, with the authenticated No Code account, against the columns of its
  // Baserow tables.
  function saveForm(form, options) {
    var opts = options || {};
    var rawThumbnailImage = opts.thumbnailImage || (form && form.thumbnailImage);
    var thumbnailImage = normalizeThumbnailImage(rawThumbnailImage);
    if (thumbnailImage.error) {
      return {
        status: "invalid",
        saved: false,
        validation: {
          valid: false,
          issueCount: 1,
          warningCount: 0,
          issues: [thumbnailImage.error],
          warnings: []
        }
      };
    }
    var prepared = formsRun("prepareSave", {
      form: form,
      thumbnail: thumbnailImage.media ? { enabled: true, index: 0, type: "custom" } : null,
      options: formsOptions(opts)
    }, opts);
    var sanitized = prepared.form;
    var validation = keepEditorFlowElements(prepared.validation, sanitized, opts.currentForm);
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
    var checked = formsRun("checkColumns", { form: sanitized, validation: validation, options: formsOptions(opts, { user: trimmed(authentication.user) }) }, opts,
      { fieldsOf: tableFieldsReader(authentication) });
    sanitized = checked.form;
    validation = checked.validation;
    if (!validation.valid) { return { status: "invalid", saved: false, validation: validation, authentication: authentication }; }
    var tempFile = null;
    var meta = clone(sanitized, {});
    // Existing documents are full read/modify/write snapshots. Never merge them
    // onto a newer revision or accidentally recreate a deleted form.
    delete meta._c8oExpectedRevision;
    if (meta._id) {
      if (!trimmed(meta._rev)) { return { status: "conflict", saved: false, validation: validation, error: { code: "missing_revision", message: "Read the current form before saving" } }; }
      meta._c8oExpectedRevision = String(meta._rev);
    }
    var variables = { meta: JSON.stringify(meta) };
    if (thumbnailImage.media) {
      try {
        tempFile = writeThumbnailImageFile(thumbnailImage.media);
        meta._up_thumbnail = true;
        meta._up_content_type = thumbnailImage.media.contentType;
        variables.meta = JSON.stringify(meta);
        variables.file = String(tempFile.getAbsolutePath());
      } catch (mediaError) {
        return {
          status: "invalid",
          saved: false,
          validation: {
            valid: false,
            issueCount: 1,
            warningCount: validation.warningCount,
            issues: [{
              code: "invalid_thumbnail_image",
              message: String(mediaError && mediaError.message ? mediaError.message : mediaError),
              path: "/thumbnailImage/base64"
            }],
            warnings: validation.warnings || []
          },
          authentication: authentication
        };
      }
    }
    var response;
    try {
      response = callC8oSequence(opts.project || opts.projectName || "C8Oforms", "APIV2_updateFormulaireDocument", variables);
    } finally {
      if (tempFile) {
        try { tempFile["delete"](); } catch (_ignoreTempDelete) {}
      }
    }
    var error = apiError(response);
    if (error) {
      return {
        status: error.error === "conflict" || error.code === "conflict" || error === "conflict" ? "conflict" : "error",
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

  function normalizeThumbnailImage(input) {
    if (input == null || trimmed(input).length === 0) {
      return { media: null };
    }
    var image = input;
    if (typeof input === "string") {
      try {
        image = parseObject(input, "thumbnailImage", null);
      } catch (_thumbnailParseError) {
        return { error: { code: "invalid_thumbnail_image", message: "thumbnailImage must be an object with contentType and base64.", path: "/thumbnailImage" } };
      }
    }
    if (!image || typeof image !== "object" || Array.isArray(image)) {
      return { error: { code: "invalid_thumbnail_image", message: "thumbnailImage must be an object with contentType and base64.", path: "/thumbnailImage" } };
    }
    var contentType = trimmed(image.contentType || image.mimeType || image.type).toLowerCase();
    var base64 = trimmed(image.base64 || image.data);
    if (!contentType.length) {
      return { error: { code: "invalid_thumbnail_image_content_type", message: "thumbnailImage.contentType is required.", path: "/thumbnailImage/contentType" } };
    }
    if (["image/png", "image/jpeg", "image/jpg", "image/webp"].indexOf(contentType) === -1) {
      return { error: { code: "unsupported_thumbnail_image_content_type", message: "thumbnailImage.contentType must be image/png, image/jpeg, or image/webp.", path: "/thumbnailImage/contentType" } };
    }
    if (contentType === "image/jpg") {
      contentType = "image/jpeg";
    }
    if (!base64.length) {
      return { error: { code: "missing_thumbnail_image_base64", message: "thumbnailImage.base64 is required.", path: "/thumbnailImage/base64" } };
    }
    var dataUrlMatch = /^data:([^;,]+);base64,(.*)$/i.exec(base64);
    if (dataUrlMatch) {
      if (!trimmed(image.contentType || image.mimeType || image.type).length) {
        contentType = String(dataUrlMatch[1]).toLowerCase();
      }
      base64 = dataUrlMatch[2];
    }
    base64 = String(base64).replace(/\s+/g, "");
    base64 = normalizeBase64Payload(base64);
    var problem = imageProblem(contentType, base64);
    if (problem) {
      return { error: { code: "invalid_thumbnail_image", message: problem + " Nothing was saved. Send the image again, or name an image the user attached: thumbnailImage: { attachment: \"<file name>\" }.", path: "/thumbnailImage/base64" } };
    }
    return { media: { contentType: contentType, base64: base64 } };
  }

  // ---- the thumbnail image checked before it is saved (usage feedback 25/11) ------------------------------------------
  // A thumbnail is sent as base64 text the model writes: a 6.5 KB PNG copied with slips was saved with its lower third
  // grey, and the tool answered saved. The bytes are read before the save: the signature of the type given, every PNG
  // chunk whole with its CRC up to IEND, a JPEG up to its end marker, a WebP as long as its RIFF header says.
  var BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
  function base64Bytes(text) {
    if (text.length % 4 !== 0 || !/^[A-Za-z0-9+\/]*={0,2}$/.test(text)) { return null; }
    var lookup = {};
    for (var c = 0; c < BASE64_ALPHABET.length; c++) { lookup[BASE64_ALPHABET.charAt(c)] = c; }
    var bytes = [];
    for (var i = 0; i < text.length; i += 4) {
      var a = lookup[text.charAt(i)], b = lookup[text.charAt(i + 1)];
      var third = text.charAt(i + 2), fourth = text.charAt(i + 3);
      var n = (a << 18) | (b << 12) | ((third === "=" ? 0 : lookup[third]) << 6) | (fourth === "=" ? 0 : lookup[fourth]);
      bytes.push((n >> 16) & 255);
      if (third !== "=") { bytes.push((n >> 8) & 255); }
      if (fourth !== "=") { bytes.push(n & 255); }
    }
    return bytes;
  }
  var CRC_TABLE = null;
  function crc32(bytes, from, to) {
    if (!CRC_TABLE) {
      CRC_TABLE = [];
      for (var n = 0; n < 256; n++) {
        var value = n;
        for (var k = 0; k < 8; k++) { value = value & 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1; }
        CRC_TABLE.push(value >>> 0);
      }
    }
    var crc = 0xFFFFFFFF;
    for (var i = from; i < to; i++) { crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8); }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function u32(bytes, at) { return ((bytes[at] << 24) >>> 0) + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3]; }
  function u16(bytes, at) { return (bytes[at] << 8) + bytes[at + 1]; }
  function ascii(bytes, from, to) { var out = ""; for (var i = from; i < to; i++) { out += String.fromCharCode(bytes[i]); } return out; }
  function imageKind(bytes) {
    if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG" && bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A) { return "image/png"; }
    if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) { return "image/jpeg"; }
    if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") { return "image/webp"; }
    return null;
  }
  function pngProblem(bytes) {
    var at = 8;
    var first = true;
    while (true) {
      if (at + 8 > bytes.length) { return "The PNG image is truncated: it ends after " + bytes.length + " bytes, before its IEND chunk."; }
      var length = u32(bytes, at);
      var type = ascii(bytes, at + 4, at + 8);
      if (first && type !== "IHDR") { return "The PNG image does not start with its IHDR chunk."; }
      first = false;
      if (at + 12 + length > bytes.length) { return "The PNG image is truncated: its " + type + " chunk needs " + (at + 12 + length) + " bytes, the image has " + bytes.length + "."; }
      if (crc32(bytes, at + 4, at + 8 + length) !== u32(bytes, at + 8 + length)) { return "The PNG image is damaged: its " + type + " chunk (at byte " + at + ") does not match its checksum, so the base64 text was altered."; }
      if (type === "IEND") { return null; }
      at += 12 + length;
    }
  }
  function jpegProblem(bytes) {
    var end = bytes.length;
    while (end > 2 && bytes[end - 1] === 0) { end--; }
    if (end < 4 || bytes[end - 2] !== 0xFF || bytes[end - 1] !== 0xD9) { return "The JPEG image is truncated: it does not end with its end marker (FF D9)."; }
    return null;
  }
  function webpProblem(bytes) {
    var size = bytes[4] + (bytes[5] << 8) + (bytes[6] << 16) + ((bytes[7] << 24) >>> 0);
    if (bytes.length < size + 8) { return "The WebP image is truncated: its header says " + (size + 8) + " bytes, the image has " + bytes.length + "."; }
    return null;
  }
  function imageProblem(contentType, base64) {
    var bytes = base64Bytes(base64);
    if (!bytes) { return "thumbnailImage.base64 is not base64 text (characters A-Z, a-z, 0-9, + and /, = only at the end)."; }
    if (!bytes.length) { return "thumbnailImage.base64 is empty."; }
    if (bytes.length > THUMBNAIL_MAX_BYTES) { return "The thumbnail is " + Math.round(bytes.length / 1024) + " KB; it is at most " + Math.round(THUMBNAIL_MAX_BYTES / 1024) + " KB."; }
    var kind = imageKind(bytes);
    if (!kind) { return "The bytes are not a PNG, JPEG or WebP image (their signature is not one of these)."; }
    if (kind !== contentType) { return "The bytes are a " + kind + " image, not " + contentType + ": give contentType " + kind + "."; }
    return kind === "image/png" ? pngProblem(bytes) : kind === "image/jpeg" ? jpegProblem(bytes) : webpProblem(bytes);
  }
  C8O.nocodeForms.imageProblem = imageProblem;

  // thumbnailImage { attachment: "<file name>" }: an image the user attached in the Tigo panel, read with the user's key
  // (js/attachment_read.js) in place of base64 text. options.readAttachment(name) is made in the request (the key comes
  // from it) by attachmentReader, before a write that may run in a thread of its own.
  C8O.nocodeForms.attachmentReader = function () {
    try {
      if (typeof include === "function") {
        include("js/reporting.js");
        include("js/attachment_read.js");
      }
      var owner = C8O.reporting.requestFeedbackUserKey();
      var agents = C8O.tigoAgentsDirectory(String(Engine.USER_WORKSPACE_PATH), File);
      var host = C8O.attachmentRead.javaHost({ owner: owner, agentsDirectory: String(agents.getPath()) });
      return function (name) { return C8O.attachmentRead.image(name, host); };
    } catch (_noAttachments) {
      return function () { return { status: "error", error: { code: "unreadable", message: "The attachments of the user cannot be read by this server." } }; };
    }
  };
  // The thumbnailImage values that name an attachment, replaced by its contentType and base64, in place.
  function resolveAttachmentImages(value, options, depth) {
    if (!value || typeof value !== "object" || (depth || 0) > 8) { return; }
    Object.keys(value).forEach(function (key) {
      var item = value[key];
      if (key === "thumbnailImage" && item && typeof item === "object" && !Array.isArray(item) && trimmed(item.attachment).length) {
        var read = options && typeof options.readAttachment === "function" ? options.readAttachment(trimmed(item.attachment)) :
          { status: "error", error: { code: "unreadable", message: "This call cannot read the user's attachments: send contentType and base64." } };
        if (!read || read.status !== "ok") {
          throw formsError("thumbnail_attachment_unreadable", "thumbnailImage.attachment " + JSON.stringify(trimmed(item.attachment)) + ": " +
            String(read && read.error && read.error.message ? read.error.message : "the attachment could not be read") +
            (read && read.error && Array.isArray(read.error.available) && read.error.available.length ? " The user's attachments: " + read.error.available.join(", ") + "." : "") + " Nothing was saved.");
        }
        value[key] = { contentType: read.contentType, base64: read.base64 };
        return;
      }
      resolveAttachmentImages(item, options, (depth || 0) + 1);
    });
  }

  function normalizeBase64Payload(base64) {
    var normalized = String(base64 || "");
    normalized = normalized.replace(/-/g, "+").replace(/_/g, "/");
    var remainder = normalized.length % 4;
    if (remainder === 2) {
      normalized += "==";
    } else if (remainder === 3) {
      normalized += "=";
    }
    return normalized;
  }

  function writeThumbnailImageFile(media) {
    var suffix = media.contentType === "image/jpeg" ? ".jpg" : (media.contentType === "image/webp" ? ".webp" : ".png");
    var file = File.createTempFile("c8o-nocode-thumbnail-", suffix);
    file.deleteOnExit();
    var bytes = Base64.getDecoder().decode(String(media.base64));
    FileUtils.writeByteArrayToFile(file, bytes);
    return file;
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
    var form = unwrapApiResult(response);
    if (form && Object.prototype.hasOwnProperty.call(form, "res")) {
      form = form.res;
    }
    if (!form || typeof form !== "object" || !form._id) {
      return {
        status: "unavailable",
        fetched: false,
        error: {
          code: "form_unavailable",
          message: "The form is missing or not accessible to the authenticated No Code user. The API does not distinguish these cases."
        }
      };
    }
    return form;
  }

  // What each section of the guidance holds, for the index of the core; the C8Oforms of the server describes its own.
  var GUIDANCE_SECTION_PURPOSES = {
    generationQuality: "design rules of an application (headers, action bars, list and detail, empty states, toasts, data views): read it first",
    generationSteps: "building a large application in steps, checks before delivery",
    styles: "native style recipes, role spacing, mobile margins",
    editTool: "an example of each nocode-form-edit operation",
    creationLifecycle: "creation and Baserow binding recovery",
    editingLifecycle: "edited bindings, revision conflicts",
    realWorldPatternsFromGestionDesCreches: "patterns of a real application"
  };
  var CONTRACT_SECTION_PURPOSES = {};
  var CONTRACT_INLINE_PARTS = ["types", "aliases", "format", "intent", "contractVersion", "quickReference"];
  // One answer of the contract stays under CONTRACT_ANSWER_ROOM characters of its JSON indented by 2, as Vibe weighs what
  // a script returns (over 16,000 it saves it to a file a No Code agent cannot read), with room for what mcp_endpoint
  // adds. Over it, the sections asked that do not fit are named in remaining, and asked next.
  var CONTRACT_ANSWER_ROOM = 12500;
  // Sections larger than one answer, in parts asked by name (baserowSources.filters) or with their section: [name, keys];
  // a dotted key takes a key of a key. What no part names goes to the part whose keys are null, else to the last one.
  var GUIDANCE_CONTRACT_PARTS = {
    generationQuality: [
      ["pages", ["labels", "navigation", "designTokens", "pageHeader", "actionBar", "listDetail", "emptyStates", "styles", "steps"]],
      ["data", ["toasts", "dataViews", "data"]]
    ]
  };
  // The parts of every section: the guidance's and those of the C8Oforms of the server (useFormsSections).
  var CONTRACT_PARTS = {};

  function contractSectionList(value) {
    if (value == null || value === "") { return []; }
    var list = Array.isArray(value) ? value : String(value).replace(/^\s*\[|\]\s*$/g, "").split(",");
    return list.map(function (name) { return trimmed(String(name).replace(/^["']|["']$/g, "")); }).filter(function (name) { return name.length > 0; });
  }

  // What a contract answer weighs for the agent: its JSON indented by 2.
  function contractAnswerSize(answer) {
    return JSON.stringify(answer, null, 2).length;
  }

  // Copies the value at a dotted path of from into the same path of to.
  function copyContractPath(from, to, path) {
    var keys = path.split(".");
    var source = from;
    var target = to;
    for (var i = 0; i < keys.length - 1; i++) {
      if (!source || typeof source !== "object" || !hasOwn(source, keys[i])) { return; }
      source = source[keys[i]];
      if (!target[keys[i]] || typeof target[keys[i]] !== "object") { target[keys[i]] = {}; }
      target = target[keys[i]];
    }
    if (source && typeof source === "object" && hasOwn(source, keys[keys.length - 1])) {
      target[keys[keys.length - 1]] = source[keys[keys.length - 1]];
    }
  }

  // The parts of a section, [{name, value}], or null for a section in one piece.
  function contractPartsOf(name, value) {
    var plan = CONTRACT_PARTS[name];
    if (!plan || !value || typeof value !== "object" || Array.isArray(value)) { return null; }
    var named = {};
    var restIndex = plan.length - 1;
    plan.forEach(function (part, index) {
      if (part[1] === null) { restIndex = index; }
      (part[1] || []).forEach(function (path) { named[path] = true; });
    });
    function splitAt(path) {
      return Object.keys(named).some(function (other) { return other.indexOf(path + ".") === 0; });
    }
    // what no part names, at the depth where the parts split it
    function rest(from, prefix, into) {
      Object.keys(from).forEach(function (key) {
        var path = prefix + key;
        if (named[path]) { return; }
        if (splitAt(path) && from[key] && typeof from[key] === "object" && !Array.isArray(from[key])) {
          rest(from[key], path + ".", into);
        } else {
          copyContractPath(value, into, path);
        }
      });
    }
    return plan.map(function (part, index) {
      var piece = {};
      (part[1] || []).forEach(function (path) { copyContractPath(value, piece, path); });
      if (index === restIndex) { rest(value, "", piece); }
      return { name: name + "." + part[0], value: piece };
    });
  }

  function contractPartNames(name) {
    return (CONTRACT_PARTS[name] || []).map(function (part) { return name + "." + part[0]; });
  }

  // includeAllTypes: the component prototypes of AllTypes.json, whole prototypes per page, each page one answer.
  function allTypesPage(catalog, contractVersion, pageValue) {
    var asked = parseInt(String(pageValue == null ? "" : pageValue), 10);
    var number = isNaN(asked) ? 1 : asked;
    function answerOf(items, at, count) {
      var answer = { status: "ok", contractVersion: contractVersion, page: at, pages: count };
      if (at === 1) {
        answer.about = "The component prototypes of C8Oforms AllTypes.json, " + count + " pages of whole prototypes. The authoring contract comes by sections: nocode-form-contract-get without arguments gives its sectionIndex.";
      }
      answer.types = items.map(function (item) { return item.type; });
      answer.allTypes = items;
      if (at < count) {
        answer.next = "Ask nocode-form-contract-get with includeAllTypes:true, page:" + (at + 1) + " for the next prototypes.";
      }
      return answer;
    }
    var pages = [[]];
    catalog.forEach(function (item) {
      var current = pages[pages.length - 1];
      if (current.length && contractAnswerSize(answerOf(current.concat([item]), 1, 999)) > CONTRACT_ANSWER_ROOM) {
        pages.push([item]);
      } else {
        current.push(item);
      }
    });
    if (number < 1 || number > pages.length) {
      return { status: "invalid", contractVersion: contractVersion, page: number, pages: pages.length, message: "page must be 1 to " + pages.length + " with includeAllTypes:true." };
    }
    return answerOf(pages[number - 1], number, pages.length);
  }

  // The order of the sections of the whole contract: the agent guidance of this file and the sections of the C8Oforms of
  // the server where they always were; a section a newer C8Oforms adds comes after them.
  var CONTRACT_SECTION_ORDER = ["format", "intent", "contractVersion", "contextualDefaults", "creationLifecycle", "editingLifecycle", "bindingValidation",
    "forbiddenFields", "rootFields", "mediaSupport", "generationQuality", "pageFields", "commonFieldFields", "styleObjectFields", "styleRendering",
    "conditionFields", "dynamicReferences", "componentAuthoring", "baserowShorthand", "baserowSources", "backendActions", "flowAuthoring", "editTool",
    "realWorldPatternsFromGestionDesCreches"];
  // The version of the guidance of this file, joined to the version of the contract of the C8Oforms of the server.
  var GUIDANCE_VERSION = "mcp-2026-11-19";

  // The contract of the C8Oforms of the server with the guidance of this file, as one object in the order above.
  function authoringContract(forms) {
    var guidance = guidanceSections(forms);
    var sections = forms.sections || {};
    var out = {};
    CONTRACT_SECTION_ORDER.forEach(function (key) {
      if (key === "contractVersion") { out.contractVersion = forms.version + "+" + GUIDANCE_VERSION; }
      else if (hasOwn(guidance, key)) { out[key] = guidance[key]; }
      else if (hasOwn(sections, key)) { out[key] = sections[key]; }
    });
    Object.keys(sections).forEach(function (key) {
      if (!hasOwn(out, key) && key !== "reducedSample" && key !== "example") { out[key] = sections[key]; }
    });
    return out;
  }

  // The purposes and parts of the sections: this file's, then those of the C8Oforms of the server.
  function useFormsSections(forms) {
    CONTRACT_SECTION_PURPOSES = clone(GUIDANCE_SECTION_PURPOSES, {});
    Object.keys(forms.sectionPurposes || {}).forEach(function (key) { CONTRACT_SECTION_PURPOSES[key] = forms.sectionPurposes[key]; });
    CONTRACT_PARTS = clone(GUIDANCE_CONTRACT_PARTS, {});
    Object.keys(forms.sectionParts || {}).forEach(function (key) { CONTRACT_PARTS[key] = forms.sectionParts[key]; });
  }

  C8O.nocodeForms.contract = function (options) {
    var opts = options || {};
    var forms = formsRun("contract", {}, opts);
    useFormsSections(forms);
    var types = forms.types;
    var authoring = authoringContract(forms);
    var quickReference = quickReferenceContract(forms);
    var parts = { types: types, aliases: clone(forms.aliases, {}), reducedSample: forms.sections.reducedSample, quickReference: quickReference };
    Object.keys(authoring).forEach(function (key) { parts[key] = authoring[key]; });
    // The example application is a section: its nesting weighed 2 KB of the indented core.
    parts.example = forms.sections.example;
    // Asked alone, generationQuality (26 KB indented) would be spilled too: its style recipes are their own section.
    parts.generationQuality = {};
    Object.keys(authoring.generationQuality).forEach(function (key) { if (key !== "styles") { parts.generationQuality[key] = authoring.generationQuality[key]; } });
    parts.generationQuality.styles = "Ask sections:[\"styles\"] for the native style recipes.";
    parts.styles = authoring.generationQuality.styles;
    parts.generationSteps = { incrementalCreation: authoring.generationQuality.incrementalCreation, completion: authoring.generationQuality.completion };
    delete parts.generationQuality.incrementalCreation;
    delete parts.generationQuality.completion;
    parts.generationQuality.steps = "Ask sections:[\"generationSteps\"] for building in steps and the checks before delivery.";
    if (opts.includeAllTypes === true) {
      var catalog = formsRun("catalog", {}, opts);
      return allTypesPage(catalog.catalog, authoring.contractVersion, opts.page);
    }
    var asked = contractSectionList(opts.sections);
    var whole = asked.indexOf("all") >= 0;
    // what the C8Oforms of the server renders: styleModel, the keys and objects marked styleModel in the contract
    var capabilities = clone(forms.capabilities || {}, {});
    var sectionIndex = {};
    Object.keys(parts).forEach(function (key) {
      if (CONTRACT_INLINE_PARTS.indexOf(key) < 0) {
        var partNames = contractPartNames(key);
        sectionIndex[key] = (CONTRACT_SECTION_PURPOSES[key] || key) + " (" + Math.max(1, Math.round(JSON.stringify(parts[key]).length / 1000)) + " KB" +
          (partNames.length ? ", parts " + partNames.map(function (partName) { return partName.substring(key.length); }).join(" ") : "") + ")";
      }
    });
    if (asked.length && !whole) {
      var units = [];
      var unknown = [];
      var seen = {};
      var addUnit = function (unit) {
        if (!seen[unit.name]) { seen[unit.name] = true; units.push(unit); }
      };
      asked.forEach(function (name) {
        if (hasOwn(parts, name)) {
          var split = contractPartsOf(name, parts[name]);
          if (split) { split.forEach(addUnit); } else { addUnit({ name: name, value: parts[name] }); }
          return;
        }
        var parent = name.indexOf(".") > 0 ? name.substring(0, name.indexOf(".")) : "";
        var found = parent.length && hasOwn(parts, parent) ? (contractPartsOf(parent, parts[parent]) || []).filter(function (part) { return part.name === name; })[0] : null;
        if (found) { addUnit(found); } else { unknown.push(name); }
      });
      var answer = { status: unknown.length && !units.length ? "invalid" : "ok", contractVersion: authoring.contractVersion, sections: {} };
      var remaining = [];
      units.forEach(function (unit) {
        if (remaining.length) { remaining.push(unit.name); return; }
        answer.sections[unit.name] = unit.value;
        if (Object.keys(answer.sections).length > 1 && contractAnswerSize(answer) > CONTRACT_ANSWER_ROOM) {
          delete answer.sections[unit.name];
          remaining.push(unit.name);
        }
      });
      if (remaining.length) {
        answer.remaining = remaining;
        answer.next = "Ask nocode-form-contract-get with sections:" + JSON.stringify(remaining) + " for the rest, in its own call: one answer stays under " +
          CONTRACT_ANSWER_ROOM + " characters.";
      }
      if (unknown.length) {
        answer.unknownSections = unknown;
        answer.availableSections = [];
        Object.keys(parts).forEach(function (key) {
          answer.availableSections.push(key);
          contractPartNames(key).forEach(function (partName) { answer.availableSections.push(partName); });
        });
      }
      return answer;
    }
    if (!whole) {
      return {
        status: "ok",
        contractVersion: authoring.contractVersion,
        capabilities: capabilities,
        quickReference: parts.quickReference,
        types: types,
        aliases: parts.aliases,
        sectionIndex: sectionIndex,
        moreSections: "Ask nocode-form-contract-get with sections:[...] for what the task needs: generationQuality before generating an application, example for a small complete one, styles for style recipes, componentAuthoring or editTool for what this core omits. A section in parts comes whole when asked by its name, in as many answers as it needs: what does not fit comes back in remaining, ask it next."
      };
    }
    var all = clone(authoring, {});
    all.quickReference = quickReferenceContract(forms);
    all.quickReference.example = forms.sections.example;
    return {
      status: "ok",
      project: opts.project || opts.projectName || "C8Oforms",
      allTypesPath: forms.allTypesPath,
      capabilities: capabilities,
      sectionIndex: sectionIndex,
      types: types,
      aliases: parts.aliases,
      authoringContract: all,
      reducedSample: parts.reducedSample,
      allTypes: null
    };
  };

  // nocode-form-compile: the reduced JSON compiled by the C8Oforms of the server, the tables named by path or id found in
  // the catalog of the user's no-code database.
  function compileReduced(reduced, options) {
    var opts = options || {};
    return withRepairs(formsRun("compile", { reduced: reduced, options: formsOptions(opts) }, opts), reduced);
  }
  C8O.nocodeForms.compile = compileReduced;
  // nocode-form-validate (baserowLinks): the static checks, then, with the authenticated No Code account, the selects
  // written into a link_row column (read only: the fields of the written tables). A select the respondents of the
  // published form cannot read is an issue there, whoever wrote it; a save only reports one it leaves alone.
  C8O.nocodeForms.validate = function (form, options) {
    var answer = withRepairs(validateWithLinks(form, options), form);
    if (answer && answer.validation) { groupWarnings(answer.validation, form); }
    return answer;
  };
  function validateWithLinks(form, options) {
    var opts = options || {};
    if (opts.baserowLinks !== true || !form || typeof form !== "object") { return validateForm(form, opts); }
    var authentication = null;
    try { authentication = validateToken(opts); } catch (_authenticationError) { authentication = null; }
    var user = authentication && authentication.authenticated === true ? trimmed(authentication.user) : "";
    return formsRun("validate", { form: form, options: formsOptions(opts, { baserowLinks: true, user: user }) }, opts,
      user ? { fieldsOf: tableFieldsReader(authentication) } : null);
  }
  C8O.nocodeForms.save = saveForm;
  C8O.nocodeForms.get = getForm;
  // the No Code user of the call: {authenticated, user} (nocode-form-preview-capture names the user of its request)
  C8O.nocodeForms.authentication = validateToken;
  // An object without one key, for the options cloned as JSON (the form read before an edit is not cloned with them).
  function withoutKey(value, key) {
    if (!value || typeof value !== "object" || !hasOwn(value, key)) { return value || {}; }
    var out = {};
    Object.keys(value).forEach(function (name) { if (name !== key) { out[name] = value[name]; } });
    return out;
  }

  // ---- flow steps written in No Code Studio (usage feedback 18/11 and 24/11) -----------------------------------------
  // C8Oforms answers unsupported_flow_element for the steps its reduced contract does not write (a modal or a side panel
  // opened or closed, properties set at run time), wherever they come from: one such step, added in No Code Studio,
  // made every later edit by the tools invalid, and the user had to take the steps out, edit, and put them back by hand.
  // A step the saved form already had, with the same type, is kept as the editor wrote it: its issue becomes a warning.
  // A new step of such a type, or a step whose type changed, is still refused.
  var EDITOR_ONLY_ISSUE_CODES = ["unsupported_flow_element"];
  function flowElementsById(form) {
    var byId = {};
    ensureArray(form && form.flows).forEach(function (flow) {
      ensureArray(flow && flow.elements).forEach(function (element) { if (element && element.id != null) { byId[String(element.id)] = element; } });
    });
    return byId;
  }
  function keepEditorFlowElements(validation, form, current) {
    if (!validation || !current || !Array.isArray(validation.issues) || !validation.issues.length) { return validation; }
    var before = flowElementsById(current);
    var kept = [];
    validation.issues = validation.issues.filter(function (issue) {
      if (!issue || EDITOR_ONLY_ISSUE_CODES.indexOf(issue.code) < 0) { return true; }
      var at = /^\/flows\/(\d+)\/elements\/(\d+)(\/|$)/.exec(String(issue.path || ""));
      var flow = at ? ensureArray(form && form.flows)[Number(at[1])] : null;
      var element = flow ? ensureArray(flow.elements)[Number(at[2])] : null;
      var saved = element && element.id != null ? before[String(element.id)] : null;
      if (!saved || saved.type !== element.type) { return true; }
      kept.push({
        code: "editor_flow_element_kept",
        message: "Flow " + (flow.name || flow.id) + ": the step " + (element.name || element.id) + " (" + element.type + ") was written in No Code Studio and the tools do not write this type: kept as it is, not checked. Change it in No Code Studio.",
        path: String(issue.path).replace(/\/type$/, "")
      });
      return false;
    });
    if (kept.length) {
      validation.warnings = ensureArray(validation.warnings).concat(kept);
      validation.issueCount = validation.issues.length;
      validation.warningCount = validation.warnings.length;
      validation.valid = validation.issueCount === 0;
    }
    return validation;
  }
  C8O.nocodeForms.keepEditorFlowElements = keepEditorFlowElements;

  // ---- the warnings of an edit (usage feedback 18/11 and 24/11) -------------------------------------------------------
  // Each edit of a large application answered its 69 to 95 warnings, nearly all the same (a runtime check of each computed
  // field, a submit without a required check on each button): the one the edit had just brought was lost among them. An
  // edit answers the warnings it brought and those of what it changed, with the count of the others by code.
  var WARNINGS_ANSWERED_WHOLE = 10;
  var WARNING_GROUP_FROM = 6;
  // A warning's place by the id of its component, flow or page, the same in the form before and after the edit (an
  // index moves when a component is added before it).
  function warningAnchor(form, path) {
    var p = String(path || "");
    var m = /^\/formulaire\/(\d+)(.*)$/.exec(p);
    if (m) { var item = ensureArray(form && form.formulaire)[Number(m[1])]; return item && item.id != null ? { owner: "c:" + item.id, at: "c:" + item.id + m[2] } : { owner: p, at: p }; }
    m = /^\/flows\/(\d+)(.*)$/.exec(p);
    if (m) { var flow = ensureArray(form && form.flows)[Number(m[1])]; return flow && flow.id != null ? { owner: "f:" + flow.id, at: "f:" + flow.id + m[2] } : { owner: p, at: p }; }
    m = /^\/pages\/(\d+)(.*)$/.exec(p);
    if (m) { var page = ensureArray(form && form.pages)[Number(m[1])]; return page && page.pageTechName != null ? { owner: "p:" + page.pageTechName, at: "p:" + page.pageTechName + m[2] } : { owner: p, at: p }; }
    return { owner: p, at: p };
  }
  function warningKey(form, warning) {
    return String(warning.code) + "|" + warningAnchor(form, warning.path).at + "|" + String(warning.message);
  }
  // The components, flows and pages the edit added or changed, by anchor owner.
  function changedOwners(before, after) {
    var changed = {};
    function compare(list, oldList, prefix, idKey) {
      var old = {};
      ensureArray(oldList).forEach(function (item) { if (item && item[idKey] != null) { old[String(item[idKey])] = JSON.stringify(item); } });
      ensureArray(list).forEach(function (item) {
        if (item && item[idKey] != null && old[String(item[idKey])] !== JSON.stringify(item)) { changed[prefix + item[idKey]] = true; }
      });
    }
    compare(after && after.formulaire, before && before.formulaire, "c:", "id");
    compare(after && after.flows, before && before.flows, "f:", "id");
    compare(after && after.pages, before && before.pages, "p:", "pageTechName");
    return changed;
  }
  function focusWarnings(saved, before, options) {
    var validation = saved && saved.validation;
    var after = saved && saved.form;
    if (!validation || !Array.isArray(validation.warnings) || validation.warnings.length <= WARNINGS_ANSWERED_WHOLE || !before || !after) { return saved; }
    var previous = {};
    try {
      ensureArray(validateForm(before, withoutKey(options, "currentForm")).validation.warnings).forEach(function (item) { if (item) { previous[warningKey(before, item)] = true; } });
    } catch (_noPreviousWarnings) {
      return saved;
    }
    var changed = changedOwners(before, after);
    var shown = [];
    var others = {};
    var otherCount = 0;
    validation.warnings.forEach(function (item) {
      if (!item) { return; }
      if (!previous[warningKey(after, item)] || changed[warningAnchor(after, item.path).owner] || SAVE_TIME_WARNING_CODES.indexOf(item.code) >= 0) {
        shown.push(item);
        return;
      }
      otherCount++;
      others[item.code] = (others[item.code] || 0) + 1;
    });
    if (!otherCount) { return saved; }
    validation.warnings = shown;
    validation.warningCount = shown.length;
    validation.otherWarnings = {
      count: otherCount,
      byCode: others,
      note: "Warnings the form already had, on components, flows and pages this write did not change: not listed. nocode-form-get warnings:true lists them all (with component, page or flow: those of these parts)."
    };
    return saved;
  }

  // The same warning on many components (a runtime check of each computed field): its first occurrences, then one entry
  // with the count and the components, flows or pages of the others.
  function groupWarnings(validation, form) {
    if (!validation || !Array.isArray(validation.warnings) || validation.warnings.length < WARNING_GROUP_FROM) { return validation; }
    var byCode = {};
    validation.warnings.forEach(function (item) { if (item && item.code) { byCode[item.code] = (byCode[item.code] || 0) + 1; } });
    var seen = {};
    var groups = {};
    var out = [];
    var byId = componentsById(form);
    var flows = {};
    ensureArray(form && form.flows).forEach(function (flow) { if (flow && flow.id != null) { flows[String(flow.id)] = flow; } });
    validation.warnings.forEach(function (item) {
      if (!item || !item.code || byCode[item.code] < WARNING_GROUP_FROM) { out.push(item); return; }
      seen[item.code] = (seen[item.code] || 0) + 1;
      if (seen[item.code] <= 2) { out.push(item); return; }
      if (!groups[item.code]) {
        groups[item.code] = { code: item.code, count: 0, message: "The same warning on " + (byCode[item.code] - 2) + " more: the first ones above say what it is.", on: [] };
        out.push(groups[item.code]);
      }
      var group = groups[item.code];
      group.count++;
      var owner = warningAnchor(form, item.path).owner;
      var name = /^c:/.test(owner) && byId[owner.substring(2)] ? byId[owner.substring(2)].name : /^f:/.test(owner) && flows[owner.substring(2)] ? flows[owner.substring(2)].name || owner.substring(2) : owner.replace(/^[cfp]:/, "");
      if (group.on.length < 40 && group.on.indexOf(name) < 0) { group.on.push(name); }
    });
    validation.warnings = out;
    return validation;
  }
  C8O.nocodeForms.groupWarnings = groupWarnings;

  function attachSavedForm(saved, candidate, options) {
    if (saved.saved !== true) { saved.form = candidate; return saved; }
    var result = saved.response || {};
    var id = result.id || candidate._id;
    // The persisted API document can differ from the compiled one (ids, media,
    // page flags). Never report an unsaved snapshot as a verified saved form.
    var currentForm = options && options.currentForm;
    var readOptions = clone(withoutKey(options, "currentForm"), {});
    delete readOptions.rev;
    try {
      var actual = id ? getForm(String(id), readOptions) : null;
      if (actual && String(actual._id) === String(id)) {
        saved.form = actual;
        saved.readbackVerified = true;
        var savedWarnings = saveTimeWarnings(saved.validation);
        saved.validation = keepEditorFlowElements(validateForm(actual, readOptions).validation, actual, currentForm);
        keepSaveTimeWarnings(saved.validation, savedWarnings);
        return saved;
      }
    } catch (_readbackError) {}
    saved.form = clone(candidate, {});
    if (id) { saved.form._id = id; }
    if (result.rev) { saved.form._rev = result.rev; }
    saved.readbackVerified = false;
    saved.validation.warnings.push({ code: "saved_form_readback_unavailable", message: "Save succeeded but readback could not be verified. Re-read this id; do not retry create.", path: "" });
    saved.validation.warningCount = saved.validation.warnings.length;
    return saved;
  }

  // The warnings of a save about what it changed or read from Baserow (the link_row selects it rewrote or reports, the
  // columns it added to a select): the static validation of the read-back form cannot find them again.
  var SAVE_TIME_WARNING_CODES = ["link_row_select_value_rewritten", "link_row_select_value", "link_row_select_table", "select_columns_completed", "plain_labels_converted", "primary_field_not_filled", "inputs_not_saved", "map_marker_column_type"];
  function saveTimeWarnings(validation) {
    return (validation && Array.isArray(validation.warnings) ? validation.warnings : []).filter(function (item) { return item && SAVE_TIME_WARNING_CODES.indexOf(item.code) >= 0; });
  }
  function keepSaveTimeWarnings(validation, warnings) {
    if (!validation || !warnings.length) { return; }
    var seen = {};
    validation.warnings = Array.isArray(validation.warnings) ? validation.warnings : [];
    validation.warnings.forEach(function (item) { if (item) { seen[item.code + "|" + item.path] = true; } });
    warnings.forEach(function (item) { if (!seen[item.code + "|" + item.path]) { validation.warnings.push(item); } });
    validation.warningCount = validation.warnings.length;
  }


  function finalizeBaserowBindings(saved, options, expectedCount, newForm) {
    var id = saved.form && saved.form._id || saved.response && saved.response.id;
    function pending(code) {
      saved.status = "partial";
      saved.bindingFinalization = {
        status: "pending", code: code, bindingCount: expectedCount,
        message: "The form is already saved but Baserow identity finalization is not verified. Do not call create again. Resume finalization on this same id.",
        recovery: id ? { tool: "nocode-form-edit", id: String(id), operations: [{ action: "finalize_baserow_bindings" }] } : null
      };
      return saved;
    }
    if (!expectedCount) {
      saved.bindingFinalization = { status: "not_required", bindingCount: 0 };
      return saved;
    }
    if (!id || saved.readbackVerified !== true) { return pending("saved_form_readback_unavailable"); }
    var authentication = saved.authentication || {};
    var user = authentication.authenticated === true ? trimmed(authentication.user) : "";
    // This recovery operation is limited to the creator: never reassign a
    // collaborator's Baserow account to the current caller.
    if (!user || trimmed(saved.form.creator) !== user) { return pending("binding_owner_not_verified"); }
    var rewritten = formsRun("finalizeBindings", { form: saved.form, id: String(id), user: user, newForm: newForm === true, expectedCount: expectedCount }, options);
    if (rewritten.code) { return pending(rewritten.code); }
    var candidate = rewritten.form;
    var changed = rewritten.changed === true;
    if (changed) {
      var finalOptions = clone(options || {}, {});
      delete finalOptions.thumbnailImage;
      delete finalOptions.rev;
      finalOptions.keptReferenceTokens = rewritten.keptReferenceTokens;
      try {
        // A fresh revision check prevents knowingly overwriting an intervening
        // editor save. The existing Forms API remains the only write path.
        var latest = getForm(String(id), finalOptions);
        if (!latest || String(latest._id) !== String(id) || latest._rev !== candidate._rev) { return pending("form_changed_before_finalization"); }
        var finalized = saveForm(candidate, finalOptions);
        if (!finalized || finalized.saved !== true) { return pending(finalized && finalized.status === "conflict" ? "form_changed_before_finalization" : "binding_save_failed"); }
        // Keep the successful second revision even if its readback fails.
        saved.response = finalized.response;
        // What the first save rewrote is no longer there to see in the second one.
        var firstSaveWarnings = saveTimeWarnings(saved.validation);
        saved.validation = finalized.validation;
        keepSaveTimeWarnings(saved.validation, firstSaveWarnings);
        attachSavedForm(saved, candidate, finalOptions);
      } catch (_finalizationError) {
        return pending("binding_finalization_failed");
      }
    }
    if (saved.readbackVerified !== true || String(saved.form._id) !== String(id)) { return pending("binding_readback_unavailable"); }
    if (formsRun("verifyBindings", { form: saved.form, id: String(id), user: user, expectedCount: expectedCount }, options).verified !== true) { return pending("binding_verification_failed"); }
    saved.status = "ok";
    saved.bindingFinalization = { status: "ready", bindingCount: expectedCount };
    return saved;
  }

  function resumeBaserowFinalization(id, options) {
    var opts = clone(options || {}, {});
    delete opts.rev;
    var authentication = validateToken(opts);
    if (!authentication || authentication.authenticated !== true) { return { status: "auth_required", saved: false, authentication: authentication }; }
    var form = getForm(id, opts);
    if (!form || !form._id) { return form; }
    var bindingCount = formBindingCount(form, opts);
    if (!bindingCount) { return { status: "invalid", saved: false, error: { code: "no_baserow_bindings", message: "No Baserow bindings remain on this form. Inspect the saved form; finalization cannot reconstruct missing business connections." } }; }
    var saved = { status: "ok", saved: true, form: form, response: { id: form._id, rev: form._rev }, authentication: authentication, readbackVerified: true, validation: validateForm(form, opts).validation };
    return finalizeBaserowBindings(saved, opts, bindingCount, false);
  }

  function saveEditedForm(current, edited, options) {
    var opts = clone(options || {}, {});
    var authentication = validateToken(opts);
    if (!authentication || authentication.authenticated !== true) { return { status: "auth_required", saved: false, authentication: authentication }; }
    // C8Oforms gives the new or changed Baserow connections their identities and says what the checks need.
    var prepared = formsRun("prepareEdit", { current: current, edited: edited, user: trimmed(authentication.user) }, opts);
    edited = prepared.form;
    opts.keptReferenceTokens = prepared.keptReferenceTokens;
    opts.strictBindingPaths = prepared.strictBindingPaths;
    opts.removedInputNames = prepared.removedInputNames;
    var expected = prepared.expected;
    // the steps No Code Studio wrote that the saved form already had do not block the save (keepEditorFlowElements)
    opts.currentForm = current;
    var saved = saveForm(edited, opts);
    attachSavedForm(saved, prepared.candidate, opts);
    if (saved.saved === true && opts.strictBindingPaths.length) {
      var verified = saved.readbackVerified === true &&
        formsRun("verifyEditedBindings", { form: saved.form, expected: expected, formId: String(current._id) }, opts).verified === true;
      saved.bindingFinalization = { status: verified ? "ready" : "pending", bindingCount: expected.length };
      if (!verified) {
        saved.status = "partial";
        saved.bindingFinalization.code = "edited_binding_readback_unverified";
        saved.bindingFinalization.recovery = { tool: "nocode-form-get", id: String(current._id) };
      }
    }
    return saved;
  }

  function attachmentFailure(error) {
    return { status: "invalid", saved: false, error: { code: error && error.code ? error.code : "thumbnail_attachment_unreadable", message: String(error && error.message ? error.message : error) } };
  }
  C8O.nocodeForms.create = function (reduced, options) {
    try { resolveAttachmentImages(reduced, options); } catch (attachmentError) { return attachmentFailure(attachmentError); }
    var compiled = compileReduced(reduced, options);
    if (!compiled || compiled.status !== "ok") {
      if (compiled) {
        compiled.saved = false;
      }
      return compiled;
    }
    var createOptions = clone(options || {}, {});
    if (reduced && reduced.thumbnailImage) {
      createOptions.thumbnailImage = reduced.thumbnailImage;
    }
    var saved = saveForm(compiled.form, createOptions);
    if (compiled.referencesResolved) { saved.referencesResolved = compiled.referencesResolved; }
    withRepairs(saved, null, compiled);
    attachSavedForm(saved, compiled.form, createOptions);
    // The columns the compilation added to a native select source.
    if (saved.validation) { keepSaveTimeWarnings(saved.validation, saveTimeWarnings(compiled.validation)); }
    saved.allTypesPath = compiled.allTypesPath;
    if (saved.saved === true) { finalizeBaserowBindings(saved, createOptions, compiled.bindingFinalization.bindingCount, true); }
    return saved;
  };
  // Usage tests (29/10, test-nocode): an edit sent with operations [] by mistake went through the save and advanced the
  // revision; the agent then read a revision it had not written and wondered who had saved. Nothing to change: no save.
  function nothingToSave(code, message) {
    return { status: "error", saved: false, error: { code: code, message: message + ": nothing was saved. Read a form with nocode-form-get" } };
  }
  C8O.nocodeForms.update = function (id, patch, options) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch) || !Object.keys(patch).length) { return nothingToSave("empty_patch", "The patch changes nothing"); }
    try { resolveAttachmentImages(patch, options); } catch (attachmentError) { return attachmentFailure(attachmentError); }
    var current = getForm(id, options);
    if (current && current.fetched === false) {
      current.saved = false;
      return current;
    }
    var currentForm = current && current.res ? current.res : current;
    var merged = formsRun("update", { form: currentForm, patch: patch }, options);
    var patched = merged.form;
    var referencesResolved = merged.referencesResolved;
    var saved = saveEditedForm(currentForm, patched, options);
    if (referencesResolved.length) { saved.referencesResolved = referencesResolved; }
    withRepairs(saved, patch, merged);
    focusWarnings(saved, currentForm, options);
    return saved;
  };
  // ---- what an edit operation reads (usage feedback 18/11 and 24/11) ------------------------------------------------
  // update_field read only its patch: a defaultFrom given beside it was dropped and the edit answered saved. The keys the
  // C8Oforms edit operations read at the level of an operation, when the operation also carries the object they apply
  // (a patch, a fieldObject, an element, a pageObject): any other key there is refused before anything is saved, with
  // the place it belongs. An operation without that object is itself the object (add_field, add_flow_element): not
  // checked here.
  var EDIT_ACTION_ALIASES = {
    add_component: "add_field", update_component: "update_field", remove_component: "remove_field", delete_component: "delete_field",
    move_component: "move_field", add_element: "add_field", update_element: "update_field", remove_element: "remove_field",
    delete_element: "delete_field", move_element: "move_field"
  };
  var EDIT_SELECTOR_KEYS = ["action", "op", "type"];
  var EDIT_OPERATION_KEYS = {
    update_field: { carrier: ["patch", "fieldObject", "field"], keys: ["fieldId", "id", "field", "fieldName", "name", "patch", "fieldObject"] },
    update_page: { carrier: ["patch", "pageObject", "pageData"], keys: ["pageTechName", "pageId", "page", "pageName", "name", "patch", "pageObject", "pageData", "description"] },
    update_flow: { carrier: ["patch", "flowData"], keys: ["flowId", "id", "flow", "flowName", "name", "patch", "flowData"] },
    update_flow_element: { carrier: ["patch", "element"], keys: ["flowId", "id", "flow", "flowName", "name", "elementId", "elementName", "element", "patch"] },
    add_field: { carrier: ["fieldObject", "field"], keys: ["fieldObject", "field", "pageName", "pageTechName", "pageId", "page", "parentFieldId", "parentId", "parent",
      "index", "before", "beforeFieldName", "beforeFieldId", "after", "afterFieldName", "afterFieldId", "styleDefaults"] },
    add_flow_element: { carrier: ["element"], keys: ["flowId", "id", "flow", "flowName", "name", "element", "index", "parentId", "parent", "parentElementId", "refKey", "targetCardChild"] }
  };
  // add_page with a pageObject builds the page from it alone: name, iconName, header or description beside it were dropped
  // (a page named "Page 4" instead of the name given, then "page not found" for the rest of the edit).
  var ADD_PAGE_OPERATION_KEYS = ["action", "op", "type", "index", "navigationMode", "pageObject", "pageData", "page"];

  function isPlainObjectValue(value) { return !!value && typeof value === "object" && !Array.isArray(value); }

  function operationActionOf(op) {
    var action = trimmed(op.action || op.op || op.type).toLowerCase();
    return EDIT_ACTION_ALIASES[action] || action;
  }

  // The operations as C8Oforms will read them (add_page keys moved into its pageObject), or an error naming each key an
  // operation would drop and where it goes. repairs: the moves made, answered to the agent.
  function checkEditOperations(operations, repairs) {
    var problems = [];
    function visit(op, at) {
      if (!isPlainObjectValue(op)) { return op; }
      if (!op.action && !op.op && !op.type) {
        if (isPlainObjectValue(op.operation)) { var inner = clone(op, {}); inner.operation = visit(op.operation, at); return inner; }
        if (Array.isArray(op.operations)) { var outer = clone(op, {}); outer.operations = op.operations.map(function (item, i) { return visit(item, at + ".operations[" + i + "]"); }); return outer; }
        return op;
      }
      var action = operationActionOf(op);
      if (action === "add_page") {
        var pageKey = ["pageObject", "pageData"].filter(function (key) { return isPlainObjectValue(op[key]); })[0] || (isPlainObjectValue(op.page) ? "page" : null);
        if (!pageKey) { return op; }
        var moved = clone(op, {});
        Object.keys(op).forEach(function (key) {
          if (ADD_PAGE_OPERATION_KEYS.indexOf(key) >= 0 || key === pageKey) { return; }
          var into = moved[pageKey];
          if (hasOwn(into, key) && JSON.stringify(into[key]) !== JSON.stringify(op[key])) {
            problems.push(at + " (add_page): " + key + " is given twice, " + JSON.stringify(op[key]) + " beside " + pageKey + " and " + JSON.stringify(into[key]) + " in it: keep one");
            return;
          }
          into[key] = op[key];
          delete moved[key];
          repairs.push({ code: "operation_key_moved", at: at, message: "add_page: " + key + " given beside " + pageKey + " was moved into it (the page is built from " + pageKey + " alone)" });
        });
        return moved;
      }
      var spec = EDIT_OPERATION_KEYS[action];
      if (!spec || !spec.carrier.some(function (key) { return isPlainObjectValue(op[key]); })) { return op; }
      var carrier = spec.carrier.filter(function (key) { return isPlainObjectValue(op[key]); })[0];
      var dropped = Object.keys(op).filter(function (key) { return EDIT_SELECTOR_KEYS.indexOf(key) < 0 && spec.keys.indexOf(key) < 0; });
      if (dropped.length) {
        problems.push(at + " (" + action + "): " + dropped.join(", ") + (dropped.length > 1 ? " are" : " is") + " not read at the level of the operation, beside " + carrier +
          ": put " + (dropped.length > 1 ? "them" : "it") + " in " + carrier + " (" + dropped.map(function (key) { return carrier + "." + key; }).join(", ") + "). " +
          "This operation reads " + spec.keys.join(", "));
      }
      return op;
    }
    var checked = ensureArray(operations).map(function (op, index) { return visit(op, "operations[" + index + "]"); });
    if (problems.length) {
      var error = formsError("unread_operation_key", "Nothing was saved: " + problems.join("; ") + ".");
      error.keys = problems;
      throw error;
    }
    return checked;
  }
  C8O.nocodeForms.checkEditOperations = checkEditOperations;

  // ---- a part of an expression changed (usage feedback 24/11) ---------------------------------------------------------
  // A change of one line of a 6,000-character reactive expression sent the whole expression again, with the risk of a
  // slip each time. update_field patch.defaultFromEdit: [{ find, replace }] changes the declared expression
  // (config.contextDefault, what defaultFrom compiled) where find is, once each, and sends it as defaultFrom: C8Oforms
  // compiles it as any defaultFrom. Refused, nothing saved, when find is not in it or more than once, or when the
  // expression that runs is no longer the one declared (No Code Studio changed it): defaultFrom is then sent whole.
  function expandExpressionEdits(operations, current) {
    var byId = componentsById(current);
    return ensureArray(operations).map(function (op, index) {
      if (!isPlainObjectValue(op) || operationActionOf(op) !== "update_field" || !isPlainObjectValue(op.patch) || !hasOwn(op.patch, "defaultFromEdit")) { return op; }
      var at = "operations[" + index + "] (update_field)";
      var ref = trimmed(op.fieldId || op.id || (typeof op.field === "string" ? op.field : ""));
      var named = trimmed(op.fieldName || op.name);
      var item = (ref.length && byId[ref]) || ensureArray(current.formulaire).filter(function (candidate) { return candidate && named.length && candidate.name === named; })[0];
      if (!item) { throw formsError("unknown_field", "Nothing was saved: " + at + " names no component (" + (named || ref) + ")."); }
      if (hasOwn(op.patch, "defaultFrom")) { throw formsError("unread_operation_key", "Nothing was saved: " + at + ": give defaultFrom (the whole value) or defaultFromEdit (parts of its expression), not both."); }
      var declared = item.config && item.config.contextDefault;
      if (!isPlainObjectValue(declared) || declared.source !== "expression" || typeof declared.expression !== "string") {
        throw formsError("no_expression", "Nothing was saved: " + item.name + " has no declared defaultFrom expression to change (config.contextDefault): send defaultFrom whole.");
      }
      var running = item.sources && item.sources.self && item.sources.self.vars && item.sources.self.vars.selfVar;
      if (!running || typeof running.str !== "string" || running.str.indexOf(declared.expression) < 0) {
        throw formsError("expression_changed_in_editor", "Nothing was saved: the expression " + item.name + " runs (sources.self.vars.selfVar) is no longer the one declared in config.contextDefault: No Code Studio changed it. Read it with nocode-form-get component and send defaultFrom whole.");
      }
      var text = declared.expression;
      ensureArray(op.patch.defaultFromEdit).forEach(function (edit, e) {
        var find = edit && edit.find != null ? String(edit.find) : "";
        var by = edit && (edit.replace != null ? edit.replace : edit["with"] != null ? edit["with"] : edit.by);
        if (!find.length || by == null) { throw formsError("invalid_expression_edit", "Nothing was saved: " + at + " defaultFromEdit[" + e + "] is { find: \"<exact text of the expression>\", replace: \"<new text>\" }."); }
        var times = text.split(find).length - 1;
        if (times !== 1) {
          throw formsError("expression_edit_not_found", "Nothing was saved: " + at + " defaultFromEdit[" + e + "]: " + JSON.stringify(find.length > 80 ? find.substring(0, 79) + "…" : find) +
            (times ? " is " + times + " times in the expression of " + item.name + ": give a longer find, found once." : " is not in the expression of " + item.name + " (spaces and quotes count): read it with nocode-form-get component."));
        }
        text = text.split(find).join(String(by));
      });
      var changed = clone(op, {});
      changed.patch = clone(op.patch, {});
      delete changed.patch.defaultFromEdit;
      changed.patch.defaultFrom = clone(declared, {});
      changed.patch.defaultFrom.expression = text;
      return changed;
    });
  }
  C8O.nocodeForms.expandExpressionEdits = expandExpressionEdits;

  // A merge patch is stored as given: a key a component does not have (patch.cols for a layout, whose columns are
  // config.cols; patch.values for a select, whose choices are children) was saved at its root, where the viewer never
  // reads it, and the edit answered saved. Each component the edit changed is compared with what it had and with the
  // prototype of its type (C8Oforms catalog): a key that appears at its root and is in neither is refused, nothing saved.
  var ROOT_KEYS_ALWAYS = ["id", "type", "name", "config", "sources", "sourcesMarkers", "sourcesCircles", "sourcesPolygons", "sourcesCenter", "actions",
    "conditions", "childrenRefs", "parentRef", "children", "flow"];
  function unreadRootKeys(current, edited, options) {
    var before = componentsById(current);
    var found = [];
    ensureArray(edited && edited.formulaire).forEach(function (item) {
      if (!item || item.id == null || !before[String(item.id)]) { return; }
      var old = before[String(item.id)];
      Object.keys(item).forEach(function (key) {
        if (hasOwn(old, key) || ROOT_KEYS_ALWAYS.indexOf(key) >= 0 || /^__/.test(key) || key.charAt(0) === "_") { return; }
        found.push({ item: item, old: old, key: key });
      });
    });
    if (!found.length) { return []; }
    var prototypes = {};
    try {
      ensureArray(formsRun("catalog", {}, options).catalog).forEach(function (proto) { if (proto && proto.type && !prototypes[proto.type]) { prototypes[proto.type] = proto; } });
    } catch (_noCatalog) {
      prototypes = {};
    }
    return found.filter(function (entry) {
      var proto = prototypes[entry.item.type];
      return !(proto && hasOwn(proto, entry.key));
    }).map(function (entry) {
      var proto = prototypes[entry.item.type];
      var configs = [entry.old.config, proto && proto.config].filter(isPlainObjectValue);
      var inConfig = configs.some(function (config) { return hasOwn(config, entry.key); });
      var keys = Object.keys(proto || entry.old).filter(function (key) { return key !== "id"; });
      return entry.item.name + " (" + entry.item.type + "): patch." + entry.key + " is not a key of a " + entry.item.type + " as saved" +
        (inConfig ? ", whose " + entry.key + " is config." + entry.key + ": write patch.config." + entry.key :
          " (its keys: " + keys.join(", ") + "): update_field merges the native shape, as nocode-form-get component shows it; add_field and create take the reduced keys");
    });
  }

  C8O.nocodeForms.edit = function (id, operations, options) {
    try {
      var requestedOperations = ensureArray(operations);
      if (!requestedOperations.length) { return nothingToSave("no_operations", "No operation given"); }
      if (requestedOperations.some(function (op) { return op && op.action === "finalize_baserow_bindings"; })) {
        if (requestedOperations.length !== 1) { throw new Error("finalize_baserow_bindings must be the only operation; resume the saved creation before other edits"); }
        return resumeBaserowFinalization(id, options);
      }
      var current = getForm(id, options);
      if (current && current.fetched === false) {
        current.saved = false;
        return current;
      }
      var currentForm = current && current.res ? current.res : current;
      resolveAttachmentImages(requestedOperations, options);
      var keyRepairs = [];
      var checkedOperations = checkEditOperations(expandExpressionEdits(requestedOperations, currentForm), keyRepairs);
      var applied = formsRun("edit", { form: currentForm, operations: checkedOperations, options: formsOptions(options) }, options);
      var unread = unreadRootKeys(currentForm, applied.form, options);
      if (unread.length) {
        return { status: "error", saved: false, error: { code: "unread_patch_key", message: "Nothing was saved: " + unread.join("; ") + "." } };
      }
      var saved = saveEditedForm(currentForm, applied.form, options);
      withRepairs(saved, operations, applied);
      if (keyRepairs.length) { saved.repairs = ensureArray(saved.repairs).concat(keyRepairs); }
      saved.operations = applied.operations;
      if (applied.referencesResolved.length) { saved.referencesResolved = applied.referencesResolved; }
      saved.allTypesPath = applied.allTypesPath;
      focusWarnings(saved, currentForm, options);
      return saved;
    } catch (e) {
      var failure = {
        status: "error",
        saved: false,
        error: {
          code: e && e.code ? e.code : "edit_failed",
          message: String(e && e.message ? e.message : e)
        }
      };
      if (e && e.flowsInUse) { failure.error.flowsInUse = e.flowsInUse; }
      return failure;
    }
  };
  // What the form tools answer an agent: the form without its empty values and empty condition groups, the write
  // without the CouchDB transport details (internal host and headers) and the authentication without the token
  // payload. Sources and actions stay exactly as saved, since an agent copies them into its edits. A three-page
  // application went from 21 KB to 10 KB, for each create, edit and read. config.contextDefault stays as saved too:
  // nocode-form-validate compiles it again and compares with selfVar, and without its fallback "" every defaultFrom
  // read back looked stale (29/10).
  var AGENT_VIEW_VERBATIM_KEYS = { sources: true, sourcesMarkers: true, sourcesCircles: true, sourcesPolygons: true, sourcesCenter: true, actions: true, contextDefault: true };
  function agentView(value) {
    if (Array.isArray(value)) {
      return value.map(function (item) { return agentView(item); });
    }
    if (!value || typeof value !== "object") {
      return value;
    }
    var out = {};
    Object.keys(value).forEach(function (key) {
      var item = value[key];
      if (key === "_c8oMeta") { return; }
      if (AGENT_VIEW_VERBATIM_KEYS[key] === true) { out[key] = item; return; }
      if (key === "conditions" && item && typeof item === "object" && !Array.isArray(item)) {
        var kept = {};
        Object.keys(item).forEach(function (name) {
          var group = item[name];
          if (group && typeof group === "object" && (ensureArray(group.conds).length || ensureArray(group.groups).length)) { kept[name] = group; }
        });
        if (Object.keys(kept).length) { out[key] = kept; }
        return;
      }
      var compact = agentView(item);
      if (compact === "" || compact == null) { return; }
      if (typeof compact === "object" && !Array.isArray(compact) && !Object.keys(compact).length) { return; }
      out[key] = compact;
    });
    return out;
  }
  // A saved form whose view is larger than this is not answered whole: the 5.6 MB application of the Pilotage KPI import
  // (test-nocode, 23/11) answered nearly 3 million characters to each edit, cut to its first 14,000 for the agent and too
  // large to keep in pages, at the cost of converting it twice more on the server.
  var AGENT_FORM_MAX_CHARS = 200000;
  function formOutline(view, chars) {
    var components = Array.isArray(view.formulaire) ? view.formulaire.length : 0;
    var pages = (Array.isArray(view.pages) ? view.pages : []).map(function (page) { return page && (page.name || page.pageTechName); }).filter(function (name) { return name != null && String(name).length; });
    return {
      form: { _id: view._id, _rev: view._rev, name: view.name },
      formOmitted: {
        chars: chars,
        components: components,
        pages: pages.slice(0, 40),
        reason: "The saved form is " + chars + " characters: only its id, revision and name are answered.",
        read: "Read what you need to check with nocode-form-get component, page or flow (a name or an id), or find (a word), never the whole form."
      }
    };
  }
  function agentResult(result) {
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      return result;
    }
    // The id and the revision first: an agent that cut a long answer to summarize it lost the id of its new form.
    var out = {};
    var savedId = (result.response && result.response.id) || (result.form && result.form._id);
    var savedRev = (result.response && result.response.rev) || (result.form && result.form._rev);
    if (savedId != null) { out.id = String(savedId); }
    if (savedRev != null) { out.rev = String(savedRev); }
    Object.keys(result).forEach(function (key) { if (!hasOwn(out, key)) { out[key] = result[key]; } });
    if (out.validation && typeof out.validation === "object") { groupWarnings(out.validation, result.form); }
    if (out.form && typeof out.form === "object") {
      out.form = agentView(out.form);
      var formChars = JSON.stringify(out.form).length;
      if (formChars > AGENT_FORM_MAX_CHARS) {
        var outline = formOutline(out.form, formChars);
        out.form = outline.form;
        out.formOmitted = outline.formOmitted;
      }
    }
    if (out.response && typeof out.response === "object") { out.response = agentView(out.response); }
    if (out.authentication && typeof out.authentication === "object") {
      var auth = { status: out.authentication.status, authenticated: out.authentication.authenticated === true, user: out.authentication.user };
      if (out.authentication.error) { auth.error = out.authentication.error; }
      out.authentication = auth;
    }
    delete out.allTypesPath;
    return out;
  }
  ["create", "update", "edit"].forEach(function (name) {
    var raw = C8O.nocodeForms[name];
    C8O.nocodeForms[name] = function () { return agentResult(raw.apply(null, arguments)); };
  });
  // nocode-form-get find: every text of the form a user sees that holds a word, found by the C8Oforms of the server (it
  // knows where its components keep their texts), then the same word in what a user does not read but the application
  // runs: card templates, expressions, filters, the variables a save writes, conditions and sources (codeMatches).
  // Usage feedback (25/11): find only looked at visible texts, and the only way to read one card template or one
  // expression of a 615,000-character application was to read it whole.
  function findText(form, query, options) {
    var found = formsRun("findText", { form: form, query: query }, options);
    var seen = {};
    ensureArray(found && found.matches).forEach(function (match) { if (match && match.path) { seen[String(match.path)] = true; } });
    var code = codeFind(form, query, seen);
    found.codeMatches = code.matches;
    found.codeCount = code.count;
    return found;
  }
  C8O.nocodeForms.findText = findText;

  // ---- a part of a form: one component, page or flow, an outline, and the stored values that hold a word -------------

  function foldText(value) {
    var text = String(value == null ? "" : value).toLowerCase();
    try {
      if (typeof text.normalize === "function") { return text.normalize("NFD").replace(/[̀-ͯ]/g, ""); }
    } catch (_noNormalize) {}
    try {
      return String(Packages.java.text.Normalizer.normalize(text, Packages.java.text.Normalizer.Form.NFD)).replace(/[̀-ͯ]/g, "");
    } catch (_noJavaNormalizer) {}
    return text;
  }

  // The names or ids an agent gives: an array (a Java list from the engine too), a JSON array as text, the text of a list
  // the engine wrote ("[a, b]", as contractSectionList reads it), or one name, kept whole (a name may hold a comma).
  function partRefs(value) {
    if (value == null || value === "") { return []; }
    if (!Array.isArray(value) && typeof value === "object" && typeof value.size === "function" && typeof value.get === "function") {
      var listed = [];
      for (var i = 0; i < value.size(); i++) { listed.push(value.get(i)); }
      value = listed;
    }
    if (Array.isArray(value)) { return value.map(function (item) { return trimmed(item); }).filter(function (item) { return item.length > 0; }); }
    var text = trimmed(value);
    if (/^\[[\s\S]*\]$/.test(text)) {
      try { return partRefs(JSON.parse(text)); } catch (_notJsonList) {}
      return text.replace(/^\[|\]$/g, "").split(",").map(function (item) { return trimmed(item).replace(/^["']|["']$/g, ""); }).filter(function (item) { return item.length > 0; });
    }
    return text.length ? [text] : [];
  }

  // The page a component is shown on: the page of its root container (a nested component may name another page).
  function rootPageOf(byId, item) {
    var current = item;
    var seen = {};
    while (current && current.parentRef != null && byId[String(current.parentRef)] && !seen[String(current.parentRef)]) {
      seen[String(current.parentRef)] = true;
      current = byId[String(current.parentRef)];
    }
    return current && current.config ? current.config.page : null;
  }

  function componentsById(form) {
    var byId = {};
    ensureArray(form && form.formulaire).forEach(function (item) { if (item && item.id != null) { byId[String(item.id)] = item; } });
    return byId;
  }

  // One named thing among items: by id, by exact name, by name without case and accents, by number from 1 (pages).
  function resolvePart(items, ref, keys, byNumber) {
    var wanted = trimmed(ref);
    var folded = foldText(wanted);
    var i;
    for (i = 0; i < items.length; i++) {
      if (!items[i]) { continue; }
      for (var k = 0; k < keys.length; k++) {
        if (items[i][keys[k]] != null && String(items[i][keys[k]]) === wanted) { return items[i]; }
      }
    }
    var loose = items.filter(function (item) {
      return item && keys.some(function (key) { return item[key] != null && foldText(item[key]) === folded; });
    });
    if (loose.length === 1) { return loose[0]; }
    if (byNumber && /^[1-9][0-9]*$/.test(wanted) && Number(wanted) <= items.length) { return items[Number(wanted) - 1]; }
    return null;
  }

  // What to tell an agent when a name matches nothing: the names that hold it, else the first names of the form.
  function partSuggestions(items, ref, key) {
    var folded = foldText(ref);
    var names = items.map(function (item) { return item && item[key] != null ? String(item[key]) : null; }).filter(function (name) { return name != null && name.length; });
    var close = names.filter(function (name) { var f = foldText(name); return f.indexOf(folded) >= 0 || (f.length >= 3 && folded.indexOf(f) >= 0); });
    return (close.length ? close : names).slice(0, 15);
  }

  function partName(item) {
    return item ? (item.name != null && String(item.name).length ? String(item.name) : String(item.id)) : null;
  }

  // nocode-form-get component, page, flow: those parts of the saved form, each as the tools answer a form (agentView),
  // instead of the whole form. A container lists its children (id, name, type): ask them by name to read them.
  function formParts(form, ask) {
    var byId = componentsById(form);
    var pages = ensureArray(form.pages);
    var flows = ensureArray(form.flows);
    var formulaire = ensureArray(form.formulaire);
    var pageNames = {};
    pages.forEach(function (page) { if (page) { pageNames[String(page.pageTechName)] = page.name; } });
    var answer = { status: "ok", fetched: true, id: String(form._id), rev: String(form._rev), name: form.name };
    var notFound = [];
    function children(item) {
      return ensureArray(item.childrenRefs).map(function (ref) {
        var child = byId[String(ref)];
        return child ? { id: String(child.id), name: child.name, type: child.type } : { id: String(ref), missing: true };
      });
    }
    function componentView(item) {
      var view = agentView(item);
      var page = rootPageOf(byId, item);
      if (page != null) { view.shownOnPage = pageNames[String(page)] || page; }
      if (ensureArray(item.childrenRefs).length) { view.children = children(item); }
      return view;
    }
    var componentRefs = partRefs(ask.component);
    if (componentRefs.length) {
      answer.components = [];
      componentRefs.forEach(function (ref) {
        var item = resolvePart(formulaire, ref, ["id", "name"], false);
        if (!item) { notFound.push({ component: ref, known: partSuggestions(formulaire, ref, "name") }); return; }
        answer.components.push(componentView(item));
      });
    }
    var pageRefs = partRefs(ask.page);
    if (pageRefs.length) {
      answer.pages = [];
      pageRefs.forEach(function (ref) {
        var page = resolvePart(pages, ref, ["pageTechName", "name"], true);
        if (!page) { notFound.push({ page: ref, known: partSuggestions(pages, ref, "name") }); return; }
        var onPage = formulaire.filter(function (item) { return item && item.config && String(rootPageOf(byId, item)) === String(page.pageTechName); });
        answer.pages.push({ page: agentView(page), components: onPage.map(function (item) { return componentView(item); }) });
      });
    }
    var flowRefs = partRefs(ask.flow);
    if (flowRefs.length) {
      answer.flows = [];
      flowRefs.forEach(function (ref) {
        var flow = resolvePart(flows, ref, ["id", "name"], false);
        if (!flow) { notFound.push({ flow: ref, known: partSuggestions(flows, ref, "name") }); return; }
        var view = agentView(flow);
        var users = formulaire.filter(function (item) { return item && item.flow != null && String(item.flow) === String(flow.id); }).map(function (item) { return partName(item); });
        if (users.length) { view.usedBy = users; }
        answer.flows.push(view);
      });
    }
    if (notFound.length) {
      answer.notFound = notFound;
      answer.next = "Give the exact name or id of each part not found (known lists names of the form), or read the outline with nocode-form-get outline:true.";
    }
    return answer;
  }
  C8O.nocodeForms.formParts = formParts;

  // The map of a form: its pages with their components (name and type, nested ones under their container) and its flows,
  // to choose the parts to read. Answered by nocode-form-get outline:true, and in place of a form too large to answer whole.
  function formMap(form) {
    var byId = componentsById(form);
    var formulaire = ensureArray(form.formulaire);
    function entry(item, depth) {
      var text = partName(item) + ":" + item.type;
      var kids = ensureArray(item.childrenRefs).map(function (ref) { return byId[String(ref)]; }).filter(function (child) { return !!child; });
      if (!kids.length || depth > 6) { return text; }
      var out = {};
      out[text] = kids.map(function (child) { return entry(child, depth + 1); });
      return out;
    }
    var pages = ensureArray(form.pages).map(function (page, index) {
      var top = formulaire.filter(function (item) { return item && item.parentRef == null && item.config && String(item.config.page) === String(page.pageTechName); });
      return { number: index + 1, name: page.name, pageTechName: page.pageTechName, components: top.map(function (item) { return entry(item, 0); }) };
    });
    var flows = ensureArray(form.flows).map(function (flow) {
      var item = { id: flow.id, name: flow.name, steps: ensureArray(flow.elements).length };
      var triggers = ensureArray(flow.triggers).map(function (trigger) { return typeof trigger === "string" ? trigger : trigger && (trigger.on || trigger.type); }).filter(function (on) { return !!on; });
      if (triggers.length) { item.on = triggers; }
      return item;
    });
    return { pages: pages, flows: flows, components: formulaire.length };
  }
  C8O.nocodeForms.formMap = formMap;

  function flag(value) {
    return value === true || trimmed(value).toLowerCase() === "true";
  }

  // nocode-form-get: the saved form, some of its parts (component, page, flow), its outline, or the texts that hold a
  // word (find). A form whose view is over AGENT_FORM_MAX_CHARS answers its outline unless whole:true is asked.
  C8O.nocodeForms.read = function (id, ask, options) {
    var question = ask || {};
    var current = getForm(id, options);
    if (current && current.fetched === false) { return current; }
    var wanted = trimmed(question.find);
    var asksParts = partRefs(question.component).length + partRefs(question.page).length + partRefs(question.flow).length > 0;
    var answer;
    if (flag(question.warnings)) {
      // the warnings of the saved form, those of the parts asked when some are, the repeated ones grouped; the flow steps
      // No Code Studio wrote that the tools do not write are warnings, as an edit answers them (keepEditorFlowElements)
      var validation = keepEditorFlowElements(validateForm(current, options).validation, current, current);
      answer = { status: "ok", fetched: true, id: String(current._id), rev: String(current._rev), name: current.name };
      if (asksParts) {
        var parts = formParts(current, question);
        var owners = {};
        ensureArray(parts.components).forEach(function (item) { owners["c:" + item.id] = true; });
        ensureArray(parts.flows).forEach(function (item) { owners["f:" + item.id] = true; });
        ensureArray(parts.pages).forEach(function (item) {
          owners["p:" + item.page.pageTechName] = true;
          ensureArray(item.components).forEach(function (component) { owners["c:" + component.id] = true; });
        });
        var keep = function (item) { return item && owners[warningAnchor(current, item.path).owner] === true; };
        validation.issues = ensureArray(validation.issues).filter(keep);
        validation.warnings = ensureArray(validation.warnings).filter(keep);
        validation.issueCount = validation.issues.length;
        validation.warningCount = validation.warnings.length;
        if (parts.notFound) { answer.notFound = parts.notFound; }
      }
      answer.validation = groupWarnings(validation, current);
      return answer;
    }
    if (wanted.length) {
      // only the texts that hold the word, not the whole form
      var found = findText(current, wanted, options);
      answer = { status: "ok", fetched: true, id: String(current._id), rev: String(current._rev), find: wanted, count: found.count, matches: found.matches,
        codeCount: found.codeCount, codeMatches: found.codeMatches };
      if (asksParts) {
        var withParts = formParts(current, question);
        ["components", "pages", "flows", "notFound", "next"].forEach(function (key) { if (hasOwn(withParts, key)) { answer[key] = withParts[key]; } });
      }
      return answer;
    }
    if (asksParts) { return formParts(current, question); }
    if (flag(question.outline)) {
      return { status: "ok", fetched: true, id: String(current._id), rev: String(current._rev), name: current.name, outline: formMap(current) };
    }
    var view = agentView(current);
    if (!flag(question.whole)) {
      var chars = JSON.stringify(view).length;
      if (chars > AGENT_FORM_MAX_CHARS) {
        return {
          status: "ok", fetched: true, id: String(current._id), rev: String(current._rev), name: current.name,
          formOmitted: {
            chars: chars,
            reason: "The saved form is " + chars + " characters: its outline is answered instead.",
            read: "Read the parts you need with component, page or flow (names or ids from the outline), a word with find, or the whole form with whole:true (" + Math.ceil(chars / 14000) + " answer pages)."
          },
          outline: formMap(current)
        };
      }
    }
    return { status: "ok", fetched: true, form: view };
  };

  // Where a stored value is, in words, from its path (generic: the keys the components, steps and sources use).
  function codePlace(path) {
    if (/\/config\/galleryTemplate(\/|$)/.test(path)) { return "card template"; }
    if (/\/config\/contextDefault(\/|$)/.test(path)) { return "defaultFrom declaration"; }
    if (/\/sources\/self\/vars\/selfVar(\/|$)/.test(path)) { return "expression"; }
    if (/\/conditions\//.test(path)) { return "condition"; }
    if (/[Ff]ilter/.test(path)) { return "filter"; }
    if (/[Ss]ort/.test(path)) { return "sort"; }
    if (/\/actions\//.test(path) || /forms_freeVars|forms_id|forms_values/.test(path)) { return "record variables"; }
    if (/\/sources[A-Za-z]*\//.test(path)) { return "source"; }
    if (/[Ss]tyle|\/config\/html$|\/css/.test(path)) { return "style or html"; }
    return "value";
  }

  var CODE_FIND_MAX = 40;
  var CODE_SNIPPET = 80;
  var CODE_SKIPPED_KEYS = { _id: true, _rev: true, id: true, pageTechName: true, parentRef: true, childrenRefs: true, page: true, fakeId: true };
  // Every stored text that holds the word and is not a visible text C8Oforms already answered (seen: their paths).
  function codeFind(form, query, seen) {
    var wanted = foldText(trimmed(query));
    var matches = [];
    var total = 0;
    if (!wanted.length || !form || typeof form !== "object") { return { matches: matches, count: 0 }; }
    var byId = componentsById(form);
    var pageNames = {};
    ensureArray(form.pages).forEach(function (page) { if (page) { pageNames[String(page.pageTechName)] = page.name; } });
    function visit(value, path, owner, depth) {
      if (value == null || depth > 40) { return; }
      if (typeof value === "string") {
        if (seen[path]) { return; }
        var folded = foldText(value);
        var at = folded.indexOf(wanted);
        if (at < 0) { return; }
        var times = folded.split(wanted).length - 1;
        total++;
        if (matches.length < CODE_FIND_MAX) {
          var start = Math.max(0, at - CODE_SNIPPET);
          var end = Math.min(value.length, at + wanted.length + CODE_SNIPPET);
          var match = { where: codePlace(path), path: path, text: (start > 0 ? "…" : "") + value.substring(start, end) + (end < value.length ? "…" : "") };
          if (times > 1) { match.times = times; }
          if (value.length > end - start) { match.length = value.length; }
          Object.keys(owner).forEach(function (key) { if (owner[key] != null && owner[key] !== "") { match[key] = owner[key]; } });
          matches.push(match);
        }
        return;
      }
      if (typeof value !== "object") { return; }
      if (Array.isArray(value)) {
        value.forEach(function (item, index) { visit(item, path + "/" + index, owner, depth + 1); });
        return;
      }
      Object.keys(value).forEach(function (key) {
        if (CODE_SKIPPED_KEYS[key] === true || key === "_c8oMeta") { return; }
        visit(value[key], path + "/" + key, owner, depth + 1);
      });
    }
    ensureArray(form.pages).forEach(function (page, index) {
      if (page) { visit(page, "/pages/" + index, { page: page.name }, 0); }
    });
    ensureArray(form.formulaire).forEach(function (item, index) {
      if (!item || typeof item !== "object") { return; }
      var page = rootPageOf(byId, item);
      visit(item, "/formulaire/" + index, { component: item.name, type: item.type, page: page != null ? pageNames[String(page)] || page : null }, 0);
    });
    ensureArray(form.flows).forEach(function (flow, index) {
      if (!flow || typeof flow !== "object") { return; }
      Object.keys(flow).forEach(function (key) {
        if (key === "elements" || CODE_SKIPPED_KEYS[key] === true) { return; }
        visit(flow[key], "/flows/" + index + "/" + key, { flow: flow.id }, 1);
      });
      ensureArray(flow.elements).forEach(function (element, e) {
        if (element) { visit(element, "/flows/" + index + "/elements/" + e, { flow: flow.id, step: element.name || element.type }, 1); }
      });
    });
    if (form.config) { visit(form.config, "/config", {}, 0); }
    return { matches: matches, count: total };
  }
  C8O.nocodeForms.codeFind = codeFind;
  C8O.nocodeForms.agentView = agentView;
  C8O.nocodeForms.AGENT_FORM_MAX_CHARS = AGENT_FORM_MAX_CHARS;
  // The bearer of the call: the token given, else the Authorization header of the request.
  C8O.nocodeForms.callerToken = function (options) {
    return trimmed(options && options.token) || requestBearerToken();
  };
  C8O.nocodeForms.parseObject = parseObject;
  C8O.nocodeForms.assertStrictJsonText = assertStrictJsonText;
  C8O.nocodeForms.parseArray = parseArray;
  C8O.nocodeForms.parseOperations = parseOperations;
})();
