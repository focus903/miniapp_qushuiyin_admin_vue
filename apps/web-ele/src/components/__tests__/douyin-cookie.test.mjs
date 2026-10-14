import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';

function setup(client, canSave=true) {
 const source=readFileSync(new URL('../douyin-cookie.vue',import.meta.url),'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
 const hooks=[],exports={},messages=[];
 const mocks={vue:{...vue,onMounted:()=>{},onBeforeUnmount:fn=>hooks.push(fn)},
  'element-plus':{ElMessage:{success:message=>messages.push(message),error:message=>messages.push(message)},ElMessageBox:{confirm:async()=>{}}},
  '#/api/request':{requestClient:client}};
 runInNewContext(ts.transpileModule(source+'\nexports.api={load,save,clearCookie,testTarget,cookie,shareText,status,probe,working,error};',
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {exports,require:name=>mocks[name],defineProps:()=>({canSave}),Error});
 return {...exports.api,hooks,messages};
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
