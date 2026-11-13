#!/usr/bin/env node
// Checks the pure rules of js/tools_project_lint.js that need no engine: the glued-text boundary.
// The full rules run against a live project through the project-lint tool.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const source = fs.readFileSync(path.join(__dirname, "..", "..", "js", "tools_project_lint.js"), "utf8");
const responseSource = fs.readFileSync(path.join(__dirname, "..", "..", "js", "sequence_response.js"), "utf8");
const context = { C8O: {} };
vm.createContext(context);
vm.runInContext(source, context);
const glued = context.C8O.lint.gluedBoundary;

// "Postes actifs" then a bound value: glued.
assert.strictEqual(glued({ plain: true, text: "Postes actifs" }, { plain: false, text: "local?.n" }), true);
// "Date : " then a bound value: a composed sentence, not glued.
assert.strictEqual(glued({ plain: true, text: "Date : " }, { plain: false, text: "local?.d" }), false);
// A bound value then " (": not glued.
assert.strictEqual(glued({ plain: false, text: "local?.d" }, { plain: true, text: " (" }), false);
// Two bound values side by side: glued.
assert.strictEqual(glued({ plain: false, text: "a" }, { plain: false, text: "b" }), true);
// Label ending with a colon and no space: not glued (the colon separates).
assert.strictEqual(glued({ plain: true, text: "Remise:" }, { plain: false, text: "x" }), false);

// Text review: one gateway call per group (app texts, then each i18n file), findings from the model answer.
context.C8O.imageDescribe = { javaHost: () => null, DEFAULT_MODEL: "m", GATEWAY_URL: "https://gw", redact: (t) => t,
  usageOf: (body, model) => ({ model: model, tool: "image-describe" }) };
const sent = [];
const answers = [
  { language: "fr", issues: [{ id: 0, fixed: "Gérer les postes", kind: "accents" }, { id: 1, fixed: "Version", kind: "spelling" }] },
  { language: "es", issues: [{ id: 0, fixed: "Configuración", kind: "accents" }] }
];
const host = {
  readKey: () => "sk-test",
  now: () => 0,
  header: () => null,
  post: (url, key, body) => {
    sent.push(JSON.parse(body));
    const answer = answers[sent.length - 1];
    return { status: 200, body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }), header: () => null };
  }
};
const found = [];
const add = (rule, severity, where, message, fix) => found.push({ rule, where, message, fix });
const review = context.C8O.lint.reviewTexts({ host }, ["Gerer les postes", "Version"],
  { "Gerer les postes": ["P.a", "P.b"], "Version": ["P.c"] },
  { files: ["es"], keys: {}, values: { es: [{ key: "settings.title", text: "Configuracion" }] } }, add, null);
assert.strictEqual(sent.length, 2);
assert.ok(/Expected language: es/.test(sent[1].messages[1].content));
// The model echoing the same text is not a finding.
assert.strictEqual(found.length, 2);
assert.strictEqual(found[0].where, "P.a");
assert.ok(/also in P.b/.test(found[0].message) && /Gérer les postes/.test(found[0].fix));
assert.strictEqual(found[1].where, "DisplayObjects/mobile/assets/i18n/es.json#settings.title");
assert.strictEqual(review.reviewed, 3);
assert.strictEqual(review.usages[0].tool, "project-lint");
assert.strictEqual(context.C8O.lint.reviewTexts({ checkTexts: false }, ["x"], { x: ["P"] }, { values: {} }, add).skipped.split(":")[0], "No text review");

// A refused reasoning level is retried without one, and a gateway refusal says why (every review answered a bare 400 with
// mistral-large-4: reasoning_effort "none" and top_p are refused, usage tests 29/10).
const calls = [];
const refusing = {
  readKey: () => "sk-test", now: () => 0, header: () => null,
  post: (url, key, body) => {
    const request = JSON.parse(body);
    calls.push(request);
    if (request.reasoning_effort) {
      return { status: 400, body: JSON.stringify({ error: { message: "litellm.BadRequestError: MistralException - {\"message\":\"reasoning_effort low is not supported for this model\"}" } }), header: () => null };
    }
    return { status: 200, body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ language: "fr", issues: [] }) } }] }), header: () => null };
  }
};
const retried = context.C8O.lint.reviewTexts({ host: refusing }, ["Gérer"], { "Gérer": ["P.a"] }, { values: {} }, add, null);
assert.strictEqual(calls[0].reasoning_effort, "low");
assert.strictEqual(calls[0].top_p, 1);
assert.strictEqual(calls[0].temperature, 0);
assert.strictEqual(calls[1].reasoning_effort, undefined);
assert.strictEqual(retried.reviewed, 1);
const refused = context.C8O.lint.reviewTexts({ host: { readKey: () => "sk-test", now: () => 0, header: () => null,
  post: () => ({ status: 400, body: JSON.stringify({ error: { message: "litellm.BadRequestError: MistralException - {\"message\":\"top_p must be 1 when using greedy sampling.\"}" } }), header: () => null }) } },
  ["Gérer"], { "Gérer": ["P.a"] }, { values: {} }, add, null);
assert.match(refused.skipped, /^gateway answered 400: top_p must be 1 when using greedy sampling\.$/);

// An answer cut by max_tokens (mistral-large-4 at reasoning_effort low spent 3 999 of its 4 000 tokens reasoning, PCA eval
// 30/10) counted its group as reviewed with no problem. It is asked again with more room, then left out and said so.
const cutCalls = [];
const cutOnce = context.C8O.lint.reviewTexts({ host: { readKey: () => "sk-test", now: () => 0, header: () => null,
  post: (url, key, body) => {
    cutCalls.push(JSON.parse(body));
    const content = cutCalls.length === 1 ? "" : JSON.stringify({ language: "fr", issues: [{ id: 0, fixed: "Gérer", kind: "accents" }] });
    return { status: 200, body: JSON.stringify({ choices: [{ message: { content }, finish_reason: cutCalls.length === 1 ? "length" : "stop" }] }), header: () => null };
  } } }, ["Gerer"], { "Gerer": ["P.a"] }, { values: {} }, add, null);
assert.strictEqual(cutCalls.length, 2);
assert.strictEqual(cutCalls[0].max_tokens, 4000);
assert.strictEqual(cutCalls[1].max_tokens, 12000);
assert.strictEqual(cutOnce.reviewed, 1);
assert.strictEqual(cutOnce.problems, 1);
assert.strictEqual(cutOnce.notReviewed, undefined);
assert.strictEqual(cutOnce.usages.length, 2);
const cutTwice = context.C8O.lint.reviewTexts({ host: { readKey: () => "sk-test", now: () => 0, header: () => null,
  post: () => ({ status: 200, body: JSON.stringify({ choices: [{ message: { content: "" }, finish_reason: "length" }] }), header: () => null }) } },
  ["Gerer", "Version"], { "Gerer": ["P.a"], "Version": ["P.b"] }, { values: {} }, add, null);
assert.strictEqual(cutTwice.reviewed, 0);
assert.strictEqual(cutTwice.notReviewed, 2);
assert.match(cutTwice.message, /^2 texts were not reviewed: the model answer was cut twice\.$/);

// The review ran inside the tool call past the client's minute: Vibe failed project-lint with mcp_transport_failed (usage
// tests 30/10). Past its budget, the groups left are not reviewed and the answer says so.
let clock = 0;
const slowCalls = [];
const slow = context.C8O.lint.reviewTexts({ textReviewBudgetMs: 35000, host: { readKey: () => "sk-test", now: () => clock, header: () => null,
  post: (url, key, body) => {
    slowCalls.push(JSON.parse(body));
    clock += 20000;
    return { status: 200, body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ language: "fr", issues: [] }) } }] }), header: () => null };
  } } }, ["Gerer"], { "Gerer": ["P.a"] },
  { files: ["es", "it", "de"], keys: {}, values: { es: [{ key: "a", text: "Hola" }], it: [{ key: "a", text: "Ciao" }], de: [{ key: "a", text: "Hallo" }] } }, add, null);
assert.strictEqual(slowCalls.length, 2, "two groups fit in the budget");
assert.strictEqual(slow.reviewed, 2);
assert.strictEqual(slow.notReviewed, 2);
assert.match(slow.message, /^2 texts were not reviewed: the review stopped after 35 s, so the lint answers before the client gives up\. Run project-lint again to review them\.$/);

// A call that times out past the budget leaves its group unreviewed, it does not skip the whole review.
let clock2 = 0;
const timeouts = [];
const timedOut = context.C8O.lint.reviewTexts({ textReviewBudgetMs: 35000, host: { readKey: () => "sk-test", now: () => clock2, header: () => null,
  post: (url, key, body, timeoutMs) => {
    timeouts.push(timeoutMs);
    if (timeouts.length === 1) { clock2 += 30000; return { status: 200, body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ issues: [] }) } }] }), header: () => null }; }
    clock2 += timeoutMs;
    throw new Error("Read timed out");
  } } }, ["Gerer"], { "Gerer": ["P.a"] }, { files: ["es"], keys: {}, values: { es: [{ key: "a", text: "Hola" }] } }, add, null);
assert.strictEqual(timeouts[0], 50000, "budget plus room for one answer");
assert.strictEqual(timeouts[1], 20000, "the time left, plus room");
assert.strictEqual(timedOut.reviewed, 1);
assert.strictEqual(timedOut.notReviewed, 1);
assert.match(timedOut.message, /the review stopped after 35 s/);

// An app whose styles give no primary but the starter's (or Ionic's) default was never given its own look (31/10).
const theme = context.C8O.lint.defaultTheme;
const starterLight = ":root, :root.force-light {\n  --ion-color-primary: #2563eb;\n  --ion-color-primary-rgb: 37,99,235;\n}";
const starterDark = "@media (prefers-color-scheme: dark) { :root:not(.force-light) { --ion-color-primary: #60a5fa; } }";
assert.match(theme([{ name: "LightTheme", css: starterLight }, { name: "AutoDarkTheme", css: starterDark }, { name: "AppLayout", css: ".app-page { padding: 16px; }" }]),
  /^The app keeps the starter's default theme \(primary #2563eb\): no app style gives it its own colors/);
assert.match(theme([]), /^The app keeps the starter's default theme: no app style/);
assert.strictEqual(theme([{ name: "LightTheme", css: starterLight }, { name: "AppTheme", css: "html:root, :root.force-light {\n  --ion-color-primary: #1f4e79;\n}" }]), "");
assert.strictEqual(theme([{ name: "LightTheme", css: starterLight.replace("#2563eb", "#E30613") }]), "", "a starter theme edited by hand counts");

console.log("project-lint boundary rules OK");

// LIB-* rules (31/10): agents hand-built what a marketplace library gives (CSV exports, admin grids with sort, filter and
// paging, chart wrappers, logins). project-lint names the library and how to get it.
const { test } = require("node:test");
const lib = context.C8O.lint;
// Values made in the vm context: compared as plain JSON.
const plain = value => JSON.parse(JSON.stringify(value));

test("LIB-HANDMADE-CSV: code about CSV that joins its cells or rows", () => {
  assert.strictEqual(lib.handmadeCsv('var lines = rows.map(function (r) { return r.join(";"); });\nresponse = lines.join("\\r\\n"); contentType = "text/csv";'), '.join(";")');
  assert.strictEqual(lib.handmadeCsv('const csv = header + "\\n" + body; download("export.csv", csv);'), '+ "\\n"');
  assert.strictEqual(lib.handmadeCsv("let out = ''; for (const r of rows) { out += r.id + ',' + r.name + '\\r\\n'; } // CSV"), "'\\r\\n'");
  assert.strictEqual(lib.handmadeCsv("const toCsv = rows => rows.map(r => r.join(separator)).join(EOL);"), ".join(separator)");
  assert.strictEqual(lib.handmadeCsv("csvLine = `${r.id};${r.name}`;"), "${r.id};${");
});

test("LIB-HANDMADE-CSV: a CSV word without a join, or a join without CSV, is not flagged", () => {
  assert.strictEqual(lib.handmadeCsv('// the CSV export goes through lib_csv_response\nvar call = {"_use_separator": ";", "_use_sequence_data": "App.list"};'), "");
  assert.strictEqual(lib.handmadeCsv('var cells = line.split(";"); // read the uploaded .csv'), "");
  assert.strictEqual(lib.handmadeCsv('label = names.join(", ") + "\\n";'), "", "no CSV in this code");
  assert.strictEqual(lib.handmadeCsv(""), "");
});

const page = (lists, codes, agGrid) => ({ lists, codes, agGrid: agGrid === true });

test("LIB-HANDMADE-GRID: a page that sorts, filters and pages its ForEach list itself", () => {
  const roots = plain(lib.listRoots("local?.view"));
  assert.deepStrictEqual(roots, ["view"]);
  const all = lib.handmadeGrid(page(roots, [
    { where: "ApplyFilters", sets: "", text: "page.local.view = page.local.rows.filter(r => !page.local.search || r.name.toLowerCase().includes(page.local.search))" +
      ".sort((a, b) => a.name.localeCompare(b.name)).slice(page.local.pageIndex * page.local.pageSize, (page.local.pageIndex + 1) * page.local.pageSize);" },
    { where: "ExportCsv", sets: "", text: "const csv = page.local.rows.map(r => r.name).sort();" }
  ]));
  assert.deepStrictEqual(plain(all), { ops: ["sorts", "filters", "pages"], where: ["ApplyFilters"] });
  // A SetLocalAction that sets the listed local, and the slice pipe in the ForEach source.
  assert.deepStrictEqual(plain(lib.handmadeGrid(page(["rows"], [
    { where: "SortByName", sets: "rows", text: "c8oPage.local.all.slice().sort((a: any, b: any) => a.name < b.name ? -1 : 1)" }]))),
  { ops: ["sorts"], where: ["SortByName"] });
  assert.deepStrictEqual(plain(lib.handmadeGrid(page(["rows"], [
    { where: "ForEach", sets: "", text: "local?.rows | slice:(local.page * 10):(local.page * 10 + 10)" }]))).ops, ["pages"]);
  // A filter by a local named so, without string search.
  assert.deepStrictEqual(plain(lib.handmadeGrid(page(["items"], [
    { where: "Apply", sets: "", text: "page.local.shown = page.local.items.filter(i => i.status === page.local.statusFilter);" }]))).ops, ["filters"]);
});

test("LIB-HANDMADE-GRID: a generated list page with server filters is not flagged", () => {
  // ngx-page-create: the ForEach lists local data, the filters are locals passed to the CallSequenceAction, and the
  // selection toggle filters the selected keys, not the list.
  const roots = plain(lib.listRoots(JSON.stringify({ filter: "Local", project: "App", input: "", model: { data: [{ localObject: "local" }], path: "?.data?.items" } }))
    .concat(lib.listRoots("local?.data?.items")));
  assert.deepStrictEqual(roots, ["data", "data"]);
  assert.strictEqual(lib.handmadeGrid(page(["data"], [
    { where: "InitFilterStatus", sets: "filterStatus", text: "''" },
    { where: "StoreData", sets: "data", text: "out?.success ? (out?.data ?? null) : null" },
    { where: "Toggle", sets: "selected", text: "((s: any[], v: string) => s.indexOf(v) >= 0 ? s.filter((x: any) => x !== v) : s.concat([v]))((c8oPage.local.selected || []).slice(), '' + scope.item?.id)" },
    { where: "ForEach", sets: "", text: "local?.data?.items " }
  ])), null);
});

test("LIB-HANDMADE-GRID: a page using the agGrid, a removed row or a page without a list is not flagged", () => {
  const sorting = [{ where: "SortRows", sets: "", text: "page.local.rows.sort((a, b) => a.name.localeCompare(b.name));" }];
  assert.ok(lib.handmadeGrid(page(["rows"], sorting)));
  assert.strictEqual(lib.handmadeGrid(page(["rows"], sorting, true)), null, "the page uses the agGrid");
  assert.strictEqual(lib.handmadeGrid(page([], sorting)), null, "no ForEach");
  assert.strictEqual(lib.handmadeGrid(page(["rows"], [{ where: "RemoveDeleted", sets: "rows", text: "c8oPage.local.rows.filter((r: any) => r.id !== event.id)" }])), null);
  assert.strictEqual(lib.handmadeGrid(page(["rows"], [{ where: "SortOptions", sets: "", text: "page.local.options.sort();" }])), null, "another local");
});

test("LIB-NPM-DUPLICATE: npm packages a library already wraps", () => {
  const found = plain(lib.npmDuplicates([["ag-grid-community", "^31.0.0"], ["lodash", "^4.17.0"], ["@fullcalendar/core", "6.1.0"],
    ["Chart.js", "4"], ["papaparse", "5"]]));
  assert.deepStrictEqual(found.map(d => d.package + " -> " + d.library), ["ag-grid-community -> lib_ExtendedComponents_ui_ngx",
    "@fullcalendar/core -> lib_FullCalendar", "chart.js -> libApexCharts", "papaparse -> lib_csv_response"]);
  assert.match(found[3].also, /agGrid of lib_ExtendedComponents_ui_ngx also exports/);
  assert.deepStrictEqual(plain(lib.npmDuplicates([["lodash", "4"], ["date-fns", "3"]])), []);
  assert.deepStrictEqual(plain(lib.npmDuplicates(null)), []);
});

test("LIB-HANDMADE-AUTH: password columns in SQL and password hashing in code", () => {
  assert.strictEqual(lib.passwordColumn("SELECT id, email, password_hash FROM users WHERE email = {email}"), "password_hash");
  assert.strictEqual(lib.passwordColumn("INSERT INTO comptes (email, mot_de_passe) VALUES ({email}, {mdp})"), "mot_de_passe");
  assert.strictEqual(lib.passwordColumn('UPDATE "users" SET "pwd" = {pwd} WHERE id = {id}'), "pwd");
  assert.strictEqual(lib.passwordColumn("SELECT u.id FROM users u WHERE u.email = {email} AND u.passwd = {secret}"), "passwd");
  assert.strictEqual(lib.passwordColumn("SELECT password_reset_sent_at, password_changed_at FROM users"), "", "other columns");
  assert.strictEqual(lib.passwordColumn("SELECT id FROM users WHERE note = 'password' AND token = {password} -- password"), "", "a literal, a variable, a comment");
  assert.strictEqual(lib.passwordHashing('var digest = java.security.MessageDigest.getInstance("SHA-256").digest(String(password).getBytes("UTF-8"));'), "MessageDigest");
  assert.strictEqual(lib.passwordHashing("const ok = bcrypt.compareSync(pwd, row.hash);"), "bcrypt");
  assert.strictEqual(lib.passwordHashing("var sum = MessageDigest.getInstance('MD5').digest(fileBytes);" + " ".repeat(300) + "smtpPassword = symbols.smtp;"), "", "a checksum far from the password");
  assert.strictEqual(lib.passwordHashing("var sum = MessageDigest.getInstance('MD5').digest(fileBytes);"), "");
});

test("LIB-* fixes: how to import the library, or that the app references it", () => {
  assert.strictEqual(lib.libraryFix("App", ["lib_csv_response", "lib_download_file"], {}),
    'Import lib_csv_response: marketplace-import({project:"lib_csv_response", targetProject:"App"}), then marketplace-describe({project:"lib_csv_response"}) ' +
    "for its sequences and shared components; lib_download_file the same way.");
  assert.strictEqual(lib.libraryFix("App", ["lib_csv_response", "lib_download_file"], { lib_csv_response: true }),
    'The app references lib_csv_response: call its generate_csv sequence instead; marketplace-describe({project:"lib_csv_response"}) gives their QNames.');
  assert.match(lib.libraryFix("App", ["lib_ExtendedComponents_ui_ngx"], { lib_extendedcomponents_ui_ngx: true }),
    /^The app references lib_ExtendedComponents_ui_ngx: use its agGrid shared component \(ngx-page-create kind list with list\.grid:true\) instead/);
  Object.keys(lib.LIBRARIES).forEach(name => assert.ok(lib.LIBRARIES[name].gives && lib.LIBRARIES[name].use, name));
});

// The whole run on fake beans: the walk gives each rule its objects, once per object.
function fakeBean(cls, name, props, children) {
  return Object.assign({ getClass: () => ({ getName: () => "com.twinsoft.convertigo.beans." + cls }), getName: () => name, getComment: () => "Does it.",
    children: children || [] }, props || {});
}
function named(node, parent) {
  const qname = parent ? parent + "." + node.getName() : node.getName();
  node.getFullQName = () => qname;
  node.children.forEach(c => named(c, qname));
  return node;
}
function fakeJava(files) {
  class File {
    constructor(parent, child) { this.path = (parent instanceof File ? parent.path : String(parent)) + "/" + child; }
    rel() { return this.path.replace(/^\/p\//, ""); }
    isDirectory() { return Object.keys(files).some(f => f.startsWith(this.rel() + "/")); }
    listFiles() {
      const names = new Set(Object.keys(files).filter(f => f.startsWith(this.rel() + "/")).map(f => f.slice(this.rel().length + 1).split("/")[0]));
      return [...names].map(n => new File(this, n));
    }
    getName() { return this.path.split("/").pop(); }
    length() { return (files[this.rel()] || "").length; }
    toPath() { return this.rel(); }
  }
  return { io: { File }, nio: { file: { Files: { readAllBytes: p => files[p] } } }, lang: { String: function (bytes) { return new String(bytes); } } };
}
function runLint(project, files, securityAudit) {
  const sandbox = {
    C8O: { securityAudit, dbo: { getDirectChildren: d => d.children || [], _normalizeXMLVector: v => v || null, _misplacedSmartSourceKeys: () => [], _NGX_NOT_SET: "not set" },
      sqlDialect: { of: () => "hsqldb", unbalancedQuote: () => null, dateMath: () => null, foreignSyntax: () => [], aliasFolding: () => null } },
    Packages: { com: { twinsoft: { convertigo: { engine: { Engine: { theApp: { databaseObjectsManager: {
      getOriginalProjectByName: n => (String(n) === project.getName() ? project : null) } } } } } } } },
    java: fakeJava(files || {}),
    JSON
  };
  vm.createContext(sandbox);
  vm.runInContext(responseSource, sandbox, { filename: "sequence_response.js" });
  vm.runInContext(source, sandbox, { filename: "tools_project_lint.js" });
  return plain(sandbox.C8O.lint.run(project.getName(), { checkTexts: false }));
}
const smart = (mode, value, raw) => ({ getMode: () => mode, getValue: () => value, getSmartValue: () => (raw === undefined ? value : raw), getExpression: () => value });
const setLocal = (name, property, value) => fakeBean("ngx.components.UIDynamicAction", name, { getBeanData: () => JSON.stringify({ name: "SetLocalAction",
  properties: { Property: { mode: "plain", value: property }, Value: { mode: "script", value } } }) });
const forEach = (name, source) => fakeBean("ngx.components.UIControlDirective", name, { getDirectiveName: () => "ForEach", getSourceSmartType: () => source });
const custom = (name, code, deps) => fakeBean("ngx.components.UICustomAction", name, { getActionValue: () => code, getPackageDependencies: () => deps || [] });
const ngxPage = (name, children, root) => fakeBean("ngx.components.PageComponent", name, { isRoot: root === true, getScriptContent: () => "", getTitle: () => "" }, children);

function handBuiltApp(name, references) {
  const app = fakeBean("ngx.components.ApplicationComponent", "Application", {}, [
    ngxPage("Orders", [
      forEach("ForEachView", smart("SCRIPT", "local?.view")),
      custom("ApplyFilters", "page.local.view = page.local.rows.filter(r => r.name.toLowerCase().includes(page.local.search)).sort((a, b) => a.name.localeCompare(b.name))" +
        ".slice(page.local.pageIndex * page.local.pageSize, (page.local.pageIndex + 1) * page.local.pageSize);",
        [["ag-grid-community", "^31.0.0"], ["ag-grid-angular", "^31.0.0"], ["lodash", "^4.17.0"]]),
      custom("ExportCsv", 'const csv = page.local.rows.map(r => [r.id, r.name].join(";")).join("\\n"); save(new Blob([csv], { type: "text/csv" }));')
    ], true),
    ngxPage("Generated", [
      forEach("ForEachItems", smart("SOURCE", "local?.data?.items", JSON.stringify({ filter: "Local", model: { path: "?.data?.items" } }))),
      setLocal("InitFilterStatus", "filterStatus", "''"),
      setLocal("StoreData", "data", "out?.success ? (out?.data ?? null) : null"),
      setLocal("Toggle", "selected", "((s: any[], v: string) => s.indexOf(v) >= 0 ? s.filter((x: any) => x !== v) : s.concat([v]))((c8oPage.local.selected || []).slice(), '' + scope.item?.id)"),
      fakeBean("ngx.components.UIDynamicAction", "Load", { getBeanData: () => JSON.stringify({ name: "CallSequenceAction", properties: { requestable: { mode: "plain", value: name + ".list_orders" } } }) })
    ]),
    ngxPage("WithGrid", [
      forEach("ForEachRows", smart("SCRIPT", "local?.rows")),
      fakeBean("ngx.components.UIUseShared", "Grid", { getSharedComponentQName: () => "lib_ExtendedComponents_ui_ngx.MobileApplication.Application.agGrid" }),
      custom("SortRows", "page.local.rows.sort((a, b) => a.name.localeCompare(b.name));")
    ])
  ]);
  const project = fakeBean("core.Project", name, { getDirPath: () => "/p", getReferenceList: () => ({ size: () => references.length, get: i => references[i] }) }, [
    fakeBean("connectors.SqlConnector", "db", {}, [fakeBean("transactions.SqlTransaction", "q_login", { getSqlQuery: () => "SELECT id, password_hash FROM users WHERE email = {email}" })]),
    fakeBean("sequences.GenericSequence", "export_orders", {}, [fakeBean("steps.SimpleStep", "BuildCsv", {
      getExpression: () => 'var out = rows.map(function (r) { return r.join(";"); }).join("\\r\\n"); contentType = "text/csv";' })]),
    fakeBean("sequences.GenericSequence", "export_json", {}, [fakeBean("steps.JsonFieldStep", "line", {
      getKey: () => smart("PLAIN", "line"), getValue: () => smart("JS", 'csvRows.map(function (r) { return r.id + ";" + r.name; }).join("\\n")') })]),
    fakeBean("mobile.MobileApplication", "MobileApplication", {}, [app])
  ]);
  return named(project);
}
const projectFiles = {
  "js/export.js": 'function toCsv(rows) { return rows.map(function (r) { return r.join(","); }).join("\\n"); } // text/csv',
  "js/auth.js": 'var hash = java.security.MessageDigest.getInstance("SHA-256").digest(String(password).getBytes("UTF-8"));',
  "js/notes.js": "// the CSV export goes through lib_csv_response",
  "js/vendor/papaparse.min.js": 'csv.join(",")'
};

test("project-lint run: the LIB-* findings of an app built by hand, once per object", () => {
  const result = runLint(handBuiltApp("App", [{ getParser: () => ({ getProjectName: () => "lib_UserManager" }) }, {}]), projectFiles);
  const of = rule => result.findings.filter(f => f.rule === rule);
  assert.deepStrictEqual(of("LIB-HANDMADE-CSV").map(f => f.qname), ["App.export_orders.BuildCsv", "App.export_json.line",
    "App.MobileApplication.Application.Orders.ExportCsv", "js/export.js"]);
  assert.match(of("LIB-HANDMADE-CSV")[0].fix, /^Import lib_csv_response: marketplace-import\(\{project:"lib_csv_response", targetProject:"App"\}\), then marketplace-describe/);
  assert.match(of("LIB-HANDMADE-CSV")[0].message, /lib_csv_response gives a sequence \(generate_csv\).*list\.grid:\{csv:true\}/);
  assert.deepStrictEqual(of("LIB-HANDMADE-GRID").map(f => f.qname), ["App.MobileApplication.Application.Orders"]);
  assert.match(of("LIB-HANDMADE-GRID")[0].message, /^The page sorts, filters and pages its list \(ForEach over view\) itself, in ApplyFilters: a hand-made data grid\./);
  assert.deepStrictEqual(of("LIB-NPM-DUPLICATE").map(f => f.qname), ["App.MobileApplication.Application.Orders.ApplyFilters"]);
  assert.match(of("LIB-NPM-DUPLICATE")[0].message, /^package_dependencies adds ag-grid-community, ag-grid-angular, which the library lib_ExtendedComponents_ui_ngx already wraps/);
  assert.match(of("LIB-NPM-DUPLICATE")[0].fix, /Then take these packages out of package_dependencies\.$/);
  assert.deepStrictEqual(of("LIB-HANDMADE-AUTH").map(f => f.qname), ["App.db.q_login", "js/auth.js"]);
  of("LIB-HANDMADE-AUTH").forEach(f => assert.match(f.fix, /^The app references lib_UserManager: call its sequences \(SignIn, CreateAccount, ForgotPassword\.\.\.\) instead/));
  result.findings.filter(f => /^LIB-/.test(f.rule)).forEach(f => assert.strictEqual(f.severity, "warning", f.rule));
});

test("project-lint run: a library is never sent to itself", () => {
  const result = runLint(handBuiltApp("lib_csv_response", []), projectFiles);
  assert.deepStrictEqual(result.findings.filter(f => f.rule === "LIB-HANDMADE-CSV"), []);
  assert.strictEqual(result.findings.filter(f => f.rule === "LIB-HANDMADE-AUTH").length, 2, "other rules still apply");
});

// --- sign out (PCA eval 31/10: no generated app had one until a reviewer asked) ---------------------------------------------

const callSeq = (name, target, noAutoLogin) => fakeBean("ngx.components.UIDynamicAction", name, { getBeanData: () => JSON.stringify({ name: "CallSequenceAction",
  properties: Object.assign({ requestable: { mode: "plain", value: target } }, noAutoLogin === undefined ? {} : { noAutoLogin: { mode: "plain", value: String(noAutoLogin) } }) }) });
// The audit model of an app with a login (its own step), a logout that calls the library's, and a list.
const sessionModel = () => ({
  requestables: [{ qname: "App.auth_login", calls: [] }, { qname: "App.auth_logout", calls: ["lib_UserManager.Logout"] },
    { qname: "lib_UserManager.Logout", calls: [] }, { qname: "App.order_list", calls: [] }],
  steps: [{ owner: "App.auth_login", kind: "setAuthenticatedUser", enabled: true },
    { owner: "lib_UserManager.Logout", kind: "removeUser", enabled: true },
    { owner: "App.auth_login", kind: "js", enabled: true, signals: { removesUser: true } }]
});
function sessionApp(pages) {
  const app = fakeBean("ngx.components.ApplicationComponent", "Application", {}, pages);
  return named(fakeBean("core.Project", "App", { getDirPath: () => "/p", getReferenceList: () => ({ size: () => 0, get: () => null }) },
    [fakeBean("mobile.MobileApplication", "MobileApplication", {}, [app])]));
}

test("sessionSequences: the login and logout requestables, with the ones that call them", () => {
  const C8O = (() => { const sb = { C8O: { dbo: {} }, JSON }; vm.createContext(sb); vm.runInContext(source, sb); return sb.C8O; })();
  const roles = plain(C8O.lint.sessionSequences(sessionModel()));
  assert.deepStrictEqual(roles, { opens: { "App.auth_login": true }, ends: { "lib_UserManager.Logout": true, "App.auth_logout": true, "App.auth_login": true } });
  assert.deepStrictEqual(plain(C8O.lint.sessionSequences({ steps: [{ owner: "App.x", kind: "removeUser", enabled: false }] })), { opens: {}, ends: {} });
  assert.strictEqual(C8O.lint.noAutoLoginOf({ ionBean: "CallSequenceAction", noAutoLogin: "plain:true" }), true, "the YAML form");
  assert.strictEqual(C8O.lint.noAutoLoginOf({ name: "CallSequenceAction", properties: { noAutoLogin: false } }), false, "unset in memory");
});

test("NGX-NO-LOGOUT: an app that signs users in and never signs them out", () => {
  const result = runLint(sessionApp([ngxPage("Login", [callSeq("SignIn", "App.auth_login", true)], true),
    ngxPage("Orders", [callSeq("Load", "App.order_list")])]), {}, { collect: () => sessionModel() });
  const found = result.findings.filter(f => /LOGOUT/.test(f.rule));
  assert.deepStrictEqual(found.map(f => [f.rule, f.severity, f.qname]), [["NGX-NO-LOGOUT", "warning", "App.MobileApplication.Application"]]);
  assert.match(found[0].message, /^The app signs users in \(App\.auth_login\) but nothing in it calls a sequence that ends the session/);
  assert.match(found[0].fix, /^Add a logout page to the menu: ngx-page-create kind logout, sequence auth_logout \(it ends the session\), logout\.page the login page\.$/);
});

test("NGX-LOGOUT-AUTOLOGIN: a logout called without noAutoLogin; with it, nothing is reported", () => {
  const audit = { collect: () => sessionModel() };
  const without = runLint(sessionApp([ngxPage("Login", [callSeq("SignIn", "App.auth_login")], true),
    ngxPage("Logout", [callSeq("End", "App.auth_logout")])]), {}, audit);
  assert.deepStrictEqual(without.findings.filter(f => /LOGOUT/.test(f.rule)).map(f => [f.rule, f.qname]),
    [["NGX-LOGOUT-AUTOLOGIN", "App.MobileApplication.Application.Logout.End"]]);
  assert.match(without.findings.filter(f => f.rule === "NGX-LOGOUT-AUTOLOGIN")[0].message, /the SDK replays the last login as soon as the session ends/);
  const withIt = runLint(sessionApp([ngxPage("Login", [callSeq("SignIn", "App.auth_login")], true),
    ngxPage("Logout", [callSeq("End", "App.auth_logout", true)])]), {}, audit);
  assert.deepStrictEqual(withIt.findings.filter(f => /LOGOUT/.test(f.rule)), []);
  const noLogin = runLint(sessionApp([ngxPage("Orders", [callSeq("Load", "App.order_list")], true)]), {}, audit);
  assert.deepStrictEqual(noLogin.findings.filter(f => /LOGOUT/.test(f.rule)), [], "an app without a sign-in needs no sign-out");
  const noAudit = runLint(sessionApp([ngxPage("Login", [callSeq("SignIn", "App.auth_login")], true)]), {});
  assert.deepStrictEqual(noAudit.findings.filter(f => /LOGOUT/.test(f.rule)), [], "without the audit model the rule stays silent");
});

test("TEXT-REVIEW: a text already reviewed with the same model and language is not sent again, its finding is kept", () => {
  const map = new Map();
  const reviewCache = { get: (k) => (map.has(k) ? map.get(k) : null), put: (k, v) => map.set(k, v), size: () => map.size, clear: () => map.clear() };
  let clock = 1000;
  const posts = [];
  const hostOf = () => ({ readKey: () => "sk-test", now: () => clock, header: () => null,
    post: (url, key, body) => {
      const request = JSON.parse(body);
      posts.push(request);
      const lines = request.messages[1].content.split("\n").filter((l) => /^\d+\t/.test(l));
      const issues = lines.filter((l) => /Gerer/.test(l)).map((l) => ({ id: Number(l.split("\t")[0]), fixed: "Gérer les postes", kind: "accents" }));
      return { status: 200, body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ language: "fr", issues }) } }] }), header: () => null };
    } });
  const lint = (texts, model) => {
    const found = [];
    const owners = {};
    texts.forEach((t, i) => { owners[t] = ["P." + i]; });
    const result = context.C8O.lint.reviewTexts({ host: hostOf(), reviewCache, textModel: model }, texts, owners, { values: {} },
      (rule, severity, where, message, fix) => found.push({ rule, where, message, fix }), null);
    return { result, found };
  };
  const first = lint(["Gerer les postes", "Version"]);
  assert.strictEqual(posts.length, 1);
  assert.strictEqual(first.found.length, 1);
  assert.strictEqual(first.result.fromCache, undefined);
  // the next lint, one text added: only that one goes to the gateway, the known finding is reported again
  const second = lint(["Gerer les postes", "Version", "Nouveau client"]);
  assert.strictEqual(posts.length, 2);
  assert.deepStrictEqual(posts[1].messages[1].content.split("\n").filter((l) => /^\d+\t/.test(l)), ["0\tNouveau client"]);
  assert.strictEqual(second.result.fromCache, 2);
  assert.strictEqual(second.result.reviewed, 3);
  assert.deepStrictEqual(second.found.map((f) => f.fix), ["Write \"Gérer les postes\"."]);
  assert.ok(/accents, app texts, fr/.test(second.found[0].message));
  // nothing new: no call at all
  lint(["Gerer les postes", "Version", "Nouveau client"]);
  assert.strictEqual(posts.length, 2);
  // another model reviews again; a week later too
  lint(["Version"], "other-model");
  assert.strictEqual(posts.length, 3);
  clock += 8 * 24 * 3600 * 1000;
  lint(["Version"]);
  assert.strictEqual(posts.length, 4);
});

// --- what a page reads of a call's answer (PipelineCrm 12/11: out?.success on an upsert-crud facade, "Error" over its rows) --

test("NGX-RESPONSE-CONTRACT: a page that tests the envelope of a business sequence on a facade answering its data itself", () => {
  const step = (cls, name, key, children, mode) => fakeBean("steps." + cls, name, { getKey: () => smart(mode || "PLAIN", key), isOutput: () => true }, children);
  const facade = fakeBean("sequences.GenericSequence", "crm_list_deals", {}, [
    fakeBean("steps.TransactionStep", "CallCrm_list_deals", { isOutput: () => false }),
    step("JsonArrayStep", "Rows", "rows", [fakeBean("steps.IteratorStep", "RowsIterator", {}, [step("JsonObjectStep", "Item", "")])])]);
  const business = fakeBean("sequences.GenericSequence", "crm_dashboard", {}, ["success", "data", "errors", "meta"].map(k => step("JsonToXmlStep", "out" + k, k)));
  const computed = fakeBean("sequences.GenericSequence", "crm_computed", {}, [step("JsonToXmlStep", "Out", "k", [], "JS")]);
  const ifAction = (name, condition) => fakeBean("ngx.components.UIDynamicAction", name, { getBeanData: () => JSON.stringify({ name: "IfAction",
    properties: { condition: { mode: "script", value: condition } } }) });
  const call = (name, target, kids) => fakeBean("ngx.components.UIDynamicAction", name, { getBeanData: () => JSON.stringify({ name: "CallSequenceAction",
    properties: { requestable: { mode: "plain", value: target } } }) }, kids);
  const envelopeReads = () => [setLocal("StoreData", "data", "out?.success ? (out?.data ?? null) : null"),
    setLocal("StoreError", "error", "out?.success ? null : (out?.errors?.[0]?.message || 'Error')")];
  const app = fakeBean("ngx.components.ApplicationComponent", "Application", {}, [
    ngxPage("Deals", [call("Load", "App.crm_list_deals", envelopeReads())], true),
    ngxPage("DealsOk", [call("Load", "App.crm_list_deals", [setLocal("StoreData", "data", "out != null && out?.error == null ? out : null"),
      setLocal("StoreError", "error", "out != null && out?.error == null ? null : (out?.error?.message || 'Error')")])]),
    ngxPage("Dashboard", [call("Load", "App.crm_dashboard", envelopeReads().concat([setLocal("Count", "n", "out?.rows?.length")]))]),
    ngxPage("Computed", [call("Load", "App.crm_computed", envelopeReads())]),
    ngxPage("Either", [call("Load", "App.crm_list_deals", [ifAction("IfOk", "!out?.error && !(out?.errors && out.errors.length) && out?.success !== false")])]),
    ngxPage("Tolerant", [call("Load", "App.crm_list_deals", [setLocal("StoreData", "data",
      "(out?.success === true || (out != null && out?.success === undefined && out?.error == null)) ? (out?.success === true ? (out?.data ?? null) : out) : null")])])
  ]);
  const sequences = { crm_list_deals: facade, crm_dashboard: business, crm_computed: computed };
  const project = named(fakeBean("core.Project", "App", { getDirPath: () => "/p", getReferenceList: () => ({ size: () => 0, get: () => null }),
    getSequenceByName: n => sequences[n] || null }, [facade, business, computed, fakeBean("mobile.MobileApplication", "MobileApplication", {}, [app])]));
  const found = runLint(project, {}).findings.filter(f => f.rule === "NGX-RESPONSE-CONTRACT");
  assert.deepStrictEqual(found.map(f => [f.severity, f.qname]), [
    ["error", "App.MobileApplication.Application.Deals.Load"],
    ["warning", "App.MobileApplication.Application.Dashboard.Load"]]);
  assert.match(found[0].message, /^The action reads out\.success, out\.data, out\.errors of App\.crm_list_deals, which answers \{rows\}, its data itself/);
  assert.match(found[0].message, /shows its error \("Error"\) although the call answered/);
  assert.match(found[0].fix, /^Read the answer itself: data = out != null && out\?\.error == null \? out : null.*the paths then start with rows\).*ngx-page-create/);
  assert.match(found[1].message, /reads out\.rows of App\.crm_dashboard, which answers \{success, data, errors, meta\}: this key is never in its answer \(a business sequence's data is in out\.data\)/);
  assert.strictEqual(found[1].fix, "Read out?.data?.rows (the paths of a page are read in the data of a business sequence).");
});

test("NGX-FALLBACK-ROUTE: a ** page with pages after it hides them (PipelineCrm3 13/11)", () => {
  const page = (name, segment, root) => fakeBean("ngx.components.PageComponent", name, { isRoot: root === true, getScriptContent: () => "", getTitle: () => "",
    getSegment: () => segment, getComment: () => "A page." });
  const app = (pages) => named(fakeBean("core.Project", "App", { getDirPath: () => "/p", getReferenceList: () => ({ size: () => 0, get: () => null }) },
    [fakeBean("mobile.MobileApplication", "MobileApplication", {}, [fakeBean("ngx.components.ApplicationComponent", "Application", {}, pages)])]));
  const found = runLint(app([page("Home", "home", true), page("NotFound", "**"), page("Deals", "deals"), page("Companies", "companies")]), {})
    .findings.filter(f => f.rule === "NGX-FALLBACK-ROUTE");
  assert.deepStrictEqual(found.map(f => [f.qname, f.severity]), [["App.MobileApplication.Application.NotFound", "error"]]);
  assert.match(found[0].message, /but Deals, Companies come after it: the router takes the first route that matches, so these pages never open/);
  assert.match(found[0].fix, /^Move NotFound after Companies with databaseobject-move/);
  assert.deepStrictEqual(runLint(app([page("Home", "home", true), page("Deals", "deals"), page("NotFound", "**")]), {})
    .findings.filter(f => f.rule === "NGX-FALLBACK-ROUTE"), [], "the last page");
});

test("NGX-I18N-LABEL: the plain label of a form control in an app that translates its texts", () => {
  const input = (name, label) => fakeBean("ngx.components.UIDynamicElement", name, { getBeanData: () => JSON.stringify({ name: "Input",
    properties: { Label: { mode: "plain", value: label }, Type: { mode: "plain", value: "email" } } }) });
  const scripted = fakeBean("ngx.components.UIDynamicElement", "InPassword", { getBeanData: () => JSON.stringify({ name: "Input",
    properties: { Label: { mode: "script", value: "'Password' | translate" } } }) });
  const i18nText = fakeBean("ngx.components.UIText", "Title", { isI18n: () => true, getTextSmartType: () => smart("PLAIN", "Sign_in") });
  const app = (texts) => named(fakeBean("core.Project", "App", { getDirPath: () => "/p", getReferenceList: () => ({ size: () => 0, get: () => null }) },
    [fakeBean("mobile.MobileApplication", "MobileApplication", {}, [fakeBean("ngx.components.ApplicationComponent", "Application", {}, [
      ngxPage("Login", texts.concat([input("InUser", "Email"), scripted]), true)])])]));
  const files = { "DisplayObjects/mobile/assets/i18n/en.json": "{\"Sign_in\": \"Sign in\"}", "DisplayObjects/mobile/assets/i18n/fr.json": "{\"Sign_in\": \"Se connecter\"}" };
  const found = runLint(app([i18nText]), files).findings.filter(f => f.rule === "NGX-I18N-LABEL");
  assert.deepStrictEqual(found.map(f => f.qname), ["App.MobileApplication.Application.Login.InUser"]);
  assert.match(found[0].message, /^The Label "Email" of this control is plain text while the app translates its texts \(i18n\)/);
  assert.match(found[0].fix, /^Set Label to the script 'Email' \| translate \(mode SCRIPT\) and add the key Email to each of en\.json, fr\.json/);
  assert.deepStrictEqual(runLint(app([]), files).findings.filter(f => f.rule === "NGX-I18N-LABEL"), [], "an app that does not translate its texts");
});
