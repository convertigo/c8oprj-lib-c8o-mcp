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
  var ENTITY_FORM_IDENTIFIER = "entityForm";

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

  function placeholderMap(ctx, projectName, facadePrefix, entity, entities, targetComponentName) {
    var currentEntity = entity || {};
    var resolvedFacadePrefix = trimmed(ctx, facadePrefix || "crud") || "crud";
    var uiConfig = typeof ctx.entityUiConfig === "function" ? ctx.entityUiConfig(projectName, resolvedFacadePrefix, currentEntity, entities) : null;
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
    replacements[TOKENS.FACADE_PREFIX] = resolvedFacadePrefix;
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

  function findTreeNodeByNameAndClass(node, expectedName, expectedClassName) {
    var targetName = trimmed({ trimmed: function (value) { return value == null ? "" : String(value).trim(); } }, expectedName);
    var targetClass = trimmed({ trimmed: function (value) { return value == null ? "" : String(value).trim(); } }, expectedClassName);
    var match = null;
    walkTree(node, function (current) {
      if (match || !current) {
        return;
      }
      if (String(current.name || "") === targetName && String(current.className || "") === targetClass) {
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

  function isDirectPropertyName(fieldName) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(fieldName || ""));
  }

  function propertyAccessExpression(baseExpression, fieldName) {
    var base = String(baseExpression || "row");
    var field = String(fieldName || "");
    if (isDirectPropertyName(field)) {
      return base + "." + field;
    }
    return base + "[" + JSON.stringify(field) + "]";
  }

  function iterationFieldSourceValue(ctx, projectName, fieldName) {
    return ctx.iterationSourceValue(projectName || TOKENS.PROJECT_NAME, propertyAccessExpression("row", fieldName));
  }

  function localRowSourceValue(ctx, projectName, fieldName, options) {
    return ctx.localSourceValue(projectName || TOKENS.PROJECT_NAME, "?.row?." + String(fieldName || ""), options);
  }

  function localDraftSourceValue(ctx, projectName, fieldName, options) {
    return ctx.localSourceValue(projectName || TOKENS.PROJECT_NAME, "?.draft?." + String(fieldName || ""), options);
  }

  function formControlSourceValue(ctx, projectName, controlName, options) {
    var extra = options && typeof options === "object" ? options : {};
    var controlKey = String(controlName || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    return {
      mode: "SOURCE",
      value: JSON.stringify({
        filter: "Form",
        project: projectName || TOKENS.PROJECT_NAME,
        input: trimmed(ctx, extra.input || ""),
        model: {
          data: [{ identifier: extra.formIdentifier || ENTITY_FORM_IDENTIFIER }],
          path: "?.controls?.['" + controlKey + "']?.value",
          prefix: extra.prefix == null ? "" : String(extra.prefix),
          suffix: extra.suffix == null ? "" : String(extra.suffix),
          custom: extra.custom == null ? "" : String(extra.custom),
          useCustom: false
        }
      })
    };
  }

  function extractRowsFromActionExpression(sourceExpression) {
    var source = String(sourceExpression || "out");
    return "(Array.isArray(" + source + "?.rows) ? " + source + ".rows : [])";
  }

  function firstRowFromActionExpression(sourceExpression, fallbackExpression) {
    var source = String(sourceExpression || "out");
    var rowsExpression = extractRowsFromActionExpression(source);
    var fallback = fallbackExpression == null ? "null" : String(fallbackExpression);
    return "(function(){ if (" + source + "?.row && typeof " + source + ".row === 'object') { return " + source + ".row; } var rows = " + rowsExpression + "; return rows.length ? rows[0] : " + fallback + "; })()";
  }

  function localDraftExpression() {
    return "(this.local?.draft || {})";
  }

  function dynamicFieldAccessNoFallback(objectExpression, fieldExpression) {
    return "((" + String(objectExpression || "null") + ")?.[" + String(fieldExpression || "''") + "])";
  }

  function localDraftFieldExpression(ctx, fieldExpression, fallbackExpression) {
    var fallback = fallbackExpression == null ? "''" : String(fallbackExpression);
    return ctx.dynamicFieldAccessExpression(localDraftExpression(), fieldExpression, fallback);
  }

  function localDraftFieldStringExpression(ctx, fieldExpression) {
    var access = dynamicFieldAccessNoFallback(localDraftExpression(), fieldExpression);
    return "((" + access + ") != null ? '' + (" + access + ") : '')";
  }

  function clonedSeedDraftExpression() {
    return "(function(){ try { return JSON.parse(JSON.stringify(this.DraftSeed || {})); } catch (e) { return Object.assign({}, this.DraftSeed || {}); } }).call(this)";
  }

  function selectedRowIdExpression(rowExpression) {
    var row = String(rowExpression || "row");
    return [
      "(function(){",
      "  var selectedRow = " + row + ";",
      "  var selectedId = selectedRow && selectedRow.id != null ? selectedRow.id : '';",
      "  return '' + selectedId;",
      "})()"
    ].join("\n");
  }

  function buildLocalDraftUpdateExpression(ctx, fieldNameExpression, valueExpression, labelExpression) {
    var fieldExpr = coalescedStringExpression(ctx, fieldNameExpression, "");
    var valueExpr = valueExpression == null ? "''" : String(valueExpression);
    var parts = [
      "(function(){",
      "  var draft = Object.assign({}, this.local?.draft || {});",
      "  var fieldName = " + fieldExpr + ";",
      "  var nextValue = " + valueExpr + ";",
      "  draft[fieldName] = nextValue == null ? '' : nextValue;"
    ];
    if (labelExpression) {
      parts.push("  draft[fieldName + '__label'] = ((" + labelExpression + ") == null ? '' : String(" + labelExpression + "));");
    }
    parts.push("  return draft;");
    parts.push("}).call(this)");
    return parts.join("\n");
  }

  function chainActionNodes(ctx, nodes) {
    var filtered = ensureArray(ctx, nodes).filter(function (node) {
      return !!node;
    });
    for (var index = 0; index < filtered.length - 1; index++) {
      filtered[index].children = ensureArray(ctx, filtered[index].children).concat([filtered[index + 1]]);
    }
    return filtered.length ? filtered[0] : null;
  }

  function buildDraftSeedExpression(ctx, editableFields) {
    var entries = [];
    var fields = ensureArray(ctx, editableFields);
    for (var index = 0; index < fields.length; index++) {
      var field = fields[index] || {};
      var column = trimmed(ctx, field.column || field.name);
      if (!column.length) {
        continue;
      }
      entries.push(ctx.scriptLiteral(column) + ": ''");
      if (field.relation) {
        entries.push(ctx.scriptLiteral(column + "__label") + ": ''");
      }
    }
    return "({" + entries.join(", ") + "})";
  }

  function buildDraftControlVariables(ctx, projectName, editableFields) {
    var variables = [];
    var fields = ensureArray(ctx, editableFields);
    for (var index = 0; index < fields.length; index++) {
      var field = fields[index] || {};
      var column = trimmed(ctx, field.column || field.name);
      if (!column.length) {
        continue;
      }
      variables.push(
        ctx.controlVariableNode(
          column,
          formControlSourceValue(ctx, projectName, column),
          "Forward the submitted form field " + column + "."
        )
      );
    }
    return variables;
  }

  function buildListItemLabelChildren(ctx, projectName, fields) {
    var resolvedFields = ensureArray(ctx, fields);
    var children = [];
    if (!resolvedFields.length) {
      resolvedFields = [{ column: "id", label: "Id" }];
    }
    for (var i = 0; i < resolvedFields.length; i++) {
      var field = resolvedFields[i] || {};
      var fieldLabel = trimmed(ctx, field.label || field.name || field.column || "Field");
      var fieldColumn = trimmed(ctx, field.displayColumn || field.column || field.name || "id");
      var textName = "ItemField" + (i + 1) + "Text";
      if (i === 0) {
        children.push(
          ctx.textElementNode(
            "ngx.components.UIDynamicElement#Heading2",
            "Title",
            ctx.smartTextNode(textName, iterationFieldSourceValue(ctx, projectName, fieldColumn))
          )
        );
      } else {
        children.push(
          {
            className: "ngx.components.UIDynamicElement#Paragraph",
            name: "Meta" + i,
            children: [
              ctx.plainTextNode(textName + "Prefix", fieldLabel + ": "),
              ctx.smartTextNode(textName, iterationFieldSourceValue(ctx, projectName, fieldColumn))
            ]
          }
        );
      }
    }
    return children;
  }

  function buildDetailContentChildren(ctx, projectName, fields) {
    var resolvedFields = ensureArray(ctx, fields);
    var children = [
      ctx.ifDirectiveNode(
        "EmptyVisible",
        "!this.SelectedId",
        [
          ctx.textElementNode(
            "ngx.components.UIDynamicElement#Paragraph",
            "Empty",
            ctx.plainTextNode("EmptyText", "No record selected.")
          )
        ]
      )
    ];
    if (!resolvedFields.length) {
      resolvedFields = [{ column: "id", label: "Id" }];
    }
    for (var i = 0; i < resolvedFields.length; i++) {
      var field = resolvedFields[i] || {};
      var fieldLabel = trimmed(ctx, field.label || field.name || field.column || "Field");
      var fieldColumn = trimmed(ctx, field.displayColumn || field.column || field.name || "id");
      children.push(
        ctx.ifDirectiveNode(
          "FieldVisible" + (i + 1),
          "!!this.SelectedId",
          [
            {
              className: "ngx.components.UIDynamicElement#Paragraph",
              name: "Field" + (i + 1),
              children: [
                ctx.plainTextNode("Field" + (i + 1) + "Prefix", fieldLabel + ": "),
                ctx.smartTextNode("Field" + (i + 1) + "Text", localRowSourceValue(ctx, projectName, fieldColumn))
              ]
            }
          ]
        )
      );
    }
    return children;
  }

  function relationOptionsPropertyName(column) {
    return String(column || "relation").replace(/[^A-Za-z0-9_]/g, "_") + "Options";
  }

  function relationSearchPropertyName(column) {
    return String(column || "relation").replace(/[^A-Za-z0-9_]/g, "_") + "Search";
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
        projectName: projectName,
        column: trimmed(ctx, field.column || field.name || ""),
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
        fieldConfig.optionsPropertyName = relationOptionsPropertyName(field.column || field.name || "relation");
        fieldConfig.searchPropertyName = relationSearchPropertyName(field.column || field.name || "relation");
      }
      children.push(formFieldItemNode(ctx, i, fieldConfig));
    }
    return children;
  }

  function customizeEntityListPanelTree(ctx, tree, targetName, config, projectName) {
    var labelNode = findTreeNodeByName(tree, "Label");
    if (labelNode) {
      labelNode.children = buildListItemLabelChildren(ctx, projectName, config && config.listFields);
    }
    return markManagedClone(tree, targetName);
  }

  function customizeEntityDetailCardTree(ctx, tree, targetName, config, projectName) {
    var contentNode = findTreeNodeByName(tree, "Content");
    if (contentNode) {
      contentNode.children = buildDetailContentChildren(ctx, projectName, config && config.detailFields);
    }
    return markManagedClone(tree, targetName);
  }

  function customizeEntityEditFormTree(ctx, tree, targetName, config, entities, projectName) {
    var eventNode = findTreeNodeByName(tree, "Load");
    var formNode = findTreeNodeByNameAndClass(tree, "Form", "ngx.components.UIForm#UIForm");
    if (eventNode) {
      var relationFields = ensureArray(ctx, config && config.relationFields);
      for (var relationIndex = 0; relationIndex < relationFields.length; relationIndex++) {
        var relation = relationFields[relationIndex] || {};
        var relationColumn = trimmed(ctx, relation.column || "");
        if (!relationColumn.length || !trimmed(ctx, relation.listRequestable).length) {
          continue;
        }
        eventNode.children.push(chainActionNodes(ctx, [
          ctx.callSequenceActionNode(
            "Load" + ctx.pascalize(relationColumn) + "Options",
            relation.listRequestable,
            [],
            {
              noLoading: true,
              comment: "Load local options for " + relationColumn + "."
            }
          ),
          ctx.setLocalActionNode(
            "Set" + ctx.pascalize(relationColumn) + "Options",
            relationOptionsPropertyName(relationColumn),
            extractRowsFromActionExpression("out")
          )
        ]));
      }
    }
    var draftSeedNode = findTreeNodeByName(tree, "DraftSeed");
    if (draftSeedNode) {
      draftSeedNode.properties = draftSeedNode.properties || {};
      draftSeedNode.properties.value = buildDraftSeedExpression(ctx, config && config.editableFields);
    }
    var createNode = findTreeNodeByNameAndClass(tree, "Create", "ngx.components.UIDynamicAction#CallSequenceAction");
    var updateNode = findTreeNodeByNameAndClass(tree, "Update", "ngx.components.UIDynamicAction#CallSequenceAction");
    var deleteNode = findTreeNodeByNameAndClass(tree, "Delete", "ngx.components.UIDynamicAction#CallSequenceAction");
    var loadRowNode = findTreeNodeByNameAndClass(tree, "LoadRow", "ngx.components.UIDynamicAction#CallSequenceAction");
    var editableVariables = buildDraftControlVariables(ctx, projectName, config && config.editableFields);
    function nonVariableChildren(node) {
      return ensureArray(ctx, node && node.children).filter(function (child) {
        return child && child.className !== "ngx.components.UIControlVariable#UIControlVariable";
      });
    }
    if (loadRowNode) {
      loadRowNode.children = [
        ctx.controlVariableNode("id", "String(this.SelectedId || '')")
      ].concat(nonVariableChildren(loadRowNode));
    }
    if (createNode) {
      createNode.children = editableVariables.concat(nonVariableChildren(createNode));
    }
    if (updateNode) {
      updateNode.children = [
        ctx.controlVariableNode("id", "String(this.SelectedId || '')")
      ].concat(editableVariables).concat(nonVariableChildren(updateNode));
    }
    if (deleteNode) {
      deleteNode.children = [
        ctx.controlVariableNode("id", "String(this.SelectedId || '')")
      ].concat(nonVariableChildren(deleteNode));
    }
    if (formNode) {
      var existingChildren = Array.isArray(formNode.children) ? formNode.children.slice() : [];
      var formChildren = buildFormFieldChildren(ctx, config, entities, projectName);
      if (existingChildren.length >= 2) {
        formChildren.push(existingChildren[existingChildren.length - 2]);
        formChildren.push(existingChildren[existingChildren.length - 1]);
      }
      formNode.children = formChildren;
    }
    return markManagedClone(tree, targetName);
  }

  function templateCrudPageHeaderTree(ctx) {
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
                  ctx.scriptTextNode("TitleText", "this.Title")
                ),
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardSubTitle",
                  "TplCrudPageHeaderSubtitleSlot",
                  ctx.scriptTextNode("SubtitleText", "this.Subtitle")
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
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: templateComponentName("CrudLoadingState"),
      properties: {
        comment: "Template source for the CRUD loading state card."
      },
      children: [
        ctx.compVariableNode("Message", ctx.scriptLiteral("Loading public facade rows...")),
        {
          className: "ngx.components.UIDynamicElement#Card",
          name: "TplCrudLoadingStateCard",
          children: [
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "TplCrudLoadingStateContent",
              children: [
                ctx.scriptTextNode("TplCrudLoadingStateText", "this.Message")
              ]
            }
          ]
        }
      ]
    };
  }

  function templateCrudErrorRetryStateTree(ctx) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: templateComponentName("CrudErrorRetryState"),
      properties: {
        comment: "Template source for the CRUD error/retry card."
      },
      children: [
        ctx.compVariableNode("Message", ctx.scriptLiteral("Retry if one facade call fails.")),
        ctx.compEventNode("Retry", "Retry", {
          comment: "Emitted when the user asks to retry the current CRUD state."
        }),
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
                ctx.scriptTextNode("TplCrudErrorRetryStateText", "this.Message"),
                ctx.entityPagesButtonNode(
                  "RetryButton",
                  "Retry",
                  { color: "primary" },
                  [
                    ctx.controlEventNode("Event", [
                      ctx.emitEventActionNode(
                        "EmitRetry",
                        componentEventQName(templateComponentName("CrudErrorRetryState"), "Retry"),
                        "{}"
                      )
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

  function componentEventQName(componentName, eventName) {
    return "plain:" + TOKENS.PROJECT_NAME + ".Application.NgxApp." + componentName + "." + eventName;
  }

  function relationOptionLabelExpression(ctx, optionExpression, relatedLabelFieldExpression) {
    return ctx.dynamicFieldAccessExpression(optionExpression, relatedLabelFieldExpression, ctx.scriptLiteral("Option"));
  }

  function relationOptionValueExpression(ctx, optionExpression, relatedValueFieldExpression) {
    return ctx.dynamicFieldAccessExpression(optionExpression, relatedValueFieldExpression, ctx.scriptLiteral(""));
  }

  function relationOptionsExpression(propertyName) {
    return "(this.local?." + String(propertyName || "relationOptions") + " || [])";
  }

  function relationSearchExpression(propertyName) {
    var property = String(propertyName || "relationSearch");
    return "((this.local?." + property + ") != null ? this.local?." + property + " : '')";
  }

  function relationDraftLabelExpression(ctx, fieldNameExpression) {
    var resolvedFieldNameExpression = trimmed(ctx, fieldNameExpression || "this.FieldName") || "this.FieldName";
    var labelFieldExpression = "((" + coalescedStringExpression(ctx, resolvedFieldNameExpression, "") + ") + '__label')";
    return localDraftFieldStringExpression(ctx, labelFieldExpression);
  }

  function currentRelationLabelExpression(ctx, optionsExpression, fieldNameExpression, relatedLabelFieldExpression, relatedValueFieldExpression) {
    var draftValueExpression = localDraftFieldExpression(ctx, fieldNameExpression, "''");
    var optionLabelExpression = relationOptionLabelExpression(ctx, "option", relatedLabelFieldExpression);
    var optionValueExpression = relationOptionValueExpression(ctx, "option", relatedValueFieldExpression);
    return [
      "(function(){",
      "  var rows = " + String(optionsExpression || "[]") + ";",
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

  function relationSelectNode(ctx, config) {
    var currentConfig = config || {};
    var fieldLabelExpression = currentConfig.fieldLabelExpression || "this.FieldLabel";
    var relatedLabelFieldExpression = currentConfig.relatedLabelFieldExpression || "this.RelatedLabelField";
    var relatedValueFieldExpression = currentConfig.relatedValueFieldExpression || "this.RelatedValueField";
    var placeholderExpression = currentConfig.placeholderExpression || ("'Select ' + " + coalescedStringExpression(ctx, fieldLabelExpression, "related value"));
    var optionsExpression = relationOptionsExpression(currentConfig.optionsPropertyName);
    return {
      className: "ngx.components.UIDynamicElement#Select",
      name: "RelationSelect",
      properties: {
        ControlName: {
          mode: "PLAIN",
          value: trimmed(ctx, currentConfig.column || "value")
        },
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
          value: "('' + ((" + localDraftFieldExpression(ctx, ctx.scriptLiteral(trimmed(ctx, currentConfig.column || "")), "''") + ") ?? ''))"
        }
      },
      children: [
        ctx.iterationDirectiveNode(
          "Loop",
          TOKENS.PROJECT_NAME,
          "option",
          optionsExpression,
          [
            {
              className: "ngx.components.UIDynamicElement#SelectOption",
              name: "Option",
              properties: {
                Value: {
                  mode: "SCRIPT",
                  value: "('' + ((" + relationOptionValueExpression(ctx, "option", relatedValueFieldExpression) + ") ?? ''))"
                }
              },
              children: [
                ctx.smartTextNode("Text", ctx.iterationSourceValue(TOKENS.PROJECT_NAME, relationOptionLabelExpression(ctx, "option", relatedLabelFieldExpression)))
              ]
            }
          ],
          "idx"
        )
      ]
    };
  }

  function relationAutocompleteNode(ctx, config) {
    return relationSelectNode(ctx, config);
  }

  function routeButtonNode(ctx, name, label, routerPath, options) {
    var extra = options && typeof options === "object" ? options : {};
    return ctx.entityPagesButtonNode(
      name,
      label,
      {
        color: extra.color,
        fill: extra.fill,
        routerPath: routerPath,
        routerDirection: extra.routerDirection
      }
    );
  }

  function templatePageActionQName(ctx, projectName, pageName) {
    return String(projectName || TOKENS.PROJECT_NAME) + ".Application.NgxApp.pg:" + trimmed(ctx, pageName || "Home");
  }

  function textInputNode(ctx, config) {
    var currentConfig = config || {};
    var fieldLabelExpression = currentConfig.fieldLabelExpression || "this.FieldLabel";
    var requiredExpression = currentConfig.requiredExpression || "false";
    return {
      className: "ngx.components.UIDynamicElement#Input",
      name: "Input",
      properties: {
        ControlName: {
          mode: "PLAIN",
          value: trimmed(ctx, currentConfig.column || "value")
        },
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
          value: localDraftFieldExpression(ctx, ctx.scriptLiteral(trimmed(ctx, currentConfig.column || "")), "''")
        },
        Required: {
          mode: "SCRIPT",
          value: requiredExpression
        }
      }
    };
  }

  function formFieldItemNode(ctx, index, fieldConfig) {
    var currentConfig = fieldConfig || {};
    return {
      className: "ngx.components.UIDynamicElement#FormItem",
      name: "Field" + (index + 1),
      children: [
        currentConfig.relation
          ? ((trimmed(ctx, currentConfig.control || "select") === "autocomplete")
            ? relationAutocompleteNode(ctx, currentConfig)
            : relationSelectNode(ctx, currentConfig))
          : textInputNode(ctx, currentConfig)
      ]
    };
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

  function submitButtonNode(ctx, name, labelExpression, options) {
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
      className: "ngx.components.UIDynamicElement#SubmitButton",
      name: name,
      properties: properties,
      children: [
        ctx.scriptTextNode("Text", labelExpression)
      ]
    };
  }

  function templateEntityListPanelTree(ctx) {
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: templateComponentName("EntityListPanel"),
      properties: {
        comment: "Template source for the CRUD entity list panel."
      },
      children: [
        ctx.compVariableNode("Title", ctx.scriptLiteral(TOKENS.DISPLAY_LABEL)),
        ctx.compVariableNode("PrimaryField", ctx.scriptLiteral(TOKENS.PRIMARY_FIELD)),
        ctx.compVariableNode("SecondaryField", ctx.scriptLiteral(TOKENS.SECONDARY_FIELD)),
        ctx.compVariableNode("ActionLabel", ctx.scriptLiteral("New " + TOKENS.ENTITY_SINGULAR)),
        ctx.compVariableNode("RefreshToken", ctx.scriptLiteral("")),
        ctx.compEventNode("ItemSelected", "ItemSelected", {
          comment: "Emitted when the user selects one row from the local list."
        }),
        ctx.compEventNode("NewRequested", "NewRequested", {
          comment: "Emitted when the user wants to create a new row."
        }),
        ctx.sharedComponentEventNode(
          "SharedComponent_Event",
          "onInit",
          [
            chainActionNodes(ctx, [
              ctx.setLocalActionNode("SetRows", "rows", "[]"),
              ctx.callSequenceActionNode(
                "LoadRows",
                TOKENS.PROJECT_NAME + "." + TOKENS.FACADE_PREFIX + "_list_" + TOKENS.ENTITY_PLURAL,
                [],
                {
                  noLoading: true,
                  comment: "Load the entity rows into component-local state on first render."
                }
              ),
              ctx.setLocalActionNode(
                "SetLoadedRows",
                "rows",
                "out?.rows || []"
              )
            ])
          ],
          "Initialize component-local rows once, then load them immediately."
        ),
        ctx.sharedComponentEventNode(
          "Load",
          "onChanges",
          [
            ctx.ifActionNode(
              "WhenRefreshReady",
              "!!scope?.changes?.RefreshToken && !scope?.changes?.RefreshToken.firstChange",
              [
                chainActionNodes(ctx, [
                  ctx.callSequenceActionNode(
                    "LoadRows",
                    TOKENS.PROJECT_NAME + "." + TOKENS.FACADE_PREFIX + "_list_" + TOKENS.ENTITY_PLURAL,
                    [],
                    {
                      noLoading: true,
                      comment: "Load the entity rows into component-local state."
                    }
                  ),
                  ctx.setLocalActionNode(
                    "SetRows",
                    "rows",
                    "out?.rows || []"
                  )
                ])
              ],
              {
                comment: "Reload rows only when the page explicitly bumps the refresh token."
              }
            )
          ],
          "Load the local rows whenever inputs change."
        ),
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
                  ctx.scriptTextNode("TitleText", "this.Title || " + ctx.scriptLiteral(TOKENS.DISPLAY_LABEL))
                ),
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardSubTitle",
                  "Subtitle",
                  ctx.scriptTextNode("SubtitleText", "'Rows: ' + this.local.rows.length")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "Content",
              children: [
                scriptLabelButtonNode(
                  ctx,
                  "New",
                  "this.ActionLabel || " + ctx.scriptLiteral("New " + TOKENS.ENTITY_SINGULAR),
                  { fill: "outline" },
                  [
                    ctx.controlEventNode("Event", [
                      ctx.emitEventActionNode(
                        "EmitNewRequested",
                        componentEventQName(templateComponentName("EntityListPanel"), "NewRequested"),
                        "script:{ requested: true }",
                        "Bubble the new-request event to the page glue."
                      )
                    ])
                  ]
                ),
                ctx.ifDirectiveNode(
                  "Empty",
                  ctx.localSourceValue(TOKENS.PROJECT_NAME, "?.rows", {
                    suffix: ".length === 0"
                  }),
                  [
                    ctx.textElementNode(
                      "ngx.components.UIDynamicElement#Paragraph",
                      "EmptyText",
                      ctx.plainTextNode("Text", "No rows available yet.")
                    )
                  ]
                ),
                {
                  className: "ngx.components.UIDynamicElement#List",
                  name: "List",
                  children: [
                    ctx.sourceDirectiveNode(
                      "Loop",
                      "row",
                      ctx.localSourceValue(TOKENS.PROJECT_NAME, "?.rows"),
                      [
                        {
                          className: "ngx.components.UIDynamicElement#ListItem",
                          name: "Item",
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
                              name: "Label",
                              children: [
                                ctx.textElementNode(
                                  "ngx.components.UIDynamicElement#Heading2",
                                  "Title",
                                  ctx.smartTextNode("TitleText", ctx.iterationSourceValue(TOKENS.PROJECT_NAME, "row." + TOKENS.PRIMARY_FIELD))
                                ),
                                ctx.textElementNode(
                                  "ngx.components.UIDynamicElement#Paragraph",
                                  "Meta",
                                  ctx.smartTextNode("MetaText", ctx.iterationSourceValue(TOKENS.PROJECT_NAME, "row." + TOKENS.SECONDARY_FIELD))
                                )
                              ]
                            },
                            ctx.controlEventNode("Event", [
                              ctx.emitEventActionNode(
                                "EmitItemSelected",
                                componentEventQName(templateComponentName("EntityListPanel"), "ItemSelected"),
                                "script:{ id: row?.id ?? '', row: row }",
                                "Bubble the selected row id and row payload to the page glue."
                              )
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
        ctx.compVariableNode("SelectedId", ctx.scriptLiteral("")),
        ctx.compVariableNode("RefreshToken", ctx.scriptLiteral("")),
        ctx.sharedComponentEventNode(
          "Load",
          "onChanges",
          [
            ctx.setLocalActionNode("ClearRow", "row", "null"),
            ctx.ifActionNode(
              "WhenSelected",
              "!!this.SelectedId",
              [
                chainActionNodes(ctx, [
                  ctx.callSequenceActionNode(
                    "LoadRow",
                    TOKENS.PROJECT_NAME + "." + TOKENS.FACADE_PREFIX + "_read_" + TOKENS.ENTITY_SINGULAR,
                    [
                      ctx.controlVariableNode("id", "String(this.SelectedId || '')")
                    ],
                    {
                      noLoading: true,
                      comment: "Load the selected row into component-local state."
                    }
                  ),
                  ctx.setLocalActionNode("SetRow", "row", firstRowFromActionExpression("out", "null"))
                ])
              ],
              {
                comment: "Only read the row when one id is selected."
              }
            )
          ],
          "Refresh the detail card local row when selection changes."
        ),
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
                  ctx.scriptTextNode("TitleText", "this.Title || " + ctx.scriptLiteral(TOKENS.DISPLAY_LABEL + " detail"))
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "Content",
              children: [
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#Paragraph",
                  "Primary",
                  ctx.scriptTextNode("PrimaryText", "this.SelectedId ? ('Selected id: ' + this.SelectedId) : 'No record selected.'")
                )
              ]
            }
          ]
        }
      ]
    };
  }

  function templateEntityEditFormTree(ctx) {
    var singular = TOKENS.ENTITY_SINGULAR;
    return {
      className: "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
      name: templateComponentName("EntityEditForm"),
      properties: {
        comment: "Template source for the CRUD entity edit form."
      },
      children: [
        ctx.compVariableNode("SelectedId", ctx.scriptLiteral("")),
        ctx.compVariableNode("Mode", ctx.scriptLiteral("create")),
        ctx.compVariableNode("RefreshToken", ctx.scriptLiteral("")),
        ctx.compVariableNode("DraftSeed", "{}"),
        ctx.compVariableNode("ActionLabel", ctx.scriptLiteral(TOKENS.ACTION_LABEL)),
        ctx.compVariableNode("CreateTitle", ctx.scriptLiteral("Create " + singular)),
        ctx.compVariableNode("EditTitle", ctx.scriptLiteral("Edit " + singular)),
        ctx.compVariableNode("DeleteLabel", ctx.scriptLiteral("Delete " + singular)),
        ctx.compEventNode("Saved", "Saved", {
          comment: "Emitted after a successful create or update."
        }),
        ctx.compEventNode("Deleted", "Deleted", {
          comment: "Emitted after a successful delete."
        }),
        ctx.compEventNode("Cancelled", "Cancelled", {
          comment: "Emitted when the user cancels form editing."
        }),
        ctx.sharedComponentEventNode(
          "SharedComponent_Event",
          "onInit",
          [
            ctx.setLocalActionNode("SetDraft", "draft", clonedSeedDraftExpression())
          ],
          "Initialize component-local draft once so form bindings stay safe."
        ),
        ctx.sharedComponentEventNode(
          "Load",
          "onChanges",
          [
            ctx.ifActionNode(
              "WhenCreateMode",
              "this.Mode === 'create' || !this.SelectedId",
              [
                ctx.setLocalActionNode("SetCreateDraft", "draft", clonedSeedDraftExpression())
              ],
              {
                comment: "Initialize the local draft when the page switches to create mode."
              }
            ),
            ctx.ifActionNode(
              "WhenUpdateMode",
              "this.Mode !== 'create' && !!this.SelectedId",
              [
                chainActionNodes(ctx, [
                  ctx.callSequenceActionNode(
                    "LoadRow",
                    TOKENS.PROJECT_NAME + "." + TOKENS.FACADE_PREFIX + "_read_" + singular,
                    [
                      ctx.controlVariableNode("id", "String(this.SelectedId || '')")
                    ],
                    {
                      noLoading: true,
                      comment: "Load the selected row into the local draft."
                    }
                  ),
                  ctx.setLocalActionNode("SetUpdateDraft", "draft", firstRowFromActionExpression("out", clonedSeedDraftExpression()))
                ])
              ],
              {
                comment: "Reload the local draft when the selected id changes."
              }
            )
          ],
          "Maintain the entity draft in component-local state."
        ),
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
                  ctx.scriptTextNode("TitleText", "(this.Mode === 'create' ? (this.CreateTitle || " + ctx.scriptLiteral("Create " + singular) + ") : (this.EditTitle || " + ctx.scriptLiteral("Edit " + singular) + "))")
                )
              ]
            },
            {
              className: "ngx.components.UIDynamicElement#CardContent",
              name: "Content",
              children: [
                {
                  className: "ngx.components.UIForm#UIForm",
                  name: "Form",
                  properties: {
                    identifier: ENTITY_FORM_IDENTIFIER
                  },
                  children: [
                    submitButtonNode(
                      ctx,
                      "Submit",
                      "this.ActionLabel || " + ctx.scriptLiteral(TOKENS.ACTION_LABEL),
                      { color: "primary" }
                    ),
                    ctx.controlEventNode(
                      "Submit",
                      [
                        ctx.ifActionNode(
                          "WhenCreateMode",
                          "this.Mode === 'create' || !this.SelectedId",
                          [
                            chainActionNodes(ctx, [
                              ctx.callSequenceActionNode(
                                "Create",
                                TOKENS.PROJECT_NAME + "." + TOKENS.FACADE_PREFIX + "_create_" + singular,
                                [],
                                {
                                  comment: "Create a new row from the submitted form."
                                }
                              ),
                              ctx.emitEventActionNode(
                                "EmitSaved",
                                componentEventQName(templateComponentName("EntityEditForm"), "Saved"),
                                "script:{ id: " + selectedRowIdExpression(firstRowFromActionExpression("out", localDraftExpression())) + ", mode: 'create' }",
                                "Notify the page glue that the create succeeded."
                              )
                            ])
                          ]
                        ),
                        ctx.ifActionNode(
                          "WhenUpdateMode",
                          "this.Mode !== 'create' && !!this.SelectedId",
                          [
                            chainActionNodes(ctx, [
                              ctx.callSequenceActionNode(
                                "Update",
                                TOKENS.PROJECT_NAME + "." + TOKENS.FACADE_PREFIX + "_update_" + singular,
                                [
                                  ctx.controlVariableNode("id", "String(this.SelectedId || '')")
                                ],
                                {
                                  comment: "Update the selected row from the submitted form."
                                }
                              ),
                              ctx.emitEventActionNode(
                                "EmitSaved",
                                componentEventQName(templateComponentName("EntityEditForm"), "Saved"),
                                "script:{ id: " + selectedRowIdExpression(firstRowFromActionExpression("out", "{ id: this.SelectedId || '' }")) + ", mode: 'update' }",
                                "Notify the page glue that the update succeeded."
                              )
                            ])
                          ]
                        )
                      ],
                      {
                        attrName: "(ngSubmit)",
                        eventName: "onSubmit"
                      }
                    )
                  ]
                },
                scriptLabelButtonNode(
                  ctx,
                  "Cancel",
                  ctx.scriptLiteral("Cancel"),
                  { fill: "outline" },
                  [
                    ctx.controlEventNode("Event", [
                      ctx.emitEventActionNode(
                        "EmitCancelled",
                        componentEventQName(templateComponentName("EntityEditForm"), "Cancelled"),
                        "script:{ id: this.SelectedId || '', mode: this.Mode || 'create' }",
                        "Notify the page glue that the form was cancelled."
                      )
                    ])
                  ]
                ),
                ctx.ifDirectiveNode(
                  "DeleteVisible",
                  "this.Mode !== 'create' && !!this.SelectedId",
                  [
                    scriptLabelButtonNode(
                      ctx,
                      "Delete",
                      "this.DeleteLabel || " + ctx.scriptLiteral("Delete " + singular),
                      { color: "danger", fill: "outline" },
                      [
                        ctx.controlEventNode("Event", [
                          chainActionNodes(ctx, [
                            ctx.callSequenceActionNode(
                              "Delete",
                              TOKENS.PROJECT_NAME + "." + TOKENS.FACADE_PREFIX + "_delete_" + singular,
                              [
                                ctx.controlVariableNode("id", "String(this.SelectedId || '')")
                              ],
                              {
                                comment: "Delete the selected row."
                              }
                            ),
                            ctx.emitEventActionNode(
                              "EmitDeleted",
                              componentEventQName(templateComponentName("EntityEditForm"), "Deleted"),
                              "script:{ id: this.SelectedId || '' }",
                              "Notify the page glue that the delete succeeded."
                            )
                          ])
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
                    ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, templateComponentName("CrudLoadingState")), "UseTplCrudLoadingState", [
                      ctx.useVariableNode("Message", ctx.scriptLiteral("Loading template preview..."))
                    ])
                  ]
                },
                {
                  className: "ngx.components.UIDynamicElement#GridCol",
                  name: "ErrorCol",
                  children: [
                    ctx.buildUseSharedNode(ctx.sharedComponentQName(projectName, templateComponentName("CrudErrorRetryState")), "UseTplCrudErrorRetryState", [
                      ctx.useVariableNode("Message", ctx.scriptLiteral("Preview retry state for maintainers."))
                    ])
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

  function templatesPageRootTree(ctx, projectName, pageName) {
    return {
      className: "ngx.components.PageComponent#PageComponent",
      name: pageName,
      properties: {
        segment: "templates",
        title: "CRUD Templates",
        isRoot: false,
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
    };
  }

  function homeGalleryPageRootTree(ctx, projectName) {
    return {
      className: "ngx.components.PageComponent#PageComponent",
      name: "Home",
      properties: {
        icon: "home",
        inAutoMenu: true,
        isRoot: true,
        preloadPriority: "high",
        segment: "home",
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
          headerSubtitle: "Preview gallery served from the root maintainer page."
        })
      ]
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
                        ctx.buildUseSharedNode(ctx.sharedComponentQName(sourceProject, names.pageHeader), "PageHeader", [
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
                          [ctx.buildUseSharedNode(ctx.sharedComponentQName(sourceProject, names.workInProgress), "Bootstrap", [])]
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
                          [ctx.buildUseSharedNode(ctx.sharedComponentQName(sourceProject, names.loadingState), "Loading", [
                            ctx.useVariableNode("Message", ctx.scriptLiteral("Loading public facade rows..."))
                          ])]
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
                          [ctx.buildUseSharedNode(ctx.sharedComponentQName(sourceProject, names.errorRetry), "Error", [
                            ctx.useVariableNode("Message", "this.global?.crudError || 'Retry if one facade call fails.'"),
                            ctx.controlEventNode(
                              "Retry",
                              [
                                chainActionNodes(ctx, [
                                  ctx.setGlobalActionNode("ClearCrudError", "crudError", "''"),
                                  ctx.dynamicInvokeNode("InvokeEnsureSession", ctx.dashboardActionQName(sourceProject, "crud_ensure_session"), []),
                                  ctx.dynamicInvokeNode("InvokeBootstrapDashboard", ctx.dashboardActionQName(sourceProject, "crud_bootstrap_dashboard"), [])
                                ])
                              ],
                              {
                                attrName: "(Retry)",
                                eventName: "Retry"
                              }
                            )
                          ])]
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
                  name: "HeaderRow",
                  children: [
                    {
                      className: "ngx.components.UIDynamicElement#GridCol",
                      name: "HeaderCol",
                      children: [
                        ctx.buildUseSharedNode(ctx.sharedComponentQName(sourceProject, names.pageHeader), "PageHeader", [
                          ctx.useVariableNode("Title", ctx.scriptLiteral(TOKENS.DISPLAY_LABEL + " workspace")),
                          ctx.useVariableNode("Subtitle", ctx.scriptLiteral("Select, edit, create, then return to the home page if needed."))
                        ]),
                        routeButtonNode(ctx, "Back", "Back to home", "/home", { fill: "outline", routerDirection: "back" })
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
                        ctx.buildUseSharedNode(ctx.sharedComponentQName(sourceProject, names.entityListPanel), "ListPanel", [
                          ctx.useVariableNode("Title", ctx.scriptLiteral(TOKENS.DISPLAY_LABEL)),
                          ctx.useVariableNode("PrimaryField", ctx.scriptLiteral(TOKENS.PRIMARY_FIELD)),
                          ctx.useVariableNode("SecondaryField", ctx.scriptLiteral(TOKENS.SECONDARY_FIELD)),
                          ctx.useVariableNode("ActionLabel", ctx.scriptLiteral("New " + TOKENS.ENTITY_SINGULAR)),
                          ctx.useVariableNode("RefreshToken", "(this.local?.refreshToken || '') + ''"),
                          ctx.controlEventNode(
                            "ItemSelected",
                            [
                              chainActionNodes(ctx, [
                                ctx.setLocalActionNode("SetSelectedId", "selectedId", "String(parent.out?.id ?? parent.out?.row?.id ?? '')"),
                                ctx.setLocalActionNode("SetMode", "mode", "'update'")
                              ])
                            ],
                            {
                              attrName: "(ItemSelected)",
                              eventName: "ItemSelected"
                            }
                          ),
                          ctx.controlEventNode(
                            "NewRequested",
                            [
                              chainActionNodes(ctx, [
                                ctx.setLocalActionNode("ClearSelectedId", "selectedId", "''"),
                                ctx.setLocalActionNode("SetCreateMode", "mode", "'create'")
                              ])
                            ],
                            {
                              attrName: "(NewRequested)",
                              eventName: "NewRequested"
                            }
                          )
                        ])
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
                        ctx.buildUseSharedNode(ctx.sharedComponentQName(sourceProject, names.entityDetailCard), "DetailCard", [
                          ctx.useVariableNode("Title", ctx.scriptLiteral(TOKENS.DISPLAY_LABEL + " detail")),
                          ctx.useVariableNode("SelectedId", "(this.local?.selectedId || '') + ''"),
                          ctx.useVariableNode("RefreshToken", "(this.local?.refreshToken || '') + ''")
                        ])
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
                        ctx.buildUseSharedNode(ctx.sharedComponentQName(sourceProject, names.entityEditForm), "EditForm", [
                          ctx.useVariableNode("SelectedId", "(this.local?.selectedId || '') + ''"),
                          ctx.useVariableNode("Mode", "(this.local?.mode || 'create') + ''"),
                          ctx.useVariableNode("RefreshToken", "(this.local?.refreshToken || '') + ''"),
                          ctx.controlEventNode(
                            "Saved",
                            [
                              chainActionNodes(ctx, [
                                ctx.setLocalActionNode("SetSelectedId", "selectedId", "String(parent.out?.id ?? this.local?.selectedId ?? '')"),
                                ctx.setLocalActionNode("SetMode", "mode", "'update'"),
                                ctx.setLocalActionNode("Refresh", "refreshToken", "String(Date.now())")
                              ])
                            ],
                            {
                              attrName: "(Saved)",
                              eventName: "Saved"
                            }
                          ),
                          ctx.controlEventNode(
                            "Deleted",
                            [
                              chainActionNodes(ctx, [
                                ctx.setLocalActionNode("ClearSelectedId", "selectedId", "''"),
                                ctx.setLocalActionNode("SetCreateMode", "mode", "'create'"),
                                ctx.setLocalActionNode("Refresh", "refreshToken", "String(Date.now())")
                              ])
                            ],
                            {
                              attrName: "(Deleted)",
                              eventName: "Deleted"
                            }
                          ),
                          ctx.controlEventNode(
                            "Cancelled",
                            [
                              ctx.setLocalActionNode("SetCancelMode", "mode", "this.local?.selectedId ? 'update' : 'create'")
                            ],
                            {
                              attrName: "(Cancelled)",
                              eventName: "Cancelled"
                            }
                          )
                        ])
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
    var componentTrees = templateSharedComponentsTree(ctx);
    var pageQName = canonicalPageQName(ctx, sourceProject, pageName);
    var loginPageQName = pageTemplateQName(ctx, sourceProject, "Login");
    var homeTemplateQName = pageTemplateQName(ctx, sourceProject, "Home");
    var entityTemplateQName = pageTemplateQName(ctx, sourceProject, "EntityPage");
    var homePageQName = canonicalPageQName(ctx, sourceProject, "Home");
    var pageTrees = [
      templatesPageRootTree(ctx, sourceProject, pageName),
      templateLoginPageRootTree(ctx),
      templateHomePageRootTree(ctx, sourceProject),
      templateEntityPageRootTree(ctx, sourceProject),
      homeGalleryPageRootTree(ctx, sourceProject)
    ];
    if (force) {
      var managedQNames = componentTrees.map(function (candidate) {
        return ctx.sharedComponentQName(sourceProject, candidate.name);
      }).concat([
        pageQName,
        loginPageQName,
        homeTemplateQName,
        entityTemplateQName,
        homePageQName
      ]);
      for (var deleteIndex = 0; deleteIndex < managedQNames.length; deleteIndex++) {
        if (ctx.resolveQName(managedQNames[deleteIndex], { optional: true }) != null) {
          operations.push({
            type: "delete",
            qname: managedQNames[deleteIndex]
          });
        }
      }
    }
    operations.push({
      type: "upsertTree",
      qname: ctx.ngxAppQName(sourceProject),
      strategy: {
        replaceOnClassMismatch: true,
        pruneMissing: false,
        reorder: false
      },
      patch: {
        children: componentTrees.concat(pageTrees)
      }
    });
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

  function landingRouteCardNode(ctx, projectName, entity) {
    var componentPrefix = ctx.pascalize(entity.name);
    return {
      className: "ngx.components.UIDynamicElement#GridCol",
      name: componentPrefix,
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
                  ctx.plainTextNode("Text", entity.label)
                ),
                ctx.textElementNode(
                  "ngx.components.UIDynamicElement#CardSubTitle",
                  "Subtitle",
                  ctx.scriptTextNode("Text", "'Rows: ' + (" + ctx.dashboardCountExpression(ctx.scriptLiteral(entity.name)) + ")")
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
                  ctx.plainTextNode("Text", "Open the " + entity.label.toLowerCase() + " workspace to browse and edit live facade data.")
                ),
                routeButtonNode(ctx, "Open", "Open " + entity.label, "/" + ctx.entityRouteSegment(entity), { color: "primary", routerDirection: "forward" })
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

  function buildEntityPagesPageBundle(ctx, projectName, entryPage, facadePrefix, entities, stage) {
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
        return landingRouteCardNode(ctx, projectName, entity);
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
      var entityReplacements = placeholderMap(ctx, projectName, facadePrefix, entity, entities);
      replacements[TOKENS.ENTRY_ROUTE] = homeRoute;
      var entityReplacementKeys = Object.keys(entityReplacements || {});
      for (var replacementIndex = 0; replacementIndex < entityReplacementKeys.length; replacementIndex++) {
        var replacementKey = entityReplacementKeys[replacementIndex];
        replacements[replacementKey] = entityReplacements[replacementKey];
      }
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

  function buildEntityPagesSharedComponentsTree(ctx, projectName, facadePrefix, entities, stage) {
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
      var entityConfig = typeof ctx.entityUiConfig === "function" ? ctx.entityUiConfig(projectName, facadePrefix, entity, entities) : null;
      var entityPrefix = ctx.pascalize(entity.name);
      var replacements = placeholderMap(ctx, projectName, facadePrefix, entity, entities);
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
      var detailReplacements = placeholderMap(ctx, projectName, facadePrefix, entity, entities);
      detailReplacements[templateComponentName("EntityDetailCard")] = detailTargetName;
      var detailSourceQName = ctx.sharedComponentQName(sourceProject, names.entityDetailCard);
      var detailTree = cloneTemplateTree(
        ctx,
        detailSourceQName,
        detailReplacements,
        detailTargetName
      );
      var formTargetName = entityPrefix + "EditForm";
      var formReplacements = placeholderMap(ctx, projectName, facadePrefix, entity, entities);
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
        customizeEntityListPanelTree(ctx, listTree, listTargetName, entityConfig || {}, projectName),
        customizeEntityDetailCardTree(ctx, detailTree, detailTargetName, entityConfig || {}, projectName),
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
    var expandedOperations = [];
    for (var operationIndex = 0; operationIndex < queuedOperations.length; operationIndex++) {
      var queuedOperation = queuedOperations[operationIndex];
      var operationType = trimmed(ctx, queuedOperation && queuedOperation.type).toLowerCase();
      if (operationType === "upserttree" &&
        trimmed(ctx, queuedOperation && queuedOperation.qname) === ctx.ngxAppQName(projectName) &&
        queuedOperation.patch &&
        Array.isArray(queuedOperation.patch.children) &&
        queuedOperation.patch.children.length > 1) {
        for (var childIndex = 0; childIndex < queuedOperation.patch.children.length; childIndex++) {
          var childTree = queuedOperation.patch.children[childIndex];
          expandedOperations.push({
            type: "upsertTree",
            qname: queuedOperation.qname,
            strategy: queuedOperation.strategy,
            patch: {
              children: [childTree]
            }
          });
        }
        continue;
      }
      expandedOperations.push(queuedOperation);
    }
    var applyResults = [];
    for (var expandedIndex = 0; expandedIndex < expandedOperations.length; expandedIndex++) {
      applyResults.push(ctx.batchApply({
        operations: [expandedOperations[expandedIndex]],
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
