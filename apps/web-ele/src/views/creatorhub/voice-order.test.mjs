import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveGroup } from './voice-order.ts';
test('不连续选中项向后移动，保持列表原顺序',()=>assert.deepEqual(moveGroup([1,2,3,4,5],[3,1],5,true),[2,4,5,1,3]));
test('整组向前移动',()=>assert.deepEqual(moveGroup([1,2,3,4,5],[4,5],2,false),[1,4,5,2,3]));
test('落在组内不改变顺序',()=>assert.deepEqual(moveGroup([1,2,3],[1,2],2,true),[1,2,3]));
test('无效目标或空选择不改变顺序',()=>{assert.deepEqual(moveGroup([1,2],[],2,false),[1,2]);assert.deepEqual(moveGroup([1,2],[1],9,false),[1,2]);});
