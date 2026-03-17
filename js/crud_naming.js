if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.crudNaming = C8O.crudNaming || {};

(function () {
  if (C8O.crudNaming._initialized === true) {
    return;
  }
  C8O.crudNaming._initialized = true;

  C8O.crudNaming.ucfirst = function (ctx, value) {
    var text = ctx.trimmed(value);
    if (!text.length) {
      return "";
    }
    return text.substring(0, 1).toUpperCase() + text.substring(1);
  };

  C8O.crudNaming.pascalize = function (ctx, value) {
    var text = ctx.trimmed(value);
    if (!text.length) {
      return "";
    }
    var parts = String(text).split(/[^A-Za-z0-9]+/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var part = ctx.trimmed(parts[i]);
      if (!part.length) {
        continue;
      }
      out.push(C8O.crudNaming.ucfirst(ctx, part));
    }
    return out.join("");
  };

  C8O.crudNaming.singularize = function (ctx, name) {
    var text = ctx.trimmed(name);
    if (!text.length) {
      return text;
    }
    if (/ies$/i.test(text)) {
      return text.substring(0, text.length - 3) + "y";
    }
    if (/ses$/i.test(text)) {
      return text.substring(0, text.length - 2);
    }
    if (/s$/i.test(text) && text.length > 1) {
      return text.substring(0, text.length - 1);
    }
    return text;
  };

  C8O.crudNaming.pluralize = function (ctx, name) {
    var text = ctx.trimmed(name);
    if (!text.length) {
      return text;
    }
    if (/y$/i.test(text)) {
      return text.substring(0, text.length - 1) + "ies";
    }
    if (/s$/i.test(text)) {
      return text;
    }
    return text + "s";
  };

  C8O.crudNaming.semanticToken = function (ctx, value) {
    var text = ctx.trimmed(value);
    if (!text.length) {
      return "";
    }
    try {
      var Normalizer = Packages.java.text.Normalizer;
      var Form = Packages.java.text.Normalizer.Form;
      text = String(Normalizer.normalize(text, Form.NFD));
    } catch (_ignoreNormalizer) {}
    text = text
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "")
      .toLowerCase();
    return text;
  };

  C8O.crudNaming.semanticFieldToken = function (ctx, field) {
    var parts = [];
    if (field) {
      parts.push(field.column);
      parts.push(field.name);
      parts.push(field.label);
    }
    return C8O.crudNaming.semanticToken(ctx, parts.join(" "));
  };

  C8O.crudNaming.semanticEntityToken = function (ctx, entity) {
    var parts = [];
    if (entity) {
      parts.push(entity.name);
      parts.push(entity.singular);
      parts.push(entity.label);
      parts.push(entity.displayLabel);
      parts.push(entity.routeSegment);
    }
    return C8O.crudNaming.semanticToken(ctx, parts.join(" "));
  };

  C8O.crudNaming.tokenMatches = function (ctx, token, patterns) {
    var text = C8O.crudNaming.semanticToken(ctx, token);
    var values = ctx.ensureArray(patterns);
    for (var i = 0; i < values.length; i++) {
      var pattern = C8O.crudNaming.semanticToken(ctx, values[i]);
      if (pattern.length && text.indexOf(pattern) !== -1) {
        return true;
      }
    }
    return false;
  };

  C8O.crudNaming.humanizeIdentifier = function (ctx, value) {
    var text = ctx.trimmed(value).replace(/[_\-]+/g, " ");
    if (!text.length) {
      return "";
    }
    return text.replace(/\b([a-z])/g, function (_all, char) {
      return String(char).toUpperCase();
    });
  };

  C8O.crudNaming.normalizeEntityNames = function (ctx, rawEntity, fallbackName) {
    var raw = rawEntity || {};
    var baseName = ctx.optionalNormalizedIdentifier(raw.name || raw.entity || fallbackName || "") || "unnamed";
    var explicitPlural = ctx.optionalNormalizedIdentifier(raw.plural || "");
    var explicitSingular = ctx.optionalNormalizedIdentifier(raw.singular || "");
    var pluralName = explicitPlural || (explicitSingular.length ? C8O.crudNaming.pluralize(ctx, explicitSingular) : C8O.crudNaming.pluralize(ctx, baseName));
    var singularName = explicitSingular || C8O.crudNaming.singularize(ctx, pluralName);
    var routeSegment = ctx.normalizedIdentifier(raw.routeSegment || pluralName).replace(/_/g, "-").toLowerCase();
    var displayLabel = ctx.trimmed(raw.displayLabel || raw.label || C8O.crudNaming.humanizeIdentifier(ctx, pluralName));
    return {
      name: pluralName,
      singular: singularName,
      routeSegment: routeSegment,
      displayLabel: displayLabel
    };
  };
})();
