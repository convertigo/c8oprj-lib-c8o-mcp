if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.schemaOverrides = C8O.schemaOverrides || {};

(function () {
  function cloneObject(value, fallback) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_ignoreClone) {
      return fallback;
    }
  }

  function defaultObjectSchema() {
    return {
      type: "object",
      properties: {},
      additionalProperties: false
    };
  }

  function batchCallInputSchema() {
    return {
      type: "object",
      properties: {
        calls: {
          type: "array",
          description: "Ordered tool calls. Each item uses {tool, arguments?, id?}; ids can be referenced later in the batch.",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Optional local id. Later calls can reference it through $ref substitutions."
              },
              tool: {
                type: "string",
                description: "MCP tool name, for example project-list or databaseobject-tree-get."
              },
              arguments: {
                type: "object",
                description: "Arguments object sent to the target tool.",
                additionalProperties: true
              }
            },
            required: ["tool"],
            additionalProperties: false
          }
        },
        onError: {
          type: "string",
          enum: ["stop", "continue"],
          description: "Allowed values: stop or continue. stop aborts on the first failure; continue records failures and keeps running.",
          default: "stop"
        },
        resumeFrom: {
          type: "string",
          description: "Zero-based call index to resume from after a previous partial run."
        },
        executionId: {
          type: "string",
          description: "Opaque execution id returned by a previous batch run."
        },
        optimizeMutations: {
          type: "boolean",
          description: "Default true. Defers refresh, save, and mobile-builder finalization until the batch ends.",
          default: true
        }
      },
      required: ["calls"],
      additionalProperties: false
    };
  }

  function propertyEntrySchema() {
    return {
      type: "object",
      properties: {
        name: { type: "string", description: "Property name as returned by tree-get." },
        key: { type: "string", description: "Alias of name." },
        property: { type: "string", description: "Alias of name." },
        value: { description: "Property value. Keep the same shape returned by tree-get for structured values." },
        newValue: { description: "Alias of value." }
      },
      additionalProperties: true
    };
  }

  function propertiesInputSchema() {
    return {
      description: "Property updates as either a simple name/value map or an array of property entries from tree-get.",
      oneOf: [
        {
          type: "object",
          additionalProperties: true
        },
        {
          type: "array",
          items: propertyEntrySchema()
        }
      ]
    };
  }

  function treeNodeSchema() {
    return {
      type: "object",
      properties: {
        id: { type: "string", description: "Optional local id for $ref substitutions inside the submitted tree." },
        name: { type: "string", description: "Object name when creating or matching a child." },
        className: {
          type: "string",
          description: "Object class token. For NGX dynamic entries, keep the logical form such as ngx.components.UIDynamicElement#Button."
        },
        properties: propertiesInputSchema(),
        children: {
          type: "array",
          description: "Child nodes to create or upsert in the same call.",
          items: { type: "object", additionalProperties: true }
        }
      },
      additionalProperties: true
    };
  }

  function databaseobjectTreeGetInputSchema() {
    return {
      type: "object",
      properties: {
        target: { type: "string", description: "Existing QName. Case-sensitive." },
        childrenDepth: {
          type: "integer",
          minimum: 0,
          maximum: 20,
          default: 1,
          description: "Descendant levels to include. 0 returns only the target; default 1; max 20."
        },
        properties: {
          type: "string",
          enum: ["none", "changed", "all"],
          default: "changed",
          description: "Allowed values: none, changed, all. changed keeps only properties that differ from defaults."
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 5000,
          default: 200,
          description: "Maximum nodes returned per call. 1 to 5000; default 200."
        },
        _nextCursor: {
          type: "string",
          description: "Opaque cursor from a previous response. Internal pagination token."
        }
      },
      required: ["target"],
      additionalProperties: false
    };
  }

  function databaseobjectTreeApplyInputSchema() {
    return {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "Existing QName. Case-sensitive. Patched when at=self; used as the anchor when at=inside, before, or after."
        },
        at: {
          type: "string",
          enum: ["self", "inside", "before", "after"],
          default: "self",
          description: "Allowed values: self, inside, before, after. self patches the target; the others place the input tree relative to it."
        },
        mode: {
          type: "string",
          enum: ["merge", "replace"],
          default: "merge",
          description: "Allowed values: merge or replace. replace also removes children missing from the patched scope."
        },
        optimizeMutations: booleanFlagSchema(
          false,
          "Set true to defer save, Studio refresh, and mobile-builder finalization for this mutation so a higher-level batch can finalize once."
        ),
        tree: Object.assign(treeNodeSchema(), {
          description: "Canonical node payload using the tree-get shape. Read-only top-level fields such as qname, depth, hasChildren, directChildrenCount, subtreeCount, and priority are ignored."
        })
      },
      required: ["target", "tree"],
      additionalProperties: false
    };
  }

  function requestableExecuteInputSchema() {
    return {
      type: "object",
      properties: {
        requestable: {
          type: "string",
          description: "Target requestable as <project>[.<connector>].<requestable>."
        },
        variables: {
          description: "Request variables as an object or a JSON string. Non-string values are serialized before execution.",
          oneOf: [
            { type: "string" },
            { type: "object", additionalProperties: true }
          ],
          default: "{}"
        },
        recordSchema: {
          type: "boolean",
          default: false,
          description: "Set true on transactions to update the response schema on disk. Ignored for sequences."
        },
        includeLogs: {
          type: "boolean",
          default: false,
          description: "Set true to append execution logs from this call."
        }
      },
      required: ["requestable"],
      additionalProperties: false
    };
  }

  function logViewInputSchema() {
    return {
      type: "object",
      properties: {
        filter: { type: "string", description: "Raw LogManager filter expression. Use only when the simpler filters are not enough." },
        text: { type: "string", description: "Full-text filter applied to message and extra fields." },
        q: { type: "string", description: "Alias of text." },
        level: { type: "string", description: "Log level such as trace, debug, info, warn, error, or fatal." },
        category: { type: "string", description: "Log category name." },
        project: { type: "string", description: "Project technical name." },
        requestable: { type: "string", description: "Sequence or transaction name." },
        connector: { type: "string", description: "Connector name." },
        transaction: { type: "string", description: "Transaction name." },
        thread: { type: "string", description: "Java thread name." },
        startDate: { type: "string", description: "Epoch millis or ISO date. Inclusive lower bound." },
        endDate: { type: "string", description: "Epoch millis or ISO date. Inclusive upper bound." },
        since: { type: "string", description: "Alias of startDate." },
        until: { type: "string", description: "Alias of endDate." },
        limit: { type: "integer", minimum: 1, maximum: 500, default: 100, description: "Maximum log lines returned. 1 to 500; default 100." },
        timeoutMs: { type: "integer", minimum: 0, maximum: 10000, default: 200, description: "Max wait time per fetch cycle in milliseconds. 0 disables waiting." },
        fetchSize: { type: "integer", minimum: 20, maximum: 1000, default: 200, description: "Internal LogManager page size per fetch cycle. Increase only for large scans." }
      },
      additionalProperties: false
    };
  }

  function topicInputSchema(description) {
    return {
      description: description,
      oneOf: [
        { type: "string" },
        {
          type: "array",
          items: { type: "string" }
        }
      ]
    };
  }

  function marketplaceListInputSchema() {
    return {
      type: "object",
      properties: {
        search: { type: "string", description: "Search text sent to the marketplace catalog." },
        topics: topicInputSchema("Optional topic filter. Accepts a single topic or an array of topic names."),
        limit: { type: "integer", minimum: 1, maximum: 200, default: 20, description: "Maximum entries returned in the final result page. 1 to 200; default 20." },
        maxPages: { type: "integer", minimum: 1, maximum: 100, default: 20, description: "Maximum upstream pages scanned before returning. 1 to 100; default 20." }
      },
      additionalProperties: false
    };
  }

  function marketplaceImportInputSchema() {
    return {
      type: "object",
      properties: {
        project: { type: "string", description: "Marketplace project name." },
        importedProjectName: { type: "string", description: "New local project name. Required when the marketplace entry is a starter template." }
      },
      required: ["project"],
      additionalProperties: false
    };
  }

  function mobileBuilderOpenInputSchema() {
    return {
      type: "object",
      properties: {
        project: { type: "string", description: "Existing NGX project name. Use the exact project technical name; do not invent prefixes or date suffixes." },
        timeoutSec: { type: "integer", minimum: 5, maximum: 600, default: 90, description: "Seconds to wait for a live-reload URL. Default 90; max 600." },
        logsLimit: { type: "integer", minimum: 5, maximum: 200, default: 40, description: "Maximum builder log lines returned for diagnostics. Default 40; max 200." },
        forceRestart: {
          type: "boolean",
          default: false,
          description: "Set true to restart an already running builder before waiting for readiness."
        }
      },
      required: ["project"],
      additionalProperties: false
    };
  }

  function ragQueryInputSchema() {
    return {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "Question sent to the Convertigo knowledge base."
        },
        history: {
          type: "string",
          description: "Optional prior conversation turns, usually serialized as JSON."
        },
        prompt: {
          type: "string",
          description: "Optional extra guidance for answer style or scope."
        }
      },
      required: ["question"],
      additionalProperties: false
    };
  }

  function booleanFlagSchema(defaultValue, description) {
    return {
      type: "boolean",
      default: defaultValue,
      description: description
    };
  }

  function integerSchema(minimum, maximum, defaultValue, description) {
    var schema = {
      type: "integer",
      minimum: minimum,
      default: defaultValue,
      description: description
    };
    if (maximum !== null && maximum !== undefined) {
      schema.maximum = maximum;
    }
    return schema;
  }

  function databaseobjectDeleteInputSchema() {
    return {
      type: "object",
      properties: {
        qname: { type: "string", description: "Existing QName. Case-sensitive." },
        autoSave: booleanFlagSchema(true, "Set false to keep the deletion in memory and skip project export."),
        refresh: booleanFlagSchema(true, "Set false to skip Studio tree refresh."),
        optimizeMutations: booleanFlagSchema(
          false,
          "Set true to defer save and Studio refresh for this mutation so a higher-level batch can finalize once."
        )
      },
      additionalProperties: false
    };
  }

  function databaseobjectMoveInputSchema() {
    return {
      type: "object",
      properties: {
        qname: { type: "string", description: "Existing QName. Case-sensitive." },
        target: {
          type: "string",
          description: "Existing target QName. Container when position=inside; sibling anchor when position=before or after."
        },
        position: {
          type: "string",
          enum: ["inside", "before", "after"],
          description: "Allowed values: inside, before, after. inside moves under the target; before or after reorders next to it."
        },
        autoSave: booleanFlagSchema(true, "Set false to keep the move in memory and skip project export."),
        refresh: booleanFlagSchema(true, "Set false to skip Studio tree refresh."),
        optimizeMutations: booleanFlagSchema(
          false,
          "Set true to defer save and Studio refresh for this mutation so a higher-level batch can finalize once."
        )
      },
      additionalProperties: false
    };
  }

  function databaseobjectRenameInputSchema() {
    return {
      type: "object",
      properties: {
        qname: { type: "string", description: "Existing QName. Case-sensitive." },
        name: { type: "string", description: "New object name. Use a valid Convertigo identifier for the target class." },
        update: {
          type: "string",
          enum: ["update_none", "update_local", "update_all"],
          description: "Allowed values: update_none, update_local, update_all. Controls how references are rewritten after the rename."
        },
        autoSave: booleanFlagSchema(true, "Set false to keep the rename in memory and skip project export."),
        refresh: booleanFlagSchema(true, "Set false to skip Studio tree refresh."),
        optimizeMutations: booleanFlagSchema(
          false,
          "Set true to defer save and Studio refresh for this mutation so a higher-level batch can finalize once."
        )
      },
      additionalProperties: false
    };
  }

  function databaseobjectSchemaInputSchema() {
    return {
      type: "object",
      properties: {
        qname: { type: "string", description: "Existing QName. Case-sensitive." },
        type: {
          type: "string",
          enum: ["xml", "json", "jsonschema"],
          default: "xml",
          description: "Allowed values: xml, json, jsonschema. Default: xml."
        },
        internal: booleanFlagSchema(false, "Set true to read the request schema of a requestable instead of its response schema.")
      },
      additionalProperties: false
    };
  }

  function databaseobjectSearchInputSchema() {
    return {
      type: "object",
      properties: {
        qname: { type: "string", description: "Optional root QName. Omit to search across all loaded projects." },
        filter: { type: "string", description: "Search text. Space-separated terms are combined; pair with useRegExp=true for a regex." },
        limit: integerSchema(1, 1000, 200, "Maximum matches returned per call. 1 to 1000; default 200."),
        matchCase: booleanFlagSchema(false, "Set true for case-sensitive matching."),
        useRegExp: booleanFlagSchema(false, "Set true to treat filter as a Java regular expression."),
        objectType: { type: "string", description: "Optional object type filter. Use * or omit for any type." }
      },
      additionalProperties: false
    };
  }

  function paletteDescribeInputSchema() {
    return {
      type: "object",
      properties: {
        className: { type: "string", description: "Palette entry class token, usually copied from palette-list." },
        verbose: booleanFlagSchema(false, "Set true to include longer property and creation details.")
      },
      additionalProperties: false
    };
  }

  function paletteListInputSchema() {
    return {
      type: "object",
      properties: {
        target: { type: "string", description: "Parent QName. Append :FolderType only when you need a specific logical folder view." },
        includeBuiltIn: booleanFlagSchema(true, "Default true. Set false to hide built-in entries."),
        includeShared: booleanFlagSchema(true, "Default true. Set false to hide shared library entries."),
        filter: { type: "string", description: "Case-insensitive filter on category and item names." },
        limit: integerSchema(0, null, 0, "Maximum items returned. Leave empty or 0 for no limit.")
      },
      additionalProperties: false
    };
  }

  function projectListInputSchema() {
    return {
      type: "object",
      properties: {
        filter: { type: "string", description: "Case-insensitive filter on project name and comment." },
        limit: integerSchema(1, 100, 10, "Maximum projects returned per call. 1 to 100; default 10.")
      },
      additionalProperties: false
    };
  }

  function projectListSymbolsInputSchema() {
    return {
      type: "object",
      properties: {
        project: { type: "string", description: "Optional project technical name. Omit to scan all loaded projects." },
        filter: { type: "string", description: "Optional case-insensitive filter on symbol name." },
        includeValues: booleanFlagSchema(false, "Set true to include full symbol values. Default false masks values in previews."),
        scope: {
          type: "string",
          enum: ["project", "all"],
          description: "Optional symbol scope. Defaults to project when project is provided, otherwise all."
        }
      },
      additionalProperties: false
    };
  }

  function projectDeleteInputSchema() {
    return {
      type: "object",
      properties: {
        project: { type: "string", description: "Project technical name. Omit only when the current context project is unambiguous." },
        deleteCar: booleanFlagSchema(true, "Delete the exported .car archive when present. Default true.")
      },
      additionalProperties: false
    };
  }

  function openObjectSchema(properties) {
    return {
      type: "object",
      properties: properties || {},
      additionalProperties: true
    };
  }

  function closedObjectSchema(properties) {
    return {
      type: "object",
      properties: properties || {},
      additionalProperties: false
    };
  }

  function nullableSchema(schema) {
    return {
      oneOf: [
        cloneObject(schema, schema || {}),
        { type: "null" }
      ]
    };
  }

  function stringArraySchema() {
    return {
      type: "array",
      items: { type: "string" }
    };
  }

  function errorEntrySchema() {
    return openObjectSchema({
      code: { type: "string" },
      message: { type: "string" },
      phase: { type: "string" },
      qname: { type: "string" }
    });
  }

  function warningEntrySchema() {
    return {
      oneOf: [
        { type: "string" },
        openObjectSchema({
          code: { type: "string" },
          message: { type: "string" }
        })
      ]
    };
  }

  function saveResultSchema() {
    return closedObjectSchema({
      project: { type: "string" },
      saved: { type: "boolean" },
      message: { type: "string" },
      versionChecked: { type: "boolean" },
      versionDirty: { type: "boolean" },
      versionBumped: { type: "boolean" },
      previousVersion: { type: "string" },
      version: { type: "string" },
      headVersion: { type: "string" },
      versionReason: { type: "string" },
      versionMessage: { type: "string" }
    });
  }

  function mobileBuilderMutationSchema() {
    return closedObjectSchema({
      project: { type: "string" },
      requested: { type: "boolean" },
      triggered: { type: "boolean" },
      message: { type: "string" }
    });
  }

  function studioRefreshSchema() {
    return openObjectSchema({
      refreshed: { type: "boolean" },
      qname: { type: "string" },
      message: { type: "string" }
    });
  }

  function batchStopSchema() {
    return closedObjectSchema({
      opIndex: { type: "number" },
      opId: { type: "string" },
      type: { type: "string" },
      phase: { type: "string" },
      code: { type: "string" },
      message: { type: "string" },
      qname: { type: "string" }
    });
  }

  function batchResumeSchema() {
    return closedObjectSchema({
      executionId: { type: "string" },
      fromOpIndex: { type: "number" },
      totalOperations: { type: "number" },
      remaining: { type: "number" },
      canResume: { type: "boolean" },
      failedOpIds: stringArraySchema()
    });
  }

  function batchSummarySchema() {
    return closedObjectSchema({
      planned: { type: "number" },
      applied: { type: "number" },
      successfulCalls: { type: "number" },
      partialCalls: { type: "number" },
      failedCalls: { type: "number" },
      skippedCalls: { type: "number" },
      notRunCalls: { type: "number" }
    });
  }

  function treeApplySummarySchema() {
    return closedObjectSchema({
      planned: { type: "number" },
      applied: { type: "number" },
      created: { type: "number" },
      deleted: { type: "number" },
      moved: { type: "number" },
      updatedProperties: { type: "number" },
      replaced: { type: "number" },
      failedOps: { type: "number" },
      partialOps: { type: "number" },
      successfulOps: { type: "number" },
      skippedOps: { type: "number" },
      notRunOps: { type: "number" }
    });
  }

  function mutationReportSchema() {
    return openObjectSchema({
      index: { type: "number" },
      callId: { type: "string" },
      opId: { type: "string" },
      tool: { type: "string" },
      sequence: { type: "string" },
      type: { type: "string" },
      status: { type: "string" },
      phase: { type: "string" },
      qname: { type: "string" },
      optimizedMutation: { type: "boolean" },
      warnings: {
        type: "array",
        items: warningEntrySchema()
      },
      errors: {
        type: "array",
        items: errorEntrySchema()
      },
      applied: {
        type: "array",
        items: openObjectSchema({})
      },
      payload: {}
    });
  }

  function batchMutationFinalizeSchema() {
    return closedObjectSchema({
      optimized: { type: "boolean" },
      optimizedCalls: { type: "number" },
      touchedQNames: stringArraySchema(),
      refreshQName: { type: "string" },
      studioRefresh: nullableSchema(studioRefreshSchema()),
      mobileBuilder: {
        type: "array",
        items: mobileBuilderMutationSchema()
      },
      saveResults: {
        type: "array",
        items: saveResultSchema()
      },
      errors: {
        type: "array",
        items: errorEntrySchema()
      }
    });
  }

  function batchCallOutputSchema() {
    return closedObjectSchema({
      status: { type: "string" },
      message: { type: "string" },
      onError: { type: "string" },
      saved: { type: "boolean" },
      durationMs: { type: "number" },
      timestamp: { type: "number" },
      summary: batchSummarySchema(),
      stop: nullableSchema(batchStopSchema()),
      resume: batchResumeSchema(),
      failedOpIds: stringArraySchema(),
      references: openObjectSchema({}),
      calls: {
        type: "array",
        items: mutationReportSchema()
      },
      errors: {
        type: "array",
        items: errorEntrySchema()
      },
      saveResults: {
        type: "array",
        items: saveResultSchema()
      },
      mobileBuilder: {
        type: "array",
        items: mobileBuilderMutationSchema()
      },
      mutationFinalize: batchMutationFinalizeSchema()
    });
  }

  function treeApplyOutputSchema() {
    return closedObjectSchema({
      status: { type: "string" },
      message: { type: "string" },
      targetQName: { type: "string" },
      onError: { type: "string" },
      strict: { type: "boolean" },
      dryRun: { type: "boolean" },
      autoSave: { type: "boolean" },
      triggerMobileBuilder: { type: "boolean" },
      saved: { type: "boolean" },
      durationMs: { type: "number" },
      timestamp: { type: "number" },
      summary: treeApplySummarySchema(),
      warnings: {
        type: "array",
        items: warningEntrySchema()
      },
      stop: nullableSchema(batchStopSchema()),
      resume: batchResumeSchema(),
      failedOpIds: stringArraySchema(),
      operations: {
        type: "array",
        items: mutationReportSchema()
      },
      errors: {
        type: "array",
        items: errorEntrySchema()
      },
      saveResults: {
        type: "array",
        items: saveResultSchema()
      },
      mobileBuilder: {
        type: "array",
        items: mobileBuilderMutationSchema()
      },
      touchedQNames: stringArraySchema()
    });
  }

  function treeNodeOutputSchema() {
    return openObjectSchema({
      qname: { type: "string" },
      name: { type: "string" },
      className: { type: "string" },
      depth: { type: "number" },
      hasChildren: { type: "boolean" },
      directChildrenCount: { type: "number" },
      subtreeCount: { type: "number" },
      priority: { type: "string" },
      partial: { type: "boolean" },
      properties: openObjectSchema({}),
      children: {
        type: "array",
        items: openObjectSchema({})
      }
    });
  }

  function databaseobjectTreeGetOutputSchema() {
    return closedObjectSchema({
      rootQName: { type: "string" },
      view: { type: "string" },
      startOffset: { type: "number" },
      returnedNodes: { type: "number" },
      scannedNodes: { type: "number" },
      maxDepth: { type: "number" },
      maxNodes: { type: "number" },
      rootCount: { type: "number" },
      truncated: { type: "boolean" },
      hasMore: { type: "boolean" },
      totalNodes: { type: "number" },
      nextCursor: { type: "string" },
      tree: treeNodeOutputSchema(),
      forest: {
        type: "array",
        items: treeNodeOutputSchema()
      }
    });
  }

  function databaseobjectSearchOutputSchema() {
    return closedObjectSchema({
      scanned: { type: "number" },
      returned: { type: "number" },
      hasMore: { type: "boolean" },
      nextCursor: { type: "string" },
      matches: {
        type: "array",
        items: openObjectSchema({
          qname: { type: "string" },
          name: { type: "string" },
          className: { type: "string" },
          priority: { type: "string" },
          context: { type: "string" },
          type: { type: "string" },
          comment: { type: "string" }
        })
      }
    });
  }

  function logLineSchema() {
    return openObjectSchema({
      index: { type: "number" },
      time: { type: "string" },
      level: { type: "string" },
      category: { type: "string" },
      thread: { type: "string" },
      message: { type: "string" },
      extra: { type: "string" },
      extras: openObjectSchema({})
    });
  }

  function nullableNumberSchema() {
    return {
      oneOf: [
        { type: "number" },
        { type: "null" }
      ]
    };
  }

  function logViewQueryOutputSchema() {
    return closedObjectSchema({
      startIndex: { type: "number" },
      limit: { type: "number" },
      returned: { type: "number" },
      scanned: { type: "number" },
      hasMore: { type: "boolean" },
      nextCursor: { type: "string" },
      filterExpression: { type: "string" },
      text: { type: "string" },
      startDate: nullableNumberSchema(),
      endDate: nullableNumberSchema(),
      timeoutMs: { type: "number" }
    });
  }

  function logViewOutputSchema() {
    return closedObjectSchema({
      lines: {
        type: "array",
        items: logLineSchema()
      },
      query: logViewQueryOutputSchema(),
      nextCursor: { type: "string" }
    });
  }

  function requestableLogQuerySchema() {
    return closedObjectSchema({
      contextId: { type: "string" },
      project: { type: "string" },
      requestable: { type: "string" },
      connector: { type: "string" },
      transaction: { type: "string" },
      startMillis: { type: "number" },
      endMillis: { type: "number" },
      limit: { type: "number" },
      scanned: { type: "number" }
    });
  }

  function requestableLogsSchema() {
    return closedObjectSchema({
      lines: {
        type: "array",
        items: logLineSchema()
      },
      lineCount: { type: "number" },
      hasMore: { type: "boolean" },
      query: requestableLogQuerySchema()
    });
  }

  function requestableExecuteOutputSchema() {
    return closedObjectSchema({
      result: openObjectSchema({}),
      logs: requestableLogsSchema()
    });
  }

  function mobileBuilderLogLineSchema() {
    return closedObjectSchema({
      time: { type: "string" },
      level: { type: "string" },
      category: { type: "string" },
      message: { type: "string" },
      extra: { type: "string" }
    });
  }

  function mobileBuilderCompileErrorSchema() {
    return closedObjectSchema({
      time: { type: "string" },
      level: { type: "string" },
      category: { type: "string" },
      message: { type: "string" },
      extra: { type: "string" }
    });
  }

  C8O.schemaOverrides._helpers = {
    booleanFlagSchema: booleanFlagSchema,
    openObjectSchema: openObjectSchema,
    closedObjectSchema: closedObjectSchema,
    stringArraySchema: stringArraySchema,
    mobileBuilderCompileErrorSchema: mobileBuilderCompileErrorSchema
  };

  include("js/schema_overrides_crud.js");

  function mobileBuilderEditorSchema() {
    return closedObjectSchema({
      requested: { type: "boolean" },
      opened: { type: "boolean" },
      builderLaunchRequested: { type: "boolean" },
      message: { type: "string" },
      error: { type: "string" }
    });
  }

  function mobileBuilderOpenOutputSchema() {
    return closedObjectSchema({
      status: { type: "string" },
      project: { type: "string" },
      message: { type: "string" },
      ready: { type: "boolean" },
      launched: { type: "boolean" },
      reusedBuild: { type: "boolean" },
      studioMode: { type: "boolean" },
      threadAlive: { type: "boolean" },
      timeoutSec: { type: "number" },
      elapsedMs: { type: "number" },
      startedAt: { type: "number" },
      finishedAt: { type: "number" },
      endpoint: { type: "string" },
      baseUrl: { type: "string" },
      viewerUrl: { type: "string" },
      viewerBaseUrl: { type: "string" },
      viewerHomeUrl: { type: "string" },
      port: { type: "number" },
      nodeUrl: { type: "string" },
      editor: mobileBuilderEditorSchema(),
      editorOpened: { type: "boolean" },
      browser: openObjectSchema({
        currentUrl: { type: "string" },
        locationHref: { type: "string" },
        title: { type: "string" },
        statusText: { type: "string" },
        errorText: { type: "string" },
        bodyTextSample: { type: "string" },
        progress: { type: "number" }
      }),
      compileErrors: {
        type: "array",
        items: mobileBuilderCompileErrorSchema()
      },
      logs: {
        type: "array",
        items: mobileBuilderLogLineSchema()
      },
      logQuery: requestableLogQuerySchema()
    });
  }

  function ragQueryOutputSchema() {
    return closedObjectSchema({
      status: { type: "string" },
      message: { type: "string" },
      answer: { type: "string" },
      references: stringArraySchema(),
      httpStatus: { type: "number" },
      latencyMs: { type: "number" },
      retryable: { type: "boolean" },
      warning: { type: "string" }
    });
  }

  function projectDeleteOutputSchema() {
    return closedObjectSchema({
      project: { type: "string" },
      provided: { type: "string" },
      found: { type: "boolean" },
      deleted: { type: "boolean" },
      deleteCar: { type: "boolean" },
      status: { type: "string" },
      message: { type: "string" },
      timestamp: { type: "number" },
      errors: {
        type: "array",
        items: closedObjectSchema({
          name: { type: "string" },
          message: { type: "string" }
        })
      }
    });
  }

  function cleanDocText(value) {
    var text = value == null ? "" : String(value);
    text = text.replace(/\r\n?/g, "\n").trim();
    if (!text.length || text === "new variable") {
      return "";
    }
    return text;
  }

  function variableDoc(variable) {
    var text = "";
    if (!variable) {
      return text;
    }
    try {
      text = cleanDocText(variable.getComment ? variable.getComment() : "");
    } catch (_ignoreComment) {
      text = "";
    }
    if (!text.length) {
      try {
        text = cleanDocText(variable.getDescription ? variable.getDescription() : "");
      } catch (_ignoreDescription) {
        text = "";
      }
    }
    return text;
  }

  function decorateInputSchemaFromVariables(inputSchema, requestable) {
    var schema = inputSchema;
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
      return schema;
    }
    if (!schema.properties || typeof schema.properties !== "object") {
      return schema;
    }
    if (!requestable || !requestable.getVariables) {
      return schema;
    }
    var variables = null;
    try {
      variables = requestable.getVariables();
    } catch (_ignoreVariables) {
      variables = null;
    }
    if (!variables || !variables.size) {
      return schema;
    }
    for (var i = 0; i < variables.size(); i++) {
      var variable = variables.get(i);
      if (!variable || !variable.getName) {
        continue;
      }
      var name = String(variable.getName() || "");
      if (!name.length || !schema.properties[name] || schema.properties[name].description) {
        continue;
      }
      var doc = variableDoc(variable);
      if (!doc.length) {
        continue;
      }
      schema.properties[name].description = doc;
    }
    return schema;
  }

  C8O.schemaOverrides.applyInput = function (sequenceName, inputSchema, requestable) {
    var seq = sequenceName || "";
    if (!seq && requestable && requestable.getName) {
      try {
        seq = String(requestable.getName());
      } catch (_ignoreName) {
        seq = "";
      }
    }
    seq = String(seq || "");

    if (seq === "tools_batch_call") {
      return batchCallInputSchema();
    }
    if (seq === "tools_databaseobject_tree_get") {
      return databaseobjectTreeGetInputSchema();
    }
    if (seq === "tools_databaseobject_tree_apply") {
      return databaseobjectTreeApplyInputSchema();
    }
    if (seq === "tools_requestable_execute") {
      return requestableExecuteInputSchema();
    }
    if (seq === "tools_log_view") {
      return logViewInputSchema();
    }
    if (seq === "tools_marketplace_list") {
      return marketplaceListInputSchema();
    }
    if (seq === "tools_marketplace_import") {
      return marketplaceImportInputSchema();
    }
    if (seq === "tools_mobile_builder_open") {
      return mobileBuilderOpenInputSchema();
    }
    if (seq === "tools_rag_query") {
      return ragQueryInputSchema();
    }
    if (seq === "tools_databaseobject_delete") {
      return databaseobjectDeleteInputSchema();
    }
    if (seq === "tools_databaseobject_move") {
      return databaseobjectMoveInputSchema();
    }
    if (seq === "tools_databaseobject_rename") {
      return databaseobjectRenameInputSchema();
    }
    if (seq === "tools_databaseobject_schema") {
      return databaseobjectSchemaInputSchema();
    }
    if (seq === "tools_databaseobject_search") {
      return databaseobjectSearchInputSchema();
    }
    if (seq === "tools_palette_describe") {
      return paletteDescribeInputSchema();
    }
    if (seq === "tools_palette_list") {
      return paletteListInputSchema();
    }
    if (seq === "tools_project_list") {
      return projectListInputSchema();
    }
    if (seq === "tools_project_list_symbols") {
      return projectListSymbolsInputSchema();
    }
    if (seq === "tools_project_delete") {
      return projectDeleteInputSchema();
    }
    var crudInputOverride = C8O.schemaOverridesCrud && C8O.schemaOverridesCrud.applyInput
      ? C8O.schemaOverridesCrud.applyInput(seq)
      : null;
    if (crudInputOverride) {
      return crudInputOverride;
    }

    if (!inputSchema || typeof inputSchema !== "object" || Array.isArray(inputSchema)) {
      return defaultObjectSchema();
    }
    return cloneObject(inputSchema, defaultObjectSchema());
  };

  C8O.schemaOverrides.decorateInput = function (_sequenceName, inputSchema, requestable) {
    return decorateInputSchemaFromVariables(inputSchema, requestable);
  };

  C8O.schemaOverrides.applyOutput = function (sequenceName, outputSchema, requestable, _responseSample) {
    var seq = sequenceName || "";
    if (!seq && requestable && requestable.getName) {
      try {
        seq = String(requestable.getName());
      } catch (_ignoreName) {
        seq = "";
      }
    }
    seq = String(seq || "");

    if (seq === "tools_batch_call") {
      return batchCallOutputSchema();
    }
    if (seq === "tools_databaseobject_tree_apply") {
      return treeApplyOutputSchema();
    }
    if (seq === "tools_databaseobject_tree_get") {
      return databaseobjectTreeGetOutputSchema();
    }
    if (seq === "tools_databaseobject_search") {
      return databaseobjectSearchOutputSchema();
    }
    if (seq === "tools_log_view") {
      return logViewOutputSchema();
    }
    if (seq === "tools_requestable_execute") {
      return requestableExecuteOutputSchema();
    }
    if (seq === "tools_mobile_builder_open") {
      return mobileBuilderOpenOutputSchema();
    }
    if (seq === "tools_rag_query") {
      return ragQueryOutputSchema();
    }
    if (seq === "tools_project_delete") {
      return projectDeleteOutputSchema();
    }
    var crudOutputOverride = C8O.schemaOverridesCrud && C8O.schemaOverridesCrud.applyOutput
      ? C8O.schemaOverridesCrud.applyOutput(seq)
      : null;
    if (crudOutputOverride) {
      return crudOutputOverride;
    }

    if (!outputSchema || typeof outputSchema !== "object" || Array.isArray(outputSchema)) {
      return openObjectSchema({});
    }
    return cloneObject(outputSchema, openObjectSchema({}));
  };

  C8O.schemaOverrides.decorateOutput = function (_sequenceName, outputSchema, _requestable, _responseSample) {
    return outputSchema;
  };
})();
