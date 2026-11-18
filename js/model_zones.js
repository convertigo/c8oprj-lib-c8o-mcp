/*
 * The zones of a page copied from a model in this conversation. A model page (a template a skill or the project names)
 * gives every page of its kind the same zones (a header, a banner, a content zone, a footer) with their classes. Measured
 * runs (18/11): after copying the model, the agent deleted its footer and changed the class of its content element, and
 * in another run removed every zone of the model ("they make no sense here"), against the skill of the customer that
 * said to fill only the content zone. The user's decision (18/11): warn, never refuse.
 *
 * A databaseobject-copy of a page records, for the conversation, the zones of its source at that moment: the elements two
 * levels under the page, with their order and their class attribute. After a write that touches the copy (tree-apply,
 * delete, move, rename, a batch of them), the copy is compared with that record: a zone gone, zones in another order, a
 * zone's class changed or a zone left empty make one warning, marked STILL OPEN when it comes again; project-changes lists
 * the copies that differ from their model, for the final report. No zone name is known here: the zones are the source's.
 */
if (typeof C8O === "undefined") {
  var C8O = {};
}
C8O.modelZones = C8O.modelZones || {};

(function (api) {
  api.STORE_KEY = "lib_ConvertigoMCP.modelZones";
  api.REPEAT_KEY = "lib_ConvertigoMCP.modelZoneRepeats";
  api.DEPTH = 2;
  api.MAX_DRIFTS = 6;

  function str(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  // An element of the page: a UI object that is not an attribute, a style, a text, an event, an action or a variable.
  api.isElement = function (simpleClass) {
    var cls = str(simpleClass);
    return /^UI/.test(cls) && !/^UI(Attribute|Style|Text|Font|Theme)/.test(cls) && !/(Event|Action|Variable|Subscriber)/.test(cls);
  };

  // The zones of a page in walk order: [{path, parent, cls, count}]; path and parent are relative to the page ("Content",
  // "Content.Footer"), cls the class attribute ("" when none), count the children that are neither attributes nor styles.
  // hooks: children(dbo) -> [dbo], simpleClass(dbo), name(dbo), classValue(dbo) (the value of its class attribute).
  api.zonesOf = function (page, hooks, depth) {
    var max = depth || api.DEPTH;
    var out = [];
    (function walk(parent, prefix, level) {
      if (level > max) {
        return;
      }
      (hooks.children(parent) || []).forEach(function (child) {
        if (!api.isElement(hooks.simpleClass(child))) {
          return;
        }
        var path = (prefix.length ? prefix + "." : "") + str(hooks.name(child));
        var count = (hooks.children(child) || []).filter(function (c) {
          return !/^UI(Attribute|Style)$/.test(str(hooks.simpleClass(c)));
        }).length;
        out.push({ path: path, parent: prefix, cls: str(hooks.classValue(child)), count: count });
        walk(child, path, level + 1);
      });
    })(page, "", 1);
    return out;
  };

  function ordinal(n) {
    return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : n + "th";
  }

  // What differs between the zones recorded at the copy and the zones now: ["zone Content.Footer deleted", ...]. live leaves
  // out the emptied zones: replacing the placeholder of the content zone empties it for a moment (the final state counts).
  api.diff = function (recorded, current, live) {
    var now = {};
    (current || []).forEach(function (z) {
      now[z.path] = z;
    });
    var drifts = [];
    var gone = {};
    (recorded || []).forEach(function (z) {
      // a zone under a deleted zone goes with it: the deleted one is named alone
      if (gone[z.parent]) {
        gone[z.path] = true;
        return;
      }
      var still = now[z.path];
      if (!still) {
        gone[z.path] = true;
        drifts.push("zone " + z.path + " deleted");
        return;
      }
      if (z.cls !== still.cls) {
        drifts.push("class of " + z.path + " changed from \"" + z.cls + "\" to \"" + still.cls + "\"");
      }
      if (!live && z.count > 0 && still.count === 0) {
        drifts.push("zone " + z.path + " emptied");
      }
    });
    // the order of the zones that are still there, under each parent
    var parents = [];
    (recorded || []).forEach(function (z) {
      if (parents.indexOf(z.parent) < 0) {
        parents.push(z.parent);
      }
    });
    parents.forEach(function (parent) {
      if (gone[parent]) {
        return;
      }
      var before = (recorded || []).filter(function (z) { return z.parent === parent && now[z.path]; }).map(function (z) { return z.path; });
      var after = (current || []).filter(function (z) { return z.parent === parent && before.indexOf(z.path) >= 0; }).map(function (z) { return z.path; });
      if (before.join("|") !== after.join("|")) {
        drifts.push("zones of " + (parent || "the page") + " in another order (now " + after.map(function (p) {
          return p.substring(p.lastIndexOf(".") + 1);
        }).join(", ") + ")");
      }
    });
    return drifts;
  };

  api.drifted = function (drifts) {
    var shown = drifts.slice(0, api.MAX_DRIFTS).join("; ");
    return shown + (drifts.length > api.MAX_DRIFTS ? " (+" + (drifts.length - api.MAX_DRIFTS) + " more)" : "");
  };

  api.warning = function (copy, source, drifts) {
    return copy + " was copied in this conversation from the model " + source + ", and differs from it now: " + api.drifted(drifts) +
      ". The model gives every page of its kind these zones: put the page's content in its content zone, and delete, move, " +
      "empty or restyle another zone only if the user asked for it (convertigo://guides/common/models). Name the difference in " +
      "the final report.";
  };

  api.repeatNote = function (warning, seen) {
    if (!(seen >= 2)) {
      return warning;
    }
    return "STILL OPEN (" + ordinal(seen) + " time in this conversation): " + warning;
  };

  // The copies a write touched: a QName written is the copy or under it.
  api.touches = function (copy, qnames) {
    return (qnames || []).some(function (q) {
      q = str(q);
      return q === copy || q.indexOf(copy + ".") === 0;
    });
  };
})(C8O.modelZones);

// --- engine side -------------------------------------------------------------------------------------------------------

// The router and project-changes do not load the object helpers: loaded here when needed.
C8O.modelZones.ensureDbo = function () {
  if (typeof C8O.dbo === "undefined" || typeof C8O.dbo.resolve !== "function" || typeof C8O.dbo.getDirectChildren !== "function") {
    include("js/databaseobject.js");
  }
};

C8O.modelZones.engineHooks = function () {
  var simple = function (dbo) {
    try {
      return String(dbo.getClass().getSimpleName());
    } catch (_noClass) {
      return "";
    }
  };
  var kids = function (dbo) {
    try {
      return C8O.dbo.getDirectChildren(dbo) || [];
    } catch (_noChildren) {
      return [];
    }
  };
  return {
    children: kids,
    simpleClass: simple,
    name: function (dbo) {
      try {
        return String(dbo.getName());
      } catch (_noName) {
        return "";
      }
    },
    classValue: function (dbo) {
      var value = "";
      kids(dbo).forEach(function (child) {
        try {
          if (!value.length && simple(child) === "UIAttribute" && String(child.getAttrName()) === "class") {
            var st = child.getAttrSmartType();
            var mode = st ? String(st.getMode()) : "PLAIN";
            var text = st ? String(st.getSmartValue()) : "";
            value = (mode && mode !== "PLAIN" ? mode + ": " : "") + text;
          }
        } catch (_noAttr) {}
      });
      return value;
    }
  };
};

C8O.modelZones.keyOf = function (contextObject) {
  if (typeof C8O.writeJournal === "undefined" || typeof C8O.writeJournal.keyOf !== "function") {
    include("js/write_journal.js");
  }
  return C8O.writeJournal.keyOf(contextObject, "").key;
};

C8O.modelZones.store = function (contextObject, key) {
  var server = contextObject ? contextObject.server : null;
  if (server == null) {
    return null;
  }
  var map = server.get(key);
  if (map == null) {
    server.set(key, new java.util.concurrent.ConcurrentHashMap());
    map = server.get(key);
  }
  if (map.size() > 2000) {
    map.clear();
  }
  return map;
};

// After a databaseobject-copy (its answer): a copy of a page records the zones of its source. Never throws.
C8O.modelZones.afterCopy = function (contextObject, answer) {
  var api = C8O.modelZones;
  try {
    var copy = String(answer && answer.qname || "");
    var source = String(answer && answer.source || "");
    if (!copy.length || !source.length || !/PageComponent/.test(String(answer.className || ""))) {
      return false;
    }
    api.ensureDbo();
    var page = C8O.dbo.resolve(source, { optional: true });
    var map = api.store(contextObject, api.STORE_KEY);
    if (!page || map == null) {
      return false;
    }
    var zones = api.zonesOf(page, api.engineHooks());
    if (!zones.length) {
      return false;
    }
    map.put(api.keyOf(contextObject) + "|" + copy, JSON.stringify({ s: source, z: zones }));
    return true;
  } catch (_unknownCopy) {
    return false;
  }
};

// The copies of this conversation: [{copy, source, zones}].
C8O.modelZones.copies = function (contextObject) {
  var api = C8O.modelZones;
  var out = [];
  try {
    var map = api.store(contextObject, api.STORE_KEY);
    if (map == null) {
      return out;
    }
    var prefix = api.keyOf(contextObject) + "|";
    var keys = map.keySet().toArray();
    for (var i = 0; i < keys.length; i++) {
      var key = String(keys[i]);
      if (key.indexOf(prefix) === 0) {
        var record = JSON.parse(String(map.get(keys[i])));
        out.push({ copy: key.substring(prefix.length), source: record.s, zones: record.z });
      }
    }
  } catch (_unknownCopies) {}
  return out;
};

// The differences of a recorded copy now, [] when it matches its model or is gone.
C8O.modelZones.driftsOf = function (record, live) {
  var api = C8O.modelZones;
  try {
    api.ensureDbo();
    var page = C8O.dbo.resolve(record.copy, { optional: true });
    return page ? api.diff(record.zones, api.zonesOf(page, api.engineHooks()), live) : [];
  } catch (_unknownDrift) {
    return [];
  }
};

// After a write: the warnings for the copies it touched (qnames: what it wrote), STILL OPEN when one comes again. Never throws.
C8O.modelZones.warningsAfter = function (contextObject, qnames) {
  var api = C8O.modelZones;
  var warnings = [];
  try {
    var repeats = null;
    api.copies(contextObject).forEach(function (record) {
      if (!api.touches(record.copy, qnames)) {
        return;
      }
      var drifts = api.driftsOf(record, true);
      repeats = repeats || api.store(contextObject, api.REPEAT_KEY);
      // one count per copy: a new difference on a copy that already differed is still open too; back to its model, it starts again
      var key = api.keyOf(contextObject) + "|" + record.copy;
      if (!drifts.length) {
        if (repeats != null) {
          repeats.remove(key);
        }
        return;
      }
      var text = api.warning(record.copy, record.source, drifts);
      var seen = 1;
      if (repeats != null) {
        seen = Number(repeats.getOrDefault(key, 0)) + 1;
        repeats.put(key, java.lang.Integer.valueOf(seen));
      }
      warnings.push(api.repeatNote(text, seen));
    });
  } catch (_unknownWarnings) {}
  return warnings;
};

// For project-changes: one line per copy of this conversation (of a project) that differs from its model.
C8O.modelZones.summary = function (contextObject, project) {
  var api = C8O.modelZones;
  var lines = [];
  try {
    var name = String(project || "");
    api.copies(contextObject).forEach(function (record) {
      if (name.length && record.copy.indexOf(name + ".") !== 0) {
        return;
      }
      var drifts = api.driftsOf(record);
      if (drifts.length) {
        lines.push(record.copy + " (copy of " + record.source + "): " + api.drifted(drifts));
      }
    });
  } catch (_unknownSummary) {}
  return lines;
};
