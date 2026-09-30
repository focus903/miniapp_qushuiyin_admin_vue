import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as vue from 'vue';

function setup(resource) {
  const text = readFileSync(new URL('../manage.vue', import.meta.url), 'utf8');
  const source = text.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1] +
    '\nexports.api={add,edit,save,form,keys,columns,display};';
  const calls = [];
  const requestClient = {
    get: async () => [],
    post: async (url, body) => calls.push({url, body: structuredClone(vue.toRaw(body.values)), keys: structuredClone(vue.toRaw(body.keys))}),
    put: async (url, body) => calls.push({url, body: structuredClone(vue.toRaw(body.values)), keys: structuredClone(vue.toRaw(body.keys))}),
  };
  const mocks = {
    vue: {...vue, watch() {}},
    'vue-router': {useRoute: () => ({meta: {resource}})},
    '@vben/stores': {useAccessStore: () => ({accessCodes: [resource + ':update']})},
    '#/api/request': {requestClient},
    'element-plus': {ElMessage: {success() {}, warning() {}}},
  };
  const exports = {};
  runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText,
    {exports, require: name => mocks[name] || {}, console});
  // 执行价格输入组件真实的更新表达式，验证元到分以及保存时不重复换算。
  const handler = text.match(/<ElInputNumber v-else-if="key==='price_fen'"[^>]*@update:model-value="([^"]+)"/)[1];
  const inputYuan = value => runInNewContext(`(${handler})(value)`, {form: exports.api.form.value, key: 'price_fen', value});
  return {...exports.api, calls, inputYuan};
}

for (const resource of ['point-packages', 'membership-plans']) {
  test(`${resource}: new and existing configurations preserve product ID and convert yuan once`, async () => {
    const s = setup(resource);
    s.add();
    assert.ok(s.columns.value.includes('wx_product_id'));
    assert.equal(s.form.value.wx_product_id, '');
    s.keys.value.code = 'points_trial';
    s.form.value.wx_product_id = 'Wx.Product:01';
    s.inputYuan(1.99);
    await s.save();
    assert.equal(s.calls[0].body.price_fen, 199);
    assert.equal(s.calls[0].body.wx_product_id, 'Wx.Product:01');
    assert.equal(s.calls[0].keys.code, 'points_trial');
    s.edit({code: 'points_trial', ...s.calls[0].body});
    assert.equal(s.display(s.form.value, 'price_fen'), '1.99');
    await s.save();
    assert.equal(s.calls[1].body.price_fen, 199);
    assert.equal(s.calls[1].body.wx_product_id, 'Wx.Product:01');
  });
}
