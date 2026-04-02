if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.crudUiShared = C8O.crudUiShared || {};

(function () {
  if (C8O.crudUiShared._initialized === true) {
    return;
  }
  C8O.crudUiShared._initialized = true;

  function trimmed(ctx, value) {
    return ctx.trimmed(value);
  }

  function ensureArray(ctx, value) {
    return ctx.ensureArray(value);
  }

  function dashboardHeaderComponentTree(ctx, componentName, projectName, entities) {
    var defaultTitle = ctx.ucfirst(projectName) + " Live Dashboard";
    var defaultSubtitle = entities.map(function (entity) {
      return entity.label;
    }).join(" and ");
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Deterministic CRUD dashboard header bound to global state."
      },
      children: [
        ctx.compVariableNode("Title", ctx.scriptLiteral(defaultTitle)),
        ctx.compVariableNode("Subtitle", ctx.scriptLiteral(defaultSubtitle)),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "CrudPageHeaderCard",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "CrudPageHeaderHeader",
              children: [
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  "CrudPageHeaderTitleSlot",
                  ctx.scriptTextNode("TitleText", "this.Title || " + ctx.scriptLiteral(defaultTitle))
                ),
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardSubTitle",
                  "CrudPageHeaderSubtitleSlot",
                  ctx.scriptTextNode("SubtitleText", "this.Subtitle || (this.global?.crudStatus === 'ok' ? 'Public facade data is live.' : (this.global?.crudLoading ? 'Loading public facade...' : (this.global?.crudError || 'Preparing public facade state.')))")
                )
              ]
            }
          ]
        }
      ]
    };
  }

  function dashboardWorkInProgressCardTree(ctx, componentName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Temporary dashboard bootstrap card."
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
                ctx.scriptTextNode("WorkInProgressText", "'Bootstrap stage visible. Current build stage: ' + (this.global?.crudBuildStage ?? 'bootstrap')"),
                ctx.plainTextNode("WorkInProgressHint", "The CRUD shell is visible while live shared actions populate global state.")
              ]
            }
          ]
        }
      ]
    };
  }

  function dashboardStatCardGlobalTree(ctx, componentName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Deterministic CRUD dashboard stat card bound to global state."
      },
      children: [
        ctx.compVariableNode("Title", "'Title'"),
        ctx.compVariableNode("EntityKey", "'items'"),
        ctx.compVariableNode("Caption", "'Loaded from public facade'"),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "DashboardCard",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "DashboardHeader",
              children: [
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  "DashboardTitleSlot",
                  ctx.scriptTextNode("TitleText", "this.Title || 'Title'")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "DashboardContent",
              children: [
                ctx.scriptTextNode("ValueText", "'' + (" + ctx.dashboardCountExpression("this.EntityKey") + ")"),
                ctx.scriptTextNode("CaptionText", "this.Caption || (this.global?.crudLoading ? 'Loading public facade...' : (this.global?.crudError || 'Loaded from public facade'))")
              ]
            }
          ]
        }
      ]
    };
  }

  function dashboardLoadingStateTree(ctx, componentName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Deterministic CRUD loading state bound to global state."
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
                ctx.scriptTextNode("LoadingText", "this.global?.crudLoading ? 'Loading public facade rows...' : ('State: ' + (this.global?.crudStatus ?? 'idle'))")
              ]
            }
          ]
        }
      ]
    };
  }

  function dashboardErrorRetryStateTree(ctx, componentName, projectName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Deterministic CRUD error state with retry action."
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
                  ctx.plainTextNode("ErrorTitleText", "Retry public facade")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "ErrorContent",
              children: [
                ctx.scriptTextNode("ErrorText", "this.global?.crudError || 'Retry if one public facade call fails.'"),
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
                        "Reload the current page to rerun the dashboard bootstrap action."
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

  function dashboardEntityTableTreeGlobal(ctx, projectName, entity) {
    var componentName = ctx.ucfirst(entity.singular) + "Table";
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Deterministic CRUD table summary bound to global state for " + entity.label + "."
      },
      children: [
        ctx.compVariableNode("Title", ctx.scriptLiteral(entity.label)),
        ctx.compVariableNode("EntityKey", ctx.scriptLiteral(entity.name)),
        ctx.compVariableNode("PrimaryField", ctx.scriptLiteral((entity.primaryField && entity.primaryField.column) || "id")),
        ctx.compVariableNode("SecondaryField", ctx.scriptLiteral(((ctx.schemaPreviewFields(entity, 2, false)[0] || entity.primaryField || {}).column) || "id")),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: componentName + "Card",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: componentName + "Header",
              children: [
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  componentName + "TitleSlot",
                  ctx.scriptTextNode("TitleText", "this.Title || " + ctx.scriptLiteral(entity.label))
                ),
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardSubTitle",
                  componentName + "SubtitleSlot",
                  ctx.scriptTextNode("SubtitleText", "'Loaded ' + (" + ctx.dashboardCountExpression("this.EntityKey") + ") + ' rows'")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: componentName + "Content",
              children: [
                ctx.ifDirectiveNode(
                  componentName + "Empty",
                  ctx.dashboardCountExpression("this.EntityKey") + " === 0",
                  [
                    ctx.textElementNode(
                      "ngx.components.UIDynamicElement#Paragraph",
                      componentName + "EmptyParagraph",
                      ctx.plainTextNode("EmptyText", "No rows available yet.")
                    )
                  ]
                ),
                {
                  className: "ngx.components.UIDynamicElement#List",
                  name: componentName + "List",
                  children: [
                    ctx.iterationDirectiveNode(
                      componentName + "Loop",
                      projectName,
                      "row",
                      ctx.dashboardRowsExpression("this.EntityKey"),
                      [
                        {
                          className: "ngx.components.UIDynamicElement#ListItem",
                          name: componentName + "Item",
                          properties: {
                            Detail: {
                              mode: "PLAIN",
                              value: "false"
                            }
                          },
                          children: [
                            {
                              className: "ngx.components.UIDynamicElement#Label",
                              name: componentName + "Label",
                              children: [
                                ctx.textElementNode(
                                  "ngx.components.UIDynamicElement#Heading2",
                                  componentName + "Heading",
                                  ctx.smartTextNode("HeadingText", ctx.iterationSourceValue(projectName, ctx.dynamicFieldAccessExpression("row", "this.PrimaryField", ctx.scriptLiteral("No primary value"))))
                                ),
                                ctx.textElementNode(
                                  "ngx.components.UIDynamicElement#Paragraph",
                                  componentName + "Paragraph",
                                  ctx.smartTextNode("ParagraphText", ctx.iterationSourceValue(projectName, ctx.dynamicFieldAccessExpression("row", "this.SecondaryField", ctx.scriptLiteral("No secondary value"))))
                                )
                              ]
                            }
                          ]
                        }
                      ]
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

  function dashboardEntityCardTreeGlobal(ctx, entity) {
    var componentName = ctx.ucfirst(entity.singular) + "Card";
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Deterministic CRUD entity card bound to global sample state for " + entity.label + "."
      },
      children: [
        ctx.compVariableNode("Title", ctx.scriptLiteral(ctx.ucfirst(entity.singular) + " snapshot")),
        ctx.compVariableNode("EntityKey", ctx.scriptLiteral(entity.name)),
        ctx.compVariableNode("PrimaryField", ctx.scriptLiteral((ctx.schemaPreviewFields(entity, 2, false)[0] || entity.primaryField || {}).column || "id")),
        ctx.compVariableNode("SecondaryField", ctx.scriptLiteral((ctx.schemaPreviewFields(entity, 2, false)[1] || ctx.schemaPreviewFields(entity, 2, false)[0] || entity.primaryField || {}).column || "id")),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: componentName + "Root",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: componentName + "Header",
              children: [
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  componentName + "TitleSlot",
                  ctx.scriptTextNode("TitleText", "this.Title || " + ctx.scriptLiteral(ctx.ucfirst(entity.singular) + " snapshot"))
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: componentName + "Content",
              children: [
                ctx.scriptTextNode("PrimaryText", ctx.dynamicFieldAccessExpression(ctx.dashboardSampleExpression("this.EntityKey"), "this.PrimaryField", ctx.scriptLiteral("No sample loaded yet"))),
                ctx.scriptTextNode("SecondaryText", ctx.dynamicFieldAccessExpression(ctx.dashboardSampleExpression("this.EntityKey"), "this.SecondaryField", ctx.scriptLiteral("No secondary value yet"))),
                ctx.scriptTextNode("InsightText", "'Rows loaded: ' + (" + ctx.dashboardCountExpression("this.EntityKey") + ")")
              ]
            }
          ]
        }
      ]
    };
  }

  function dashboardEntityFormTreeGlobal(ctx, entity) {
    var componentName = ctx.ucfirst(entity.singular) + "Form";
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Deterministic CRUD form shell bound to global sample state for " + entity.label + "."
      },
      children: [
        ctx.compVariableNode("Title", ctx.scriptLiteral("Edit " + ctx.ucfirst(entity.singular))),
        ctx.compVariableNode("EntityKey", ctx.scriptLiteral(entity.name)),
        ctx.compVariableNode("PrimaryField", ctx.scriptLiteral((ctx.schemaPreviewFields(entity, 2, false)[0] || entity.primaryField || {}).column || "id")),
        ctx.compVariableNode("SecondaryField", ctx.scriptLiteral((ctx.schemaPreviewFields(entity, 2, false)[1] || ctx.schemaPreviewFields(entity, 2, false)[0] || entity.primaryField || {}).column || "id")),
        ctx.compVariableNode("ActionLabel", ctx.scriptLiteral("Save " + entity.singular)),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: componentName + "Root",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: componentName + "Header",
              children: [
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  componentName + "TitleSlot",
                  ctx.scriptTextNode("TitleText", "this.Title || " + ctx.scriptLiteral("Edit " + ctx.ucfirst(entity.singular)))
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: componentName + "Content",
              children: [
                ctx.scriptTextNode("HelperText", "'Facade rows available: ' + (" + ctx.dashboardCountExpression("this.EntityKey") + ") + ' for ' + (this.EntityKey || 'entity')"),
                ctx.scriptTextNode("SampleText", "'Sample live value: ' + (" + ctx.dynamicFieldAccessExpression(ctx.dashboardSampleExpression("this.EntityKey"), "this.SecondaryField", ctx.scriptLiteral("n/a")) + ")"),
                {
                  className: "ngx.components.UIDynamicElement#Button",
                  name: "SubmitButton",
                  children: [
                    ctx.scriptTextNode("ActionText", "this.ActionLabel || " + ctx.scriptLiteral("Save " + entity.singular))
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
  }

  function buildDashboardSharedComponentsTree(ctx, projectName, entities, stage) {
    var components = [
      dashboardHeaderComponentTree(ctx, "CrudPageHeader", projectName, entities),
      dashboardStatCardGlobalTree(ctx, "DashboardStatCard"),
      dashboardLoadingStateTree(ctx, "CrudLoadingState"),
      dashboardErrorRetryStateTree(ctx, "CrudErrorRetryState", projectName)
    ];
    if (trimmed(ctx, stage).toLowerCase() !== "final") {
      components.push(dashboardWorkInProgressCardTree(ctx, "WorkInProgressCard"));
    }
    for (var i = 0; i < entities.length; i++) {
      components.push(dashboardEntityTableTreeGlobal(ctx, projectName, entities[i]));
      components.push(dashboardEntityCardTreeGlobal(ctx, entities[i]));
      components.push(dashboardEntityFormTreeGlobal(ctx, entities[i]));
    }
    return {
      qnames: components.map(function (component) { return ctx.sharedComponentQName(projectName, component.name); }),
      tree: {
        children: components
      }
    };
  }

  function entityPagesSharedRetryStateTree(ctx, componentName, projectName) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "CRUD entity-pages error state with retry action."
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
                  ctx.plainTextNode("ErrorTitleText", "Retry CRUD state")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "ErrorContent",
              children: [
                ctx.scriptTextNode("ErrorText", "this.global?.crudError || 'Retry if one facade call fails.'"),
                ctx.entityPagesButtonNode(
                  "RetryButton",
                  "Retry",
                  { color: "primary" },
                  [
                    ctx.controlEventNode("Event", [
                      ctx.dynamicInvokeNode("InvokeBootstrapDashboard", ctx.dashboardActionQName(projectName, "crud_bootstrap_dashboard"), [])
                    ])
                  ]
                )
              ]
            }
          ]
        }
      ]
    };
  }

  function entityPagesListPanelTree(ctx, projectName, entity) {
    var componentName = ctx.pascalize(entity.name) + "ListPanel";
    var config = ctx.entityUiConfig(projectName, "crud", entity);
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Stateful CRUD list panel for " + entity.label + "."
      },
      children: [
        ctx.compVariableNode("Title", ctx.scriptLiteral(entity.label)),
        ctx.compVariableNode("EntityKey", ctx.scriptLiteral(config.key)),
        ctx.compVariableNode("PrimaryField", ctx.scriptLiteral(config.previewPrimaryColumn)),
        ctx.compVariableNode("SecondaryField", ctx.scriptLiteral(config.previewSecondaryColumn)),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: componentName + "Card",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: componentName + "Header",
              children: [
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  componentName + "Title",
                  ctx.scriptTextNode("TitleText", "this.Title || " + ctx.scriptLiteral(entity.label))
                ),
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardSubTitle",
                  componentName + "Subtitle",
                  ctx.scriptTextNode("SubtitleText", "'Loaded ' + (" + ctx.dashboardCountExpression("this.EntityKey") + ") + ' rows'")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: componentName + "Content",
              children: [
                ctx.entityPagesButtonNode(
                  "NewButton",
                  "New " + entity.singular,
                  { fill: "outline" },
                  [
                    ctx.controlEventNode("Event", [
                      ctx.dynamicInvokeNode("InvokeNew", ctx.dashboardActionQName(projectName, "crud_new_" + entity.singular), [])
                    ])
                  ]
                ),
                ctx.ifDirectiveNode(
                  componentName + "Empty",
                  ctx.dashboardCountExpression("this.EntityKey") + " === 0",
                  [
                    ctx.textElementNode(
                      "ngx.components.UIDynamicElement#Paragraph",
                      componentName + "EmptyParagraph",
                      ctx.plainTextNode("EmptyText", "No rows available yet.")
                    )
                  ]
                ),
                {
                  className: "ngx.components.UIDynamicElement#List",
                  name: componentName + "List",
                  children: [
                    ctx.iterationDirectiveNode(
                      componentName + "Loop",
                      projectName,
                      "row",
                      ctx.dashboardRowsExpression("this.EntityKey"),
                      [
                        {
                          className: "ngx.components.UIDynamicElement#ListItem",
                          name: componentName + "Item",
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
                              name: componentName + "Label",
                              children: [
                                ctx.textElementNode(
                                  "ngx.components.UIDynamicElement#Heading2",
                                  componentName + "Heading",
                                  ctx.smartTextNode("HeadingText", ctx.iterationSourceValue(projectName, ctx.dynamicFieldAccessExpression("row", "this.PrimaryField", ctx.scriptLiteral("No primary value"))))
                                ),
                                ctx.textElementNode(
                                  "ngx.components.UIDynamicElement#Paragraph",
                                  componentName + "Paragraph",
                                  ctx.smartTextNode("ParagraphText", ctx.iterationSourceValue(projectName, ctx.dynamicFieldAccessExpression("row", "this.SecondaryField", ctx.scriptLiteral("No secondary value"))))
                                )
                              ]
                            },
                            ctx.controlEventNode("Event", [
                              ctx.dynamicInvokeNode("InvokeSelect", ctx.dashboardActionQName(projectName, "crud_select_" + entity.singular), [
                                ctx.controlVariableNode("row_id", ctx.iterationSourceValue(projectName, "row?.ID ?? row?.id"))
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

  function entityPagesDetailCardTree(ctx, entity) {
    var componentName = ctx.pascalize(entity.name) + "DetailCard";
    var primaryField = (ctx.firstNonPrimaryField(entity) || entity.primaryField || {}).column || "id";
    var secondaryField = (ctx.secondPreviewField(entity) || ctx.firstNonPrimaryField(entity) || entity.primaryField || {}).column || primaryField;
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Stateful CRUD detail card for " + entity.label + "."
      },
      children: [
        ctx.compVariableNode("Title", ctx.scriptLiteral(ctx.ucfirst(entity.singular) + " detail")),
        ctx.compVariableNode("EntityKey", ctx.scriptLiteral(entity.name)),
        ctx.compVariableNode("PrimaryField", ctx.scriptLiteral(primaryField)),
        ctx.compVariableNode("SecondaryField", ctx.scriptLiteral(secondaryField)),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: componentName + "Root",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: componentName + "Header",
              children: [
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  componentName + "TitleSlot",
                  ctx.scriptTextNode("TitleText", "this.Title || " + ctx.scriptLiteral(ctx.ucfirst(entity.singular) + " detail"))
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: componentName + "Content",
              children: [
                ctx.scriptTextNode("PrimaryText", ctx.dynamicFieldAccessExpression(ctx.crudSelectedExpression("this.EntityKey"), "this.PrimaryField", ctx.scriptLiteral("No record selected"))),
                ctx.scriptTextNode("SecondaryText", ctx.dynamicFieldAccessExpression(ctx.crudSelectedExpression("this.EntityKey"), "this.SecondaryField", ctx.scriptLiteral("No secondary value"))),
                ctx.scriptTextNode("StatusText", "'Mode: ' + (" + ctx.crudModeExpression("this.EntityKey") + ") + ' | Status: ' + (" + ctx.crudEntityStatusExpression("this.EntityKey") + ")"),
                ctx.ifDirectiveNode(
                  componentName + "ErrorVisible",
                  "!!" + ctx.crudEntityErrorExpression("this.EntityKey"),
                  [
                    ctx.textElementNode(
                      "ngx.components.UIDynamicElement#Paragraph",
                      componentName + "ErrorText",
                      ctx.scriptTextNode("ErrorTextValue", ctx.crudEntityErrorExpression("this.EntityKey"))
                    )
                  ]
                )
              ]
            }
          ]
        }
      ]
    };
  }

  function buildDraftFieldUpdateScript(ctx, entityKey, fieldColumn) {
    return [
      "page.global = page.global || {};",
      "var drafts = Object.assign({}, page.global.crudDrafts || {});",
      "var draft = Object.assign({}, drafts[" + ctx.scriptLiteral(entityKey) + "] || {});",
      "var value = event && event.detail && event.detail.value != null ? event.detail.value : ((event && event.target && event.target.value != null) ? event.target.value : '');",
      "draft[" + ctx.scriptLiteral(fieldColumn) + "] = value == null ? '' : value;",
      "drafts[" + ctx.scriptLiteral(entityKey) + "] = draft;",
      "page.global.crudDrafts = drafts;",
      "page.ref.markForCheck();",
      "return draft;"
    ].join("\n");
  }

  function buildRelationSelectNode(ctx, projectName, entityKey, field, entities) {
    var relatedEntity = ctx.findEntityByName(entities, field.references && field.references.entity);
    var relatedPreview = relatedEntity ? (ctx.firstNonPrimaryField(relatedEntity) || relatedEntity.primaryField || {}) : {};
    var relatedLabelField = relatedPreview.column || "id";
    var relatedKey = relatedEntity ? relatedEntity.name : ctx.pluralize(ctx.normalizedIdentifier(field.references.entity));
    return {
      className: "ngx.components.UIDynamicElement#Select",
      name: ctx.pascalize(field.column) + "Select",
      properties: {
        Label: {
          mode: "PLAIN",
          value: field.label
        },
        LabelPlacement: {
          mode: "PLAIN",
          value: "stacked"
        },
        Placeholder: {
          mode: "PLAIN",
          value: "Select " + field.label
        },
        Interface: {
          mode: "PLAIN",
          value: "popover"
        },
        Value: {
          mode: "SCRIPT",
          value: ctx.dynamicFieldAccessExpression(ctx.crudDraftExpression(ctx.scriptLiteral(entityKey)), ctx.scriptLiteral(field.column), "''")
        }
      },
      children: [
        ctx.iterationDirectiveNode(
          ctx.pascalize(field.column) + "OptionLoop",
          projectName,
          "option",
          "((this.global?.crudRows || {})[" + ctx.scriptLiteral(relatedKey) + "] || [])",
          [
            {
              className: "ngx.components.UIDynamicElement#SelectOption",
              name: ctx.pascalize(field.column) + "Option",
              properties: {
                Value: {
                  mode: "SCRIPT",
                  value: "String(option?.ID ?? option?.id ?? '')"
                }
              },
              children: [
                ctx.smartTextNode("OptionText", ctx.iterationSourceValue(projectName, ctx.dynamicFieldAccessExpression("option", ctx.scriptLiteral(relatedLabelField), ctx.scriptLiteral("Option"))))
              ]
            }
          ],
          "idx"
        ),
        ctx.controlEventNode("ChangeEvent", [
          ctx.customAsyncActionNode(
            "Store" + ctx.pascalize(field.column),
            buildDraftFieldUpdateScript(ctx, entityKey, field.column),
            "Store selected relation value into CRUD draft state."
          )
        ], {
          attrName: "(ionChange)",
          eventName: "ionChange"
        })
      ]
    };
  }

  function buildTextInputNode(ctx, entityKey, field) {
    return {
      className: "ngx.components.UIDynamicElement#Input",
      name: ctx.pascalize(field.column) + "Input",
      properties: {
        Label: {
          mode: "PLAIN",
          value: field.label
        },
        LabelPlacement: {
          mode: "PLAIN",
          value: "stacked"
        },
        Placeholder: {
          mode: "PLAIN",
          value: field.label
        },
        Value: {
          mode: "SCRIPT",
          value: ctx.dynamicFieldAccessExpression(ctx.crudDraftExpression(ctx.scriptLiteral(entityKey)), ctx.scriptLiteral(field.column), "''")
        },
        Required: {
          mode: "PLAIN",
          value: field.required ? "true" : "false"
        }
      },
      children: [
        ctx.controlEventNode("InputEvent", [
          ctx.customAsyncActionNode(
            "Store" + ctx.pascalize(field.column),
            buildDraftFieldUpdateScript(ctx, entityKey, field.column),
            "Store input value into CRUD draft state."
          )
        ], {
          attrName: "(ionInput)",
          eventName: "ionInput"
        })
      ]
    };
  }

  function entityPagesFormFieldNode(ctx, projectName, entity, field, entities) {
    return {
      className: "ngx.components.UIDynamicElement#FormItem",
      name: ctx.pascalize(field.column) + "Item",
      children: [
        field.references ? buildRelationSelectNode(ctx, projectName, entity.name, field, entities) : buildTextInputNode(ctx, entity.name, field)
      ]
    };
  }

  function entityPagesEditFormTree(ctx, projectName, entity, entities) {
    var componentName = ctx.pascalize(entity.name) + "EditForm";
    var nonPrimaryFields = ensureArray(ctx, entity.fields).filter(function (field) {
      return field && field.primary !== true;
    });
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: componentName,
      properties: {
        comment: "Stateful CRUD edit form for " + entity.label + "."
      },
      children: [
        ctx.compVariableNode("EntityKey", ctx.scriptLiteral(entity.name)),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: componentName + "Root",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: componentName + "Header",
              children: [
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  componentName + "Title",
                  ctx.scriptTextNode("TitleText", "(" + ctx.crudModeExpression("this.EntityKey") + " === 'create' ? " + ctx.scriptLiteral("Create " + entity.singular) + " : " + ctx.scriptLiteral("Edit " + entity.singular) + ")")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: componentName + "Content",
              children: nonPrimaryFields.map(function (field) {
                return entityPagesFormFieldNode(ctx, projectName, entity, field, entities);
              }).concat([
                ctx.scriptTextNode("FormStatus", "'Entity status: ' + (" + ctx.crudEntityStatusExpression("this.EntityKey") + ")"),
                ctx.ifDirectiveNode(
                  componentName + "ErrorVisible",
                  "!!" + ctx.crudEntityErrorExpression("this.EntityKey"),
                  [
                    ctx.textElementNode(
                      "ngx.components.UIDynamicElement#Paragraph",
                      componentName + "ErrorMessage",
                      ctx.scriptTextNode("ErrorText", ctx.crudEntityErrorExpression("this.EntityKey"))
                    )
                  ]
                ),
                ctx.entityPagesButtonNode(
                  "SaveButton",
                  "Save " + entity.singular,
                  { color: "primary" },
                  [
                    ctx.controlEventNode("Event", [
                      ctx.dynamicInvokeNode("InvokeSave", ctx.dashboardActionQName(projectName, "crud_save_" + entity.singular), [])
                    ])
                  ]
                ),
                ctx.entityPagesButtonNode(
                  "CancelButton",
                  "Cancel",
                  { fill: "outline" },
                  [
                    ctx.controlEventNode("Event", [
                      ctx.dynamicInvokeNode("InvokeCancel", ctx.dashboardActionQName(projectName, "crud_cancel_" + entity.singular), [])
                    ])
                  ]
                ),
                ctx.ifDirectiveNode(
                  componentName + "DeleteVisible",
                  "!!" + ctx.crudSelectedExpression("this.EntityKey"),
                  [
                    ctx.entityPagesButtonNode(
                      "DeleteButton",
                      "Delete " + entity.singular,
                      { color: "danger", fill: "outline" },
                      [
                        ctx.controlEventNode("Event", [
                          ctx.dynamicInvokeNode("InvokeDelete", ctx.dashboardActionQName(projectName, "crud_delete_" + entity.singular), [])
                        ])
                      ]
                    )
                  ]
                )
              ])
            }
          ]
        }
      ]
    };
  }

  function buildEntityPagesSharedComponentsTree(ctx, projectName, entities, stage) {
    var components = [
      dashboardHeaderComponentTree(ctx, "CrudPageHeader", projectName, entities),
      dashboardStatCardGlobalTree(ctx, "DashboardStatCard"),
      dashboardLoadingStateTree(ctx, "CrudLoadingState"),
      entityPagesSharedRetryStateTree(ctx, "CrudErrorRetryState", projectName)
    ];
    if (trimmed(ctx, stage).toLowerCase() !== "final") {
      components.push(dashboardWorkInProgressCardTree(ctx, "WorkInProgressCard"));
    }
    for (var i = 0; i < entities.length; i++) {
      components.push(entityPagesListPanelTree(ctx, projectName, entities[i]));
      components.push(entityPagesDetailCardTree(ctx, entities[i]));
      components.push(entityPagesEditFormTree(ctx, projectName, entities[i], entities));
    }
    return {
      qnames: components.map(function (component) { return ctx.sharedComponentQName(projectName, component.name); }),
      tree: {
        children: components
      }
    };
  }

  C8O.crudUiShared.buildDashboardSharedComponentsTree = buildDashboardSharedComponentsTree;
  C8O.crudUiShared.buildEntityPagesSharedComponentsTree = buildEntityPagesSharedComponentsTree;
})();
