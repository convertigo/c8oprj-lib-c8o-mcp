const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../js/subagents.js'), 'utf8');

function setup(modern = true, mode = 'auto', method = 'ntlm') {
  let helperCalls = 0, relayCalls = 0;
  const values = new Map([['HTTPS_PROXY', 'http://stale.invalid:1']]);
  const environment = {put: (k,v) => values.set(k,v), get: k => values.get(k)};
  const manager = {isEnabled: () => mode !== 'off', proxyMode:mode, proxyMethod:method,
    getProxyServer: () => 'proxy.invalid', getProxyPort: () => 3128,
    getProxyUser: () => 'fixture', getProxyPassword: () => 'fixture-only', getBypassDomains: () => ['intranet.invalid']};
  const engine = {Engine:{theApp:{proxyManager:manager}}, util:{ProcessUtils:{configureProxyEnvironment(env) {
    helperCalls++;
    if (mode !== 'off') {
      for (const key of ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy']) env.put(key,'http://127.0.0.1:19080');
      env.put('NO_PROXY','intranet.invalid,localhost,127.0.0.1,::1'); env.put('no_proxy',env.get('NO_PROXY'));
      env.put('NODE_USE_ENV_PROXY','1');
    }
  }}}, proxy:{ntlm:{NtlmConnectProxyBridge:{getLocalProxyUrl() { relayCalls++; return 'http://127.0.0.1:19080'; }}}}};
  const klass = {forName(name) {
    assert.equal(name,'com.twinsoft.convertigo.engine.util.ProcessUtils');
    return {getMethods: () => modern ? [{getName: () => 'configureProxyEnvironment',getParameterTypes: () => [{getName: () => 'java.util.Map'}]}] : []};
  }};
  const sandbox = {C8O:{}, Packages:{java:{lang:{Class:klass}},com:{twinsoft:{convertigo:{engine}}}}};
  vm.runInNewContext(source,sandbox);
  return {api:sandbox.C8O.subagents, environment, values, engine, sandbox, counts: () => ({helperCalls,relayCalls})};
}

test('modern manual and PAC runners use the one engine relay after caller overrides', () => {
  for (const mode of ['manual','auto']) for (const method of ['anonymous','basic','ntlm']) {
    const s=setup(true,mode,method);
    assert.equal(s.api.engineProcessProxyAvailable(),true);
    assert.equal(s.counts().helperCalls,0);
    s.api.configureProcessProxy(s.environment);
    assert.equal(s.counts().helperCalls,1); assert.equal(s.counts().relayCalls,0);
    for (const key of ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy','PIP_PROXY','npm_config_proxy','NPM_CONFIG_HTTPS_PROXY']) assert.equal(s.values.get(key),'http://127.0.0.1:19080');
    assert.equal(s.values.get('NODE_USE_ENV_PROXY'),'1');
    for (const host of ['localhost','127.0.0.1','::1']) assert.ok(s.values.get('NO_PROXY').split(',').includes(host));
  }
});

test('engine off preserves its environment contract; relay failures do not use the legacy path', () => {
  const s=setup(true,'off'); s.api.configureProcessProxy(s.environment);
  assert.equal(s.values.get('HTTPS_PROXY'),'http://stale.invalid:1');
  const f=setup(); f.engine.util.ProcessUtils.configureProxyEnvironment=()=>{throw Error('relay unavailable');};
  assert.throws(()=>f.api.configureProcessProxy(f.environment),/relay unavailable/);
  assert.equal(f.counts().relayCalls,0);
});

test('older engines keep manual anonymous, Basic and NTLM; PAC refuses without resolving the old relay', () => {
  for (const method of ['anonymous','basic','ntlm']) {
    const s=setup(false,'manual',method); s.api.configureProcessProxy(s.environment);
    assert.equal(s.values.get('HTTPS_PROXY'),method==='ntlm'?'http://127.0.0.1:19080':method==='basic'?'http://fixture:fixture-only@proxy.invalid:3128':'http://proxy.invalid:3128');
    assert.equal(s.counts().relayCalls,method==='ntlm'?1:0);
  }
  const s=setup(false); assert.throws(()=>s.api.configureProcessProxy(s.environment),/PAC proxy support.*updated Convertigo engine/);
  assert.equal(s.counts().relayCalls,0);
});

test('host.start applies the helper after copied env and refuses before process start on PAC failure', () => {
  const s=setup(false); let started=false;
  class File {getCanonicalFile(){return this;}}
  s.engine.Engine.USER_WORKSPACE_PATH='/fixture';
  s.sandbox.java={io:{File},nio:{file:{Files:{}}},util:{ArrayList:class {add(){}}},lang:{ProcessBuilder:class {
    environment(){return s.environment;} directory(){} redirectOutput(){} redirectError(){} start(){started=true;}
  }}};
  const host=s.api.javaHost();
  assert.throws(()=>host.start(['node'],{HTTPS_PROXY:'http://caller.invalid:2'},'', '/fixture',{}),/updated Convertigo engine/);
  assert.equal(s.values.get('HTTPS_PROXY'),'http://caller.invalid:2');
  assert.equal(started,false);
  const start=source.slice(source.indexOf('      start: function (command, env,'),source.indexOf('      readRun: function (runId)',source.indexOf('      start: function (command, env,')));
  assert.ok(start.indexOf('environment.put(')<start.indexOf('api.configureProcessProxy(environment)'));
  assert.ok(start.indexOf('api.configureProcessProxy(environment)')<start.indexOf('builder.start()'));
});

test('host.start injects the modern relay last and never starts after a helper failure', () => {
  for (const fail of [false,true]) {
    const s=setup(); let reachedStart=false;
    class File {getCanonicalFile(){return this;}}
    s.engine.Engine.USER_WORKSPACE_PATH='/fixture';
    s.sandbox.java={io:{File},nio:{file:{Files:{}}},util:{ArrayList:class {add(){}}},lang:{ProcessBuilder:class {
      environment(){return s.environment;} directory(){} redirectOutput(){} redirectError(){}
      start(){reachedStart=true; assert.equal(s.values.get('HTTPS_PROXY'),'http://127.0.0.1:19080'); throw Error('fixture launch boundary');}
    }}};
    if (fail) s.engine.util.ProcessUtils.configureProxyEnvironment=()=>{throw Error('relay unavailable');};
    assert.throws(()=>s.api.javaHost().start(['node'],{HTTPS_PROXY:'http://caller.invalid:2'},'', '/fixture',{}),fail?/relay unavailable/:/fixture launch boundary/);
    assert.equal(reachedStart,!fail);
  }
});
