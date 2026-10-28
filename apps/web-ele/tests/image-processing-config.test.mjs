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
  const item = { ready: false, message: '未就绪' };
  const client = {
    get: async () => ({ watermark_execution: saved, storage_ready: true }),
    put: async (url, data) => {
      calls.push(['put', url, data]);
      saved = data.watermark_execution;
      return { watermark_execution: saved, storage_ready: true };
    },
    post: async (url, data) => {
      calls.push(['post', url, data]);
      return {
        watermark: { ready: null, message: '远程未验证' },
        enhance: item,
        compress: item,
        ocr: item,
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
  const props = vue.reactive({ disabled: false });
  const scope = vue.effectScope();
  const state = scope.run(() =>
    module.exports.default.setup(props, { expose() {} }),
  );
  return { state, calls, scope, props, client };
}
test('image execution saves independently; checks unsaved form without saving', async () => {
  const h = setup();
  try {
    await h.state.load();
    h.state.form.watermark_execution = 'worker';
    await h.state.check();
    assert.equal(h.calls[0][0], 'post');
    assert.equal(h.calls[0][2].watermark_execution, 'worker');
    assert.equal(
      h.state.checkLabel(h.state.result.value.watermark),
      '未验证远程环境',
    );
    await h.state.save();
    assert.equal(h.calls[1][0], 'put');
    await h.state.load();
    assert.equal(h.state.form.watermark_execution, 'worker');
  } finally {
    h.scope.stop();
  }
});
test('read-only image user cannot save but can check local environment', async () => {
  const h = setup();
  try {
    await h.state.load();
    h.props.disabled = true;
    await h.state.save();
    assert.equal(h.calls.length, 0);
    await h.state.check();
    assert.equal(h.calls[0][0], 'post');
  } finally {
    h.scope.stop();
  }
});

test('request failures update the error alert without throwing or leaving busy state', async () => {
  const h = setup();
  try {
    await h.state.load();
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
    await h.state.check();
    assert.equal(h.state.errorMessage.value, '检查失败');
    assert.equal(h.state.checking.value, false);
  } finally {
    h.scope.stop();
  }
});
