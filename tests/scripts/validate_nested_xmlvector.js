#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeXMLVector {
  constructor(items) {
    this.items = Array.isArray(items) ? items.slice() : [];
  }

  add(value) {
    this.items.push(value);
  }

  get(index) {
    return this.items[index];
  }

  size() {
    return this.items.length;
  }
}

class FakeJavaList extends FakeXMLVector {}

class FakeNativeJavaObject {
  constructor(value) {
    this.value = value;
  }

  unwrap() {
    return this.value;
  }
}

const root = path.resolve(__dirname, "../..");
const source = fs.readFileSync(path.join(root, "js/databaseobject.js"), "utf8");
const start = source.indexOf("C8O.dbo._normalizeXMLVector = function");
const end = source.indexOf("C8O.dbo._extractFormatedContentString = function");
assert(start >= 0 && end > start, "Unable to isolate XMLVector helpers from js/databaseobject.js");

const sandbox = {
  C8O: { dbo: {} },
  Packages: {
    com: { twinsoft: { convertigo: { beans: { common: { XMLVector: FakeXMLVector } } } } },
    java: { util: { List: FakeJavaList } },
    org: { mozilla: { javascript: { NativeJavaObject: FakeNativeJavaObject } } }
  }
};
vm.runInNewContext(source.slice(start, end), sandbox, { filename: "databaseobject-xmlvector.js" });

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const nested = sandbox.C8O.dbo._buildXMLVector([
  ["altcha", "3.2.1"],
  ["{ loadStripe }", "@stripe/stripe-js"]
]);
assert(nested instanceof FakeXMLVector);
assert(nested.get(0) instanceof FakeXMLVector, "Dependency row must remain an XMLVector");
assert.deepStrictEqual(
  plain(sandbox.C8O.dbo._normalizeXMLVector(nested)),
  [["altcha", "3.2.1"], ["{ loadStripe }", "@stripe/stripe-js"]]
);

const flat = sandbox.C8O.dbo._buildXMLVector(["123", "./document/value/text()"]);
assert.deepStrictEqual(
  plain(sandbox.C8O.dbo._normalizeXMLVector(flat)),
  ["123", "./document/value/text()"]
);

const javaList = new FakeJavaList([
  new FakeJavaList(["marked", "15.0.0"]),
  new FakeNativeJavaObject(new FakeJavaList(["altcha", "3.2.1"]))
]);
assert.deepStrictEqual(
  plain(sandbox.C8O.dbo._normalizeXMLVector(sandbox.C8O.dbo._buildXMLVector(javaList))),
  [["marked", "15.0.0"], ["altcha", "3.2.1"]]
);

console.log("Nested XMLVector regression checks passed.");
