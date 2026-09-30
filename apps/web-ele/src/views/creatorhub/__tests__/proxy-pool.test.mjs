import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';

function setup() {
  const text=readFileSync(new URL('../proxy-pool.vue',import.meta.url),'utf8');
  const source=text.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]+
    '\nexports.api={openCheck,submitCheck,syncProxies,load,can,checkDialog,checkKind,shareText,selectedIds,checkFilters,sourceInfo,syncLimit,job,active,busy,search,activate,deactivate,rows,platform,changePlatform,poll};';
  const calls=[]; const access=vue.reactive({accessCodes:['proxy-pool:read','proxy-pool:check','proxy-pool:sync']});
  const requestClient={get:async(url)=>url.endsWith('/source')?{configured:true}:{items:[],total:0,checkable_total:0,active_job_id:''},
    post:async(url,body,config)=>{calls.push({url,body,config});return url.endsWith('/sync')?{added:1,updated:0,skipped:0}:{id:'job',status:'completed',items:[],total:1,completed:1};}};
  const mocks={vue:{...vue,onMounted(){},onUnmounted(){},onActivated(){},onDeactivated(){}},
    '@vben/stores':{useAccessStore:()=>access},'#/api/request':{requestClient},
    'element-plus':{ElMessage:{success(){},warning(){},error(){}}}};
  const exports={};
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:name=>mocks[name]||{},document:{hidden:false,addEventListener(){},removeEventListener(){}},
     setTimeout:()=>1,clearTimeout(){},Date,console});
  return {...exports.api,calls,access,requestClient};
}
test('single check targets row and clears sensitive link after submit',async()=>{
  const s=setup();s.openCheck('a'.repeat(32));s.checkKind.value='xiaohongshu';s.shareText.value='https://xhslink.cn/o/test';
  await s.submitCheck();
  assert.equal(s.calls.length,1);assert.equal(s.calls[0].body.proxy_ids[0],'a'.repeat(32));
  assert.equal(s.shareText.value,'');assert.equal(s.checkDialog.value,false);
});
test('check and sync enforce permissions and configured key',async()=>{
  const s=setup();s.access.accessCodes=[];s.openCheck('a'.repeat(32));await s.submitCheck();await s.syncProxies();
  assert.equal(s.calls.length,0);
  s.access.accessCodes=['proxy-pool:sync'];s.sourceInfo.value={configured:false};await s.syncProxies();
  assert.equal(s.calls.length,0);
});
test('batch uses filter snapshot and does not accidentally send single id',async()=>{
  const s=setup();s.openCheck();await s.submitCheck();
  assert.ok(s.calls[0].body.filters);assert.equal('proxy_ids' in s.calls[0].body,false);
});
test('sync submits the requested quantity once',async()=>{
  const s=setup();s.sourceInfo.value={configured:true};s.syncLimit.value=5;
  await s.syncProxies();assert.equal(s.calls[0].body.limit,5);
});

test('sync client waits longer than the backend 30 second budget',async()=>{
  const s=setup();s.sourceInfo.value={configured:true};
  await s.syncProxies();assert.ok(s.calls[0].config?.timeout >= 35000);
});
test('batch uses the displayed filter rather than an unsubmitted input',async()=>{
  const s=setup();await s.load(false);s.search.value='not-submitted';
  s.openCheck();await s.submitCheck();
  assert.equal(s.calls[0].body.filters.search,'');
});
test('returning after deactivation during a load recovers loading state',async()=>{
  const s=setup();const pending=s.load(false);s.deactivate();await pending;
  await s.activate();assert.equal(s.busy.value,false);
});

test('credential list uses protected endpoint and clears on leaving',async()=>{
 const s=setup();let requested='';
 s.requestClient.get=async url=>{requested=url;return {items:[{id:'one',username:'test-user',password:'test-pass'}],total:1,checkable_total:1};};
 await s.load(false);assert.equal(requested,'/proxy-pool/proxies/credentials');assert.equal(s.rows.value[0].password,'test-pass');
 s.deactivate();assert.equal(s.rows.value.length,0);
 s.access.accessCodes=['proxy-pool:read'];await s.load(false);assert.equal(requested,'/proxy-pool/proxies');
});


test('platform switches clear secrets and scope list sync and checks',async()=>{
 const s=setup();const gets=[];
 s.requestClient.get=async(url,config)=>{gets.push({url,config});return url.endsWith('/source')?{configured:true}:{items:[],total:0,checkable_total:0,active_job_id:''};};
 s.rows.value=[{password:'private'}];s.platform.value='kuaidaili';
 await s.changePlatform();assert.equal(s.rows.value.length,0);
 assert.equal(gets[0].config.params.source,'kuaidaili');
 assert.equal(gets[1].config.params.source,'kuaidaili');
 s.openCheck();await s.submitCheck();assert.equal(s.calls[0].body.source,'kuaidaili');
 s.sourceInfo.value={configured:true};await s.syncProxies();assert.equal(s.calls[1].body.source,'kuaidaili');
});

test('old platform response cannot replace the new tab',async()=>{
 const s=setup();let resolve;
 s.requestClient.get=()=>new Promise(r=>resolve=r);
 const old=s.load(false);s.platform.value='kuaidaili';
 s.requestClient.get=async url=>url.endsWith('/source')?{configured:true}:{items:[{id:'kdl'}],total:1,checkable_total:1,active_job_id:''};
 await s.changePlatform();resolve({items:[{id:'webshare',password:'private'}],total:1,checkable_total:1});await old;
 assert.equal(s.rows.value[0].id,'kdl');
});

test('account keys never submit an extraction',async()=>{
 const s=setup();s.platform.value='kuaidaili';s.sourceInfo.value={configured:true,account_key:true};
 await s.syncProxies();assert.equal(s.calls.length,0);
});


test('old poll cannot interrupt new platform source loading',async()=>{
 const s=setup();let resolvePoll,resolveSource;
 s.job.value={id:'old',status:'running',kind:'https'};
 s.requestClient.get=(url)=>{
  if(url.includes('/check-jobs/'))return new Promise(r=>resolvePoll=r);
  if(url.endsWith('/source'))return new Promise(r=>resolveSource=r);
  return Promise.resolve({items:[],total:0,checkable_total:0,active_job_id:''});
 };
 const polling=s.poll();s.platform.value='kuaidaili';const changing=s.changePlatform();
 resolvePoll({id:'old',status:'completed'});await polling;
 resolveSource({configured:true,account_key:true});await changing;
 assert.equal(s.sourceInfo.value?.configured,true);
 assert.equal(s.sourceInfo.value?.account_key,true);
});
