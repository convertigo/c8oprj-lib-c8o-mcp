/*
 * Step sources: a step (or the variable of a call step) reads the output of another step of its sequence by that step's
 * priority, the [priority, xpath] pair of its sourceDefinition (and of the rows of a sourcesDefinition, a SmartType in
 * SOURCE mode, a TransactionStep's connectionStringDefinition, the start, stop and days definitions of
 * XMLGenerateDatesStep). A step deleted, or created again (another class, a replace), leaves that pair naming no step:
 * requestable-execute then fails with "Did not find source (<priority>) for step <name>".
 *
 * project-lint reports every such orphan source (SEQ-ORPHAN-SOURCE); databaseobject-delete, databaseobject-move and the
 * delete, move and replace of tree-apply and batch-call warn about the sources they leave orphan (js/databaseobject_ops.js,
 * js/databaseobject_batch.js). Engine objects in Rhino; the tests give plain ones.
 */
if (typeof C8O === "undefined") { var C8O = {}; }
C8O.stepSources = C8O.stepSources || {};

(function (api) {
  var LISTED = 5;
  var DEFINITION_GETTERS = [
    ["getSourceDefinition", "sourceDefinition"],
    ["getConnectionStringDefinition", "connectionStringDefinition"],
    ["getStartDefinition", "startDefinition"],
    ["getStopDefinition", "stopDefinition"],
    ["getDaysDefinition", "daysDefinition"]
  ];

  function str(value) {
    return value == null ? "" : String(value).trim();
  }

  function className(dbo) {
    try {
      return String(dbo.getClass().getName());
    } catch (_noClass) {
      return "";
    }
  }

  function simpleName(dbo) {
    var name = className(dbo);
    return name.substring(name.lastIndexOf(".") + 1);
  }

  function qnameOf(dbo) {
    try {
      return String(dbo.getFullQName());
    } catch (_noQName) {
      return str(dbo && dbo.getName ? dbo.getName() : "");
    }
  }

  function sizeOf(list) {
    if (list == null) {
      return 0;
    }
    if (Array.isArray(list)) {
      return list.length;
    }
    return typeof list.size === "function" ? Number(list.size()) : 0;
  }

  function itemOf(list, index) {
    return Array.isArray(list) ? list[index] : list.get(index);
  }

  function each(collection, fn) {
    if (collection == null) {
      return;
    }
    if (Array.isArray(collection)) {
      collection.forEach(fn);
      return;
    }
    if (typeof collection.iterator === "function") {
      var it = collection.iterator();
      while (it.hasNext()) {
        fn(it.next());
      }
      return;
    }
    for (var i = 0; i < sizeOf(collection); i++) {
      fn(itemOf(collection, i));
    }
  }

  function children(dbo) {
    if (C8O.dbo && typeof C8O.dbo.getDirectChildren === "function") {
      return C8O.dbo.getDirectChildren(dbo);
    }
    var out = [];
    each(dbo && dbo.getDatabaseObjectChildren ? dbo.getDatabaseObjectChildren() : null, function (c) { out.push(c); });
    return out;
  }

  api.isStep = function (dbo) {
    var name = simpleName(dbo);
    return !/Variable$/.test(name) && (/Step$/.test(name) || /\.beans\.steps\./.test(className(dbo)));
  };

  api.isVariable = function (dbo) {
    return /Variable$/.test(simpleName(dbo));
  };

  api.priorityOf = function (dbo) {
    try {
      var value = dbo.priority;
      return value == null ? "" : str(value);
    } catch (_noPriority) {
      return "";
    }
  };

  // The sequence a step runs in, else null (a sequence itself, a transaction, a UI object...).
  api.sequenceOf = function (dbo) {
    if (!dbo || !api.isStep(dbo)) {
      return null;
    }
    try {
      if (typeof dbo.getParentSequence === "function") {
        return dbo.getParentSequence();
      }
    } catch (_noParentSequence) {}
    try {
      return typeof dbo.getSequence === "function" ? dbo.getSequence() : null;
    } catch (_noSequence) {
      return null;
    }
  };

  // The [priority, xpath] pairs one step or call-step variable reads: [{property, priority, xpath}].
  api.refsOf = function (dbo) {
    var refs = [];
    function add(definition, property) {
      try {
        if (sizeOf(definition) < 1) {
          return;
        }
        var priority = str(itemOf(definition, 0));
        if (priority.length) {
          refs.push({ property: property, priority: priority, xpath: sizeOf(definition) > 1 ? str(itemOf(definition, 1)) : "" });
        }
      } catch (_noDefinition) {}
    }
    DEFINITION_GETTERS.forEach(function (getter) {
      try {
        if (typeof dbo[getter[0]] === "function") {
          add(dbo[getter[0]](), getter[1]);
        }
      } catch (_noGetter) {}
    });
    try {
      if (typeof dbo.getSourcesDefinition === "function") {
        var rows = dbo.getSourcesDefinition();
        for (var r = 0; r < sizeOf(rows); r++) {
          var row = itemOf(rows, r);
          if (sizeOf(row) > 1) {
            add(itemOf(row, 1), "sourcesDefinition[" + r + "]");
          }
        }
      }
    } catch (_noSources) {}
    try {
      if (typeof dbo.getSmartTypes === "function") {
        each(dbo.getSmartTypes(), function (smart) {
          if (smart && typeof smart.isUseSource === "function" && smart.isUseSource()) {
            add(smart.getSourceDefinition(), "a SmartType in SOURCE mode");
          }
        });
      }
    } catch (_noSmartTypes) {}
    return refs;
  };

  // Every step under root (a sequence or a step, root included when it is a step) by priority, and every source they and
  // their variables hold: {steps: {priority: qname}, refs: [{qname, name, kind, enabled, property, priority, xpath}]}.
  api.collect = function (root) {
    var scan = { steps: {}, refs: [] };
    function visit(dbo, enabled) {
      var step = api.isStep(dbo);
      var variable = !step && api.isVariable(dbo);
      if (!step && !variable && dbo !== root) {
        return;
      }
      var on = enabled;
      if (step) {
        try {
          on = enabled && (typeof dbo.isEnabled !== "function" || dbo.isEnabled() !== false);
        } catch (_noEnabled) {}
        var priority = api.priorityOf(dbo);
        if (priority.length) {
          scan.steps[priority] = qnameOf(dbo);
        }
      }
      if (step || variable) {
        api.refsOf(dbo).forEach(function (ref) {
          scan.refs.push({ qname: qnameOf(dbo), name: str(dbo.getName()), kind: step ? "step" : "variable", enabled: on,
            property: ref.property, priority: ref.priority, xpath: ref.xpath });
        });
      }
      if (step || dbo === root) {
        children(dbo).forEach(function (child) { visit(child, on); });
      }
    }
    visit(root, true);
    return scan;
  };

  // The sources that name no step of the scan, or only those naming one of the given priorities when given.
  api.orphans = function (scan, among) {
    return scan.refs.filter(function (ref) {
      return !Object.prototype.hasOwnProperty.call(scan.steps, ref.priority) &&
        (!among || Object.prototype.hasOwnProperty.call(among, ref.priority));
    });
  };

  function refText(ref) {
    return ref.qname + " (" + (ref.kind === "variable" ? "variable, " : "") + ref.property + (ref.xpath ? " " + ref.xpath : "") + ")";
  }

  // project-lint: one finding per orphan source.
  api.lintFinding = function (ref, sequenceQName) {
    var owner = ref.kind === "variable" ? "The variable " + ref.name + " of a call step" : "The step " + ref.name;
    return {
      rule: "SEQ-ORPHAN-SOURCE",
      severity: ref.enabled === false ? "warning" : "error",
      qname: ref.qname,
      message: owner + " sources the step of priority " + ref.priority + " (" + ref.property + (ref.xpath ? " " + ref.xpath : "") +
        "), which is not in the sequence " + sequenceQName + " any more (deleted, or created again with another priority): " +
        "requestable-execute fails with \"Did not find source (" + ref.priority + ") for step " + ref.name + "\".",
      fix: "Point the source at the step that gives this output now: its priority is in databaseobject-tree-get of the sequence, " +
        "then databaseobject-tree-apply on " + ref.qname + " with " + ref.property.replace(/^a SmartType in SOURCE mode$/, "the SmartType") +
        " [\"<priority>\", \"" + (ref.xpath || "./document/...") + "\"]; or remove the source."
    };
  };

  // Before a delete or a move: the steps of the sequence of dbo by priority, or null when dbo is not a step.
  api.watch = function (dbo) {
    var sequence = api.sequenceOf(dbo);
    if (!sequence) {
      return null;
    }
    var before = api.collect(sequence).steps;
    return { sequence: sequence, sequenceQName: qnameOf(sequence), before: before, gone: qnameOf(dbo) };
  };

  // After it: the sources of the watched sequence (and of the sequences given, where a step moved to) that name a step the
  // sequence had before and has no more: [{qname, name, kind, enabled, property, priority, xpath, gone, sequence, sequenceQName}].
  api.leftOrphan = function (watch, others) {
    if (!watch) {
      return [];
    }
    var out = [];
    var done = {};
    [watch.sequence].concat(others || []).forEach(function (sequence) {
      var key = sequence ? qnameOf(sequence) : "";
      if (!sequence || done[key]) {
        return;
      }
      done[key] = true;
      api.orphans(api.collect(sequence), watch.before).forEach(function (ref) {
        out.push({ qname: ref.qname, name: ref.name, kind: ref.kind, enabled: ref.enabled, property: ref.property, priority: ref.priority,
          xpath: ref.xpath, gone: watch.before[ref.priority], sequence: sequence, sequenceQName: key });
      });
    });
    return out;
  };

  // Still orphan once the whole batch ran (a later operation may have pointed the source elsewhere): the same list, filtered.
  api.stillOrphan = function (orphans) {
    var scans = {};
    return (orphans || []).filter(function (o) {
      if (!o.sequence) {
        return false;
      }
      var scan = scans[o.sequenceQName] || (scans[o.sequenceQName] = api.collect(o.sequence));
      if (Object.prototype.hasOwnProperty.call(scan.steps, o.priority)) {
        return false;
      }
      return scan.refs.some(function (ref) {
        return ref.qname === o.qname && ref.property === o.property && ref.priority === o.priority;
      });
    });
  };

  // One warning per step gone: the sources it leaves orphan (at most LISTED named), and the priority of the step created
  // again in its place when there is one (replacements: {goneQName: {qname, priority}}).
  api.warnings = function (orphans, replacements) {
    var byGone = {};
    var order = [];
    (orphans || []).forEach(function (o) {
      var key = o.gone + "|" + o.priority;
      if (!byGone[key]) {
        byGone[key] = [];
        order.push(key);
      }
      if (!byGone[key].some(function (x) { return x.qname === o.qname && x.property === o.property; })) {
        byGone[key].push(o);
      }
    });
    return order.map(function (key) {
      var list = byGone[key];
      var first = list[0];
      var shown = list.slice(0, LISTED).map(refText).join(", ") + (list.length > LISTED ? " and " + (list.length - LISTED) + " more" : "");
      var replacement = replacements && replacements[first.gone];
      return "Step sources left orphan: " + list.length + " source(s) of " + first.sequenceQName + " name " + first.gone + " (priority " +
        first.priority + "), which is not a step of that sequence any more: " + shown + ". requestable-execute will fail with \"Did not find source (" +
        first.priority + ") for step " + first.name + "\". " +
        (replacement
          ? "It was created again as " + replacement.qname + " with priority " + replacement.priority + ": set these sources to [\"" +
            replacement.priority + "\", <xpath>]"
          : "Point these sources at the step that gives this output now (its priority is in databaseobject-tree-get)") +
        " with databaseobject-tree-apply, or remove them; project-lint lists them as SEQ-ORPHAN-SOURCE.";
    });
  };

  // The variables of a call step (TransactionStep, SequenceStep) that will be empty at run time. The engine fills each one
  // from its source, else from the JS variable of the same name in the sequence's scope (a sequence variable, a var of a
  // jSimple step, the variableName of a source step), else from the context, else from its value. One with no source, no
  // value and no such name was stored with status ok and sent "" (measured runs, 17/11: every sign-in of an app refused).
  api.emptyCallVariables = function (step) {
    var candidates = [];
    children(step).forEach(function (child) {
      if (!api.isVariable(child) || api.refsOf(child).length) {
        return;
      }
      var value = null;
      try {
        value = typeof child.getValueOrNull === "function" ? child.getValueOrNull() : null;
      } catch (_noValue) {
        value = null;
      }
      if (value == null || !str(value).length) {
        candidates.push(str(child.getName()));
      }
    });
    if (!candidates.length) {
      return [];
    }
    var sequence = api.sequenceOf(step);
    if (!sequence) {
      return [];
    }
    var declared = {};
    var scripts = [];
    var walk = function (dbo, depth) {
      children(dbo).forEach(function (child) {
        if (api.isVariable(child)) {
          if (dbo === sequence) {
            declared[str(child.getName())] = true;
          }
          return;
        }
        ["getVariableName", "getExpression", "getCondition"].forEach(function (getter) {
          try {
            if (typeof child[getter] === "function") {
              var text = str(child[getter]());
              if (getter === "getVariableName") {
                declared[text] = true;
              } else if (text.length) {
                scripts.push(text);
              }
            }
          } catch (_noGetter) {}
        });
        if (depth < 50) {
          walk(child, depth + 1);
        }
      });
    };
    walk(sequence, 0);
    var script = scripts.join("\n");
    return candidates.filter(function (name) {
      if (!name.length || declared[name]) {
        return false;
      }
      var escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return !new RegExp("(^|[^\\w$.])((var|let|const)\\s+" + escaped + "\\b|" + escaped + "\\s*=(?!=))").test(script);
    });
  };

  api.emptyCallVariablesWarning = function (qname, names) {
    return qname + ": " + names.join(", ") + " will be empty at run time. " + (names.length > 1 ? "They have" : "It has") +
      " no sourceDefinition, no value, and no sequence variable or JS variable of that name in the sequence. Give each a " +
      "sourceDefinition (an InputVariablesStep or another step of this sequence), a value, or set var <name> = ...; in a " +
      "SimpleStep before the call.";
  };
})(C8O.stepSources);
