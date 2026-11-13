/*
 * sql-select: one bounded SELECT on an SQL connector of a project, run on a read-only connection, with nothing written in
 * the project. To read their tables, agents created SQL transactions, ran them and deleted them: 22 q_probe_* in
 * PipelineCrm2 and q_all_*_probe again in PipelineCrm3 (13/11), each one two changes of the project and a reload of its tree.
 *
 * The statement is checked first: one statement, a SELECT (or WITH ... SELECT), no write keyword outside the texts and
 * quoted names. The connection is then read-only (setReadOnly, no auto-commit, rolled back and closed at the end), the
 * rows are bounded (maxRows, 500 at most) and so is the time (20 s).
 */
if (typeof C8O === "undefined") {
  var C8O = {};
}
C8O.sqlSelect = C8O.sqlSelect || {};

(function () {
  var S = C8O.sqlSelect;
  var TOOL = "sql-select";
  S.DEFAULT_ROWS = 50;
  S.MAX_ROWS = 500;
  S.TIMEOUT_SECONDS = 20;
  S.MAX_CELL = 2000;
  // Words that change data, the schema, the session or files. Outside the texts and quoted names a SELECT has none of them.
  // FOR SHARE locks rows too.
  var WRITE_WORDS = /\b(insert|update|delete|merge|upsert|into|lock|share|create|alter|drop|truncate|grant|revoke|call|exec|execute|set|commit|rollback|savepoint|copy|shutdown|checkpoint|backup|script)\b/i;

  function str(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function refuse(message) {
    var error = new Error(TOOL + ": " + message);
    error.code = "invalid_arguments";
    throw error;
  }

  // The statement with its texts, quoted names and comments blanked: what is left is the SQL the database reads as words.
  S.bare = function (sql) {
    var text = String(sql || "");
    var out = "";
    var i = 0;
    while (i < text.length) {
      var c = text.charAt(i);
      var next = text.charAt(i + 1);
      if (c === "-" && next === "-") {
        var eol = text.indexOf("\n", i);
        i = eol < 0 ? text.length : eol;
        out += " ";
        continue;
      }
      if (c === "/" && next === "*") {
        var end = text.indexOf("*/", i + 2);
        i = end < 0 ? text.length : end + 2;
        out += " ";
        continue;
      }
      var close = c === "'" ? "'" : (c === "\"" ? "\"" : (c === "`" ? "`" : (c === "[" ? "]" : "")));
      if (close.length) {
        var j = i + 1;
        while (j < text.length) {
          if (text.charAt(j) === close) {
            // A doubled quote is an escaped one ('it''s').
            if (close !== "]" && text.charAt(j + 1) === close) {
              j += 2;
              continue;
            }
            break;
          }
          j++;
        }
        out += c === "'" ? "''" : "q";
        i = j + 1;
        continue;
      }
      out += c;
      i++;
    }
    return out;
  };

  // {statement} to run, or throws why it is refused.
  S.check = function (sql) {
    var statement = str(sql).replace(/;\s*$/, "").trim();
    if (!statement.length) {
      refuse("sql is required: one SELECT statement, such as SELECT id, name FROM companies ORDER BY name.");
    }
    var bare = S.bare(statement);
    if (bare.indexOf(";") >= 0) {
      refuse("one statement only: the sql holds several (a ; between them). Run each SELECT in its own call.");
    }
    if (!/^\s*(\(\s*)*(select|with)\b/i.test(bare)) {
      refuse("a SELECT only (or WITH ... SELECT): this tool reads data. To change data or the schema, use the " +
        "transactions of the project (requestable-execute), upsert-crud or sql-transaction-create.");
    }
    var word = WRITE_WORDS.exec(bare);
    if (word) {
      refuse("\"" + word[1].toUpperCase() + "\" " + (/^(into|set|lock|share|update)$/i.test(word[1]) ? "makes a write or a lock" : "is not a read") +
        ": this tool reads data only. A column or a table with that name is written between double quotes (\"" + word[1].toLowerCase() + "\").");
    }
    if (/\{\{?\s*[A-Za-z_]\w*\s*\}?\}/.test(bare)) {
      refuse("no {variable} here: write the values in the SQL (WHERE company_id = 3).");
    }
    return { statement: statement };
  };

  function sqlConnectors(project) {
    var out = [];
    try {
      var list = project.getConnectorsList();
      for (var i = 0; i < list.size(); i++) {
        var connector = list.get(i);
        if (/SqlConnector$/.test(String(connector.getClass().getName()))) {
          out.push(connector);
        }
      }
    } catch (_noConnectors) {}
    return out;
  }

  S.jdbcUrlOf = function (connector) {
    var url = "";
    try {
      url = str(connector.getRealJdbcURL());
    } catch (_noRealUrl) {}
    if (!url.length || url === "null") {
      url = str(connector.getJdbcURL());
      if (url.indexOf("jdbc:hsqldb:file:") === 0) {
        // A connector of a project reloaded since its last transaction has no real URL yet.
        url = "jdbc:hsqldb:file:" + String(Packages.com.twinsoft.convertigo.engine.Engine.theApp.filePropertyManager.getFilepathFromProperty(
          url.substring("jdbc:hsqldb:file:".length), String(connector.getProject().getName())));
      }
    }
    if (url.indexOf("jdbc:hsqldb:file:") === 0) {
      // ifexists: never creates a database; and no shutdown=true, which would close it under the engine.
      url = url.split(";")[0] + ";ifexists=true";
    }
    return url;
  };

  function javaClassOf(value) {
    try {
      return value && value.getClass ? String(value.getClass().getName()) : "";
    } catch (_noClass) {
      return "";
    }
  }

  // A cell as JSON: numbers, booleans and null as they are, a date as its text, a large text cut, a binary value described.
  S.cellValue = function (value, cut) {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return value;
    }
    var className = javaClassOf(value);
    if (/^java\.lang\.(Integer|Long|Short|Byte|Double|Float)$|^java\.math\.Big(Decimal|Integer)$/.test(className)) {
      var n = Number(String(value));
      return isFinite(n) && Math.abs(n) <= 9007199254740991 && String(n) === String(value).replace(/\.0+$|(\.\d*?)0+$/, "$1") ? n : String(value);
    }
    if (className === "java.lang.Boolean") {
      return String(value) === "true";
    }
    if (className === "[B") {
      return "<binary, " + value.length + " bytes>";
    }
    var text = "";
    try {
      text = typeof value.getSubString === "function" && typeof value.length === "function"
        ? String(value.getSubString(1, Math.min(Number(value.length()), S.MAX_CELL + 1))) : String(value);
    } catch (_noText) {
      text = String(value);
    }
    if (text.length > S.MAX_CELL) {
      cut.cells++;
      return text.substring(0, S.MAX_CELL) + "…";
    }
    return text;
  };

  // Runs the checked statement on the connection given: read-only, rows and time bounded, rolled back.
  S.query = function (jdbc, statement, maxRows) {
    var started = Date.now();
    try {
      jdbc.setReadOnly(true);
    } catch (_noReadOnly) {}
    try {
      jdbc.setAutoCommit(false);
    } catch (_noAutoCommit) {}
    var st = null;
    try {
      st = jdbc.createStatement();
      st.setMaxRows(maxRows + 1);
      try {
        st.setQueryTimeout(S.TIMEOUT_SECONDS);
      } catch (_noTimeout) {}
      var rs = st.executeQuery(statement);
      var md = rs.getMetaData();
      var count = Number(md.getColumnCount());
      var columns = [];
      for (var c = 1; c <= count; c++) {
        columns.push({ name: String(md.getColumnLabel(c)), type: String(md.getColumnTypeName(c)) });
      }
      var rows = [];
      var truncated = false;
      var cut = { cells: 0 };
      while (rs.next()) {
        if (rows.length >= maxRows) {
          truncated = true;
          break;
        }
        var row = {};
        for (var k = 0; k < columns.length; k++) {
          row[columns[k].name] = S.cellValue(rs.getObject(k + 1), cut);
        }
        rows.push(row);
      }
      try {
        rs.close();
      } catch (_closedRs) {}
      return { columns: columns, rows: rows, rowCount: rows.length, truncated: truncated, cutCells: cut.cells, durationMs: Date.now() - started };
    } finally {
      if (st) {
        try {
          st.close();
        } catch (_closedSt) {}
      }
      try {
        jdbc.rollback();
      } catch (_noRollback) {}
    }
  };

  S.run = function (args) {
    args = args || {};
    var projectName = str(args.project);
    if (!projectName.length) {
      refuse("project is required: the project whose SQL connector holds the data.");
    }
    var project = null;
    try {
      project = Packages.com.twinsoft.convertigo.engine.Engine.theApp.databaseObjectsManager.getOriginalProjectByName(projectName);
    } catch (_missing) {
      project = null;
    }
    if (project == null) {
      refuse("project " + projectName + " is not loaded (project-list shows the loaded projects).");
    }
    var connectors = sqlConnectors(project);
    var names = connectors.map(function (c) { return String(c.getName()); });
    var wanted = str(args.connector);
    var connector = null;
    if (wanted.length) {
      connector = connectors.filter(function (c) { return String(c.getName()) === wanted; })[0] || null;
      if (!connector) {
        refuse("connector " + wanted + " is not an SQL connector of " + projectName + (names.length ? " (its SQL connectors: " + names.join(", ") + ")." : ": it has none."));
      }
    } else if (connectors.length === 1) {
      connector = connectors[0];
    } else if (connectors.filter(function (c) { return String(c.getName()) !== "void"; }).length === 1) {
      // The NGX starter ships a placeholder SqlConnector named void: the project's real connector is the other one.
      connector = connectors.filter(function (c) { return String(c.getName()) !== "void"; })[0];
    } else {
      refuse(names.length ? "connector is required: " + projectName + " has several SQL connectors (" + names.join(", ") + ")." : projectName + " has no SQL connector.");
    }
    var checked = S.check(args.sql);
    var maxRows = parseInt(str(args.maxRows), 10);
    if (!(maxRows > 0)) {
      maxRows = S.DEFAULT_ROWS;
    }
    maxRows = Math.min(maxRows, S.MAX_ROWS);
    var jdbc = null;
    var answer = null;
    try {
      try {
        java.lang.Class.forName(String(connector.getJdbcDriverClassName()));
      } catch (_driverLoaded) {}
      var user = "";
      var password = "";
      try { user = str(connector.getRealJdbcUserName()); } catch (_noUser) {}
      try { password = str(connector.getRealJdbcUserPassword()); } catch (_noPassword) {}
      jdbc = java.sql.DriverManager.getConnection(S.jdbcUrlOf(connector), user, password);
      answer = S.query(jdbc, checked.statement, maxRows);
    } catch (sqlError) {
      if (sqlError && sqlError.code === "invalid_arguments") {
        throw sqlError;
      }
      var message = String(sqlError && sqlError.message ? sqlError.message : sqlError);
      var error = new Error(TOOL + ": the database refused the statement: " + message.replace(/^[\w.]+Exception:\s*/, "") +
        " (nothing was changed; the connection is read-only).");
      error.code = "sql_error";
      throw error;
    } finally {
      if (jdbc) {
        try { jdbc.close(); } catch (_closed) {}
      }
    }
    var warnings = [];
    if (answer.truncated) {
      warnings.push("Only the first " + maxRows + " rows are returned: narrow the statement (WHERE, COUNT(*), GROUP BY) or give maxRows (" + S.MAX_ROWS + " at most).");
    }
    if (answer.cutCells) {
      warnings.push(answer.cutCells + " cell" + (answer.cutCells > 1 ? "s were" : " was") + " cut at " + S.MAX_CELL + " characters.");
    }
    return {
      status: "ok",
      project: projectName,
      connector: String(connector.getName()),
      statement: checked.statement,
      columns: answer.columns,
      rows: answer.rows,
      rowCount: answer.rowCount,
      truncated: answer.truncated,
      maxRows: maxRows,
      readOnly: true,
      durationMs: answer.durationMs,
      warnings: warnings,
      note: "Read on a read-only connection; nothing was saved in the project. The app reads its data through its own transactions and sequences."
    };
  };
})();
