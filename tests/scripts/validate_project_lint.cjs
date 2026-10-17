#!/usr/bin/env node
// Checks the pure rules of js/tools_project_lint.js that need no engine: the glued-text boundary.
// The full rules run against a live project through the project-lint tool.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const source = fs.readFileSync(path.join(__dirname, "..", "..", "js", "tools_project_lint.js"), "utf8");
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

console.log("project-lint boundary rules OK");
