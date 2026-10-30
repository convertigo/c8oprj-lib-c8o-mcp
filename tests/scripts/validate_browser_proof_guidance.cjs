const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// mistral-large-4 (it has vision) drove the Studio viewer with its own Playwright scripts and lost 5 to 7 waits of 30 s per
// run (usage tests 30/10): the Studio's build progress widget took its clicks (Playwright: "<canvas width=100 height=100>
// intercepts pointer events"), and it clicked hidden ion-select-option elements. The Vibe bootstrap said "GLM models have no
// image input. Delegate ..." as if the verifier were for GLM only.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('the Vibe bootstrap sends every model to the verifier for browser proofs, with the reason', () => {
  const src = read('js/setup_common.js');
  assert.match(src, /- Whatever your model, delegate functional and visual browser proofs to a verifier sub-agent/);
  assert.match(src, /the Studio's build progress widget that make your own Playwright clicks time out \(30 s each\)\. GLM models of the Convertigo gateway have no image input\./);
});

test('the Playwright fallback says how to get past the widget, an ion-select and an ion-input', () => {
  const skill = read('resources/convertigo_common_skill.md');
  assert.match(skill, /the Studio's build progress widget \(a `div` holding a 100x100 `canvas`, centred on the page\) takes the clicks above Ionic overlays/);
  assert.match(skill, /d\.style\.pointerEvents = 'none'/);
  assert.match(skill, /an `ion-select-option` is never visible, so click the `ion-select`, then the option text in the alert or popover it opens, then the alert's OK/);
  assert.match(skill, /an `ion-input` is filled through its inner `input` \(`ion-input input`\)/);
});
