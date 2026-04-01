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
          description: "Structured CRUD specification including project, database, facade, entities, optional relations, seed, and UI options. Use the exact requested project name when it is valid; do not append prefixes or dates. If no seed profile is supplied, the default is realistic demo data. Entity entries may also define singular, plural, routeSegment, and displayLabel overrides when English inflection is not correct. Declare obvious many-to-one relations through spec.relations[] when possible; field.references remains supported for compatibility. Entity UI entries may optionally define ui.listFields, ui.detailFields, ui.formFields, ui.fieldLabels, ui.actionLabel, and ui.relationFields so the generic entity-pages CRUD UI shows better visible fields and relation controls without patching managed shared components. For the CRM fast path, prefer a contacts/companies spec with a Contact.CompanyId relation and ui.variant=master-detail.",
          additionalProperties: true
        },
        sequence: h().booleanFlagSchema(true, "Set true to create or update CRUD facade sequences in addition to SQL transactions. Generated CRUD facades are hidden requestables that require an authenticated context; auth_login/auth_logout skeleton sequences are also created."),
        ui: h().booleanFlagSchema(false, "Set true to also assemble the deterministic NGX CRUD kit on the visible entry page. For CRM fast-path UI, run upsert-ngx-crud-kit explicitly with stage=bootstrap then stage=final.")
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
        facadePrefix: { type: "string", description: "Optional CRUD facade sequence prefix. Defaults to crud." },
        entryPage: { type: "string", description: "Visible entry page name. Defaults to Home." },
        mode: {
          type: "string",
          enum: ["hsqldb", "postgresql", "mariadb", "mysql", "sqlserver", "oracle"],
          description: "Optional driver family hint used when no connector is provided yet."
        },
        variant: { type: "string", description: "Optional UI variant hint used when checking visible CRUD shell coverage." },
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
        facadePrefix: { type: "string", description: "Optional CRUD facade sequence prefix. Defaults to crud." },
        entryPage: { type: "string", description: "Visible entry page name. Defaults to Home." },
        mode: {
          type: "string",
          enum: ["hsqldb", "postgresql", "mariadb", "mysql", "sqlserver", "oracle"],
          description: "Optional driver family hint used when no connector is provided yet."
        },
        variant: { type: "string", description: "Optional UI variant hint used when checking visible CRUD shell coverage." },
        profile: { type: "string", description: "Optional CRUD profile hint, for example crm." },
        expectUiShell: h().booleanFlagSchema(false, "Set true to require visible shell evidence and starter replacement on the entry page."),
        viewerUrl: { type: "string", description: "Optional viewer URL returned by mobile-builder-open. In dev this should be the live viewer root or home URL, not a DisplayObjects/mobile production path. When provided with expectUiShell=true, crud-proof also probes the served mobile viewer bundle." },
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

  function upsertNgxCrudKitInputSchema() {
    return {
      type: "object",
      properties: {
        project: { type: "string", description: "Existing NGX project technical name." },
        entities: {
          description: "Entity list as an object/array or JSON string. Used to label deterministic CRUD cards and sections. Entity entries may optionally define ui.listFields, ui.detailFields, ui.formFields, ui.fieldLabels, ui.actionLabel, and ui.relationFields so the generic entity-pages UI shows better visible fields and relation controls without direct edits on managed CRUD-kit components.",
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "object", additionalProperties: true } },
            { type: "object", additionalProperties: true }
          ]
        },
        variant: { type: "string", description: "UI variant, for example entity-pages, dashboard, list-form, or master-detail. entity-pages is the recommended generic CRUD UI; dashboard is the legacy single-page fallback; the CRM rail uses master-detail." },
        stage: {
          type: "string",
          enum: ["bootstrap", "final"],
          description: "UI assembly stage. bootstrap shows a visible work-in-progress shell early so the mobile builder can open against a real shell; final removes the bootstrap marker after proof."
        },
        facadePrefix: { type: "string", description: "CRUD facade prefix used for shell labels and future wiring." },
        entryPage: { type: "string", description: "Visible entry page name. Defaults to Home." },
        runtimeEvidence: {
          description: "Optional runtime evidence object or JSON string used to surface live counts in the shell.",
          oneOf: [
            { type: "string" },
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
      ui: h().openObjectSchema({
        starterDominant: { oneOf: [{ type: "boolean" }, { type: "null" }] },
        visibleShellPresent: { type: "boolean" },
        liveBindingPresent: { type: "boolean" },
        statefulActionsPresent: { type: "boolean" },
        pageBootstrapPresent: { type: "boolean" },
        targetQName: { type: "string" },
        authBootstrapPresent: { type: "boolean" },
        viewerProbe: h().openObjectSchema({
          attempted: { type: "boolean" },
          ok: { type: "boolean" },
          url: { type: "string" },
          finalUrl: { type: "string" },
          statusCode: { type: "number" },
          htmlOk: { type: "boolean" },
          bundleCount: { type: "number" },
          scriptUrls: h().stringArraySchema(),
          markersFound: h().stringArraySchema(),
          missingMarkers: h().stringArraySchema(),
          message: { type: "string" }
        })
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
      project: { type: "string" },
      driverFamily: { type: "string" },
      connectorQname: { type: "string" },
      entryPage: { type: "string" },
      expectUiShell: { type: "boolean" },
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
      ui: h().openObjectSchema({
        starterDominant: { oneOf: [{ type: "boolean" }, { type: "null" }] },
        visibleShellPresent: { type: "boolean" },
        liveBindingPresent: { type: "boolean" },
        statefulActionsPresent: { type: "boolean" },
        pageBootstrapPresent: { type: "boolean" },
        workInProgressVisible: { oneOf: [{ type: "boolean" }, { type: "null" }] },
        targetQName: { type: "string" },
        authBootstrapPresent: { type: "boolean" },
        builderProbe: h().openObjectSchema({
          status: { type: "string" },
          message: { type: "string" },
          viewerUrl: { type: "string" },
          viewerBaseUrl: { type: "string" },
          viewerHomeUrl: { type: "string" },
          browser: h().openObjectSchema({
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
            items: h().mobileBuilderCompileErrorSchema()
          }
        }),
        viewerProbe: h().openObjectSchema({
          attempted: { type: "boolean" },
          ok: { type: "boolean" },
          url: { type: "string" },
          finalUrl: { type: "string" },
          statusCode: { type: "number" },
          htmlOk: { type: "boolean" },
          bundleCount: { type: "number" },
          scriptUrls: h().stringArraySchema(),
          markersFound: h().stringArraySchema(),
          missingMarkers: h().stringArraySchema(),
          message: { type: "string" }
        })
      }),
      requestables: {
        type: "array",
        items: requestableProofOutputSchema()
      },
      checks: {
        type: "array",
        items: crudProofCheckSchema()
      },
      missing: h().stringArraySchema(),
      warnings: h().stringArraySchema()
    });
  }

  function upsertNgxCrudKitOutputSchema() {
    return h().closedObjectSchema({
      status: { type: "string" },
      project: { type: "string" },
      sharedComponents: h().stringArraySchema(),
      pageTargets: h().stringArraySchema(),
      runtimeEvidence: h().openObjectSchema({}),
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
      uiEnabled: { type: "boolean" },
      primaryTargets: h().openObjectSchema({
        sql: { type: "string" },
        flow: h().stringArraySchema(),
        ui: h().stringArraySchema()
      }),
      created: h().stringArraySchema(),
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
    if (seq === "tools_upsert_ngx_crud_kit") {
      return upsertNgxCrudKitInputSchema();
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
    if (seq === "tools_upsert_ngx_crud_kit") {
      return upsertNgxCrudKitOutputSchema();
    }
    return null;
  };
})();
