const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {parse,compileScript}=require('vue/compiler-sfc');
const vue=require('vue');
const ts=require('typescript');

function setup(modelValue,field={key:'wxTaskTemplateFields',control:'json'}){
 const source=fs.readFileSync(path.join(__dirname,'../src/components/app-config-field.vue'),'utf8');
 const {descriptor}=parse(source);
 const content=compileScript(descriptor,{id:'config-field-test'}).content;
 const code=ts.transpileModule(content,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,require(name){if(name==='vue')return vue;if(name==='element-plus')return {};throw Error(name);}});
 const events=[];
 const props=vue.reactive({field,modelValue});
 const scope=vue.effectScope();
 const state=scope.run(()=>module.exports.default.setup(props,{expose(){},emit:(...args)=>events.push(args)}));
 return {state,events,scope,props};
}

test('映射重复或空字段不会覆盖已保存的值，修正后提交全部映射',()=>{
 const s=setup({thing3:'title'});
 try{
  assert.equal(s.state.mappings.value[0].key,'thing3');
  s.state.addMapping();
  assert.equal(s.events.at(-1)[1],false);
  assert.equal(s.events.some(event=>event[0]==='update:modelValue'),false);
  s.state.mappings.value[1].key='thing3';s.state.changeMappings();
  assert.match(s.state.mappingError.value,/重复/);
  s.state.mappings.value[1].key='thing12';s.state.mappings.value[1].value='status';s.state.changeMappings();
  const saved=s.events.findLast(event=>event[0]==='update:modelValue')[1];
  assert.equal(saved.thing3,'title');assert.equal(saved.thing12,'status');
  s.state.removeMapping(0);
  assert.equal(s.events.at(-1)[1].thing3,undefined);
 }finally{s.scope.stop();}
});

test('服务端重新加载的模板映射会替换原映射',async()=>{
 const s=setup({thing3:'title'});
 try{s.props.modelValue={time14:'finished'};await vue.nextTick();assert.equal(s.state.mappings.value.length,1);assert.equal(s.state.mappings.value[0].key,'time14');}
 finally{s.scope.stop();}
});

test('月日控件使用固定闰年回显二月二十九，保存时不携带年份',()=>{
 const s=setup('02-29',{key:'homeNotice',control:'time',format:'MM-DD'});
 try{
  assert.equal(s.state.calendarValue(),'2000-02-29');
  const date=new Date(s.state.calendarValue()+'T00:00:00');
  assert.equal(date.getMonth(),1);assert.equal(date.getDate(),29);
  s.state.changeCalendar('2000-02-29');
  assert.equal(s.events.at(-1)[1],'02-29');
  s.state.changeCalendar(null);
  assert.equal(s.events.at(-1)[1],'');
 }finally{s.scope.stop();}
});

test('JSON控件从元数据选项取得默认值，实际保存仍是字段映射',()=>{
 const s=setup({}, {key:'wxTaskTemplateFields',control:'json',options:[{label:'完成时刻',value:'finished'}]});
 try{
  s.state.addMapping();
  assert.equal(s.state.mappings.value[0].value,'finished');
  s.state.mappings.value[0].key='time14';s.state.changeMappings();
  const saved=s.events.at(-1)[1];
  assert.equal(saved.time14,'finished');
  assert.equal(saved.options,undefined);
 }finally{s.scope.stop();}
});


test('真实组件接收空字符串时保持跟随默认，不转换为布尔值',()=>{
 const compiler=require('vue/compiler-sfc');
 compiler.registerTS(()=>ts);
 const filename=path.resolve(__dirname,'../src/components/app-config-field.vue');
 const {descriptor}=compiler.parse(fs.readFileSync(filename,'utf8'),{filename});
 const content=compiler.compileScript(descriptor,{id:'prop-casting-test',fs:{fileExists:fs.existsSync,readFile:file=>fs.readFileSync(file,'utf8')}}).content;
 const code=ts.transpileModule(content,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,require(name){if(name==='vue')return vue;if(name==='element-plus')return {};throw Error(name);}});
 const renderer=vue.createRenderer({createComment:()=>({}),insert(){},remove(){},parentNode:()=>null,nextSibling:()=>null});
 for(const value of ['',false,true,0,'cache','direct']){
  let received;
  const component={...module.exports.default,setup(props){received=props.modelValue;return()=>null;}};
  const app=renderer.createApp(component,{field:{key:'douyinOutputMode',control:'select'},modelValue:value});
  app.mount({});
  assert.equal(received,value);
  app.unmount();
 }
});
