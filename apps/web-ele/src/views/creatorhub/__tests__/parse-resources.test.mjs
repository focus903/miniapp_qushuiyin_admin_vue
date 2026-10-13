import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';

function setup(){
 const text=readFileSync(new URL('../operations.vue',import.meta.url),'utf8');
 const source=text.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]+'\nexports.api={openParseResources,parseResourcesOpen,parseResourcesBusy,parseResourcesError,parseResources,parseResourcesShare,trashed};';
 const access=vue.reactive({accessCodes:['parses:read','resources:read']});
 const route=vue.reactive({meta:{resource:'parses'},query:{},fullPath:'/parse-records'});
 const calls=[];const requestClient={get:async(url,options)=>{calls.push({url,options});return url.includes('/parses/')?{share_text:'原始分享内容',related_resources:[{resource_key:'resource-a',output_mode:'cache'}]}:{items:[],total:0};}};
 const mocks={vue:{...vue,onUnmounted(){},onDeactivated(){}},'vue-router':{useRoute:()=>route},'@vben/stores':{useAccessStore:()=>access},'#/api/request':{requestClient}};
 mocks['#/utils/business-record-deletion']={useBusinessRecordDeletion:()=>({allowed:vue.ref(false),busy:vue.ref(false),error:vue.ref(''),reset(){}})};
 const exports={};runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>mocks[name]||{},console,Error});
 return {...exports.api,access,route,requestClient,calls};
}

test('loads matching resources with the parse ID and recycle state',async()=>{
 const s=setup();await vue.nextTick();s.trashed.value=true;await s.openParseResources({id:'parse/a',share_text:'分享'});
 const call=s.calls.find(call=>call.url.includes('/parses/'));
 assert.equal(call.url,'/operations/records/parses/parse%2Fa');assert.equal(call.options.params.trashed,true);
 assert.equal(s.parseResourcesOpen.value,true);assert.equal(s.parseResources.value[0].resource_key,'resource-a');assert.equal(s.parseResourcesShare.value,'原始分享内容');
});
test('requires both read permissions and original share content',async()=>{
 const s=setup();await s.openParseResources({id:'a'});assert.equal(s.parseResourcesOpen.value,false);
 s.access.accessCodes=['parses:read'];await s.openParseResources({id:'a',share_text:'分享'});assert.equal(s.parseResourcesOpen.value,false);
 s.access.accessCodes=['resources:read'];await s.openParseResources({id:'a',share_text:'分享'});assert.equal(s.parseResourcesOpen.value,false);
});
test('empty match and request error keep a usable dialog',async()=>{
 const s=setup();await vue.nextTick();s.requestClient.get=async()=>({related_resources:[]});await s.openParseResources({id:'a',share_text:'分享'});assert.equal(s.parseResources.value.length,0);assert.equal(s.parseResourcesBusy.value,false);
 s.requestClient.get=async()=>{throw new Error('加载失败');};await s.openParseResources({id:'a',share_text:'分享'});assert.match(s.parseResourcesError.value,/加载失败/);assert.equal(s.parseResourcesOpen.value,true);
});
test('older response cannot replace a newer selection or closed dialog',async()=>{
 const s=setup();await vue.nextTick();let finish;s.requestClient.get=()=>new Promise(r=>finish=r);
 const old=s.openParseResources({id:'old',share_text:'旧分享'});s.requestClient.get=async()=>({related_resources:[{resource_key:'new'}]});await s.openParseResources({id:'new',share_text:'新分享'});
 finish({related_resources:[{resource_key:'old'}]});await old;assert.equal(s.parseResources.value[0].resource_key,'new');
 s.requestClient.get=()=>new Promise(r=>finish=r);const pending=s.openParseResources({id:'pending',share_text:'分享'});s.parseResourcesOpen.value=false;
 finish({related_resources:[{resource_key:'pending'}]});await pending;assert.equal(s.parseResources.value.length,0);assert.equal(s.parseResourcesBusy.value,false);
});
test('route change discards pending response and history requests avoid recycle state',async()=>{
 const s=setup();await vue.nextTick();s.trashed.value=true;await s.openParseResources({id:'history',share_text:'分享'},true);
 assert.equal(s.calls.find(call=>call.url.includes('/parses/')).options.params.trashed,false);
 let finish;s.requestClient.get=()=>new Promise(r=>finish=r);const pending=s.openParseResources({id:'a',share_text:'分享'});s.route.fullPath='/other';await vue.nextTick();finish({related_resources:[{resource_key:'stale'}]});await pending;assert.equal(s.parseResourcesOpen.value,false);assert.equal(s.parseResources.value.length,0);
});
