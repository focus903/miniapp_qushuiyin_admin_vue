<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import {
  ElAlert,
  ElButton,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElTag,
} from 'element-plus';
import { requestClient } from '#/api/request';

const props = defineProps<{ disabled?: boolean }>();
interface Status {
  configured: boolean;
  encryption_ready: boolean;
  source: 'database' | 'environment' | 'none';
  storage_ready: boolean;
  updated: null | number;
}
const endpoint = '/system/video-notes/bilibili-cookie';
const cookie = ref('');
const status = ref<Status>();
const busy = ref(false);
const error = ref('');
const result = ref<{ message: string; ok: boolean }>();
let active = true;
onBeforeUnmount(() => {
  active = false;
  cookie.value = '';
});
async function load() {
  busy.value = true;
  try {
    const value = await requestClient.get<Status>(endpoint);
    if (active) status.value = value;
  } catch (e) {
    if (active)
      error.value = e instanceof Error ? e.message : '登录态配置读取失败';
  } finally {
    if (active) busy.value = false;
  }
}
onMounted(load);
async function save() {
  if (
    props.disabled ||
    busy.value ||
    !status.value?.storage_ready ||
    !status.value.encryption_ready
  )
    return;
  const value = cookie.value.trim();
  if (!value) {
    ElMessage.error('请填写 B站 Cookie 或 SESSDATA');
    return;
  }
  busy.value = true;
  cookie.value = '';
  error.value = '';
  result.value = undefined;
  try {
    const saved = await requestClient.put<Status>(endpoint, { cookie: value });
    if (active) {
      status.value = saved;
      ElMessage.success('B站登录态已加密保存，新任务立即生效');
    }
  } catch (e) {
    if (active)
      error.value =
        e instanceof Error ? e.message : '保存失败，请重新输入后重试';
  } finally {
    if (active) busy.value = false;
  }
}
async function probe() {
  if (props.disabled || busy.value || !status.value?.configured) return;
  busy.value = true;
  error.value = '';
  try {
    const value = await requestClient.post<{ message: string; ok: boolean }>(
      `${endpoint}/test`,
    );
    if (active) result.value = value;
  } catch (e) {
    if (active) error.value = e instanceof Error ? e.message : '登录态测试失败';
  } finally {
    if (active) busy.value = false;
  }
}
async function clear() {
  if (props.disabled || busy.value || status.value?.source !== 'database')
    return;
  try {
    await ElMessageBox.confirm(
      '确定清除后台保存的 B站登录态？',
      '清除 B站 Cookie',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  if (!active || props.disabled || busy.value) return;
  busy.value = true;
  error.value = '';
  result.value = undefined;
  cookie.value = '';
  try {
    const value = await requestClient.delete<Status>(endpoint);
    if (active) status.value = value;
  } catch (e) {
    if (active) error.value = e instanceof Error ? e.message : '清除失败';
  } finally {
    if (active) busy.value = false;
  }
}
</script>

<template>
  <div v-loading="busy">
    <h3 class="mb-3 font-semibold">B站字幕登录态</h3>
    <p class="mb-3 text-sm text-muted-foreground">
      部分
      B站视频的字幕需要登录后才能读取。保存后用于视频总结中的“字幕笔记”，不改变
      LLM、VLM 和语音识别配置。
    </p>
    <p class="mb-4 text-sm">
      <ElTag :type="status?.configured ? 'success' : 'info'">{{
        status?.configured ? '已配置' : '未配置'
      }}</ElTag>
      <span v-if="status?.source === 'environment'" class="ml-2"
        >当前使用服务器环境变量</span
      >
      <span v-if="status?.updated" class="ml-2"
        >更新于 {{ new Date(status.updated * 1000).toLocaleString() }}</span
      >
    </p>
    <ElAlert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
      class="mb-3"
    />
    <ElAlert
      v-if="status && !status.storage_ready"
      title="请先执行数据库迁移，再保存 B站登录态。"
      type="warning"
      :closable="false"
      class="mb-3"
    />
    <ElAlert
      v-if="status && !status.encryption_ready"
      title="后台凭据加密密钥尚未就绪，请检查服务端 ADMIN_JWT_SECRET。"
      type="warning"
      :closable="false"
      class="mb-3"
    />
    <ElForm label-position="top" @submit.prevent="save">
      <ElFormItem label="B站 Cookie / SESSDATA">
        <ElInput
          v-model="cookie"
          type="password"
          show-password
          autocomplete="new-password"
          :maxlength="32768"
          :disabled="disabled || busy"
          placeholder="粘贴完整 Cookie（包含 SESSDATA），或单独粘贴 SESSDATA 值"
        />
      </ElFormItem>
      <p class="mb-3 text-sm text-muted-foreground">
        在电脑浏览器登录 B站，打开开发者工具 → Network，选择 B站请求，在 Request
        Headers 中复制 Cookie；也可以在 Application → Cookies 中复制 SESSDATA
        的值。请勿填写登录密码。
      </p>
      <p class="mb-4 text-sm text-muted-foreground">
        只保存字幕读取所需的 SESSDATA，并加密存入
        MySQL。页面不回显凭据；保存后可测试登录态，失效时重新登录并更新。
      </p>
      <div class="flex flex-wrap gap-2">
        <ElButton
          type="primary"
          :disabled="
            disabled ||
            busy ||
            !cookie.trim() ||
            !status?.storage_ready ||
            !status.encryption_ready
          "
          @click="save"
          >保存登录态</ElButton
        >
        <ElButton
          :disabled="disabled || busy || !status?.configured"
          @click="probe"
          >测试已保存登录态</ElButton
        >
        <ElButton
          type="danger"
          plain
          :disabled="disabled || busy || status?.source !== 'database'"
          @click="clear"
          >清除登录态</ElButton
        >
      </div>
    </ElForm>
    <ElAlert
      v-if="result"
      :title="result.message"
      :type="result.ok ? 'success' : 'warning'"
      :closable="false"
      class="mt-4"
    />
  </div>
</template>
