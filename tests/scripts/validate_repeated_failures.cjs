const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// An agent sent the same failing requestable-execute 8 times in a row, reading the same error each time (usage tests
// 30/10, r48). The answer of a call that fails like an identical call (same tool, same arguments) of the same MCP session
// now says how many times it already failed.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const endpoint = read('_c8oProject/sequences/mcp_endpoint.yaml');

// The parts of java.util.concurrent.ConcurrentHashMap the helper uses.
class FakeMap {
  constructor() { this.map = new Map(); }
  get(key) { return this.map.has(key) ? this.map.get(key) : null; }
  put(key, value) { this.map.set(key, value); }
  remove(key) { this.map.delete(key); }
  size() { return this.map.size; }
  clear() { this.map.clear(); }
  entrySet() {
    const map = this.map;
    const keys = [...map.keys()];
    let at = -1;
    return { iterator: () => ({
      hasNext: () => at + 1 < keys.length,
      next: () => { at++; return { getValue: () => map.get(keys[at]) }; },
      remove: () => map.delete(keys[at])
    }) };
  }
}

function repeatApi() {
  const ctx = { C8O: {}, include() {} };
  vm.createContext(ctx);
  vm.runInContext(read('js/guidance_version.js'), ctx);
  vm.runInContext(read('js/mcp_repeated_failures.js'), ctx);
  return ctx.C8O.mcpRepeat;
}

function server() {
  const values = {};
  return { get: key => (key in values ? values[key] : null), set: (key, value) => { values[key] = value; } };
}

function recorder() {
  const api = repeatApi();
  const store = server();
  let now = 1_000_000;
  return {
    api,
    tick: ms => { now += ms; },
    call: (session, tool, args, signature) => api.record(store, () => new FakeMap(), session, api.callKey(tool, args), signature, now)
  };
}

const DELETE = { requestable: 'Shop.crud_delete_item', variables: { id: '999' } };
const REFUSED = '403|Reserved for the administrator';

test('the second identical failure says the call already failed, then counts', () => {
  const r = recorder();
  assert.equal(r.call('conversation:a', 'requestable-execute', DELETE, REFUSED), '');
  assert.match(r.call('conversation:a', 'requestable-execute', DELETE, REFUSED), /already failed 1 time in this session with this error: change the call or the approach/);
  assert.match(r.call('conversation:a', 'requestable-execute', DELETE, REFUSED), /already failed 2 times/);
});

test('the same arguments in another order are the same call; other arguments are another call', () => {
  const r = recorder();
  r.call('conversation:a', 'requestable-execute', DELETE, REFUSED);
  assert.match(r.call('conversation:a', 'requestable-execute', { variables: { id: '999' }, requestable: 'Shop.crud_delete_item' }, REFUSED), /1 time/);
  assert.equal(r.call('conversation:a', 'requestable-execute', { requestable: 'Shop.crud_delete_item', variables: { id: '998' } }, REFUSED), '');
  assert.equal(r.call('conversation:a', 'requestable-check', DELETE, REFUSED), '');
});

test('another error starts the count again, a success forgets the failures', () => {
  const r = recorder();
  r.call('conversation:a', 'requestable-execute', DELETE, REFUSED);
  assert.equal(r.call('conversation:a', 'requestable-execute', DELETE, '-1|Authentication required'), '');
  assert.match(r.call('conversation:a', 'requestable-execute', DELETE, '-1|Authentication required'), /1 time/);
  assert.equal(r.call('conversation:a', 'requestable-execute', DELETE, ''), '');
  assert.equal(r.call('conversation:a', 'requestable-execute', DELETE, '-1|Authentication required'), '');
});

test('sessions are apart and failures are forgotten after 15 minutes', () => {
  const r = recorder();
  r.call('conversation:a', 'requestable-execute', DELETE, REFUSED);
  assert.equal(r.call('conversation:b', 'requestable-execute', DELETE, REFUSED), '');
  r.tick(15 * 60000);
  assert.equal(r.call('conversation:a', 'requestable-execute', DELETE, REFUSED), '');
  assert.equal(r.call('', 'requestable-execute', DELETE, REFUSED), '', 'no session, nothing kept');
  assert.equal(r.call('', 'requestable-execute', DELETE, REFUSED), '');
});

test('a tool answer with status error or failed is a failure, its code and message are the signature', () => {
  const api = repeatApi();
  assert.equal(api.failureOf({ requestable: 'Shop.crud_delete_item', status: 'error', error: { code: '403', message: 'Reserved for the administrator', details: 'at 12:01' } }), REFUSED);
  assert.equal(api.failureOf({ status: 'failed', message: 'No such page' }), '|No such page');
  assert.equal(api.failureOf({ requestable: 'Shop.crud_list_items', status: 'ok', rows: [] }), '');
  assert.equal(api.failureOf([1, 2]), '');
  assert.equal(api.errorSignature({ code: 'validate', message: '', details: 'Unknown property' }), 'validate|Unknown property');
});

test('the session is the Tigo conversation, else the bearer token, never the token itself', () => {
  const api = repeatApi();
  const request = headers => ({ httpServletRequest: { getHeader: name => headers[name] ?? null } });
  assert.equal(api.sessionKey(request({ 'X-Convertigo-Conversation-Id': 'agent-1', Authorization: 'Bearer abc' })), 'conversation:agent-1');
  const byToken = api.sessionKey(request({ Authorization: 'Bearer secret-token' }));
  assert.match(byToken, /^token:/);
  assert.ok(!byToken.includes('secret-token'));
  assert.notEqual(byToken, api.sessionKey(request({ Authorization: 'Bearer other-token' })));
  assert.equal(api.sessionKey(request({})), '');
  assert.equal(api.sessionKey(null), '');
});

test('the router keys the call on the tool and the arguments it was sent', () => {
  const router = read('js/mcp_endpoint_router.js');
  assert.match(router, /include\("js\/mcp_repeated_failures\.js"\);/);
  assert.match(router, /toolArgs = C8O\.guidance\.stripToolArguments\(toolArgs\);\n(?:  \/\/[^\n]*\n)+  try \{\n    mcpCallKey = C8O\.mcpRepeat\.callKey\(toolNameRaw, toolArgs\);/);
  assert.match(endpoint, /var mcpCallKey = "";\n    var mcpRepeatNote = "";/);
});

test('both tool error answers and the tool result note the repeat before they are built', () => {
  const notes = endpoint.split('↓NoteRepeatedFailure [steps.SimpleStep-').slice(1);
  assert.equal(notes.length, 3);
  for (const note of notes.slice(0, 2)) {
    assert.match(note, /^\d+\]: \n[^\n]*\n          expression: mcpRepeatNote = C8O\.mcpRepeat\.afterCall\(context, mcpCallKey, C8O\.mcpRepeat\.errorSignature\(formatToolErrorObject\(toolError\)\)\);\n        ↓result \[/);
  }
  assert.match(notes[2], /expression: mcpRepeatNote = C8O\.mcpRepeat\.afterCall\(context, mcpCallKey, C8O\.mcpRepeat\.failureOf\(result\)\);\n        ↓result \[/);
  assert.equal(endpoint.split('formatToolErrorText(toolError, mcpRepeatNote)').length, 3);
  assert.equal(endpoint.split('formatToolErrorObject(toolError, mcpRepeatNote)').length, 3);
  assert.match(endpoint, /↓repeatedFailure \[steps\.JsonFieldStep-\d+\]: \n(?:.*\n){5}\s+- →→: repeatedFailure\n(?:.*\n){5}\s+- →→: mcpRepeatNote\n/);
});

test('the note reaches the text of an error answer and of a failed result', () => {
  const prologue = endpoint.slice(endpoint.indexOf('    var TOOL_CALL_INTERRUPTED'), endpoint.indexOf('    const Engine'));
  const errors = {};
  vm.runInNewContext(prologue + '\nthis.text = formatToolErrorText;', errors);
  const note = 'This exact call (same tool, same arguments) already failed 2 times';
  assert.equal(JSON.parse(errors.text({ code: 'validate', message: 'Bad target' }, note)).repeatedFailure, note);
  assert.equal('repeatedFailure' in JSON.parse(errors.text({ code: 'validate', message: 'Bad target' }, '')), false);

  const wrapper = /- →→: '(\(function \(value, warning, argumentWarning, operatorNote, repeatedFailure\)[^\n]*)'\n/.exec(endpoint)[1];
  const text = (result, repeat) => vm.runInNewContext(wrapper, { result, mcpGuidanceWarning: '', mcpArgumentWarning: '', mcpOperatorNote: '', mcpRepeatNote: repeat });
  const failed = { requestable: 'Shop.crud_delete_item', status: 'error', error: { code: '403', message: 'Reserved' } };
  assert.deepEqual(JSON.parse(text(failed, note)), Object.assign({ repeatedFailure: note }, failed));
  assert.deepEqual(JSON.parse(text(failed, '')), failed);
});
