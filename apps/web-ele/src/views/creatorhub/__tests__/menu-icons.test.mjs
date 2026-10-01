import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';

function setup(){
 const text=readFileSync(new URL('../menu-layout.vue',import.meta.url),'utf8');
 const source=text.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]+'\nexports.api={items,ready,dirty,editIcon,applyIcon,clearIcon,iconDraft,iconOpen,save};';
 const access=vue.reactive({accessCodes:['menu-layout:update']});const calls=[];
 const client={put:async(url,body)=>{calls.push({url,body});return {...body,revision:body.revision+1,ready:true};}};
 const mocks={vue:{...vue,onMounted(){}},'@vben/stores':{useAccessStore:()=>access},'#/api/request':{requestClient:client},'#/utils/menu-layout':{normalizeLayout:(_,items)=>items},'element-plus':{ElMessage:{success(){},warning(){}},ElMessageBox:{confirm:async()=>{}}}};
 const exports={};runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>mocks[name]||{},console,Error});
 const s={...exports.api,access,calls};s.ready.value=true;
 s.items.value=[{kind:'group',id:'g',label:'分组',icon:'lucide:folder',children:[{kind:'page',id:'/users',label:'用户',icon:'lucide:users'}]}];return s;
}

test('editing uses draft; apply changes icon only and marks dirty',()=>{
 const s=setup(),group=s.items.value[0],page=group.children[0];s.editIcon(page);s.iconDraft.value='lucide:star';
 assert.equal(page.icon,'lucide:users');s.applyIcon();assert.equal(page.icon,'lucide:star');assert.equal(page.label,'用户');assert.equal(group.icon,'lucide:folder');assert.equal(s.dirty.value,true);
});
test('clear preserves menu and saves explicit empty icon',async()=>{
 const s=setup(),group=s.items.value[0];s.clearIcon(group);assert.equal(group.icon,'');assert.equal(group.children.length,1);await s.save();
 assert.equal(s.calls[0].body.items[0].icon,'');assert.equal(s.calls[0].body.items[0].children[0].icon,'lucide:users');
});
test('invalid icon or missing permission does not modify menu',()=>{
 const s=setup(),group=s.items.value[0];s.editIcon(group);s.iconDraft.value='<svg onload=bad>';s.applyIcon();assert.equal(group.icon,'lucide:folder');assert.equal(s.dirty.value,false);
 s.iconDraft.value='lucide:star';s.access.accessCodes=[];s.applyIcon();s.clearIcon(group);assert.equal(group.icon,'lucide:folder');
});
test('cancelled draft and removed target do not change saved items',()=>{
 const s=setup(),group=s.items.value[0];s.editIcon(group);s.iconDraft.value='lucide:star';s.iconOpen.value=false;assert.equal(group.icon,'lucide:folder');
 s.editIcon(group);s.items.value=[];s.applyIcon();assert.equal(s.dirty.value,false);
});
