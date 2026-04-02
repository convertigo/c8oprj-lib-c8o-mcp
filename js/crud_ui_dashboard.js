if (typeof C8O === "undefined") {
  var C8O = {};
}

C8O.crudUiDashboard = C8O.crudUiDashboard || {};

(function () {
  if (C8O.crudUiDashboard._initialized === true) {
    return;
  }
  C8O.crudUiDashboard._initialized = true;

  function buildDashboardRefreshActionScript(ctx, entity, requestableQName) {
    return [
      "page.global = page.global || {};",
      "var key = " + ctx.scriptLiteral(entity.name) + ";",
      "page.global.crudLoading = true;",
      "page.global.crudError = '';",
      "page.global.crudStatus = 'loading';",
      "page.ref.markForCheck();",
      "try {",
      "  var result = " + ctx.actionCallSnippet(requestableQName, "{}", 3000, 5000, true) + ";",
      "  var rows = " + ctx.actionRowsExpression("result") + ";",
      "  page.global.crudRows = Object.assign({}, page.global.crudRows || {}, { [key]: rows });",
      "  page.global.crudCounts = Object.assign({}, page.global.crudCounts || {}, { [key]: rows.length });",
      "  page.global.crudSamples = Object.assign({}, page.global.crudSamples || {}, { [key]: rows[0] || null });",
      "  page.global.crudStatus = 'ok';",
      "  page.ref.markForCheck();",
      "  return result;",
      "} catch (e) {",
      "  var message = (e && e.message) ? e.message : ('' + e);",
      "  page.global.crudError = message || ('Unable to load ' + " + ctx.scriptLiteral(entity.label.toLowerCase()) + ");",
      "  page.global.crudStatus = 'error';",
      "  page.c8o.log.debug('[MB] crud_refresh_' + key + ' failed', e);",
      "  page.ref.markForCheck();",
      "  return { status: 'error', error: page.global.crudError, rows: [] };",
      "} finally {",
      "  page.global.crudLoading = false;",
      "  page.ref.markForCheck();",
      "}"
    ].join("\n");
  }

  function buildDashboardBootstrapActionScript(ctx, projectName, facadePrefix, entities, stage) {
    var configs = entities.map(function (entity) {
      return {
        key: entity.name,
        label: entity.label,
        requestable: ctx.facadeSequenceQName(projectName, facadePrefix, entity, "list")
      };
    });
    return [
      "page.global = page.global || {};",
      "page.global.crudBuildStage = " + ctx.scriptLiteral(ctx.trimmed(stage || "bootstrap")) + ";",
      "page.global.crudLoading = true;",
      "page.global.crudError = '';",
      "page.global.crudStatus = 'loading';",
      "page.global.crudRows = {};",
      "page.global.crudCounts = {};",
      "page.global.crudSamples = {};",
      "page.ref.markForCheck();",
      "var configs = " + JSON.stringify(configs) + ";",
      "var runRefresh = async function(config) {",
      "  try {",
      "    var result = " + ctx.actionCallFromExpressionSnippet("config.requestable", "{}", 3000, 5000, true) + ";",
      "    var rows = " + ctx.actionRowsExpression("result") + ";",
      "    var status = (result && result.status) ? result.status : 'ok';",
      "    return { key: config.key, rows: rows, status: status, error: status !== 'ok' ? (result?.error ?? ('Unable to load ' + String(config.label || config.key).toLowerCase())) : '', result: result };",
      "  } catch (e) {",
      "    var message = (e && e.message) ? e.message : ('' + e);",
      "    page.c8o.log.debug('[MB] crud_bootstrap_dashboard refresh failed for ' + String((config && config.key) || 'entity'), e);",
      "    return { key: config.key, rows: [], status: 'error', error: message || ('Unable to load ' + String(config.label || config.key).toLowerCase()), result: { status: 'error', error: message || ('Unable to load ' + String(config.label || config.key).toLowerCase()), rows: [] } };",
      "  }",
      "};",
      "try {",
      "  var results = await Promise.all(configs.map(function(config) { return runRefresh(config); }));",
      "  var rowsByKey = {};",
      "  var countsByKey = {};",
      "  var samplesByKey = {};",
      "  var firstError = '';",
      "  for (var i = 0; i < results.length; i++) {",
      "    var item = results[i];",
      "    var rows = Array.isArray(item.rows) ? item.rows : [];",
      "    rowsByKey[item.key] = rows;",
      "    countsByKey[item.key] = rows.length;",
      "    samplesByKey[item.key] = rows[0] ?? null;",
      "    if (!firstError && item.status !== 'ok') {",
      "      firstError = item.error || ('Unable to load ' + String(item.key || 'entity'));",
      "    }",
      "  }",
      "  page.global.crudRows = rowsByKey;",
      "  page.global.crudCounts = countsByKey;",
      "  page.global.crudSamples = samplesByKey;",
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

  function buildDashboardPageScriptContent(ctx, projectName, facadePrefix, entities, stage) {
    var configs = entities.map(function (entity) {
      return {
        key: entity.name,
        label: entity.label,
        requestable: ctx.facadeSequenceQName(projectName, facadePrefix, entity, "list")
      };
    });
    return [
      "/*Begin_c8o_PageDeclaration*/",
      "\tpublic __crudBootstrapStarted: boolean = false;",
      "/*End_c8o_PageDeclaration*/",
      "/*Begin_c8o_PageConstructor*/",
      "\t\tsetTimeout(() => {",
      "\t\t\tthis.bootstrapCrudDashboardState().catch((error: any) => {",
      "\t\t\t\tthis.c8o.log.debug('[MB] bootstrapCrudDashboardState failed', error);",
      "\t\t\t\tthis.__crudBootstrapStarted = false;",
      "\t\t\t});",
      "\t\t}, 0);",
      "/*End_c8o_PageConstructor*/",
      "/*Begin_c8o_PageFunction*/",
      "\tpublic async bootstrapCrudDashboardState(): Promise<any> {",
      "\t\tif (this.__crudBootstrapStarted && (this.global?.crudLoading === true || this.global?.crudStatus === 'ok')) {",
      "\t\t\treturn this.global?.crudStatus ?? 'ok';",
      "\t\t}",
      "\t\tthis.__crudBootstrapStarted = true;",
      "\t\tthis.global = this.global || {};",
      "\t\tthis.global.crudBuildStage = " + ctx.scriptLiteral(ctx.trimmed(stage || "bootstrap")) + ";",
      "\t\tthis.global.crudLoading = true;",
      "\t\tthis.global.crudError = '';",
      "\t\tthis.global.crudStatus = 'loading';",
      "\t\tthis.global.crudRows = {};",
      "\t\tthis.global.crudCounts = {};",
      "\t\tthis.global.crudSamples = {};",
      "\t\tthis.ref.markForCheck();",
      "\t\tconst configs = " + JSON.stringify(configs) + ";",
      "\t\ttry {",
      "\t\t\tconst results = await Promise.all(configs.map(async (config) => {",
      "\t\t\t\ttry {",
      "\t\t\t\t\tconst result: any = await this['call'].apply(this, [config.requestable, {__localCache_priority: null, __localCache_ttl: 3000}, null, 5000, true]);",
      "\t\t\t\t\tconst rows = Array.isArray(result?.rows) ? result.rows : [];",
      "\t\t\t\t\tconst status = (result && result.status) ? result.status : 'ok';",
      "\t\t\t\t\treturn { key: config.key, rows, status, error: status !== 'ok' ? (result?.error ?? ('Unable to load ' + String(config.label || config.key).toLowerCase())) : '', result };",
      "\t\t\t\t} catch (e: any) {",
      "\t\t\t\t\tconst message = (e && e.message) ? e.message : ('' + e);",
      "\t\t\t\t\tthis.c8o.log.debug('[MB] bootstrapCrudDashboardState refresh failed for ' + String((config && config.key) || 'entity'), e);",
      "\t\t\t\t\treturn { key: config.key, rows: [], status: 'error', error: message || ('Unable to load ' + String(config.label || config.key).toLowerCase()), result: { status: 'error', error: message || ('Unable to load ' + String(config.label || config.key).toLowerCase()), rows: [] } };",
      "\t\t\t\t}",
      "\t\t\t}));",
      "\t\t\tconst rowsByKey: any = {};",
      "\t\t\tconst countsByKey: any = {};",
      "\t\t\tconst samplesByKey: any = {};",
      "\t\t\tlet firstError = '';",
      "\t\t\tfor (const item of results) {",
      "\t\t\t\tconst rows = Array.isArray(item.rows) ? item.rows : [];",
      "\t\t\t\trowsByKey[item.key] = rows;",
      "\t\t\t\tcountsByKey[item.key] = rows.length;",
      "\t\t\t\tsamplesByKey[item.key] = rows[0] ?? null;",
      "\t\t\t\tif (!firstError && item.status !== 'ok') {",
      "\t\t\t\t\tfirstError = item.error || ('Unable to load ' + String(item.key || 'entity'));",
      "\t\t\t\t}",
      "\t\t\t}",
      "\t\t\tthis.global.crudRows = rowsByKey;",
      "\t\t\tthis.global.crudCounts = countsByKey;",
      "\t\t\tthis.global.crudSamples = samplesByKey;",
      "\t\t\tthis.global.crudError = firstError;",
      "\t\t\tthis.global.crudStatus = firstError ? 'error' : 'ok';",
      "\t\t\tthis.ref.markForCheck();",
      "\t\t\treturn { status: this.global.crudStatus, results };",
      "\t\t} finally {",
      "\t\t\tthis.global.crudLoading = false;",
      "\t\t\tthis.ref.markForCheck();",
      "\t\t}",
      "\t}",
      "/*End_c8o_PageFunction*/",
      ""
    ].join("\n");
  }

  function buildDashboardActionStacksTree(ctx, projectName, facadePrefix, entities, stage) {
    var qnames = [];
    var children = [];
    var bootstrapQName = ctx.dashboardActionQName(projectName, "crud_bootstrap_dashboard");
    for (var i = 0; i < entities.length; i++) {
      var entity = entities[i];
      var actionName = "crud_refresh_" + entity.name;
      var actionQName = ctx.dashboardActionQName(projectName, actionName);
      var requestableQName = ctx.facadeSequenceQName(projectName, facadePrefix, entity, "list");
      qnames.push(actionQName);
      children.push(
        ctx.actionStackNode(
          actionName,
          [],
          [
            ctx.customAsyncActionNode(
              "Refresh" + ctx.ucfirst(entity.name),
              buildDashboardRefreshActionScript(ctx, entity, requestableQName),
              "Refresh CRUD global state for " + entity.label + "."
            )
          ],
          "CRUD dashboard refresh action for " + entity.label + "."
        )
      );
    }
    qnames.push(bootstrapQName);
    children.push(
      ctx.actionStackNode(
        "crud_bootstrap_dashboard",
        [],
        [
          ctx.customAsyncActionNode(
            "BootstrapDashboard",
            buildDashboardBootstrapActionScript(ctx, projectName, facadePrefix, entities, stage),
            "Bootstrap CRUD dashboard global state."
          )
        ],
        "CRUD dashboard bootstrap action."
      )
    );
    return {
      qnames: qnames,
      tree: {
        children: children
      }
    };
  }

  C8O.crudUiDashboard.buildDashboardRefreshActionScript = buildDashboardRefreshActionScript;
  C8O.crudUiDashboard.buildDashboardBootstrapActionScript = buildDashboardBootstrapActionScript;
  C8O.crudUiDashboard.buildDashboardPageScriptContent = buildDashboardPageScriptContent;
  C8O.crudUiDashboard.buildDashboardActionStacksTree = buildDashboardActionStacksTree;
})();
