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

function setup(kind = 'llm') {
  const filename = path.join(
    testDirectory,
    '../src/components/ai-model-config.vue',
  );
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'));
  assert.deepEqual(
    compileTemplate({
      source: descriptor.template.content,
      filename,
      id: 'ai-test',
    }).errors,
    [],
  );
  const code = ts.transpileModule(
    compileScript(descriptor, { id: 'ai-test' }).content,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    },
  ).outputText;
  const calls = [];
  const saved = {
    provider: 'dashscope',
    base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: kind === 'llm' ? 'qwen-max' : 'qwen3-vl-plus',
    api_key: '************',
    timeout_seconds: 120,
    ...(kind === 'llm' ? { temperature: 0.4 } : {}),
    configured: true,
    storage_ready: true,
    encryption_key_file: '/srv/app/storage/secrets/asr.key',
  };
  const client = {
    get: async () => ({ ...saved }),
    put: async (url, data) => {
      calls.push(['put', url, data]);
      return { ...saved };
    },
    post: async (url, data) => {
      calls.push(['post', url, data]);
      return { ok: true, message: 'OK' };
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
  const props = vue.reactive({ kind, disabled: false });
  const state = scope.run(() =>
    module.exports.default.setup(props, { expose() {} }),
  );
  return { state, calls, scope, props };
}

for (const kind of ['llm', 'vlm'])
  test(`${kind} masks key, tests unsaved form and saves once`, async () => {
    const h = setup(kind);
    try {
      await h.state.load();
      assert.equal(h.state.form.api_key, '************');
      h.state.form.api_key = 'sk-new';
      await h.state.probe();
      assert.equal(h.calls.length, 1);
      assert.equal(h.calls[0][0], 'post');
      assert.equal(h.calls[0][1], `/system/ai-config/${kind}/test`);
      assert.equal(h.calls[0][2].api_key, 'sk-new');
      assert.equal(Object.hasOwn(h.calls[0][2], 'temperature'), kind === 'llm');
      h.state.form.model = 'another-model';
      await vue.nextTick();
      assert.equal(h.state.result.value, null);
      await h.state.save();
      assert.equal(h.calls[1][0], 'put');
      assert.equal(h.state.form.api_key, '************');
    } finally {
      h.scope.stop();
    }
  });

test('provider selection fills URL and model and clears old key', async () => {
  const h = setup();
  try {
    await h.state.load();
    const preset = h.state.presets.llm.find((item) => item.key === 'deepseek');
    h.state.selectProvider(preset);
    assert.equal(h.state.form.base_url, preset.url);
    assert.equal(h.state.form.model, 'deepseek-chat');
    assert.equal(h.state.form.api_key, '');
    h.state.selectProvider();
    assert.equal(h.state.payload().provider, 'custom');
    assert.equal(h.state.form.base_url, '');
  } finally {
    h.scope.stop();
  }
});

test('read-only user cannot save or probe', async () => {
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
