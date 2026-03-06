/*
 * Marketplace helpers for ConvertigoMCP tools.
 * Handles catalog fetch and project import in workspace.
 */

include("js/util.js");
include("js/databaseobject.js");

if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.marketplace = C8O.marketplace || {};

C8O.marketplace.DEFAULT_ENDPOINT = "https://marketplace.convertigo.com/.json";
C8O.marketplace.DEFAULT_PROJECT = "marketplace";
C8O.marketplace.DEFAULT_SEQUENCE = "list_apply_kd_tree_js";
C8O.marketplace.DEFAULT_TOPIC = "library";
C8O.marketplace.DEFAULT_MB_VERSION = "8.4.0";
C8O.marketplace.DEFAULT_SDK_VERSION = "4.0.27-beta7";

C8O.marketplace._trim = function (value) {
  return value == null ? "" : String(value).trim();
};

C8O.marketplace._toInt = function (value, fallback, minValue, maxValue) {
  var parsed = fallback;
  try {
    if (value !== null && value !== undefined && String(value).trim().length > 0) {
      var maybe = parseInt(String(value).trim(), 10);
      if (!isNaN(maybe)) {
        parsed = maybe;
      }
    }
  } catch (_ignoreInt) {}
  if (minValue !== null && minValue !== undefined && parsed < minValue) {
    parsed = minValue;
  }
  if (maxValue !== null && maxValue !== undefined && parsed > maxValue) {
    parsed = maxValue;
  }
  return parsed;
};

C8O.marketplace._toBoolean = function (value, fallback) {
  if (C8O.util && typeof C8O.util.toBoolean === "function") {
    return C8O.util.toBoolean(value, fallback);
  }
  if (value === null || value === undefined) {
    return !!fallback;
  }
  var text = String(value).toLowerCase();
  if (text === "true" || text === "1" || text === "yes") {
    return true;
  }
  if (text === "false" || text === "0" || text === "no") {
    return false;
  }
  return !!fallback;
};

C8O.marketplace._asArray = function (value) {
  if (value == null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value.size === "function" && typeof value.get === "function") {
    var list = [];
    for (var i = 0; i < value.size(); i++) {
      list.push(value.get(i));
    }
    return list;
  }
  return [value];
};

C8O.marketplace.parseTopics = function (topicsValue) {
  var seen = {};
  var result = [];
  function pushTopic(value) {
    var token = C8O.marketplace._trim(value).toLowerCase();
    if (!token.length) {
      return;
    }
    if (token.charAt(0) === "[" && token.charAt(token.length - 1) === "]") {
      try {
        var parsedArray = JSON.parse(token);
        var parsedList = C8O.marketplace._asArray(parsedArray);
        for (var pi = 0; pi < parsedList.length; pi++) {
          pushTopic(parsedList[pi]);
        }
        return;
      } catch (_ignoreTopicJson) {}
    }
    var split = token.split(/[,\n;]+/);
    for (var si = 0; si < split.length; si++) {
      var part = C8O.marketplace._trim(split[si]).toLowerCase();
      if (!part.length || seen[part]) {
        continue;
      }
      seen[part] = true;
      result.push(part);
    }
  }

  var topicsInput = topicsValue;
  if (typeof topicsInput === "string") {
    var text = C8O.marketplace._trim(topicsInput);
    if (text.length > 0) {
      if (text.charAt(0) === "[") {
        try {
          topicsInput = JSON.parse(text);
        } catch (_ignoredTopicsJson) {
          topicsInput = text.split(/[,\n;]+/);
        }
      } else {
        topicsInput = text.split(/[,\n;]+/);
      }
    } else {
      topicsInput = [];
    }
  }

  var topicsList = C8O.marketplace._asArray(topicsInput);
  for (var i = 0; i < topicsList.length; i++) {
    pushTopic(topicsList[i]);
  }
  return result;
};

C8O.marketplace.normalizeListOptions = function (options) {
  var opts = options || {};
  var normalized = {};
  for (var key in opts) {
    if (Object.prototype.hasOwnProperty.call(opts, key)) {
      normalized[key] = opts[key];
    }
  }
  normalized.search = C8O.marketplace._trim(opts.search);
  normalized.topics = opts.topics;
  return normalized;
};

C8O.marketplace.entryHasTopic = function (entry, topic) {
  var wanted = C8O.marketplace._trim(topic).toLowerCase();
  if (!wanted.length) {
    return false;
  }
  var topics = C8O.marketplace.parseTopics(entry && entry.topics ? entry.topics : []);
  for (var i = 0; i < topics.length; i++) {
    if (topics[i] === wanted) {
      return true;
    }
  }
  return false;
};

C8O.marketplace.toUsageArchiveUrl = function (cloneUrl, branch) {
  var url = C8O.marketplace._trim(cloneUrl);
  var gitBranch = C8O.marketplace._trim(branch);
  if (!url.length) {
    return "";
  }
  if (/\.zip($|\?)/i.test(url) || /\.car($|\?)/i.test(url)) {
    return url;
  }

  if (url.indexOf("git@github.com:") === 0) {
    url = "https://github.com/" + url.substring("git@github.com:".length);
  } else if (url.indexOf("ssh://git@github.com/") === 0) {
    url = "https://github.com/" + url.substring("ssh://git@github.com/".length);
  }

  if (url.lastIndexOf(".git") === url.length - 4) {
    url = url.substring(0, url.length - 4);
  }
  if (!gitBranch.length) {
    gitBranch = "main";
  }
  return url + "/archive/" + gitBranch + ".zip";
};

C8O.marketplace.buildFilters = function (options) {
  var opts = options || {};
  var normalized = C8O.marketplace.normalizeListOptions(opts);
  var topics = C8O.marketplace.parseTopics(normalized.topics);
  return {
    topics: topics,
    pushed: "",
    updated: "",
    from: "",
    to: "",
    issues_pr: "",
    sort: ""
  };
};

C8O.marketplace._toRequestValue = function (value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch (_ignoreStringify) {
    return String(value);
  }
};

C8O.marketplace._extractRequesterPayload = function (document) {
  var XMLUtils = Packages.com.twinsoft.convertigo.engine.util.XMLUtils;
  if (!document) {
    return null;
  }
  var root = null;
  try {
    root = document.getDocumentElement ? document.getDocumentElement() : document;
  } catch (_ignoreRoot) {
    root = null;
  }
  if (!root) {
    return null;
  }
  var parsed = null;
  try {
    parsed = JSON.parse(String(XMLUtils.XmlToJson(root, true, true)));
  } catch (parseError) {
    throw new Error("Unable to parse marketplace connector response: " + String(parseError));
  }
  return parsed && parsed.document ? parsed.document : parsed;
};

C8O.marketplace.callConnector = function (payload) {
  var InternalRequester = Packages.com.twinsoft.convertigo.engine.requesters.InternalRequester;
  var HashMap = Packages.java.util.HashMap;

  var request = new HashMap();
  request.put("__project", "ConvertigoMCP");
  request.put("__connector", "marketplace");
  request.put("__transaction", "list_apply_kd_tree_js");
  request.put("__nolog", "true");

  var keys = Object.keys(payload || {});
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (!Object.prototype.hasOwnProperty.call(payload, key)) {
      continue;
    }
    request.put(String(key), String(C8O.marketplace._toRequestValue(payload[key])));
  }

  var requester = null;
  try {
    requester = new InternalRequester(request, context.httpServletRequest);
  } catch (_ignoreHttpRequest) {
    requester = new InternalRequester(request);
  }
  var response = requester.processRequest();
  return C8O.marketplace._extractRequesterPayload(response);
};

C8O.marketplace.queryPage = function (options) {
  var opts = C8O.marketplace.normalizeListOptions(options || {});
  var endpoint = C8O.marketplace._trim(opts.endpoint) || C8O.marketplace.DEFAULT_ENDPOINT;
  if (endpoint !== C8O.marketplace.DEFAULT_ENDPOINT) {
    throw new Error("Custom endpoint is not supported in connector mode. Use " + C8O.marketplace.DEFAULT_ENDPOINT);
  }
  var query = C8O.marketplace._trim(opts.search);
  var page = C8O.marketplace._toInt(opts.page, 1, 1, 9999);
  var filters = C8O.marketplace.buildFilters(opts);
  var contextId =
    "mcp_" +
    String(java.lang.System.currentTimeMillis()) +
    "_" +
    String(Math.floor(Math.random() * 1000000));

  var payload = {
    __localCache_ttl: String(C8O.marketplace._toInt(opts.cacheTtl, 3000, 0, 86400000)),
    __disableAutologin: "false",
    filters_selected: JSON.stringify(filters),
    q_string: query,
    page_selected: String(page),
    __uuid: "mcp-" + String(java.lang.System.currentTimeMillis()),
    __context: contextId,
    _use_post: "true"
  };

  var parsed = C8O.marketplace.callConnector(payload);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Marketplace connector returned an empty payload");
  }
  var objectPayload = parsed.object && typeof parsed.object === "object" ? parsed.object : parsed;
  if (objectPayload.object && typeof objectPayload.object === "object") {
    objectPayload = objectPayload.object;
  }
  if (!objectPayload || typeof objectPayload !== "object" || !objectPayload.filtered) {
    throw new Error("Marketplace response is missing the 'object' payload");
  }
  return {
    object: objectPayload,
    filters: filters,
    page: page
  };
};

C8O.marketplace.buildProjectUrl = function (projectName, cloneUrl, branch, autoPull) {
  var name = C8O.marketplace._trim(projectName);
  var gitUrl = C8O.marketplace._trim(cloneUrl);
  var gitBranch = C8O.marketplace._trim(branch);
  if (!name.length) {
    return "";
  }
  if (!gitUrl.length) {
    return name;
  }
  var url = name + "=" + gitUrl;
  if (gitBranch.length) {
    url += ":branch=" + gitBranch;
  }
  if (C8O.marketplace._toBoolean(autoPull, true)) {
    url += ":autoPull=true";
  }
  return url;
};

C8O.marketplace._parseTopicsFromEntry = function (entry) {
  if (!entry) {
    return [];
  }
  return C8O.marketplace.parseTopics(entry.topics);
};

C8O.marketplace.normalizeEntry = function (entry, includeRaw) {
  var source = entry || {};
  var projectName = C8O.marketplace._trim(source.name);
  var cloneUrl = C8O.marketplace._trim(source.clone_url);
  var defaultBranch = C8O.marketplace._trim(source.default_branch);
  var normalized = {
    name: projectName,
    technicalName: C8O.marketplace._trim(source.name_tech),
    description: C8O.marketplace._trim(source.description),
    topics: C8O.marketplace._parseTopicsFromEntry(source),
    stars: C8O.marketplace._toInt(source.stargazers_count, 0, 0, 1000000),
    createdAt: C8O.marketplace._trim(source.created_at),
    updatedAt: C8O.marketplace._trim(source.updated_at),
    pushedAt: C8O.marketplace._trim(source.pushed_at),
    homepage: C8O.marketplace._trim(source.homepage),
    cloneUrl: cloneUrl,
    htmlUrl: C8O.marketplace._trim(source.html_url),
    defaultBranch: defaultBranch,
    thumbnail: C8O.marketplace._trim(source.thumbnail),
    archived: C8O.marketplace._toBoolean(source.archived, false),
    disabled: C8O.marketplace._toBoolean(source.disabled, false)
  };
  normalized.projectUrl = C8O.marketplace.buildProjectUrl(
    normalized.name,
    normalized.cloneUrl,
    normalized.defaultBranch,
    true
  );
  if (includeRaw) {
    normalized.raw = source;
  }
  return normalized;
};

C8O.marketplace._dedupeEntries = function (entries) {
  var list = C8O.marketplace._asArray(entries);
  var seen = {};
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var item = list[i] || {};
    var key = C8O.marketplace._trim(item.name).toLowerCase();
    if (!key.length) {
      key = C8O.marketplace._trim(item.technicalName).toLowerCase();
    }
    if (!key.length) {
      key = String(i);
    }
    if (seen[key]) {
      continue;
    }
    seen[key] = true;
    out.push(item);
  }
  return out;
};

C8O.marketplace.list = function (options) {
  var opts = C8O.marketplace.normalizeListOptions(options || {});
  var endpoint = C8O.marketplace._trim(opts.endpoint) || C8O.marketplace.DEFAULT_ENDPOINT;
  var limitValue = C8O.marketplace._toInt(opts.limit, 20, 1, 200);
  var startIndex = C8O.marketplace._toInt(opts.cursor, 0, 0, 1000000);
  var maxPages = C8O.marketplace._toInt(opts.maxPages, 20, 1, 100);
  var includeRaw = C8O.marketplace._toBoolean(opts.includeRaw, false);
  var page = C8O.marketplace._toInt(opts.page, 1, 1, 9999);
  var totalCount = -1;
  var hasMoreServer = false;
  var entries = [];
  var pagesFetched = [];

  var targetNeeded = startIndex + limitValue;
  for (var p = 0; p < maxPages; p++) {
    var pageResult = C8O.marketplace.queryPage({
      endpoint: endpoint,
      search: opts.search,
      topics: opts.topics,
      cacheTtl: opts.cacheTtl,
      page: page,
      headers: opts.headers
    });
    var payload = pageResult.object || {};
    var filtered = C8O.marketplace._asArray(payload.filtered);
    var startValue = C8O.marketplace._toInt(payload.start, entries.length + 1, 0, 1000000000);
    var endValue = C8O.marketplace._toInt(payload.end, startValue + filtered.length - 1, 0, 1000000000);
    var currentPage = C8O.marketplace._toInt(payload.page, page, 1, 1000000);
    var parsedTotal = C8O.marketplace._toInt(payload.total_count, -1, -1, 1000000000);
    if (parsedTotal >= 0) {
      totalCount = parsedTotal;
      hasMoreServer = endValue < parsedTotal;
    } else {
      hasMoreServer = filtered.length > 0;
    }

    for (var i = 0; i < filtered.length; i++) {
      entries.push(C8O.marketplace.normalizeEntry(filtered[i], includeRaw));
    }

    pagesFetched.push({
      page: currentPage,
      returned: filtered.length,
      start: startValue,
      end: endValue
    });

    if (!hasMoreServer || filtered.length === 0) {
      break;
    }
    if (entries.length >= targetNeeded) {
      break;
    }
    page = currentPage + 1;
  }

  entries = C8O.marketplace._dedupeEntries(entries);
  if (totalCount < 0 || totalCount < entries.length) {
    totalCount = entries.length;
  }

  var effectiveStart = startIndex;
  if (effectiveStart > entries.length) {
    effectiveStart = entries.length;
  }
  var endIndex = effectiveStart + limitValue;
  if (endIndex > entries.length) {
    endIndex = entries.length;
  }
  var returned = entries.slice(effectiveStart, endIndex);
  var hasMore = endIndex < entries.length || hasMoreServer;
  var nextCursor = hasMore ? String(endIndex) : "";

  return {
    endpoint: endpoint,
    search: C8O.marketplace._trim(opts.search),
    topics: C8O.marketplace.buildFilters(opts).topics,
    totalCount: totalCount,
    returned: returned.length,
    limit: limitValue,
    startIndex: effectiveStart,
    hasMore: hasMore,
    nextCursor: nextCursor,
    entries: returned,
    pagesFetched: pagesFetched
  };
};

C8O.marketplace.resolveProject = function (projectOrName) {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  if (projectOrName && typeof projectOrName.getName === "function") {
    return projectOrName;
  }
  var name = C8O.marketplace._trim(projectOrName);
  if (!name.length) {
    return null;
  }
  try {
    return Engine.theApp.databaseObjectsManager.getOriginalProjectByName(name, false);
  } catch (_ignoredOverload) {
    try {
      return Engine.theApp.databaseObjectsManager.getOriginalProjectByName(name);
    } catch (_ignoredLookup) {
      return null;
    }
  }
};

C8O.marketplace.getLoadedProjectMap = function () {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var names = Engine.theApp.databaseObjectsManager.getAllProjectNamesList();
  var exact = {};
  var lower = {};
  for (var i = 0; i < names.size(); i++) {
    var name = String(names.get(i));
    exact[name] = true;
    lower[name.toLowerCase()] = name;
  }
  return {
    exact: exact,
    lower: lower
  };
};

C8O.marketplace.getProjectReferenceMap = function (projectOrName) {
  var ProjectSchemaReference = Packages.com.twinsoft.convertigo.beans.references.ProjectSchemaReference;
  var project = C8O.marketplace.resolveProject(projectOrName);
  var map = {
    entries: [],
    exact: {},
    lower: {}
  };
  if (project == null) {
    return map;
  }
  var refs = project.getReferenceList();
  for (var i = 0; i < refs.size(); i++) {
    var ref = refs.get(i);
    if (!(ref instanceof ProjectSchemaReference)) {
      continue;
    }
    var parser = ref.getParser();
    var referencedProject = parser != null ? C8O.marketplace._trim(parser.getProjectName()) : "";
    if (!referencedProject.length) {
      continue;
    }
    var info = {
      projectName: referencedProject,
      referenceName: C8O.marketplace._trim(ref.getName()),
      projectUrl: C8O.marketplace._trim(ref.getProjectName())
    };
    map.entries.push(info);
    map.exact[referencedProject] = info;
    map.lower[referencedProject.toLowerCase()] = info;
  }
  return map;
};

C8O.marketplace.getProjectSharedCatalog = function (projectOrName) {
  var project = C8O.marketplace.resolveProject(projectOrName);
  var result = {
    sharedComponents: [],
    sharedActions: []
  };
  if (project == null || !project.getMobileApplication) {
    return result;
  }
  var mobileApplication = null;
  try {
    mobileApplication = project.getMobileApplication();
  } catch (_ignoreMobileApp) {
    mobileApplication = null;
  }
  if (mobileApplication == null || !mobileApplication.getApplicationComponent) {
    return result;
  }
  var appComponent = null;
  try {
    appComponent = mobileApplication.getApplicationComponent();
  } catch (_ignoreAppComponent) {
    appComponent = null;
  }
  if (appComponent == null) {
    return result;
  }

  function buildEntry(component, kind) {
    var entry = {
      kind: kind,
      name: C8O.marketplace._trim(component.getName ? component.getName() : ""),
      qname: C8O.marketplace._trim(component.getQName ? component.getQName() : ""),
      fullQName: C8O.marketplace._trim(component.getFullQName ? component.getFullQName() : ""),
      enabled: component.isEnabled ? component.isEnabled() : true,
      exposed: component.isExposed ? component.isExposed() : true,
      priority: component.priority != null ? component.priority : 0
    };
    if (component.getComment) {
      entry.comment = C8O.marketplace._trim(component.getComment());
    }
    if (component.getSelector) {
      try {
        entry.selector = C8O.marketplace._trim(component.getSelector());
      } catch (_ignoreSelector) {}
    }
    if (component.getSharedModuleFullName) {
      try {
        entry.sharedModule = C8O.marketplace._trim(component.getSharedModuleFullName());
      } catch (_ignoreModule) {}
    }
    if (component.getVariables) {
      try {
        var variables = component.getVariables();
        entry.variableCount = variables != null && variables.size ? variables.size() : 0;
      } catch (_ignoreVars) {
        entry.variableCount = 0;
      }
    }
    return entry;
  }

  if (appComponent.getSharedComponentList) {
    try {
      var components = appComponent.getSharedComponentList();
      for (var i = 0; i < components.size(); i++) {
        var sharedComponent = components.get(i);
        if (sharedComponent == null) {
          continue;
        }
        if (sharedComponent.isExposed && sharedComponent.isExposed() !== true) {
          continue;
        }
        result.sharedComponents.push(buildEntry(sharedComponent, "sharedComponent"));
      }
    } catch (_ignoreSharedComponents) {}
  }

  if (appComponent.getSharedActionList) {
    try {
      var actions = appComponent.getSharedActionList();
      for (var j = 0; j < actions.size(); j++) {
        var sharedAction = actions.get(j);
        if (sharedAction == null) {
          continue;
        }
        if (sharedAction.isExposed && sharedAction.isExposed() !== true) {
          continue;
        }
        result.sharedActions.push(buildEntry(sharedAction, "sharedAction"));
      }
    } catch (_ignoreSharedActions) {}
  }

  return result;
};

C8O.marketplace.annotateEntries = function (entries, options) {
  var opts = options || {};
  var includeDetails = C8O.marketplace._toBoolean(opts.includeDetails, false);
  var list = C8O.marketplace._asArray(entries);
  var targetProject = C8O.marketplace.resolveProject(opts.targetProject || opts.project);
  var loadedMap = C8O.marketplace.getLoadedProjectMap();
  var referenceMap = targetProject ? C8O.marketplace.getProjectReferenceMap(targetProject) : null;
  var sharedCatalogCache = {};
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var item = list[i] || {};
    var name = C8O.marketplace._trim(item.name);
    var lowerName = name.toLowerCase();
    var workspaceLoaded = !!loadedMap.lower[lowerName];
    var referencedByProject = !!(referenceMap && referenceMap.lower[lowerName]);
    var status = workspaceLoaded ? "loaded" : "available";
    if (targetProject) {
      if (referencedByProject) {
        status = "referenced";
      } else if (workspaceLoaded) {
        status = "loaded-not-referenced";
      } else {
        status = "available";
      }
    }
    var cloned = {};
    for (var key in item) {
      if (Object.prototype.hasOwnProperty.call(item, key)) {
        cloned[key] = item[key];
      }
    }
    cloned.workspaceLoaded = workspaceLoaded;
    cloned.referencedByProject = referencedByProject;
    cloned.status = status;
    if (workspaceLoaded && includeDetails) {
      var projectName = loadedMap.lower[lowerName] || name;
      var cacheKey = C8O.marketplace._trim(projectName);
      if (!sharedCatalogCache[cacheKey]) {
        sharedCatalogCache[cacheKey] = C8O.marketplace.getProjectSharedCatalog(projectName);
      }
      var catalog = sharedCatalogCache[cacheKey] || { sharedComponents: [], sharedActions: [] };
      cloned.sharedComponents = catalog.sharedComponents;
      cloned.sharedActions = catalog.sharedActions;
      cloned.sharedComponentCount = catalog.sharedComponents ? catalog.sharedComponents.length : 0;
      cloned.sharedActionCount = catalog.sharedActions ? catalog.sharedActions.length : 0;
    } else {
      cloned.sharedComponents = [];
      cloned.sharedActions = [];
      cloned.sharedComponentCount = 0;
      cloned.sharedActionCount = 0;
    }
    if (referenceMap && referenceMap.lower[lowerName]) {
      cloned.reference = referenceMap.lower[lowerName];
    }
    out.push(cloned);
  }
  return out;
};

C8O.marketplace.buildSuggestions = function (entries, options) {
  var opts = options || {};
  var list = C8O.marketplace._asArray(entries);
  var projectName = C8O.marketplace._trim(opts.projectName || opts.project);
  var suggestionLimit = C8O.marketplace._toInt(opts.limit, 6, 1, 30);
  var candidates = [];

  function parseStamp(value) {
    var text = C8O.marketplace._trim(value);
    if (!text.length) {
      return 0;
    }
    try {
      var stamp = Date.parse(text);
      return isNaN(stamp) ? 0 : stamp;
    } catch (_ignoreDate) {
      return 0;
    }
  }

  for (var i = 0; i < list.length; i++) {
    var item = list[i] || {};
    if (item.referencedByProject) {
      continue;
    }
    if (item.disabled || item.archived) {
      continue;
    }
    candidates.push(item);
  }

  candidates.sort(function (a, b) {
    var starsA = C8O.marketplace._toInt(a.stars, 0, 0, 1000000);
    var starsB = C8O.marketplace._toInt(b.stars, 0, 0, 1000000);
    if (starsA !== starsB) {
      return starsB - starsA;
    }
    var pushedA = parseStamp(a.pushedAt);
    var pushedB = parseStamp(b.pushedAt);
    if (pushedA !== pushedB) {
      return pushedB - pushedA;
    }
    return C8O.marketplace._trim(a.name).localeCompare(C8O.marketplace._trim(b.name));
  });

  var suggestions = [];
  for (var j = 0; j < candidates.length && suggestions.length < suggestionLimit; j++) {
    var entry = candidates[j];
    var reason = entry.workspaceLoaded
      ? "Already loaded in workspace but not referenced by the target project."
      : "Available in marketplace and not yet loaded in workspace.";
    suggestions.push({
      name: C8O.marketplace._trim(entry.name),
      technicalName: C8O.marketplace._trim(entry.technicalName),
      status: entry.status,
      reason: reason,
      cloneUrl: C8O.marketplace._trim(entry.cloneUrl),
      defaultBranch: C8O.marketplace._trim(entry.defaultBranch),
      projectUrl: C8O.marketplace._trim(entry.projectUrl),
      actionTool: "marketplace-import",
      actionArguments: {
        project: C8O.marketplace._trim(entry.name)
      }
    });
  }
  return suggestions;
};

C8O.marketplace.findEntry = function (entries, options) {
  var opts = options || {};
  var list = C8O.marketplace._asArray(entries);
  var identifier = C8O.marketplace._trim(opts.library || opts.name || opts.identifier);
  var technicalName = C8O.marketplace._trim(opts.technicalName);
  var cloneUrl = C8O.marketplace._trim(opts.cloneUrl);
  var htmlUrl = C8O.marketplace._trim(opts.htmlUrl);

  var lookup = [];
  if (identifier.length) {
    lookup.push(identifier.toLowerCase());
  }
  if (technicalName.length) {
    lookup.push(technicalName.toLowerCase());
  }
  if (cloneUrl.length) {
    lookup.push(cloneUrl.toLowerCase());
  }
  if (htmlUrl.length) {
    lookup.push(htmlUrl.toLowerCase());
  }
  if (!lookup.length) {
    return null;
  }

  function matchesExact(entry, token) {
    var fields = [
      C8O.marketplace._trim(entry.name).toLowerCase(),
      C8O.marketplace._trim(entry.technicalName).toLowerCase(),
      C8O.marketplace._trim(entry.cloneUrl).toLowerCase(),
      C8O.marketplace._trim(entry.htmlUrl).toLowerCase()
    ];
    for (var i = 0; i < fields.length; i++) {
      if (fields[i] === token) {
        return true;
      }
    }
    return false;
  }

  function matchesPartial(entry, token) {
    var fields = [
      C8O.marketplace._trim(entry.name).toLowerCase(),
      C8O.marketplace._trim(entry.technicalName).toLowerCase(),
      C8O.marketplace._trim(entry.cloneUrl).toLowerCase(),
      C8O.marketplace._trim(entry.htmlUrl).toLowerCase(),
      C8O.marketplace._trim(entry.description).toLowerCase()
    ];
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].indexOf(token) !== -1) {
        return true;
      }
    }
    return false;
  }

  for (var j = 0; j < lookup.length; j++) {
    var token = lookup[j];
    for (var k = 0; k < list.length; k++) {
      if (matchesExact(list[k], token)) {
        return list[k];
      }
    }
  }
  for (var l = 0; l < lookup.length; l++) {
    var partialToken = lookup[l];
    for (var m = 0; m < list.length; m++) {
      if (matchesPartial(list[m], partialToken)) {
        return list[m];
      }
    }
  }
  return null;
};

C8O.marketplace.resolveEntry = function (options) {
  var opts = C8O.marketplace.normalizeListOptions(options || {});
  var projectToken = C8O.marketplace._trim(opts.project);
  if (!projectToken.length) {
    return null;
  }
  var search = C8O.marketplace._trim(opts.search);
  if (!search.length) {
    search = projectToken;
  }
  var result = C8O.marketplace.list({
    endpoint: opts.endpoint,
    search: search,
    topics: opts.topics,
    limit: C8O.marketplace._toInt(opts.searchLimit, 120, 10, 300),
    cursor: 0,
    maxPages: C8O.marketplace._toInt(opts.maxPages, 10, 1, 50)
  });
  var wanted = projectToken.toLowerCase();
  for (var i = 0; i < result.entries.length; i++) {
    var entry = result.entries[i] || {};
    var name = C8O.marketplace._trim(entry.name).toLowerCase();
    var technicalName = C8O.marketplace._trim(entry.technicalName).toLowerCase();
    if (name === wanted || technicalName === wanted) {
      return entry;
    }
  }
  return null;
};

C8O.marketplace.importLibrary = function (options) {
  var Engine = Packages.com.twinsoft.convertigo.engine.Engine;
  var ProjectUrlParser = Packages.com.twinsoft.convertigo.engine.util.ProjectUrlParser;
  var ReferencedProjectManager = Packages.com.twinsoft.convertigo.engine.ReferencedProjectManager;

  var opts = C8O.marketplace.normalizeListOptions(options || {});
  var warnings = [];
  var requestedProject = C8O.marketplace._trim(opts.project);
  var importedProjectName = C8O.marketplace._trim(opts.importedProjectName);
  var saveFlag = C8O.marketplace._toBoolean(opts.save, true);
  var forceImport = C8O.marketplace._toBoolean(opts.forceImport, false);

  if (!requestedProject.length) {
    throw new Error("project is required");
  }

  var entry = C8O.marketplace.resolveEntry({
    endpoint: opts.endpoint,
    project: requestedProject,
    search: opts.search,
    topics: opts.topics
  });
  if (entry == null) {
    throw new Error("Marketplace project not found: " + requestedProject);
  }

  var sourceProjectName = C8O.marketplace._trim(entry.name);
  if (!sourceProjectName.length) {
    throw new Error("Unable to resolve marketplace project name for: " + requestedProject);
  }

  var importKind = "project";
  if (C8O.marketplace.entryHasTopic(entry, "starter")) {
    importKind = "starter";
  } else if (C8O.marketplace.entryHasTopic(entry, "library")) {
    importKind = "library";
  }

  if (importKind === "starter" && !importedProjectName.length) {
    throw new Error("Starter project '" + sourceProjectName + "' requires importedProjectName.");
  }
  if (!importedProjectName.length) {
    importedProjectName = sourceProjectName;
  }

  var finalCloneUrl = C8O.marketplace._trim(entry.cloneUrl);
  var finalBranch = C8O.marketplace._trim(entry.defaultBranch);
  var usageUrl = C8O.marketplace.toUsageArchiveUrl(finalCloneUrl, finalBranch);
  if (!usageUrl.length) {
    throw new Error("Unable to resolve usage archive URL for project: " + sourceProjectName);
  }

  if (Engine.theApp.referencedProjectManager == null) {
    Engine.theApp.referencedProjectManager = new ReferencedProjectManager();
  }
  var refManager = Engine.theApp.referencedProjectManager;

  var loadedBefore = C8O.marketplace.resolveProject(importedProjectName) != null;
  var importedProject = null;
  var imported = false;
  var importStatus = loadedBefore ? "already-loaded" : "skipped";
  var importMessage = "";

  if (!loadedBefore) {
    try {
      var parser = new ProjectUrlParser(importedProjectName + "=" + usageUrl);
      importedProject = refManager.importProject(parser, forceImport);
      imported = importedProject != null;
      importStatus = imported ? "imported" : "missing";
      if (!imported) {
        importMessage = "Import returned no project instance";
      }
    } catch (importError) {
      importStatus = "error";
      importMessage = String(importError);
      warnings.push(importMessage);
    }
  }

  var loadedAfter = C8O.marketplace.resolveProject(importedProjectName) != null;
  var saveResult = { saved: false, message: "" };
  if (saveFlag) {
    var loadedProject = importedProject || C8O.marketplace.resolveProject(importedProjectName);
    if (loadedProject != null) {
      var saveErrors = [];
      saveResult = C8O.dbo.saveProject(loadedProject, saveErrors);
      if (saveErrors && saveErrors.length) {
        for (var i = 0; i < saveErrors.length; i++) {
          var errorItem = saveErrors[i];
          if (errorItem && errorItem.message) {
            warnings.push(String(errorItem.message));
          }
        }
      }
    }
  }

  var status = "ready";
  if (importStatus === "error") {
    status = "failed";
  } else if (!loadedAfter) {
    status = "incomplete";
  }

  return {
    status: status,
    importKind: importKind,
    targetProject: importedProjectName,
    importedProjectName: importedProjectName,
    library: sourceProjectName,
    sourceProject: sourceProjectName,
    technicalName: C8O.marketplace._trim(entry.technicalName),
    cloneUrl: finalCloneUrl,
    branch: finalBranch,
    htmlUrl: C8O.marketplace._trim(entry.htmlUrl),
    description: C8O.marketplace._trim(entry.description),
    topics: entry.topics || [],
    projectUrl: importedProjectName + "=" + usageUrl,
    loadedBefore: loadedBefore,
    loadedAfter: loadedAfter,
    imported: imported,
    importStatus: importStatus,
    importMessage: importMessage,
    addReference: false,
    referenceAlready: false,
    referenceAdded: false,
    referenceUpdated: false,
    referenceName: "",
    referenceProjectUrl: "",
    saved: saveFlag ? (saveResult.saved === true) : false,
    saveRequested: saveFlag,
    saveMessage: saveResult.message || "",
    warnings: warnings
  };
};
