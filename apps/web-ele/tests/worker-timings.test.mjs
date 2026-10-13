import {test} from 'node:test';
import assert from 'node:assert/strict';
import {timingStages,formatSeconds} from '../src/utils/worker-timings.ts';

test('耗时保留零值，按固定顺序展示且不求和',()=>{
  const rows=timingStages({processing_wall:10,repair:8,lama_inpaint:6,encode:0});
  assert.deepEqual(rows.map(row=>row.stage),['processing_wall','repair','encode','lama_inpaint']);
  assert.equal(rows[2].formatted,'0.000 秒');
  assert.equal(formatSeconds(undefined),'—');
});

test('未知和非法字段不展示',()=>{
  assert.deepEqual(timingStages({unknown:20,repair:NaN,encode:-1}),[]);
});
