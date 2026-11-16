const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A project-lint answer stays in the agent's context and is read again by each later request (up to 300 findings with
// their fix texts before). The counts cover every finding; the answer lists the first 25, errors first, writes a rule's
// fix on its first finding only, and rule (a rule id or a severity) lists one part.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function lint() {
  const sandbox = { C8O: {}, JSON, include() {}, java: {}, Packages: { com: { twinsoft: { convertigo: { engine: { Engine: {} } } } } } };
  vm.createContext(sandbox);
  vm.runInContext(read('js/tools_project_lint.js'), sandbox);
  return sandbox.C8O.lint;
}

const many = () => {
  const out = [];
  for (let i = 0; i < 40; i++) out.push({ rule: 'DOC-NO-COMMENT', severity: 'warning', qname: 'P.sq:s' + i, message: 'no comment ' + i, fix: 'Give it a comment.' });
  for (let i = 0; i < 10; i++) out.push({ rule: 'TEXT-REVIEW', severity: 'info', qname: 'P#t' + i, message: 'text ' + i, fix: 'Write it.' });
  out.push({ rule: 'SEC-ANONYMOUS-WRITE', severity: 'error', qname: 'P.seed', message: 'anyone writes', fix: 'Make it Private.' });
  return out;
};

test('the first 25 findings, errors first, a fix once per rule, and how to list the rest', () => {
  const r = lint().listFindings(many(), '', 25);
  assert.equal(r.findings.length, 25);
  assert.equal(r.findings[0].rule, 'SEC-ANONYMOUS-WRITE', 'the error comes first');
  assert.equal(r.findings.filter(f => f.fix).length, 2, 'one fix per rule');
  assert.equal(r.findings[1].fix, 'Give it a comment.');
  assert.equal(r.findings[2].fix, undefined);
  assert.match(r.more, /^26 more findings not listed \(DOC-NO-COMMENT: 16, TEXT-REVIEW: 10\)\. List one rule with project-lint rule:"<rule>"\.$/);
});

test('rule lists one rule or one severity', () => {
  const L = lint();
  const text = L.listFindings(many(), 'TEXT-REVIEW', 25);
  assert.equal(text.findings.length, 10);
  assert.equal(text.more, '');
  assert.equal(L.listFindings(many(), 'error', 25).findings.length, 1);
  assert.equal(L.listFindings(many(), 'NO-SUCH-RULE', 25).more, 'No finding of NO-SUCH-RULE.');
});

test('the lint sequence passes rule to the run', () => {
  const yaml = read('_c8oProject/sequences/tools_project_lint.yaml');
  assert.match(yaml, /C8O\.lint\.run\(project, \{checkTexts: String\(checkTexts\) !== "false", context: context, rule: /);
  assert.match(yaml, /↓rule \[variables\.RequestableVariable-\d+\]: \n/);
});
