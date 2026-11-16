const { guidanceText } = require('../helpers/guide_transport.cjs');
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
  const skill = guidanceText('resources/convertigo_common_skill.md');
  assert.match(skill, /the Studio's build progress widget \(a `div` holding a 100x100 `canvas`, centred on the page\) takes the clicks above Ionic overlays/);
  assert.match(skill, /d\.style\.pointerEvents = 'none'/);
  assert.match(skill, /an `ion-select-option` is never visible, so click the `ion-select`, then the option text in the alert or popover it opens, then the alert's OK/);
  assert.match(skill, /an `ion-input` is filled through its inner `input` \(`ion-input input`\)/);
});

// Review of 16/11: Mistral Large 4 passed browser_wait_for milliseconds ({time: 2500}); the Playwright MCP counts seconds and
// caps the wait at 30 s, so 71 waits of 30 s took 35 of a 95-minute run. The guides now give the unit, the maximum and an
// example where they describe browser checks, and the Vibe bootstrap repeats it.
test('browser_wait_for: seconds, 30 at most, an example, and a text rather than a delay', () => {
  const skill = guidanceText('resources/convertigo_common_skill.md');
  for (const text of [skill, read('resources/guides/ngx/viewer.md')]) {
    assert.match(text, /`browser_wait_for` counts `time` in seconds, 30 at most: `\{time: 2\}` waits 2 s, `\{time: 2000\}` waits the whole 30 s\./);
    assert.match(text, /To wait for a page, give a text it shows, `\{text: "<its title>"\}`/);
  }
  assert.match(read('js/setup_common.js'), /`browser_wait_for` \(a Playwright tool\) takes `time` in seconds, 30 at most: `\{time: 2\}`, never milliseconds such as 2000/);
});

// Review of 16/11: the notes of a generated CRM, with its demo account, were served from docs/generated on a deployed server.
test('the guides keep the project notes and every build document under _private/docs', () => {
  const skill = guidanceText('resources/convertigo_common_skill.md');
  assert.match(skill, /Every document of a build \(the notes, a specification, a plan, a report\) goes under `<project>\/_private\/docs\/`/);
  assert.match(skill, /its notes, `<project>\/_private\/docs\/PROGRESS\.md`/);
  assert.match(read('resources/convertigo_common_skill.md'), /Every build document goes under `<project>\/_private\/docs\/`/);
  assert.match(read('resources/guides/multipage/order-of-work.md'), /Keep the project notes \(`_private\/docs\/PROGRESS\.md`\) up to date/);
  const guides = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? guides(path.join(dir, e.name)) : (/\.md$/.test(e.name) ? [path.join(dir, e.name)] : []));
  for (const file of guides('resources')) {
    const text = read(file);
    // the old path is named only as the one notes are moved from
    for (const m of text.matchAll(/docs\/generated\/PROGRESS\.md/g)) {
      const around = text.substring(Math.max(0, m.index - 160), m.index + 100);
      assert.match(around, /not moved yet|until `project-notes-write` moves them|moves notes left/, file);
    }
  }
});
