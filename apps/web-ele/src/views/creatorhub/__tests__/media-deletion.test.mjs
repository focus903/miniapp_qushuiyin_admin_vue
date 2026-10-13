import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';

function setup(resource='files'){
 const text=readFileSync(new URL('../operations.vue',import.meta.url),'utf8');
 const source=text.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]+'\nexports.api={deleteMedia,mediaDeleteBusy,mediaDeleteError,selected,resourceFilesSelected,resourceFilesOpen,resourceFilesKey,resourceFilesPage,kind,page,rows};';
 const access=vue.reactive({accessCodes:['files:read','files:delete','resources:read','resources:delete']});
 const route=vue.reactive({meta:{resource},query:{},fullPath:'/'+resource});
 const calls=[],messages=[],reads=[];
 const requestClient={get:async(url)=>{reads.push(url);return {items:[],total:0};},post:async(url,body)=>{calls.push({url,body});return {requested:body.ids.length,deleted:body.ids.length,deleted_ids:body.ids,deleted_files:body.ids.length,failed:[]};}};
 const ElMessageBox={confirm:async()=>{}};
 const mocks={vue:{...vue,onUnmounted(){},onDeactivated(){}},'vue-router':{useRoute:()=>route},'@vben/stores':{useAccessStore:()=>access},'#/api/request':{requestClient},'element-plus':{ElMessageBox,ElMessage:{success:value=>messages.push(value),error:value=>messages.push(value),warning:value=>messages.push(value)}}};
 mocks['#/utils/business-record-deletion']={useBusinessRecordDeletion:()=>({allowed:vue.ref(false),busy:vue.ref(false),error:vue.ref(''),reset(){}})};
 const exports={};runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>mocks[name]||{},console,Error});
 return {...exports.api,access,route,requestClient,calls,messages,reads,ElMessageBox};
}

test('deletes only selected file IDs, including valid files',async()=>{
 const s=setup();await s.deleteMedia('files',[{id:'a',is_valid:1},{id:'b',is_valid:0},{id:'a'}]);
 assert.equal(s.calls.length,1);assert.equal(s.calls[0].url,'/operations/files/delete');assert.equal(s.calls[0].body.ids.join(','),'a,b');
});
test('resource deletion sends selected resource keys',async()=>{
 const s=setup('resources');await s.deleteMedia('resources',[{resource_key:'resource-a'}]);
 assert.equal(s.calls[0].url,'/operations/resources/delete');assert.equal(s.calls[0].body.ids[0],'resource-a');
});
test('permission, cancellation and empty selection prevent writes',async()=>{
 const s=setup();await s.deleteMedia('files',[]);s.access.accessCodes=['files:read'];await s.deleteMedia('files',[{id:'a'}]);assert.equal(s.calls.length,0);
 s.access.accessCodes.push('files:delete');s.ElMessageBox.confirm=async()=>{throw 'cancel';};await s.deleteMedia('files',[{id:'a'}]);assert.equal(s.calls.length,0);assert.equal(s.mediaDeleteBusy.value,false);
});
test('pending confirmation blocks duplicate requests and route changes cancel the write',async()=>{
 const s=setup();let finish;s.ElMessageBox.confirm=()=>new Promise(r=>finish=r);const pending=s.deleteMedia('files',[{id:'a'}]);await s.deleteMedia('files',[{id:'b'}]);s.route.fullPath='/other';finish();await pending;assert.equal(s.calls.length,0);assert.equal(s.mediaDeleteBusy.value,false);
});
test('partial failure shows retryable IDs and detailed file error',async()=>{
 const s=setup('resources');s.requestClient.post=async()=>({requested:2,deleted:1,deleted_ids:['a'],deleted_files:2,failed:[{id:'b',message:'部分关联文件失败',files:[{id:'file-b',message:'云文件删除失败'}]}]});
 await s.deleteMedia('resources',[{resource_key:'a'},{resource_key:'b'}]);assert.match(s.mediaDeleteError.value,/file-b.*云文件删除失败/);assert.ok(s.messages.some(text=>text.includes('1')));
});
test('dialog deletion refreshes the same resource and clears its selection',async()=>{
 const s=setup('resources');await vue.nextTick();s.resourceFilesOpen.value=true;s.resourceFilesKey.value='resource-a';s.resourceFilesSelected.value=[{id:'a'}];
 await s.deleteMedia('files',s.resourceFilesSelected.value,true);assert.equal(s.calls[0].body.ids[0],'a');assert.equal(s.resourceFilesSelected.value.length,0);assert.ok(s.reads.some(url=>url.includes('records/resources/resource-a')));
});
test('late response does not refresh a different route or resource dialog',async()=>{
 const s=setup('resources');await vue.nextTick();s.resourceFilesOpen.value=true;s.resourceFilesKey.value='old';let finish;s.requestClient.post=()=>new Promise(r=>finish=r);
 const pending=s.deleteMedia('files',[{id:'a'}],true);await new Promise(setImmediate);assert.equal(typeof finish,'function');s.resourceFilesKey.value='new';s.route.fullPath='/other';s.reads.length=0;finish({requested:1,deleted:1,deleted_ids:['a'],deleted_files:1,failed:[]});await pending;assert.equal(s.reads.length,0);
});
