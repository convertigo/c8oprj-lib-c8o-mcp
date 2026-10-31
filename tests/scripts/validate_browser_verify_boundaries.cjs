const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const agent = require(process.env.BROWSER_VERIFY_AGENT_PATH || '../../node/browser_verify_agent.cjs');
const root = path.resolve(__dirname, '../../.night-tests');
fs.mkdirSync(root, {recursive:true});
function fixture(status = 200) {
  let url = 'http://localhost:28080/convertigo/gw/ticket/';
  const navigated = [];
  const file = path.join(root, 'download.txt'); fs.writeFileSync(file, 'requested export');
  const locator = {count:async()=>1,filter:()=>locator,first:()=>locator,nth:()=>locator,
    click:async()=>{}, ariaSnapshot:async()=>'TypeError: Cannot read properties of null (reading user)',
    waitFor:async()=>{throw new Error('Timeout 10000ms exceeded waiting for Approved');}};
  const page = {url:()=>url, title:async()=> 'Demo', locator:()=>locator, getByRole:()=>locator, getByText:()=>locator,
    waitForLoadState:async()=>{}, goto:async next=>{url=next;navigated.push(next);return {status:()=>status};},
    waitForEvent:async()=>({failure:async()=>null,path:async()=>file,suggestedFilename:()=> 'export.csv'})};
  return {page,navigated,playwright:{chromium:{connectOverCDP:async()=>({contexts:()=>[{pages:()=>[page]}]})}}};
}
const cfg = {url:'http://localhost:28080/convertigo/gw/ticket/',actionTimeoutMs:10,outDir:root,paths:['Send the request'],checks:['Approved'],cdpEndpoint:'http://127.0.0.1:45991'};
test('navigation stays within the application gateway, never dashboards or another origin',async()=>{
  const f=fixture(), tools=agent.createTools({page:f.page,screenshots:[]},cfg);
  for(const url of ['/convertigo/dashboard/','/convertigo/admin/','http://elsewhere.invalid/','/convertigo/gw/other/'])
    await assert.rejects(tools.navigate({url}),/outside the application/);
  assert.equal(f.navigated.length,0);
});
test('stopped viewer is reported before any model call, with no alternative navigation',async()=>{
  const f=fixture(404);let calls=0;
  const answer=await agent.run(cfg,{key:'fake',playwright:f.playwright,fetch:async()=>{calls++;throw Error('must not call model');}});
  assert.equal(calls,0);assert.match(answer.report.summary,/visualiseur arrêté/);
  assert.equal(answer.report.verdict,'partial');assert.equal(f.navigated.length,1);
});
test('first-render 500 returns its visible diagnostic immediately',async()=>{
  const f=fixture(500);
  const answer=await agent.run(cfg,{key:'fake',playwright:f.playwright,fetch:async()=>{throw Error('must not call model');}});
  assert.match(answer.report.summary,/HTTP 500.*TypeError/s);assert.equal(answer.report.verdict,'partial');
});
test('a timed out wait cannot be validated by the model',async()=>{
  const f=fixture();let turn=0;
  const fetch=async()=>({ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify({choices:[{message:{tool_calls:[{
    id:String(++turn),type:'function',function: turn===1 ? {name:'wait_for',arguments:'{"text":"Approved"}'} :
      {name:'finish',arguments:JSON.stringify({verdict:'passed',checks:[{id:'C1',check:'Approved',status:'passed',evidence:'Approved'}]})}
  }]}}]})});
  const answer=await agent.run(cfg,{key:'fake',playwright:f.playwright,fetch});
  assert.equal(answer.report.verdict,'partial');assert.equal(answer.report.checks[0].status,'not_checked');
  assert.match(answer.report.checks[0].evidence,/Timeout/);
});
test('omitted requested checks make a passed verdict partial',()=>{
  const answer=agent.normalizeReport({verdict:'passed',checks:[]},cfg,[]);
  assert.equal(answer.verdict,'partial');assert.equal(answer.checks[0].status,'not_checked');
});
test('download proof uses an actual browser download, filename and bytes',async()=>{
  const f=fixture(),tools=agent.createTools({page:f.page,screenshots:[]},cfg);
  assert.equal(typeof tools.download,'function');
  assert.match((await tools.download({target:'button "Download"'})).text,/export.csv \(16 bytes\)/);
});


test('display-only proof cannot validate requested business actions',async()=>{
 const f=fixture();
 const fetch=async()=>({ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify({choices:[{message:{tool_calls:[{
 id:'finish',type:'function',function:{name:'finish',arguments:JSON.stringify({verdict:'passed',checks:[{id:'C1',check:'Approved',status:'passed',evidence:'Buttons Send, Refuse, Cancel and Download are visible'}]})}
 }]}}]})});
 const answer=await agent.run({...cfg,paths:['Send, refuse, cancel and download']},{key:'fake',playwright:f.playwright,fetch});
 assert.equal(answer.report.verdict,'partial');assert.match(answer.report.checks[0].evidence,/no successful action observed for send, refuse, cancel, download/);
});


test('a late pageerror also prevents a passed finish report',async()=>{
 const f=fixture();let pageError;f.page.on=(name,callback)=>{if(name==='pageerror')pageError=callback;};
 const fetch=async()=>{pageError(new Error('Cannot read properties of null (reading user)'));return {ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify({choices:[{message:{tool_calls:[{
 id:'finish',type:'function',function:{name:'finish',arguments:JSON.stringify({verdict:'passed',checks:[{id:'C1',check:'Approved',status:'passed',evidence:'Approved'}]})}
 }]}}]})};};
 const answer=await agent.run({...cfg,paths:['Read the status']},{key:'fake',playwright:f.playwright,fetch});
 assert.equal(answer.report.verdict,'partial');assert.match(answer.report.checks[0].evidence,/Cannot read properties of null/);
});

test('console warning that stops an action ends verification before a model call',async()=>{
 const f=fixture();let consoleEvent;f.page.on=(name,callback)=>{if(name==='console')consoleEvent=callback;};
 const goto=f.page.goto;f.page.goto=async url=>{const response=await goto(url);consoleEvent({type:()=> 'warning',text:()=> 'stopped at action hasSession: Code expressions are not supported in action values'});return response;};
 const answer=await agent.run(cfg,{key:'fake',playwright:f.playwright,fetch:async()=>{throw Error('must not call model');}});
 assert.equal(answer.turns,0);assert.match(answer.report.summary,/stopped at action/);assert.equal(answer.report.consoleMessages[0].type,'warning');
});
test('console warnings are visible to the model and included in its final report',async()=>{
 const f=fixture();let consoleEvent;f.page.on=(name,callback)=>{if(name==='console')consoleEvent=callback;};
 const goto=f.page.goto;f.page.goto=async url=>{const response=await goto(url);consoleEvent({type:()=> 'warning',text:()=> 'A useful browser warning'});return response;};
 let turn=0;const fetch=async()=>({ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify({choices:[{message:{tool_calls:[{id:String(++turn),type:'function',function:turn===1?{name:'navigate',arguments:JSON.stringify({url:cfg.url})}:{name:'finish',arguments:'{"verdict":"partial","checks":[]}'}}]}}]})});
 const answer=await agent.run(cfg,{key:'fake',playwright:f.playwright,fetch});
 assert.equal(answer.report.consoleMessages.length,2);assert.equal(answer.consoleMessages[0].text,'A useful browser warning');
});
test('two reloads of the same DOM stop a frozen verification',async()=>{
 const f=fixture();let calls=0;const fetch=async()=>({ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify({choices:[{message:{tool_calls:[{id:String(++calls),type:'function',function:{name:'navigate',arguments:JSON.stringify({url:cfg.url})}}]}}]})});
 const answer=await agent.run(cfg,{key:'fake',playwright:f.playwright,fetch});
 assert.equal(calls,2);assert.equal(answer.stopReason,'APPLICATION_FROZEN');assert.match(answer.report.summary,/two reloads/);
});
