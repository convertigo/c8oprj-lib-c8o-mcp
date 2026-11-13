if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.schemaOverrides = C8O.schemaOverrides || {};
C8O.schemaOverridesCrud = C8O.schemaOverridesCrud || {};

(function () {
  function h() {
    return C8O.schemaOverrides._helpers || {};
  }

  function upsertCrudInputSchema() {
    return {
      type: "object",
      properties: {
        spec: {
          type: "object",
          description: "Structured CRUD specification including project, database, business sequence settings (spec key facade), entities, optional relations and seed (the pages are built with ngx-page-create). Required fields (fields[].required) are checked by the create and update business sequences, with messages in spec.ui.language (\"fr\" for French), and an app's own steps placed before the call of a business sequence are kept. On a database whose tables hold rows, the rows are kept and a field added to an entity becomes a new column, filled with its `default` (fields[].default); seed.reset:true resets the tables to the demo rows. A run keeps as it is a transaction or business sequence changed since the previous run (by hand or by another tool) and says so; spec.overwrite names the ones to write again. Run it again to change the spec (an entity, a field, a relation), not to repair an object or to clean test rows. Use the exact requested project name when it is valid; do not append prefixes or dates. If no seed profile is supplied, the default is realistic demo data. Entity entries may also define singular, plural, and displayLabel overrides when English inflection is not correct. Declare obvious many-to-one relations through spec.relations[] when possible; field.references remains supported for compatibility. An entity may set ui.relationFields.<field>.optionLabelField: the field of the related entity its relation list returns as the label (by default its name field; a related person is named by first and last name). `seed.data` may provide explicit demo rows keyed by entity name; when omitted, the tool falls back to synthetic rows from seed.profile/seed.rowsPerEntity. For a CRM, prefer a contacts/companies spec with a Contact.CompanyId relation.",
          properties: {
            database: {
              type: "object",
              description: "The SQL database, for example {\"mode\": \"hsqldb\", \"connector\": \"appdb\"}. host, port, database, user and password set the connection of a server engine.",
              properties: {
                mode: { type: "string", description: "The engine: hsqldb (embedded, no server), postgresql, mariadb, mysql, sqlserver or oracle. Leave it out when connector names an existing SQL connector: its engine and connection are kept." },
                connector: { type: "string", description: "The SQL connector to create or update. Defaults to <project>db." }
              },
              additionalProperties: true
            },
            overwrite: {
              description: "Objects changed since the last upsert-crud run (by hand or by another tool) that this run writes again from the spec, by name or QName (true: all). Without it, a run keeps such an object as it is, does not create again an auth_login or auth_logout deleted since, and names them in the warnings.",
              anyOf: [{ type: "array", items: { type: "string" } }, { type: "boolean" }]
            }
          },
          additionalProperties: true
        },
        sequence: h().booleanFlagSchema(true, "Set true to create or update CRUD business sequences in addition to SQL transactions. Generated CRUD business sequences are hidden requestables that require an authenticated context; auth_login/auth_logout skeleton sequences are also created.")
      },
      required: ["spec"],
      additionalProperties: false
    };
  }

  function crudStatusInputSchema() {
    return {
      type: "object",
      properties: {
        project: { type: "string", description: "Existing project technical name." },
        connector: { type: "string", description: "Optional SQL connector name. Defaults to the normalized CRUD connector if omitted." },
        facadePrefix: { type: "string", description: "Optional CRUD business sequence prefix. Defaults to crud." },
        mode: {
          type: "string",
          enum: ["hsqldb", "postgresql", "mariadb", "mysql", "sqlserver", "oracle"],
          description: "Optional driver family hint used when no connector is provided yet."
        },
        profile: { type: "string", description: "Optional CRUD profile hint, for example crm." }
      },
      required: ["project"],
      additionalProperties: false
    };
  }

  function crudProofInputSchema() {
    return {
      type: "object",
      properties: {
        project: { type: "string", description: "Existing project technical name." },
        connector: { type: "string", description: "Optional SQL connector name. Defaults to the normalized CRUD connector if omitted." },
        facadePrefix: { type: "string", description: "Optional CRUD business sequence prefix. Defaults to crud." },
        mode: {
          type: "string",
          enum: ["hsqldb", "postgresql", "mariadb", "mysql", "sqlserver", "oracle"],
          description: "Optional driver family hint used when no connector is provided yet."
        },
        profile: { type: "string", description: "Optional CRUD profile hint, for example crm." },
        proofRequestables: {
          description: "Requestables to execute as proof. Accepts a JSON array string, an array of strings, or a comma-separated string.",
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } },
            { type: "object", additionalProperties: true }
          ]
        }
      },
      required: ["project"],
      additionalProperties: false
    };
  }

  function crudStatusOutputSchema() {
    return h().closedObjectSchema({
      status: { type: "string" },
      message: { type: "string", description: "Set with status not_crud: why the CRUD rail does not apply and which tools to use." },
      project: { type: "string" },
      driverFamily: { type: "string" },
      connectorQname: { type: "string" },
      transactions: h().openObjectSchema({
        present: h().stringArraySchema(),
        missing: h().stringArraySchema()
      }),
      sequences: h().openObjectSchema({
        present: h().stringArraySchema(),
        missing: h().stringArraySchema()
      }),
      relations: h().openObjectSchema({
        present: h().stringArraySchema(),
        missing: h().stringArraySchema(),
        proofs: {
          type: "array",
          items: h().openObjectSchema({})
        }
      }),
      auth: h().openObjectSchema({
        loginRequestable: { type: "string" },
        logoutRequestable: { type: "string" },
        loginPresent: { type: "boolean" },
        logoutPresent: { type: "boolean" },
        loginHidden: { type: "boolean" },
        loginAuthenticatedContextRequired: { type: "boolean" },
        logoutHidden: { type: "boolean" },
        logoutAuthenticatedContextRequired: { type: "boolean" },
        facadeHiddenAuthenticatedPresent: h().stringArraySchema(),
        insecureFacadeSequences: h().stringArraySchema()
      }),
      missing: h().stringArraySchema(),
      warnings: h().stringArraySchema()
    });
  }

  function crudProofCheckSchema() {
    return h().closedObjectSchema({
      id: { type: "string" },
      status: { type: "string" },
      ok: { type: "boolean" },
      message: { type: "string" },
      target: { type: "string" }
    });
  }

  function requestableProofOutputSchema() {
    return h().closedObjectSchema({
      requestable: { type: "string" },
      status: { type: "string" },
      ok: { type: "boolean" },
      total: { oneOf: [{ type: "number" }, { type: "string" }] },
      itemCount: { type: "number" },
      source: { type: "string" },
      message: { type: "string" }
    });
  }

  function crudProofOutputSchema() {
    return h().closedObjectSchema({
      status: { type: "string" },
      message: { type: "string", description: "Set with status not_crud: why the CRUD rail does not apply and which tools to use." },
      project: { type: "string" },
      driverFamily: { type: "string" },
      connectorQname: { type: "string" },
      transactions: h().openObjectSchema({
        present: h().stringArraySchema(),
        missing: h().stringArraySchema()
      }),
      sequences: h().openObjectSchema({
        present: h().stringArraySchema(),
        missing: h().stringArraySchema()
      }),
      relations: h().openObjectSchema({
        present: h().stringArraySchema(),
        missing: h().stringArraySchema(),
        proofs: {
          type: "array",
          items: h().openObjectSchema({})
        }
      }),
      auth: h().openObjectSchema({
        loginRequestable: { type: "string" },
        logoutRequestable: { type: "string" },
        loginPresent: { type: "boolean" },
        logoutPresent: { type: "boolean" },
        loginHidden: { type: "boolean" },
        loginAuthenticatedContextRequired: { type: "boolean" },
        logoutHidden: { type: "boolean" },
        logoutAuthenticatedContextRequired: { type: "boolean" },
        facadeHiddenAuthenticatedPresent: h().stringArraySchema(),
        insecureFacadeSequences: h().stringArraySchema()
      }),
      requestables: {
        type: "array",
        items: requestableProofOutputSchema()
      },
      checks: {
        type: "array",
        items: crudProofCheckSchema()
      },
      crm: h().openObjectSchema({
        enabled: { type: "boolean" },
        relationRequestable: { type: "string" }
      }),
      missing: h().stringArraySchema(),
      warnings: h().stringArraySchema()
    });
  }

  function upsertCrudOutputSchema() {
    return h().closedObjectSchema({
      status: { type: "string" },
      project: { type: "string" },
      driverFamily: { type: "string" },
      connectorQname: { type: "string" },
      sequence: { type: "boolean" },
      primaryTargets: h().openObjectSchema({
        sql: { type: "string" },
        flow: h().stringArraySchema()
      }),
      createdCount: { type: "number" },
      updatedCount: { type: "number" },
      deletedCount: { type: "number" },
      created: h().stringArraySchema(),
      deleted: h().stringArraySchema(),
      updated: h().stringArraySchema(),
      runtimeEvidence: h().openObjectSchema({}),
      warnings: h().stringArraySchema()
    });
  }

  C8O.schemaOverridesCrud.applyInput = function (sequenceName) {
    var seq = String(sequenceName || "");
    if (seq === "tools_upsert_crud") {
      return upsertCrudInputSchema();
    }
    if (seq === "tools_crud_status") {
      return crudStatusInputSchema();
    }
    if (seq === "tools_crud_proof") {
      return crudProofInputSchema();
    }
    return null;
  };

  C8O.schemaOverridesCrud.applyOutput = function (sequenceName) {
    var seq = String(sequenceName || "");
    if (seq === "tools_upsert_crud") {
      return upsertCrudOutputSchema();
    }
    if (seq === "tools_crud_status") {
      return crudStatusOutputSchema();
    }
    if (seq === "tools_crud_proof") {
      return crudProofOutputSchema();
    }
    return null;
  };
})();
