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
        timeoutSec: { type: "integer", minimum: 0, maximum: 600, default: 90, description: "Seconds to wait for readiness when wait=true. Use 0 for a non-blocking poll. Default 90; max 600." },
        logsLimit: { type: "integer", minimum: 5, maximum: 200, default: 40, description: "Maximum builder log lines returned for diagnostics. Default 40; max 200." },
        forceRestart: {
          type: "boolean",
          default: false,
          description: "Set true to restart an already running builder. Use only when the current builder is stuck or on the wrong state."
        },
        wait: {
          type: "boolean",
          default: true,
          description: "Set false to request/open the viewer and return immediately with the current state. Default true preserves the synchronous readiness wait."
        },
        stateOnly: {
          type: "boolean",
          default: false,
          description: "Set true to read the current viewer/editor state and URLs without opening, starting, or restarting the builder."
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
        refresh: booleanFlagSchema(true, "Set false to skip Studio tree refresh.")
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
        refresh: booleanFlagSchema(true, "Set false to skip Studio tree refresh.")
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
        refresh: booleanFlagSchema(true, "Set false to skip Studio tree refresh.")
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

  function jsonObjectOrStringSchema(description) {
    return {
      description: description,
      oneOf: [
        { type: "string" },
        { type: "object", additionalProperties: true }
      ]
    };
  }

  function nocodeFormsProjectProperty() {
    return {
      type: "string",
      default: "C8Oforms",
      description: "Loaded C8Oforms project name. Default: C8Oforms."
    };
  }

  function nocodeFormsTokenProperty() {
    return {
      type: "string",
      description: "Optional compatibility field. Leave empty in the integrated assistant; MCP bearer authentication supplies the No Code user credential out-of-band."
    };
  }

  function nocodeThumbnailImageSchema() {
    return {
      type: "object",
      properties: {
        contentType: {
          type: "string",
          enum: ["image/png", "image/jpeg", "image/webp"],
          description: "MIME type for the generated thumbnail image."
        },
        base64: {
          type: "string",
          description: "Base64 image payload for an image smaller than 512x512 px. Standard base64, URL-safe base64, missing padding, and a data:image/...;base64 prefix are accepted."
        }
      },
      required: ["contentType", "base64"],
      additionalProperties: false
    };
  }

  function nocodeBaserowCatalogListInputSchema() {
    return {
      type: "object",
      properties: {
        token: {
          type: "string",
          description: "Optional compatibility field. Leave empty in the integrated assistant; MCP bearer authentication supplies the No Code user credential out-of-band."
        },
        includeColumns: {
          type: "boolean",
          default: false,
          description: "Set true to hydrate Baserow field details through lib_BaseRow.formscommon_FieldsList. Requires workspaceId, databaseId, or tableId."
        },
        workspaceId: {
          type: "integer",
          description: "Optional Baserow workspace id filter. With includeColumns=true, fields are listed for all tables in the workspace."
        },
        databaseId: {
          type: "integer",
          description: "Optional Baserow database/application id filter. With includeColumns=true, fields are listed only for tables in that database."
        },
        tableId: {
          type: "integer",
          description: "Optional Baserow table id filter. With includeColumns=true, fields are listed only for this table."
        }
      },
      required: [],
      additionalProperties: false
    };
  }

  function nocodeBaserowSchemaApplyInputSchema() {
    var baserowFieldSchema = {
      type: "object",
      properties: {
        name: { type: "string", description: "Baserow field name." },
        type: {
          type: "string",
          enum: [
            "text",
            "long_text",
            "number",
            "boolean",
            "date",
            "email",
            "phone_number",
            "url",
            "file",
            "single_select",
            "multiple_select",
            "link_row",
            "link",
            "lookup",
            "rollup",
            "count",
            "formula",
            "rating",
            "duration",
            "uuid",
            "autonumber",
            "password"
          ],
          description: "Baserow field type. link is accepted as an alias for link_row."
        },
        required: { type: "boolean", description: "Business-required marker kept for planning; Baserow fields themselves are nullable unless type options enforce otherwise." },
        description: { type: "string", description: "Optional Baserow field description." },
        values: {
          type: "array",
          description: "Options for single_select or multiple_select. Items can be strings or Baserow option objects.",
          items: {
            oneOf: [
              { type: "string" },
              { type: "object", additionalProperties: true }
            ]
          }
        },
        targetTable: { type: "string", description: "Target table name for link_row fields." },
        multiple: { type: "boolean", description: "For link_row, whether multiple linked rows are allowed when supported by Baserow." },
        createRelatedField: { type: "boolean", description: "For link_row, whether Baserow should create the reciprocal related field." },
        relatedFieldName: { type: "string", description: "Optional reciprocal link field name." },
        through: { type: "string", description: "For lookup/rollup/count, the existing link_row field name." },
        targetField: { type: "string", description: "For lookup/rollup, the field name to report from the linked table." },
        formula: { type: "string", description: "Formula expression for formula fields." },
        baserowOptions: { type: "object", additionalProperties: true, description: "Raw Baserow create-field options for advanced/current field types." }
      },
      required: ["name", "type"],
      additionalProperties: false
    };
    var tableSchema = {
      type: "object",
      properties: {
        id: { type: "integer", description: "Existing Baserow table id. If omitted, the table is matched by name in the target base." },
        name: { type: "string", description: "Baserow table name." },
        primaryField: { type: "string", description: "Business display field used by clients to resolve sample row references." },
        upsertKey: { type: "string", description: "Business key used to update existing sample rows instead of creating duplicates. When provided, the tool reads rows through lib_BaseRow.TableGetData and updates matches through lib_BaseRow.TableUpdateRow." },
        fields: {
          type: "array",
          description: "Baserow fields/columns to ensure. Use link_row for relationships and lookup for reported fields.",
          items: baserowFieldSchema
        },
        columns: {
          type: "array",
          description: "Alias of fields.",
          items: baserowFieldSchema
        },
        sampleRows: {
          type: "array",
          description: "Rows to insert or upsert as sample data. Keys are matched case-insensitively to real Baserow field names, so business keys like nom can populate the native Nom primary field. Link fields can contain target row ids or previously inserted sample row keys.",
          items: { type: "object", additionalProperties: true }
        },
        views: {
          type: "array",
          description: "Views to create. Filters use Baserow filter types, for example single_select_equal, link_row_has, contains.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              type: { type: "string", default: "grid" },
              filterType: { type: "string", enum: ["AND", "OR"], default: "AND" },
              public: { type: "boolean", default: false },
              filters: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    field: { type: "string" },
                    type: { type: "string" },
                    value: {}
                  },
                  required: ["field", "type"],
                  additionalProperties: true
                }
              }
            },
            required: ["name"],
            additionalProperties: true
          }
        }
      },
      required: ["name"],
      additionalProperties: false
    };
    return {
      type: "object",
      properties: {
        token: {
          type: "string",
          description: "Optional compatibility field. Leave empty in the integrated assistant; MCP bearer authentication supplies the No Code user credential out-of-band."
        },
        mode: {
          type: "string",
          enum: ["plan", "apply"],
          default: "plan",
          description: "plan returns the computed operations without persisting; apply creates/mutates through lib_BaseRow primitives and connector transactions."
        },
        create: {
          type: "object",
          properties: {
            workspace: { type: "boolean", default: false, description: "Allow creating a new Baserow workspace. Default false." },
            base: { type: "boolean", default: true, description: "Allow creating a new Baserow database/base in the workspace. Default true." },
            tables: { type: "boolean", default: true },
            fields: { type: "boolean", default: true },
            views: { type: "boolean", default: true },
            sampleRows: { type: "boolean", default: true }
          },
          additionalProperties: false
        },
        readBack: {
          type: "boolean",
          default: true,
          description: "Read the resulting catalog and fields back through lib_BaseRow after planning/applying."
        },
        schema: {
          description: "Canonical Baserow schema. Agents may translate Markdown, YAML, PDFs, or ER diagrams to this strict JSON before calling the tool.",
          oneOf: [
            {
              type: "object",
              properties: {
                workspaceId: { type: "integer" },
                workspaceName: { type: "string" },
                baseId: { type: "integer", description: "Existing Baserow database/application id." },
                databaseId: { type: "integer", description: "Alias of baseId." },
                baseName: { type: "string" },
                databaseName: { type: "string", description: "Alias of baseName." },
                tables: {
                  type: "array",
                  items: tableSchema
                }
              },
              required: ["tables"],
              additionalProperties: false
            },
            { type: "string" }
          ]
        }
      },
      required: ["schema"],
      additionalProperties: false
    };
  }

  function nocodeFormContractGetInputSchema() {
    return {
      type: "object",
      properties: {
        project: nocodeFormsProjectProperty(),
        includeAllTypes: {
          type: "boolean",
          default: false,
          description: "Set true to include the full AllTypes.json component prototypes. Default false returns the compact contract."
        }
      },
      additionalProperties: false
    };
  }

  function nocodeFormCompileInputSchema() {
    return {
      type: "object",
      properties: {
        project: nocodeFormsProjectProperty(),
        reduced: jsonObjectOrStringSchema("Reduced creative form JSON generated by the MCP client. Use contract-get first to learn supported fields and component types.")
      },
      required: ["reduced"],
      additionalProperties: false
    };
  }

  function nocodeFormValidateInputSchema() {
    return {
      type: "object",
      properties: {
        project: nocodeFormsProjectProperty(),
        form: jsonObjectOrStringSchema("Full C8Oforms document JSON to validate before persistence.")
      },
      required: ["form"],
      additionalProperties: false
    };
  }

  function nocodeFormCreateInputSchema() {
    return {
      type: "object",
      properties: {
        project: nocodeFormsProjectProperty(),
        reduced: jsonObjectOrStringSchema("Reduced creative form JSON. To upload a generated thumbnail image, include reduced.thumbnailImage={contentType:'image/png',base64:'...'}; the tool persists it as the C8Oforms attachment named thumbnail through APIV2_updateFormulaireDocument."),
        token: nocodeFormsTokenProperty()
      },
      required: ["reduced"],
      additionalProperties: false
    };
  }

  function nocodeFormUpdateInputSchema() {
    return {
      type: "object",
      properties: {
        project: nocodeFormsProjectProperty(),
        id: {
          type: "string",
          description: "C8Oforms document id to fetch through APIV2_getDocument before patching."
        },
        rev: {
          type: "string",
          description: "Optional expected document revision. When provided, it is sent back with the patched document."
        },
        patch: jsonObjectOrStringSchema("JSON Merge Patch object applied to the fetched form, then validated and persisted only through C8Oforms APIs. To upload a generated thumbnail image, include patch.thumbnailImage={contentType:'image/png',base64:'...'}; it is consumed by the tool and not stored in the form JSON."),
        token: nocodeFormsTokenProperty()
      },
      required: ["id", "patch"],
      additionalProperties: false
    };
  }

  function nocodeFormEditOperationSchema() {
    return {
      type: "object",
      description: "One semantic form edit. Prefer names when stable; use ids when available from a prior fetch/result. Use fieldObject for new components with the same reduced component shape accepted by nocode-form-compile.",
      properties: {
        action: {
          type: "string",
          enum: [
            "set_root",
            "set_media",
            "add_page",
            "update_page",
            "remove_page",
            "delete_page",
            "move_page",
            "add_field",
            "add_component",
            "add_element",
            "update_field",
            "update_component",
            "update_element",
            "remove_field",
            "remove_component",
            "remove_element",
            "delete_field",
            "delete_component",
            "delete_element",
            "move_field",
            "move_component",
            "move_element",
            "add_flow",
            "update_flow",
            "remove_flow",
            "delete_flow",
            "add_flow_element",
            "update_flow_element",
            "remove_flow_element",
            "delete_flow_element",
            "move_flow_element"
          ],
          description: "Semantic edit action. Common choices: add_page, update_page, add_field/add_component, update_field, remove_field, move_field, add_flow, add_flow_element. Use nocode-form-update only for simple root merge patches."
        },
        page: { type: "string", description: "Page technical name or visible page name. Use pageName for clarity when matching by visible name." },
        pageTechName: { type: "string", description: "Target pageTechName." },
        pageName: { type: "string", description: "Target visible page name." },
        field: { type: "string", description: "Field id or technical name. Use fieldName for clarity when matching by component name." },
        fieldId: { type: "string", description: "Target field id." },
        fieldName: { type: "string", description: "Target field name." },
        flow: { type: "string", description: "Flow id or name, depending on the operation." },
        flowId: { type: "string", description: "Target flow id." },
        flowName: { type: "string", description: "Target flow name." },
        element: { description: "For add/update flow element, the element object; otherwise target element id/name may be supplied as string." },
        elementId: { type: "string", description: "Target flow element id." },
        elementName: { type: "string", description: "Target flow element name." },
        parent: { type: "string", description: "Parent field/flow element id when adding or moving inside a container." },
        parentId: { type: "string", description: "Parent field/flow element id when adding or moving inside a container." },
        parentFieldId: { type: "string", description: "Parent field id when adding or moving a field inside a layout/container." },
        parentElementId: { type: "string", description: "Parent flow element id when adding or moving inside an if/loop/action container." },
        refKey: { type: "string", enum: ["childrenRefs", "childrenRefsElse"], description: "Flow child reference branch. Default childrenRefs." },
        index: { type: "integer", minimum: 0, description: "Destination insertion index. Omit to append." },
        fromIndex: { type: "integer", minimum: 0, description: "Source index for move_page when no page identifier is supplied." },
        toIndex: { type: "integer", minimum: 0, description: "Destination index for move_page." },
        fromFlowId: { type: "string", description: "Source flow id for move_flow_element." },
        fromFlowName: { type: "string", description: "Source flow name for move_flow_element." },
        toFlowId: { type: "string", description: "Destination flow id for move_flow_element." },
        toFlowName: { type: "string", description: "Destination flow name for move_flow_element." },
        name: { type: "string", description: "Visible/technical name used by add or update operations." },
        description: { type: "string", description: "Description HTML/text used by root, page, or field operations." },
        language: { type: "string", description: "Root language for set_root." },
        backgroundColor: { type: "string", description: "Wallpaper color for set_media/set_root." },
        thumbnailColor: { type: "string", description: "Application/form thumbnail color for set_media/set_root." },
        thumbnailImage: nocodeThumbnailImageSchema(),
        navigationMode: { type: "string", enum: ["tabs", "buttons"], description: "Navigation default used when adding a page." },
        pageObject: { type: "object", additionalProperties: true, description: "Page payload for add_page/update_page, for example {name:'Details', iconName:'people', enabledTab:true}." },
        fieldObject: { type: "object", additionalProperties: true, description: "Component payload for add_field/add_component. Use reduced component shape: {type:'text', name:'child_name', description:'Child name', mandatory:true} or {type:'layout', name:'row', children:[...]}." },
        patch: { type: "object", additionalProperties: true, description: "JSON merge patch for set_root/update_page/update_field/update_flow/update_flow_element. For component config, patch under config, e.g. {config:{mandatory:false, label:'Name'}}." },
        pageData: { type: "object", additionalProperties: true, description: "Page object for add_page/update_page." },
        flowData: { type: "object", additionalProperties: true, description: "Flow object for add_flow/update_flow." }
      },
      required: ["action"],
      additionalProperties: true,
      examples: [
        { action: "add_page", name: "Details", index: 1, navigationMode: "tabs" },
        { action: "add_field", pageName: "Details", fieldObject: { type: "text", name: "child_name", description: "Child name", mandatory: true } },
        { action: "add_field", parentFieldId: "1779979310404", fieldObject: { type: "select", name: "status", description: "Status", values: ["Open", "Closed"] } },
        { action: "update_field", fieldName: "child_name", patch: { config: { mandatory: false } } },
        { action: "remove_field", fieldName: "child_name" },
        { action: "move_field", fieldName: "status", pageName: "Details", index: 0 },
        { action: "add_flow_element", flowId: "flow_save", element: { type: "toast", message: "Saved" } }
      ]
    };
  }

  function nocodeFormEditInputSchema() {
    return {
      type: "object",
      properties: {
        project: nocodeFormsProjectProperty(),
        id: {
          type: "string",
          description: "C8Oforms document id to fetch through APIV2_getDocument before editing."
        },
        rev: {
          type: "string",
          description: "Optional expected document revision. When provided, it is forwarded to APIV2_getDocument."
        },
        operations: {
          description: "Ordered semantic edit operations, or one operation object. Use this instead of nocode-form-update for structural edits. Examples: [{action:'add_page', name:'Details'}], [{action:'add_field', pageName:'Details', fieldObject:{type:'text', name:'child_name', description:'Child name'}}], [{action:'remove_field', fieldName:'obsolete_field'}]. The tool applies them in memory, validates, then persists only through C8Oforms.APIV2_updateFormulaireDocument.",
          oneOf: [
            {
              type: "array",
              items: nocodeFormEditOperationSchema()
            },
            nocodeFormEditOperationSchema(),
            { type: "string" }
          ]
        },
        operation: Object.assign(nocodeFormEditOperationSchema(), {
          description: "Alias for operations when sending a single operation object, for example {action:'add_page', name:'Details'}."
        }),
        token: nocodeFormsTokenProperty()
      },
      required: ["id"],
      additionalProperties: false,
      examples: [
        {
          id: "1712345678901",
          operations: [
            { action: "add_page", name: "Details", navigationMode: "tabs" },
            { action: "add_field", pageName: "Details", fieldObject: { type: "text", name: "child_name", description: "Child name", mandatory: true } }
          ]
        },
        {
          id: "1712345678901",
          operations: { action: "update_field", fieldName: "child_name", patch: { config: { mandatory: false } } }
        }
      ]
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
      stateOnly: { type: "boolean" },
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
      launchRequested: { type: "boolean" },
      reusedBuild: { type: "boolean" },
      wait: { type: "boolean" },
      waited: { type: "boolean" },
      stateOnly: { type: "boolean" },
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
      browserDebugUrl: { type: "string", description: "JxBrowser remote debugging base URL for the Studio mobile viewer, when available." },
      browserDevToolsJsonUrl: { type: "string", description: "JxBrowser /json DevTools endpoint listing controllable pages, when available." },
      browserDevToolsWebSocketUrl: { type: "string", description: "DevTools WebSocket URL for the visible Studio mobile viewer page, when available." },
      browserDevToolsTarget: openObjectSchema({
        id: { type: "string" },
        type: { type: "string" },
        title: { type: "string" },
        url: { type: "string" },
        webSocketDebuggerUrl: { type: "string" },
        devtoolsFrontendUrl: { type: "string" }
      }),
      browserRemoteDebuggingPort: { type: "number" },
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
    if (seq === "tools_nocode_baserow_catalog_list") {
      return nocodeBaserowCatalogListInputSchema();
    }
    if (seq === "tools_nocode_baserow_schema_apply") {
      return nocodeBaserowSchemaApplyInputSchema();
    }
    if (seq === "tools_nocode_form_contract_get") {
      return nocodeFormContractGetInputSchema();
    }
    if (seq === "tools_nocode_form_compile") {
      return nocodeFormCompileInputSchema();
    }
    if (seq === "tools_nocode_form_validate") {
      return nocodeFormValidateInputSchema();
    }
    if (seq === "tools_nocode_form_create") {
      return nocodeFormCreateInputSchema();
    }
    if (seq === "tools_nocode_form_edit") {
      return nocodeFormEditInputSchema();
    }
    if (seq === "tools_nocode_form_update") {
      return nocodeFormUpdateInputSchema();
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
