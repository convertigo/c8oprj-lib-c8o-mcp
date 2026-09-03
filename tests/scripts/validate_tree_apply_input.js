#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "../../js/tools_databaseobject_tree_apply.js"),
  "utf8"
);

function run(tree) {
  let batchCalls = 0;
  const context = {
    tree,
    target: "Probe.Application.NgxApp.pg:Page.Content",
    include() {},
    C8O: {
      dbo: {
        batchAsTrimmed(value) {
          return value == null ? "" : String(value).trim();
        },
        batchAsBoolean(value, fallback) {
          return value == null ? fallback : value === true || String(value).toLowerCase() === "true";
        },
        batchParseObjectInput(value) {
          return value;
        },
        resolve(value) {
          return value;
        },
        safeQName(value) {
          return String(value || "");
        },
        batchApply() {
          batchCalls += 1;
          return { status: "ok", errors: [], touchedQNames: [] };
        },
        computeBatchRefreshQName() {
          return "";
        },
        refreshStudioTreeByQName() {
          throw new Error("refresh should not run in this test");
        }
      },
      uiReveal: {
        enabled() {
          return false;
        }
      }
    }
  };
  vm.runInNewContext(source, context, { filename: "tools_databaseobject_tree_apply.js" });
  return batchCalls;
}

assert.throws(
  () => run({ properties: { identifier: "clock-display" } }),
  /must be a valid TypeScript identifier/
);
assert.throws(
  () => run({ children: [{ properties: [{ name: "identifier", value: "clock-shell" }] }] }),
  /tree\.children\[0\]\.properties\.identifier/
);
assert.equal(run({ properties: { identifier: "clockDisplay" } }), 1);
assert.equal(run({ properties: { identifier: "" } }), 1);

console.log("databaseobject-tree-apply input contract OK");
