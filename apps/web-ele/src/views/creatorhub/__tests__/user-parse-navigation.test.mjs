import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as vue from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

function setup(resource = 'users', query = {}) {
  const text = readFileSync(new URL('../operations.vue', import.meta.url), 'utf8');
  const source = text.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
    + '\nexports.api={parseRecordsLocation:typeof parseRecordsLocation === "undefined" ? undefined : parseRecordsLocation,kind,filters,page,dates,trashed,rows,visible,load};';
  const route = vue.reactive({ meta: { resource, title: '测试' }, query, fullPath: `/${resource}` });
  const access = vue.reactive({ accessCodes: ['users:read', 'parses:read'] });
  const calls = [];
  const requestClient = { get: async (url, options) => { calls.push({ url, options }); return { items: [], total: 0 }; } };
  const mocks = {
    vue: { ...vue, onUnmounted() {}, onDeactivated() {} },
    'vue-router': { useRoute: () => route }, '@vben/stores': { useAccessStore: () => access },
    '#/api/request': { requestClient }, '#/utils/business-record-deletion': { useBusinessRecordDeletion: () => ({
      allowed: vue.ref(false), busy: vue.ref(false), error: vue.ref(''), reset() {},
    }) },
  };
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: (name) => mocks[name] || {}, Error, console });
  return { ...exports.api, route, access, requestClient, calls };
}

test('成功和失败分别生成带用户及状态的解析记录链接', () => {
  const s = setup();
  for (const status of ['success', 'failed']) {
    assert.deepEqual(JSON.parse(JSON.stringify(s.parseRecordsLocation({ openid: 'user/a+?&' }, status))), {
      path: '/parse-records', query: { openid: 'user/a+?&', status },
    });
  }
  assert.equal(s.visible.value, false);
});

test('真实路由编码保留OpenId特殊字符，状态随链接传递', () => {
  const s = setup();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/parse-records', component: {} }] });
  const target = router.resolve(s.parseRecordsLocation({ openid: 'user/a+?&' }, 'failed'));
  const url = new URL(target.href, 'https://admin.example');
  assert.equal(url.pathname, '/parse-records');
  assert.equal(url.searchParams.get('openid'), 'user/a+?&');
  assert.equal(url.searchParams.get('status'), 'failed');
});

test('直接进入解析记录时读取路由筛选，并从第一页查询', async () => {
  const s = setup('parses', { openid: 'user-one', status: 'failed' });
  await vue.nextTick();
  const call = s.calls.at(-1);
  assert.equal(call.url, '/operations/records/parses');
  assert.equal(call.options.params.openid, 'user-one');
  assert.equal(call.options.params.status, 'failed');
  assert.equal(call.options.params.page, 1);
  assert.equal(s.visible.value, false);
});

test('从用户列表跳转后应用筛选，同页面换用户和状态也重新查询', async () => {
  const s = setup();
  await vue.nextTick();
  s.route.query = { openid: 'user-one', status: 'success' };
  s.route.meta.resource = 'parses';
  s.route.fullPath = '/parse-records?openid=user-one&status=success';
  await vue.nextTick();
  assert.equal(s.filters.value.openid, 'user-one');
  assert.equal(s.calls.at(-1).options.params.status, 'success');
  s.page.value = 4;
  s.trashed.value = true;
  s.filters.value.platform = 'douyin';
  s.dates.value = [new Date('2026-10-01'), new Date('2026-10-02')];
  s.route.query = { openid: 'user-two', status: 'failed' };
  await vue.nextTick();
  const call = s.calls.at(-1);
  assert.equal(call.options.params.openid, 'user-two');
  assert.equal(call.options.params.status, 'failed');
  assert.equal(call.options.params.page, 1);
  assert.equal(call.options.params.trashed, false);
  assert.equal(call.options.params.platform, undefined);
  assert.equal(call.options.params.start, 0);
});

test('无解析查看权限不请求目标列表，异常路由筛选不会污染其他页面', async () => {
  const s = setup('users', { openid: ['one', 'two'], status: 'not-a-status' });
  await vue.nextTick();
  assert.equal(s.filters.value.openid, '');
  assert.equal(s.filters.value.status, '');
  s.access.accessCodes = ['users:read'];
  const count = s.calls.length;
  s.route.meta.resource = 'parses';
  await vue.nextTick();
  assert.equal(s.calls.length, count);
  assert.equal(s.filters.value.openid, '');
  assert.equal(s.filters.value.status, '');
});

test('跳转后的解析记录不能被较晚完成的用户列表响应覆盖', async () => {
  const s = setup();
  await vue.nextTick();
  let finish;
  s.requestClient.get = (url) => url.endsWith('/users')
    ? new Promise((resolve) => { finish = resolve; })
    : Promise.resolve({ items: [{ id: 'parse-new' }], total: 1 });
  const pending = s.load();
  s.route.query = { openid: 'user-one', status: 'success' };
  s.route.meta.resource = 'parses';
  await vue.nextTick();
  finish({ items: [{ openid: 'old-user' }], total: 1 });
  await pending;
  assert.equal(s.rows.value[0].id, 'parse-new');
});
