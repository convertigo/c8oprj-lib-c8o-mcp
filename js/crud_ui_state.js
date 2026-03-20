if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.crudUiState = C8O.crudUiState || {};

(function () {
  if (C8O.crudUiState._initialized === true) {
    return;
  }
  C8O.crudUiState._initialized = true;

  function trimmed(ctx, value) {
    return ctx.trimmed(value);
  }

  function dashboardUiGlobals() {
    return [
      "crudBuildStage",
      "crudLoading",
      "crudError",
      "crudStatus",
      "crudRows",
      "crudCounts",
      "crudSamples"
    ];
  }

  function entityPagesUiGlobals() {
    return [
      "crudBuildStage",
      "crudLoading",
      "crudError",
      "crudStatus",
      "crudRows",
      "crudCounts",
      "crudSamples",
      "crudSelected",
      "crudDrafts",
      "crudModes",
      "crudEntityStatus",
      "crudEntityErrors"
    ];
  }

  function crmUiGlobals() {
    return [
      "crmBuildStage",
      "crmLoading",
      "crmError",
      "crmStatus",
      "crmCompanies",
      "crmContacts",
      "crmCounts",
      "crmSelectedCompany",
      "crmCompanyContacts"
    ];
  }

  function statefulUiGlobals(_ctx, variant) {
    var normalizedVariant = trimmed(_ctx, variant).toLowerCase();
    if (normalizedVariant === "master-detail") {
      return crmUiGlobals();
    }
    if (normalizedVariant === "entity-pages") {
      return entityPagesUiGlobals();
    }
    return dashboardUiGlobals();
  }

  function everyQNameExists(ctx, qnames) {
    var entries = ctx.ensureArray(qnames);
    if (!entries.length) {
      return false;
    }
    for (var i = 0; i < entries.length; i++) {
      var qname = trimmed(ctx, entries[i]);
      if (!qname.length || !ctx.resolveQName(qname)) {
        return false;
      }
    }
    return true;
  }

  function statefulBootstrapStageQName(ctx, projectName, variant) {
    var normalizedVariant = trimmed(ctx, variant).toLowerCase();
    return (normalizedVariant === "master-detail"
      ? ctx.crmActionQName(projectName, "crm_bootstrap_dashboard")
      : ctx.dashboardActionQName(projectName, "crud_bootstrap_dashboard")) + ".SetBuildStage";
  }

  function statefulBootstrapRowQName(ctx, projectName, entryPage, variant) {
    var normalizedVariant = trimmed(ctx, variant).toLowerCase();
    var pageRoot = ctx.pageQName(projectName, entryPage) + ".Content.";
    return normalizedVariant === "master-detail"
      ? pageRoot + "CrmMasterDetailGrid.BootstrapRow"
      : pageRoot + "CrudDashboardGrid.BootstrapRow";
  }

  function workInProgressVisibilityExpression(ctx, globalStageExpression) {
    var source = trimmed(ctx, globalStageExpression || "''");
    if (!source.length) {
      source = "''";
    }
    return "((" + source + ") ?? 'bootstrap') !== 'final'";
  }

  function buildStatefulBootstrapRow(ctx, projectName, globalStageExpression) {
    return {
      className: "ngx.components.UIDynamicElement#GridRow",
      name: "BootstrapRow",
      children: [
        {
          className: "ngx.components.UIDynamicElement#GridCol",
          name: "BootstrapCol",
          children: [
            ctx.ifDirectiveNode(
              "BootstrapVisible",
              workInProgressVisibilityExpression(ctx, globalStageExpression),
              [ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, "WorkInProgressCard"), "UseWorkInProgressCard", [])]
            )
          ]
        }
      ]
    };
  }

  function crudGlobalExpression(_ctx) {
    return "(($any(this).pageOwner || $any(this).owner || this).global || {})";
  }

  function dashboardRowsExpression(ctx, entityKeyExpression) {
    var keyExpr = trimmed(ctx, entityKeyExpression || "''") || "''";
    var globalExpr = crudGlobalExpression(ctx);
    return "((((" + globalExpr + ").crudRows || {})[" + keyExpr + "]) || [])";
  }

  function dashboardCountExpression(ctx, entityKeyExpression) {
    var keyExpr = trimmed(ctx, entityKeyExpression || "''") || "''";
    var globalExpr = crudGlobalExpression(ctx);
    var rowsExpr = dashboardRowsExpression(ctx, keyExpr);
    return "(((" + globalExpr + ").crudCounts || {})[" + keyExpr + "] ?? ((" + rowsExpr + ").length ?? 0))";
  }

  function dashboardSampleExpression(ctx, entityKeyExpression) {
    var keyExpr = trimmed(ctx, entityKeyExpression || "''") || "''";
    var globalExpr = crudGlobalExpression(ctx);
    return "((((" + globalExpr + ").crudSamples || {})[" + keyExpr + "]) || null)";
  }

  function crudSelectedExpression(ctx, entityKeyExpression) {
    var keyExpr = trimmed(ctx, entityKeyExpression || "''") || "''";
    var globalExpr = crudGlobalExpression(ctx);
    return "((((" + globalExpr + ").crudSelected || {})[" + keyExpr + "]) || null)";
  }

  function crudDraftExpression(ctx, entityKeyExpression) {
    var keyExpr = trimmed(ctx, entityKeyExpression || "''") || "''";
    var globalExpr = crudGlobalExpression(ctx);
    return "((((" + globalExpr + ").crudDrafts || {})[" + keyExpr + "]) || {})";
  }

  function crudModeExpression(ctx, entityKeyExpression) {
    var keyExpr = trimmed(ctx, entityKeyExpression || "''") || "''";
    var globalExpr = crudGlobalExpression(ctx);
    return "((((" + globalExpr + ").crudModes || {})[" + keyExpr + "]) || 'update')";
  }

  function crudEntityStatusExpression(ctx, entityKeyExpression) {
    var keyExpr = trimmed(ctx, entityKeyExpression || "''") || "''";
    var globalExpr = crudGlobalExpression(ctx);
    return "((((" + globalExpr + ").crudEntityStatus || {})[" + keyExpr + "]) || 'idle')";
  }

  function crudEntityErrorExpression(ctx, entityKeyExpression) {
    var keyExpr = trimmed(ctx, entityKeyExpression || "''") || "''";
    var globalExpr = crudGlobalExpression(ctx);
    return "((((" + globalExpr + ").crudEntityErrors || {})[" + keyExpr + "]) || '')";
  }

  function dynamicFieldAccessExpression(ctx, targetExpression, fieldExpression, fallbackExpression) {
    var targetExpr = trimmed(ctx, targetExpression || "null") || "null";
    var fieldExpr = trimmed(ctx, fieldExpression || "''") || "''";
    var fallbackExpr = fallbackExpression == null ? "''" : String(fallbackExpression);
    var literalField = null;
    if ((fieldExpr.charAt(0) === "'" && fieldExpr.charAt(fieldExpr.length - 1) === "'") ||
      (fieldExpr.charAt(0) === "\"" && fieldExpr.charAt(fieldExpr.length - 1) === "\"")) {
      literalField = fieldExpr.substring(1, fieldExpr.length - 1);
      if (fieldExpr.charAt(0) === "'") {
        literalField = literalField.replace(/\\'/g, "'");
      } else {
        literalField = literalField.replace(/\\"/g, "\"");
      }
    }
    if (literalField != null) {
      return "(" + targetExpr + "?.[" + fieldExpr + "] ?? " +
        targetExpr + "?.[" + ctx.scriptLiteral(literalField.toUpperCase()) + "] ?? " +
        targetExpr + "?.[" + ctx.scriptLiteral(literalField.toLowerCase()) + "] ?? " +
        fallbackExpr + ")";
    }
    return "(" + targetExpr + "?.[" + fieldExpr + "] ?? " +
      targetExpr + "?.[(('' + (" + fieldExpr + " || '')).toUpperCase())] ?? " +
      targetExpr + "?.[(('' + (" + fieldExpr + " || '')).toLowerCase())] ?? " +
      fallbackExpr + ")";
  }

  C8O.crudUiState.dashboardUiGlobals = dashboardUiGlobals;
  C8O.crudUiState.entityPagesUiGlobals = entityPagesUiGlobals;
  C8O.crudUiState.crmUiGlobals = crmUiGlobals;
  C8O.crudUiState.statefulUiGlobals = statefulUiGlobals;
  C8O.crudUiState.everyQNameExists = everyQNameExists;
  C8O.crudUiState.statefulBootstrapStageQName = statefulBootstrapStageQName;
  C8O.crudUiState.statefulBootstrapRowQName = statefulBootstrapRowQName;
  C8O.crudUiState.workInProgressVisibilityExpression = workInProgressVisibilityExpression;
  C8O.crudUiState.buildStatefulBootstrapRow = buildStatefulBootstrapRow;
  C8O.crudUiState.crudGlobalExpression = crudGlobalExpression;
  C8O.crudUiState.dashboardRowsExpression = dashboardRowsExpression;
  C8O.crudUiState.dashboardCountExpression = dashboardCountExpression;
  C8O.crudUiState.dashboardSampleExpression = dashboardSampleExpression;
  C8O.crudUiState.crudSelectedExpression = crudSelectedExpression;
  C8O.crudUiState.crudDraftExpression = crudDraftExpression;
  C8O.crudUiState.crudModeExpression = crudModeExpression;
  C8O.crudUiState.crudEntityStatusExpression = crudEntityStatusExpression;
  C8O.crudUiState.crudEntityErrorExpression = crudEntityErrorExpression;
  C8O.crudUiState.dynamicFieldAccessExpression = dynamicFieldAccessExpression;
})();
