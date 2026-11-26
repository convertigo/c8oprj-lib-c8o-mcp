/*
 * nocode-attachment-read (No Code Studio) and attachment-read (desktop Studio) for lib_ConvertigoMCP: a file the user
 * attached in the Tigo panel, read for the agent.
 *
 * The Assistant keeps each attachment under the user's own folders of <workspace>/agents (lib_ConvertigoAssistant
 * agent_bridge_client.js, attachmentTargetDirectory): agents/attachments/<userKey>/<conversation or shared>/<file> and
 * agents/<provider>/users/<userKey>/conversations/<id>/attachments/<file>. A No Code agent cannot open them itself: its
 * tool policy and Landlock (lib_ConvertigoAgentBridge agentSandbox) confine it to its runtime, its VIBE_HOME and its
 * session folder, and the panel hands only the images to the Agent Bridge. This tool reads them in the engine for the
 * user the MCP request authenticated, and only theirs: the file is chosen by its name among that user's attachments,
 * never by a path the model gives, and a symbolic link or a file outside those folders is never read.
 *
 * Spreadsheets (xlsx, xlsm, ods, csv, tsv) answer their sheets, then the header and the rows of one sheet, a page at a
 * time: the values Excel or LibreOffice saved (a formula gives its last computed value, a date its ISO text), never a
 * formula evaluated nor a macro run. Documents (pdf, docx, odt, pptx, text files) answer their text, a page of
 * characters at a time. The engine ships PDFBox, not Apache POI: the Office Open XML and OpenDocument files are read as
 * the zip of XML they are, with no DTD and no entity but the five of XML. Every answer stays under the 16 KB of indented
 * JSON Vibe keeps inline. Never writes.
 *
 * C8O.attachmentRead.run(args, host) holds the logic; javaHost(options) gives it the files on the engine, a test host
 * gives it files in memory (tests/scripts/validate_attachment_read.cjs).
 */

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.attachmentRead = C8O.attachmentRead || {};

(function (api) {
  var MAX_FILE_BYTES = 10 * 1024 * 1024;
  // the XML of one zip entry once inflated: a 10 MB workbook seldom holds more, a zip bomb always does
  var MAX_XML_CHARS = 30 * 1024 * 1024;
  var MAX_TOTAL_XML_CHARS = 60 * 1024 * 1024;
  var MAX_ZIP_ENTRIES = 5000;
  var MAX_SHEET_ROWS = 100000;
  var MAX_COLUMNS = 100;
  var MAX_TEXT_CHARS = 2000000;
  var MAX_PDF_PAGES = 500;
  var CELL_MAX_CHARS = 300;
  var DEFAULT_ROWS = 100;
  var MAX_ROWS = 500;
  var TEXT_CHUNK = 10000;
  var LIST_MAX = 30;
  // the indented JSON of an answer: Vibe keeps 16 000 characters of a tool result inline
  var ANSWER_BUDGET = 12000;

  var FORMATS = {
    xlsx: "xlsx", xlsm: "xlsx", xltx: "xlsx", xltm: "xlsx",
    ods: "ods", ots: "ods",
    csv: "csv", tsv: "csv",
    docx: "docx", docm: "docx", dotx: "docx", dotm: "docx",
    odt: "odt", ott: "odt",
    pptx: "pptx", pptm: "pptx",
    pdf: "pdf",
    txt: "text", text: "text", md: "text", markdown: "text", json: "text", xml: "text", yaml: "text", yml: "text",
    html: "text", htm: "text", log: "text", sql: "text", ini: "text", properties: "text", js: "text", ts: "text",
    css: "text", rtf: "text"
  };
  var LEGACY = {
    xls: "an Excel 97-2003 workbook (.xls)", xlsb: "an Excel binary workbook (.xlsb)",
    doc: "a Word 97-2003 document (.doc)", ppt: "a PowerPoint 97-2003 presentation (.ppt)"
  };
  var IMAGES = { png: 1, jpg: 1, jpeg: 1, gif: 1, webp: 1, bmp: 1, svg: 1, heic: 1, tif: 1, tiff: 1 };
  var SPREADSHEETS = { xlsx: 1, ods: 1, csv: 1 };

  // Built-in number formats of Excel that show a date, a time or both (ECMA-376 18.8.30, and the East Asian ones).
  var BUILTIN_DATE_FORMATS = { 14: "date", 15: "date", 16: "date", 17: "date", 18: "time", 19: "time", 20: "time", 21: "time",
    22: "datetime", 27: "date", 28: "date", 29: "date", 30: "date", 31: "date", 32: "time", 33: "time", 34: "time", 35: "time",
    36: "date", 45: "time", 46: "elapsed", 47: "time", 50: "date", 51: "date", 52: "date", 53: "date", 54: "date", 55: "date",
    56: "date", 57: "date", 58: "date" };

  function trimmed(value) {
    return value == null ? "" : String(value).replace(/^\s+|\s+$/g, "");
  }

  function failure(code, message, extra) {
    var error = { code: code, message: message };
    if (extra) {
      for (var key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key)) {
          error[key] = extra[key];
        }
      }
    }
    return { status: "error", error: error };
  }

  function raise(code, message) {
    var e = new Error(message);
    e.attachmentCode = code;
    throw e;
  }

  function integerOf(value, fallback, min, max) {
    var text = trimmed(value);
    if (!text.length) {
      return fallback;
    }
    var n = Math.floor(Number(text));
    if (!isFinite(n)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, n));
  }

  // The name the user attached, never a path: an agent that passes the path it saw keeps only its last segment.
  function baseName(value) {
    var text = trimmed(value);
    var cut = Math.max(text.lastIndexOf("/"), text.lastIndexOf("\\"));
    return cut >= 0 ? text.substring(cut + 1) : text;
  }

  function extensionOf(name) {
    var lower = String(name || "").toLowerCase();
    var dot = lower.lastIndexOf(".");
    return dot > 0 ? lower.substring(dot + 1) : "";
  }

  function isoTime(ms) {
    var n = Number(ms);
    if (!isFinite(n) || n <= 0) {
      return null;
    }
    try {
      return new Date(n).toISOString().replace(/\.\d{3}Z$/, "Z");
    } catch (_invalidTime) {
      return null;
    }
  }

  function answerSize(value) {
    return JSON.stringify(value, null, 2).length;
  }

  // ---- XML, as Office Open XML and OpenDocument write it ----------------------------------------------------------

  function fromCodePoint(code) {
    if (!isFinite(code) || code < 0 || code > 0x10FFFF) {
      return "\uFFFD";
    }
    if (code <= 0xFFFF) {
      return String.fromCharCode(code);
    }
    code -= 0x10000;
    return String.fromCharCode(0xD800 + (code >> 10), 0xDC00 + (code & 0x3FF));
  }

  var XML_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };

  function decodeXml(text) {
    var s = String(text);
    if (s.indexOf("&") < 0) {
      return s;
    }
    return s.replace(/&(#x[0-9A-Fa-f]+|#[0-9]+|amp|lt|gt|quot|apos);/g, function (_all, entity) {
      if (entity.charAt(0) === "#") {
        return fromCodePoint(entity.charAt(1) === "x" || entity.charAt(1) === "X" ? parseInt(entity.substring(2), 16) : parseInt(entity.substring(1), 10));
      }
      return XML_ENTITIES[entity];
    });
  }

  // OOXML escapes in a string the characters XML cannot hold as _xHHHH_ (ECMA-376 22.9.2.19, ST_Xstring).
  function decodeOoxmlString(text) {
    var s = decodeXml(text);
    if (s.indexOf("_x") < 0) {
      return s;
    }
    return s.replace(/_x([0-9A-Fa-f]{4})_/g, function (_all, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    });
  }

  // One attribute of a start tag, by its local name (any prefix). A sheet asks for three per cell: compiled once.
  var ATTRIBUTE_PATTERNS = {};

  function attr(raw, localName) {
    var re = ATTRIBUTE_PATTERNS[localName];
    if (!re) {
      re = ATTRIBUTE_PATTERNS[localName] = new RegExp("(?:^|\\s)(?:[\\w.-]+:)?" + localName + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)')");
    }
    var m = re.exec(String(raw || ""));
    return m ? decodeXml(m[2] !== undefined ? m[2] : m[3]) : null;
  }

  function checkedXml(xml) {
    if (xml == null) {
      return null;
    }
    var s = String(xml);
    // Office files never carry a DTD: one is refused rather than expanded.
    if (/<!DOCTYPE/i.test(s.substring(0, 4096)) || /<!ENTITY/i.test(s)) {
      raise("unreadable", "The file holds an XML DTD, which no Office or OpenDocument file has: it is not read.");
    }
    return s;
  }

  // The element parts below match a start tag to its end tag lazily: an element left open would be searched for up to
  // the end of the text from every later start tag (quadratic on a damaged or crafted file). One linear count first:
  // more start tags (not self-closing) than end tags is a damaged file.
  function checkClosed(xml, localName) {
    var opened = 0;
    var closed = 0;
    var start = new RegExp("<(?:[\\w.-]+:)?" + localName + "(?=[\\s>/])(?:[^>\"']|\"[^\"]*\"|'[^']*')*?(/?)>", "g");
    var m;
    while ((m = start.exec(xml)) !== null) {
      if (m[1] !== "/") {
        opened++;
      }
    }
    var end = new RegExp("</(?:[\\w.-]+:)?" + localName + "\\s*>", "g");
    while (end.exec(xml) !== null) {
      closed++;
    }
    if (opened > closed) {
      raise("unreadable", "The file is damaged: a part of it is not closed.");
    }
  }

  // Start tags, end tags and text, in document order: handler.open(localName, rawAttributes, selfClosing),
  // handler.close(localName), handler.text(decodedText).
  function scanXml(xml, handler) {
    var re = /<(\/?)([^\s>\/!?]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>/g;
    var last = 0;
    var m;
    while ((m = re.exec(xml)) !== null) {
      if (m.index > last && handler.text) {
        handler.text(decodeXml(xml.substring(last, m.index)));
      }
      last = re.lastIndex;
      if (m[5] !== undefined) {
        if (handler.text) {
          handler.text(m[5]);
        }
        continue;
      }
      if (m[2] === undefined) {
        continue;
      }
      var name = m[2];
      var colon = name.indexOf(":");
      var local = colon >= 0 ? name.substring(colon + 1) : name;
      if (m[1] === "/") {
        if (handler.close) {
          handler.close(local);
        }
      } else {
        if (handler.open) {
          handler.open(local, m[3], m[4] === "/");
        }
        if (m[4] === "/" && handler.close) {
          handler.close(local);
        }
      }
    }
    if (last < xml.length && handler.text) {
      handler.text(decodeXml(xml.substring(last)));
    }
  }

  // ---- the zip of an Office file -------------------------------------------------------------------------------------

  function zipReader(host, ref) {
    var names = host.zipNames(ref, MAX_ZIP_ENTRIES + 1);
    if (names.length > MAX_ZIP_ENTRIES) {
      raise("too_big", "The file holds more than " + MAX_ZIP_ENTRIES + " parts: it is not read.");
    }
    var total = 0;
    var has = {};
    for (var i = 0; i < names.length; i++) {
      has[String(names[i])] = true;
    }
    return {
      names: names,
      has: function (name) {
        return has[name] === true;
      },
      text: function (name) {
        if (has[name] !== true) {
          return null;
        }
        var xml = host.zipText(ref, name, MAX_XML_CHARS);
        if (xml == null) {
          return null;
        }
        total += String(xml).length;
        if (total > MAX_TOTAL_XML_CHARS) {
          raise("too_big", "The file inflates to more than " + Math.round(MAX_TOTAL_XML_CHARS / 1048576) + " MB of XML: it is not read.");
        }
        return checkedXml(xml);
      }
    };
  }

  function resolvePart(base, target) {
    var t = String(target || "");
    if (t.charAt(0) === "/") {
      return t.substring(1);
    }
    var parts = (base + t).split("/");
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === "..") {
        out.pop();
      } else if (parts[i] !== "." && parts[i] !== "") {
        out.push(parts[i]);
      }
    }
    return out.join("/");
  }

  function relationships(zip, relsPath, base) {
    var map = {};
    var xml = zip.text(relsPath);
    if (xml == null) {
      return map;
    }
    var re = /<(?:[\w.-]+:)?Relationship(?=[\s>\/])([^>]*)>/g;
    var m;
    while ((m = re.exec(xml)) !== null) {
      var id = attr(m[1], "Id");
      if (id != null) {
        map[id] = { target: resolvePart(base, attr(m[1], "Target")), type: String(attr(m[1], "Type") || "") };
      }
    }
    return map;
  }

  // ---- cell values ----------------------------------------------------------------------------------------------------

  function numberValue(text) {
    var n = Number(text);
    if (!isFinite(n)) {
      return trimmed(text);
    }
    return Number(n.toPrecision(15));
  }

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  // An Excel serial date: days since 1899-12-30 (since 1904-01-01 in a 1904 workbook), the time as its fraction, shown
  // as its format shows it: a date, a time of day, both, or elapsed hours ([h]:mm).
  function serialDate(serial, date1904, kind) {
    var n = Number(serial);
    if (!isFinite(n) || n < 0 || n > 2958465) {
      return numberValue(serial);
    }
    if (kind === "elapsed") {
      var minutes = Math.round(n * 1440);
      return Math.floor(minutes / 60) + ":" + pad2(minutes % 60);
    }
    var ms = Math.round(n * 86400000) + (date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30));
    var d = new Date(ms);
    var time = pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) + (d.getUTCSeconds() ? ":" + pad2(d.getUTCSeconds()) : "");
    var day = d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
    if (kind === "time") {
      return time;
    }
    if (kind === "date") {
      return day;
    }
    return day + "T" + time;
  }

  // date, time, datetime, elapsed, or null for a format that shows no date
  function dateFormatKind(code) {
    var c = String(code || "");
    if (!c.length || /general/i.test(c)) {
      return null;
    }
    // quoted text, escaped characters and [colors], [$-locales] do not count; [h], [mm], [ss] are elapsed times
    c = c.split(";")[0].replace(/"[^"]*"/g, "").replace(/\\./g, "");
    if (/\[[hms]+\]/i.test(c)) {
      return "elapsed";
    }
    c = c.replace(/\[[^\]]*\]/g, "");
    var date = /[dy]/i.test(c) || (/m/i.test(c) && !/[hs]/i.test(c));
    var time = /[hs]/i.test(c);
    return date && time ? "datetime" : (date ? "date" : (time ? "time" : null));
  }

  function columnIndex(ref) {
    var m = /^\$?([A-Za-z]{1,3})/.exec(String(ref || ""));
    if (!m) {
      return -1;
    }
    var letters = m[1].toUpperCase();
    var n = 0;
    for (var i = 0; i < letters.length; i++) {
      n = n * 26 + (letters.charCodeAt(i) - 64);
    }
    return n - 1;
  }

  function columnLetters(index) {
    var n = index + 1;
    var out = "";
    while (n > 0) {
      var r = (n - 1) % 26;
      out = String.fromCharCode(65 + r) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  }

  function isEmpty(value) {
    return value === null || value === undefined || value === "";
  }

  // A row as the sheet holds it: values by column index, the trailing empty cells dropped.
  function trimRow(values) {
    var end = values.length;
    while (end > 0 && isEmpty(values[end - 1])) {
      end--;
    }
    values.length = end;
    for (var i = 0; i < end; i++) {
      if (values[i] === undefined) {
        values[i] = null;
      }
    }
    return values;
  }

  function rowHasValue(values) {
    for (var i = 0; i < values.length; i++) {
      if (!isEmpty(values[i])) {
        return true;
      }
    }
    return false;
  }

  // ---- xlsx ------------------------------------------------------------------------------------------------------------

  function sharedStrings(zip, path) {
    var xml = zip.text(path);
    var out = [];
    if (xml == null) {
      return out;
    }
    checkClosed(xml, "si");
    var re = /<(?:[\w.-]+:)?si(?=[\s>\/])[^>]*?(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?si>)/g;
    var m;
    while ((m = re.exec(xml)) !== null) {
      var body = m[1] || "";
      // the phonetic runs of East Asian text are not part of the value
      body = body.replace(/<(?:[\w.-]+:)?rPh(?=[\s>\/])[\s\S]*?<\/(?:[\w.-]+:)?rPh>/g, "");
      var text = "";
      var t = /<(?:[\w.-]+:)?t(?=[\s>\/])[^>]*?(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?t>)/g;
      var tm;
      while ((tm = t.exec(body)) !== null) {
        text += tm[1] ? decodeOoxmlString(tm[1]) : "";
      }
      out.push(text);
    }
    return out;
  }

  function dateStyles(zip, path) {
    var styles = [];
    var xml = zip.text(path);
    if (xml == null) {
      return styles;
    }
    var custom = {};
    var nf = /<(?:[\w.-]+:)?numFmt(?=[\s>\/])([^>]*)>/g;
    var m;
    while ((m = nf.exec(xml)) !== null) {
      custom[String(attr(m[1], "numFmtId"))] = attr(m[1], "formatCode");
    }
    var section = /<(?:[\w.-]+:)?cellXfs(?=[\s>\/])[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?cellXfs>/.exec(xml);
    if (!section) {
      return styles;
    }
    var xf = /<(?:[\w.-]+:)?xf(?=[\s>\/])([^>]*)>/g;
    while ((m = xf.exec(section[1])) !== null) {
      var id = String(attr(m[1], "numFmtId") || "0");
      styles.push(custom[id] != null ? dateFormatKind(custom[id]) : (BUILTIN_DATE_FORMATS[id] || null));
    }
    return styles;
  }

  function xlsxCell(attrs, body, ctx) {
    var type = attr(attrs, "t") || "n";
    var v = /<(?:[\w.-]+:)?v(?=[\s>\/])[^>]*?(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?v>)/.exec(body || "");
    var raw = v && v[1] !== undefined ? v[1] : null;
    if (type === "inlineStr") {
      var text = "";
      var t = /<(?:[\w.-]+:)?t(?=[\s>\/])[^>]*?(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?t>)/g;
      var tm;
      while ((tm = t.exec(body || "")) !== null) {
        text += tm[1] ? decodeOoxmlString(tm[1]) : "";
      }
      return text;
    }
    if (raw === null) {
      if (/<(?:[\w.-]+:)?f(?=[\s>\/])/.test(body || "")) {
        ctx.formulasWithoutValue++;
      }
      return null;
    }
    if (type === "s") {
      var index = parseInt(raw, 10);
      return index >= 0 && index < ctx.strings.length ? ctx.strings[index] : null;
    }
    if (type === "str" || type === "e") {
      return decodeOoxmlString(raw);
    }
    if (type === "b") {
      return trimmed(raw) === "1" || trimmed(raw).toLowerCase() === "true";
    }
    if (type === "d") {
      return trimmed(decodeXml(raw)).replace(/T00:00:00(\.0+)?Z?$/, "");
    }
    var style = parseInt(attr(attrs, "s") || "0", 10);
    if (ctx.dateStyles[style]) {
      return serialDate(decodeXml(raw), ctx.date1904, ctx.dateStyles[style]);
    }
    return numberValue(decodeXml(raw));
  }

  function xlsxRows(xml, ctx) {
    checkClosed(xml, "row");
    checkClosed(xml, "c");
    var rows = [];
    var rowRe = /<(?:[\w.-]+:)?row(?=[\s>\/])([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?row>)/g;
    var cellRe = /<(?:[\w.-]+:)?c(?=[\s>\/])([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?c>)/g;
    var m;
    var rowNumber = 0;
    while ((m = rowRe.exec(xml)) !== null) {
      var r = parseInt(attr(m[1], "r") || "", 10);
      rowNumber = isFinite(r) && r > 0 ? r : rowNumber + 1;
      if (!m[2]) {
        continue;
      }
      var values = [];
      var next = 0;
      var c;
      cellRe.lastIndex = 0;
      while ((c = cellRe.exec(m[2])) !== null) {
        var col = columnIndex(attr(c[1], "r"));
        if (col < 0) {
          col = next;
        }
        next = col + 1;
        if (col >= MAX_COLUMNS) {
          ctx.columnsCapped = true;
          continue;
        }
        var value = c[2] === undefined ? null : xlsxCell(c[1], c[2], ctx);
        if (!isEmpty(value)) {
          values[col] = value;
        }
      }
      trimRow(values);
      if (rowHasValue(values)) {
        if (rows.length >= MAX_SHEET_ROWS) {
          ctx.rowsCapped = true;
          break;
        }
        values.rowNumber = rowNumber;
        rows.push(values);
      }
    }
    return rows;
  }

  function readXlsx(zip) {
    var workbook = zip.text("xl/workbook.xml");
    if (workbook == null) {
      raise("unreadable", "The file is not a valid Excel workbook: it has no xl/workbook.xml.");
    }
    var rels = relationships(zip, "xl/_rels/workbook.xml.rels", "xl/");
    var stringsPath = "xl/sharedStrings.xml";
    var stylesPath = "xl/styles.xml";
    for (var id in rels) {
      if (/\/sharedStrings$/.test(rels[id].type)) {
        stringsPath = rels[id].target;
      } else if (/\/styles$/.test(rels[id].type)) {
        stylesPath = rels[id].target;
      }
    }
    var pr = /<(?:[\w.-]+:)?workbookPr(?=[\s>\/])([^>]*)>/.exec(workbook);
    var date1904 = pr ? /^(1|true)$/i.test(trimmed(attr(pr[1], "date1904"))) : false;
    var ctx = { strings: sharedStrings(zip, stringsPath), dateStyles: dateStyles(zip, stylesPath), date1904: date1904,
      formulasWithoutValue: 0, columnsCapped: false, rowsCapped: false };
    var sheets = [];
    var sheetRe = /<(?:[\w.-]+:)?sheet(?=[\s>\/])([^>]*)>/g;
    var m;
    while ((m = sheetRe.exec(workbook)) !== null) {
      var rel = rels[attr(m[1], "id")] || null;
      var state = trimmed(attr(m[1], "state"));
      var sheet = { name: trimmed(attr(m[1], "name")) || ("Sheet" + (sheets.length + 1)), hidden: state === "hidden" || state === "veryHidden" };
      if (rel && /\/chartsheet$/.test(rel.type)) {
        sheet.chart = true;
        sheet.rows = [];
      } else {
        var xml = rel ? zip.text(rel.target) : null;
        sheet.rows = xml == null ? [] : xlsxRows(xml, ctx);
      }
      sheets.push(sheet);
    }
    return { sheets: sheets, ctx: ctx };
  }

  // ---- ods -------------------------------------------------------------------------------------------------------------

  function odfText(fragment) {
    var out = "";
    var paragraphs = 0;
    scanXml(fragment, {
      open: function (name, raw) {
        if (name === "p" || name === "h") {
          if (paragraphs++ > 0) {
            out += "\n";
          }
        } else if (name === "s") {
          var count = parseInt(attr(raw, "c") || "1", 10);
          for (var i = 0; i < Math.min(isFinite(count) ? count : 1, 200); i++) {
            out += " ";
          }
        } else if (name === "tab") {
          out += "\t";
        } else if (name === "line-break") {
          out += "\n";
        }
      },
      text: function (t) {
        out += t;
      }
    });
    return out;
  }

  function odsCell(raw, body) {
    var type = trimmed(attr(raw, "value-type"));
    if (type === "float" || type === "percentage" || type === "currency") {
      var v = attr(raw, "value");
      return v == null ? odfText(body || "") : numberValue(v);
    }
    if (type === "date") {
      return trimmed(attr(raw, "date-value")).replace(/T00:00:00(\.0+)?$/, "");
    }
    if (type === "time") {
      var t = /^PT(\d+)H(\d+)M(\d+)/.exec(trimmed(attr(raw, "time-value")));
      return t ? pad2(Number(t[1])) + ":" + pad2(Number(t[2])) + (Number(t[3]) ? ":" + pad2(Number(t[3])) : "") : odfText(body || "");
    }
    if (type === "boolean") {
      return /^true$/i.test(trimmed(attr(raw, "boolean-value")));
    }
    return body ? odfText(body) : null;
  }

  function readOds(zip) {
    var content = zip.text("content.xml");
    if (content == null) {
      raise("unreadable", "The file is not a valid OpenDocument spreadsheet: it has no content.xml.");
    }
    checkClosed(content, "table");
    checkClosed(content, "table-row");
    checkClosed(content, "table-cell");
    var ctx = { formulasWithoutValue: 0, columnsCapped: false, rowsCapped: false };
    var sheets = [];
    var tableRe = /<(?:[\w.-]+:)?table(?=[\s>\/])([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?table>)/g;
    var rowRe = /<(?:[\w.-]+:)?table-row(?=[\s>\/])([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?table-row>)/g;
    var cellRe = /<(?:[\w.-]+:)?(table-cell|covered-table-cell)(?=[\s>\/])([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?\1>)/g;
    var m;
    while ((m = tableRe.exec(content)) !== null) {
      var sheet = { name: trimmed(attr(m[1], "name")) || ("Sheet" + (sheets.length + 1)), hidden: false, rows: [] };
      var r;
      var rowNumber = 0;
      rowRe.lastIndex = 0;
      while (m[2] && (r = rowRe.exec(m[2])) !== null) {
        var rowsRepeat = Math.max(1, parseInt(attr(r[1], "number-rows-repeated") || "1", 10) || 1);
        var firstRow = rowNumber + 1;
        rowNumber += rowsRepeat;
        var values = [];
        var col = 0;
        var c;
        cellRe.lastIndex = 0;
        while (r[2] && (c = cellRe.exec(r[2])) !== null) {
          var repeat = Math.max(1, parseInt(attr(c[2], "number-columns-repeated") || "1", 10) || 1);
          var value = c[1] === "covered-table-cell" ? null : odsCell(c[2], c[3]);
          if (isEmpty(value)) {
            col += repeat;
            continue;
          }
          for (var k = 0; k < repeat && col < MAX_COLUMNS; k++) {
            values[col++] = value;
          }
          if (col >= MAX_COLUMNS && k < repeat) {
            ctx.columnsCapped = true;
          }
        }
        trimRow(values);
        if (!rowHasValue(values)) {
          continue;
        }
        for (var n = 0; n < Math.min(1000, rowsRepeat); n++) {
          if (sheet.rows.length >= MAX_SHEET_ROWS) {
            ctx.rowsCapped = true;
            break;
          }
          var copy = n === 0 ? values : values.slice(0);
          copy.rowNumber = firstRow + n;
          sheet.rows.push(copy);
        }
      }
      sheets.push(sheet);
    }
    return { sheets: sheets, ctx: ctx };
  }

  // ---- csv, tsv --------------------------------------------------------------------------------------------------------

  function delimiterOf(text, extension) {
    if (extension === "tsv") {
      return "\t";
    }
    var line = "";
    var lines = text.split(/\r\n|\n|\r/);
    for (var i = 0; i < lines.length && !line.length; i++) {
      line = trimmed(lines[i]).length ? lines[i] : "";
    }
    var best = ",";
    var bestCount = 0;
    var candidates = [",", ";", "\t", "|"];
    for (var d = 0; d < candidates.length; d++) {
      var count = 0;
      var quoted = false;
      for (var j = 0; j < line.length; j++) {
        var ch = line.charAt(j);
        if (ch === "\"") {
          quoted = !quoted;
        } else if (!quoted && ch === candidates[d]) {
          count++;
        }
      }
      if (count > bestCount) {
        best = candidates[d];
        bestCount = count;
      }
    }
    return best;
  }

  function csvValue(text) {
    var t = trimmed(text);
    return t.length ? t : null;
  }

  // RFC 4180: quoted fields hold delimiters, line breaks and "" for a quote. Values stay as the text the file holds.
  function readCsv(text, extension) {
    var delimiter = delimiterOf(text, extension);
    var ctx = { formulasWithoutValue: 0, columnsCapped: false, rowsCapped: false, delimiter: delimiter };
    var rows = [];
    var values = [];
    var field = "";
    var quoted = false;
    var started = false;
    var line = 1;
    var i = 0;
    function endField() {
      if (values.length < MAX_COLUMNS) {
        values.push(csvValue(field));
      } else {
        ctx.columnsCapped = true;
      }
      field = "";
      started = false;
    }
    var rowStart = 1;
    function endRow() {
      endField();
      trimRow(values);
      if (rowHasValue(values)) {
        if (rows.length >= MAX_SHEET_ROWS) {
          ctx.rowsCapped = true;
        } else {
          values.rowNumber = rowStart;
          rows.push(values);
        }
      }
      values = [];
    }
    while (i < text.length) {
      var ch = text.charAt(i);
      if (quoted) {
        if (ch === "\"") {
          if (text.charAt(i + 1) === "\"") {
            field += "\"";
            i += 2;
            continue;
          }
          quoted = false;
        } else {
          if (ch === "\n") {
            line++;
          }
          field += ch;
        }
        i++;
        continue;
      }
      if (ch === "\"" && !started) {
        quoted = true;
        started = true;
      } else if (ch === delimiter) {
        endField();
      } else if (ch === "\r" || ch === "\n") {
        endRow();
        if (ch === "\r" && text.charAt(i + 1) === "\n") {
          i++;
        }
        line++;
        rowStart = line;
        if (ctx.rowsCapped) {
          break;
        }
      } else {
        field += ch;
        if (ch !== " " && ch !== "\t") {
          started = true;
        }
      }
      i++;
    }
    if (field.length || values.length) {
      endRow();
    }
    return { rows: rows, ctx: ctx };
  }

  // ---- documents -------------------------------------------------------------------------------------------------------

  // Paragraphs on their lines, a table as one line per row with its cells between " | ".
  function documentText(xml, names) {
    var lines = [];
    var line = "";
    var tableDepth = 0;
    var cell = "";
    var cells = [];
    var inText = 0;
    // Word's tab stops (w:tabs/w:tab in the paragraph properties) are not tab characters
    var skipped = 0;
    function append(t) {
      if (tableDepth > 0) {
        cell += t;
      } else {
        line += t;
      }
    }
    scanXml(xml, {
      open: function (name, raw, selfClosing) {
        // scanXml closes a self-closing element at once: each open here is matched by one close
        if (names.skip && names.skip[name] === 1) {
          skipped++;
        } else if (skipped > 0) {
          return;
        } else if (names.text[name] === 1) {
          inText++;
        } else if (name === names.table) {
          tableDepth++;
        } else if (names.tab[name] === 1) {
          append("\t");
        } else if (names.br[name] === 1) {
          append(tableDepth > 0 ? " " : "\n");
        } else if (name === names.space && names.space) {
          var count = parseInt(attr(raw, "c") || "1", 10);
          for (var i = 0; i < Math.min(isFinite(count) ? count : 1, 200); i++) {
            append(" ");
          }
        }
      },
      close: function (name) {
        if (names.skip && names.skip[name] === 1) {
          skipped = Math.max(0, skipped - 1);
          return;
        }
        if (skipped > 0) {
          return;
        }
        if (names.text[name] === 1) {
          inText = Math.max(0, inText - 1);
        }
        if (names.para[name] === 1) {
          if (tableDepth > 0) {
            cell += " ";
          } else {
            lines.push(line.replace(/\s+$/, ""));
            line = "";
          }
        } else if (name === names.cell && tableDepth === 1) {
          cells.push(trimmed(cell.replace(/\s+/g, " ")));
          cell = "";
        } else if (name === names.cell && tableDepth > 1) {
          cell += " / ";
        } else if (name === names.row && tableDepth === 1) {
          if (cells.length) {
            lines.push("| " + cells.join(" | ") + " |");
          }
          cells = [];
        } else if (name === names.table && tableDepth > 0) {
          tableDepth--;
          if (tableDepth === 0) {
            lines.push("");
          }
        }
      },
      text: function (t) {
        if (inText > 0 && skipped === 0) {
          append(t);
        }
      }
    });
    if (line.length) {
      lines.push(line);
    }
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "");
  }

  var DOCX_NAMES = { text: { t: 1 }, para: { p: 1 }, tab: { tab: 1, ptab: 1 }, br: { br: 1, cr: 1 }, space: "", cell: "tc", row: "tr", table: "tbl",
    skip: { tabs: 1, pPr: 1, rPr: 1, sectPr: 1 } };
  var ODT_NAMES = { text: { p: 1, h: 1 }, para: { p: 1, h: 1 }, tab: { tab: 1 }, br: { "line-break": 1 }, space: "s", cell: "table-cell", row: "table-row", table: "table" };
  var PPTX_NAMES = { text: { t: 1 }, para: { p: 1 }, tab: {}, br: { br: 1 }, space: "", cell: "tc", row: "tr", table: "tbl" };

  function readDocx(zip) {
    var xml = zip.text("word/document.xml");
    if (xml == null) {
      raise("unreadable", "The file is not a valid Word document: it has no word/document.xml.");
    }
    return { text: documentText(xml, DOCX_NAMES) };
  }

  function readOdt(zip) {
    var xml = zip.text("content.xml");
    if (xml == null) {
      raise("unreadable", "The file is not a valid OpenDocument text: it has no content.xml.");
    }
    var body = /<(?:[\w.-]+:)?body(?=[\s>\/])[^>]*>([\s\S]*)<\/(?:[\w.-]+:)?body>/.exec(xml);
    return { text: documentText(body ? body[1] : xml, ODT_NAMES) };
  }

  function readPptx(zip) {
    var slides = [];
    for (var i = 0; i < zip.names.length; i++) {
      var m = /^ppt\/slides\/slide(\d+)\.xml$/.exec(String(zip.names[i]));
      if (m) {
        slides.push({ index: Number(m[1]), path: m[0] });
      }
    }
    slides.sort(function (a, b) { return a.index - b.index; });
    var parts = [];
    for (var s = 0; s < slides.length; s++) {
      var text = documentText(zip.text(slides[s].path) || "", PPTX_NAMES);
      parts.push("[slide " + (s + 1) + "]" + (text.length ? "\n" + text : ""));
    }
    return { text: parts.join("\n\n"), slides: slides.length };
  }

  // The pages up to the characters this call answers (and a margin): a page further on is read by the call that asks
  // for it, so a long PDF is never extracted whole for its first page.
  function readPdf(host, ref, needChars) {
    var pdf = host.pdf(ref, Math.min(MAX_TEXT_CHARS, Math.ceil(needChars * 1.2) + 4000), MAX_PDF_PAGES);
    var parts = [];
    for (var i = 0; i < pdf.texts.length; i++) {
      var text = String(pdf.texts[i]).replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/^\s+|\s+$/g, "");
      parts.push(pdf.pages > 1 ? "[page " + (i + 1) + "]" + (text.length ? "\n" + text : "") : text);
    }
    var empty = true;
    for (var p = 0; p < pdf.texts.length && empty; p++) {
      empty = !trimmed(pdf.texts[p]).length;
    }
    return { text: parts.join("\n\n"), pages: pdf.pages, pagesRead: pdf.texts.length, complete: pdf.texts.length >= pdf.pages, empty: empty };
  }

  // ---- which file it is ------------------------------------------------------------------------------------------------

  function byteAt(head, i) {
    return head.length > i ? (Number(head[i]) & 0xFF) : -1;
  }

  // The format from the bytes first (a renamed file, a file without its extension), then from the extension.
  function formatOf(host, file) {
    var extension = extensionOf(file.name);
    var head = host.head(file.ref, 8) || [];
    if (byteAt(head, 0) === 0xD0 && byteAt(head, 1) === 0xCF && byteAt(head, 2) === 0x11 && byteAt(head, 3) === 0xE0) {
      var renamed = { xlsx: "xls", docx: "doc", pptx: "ppt" }[FORMATS[extension]];
      return { legacy: LEGACY[extension] || LEGACY[renamed] || "an Office 97-2003 file" };
    }
    if (byteAt(head, 0) === 0x25 && byteAt(head, 1) === 0x50 && byteAt(head, 2) === 0x44 && byteAt(head, 3) === 0x46) {
      return { format: "pdf" };
    }
    if (byteAt(head, 0) === 0x50 && byteAt(head, 1) === 0x4B && byteAt(head, 2) === 0x03 && byteAt(head, 3) === 0x04) {
      var zip = zipReader(host, file.ref);
      if (zip.has("xl/workbook.xml")) {
        return { format: "xlsx", zip: zip };
      }
      if (zip.has("word/document.xml")) {
        return { format: "docx", zip: zip };
      }
      if (zip.has("ppt/presentation.xml")) {
        return { format: "pptx", zip: zip };
      }
      if (zip.has("content.xml")) {
        var mimetype = trimmed(zip.has("mimetype") ? host.zipText(file.ref, "mimetype", 256) : "");
        if (/opendocument\.spreadsheet/.test(mimetype) || (!mimetype.length && FORMATS[extension] === "ods")) {
          return { format: "ods", zip: zip };
        }
        if (/opendocument\.text/.test(mimetype) || (!mimetype.length && FORMATS[extension] === "odt")) {
          return { format: "odt", zip: zip };
        }
      }
      return { unsupported: "a zip archive that is neither an Excel, Word, PowerPoint nor OpenDocument text or spreadsheet file" };
    }
    if (IMAGES[extension] === 1) {
      return { image: true };
    }
    if (LEGACY[extension]) {
      return { legacy: LEGACY[extension] };
    }
    var format = FORMATS[extension];
    if (format === "csv" || format === "text") {
      return { format: format };
    }
    if (format) {
      // an Office or PDF extension with other bytes
      return { invalid: "The file is named ." + extension + " but does not hold a valid ." + extension + " file." };
    }
    return { format: "text", sniff: true };
  }

  // ---- answers ---------------------------------------------------------------------------------------------------------

  function clipValue(value, ctx) {
    if (typeof value === "string" && value.length > CELL_MAX_CHARS) {
      ctx.truncatedCells++;
      return value.substring(0, CELL_MAX_CHARS - 1) + "\u2026";
    }
    return value == null ? "" : value;
  }

  function nonEmptyCount(values) {
    var n = 0;
    for (var i = 0; i < values.length; i++) {
      if (!isEmpty(values[i])) {
        n++;
      }
    }
    return n;
  }

  // The header is the first row with values; one-cell rows above a wider row are the sheet's title.
  function sheetLayout(rows) {
    var widest = 0;
    for (var i = 0; i < rows.length && i < 20; i++) {
      widest = Math.max(widest, nonEmptyCount(rows[i]));
    }
    var titles = [];
    var start = 0;
    while (widest >= 2 && start < rows.length - 1 && titles.length < 3 && nonEmptyCount(rows[start]) === 1) {
      titles.push(String(rows[start][rows[start].length - 1]));
      start++;
    }
    var columns = 0;
    for (var r = start; r < rows.length; r++) {
      columns = Math.max(columns, rows[r].length);
    }
    return { titles: titles, headerIndex: start, columns: columns };
  }

  function sheetSummary(sheet) {
    var layout = sheetLayout(sheet.rows);
    var summary = { name: sheet.name, rows: Math.max(0, sheet.rows.length - layout.headerIndex - 1), columns: layout.columns };
    if (sheet.hidden) {
      summary.hidden = true;
    }
    if (sheet.chart) {
      summary.chart = true;
    }
    return summary;
  }

  function pickSheet(sheets, requested) {
    var text = trimmed(requested);
    if (!text.length) {
      for (var i = 0; i < sheets.length; i++) {
        if (!sheets[i].hidden && !sheets[i].chart && sheets[i].rows.length) {
          return i;
        }
      }
      return sheets.length ? 0 : -1;
    }
    for (var s = 0; s < sheets.length; s++) {
      if (sheets[s].name === text) {
        return s;
      }
    }
    for (var t = 0; t < sheets.length; t++) {
      if (sheets[t].name.toLowerCase() === text.toLowerCase()) {
        return t;
      }
    }
    if (/^\d+$/.test(text)) {
      var index = Number(text) - 1;
      return index >= 0 && index < sheets.length ? index : -2;
    }
    return -2;
  }

  function spreadsheetAnswer(base, book, args) {
    var sheets = book.sheets;
    var ctx = book.ctx;
    ctx.truncatedCells = 0;
    base.sheets = sheets.map(sheetSummary);
    var index = pickSheet(sheets, args.sheet);
    if (index === -2) {
      return failure("invalid_argument", "No sheet named \"" + trimmed(args.sheet) + "\": give one of the names in sheets, or its number from 1.",
        { sheets: base.sheets.map(function (s) { return s.name; }) });
    }
    var notes = [];
    if (index < 0) {
      base.sheet = null;
      notes.push("The file holds no sheet.");
      base.notes = notes;
      return base;
    }
    var sheet = sheets[index];
    var layout = sheetLayout(sheet.rows);
    var headerRow = sheet.rows[layout.headerIndex] || [];
    var header = [];
    for (var h = 0; h < layout.columns; h++) {
      var label = isEmpty(headerRow[h]) ? "" : String(headerRow[h]);
      header.push(label.length ? clipValue(label, ctx) : columnLetters(h));
    }
    var data = sheet.rows.slice(layout.headerIndex + 1);
    var offset = integerOf(args.offset, 0, 0, 1e9);
    var limit = integerOf(args.limit, DEFAULT_ROWS, 1, MAX_ROWS);
    var out = { name: sheet.name };
    if (layout.titles.length) {
      out.title = layout.titles.map(function (t) { return clipValue(t, ctx); });
    }
    out.header = header;
    if (headerRow.rowNumber) {
      out.headerRow = headerRow.rowNumber;
    }
    out.offset = offset;
    out.totalRows = data.length;
    out.returned = 0;
    out.rows = [];
    base.sheet = out;
    var used = answerSize(base) + 400;
    for (var r = offset; r < data.length && out.rows.length < limit; r++) {
      var row = [];
      for (var c = 0; c < layout.columns; c++) {
        row.push(clipValue(data[r][c], ctx));
      }
      var cost = JSON.stringify(row).length + row.length * 9 + 12;
      if (out.rows.length > 0 && used + cost > ANSWER_BUDGET) {
        break;
      }
      used += cost;
      out.rows.push(row);
    }
    out.returned = out.rows.length;
    if (offset + out.returned < data.length) {
      out.nextOffset = offset + out.returned;
    }
    if (layout.columns === 1 && data.length) {
      notes.push("header is the first row of the sheet: in a one-column list it may be the first value rather than a title.");
    }
    if (sheet.chart) {
      notes.push("This sheet is a chart: it holds no cells.");
    }
    if (sheet.hidden) {
      notes.push("This sheet is hidden in the workbook.");
    }
    if (offset > data.length) {
      notes.push("offset is past the last row: the sheet has " + data.length + " rows after its header.");
    }
    if (ctx.formulasWithoutValue) {
      notes.push(ctx.formulasWithoutValue + " formula cell(s) were saved without a computed value: they read empty.");
    }
    if (ctx.truncatedCells) {
      notes.push(ctx.truncatedCells + " long cell value(s) were cut at " + CELL_MAX_CHARS + " characters.");
    }
    if (ctx.columnsCapped) {
      notes.push("Only the first " + MAX_COLUMNS + " columns are read.");
    }
    if (ctx.rowsCapped) {
      notes.push("Only the first " + MAX_SHEET_ROWS + " rows of a sheet are read.");
    }
    if (out.nextOffset !== undefined) {
      notes.push("More rows: call again with offset " + out.nextOffset + (args.sheet != null && trimmed(args.sheet).length ? " and the same sheet" : "") + ".");
    }
    if (notes.length) {
      base.notes = notes;
    }
    // the rows were sized as they came; the whole answer is checked once
    while (out.rows.length > 1 && answerSize(base) > ANSWER_BUDGET + 2000) {
      out.rows.pop();
      out.returned = out.rows.length;
      out.nextOffset = offset + out.returned;
    }
    return base;
  }

  function documentAnswer(base, doc, args) {
    var text = String(doc.text || "");
    var notes = [];
    if (text.length > MAX_TEXT_CHARS) {
      text = text.substring(0, MAX_TEXT_CHARS);
      notes.push("Only the first " + MAX_TEXT_CHARS + " characters of the document are read.");
    }
    var offset = integerOf(args.offset, 0, 0, 1e9);
    var chunk = text.substring(offset, offset + TEXT_CHUNK);
    var out = {};
    if (doc.pages !== undefined) {
      out.pages = doc.pages;
      if (doc.pagesRead >= MAX_PDF_PAGES && doc.pagesRead < doc.pages) {
        notes.push("Only the first " + MAX_PDF_PAGES + " pages are read.");
      }
    }
    if (doc.slides !== undefined) {
      out.slides = doc.slides;
    }
    if (doc.complete !== false) {
      out.totalChars = text.length;
    } else {
      out.pagesRead = doc.pagesRead;
    }
    out.offset = offset;
    out.returned = chunk.length;
    if (offset + chunk.length < text.length || (doc.complete === false && chunk.length > 0)) {
      out.nextOffset = offset + chunk.length;
      notes.push("More text: call again with offset " + out.nextOffset + ".");
    }
    out.text = chunk;
    if (doc.empty === true || !trimmed(text).length) {
      notes.push(base.attachment.format === "pdf"
        ? "This PDF has no text layer (a scan or images): its content cannot be read as text. Ask the user for the content, or for an image of the pages."
        : "The document holds no text.");
    }
    if (notes.length) {
      base.notes = notes;
    }
    base.document = out;
    // indented JSON escapes line breaks and quotes: a text full of them is cut to stay inline
    while (answerSize(base) > ANSWER_BUDGET + 2000 && out.text.length > 1000) {
      out.text = out.text.substring(0, Math.floor(out.text.length * 0.8));
      out.returned = out.text.length;
      out.nextOffset = offset + out.returned;
    }
    return base;
  }

  function listAnswer(files, owner) {
    var list = [];
    for (var i = 0; i < files.length && list.length < LIST_MAX; i++) {
      list.push({ name: files[i].name, bytes: files[i].bytes, modified: isoTime(files[i].modified) });
    }
    return {
      status: "ok",
      total: files.length,
      attachments: list,
      notes: files.length
        ? ["Read one with { name } (the newest first)" + (files.length > LIST_MAX ? "; only the " + LIST_MAX + " newest are listed" : "") + "."]
        : ["The user has no attachment. A file reaches you when the user attaches it in the Tigo panel."]
    };
  }

  function findFile(files, name) {
    var exact = files.filter(function (f) { return f.name === name; });
    if (!exact.length) {
      var lower = name.toLowerCase();
      exact = files.filter(function (f) { return String(f.name).toLowerCase() === lower; });
    }
    return exact;
  }

  // args: name (the attachment's file name; a path keeps its last segment), sheet, offset, limit.
  // host: owner(), list() -> [{name, bytes, modified, ref}], head(ref, n), zipNames(ref, max), zipText(ref, entry,
  // maxChars), text(ref, maxBytes) -> {text, encoding}, pdf(ref, maxChars, maxPages) -> {pages, texts}.
  api.run = function (args, host) {
    args = args || {};
    var owner = trimmed(host.owner());
    if (!owner.length) {
      return failure("auth_required", "The attachments are read for the user the No Code Studio signed this agent in for; this request has none.");
    }
    var files;
    try {
      files = host.list() || [];
    } catch (_listFailed) {
      return failure("unreadable", "The attachments of the user could not be listed.");
    }
    files.sort(function (a, b) { return Number(b.modified) - Number(a.modified); });
    var name = baseName(args.name);
    if (!name.length) {
      return listAnswer(files, owner);
    }
    if (name.indexOf("\u0000") >= 0 || name === "." || name === "..") {
      return failure("invalid_argument", "name is the attachment's file name, as the user's message lists it.");
    }
    var matches = findFile(files, name);
    if (!matches.length) {
      return failure("not_found", "The user has no attachment named \"" + name + "\". Call without name to list the attachments.",
        { available: files.slice(0, 20).map(function (f) { return f.name; }) });
    }
    var file = matches[0];
    if (Number(file.bytes) > MAX_FILE_BYTES) {
      return failure("too_big", "\"" + file.name + "\" is " + Math.round(Number(file.bytes) / 1048576) + " MB; attachments are read up to "
        + Math.round(MAX_FILE_BYTES / 1048576) + " MB. Ask the user for a smaller file or an extract.");
    }
    var base = { status: "ok", attachment: { name: file.name, format: null, bytes: Number(file.bytes), modified: isoTime(file.modified) } };
    var notes = [];
    if (matches.length > 1) {
      notes.push(matches.length + " attachments are named \"" + file.name + "\": the newest is read.");
    }
    try {
      var kind = formatOf(host, file);
      if (kind.image) {
        return failure("unsupported_type", "\"" + file.name + "\" is an image: images reach you with the user's message, or as their description when your model cannot see. There is nothing more to read.");
      }
      if (kind.legacy) {
        return failure("unsupported_type", "\"" + file.name + "\" is " + kind.legacy + ", which is not read. Ask the user to save it as .xlsx, .docx, .csv or .pdf and to attach it again.");
      }
      if (kind.unsupported) {
        return failure("unsupported_type", "\"" + file.name + "\" is " + kind.unsupported + ", which is not read.");
      }
      if (kind.invalid) {
        return failure("unreadable", kind.invalid);
      }
      base.attachment.format = kind.format;
      var result;
      if (kind.format === "xlsx") {
        result = spreadsheetAnswer(base, readXlsx(kind.zip), args);
      } else if (kind.format === "ods") {
        result = spreadsheetAnswer(base, readOds(kind.zip), args);
      } else if (kind.format === "docx") {
        result = documentAnswer(base, readDocx(kind.zip), args);
      } else if (kind.format === "odt") {
        result = documentAnswer(base, readOdt(kind.zip), args);
      } else if (kind.format === "pptx") {
        result = documentAnswer(base, readPptx(kind.zip), args);
      } else if (kind.format === "pdf") {
        result = documentAnswer(base, readPdf(host, file.ref, integerOf(args.offset, 0, 0, 1e9) + TEXT_CHUNK + 1), args);
      } else {
        var decoded = host.text(file.ref, MAX_FILE_BYTES);
        var text = String(decoded.text || "");
        if (text.indexOf("\u0000") >= 0) {
          return failure("unsupported_type", "\"" + file.name + "\" is a binary file of an unknown kind, which is not read.");
        }
        if (kind.format === "csv") {
          var csv = readCsv(text, extensionOf(file.name));
          var sheetName = String(file.name).replace(/\.[^.]*$/, "") || "data";
          base.attachment.delimiter = csv.ctx.delimiter === "\t" ? "tab" : csv.ctx.delimiter;
          result = spreadsheetAnswer(base, { sheets: [{ name: sheetName, hidden: false, rows: csv.rows }], ctx: csv.ctx }, args);
        } else {
          result = documentAnswer(base, { text: text.replace(/\r\n?/g, "\n") }, args);
        }
        if (decoded.encoding && decoded.encoding !== "UTF-8" && result.status === "ok") {
          result.attachment.encoding = decoded.encoding;
        }
      }
      if (notes.length && result.status === "ok") {
        result.notes = notes.concat(result.notes || []);
      }
      return result;
    } catch (e) {
      if (e && e.attachmentCode) {
        return failure(e.attachmentCode, String(e.message));
      }
      return failure("unreadable", "\"" + file.name + "\" could not be read: it is damaged or not the file its name says.");
    }
  };

  // An image the user attached, for the thumbnail of an application (nocode-form-create, -edit and -update accept
  // thumbnailImage { attachment: "<file name>" }): the agent no longer copies the image as base64 text, which a model may
  // alter (usage feedback 25/11: a 6.5 KB thumbnail saved with its lower third grey). host: as for run, with
  // base64(ref, maxBytes). Answers { status: "ok", name, contentType, base64 } or a failure.
  var THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
  api.image = function (name, host) {
    var owner = trimmed(host.owner());
    if (!owner.length) {
      return failure("auth_required", "The attachments are read for the user the No Code Studio signed this agent in for; this request has none.");
    }
    var files;
    try {
      files = host.list() || [];
    } catch (_listFailed) {
      return failure("unreadable", "The attachments of the user could not be listed.");
    }
    files.sort(function (a, b) { return Number(b.modified) - Number(a.modified); });
    var wanted = baseName(name);
    if (!wanted.length || wanted.indexOf("\u0000") >= 0 || wanted === "." || wanted === "..") {
      return failure("invalid_argument", "thumbnailImage.attachment is the file name of an image the user attached, as the user's message lists it.");
    }
    var matches = findFile(files, wanted);
    if (!matches.length) {
      return failure("not_found", "The user has no attachment named \"" + wanted + "\".", { available: files.slice(0, 20).map(function (f) { return f.name; }) });
    }
    var file = matches[0];
    if (Number(file.bytes) > THUMBNAIL_MAX_BYTES) {
      return failure("too_big", "\"" + file.name + "\" is " + Math.round(Number(file.bytes) / 1024) + " KB; a thumbnail is at most " + Math.round(THUMBNAIL_MAX_BYTES / 1024) + " KB.");
    }
    var head = host.head(file.ref, 12) || [];
    var contentType = null;
    if (byteAt(head, 0) === 0x89 && byteAt(head, 1) === 0x50 && byteAt(head, 2) === 0x4E && byteAt(head, 3) === 0x47) {
      contentType = "image/png";
    } else if (byteAt(head, 0) === 0xFF && byteAt(head, 1) === 0xD8 && byteAt(head, 2) === 0xFF) {
      contentType = "image/jpeg";
    } else if (byteAt(head, 0) === 0x52 && byteAt(head, 1) === 0x49 && byteAt(head, 2) === 0x46 && byteAt(head, 3) === 0x46 &&
      byteAt(head, 8) === 0x57 && byteAt(head, 9) === 0x45 && byteAt(head, 10) === 0x42 && byteAt(head, 11) === 0x50) {
      contentType = "image/webp";
    }
    if (!contentType) {
      return failure("unsupported_type", "\"" + file.name + "\" is not a PNG, JPEG or WebP image: a thumbnail is one of these.");
    }
    return { status: "ok", name: file.name, contentType: contentType, base64: String(host.base64(file.ref, THUMBNAIL_MAX_BYTES)) };
  };

  api.limits = {
    maxFileBytes: MAX_FILE_BYTES, maxRows: MAX_ROWS, defaultRows: DEFAULT_ROWS, maxColumns: MAX_COLUMNS,
    textChunk: TEXT_CHUNK, answerBudget: ANSWER_BUDGET, cellMaxChars: CELL_MAX_CHARS, maxPdfPages: MAX_PDF_PAGES
  };

  // ---- the engine ------------------------------------------------------------------------------------------------------

  var OWNER_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,159}$/;
  var MAX_LISTED_FILES = 2000;

  function javaBytes(size) {
    return java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, size);
  }

  function readStream(input, maxBytes) {
    var out = new java.io.ByteArrayOutputStream();
    var buffer = javaBytes(65536);
    var total = 0;
    try {
      var n;
      while ((n = input.read(buffer)) > 0) {
        total += n;
        if (total > maxBytes) {
          raise("too_big", "A part of the file inflates to more than " + Math.round(maxBytes / 1048576) + " MB: it is not read.");
        }
        out.write(buffer, 0, n);
      }
    } finally {
      try { input.close(); } catch (_ignoreClose) {}
    }
    return out.toByteArray();
  }

  function decodeBytes(bytes) {
    var length = bytes.length;
    var b0 = length > 0 ? (bytes[0] & 0xFF) : -1;
    var b1 = length > 1 ? (bytes[1] & 0xFF) : -1;
    if ((b0 === 0xFF && b1 === 0xFE) || (b0 === 0xFE && b1 === 0xFF)) {
      return { text: String(new java.lang.String(bytes, "UTF-16")), encoding: "UTF-16" };
    }
    try {
      var decoder = java.nio.charset.StandardCharsets.UTF_8.newDecoder()
        .onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)
        .onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT);
      var text = String(decoder.decode(java.nio.ByteBuffer.wrap(bytes)).toString());
      return { text: text.charAt(0) === "\uFEFF" ? text.substring(1) : text, encoding: "UTF-8" };
    } catch (_notUtf8) {
      return { text: String(new java.lang.String(bytes, "windows-1252")), encoding: "windows-1252" };
    }
  }

  // options.owner: the user key of the request (the Assistant's folder name for that user), options.agentsDirectory:
  // the agents folder (C8O.tigoAgentsDirectory), both resolved by the sequence.
  api.javaHost = function (options) {
    options = options || {};
    var F = java.io.File;
    var Files = java.nio.file.Files;
    var owner = trimmed(options.owner);
    if (!OWNER_PATTERN.test(owner) || owner.indexOf("..") >= 0) {
      owner = "";
    }
    function agentsRoot() {
      var dir = options.agentsDirectory;
      return dir ? new F(String(dir)).getCanonicalFile() : null;
    }
    function plainDirectory(file) {
      return file.isDirectory() && !Files.isSymbolicLink(file.toPath());
    }
    function children(dir) {
      var list = dir.listFiles();
      var out = [];
      if (list === null) {
        return out;
      }
      for (var i = 0; i < list.length; i++) {
        out.push(list[i]);
      }
      return out;
    }
    return {
      owner: function () {
        return owner;
      },
      // the files of the user's attachment folders, never a link, never a file whose real path leaves them
      list: function () {
        var root = agentsRoot();
        var files = [];
        if (!owner.length || root === null || !root.isDirectory()) {
          return files;
        }
        var rootPath = String(root.getPath()) + String(F.separator);
        // the real path of a file, relative to agents: one of the user's attachment folders, as the Agent Bridge checks
        // an image (noCodeAttachmentAllowed), whatever link a folder on the way is
        var ownerPattern = owner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        var ownedPath = new RegExp("^(?:attachments/" + ownerPattern + "/[^/]+|[^/]+/users/" + ownerPattern + "/conversations/[^/]+/attachments)/[^/]+$");
        var folders = [];
        var shared = new F(new F(root, "attachments"), owner);
        if (plainDirectory(shared)) {
          children(shared).forEach(function (dir) {
            if (plainDirectory(dir)) {
              folders.push(dir);
            }
          });
        }
        children(root).forEach(function (provider) {
          if (!plainDirectory(provider) || String(provider.getName()) === "attachments") {
            return;
          }
          var conversations = new F(new F(new F(provider, "users"), owner), "conversations");
          if (!plainDirectory(conversations)) {
            return;
          }
          children(conversations).forEach(function (conversation) {
            var attachments = new F(conversation, "attachments");
            if (plainDirectory(conversation) && plainDirectory(attachments)) {
              folders.push(attachments);
            }
          });
        });
        for (var f = 0; f < folders.length && files.length < MAX_LISTED_FILES; f++) {
          var entries = children(folders[f]);
          for (var e = 0; e < entries.length && files.length < MAX_LISTED_FILES; e++) {
            var file = entries[e];
            if (!file.isFile() || Files.isSymbolicLink(file.toPath())) {
              continue;
            }
            var real = file.getCanonicalFile();
            var realPath = String(real.getPath());
            if (realPath.indexOf(rootPath) !== 0 || !ownedPath.test(realPath.substring(rootPath.length).replace(/\\/g, "/"))) {
              continue;
            }
            files.push({ name: String(file.getName()), bytes: Number(file.length()), modified: Number(file.lastModified()), ref: real });
          }
        }
        return files;
      },
      head: function (ref, n) {
        var input = new java.io.FileInputStream(ref);
        try {
          var buffer = javaBytes(n);
          var read = input.read(buffer);
          var out = [];
          for (var i = 0; i < read; i++) {
            out.push(buffer[i] & 0xFF);
          }
          return out;
        } finally {
          input.close();
        }
      },
      base64: function (ref, maxBytes) {
        return String(java.util.Base64.getEncoder().encodeToString(readStream(new java.io.FileInputStream(ref), maxBytes)));
      },
      zipNames: function (ref, max) {
        var zip = new java.util.zip.ZipFile(ref);
        try {
          var names = [];
          var entries = zip.entries();
          while (entries.hasMoreElements() && names.length < max) {
            names.push(String(entries.nextElement().getName()));
          }
          return names;
        } finally {
          zip.close();
        }
      },
      zipText: function (ref, entryName, maxChars) {
        var zip = new java.util.zip.ZipFile(ref);
        try {
          var entry = zip.getEntry(entryName);
          if (entry === null) {
            return null;
          }
          return decodeBytes(readStream(zip.getInputStream(entry), maxChars)).text;
        } finally {
          zip.close();
        }
      },
      text: function (ref, maxBytes) {
        return decodeBytes(readStream(new java.io.FileInputStream(ref), maxBytes));
      },
      pdf: function (ref, maxChars, maxPages) {
        var document = null;
        try {
          var Loader = Packages.org.apache.pdfbox.Loader;
          document = typeof Loader === "function" ? Loader.loadPDF(ref) : Packages.org.apache.pdfbox.pdmodel.PDDocument.load(ref);
        } catch (openError) {
          var why = String(openError && openError.javaException ? openError.javaException.getClass().getName() : openError);
          raise("unreadable", /InvalidPassword/.test(why)
            ? "The PDF is protected by a password: ask the user for an unprotected copy."
            : "The file is not a readable PDF.");
        }
        try {
          var pages = Number(document.getNumberOfPages());
          var stripper = new Packages.org.apache.pdfbox.text.PDFTextStripper();
          stripper.setSortByPosition(true);
          var texts = [];
          var chars = 0;
          for (var p = 1; p <= pages && p <= maxPages && chars < maxChars; p++) {
            stripper.setStartPage(p);
            stripper.setEndPage(p);
            var text = String(stripper.getText(document));
            texts.push(text);
            chars += text.length;
          }
          return { pages: pages, texts: texts };
        } finally {
          try { document.close(); } catch (_ignorePdfClose) {}
        }
      }
    };
  };
})(C8O.attachmentRead);
