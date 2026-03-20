if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.crudUiActions = C8O.crudUiActions || {};

(function () {
  if (C8O.crudUiActions._initialized === true) {
    return;
  }
  C8O.crudUiActions._initialized = true;

  function entityPagesDefaultDraft(_ctx, config) {
    var draft = {};
    var fields = _ctx.ensureArray(config && config.editableFields);
    for (var i = 0; i < fields.length; i++) {
      draft[fields[i].column] = "";
    }
    return draft;
  }

  function relationSearchResetLines(configVarName) {
    var cfg = String(configVarName || "config");
    return [
      "var relationSearch = Object.assign({}, page.global.crudRelationSearch || {});",
      "var relationFields = Array.isArray(" + cfg + ".relationFields) ? " + cfg + ".relationFields : [];",
      "for (var relationIndex = 0; relationIndex < relationFields.length; relationIndex++) {",
      "  var relationField = relationFields[relationIndex] || {};",
      "  delete relationSearch[String(" + cfg + ".key || '') + '::' + String(relationField['column'] || '')];",
      "}",
      "page.global.crudRelationSearch = relationSearch;"
    ];
  }

  function buildEntityPagesBootstrapActionScript(ctx, projectName, facadePrefix, entities, stage) {
    var configs = entities.map(function (entity) {
      var config = ctx.entityUiConfig(projectName, facadePrefix, entity, entities);
      config.defaultDraft = entityPagesDefaultDraft(ctx, config);
      return config;
    });
    return [
      "page.global = page.global || {};",
      "var configs = " + JSON.stringify(configs) + ";",
      "var cloneRecord = function(item) { try { return JSON.parse(JSON.stringify(item || {})); } catch (e) { return item || {}; } };",
      "var extractRows = function(result) { return Array.isArray(result?.sql_output) ? result.sql_output : (Array.isArray(result?.transaction?.document?.sql_output) ? result.transaction.document.sql_output : []); };",
      "var statusOf = function(result) { return (result && result.status) ? result.status : 'ok'; };",
      "page.global.crudBuildStage = " + ctx.scriptLiteral(ctx.trimmed(stage || "bootstrap")) + ";",
      "page.global.crudLoading = true;",
      "page.global.crudError = '';",
      "page.global.crudStatus = 'loading';",
      "page.global.crudRows = {};",
      "page.global.crudCounts = {};",
      "page.global.crudSamples = {};",
      "page.global.crudSelected = {};",
      "page.global.crudDrafts = {};",
      "page.global.crudRelationSearch = {};",
      "page.global.crudModes = {};",
      "page.global.crudEntityStatus = {};",
      "page.global.crudEntityErrors = {};",
      "page.ref.markForCheck();",
      "try {",
      "  var results = await Promise.all(configs.map(async function(config) {",
      "    try {",
      "      var result = " + ctx.actionCallFromExpressionSnippet("config.listRequestable", "{}", 3000, 5000, true) + ";",
      "      return { config: config, rows: extractRows(result), status: statusOf(result), error: statusOf(result) === 'ok' ? '' : (result?.error || ('Unable to load ' + String(config.label || config.key).toLowerCase())) };",
      "    } catch (e) {",
      "      var message = (e && e.message) ? e.message : ('' + e);",
      "      page.c8o.log.debug('[MB] crud_bootstrap_dashboard failed for ' + String((config && config.key) || 'entity'), e);",
      "      return { config: config, rows: [], status: 'error', error: message || ('Unable to load ' + String(config.label || config.key).toLowerCase()) };",
      "    }",
      "  }));",
      "  var rowsByKey = {};",
      "  var countsByKey = {};",
      "  var samplesByKey = {};",
      "  var selectedByKey = {};",
      "  var draftsByKey = {};",
      "  var modesByKey = {};",
      "  var statusByKey = {};",
      "  var errorsByKey = {};",
      "  var firstError = '';",
      "  for (var i = 0; i < results.length; i++) {",
      "    var item = results[i];",
      "    var key = item.config.key;",
      "    var rows = Array.isArray(item.rows) ? item.rows : [];",
      "    var selected = rows[0] || null;",
      "    rowsByKey[key] = rows;",
      "    countsByKey[key] = rows.length;",
      "    samplesByKey[key] = rows[0] || null;",
      "    selectedByKey[key] = selected;",
      "    draftsByKey[key] = cloneRecord(selected || item.config.defaultDraft || {});",
      "    modesByKey[key] = selected ? 'update' : 'create';",
      "    statusByKey[key] = item.status === 'ok' ? (rows.length ? 'ready' : 'empty') : 'error';",
      "    errorsByKey[key] = item.status === 'ok' ? '' : (item.error || ('Unable to load ' + String(item.config.label || key).toLowerCase()));",
      "    if (!firstError && errorsByKey[key]) {",
      "      firstError = errorsByKey[key];",
      "    }",
      "  }",
      "  page.global.crudRows = rowsByKey;",
      "  page.global.crudCounts = countsByKey;",
      "  page.global.crudSamples = samplesByKey;",
      "  page.global.crudSelected = selectedByKey;",
      "  page.global.crudDrafts = draftsByKey;",
      "  page.global.crudModes = modesByKey;",
      "  page.global.crudEntityStatus = statusByKey;",
      "  page.global.crudEntityErrors = errorsByKey;",
      "  page.global.crudError = firstError;",
      "  page.global.crudStatus = firstError ? 'error' : 'ok';",
      "  page.ref.markForCheck();",
      "  return { status: page.global.crudStatus, results: results };",
      "} finally {",
      "  page.global.crudLoading = false;",
      "  page.ref.markForCheck();",
      "}"
    ].join("\n");
  }

  function buildEntityPagesRefreshActionScript(ctx, config) {
    var cfg = ctx.clone(config);
    cfg.defaultDraft = entityPagesDefaultDraft(ctx, config);
    return [
      "page.global = page.global || {};",
      "var config = " + JSON.stringify(cfg) + ";",
      "var cloneRecord = function(item) { try { return JSON.parse(JSON.stringify(item || {})); } catch (e) { return item || {}; } };",
      "var extractRows = function(result) { return Array.isArray(result?.sql_output) ? result.sql_output : (Array.isArray(result?.transaction?.document?.sql_output) ? result.transaction.document.sql_output : []); };",
      "var normalizeId = function(item) { return item ? String(item?.ID ?? item?.id ?? '') : ''; };",
      "var hasAnyErrors = function() { var errors = page.global?.crudEntityErrors || {}; for (var key in errors) { if (errors[key]) { return true; } } return false; };",
      "var key = config.key;",
      "var previousSelected = ((page.global?.crudSelected || {})[key]) || null;",
      "var previousDraft = cloneRecord(((page.global?.crudDrafts || {})[key]) || {});",
      "var previousMode = ((page.global?.crudModes || {})[key]) || 'update';",
      "var previousSelectedId = normalizeId(previousSelected);",
      "page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [key]: 'loading' });",
      "page.global.crudEntityErrors = Object.assign({}, page.global.crudEntityErrors || {}, { [key]: '' });",
      "page.ref.markForCheck();",
      "try {",
      "  var result = " + ctx.actionCallSnippet(cfg.listRequestable, "{}", 3000, 5000, true) + ";",
      "  var rows = extractRows(result);",
      "  var selected = rows.find(function(row) { return normalizeId(row) === previousSelectedId; }) || rows[0] || null;",
      "  var mode = previousMode === 'create' && !previousSelectedId ? 'create' : (selected ? 'update' : 'create');",
      "  var draft = mode === 'create' ? Object.assign({}, config.defaultDraft || {}, previousDraft || {}) : cloneRecord(selected || config.defaultDraft || {});",
      "  page.global.crudRows = Object.assign({}, page.global.crudRows || {}, { [key]: rows });",
      "  page.global.crudCounts = Object.assign({}, page.global.crudCounts || {}, { [key]: rows.length });",
      "  page.global.crudSamples = Object.assign({}, page.global.crudSamples || {}, { [key]: rows[0] || null });",
      "  page.global.crudSelected = Object.assign({}, page.global.crudSelected || {}, { [key]: selected });",
      "  page.global.crudDrafts = Object.assign({}, page.global.crudDrafts || {}, { [key]: draft });",
      relationSearchResetLines("config")[0],
      relationSearchResetLines("config")[1],
      relationSearchResetLines("config")[2],
      relationSearchResetLines("config")[3],
      relationSearchResetLines("config")[4],
      relationSearchResetLines("config")[5],
      "  page.global.crudModes = Object.assign({}, page.global.crudModes || {}, { [key]: mode });",
      "  page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [key]: rows.length ? 'ready' : 'empty' });",
      "  page.global.crudEntityErrors = Object.assign({}, page.global.crudEntityErrors || {}, { [key]: '' });",
      "  page.global.crudError = hasAnyErrors() ? (page.global.crudError || '') : '';",
      "  page.global.crudStatus = hasAnyErrors() ? 'error' : 'ok';",
      "  page.ref.markForCheck();",
      "  return result;",
      "} catch (e) {",
      "  var message = (e && e.message) ? e.message : ('' + e);",
      "  page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [key]: 'error' });",
      "  page.global.crudEntityErrors = Object.assign({}, page.global.crudEntityErrors || {}, { [key]: message || ('Unable to load ' + String(config.label || key).toLowerCase()) });",
      "  page.global.crudError = page.global.crudEntityErrors[key];",
      "  page.global.crudStatus = 'error';",
      "  page.c8o.log.debug('[MB] crud_refresh_' + key + ' failed', e);",
      "  page.ref.markForCheck();",
      "  return { status: 'error', error: page.global.crudError, sql_output: [] };",
      "}"
    ].join("\n");
  }

  function buildEntityPagesOpenPageScript(ctx, config) {
    return [
      "var route = " + ctx.scriptLiteral(config.routePath) + ";",
      "try {",
      "  if (page && page['angularRouter'] && typeof page['angularRouter'].navigateByUrl === 'function') {",
      "    return await page['angularRouter'].navigateByUrl(route);",
      "  }",
      "  if (page && page.router && page.router['angularRouter'] && typeof page.router['angularRouter'].navigateByUrl === 'function') {",
      "    return await page.router['angularRouter'].navigateByUrl(route);",
      "  }",
      "  if (page && typeof page['navigateByUrl'] === 'function') {",
      "    return await page['navigateByUrl'](route);",
      "  }",
      "  if (typeof window !== 'undefined' && window.location) {",
      "    window.location.assign(route);",
      "  }",
      "} finally {",
      "  return;",
      "}"
    ].join("\n");
  }

  function buildEntityPagesBootstrapPageScript(ctx, config) {
    var cfg = ctx.clone(config);
    cfg.defaultDraft = entityPagesDefaultDraft(ctx, config);
    return [
      "page.global = page.global || {};",
      "var config = " + JSON.stringify(cfg) + ";",
      "var cloneRecord = function(item) { try { return JSON.parse(JSON.stringify(item || {})); } catch (e) { return item || {}; } };",
      "var normalizeId = function(item) { return item ? String(item?.ID ?? item?.id ?? '') : ''; };",
      "var key = config.key;",
      "var rows = ((page.global?.crudRows || {})[key]) || [];",
      "var previousSelected = ((page.global?.crudSelected || {})[key]) || null;",
      "var previousSelectedId = normalizeId(previousSelected);",
      "var selected = rows.find(function(row) { return normalizeId(row) === previousSelectedId; }) || rows[0] || null;",
      "var mode = ((page.global?.crudModes || {})[key]) || (selected ? 'update' : 'create');",
      "var existingDraft = cloneRecord(((page.global?.crudDrafts || {})[key]) || {});",
      "var draft = mode === 'create' ? Object.assign({}, config.defaultDraft || {}, existingDraft || {}) : cloneRecord(selected || config.defaultDraft || {});",
      "page.global.crudSelected = Object.assign({}, page.global.crudSelected || {}, { [key]: selected });",
      "page.global.crudDrafts = Object.assign({}, page.global.crudDrafts || {}, { [key]: draft });",
      "page.global.crudModes = Object.assign({}, page.global.crudModes || {}, { [key]: mode });",
      "page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [key]: rows.length ? 'ready' : 'empty' });",
      "page.global.crudEntityErrors = Object.assign({}, page.global.crudEntityErrors || {}, { [key]: ((page.global?.crudEntityErrors || {})[key]) || '' });",
      "page.ref.markForCheck();",
      "return { status: 'ok', rows: rows.length, mode: mode };"
    ].join("\n");
  }

  function buildEntityPagesSelectActionScript(ctx, config) {
    var cfg = ctx.clone(config);
    cfg.defaultDraft = entityPagesDefaultDraft(ctx, config);
    return [
      "page.global = page.global || {};",
      "var config = " + JSON.stringify(cfg) + ";",
      "var cloneRecord = function(item) { try { return JSON.parse(JSON.stringify(item || {})); } catch (e) { return item || {}; } };",
      "var key = config.key;",
      "var rows = ((page.global?.crudRows || {})[key]) || [];",
      "var rowId = String(vars.row_id ?? '');",
      "var selected = rows.find(function(row) { return String(row?.ID ?? row?.id ?? '') === rowId; }) || null;",
      "page.global.crudSelected = Object.assign({}, page.global.crudSelected || {}, { [key]: selected });",
      "page.global.crudDrafts = Object.assign({}, page.global.crudDrafts || {}, { [key]: cloneRecord(selected || config.defaultDraft || {}) });",
      relationSearchResetLines("config")[0],
      relationSearchResetLines("config")[1],
      relationSearchResetLines("config")[2],
      relationSearchResetLines("config")[3],
      relationSearchResetLines("config")[4],
      relationSearchResetLines("config")[5],
      "page.global.crudModes = Object.assign({}, page.global.crudModes || {}, { [key]: selected ? 'update' : 'create' });",
      "page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [key]: 'ready' });",
      "page.global.crudEntityErrors = Object.assign({}, page.global.crudEntityErrors || {}, { [key]: '' });",
      "page.ref.markForCheck();",
      "return selected;"
    ].join("\n");
  }

  function buildEntityPagesNewActionScript(ctx, config) {
    var cfg = ctx.clone(config);
    cfg.defaultDraft = entityPagesDefaultDraft(ctx, config);
    return [
      "page.global = page.global || {};",
      "var config = " + JSON.stringify(cfg) + ";",
      "page.global.crudSelected = Object.assign({}, page.global.crudSelected || {}, { [config.key]: null });",
      "page.global.crudDrafts = Object.assign({}, page.global.crudDrafts || {}, { [config.key]: JSON.parse(JSON.stringify(config.defaultDraft || {})) });",
      relationSearchResetLines("config")[0],
      relationSearchResetLines("config")[1],
      relationSearchResetLines("config")[2],
      relationSearchResetLines("config")[3],
      relationSearchResetLines("config")[4],
      relationSearchResetLines("config")[5],
      "page.global.crudModes = Object.assign({}, page.global.crudModes || {}, { [config.key]: 'create' });",
      "page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [config.key]: 'editing' });",
      "page.global.crudEntityErrors = Object.assign({}, page.global.crudEntityErrors || {}, { [config.key]: '' });",
      "page.ref.markForCheck();",
      "return page.global.crudDrafts[config.key];"
    ].join("\n");
  }

  function buildEntityPagesCancelActionScript(ctx, config) {
    var cfg = ctx.clone(config);
    cfg.defaultDraft = entityPagesDefaultDraft(ctx, config);
    return [
      "page.global = page.global || {};",
      "var config = " + JSON.stringify(cfg) + ";",
      "var cloneRecord = function(item) { try { return JSON.parse(JSON.stringify(item || {})); } catch (e) { return item || {}; } };",
      "var selected = ((page.global?.crudSelected || {})[config.key]) || null;",
      "var draft = cloneRecord(selected || config.defaultDraft || {});",
      "page.global.crudDrafts = Object.assign({}, page.global.crudDrafts || {}, { [config.key]: draft });",
      relationSearchResetLines("config")[0],
      relationSearchResetLines("config")[1],
      relationSearchResetLines("config")[2],
      relationSearchResetLines("config")[3],
      relationSearchResetLines("config")[4],
      relationSearchResetLines("config")[5],
      "page.global.crudModes = Object.assign({}, page.global.crudModes || {}, { [config.key]: selected ? 'update' : 'create' });",
      "page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [config.key]: selected ? 'ready' : 'editing' });",
      "page.global.crudEntityErrors = Object.assign({}, page.global.crudEntityErrors || {}, { [config.key]: '' });",
      "page.ref.markForCheck();",
      "return draft;"
    ].join("\n");
  }

  function buildEntityPagesSaveActionScript(ctx, config) {
    var cfg = ctx.clone(config);
    cfg.defaultDraft = entityPagesDefaultDraft(ctx, config);
    return [
      "page.global = page.global || {};",
      "var config = " + JSON.stringify(cfg) + ";",
      "var cloneRecord = function(item) { try { return JSON.parse(JSON.stringify(item || {})); } catch (e) { return item || {}; } };",
      "var normalizeId = function(item) { return item ? String(item?.ID ?? item?.id ?? '') : ''; };",
      "var extractRows = function(result) { return Array.isArray(result?.sql_output) ? result.sql_output : (Array.isArray(result?.transaction?.document?.sql_output) ? result.transaction.document.sql_output : []); };",
      "var key = config.key;",
      "var draft = cloneRecord(((page.global?.crudDrafts || {})[key]) || {});",
      "var selected = ((page.global?.crudSelected || {})[key]) || null;",
      "var mode = ((page.global?.crudModes || {})[key]) || (selected ? 'update' : 'create');",
      "var entityErrors = Object.assign({}, page.global.crudEntityErrors || {});",
      "var entityStatus = Object.assign({}, page.global.crudEntityStatus || {});",
      "var variables = {};",
      "for (var i = 0; i < config.editableFields.length; i++) {",
      "  var field = config.editableFields[i];",
      "  variables[field.column] = draft[field.column] == null ? '' : String(draft[field.column]);",
      "}",
      "if (mode !== 'create') {",
      "  variables[config.primaryColumn] = normalizeId(selected || draft || {});",
      "}",
      "entityStatus[key] = 'saving';",
      "entityErrors[key] = '';",
      "page.global.crudEntityStatus = entityStatus;",
      "page.global.crudEntityErrors = entityErrors;",
      "page.ref.markForCheck();",
      "try {",
      "  var requestable = mode === 'create' ? config.createRequestable : config.updateRequestable;",
      "  await page['call'].apply(page, [requestable, Object.assign({__localCache_priority: null, __localCache_ttl: 0}, variables), null, 10000, true]);",
      "  var listResult = " + ctx.actionCallSnippet(cfg.listRequestable, "{}", 0, 10000, true) + ";",
      "  var rows = extractRows(listResult);",
      "  var selectedId = normalizeId(selected || draft || {});",
      "  var nextSelected = null;",
      "  if (mode === 'create') {",
      "    if (Array.isArray(config.uniqueFields) && config.uniqueFields.length) {",
      "      nextSelected = rows.find(function(row) {",
      "        for (var index = 0; index < config.uniqueFields.length; index++) {",
      "          var column = config.uniqueFields[index];",
      "          var expected = draft[column] == null ? '' : String(draft[column]);",
      "          var actual = row ? String(row[column.toUpperCase()] ?? row[column] ?? '') : '';",
      "          if (actual !== expected) {",
      "            return false;",
      "          }",
      "        }",
      "        return true;",
      "      }) || null;",
      "    }",
      "    nextSelected = nextSelected || (rows.length ? rows[rows.length - 1] : null);",
      "  } else {",
      "    nextSelected = rows.find(function(row) { return normalizeId(row) === selectedId; }) || null;",
      "  }",
      "  page.global.crudRows = Object.assign({}, page.global.crudRows || {}, { [key]: rows });",
      "  page.global.crudCounts = Object.assign({}, page.global.crudCounts || {}, { [key]: rows.length });",
      "  page.global.crudSamples = Object.assign({}, page.global.crudSamples || {}, { [key]: rows[0] || null });",
      "  page.global.crudSelected = Object.assign({}, page.global.crudSelected || {}, { [key]: nextSelected });",
      "  page.global.crudDrafts = Object.assign({}, page.global.crudDrafts || {}, { [key]: cloneRecord(nextSelected || config.defaultDraft || {}) });",
      relationSearchResetLines("config")[0],
      relationSearchResetLines("config")[1],
      relationSearchResetLines("config")[2],
      relationSearchResetLines("config")[3],
      relationSearchResetLines("config")[4],
      relationSearchResetLines("config")[5],
      "  page.global.crudModes = Object.assign({}, page.global.crudModes || {}, { [key]: nextSelected ? 'update' : 'create' });",
      "  page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [key]: 'saved' });",
      "  page.global.crudEntityErrors = Object.assign({}, page.global.crudEntityErrors || {}, { [key]: '' });",
      "  page.global.crudError = '';",
      "  page.global.crudStatus = 'ok';",
      "  page.ref.markForCheck();",
      "  return { status: 'ok', mode: mode };",
      "} catch (e) {",
      "  var message = (e && e.message) ? e.message : ('' + e);",
      "  page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [key]: 'error' });",
      "  page.global.crudEntityErrors = Object.assign({}, page.global.crudEntityErrors || {}, { [key]: message || ('Unable to save ' + String(config.label || key).toLowerCase()) });",
      "  page.global.crudError = page.global.crudEntityErrors[key];",
      "  page.global.crudStatus = 'error';",
      "  page.c8o.log.debug('[MB] crud_save_' + key + ' failed', e);",
      "  page.ref.markForCheck();",
      "  return { status: 'error', error: page.global.crudError };",
      "}"
    ].join("\n");
  }

  function buildEntityPagesDeleteActionScript(ctx, config) {
    var cfg = ctx.clone(config);
    cfg.defaultDraft = entityPagesDefaultDraft(ctx, config);
    return [
      "page.global = page.global || {};",
      "var config = " + JSON.stringify(cfg) + ";",
      "var normalizeId = function(item) { return item ? String(item?.ID ?? item?.id ?? '') : ''; };",
      "var extractRows = function(result) { return Array.isArray(result?.sql_output) ? result.sql_output : (Array.isArray(result?.transaction?.document?.sql_output) ? result.transaction.document.sql_output : []); };",
      "var cloneRecord = function(item) { try { return JSON.parse(JSON.stringify(item || {})); } catch (e) { return item || {}; } };",
      "var key = config.key;",
      "var selected = ((page.global?.crudSelected || {})[key]) || null;",
      "var selectedId = normalizeId(selected);",
      "if (!selectedId) {",
      "  page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [key]: 'ready' });",
      "  page.ref.markForCheck();",
      "  return { status: 'skipped', message: 'No selected row.' };",
      "}",
      "if (typeof window !== 'undefined' && typeof window.confirm === 'function') {",
      "  var confirmed = window.confirm('Delete ' + String(config.singular || 'record') + ' #' + selectedId + '?');",
      "  if (!confirmed) {",
      "    page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [key]: 'cancelled' });",
      "    page.ref.markForCheck();",
      "    return { status: 'cancelled' };",
      "  }",
      "}",
      "page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [key]: 'deleting' });",
      "page.global.crudEntityErrors = Object.assign({}, page.global.crudEntityErrors || {}, { [key]: '' });",
      "page.ref.markForCheck();",
      "try {",
      "  await page['call'].apply(page, [config.deleteRequestable, Object.assign({__localCache_priority: null, __localCache_ttl: 0}, { [config.primaryColumn]: selectedId }), null, 10000, true]);",
      "  var listResult = " + ctx.actionCallSnippet(cfg.listRequestable, "{}", 0, 10000, true) + ";",
      "  var rows = extractRows(listResult);",
      "  var nextSelected = rows[0] || null;",
      "  page.global.crudRows = Object.assign({}, page.global.crudRows || {}, { [key]: rows });",
      "  page.global.crudCounts = Object.assign({}, page.global.crudCounts || {}, { [key]: rows.length });",
      "  page.global.crudSamples = Object.assign({}, page.global.crudSamples || {}, { [key]: rows[0] || null });",
      "  page.global.crudSelected = Object.assign({}, page.global.crudSelected || {}, { [key]: nextSelected });",
      "  page.global.crudDrafts = Object.assign({}, page.global.crudDrafts || {}, { [key]: cloneRecord(nextSelected || config.defaultDraft || {}) });",
      relationSearchResetLines("config")[0],
      relationSearchResetLines("config")[1],
      relationSearchResetLines("config")[2],
      relationSearchResetLines("config")[3],
      relationSearchResetLines("config")[4],
      relationSearchResetLines("config")[5],
      "  page.global.crudModes = Object.assign({}, page.global.crudModes || {}, { [key]: nextSelected ? 'update' : 'create' });",
      "  page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [key]: 'deleted' });",
      "  page.global.crudEntityErrors = Object.assign({}, page.global.crudEntityErrors || {}, { [key]: '' });",
      "  page.global.crudError = '';",
      "  page.global.crudStatus = 'ok';",
      "  page.ref.markForCheck();",
      "  return { status: 'ok' };",
      "} catch (e) {",
      "  var message = (e && e.message) ? e.message : ('' + e);",
      "  page.global.crudEntityStatus = Object.assign({}, page.global.crudEntityStatus || {}, { [key]: 'error' });",
      "  page.global.crudEntityErrors = Object.assign({}, page.global.crudEntityErrors || {}, { [key]: message || ('Unable to delete ' + String(config.label || key).toLowerCase()) });",
      "  page.global.crudError = page.global.crudEntityErrors[key];",
      "  page.global.crudStatus = 'error';",
      "  page.c8o.log.debug('[MB] crud_delete_' + key + ' failed', e);",
      "  page.ref.markForCheck();",
      "  return { status: 'error', error: page.global.crudError };",
      "}"
    ].join("\n");
  }

  function buildEntityPagesActionStacksTree(ctx, projectName, facadePrefix, entities, stage) {
    var qnames = [];
    var children = [];
    var configs = entities.map(function (entity) {
      return ctx.entityUiConfig(projectName, facadePrefix, entity, entities);
    });
    var bootstrapQName = ctx.dashboardActionQName(projectName, "crud_bootstrap_dashboard");
    qnames.push(bootstrapQName, ctx.dashboardActionQName(projectName, "crud_retry_dashboard"));
    children.push(
      ctx.actionStackNode(
        "crud_bootstrap_dashboard",
        [],
        [
          ctx.customAsyncActionNode(
            "BootstrapDashboard",
            buildEntityPagesBootstrapActionScript(ctx, projectName, facadePrefix, entities, stage),
            "Bootstrap landing and entity-page CRUD state."
          )
        ],
        "CRUD entity-pages bootstrap action."
      ),
      ctx.actionStackNode(
        "crud_retry_dashboard",
        [],
        [
          ctx.dynamicInvokeNode("InvokeBootstrapDashboard", bootstrapQName, [])
        ],
        "CRUD entity-pages retry action."
      )
    );
    for (var i = 0; i < configs.length; i++) {
      var config = configs[i];
      var refreshName = "crud_refresh_" + config.key;
      var bootstrapPageName = "crud_bootstrap_" + config.key + "_page";
      var selectName = "crud_select_" + config.singular;
      var newName = "crud_new_" + config.singular;
      var saveName = "crud_save_" + config.singular;
      var deleteName = "crud_delete_" + config.singular;
      var cancelName = "crud_cancel_" + config.singular;
      var openName = "crud_open_" + config.key + "_page";
      qnames.push(
        ctx.dashboardActionQName(projectName, refreshName),
        ctx.dashboardActionQName(projectName, bootstrapPageName),
        ctx.dashboardActionQName(projectName, selectName),
        ctx.dashboardActionQName(projectName, newName),
        ctx.dashboardActionQName(projectName, saveName),
        ctx.dashboardActionQName(projectName, deleteName),
        ctx.dashboardActionQName(projectName, cancelName),
        ctx.dashboardActionQName(projectName, openName)
      );
      children.push(
        ctx.actionStackNode(
          refreshName,
          [],
          [
            ctx.customAsyncActionNode(
              "Refresh" + ctx.pascalize(config.key),
              buildEntityPagesRefreshActionScript(ctx, config),
              "Refresh CRUD state for " + config.label + "."
            )
          ],
          "CRUD refresh action for " + config.label + "."
        ),
        ctx.actionStackNode(
          bootstrapPageName,
          [],
          [
            ctx.customAsyncActionNode(
              "Bootstrap" + ctx.pascalize(config.key) + "Page",
              buildEntityPagesBootstrapPageScript(ctx, config),
              "Prepare selection and draft state for the " + config.label + " page."
            )
          ],
          "CRUD entity page bootstrap for " + config.label + "."
        ),
        ctx.actionStackNode(
          selectName,
          [ctx.stackVariableNode("row_id", "''")],
          [
            ctx.customAsyncActionNode(
              "Select" + ctx.pascalize(config.singular),
              buildEntityPagesSelectActionScript(ctx, config),
              "Select one " + config.singular + " row."
            )
          ],
          "CRUD select action for " + config.label + "."
        ),
        ctx.actionStackNode(
          newName,
          [],
          [
            ctx.customAsyncActionNode(
              "New" + ctx.pascalize(config.singular),
              buildEntityPagesNewActionScript(ctx, config),
              "Prepare a new " + config.singular + " draft."
            )
          ],
          "CRUD new action for " + config.label + "."
        ),
        ctx.actionStackNode(
          saveName,
          [],
          [
            ctx.customAsyncActionNode(
              "Save" + ctx.pascalize(config.singular),
              buildEntityPagesSaveActionScript(ctx, config),
              "Persist the current " + config.singular + " draft."
            )
          ],
          "CRUD save action for " + config.label + "."
        ),
        ctx.actionStackNode(
          deleteName,
          [],
          [
            ctx.customAsyncActionNode(
              "Delete" + ctx.pascalize(config.singular),
              buildEntityPagesDeleteActionScript(ctx, config),
              "Delete the selected " + config.singular + "."
            )
          ],
          "CRUD delete action for " + config.label + "."
        ),
        ctx.actionStackNode(
          cancelName,
          [],
          [
            ctx.customAsyncActionNode(
              "Cancel" + ctx.pascalize(config.singular),
              buildEntityPagesCancelActionScript(ctx, config),
              "Reset the current " + config.singular + " draft."
            )
          ],
          "CRUD cancel action for " + config.label + "."
        ),
        ctx.actionStackNode(
          openName,
          [],
          [
            ctx.customAsyncActionNode(
              "Open" + ctx.pascalize(config.key) + "Page",
              buildEntityPagesOpenPageScript(ctx, config),
              "Navigate to the " + config.label + " page."
            )
          ],
          "CRUD navigation action for " + config.label + "."
        )
      );
    }
    return {
      qnames: qnames,
      tree: {
        children: children
      }
    };
  }

  C8O.crudUiActions.entityPagesDefaultDraft = entityPagesDefaultDraft;
  C8O.crudUiActions.buildEntityPagesBootstrapActionScript = buildEntityPagesBootstrapActionScript;
  C8O.crudUiActions.buildEntityPagesRefreshActionScript = buildEntityPagesRefreshActionScript;
  C8O.crudUiActions.buildEntityPagesOpenPageScript = buildEntityPagesOpenPageScript;
  C8O.crudUiActions.buildEntityPagesBootstrapPageScript = buildEntityPagesBootstrapPageScript;
  C8O.crudUiActions.buildEntityPagesSelectActionScript = buildEntityPagesSelectActionScript;
  C8O.crudUiActions.buildEntityPagesNewActionScript = buildEntityPagesNewActionScript;
  C8O.crudUiActions.buildEntityPagesCancelActionScript = buildEntityPagesCancelActionScript;
  C8O.crudUiActions.buildEntityPagesSaveActionScript = buildEntityPagesSaveActionScript;
  C8O.crudUiActions.buildEntityPagesDeleteActionScript = buildEntityPagesDeleteActionScript;
  C8O.crudUiActions.buildEntityPagesActionStacksTree = buildEntityPagesActionStacksTree;
})();
