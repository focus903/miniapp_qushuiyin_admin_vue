import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';

function setup(client, canSave=true) {
 const source=readFileSync(new URL('../douyin-cookie.vue',import.meta.url),'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
 const hooks=[],exports={},messages=[],timers=[];
 const mocks={vue:{...vue,onMounted:()=>{},onBeforeUnmount:fn=>hooks.push(fn)},
  'element-plus':{ElMessage:{success:message=>messages.push(message),error:message=>messages.push(message)},ElMessageBox:{confirm:async()=>{}}},
  '#/api/request':{requestClient:client}};
 runInNewContext(ts.transpileModule(source+'\nexports.api={load,save,clearCookie,testTarget,cookie,shareText,status,probe,working,error,startScan,cancelScan,refreshScan,pollScan,scan,get scanGeneration(){return scanGeneration;}};',
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {exports,require:name=>mocks[name],defineProps:()=>({canSave}),Error,
   setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{}});
 return {...exports.api,hooks,messages,timers,get scanGeneration(){return exports.api.scanGeneration;}};
}
const state={configured:true,source:'database',updated:1,encryption_ready:true,storage_ready:true};

test('save clears the secret immediately and never fills it from status',async()=>{
 let complete;
 const s=setup({get:async()=>state,put:()=>new Promise(resolve=>{complete=resolve;})});
 await s.load();s.cookie.value='sessionid=private';const pending=s.save();
 assert.equal(s.cookie.value,'');assert.equal(s.working.value,true);
 complete(state);await pending;assert.equal(s.cookie.value,'');assert.equal(s.status.value.configured,true);
});
test('test uses saved configuration and closing ignores late responses',async()=>{
 let complete;const calls=[];
 const s=setup({get:async()=>state,post:(path,body)=>{calls.push([path,body]);return new Promise(resolve=>{complete=resolve;});}});
 await s.load();s.shareText.value='https://v.douyin.com/test/';const pending=s.testTarget();
 assert.equal(calls[0][0],'/system/douyin-cookie/test');assert.deepEqual(Object.keys(calls[0][1]),['url']);
 s.hooks[0]();complete({parsed:true,image_count:1,video_count:1});await pending;
 assert.equal(s.probe.value,null);assert.equal(s.cookie.value,'');
});
test('read-only user cannot save, delete or test; failed test is not login success',async()=>{
 const calls=[];const client={get:async()=>state,put:async()=>calls.push('put'),delete:async()=>calls.push('delete'),post:async()=>({parsed:false,message:'未取得目标作品'})};
 const ro=setup(client,false);await ro.load();ro.cookie.value='session=private';ro.shareText.value='link';await ro.save();await ro.clearCookie();await ro.testTarget();assert.deepEqual(calls,[]);
 const s=setup(client);await s.load();s.shareText.value='link';await s.testTarget();assert.equal(s.probe.value.parsed,false);
});
test('clear uses the private endpoint and replaces status',async()=>{
 const calls=[];const s=setup({get:async()=>state,delete:async path=>{calls.push(path);return {...state,configured:false,source:'none'};}});
 await s.load();await s.clearCookie();assert.deepEqual(calls,['/system/douyin-cookie']);assert.equal(s.status.value.configured,false);
});

const waiting={session_id:'scan-one',state:'waiting',qr_image:'data:image/png;base64,cXI=',message:'',expires_at:9999999999};
test('scan blocks manual writes and refresh cancels before starting again',async()=>{
 const calls=[];
 const s=setup({get:async()=>state,post:async path=>{calls.push(['post',path]);return {...waiting};},
  delete:async path=>{calls.push(['delete',path]);return {...waiting,state:'cancelled'};},put:async()=>calls.push(['unexpected'])});
 await s.load();await s.startScan();s.cookie.value='session=private';await s.save();await s.clearCookie();
 assert.deepEqual(calls,[['post','/system/douyin-cookie/login']]);
 await s.refreshScan();assert.deepEqual(calls.map(item=>item[0]),['post','delete','post']);
 s.hooks[0]();
});
test('late scan start is cancelled after closing without exposing QR',async()=>{
 let complete;const cancelled=[];
 const s=setup({get:async()=>state,post:()=>new Promise(resolve=>{complete=resolve;}),delete:async(path,options)=>{cancelled.push(options.params.session_id);return {...waiting,state:'cancelled'};}});
 await s.load();const pending=s.startScan();s.hooks[0]();complete({...waiting});await pending;
 assert.deepEqual(cancelled,['scan-one']);assert.equal(s.scan.value,null);
});
test('scan save reloads shared configuration; verification failure is never success',async()=>{
 let saved=false;
 const s=setup({post:async()=>({...waiting}),get:async path=>path.endsWith('/login')
  ? {...waiting,state:saved?'saved':'failed',qr_image:null,message:saved?'已保存':'需要人工验证'}:({...state,configured:saved})});
 await s.load();await s.startScan();await s.pollScan(s.scanGeneration);
 assert.equal(s.scan.value.state,'failed');assert.equal(s.status.value.configured,false);
 saved=true;await s.startScan();await s.pollScan(s.scanGeneration);
 assert.equal(s.scan.value.state,'saved');assert.equal(s.status.value.configured,true);assert.equal(s.cookie.value,'');
});
