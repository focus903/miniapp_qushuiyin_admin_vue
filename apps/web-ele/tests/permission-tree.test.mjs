import {test} from 'node:test';
import assert from 'node:assert/strict';
import {permissionNodes,permissionLeaves,selectedPermissions} from '../src/utils/permission-tree.ts';
test('模块、页面、操作三级树只提交叶子权限',()=>{
 const nodes=permissionNodes([{code:'parses:read',name:'查看',module:'解析管理',page:'用户解析记录'},{code:'parses:delete',name:'删除',module:'解析管理',page:'用户解析记录'},{code:'files:read',name:'查看',module:'解析管理',page:'关联文件'}]);
 assert.equal(nodes.length,1);assert.equal(nodes[0].children.length,2);assert.equal(nodes[0].children[0].children.length,2);
 assert.deepEqual(permissionLeaves(nodes),['parses:read','parses:delete','files:read']);
 assert.deepEqual(selectedPermissions([nodes[0].id,nodes[0].children[0].id,'parses:read','parses:read'],nodes),['parses:read']);
});
test('未知已选权限显式展示且回显不增权、不丢失',()=>{
 const selected=['parses:read','legacy:custom'];const nodes=permissionNodes([{code:'parses:read',name:'查看',module:'解析管理',page:'用户解析记录'}],selected);
 assert.deepEqual(selectedPermissions(selected,nodes),selected);assert.equal(nodes[1].label,'未知权限');assert.match(nodes[1].children[0].children[0].label,/legacy:custom/);assert.deepEqual(selectedPermissions([],nodes),[]);
});
