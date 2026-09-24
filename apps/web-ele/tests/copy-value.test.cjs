const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');const {parse,compileScript}=require('vue/compiler-sfc');const ts=require('typescript');
function setup(clipboard,legacy=true){
 const source=fs.readFileSync(path.join(__dirname,'../src/components/copy-value.vue'),'utf8');const {descriptor}=parse(source);const content=compileScript(descriptor,{id:'copy-test'}).content;
 const code=ts.transpileModule(content,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const calls={success:0,warning:0,removed:0,legacy:0};const module={exports:{}};let field;
 const document={activeElement:{focus(){}},body:{append(){}},createElement(){field={style:{},select(){},remove(){calls.removed++}};return field;},execCommand(){calls.legacy++;calls.value=field.value;return legacy;}};
 vm.runInNewContext(code,{module,exports:module.exports,navigator:{clipboard},document,window:{getSelection:()=>null},require(name){if(name==='vue')return {defineComponent:v=>v,ref:value=>({value}),computed:fn=>({get value(){return fn()}})};if(name==='element-plus')return {ElMessage:{success(){calls.success++},warning(){calls.warning++}}};throw Error(name)}});
 const value='https://cdn.example/video.mp4?token=a%2Fb&x=1';const instance=module.exports.default.setup({value,label:'复制'},{expose(){}});return {calls,instance,value};
}
test('复制完整地址，保留查询参数和编码',async()=>{let value;const s=setup({writeText:async text=>value=text});await s.instance.copy();assert.equal(value,s.value);assert.equal(s.calls.success,1);assert.equal(s.calls.legacy,0)});
test('浏览器剪贴板拒绝时兼容复制并清理临时元素',async()=>{const s=setup({writeText:async()=>{throw Error('denied')}});await s.instance.copy();assert.equal(s.calls.value,s.value);assert.equal(s.calls.success,1);assert.equal(s.calls.removed,1)});
test('两种方式均失败时只提示失败且恢复按钮',async()=>{const s=setup(undefined,false);await s.instance.copy();assert.equal(s.calls.success,0);assert.equal(s.calls.warning,1);assert.equal(s.calls.removed,1);assert.equal(s.instance.busy.value,false)});
