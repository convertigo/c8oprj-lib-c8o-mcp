/*
 * What a tree-apply changes in a sequence or a transaction, told while it changes it (js/tools_databaseobject_tree_apply.js):
 * - output: a change inside a requestable that existed before this conversation changes what its callers read. A measured
 *   run (17/11) asked for a new page over an existing sequence and "nothing else": the agent rebuilt the sequence's output
 *   and renamed its SQL aliases to fit its page. The answer names the pages and sequences that call it.
 * - access: a sequence created in this conversation that writes data and is still Public (the default of a new sequence)
 *   can be called by anyone; a seed made that way failed the security lint at the end of a run (17/11).
 * - existing: a tree-apply that writes inside a requestable that existed before this conversation is refused before it
 *   changes anything, until the call names it in changeExisting (once per conversation; the user asked for that change).
 *   Measured run (18/11): a page task changed an existing sequence 8 times through at:"after" and at:"self", each answer
 *   warned (the 5th one "STILL OPEN"), project-changes listed it, and the final report said nothing else was changed.
 * The output and access findings stay warnings: the user may have asked for the change.
 */
if (typeof C8O === "undefined") {
  var C8O = {};
}
C8O.requestableContract = C8O.requestableContract || {};

(function (api) {
  function str(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  // The requestable an object belongs to, from its QName: "P.sq:s.st:x" -> "P.sq:s", "P.cn:c.tr:t.v" -> "P.cn:c.tr:t".
  api.requestableOf = function (qname) {
    var match = /^([^.]+\.(?:sq:[^.]+|cn:[^.]+\.tr:[^.]+))(?:\.|$)/.exec(str(qname));
    return match ? match[1] : "";
  };

  // The runtime path callers use: "P.sq:s" -> "P.s", "P.cn:c.tr:t" -> "P.c.t".
  api.runtimeName = function (requestable) {
    return str(requestable).replace(/\.sq:/, ".").replace(/\.cn:([^.]+)\.tr:/, ".$1.");
  };

  // From the applied entries of a tree-apply (operations[].applied): {requestable: {inside, sql, created}}. A property of
  // the requestable itself counts only when it is its SQL (sqlQuery) or its declared variables: a comment or an
  // accessibility is not its output.
  api.touched = function (operations) {
    var out = {};
    (Array.isArray(operations) ? operations : []).forEach(function (op) {
      (op && Array.isArray(op.applied) ? op.applied : []).forEach(function (entry) {
        var qname = str(entry && entry.qname);
        var requestable = api.requestableOf(qname);
        if (!requestable.length) {
          return;
        }
        var info = out[requestable] || (out[requestable] = { inside: 0, sql: false, created: false });
        // one count per object: a create and the properties written on it are one change
        var seen = info.objects || (Object.defineProperty(info, "objects", { value: {}, enumerable: false }), info.objects);
        var action = str(entry.action);
        if (qname === requestable) {
          if (action === "create") {
            info.created = true;
          } else if (action === "setProperties" && (entry.names || []).some(function (n) { return /^sqlquery$/i.test(str(n)); })) {
            info.sql = true;
          } else if (action === "declareSqlVariables") {
            info.sql = true;
          }
          return;
        }
        if (action !== "updateExisting" && !seen[qname]) {
          seen[qname] = true;
          info.inside++;
        }
      });
    });
    return out;
  };

  // Whether a QName was created by this conversation: it, or a parent of it, is in the created list of the journal.
  api.createdBefore = function (qname, created) {
    var q = str(qname);
    return (created || []).some(function (c) {
      c = str(c);
      return c.length > 0 && (q === c || q.indexOf(c + ".") === 0);
    });
  };

  // The objects that name a runtime path in the project's files ({relative path: text}): pages, shared components,
  // sequences. A path is a whole name: "P.list" is not "P.list_all".
  api.callersIn = function (files, runtime, requestable) {
    var escaped = str(runtime).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var pattern = new RegExp("(^|[^\\w.$])" + escaped + "(?![\\w$])");
    var own = api.ownFile(requestable);
    var out = [];
    Object.keys(files || {}).sort().forEach(function (path) {
      if (path === own || !pattern.test(String(files[path]))) {
        return;
      }
      var m = /(?:^|\/)(mobilePages|mobileSharedComponents|mobileSharedActions|sequences|connectors)\/([^/]+)\.yaml$/.exec(path);
      if (!m) {
        return;
      }
      var kind = { mobilePages: "page", mobileSharedComponents: "shared component", mobileSharedActions: "shared action", sequences: "sequence", connectors: "connector" }[m[1]];
      out.push(kind + " " + m[2]);
    });
    return out;
  };

  // The file of the requestable itself, never its own caller.
  api.ownFile = function (requestable) {
    var r = str(requestable);
    var sq = /\.sq:([^.]+)$/.exec(r);
    if (sq) {
      return "_c8oProject/sequences/" + sq[1] + ".yaml";
    }
    var tr = /\.cn:([^.]+)\.tr:[^.]+$/.exec(r);
    return tr ? "_c8oProject/connectors/" + tr[1] + ".yaml" : "";
  };

  // The requestable a tree-apply writes inside ("" when none): its output steps, its variables, its SQL or its name. at
  // "before"/"after" a requestable adds a sibling of it, a new requestable; at "self" on the requestable itself counts only
  // for children, a replace, its SQL or another name (a comment or an accessibility is not its contract).
  api.writeScope = function (targetQName, at, mode, tree) {
    var target = str(targetQName);
    var requestable = api.requestableOf(target);
    if (!requestable.length) {
      return "";
    }
    var place = str(at).toLowerCase() || "self";
    if (target !== requestable) {
      return requestable;
    }
    if (place === "before" || place === "after") {
      return "";
    }
    if (place === "inside") {
      return requestable;
    }
    var node = tree && typeof tree === "object" ? tree : {};
    var name = str(node.name);
    var own = requestable.replace(/^.*\.(?:sq|tr):/, "");
    var properties = node.properties && typeof node.properties === "object" ? Object.keys(node.properties) : [];
    if ((Array.isArray(node.children) && node.children.length > 0) || str(mode).toLowerCase() === "replace" ||
        (name.length > 0 && name !== own) || properties.some(function (k) { return /^sqlquery$/i.test(k); })) {
      return requestable;
    }
    return "";
  };

  // The requestables named in changeExisting: a list, a JSON list or a comma separated text; QName, runtime path
  // ("P.seq", "P.conn.tx") or bare name.
  api.parseNames = function (value) {
    // the engine hands a list argument over as its JSON text, a Java string: read as text, never as characters
    var list = value;
    if (!Array.isArray(list)) {
      var text = str(list);
      if (!text.length) {
        return [];
      }
      if (text.charAt(0) === "[") {
        try {
          list = JSON.parse(text);
        } catch (_notJson) {
          list = text.replace(/^\[|\]$/g, "").split(",");
        }
      } else {
        list = text.split(",");
      }
    }
    return (Array.isArray(list) ? list : []).map(function (item) { return str(item).replace(/^["']|["']$/g, ""); })
      .filter(function (item) { return item.length > 0; });
  };

  api.names = function (names, requestable) {
    var own = requestable.replace(/^.*\.(?:sq|tr):/, "");
    var runtime = api.runtimeName(requestable);
    return (names || []).some(function (n) {
      return n === requestable || n === runtime || n === own;
    });
  };

  api.existingRefusal = function (requestable, callers, callees) {
    var list = callers.length ? callers.slice(0, 8).join(", ") + (callers.length > 8 ? " (+" + (callers.length - 8) + ")" : "") : "";
    var calls = (callees || []).slice(0, 6);
    return "Nothing was changed: " + requestable + " existed before this conversation, and " +
      (list.length ? "its callers (" + list + ") read" : "the app reads") + " its output and its variables. If the user's " +
      "request asks to change " + requestable + " itself (its output, its fields, its SQL, its steps), call again with the same " +
      "arguments and changeExisting:[\"" + requestable + "\"" +
      (calls.length ? "] (add " + calls.map(function (c) { return "\"" + c + "\""; }).join(", ") + ", which it calls, if the " +
        "change goes into them too)" : "]") + ": later changes to it in this conversation then pass; name the change in the " +
      "final report. A request for a page or a sequence that uses it does not ask that: leave it as it is, and bind the new " +
      "objects to its output as it is (requestable-execute shows it), or create a separate object (a new sequence or " +
      "transaction under another name).";
  };



  api.confirmedNote = function (requestable) {
    return requestable + " existed before this conversation and was changed as named in changeExisting: say it in the " +
      "final report (project-changes lists it under existingChanged).";
  };

  api.outputWarning = function (requestable, info, callers) {
    var what = info.inside > 0 ? info.inside + " object(s) inside it" + (info.sql ? " and its SQL" : "") : "its SQL";
    var list = callers.length ? callers.slice(0, 8).join(", ") + (callers.length > 8 ? " (+" + (callers.length - 8) + ")" : "") : "";
    return requestable + " existed before this conversation, and this call changed " + what + ". Its output is a contract " +
      (list.length ? "its callers read (" + list + ")" : "the app reads (no page or sequence names it yet)") +
      ". If the user did not ask to change it, undo the change and adapt the new objects to its output as it is " +
      "(convertigo://guides/common/models); either way, name the change in the final report.";
  };

  // Whether an SQL text writes data or the schema (texts and comments aside).
  api.sqlWrites = function (sql) {
    var bare = String(sql || "").replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/'(?:[^']|'')*'/g, "''");
    return /\b(insert|update|delete|merge|replace|upsert|create|drop|alter|truncate)\b/i.test(bare);
  };

  api.accessWarning = function (sequence, writes) {
    return sequence + " writes data (" + writes.slice(0, 3).join(", ") + ") and is Public, the default of a new sequence: " +
      "anyone can call it without signing in. A seed, an init or a job stays Private (run by a scheduler job or an " +
      "administrator); a sequence the app's pages call is Hidden with authenticatedContextRequired=true and a role check. " +
      "Set its accessibility with databaseobject-tree-apply (convertigo://guides/common/seed).";
  };
})(C8O.requestableContract);

// The engine side of the existing-requestable gate, before a tree-apply changes anything: {refusal} to throw, {note} to add
// to the answer, or null. Confirmations live per conversation in the store the server shares between requests. Never throws.
C8O.requestableContract.CONFIRMED_KEY = "lib_ConvertigoMCP.existingChangeConfirmed";

C8O.requestableContract.confirmedKey = function (contextObject, requestable) {
  if (typeof C8O.writeJournal === "undefined" || typeof C8O.writeJournal.keyOf !== "function") {
    include("js/write_journal.js");
  }
  return C8O.writeJournal.keyOf(contextObject, "").key + "|" + requestable;
};

C8O.requestableContract.confirmedStore = function (contextObject) {
  var store = contextObject ? contextObject.server : null;
  if (store == null) {
    return null;
  }
  var map = store.get(C8O.requestableContract.CONFIRMED_KEY);
  if (map == null) {
    store.set(C8O.requestableContract.CONFIRMED_KEY, new java.util.concurrent.ConcurrentHashMap());
    map = store.get(C8O.requestableContract.CONFIRMED_KEY);
  }
  if (map.size() > 5000) {
    map.clear();
  }
  return map;
};

C8O.requestableContract.isConfirmed = function (contextObject, requestable) {
  try {
    var map = C8O.requestableContract.confirmedStore(contextObject);
    return map != null && map.containsKey(C8O.requestableContract.confirmedKey(contextObject, requestable));
  } catch (_unknown) {
    return false;
  }
};

// The transactions and sequences of its own project a sequence calls (typed QNames), that existed before this conversation
// too: a change the user asked for in its output often goes into the SQL of the transaction it calls, a second refusal.
C8O.requestableContract.calleesOf = function (sequence) {
  var out = [];
  try {
    var project = String(sequence.getProject().getName());
    var walk = function (dbo, depth) {
      var list = null;
      try {
        list = dbo.getDatabaseObjectChildren();
      } catch (_noChildren) {
        list = null;
      }
      for (var i = 0; list && i < list.size() && depth < 50 && out.length < 6; i++) {
        var child = list.get(i);
        var cls = String(child.getClass().getName());
        var target = null;
        try {
          target = /TransactionStep$/.test(cls) && typeof child.getTargetTransaction === "function" ? child.getTargetTransaction()
            : /SequenceStep$/.test(cls) && typeof child.getTargetSequence === "function" ? child.getTargetSequence() : null;
        } catch (_noTarget) {
          target = null;
        }
        if (target && String(target.getProject().getName()) === project) {
          var qname = String(C8O.dbo.safeFullQName(target) || "");
          if (qname.length && out.indexOf(qname) < 0) {
            out.push(qname);
          }
        }
        if (/Step$/.test(cls)) {
          walk(child, depth + 1);
        }
      }
    };
    walk(sequence, 0);
  } catch (_unknownCallees) {}
  return out;
};

C8O.requestableContract.gateExisting = function (contextObject, targetQName, at, mode, tree, changeExisting) {
  var api = C8O.requestableContract;
  try {
    var requestable = api.writeScope(targetQName, at, mode, tree);
    if (!requestable.length) {
      return null;
    }
    var dbo = C8O.dbo.resolve(requestable, { optional: true });
    if (!dbo) {
      return null;
    }
    if (typeof C8O.writeJournal === "undefined" || typeof C8O.writeJournal.createdQNames !== "function") {
      include("js/write_journal.js");
    }
    if (api.createdBefore(requestable, C8O.writeJournal.createdQNames(contextObject)) || api.isConfirmed(contextObject, requestable)) {
      return null;
    }
    var named = api.parseNames(changeExisting);
    if (api.names(named, requestable)) {
      var map = api.confirmedStore(contextObject);
      if (map != null) {
        var now = java.lang.Long.valueOf(java.lang.System.currentTimeMillis());
        map.put(api.confirmedKey(contextObject, requestable), now);
        // the other requestables the call names (the transaction a sequence calls) pass too, without a refusal of their own
        named.forEach(function (name) {
          try {
            var other = C8O.dbo.resolve(name, { optional: true });
            var otherQName = other ? api.requestableOf(String(C8O.dbo.safeFullQName(other) || "")) : "";
            if (otherQName.length && otherQName !== requestable) {
              map.put(api.confirmedKey(contextObject, otherQName), now);
            }
          } catch (_unknownName) {}
        });
      }
      return { note: api.confirmedNote(requestable), requestable: requestable };
    }
    return { refusal: api.existingRefusal(requestable, api.callersOf(dbo, requestable), api.calleesOf(dbo)), requestable: requestable };
  } catch (_gateUnknown) {
    return null;
  }
};

// The engine side: the warnings of one tree-apply answer (the full one, before it is made compact). Never throws.
C8O.requestableContract.warningsFor = function (result, contextObject) {
  var api = C8O.requestableContract;
  var warnings = [];
  try {
    var touched = api.touched(result && result.operations);
    var names = Object.keys(touched);
    if (!names.length) {
      return warnings;
    }
    if (typeof C8O.writeJournal === "undefined" || typeof C8O.writeJournal.createdQNames !== "function") {
      include("js/write_journal.js");
    }
    var created = C8O.writeJournal.createdQNames(contextObject);
    names.forEach(function (requestable) {
      var info = touched[requestable];
      var dbo = null;
      try {
        dbo = C8O.dbo.resolve(requestable, { optional: true });
      } catch (_gone) {
        dbo = null;
      }
      if (!dbo) {
        return;
      }
      var newHere = info.created || api.createdBefore(requestable, created);
      // a change the call named in changeExisting was noted when it was let through
      if (!newHere && (info.inside > 0 || info.sql) && !api.isConfirmed(contextObject, requestable)) {
        warnings.push(api.outputWarning(requestable, info, api.callersOf(dbo, requestable)));
      }
      if (newHere && /\.sq:[^.]+$/.test(requestable)) {
        var access = "";
        try {
          access = String(dbo.getAccessibility());
        } catch (_noAccess) {
          access = "";
        }
        var comment = "";
        try {
          comment = String(dbo.getComment() || "");
        } catch (_noComment) {}
        if (/^public$/i.test(access) && !/^[ \t]*public-write[ \t]*:/im.test(comment)) {
          var writes = api.writesOf(dbo, 0, {});
          if (writes.length) {
            warnings.push(api.accessWarning(requestable, writes));
          }
        }
      }
    });
  } catch (_ignoreContract) {}
  return warnings;
};

// The pages, shared components and sequences of the project whose files name the requestable's runtime path.
C8O.requestableContract.callersOf = function (dbo, requestable) {
  var api = C8O.requestableContract;
  var files = {};
  try {
    var root = new java.io.File(String(dbo.getProject().getDirPath()));
    var base = String(root.getCanonicalPath());
    var stack = [new java.io.File(root, "_c8oProject")];
    var count = 0;
    var size = 0;
    while (stack.length && count < 800 && size < 30000000) {
      var dir = stack.pop();
      var list = dir.listFiles();
      for (var i = 0; list && i < list.length; i++) {
        var f = list[i];
        if (f.isDirectory()) {
          stack.push(f);
        } else if (/\.yaml$/.test(String(f.getName()))) {
          var text = String(new java.lang.String(java.nio.file.Files.readAllBytes(f.toPath()), "UTF-8"));
          files[String(f.getCanonicalPath()).substring(base.length + 1).replace(/\\/g, "/")] = text;
          count++;
          size += text.length;
        }
      }
    }
  } catch (_ignoreFiles) {}
  return api.callersIn(files, api.runtimeName(requestable), requestable);
};

// What a sequence writes: the SQL writes of the transactions its steps call, the CouchDB writes, and the same through the
// sequences it calls (3 levels at most).
C8O.requestableContract.writesOf = function (sequence, depth, seen) {
  var api = C8O.requestableContract;
  var out = [];
  if (!sequence || depth > 3) {
    return out;
  }
  var walk = function (dbo) {
    var list = null;
    try {
      list = dbo.getDatabaseObjectChildren();
    } catch (_noChildren) {
      list = null;
    }
    for (var i = 0; list && i < list.size(); i++) {
      var child = list.get(i);
      var cls = String(child.getClass().getName());
      try {
        if (/TransactionStep$/.test(cls) && typeof child.getTargetTransaction === "function") {
          var tx = child.getTargetTransaction();
          var txClass = tx ? String(tx.getClass().getName()) : "";
          var name = tx ? String(tx.getParent().getName()) + "." + String(tx.getName()) : "";
          if (tx && typeof tx.getSqlQuery === "function" && api.sqlWrites(tx.getSqlQuery())) {
            out.push(name);
          } else if (/couchdb\.transactions\.(Post|Put|Delete|Update|Purge)/i.test(txClass) || /FullSync.*(Post|Put|Delete)/i.test(txClass)) {
            out.push(name);
          }
        } else if (/SequenceStep$/.test(cls) && typeof child.getTargetSequence === "function") {
          var target = child.getTargetSequence();
          var key = target ? String(target.getQName()) : "";
          if (target && !seen[key]) {
            seen[key] = true;
            if (api.writesOf(target, depth + 1, seen).length) {
              out.push(String(target.getName()));
            }
          }
        }
      } catch (_ignoreStep) {}
      walk(child);
    }
  };
  walk(sequence);
  return out.filter(function (v, i, all) { return all.indexOf(v) === i; });
};
