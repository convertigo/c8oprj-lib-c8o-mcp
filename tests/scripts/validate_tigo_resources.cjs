const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../../js/tools_tigo_resources.js'),'utf8');
function fixture(auth,request={}){
 const seen=[];
 function File(){this.getCanonicalFile=()=>this;this.toPath=()=>({relativize:()=> 'relative/resource.js'});}
 const sandbox={include(){},Packages:{com:{twinsoft:{convertigo:{engine:{Engine:{theApp:{databaseObjectsManager:{getOriginalProjectByName:()=>({getDirFile:()=>new File()}),existsProject:n=>String(n)!=='NoSuchProject'}}}}}}}},java:{io:{File}},context:{project:{getDirFile:()=>new File()}},project:'Demo',action:'list',kind:'prompt',key:'',revision:'',input:{},language:'en',...request};
 sandbox.C8O={mcpAuth:{authenticateRequest:()=>auth},util:{parseObjectInput:v=>v},tigoResources:{javaHost:(_ctx,projectOnly)=>{assert.equal(projectOnly,true);return {};},create:()=>({execute:args=>{seen.push(args);return {ok:true,items:[{scope:'project',project:'Demo'},{scope:'project',project:'Other'},{scope:'workspace'}],errors:[],favorites:['private'],selection:{},missingSelections:[],secrets:['PRIVATE'],projects:[],canManageMcp:true};}})}};
 return {run:()=>vm.runInNewContext(source,sandbox),sandbox,seen};
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
 assert.throws(()=>fixture(auth,{key:'workspace::prompt:private'}).run(),/requested project/);
 assert.throws(()=>fixture(auth,{key:'project:Other:prompt:shared'}).run(),/requested project/);
});
