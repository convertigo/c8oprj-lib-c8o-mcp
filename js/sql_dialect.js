/*
 * SQL dialect of a SqlConnector, for the rules and the SQL the MCP tools write (project-lint, tree-apply warnings,
 * sql-transaction-create, business-sequence-create). What breaks depends on the database:
 * - a bare number added to a date: HSQLDB refuses it, MariaDB/MySQL silently turns the date into a number,
 *   PostgreSQL accepts it on a date (days) but not on a timestamp, Oracle and SQL Server count days;
 * - unquoted aliases: HSQLDB and Oracle upper-case them, PostgreSQL lower-cases them, MariaDB/MySQL and SQL Server
 *   keep them;
 * - concatenation: || everywhere but MariaDB/MySQL (|| is OR there: CONCAT) and SQL Server (+);
 * - text casts: MariaDB/MySQL has no CAST(... AS VARCHAR(n)) (CAST(... AS CHAR)).
 * An unknown driver gets the HSQLDB forms (the Convertigo default) and messages that do not name a database.
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
})(C8O.sqlDialect);
