// Run: node --test tests/scripts/validate_subagent_stop.cjs
// A sub-agent started from a conversation stops with it (measured run, 17/11): the conversation was cancelled at its time
// cap, its constructor went on building for 6 more minutes and its project lock refused project-reload until the runner
// was killed by hand. C8O.tigoStopConversationSubagents (js/subagents.js, the same block in the Agent Bridge) stops the runs
// of a conversation; the runner stops its own session on SIGTERM and reports why; a lock whose runner is gone is dropped.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'js/subagents.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

// A Java layer over real files in a temporary workspace, with simulated processes.
function javaLayer(workspace, processes) {
  class JFile {
    constructor(parent, child) {
      this.p = child === undefined ? String(parent) : path.join(parent instanceof JFile ? parent.p : String(parent), String(child));
    }
    getCanonicalFile() { return new JFile(fs.existsSync(this.p) ? fs.realpathSync(this.p) : path.resolve(this.p)); }
    getPath() { return this.p; }
    getName() { return path.basename(this.p); }
    getParent() { return path.dirname(this.p); }
    isDirectory() { return fs.existsSync(this.p) && fs.statSync(this.p).isDirectory(); }
    isFile() { return fs.existsSync(this.p) && fs.statSync(this.p).isFile(); }
    listFiles() { return this.isDirectory() ? fs.readdirSync(this.p).map(n => new JFile(this, n)) : null; }
    toPath() { return this.p; }
    delete() { try { fs.unlinkSync(this.p); return true; } catch (e) { return false; } }
  }
  const handle = pid => {
    const proc = processes[pid];
    return {
      isPresent: () => !!proc,
      get: () => ({
        isAlive: () => proc.alive,
        descendants: () => ({ toArray: () => proc.children.map(c => ({ isAlive: () => c.alive, destroyForcibly: () => { c.alive = false; c.killed = 'forced'; } })) }),
        destroy: () => { proc.signals.push('TERM'); if (proc.onTerm) proc.onTerm(); },
        destroyForcibly: () => { proc.signals.push('KILL'); proc.alive = false; },
      }),
    };
  };
  function JString(value) { this.s = Buffer.isBuffer(value) ? value.toString('utf8') : String(value); }
  JString.prototype.toString = function () { return this.s; };
  JString.prototype.getBytes = function () { return Buffer.from(this.s, 'utf8'); };
  let clock = 1000;
  return {
    java: {
      io: { File: JFile },
      nio: { file: { Files: {
        readAllBytes: p => fs.readFileSync(p),
        write: (p, bytes) => fs.writeFileSync(p, bytes),
      } } },
      lang: {
        String: JString,
        System: { currentTimeMillis: () => (clock += 500) },
        Thread: { sleep: () => {} },
        ProcessHandle: { of: pid => handle(pid) },
      },
    },
    com: { twinsoft: { convertigo: { engine: { Engine: { USER_WORKSPACE_PATH: workspace } } } } },
  };
}

function load(workspace, processes) {
  const Packages = javaLayer(workspace, processes);
  const sandbox = { Packages, include() {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'subagents.js' });
  return sandbox.C8O;
}

function makeRun(workspace, runId, meta, lockKey) {
  const dir = path.join(workspace, 'subagents', runId);
  fs.mkdirSync(dir, { recursive: true });
  const lockFile = path.join(workspace, 'subagents', '.lock-' + lockKey);
  fs.writeFileSync(lockFile, JSON.stringify({ runId, expiresAt: 99999999 }));
  fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(Object.assign({ runId, lockFile }, meta)));
  return { dir, lockFile };
}

test('the runs of a stopped conversation are stopped, with the reason, their children and their lock; others are kept', () => {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'c8o-stop-')));
  const vibe = { alive: true };
  const processes = {
    101: { alive: true, signals: [], children: [vibe] },                       // ignores SIGTERM: stopped hard
    102: { alive: true, signals: [], children: [], onTerm() { this.alive = false; } }, // another conversation
    103: { alive: false, signals: [], children: [] },                          // already ended
  };
  processes[102].onTerm = () => { processes[102].alive = false; };
  const mine = makeRun(workspace, 'build-20261117-145304-6d00596a', { conversationId: 'agent-c9431926', pid: 101 }, 'project_SalesApp');
  const other = makeRun(workspace, 'build-20261117-150000-0123abcd', { conversationId: 'agent-other', pid: 102 }, 'project_Other');
  makeRun(workspace, 'verify-20261117-140000-89abcdef', { conversationId: 'agent-c9431926', pid: 103 }, 'browser_9222');
  const C8O = load(workspace, processes);
  const stopped = plain(C8O.tigoStopConversationSubagents('agent-c9431926', 'its conversation was cancelled'));
  assert.deepEqual(stopped, ['build-20261117-145304-6d00596a']);
  assert.deepEqual(processes[101].signals, ['TERM', 'KILL'], 'SIGTERM first, then a hard stop after the grace');
  assert.equal(vibe.alive, false, 'the session the runner started is stopped too');
  assert.equal(fs.existsSync(mine.lockFile), false, 'its project lock is released');
  assert.equal(JSON.parse(fs.readFileSync(path.join(mine.dir, 'stop.json'), 'utf8')).reason, 'its conversation was cancelled');
  assert.deepEqual(processes[102].signals, [], 'a run of another conversation goes on');
  assert.equal(fs.existsSync(other.lockFile), true);
  assert.deepEqual(plain(C8O.tigoStopConversationSubagents('', 'x')), [], 'no conversation, nothing stopped');
  assert.deepEqual(plain(C8O.tigoStopConversationSubagents('../etc', 'x')), []);
});

test('a lock that names another run is never removed by a stop', () => {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'c8o-stop-')));
  const processes = { 201: { alive: true, signals: [], children: [] } };
  processes[201].onTerm = () => { processes[201].alive = false; };
  const run = makeRun(workspace, 'build-20261117-160000-aaaabbbb', { conversationId: 'agent-1', pid: 201 }, 'project_App');
  fs.writeFileSync(run.lockFile, JSON.stringify({ runId: 'build-20261117-161000-ccccdddd', expiresAt: 99999999 }));
  const C8O = load(workspace, processes);
  assert.deepEqual(plain(C8O.tigoStopConversationSubagents('agent-1', 'stop')), ['build-20261117-160000-aaaabbbb']);
  assert.deepEqual(processes[201].signals, ['TERM'], 'a runner that ends on SIGTERM is not stopped hard');
  assert.equal(fs.existsSync(run.lockFile), true, 'the lock of the next run stays');
});

test('a stopped run reports why, and a lock whose runner is gone is dropped', () => {
  const C8O = load(os.tmpdir(), {});
  const sa = C8O.subagents;
  const run = { exists: true, alive: false, profile: 'constructor', stopReason: 'its conversation was cancelled',
    output: JSON.stringify({ ok: false, stopped: true, error: 'stopped: its conversation was cancelled' }) };
  const host = { readRun: () => run, now: () => 1000, sleep() {}, workspaceRoot: () => '/ws' };
  assert.throws(() => sa.collect('build-20261117-145304-6d00596a', 5, host, {}, 1000),
    /^Error: The constructor sub-agent was stopped: its conversation was cancelled\. It writes nothing more and its project lock is released/);
  const dropped = [];
  const lockHost = { readLock: () => ({ runId: 'build-20261117-145304-6d00596a', expiresAt: 5000 }), readRun: () => ({ exists: true, alive: false }),
    now: () => 1000, dropLock: (key, runId) => dropped.push([key, runId]) };
  assert.equal(sa.projectWriteBlocked('App', '', lockHost), null);
  assert.deepEqual(dropped, [['project:App', 'build-20261117-145304-6d00596a']]);
});

test('the runner stops its session on SIGTERM and writes one final line saying why', () => {
  const runner = require(path.join(root, 'node/vibe_subagent_runner.cjs'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c8o-runner-'));
  fs.writeFileSync(path.join(dir, 'stop.json'), JSON.stringify({ reason: 'its conversation was cancelled' }));
  const killed = [];
  runner.running.child = { kill: signal => killed.push(signal) };
  runner.running.outDir = dir;
  const outputs = [];
  runner.onStop('/tmp/lock', (output, lockFile) => outputs.push([output, lockFile]));
  assert.deepEqual(killed, ['SIGTERM']);
  assert.deepEqual(outputs, [[{ ok: false, stopped: true, error: 'stopped: its conversation was cancelled' }, '/tmp/lock']]);
  const runnerSource = fs.readFileSync(path.join(root, 'node/vibe_subagent_runner.cjs'), 'utf8');
  assert.match(runnerSource, /process\.once\("SIGTERM", function \(\) \{ onStop\(str\(input\.lockFile\)\); \}\);/);
  assert.match(runnerSource, /if \(running\.finished\) \{\s*return;\s*\}/);
});
