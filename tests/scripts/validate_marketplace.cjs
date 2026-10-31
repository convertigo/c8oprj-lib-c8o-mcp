#!/usr/bin/env node
// Checks the parts of js/marketplace.js and js/tools_marketplace_describe.js that need no engine: the search over
// several words and the readme location of a library.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..", "..");
const context = { C8O: { dbo: {} }, Packages: {}, java: { lang: { System: { currentTimeMillis: () => 0 } } }, include: () => {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "js", "marketplace.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(root, "js", "tools_marketplace_describe.js"), "utf8"), context);
const M = context.C8O.marketplace;
const D = context.C8O.marketplaceDescribe;

// A fake catalog: the upstream search matches the whole text as one phrase.
const catalog = [
  { name: "lib_UserManager", description: "user/password or OpenID authentication" },
  { name: "AuthStarter", description: "plug-and-play authentication starter" },
  { name: "lib_csv_response", description: "Outputs plain text CSV" },
  { name: "lib_download_file", description: "download file resources controlled by a sequence" }
];
const asked = [];
M._listOne = opts => {
  const q = String(opts.search || "").toLowerCase();
  asked.push(q);
  const entries = catalog.filter(e => !q || (e.name + " " + e.description).toLowerCase().includes(q));
  return { entries, totalCount: entries.length, pagesFetched: [{ page: 1 }], hasMore: false, nextCursor: "", search: q };
};

assert.deepStrictEqual([...M._searchWords("CSV  download, csv")], ["csv", "download"]);
let r = M.list({ search: "user authentication", limit: 10 });
assert.deepStrictEqual(asked.slice(0, 2), ["user", "authentication"]);
assert.strictEqual(r.entries[0].name, "lib_UserManager", "the entry matching both words comes first");
assert.strictEqual(r.totalCount, 2);
assert.ok(/each word on its own/.test(r.warnings[0]));
assert.strictEqual(r.suggestions.length, 0);

r = M.list({ search: "csv download", limit: 1 });
assert.strictEqual(r.entries.length, 1);
assert.strictEqual(r.hasMore, true);
assert.strictEqual(r.nextCursor, "1");

r = M.list({ search: "graphique" });
assert.strictEqual(r.entries.length, 0, "the charts library is not in this catalog");
assert.strictEqual(r.suggestions.length, 0, "nothing matches even partly: no suggestion, not the whole catalog");
assert.strictEqual(r.catalogSize, catalog.length);
assert.ok(r.warnings.some(w => /English keyword/.test(w)));
assert.deepStrictEqual([...r.capabilities[0].libraries], [], "a library the catalog does not list is dropped");

r = M.list({ search: "authentificaton" });
assert.strictEqual(r.entries.length, 0, "a misspelt word matches no whole word and no capability");
assert.deepStrictEqual([...r.suggestions.map(x => x.name)].sort(), ["AuthStarter", "lib_UserManager"], "closest entries by shared prefix");
assert.ok(/closest entries/.test(r.warnings[r.warnings.length - 1]));

r = M.list({ search: "authentificaton", limit: 1 });
assert.strictEqual(r.suggestions.length, 1, "suggestions follow limit");

r = M.list({ search: "csv" });
assert.strictEqual(r.entries.length, 1);
assert.strictEqual(r.entries[0].name, "lib_csv_response");
assert.ok(/CSV/.test(r.entries[0].use), "a capability library says what it is for");
assert.ok(/standard Convertigo component, not an external dependency/.test(r.warnings[0]));

// Capability words, English and French, reach the libraries the catalog descriptions do not name (PCA eval 31/10:
// "table", "tableau" or "liste" never found the AG Grid of lib_ExtendedComponents_ui_ngx).
const caps = text => [...M.capabilitiesOf(text)].map(c => c.capability);
assert.deepStrictEqual(caps("Tableau des postes avec tri et pagination"), ["data grid"]);
assert.deepStrictEqual(caps("listes"), ["data grid"]);
assert.deepStrictEqual(caps("graphique"), ["charts"]);
assert.deepStrictEqual(caps("Export CSV"), ["CSV export"]);
assert.deepStrictEqual(caps("Téléchargement"), ["file download and upload"]);
assert.deepStrictEqual(caps("mot de passe oublié"), ["authentication"]);
assert.deepStrictEqual(caps("kanban"), ["rich UI components"]);
assert.deepStrictEqual(caps("listener"), [], "a longer word is not the capability word");
assert.deepStrictEqual(caps("orders"), []);
const mail = M.capabilitiesOf("courriel")[0];
assert.strictEqual(mail.capability, "mail");
assert.ok(/steps\.SmtpStep/.test(mail.native), "sending mail is a native step, not a library");

catalog.push(
  { name: "lib_ExtendedComponents_ui_ngx", description: "Shared components and actions for Convertigo apps: AG Grid, QR/barcode" },
  { name: "lib_MailListener", description: "Mail listener library: polls an IMAP mailbox" },
  { name: "lib_TreeTable", description: "treeTable shared component" });
asked.length = 0;
r = M.list({ search: "tableau" });
assert.deepStrictEqual(asked.slice(0, 2), ["tableau", "grid"], "the catalog keyword of the capability is searched too");
assert.strictEqual(r.entries[0].name, "lib_ExtendedComponents_ui_ngx");
assert.ok(/list\.grid/.test(r.entries[0].use));
assert.strictEqual(r.capabilities[0].capability, "data grid");
assert.deepStrictEqual([...r.capabilities[0].words], ["tableau"]);

r = M.list({ search: "liste" });
assert.strictEqual(r.entries[0].name, "lib_ExtendedComponents_ui_ngx", "the grid comes before an entry that only holds the word");
assert.ok(r.entries.some(e => e.name === "lib_MailListener"), "the entries the words find are kept after the libraries");
assert.strictEqual(r.entries[1].name, "lib_TreeTable", "a capability library the words did not find is taken from the catalog");

r = M.list({ search: "courriel" });
assert.ok(r.warnings.some(w => /steps\.SmtpStep/.test(w)));
assert.strictEqual(r.entries[0].name, "lib_MailListener");

r = M.list({ search: "liste", limit: 1 });
assert.strictEqual(r.entries.length, 1, "limit still holds");
assert.strictEqual(r.entries[0].name, "lib_ExtendedComponents_ui_ngx");
assert.strictEqual(r.nextCursor, "1");
r = M.list({ search: "liste", limit: 1, cursor: "1" });
assert.strictEqual(r.entries[0].name, "lib_TreeTable", "the next page goes on after the libraries");

// A new reference reaches the Mobile Builder only after the NGX app is loaded again: saved, then reloaded.
const done = [];
context.C8O.dbo.saveProject = p => { done.push('save ' + p.getName()); return { saved: true }; };
context.C8O.dbo.reloadProject = name => { done.push('reload ' + name); return { reloaded: true, message: '' }; };
const ngxApp = { getName: () => 'Shop', getMobileApplication: () => ({ getApplicationComponent: () => ({}) }) };
const backend = { getName: () => 'Api', getMobileApplication: () => null };
M.resolveProject = name => ({ Shop: ngxApp, Api: backend }[name] || null);
let reload = M.reloadAfterNewReference('Shop', 'lib_ExtendedComponents_ui_ngx');
assert.deepStrictEqual(done, ['save Shop', 'reload Shop']);
assert.match(reload.message, /Shop was reloaded so that the Mobile Builder writes the shared components of lib_ExtendedComponents_ui_ngx/);
reload = M.reloadAfterNewReference('Api', 'lib_csv_response');
assert.strictEqual(reload.reloaded, false, 'a project without NGX app is not reloaded');
assert.strictEqual(done.length, 2);
const importSeq = fs.readFileSync(path.join(root, "_c8oProject", "sequences", "tools_marketplace_import.yaml"), "utf8");
assert.ok(/referenceResult\.referenceAdded === true\) \{\s*var reloadAfter = C8O\.marketplace\.reloadAfterNewReference\(referenceTarget/.test(importSeq),
  "marketplace-import reloads the app after a new reference");

// The answer says to browse with cursor: the router passes it to the sequence variable _nextCursor.
const router = fs.readFileSync(path.join(root, "js", "mcp_endpoint_router.js"), "utf8");
const aliases = vm.runInNewContext("(" + /var ARGUMENT_ALIASES = (\{[\s\S]*?\n\});/.exec(router)[1] + ")").tools_marketplace_list;
assert.strictEqual(aliases.cursor, "_nextCursor");
assert.strictEqual(aliases.query, "search");
const overrides = fs.readFileSync(path.join(root, "js", "schema_overrides.js"), "utf8");
assert.ok(/function marketplaceListInputSchema\(\)[\s\S]*?cursor: \{ type: "string"/.test(overrides), "cursor is in the input schema");

assert.deepStrictEqual([...D.readmeUrls("https://github.com/convertigo/c8oprj-lib-csv-response.git", "master")], [
  "https://raw.githubusercontent.com/convertigo/c8oprj-lib-csv-response/master/readme.md",
  "https://raw.githubusercontent.com/convertigo/c8oprj-lib-csv-response/master/README.md"]);
assert.deepStrictEqual([...D.readmeUrls("", "master")], []);
const long = D.trimReadme("line\n".repeat(5000));
assert.ok(long.truncated && long.text.length <= 12000);

console.log("marketplace search and describe OK");
