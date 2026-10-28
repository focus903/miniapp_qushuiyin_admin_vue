<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';

import {
  ElAlert,
  ElButton,
  ElForm,
  ElFormItem,
  ElMessage,
  ElRadio,
  ElRadioGroup,
} from 'element-plus';

import { requestClient } from '#/api/request';
type Form = { watermark_execution: 'local' | 'worker' };
type Status = Form & { storage_ready: boolean };
type CheckItem = { ready: boolean | null; message: string; scope?: string };
type Checks = {
  watermark: CheckItem;
  enhance: CheckItem;
  compress: CheckItem;
  ocr: CheckItem;
};
const props = defineProps<{ disabled?: boolean }>();
const form = reactive<Form>({ watermark_execution: 'local' });
const status = ref<Status>();
const result = ref<Checks>();
const loading = ref(false);
const saving = ref(false);
const checking = ref(false);
const errorMessage = ref('');
const busy = computed(
  () => props.disabled || loading.value || saving.value || checking.value,
);
function apply(value: Status) {
  status.value = value;
  form.watermark_execution = value.watermark_execution;
}
async function load() {
  loading.value = true;
  errorMessage.value = '';
  try {
    apply(await requestClient.get<Status>('/system/image-processing-config'));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载失败';
  } finally {
    loading.value = false;
  }
}
async function save() {
  if (busy.value || !status.value?.storage_ready) return;
  saving.value = true;
  errorMessage.value = '';
  try {
    apply(
      await requestClient.put<Status>('/system/image-processing-config', {
        ...form,
      }),
    );
    result.value = undefined;
    ElMessage.success('图片处理配置已保存，新请求生效');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存失败';
  } finally {
    saving.value = false;
  }
}
async function check() {
  if (loading.value || saving.value || checking.value || !status.value) return;
  checking.value = true;
  errorMessage.value = '';
  try {
    result.value = await requestClient.post<Checks>(
      '/system/image-processing-config/check',
      { ...form },
    );
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '检查失败';
  } finally {
    checking.value = false;
  }
}
function checkLabel(item: CheckItem) {
  if (item.ready === null) return '未验证远程环境';
  return item.ready ? '检查通过' : '未就绪';
}
onMounted(load);
</script>
<template>
  <div v-loading="loading">
    <ElAlert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      :closable="false"
      class="mb-4"
    />
    <ElAlert
      v-if="status && !status.storage_ready"
      title="请先完成后端 AI 服务配置表迁移，再保存图片处理配置。"
      type="warning"
      :closable="false"
      class="mb-4"
    />
    <p class="help">
      集中管理图片去水印、图片高清、图片压缩和图片文字识别。当前使用本地处理能力，未接入图片云端
      API，也不读取视频供应商或 VLM 配置。
    </p>
    <ElForm label-position="top" :disabled="busy">
      <div class="cards">
        <section>
          <h3>图片去水印</h3>
          <p class="help">
            使用 LaMa 模型修复框选区域，需要在实际执行机器安装模型和依赖。
          </p>
          <ElFormItem label="执行位置">
            <ElRadioGroup
              v-model="form.watermark_execution"
              @change="result = undefined"
            >
              <ElRadio value="local">local · 本机处理</ElRadio><ElRadio value="worker"> worker · 远程工作节点 </ElRadio>
            </ElRadioGroup>
          </ElFormItem>
          <p class="help">
            从后台数据库读取，保存后新请求生效，无需重启。Worker
            需在线并支持图片修复任务；已开始的请求继续使用原执行位置。
          </p>
          <ElAlert
            v-if="result"
            :title="`${checkLabel(result.watermark)}：${result.watermark.message}`"
            :type="result.watermark.ready ? 'success' : 'warning'"
            :closable="false"
          />
        </section>
        <section>
          <h3>图片高清</h3>
          <p class="help">
            Real-ESRGAN 超分辨率模型，当前固定在服务器本机执行，输出 2
            倍尺寸图片。需安装程序、模型和兼容的运行环境。
          </p>
          <ElAlert
            v-if="result"
            :title="`${checkLabel(result.enhance)}：${result.enhance.message}`"
            :type="result.enhance.ready ? 'success' : 'warning'"
            :closable="false"
          />
        </section>
        <section>
          <h3>图片压缩</h3>
          <p class="help">
            使用服务器本机 Pillow 图像编码处理，不需要 AI 模型，也不调用云端
            API。压缩尺寸和质量沿用现有业务参数。
          </p>
          <ElAlert
            v-if="result"
            :title="`${checkLabel(result.compress)}：${result.compress.message}`"
            :type="result.compress.ready ? 'success' : 'warning'"
            :closable="false"
          />
        </section>
        <section>
          <h3>图片文字识别</h3>
          <p class="help">
            使用服务器本机 RapidOCR。当前不调用 VLM 或云端
            OCR；需准备依赖与识别模型。
          </p>
          <ElAlert
            v-if="result"
            :title="`${checkLabel(result.ocr)}：${result.ocr.message}`"
            :type="result.ocr.ready ? 'success' : 'warning'"
            :closable="false"
          />
        </section>
      </div>
      <ElButton
        type="primary"
        :loading="saving"
        :disabled="!status?.storage_ready"
        @click="save"
      >
        保存图片处理配置
      </ElButton>
    </ElForm>
    <ElButton
      class="mt-4"
      :loading="checking"
      :disabled="loading || saving || !status"
      @click="check"
    >
      检查运行环境
    </ElButton>
    <p class="help">
      检查使用当前选择，不自动保存、不下载模型或处理图片。仅检查本机依赖和文件是否存在，不验证模型实际加载、显卡兼容性或远程节点状态。
    </p>
  </div>
</template>
<style scoped>
.help {
  margin: 6px 0 16px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--el-text-color-secondary);
  overflow-wrap: anywhere;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

section {
  padding: 18px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
}

h3 {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 600;
}
</style>
