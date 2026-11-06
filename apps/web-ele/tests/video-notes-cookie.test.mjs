import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import * as vue from 'vue';
import ts from 'typescript';
import { compileScript, compileTemplate, parse } from 'vue/compiler-sfc';

function setup() {
  const filename = new URL(
    '../src/components/video-notes-cookie.vue',
    import.meta.url,
  ).pathname;
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'));
  assert.deepEqual(
    compileTemplate({
      source: descriptor.template.content,
      filename,
      id: 'notes-cookie',
    }).errors,
    [],
  );
  const code = ts.transpileModule(
    compileScript(descriptor, { id: 'notes-cookie' }).content,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    },
  ).outputText;
  const calls = [];
  const status = {
    configured: false,
    storage_ready: true,
    encryption_ready: true,
    source: 'none',
    updated: null,
  };
  const client = {
    get: async () => ({ ...status }),
    put: async (url, data) => {
      calls.push(['put', url, data]);
      status.configured = true;
      status.source = 'database';
      return { ...status };
    },
    delete: async (url) => {
      calls.push(['delete', url]);
      status.configured = false;
      status.source = 'none';
      return { ...status };
    },
    post: async (url) => {
      calls.push(['post', url]);
      return { ok: true, message: '有效' };
    },
  };
  const module = { exports: {} };
  const unmount = [];
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require(name) {
      if (name === 'vue')
        return {
          ...vue,
          onMounted() {},
          onBeforeUnmount(fn) {
            unmount.push(fn);
          },
        };
      if (name === 'element-plus')
        return {
          ElMessage: { success() {}, error() {} },
          ElMessageBox: { confirm: async () => true },
        };
      if (name === '#/api/request') return { requestClient: client };
      throw new Error(name);
    },
  });
  const scope = vue.effectScope(),
    props = vue.reactive({ disabled: false });
  const state = scope.run(() =>
    module.exports.default.setup(props, { expose() {} }),
  );
  return { state, calls, scope, props, unmount };
}

test('B站 Cookie 保存后清空输入，读取只显示配置状态，测试使用已保存凭据', async () => {
  const h = setup();
  try {
    await h.state.load();
    h.state.cookie.value = 'SESSDATA=private-cookie';
    await h.state.save();
    assert.equal(h.calls[0][0], 'put');
    assert.equal(h.calls[0][2].cookie, 'SESSDATA=private-cookie');
    assert.equal(h.state.cookie.value, '');
    assert.equal(h.state.status.value.configured, true);
    await h.state.probe();
    assert.equal(h.calls[1][0], 'post');
    assert.equal(h.calls[1][1], '/system/video-notes/bilibili-cookie/test');
    await h.state.clear();
    assert.equal(h.calls[2][0], 'delete');
    assert.equal(h.state.status.value.configured, false);
  } finally {
    h.scope.stop();
  }
});

test('没有修改权限或空 Cookie 不会保存，卸载清理输入', async () => {
  const h = setup();
  try {
    await h.state.load();
    await h.state.save();
    assert.equal(h.calls.length, 0);
    h.props.disabled = true;
    h.state.cookie.value = 'SESSDATA=private-cookie';
    await h.state.save();
    assert.equal(h.calls.length, 0);
    h.unmount.forEach((fn) => fn());
    assert.equal(h.state.cookie.value, '');
  } finally {
    h.scope.stop();
  }
});
