if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.crudUiPages = C8O.crudUiPages || {};

(function () {
  if (C8O.crudUiPages._initialized === true) {
    return;
  }
  C8O.crudUiPages._initialized = true;

  function blankPageScriptContent() {
    return [
      "/*Begin_c8o_PageImport*/",
      "/*End_c8o_PageImport*/",
      "/*Begin_c8o_PageDeclaration*/",
      "/*End_c8o_PageDeclaration*/",
      "/*Begin_c8o_PageConstructor*/",
      "/*End_c8o_PageConstructor*/",
      "/*Begin_c8o_PageFunction*/",
      "/*End_c8o_PageFunction*/",
      ""
    ].join("\n");
  }

  function chainActionNodes(ctx, nodes) {
    var filtered = ctx.ensureArray(nodes).filter(function (node) {
      return !!node;
    });
    for (var index = 0; index < filtered.length - 1; index++) {
      filtered[index].children = ctx.ensureArray(filtered[index].children).concat([filtered[index + 1]]);
    }
    return filtered.length ? filtered[0] : null;
  }

  function entityPagesHeaderTitleTree(ctx, titleText) {
    return {
      className: "ngx.components.UIDynamicElement#Header",
      name: "Header",
      children: [
        {
          className: "ngx.components.UIDynamicElement#ToolBar",
          name: "ToolBar",
          children: [
            {
              className: "ngx.components.UIDynamicElement#BarTitle",
              name: "BarTitle",
              children: [
                ctx.plainTextNode("Text", titleText)
              ]
            }
          ]
        }
      ]
    };
  }

  function loginSequenceActionNode(ctx, projectName, name) {
    return ctx.callSequenceActionNode(
      name || "InvokeCrudAuthLogin",
      projectName + ".auth_login",
      [
        ctx.controlVariableNode("username", ctx.scriptLiteral("demo"), "Best-case demo user for the generated auth skeleton."),
        ctx.controlVariableNode("password", ctx.scriptLiteral("demo"), "Best-case demo password for the generated auth skeleton.")
      ],
      {
        noLoading: true,
        comment: "Establish the generated authenticated context before CRUD facade calls."
      }
    );
  }

  function loginBootstrapChainNode(ctx, projectName, name, childActions) {
    var loginNode = loginSequenceActionNode(ctx, projectName, name);
    var children = ctx.ensureArray(loginNode.children);
    var tail = ctx.ensureArray(childActions);
    for (var i = 0; i < tail.length; i++) {
      if (tail[i]) {
        children.push(tail[i]);
      }
    }
    loginNode.children = children;
    return loginNode;
  }

  function buildSessionBootstrapPageRootTree(ctx, projectName, entryPage) {
    var pageName = ctx.sessionBootstrapPageName();
    var targetQName = ctx.pageQName(projectName, entryPage);
    return {
      className: "ngx.components.PageComponent#PageComponent",
      name: pageName,
      properties: {
        comment: "Initialize the generated authenticated session before opening the CRUD home page.",
        icon: "log-in",
        inAutoMenu: false,
        isRoot: true,
        preloadPriority: "high",
        segment: "login",
        title: pageName,
        scriptContent: blankPageScriptContent()
      },
      children: [
        entityPagesHeaderTitleTree(ctx, pageName),
        {
          className: "ngx.components.UIDynamicElement#Content",
          name: "Content",
          properties: {
            Padding: {
              mode: "PLAIN",
              value: "ion-padding"
            }
          },
          children: [
            {
              className: "ngx.components.UIDynamicElement#Grid",
              name: "Grid",
              children: [
                {
                  className: "ngx.components.UIDynamicElement#GridRow",
                  name: "Row",
                  children: [
                    {
                      className: "ngx.components.UIDynamicElement#GridCol",
                      name: "Col",
                      children: [
                        {
                          className: "ngx.components.UIDynamicElement#Card",
                          name: "Card",
                          children: [
                            {
                              className: "ngx.components.UIDynamicElement#CardHeader",
                              name: "Header",
                              children: [
                                ctx.textElementNode(
                                  "ngx.components.UIDynamicElement#CardTitle",
                                  "Title",
                                  ctx.plainTextNode("Text", "Preparing session")
                                )
                              ]
                            },
                            {
                              className: "ngx.components.UIDynamicElement#CardContent",
                              name: "Content",
                              children: [
                                ctx.textElementNode(
                                  "ngx.components.UIDynamicElement#Paragraph",
                                  "Hint",
                                  ctx.plainTextNode("Text", "Signing in with the generated demo user, then opening the CRUD home page.")
                                )
                              ]
                            }
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        },
        ctx.pageEventNode(
          "PageEvent",
          "onWillLoad",
          [
            loginBootstrapChainNode(
              ctx,
              projectName,
              "InvokeCrudAuthLogin",
              [
                ctx.rootPageActionNode(
                  "OpenCrudLanding",
                  targetQName,
                  "not set",
                  "Open the generated CRUD home page once the best-case auth session exists."
                )
              ]
            )
          ],
          "Initialize the generated auth session and open the landing page."
        )
      ]
    };
  }

  function buildSessionBootstrapPageLoadTree(ctx, projectName, entryPage) {
    return {
      qname: ctx.sessionBootstrapPageQName(projectName),
      legacyQNames: [],
      tree: {
        properties: {
          scriptContent: blankPageScriptContent()
        },
        children: [
          ctx.pageEventNode(
            "PageEvent",
            "onWillLoad",
            [
              loginBootstrapChainNode(
                ctx,
                projectName,
                "InvokeCrudAuthLogin",
                [
                  ctx.rootPageActionNode(
                    "OpenCrudLanding",
                    ctx.pageQName(projectName, entryPage),
                    "not set",
                    "Open the generated CRUD home page once the best-case auth session exists."
                  )
                ]
              )
            ],
            "Initialize the generated auth session and open the landing page."
          )
        ]
      }
    };
  }

  function landingRouteCardNode(ctx, entity) {
    var componentPrefix = ctx.pascalize(entity.name);
    return {
      className: "ngx.components.UIDynamicElement#GridCol",
      name: componentPrefix + "RouteCol",
      children: [
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: componentPrefix + "RouteCard",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: componentPrefix + "RouteHeader",
              children: [
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  componentPrefix + "RouteTitle",
                  ctx.plainTextNode(componentPrefix + "RouteTitleText", entity.label)
                ),
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardSubTitle",
                  componentPrefix + "RouteSubtitle",
                  ctx.scriptTextNode("RouteSubtitleText", "'Rows: ' + (" + ctx.dashboardCountExpression(ctx.scriptLiteral(entity.name)) + ")")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: componentPrefix + "RouteContent",
              children: [
                ctx.scriptTextNode("RoutePreview", ctx.dynamicFieldAccessExpression(ctx.dashboardSampleExpression(ctx.scriptLiteral(entity.name)), ctx.scriptLiteral(((ctx.firstNonPrimaryField(entity) || entity.primaryField || {}).column) || "id"), ctx.scriptLiteral("No live sample yet"))),
                ctx.entityPagesButtonNode("OpenPageButton", "Open " + entity.label, { routerPath: ctx.entityRoutePath(entity), routerDirection: "forward", color: "primary" }, [])
              ]
            }
          ]
        }
      ]
    };
  }

  function buildDashboardPageShellTree(ctx, projectName, entities, _stage) {
    var children = [
      {
        className: "ngx.components.UIDynamicElement#Grid",
        name: "CrudDashboardGrid",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridRow",
            name: "HeaderRow",
            children: [
              {
                className: "ngx.components.UIDynamicElement#GridCol",
                name: "HeaderCol",
                children: [
                  ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, "CrudPageHeader"), "UseCrudPageHeader", [
                    ctx.useVariableNode("Title", ctx.scriptLiteral(ctx.ucfirst(projectName) + " Live Dashboard")),
                    ctx.useVariableNode("Subtitle", ctx.scriptLiteral(entities.map(function (entity) { return entity.label.toLowerCase(); }).join(" and ")))
                  ])
                ]
              }
            ]
          }
        ]
      }
    ];
    var gridChildren = children[0].children;
    gridChildren.push(ctx.buildStatefulBootstrapRow(projectName, "this.global?.crudBuildStage"));
    gridChildren.push({
      className: "ngx.components.UIDynamicElement#GridRow",
      name: "MetricsRow",
      children: entities.map(function (entity) {
        return {
          className: "ngx.components.UIDynamicElement#GridCol",
          name: ctx.ucfirst(entity.singular) + "StatCol",
          children: [
            ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, "DashboardStatCard"), "Use" + ctx.ucfirst(entity.singular) + "StatCard", [
              ctx.useVariableNode("Title", ctx.scriptLiteral(entity.label)),
              ctx.useVariableNode("EntityKey", ctx.scriptLiteral(entity.name)),
              ctx.useVariableNode("Caption", ctx.scriptLiteral("Loaded from public facade"))
            ])
          ]
        };
      })
    });
    for (var i = 0; i < entities.length; i++) {
      var entity = entities[i];
      var previewFields = ctx.schemaPreviewFields(entity, 2, false);
      var primaryField = (previewFields[0] || entity.primaryField || {}).column || "id";
      var secondaryField = (previewFields[1] || previewFields[0] || entity.primaryField || {}).column || primaryField;
      gridChildren.push({
        className: "ngx.components.UIDynamicElement#GridRow",
        name: ctx.ucfirst(entity.singular) + "Row",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: ctx.ucfirst(entity.singular) + "TableCol",
            children: [
              ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, ctx.ucfirst(entity.singular) + "Table"), "Use" + ctx.ucfirst(entity.singular) + "Table", [
                ctx.useVariableNode("Title", ctx.scriptLiteral(entity.label)),
                ctx.useVariableNode("EntityKey", ctx.scriptLiteral(entity.name)),
                ctx.useVariableNode("PrimaryField", ctx.scriptLiteral(primaryField)),
                ctx.useVariableNode("SecondaryField", ctx.scriptLiteral(secondaryField))
              ])
            ]
          },
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: ctx.ucfirst(entity.singular) + "CardCol",
            children: [
              ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, ctx.ucfirst(entity.singular) + "Card"), "Use" + ctx.ucfirst(entity.singular) + "Card", [
                ctx.useVariableNode("Title", ctx.scriptLiteral(ctx.ucfirst(entity.singular) + " snapshot")),
                ctx.useVariableNode("EntityKey", ctx.scriptLiteral(entity.name)),
                ctx.useVariableNode("PrimaryField", ctx.scriptLiteral(primaryField)),
                ctx.useVariableNode("SecondaryField", ctx.scriptLiteral(secondaryField))
              ])
            ]
          },
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: ctx.ucfirst(entity.singular) + "FormCol",
            children: [
              ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, ctx.ucfirst(entity.singular) + "Form"), "Use" + ctx.ucfirst(entity.singular) + "Form", [
                ctx.useVariableNode("Title", ctx.scriptLiteral("Edit " + ctx.ucfirst(entity.singular))),
                ctx.useVariableNode("EntityKey", ctx.scriptLiteral(entity.name)),
                ctx.useVariableNode("PrimaryField", ctx.scriptLiteral(primaryField)),
                ctx.useVariableNode("SecondaryField", ctx.scriptLiteral(secondaryField)),
                ctx.useVariableNode("ActionLabel", ctx.scriptLiteral("Save " + entity.singular))
              ])
            ]
          }
        ]
      });
    }
    gridChildren.push(
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
                "this.global?.crudLoading === true",
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
                "!!this.global?.crudError",
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

  function buildDashboardPageLoadTree(ctx, projectName, entryPage, _facadePrefix, _entities, stage) {
    var chainedActions = [
      ctx.dynamicInvokeNode("InvokeBootstrapDashboard", ctx.dashboardActionQName(projectName, "crud_bootstrap_dashboard"), [])
    ];
    if (ctx.trimmed(stage || "").toLowerCase() === "final") {
      chainedActions.push(finalizeCrudBuildStageNode(ctx, "FinalizeCrudBuildStage"));
    }
    var children = [
      ctx.pageEventNode(
        "PageEvent",
        "onWillLoad",
        [
          loginBootstrapChainNode(ctx, projectName, "InvokeCrudAuthLogin", chainedActions)
        ],
        "Bootstrap CRUD global state on page load."
      )
    ];
    return {
      qname: ctx.pageQName(projectName, entryPage),
      legacyQNames: [
        ctx.pageQName(projectName, entryPage) + ".PageEvent",
        ctx.pageQName(projectName, entryPage) + ".LoadCrudFacadeOnEnter"
      ],
      tree: {
        properties: {
          scriptContent: ctx.buildDashboardPageScriptContent(projectName, _facadePrefix, _entities, _stage)
        },
        children: children
      }
    };
  }

  function buildEntityPagesLandingShellTree(ctx, projectName, entities, _stage) {
    var children = [
      {
        className: "ngx.components.UIDynamicElement#Grid",
        name: "CrudDashboardGrid",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridRow",
            name: "HeaderRow",
            children: [
              {
                className: "ngx.components.UIDynamicElement#GridCol",
                name: "HeaderCol",
                children: [
                  ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, "CrudPageHeader"), "UseCrudPageHeader", [
                    ctx.useVariableNode("Title", ctx.scriptLiteral(ctx.ucfirst(projectName) + " CRUD landing")),
                    ctx.useVariableNode("Subtitle", ctx.scriptLiteral("Open an entity page to edit live facade data."))
                  ])
                ]
              }
            ]
          }
        ]
      }
    ];
    var gridChildren = children[0].children;
    gridChildren.push(ctx.buildStatefulBootstrapRow(projectName, "this.global?.crudBuildStage"));
    gridChildren.push({
      className: "ngx.components.UIDynamicElement#GridRow",
      name: "MetricsRow",
      children: entities.map(function (entity) {
        return {
          className: "ngx.components.UIDynamicElement#GridCol",
          name: ctx.pascalize(entity.name) + "MetricCol",
          children: [
            ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, "DashboardStatCard"), "Use" + ctx.pascalize(entity.name) + "StatCard", [
              ctx.useVariableNode("Title", ctx.scriptLiteral(entity.label)),
              ctx.useVariableNode("EntityKey", ctx.scriptLiteral(entity.name)),
              ctx.useVariableNode("Caption", ctx.scriptLiteral("Landing state is live"))
            ])
          ]
        };
      })
    });
    gridChildren.push({
      className: "ngx.components.UIDynamicElement#GridRow",
      name: "RouteRow",
      children: entities.map(function (entity) {
        return landingRouteCardNode(ctx, entity);
      })
    });
    gridChildren.push(
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
                "this.global?.crudLoading === true",
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
                "!!this.global?.crudError",
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

  function buildEntityPageShellTree(ctx, projectName, entity, _stage) {
    return {
      className: "ngx.components.UIDynamicElement#Content",
      name: "Content",
      properties: {
        Padding: {
          mode: "PLAIN",
          value: "ion-padding"
        }
      },
      children: [
        {
          className: "ngx.components.UIDynamicElement#Grid",
          name: "CrudEntityPageGrid",
          children: [
            {
              className: "ngx.components.UIDynamicElement#GridRow",
              name: "PageHeaderRow",
              children: [
                {
                  className: "ngx.components.UIDynamicElement#GridCol",
                  name: "PageHeaderCol",
                  children: [
                    ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, "CrudPageHeader"), "UseCrudPageHeader", [
                      ctx.useVariableNode("Title", ctx.scriptLiteral(entity.label + " workspace")),
                      ctx.useVariableNode("Subtitle", ctx.scriptLiteral("Select, edit, create, then return to the landing page if needed."))
                    ]),
                    ctx.entityPagesButtonNode("BackToLanding", "Back to landing", { routerPath: "/home", routerDirection: "back", fill: "outline" }, [])
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
  }

  function appendEntityPageRows(ctx, projectName, entity, shellTree, _stage) {
    var prefix = ctx.pascalize(entity.name);
    var gridChildren = ctx.ensureArray(shellTree && shellTree.children && shellTree.children[0] && shellTree.children[0].children);
    gridChildren.push(ctx.buildStatefulBootstrapRow(projectName, "this.global?.crudBuildStage"));
    gridChildren.push(
      {
        className: "ngx.components.UIDynamicElement#GridRow",
        name: prefix + "ListRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: prefix + "ListCol",
            children: [
              ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, prefix + "ListPanel"), "Use" + prefix + "ListPanel", [])
            ]
          }
        ]
      },
      {
        className: "ngx.components.UIDynamicElement#GridRow",
        name: prefix + "DetailRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: prefix + "DetailCol",
            children: [
              ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, prefix + "DetailCard"), "Use" + prefix + "DetailCard", [])
            ]
          }
        ]
      },
      {
        className: "ngx.components.UIDynamicElement#GridRow",
        name: prefix + "FormRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: prefix + "FormCol",
            children: [
              ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, prefix + "EditForm"), "Use" + prefix + "EditForm", [])
            ]
          }
        ]
      },
      {
        className: "ngx.components.UIDynamicElement#GridRow",
        name: prefix + "LoadingRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: prefix + "LoadingCol",
            children: [
              ctx.ifDirectiveNode(
                prefix + "LoadingVisible",
                "this.global?.crudLoading === true || " + ctx.crudEntityStatusExpression(ctx.scriptLiteral(entity.name)) + " === 'loading'",
                [ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, "CrudLoadingState"), "UseCrudLoadingState", [])]
              )
            ]
          }
        ]
      },
      {
        className: "ngx.components.UIDynamicElement#GridRow",
        name: prefix + "ErrorRow",
        children: [
          {
            className: "ngx.components.UIDynamicElement#GridCol",
            name: prefix + "ErrorCol",
            children: [
              ctx.ifDirectiveNode(
                prefix + "ErrorVisible",
                "!!this.global?.crudError || !!" + ctx.crudEntityErrorExpression(ctx.scriptLiteral(entity.name)),
                [ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, "CrudErrorRetryState"), "UseCrudErrorRetryState", [])]
              )
            ]
          }
        ]
      }
    );
    shellTree.children[0].children = gridChildren;
    return shellTree;
  }

  function buildEntityPageRootTree(ctx, entity) {
    return {
      className: "ngx.components.PageComponent#PageComponent",
      name: ctx.entityPageName(entity),
      properties: {
        comment: "Deterministic CRUD entity page for " + entity.label + ".",
        icon: "list",
        preloadPriority: "low",
        segment: ctx.entityRouteSegment(entity),
        title: entity.label
      },
      children: [
        entityPagesHeaderTitleTree(ctx, entity.label),
        {
          className: "ngx.components.UIDynamicElement#Content",
          name: "Content",
          properties: {
            Padding: {
              mode: "PLAIN",
              value: "ion-padding"
            }
          },
          children: []
        }
      ]
    };
  }

  function buildEntityPagesLandingLoadTree(ctx, projectName, entryPage, stage) {
    var children = [
      ctx.pageEventNode(
        "PageEvent",
        "onWillLoad",
        [
          chainActionNodes(ctx, [
            ctx.dynamicInvokeNode("InvokeEnsureSession", ctx.dashboardActionQName(projectName, "crud_ensure_session"), []),
            ctx.dynamicInvokeNode("InvokeBootstrapDashboard", ctx.dashboardActionQName(projectName, "crud_bootstrap_dashboard"), [])
          ])
        ],
        "Load only the landing counts and route cards."
      )
    ];
    return {
      qname: ctx.pageQName(projectName, entryPage),
      legacyQNames: [
        ctx.pageQName(projectName, entryPage) + ".PageEvent",
        ctx.pageQName(projectName, entryPage) + ".LoadCrudFacadeOnEnter"
      ],
      tree: {
        properties: {
          scriptContent: blankPageScriptContent()
        },
        children: children
      }
    };
  }

  function buildEntityPageLoadTree(ctx, projectName, entity, stage) {
    var children = [
      ctx.pageEventNode(
        "PageEvent",
        "onWillLoad",
        [
          chainActionNodes(ctx, [
            ctx.dynamicInvokeNode("InvokeEnsureSession", ctx.dashboardActionQName(projectName, "crud_ensure_session"), []),
            ctx.setLocalActionNode("InitSelectedId", "selectedId", "''"),
            ctx.setLocalActionNode("InitMode", "mode", "'create'"),
            ctx.setLocalActionNode("InitRefreshToken", "refreshToken", "String(Date.now())")
          ])
        ],
        "Initialize the local page glue state for the generated entity page."
      )
    ];
    return {
      qname: ctx.entityPageQName(projectName, entity),
      legacyQNames: [
        ctx.entityPageQName(projectName, entity) + ".PageEvent"
      ],
      tree: {
        properties: {
          scriptContent: blankPageScriptContent()
        },
        children: children
      }
    };
  }

  C8O.crudUiPages.blankPageScriptContent = blankPageScriptContent;
  C8O.crudUiPages.buildDashboardPageShellTree = buildDashboardPageShellTree;
  C8O.crudUiPages.buildDashboardPageLoadTree = buildDashboardPageLoadTree;
  C8O.crudUiPages.buildEntityPagesLandingShellTree = buildEntityPagesLandingShellTree;
  C8O.crudUiPages.buildSessionBootstrapPageRootTree = buildSessionBootstrapPageRootTree;
  C8O.crudUiPages.buildSessionBootstrapPageLoadTree = buildSessionBootstrapPageLoadTree;
  C8O.crudUiPages.buildEntityPageShellTree = buildEntityPageShellTree;
  C8O.crudUiPages.appendEntityPageRows = appendEntityPageRows;
  C8O.crudUiPages.buildEntityPageRootTree = buildEntityPageRootTree;
  C8O.crudUiPages.buildEntityPagesLandingLoadTree = buildEntityPagesLandingLoadTree;
  C8O.crudUiPages.buildEntityPageLoadTree = buildEntityPageLoadTree;
})();
