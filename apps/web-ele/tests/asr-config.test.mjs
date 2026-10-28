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

function setup() {
  const source = fs.readFileSync(
    path.join(testDirectory, '../src/components/asr-config.vue'),
    'utf8',
  );
  const { descriptor } = parse(source);
  assert.deepEqual(
    compileTemplate({
      source: descriptor.template.content,
      filename: 'asr-config.vue',
      id: 'asr-test',
    }).errors,
    [],
  );
  const code = ts.transpileModule(
    compileScript(descriptor, { id: 'asr-test' }).content,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    },
  ).outputText;
  const calls = [];
  const events = [];
  const saved = {
    id: 'one',
    mode: 'cloud',
    provider: 'dashscope',
    region: 'cn-beijing',
    model: 'fun-asr-realtime',
    timeout_seconds: 120,
    api_key: '************',
    configured: true,
    storage_ready: true,
    encryption_ready: true,
    encryption_key_file: '/srv/app/storage/secrets/asr.key',
    provider_configs: {
      dashscope: {
        provider: 'dashscope',
        region: 'cn-beijing',
        model: 'fun-asr-realtime',
        api_key: '************',
        configured: true,
        timeout_seconds: 120,
      },
      stepfun: {
        provider: 'stepfun',
        region: 'step-plan',
        model: 'stepaudio-2.5-asr',
        api_key: '',
        configured: false,
        timeout_seconds: 120,
      },
    },
    local_values: {
      whisperModel: 'small',
      whisperDevice: 'cpu',
      whisperComputeType: 'int8',
    },
    local_fields: [
      {
        key: 'whisperModel',
        label: '模型',
        description: '型号',
        options: [
          { label: 'small', value: 'small' },
          { label: 'medium', value: 'medium' },
        ],
      },
    ],
    local_installation: {
      models_directory: '/srv/app/data/models',
      execution: 'worker',
      download_command_template:
        '.venv/bin/python download_model.py --model {model}',
      windows_download_command_template:
        '.\\.venv\\Scripts\\python.exe download_model.py --model {model}',
    },
  };
  const client = {
    get: async () => ({ ...saved }),
    put: async (url, data) => {
      calls.push(['put', url, data]);
      return { ...saved, ...data, api_key: '************' };
    },
    post: async (url, data) => {
      calls.push(['post', url, data]);
      if (url.endsWith('/local-check'))
        return {
          ready: false,
          dependencies_ready: true,
          missing_models: ['paraformer-zh'],
          model_directory: '/srv/app/data/paraformer',
          execution: 'local',
          message: '缺少模型',
        };
      return {
        ok: true,
        message: '在线 ASR 连通正常',
        model: saved.model,
        elapsed_ms: 3,
      };
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require(name) {
      if (name === 'vue') return { ...vue, onMounted() {} };
      if (name === 'element-plus') return { ElMessage: { success() {} } };
      if (name === '#/api/request') return { requestClient: client };
      throw new Error(name);
    },
  });
  const scope = vue.effectScope();
  const props = vue.reactive({ disabled: false });
  const state = scope.run(() =>
    module.exports.default.setup(props, {
      expose() {},
      emit: (...args) => events.push(args),
    }),
  );
  return { state, calls, events, scope, props, saved };
}

test('ASR masks saved key and probes unsaved config without saving', async () => {
  const h = setup();
  try {
    await h.state.load();
    assert.equal(h.state.form.api_key, '************');
    assert.equal(
      h.state.status.value.encryption_key_file,
      '/srv/app/storage/secrets/asr.key',
    );
    h.state.form.api_key = 'sk-new';
    await h.state.probe();
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0][0], 'post');
    assert.equal(h.calls[0][2].api_key, 'sk-new');
    assert.equal(h.state.testResult.value.ok, true);
    h.state.form.timeout_seconds = 30;
    await vue.nextTick();
    assert.equal(h.state.testResult.value, null);
    await h.state.save();
    assert.equal(h.calls[1][0], 'put');
    assert.equal(h.state.form.api_key, '************');
  } finally {
    h.scope.stop();
  }
});

test('read-only ASR config cannot save or trigger billable probe', async () => {
  const h = setup();
  try {
    await h.state.load();
    h.props.disabled = true;
    await h.state.save();
    await h.state.probe();
    assert.equal(h.calls.length, 0);
  } finally {
    h.scope.stop();
  }
});

test('business configuration save cannot overwrite ASR settings moved to AI page', async () => {
  const source = fs.readFileSync(
    path.join(testDirectory, '../src/views/creatorhub/system.vue'),
    'utf8',
  );
  const { descriptor } = parse(source);
  const code = ts.transpileModule(
    compileScript(descriptor, { id: 'business-config-test' }).content,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    },
  ).outputText;
  const calls = [];
  const client = {
    put: async (url, data) => {
      calls.push([url, data]);
    },
    get: async (url) =>
      url.endsWith('/schema')
        ? { groups: [], fields: [] }
        : { showExtractTextLink: true },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require(name) {
      if (name === 'vue') return { ...vue, watch() {} };
      if (name === 'vue-router')
        return {
          useRoute: () => ({
            meta: { resource: 'app-config' },
            path: '/creatorhub/app-config',
          }),
        };
      if (name === '@vben/stores')
        return {
          useAccessStore: () => ({ accessCodes: ['app-config:update'] }),
        };
      if (name === 'element-plus') return { ElMessage: { success() {} } };
      if (name === '#/api/request') return { requestClient: client };
      if (name === '#/utils/app-config-layout') return { configTabs: () => [] };
      if (
        name.endsWith('.vue') ||
        name === '@vben/common-ui' ||
        name === '@vben/icons'
      )
        return {};
      throw new Error(name);
    },
  });
  const state = module.exports.default.setup({}, { expose() {} });
  state.config.value = {
    showExtractTextLink: true,
    whisperModel: 'stale-model',
    whisperDevice: 'stale-device',
    whisperComputeType: 'stale-precision',
    videoSubtitleEngine: 'stale-video',
    videoWatermarkEngine: 'stale-video',
    workerTextWaitSeconds: 10,
  };
  await state.saveConfig();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/system/app-config');
  assert.equal(
    JSON.stringify(calls[0][1].values),
    JSON.stringify({ showExtractTextLink: true, workerTextWaitSeconds: 10 }),
  );
});

test('provider switch keeps independent drafts and does not auto-save', async () => {
  const h = setup();
  try {
    await h.state.load();
    h.state.form.api_key = 'sk-dash-draft';
    h.state.selectProvider('stepfun');
    assert.equal(h.state.form.api_key, '');
    assert.equal(h.state.form.region, 'step-plan');
    assert.equal(h.state.form.model, 'stepaudio-2.5-asr');
    h.state.form.api_key = 'sk-step-draft';
    h.state.form.timeout_seconds = 80;
    await h.state.probe();
    assert.equal(h.calls[0][0], 'post');
    assert.equal(h.calls[0][2].provider, 'stepfun');
    assert.equal(h.calls[0][2].api_key, 'sk-step-draft');
    h.state.selectProvider('dashscope');
    assert.equal(h.state.testResult.value, null);
    assert.equal(h.state.form.api_key, 'sk-dash-draft');
    h.state.selectProvider('stepfun');
    assert.equal(h.state.form.api_key, 'sk-step-draft');
    assert.equal(h.state.form.timeout_seconds, 80);
    assert.equal(h.calls.length, 1);
    await h.state.save();
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1][0], 'put');
    assert.equal(h.calls[1][2].provider, 'stepfun');
    assert.equal(h.state.form.api_key, '************');
  } finally {
    h.scope.stop();
  }
});

test('switch restores the other provider saved mask and is disabled for read-only users', async () => {
  const h = setup();
  try {
    h.saved.provider_configs.stepfun.api_key = '************';
    h.saved.provider_configs.stepfun.configured = true;
    await h.state.load();
    h.state.selectProvider('stepfun');
    assert.equal(h.state.form.api_key, '************');
    h.props.disabled = true;
    h.state.selectProvider('dashscope');
    assert.equal(h.state.form.provider, 'stepfun');
    assert.equal(h.calls.length, 0);
  } finally {
    h.scope.stop();
  }
});

test('local Whisper installation commands follow selected model and show server directory metadata', async () => {
  const h = setup();
  try {
    await h.state.load();
    h.state.form.mode = 'local';
    assert.equal(h.state.currentLocalModel.value, 'small');
    assert.equal(
      h.state.downloadCommand.value,
      '.venv/bin/python download_model.py --model small',
    );
    h.state.localValues.whisperModel = 'medium';
    assert.equal(h.state.currentLocalModel.value, 'medium');
    assert.equal(
      h.state.downloadCommand.value,
      '.venv/bin/python download_model.py --model medium',
    );
    assert.equal(
      h.state.windowsDownloadCommand.value,
      String.raw`.\.venv\Scripts\python.exe download_model.py --model medium`,
    );
    assert.equal(
      h.state.status.value.local_installation.models_directory,
      '/srv/app/data/models',
    );
    assert.equal(h.state.status.value.local_installation.execution, 'worker');
    await h.state.save();
    assert.equal(h.calls[0][2].local_values.whisperModel, 'medium');
  } finally {
    h.scope.stop();
  }
});

test('local engine switch saves Paraformer explicitly without changing the Whisper model', async () => {
  const h = setup();
  try {
    await h.state.load();
    h.state.form.mode = 'local';
    h.state.selectLocalEngine('paraformer');
    assert.equal(h.state.form.local_engine, 'paraformer');
    assert.equal(h.state.localValues.whisperModel, 'small');
    assert.equal(h.calls.length, 0);
    h.state.selectProvider('stepfun');
    assert.equal(h.state.form.local_engine, 'paraformer');
    await h.state.save();
    assert.equal(h.calls[0][0], 'put');
    assert.equal(h.calls[0][2].local_engine, 'paraformer');
    assert.equal(h.calls[0][2].local_values.whisperModel, 'small');
  } finally {
    h.scope.stop();
  }
});

test('read-only Paraformer dependency check is allowed and does not save or install', async () => {
  const h = setup();
  try {
    h.saved.mode = 'local';
    h.saved.local_engine = 'paraformer';
    await h.state.load();
    h.props.disabled = true;
    await h.state.checkLocal();
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0][0], 'post');
    assert.equal(h.calls[0][1], '/system/asr-config/local-check');
    assert.equal(h.calls[0][2].local_engine, 'paraformer');
    assert.equal(h.state.localCheckResult.value.ready, false);
    assert.equal(
      h.state.localCheckResult.value.missing_models[0],
      'paraformer-zh',
    );
    h.state.selectLocalEngine('whisper');
    assert.equal(h.state.form.local_engine, 'paraformer');
    await h.state.save();
    assert.equal(h.calls.length, 1);
  } finally {
    h.scope.stop();
  }
});

test('Whisper execution choice survives provider and engine switches and is saved', async () => {
  const h = setup();
  try {
    await h.state.load();
    h.state.form.mode = 'local';
    h.state.form.local_execution = 'worker';
    h.state.selectProvider('stepfun');
    assert.equal(h.state.form.local_execution, 'worker');
    h.state.selectLocalEngine('paraformer');
    h.state.selectLocalEngine('whisper');
    assert.equal(h.state.form.local_execution, 'worker');
    await h.state.save();
    assert.equal(h.calls[0][2].local_execution, 'worker');
  } finally {
    h.scope.stop();
  }
});
