const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const C8O={mcpAuth:{authenticateRequest:()=>({authenticated:true,kind:'full',scope:'mcp:full'})},browserVerify:{javaHost:()=>({}),runners:()=>({})},constructorRunner:{extendHost:h=>h}};
const context=vm.createContext({C8O});
for(const file of ['js/subagents.js','js/tools_subagent_run.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
test('busy sub-agent returns a structured code, runId and poll instruction without Rhino stack',()=>{
 const runId='verify-20261031-195427-aabbccdd';
 C8O.subagents.run=()=>{throw C8O.subagents.busyError('browser',runId);};
 const answer=C8O.subagentRun.execute({}, {task:'check'});
 assert.equal(answer.error.code,'SUBAGENT_BUSY');assert.equal(answer.runId,runId);assert.equal(answer.error.details.runId,runId);assert.match(answer.error.hint,/with runId alone/);assert.doesNotMatch(JSON.stringify(answer),/stack|Rhino/);
});
