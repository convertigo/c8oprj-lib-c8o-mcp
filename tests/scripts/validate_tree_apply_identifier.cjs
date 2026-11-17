// databaseobject-tree-apply checks a UI identifier before any write. An agent that sent a SmartType object for it got
// "must be a valid TypeScript identifier ... Got: [object Object]" and could not tell what was wrong: the error now says a
// plain string is expected and shows a short excerpt of what was received.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../../js/tools_databaseobject_tree_apply.js'), 'utf8');

// Only the input checks run: they throw before the editing profile or the batch engine is reached.
function inputError(tree) {
  const context = {
    tree,
    target: 'Probe.Application.NgxApp.pg:Page.Content',
    include() {},
    C8O: {
      dbo: {
        batchAsTrimmed: value => (value == null ? '' : String(value).trim()),
        batchAsBoolean: (value, fallback) => (value == null ? fallback : value === true || String(value).toLowerCase() === 'true'),
        batchParseObjectInput: value => value
      }
    }
  };
  try {
    vm.runInNewContext(source, context, { filename: 'tools_databaseobject_tree_apply.js' });
  } catch (e) {
    return String(e && e.message);
  }
  return '';
}

test('a SmartType or another object as identifier: a plain string is asked, and what was received is shown', () => {
  const smartType = { mode: 'PLAIN', value: 'clockDisplay' };
  const message = inputError({ properties: { identifier: smartType } });
  assert.match(message, /^tree\.properties\.identifier must be a plain string holding a valid TypeScript identifier \(for example "clockDisplay"\), not a SmartType or another object\. Got: \{"mode":"PLAIN","value":"clockDisplay"\}$/);
  assert.doesNotMatch(message, /\[object Object\]/);
  const nested = inputError({ children: [{ properties: [{ name: 'identifier', value: ['clock'] }] }] });
  assert.match(nested, /^tree\.children\[0\]\.properties\.identifier must be a plain string.*Got: \["clock"\]$/);
});

test('the excerpt of a large object is bounded', () => {
  const message = inputError({ properties: { identifier: { mode: 'SCRIPT', value: 'x'.repeat(5000) } } });
  const got = message.substring(message.indexOf('Got: ') + 5);
  assert.ok(got.length <= 160, String(got.length));
  assert.match(got, /^\{"mode":"SCRIPT","value":"x+\.\.\.$/);
});

test('a string that is not an identifier keeps its message, bounded too; a valid one passes the check', () => {
  assert.match(inputError({ properties: { identifier: 'clock-display' } }),
    /^tree\.properties\.identifier must be a valid TypeScript identifier \(for example clockDisplay, never clock-display\)\. Got: clock-display$/);
  const long = inputError({ properties: { identifier: 'a-'.repeat(400) } });
  assert.ok(long.length < 300, String(long.length));
  // A valid identifier raises no input error: the run goes on to the next stage (absent from this sandbox).
  assert.doesNotMatch(inputError({ properties: { identifier: 'clockDisplay' } }), /identifier/);
});

test('a page event given as an object shows it as JSON, never [object Object]', () => {
  const message = inputError({ className: 'ngx.components.UIPageEvent', properties: { viewEvent: { mode: 'PLAIN' } } });
  assert.match(message, /viewEvent must be one of .* Got: \{"mode":"PLAIN"\}$/);
  assert.doesNotMatch(inputError({ className: 'ngx.components.UIPageEvent', properties: { viewEvent: { value: 'onDidEnter' } } }), /viewEvent/);
});
