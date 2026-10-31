const {test}=require('node:test'),assert=require('node:assert/strict');
const agent=require(process.env.BROWSER_VERIFY_AGENT_PATH||'../../node/browser_verify_agent.cjs');
const check={id:'C1',check:'Two loans created',status:'passed',evidence:'Two loans created',observedText:'2 loans',evidenceRefs:['A2'],actionRefs:['A1','A2']};
const config={checks:['Two loans created']};
const trace=[{id:'A1',tool:'click',failed:false,result:'1 loan'}, {id:'A2',tool:'click',failed:false,result:'2 loans'}];
test('a plausible passed story cannot substitute for journal evidence',()=>{
 const out=agent.normalizeReport({verdict:'passed',checks:[check]},config,[],{},[]);
 assert.equal(out.verdict,'partial');assert.match(out.checks[0].evidence,/journal/);
});
test('observations, claimed actions and actual Flow errors constrain every passed check',()=>{
 assert.equal(agent.normalizeReport({verdict:'passed',checks:[check]},config,[],{},trace).verdict,'passed');
 for(const change of [{actionRefs:['A9']},{observedText:'invented result'},{evidenceRefs:['A9']}])
  assert.equal(agent.normalizeReport({verdict:'passed',checks:[{...check,...change}]},config,[],{},trace).verdict,'partial');
 const network=[{id:'N1',action:'A2',failed:true,status:200,errorCode:'LOAN_LIMIT_REACHED',message:'Limit reached'}];
 assert.equal(agent.normalizeReport({verdict:'passed',checks:[check]},config,[],{},trace,network).verdict,'partial');
 const expected={...check,check:'Third request refused',evidence:'Limit reached',observedText:'Limit reached',evidenceRefs:['N1'],actionRefs:['A2'],expectedErrorCode:'LOAN_LIMIT_REACHED'};
 assert.equal(agent.normalizeReport({verdict:'passed',checks:[expected]},{checks:['Third request refused']},[],{},trace,network).verdict,'passed');
});
test('row-scoped targets resolve inside the named row and never as a global button',()=>{
 const calls=[];const child={nth:n=>{calls.push(['nth',n]);return child;}};
 const row={getByRole:(role,options)=>{calls.push(['child',role,options]);return child;}};
 const page={getByRole:(role,options)=>{calls.push(['row',role,options]);return row;},locator:()=>{throw Error('compound target must not be CSS');}};
 const found=agent.locate(page,'row "Book Seven" button "Borrow"',0);
 assert.equal(found.locator,child);assert.equal(calls[0][1],'row');assert.equal(calls[1][1],'button');assert.equal(calls[1][2].exact,true);
});

test('a Flow error in HTTP 200 is journaled with its originating action and invalidates a success story',async()=>{
 const fs=require('node:fs'),path=require('node:path'),outDir=path.resolve(__dirname,'../../.night-r08-network');fs.mkdirSync(outDir,{recursive:true});
 const handlers={},url='http://localhost:28080/convertigo/gw/test/';let turn=0;
 const locator={count:async()=>1,filter:()=>locator,first:()=>locator,nth:()=>locator,
  click:async()=>{const request={};handlers.request(request);handlers.response({request:()=>request,url:()=> 'http://localhost:28080/convertigo/projects/App/.json',status:()=>200,json:async()=>({error:{code:'LOAN_LIMIT_REACHED',message:'Limit reached'}})});},ariaSnapshot:async()=> '1 loan'};
 const page={on:(name,fn)=>{handlers[name]=fn;},url:()=>url,title:async()=> 'App',getByRole:()=>locator,locator:()=>locator,
  evaluate:async()=>{},waitForLoadState:async()=>{},goto:async()=>({status:()=>200})};
 const fetch=async()=>({ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify({choices:[{message:{tool_calls:[{id:String(++turn),type:'function',function:turn===1?{name:'click',arguments:'{"target":"button \\\"Borrow\\\""}'}:
  {name:'finish',arguments:JSON.stringify({verdict:'passed',checks:[{...check,check:'One loan created',evidenceRefs:['A1'],actionRefs:['A1'],observedText:'1 loan'}]})}}]}}]})});
 const out=await agent.run({url,outDir,checks:['One loan created'],paths:['Borrow one book'],cdpEndpoint:'http://127.0.0.1:45991'},
  {key:'fake',fetch,playwright:{chromium:{connectOverCDP:async()=>({contexts:()=>[{pages:()=>[page]}]})}}});
 assert.equal(out.report.verdict,'partial');assert.equal(out.report.network[0].errorCode,'LOAN_LIMIT_REACHED');
 assert.equal(out.report.network[0].action,'A1');assert.match(out.report.checks[0].evidence,/Flow\/network error/);
});
