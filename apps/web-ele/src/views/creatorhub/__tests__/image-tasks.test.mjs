import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const require=createRequire(import.meta.url), ts=require('typescript'), vue=require('vue');
const compile=(source)=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;

test('image task menu follows video menu and shares existing permission',()=>{
  const exports={};
  runInNewContext(compile(readFileSync(new URL('../../../router/routes/modules/operations.ts',import.meta.url),'utf8')),{exports});
  const routes=exports.default, group=routes.find(r=>r.name==='ImageOperations');
  assert.ok(group);
  assert.equal(group.meta.title,'图片任务');
  assert.ok(group.meta.order>routes.find(r=>r.name==='VideoOperations').meta.order);
  assert.equal(group.children.length,4);
  assert.deepEqual(Array.from(group.children,r=>r.meta.imageKind),['image_repair','image_large','image_compress','image_ocr']);
  assert.ok(group.children.every(r=>r.meta.permission==='image-records:read'));
});

function setup(){
  const route=vue.reactive({meta:{imageKind:'image_repair'}}), calls=[], pushed=[];
  const source=readFileSync(new URL('../image-records.vue',import.meta.url),'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const exports={}, mocks={vue:{...vue,onMounted(){},onBeforeUnmount(){}},
    'vue-router':{useRoute:()=>route,useRouter:()=>({push:(path)=>{pushed.push(path);}})},
    'element-plus':{},'#/api/request':{requestClient:{get:async(url,options)=>{calls.push(options.params);return {items:[],total:0};}}}};
  runInNewContext(compile(source+'\nexports.api={kind,page,dialog,load,selectKind};'),{exports,URL,require:(name)=>mocks[name]});
  return {...exports.api,route,calls,pushed};
}

test('switching image functions resets pagination and closes old preview',async()=>{
  const s=setup();await s.load();assert.equal(s.calls[0].kind,'image_repair');
  s.page.value=4;s.dialog.value=true;s.route.meta.imageKind='image_ocr';
  await vue.nextTick();await Promise.resolve();
  assert.equal(s.kind.value,'image_ocr');assert.equal(s.page.value,1);assert.equal(s.dialog.value,false);
  assert.equal(s.calls.at(-1).kind,'image_ocr');
});

test('function selector navigates to corresponding menu and rejects unknown kinds',()=>{
  const s=setup();s.selectKind('image_compress');
  assert.deepEqual(s.pushed,['/creatorhub/image-records/compress']);
  s.selectKind('unknown');assert.equal(s.pushed.length,1);
});
