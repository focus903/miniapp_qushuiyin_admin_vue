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

function setup(active = true) {
  const filename = path.join(
    testDirectory,
    '../src/components/image-processing-config.vue',
  );
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'));
  assert.deepEqual(
    compileTemplate({
      source: descriptor.template.content,
      filename,
      id: 'image-test',
    }).errors,
    [],
  );
  const code = ts.transpileModule(
    compileScript(descriptor, { id: 'image-test' }).content,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    },
  ).outputText;
  const calls = [];
  let saved = 'local';
  let savedEnhanceDevice;
  const item = { ready: false, message: '未就绪' };
  const getStatus = () => ({
    enhance_device: savedEnhanceDevice,
    watermark_execution: saved,
    storage_ready: true,
  });
  const client = {
    get: async () => getStatus(),
    put: async (url, data) => {
      calls.push(['put', url, data]);
      saved = data.watermark_execution;
      savedEnhanceDevice = data.enhance_device;
      return getStatus();
    },
    post: async (url, data) => {
      calls.push(['post', url, data]);
      return {
        watermark:
          data.watermark_execution === 'worker'
            ? { ready: null, message: '远程未验证' }
            : {
                ...item,
                install_command:
                  '.venv/bin/python commands/install_lama.py --device cpu',
              },
        enhance: {
          ...item,
          install_command: `install-realesrgan-${data.enhance_device}`,
        },
        compress: item,
        ocr: item,
      };
    },
  };
  const module = { exports: {} };
  let mount;
  vm.runInNewContext(code, {
    AbortController,
    module,
    exports: module.exports,
    require(name) {
      if (name === 'vue') {
        return {
          ...vue,
          onActivated() {},
          onDeactivated() {},
          onMounted(callback) {
            mount = callback;
          },
        };
      }
      if (name === 'element-plus') return { ElMessage: { success() {} } };
      if (name === '#/api/request') return { requestClient: client };
      if (name === '#/components/copy-value.vue') return {};
      throw new Error(name);
    },
  });
  const props = vue.reactive({ active, disabled: false });
  const scope = vue.effectScope();
  const state = scope.run(() =>
    module.exports.default.setup(props, { expose() {} }),
  );
  return {
    state,
    calls,
    scope,
    props,
    client,
    async mount() {
      await mount();
      await new Promise(setImmediate);
    },
  };
}
test('automatically checks saved settings on entry and checks changed execution without saving', async () => {
  const h = setup();
  try {
    await h.mount();
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0][0], 'post');
    assert.equal(h.calls[0][2].watermark_execution, 'local');

    h.state.form.watermark_execution = 'worker';
    await new Promise(setImmediate);
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1][0], 'post');
    assert.equal(h.calls[1][2].watermark_execution, 'worker');
    assert.equal(
      h.state.checkLabel(h.state.result.value.watermark),
      '未验证远程环境',
    );
    await h.state.save();
    assert.equal(h.calls[2][0], 'put');
    assert.equal(h.calls.length, 3);
  } finally {
    h.scope.stop();
  }
});
test('read-only image user checks when entering and returning to the tab', async () => {
  const h = setup(false);
  try {
    h.props.disabled = true;
    await h.mount();
    await h.state.save();
    assert.equal(h.calls.length, 0);
    h.props.active = true;
    await vue.nextTick();
    assert.equal(h.calls[0][0], 'post');
    h.props.active = false;
    await vue.nextTick();
    assert.equal(h.calls.length, 1);
    h.props.active = true;
    await vue.nextTick();
    assert.equal(h.calls[1][0], 'post');
  } finally {
    h.scope.stop();
  }
});

test('changing the LaMa device keeps previous checks and marks the watermark result as stale', async () => {
  const h = setup();
  try {
    await h.mount();
    const previous = h.state.result.value;
    assert.equal(h.state.watermarkCheckStale.value, false);
    const guide = h.state.watermarkInstallGuide.value;
    assert.match(guide.install_command, /install_lama\.py/);

    h.state.form.watermark_device = 'cuda';
    assert.equal(h.state.result.value, previous);
    assert.equal(h.state.watermarkCheckStale.value, true);
    assert.equal(h.state.watermarkInstallGuide.value, guide);
    assert.equal(h.calls.length, 1);

    h.state.form.watermark_engine = 'opencv';
    assert.equal(h.state.watermarkInstallGuide.value, undefined);
    await new Promise(setImmediate);
    assert.equal(h.calls[1][2].watermark_engine, 'opencv');
    h.state.form.watermark_engine = 'lama';
    await new Promise(setImmediate);
    assert.equal(h.state.watermarkCheckStale.value, false);
    assert.equal(h.calls[2][2].watermark_device, 'cuda');
  } finally {
    h.scope.stop();
  }
});

test('request failures update the error alert without throwing or leaving busy state', async () => {
  const h = setup();
  try {
    await h.mount();
    h.client.get = async () => {
      throw new Error('offline');
    };
    await h.state.load();
    assert.equal(h.state.errorMessage.value, '加载失败');
    assert.equal(h.state.loading.value, false);
    h.client.put = async () => {
      throw new Error('offline');
    };
    await h.state.save();
    assert.equal(h.state.errorMessage.value, '保存失败');
    assert.equal(h.state.saving.value, false);
    h.client.post = async () => {
      throw new Error('offline');
    };
    h.state.form.enhance_device = 'cpu';
    await new Promise(setImmediate);
    assert.equal(h.state.checkError.value, '检查失败');
    assert.equal(h.state.checking.value, false);
  } finally {
    h.scope.stop();
  }
});

test('image enhancement checks and saves the selected device independently', async () => {
  const h = setup();
  try {
    await h.mount();
    assert.equal(h.state.form.enhance_device, 'gpu');
    const previous = h.state.result.value;
    assert.equal(h.calls[0][2].enhance_device, 'gpu');
    assert.equal(
      h.state.enhanceInstallGuide.value.install_command,
      'install-realesrgan-gpu',
    );

    h.state.form.enhance_device = 'cpu';
    assert.equal(h.state.result.value, previous);
    assert.equal(h.state.enhanceCheckStale.value, true);
    assert.equal(h.state.enhanceInstallGuide.value, undefined);
    assert.equal(h.state.watermarkCheckStale.value, false);

    await new Promise(setImmediate);
    assert.equal(h.calls[1][2].enhance_device, 'cpu');
    assert.equal(h.state.enhanceCheckStale.value, false);
    assert.equal(
      h.state.enhanceInstallGuide.value.install_command,
      'install-realesrgan-cpu',
    );

    await h.state.save();
    assert.equal(h.calls[2][0], 'put');
    assert.equal(h.calls[2][2].enhance_device, 'cpu');
  } finally {
    h.scope.stop();
  }
});

test('an obsolete automatic check cannot replace the result for the latest device', async () => {
  const h = setup();
  const pending = [];
  const post = h.client.post;
  h.client.post = async (url, data, { signal }) => {
    await new Promise((resolve) => pending.push({ resolve, signal }));
    return post(url, data);
  };
  try {
    await h.mount();
    assert.equal(pending.length, 1);
    h.state.form.enhance_device = 'cpu';
    await vue.nextTick();
    assert.equal(pending.length, 2);
    assert.equal(pending[0].signal.aborted, true);
    pending[1].resolve();
    await new Promise(setImmediate);
    assert.equal(
      h.state.enhanceInstallGuide.value.install_command,
      'install-realesrgan-cpu',
    );

    pending[0].resolve();
    await new Promise(setImmediate);
    assert.equal(
      h.state.enhanceInstallGuide.value.install_command,
      'install-realesrgan-cpu',
    );
    assert.equal(h.state.checking.value, false);
  } finally {
    h.scope.stop();
  }
});
