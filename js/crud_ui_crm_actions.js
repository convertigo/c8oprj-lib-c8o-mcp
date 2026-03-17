if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.crudUiCrmActions = C8O.crudUiCrmActions || {};

(function () {
  if (C8O.crudUiCrmActions._initialized === true) {
    return;
  }
  C8O.crudUiCrmActions._initialized = true;

  function buildCrmActionStacksTree(ctx, projectName, facadePrefix, stage) {
    var listCompaniesQName = ctx.trimmed(projectName) + "." + ctx.trimmed(facadePrefix) + "_list_companies";
    var listContactsQName = ctx.trimmed(projectName) + "." + ctx.trimmed(facadePrefix) + "_list_contacts";
    var listCompanyContactsQName = ctx.trimmed(projectName) + "." + ctx.trimmed(facadePrefix) + "_list_company_contacts";
    var refreshCompaniesQName = ctx.crmActionQName(projectName, "crm_refresh_companies");
    var refreshContactsQName = ctx.crmActionQName(projectName, "crm_refresh_contacts");
    var refreshCompanyContactsQName = ctx.crmActionQName(projectName, "crm_refresh_company_contacts");
    var selectCompanyQName = ctx.crmActionQName(projectName, "crm_select_company");
    var bootstrapQName = ctx.crmActionQName(projectName, "crm_bootstrap_dashboard");
    return {
      qnames: [
        refreshCompaniesQName,
        refreshContactsQName,
        refreshCompanyContactsQName,
        selectCompanyQName,
        bootstrapQName,
        ctx.crmActionQName(projectName, "crm_retry_dashboard")
      ],
      tree: {
        children: [
          ctx.actionStackNode(
            "crm_refresh_companies",
            [],
            [
              ctx.callSequenceActionNode("CallCompanies", listCompaniesQName, [], { noLoading: true, cacheTtl: 3000 }),
              ctx.setGlobalActionNode("SetCompanies", "crmCompanies", "parent.out?.sql_output ?? []"),
              ctx.setGlobalActionNode("SetCompanyCount", "crmCounts", "Object.assign({}, this.global?.crmCounts || {}, { companies: Number(parent.out?.sql_output?.length ?? 0) })"),
              ctx.setGlobalActionNode("SetCompanyStatus", "crmStatus", "parent.out?.status ?? 'ok'"),
              ctx.setGlobalActionNode("SetCompanyError", "crmError", "(parent.out?.status && parent.out?.status !== 'ok') ? (parent.out?.error ?? 'Unable to load companies') : ''"),
              ctx.setGlobalActionNode("SetSelectedCompany", "crmSelectedCompany", "(this.global?.crmSelectedCompany && (parent.out?.sql_output || []).some((item) => String(item?.ID ?? item?.id) === String(this.global?.crmSelectedCompany?.ID ?? this.global?.crmSelectedCompany?.id))) ? this.global?.crmSelectedCompany : ((parent.out?.sql_output || [])[0] ?? null)")
            ],
            "CRM companies refresh action."
          ),
          ctx.actionStackNode(
            "crm_refresh_contacts",
            [],
            [
              ctx.callSequenceActionNode("CallContacts", listContactsQName, [], { noLoading: true, cacheTtl: 3000 }),
              ctx.setGlobalActionNode("SetContacts", "crmContacts", "parent.out?.sql_output ?? []"),
              ctx.setGlobalActionNode("SetContactCount", "crmCounts", "Object.assign({}, this.global?.crmCounts || {}, { contacts: Number(parent.out?.sql_output?.length ?? 0) })"),
              ctx.setGlobalActionNode("SetContactsStatus", "crmStatus", "(this.global?.crmError ? 'error' : (parent.out?.status ?? 'ok'))"),
              ctx.setGlobalActionNode("SetContactsError", "crmError", "(parent.out?.status && parent.out?.status !== 'ok') ? (parent.out?.error ?? 'Unable to load contacts') : (this.global?.crmError || '')")
            ],
            "CRM contacts refresh action."
          ),
          ctx.actionStackNode(
            "crm_refresh_company_contacts",
            [ctx.stackVariableNode("company_id", "0")],
            [
              ctx.callSequenceActionNode("CallCompanyContacts", listCompanyContactsQName, [
                ctx.controlVariableNode("company_id", "Number(vars.company_id ?? this.global?.crmSelectedCompany?.ID ?? this.global?.crmSelectedCompany?.id ?? 0)")
              ], { noLoading: true, cacheTtl: 3000 }),
              ctx.setGlobalActionNode("SetCompanyContacts", "crmCompanyContacts", "parent.out?.sql_output ?? []"),
              ctx.setGlobalActionNode("SetCompanyContactsStatus", "crmStatus", "(this.global?.crmError ? 'error' : (parent.out?.status ?? 'ok'))"),
              ctx.setGlobalActionNode("SetCompanyContactsError", "crmError", "(parent.out?.status && parent.out?.status !== 'ok') ? (parent.out?.error ?? 'Unable to load company contacts') : (this.global?.crmError || '')")
            ],
            "CRM selected-company contacts refresh action."
          ),
          ctx.actionStackNode(
            "crm_select_company",
            [ctx.stackVariableNode("company_id", "0")],
            [
              ctx.setGlobalActionNode("SetSelectedCompany", "crmSelectedCompany", "(this.global?.crmCompanies || []).find((item) => String(item?.ID ?? item?.id) === String(vars.company_id ?? '')) || null"),
              ctx.dynamicInvokeNode("InvokeRefreshCompanyContacts", refreshCompanyContactsQName, [
                ctx.controlVariableNode("company_id", "Number(vars.company_id ?? this.global?.crmSelectedCompany?.ID ?? this.global?.crmSelectedCompany?.id ?? 0)")
              ])
            ],
            "CRM company selection action."
          ),
          ctx.actionStackNode(
            "crm_bootstrap_dashboard",
            [],
            [
              ctx.setGlobalActionNode("SetBuildStage", "crmBuildStage", ctx.scriptLiteral(ctx.trimmed(stage || "bootstrap"))),
              ctx.setGlobalActionNode("SetLoading", "crmLoading", "true"),
              ctx.setGlobalActionNode("ResetError", "crmError", "''"),
              ctx.setGlobalActionNode("SetBootstrapStatus", "crmStatus", "'loading'"),
              ctx.dynamicInvokeNode("InvokeRefreshCompanies", refreshCompaniesQName, []),
              ctx.dynamicInvokeNode("InvokeRefreshContacts", refreshContactsQName, []),
              ctx.dynamicInvokeNode("InvokeRefreshCompanyContacts", refreshCompanyContactsQName, [
                ctx.controlVariableNode("company_id", "Number(this.global?.crmSelectedCompany?.ID ?? this.global?.crmSelectedCompany?.id ?? 0)")
              ]),
              ctx.setGlobalActionNode("ClearLoading", "crmLoading", "false"),
              ctx.setGlobalActionNode("FinalizeStatus", "crmStatus", "this.global?.crmError ? 'error' : 'ok'")
            ],
            "CRM dashboard bootstrap action."
          ),
          ctx.actionStackNode(
            "crm_retry_dashboard",
            [],
            [
              ctx.dynamicInvokeNode("InvokeBootstrapDashboard", bootstrapQName, [])
            ],
            "CRM retry action."
          )
        ]
      }
    };
  }

  C8O.crudUiCrmActions.buildCrmActionStacksTree = buildCrmActionStacksTree;
})();
