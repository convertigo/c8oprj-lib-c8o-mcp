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
        }
      },
      required: ["calls"],
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

    if (!inputSchema || typeof inputSchema !== "object" || Array.isArray(inputSchema)) {
      return defaultObjectSchema();
    }
    return cloneObject(inputSchema, defaultObjectSchema());
  };
})();
