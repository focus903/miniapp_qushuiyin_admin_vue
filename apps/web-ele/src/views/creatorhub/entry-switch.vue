<script setup lang="ts">
import { computed, onActivated, ref, watch } from 'vue';
import { useAccessStore } from '@vben/stores';
import { ElMessage, ElSwitch } from 'element-plus';
import { requestClient } from '#/api/request';

const props = defineProps<{ field: 'showDoCharge' | 'showVipCenter'; label: string }>();
const access = useAccessStore();
const canRead = computed(() => access.accessCodes.includes('app-config:read'));
const canEdit = computed(() => access.accessCodes.includes('app-config:update'));
const enabled = ref(false);
const loaded = ref(false);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
let version = 0;
async function load() {
  const current = ++version;
  const field = props.field;
  loaded.value = false;
  error.value = '';
  if (!canRead.value) return;
  loading.value = true;
  try {
    const config = await requestClient.get<Record<string, unknown>>('/system/app-config');
    if (current !== version) return;
    enabled.value = config[field] === true;
    loaded.value = true;
  } catch {
    if (current === version) error.value = '读取失败，请刷新页面';
  } finally {
    if (current === version) loading.value = false;
  }
}
async function toggle() {
  if (!loaded.value || saving.value || !canEdit.value) return;
  const field = props.field;
  const next = !enabled.value;
  saving.value = true;
  try {
    // 只保存当前字段，与基础配置共用，避免覆盖其他配置。
    await requestClient.put('/system/app-config', { values: { [field]: next } });
    if (props.field === field) enabled.value = next;
    ElMessage.success('入口显示设置已保存');
  } catch {
    ElMessage.error('保存失败，开关保持原状态');
  } finally {
    saving.value = false;
  }
}
watch(() => [props.field, canRead.value], load, { immediate: true });
onActivated(load);
</script>

<template>
  <div class="inline-flex items-center gap-2">
    <span>{{ label }}</span>
    <ElSwitch :model-value="enabled" :aria-label="label" :loading="loading || saving"
      :disabled="!loaded || !canEdit || loading || saving" @change="toggle" />
    <span v-if="!canRead" class="text-xs text-gray-500">需小程序配置查看权限</span>
    <span v-else-if="error" class="text-xs text-red-500">{{ error }}</span>
    <span v-else-if="!canEdit" class="text-xs text-gray-500">只读</span>
  </div>
</template>
