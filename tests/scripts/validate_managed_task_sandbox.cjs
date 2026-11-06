const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const policy = require('../../node/managed_task_sandbox.cjs');
const runner = require('../../node/vibe_subagent_runner.cjs');
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'managed-policy-'));
  const config = {vibeBin: '/managed/.venv/bin/vibe', outDir: path.join(dir, 'out'), workdir: path.join(dir, 'project'), server: 'Convertigo'};
  const home = path.join(config.outDir, 'home');
  fs.mkdirSync(config.workdir, {recursive: true});
  return {dir, config, home};
}
for (const platform of ['darwin', 'win32']) test('refuses a task on ' + platform + ' before any executable runs', () => {
  const {dir, config, home} = fixture();
  try { assert.throws(() => policy.prepare(config, home, {platform, spawnSync: () => assert.fail('must not spawn')}), /require Landlock/); }
  finally { fs.rmSync(dir, {recursive:true, force:true}); }
});
for (const probe of [{status:0, stdout:'0\n'}, {status:1, stdout:'1\n'}, {error:new Error('missing')}, {status:0, stdout:'invalid'}]) test('refuses an unusable helper ' + JSON.stringify(probe), () => {
  const {dir, config, home} = fixture();
  try { assert.throws(() => policy.prepare(config, home, {platform:'linux', spawnSync: () => probe}), /usable Landlock/); }
  finally { fs.rmSync(dir, {recursive:true, force:true}); }
});
test('every execution, including version detection, is wrapped; only the task and project are writable', () => {
  const {dir, config, home} = fixture();
  const seen=[];
  try {
    const plan = policy.prepare(config, home, {platform:'linux', env:{PYTHONPATH:'/unmanaged'}, spawnSync:(bin,args) => {seen.push({bin,args});return {status:0,stdout:args.includes('--probe')?'1\n':'3.1.0\n'};}});
    assert.equal(plan.bin, '/usr/local/bin/c8o-agent-sandbox');
    assert.deepEqual(plan.prefix.filter((v,i,a)=>a[i-1]==='--rw'), [config.outDir, config.workdir, '/dev/null']);
    assert.deepEqual(plan.prefix.slice(-2), ['--', config.vibeBin]);
    assert.equal(seen[1].bin, plan.bin);
    assert.deepEqual(seen[1].args, plan.prefix.concat(['--version']));
    assert.equal(plan.env.HOME,home);
    assert.equal(plan.env.PYTHONPATH,undefined);
    assert.equal(plan.env.VIBE_ENABLE_SUBAGENTS,'false');
    assert.equal(plan.env.VIBE_ENABLE_BACKGROUND_PROCESSES,'false');
    assert.deepEqual(JSON.parse(plan.env.VIBE_ENABLED_TOOLS),policy.allowedTools(config));
    assert.ok(!plan.prefix.includes(path.dirname(config.outDir)));
    assert.ok(!plan.prefix.includes('/etc'));
    assert.ok(!plan.prefix.includes('/etc/hosts'));
    assert.ok(!plan.prefix.includes('/proc/1'));
    assert.ok(!plan.prefix.includes('/usr/local/tomcat'));
  } finally {fs.rmSync(dir, {recursive:true,force:true});}
});
test('refuses another runtime version', () => {
  const {dir,config,home}=fixture();
  try {assert.throws(()=>policy.prepare(config,home,{platform:'linux',spawnSync:(_bin,args)=>({status:0,stdout:args.includes('--probe')?'1\n':'3.0.3\n'})}),/runtime version/);}
  finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('profile whitelist contains no shell, web, process or nested agent tool; unknown servers are refused', () => {
  assert.deepEqual(policy.allowedTools({server:'Convertigo'}),['Convertigo_*','todo','skill','read_file','write_file','edit']);
  assert.deepEqual(policy.allowedTools({server:'convertigo-flow',pack:'flow'}),['convertigo-flow_*','todo','skill']);
  assert.throws(()=>policy.allowedTools({server:'*'}),/Unsupported/);
  const text=runner.childConfig('enabled_tools = ["*"]\nenable_auto_approve = false\nbypass_tool_permissions = true\nenable_background_processes = true\nenable_subagents = true\n[[models]]\nname="x"', {model:'x',server:'Convertigo'});
  assert.equal((text.match(/^enabled_tools =/gm)||[]).length,1);
  assert.match(text,/enable_background_processes = false/);
  assert.match(text,/enable_auto_approve = true/);
  assert.doesNotMatch(text,/enable_auto_approve = false|bypass_tool_permissions = true/);
  assert.doesNotMatch(text,/enabled_tools = \["\*"\]|enable_subagents = true/);
});
test('headless launch only uses the prepared wrapper and a nonempty explicit tool list', () => {
  const source = fs.readFileSync(path.resolve(__dirname,'../../node/vibe_subagent_runner.cjs'),'utf8');
  assert.match(source,/var launch = taskSandbox.prepare\(config, home, deps\)/);
  assert.match(source,/spawn\)\(launch.bin, launch.prefix.concat\(args\)/);
  assert.match(source,/taskSandbox.policyLines\(config\)/);
  assert.match(source,/args.push\("--enabled-tools", tool\)/);
  assert.match(source,/"--agent", "accept-edits"/);
  assert.equal((source.match(/childProcess.spawn\)/g)||[]).length,1);
});
test('an external Python grants its executable and libraries, never its entire installation prefix', () => {
  const {dir, config, home}=fixture();
  const prefix=path.join(dir,'python-prefix');
  const runtime=path.join(dir,'runtime','.venv');
  fs.mkdirSync(path.join(prefix,'bin'),{recursive:true});
  fs.mkdirSync(path.join(prefix,'lib','python3.14'),{recursive:true});
  fs.mkdirSync(path.join(runtime,'bin'),{recursive:true});
  fs.writeFileSync(path.join(prefix,'bin','python3'),'');
  fs.symlinkSync(path.join(prefix,'bin','python3'),path.join(runtime,'bin','python3'));
  config.vibeBin=path.join(runtime,'bin','vibe');
  try {
    const plan=policy.prepare(config,home,{platform:'linux',spawnSync:(_bin,args)=>({status:0,stdout:args.includes('--probe')?'1\n':'3.1.0\n'})});
    const ro=plan.prefix.filter((v,i,a)=>a[i-1]==='--ro');
    const canonicalPrefix=fs.realpathSync(prefix);
    assert.ok(ro.includes(path.join(canonicalPrefix,'bin','python3')));
    assert.ok(ro.includes(path.join(canonicalPrefix,'lib','python3.14')));
    assert.ok(!ro.includes(prefix));
    assert.ok(!ro.includes(path.join(prefix,'lib')));
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
