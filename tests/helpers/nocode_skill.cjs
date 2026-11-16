// The No Code skill: resources/convertigo-nocode/SKILL.md keeps the rules of every turn, each `> Drawer` line of it
// names a drawer file of the same folder and stands where that drawer's text belongs. A drawer is its title, when to
// read it and the way back to SKILL.md, then `---` and its text.
// skillText() puts every drawer back in place and drops the `## Drawers` section of SKILL.md: the single-file skill,
// for the content tests that follow moved prose.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const folder = path.join(root, 'resources/convertigo-nocode');
const DRAWER_LINE = /^> Drawer `([a-z0-9][a-z0-9-]*\.md)` — ([^:]+): (read it [^\n]+)\.$/;
const readSkillFile = name => fs.readFileSync(path.join(folder, name), 'utf8');

function drawerLines(summary = readSkillFile('SKILL.md')) {
  return summary.split('\n').map(line => DRAWER_LINE.exec(line)).filter(Boolean)
    .map(([line, file, title, when]) => ({ line, file, title, when }));
}

function drawerBody(text) {
  const at = text.indexOf('\n---\n\n');
  if (at < 0) throw new Error('A drawer has no --- line after its header');
  return text.slice(at + 6);
}

function skillText(read = readSkillFile) {
  const lines = read('SKILL.md').split('\n');
  const start = lines.indexOf('## Drawers');
  if (start < 0) throw new Error('SKILL.md has no ## Drawers section');
  let end = start + 1;
  while (end < lines.length && !/^## /.test(lines[end])) end++;
  lines.splice(start, end - start);
  return lines.map(line => {
    const match = DRAWER_LINE.exec(line);
    return match ? drawerBody(read(match[1])).replace(/\n$/, '') : line;
  }).join('\n');
}

module.exports = { folder, DRAWER_LINE, readSkillFile, drawerLines, drawerBody, skillText };
