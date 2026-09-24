import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allowedRoutes} from '../src/utils/route-permissions.ts';
const routes=[{path:'/parses',children:[{path:'/parse-records',meta:{permission:'parses:read'}},{path:'/parse-files',meta:{permission:'files:read'}}]},{path:'/system',children:[{path:'/creatorhub/roles',meta:{permission:'roles:read'}}]}];
test('单页权限仅保留相应菜单且不修改原路由',()=>{const result=allowedRoutes(routes,['files:read']);assert.equal(result.length,1);assert.deepEqual(result[0].children.map(r=>r.path),['/parse-files']);assert.equal(routes[0].children.length,2);});
test('操作权限不替代页面查看权限，空父菜单移除',()=>{assert.deepEqual(allowedRoutes(routes,['parses:delete','roles:update']),[]);});

import operations from '../src/router/routes/modules/operations.ts';
import catalog from '../src/router/routes/modules/catalog.ts';
import system from '../src/router/routes/modules/system.ts';
const leaves=routes=>routes.flatMap(route=>route.children?leaves(route.children):[route]);
test('真实菜单各查看权限仅开放其对应叶子路径',()=>{
 const all=[...operations,...catalog,...system];
 const expected={'parses:read':'/parse-records','resources:read':'/parse-resources','files:read':'/parse-files','subtitle:read':'/video-tasks','watermark:read':'/watermark-tasks','orders:read':'/points/orders','admins:read':'/creatorhub/system','roles:read':'/creatorhub/roles','tts-voices:read':'/tts/voices','storage-uploads:read':'/storage/uploads'};
 for(const [code,path] of Object.entries(expected))assert.deepEqual(leaves(allowedRoutes(all,[code])).map(route=>route.path),[path]);
});
