if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.crudUiKit = C8O.crudUiKit || {};

(function () {
  if (C8O.crudUiKit._initialized === true) {
    return;
  }
  C8O.crudUiKit._initialized = true;

  function fieldLabelFromKey(ctx, rawKey) {
    var text = ctx.trimmed(rawKey);
    if (!text.length) {
      return "Field";
    }
    return text
      .replace(/_/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .replace(/^\w/, function (char) { return char.toUpperCase(); });
  }

  function optionAccessExpression(rawKey) {
    var field = String(rawKey || "id");
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(field)) {
      return "option." + field;
    }
    return "option[" + JSON.stringify(field) + "]";
  }

  function needsUiFieldHydration(ctx, entity) {
    var fields = ctx.ensureArray(entity && entity.fields);
    if (!fields.length) {
      return true;
    }
    for (var i = 0; i < fields.length; i++) {
      if (!fields[i].primary) {
        return false;
      }
    }
    return true;
  }

  function directChildByName(ctx, tree, expectedName) {
    var children = ctx.ensureArray(tree && tree.children);
    var target = ctx.trimmed(expectedName);
    for (var i = 0; i < children.length; i++) {
      if (ctx.trimmed(children[i] && children[i].name) === target) {
        return children[i];
      }
    }
    return null;
  }

  function sqlConnectorNameForProject(ctx, projectName) {
    var project = ctx.findProjectByName(projectName);
    if (!project) {
      return "";
    }
    try {
      var defaultConnector = project.getDefaultConnector ? project.getDefaultConnector() : null;
      if (defaultConnector && String(defaultConnector.getClass().getName()).indexOf("SqlConnector") !== -1) {
        return ctx.trimmed(defaultConnector.getName ? defaultConnector.getName() : "");
      }
    } catch (_ignoreDefaultConnector) {}
    try {
      var connectors = project.getConnectorsList ? project.getConnectorsList() : null;
      if (connectors) {
        for (var index = 0; index < connectors.size(); index++) {
          var connector = connectors.get(index);
          if (connector && String(connector.getClass().getName()).indexOf("SqlConnector") !== -1) {
            return ctx.trimmed(connector.getName ? connector.getName() : "");
          }
        }
      }
    } catch (_ignoreConnectors) {}
    return "";
  }

  function fallbackListTransactionRequestable(ctx, projectName, entity) {
    var connectorName = sqlConnectorNameForProject(ctx, projectName);
    var entityName = ctx.normalizedIdentifier(entity && entity.name);
    if (!connectorName.length || !entityName.length) {
      return "";
    }
    return projectName + "." + connectorName + ".list_" + entityName;
  }

  C8O.crudUiKit.normalizeUiEntities = function (ctx, rawEntities) {
    var entries = ctx.ensureArray(rawEntities);
    var normalized = [];
    for (var i = 0; i < entries.length; i++) {
      var raw = entries[i] || {};
      var naming = ctx.normalizeEntityNames(raw, "entity_" + (i + 1));
      var entityName = naming.name;
      var fields = [];
      var rawFields = ctx.ensureArray(raw.fields);
      for (var fieldIndex = 0; fieldIndex < rawFields.length; fieldIndex++) {
        var rawField = rawFields[fieldIndex] || {};
        var rawFieldName = ctx.trimmed(rawField.name || rawField.column || "");
        if (!rawFieldName.length) {
          continue;
        }
        fields.push({
          name: rawFieldName,
          column: ctx.normalizedIdentifier(rawField.column || rawFieldName),
          label: ctx.trimmed(rawField.label || rawFieldName),
          type: ctx.trimmed(rawField.type || "VARCHAR(255)"),
          primary: ctx.toBoolean(rawField.primary, false),
          unique: ctx.toBoolean(rawField.unique, false),
          required: rawField.required == null ? false : ctx.toBoolean(rawField.required, false),
          references: rawField.references && typeof rawField.references === "object" ? ctx.clone(rawField.references) : null
        });
      }
      var primaryField = null;
      for (var primaryIndex = 0; primaryIndex < fields.length; primaryIndex++) {
        if (fields[primaryIndex].primary) {
          primaryField = fields[primaryIndex];
          break;
        }
      }
      if (!primaryField && fields.length) {
        primaryField = fields[0];
      }
      normalized.push({
        name: entityName,
        singular: naming.singular,
        label: naming.displayLabel,
        displayLabel: naming.displayLabel,
        routeSegment: naming.routeSegment,
        ui: ctx.normalizeEntityUi ? ctx.normalizeEntityUi(raw.ui) : (raw.ui && typeof raw.ui === "object" ? ctx.clone(raw.ui) : {}),
        fields: fields,
        primaryField: primaryField
      });
    }
    if (!normalized.length) {
      normalized.push({
        name: "contacts",
        singular: "contact",
        label: "Contacts",
        displayLabel: "Contacts",
        routeSegment: "contacts",
        ui: {},
        fields: [
          { name: "Id", column: "id", label: "Id", type: "INT", primary: true, unique: true, required: true },
          { name: "FirstName", column: "firstname", label: "FirstName", type: "VARCHAR(128)", primary: false, unique: false, required: false },
          { name: "LastName", column: "lastname", label: "LastName", type: "VARCHAR(128)", primary: false, unique: false, required: false },
          { name: "Email", column: "email", label: "Email", type: "VARCHAR(255)", primary: false, unique: true, required: false }
        ],
        primaryField: { name: "Id", column: "id", label: "Id", type: "INT", primary: true, unique: true, required: true }
      });
      normalized.push({
        name: "companies",
        singular: "company",
        label: "Companies",
        displayLabel: "Companies",
        routeSegment: "companies",
        ui: {},
        fields: [
          { name: "Id", column: "id", label: "Id", type: "INT", primary: true, unique: true, required: true },
          { name: "Name", column: "name", label: "Name", type: "VARCHAR(255)", primary: false, unique: true, required: false },
          { name: "Industry", column: "industry", label: "Industry", type: "VARCHAR(128)", primary: false, unique: false, required: false },
          { name: "City", column: "city", label: "City", type: "VARCHAR(128)", primary: false, unique: false, required: false }
        ],
        primaryField: { name: "Id", column: "id", label: "Id", type: "INT", primary: true, unique: true, required: true }
      });
    }
    return normalized;
  };

  C8O.crudUiKit.hydrateUiEntityFromFacade = function (ctx, projectName, facadePrefix, entity, result) {
    if (!entity || !needsUiFieldHydration(ctx, entity)) {
      return entity;
    }
    var requestable = ctx.facadeSequenceQName(projectName, facadePrefix, entity, "list");
    var payload = ctx.requestablePayload(requestable, {}, result);
    var rows = ctx.collectSqlOutputRows(payload);
    if (!rows.length) {
      var fallbackRequestable = fallbackListTransactionRequestable(ctx, projectName, entity);
      if (fallbackRequestable.length) {
        payload = ctx.requestablePayload(fallbackRequestable, {}, result);
        rows = ctx.collectSqlOutputRows(payload);
      }
    }
    var firstRow = rows.length && rows[0] && typeof rows[0] === "object" ? rows[0] : null;
    if (!firstRow) {
      return entity;
    }
    var existingByColumn = {};
    var existingFields = ctx.ensureArray(entity.fields);
    for (var index = 0; index < existingFields.length; index++) {
      var existingField = existingFields[index];
      existingByColumn[ctx.normalizedIdentifier(existingField && existingField.column)] = existingField;
    }
    var hydratedFields = [];
    var rowKeys = Object.keys(firstRow);
    for (var keyIndex = 0; keyIndex < rowKeys.length; keyIndex++) {
      var rawKey = ctx.trimmed(rowKeys[keyIndex]);
      if (!rawKey.length) {
        continue;
      }
      if (/__label$/i.test(rawKey)) {
        continue;
      }
      var column = ctx.normalizedIdentifier(rawKey);
      var current = existingByColumn[column] || null;
      hydratedFields.push({
        name: current && ctx.trimmed(current.name).length ? current.name : rawKey,
        column: column,
        label: current && ctx.trimmed(current.label).length ? current.label : fieldLabelFromKey(ctx, rawKey),
        type: current && ctx.trimmed(current.type).length ? current.type : "VARCHAR(255)",
        primary: current ? ctx.toBoolean(current.primary, false) : column === "id",
        unique: current ? ctx.toBoolean(current.unique, false) : false,
        required: current ? ctx.toBoolean(current.required, false) : false,
        references: current && current.references ? ctx.clone(current.references) : null
      });
    }
    if (!hydratedFields.length) {
      return entity;
    }
    var primaryField = null;
    for (var hydratedIndex = 0; hydratedIndex < hydratedFields.length; hydratedIndex++) {
      if (hydratedFields[hydratedIndex].primary) {
        primaryField = hydratedFields[hydratedIndex];
        break;
      }
    }
    if (!primaryField) {
      primaryField = hydratedFields[0];
      primaryField.primary = true;
    }
    return {
      name: entity.name,
      singular: entity.singular,
      label: entity.label,
      displayLabel: entity.displayLabel,
      routeSegment: entity.routeSegment,
      ui: entity.ui && typeof entity.ui === "object" ? ctx.clone(entity.ui) : {},
      fields: hydratedFields,
      primaryField: primaryField
    };
  };

  C8O.crudUiKit.hydrateUiEntitiesFromFacade = function (ctx, projectName, facadePrefix, entities, result) {
    var hydrated = [];
    var list = ctx.ensureArray(entities);
    for (var i = 0; i < list.length; i++) {
      hydrated.push(C8O.crudUiKit.hydrateUiEntityFromFacade(ctx, projectName, facadePrefix, list[i], result));
    }
    return hydrated;
  };

  function safeCommentText(ctx, dbo, fallback) {
    try {
      if (dbo && typeof dbo.getComment === "function") {
        var text = ctx.trimmed(dbo.getComment());
        if (text.length) {
          return text;
        }
      }
    } catch (_ignoreComment) {}
    return ctx.trimmed(fallback || "Deterministic CRUD page refresh touch.");
  }

  function crudPageHeaderBindingOperations(ctx, projectName, result) {
    var componentQName = ctx.sharedComponentQName(projectName, "CrudPageHeader");
    var componentDbo = ctx.resolveQName(componentQName, { optional: true });
    if (!componentDbo) {
      return [];
    }
    var componentPriority = Number(ctx.priorityOf(componentDbo));
    if (!isFinite(componentPriority) || componentPriority <= 0) {
      ctx.addWarning(result, "Unable to configure CrudPageHeader shared sources: invalid component priority for " + componentQName);
      return [];
    }
    var bindings = [
      { node: "CrudPageHeaderCard.CrudPageHeaderHeader.CrudPageHeaderTitleSlot.TitleText", variable: "Title" },
      { node: "CrudPageHeaderCard.CrudPageHeaderHeader.CrudPageHeaderSubtitleSlot.SubtitleText", variable: "Subtitle" }
    ];
    var operations = [];
    for (var i = 0; i < bindings.length; i++) {
      var current = bindings[i];
      var qname = componentQName + "." + current.node;
      if (!ctx.resolveQName(qname, { optional: true })) {
        continue;
      }
      operations.push({
        type: "setProperties",
        opId: "crud_page_header_binding_" + ctx.normalizedIdentifier(current.variable),
        qname: qname,
        properties: {
          textValue: ctx.sharedSourceValue(projectName, componentPriority, current.variable)
        }
      });
    }
    return operations;
  }

  function crudLoadingStateBindingOperations(ctx, projectName, result) {
    var componentQName = ctx.sharedComponentQName(projectName, "CrudLoadingState");
    var componentDbo = ctx.resolveQName(componentQName, { optional: true });
    if (!componentDbo) {
      return [];
    }
    var componentPriority = Number(ctx.priorityOf(componentDbo));
    if (!isFinite(componentPriority) || componentPriority <= 0) {
      ctx.addWarning(result, "Unable to configure CrudLoadingState shared sources: invalid component priority for " + componentQName);
      return [];
    }
    var textQName = componentQName + ".CrudLoadingStateCard.CrudLoadingStateContent.CrudLoadingStateText";
    if (!ctx.resolveQName(textQName, { optional: true })) {
      return [];
    }
    return [{
      type: "setProperties",
      opId: "crud_loading_state_binding_message",
      qname: textQName,
      properties: {
        textValue: ctx.sharedSourceValue(projectName, componentPriority, "Message")
      }
    }];
  }

  function workInProgressCardBindingOperations(ctx, projectName, result) {
    var componentQName = ctx.sharedComponentQName(projectName, "WorkInProgressCard");
    var componentDbo = ctx.resolveQName(componentQName, { optional: true });
    if (!componentDbo) {
      return [];
    }
    var componentPriority = Number(ctx.priorityOf(componentDbo));
    if (!isFinite(componentPriority) || componentPriority <= 0) {
      ctx.addWarning(result, "Unable to configure WorkInProgressCard shared sources: invalid component priority for " + componentQName);
      return [];
    }
    var textQName = componentQName + ".WorkInProgressCardRoot.WorkInProgressCardContent.TplWorkInProgressText";
    if (!ctx.resolveQName(textQName, { optional: true })) {
      textQName = componentQName + ".WorkInProgressCardRoot.WorkInProgressCardContent.WorkInProgressText";
    }
    if (!ctx.resolveQName(textQName, { optional: true })) {
      return [];
    }
    return [{
      type: "setProperties",
      opId: "work_in_progress_binding_message",
      qname: textQName,
      properties: {
        textValue: ctx.sharedSourceValue(projectName, componentPriority, "Message")
      }
    }];
  }

  function crudErrorRetryStateBindingOperations(ctx, projectName, result) {
    var componentQName = ctx.sharedComponentQName(projectName, "CrudErrorRetryState");
    var componentDbo = ctx.resolveQName(componentQName, { optional: true });
    if (!componentDbo) {
      return [];
    }
    var componentPriority = Number(ctx.priorityOf(componentDbo));
    if (!isFinite(componentPriority) || componentPriority <= 0) {
      ctx.addWarning(result, "Unable to configure CrudErrorRetryState shared sources: invalid component priority for " + componentQName);
      return [];
    }
    var textQName = componentQName + ".CrudErrorRetryStateCard.CrudErrorRetryStateContent.CrudErrorRetryStateText";
    if (!ctx.resolveQName(textQName, { optional: true })) {
      return [];
    }
    return [{
      type: "setProperties",
      opId: "crud_error_retry_state_binding_message",
      qname: textQName,
      properties: {
        textValue: ctx.sharedSourceValue(projectName, componentPriority, "Message")
      }
    }];
  }

  function dashboardStatCardBindingOperations(ctx, projectName, result) {
    var componentQName = ctx.sharedComponentQName(projectName, "DashboardStatCard");
    var componentDbo = ctx.resolveQName(componentQName, { optional: true });
    if (!componentDbo) {
      return [];
    }
    var componentPriority = Number(ctx.priorityOf(componentDbo));
    if (!isFinite(componentPriority) || componentPriority <= 0) {
      ctx.addWarning(result, "Unable to configure DashboardStatCard shared sources: invalid component priority for " + componentQName);
      return [];
    }
    var bindings = [
      { qname: componentQName + ".DashboardStatCardCard.DashboardStatCardHeader.DashboardStatCardTitleSlot.TitleText", variable: "Title", property: "textValue" },
      { qname: componentQName + ".DashboardStatCardCard.DashboardStatCardContent.DashboardStatCardValue", variable: "Count", property: "textValue" },
      { qname: componentQName + ".DashboardStatCardCard.DashboardStatCardContent.DashboardStatCardCaption", variable: "Caption", property: "textValue" }
    ];
    var operations = [];
    for (var i = 0; i < bindings.length; i++) {
      var current = bindings[i];
      if (!ctx.resolveQName(current.qname, { optional: true })) {
        continue;
      }
      var properties = {};
      properties[current.property] = ctx.sharedSourceValue(projectName, componentPriority, current.variable);
      operations.push({
        type: "setProperties",
        opId: "dashboard_stat_binding_" + ctx.normalizedIdentifier(current.variable),
        qname: current.qname,
        properties: properties
      });
    }
    return operations;
  }

  function entityListPanelBindingOperations(ctx, projectName, entity, result) {
    var entityName = ctx.trimmed(entity && entity.name);
    if (!entityName.length) {
      return [];
    }
    var componentQName = ctx.sharedComponentQName(projectName, ctx.pascalize(entityName) + "ListPanel");
    var componentDbo = ctx.resolveQName(componentQName, { optional: true });
    if (!componentDbo) {
      return [];
    }
    var componentPriority = Number(ctx.priorityOf(componentDbo));
    if (!isFinite(componentPriority) || componentPriority <= 0) {
      ctx.addWarning(result, "Unable to configure list panel shared sources: invalid component priority for " + componentQName);
      return [];
    }
    var bindings = [
      { qname: componentQName + ".Card.Header.Title.TitleText", variable: "Title" },
      { qname: componentQName + ".Card.Content.New.NewText", variable: "ActionLabel" }
    ];
    var operations = [];
    for (var i = 0; i < bindings.length; i++) {
      var current = bindings[i];
      if (!ctx.resolveQName(current.qname, { optional: true })) {
        continue;
      }
      operations.push({
        type: "setProperties",
        opId: "list_panel_binding_" + ctx.normalizedIdentifier(entityName + "_" + current.variable),
        qname: current.qname,
        properties: {
          textValue: ctx.sharedSourceValue(projectName, componentPriority, current.variable)
        }
      });
    }
    var subtitleQName = componentQName + ".Card.Header.Subtitle.RowsCountText";
    if (!ctx.resolveQName(subtitleQName, { optional: true })) {
      subtitleQName = componentQName + ".Card.Header.Subtitle.SubtitleText";
    }
    if (ctx.resolveQName(subtitleQName, { optional: true })) {
      operations.push({
        type: "setProperties",
        opId: "list_panel_binding_" + ctx.normalizedIdentifier(entityName + "_Rows"),
        qname: subtitleQName,
        properties: {
          textValue: ctx.localSourceValue(projectName, "?.rows", {
            suffix: ".length"
          })
        }
      });
    }
    var setRowsBindings = [
      componentQName + ".SharedComponent_Event.SetRows.LoadRows.SetLoadedRows",
      componentQName + ".Load.WhenRefreshReady.LoadRows.SetRows"
    ];
    for (var setRowsIndex = 0; setRowsIndex < setRowsBindings.length; setRowsIndex++) {
      var setRowsQName = setRowsBindings[setRowsIndex];
      if (!ctx.resolveQName(setRowsQName, { optional: true })) {
        continue;
      }
      operations.push({
        type: "setProperties",
        opId: "list_panel_rows_assignment_" + ctx.normalizedIdentifier(entityName + "_" + setRowsIndex),
        qname: setRowsQName,
        properties: {
          Value: {
            mode: "SCRIPT",
            value: "out.rows"
          }
        }
      });
    }
    var emitSelectedQName = componentQName + ".Card.Content.List.Loop.Item.Event.EmitItemSelected";
    if (ctx.resolveQName(emitSelectedQName, { optional: true })) {
      operations.push({
        type: "setProperties",
        opId: "list_panel_emit_selected_" + ctx.normalizedIdentifier(entityName),
        qname: emitSelectedQName,
        properties: {
          data: {
            mode: "SCRIPT",
            value: "{ id: row.id, row: row }"
          }
        }
      });
    }
    var enabledQNames = [
      componentQName + ".Card.Content.New",
      componentQName + ".Card.Content.List.Loop.Item"
    ];
    for (var enabledIndex = 0; enabledIndex < enabledQNames.length; enabledIndex++) {
      var enabledQName = enabledQNames[enabledIndex];
      if (!ctx.resolveQName(enabledQName, { optional: true })) {
        continue;
      }
      operations.push({
        type: "setProperties",
        opId: "list_panel_enabled_" + ctx.normalizedIdentifier(entityName + "_" + enabledIndex),
        qname: enabledQName,
        properties: {
          Disabled: {
            mode: "PLAIN",
            value: "not set"
          }
        }
      });
    }
    return operations;
  }

  function entityDetailCardBindingOperations(ctx, projectName, entity, result) {
    var entityName = ctx.trimmed(entity && entity.name);
    if (!entityName.length) {
      return [];
    }
    var componentQName = ctx.sharedComponentQName(projectName, ctx.pascalize(entityName) + "DetailCard");
    var componentDbo = ctx.resolveQName(componentQName, { optional: true });
    if (!componentDbo) {
      return [];
    }
    var componentPriority = Number(ctx.priorityOf(componentDbo));
    if (!isFinite(componentPriority) || componentPriority <= 0) {
      ctx.addWarning(result, "Unable to configure detail card shared sources: invalid component priority for " + componentQName);
      return [];
    }
    var operations = [];
    var titleQName = componentQName + ".Card.Header.Title.TitleText";
    if (ctx.resolveQName(titleQName, { optional: true })) {
      operations.push({
        type: "setProperties",
        opId: "detail_card_binding_" + ctx.normalizedIdentifier(entityName + "_Title"),
        qname: titleQName,
        properties: {
          textValue: ctx.sharedSourceValue(projectName, componentPriority, "Title")
        }
      });
    }
    var loadRowIdQName = componentQName + ".Load.WhenSelected.LoadRow.id";
    if (ctx.resolveQName(loadRowIdQName, { optional: true })) {
      operations.push({
        type: "setProperties",
        opId: "detail_card_load_id_" + ctx.normalizedIdentifier(entityName),
        qname: loadRowIdQName,
        properties: {
          varValue: {
            mode: "SCRIPT",
            value: "this.SelectedId"
          }
        }
      });
    }
    var setRowQName = componentQName + ".Load.WhenSelected.LoadRow.SetRow";
    if (ctx.resolveQName(setRowQName, { optional: true })) {
      operations.push({
        type: "setProperties",
        opId: "detail_card_set_row_" + ctx.normalizedIdentifier(entityName),
        qname: setRowQName,
        properties: {
          Value: {
            mode: "SCRIPT",
            value: "out.row || (out.rows && out.rows[0]) || null"
          }
        }
      });
    }
    return operations;
  }

  function entityEditFormBindingOperations(ctx, projectName, facadePrefix, entity, entities, result) {
    var entityName = ctx.trimmed(entity && entity.name);
    if (!entityName.length) {
      return [];
    }
    var componentQName = ctx.sharedComponentQName(projectName, ctx.pascalize(entityName) + "EditForm");
    var formQName = componentQName + ".Card.Content.Form";
    var formDbo = ctx.resolveQName(formQName, { optional: true });
    if (!formDbo) {
      return [];
    }
    var formPriority = Number(ctx.priorityOf(formDbo));
    if (!isFinite(formPriority) || formPriority <= 0) {
      ctx.addWarning(result, "Unable to configure edit form sources: invalid form priority for " + formQName);
      return [];
    }
    var uiConfig = typeof ctx.entityUiConfig === "function" ? ctx.entityUiConfig(projectName, facadePrefix, entity, entities) : null;
    var editableFields = ctx.ensureArray(uiConfig && uiConfig.editableFields);
    var operations = [];
    for (var i = 0; i < editableFields.length; i++) {
      var field = editableFields[i] || {};
      var column = ctx.trimmed(field.column || field.name);
      if (!column.length) {
        continue;
      }
      var sourceValue = ctx.formSourceValue(projectName, formPriority, column, "entityForm");
      var createVarQName = componentQName + ".Card.Content.Form.Submit1.WhenCreateMode.Create." + column;
      var updateVarQName = componentQName + ".Card.Content.Form.Submit1.WhenUpdateMode.Update." + column;
      var controlQName = componentQName + ".Card.Content.Form.Field" + (i + 1) + "." + (field.relation ? "RelationSelect" : "Input");
      if (ctx.resolveQName(controlQName, { optional: true })) {
        operations.push({
          type: "setProperties",
          opId: "edit_form_control_binding_" + ctx.normalizedIdentifier(entityName + "_" + column),
          qname: controlQName,
          properties: {
            Disabled: {
              mode: "PLAIN",
              value: "not set"
            },
            Value: field.relation
              ? ctx.localSourceValue(projectName, "?.draft?." + column, { suffix: " + ''" })
              : ctx.localSourceValue(projectName, "?.draft?." + column)
          }
        });
      }
      var fieldQName = componentQName + ".Card.Content.Form.Field" + (i + 1);
      if (ctx.resolveQName(fieldQName, { optional: true })) {
        operations.push({
          type: "setProperties",
          opId: "edit_form_field_enabled_" + ctx.normalizedIdentifier(entityName + "_" + column),
          qname: fieldQName,
          properties: {
            Disabled: {
              mode: "PLAIN",
              value: "not set"
            }
          }
        });
      }
      if (field.relation) {
        var optionValueField = ctx.trimmed((field.relation && field.relation.optionValueField) || "id");
        var optionLabelField = ctx.trimmed((field.relation && field.relation.optionLabelField) || "id");
        var optionsPath = "?." + String(column || "relation").replace(/[^A-Za-z0-9_]/g, "_") + "Options";
        var relationLoopQName = controlQName + ".Loop";
        if (ctx.resolveQName(relationLoopQName, { optional: true })) {
          operations.push({
            type: "setProperties",
            opId: "edit_form_relation_loop_" + ctx.normalizedIdentifier(entityName + "_" + column),
            qname: relationLoopQName,
            properties: {
              directiveSource: ctx.localSourceValue(projectName, optionsPath)
            }
          });
        }
        var optionQName = relationLoopQName + ".Option";
        if (ctx.resolveQName(optionQName, { optional: true })) {
          operations.push({
            type: "setProperties",
            opId: "edit_form_relation_option_" + ctx.normalizedIdentifier(entityName + "_" + column),
            qname: optionQName,
            properties: {
              Disabled: {
                mode: "PLAIN",
                value: "not set"
              },
              Value: ctx.iterationSourceValue(projectName, "'' + " + optionAccessExpression(optionValueField))
            }
          });
        }
        var optionTextQName = optionQName + ".Text";
        if (ctx.resolveQName(optionTextQName, { optional: true })) {
          operations.push({
            type: "setProperties",
            opId: "edit_form_relation_option_text_" + ctx.normalizedIdentifier(entityName + "_" + column),
            qname: optionTextQName,
            properties: {
              textValue: ctx.iterationSourceValue(projectName, optionAccessExpression(optionLabelField))
            }
          });
        }
      }
      if (ctx.resolveQName(createVarQName, { optional: true })) {
        operations.push({
          type: "setProperties",
          opId: "edit_form_create_binding_" + ctx.normalizedIdentifier(entityName + "_" + column),
          qname: createVarQName,
          properties: {
            varValue: sourceValue
          }
        });
      }
      if (ctx.resolveQName(updateVarQName, { optional: true })) {
        operations.push({
          type: "setProperties",
          opId: "edit_form_update_binding_" + ctx.normalizedIdentifier(entityName + "_" + column),
          qname: updateVarQName,
          properties: {
            varValue: sourceValue
          }
        });
      }
    }
    var simpleBindings = [
      { qname: componentQName + ".SharedComponent_Event.SetDraft", property: "Value", value: "this.DraftSeed" },
      { qname: componentQName + ".Load.WhenCreateMode.SetCreateDraft", property: "Value", value: "this.DraftSeed" },
      { qname: componentQName + ".Load.WhenUpdateMode.LoadRow.id", property: "varValue", value: "this.SelectedId" },
      { qname: componentQName + ".Load.WhenUpdateMode.LoadRow.SetUpdateDraft", property: "Value", value: "out.row || (out.rows && out.rows[0]) || this.DraftSeed" },
      { qname: componentQName + ".Card.Content.Form.Submit1.WhenCreateMode.Create.EmitSaved", property: "data", value: "{ id: (out.row || (out.rows && out.rows[0]) || {}).id, mode: 'create' }" },
      { qname: componentQName + ".Card.Content.Form.Submit1.WhenUpdateMode.Update.id", property: "varValue", value: "this.SelectedId" },
      { qname: componentQName + ".Card.Content.Form.Submit1.WhenUpdateMode.Update.EmitSaved", property: "data", value: "{ id: this.SelectedId, mode: 'update' }" },
      { qname: componentQName + ".Card.Content.Form.ActionsGrid.ActionsRow.ActionsCol.Cancel.Event.EmitCancelled", property: "data", value: "{ id: this.SelectedId, mode: this.Mode }" },
      { qname: componentQName + ".Card.Content.Form.ActionsGrid.ActionsRow.ActionsCol.DeleteVisible.Delete.Event.Delete.id", property: "varValue", value: "this.SelectedId" },
      { qname: componentQName + ".Card.Content.Form.ActionsGrid.ActionsRow.ActionsCol.DeleteVisible.Delete.Event.Delete.EmitDeleted", property: "data", value: "{ id: this.SelectedId }" },
      { qname: componentQName + ".Card.Content.Form.ActionsGrid.ActionsRow.SecondaryActionCol.Cancel.Event.EmitCancelled", property: "data", value: "{ id: this.SelectedId, mode: this.Mode }" },
      { qname: componentQName + ".Card.Content.Form.ActionsGrid.ActionsRow.DangerActionCol.DeleteVisible.Delete.Event.Delete.id", property: "varValue", value: "this.SelectedId" },
      { qname: componentQName + ".Card.Content.Form.ActionsGrid.ActionsRow.DangerActionCol.DeleteVisible.Delete.Event.Delete.EmitDeleted", property: "data", value: "{ id: this.SelectedId }" },
      { qname: componentQName + ".Card.Content.Cancel.Event.EmitCancelled", property: "data", value: "{ id: this.SelectedId, mode: this.Mode }" },
      { qname: componentQName + ".Card.Content.DeleteVisible.Delete.Event.Delete.id", property: "varValue", value: "this.SelectedId" },
      { qname: componentQName + ".Card.Content.DeleteVisible.Delete.Event.Delete.EmitDeleted", property: "data", value: "{ id: this.SelectedId }" }
    ];
    for (var bindingIndex = 0; bindingIndex < simpleBindings.length; bindingIndex++) {
      var binding = simpleBindings[bindingIndex];
      if (!ctx.resolveQName(binding.qname, { optional: true })) {
        continue;
      }
      var properties = {};
      properties[binding.property] = {
        mode: "SCRIPT",
        value: binding.value
      };
      operations.push({
        type: "setProperties",
        opId: "edit_form_simple_binding_" + ctx.normalizedIdentifier(entityName + "_" + bindingIndex),
        qname: binding.qname,
        properties: properties
      });
    }
    var enabledQNames = [
      componentQName + ".Card.Content.Form.ActionsGrid.ActionsRow.ActionsCol.Submit",
      componentQName + ".Card.Content.Form.ActionsGrid.ActionsRow.ActionsCol.Cancel",
      componentQName + ".Card.Content.Form.ActionsGrid.ActionsRow.ActionsCol.DeleteVisible.Delete",
      componentQName + ".Card.Content.Form.ActionsGrid.ActionsRow.PrimaryActionCol.Submit",
      componentQName + ".Card.Content.Form.ActionsGrid.ActionsRow.SecondaryActionCol.Cancel",
      componentQName + ".Card.Content.Form.ActionsGrid.ActionsRow.DangerActionCol.DeleteVisible.Delete",
      componentQName + ".Card.Content.Form.Submit",
      componentQName + ".Card.Content.Cancel",
      componentQName + ".Card.Content.DeleteVisible.Delete"
    ];
    for (var enabledIndex = 0; enabledIndex < enabledQNames.length; enabledIndex++) {
      var enabledQName = enabledQNames[enabledIndex];
      if (!ctx.resolveQName(enabledQName, { optional: true })) {
        continue;
      }
      operations.push({
        type: "setProperties",
        opId: "edit_form_enabled_" + ctx.normalizedIdentifier(entityName + "_" + enabledIndex),
        qname: enabledQName,
        properties: {
          Disabled: {
            mode: "PLAIN",
            value: "not set"
          }
        }
      });
    }
    return operations;
  }

  function setPageRootFlagValue(pageDbo, enabled) {
    var value = !!enabled;
    var updated = false;
    var booleanObject = java.lang.Boolean.valueOf(value);
    var methodNames = ["setRoot", "setIsRoot"];
    for (var methodIndex = 0; methodIndex < methodNames.length && !updated; methodIndex++) {
      try {
        var methodName = methodNames[methodIndex];
        if (pageDbo && typeof pageDbo[methodName] === "function") {
          pageDbo[methodName](booleanObject);
          updated = true;
        }
      } catch (_ignoreSetter) {}
    }
    if (!updated) {
      try {
        pageDbo.isRoot = value;
        updated = true;
      } catch (_ignoreFieldAssign) {}
    }
    if (!updated) {
      try {
        var field = pageDbo.getClass().getField("isRoot");
        field.setBoolean(pageDbo, value);
        updated = true;
      } catch (_ignoreFieldReflect) {}
    }
    if (!updated) {
      try {
        var declaredField = pageDbo.getClass().getDeclaredField("isRoot");
        declaredField.setAccessible(true);
        declaredField.setBoolean(pageDbo, value);
        updated = true;
      } catch (_ignoreDeclaredField) {}
    }
    if (updated) {
      try {
        pageDbo.hasChanged = true;
      } catch (_ignorePageDirty) {}
      try {
        var project = pageDbo.getProject ? pageDbo.getProject() : null;
        if (project) {
          project.hasChanged = true;
        }
      } catch (_ignoreProjectDirty) {}
    }
    return updated;
  }

  function applyPageRootSelection(ctx, projectName, entryPage, result) {
    var loginQName = ctx.sessionBootstrapPageQName(projectName);
    var homeQName = ctx.pageQName(projectName, entryPage);
    var loginPage = ctx.resolveQName(loginQName, { optional: true });
    var homePage = ctx.resolveQName(homeQName, { optional: true });
    if (!loginPage) {
      ctx.addWarning(result, "Unable to set root page: login page not found for " + loginQName);
      return {
        status: "missing-login",
        target: loginQName
      };
    }
    if (!homePage) {
      ctx.addWarning(result, "Unable to set root page: entry page not found for " + homeQName);
      return {
        status: "missing-entry",
        target: homeQName
      };
    }
    var loginUpdated = setPageRootFlagValue(loginPage, true);
    var homeUpdated = setPageRootFlagValue(homePage, false);
    if (!loginUpdated || !homeUpdated) {
      if (!loginUpdated) {
        ctx.addWarning(result, "Unable to set Login as root page for " + projectName + ".");
      }
      if (!homeUpdated) {
        ctx.addWarning(result, "Unable to clear root flag on " + entryPage + " for " + projectName + ".");
      }
      return {
        status: "partial",
        loginPage: loginQName,
        entryPage: homeQName,
        loginUpdated: loginUpdated,
        entryUpdated: homeUpdated
      };
    }
    return {
      status: "ok",
      loginPage: loginQName,
      entryPage: homeQName,
      loginUpdated: true,
      entryUpdated: true
    };
  }

  function menuToolbarQName(ctx, projectName) {
    return ctx.ngxAppQName(projectName) + ".mn:Menu.Header.ToolBar";
  }

  function menuBarTitleQName(ctx, projectName) {
    return menuToolbarQName(ctx, projectName) + ".BarTitle";
  }

  function safeMenuTitleLabelTree() {
    return {
      className: "ngx.components.UIDynamicElement#Label",
      name: "Label",
      properties: {
        comment: "Menu title label",
        tagName: "ion-label"
      },
      children: [
        {
          className: "ngx.components.UIText#UIText",
          name: "Text",
          properties: {
            comment: "Translated menu title text",
            i18n: true,
            textValue: {
              mode: "PLAIN",
              value: "Navigation"
            }
          }
        }
      ]
    };
  }

  function rootMenuTitlePatchPlan(ctx, projectName) {
    var toolbarQName = menuToolbarQName(ctx, projectName);
    if (!ctx.resolveQName(toolbarQName, { optional: true })) {
      return {
        status: "missing",
        target: toolbarQName,
        operations: []
      };
    }
    var operations = [];
    if (ctx.resolveQName(menuBarTitleQName(ctx, projectName), { optional: true })) {
      operations.push({
        type: "delete",
        opId: "menu_bar_title",
        qname: menuBarTitleQName(ctx, projectName)
      });
    }
    operations.push({
      type: "upsertTree",
      opId: "menu_label",
      qname: toolbarQName,
      strategy: {
        replaceOnClassMismatch: true,
        pruneMissing: false,
        reorder: false
      },
      patch: {
        children: [safeMenuTitleLabelTree()]
      }
    });
    return {
      status: "pending",
      target: toolbarQName,
      operations: operations
    };
  }

  function legacyAppInitCleanupOperations(ctx, projectName) {
    var operations = [];
    var setLanguageQName = ctx.ngxAppQName(projectName) + ".ev:AppEvent.SetLanguage";
    if (ctx.resolveQName(setLanguageQName, { optional: true })) {
      operations.push({
        type: "delete",
        opId: "delete_legacy_set_language",
        qname: setLanguageQName
      });
    }
    return operations;
  }

  function touchManagedCrudPages(ctx, projectName, pageQNames, result) {
    var unique = {};
    var qnames = [];
    var operations = [];
    var entries = ctx.ensureArray(pageQNames);
    for (var i = 0; i < entries.length; i++) {
      var qname = ctx.trimmed(entries[i]);
      if (!qname.length || unique[qname]) {
        continue;
      }
      unique[qname] = true;
      var dbo = ctx.resolveQName(qname, { optional: true });
      if (!dbo) {
        ctx.addWarning(result, "Unable to touch CRUD page source: page not found for " + qname);
        continue;
      }
      qnames.push(qname);
      operations.push({
        type: "setProperties",
        opId: "touch_" + ctx.normalizedIdentifier(qname),
        qname: qname,
        properties: {
          comment: safeCommentText(ctx, dbo, "Deterministic CRUD page refresh touch.")
        }
      });
    }
    if (!operations.length) {
      return {
        status: "skipped",
        target: ctx.pageQName(projectName, "Home"),
        touchedQNames: []
      };
    }
    var batchResult = ctx.batchApply({
      target: qnames[0],
      strict: true,
      onError: "stop",
      autoSave: true,
      triggerMobileBuilder: true,
      operations: operations
    });
    ctx.collectBatchWarnings(batchResult, result, "pageTouchRefresh");
    if (!batchResult || batchResult.status === "failed" || (batchResult.errors && batchResult.errors.length)) {
      throw new Error(ctx.firstBatchErrorMessage(batchResult));
    }
    var summary = ctx.summarizeTreeApplyResult(batchResult, qnames[0], result);
    summary.touchedQNames = qnames;
    var stats = summary.summary || {};
    if ((summary.status === "success" || summary.status === "partial") &&
      Number(stats.failedOps || 0) === 0 &&
      Number(stats.notRunOps || 0) === 0 &&
      Number(stats.successfulOps || 0) === Number(qnames.length)) {
      summary.status = "ok";
    }
    return summary;
  }

  function operationGroupSummary(ctx, batchResult, opIds, target) {
    var operations = batchResult && Array.isArray(batchResult.operations) ? batchResult.operations : [];
    var wanted = {};
    var matched = 0;
    var appliedCount = 0;
    var failedCount = 0;
    var partialCount = 0;
    var unknownCount = 0;
    for (var i = 0; i < ctx.ensureArray(opIds).length; i++) {
      wanted[String(opIds[i])] = true;
    }
    for (var operationIndex = 0; operationIndex < operations.length; operationIndex++) {
      var operation = operations[operationIndex] || {};
      var opId = String(operation.opId || "");
      if (!wanted[opId]) {
        continue;
      }
      matched += 1;
      appliedCount += Array.isArray(operation.applied) ? operation.applied.length : 0;
      var status = ctx.trimmed(operation.status).toLowerCase();
      if (status === "failed") {
        failedCount += 1;
      } else if (status === "partial") {
        partialCount += 1;
      } else if (!status.length || status === "unknown") {
        unknownCount += 1;
      }
    }
    return {
      status: failedCount > 0 ? "failed" : (partialCount > 0 ? "partial" : (matched === 0 ? "unknown" : "success")),
      target: target,
      matchedOps: matched,
      expectedOps: Object.keys(wanted).length,
      appliedCount: appliedCount,
      unknownOps: unknownCount
    };
  }

  function ensureEntryPage(ctx, projectName, entryPage, result) {
    var requestedName = ctx.trimmed(entryPage || "Home") || "Home";
    var requestedContentQName = ctx.findPageContentQName(projectName, requestedName);
    if (ctx.resolveQName(requestedContentQName, { optional: true })) {
      return requestedName;
    }
    if (requestedName === "Home") {
      var legacyPageQName = ctx.pageQName(projectName, "Page");
      var legacyContentQName = ctx.findPageContentQName(projectName, "Page");
      if (ctx.resolveQName(legacyContentQName, { optional: true })) {
        var renameResult = ctx.renameObject({
          qname: legacyPageQName,
          name: requestedName,
          update: "update_local"
        });
        if (!renameResult || renameResult.renamed !== true) {
          throw new Error("Unable to rename starter entry page Page to Home for " + projectName);
        }
        ctx.addWarning(result, "Renamed starter entry page Page to Home for " + projectName + ".");
        return requestedName;
      }
    }
    return requestedName;
  }

  function appShellImportPatchLines() {
    return [
      "import { IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenu, IonRouterLink } from '@ionic/angular/standalone';",
      "import { RouterLink } from '@angular/router';"
    ];
  }

  function currentAppComponentScriptContent(ctx, projectName) {
    try {
      var payload = ctx.callInternalSequence("tools_databaseobject_tree_get", {
        target: ctx.ngxAppQName(projectName),
        childrenDepth: 0,
        properties: "all",
        limit: 1
      });
      return ctx.trimmed(payload && payload.tree && payload.tree.properties && payload.tree.properties.componentScriptContent || "");
    } catch (_ignoreAppComponentScriptContent) {
      return "";
    }
  }

  function mergeAppImportBlock(scriptContent, lines) {
    var text = String(scriptContent || "");
    var importLines = [];
    for (var i = 0; i < lines.length; i++) {
      var line = String(lines[i] || "");
      if (!line.length || text.indexOf(line) !== -1) {
        continue;
      }
      importLines.push(line);
    }
    if (!importLines.length) {
      return {
        changed: false,
        value: text
      };
    }
    var beginMarker = "/*Begin_c8o_AppImport*/";
    var endMarker = "/*End_c8o_AppImport*/";
    var blockPattern = /\/\*Begin_c8o_AppImport\*\/[\s\S]*?\/\*End_c8o_AppImport\*\//;
    var normalizedInsert = beginMarker + "\n" + importLines.join("\n") + "\n" + endMarker;
    if (blockPattern.test(text)) {
      return {
        changed: true,
        value: text.replace(blockPattern, function (block) {
          return block.replace(endMarker, importLines.join("\n") + "\n" + endMarker);
        })
      };
    }
    return {
      changed: true,
      value: normalizedInsert + (text.length ? ("\n" + text) : "")
    };
  }

  C8O.crudUiKit.upsertNgxCrudKit = function (ctx, options) {
    var startedAt = ctx.nowMillis();
    var result = {
      status: "success",
      project: "",
      sharedComponents: [],
      pageTargets: [],
      runtimeEvidence: {},
      warnings: []
    };
    var projectName = ctx.trimmed(options.project);
    if (!projectName.length) {
      throw new Error("project is required");
    }
    result.project = projectName;
    var project = ctx.findProjectByName(projectName);
    if (!project) {
      throw new Error("Project " + projectName + " is not loaded");
    }
    var facadePrefix = ctx.trimmed(options.facadePrefix || "crud");
    var entities = C8O.crudUiKit.hydrateUiEntitiesFromFacade(
      ctx,
      projectName,
      facadePrefix,
      C8O.crudUiKit.normalizeUiEntities(ctx, options.entities),
      result
    );
    var entryPage = ensureEntryPage(ctx, projectName, options.entryPage || "Home", result);
    var variant = ctx.trimmed(options.variant || "entity-pages").toLowerCase() || "entity-pages";
    var stage = ctx.trimmed(options.stage || "final").toLowerCase() || "final";
    var isMasterDetail = variant === "master-detail";
    var isEntityPages = variant === "entity-pages";
    var contentQName = ctx.findPageContentQName(projectName, entryPage);
    var ngxApp = ctx.resolveQName(ctx.ngxAppQName(projectName), { optional: true });
    var contentDbo = ctx.resolveQName(contentQName, { optional: true });
    if (!ngxApp) {
      throw new Error("NGX application root not found for " + projectName);
    }
    if (!contentDbo) {
      throw new Error("Entry page content not found for " + projectName + ": " + contentQName);
    }
    var timings = {};
    result.runtimeEvidence.timings = timings;
    result.runtimeEvidence.variant = variant;
    result.runtimeEvidence.stage = stage;
    result.runtimeEvidence.mutationCounts = {
      created: 0,
      updated: 0
    };
    var sharedBuildStartedAt = ctx.nowMillis();
    var sharedComponents = isMasterDetail
      ? ctx.buildCrmSharedComponentsTree(projectName, stage)
      : (isEntityPages ? ctx.buildEntityPagesSharedComponentsTree(projectName, facadePrefix, entities, stage) : ctx.buildDashboardSharedComponentsTree(projectName, entities, stage));
    var sharedActions = isMasterDetail
      ? ctx.buildCrmActionStacksTree(projectName, facadePrefix, stage)
      : (isEntityPages ? ctx.buildEntityPagesActionStacksTree(projectName, facadePrefix, entities, stage) : ctx.buildDashboardActionStacksTree(projectName, facadePrefix, entities, stage));
    // Entity page shared components encode the configured fields and relation controls.
    // Reapply them on final passes so UI hint changes cannot be masked by existing QNames.
    var reuseExistingSharedComponents = stage === "final" && !isEntityPages && ctx.everyQNameExists(sharedComponents.qnames);
    var reuseExistingSharedActions = !isEntityPages && stage === "final" && ctx.everyQNameExists(sharedActions.qnames);
    var sharedComponentChildren = reuseExistingSharedComponents ? [] : ctx.ensureArray(sharedComponents.tree.children);
    var sharedActionChildren = reuseExistingSharedActions ? [] : ctx.ensureArray(sharedActions.tree.children);
    ctx.setDuration(timings, "buildSharedComponentsMs", sharedBuildStartedAt);
    result.runtimeEvidence.sharedComponentsRequested = ctx.ensureArray(sharedComponents.tree.children).length;
    result.runtimeEvidence.sharedComponentTreeNodeCount = ctx.countTreeNodes(sharedComponents.tree);
    result.runtimeEvidence.templateDriven = sharedComponents.templateDriven === true;
    result.runtimeEvidence.templateSourceProject = ctx.trimmed(sharedComponents.templateSourceProject || "");
    result.runtimeEvidence.templateSourceQNames = ctx.ensureArray(sharedComponents.templateSourceQNames);
    result.runtimeEvidence.sharedActionsRequested = ctx.ensureArray(sharedActions.tree.children).length;
    result.runtimeEvidence.sharedActionTreeNodeCount = ctx.countTreeNodes(sharedActions.tree);
    result.runtimeEvidence.sharedComponentsReused = reuseExistingSharedComponents;
    result.runtimeEvidence.sharedActionsReused = reuseExistingSharedActions;
    result.runtimeEvidence.uiGlobals = ctx.statefulUiGlobals(variant);
    result.runtimeEvidence.workInProgressMode = "stateful-visibility";
    var pageTemplates = isEntityPages ? ctx.buildEntityPagesPageBundle(projectName, entryPage, facadePrefix, entities, stage) : null;
    if (pageTemplates && pageTemplates.warnings && pageTemplates.warnings.length) {
      for (var pageTemplateWarningIndex = 0; pageTemplateWarningIndex < pageTemplates.warnings.length; pageTemplateWarningIndex++) {
        ctx.addWarning(result, pageTemplates.warnings[pageTemplateWarningIndex]);
      }
    }
    result.runtimeEvidence.pageTemplateDriven = !!(pageTemplates && pageTemplates.templateDriven === true);
    result.runtimeEvidence.pageTemplateSourceProject = ctx.trimmed(pageTemplates && pageTemplates.templateSourceProject);
    result.runtimeEvidence.pageTemplateSourceQNames = ctx.ensureArray(pageTemplates && pageTemplates.templateSourceQNames);
    var pageShellStartedAt = ctx.nowMillis();
    var pageShellTree = isMasterDetail
      ? ctx.buildCrmMasterDetailPageShellTree(projectName, stage)
      : (isEntityPages && pageTemplates && pageTemplates.homePageTree
          ? pageTemplates.homePageTree
          : (isEntityPages ? ctx.buildEntityPagesLandingShellTree(projectName, entities, stage) : ctx.buildDashboardPageShellTree(projectName, entities, stage)));
    ctx.setDuration(timings, "buildPageShellTreeMs", pageShellStartedAt);
    result.runtimeEvidence.pageShellTreeNodeCount = ctx.countTreeNodes(pageShellTree);
    var pageLoadStartedAt = ctx.nowMillis();
    var pageLoadTree = isMasterDetail
      ? ctx.buildCrmPageLoadTree(projectName, entryPage, stage)
      : (isEntityPages ? ctx.buildEntityPagesLandingLoadTree(projectName, entryPage, stage) : ctx.buildDashboardPageLoadTree(projectName, entryPage, facadePrefix, entities, stage));
    ctx.setDuration(timings, "buildPageLoadTreeMs", pageLoadStartedAt);
    result.runtimeEvidence.pageLoadTreeNodeCount = ctx.countTreeNodes(pageLoadTree.tree);
    var sessionBootstrapPageRoot = (pageTemplates && pageTemplates.loginPageTree) || ctx.buildSessionBootstrapPageRootTree(projectName, entryPage);
    var sessionBootstrapPageLoad = ctx.buildSessionBootstrapPageLoadTree(projectName, entryPage);
    var entityPageRoots = [];
    var entityPageShells = [];
    var entityPageLoads = [];
    if (isEntityPages) {
      for (var entityIndex = 0; entityIndex < entities.length; entityIndex++) {
        var currentEntity = entities[entityIndex];
        var entityRootTree = pageTemplates && pageTemplates.entityPageTrees && pageTemplates.entityPageTrees[entityIndex]
          ? pageTemplates.entityPageTrees[entityIndex]
          : ctx.buildEntityPageRootTree(currentEntity);
        entityPageRoots.push(entityRootTree);
        var entityShellTree = pageTemplates && pageTemplates.entityPageTrees && pageTemplates.entityPageTrees[entityIndex]
          ? directChildByName(ctx, entityRootTree, "Content")
          : ctx.buildEntityPageShellTree(projectName, currentEntity, stage);
        if (!(pageTemplates && pageTemplates.entityPageTrees && pageTemplates.entityPageTrees[entityIndex])) {
          ctx.appendEntityPageRows(projectName, currentEntity, entityShellTree, stage);
        }
        entityPageShells.push({
          entity: currentEntity.name,
          qname: ctx.entityPageContentQName(projectName, currentEntity),
          tree: entityShellTree
        });
        entityPageLoads.push({
          entity: currentEntity.name,
          tree: ctx.buildEntityPageLoadTree(projectName, currentEntity, stage)
        });
      }
    }
    result.runtimeEvidence.sessionBootstrapPage = ctx.sessionBootstrapPageQName(projectName);
    result.runtimeEvidence.pageNames = [String(ctx.sessionBootstrapPageQName(projectName)).split(".").pop(), entryPage].concat(entityPageRoots.map(function (pageTree) {
      return pageTree.name;
    }));
    result.runtimeEvidence.pageRoutes = ["/login", "/home"].concat(entityPageRoots.map(function (_pageTree, index) {
      return ctx.entityRoutePath(entities[index]);
    }));
    result.runtimeEvidence.entityPages = entityPageRoots.map(function (pageTree, index) {
      return {
        entity: entities[index].name,
        pageName: pageTree.name,
        route: ctx.entityRoutePath(entities[index]),
        contentQName: entityPageShells[index] ? entityPageShells[index].qname : "",
        sharedRefs: entityPageShells[index] ? ctx.collectSharedRefs(entityPageShells[index].tree, []) : []
      };
    });
    var expectedManagedCrudQNames = [ctx.sessionBootstrapPageQName(projectName), ctx.pageQName(projectName, entryPage)]
      .concat(sharedComponents.qnames || [])
      .concat(sharedActions.qnames || [])
      .concat(entityPageLoads.map(function (item) { return item.tree.qname; }));
    var cleanupQNames = ctx.collectManagedCrudCleanupQNames(ngxApp, expectedManagedCrudQNames);
    result.runtimeEvidence.cleanupTargets = cleanupQNames;
    var batchApplyStartedAt = ctx.nowMillis();
    var pageMutationOperations = [
      {
        type: "upsertTree",
        opId: "session_bootstrap_page_load",
        qname: ctx.sessionBootstrapPageQName(projectName),
        strategy: {
          replaceOnClassMismatch: true,
          pruneMissing: false,
          reorder: false
        },
        patch: {
          properties: sessionBootstrapPageLoad.tree.properties || {},
          children: ctx.ensureArray(sessionBootstrapPageLoad.tree.children)
        }
      },
      {
        type: "upsertTree",
        opId: "entry_page_load",
        qname: ctx.pageQName(projectName, entryPage),
        strategy: {
          replaceOnClassMismatch: true,
          pruneMissing: false,
          reorder: false
        },
        patch: {
          properties: pageLoadTree.tree.properties || {},
          children: ctx.ensureArray(pageLoadTree.tree.children)
        }
      }
    ];
    if (!(isEntityPages && pageTemplates && pageTemplates.homePageTree)) {
      var legacyPageLoadQNames = ctx.ensureArray(pageLoadTree.legacyQNames);
      for (var legacyIndex = 0; legacyIndex < legacyPageLoadQNames.length; legacyIndex++) {
        var legacyQName = ctx.trimmed(legacyPageLoadQNames[legacyIndex]);
        if (!legacyQName.length) {
          continue;
        }
        if (!ctx.resolveQName(legacyQName, { optional: true })) {
          continue;
        }
        pageMutationOperations.unshift({
          type: "delete",
          opId: "delete_" + ctx.normalizedIdentifier(legacyQName),
          qname: legacyQName
        });
      }
    }
    var cleanupOperations = cleanupQNames
      .filter(function (qname) {
        return !!ctx.resolveQName(qname, { optional: true });
      })
      .map(function (qname) {
        return {
          type: "delete",
          opId: "cleanup_" + ctx.normalizedIdentifier(qname),
          qname: qname
        };
      });
    var rootChildOperations = [];
    var rootChildOpIds = [];
    function pushRootChildOperation(prefix, childTree) {
      if (!childTree) {
        return;
      }
      var name = ctx.trimmed(childTree.name || prefix || "child") || "child";
      var opId = prefix + "_" + ctx.normalizedIdentifier(name);
      rootChildOpIds.push(opId);
      rootChildOperations.push({
        type: "upsertTree",
        opId: opId,
        qname: ctx.ngxAppQName(projectName),
        strategy: {
          replaceOnClassMismatch: true,
          pruneMissing: false,
          reorder: false
        },
        patch: {
          children: [childTree]
        }
      });
    }
    for (var sharedComponentIndex = 0; sharedComponentIndex < sharedComponentChildren.length; sharedComponentIndex++) {
      pushRootChildOperation("shared_component", sharedComponentChildren[sharedComponentIndex]);
    }
    for (var sharedActionIndex = 0; sharedActionIndex < sharedActionChildren.length; sharedActionIndex++) {
      pushRootChildOperation("shared_action", sharedActionChildren[sharedActionIndex]);
    }
    pushRootChildOperation("page_root", sessionBootstrapPageRoot);
    for (var rootPageIndex = 0; rootPageIndex < entityPageRoots.length; rootPageIndex++) {
      pushRootChildOperation("page_root", entityPageRoots[rootPageIndex]);
    }
    var appImportPatch = {
      status: "skipped",
      changed: false,
      target: ctx.ngxAppQName(projectName)
    };
    var menuTitlePatch = rootMenuTitlePatchPlan(ctx, projectName);
    var mergedAppScript = null;
    if (isEntityPages) {
      mergedAppScript = mergeAppImportBlock(currentAppComponentScriptContent(ctx, projectName), appShellImportPatchLines());
      if (mergedAppScript.changed) {
        appImportPatch = {
          status: "pending",
          changed: true,
          target: ctx.ngxAppQName(projectName)
        };
      }
    }
    var batchOperations = cleanupOperations
      .concat(rootChildOperations)
      .concat(menuTitlePatch.operations || [])
      .concat(legacyAppInitCleanupOperations(ctx, projectName))
      .concat([
      appImportPatch.changed ? {
        type: "setProperties",
        opId: "app_component_imports",
        qname: ctx.ngxAppQName(projectName),
        properties: {
          componentScriptContent: mergedAppScript.value
        }
      } : null,
      {
        type: "upsertTree",
        opId: "entry_page",
        qname: (isEntityPages && pageTemplates && pageTemplates.homePageTree) ? ctx.pageQName(projectName, entryPage) : contentQName,
        strategy: {
          replaceOnClassMismatch: true,
          pruneMissing: true,
          reorder: false
        },
        patch: (isEntityPages && pageTemplates && pageTemplates.homePageTree)
          ? pageShellTree
          : {
              properties: pageShellTree.properties || {},
              children: ctx.ensureArray(pageShellTree.children)
            }
      }
    ].filter(function (item) { return !!item; }))
      .concat(pageMutationOperations);
    batchOperations.push(
      {
        type: "setProperties",
        opId: "login_page_flags",
        qname: ctx.sessionBootstrapPageQName(projectName),
        properties: {
          inAutoMenu: false
        }
      }
    );
    for (var pageIndex = 0; pageIndex < entityPageShells.length; pageIndex++) {
      if (!(pageTemplates && pageTemplates.entityPageTrees && pageTemplates.entityPageTrees[pageIndex])) {
        batchOperations.push({
          type: "upsertTree",
          opId: "entity_page_" + ctx.normalizedIdentifier(entityPageShells[pageIndex].entity),
          qname: entityPageShells[pageIndex].qname,
          strategy: {
            replaceOnClassMismatch: true,
            pruneMissing: true,
            reorder: false
          },
          patch: {
            properties: entityPageShells[pageIndex].tree.properties || {},
            children: ctx.ensureArray(entityPageShells[pageIndex].tree.children)
          }
        });
      }
      batchOperations.push(
        {
          type: "upsertTree",
          opId: "entity_page_load_" + ctx.normalizedIdentifier(entityPageLoads[pageIndex].entity),
          qname: entityPageLoads[pageIndex].tree.qname,
          strategy: {
            replaceOnClassMismatch: true,
            pruneMissing: false,
            reorder: false
          },
          patch: {
            properties: entityPageLoads[pageIndex].tree.tree.properties || {},
            children: ctx.ensureArray(entityPageLoads[pageIndex].tree.tree.children)
          }
        }
      );
    }
    if (reuseExistingSharedActions && isMasterDetail) {
      var buildStageQName = ctx.statefulBootstrapStageQName(projectName, variant);
      if (ctx.resolveQName(buildStageQName, { optional: true })) {
        batchOperations.push({
          type: "setProperties",
          opId: "stateful_build_stage",
          qname: buildStageQName,
          properties: {
            Value: {
              mode: "SCRIPT",
              value: ctx.scriptLiteral(stage)
            }
          }
        });
      } else {
        ctx.addWarning(result, "Unable to reuse stateful actions: build stage node not found for " + buildStageQName);
      }
    } else if (reuseExistingSharedActions) {
      result.runtimeEvidence.statefulBuildStageReuse = {
        status: "page-load-finalizer",
        target: ctx.pageQName(projectName, entryPage)
      };
    }
    var batchApplyResult = ctx.batchApply({
      target: ctx.ngxAppQName(projectName),
      strict: true,
      onError: "stop",
      autoSave: false,
      triggerMobileBuilder: false,
      operations: batchOperations
    });
    ctx.setDuration(timings, "batchTreeApplyMs", batchApplyStartedAt);
    ctx.collectBatchWarnings(batchApplyResult, result, "batchApply");
    if (!batchApplyResult || batchApplyResult.status === "failed" || (batchApplyResult.errors && batchApplyResult.errors.length)) {
      throw new Error(ctx.firstBatchErrorMessage(batchApplyResult));
    }
    result.sharedComponents = sharedComponents.qnames.slice();
    result.runtimeEvidence.batchApply = ctx.summarizeTreeApplyResult(batchApplyResult, ctx.ngxAppQName(projectName), result);
    result.runtimeEvidence.sharedComponentsApply = operationGroupSummary(ctx, batchApplyResult, rootChildOpIds, ctx.ngxAppQName(projectName));
    result.runtimeEvidence.appComponentImports = appImportPatch.changed
      ? ctx.operationSummary(batchApplyResult, "app_component_imports", ctx.ngxAppQName(projectName))
      : appImportPatch;
    result.runtimeEvidence.menuTitleNormalization = (menuTitlePatch.operations && menuTitlePatch.operations.length)
      ? operationGroupSummary(ctx, batchApplyResult, ["menu_bar_title", "menu_label"], menuTitlePatch.target)
      : menuTitlePatch;
    result.runtimeEvidence.treeApply = ctx.operationSummary(batchApplyResult, "entry_page", contentQName);
    result.runtimeEvidence.pageLoadApply = ctx.operationSummary(batchApplyResult, "entry_page_load", ctx.pageQName(projectName, entryPage));
    result.runtimeEvidence.sharedActions = sharedActions.qnames.slice();
    timings.applySharedComponentsMs = timings.batchTreeApplyMs;
    timings.applyPagePropertiesMs = 0;
    timings.prunePageChildrenMs = 0;
    timings.applyPageChildrenMs = 0;
    var batchSummary = batchApplyResult.summary || {};
    result.runtimeEvidence.mutationCounts.created = Number(batchSummary.created || 0);
    result.runtimeEvidence.mutationCounts.updated = Number(batchSummary.updatedProperties || 0);
    result.runtimeEvidence.mutationCounts.deleted = Number(batchSummary.deleted || 0);
    result.runtimeEvidence.mutationCounts.replaced = Number(batchSummary.replaced || 0);
    result.runtimeEvidence.rootPageSelection = applyPageRootSelection(ctx, projectName, entryPage, result);
    var sharedBindingsStartedAt = ctx.nowMillis();
    var sharedBindingOperations = [];
    if (isEntityPages) {
      sharedBindingOperations = sharedBindingOperations.concat(crudPageHeaderBindingOperations(ctx, projectName, result));
      sharedBindingOperations = sharedBindingOperations.concat(workInProgressCardBindingOperations(ctx, projectName, result));
      sharedBindingOperations = sharedBindingOperations.concat(crudLoadingStateBindingOperations(ctx, projectName, result));
      sharedBindingOperations = sharedBindingOperations.concat(crudErrorRetryStateBindingOperations(ctx, projectName, result));
      sharedBindingOperations = sharedBindingOperations.concat(dashboardStatCardBindingOperations(ctx, projectName, result));
      for (var sharedBindingEntityIndex = 0; sharedBindingEntityIndex < entities.length; sharedBindingEntityIndex++) {
        sharedBindingOperations = sharedBindingOperations.concat(
          entityListPanelBindingOperations(ctx, projectName, entities[sharedBindingEntityIndex], result)
        );
        sharedBindingOperations = sharedBindingOperations.concat(
          entityDetailCardBindingOperations(ctx, projectName, entities[sharedBindingEntityIndex], result)
        );
        sharedBindingOperations = sharedBindingOperations.concat(
          entityEditFormBindingOperations(ctx, projectName, facadePrefix, entities[sharedBindingEntityIndex], entities, result)
        );
      }
    }
    if (sharedBindingOperations.length) {
      var sharedBindingsBatch = ctx.batchApply({
        target: ctx.ngxAppQName(projectName),
        strict: true,
        onError: "stop",
        autoSave: false,
        triggerMobileBuilder: false,
        operations: sharedBindingOperations
      });
      ctx.collectBatchWarnings(sharedBindingsBatch, result, "sharedBindings");
      if (!sharedBindingsBatch || sharedBindingsBatch.status === "failed" || (sharedBindingsBatch.errors && sharedBindingsBatch.errors.length)) {
        throw new Error(ctx.firstBatchErrorMessage(sharedBindingsBatch));
      }
      result.runtimeEvidence.sharedBindingsApply = ctx.summarizeTreeApplyResult(sharedBindingsBatch, ctx.ngxAppQName(projectName), result);
      var bindingsSummary = sharedBindingsBatch.summary || {};
      result.runtimeEvidence.mutationCounts.updated += Number(bindingsSummary.updatedProperties || 0);
    } else {
      result.runtimeEvidence.sharedBindingsApply = {
        status: "skipped",
        target: ctx.ngxAppQName(projectName)
      };
    }
    ctx.setDuration(timings, "configureSharedBindingsMs", sharedBindingsStartedAt);
    result.pageTargets.push(contentQName);
    result.pageTargets.push(ctx.sessionBootstrapContentQName(projectName));
    for (var targetIndex = 0; targetIndex < entityPageShells.length; targetIndex++) {
      result.pageTargets.push(entityPageShells[targetIndex].qname);
    }
    result.runtimeEvidence.entryPage = entryPage;
    result.runtimeEvidence.facadePrefix = facadePrefix;
    result.runtimeEvidence.pageSharedRefs = ctx.collectSharedRefs(pageShellTree, []);
    result.runtimeEvidence.workInProgressSharedRefPresent = result.runtimeEvidence.pageSharedRefs.indexOf(ctx.sharedComponentQName(projectName, "WorkInProgressCard")) !== -1;
    try {
      var uiAuditStartedAt = ctx.nowMillis();
      var uiTree = ctx.callInternalSequence("tools_databaseobject_tree_get", {
        target: contentQName,
        childrenDepth: 5,
        properties: "none",
        limit: 320
      });
      ctx.setDuration(timings, "uiAuditTreeGetMs", uiAuditStartedAt);
      var uiAudit = ctx.auditUiTreePayload(uiTree);
      result.runtimeEvidence.shellVisible = uiAudit.visibleShellPresent;
      result.runtimeEvidence.starterDominant = uiAudit.starterDominant;
      result.runtimeEvidence.liveBindingPresent = uiAudit.liveBindingPresent;
    } catch (uiInspectError) {
      result.status = "partial";
      ctx.addWarning(result, "Unable to inspect NGX shell after apply: " + String(uiInspectError));
    }
    try {
      var projectSaveStartedAt = ctx.nowMillis();
      result.runtimeEvidence.projectSave = ctx.summarizeSaveResult(ctx.saveProject(project, []), result);
      ctx.setDuration(timings, "projectSaveMs", projectSaveStartedAt);
      var generatedSourcesCleanupStartedAt = ctx.nowMillis();
      result.runtimeEvidence.generatedSourcesCleanup = ctx.cleanupGeneratedIonicSources(projectName, ngxApp);
      ctx.setDuration(timings, "generatedSourcesCleanupMs", generatedSourcesCleanupStartedAt);
      result.runtimeEvidence.generatedSourcesPurge = {
        skipped: true,
        reason: "Managed source purge is disabled because builder refresh must keep page and shared component sources intact.",
        pageDirsPurged: [],
        componentDirsPurged: [],
        deletedCount: 0
      };
      timings.generatedSourcesPurgeMs = 0;
      var pageTouchStartedAt = ctx.nowMillis();
      result.runtimeEvidence.pageTouchRefresh = touchManagedCrudPages(
        ctx,
        projectName,
        [ctx.sessionBootstrapPageQName(projectName), ctx.pageQName(projectName, entryPage)].concat(entityPageLoads.map(function (item) {
          return item.tree.qname;
        })),
        result
      );
      ctx.setDuration(timings, "pageTouchRefreshMs", pageTouchStartedAt);
      var mobileBuilderStartedAt = ctx.nowMillis();
      var refreshTargets = [ctx.sessionBootstrapPageQName(projectName), ctx.pageQName(projectName, entryPage)]
        .concat(stage === "final" ? (sharedComponents.qnames || []) : (reuseExistingSharedComponents ? [] : (sharedComponents.qnames || [])));
      for (var refreshIndex = 0; refreshIndex < entityPageLoads.length; refreshIndex++) {
        refreshTargets.push(entityPageLoads[refreshIndex].tree.qname);
      }
      result.runtimeEvidence.mobileBuilder = ctx.triggerUiSourceRefreshTargets(
        refreshTargets,
        result,
        "$.runtimeEvidence.mobileBuilder"
      );
      ctx.setDuration(timings, "mobileBuilderMs", mobileBuilderStartedAt);
      var studioRefreshStartedAt = ctx.nowMillis();
      result.runtimeEvidence.studioRefresh = ctx.refreshStudioProjectTree(project, result, "studioRefresh");
      ctx.setDuration(timings, "studioRefreshMs", studioRefreshStartedAt);
    } catch (saveUiError) {
      result.status = "partial";
      ctx.addWarning(result, "Unable to save project after NGX CRUD kit apply: " + String(saveUiError));
    }
    result.runtimeEvidence.totalDurationMs = ctx.setDuration(timings, "totalMs", startedAt);
    return result;
  };
})();
