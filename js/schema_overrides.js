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
          description: "Ordered list of tool calls to execute.",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Optional identifier for cross-call $ref substitutions."
              },
              tool: {
                type: "string",
                description: "MCP tool name (for example: project-list, databaseobject-tree-get)."
              },
              arguments: {
                type: "object",
                description: "Arguments passed to the target tool.",
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
          default: "stop"
        },
        resumeFrom: {
          type: "string",
          description: "Zero-based index to resume from."
        },
        executionId: {
          type: "string",
          description: "Optional execution identifier returned in resume metadata."
        },
        optimizeMutations: {
          type: "boolean",
          description: "When true (default), mutation tool calls are executed with deferred refresh/save/build finalization.",
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
        name: { type: "string", description: "Property name." },
        key: { type: "string", description: "Alias of property name." },
        property: { type: "string", description: "Alias of property name." },
        value: { description: "Property value in MCP-friendly format." },
        newValue: { description: "Alias of value." }
      },
      additionalProperties: true
    };
  }

  function propertiesInputSchema() {
    return {
      description: "Property updates as a key/value map or entry list (same structural format as properties-get).",
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
        id: { type: "string", description: "Optional local id for intra-tree $ref substitutions." },
        name: { type: "string", description: "Object name." },
        className: {
          type: "string",
          description: "Object class token (for NGX, use logical forms such as ngx.components.UIDynamicElement#Button)."
        },
        properties: propertiesInputSchema(),
        children: {
          type: "array",
          description: "Optional child nodes to create or upsert in one shot.",
          items: { type: "object", additionalProperties: true }
        }
      },
      additionalProperties: true
    };
  }

  function databaseobjectCreateInputSchema() {
    return {
      type: "object",
      properties: {
        related: { type: "string", description: "QName used as related object for create mode resolution." },
        mode: { type: "string", enum: ["inside", "before", "after"], default: "inside" },
        className: {
          type: "string",
          description: "Class token to create (supports NGX logical className#logicalId tokens)."
        },
        name: { type: "string", description: "Name of the object to create." },
        properties: propertiesInputSchema(),
        children: {
          type: "array",
          description: "Optional one-shot child creation tree.",
          items: treeNodeSchema()
        },
        onError: { type: "string", enum: ["stop", "continue"], default: "stop" },
        strict: { type: "boolean", default: false },
        autoSave: { type: "boolean", default: true },
        refresh: { type: "boolean", default: true },
        triggerMobileBuilder: { type: "boolean", default: true },
        dryRun: { type: "boolean", default: false },
        resumeFrom: { type: "string", description: "Optional zero-based operation index for resume." },
        executionId: { type: "string", description: "Optional execution identifier returned in resume metadata." }
      },
      required: ["related", "className", "name"],
      additionalProperties: false
    };
  }

  function databaseobjectPropertiesSetInputSchema() {
    return {
      type: "object",
      properties: {
        qname: { type: "string", description: "Database object QName to update." },
        properties: propertiesInputSchema(),
        onError: { type: "string", enum: ["stop", "continue"], default: "stop" },
        strict: { type: "boolean", default: false },
        autoSave: { type: "boolean", default: true },
        refresh: { type: "boolean", default: true },
        triggerMobileBuilder: { type: "boolean", default: true },
        dryRun: { type: "boolean", default: false },
        resumeFrom: { type: "string", description: "Optional zero-based operation index for resume." },
        executionId: { type: "string", description: "Optional execution identifier returned in resume metadata." }
      },
      required: ["qname", "properties"],
      additionalProperties: false
    };
  }

  function databaseobjectTreeGetInputSchema() {
    return {
      type: "object",
      properties: {
        qname: { type: "string", description: "Root QName. Empty returns project roots." },
        view: { type: "string", enum: ["children", "summary", "full"], default: "children" },
        includeProperties: { type: "boolean", default: false },
        includeReadOnly: { type: "boolean", default: false },
        maxNodes: { type: "integer", minimum: 1, maximum: 5000, default: 200 },
        maxDepth: { type: "integer", minimum: 1, maximum: 20, default: 4 }
      },
      additionalProperties: false
    };
  }

  function databaseobjectTreeApplyInputSchema() {
    return {
      type: "object",
      properties: {
        target: { type: "string", description: "Target QName to patch." },
        payload: { type: "object", additionalProperties: true },
        patch: { type: "object", additionalProperties: true },
        tree: { type: "object", additionalProperties: true },
        strategy: { type: "string", enum: ["merge", "replace"], default: "merge" },
        onError: { type: "string", enum: ["stop", "continue"], default: "stop" },
        strict: { type: "boolean", default: false },
        autoSave: { type: "boolean", default: true },
        refresh: { type: "boolean", default: true },
        triggerMobileBuilder: { type: "boolean", default: true },
        dryRun: { type: "boolean", default: false },
        resumeFrom: { type: "string", description: "Optional zero-based operation index for resume." },
        executionId: { type: "string", description: "Optional execution identifier returned in resume metadata." }
      },
      additionalProperties: false
    };
  }

  function requestableExecuteInputSchema() {
    return {
      type: "object",
      properties: {
        requestable: {
          type: "string",
          description: "Target requestable formatted as <project>[.<connector>].<requestable>."
        },
        variables: {
          description: "Request variables JSON object. Can be passed as a JSON string or object.",
          oneOf: [
            { type: "string" },
            { type: "object", additionalProperties: true }
          ],
          default: "{}"
        },
        recordSchema: {
          type: "boolean",
          default: false,
          description: "When true on transactions, records response schema to disk (writeSchemaToFile)."
        },
        includeLogs: {
          type: "boolean",
          default: false,
          description: "When true, appends execution logs captured during the requestable call."
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
        filter: { type: "string", description: "Optional raw LogManager filter expression." },
        text: { type: "string", description: "Full-text filter." },
        q: { type: "string", description: "Alias of text." },
        level: { type: "string", description: "Log level filter." },
        category: { type: "string", description: "Category filter." },
        project: { type: "string", description: "Project filter." },
        requestable: { type: "string", description: "Requestable/sequence filter." },
        connector: { type: "string", description: "Connector filter." },
        transaction: { type: "string", description: "Transaction filter." },
        thread: { type: "string", description: "Thread filter." },
        startDate: { type: "string", description: "Epoch millis or ISO date." },
        endDate: { type: "string", description: "Epoch millis or ISO date." },
        since: { type: "string", description: "Alias of startDate." },
        until: { type: "string", description: "Alias of endDate." },
        limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
        timeoutMs: { type: "integer", minimum: 0, maximum: 10000, default: 200 },
        fetchSize: { type: "integer", minimum: 20, maximum: 1000, default: 200 }
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
        search: { type: "string", description: "Marketplace search text." },
        topics: topicInputSchema("Optional topic filters."),
        limit: { type: "integer", minimum: 1, maximum: 200, default: 20 },
        maxPages: { type: "integer", minimum: 1, maximum: 100, default: 20 }
      },
      additionalProperties: false
    };
  }

  function marketplaceImportInputSchema() {
    return {
      type: "object",
      properties: {
        project: { type: "string", description: "Marketplace project name to import." },
        importedProjectName: { type: "string", description: "Optional new name for imported workspace project. Required for starters." }
      },
      required: ["project"],
      additionalProperties: false
    };
  }

  function mobileBuilderOpenInputSchema() {
    return {
      type: "object",
      properties: {
        project: { type: "string", description: "Target NGX project name." },
        timeoutSec: { type: "integer", minimum: 5, maximum: 600, default: 90 },
        logsLimit: { type: "integer", minimum: 5, maximum: 200, default: 40 },
        forceRestart: {
          type: "boolean",
          default: false,
          description: "When true, always restart the builder even if a live instance is already running."
        }
      },
      required: ["project"],
      additionalProperties: false
    };
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
    if (seq === "tools_databaseobject_create") {
      return databaseobjectCreateInputSchema();
    }
    if (seq === "tools_databaseobject_properties_set") {
      return databaseobjectPropertiesSetInputSchema();
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

    if (!inputSchema || typeof inputSchema !== "object" || Array.isArray(inputSchema)) {
      return defaultObjectSchema();
    }
    return cloneObject(inputSchema, defaultObjectSchema());
  };
})();
