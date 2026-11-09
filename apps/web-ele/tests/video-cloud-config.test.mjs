import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// oxlint-disable-next-line vitest/no-import-node-test -- These standalone tests run with node --test.
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import * as vue from 'vue';

import ts from 'typescript';
import { compileScript, compileTemplate, parse } from 'vue/compiler-sfc';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));

function setup({ active = true, mode = 'cloud' } = {}) {
  const filename = path.join(
    testDirectory,
    '../src/components/video-cloud-config.vue',
  );
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'));
  assert.deepEqual(
    compileTemplate({
      source: descriptor.template.content,
      filename,
      id: 'video-test',
    }).errors,
    [],
  );
  const code = ts.transpileModule(
    compileScript(descriptor, { id: 'video-test' }).content,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    },
  ).outputText;
  const calls = [];
  const common = {
    mode: 'cloud',
    subtitle_execution: 'worker',
    watermark_execution: 'local',
    timeout_seconds: 20,
    subtitle_tool: 'erase-video-subtitle-pro',
    check_task_id: '',
    subtitle_template_id: 0,
    watermark_template_id: 0,
    secret_id: '',
    secret_key: '',
    api_key: '',
  };
  const tencent = {
    ...common,
    provider: 'tencent_mps',
    secret_id: '************',
    secret_key: '************',
    subtitle_template_id: 11,
    watermark_template_id: 22,
    configured: true,
    endpoint: 'https://mps.tencentcloudapi.com',
  };
  const volc = {
    ...common,
    provider: 'volc_mediakit',
    api_key: '************',
    configured: true,
    endpoint: 'https://mediakit.cn-beijing.volces.com',
  };
  const saved = {
    ...tencent,
    mode,
    local_values: {
      videoSubtitleEngine: 'lama',
      videoWatermarkEngine: 'opencv',
    },
    storage_ready: true,
    execution_ready: false,
    provider_configs: { tencent_mps: tencent, volc_mediakit: volc },
  };
  const client = {
    get: async () => structuredClone(saved),
    put: async (url, data) => {
      calls.push(['put', url, data]);
      return structuredClone(saved);
    },
    post: async (url, data, options) => {
      calls.push(['post', url, data, options]);
      if (url.endsWith('/check-environment')) {
        return {
          subtitle: { ready: null, message: '请在远程节点验证' },
          watermark: { ready: true, message: 'OpenCV 可用' },
        };
      }
      return { ok: true, message: '检查通过' };
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    AbortController,
    module,
    exports: module.exports,
    require(name) {
      if (name === 'vue')
        return { ...vue, onActivated() {}, onDeactivated() {}, onMounted() {} };
      if (name === 'element-plus') return { ElMessage: { success() {} } };
      if (name === '#/api/request') return { requestClient: client };
      if (name === '#/components/copy-value.vue') return {};
      throw new Error(name);
    },
  });
  const scope = vue.effectScope();
  const props = vue.reactive({ active, disabled: false });
  const state = scope.run(() =>
    module.exports.default.setup(props, { expose() {} }),
  );
  return { client, state, calls, scope, props };
}

async function settle() {
  await new Promise(setImmediate);
}

test('local environment checks follow the tab and draft selections without saving or sending credentials', async () => {
  const h = setup({ active: false, mode: 'local' });
  try {
    h.props.disabled = true;
    await h.state.load();
    await settle();
    assert.equal(h.calls.length, 0);

    h.props.active = true;
    await settle();
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0][0], 'post');
    assert.equal(h.calls[0][1], '/system/video-cloud-config/check-environment');
    assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0][2])), {
      subtitle_execution: 'worker',
      watermark_execution: 'local',
      local_values: {
        videoSubtitleEngine: 'lama',
        videoWatermarkEngine: 'opencv',
      },
    });
    assert.equal(h.state.environment.value.subtitle.ready, null);

    h.props.disabled = false;
    h.state.localValues.videoSubtitleEngine = 'opencv';
    h.state.form.watermark_execution = 'worker';
    await settle();
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1][2].local_values.videoSubtitleEngine, 'opencv');
    assert.equal(h.calls[1][2].watermark_execution, 'worker');

    h.state.form.mode = 'cloud';
    await settle();
    assert.equal(h.calls.length, 2);
    h.state.form.mode = 'local';
    await settle();
    h.props.active = false;
    await settle();
    h.props.active = true;
    await settle();
    assert.equal(h.calls.length, 4);
    assert.ok(
      h.calls.every(
        ([method, url]) =>
          method === 'post' && url.endsWith('/check-environment'),
      ),
    );
  } finally {
    h.scope.stop();
  }
});

test('an older environment response cannot replace a newer check', async () => {
  const h = setup({ mode: 'local' });
  try {
    const pending = [];
    h.client.post = (_url, _data, { signal }) =>
      new Promise((resolve) => pending.push({ resolve, signal }));
    await h.state.load();
    await settle();
    assert.equal(pending.length, 1);
    h.state.form.subtitle_execution = 'local';
    await settle();
    assert.equal(pending.length, 2);
    assert.equal(pending[0].signal.aborted, true);
    pending[1].resolve({
      subtitle: { ready: true, message: '本机已就绪' },
      watermark: { ready: true, message: '本机已就绪' },
    });
    await settle();
    pending[0].resolve({
      subtitle: { ready: null, message: '请在远程节点验证' },
      watermark: { ready: true, message: '本机已就绪' },
    });
    await settle();
    assert.equal(h.state.environment.value.subtitle.message, '本机已就绪');
    assert.equal(h.state.environmentChecking.value, false);
  } finally {
    h.scope.stop();
  }
});

test('check uses unsaved form without saving; save restores masks', async () => {
  const h = setup();
  try {
    await h.state.load();
    assert.equal(h.state.form.secret_key, '************');
    h.state.form.secret_key = 'new-private';
    h.state.form.subtitle_template_id = 44;
    h.state.localValues.videoSubtitleEngine = 'opencv';
    await h.state.check();
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0][0], 'post');
    assert.equal(h.calls[0][1], '/system/video-cloud-config/check');
    assert.equal(h.calls[0][2].local_values.videoSubtitleEngine, 'opencv');
    assert.equal(h.calls[0][2].secret_key, 'new-private');
    assert.equal(h.calls[0][2].subtitle_template_id, 44);
    assert.equal(h.state.result.value.ok, true);
    h.state.form.watermark_template_id = 55;
    await vue.nextTick();
    assert.equal(h.state.result.value, null);
    await h.state.save();
    assert.equal(h.calls[1][0], 'put');
    assert.equal(h.state.form.secret_key, '************');
  } finally {
    h.scope.stop();
  }
});

test('supplier buttons retain drafts and send only matching credentials', async () => {
  const h = setup();
  try {
    await h.state.load();
    h.state.form.secret_key = 'new-tencent';
    h.state.selectProvider('volc_mediakit');
    assert.equal(h.state.form.mode, 'cloud');
    assert.equal(h.state.form.subtitle_execution, 'worker');
    assert.equal(h.state.form.watermark_execution, 'local');
    assert.equal(h.state.form.api_key, '************');
    h.state.form.api_key = 'new-volc';
    h.state.form.check_task_id = 'amk-test-123';
    await h.state.check();
    assert.equal(h.calls[0][2].provider, 'volc_mediakit');
    assert.equal(h.calls[0][2].api_key, 'new-volc');
    assert.equal(Object.hasOwn(h.calls[0][2], 'secret_key'), false);
    h.state.selectProvider('tencent_mps');
    assert.equal(h.state.form.secret_key, 'new-tencent');
    assert.equal(Object.hasOwn(h.state.payload(), 'api_key'), false);
    h.state.selectProvider('volc_mediakit');
    assert.equal(h.state.form.api_key, 'new-volc');
    h.state.form.mode = 'local';
    await h.state.save();
    assert.equal(h.calls[1][2].mode, 'local');
    assert.equal(h.calls[1][2].subtitle_execution, 'worker');
  } finally {
    h.scope.stop();
  }
});

test('read-only administrator cannot save, check or switch provider', async () => {
  const h = setup();
  try {
    await h.state.load();
    h.props.disabled = true;
    await h.state.save();
    await h.state.check();
    h.state.selectProvider('volc_mediakit');
    assert.equal(h.state.form.provider, 'tencent_mps');
    assert.equal(h.calls.length, 0);
  } finally {
    h.scope.stop();
  }
});

test('Aliyun supplier has independent drafts and matching credential payload', async () => {
  const h = setup();
  try {
    await h.state.load();
    h.state.form.secret_key = 'tencent-draft';
    h.state.selectProvider('aliyun_ims');
    h.state.form.access_key_id = 'LTAI-test';
    h.state.form.access_key_secret = 'aliyun-private';
    h.state.form.aliyun_region = 'cn-beijing';
    assert.equal(h.state.endpoint.value, 'https://ice.cn-beijing.aliyuncs.com');
    await h.state.check();
    assert.equal(h.calls[0][2].access_key_secret, 'aliyun-private');
    assert.equal(Object.hasOwn(h.calls[0][2], 'secret_key'), false);
    assert.equal(Object.hasOwn(h.calls[0][2], 'api_key'), false);
    h.state.selectProvider('tencent_mps');
    assert.equal(h.state.form.secret_key, 'tencent-draft');
    h.state.selectProvider('aliyun_ims');
    assert.equal(h.state.form.access_key_secret, 'aliyun-private');
  } finally {
    h.scope.stop();
  }
});
