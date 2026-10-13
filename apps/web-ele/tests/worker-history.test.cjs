const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {parse,compileScript}=require('vue/compiler-sfc');
const vue=require('vue');
const ts=require('typescript');

function setup(){
 const source=fs.readFileSync(path.join(__dirname,'../src/views/creatorhub/worker-history.vue'),'utf8');
 const {descriptor}=parse(source);const code=ts.transpileModule(compileScript(descriptor,{id:'history'}).content,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const requests=[];const client={get(url,options){return new Promise(resolve=>requests.push({url,options,resolve}));},post(url){return new Promise(resolve=>requests.push({url,resolve}));}};
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,require(name){
  if(name==='vue')return {...vue,onBeforeUnmount(){}};
  if(name==='element-plus')return {};
  if(name==='#/api/request')return {requestClient:client};
  if(name==='#/utils/worker-timings')return {timingStages:()=>[],formatSeconds:value=>String(value)};
  throw Error(name);
 }});
 const props=vue.reactive({modelValue:true,nodeId:'a'.repeat(32),nodeName:'node'});
 const scope=vue.effectScope();const state=scope.run(()=>module.exports.default.setup(props,{expose(){},emit(){}}));
 return {props,state,requests,scope};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('切换节点后旧响应不会覆盖新节点记录',async()=>{
 const s=setup();
 try{
  s.props.nodeId='b'.repeat(32);await vue.nextTick();
  assert.equal(s.requests.length,2);
  s.requests[1].resolve({items:[{id:'new'}],total:1});await flush();
  s.requests[0].resolve({items:[{id:'old'}],total:1});await flush();
  assert.equal(s.state.rows.value[0].id,'new');
 }finally{s.scope.stop();}
});

test('关闭记录面板后不接受迟到的预览授权',async()=>{
 const s=setup();
 try{
  s.requests[0].resolve({items:[],total:0});await flush();
  const pending=s.state.openPreview({id:'c'.repeat(32),kind:'video.subtitle',preview_allowed:true,input_available:true,result_available:true});
  s.props.modelValue=false;await vue.nextTick();
  s.requests[1].resolve({input_url:'https://api.example/input',result_url:'https://api.example/result'});
  await pending;
  assert.equal(s.state.preview.value,undefined);
 }finally{s.scope.stop();}
});
