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

console.log("project-lint boundary rules OK");
