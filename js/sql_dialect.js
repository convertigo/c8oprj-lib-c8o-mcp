/*
 * SQL dialect of a SqlConnector, for the rules and the SQL the MCP tools write (project-lint, tree-apply warnings,
 * sql-transaction-create, business-sequence-create). What breaks depends on the database:
 * - a bare number added to a date: HSQLDB refuses it, MariaDB/MySQL silently turns the date into a number,
 *   PostgreSQL accepts it on a date (days) but not on a timestamp, Oracle and SQL Server count days;
 * - unquoted aliases: HSQLDB and Oracle upper-case them, PostgreSQL lower-cases them, MariaDB/MySQL and SQL Server
 *   keep them;
 * - concatenation: || everywhere but MariaDB/MySQL (|| is OR there: CONCAT) and SQL Server (+);
 * - text casts: MariaDB/MySQL has no CAST(... AS VARCHAR(n)) (CAST(... AS CHAR));
 * - functions, clauses, intervals and date texts of another database (foreignSyntax), and the hints requestable-execute
 *   gives for the errors they cause (errorHints).
 * An unknown driver gets the HSQLDB forms (the Convertigo default) and messages that do not name a database, but no
 * foreignSyntax rule.
 */
C8O.sqlDialect = C8O.sqlDialect || {};

(function (api) {
  var NAMES = { hsqldb: "HSQLDB", postgresql: "PostgreSQL", mysql: "MariaDB/MySQL", oracle: "Oracle", sqlserver: "SQL Server" };

  api.DATE_MATH = /\b(CURRENT_DATE|CURRENT_TIMESTAMP|NOW\(\)|SYSDATE|GETDATE\(\))\s*([-+])\s*(\d+)(?!\d|\s*(DAY|MONTH|YEAR|HOUR|MINUTE|SECOND)S?\b)/i;

  // "" when the driver and URL name no known database.
  api.detect = function (driver, url) {
    var text = (String(driver || "") + " " + String(url || "")).toLowerCase();
    if (/hsqldb/.test(text)) {
      return "hsqldb";
    }
    if (/postgres/.test(text)) {
      return "postgresql";
    }
    if (/mariadb|mysql/.test(text)) {
      return "mysql";
    }
    if (/oracle/.test(text)) {
      return "oracle";
    }
    if (/sqlserver|jtds/.test(text)) {
      return "sqlserver";
    }
    return "";
  };

  // A SqlConnector, or a SqlTransaction (its parent is the connector).
  api.of = function (dbo) {
    for (var i = 0; dbo && i < 2; i++) {
      try {
        if (typeof dbo.getJdbcDriverClassName === "function") {
          return api.detect(dbo.getJdbcDriverClassName(), typeof dbo.getJdbcURL === "function" ? dbo.getJdbcURL() : "");
        }
        dbo = typeof dbo.getParent === "function" ? dbo.getParent() : null;
      } catch (_noConnector) {
        return "";
      }
    }
    return "";
  };

  api.name = function (dialect) {
    return NAMES[dialect] || "";
  };

  api.concat = function (dialect, parts) {
    if (dialect === "mysql") {
      return "CONCAT(" + parts.join(", ") + ")";
    }
    return parts.join(dialect === "sqlserver" ? " + " : " || ");
  };

  api.text = function (dialect, expression, size) {
    return dialect === "mysql" ? "CAST(" + expression + " AS CHAR)" : "CAST(" + expression + " AS VARCHAR(" + (size || 40) + "))";
  };

  // True when value (a comma-separated string, no spaces) lists column.
  api.inList = function (dialect, column, value) {
    if (dialect === "mysql") {
      return "FIND_IN_SET(" + api.text(dialect, column) + ", " + value + ") > 0";
    }
    var needle = api.concat(dialect, ["','", api.text(dialect, column), "','"]);
    var haystack = api.concat(dialect, ["','", value, "','"]);
    if (dialect === "sqlserver") {
      return "CHARINDEX(" + needle + ", " + haystack + ") > 0";
    }
    if (dialect === "oracle") {
      return "INSTR(" + haystack + ", " + needle + ") > 0";
    }
    return "POSITION(" + needle + " IN " + haystack + ") > 0";
  };

  // The fix of a {variable} sharing a literal with other text: col LIKE {x} || '%'.
  api.likePrefix = function (dialect, variable) {
    return "col LIKE " + api.concat(dialect, ["{" + variable + "}", "'%'"]);
  };

  // A bare number added to a date: null when this database reads it as days, else {expression, message, fix}.
  api.dateMath = function (dialect, sql) {
    var m = api.DATE_MATH.exec(String(sql));
    if (!m) {
      return null;
    }
    var base = m[1].toUpperCase();
    var sign = m[2];
    var n = m[3];
    var found = { expression: m[0] };
    if (dialect === "oracle" || dialect === "sqlserver" || (dialect === "postgresql" && base === "CURRENT_DATE")) {
      return null;
    }
    if (dialect === "postgresql") {
      found.message = "PostgreSQL refuses a number added to a timestamp";
      found.fix = base + " " + sign + " INTERVAL '" + n + " days'";
    } else if (dialect === "mysql") {
      found.message = "MariaDB/MySQL turns the date into a number (20261017 - 120), so the result is silently wrong";
      found.fix = base + " " + sign + " INTERVAL " + n + " DAY";
    } else if (dialect === "hsqldb") {
      found.message = "HSQLDB refuses it (incompatible data types in combination)";
      found.fix = base + " " + sign + " " + n + " DAY, or DATEADD('day', " + (sign === "-" ? "-" : "") + n + ", " + base + ")";
    } else {
      found.message = "most databases refuse it or read it as a number";
      found.fix = "the interval syntax of the database (" + base + " " + sign + " " + n + " DAY on HSQLDB, INTERVAL '" + n +
        " days' on PostgreSQL, INTERVAL " + n + " DAY on MariaDB/MySQL)";
    }
    return found;
  };

  // CAST(x AS VARCHAR(n)) with n under 26 on HSQLDB: a TIMESTAMP is up to 26 characters and HSQLDB refuses to cut
  // it ("string data, right truncation", run 9b), where other databases truncate. Null when nothing matches.
  api.shortTextCast = function (dialect, sql) {
    if (dialect && dialect !== "hsqldb") {
      return null;
    }
    // Only a column named like a date or time and a size a DATE fits in (10) but a TIMESTAMP(6) does not: warning on every
    // CAST to VARCHAR, an integer id or a DATE included, gave 20 warnings for 13 transactions (run 10 F-01).
    var re = /CAST\s*\(\s*([A-Za-z_][\w.]*)\s+AS\s+(?:VARCHAR|CHAR)\s*\(\s*(\d+)\s*\)\s*\)/gi;
    var m;
    while ((m = re.exec(String(sql || ""))) !== null) {
      var size = Number(m[2]);
      var name = m[1].replace(/^.*\./, "");
      if (size > 10 && size < 26 && /date|time|stamp|_at$|^at_/i.test(name)) {
        return { expression: m[0], column: m[1], size: size };
      }
    }
    return null;
  };

  // A string literal left open: an apostrophe inside a text that was not doubled ('d''année'). Returns the text
  // from the quote that opens the unclosed literal, or null. Comments are skipped; '' inside a literal is one quote.
  api.unbalancedQuote = function (sql) {
    var text = String(sql || "");
    var open = -1;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (open < 0) {
        if (ch === "-" && text.charAt(i + 1) === "-") {
          var eol = text.indexOf("\n", i);
          i = eol < 0 ? text.length : eol;
        } else if (ch === "/" && text.charAt(i + 1) === "*") {
          var end = text.indexOf("*/", i + 2);
          i = end < 0 ? text.length : end + 1;
        } else if (ch === "'") {
          open = i;
        }
      } else if (ch === "'") {
        if (text.charAt(i + 1) === "'") {
          i++;
        } else {
          open = -1;
        }
      }
    }
    return open < 0 ? null : text.substring(Math.max(0, open - 30), open + 40);
  };

  // Row limit clause, after ORDER BY. SQL Server needs an ORDER BY for OFFSET ... FETCH: null without one.
  api.limit = function (dialect, n, ordered) {
    if (dialect === "oracle") {
      return "FETCH FIRST " + n + " ROWS ONLY";
    }
    if (dialect === "sqlserver") {
      return ordered ? "OFFSET 0 ROWS FETCH NEXT " + n + " ROWS ONLY" : null;
    }
    return "LIMIT " + n;
  };

  // How the database returns an unquoted alias: "upper-cases", "lower-cases", "" (kept as written) or "may change".
  api.aliasFolding = function (dialect) {
    if (dialect === "hsqldb" || dialect === "oracle") {
      return "upper-cases";
    }
    if (dialect === "postgresql") {
      return "lower-cases";
    }
    if (dialect === "mysql" || dialect === "sqlserver") {
      return "";
    }
    return "may change the case of";
  };

  // SQL written for another database: what each one lacks, with the form it reads instead. Each one cost a failed run
  // on HSQLDB (feedback 28/10: FORMATDATETIME, INTERVAL '30 minutes', a timestamp with a T; RETURNING and
  // LAST_INSERT_ID in the Studio check). HSQLDB 2.7.4 (the engine's) and PostgreSQL 15 were run; MariaDB/MySQL, Oracle
  // and SQL Server come from their documentation. HSQLDB also reads many forms of other databases (NOW(), IFNULL, NVL,
  // GROUP_CONCAT, STRING_AGG, DATE_ADD, DATEADD, DATEDIFF, TOP, LIMIT, UUID(), DECODE), so only what it refused is
  // listed. A rule maps each dialect that lacks it to its equivalent (a text, or a function of the match that returns
  // null when the form is fine there); a dialect it does not name has it. An unknown driver gets no rule: what a
  // database lacks is never assumed.
  function but(fixes) {
    var skip = Array.prototype.slice.call(arguments, 1);
    var out = {};
    for (var key in fixes) {
      if (skip.indexOf(key) < 0) {
        out[key] = fixes[key];
      }
    }
    return out;
  }

  function each(fix) {
    var out = {};
    for (var i = 1; i < arguments.length; i++) {
      out[arguments[i]] = fix;
    }
    return out;
  }

  var TO_CHAR = "TO_CHAR(d, 'YYYY-MM-DD HH24:MI')";
  var FORMAT_DATE = { hsqldb: TO_CHAR, postgresql: TO_CHAR, oracle: TO_CHAR, mysql: "DATE_FORMAT(d, '%Y-%m-%d %H:%i')",
    sqlserver: "FORMAT(d, 'yyyy-MM-dd HH:mm')" };
  var TO_DATE = "TO_DATE(text, 'DD/MM/YYYY') or TO_TIMESTAMP(text, 'DD/MM/YYYY HH24:MI')";
  var PARSE_DATE = { hsqldb: TO_DATE, postgresql: TO_DATE, oracle: TO_DATE, mysql: "STR_TO_DATE(text, '%d/%m/%Y')",
    sqlserver: "CONVERT(DATE, text, 103)" };
  // The id of the row just inserted. The engine runs the statements of a transaction on one connection and returns a
  // sql_output per statement, so a second statement reads it.
  var LAST_ID = {
    hsqldb: "IDENTITY() in a second statement of the same transaction: INSERT INTO t (...) VALUES (...); SELECT IDENTITY() AS \"id\" FROM (VALUES(0))",
    postgresql: "INSERT INTO t (...) VALUES (...) RETURNING id AS \"id\"",
    mysql: "LAST_INSERT_ID() in a second statement of the same transaction: INSERT INTO t (...) VALUES (...); SELECT LAST_INSERT_ID() AS \"id\"",
    sqlserver: "OUTPUT INSERTED.id AS \"id\" between the column list and VALUES",
    oracle: "a read of the new row by its natural key after the INSERT (Oracle returns a generated id only to PL/SQL, with RETURNING ... INTO)"
  };
  var MERGE = "MERGE INTO t USING (VALUES({id}, {name})) AS v(id, name) ON t.id = v.id WHEN MATCHED THEN UPDATE SET t.name = v.name " +
    "WHEN NOT MATCHED THEN INSERT (name) VALUES (v.name)";
  var UPSERT = { hsqldb: MERGE, sqlserver: MERGE + ";",
    oracle: "MERGE INTO t USING (SELECT {id} AS id, {name} AS name FROM DUAL) v ON (t.id = v.id) WHEN MATCHED THEN UPDATE SET t.name = v.name " +
      "WHEN NOT MATCHED THEN INSERT (name) VALUES (v.name)",
    postgresql: "INSERT ... ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name (ON CONFLICT DO NOTHING to skip the row)",
    mysql: "INSERT ... ON DUPLICATE KEY UPDATE name = VALUES(name) (INSERT IGNORE to skip the row)" };
  var CASE_WHEN = "CASE WHEN condition THEN a ELSE b END";
  var LOWER_LIKE = "LOWER(col) LIKE LOWER({x})";
  var CAST = "CAST(x AS type)";
  var UNITS = { year: "YEAR", month: "MONTH", week: "WEEK", day: "DAY", hour: "HOUR", minute: "MINUTE", min: "MINUTE", second: "SECOND", sec: "SECOND" };
  // HSQLDB truncates to 'YYYY', 'MM' (or 'MONTH'), 'IW', 'DD', 'HH', 'MI' and refuses 'YEAR', 'DAY', 'HOUR'.
  var TRUNC_UNITS = { YEAR: "YYYY", MONTH: "MM", WEEK: "IW", DAY: "DD", HOUR: "HH", MINUTE: "MI" };

  function unitOf(word) {
    return UNITS[String(word || "").toLowerCase().replace(/s$/, "")] || "";
  }

  // Date patterns: the tokens of the Java form (H2 FORMATDATETIME, SQL Server FORMAT), of MariaDB/MySQL and of SQLite,
  // and how TO_CHAR, DATE_FORMAT and FORMAT write them. null when the pattern holds another letter.
  var PATTERN_IN = {
    java: { yyyy: "Y", yy: "y", MM: "M", dd: "D", HH: "H", mm: "I", ss: "S" },
    mysql: { "%Y": "Y", "%y": "y", "%m": "M", "%d": "D", "%H": "H", "%i": "I", "%s": "S" },
    strftime: { "%Y": "Y", "%m": "M", "%d": "D", "%H": "H", "%M": "I", "%S": "S" }
  };
  var PATTERN_OUT = {
    tochar: { Y: "YYYY", y: "YY", M: "MM", D: "DD", H: "HH24", I: "MI", S: "SS" },
    mysql: { Y: "%Y", y: "%y", M: "%m", D: "%d", H: "%H", I: "%i", S: "%s" },
    java: { Y: "yyyy", y: "yy", M: "MM", D: "dd", H: "HH", I: "mm", S: "ss" }
  };

  function convertPattern(pattern, from, to) {
    var tokens = PATTERN_IN[from];
    var keys = Object.keys(tokens).sort(function (a, b) { return b.length - a.length; });
    var out = "";
    for (var i = 0; i < pattern.length;) {
      var key = null;
      for (var k = 0; k < keys.length && !key; k++) {
        key = pattern.substr(i, keys[k].length) === keys[k] ? keys[k] : null;
      }
      if (key) {
        out += PATTERN_OUT[to][tokens[key]];
        i += key.length;
      } else if (/[A-Za-z%]/.test(pattern.charAt(i))) {
        return null;
      } else {
        out += pattern.charAt(i++);
      }
    }
    return out;
  }

  // FN(value, 'pattern') (SQLite: STRFTIME('pattern', value)) written with the date function of each database and the
  // pattern converted: format turns a date into text, parse reads text as a date. The generic form when the call or
  // its pattern does not parse.
  function dateCall(from, parse) {
    return function (m, dialect, call) {
      var parts = from === "strftime" ? /^\w+\s*\(\s*'([^']*)'\s*,\s*([\s\S]+?)\s*\)$/.exec(call || "") :
        /^\w+\s*\(\s*([\s\S]+?)\s*,\s*'([^']*)'\s*\)$/.exec(call || "");
      var value = parts ? parts[from === "strftime" ? 2 : 1] : "";
      var pattern = parts ? parts[from === "strftime" ? 1 : 2] : "";
      var to = dialect === "mysql" ? "mysql" : dialect === "sqlserver" ? "java" : "tochar";
      var converted = parts ? convertPattern(pattern, from, to) : null;
      if (converted === null || (parse && dialect === "sqlserver")) {
        return (parse ? PARSE_DATE : FORMAT_DATE)[dialect];
      }
      if (dialect === "mysql") {
        return (parse ? "STR_TO_DATE(" : "DATE_FORMAT(") + value + ", '" + converted + "')";
      }
      if (dialect === "sqlserver") {
        return "FORMAT(" + value + ", '" + converted + "')";
      }
      return (parse ? (/HH24|MI|SS/.test(converted) ? "TO_TIMESTAMP(" : "TO_DATE(") : "TO_CHAR(") + value + ", '" + converted + "')";
    };
  }

  // The call with its function renamed (IFNULL(a, b) -> COALESCE(a, b)); a CURRENT_* target replaces a call without
  // arguments (GETDATE() -> CURRENT_TIMESTAMP).
  function rename(target) {
    return function (m, dialect, call) {
      if (!call) {
        return /^CURRENT_/.test(target) ? target : target + "(...)";
      }
      return /^CURRENT_/.test(target) ? target : call.replace(/^\w+/, target);
    };
  }

  // FN(args) rewritten by a pattern of its arguments ($1, $2), or the fallback when the call does not match.
  function rewrite(re, by, fallback) {
    return function (m, dialect, call) {
      return call && re.test(call) ? call.replace(re, by) : fallback;
    };
  }

  // n units (n a number or a {variable}) as each database adds them to a date, checked on HSQLDB and PostgreSQL. HSQLDB
  // has no WEEK, and reads neither INTERVAL {x} DAY nor INTERVAL '7 days'.
  function interval(dialect, n, unit) {
    var variable = !/^-?\d+$/.test(n);
    var week = unit === "WEEK";
    if (dialect === "hsqldb") {
      if (week) {
        return variable ? "CAST(" + n + " AS INTEGER) * INTERVAL '7' DAY" : Number(n) * 7 + " DAY";
      }
      return n + " " + unit;
    }
    if (dialect === "postgresql") {
      return variable ? "CAST(" + n + " AS INTEGER) * INTERVAL '1 " + unit.toLowerCase() + "'" : "INTERVAL '" + n + " " + unit.toLowerCase() + "s'";
    }
    if (dialect === "mysql") {
      return "INTERVAL " + n + " " + unit;
    }
    if (dialect === "oracle") {
      if (variable) {
        return (unit === "YEAR" || unit === "MONTH" ? "NUMTOYMINTERVAL(" : "NUMTODSINTERVAL(") + n + (week ? " * 7, 'DAY')" : ", '" + unit + "')");
      }
      return week ? "INTERVAL '" + Number(n) * 7 + "' DAY" : "INTERVAL '" + n + "' " + unit;
    }
    if (dialect === "sqlserver") {
      return "DATEADD(" + unit.toLowerCase() + ", " + n + ", d)";
    }
    return "";
  }

  var HSQLDB_TIMESTAMP = /^\d{4}-\d{2}-\d{2}(\s+\d{1,2}:\d{2}:\d{2}(\.\d+)?(\s*[+-]\d{1,2}:\d{2})?)?$/;
  var HSQLDB_DATE = /^\d{4}-\d{2}-\d{2}$/;

  // Text HSQLDB does not read as a date or a timestamp, with the conversion that reads it: null for its own formats
  // ('YYYY-MM-DD', 'YYYY-MM-DD HH:MM:SS'), and for text that does not look like a date. variable is the SQL that holds
  // the text: a {variable} or a literal.
  api.hsqldbDatetime = function (text, variable) {
    var value = String(text == null ? "" : text).trim();
    var m = /^(\d{4}-\d{2}-\d{2})T(\d{1,2}:\d{2})(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec(value);
    if (m) {
      var pattern = "'YYYY-MM-DD\"T\"HH24:MI" + (m[3] ? ":SS" : "") + "'";
      var cut = m[4] || m[5] ? "SUBSTRING(" + variable + ", 1, " + (m[3] ? 19 : 16) + ")" : variable;
      return { reason: "a T between the date and the time" + (m[5] ? " and a time zone" : ""),
        fix: "TO_TIMESTAMP(" + cut + ", " + pattern + ")" + (m[5] ? " (the time zone is dropped)" : "") };
    }
    if (/^\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}$/.test(value)) {
      return { reason: "a time without seconds", fix: "TO_TIMESTAMP(" + variable + ", 'YYYY-MM-DD HH24:MI')" };
    }
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
      return { reason: "a date written DD/MM/YYYY", fix: "TO_DATE(" + variable + ", 'DD/MM/YYYY')" };
    }
    return null;
  };

  // A DATE '...', TIMESTAMP '...' or CAST('...' AS DATE|TIMESTAMP) literal HSQLDB refuses, with the literal it reads.
  function hsqldbLiteral(type, text) {
    type = type.toUpperCase();
    if (/\{/.test(text) || (type === "DATE" ? HSQLDB_DATE : HSQLDB_TIMESTAMP).test(text.trim())) {
      return null;
    }
    var m = /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}:\d{2})(:\d{2})?/.exec(text.trim());
    if (m) {
      return type === "DATE" ? "DATE '" + m[1] + "'" : "TIMESTAMP '" + m[1] + " " + m[2] + (m[3] || ":00") + "'";
    }
    var fix = api.hsqldbDatetime(text, "'" + text + "'");
    return fix ? fix.fix : type + " 'YYYY-MM-DD" + (type === "DATE" ? "" : " HH:MM:SS") + "'";
  }

  // A date written as text ('2026-10-28T10:00', '28/10/2026') the way HSQLDB reads it.
  function hsqldbText(text) {
    var m = /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}:\d{2})(:\d{2})?/.exec(text);
    if (m) {
      return "'" + m[1] + " " + m[2] + (m[3] || ":00") + "'";
    }
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
    var pad = function (n) { return n.length < 2 ? "0" + n : n; };
    // Day first unless the second number cannot be a month.
    var dayFirst = Number(m[2]) <= 12;
    return "'" + m[3] + "-" + pad(dayFirst ? m[2] : m[1]) + "-" + pad(dayFirst ? m[1] : m[2]) + "'" + (dayFirst && Number(m[1]) <= 12 ?
      " (if " + text + " is day/month), or TO_DATE('" + text + "', 'DD/MM/YYYY')" : "");
  }

  var DATETIME_FORMAT = "data exception: invalid datetime format";

  // fn: a function call (the rule matches "fn(" and HSQLDB fails with "object not found: FN"; call: a call too, its
  // text goes to the fixes as their third argument); re: the pattern on the
  // SQL without its comments, the text of string literals blanked unless literal is true (every match is tried, the
  // first one with a fix is kept); error: what HSQLDB answers.
  var RULES = [
    { fn: "FORMATDATETIME", from: "H2", fixes: each(dateCall("java", false), "hsqldb", "postgresql", "mysql", "oracle", "sqlserver") },
    { fn: "PARSEDATETIME", from: "H2", fixes: each(dateCall("java", true), "hsqldb", "postgresql", "mysql", "oracle", "sqlserver") },
    { fn: "DATE_FORMAT", from: "MariaDB/MySQL", fixes: each(dateCall("mysql", false), "hsqldb", "postgresql", "oracle", "sqlserver") },
    { fn: "STR_TO_DATE", from: "MariaDB/MySQL", fixes: each(dateCall("mysql", true), "hsqldb", "postgresql", "oracle", "sqlserver") },
    { fn: "STRFTIME", from: "SQLite", fixes: each(dateCall("strftime", false), "hsqldb", "postgresql", "mysql", "oracle", "sqlserver") },
    { fn: "FORMAT", from: "SQL Server", literal: true, re: /\bFORMAT\s*\(\s*[^,()']+,\s*'[^']*(yy|dd|hh|mm)[^']*'/i,
      fixes: each(dateCall("java", false), "hsqldb", "postgresql", "mysql", "oracle") },
    { name: "CONVERT(type, ...)", call: true, from: "SQL Server", re: /\bCONVERT\s*\(\s*(N?VARCHAR|N?CHAR|DATE|DATETIME2?|TIME|INT|INTEGER|BIGINT|DECIMAL|NUMERIC|FLOAT)\b/i,
      error: function (m) { return "user lacks privilege or object not found: " + m[1].toUpperCase(); },
      fixes: { hsqldb: CAST + ", or " + TO_CHAR + " for a date as text", postgresql: CAST + ", or " + TO_CHAR + " for a date as text",
        oracle: CAST + ", or " + TO_CHAR + " for a date as text", mysql: CAST + ", or DATE_FORMAT(d, '%Y-%m-%d') for a date as text" } },
    { fn: "LAST_INSERT_ID", from: "MariaDB/MySQL", fixes: but(LAST_ID, "mysql") },
    { fn: "SCOPE_IDENTITY", from: "SQL Server", fixes: but(LAST_ID, "sqlserver") },
    { name: "@@IDENTITY", from: "SQL Server", re: /@@IDENTITY\b/i, error: "unknown token", fixes: but(LAST_ID, "sqlserver", "mysql") },
    { fn: "LASTVAL", from: "PostgreSQL", re: /\bLASTVAL\s*\(\s*\)/i, fixes: but(LAST_ID, "postgresql") },
    { fn: "IDENTITY", from: "HSQLDB", re: /(^|[^\w.])IDENTITY\s*\(\s*\)/i, fixes: but(LAST_ID, "hsqldb") },
    { name: "RETURNING", from: "PostgreSQL", re: /\bRETURNING\s+[\w"*][\w".*]*/i, error: "unexpected token: RETURNING",
      fixes: { hsqldb: LAST_ID.hsqldb, sqlserver: LAST_ID.sqlserver + " (OUTPUT DELETED.id before WHERE for a DELETE)", oracle: LAST_ID.oracle } },
    { name: "ON CONFLICT", from: "PostgreSQL", re: /\bON\s+CONFLICT\b/i, error: "unexpected token: ON", fixes: but(UPSERT, "postgresql") },
    // A column default goes before its constraints on HSQLDB and Oracle: "c INTEGER NOT NULL DEFAULT 30" fails, as an
    // agent wrote it in an ALTER TABLE ... ADD COLUMN (usage tests 30/10).
    { name: "NOT NULL DEFAULT", from: "PostgreSQL or MariaDB/MySQL", whole: true, literal: true,
      re: /\bNOT\s+NULL\s+DEFAULT\s+('(?:[^']|'')*'|[\w.+\-]+(?:\s*\([^()]*\))?)/i, error: "unexpected token: DEFAULT",
      message: function () { return "a column default goes before NOT NULL here"; },
      fixes: each(function (m) { return "DEFAULT " + m[1] + " NOT NULL"; }, "hsqldb", "oracle") },
    { name: "ON DUPLICATE KEY UPDATE", from: "MariaDB/MySQL", re: /\bON\s+DUPLICATE\s+KEY\b/i, error: "unexpected token: ON", fixes: but(UPSERT, "mysql") },
    { name: "INSERT IGNORE", from: "MariaDB/MySQL", re: /\bINSERT\s+IGNORE\b/i, fixes: but(UPSERT, "mysql") },
    { name: "REPLACE INTO", from: "MariaDB/MySQL", re: /(^|;)\s*REPLACE\s+INTO\b/i, fixes: but(UPSERT, "mysql") },
    { fn: "GETDATE", from: "SQL Server", fixes: each("CURRENT_TIMESTAMP", "hsqldb", "postgresql", "mysql", "oracle") },
    { fn: "NOW", from: "MariaDB/MySQL", fixes: each("CURRENT_TIMESTAMP", "oracle", "sqlserver") },
    { name: "SYSDATE", from: "Oracle", re: /\bSYSDATE\b/i, fixes: each("CURRENT_TIMESTAMP", "postgresql", "sqlserver") },
    { fn: "CURDATE", from: "MariaDB/MySQL", fixes: { postgresql: "CURRENT_DATE", oracle: "CURRENT_DATE", sqlserver: "CAST(GETDATE() AS DATE)" } },
    { fn: "IFNULL", from: "MariaDB/MySQL", fixes: each(rename("COALESCE"), "postgresql", "oracle", "sqlserver") },
    { fn: "ISNULL", from: "SQL Server", re: /\bISNULL\s*\([^()]*,/i, fixes: each(rename("COALESCE"), "postgresql", "mysql", "oracle") },
    { fn: "NVL", from: "Oracle", fixes: each(rename("COALESCE"), "postgresql", "mysql", "sqlserver") },
    { fn: "GROUP_CONCAT", from: "MariaDB/MySQL", fixes: { postgresql: "STRING_AGG(col, ',')", sqlserver: "STRING_AGG(col, ',')",
      oracle: "LISTAGG(col, ',') WITHIN GROUP (ORDER BY col)" } },
    { fn: "STRING_AGG", from: "PostgreSQL", fixes: { mysql: "GROUP_CONCAT(col SEPARATOR ',')", oracle: "LISTAGG(col, ',') WITHIN GROUP (ORDER BY col)" } },
    { fn: "DATEADD", from: "SQL Server", fixes: { postgresql: "d + INTERVAL '7 days' (a count from a variable: d + CAST({n} AS INTEGER) * INTERVAL '1 day')",
      mysql: "DATE_ADD(d, INTERVAL 7 DAY)", oracle: "d + INTERVAL '7' DAY" } },
    { name: "DATE_ADD()", call: true, from: "MariaDB/MySQL", re: /\bDATE_(ADD|SUB)\s*\(/i, fixes: { postgresql: "d + INTERVAL '7 days'", oracle: "d + INTERVAL '7' DAY",
      sqlserver: "DATEADD(day, 7, d)" } },
    { fn: "DATEDIFF", from: "SQL Server", fixes: { postgresql: "d2 - d1 between two DATEs (days), EXTRACT(EPOCH FROM t2 - t1) / 60 for minutes",
      oracle: "d2 - d1 (days)" } },
    { name: "DATEDIFF(unit, d1, d2)", call: true, from: "SQL Server", re: /\bDATEDIFF\s*\(\s*'?(year|quarter|month|week|day|hour|minute|second)s?'?\s*,/i,
      fixes: { mysql: rewrite(/^\w+\s*\(\s*'?(\w+?)s?'?\s*,\s*([\s\S]+)\)$/, "TIMESTAMPDIFF($1, $2)", "TIMESTAMPDIFF(DAY, d1, d2)") } },
    { name: "TIMESTAMPDIFF(unit, ...)", call: true, from: "MariaDB/MySQL", re: /\bTIMESTAMPDIFF\s*\(\s*(?!SQL_TSI_)([A-Za-z]+)\s*,/i,
      error: "incompatible data type in operation", fixes: { hsqldb: rewrite(/^\w+\s*\(\s*(\w+)\s*,\s*([\s\S]+)\)$/, "DATEDIFF('$1', $2)",
        "DATEDIFF('day', d1, d2)"), postgresql: "d2 - d1 between two DATEs (days)", oracle: "d2 - d1 (days)",
        sqlserver: rewrite(/^\w+\s*\(\s*(\w+)\s*,\s*([\s\S]+)\)$/, "DATEDIFF($1, $2)", "DATEDIFF(day, d1, d2)") } },
    { fn: "DATE_TRUNC", from: "PostgreSQL", literal: true, re: /\bDATE_TRUNC\s*\(\s*'(\w+)'/i,
      fixes: { hsqldb: function (m, dialect, call) { return rewrite(/^\w+\s*\(\s*'\w+'\s*,\s*([\s\S]+)\)$/, "TRUNC($1, '" + (TRUNC_UNITS[unitOf(m[1])] || "MM") + "')",
          "TRUNC(d, '" + (TRUNC_UNITS[unitOf(m[1])] || "MM") + "')")(m, dialect, call); },
        oracle: function (m, dialect, call) { return rewrite(/^\w+\s*\(\s*'\w+'\s*,\s*([\s\S]+)\)$/, "TRUNC($1, '" + (TRUNC_UNITS[unitOf(m[1])] || "MM") + "')",
          "TRUNC(d, '" + (TRUNC_UNITS[unitOf(m[1])] || "MM") + "')")(m, dialect, call); },
        mysql: "DATE_FORMAT(d, '%Y-%m-01') for the month", sqlserver: "DATETRUNC(month, d) (SQL Server 2022), or DATEFROMPARTS(YEAR(d), MONTH(d), 1)" } },
    { name: "TRUNC(d, unit)", call: true, from: "Oracle", literal: true, re: /\bTRUNC\s*\(\s*[^,()']+,\s*'(\w+)'/i,
      error: function (m) { return "interval qualifier missing or not valid: " + m[1].toUpperCase(); },
      fixes: { hsqldb: function (m, dialect, call) {
          var unit = unitOf(m[1]);
          return unit && unit !== "MONTH" && TRUNC_UNITS[unit] ? (call || "TRUNC(d, '" + m[1] + "')").replace("'" + m[1] + "'", "'" + TRUNC_UNITS[unit] + "'") : null;
        },
        postgresql: function (m, dialect, call) {
          return rewrite(/^\w+\s*\(\s*([\s\S]+?)\s*,\s*'\w+'\s*\)$/, "DATE_TRUNC('" + (unitOf(m[1]) || "month").toLowerCase() + "', $1)",
            "DATE_TRUNC('month', d)")(m, dialect, call);
        },
        mysql: "DATE_FORMAT(d, '%Y-%m-01') for the month", sqlserver: "DATETRUNC(month, d) (SQL Server 2022)" } },
    { fn: "DATEPART", from: "SQL Server", fixes: each(rewrite(/^\w+\s*\(\s*'?(\w+)'?\s*,\s*([\s\S]+)\)$/, "EXTRACT($1 FROM $2)", "EXTRACT(YEAR FROM d)"),
      "hsqldb", "postgresql", "mysql", "oracle") },
    { name: "YEAR()", call: true, from: "MariaDB/MySQL", re: /(^|[^\w.])(YEAR|MONTH|DAY)\s*\(/i,
      fixes: each(rewrite(/^(\w+)\s*\(([\s\S]*)\)$/, "EXTRACT($1 FROM $2)", "EXTRACT(YEAR FROM d)"), "postgresql", "oracle") },
    { name: "EXTRACT(EPOCH|DOW ...)", call: true, from: "PostgreSQL", re: /\bEXTRACT\s*\(\s*(EPOCH|DOW)\b/i,
      error: function (m) { return "unexpected token: " + m[1].toUpperCase(); },
      fixes: each(function (m) { return /epoch/i.test(m[1]) ? "UNIX_TIMESTAMP(d)" : "DAYOFWEEK(d) - 1 (DAYOFWEEK counts Sunday as 1)"; }, "hsqldb", "mysql") },
    { fn: "LEN", from: "SQL Server", fixes: { hsqldb: rename("LENGTH"), postgresql: rename("LENGTH"), oracle: rename("LENGTH"), mysql: rename("CHAR_LENGTH") } },
    { name: "SELECT TOP n", from: "SQL Server", re: /\bSELECT\s+(DISTINCT\s+)?TOP\s*\(?\s*(\d+|\{\w+\})/i,
      fixes: { postgresql: "LIMIT n at the end of the SELECT", mysql: "LIMIT n at the end of the SELECT", oracle: "FETCH FIRST n ROWS ONLY at the end of the SELECT" } },
    { name: "LIMIT n", from: "PostgreSQL and MariaDB/MySQL", re: /\bLIMIT\s+(\d+|\{\w+\})/i,
      fixes: { oracle: "FETCH FIRST n ROWS ONLY", sqlserver: "SELECT TOP n ..., or OFFSET 0 ROWS FETCH NEXT n ROWS ONLY after the ORDER BY" } },
    { fn: "UUID", from: "MariaDB/MySQL", fixes: { postgresql: "GEN_RANDOM_UUID()", sqlserver: "NEWID()", oracle: "RAWTOHEX(SYS_GUID())" } },
    { fn: "NEWID", from: "SQL Server", fixes: { hsqldb: "UUID()", postgresql: "GEN_RANDOM_UUID()", mysql: "UUID()", oracle: "RAWTOHEX(SYS_GUID())" } },
    { fn: "GEN_RANDOM_UUID", from: "PostgreSQL", fixes: { hsqldb: "UUID()", mysql: "UUID()", sqlserver: "NEWID()", oracle: "RAWTOHEX(SYS_GUID())" } },
    { fn: "RAND", from: "MariaDB/MySQL", fixes: { postgresql: "RANDOM()", oracle: "DBMS_RANDOM.VALUE" } },
    { fn: "RANDOM", from: "PostgreSQL", fixes: { hsqldb: "RAND()", mysql: "RAND()", sqlserver: "RAND()", oracle: "DBMS_RANDOM.VALUE" } },
    { name: "ILIKE", from: "PostgreSQL", re: /\bILIKE\b/i, fixes: each(LOWER_LIKE, "hsqldb", "mysql", "oracle", "sqlserver") },
    { name: "::type", from: "PostgreSQL", re: /([\w.]+|[)}'])\s*::\s*[A-Za-z]\w*/, error: "unexpected token: ::",
      fixes: each(function (m, dialect) {
        var value = /^[\w.]+$/.test(m[1]) ? m[1] : "x";
        var type = m[0].replace(/^[\s\S]*::\s*/, "").toUpperCase();
        if (/^(TEXT|VARCHAR|CHARACTER)$/.test(type)) {
          return api.text(dialect, value, 4000);
        }
        return "CAST(" + value + " AS " + (dialect === "mysql" && /^(INT\d?|INTEGER|BIGINT)$/.test(type) ? "SIGNED" : type) + ")";
      }, "hsqldb", "mysql", "oracle", "sqlserver") },
    { fn: "DATE", from: "MariaDB/MySQL", re: /(^|[^\w.])DATE\s*\(/i, fixes: { hsqldb: rewrite(/^\w+\s*\(([\s\S]*)\)$/, "CAST($1 AS DATE)", "CAST(x AS DATE)"),
      oracle: rewrite(/^\w+\s*\(([\s\S]*)\)$/, "TRUNC($1)", "TRUNC(x)"), sqlserver: rewrite(/^\w+\s*\(([\s\S]*)\)$/, "CAST($1 AS DATE)", "CAST(x AS DATE)") } },
    { fn: "IIF", from: "SQL Server", fixes: each(CASE_WHEN, "hsqldb", "postgresql", "mysql", "oracle") },
    { fn: "IF", from: "MariaDB/MySQL", re: /(^|[^\w.])IF\s*\(/i, fixes: each(CASE_WHEN, "hsqldb", "postgresql", "oracle") },
    // INTERVAL '7 days', '30 minutes', '1 year 2 months', 'PT30M': HSQLDB and Oracle want the number alone in quotes,
    // MariaDB/MySQL the unit outside them, SQL Server has no INTERVAL.
    { name: "INTERVAL 'n unit'", from: "PostgreSQL", literal: true, re: /\bINTERVAL\s*'([^']*[A-Za-z][^']*)'/i, error: "data exception: invalid interval format",
      fixes: each(function (m, dialect) {
        var parts = /^\s*(-?\d+)\s*([A-Za-z]+)\s*$/.exec(m[1]);
        var unit = parts ? unitOf(parts[2]) : "";
        if (!unit) {
          return dialect === "sqlserver" ? "one DATEADD per unit: DATEADD(month, 2, DATEADD(year, 1, d))" : "one interval per unit, " +
            (dialect === "mysql" ? "INTERVAL 1 YEAR + INTERVAL 2 MONTH" : "the number alone in quotes: INTERVAL '1' YEAR + INTERVAL '2' MONTH");
        }
        if (dialect === "hsqldb") {
          return unit === "WEEK" ? interval(dialect, parts[1], unit) + " right after the date (HSQLDB has no WEEK)" : "INTERVAL '" + parts[1] + "' " + unit +
            " (the number alone in quotes, the unit after), or " + parts[1] + " " + unit + " right after the date";
        }
        return interval(dialect, parts[1], unit);
      }, "hsqldb", "mysql", "oracle", "sqlserver") },
    // HSQLDB reads INTERVAL 7 DAY but neither INTERVAL {x} DAY ("unexpected token: ?") nor INTERVAL col DAY; PostgreSQL
    // reads none of them.
    { name: "INTERVAL n UNIT", from: "MariaDB/MySQL", re: /\bINTERVAL\s+(-?\d+|\{\w+\}|[A-Za-z_][\w.]*)\s+(YEAR|MONTH|WEEK|DAY|HOUR|MINUTE|SECOND)S?\b/i,
      error: function (m) { return /^\{/.test(m[1]) ? "unexpected token: ?" : "unexpected token: " + m[2].toUpperCase(); },
      fixes: each(function (m, dialect) {
        var unit = m[2].toUpperCase();
        if (dialect !== "hsqldb" || unit === "WEEK") {
          return interval(dialect, m[1], unit);
        }
        return /^-?\d+$/.test(m[1]) ? null : m[1] + " " + unit + " right after the date, or DATEADD('" + unit.toLowerCase() + "', " + m[1] + ", d)";
      }, "hsqldb", "postgresql", "oracle", "sqlserver") },
    // CURRENT_DATE - 7 DAY: the HSQLDB shorthand; the other databases want INTERVAL, and HSQLDB has no WEEK.
    { name: "date - n UNIT", whole: true, from: "HSQLDB", re: /[-+]\s*(\d+|\{\w+\})\s+(YEAR|MONTH|WEEK|DAY|HOUR|MINUTE|SECOND)S?\b/i, unless: /\bINTERVAL\s*$/i,
      fixes: each(function (m, dialect) {
        var unit = m[2].toUpperCase();
        return dialect === "hsqldb" && unit !== "WEEK" ? null : interval(dialect, m[1], unit);
      }, "hsqldb", "postgresql", "mysql", "oracle", "sqlserver") },
    { name: "a DATE or TIMESTAMP literal", literal: true, re: /\b(TIMESTAMP|DATE)\s*'([^']*)'/i, error: DATETIME_FORMAT,
      message: function (m) { return "HSQLDB reads a " + m[1].toUpperCase() + " as '" + (/date/i.test(m[1]) ? "YYYY-MM-DD" : "YYYY-MM-DD HH:MM:SS") + "'"; },
      fixes: { hsqldb: function (m) { return hsqldbLiteral(m[1], m[2]); } } },
    { name: "CAST(text AS DATE)", literal: true, re: /\bCAST\s*\(\s*'([^']*)'\s+AS\s+(TIMESTAMP|DATE)\b/i, error: DATETIME_FORMAT,
      message: function (m) { return "HSQLDB reads a " + m[2].toUpperCase() + " as '" + (/date/i.test(m[2]) ? "YYYY-MM-DD" : "YYYY-MM-DD HH:MM:SS") + "'"; },
      fixes: { hsqldb: function (m) { return hsqldbLiteral(m[2], m[1]); } } },
    // '2026-10-28T10:00' or '28/10/2026' written for a DATE or TIMESTAMP column: HSQLDB refuses it when it prepares the
    // statement ("invalid datetime format", or "incompatible data types in combination" in a comparison).
    { name: "a date as text", whole: true, literal: true, re: /'(\d{4}-\d{2}-\d{2}T\d{1,2}:\d{2}[^']*|\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}|\d{1,2}\/\d{1,2}\/\d{4})'/,
      unless: /(\b(TIMESTAMP|DATE)\s*|\bCAST\s*\(\s*|\b(TO_DATE|TO_TIMESTAMP|PARSEDATETIME|STR_TO_DATE)\s*\(\s*)$/i, error: DATETIME_FORMAT,
      message: function () { return "if it goes to a DATE or TIMESTAMP column, HSQLDB, which reads 'YYYY-MM-DD' and 'YYYY-MM-DD HH:MM:SS', refuses it"; },
      fixes: { hsqldb: function (m) { return hsqldbText(m[1]); } } }
  ];

  // The SQL with its comments blanked out, and the text of its string literals too unless keepLiterals: both keep the
  // length of the SQL, so a match in one is at the same place in the other.
  function scan(sql, keepLiterals) {
    var text = String(sql || "");
    var out = "";
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      var end = -1;
      if (ch === "-" && text.charAt(i + 1) === "-") {
        end = text.indexOf("\n", i);
        end = end < 0 ? text.length : end;
      } else if (ch === "/" && text.charAt(i + 1) === "*") {
        end = text.indexOf("*/", i + 2);
        end = end < 0 ? text.length : end + 2;
      }
      if (end >= 0) {
        out += new Array(end - i + 1).join(" ");
        i = end - 1;
      } else if (ch === "'") {
        var close = i + 1;
        while (close < text.length && (text.charAt(close) !== "'" || text.charAt(close + 1) === "'")) {
          close += text.charAt(close) === "'" ? 2 : 1;
        }
        var inner = text.substring(i + 1, Math.min(close, text.length));
        out += "'" + (keepLiterals ? inner : new Array(inner.length + 1).join(" ")) + (close < text.length ? "'" : "");
        i = close;
      } else {
        out += ch;
      }
    }
    return out;
  }

  // The call that starts at index: FN(...) with its arguments, or null past 120 characters.
  function callAt(text, index) {
    var open = text.indexOf("(", index);
    var depth = 0;
    for (var i = open; open >= 0 && i < text.length && i < index + 120; i++) {
      depth += text.charAt(i) === "(" ? 1 : text.charAt(i) === ")" ? -1 : 0;
      if (depth === 0) {
        return text.substring(index, i + 1).replace(/\s+/g, " ");
      }
    }
    return null;
  }

  function ruleName(rule) {
    return rule.name || rule.fn + "()";
  }

  // SQL this database lacks: [{name, expression, message, fix, error}], the first match of each rule, at most max
  // (default 4). error is what HSQLDB answers ("" on another database). Empty for an unknown dialect.
  api.foreignSyntax = function (dialect, sql, max) {
    var found = [];
    if (!NAMES[dialect]) {
      return found;
    }
    var bare = scan(sql, false);
    var literal = scan(sql, true);
    for (var r = 0; r < RULES.length && found.length < (max || 4); r++) {
      var rule = RULES[r];
      if (!rule.fixes[dialect]) {
        continue;
      }
      var re = new RegExp(rule.re ? rule.re.source : "\\b" + rule.fn + "\\s*\\(", "gi");
      var text = rule.literal ? literal : bare;
      var m;
      while ((m = re.exec(text)) !== null) {
        var start = rule.whole ? m.index : m.index + Math.max(0, m[0].search(/[\w@{:]/));
        // A rule read on the literals must not start inside one ('DATE' as a value is no DATE literal).
        var skip = (rule.literal && bare.charAt(m.index) !== literal.charAt(m.index)) || (rule.unless && rule.unless.test(text.substring(0, m.index)));
        var shown = rule.fn || rule.call ? callAt(literal, start) : null;
        var fix = skip ? null : typeof rule.fixes[dialect] === "function" ? rule.fixes[dialect](m, dialect, shown) : rule.fixes[dialect];
        if (fix) {
          var error = typeof rule.error === "function" ? rule.error(m) : rule.error || (rule.fn ? "user lacks privilege or object not found: " + rule.fn : "");
          found.push({
            name: ruleName(rule),
            expression: shown || literal.substring(start, m.index + m[0].length).trim(),
            message: (rule.message ? rule.message(m) : NAMES[dialect] + " has no " + ruleName(rule) + " (" + rule.from + " SQL)") +
              (dialect === "hsqldb" && error ? ": the call fails with \"" + error + "\"" : ""),
            fix: fix,
            error: dialect === "hsqldb" ? error : ""
          });
          break;
        }
      }
    }
    return found;
  };

  // One sentence per finding: "<expression>: <message>. Write <fix>."
  api.foreignSyntaxText = function (finding) {
    return finding.expression + ": " + finding.message + ". Write " + finding.fix + ".";
  };

  var HSQLDB_CAUSE = /^(user lacks privilege or object not found|unexpected token|unknown token|data exception|incompatible data type|interval qualifier|data type cast needed)/i;

  // Hints for the SQL error a transaction returned: the formats HSQLDB reads for a refused date or interval, the values
  // of the call that it does not read, and the equivalents of what the statement wrote for another database. dialect
  // may be "" (a sequence called the transaction): the wording of the cause says HSQLDB. statement is the SQL the
  // engine names in the error, variables the call's.
  api.errorHints = function (dialect, cause, statement, variables) {
    cause = String(cause || "");
    if (!dialect && HSQLDB_CAUSE.test(cause)) {
      dialect = "hsqldb";
    }
    var hints = [];
    if (dialect === "hsqldb" && /invalid datetime format|Unparseable date/i.test(cause)) {
      var empty = /Text '' could not be parsed/.test(cause);
      var values = [];
      for (var name in (variables || {})) {
        var odd = api.hsqldbDatetime(variables[name], "{" + name + "}");
        if (odd) {
          values.push(name + " = '" + variables[name] + "' has " + odd.reason + ": " + odd.fix);
        } else if (empty && String(variables[name] == null ? "" : variables[name]) === "") {
          values.push(name + " is empty");
        }
      }
      hints.push("HSQLDB reads a DATE as 'YYYY-MM-DD' and a TIMESTAMP as 'YYYY-MM-DD HH:MM:SS' (fractional seconds and an offset like +01:00 " +
        "allowed, or the date alone), never with a T between date and time, without seconds or as 'DD/MM/YYYY': write literals that way. " +
        "A {variable} it cannot read as a date is bound as NULL, without error (the row gets no date, the filter matches nothing): convert it " +
        "in the SQL, TO_TIMESTAMP({x}, 'YYYY-MM-DD\"T\"HH24:MI') for a datetime-local field, TO_DATE({x}, 'DD/MM/YYYY'). TO_DATE and TO_TIMESTAMP " +
        "refuse an empty text: an optional value is CASE WHEN {x} = '' THEN NULL ELSE TO_TIMESTAMP({x}, 'YYYY-MM-DD\"T\"HH24:MI') END." +
        (values.length ? " Values of this call: " + values.join("; ") + "." : ""));
    }
    if (dialect === "hsqldb" && /invalid interval format/i.test(cause)) {
      hints.push("HSQLDB reads an interval as INTERVAL '7' DAY (the number alone in quotes, the unit after: YEAR, MONTH, DAY, HOUR, MINUTE, SECOND; " +
        "no WEEK) or as 7 DAY right after a date (CURRENT_DATE - 7 DAY); INTERVAL '7 days', '30 minutes', '1 year 2 months' and 'PT30M' are refused. " +
        "A count from a {variable}: ts + {x} MINUTE, or DATEADD('minute', {x}, ts).");
    }
    // On HSQLDB only an error its rules explain gets them (a constraint violation does not).
    var findings = dialect === "hsqldb" && !HSQLDB_CAUSE.test(cause) ? [] : api.foreignSyntax(dialect, statement || "", 6);
    if (!findings.length && dialect === "hsqldb") {
      // No statement in the error: the object the cause names, when it is a function of another database.
      var missing = /object not found: ([\w@]+)/i.exec(cause);
      if (missing) {
        findings = api.foreignSyntax(dialect, missing[1] + "()", 1);
      }
    }
    // The finding whose error is the cause comes first.
    findings.sort(function (a, b) {
      return (b.error && cause.indexOf(b.error) >= 0 ? 1 : 0) - (a.error && cause.indexOf(a.error) >= 0 ? 1 : 0);
    });
    findings.forEach(function (finding) {
      hints.push(api.foreignSyntaxText(finding));
    });
    return hints.slice(0, 4);
  };
})(C8O.sqlDialect);
