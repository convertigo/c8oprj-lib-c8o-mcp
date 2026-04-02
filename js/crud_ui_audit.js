if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.crudUiAudit = C8O.crudUiAudit || {};

(function () {
  if (C8O.crudUiAudit._initialized === true) {
    return;
  }
  C8O.crudUiAudit._initialized = true;

  function ensureArray(value) {
    if (!value) {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  }

  function auditUiTreePayload(uiTree) {
    var serialized = JSON.stringify(uiTree || {});
    return {
      starterDominant: serialized.indexOf("WelcomeCard") !== -1,
      visibleShellPresent: /FeatureShell|CrudDashboardGrid|CrudEntityPageGrid|CrmMasterDetailGrid|UseCrudPageHeader|UseTplCrudPageHeader|CrudPageHeader|DashboardStatCard|MetricsRow|RouteRow|UseWorkInProgressCard|UseCrudLoadingState|UseTplCrudLoadingState|UseCrudErrorRetryState|UseTplCrudErrorRetryState|UseContactCard|UseContactTable|UseCompanyCard|UseCompanyTable|ListPanel|DetailCard|EditForm/.test(serialized),
      liveBindingPresent: /UIDynamicAction|UIDynamicInvoke|UIActionStack|UIControlDirective|UIControlVariable|UIUseShared|UIUseVariable|UIControlEvent/.test(serialized)
    };
  }

  function collectSharedRefs(node, refs) {
    refs = refs || [];
    if (!node || typeof node !== "object") {
      return refs;
    }
    if (node.properties && node.properties.sharedcomponent) {
      refs.push(String(node.properties.sharedcomponent));
    }
    var children = ensureArray(node.children);
    for (var i = 0; i < children.length; i++) {
      collectSharedRefs(children[i], refs);
    }
    return refs;
  }

  C8O.crudUiAudit.auditUiTreePayload = auditUiTreePayload;
  C8O.crudUiAudit.collectSharedRefs = collectSharedRefs;
})();
