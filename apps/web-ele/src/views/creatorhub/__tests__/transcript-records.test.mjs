import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';

function setup(){
 const text=readFileSync(new URL('../transcript-records.vue',import.meta.url),'utf8');
 const source=text.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]+'\nexports.api={load,openDetail,stop,kind,rows,total,busy,error,dialog,detail,detailBusy,detailError,openid,source,status};';
 const access=vue.reactive({accessCodes:['transcripts:read']});
 const calls=[];const client={get:async(url,options)=>{calls.push({url,options});return {items:[],total:0};}};
 const mocks={vue:{...vue,onMounted(){},onActivated(){},onDeactivated(){},onUnmounted(){}},'@vben/stores':{useAccessStore:()=>access},'#/api/request':{requestClient:client}};
 const exports={};runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>mocks[name]||{},console,Error});
 return {...exports.api,access,client,calls};
}

test('read permission required and result filters do not include task status',async()=>{
 const s=setup();s.access.accessCodes=[];await vue.nextTick();await s.load();assert.equal(s.calls.length,0);
 s.access.accessCodes=['transcripts:read'];await vue.nextTick();s.calls.length=0;
 s.openid.value='u';s.source.value='upload';s.status.value='failed';await s.load();
 assert.equal(s.calls[0].url,'/operations/records/transcripts');
 assert.equal(s.calls[0].options.params.source,'upload');assert.equal(s.calls[0].options.params.openid,'u');
 assert.equal(s.calls[0].options.params.status,undefined);
});

test('late result list cannot overwrite the task tab',async()=>{
 const s=setup();let finish;
 s.client.get=()=>new Promise(resolve=>{finish=resolve;});const old=s.load();
 s.client.get=async()=>({items:[{id:'task'}],total:1});s.kind.value='text-tasks';await vue.nextTick();await Promise.resolve();
 finish({items:[{id:'old'}],total:9});await old;
 assert.equal(s.rows.value[0].id,'task');assert.equal(s.total.value,1);assert.equal(s.busy.value,false);
});

test('late detail cannot reappear after leaving page',async()=>{
 const s=setup();let finish;s.client.get=()=>new Promise(resolve=>{finish=resolve;});
 const work=s.openDetail({id:'one'});s.stop();finish({id:'one',text:'private text'});await work;
 assert.equal(s.dialog.value,false);assert.equal(s.detail.value,null);assert.equal(s.detailBusy.value,false);
});

test('detail API failure is shown and does not retain previous text',async()=>{
 const s=setup();s.detail.value={id:'old',text:'old text'};s.client.get=async()=>{throw new Error('记录不存在');};
 await s.openDetail({id:'missing'});assert.equal(s.detail.value,null);assert.equal(s.detailError.value,'记录不存在');assert.equal(s.detailBusy.value,false);
});
