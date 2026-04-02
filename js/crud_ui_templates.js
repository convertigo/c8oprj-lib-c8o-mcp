if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.crudUiTemplates = C8O.crudUiTemplates || {};

(function () {
  if (C8O.crudUiTemplates._initialized === true) {
    return;
  }
  C8O.crudUiTemplates._initialized = true;

  var TEMPLATE_PROJECT = "ConvertigoMCP";
  var TEMPLATE_PAGE = "Templates";
  var TOKENS = {
    PROJECT_NAME: "__PROJECT_NAME__",
    ENTRY_ROUTE: "__ENTRY_ROUTE__",
    ENTITY_SINGULAR: "__ENTITY_SINGULAR__",
    ENTITY_PLURAL: "__ENTITY_PLURAL__",
    ENTITY_KEY: "__ENTITY_KEY__",
    DISPLAY_LABEL: "__DISPLAY_LABEL__",
    ROUTE_SEGMENT: "__ROUTE_SEGMENT__",
    PRIMARY_FIELD: "__PRIMARY_FIELD__",
    SECONDARY_FIELD: "__SECONDARY_FIELD__",
    ACTION_LABEL: "__ACTION_LABEL__",
    FACADE_PREFIX: "__FACADE_PREFIX__"
  };

  function trimmed(ctx, value) {
    return ctx.trimmed(value);
  }

  function ensureArray(ctx, value) {
    return ctx.ensureArray(value);
  }

  function isPlainObject(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
  }

  function sourceProjectName(_ctx) {
    return TEMPLATE_PROJECT;
  }

  function templatePageName(_ctx) {
    return TEMPLATE_PAGE;
  }

  function templateComponentName(componentName) {
    return "Tpl" + String(componentName || "");
  }

  function templatePageComponentName(pageName) {
    return "Tpl" + String(pageName || "");
  }

  function canonicalPageQName(ctx, projectName, pageName) {
    return ctx.ngxAppQName(projectName) + ".pg:" + trimmed(ctx, pageName || templatePageName(ctx));
  }

  function sourceTemplateNames() {
    return {
      loginPage: templatePageComponentName("Login"),
      homePage: templatePageComponentName("Home"),
      entityPage: templatePageComponentName("EntityPage"),
      pageHeader: templateComponentName("CrudPageHeader"),
      workInProgress: templateComponentName("WorkInProgressCard"),
      loadingState: templateComponentName("CrudLoadingState"),
      errorRetry: templateComponentName("CrudErrorRetryState"),
      dashboardStat: templateComponentName("DashboardStatCard"),
      entityListPanel: templateComponentName("EntityListPanel"),
      entityDetailCard: templateComponentName("EntityDetailCard"),
      entityEditForm: templateComponentName("EntityEditForm")
    };
  }

  function placeholderMap(ctx, projectName, entity, entities, targetComponentName) {
    var currentEntity = entity || {};
    var uiConfig = typeof ctx.entityUiConfig === "function" ? ctx.entityUiConfig(projectName, "crud", currentEntity, entities) : null;
    var label = trimmed(ctx, currentEntity.label || currentEntity.displayLabel || currentEntity.name || "Entity");
    var singular = trimmed(ctx, currentEntity.singular || "entity");
    var plural = trimmed(ctx, currentEntity.name || currentEntity.plural || ctx.pluralize(singular));
    var entityKey = trimmed(ctx, currentEntity.name || plural || "entities");
    var routeSegment = trimmed(ctx, currentEntity.routeSegment || entityKey);
    var primaryField = trimmed(ctx, (((uiConfig && uiConfig.listFields && uiConfig.listFields[0]) || currentEntity.primaryField || {}).column) || "id");
    var secondaryField = trimmed(ctx, (((uiConfig && uiConfig.listFields && uiConfig.listFields[1]) || (uiConfig && uiConfig.detailFields && uiConfig.detailFields[0]) || ctx.firstNonPrimaryField(currentEntity) || ctx.secondPreviewField(currentEntity) || currentEntity.primaryField || {}).column) || primaryField);
    var actionLabel = trimmed(ctx, uiConfig && uiConfig.actionLabel) || ("Save " + singular);
    var replacements = {};
    replacements[TOKENS.PROJECT_NAME] = trimmed(ctx, projectName || "");
    replacements[TOKENS.ENTITY_SINGULAR] = singular;
    replacements[TOKENS.ENTITY_PLURAL] = plural;
    replacements[TOKENS.ENTITY_KEY] = entityKey;
    replacements[TOKENS.DISPLAY_LABEL] = label;
    replacements[TOKENS.ROUTE_SEGMENT] = routeSegment;
    replacements[TOKENS.PRIMARY_FIELD] = primaryField;
    replacements[TOKENS.SECONDARY_FIELD] = secondaryField;
    replacements[TOKENS.ACTION_LABEL] = actionLabel;
    replacements[TOKENS.FACADE_PREFIX] = "crud";
    if (trimmed(ctx, targetComponentName).length) {
      replacements[templateComponentName("EntityListPanel")] = targetComponentName;
      replacements[templateComponentName("EntityDetailCard")] = targetComponentName;
      replacements[templateComponentName("EntityEditForm")] = targetComponentName;
    }
    return replacements;
  }

  function replaceTokensInString(text, replacements) {
    var output = String(text);
    var keys = Object.keys(replacements || {});
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (!key.length) {
        continue;
      }
      output = output.split(key).join(String(replacements[key]));
    }
    return output;
  }

  function replaceTokensDeep(value, replacements) {
    if (value == null) {
      return value;
    }
    if (typeof value === "string") {
      return replaceTokensInString(value, replacements);
    }
    if (Array.isArray(value)) {
      var resultArray = [];
      for (var i = 0; i < value.length; i++) {
        resultArray.push(replaceTokensDeep(value[i], replacements));
      }
      return resultArray;
    }
    if (isPlainObject(value)) {
      var resultObject = {};
      var keys = Object.keys(value);
      for (var k = 0; k < keys.length; k++) {
        resultObject[keys[k]] = replaceTokensDeep(value[keys[k]], replacements);
      }
      return resultObject;
    }
    return value;
  }

  function extractCanonicalTree(ctx, dbo) {
    var logicalClassName = ctx.logicalClassNameForDbo(dbo);
    if (typeof logicalClassName === "string" && logicalClassName.indexOf("ngx.components.UIDynamicInvoke#") === 0) {
      logicalClassName = "ngx.components.UIDynamicInvoke#InvokeAction";
    }
    var node = {
      className: logicalClassName,
      name: ctx.safeName(dbo)
    };
    var properties = ctx.getCanonicalPropertiesMap(dbo, "changed", { includeReadOnly: false });
    if (properties && Object.keys(properties).length) {
      node.properties = properties;
    }
    var children = ctx.getDirectChildren(dbo);
    if (children && children.length) {
      node.children = [];
      for (var i = 0; i < children.length; i++) {
        node.children.push(extractCanonicalTree(ctx, children[i]));
      }
    }
    return node;
  }

  function cloneTemplateTree(ctx, sourceQName, replacements, targetName) {
    var sourceDbo = ctx.resolveQName(sourceQName, { optional: true });
    if (!sourceDbo) {
      return null;
    }
    var tree = extractCanonicalTree(ctx, sourceDbo);
    var cloned = replaceTokensDeep(tree, replacements || {});
    if (trimmed(ctx, targetName).length) {
      cloned.name = String(targetName);
    }
    return cloned;
  }

  function walkTree(node, visitor) {
    if (!node || typeof node !== "object") {
      return;
    }
    visitor(node);
    var children = Array.isArray(node.children) ? node.children : [];
    for (var i = 0; i < children.length; i++) {
      walkTree(children[i], visitor);
    }
  }

  function findTreeNodeByName(node, expectedName) {
    var target = trimmed({ trimmed: function (value) { return value == null ? "" : String(value).trim(); } }, expectedName);
    var match = null;
    walkTree(node, function (current) {
      if (match || !current) {
        return;
      }
      if (String(current.name || "") === target) {
        match = current;
      }
    });
    return match;
  }

  function markManagedClone(tree, componentName) {
    if (!tree || typeof tree !== "object") {
      return tree;
    }
    tree.properties = tree.properties || {};
    tree.properties.comment = "Managed by upsert-ngx-crud-kit (entity-pages template clone) for " + String(componentName || tree.name || "component") + ". Direct edits may be overwritten; prefer entity.ui hints.";
    return tree;
  }

  function markManagedPageClone(tree, pageName) {
    if (!tree || typeof tree !== "object") {
      return tree;
    }
    tree.properties = tree.properties || {};
    tree.properties.comment = "Managed by upsert-ngx-crud-kit (entity-pages page template clone) for " + String(pageName || tree.name || "page") + ". Direct edits may be overwritten; prefer template sources and entity.ui hints.";
    return tree;
  }

  function pageTemplateQName(ctx, projectName, pageName) {
    return canonicalPageQName(ctx, projectName, templatePageComponentName(pageName));
  }

  function directChildByName(ctx, tree, expectedName) {
    var children = ensureArray(ctx, tree && tree.children);
    var target = trimmed(ctx, expectedName);
    for (var i = 0; i < children.length; i++) {
      if (trimmed(ctx, children[i] && children[i].name) === target) {
        return children[i];
      }
    }
    return null;
  }

  function removeDirectChildByName(ctx, tree, expectedName) {
    var children = ensureArray(ctx, tree && tree.children);
    var target = trimmed(ctx, expectedName);
    var kept = [];
    for (var i = 0; i < children.length; i++) {
      if (trimmed(ctx, children[i] && children[i].name) !== target) {
        kept.push(children[i]);
      }
    }
    tree.children = kept;
    return tree;
  }

  function buildCommonPageSharedReplacements(ctx, projectName) {
    var sourceProject = sourceProjectName(ctx);
    var names = sourceTemplateNames();
    var replacements = {};
    replacements[ctx.sharedComponentQName(sourceProject, names.pageHeader)] = ctx.sharedComponentQName(projectName, "CrudPageHeader");
    replacements[ctx.sharedComponentQName(sourceProject, names.workInProgress)] = ctx.sharedComponentQName(projectName, "WorkInProgressCard");
    replacements[ctx.sharedComponentQName(sourceProject, names.loadingState)] = ctx.sharedComponentQName(projectName, "CrudLoadingState");
    replacements[ctx.sharedComponentQName(sourceProject, names.errorRetry)] = ctx.sharedComponentQName(projectName, "CrudErrorRetryState");
    replacements[ctx.sharedComponentQName(sourceProject, names.dashboardStat)] = ctx.sharedComponentQName(projectName, "DashboardStatCard");
    replacements[TOKENS.PROJECT_NAME] = projectName;
    replacements[TOKENS.ENTRY_ROUTE] = "/home";
    return replacements;
  }

  function clonedFieldList(config, key) {
    var fields = ensureArray({ ensureArray: function (value) { return Array.isArray(value) ? value : (value == null ? [] : [value]); } }, config && config[key]);
    return fields.map(function (field) {
      return isPlainObject(field) ? field : {};
    });
  }

  function isQuotedLiteralExpression(ctx, expression) {
    var text = trimmed(ctx, expression || "");
    if (text.length < 2) {
      return false;
    }
    var first = text.charAt(0);
    var last = text.charAt(text.length - 1);
    return (first === "'" && last === "'") || (first === "\"" && last === "\"");
  }

  function coalescedStringExpression(ctx, expression, fallbackLiteral) {
    var text = trimmed(ctx, expression || "");
    if (!text.length) {
      return ctx.scriptLiteral(fallbackLiteral || "");
    }
    if (isQuotedLiteralExpression(ctx, text)) {
      return text;
    }
    return "((" + text + ") || " + ctx.scriptLiteral(fallbackLiteral || "") + ")";
  }

  function fieldValueExpression(ctx, rowExpression, fieldColumn, fallbackLiteral) {
    return ctx.dynamicFieldAccessExpression(rowExpression, ctx.scriptLiteral(fieldColumn || ""), ctx.scriptLiteral(fallbackLiteral || ""));
  }

  function buildListItemLabelChildren(ctx, fields, listTargetName) {
    var resolvedFields = ensureArray(ctx, fields);
    var children = [];
    if (!resolvedFields.length) {
      resolvedFields = [{ column: "id", label: "Id" }];
    }
    for (var i = 0; i < resolvedFields.length; i++) {
      var field = resolvedFields[i] || {};
      var fieldLabel = trimmed(ctx, field.label || field.name || field.column || "Field");
      var fieldColumn = trimmed(ctx, field.displayColumn || field.column || field.name || "id");
      var textName = listTargetName + "ListField" + (i + 1) + "Text";
      var valueExpression = ctx.iterationSourceValue(
        TOKENS.PROJECT_NAME,
        fieldValueExpression(ctx, "row", fieldColumn, i === 0 ? "No primary value" : "No value")
      );
      if (i === 0) {
        children.push(
          ctx.textElementNode(
            "ngx.components.UIDynamicElement#Heading2",
            listTargetName + "ListField" + (i + 1),
            ctx.smartTextNode(textName, valueExpression)
          )
        );
      } else {
        children.push(
          ctx.textElementNode(
            "ngx.components.UIDynamicElement#Paragraph",
            listTargetName + "ListField" + (i + 1),
            ctx.smartTextNode(textName, ctx.iterationSourceValue(TOKENS.PROJECT_NAME, ctx.scriptLiteral(fieldLabel + ": ") + " + (" + fieldValueExpression(ctx, "row", fieldColumn, "No value") + ")"))
          )
        );
      }
    }
    return children;
  }

  function buildDetailContentChildren(ctx, fields, detailTargetName) {
    var resolvedFields = ensureArray(ctx, fields);
    var children = [];
    if (!resolvedFields.length) {
      resolvedFields = [{ column: "id", label: "Id" }];
    }
    for (var i = 0; i < resolvedFields.length; i++) {
      var field = resolvedFields[i] || {};
      var fieldLabel = trimmed(ctx, field.label || field.name || field.column || "Field");
      var fieldColumn = trimmed(ctx, field.displayColumn || field.column || field.name || "id");
      children.push(
        ctx.textElementNode(
          "ngx.components.UIDynamicElement#Paragraph",
          detailTargetName + "DetailField" + (i + 1),
          ctx.scriptTextNode(
            detailTargetName + "DetailField" + (i + 1) + "Text",
            ctx.scriptLiteral(fieldLabel + ": ") + " + (" + fieldValueExpression(ctx, ctx.crudSelectedExpression("this.EntityKey"), fieldColumn, i === 0 ? "No record selected" : "No value") + ")"
          )
        )
      );
    }
    children.push(
      ctx.scriptTextNode("StatusText", "'Mode: ' + (" + ctx.crudModeExpression("this.EntityKey") + ") + ' | Status: ' + (" + ctx.crudEntityStatusExpression("this.EntityKey") + ")")
    );
    children.push(
      ctx.ifDirectiveNode(
        detailTargetName + "ErrorVisible",
        "!!" + ctx.crudEntityErrorExpression("this.EntityKey"),
        [
          ctx.textElementNode(
            "ngx.components.UIDynamicElement#Paragraph",
            detailTargetName + "ErrorText",
            ctx.scriptTextNode("ErrorTextValue", ctx.crudEntityErrorExpression("this.EntityKey"))
          )
        ]
      )
    );
    return children;
  }

  function buildFormFieldChildren(ctx, config, entities, projectName) {
    var fields = ensureArray(ctx, config && config.editableFields);
    var relationLookup = {};
    var relationFields = ensureArray(ctx, config && config.relationFields);
    for (var index = 0; index < relationFields.length; index++) {
      var relation = relationFields[index];
      relationLookup[trimmed(ctx, relation && relation.column)] = relation;
    }
    var children = [];
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i] || {};
      var relation = relationLookup[trimmed(ctx, field.column)] || null;
      var fieldConfig = {
        fieldNameExpression: ctx.scriptLiteral(trimmed(ctx, field.column || field.name || "")),
        fieldLabelExpression: ctx.scriptLiteral(trimmed(ctx, field.label || field.name || field.column || "Field")),
        requiredExpression: field.required === true ? "true" : "false",
        relation: !!relation
      };
      if (relation) {
        var relatedEntity = typeof ctx.findEntityByName === "function" ? ctx.findEntityByName(entities, relation.entity) : null;
        var relatedConfig = relatedEntity && typeof ctx.entityUiConfig === "function" ? ctx.entityUiConfig(projectName, "crud", relatedEntity, entities) : null;
        fieldConfig.control = trimmed(ctx, relation.control || "select") || "select";
        fieldConfig.relatedEntityKeyExpression = ctx.scriptLiteral(trimmed(ctx, relation.entity || ""));
        fieldConfig.controlExpression = ctx.scriptLiteral(trimmed(ctx, relation.control || "select") || "select");
        fieldConfig.relatedLabelFieldExpression = ctx.scriptLiteral(trimmed(ctx, relation.optionLabelField || (relatedConfig && relatedConfig.previewPrimaryColumn) || relation.targetField || "id"));
        fieldConfig.relatedValueFieldExpression = ctx.scriptLiteral(trimmed(ctx, relation.optionValueField || relation.targetField || "id"));
        fieldConfig.placeholderExpression = ctx.scriptLiteral(trimmed(ctx, relation.placeholder || ("Select " + (field.label || field.name || field.column || "value"))));
      }
      children.push(formFieldItemNode(ctx, i, fieldConfig));
    }
    return children;
  }

  function customizeEntityListPanelTree(ctx, tree, targetName, config) {
    var labelNode = findTreeNodeByName(tree, targetName + "Label");
    if (labelNode) {
      labelNode.children = buildListItemLabelChildren(ctx, config && config.listFields, targetName);
    }
    return markManagedClone(tree, targetName);
  }

  function customizeEntityDetailCardTree(ctx, tree, targetName, config) {
    var contentNode = findTreeNodeByName(tree, targetName + "Content");
    if (contentNode) {
      contentNode.children = buildDetailContentChildren(ctx, config && config.detailFields, targetName);
    }
    return markManagedClone(tree, targetName);
  }

  function customizeEntityEditFormTree(ctx, tree, targetName, config, entities, projectName) {
    var contentNode = findTreeNodeByName(tree, targetName + "Content");
    if (contentNode) {
      var existingChildren = Array.isArray(contentNode.children) ? contentNode.children.slice() : [];
      var formChildren = buildFormFieldChildren(ctx, config, entities, projectName);
      formChildren.push(
        ctx.scriptTextNode("FormStatus", "'Entity status: ' + (" + ctx.crudEntityStatusExpression("this.EntityKey") + ")")
      );
      formChildren.push(
        ctx.ifDirectiveNode(
          targetName + "ErrorVisible",
          "!!" + ctx.crudEntityErrorExpression("this.EntityKey"),
          [
            ctx.textElementNode(
              "ngx.components.UIDynamicElement#Paragraph",
              targetName + "ErrorMessage",
              ctx.scriptTextNode("ErrorText", ctx.crudEntityErrorExpression("this.EntityKey"))
            )
          ]
        )
      );
      if (existingChildren.length >= 3) {
        formChildren.push(existingChildren[existingChildren.length - 3]);
        formChildren.push(existingChildren[existingChildren.length - 2]);
        formChildren.push(existingChildren[existingChildren.length - 1]);
      }
      contentNode.children = formChildren;
    }
    return markManagedClone(tree, targetName);
  }

  function templateCrudPageHeaderTree(ctx) {
    var crudGlobal = ctx.crudGlobalExpression();
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: templateComponentName("CrudPageHeader"),
      properties: {
        comment: "Template source for the CRUD page header."
      },
      children: [
        ctx.compVariableNode("Title", ctx.scriptLiteral(TOKENS.DISPLAY_LABEL)),
        ctx.compVariableNode("Subtitle", ctx.scriptLiteral("Live CRUD template preview")),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "TplCrudPageHeaderCard",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "TplCrudPageHeaderHeader",
              children: [
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  "TplCrudPageHeaderTitleSlot",
                  ctx.scriptTextNode("TitleText", "this.Title || " + ctx.scriptLiteral(TOKENS.DISPLAY_LABEL))
                ),
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardSubTitle",
                  "TplCrudPageHeaderSubtitleSlot",
                  ctx.scriptTextNode("SubtitleText", "this.Subtitle || ((" + crudGlobal + ").crudStatus === 'ok' ? 'Public facade data is live.' : ((" + crudGlobal + ").crudLoading ? 'Loading public facade...' : ((" + crudGlobal + ").crudError || 'Preparing public facade state.')))")
                )
              ]
            }
          ]
        }
      ]
    };
  }

  function templateWorkInProgressCardTree(ctx) {
    var crudGlobal = ctx.crudGlobalExpression();
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: templateComponentName("WorkInProgressCard"),
      properties: {
        comment: "Template source for the bootstrap work-in-progress card."
      },
      children: [
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "TplWorkInProgressCardRoot",
          properties: {
            IonColor: {
              mode: "PLAIN",
              value: "warning"
            }
          },
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "TplWorkInProgressCardHeader",
              children: [
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  "TplWorkInProgressCardTitle",
                  ctx.plainTextNode("TplWorkInProgressCardTitleText", "Work in progress")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "TplWorkInProgressCardContent",
              children: [
                ctx.scriptTextNode("TplWorkInProgressText", "'Bootstrap stage visible. Current build stage: ' + ((" + crudGlobal + ").crudBuildStage ?? 'bootstrap')"),
                ctx.plainTextNode("TplWorkInProgressHint", "The CRUD shell is visible while live shared actions populate global state.")
              ]
            }
          ]
        }
      ]
    };
  }

  function templateCrudLoadingStateTree(ctx) {
    var crudGlobal = ctx.crudGlobalExpression();
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: templateComponentName("CrudLoadingState"),
      properties: {
        comment: "Template source for the CRUD loading state card."
      },
      children: [
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "TplCrudLoadingStateCard",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "TplCrudLoadingStateContent",
              children: [
                ctx.scriptTextNode("TplCrudLoadingStateText", "(" + crudGlobal + ").crudLoading ? 'Loading public facade rows...' : ('State: ' + ((" + crudGlobal + ").crudStatus ?? 'idle'))")
              ]
            }
          ]
        }
      ]
    };
  }

  function templateCrudErrorRetryStateTree(ctx) {
    var retryQName = ctx.dashboardActionQName(TOKENS.PROJECT_NAME, "crud_retry_dashboard");
    var crudGlobal = ctx.crudGlobalExpression();
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: templateComponentName("CrudErrorRetryState"),
      properties: {
        comment: "Template source for the CRUD error/retry card."
      },
      children: [
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "TplCrudErrorRetryStateCard",
          properties: {
            IonColor: {
              mode: "PLAIN",
              value: "warning"
            }
          },
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "TplCrudErrorRetryStateHeader",
              children: [
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  "TplCrudErrorRetryStateTitle",
                  ctx.plainTextNode("TplCrudErrorRetryStateTitleText", "Retry CRUD state")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "TplCrudErrorRetryStateContent",
              children: [
                ctx.scriptTextNode("TplCrudErrorRetryStateText", "(" + crudGlobal + ").crudError || 'Retry if one facade call fails.'"),
                ctx.entityPagesButtonNode(
                  "RetryButton",
                  "Retry",
                  { color: "primary" },
                  [
                    ctx.controlEventNode("Event", [
                      ctx.dynamicInvokeNode("InvokeRetryDashboard", retryQName, [])
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

  function templateDashboardStatCardTree(ctx) {
    var crudGlobal = ctx.crudGlobalExpression();
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: templateComponentName("DashboardStatCard"),
      properties: {
        comment: "Template source for the CRUD dashboard stat card."
      },
      children: [
        ctx.compVariableNode("Title", ctx.scriptLiteral(TOKENS.DISPLAY_LABEL)),
        ctx.compVariableNode("EntityKey", ctx.scriptLiteral(TOKENS.ENTITY_KEY)),
        ctx.compVariableNode("Caption", ctx.scriptLiteral("Loaded from public facade")),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "TplDashboardStatCardCard",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: "TplDashboardStatCardHeader",
              children: [
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  "TplDashboardStatCardTitleSlot",
                  ctx.scriptTextNode("TitleText", "this.Title || " + ctx.scriptLiteral(TOKENS.DISPLAY_LABEL))
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "TplDashboardStatCardContent",
              children: [
                ctx.scriptTextNode("TplDashboardStatCardValue", "'' + (" + ctx.dashboardCountExpression("this.EntityKey") + ")"),
                ctx.scriptTextNode("TplDashboardStatCardCaption", "this.Caption || ((" + crudGlobal + ").crudLoading ? 'Loading public facade...' : ((" + crudGlobal + ").crudError || 'Loaded from public facade'))")
              ]
            }
          ]
        }
      ]
    };
  }

  function templateEntityListPanelTree(ctx) {
    var singular = TOKENS.ENTITY_SINGULAR;
    var actionQName = ctx.dashboardActionQName(TOKENS.PROJECT_NAME, "crud_new_" + singular);
    var selectQName = ctx.dashboardActionQName(TOKENS.PROJECT_NAME, "crud_select_" + singular);
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: templateComponentName("EntityListPanel"),
      properties: {
        comment: "Template source for the CRUD entity list panel."
      },
      children: [
        ctx.compVariableNode("Title", ctx.scriptLiteral(TOKENS.DISPLAY_LABEL)),
        ctx.compVariableNode("EntityKey", ctx.scriptLiteral(TOKENS.ENTITY_KEY)),
        ctx.compVariableNode("PrimaryField", ctx.scriptLiteral(TOKENS.PRIMARY_FIELD)),
        ctx.compVariableNode("SecondaryField", ctx.scriptLiteral(TOKENS.SECONDARY_FIELD)),
        ctx.compVariableNode("ActionLabel", ctx.scriptLiteral("New " + TOKENS.ENTITY_SINGULAR)),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: templateComponentName("EntityListPanel") + "Card",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: templateComponentName("EntityListPanel") + "Header",
              children: [
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  templateComponentName("EntityListPanel") + "Title",
                  ctx.scriptTextNode("TitleText", "this.Title || " + ctx.scriptLiteral(TOKENS.DISPLAY_LABEL))
                ),
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardSubTitle",
                  templateComponentName("EntityListPanel") + "Subtitle",
                  ctx.scriptTextNode("SubtitleText", "'Loaded ' + (" + ctx.dashboardCountExpression("this.EntityKey") + ") + ' rows'")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: templateComponentName("EntityListPanel") + "Content",
              children: [
                scriptLabelButtonNode(
                  ctx,
                  "NewButton",
                  "this.ActionLabel || " + ctx.scriptLiteral("New " + TOKENS.ENTITY_SINGULAR),
                  { fill: "outline" },
                  [
                    ctx.controlEventNode("Event", [
                      ctx.dynamicInvokeNode("InvokeNew", actionQName, [])
                    ])
                  ]
                ),
                ctx.ifDirectiveNode(
                  templateComponentName("EntityListPanel") + "Empty",
                  ctx.dashboardCountExpression("this.EntityKey") + " === 0",
                  [
                    ctx.textElementNode(
                      "ngx.components.UIDynamicElement#Paragraph",
                      templateComponentName("EntityListPanel") + "EmptyParagraph",
                      ctx.plainTextNode("EmptyText", "No rows available yet.")
                    )
                  ]
                ),
                {
                  className: "ngx.components.UIDynamicElement#List",
                  name: templateComponentName("EntityListPanel") + "List",
                  children: [
                    ctx.iterationDirectiveNode(
                      templateComponentName("EntityListPanel") + "Loop",
                      TOKENS.PROJECT_NAME,
                      "row",
                      ctx.dashboardRowsExpression("this.EntityKey"),
                      [
                        {
                          className: "ngx.components.UIDynamicElement#ListItem",
                          name: templateComponentName("EntityListPanel") + "Item",
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
                              name: templateComponentName("EntityListPanel") + "Label",
                              children: [
                                ctx.textElementNode(
                                  "ngx.components.UIDynamicElement#Heading2",
                                  templateComponentName("EntityListPanel") + "Heading",
                                  ctx.smartTextNode("HeadingText", ctx.iterationSourceValue(TOKENS.PROJECT_NAME, ctx.dynamicFieldAccessExpression("row", "this.PrimaryField", ctx.scriptLiteral("No primary value"))))
                                ),
                                ctx.textElementNode(
                                  "ngx.components.UIDynamicElement#Paragraph",
                                  templateComponentName("EntityListPanel") + "Paragraph",
                                  ctx.smartTextNode("ParagraphText", ctx.iterationSourceValue(TOKENS.PROJECT_NAME, ctx.dynamicFieldAccessExpression("row", "this.SecondaryField", ctx.scriptLiteral("No secondary value"))))
                                )
                              ]
                            },
                            ctx.controlEventNode("Event", [
                              ctx.dynamicInvokeNode("InvokeSelect", selectQName, [
                                ctx.controlVariableNode("row_id", ctx.iterationSourceValue(TOKENS.PROJECT_NAME, "row?.ID ?? row?.id"))
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

  function templateEntityDetailCardTree(ctx) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: templateComponentName("EntityDetailCard"),
      properties: {
        comment: "Template source for the CRUD entity detail card."
      },
      children: [
        ctx.compVariableNode("Title", ctx.scriptLiteral(TOKENS.DISPLAY_LABEL + " detail")),
        ctx.compVariableNode("EntityKey", ctx.scriptLiteral(TOKENS.ENTITY_KEY)),
        ctx.compVariableNode("PrimaryField", ctx.scriptLiteral(TOKENS.PRIMARY_FIELD)),
        ctx.compVariableNode("SecondaryField", ctx.scriptLiteral(TOKENS.SECONDARY_FIELD)),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: templateComponentName("EntityDetailCard") + "Root",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: templateComponentName("EntityDetailCard") + "Header",
              children: [
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  templateComponentName("EntityDetailCard") + "TitleSlot",
                  ctx.scriptTextNode("TitleText", "this.Title || " + ctx.scriptLiteral(TOKENS.DISPLAY_LABEL + " detail"))
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: templateComponentName("EntityDetailCard") + "Content",
              children: [
                ctx.scriptTextNode("PrimaryText", ctx.dynamicFieldAccessExpression(ctx.crudSelectedExpression("this.EntityKey"), "this.PrimaryField", ctx.scriptLiteral("No record selected"))),
                ctx.scriptTextNode("SecondaryText", ctx.dynamicFieldAccessExpression(ctx.crudSelectedExpression("this.EntityKey"), "this.SecondaryField", ctx.scriptLiteral("No secondary value"))),
                ctx.scriptTextNode("StatusText", "'Mode: ' + (" + ctx.crudModeExpression("this.EntityKey") + ") + ' | Status: ' + (" + ctx.crudEntityStatusExpression("this.EntityKey") + ")"),
                ctx.ifDirectiveNode(
                  templateComponentName("EntityDetailCard") + "ErrorVisible",
                  "!!" + ctx.crudEntityErrorExpression("this.EntityKey"),
                  [
                    ctx.textElementNode(
                      "ngx.components.UIDynamicElement#Paragraph",
                      templateComponentName("EntityDetailCard") + "ErrorText",
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

  function buildDraftFieldUpdateScript(ctx, fieldNameExpression) {
    var resolvedFieldNameExpression = trimmed(ctx, fieldNameExpression || "this.FieldName") || "this.FieldName";
    return [
      "page.global = page.global || {};",
      "var key = this.EntityKey || " + ctx.scriptLiteral(TOKENS.ENTITY_KEY) + ";",
      "var fieldName = " + coalescedStringExpression(ctx, resolvedFieldNameExpression, "") + ";",
      "var drafts = Object.assign({}, page.global.crudDrafts || {});",
      "var draft = Object.assign({}, drafts[key] || {});",
      "var value = event && event.detail && event.detail.value != null ? event.detail.value : ((event && event.target && event.target.value != null) ? event.target.value : '');",
      "draft[fieldName] = value == null ? '' : value;",
      "drafts[key] = draft;",
      "page.global.crudDrafts = drafts;",
      "page.ref.markForCheck();",
      "return draft;"
    ].join("\n");
  }

  function buildRelationSearchKeyExpression(ctx, fieldNameExpression) {
    var resolvedFieldNameExpression = trimmed(ctx, fieldNameExpression || "this.FieldName") || "this.FieldName";
    return "((" + coalescedStringExpression(ctx, "this.EntityKey", "") + ") + '::' + (" + coalescedStringExpression(ctx, resolvedFieldNameExpression, "") + "))";
  }

  function relationRowsExpression(ctx, relatedEntityKeyExpression) {
    var crudGlobal = ctx.crudGlobalExpression();
    return "(((" + crudGlobal + ").crudRows || {})[" + coalescedStringExpression(ctx, relatedEntityKeyExpression, "related") + "] || [])";
  }

  function relationRowsScriptExpression(ctx, relatedEntityKeyExpression) {
    return "((((page.global || {})).crudRows || {})[" + coalescedStringExpression(ctx, relatedEntityKeyExpression, "related") + "] || [])";
  }

  function relationOptionLabelExpression(ctx, optionExpression, relatedLabelFieldExpression) {
    return ctx.dynamicFieldAccessExpression(optionExpression, relatedLabelFieldExpression, ctx.scriptLiteral("Option"));
  }

  function relationOptionValueExpression(ctx, optionExpression, relatedValueFieldExpression) {
    return ctx.dynamicFieldAccessExpression(optionExpression, relatedValueFieldExpression, ctx.scriptLiteral(""));
  }

  function currentRelationLabelExpression(ctx, fieldNameExpression, relatedEntityKeyExpression, relatedLabelFieldExpression, relatedValueFieldExpression) {
    var rowsExpression = relationRowsScriptExpression(ctx, relatedEntityKeyExpression);
    var draftValueExpression = ctx.dynamicFieldAccessExpression(ctx.crudDraftExpression("this.EntityKey"), fieldNameExpression, "''");
    var optionLabelExpression = relationOptionLabelExpression(ctx, "option", relatedLabelFieldExpression);
    var optionValueExpression = relationOptionValueExpression(ctx, "option", relatedValueFieldExpression);
    return [
      "(function(){",
      "  var rows = " + rowsExpression + ";",
      "  var currentValue = " + draftValueExpression + ";",
      "  if (currentValue == null || String(currentValue) === '') {",
      "    return '';",
      "  }",
      "  for (var idx = 0; idx < rows.length; idx++) {",
      "    var option = rows[idx];",
      "    if (String(" + optionValueExpression + ") === String(currentValue)) {",
      "      return String(" + optionLabelExpression + ");",
      "    }",
      "  }",
      "  return String(currentValue);",
      "})()"
    ].join("\n");
  }

  function relationDraftLabelExpression(ctx, fieldNameExpression) {
    var resolvedFieldNameExpression = trimmed(ctx, fieldNameExpression || "this.FieldName") || "this.FieldName";
    var labelFieldExpression = "((" + coalescedStringExpression(ctx, resolvedFieldNameExpression, "") + ") + '__label')";
    return ctx.dynamicFieldAccessExpression(ctx.crudDraftExpression("this.EntityKey"), labelFieldExpression, "''");
  }

  function buildRelationSearchUpdateScript(ctx, fieldNameExpression) {
    var resolvedFieldNameExpression = trimmed(ctx, fieldNameExpression || "this.FieldName") || "this.FieldName";
    var searchKeyExpression = buildRelationSearchKeyExpression(ctx, resolvedFieldNameExpression);
    return [
      "page.global = page.global || {};",
      "var key = this.EntityKey || " + ctx.scriptLiteral(TOKENS.ENTITY_KEY) + ";",
      "var fieldName = " + coalescedStringExpression(ctx, resolvedFieldNameExpression, "") + ";",
      "var searchKey = " + searchKeyExpression + ";",
      "var searches = Object.assign({}, page.global.crudRelationSearch || {});",
      "var drafts = Object.assign({}, page.global.crudDrafts || {});",
      "var draft = Object.assign({}, drafts[key] || {});",
      "var value = event && event.detail && event.detail.value != null ? event.detail.value : ((event && event.target && event.target.value != null) ? event.target.value : '');",
      "searches[searchKey] = value == null ? '' : String(value);",
      "if (searches[searchKey] === '') {",
      "  draft[fieldName] = '';",
      "  draft[fieldName + '__label'] = '';",
      "  drafts[key] = draft;",
      "  page.global.crudDrafts = drafts;",
      "}",
      "page.global.crudRelationSearch = searches;",
      "page.ref.markForCheck();",
      "return searches[searchKey];"
    ].join("\n");
  }

  function buildRelationSelectionScript(ctx, fieldNameExpression, relatedLabelFieldExpression, relatedValueFieldExpression) {
    var resolvedFieldNameExpression = trimmed(ctx, fieldNameExpression || "this.FieldName") || "this.FieldName";
    var searchKeyExpression = buildRelationSearchKeyExpression(ctx, resolvedFieldNameExpression);
    var optionLabelExpression = relationOptionLabelExpression(ctx, "option", relatedLabelFieldExpression);
    var optionValueExpression = relationOptionValueExpression(ctx, "option", relatedValueFieldExpression);
    return [
      "page.global = page.global || {};",
      "var key = this.EntityKey || " + ctx.scriptLiteral(TOKENS.ENTITY_KEY) + ";",
      "var fieldName = " + coalescedStringExpression(ctx, resolvedFieldNameExpression, "") + ";",
      "var searchKey = " + searchKeyExpression + ";",
      "var drafts = Object.assign({}, page.global.crudDrafts || {});",
      "var draft = Object.assign({}, drafts[key] || {});",
      "var searches = Object.assign({}, page.global.crudRelationSearch || {});",
      "var selectedValue = String(" + optionValueExpression + " ?? '');",
      "var selectedLabel = String(" + optionLabelExpression + " ?? selectedValue);",
      "draft[fieldName] = selectedValue;",
      "draft[fieldName + '__label'] = selectedLabel;",
      "drafts[key] = draft;",
      "searches[searchKey] = selectedLabel;",
      "page.global.crudDrafts = drafts;",
      "page.global.crudRelationSearch = searches;",
      "page.ref.markForCheck();",
      "return draft;"
    ].join("\n");
  }

  function buildRelationValueSelectionScript(ctx, fieldNameExpression, relatedEntityKeyExpression, relatedLabelFieldExpression, relatedValueFieldExpression) {
    var resolvedFieldNameExpression = trimmed(ctx, fieldNameExpression || "this.FieldName") || "this.FieldName";
    var searchKeyExpression = buildRelationSearchKeyExpression(ctx, resolvedFieldNameExpression);
    var rowsExpression = relationRowsScriptExpression(ctx, relatedEntityKeyExpression);
    var optionLabelExpression = relationOptionLabelExpression(ctx, "row", relatedLabelFieldExpression);
    var optionValueExpression = relationOptionValueExpression(ctx, "row", relatedValueFieldExpression);
    return [
      "page.global = page.global || {};",
      "var key = this.EntityKey || " + ctx.scriptLiteral(TOKENS.ENTITY_KEY) + ";",
      "var fieldName = " + coalescedStringExpression(ctx, resolvedFieldNameExpression, "") + ";",
      "var searchKey = " + searchKeyExpression + ";",
      "var drafts = Object.assign({}, page.global.crudDrafts || {});",
      "var draft = Object.assign({}, drafts[key] || {});",
      "var searches = Object.assign({}, page.global.crudRelationSearch || {});",
      "var rows = " + rowsExpression + ";",
      "var selectedValueRaw = event && event.detail && event.detail.value != null ? event.detail.value : ((event && event.target && event.target.value != null) ? event.target.value : '');",
      "var selectedValue = selectedValueRaw == null ? '' : String(selectedValueRaw);",
      "var selectedLabel = selectedValue;",
      "for (var idx = 0; idx < rows.length; idx++) {",
      "  var row = rows[idx];",
      "  if (String(" + optionValueExpression + " ?? '') === selectedValue) {",
      "    selectedLabel = String(" + optionLabelExpression + " ?? selectedValue);",
      "    break;",
      "  }",
      "}",
      "draft[fieldName] = selectedValue;",
      "draft[fieldName + '__label'] = selectedLabel;",
      "drafts[key] = draft;",
      "searches[searchKey] = selectedLabel;",
      "page.global.crudDrafts = drafts;",
      "page.global.crudRelationSearch = searches;",
      "page.ref.markForCheck();",
      "return draft;"
    ].join("\n");
  }

  function relationSelectNode(ctx, config) {
    var currentConfig = config || {};
    var fieldLabelExpression = currentConfig.fieldLabelExpression || "this.FieldLabel";
    var fieldNameExpression = currentConfig.fieldNameExpression || "this.FieldName";
    var relatedEntityKeyExpression = currentConfig.relatedEntityKeyExpression || "this.RelatedEntityKey";
    var relatedLabelFieldExpression = currentConfig.relatedLabelFieldExpression || "this.RelatedLabelField";
    var relatedValueFieldExpression = currentConfig.relatedValueFieldExpression || "this.RelatedValueField";
    var placeholderExpression = currentConfig.placeholderExpression || ("'Select ' + " + coalescedStringExpression(ctx, fieldLabelExpression, "related value"));
    var crudGlobal = ctx.crudGlobalExpression();
    return {
      className: "ngx.components.UIDynamicElement#Select",
      name: "RelationSelect",
      properties: {
        Label: {
          mode: "SCRIPT",
          value: coalescedStringExpression(ctx, fieldLabelExpression, "Related")
        },
        LabelPlacement: {
          mode: "PLAIN",
          value: "stacked"
        },
        Placeholder: {
          mode: "SCRIPT",
          value: placeholderExpression
        },
        Interface: {
          mode: "PLAIN",
          value: "popover"
        },
        Value: {
          mode: "SCRIPT",
          value: ctx.dynamicFieldAccessExpression(ctx.crudDraftExpression("this.EntityKey"), fieldNameExpression, "''")
        }
      },
      children: [
        ctx.iterationDirectiveNode(
          "RelationOptionLoop",
          TOKENS.PROJECT_NAME,
          "option",
          "(((" + crudGlobal + ").crudRows || {})[" + coalescedStringExpression(ctx, relatedEntityKeyExpression, "related") + "] || [])",
          [
            {
              className: "ngx.components.UIDynamicElement#SelectOption",
              name: "RelationOption",
              properties: {
                Value: {
                  mode: "SCRIPT",
                  value: "String(" + relationOptionValueExpression(ctx, "option", relatedValueFieldExpression) + " ?? '')"
                }
              },
              children: [
                ctx.smartTextNode("OptionText", ctx.iterationSourceValue(TOKENS.PROJECT_NAME, relationOptionLabelExpression(ctx, "option", relatedLabelFieldExpression)))
              ]
            }
          ],
          "idx"
        ),
        ctx.controlEventNode("ChangeEvent", [
          ctx.customAsyncActionNode(
            "StoreRelation",
            buildRelationValueSelectionScript(ctx, fieldNameExpression, relatedEntityKeyExpression, relatedLabelFieldExpression, relatedValueFieldExpression),
            "Store selected relation value and label into CRUD draft state."
          )
        ], {
          attrName: "(ionChange)",
          eventName: "ionChange"
        })
      ]
    };
  }

  function relationAutocompleteNode(ctx, config) {
    var currentConfig = config || {};
    var fieldLabelExpression = currentConfig.fieldLabelExpression || "this.FieldLabel";
    var fieldNameExpression = currentConfig.fieldNameExpression || "this.FieldName";
    var relatedEntityKeyExpression = currentConfig.relatedEntityKeyExpression || "this.RelatedEntityKey";
    var relatedLabelFieldExpression = currentConfig.relatedLabelFieldExpression || "this.RelatedLabelField";
    var relatedValueFieldExpression = currentConfig.relatedValueFieldExpression || "this.RelatedValueField";
    var placeholderExpression = currentConfig.placeholderExpression || ("'Select ' + " + coalescedStringExpression(ctx, fieldLabelExpression, "related value"));
    var searchKeyExpression = buildRelationSearchKeyExpression(ctx, fieldNameExpression);
    var searchExpression = ctx.crudRelationSearchExpression(searchKeyExpression);
    var rowsExpression = relationRowsExpression(ctx, relatedEntityKeyExpression);
    var optionLabelExpression = relationOptionLabelExpression(ctx, "option", relatedLabelFieldExpression);
    var visibleValueExpression = "((" + searchExpression + ") || (" + relationDraftLabelExpression(ctx, fieldNameExpression) + ") || (" + ctx.dynamicFieldAccessExpression(ctx.crudDraftExpression("this.EntityKey"), fieldNameExpression, "''") + "))";
    var optionMatchesExpression = "(String(" + optionLabelExpression + " || '').toLowerCase().indexOf(String(" + searchExpression + " || '').toLowerCase()) !== -1)";
    return {
      className: "ngx.components.UIDynamicElement#DivTag",
      name: "RelationAutocomplete",
      children: [
        {
          className: "ngx.components.UIDynamicElement#Input",
          name: "RelationAutocompleteInput",
          properties: {
            Label: {
              mode: "SCRIPT",
              value: coalescedStringExpression(ctx, fieldLabelExpression, "Related")
            },
            LabelPlacement: {
              mode: "PLAIN",
              value: "stacked"
            },
            Placeholder: {
              mode: "SCRIPT",
              value: placeholderExpression
            },
            Value: {
              mode: "SCRIPT",
              value: visibleValueExpression
            }
          },
          children: [
            ctx.controlEventNode("InputEvent", [
              ctx.customAsyncActionNode("StoreRelationSearch", buildRelationSearchUpdateScript(ctx, fieldNameExpression), "Store relation autocomplete search text into CRUD global state.")
            ], {
              attrName: "(ionInput)",
              eventName: "ionInput"
            })
          ]
        },
        ctx.ifDirectiveNode(
          "RelationAutocompleteVisible",
          "((" + rowsExpression + ").length > 0)",
          [
            {
              className: "ngx.components.UIDynamicElement#Select",
              name: "RelationAutocompleteSelect",
              properties: {
                Label: {
                  mode: "SCRIPT",
                  value: coalescedStringExpression(ctx, fieldLabelExpression, "Related")
                },
                LabelPlacement: {
                  mode: "PLAIN",
                  value: "stacked"
                },
                Placeholder: {
                  mode: "SCRIPT",
                  value: placeholderExpression
                },
                Interface: {
                  mode: "PLAIN",
                  value: "popover"
                },
                Value: {
                  mode: "SCRIPT",
                  value: ctx.dynamicFieldAccessExpression(ctx.crudDraftExpression("this.EntityKey"), fieldNameExpression, "''")
                }
              },
              children: [
                ctx.iterationDirectiveNode(
                  "RelationAutocompleteLoop",
                  TOKENS.PROJECT_NAME,
                  "option",
                  rowsExpression,
                  [
                    ctx.ifDirectiveNode(
                      "RelationAutocompleteMatch",
                      optionMatchesExpression,
                      [
                        {
                          className: "ngx.components.UIDynamicElement#SelectOption",
                          name: "RelationAutocompleteItem",
                          properties: {
                            Value: {
                              mode: "SCRIPT",
                              value: "'' + (" + relationOptionValueExpression(ctx, "option", relatedValueFieldExpression) + " ?? '')"
                            }
                          },
                          children: [
                            ctx.smartTextNode("AutocompleteOptionText", ctx.iterationSourceValue(TOKENS.PROJECT_NAME, optionLabelExpression))
                          ]
                        }
                      ]
                    )
                  ],
                  "idx"
                ),
                ctx.controlEventNode("ChangeEvent", [
                  ctx.customAsyncActionNode(
                    "StoreRelationSelection",
                    buildRelationValueSelectionScript(ctx, fieldNameExpression, relatedEntityKeyExpression, relatedLabelFieldExpression, relatedValueFieldExpression),
                    "Store the selected relation autocomplete option into CRUD draft state."
                  )
                ], {
                  attrName: "(ionChange)",
                  eventName: "ionChange"
                })
              ]
            }
          ]
        ),
        ctx.ifDirectiveNode(
          "RelationAutocompleteSelection",
          "!!" + ctx.dynamicFieldAccessExpression(ctx.crudDraftExpression("this.EntityKey"), fieldNameExpression, "''"),
          [
            ctx.textElementNode(
              "ngx.components.UIDynamicElement#Paragraph",
              "RelationAutocompleteSelectedText",
              ctx.scriptTextNode(
                "RelationAutocompleteSelectedValue",
                ctx.scriptLiteral("Selected: ") + " + (" + relationDraftLabelExpression(ctx, fieldNameExpression) + " || String(" + ctx.dynamicFieldAccessExpression(ctx.crudDraftExpression("this.EntityKey"), fieldNameExpression, "''") + "))"
              )
            )
          ]
        )
      ]
    };
  }

  function textInputNode(ctx, config) {
    var currentConfig = config || {};
    var fieldLabelExpression = currentConfig.fieldLabelExpression || "this.FieldLabel";
    var fieldNameExpression = currentConfig.fieldNameExpression || "this.FieldName";
    var requiredExpression = currentConfig.requiredExpression || "this.FieldRequired === true || this.FieldRequired === 'true'";
    return {
      className: "ngx.components.UIDynamicElement#Input",
      name: "FieldInput",
      properties: {
        Label: {
          mode: "SCRIPT",
          value: coalescedStringExpression(ctx, fieldLabelExpression, "Field")
        },
        LabelPlacement: {
          mode: "PLAIN",
          value: "stacked"
        },
        Placeholder: {
          mode: "SCRIPT",
          value: coalescedStringExpression(ctx, fieldLabelExpression, "Field")
        },
        Value: {
          mode: "SCRIPT",
          value: ctx.dynamicFieldAccessExpression(ctx.crudDraftExpression("this.EntityKey"), fieldNameExpression, "''")
        },
        Required: {
          mode: "SCRIPT",
          value: requiredExpression
        }
      },
      children: [
        ctx.controlEventNode("InputEvent", [
          ctx.customAsyncActionNode("StoreField", buildDraftFieldUpdateScript(ctx, fieldNameExpression), "Store input value into CRUD draft state.")
        ], {
          attrName: "(ionInput)",
          eventName: "ionInput"
        })
      ]
    };
  }

  function formFieldItemNode(ctx, index, fieldConfig) {
    var currentConfig = fieldConfig || {};
    var item = {
      className: "ngx.components.UIDynamicElement#FormItem",
      name: "Field" + (index + 1) + "Item",
      children: [
        currentConfig.relation
          ? ((trimmed(ctx, currentConfig.control || "select") === "autocomplete")
            ? relationAutocompleteNode(ctx, currentConfig)
            : relationSelectNode(ctx, currentConfig))
          : textInputNode(ctx, currentConfig)
      ]
    };
    return item;
  }

  function scriptLabelButtonNode(ctx, name, labelExpression, options, children) {
    var extra = options && typeof options === "object" ? options : {};
    var properties = {};
    if (extra.color) {
      properties.IonColor = {
        mode: "PLAIN",
        value: String(extra.color)
      };
    }
    if (extra.fill) {
      properties.IonFill = {
        mode: "PLAIN",
        value: String(extra.fill)
      };
    }
    return {
      className: "ngx.components.UIDynamicElement#Button",
      name: name,
      properties: properties,
      children: [ctx.scriptTextNode(name + "Text", labelExpression)].concat(ctx.ensureArray(children))
    };
  }

  function templateEntityEditFormTree(ctx) {
    var singular = TOKENS.ENTITY_SINGULAR;
    var saveQName = ctx.dashboardActionQName(TOKENS.PROJECT_NAME, "crud_save_" + singular);
    var cancelQName = ctx.dashboardActionQName(TOKENS.PROJECT_NAME, "crud_cancel_" + singular);
    var deleteQName = ctx.dashboardActionQName(TOKENS.PROJECT_NAME, "crud_delete_" + singular);
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: templateComponentName("EntityEditForm"),
      properties: {
        comment: "Template source for the CRUD entity edit form."
      },
      children: [
        ctx.compVariableNode("EntityKey", ctx.scriptLiteral(TOKENS.ENTITY_KEY)),
        ctx.compVariableNode("PrimaryField", ctx.scriptLiteral(TOKENS.PRIMARY_FIELD)),
        ctx.compVariableNode("PrimaryFieldLabel", ctx.scriptLiteral(TOKENS.PRIMARY_FIELD)),
        ctx.compVariableNode("PrimaryFieldRequired", ctx.scriptLiteral("false")),
        ctx.compVariableNode("SecondaryField", ctx.scriptLiteral(TOKENS.SECONDARY_FIELD)),
        ctx.compVariableNode("SecondaryFieldLabel", ctx.scriptLiteral(TOKENS.SECONDARY_FIELD)),
        ctx.compVariableNode("SecondaryFieldRequired", ctx.scriptLiteral("false")),
        ctx.compVariableNode("ActionLabel", ctx.scriptLiteral(TOKENS.ACTION_LABEL)),
        ctx.compVariableNode("CreateTitle", ctx.scriptLiteral("Create " + TOKENS.ENTITY_SINGULAR)),
        ctx.compVariableNode("EditTitle", ctx.scriptLiteral("Edit " + TOKENS.ENTITY_SINGULAR)),
        ctx.compVariableNode("DeleteLabel", ctx.scriptLiteral("Delete " + TOKENS.ENTITY_SINGULAR)),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: templateComponentName("EntityEditForm") + "Root",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardHeader",
              name: templateComponentName("EntityEditForm") + "Header",
              children: [
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardTitle",
                  templateComponentName("EntityEditForm") + "Title",
                  ctx.scriptTextNode("TitleText", "(" + ctx.crudModeExpression("this.EntityKey") + " === 'create' ? (this.CreateTitle || " + ctx.scriptLiteral("Create " + TOKENS.ENTITY_SINGULAR) + ") : (this.EditTitle || " + ctx.scriptLiteral("Edit " + TOKENS.ENTITY_SINGULAR) + "))")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: templateComponentName("EntityEditForm") + "Content",
              children: [
                formFieldItemNode(ctx, 0, {
                  fieldNameExpression: "this.PrimaryField",
                  fieldLabelExpression: "this.PrimaryFieldLabel",
                  requiredExpression: "this.PrimaryFieldRequired === true || this.PrimaryFieldRequired === 'true'"
                }),
                formFieldItemNode(ctx, 1, {
                  fieldNameExpression: "this.SecondaryField",
                  fieldLabelExpression: "this.SecondaryFieldLabel",
                  requiredExpression: "this.SecondaryFieldRequired === true || this.SecondaryFieldRequired === 'true'"
                }),
                ctx.scriptTextNode("FormStatus", "'Entity status: ' + (" + ctx.crudEntityStatusExpression("this.EntityKey") + ")"),
                ctx.ifDirectiveNode(
                  templateComponentName("EntityEditForm") + "ErrorVisible",
                  "!!" + ctx.crudEntityErrorExpression("this.EntityKey"),
                  [
                    ctx.textElementNode(
                      "ngx.components.UIDynamicElement#Paragraph",
                      templateComponentName("EntityEditForm") + "ErrorMessage",
                      ctx.scriptTextNode("ErrorText", ctx.crudEntityErrorExpression("this.EntityKey"))
                    )
                  ]
                ),
                scriptLabelButtonNode(
                  ctx,
                  "SaveButton",
                  "this.ActionLabel || " + ctx.scriptLiteral(TOKENS.ACTION_LABEL),
                  { color: "primary" },
                  [
                    ctx.controlEventNode("Event", [
                      ctx.dynamicInvokeNode("InvokeSave", saveQName, [])
                    ])
                  ]
                ),
                ctx.entityPagesButtonNode(
                  "CancelButton",
                  "Cancel",
                  { fill: "outline" },
                  [
                    ctx.controlEventNode("Event", [
                      ctx.dynamicInvokeNode("InvokeCancel", cancelQName, [])
                    ])
                  ]
                ),
                ctx.ifDirectiveNode(
                  templateComponentName("EntityEditForm") + "DeleteVisible",
                  "!!" + ctx.crudSelectedExpression("this.EntityKey"),
                  [
                    scriptLabelButtonNode(
                      ctx,
                      "DeleteButton",
                      "this.DeleteLabel || " + ctx.scriptLiteral("Delete " + TOKENS.ENTITY_SINGULAR),
                      { color: "danger", fill: "outline" },
                      [
                        ctx.controlEventNode("Event", [
                          ctx.dynamicInvokeNode("InvokeDelete", deleteQName, [])
                        ])
                      ]
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

  function templateSharedComponentsTree(ctx) {
    return [
      templateCrudPageHeaderTree(ctx),
      templateWorkInProgressCardTree(ctx),
      templateCrudLoadingStateTree(ctx),
      templateCrudErrorRetryStateTree(ctx),
      templateDashboardStatCardTree(ctx),
      templateEntityListPanelTree(ctx),
      templateEntityDetailCardTree(ctx),
      templateEntityEditFormTree(ctx)
    ];
  }

  function galleryPageHeaderTree(ctx, title) {
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
                ctx.plainTextNode("Text", trimmed(ctx, title) || "CRUD Templates")
              ]
            }
          ]
        }
      ]
    };
  }

  function templatesPreviewStateScript() {
    return [
      "page.global = Object.assign({}, page.global || {}, {",
      "  crudBuildStage: 'bootstrap',",
      "  crudLoading: false,",
      "  crudError: 'Preview retry state for maintainers.',",
      "  crudStatus: 'ok',",
      "  crudRows: {",
      "    templateitems: [",
      "      { ID: 1, name: 'Oak specimen', city: 'Lyon' },",
      "      { ID: 2, name: 'River reed', city: 'Nantes' },",
      "      { ID: 3, name: 'Granite fern', city: 'Annecy' }",
      "    ]",
      "  },",
      "  crudCounts: { templateitems: 3 },",
      "  crudSamples: { templateitems: { ID: 1, name: 'Oak specimen', city: 'Lyon' } },",
      "  crudSelected: { templateitems: { ID: 1, name: 'Oak specimen', city: 'Lyon' } },",
      "  crudDrafts: { templateitems: { name: 'Oak specimen', city: 'Lyon' } },",
      "  crudModes: { templateitems: 'update' },",
      "  crudEntityStatus: { templateitems: 'ready' },",
      "  crudEntityErrors: { templateitems: '' }",
      "});",
      "page.ref.markForCheck();",
      "return page.global;"
    ].join("\n");
  }

  function galleryPageShellTree(ctx, projectName, options) {
    var currentOptions = options || {};
    var headerTitle = trimmed(ctx, currentOptions.headerTitle) || "CRUD template gallery";
    var headerSubtitle = trimmed(ctx, currentOptions.headerSubtitle) || "Real shared components stored inside ConvertigoMCP.";
    var statTitle = trimmed(ctx, currentOptions.statTitle) || "Template items";
    var statCaption = trimmed(ctx, currentOptions.statCaption) || "Preview data in page.global";
    var detailTitle = trimmed(ctx, currentOptions.detailTitle) || "Template item detail";
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
          name: "TemplatesGrid",
          children: [
            {
              className: "ngx.components.UIDynamicElement#GridRow",
              name: "HeaderRow",
              children: [
                {
                  className: "ngx.components.UIDynamicElement#GridCol",
                  name: "HeaderCol",
                  children: [
                    ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, templateComponentName("CrudPageHeader")), "UseTplCrudPageHeader", [
                      ctx.useVariableNode("Title", ctx.scriptLiteral(headerTitle)),
                      ctx.useVariableNode("Subtitle", ctx.scriptLiteral(headerSubtitle))
                    ])
                  ]
                }
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#GridRow",
              name: "InfoRow",
              children: [
                {
                  className: "ngx.components.UIDynamicElement#GridCol",
                  name: "InfoCol",
                  children: [
                    ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, templateComponentName("WorkInProgressCard")), "UseTplWorkInProgressCard", [])
                  ]
                }
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#GridRow",
              name: "StateRow",
              children: [
                {
                  className: "ngx.components.UIDynamicElement#GridCol",
                  name: "StatCol",
                  children: [
                    ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, templateComponentName("DashboardStatCard")), "UseTplDashboardStatCard", [
                      ctx.useVariableNode("Title", ctx.scriptLiteral(statTitle)),
                      ctx.useVariableNode("EntityKey", ctx.scriptLiteral("templateitems")),
                      ctx.useVariableNode("Caption", ctx.scriptLiteral(statCaption))
                    ])
                  ]
                },
                {
                  className: "ngx.components.UIDynamicElement#GridCol",
                  name: "LoadingCol",
                  children: [
                    ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, templateComponentName("CrudLoadingState")), "UseTplCrudLoadingState", [])
                  ]
                },
                {
                  className: "ngx.components.UIDynamicElement#GridCol",
                  name: "ErrorCol",
                  children: [
                    ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, templateComponentName("CrudErrorRetryState")), "UseTplCrudErrorRetryState", [])
                  ]
                }
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#GridRow",
              name: "EntityRow",
              children: [
                {
                  className: "ngx.components.UIDynamicElement#GridCol",
                  name: "ListCol",
                  children: [
                    ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, templateComponentName("EntityListPanel")), "UseTplEntityListPanel", [
                      ctx.useVariableNode("Title", ctx.scriptLiteral(statTitle)),
                      ctx.useVariableNode("EntityKey", ctx.scriptLiteral("templateitems")),
                      ctx.useVariableNode("PrimaryField", ctx.scriptLiteral("name")),
                      ctx.useVariableNode("SecondaryField", ctx.scriptLiteral("city")),
                      ctx.useVariableNode("ActionLabel", ctx.scriptLiteral("Create preview item"))
                    ])
                  ]
                },
                {
                  className: "ngx.components.UIDynamicElement#GridCol",
                  name: "DetailCol",
                  children: [
                    ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, templateComponentName("EntityDetailCard")), "UseTplEntityDetailCard", [
                      ctx.useVariableNode("Title", ctx.scriptLiteral(detailTitle)),
                      ctx.useVariableNode("EntityKey", ctx.scriptLiteral("templateitems")),
                      ctx.useVariableNode("PrimaryField", ctx.scriptLiteral("name")),
                      ctx.useVariableNode("SecondaryField", ctx.scriptLiteral("city"))
                    ])
                  ]
                },
                {
                  className: "ngx.components.UIDynamicElement#GridCol",
                  name: "FormCol",
                  children: [
                    ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, templateComponentName("EntityEditForm")), "UseTplEntityEditForm", [
                      ctx.useVariableNode("EntityKey", ctx.scriptLiteral("templateitems")),
                      ctx.useVariableNode("PrimaryField", ctx.scriptLiteral("name")),
                      ctx.useVariableNode("PrimaryFieldLabel", ctx.scriptLiteral("Specimen name")),
                      ctx.useVariableNode("PrimaryFieldRequired", ctx.scriptLiteral("true")),
                      ctx.useVariableNode("SecondaryField", ctx.scriptLiteral("city")),
                      ctx.useVariableNode("SecondaryFieldLabel", ctx.scriptLiteral("City")),
                      ctx.useVariableNode("SecondaryFieldRequired", ctx.scriptLiteral("false")),
                      ctx.useVariableNode("ActionLabel", ctx.scriptLiteral("Save preview item")),
                      ctx.useVariableNode("CreateTitle", ctx.scriptLiteral("Create preview item")),
                      ctx.useVariableNode("EditTitle", ctx.scriptLiteral("Edit preview item")),
                      ctx.useVariableNode("DeleteLabel", ctx.scriptLiteral("Delete preview item"))
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

  function templatesPageRootTree(_ctx, pageName) {
    return {
      className: "ngx.components.PageComponent#PageComponent",
      name: pageName,
      properties: {
        segment: "templates",
        title: "CRUD Templates",
        isRoot: false
      }
    };
  }

  function templatesPagePatchTree(ctx, projectName, pageName) {
    return {
      qname: canonicalPageQName(ctx, projectName, pageName),
      tree: {
        properties: {
          segment: "templates",
          title: "CRUD Templates",
          scriptContent: ctx.blankPageScriptContent()
        },
        children: [
          ctx.pageEventNode(
            "PageEvent",
            "onWillLoad",
            [
              ctx.customAsyncActionNode("SeedTemplatePreview", templatesPreviewStateScript(), "Seed maintainers-only preview state for CRUD templates.")
            ],
            "Seed preview global state for the template gallery."
          ),
          galleryPageHeaderTree(ctx, "CRUD Templates"),
          galleryPageShellTree(ctx, projectName, {
            headerTitle: "CRUD template gallery",
            headerSubtitle: "Real shared components stored inside ConvertigoMCP."
          })
        ]
      }
    };
  }

  function homeGalleryPatchTree(ctx, projectName) {
    return {
      qname: canonicalPageQName(ctx, projectName, "Home"),
      tree: {
        properties: {
          title: "CRUD Templates"
        },
        children: [
          ctx.pageEventNode(
            "PageEvent",
            "onWillLoad",
            [
              ctx.customAsyncActionNode("SeedTemplatePreview", templatesPreviewStateScript(), "Seed maintainers-only preview state for CRUD templates.")
            ],
            "Seed preview global state for the template gallery."
          ),
          galleryPageHeaderTree(ctx, "CRUD Templates"),
          galleryPageShellTree(ctx, projectName, {
            headerTitle: "CRUD template gallery",
            headerSubtitle: "Preview gallery served from the root maintainer page."
          })
        ]
      }
    };
  }

  function templateLoginPageRootTree(ctx) {
    return {
      className: "ngx.components.PageComponent#PageComponent",
      name: templatePageComponentName("Login"),
      properties: {
        comment: "Template source for the generated login/session bootstrap page.",
        icon: "log-in",
        inAutoMenu: false,
        preloadPriority: "high",
        segment: "tpl-login",
        title: "Template Login",
        isRoot: false
      },
      children: [
        entityPagesHeaderTree(ctx, "Template Login"),
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
                                  ctx.plainTextNode("TitleText", "Opening the app")
                                ),
                                ctx.textElementNode(
                                  "ngx.components.UIDynamicElement#CardSubTitle",
                                  "Subtitle",
                                  ctx.plainTextNode("SubtitleText", "Authenticating the demo session before opening the CRUD home page.")
                                )
                              ]
                            },
                            {
                              className: "ngx.components.UIDynamicElement#CardContent",
                              name: "CardContent",
                              children: [
                                {
                                  className: "ngx.components.UIDynamicElement#Spinner",
                                  name: "Spinner"
                                },
                                ctx.textElementNode(
                                  "ngx.components.UIDynamicElement#Paragraph",
                                  "Hint",
                                  ctx.plainTextNode("HintText", "Please wait. The session is initialized once, then the pages call only the CRUD facades they need.")
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
        }
      ]
    };
  }

  function entityPagesHeaderTree(ctx, titleText) {
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

  function templateHomePageRootTree(ctx, projectName) {
    var sourceProject = projectName || sourceProjectName(ctx);
    var names = sourceTemplateNames();
    return {
      className: "ngx.components.PageComponent#PageComponent",
      name: templatePageComponentName("Home"),
      properties: {
        comment: "Template source for the generated CRUD home page.",
        icon: "home",
        inAutoMenu: false,
        preloadPriority: "high",
        segment: "tpl-home",
        title: "Template Home",
        isRoot: false,
        scriptContent: ctx.blankPageScriptContent()
      },
      children: [
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
                  name: "HeaderRow",
                  children: [
                    {
                      className: "ngx.components.UIDynamicElement#GridCol",
                      name: "HeaderCol",
                      children: [
                        ctx.buildUseSharedNode(ctx.sharedComponentQName(sourceProject, names.pageHeader), "UseTplCrudPageHeader", [
                          ctx.useVariableNode("Title", ctx.scriptLiteral(TOKENS.PROJECT_NAME + " CRUD home")),
                          ctx.useVariableNode("Subtitle", ctx.scriptLiteral("Open an entity page to edit live facade data."))
                        ])
                      ]
                    }
                  ]
                },
                {
                  className: "ngx.components.UIDynamicElement#GridRow",
                  name: "BootstrapRow",
                  children: [
                    {
                      className: "ngx.components.UIDynamicElement#GridCol",
                      name: "BootstrapCol",
                      children: [
                        ctx.ifDirectiveNode(
                          "BootstrapVisible",
                          "((this.global?.crudBuildStage) ?? 'bootstrap') !== 'final'",
                          [ctx.buildUseSharedNode(ctx.sharedComponentQName(sourceProject, names.workInProgress), "UseTplWorkInProgressCard", [])]
                        )
                      ]
                    }
                  ]
                },
                {
                  className: "ngx.components.UIDynamicElement#GridRow",
                  name: "RouteRow",
                  children: []
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
                          "this.global?.crudLoading === true",
                          [ctx.buildUseSharedNode(ctx.sharedComponentQName(sourceProject, names.loadingState), "UseTplCrudLoadingState", [])]
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
                          [ctx.buildUseSharedNode(ctx.sharedComponentQName(sourceProject, names.errorRetry), "UseTplCrudErrorRetryState", [])]
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
    };
  }

  function templateEntityPageRootTree(ctx, projectName) {
    var sourceProject = projectName || sourceProjectName(ctx);
    var names = sourceTemplateNames();
    return {
      className: "ngx.components.PageComponent#PageComponent",
      name: templatePageComponentName("EntityPage"),
      properties: {
        comment: "Template source for generated CRUD entity pages.",
        icon: "list",
        inAutoMenu: false,
        preloadPriority: "low",
        segment: "tpl-entity",
        title: "__DISPLAY_LABEL__",
        isRoot: false,
        scriptContent: ctx.blankPageScriptContent()
      },
      children: [
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
                  name: "PageHeaderRow",
                  children: [
                    {
                      className: "ngx.components.UIDynamicElement#GridCol",
                      name: "PageHeaderCol",
                      children: [
                        ctx.buildUseSharedNode(ctx.sharedComponentQName(sourceProject, names.pageHeader), "UseTplCrudPageHeader", [
                          ctx.useVariableNode("Title", ctx.scriptLiteral(TOKENS.DISPLAY_LABEL + " workspace")),
                          ctx.useVariableNode("Subtitle", ctx.scriptLiteral("Select, edit, create, then return to the home page if needed."))
                        ]),
                        ctx.entityPagesButtonNode("BackToHome", "Back to home", { routerPath: TOKENS.ENTRY_ROUTE, routerDirection: "back", fill: "outline" }, [])
                      ]
                    }
                  ]
                },
                {
                  className: "ngx.components.UIDynamicElement#GridRow",
                  name: "BootstrapRow",
                  children: [
                    {
                      className: "ngx.components.UIDynamicElement#GridCol",
                      name: "BootstrapCol",
                      children: [
                        ctx.ifDirectiveNode(
                          "BootstrapVisible",
                          "((this.global?.crudBuildStage) ?? 'bootstrap') !== 'final'",
                          [ctx.buildUseSharedNode(ctx.sharedComponentQName(sourceProject, names.workInProgress), "UseTplWorkInProgressCard", [])]
                        )
                      ]
                    }
                  ]
                },
                {
                  className: "ngx.components.UIDynamicElement#GridRow",
                  name: "ListRow",
                  children: [
                    {
                      className: "ngx.components.UIDynamicElement#GridCol",
                      name: "ListCol",
                      children: [
                        ctx.buildUseSharedNode(ctx.sharedComponentQName(sourceProject, names.entityListPanel), "UseTplEntityListPanel", [])
                      ]
                    }
                  ]
                },
                {
                  className: "ngx.components.UIDynamicElement#GridRow",
                  name: "DetailRow",
                  children: [
                    {
                      className: "ngx.components.UIDynamicElement#GridCol",
                      name: "DetailCol",
                      children: [
                        ctx.buildUseSharedNode(ctx.sharedComponentQName(sourceProject, names.entityDetailCard), "UseTplEntityDetailCard", [])
                      ]
                    }
                  ]
                },
                {
                  className: "ngx.components.UIDynamicElement#GridRow",
                  name: "FormRow",
                  children: [
                    {
                      className: "ngx.components.UIDynamicElement#GridCol",
                      name: "FormCol",
                      children: [
                        ctx.buildUseSharedNode(ctx.sharedComponentQName(sourceProject, names.entityEditForm), "UseTplEntityEditForm", [])
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
                          "this.global?.crudLoading === true || " + ctx.crudEntityStatusExpression(ctx.scriptLiteral(TOKENS.ENTITY_KEY)) + " === 'loading'",
                          [ctx.buildUseSharedNode(ctx.sharedComponentQName(sourceProject, names.loadingState), "UseTplCrudLoadingState", [])]
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
                          "!!this.global?.crudError || !!" + ctx.crudEntityErrorExpression(ctx.scriptLiteral(TOKENS.ENTITY_KEY)),
                          [ctx.buildUseSharedNode(ctx.sharedComponentQName(sourceProject, names.errorRetry), "UseTplCrudErrorRetryState", [])]
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
    };
  }

  function buildRefreshOperations(ctx, sourceProject, pageName, force) {
    var names = sourceTemplateNames();
    var operations = [];
    var sourceNgxAppQName = ctx.ngxAppQName(sourceProject);
    var componentTrees = templateSharedComponentsTree(ctx);
    var componentChildren = [];
    for (var i = 0; i < componentTrees.length; i++) {
      var candidate = componentTrees[i];
      var exists = ctx.resolveQName(ctx.sharedComponentQName(sourceProject, candidate.name), { optional: true }) != null;
      if (force || !exists) {
        componentChildren.push(candidate);
      }
    }
    var pageQName = canonicalPageQName(ctx, sourceProject, pageName);
    var pageExists = ctx.resolveQName(pageQName, { optional: true }) != null;
    var loginPageQName = pageTemplateQName(ctx, sourceProject, "Login");
    var homeTemplateQName = pageTemplateQName(ctx, sourceProject, "Home");
    var entityTemplateQName = pageTemplateQName(ctx, sourceProject, "EntityPage");
    var loginPageExists = ctx.resolveQName(loginPageQName, { optional: true }) != null;
    var homeTemplateExists = ctx.resolveQName(homeTemplateQName, { optional: true }) != null;
    var entityTemplateExists = ctx.resolveQName(entityTemplateQName, { optional: true }) != null;
    if (componentChildren.length) {
      operations.push({
        type: "upsertTree",
        qname: sourceNgxAppQName,
        strategy: {
          replaceOnClassMismatch: true,
          pruneMissing: false,
          reorder: false
        },
        patch: {
          children: componentChildren
        }
      });
    }
    if (force || !pageExists) {
      operations.push({
        type: "upsertTree",
        qname: sourceNgxAppQName,
        strategy: {
          replaceOnClassMismatch: true,
          pruneMissing: false,
          reorder: false
        },
        patch: {
          children: [
            templatesPageRootTree(ctx, pageName)
          ]
        }
      });
    }
    if (force || !loginPageExists) {
      operations.push({
        type: "upsertTree",
        qname: sourceNgxAppQName,
        strategy: {
          replaceOnClassMismatch: true,
          pruneMissing: false,
          reorder: false
        },
        patch: {
          children: [
            templateLoginPageRootTree(ctx)
          ]
        }
      });
    }
    if (force || !homeTemplateExists) {
      operations.push({
        type: "upsertTree",
        qname: sourceNgxAppQName,
        strategy: {
          replaceOnClassMismatch: true,
          pruneMissing: false,
          reorder: false
        },
        patch: {
          children: [
            templateHomePageRootTree(ctx, sourceProject)
          ]
        }
      });
    }
    if (force || !entityTemplateExists) {
      operations.push({
        type: "upsertTree",
        qname: sourceNgxAppQName,
        strategy: {
          replaceOnClassMismatch: true,
          pruneMissing: false,
          reorder: false
        },
        patch: {
          children: [
            templateEntityPageRootTree(ctx, sourceProject)
          ]
        }
      });
    }
    if (force || !pageExists) {
      operations.push({
        type: "upsertTree",
        qname: pageQName,
        strategy: {
          replaceOnClassMismatch: true,
          pruneMissing: false,
          reorder: false
        },
        patch: templatesPagePatchTree(ctx, sourceProject, pageName).tree
      });
    }
    if (force || !loginPageExists) {
      operations.push({
        type: "upsertTree",
        qname: loginPageQName,
        strategy: {
          replaceOnClassMismatch: true,
          pruneMissing: true,
          reorder: false
        },
        patch: templateLoginPageRootTree(ctx)
      });
    }
    if (force || !homeTemplateExists) {
      operations.push({
        type: "upsertTree",
        qname: homeTemplateQName,
        strategy: {
          replaceOnClassMismatch: true,
          pruneMissing: true,
          reorder: false
        },
        patch: templateHomePageRootTree(ctx, sourceProject)
      });
    }
    if (force || !entityTemplateExists) {
      operations.push({
        type: "upsertTree",
        qname: entityTemplateQName,
        strategy: {
          replaceOnClassMismatch: true,
          pruneMissing: true,
          reorder: false
        },
        patch: templateEntityPageRootTree(ctx, sourceProject)
      });
    }
    var homePageQName = canonicalPageQName(ctx, sourceProject, "Home");
    if (ctx.resolveQName(homePageQName, { optional: true }) != null) {
      operations.push({
        type: "upsertTree",
        qname: homePageQName,
        strategy: {
          replaceOnClassMismatch: true,
          pruneMissing: false,
          reorder: false
        },
        patch: homeGalleryPatchTree(ctx, sourceProject).tree
      });
    }
    return {
      componentNames: [
        names.pageHeader,
        names.workInProgress,
        names.loadingState,
        names.errorRetry,
        names.dashboardStat,
        names.entityListPanel,
        names.entityDetailCard,
        names.entityEditForm
      ],
      pageQName: pageQName,
      operations: operations
    };
  }

  function commonTemplateCloneSpecs() {
    var names = sourceTemplateNames();
    return [
      { source: names.pageHeader, target: "CrudPageHeader" },
      { source: names.workInProgress, target: "WorkInProgressCard" },
      { source: names.loadingState, target: "CrudLoadingState" },
      { source: names.errorRetry, target: "CrudErrorRetryState" },
      { source: names.dashboardStat, target: "DashboardStatCard" }
    ];
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
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#Paragraph",
                  componentPrefix + "RouteHint",
                  ctx.plainTextNode("RouteHintText", "Open the " + entity.label.toLowerCase() + " workspace to browse and edit live facade data.")
                ),
                ctx.entityPagesButtonNode("OpenPageButton", "Open " + entity.label, { routerPath: ctx.entityRoutePath(entity), routerDirection: "forward", color: "primary" }, [])
              ]
            }
          ]
        }
      ]
    };
  }

  function clonePageTemplateTree(ctx, sourceQName, replacements, targetName, pageName) {
    var tree = cloneTemplateTree(ctx, sourceQName, replacements || {}, targetName);
    if (!tree) {
      return null;
    }
    return markManagedPageClone(tree, pageName || targetName || tree.name);
  }

  function buildEntityPagesPageBundle(ctx, projectName, entryPage, entities, stage) {
    var sourceProject = sourceProjectName(ctx);
    var names = sourceTemplateNames();
    var warnings = [];
    var templateSourceQNames = [];
    var loginSourceQName = pageTemplateQName(ctx, sourceProject, "Login");
    var homeSourceQName = pageTemplateQName(ctx, sourceProject, "Home");
    var entitySourceQName = pageTemplateQName(ctx, sourceProject, "EntityPage");
    var commonHomeReplacements = buildCommonPageSharedReplacements(ctx, projectName);
    var homeRoute = "/" + trimmed(ctx, entryPage || "Home").toLowerCase();
    commonHomeReplacements[TOKENS.ENTRY_ROUTE] = homeRoute;
    var loginTree = clonePageTemplateTree(ctx, loginSourceQName, commonHomeReplacements, ctx.trimmed(entryPage ? "Login" : "Login"), "Login");
    var homeTree = clonePageTemplateTree(ctx, homeSourceQName, commonHomeReplacements, trimmed(ctx, entryPage || "Home"), trimmed(ctx, entryPage || "Home"));
    if (!loginTree || !homeTree) {
      warnings.push("Missing page template sources for Login or Home.");
      return null;
    }
    loginTree.properties = loginTree.properties || {};
    loginTree.properties.segment = "login";
    loginTree.properties.title = "Login";
    loginTree.properties.icon = "log-in";
    loginTree.properties.preloadPriority = "high";
    loginTree.properties.inAutoMenu = false;
    loginTree.properties.isRoot = false;
    homeTree.properties = homeTree.properties || {};
    homeTree.properties.segment = "home";
    homeTree.properties.title = trimmed(ctx, entryPage || "Home");
    homeTree.properties.icon = "home";
    homeTree.properties.preloadPriority = "high";
    homeTree.properties.inAutoMenu = true;
    var homeGrid = directChildByName(ctx, directChildByName(ctx, homeTree, "Content"), "Grid");
    var routeRow = directChildByName(ctx, homeGrid, "RouteRow");
    if (routeRow) {
      routeRow.children = entities.map(function (entity) {
        return landingRouteCardNode(ctx, entity);
      });
    }
    if (trimmed(ctx, stage).toLowerCase() === "final" && homeGrid) {
      removeDirectChildByName(ctx, homeGrid, "BootstrapRow");
    }
    var entityTrees = [];
    for (var i = 0; i < entities.length; i++) {
      var entity = entities[i];
      var entityPrefix = ctx.pascalize(entity.name);
      var replacements = buildCommonPageSharedReplacements(ctx, projectName);
      replacements[TOKENS.ENTRY_ROUTE] = homeRoute;
      replacements[TOKENS.DISPLAY_LABEL] = trimmed(ctx, entity.label || entity.name);
      replacements[TOKENS.ENTITY_SINGULAR] = trimmed(ctx, entity.singular || "entity");
      replacements[TOKENS.ENTITY_PLURAL] = trimmed(ctx, entity.name || entity.plural || ctx.pluralize(entity.singular || "entity"));
      replacements[TOKENS.ENTITY_KEY] = trimmed(ctx, entity.name || entity.plural || "entities");
      replacements[TOKENS.ROUTE_SEGMENT] = trimmed(ctx, entity.routeSegment || ctx.entityRouteSegment(entity));
      replacements[ctx.sharedComponentQName(sourceProject, names.entityListPanel)] = ctx.sharedComponentQName(projectName, entityPrefix + "ListPanel");
      replacements[ctx.sharedComponentQName(sourceProject, names.entityDetailCard)] = ctx.sharedComponentQName(projectName, entityPrefix + "DetailCard");
      replacements[ctx.sharedComponentQName(sourceProject, names.entityEditForm)] = ctx.sharedComponentQName(projectName, entityPrefix + "EditForm");
      var entityTree = clonePageTemplateTree(ctx, entitySourceQName, replacements, ctx.entityPageName(entity), ctx.entityPageName(entity));
      if (!entityTree) {
        warnings.push("Missing page template source for entity page.");
        return null;
      }
      entityTree.properties = entityTree.properties || {};
      entityTree.properties.segment = ctx.entityRouteSegment(entity);
      entityTree.properties.title = entity.label;
      entityTree.properties.icon = "list";
      entityTree.properties.preloadPriority = "low";
      entityTree.properties.inAutoMenu = true;
      if (trimmed(ctx, stage).toLowerCase() === "final") {
        var entityGrid = directChildByName(ctx, directChildByName(ctx, entityTree, "Content"), "Grid");
        if (entityGrid) {
          removeDirectChildByName(ctx, entityGrid, "BootstrapRow");
        }
      }
      entityTrees.push(entityTree);
    }
    templateSourceQNames.push(loginSourceQName, homeSourceQName, entitySourceQName);
    return {
      templateDriven: true,
      templateSourceProject: sourceProject,
      templateSourceQNames: templateSourceQNames,
      warnings: warnings,
      loginPageTree: loginTree,
      homePageTree: homeTree,
      entityPageTrees: entityTrees
    };
  }

  function buildEntityPagesSharedComponentsTree(ctx, projectName, entities, stage) {
    var names = sourceTemplateNames();
    var sourceProject = sourceProjectName(ctx);
    var children = [];
    var qnames = [];
    var warnings = [];
    var templateSourceQNames = [];
    var specs = commonTemplateCloneSpecs();
    for (var i = 0; i < specs.length; i++) {
      if (specs[i].target === "WorkInProgressCard" && trimmed(ctx, stage).toLowerCase() === "final") {
        continue;
      }
      var commonSourceQName = ctx.sharedComponentQName(sourceProject, specs[i].source);
      var commonTree = cloneTemplateTree(
        ctx,
        commonSourceQName,
        {
          "TplCrudPageHeader": specs[i].target,
          "TplWorkInProgressCard": specs[i].target,
          "TplCrudLoadingState": specs[i].target,
          "TplCrudErrorRetryState": specs[i].target,
          "TplDashboardStatCard": specs[i].target,
          [TOKENS.PROJECT_NAME]: projectName
        },
        specs[i].target
      );
      if (!commonTree) {
        warnings.push("Missing UI template source: " + specs[i].source);
        return null;
      }
      children.push(markManagedClone(commonTree, specs[i].target));
      qnames.push(ctx.sharedComponentQName(projectName, specs[i].target));
      templateSourceQNames.push(commonSourceQName);
    }
    for (var entityIndex = 0; entityIndex < entities.length; entityIndex++) {
      var entity = entities[entityIndex];
      var entityConfig = typeof ctx.entityUiConfig === "function" ? ctx.entityUiConfig(projectName, "crud", entity, entities) : null;
      var entityPrefix = ctx.pascalize(entity.name);
      var replacements = placeholderMap(ctx, projectName, entity, entities);
      var listTargetName = entityPrefix + "ListPanel";
      replacements[templateComponentName("EntityListPanel")] = listTargetName;
      var listSourceQName = ctx.sharedComponentQName(sourceProject, names.entityListPanel);
      var listTree = cloneTemplateTree(
        ctx,
        listSourceQName,
        replacements,
        listTargetName
      );
      var detailTargetName = entityPrefix + "DetailCard";
      var detailReplacements = placeholderMap(ctx, projectName, entity, entities);
      detailReplacements[templateComponentName("EntityDetailCard")] = detailTargetName;
      var detailSourceQName = ctx.sharedComponentQName(sourceProject, names.entityDetailCard);
      var detailTree = cloneTemplateTree(
        ctx,
        detailSourceQName,
        detailReplacements,
        detailTargetName
      );
      var formTargetName = entityPrefix + "EditForm";
      var formReplacements = placeholderMap(ctx, projectName, entity, entities);
      formReplacements[templateComponentName("EntityEditForm")] = formTargetName;
      var formSourceQName = ctx.sharedComponentQName(sourceProject, names.entityEditForm);
      var formTree = cloneTemplateTree(
        ctx,
        formSourceQName,
        formReplacements,
        formTargetName
      );
      if (!listTree || !detailTree || !formTree) {
        warnings.push("Missing entity template sources for " + entity.name);
        return null;
      }
      children.push(
        customizeEntityListPanelTree(ctx, listTree, listTargetName, entityConfig || {}),
        customizeEntityDetailCardTree(ctx, detailTree, detailTargetName, entityConfig || {}),
        customizeEntityEditFormTree(ctx, formTree, formTargetName, entityConfig || {}, entities, projectName)
      );
      qnames.push(
        ctx.sharedComponentQName(projectName, listTargetName),
        ctx.sharedComponentQName(projectName, detailTargetName),
        ctx.sharedComponentQName(projectName, formTargetName)
      );
      templateSourceQNames.push(listSourceQName, detailSourceQName, formSourceQName);
    }
    return {
      templateDriven: true,
      templateSourceProject: sourceProject,
      templateSourceQNames: templateSourceQNames,
      qnames: qnames,
      warnings: warnings,
      tree: {
        children: children
      }
    };
  }

  C8O.crudUiTemplates.sourceProjectName = sourceProjectName;
  C8O.crudUiTemplates.templatePageName = templatePageName;
  C8O.crudUiTemplates.buildEntityPagesPageBundle = buildEntityPagesPageBundle;
  C8O.crudUiTemplates.refreshUiTemplates = function (ctx, options) {
    var currentOptions = options || {};
    var projectName = trimmed(ctx, currentOptions.project || sourceProjectName(ctx)) || sourceProjectName(ctx);
    var pageName = trimmed(ctx, currentOptions.pageName || templatePageName(ctx)) || templatePageName(ctx);
    var force = ctx.toBoolean(currentOptions.force, false) === true;
    var result = {
      status: "success",
      project: projectName,
      pageName: pageName,
      force: force,
      warnings: []
    };
    var project = ctx.findProjectByName(projectName);
    if (!project) {
      throw new Error("Project " + projectName + " is not loaded");
    }
    var ngxApp = ctx.resolveQName(ctx.ngxAppQName(projectName), { optional: true });
    if (!ngxApp) {
      throw new Error("NGX application root not found for " + projectName);
    }
    var refreshPlan = buildRefreshOperations(ctx, projectName, pageName, force);
    result.templateComponents = refreshPlan.componentNames;
    result.pageQName = refreshPlan.pageQName;
    if (!refreshPlan.operations.length) {
      result.changed = false;
      result.message = "CRUD template gallery already present.";
      return result;
    }
    var queuedOperations = refreshPlan.operations.slice(0);
    var pagePatchOperation = null;
    if (queuedOperations.length) {
      var lastOperation = queuedOperations[queuedOperations.length - 1];
      if (trimmed(ctx, lastOperation && lastOperation.qname) === trimmed(ctx, refreshPlan.pageQName)) {
        pagePatchOperation = queuedOperations.pop();
      }
    }
    var applyResults = [];
    if (queuedOperations.length) {
      applyResults.push(ctx.batchApply({
        operations: queuedOperations,
        onError: "stop",
        autoSave: true,
        refresh: true,
        triggerMobileBuilder: false
      }));
    }
    if (pagePatchOperation) {
      applyResults.push(ctx.batchApply({
        operations: [pagePatchOperation],
        onError: "stop",
        autoSave: true,
        refresh: true,
        triggerMobileBuilder: false
      }));
    }
    result.changed = true;
    result.applySummary = {
      batches: applyResults.length
    };
    result.batchWarnings = [];
    for (var applyIndex = 0; applyIndex < applyResults.length; applyIndex++) {
      var currentApplyResult = applyResults[applyIndex];
      var currentWarnings = ctx.collectBatchWarnings(currentApplyResult) || [];
      for (var warningIndex = 0; warningIndex < currentWarnings.length; warningIndex++) {
        result.batchWarnings.push(currentWarnings[warningIndex]);
        result.warnings.push(currentWarnings[warningIndex]);
      }
    }
    var saveSummary = ctx.summarizeSaveResult(ctx.saveProject(project, result.warnings), result);
    result.saved = saveSummary.saved === true;
    result.version = saveSummary.version || "";
    result.versionBumped = saveSummary.versionBumped === true;
    result.runtimeEvidence = result.runtimeEvidence || {};
    result.runtimeEvidence.studioRefresh = ctx.refreshStudioProjectTree(project, result, "templateStudioRefresh");
    result.message = "CRUD UI templates refreshed in " + projectName + ".";
    return result;
  };
  C8O.crudUiTemplates.buildEntityPagesSharedComponentsTree = buildEntityPagesSharedComponentsTree;
})();
