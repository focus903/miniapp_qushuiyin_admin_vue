import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
const require=createRequire(import.meta.url);const ts=require('typescript');
const source=readFileSync(new URL('./menu-layout.ts',import.meta.url),'utf8');
const exports={};runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
const {normalizeLayout,applyLayout}=exports;
const component=()=>{};
const routes=[{name:'A',path:'/a',component,meta:{title:'A',permission:'a:read',order:0}},
 {name:'G',path:'/g',meta:{title:'Group',order:1},children:[{name:'B',path:'/b',component,meta:{title:'B',permission:'b:read'}}]}];
test('move pages between groups without changing URLs, components or permissions',()=>{
 const tree=[{kind:'group',id:'custom-x',label:'常用',children:[{kind:'page',id:'/a',label:'数据库A'}]},{kind:'page',id:'/b',label:'数据库B'}];
 const result=applyLayout(routes,tree);assert.equal(result[0].children[0].component,component);
 assert.equal(result[0].children[0].meta.permission,'a:read');assert.equal(result[0].children[0].path,'/a');
 assert.equal(result[1].path,'/b');assert.equal(result[1].meta.order,1);assert.equal(routes[0].meta.order,0);
});
test('invalid or uninitialized database layout fails instead of falling back',()=>{
 assert.throws(()=>applyLayout(routes,null));
 assert.throws(()=>applyLayout(routes,[]));
 assert.throws(()=>applyLayout(routes,[{kind:'page',id:'/evil',label:'未知'}]));
 assert.throws(()=>applyLayout(routes,[{kind:'page',id:'/a',label:'A'},{kind:'page',id:'/a',label:'A'}]));
});
test('database controls labels and no code pages are appended',()=>{
 const result=applyLayout(routes,[{kind:'page',id:'/b',label:'数据库名称',icon:'lucide:star'}]);
 assert.equal(result.length,1);assert.equal(result[0].meta.title,'数据库名称');assert.equal(result[0].meta.icon,'lucide:star');
 const empty=normalizeLayout(routes,[{kind:'group',id:'empty',label:'空分组',children:[]}]);
 assert.equal(empty.length,1);assert.equal(empty[0].children.length,0);
});
