<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';
import { ElAlert, ElButton, ElCard, ElForm, ElFormItem, ElInputNumber, ElMessage, ElTabPane, ElTabs } from 'element-plus';
import { requestClient } from '#/api/request';

interface Config {
  heartbeat_seconds: number;
  ping_seconds: number;
  server_silence_seconds: number;
  client_silence_seconds: number;
  auth_check_seconds: number;
}
const fields: { key: keyof Config; label: string; help: string; min: number; max: number }[] = [
  { key: 'heartbeat_seconds', label: '服务端心跳间隔', help: '没有业务事件时，服务端发送 heartbeat 的间隔。', min: 5, max: 300 },
  { key: 'ping_seconds', label: '浏览器发送心跳间隔', help: '浏览器向服务端发送 ping 的间隔。', min: 5, max: 300 },
  { key: 'server_silence_seconds', label: '浏览器接收超时', help: '浏览器超过此时间未收到有效消息，在下一次心跳检查时重连。至少为服务端心跳间隔的 2 倍加 5 秒。', min: 15, max: 900 },
  { key: 'client_silence_seconds', label: '服务端接收超时', help: '服务端超过此时间未收到 ping，关闭连接。至少为浏览器心跳间隔的 2 倍加 5 秒，且不小于 35 秒。', min: 35, max: 900 },
  { key: 'auth_check_seconds', label: '登录状态复查间隔', help: '空闲连接检查登录是否失效的间隔。增大后，退出登录或撤销会话的检测可能变慢；业务事件发送前仍会校验权限。', min: 5, max: 300 },
];
const access = useAccessStore();
const canSave = computed(() => access.accessCodes.includes('websocket-config:update'));
const tab = ref('admin');
const config = ref<Config>();
const busy = ref(false);
const saving = ref(false);
const error = ref('');
const validation = computed(() => {
  if (!config.value) return '';
  for (const field of fields) {
    const value = config.value[field.key];
    if (!Number.isInteger(value) || value < field.min || value > field.max) return `${field.label}需为 ${field.min}～${field.max} 秒的整数`;
  }
  if (config.value.server_silence_seconds < config.value.heartbeat_seconds * 2 + 5) return '浏览器接收超时至少为服务端心跳间隔的 2 倍加 5 秒';
  if (config.value.client_silence_seconds < Math.max(config.value.ping_seconds, 15) * 2 + 5) return '服务端接收超时至少为浏览器心跳间隔的 2 倍加 5 秒，且不小于 35 秒';
  return '';
});
async function load() {
  busy.value = true; error.value = '';
  try { config.value = await requestClient.get<Config>('/system/websocket-config'); }
  catch { error.value = '配置加载失败，请重新加载。'; }
  finally { busy.value = false; }
}
async function save() {
  if (!config.value || !canSave.value || saving.value || busy.value || error.value) return;
  if (validation.value) { ElMessage.error(validation.value); return; }
  saving.value = true;
  try {
    config.value = await requestClient.put<Config>('/system/websocket-config', { ...config.value });
    ElMessage.success('已保存，新连接生效；刷新页面可应用到当前连接。');
  } catch { /* 请求拦截器统一显示接口错误，保留表单便于重试。 */ }
  finally { saving.value = false; }
}
onMounted(load);
</script>

<template>
  <Page title="websocket连接配置">
    <ElCard shadow="never">
      <ElTabs v-model="tab">
        <ElTabPane label="后台配置" name="admin">
          <ElAlert class="mb-4" title="保存后对新连接生效，已有连接保持原参数。刷新页面可应用新配置。" type="info" :closable="false" show-icon />
          <ElAlert v-if="error" class="mb-4" :title="error" type="error" :closable="false" />
          <ElForm v-if="config" label-position="top" :disabled="!canSave || busy || saving || !!error">
            <div class="config-grid">
              <ElFormItem v-for="field in fields" :key="field.key" :label="field.label">
                <div>
                  <ElInputNumber v-model="config[field.key]" :min="field.min" :max="field.max" :precision="0" :step="1" controls-position="right" :aria-label="field.label" />
                  <span class="ml-2">秒</span>
                  <p class="field-help">{{ field.help }}</p>
                </div>
              </ElFormItem>
            </div>
          </ElForm>
          <ElAlert v-if="validation" class="mb-4" :title="validation" type="warning" :closable="false" />
          <ElButton v-if="canSave" type="primary" :loading="saving" :disabled="busy || !!error || !config || !!validation" @click="save">保存配置</ElButton>
          <ElButton :loading="busy" :disabled="saving" @click="load">重新加载</ElButton>
        </ElTabPane>
      </ElTabs>
    </ElCard>
  </Page>
</template>

<style scoped>
.config-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 32px; max-width: 960px; }
.field-help { margin-top: 8px; font-size: 12px; line-height: 1.6; color: var(--el-text-color-secondary); }
@media (max-width: 720px) { .config-grid { grid-template-columns: 1fr; } }
</style>
