import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';

function setup(){
 const source=readFileSync(new URL('../../../utils/business-record-deletion.ts',import.meta.url),'utf8');
 const access=vue.reactive({accessCodes:['subtitle:delete']}),resource=vue.ref('subtitle'),calls=[],controls={cancel:false,reloads:0};
 const client={post:async(url,body)=>{calls.push({url,body});return {deleted:1,deleted_ids:['one'],retained_files:0,failed:[{id:'two',message:'任务处理中'}]};}};
 const mocks={vue,'@vben/stores':{useAccessStore:()=>access},'#/api/request':{requestClient:client},
  'element-plus':{ElMessage:{success(){}},ElMessageBox:{confirm:async()=>{if(controls.cancel)throw Error('cancel');}}}};
 const exports={};runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>mocks[name],Error});
 return {...exports.useBusinessRecordDeletion(()=>resource.value,async()=>{controls.reloads++;}),access,resource,calls,controls,client};
}

test('batch and row deletion share confirmation and report partial failures',async()=>{
 const s=setup();s.selected.value=[{id:'one'},{id:'two'}];await s.remove(['one','two','one']);
 assert.deepEqual(JSON.parse(JSON.stringify(s.calls[0].body)),{ids:['one','two'],confirm:true});
 assert.equal(s.calls[0].url,'/operations/records/subtitle/delete');assert.equal(s.selected.value[0].id,'two');
 assert.match(s.error.value,/任务处理中/);assert.equal(s.controls.reloads,1);
});
test('cancelled confirmations and missing delete permission never call API',async()=>{
 const s=setup();s.controls.cancel=true;await s.remove(['one']);assert.equal(s.calls.length,0);
 s.controls.cancel=false;s.access.accessCodes=[];await s.remove(['one']);assert.equal(s.calls.length,0);
});
test('late deletion response cannot overwrite a different task page',async()=>{
 const s=setup();let finish,ready;const started=new Promise(resolve=>{ready=resolve;});
 s.client.post=()=>{ready();return new Promise(resolve=>{finish=resolve;});};
 const pending=s.remove(['one']);await started;
 s.resource.value='watermark';await vue.nextTick();finish({deleted:1,deleted_ids:['one'],retained_files:0,failed:[]});
 await pending;assert.equal(s.controls.reloads,0);assert.equal(s.error.value,'');
});

test('image deletion uses its own permission and endpoint',async()=>{
 const s=setup();s.resource.value='image-records';s.access.accessCodes=['image-records:delete'];
 await vue.nextTick();await s.remove(['one']);
 assert.equal(s.calls[0].url,'/image-records/delete');
});
