const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// SEQ-WRITE-UNCHECKED was right on the kit (usage tests 30/10): deleting a client its interventions still reference
// answered status ok, the database's refusal as its message, and the page went on as if deleted. The update, delete and
// create sequences now read the call's document and end with an error when it holds one, a foreign key refusal named
// in the words of the app. Checked live on a generated app: the delete answers "Cet enregistrement est encore utilisé
// par interventions.", a free delete and an update still answer ok, the lint reports no unchecked write.

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'crud_backend.js'), 'utf8');

test('a mutation sequence reads its call and stops on the error it holds, right after the call', () => {
  assert.match(src, /var read = ctx\.ensureChild\(sequence, "steps\.JsonSourceStep", "WriteResult", result\);\s*ctx\.applyUpdates\(read, \{\s*sourceDefinition: \[ctx\.priorityOf\(txStep\), "\.\/document"\],\s*variableName: "writeResult"/);
  assert.match(src, /condition: "writeResult != null && writeResult\.document != null && writeResult\.document\.error != null"/);
  assert.match(src, /ctx\.ensureChild\(check, "steps\.XMLErrorStep", "WriteError", result\);/);
  assert.match(src, /ctx\.ensureChild\(check, "steps\.ReturnStep", "StopAfterFailedWrite", result\);/);
  assert.match(src, /moveBefore\(sequence, failureSteps\[f\], message\);/);
  assert.match(src, /\["Call" \+ ctx\.ucfirst\(sequence\.getName\(\)\), "WriteResult", "IfWriteFailed", "Message"\]/);
});

test('a foreign key refusal names the table that still uses the row, otherwise the database message stays', () => {
  const start = src.indexOf('var stillUsed = french ?');
  const block = src.slice(start, src.indexOf('}, result);', start));
  for (const [french, words] of [[true, 'Cet enregistrement est encore utilisé par '], [false, 'This record is still used by ']]) {
    const stillUsed = words;
    // The kit builds the expression text the same way: rebuild it from the source and run it.
    const valueMatch = /value: ("\(function \(e\)[\s\S]*?\(writeResult\.document\.error\)")/.exec(block);
    assert.ok(valueMatch, 'expression found');
    const text = new Function('JSON', 'stillUsed', 'french', 'return ' + valueMatch[1])(JSON, stillUsed, french);
    const run = e => new Function('writeResult', 'return ' + text)({ document: { error: e } });
    assert.equal(run({ message: 'integrity constraint violation: foreign key no action ; SYS_FK_10114 table: INTERVENTIONS' }), words + 'interventions.');
    assert.equal(run({ message: 'update or delete on table "clients" violates foreign key constraint "fk_c" on table "interventions"' }), words + 'interventions.');
    assert.equal(run({ message: 'data exception: string data, right truncation' }), 'data exception: string data, right truncation');
  }
});
