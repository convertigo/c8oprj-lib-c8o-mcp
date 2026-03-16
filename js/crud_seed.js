if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.crudSeed = C8O.crudSeed || {};

(function () {
  function normalizedFieldType(ctx, fieldValue) {
    return ctx.trimmed(fieldValue && fieldValue.type).toUpperCase().replace(/\(.*\)/, "");
  }

  function seedLiteral(ctx, spec, value, fieldValue) {
    if (value === null || value === undefined) {
      return "NULL";
    }
    if (typeof value === "number") {
      return String(value);
    }
    if (typeof value === "boolean") {
      if (/^(POSTGRESQL|HSQLDB|MARIADB|MYSQL)$/.test(String(spec.database.driver.id || "").toUpperCase())) {
        return value ? "TRUE" : "FALSE";
      }
      return value ? "1" : "0";
    }
    var type = normalizedFieldType(ctx, fieldValue);
    if (/^(INT|INTEGER|BIGINT|SMALLINT|DECIMAL|NUMERIC|NUMBER|DOUBLE|FLOAT|REAL)$/.test(type) && /^-?[0-9]+(?:\.[0-9]+)?$/.test(String(value))) {
      return String(value);
    }
    return "'" + ctx.escapeSqlString(String(value)) + "'";
  }

  C8O.crudSeed.sampleValueForField = function (ctx, entity, field, rowIndex) {
    var FIRST_NAMES = ["Camille", "Nora", "Leo", "Ines", "Arthur", "Maya", "Jules", "Sarah", "Lucas", "Emma"];
    var LAST_NAMES = ["Martin", "Bernard", "Petit", "Robert", "Richard", "Dubois", "Moreau", "Simon", "Laurent", "Michel"];
    var CITIES = ["Paris", "Lyon", "Bordeaux", "Nantes", "Lille", "Toulouse", "Marseille", "Rennes"];
    var INDUSTRIES = ["Software", "Health", "Retail", "Education", "Finance", "Services"];
    var CATEGORIES = ["Dinner", "Culture", "Outdoor", "Music", "Cinema", "Family"];
    var DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    var STATUSES = ["active", "lead", "draft", "confirmed"];
    var CONSERVATION_STATUSES = ["Least Concern", "Near Threatened", "Vulnerable", "Protected", "Monitoring"];
    var COMMENTS = [
      "Prefers small groups and central venues.",
      "Available after work during the week.",
      "Would like a quieter option this month.",
      "Happy to help with coordination.",
      "Interested if the venue is easy to reach."
    ];
    var COMPANY_NAMES = ["Blue Orbit", "North Harbor", "Golden Fern", "Urban Echo", "Silver Maple", "Bright Atlas"];
    var GROUP_NAMES = ["City Explorers", "Weekend Makers", "Food Lovers", "Culture Circle", "Sunset Club"];
    var OUTING_TITLES = ["Sunset Picnic", "Jazz Night", "Street Food Tour", "Museum Late Opening", "Riverside Brunch"];
    var ANIMAL_COMMON_NAMES = ["Renard roux", "Loutre d'Europe", "Blaireau européen", "Lynx boréal", "Cerf élaphe", "Hérisson d'Europe"];
    var INSECT_COMMON_NAMES = ["Machaon", "Lucane cerf-volant", "Coccinelle à sept points", "Abeille charpentière", "Grand capricorne", "Paon-du-jour"];
    var PLANT_COMMON_NAMES = ["Chêne sessile", "Pin sylvestre", "Digitale pourpre", "Orchidée abeille", "Achillée millefeuille", "Primevère officinale"];
    var SCIENTIFIC_NAMES = ["Vulpes vulpes", "Lutra lutra", "Meles meles", "Lynx lynx", "Papilio machaon", "Quercus petraea"];
    var ORDERS = ["Carnivora", "Coleoptera", "Lepidoptera", "Fagales", "Rosales", "Primates"];
    var FAMILIES = ["Canidae", "Mustelidae", "Cervidae", "Papilionidae", "Fagaceae", "Rosaceae"];
    var HABITATS = ["Mixed woodland", "Wetland edge", "Urban park", "Coastal meadow", "Mountain forest", "Riverside hedgerow"];
    var REGIONS = ["Occitanie", "Bretagne", "Normandie", "Provence-Alpes-Cote d'Azur", "Nouvelle-Aquitaine", "Auvergne-Rhone-Alpes"];
    var USAGES = ["Observation", "Biodiversity survey", "Educational trail", "Community garden", "Protected habitat", "Seasonal inventory"];
    var base = rowIndex + 1;
    var column = ctx.normalizedIdentifier(field && (field.column || field.name));
    var semantic = ctx.semanticFieldToken(field);
    var entityName = ctx.normalizedIdentifier(entity && entity.name);
    var entitySemantic = ctx.semanticEntityToken(entity);
    if (field.primary) {
      return null;
    }

    function pick(list) {
      return list[rowIndex % list.length];
    }

    function isNumericField(fieldValue) {
      var type = normalizedFieldType(ctx, fieldValue);
      return /^(INT|INTEGER|BIGINT|SMALLINT|DECIMAL|NUMERIC|NUMBER|DOUBLE|FLOAT|REAL)$/.test(type);
    }

    function isBooleanField(fieldValue) {
      var type = normalizedFieldType(ctx, fieldValue);
      return /^(BOOLEAN|BIT)$/.test(type);
    }

    if (isBooleanField(field)) {
      return rowIndex % 2 === 0;
    }
    if (isNumericField(field)) {
      if (column.indexOf("year") !== -1) {
        return 2020 + (rowIndex % 6);
      }
      if (column.indexOf("score") !== -1 || column.indexOf("rank") !== -1 || column.indexOf("priority") !== -1) {
        return (rowIndex % 5) + 1;
      }
      return base;
    }
    if (ctx.tokenMatches(semantic, ["email", "courriel", "mail"])) {
      var first = FIRST_NAMES[rowIndex % FIRST_NAMES.length].toLowerCase();
      var last = LAST_NAMES[rowIndex % LAST_NAMES.length].toLowerCase();
      return first + "." + last + base + "@example.test";
    }
    if (ctx.tokenMatches(semantic, ["firstname", "prenom", "givenname"])) {
      return pick(FIRST_NAMES);
    }
    if (ctx.tokenMatches(semantic, ["lastname", "surname", "nomdefamille"])) {
      return pick(LAST_NAMES);
    }
    if (ctx.tokenMatches(semantic, ["phone", "telephone", "tel", "mobile"])) {
      return "+33 6 " + String(10 + (base % 80)) + " " + String(10 + ((base + 7) % 80)) + " " + String(10 + ((base + 13) % 80)) + " " + String(10 + ((base + 19) % 80));
    }
    if (ctx.tokenMatches(semantic, ["statutconservation", "conservationstatus"])) {
      return pick(CONSERVATION_STATUSES);
    }
    if (ctx.tokenMatches(semantic, ["status", "statut"])) {
      return pick(STATUSES);
    }
    if (ctx.tokenMatches(semantic, ["city", "ville"])) {
      return pick(CITIES);
    }
    if (ctx.tokenMatches(semantic, ["country", "pays"])) {
      return ["France", "Belgium", "Spain", "Italy"][rowIndex % 4];
    }
    if (ctx.tokenMatches(semantic, ["industry", "secteur"])) {
      return pick(INDUSTRIES);
    }
    if (ctx.tokenMatches(semantic, ["category", "categorie"])) {
      return pick(CATEGORIES);
    }
    if (ctx.tokenMatches(semantic, ["preferredday", "jour", "day"])) {
      return pick(DAYS);
    }
    if (ctx.tokenMatches(semantic, ["vote", "preference", "choix"])) {
      return ["yes", "maybe", "no"][rowIndex % 3];
    }
    if (ctx.tokenMatches(semantic, ["comment", "note", "description", "resume", "summary"])) {
      return pick(COMMENTS);
    }
    if (ctx.tokenMatches(semantic, ["title", "titre"])) {
      return pick(OUTING_TITLES) + " " + base;
    }
    if (ctx.tokenMatches(semantic, ["nomscientifique", "scientificname"])) {
      return pick(SCIENTIFIC_NAMES);
    }
    if (ctx.tokenMatches(semantic, ["nomcommun", "commonname"])) {
      if (entitySemantic.indexOf("insect") !== -1) {
        return pick(INSECT_COMMON_NAMES);
      }
      if (entitySemantic.indexOf("plant") !== -1 || entitySemantic.indexOf("plante") !== -1) {
        return pick(PLANT_COMMON_NAMES);
      }
      return pick(ANIMAL_COMMON_NAMES);
    }
    if (ctx.tokenMatches(semantic, ["ordre", "order"])) {
      return pick(ORDERS);
    }
    if (ctx.tokenMatches(semantic, ["famille", "family"])) {
      return pick(FAMILIES);
    }
    if (ctx.tokenMatches(semantic, ["habitat"])) {
      return pick(HABITATS);
    }
    if (ctx.tokenMatches(semantic, ["region", "territoire", "zone"])) {
      return pick(REGIONS);
    }
    if (ctx.tokenMatches(semantic, ["usage", "use"])) {
      return pick(USAGES);
    }
    if (ctx.tokenMatches(semantic, ["website", "siteweb", "url"])) {
      return "https://demo" + base + ".example.test";
    }
    if (ctx.tokenMatches(semantic, ["name", "nom"])) {
      if (entityName === "companies") {
        return pick(COMPANY_NAMES) + " " + base;
      }
      if (entityName === "groups") {
        return pick(GROUP_NAMES) + " " + base;
      }
      if (entitySemantic.indexOf("insect") !== -1) {
        return pick(INSECT_COMMON_NAMES);
      }
      if (entitySemantic.indexOf("plant") !== -1 || entitySemantic.indexOf("plante") !== -1) {
        return pick(PLANT_COMMON_NAMES);
      }
      if (entitySemantic.indexOf("animal") !== -1 || entitySemantic.indexOf("faune") !== -1) {
        return pick(ANIMAL_COMMON_NAMES);
      }
      return ctx.ucfirst(entity.singular) + " " + base;
    }
    return ctx.ucfirst(field.label || field.name) + " " + base;
  };

  C8O.crudSeed.pickSeedLookupField = function (ctx, entity) {
    var preferred = ["name", "nom", "nomcommun", "nomscientifique", "email", "title", "titre", "firstname", "prenom", "city", "ville"];
    for (var p = 0; p < preferred.length; p++) {
      var preferredField = ctx.findField(entity, function (field) {
        return !field.primary && ctx.semanticFieldToken(field) === ctx.semanticToken(preferred[p]);
      });
      if (preferredField) {
        return preferredField;
      }
    }
    var uniqueField = ctx.findField(entity, function (field) {
      return !field.primary && field.unique === true;
    });
    if (uniqueField) {
      return uniqueField;
    }
    var firstField = ctx.findField(entity, function (field) {
      return !field.primary;
    });
    return firstField || (entity && entity.primaryField) || null;
  };

  C8O.crudSeed.renderSeedValue = function (ctx, spec, entity, field, rowIndex) {
    if (field.primary) {
      return "DEFAULT";
    }
    if (field.references && field.references.entity) {
      var targetEntity = ctx.findEntityByName(spec.entities, field.references.entity);
      var lookupField = C8O.crudSeed.pickSeedLookupField(ctx, targetEntity);
      if (targetEntity && lookupField) {
        var targetValue = C8O.crudSeed.sampleValueForField(ctx, targetEntity, lookupField, rowIndex % Math.max(1, spec.seed.rowsPerEntity));
        return "(SELECT " + targetEntity.primaryField.column + " FROM " + targetEntity.name + " WHERE " + lookupField.column + " = " + seedLiteral(ctx, spec, targetValue, lookupField) + ")";
      }
    }
    return seedLiteral(ctx, spec, C8O.crudSeed.sampleValueForField(ctx, entity, field, rowIndex), field);
  };

  C8O.crudSeed.buildSeedSql = function (ctx, spec, entity) {
    if (spec.seed.enabled !== true) {
      return "";
    }
    var fields = [];
    for (var i = 0; i < entity.fields.length; i++) {
      if (!entity.fields[i].primary) {
        fields.push(entity.fields[i]);
      }
    }
    if (!fields.length) {
      return "";
    }
    var rowCount = Math.max(1, spec.seed.rowsPerEntity);
    var values = [];
    for (var row = 0; row < rowCount; row++) {
      var rowValues = [];
      for (var j = 0; j < fields.length; j++) {
        rowValues.push(C8O.crudSeed.renderSeedValue(ctx, spec, entity, fields[j], row));
      }
      values.push("  (" + rowValues.join(", ") + ")");
    }
    return "INSERT INTO " + entity.name + " (" + fields.map(function (item) { return item.column; }).join(", ") + ") VALUES\n" + values.join(",\n") + ";";
  };
})();
