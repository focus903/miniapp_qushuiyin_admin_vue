import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const vue = require('vue');
function setup() {
  const text = readFileSync(new URL('../scheduled-tasks.vue', import.meta.url), 'utf8');
  const source = text.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1] + '\nexports.api={load,save,drafts,tasks,dirty,validation,values,time};';
  const item = { code: 'video_cache_cleanup', name: '视频缓存', description: '', retention_help: '', warning: '', minimum_interval: 60, enabled: true, mode: 'interval', interval_seconds: 600, daily_time: '03:00', retention_seconds: 600, revision: 1, state: { status: 'idle', last_started: 0, last_finished: 0, next_run: 0, error: null } };
  const controls = { item, conflict: false };
  const access = vue.reactive({ accessCodes: ['scheduled-tasks:update'] });
  const calls = [];
  const mocks = { vue: { ...vue, onMounted() {} }, '@vben/stores': { useAccessStore: () => access }, 'element-plus': { ElMessage: { success() {}, error() {} } }, '#/api/request': { requestClient: {
    get: async () => ({ timezone: 'Asia/Shanghai', reload_seconds: 30, items: [controls.item] }),
    put: async (url, body) => { calls.push({ url, body }); if (controls.conflict) throw Error('409'); return { ...controls.item, ...body, revision: body.revision + 1 }; },
  } } };
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: (name) => mocks[name] || {} });
  return { ...exports.api, access, controls, calls };
}
test('ten-minute retention round trips and save only sends configuration fields', async () => {
  const s = setup(); await s.load();
  const draft = s.drafts.video_cache_cleanup;
  assert.equal(draft.retentionValue, 10); assert.equal(draft.retentionUnit, 60);
  draft.retentionValue = 20; await s.save(s.tasks.value[0]);
  assert.equal(s.calls[0].body.retention_seconds, 1200);
  assert.deepEqual(Object.keys(s.calls[0].body).sort(), ['daily_time', 'enabled', 'interval_seconds', 'mode', 'retention_seconds', 'revision']);
  assert.equal(s.dirty('video_cache_cleanup'), false);
});
test('refresh updates runtime while preserving dirty form and original revision', async () => {
  const s = setup(); await s.load();
  s.drafts.video_cache_cleanup.intervalValue = 20;
  s.controls.item = { ...s.controls.item, revision: 2, interval_seconds: 1800, state: { ...s.controls.item.state, status: 'running' } };
  await s.load();
  assert.equal(s.drafts.video_cache_cleanup.intervalValue, 20);
  assert.equal(s.drafts.video_cache_cleanup.config.revision, 1);
  assert.equal(s.tasks.value[0].state.status, 'running');
  s.controls.conflict = true; await s.save(s.tasks.value[0]);
  assert.equal(s.dirty('video_cache_cleanup'), true);
  assert.equal(s.drafts.video_cache_cleanup.config.revision, 1);
});
test('read-only accounts cannot save and invalid intervals are rejected', async () => {
  const s = setup(); await s.load();
  s.access.accessCodes = []; await s.save(s.tasks.value[0]); assert.equal(s.calls.length, 0);
  s.access.accessCodes = ['scheduled-tasks:update'];
  s.drafts.video_cache_cleanup.intervalValue = 1; s.drafts.video_cache_cleanup.intervalUnit = 1;
  await s.save(s.tasks.value[0]); assert.equal(s.calls.length, 0);
  assert.ok(s.validation(s.tasks.value[0]).includes('60'));
});
test('Unix seconds render in Beijing time and zero means no execution', () => {
  const s = setup();
  assert.equal(s.time(0), '暂无');
  assert.equal(s.time(Date.UTC(2026, 9, 13, 0, 0) / 1000), '2026/10/13 08:00:00');
});
test('backend interval and retention bounds reject out-of-range submissions', async () => {
  const s = setup(); await s.load();
  const draft = s.drafts.video_cache_cleanup;
  draft.intervalUnit = 1; draft.retentionUnit = 1;
  for (const value of [59, 604801]) {
    draft.intervalValue = value; await s.save(s.tasks.value[0]);
    assert.ok(s.validation(s.tasks.value[0]));
  }
  draft.intervalValue = 604800;
  for (const value of [59, 31536001]) {
    draft.retentionValue = value; await s.save(s.tasks.value[0]);
    assert.ok(s.validation(s.tasks.value[0]));
  }
  assert.equal(s.calls.length, 0);
  for (const value of [60, 31536000]) {
    draft.retentionValue = value; assert.equal(s.validation(s.tasks.value[0]), '');
  }
  draft.config.retention_seconds = null;
  assert.equal(s.validation(s.tasks.value[0]), '');
});
test('read-only notice depends on permission independently from revision notice', () => {
  const source = readFileSync(new URL('../scheduled-tasks.vue', import.meta.url), 'utf8');
  assert.match(source, /<p v-if="!canSave" class="help">当前账号只有查看权限/);
});
