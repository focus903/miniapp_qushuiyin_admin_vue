import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';

function setup(initialPlatform='webshare') {
  const text=readFileSync(new URL('../proxy-pool.vue',import.meta.url),'utf8');
  const source=text.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]+
    '\nexports.api={openCheck,submitCheck,syncProxies,load,can,checkDialog,checkKind,shareText,selectedIds,checkFilters,sourceInfo,syncLimit,job,active,busy,search,activate,deactivate,rows,platform,changePlatform,poll,running,deleteProxies,failedTotal,deleting,openCustom,saveCustom,customForm,customDialog,importDialog,importText,preview,openImport,importCustom,appliedFilters};';
  const confirmations=[];const confirm={run:async(...args)=>{confirmations.push(args);}};
  const calls=[]; const access=vue.reactive({accessCodes:['proxy-pool:read','proxy-pool:check','proxy-pool:sync']});
  const requestClient={get:async(url)=>url.endsWith('/source')?{configured:true}:{items:[],total:0,checkable_total:0,active_job_id:''},
    post:async(url,body,config)=>{calls.push({url,body,config});return url.endsWith('/sync')?{added:1,updated:0,skipped:0}:{id:'job',status:'completed',items:[],total:1,completed:1};}};
  const mocks={vue:{...vue,onMounted(){},onUnmounted(){},onActivated(){},onDeactivated(){}},
    '@vben/stores':{useAccessStore:()=>access},'#/api/request':{requestClient},
    'element-plus':{ElMessageBox:{confirm:(...args)=>confirm.run(...args)},ElMessage:{success(){},warning(){},error(){}}}};
  const exports={};
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:name=>mocks[name]||{},document:{hidden:false,addEventListener(){},removeEventListener(){}},
     setTimeout:()=>1,clearTimeout(){},Date,console});
  if(initialPlatform)exports.api.platform.value=initialPlatform;
  return {...exports.api,calls,access,requestClient,confirm,confirmations};
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

test('douyin checks require a link and preserve explicit batch IDs',async()=>{
 const s=setup();s.openCheck(['a'.repeat(32),'b'.repeat(32)]);s.checkKind.value='douyin';
 await s.submitCheck();assert.equal(s.calls.length,0);
 s.shareText.value='作品 https://v.douyin.com/abc123/';await s.submitCheck();
 assert.equal(s.calls[0].body.kind,'douyin');assert.equal(s.calls[0].body.proxy_ids.length,2);
 assert.equal(s.calls[0].body.share_text,'作品 https://v.douyin.com/abc123/');
 assert.equal('filters' in s.calls[0].body,false);assert.equal(s.shareText.value,'');
});


test('other platform active job is never displayed or blocks checks',async()=>{
 const s=setup();s.platform.value='kuaidaili';
 s.requestClient.get=async url=>url.includes('/check-jobs/')?{id:'web',source:'webshare',status:'running'}:{items:[],total:0,checkable_total:0,active_job_id:'web'};
 await s.load(false);assert.equal(s.job.value,undefined);assert.equal(s.running.value,false);
});

test('switching platforms restores only their own running job',async()=>{
 const s=setup();
 s.requestClient.get=async(url,config)=>url.endsWith('/source')?{configured:true}:url.includes('/check-jobs/')?{id:url.split('/').at(-1),source:url.split('/').at(-1),status:'running'}:{items:[],total:0,checkable_total:0,active_job_id:config.params.source};
 await s.load();assert.equal(s.job.value.source,'webshare');
 s.platform.value='kuaidaili';await s.changePlatform();assert.equal(s.job.value.source,'kuaidaili');assert.equal(s.running.value,true);
 s.platform.value='webshare';await s.changePlatform();assert.equal(s.job.value.source,'webshare');
});

test('late submit result cannot replace another platform job',async()=>{
 const s=setup();let finish;s.openCheck();
 s.requestClient.post=()=>new Promise(resolve=>finish=resolve);
 const pending=s.submitCheck();s.platform.value='kuaidaili';await s.changePlatform();
 s.job.value={id:'kdl',source:'kuaidaili',status:'running'};
 finish({id:'web',source:'webshare',status:'running'});await pending;
 assert.equal(s.job.value.id,'kdl');
});


test('custom tab is the default and saves through custom endpoints',async()=>{
 const s=setup(null);assert.equal(s.platform.value,'custom');s.access.accessCodes.push('proxy-pool:create','proxy-pool:update');
 s.requestClient.request=async(url,config)=>{s.calls.push({url,config});return {id:'one'};};
 s.openCustom();s.customForm.value.address='8.8.8.8';s.customForm.value.password='private';await s.saveCustom();
 assert.equal(s.calls[0].url,'/proxy-pool/custom');assert.equal(s.calls[0].config.method,'POST');
 await vue.nextTick();assert.equal(s.customForm.value.password,'');
 s.openCustom({id:'one',address:'8.8.8.8',port:1080,protocol:'socks5',enabled:true});await s.saveCustom();
 assert.equal(s.calls[1].config.method,'PUT');assert.equal(s.calls[1].config.data.password,null);
});

test('import requires preview and edits invalidate it',async()=>{
 const s=setup(null);s.access.accessCodes.push('proxy-pool:create');s.openImport();s.importText.value='8.8.8.8:8080';await vue.nextTick();
 await s.importCustom(true);assert.equal(s.calls.length,0);
 s.requestClient.post=async(url,body)=>{s.calls.push({url,body});return {rows:[],invalid:0,unique:1};};
 await s.importCustom(false);assert.equal(s.calls[0].body.preview,true);
 s.importText.value='1.1.1.1:1080';await vue.nextTick();assert.equal(s.preview.value,null);
 await s.importCustom(true);assert.equal(s.calls.length,1);
 s.deactivate();assert.equal(s.importText.value,'');
});

test('delete requires permission confirmation and uses displayed filter snapshot',async()=>{
 const s=setup();s.failedTotal.value=5;await s.deleteProxies();assert.equal(s.confirmations.length,0);
 s.access.accessCodes.push('proxy-pool:delete');s.search.value='unsubmitted';
 s.requestClient.post=async(url,body)=>{s.calls.push({url,body});return {deleted:5};};
 await s.deleteProxies();assert.equal(s.calls[0].body.source,'webshare');assert.equal(s.calls[0].body.filters.search,'');
 assert.match(s.confirmations[0][0],/全部分页/);
});

test('cancel or switching platforms while confirming never deletes',async()=>{
 const s=setup();s.access.accessCodes.push('proxy-pool:delete');s.failedTotal.value=1;
 s.confirm.run=async()=>{throw new Error('cancel');};await s.deleteProxies();assert.equal(s.calls.length,0);
 let finish;s.confirm.run=()=>new Promise(resolve=>finish=resolve);
 const pending=s.deleteProxies();s.platform.value='kuaidaili';await s.changePlatform();finish();await pending;
 assert.equal(s.calls.length,0);assert.equal(s.deleting.value,false);
});


test('custom form submits and preserves HTTPS protocol',async()=>{
 const s=setup(null);s.access.accessCodes.push('proxy-pool:create','proxy-pool:update');
 s.requestClient.request=async(url,config)=>{s.calls.push({url,config});return {id:'one'};};
 s.openCustom();s.customForm.value.address='8.8.8.8';s.customForm.value.protocol='https';await s.saveCustom();
 assert.equal(s.calls[0].config.data.protocol,'https');
 s.openCustom({id:'one',address:'8.8.8.8',port:443,protocol:'https',enabled:true});
 assert.equal(s.customForm.value.protocol,'https');
});

test('domain and SOCKS5H survive create and edit',async()=>{
 const s=setup(null);s.access.accessCodes.push('proxy-pool:create','proxy-pool:update');
 s.requestClient.request=async(url,config)=>{s.calls.push({url,config});return {id:'one'};};
 s.openCustom();s.customForm.value.address='proxy.example.com';s.customForm.value.protocol='socks5h';await s.saveCustom();
 assert.equal(s.calls[0].config.data.address,'proxy.example.com');assert.equal(s.calls[0].config.data.protocol,'socks5h');
 s.openCustom({id:'one',address:'proxy.example.com',port:7000,protocol:'socks5h',enabled:true});await s.saveCustom();
 assert.equal(s.calls[1].config.data.address,'proxy.example.com');assert.equal(s.calls[1].config.data.protocol,'socks5h');
});
