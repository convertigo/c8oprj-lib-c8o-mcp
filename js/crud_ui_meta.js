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
    return C8O.crudUiMeta.ngxAppQName(ctx, projectName) + "." + ctx.trimmed(entryPage || "Page");
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

  C8O.crudUiMeta.entityUiConfig = function (ctx, projectName, facadePrefix, entity) {
    var editableFields = ctx.ensureArray(entity && entity.fields).filter(function (field) {
      return field && field.primary !== true;
    });
    var relationFields = editableFields.filter(function (field) {
      return field && field.references;
    });
    var uniqueFields = editableFields.filter(function (field) {
      return field && field.unique === true;
    }).map(function (field) {
      return field.column;
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
      previewPrimaryColumn: ((C8O.crudUiMeta.firstNonPrimaryField(ctx, entity) || entity.primaryField || {}).column) || "id",
      previewSecondaryColumn: ((C8O.crudUiMeta.secondPreviewField(ctx, entity) || C8O.crudUiMeta.firstNonPrimaryField(ctx, entity) || entity.primaryField || {}).column) || "id",
      listRequestable: ctx.facadeSequenceQName(projectName, facadePrefix, entity, "list"),
      readRequestable: ctx.facadeSequenceQName(projectName, facadePrefix, entity, "read"),
      createRequestable: ctx.facadeSequenceQName(projectName, facadePrefix, entity, "create"),
      updateRequestable: ctx.facadeSequenceQName(projectName, facadePrefix, entity, "update"),
      deleteRequestable: ctx.facadeSequenceQName(projectName, facadePrefix, entity, "delete"),
      editableFields: editableFields.map(function (field) {
        return {
          name: field.name,
          column: field.column,
          label: field.label,
          type: field.type,
          required: field.required === true,
          unique: field.unique === true,
          references: field.references ? ctx.clone(field.references) : null
        };
      }),
      relationFields: relationFields.map(function (field) {
        return {
          column: field.column,
          label: field.label,
          entity: ctx.pluralize(ctx.normalizedIdentifier(field.references.entity)),
          targetField: ctx.normalizedIdentifier(field.references.field || "id")
        };
      }),
      uniqueFields: uniqueFields
    };
  };
})();
