include("js/marketplace.js");
var __c8oPaletteJsonSkeletonAutoRun = false;
include("js/tools_palette_json_skeleton.js");

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
    var arrayOut = [];
    for (var i = 0; i < value.length; i++) {
      var item = pruneNulls(value[i]);
      if (typeof item !== "undefined") {
        arrayOut.push(item);
      }
    }
    return arrayOut;
  }
  if (typeof value === "object") {
    var objectOut = {};
    for (var key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        continue;
      }
      var pruned = pruneNulls(value[key]);
      if (typeof pruned !== "undefined") {
        objectOut[key] = pruned;
      }
    }
    return objectOut;
  }
  return value;
}

function normalizeTopics(value) {
  var parsed = C8O.marketplace.parseTopics(value);
  return parsed && parsed.length ? parsed : ["library"];
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
    propertyCount: entry.propertyCount == null ? 0 : Number(entry.propertyCount)
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

function flattenPaletteCategories(categories) {
  var list = [];
  var source = categories || [];
  for (var i = 0; i < source.length; i++) {
    var category = source[i];
    if (!category || !category.items) {
      continue;
    }
    for (var j = 0; j < category.items.length; j++) {
      var entry = category.items[j];
      if (entry) {
        list.push(entry);
      }
    }
  }
  return list;
}

function buildFilterInfo(rawFilter) {
  var raw = toTrimmed(rawFilter);
  return {
    hasFilter: raw.length > 0,
    text: raw.toLowerCase(),
    raw: raw
  };
}

function listPalette(parentDbo, options) {
  var opts = options || {};
  var loadResult = C8O.palette.listEntries({
    parentDbo: parentDbo,
    includeBuiltIn: opts.includeBuiltIn !== false,
    includeShared: opts.includeShared !== false,
    filterInfo: buildFilterInfo(opts.filter),
    limit: 0,
    startIndex: 0
  }) || {};
  var categories = loadResult.categories || [];
  var entries = flattenPaletteCategories(categories);
  return {
    filter: toTrimmed(opts.filter),
    returned: loadResult.returned == null ? entries.length : Number(loadResult.returned),
    totalMatches: loadResult.totalMatches == null ? entries.length : Number(loadResult.totalMatches),
    hasMore: loadResult.hasMore === true,
    categories: categories,
    entries: entries,
    sample: (function () {
      var out = [];
      for (var i = 0; i < entries.length && out.length < 8; i++) {
        out.push(compactPaletteEntry(entries[i]));
      }
      return out;
    })()
  };
}

function findPaletteMatch(entries, requestedClassName, filterText) {
  var classToken = toTrimmed(requestedClassName).toLowerCase();
  var filterToken = toTrimmed(filterText).toLowerCase();
  var exactFilterMatches = [];
  var partialFilterMatches = [];
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i] || {};
    if (classToken.length) {
      var entryClassName = toTrimmed(entry.className).toLowerCase();
      if (entryClassName === classToken || entryClassName.indexOf(classToken + "#") === 0) {
        return entry;
      }
    }
    if (filterToken.length) {
      var fields = [entry.name, entry.className, entry.componentName, entry.tag];
      var exact = false;
      var partial = false;
      for (var j = 0; j < fields.length; j++) {
        var normalized = toTrimmed(fields[j]).toLowerCase();
        if (!normalized.length) {
          continue;
        }
        if (normalized === filterToken) {
          exact = true;
          break;
        }
        if (normalized.indexOf(filterToken) !== -1) {
          partial = true;
        }
      }
      if (exact) {
        exactFilterMatches.push(entry);
      } else if (partial) {
        partialFilterMatches.push(entry);
      }
    }
  }
  if (exactFilterMatches.length === 1) {
    return exactFilterMatches[0];
  }
  if (!classToken.length && partialFilterMatches.length === 1) {
    return partialFilterMatches[0];
  }
  return null;
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

function chooseMarketplaceEntry(entries, options) {
  var opts = options || {};
  var list = entries || [];
  var exact = C8O.marketplace.findEntry(list, {
    library: opts.library,
    identifier: opts.library || opts.search || opts.filter,
    technicalName: opts.technicalName,
    cloneUrl: opts.cloneUrl,
    htmlUrl: opts.htmlUrl
  });
  if (exact) {
    return exact;
  }
  if (list.length === 1) {
    return list[0];
  }
  return null;
}

function summarizePaletteState(listResult, matchedEntry) {
  return {
    filter: listResult.filter,
    returned: listResult.returned,
    totalMatches: listResult.totalMatches,
    hasMore: listResult.hasMore === true,
    matched: matchedEntry != null,
    matchedEntry: compactPaletteEntry(matchedEntry),
    sample: cloneJson(listResult.sample, [])
  };
}

var requestedParent = toTrimmed(parent);
var requestedClassName = toTrimmed(typeof className === "undefined" ? null : className);
var requestedName = toTrimmed(typeof name === "undefined" ? null : name);
var requestedFilter = toTrimmed(typeof filter === "undefined" ? null : filter);
var requestedLibrary = toTrimmed(typeof library === "undefined" ? null : library);
var requestedSearch = toTrimmed(typeof search === "undefined" ? null : search);
var includeHintsFlag = parseBoolean(typeof includeHints === "undefined" ? null : includeHints, false);
var autoImportFlag = parseBoolean(typeof autoImport === "undefined" ? null : autoImport, true);
var includeBuiltInFlag = parseBoolean(typeof includeBuiltIn === "undefined" ? null : includeBuiltIn, true);
var includeSharedFlag = parseBoolean(typeof includeShared === "undefined" ? null : includeShared, true);
var importedProjectNameValue = toTrimmed(typeof importedProjectName === "undefined" ? null : importedProjectName);
var marketplaceTopics = normalizeTopics(typeof topics === "undefined" ? null : topics);

if (!requestedParent.length) {
  throw new Error("parent is required");
}

var parentDbo = C8O.dbo.resolve(requestedParent, { optional: true });
if (!parentDbo) {
  throw new Error("Parent database object not found: " + requestedParent);
}

var targetProjectName = toTrimmed(parentDbo.getProject ? parentDbo.getProject().getName() : "");
var paletteFilter = requestedFilter.length ? requestedFilter : requestedClassName;
var warnings = [];

var paletteBefore = listPalette(parentDbo, {
  filter: paletteFilter,
  includeBuiltIn: includeBuiltInFlag,
  includeShared: includeSharedFlag
});
var paletteMatchBefore = findPaletteMatch(paletteBefore.entries, requestedClassName, requestedFilter || paletteFilter);

var resolvedVia = "none";
var skeletonResult = null;
var marketplaceChecked = false;
var marketplaceQuery = deriveSearchQuery({
  search: requestedSearch,
  library: requestedLibrary,
  filter: requestedFilter
});
var annotatedEntries = [];
var marketplaceEntry = null;
var importResult = null;
var importAttempted = false;
var paletteAfter = null;
var paletteMatchAfter = null;

if (paletteMatchBefore != null) {
  resolvedVia = "palette";
  if (requestedClassName.length) {
    skeletonResult = C8O.paletteJsonSkeleton.resolve({
      parent: requestedParent,
      parentDbo: parentDbo,
      className: requestedClassName,
      name: requestedName,
      includeHints: includeHintsFlag
    });
  }
} else {
  marketplaceChecked = true;
  if (!marketplaceQuery.length) {
    warnings.push("Palette match was not found and no marketplace search query could be derived. Provide library or search to enable auto-import.");
  } else {
    var localMarketplaceEntry = C8O.marketplace.resolveLoadedEntry({
      identifier: requestedLibrary || marketplaceQuery,
      targetProject: targetProjectName
    });
    if (localMarketplaceEntry) {
      annotatedEntries = [localMarketplaceEntry];
      marketplaceEntry = localMarketplaceEntry;
    } else {
      var marketplaceListResult = C8O.marketplace.list({
        search: marketplaceQuery,
        topics: marketplaceTopics,
        limit: 20,
        maxPages: 10
      });
      annotatedEntries = C8O.marketplace.annotateEntries(marketplaceListResult.entries, {
        targetProject: targetProjectName,
        includeDetails: true
      });
      marketplaceEntry = chooseMarketplaceEntry(annotatedEntries, {
        library: requestedLibrary,
        search: marketplaceQuery,
        filter: requestedFilter
      });
    }

    if (marketplaceEntry && autoImportFlag) {
      if (marketplaceEntry.referencedByProject === true) {
        warnings.push("Marketplace entry is already referenced by the target project; rereading palette only.");
      } else {
        importAttempted = true;
        importResult = C8O.marketplace.importLibrary({
          project: marketplaceEntry.name,
          importedProjectName: importedProjectNameValue,
          targetProject: targetProjectName,
          search: marketplaceQuery,
          topics: marketplaceTopics,
          save: true,
          forceImport: false
        });
        if (importResult && importResult.warnings && importResult.warnings.length) {
          for (var wi = 0; wi < importResult.warnings.length; wi++) {
            warnings.push(String(importResult.warnings[wi]));
          }
        }
      }
    }

    paletteAfter = listPalette(parentDbo, {
      filter: paletteFilter,
      includeBuiltIn: includeBuiltInFlag,
      includeShared: includeSharedFlag
    });
    paletteMatchAfter = findPaletteMatch(paletteAfter.entries, requestedClassName, requestedFilter || paletteFilter);
    if (paletteMatchAfter != null) {
      resolvedVia = importAttempted ? "marketplace-import" : "marketplace-refresh";
      if (requestedClassName.length) {
        skeletonResult = C8O.paletteJsonSkeleton.resolve({
          parent: requestedParent,
          parentDbo: parentDbo,
          className: requestedClassName,
          name: requestedName,
          includeHints: includeHintsFlag
        });
      }
    }
  }
}

var suggestions = marketplaceChecked
  ? C8O.marketplace.buildSuggestions(annotatedEntries, { project: targetProjectName, limit: 6 })
  : [];

var status = "unresolved";
if (resolvedVia === "palette") {
  status = "resolved_from_palette";
} else if (resolvedVia === "marketplace-import") {
  status = "resolved_after_marketplace_import";
} else if (resolvedVia === "marketplace-refresh") {
  status = "resolved_after_marketplace_refresh";
} else if (marketplaceChecked && marketplaceEntry) {
  status = "marketplace_candidate_found";
}

var paletteResolveWithMarketplacePayload = {
  status: status,
  resolvedVia: resolvedVia,
  parent: {
    qname: requestedParent,
    className: C8O.dbo.logicalClassNameForDbo(parentDbo),
    project: targetProjectName
  },
  request: {
    className: requestedClassName,
    filter: requestedFilter,
    library: requestedLibrary,
    search: requestedSearch,
    topics: marketplaceTopics,
    autoImport: autoImportFlag,
    includeBuiltIn: includeBuiltInFlag,
    includeShared: includeSharedFlag
  },
  palette: {
    before: summarizePaletteState(paletteBefore, paletteMatchBefore),
    after: paletteAfter ? summarizePaletteState(paletteAfter, paletteMatchAfter) : null
  },
  marketplace: {
    checked: marketplaceChecked,
    query: marketplaceQuery,
    returned: annotatedEntries.length,
    matchedEntry: compactMarketplaceEntry(marketplaceEntry),
    sample: (function () {
      var out = [];
      for (var i = 0; i < annotatedEntries.length && out.length < 8; i++) {
        out.push(compactMarketplaceEntry(annotatedEntries[i]));
      }
      return out;
    })(),
    suggestions: cloneJson(suggestions, []),
    importAttempted: importAttempted,
    importResult: cloneJson(importResult, importResult)
  },
  warnings: warnings
};

if (skeletonResult) {
  paletteResolveWithMarketplacePayload.coverage = skeletonResult.coverage;
  paletteResolveWithMarketplacePayload.source = skeletonResult.source;
  paletteResolveWithMarketplacePayload.entry = skeletonResult.entry;
  paletteResolveWithMarketplacePayload.template = skeletonResult.template;
  paletteResolveWithMarketplacePayload.skeleton = skeletonResult.skeleton;
  paletteResolveWithMarketplacePayload.splitFileSkeleton = skeletonResult.splitFileSkeleton;
  if (skeletonResult.sourceDetails != null) {
    paletteResolveWithMarketplacePayload.sourceDetails = skeletonResult.sourceDetails;
  }
  if (skeletonResult.propertyHints != null) {
    paletteResolveWithMarketplacePayload.propertyHints = skeletonResult.propertyHints;
  }
  if (skeletonResult.warnings && skeletonResult.warnings.length) {
    for (var si = 0; si < skeletonResult.warnings.length; si++) {
      warnings.push(String(skeletonResult.warnings[si]));
    }
  }
}

paletteResolveWithMarketplaceResult = cloneJson(
  pruneNulls(paletteResolveWithMarketplacePayload),
  {
    status: status,
    resolvedVia: resolvedVia,
    warnings: cloneJson(warnings, [])
  }
) || {
  status: status,
  resolvedVia: resolvedVia,
  warnings: cloneJson(warnings, [])
};
