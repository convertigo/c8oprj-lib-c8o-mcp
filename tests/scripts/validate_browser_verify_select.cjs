const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// PCA eval 30/10: the verifier's clicks on a custom ion-select timed out until its step budget was gone, and its summary
// gave an admin dashboard's counts for the home page. Reproduced in a Studio viewer: the Studio's build progress widget
// (a 100x100 canvas centered on the body, left in the page after the build) took the clicks above the ion-select alert,
// and an alert applies the choice only on its OK button. Checked live after the change: option clicked, then OK, ionChange
// received, in 1.2 s; an unknown option names the select's options.

const root = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(root, 'node/browser_verify_agent.cjs'), 'utf8');
const agent = require(path.join(root, 'node/browser_verify_agent.cjs'));

test('click, select and check let clicks through the Studio progress widget first', () => {
  assert.match(src, /async function releaseStudioProgress\(page\) \{[\s\S]*?canvas\.width === 100 && canvas\.height === 100\) \{\s*el\.style\.pointerEvents = "none";/);
  for (const action of ['click', 'select', 'check']) {
    assert.match(src, new RegExp('    ' + action + ': async function \\(args\\) \\{\\s*await releaseStudioProgress\\(page\\(\\)\\);'), action);
  }
});

test('a custom select confirms an open ion-alert, and sets an ion-select whose list cannot be clicked', () => {
  assert.match(src, /var ok = page\.locator\("ion-alert \.alert-button-group button:not\(\.alert-button-role-cancel\)"\)\.filter\(\{ visible: true \}\);/);
  assert.match(src, /var confirmed = await confirmOpenAlert\(page\(\), t\);/);
  assert.match(src, /el\.dispatchEvent\(new CustomEvent\("ionChange", \{ detail: \{ value: match\.value \}, bubbles: true \}\)\);/);
  assert.match(src, /throw new Error\("No option \\"" \+ value \+ "\\" in this select\. Its options: " \+ set\.options\.join\(" \| "\) \+ "\."\);/);
});

test('the prompt keeps each figure on the page it was read on', () => {
  assert.match(agent.SYSTEM_PROMPT, /A figure or text in a check, and in the summary, is the one read on the page that check is about: name that page, and never carry a value read on another page/);
});
