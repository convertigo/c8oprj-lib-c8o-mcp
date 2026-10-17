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

  function tagsInputSchema(mutation) {
    var schema = {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["projectObjects", "workspaceProjects"], description: "projectObjects edits sequence tags in project; workspaceProjects edits local project organization." },
        project: { type: "string", description: "Required for projectObjects. Exact loaded project name, never a storage path." }
      },
      required: ["scope"],
      additionalProperties: false,
      allOf: [{ if: { properties: { scope: { const: "projectObjects" } } }, then: { required: ["project"] } }]
    };
    if (!mutation) {
      schema.properties.referenceProject = { type: "string", description: "Optional workspaceProjects preview of direct and indirect project references." };
      return schema;
    }
    schema.properties.revision = { type: "string", description: "Exact revision from tags-get or the preceding tags-apply. Stale or missing revisions are rejected." };
    schema.properties.action = { type: "string", enum: ["create", "update", "delete", "assign", "remove", "clear", "transfer", "reorder", "share", "republish", "resolve", "createFromReferences"], description: "One generic tag-domain command." };
    schema.properties.input = {
      type: "object",
      description: "Command object. create/update: definition and id for update. Memberships: canonical targets and ordered tagIds. delete: id, confirmed:true, memberCount. Flow configs: definition.metadata.flow.configs, using names advertised by tags-get. Preserve unavailable metadata when updating.",
      properties: {
        id: { type: "string" },
        definition: { type: "object", additionalProperties: true },
        targets: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 1000 },
        tagIds: { type: "array", items: { type: "string" }, description: "Explicit membership order, never alphabetically sorted." },
        confirmed: { type: "boolean" },
        memberCount: { type: "integer", minimum: 0 },
        fromTagId: { type: "string" },
        shared: { type: "boolean" },
        fromProject: { type: "string" },
        alignSources: { type: "boolean" },
        project: { type: "string", description: "createFromReferences root project." }
      },
      additionalProperties: false
    };
    schema.required.push("revision", "action", "input");
    return schema;
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
        callsFile: {
          type: "string",
          description: "Instead of calls: path of a .json file under the Convertigo projects workspace holding the calls array (or {calls:[...]}). Use it for large generated batches so they are not re-typed as arguments. Absolute or relative to the workspace."
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
        },
        reveal: {
          type: "boolean",
          description: "Set true when host UI reveal mode is enabled. The batch propagates reveal to supported calls and, for optimized tree mutations, reveals the final touched object after the deferred Studio refresh.",
          default: false
        },
        responseDetail: {
          type: "string",
          enum: ["compact", "full"],
          description: "Default compact. Compact keeps complete call payloads for reads, summarizes mutation payloads (touched objects as touchedCount + touchedRoots instead of every QName), and emits lightweight reference pointers instead of duplicating results. Use full only for detailed diagnostics.",
          default: "compact"
        }
      },
      required: [],
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
      description: "Property updates as either a simple name/value map or an array of property entries from tree-get. UI identifier values must be valid TypeScript identifiers (for example clockDisplay, never clock-display). scriptContent is one atomic string: mode=merge does not merge its internal Begin/End sections, so preserve the complete value returned by tree-get and edit only the intended sections.",
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
          description: "Child nodes to create or upsert below this node. When at=inside/before/after, tree itself must be the single node to create and include className and name; do not submit a children-only wrapper. Use separate batch-call entries to create siblings.",
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
        depth: {
          type: "integer",
          minimum: 0,
          maximum: 20,
          description: "Compatibility alias for childrenDepth. Prefer childrenDepth."
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
          description: "Allowed values: merge or replace. replace also removes children missing from the patched scope. merge combines object properties, but string properties such as scriptContent are still replaced atomically."
        },
        tree: Object.assign(treeNodeSchema(), {
          description: "Canonical node payload using the tree-get shape. Read-only top-level fields such as qname, depth, hasChildren, directChildrenCount, subtreeCount, and priority are ignored."
        }),
        reveal: {
          type: "boolean",
          default: false,
          description: "Set true when the host UI reveal mode is enabled, so Studio selects and reveals the patched or created object in the Project Explorer."
        },
        responseDetail: {
          type: "string",
          enum: ["compact", "full"],
          description: "Default compact: operations report appliedCount and appliedByAction instead of every applied entry, and touchedQNames lists root QNames only. Use full only to diagnose a mutation.",
          default: "compact"
        }
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
        },
        authenticatedUser: {
          type: "string",
          description: "Optional user to run this call as (what the login sequence passes to context.setAuthenticatedUser, for example an email), for this call only. Without it the call has no authenticated user and sequences marked authenticatedContextRequired answer Authentication required."
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
        maxPages: { type: "integer", minimum: 1, maximum: 100, default: 20, description: "Maximum upstream pages scanned before returning. 1 to 100; default 20." },
        detail: { type: "string", enum: ["compact", "full"], default: "compact", description: "compact returns name, description, topics, status and shared component/action counts; full adds the shared lists and repository URLs." }
      },
      additionalProperties: false
    };
  }

  function marketplaceImportInputSchema() {
    return {
      type: "object",
      properties: {
        project: { type: "string", description: "Marketplace project name. For the standard NGX starter use template_ngxBuilderIonic." },
        importedProjectName: { type: "string", description: "New local project name. Required when the marketplace entry is a starter template. Canonical standard NGX call: {project:\"template_ngxBuilderIonic\", importedProjectName:\"<targetProject>\"}." },
        targetProject: { type: "string", description: "For a library: the project that uses it. The import adds the reference to the library in that project (needed to call its sequences, use its shared components and deploy with it); importing a library and referencing it does not modify the library." }
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
        browserDebugPort: {
          type: "integer",
          minimum: 1024,
          maximum: 65535,
          description: "Optional exact JxBrowser CDP port reserved by the managed agent host. The integrated MCP transport supplies it automatically."
        },
        wait: {
          type: "boolean",
          default: true,
          description: "Set false to request/open the viewer and return immediately. With true, wait for the portable Engine source-generation cycle and, in Studio only, the optional HMR compile cycle."
        },
        stateOnly: {
          type: "boolean",
          default: false,
          description: "Set true to read the current viewer/editor state and URLs without opening, starting, or restarting the builder. Combine with wait=true after frontend mutations to wait for source generation and, in Studio, HMR success or compile_error."
        },
        reveal: {
          type: "boolean",
          default: false,
          description: "Set true when the host UI reveal mode is enabled, so Studio can visibly focus the mobile builder/editor while the agent works."
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
        target: { type: "string", description: "Alias of qname, as in databaseobject-tree-apply." },
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
        target: { type: "string", description: "Alias of qname, as in databaseobject-tree-apply." },
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
        filter: { type: "string", description: "Search text. Space-separated terms must all appear in the object's YAML (name, properties, comment); pair with useRegExp=true for a regex." },
        limit: integerSchema(1, 1000, 200, "Maximum matches returned per call. 1 to 1000; default 200."),
        matchCase: booleanFlagSchema(false, "Set true for case-sensitive matching."),
        useRegExp: booleanFlagSchema(false, "Set true to treat filter as a Java regular expression."),
        objectType: { type: "string", description: "Optional object type filter: the type returned in matches (Step, Sequence, Transaction, Variable, Connector...) or a class token such as steps.SequenceStep. Use * or omit for any type." }
      },
      additionalProperties: false
    };
  }

  function paletteDescribeInputSchema() {
    return {
      type: "object",
      properties: {
        className: { type: "string", description: "Palette entry class token, usually copied from palette-list." },
        verbose: booleanFlagSchema(false, "Default false returns the property list (names, types, defaults, allowed values). Set true to add property descriptions, hints and the creation template.")
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
        filter: { type: "string", description: "Case-insensitive substring filter on category and item names. Use one specific term; a space-separated value is not an OR query." },
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

  var SECURITY_SEVERITIES = ["info", "low", "medium", "high", "critical"];

  function projectSecurityAuditInputSchema() {
    return {
      type: "object",
      properties: {
        project: { type: "string", description: "Project technical name to audit." },
        includeEngine: booleanFlagSchema(true, "Set false to skip engine-wide checks (CORS policy, XSRF, crypto passphrase, admin password). Engine findings get their own score and never lower the project score."),
        includeFrontend: booleanFlagSchema(true, "Set false to skip the NGX frontend source scan."),
        minSeverity: {
          type: "string",
          enum: SECURITY_SEVERITIES,
          default: "low",
          description: "Lowest severity listed in findings. The score always counts every finding."
        },
        limit: integerSchema(1, 1000, 200, "Maximum findings listed. 1 to 1000; default 200. Summary counts stay complete."),
        suppress: {
          type: "array",
          description: "Accepted risks. Matching findings stay listed with suppressed=true and no longer lower the score. Omit qname to accept every finding of the rule.",
          items: {
            type: "object",
            properties: {
              ruleId: { type: "string", description: "Rule id such as EXP-03." },
              qname: { type: "string", description: "Exact finding qname." },
              reason: { type: "string", description: "Why the risk is accepted." }
            },
            required: ["ruleId"],
            additionalProperties: false
          }
        }
      },
      required: ["project"],
      additionalProperties: false
    };
  }

  function securityFindingSchema() {
    return openObjectSchema({
      ruleId: { type: "string" },
      severity: { type: "string", enum: SECURITY_SEVERITIES },
      category: { type: "string" },
      title: { type: "string" },
      qname: { type: "string" },
      evidence: openObjectSchema({}),
      recommendation: { type: "string" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      anonymousReachable: { type: "boolean" },
      requestable: { type: "string" },
      suppressed: { type: "boolean" },
      suppressionReason: { type: "string" }
    });
  }

  function securityRuleCheckSchema() {
    return openObjectSchema({
      ruleId: { type: "string" },
      category: { type: "string" },
      title: { type: "string" },
      status: { type: "string", enum: ["passed", "failed", "info", "suppressed", "notApplicable"], description: "info: only informational findings, no deduction." },
      findings: { type: "number", description: "Active findings of the rule." },
      suppressed: { type: "number" },
      maxSeverity: { type: "string" },
      deduction: { type: "number", description: "Points this rule removes from the score, after its cap." },
      cap: { type: "number" },
      reason: { type: "string", description: "Why the rule could not apply." },
      recommendation: { type: "string" }
    });
  }

  function projectSecurityAuditOutputSchema() {
    var grade = { type: "string", enum: ["A", "B", "C", "D", "F"] };
    return openObjectSchema({
      project: { type: "string" },
      projectVersion: { type: "string" },
      rulesetVersion: { type: "string" },
      auditedAt: { type: "string" },
      score: { type: "number", description: "0 to 100; 100 means no active finding." },
      grade: grade,
      gradeCappedBy: { type: "string" },
      summary: openObjectSchema({
        critical: { type: "number" },
        high: { type: "number" },
        medium: { type: "number" },
        low: { type: "number" },
        info: { type: "number" },
        suppressed: { type: "number" },
        byCategory: openObjectSchema({}),
        rules: openObjectSchema({
          passed: { type: "number" },
          failed: { type: "number" },
          info: { type: "number" },
          suppressed: { type: "number" },
          notApplicable: { type: "number" }
        })
      }),
      categories: {
        type: "array",
        items: openObjectSchema({
          id: { type: "string" },
          score: { type: "number" },
          deduction: { type: "number" },
          findings: { type: "number" }
        })
      },
      rules: { type: "array", description: "Complete checklist, independent of minSeverity and limit; deductions add up to 100 - score.", items: securityRuleCheckSchema() },
      findings: { type: "array", items: securityFindingSchema() },
      coverage: openObjectSchema({}),
      engine: openObjectSchema({
        score: { type: "number" },
        grade: grade,
        gradeCappedBy: { type: "string" },
        studioMode: { type: "boolean" },
        rules: { type: "array", items: securityRuleCheckSchema() },
        findings: { type: "array", items: securityFindingSchema() }
      }),
      scoreModel: openObjectSchema({}),
      limitations: stringArraySchema(),
      warnings: stringArraySchema()
    });
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
        reduced: jsonObjectOrStringSchema("Reduced creative form JSON generated by the MCP client. Use contract-get first for component types and contextualDefaults. Scalar defaultFrom supports user, clock, field, query, expression and literal sources; initial is distinct from reactive calculation.")
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
        reduced: jsonObjectOrStringSchema("Reduced creative form JSON. For Baserow, supply table configuration and mappings but omit form_id/source_id/source_owner: creation finalizes them automatically and verifies readback. If saved=true with status=partial, resume the returned same-id recovery; do not recreate. Thumbnail upload: reduced.thumbnailImage={contentType:'image/png',base64:'...'} is persisted as the thumbnail attachment through APIV2_updateFormulaireDocument."),
        token: nocodeFormsTokenProperty(),
        reveal: {
          type: "boolean",
          default: false,
          description: "Set true when the host UI reveal mode is enabled, so No Code Studio can switch to the created form editor."
        }
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
        token: nocodeFormsTokenProperty(),
        reveal: {
          type: "boolean",
          default: false,
          description: "Set true when the host UI reveal mode is enabled, so No Code Studio can switch to the edited form and show the changes."
        }
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
            "finalize_baserow_bindings",
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
          description: "Semantic edit action. finalize_baserow_bindings resumes an already saved creation, as the only operation, using real ids and the authenticated creator; never retry create. Other common choices: add_page, update_page, add_field, update_field, move_field, add_flow, add_flow_element."
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
        navigationMode: { type: "string", enum: ["tabs", "buttons", "custom"], description: "Navigation used for an added page. Omit to inherit the adjacent page's navigation; custom disables automatic tabs/buttons." },
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
        token: nocodeFormsTokenProperty(),
        reveal: {
          type: "boolean",
          default: false,
          description: "Set true when the host UI reveal mode is enabled, so No Code Studio can switch to the edited form and show the changes."
        }
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

  function nullableObjectSchema(properties) {
    var schema = openObjectSchema(properties);
    schema.type = ["object", "null"];
    return schema;
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

  function revealOutputSchema() {
    return openObjectSchema({
      requested: { type: "boolean" },
      status: { type: "string" },
      action: { type: "string" },
      target: { type: "string" },
      qname: { type: "string" },
      targetQName: { type: "string" },
      project: { type: "string" },
      formId: { type: "string" },
      selected: { type: "boolean" },
      expanded: { type: "boolean" },
      revealed: { type: "boolean" },
      editorOpened: { type: "boolean" },
      viewerUrl: { type: "string" },
      browserDebugUrl: { type: "string" },
      message: { type: "string" },
      error: { type: "string" }
    });
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
      touchedCount: { type: "number" },
      touchedRoots: stringArraySchema(),
      refreshQName: { type: "string" },
      studioRefresh: nullableSchema(studioRefreshSchema()),
      reveal: nullableSchema(revealOutputSchema()),
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
      responseDetail: { type: "string" },
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
      touchedQNames: stringArraySchema(),
      reveal: revealOutputSchema()
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

  function subagentUsageSchema(tools) {
    return closedObjectSchema({
      tool: { type: "string", enum: tools },
      callId: { type: "string" },
      runId: { type: "string", description: "Run id, also the folder subagents/<runId> of the Studio user workspace." },
      profile: { type: "string" },
      model: { type: "string" },
      requests: { type: "number", description: "Model calls of the run." },
      inputTokens: { type: "number" },
      cachedTokens: { type: "number" },
      outputTokens: { type: "number" },
      reasoningTokens: { type: "number" },
      totalTokens: { type: "number" },
      cost: { type: ["number", "null"], description: "Cost of all the calls, null when one of them is not priced." },
      costSource: { type: "string", enum: ["", "gateway", "journal"], description: "gateway: charged by the gateway; journal: the sub-agent's estimate from its configured prices." },
      currency: { type: "string" },
      durationMs: { type: "number" }
    });
  }

  function subagentActivitySchema() {
    return {
      type: "array",
      description: "The latest steps of the sub-agent.",
      items: closedObjectSchema({ at: { type: "number" }, turn: { type: "number" }, text: { type: "string" } })
    };
  }

  function subagentRunOutputSchema() {
    return closedObjectSchema({
      status: { type: "string", enum: ["finished", "running"], description: "running: call subagent-run again with runId alone to wait for the report." },
      runId: { type: "string" },
      profile: { type: "string" },
      model: { type: "string" },
      task: { type: "string" },
      elapsedMs: { type: "number" },
      activity: subagentActivitySchema(),
      message: { type: "string" },
      report: { type: "object", additionalProperties: true, description: "The profile's report. verifier: verdict, summary, checks, visualDefects, screenshots, finalUrl." },
      reportFile: { type: "string", description: "Full report with the step trace, relative to the Studio user workspace." },
      stopReason: { type: "string", description: "finished, or the budget (step, time, cost) that ended the run." },
      modelCalls: { type: "number" },
      actions: { type: "number" },
      durationMs: { type: "number" },
      usage: subagentUsageSchema(["subagent-run"])
    });
  }

  function browserVerifyOutputSchema() {
    var shot = { type: "string", description: "Screenshot file, relative to the Studio user workspace (readable by image-describe)." };
    return closedObjectSchema({
      status: { type: "string", enum: ["finished", "running"], description: "running: call browser-verify again with verificationId alone to get the report." },
      verificationId: { type: "string" },
      elapsedMs: { type: "number", description: "With status running: time since the verification started." },
      message: { type: "string", description: "With status running: what to do next." },
      activity: subagentActivitySchema(),
      verdict: { type: "string", enum: ["passed", "failed", "partial"], description: "passed only when every check passed and no blocking defect was seen; partial when something could not be checked." },
      summary: { type: "string" },
      checks: {
        type: "array",
        items: closedObjectSchema({
          id: { type: "string" },
          path: { type: "string" },
          check: { type: "string" },
          status: { type: "string", enum: ["passed", "failed", "not_checked"] },
          evidence: { type: "string", description: "What the sub-agent saw: exact text, value, or screenshot finding." },
          screenshot: shot
        })
      },
      visualDefects: {
        type: "array",
        items: closedObjectSchema({
          severity: { type: "string", enum: ["blocking", "major", "minor"] },
          description: { type: "string" },
          location: { type: "string" },
          screenshot: shot
        })
      },
      screenshots: {
        type: "array",
        items: closedObjectSchema({ name: { type: "string" }, path: shot, url: { type: "string" } })
      },
      reportFile: { type: "string", description: "Full report with the step trace, relative to the Studio user workspace." },
      finalUrl: { type: "string" },
      stopReason: { type: "string", description: "finished, or the budget that ended the run." },
      modelCalls: { type: "number" },
      browserActions: { type: "number" },
      durationMs: { type: "number" },
      usage: subagentUsageSchema(["browser-verify"])
    });
  }

  function imageDescribeOutputSchema() {
    return closedObjectSchema({
      description: { type: "string", description: "The vision model's answer." },
      model: { type: "string" },
      reasoning: { type: "string", description: "Reasoning level actually used: none, high, or model default." },
      usage: closedObjectSchema({
        tool: { type: "string", enum: ["image-describe"] },
        callId: { type: "string", description: "Gateway call id." },
        model: { type: "string" },
        inputTokens: { type: "number" },
        cachedTokens: { type: "number" },
        outputTokens: { type: "number" },
        reasoningTokens: { type: "number" },
        totalTokens: { type: "number" },
        cost: { type: ["number", "null"], description: "Gateway cost of the call, null when the gateway does not give it." },
        currency: { type: "string" },
        durationMs: { type: "number" }
      }),
      image: closedObjectSchema({
        source: { type: "string", enum: ["file", "base64"] },
        path: { type: "string" },
        mimeType: { type: "string" },
        bytes: { type: "number" }
      }),
      truncated: { type: "boolean" },
      warning: { type: "string" }
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
      category: { type: "string" },
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

  // High-level generators (js/tools_generators.js): the specs stay open objects, their keys are
  // described here so a caller can write a valid spec without reading the guides first.
  function generatorInputSchema(seq) {
    var open = function (description) { return { type: "object", additionalProperties: true, description: description }; };
    var openArray = function (description) { return { type: "array", items: { type: "object", additionalProperties: true }, description: description }; };
    var project = { type: "string", description: "Application project (exact technical name)." };
    if (seq === "tools_sql_transaction_create") {
      return {
        type: "object",
        properties: {
          project: project,
          connector: { type: "string", description: "SqlConnector name; optional when the project has only one." },
          name: { type: "string", description: "Transaction name: q_<what> for a read, w_<what> for a write." },
          sql: { type: "string", description: "SQL text with {variables}. Refused when it breaks a rule of convertigo-integration-sql: unaliased or non camelCase selected columns (write col AS \"camelCase\"), '{x}%' inside a literal, {x} IS NULL, IN ({x}), a bare number added to a date." },
          select: open("Structured read instead of sql: {from:\"orders o JOIN customer c ON c.id = o.customer_id\", columns:{id:\"o.id\", orderNumber:\"o.order_number\"} (or an array of columns, aliased in camelCase), where:[{variable:\"ownerId\", column:\"o.owner_id\"}, {variable:\"search\", columns:[\"o.order_number\",\"o.label\"], op:\"contains\"}, {variable:\"ids\", column:\"p.id\", op:\"in\"}, {variable:\"actif\", column:\"p.actif\", op:\"bool\"}, {sql:\"p.actif = TRUE\"}], orderBy, groupBy, limit}. Each filter is optional ({x} = '' OR ...) unless required:true; ops =, <>, <, <=, >, >=, contains, startsWith, in (comma-separated list: POSITION, FIND_IN_SET on MariaDB/MySQL, CHARINDEX on SQL Server, INSTR on Oracle), bool ('true'/'false')."),
          insert: open("Structured insert: {table, values:{column: \"variable\" | {sql:\"CURRENT_TIMESTAMP\"}}}."),
          update: open("Structured update: {table, set:{column: \"variable\" | {sql}}, where:{column: \"variable\"}}."),
          deleteFrom: open("Structured delete: {table, where:{column: \"variable\"}}."),
          variables: open("Defaults and descriptions of the declared variables: {name: {value, description}} or {name: defaultValue}. Variables are declared from the {placeholders}; an unknown name is refused."),
          autoCommit: { type: "string", enum: ["0", "1", "2"], description: "0 manual, 1 after each query, 2 once at the end (default for a write with several statements separated by ;)." },
          maxResult: { type: "string", description: "Optional max number of rows." },
          comment: { type: "string" },
          transactions: openArray("Several transactions in one call: an array of {name, connector?, sql | select | insert | update | delete, variables?, autoCommit?}. Replaces the single-transaction arguments."),
          ifExists: { type: "string", enum: ["fail", "replace", "keep"], default: "fail", description: "replace rewrites the SQL and variables of an existing transaction in place (its callers keep working); keep leaves it untouched." }
        },
        required: ["project"],
        additionalProperties: false
      };
    }
    if (seq === "tools_facade_create") {
      return {
        type: "object",
        properties: {
          project: project,
          name: { type: "string", description: "Facade sequence name, e.g. order_list. It must not exist yet." },
          connector: { type: "string", description: "Default SqlConnector of the reads and writes that give SQL or a transaction name alone; optional when the project has one." },
          script: { type: "string", default: "js/app.js", description: "Business rules file, included by the init step. Must exist (project-js-set)." },
          logic: { type: "string", description: "Function of script called by the logic step, e.g. App.orderList. It receives ctx = {me (user row), input: {<inputs> as strings}, reads: {<read name>: [rows] of a SQL read, or the JSON a transaction or sequence returns}, today} and returns {success, data, errors:[{code,message,field}], meta}, plus optional writes: {<write name>: row | [rows]} whose fields are the variables of the write transaction or sequence. Never called when the role or perimeter check already failed." },
          inputs: { type: "array", items: { anyOf: [{ type: "string" }, { type: "object", additionalProperties: true }] }, description: "Sequence variables: names or {name, value (default), description}. They reach logic as ctx.input.<name> strings and the reads as JS variables of the same name." },
          auth: { anyOf: [{ type: "boolean" }, open("")], description: "Default {required:true}: authenticatedContextRequired, user reloaded with userTransaction (default q_user_by_email; any connector as \"<connector>.<transaction>\") or userSequence (\"<sequence>\" or \"<library>.<sequence>\", answering the user fields), variable email = session user, refused with UNAUTHENTICATED when missing, or when activeField (a boolean column of the user row, no default: give it only if the user table has one) is false, FORBIDDEN when roleField (default role) is not in roles. false for an anonymous facade." },
          roles: { type: "array", items: { type: "string" }, description: "Roles allowed (auth.roles); empty means any active user." },
          reads: openArray("Reads, in order: [{name, then what to call: transaction:\"q_orders\" (the default SqlConnector, else the only transaction of that name) | \"<connector>.<transaction>\" (any connector: HTTP/REST, SQL or other; \"<library>.<connector>.<transaction>\" in a referenced library) | sequence:\"<sequence>\" | \"<library>.<sequence>\" (the app must reference the library: marketplace-import({project, targetProject})) | sql/select (creates q_<name>); vars:{variable:\"JS expression\"} (e.g. {ownerId:\"me.role === 'ADMIN' ? ownerId : me.id\"}; others take the input of the same name), path:\"items\" (not SQL: keep this part of the JSON), perimeter:{field:\"ownerId\", userField:\"id\", bypassRoles:[\"ADMIN\"], mode:\"filter\" (drop rows) | \"deny\" (FORBIDDEN, no row returned)}, required:true (NOT_FOUND when no row or empty JSON)}]. ctx.reads.<name> holds the SQL rows, or the JSON the transaction or sequence returns (without attr, error and HttpInfo; the array or object of a JSON HTTP transaction unwrapped). An HTTP transaction must have httpInfo:true. A failing read (document.error, HTTP status >= 400, success false from a sequence) answers READ_FAILED."),
          writes: openArray("Writes, after logic and only when it succeeds: [{name, transaction:\"w_order_insert\" | \"<connector>.<transaction>\" | sequence:\"<sequence>\" | \"<library>.<sequence>\" | sql/insert/update/delete (creates w_<name>)}]. Each row of resp.writes.<name> runs the call once with its fields as variables; a failure (document.error, HTTP status >= 400, success false from a sequence) answers WRITE_FAILED and the later rows and writes are skipped. Several statements that must be atomic belong in one transaction (sql with ;)."),
          errors: open("Override codes or messages: {unauthenticated, forbidden, notFound, readFailed, writeFailed, logic: {code, message} | \"message\"}."),
          accessibility: { type: "string", enum: ["Hidden", "Private", "Public"], default: "Hidden" },
          comment: { type: "string" }
        },
        required: ["project", "name", "logic"],
        additionalProperties: false
      };
    }
    return {
      type: "object",
      properties: {
        project: project,
        name: { type: "string", description: "PascalCase page name; it must not exist yet." },
        title: { type: "string", description: "Toolbar title (and section title unless heading is given)." },
        kind: { type: "string", enum: ["list", "detail", "form", "dashboard"] },
        facade: { type: "string", description: "Data facade called at page enter (required except for a form without data). Every variable of the facade is passed explicitly: filter, param, vars entry, else ''." },
        params: { type: "array", items: { type: "string" }, description: "navParams data keys copied into locals of the same name at page enter (e.g. [\"id\"] for a detail page)." },
        locals: open("Extra locals set at page enter: {local: \"TypeScript expression\"}, e.g. {today: \"new Date().toISOString().substring(0, 10)\"}; templates read them as local?.<name>."),
        vars: open("Extra facade variables: {variable: \"TypeScript expression\"}, e.g. {status: \"'LATE'\"}."),
        filters: openArray("List filters bound to locals filter<Name> and passed to the facade variable of the same name: [{name:\"search\", label, type:\"search\"|\"text\"|\"date\"|\"select\", options:[{value, label}], value}]. A Filter button reloads the list (cacheTtl 0)."),
        filterLabel: { type: "string", description: "Text of the filter button, in the app's language (English default \"Filter\")." },
        list: open("List page: {items:\"items\" (path in out.data), item:\"row\", title:\"orderNumber\", subtitle, note, badge:{field, labels:{CODE:\"Label\"}, colors:{CODE:\"success\"}}, empty (text when there is no row, English default \"No record.\"), onItem:{page, kind:\"push\", data:{id:\"id\"}}}. A field is a path in the row or {field, labels, prefix, suffix}."),
        detail: open("Detail page: {record:\"order\" (path in out.data, optional), fields:[{label, field, labels?}]} rendered as a label/value list."),
        form: open("Form page: {submit:\"order_submit\", fields:[{name (the submit variable), label, type: text|email|password|number|tel|url|date|time|textarea|select|toggle, required, helper, value (TypeScript initial value), options:[{value,label}] | optionsFrom:{items:\"items\" (path in the page facade data), item, value:\"id\", label:\"orderNumber\"}, multiple (sent comma-separated), maxLength, rows}], vars:{variable:\"TypeScript\"} (variables not in the form), success:{message (English default \"Saved.\"), page, kind:\"root\"|\"push\"|\"pop\", data}, cancel:{page, kind} | false, submitLabel (default \"Save\"), cancelLabel (default \"Cancel\")}. Give every text in the app's language: the defaults are English and the result warns when one was used. Submit: UIForm onSubmit > CallSequenceAction with Form SmartSources > toast and navigation, or the first error message."),
        dashboard: open("Dashboard page: {kpis:[{label, field:\"counters.activeOrders\"}], sections:[{heading, items:\"late\", item, title, subtitle, note, badge, empty} | {heading, record:\"lastRun\", fields:[{label, field}]}]}."),
        actions: openArray("Buttons under the content: [{label, page, kind:\"push\"|\"root\"|\"pop\", data:{key:\"TypeScript\"}, sequence (called first, e.g. auth_logout), fill, color}]."),
        authRedirect: { type: "string", description: "Entry page opened with RootPageAction when the facade answers a lost-session code or Authentication required." },
        authCodes: { type: "array", items: { type: "string" }, description: "Codes treated as a lost session; default UNAUTHENTICATED, the facade-create default; give the same code as facade-create's errors.unauthenticated when it was changed." },
        heading: { type: "string", description: "Heading2 under the toolbar; default title, \"\" for none." },
        inMenu: { type: "boolean", default: false },
        segment: { type: "string", description: "Route segment; default path-to-<name in lower case>." },
        icon: { type: "string", description: "Menu icon (ionicons name)." }
      },
      required: ["project", "name", "kind"],
      additionalProperties: false
    };
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
      ready: { type: "boolean", description: "True when the live viewer is usable and no currently observed build signal still blocks it. This does not imply compileState=success." },
      viewerReady: { type: "boolean", description: "True when a reachable live viewer has rendered DOM evidence; a responding URL with an empty app-root is not ready." },
      viewerHydrating: { type: "boolean", description: "True when the live URL responds but the Studio viewer application DOM is still empty." },
      compileState: { type: "string", enum: ["unknown", "building", "success", "failed", "not_required"], description: "Compilation evidence observed by this call, independent from viewer/browser readiness." },
      buildObserved: { type: "boolean", description: "True when this call observed a Studio live-build job or terminal compiler signal." },
      readyReason: { type: "string", enum: ["", "compiled", "generation_no_change", "browser_control_ready", "viewer_ready"], description: "Evidence that allowed the call to stop waiting." },
      launched: { type: "boolean" },
      launchRequested: { type: "boolean" },
      reusedBuild: { type: "boolean" },
      wait: { type: "boolean" },
      waited: { type: "boolean" },
      revealWaitCapApplied: { type: "boolean" },
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
      browserDevToolsTarget: nullableObjectSchema({
        id: { type: "string" },
        type: { type: "string" },
        title: { type: "string" },
        url: { type: "string" },
        webSocketDebuggerUrl: { type: "string" },
        devtoolsFrontendUrl: { type: "string" }
      }),
      browserRemoteDebuggingPort: { type: "number" },
      browserDebugPortRequested: { type: "number" },
      browserDebugPortApplied: { type: "boolean" },
      browserDebugPortMatched: { type: "boolean" },
      browserControlReady: { type: "boolean", description: "True only when the Studio JxBrowser CDP target is on the live viewer URL and its application DOM is hydrated for Playwright/browser-control." },
      browserControlTargetUrl: { type: "string", description: "Current URL of the visible JxBrowser CDP target, often about:blank while the loader is still building." },
      browserControlHint: { type: "string", description: "Short browser-control guidance for the returned Studio JxBrowser debug endpoint, including the requirement to use configured MCP tools rather than ad hoc scripts." },
      nextAction: nullableSchema(closedObjectSchema({
        tool: { type: "string" },
        arguments: {
          type: "object",
          additionalProperties: true
        }
      })),
      editor: mobileBuilderEditorSchema(),
      editorOpened: { type: "boolean" },
      browser: openObjectSchema({
        currentUrl: { type: "string" },
        locationHref: { type: "string" },
        title: { type: "string" },
        statusText: { type: "string" },
        errorText: { type: "string" },
        bodyTextSample: { type: "string" },
        appRootHydrated: { type: "boolean", description: "True when the Angular app-root contains rendered child elements." },
        appRootChildCount: { type: "number" },
        progress: { type: "number" }
      }),
      build: closedObjectSchema({
        supported: { type: "boolean", description: "True when the optional Studio Eclipse live-build job can be inspected." },
        jobName: { type: "string" },
        active: { type: "boolean" },
        state: { type: "string", description: "Current Eclipse job state: none, waiting, sleeping, or running." },
        processAlive: { type: "boolean", description: "True when the mobile builder process is currently alive." },
        launchRequestedAt: { type: "number", description: "Timestamp of the most recent builder launch request, or zero." },
        observed: { type: "boolean", description: "True when this waited call observed the live-build job." },
        finishedAtObserved: { type: "number" },
        requestedAt: { type: "number", description: "Timestamp of the pending HMR request consumed by this call, or zero." },
        terminalObserved: { type: "boolean", description: "True when this call observed the terminal compiler signal for the pending HMR cycle." },
        generation: closedObjectSchema({
          supported: { type: "boolean", description: "True when the Convertigo Engine exposes portable source-generation cycles." },
          id: { type: "number" },
          status: { type: "string", enum: ["none", "pending", "no_change", "changed", "failed"] },
          startedAt: { type: "number" },
          completedAt: { type: "number" },
          changedFileCount: { type: "number" },
          noChange: { type: "boolean" },
          failed: { type: "boolean" },
          error: { type: "string" }
        })
      }),
      compileErrors: {
        type: "array",
        items: mobileBuilderCompileErrorSchema()
      },
      logs: {
        type: "array",
        items: mobileBuilderLogLineSchema()
      },
      logQuery: requestableLogQuerySchema(),
      reveal: revealOutputSchema()
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
    if (String(sequenceName) === "tools_tigo_resources") {
      return {type:"object",additionalProperties:false,required:["project","action"],properties:{
        project:{type:"string",description:"Exact loaded project name. Personal preferences, secrets, activation and built-ins cannot be changed by this tool."},
        action:{type:"string",enum:["list","get","save","duplicate","delete","readFile","writeFile"]},
        kind:{type:"string",enum:["prompt","skill","mcp"]},key:{type:"string",description:"Qualified key returned by list/get."},
        revision:{type:"string",description:"Exact revision returned by get; required for updates, deletes and overwriting a support file."},
        language:{type:"string"},input:{type:"object",additionalProperties:true,description:"save: schemaVersion:1, id, defaultLanguage, translations with title/description/body; skills need SKILL.md frontmatter and optional requiresMcp. MCP: connection with transport http/stdio, url or command/args, env reference names and headers {name:{env,prefix}}. Never include credentials. duplicate: {id}. Support files: {path,content?}, under references/, scripts/ or assets/."}
      }};
    }
    var seq = sequenceName || "";
    if (!seq && requestable && requestable.getName) {
      try {
        seq = String(requestable.getName());
      } catch (_ignoreName) {
        seq = "";
      }
    }
    seq = String(seq || "");

    if (seq === "tools_tags_get" || seq === "tools_tags_apply") {
      return tagsInputSchema(seq === "tools_tags_apply");
    }
    if (seq === "tools_project_lint") {
      return {
        type: "object",
        properties: {
          project: { type: "string", description: "Project technical name to lint." },
          checkTexts: { type: "boolean", description: "false skips the review of the shown texts and i18n files (spelling, accents, language, any language) by the gateway model; default true." }
        },
        required: ["project"],
        additionalProperties: false
      };
    }
    if (seq === "tools_scheduler_list") {
      return {
        type: "object",
        properties: {
          project: { type: "string", description: "Optional project name: only its jobs and the schedules they use." }
        },
        additionalProperties: false
      };
    }
    if (seq === "tools_scheduler_apply") {
      return {
        type: "object",
        properties: {
          action: { type: "string", enum: ["upsert", "delete"], default: "upsert", description: "upsert creates or replaces the scheduled run; delete removes it." },
          name: { type: "string", description: "Unique name shared by the job, the schedule and the scheduled job <name>@<name>." },
          project: { type: "string", description: "Project of the sequence (upsert)." },
          sequence: { type: "string", description: "Sequence name (upsert)." },
          cron: { type: "string", description: "Quartz CRON expression with seconds, e.g. 0 0 8 * * ? for 08:00 every day (upsert)." },
          enabled: { type: "boolean", default: true, description: "false keeps the run defined but inactive." },
          parameters: { type: "object", additionalProperties: true, description: "Sequence variables sent at each run, as a JSON object." },
          contextName: { type: "string", description: "Engine context name used by the runs; defaults to name." },
          writeOutput: { type: "boolean", default: false, description: "true writes each run output to the engine output folder." },
          description: { type: "string", description: "Optional description shown in the Administration Console." }
        },
        required: ["name"],
        additionalProperties: false
      };
    }

    if (seq === "tools_subagent_run") {
      return {
        type: "object",
        properties: {
          profile: { type: "string", enum: ["verifier", "constructor"], default: "verifier", description: "verifier: functional and visual browser proofs on the Studio viewer, read-only, vision model. constructor: builds a lot in the project through the Convertigo MCP (one at a time per project)." },
          task: { type: "string", description: "What the sub-agent must do, in plain language and complete: it starts with a fresh context and knows only this task, its inputs and its profile." },
          inputs: {
            type: "object",
            additionalProperties: true,
            description: "Inputs of the profile. verifier: url (viewerHomeUrl), paths (one plain-language path per user journey), checks (acceptance criteria with exact expected texts), hints (demo accounts, expected values). constructor: project (required, the one project it builds in), qnames (existing objects to use), files (workspace files to read), notes (rules and values that matter)."
          },
          reportFormat: { type: "string", description: "What the report must contain, for example: one line per check with the exact text seen." },
          model: { type: "string", description: "Gateway model for this run; default the profile model." },
          maxSteps: { type: "integer", description: "Model turns of the sub-agent; default and bounds per profile (verifier 40, 6 to 80; constructor 120, 10 to 400)." },
          timeBudgetSec: { type: "integer", description: "Time budget in seconds; default and bounds per profile (verifier 150, 30 to 540; constructor 900, 60 to 3600)." },
          maxCostUsd: { type: "number", description: "Cost budget in USD; default and bounds per profile (verifier 0.5; constructor 1.5)." },
          waitSec: { type: "integer", minimum: 5, maximum: 280, default: 50, description: "Seconds this call waits for the report; keep the default, it fits every agent host." },
          runId: { type: "string", description: "To collect a running sub-agent: the runId of a status running answer, alone." },
          cdpEndpoint: { type: "string", description: "Verifier, only when the agent host sends no viewer debug port: the loopback CDP endpoint of the Studio browser." }
        },
        additionalProperties: false
      };
    }

    if (seq === "tools_browser_verify") {
      return {
        type: "object",
        properties: {
          url: { type: "string", description: "Application URL to open first, usually viewerHomeUrl from mobile-builder-open. Empty: start from the page open in the viewer." },
          paths: {
            description: "Paths to walk and check, in plain language, in order (at most 8). For example: Log in as the demo RPCA (rpca.demo / demo), select two posts, declare them, check that both statuses become \"À jour\".",
            oneOf: [
              { type: "array", items: { oneOf: [{ type: "string" }, { type: "object", properties: { name: { type: "string" }, steps: { type: "string" } }, required: ["steps"] }] } },
              { type: "string" }
            ]
          },
          checks: {
            description: "Acceptance checks reported one by one (at most 20), for example: The list shows 3 posts with the status \"À déclarer\".",
            oneOf: [{ type: "array", items: { type: "string" } }, { type: "string" }]
          },
          hints: { type: "string", description: "Facts the sub-agent needs and cannot guess: demo accounts and passwords, expected values, what just changed." },
          model: { type: "string", default: "mistral/mistral-large-4", description: "Vision model of the Convertigo LLM gateway." },
          reasoning: { type: "string", enum: ["none", "high"], default: "none", description: "none is fast and cheap; high only for a hard case." },
          maxSteps: { type: "integer", minimum: 6, maximum: 80, default: 40 },
          timeBudgetSec: { type: "integer", minimum: 30, maximum: 540, default: 150, description: "The sub-agent reports what it has when it runs out." },
          cdpEndpoint: { type: "string", description: "Only when the agent host sends no viewer debug port: the loopback CDP endpoint of the Studio browser (browserDebugUrl of mobile-builder-open)." },
          waitSec: { type: "integer", minimum: 5, maximum: 280, default: 50, description: "Seconds this call waits for the report. A verification still running then answers status running with its verificationId; keep the default, it fits every agent host." },
          verificationId: { type: "string", description: "To collect a running verification: the verificationId of a status running answer, alone (no paths). The call waits up to waitSec again." }
        },
        additionalProperties: false
      };
    }

    if (seq === "tools_sql_transaction_create" || seq === "tools_facade_create" || seq === "tools_ngx_page_create") {
      return generatorInputSchema(seq);
    }

    if (seq === "tools_image_describe") {
      return {
        type: "object",
        properties: {
          path: { type: "string", description: "PNG, JPEG or WebP file of the Studio workspace, e.g. the file a Playwright screenshot was saved to. Absolute, or relative to the Studio user workspace then to the projects folder." },
          base64: { type: "string", description: "The image as base64 or a data:image/...;base64, URL, instead of path." },
          question: { type: "string", description: "What to check, e.g. Is the Save button visible and aligned with the form? Defaults to a general screenshot description." },
          model: { type: "string", default: "mistral/mistral-large-4", description: "Vision model of the Convertigo LLM gateway." },
          maxTokens: { type: "integer", minimum: 200, maximum: 8000, default: 2000, description: "Answer budget, reasoning included; keep the default." },
          reasoning: { type: "string", enum: ["none", "high"], default: "none", description: "none answers at once (about 2 s). high lets the model reason first: 20 to 30 s and about 1500 more tokens, for a hard image only." }
        },
        additionalProperties: false
      };
    }

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
    if (seq === "tools_marketplace_describe") {
      return {
        type: "object",
        properties: {
          project: { type: "string", description: "Marketplace entry name from marketplace-list, for example lib_csv_response." }
        },
        required: ["project"],
        additionalProperties: false
      };
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
    if (seq === "tools_nocode_form_get") {
      return {
        type: "object",
        properties: {
          id: { type: "string", description: "Existing form document id from the current No Code context." },
          rev: { type: "string", description: "Optional document revision. Omit to read the latest saved version." },
          token: nocodeFormsTokenProperty()
        },
        required: ["id"],
        additionalProperties: false
      };
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
    if (seq === "tools_project_security_audit") {
      return projectSecurityAuditInputSchema();
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

    if (seq === "tools_tags_get" || seq === "tools_tags_apply") {
      // The identities and metadata namespaces are dynamic map keys. Do not
      // infer their schema (or the engine error envelope) from XML element names.
      return openObjectSchema({
        revision: { type: "string" },
        tags: openObjectSchema({}),
        assignments: { type: "object", additionalProperties: stringArraySchema() },
        targets: stringArraySchema(),
        contributions: openObjectSchema({}),
        membershipOrder: { type: "string", enum: ["explicit"] },
        dirty: { type: "boolean" },
        readOnly: { type: "boolean" },
        done: { type: "boolean" },
        id: { type: "string" },
        error: openObjectSchema({})
      });
    }
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
    if (seq === "tools_browser_verify") {
      return browserVerifyOutputSchema();
    }
    if (seq === "tools_subagent_run") {
      return subagentRunOutputSchema();
    }
    if (seq === "tools_image_describe") {
      return imageDescribeOutputSchema();
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
    if (seq === "tools_project_security_audit") {
      return projectSecurityAuditOutputSchema();
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
