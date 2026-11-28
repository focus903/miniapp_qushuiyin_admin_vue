<script setup lang="ts">
import type { PropType } from 'vue';

import type { ConfigField } from '#/utils/app-config-layout';

import { ref, watch } from 'vue';
import { ElButton, ElInput, ElMessage, ElRadioButton, ElRadioGroup } from 'element-plus';
import { requestClient } from '#/api/request';

const props = defineProps({
  field: { type: Object as PropType<ConfigField>, required: true },
  modelValue: { type: String, default: '' },
});
const emit = defineEmits<{
  'update:modelValue': [value: string];
  validityChange: [valid: boolean];
}>();

type Mode = 'link' | 'upload';
const mode = ref<Mode>('link');
const checking = ref(false);
const uploading = ref(false);
const previewOk = ref(true);
const hint = ref('');

// 空值表示使用内置占位图，允许保存；非空时才要求图片能加载。
function reportValid() {
  emit('validityChange', !String(props.modelValue || '').trim() || previewOk.value);
}

watch(
  () => props.modelValue,
  () => {
    previewOk.value = true;
    hint.value = '';
    reportValid();
  },
);

function setUrl(url: string) {
  emit('update:modelValue', url);
  previewOk.value = true;
  hint.value = '';
  reportValid();
}

function onImageError() {
  previewOk.value = false;
  hint.value = '图片无法加载，请更换链接或图片';
  reportValid();
}

function onImageLoad() {
  previewOk.value = true;
  hint.value = '';
  reportValid();
}

async function checkLink() {
  const url = String(props.modelValue || '').trim();
  if (!url) {
    emit('update:modelValue', '');
    reportValid();
    return;
  }
  checking.value = true;
  try {
    const result = await requestClient.post<{ reachable: boolean; message: string }>(
      '/system/effect-image-check',
      { url },
    );
    if (!result.reachable) {
      previewOk.value = false;
      hint.value = result.message || '图片无法访问';
    } else {
      previewOk.value = true;
      hint.value = '';
    }
    reportValid();
  } catch {
    previewOk.value = false;
    hint.value = '图片校验失败，请稍后重试';
    reportValid();
  } finally {
    checking.value = false;
  }
}

async function pickFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  uploading.value = true;
  hint.value = '';
  try {
    const form = new FormData();
    form.append('image', file);
    const result = await requestClient.post<{ url: string; storage: string }>(
      '/system/effect-image-upload',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    setUrl(result.url);
    ElMessage.success(result.storage === 'qiniu' ? '已上传到云存储' : '已上传到服务器');
  } catch {
    previewOk.value = false;
    hint.value = '上传失败，请重试';
    reportValid();
  } finally {
    uploading.value = false;
  }
}
</script>

<template>
  <div class="effect-image-field">
    <div class="effect-mode-row">
      <ElRadioGroup v-model="mode" size="small">
        <ElRadioButton value="link">链接</ElRadioButton>
        <ElRadioButton value="upload">上传</ElRadioButton>
      </ElRadioGroup>
    </div>

    <div v-if="mode === 'link'" class="effect-input-row">
      <ElInput
        :model-value="String(modelValue || '')"
        placeholder="https:// 开头的图片链接"
        clearable
        @update:model-value="setUrl"
      />
      <ElButton size="small" :loading="checking" @click="checkLink">验证</ElButton>
    </div>
    <div v-else class="effect-input-row">
      <label class="effect-upload-btn">
        {{ uploading ? '上传中…' : '选择图片' }}
        <input type="file" accept="image/*" :disabled="uploading" @change="pickFile" />
      </label>
      <span class="effect-upload-hint">云存储可用时自动上传云端，否则保存到服务器</span>
    </div>

    <div class="effect-preview">
      <img
        v-if="String(modelValue || '')"
        :src="String(modelValue)"
        alt="效果展示预览"
        @load="onImageLoad"
        @error="onImageError"
      />
      <span v-else class="effect-preview-empty">未配置，小程序显示内置占位图</span>
    </div>
    <div v-if="hint" class="effect-hint">{{ hint }}</div>
  </div>
</template>

<style scoped>
.effect-image-field { width: 100%; }
.effect-mode-row { margin-bottom: 6px; }
.effect-input-row { display: flex; align-items: center; gap: 6px; }
.effect-upload-btn { display: inline-flex; align-items: center; padding: 0 12px; height: 32px; border: 1px solid #dcdfe6; border-radius: 4px; cursor: pointer; color: #409eff; font-size: 13px; white-space: nowrap; }
.effect-upload-btn input { display: none; }
.effect-upload-hint { color: #909399; font-size: 12px; }
.effect-preview { margin-top: 6px; }
.effect-preview img { display: block; max-width: 100%; max-height: 120px; border: 1px solid #ebeef5; border-radius: 4px; object-fit: contain; }
.effect-preview-empty { color: #c0c4cc; font-size: 12px; }
.effect-hint { color: #f56c6c; font-size: 12px; margin-top: 4px; }
</style>
