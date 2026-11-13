/*
 * The shape of a sequence's JSON answer, read from its steps: the top-level keys its output steps write.
 *  - "envelope": a business sequence (business-sequence-create) answers {success, data, errors, meta};
 *  - "plain": the answer is the data itself, such as the upsert-crud facades ({rows}, {row}, {total}, {message}) and
 *    an error step's {error: {code, message}};
 *  - "unknown": an output the steps do not say (a computed key, an XML element, a transaction or sequence copied out).
 * ngx-page-create writes the page's tests for that shape, and project-lint compares what a page reads with it: a page
 * that tested out?.success on an upsert-crud facade kept its data null and showed "Error" over an answer with rows
 * (PipelineCrm, 12/11).
 */
C8O.sequenceResponse = C8O.sequenceResponse || {};

(function () {
  var R = C8O.sequenceResponse;
  var KEYED = { JsonFieldStep: "field", JsonArrayStep: "array", JsonObjectStep: "object", JsonToXmlStep: "json" };

  function simpleName(dbo) {
    try {
      var name = String(dbo.getClass().getName());
      name = name.substring(name.lastIndexOf(".") + 1);
      return name.substring(name.lastIndexOf("#") + 1);
    } catch (_noClass) {
      return "";
    }
  }

  function childrenOf(dbo) {
    var out = [];
    try {
      var all = dbo.getAllChildren();
      for (var i = 0; all && i < all.size(); i++) {
        out.push(all.get(i));
      }
      return out;
    } catch (_noChildren) {}
    try {
      return C8O.dbo && typeof C8O.dbo.getDirectChildren === "function" ? C8O.dbo.getDirectChildren(dbo) || [] : [];
    } catch (_noDirect) {
      return [];
    }
  }

  function flag(dbo, method) {
    try {
      return typeof dbo[method] === "function" ? dbo[method]() === true : null;
    } catch (_noFlag) {
      return null;
    }
  }

  // The plain text of a key SmartType, else null (a computed key).
  function plainKey(smart) {
    try {
      if (smart && typeof smart.getMode === "function") {
        if (String(smart.getMode()) !== "PLAIN") {
          return null;
        }
        var text = String(typeof smart.getExpression === "function" ? smart.getExpression() : smart.getValue()).trim();
        return text.length ? text : null;
      }
    } catch (_noKey) {}
    return null;
  }

  // {shape, keys, arrays, objects}: the top-level keys of the answer, those holding a list and those holding a record.
  R.of = function (sequence) {
    var result = { shape: "unknown", keys: [], arrays: [], objects: [] };
    if (!sequence) {
      return result;
    }
    var unknown = false;
    var add = function (list, key) {
      if (list.indexOf(key) < 0) {
        list.push(key);
      }
    };
    var stack = childrenOf(sequence);
    while (stack.length) {
      var step = stack.shift();
      var name = simpleName(step);
      if (!/Step$/.test(name) || flag(step, "isEnabled") === false) {
        continue;
      }
      if (KEYED[name]) {
        if (flag(step, "isOutput") === false) {
          continue;
        }
        var key = null;
        try {
          key = plainKey(step.getKey());
        } catch (_noGetKey) {
          key = null;
        }
        if (key === null) {
          unknown = true;
          continue;
        }
        add(result.keys, key);
        if (KEYED[name] === "array") {
          add(result.arrays, key);
        } else if (KEYED[name] === "object") {
          add(result.objects, key);
        }
        continue;
      }
      if (name === "XMLErrorStep") {
        add(result.keys, "error");
        continue;
      }
      if (flag(step, "isOutput") === true) {
        unknown = true;
        continue;
      }
      stack = childrenOf(step).concat(stack);
    }
    if (result.keys.indexOf("success") >= 0) {
      result.shape = "envelope";
    } else if (!unknown && result.keys.length) {
      result.shape = "plain";
    }
    return result;
  };

  // The TypeScript a page writes under a CallSequenceAction for an answer of that shape (out is the call's answer):
  // ok (the call succeeded), data (what the page keeps, its paths read from there), error (the text shown), authCode.
  R.expressions = function (shape) {
    if (shape === "envelope") {
      return {
        ok: "out?.success",
        data: "out?.success ? (out?.data ?? null) : null",
        error: "out?.success ? null : (out?.errors?.[0]?.message || 'Error')",
        errorOf: function (base) { return base + "?.errors?.[0]?.message || 'Error'"; },
        authCode: "out?.errors?.[0]?.code"
      };
    }
    if (shape === "plain") {
      return {
        ok: "(out != null && out?.error == null)",
        data: "out != null && out?.error == null ? out : null",
        error: "out != null && out?.error == null ? null : (out?.error?.message || 'Error')",
        errorOf: function (base) { return base + "?.error?.message || 'Error'"; },
        authCode: "out?.error?.code"
      };
    }
    // Either shape, decided on the answer: an envelope gives its data, any other answer is the data itself.
    var ok = "(out?.success === true || (out != null && out?.success === undefined && out?.error == null))";
    return {
      ok: ok,
      data: ok + " ? (out?.success === true ? (out?.data ?? null) : out) : null",
      error: ok + " ? null : (out?.errors?.[0]?.message || out?.error?.message || 'Error')",
      errorOf: function (base) { return base + "?.errors?.[0]?.message || " + base + "?.error?.message || 'Error'"; },
      authCode: "(out?.errors?.[0]?.code ?? out?.error?.code)"
    };
  };

  // The answer keys a page's code reads on out (out?.success, out.rows), not on another call's out (stack['X'].out).
  R.readKeys = function (text) {
    var keys = [];
    var re = /(^|[^\w$.\]])out\s*\??\.\s*([A-Za-z_$][\w$]*)/g;
    var m;
    while ((m = re.exec(String(text || ""))) !== null) {
      if (keys.indexOf(m[2]) < 0) {
        keys.push(m[2]);
      }
    }
    return keys;
  };

  // Whether the code decides the shape on the answer (the expressions of an unknown shape).
  R.readsEitherShape = function (text) {
    return /out\?\.success\s*===\s*undefined/.test(String(text || ""));
  };

  R.describe = function (response) {
    if (!response || response.shape === "unknown") {
      return "an answer whose keys its steps do not say";
    }
    return "{" + response.keys.join(", ") + "}";
  };
})();
