import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const vue = require('vue');
function setup() {
  const text=readFileSync(new URL('../error-logs.vue',import.meta.url),'utf8');
  const source=text.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]+'\nexports.api={deleteLogs,load,page,keyword,checkedIds,table,dialog,detailId,deleting};';
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const calls=[];const confirmations=[];const notices=[];const controls={allowed:true,cancel:false,remaining:20,confirm:undefined};
  const access=vue.reactive({accessCodes:['error-logs:delete']});
  const stubs={vue:{...vue,onMounted(){},onUnmounted(){}},'@vben/stores':{useAccessStore:()=>access},
    'element-plus':{ElMessageBox:{confirm:async(message)=>{confirmations.push(message);if(controls.cancel)throw 'cancel';if(controls.confirm)await controls.confirm;}},ElMessage:{success:m=>notices.push(m),error:m=>notices.push(m)}},
    '#/api/request':{requestClient:{
      get:async(url,config)=>{calls.push({method:'get',url,config});return {items:[],total:controls.remaining,health:null};},
      post:async(url,body)=>{calls.push({method:'post',url,body});return {deleted:body.ids.length,requested:body.ids.length};},
      delete:async(url)=>{calls.push({method:'delete',url});return {deleted:1,requested:1};}}}};
  const exports={};runInNewContext(js,{exports,require:name=>stubs[name]||{},navigator:{}});
  return {...exports.api,calls,confirmations,notices,controls,access};
}
test('deletion requires permission and confirmation; cancel does not write',async()=>{
  const s=setup();s.access.accessCodes=[];await s.deleteLogs(['a']);assert.equal(s.confirmations.length,0);
  s.access.accessCodes=['error-logs:delete'];s.controls.cancel=true;await s.deleteLogs(['a']);
  assert.equal(s.calls.length,0);assert.equal(s.deleting.value,false);
});
test('batch uses confirmed snapshot once and clears deleted detail',async()=>{
  const s=setup();let accept;s.controls.confirm=new Promise(done=>{accept=done;});
  s.checkedIds.value=['a','b'];s.dialog.value=true;s.detailId.value='a';
  const pending=s.deleteLogs(s.checkedIds.value);s.checkedIds.value.push('c');
  await s.deleteLogs(['d']);accept();await pending;
  const writes=s.calls.filter(c=>c.method==='post');assert.equal(writes.length,1);
  assert.deepEqual(Array.from(writes[0].body.ids),['a','b']);assert.equal(s.dialog.value,false);
  assert.equal(s.checkedIds.value.length,0);
});
test('single delete clamps last page and preserves filters',async()=>{
  const s=setup();s.page.value=2;s.keyword.value='model';s.controls.remaining=20;
  await s.deleteLogs(['a']);assert.equal(s.calls[0].method,'delete');assert.equal(s.page.value,1);
  assert.equal(s.keyword.value,'model');assert.equal(s.calls.at(-1).config.params.page,1);
});
test('filter and page changes clear selections immediately',()=>{
  const s=setup();let cleared=0;s.table.value={clearSelection(){cleared++;}};
  s.checkedIds.value=['a'];s.keyword.value='changed';assert.equal(s.checkedIds.value.length,0);
  s.checkedIds.value=['b'];s.page.value=3;assert.equal(s.checkedIds.value.length,0);assert.ok(cleared>=2);
});
