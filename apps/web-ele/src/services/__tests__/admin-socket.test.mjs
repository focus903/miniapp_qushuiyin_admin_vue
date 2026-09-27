import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AdminSocket, adminSocketUrl } from '../admin-socket.ts';
class Socket {
  readyState = 1; sent = [];
  send(value) { this.sent.push(value); }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('ready timing controls ping and silence timeout; stop releases timers', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const { client, sockets } = setup();
  try {
    client.start(); await flush();
    sockets[0].onmessage({ data: JSON.stringify({ version: 1, type: 'ready', config: {
      ping_seconds: 30, server_silence_seconds: 75,
    } }) });
    t.mock.timers.tick(15000); assert.equal(sockets[0].sent.length, 0);
    t.mock.timers.tick(15000); assert.equal(JSON.parse(sockets[0].sent[0]).type, 'ping');
    t.mock.timers.tick(30000); assert.equal(sockets[0].readyState, 1);
    t.mock.timers.tick(30000); assert.equal(sockets[0].readyState, 3);
    client.stop(); t.mock.timers.tick(60000); await flush(); assert.equal(sockets.length, 1);
  } finally { client.stop(); }
});

test('old ready packets retain the 15 second default heartbeat', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const { client, sockets } = setup();
  try {
    client.start(); await flush();
    sockets[0].onmessage({ data: JSON.stringify({ version: 1, type: 'ready' }) });
    t.mock.timers.tick(15000); assert.equal(JSON.parse(sockets[0].sent[0]).type, 'ping');
  } finally { client.stop(); }
});

test('unsafe server timing falls back rather than creating a busy timer', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const { client, sockets } = setup();
  try {
    client.start(); await flush();
    sockets[0].onmessage({ data: JSON.stringify({ version: 1, type: 'ready', config: {
      ping_seconds: 0, server_silence_seconds: -1,
    } }) });
    t.mock.timers.tick(1000); assert.equal(sockets[0].sent.length, 0);
    t.mock.timers.tick(14000); assert.equal(sockets[0].sent.length, 1);
  } finally { client.stop(); }
});
function setup() {
  const sockets = []; const events = [];
  const client = new AdminSocket({ url: () => 'ws://localhost/ws/admin', token: () => 'secret', verify: async () => {},
    create: () => { const socket = new Socket(); sockets.push(socket); return socket; },
    status() {}, event: (event) => events.push(event) });
  return { client, sockets, events };
}
test('URL uses API origin without credentials', () => {
  assert.equal(adminSocketUrl('/admin-api', 'http://localhost:5777'), 'ws://localhost:5777/ws/admin');
  assert.equal(adminSocketUrl('https://api.example.com/admin-api', 'https://admin.example.com'), 'wss://api.example.com/ws/admin');
  assert.throws(() => adminSocketUrl('https://user:secret@example.com', 'https://admin.example.com'));
});
test('one connection and stale callbacks ignored', async () => {
  const { client, sockets, events } = setup();
  try {
    client.start(); client.start(); await flush(); assert.equal(sockets.length, 1); sockets[0].onopen();
    assert.deepEqual(JSON.parse(sockets[0].sent[0]), { version: 1, type: 'authenticate', token: 'secret' });
    sockets[0].onmessage({ data: JSON.stringify({ version: 1, type: 'ready' }) });
    const late = sockets[0].onmessage; client.stop();
    late({ data: JSON.stringify({ version: 1, type: 'event', event: 'worker_nodes.changed', data: {} }) });
    assert.deepEqual(events, ['ready']);
  } finally { client.stop(); }
});
test('reconnect and logout timer cleanup', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const { client, sockets } = setup();
  try {
    client.start(); await flush(); sockets[0].onclose({ code: 1006 });
    t.mock.timers.tick(2000); await flush(); assert.equal(sockets.length, 2);
    client.stop(); t.mock.timers.tick(60000); await flush(); assert.equal(sockets.length, 2);
  } finally { client.stop(); }
});
test('stale preflight cannot reconnect after token switch', async () => {
  let resolve; let calls = 0; const sockets = [];
  const client = new AdminSocket({ url: () => 'ws://localhost/ws/admin', token: () => 'new-token',
    verify: () => ++calls === 1 ? new Promise((done) => { resolve = done; }) : Promise.resolve(),
    create: () => { const socket = new Socket(); sockets.push(socket); return socket; }, status() {}, event() {} });
  try {
    client.start(); client.stop(); client.start(); await flush(); resolve(); await flush(); assert.equal(sockets.length, 1);
  } finally { client.stop(); }
});
test('a stale session probe cannot overwrite a newly logged-in account permissions', async () => {
  const { readFileSync } = await import('node:fs');
  const { createRequire } = await import('node:module');
  const { runInNewContext } = await import('node:vm');
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const source = readFileSync(new URL('../admin-realtime.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', '({ PROD: false })');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let options; let resolve; const writes = [];
  const access = { accessToken: 'old-account', setAccessCodes: (codes) => writes.push(codes) };
  const stubs = {
    vue: { ref: (value) => ({ value }), readonly: (value) => value, onUnmounted() {}, watch: () => () => {} },
    '@vben/hooks': { useAppConfig: () => ({ apiURL: '/admin-api' }) },
    '@vben/stores': { useAccessStore: () => access },
    '#/api/request': { requestClient: { get: () => new Promise((done) => { resolve = done; }) } },
    './admin-socket': { AdminSocket: class { constructor(value) { options = value; } }, adminSocketUrl() {} },
  };
  const exports = {};
  runInNewContext(js, { exports, require: (name) => { if (!(name in stubs)) throw new Error(name); return stubs[name]; } });
  exports.useAdminRealtime();
  const pending = options.verify(); access.accessToken = 'new-account'; resolve(['old-permission']); await pending;
  assert.deepEqual(writes, []);
});
test('node page coalesces events, preserves filters, and pauses when inactive', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { readFileSync } = await import('node:fs');
  const { createRequire } = await import('node:module');
  const { runInNewContext } = await import('node:vm');
  const ts = createRequire(import.meta.url)('typescript');
  const vue = readFileSync(new URL('../../views/creatorhub/worker-nodes.vue', import.meta.url), 'utf8');
  const source = vue.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1] + '\nexports.inspect = { page, keyword, status };';
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const hooks = {}; const calls = []; let listener; let unsubscribed = false;
  const stubs = {
    vue: { ref: (value) => ({ value }), onMounted: (fn) => { hooks.mounted = fn; }, onActivated: (fn) => { hooks.active = fn; },
      onDeactivated: (fn) => { hooks.inactive = fn; }, onUnmounted: (fn) => { (hooks.unmount ||= []).push(fn); } },
    '#/api/request': { requestClient: { get: async (url, config) => { calls.push({ url, config }); return { items: [], total: 0, summary: {}, server_time: 123 }; } } },
    '#/services/admin-realtime': { adminRealtimeState: { value: 'connected' }, subscribeAdminEvents: (fn) => { listener = fn; return () => { unsubscribed = true; }; } },
  };
  const exports = {};
  runInNewContext(js, { exports, require: (name) => stubs[name] || {}, setTimeout, clearTimeout });
  exports.inspect.page.value = 3; exports.inspect.keyword.value = 'home'; exports.inspect.status.value = 'online';
  listener('ready'); listener('worker_nodes.changed'); t.mock.timers.tick(200); await flush();
  assert.equal(calls.length, 1); assert.equal(calls[0].config.params.page, 3); assert.equal(calls[0].config.params.keyword, 'home');
  hooks.inactive(); listener('worker_nodes.changed'); t.mock.timers.tick(200); await flush(); assert.equal(calls.length, 1);
  hooks.active(); await flush(); assert.equal(calls.length, 2);
  hooks.unmount.forEach((fn) => fn()); assert.equal(unsubscribed, true);
});
