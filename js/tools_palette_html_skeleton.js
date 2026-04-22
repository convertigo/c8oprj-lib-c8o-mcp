include("js/palette.js");
var __c8oPaletteJsonSkeletonAutoRun = false;
include("js/tools_palette_json_skeleton.js");

var UIStyle = Packages.com.twinsoft.convertigo.beans.ngx.components.UIStyle;
var UICustom = Packages.com.twinsoft.convertigo.beans.ngx.components.UICustom;
var UIText = Packages.com.twinsoft.convertigo.beans.ngx.components.UIText;
var UIUseShared = Packages.com.twinsoft.convertigo.beans.ngx.components.UIUseShared;

var HTML_VOID_TAGS = {
  area: true,
  base: true,
  br: true,
  col: true,
  embed: true,
  hr: true,
  img: true,
  input: true,
  link: true,
  meta: true,
  param: true,
  source: true,
  track: true,
  wbr: true
};

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

function flattenPaletteEntries(categories) {
  var source = categories || [];
  var entries = [];
  for (var i = 0; i < source.length; i++) {
    var category = source[i];
    if (!category || !category.items) {
      continue;
    }
    for (var j = 0; j < category.items.length; j++) {
      if (category.items[j]) {
        entries.push(category.items[j]);
      }
    }
  }
  return entries;
}

function findPaletteEntry(parentDbo, requestedClassName) {
  var classToken = toTrimmed(requestedClassName);
  if (!classToken.length) {
    return null;
  }
  var listResult = C8O.palette.listEntries({
    parentDbo: parentDbo,
    includeBuiltIn: true,
    includeShared: true,
    filterInfo: {
      hasFilter: true,
      text: classToken.toLowerCase(),
      raw: classToken
    },
    limit: 0,
    startIndex: 0
  }) || {};
  var entries = flattenPaletteEntries(listResult.categories);
  var lowered = classToken.toLowerCase();
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i] || {};
    var candidate = toTrimmed(entry.className).toLowerCase();
    if (candidate === lowered || candidate.indexOf(lowered + "#") === 0) {
      return entry;
    }
  }
  return null;
}

function escapeHtmlAttribute(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function stripGeneratedClassTokens(html) {
  return String(html || "").replace(/\sclass="([^"]*)"/g, function (_all, classValue) {
    var tokens = String(classValue || "").split(/\s+/);
    var kept = [];
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      if (!token || /^class\d+$/.test(token)) {
        continue;
      }
      kept.push(token);
    }
    return kept.length ? ' class="' + kept.join(" ") + '"' : "";
  });
}

function normalizeHtmlWhitespace(html) {
  return String(html || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function injectRootAttribute(html, attrName, attrValue) {
  if (!html || !toTrimmed(attrName).length) {
    return html;
  }
  return String(html).replace(/^<([A-Za-z][^\s/>]*)(\b[^>]*)>/, function (all, tagName, rest) {
    if (String(rest || "").indexOf(attrName + "=") !== -1) {
      return all;
    }
    return "<" + tagName + rest + " " + attrName + '=\"' + escapeHtmlAttribute(attrValue) + '\">';
  });
}

function buildFallbackHtml(entry, markerName, markerValue) {
  var tagName = toTrimmed(entry && (entry.tag || entry.componentName));
  if (!tagName.length) {
    return "";
  }
  if (HTML_VOID_TAGS[tagName.toLowerCase()]) {
    return "<" + tagName + " " + markerName + '=\"' + escapeHtmlAttribute(markerValue) + '\" />';
  }
  return "<" + tagName + " " + markerName + '=\"' + escapeHtmlAttribute(markerValue) + '\"></' + tagName + '>';
}

function buildAuthoringSurface(dbo, entryMeta, classToken) {
  var resolvedClassName = toTrimmed(classToken);
  var sharedQName = "";
  if (dbo instanceof UIUseShared) {
    try {
      sharedQName = toTrimmed(dbo.getSharedComponentQName());
    } catch (_ignoreSharedQName) {
      sharedQName = "";
    }
  }
  var markerName = sharedQName.length ? "data-c8o-use-shared" : "data-c8o-palette-class";
  var markerValue = sharedQName.length ? sharedQName : resolvedClassName;

  if (dbo instanceof UIStyle) {
    var scss = "";
    try {
      scss = String(dbo.getStyleContent() == null ? "" : dbo.getStyleContent().getString());
    } catch (_ignoreStyle) {
      scss = "";
    }
    return {
      surface: "scss",
      markerAttribute: markerName,
      markerValue: markerValue,
      scss: scss,
      html: ""
    };
  }

  if (dbo instanceof UICustom) {
    var customHtml = "";
    try {
      customHtml = String(dbo.getCustomTemplate() || "");
    } catch (_ignoreCustom) {
      customHtml = "";
    }
    customHtml = normalizeHtmlWhitespace(customHtml);
    if (!customHtml.length) {
      customHtml = "<!-- empty UICustom template -->";
    } else if (customHtml.charAt(0) === "<") {
      customHtml = injectRootAttribute(customHtml, markerName, markerValue);
    }
    return {
      surface: "html",
      markerAttribute: markerName,
      markerValue: markerValue,
      html: customHtml
    };
  }

  if (dbo instanceof UIText) {
    var textHtml = "";
    try {
      textHtml = String(dbo.computeTemplate() || "");
    } catch (_ignoreText) {
      textHtml = "";
    }
    return {
      surface: "text",
      markerAttribute: markerName,
      markerValue: markerValue,
      html: normalizeHtmlWhitespace(textHtml),
      text: normalizeHtmlWhitespace(textHtml)
    };
  }

  var computedHtml = "";
  try {
    computedHtml = String(dbo.computeTemplate() || "");
  } catch (_ignoreTemplate) {
    computedHtml = "";
  }
  computedHtml = normalizeHtmlWhitespace(stripGeneratedClassTokens(computedHtml));
  if (computedHtml.length && computedHtml.charAt(0) === "<") {
    computedHtml = injectRootAttribute(computedHtml, markerName, markerValue);
  }
  if (!computedHtml.length) {
    computedHtml = buildFallbackHtml(entryMeta, markerName, markerValue);
  }

  return {
    surface: "html",
    markerAttribute: markerName,
    markerValue: markerValue,
    html: computedHtml,
    tag: toTrimmed(entryMeta && entryMeta.tag),
    componentName: toTrimmed(entryMeta && entryMeta.componentName)
  };
}

function resolvePaletteHtmlSkeleton(options) {
  var opts = options || {};
  var requestedParent = toTrimmed(opts.parent);
  var requestedClassName = toTrimmed(opts.className);
  var requestedName = toTrimmed(opts.name);
  var includeHintsFlag = parseBoolean(opts.includeHints, false);

  if (!requestedParent.length) {
    throw new Error("parent is required");
  }
  if (!requestedClassName.length) {
    throw new Error("className is required");
  }

  var parentDbo = opts.parentDbo || C8O.dbo.resolve(requestedParent, { optional: true });
  if (!parentDbo) {
    throw new Error("Parent database object not found: " + requestedParent);
  }

  var jsonResult = C8O.paletteJsonSkeleton.resolve({
    parent: requestedParent,
    parentDbo: parentDbo,
    className: requestedClassName,
    name: requestedName,
    includeHints: includeHintsFlag
  });

  var resolvedClassName = toTrimmed(jsonResult && jsonResult.entry ? jsonResult.entry.resolvedClassName : requestedClassName) || requestedClassName;
  var nameSuggestion = toTrimmed(jsonResult && jsonResult.entry ? jsonResult.entry.nameSuggestion : requestedName);
  var entryMeta = findPaletteEntry(parentDbo, requestedClassName) || findPaletteEntry(parentDbo, resolvedClassName) || {};

  var dbo = C8O.dbo.instantiateForCreate(resolvedClassName || requestedClassName, parentDbo, {})
    || C8O.dbo.instantiateForCreate(requestedClassName, parentDbo, {});
  if (!dbo) {
    throw new Error("Unable to instantiate palette entry: " + requestedClassName);
  }
  if (dbo.setName && nameSuggestion.length) {
    dbo.setName(nameSuggestion);
  }
  try {
    dbo.priority = 0;
  } catch (_ignorePriority) {}

  var authoring = buildAuthoringSurface(dbo, entryMeta, resolvedClassName || requestedClassName);
  var warnings = cloneJson(jsonResult && jsonResult.warnings ? jsonResult.warnings : [], []);
  if (authoring.surface === "scss") {
    warnings.push("This palette entry does not produce authoring HTML; use the returned SCSS/content surface instead.");
  }
  if (authoring.surface === "text") {
    warnings.push("This palette entry renders as text content, not as an element wrapper.");
  }
  if (authoring.surface === "html" && !toTrimmed(authoring.html).length) {
    warnings.push("The live palette did not produce authoring HTML; fallback markup may be incomplete.");
  }

  var result = {
    status: "ok",
    source: jsonResult ? jsonResult.source : "live-palette",
    coverage: jsonResult ? jsonResult.coverage : "serialized",
    parent: jsonResult ? jsonResult.parent : {
      qname: String(parentDbo.getQName()),
      className: C8O.dbo.logicalClassNameForDbo(parentDbo)
    },
    entry: {
      className: requestedClassName,
      resolvedClassName: resolvedClassName || requestedClassName,
      nameSuggestion: nameSuggestion,
      tag: toTrimmed(entryMeta.tag),
      componentName: toTrimmed(entryMeta.componentName)
    },
    template: jsonResult ? cloneJson(jsonResult.template, jsonResult.template) : null,
    skeleton: jsonResult ? cloneJson(jsonResult.skeleton, jsonResult.skeleton) : null,
    splitFileSkeleton: jsonResult ? cloneJson(jsonResult.splitFileSkeleton, jsonResult.splitFileSkeleton) : null,
    authoring: authoring,
    warnings: warnings
  };

  if (jsonResult && jsonResult.sourceDetails != null) {
    result.sourceDetails = jsonResult.sourceDetails;
  }
  if (includeHintsFlag && jsonResult && jsonResult.propertyHints != null) {
    result.propertyHints = jsonResult.propertyHints;
  }

  return result;
}

if (typeof C8O === "undefined") {
  var C8O = {};
}
C8O.paletteHtmlSkeleton = C8O.paletteHtmlSkeleton || {};
C8O.paletteHtmlSkeleton.buildAuthoringSurface = buildAuthoringSurface;
C8O.paletteHtmlSkeleton.resolve = resolvePaletteHtmlSkeleton;

var __c8oPaletteHtmlSkeletonShouldRun = typeof __c8oPaletteHtmlSkeletonAutoRun === "undefined" || __c8oPaletteHtmlSkeletonAutoRun !== false;
if (__c8oPaletteHtmlSkeletonShouldRun) {
  paletteHtmlSkeletonResult = resolvePaletteHtmlSkeleton({
    parent: typeof parent === "undefined" ? null : parent,
    className: typeof className === "undefined" ? null : className,
    name: typeof name === "undefined" ? null : name,
    includeHints: typeof includeHints === "undefined" ? null : includeHints
  });
}
