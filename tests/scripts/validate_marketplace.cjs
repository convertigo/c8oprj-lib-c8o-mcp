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
assert.strictEqual(r.entries.length, 0);
assert.strictEqual(r.suggestions.length, 0, "nothing matches even partly: no suggestion, not the whole catalog");
assert.strictEqual(r.catalogSize, catalog.length);
assert.ok(/English keyword/.test(r.warnings[0]));

r = M.list({ search: "authentification" });
assert.strictEqual(r.entries.length, 0, "a French word matches no whole word");
assert.deepStrictEqual([...r.suggestions.map(x => x.name)].sort(), ["AuthStarter", "lib_UserManager"], "closest entries by shared prefix");
assert.ok(/closest entries/.test(r.warnings[r.warnings.length - 1]));

r = M.list({ search: "authentification", limit: 1 });
assert.strictEqual(r.suggestions.length, 1, "suggestions follow limit");

r = M.list({ search: "csv" });
assert.strictEqual(r.entries.length, 1);
assert.strictEqual(r.warnings.length, 0);

assert.deepStrictEqual([...D.readmeUrls("https://github.com/convertigo/c8oprj-lib-csv-response.git", "master")], [
  "https://raw.githubusercontent.com/convertigo/c8oprj-lib-csv-response/master/readme.md",
  "https://raw.githubusercontent.com/convertigo/c8oprj-lib-csv-response/master/README.md"]);
assert.deepStrictEqual([...D.readmeUrls("", "master")], []);
const long = D.trimReadme("line\n".repeat(5000));
assert.ok(long.truncated && long.text.length <= 12000);

console.log("marketplace search and describe OK");
