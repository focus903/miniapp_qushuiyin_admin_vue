import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rangeFor, createDateShortcuts} from '../src/utils/date-shortcuts.ts';
const parts=d=>[d.getFullYear(),d.getMonth()+1,d.getDate(),d.getHours(),d.getMinutes(),d.getSeconds(),d.getMilliseconds()];
test('今天昨天和一周覆盖完整自然日',()=>{
 const now=new Date(2026,8,18,15,20);
 assert.deepEqual(parts(rangeFor('today',now)[0]),[2026,9,18,0,0,0,0]);
 assert.deepEqual(parts(rangeFor('yesterday',now)[1]),[2026,9,17,23,59,59,999]);
 assert.deepEqual(parts(rangeFor('week',now)[0]),[2026,9,12,0,0,0,0]);
});
test('自然月与滚动月处理跨年、月末及闰年',()=>{
 assert.deepEqual(parts(rangeFor('previousMonth',new Date(2026,0,15))[0]),[2025,12,1,0,0,0,0]);
 assert.deepEqual(parts(rangeFor('previousMonth',new Date(2024,2,31))[1]),[2024,2,29,23,59,59,999]);
 assert.deepEqual(parts(rangeFor('month',new Date(2024,2,31))[0]),[2024,2,29,0,0,0,0]);
 assert.deepEqual(parts(rangeFor('threeMonths',new Date(2026,4,31))[0]),[2026,2,28,0,0,0,0]);
});
test('范围和单日快捷选项返回对应值类型',()=>{
 const ranges=createDateShortcuts(true);
 assert.deepEqual(ranges.map(r=>r.text),['今天','昨天','一周','本月','上个月','一个月','近三个月','近六个月']);
 assert.ok(ranges.every(r=>Array.isArray(r.value())));
 assert.ok(createDateShortcuts(false).every(r=>r.value() instanceof Date));
});
