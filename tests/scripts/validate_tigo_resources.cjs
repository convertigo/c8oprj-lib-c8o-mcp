const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../../js/tools_tigo_resources.js'),'utf8');
function fixture(auth,request={},studio=false,desktop){
 const seen=[], hosts=[];
 function File(){this.getCanonicalFile=()=>this;this.toPath=()=>({relativize:()=> 'relative/resource.js'});}
 const sandbox={include(){},Packages:{com:{twinsoft:{convertigo:{engine:{Engine:{isStudioMode:()=>studio,theApp:{databaseObjectsManager:{getOriginalProjectByName:()=>({getDirFile:()=>new File()}),existsProject:n=>String(n)!=='NoSuchProject'}}}}}}}},java:{io:{File}},context:{project:{getDirFile:()=>new File()}},project:'Demo',action:'list',kind:'prompt',key:'',revision:'',input:{},language:'en',...request};
 sandbox.C8O={mcpAuth:{authenticateRequest:()=>auth},util:{parseObjectInput:v=>v},tigoResources:{javaHost:(_ctx,projectOnly)=>{assert.equal(projectOnly,true);return {};},create:host=>{hosts.push(host);return ({execute:args=>{seen.push(args);return {ok:true,items:[{scope:'project',project:'Demo'},{scope:'project',project:'Other'},{scope:'workspace'}],errors:[],favorites:['private'],selection:{},missingSelections:[],secrets:['PRIVATE'],projects:[],canManageMcp:true};}});}}};
 if(typeof desktop==='boolean') sandbox.Packages.com.twinsoft.convertigo.engine.Engine.isDesktopStudio=()=>desktop;
 return {run:()=>vm.runInNewContext(source,sandbox),sandbox,seen,hosts};
}
test('only a full authenticated MCP bearer can access project resource operations',()=>{
 for(const auth of [{authenticated:false},{authenticated:true,kind:'nocode',scope:'mcp:full'},{authenticated:true,kind:'session',scope:''},{authenticated:true,kind:'token',scope:'nocode'}])assert.throws(()=>fixture(auth).run(),/full Convertigo MCP bearer/);
});
test('project library listing strips personal metadata and unrelated projects',()=>{
 const f=fixture({authenticated:true,kind:'token',scope:'mcp:full'});f.run();assert.equal(f.sandbox.response.items.length,1);
 for(const key of ['favorites','selection','missingSelections','secrets','projects','canManageMcp'])assert.equal(key in f.sandbox.response,false);
 assert.equal(f.seen[0].scope,'project');
});
test('the MCP cannot activate connections, touch built-ins or target another project key',()=>{
 const auth={authenticated:true,kind:'token',scope:'mcp:full'};
 for(const action of ['select','secret','favorites'])assert.throws(()=>fixture(auth,{action}).run(),/Unsupported project/);
 assert.throws(()=>fixture(auth,{project:'lib_ConvertigoAssistant'}).run(),/editable target/);
 assert.throws(()=>fixture(auth,{key:'workspace::prompt:private'}).run(),/requested project|local Studio owner/);
 assert.throws(()=>fixture(auth,{key:'project:Other:prompt:shared'}).run(),/requested project|local Studio owner/);
});
test('only local Studio authors can select their personal scope; confirmation is never an agent action',()=>{
 const auth={authenticated:true,kind:'managed',scope:'mcp:full'};
 assert.throws(()=>fixture(auth,{input:{scope:'workspace'}},false).run(),/local Studio owner/);
 const f=fixture(auth,{input:{scope:'workspace'}},true);f.run();assert.equal(f.seen[0].scope,'workspace');
 for(const action of ['confirmProposal','rejectProposal','secret','select'])assert.throws(()=>fixture(auth,{action,input:{scope:'workspace',confirmed:true}},true).run(),/Unsupported project/);
});
test('MCP connection duplication must go through the proposal path',()=>{
 assert.throws(()=>fixture({authenticated:true,kind:'managed',scope:'mcp:full'},{action:'duplicate',kind:'mcp'},true).run(),/human review/);
 assert.throws(()=>fixture({authenticated:true,kind:'managed',scope:'mcp:full'},{action:'duplicate',kind:'prompt',key:'workspace::mcp:existing'},true).run(),/human review/);
});

test('Studio owner and agent capability are bound by the host, not supplied arguments',()=>{
 const f=fixture({authenticated:true,kind:'managed',scope:'mcp:full'},{action:'save',kind:'mcp',input:{scope:'workspace',agentInitiated:false,confirmed:true,user:'other'}},true);
 f.run();assert.equal(f.hosts[0].agentInitiated,true);assert.equal(f.hosts[0].identity().key,'studio');assert.equal(f.hosts[0].identity().studio,true);
 assert.equal(f.seen[0].input.scope,undefined);
});

test('desktop resource proposals preserve the local owner without granting a server personal scope',()=>{
 const auth={authenticated:true,kind:'managed',scope:'mcp:full'};
 const f=fixture(auth,{input:{scope:'workspace'}},false,true);f.run();
 assert.equal(f.seen[0].scope,'workspace');assert.equal(f.hosts[0].identity().owner,'studio');
 for(const desktop of [false,undefined])assert.throws(()=>fixture(auth,{input:{scope:'workspace'}},false,desktop).run(),/local Studio owner/);
 assert.throws(()=>fixture({...auth,kind:'nocode'},{input:{scope:'workspace'}},false,true).run(),/full Convertigo MCP bearer/);
});
