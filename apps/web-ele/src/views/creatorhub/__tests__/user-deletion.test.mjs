import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';
const preview=(openid='user/a',extra={})=>({openid,tables:{users:1},private_local_files:2,cloud_files:0,blockers:[],can_delete:true,preview_token:'token',...extra});
function setup(){
 const text=readFileSync(new URL('../operations.vue',import.meta.url),'utf8');
 const source=text.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]+'\nexports.api={openUserDeletion,loadDeletionPreview,submitUserDeletion,deletionOpen,deletionOwner,deletionPreview,deletionConfirm,deletionReason,deletionError,deletionSaving,canDeleteUser};';
 const access=vue.reactive({accessCodes:['users:delete']});const route=vue.reactive({meta:{resource:'users'},query:{},fullPath:'/users'});const calls=[];
 const requestClient={get:async()=>preview(),post:async(url,body)=>{calls.push({url,body});return {deleted:true,openid:'user/a'};}};
 const mocks={vue:{...vue,onUnmounted(){},onDeactivated(){}},'vue-router':{useRoute:()=>route},'@vben/stores':{useAccessStore:()=>access},'#/api/request':{requestClient},'element-plus':{ElMessage:{success(){},error(){},warning(){}}}};
 const exports={};runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>mocks[name]||{},console,Error});
 return {...exports.api,access,route,requestClient,calls};
}
async function ready(s){await s.openUserDeletion({openid:'user/a'});s.deletionConfirm.value='user/a';s.deletionReason.value='清理测试账号';}
test('requires permission, full matching OpenID, reason and an unblocked preview',async()=>{
 const s=setup();s.access.accessCodes=[];await s.openUserDeletion({openid:'user/a'});assert.equal(s.deletionOpen.value,false);
 s.access.accessCodes=['users:delete'];await s.openUserDeletion({openid:'user/a'});await s.submitUserDeletion();assert.equal(s.calls.length,0);
 s.deletionConfirm.value='user/a ';s.deletionReason.value='测试';await s.submitUserDeletion();assert.equal(s.calls.length,0);
 s.deletionConfirm.value='user/a';s.deletionPreview.value=preview('user/a',{blockers:['处理中']});await s.submitUserDeletion();assert.equal(s.calls.length,0);
 s.deletionPreview.value=preview();await s.submitUserDeletion();assert.equal(s.calls[0].url,'/operations/users/user%2Fa/delete');assert.equal(s.calls[0].body.preview_token,'token');assert.equal(s.deletionOpen.value,false);
});
test('pending delete cannot be submitted twice or switched to another user',async()=>{
 const s=setup();await ready(s);let finish;s.requestClient.post=async(url,body)=>{s.calls.push({url,body});return new Promise(r=>finish=r);};
 const pending=s.submitUserDeletion();await s.submitUserDeletion();await s.openUserDeletion({openid:'other'});assert.equal(s.calls.length,1);assert.equal(s.deletionOwner.value,'user/a');finish({deleted:true,openid:'user/a'});await pending;
});
test('late preview cannot replace another user or reopen a closed route',async()=>{
 const s=setup();let finish;s.requestClient.get=()=>new Promise(r=>finish=r);const old=s.openUserDeletion({openid:'old'});
 s.requestClient.get=async()=>preview('new');await s.openUserDeletion({openid:'new'});finish(preview('old'));await old;assert.equal(s.deletionPreview.value.openid,'new');
 s.requestClient.get=()=>new Promise(r=>finish=r);const pending=s.loadDeletionPreview();s.route.fullPath='/orders';await vue.nextTick();finish(preview('new'));await pending;assert.equal(s.deletionOpen.value,false);assert.equal(s.deletionPreview.value,null);
});
test('delete error preserves form but invalidates token until preview refresh',async()=>{
 const s=setup();await ready(s);s.requestClient.post=async()=>{throw new Error('预览已失效');};await s.submitUserDeletion();assert.equal(s.deletionOpen.value,true);assert.equal(s.deletionReason.value,'清理测试账号');assert.match(s.deletionError.value,/预览已失效/);assert.equal(s.canDeleteUser.value,false);
 await s.loadDeletionPreview();assert.equal(s.canDeleteUser.value,true);
});
test('mismatched preview identity never enables deletion',async()=>{
 const s=setup();s.requestClient.get=async()=>preview('other');await ready(s);assert.equal(s.canDeleteUser.value,false);assert.ok(s.deletionError.value);
});

test('preview errors keep dialog available for retry',async()=>{
 const s=setup();s.requestClient.get=async()=>{throw new Error('暂时不可用');};await s.openUserDeletion({openid:'user/a'});assert.equal(s.deletionOpen.value,true);assert.match(s.deletionError.value,/暂时不可用/);assert.equal(s.canDeleteUser.value,false);
 s.requestClient.get=async()=>preview();await s.loadDeletionPreview();assert.equal(s.deletionError.value,'');assert.equal(s.deletionPreview.value.openid,'user/a');
});
test('late deletion after route change cannot close a new dialog or reload another page',async()=>{
 const s=setup();await ready(s);let finish;let reads=0;s.requestClient.post=()=>new Promise(r=>finish=r);s.requestClient.get=async()=>{reads++;return preview();};
 const pending=s.submitUserDeletion();s.route.fullPath='/orders';await vue.nextTick();finish({deleted:true,openid:'user/a'});await pending;assert.equal(reads,0);assert.equal(s.deletionOpen.value,false);assert.equal(s.deletionSaving.value,false);
});
