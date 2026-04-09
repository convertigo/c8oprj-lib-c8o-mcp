if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.crudUiMeta = C8O.crudUiMeta || {};

(function () {
  if (C8O.crudUiMeta._initialized === true) {
    return;
  }
  C8O.crudUiMeta._initialized = true;

  C8O.crudUiMeta.applicationQName = function (ctx, projectName) {
    return ctx.trimmed(projectName) + ".Application";
  };

  C8O.crudUiMeta.ngxAppQName = function (ctx, projectName) {
    return C8O.crudUiMeta.applicationQName(ctx, projectName) + ".NgxApp";
  };

  C8O.crudUiMeta.pageQName = function (ctx, projectName, entryPage) {
    return C8O.crudUiMeta.ngxAppQName(ctx, projectName) + "." + ctx.trimmed(entryPage || "Home");
  };

  C8O.crudUiMeta.sessionBootstrapPageName = function (_ctx) {
    return "Login";
  };

  C8O.crudUiMeta.sessionBootstrapPageQName = function (ctx, projectName) {
    return C8O.crudUiMeta.pageQName(ctx, projectName, C8O.crudUiMeta.sessionBootstrapPageName(ctx));
  };

  C8O.crudUiMeta.sessionBootstrapContentQName = function (ctx, projectName) {
    return C8O.crudUiMeta.findPageContentQName(ctx, projectName, C8O.crudUiMeta.sessionBootstrapPageName(ctx));
  };

  C8O.crudUiMeta.findPageContentQName = function (ctx, projectName, entryPage) {
    return C8O.crudUiMeta.pageQName(ctx, projectName, entryPage) + ".Content";
  };

  C8O.crudUiMeta.sharedComponentQName = function (ctx, projectName, componentName) {
    return C8O.crudUiMeta.ngxAppQName(ctx, projectName) + "." + ctx.trimmed(componentName);
  };

  C8O.crudUiMeta.entityPageName = function (ctx, entity) {
    return ctx.pascalize(entity && entity.name) + "Page";
  };

  C8O.crudUiMeta.entityPageQName = function (ctx, projectName, entity) {
    return C8O.crudUiMeta.pageQName(ctx, projectName, C8O.crudUiMeta.entityPageName(ctx, entity));
  };

  C8O.crudUiMeta.entityPageContentQName = function (ctx, projectName, entity) {
    return C8O.crudUiMeta.findPageContentQName(ctx, projectName, C8O.crudUiMeta.entityPageName(ctx, entity));
  };

  C8O.crudUiMeta.entityRouteSegment = function (ctx, entity) {
    var configured = ctx.trimmed(entity && entity.routeSegment);
    if (configured.length) {
      return ctx.normalizedIdentifier(configured).replace(/_/g, "-").toLowerCase();
    }
    return ctx.normalizedIdentifier(entity && entity.name).replace(/_/g, "-").toLowerCase();
  };

  C8O.crudUiMeta.entityRoutePath = function (ctx, entity) {
    return "/" + C8O.crudUiMeta.entityRouteSegment(ctx, entity);
  };

  C8O.crudUiMeta.schemaPreviewFields = function (ctx, entity, limit, includePrimary) {
    var fields = ctx.ensureArray(entity && entity.fields);
    var ranked = [];
    function fieldPriority(field) {
      var token = ctx.semanticFieldToken(field);
      if (!token.length) {
        return 900;
      }
      if (field.primary) {
        return includePrimary ? 800 : 1000;
      }
      if (field.references || /(^|_)(id|.*_id)$/.test(ctx.normalizedIdentifier(field && (field.column || field.name)))) {
        return 300;
      }
      var preferred = [
        ["nomcommun", "commonname", "name", "nom", "title", "titre"],
        ["nomscientifique", "scientificname", "firstname", "prenom", "lastname", "surname"],
        ["email", "phone", "telephone"],
        ["city", "ville", "region", "country", "pays"],
        ["industry", "secteur", "category", "categorie", "habitat", "usage"],
        ["comment", "note", "description", "vote", "status", "statut"]
      ];
      for (var p = 0; p < preferred.length; p++) {
        if (ctx.tokenMatches(token, preferred[p])) {
          return p;
        }
      }
      if (field.unique === true) {
        return 120;
      }
      return 180;
    }
    for (var i = 0; i < fields.length; i++) {
      if (!includePrimary && fields[i].primary) {
        continue;
      }
      ranked.push({
        field: fields[i],
        order: i,
        priority: fieldPriority(fields[i])
      });
    }
    ranked.sort(function (left, right) {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }
      return left.order - right.order;
    });
    var preview = [];
    for (var index = 0; index < ranked.length; index++) {
      preview.push(ranked[index].field);
      if (limit > 0 && preview.length >= limit) {
        break;
      }
    }
    if (!preview.length && includePrimary && entity && entity.primaryField) {
      preview.push(entity.primaryField);
    }
    return preview;
  };

  C8O.crudUiMeta.firstNonPrimaryField = function (ctx, entity) {
    var preview = C8O.crudUiMeta.schemaPreviewFields(ctx, entity, 1, false);
    return preview.length ? preview[0] : (entity && entity.primaryField ? entity.primaryField : null);
  };

  C8O.crudUiMeta.secondPreviewField = function (ctx, entity) {
    var preview = C8O.crudUiMeta.schemaPreviewFields(ctx, entity, 2, false);
    return preview.length > 1 ? preview[1] : (preview[0] || entity.primaryField || null);
  };

  function resolvedFieldLookup(ctx, entity) {
    var lookup = {};
    var fields = ctx.ensureArray(entity && entity.fields);
    function keysFor(value) {
      var primary = ctx.normalizedIdentifier(value || "");
      if (!primary.length) {
        return [];
      }
      var keys = [primary];
      var compact = primary.replace(/_/g, "");
      if (compact.length && compact !== primary) {
        keys.push(compact);
      }
      return keys;
    }
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      if (!field) {
        continue;
      }
      var aliases = keysFor(field.column).concat(keysFor(field.name));
      for (var aliasIndex = 0; aliasIndex < aliases.length; aliasIndex++) {
        var alias = aliases[aliasIndex];
        if (alias.length && !lookup[alias]) {
          lookup[alias] = field;
        }
      }
    }
    return lookup;
  }

  function lookupByAliases(ctx, lookup, value) {
    var primary = ctx.normalizedIdentifier(value || "");
    if (!primary.length) {
      return null;
    }
    if (lookup[primary]) {
      return lookup[primary];
    }
    var compact = primary.replace(/_/g, "");
    if (compact.length && lookup[compact]) {
      return lookup[compact];
    }
    return null;
  }

  function inferFieldLabel(ctx, field) {
    var label = ctx.trimmed(field && field.label);
    if (label.length) {
      return label;
    }
    var source = ctx.trimmed(field && (field.name || field.column));
    if (!source.length) {
      return "Field";
    }
    return source
      .replace(/_/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .replace(/^\w/, function (char) { return char.toUpperCase(); });
  }

  function relationDisplayColumn(ctx, field) {
    var column = ctx.normalizedIdentifier(field && (field.column || field.name));
    return column.length ? (column + "__label") : "__label";
  }

  function normalizeUiOverrideBlock(ctx, entity) {
    var rawUi = entity && entity.ui && typeof entity.ui === "object" ? entity.ui : {};
    var labels = {};
    var rawLabels = rawUi.fieldLabels && typeof rawUi.fieldLabels === "object" ? rawUi.fieldLabels : {};
    var labelKeys = Object.keys(rawLabels);
    for (var i = 0; i < labelKeys.length; i++) {
      var key = ctx.normalizedIdentifier(labelKeys[i]);
      var value = ctx.trimmed(rawLabels[labelKeys[i]]);
      if (!key.length || !value.length) {
        continue;
      }
      labels[key] = value;
      var compactKey = key.replace(/_/g, "");
      if (compactKey.length) {
        labels[compactKey] = value;
      }
    }
    function normalizeRefs(value) {
      var entries = ctx.ensureArray(value);
      var seen = {};
      var refs = [];
      for (var index = 0; index < entries.length; index++) {
        var normalized = ctx.normalizedIdentifier(entries[index]);
        if (!normalized.length || seen[normalized]) {
          continue;
        }
        seen[normalized] = true;
        refs.push(normalized);
      }
      return refs;
    }
    var relationFields = {};
    var rawRelationFields = rawUi.relationFields && typeof rawUi.relationFields === "object" ? rawUi.relationFields : {};
    var relationKeys = Object.keys(rawRelationFields);
    for (var relationIndex = 0; relationIndex < relationKeys.length; relationIndex++) {
      var relationFieldKey = ctx.normalizedIdentifier(relationKeys[relationIndex]);
      if (!relationFieldKey.length) {
        continue;
      }
      var rawRelationConfig = rawRelationFields[relationKeys[relationIndex]];
      if (!rawRelationConfig || typeof rawRelationConfig !== "object") {
        continue;
      }
      var control = ctx.trimmed(rawRelationConfig.control || "").toLowerCase();
      if (control !== "autocomplete" && control !== "select") {
        control = "";
      }
      relationFields[relationFieldKey] = {
        control: control,
        optionLabelField: ctx.normalizedIdentifier(rawRelationConfig.optionLabelField || ""),
        optionValueField: ctx.normalizedIdentifier(rawRelationConfig.optionValueField || ""),
        placeholder: ctx.trimmed(rawRelationConfig.placeholder || "")
      };
      var compactRelationFieldKey = relationFieldKey.replace(/_/g, "");
      if (compactRelationFieldKey.length) {
        relationFields[compactRelationFieldKey] = relationFields[relationFieldKey];
      }
    }
    return {
      listFields: normalizeRefs(rawUi.listFields),
      detailFields: normalizeRefs(rawUi.detailFields),
      formFields: normalizeRefs(rawUi.formFields),
      fieldLabels: labels,
      actionLabel: ctx.trimmed(rawUi.actionLabel || ""),
      relationFields: relationFields
    };
  }

  function preferredRelationLabelField(ctx, targetEntity) {
    if (!targetEntity) {
      return null;
    }
    if (typeof ctx.preferredRelationLabelField === "function") {
      return ctx.preferredRelationLabelField(targetEntity);
    }
    var preview = C8O.crudUiMeta.schemaPreviewFields(ctx, targetEntity, 1, false);
    return preview.length ? preview[0] : (targetEntity.primaryField || null);
  }

  function findRelatedEntity(ctx, entities, references) {
    if (!references || !references.entity || typeof ctx.findEntityByName !== "function") {
      return null;
    }
    return ctx.findEntityByName(entities, references.entity);
  }

  function relationInferenceTokens(ctx, field) {
    var column = ctx.normalizedIdentifier(field && (field.column || field.name));
    if (!column.length) {
      return [];
    }
    var base = column.replace(/_id$/, "");
    var parts = base.split("_");
    var candidates = [];
    var seen = {};
    function push(token) {
      var normalized = ctx.normalizedIdentifier(token || "");
      if (!normalized.length || seen[normalized]) {
        return;
      }
      seen[normalized] = true;
      candidates.push(normalized);
    }
    push(base);
    for (var index = 1; index < parts.length; index++) {
      push(parts.slice(index).join("_"));
    }
    return candidates;
  }

  function inferRelatedEntityFromField(ctx, entities, field, override) {
    var column = ctx.normalizedIdentifier(field && (field.column || field.name));
    var currentOverride = override && typeof override === "object" ? override : null;
    if (!column.length) {
      return null;
    }
    if (!currentOverride && !/_id$/i.test(column)) {
      return null;
    }
    if (currentOverride && ctx.trimmed(currentOverride.entity || "").length && typeof ctx.findEntityByName === "function") {
      var explicit = ctx.findEntityByName(entities, currentOverride.entity);
      if (explicit) {
        return explicit;
      }
    }
    var candidates = relationInferenceTokens(ctx, field);
    if (!candidates.length) {
      return null;
    }
    var entityList = ctx.ensureArray(entities);
    for (var candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
      var candidate = candidates[candidateIndex];
      for (var entityIndex = 0; entityIndex < entityList.length; entityIndex++) {
        var entity = entityList[entityIndex] || {};
        var pluralName = ctx.normalizedIdentifier(entity.name || "");
        var singularName = ctx.normalizedIdentifier(entity.singular || "");
        if (!pluralName.length && !singularName.length) {
          continue;
        }
        if (singularName === candidate || pluralName === candidate || pluralName === ctx.pluralize(candidate)) {
          return entity;
        }
      }
    }
    return null;
  }

  function effectiveRelationReferences(ctx, entities, field, override) {
    if (field && field.references) {
      return ctx.clone(field.references);
    }
    var inferredEntity = inferRelatedEntityFromField(ctx, entities, field, override);
    if (!inferredEntity) {
      return null;
    }
    return {
      entity: inferredEntity.name,
      field: (inferredEntity.primaryField && inferredEntity.primaryField.column) || "id"
    };
  }

  function buildRelationConfig(ctx, entities, field, override, label) {
    var references = effectiveRelationReferences(ctx, entities, field, override);
    if (!field || !references) {
      return null;
    }
    var relatedEntity = findRelatedEntity(ctx, entities, references) || inferRelatedEntityFromField(ctx, entities, field, override);
    var preferredLabelField = preferredRelationLabelField(ctx, relatedEntity);
    var optionLabelField = ctx.normalizedIdentifier(
      (override && override.optionLabelField) ||
      (preferredLabelField && (preferredLabelField.column || preferredLabelField.name)) ||
      (references && references.field) ||
      "id"
    );
    var optionValueField = ctx.normalizedIdentifier(
      (override && override.optionValueField) ||
      (references && references.field) ||
      "id"
    );
    var control = ctx.trimmed(override && override.control || "").toLowerCase();
    if (control !== "autocomplete" && control !== "select") {
      control = "select";
    }
    return {
      control: control,
      column: field.column,
      label: label,
      entity: ctx.pluralize(ctx.normalizedIdentifier(references.entity)),
      targetField: ctx.normalizedIdentifier(references.field || "id"),
      optionLabelField: optionLabelField,
      optionValueField: optionValueField,
      placeholder: ctx.trimmed(override && override.placeholder || ("Select " + label)),
      displayColumn: relationDisplayColumn(ctx, field)
    };
  }

  function buildConfiguredField(ctx, entities, field, fieldLabels, relationOverrides) {
    var normalizedKey = ctx.normalizedIdentifier(field && (field.column || field.name));
    var compactKey = normalizedKey.replace(/_/g, "");
    var label = fieldLabels[normalizedKey] || fieldLabels[compactKey] || inferFieldLabel(ctx, field);
    var relation = buildRelationConfig(ctx, entities, field, relationOverrides[normalizedKey] || relationOverrides[compactKey], label);
    return {
      name: field.name,
      column: field.column,
      displayColumn: relation ? relation.displayColumn : field.column,
      label: label,
      type: field.type,
      required: field.required === true,
      unique: field.unique === true,
      references: field.references ? ctx.clone(field.references) : null,
      relation: relation
    };
  }

  function resolveFieldList(ctx, entity, rawRefs, fallbackFields, options) {
    var currentOptions = options || {};
    var lookup = resolvedFieldLookup(ctx, entity);
    var refs = ctx.ensureArray(rawRefs);
    var resolved = [];
    var seen = {};
    for (var i = 0; i < refs.length; i++) {
      var token = ctx.normalizedIdentifier(refs[i]);
      var field = lookupByAliases(ctx, lookup, token);
      if (!field || seen[field.column]) {
        continue;
      }
      if (currentOptions.excludePrimary === true && field.primary === true) {
        continue;
      }
      seen[field.column] = true;
      resolved.push(field);
    }
    if (resolved.length) {
      return resolved;
    }
    var fallbacks = ctx.ensureArray(fallbackFields);
    for (var index = 0; index < fallbacks.length; index++) {
      var fallbackField = fallbacks[index];
      if (!fallbackField || seen[fallbackField.column]) {
        continue;
      }
      if (currentOptions.excludePrimary === true && fallbackField.primary === true) {
        continue;
      }
      seen[fallbackField.column] = true;
      resolved.push(fallbackField);
    }
    return resolved;
  }

  C8O.crudUiMeta.entityUiConfig = function (ctx, projectName, facadePrefix, entity, entities) {
    var overrideUi = normalizeUiOverrideBlock(ctx, entity);
    var editableFields = ctx.ensureArray(entity && entity.fields).filter(function (field) {
      return field && field.primary !== true;
    });
    var previewDefaults = C8O.crudUiMeta.schemaPreviewFields(ctx, entity, 2, false);
    var detailDefaults = C8O.crudUiMeta.schemaPreviewFields(ctx, entity, 2, true);
    var listFields = resolveFieldList(ctx, entity, overrideUi.listFields, previewDefaults, { excludePrimary: false });
    var detailFields = resolveFieldList(ctx, entity, overrideUi.detailFields, detailDefaults, { excludePrimary: false });
    var formFields = resolveFieldList(ctx, entity, overrideUi.formFields, editableFields, { excludePrimary: true });
    var fieldLabels = {};
    var allConfigFields = listFields.concat(detailFields).concat(formFields);
    for (var fieldIndex = 0; fieldIndex < allConfigFields.length; fieldIndex++) {
      var currentField = allConfigFields[fieldIndex];
      if (!currentField) {
        continue;
      }
      var normalizedKey = ctx.normalizedIdentifier(currentField.column || currentField.name);
      if (!normalizedKey.length || fieldLabels[normalizedKey]) {
        continue;
      }
      fieldLabels[normalizedKey] = overrideUi.fieldLabels[normalizedKey] || inferFieldLabel(ctx, currentField);
    }
    var mappedListFields = listFields.map(function (field) {
      return buildConfiguredField(ctx, entities, field, fieldLabels, overrideUi.relationFields || {});
    });
    var mappedDetailFields = detailFields.map(function (field) {
      return buildConfiguredField(ctx, entities, field, fieldLabels, overrideUi.relationFields || {});
    });
    var mappedEditableFields = formFields.map(function (field) {
      return buildConfiguredField(ctx, entities, field, fieldLabels, overrideUi.relationFields || {});
    });
    var uniqueFields = formFields.filter(function (field) {
      return field && field.unique === true;
    }).map(function (field) {
      return field.column;
    });
    var previewPrimary = mappedListFields[0] || mappedDetailFields[0] || buildConfiguredField(ctx, entities, C8O.crudUiMeta.firstNonPrimaryField(ctx, entity) || entity.primaryField || {}, fieldLabels, overrideUi.relationFields || {});
    var previewSecondary = mappedListFields[1] || mappedDetailFields[1] || mappedListFields[0] || mappedDetailFields[0] || buildConfiguredField(ctx, entities, C8O.crudUiMeta.secondPreviewField(ctx, entity) || C8O.crudUiMeta.firstNonPrimaryField(ctx, entity) || entity.primaryField || {}, fieldLabels, overrideUi.relationFields || {});
    var mappedRelationFields = formFields.map(function (field) {
      return buildConfiguredField(ctx, entities, field, fieldLabels, overrideUi.relationFields || {});
    }).filter(function (field) {
      return !!(field && field.relation);
    }).filter(function (field) {
      var allowed = false;
      for (var i = 0; i < formFields.length; i++) {
        if (formFields[i] && formFields[i].column === field.column) {
          allowed = true;
          break;
        }
      }
      return allowed;
    }).map(function (field) {
      var relation = field.relation;
      if (!relation) {
        return relation;
      }
      relation.listRequestable = ctx.facadeSequenceQName(projectName, facadePrefix, { name: relation.entity }, "list");
      return relation;
    });
    return {
      key: entity.name,
      singular: entity.singular,
      label: entity.label,
      pageName: C8O.crudUiMeta.entityPageName(ctx, entity),
      routeSegment: C8O.crudUiMeta.entityRouteSegment(ctx, entity),
      routePath: C8O.crudUiMeta.entityRoutePath(ctx, entity),
      primaryColumn: (entity.primaryField && entity.primaryField.column) || "id",
      primaryLabel: (entity.primaryField && entity.primaryField.label) || "Id",
      previewPrimaryColumn: (previewPrimary && (previewPrimary.displayColumn || previewPrimary.column)) || "id",
      previewSecondaryColumn: (previewSecondary && (previewSecondary.displayColumn || previewSecondary.column)) || "id",
      listRequestable: ctx.facadeSequenceQName(projectName, facadePrefix, entity, "list"),
      countRequestable: ctx.facadeSequenceQName(projectName, facadePrefix, entity, "count"),
      readRequestable: ctx.facadeSequenceQName(projectName, facadePrefix, entity, "read"),
      createRequestable: ctx.facadeSequenceQName(projectName, facadePrefix, entity, "create"),
      updateRequestable: ctx.facadeSequenceQName(projectName, facadePrefix, entity, "update"),
      deleteRequestable: ctx.facadeSequenceQName(projectName, facadePrefix, entity, "delete"),
      actionLabel: overrideUi.actionLabel.length ? overrideUi.actionLabel : ("Save " + entity.singular),
      listFields: mappedListFields,
      detailFields: mappedDetailFields,
      editableFields: mappedEditableFields,
      relationFields: mappedRelationFields,
      fieldLabels: fieldLabels,
      uniqueFields: uniqueFields
    };
  };
})();
