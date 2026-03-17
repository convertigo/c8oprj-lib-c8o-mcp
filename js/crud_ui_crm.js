if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.crudUiCrm = C8O.crudUiCrm || {};

(function () {
  if (C8O.crudUiCrm._initialized === true) {
    return;
  }
  C8O.crudUiCrm._initialized = true;

  function crmHeaderComponentTree(ctx, componentName, projectName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "CRM live-state header."
      },
      children: [
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "HeaderCard",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "HeaderCardHeader",
              children: [
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  "HeaderTitle",
                  ctx.plainTextNode("HeaderTitleText", ctx.ucfirst(projectName) + " CRM")
                ),
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardSubTitle",
                  "HeaderSubtitle",
                  ctx.scriptTextNode("HeaderSubtitleText", "(this.global?.crmStatus === 'ok') ? 'Companies, contacts, and relations are live.' : (this.global?.crmLoading ? 'Loading CRM facade...' : (this.global?.crmError || 'Preparing CRM facade state.'))")
                )
              ]
            }
          ]
        }
      ]
    };
  }

  function crmWorkInProgressCardTree(ctx, componentName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Temporary CRM bootstrap card."
      },
      children: [
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "WorkInProgressCard",
          properties: {
            IonColor: {
              mode: "PLAIN",
              value: "warning"
            }
          },
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "WorkInProgressHeader",
              children: [
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  "WorkInProgressTitle",
                  ctx.plainTextNode("WorkInProgressTitleText", "Work in progress")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "WorkInProgressContent",
              children: [
                ctx.scriptTextNode("WorkInProgressText", "'Bootstrap stage visible. Current build stage: ' + (this.global?.crmBuildStage ?? 'bootstrap')"),
                ctx.plainTextNode("WorkInProgressHint", "The shell is already alive while live CRM actions finish wiring data.")
              ]
            }
          ]
        }
      ]
    };
  }

  function crmLoadingStateTree(ctx, componentName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "CRM loading state bound to global state."
      },
      children: [
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "LoadingCard",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "LoadingContent",
              children: [
                ctx.scriptTextNode("LoadingText", "this.global?.crmLoading ? 'Loading companies, contacts, and company contacts...' : 'Loading idle.'")
              ]
            }
          ]
        }
      ]
    };
  }

  function crmErrorRetryStateTree(ctx, componentName, projectName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "CRM error state with retry action."
      },
      children: [
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "ErrorCard",
          properties: {
            IonColor: {
              mode: "PLAIN",
              value: "warning"
            }
          },
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "ErrorHeader",
              children: [
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  "ErrorTitle",
                  ctx.plainTextNode("ErrorTitleText", "Retry live CRM facade")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "ErrorContent",
              children: [
                ctx.scriptTextNode("ErrorText", "this.global?.crmError || 'Retry if one CRM sequence fails.'"),
                {
                  className: "ngx.components.UIDynamicElement#Button",
                  name: "RetryButton",
                  properties: {
                    IonColor: {
                      mode: "PLAIN",
                      value: "primary"
                    }
                  },
                  children: [
                    ctx.plainTextNode("RetryText", "Retry"),
                    ctx.controlEventNode("Event", [
                      ctx.customAsyncActionNode(
                        "RetryDashboard",
                        [
                          "try {",
                          "  if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {",
                          "    window.location.reload();",
                          "  }",
                          "} finally {",
                          "  return;",
                          "}"
                        ].join("\n"),
                        "Reload the current page to rerun the CRM bootstrap action."
                      )
                    ])
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
  }

  function companyTableTreeGlobal(ctx, projectName, componentName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "CRM companies master list bound to global state."
      },
      children: [
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "CompanyListCard",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "CompanyListHeader",
              children: [
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  "CompanyListTitle",
                  ctx.plainTextNode("CompanyListTitleText", "Companies")
                ),
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardSubTitle",
                  "CompanyListSubtitle",
                  ctx.scriptTextNode("CompanyListSubtitleText", "'Loaded ' + ((this.global?.crmCompanies || []).length) + ' companies'")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "CompanyListContent",
              children: [
                ctx.ifDirectiveNode(
                  "CompanyListEmpty",
                  "(this.global?.crmCompanies || []).length === 0",
                  [
                    ctx.textElementNode(
                      "ngx.components.UIDynamicElement#Paragraph",
                      "CompanyListEmptyParagraph",
                      ctx.plainTextNode("CompanyListEmptyText", "No companies loaded yet.")
                    )
                  ]
                ),
                {
                  className: "ngx.components.UIDynamicElement#List",
                  name: "CompanyList",
                  children: [
                    ctx.sourceDirectiveNode(
                      "CompanyLoop",
                      "company",
                      ctx.globalSourceValue(projectName, "?.crmCompanies"),
                      [
                        {
                          className: "ngx.components.UIDynamicElement#ListItem",
                          name: "CompanyItem",
                          properties: {
                            Button: {
                              mode: "PLAIN",
                              value: "true"
                            },
                            Detail: {
                              mode: "PLAIN",
                              value: "false"
                            }
                          },
                          children: [
                            {
                              className: "ngx.components.UIDynamicElement#Label",
                              name: "CompanyLabel",
                              children: [
                                ctx.textElementNode(
                                  "ngx.components.UIDynamicElement#Heading2",
                                  "CompanyHeading",
                                  ctx.smartTextNode("CompanyHeadingText", ctx.iterationSourceValue(projectName, "company?.NAME ?? company?.name"))
                                ),
                                ctx.textElementNode(
                                  "ngx.components.UIDynamicElement#Paragraph",
                                  "CompanyParagraph",
                                  ctx.smartTextNode("CompanyParagraphText", ctx.iterationSourceValue(projectName, "(company?.INDUSTRY ?? company?.industry ?? '') + ' - ' + (company?.CITY ?? company?.city ?? '')"))
                                )
                              ]
                            },
                            ctx.textElementNode(
                              "ngx.components.UIDynamicElement#Note",
                              "CompanyCountNote",
                              ctx.smartTextNode("CompanyCountNoteText", ctx.iterationSourceValue(projectName, "'' + (company?.CONTACT_COUNT ?? company?.contact_count ?? 0) + ' contacts'"))
                            ),
                            ctx.controlEventNode("Event", [
                              ctx.dynamicInvokeNode("InvokeSelectCompany", ctx.crmActionQName(projectName, "crm_select_company"), [
                                ctx.controlVariableNode("company_id", ctx.iterationSourceValue(projectName, "company?.ID ?? company?.id"))
                              ])
                            ])
                          ]
                        }
                      ],
                      "idx"
                    )
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
  }

  function companyCardTreeGlobal(ctx, componentName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "CRM selected company detail bound to global state."
      },
      children: [
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "SelectedCompanyCard",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "SelectedCompanyHeader",
              children: [
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  "SelectedCompanyTitle",
                  ctx.plainTextNode("SelectedCompanyTitleText", "Selected company")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "SelectedCompanyContent",
              children: [
                ctx.scriptTextNode("SelectedCompanyName", "this.global?.crmSelectedCompany?.NAME ?? this.global?.crmSelectedCompany?.name ?? 'No company selected'"),
                ctx.scriptTextNode("SelectedCompanyIndustry", "(this.global?.crmSelectedCompany?.INDUSTRY ?? this.global?.crmSelectedCompany?.industry ?? 'No industry yet')"),
                ctx.scriptTextNode("SelectedCompanyCity", "(this.global?.crmSelectedCompany?.CITY ?? this.global?.crmSelectedCompany?.city ?? 'No city yet')"),
                ctx.scriptTextNode("SelectedCompanyCount", "'Contacts in company: ' + (this.global?.crmSelectedCompany?.CONTACT_COUNT ?? this.global?.crmSelectedCompany?.contact_count ?? (this.global?.crmCompanyContacts || []).length ?? 0)")
              ]
            }
          ]
        }
      ]
    };
  }

  function contactTableTreeGlobal(ctx, projectName, componentName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "CRM company contacts detail bound to global state."
      },
      children: [
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "CompanyContactsCard",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "CompanyContactsHeader",
              children: [
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  "CompanyContactsTitle",
                  ctx.plainTextNode("CompanyContactsTitleText", "Contacts for selected company")
                ),
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardSubTitle",
                  "CompanyContactsSubtitle",
                  ctx.scriptTextNode("CompanyContactsSubtitleText", "'Selected: ' + (this.global?.crmSelectedCompany?.NAME ?? this.global?.crmSelectedCompany?.name ?? 'none')")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "CompanyContactsContent",
              children: [
                ctx.ifDirectiveNode(
                  "CompanyContactsEmpty",
                  "(this.global?.crmCompanyContacts || []).length === 0",
                  [
                    ctx.textElementNode(
                      "ngx.components.UIDynamicElement#Paragraph",
                      "CompanyContactsEmptyParagraph",
                      ctx.plainTextNode("CompanyContactsEmptyText", "No contacts linked to the selected company yet.")
                    )
                  ]
                ),
                {
                  className: "ngx.components.UIDynamicElement#List",
                  name: "CompanyContactsList",
                  children: [
                    ctx.sourceDirectiveNode(
                      "CompanyContactsLoop",
                      "contact",
                      ctx.globalSourceValue(projectName, "?.crmCompanyContacts"),
                      [
                        {
                          className: "ngx.components.UIDynamicElement#ListItem",
                          name: "CompanyContactItem",
                          properties: {
                            Detail: {
                              mode: "PLAIN",
                              value: "false"
                            }
                          },
                          children: [
                            {
                              className: "ngx.components.UIDynamicElement#Label",
                              name: "CompanyContactLabel",
                              children: [
                                ctx.textElementNode(
                                  "ngx.components.UIDynamicElement#Heading2",
                                  "CompanyContactHeading",
                                  ctx.smartTextNode("CompanyContactHeadingText", ctx.iterationSourceValue(projectName, "(contact?.FIRSTNAME ?? contact?.firstname ?? '') + ' ' + (contact?.LASTNAME ?? contact?.lastname ?? '')"))
                                ),
                                ctx.textElementNode(
                                  "ngx.components.UIDynamicElement#Paragraph",
                                  "CompanyContactParagraph",
                                  ctx.smartTextNode("CompanyContactParagraphText", ctx.iterationSourceValue(projectName, "contact?.EMAIL ?? contact?.email ?? 'No email'"))
                                )
                              ]
                            }
                          ]
                        }
                      ],
                      "idx"
                    )
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
  }

  function contactCardTreeGlobal(ctx, projectName, componentName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "CRM all contacts overview bound to global state."
      },
      children: [
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "ContactsOverviewCard",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "ContactsOverviewHeader",
              children: [
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  "ContactsOverviewTitle",
                  ctx.plainTextNode("ContactsOverviewTitleText", "Contacts overview")
                ),
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardSubTitle",
                  "ContactsOverviewSubtitle",
                  ctx.scriptTextNode("ContactsOverviewSubtitleText", "'Loaded ' + ((this.global?.crmContacts || []).length) + ' contacts'")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "ContactsOverviewContent",
              children: [
                ctx.scriptTextNode("ContactsOverviewLead", "(this.global?.crmContacts || [])[0] ? (((this.global?.crmContacts || [])[0]?.FIRSTNAME ?? (this.global?.crmContacts || [])[0]?.firstname ?? '') + ' ' + ((this.global?.crmContacts || [])[0]?.LASTNAME ?? (this.global?.crmContacts || [])[0]?.lastname ?? '')) : 'No contact loaded yet'"),
                ctx.scriptTextNode("ContactsOverviewCompany", "(this.global?.crmContacts || [])[0] ? ('Company: ' + (((this.global?.crmContacts || [])[0]?.COMPANY_NAME ?? (this.global?.crmContacts || [])[0]?.company_name ?? 'n/a'))) : 'Awaiting company relation preview'"),
                ctx.scriptTextNode("ContactsOverviewStatus", "'Counts => companies: ' + ((this.global?.crmCounts || {}).companies ?? 0) + ', contacts: ' + ((this.global?.crmCounts || {}).contacts ?? 0)")
              ]
            }
          ]
        }
      ]
    };
  }

  function buildCrmSharedComponentsTree(ctx, projectName, stage) {
    var components = [
      crmHeaderComponentTree(ctx, "CrudPageHeader", projectName),
      crmLoadingStateTree(ctx, "CrudLoadingState"),
      crmErrorRetryStateTree(ctx, "CrudErrorRetryState", projectName),
      companyTableTreeGlobal(ctx, projectName, "CompanyTable"),
      companyCardTreeGlobal(ctx, "CompanyCard"),
      contactTableTreeGlobal(ctx, projectName, "ContactTable"),
      contactCardTreeGlobal(ctx, projectName, "ContactCard")
    ];
    if (ctx.trimmed(stage).toLowerCase() !== "final") {
      components.push(crmWorkInProgressCardTree(ctx, "WorkInProgressCard"));
    }
    return {
      qnames: components.map(function (component) { return ctx.sharedComponentQName(projectName, component.name); }),
      tree: {
        children: components
      }
    };
  }

  function countCardNode(ctx, name, title, valueExpression, caption) {
    return {
      className: "ngx.components.UIDynamicElement#Card",
      name: name,
      children: [
        {
          className: "ngx.components.UIDynamicElement#CardHeader",
          name: name + "Header",
          children: [
            ctx.textElementNode(
              "ngx.components.UIDynamicElement#CardTitle",
              name + "Title",
              ctx.plainTextNode(name + "TitleText", title)
            )
          ]
        },
        {
          className: "ngx.components.UIDynamicElement#CardContent",
          name: name + "Content",
          children: [
            ctx.scriptTextNode(name + "ValueText", valueExpression),
            ctx.plainTextNode(name + "CaptionText", caption)
          ]
        }
      ]
    };
  }

  function buildCrmMasterDetailPageShellTree(ctx, projectName, _stage) {
    var headerUse = ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, "CrudPageHeader"), "UseCrudPageHeader", []);
    var children = [
      {
        className: "ngx.components.UIDynamicElement#Grid",
        name: "CrmMasterDetailGrid",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridRow",
            name: "HeaderRow",
            children: [
              {
                className: "ngx.components.UIDynamicElement#GridCol",
                name: "HeaderCol",
                children: [headerUse]
              }
            ]
          }
        ]
      }
    ];
    children[0].children.push(ctx.buildStatefulBootstrapRow(projectName, "this.global?.crmBuildStage"));
    children[0].children.push(
      {
        className: "ngx.components.UIDynamicElement#GridRow",
        name: "CountsRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: "CompaniesCountCol",
            children: [
              countCardNode(ctx, "CompaniesCountCard", "Companies", "'' + ((this.global?.crmCounts || {}).companies ?? 0)", "Loaded from public facade")
            ]
          },
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: "ContactsCountCol",
            children: [
              countCardNode(ctx, "ContactsCountCard", "Contacts", "'' + ((this.global?.crmCounts || {}).contacts ?? 0)", "Loaded from public facade")
            ]
          }
        ]
      },
      {
        className: "ngx.components.UIDynamicElement#GridRow",
        name: "MasterDetailRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: "CompaniesListCol",
            children: [
              ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, "CompanyTable"), "UseCompanyTable", [])
            ]
          },
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: "CompanyDetailCol",
            children: [
              ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, "CompanyCard"), "UseCompanyCard", [])
            ]
          }
        ]
      },
      {
        className: "ngx.components.UIDynamicElement#GridRow",
        name: "ContactsRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: "CompanyContactsCol",
            children: [
              ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, "ContactTable"), "UseContactTable", [])
            ]
          },
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: "ContactsOverviewCol",
            children: [
              ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, "ContactCard"), "UseContactCard", [])
            ]
          }
        ]
      },
      {
        className: "ngx.components.UIDynamicElement#GridRow",
        name: "LoadingRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: "LoadingCol",
            children: [
              ctx.ifDirectiveNode(
                "LoadingVisible",
                "this.global?.crmLoading === true",
                [ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, "CrudLoadingState"), "UseCrudLoadingState", [])]
              )
            ]
          }
        ]
      },
      {
        className: "ngx.components.UIDynamicElement#GridRow",
        name: "ErrorRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: "ErrorCol",
            children: [
              ctx.ifDirectiveNode(
                "ErrorVisible",
                "!!this.global?.crmError",
                [ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, "CrudErrorRetryState"), "UseCrudErrorRetryState", [])]
              )
            ]
          }
        ]
      }
    );
    return {
      className: "ngx.components.UIDynamicElement#Content",
      name: "Content",
      properties: {
        Padding: {
          mode: "PLAIN",
          value: "ion-padding"
        }
      },
      children: children
    };
  }

  function buildCrmPageLoadTree(ctx, projectName, entryPage, _stage) {
    return {
      qname: ctx.pageQName(projectName, entryPage),
      legacyQNames: [
        ctx.pageQName(projectName, entryPage) + ".PageEvent",
        ctx.pageQName(projectName, entryPage) + ".LoadCrudFacadeOnEnter"
      ],
      tree: {
        properties: {
          scriptContent: ""
        },
        children: [
          ctx.pageEventNode(
            "PageEvent",
            "onWillLoad",
            [
              ctx.dynamicInvokeNode("InvokeBootstrapDashboard", ctx.crmActionQName(projectName, "crm_bootstrap_dashboard"), [])
            ],
            "Bootstrap CRM global state on page load."
          )
        ]
      }
    };
  }

  C8O.crudUiCrm.crmHeaderComponentTree = crmHeaderComponentTree;
  C8O.crudUiCrm.crmWorkInProgressCardTree = crmWorkInProgressCardTree;
  C8O.crudUiCrm.crmLoadingStateTree = crmLoadingStateTree;
  C8O.crudUiCrm.crmErrorRetryStateTree = crmErrorRetryStateTree;
  C8O.crudUiCrm.companyTableTreeGlobal = companyTableTreeGlobal;
  C8O.crudUiCrm.companyCardTreeGlobal = companyCardTreeGlobal;
  C8O.crudUiCrm.contactTableTreeGlobal = contactTableTreeGlobal;
  C8O.crudUiCrm.contactCardTreeGlobal = contactCardTreeGlobal;
  C8O.crudUiCrm.buildCrmSharedComponentsTree = buildCrmSharedComponentsTree;
  C8O.crudUiCrm.buildCrmMasterDetailPageShellTree = buildCrmMasterDetailPageShellTree;
  C8O.crudUiCrm.buildCrmPageLoadTree = buildCrmPageLoadTree;
})();
