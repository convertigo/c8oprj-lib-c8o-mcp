const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const sequencesDir = path.join(root, '_c8oProject/sequences');

// mcp_endpoint only copies the children of the `result` JSON object to the JSON-RPC
// response, so an MCP list cursor must be a `nextCursor` field inside `result`, and
// its value must be evaluated (JS), not emitted as literal text (PLAIN).
const LIST_SEQUENCES = fs.readdirSync(sequencesDir).filter(name => /^mcp_.*_list\.yaml$/.test(name));

function stepBlocks(lines) {
  const blocks = [];
  lines.forEach((line, index) => {
    const match = /^( *)↓(\w+) \[steps\.(\w+)-\d+\]/.exec(line);
    if (match) {
      blocks.push({ indent: match[1].length, name: match[2], type: match[3], start: index });
    }
  });
  blocks.forEach((block, i) => {
    let end = lines.length;
    for (let j = i + 1; j < blocks.length; j++) {
      if (blocks[j].indent <= block.indent) {
        end = blocks[j].start;
        break;
      }
    }
    block.end = end;
    block.text = lines.slice(block.start, end).join('\n');
  });
  return blocks;
}

function smartTypes(text, property) {
  const match = new RegExp('\\n\\s+' + property + ': \\n(?:\\s+- .*\\n)*?\\s+- ↑mode: (\\w+)\\n\\s+- →→: (.*)').exec(text);
  return match ? { mode: match[1], text: match[2].trim() } : null;
}

test('list sequences exist', () => {
  assert.ok(LIST_SEQUENCES.includes('mcp_resources_list.yaml'));
  assert.ok(LIST_SEQUENCES.includes('mcp_tools_list.yaml'));
});

for (const file of LIST_SEQUENCES) {
  test(file + ' emits nextCursor inside result as an evaluated value', () => {
    const lines = fs.readFileSync(path.join(sequencesDir, file), 'utf8').split('\n');
    const blocks = stepBlocks(lines);
    const cursorFields = blocks.filter(block => block.type === 'JsonFieldStep' && (smartTypes(block.text, 'key') || {}).text === 'nextCursor');
    for (const field of cursorFields) {
      const value = smartTypes(field.text, 'value');
      assert.equal(value && value.mode, 'JS', file + ': nextCursor value must be JS, got ' + JSON.stringify(value));
      const owner = blocks.filter(block => block.indent === 0 && block.start < field.start && block.end > field.start)[0];
      assert.ok(owner, file + ': nextCursor must be nested in a top-level step');
      assert.equal(owner.type, 'JsonObjectStep', file + ': nextCursor must be inside the result object');
      assert.equal((smartTypes(owner.text, 'key') || {}).text, 'result', file + ': nextCursor must be inside `result`, not ' + owner.name);
    }
    const paged = lines.some(line => /NextCursor\s*=|_nextCursor|\bcursor\b/.test(line));
    if (paged && file !== 'mcp_prompts_list.yaml') {
      assert.ok(cursorFields.length > 0, file + ' reads a cursor but never emits nextCursor');
    }
  });
}
