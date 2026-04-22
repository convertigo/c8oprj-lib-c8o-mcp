include("js/marketplace.js");
var __c8oPaletteHtmlSkeletonAutoRun = false;
include("js/tools_palette_html_skeleton.js");

function toTrimmed(value) {
  return value == null ? "" : String(value).trim();
}

function parseBoolean(value, defaultValue) {
  if (value === null || typeof value === "undefined") {
    return defaultValue;
  }
  var text = String(value).trim().toLowerCase();
  if (!text.length) {
    return defaultValue;
  }
  if (text === "true" || text === "1" || text === "yes" || text === "on") {
    return true;
  }
  if (text === "false" || text === "0" || text === "no" || text === "off") {
    return false;
  }
  return defaultValue;
}

function parseInteger(value, defaultValue) {
  if (value === null || typeof value === "undefined") {
    return defaultValue;
  }
  var text = String(value).trim();
  if (!text.length) {
    return defaultValue;
  }
  try {
    var parsed = parseInt(text, 10);
    if (isNaN(parsed) || !isFinite(parsed)) {
      return defaultValue;
    }
    return parsed;
  } catch (_ignoreParsed) {
    return defaultValue;
  }
}

function cloneJson(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_ignoreClone) {
    return fallback;
  }
}

function pruneNulls(value) {
  if (value === null || typeof value === "undefined") {
    return undefined;
  }
  if (Array.isArray(value)) {
    var outArray = [];
    for (var i = 0; i < value.length; i++) {
      var item = pruneNulls(value[i]);
      if (typeof item !== "undefined") {
        outArray.push(item);
      }
    }
    return outArray;
  }
  if (typeof value === "object") {
    var outObject = {};
    for (var key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        continue;
      }
      var pruned = pruneNulls(value[key]);
      if (typeof pruned !== "undefined") {
        outObject[key] = pruned;
      }
    }
    return outObject;
  }
  return value;
}

function flattenPaletteEntries(categories) {
  var source = categories || [];
  var entries = [];
  for (var i = 0; i < source.length; i++) {
    var category = source[i];
    if (!category || !category.items) {
      continue;
    }
    for (var j = 0; j < category.items.length; j++) {
      var entry = category.items[j];
      if (entry) {
        entries.push(entry);
      }
    }
  }
  return entries;
}

function compactPaletteEntry(entry) {
  if (!entry) {
    return null;
  }
  return {
    name: toTrimmed(entry.name),
    className: toTrimmed(entry.className),
    category: toTrimmed(entry.category),
    group: toTrimmed(entry.group),
    componentName: toTrimmed(entry.componentName),
    tag: toTrimmed(entry.tag),
    builtin: entry.builtin === true,
    additional: entry.additional === true,
    propertyCount: entry.propertyCount == null ? 0 : Number(entry.propertyCount),
    nameSuggestion: toTrimmed(entry.nameSuggestion)
  };
}

function compactMarketplaceEntry(entry) {
  if (!entry) {
    return null;
  }
  return {
    name: toTrimmed(entry.name),
    technicalName: toTrimmed(entry.technicalName),
    status: toTrimmed(entry.status),
    workspaceLoaded: entry.workspaceLoaded === true,
    referencedByProject: entry.referencedByProject === true,
    stars: entry.stars == null ? 0 : Number(entry.stars),
    topics: cloneJson(entry.topics || [], []),
    cloneUrl: toTrimmed(entry.cloneUrl),
    defaultBranch: toTrimmed(entry.defaultBranch),
    htmlUrl: toTrimmed(entry.htmlUrl),
    sharedComponentCount: entry.sharedComponentCount == null ? 0 : Number(entry.sharedComponentCount),
    sharedActionCount: entry.sharedActionCount == null ? 0 : Number(entry.sharedActionCount)
  };
}

function buildFilterInfo(rawFilter) {
  var raw = toTrimmed(rawFilter);
  return {
    hasFilter: raw.length > 0,
    text: raw.toLowerCase(),
    raw: raw
  };
}

function categoryCounts(categories) {
  var source = categories || [];
  var out = [];
  for (var i = 0; i < source.length; i++) {
    var category = source[i];
    if (!category) {
      continue;
    }
    out.push({
      name: toTrimmed(category.name),
      type: toTrimmed(category.type),
      count: category.items && category.items.length ? Number(category.items.length) : 0
    });
  }
  return out;
}

function canBuildAuthoring(parentDbo, classToken) {
  if (!parentDbo || !C8O.dbo || typeof C8O.dbo._isNgxParent !== "function" || C8O.dbo._isNgxParent(parentDbo) !== true) {
    return false;
  }
  var token = toTrimmed(classToken);
  if (!token.length) {
    return false;
  }
  if (typeof C8O.dbo.parseLogicalClassToken === "function" && typeof C8O.dbo._isNgxClassFqcn === "function") {
    var parsed = C8O.dbo.parseLogicalClassToken(token);
    return parsed && parsed.baseClassFqcn && C8O.dbo._isNgxClassFqcn(parsed.baseClassFqcn) === true;
  }
  return true;
}

function deriveSearchQuery(options) {
  var opts = options || {};
  var tokens = [opts.search, opts.library, opts.filter];
  for (var i = 0; i < tokens.length; i++) {
    var token = toTrimmed(tokens[i]);
    if (token.length) {
      return token;
    }
  }
  return "";
}

function normalizeTopics(value) {
  var parsed = C8O.marketplace.parseTopics(value);
  return parsed && parsed.length ? parsed : ["library"];
}

function buildMarketplaceSection(parentDbo, options) {
  var opts = options || {};
  var searchQuery = deriveSearchQuery(opts);
  var checked = opts.includeMarketplace === true;
  var topics = normalizeTopics(opts.topics);
  var warnings = [];
  var entries = [];
  var suggestions = [];

  if (checked && !searchQuery.length) {
    warnings.push("Marketplace discovery was requested but no search/library/filter hint was provided.");
  }

  if (checked && searchQuery.length) {
    var targetProjectName = toTrimmed(parentDbo && parentDbo.getProject ? parentDbo.getProject().getName() : "");
    var listed = C8O.marketplace.list({
      search: searchQuery,
      topics: topics,
      limit: opts.marketplaceLimit > 0 ? opts.marketplaceLimit : 12,
      maxPages: 10
    });
    var annotated = C8O.marketplace.annotateEntries(listed.entries, {
      targetProject: targetProjectName,
      includeDetails: true
    });
    for (var i = 0; i < annotated.length; i++) {
      entries.push(compactMarketplaceEntry(annotated[i]));
    }
    suggestions = cloneJson(C8O.marketplace.buildSuggestions(annotated, {
      project: targetProjectName,
      limit: 8
    }), []);
  }

  return {
    checked: checked,
    query: searchQuery,
    topics: topics,
    returned: entries.length,
    entries: entries,
    suggestions: suggestions,
    warnings: warnings
  };
}

function buildAuthoringEntry(parentDbo, entry, includeHintsFlag, includeSkeletonFlag) {
  var classToken = toTrimmed(entry && entry.className);
  if (!classToken.length) {
    return null;
  }

  var dbo = C8O.dbo.instantiateForCreate(classToken, parentDbo, {});
  if (!dbo) {
    return {
      entry: compactPaletteEntry(entry),
      warnings: ["Unable to instantiate palette entry: " + classToken]
    };
  }

  var nameSuggestion = toTrimmed(entry.nameSuggestion) || C8O.palette.suggestTechnicalName(entry.name || classToken);
  if (dbo.setName && nameSuggestion.length) {
    dbo.setName(nameSuggestion);
  }
  try {
    dbo.priority = 0;
  } catch (_ignorePriority) {}

  var authoring = C8O.paletteHtmlSkeleton.buildAuthoringSurface(dbo, entry, classToken);
  var result = {
    entry: Object.assign(compactPaletteEntry(entry), {
      resolvedClassName: classToken,
      nameSuggestion: nameSuggestion
    }),
    source: "live-palette",
    coverage: "serialized",
    template: {
      related: String(parentDbo.getQName()),
      mode: "inside",
      className: classToken,
      name: nameSuggestion
    },
    authoring: authoring,
    warnings: []
  };

  if (includeSkeletonFlag) {
    try {
      var jsonSkeleton = C8O.paletteJsonSkeleton.resolve({
        parent: String(parentDbo.getQName()),
        parentDbo: parentDbo,
        className: classToken,
        name: nameSuggestion,
        includeHints: includeHintsFlag
      });
      if (jsonSkeleton) {
        if (jsonSkeleton.source) {
          result.source = String(jsonSkeleton.source);
        }
        if (jsonSkeleton.coverage) {
          result.coverage = String(jsonSkeleton.coverage);
        }
        if (jsonSkeleton.template) {
          result.template = cloneJson(jsonSkeleton.template, result.template);
        }
        if (jsonSkeleton.skeleton) {
          result.skeleton = cloneJson(jsonSkeleton.skeleton, null);
        }
        if (jsonSkeleton.splitFileSkeleton) {
          result.splitFileSkeleton = cloneJson(jsonSkeleton.splitFileSkeleton, null);
        }
        if (jsonSkeleton.sourceDetails) {
          result.sourceDetails = cloneJson(jsonSkeleton.sourceDetails, null);
        }
        if (includeHintsFlag && jsonSkeleton.propertyHints) {
          result.propertyHints = cloneJson(jsonSkeleton.propertyHints, []);
        }
        if (jsonSkeleton.warnings && jsonSkeleton.warnings.length) {
          for (var jw = 0; jw < jsonSkeleton.warnings.length; jw++) {
            var jsonWarning = String(jsonSkeleton.warnings[jw]);
            if (result.warnings.indexOf(jsonWarning) === -1) {
              result.warnings.push(jsonWarning);
            }
          }
        }
      }
    } catch (jsonSkeletonError) {
      result.warnings.push("Unable to attach JSON skeleton for " + classToken + ": " + jsonSkeletonError);
    }
  }

  if (authoring.surface === "scss") {
    result.warnings.push("This palette entry does not produce authoring HTML; use the returned SCSS/content surface instead.");
  }
  if (authoring.surface === "text") {
    result.warnings.push("This palette entry renders as text content, not as an element wrapper.");
  }
  if (authoring.surface === "html" && !toTrimmed(authoring.html).length) {
    result.warnings.push("The live palette did not produce authoring HTML; fallback markup may be incomplete.");
  }

  if (includeHintsFlag) {
    try {
      var describe = C8O.palette.describePaletteEntry({
        className: classToken,
        name: entry.name,
        parentDbo: parentDbo
      });
      if (describe && describe.propertyHints) {
        result.propertyHints = cloneJson(describe.propertyHints, []);
      }
    } catch (_ignoreDescribe) {}
  }

  return result;
}

function resolvePaletteAuthoringCatalog(options) {
  var opts = options || {};
  var requestedParent = toTrimmed(opts.parent);
  var requestedFilter = toTrimmed(opts.filter);
  var includeBuiltInFlag = parseBoolean(opts.includeBuiltIn, true);
  var includeSharedFlag = parseBoolean(opts.includeShared, true);
  var includeHintsFlag = parseBoolean(opts.includeHints, false);
  var includeMarketplaceFlag = parseBoolean(opts.includeMarketplace, false);
  var includeSkeletonFlag = parseBoolean(opts.includeSkeleton, false);
  var limitValue = Math.max(0, parseInteger(opts.limit, 0));
  var startIndexValue = Math.max(0, parseInteger(opts._nextCursor, 0));
  var marketplaceLimitValue = Math.max(1, parseInteger(opts.marketplaceLimit, 12));

  if (!requestedParent.length) {
    throw new Error("parent is required");
  }

  var parentDbo = opts.parentDbo || C8O.dbo.resolve(requestedParent, { optional: true });
  if (!parentDbo) {
    throw new Error("Parent database object not found: " + requestedParent);
  }
  if (!C8O.dbo || typeof C8O.dbo._isNgxParent !== "function" || C8O.dbo._isNgxParent(parentDbo) !== true) {
    throw new Error("palette-authoring-catalog only supports NGX frontend parents");
  }

  var loadResult = C8O.palette.listEntries({
    parentDbo: parentDbo,
    includeBuiltIn: includeBuiltInFlag,
    includeShared: includeSharedFlag,
    filterInfo: buildFilterInfo(requestedFilter),
    limit: limitValue,
    startIndex: startIndexValue
  }) || {};

  var categories = loadResult.categories || [];
  var flatEntries = flattenPaletteEntries(categories);
  var warnings = [];
  var results = [];
  for (var i = 0; i < flatEntries.length; i++) {
    var candidate = flatEntries[i];
    if (!canBuildAuthoring(parentDbo, candidate && candidate.className)) {
      continue;
    }
    var built = buildAuthoringEntry(parentDbo, candidate, includeHintsFlag, includeSkeletonFlag);
    if (!built) {
      continue;
    }
    results.push(pruneNulls(built));
    if (built.warnings && built.warnings.length) {
      for (var wi = 0; wi < built.warnings.length; wi++) {
        var warning = String(built.warnings[wi]);
        if (warnings.indexOf(warning) === -1) {
          warnings.push(warning);
        }
      }
    }
  }

  var marketplace = buildMarketplaceSection(parentDbo, {
    includeMarketplace: includeMarketplaceFlag,
    search: opts.search,
    library: opts.library,
    filter: requestedFilter,
    topics: opts.topics,
    marketplaceLimit: marketplaceLimitValue
  });
  for (var mi = 0; mi < marketplace.warnings.length; mi++) {
    if (warnings.indexOf(marketplace.warnings[mi]) === -1) {
      warnings.push(marketplace.warnings[mi]);
    }
  }

  return pruneNulls({
    status: "ok",
    parent: {
      qname: String(parentDbo.getQName()),
      className: C8O.dbo.logicalClassNameForDbo(parentDbo),
      project: toTrimmed(parentDbo.getProject ? parentDbo.getProject().getName() : "")
    },
    request: {
      filter: requestedFilter,
      includeBuiltIn: includeBuiltInFlag,
      includeShared: includeSharedFlag,
      includeHints: includeHintsFlag,
      includeSkeleton: includeSkeletonFlag,
      includeMarketplace: includeMarketplaceFlag,
      limit: limitValue > 0 ? limitValue : null,
      startIndex: startIndexValue > 0 ? startIndexValue : 0,
      marketplaceLimit: marketplaceLimitValue,
      search: toTrimmed(opts.search),
      library: toTrimmed(opts.library),
      topics: normalizeTopics(opts.topics)
    },
    palette: {
      returned: loadResult.returned == null ? results.length : Number(loadResult.returned),
      totalMatches: loadResult.totalMatches == null ? results.length : Number(loadResult.totalMatches),
      hasMore: loadResult.hasMore === true,
      nextCursor: loadResult.hasMore === true ? String(loadResult.nextCursor || (startIndexValue + results.length)) : "",
      categories: categoryCounts(categories)
    },
    entries: results,
    marketplace: marketplace,
    warnings: warnings
  });
}

if (typeof C8O === "undefined") {
  var C8O = {};
}
C8O.paletteAuthoringCatalog = C8O.paletteAuthoringCatalog || {};
C8O.paletteAuthoringCatalog.resolve = resolvePaletteAuthoringCatalog;

paletteAuthoringCatalogResult = resolvePaletteAuthoringCatalog({
  parent: typeof parent === "undefined" ? null : parent,
  filter: typeof filter === "undefined" ? null : filter,
  includeBuiltIn: typeof includeBuiltIn === "undefined" ? null : includeBuiltIn,
  includeShared: typeof includeShared === "undefined" ? null : includeShared,
  includeHints: typeof includeHints === "undefined" ? null : includeHints,
  includeSkeleton: typeof includeSkeleton === "undefined" ? null : includeSkeleton,
  includeMarketplace: typeof includeMarketplace === "undefined" ? null : includeMarketplace,
  limit: typeof limit === "undefined" ? null : limit,
  _nextCursor: typeof _nextCursor === "undefined" ? null : _nextCursor,
  search: typeof search === "undefined" ? null : search,
  library: typeof library === "undefined" ? null : library,
  topics: typeof topics === "undefined" ? null : topics,
  marketplaceLimit: typeof marketplaceLimit === "undefined" ? null : marketplaceLimit
});
