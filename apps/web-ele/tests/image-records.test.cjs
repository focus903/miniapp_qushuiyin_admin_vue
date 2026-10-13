const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {parse,compileScript}=require('vue/compiler-sfc');
const vue=require('vue');
const ts=require('typescript');

function setup(){
 const source=fs.readFileSync(path.join(__dirname,'../src/views/creatorhub/image-records.vue'),'utf8');
 const {descriptor}=parse(source);const code=ts.transpileModule(compileScript(descriptor,{id:'history'}).content,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const requests=[];const client={get(url,options){return new Promise(resolve=>requests.push({url,options,resolve}));},post(url){return new Promise(resolve=>requests.push({url,resolve}));}};
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,require(name){
  if(name==='vue')return {...vue,onBeforeUnmount(){},onMounted(callback){callback();}};
  if(name==='element-plus')return {};
  if(name==='#/api/request')return {requestClient:client};
  if(name==='#/utils/worker-timings')return {timingStages:()=>[],formatSeconds:value=>String(value)};
  throw Error(name);
 }});
 const props={};
 const scope=vue.effectScope();const state=scope.run(()=>module.exports.default.setup(props,{expose(){},emit(){}}));
 return {props,state,requests,scope};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('图片记录筛选请求保留原始业务类型和精确用户查询',async()=>{
 const s=setup();try{
  s.state.kind.value='image_ocr';s.state.openid.value=' user ';s.state.status.value='failed';s.state.search();
  const r=s.requests[1];assert.equal(r.url,'/image-records');assert.equal(r.options.params.kind,'image_ocr');assert.equal(r.options.params.openid,'user');assert.equal(r.options.params.status,'failed');
  r.resolve({items:[{id:'new'}],total:1});await flush();s.requests[0].resolve({items:[{id:'old'}],total:1});await flush();
  assert.equal(s.state.rows.value[0].id,'new');
 }finally{s.scope.stop();}
});
test('关闭图片详情后不接受迟到预览，URL不含令牌',async()=>{
 const s=setup();try{
  const pending=s.state.view({id:'a'.repeat(32)});s.state.closePreview();
  s.requests[1].resolve({input_url:'https://api.example/input',result_url:''});await pending;
  assert.equal(s.state.detail.value,undefined);
  assert.equal(s.requests[1].url,'/image-records/'+('a'.repeat(32))+'/preview');
 }finally{s.scope.stop();}
});
