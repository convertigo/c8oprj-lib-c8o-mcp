if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.crudProof = C8O.crudProof || {};

(function () {
  if (C8O.crudProof._initialized === true) {
    return;
  }
  C8O.crudProof._initialized = true;

  function trimmed(ctx, value) {
    return ctx.trimmed(value);
  }

  function ensureArray(ctx, value) {
    return ctx.ensureArray(value);
  }

  function collectNestedValue(payload, paths) {
    for (var i = 0; i < paths.length; i++) {
      var current = payload;
      var parts = paths[i];
      var ok = true;
      for (var j = 0; j < parts.length; j++) {
        var key = parts[j];
        if (current == null || typeof current !== "object" || !(key in current)) {
          ok = false;
          break;
        }
        current = current[key];
      }
      if (ok && current !== undefined && current !== null) {
        return current;
      }
    }
    return null;
  }

  function summarizeRequestableProof(ctx, payload, requestable, result) {
    var safe = ctx.toJsonSafe ? ctx.toJsonSafe(payload, {
      warnings: ctx.ensureWarnings(result),
      path: "$.runtimeEvidence." + ctx.normalizedIdentifier(requestable)
    }) : payload;
    var summary = {
      requestable: requestable,
      status: ctx.normalizeStatus(safe && safe.status, "ok"),
      ok: ctx.isSuccessLikeStatus(safe && safe.status)
    };

    var totalValue = collectNestedValue(safe, [
      ["total"],
      ["result", "total"],
      ["response", "total"],
      ["item", "total"],
      ["document", "total"]
    ]);
    if (totalValue != null && totalValue !== "") {
      var totalNumber = Number(totalValue);
      summary.total = isNaN(totalNumber) ? String(totalValue) : totalNumber;
    }

    var itemsValue = collectNestedValue(safe, [
      ["items"],
      ["result", "items"],
      ["response", "items"],
      ["document", "items"]
    ]);
    if (Array.isArray(itemsValue)) {
      summary.itemCount = itemsValue.length;
    }

    var sourceValue = collectNestedValue(safe, [
      ["source"],
      ["result", "source"],
      ["response", "source"],
      ["document", "source"]
    ]);
    if (sourceValue != null && sourceValue !== "") {
      summary.source = String(sourceValue);
    }

    var messageValue = collectNestedValue(safe, [
      ["message"],
      ["result", "message"],
      ["response", "message"],
      ["error"],
      ["result", "error"],
      ["response", "error"]
    ]);
    if (!summary.ok && messageValue != null && messageValue !== "") {
      summary.message = String(messageValue);
    }

    return summary;
  }

  function requestablePayload(ctx, requestable, variables, result) {
    try {
      return ctx.callInternalSequence("tools_requestable_execute", {
        requestable: requestable,
        variables: variables || {}
      });
    } catch (proofError) {
      ctx.addWarning(result, "Unable to execute proof for " + requestable + ": " + String(proofError));
      return {
        status: "error",
        error: String(proofError)
      };
    }
  }

  function proofRequestable(ctx, requestable, variables, result) {
    var payload = requestablePayload(ctx, requestable, variables, result);
    return summarizeRequestableProof(ctx, payload, requestable, result);
  }

  function firstSqlOutputRow(_ctx, payload) {
    var sqlOutput = collectNestedValue(payload, [
      ["sql_output"],
      ["result", "sql_output"],
      ["response", "sql_output"],
      ["document", "sql_output"]
    ]);
    if (Array.isArray(sqlOutput) && sqlOutput.length) {
      return sqlOutput[0];
    }
    return null;
  }

  function collectSqlOutputRows(_ctx, payload) {
    var sqlOutput = collectNestedValue(payload, [
      ["sql_output"],
      ["result", "sql_output"],
      ["response", "sql_output"],
      ["document", "sql_output"],
      ["transaction", "document", "sql_output"],
      ["result", "transaction", "document", "sql_output"],
      ["response", "transaction", "document", "sql_output"]
    ]);
    return Array.isArray(sqlOutput) ? sqlOutput : [];
  }

  function extractRowField(_ctx, row, candidates) {
    if (!row || typeof row !== "object") {
      return null;
    }
    for (var i = 0; i < candidates.length; i++) {
      if (row[candidates[i]] !== undefined && row[candidates[i]] !== null && row[candidates[i]] !== "") {
        return row[candidates[i]];
      }
    }
    return null;
  }

  function parseLooseJson(ctx, value) {
    var candidate = value;
    for (var depth = 0; depth < 3; depth++) {
      if (typeof candidate !== "string") {
        return candidate;
      }
      var text = trimmed(ctx, candidate);
      if (!text.length) {
        return "";
      }
      try {
        candidate = JSON.parse(text);
      } catch (_ignoreLooseJson) {
        return text;
      }
    }
    return candidate;
  }

  function toArrayLike(_ctx, value) {
    if (value == null) {
      return null;
    }
    if (Array.isArray(value)) {
      return value.slice();
    }
    try {
      var NativeArray = Packages.org.mozilla.javascript.NativeArray;
      if (value instanceof NativeArray) {
        var nativeLength = Number(value.getLength ? value.getLength() : value.length);
        var nativeItems = [];
        for (var i = 0; i < nativeLength; i++) {
          nativeItems.push(value[i]);
        }
        return nativeItems;
      }
    } catch (_ignoreNativeArray) {}
    try {
      if (value instanceof Packages.java.util.Collection) {
        var collectionItems = [];
        var iterator = value.iterator();
        while (iterator.hasNext()) {
          collectionItems.push(iterator.next());
        }
        return collectionItems;
      }
    } catch (_ignoreJavaCollection) {}
    try {
      var javaClass = value && value.getClass ? value.getClass() : null;
      if (javaClass && javaClass.isArray && javaClass.isArray()) {
        var JavaArray = Packages.java.lang.reflect.Array;
        var arrayLength = JavaArray.getLength(value);
        var arrayItems = [];
        for (var j = 0; j < arrayLength; j++) {
          arrayItems.push(JavaArray.get(value, j));
        }
        return arrayItems;
      }
    } catch (_ignoreJavaArray) {}
    return null;
  }

  function normalizeProofRequestablesInput(ctx, value) {
    var source = value;
    if (source == null) {
      return [];
    }
    var arrayLike = toArrayLike(ctx, source);
    if (arrayLike) {
      return ctx.dedupeStrings(arrayLike);
    }
    if (ctx.toJsonSafe) {
      source = ctx.toJsonSafe(source, { maxDepth: 4 });
      arrayLike = toArrayLike(ctx, source);
      if (arrayLike) {
        return ctx.dedupeStrings(arrayLike);
      }
    }
    if (typeof source === "string") {
      source = parseLooseJson(ctx, source);
    }
    arrayLike = toArrayLike(ctx, source);
    if (arrayLike) {
      return ctx.dedupeStrings(arrayLike);
    }
    if (Array.isArray(source)) {
      return ctx.dedupeStrings(source);
    }
    if (source && typeof source === "object") {
      if (Array.isArray(source.requestables)) {
        return ctx.dedupeStrings(source.requestables);
      }
      arrayLike = toArrayLike(ctx, source.requestables);
      if (arrayLike) {
        return ctx.dedupeStrings(arrayLike);
      }
      if (typeof source.requestables === "string") {
        return normalizeProofRequestablesInput(ctx, source.requestables);
      }
    }
    var text = trimmed(ctx, source);
    if (!text.length) {
      return [];
    }
    if (text.indexOf(",") !== -1) {
      return ctx.dedupeStrings(text.split(","));
    }
    return [text];
  }

  function resolveProofRequestableQName(ctx, requestable, projectName, connectorName) {
    var text = trimmed(ctx, requestable);
    if (!text.length) {
      return "";
    }
    if (text.indexOf(".") !== -1) {
      if (text.indexOf(projectName + ".") === 0) {
        return text;
      }
      if (text.split(".").length >= 3) {
        return text;
      }
      return projectName + "." + text;
    }
    if (trimmed(ctx, connectorName).length) {
      return projectName + "." + connectorName + "." + text;
    }
    return projectName + "." + text;
  }

  function proofCheck(ctx, id, ok, message, target) {
    var check = {
      id: trimmed(ctx, id),
      status: ok ? "ok" : "missing",
      ok: ok === true
    };
    if (trimmed(ctx, message).length) {
      check.message = String(message);
    }
    if (trimmed(ctx, target).length) {
      check.target = String(target);
    }
    return check;
  }

  C8O.crudProof.summarizeRequestableProof = summarizeRequestableProof;
  C8O.crudProof.requestablePayload = requestablePayload;
  C8O.crudProof.proofRequestable = proofRequestable;
  C8O.crudProof.firstSqlOutputRow = firstSqlOutputRow;
  C8O.crudProof.collectSqlOutputRows = collectSqlOutputRows;
  C8O.crudProof.extractRowField = extractRowField;
  C8O.crudProof.normalizeProofRequestablesInput = normalizeProofRequestablesInput;
  C8O.crudProof.resolveProofRequestableQName = resolveProofRequestableQName;
  C8O.crudProof.proofCheck = proofCheck;
})();
