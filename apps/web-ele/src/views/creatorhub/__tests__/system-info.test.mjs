import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as vue from 'vue';

function setup(get) {
  const source = readFileSync(new URL('../system-info.vue', import.meta.url), 'utf8')
    .match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const hooks = [], exports = {};
  const mocks = {
    vue: { ...vue, onMounted: () => {}, onBeforeUnmount: (fn) => hooks.push(fn) },
    '@vben/common-ui': {}, 'element-plus': {}, '#/api/request': { requestClient: { get } },
  };
  runInNewContext(ts.transpileModule(source + '\nexports.api = {load, report, loading, error, memory, percent, osName: typeof osName === "undefined" ? undefined : osName, kernelVersion: typeof kernelVersion === "undefined" ? undefined : kernelVersion};', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: (name) => mocks[name] });
  return { ...exports.api, hooks };
}

test('刷新失败保留上次硬件结果，并明确显示失败状态', async () => {
  let fail = false;
  const s = setup(async (path) => {
    assert.equal(path, '/system/system-info');
    if (fail) throw new Error('offline');
    return { scope: 'backend', collected_at: 123, hostname: 'server-a' };
  });
  await s.load();
  fail = true;
  await s.load();
  assert.equal(s.report.value.hostname, 'server-a');
  assert.match(s.error.value, /刷新失败/);
  assert.equal(s.loading.value, false);
});

test('加载中重复刷新不重复探测；离开页面后忽略旧响应', async () => {
  let resolve, calls = 0;
  const s = setup(() => { calls++; return new Promise((done) => { resolve = done; }); });
  const pending = s.load();
  await s.load();
  assert.equal(calls, 1);
  s.hooks[0]();
  resolve({ scope: 'backend', collected_at: 123 });
  await pending;
  assert.equal(s.report.value, null);
});

test('首次加载失败不会伪造硬件信息，重试成功后清除错误', async () => {
  let fail = true;
  const s = setup(async () => {
    if (fail) throw new Error('offline');
    return { scope: 'backend', collected_at: 456 };
  });
  await s.load();
  assert.equal(s.report.value, null);
  assert.match(s.error.value, /读取失败/);
  fail = false;
  await s.load();
  assert.equal(s.error.value, '');
  assert.equal(s.report.value.collected_at, 456);
});

test('内存和显存零用量正常展示，未知及异常数值不显示NaN或伪造为零', () => {
  const s = setup(async () => ({}));
  assert.match(s.memory(0), /0\.00 GiB/);
  assert.equal(s.memory(null), '未读取');
  assert.equal(s.memory(undefined), '未读取');
  assert.equal(s.memory(Number.NaN), '未读取');
  assert.equal(s.memory(-1), '未读取');
  assert.equal(s.percent(0), '0.00%');
  assert.equal(s.percent(62.5), '62.50%');
  assert.equal(s.percent(null), '未读取');
  assert.equal(s.percent(undefined), '未读取');
  assert.equal(s.percent(101), '未读取');
});

test('刷新后替换内存及逐卡显存快照，后端缺失统计字段时保持兼容', async () => {
  let current = { scope: 'backend', collected_at: 1, gpu: { devices: [{ name: 'GPU', memory_mib: 8192 }] } };
  const s = setup(async () => current);
  await s.load();
  assert.equal(s.report.value.memory, undefined);
  current = { scope: 'backend', collected_at: 2, memory: { total_mib: 16384, used_mib: 8192, available_mib: 8192, usage_percent: 50 },
    gpu: { devices: [{ name: 'GPU', memory_mib: 8192, memory_used_mib: 0, memory_free_mib: 8192, memory_usage_percent: 0 }] } };
  await s.load();
  assert.equal(s.report.value.memory.usage_percent, 50);
  assert.equal(s.percent(s.report.value.gpu.devices[0].memory_usage_percent), '0.00%');
});

test('请求等待时间覆盖Windows分项探测超时，避免丢弃部分结果', async () => {
  let options;
  const s = setup(async (path, config) => { options = config; return { scope: 'backend', collected_at: 1 }; });
  await s.load();
  assert.equal(options?.timeout, 20000);
});

test('Linux发行版与内核分开展示，旧响应不伪造发行版', async () => {
  let current = { system: 'Linux', os_name: 'Ubuntu 24.04.4 LTS', kernel_version: '6.18.33.2-microsoft-standard-WSL2', release: '6.18.33.2-microsoft-standard-WSL2' };
  const s = setup(async () => current);
  await s.load();
  assert.equal(s.osName?.value, 'Ubuntu 24.04.4 LTS');
  assert.equal(s.kernelVersion?.value, current.release);
  current = { system: 'Linux', release: '6.8.0' };
  await s.load();
  assert.equal(s.osName.value, 'Linux（发行版未读取）');
  assert.equal(s.kernelVersion.value, '6.8.0');
});

test('Windows系统名与内核构建号独立，旧版本号不冒充内核', async () => {
  let current = { system: 'Windows', os_name: 'Windows 11', kernel_version: '10.0.26100', release: '11' };
  const s = setup(async () => current);
  await s.load();
  assert.equal(s.osName?.value, 'Windows 11');
  assert.equal(s.kernelVersion?.value, '10.0.26100');
  current = { system: 'Windows', release: '11' };
  await s.load();
  assert.equal(s.kernelVersion.value, null);
});
