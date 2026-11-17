/*
 * Guards placed after a write. A step that refuses the caller (an If block holding an XMLErrorStep) runs in
 * the order of the sequence: placed after the call that writes, it refuses once the write is done. Measured run (17/11):
 * a delete sequence called the delete, then read the role and refused non-admins with 403: every caller's delete went
 * through, and the 403 came after. A check of the write's own answer (an IfExist on its ./document/error, an If on a
 * variable read from its answer) is a result check, not a guard, and is left alone.
 *
 * project-lint reports each guard after a write (SEQ-GUARD-AFTER-WRITE, error); tree-apply warns on the sequences it
 * changes. Engine objects in Rhino; the tests give plain ones and the hooks (isWrite, refsOf, children).
 */
if (typeof C8O === "undefined") { var C8O = {}; }
C8O.sequenceGuards = C8O.sequenceGuards || {};

(function (api) {
  function str(value) {
    return value == null ? "" : String(value).trim();
  }

  function simpleName(dbo) {
    try {
      var name = String(dbo.getClass().getName());
      return name.substring(name.lastIndexOf(".") + 1);
    } catch (_noClass) {
      return "";
    }
  }

  function call(dbo, getter) {
    try {
      return typeof dbo[getter] === "function" ? dbo[getter]() : null;
    } catch (_noGetter) {
      return null;
    }
  }

  function priorityOf(dbo) {
    try {
      return dbo.priority == null ? "" : str(dbo.priority);
    } catch (_noPriority) {
      return "";
    }
  }

  // An error answered to the caller. A ReturnStep alone is often an early end of a normal flow: not counted.
  var REFUSAL = /^XMLErrorStep$/;
  var BLOCK = /^(If|IfThenElse|IfExist|IfExistThenElse|IfNotExist|IsIn|IsInThenElse|IfFileExist|IfFileExistThenElse)Step$/;

  // The steps of a sequence in run order (a parent before its children), disabled ones and their children left out.
  function ordered(sequence, hooks) {
    var out = [];
    (function walk(parent, depth) {
      var list = hooks.children(parent);
      for (var i = 0; i < list.length && depth < 50; i++) {
        var node = list[i];
        var cls = simpleName(node);
        if (/Variable$/.test(cls) || !/Step$/.test(cls) || call(node, "isEnabled") === false) {
          continue;
        }
        out.push({ node: node, cls: cls, parent: parent, depth: depth });
        walk(node, depth + 1);
      }
    })(sequence, 0);
    return out;
  }

  function contains(hooks, ancestor, node) {
    var found = false;
    (function walk(parent, depth) {
      var list = hooks.children(parent);
      for (var i = 0; i < list.length && !found && depth < 50; i++) {
        if (list[i] === node) {
          found = true;
          return;
        }
        walk(list[i], depth + 1);
      }
    })(ancestor, 0);
    return found;
  }

  function refuses(hooks, block) {
    var found = false;
    (function walk(parent, depth) {
      var list = hooks.children(parent);
      for (var i = 0; i < list.length && !found && depth < 50; i++) {
        if (REFUSAL.test(simpleName(list[i])) && call(list[i], "isEnabled") !== false) {
          found = true;
          return;
        }
        walk(list[i], depth + 1);
      }
    })(block, 0);
    return found;
  }

  // The guards placed after a write: [{guard, guardName, write, writeName}] in run order, one per guard (its first write).
  // hooks: isWrite(step) -> bool, refsOf(step) -> [{priority}], children(dbo) -> [dbo].
  api.guardsAfterWrite = function (sequence, hooks) {
    var steps = ordered(sequence, hooks);
    var writes = [];
    // Variables read from a write's answer (a source step sourcing it), by name: an If on them checks the result.
    var fromWrite = {};
    var found = [];
    steps.forEach(function (entry) {
      var node = entry.node;
      var sources = [];
      try {
        sources = (hooks.refsOf(node) || []).map(function (r) { return str(r.priority); });
      } catch (_noRefs) {
        sources = [];
      }
      var readsWrite = writes.filter(function (w) { return sources.indexOf(w.priority) >= 0; });
      var declared = str(call(node, "getVariableName"));
      if (declared.length && readsWrite.length) {
        fromWrite[declared] = true;
      }
      if (BLOCK.test(entry.cls) && writes.length && refuses(hooks, node)) {
        var condition = str(call(node, "getCondition"));
        var checksResult = readsWrite.length > 0 || Object.keys(fromWrite).some(function (name) {
          return new RegExp("(^|[^\\w$.])" + name.replace(/[$]/g, "\\$") + "\\b").test(condition);
        });
        var before = writes.filter(function (w) { return !contains(hooks, w.node, node) && !contains(hooks, node, w.node); });
        if (!checksResult && before.length) {
          found.push({ guard: node, guardName: str(call(node, "getName")), write: before[0].node, writeName: before[0].name });
        }
      }
      if (/^(TransactionStep|SequenceStep)$/.test(entry.cls) && hooks.isWrite(node)) {
        writes.push({ node: node, name: str(call(node, "getName")), priority: priorityOf(node) });
      }
    });
    return found;
  };

  api.message = function (sequenceName, finding) {
    return "In " + sequenceName + ", " + finding.guardName + " can refuse the caller, but it runs after " + finding.writeName +
      ", which writes: the write is done for every caller, the refusal comes after it.";
  };

  api.fix = function (finding) {
    return "Move " + finding.guardName + " (and the reads it needs, a role read for example) before " + finding.writeName +
      " with databaseobject-move {qname, target:<" + finding.writeName + " qname>, position:\"before\"}, then prove the refusal: " +
      "the refused caller gets the error and the data is unchanged.";
  };

  // The engine hooks: the writes of js/requestable_contract.js, the sources of js/step_sources.js.
  api.engineHooks = function () {
    return {
      isWrite: function (step) {
        try {
          var cls = String(step.getClass().getName());
          var contract = C8O.requestableContract;
          if (/TransactionStep$/.test(cls) && typeof step.getTargetTransaction === "function") {
            var tx = step.getTargetTransaction();
            var txClass = tx ? String(tx.getClass().getName()) : "";
            return !!tx && ((typeof tx.getSqlQuery === "function" && contract.sqlWrites(tx.getSqlQuery())) ||
              /couchdb\.transactions\.(Post|Put|Delete|Update|Purge)/i.test(txClass) || /FullSync.*(Post|Put|Delete)/i.test(txClass));
          }
          if (/SequenceStep$/.test(cls) && typeof step.getTargetSequence === "function") {
            var target = step.getTargetSequence();
            return !!target && contract.writesOf(target, 1, {}).length > 0;
          }
        } catch (_unknownWrite) {}
        return false;
      },
      refsOf: function (step) {
        return C8O.stepSources ? C8O.stepSources.refsOf(step) : [];
      },
      children: function (dbo) {
        return C8O.dbo.getDirectChildren(dbo);
      }
    };
  };
})(C8O.sequenceGuards);
