import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';

function setup(client){
 const source=readFileSync(new URL('../business-video-preview.vue',import.meta.url),'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
 const props=vue.reactive({resource:'subtitle',recordId:'one'}),exports={},cleanup=[];
 const mocks={vue:{...vue,onBeforeUnmount:fn=>cleanup.push(fn)},'element-plus':{},'#/api/request':{requestClient:client}};
 runInNewContext(ts.transpileModule(source+'\nexports.api={load,value,error};',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL,defineProps:()=>props,require:name=>mocks[name],Error});
 return {...exports.api,props,cleanup};
}
test('late preview cannot replace current record or survive unmount',async()=>{
 let finish;const client={post:()=>new Promise(resolve=>{finish=resolve;})};const s=setup(client);
 const old=finish;client.post=async()=>({input_url:'https://host/new',result_url:'',input_reason:'',result_reason:''});
 s.props.recordId='two';await vue.nextTick();await Promise.resolve();
 old({input_url:'https://host/old',result_url:''});await Promise.resolve();
 assert.equal(s.value.value.input_url,'https://host/new');s.cleanup[0]();assert.equal(s.value.value,null);
});
test('unsafe URL is rejected and API failures clear previous video',async()=>{
 const client={post:async()=>({input_url:'javascript:bad',result_url:'https://host/result'})};const s=setup(client);
 await s.load();assert.equal(s.value.value.input_url,'');
 client.post=async()=>{throw Error('not available');};await s.load();assert.equal(s.value.value,null);assert.equal(s.error.value,'not available');
});
