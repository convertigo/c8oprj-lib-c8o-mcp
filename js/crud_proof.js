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
      ["rows"],
      ["result", "rows"],
      ["response", "rows"],
      ["document", "rows"],
      ["items"],
      ["result", "items"],
      ["response", "items"],
      ["document", "items"]
    ]);
    if (Array.isArray(itemsValue)) {
      summary.itemCount = itemsValue.length;
    }
    var rowValue = collectNestedValue(safe, [
      ["row"],
      ["result", "row"],
      ["response", "row"],
      ["document", "row"]
    ]);
    if (summary.itemCount == null && rowValue && typeof rowValue === "object") {
      summary.itemCount = 1;
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

  function requestablePayload(ctx, requestable, variables, result, options) {
    var extra = options && typeof options === "object" ? options : {};
    try {
      var args = {
        requestable: requestable,
        variables: variables || {}
      };
      if (extra.recordSchema === true) {
        args.recordSchema = true;
      }
      if (extra.includeLogs === true) {
        args.includeLogs = true;
      }
      return ctx.callInternalSequence("tools_requestable_execute", args);
    } catch (proofError) {
      ctx.addWarning(result, "Unable to execute proof for " + requestable + ": " + String(proofError));
      return {
        status: "error",
        error: String(proofError)
      };
    }
  }

  function proofRequestable(ctx, requestable, variables, result, options) {
    var payload = requestablePayload(ctx, requestable, variables, result, options);
    return summarizeRequestableProof(ctx, payload, requestable, result);
  }

  function firstSqlOutputRow(_ctx, payload) {
    var row = collectNestedValue(payload, [
      ["row"],
      ["result", "row"],
      ["response", "row"],
      ["document", "row"]
    ]);
    if (row && typeof row === "object") {
      return row;
    }
    var rows = collectNestedValue(payload, [
      ["rows"],
      ["result", "rows"],
      ["response", "rows"],
      ["document", "rows"],
      ["sql_output"],
      ["result", "sql_output"],
      ["response", "sql_output"],
      ["document", "sql_output"]
    ]);
    if (Array.isArray(rows) && rows.length) {
      return rows[0];
    }
    return null;
  }

  function collectSqlOutputRows(_ctx, payload) {
    var rows = collectNestedValue(payload, [
      ["rows"],
      ["result", "rows"],
      ["response", "rows"],
      ["document", "rows"],
      ["sql_output"],
      ["result", "sql_output"],
      ["response", "sql_output"],
      ["document", "sql_output"],
      ["transaction", "document", "sql_output"],
      ["result", "transaction", "document", "sql_output"],
      ["response", "transaction", "document", "sql_output"]
    ]);
    if (Array.isArray(rows)) {
      return rows;
    }
    var row = collectNestedValue(payload, [
      ["row"],
      ["result", "row"],
      ["response", "row"],
      ["document", "row"]
    ]);
    return row && typeof row === "object" ? [row] : [];
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

  function rowHasField(_ctx, row, candidates) {
    if (!row || typeof row !== "object") {
      return false;
    }
    for (var i = 0; i < candidates.length; i++) {
      if (row[candidates[i]] !== undefined) {
        return true;
      }
    }
    return false;
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
      return dedupeStrings(ctx, arrayLike);
    }
    if (ctx.toJsonSafe) {
      source = ctx.toJsonSafe(source, { maxDepth: 4 });
      arrayLike = toArrayLike(ctx, source);
      if (arrayLike) {
        return dedupeStrings(ctx, arrayLike);
      }
    }
    if (typeof source === "string") {
      source = parseLooseJson(ctx, source);
    }
    arrayLike = toArrayLike(ctx, source);
    if (arrayLike) {
      return dedupeStrings(ctx, arrayLike);
    }
    if (Array.isArray(source)) {
      return dedupeStrings(ctx, source);
    }
    if (source && typeof source === "object") {
      if (Array.isArray(source.requestables)) {
        return dedupeStrings(ctx, source.requestables);
      }
      arrayLike = toArrayLike(ctx, source.requestables);
      if (arrayLike) {
        return dedupeStrings(ctx, arrayLike);
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
      return dedupeStrings(ctx, text.split(","));
    }
    return [text];
  }

  function dedupeStrings(ctx, values) {
    var seen = {};
    var deduped = [];
    var items = ensureArray(ctx, values);
    for (var i = 0; i < items.length; i++) {
      var current = trimmed(ctx, items[i]);
      if (!current.length || seen[current]) {
        continue;
      }
      seen[current] = true;
      deduped.push(current);
    }
    return deduped;
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

  function connectorNameFromResult(ctx, result, fallback) {
    var explicit = trimmed(ctx, fallback);
    if (explicit.length) {
      return explicit.replace(/^cn:/, "");
    }
    var connectorQName = trimmed(ctx, result && result.connectorQname);
    var match = /\.cn:([^\.]+)$/.exec(connectorQName);
    return match ? trimmed(ctx, match[1]) : "";
  }

  function facadeSequenceToTransactionRequestableQName(ctx, facadeRequestableQName, projectName, facadePrefix, connectorName) {
    var requestable = trimmed(ctx, facadeRequestableQName);
    var connector = trimmed(ctx, connectorName);
    if (!requestable.length || !connector.length) {
      return "";
    }
    var sequenceName = requestable.split(".").pop();
    var prefix = trimmed(ctx, facadePrefix) + "_";
    var transactionName = sequenceName.indexOf(prefix) === 0 ? sequenceName.substring(prefix.length) : sequenceName;
    if (!transactionName.length) {
      return "";
    }
    return projectName + "." + connector + "." + transactionName;
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

  function pushMissing(ctx, result, value) {
    if (!result.missing) {
      result.missing = [];
    }
    if (trimmed(ctx, value).length) {
      result.missing.push(String(value));
    }
  }

  function singularize(ctx, value) {
    var text = trimmed(ctx, value).toLowerCase();
    if (!text.length) {
      return "";
    }
    if (/ies$/.test(text) && text.length > 3) {
      return text.substring(0, text.length - 3) + "y";
    }
    if (/ses$/.test(text) && text.length > 3) {
      return text.substring(0, text.length - 2);
    }
    if (/s$/.test(text) && text.length > 1) {
      return text.substring(0, text.length - 1);
    }
    return text;
  }

  function relationListName(ctx, relation) {
    var childPlural = ctx.pluralize ? ctx.pluralize(ctx.normalizedIdentifier(relation && relation.fromEntity || "")) : ctx.normalizedIdentifier(relation && relation.fromEntity || "");
    var parentSingular = singularize(ctx, relation && relation.toEntity || "");
    return "list_" + childPlural + "_by_" + parentSingular;
  }

  function relationRequestableQName(ctx, projectName, facadePrefix, relation) {
    return projectName + "." + facadePrefix + "_" + relationListName(ctx, relation);
  }

  function parseRelationDescriptorFromSequenceName(ctx, sequenceName, projectName, facadePrefix) {
    var text = trimmed(ctx, sequenceName);
    var prefix = trimmed(ctx, facadePrefix) + "_";
    if (!text.length || text.indexOf(prefix) !== 0) {
      return null;
    }
    var raw = text.substring(prefix.length);
    var match = /^list_(.+)_by_(.+)$/.exec(raw);
    if (!match) {
      return null;
    }
    return {
      inferred: true,
      type: "many-to-one",
      fromEntity: trimmed(ctx, match[1]),
      toEntity: trimmed(ctx, match[2]),
      txName: raw,
      requestableQName: projectName + "." + text
    };
  }

  function findSequenceByName(ctx, project, name) {
    if (!project || !project.getSequencesList || !trimmed(ctx, name).length) {
      return null;
    }
    try {
      var sequences = project.getSequencesList();
      for (var i = 0; i < sequences.size(); i++) {
        var sequence = sequences.get(i);
        if (trimmed(ctx, sequence && sequence.getName ? sequence.getName() : "") === trimmed(ctx, name)) {
          return sequence;
        }
      }
    } catch (_ignoreFindSequence) {}
    return null;
  }

  function discoverProjectRelationDescriptors(ctx, project, projectName, facadePrefix) {
    var descriptors = [];
    var seen = {};
    if (!project || !project.getSequencesList) {
      return descriptors;
    }
    try {
      var sequences = project.getSequencesList();
      for (var i = 0; i < sequences.size(); i++) {
        var sequence = sequences.get(i);
        var descriptor = parseRelationDescriptorFromSequenceName(ctx, sequence && sequence.getName ? sequence.getName() : "", projectName, facadePrefix);
        if (!descriptor) {
          continue;
        }
        if (seen[descriptor.requestableQName]) {
          continue;
        }
        seen[descriptor.requestableQName] = true;
        descriptors.push(descriptor);
      }
    } catch (_ignoreDiscoverRelations) {}
    return descriptors;
  }

  function requestableVariableNames(ctx, requestableQName, result) {
    try {
      var tree = ctx.callInternalSequence("tools_databaseobject_tree_get", {
        target: requestableQName,
        childrenDepth: 2,
        properties: "none",
        limit: 200
      });
      var names = [];
      function visit(node) {
        if (!node || typeof node !== "object") {
          return;
        }
        var className = trimmed(ctx, node.className);
        if (className.indexOf("variables.RequestableVariable") !== -1) {
          var variableName = trimmed(ctx, node.name);
          if (variableName.length && names.indexOf(variableName) === -1) {
            names.push(variableName);
          }
        }
        var children = node.children || [];
        for (var i = 0; i < children.length; i++) {
          visit(children[i]);
        }
      }
      visit(tree && tree.tree);
      return names;
    } catch (variableError) {
      ctx.addWarning(result, "Unable to inspect requestable variables for " + requestableQName + ": " + String(variableError));
      return [];
    }
  }

  function requestableSecurity(ctx, requestableQName, result) {
    if (!trimmed(ctx, requestableQName).length) {
      return {
        qname: "",
        present: false,
        accessibility: "",
        authenticatedContextRequired: false
      };
    }
    if (!ctx.resolveQName(requestableQName, { optional: true })) {
      return {
        qname: requestableQName,
        present: false,
        accessibility: "",
        authenticatedContextRequired: false
      };
    }
    try {
      var tree = ctx.callInternalSequence("tools_databaseobject_tree_get", {
        target: requestableQName,
        childrenDepth: 0,
        properties: "all",
        limit: 1
      });
      var props = tree && tree.tree && tree.tree.properties ? tree.tree.properties : {};
      return {
        qname: requestableQName,
        present: true,
        accessibility: trimmed(ctx, props.accessibility),
        authenticatedContextRequired: props && props.authenticatedContextRequired === true
      };
    } catch (securityError) {
      ctx.addWarning(result, "Unable to inspect requestable security for " + requestableQName + ": " + String(securityError));
      return {
        qname: requestableQName,
        present: true,
        accessibility: "",
        authenticatedContextRequired: false
      };
    }
  }

  function findParentListRequestableQName(ctx, project, projectName, facadePrefix, parentSingular) {
    var expectedPlural = ctx.pluralize ? ctx.pluralize(parentSingular) : (parentSingular + "s");
    var candidates = [];
    if (trimmed(ctx, expectedPlural).length) {
      candidates.push(trimmed(ctx, expectedPlural));
    }
    candidates.push(trimmed(ctx, parentSingular));
    if (project && project.getSequencesList) {
      try {
        var sequences = project.getSequencesList();
        for (var i = 0; i < sequences.size(); i++) {
          var sequence = sequences.get(i);
          var sequenceName = trimmed(ctx, sequence && sequence.getName ? sequence.getName() : "");
          var prefix = trimmed(ctx, facadePrefix) + "_list_";
          if (sequenceName.indexOf(prefix) !== 0 || sequenceName.indexOf("_by_") !== -1) {
            continue;
          }
          var entityName = sequenceName.substring(prefix.length);
          if (candidates.indexOf(entityName) !== -1 || singularize(ctx, entityName) === singularize(ctx, parentSingular)) {
            return projectName + "." + sequenceName;
          }
        }
      } catch (_ignoreParentRequestable) {}
    }
    return projectName + "." + facadePrefix + "_list_" + expectedPlural;
  }

  function relationDescriptors(ctx, spec, project, facadePrefix) {
    var explicit = ctx.ensureArray(spec && spec.relations);
    var seen = {};
    var descriptors = [];
    for (var i = 0; i < explicit.length; i++) {
      var relation = explicit[i];
      if (!relation || relation.type !== "many-to-one") {
        continue;
      }
      var requestableQName = relationRequestableQName(ctx, spec.project, facadePrefix, relation);
      seen[requestableQName] = true;
      descriptors.push({
        name: relation.name,
        type: relation.type,
        fromEntity: relation.fromEntity,
        fromField: relation.fromField,
        toEntity: relation.toEntity,
        toField: relation.toField,
        labelAlias: relation.labelAlias || (trimmed(ctx, relation.fromField) + "__label"),
        requestableQName: requestableQName,
        parentListRequestableQName: spec.project + "." + facadePrefix + "_list_" + (ctx.pluralize ? ctx.pluralize(relation.toEntity) : relation.toEntity),
        relationVariableName: relation.fromField
      });
    }
    var discovered = discoverProjectRelationDescriptors(ctx, project, spec.project, facadePrefix);
    for (var j = 0; j < discovered.length; j++) {
      var discoveredDescriptor = discovered[j];
      if (seen[discoveredDescriptor.requestableQName]) {
        continue;
      }
      discoveredDescriptor.parentListRequestableQName = findParentListRequestableQName(ctx, project, spec.project, facadePrefix, discoveredDescriptor.toEntity);
      descriptors.push(discoveredDescriptor);
      seen[discoveredDescriptor.requestableQName] = true;
    }
    return descriptors;
  }

  function relationProofResult(ctx, descriptor, proof, labelPresent) {
    return {
      requestable: descriptor.requestableQName,
      parentRequestable: descriptor.parentListRequestableQName,
      variable: descriptor.relationVariableName,
      labelAlias: descriptor.labelAlias,
      status: proof.status,
      ok: proof.ok === true,
      labelPresent: labelPresent === true
    };
  }

  function buildCrudStatus(ctx, spec, connector, result) {
    var project = ctx.findProjectByName(spec.project);
    var crm = ctx.crmRelationContext(spec);
    var status = {
      status: "ok",
      project: spec.project,
      driverFamily: spec.database.driver.id,
      connectorQname: connector && connector.getFullQName ? String(connector.getFullQName()) : "",
      transactions: {
        present: [],
        missing: []
      },
      sequences: {
        present: [],
        missing: []
      },
      ui: {
        starterDominant: null,
        visibleShellPresent: false,
        liveBindingPresent: false,
        statefulActionsPresent: false,
        pageBootstrapPresent: false,
        authBootstrapPresent: false,
        workInProgressVisible: null,
        expectedGlobals: ctx.statefulUiGlobals(spec.ui.variant),
        targetQName: ctx.findPageContentQName(spec.project, spec.ui.entryPage)
      },
      auth: {
        loginRequestable: spec.project + ".auth_login",
        logoutRequestable: spec.project + ".auth_logout",
        loginPresent: false,
        logoutPresent: false,
        loginHidden: false,
        loginAuthenticatedContextRequired: false,
        logoutHidden: false,
        logoutAuthenticatedContextRequired: false,
        facadeHiddenAuthenticatedPresent: [],
        insecureFacadeSequences: []
      },
      crm: {
        enabled: !!crm,
        relationRequestable: crm ? (spec.project + "." + spec.facade.prefix + "_list_company_contacts") : ""
      },
      relations: {
        present: [],
        missing: [],
        proofs: []
      },
      missing: [],
      warnings: []
    };
    var relationDescriptorsOut = relationDescriptors(ctx, spec, project, spec.facade.prefix);

    var expectedTransactions = ["init_schema"];
    for (var i = 0; i < spec.entities.length; i++) {
      expectedTransactions.push(ctx.txName(spec.entities[i], "list"));
      expectedTransactions.push(ctx.txName(spec.entities[i], "count"));
      expectedTransactions.push(ctx.txName(spec.entities[i], "read"));
      expectedTransactions.push(ctx.txName(spec.entities[i], "create"));
      expectedTransactions.push(ctx.txName(spec.entities[i], "update"));
      expectedTransactions.push(ctx.txName(spec.entities[i], "delete"));
    }
    for (var relationIndex = 0; relationIndex < relationDescriptorsOut.length; relationIndex++) {
      var relationDescriptor = relationDescriptorsOut[relationIndex];
      if (!relationDescriptor || !trimmed(ctx, relationDescriptor.requestableQName).length) {
        continue;
      }
      if (crm && relationDescriptor.requestableQName === status.crm.relationRequestable) {
        continue;
      }
      var relationTxName = trimmed(ctx, relationDescriptor.requestableQName.split(".").pop()).replace(trimmed(ctx, spec.facade.prefix) + "_", "");
      if (relationTxName.length && expectedTransactions.indexOf(relationTxName) === -1) {
        expectedTransactions.push(relationTxName);
      }
    }
    if (!spec.entities.length && connector && connector.getTransactionsList) {
      try {
        var txList = connector.getTransactionsList();
        for (var txIndex = 0; txIndex < txList.size(); txIndex++) {
          var txNameValue = trimmed(ctx, txList.get(txIndex).getName());
          if (txNameValue.length && expectedTransactions.indexOf(txNameValue) === -1) {
            expectedTransactions.push(txNameValue);
          }
        }
      } catch (_ignoreTxList) {}
    }

    for (var j = 0; j < expectedTransactions.length; j++) {
      var txQName = spec.project + "." + spec.database.connector + "." + expectedTransactions[j];
      if (ctx.resolveQName(txQName, { optional: true })) {
        status.transactions.present.push(txQName);
      } else {
        status.transactions.missing.push(txQName);
        status.missing.push(txQName);
      }
    }
    if (!crm && ctx.resolveQName(spec.project + "." + spec.database.connector + ".list_contacts", { optional: true }) && ctx.resolveQName(spec.project + "." + spec.database.connector + ".list_companies", { optional: true })) {
      crm = { inferred: true };
      status.crm.enabled = true;
      status.crm.relationRequestable = spec.project + "." + spec.facade.prefix + "_list_company_contacts";
    }
    if (status.crm.enabled) {
      var relationTxQName = spec.project + "." + spec.database.connector + ".list_company_contacts";
      if (ctx.resolveQName(relationTxQName, { optional: true })) {
        status.transactions.present.push(relationTxQName);
      } else {
        status.transactions.missing.push(relationTxQName);
        status.missing.push(relationTxQName);
      }
    }

    if (ctx.toBoolean(result.sequence, true)) {
      var facadeSequenceQNames = [];
      for (var k = 0; k < spec.entities.length; k++) {
        var entity = spec.entities[k];
        var verbs = ["list", "count", "read", "create", "update", "delete"];
        for (var v = 0; v < verbs.length; v++) {
          var seqName = spec.facade.prefix + "_" + ctx.txName(entity, verbs[v]);
          var seqQName = spec.project + "." + seqName;
          facadeSequenceQNames.push(seqQName);
          if (ctx.resolveQName(seqQName, { optional: true })) {
            status.sequences.present.push(seqQName);
          } else {
            status.sequences.missing.push(seqQName);
            status.missing.push(seqQName);
          }
        }
      }
      for (var relationSeqIndex = 0; relationSeqIndex < relationDescriptorsOut.length; relationSeqIndex++) {
        var relationRequestableQNameValue = trimmed(ctx, relationDescriptorsOut[relationSeqIndex] && relationDescriptorsOut[relationSeqIndex].requestableQName);
        if (!relationRequestableQNameValue.length || relationRequestableQNameValue === status.crm.relationRequestable) {
          continue;
        }
        if (ctx.resolveQName(relationRequestableQNameValue, { optional: true })) {
          status.sequences.present.push(relationRequestableQNameValue);
          status.relations.present.push(relationRequestableQNameValue);
          facadeSequenceQNames.push(relationRequestableQNameValue);
        } else {
          status.sequences.missing.push(relationRequestableQNameValue);
          status.relations.missing.push(relationRequestableQNameValue);
          status.missing.push(relationRequestableQNameValue);
        }
      }
      if (!spec.entities.length && project && project.getSequencesList) {
        try {
          var sequences = project.getSequencesList();
          var sequencePrefix = spec.project + ".sq:" + spec.facade.prefix + "_";
          for (var seqIndex = 0; seqIndex < sequences.size(); seqIndex++) {
            var sequence = sequences.get(seqIndex);
            var seqQNameAny = sequence.getFullQName ? String(sequence.getFullQName()) : "";
            if (seqQNameAny.indexOf(sequencePrefix) === 0) {
              status.sequences.present.push(seqQNameAny);
            }
          }
        } catch (_ignoreSequencesList) {}
      }
      if (status.crm.enabled) {
        var relationSeqQName = spec.project + "." + spec.facade.prefix + "_list_company_contacts";
        if (ctx.resolveQName(relationSeqQName, { optional: true })) {
          status.sequences.present.push(relationSeqQName);
          facadeSequenceQNames.push(relationSeqQName);
          if (status.relations.present.indexOf(relationSeqQName) === -1) {
            status.relations.present.push(relationSeqQName);
          }
        } else {
          status.sequences.missing.push(relationSeqQName);
          if (status.relations.missing.indexOf(relationSeqQName) === -1) {
            status.relations.missing.push(relationSeqQName);
          }
          status.missing.push(relationSeqQName);
        }
      }

      var loginSecurity = requestableSecurity(ctx, status.auth.loginRequestable, status);
      status.auth.loginPresent = loginSecurity.present === true;
      status.auth.loginHidden = loginSecurity.accessibility === "Hidden";
      status.auth.loginAuthenticatedContextRequired = loginSecurity.authenticatedContextRequired === true;
      if (!loginSecurity.present) {
        status.sequences.missing.push(status.auth.loginRequestable);
        status.missing.push(status.auth.loginRequestable);
      } else {
        status.sequences.present.push(status.auth.loginRequestable);
        if (!status.auth.loginHidden || status.auth.loginAuthenticatedContextRequired) {
          status.missing.push(status.auth.loginRequestable);
        }
      }

      var logoutSecurity = requestableSecurity(ctx, status.auth.logoutRequestable, status);
      status.auth.logoutPresent = logoutSecurity.present === true;
      status.auth.logoutHidden = logoutSecurity.accessibility === "Hidden";
      status.auth.logoutAuthenticatedContextRequired = logoutSecurity.authenticatedContextRequired === true;
      if (!logoutSecurity.present) {
        status.sequences.missing.push(status.auth.logoutRequestable);
        status.missing.push(status.auth.logoutRequestable);
      } else {
        status.sequences.present.push(status.auth.logoutRequestable);
        if (!status.auth.logoutHidden || status.auth.logoutAuthenticatedContextRequired) {
          status.missing.push(status.auth.logoutRequestable);
        }
      }

      facadeSequenceQNames = dedupeStrings(ctx, facadeSequenceQNames);
      for (var securedIndex = 0; securedIndex < facadeSequenceQNames.length; securedIndex++) {
        var securedQName = facadeSequenceQNames[securedIndex];
        var securedSecurity = requestableSecurity(ctx, securedQName, status);
        if (securedSecurity.present && securedSecurity.accessibility === "Hidden" && securedSecurity.authenticatedContextRequired === true) {
          status.auth.facadeHiddenAuthenticatedPresent.push(securedQName);
        } else {
          status.auth.insecureFacadeSequences.push(securedQName);
          status.missing.push(securedQName);
        }
      }
    }

    try {
      var uiTree = ctx.callInternalSequence("tools_databaseobject_tree_get", {
        target: status.ui.targetQName,
        childrenDepth: 5,
        properties: "none",
        limit: 320
      });
      var uiAudit = ctx.auditUiTreePayload(uiTree);
      status.ui.starterDominant = uiAudit.starterDominant;
      status.ui.visibleShellPresent = uiAudit.visibleShellPresent;
      status.ui.liveBindingPresent = uiAudit.liveBindingPresent;
    } catch (uiError) {
      ctx.addWarning(status, "Unable to inspect UI target: " + String(uiError));
    }

    try {
      var bootstrapStackQName = trimmed(ctx, spec.ui.variant).toLowerCase() === "master-detail"
        ? ctx.crmActionQName(spec.project, "crm_bootstrap_dashboard")
        : ctx.dashboardActionQName(spec.project, "crud_bootstrap_dashboard");
      var retryStackQName = trimmed(ctx, spec.ui.variant).toLowerCase() === "master-detail"
        ? ctx.crmActionQName(spec.project, "crm_retry_dashboard")
        : ctx.dashboardActionQName(spec.project, "crud_retry_dashboard");
      status.ui.statefulActionsPresent = !!ctx.resolveQName(bootstrapStackQName, { optional: true });
      status.ui.retryActionPresent = !!ctx.resolveQName(retryStackQName, { optional: true });
    } catch (uiActionError) {
      ctx.addWarning(status, "Unable to inspect UI shared actions: " + String(uiActionError));
    }

    try {
      var pageTree = ctx.callInternalSequence("tools_databaseobject_tree_get", {
        target: ctx.pageQName(spec.project, spec.ui.entryPage),
        childrenDepth: 3,
        properties: "all",
        limit: 180
      });
      var pageNames = ctx.collectTreeNames(pageTree && pageTree.tree, []);
      var pageScriptContent = "";
      if (pageTree && pageTree.tree && pageTree.tree.properties && pageTree.tree.properties.scriptContent != null) {
        pageScriptContent = String(pageTree.tree.properties.scriptContent);
      }
      var hasPageEventBootstrap = pageNames.indexOf("PageEvent") !== -1 && pageNames.indexOf("InvokeBootstrapDashboard") !== -1;
      var hasScriptBootstrap = trimmed(ctx, spec.ui.variant).toLowerCase() === "master-detail"
        ? /bootstrapCrmDashboardState|crmBuildStage/.test(pageScriptContent)
        : /bootstrapCrudDashboardState|crudBuildStage/.test(pageScriptContent);
      status.ui.pageBootstrapPresent = hasPageEventBootstrap || hasScriptBootstrap;
    } catch (pageInspectError) {
      ctx.addWarning(status, "Unable to inspect UI page bootstrap hook: " + String(pageInspectError));
    }

    try {
      var sessionBootstrapTree = ctx.callInternalSequence("tools_databaseobject_tree_get", {
        target: ctx.sessionBootstrapPageQName(spec.project),
        childrenDepth: 3,
        properties: "all",
        limit: 180
      });
      var sessionNames = ctx.collectTreeNames(sessionBootstrapTree && sessionBootstrapTree.tree, []);
      status.ui.sessionBootstrapPresent = sessionNames.indexOf("PageEvent") !== -1;
      status.ui.authBootstrapPresent = sessionNames.indexOf("InvokeCrudAuthLogin") !== -1;
      status.ui.sessionRootRedirectPresent = sessionNames.indexOf("OpenCrudLanding") !== -1;
    } catch (sessionBootstrapError) {
      ctx.addWarning(status, "Unable to inspect session bootstrap page: " + String(sessionBootstrapError));
    }

    if (status.missing.length) {
      status.status = "partial";
    }
    return status;
  }

  function inspectCrudStatus(ctx, options) {
    var projectName = trimmed(ctx, options.project);
    if (!projectName.length) {
      throw new Error("project is required");
    }
    var project = ctx.findProjectByName(projectName);
    if (!project) {
      return {
        status: "not_found",
        project: projectName,
        connectorQname: "",
        driverFamily: "",
        missing: [projectName],
        warnings: []
      };
    }
    var facadePrefix = trimmed(ctx, options.facadePrefix || "crud");
    var fakeSpec = {
      project: projectName,
      starter: "ngx",
      facade: {
        prefix: facadePrefix,
        publicListSequence: ""
      },
      seed: {
        enabled: true,
        profile: trimmed(ctx, options.profile || (facadePrefix.toLowerCase() === "crm" ? "crm" : "realistic")),
        rowsPerEntity: trimmed(ctx, options.profile || "").toLowerCase() === "crm" || facadePrefix.toLowerCase() === "crm" ? 20 : 2
      },
      ui: {
        entryPage: trimmed(ctx, options.entryPage || "Home"),
        variant: trimmed(ctx, options.variant || (facadePrefix.toLowerCase() === "crm" ? "master-detail" : "entity-pages"))
      },
      database: ctx.normalizeDatabaseSpec({
        project: projectName,
        database: {
          mode: options.mode || "hsqldb",
          connector: options.connector || "appdb"
        }
      }, {}),
      entities: []
    };
    var connectorName = trimmed(ctx, options.connector || "");
    var connector = ctx.findSqlConnectorInProject(project, connectorName);
    if (!connectorName.length && connector && connector.getName) {
      connectorName = String(connector.getName());
    }
    if (!connector && !connectorName.length) {
      connectorName = fakeSpec.database.connector;
    }
    var status = buildCrudStatus(ctx, fakeSpec, connector, {
      sequence: true,
      warnings: []
    });
    if (!connector) {
      status.status = "partial";
      status.missing.push(projectName + "." + connectorName);
    } else {
      status.driverFamily = ctx.inferDriverFamilyFromConnector(connector);
    }
    return status;
  }

  function refreshBuilderProbe(ctx, result, currentProbe) {
    try {
      return ctx.callInternalSequence("tools_mobile_builder_open", {
        project: result.project,
        timeoutSec: 20,
        logsLimit: 30,
        forceRestart: false
      });
    } catch (builderProbeRetryError) {
      ctx.addWarning(result, "Unable to refresh the mobile builder probe from crud-proof: " + String(builderProbeRetryError));
      return currentProbe;
    }
  }

  function crudStatus(ctx, options) {
    return inspectCrudStatus(ctx, options || {});
  }

  function crudProof(ctx, options) {
    var opts = options || {};
    var result = inspectCrudStatus(ctx, opts);
    result.entryPage = trimmed(ctx, opts.entryPage || "Home");
    result.expectUiShell = ctx.toBoolean(opts.expectUiShell, false);
    result.viewerUrl = trimmed(ctx, opts.viewerUrl || "");
    result.requestables = [];
    result.checks = [];

    if (result.status === "not_found") {
      result.checks.push(proofCheck(ctx, "project", false, "Project was not found.", result.project));
      return ctx.toJsonSafe ? ctx.toJsonSafe(result, { warnings: ctx.ensureWarnings(result), path: "$" }) : result;
    }

    result.checks.push(proofCheck(ctx, "transactions", !(result.transactions && result.transactions.missing && result.transactions.missing.length), (result.transactions && result.transactions.missing && result.transactions.missing.length) ? "Missing SQL transactions remain." : "", result.connectorQname));
    result.checks.push(proofCheck(ctx, "sequences", !(result.sequences && result.sequences.missing && result.sequences.missing.length), (result.sequences && result.sequences.missing && result.sequences.missing.length) ? "Missing CRUD facade or auth sequences remain." : "", result.project));
    result.checks.push(proofCheck(ctx, "relations", !(result.relations && result.relations.missing && result.relations.missing.length), (result.relations && result.relations.missing && result.relations.missing.length) ? "Missing relation CRUD requestables remain." : "", result.project));
    result.checks.push(proofCheck(
      ctx,
      "facade-hidden-authenticated",
      !!(result.auth && result.auth.insecureFacadeSequences && !result.auth.insecureFacadeSequences.length),
      !!(result.auth && result.auth.insecureFacadeSequences && !result.auth.insecureFacadeSequences.length) ? "" : "CRUD facade sequences must be hidden and require an authenticated context.",
      result.project
    ));
    result.checks.push(proofCheck(
      ctx,
      "auth-sequences",
      !!(result.auth && result.auth.loginPresent && result.auth.logoutPresent && result.auth.loginHidden && !result.auth.loginAuthenticatedContextRequired && result.auth.logoutHidden && !result.auth.logoutAuthenticatedContextRequired),
      !!(result.auth && result.auth.loginPresent && result.auth.logoutPresent && result.auth.loginHidden && !result.auth.loginAuthenticatedContextRequired && result.auth.logoutHidden && !result.auth.logoutAuthenticatedContextRequired)
        ? ""
        : "Generated auth_login/auth_logout skeleton sequences are missing or expose the wrong visibility/auth settings.",
      result.project
    ));

    var requestables = normalizeProofRequestablesInput(ctx, opts.proofRequestables);
    var connectorName = connectorNameFromResult(ctx, result, opts.connector || "");
    for (var i = 0; i < requestables.length; i++) {
      var qname = resolveProofRequestableQName(ctx, requestables[i], result.project, connectorName);
      if (!qname.length) {
        continue;
      }
      var proof = ctx.proofRequestable(qname, {}, result);
      result.requestables.push(proof);
      result.checks.push(proofCheck(ctx, "requestable:" + ctx.normalizedIdentifier(qname), proof.ok === true, proof.ok === true ? "" : (proof.message || "Runtime proof failed."), qname));
      if (proof.ok !== true) {
        pushMissing(ctx, result, qname);
      }
    }

    if (!(result.crm && result.crm.enabled)) {
      var project = ctx.findProjectByName(result.project);
      var relationDescriptorsForProof = relationDescriptors(ctx, {
        project: result.project,
        facade: {
          prefix: trimmed(ctx, opts.facadePrefix || "crud")
        },
        relations: []
      }, project, trimmed(ctx, opts.facadePrefix || "crud"));
      for (var relationProofIndex = 0; relationProofIndex < relationDescriptorsForProof.length; relationProofIndex++) {
        var relationDescriptorValue = relationDescriptorsForProof[relationProofIndex];
        if (!relationDescriptorValue || !trimmed(ctx, relationDescriptorValue.requestableQName).length) {
          continue;
        }
        if (!ctx.resolveQName(relationDescriptorValue.requestableQName, { optional: true })) {
          continue;
        }
        var relationVariableNames = requestableVariableNames(ctx, relationDescriptorValue.requestableQName, result);
        var relationVariableName = trimmed(ctx, relationDescriptorValue.relationVariableName || relationVariableNames[0] || "");
        if (!relationVariableName.length && relationVariableNames.length) {
          relationVariableName = trimmed(ctx, relationVariableNames[0]);
        }
        if (!relationVariableName.length) {
          ctx.addWarning(result, "Unable to infer the input variable for relation proof " + relationDescriptorValue.requestableQName + ".");
          continue;
        }
        relationDescriptorValue.relationVariableName = relationVariableName;
        var parentListQName = trimmed(ctx, relationDescriptorValue.parentListRequestableQName);
        if (!parentListQName.length) {
          parentListQName = findParentListRequestableQName(ctx, project, result.project, trimmed(ctx, opts.facadePrefix || "crud"), relationDescriptorValue.toEntity);
        }
        var parentTxQName = facadeSequenceToTransactionRequestableQName(ctx, parentListQName, result.project, trimmed(ctx, opts.facadePrefix || "crud"), connectorName);
        var relationTxQName = facadeSequenceToTransactionRequestableQName(ctx, relationDescriptorValue.requestableQName, result.project, trimmed(ctx, opts.facadePrefix || "crud"), connectorName);
        var parentPayload = ctx.requestablePayload(parentTxQName || parentListQName, {}, result);
        var parentProof = ctx.summarizeRequestableProof(parentPayload, parentTxQName || parentListQName, result);
        result.requestables.push(parentProof);
        result.checks.push(proofCheck(ctx, "requestable:" + ctx.normalizedIdentifier(parentListQName), parentProof.ok === true, parentProof.ok ? "" : (parentProof.message || "Parent list proof failed."), parentListQName));
        var parentRow = ctx.firstSqlOutputRow(parentPayload);
        var parentId = ctx.extractRowField(parentRow, [
          String((relationDescriptorValue.toField || "")).toUpperCase(),
          String(relationDescriptorValue.toField || "").toLowerCase(),
          "ID",
          "id"
        ]);
        if (parentId == null || parentId === "") {
          result.checks.push(proofCheck(ctx, "relation:" + ctx.normalizedIdentifier(relationDescriptorValue.requestableQName), false, "No parent row was available to prove the relation facade.", relationDescriptorValue.requestableQName));
          pushMissing(ctx, result, relationDescriptorValue.requestableQName);
          continue;
        }
        var relationPayload = ctx.requestablePayload(relationTxQName || relationDescriptorValue.requestableQName, (function () {
          var vars = {};
          vars[relationVariableName] = String(parentId);
          return vars;
        })(), result);
        var relationProof = ctx.summarizeRequestableProof(relationPayload, relationTxQName || relationDescriptorValue.requestableQName, result);
        var relationRow = ctx.firstSqlOutputRow(relationPayload);
        var labelAlias = trimmed(ctx, relationDescriptorValue.labelAlias || (relationVariableName + "__label"));
        var labelPresent = !!(labelAlias.length && rowHasField(ctx, relationRow, [
          labelAlias,
          String(labelAlias).toUpperCase(),
          String(labelAlias).toLowerCase()
        ]));
        result.requestables.push(relationProof);
        result.relations.proofs.push(relationProofResult(ctx, relationDescriptorValue, relationProof, labelPresent));
        result.checks.push(proofCheck(ctx, "relation:" + ctx.normalizedIdentifier(relationDescriptorValue.requestableQName), relationProof.ok === true, relationProof.ok ? "" : (relationProof.message || "Relation requestable proof failed."), relationDescriptorValue.requestableQName));
        result.checks.push(proofCheck(ctx, "relation-label:" + ctx.normalizedIdentifier(relationDescriptorValue.requestableQName), labelPresent || relationProof.itemCount === 0, (labelPresent || relationProof.itemCount === 0) ? "" : ("Relation label alias `" + labelAlias + "` is missing from the relation payload."), relationDescriptorValue.requestableQName));
        if (relationProof.ok !== true || !(labelPresent || relationProof.itemCount === 0)) {
          pushMissing(ctx, result, relationDescriptorValue.requestableQName);
        }
      }
    }

    if (result.crm && result.crm.enabled) {
      var companiesRequestable = result.project + "." + trimmed(ctx, opts.facadePrefix || "crud") + "_list_companies";
      var companiesTxRequestable = facadeSequenceToTransactionRequestableQName(ctx, companiesRequestable, result.project, trimmed(ctx, opts.facadePrefix || "crud"), connectorName);
      var companyListPayload = ctx.requestablePayload(companiesTxRequestable || companiesRequestable, {}, result);
      var companyListProof = ctx.summarizeRequestableProof(companyListPayload, companiesTxRequestable || companiesRequestable, result);
      result.requestables.push(companyListProof);
      result.checks.push(proofCheck(ctx, "requestable:" + ctx.normalizedIdentifier(companiesRequestable), companyListProof.ok === true, companyListProof.ok ? "" : (companyListProof.message || "Company list proof failed."), companiesRequestable));
      var firstCompanyRow = ctx.firstSqlOutputRow(companyListPayload);
      var firstCompanyId = ctx.extractRowField(firstCompanyRow, ["ID", "id"]);
      var relationRequestable = result.crm.relationRequestable;
      if (firstCompanyId == null || firstCompanyId === "") {
        result.checks.push(proofCheck(ctx, "crm-company-selection", false, "No company row was available to prove the company->contacts relation.", companiesRequestable));
        pushMissing(ctx, result, relationRequestable);
      } else {
        var relationTxRequestable = facadeSequenceToTransactionRequestableQName(ctx, relationRequestable, result.project, trimmed(ctx, opts.facadePrefix || "crud"), connectorName);
        var relationPayload = ctx.requestablePayload(relationTxRequestable || relationRequestable, { company_id: String(firstCompanyId) }, result);
        var relationProof = ctx.summarizeRequestableProof(relationPayload, relationTxRequestable || relationRequestable, result);
        result.requestables.push(relationProof);
        result.checks.push(proofCheck(ctx, "crm-company-contacts", relationProof.ok === true, relationProof.ok ? "" : (relationProof.message || "Company contacts relation proof failed."), relationRequestable));
        if (relationProof.ok !== true) {
          pushMissing(ctx, result, relationRequestable);
        }
      }
    }

    if (result.expectUiShell) {
      var shellVisible = result.ui && result.ui.visibleShellPresent === true;
      var starterReplaced = result.ui && result.ui.starterDominant === false;
      var liveBinding = result.ui && result.ui.liveBindingPresent === true;
      var statefulActions = result.ui && result.ui.statefulActionsPresent === true;
      var pageBootstrap = result.ui && result.ui.pageBootstrapPresent === true;
      var authBootstrap = result.ui && result.ui.authBootstrapPresent === true;
      var sessionBootstrap = result.ui && result.ui.sessionBootstrapPresent === true;
      var sessionRootRedirect = result.ui && result.ui.sessionRootRedirectPresent === true;
      var builderProbe = null;
      try {
        builderProbe = ctx.callInternalSequence("tools_mobile_builder_open", {
          project: result.project,
          timeoutSec: 20,
          logsLimit: 30,
          forceRestart: false
        });
        result.ui.builderProbe = builderProbe || {};
        result.viewerUrl = trimmed(ctx, (builderProbe && (builderProbe.viewerHomeUrl || builderProbe.viewerBaseUrl || builderProbe.viewerUrl)) || result.viewerUrl);
      } catch (builderProbeError) {
        ctx.addWarning(result, "Unable to probe the mobile builder from crud-proof: " + String(builderProbeError));
        result.ui.builderProbe = {
          status: "error",
          message: String(builderProbeError),
          compileErrors: []
        };
      }
      var builderProbeAttempts = 0;
      while (builderProbeAttempts < 8) {
        var currentProbe = result.ui.builderProbe || {};
        var currentReady = currentProbe.status === "ready";
        var currentBodyText = trimmed(ctx, currentProbe.browser && currentProbe.browser.bodyTextSample);
        var currentWorkInProgressVisible = currentReady && /work in progress/i.test(currentBodyText);
        if ((currentReady && !currentWorkInProgressVisible) || (currentProbe.status !== "compile_error" && currentProbe.status !== "building")) {
          break;
        }
        builderProbeAttempts += 1;
        try {
          java.lang.Thread.sleep(1500);
        } catch (_ignoreBuilderProbeSleep) {}
        result.ui.builderProbe = refreshBuilderProbe(ctx, result, currentProbe) || currentProbe;
        result.viewerUrl = trimmed(ctx, ((result.ui.builderProbe || {}).viewerHomeUrl || (result.ui.builderProbe || {}).viewerBaseUrl || (result.ui.builderProbe || {}).viewerUrl) || result.viewerUrl);
      }
      var builderReady = !!(result.ui.builderProbe && result.ui.builderProbe.status === "ready");
      var builderCompileError = !!(result.ui.builderProbe && result.ui.builderProbe.status === "compile_error");
      var builderBodyText = trimmed(ctx, result.ui && result.ui.builderProbe && result.ui.builderProbe.browser && result.ui.builderProbe.browser.bodyTextSample);
      var workInProgressVisible = /work in progress/i.test(builderBodyText);
      result.ui.workInProgressVisible = builderReady ? workInProgressVisible : null;
      result.checks.push(proofCheck(ctx, "ui-visible-shell", shellVisible, shellVisible ? "" : "Visible CRUD shell is not present on the entry page.", result.ui && result.ui.targetQName));
      result.checks.push(proofCheck(ctx, "ui-starter-replaced", starterReplaced, starterReplaced ? "" : "Starter content is still dominant on the entry page.", result.ui && result.ui.targetQName));
      result.checks.push(proofCheck(ctx, "ui-live-binding", liveBinding, liveBinding ? "" : "Live state bindings are missing from the entry page.", result.ui && result.ui.targetQName));
      result.checks.push(proofCheck(ctx, "ui-stateful-actions", statefulActions, statefulActions ? "" : "Shared action stacks are missing for the UI state flow.", result.project));
      result.checks.push(proofCheck(ctx, "ui-page-bootstrap", pageBootstrap, pageBootstrap ? "" : "Entry page does not bootstrap the stateful UI flow.", result.project + ".Application.NgxApp." + result.entryPage));
      result.checks.push(proofCheck(
        ctx,
        "ui-mobile-builder",
        builderReady,
        builderReady
          ? ""
          : (
            builderCompileError
              ? (
                result.ui.builderProbe && result.ui.builderProbe.message
                  ? result.ui.builderProbe.message
                  : "Mobile builder compile failed."
              )
              : "Mobile builder did not reach the ready state."
          ),
        result.project
      ));
      result.checks.push(proofCheck(
        ctx,
        "ui-work-in-progress-hidden",
        !builderReady || !workInProgressVisible,
        !builderReady || !workInProgressVisible
          ? ""
          : "Work in progress marker is still visible in the live viewer after finalization.",
        result.viewerUrl || result.project
      ));
      result.checks.push(proofCheck(
        ctx,
        "ui-auth-bootstrap",
        authBootstrap && sessionBootstrap && sessionRootRedirect,
        authBootstrap && sessionBootstrap && sessionRootRedirect
          ? ""
          : "The generated Login page is missing the auth_login call and root-page redirect to the visible CRUD home page.",
        result.project
      ));
      if (result.viewerUrl.length && builderReady) {
        result.ui.viewerProbe = ctx.probeViewer(
          result.viewerUrl,
          result.project,
          trimmed(ctx, opts.facadePrefix || "crud"),
          result.crm && result.crm.enabled === true,
          result.sequences && result.sequences.present ? result.sequences.present : [],
          ctx.ensureWarnings(result)
        );
        result.checks.push(proofCheck(
          ctx,
          "ui-viewer-probe",
          result.ui.viewerProbe && result.ui.viewerProbe.ok === true,
          result.ui.viewerProbe && result.ui.viewerProbe.ok === true ? "" : (result.ui.viewerProbe && result.ui.viewerProbe.message ? result.ui.viewerProbe.message : "Viewer proof failed."),
          result.viewerUrl
        ));
      }
      if (builderCompileError) {
        var compileErrors = ensureArray(ctx, result.ui.builderProbe && result.ui.builderProbe.compileErrors);
        if (compileErrors.length) {
          ctx.addWarning(result, "Mobile builder compile errors: " + trimmed(ctx, (compileErrors[0].message || "") + " " + (compileErrors[0].extra || "")));
        }
      }
      if (!shellVisible || !starterReplaced || !liveBinding || !statefulActions || !pageBootstrap || !authBootstrap) {
        pushMissing(ctx, result, result.ui && result.ui.targetQName ? result.ui.targetQName : (result.project + ".Application.NgxApp." + result.entryPage + ".Content"));
      }
      if (!builderReady) {
        pushMissing(ctx, result, result.project);
      }
      if (result.viewerUrl.length && !(result.ui && result.ui.viewerProbe && result.ui.viewerProbe.ok === true)) {
        pushMissing(ctx, result, result.viewerUrl);
      }
    }

    if (result.transactions && result.transactions.missing) {
      result.missing = result.missing.concat(result.transactions.missing);
    }
    if (result.sequences && result.sequences.missing) {
      result.missing = result.missing.concat(result.sequences.missing);
    }
    result.missing = dedupeStrings(ctx, result.missing);
    result.status = result.missing.length ? "partial" : "success";
    return ctx.toJsonSafe ? ctx.toJsonSafe(result, { warnings: ctx.ensureWarnings(result), path: "$" }) : result;
  }

  C8O.crudProof.summarizeRequestableProof = summarizeRequestableProof;
  C8O.crudProof.requestablePayload = requestablePayload;
  C8O.crudProof.proofRequestable = proofRequestable;
  C8O.crudProof.firstSqlOutputRow = firstSqlOutputRow;
  C8O.crudProof.collectSqlOutputRows = collectSqlOutputRows;
  C8O.crudProof.extractRowField = extractRowField;
  C8O.crudProof.rowHasField = rowHasField;
  C8O.crudProof.dedupeStrings = dedupeStrings;
  C8O.crudProof.normalizeProofRequestablesInput = normalizeProofRequestablesInput;
  C8O.crudProof.resolveProofRequestableQName = resolveProofRequestableQName;
  C8O.crudProof.proofCheck = proofCheck;
  C8O.crudProof.pushMissing = pushMissing;
  C8O.crudProof.buildCrudStatus = buildCrudStatus;
  C8O.crudProof.inspectCrudStatus = inspectCrudStatus;
  C8O.crudProof.crudStatus = crudStatus;
  C8O.crudProof.crudProof = crudProof;
})();
