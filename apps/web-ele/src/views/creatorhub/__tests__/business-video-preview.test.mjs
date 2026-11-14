import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import * as vue from 'vue';

import ts from 'typescript';

function setup(client) {
  const source = readFileSync(
    new URL('../business-video-preview.vue', import.meta.url),
    'utf8',
  ).match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const cleanup = [];
  const exports = {};
  const props = vue.reactive({ resource: 'subtitle', recordId: 'one' });
  const mocks = {
    vue: { ...vue, onBeforeUnmount: (fn) => cleanup.push(fn) },
    'element-plus': {},
    '#/api/request': { requestClient: client },
    '#/components/copy-value.vue': { default: {} },
  };
  runInNewContext(
    ts.transpileModule(`${source}\nexports.api={load,value,loadError};`, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      URL,
      defineProps: () => props,
      require: (name) => mocks[name],
      Error,
    },
  );
  return { ...exports.api, props, cleanup };
}
it('late preview cannot replace current record or survive unmount', async () => {
  let finish;
  const client = {
    post: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  };
  const s = setup(client);
  const old = finish;
  client.post = async () => ({
    input_url: 'https://host/new',
    result_url: '',
    input_reason: '',
    result_reason: '',
  });
  s.props.recordId = 'two';
  await vue.nextTick();
  await Promise.resolve();
  old({ input_url: 'https://host/old', result_url: '' });
  await Promise.resolve();
  assert.equal(s.value.value.input_url, '/new');
  s.cleanup[0]();
  assert.equal(s.value.value, null);
});
it('unsafe URL is rejected and API failures clear previous video', async () => {
  const client = {
    post: async () => ({
      input_url: 'javascript:bad',
      result_url:
        'http://127.0.0.1:8001/admin-api/operations/records/watermark/abc/media/result?t=1',
      input_path: '/data/input.mp4',
      result_path: '/data/output.mp4',
    }),
  };
  const s = setup(client);
  await s.load();
  assert.equal(s.value.value.input_url, '');
  assert.equal(
    s.value.value.result_url,
    '/admin-api/operations/records/watermark/abc/media/result?t=1',
  );
  assert.equal(s.value.value.input_path, '/data/input.mp4');
  assert.equal(s.value.value.result_path, '/data/output.mp4');
  client.post = async () => {
    throw new Error('not available');
  };
  await s.load();
  assert.equal(s.value.value, null);
  assert.equal(s.loadError.value, 'not available');
});
