/*
 * High-level generators: sql-transaction-create and facade-create (ngx-page-create is in js/tools_generators_ngx.js).
 * Most of a Convertigo business app follows the fixed patterns of convertigo_recipe_multipage_app,
 * convertigo_backend_sequences, convertigo_integration_sql and the "Basic presentation" section of
 * convertigo_frontend_ngx. These tools build those objects from a short spec in one call, with the
 * guides' rules built in, through the same batch engine as databaseobject-tree-apply.
 * Every tool validates the whole spec before writing, creates all or nothing (objects created before
 * a failure are deleted) and returns the QNames it created.
 */
if (typeof C8O === "undefined" || typeof C8O.dbo === "undefined") {
  include("js/databaseobject.js");
}
include("js/databaseobject_batch.js");
include("js/sql_dialect.js");
C8O.generators = C8O.generators || {};

(function () {
  var G = C8O.generators;
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;

  // --- input helpers ---------------------------------------------------------------------------

  function str(value) {
    return value == null ? "" : String(value).trim();
  }

  function isObj(value) {
    return Object.prototype.toString.call(value) === "[object Object]";
  }

  // Tool variables arrive as Java strings (typeof "object") or as already parsed JS values.
  function parseJson(value, label, expected) {
    if (value == null || str(value) === "") {
      return undefined;
    }
    var parsed = value;
    if (!isObj(value) && !Array.isArray(value)) {
      try {
        parsed = JSON.parse(String(value));
      } catch (_invalid) {
        if (expected === "string") {
          return String(value);
        }
        throw new Error(label + " must be JSON (" + expected + ").");
      }
    }
    if (expected === "object" && !isObj(parsed)) {
      throw new Error(label + " must be a JSON object.");
    }
    if (expected === "array" && !Array.isArray(parsed)) {
      throw new Error(label + " must be a JSON array.");
    }
    return parsed;
  }

  function bool(value, fallback) {
    var text = str(value).toLowerCase();
    if (text === "true" || text === "1" || text === "yes") {
      return true;
    }
    if (text === "false" || text === "0" || text === "no") {
      return false;
    }
    return fallback;
  }

  function list(value) {
    if (value == null || value === "") {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  }

  var IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
  var CAMEL = /^[a-z][A-Za-z0-9]*$/;

  function camelOf(column) {
    var last = String(column).split(".").pop().replace(/["`\[\]]/g, "");
    var parts = last.toLowerCase().split(/_+/);
    var out = parts[0];
    for (var i = 1; i < parts.length; i++) {
      if (parts[i].length) {
        out += parts[i].charAt(0).toUpperCase() + parts[i].substring(1);
      }
    }
    return out;
  }

  function upperFirst(text) {
    return text.charAt(0).toUpperCase() + text.substring(1);
  }

  function lowerFirst(text) {
    return text.charAt(0).toLowerCase() + text.substring(1);
  }

  // A JS string literal for generated step code and TypeScript expressions.
  function jsString(value) {
    return "'" + String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\r?\n/g, "\\n") + "'";
  }

  function lookup(qname) {
    return C8O.dbo.resolve(qname, { optional: true });
  }

  function qnameOf(dbo) {
    try {
      return String(dbo.getQName());
    } catch (_ignore) {
      return String(dbo.getName());
    }
  }

  function childNamed(parent, name) {
    var all = null;
    try {
      all = parent.getAllChildren ? parent.getAllChildren() : null;
    } catch (_ignore) {
      all = null;
    }
    if (!all) {
      return lookup(qnameOf(parent) + "." + name);
    }
    for (var i = 0; i < all.size(); i++) {
      if (String(all.get(i).getName()) === String(name)) {
        return all.get(i);
      }
    }
    return null;
  }

  function invalid(tool, errors) {
    var error = new Error(tool + ": invalid spec, nothing was created.\n- " + errors.join("\n- "));
    error.code = "invalid_spec";
    throw error;
  }

  function projectOf(project, tool) {
    var name = str(project);
    if (!name.length) {
      invalid(tool, ["project is required."]);
    }
    var dbo = null;
    try {
      dbo = Engine.theApp.databaseObjectsManager.getOriginalProjectByName(name);
    } catch (_missing) {
      dbo = null;
    }
    if (dbo == null) {
      invalid(tool, ["project " + name + " is not loaded (project-list shows the loaded projects)."]);
    }
    return dbo;
  }

  function variableNames(requestable) {
    var names = [];
    try {
      var vars = requestable.getVariablesList();
      for (var i = 0; i < vars.size(); i++) {
        names.push(String(vars.get(i).getName()));
      }
    } catch (_ignore) {}
    return names;
  }

  function readProjectJs(projectDbo, path) {
    var file = new java.io.File(projectDbo.getDirPath(), path);
    if (!file.isFile()) {
      return null;
    }
    return String(new java.lang.String(java.nio.file.Files.readAllBytes(file.toPath()), "UTF-8"));
  }

  // --- all-or-nothing apply ----------------------------------------------------------------------

  function batchErrors(result) {
    var messages = [];
    var ops = result && result.operations ? result.operations : [];
    for (var i = 0; i < ops.length; i++) {
      var errs = ops[i] && ops[i].errors ? ops[i].errors : [];
      for (var j = 0; j < errs.length; j++) {
        messages.push(String(errs[j].message || errs[j]));
      }
    }
    var globals = result && result.errors ? result.errors : [];
    for (var k = 0; k < globals.length; k++) {
      var text = String(globals[k].message || globals[k]);
      if (messages.indexOf(text) < 0) {
        messages.push(text);
      }
    }
    return messages;
  }

  function batchWarnings(result) {
    return result && result.warnings ? result.warnings.map(function (w) { return String(w); }) : [];
  }

  // A session collects created roots; rollback deletes them in reverse order.
  function Session(tool, projectDbo) {
    this.tool = tool;
    this.project = projectDbo;
    this.created = [];
    this.warnings = [];
  }

  Session.prototype.create = function (parentQName, node) {
    var op = { type: "create", opId: "gen_" + this.created.length, related: parentQName, mode: "inside",
      className: node.className, name: node.name };
    if (node.properties !== undefined) {
      op.properties = node.properties;
    }
    if (node.children && node.children.length) {
      op.children = node.children;
    }
    if (node.importVariables === true) {
      op.importVariables = true;
    }
    var result = C8O.dbo.batchApply({ target: parentQName, operations: [op], onError: "stop", autoSave: false,
      triggerMobileBuilder: false });
    var failed = !result || result.status === "failed" || (result.summary && (result.summary.failedOps > 0 || result.summary.partialOps > 0)) ||
      (result.errors && result.errors.length > 0);
    if (failed) {
      var messages = batchErrors(result);
      this.rollback();
      var error = new Error(this.tool + ": creating " + node.name + " under " + parentQName + " failed: " +
        (messages.join(" | ") || (result && result.message) || "unknown error") + " Nothing was kept: every object this call created was removed.");
      error.code = "generation_failed";
      throw error;
    }
    var warnings = batchWarnings(result);
    for (var w = 0; w < warnings.length; w++) {
      this.warnings.push(warnings[w]);
    }
    var parent = C8O.dbo.resolve(parentQName);
    var created = childNamed(parent, node.name);
    var qname = created ? qnameOf(created) : parentQName + "." + node.name;
    this.created.push(qname);
    return created;
  };

  Session.prototype.rollback = function () {
    for (var i = this.created.length - 1; i >= 0; i--) {
      try {
        C8O.dbo.batchApply({ operations: [{ type: "delete", qname: this.created[i] }], onError: "continue", autoSave: false,
          triggerMobileBuilder: false });
      } catch (_ignoreRollback) {}
    }
    this.created = [];
  };

  Session.prototype.finish = function (refreshDbo) {
    var errors = [];
    var save = C8O.dbo.saveProject(this.project, errors);
    var refreshed = null;
    try {
      refreshed = C8O.dbo.refreshStudioTreeByQName(String(this.project.getName()), errors);
    } catch (_ignoreRefresh) {}
    var builder = null;
    if (refreshDbo) {
      try {
        builder = C8O.dbo.triggerMobileBuilderRefresh(refreshDbo, errors);
      } catch (_ignoreBuilder) {}
    }
    for (var i = 0; i < errors.length; i++) {
      this.warnings.push(String(errors[i].message || errors[i]));
    }
    return { saved: !!(save && save.saved), mobileBuilder: builder && builder.triggered === true ? "triggered" : "" };
  };

  // --- SQL rules ---------------------------------------------------------------------------------

  // Top-level comma split of a SELECT list (parentheses and quotes respected).
  function splitTopLevel(text, separator) {
    var parts = [];
    var depth = 0;
    var quote = "";
    var current = "";
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (quote) {
        current += ch;
        if (ch === quote) {
          quote = "";
        }
        continue;
      }
      if (ch === "'" || ch === "\"") {
        quote = ch;
      } else if (ch === "(") {
        depth++;
      } else if (ch === ")") {
        depth--;
      } else if (ch === separator && depth === 0) {
        parts.push(current);
        current = "";
        continue;
      }
      current += ch;
    }
    if (current.trim().length) {
      parts.push(current);
    }
    return parts;
  }

  // Index of a top-level keyword (outside parentheses and quotes), or -1.
  function topLevelKeyword(text, keyword, from) {
    var depth = 0;
    var quote = "";
    var re = new RegExp("^" + keyword + "\\b", "i");
    for (var i = from || 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (quote) {
        if (ch === quote) {
          quote = "";
        }
        continue;
      }
      if (ch === "'" || ch === "\"") {
        quote = ch;
      } else if (ch === "(") {
        depth++;
      } else if (ch === ")") {
        depth--;
      } else if (depth === 0 && /\s/.test(text.charAt(i - 1) || " ") && re.test(text.substring(i))) {
        return i;
      }
    }
    return -1;
  }

  // The rules of convertigo_integration_sql, as errors (the statement would misbehave) and warnings.
  G.lintSql = function (sql, dialect) {
    var D = C8O.sqlDialect;
    dialect = dialect || "";
    var errors = [];
    var warnings = [];
    var statements = splitTopLevel(String(sql), ";").map(function (s) { return s.trim(); }).filter(function (s) { return s.length; });
    if (!statements.length) {
      errors.push("sql is empty.");
    }
    // {x} inside a string literal with other text: bound as a parameter the driver does not see.
    var literalRe = /'((?:[^']|'')*)'/g;
    var m;
    while ((m = literalRe.exec(String(sql))) !== null) {
      if (/\{[A-Za-z_]\w*\}/.test(m[1]) && !/^\{[A-Za-z_]\w*\}$/.test(m[1])) {
        errors.push("'" + m[1] + "' puts a {variable} inside a string literal: the call fails with parameter index out of range. Concatenate: " + D.likePrefix(dialect, "x") + ".");
      }
    }
    var dateMath = D.dateMath(dialect, sql);
    if (dateMath) {
      errors.push(dateMath.expression + " adds a bare number to a date: " + dateMath.message + ". Write " + dateMath.fix + ".");
    }
    var isNull = /\{([A-Za-z_]\w*)\}\s+IS\s+(NOT\s+)?NULL/i.exec(String(sql));
    if (isNull) {
      errors.push("{" + isNull[1] + "} IS NULL is never true: an absent variable is an empty string. Write the optional filter ({" + isNull[1] + "} = '' OR col = {" + isNull[1] + "}).");
    }
    var inList = /\bIN\s*\(\s*\{([A-Za-z_]\w*)\}\s*\)/i.exec(String(sql));
    if (inList) {
      errors.push("IN ({" + inList[1] + "}) binds one value, never a list. Pass a comma-separated string and test ({" + inList[1] + "} = '' OR " + D.inList(dialect, "col", "{" + inList[1] + "}") + ").");
    }
    if (/\{\{[A-Za-z_]\w*\}\}/.test(String(sql))) {
      warnings.push("{{variable}} is raw text substitution (an injection point): keep it for identifiers or computed clauses, never for user input.");
    }
    for (var s = 0; s < statements.length; s++) {
      var statement = statements[s];
      if (!/^\s*(SELECT|WITH)\b/i.test(statement)) {
        continue;
      }
      var selectAt = topLevelKeyword(statement, "SELECT", 0);
      var fromAt = topLevelKeyword(statement, "FROM", selectAt + 6);
      if (selectAt < 0) {
        continue;
      }
      var selectList = statement.substring(selectAt + 6, fromAt < 0 ? statement.length : fromAt).replace(/^\s*DISTINCT\b/i, "");
      var items = splitTopLevel(selectList, ",");
      var bad = [];
      for (var i = 0; i < items.length; i++) {
        var item = items[i].trim();
        if (item === "*" || /\.\*$/.test(item)) {
          errors.push("SELECT " + item + " returns driver-cased keys: list the columns with quoted camelCase aliases.");
          continue;
        }
        var alias = /\bAS\s+"([^"]+)"\s*$/i.exec(item);
        if (!alias) {
          var column = item.replace(/\s+AS\s+\w+\s*$/i, "");
          bad.push(item + " -> " + column + " AS \"" + camelOf(column) + "\"");
        } else if (!CAMEL.test(alias[1])) {
          bad.push(item + " (alias \"" + alias[1] + "\" is not camelCase)");
        }
      }
      if (bad.length) {
        var folding = D.aliasFolding(dialect);
        errors.push("every selected column needs a quoted camelCase alias (" + (folding ? (D.name(dialect) || "the database") + " " + folding +
          " unquoted names in sql_output" : "the facade reads camelCase keys") + "): " + bad.join("; ") + ".");
      }
    }
    return { errors: errors, warnings: warnings, statements: statements.length };
  };

  var FILTER_OPS = { "=": 1, "<>": 1, "<": 1, "<=": 1, ">": 1, ">=": 1, contains: 1, startsWith: 1, "in": 1, bool: 1 };

  function filterSql(filter, errors, label, dialect) {
    var D = C8O.sqlDialect;
    if (filter.sql !== undefined) {
      return "(" + str(filter.sql) + ")";
    }
    var variable = str(filter.variable || filter["var"]);
    var op = str(filter.op || "=");
    var columns = list(filter.columns || filter.column).map(str).filter(function (c) { return c.length; });
    if (!IDENT.test(variable)) {
      errors.push(label + ".variable must be an identifier.");
      return "";
    }
    if (!FILTER_OPS[op]) {
      errors.push(label + ".op must be one of " + Object.keys(FILTER_OPS).join(", ") + ".");
      return "";
    }
    if (!columns.length) {
      errors.push(label + " needs column (or columns for contains).");
      return "";
    }
    var v = "{" + variable + "}";
    var tests = columns.map(function (col) {
      if (op === "contains") {
        return "LOWER(COALESCE(" + D.text(dialect, col, 4000) + ", '')) LIKE " + D.concat(dialect, ["'%'", "LOWER(" + v + ")", "'%'"]);
      }
      if (op === "startsWith") {
        return "LOWER(" + col + ") LIKE " + D.concat(dialect, ["LOWER(" + v + ")", "'%'"]);
      }
      if (op === "in") {
        return D.inList(dialect, col, v);
      }
      if (op === "bool") {
        return col + " = (" + v + " = 'true')";
      }
      return col + " " + op + " " + v;
    });
    var test = tests.length > 1 ? "(" + tests.join(" OR ") + ")" : tests[0];
    return filter.required === true ? "(" + test + ")" : "(" + v + " = '' OR " + test + ")";
  }

  // Builds the SQL of a structured select/insert/update/delete spec.
  G.buildSql = function (spec, errors, label, dialect) {
    if (spec.select) {
      var sel = spec.select;
      var from = str(sel.from);
      if (!from.length) {
        errors.push(label + ".select.from is required.");
      }
      var cols = [];
      if (isObj(sel.columns)) {
        Object.keys(sel.columns).forEach(function (alias) {
          if (!CAMEL.test(alias)) {
            errors.push(label + ".select.columns key " + alias + " must be camelCase (it is the key the facade reads).");
          }
          cols.push(str(sel.columns[alias]) + " AS \"" + alias + "\"");
        });
      } else if (Array.isArray(sel.columns)) {
        sel.columns.forEach(function (column) {
          cols.push(str(column) + " AS \"" + camelOf(column) + "\"");
        });
      }
      if (!cols.length) {
        errors.push(label + ".select.columns is required: an object {alias: expression} or an array of columns.");
      }
      var where = list(sel.where).map(function (f, i) { return filterSql(isObj(f) ? f : { sql: f }, errors, label + ".select.where[" + i + "]", dialect); });
      var sql = "SELECT " + cols.join(", ") + "\nFROM " + from;
      if (where.length) {
        sql += "\nWHERE " + where.join("\n  AND ");
      }
      if (str(sel.groupBy).length) {
        sql += "\nGROUP BY " + str(sel.groupBy);
      }
      if (str(sel.orderBy).length) {
        sql += "\nORDER BY " + str(sel.orderBy);
      }
      if (sel.limit != null && str(sel.limit).length) {
        if (!/^\d+$/.test(str(sel.limit))) {
          errors.push(label + ".select.limit must be a number.");
        }
        var limit = C8O.sqlDialect.limit(dialect, str(sel.limit), str(sel.orderBy).length > 0);
        if (limit === null) {
          errors.push(label + ".select.limit needs orderBy on SQL Server (OFFSET ... FETCH follows an ORDER BY).");
        } else {
          sql += "\n" + limit;
        }
      }
      return sql;
    }
    var valueOf = function (value, where) {
      if (isObj(value) && value.sql !== undefined) {
        return str(value.sql);
      }
      var name = str(value);
      if (!IDENT.test(name)) {
        errors.push(where + " must be a variable name or {sql:\"...\"}.");
      }
      return "{" + name + "}";
    };
    var conditions = function (map, where) {
      if (!isObj(map) || !Object.keys(map).length) {
        errors.push(where + " is required (an object {column: variable}).");
        return "";
      }
      return Object.keys(map).map(function (col) { return col + " = " + valueOf(map[col], where + "." + col); }).join(" AND ");
    };
    if (spec.insert) {
      var ins = spec.insert;
      if (!isObj(ins.values) || !Object.keys(ins.values).length) {
        errors.push(label + ".insert.values is required (an object {column: variable}).");
        return "";
      }
      var columns = Object.keys(ins.values);
      return "INSERT INTO " + str(ins.table) + " (" + columns.join(", ") + ")\nVALUES (" +
        columns.map(function (c) { return valueOf(ins.values[c], label + ".insert.values." + c); }).join(", ") + ")";
    }
    if (spec.update) {
      var upd = spec.update;
      if (!isObj(upd.set) || !Object.keys(upd.set).length) {
        errors.push(label + ".update.set is required (an object {column: variable}).");
        return "";
      }
      return "UPDATE " + str(upd.table) + " SET " + Object.keys(upd.set).map(function (c) {
        return c + " = " + valueOf(upd.set[c], label + ".update.set." + c);
      }).join(", ") + "\nWHERE " + conditions(upd.where, label + ".update.where");
    }
    if (spec["delete"] || spec.deleteFrom) {
      var del = spec["delete"] || spec.deleteFrom;
      return "DELETE FROM " + str(del.table) + "\nWHERE " + conditions(del.where, label + ".delete.where");
    }
    errors.push(label + " needs sql, or one of select, insert, update, delete.");
    return "";
  };

  function sqlVariables(sql) {
    var names = [];
    var re = /\{\{?([A-Za-z_]\w*)\}?\}/g;
    var m;
    while ((m = re.exec(sql)) !== null) {
      if (names.indexOf(m[1]) < 0) {
        names.push(m[1]);
      }
    }
    return names;
  }

  function findConnector(projectDbo, connectorName, errors, label) {
    var name = str(connectorName);
    var connectors = projectDbo.getConnectorsList();
    var sqlConnectors = [];
    for (var i = 0; i < connectors.size(); i++) {
      var c = connectors.get(i);
      if (/SqlConnector$/.test(String(c.getClass().getName()))) {
        sqlConnectors.push(c);
        if (String(c.getName()) === name) {
          return c;
        }
      }
    }
    if (!name.length && sqlConnectors.length === 1) {
      return sqlConnectors[0];
    }
    errors.push(label + (name.length ? ": no SqlConnector named " + name : ": connector is required (the project has " +
      sqlConnectors.length + " SqlConnector)") + " in " + String(projectDbo.getName()) + ".");
    return null;
  }

  // Validates one transaction spec and returns its creation plan (no write).
  function planTransaction(projectDbo, spec, errors, warnings, label, defaultConnector) {
    var name = str(spec.name || spec.transaction);
    if (!IDENT.test(name)) {
      errors.push(label + ".name must be an identifier (q_* for reads, w_* for writes).");
    }
    var connector = findConnector(projectDbo, spec.connector || defaultConnector, errors, label);
    var dialect = C8O.sqlDialect.of(connector);
    var sql = spec.sql !== undefined ? str(spec.sql) : G.buildSql(spec, errors, label, dialect);
    var lint = G.lintSql(sql, dialect);
    lint.errors.forEach(function (e) { errors.push(label + ": " + e); });
    lint.warnings.forEach(function (w) { warnings.push(label + ": " + w); });
    var kind = /^\s*(SELECT|WITH)\b/i.test(sql) ? "read" : "write";
    if (/^q_/.test(name) && kind !== "read") {
      warnings.push(label + ": " + name + " is named as a read (q_) but its SQL writes.");
    }
    if (/^w_/.test(name) && kind === "read") {
      warnings.push(label + ": " + name + " is named as a write (w_) but its SQL reads.");
    }
    var declared = sqlVariables(sql);
    var children = [];
    var vars = spec.variables;
    if (vars !== undefined && !isObj(vars)) {
      errors.push(label + ".variables must be an object {name: {value, description}} or {name: defaultValue}.");
      vars = {};
    }
    Object.keys(vars || {}).forEach(function (vn) {
      if (declared.indexOf(vn) < 0) {
        errors.push(label + ".variables." + vn + " is not used in the SQL ({" + vn + "}).");
        return;
      }
      var v = isObj(vars[vn]) ? vars[vn] : { value: vars[vn] };
      var props = { description: str(v.description) || vn };
      if (v.value !== undefined && v.value !== null) {
        props.value = String(v.value);
      }
      children.push({ className: "variables.RequestableVariable", name: vn, properties: props });
    });
    var props = { sqlQuery: sql };
    var autoCommit = spec.autoCommit;
    if (autoCommit === undefined && lint.statements > 1 && kind === "write") {
      autoCommit = 2;
    }
    if (autoCommit !== undefined) {
      if (["0", "1", "2"].indexOf(String(autoCommit)) < 0) {
        errors.push(label + ".autoCommit must be 0, 1 or 2.");
      }
      props.autoCommit = String(autoCommit);
    }
    if (spec.maxResult !== undefined) {
      props.maxResult = String(spec.maxResult);
    }
    if (str(spec.comment).length) {
      props.comment = str(spec.comment);
    }
    var existing = connector && name.length ? childNamed(connector, name) : null;
    return {
      name: name,
      connector: connector,
      connectorQName: connector ? qnameOf(connector) : "",
      sql: sql,
      kind: kind,
      variables: declared,
      exists: existing != null,
      existing: existing,
      node: { className: "transactions.SqlTransaction", name: name, properties: props, children: children }
    };
  }

  function createTransaction(session, plan, ifExists) {
    if (plan.exists) {
      if (ifExists !== "replace") {
        return null;
      }
      // Replace in place: the SQL and the variables are rewritten, callers keep their reference.
      var result = C8O.dbo.batchApply({ target: qnameOf(plan.existing), operations: [{ type: "upsertTree", qname: qnameOf(plan.existing),
        patch: { properties: plan.node.properties, children: plan.node.children }, strategy: "merge" }], onError: "stop", autoSave: false,
        triggerMobileBuilder: false });
      if (!result || result.status === "failed" || (result.errors && result.errors.length)) {
        session.rollback();
        throw new Error(session.tool + ": replacing " + plan.name + " failed: " + batchErrors(result).join(" | "));
      }
      batchWarnings(result).forEach(function (w) { session.warnings.push(w); });
      return plan.existing;
    }
    return session.create(plan.connectorQName, plan.node);
  }

  G.sqlTransactionCreate = function (args) {
    var tool = "sql-transaction-create";
    var projectDbo = projectOf(args.project, tool);
    var errors = [];
    var warnings = [];
    var specs = args.transactions !== undefined ? parseJson(args.transactions, "transactions", "array") : null;
    if (!specs) {
      var one = {};
      ["name", "connector", "sql", "variables", "autoCommit", "maxResult", "comment"].forEach(function (k) {
        if (args[k] !== undefined && args[k] !== null && str(args[k]) !== "") {
          one[k] = args[k];
        }
      });
      ["select", "insert", "update", "delete"].forEach(function (k) {
        var parsed = parseJson(args[k], k, "object");
        if (parsed) {
          one[k] = parsed;
        }
      });
      if (one.variables !== undefined) {
        one.variables = parseJson(one.variables, "variables", "object");
      }
      specs = [one];
    }
    var ifExists = (str(args.ifExists) || "fail");
    if (["fail", "replace", "keep"].indexOf(ifExists) < 0) {
      errors.push("ifExists must be fail, replace or keep.");
    }
    var plans = specs.map(function (spec, i) {
      return planTransaction(projectDbo, isObj(spec) ? spec : {}, errors, warnings, specs.length > 1 ? "transactions[" + i + "]" : "transaction",
        args.connector);
    });
    plans.forEach(function (p) {
      if (p.exists && ifExists === "fail") {
        errors.push(p.name + " already exists in " + p.connectorQName + ": pass ifExists:\"replace\" to rewrite its SQL, or \"keep\".");
      }
    });
    if (errors.length) {
      invalid(tool, errors);
    }
    var session = new Session(tool, projectDbo);
    var out = [];
    plans.forEach(function (p) {
      var dbo = createTransaction(session, p, ifExists);
      out.push({ qname: dbo ? qnameOf(dbo) : qnameOf(p.existing), status: p.exists ? (dbo ? "replaced" : "kept") : "created",
        kind: p.kind, variables: dbo ? variableNames(dbo) : p.variables, sql: p.sql });
    });
    var finish = session.finish(null);
    return {
      status: "ok",
      project: String(projectDbo.getName()),
      transactions: out,
      created: session.created,
      saved: finish.saved,
      warnings: warnings.concat(session.warnings),
      next: "Prove each transaction with requestable-execute (" + out.map(function (t) { return t.qname; }).join(", ") + ") before wiring it in a facade."
    };
  };

  // --- facade ------------------------------------------------------------------------------------

  var FACADE_ERRORS = {
    unauthenticated: { code: "UNAUTHENTICATED", message: "Session missing or account inactive." },
    forbidden: { code: "FORBIDDEN", message: "Access denied." },
    notFound: { code: "NOT_FOUND", message: "Record not found." },
    readFailed: { code: "READ_FAILED", message: "A read failed." },
    writeFailed: { code: "WRITE_FAILED", message: "A write failed." },
    logic: { code: "LOGIC_FAILED", message: "The business function returned no response." }
  };

  function failExpr(entry, field) {
    return "{ success: false, data: null, errors: [{ code: " + jsString(entry.code) + ", message: " + jsString(entry.message) +
      ", field: " + (field ? field : "''") + " }], meta: {} }";
  }

  function smart(mode, expression) {
    return { mode: mode, expression: expression };
  }

  function outputStep(name, key, expression) {
    return { className: "steps.JsonToXmlStep", name: name, properties: { jsonObject: smart("JS", expression), key: smart("PLAIN", key) } };
  }

  function simple(name, expression, comment) {
    var node = { className: "steps.SimpleStep", name: name, properties: { expression: expression } };
    if (comment) {
      node.properties.comment = comment;
    }
    return node;
  }

  function transactionQName(projectName, connectorName, transaction) {
    return projectName + "." + connectorName + "." + transaction;
  }

  // Resolves a read or write entry: an existing transaction by name, or a new one from sql/select/insert...
  function planCall(projectDbo, entry, errors, warnings, label, defaultConnector, role) {
    if (!isObj(entry)) {
      errors.push(label + " must be an object.");
      return null;
    }
    var name = str(entry.name);
    var transaction = str(entry.transaction);
    var hasSql = entry.sql !== undefined || entry.select || entry.insert || entry.update || entry["delete"] || entry.deleteFrom;
    if (!name.length) {
      name = transaction.replace(/^[qw]_/, "");
    }
    if (!IDENT.test(name)) {
      errors.push(label + ".name must be an identifier (it names the steps and the rows in ctx.reads).");
    }
    var plan = { name: name, label: label, entry: entry, newTransaction: null, transaction: null, variables: [] };
    if (hasSql) {
      if (!transaction.length) {
        transaction = (role === "read" ? "q_" : "w_") + name;
      }
      var tplan = planTransaction(projectDbo, { name: transaction, connector: entry.connector || defaultConnector, sql: entry.sql,
        select: entry.select, insert: entry.insert, update: entry.update, "delete": entry["delete"] || entry.deleteFrom, variables: entry.variables,
        autoCommit: entry.autoCommit }, errors, warnings, label, defaultConnector);
      if (tplan.exists) {
        errors.push(label + ": " + transaction + " already exists in " + tplan.connectorQName + "; reference it with transaction:\"" + transaction +
          "\" (without sql) or use sql-transaction-create ifExists:\"replace\".");
      }
      plan.newTransaction = tplan;
      plan.qname = tplan.connectorQName + "." + transaction;
      plan.variables = tplan.variables;
      plan.kind = tplan.kind;
    } else {
      if (!transaction.length) {
        errors.push(label + " needs transaction (an existing SqlTransaction name) or sql/select/insert/update/delete.");
        return plan;
      }
      var connector = findConnector(projectDbo, entry.connector || defaultConnector, errors, label);
      var dbo = connector ? childNamed(connector, transaction) : null;
      if (connector && !dbo) {
        errors.push(label + ": no transaction " + transaction + " in " + qnameOf(connector) + ".");
      }
      plan.transaction = dbo;
      plan.qname = dbo ? qnameOf(dbo) : "";
      plan.variables = dbo ? variableNames(dbo) : [];
    }
    plan.transactionName = transaction;
    if (entry.vars !== undefined) {
      if (!isObj(entry.vars)) {
        errors.push(label + ".vars must be an object {variable: \"JS expression\"}.");
      } else {
        Object.keys(entry.vars).forEach(function (v) {
          if (plan.variables.length && plan.variables.indexOf(v) < 0) {
            errors.push(label + ".vars." + v + " is not a variable of " + transaction + " (" + plan.variables.join(", ") + ").");
          }
        });
      }
    }
    return plan;
  }

  G.facadeCreate = function (args) {
    var tool = "facade-create";
    var projectDbo = projectOf(args.project, tool);
    var projectName = String(projectDbo.getName());
    var errors = [];
    var warnings = [];
    var name = str(args.name);
    if (!IDENT.test(name)) {
      errors.push("name must be an identifier (for example order_list).");
    } else if (childNamed(projectDbo, name)) {
      errors.push("sequence " + projectName + "." + name + " already exists: delete it first, or pick another name.");
    }
    var script = (str(args.script) || "js/app.js");
    var logic = str(args.logic);
    var content = readProjectJs(projectDbo, script);
    if (content === null) {
      errors.push(script + " does not exist in " + projectName + ": write it first with project-js-set (the business rules, " +
        "one namespace object such as var App = (function () { ... return {...}; })();).");
    }
    if (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(logic)) {
      errors.push("logic must be the JS function to call, for example App.orderList (defined in " + script + ").");
    } else if (content !== null && content.indexOf(logic.split(".").pop()) < 0) {
      errors.push("logic " + logic + " is not found in " + script + ": add the function first. It receives ctx = {me, input, reads, today} and returns " +
        "{success, data, errors, meta} (optionally writes: {<write name>: row or [rows]}).");
    }
    var inputs = list(parseJson(args.inputs, "inputs", "array")).map(function (v, i) {
      var input = isObj(v) ? v : { name: str(v) };
      if (!IDENT.test(str(input.name))) {
        errors.push("inputs[" + i + "] must be a variable name or {name, value, description}.");
      }
      return input;
    });
    var authOff = args.auth === false || str(args.auth) === "false";
    var auth = authOff ? { required: false } : parseJson(args.auth, "auth", "object");
    var authRequired = !(auth && auth.required === false);
    auth = auth || {};
    var roles = list(auth.roles || parseJson(args.roles, "roles", "array")).map(str).filter(function (r) { return r.length; });
    var messages = parseJson(args.errors, "errors", "object") || {};
    var codes = {};
    Object.keys(FACADE_ERRORS).forEach(function (k) {
      var custom = messages[k];
      codes[k] = {
        code: custom && custom.code ? str(custom.code) : FACADE_ERRORS[k].code,
        message: custom && custom.message ? str(custom.message) : (typeof custom === "string" ? custom : FACADE_ERRORS[k].message)
      };
    });
    var connectorName = str(args.connector);
    var userPlan = null;
    if (authRequired) {
      userPlan = planCall(projectDbo, { name: "me", transaction: str(auth.userTransaction || "q_user_by_email") }, errors, warnings, "auth.userTransaction",
        connectorName, "read");
    }
    var emailVar = str(auth.emailVariable || "email");
    var roleField = str(auth.roleField || "role");
    // No default column: a user table without it would refuse every call as a lost session.
    var activeField = str(auth.activeField);
    var reads = list(parseJson(args.reads, "reads", "array")).map(function (r, i) {
      return planCall(projectDbo, r, errors, warnings, "reads[" + i + "]", connectorName, "read");
    }).filter(function (p) { return p; });
    var writes = list(parseJson(args.writes, "writes", "array")).map(function (w, i) {
      return planCall(projectDbo, w, errors, warnings, "writes[" + i + "]", connectorName, "write");
    }).filter(function (p) { return p; });
    var seen = {};
    reads.concat(writes).forEach(function (p) {
      if (seen[p.name]) {
        errors.push(p.label + ": the name " + p.name + " is used twice; give each read and write its own name.");
      }
      seen[p.name] = true;
    });
    var newTransactions = {};
    reads.concat(writes).forEach(function (p) {
      if (p.newTransaction) {
        if (newTransactions[p.qname]) {
          errors.push(p.label + ": transaction " + p.transactionName + " is created twice in this spec.");
        }
        newTransactions[p.qname] = true;
      }
    });
    reads.forEach(function (p) {
      var per = p.entry.perimeter;
      if (per !== undefined) {
        if (!isObj(per) || !str(per.field).length) {
          errors.push(p.label + ".perimeter must be {field, userField?, bypassRoles?, mode?: filter|deny}.");
        } else if (per.mode !== undefined && ["filter", "deny"].indexOf(str(per.mode)) < 0) {
          errors.push(p.label + ".perimeter.mode must be filter (drop out-of-perimeter rows) or deny (refuse the call).");
        }
        if (!authRequired) {
          errors.push(p.label + ".perimeter needs an authenticated facade (auth is off).");
        }
      }
    });
    var accessibility = (str(args.accessibility) || "Hidden");
    if (["Hidden", "Private", "Public"].indexOf(accessibility) < 0) {
      errors.push("accessibility must be Hidden (default, called by the app), Private or Public.");
    }
    if (errors.length) {
      invalid(tool, errors);
    }

    var inputNames = inputs.map(function (i) { return str(i.name); });
    var steps = [];
    // init: include, inputs as JS strings, session user.
    var init = ["include(\"" + script + "\");"];
    inputNames.forEach(function (n) {
      init.push("if (typeof " + n + " === \"undefined\" || " + n + " === null) { " + n + " = \"\"; } " + n + " = String(" + n + ");");
    });
    init.push("resp = null; me = null; reads = {}; written = {};");
    init.push("facadeInput = {" + inputNames.map(function (n) { return n + ": " + n; }).join(", ") + "};");
    if (authRequired) {
      init.push("var sessionEmail = String(context.getAuthenticatedUser() || \"\");");
      init.push("var " + emailVar + " = sessionEmail;");
    }
    steps.push(simple("init", init.join("\n"), "Generated by facade-create: include, inputs, session user."));
    if (authRequired) {
      steps.push({ className: "steps.TransactionStep", name: "callMe", properties: { sourceTransaction: userPlan.qname }, importVariables: true });
      steps.push({ className: "steps.JsonSourceStep", name: "srcMe", properties: { sourceDefinition: { step: "callMe", xpath: "./document/sql_output" },
        variableName: "meRows" } });
      var authCode = ["me = (meRows && meRows.length) ? meRows[0] : null;"];
      var active = activeField.length ? " || !(me." + activeField + " === true || String(me." + activeField + ") === \"true\")" : "";
      authCode.push("if (!me" + active + ") { resp = " + failExpr(codes.unauthenticated) + "; }");
      if (roles.length) {
        authCode.push("else if (" + JSON.stringify(roles) + ".indexOf(String(me." + roleField + ")) < 0) { resp = " + failExpr(codes.forbidden) + "; }");
      }
      steps.push(simple("auth", authCode.join("\n"), "Role check on the user reloaded from the database at every call."));
    }
    if (reads.length) {
      var readSteps = [];
      reads.forEach(function (p) {
        var vars = isObj(p.entry.vars) ? p.entry.vars : {};
        var assigns = Object.keys(vars).map(function (v) { return v + " = String(" + vars[v] + ");"; });
        if (assigns.length) {
          readSteps.push(simple("prep_" + p.name, assigns.join("\n")));
        }
        readSteps.push({ className: "steps.TransactionStep", name: "call_" + p.name, properties: { sourceTransaction: p.qname }, importVariables: true });
        readSteps.push({ className: "steps.JsonSourceStep", name: "src_" + p.name, properties: { sourceDefinition: { step: "call_" + p.name, xpath: "./document" },
          variableName: "doc_" + p.name } });
      });
      steps.push({ className: "steps.IfStep", name: "ifAllowed", properties: { condition: "resp === null" }, children: readSteps });
      // Rows into ctx.reads, read errors, perimeter checks.
      var guard = ["if (resp === null) {"];
      reads.forEach(function (p) {
        guard.push("  var d_" + p.name + " = (typeof doc_" + p.name + " !== \"undefined\" && doc_" + p.name + ") ? doc_" + p.name + ".document : null;");
        guard.push("  if (d_" + p.name + " && d_" + p.name + ".error) { resp = " + failExpr(codes.readFailed, "") +
          "; resp.errors[0].message += \" (" + p.name + ": \" + String(d_" + p.name + ".error.details || d_" + p.name + ".error.message) + \")\"; }");
        guard.push("  reads." + p.name + " = []; var s_" + p.name + " = d_" + p.name + " ? d_" + p.name + ".sql_output : null;");
        guard.push("  for (var i_" + p.name + " = 0; s_" + p.name + " && s_" + p.name + ".length !== undefined && i_" + p.name + " < s_" + p.name +
          ".length; i_" + p.name + "++) { reads." + p.name + ".push(s_" + p.name + "[i_" + p.name + "]); }");
        var per = p.entry.perimeter;
        if (per) {
          var bypass = list(per.bypassRoles).map(str);
          var userField = str(per.userField || "id");
          var cond = "String(r[" + jsString(str(per.field)) + "]) !== String(me[" + jsString(userField) + "])";
          var scoped = bypass.length ? "me && " + JSON.stringify(bypass) + ".indexOf(String(me." + roleField + ")) < 0" : "me";
          if (str(per.mode || "filter") === "deny") {
            guard.push("  if (resp === null && " + scoped + ") { for (var k_" + p.name + " = 0; k_" + p.name + " < reads." + p.name + ".length; k_" + p.name +
              "++) { var r = reads." + p.name + "[k_" + p.name + "]; if (" + cond + ") { resp = " + failExpr(codes.forbidden) + "; reads." + p.name +
              " = []; break; } } }");
          } else {
            guard.push("  if (" + scoped + ") { reads." + p.name + " = reads." + p.name + ".filter(function (r) { return !(" + cond + "); }); }");
          }
        }
        if (p.entry.required === true) {
          guard.push("  if (resp === null && reads." + p.name + ".length === 0) { resp = " + failExpr(codes.notFound) + "; }");
        }
      });
      guard.push("}");
      steps.push(simple("guard", guard.join("\n"), "Read errors, perimeter (out-of-perimeter rows are never returned) and required records."));
    }
    var logicCode = [
      "if (resp === null) {",
      "  resp = " + logic + "({ me: me, input: facadeInput, reads: reads, today: new Date() });",
      "  if (!resp || resp.success === undefined) { resp = " + failExpr(codes.logic) + "; }",
      "}",
      "pending = (resp && resp.success === true && resp.writes) ? resp.writes : {};",
      "if (resp && resp.writes !== undefined) { delete resp.writes; }"
    ];
    writes.forEach(function (p) {
      logicCode.push("rows_" + p.name + " = pending." + p.name + " == null ? [] : (pending." + p.name + ".length !== undefined ? pending." + p.name + " : [pending." +
        p.name + "]); written." + p.name + " = 0;");
    });
    steps.push(simple("logic", logicCode.join("\n"), "Business rules in " + logic + " (" + script + ")."));
    writes.forEach(function (p) {
      var assign = p.variables.map(function (v) {
        return v + " = (item." + v + " === undefined || item." + v + " === null) ? \"\" : String(item." + v + ");";
      });
      var check = "var d_w = (typeof docW_" + p.name + " !== \"undefined\" && docW_" + p.name + ") ? docW_" + p.name + ".document : null;\n" +
        "if (d_w && d_w.error) { resp = " + failExpr(codes.writeFailed, "") + "; resp.errors[0].message += \" (" + p.name +
        ": \" + String(d_w.error.details || d_w.error.message) + \")\"; } else { written." + p.name + "++; }";
      steps.push({ className: "steps.IfStep", name: "ifWrite_" + p.name, properties: { condition: "resp && resp.success === true && rows_" + p.name + ".length > 0" },
        children: [{ className: "steps.SimpleIteratorStep", name: "each_" + p.name, properties: { expression: "rows_" + p.name }, children: [
          simple("set_" + p.name, assign.join("\n") || "// no variable"),
          { className: "steps.IfStep", name: "ifOk_" + p.name, properties: { condition: "resp.success === true" }, children: [
            { className: "steps.TransactionStep", name: "callW_" + p.name, properties: { sourceTransaction: p.qname }, importVariables: true },
            { className: "steps.JsonSourceStep", name: "srcW_" + p.name, properties: { sourceDefinition: { step: "callW_" + p.name, xpath: "./document" },
              variableName: "docW_" + p.name } },
            simple("check_" + p.name, check)
          ] }
        ] }] });
    });
    steps.push(outputStep("outSuccess", "success", "(resp && resp.success) === true"));
    steps.push(outputStep("outData", "data", "resp ? (resp.data === undefined ? null : resp.data) : null"));
    steps.push(outputStep("outErrors", "errors", "resp && resp.errors ? resp.errors : []"));
    steps.push(outputStep("outMeta", "meta", "resp && resp.meta ? resp.meta : {}"));
    inputs.forEach(function (input) {
      var props = { description: str(input.description) || str(input.name) };
      if (input.value !== undefined && input.value !== null) {
        props.value = String(input.value);
      }
      steps.push({ className: "variables.RequestableVariable", name: str(input.name), properties: props });
    });
    var seqProps = { accessibility: accessibility, authenticatedContextRequired: authRequired };
    if (str(args.comment).length) {
      seqProps.comment = str(args.comment);
    }

    var session = new Session(tool, projectDbo);
    var transactions = [];
    reads.concat(writes).forEach(function (p) {
      if (p.newTransaction) {
        var dbo = createTransaction(session, p.newTransaction, "fail");
        p.variables = variableNames(dbo);
        transactions.push({ qname: qnameOf(dbo), variables: p.variables, sql: p.newTransaction.sql });
      }
    });
    // A write's set step assigns the variables the transaction really declares.
    writes.forEach(function (p, wi) {
      var stepNode = null;
      for (var s = 0; s < steps.length; s++) {
        if (steps[s].name === "ifWrite_" + p.name) {
          stepNode = steps[s].children[0].children[0];
        }
      }
      if (stepNode) {
        stepNode.properties.expression = p.variables.map(function (v) {
          return v + " = (item." + v + " === undefined || item." + v + " === null) ? \"\" : String(item." + v + ");";
        }).join("\n") || "// no variable";
      }
    });
    var seq = session.create(projectName, { className: "sequences.GenericSequence", name: name, properties: seqProps, children: steps });
    var finish = session.finish(null);
    var seqQName = qnameOf(seq);
    return {
      status: "ok",
      sequence: seqQName,
      created: session.created,
      transactionsCreated: transactions,
      contract: {
        inputs: inputNames,
        response: "{success, data, errors:[{code, message, field}], meta} (four JsonToXmlStep, top-level keys; pages read out?.success and out?.data)",
        logic: logic + "(ctx) with ctx = {me, input: {" + inputNames.join(", ") + "}, reads: {" + reads.map(function (r) { return r.name + ": [rows]"; }).join(", ") +
          "}, today}; return {success, data, errors, meta" + (writes.length ? ", writes: {" + writes.map(function (w) { return w.name + ": row or [rows] with " +
          w.variables.join(", "); }).join("; ") + "}" : "") + "}",
        errorCodes: Object.keys(codes).map(function (k) { return codes[k].code; }),
        roles: roles
      },
      saved: finish.saved,
      warnings: warnings.concat(session.warnings),
      next: authRequired
        ? "requestable-execute({requestable:\"" + projectName + "." + name + "\", authenticatedUser:\"<email>\", variables:{...}}) for each role, then one call out of perimeter."
        : "requestable-execute({requestable:\"" + projectName + "." + name + "\", variables:{...}})."
    };
  };

  // Shared with js/tools_generators_ngx.js.
  G._ = { str: str, isObj: isObj, parseJson: parseJson, bool: bool, list: list, IDENT: IDENT, CAMEL: CAMEL, jsString: jsString,
    upperFirst: upperFirst, lowerFirst: lowerFirst, lookup: lookup, qnameOf: qnameOf, childNamed: childNamed, invalid: invalid,
    projectOf: projectOf, variableNames: variableNames, batchErrors: batchErrors, batchWarnings: batchWarnings, Session: Session };
})();
