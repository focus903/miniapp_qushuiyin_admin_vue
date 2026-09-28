import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
const require=createRequire(import.meta.url);const ts=require('typescript');const vue=require('vue');
function setup(){
 const text=readFileSync(new URL('../menu-layout.vue',import.meta.url),'utf8');
 const source=text.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]+'\nexports.api={items,revision,ready,dirty,save,move,shift,removeGroup,allowDrop,canEdit};';
 const calls=[];const access=vue.reactive({accessCodes:['menu-layout:update']});
 const controls={conflict:false,cancel:false};
 const mocks={vue:{...vue,onMounted(){}},'@vben/stores':{useAccessStore:()=>access},
  '#/utils/menu-layout':{pageCatalog:()=>new Map(),normalizeLayout:(routes,items)=>items??[]},
  '#/router/routes/modules/creatorhub':{default:[]},
  '#/api/request':{requestClient:{put:async(url,body)=>{calls.push(body);if(controls.conflict)throw Error('409');return {revision:body.revision+1,items:body.items,ready:true};}}},
  'element-plus':{ElMessageBox:{confirm:async()=>{if(controls.cancel)throw 'cancel';}},ElMessage:{success(){}}}};
 const exports={};runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>mocks[n]||{}});
 const api=exports.api;api.ready.value=true;
 api.items.value=[{kind:'group',id:'g',label:'组',children:[{kind:'page',id:'/a'}]},{kind:'page',id:'/b'}];
 return {...api,calls,access,controls};
}
test('move to root and into another group; nonempty group cannot be deleted',()=>{
 const s=setup();const group=s.items.value[0];s.removeGroup(group);assert.equal(s.items.value.length,2);
 s.move(group.children[0],'');assert.equal(group.children.length,0);assert.equal(s.items.value.length,3);
 s.move(s.items.value[2],'g');assert.equal(group.children.length,1);assert.equal(s.items.value.length,2);
 s.shift(s.items.value[1],-1);assert.equal(s.items.value[0].id,'/b');assert.equal(s.dirty.value,true);
});
test('dragging forbids nesting groups and dropping inside pages',()=>{
 const s=setup();const group={data:{kind:'group'},level:1};const page={data:{kind:'page'},level:2};
 assert.equal(s.allowDrop(group,page,'before'),false);assert.equal(s.allowDrop(group,group,'inner'),false);
 assert.equal(s.allowDrop(page,page,'inner'),false);assert.equal(s.allowDrop(page,group,'inner'),true);
});
test('conflict keeps unsaved layout; cancellation and permissions prevent writes',async()=>{
 const s=setup();s.dirty.value=true;s.controls.cancel=true;await s.save();assert.equal(s.calls.length,0);
 s.controls.cancel=false;s.controls.conflict=true;await assert.rejects(s.save());assert.equal(s.dirty.value,true);assert.equal(s.revision.value,0);
 s.access.accessCodes=[];await s.save();assert.equal(s.calls.length,1);
});
test('successful save always sends database items and updates version',async()=>{
 const s=setup();await s.save();assert.equal(s.revision.value,1);assert.equal(s.dirty.value,false);
 await s.save();assert.ok(Array.isArray(s.calls[1].items));assert.equal(s.calls[1].revision,1);
});
