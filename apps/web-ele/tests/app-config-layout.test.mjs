import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configTabs} from '../src/utils/app-config-layout.ts';

test('数据库标题与排序决定标签页、卡片及字段位置',()=>{
 const groups=[
  {id:1,code:'general',label:'自定义基础',parent_id:null,sort_order:20},
  {id:2,code:'features',label:'自定义功能',parent_id:null,sort_order:10},
  {id:3,code:'video',label:'视频卡片',parent_id:2,sort_order:1},
 ];
 const field=(key,group_id,sort_order)=>({key,label:key,description:'说明',group_id,sort_order,control:'input',format:''});
 const tabs=configTabs({groups,fields:[field('b',3,20),field('a',3,10),field('c',1,1)]});
 assert.deepEqual(tabs.map(tab=>tab.label),['自定义功能','自定义基础']);
 assert.equal(tabs[0].children[0].label,'视频卡片');
 assert.deepEqual(tabs[0].children[0].fields.map(item=>item.key),['a','b']);
 assert.equal(tabs[1].fields[0].key,'c');
 assert.equal(tabs[0].fields.length,0);
});

test('未知分组不静默丢弃配置项',()=>{
 assert.throws(()=>configTabs({groups:[],fields:[{key:'a',group_id:99}]}),/分组/);
});
